using CjERP.Application.DTOs;

namespace CjERP.Application.Interfaces.Services
{
    public interface IPlanillaService
    {
        Task<IReadOnlyList<SuministroProvisionalVigenteDto>> ObtenerSuministrosProvisionalesVigentesAsync(
            SuministroProvisionalVigenteRequestDto request,
            CancellationToken cancellationToken = default);
        Task InsertarPlanillaAsync(PlanillaInsertRequestDto request, CancellationToken cancellationToken = default);
        Task ActualizarPlanillaAsync(PlanillaUpdateRequestDto request, CancellationToken cancellationToken = default);
        Task ActualizarNroOperacionPlanillaAsync(
            PlanillaActualizarNroOperacionRequestDto request,
            string usuarioAccion,
            CancellationToken cancellationToken = default);
        Task ActualizarTareaPlanillaAsync(
            PlanillaActualizarTareaRequestDto request,
            string usuarioAccion,
            CancellationToken cancellationToken = default);
        Task ActualizarEstadoPlanillaAsync(PlanillaActualizarEstadoRequestDto request, CancellationToken cancellationToken = default);
        Task<PlanillaProcesarAprobacionMasivaResponseDto> ProcesarAprobacionMasivaAsync(
            IReadOnlyList<PlanillaProcesarAprobacionItemDto> registros,
            int codEstado,
            int idEmpleadoCj,
            int codEmpleado,
            string usuario,
            int idRegularizar,
            CancellationToken cancellationToken = default);
    }
}
