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
    }
}
