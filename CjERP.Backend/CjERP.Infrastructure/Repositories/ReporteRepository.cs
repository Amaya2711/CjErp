using System.Data;
using System.Globalization;
using CjERP.Application.DTOs.ReportesWhatsapp;
using CjERP.Application.Interfaces.Repositories;
using Dapper;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;

namespace CjERP.Infrastructure.Repositories;

public sealed class ReporteRepository : IReporteRepository
{
    private const string ReporteAsistenciaSp = "dbo.RptAsistenciaFechas_Wup";
    private const string EmpleadosWupSp = "dbo.sp_EmpleadoCj_Listar_Wup";
    private const string ReporteWhatsappLogTable = "dbo.ReporteWhatsAppLog";

    private readonly string _connectionString;

    public ReporteRepository(IConfiguration configuration)
    {
        _connectionString = configuration.GetConnectionString("DefaultConnection")
            ?? throw new InvalidOperationException("No se encontro la cadena de conexion DefaultConnection.");
    }

    public async Task<ReporteWhatsappConfiguracionDto?> ObtenerConfiguracionAsync(CancellationToken cancellationToken = default)
    {
        const string sql = """
        SELECT TOP 1
            HoraEjecucion,
            CantidadEmpleadosPorBloque,
            DelaySegundosEntreBloques,
            Activo,
            UsuarioModificacion,
            FechaModificacion
        FROM dbo.ReporteWupConfig
        ORDER BY FechaModificacion DESC, HoraEjecucion DESC;
        """;

        await using var connection = CreateConnection();

        var rows = await connection.QueryAsync(
            new CommandDefinition(
                sql,
                cancellationToken: cancellationToken));

        var row = rows.FirstOrDefault();
        if (row is null)
        {
            return null;
        }

        var values = ToDictionary(row);

        return new ReporteWhatsappConfiguracionDto
        {
            HoraEjecucion = GetString(values, "HoraEjecucion", "horaEjecucion", "Hora", "hora"),
            CantidadEmpleadosPorBloque = GetInt(values, "CantidadEmpleadosPorBloque", "cantidadEmpleadosPorBloque", "CantidadBloque", "cantidadBloque") ?? 0,
            DelaySegundosEntreBloques = GetInt(values, "DelaySegundosEntreBloques", "delaySegundosEntreBloques", "DelaySegundos", "delaySegundos") ?? 0,
            Activo = GetBool(values, "Activo", "activo", "EsActivo", "esActivo"),
            UsuarioModificacion = GetString(values, "UsuarioModificacion", "usuarioModificacion"),
            FechaModificacion = GetDateTime(values, "FechaModificacion", "fechaModificacion")
        };
    }

    public async Task ActualizarConfiguracionAsync(ReporteWhatsappConfiguracionUpdateDto request, string usuarioModificacion, CancellationToken cancellationToken = default)
    {
        const string sql = """
        IF OBJECT_ID('dbo.ReporteWupConfig', 'U') IS NOT NULL
        BEGIN
            IF EXISTS (SELECT 1 FROM dbo.ReporteWupConfig)
            BEGIN
                UPDATE dbo.ReporteWupConfig
                SET HoraEjecucion = @HoraEjecucion,
                    CantidadEmpleadosPorBloque = @CantidadEmpleadosPorBloque,
                    DelaySegundosEntreBloques = @DelaySegundosEntreBloques,
                    Activo = @Activo,
                    UsuarioModificacion = @UsuarioModificacion,
                    FechaModificacion = GETDATE();
            END
            ELSE
            BEGIN
                INSERT INTO dbo.ReporteWupConfig
                (
                    HoraEjecucion,
                    CantidadEmpleadosPorBloque,
                    DelaySegundosEntreBloques,
                    Activo,
                    UsuarioModificacion,
                    FechaModificacion
                )
                VALUES
                (
                    @HoraEjecucion,
                    @CantidadEmpleadosPorBloque,
                    @DelaySegundosEntreBloques,
                    @Activo,
                    @UsuarioModificacion,
                    GETDATE()
                );
            END;
            RETURN;
        END;

        THROW 50000, 'No existe la tabla dbo.ReporteWupConfig para la configuracion de Reporte WUP.', 1;
        """;

        await using var connection = CreateConnection();
        await connection.ExecuteAsync(
            new CommandDefinition(
                sql,
                new
                {
                    request.HoraEjecucion,
                    request.CantidadEmpleadosPorBloque,
                    request.DelaySegundosEntreBloques,
                    request.Activo,
                    UsuarioModificacion = usuarioModificacion
                },
                cancellationToken: cancellationToken));
    }

