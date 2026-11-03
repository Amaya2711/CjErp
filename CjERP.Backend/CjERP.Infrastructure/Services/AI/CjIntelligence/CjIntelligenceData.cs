// CJ Intelligence: contratos de acceso a datos (conversaciones y pagos) y sus implementaciones SQL.
// Las implementaciones SQL usan SOLO procedimientos sp_IA_Cj_* con la conexion de cj_ia (ICjIntelligenceSqlCommandFactory) y NO se
// pueden probar sin base de datos (script 22/23); la logica que las usa se prueba con dobles contra estas interfaces.
using System.Data;
using CjERP.Infrastructure.Persistence.Sql;
using Dapper;
using Microsoft.Data.SqlClient;

namespace CjERP.Infrastructure.Services.AI.CjIntelligence;

public sealed class CjIntelligenceIdentityException : Exception
{
    public CjIntelligenceIdentityException() : base("Identidad ausente o inexistente.") { }
}

public sealed class CjIntelligenceAuthorizationException : Exception
{
    public CjIntelligenceAuthorizationException(int sqlNumber) : base($"El procedimiento denego la operacion (codigo {sqlNumber}).") => SqlNumber = sqlNumber;

    public int SqlNumber { get; }
}

public sealed class CjIntelligenceSqlTimeoutException : Exception
{
    public CjIntelligenceSqlTimeoutException(Exception inner) : base("La consulta excedio el tiempo permitido.", inner) { }
}

// ---------------------------------------------------------------------------------------------- conversaciones

// Filas leidas por Dapper: propiedades (no constructor posicional) para que Dapper convierta tinyint/smallint a int sin exigir tipos exactos.
public sealed record CjConversationRow
{
    public Guid IdConversacion { get; init; }
    public string? Titulo { get; init; }
    public string? Modulo { get; init; }
    public DateTime FechaCreacion { get; init; }
    public DateTime FechaUltimoMensaje { get; init; }
}

public sealed record CjMessageRow
{
    public long IdMensaje { get; init; }
    public long? IdTurno { get; init; }
    public int Secuencia { get; init; }
    public string Rol { get; init; } = string.Empty;
    public string Contenido { get; init; } = string.Empty;
    public DateTime Fecha { get; init; }
    public string? Modelo { get; init; }
    public string? FinishReason { get; init; }
}

public sealed record CjResultRefRow
{
    public long IdResultado { get; init; }
    public long IdTurno { get; init; }
    /// <summary>Secuencia del primer mensaje del turno (para saber que tramo cubre un resumen).</summary>
    public int? SecuenciaTurno { get; init; }
    public int Intento { get; init; }
    public int Orden { get; init; }
    public string Herramienta { get; init; } = string.Empty;
    public string AlcanceNivel { get; init; } = string.Empty;
    /// <summary>Empleados con los que SQL produjo el resultado ("1,2,3"); null si fue TOTAL.</summary>
    public string? AlcanceEmpleados { get; init; }
    public bool UsaTotalesGlobales { get; init; }
    public string Estado { get; init; } = string.Empty;
    public DateTime FechaConsulta { get; init; }
    public int? Filas { get; init; }
    public int? FilasEnviadas { get; init; }
    public bool Truncado { get; init; }
    public string? HashResultado { get; init; }
}

public sealed record CjConversationState(int Version, string EstadoJson, string? Resumen, int? ResumenHastaSecuencia);

public sealed record CjConversationOpen(
    bool Found,
    CjConversationRow? Header,
    int UltimaSecuencia,
    CjConversationState? State,
    IReadOnlyList<CjMessageRow> Messages,
    IReadOnlyList<CjResultRefRow> Results);

public static class CjTurnResults
{
    public const string New = "NUEVO";
    public const string Retry = "REINTENTO";
    public const string Completed = "COMPLETADO";
    public const string InProgress = "EN_CURSO";
    public const string Conflict = "CONFLICTO";
    public const string Exhausted = "AGOTADO";
    public const string NotFound = "NO_ENCONTRADA";
    /// <summary>Mismo ClientMessageId con OTRO contenido.</summary>
    public const string ContentMismatch = "CONTENIDO_DISTINTO";
    /// <summary>Mismo ClientMessageId usado en OTRA conversacion.</summary>
    public const string IdReused = "ID_REUTILIZADO";
}

