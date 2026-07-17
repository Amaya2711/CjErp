using CjERP.Application.DTOs;
using CjERP.Application.Interfaces.Services;

namespace CjERP.Api.Jobs;

public sealed class AsistenciaReporteJob
{
    private readonly IAsistenciaReporteService _asistenciaReporteService;

    public AsistenciaReporteJob(IAsistenciaReporteService asistenciaReporteService)
    {
        _asistenciaReporteService = asistenciaReporteService;
    }

    public async Task EnviarPdfEmpleadoLlamadaAtencionAsync(
        AsistenciaReportePdfRequestDto request,
        string usuarioEjecucion)
    {
        var empleadoId = request.Items
            .Select(item => item.IdEmpleado)
            .FirstOrDefault(id => id.HasValue && id.Value > 0);

        if (empleadoId is int idEmpleadoValido &&
            await _asistenciaReporteService.ExistePdfLlamadaAtencionEnviadoHoyAsync(idEmpleadoValido))
        {
            return;
        }

        await _asistenciaReporteService.EnviarPdfEmpleadoLlamadaAtencionAsync(request, usuarioEjecucion);
    }
}
