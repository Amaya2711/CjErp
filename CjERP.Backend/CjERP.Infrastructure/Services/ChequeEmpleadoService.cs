using System.Data;
using System.Globalization;
using CjERP.Application.DTOs;
using CjERP.Application.Interfaces.Services;
using CjERP.Infrastructure.Persistence.Sql;
using Dapper;
using Microsoft.Data.SqlClient;

namespace CjERP.Infrastructure.Services;

public class ChequeEmpleadoService : IChequeEmpleadoService
{
    private const string ListarSp = "dbo.sp_ChequeEmpleado_Listar";
    private const string ObtenerSp = "dbo.sp_ChequeEmpleado_Obtener";
    private const string InsertarSp = "dbo.sp_ChequeEmpleado_Insertar";
    private const string ActualizarSp = "dbo.sp_ChequeEmpleado_Actualizar";

    private readonly ISqlCommandFactory _sqlCommandFactory;
    private readonly IAuditoriaCambiosService _auditoriaCambiosService;

    public ChequeEmpleadoService(
        ISqlCommandFactory sqlCommandFactory,
        IAuditoriaCambiosService auditoriaCambiosService)
    {
        _sqlCommandFactory = sqlCommandFactory;
        _auditoriaCambiosService = auditoriaCambiosService;
    }

    public async Task<IReadOnlyList<ChequeEmpleadoDto>> ListarAsync(
        ChequeEmpleadoFiltroDto filtro,
        CancellationToken cancellationToken = default)
    {
        await using var connection = BuildConnection();
        var rows = await connection.QueryAsync(
            _sqlCommandFactory.Create(
                ListarSp,
                new
                {
                    idempleado = filtro.IdEmpleado,
                    idestado = filtro.IdEstado
                },
                CommandType.StoredProcedure,
                cancellationToken));

        return rows.Select(MapRow).ToList();
    }

    public async Task<ChequeEmpleadoDto?> ObtenerAsync(
        int idCheque,
        CancellationToken cancellationToken = default)
    {
        await using var connection = BuildConnection();
        return await ObtenerInternoAsync(connection, idCheque, cancellationToken);
    }

    public async Task<ChequeEmpleadoOperacionResultadoDto> CrearAsync(
        ChequeEmpleadoGuardarDto request,
        CancellationToken cancellationToken = default)
    {
        ValidateGuardarRequest(request, isUpdate: false);

        await using var connection = BuildConnection();
        var usuarioAccion = ResolveUsuarioAccion(request.UsuarioAccion);
        var parameters = BuildGuardarParameters(request, includeIdCheque: false);

        var result = await connection.QueryFirstOrDefaultAsync<ChequeEmpleadoSpResult>(
            _sqlCommandFactory.Create(
                InsertarSp,
                parameters,
                CommandType.StoredProcedure,
                cancellationToken,
                commandTimeout: 120));

        ValidateStoredProcedureResult(result, "No se pudo crear el cheque.");

        var idCheque = result!.IdCheque.GetValueOrDefault();
        var actual = await ObtenerInternoAsync(connection, idCheque, cancellationToken)
            ?? throw new InvalidOperationException("No se pudo obtener el cheque recien creado.");

        await _auditoriaCambiosService.RegistrarLoteAsync(
            BuildInsertAuditEntries(actual, usuarioAccion),
            cancellationToken);

        return new ChequeEmpleadoOperacionResultadoDto
        {
            IdCheque = idCheque,
            Row = actual
        };
    }

    public async Task<ChequeEmpleadoOperacionResultadoDto> ActualizarAsync(
        ChequeEmpleadoGuardarDto request,
        CancellationToken cancellationToken = default)
    {
        ValidateGuardarRequest(request, isUpdate: true);

        await using var connection = BuildConnection();
        var anterior = await ObtenerInternoAsync(connection, request.IdCheque!.Value, cancellationToken)
            ?? throw new InvalidOperationException("No se encontro el cheque a actualizar.");
        var usuarioAccion = ResolveUsuarioAccion(request.UsuarioAccion);
        var parameters = BuildGuardarParameters(request, includeIdCheque: true);

        var result = await connection.QueryFirstOrDefaultAsync<ChequeEmpleadoSpResult>(
            _sqlCommandFactory.Create(
                ActualizarSp,
                parameters,
                CommandType.StoredProcedure,
                cancellationToken,
                commandTimeout: 120));

        ValidateStoredProcedureResult(result, "No se pudo actualizar el cheque.");

        var actual = await ObtenerInternoAsync(connection, request.IdCheque.Value, cancellationToken)
            ?? throw new InvalidOperationException("No se pudo obtener el cheque actualizado.");

        var auditEntries = BuildUpdateAuditEntries(anterior, actual, usuarioAccion).ToList();
        if (auditEntries.Count > 0)
        {
            await _auditoriaCambiosService.RegistrarLoteAsync(auditEntries, cancellationToken);
        }

        return new ChequeEmpleadoOperacionResultadoDto
        {
            IdCheque = actual.IdCheque,
            Row = actual
        };
    }