    public async Task<IReadOnlyList<ReporteWhatsappEmpleadoDto>> ObtenerEmpleadosDestinoAsync(CancellationToken cancellationToken = default)
    {
        await using var connection = CreateConnection();

        var rows = await connection.QueryAsync(
            new CommandDefinition(
                EmpleadosWupSp,
                commandType: CommandType.StoredProcedure,
                cancellationToken: cancellationToken));

        return rows.Select(MapEmpleado).ToList();
    }

    public async Task<IReadOnlyList<ReporteWhatsappEmpleadoDto>> ObtenerEmpleadosFallidosAsync(DateTime fechaProceso, string tipoReporte, CancellationToken cancellationToken = default)
    {
        if (!await ExisteTablaLogAsync(cancellationToken))
        {
            return Array.Empty<ReporteWhatsappEmpleadoDto>();
        }

        const string sql = """
        SELECT DISTINCT
            l.IdEmpleado,
            l.Usuario,
            l.Telefono,
            l.Usuario AS NombreEmpleado
        FROM dbo.ReporteWhatsAppLog l
        WHERE CAST(l.FechaProceso AS date) = @FechaProceso
          AND l.TipoReporte = @TipoReporte
          AND l.EstadoEnvio <> 'ENVIADO'
          AND NOT EXISTS
          (
              SELECT 1
              FROM dbo.ReporteWhatsAppLog ok
              WHERE ok.IdEmpleado = l.IdEmpleado
                AND CAST(ok.FechaProceso AS date) = CAST(l.FechaProceso AS date)
                AND ok.TipoReporte = l.TipoReporte
                AND ok.EstadoEnvio = 'ENVIADO'
          )
        ORDER BY l.Usuario;
        """;

        await using var connection = CreateConnection();
        var rows = await connection.QueryAsync<ReporteWhatsappEmpleadoDto>(
            new CommandDefinition(
                sql,
                new
                {
                    FechaProceso = fechaProceso.Date,
                    TipoReporte = tipoReporte
                },
                cancellationToken: cancellationToken));

        return rows.ToList();
    }

    public async Task<IReadOnlyList<ReporteWhatsappAsistenciaItemDto>> ObtenerReporteAsistenciaAsync(string fechaInicio, string fechaFin, int idEmpleado, CancellationToken cancellationToken = default)
    {
        await using var connection = CreateConnection();

        var parameters = new DynamicParameters();
        parameters.Add("@FechaInicio", fechaInicio, DbType.String);
        parameters.Add("@FechaFin", fechaFin, DbType.String);
        parameters.Add("@IdEmpleado", idEmpleado, DbType.Int32);

        var rows = await connection.QueryAsync(
            new CommandDefinition(
                ReporteAsistenciaSp,
                parameters,
                commandType: CommandType.StoredProcedure,
                cancellationToken: cancellationToken));

        return rows.Select(MapReporte).ToList();
    }

    public async Task<bool> ExisteEnvioExitosoAsync(int idEmpleado, DateTime fechaProceso, string tipoReporte, CancellationToken cancellationToken = default)
    {
        if (!await ExisteTablaLogAsync(cancellationToken))
        {
            return false;
        }

        const string sql = """
        SELECT TOP 1 1
        FROM dbo.ReporteWhatsAppLog
        WHERE IdEmpleado = @IdEmpleado
          AND CAST(FechaProceso AS date) = @FechaProceso
          AND TipoReporte = @TipoReporte
          AND EstadoEnvio = 'ENVIADO';
        """;

        await using var connection = CreateConnection();
        var result = await connection.QueryFirstOrDefaultAsync<int?>(
            new CommandDefinition(
                sql,
                new
                {
                    IdEmpleado = idEmpleado,
                    FechaProceso = fechaProceso.Date,
                    TipoReporte = tipoReporte
                },
                cancellationToken: cancellationToken));

        return result.HasValue;
    }

