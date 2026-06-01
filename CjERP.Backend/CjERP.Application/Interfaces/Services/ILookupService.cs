using CjERP.Application.DTOs;
using CjERP.Application.DTOs.Seguridad;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace CjERP.Application.Interfaces
{
    public interface ILookupService
    {
        Task<IEnumerable<FiltroOperativoDto>> ListarFiltrosOperativosAsync(CancellationToken cancellationToken = default);
        Task<IEnumerable<TipoTrabajoDto>> ListarTipoTrabajoAsync(string filtroKey, CancellationToken cancellationToken = default);
        Task<IEnumerable<OTDto>> ListarOTAsync(string filtroKey, CancellationToken cancellationToken = default);
        Task<IEnumerable<TareaDto>> ListarTareasAsync(CancellationToken cancellationToken = default);
        Task<ValoresGastoDto> ObtenerValoresGastoAsync(
            int idCliente,
            int idProyecto,
            string idSite,
            int correlativo,
            string tipoTrabajo,
            string? ot,
            bool usarOt,
            decimal tipoCambio,
            CancellationToken cancellationToken = default);
        Task<IEnumerable<ConstanteLookupDto>> ListarConstantesPorCampoAsync(string campo, CancellationToken cancellationToken = default);
        Task<IEnumerable<SolicitanteLookupDto>> ListarSolicitantesAsync(int? idCargo, int? idEmpleado, CancellationToken cancellationToken = default);
        Task<IEnumerable<SolicitanteLookupDto>> ListarGestoresAsync(CancellationToken cancellationToken = default);
        Task<IEnumerable<SolicitanteLookupDto>> ListarValidadoresAsync(CancellationToken cancellationToken = default);
        Task<IEnumerable<UbigeoLookupDto>> ListarUbigeosAsync(CancellationToken cancellationToken = default);
    }
}
