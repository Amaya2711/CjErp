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
            CancellationToken cancellationToken = default);
    }
}