public sealed record CjTurnStart
{
    public string Resultado { get; init; } = string.Empty;
    public long? IdTurno { get; init; }
    public int? Intentos { get; init; }
    public long? IdMensajeUsuario { get; init; }
    public int? SecuenciaUsuario { get; init; }
    public string? ContenidoUsuario { get; init; }
    public long? IdMensajeAsistente { get; init; }
    public int? SecuenciaAsistente { get; init; }
    public string? ContenidoAsistente { get; init; }
    public Guid? IdConversacion { get; init; }
}

public sealed record CjResultRecord(
    short Orden, string Herramienta, string ArgumentosJson, string AlcanceNivel, string? AlcanceHash, string Estado,
    int? Filas, int? FilasEnviadas, bool Truncado, string? TotalesJson, string? ResumenJson, string? HashResultado,
    int? DuracionSqlMs, string? Error, long? IdAuditoria, string? AlcanceEmpleados = null, bool UsaTotalesGlobales = false);

public sealed record CjAuditRecord(
    string Login, Guid? IdConversacion, string? Pregunta, string? ArgsHash, string? Herramienta, int? DuracionMs, int? Filas,
    string? Modelo, int? TokensEntrada, int? TokensSalida, bool Exitoso, string? Error, bool Bloqueado, string? MotivoBloqueo,
    bool AutorizacionPermitida, string? AutorizacionMotivo, string? AlcanceAplicado);

public sealed record CjCompleteRequest(
    string Contenido, string? FinishReason, string? Modelo, int? TokensEntrada, int? TokensSalida, int? DuracionModeloMs);

public interface ICjIntelligenceConversationStore
{
    Task<Guid> CreateAsync(string login, string? titulo, string modulo, CancellationToken ct);

    Task<IReadOnlyList<CjConversationRow>> ListAsync(string login, int pagina, int tamano, CancellationToken ct);

    Task<CjConversationOpen> OpenAsync(string login, Guid idConversacion, int desdeSecuencia, int cantidad, CancellationToken ct);

    Task<bool> RenameAsync(string login, Guid idConversacion, string titulo, CancellationToken ct);

    Task<bool> DeleteAsync(string login, Guid idConversacion, CancellationToken ct);

    Task<CjTurnStart> StartTurnAsync(string login, Guid idConversacion, Guid clientMessageId, Guid owner, string contenido, int ttlSegundos, CancellationToken ct);

    /// <summary>Primer mensaje (sin conversacion todavia): crea la conversacion y el turno de forma atomica e idempotente por ClientMessageId.</summary>
    Task<CjTurnStart> StartTurnInNewConversationAsync(string login, Guid clientMessageId, Guid owner, string contenido, string modulo, int ttlSegundos, CancellationToken ct);

    /// <summary>true = sigue siendo propietaria. false = perdio el bloqueo.</summary>
    Task<bool> RenewAsync(long idTurno, Guid owner, int ttlSegundos, CancellationToken ct);

    /// <summary>Lanza <see cref="CjIntelligenceLockLostException"/> si la solicitud ya no es propietaria.</summary>
    Task<long> RecordResultAsync(long idTurno, Guid owner, CjResultRecord record, CancellationToken ct);

    /// <summary>Lanza <see cref="CjIntelligenceLockLostException"/> si la solicitud ya no es propietaria. Idempotente.</summary>
    Task CompleteAsync(long idTurno, Guid owner, CjCompleteRequest request, CancellationToken ct);

    Task FailAsync(long idTurno, Guid owner, string estado, string? error, CancellationToken ct);

    /// <summary>true = guardado; false = version distinta o bloqueo perdido (no es un error del turno).</summary>
    Task<bool> SaveStateAsync(long idTurno, Guid owner, int versionEsperada, string estadoJson, CancellationToken ct);

    Task<long?> RecordAuditAsync(CjAuditRecord record, CancellationToken ct);
}

public sealed class SqlCjIntelligenceConversationStore : ICjIntelligenceConversationStore
{
    private readonly ICjIntelligenceSqlCommandFactory _sql;

    public SqlCjIntelligenceConversationStore(ICjIntelligenceSqlCommandFactory sql) => _sql = sql;

    public async Task<Guid> CreateAsync(string login, string? titulo, string modulo, CancellationToken ct) =>
        await Run(async c => await c.QuerySingleAsync<Guid>(_sql.Create("dbo.sp_IA_Cj_Conversacion_Crear",
            new { IdUsuario = login, Titulo = titulo, Modulo = modulo }, CommandType.StoredProcedure, ct)));

