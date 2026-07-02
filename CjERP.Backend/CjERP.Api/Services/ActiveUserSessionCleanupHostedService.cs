using CjERP.Application.Interfaces.Services;

namespace CjERP.Api.Services;

public sealed class ActiveUserSessionCleanupHostedService : BackgroundService
{
    private static readonly TimeSpan CleanupInterval = TimeSpan.FromMinutes(10);
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<ActiveUserSessionCleanupHostedService> _logger;

    public ActiveUserSessionCleanupHostedService(
        IServiceProvider serviceProvider,
        ILogger<ActiveUserSessionCleanupHostedService> logger)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(CleanupInterval);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                if (!await timer.WaitForNextTickAsync(stoppingToken))
                {
                    break;
                }

                using var scope = _serviceProvider.CreateScope();
                var sessionService = scope.ServiceProvider.GetRequiredService<IActiveUserSessionService>();
                var removed = sessionService.PruneExpiredSessions();

                if (removed > 0)
                {
                    _logger.LogInformation("[ActiveSessions] Sesiones expiradas removidas: {Removed}", removed);
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "[ActiveSessions] Ocurrio un error durante la limpieza periodica.");
            }
        }
    }
}
