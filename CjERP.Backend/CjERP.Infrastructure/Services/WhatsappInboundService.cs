using System.Globalization;
using System.Text.RegularExpressions;
using CjERP.Application.DTOs.ReportesWhatsapp;
using CjERP.Application.DTOs.WhatsappInbound;
using CjERP.Application.Interfaces.Repositories;
using CjERP.Application.Interfaces.Services;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace CjERP.Infrastructure.Services;

public sealed class WhatsappInboundService : IWhatsappInboundService
{
    private static readonly Regex DateRegex = new(@"(?<!\d)(\d{2}/\d{2}/\d{4})(?!\d)", RegexOptions.Compiled);

    private readonly IReporteRepository _reporteRepository;
    private readonly IReportePdfService _reportePdfService;
    private readonly IWupService _wupService;
    private readonly IMetaWhatsAppService _metaWhatsAppService;
    private readonly WhatsappInboundSettings _settings;
    private readonly ILogger<WhatsappInboundService> _logger;

    public WhatsappInboundService(
        IReporteRepository reporteRepository,
        IReportePdfService reportePdfService,
        IWupService wupService,
        IMetaWhatsAppService metaWhatsAppService,
        IOptions<WhatsappInboundSettings> settings,
        ILogger<WhatsappInboundService> logger)
    {
        _reporteRepository = reporteRepository;
        _reportePdfService = reportePdfService;
        _wupService = wupService;
        _metaWhatsAppService = metaWhatsAppService;
        _settings = settings.Value;
        _logger = logger;
    }

    public bool IsVerificationTokenValid(string? verifyToken)
    {
        return _settings.Enabled &&
               _settings.HasVerifyTokenConfigured() &&
               string.Equals(_settings.VerifyToken.Trim(), verifyToken?.Trim(), StringComparison.Ordinal);
    }

    public async Task<WhatsappInboundProcessResultDto> ProcesarWebhookAsync(WhatsappWebhookPayloadDto? payload, CancellationToken cancellationToken = default)
    {
        var actions = new List<string>();
        var responsesSent = 0;

        if (!_settings.Enabled)
        {
            actions.Add("Webhook deshabilitado");
            return new WhatsappInboundProcessResultDto
            {
                Received = true,
                Actions = actions
            };
        }

        var messages = ExtractMessages(payload);
        foreach (var item in messages)
        {
            cancellationToken.ThrowIfCancellationRequested();

            if (string.IsNullOrWhiteSpace(item.Phone))
            {
                actions.Add("Mensaje omitido: telefono vacio");
                continue;
            }

            var response = await BuildResponseAsync(item.Phone, item.Body, item.ContactName, cancellationToken);
            if (response is null)
            {
                actions.Add($"Sin accion para {item.Phone}");
                continue;
            }

            var sendResponse = await SendResponseAsync(item, response, cancellationToken);
            if (sendResponse.Success)
            {
                responsesSent++;
                actions.Add($"Respuesta enviada a {item.Phone}");
            }
            else
            {
                actions.Add($"Error enviando respuesta a {item.Phone}: {sendResponse.ErrorMessage}");
                _logger.LogWarning(
                    "[WhatsappInbound] Error enviando respuesta a {Phone}. StatusCode={StatusCode} Error={Error}",
                    item.Phone,
                    sendResponse.StatusCode,
                    sendResponse.ErrorMessage);
            }
        }

        return new WhatsappInboundProcessResultDto
        {
            Received = true,
            MessagesDetected = messages.Count,
            ResponsesSent = responsesSent,
            Actions = actions
        };
    }