    public async Task<IReadOnlyList<CjConversationRow>> ListAsync(string login, int pagina, int tamano, CancellationToken ct) =>
        await Run(async c => (await c.QueryAsync<CjConversationRow>(_sql.Create("dbo.sp_IA_Cj_Conversacion_Listar",
            new { IdUsuario = login, Pagina = pagina, Tamano = tamano }, CommandType.StoredProcedure, ct))).ToList());

    public async Task<CjConversationOpen> OpenAsync(string login, Guid idConversacion, int desdeSecuencia, int cantidad, CancellationToken ct) =>
        await Run(async c =>
        {
            var p = new DynamicParameters();
            p.Add("@IdUsuario", login, DbType.String, size: 100);
            p.Add("@IdConversacion", idConversacion, DbType.Guid);
            p.Add("@DesdeSecuencia", desdeSecuencia, DbType.Int32);
            p.Add("@Cantidad", cantidad, DbType.Int32);
            p.Add("@Encontrada", dbType: DbType.Boolean, direction: ParameterDirection.Output);

            using var multi = await c.QueryMultipleAsync(_sql.Create("dbo.sp_IA_Cj_Conversacion_Abrir", p, CommandType.StoredProcedure, ct));
            var header = (await multi.ReadAsync<HeaderRow>()).FirstOrDefault();
            var state = (await multi.ReadAsync<StateRow>()).FirstOrDefault();
            var messages = (await multi.ReadAsync<CjMessageRow>()).ToList();
            var results = (await multi.ReadAsync<CjResultRefRow>()).ToList();

            var found = p.Get<bool?>("@Encontrada") == true && header is not null;
            return !found
                ? new CjConversationOpen(false, null, 0, null, [], [])
                : new CjConversationOpen(
                    true,
                    new CjConversationRow { IdConversacion = header!.IdConversacion, Titulo = header.Titulo, Modulo = header.Modulo, FechaCreacion = header.FechaCreacion, FechaUltimoMensaje = header.FechaUltimoMensaje },
                    header.UltimaSecuencia,
                    state is null ? null : new CjConversationState(state.Version, state.EstadoJson, state.Resumen, state.ResumenHastaSecuencia),
                    messages,
                    results);
        });

    public async Task<bool> RenameAsync(string login, Guid idConversacion, string titulo, CancellationToken ct) =>
        await Run(async c => await c.QuerySingleAsync<int>(_sql.Create("dbo.sp_IA_Cj_Conversacion_Renombrar",
            new { IdUsuario = login, IdConversacion = idConversacion, Titulo = titulo }, CommandType.StoredProcedure, ct)) > 0);

    public async Task<bool> DeleteAsync(string login, Guid idConversacion, CancellationToken ct) =>
        await Run(async c => await c.QuerySingleAsync<int>(_sql.Create("dbo.sp_IA_Cj_Conversacion_Eliminar",
            new { IdUsuario = login, IdConversacion = idConversacion }, CommandType.StoredProcedure, ct)) > 0);

    public async Task<CjTurnStart> StartTurnAsync(string login, Guid idConversacion, Guid clientMessageId, Guid owner, string contenido, int ttlSegundos, CancellationToken ct) =>
        await Run(async c => await c.QuerySingleAsync<CjTurnStart>(_sql.Create("dbo.sp_IA_Cj_Turno_Iniciar",
            new { IdUsuario = login, IdConversacion = idConversacion, ClientMessageId = clientMessageId, Propietario = owner, Contenido = contenido, TtlSegundos = ttlSegundos },
            CommandType.StoredProcedure, ct)));

    public async Task<CjTurnStart> StartTurnInNewConversationAsync(string login, Guid clientMessageId, Guid owner, string contenido, string modulo, int ttlSegundos, CancellationToken ct) =>
        await Run(async c => await c.QuerySingleAsync<CjTurnStart>(_sql.Create("dbo.sp_IA_Cj_Turno_IniciarNueva",
            new { IdUsuario = login, ClientMessageId = clientMessageId, Propietario = owner, Contenido = contenido, Modulo = modulo, TtlSegundos = ttlSegundos },
            CommandType.StoredProcedure, ct)));

    public async Task<bool> RenewAsync(long idTurno, Guid owner, int ttlSegundos, CancellationToken ct) =>
        await Run(async c => await c.QuerySingleAsync<int>(_sql.Create("dbo.sp_IA_Cj_Turno_Renovar",
            new { IdTurno = idTurno, Propietario = owner, TtlSegundos = ttlSegundos }, CommandType.StoredProcedure, ct)) == 1);

