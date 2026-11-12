using CjERP.Api.Services;
using Hangfire;

namespace CjERP.Api.Jobs;

/// <summary>Sincroniza la lista M_EMPLEADOS de SharePoint. No se permite más de una ejecución a la vez.</summary>
public sealed class EmpleadosListaSharePointJob
{
    private readonly IEmpleadosListaSharePointService _service;

    public EmpleadosListaSharePointJob(IEmpleadosListaSharePointService service)
    {
        _service = service;
    }

    [DisableConcurrentExecution(3600)]
    [AutomaticRetry(Attempts = 2, DelaysInSeconds = new[] { 60, 300 })]
    public Task EjecutarProgramadoAsync() => _service.EjecutarAsync("AUTOMATICO", "SISTEMA");

    [DisableConcurrentExecution(3600)]
    [AutomaticRetry(Attempts = 2, DelaysInSeconds = new[] { 60, 300 })]
    public Task EjecutarManualAsync(string usuario) => _service.EjecutarAsync("MANUAL", usuario);

    [DisableConcurrentExecution(3600)]
    [AutomaticRetry(Attempts = 2, DelaysInSeconds = new[] { 60, 300 })]
    public Task ReintentarAsync(string usuario) => _service.EjecutarAsync("REINTENTO", usuario);
}