    private async Task<ReporteWhatsappSendRequestDto?> BuildResponseAsync(
        string phone,
        string messageBody,
        string contactName,
        CancellationToken cancellationToken)
    {
        var normalizedPhone = NormalizePhone(phone);
        if (string.IsNullOrWhiteSpace(normalizedPhone))
        {
            return null;
        }

        var normalizedMessage = (messageBody ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(normalizedMessage))
        {
            return BuildTextReply(
                normalizedPhone,
                "Recibimos tu mensaje. Para enviarte tu asistencia en PDF escribe: ASISTENCIA o ASISTENCIA 01/06/2026 30/06/2026.");
        }

        if (!IsAsistenciaRequest(normalizedMessage))
        {
            return BuildTextReply(
                normalizedPhone,
                $"Hola{BuildNameSuffix(contactName)}. Por ahora este canal piloto responde consultas de asistencia en PDF. Escribe: ASISTENCIA o ASISTENCIA 01/06/2026 30/06/2026.");
        }

        var empleado = await _reporteRepository.ObtenerEmpleadoPorTelefonoAsync(normalizedPhone, cancellationToken);
        if (empleado is null || empleado.IdEmpleado <= 0)
        {
            return BuildTextReply(
                normalizedPhone,
                "No pudimos vincular tu numero con un empleado registrado. Por favor valida tu telefono en el ERP o contacta a Sistemas.");
        }

        var (fechaInicio, fechaFin) = ResolveDateRange(normalizedMessage);
        var detalle = await _reporteRepository.ObtenerReporteAsistenciaAsync(fechaInicio, fechaFin, empleado.IdEmpleado, cancellationToken);
        if (detalle.Count == 0)
        {
            return BuildTextReply(
                normalizedPhone,
                $"No encontramos registros de asistencia para el periodo {fechaInicio} - {fechaFin}.");
        }

        var periodo = new ReporteWhatsappPeriodoDto
        {
            FechaInicio = fechaInicio,
            FechaFin = fechaFin,
            FechaProceso = ParseFecha(fechaFin),
            EtiquetaPeriodo = $"{fechaInicio} - {fechaFin}"
        };

        var pdfBytes = await _reportePdfService.GenerarReportePdfAsync(
            ReporteWhatsappTipos.Operativo,
            empleado,
            periodo,
            detalle,
            cancellationToken);

        var fileName = $"Asistencia_{fechaInicio.Replace("/", string.Empty)}_{fechaFin.Replace("/", string.Empty)}_{empleado.IdEmpleado}.pdf";
        return new ReporteWhatsappSendRequestDto
        {
            NombreArchivo = fileName,
            Mensaje = $"Hola{BuildNameSuffix(contactName)}. Adjuntamos tu reporte de asistencia del periodo {fechaInicio} - {fechaFin}.",
            Modo = string.IsNullOrWhiteSpace(_settings.ResponseMode) ? "wsp" : _settings.ResponseMode.Trim(),
            Telefono = normalizedPhone,
            Contenido = Convert.ToBase64String(pdfBytes)
        };
    }

    private async Task<MetaWhatsAppSendResponseDto> SendResponseAsync(
        InboundMessage item,
        ReporteWhatsappSendRequestDto response,
        CancellationToken cancellationToken)
    {
        if (UseMetaProvider())
        {
            if (string.IsNullOrWhiteSpace(response.Contenido))
            {
                return await _metaWhatsAppService.SendTextAsync(
                    new MetaWhatsAppSendTextRequestDto
                    {
                        To = response.Telefono,
                        Message = response.Mensaje,
                        PhoneNumberId = item.PhoneNumberId
                    },
                    cancellationToken);
            }

            var fileBytes = Convert.FromBase64String(response.Contenido);
            return await _metaWhatsAppService.SendDocumentAsync(
                new MetaWhatsAppSendDocumentRequestDto
                {
                    To = response.Telefono,
                    FileName = response.NombreArchivo,
                    Caption = response.Mensaje,
                    FileBytes = fileBytes,
                    PhoneNumberId = item.PhoneNumberId
                },
                cancellationToken);
        }

        var wupResponse = await _wupService.EnviarAdjuntoAsync(response, cancellationToken);
        return new MetaWhatsAppSendResponseDto
        {
            Success = wupResponse.Success,
            StatusCode = wupResponse.StatusCode,
            ResponseBody = wupResponse.ResponseBody,
            ErrorMessage = wupResponse.ErrorMessage
        };
    }

    private static List<InboundMessage> ExtractMessages(WhatsappWebhookPayloadDto? payload)
    {
        var result = new List<InboundMessage>();
        if (payload?.Entry is null)
        {
            return result;
        }

        foreach (var entry in payload.Entry)
        {
            foreach (var change in entry.Changes ?? Array.Empty<WhatsappWebhookChangeDto>())
            {
                var value = change.Value;
                if (value?.Messages is null || value.Messages.Count == 0)
                {
                    continue;
                }

                foreach (var message in value.Messages)
                {
                    var body = ExtractBody(message);
                    if (string.IsNullOrWhiteSpace(body))
                    {
                        continue;
                    }

                    var contactName = value.Contacts?
                        .FirstOrDefault(x => string.Equals(x.WaId, message.From, StringComparison.Ordinal))?
                        .Profile?.Name ?? string.Empty;

                    result.Add(new InboundMessage
                    {
                        Phone = message.From,
                        Body = body,
                        ContactName = contactName,
                        PhoneNumberId = value.Metadata?.PhoneNumberId?.Trim() ?? string.Empty
                    });
                }
            }
        }

        return result;
    }