    public async Task<ChequeEmpleadoOperacionResultadoDto> RechazarAsync(
        int idCheque,
        ChequeEmpleadoRechazarDto request,
        CancellationToken cancellationToken = default)
    {
        if (idCheque <= 0)
        {
            throw new InvalidOperationException("El IdCheque debe ser mayor que cero.");
        }

        if (request.IdEstadoRechazado is null || request.IdEstadoRechazado < 0)
        {
            throw new InvalidOperationException("No se pudo resolver el estado rechazado del cheque.");
        }

        if (string.IsNullOrWhiteSpace(request.Observacion))
        {
            throw new InvalidOperationException("Debe ingresar una observacion para rechazar el cheque.");
        }

        await using var connection = BuildConnection();
        var anterior = await ObtenerInternoAsync(connection, idCheque, cancellationToken)
            ?? throw new InvalidOperationException("No se encontro el cheque a rechazar.");

        var usuarioAccion = ResolveUsuarioAccion(request.UsuarioAccion);
        var updateRequest = new ChequeEmpleadoGuardarDto
        {
            IdCheque = anterior.IdCheque,
            IdBanco = anterior.IdBanco,
            FechaCheque = anterior.FechaCheque.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            NroCheque = anterior.NroCheque,
            Importe = anterior.Importe,
            IdMoneda = anterior.IdMoneda,
            IdEmpleado = anterior.IdEmpleado,
            IdEstado = request.IdEstadoRechazado.Value,
            Comentario = anterior.Comentario,
            Ruta = anterior.Ruta,
            UsuarioAccion = usuarioAccion
        };

        var result = await connection.QueryFirstOrDefaultAsync<ChequeEmpleadoSpResult>(
            _sqlCommandFactory.Create(
                ActualizarSp,
                BuildGuardarParameters(updateRequest, includeIdCheque: true),
                CommandType.StoredProcedure,
                cancellationToken,
                commandTimeout: 120));

        ValidateStoredProcedureResult(result, "No se pudo rechazar el cheque.");

        var actual = await ObtenerInternoAsync(connection, idCheque, cancellationToken)
            ?? throw new InvalidOperationException("No se pudo obtener el cheque rechazado.");

        await _auditoriaCambiosService.RegistrarLoteAsync(
            BuildRejectAuditEntries(anterior, actual, request.Observacion.Trim(), usuarioAccion),
            cancellationToken);

        return new ChequeEmpleadoOperacionResultadoDto
        {
            IdCheque = actual.IdCheque,
            Row = actual
        };
    }

    private async Task<ChequeEmpleadoDto?> ObtenerInternoAsync(
        SqlConnection connection,
        int idCheque,
        CancellationToken cancellationToken)
    {
        var row = await connection.QueryFirstOrDefaultAsync(
            _sqlCommandFactory.Create(
                ObtenerSp,
                new { IdCheque = idCheque },
                CommandType.StoredProcedure,
                cancellationToken));

        return row is null ? null : MapRow(row);
    }

    private static DynamicParameters BuildGuardarParameters(
        ChequeEmpleadoGuardarDto request,
        bool includeIdCheque)
    {
        var parameters = new DynamicParameters();

        if (includeIdCheque)
        {
            parameters.Add("@IdCheque", request.IdCheque, DbType.Int32);
        }

        parameters.Add("@idbanco", request.IdBanco, DbType.Int32);
        parameters.Add("@fecha_cheque", NormalizeDate(request.FechaCheque), DbType.DateTime);
        parameters.Add("@nro_cheque", request.NroCheque.Trim(), DbType.String);
        parameters.Add("@importe", request.Importe, DbType.Decimal);
        parameters.Add("@idmoneda", request.IdMoneda, DbType.Int32);
        parameters.Add("@idempleado", request.IdEmpleado, DbType.Int32);
        parameters.Add("@idestado", request.IdEstado, DbType.Int32);
        parameters.Add("@comentario", NullIfWhiteSpace(request.Comentario), DbType.String);
        parameters.Add("@ruta", NullIfWhiteSpace(request.Ruta), DbType.String);

        return parameters;
    }

