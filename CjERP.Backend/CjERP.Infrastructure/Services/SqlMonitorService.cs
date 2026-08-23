using System.Data;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using CjERP.Application.DTOs.SqlMonitor;
using CjERP.Application.Interfaces.Services;
using CjERP.Infrastructure.Persistence.Sql;
using CjERP.Shared.Configuration;
using Dapper;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace CjERP.Infrastructure.Services;

public sealed class SqlMonitorService : ISqlMonitorService
{
    private const string MonitorApplicationName = "CJ SQL Monitor";
    private const string SpResumen = "dbo.sp_Monitor_Resumen";
    private const string SpQueries = "dbo.sp_Monitor_QueriesActuales";
    private const string SpTopSql = "dbo.sp_Monitor_TopSql_Listar";
    private const string SpBloqueos = "dbo.sp_Monitor_CapturarBloqueos";
    private const string SpNetwork = "dbo.sp_Monitor_NetworkIo";
    private const string SpAlertas = "dbo.sp_Monitor_GenerarAlertas";
    private const string SpOverhead = "dbo.sp_Monitor_Overhead";
    private const string SpQueryDetalle = "dbo.sp_Monitor_QueryDetalle";
    private const string SpCaptura30 = "dbo.sp_Monitor_Captura30Seg";
    private const string SpCaptura1Min = "dbo.sp_Monitor_Captura1Min";
    private const string SpCaptura5Min = "dbo.sp_Monitor_Captura5Min";
    private const string SpLimpiarHistorico = "dbo.sp_Monitor_LimpiarHistorico";
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        WriteIndented = false
    };

    private readonly ISqlCommandFactory _sqlCommandFactory;
    private readonly OpenAiSettings _openAiSettings;
    private readonly ILogger<SqlMonitorService> _logger;
    private readonly string _monitorConnectionString;
    private const string SqlSesionesActivas = """
        SELECT TOP (@Top)
            CONVERT(BIGINT, ROW_NUMBER() OVER (
                ORDER BY COALESCE(r.total_elapsed_time, 0) DESC, s.session_id
            )) AS Id,
            s.session_id AS SessionId,
            COALESCE(DB_NAME(r.database_id), DB_NAME(s.database_id), '-') AS DatabaseName,
            COALESCE(r.status, s.status, '-') AS Status,
            COALESCE(s.host_name, '-') AS HostName,
            COALESCE(s.program_name, '-') AS ProgramName,
            COALESCE(s.login_name, '-') AS LoginName,
            COALESCE(CONVERT(DECIMAL(18, 2), r.cpu_time), 0) AS CpuTimeMs,
            COALESCE(CONVERT(DECIMAL(18, 2), r.total_elapsed_time), 0) AS ElapsedTimeMs,
            COALESCE(CONVERT(DECIMAL(18, 2), r.reads), 0) AS Reads,
            COALESCE(CONVERT(DECIMAL(18, 2), r.writes), 0) AS Writes,
            COALESCE(CONVERT(DECIMAL(18, 2), r.logical_reads), 0) AS LogicalReads,
            r.blocking_session_id AS BlockingSessionId,
            COALESCE(r.wait_type, '-') AS WaitType,
            COALESCE(CONVERT(DECIMAL(18, 2), r.wait_time), 0) AS WaitTimeMs,
            s.login_time AS LoginTime,
            r.start_time AS LastRequestStartTime,
            r.last_wait_type AS LastRequestEndTime,
            COALESCE(s.open_transaction_count, 0) AS OpenTransactionCount,
            CASE
                WHEN r.blocking_session_id IS NOT NULL AND r.blocking_session_id > 0 THEN 'ALTO'
                WHEN r.wait_type = 'ASYNC_NETWORK_IO' THEN 'MEDIO'
                WHEN COALESCE(r.cpu_time, 0) >= 30000 OR COALESCE(r.total_elapsed_time, 0) >= 60000 THEN 'MEDIO'
                ELSE 'NORMAL'
            END AS Nivel
        FROM sys.dm_exec_sessions s
        LEFT JOIN sys.dm_exec_requests r
            ON s.session_id = r.session_id
        WHERE s.is_user_process = 1
          AND s.session_id <> @@SPID
        ORDER BY
            CASE WHEN r.session_id IS NULL THEN 1 ELSE 0 END,
            COALESCE(r.total_elapsed_time, 0) DESC,
            s.session_id;
        """;

    public SqlMonitorService(
        ISqlCommandFactory sqlCommandFactory,
        IOptions<OpenAiSettings> openAiSettings,
        ILogger<SqlMonitorService> logger)
    {
        _sqlCommandFactory = sqlCommandFactory;
        _openAiSettings = openAiSettings.Value;
        _logger = logger;

        var builder = new SqlConnectionStringBuilder(sqlCommandFactory.ConnectionString)
        {
            ApplicationName = MonitorApplicationName
        };

        _monitorConnectionString = builder.ConnectionString;
    }

    public async Task<SqlMonitorResumenDto> ObtenerResumenAsync(CancellationToken cancellationToken = default)
    {
        var rows = await QueryAsync<SqlMonitorResumenDto>(SpResumen, commandType: CommandType.StoredProcedure, cancellationToken: cancellationToken);
        return rows.FirstOrDefault() ?? new SqlMonitorResumenDto
        {
            EstadoServidor = "SIN DATOS",
            Semaforo = "NORMAL"
        };
    }

    public async Task<IReadOnlyList<SqlMonitorQueryDto>> ObtenerQueriesAsync(CancellationToken cancellationToken = default)
    {
        var rows = await QueryAsync<SqlMonitorQueryDto>(SpQueries, commandType: CommandType.StoredProcedure, cancellationToken: cancellationToken);
        return rows
            .OrderByDescending(item => item.FechaHora ?? DateTime.MinValue)
            .ToArray();
    }

    public async Task<IReadOnlyList<SqlMonitorSesionActivaDto>> ObtenerSesionesActivasAsync(CancellationToken cancellationToken = default)
    {
        await using var connection = new SqlConnection(_monitorConnectionString);
        var rows = await connection.QueryAsync<SqlMonitorSesionActivaDto>(
            _sqlCommandFactory.Create(
                SqlSesionesActivas,
                new { Top = 200 },
                CommandType.Text,
                cancellationToken));

        return rows
            .OrderByDescending(item => item.ElapsedTimeMs)
            .ThenByDescending(item => item.LoginTime ?? DateTime.MinValue)
            .ToArray();
    }

    public async Task<IReadOnlyList<SqlMonitorTopSqlDto>> ObtenerTopSqlAsync(string? rango = null, CancellationToken cancellationToken = default)
    {
        var rows = await QueryAsync<SqlMonitorTopSqlDto>(SpTopSql, commandType: CommandType.StoredProcedure, cancellationToken: cancellationToken);
        return ApplyTopSqlRange(rows, rango);
    }

    public async Task<IReadOnlyList<SqlMonitorBloqueoDto>> ObtenerBloqueosAsync(CancellationToken cancellationToken = default)
    {
        var rows = await QueryAsync<SqlMonitorBloqueoDto>(SpBloqueos, commandType: CommandType.StoredProcedure, cancellationToken: cancellationToken);
        return rows
            .OrderByDescending(item => item.WaitTimeMs)
            .ToArray();
    }

    public async Task<IReadOnlyList<SqlMonitorNetworkDto>> ObtenerNetworkAsync(CancellationToken cancellationToken = default)
    {
        var rows = await QueryAsync<SqlMonitorNetworkDto>(SpNetwork, commandType: CommandType.StoredProcedure, cancellationToken: cancellationToken);
        return rows
            .OrderByDescending(item => item.FechaHora ?? DateTime.MinValue)
            .ToArray();
    }

    public async Task<IReadOnlyList<SqlMonitorAlertaDto>> ObtenerAlertasAsync(
        string? nivel = null,
        string? tipoAlerta = null,
        string? estado = null,
        DateTime? fecha = null,
        CancellationToken cancellationToken = default)
    {
        var rows = await QueryAsync<SqlMonitorAlertaDto>(SpAlertas, commandType: CommandType.StoredProcedure, cancellationToken: cancellationToken);

        var filtered = rows.AsEnumerable();

        if (!string.IsNullOrWhiteSpace(nivel))
        {
            filtered = filtered.Where(item => string.Equals(item.Nivel, nivel, StringComparison.OrdinalIgnoreCase));
        }

        if (!string.IsNullOrWhiteSpace(tipoAlerta))
        {
            filtered = filtered.Where(item => string.Equals(item.TipoAlerta, tipoAlerta, StringComparison.OrdinalIgnoreCase));
        }

        if (!string.IsNullOrWhiteSpace(estado))
        {
            filtered = filtered.Where(item => string.Equals(item.Estado, estado, StringComparison.OrdinalIgnoreCase));
        }

        if (fecha.HasValue)
        {
            var target = fecha.Value.Date;
            filtered = filtered.Where(item => item.FechaHora.HasValue && item.FechaHora.Value.Date == target);
        }

        return filtered
            .OrderByDescending(item => item.FechaHora ?? DateTime.MinValue)
            .ToArray();
    }

    public async Task<SqlMonitorOverheadDto> ObtenerOverheadAsync(CancellationToken cancellationToken = default)
    {
        var rows = await QueryAsync<SqlMonitorOverheadDto>(SpOverhead, commandType: CommandType.StoredProcedure, cancellationToken: cancellationToken);
        return rows.FirstOrDefault() ?? new SqlMonitorOverheadDto
        {
            Nivel = "NORMAL"
        };
    }

    public async Task<SqlMonitorQueryDetalleDto?> ObtenerQueryDetalleAsync(long id, CancellationToken cancellationToken = default)
    {
        var candidateParameters = new[]
        {
            new DynamicParameters(new { Id = id }),
            new DynamicParameters(new { IdQuery = id }),
            new DynamicParameters(new { IdSnapshot = id }),
            new DynamicParameters(new { SnapshotId = id }),
            new DynamicParameters(new { IdRegistro = id })
        };

        foreach (var parameters in candidateParameters)
        {
            try
            {
                var rows = await QueryAsync<SqlMonitorQueryDetalleDto>(SpQueryDetalle, parameters, CommandType.StoredProcedure, cancellationToken);
                var detail = rows.FirstOrDefault();
                if (detail is not null)
                {
                    detail.Id = id;
                    return detail;
                }
            }
            catch (SqlException ex) when (IsLikelyParameterMismatch(ex))
            {
                continue;
            }
        }

        return null;
    }

    public async Task<SqlMonitorAnalisisDto> AnalizarQueryAsync(long id, string? usuario = null, CancellationToken cancellationToken = default)
    {
        var detalle = await ObtenerQueryDetalleAsync(id, cancellationToken);
        if (detalle is null)
        {
            return new SqlMonitorAnalisisDto
            {
                NivelRiesgo = "ALTO",
                Diagnostico = "No se pudo recuperar el detalle de la consulta solicitada.",
                CausaProbable = "El registro no existe o el procedimiento de detalle no devolvio datos.",
                Recomendaciones = ["Validar el identificador recibido y revisar la fuente de datos del monitor."],
                Observaciones = ["No se genero analisis automatizado porque no hubo detalle."]
            };
        }

        if (string.IsNullOrWhiteSpace(_openAiSettings.ApiKey))
        {
            return BuildHeuristicAnalysis(detalle, "No hay clave de OpenAI configurada.");
        }

        try
        {
            var payload = BuildAnalysisPrompt(detalle, usuario);
            using var client = new HttpClient();
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", _openAiSettings.ApiKey);

            using var request = new HttpRequestMessage(HttpMethod.Post, "https://api.openai.com/v1/chat/completions");
            request.Content = new StringContent(
                JsonSerializer.Serialize(new
                {
                    model = _openAiSettings.Model,
                    temperature = 0.2,
                    messages = new object[]
                    {
                        new
                        {
                            role = "system",
                            content = "Eres un DBA senior. Analiza consultas SQL Server de forma defensiva. Devuelve solo JSON valido con las claves: nivelRiesgo, diagnostico, causaProbable, recomendaciones, indicesPotenciales, observaciones. No sugieras acciones destructivas ni cambios automatizados."
                        },
                        new
                        {
                            role = "user",
                            content = payload
                        }
                    }
                }),
                Encoding.UTF8,
                "application/json");

            using var response = await client.SendAsync(request, cancellationToken);
            var content = await response.Content.ReadAsStringAsync(cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("OpenAI rechazo el analisis SQL Monitor. Status={Status} Body={Body}", (int)response.StatusCode, content);
                return BuildHeuristicAnalysis(detalle, $"OpenAI respondio {response.StatusCode}.");
            }

            var parsed = TryParseOpenAiAnalysis(content);
            return parsed ?? BuildHeuristicAnalysis(detalle, "No se pudo interpretar la respuesta IA.");
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "No fue posible ejecutar el analisis IA del monitor para Id={Id}.", id);
            return BuildHeuristicAnalysis(detalle, ex.Message);
        }
    }

    public Task Capturar30SegundosAsync(CancellationToken cancellationToken = default) =>
        ExecuteNonQueryAsync(SpCaptura30, cancellationToken);

    public Task Capturar1MinutoAsync(CancellationToken cancellationToken = default) =>
        ExecuteNonQueryAsync(SpCaptura1Min, cancellationToken);

    public Task Capturar5MinutosAsync(CancellationToken cancellationToken = default) =>
        ExecuteNonQueryAsync(SpCaptura5Min, cancellationToken);

    public Task LimpiarHistoricoAsync(CancellationToken cancellationToken = default) =>
        ExecuteNonQueryAsync(SpLimpiarHistorico, cancellationToken);

    private async Task<IReadOnlyList<T>> QueryAsync<T>(
        string storedProcedure,
        object? parameters = null,
        CommandType? commandType = null,
        CancellationToken cancellationToken = default)
    {
        await using var connection = new SqlConnection(_monitorConnectionString);
        var rows = await connection.QueryAsync<T>(
            _sqlCommandFactory.Create(
                storedProcedure,
                parameters,
                commandType,
                cancellationToken));

        return rows.ToArray();
    }

    private async Task ExecuteNonQueryAsync(string storedProcedure, CancellationToken cancellationToken)
    {
        await using var connection = new SqlConnection(_monitorConnectionString);
        await connection.ExecuteAsync(
            _sqlCommandFactory.Create(
                storedProcedure,
                commandType: CommandType.StoredProcedure,
                cancellationToken: cancellationToken));
    }

    private static IReadOnlyList<SqlMonitorTopSqlDto> ApplyTopSqlRange(IEnumerable<SqlMonitorTopSqlDto> rows, string? rango)
    {
        var window = NormalizeRange(rango);
        if (window is null)
        {
            return rows
                .OrderByDescending(item => item.LastExecutionTime ?? DateTime.MinValue)
                .ToArray();
        }

        var threshold = DateTime.Now.Subtract(window.Value);
        return rows
            .Where(item => !item.LastExecutionTime.HasValue || item.LastExecutionTime.Value >= threshold)
            .OrderByDescending(item => item.LastExecutionTime ?? DateTime.MinValue)
            .ToArray();
    }

    private static TimeSpan? NormalizeRange(string? rango)
    {
        var normalized = (rango ?? string.Empty).Trim().ToLowerInvariant();
        return normalized switch
        {
            "1h" or "1hora" or "1hora(s)" or "una-hora" => TimeSpan.FromHours(1),
            "6h" or "6horas" or "6hora(s)" => TimeSpan.FromHours(6),
            "12h" or "12horas" or "12hora(s)" => TimeSpan.FromHours(12),
            "24h" or "1d" or "24horas" or "24hora(s)" => TimeSpan.FromHours(24),
            "7d" or "7dias" or "7dia(s)" => TimeSpan.FromDays(7),
            _ => TimeSpan.FromHours(24)
        };
    }

    private static bool IsLikelyParameterMismatch(SqlException ex)
    {
        return ex.Message.Contains("parameter", StringComparison.OrdinalIgnoreCase)
            || ex.Message.Contains("parámetro", StringComparison.OrdinalIgnoreCase)
            || ex.Message.Contains("must declare the scalar variable", StringComparison.OrdinalIgnoreCase);
    }

    private static string BuildAnalysisPrompt(SqlMonitorQueryDetalleDto detalle, string? usuario)
    {
        return $$"""
        Usuario que solicita el analisis: {{usuario ?? "N/A"}}

        Analiza esta consulta SQL Server y responde solo JSON valido:
        {
          "nivelRiesgo": "BAJO|MEDIO|ALTO|CRITICO",
          "diagnostico": "texto corto",
          "causaProbable": "texto corto",
          "recomendaciones": ["..."],
          "indicesPotenciales": ["..."],
          "observaciones": ["..."]
        }

        Datos:
        - Id: {{detalle.Id}}
        - DatabaseName: {{detalle.DatabaseName}}
        - Status: {{detalle.Status}}
        - Command: {{detalle.Command}}
        - CpuTimeMs: {{detalle.CpuTimeMs}}
        - ElapsedTimeMs: {{detalle.ElapsedTimeMs}}
        - Reads: {{detalle.Reads}}
        - Writes: {{detalle.Writes}}
        - LogicalReads: {{detalle.LogicalReads}}
        - CantidadFilas: {{detalle.CantidadFilas}}
        - WaitType: {{detalle.WaitType}}
        - WaitTimeMs: {{detalle.WaitTimeMs}}
        - BlockingSessionId: {{detalle.BlockingSessionId}}
        - HostName: {{detalle.HostName}}
        - ProgramName: {{detalle.ProgramName}}
        - LoginName: {{detalle.LoginName}}
        - SqlText: {{detalle.SqlText}}
        """;
    }

    private static SqlMonitorAnalisisDto? TryParseOpenAiAnalysis(string content)
    {
        try
        {
            using var document = JsonDocument.Parse(content);
            var choices = document.RootElement.GetProperty("choices");
            if (choices.GetArrayLength() == 0)
            {
                return null;
            }

            var message = choices[0].GetProperty("message");
            var assistantContent = message.GetProperty("content").GetString();
            if (string.IsNullOrWhiteSpace(assistantContent))
            {
                return null;
            }

            var parsed = JsonSerializer.Deserialize<SqlMonitorAnalisisDto>(assistantContent, JsonOptions);
            return parsed;
        }
        catch
        {
            return null;
        }
    }

    private static SqlMonitorAnalisisDto BuildHeuristicAnalysis(SqlMonitorQueryDetalleDto detalle, string reason)
    {
        var recomendaciones = new List<string>();
        var observaciones = new List<string> { reason };
        var nivel = "BAJO";
        var diagnostico = "La consulta no presenta señales criticas con la evidencia disponible.";
        var causa = "No se detecto un patron concluyente.";

        var waitType = (detalle.WaitType ?? string.Empty).ToUpperInvariant();
        var sqlText = detalle.SqlText ?? string.Empty;

        if (!string.IsNullOrWhiteSpace(waitType) && waitType.Contains("LCK", StringComparison.OrdinalIgnoreCase))
        {
            nivel = "ALTO";
            diagnostico = "La consulta esta afectada por bloqueo.";
            causa = "Existe espera de tipo bloqueo o contencion entre sesiones.";
            recomendaciones.Add("Revisar la transaccion bloqueante y el orden de acceso a tablas.");
            recomendaciones.Add("Validar indices y el aislamiento de la transaccion.");
        }

        if (waitType.Contains("ASYNC_NETWORK_IO", StringComparison.OrdinalIgnoreCase))
        {
            if (nivel is "BAJO")
            {
                nivel = "MEDIO";
            }

            diagnostico = "La consulta muestra un posible cuello de botella SQL / aplicacion / red.";
            causa = "La sesion produce filas mas rapido de lo que el consumidor puede leer.";
            recomendaciones.Add("Reducir el volumen de filas devueltas o paginar el resultado.");
            recomendaciones.Add("Validar el consumo en frontend, backend y red antes de asumir un problema fisico.");
        }

        if (detalle.ElapsedTimeMs >= 60000 || detalle.CpuTimeMs >= 30000 || detalle.LogicalReads >= 100000)
        {
            nivel = nivel == "ALTO" ? nivel : "MEDIO";
            diagnostico = "La consulta consume mas recursos de lo deseable.";
            causa = "El tiempo de ejecucion o las lecturas logicas son elevadas.";
            recomendaciones.Add("Revisar filtros, joins y predicados de busqueda.");
            recomendaciones.Add("Evaluar si faltan indices o si el plan de ejecucion esta degradado.");
        }

        if (detalle.BlockingSessionId.HasValue && detalle.BlockingSessionId.Value > 0)
        {
            nivel = "ALTO";
            diagnostico = "La consulta esta bloqueada por otra sesion.";
            causa = "Una sesion superior retiene recursos que esta consulta necesita.";
            recomendaciones.Add("Identificar la sesion bloqueante y el punto de contencion.");
        }

        if (recomendaciones.Count == 0)
        {
            recomendaciones.Add("Comparar la consulta con patrones normales del modulo y medir su impacto.");
            recomendaciones.Add("Validar si el volumen de datos justifica paginacion o agregacion previa.");
        }

        if (string.IsNullOrWhiteSpace(causa))
        {
            causa = sqlText.Length > 0
                ? "La consulta requiere revision preventiva."
                : "No se encontraron elementos suficientes para precisar una causa.";
        }

        return new SqlMonitorAnalisisDto
        {
            NivelRiesgo = nivel,
            Diagnostico = diagnostico,
            CausaProbable = causa,
            Recomendaciones = recomendaciones.Distinct(StringComparer.OrdinalIgnoreCase).ToList(),
            IndicesPotenciales =
            [
                "Revisar columnas usadas en WHERE, JOIN y ORDER BY",
                "Considerar indices compuestos si el patron de acceso es repetitivo"
            ],
            Observaciones = observaciones
        };
    }
}
