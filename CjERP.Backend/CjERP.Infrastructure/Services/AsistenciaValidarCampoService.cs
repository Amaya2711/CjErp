using System.Data;
using System.Globalization;
using System.Text;
using CjERP.Application.DTOs;
using CjERP.Application.Interfaces;
using CjERP.Application.Interfaces.Services;
using Dapper;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;

namespace CjERP.Infrastructure.Services;

public class AsistenciaValidarCampoService : IAsistenciaValidarCampoService
{
    private const string ListarSp = "dbo.sp_Asistencia_ValidarCampo";
    private const string TablaAsistencia = "Asistencia";

    private readonly IConfiguration _configuration;
    private readonly IAuditoriaCambiosService _auditoriaCambiosService;
    private readonly ILookupService _lookupService;

    public AsistenciaValidarCampoService(
        IConfiguration configuration,
        IAuditoriaCambiosService auditoriaCambiosService,
        ILookupService lookupService)
    {
        _configuration = configuration;
        _auditoriaCambiosService = auditoriaCambiosService;
        _lookupService = lookupService;
    }

    public async Task<AsistenciaValidarCampoListaDto> ListarAsync(
        AsistenciaValidarCampoFiltroDto filtro,
        CancellationToken cancellationToken = default)
    {
        using var connection = BuildConnection();
        var rows = (await connection.QueryAsync(
                new CommandDefinition(
                    ListarSp,
                    commandType: CommandType.StoredProcedure,
                    cancellationToken: cancellationToken)))
            .Select(MapRow)
            .ToList();

        var filtered = rows.Where(row => MatchesFilter(row, filtro)).ToList();
        var columns = filtered
            .SelectMany(row => row.Keys)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(static key => key, StringComparer.OrdinalIgnoreCase)
            .ToList();

        return new AsistenciaValidarCampoListaDto
        {
            Columns = columns,
            Rows = filtered
        };
    }

    public async Task<Dictionary<string, object?>?> ObtenerPorClaveAsync(
        AsistenciaValidarCampoClaveDto clave,
        CancellationToken cancellationToken = default)
    {
        var data = await ListarAsync(new AsistenciaValidarCampoFiltroDto(), cancellationToken);
        return data.Rows.FirstOrDefault(row => MatchesKey(row, clave));
    }

