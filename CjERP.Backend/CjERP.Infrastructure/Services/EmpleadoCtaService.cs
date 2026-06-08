using CjERP.Application.DTOs;
using CjERP.Application.Interfaces;
using CjERP.Application.Interfaces.Services;
using Dapper;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;
using System.Collections.Generic;
using System.Data;
using System.Threading.Tasks;

namespace CjERP.Infrastructure.Services
{
    public class EmpleadoCtaService : IEmpleadoCtaService
    {
        private const string ListarSp = "sp_Empleado_Cta_Listar";
        private const string ListarWupSp = "sp_EmpleadoCj_Listar_Wup";
        private const string ListarCargoSp = "sp_EmpleadoCj_Listar_Cargo";

        private readonly IConfiguration _configuration;

        public EmpleadoCtaService(IConfiguration configuration)
        {
            _configuration = configuration;
        }

        public async Task<List<EmpleadoCtaDto>> ListarAsync()
        {
            using var connection = new SqlConnection(
                _configuration.GetConnectionString("DefaultConnection"));

            var result = await connection.QueryAsync<EmpleadoCtaDto>(
                ListarSp,
                commandType: CommandType.StoredProcedure
            );
            return result.AsList();
        }

        public async Task<List<EmpleadoCtaDto>> ListarWupAsync()
        {
            using var connection = new SqlConnection(
                _configuration.GetConnectionString("DefaultConnection"));

            var result = await connection.QueryAsync<EmpleadoCtaDto>(
                ListarWupSp,
                commandType: CommandType.StoredProcedure
            );
            return result.AsList();
        }

        public async Task<List<EmpleadoCtaDto>> ListarPorCargoAsync(int idCargo = 30)
        {
            using var connection = new SqlConnection(
                _configuration.GetConnectionString("DefaultConnection"));

            var parameters = new DynamicParameters();
            parameters.Add("@IdCargo", idCargo, DbType.Int32);

            var result = await connection.QueryAsync<EmpleadoCtaDto>(
                ListarCargoSp,
                parameters,
                commandType: CommandType.StoredProcedure
            );
            return result.AsList();
        }
    }
}
