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
    private const string RecurringJobId = "reporte-whatsapp-asistencia-wup";

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

    public async Task ReprogramarAsync(CancellationToken cancellationToken = default)
    {
        var config = await _reporteRepository.ObtenerConfiguracionAsync(cancellationToken);
        var activo = config?.Activo ?? _defaults.Activo;

        if (!activo)
        {
            _recurringJobManager.RemoveIfExists(RecurringJobId);
            return;
        }

        var hora = config?.HoraEjecucion;
        if (!TimeSpan.TryParse(string.IsNullOrWhiteSpace(hora) ? _defaults.HoraEjecucion : hora, CultureInfo.InvariantCulture, out var time))
        {
            time = TimeSpan.Parse(_defaults.HoraEjecucion, CultureInfo.InvariantCulture);
        }

        _recurringJobManager.AddOrUpdate<ReporteWhatsAppJob>(
            RecurringJobId,
            job => job.EjecutarProgramadoAsync(),
            Cron.Daily(time.Hours, time.Minutes),
            new RecurringJobOptions
            {
                TimeZone = ResolvePeruTimeZone()
            });
    }

    public string EncolarEjecucionManual(string usuarioEjecucion)
    {
        return _backgroundJobClient.Enqueue<ReporteWhatsAppJob>(job => job.EjecutarManualAsync(usuarioEjecucion));
    }

    public string EncolarReintentoFallidos(string usuarioEjecucion)
    {
        return _backgroundJobClient.Enqueue<ReporteWhatsAppJob>(job => job.ReintentarFallidosAsync(usuarioEjecucion));
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
}
