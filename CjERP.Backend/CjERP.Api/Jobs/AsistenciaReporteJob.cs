using CjERP.Application.DTOs;
using CjERP.Application.Interfaces.Services;
using Hangfire;

namespace CjERP.Api.Jobs;

public sealed class AsistenciaReporteJob
{
    private readonly IAsistenciaReporteService _asistenciaReporteService;

    public AsistenciaReporteJob(IAsistenciaReporteService asistenciaReporteService)
    {
        _asistenciaReporteService = asistenciaReporteService;
    }

    [AutomaticRetry(Attempts = 2, DelaysInSeconds = new[] { 15, 60 })]
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

        var response = await _asistenciaReporteService.EnviarPdfEmpleadoLlamadaAtencionAsync(request, usuarioEjecucion);
        if (!response.Success)
        {
            throw new InvalidOperationException(
                string.IsNullOrWhiteSpace(response.ErrorMessage)
                    ? "El servidor SMTP no pudo enviar el PDF de llamada de atencion."
                    : response.ErrorMessage);
        }
    }
}