    private static void ValidateGuardarRequest(ChequeEmpleadoGuardarDto request, bool isUpdate)
    {
        if (isUpdate && request.IdCheque is not > 0)
        {
            throw new InvalidOperationException("Debe indicar el IdCheque para actualizar.");
        }

        if (request.IdBanco <= 0)
        {
            throw new InvalidOperationException("Debe seleccionar un banco.");
        }

        if (string.IsNullOrWhiteSpace(request.FechaCheque))
        {
            throw new InvalidOperationException("Debe ingresar la fecha del cheque.");
        }

        _ = NormalizeDate(request.FechaCheque);

        if (string.IsNullOrWhiteSpace(request.NroCheque))
        {
            throw new InvalidOperationException("Debe ingresar el numero de cheque.");
        }

        if (request.Importe <= 0)
        {
            throw new InvalidOperationException("El importe debe ser mayor que cero.");
        }

        if (request.IdMoneda <= 0)
        {
            throw new InvalidOperationException("Debe seleccionar la moneda.");
        }

        if (request.IdEmpleado <= 0)
        {
            throw new InvalidOperationException("Debe seleccionar el empleado.");
        }

        if (request.IdEstado <= 0)
        {
            throw new InvalidOperationException("Debe seleccionar el estado.");
        }
    }

    private static DateTime NormalizeDate(string rawValue)
    {
        if (DateTime.TryParse(rawValue, CultureInfo.InvariantCulture, DateTimeStyles.AllowWhiteSpaces, out var parsed))
        {
            return parsed;
        }

        if (DateTime.TryParse(rawValue, new CultureInfo("es-PE"), DateTimeStyles.AllowWhiteSpaces, out parsed))
        {
            return parsed;
        }

        throw new InvalidOperationException("La fecha del cheque no tiene un formato valido.");
    }

    private static void ValidateStoredProcedureResult(ChequeEmpleadoSpResult? result, string fallbackMessage)
    {
        if (result is null)
        {
            throw new InvalidOperationException(fallbackMessage);
        }

        if (result.Resultado != 1)
        {
            throw new InvalidOperationException(
                string.IsNullOrWhiteSpace(result.Mensaje) ? fallbackMessage : result.Mensaje);
        }
    }

    private static IEnumerable<AuditoriaCambioDto> BuildInsertAuditEntries(
        ChequeEmpleadoDto actual,
        string usuarioAccion)
    {
        var changes = BuildFieldValues(actual)
            .Where(static item => !string.IsNullOrWhiteSpace(item.Value))
            .Select(item => new AuditoriaCambioDto
            {
                Modulo = "Tesoreria",
                Entidad = "ChequeEmpleado",
                IdRegistro = actual.IdCheque.ToString(CultureInfo.InvariantCulture),
                Accion = "INSERT",
                Seccion = "Cabecera",
                Campo = item.Key,
                ValorAnterior = null,
                ValorNuevo = item.Value,
                UsuarioAccion = usuarioAccion,
                Observacion = "Registro inicial del cheque."
            })
            .ToList();

        var fechaCreacion = actual.FechaCreacion ?? DateTime.Now;
        changes.Add(new AuditoriaCambioDto
        {
            Modulo = "Tesoreria",
            Entidad = "ChequeEmpleado",
            IdRegistro = actual.IdCheque.ToString(CultureInfo.InvariantCulture),
            Accion = "INSERT",
            Seccion = "Auditoria",
            Campo = "Usuario creacion",
            ValorAnterior = null,
            ValorNuevo = usuarioAccion,
            UsuarioAccion = usuarioAccion,
            Observacion = "Usuario que registro el cheque."
        });
        changes.Add(new AuditoriaCambioDto
        {
            Modulo = "Tesoreria",
            Entidad = "ChequeEmpleado",
            IdRegistro = actual.IdCheque.ToString(CultureInfo.InvariantCulture),
            Accion = "INSERT",
            Seccion = "Auditoria",
            Campo = "Fecha creacion",
            ValorAnterior = null,
            ValorNuevo = fechaCreacion.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            UsuarioAccion = usuarioAccion,
            Observacion = "Fecha de creacion del cheque."
        });
        changes.Add(new AuditoriaCambioDto
        {
            Modulo = "Tesoreria",
            Entidad = "ChequeEmpleado",
            IdRegistro = actual.IdCheque.ToString(CultureInfo.InvariantCulture),
            Accion = "INSERT",
            Seccion = "Auditoria",
            Campo = "Hora creacion",
            ValorAnterior = null,
            ValorNuevo = fechaCreacion.ToString("HH:mm:ss", CultureInfo.InvariantCulture),
            UsuarioAccion = usuarioAccion,
            Observacion = "Hora de creacion del cheque."
        });

        return changes;
    }

