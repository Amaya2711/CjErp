using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using CjERP.Application.DTOs.ReportesWhatsapp;
using CjERP.Application.Interfaces.Services;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace CjERP.Infrastructure.Services;

public sealed class WupService : IWupService
{
    private readonly HttpClient _httpClient;
    private readonly IWupAuthService _wupAuthService;
    private readonly WupSettings _settings;
    private readonly ILogger<WupService> _logger;

    public WupService(
        HttpClient httpClient,
        IWupAuthService wupAuthService,
        IOptions<WupSettings> settings,
        ILogger<WupService> logger)
    {
        _httpClient = httpClient;
        _wupAuthService = wupAuthService;
        _settings = settings.Value;
        _logger = logger;
    }

    public async Task<ReporteWhatsappSendResponseDto> EnviarAdjuntoAsync(ReporteWhatsappSendRequestDto request, CancellationToken cancellationToken = default)
    {
        var token = await _wupAuthService.ObtenerTokenAsync(cancellationToken);
        var requestJson = JsonSerializer.Serialize(request);

        using var httpRequest = new HttpRequestMessage(HttpMethod.Post, _settings.EnviarAdjuntoEndpoint)
        {
            Content = new StringContent(requestJson, Encoding.UTF8, "application/json")
        };

        if (!string.IsNullOrWhiteSpace(token))
        {
            httpRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        }

        try
        {
            var response = await _httpClient.SendAsync(httpRequest, cancellationToken);
            var body = await response.Content.ReadAsStringAsync(cancellationToken);
            var success = response.IsSuccessStatusCode && !IndicatesFailure(body);

            if (!success)
            {
                _logger.LogWarning("[WUP] Envío fallido. Código={StatusCode}, Body={Body}", (int)response.StatusCode, body);
            }

            return new ReporteWhatsappSendResponseDto
            {
                Success = success,
                StatusCode = (int)response.StatusCode,
                ResponseBody = body,
                ErrorMessage = success ? string.Empty : $"El endpoint WUP respondió {(int)response.StatusCode}."
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[WUP] Error no controlado enviando adjunto a {Telefono}", request.Telefono);
            return new ReporteWhatsappSendResponseDto
            {
                Success = false,
                StatusCode = 0,
                ResponseBody = string.Empty,
                ErrorMessage = ex.Message
            };
        }
    }

    private static bool IndicatesFailure(string responseBody)
    {
        if (string.IsNullOrWhiteSpace(responseBody))
        {
            return false;
        }

        try
        {
            using var document = JsonDocument.Parse(responseBody);
            var root = document.RootElement;

            if (root.ValueKind == JsonValueKind.Object)
            {
                if (TryReadBoolean(root, "success", out var success))
                {
                    return !success;
                }

                if (TryReadBoolean(root, "ok", out var ok))
                {
                    return !ok;
                }

                if (TryReadString(root, "estado", out var estado))
                {
                    return estado.Equals("error", StringComparison.OrdinalIgnoreCase);
                }
            }
        }
        catch
        {
            return false;
        }

        return false;
    }

    private static bool TryReadBoolean(JsonElement element, string propertyName, out bool value)
    {
        value = false;
        if (!element.TryGetProperty(propertyName, out var property))
        {
            return false;
        }

        if (property.ValueKind == JsonValueKind.True || property.ValueKind == JsonValueKind.False)
        {
            value = property.GetBoolean();
            return true;
        }

        if (property.ValueKind == JsonValueKind.String && bool.TryParse(property.GetString(), out var parsed))
        {
            value = parsed;
            return true;
        }

        return false;
    }

    private static bool TryReadString(JsonElement element, string propertyName, out string value)
    {
        value = string.Empty;
        if (!element.TryGetProperty(propertyName, out var property) || property.ValueKind != JsonValueKind.String)
        {
            return false;
        }

        value = property.GetString() ?? string.Empty;
        return true;
    }
}