    private static string ExtractBody(WhatsappWebhookMessageDto message)
    {
        if (message is null)
        {
            return string.Empty;
        }

        if (string.Equals(message.Type, "text", StringComparison.OrdinalIgnoreCase))
        {
            return message.Text?.Body?.Trim() ?? string.Empty;
        }

        if (string.Equals(message.Type, "button", StringComparison.OrdinalIgnoreCase))
        {
            return !string.IsNullOrWhiteSpace(message.Button?.Text)
                ? message.Button.Text.Trim()
                : message.Button?.Payload?.Trim() ?? string.Empty;
        }

        if (string.Equals(message.Type, "interactive", StringComparison.OrdinalIgnoreCase))
        {
            return !string.IsNullOrWhiteSpace(message.Interactive?.ButtonReply?.Title)
                ? message.Interactive.ButtonReply.Title.Trim()
                : message.Interactive?.ListReply?.Title?.Trim() ?? string.Empty;
        }

        return string.Empty;
    }

    private static bool IsAsistenciaRequest(string message) =>
        message.Contains("asistencia", StringComparison.OrdinalIgnoreCase);

    private bool UseMetaProvider() =>
        string.Equals(_settings.ResponseProvider?.Trim(), "meta", StringComparison.OrdinalIgnoreCase);

    private (string FechaInicio, string FechaFin) ResolveDateRange(string message)
    {
        var matches = DateRegex.Matches(message ?? string.Empty)
            .Select(x => x.Groups[1].Value)
            .ToArray();

        if (matches.Length >= 2 &&
            DateTime.TryParseExact(matches[0], "dd/MM/yyyy", CultureInfo.InvariantCulture, DateTimeStyles.None, out var from) &&
            DateTime.TryParseExact(matches[1], "dd/MM/yyyy", CultureInfo.InvariantCulture, DateTimeStyles.None, out var to) &&
            from <= to)
        {
            return (from.ToString("dd/MM/yyyy", CultureInfo.InvariantCulture), to.ToString("dd/MM/yyyy", CultureInfo.InvariantCulture));
        }

        var today = GetPeruNow().Date;
        var rangeDays = Math.Max(1, _settings.DefaultRangeDays);
        var start = today.AddDays(-(rangeDays - 1));
        return (start.ToString("dd/MM/yyyy", CultureInfo.InvariantCulture), today.ToString("dd/MM/yyyy", CultureInfo.InvariantCulture));
    }

    private static ReporteWhatsappSendRequestDto BuildTextReply(string phone, string message)
    {
        return new ReporteWhatsappSendRequestDto
        {
            NombreArchivo = string.Empty,
            Mensaje = message.Trim(),
            Modo = "wsp",
            Telefono = phone,
            Contenido = string.Empty
        };
    }

    private static string BuildNameSuffix(string? name) =>
        string.IsNullOrWhiteSpace(name) ? string.Empty : $", {name.Trim()}";

    private static DateTime ParseFecha(string value)
    {
        return DateTime.TryParseExact(value, "dd/MM/yyyy", CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsed)
            ? parsed
            : GetPeruNow().Date;
    }

    private static DateTime GetPeruNow()
    {
        try
        {
            var peruTimeZone = TimeZoneInfo.FindSystemTimeZoneById("SA Pacific Standard Time");
            return TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, peruTimeZone);
        }
        catch
        {
            return DateTime.UtcNow;
        }
    }

    private static string? NormalizePhone(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        var digits = new string(value.Where(char.IsDigit).ToArray());
        if (digits.Length == 9 && digits.StartsWith('9'))
        {
            return $"51{digits}";
        }

        if (digits.Length == 11 && digits.StartsWith("51", StringComparison.Ordinal))
        {
            return digits;
        }

        return null;
    }

    private sealed class InboundMessage
    {
        public string Phone { get; set; } = string.Empty;
        public string Body { get; set; } = string.Empty;
        public string ContactName { get; set; } = string.Empty;
        public string PhoneNumberId { get; set; } = string.Empty;
    }
}
