using System.Globalization;
using CjERP.Api.Jobs;
using CjERP.Application.DTOs.ReportesWhatsapp;
using CjERP.Application.Interfaces.Repositories;
using CjERP.Application.Interfaces.Services;
using Hangfire;
using Microsoft.Extensions.Options;

namespace CjERP.Api.Services;

public sealed class ReporteWhatsappJobScheduler : IReporteWhatsappJobScheduler
{
    private readonly IRecurringJobManager _recurringJobManager;
    private readonly IBackgroundJobClient _backgroundJobClient;
    private readonly IReporteRepository _reporteRepository;
    private readonly ReporteWhatsappJobDefaultsOptions _defaults;

    public ReporteWhatsappJobScheduler(
        IRecurringJobManager recurringJobManager,
        IBackgroundJobClient backgroundJobClient,
        IReporteRepository reporteRepository,
        IOptions<ReporteWhatsappJobDefaultsOptions> defaults)
    {
        _recurringJobManager = recurringJobManager;
        _backgroundJobClient = backgroundJobClient;
        _reporteRepository = reporteRepository;
        _defaults = defaults.Value;
    }

    public async Task ReprogramarAsync(string tipoReporte, CancellationToken cancellationToken = default)
    {
        var normalizedType = ReporteWhatsappTipos.Normalize(tipoReporte);
        var config = await _reporteRepository.ObtenerConfiguracionAsync(normalizedType, cancellationToken);
        var defaults = GetDefaultsForType(normalizedType);
        var activo = config?.Activo ?? defaults.Activo;
        var recurringJobId = BuildRecurringJobId(normalizedType);

        if (!activo)
        {
            RemoveRecurringJobs(normalizedType);
            return;
        }

        var hora = config?.HoraEjecucion;
        if (!TimeSpan.TryParse(string.IsNullOrWhiteSpace(hora) ? defaults.HoraEjecucion : hora, CultureInfo.InvariantCulture, out var time))
        {
            time = TimeSpan.Parse(defaults.HoraEjecucion, CultureInfo.InvariantCulture);
        }

        if (ReporteWhatsappTipos.IsGerencial(normalizedType))
        {
            var dias = NormalizeDiasEjecucion(config?.DiasEjecucion, defaults.DiasEjecucion);
            RemoveRecurringJobs(normalizedType);

            if (dias.Count == 0)
            {
                return;
            }

            foreach (var dia in dias)
            {
                _recurringJobManager.AddOrUpdate<ReporteWhatsAppJob>(
                    BuildRecurringJobId(normalizedType, dia),
                    job => job.EjecutarProgramadoAsync(normalizedType),
                    BuildWeeklyCron(dia, time.Hours, time.Minutes),
                    new RecurringJobOptions
                    {
                        TimeZone = ResolvePeruTimeZone()
                    });
            }

            return;
        }

        _recurringJobManager.AddOrUpdate<ReporteWhatsAppJob>(
            recurringJobId,
            job => job.EjecutarProgramadoAsync(normalizedType),
            Cron.Daily(time.Hours, time.Minutes),
            new RecurringJobOptions
            {
                TimeZone = ResolvePeruTimeZone()
            });
    }

    public string EncolarEjecucionManual(string tipoReporte, string usuarioEjecucion, string? periodo = null, IReadOnlyList<int>? idsEmpleadoSeleccionados = null)
    {
        var normalizedType = ReporteWhatsappTipos.Normalize(tipoReporte);
        return _backgroundJobClient.Enqueue<ReporteWhatsAppJob>(job => job.EjecutarManualAsync(normalizedType, usuarioEjecucion, periodo, idsEmpleadoSeleccionados));
    }

    public string EncolarReintentoFallidos(string tipoReporte, string usuarioEjecucion, string? periodo = null, IReadOnlyList<int>? idsEmpleadoSeleccionados = null)
    {
        var normalizedType = ReporteWhatsappTipos.Normalize(tipoReporte);
        return _backgroundJobClient.Enqueue<ReporteWhatsAppJob>(job => job.ReintentarFallidosAsync(normalizedType, usuarioEjecucion, periodo, idsEmpleadoSeleccionados));
    }

    private string BuildRecurringJobId(string tipoReporte) =>
        ReporteWhatsappTipos.IsGerencial(tipoReporte)
            ? "reporte-whatsapp-asistencia-wup-gerencial"
            : "reporte-whatsapp-asistencia-wup";

    private string BuildRecurringJobId(string tipoReporte, string diaEjecucion) =>
        $"{BuildRecurringJobId(tipoReporte)}-{diaEjecucion.ToLowerInvariant()}";

    private (string HoraEjecucion, IReadOnlyList<string> DiasEjecucion, bool Activo) GetDefaultsForType(string tipoReporte)
    {
        if (ReporteWhatsappTipos.IsGerencial(tipoReporte))
        {
            return (
                _defaults.HoraEjecucionGerencial,
                NormalizeDiasEjecucion(_defaults.DiasEjecucionGerencial, Array.Empty<string>()),
                _defaults.ActivoGerencial);
        }

        return (
            _defaults.HoraEjecucion,
            NormalizeDiasEjecucion(_defaults.DiasEjecucion, Array.Empty<string>()),
            _defaults.Activo);
    }

    private void RemoveRecurringJobs(string tipoReporte)
    {
        var baseJobId = BuildRecurringJobId(tipoReporte);
        _recurringJobManager.RemoveIfExists(baseJobId);

        foreach (var dia in DiasSemana)
        {
            _recurringJobManager.RemoveIfExists(BuildRecurringJobId(tipoReporte, dia));
        }
    }

    private static string BuildWeeklyCron(string diaEjecucion, int hour, int minute)
    {
        var dayNumber = diaEjecucion switch
        {
            "MONDAY" => 1,
            "TUESDAY" => 2,
            "WEDNESDAY" => 3,
            "THURSDAY" => 4,
            "FRIDAY" => 5,
            "SATURDAY" => 6,
            "SUNDAY" => 0,
            _ => throw new InvalidOperationException($"Dia de ejecucion no soportado: {diaEjecucion}.")
        };

        return $"{minute} {hour} * * {dayNumber}";
    }

    private static IReadOnlyList<string> NormalizeDiasEjecucion(IEnumerable<string>? configured, IReadOnlyList<string> defaults)
    {
        var normalized = (configured ?? Array.Empty<string>())
            .Select(static dia => dia?.Trim().ToUpperInvariant() ?? string.Empty)
            .Where(static dia => DiasSemana.Contains(dia, StringComparer.OrdinalIgnoreCase))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();

        return normalized.Length > 0 ? normalized : defaults;
    }

    private static TimeZoneInfo ResolvePeruTimeZone()
    {
        foreach (var timeZoneId in new[] { "SA Pacific Standard Time", "America/Lima" })
        {
            try
            {
                return TimeZoneInfo.FindSystemTimeZoneById(timeZoneId);
            }
            catch
            {
                // Intentar siguiente zona.
            }
        }

        return TimeZoneInfo.Utc;
    }

    private static readonly string[] DiasSemana =
    [
        "MONDAY",
        "TUESDAY",
        "WEDNESDAY",
        "THURSDAY",
        "FRIDAY",
        "SATURDAY",
        "SUNDAY"
    ];
}
