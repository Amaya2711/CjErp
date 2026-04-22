using System.Collections.Generic;
using System.Threading.Tasks;
using CjERP.Application.DTOs;
using CjERP.Application.Interfaces;
using Dapper;
using System.Data;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;

namespace CjERP.Infrastructure.Services
{
    public class LookupService : ILookupService
    {
        private readonly IConfiguration _configuration;

        public LookupService(IConfiguration configuration)
        {
            _configuration = configuration;
        }

        public async Task<IEnumerable<FiltroOperativoDto>> ListarFiltrosOperativosAsync()
        {
            using var connection = new SqlConnection(_configuration.GetConnectionString("DefaultConnection"));
            return await connection.QueryAsync<FiltroOperativoDto>("sp_Importar_FiltroOperativo_Listar", commandType: CommandType.StoredProcedure);
        }

        public async Task<IEnumerable<TipoTrabajoDto>> ListarTipoTrabajoAsync(string filtroKey)
        {
            using var connection = new SqlConnection(_configuration.GetConnectionString("DefaultConnection"));
            var parameters = new { filtroKey };
            return await connection.QueryAsync<TipoTrabajoDto>("sp_Importar_TipoTrabajo_Listar", parameters, commandType: CommandType.StoredProcedure);
        }

        public async Task<IEnumerable<OTDto>> ListarOTAsync(string filtroKey)
        {
            using var connection = new SqlConnection(_configuration.GetConnectionString("DefaultConnection"));
            var parameters = new { filtroKey };
            return await connection.QueryAsync<OTDto>("sp_Importar_OT_Listar", parameters, commandType: CommandType.StoredProcedure);
        }

        public async Task<IEnumerable<TareaDto>> ListarTareasAsync()
        {
            using var connection = new SqlConnection(_configuration.GetConnectionString("DefaultConnection"));
            return await connection.QueryAsync<TareaDto>("sp_Constante_Tarea_Listar", commandType: CommandType.StoredProcedure);
        }
    }
}