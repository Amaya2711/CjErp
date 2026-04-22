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
                "sp_Empleado_Cta_Listar",
                commandType: CommandType.StoredProcedure
            );
            return result.AsList();
        }
    }
}