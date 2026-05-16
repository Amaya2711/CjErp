using System.Data;
using System.Collections.Concurrent;
using CjERP.Application.DTOs;
using CjERP.Application.Interfaces.Services;
using Dapper;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;

namespace CjERP.Infrastructure.Services;

public class LogisticaSuministroService : ILogisticaSuministroService
{
    private const string BuscarSp = "dbo.sp_SuministroProvisional_Listar";
    private const string InsertarSp = "dbo.sp_SuministroProvisional_Insertar";
    private const string ActualizarSp = "dbo.sp_SuministroProvisional_Actualizar";
    private static readonly ConcurrentDictionary<string, HashSet<string>> ProcedureParameterCache = new(StringComparer.OrdinalIgnoreCase);

    private readonly IConfiguration _configuration;

    public LogisticaSuministroService(IConfiguration configuration)
    {
        _configuration = configuration;
    }

    public async Task<IEnumerable<LogisticaSuministroDto>> BuscarAsync(
        LogisticaSuministroBuscarRequestDto request,
        CancellationToken cancellationToken = default)
    {
        using var connection = BuildConnection();
        var parameters = await BuildBuscarParametersAsync(connection, request, cancellationToken);
        var rows = await connection.QueryAsync(
            new CommandDefinition(
                BuscarSp,
                parameters,
                commandType: CommandType.StoredProcedure,
                cancellationToken: cancellationToken));

        return rows.Select(MapRowToDto).ToList();
    }

    public async Task<int> InsertarAsync(
        LogisticaSuministroInsertRequestDto request,
        CancellationToken cancellationToken = default)
    {
        using var connection = BuildConnection();
        var parameters = await BuildUpsertParametersAsync(
            connection,
            InsertarSp,
            request.IdCliente,
            request.IdProyecto,
            request.IdSite,
            request.Correlativo,
            request.TipoTrabajo,
            request.Ot,
            request.IdTarea,
            request.FechaInicio,
            request.IdAprobador,
            request.Comentario,
            request.Monto,
            request.IdMoneda,
            request.ImagenUrl,
            request.ImagenPath,
            cancellationToken);
        var result = await connection.ExecuteScalarAsync<object?>(
            new CommandDefinition(
                InsertarSp,
                parameters,
                commandType: CommandType.StoredProcedure,
                cancellationToken: cancellationToken));

        return TryConvertToInt(result);
    }

    public async Task ActualizarAsync(
        LogisticaSuministroUpdateRequestDto request,
        CancellationToken cancellationToken = default)
    {
        using var connection = BuildConnection();
        var parameters = await BuildUpsertParametersAsync(
            connection,
            ActualizarSp,
            request.IdCliente,
            request.IdProyecto,
            request.IdSite,
            request.Correlativo,
            request.TipoTrabajo,
            request.Ot,
            request.IdTarea,
            request.FechaInicio,
            request.IdAprobador,
            request.Comentario,
            request.Monto,
            request.IdMoneda,
            request.ImagenUrl,
            request.ImagenPath,
            cancellationToken);
        await connection.ExecuteAsync(
            new CommandDefinition(
                ActualizarSp,
                parameters,
                commandType: CommandType.StoredProcedure,
                cancellationToken: cancellationToken));
    }

    private SqlConnection BuildConnection()
    {
        return new SqlConnection(_configuration.GetConnectionString("DefaultConnection"));
    }

    private static async Task<DynamicParameters> BuildBuscarParametersAsync(
        SqlConnection connection,
        LogisticaSuministroBuscarRequestDto request,
        CancellationToken cancellationToken)
    {
        var parameters = new DynamicParameters();
        var availableParameters = await GetStoredProcedureParametersAsync(connection, BuscarSp, cancellationToken);

        if (availableParameters.Contains("@idcliente"))
        {
            parameters.Add("@idcliente", request.IdCliente, DbType.Int32);
        }

        if (availableParameters.Contains("@IdProvisional"))
        {
            parameters.Add("@IdProvisional", request.IdProvisional, DbType.Int64);
        }

        if (availableParameters.Contains("@idproyecto"))
        {
            parameters.Add("@idproyecto", request.IdProyecto, DbType.Int32);
        }

        return parameters;
    }

