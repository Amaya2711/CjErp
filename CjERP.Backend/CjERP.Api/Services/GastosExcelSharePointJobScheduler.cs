using System.Globalization;
using CjERP.Api.Configuration;
using CjERP.Api.Jobs;
using CjERP.Application.DTOs;
using CjERP.Application.Interfaces.Repositories;
using Hangfire;
using Microsoft.Extensions.Options;

namespace CjERP.Api.Services;

public interface IGastosExcelSharePointJobScheduler
{
    Task ReprogramarAsync(CancellationToken cancellationToken = default);
    Task<GastosExcelSharePointConfigDto> ObtenerConfiguracionAsync(CancellationToken cancellationToken = default);
    Task ActualizarConfiguracionAsync(GastosExcelSharePointConfigUpdateDto request, string usuario, CancellationToken cancellationToken = default);
    string EncolarEjecucionManual(string usuario);
    Task<string?> EncolarReintentoAsync(long logId, string usuario, CancellationToken cancellationToken = default);
}

public sealed class GastosExcelSharePointJobScheduler : IGastosExcelSharePointJobScheduler
{
    public const string JobId = "gastos-excel-sharepoint-diario";
    private const string CodigoJob = "GASTOS_EXCEL_SHAREPOINT";
    private readonly IRecurringJobManager _recurringJobManager;
    private readonly IBackgroundJobClient _backgroundJobClient;
    private readonly IGastosExcelSharePointRepository _repository;
    private readonly SharePointGastosExcelOptions _options;

    public GastosExcelSharePointJobScheduler(
        IRecurringJobManager recurringJobManager,
        IBackgroundJobClient backgroundJobClient,
        IGastosExcelSharePointRepository repository,
        IOptions<SharePointOptions> sharePointOptions)
    {
        _recurringJobManager = recurringJobManager;
        _backgroundJobClient = backgroundJobClient;
        _repository = repository;
        _options = sharePointOptions.Value.GastosExcel;
    }

    public async Task ReprogramarAsync(CancellationToken cancellationToken = default)
    {
        var config = await ObtenerConfiguracionAsync(cancellationToken);
        if (!config.Activo)
        {
            _recurringJobManager.RemoveIfExists(JobId);
            return;
        }

        if (!TimeSpan.TryParse(config.HoraEjecucion, CultureInfo.InvariantCulture, out var time))
        {
            throw new InvalidOperationException("La hora de ejecucion del job de gastos no es valida.");
        }

        _recurringJobManager.AddOrUpdate<GastosExcelSharePointJob>(
            JobId,
            job => job.EjecutarProgramadoAsync(),
            Cron.Daily(time.Hours, time.Minutes),
            new RecurringJobOptions { TimeZone = AsistenciaSharePointTimeZone.Resolve() });
    }

    public async Task<GastosExcelSharePointConfigDto> ObtenerConfiguracionAsync(CancellationToken cancellationToken = default)
    {
        var config = await _repository.ObtenerConfiguracionAsync(cancellationToken)
            ?? new GastosExcelSharePointConfigDto();
        config.Archivo = _options.FileName;
        config.Tabla = _options.TableName;
        return config;
    }

    public async Task ActualizarConfiguracionAsync(
        GastosExcelSharePointConfigUpdateDto request,
        string usuario,
        CancellationToken cancellationToken = default)
    {
        if (!TimeSpan.TryParse(request.HoraEjecucion, CultureInfo.InvariantCulture, out var time) ||
            time < TimeSpan.Zero || time >= TimeSpan.FromDays(1))
        {
            throw new ArgumentException("La hora de ejecucion no es valida.");
        }

        if (request.IdCliente <= 0)
        {
            throw new ArgumentException("El cliente no es valido.");
        }

        if (request.EstadoPlanilla < 0)
        {
            throw new ArgumentException("El estado de planilla no es valido.");
        }

        var config = new GastosExcelSharePointConfigDto
        {
            CodigoJob = CodigoJob,
            Activo = request.Activo,
            HoraEjecucion = time.ToString(@"hh\:mm", CultureInfo.InvariantCulture),
            TimeZone = "SA Pacific Standard Time",
            CronExpression = $"{time.Minutes} {time.Hours} * * *",
            IdCliente = request.IdCliente,
            EstadoPlanilla = request.EstadoPlanilla
        };
        await _repository.GuardarConfiguracionAsync(config, usuario, cancellationToken);
        await ReprogramarAsync(cancellationToken);
    }

    public string EncolarEjecucionManual(string usuario) =>
        _backgroundJobClient.Enqueue<GastosExcelSharePointJob>(job => job.EjecutarManualAsync(usuario));

    public async Task<string?> EncolarReintentoAsync(long logId, string usuario, CancellationToken cancellationToken = default)
    {
        var log = await _repository.ObtenerLogAsync(logId, cancellationToken);
        if (log is null || !string.Equals(log.Estado, "ERROR", StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        return _backgroundJobClient.Enqueue<GastosExcelSharePointJob>(job => job.ReintentarAsync(usuario));
    }
}
