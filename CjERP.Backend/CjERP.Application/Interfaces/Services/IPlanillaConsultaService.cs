using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using CjERP.Application.DTOs;

namespace CjERP.Application.Interfaces.Services
{
    public interface IPlanillaConsultaService
    {
        Task<PlanillaConsultaEstadosResponseDto> ConsultarEstadosAsync(
            IEnumerable<PlanillaConsultaParametroDto> parametros,
            string? consulta = null,
            int? maxRows = null,
            int? pageNumber = null,
            int? pageSize = null,
            CancellationToken cancellationToken = default);

        Task<PlanillaConsultaEstadosResponseDto> ConsultarGastosPagadosPorIdAsync(
            int id,
            CancellationToken cancellationToken = default);
    }
}
