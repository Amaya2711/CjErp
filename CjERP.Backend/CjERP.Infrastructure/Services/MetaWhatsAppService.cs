using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using CjERP.Application.DTOs.WhatsappInbound;
using CjERP.Application.Interfaces.Services;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace CjERP.Infrastructure.Services;

public sealed class MetaWhatsAppService : IMetaWhatsAppService
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private readonly HttpClient _httpClient;
    private readonly MetaWhatsAppSettings _settings;
    private readonly ILogger<MetaWhatsAppService> _logger;

    public MetaWhatsAppService(
        HttpClient httpClient,
        IOptions<MetaWhatsAppSettings> settings,
        ILogger<MetaWhatsAppService> logger)
    {
        _httpClient = httpClient;
        _settings = settings.Value;
        _logger = logger;
    }

    public async Task<MetaWhatsAppSendResponseDto> SendTextAsync(MetaWhatsAppSendTextRequestDto request, CancellationToken cancellationToken = default)
    {
        if (!TryResolvePhoneNumberId(request.PhoneNumberId, out var phoneNumberId, out var error))
        {
            return ErrorResponse(0, string.Empty, error);
        }

        var payload = new
        {
            messaging_product = "whatsapp",
            recipient_type = "individual",
            to = request.To.Trim(),
            type = "text",
            text = new
            {
                preview_url = false,
                body = request.Message.Trim()
            }
        };

        return await SendMessageAsync(phoneNumberId, payload, cancellationToken);
    }

    public async Task<MetaWhatsAppSendResponseDto> SendDocumentAsync(MetaWhatsAppSendDocumentRequestDto request, CancellationToken cancellationToken = default)
    {
        if (!TryResolvePhoneNumberId(request.PhoneNumberId, out var phoneNumberId, out var error))
        {
            return ErrorResponse(0, string.Empty, error);
        }

        if (request.FileBytes is null || request.FileBytes.Length == 0)
        {
            return ErrorResponse(0, string.Empty, "MetaWhatsApp: el archivo PDF a enviar esta vacio.");
        }

        var mediaUpload = await UploadMediaAsync(phoneNumberId, request, cancellationToken);
        if (!mediaUpload.Success)
        {
            return mediaUpload;
        }

        var mediaId = ExtractMediaId(mediaUpload.ResponseBody);
        if (string.IsNullOrWhiteSpace(mediaId))
        {
            return ErrorResponse(
                mediaUpload.StatusCode,
                mediaUpload.ResponseBody,
                "MetaWhatsApp: no se obtuvo media id despues de subir el PDF.");
        }

        var payload = new
        {
            messaging_product = "whatsapp",
            recipient_type = "individual",
            to = request.To.Trim(),
            type = "document",
            document = new
            {
                id = mediaId,
                filename = request.FileName.Trim(),
                caption = request.Caption.Trim()
            }
        };

        return await SendMessageAsync(phoneNumberId, payload, cancellationToken);
    }

    public async Task<MetaWhatsAppSendResponseDto> SendReplyButtonsAsync(MetaWhatsAppSendReplyButtonsRequestDto request, CancellationToken cancellationToken = default)
    {
        if (!TryResolvePhoneNumberId(request.PhoneNumberId, out var phoneNumberId, out var error))
        {
            return ErrorResponse(0, string.Empty, error);
        }

        var buttons = (request.Buttons ?? Array.Empty<MetaWhatsAppReplyButtonOptionDto>())
            .Where(x => x is not null)
            .Where(x => !string.IsNullOrWhiteSpace(x.Id) && !string.IsNullOrWhiteSpace(x.Title))
            .Take(3)
            .Select(x => new
            {
                type = "reply",
                reply = new
                {
                    id = x.Id.Trim(),
                    title = x.Title.Trim()
                }
            })
            .ToArray();

        if (buttons.Length == 0)
        {
            return ErrorResponse(0, string.Empty, "MetaWhatsApp: no se definieron botones de menu.");
        }

        var payload = new
        {
            messaging_product = "whatsapp",
            recipient_type = "individual",
            to = request.To.Trim(),
            type = "interactive",
            interactive = new
            {
                type = "button",
                header = string.IsNullOrWhiteSpace(request.Header)
                    ? null
                    : new
                    {
                        type = "text",
                        text = request.Header.Trim()
                    },
                body = new
                {
                    text = request.Body.Trim()
                },
                footer = string.IsNullOrWhiteSpace(request.Footer)
                    ? null
                    : new
                    {
                        text = request.Footer.Trim()
                    },
                action = new
                {
                    buttons
                }
            }
        };

        return await SendMessageAsync(phoneNumberId, payload, cancellationToken);
    }

    private async Task<MetaWhatsAppSendResponseDto> UploadMediaAsync(
        string phoneNumberId,
        MetaWhatsAppSendDocumentRequestDto request,
        CancellationToken cancellationToken)
    {
        var endpoint = BuildEndpoint(phoneNumberId, "media");
        using var httpRequest = new HttpRequestMessage(HttpMethod.Post, endpoint);
        httpRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _settings.AccessToken.Trim());

        using var form = new MultipartFormDataContent();
        form.Add(new StringContent("whatsapp", Encoding.UTF8), "messaging_product");
        form.Add(new StringContent(request.ContentType.Trim(), Encoding.UTF8), "type");

        var fileContent = new ByteArrayContent(request.FileBytes);
        fileContent.Headers.ContentType = new MediaTypeHeaderValue(request.ContentType.Trim());
        form.Add(fileContent, "file", string.IsNullOrWhiteSpace(request.FileName) ? "document.pdf" : request.FileName.Trim());

        httpRequest.Content = form;

        try
        {
            var response = await _httpClient.SendAsync(httpRequest, cancellationToken);
            var body = await response.Content.ReadAsStringAsync(cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("[MetaWhatsApp] Upload media fallo. StatusCode={StatusCode} Body={Body}", (int)response.StatusCode, body);
            }

            return new MetaWhatsAppSendResponseDto
            {
                Success = response.IsSuccessStatusCode,
                StatusCode = (int)response.StatusCode,
                ResponseBody = body,
                ErrorMessage = response.IsSuccessStatusCode
                    ? string.Empty
                    : BuildErrorMessage((int)response.StatusCode, body)
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[MetaWhatsApp] Error subiendo media a {Endpoint}", endpoint);
            return ErrorResponse(0, string.Empty, ex.Message);
        }
    }

    private async Task<MetaWhatsAppSendResponseDto> SendMessageAsync(string phoneNumberId, object payload, CancellationToken cancellationToken)
    {
        var endpoint = BuildEndpoint(phoneNumberId, "messages");
        using var httpRequest = new HttpRequestMessage(HttpMethod.Post, endpoint);
        httpRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _settings.AccessToken.Trim());
        httpRequest.Content = JsonContent.Create(payload, options: JsonOptions);

        try
        {
            var response = await _httpClient.SendAsync(httpRequest, cancellationToken);
            var body = await response.Content.ReadAsStringAsync(cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("[MetaWhatsApp] Envio mensaje fallo. StatusCode={StatusCode} Body={Body}", (int)response.StatusCode, body);
            }

            return new MetaWhatsAppSendResponseDto
            {
                Success = response.IsSuccessStatusCode,
                StatusCode = (int)response.StatusCode,
                ResponseBody = body,
                ErrorMessage = response.IsSuccessStatusCode
                    ? string.Empty
                    : BuildErrorMessage((int)response.StatusCode, body)
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[MetaWhatsApp] Error enviando mensaje a {Endpoint}", endpoint);
            return ErrorResponse(0, string.Empty, ex.Message);
        }
    }

    private bool TryResolvePhoneNumberId(string? overridePhoneNumberId, out string phoneNumberId, out string error)
    {
        phoneNumberId = overridePhoneNumberId?.Trim() ?? string.Empty;
        error = string.Empty;

        if (string.IsNullOrWhiteSpace(phoneNumberId))
        {
            phoneNumberId = _settings.PhoneNumberId?.Trim() ?? string.Empty;
        }

        if (!_settings.IsReady() && string.IsNullOrWhiteSpace(overridePhoneNumberId))
        {
            error = "MetaWhatsApp no esta configurado. Revise MetaWhatsAppSettings__Enabled, __AccessToken y __PhoneNumberId.";
            return false;
        }

        if (string.IsNullOrWhiteSpace(phoneNumberId))
        {
            error = "MetaWhatsApp no tiene PhoneNumberId configurado.";
            return false;
        }

        if (string.IsNullOrWhiteSpace(_settings.AccessToken) || !_settings.HasConfiguredAccessToken())
        {
            error = "MetaWhatsApp no tiene AccessToken configurado.";
            return false;
        }

        return true;
    }

    private string BuildEndpoint(string phoneNumberId, string resource)
    {
        var version = string.IsNullOrWhiteSpace(_settings.GraphVersion) ? "v23.0" : _settings.GraphVersion.Trim();
        return $"{version}/{phoneNumberId.Trim()}/{resource}";
    }

    private static string ExtractMediaId(string responseBody)
    {
        if (string.IsNullOrWhiteSpace(responseBody))
        {
            return string.Empty;
        }

        try
        {
            using var document = JsonDocument.Parse(responseBody);
            return document.RootElement.TryGetProperty("id", out var idElement) && idElement.ValueKind == JsonValueKind.String
                ? idElement.GetString() ?? string.Empty
                : string.Empty;
        }
        catch
        {
            return string.Empty;
        }
    }

    private static string BuildErrorMessage(int statusCode, string responseBody)
    {
        var parsed = TryExtractErrorSummary(responseBody);
        return string.IsNullOrWhiteSpace(parsed)
            ? $"MetaWhatsApp respondio {statusCode}."
            : $"MetaWhatsApp respondio {statusCode}. Detalle: {parsed}";
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
            if (document.RootElement.TryGetProperty("error", out var errorElement))
            {
                foreach (var propertyName in new[] { "message", "error_user_msg", "error_user_title", "type" })
                {
                    if (errorElement.TryGetProperty(propertyName, out var property) && property.ValueKind == JsonValueKind.String)
                    {
                        var value = property.GetString() ?? string.Empty;
                        if (!string.IsNullOrWhiteSpace(value))
                        {
                            return value.Trim();
                        }
                    }
                }
            }
        }
        catch
        {
            // Si falla el parseo devolvemos el cuerpo crudo.
        }

        return responseBody.Trim();
    }

    private static MetaWhatsAppSendResponseDto ErrorResponse(int statusCode, string responseBody, string errorMessage)
    {
        return new MetaWhatsAppSendResponseDto
        {
            Success = false,
            StatusCode = statusCode,
            ResponseBody = responseBody,
            ErrorMessage = errorMessage
        };
    }
}
