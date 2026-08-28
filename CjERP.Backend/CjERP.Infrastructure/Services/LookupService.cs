using System;
using System.Collections.Generic;
using System.Data;
using System.Globalization;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using CjERP.Application.DTOs;
using CjERP.Application.Interfaces;
using CjERP.Infrastructure.Persistence.Sql;
using Dapper;

namespace CjERP.Infrastructure.Services
{
    public class LookupService : ILookupService
    {
        private readonly ISqlCommandFactory _sqlCommandFactory;

        public LookupService(ISqlCommandFactory sqlCommandFactory)
        {
            _sqlCommandFactory = sqlCommandFactory;
        }

        public async Task<IEnumerable<FiltroOperativoDto>> ListarFiltrosOperativosAsync(CancellationToken cancellationToken = default)
        {
            await using var connection = _sqlCommandFactory.CreateConnection();
            return await connection.QueryAsync<FiltroOperativoDto>(
                _sqlCommandFactory.Create(
                    "sp_Importar_FiltroOperativo_Listar",
                    commandType: CommandType.StoredProcedure,
                    cancellationToken: cancellationToken));
        }

        public async Task<IEnumerable<TipoTrabajoDto>> ListarTipoTrabajoAsync(string filtroKey, CancellationToken cancellationToken = default)
        {
            await using var connection = _sqlCommandFactory.CreateConnection();
            var parameters = new { filtroKey };
            return await connection.QueryAsync<TipoTrabajoDto>(
                _sqlCommandFactory.Create(
                    "sp_Importar_TipoTrabajo_Listar",
                    parameters,
                    CommandType.StoredProcedure,
                    cancellationToken));
        }

        public async Task<IEnumerable<OTDto>> ListarOTAsync(string filtroKey, CancellationToken cancellationToken = default)
        {
            await using var connection = _sqlCommandFactory.CreateConnection();
            var parameters = new { filtroKey };
            return await connection.QueryAsync<OTDto>(
                _sqlCommandFactory.Create(
                    "sp_Importar_OT_Listar",
                    parameters,
                    CommandType.StoredProcedure,
                    cancellationToken));
        }

        public async Task<IEnumerable<TareaDto>> ListarTareasAsync(CancellationToken cancellationToken = default)
        {
            await using var connection = _sqlCommandFactory.CreateConnection();
            var rows = await connection.QueryAsync(
                _sqlCommandFactory.Create(
                    "sp_Constante_ListarPorCampo",
                    new { Campo = "tarea" },
                    CommandType.StoredProcedure,
                    cancellationToken));

            return rows.Select(MapTarea).Cast<TareaDto>();
        }

        public async Task<IEnumerable<SiteMapaDto>> ListarMapaSiteAsync(
            string? nombreSite = null,
            string? departamento = null,
            string? cliente = null,
            string? proyecto = null,
            CancellationToken cancellationToken = default)
        {
            await using var connection = _sqlCommandFactory.CreateConnection();

            var parameters = new DynamicParameters();
            parameters.Add("@NombreSite", NormalizeNullableQueryValue(nombreSite), DbType.String);
            parameters.Add("@Departamento", NormalizeNullableQueryValue(departamento), DbType.String);
            parameters.Add("@Cliente", NormalizeNullableQueryValue(cliente), DbType.String);
            parameters.Add("@Proyecto", NormalizeNullableQueryValue(proyecto), DbType.String);

            var rows = await connection.QueryAsync(
                _sqlCommandFactory.Create(
                    "sp_Site_Listar",
                    parameters,
                    CommandType.StoredProcedure,
                    cancellationToken));

            return rows
                .Select(MapSiteMapa)
                .Cast<SiteMapaDto>()
                .ToArray();
        }

        public async Task<IEnumerable<PersonalMapaDto>> ListarMapaPersonalAsync(CancellationToken cancellationToken = default)
        {
            await using var connection = _sqlCommandFactory.CreateConnection();

            var rows = await connection.QueryAsync(
                _sqlCommandFactory.Create(
                    "dbo.sp_Asistencia_UltimoMovimientoEmpleado",
                    commandType: CommandType.StoredProcedure,
                    cancellationToken: cancellationToken));

            return rows.Select(MapPersonalMapa).Cast<PersonalMapaDto>();
        }

