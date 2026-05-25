using System.Net.Http.Json;
using System.Text.Json;
using CjERP.Application.DTOs.ReportesWhatsapp;
using CjERP.Application.Interfaces.Services;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace CjERP.Infrastructure.Services;

public sealed class WupAuthService : IWupAuthService
{
    private static readonly SemaphoreSlim TokenLock = new(1, 1);
    private static string? _cachedToken;
    private static DateTimeOffset _tokenExpiresAt = DateTimeOffset.MinValue;

    private readonly HttpClient _httpClient;
    private readonly WupSettings _settings;
    private readonly ILogger<WupAuthService> _logger;

    public WupAuthService(HttpClient httpClient, IOptions<WupSettings> settings, ILogger<WupAuthService> logger)
    {
        _httpClient = httpClient;
        _settings = settings.Value;
        _logger = logger;
    }

    public async Task<string?> ObtenerTokenAsync(CancellationToken cancellationToken = default)
    {
        _settings.EnsureConfigured();
        var loginUri = _settings.BuildRequestUri(_settings.LoginEndpoint);

        if (!string.IsNullOrWhiteSpace(_cachedToken) && _tokenExpiresAt > DateTimeOffset.UtcNow.AddMinutes(1))
        {
            return _cachedToken;
        }

        await TokenLock.WaitAsync(cancellationToken);

        try
        {
            if (!string.IsNullOrWhiteSpace(_cachedToken) && _tokenExpiresAt > DateTimeOffset.UtcNow.AddMinutes(1))
            {
                return _cachedToken;
            }

            _logger.LogInformation(
                "[WUP] Solicitando token. LoginUrl={LoginUrl}, Usuario={Usuario}, PasswordConfigurado={PasswordConfigurado}",
                loginUri,
                _settings.Usuario,
                !string.IsNullOrWhiteSpace(_settings.Password));

            var response = await _httpClient.PostAsJsonAsync(
                loginUri,
                new
                {
                    usuario = _settings.Usuario,
                    password = _settings.Password
                },
                cancellationToken);

            var body = await response.Content.ReadAsStringAsync(cancellationToken);

            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("[WUP] Login fallo. Url={Url}, Codigo={StatusCode}, Body={Body}", loginUri, (int)response.StatusCode, body);
                return null;
            }

            var token = ExtractToken(body);
            if (string.IsNullOrWhiteSpace(token))
            {
                _logger.LogWarning("[WUP] Login exitoso en {Url} pero no se encontro token en la respuesta. Body={Body}", loginUri, body);
                return null;
            }

            _cachedToken = token;
            _tokenExpiresAt = DateTimeOffset.UtcNow.AddMinutes(20);
            return _cachedToken;
        }
        finally
        {
            TokenLock.Release();
        }
    }

    private static string? ExtractToken(string body)
    {
        if (string.IsNullOrWhiteSpace(body))
        {
            return null;
        }

        try
        {
            using var document = JsonDocument.Parse(body);
            return FindToken(document.RootElement);
        }
        catch
        {
            return null;
        }
    }

    private static string? FindToken(JsonElement element)
    {
        switch (element.ValueKind)
        {
            case JsonValueKind.Object:
            {
                foreach (var property in element.EnumerateObject())
                {
                    var name = property.Name.ToLowerInvariant();
                    if ((name.Contains("token") || name.Contains("jwt")) && property.Value.ValueKind == JsonValueKind.String)
                    {
                        var value = property.Value.GetString();
                        if (!string.IsNullOrWhiteSpace(value))
                        {
                            return value;
                        }
                    }

                    var nested = FindToken(property.Value);
                    if (!string.IsNullOrWhiteSpace(nested))
                    {
                        return nested;
                    }
                }

                break;
            }
            case JsonValueKind.Array:
                foreach (var item in element.EnumerateArray())
                {
                    var nested = FindToken(item);
                    if (!string.IsNullOrWhiteSpace(nested))
                    {
                        return nested;
                    }
                }
                break;
        }

        return null;
    }
}
