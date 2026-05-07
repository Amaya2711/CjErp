using System.Collections.Generic;
using System.Threading.Tasks;
using CjERP.Application.DTOs;
using CjERP.Application.Interfaces;
using Dapper;
using System.Data;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;
using System;
using System.Linq;

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

        public async Task<ValoresGastoDto> ObtenerValoresGastoAsync(
            int idCliente,
            int idProyecto,
            string idSite,
            int correlativo,
            string tipoTrabajo,
            string? ot,
            bool usarOt,
            decimal tipoCambio)
        {
            using var connection = new SqlConnection(_configuration.GetConnectionString("DefaultConnection"));

            var parameters = new DynamicParameters();
            parameters.Add("@IdCliente", idCliente, DbType.Int32);
            parameters.Add("@IdProyecto", idProyecto, DbType.Int32);
            parameters.Add("@IdSite", idSite, DbType.String);
            parameters.Add("@Correlativo", correlativo, DbType.Int32);
            parameters.Add("@TipoTrabajo", tipoTrabajo, DbType.String);
            parameters.Add("@Ot", string.IsNullOrWhiteSpace(ot) ? null : ot.Trim(), DbType.String);
            parameters.Add("@UsarOt", usarOt, DbType.Boolean);
            parameters.Add("@TipoCambio", tipoCambio, DbType.Decimal);

            Console.WriteLine(
                $"[LookupService] sp_Finanzas_CargarValoresGasto => IdCliente={idCliente}, IdProyecto={idProyecto}, IdSite={idSite}, Correlativo={correlativo}, TipoTrabajo={tipoTrabajo}, Ot={ot}, UsarOt={usarOt}, TipoCambio={tipoCambio}");

            var row = await connection.QueryFirstOrDefaultAsync(
                "dbo.sp_Finanzas_CargarValoresGasto",
                parameters,
                commandType: CommandType.StoredProcedure);

            if (row == null)
            {
                return new ValoresGastoDto();
            }

            return MapValoresGasto(row);
        }

        public async Task<IEnumerable<ConstanteLookupDto>> ListarConstantesPorCampoAsync(string campo)
        {
            using var connection = new SqlConnection(_configuration.GetConnectionString("DefaultConnection"));

            var rows = await connection.QueryAsync(
                "sp_Constante_ListarPorCampo",
                new { Campo = campo },
                commandType: CommandType.StoredProcedure);

            // Solución: proyectar explícitamente a IEnumerable<ConstanteLookupDto>
            return rows.Select(row => MapConstanteLookup(row, campo)).Cast<ConstanteLookupDto>();
        }

        public async Task<IEnumerable<SolicitanteLookupDto>> ListarSolicitantesAsync(int? idCargo, int? idEmpleado)
        {
            using var connection = new SqlConnection(_configuration.GetConnectionString("DefaultConnection"));

            var parameters = new DynamicParameters();
            parameters.Add("@IdCargo", idCargo, DbType.Int32);
            parameters.Add("@IdEmpleado", idEmpleado, DbType.Int32);

            var rows = await connection.QueryAsync(
                "dbo.sp_ListarSolicitante",
                parameters,
                commandType: CommandType.StoredProcedure);

            return rows.Select(MapSolicitanteLookup).Cast<SolicitanteLookupDto>();
        }

        public async Task<IEnumerable<SolicitanteLookupDto>> ListarGestoresAsync()
        {
            using var connection = new SqlConnection(_configuration.GetConnectionString("DefaultConnection"));

            var rows = await connection.QueryAsync(
                "dbo.sp_ListarGestor",
                commandType: CommandType.StoredProcedure);

            return rows.Select(MapSolicitanteLookup).Cast<SolicitanteLookupDto>();
        }

        public async Task<IEnumerable<SolicitanteLookupDto>> ListarValidadoresAsync()
        {
            using var connection = new SqlConnection(_configuration.GetConnectionString("DefaultConnection"));

            var rows = await connection.QueryAsync(
                "dbo.sp_ListarValidador",
                commandType: CommandType.StoredProcedure);

            return rows.Select(MapSolicitanteLookup).Cast<SolicitanteLookupDto>();
        }

        private static ConstanteLookupDto MapConstanteLookup(dynamic row, string campo)
        {
            var data = (IDictionary<string, object>)row;

            var codigo = GetString(
                data,
                "Codigo", "codigo",
                "Id", "id",
                "Clave", "clave",
                "correlativo", "Correlativo",
                "Orden", "orden",
                "ValorIni", "valorIni",
                "Valor", "valor");

            var descripcion = GetStringAllowEmpty(
                data,
                "Descripcion", "descripcion",
                "Nombre", "nombre",
                "Detalle", "detalle",
                "Texto", "texto",
                "Valor", "valor",
                "ValorIni", "valorIni");

            var valor = GetStringAllowEmpty(
                data,
                "Valor", "valor",
                "ValorFin", "valorFin",
                "ValorIni", "valorIni");

            return new ConstanteLookupDto
            {
                Campo = GetString(data, "Campo", "campo") ?? campo,
                Codigo = codigo ?? string.Empty,
                Descripcion = descripcion ?? string.Empty,
                Valor = valor ?? string.Empty,
                Orden = GetInt(data, "Orden", "orden", "correlativo", "Correlativo")
            };
        }

        private static SolicitanteLookupDto MapSolicitanteLookup(dynamic row)
        {
            var data = (IDictionary<string, object>)row;

            return new SolicitanteLookupDto
            {
                Id = GetInt(data, "IdEmpleado", "idEmpleado", "Id", "id", "Codigo", "codigo"),
                Nombre = GetStringAllowEmpty(
                    data,
                    "NombreEmpleado", "nombreEmpleado",
                    "Nombre", "nombre",
                    "Descripcion", "descripcion",
                    "Texto", "texto"
                ) ?? string.Empty
            };
        }

        private static ValoresGastoDto MapValoresGasto(dynamic row)
        {
            var data = (IDictionary<string, object>)row;

            return new ValoresGastoDto
            {
                Porcentaje = GetDecimal(data, "Porcentaje", "porcentaje", "PorcentajePagado", "porcentajePagado"),
                Aprobado = GetDecimal(data, "Aprobado", "aprobado"),
                Pagado = GetDecimal(data, "Pagado", "pagado"),
                Adelantado = GetDecimal(data, "Adelantado", "adelantado"),
                Saldo2 = GetDecimal(data, "Saldo2", "saldo2", "SaldoAprobadoMenosPagado", "saldoAprobadoMenosPagado"),
                Saldo = GetDecimal(data, "Saldo", "saldo", "SaldoFinal", "saldoFinal")
            };
        }

        private static string? GetString(IDictionary<string, object> data, params string[] keys)
        {
            foreach (var key in keys)
            {
                if (data.TryGetValue(key, out var value) && value != null)
                {
                    var text = Convert.ToString(value);
                    if (!string.IsNullOrWhiteSpace(text))
                    {
                        return text;
                    }
                }
            }

            return null;
        }

        private static string? GetStringAllowEmpty(IDictionary<string, object> data, params string[] keys)
        {
            foreach (var key in keys)
            {
                if (data.TryGetValue(key, out var value) && value != null)
                {
                    return Convert.ToString(value) ?? string.Empty;
                }
            }

            return null;
        }

        private static int GetInt(IDictionary<string, object> data, params string[] keys)
        {
            foreach (var key in keys)
            {
                if (data.TryGetValue(key, out var value) && value != null)
                {
                    if (int.TryParse(Convert.ToString(value), out var number))
                    {
                        return number;
                    }
                }
            }

            return 0;
        }

        private static decimal GetDecimal(IDictionary<string, object> data, params string[] keys)
        {
            foreach (var key in keys)
            {
                if (data.TryGetValue(key, out var value) && value != null)
                {
                    if (decimal.TryParse(Convert.ToString(value), out var number))
                    {
                        return number;
                    }
                }
            }

            return 0;
        }
    }
}