        public async Task<ValoresGastoDto> ObtenerValoresGastoAsync(
            int idCliente,
            int idProyecto,
            string idSite,
            int correlativo,
            string tipoTrabajo,
            string? ot,
            bool usarOt,
            decimal tipoCambio,
            CancellationToken cancellationToken = default)
        {
            await using var connection = _sqlCommandFactory.CreateConnection();

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
                _sqlCommandFactory.Create(
                    "dbo.sp_Finanzas_CargarValoresGasto",
                    parameters,
                    CommandType.StoredProcedure,
                    cancellationToken,
                    commandTimeout: 120));

            if (row == null)
            {
                return new ValoresGastoDto();
            }

            return MapValoresGasto(row);
        }

        public async Task<IEnumerable<ConstanteLookupDto>> ListarConstantesPorCampoAsync(string campo, CancellationToken cancellationToken = default)
        {
            await using var connection = _sqlCommandFactory.CreateConnection();

            var rows = await connection.QueryAsync(
                _sqlCommandFactory.Create(
                    "sp_Constante_ListarPorCampo",
                    new { Campo = campo },
                    CommandType.StoredProcedure,
                    cancellationToken));

            return rows.Select(row => MapConstanteLookup(row, campo)).Cast<ConstanteLookupDto>();
        }

        public async Task<IEnumerable<SolicitanteLookupDto>> ListarSolicitantesAsync(int? idCargo, int? idEmpleado, CancellationToken cancellationToken = default)
        {
            await using var connection = _sqlCommandFactory.CreateConnection();

            var parameters = new DynamicParameters();
            parameters.Add("@IdCargo", idCargo, DbType.Int32);
            parameters.Add("@IdEmpleado", idEmpleado, DbType.Int32);

            var rows = await connection.QueryAsync(
                _sqlCommandFactory.Create(
                    "dbo.sp_ListarSolicitante",
                    parameters,
                    CommandType.StoredProcedure,
                    cancellationToken));

            return rows.Select(MapSolicitanteLookup).Cast<SolicitanteLookupDto>();
        }

        public async Task<IEnumerable<SolicitanteLookupDto>> ListarGestoresAsync(CancellationToken cancellationToken = default)
        {
            await using var connection = _sqlCommandFactory.CreateConnection();

            var rows = await connection.QueryAsync(
                _sqlCommandFactory.Create(
                    "dbo.sp_ListarGestor",
                    commandType: CommandType.StoredProcedure,
                    cancellationToken: cancellationToken));

            return rows.Select(MapSolicitanteLookup).Cast<SolicitanteLookupDto>();
        }

        public async Task<IEnumerable<SolicitanteLookupDto>> ListarValidadoresAsync(CancellationToken cancellationToken = default)
        {
            await using var connection = _sqlCommandFactory.CreateConnection();

            var rows = await connection.QueryAsync(
                _sqlCommandFactory.Create(
                    "dbo.sp_ListarValidador",
                    commandType: CommandType.StoredProcedure,
                    cancellationToken: cancellationToken));

            return rows.Select(MapSolicitanteLookup).Cast<SolicitanteLookupDto>();
        }