    private static IEnumerable<AuditoriaCambioDto> BuildUpdateAuditEntries(
        ChequeEmpleadoDto anterior,
        ChequeEmpleadoDto actual,
        string usuarioAccion)
    {
        var valoresAnteriores = BuildFieldValues(anterior);
        var valoresActuales = BuildFieldValues(actual);

        foreach (var actualValue in valoresActuales)
        {
            valoresAnteriores.TryGetValue(actualValue.Key, out var valorAnterior);
            if (string.Equals(valorAnterior, actualValue.Value, StringComparison.Ordinal))
            {
                continue;
            }

            yield return new AuditoriaCambioDto
            {
                Modulo = "Tesoreria",
                Entidad = "ChequeEmpleado",
                IdRegistro = actual.IdCheque.ToString(CultureInfo.InvariantCulture),
                Accion = "UPDATE",
                Seccion = "Cabecera",
                Campo = actualValue.Key,
                ValorAnterior = valorAnterior,
                ValorNuevo = actualValue.Value,
                UsuarioAccion = usuarioAccion,
                Observacion = "Actualizacion del cheque."
            };
        }
    }

    private static IEnumerable<AuditoriaCambioDto> BuildRejectAuditEntries(
        ChequeEmpleadoDto anterior,
        ChequeEmpleadoDto actual,
        string observacion,
        string usuarioAccion)
    {
        return
        [
            new AuditoriaCambioDto
            {
                Modulo = "Tesoreria",
                Entidad = "ChequeEmpleado",
                IdRegistro = actual.IdCheque.ToString(CultureInfo.InvariantCulture),
                Accion = "UPDATE",
                Seccion = "Estado",
                Campo = "IdEstado",
                ValorAnterior = anterior.IdEstado.ToString(CultureInfo.InvariantCulture),
                ValorNuevo = actual.IdEstado.ToString(CultureInfo.InvariantCulture),
                UsuarioAccion = usuarioAccion,
                Observacion = "Rechazo del cheque."
            },
            new AuditoriaCambioDto
            {
                Modulo = "Tesoreria",
                Entidad = "ChequeEmpleado",
                IdRegistro = actual.IdCheque.ToString(CultureInfo.InvariantCulture),
                Accion = "UPDATE",
                Seccion = "Estado",
                Campo = "Motivo rechazo",
                ValorAnterior = null,
                ValorNuevo = observacion,
                UsuarioAccion = usuarioAccion,
                Observacion = "Motivo de rechazo del cheque."
            }
        ];
    }