    public async Task<AsistenciaValidarCampoOperacionResultadoDto> CrearAsync(
        AsistenciaValidarCampoGuardarDto request,
        CancellationToken cancellationToken = default)
    {
        ValidateGuardarRequest(request, isUpdate: false);

        using var connection = BuildConnection();
        var tableColumns = await GetTableColumnsAsync(connection, cancellationToken);
        var payload = BuildPersistedValues(request, tableColumns);
        payload["FechaAsistencia"] = NormalizeDate(request.FechaAsistencia);

        if (request.IdEmpleado is > 0)
        {
            payload["IdEmpleado"] = request.IdEmpleado.Value;
        }

        var insertableColumns = payload.Keys
            .Where(key => tableColumns.Contains(key))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        if (!insertableColumns.Contains("FechaAsistencia", StringComparer.OrdinalIgnoreCase) ||
            !insertableColumns.Contains("IdEmpleado", StringComparer.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException("No se encontraron las columnas requeridas IdEmpleado y FechaAsistencia en la tabla Asistencia.");
        }

        var sql = $"""
        INSERT INTO dbo.{TablaAsistencia} (
            {string.Join(", ", insertableColumns.Select(Bracket))}
        )
        VALUES (
            {string.Join(", ", insertableColumns.Select(static column => "@" + column))}
        );
        """;

        await connection.ExecuteAsync(new CommandDefinition(sql, payload, cancellationToken: cancellationToken));

        var clave = new AsistenciaValidarCampoClaveDto
        {
            IdEmpleado = request.IdEmpleado,
            FechaAsistencia = request.FechaAsistencia
        };

        var row = await GetCurrentRowAsync(connection, clave, cancellationToken);
        await RegistrarAuditoriaAsync(
            anterior: null,
            actual: row,
            idRegistro: BuildRegistroId(clave),
            usuarioAccion: ResolveUsuarioAccion(request.UsuarioAccion),
            observacion: "Registro inicial de aprobación de campo.",
            cancellationToken);

        return new AsistenciaValidarCampoOperacionResultadoDto
        {
            IdRegistro = BuildRegistroId(clave),
            Row = row
        };
    }

    public async Task<AsistenciaValidarCampoOperacionResultadoDto> ActualizarAsync(
        AsistenciaValidarCampoGuardarDto request,
        CancellationToken cancellationToken = default)
    {
        ValidateGuardarRequest(request, isUpdate: true);

        using var connection = BuildConnection();
        var anterior = await GetCurrentRowAsync(connection, ToClave(request), cancellationToken)
            ?? throw new InvalidOperationException("No se encontró el registro de asistencia a actualizar.");

        var tableColumns = await GetTableColumnsAsync(connection, cancellationToken);
        var payload = BuildPersistedValues(request, tableColumns);

        await UpdateRowAsync(connection, ToClave(request), payload, tableColumns, cancellationToken);

        var actual = await GetCurrentRowAsync(connection, ToClave(request), cancellationToken);
        var idRegistro = BuildRegistroId(ToClave(request));
        await RegistrarAuditoriaAsync(
            anterior,
            actual,
            idRegistro,
            ResolveUsuarioAccion(request.UsuarioAccion),
            "Modificación manual de aprobación de campo.",
            cancellationToken);

        return new AsistenciaValidarCampoOperacionResultadoDto
        {
            IdRegistro = idRegistro,
            Row = actual
        };
    }

    public async Task<AsistenciaValidarCampoOperacionResultadoDto> AprobarIngresoAsync(
        AsistenciaValidarCampoAccionDto request,
        CancellationToken cancellationToken = default)
    {
        ValidateClave(request);
        if (request.IdAprobador is not > 0)
        {
            throw new InvalidOperationException("No se pudo resolver el IdAprobador de la acciÃ³n.");
        }
        using var connection = BuildConnection();
        var parameters = new DynamicParameters();
        parameters.Add("@idempleado", request.IdEmpleado, DbType.Int32);
        parameters.Add("@Fechaasistencia", NormalizeDate(request.FechaAsistencia!), DbType.String);
        parameters.Add("@IdAprobador", request.IdAprobador.Value, DbType.Int32);
        // El SP puede requerir otros parámetros, agregar si es necesario
        parameters.Add("@Usuario", ResolveUsuarioAccion(request.UsuarioAccion), DbType.String);
        await connection.ExecuteAsync(new CommandDefinition(
            "sp_Asistencia_AprobarIngreso",
            parameters,
            commandType: CommandType.StoredProcedure,
            cancellationToken: cancellationToken));

        // Obtener el registro actualizado para devolverlo
        var row = await GetCurrentRowAsync(connection, request, cancellationToken);
        return new AsistenciaValidarCampoOperacionResultadoDto
        {
            IdRegistro = BuildRegistroId(request),
            Row = row
        };
    }

    public async Task<AsistenciaValidarCampoOperacionResultadoDto> AprobarSalidaAsync(
        AsistenciaValidarCampoAccionDto request,
        CancellationToken cancellationToken = default)
    {
        ValidateClave(request);
        if (request.IdAprobador is not > 0)
        {
            throw new InvalidOperationException("No se pudo resolver el IdAprobador de la acciÃ³n.");
        }
        using var connection = BuildConnection();
        var parameters = new DynamicParameters();
        parameters.Add("@idempleado", request.IdEmpleado, DbType.Int32);
        parameters.Add("@Fechaasistencia", NormalizeDate(request.FechaAsistencia!), DbType.String);
        parameters.Add("@IdAprobador", request.IdAprobador.Value, DbType.Int32);
        await connection.ExecuteAsync(new CommandDefinition(
            "sp_Asistencia_AprobarSalida",
            parameters,
            commandType: CommandType.StoredProcedure,
            cancellationToken: cancellationToken));

        var row = await GetCurrentRowAsync(connection, request, cancellationToken);
        return new AsistenciaValidarCampoOperacionResultadoDto
        {
            IdRegistro = BuildRegistroId(request),
            Row = row
        };
    }

    public async Task<AsistenciaValidarCampoOperacionResultadoDto> RechazarAsync(
        AsistenciaValidarCampoAccionDto request,
        CancellationToken cancellationToken = default)
    {
        ValidateClave(request);
        if (request.IdAprobador is not > 0)
        {
            throw new InvalidOperationException("No se pudo resolver el IdAprobador de la acciÃ³n.");
        }
        if (string.IsNullOrWhiteSpace(request.Observacion))
        {
            throw new InvalidOperationException("Debe ingresar un motivo de rechazo.");
        }
        using var connection = BuildConnection();
        var parameters = new DynamicParameters();
        parameters.Add("@idempleado", request.IdEmpleado, DbType.Int32);
        parameters.Add("@Fechaasistencia", NormalizeDate(request.FechaAsistencia!), DbType.String);
        parameters.Add("@IdAprobador", request.IdAprobador.Value, DbType.Int32);
        parameters.Add("@Motivo", request.Observacion.Trim(), DbType.String);
        parameters.Add("@Usuario", ResolveUsuarioAccion(request.UsuarioAccion), DbType.String);
        await connection.ExecuteAsync(new CommandDefinition(
            "sp_Asistencia_RechazarDocumento",
            parameters,
            commandType: CommandType.StoredProcedure,
            cancellationToken: cancellationToken));

        var row = await GetCurrentRowAsync(connection, request, cancellationToken);
        return new AsistenciaValidarCampoOperacionResultadoDto
        {
            IdRegistro = BuildRegistroId(request),
            Row = row
        };
    }

    private async Task<AsistenciaValidarCampoOperacionResultadoDto> EjecutarAccionAsync(
        string accion,
        AsistenciaValidarCampoAccionDto request,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Observacion))
        {
            throw new InvalidOperationException("Debe ingresar una observación.");
        }