    public async Task InsertarLogAsync(ReporteWhatsappLogDto log, CancellationToken cancellationToken = default)
    {
        if (!await ExisteTablaLogAsync(cancellationToken))
        {
            throw new InvalidOperationException("No existe la tabla dbo.ReporteWhatsAppLog. Ejecute el script SQL del módulo antes de procesar envíos WUP.");
        }

        const string sql = """
        INSERT INTO dbo.ReporteWhatsAppLog
        (
            IdEmpleado,
            Usuario,
            Telefono,
            FechaProceso,
            TipoReporte,
            EstadoEnvio,
            MensajeError,
            FechaEnvio,
            RequestJson,
            ResponseJson,
            NumeroBloque,
            OrdenEnvio,
            TiempoEsperaEntreBloques,
            DuracionEnvioSegundos,
            OrigenEjecucion,
            UsuarioEjecucion
        )
        VALUES
        (
            @IdEmpleado,
            @Usuario,
            @Telefono,
            @FechaProceso,
            @TipoReporte,
            @EstadoEnvio,
            @MensajeError,
            @FechaEnvio,
            @RequestJson,
            @ResponseJson,
            @NumeroBloque,
            @OrdenEnvio,
            @TiempoEsperaEntreBloques,
            @DuracionEnvioSegundos,
            @OrigenEjecucion,
            @UsuarioEjecucion
        );
        """;

        await using var connection = CreateConnection();
        await connection.ExecuteAsync(
            new CommandDefinition(
                sql,
                log,
                cancellationToken: cancellationToken));
    }

    public async Task<IReadOnlyList<ReporteWhatsappLogDto>> ObtenerLogsAsync(DateTime? fechaProceso, int top, CancellationToken cancellationToken = default)
    {
        if (!await ExisteTablaLogAsync(cancellationToken))
        {
            return Array.Empty<ReporteWhatsappLogDto>();
        }

        const string sql = """
        SELECT TOP (@Top)
            l.IdLog,
            l.IdEmpleado,
            l.Usuario,
            l.Telefono,
            l.FechaProceso,
            l.TipoReporte,
            l.EstadoEnvio,
            l.MensajeError,
            l.FechaEnvio,
            l.RequestJson,
            l.ResponseJson,
            l.NumeroBloque,
            l.OrdenEnvio,
            l.TiempoEsperaEntreBloques,
            l.DuracionEnvioSegundos,
            l.OrigenEjecucion,
            l.UsuarioEjecucion,
            l.Usuario AS NombreEmpleado
        FROM dbo.ReporteWhatsAppLog l
        WHERE (@FechaProceso IS NULL OR CAST(l.FechaProceso AS date) = @FechaProceso)
        ORDER BY l.IdLog DESC;
        """;

        await using var connection = CreateConnection();
        var rows = await connection.QueryAsync<ReporteWhatsappLogDto>(
            new CommandDefinition(
                sql,
                new
                {
                    Top = top,
                    FechaProceso = fechaProceso?.Date
                },
                cancellationToken: cancellationToken));

        return rows.ToList();
    }

    public async Task<ReporteWhatsappKpiDto> ObtenerKpisAsync(DateTime? fechaProceso, CancellationToken cancellationToken = default)
    {
        if (!await ExisteTablaLogAsync(cancellationToken))
        {
            return new ReporteWhatsappKpiDto();
        }

        const string sql = """
        SELECT
            COUNT(1) AS TotalProcesados,
            SUM(CASE WHEN EstadoEnvio = 'ENVIADO' THEN 1 ELSE 0 END) AS TotalEnviados,
            SUM(CASE WHEN EstadoEnvio LIKE 'ERROR%' THEN 1 ELSE 0 END) AS TotalErrores,
            SUM(CASE WHEN EstadoEnvio LIKE 'OMITIDO%' THEN 1 ELSE 0 END) AS TotalOmitidos,
            SUM(CASE WHEN EstadoEnvio = 'DUPLICADO_OMITIDO' THEN 1 ELSE 0 END) AS TotalDuplicados,
            SUM(CASE WHEN EstadoEnvio <> 'ENVIADO' THEN 1 ELSE 0 END) AS TotalPendientesRetry
        FROM dbo.ReporteWhatsAppLog
        WHERE (@FechaProceso IS NULL OR CAST(FechaProceso AS date) = @FechaProceso);
        """;

        await using var connection = CreateConnection();
        var result = await connection.QueryFirstOrDefaultAsync<ReporteWhatsappKpiDto>(
            new CommandDefinition(
                sql,
                new { FechaProceso = fechaProceso?.Date },
                cancellationToken: cancellationToken));

        return result ?? new ReporteWhatsappKpiDto();
    }

