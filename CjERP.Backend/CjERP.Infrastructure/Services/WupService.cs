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
        _settings.EnsureConfigured();

        var token = await _wupAuthService.ObtenerTokenAsync(cancellationToken);
        var requestJson = JsonSerializer.Serialize(request);
        var sendUri = _settings.BuildRequestUri(_settings.EnviarAdjuntoEndpoint);

        if (string.IsNullOrWhiteSpace(token))
        {
            _logger.LogWarning(
                "[WUP] No se obtuvo token antes del envio. LoginEndpoint={LoginEndpoint}, SendUrl={SendUrl}, Usuario={Usuario}",
                _settings.BuildRequestUri(_settings.LoginEndpoint),
                sendUri,
                _settings.Usuario);

            return new ReporteWhatsappSendResponseDto
            {
                Success = false,
                StatusCode = 401,
                ResponseBody = string.Empty,
                ErrorMessage = "No se pudo autenticar contra WUP antes del envio. Revise WupSettings:LoginEndpoint, WupSettings:Usuario, WupSettings:Password y la respuesta del endpoint de login."
            };
        }

        using var httpRequest = new HttpRequestMessage(HttpMethod.Post, sendUri)
        {
            Content = new StringContent(requestJson, Encoding.UTF8, "application/json")
        };

        httpRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

        try
        {
            var response = await _httpClient.SendAsync(httpRequest, cancellationToken);
            var body = await response.Content.ReadAsStringAsync(cancellationToken);
            var success = response.IsSuccessStatusCode && !IndicatesFailure(body);

            if (!success)
            {
                _logger.LogWarning(
                    "[WUP] Envio fallido. Url={Url}, Codigo={StatusCode}, Telefono={Telefono}, Archivo={Archivo}, ContenidoLength={ContenidoLength}, Body={Body}",
                    sendUri,
                    (int)response.StatusCode,
                    request.Telefono,
                    request.NombreArchivo,
                    request.Contenido?.Length ?? 0,
                    body);
            }

            return new ReporteWhatsappSendResponseDto
            {
                Success = success,
                StatusCode = (int)response.StatusCode,
                ResponseBody = body,
                ErrorMessage = success
                    ? string.Empty
                    : BuildErrorMessage((int)response.StatusCode, sendUri, body)
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[WUP] Error no controlado enviando adjunto a {Telefono}. Url={Url}", request.Telefono, sendUri);
            return new ReporteWhatsappSendResponseDto
            {
                Success = false,
                StatusCode = 0,
                ResponseBody = string.Empty,
                ErrorMessage = $"Error llamando WUP en {sendUri}: {ex.Message}"
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

    private static string BuildErrorMessage(int statusCode, Uri sendUri, string responseBody)
    {
        var suffix = TryExtractErrorSummary(responseBody);
        return string.IsNullOrWhiteSpace(suffix)
            ? $"El endpoint WUP respondio {statusCode}. URL: {sendUri}"
            : $"El endpoint WUP respondio {statusCode}. URL: {sendUri}. Detalle: {suffix}";
    }

    private static string TryExtractErrorSummary(string responseBody)
    {
        if (string.IsNullOrWhiteSpace(responseBody))
        {
            return string.Empty;
        }

        try
        {
            using var document = JsonDocument.Parse(responseBody);
            var root = document.RootElement;

            if (root.ValueKind == JsonValueKind.Object)
            {
                foreach (var propertyName in new[] { "message", "mensaje", "error", "detail", "title", "descripcion", "description" })
                {
                    if (TryReadString(root, propertyName, out var value) && !string.IsNullOrWhiteSpace(value))
                    {
                        return Truncate(value.Trim(), 240);
                    }
                }
            }
        }
        catch
        {
            // Si no es JSON, se usa el cuerpo crudo truncado.
        }

        return Truncate(responseBody.Trim().ReplaceLineEndings(" "), 240);
    }

    private static string Truncate(string value, int maxLength)
    {
        if (string.IsNullOrWhiteSpace(value) || value.Length <= maxLength)
        {
            return value;
        }

        return value[..maxLength] + "...";
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