    private static async Task<DynamicParameters> BuildUpsertParametersAsync(
        SqlConnection connection,
        string procedureName,
        int idCliente,
        int idProyecto,
        string idSite,
        int? correlativo,
        string? tipoTrabajo,
        string? ot,
        int? idTarea,
        DateTime? fechaInicio,
        int? idAprobador,
        string? comentario,
        decimal? monto,
        int? idMoneda,
        string? imagenUrl,
        string? imagenPath,
        CancellationToken cancellationToken)
    {
        var parameters = new DynamicParameters();
        var availableParameters = await GetStoredProcedureParametersAsync(connection, procedureName, cancellationToken);

        if (availableParameters.Contains("@idcliente"))
        {
            parameters.Add("@idcliente", idCliente, DbType.Int32);
        }

        if (availableParameters.Contains("@idproyecto"))
        {
            parameters.Add("@idproyecto", idProyecto, DbType.Int32);
        }

        if (availableParameters.Contains("@idsite"))
        {
            parameters.Add("@idsite", NullIfWhiteSpace(idSite), DbType.String);
        }

        if (availableParameters.Contains("@correlativo"))
        {
            parameters.Add("@correlativo", correlativo, DbType.Int32);
        }

        if (availableParameters.Contains("@tipo_trabajo"))
        {
            parameters.Add("@tipo_trabajo", NullIfWhiteSpace(tipoTrabajo), DbType.String);
        }

        await AddParameterIfExistsAsync(
            availableParameters,
            ["@ot", "@OT"],
            NullIfWhiteSpace(ot),
            DbType.String,
            parameters);

        await AddParameterIfExistsAsync(
            availableParameters,
            ["@idtarea", "@id_tarea", "@IdTarea"],
            idTarea,
            DbType.Int32,
            parameters);

        await AddParameterIfExistsAsync(
            availableParameters,
            ["@fecha_inicio", "@fechainicio", "@fechaInicio"],
            fechaInicio,
            DbType.DateTime,
            parameters);

        await AddParameterIfExistsAsync(
            availableParameters,
            ["@idaprobador", "@id_aprobador", "@IdAprobador"],
            idAprobador,
            DbType.Int32,
            parameters);

        await AddParameterIfExistsAsync(
            availableParameters,
            ["@comentario", "@Comentario"],
            NullIfWhiteSpace(comentario),
            DbType.String,
            parameters);

        await AddParameterIfExistsAsync(
            availableParameters,
            ["@monto", "@Monto"],
            monto,
            DbType.Decimal,
            parameters);

        await AddParameterIfExistsAsync(
            availableParameters,
            ["@idmoneda", "@id_moneda", "@IdMoneda"],
            idMoneda,
            DbType.Int32,
            parameters);

        await AddParameterIfExistsAsync(
            availableParameters,
            ["@imagenurl", "@imagen_url", "@img_url", "@ImgFactura", "@ImgSustentoUrl"],
            NullIfWhiteSpace(imagenUrl),
            DbType.String,
            parameters);

        await AddParameterIfExistsAsync(
            availableParameters,
            ["@imagenpath", "@imagen_path", "@ruta_imagen", "@img_factura", "@RutaFactura", "@ImgSustento"],
            NullIfWhiteSpace(imagenPath),
            DbType.String,
            parameters);

        return parameters;
    }

    private static async Task AddParameterIfExistsAsync(
        HashSet<string> availableParameters,
        string[] candidateNames,
        object? value,
        DbType dbType,
        DynamicParameters parameters)
    {
        foreach (var candidateName in candidateNames)
        {
            if (!availableParameters.Contains(candidateName))
            {
                continue;
            }

            parameters.Add(candidateName, value, dbType);
            return;
        }
    }

    private static async Task<HashSet<string>> GetStoredProcedureParametersAsync(
        SqlConnection connection,
        string procedureName,
        CancellationToken cancellationToken)
    {
        const string sql = """
        SELECT p.name
        FROM sys.parameters p
        INNER JOIN sys.objects o
            ON p.object_id = o.object_id
        WHERE o.object_id = OBJECT_ID(@ProcedureName);
        """;

        if (ProcedureParameterCache.TryGetValue(procedureName, out var cached))
        {
            return cached;
        }

        var result = await connection.QueryAsync<string>(
            new CommandDefinition(
                sql,
                new
                {
                    ProcedureName = procedureName
                },
                cancellationToken: cancellationToken));

        var parameters = new HashSet<string>(result, StringComparer.OrdinalIgnoreCase);
        ProcedureParameterCache[procedureName] = parameters;
        return parameters;
    }

    private static string? NullIfWhiteSpace(string? value)
    {
        return string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    }

    private static int TryConvertToInt(object? value)
    {
        if (value is null)
        {
            return 0;
        }

        return int.TryParse(Convert.ToString(value), out var parsed) ? parsed : 0;
    }

