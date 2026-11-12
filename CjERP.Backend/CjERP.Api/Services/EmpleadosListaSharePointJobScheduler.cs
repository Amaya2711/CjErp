using System.Globalization;
using CjERP.Api.Configuration;
using CjERP.Api.Jobs;
using CjERP.Application.DTOs;
using CjERP.Application.Interfaces.Repositories;
using Hangfire;
using Microsoft.Extensions.Options;

namespace CjERP.Api.Services;

public interface IEmpleadosListaSharePointJobScheduler
{
    Task ReprogramarAsync(CancellationToken cancellationToken = default);
    Task<EmpleadosListaSharePointConfigDto> ObtenerConfiguracionAsync(CancellationToken cancellationToken = default);
    Task ActualizarConfiguracionAsync(EmpleadosListaSharePointConfigUpdateDto request, string usuario, CancellationToken cancellationToken = default);
    string EncolarEjecucionManual(string usuario);
    Task<string?> EncolarReintentoAsync(long logId, string usuario, CancellationToken cancellationToken = default);
}

public sealed class EmpleadosListaSharePointJobScheduler : IEmpleadosListaSharePointJobScheduler
{
    public const string JobId = "empleados-lista-sharepoint-diario";
    private const string CodigoJob = "EMPLEADOS_LISTA_SHAREPOINT";
    private readonly IRecurringJobManager _recurringJobManager;
    private readonly IBackgroundJobClient _backgroundJobClient;
    private readonly IEmpleadosListaSharePointRepository _repository;
    private readonly SharePointEmpleadosListaOptions _options;

    public EmpleadosListaSharePointJobScheduler(
        IRecurringJobManager recurringJobManager,
        IBackgroundJobClient backgroundJobClient,
        IEmpleadosListaSharePointRepository repository,
        IOptions<SharePointOptions> sharePointOptions)
    {
        _recurringJobManager = recurringJobManager;
        _backgroundJobClient = backgroundJobClient;
        _repository = repository;
        _options = sharePointOptions.Value.EmpleadosLista;
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
            throw new InvalidOperationException("La hora de ejecucion del job de empleados no es valida.");
        }

        _recurringJobManager.AddOrUpdate<EmpleadosListaSharePointJob>(
            JobId,
            job => job.EjecutarProgramadoAsync(),
            Cron.Daily(time.Hours, time.Minutes),
            new RecurringJobOptions { TimeZone = AsistenciaSharePointTimeZone.Resolve() });
    }

    public async Task<EmpleadosListaSharePointConfigDto> ObtenerConfiguracionAsync(CancellationToken cancellationToken = default)
    {
        var config = await _repository.ObtenerConfiguracionAsync(cancellationToken)
            ?? new EmpleadosListaSharePointConfigDto();
        config.Lista = _options.ListName;
        config.ColumnaClave = string.IsNullOrWhiteSpace(_options.KeyColumn) ? "(primera columna del SP)" : _options.KeyColumn;
        return config;
    }

    public async Task ActualizarConfiguracionAsync(
        EmpleadosListaSharePointConfigUpdateDto request,
        string usuario,
        CancellationToken cancellationToken = default)
    {
        if (!TimeSpan.TryParse(request.HoraEjecucion, CultureInfo.InvariantCulture, out var time) ||
            time < TimeSpan.Zero || time >= TimeSpan.FromDays(1))
        {
            throw new ArgumentException("La hora de ejecucion no es valida.");
        }

        var config = new EmpleadosListaSharePointConfigDto
        {
            CodigoJob = CodigoJob,
            Activo = request.Activo,
            HoraEjecucion = time.ToString(@"hh\:mm", CultureInfo.InvariantCulture),
            TimeZone = "SA Pacific Standard Time",
            CronExpression = $"{time.Minutes} {time.Hours} * * *"
        };
        await _repository.GuardarConfiguracionAsync(config, usuario, cancellationToken);
        await ReprogramarAsync(cancellationToken);
    }

    public string EncolarEjecucionManual(string usuario) =>
        _backgroundJobClient.Enqueue<EmpleadosListaSharePointJob>(job => job.EjecutarManualAsync(usuario));

    public async Task<string?> EncolarReintentoAsync(long logId, string usuario, CancellationToken cancellationToken = default)
    {
        var log = await _repository.ObtenerLogAsync(logId, cancellationToken);
        if (log is null || !string.Equals(log.Estado, "ERROR", StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        return _backgroundJobClient.Enqueue<EmpleadosListaSharePointJob>(job => job.ReintentarAsync(usuario));
    }
}
