using CjERP.Application.Interfaces.Services;
using Hangfire;

namespace CjERP.Api.Jobs;

public sealed class MobilePushDispatchJob(IMobilePushDispatchService service)
{
    [DisableConcurrentExecution(600)]
    [AutomaticRetry(Attempts = 2, DelaysInSeconds = new[] { 60, 300 })]
    public Task EjecutarAsync() => service.ProcesarAsync();
}