    private static LogisticaSuministroDto MapRowToDto(dynamic row)
    {
        var values = (IDictionary<string, object?>)row;

        return new LogisticaSuministroDto
        {
            IdSuministro = GetNullableInt(values, "IdSuministro", "idSuministro"),
            IdSuministroProvisional = GetNullableInt(values, "IdSuministroProvisional", "idSuministroProvisional", "IdProvisional", "idProvisional"),
            IdCliente = GetNullableInt(values, "IdCliente", "idCliente", "idcliente"),
            NombreCliente = GetNullableString(values, "NombreCliente", "nombreCliente", "nombrecliente"),
            IdProyecto = GetNullableInt(values, "IdProyecto", "idProyecto", "idproyecto"),
            NombreProyecto = GetNullableString(values, "NombreProyecto", "nombreProyecto", "nombreproyecto"),
            IdSite = GetNullableString(values, "IdSite", "idSite", "idsite"),
            NombreSite = GetNullableString(values, "NombreSite", "nombreSite", "nombresite"),
            Correlativo = GetNullableInt(values, "Correlativo", "correlativo"),
            TipoTrabajo = GetNullableString(values, "TipoTrabajo", "tipoTrabajo", "tipo_trabajo"),
            Ot = GetNullableString(values, "Ot", "ot", "OT"),
            IdTarea = GetNullableInt(values, "IdTarea", "idTarea", "idtarea", "TareaId", "tareaId", "Id_Tarea", "id_tarea"),
            Tarea = GetNullableString(values, "Tarea", "tarea", "NomTarea", "nomTarea", "DescTarea", "descTarea", "ValorIniTarea", "valorIniTarea", "valorini_tarea"),
            FechaInicio = GetNullableDateTime(values, "FechaInicio", "fechaInicio", "fechainicio"),
            IdAprobador = GetNullableInt(values, "IdAprobador", "idAprobador"),
            Aprobador = GetNullableString(values, "Aprobador", "aprobador", "NombreEmpleado", "nombreempleado"),
            Comentario = GetNullableString(values, "Comentario", "comentario"),
            Monto = GetNullableDecimal(values, "Monto", "monto"),
            IdMoneda = GetNullableInt(values, "IdMoneda", "idMoneda"),
            Moneda = GetNullableString(values, "Moneda", "moneda", "valorini", "ValorIni"),
            ImagenUrl = GetNullableString(values, "ImagenUrl", "imagenUrl", "ImgSustentoUrl", "imgSustentoUrl"),
            ImagenPath = GetNullableString(values, "ImagenPath", "imagenPath", "ImgSustento", "imgSustento"),
            EsActivo = GetNullableBool(values, "EsActivo", "esActivo"),
            UsuarioCreacion = GetNullableString(values, "UsuarioCreacion", "usuarioCreacion"),
            FechaCreacion = GetNullableDateTime(values, "FechaCreacion", "fechaCreacion"),
            UsuarioActualizacion = GetNullableString(values, "UsuarioActualizacion", "usuarioActualizacion"),
            FechaActualizacion = GetNullableDateTime(values, "FechaActualizacion", "fechaActualizacion"),
            UsuarioEliminacion = GetNullableString(values, "UsuarioEliminacion", "usuarioEliminacion"),
            FechaEliminacion = GetNullableDateTime(values, "FechaEliminacion", "fechaEliminacion"),
        };
    }

    private static object? GetValue(IDictionary<string, object?> values, params string[] keys)
    {
        foreach (var key in keys)
        {
            if (values.TryGetValue(key, out var value) && value is not null && value != DBNull.Value)
            {
                return value;
            }
        }

        return null;
    }

    private static string? GetNullableString(IDictionary<string, object?> values, params string[] keys)
    {
        return Convert.ToString(GetValue(values, keys))?.Trim();
    }

    private static int? GetNullableInt(IDictionary<string, object?> values, params string[] keys)
    {
        var value = GetValue(values, keys);
        if (value is null)
        {
            return null;
        }

        return int.TryParse(Convert.ToString(value), out var parsed) ? parsed : null;
    }

    private static decimal? GetNullableDecimal(IDictionary<string, object?> values, params string[] keys)
    {
        var value = GetValue(values, keys);
        if (value is null)
        {
            return null;
        }

        return decimal.TryParse(Convert.ToString(value), out var parsed) ? parsed : null;
    }

    private static DateTime? GetNullableDateTime(IDictionary<string, object?> values, params string[] keys)
    {
        var value = GetValue(values, keys);
        if (value is null)
        {
            return null;
        }

        return DateTime.TryParse(Convert.ToString(value), out var parsed) ? parsed : null;
    }

    private static bool? GetNullableBool(IDictionary<string, object?> values, params string[] keys)
    {
        var value = GetValue(values, keys);
        if (value is null)
        {
            return null;
        }

        return bool.TryParse(Convert.ToString(value), out var parsed) ? parsed : null;
    }
}