    public async Task<bool> UsuarioTieneAccesoAdministrativoAsync(string idUsuario, IEnumerable<string> rolesPermitidos, CancellationToken cancellationToken = default)
    {
        var roles = rolesPermitidos
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Select(x => x.Trim().ToUpperInvariant())
            .Distinct()
            .ToArray();

        if (roles.Length == 0 || string.IsNullOrWhiteSpace(idUsuario))
        {
            return false;
        }

        const string sql = """
        SELECT TOP 1 1
        FROM dbo.SegUsuarioPerfilRol upr
        INNER JOIN dbo.SegPerfilRol pr
            ON upr.IdPerfilRol = pr.IdPerfilRol
        INNER JOIN dbo.SegRol r
            ON pr.IdRol = r.IdRol
        WHERE upr.IdUsuario = @IdUsuario
          AND ISNULL(upr.EsActivo, 1) = 1
          AND ISNULL(pr.EsActivo, 1) = 1
          AND ISNULL(r.EsActivo, 1) = 1
          AND UPPER(LTRIM(RTRIM(r.NombreRol))) IN @Roles;
        """;

        await using var connection = CreateConnection();
        var result = await connection.QueryFirstOrDefaultAsync<int?>(
            new CommandDefinition(
                sql,
                new
                {
                    IdUsuario = idUsuario.Trim(),
                    Roles = roles
                },
                cancellationToken: cancellationToken));

        return result.HasValue;
    }

    private SqlConnection CreateConnection() => new(_connectionString);

    private async Task<bool> ExisteTablaLogAsync(CancellationToken cancellationToken)
    {
        const string sql = """
        SELECT CASE WHEN OBJECT_ID(@TableName, 'U') IS NOT NULL THEN 1 ELSE 0 END;
        """;

        await using var connection = CreateConnection();
        var exists = await connection.ExecuteScalarAsync<int>(
            new CommandDefinition(
                sql,
                new { TableName = ReporteWhatsappLogTable },
                cancellationToken: cancellationToken));

        return exists == 1;
    }

    private static ReporteWhatsappEmpleadoDto MapEmpleado(dynamic row)
    {
        var values = ToDictionary(row);

        return new ReporteWhatsappEmpleadoDto
        {
            IdEmpleado = GetInt(values, "IdEmpleado", "idEmpleado", "CodEmp", "codEmp") ?? 0,
            Usuario = GetString(values, "Usuario", "usuario", "IdUsuario", "idUsuario", "NombreEmpleado", "nombreEmpleado"),
            NombreEmpleado = GetString(values, "NombreEmpleado", "nombreEmpleado", "Usuario", "usuario"),
            Correo = GetString(values, "Correo", "correo", "Email", "email"),
            Telefono = GetString(values, "Telefono", "telefono", "Celular", "celular", "TelefonoWup", "telefonoWup")
        };
    }