        ValidateClave(request);

        using var connection = BuildConnection();
        var anterior = await GetCurrentRowAsync(connection, request, cancellationToken)
            ?? throw new InvalidOperationException("No se encontró el registro de asistencia.");

        var tableColumns = await GetTableColumnsAsync(connection, cancellationToken);
        var payload = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);

        var commentColumn = FindFirstExistingColumn(
            tableColumns,
            "Observacion",
            "Comentario",
            "ComentarioAprobacion",
            "ComentarioValidacion");

        if (!string.IsNullOrWhiteSpace(commentColumn))
        {
            payload[commentColumn] = request.Observacion.Trim();
        }

        var stateColumn = FindFirstExistingColumn(tableColumns, "IdEstado", "Estado", "EstadoMarcacion");
        var stateValue = await ResolveActionStateValueAsync(accion, stateColumn, cancellationToken);
        if (!string.IsNullOrWhiteSpace(stateColumn) && stateValue is not null)
        {
            payload[stateColumn] = stateValue;
        }

        var usuarioColumn = FindFirstExistingColumn(tableColumns, "UsuarioModificacion", "UsuarioActualizacion", "Usuario");
        if (!string.IsNullOrWhiteSpace(usuarioColumn))
        {
            payload[usuarioColumn] = ResolveUsuarioAccion(request.UsuarioAccion);
        }

        var fechaColumn = FindFirstExistingColumn(tableColumns, "FechaModificacion", "FechaActualizacion");
        if (!string.IsNullOrWhiteSpace(fechaColumn))
        {
            payload[fechaColumn] = DateTime.Now;
        }

        if (payload.Count == 0)
        {
            throw new InvalidOperationException("La tabla Asistencia no contiene columnas editables compatibles para registrar la acción.");
        }

        await UpdateRowAsync(connection, request, payload, tableColumns, cancellationToken);

        var actual = await GetCurrentRowAsync(connection, request, cancellationToken);
        var idRegistro = BuildRegistroId(request);
        await RegistrarAuditoriaAsync(
            anterior,
            actual,
            idRegistro,
            ResolveUsuarioAccion(request.UsuarioAccion),
            $"{accion} desde el módulo Aprobar Campo.",
            cancellationToken);

        return new AsistenciaValidarCampoOperacionResultadoDto
        {
            IdRegistro = idRegistro,
            Row = actual
        };
    }

    private async Task UpdateRowAsync(
        SqlConnection connection,
        AsistenciaValidarCampoClaveDto clave,
        Dictionary<string, object?> payload,
        HashSet<string> tableColumns,
        CancellationToken cancellationToken)
    {
        var updatableColumns = payload.Keys
            .Where(key => tableColumns.Contains(key))
            .Where(key => !string.Equals(key, "IdAsistencia", StringComparison.OrdinalIgnoreCase))
            .Where(key => !string.Equals(key, "IdEmpleado", StringComparison.OrdinalIgnoreCase))
            .Where(key => !string.Equals(key, "FechaAsistencia", StringComparison.OrdinalIgnoreCase))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        if (updatableColumns.Count == 0)
        {
            throw new InvalidOperationException("No se enviaron campos válidos para actualizar.");
        }

        var parameters = new DynamicParameters();
        foreach (var column in updatableColumns)
        {
            parameters.Add("@" + column, payload[column]);
        }

        var whereClause = BuildWhereClause(parameters, clave);
        var sql = $"""
        UPDATE dbo.{TablaAsistencia}
        SET {string.Join(", ", updatableColumns.Select(static column => $"{Bracket(column)} = @{column}"))}
        WHERE {whereClause};
        """;

        var affected = await connection.ExecuteAsync(
            new CommandDefinition(sql, parameters, cancellationToken: cancellationToken));

        if (affected == 0)
        {
            throw new InvalidOperationException("No se encontró el registro de asistencia a actualizar.");
        }
    }

    private async Task<Dictionary<string, object?>?> GetCurrentRowAsync(
        SqlConnection connection,
        AsistenciaValidarCampoClaveDto clave,
        CancellationToken cancellationToken)
    {
        var tableColumns = await GetTableColumnsAsync(connection, cancellationToken);
        if (tableColumns.Count == 0)
        {
            return null;
        }

        var parameters = new DynamicParameters();
        var whereClause = BuildWhereClause(parameters, clave);
        var sql = $"""
        SELECT {string.Join(", ", tableColumns.OrderBy(static x => x, StringComparer.OrdinalIgnoreCase).Select(Bracket))}
        FROM dbo.{TablaAsistencia}
        WHERE {whereClause};
        """;

        var row = await connection.QueryFirstOrDefaultAsync(
            new CommandDefinition(sql, parameters, cancellationToken: cancellationToken));

        return row is null ? null : MapRow(row);
    }

    private async Task<HashSet<string>> GetTableColumnsAsync(
        SqlConnection connection,
        CancellationToken cancellationToken)
    {
        const string sql = """
        SELECT c.name
        FROM sys.columns c
        INNER JOIN sys.tables t ON t.object_id = c.object_id
        WHERE t.name = @TableName;
        """;

        var columns = await connection.QueryAsync<string>(
            new CommandDefinition(sql, new { TableName = TablaAsistencia }, cancellationToken: cancellationToken));

        return columns.ToHashSet(StringComparer.OrdinalIgnoreCase);
    }

    private static Dictionary<string, object?> BuildPersistedValues(
        AsistenciaValidarCampoGuardarDto request,
        HashSet<string> tableColumns)
    {
        var values = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);

        AddIfPresent(values, tableColumns, request.IdAsistencia, "IdAsistencia", "Id");
        AddIfPresent(values, tableColumns, request.IdEmpleado, "IdEmpleado");
        AddIfPresent(values, tableColumns, request.Responsable, "Responsable");
        AddIfPresent(values, tableColumns, request.Empleado, "Empleado", "NombreEmpleado");
        AddIfPresent(values, tableColumns, request.Estado, "Estado");
        AddIfPresent(values, tableColumns, ParseNullableDateTime(request.Ingreso), "Hora", "Ingreso", "HoraEntrada");
        AddIfPresent(values, tableColumns, ParseNullableDateTime(request.Salida), "HoraSalida", "Salida");
        AddIfPresent(values, tableColumns, request.Observacion, "Observacion", "Comentario");
        AddIfPresent(values, tableColumns, request.Latitud, "Latitud");
        AddIfPresent(values, tableColumns, request.Longitud, "Longitud");
        AddIfPresent(values, tableColumns, request.LatitudSalida, "LatitudSalida");
        AddIfPresent(values, tableColumns, request.LongitudSalida, "LongitudSalida");
        AddIfPresent(values, tableColumns, request.Imagen, "Imagen", "imgFactura");
        AddIfPresent(values, tableColumns, request.ImagenSalida, "ImagenSalida", "ImagenSalidaRuta");

        return values;
    }

    private static void AddIfPresent(
        IDictionary<string, object?> target,
        HashSet<string> tableColumns,
        object? value,
        params string[] candidateColumns)
    {
        if (value is null)
        {
            return;
        }

        var column = FindFirstExistingColumn(tableColumns, candidateColumns);
        if (string.IsNullOrWhiteSpace(column))
        {
            return;
        }

        if (value is string stringValue)
        {
            target[column] = string.IsNullOrWhiteSpace(stringValue) ? null : stringValue.Trim();
            return;
        }

        target[column] = value;
    }

    private static string? FindFirstExistingColumn(HashSet<string> tableColumns, params string[] candidateColumns)
    {
        return candidateColumns.FirstOrDefault(tableColumns.Contains);
    }

    private async Task<object?> ResolveActionStateValueAsync(
        string accion,
        string? stateColumn,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(stateColumn))
        {
            return null;
        }

        if (!string.Equals(stateColumn, "IdEstado", StringComparison.OrdinalIgnoreCase))
        {
            return accion;
        }

        var constantes = (await _lookupService.ListarConstantesPorCampoAsync("estado_asistencia")).ToList();
        if (constantes.Count == 0)
        {
            return null;
        }

        var normalizedAction = NormalizeText(accion);
        var matched = constantes.FirstOrDefault(item =>
        {
            var text = NormalizeText($"{item.Codigo} {item.Descripcion} {item.Valor}");
            if (normalizedAction.Contains("rechaz"))
            {
                return text.Contains("rechaz") || text.Contains("observ");
            }

            if (normalizedAction.Contains("salida"))
            {
                return text.Contains("aprob") && text.Contains("salida");
            }

            if (normalizedAction.Contains("ingreso"))
            {
                return text.Contains("aprob") && (text.Contains("ingreso") || text.Contains("entrada"));
            }

            return false;
        });

        matched ??= constantes.FirstOrDefault(item =>
        {
            var text = NormalizeText($"{item.Codigo} {item.Descripcion} {item.Valor}");
            return normalizedAction.Contains("rechaz")
                ? text.Contains("rechaz") || text.Contains("observ")
                : text.Contains("aprob");
        });

        if (matched is null)
        {
            return null;
        }

        if (int.TryParse(matched.Codigo, NumberStyles.Any, CultureInfo.InvariantCulture, out var numericCode))
        {
            return numericCode;
        }

        if (int.TryParse(matched.Valor, NumberStyles.Any, CultureInfo.InvariantCulture, out numericCode))
        {
            return numericCode;
        }

        return matched.Descripcion;
    }

    private async Task RegistrarAuditoriaAsync(
        Dictionary<string, object?>? anterior,
        Dictionary<string, object?>? actual,
        string idRegistro,
        string usuarioAccion,
        string observacion,
        CancellationToken cancellationToken)
    {
        var campos = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        if (anterior is not null)
        {
            foreach (var key in anterior.Keys)
            {
                campos.Add(key);
            }
        }

        if (actual is not null)
        {
            foreach (var key in actual.Keys)
            {
                campos.Add(key);
            }
        }

        var auditoria = new List<AuditoriaCambioDto>();

        foreach (var campo in campos)
        {
            object? valorAnterior = null;
            object? valorNuevo = null;
            anterior?.TryGetValue(campo, out valorAnterior);
            actual?.TryGetValue(campo, out valorNuevo);

            var anteriorTexto = ToAuditValue(valorAnterior);
            var nuevoTexto = ToAuditValue(valorNuevo);

            if (string.Equals(anteriorTexto, nuevoTexto, StringComparison.Ordinal))
            {
                continue;
            }

            auditoria.Add(new AuditoriaCambioDto
            {
                Modulo = "Operaciones",
                Entidad = "AprobarCampo",
                IdRegistro = idRegistro,
                Accion = anterior is null ? "INSERT" : "UPDATE",
                Seccion = "Asistencia",
                Campo = FromClientKey(campo),
                ValorAnterior = anteriorTexto,
                ValorNuevo = nuevoTexto,
                UsuarioAccion = usuarioAccion,
                Observacion = observacion
            });
        }

        if (auditoria.Count > 0)
        {
            await _auditoriaCambiosService.RegistrarLoteAsync(auditoria, cancellationToken);
        }
    }

    private static bool MatchesFilter(
        IReadOnlyDictionary<string, object?> row,
        AsistenciaValidarCampoFiltroDto filtro)
    {
        if (!MatchesContains(row, filtro.Responsable, "responsable"))
        {
            return false;
        }

        if (!MatchesContains(row, filtro.Empleado, "empleado", "nombreEmpleado"))
        {
            return false;
        }

        if (!MatchesContains(row, filtro.Estado, "estado"))
        {
            return false;
        }

        if (!MatchesDateRange(row, filtro.FechaDesde, filtro.FechaHasta, "fechaAsistencia", "fecha"))
        {
            return false;
        }

        if (string.IsNullOrWhiteSpace(filtro.Search))
        {
            return true;
        }

        var search = NormalizeText(filtro.Search);
        return row.Values
            .Select(ToAuditValue)
            .Any(value => NormalizeText(value).Contains(search, StringComparison.Ordinal));
    }

    private static bool MatchesContains(
        IReadOnlyDictionary<string, object?> row,
        string? filter,
        params string[] keys)
    {
        if (string.IsNullOrWhiteSpace(filter))
        {
            return true;
        }

        var normalized = NormalizeText(filter);
        foreach (var key in keys)
        {
            if (!row.TryGetValue(key, out var value))
            {
                continue;
            }

            if (NormalizeText(ToAuditValue(value)).Contains(normalized, StringComparison.Ordinal))
            {
                return true;
            }
        }

        return false;
    }

    private static bool MatchesDateRange(
        IReadOnlyDictionary<string, object?> row,
        string? desde,
        string? hasta,
        params string[] keys)
    {
        if (string.IsNullOrWhiteSpace(desde) && string.IsNullOrWhiteSpace(hasta))
        {
            return true;
        }

        var fecha = keys
            .Select(key => row.TryGetValue(key, out var value) ? ParseNullableDateTime(ToAuditValue(value)) : null)
            .FirstOrDefault(value => value.HasValue);

        if (!fecha.HasValue)
        {
            return false;
        }

        var fechaDate = fecha.Value.Date;
        var fechaDesde = ParseNullableDateTime(desde)?.Date;
        var fechaHasta = ParseNullableDateTime(hasta)?.Date;

        if (fechaDesde.HasValue && fechaDate < fechaDesde.Value)
        {
            return false;
        }

        if (fechaHasta.HasValue && fechaDate > fechaHasta.Value)
        {
            return false;
        }

        return true;
    }

    private static bool MatchesKey(
        IReadOnlyDictionary<string, object?> row,
        AsistenciaValidarCampoClaveDto clave)
    {
        if (clave.IdAsistencia is > 0 &&
            TryGetInt(row, "idAsistencia", "id") is int idAsistencia &&
            idAsistencia == clave.IdAsistencia.Value)
        {
            return true;
        }

        if (clave.IdEmpleado is not > 0 || string.IsNullOrWhiteSpace(clave.FechaAsistencia))
        {
            return false;
        }

        var idEmpleado = TryGetInt(row, "idEmpleado");
        var fecha = TryGetDate(row, "fechaAsistencia", "fecha");

        return idEmpleado == clave.IdEmpleado &&
               fecha?.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) == NormalizeDate(clave.FechaAsistencia);
    }

    private static int? TryGetInt(IReadOnlyDictionary<string, object?> row, params string[] keys)
    {
        foreach (var key in keys)
        {
            if (!row.TryGetValue(key, out var value) || value is null)
            {
                continue;
            }

            if (int.TryParse(ToAuditValue(value), NumberStyles.Any, CultureInfo.InvariantCulture, out var parsed))
            {
                return parsed;
            }
        }

        return null;
    }

    private static DateTime? TryGetDate(IReadOnlyDictionary<string, object?> row, params string[] keys)
    {
        foreach (var key in keys)
        {
            if (!row.TryGetValue(key, out var value) || value is null)
            {
                continue;
            }

            var parsed = ParseNullableDateTime(ToAuditValue(value));
            if (parsed.HasValue)
            {
                return parsed;
            }
        }

        return null;
    }

    private static Dictionary<string, object?> MapRow(dynamic row)
    {
        var values = (IDictionary<string, object?>)row;
        var result = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);

        foreach (var item in values)
        {
            result[ToClientKey(item.Key)] = NormalizeValue(item.Value);
        }

        return result;
    }

    private static object? NormalizeValue(object? value)
    {
        if (value is null or DBNull)
        {
            return null;
        }

        return value switch
        {
            DateTime dateValue => dateValue.ToString("yyyy-MM-dd HH:mm:ss", CultureInfo.InvariantCulture),
            DateTimeOffset offsetValue => offsetValue.ToString("yyyy-MM-dd HH:mm:ss", CultureInfo.InvariantCulture),
            TimeSpan timeValue => timeValue.ToString(),
            _ => value
        };
    }

    private static string ToClientKey(string key)
    {
        if (string.IsNullOrWhiteSpace(key))
        {
            return key;
        }

        return char.ToLowerInvariant(key[0]) + key[1..];
    }

    private static string FromClientKey(string key)
    {
        if (string.IsNullOrWhiteSpace(key))
        {
            return key;
        }

        return char.ToUpperInvariant(key[0]) + key[1..];
    }

    private static string ToAuditValue(object? value)
    {
        if (value is null or DBNull)
        {
            return string.Empty;
        }

        return value switch
        {
            DateTime dateValue => dateValue.ToString("yyyy-MM-dd HH:mm:ss", CultureInfo.InvariantCulture),
            DateTimeOffset offsetValue => offsetValue.ToString("yyyy-MM-dd HH:mm:ss", CultureInfo.InvariantCulture),
            _ => Convert.ToString(value, CultureInfo.InvariantCulture)?.Trim() ?? string.Empty
        };
    }

    private static string NormalizeDate(string value)
    {
        var parsed = ParseNullableDateTime(value)
            ?? throw new InvalidOperationException("FechaAsistencia no tiene un formato válido.");

        return parsed.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
    }

    private static DateTime? ParseNullableDateTime(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        var normalized = value.Trim();
        if (DateTime.TryParse(normalized, CultureInfo.InvariantCulture, DateTimeStyles.AllowWhiteSpaces, out var invariant))
        {
            return invariant;
        }

        if (DateTime.TryParse(normalized, new CultureInfo("es-PE"), DateTimeStyles.AllowWhiteSpaces, out var local))
        {
            return local;
        }

        return null;
    }

    private static string NormalizeText(string? value)
    {
        return (value ?? string.Empty)
            .Normalize(NormalizationForm.FormD)
            .Where(c => CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark)
            .Aggregate(new StringBuilder(), static (builder, ch) => builder.Append(char.ToLowerInvariant(ch)))
            .ToString();
    }

    private static void ValidateGuardarRequest(AsistenciaValidarCampoGuardarDto request, bool isUpdate)
    {
        ArgumentNullException.ThrowIfNull(request);

        if (request.IdEmpleado is not > 0)
        {
            throw new InvalidOperationException("IdEmpleado es obligatorio.");
        }

        if (string.IsNullOrWhiteSpace(request.FechaAsistencia))
        {
            throw new InvalidOperationException("FechaAsistencia es obligatoria.");
        }

        _ = NormalizeDate(request.FechaAsistencia);

        if (isUpdate)
        {
            return;
        }
    }

    private static void ValidateClave(AsistenciaValidarCampoClaveDto clave)
    {
        ArgumentNullException.ThrowIfNull(clave);

        if (clave.IdAsistencia is > 0)
        {
            return;
        }

        if (clave.IdEmpleado is not > 0 || string.IsNullOrWhiteSpace(clave.FechaAsistencia))
        {
            throw new InvalidOperationException("Debe enviar IdAsistencia o la clave compuesta IdEmpleado + FechaAsistencia.");
        }
    }

    private static string BuildWhereClause(DynamicParameters parameters, AsistenciaValidarCampoClaveDto clave)
    {
        ValidateClave(clave);

        if (clave.IdAsistencia is > 0)
        {
            parameters.Add("@IdAsistencia", clave.IdAsistencia.Value, DbType.Int32);
            return "[IdAsistencia] = @IdAsistencia";
        }

        parameters.Add("@IdEmpleado", clave.IdEmpleado!.Value, DbType.Int32);
        parameters.Add("@FechaAsistencia", NormalizeDate(clave.FechaAsistencia!), DbType.String);
        return "CAST([FechaAsistencia] AS date) = @FechaAsistencia AND [IdEmpleado] = @IdEmpleado";
    }

    private static string BuildRegistroId(AsistenciaValidarCampoClaveDto clave)
    {
        if (clave.IdAsistencia is > 0)
        {
            return clave.IdAsistencia.Value.ToString(CultureInfo.InvariantCulture);
        }

        return $"{clave.IdEmpleado}|{NormalizeDate(clave.FechaAsistencia ?? string.Empty)}";
    }

    private static AsistenciaValidarCampoClaveDto ToClave(AsistenciaValidarCampoGuardarDto request)
    {
        return new AsistenciaValidarCampoClaveDto
        {
            IdAsistencia = request.IdAsistencia,
            IdEmpleado = request.IdEmpleado,
            FechaAsistencia = request.FechaAsistencia
        };
    }

    private static string ResolveUsuarioAccion(string? usuario)
    {
        return string.IsNullOrWhiteSpace(usuario) ? "sistema" : usuario.Trim();
    }

    private SqlConnection BuildConnection()
    {
        return new SqlConnection(_configuration.GetConnectionString("DefaultConnection"));
    }

    private static string Bracket(string name) => $"[{name}]";
}