    public async Task<long> RecordResultAsync(long idTurno, Guid owner, CjResultRecord r, CancellationToken ct) =>
        await Run(async c => await c.QuerySingleAsync<long>(_sql.Create("dbo.sp_IA_Cj_Resultado_Registrar", new
        {
            IdTurno = idTurno, Propietario = owner, r.Orden, r.Herramienta, r.ArgumentosJson, r.AlcanceNivel, r.AlcanceHash, r.Estado,
            r.Filas, r.FilasEnviadas, r.Truncado, r.TotalesJson, r.ResumenJson, r.HashResultado, r.DuracionSqlMs, r.Error, r.IdAuditoria,
            r.AlcanceEmpleados, r.UsaTotalesGlobales
        }, CommandType.StoredProcedure, ct)));

    public async Task CompleteAsync(long idTurno, Guid owner, CjCompleteRequest r, CancellationToken ct) =>
        await Run(async c =>
        {
            await c.QueryAsync(_sql.Create("dbo.sp_IA_Cj_Turno_Completar", new
            {
                IdTurno = idTurno, Propietario = owner, Contenido = r.Contenido, r.FinishReason, r.Modelo, r.TokensEntrada, r.TokensSalida, r.DuracionModeloMs
            }, CommandType.StoredProcedure, ct));
            return true;
        });

    public async Task FailAsync(long idTurno, Guid owner, string estado, string? error, CancellationToken ct) =>
        await Run(async c =>
        {
            await c.QueryAsync(_sql.Create("dbo.sp_IA_Cj_Turno_Fallar", new { IdTurno = idTurno, Propietario = owner, Estado = estado, Error = error },
                CommandType.StoredProcedure, ct));
            return true;
        });

    public async Task<bool> SaveStateAsync(long idTurno, Guid owner, int versionEsperada, string estadoJson, CancellationToken ct) =>
        await Run(async c => await c.QuerySingleAsync<int>(_sql.Create("dbo.sp_IA_Cj_Estado_Guardar", new
        {
            IdTurno = idTurno, Propietario = owner, VersionEsperada = versionEsperada, EstadoJson = estadoJson
        }, CommandType.StoredProcedure, ct)) == 1);

    public async Task<long?> RecordAuditAsync(CjAuditRecord a, CancellationToken ct) =>
        await Run(async c => await c.QuerySingleAsync<long?>(_sql.Create("dbo.sp_IA_Cj_Auditoria_Registrar", new
        {
            IdUsuario = a.Login, IdConversacion = a.IdConversacion, Pregunta = a.Pregunta, SqlHash = a.ArgsHash, TablasConsultadas = a.Herramienta,
            DuracionMs = a.DuracionMs, CantidadRegistros = a.Filas, a.Modelo, a.TokensEntrada, a.TokensSalida, a.Exitoso, a.Error,
            BloqueadoSeguridad = a.Bloqueado, a.MotivoBloqueo, AuthorizationAllowed = a.AutorizacionPermitida, AuthorizationReason = a.AutorizacionMotivo,
            AppliedScopes = a.AlcanceAplicado
        }, CommandType.StoredProcedure, ct)));

    private async Task<T> Run<T>(Func<SqlConnection, Task<T>> action)
    {
        try
        {
            await using var connection = _sql.CreateConnection();
            return await action(connection);
        }
        catch (SqlException ex) when (ex.Number == 51050)
        {
            throw new CjIntelligenceLockLostException();
        }
        catch (SqlException ex) when (ex.Number == 51010)
        {
            throw new CjIntelligenceIdentityException();
        }
        catch (SqlException ex) when (ex.Number == -2)
        {
            throw new CjIntelligenceSqlTimeoutException(ex);
        }
    }

    private sealed class HeaderRow
    {
        public Guid IdConversacion { get; set; }
        public string? Titulo { get; set; }
        public string? Modulo { get; set; }
        public DateTime FechaCreacion { get; set; }
        public DateTime FechaUltimoMensaje { get; set; }
        public int UltimaSecuencia { get; set; }
    }

    private sealed class StateRow
    {
        public int Version { get; set; }
        public string EstadoJson { get; set; } = "{}";
        public string? Resumen { get; set; }
        public int? ResumenHastaSecuencia { get; set; }
    }
}

// ---------------------------------------------------------------------------------------------- pagos

public sealed record PagosQueryResult(
    string NivelAplicado,
    string? EmpleadosAplicados,
    bool GlobalesAplicado,
    IReadOnlyList<Dictionary<string, object?>> Grupos,
    IReadOnlyList<Dictionary<string, object?>> TotalesPorMoneda,
    int DuracionSqlMs);