        public async Task<IEnumerable<UbigeoLookupDto>> ListarUbigeosAsync(CancellationToken cancellationToken = default)
        {
            await using var connection = _sqlCommandFactory.CreateConnection();

            var rows = await connection.QueryAsync(
                _sqlCommandFactory.Create(
                    "dbo.sp_Listar_Ubigeo",
                    commandType: CommandType.StoredProcedure,
                    cancellationToken: cancellationToken));

            return rows.Select(MapUbigeoLookup).Cast<UbigeoLookupDto>();
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
                ValorIni = GetStringAllowEmpty(data, "ValorIni", "valorIni"),
                ValorFin = GetStringAllowEmpty(data, "ValorFin", "valorFin"),
                Detalle = GetStringAllowEmpty(data, "Detalle", "detalle"),
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

        private static TareaDto MapTarea(dynamic row)
        {
            var data = (IDictionary<string, object>)row;

            return new TareaDto
            {
                TareaKey = GetStringAllowEmpty(data, "TareaKey", "tareaKey", "Codigo", "codigo", "Clave", "clave") ?? string.Empty,
                correlativo = GetStringAllowEmpty(data, "Correlativo", "correlativo", "Id", "id", "Codigo", "codigo") ?? string.Empty,
                tarea = GetStringAllowEmpty(data, "Descripcion", "descripcion", "Nombre", "nombre", "Valor", "valor", "ValorIni", "valorIni") ?? string.Empty
            };
        }

        private static SiteMapaDto MapSiteMapa(dynamic row)
        {
            var data = (IDictionary<string, object>)row;

            return new SiteMapaDto
            {
                IdSite = GetStringAllowEmpty(data, "IdSite", "idSite", "idsite", "Codigo", "codigo", "Id", "id") ?? string.Empty,
                NombreSite = GetStringAllowEmpty(data, "NombreSite", "nombreSite", "nombresite", "NombreSitio", "nombreSitio", "Site", "site") ?? string.Empty,
                Correlativo = GetNullableInt(data, "Correlativo", "correlativo"),
                Departamento = GetStringAllowEmpty(data, "Departamento", "departamento", "NombreDepartamento", "nombreDepartamento", "Depto", "depto") ?? string.Empty,
                Provincia = GetStringAllowEmpty(data, "Provincia", "provincia", "NombreProvincia", "nombreProvincia"),
                Distrito = GetStringAllowEmpty(data, "Distrito", "distrito", "NombreDistrito", "nombreDistrito"),
                Latitud = GetNullableDecimal(data, "Latitud", "latitud", "Lat", "lat"),
                Longitud = GetNullableDecimal(data, "Longitud", "longitud", "Lon", "lon", "Lng", "lng"),
                IdCliente = GetNullableInt(data, "IdCliente", "idCliente"),
                IdProyecto = GetNullableInt(data, "IdProyecto", "idProyecto"),
                NombreCliente = GetStringAllowEmpty(data, "NombreCliente", "nombreCliente", "Cliente", "cliente"),
                NombreProyecto = GetStringAllowEmpty(data, "NombreProyecto", "nombreProyecto", "Proyecto", "proyecto"),
                Direccion = GetStringAllowEmpty(data, "Direccion", "direccion", "Dirección", "direccionCompleta", "DireccionCompleta"),
                Referencia = GetStringAllowEmpty(data, "Referencia", "referencia", "Ubicacion", "ubicacion", "Localizacion", "localizacion")
            };
        }

        private static PersonalMapaDto MapPersonalMapa(dynamic row)
        {
            var data = (IDictionary<string, object>)row;

            return new PersonalMapaDto
            {
                IdEmpleado = GetNullableInt(data, "IdEmpleado", "idEmpleado", "idempleado", "Id", "id", "Codigo", "codigo"),
                NombreEmpleado = GetStringAllowEmpty(
                    data,
                    "NombreEmpleado", "nombreEmpleado", "nombreempleado",
                    "Empleado", "empleado",
                    "NombreCompleto", "nombreCompleto",
                    "NombresApellidos", "nombresApellidos",
                    "Nombres", "nombres",
                    "Apellidos", "apellidos"
                ) ?? string.Empty,
                Departamento = GetStringAllowEmpty(data, "Departamento", "departamento", "Area", "area", "Sede", "sede"),
                Cargo = GetStringAllowEmpty(data, "Cargo", "cargo", "Puesto", "puesto"),
                LatitudFinal = GetNullableDecimal(data, "LatitudFinal", "latitudFinal", "Latitudfinal", "latitudfinal", "Latitud_Final", "latitud_final"),
                LongitudFinal = GetNullableDecimal(data, "LongitudFinal", "longitudFinal", "Longitudfinal", "longitudfinal", "Longitud_Final", "longitud_final"),
                FechaHora = GetDateTime(data, "FechaHora", "fechaHora", "FechaMovimiento", "fechaMovimiento", "Fecha", "fecha"),
                Fecha = GetStringAllowEmpty(data, "Fecha", "fecha", "FechaMovimiento", "fechaMovimiento"),
                FechaAsistencia = GetStringAllowEmpty(data, "FechaAsistencia", "fechaAsistencia"),
                Hora = GetStringAllowEmpty(data, "Hora", "hora", "HoraMovimiento", "horaMovimiento"),
                OrigenMarcacion = GetStringAllowEmpty(data, "OrigenMarcacion", "origenMarcacion", "Origen", "origen"),
                Ubicacion = GetStringAllowEmpty(data, "Ubicacion", "ubicacion", "UBICACION"),
                Site = GetStringAllowEmpty(data, "Site", "site", "NombreSite", "nombreSite", "nombresite"),
                Cliente = GetStringAllowEmpty(data, "Cliente", "cliente", "NombreCliente", "nombreCliente"),
                Proyecto = GetStringAllowEmpty(data, "Proyecto", "proyecto", "NombreProyecto", "nombreProyecto"),
                Imagen = GetStringAllowEmpty(data, "Imagen", "imagen", "ImagenEntrada", "imagenEntrada"),
                ImagenSalida = GetStringAllowEmpty(data, "ImagenSalida", "imagenSalida", "ImagenSalidaBase64", "imagenSalidaBase64"),
                ImagenFinal = GetStringAllowEmpty(data, "ImagenFinal", "imagenFinal", "Imagenfinal", "imagenfinal")
            };
        }

        private static UbigeoLookupDto MapUbigeoLookup(dynamic row)
        {
            var data = (IDictionary<string, object>)row;

            return new UbigeoLookupDto
            {
                IdUbigeo = GetInt(data, "IdUbigeo", "idUbigeo", "Id", "id", "Codigo", "codigo"),
                NombreUbigeo = GetStringAllowEmpty(
                    data,
                    "NombreUbigeo", "nombreUbigeo",
                    "Descripcion", "descripcion",
                    "Nombre", "nombre",
                    "Texto", "texto") ?? string.Empty
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

        private static decimal? GetNullableDecimal(IDictionary<string, object> data, params string[] keys)
        {
            foreach (var key in keys)
            {
                if (data.TryGetValue(key, out var value) && value != null)
                {
                    var text = Convert.ToString(value)?.Trim();
                    if (string.IsNullOrWhiteSpace(text))
                    {
                        continue;
                    }

                    if (decimal.TryParse(text, NumberStyles.Any, CultureInfo.InvariantCulture, out var number))
                    {
                        return number;
                    }

                    if (decimal.TryParse(text, NumberStyles.Any, CultureInfo.CurrentCulture, out number))
                    {
                        return number;
                    }
                }
            }

            return null;
        }

        private static int? GetNullableInt(IDictionary<string, object> data, params string[] keys)
        {
            foreach (var key in keys)
            {
                if (data.TryGetValue(key, out var value) && value != null)
                {
                    var text = Convert.ToString(value)?.Trim();
                    if (string.IsNullOrWhiteSpace(text))
                    {
                        continue;
                    }

                    if (int.TryParse(text, NumberStyles.Any, CultureInfo.InvariantCulture, out var number))
                    {
                        return number;
                    }

                    if (int.TryParse(text, NumberStyles.Any, CultureInfo.CurrentCulture, out number))
                    {
                        return number;
                    }
                }
            }

            return null;
        }

        private static DateTime? GetDateTime(IDictionary<string, object> data, params string[] keys)
        {
            foreach (var key in keys)
            {
                if (data.TryGetValue(key, out var value) && value != null)
                {
                    var text = Convert.ToString(value)?.Trim();
                    if (string.IsNullOrWhiteSpace(text))
                    {
                        continue;
                    }

                    if (DateTime.TryParse(text, CultureInfo.InvariantCulture, DateTimeStyles.AssumeLocal, out var dateTime))
                    {
                        return dateTime;
                    }

                    if (DateTime.TryParse(text, CultureInfo.CurrentCulture, DateTimeStyles.AssumeLocal, out dateTime))
                    {
                        return dateTime;
                    }
                }
            }

            return null;
        }

        private static string? NormalizeNullableQueryValue(string? value)
        {
            var text = value?.Trim();
            return string.IsNullOrWhiteSpace(text) ? null : text;
        }

    }
}
