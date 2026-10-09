using CjERP.Api.Services;
using Hangfire;

namespace CjERP.Api.Jobs;

/// <summary>
/// Actualiza la tabla de gastos del Excel en SharePoint. La actualización limpia y reescribe la tabla, por eso no se
/// permite más de una ejecución a la vez (la segunda espera a la primera).
/// </summary>
public sealed class GastosExcelSharePointJob
{
    private readonly IGastosExcelSharePointService _service;

    public GastosExcelSharePointJob(IGastosExcelSharePointService service)
    {
        _service = service;
    }

    [DisableConcurrentExecution(1800)]
    [AutomaticRetry(Attempts = 3, DelaysInSeconds = new[] { 30, 60, 120 })]
    public Task EjecutarProgramadoAsync() => _service.EjecutarAsync("AUTOMATICO", "SISTEMA");

    [DisableConcurrentExecution(1800)]
    [AutomaticRetry(Attempts = 3, DelaysInSeconds = new[] { 30, 60, 120 })]
    public Task EjecutarManualAsync(string usuario) => _service.EjecutarAsync("MANUAL", usuario);

    [DisableConcurrentExecution(1800)]
    [AutomaticRetry(Attempts = 3, DelaysInSeconds = new[] { 30, 60, 120 })]
    public Task ReintentarAsync(string usuario) => _service.EjecutarAsync("REINTENTO", usuario);
}