public interface ICjIntelligencePagosGateway
{
    /// <summary>
    /// Ejecuta el resumen de pagos. El alcance lo DERIVA SQL desde <paramref name="login"/>; <paramref name="nivelSolicitado"/> solo
    /// indica el nivel que el backend resolvio (PROPIO | EQUIPO | TOTAL) y SQL lo rechaza si supera el concedido.
    /// </summary>
    Task<PagosQueryResult> ResumenAsync(string login, string nivelSolicitado, PagosResumenArgs args, CancellationToken ct);
}

public sealed class SqlCjIntelligencePagosGateway : ICjIntelligencePagosGateway
{
    private readonly ICjIntelligenceSqlCommandFactory _sql;

    public SqlCjIntelligencePagosGateway(ICjIntelligenceSqlCommandFactory sql) => _sql = sql;

    public async Task<PagosQueryResult> ResumenAsync(string login, string nivelSolicitado, PagosResumenArgs a, CancellationToken ct)
    {
        var started = System.Diagnostics.Stopwatch.StartNew();
        try
        {
            await using var connection = _sql.CreateConnection();
            var p = new DynamicParameters();
            p.Add("@IdUsuario", login, DbType.String, size: 100);
            p.Add("@ToolName", CjIntelligenceTools.PagosPermission, DbType.AnsiString, size: 100);
            p.Add("@NivelSolicitado", nivelSolicitado, DbType.AnsiString, size: 10);
            p.Add("@VerTotalesGlobales", false, DbType.Boolean);
            p.Add("@FechaInicio", a.Periodo.Inicio.ToString("yyyy-MM-dd"), DbType.String, size: 50);
            p.Add("@FechaFin", a.Periodo.Fin.ToString("yyyy-MM-dd"), DbType.String, size: 50);
            p.Add("@Modo", "RESUMEN", DbType.AnsiString, size: 10);
            p.Add("@AgruparPor", a.AgruparPor.Count == 0 ? "MONEDA" : string.Join(',', a.AgruparPor), DbType.AnsiString, size: 100);
            p.Add("@Top", a.Top, DbType.Int32);
            p.Add("@Estados", a.Estados, DbType.AnsiString, size: 100);
            p.Add("@TextoBusqueda", a.TextoBusqueda, DbType.String, size: 500);
            p.Add("@Cliente", a.Cliente, DbType.String, size: 150);
            p.Add("@Proyecto", a.Proyecto, DbType.String, size: 150);
            p.Add("@Site", a.Site, DbType.String, size: 150);
            p.Add("@Responsable", a.Responsable, DbType.String, size: 150);
            p.Add("@Solicitante", a.Solicitante, DbType.String, size: 150);
            p.Add("@SoloValidar", false, DbType.Boolean);
            p.Add("@NivelAplicado", dbType: DbType.AnsiString, size: 10, direction: ParameterDirection.Output);
            p.Add("@EmpleadosAplicados", dbType: DbType.String, size: -1, direction: ParameterDirection.Output);
            p.Add("@GlobalesAplicado", dbType: DbType.Boolean, direction: ParameterDirection.Output);

            using var multi = await connection.QueryMultipleAsync(_sql.Create("dbo.sp_IA_Cj_Pagos_Buscar", p, CommandType.StoredProcedure, ct));
            var grupos = ToDictionaries(await multi.ReadAsync());
            var totales = multi.IsConsumed ? [] : ToDictionaries(await multi.ReadAsync());

            return new PagosQueryResult(
                p.Get<string?>("@NivelAplicado") ?? string.Empty,
                p.Get<string?>("@EmpleadosAplicados"),
                p.Get<bool?>("@GlobalesAplicado") ?? false,
                grupos,
                totales,
                (int)started.ElapsedMilliseconds);
        }
        catch (SqlException ex) when (ex.Number is 51040 or 51041 or 51043 or 51047 or 51048)
        {
            throw new CjIntelligenceAuthorizationException(ex.Number);
        }
        catch (SqlException ex) when (ex.Number == 51010)
        {
            throw new CjIntelligenceIdentityException();
        }
        catch (SqlException ex) when (ex.Number == -2)
        {
            throw new CjIntelligenceSqlTimeoutException(ex);
        }
    }

    private static List<Dictionary<string, object?>> ToDictionaries(IEnumerable<dynamic> rows) =>
        rows.Select(r => ((IDictionary<string, object>)r).ToDictionary(kv => kv.Key, kv => (object?)kv.Value)).ToList();
}
