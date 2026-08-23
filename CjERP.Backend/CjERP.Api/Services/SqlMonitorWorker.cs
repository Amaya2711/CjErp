using CjERP.Application.Interfaces.Services;

namespace CjERP.Api.Services;

public sealed class SqlMonitorWorker : BackgroundService
{
    private static readonly TimeSpan TickInterval = TimeSpan.FromSeconds(30);
    private static readonly TimeSpan MinuteInterval = TimeSpan.FromMinutes(1);
    private static readonly TimeSpan FiveMinuteInterval = TimeSpan.FromMinutes(5);
    private static readonly TimeSpan DailyInterval = TimeSpan.FromDays(1);

    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<SqlMonitorWorker> _logger;

    public SqlMonitorWorker(
        IServiceProvider serviceProvider,
        ILogger<SqlMonitorWorker> logger)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var startedAt = DateTimeOffset.UtcNow;
        var last30 = startedAt - TickInterval;
        var last1m = startedAt - MinuteInterval;
        var last5m = startedAt - FiveMinuteInterval;
        var lastDaily = startedAt;

        using var timer = new PeriodicTimer(TickInterval);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                if (!await timer.WaitForNextTickAsync(stoppingToken))
                {
                    break;
                }

                var now = DateTimeOffset.UtcNow;

                using var scope = _serviceProvider.CreateScope();
                var monitorService = scope.ServiceProvider.GetRequiredService<ISqlMonitorService>();

                if (now - last30 >= TickInterval)
                {
                    await EjecutarSeguroAsync("Captura30Seg", () => monitorService.Capturar30SegundosAsync(stoppingToken));
                    last30 = now;
                }

                if (now - last1m >= MinuteInterval)
                {
                    await EjecutarSeguroAsync("Captura1Min", () => monitorService.Capturar1MinutoAsync(stoppingToken));
                    last1m = now;
                }

                if (now - last5m >= FiveMinuteInterval)
                {
                    await EjecutarSeguroAsync("Captura5Min", () => monitorService.Capturar5MinutosAsync(stoppingToken));
                    last5m = now;
                }

                if (now - lastDaily >= DailyInterval)
                {
                    await EjecutarSeguroAsync("LimpiarHistorico", () => monitorService.LimpiarHistoricoAsync(stoppingToken));
                    lastDaily = now;
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "[SqlMonitorWorker] Ocurrio un error inesperado en el ciclo principal.");
            }
        }
    }

    private async Task EjecutarSeguroAsync(string nombreProceso, Func<Task> accion)
    {
        try
        {
            await accion();
            _logger.LogInformation("[SqlMonitorWorker] {Proceso} ejecutado correctamente.", nombreProceso);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "[SqlMonitorWorker] Error al ejecutar {Proceso}.", nombreProceso);
        }
    }
}