    private static Dictionary<string, string> BuildFieldValues(ChequeEmpleadoDto item)
    {
        return new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            ["Banco"] = item.IdBanco.ToString(CultureInfo.InvariantCulture),
            ["Fecha cheque"] = item.FechaCheque.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            ["Nro cheque"] = item.NroCheque.Trim(),
            ["Importe"] = item.Importe.ToString("0.00", CultureInfo.InvariantCulture),
            ["Moneda"] = item.IdMoneda.ToString(CultureInfo.InvariantCulture),
            ["Empleado"] = item.IdEmpleado.ToString(CultureInfo.InvariantCulture),
            ["Estado"] = item.IdEstado.ToString(CultureInfo.InvariantCulture),
            ["Comentario"] = item.Comentario?.Trim() ?? string.Empty,
            ["Ruta"] = item.Ruta?.Trim() ?? string.Empty
        };
    }

    private static string ResolveUsuarioAccion(string? usuarioAccion)
    {
        return string.IsNullOrWhiteSpace(usuarioAccion) ? "sistema" : usuarioAccion.Trim();
    }

    private static string? NullIfWhiteSpace(string? value)
    {
        return string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    }

    private static ChequeEmpleadoDto MapRow(dynamic row)
    {
        var data = (IDictionary<string, object>)row;

        return new ChequeEmpleadoDto
        {
            IdCheque = GetInt(data, "IdCheque", "idCheque"),
            IdBanco = GetInt(data, "idbanco", "IdBanco", "idBanco"),
            FechaCheque = GetDate(data, "fecha_cheque", "FechaCheque", "fechaCheque"),
            NroCheque = GetString(data, "nro_cheque", "NroCheque", "nroCheque"),
            Importe = GetDecimal(data, "importe", "Importe"),
            IdMoneda = GetInt(data, "idmoneda", "IdMoneda", "idMoneda"),
            NombreMoneda = GetNullableString(
                data,
                "nombremoneda",
                "NombreMoneda",
                "nombreMoneda",
                "moneda",
                "Moneda"),
            IdEmpleado = GetInt(data, "idempleado", "IdEmpleado", "idEmpleado"),
            NombreEmpleado = GetNullableString(
                data,
                "nombreempleado",
                "NombreEmpleado",
                "nombreEmpleado",
                "empleado",
                "Empleado",
                "nombreempleadocj",
                "NombreEmpleadoCJ",
                "nombreEmpleadoCJ"),
            NombreBanco = GetNullableString(
                data,
                "nombrebanco",
                "NombreBanco",
                "nombreBanco",
                "banco",
                "Banco"),
            IdEstado = GetInt(data, "idestado", "IdEstado", "idEstado"),
            NombreEstado = GetNullableString(
                data,
                "nombreestado",
                "NombreEstado",
                "nombreEstado",
                "estado",
                "Estado"),
            Comentario = GetNullableString(data, "comentario", "Comentario"),
            Ruta = GetNullableString(data, "ruta", "Ruta"),
            FechaCreacion = GetNullableDate(data, "fecha_creacion", "FechaCreacion", "fechaCreacion"),
            FechaModificacion = GetNullableDate(data, "fecha_modificacion", "FechaModificacion", "fechaModificacion")
        };
    }

    private static int GetInt(IDictionary<string, object> data, params string[] keys)
    {
        foreach (var key in keys)
        {
            if (data.TryGetValue(key, out var value) && value is not null && value != DBNull.Value)
            {
                return Convert.ToInt32(value, CultureInfo.InvariantCulture);
            }
        }

        return 0;
    }

    private static decimal GetDecimal(IDictionary<string, object> data, params string[] keys)
    {
        foreach (var key in keys)
        {
            if (data.TryGetValue(key, out var value) && value is not null && value != DBNull.Value)
            {
                return Convert.ToDecimal(value, CultureInfo.InvariantCulture);
            }
        }

        return 0m;
    }

    private static DateTime GetDate(IDictionary<string, object> data, params string[] keys)
    {
        return GetNullableDate(data, keys) ?? DateTime.MinValue;
    }

    private static DateTime? GetNullableDate(IDictionary<string, object> data, params string[] keys)
    {
        foreach (var key in keys)
        {
            if (data.TryGetValue(key, out var value) && value is not null && value != DBNull.Value)
            {
                return Convert.ToDateTime(value, CultureInfo.InvariantCulture);
            }
        }

        return null;
    }

    private static string GetString(IDictionary<string, object> data, params string[] keys)
    {
        return GetNullableString(data, keys) ?? string.Empty;
    }

    private static string? GetNullableString(IDictionary<string, object> data, params string[] keys)
    {
        foreach (var key in keys)
        {
            if (data.TryGetValue(key, out var value) && value is not null && value != DBNull.Value)
            {
                return Convert.ToString(value, CultureInfo.InvariantCulture);
            }
        }

        return null;
    }

    private SqlConnection BuildConnection() => _sqlCommandFactory.CreateConnection();

    private sealed class ChequeEmpleadoSpResult
    {
        public int Resultado { get; set; }
        public string Mensaje { get; set; } = string.Empty;
        public int? IdCheque { get; set; }
    }
}
