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
    private const string MenuAsistencia = "menu_asistencia";
    private const string MenuBoleta = "menu_boleta";
    private const string MenuEncuesta = "menu_encuesta";
    private static readonly Regex DateRegex = new(@"(?<!\d)(\d{2}/\d{2}/\d{4})(?!\d)", RegexOptions.Compiled);
    private static readonly Dictionary<string, int> MonthMap = new(StringComparer.OrdinalIgnoreCase)
    {
        ["enero"] = 1,
        ["febrero"] = 2,
        ["marzo"] = 3,
        ["abril"] = 4,
        ["mayo"] = 5,
        ["junio"] = 6,
        ["julio"] = 7,
        ["agosto"] = 8,
        ["septiembre"] = 9,
        ["setiembre"] = 9,
        ["octubre"] = 10,
        ["noviembre"] = 11,
        ["diciembre"] = 12
    };

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

            var response = await BuildResponseAsync(item, cancellationToken);
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

    private async Task<OutboundResponse?> BuildResponseAsync(
        InboundMessage item,
        CancellationToken cancellationToken)
    {
        var phone = item.Phone;
        var messageBody = item.Body;
        var contactName = item.ContactName;
        var normalizedPhone = NormalizePhone(phone);
        if (string.IsNullOrWhiteSpace(normalizedPhone))
        {
            return null;
        }

        var normalizedMessage = (messageBody ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(normalizedMessage))
        {
            return BuildMenuReply(normalizedPhone);
        }

        if (string.Equals(item.ActionId, MenuBoleta, StringComparison.OrdinalIgnoreCase))
        {
            return BuildTextReply(
                normalizedPhone,
                "La opcion Boleta de pago ya fue registrada. En el siguiente paso conectaremos ese flujo para enviarte la boleta segun el periodo que indiques.");
        }

        if (string.Equals(item.ActionId, MenuEncuesta, StringComparison.OrdinalIgnoreCase))
        {
            return BuildTextReply(
                normalizedPhone,
                "La opcion Encuesta ya fue registrada. En el siguiente paso conectaremos este flujo para responder la encuesta desde WhatsApp.");
        }

        if (!IsAsistenciaRequest(normalizedMessage) &&
            !string.Equals(item.ActionId, MenuAsistencia, StringComparison.OrdinalIgnoreCase))
        {
            return BuildMenuReply(normalizedPhone);
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
        return new OutboundResponse
        {
            Kind = OutboundResponseKind.Document,
            Phone = normalizedPhone,
            FileName = fileName,
            Message = $"Hola{BuildNameSuffix(contactName)}. Adjuntamos tu reporte de asistencia del periodo {fechaInicio} - {fechaFin}.",
            FileContentBase64 = Convert.ToBase64String(pdfBytes)
        };
    }

    private async Task<MetaWhatsAppSendResponseDto> SendResponseAsync(
        InboundMessage item,
        OutboundResponse response,
        CancellationToken cancellationToken)
    {
        if (UseMetaProvider())
        {
            if (response.Kind == OutboundResponseKind.Menu)
            {
                return await _metaWhatsAppService.SendReplyButtonsAsync(
                    new MetaWhatsAppSendReplyButtonsRequestDto
                    {
                        To = response.Phone,
                        Header = "Menu principal",
                        Body = response.Message,
                        Footer = "Selecciona una opcion",
                        PhoneNumberId = item.PhoneNumberId,
                        Buttons =
                        [
                            new MetaWhatsAppReplyButtonOptionDto { Id = MenuAsistencia, Title = "Asistencia" },
                            new MetaWhatsAppReplyButtonOptionDto { Id = MenuBoleta, Title = "Boleta" },
                            new MetaWhatsAppReplyButtonOptionDto { Id = MenuEncuesta, Title = "Encuesta" }
                        ]
                    },
                    cancellationToken);
            }

            if (response.Kind == OutboundResponseKind.Text)
            {
                return await _metaWhatsAppService.SendTextAsync(
                    new MetaWhatsAppSendTextRequestDto
                    {
                        To = response.Phone,
                        Message = response.Message,
                        PhoneNumberId = item.PhoneNumberId
                    },
                    cancellationToken);
            }

            var fileBytes = Convert.FromBase64String(response.FileContentBase64);
            return await _metaWhatsAppService.SendDocumentAsync(
                new MetaWhatsAppSendDocumentRequestDto
                {
                    To = response.Phone,
                    FileName = response.FileName,
                    Caption = response.Message,
                    FileBytes = fileBytes,
                    PhoneNumberId = item.PhoneNumberId
                },
                cancellationToken);
        }

        var wupRequest = response.Kind == OutboundResponseKind.Document
            ? new ReporteWhatsappSendRequestDto
            {
                NombreArchivo = response.FileName,
                Mensaje = response.Message,
                Modo = string.IsNullOrWhiteSpace(_settings.ResponseMode) ? "wsp" : _settings.ResponseMode.Trim(),
                Telefono = response.Phone,
                Contenido = response.FileContentBase64
            }
            : new ReporteWhatsappSendRequestDto
            {
                NombreArchivo = string.Empty,
                Mensaje = BuildFallbackMenuText(response),
                Modo = string.IsNullOrWhiteSpace(_settings.ResponseMode) ? "wsp" : _settings.ResponseMode.Trim(),
                Telefono = response.Phone,
                Contenido = string.Empty
            };

        var wupResponse = await _wupService.EnviarAdjuntoAsync(wupRequest, cancellationToken);
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
                        PhoneNumberId = value.Metadata?.PhoneNumberId?.Trim() ?? string.Empty,
                        ActionId = ExtractActionId(message)
                    });
                }
            }
        }

        return result;
    }

    private static string ExtractActionId(WhatsappWebhookMessageDto message)
    {
        if (message is null)
        {
            return string.Empty;
        }

        if (string.Equals(message.Type, "button", StringComparison.OrdinalIgnoreCase))
        {
            return message.Button?.Payload?.Trim() ?? string.Empty;
        }

        if (!string.Equals(message.Type, "interactive", StringComparison.OrdinalIgnoreCase))
        {
            return string.Empty;
        }

        if (!string.IsNullOrWhiteSpace(message.Interactive?.ButtonReply?.Id))
        {
            return message.Interactive.ButtonReply.Id.Trim();
        }

        return message.Interactive?.ListReply?.Id?.Trim() ?? string.Empty;
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

        if (TryResolveMonthPeriod(message, out var monthStart, out var monthEnd))
        {
            return (
                monthStart.ToString("dd/MM/yyyy", CultureInfo.InvariantCulture),
                monthEnd.ToString("dd/MM/yyyy", CultureInfo.InvariantCulture));
        }

        var today = GetPeruNow().Date;
        var rangeDays = Math.Max(1, _settings.DefaultRangeDays);
        var start = today.AddDays(-(rangeDays - 1));
        return (start.ToString("dd/MM/yyyy", CultureInfo.InvariantCulture), today.ToString("dd/MM/yyyy", CultureInfo.InvariantCulture));
    }

    private static bool TryResolveMonthPeriod(string? message, out DateTime start, out DateTime end)
    {
        start = default;
        end = default;

        if (string.IsNullOrWhiteSpace(message))
        {
            return false;
        }

        var normalized = message.ToLowerInvariant();
        foreach (var month in MonthMap)
        {
            if (!normalized.Contains(month.Key, StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            var year = ExtractYearNearMonth(normalized, month.Key) ?? GetPeruNow().Year;
            if (year < 2000 || year > 2100)
            {
                return false;
            }

            start = new DateTime(year, month.Value, 1);
            end = start.AddMonths(1).AddDays(-1);
            return true;
        }

        return false;
    }

    private static int? ExtractYearNearMonth(string normalizedMessage, string month)
    {
        var tokens = normalizedMessage
            .Split([' ', ',', '.', ';', ':', '-', '_', '/', '\t', '\r', '\n'], StringSplitOptions.RemoveEmptyEntries);

        for (var i = 0; i < tokens.Length; i++)
        {
            if (!string.Equals(tokens[i], month, StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            if (i + 1 < tokens.Length &&
                int.TryParse(tokens[i + 1], NumberStyles.Integer, CultureInfo.InvariantCulture, out var nextYear))
            {
                return nextYear;
            }

            if (i > 0 &&
                int.TryParse(tokens[i - 1], NumberStyles.Integer, CultureInfo.InvariantCulture, out var previousYear))
            {
                return previousYear;
            }
        }

        return null;
    }

    private static OutboundResponse BuildTextReply(string phone, string message)
    {
        return new OutboundResponse
        {
            Kind = OutboundResponseKind.Text,
            Phone = phone,
            Message = message.Trim()
        };
    }

    private static OutboundResponse BuildMenuReply(string phone)
    {
        return new OutboundResponse
        {
            Kind = OutboundResponseKind.Menu,
            Phone = phone,
            Message = "Hola. Selecciona la opcion que deseas consultar."
        };
    }

    private static string BuildFallbackMenuText(OutboundResponse response)
    {
        if (response.Kind != OutboundResponseKind.Menu)
        {
            return response.Message;
        }

        return "Hola. Responde con una opcion:\n1. Asistencia\n2. Boleta\n3. Encuesta";
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
        public string ActionId { get; set; } = string.Empty;
    }

    private sealed class OutboundResponse
    {
        public OutboundResponseKind Kind { get; set; }
        public string Phone { get; set; } = string.Empty;
        public string Message { get; set; } = string.Empty;
        public string FileName { get; set; } = string.Empty;
        public string FileContentBase64 { get; set; } = string.Empty;
    }

    private enum OutboundResponseKind
    {
        Text = 1,
        Document = 2,
        Menu = 3
    }
}
