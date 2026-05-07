using CjERP.Application.DTOs;
using CjERP.Application.DTOs.Seguridad;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace CjERP.Application.Interfaces
{
    public interface ILookupService
    {
        Task<IEnumerable<FiltroOperativoDto>> ListarFiltrosOperativosAsync();
        Task<IEnumerable<TipoTrabajoDto>> ListarTipoTrabajoAsync(string filtroKey);
        Task<IEnumerable<OTDto>> ListarOTAsync(string filtroKey);
        Task<IEnumerable<TareaDto>> ListarTareasAsync();
        Task<ValoresGastoDto> ObtenerValoresGastoAsync(
            int idCliente,
            int idProyecto,
            string idSite,
            int correlativo,
            string tipoTrabajo,
            string? ot,
            bool usarOt,
            decimal tipoCambio);
        Task<IEnumerable<ConstanteLookupDto>> ListarConstantesPorCampoAsync(string campo);
        Task<IEnumerable<SolicitanteLookupDto>> ListarSolicitantesAsync(int? idCargo, int? idEmpleado);
        Task<IEnumerable<SolicitanteLookupDto>> ListarGestoresAsync();
        Task<IEnumerable<SolicitanteLookupDto>> ListarValidadoresAsync();
    }
}
