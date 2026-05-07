using CjERP.Application.DTOs;

namespace CjERP.Application.Interfaces.Services
{
    public interface IPlanillaService
    {
        Task InsertarPlanillaAsync(PlanillaInsertRequestDto request, CancellationToken cancellationToken = default);
        Task ActualizarPlanillaAsync(PlanillaUpdateRequestDto request, CancellationToken cancellationToken = default);
        Task ActualizarEstadoPlanillaAsync(PlanillaActualizarEstadoRequestDto request, CancellationToken cancellationToken = default);
    }
}
