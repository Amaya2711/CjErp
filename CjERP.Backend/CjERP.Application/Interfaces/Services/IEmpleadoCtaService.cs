using System.Collections.Generic;
using System.Threading.Tasks;
using CjERP.Application.DTOs;

namespace CjERP.Application.Interfaces.Services
{
    public interface IEmpleadoCtaService
    {
        Task<List<EmpleadoCtaDto>> ListarAsync();
        Task<List<EmpleadoCtaDto>> ListarWupAsync();
        Task<List<EmpleadoCtaDto>> ListarPorCargoAsync(int idCargo = 30);
    }
}
