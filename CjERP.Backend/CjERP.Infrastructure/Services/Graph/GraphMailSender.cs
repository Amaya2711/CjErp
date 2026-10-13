using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using CjERP.Application.Interfaces.Services;
using CjERP.Shared.Configuration;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace CjERP.Infrastructure.Services.Graph;

public sealed class GraphMailSender : IGraphMailSender
{
    // Graph acepta adjuntos en línea hasta ~3 MB por solicitud; más grande requiere sesión de carga.
    private const int MaxAdjuntoBytes = 3 * 1024 * 1024;

    private static readonly SemaphoreSlim TokenLock = new(1, 1);
    private static string? _token;
    private static DateTime _tokenExpiraUtc = DateTime.MinValue;

    private readonly HttpClient _http;
    private readonly GraphMailSettings _settings;
    private readonly ILogger<GraphMailSender> _logger;

    public GraphMailSender(HttpClient http, IOptions<GraphMailSettings> settings, ILogger<GraphMailSender> logger)
    {
        _http = http;
        _settings = settings.Value;
        _logger = logger;
    }

    public bool EstaConfigurado =>
        _settings.Enabled
        && !string.IsNullOrWhiteSpace(_settings.TenantId)
        && !string.IsNullOrWhiteSpace(_settings.ClientId)
        && !string.IsNullOrWhiteSpace(_settings.ClientSecret)
        && !string.IsNullOrWhiteSpace(_settings.SenderMailbox);

    public async Task EnviarAsync(
        IReadOnlyList<string> destinatarios,
        string asunto,
        string cuerpoTexto,
        string nombreAdjunto,
        byte[] adjunto,
        string contentTypeAdjunto,
        CancellationToken cancellationToken = default)
    {
        if (!EstaConfigurado)
            throw new InvalidOperationException("El envío por Microsoft Graph no está configurado.");
        if (destinatarios.Count == 0)
            throw new InvalidOperationException("No hay destinatarios para el correo.");
        if (adjunto.Length > MaxAdjuntoBytes)
            throw new InvalidOperationException("El adjunto supera el tamaño permitido para enviar por Microsoft Graph.");

        var payload = new
        {
            message = new
            {
                subject = asunto,
                body = new { contentType = "Text", content = cuerpoTexto },
                toRecipients = destinatarios.Select(correo => new { emailAddress = new { address = correo } }).ToArray(),
                attachments = new object[]
                {
                    new Dictionary<string, object>
                    {
                        ["@odata.type"] = "#microsoft.graph.fileAttachment",
                        ["name"] = nombreAdjunto,
                        ["contentType"] = contentTypeAdjunto,
                        ["contentBytes"] = Convert.ToBase64String(adjunto)
                    }
                }
            },
            saveToSentItems = true
        };

        var token = await ObtenerTokenAsync(cancellationToken);
        using var request = new HttpRequestMessage(
            HttpMethod.Post,
            $"https://graph.microsoft.com/v1.0/users/{Uri.EscapeDataString(_settings.SenderMailbox)}/sendMail")
        {
            Content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json")
        };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

        using var response = await _http.SendAsync(request, cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            var detalle = await response.Content.ReadAsStringAsync(cancellationToken);
            _logger.LogWarning(
                "Microsoft Graph rechazó el envío de correo desde {Remitente}. Estado={Status}. Detalle={Detalle}",
                _settings.SenderMailbox, (int)response.StatusCode, detalle);
            throw new InvalidOperationException(
                $"Microsoft Graph rechazó el envío de correo ({(int)response.StatusCode}). Verifique el permiso Mail.Send y el buzón {_settings.SenderMailbox}.");
        }
    }

    private async Task<string> ObtenerTokenAsync(CancellationToken cancellationToken)
    {
        if (_token is not null && DateTime.UtcNow < _tokenExpiraUtc) return _token;

        await TokenLock.WaitAsync(cancellationToken);
        try
        {
            if (_token is not null && DateTime.UtcNow < _tokenExpiraUtc) return _token;

            using var request = new HttpRequestMessage(
                HttpMethod.Post,
                $"https://login.microsoftonline.com/{_settings.TenantId}/oauth2/v2.0/token")
            {
                Content = new FormUrlEncodedContent(new Dictionary<string, string>
                {
                    ["client_id"] = _settings.ClientId,
                    ["client_secret"] = _settings.ClientSecret,
                    ["grant_type"] = "client_credentials",
                    ["scope"] = "https://graph.microsoft.com/.default"
                })
            };
            using var response = await _http.SendAsync(request, cancellationToken);
            var contenido = await response.Content.ReadAsStringAsync(cancellationToken);
            if (!response.IsSuccessStatusCode)
                throw new InvalidOperationException($"No se pudo obtener el token de Microsoft Graph ({(int)response.StatusCode}).");

            using var documento = JsonDocument.Parse(contenido);
            var raiz = documento.RootElement;
            _token = raiz.GetProperty("access_token").GetString()
                ?? throw new InvalidOperationException("Microsoft Graph no devolvió un access_token válido.");
            var segundos = raiz.TryGetProperty("expires_in", out var expira) && expira.TryGetInt32(out var valor) ? valor : 3600;
            _tokenExpiraUtc = DateTime.UtcNow.AddSeconds(Math.Max(60, segundos - 120));
            return _token;
        }
        finally
        {
            TokenLock.Release();
        }
    }
}