    private static ReporteWhatsappAsistenciaItemDto MapReporte(dynamic row)
    {
        var values = ToDictionary(row);

        return new ReporteWhatsappAsistenciaItemDto
        {
            Fecha = GetDateText(values, "Fecha", "fecha"),
            NombreEmpleado = GetString(values, "NombreEmpleado", "nombreEmpleado", "nombreempleado"),
            EstadoMarcacionTexto = GetString(values, "EstadoMarcacionTexto", "estadoMarcacionTexto", "Estado", "estado"),
            Ubicacion = GetString(values, "Ubicacion", "ubicacion"),
            HoraEntrada = GetString(values, "HoraEntrada", "horaEntrada", "Hora", "hora"),
            HoraSalida = GetString(values, "HoraSalida", "horaSalida", "Salida", "salida"),
            TiempoHoras = GetString(values, "TiempoHoras", "tiempoHoras", "TiempoTrabajado", "tiempoTrabajado"),
            TotalHoras = GetDecimal(values, "TotalHoras", "totalHoras")
        };
    }

    private static IDictionary<string, object?> ToDictionary(dynamic row) => (IDictionary<string, object?>)row;

    private static string GetString(IDictionary<string, object?> values, params string[] keys)
    {
        foreach (var key in keys)
        {
            if (!values.TryGetValue(key, out var value) || value is null || value is DBNull)
            {
                continue;
            }

            if (value is DateTime dateTime)
            {
                return dateTime.ToString("dd/MM/yyyy", CultureInfo.InvariantCulture);
            }

            if (value is TimeSpan timeSpan)
            {
                return timeSpan.ToString(@"hh\:mm\:ss", CultureInfo.InvariantCulture);
            }

            return Convert.ToString(value, CultureInfo.InvariantCulture)?.Trim() ?? string.Empty;
        }

        return string.Empty;
    }

    private static string GetDateText(IDictionary<string, object?> values, params string[] keys)
    {
        foreach (var key in keys)
        {
            if (!values.TryGetValue(key, out var value) || value is null || value is DBNull)
            {
                continue;
            }

            if (value is DateTime dateTime)
            {
                return dateTime.ToString("dd/MM/yyyy", CultureInfo.InvariantCulture);
            }

            var text = Convert.ToString(value, CultureInfo.InvariantCulture)?.Trim();
            if (string.IsNullOrWhiteSpace(text))
            {
                continue;
            }

            if (DateTime.TryParse(text, CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsed))
            {
                return parsed.ToString("dd/MM/yyyy", CultureInfo.InvariantCulture);
            }

            return text;
        }

        return string.Empty;
    }

    private static int? GetInt(IDictionary<string, object?> values, params string[] keys)
    {
        foreach (var key in keys)
        {
            if (!values.TryGetValue(key, out var value) || value is null || value is DBNull)
            {
                continue;
            }

            if (value is int number)
            {
                return number;
            }

            if (int.TryParse(Convert.ToString(value, CultureInfo.InvariantCulture), out var parsed))
            {
                return parsed;
            }
        }

        return null;
    }

    private static bool GetBool(IDictionary<string, object?> values, params string[] keys)
    {
        foreach (var key in keys)
        {
            if (!values.TryGetValue(key, out var value) || value is null || value is DBNull)
            {
                continue;
            }

            if (value is bool boolValue)
            {
                return boolValue;
            }

            if (value is int intValue)
            {
                return intValue > 0;
            }

            if (bool.TryParse(Convert.ToString(value, CultureInfo.InvariantCulture), out var parsedBool))
            {
                return parsedBool;
            }
        }

        return false;
    }

    private static decimal GetDecimal(IDictionary<string, object?> values, params string[] keys)
    {
        foreach (var key in keys)
        {
            if (!values.TryGetValue(key, out var value) || value is null || value is DBNull)
            {
                continue;
            }

            if (value is decimal decimalValue)
            {
                return decimalValue;
            }

            if (decimal.TryParse(Convert.ToString(value, CultureInfo.InvariantCulture), NumberStyles.Any, CultureInfo.InvariantCulture, out var parsed))
            {
                return parsed;
            }
        }

        return 0m;
    }

    private static DateTime? GetDateTime(IDictionary<string, object?> values, params string[] keys)
    {
        foreach (var key in keys)
        {
            if (!values.TryGetValue(key, out var value) || value is null || value is DBNull)
            {
                continue;
            }

            if (value is DateTime dateTime)
            {
                return dateTime;
            }

            if (DateTime.TryParse(Convert.ToString(value, CultureInfo.InvariantCulture), out var parsed))
            {
                return parsed;
            }
        }

        return null;
    }
}
