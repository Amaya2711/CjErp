using CjERP.Api.Configuration;
using Xunit.Abstractions;
using CjERP.Application.Interfaces.Services.AI;
using CjERP.Infrastructure.Persistence.Sql;
using CjERP.Infrastructure.Services;
using CjERP.Infrastructure.Services.AI.CjIntelligence;
using CjERP.Shared.Configuration;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Options;
using Xunit;


namespace CjERP.Backend.Tests.Integration;

// Configuracion minima: solo expone ConnectionStrings:CjIntelligence desde la variable de entorno ConnectionStrings__CjIntelligence
// (sin agregar paquetes). Nunca se imprime la cadena.
internal sealed class EnvConfiguration : IConfiguration
{
    private static string? Value(string key) =>
        string.Equals(key, "ConnectionStrings:CjIntelligence", StringComparison.OrdinalIgnoreCase) ? Gates.Env("ConnectionStrings__CjIntelligence") : null;

    public string? this[string key] { get => Value(key); set => throw new NotSupportedException(); }

    public IConfigurationSection GetSection(string key) => new Section(key);

    public IEnumerable<IConfigurationSection> GetChildren() => [];

    public Microsoft.Extensions.Primitives.IChangeToken GetReloadToken() => new Microsoft.Extensions.Primitives.CancellationChangeToken(CancellationToken.None);

    private sealed class Section(string path) : IConfigurationSection
    {
        public string Key => path;
        public string Path => path;
        public string? Value { get => EnvConfiguration.Value(path); set => throw new NotSupportedException(); }
        public string? this[string key] { get => EnvConfiguration.Value($"{path}:{key}"); set => throw new NotSupportedException(); }
        public IConfigurationSection GetSection(string key) => new Section($"{path}:{key}");
        public IEnumerable<IConfigurationSection> GetChildren() => [];
        public Microsoft.Extensions.Primitives.IChangeToken GetReloadToken() => new Microsoft.Extensions.Primitives.CancellationChangeToken(CancellationToken.None);
    }
}

/// <summary>
/// INTEGRACION SQL (categoria SqlIntegration). Se omite salvo que se active (ver TestGates.cs). Conexion REAL como cj_ia a JC_Db.
/// ESCRIBE una conversacion de prueba (Modulo = PRUEBA) por ejecucion: cj_ia no puede borrar filas; se elimina de forma LOGICA y el
/// GUID se imprime para limpiarla despues con el script 23b (administrador). No consulta pagos.
/// </summary>
[Trait("Category", "SqlIntegration")]
public sealed class SqlPersistenceIntegrationTests : IAsyncLifetime
{
    private readonly ITestOutputHelper _output;
    private readonly List<Guid> _created = [];   // SOLO lo que crea esta prueba; se limpia siempre al terminar (aunque falle)

    public SqlPersistenceIntegrationTests(ITestOutputHelper output) => _output = output;

    public Task InitializeAsync() => Task.CompletedTask;

    public Task DisposeAsync() => OwnTestCleanup.DeleteAsync(_created, CancellationToken.None);

    private static SqlCjIntelligenceConversationStore Store() =>
        new(new CjIntelligenceSqlCommandFactory(new EnvConfiguration(), Options.Create(new SqlSettings())));

    [SqlIntegrationFact]
    public async Task Conversacion_FlujoCompleto_IdempotenciaBloqueoYAislamientoEntreUsuarios()
    {
        var store = Store();
        var a = Gates.Env("CJ_TEST_USER_A")!;
        var b = Gates.Env("CJ_TEST_USER_B")!;
        var ct = CancellationToken.None;

        var conversation = await store.CreateAsync(a, null, "PRUEBA", ct);
        _created.Add(conversation);                      // se limpia al terminar (si hay conexion de administrador)
        _output.WriteLine($"GUID de prueba creado (limpiar con 23b): {conversation}");

        var client = Guid.NewGuid();
        var owner = Guid.NewGuid();
        var start = await store.StartTurnAsync(a, conversation, client, owner, "pregunta de integracion", 120, ct);
        Assert.Equal(CjTurnResults.New, start.Resultado);

        // misma peticion desde otra solicitud mientras sigue viva
        Assert.Equal(CjTurnResults.InProgress, (await store.StartTurnAsync(a, conversation, client, Guid.NewGuid(), "pregunta de integracion", 120, ct)).Resultado);
        // usuario ajeno: no existe para el
        Assert.Equal(CjTurnResults.NotFound, (await store.StartTurnAsync(b, conversation, Guid.NewGuid(), Guid.NewGuid(), "intruso", 120, ct)).Resultado);
        Assert.False((await store.OpenAsync(b, conversation, 0, 50, ct)).Found);

        // una solicitud sin bloqueo no puede escribir
        await Assert.ThrowsAsync<CjIntelligenceLockLostException>(() =>
            store.CompleteAsync(start.IdTurno!.Value, Guid.NewGuid(), new CjCompleteRequest("respuesta ilegitima", "stop", null, null, null, null), ct));
        Assert.False(await store.RenewAsync(start.IdTurno!.Value, Guid.NewGuid(), 120, ct));
        Assert.True(await store.RenewAsync(start.IdTurno!.Value, owner, 120, ct));

        await store.CompleteAsync(start.IdTurno!.Value, owner, new CjCompleteRequest("respuesta de integracion", "stop", "modelo-prueba", 1, 1, 1), ct);

        // reintento de una peticion completada: devuelve lo guardado
        // el mismo identificador con OTRO contenido es un conflicto: no se reproduce en silencio
        Assert.Equal(CjTurnResults.ContentMismatch, (await store.StartTurnAsync(a, conversation, client, Guid.NewGuid(), "otro texto", 120, ct)).Resultado);
        var replay = await store.StartTurnAsync(a, conversation, client, Guid.NewGuid(), "pregunta de integracion", 120, ct);
        Assert.Equal(CjTurnResults.Completed, replay.Resultado);
        Assert.Equal("respuesta de integracion", replay.ContenidoAsistente);

        var open = await store.OpenAsync(a, conversation, 0, 50, ct);
        Assert.True(open.Found);
        Assert.Equal(new[] { 1, 2 }, open.Messages.Select(m => m.Secuencia).ToArray());     // orden estable

        Assert.False(await store.DeleteAsync(b, conversation, ct));                          // ajeno no elimina
        Assert.True(await store.DeleteAsync(a, conversation, ct));                           // borrado logico
    }

    [SqlIntegrationFact]
    public async Task Identidad_Inexistente_SeDeniega()
    {
        await Assert.ThrowsAsync<CjIntelligenceIdentityException>(() => Store().ListAsync("__usuario_que_no_existe__", 1, 10, CancellationToken.None));
    }

    [SqlIntegrationFact]
    public async Task Autorizacion_PorProcedimientos_ResuelveSinPermisosDeTabla()
    {
        var factory = new CjIntelligenceSqlCommandFactory(new EnvConfiguration(), Options.Create(new SqlSettings()));
        var data = new SqlCjIntelligenceAuthorizationData(factory);
        var login = Gates.Env("CJ_TEST_USER_A")!;

        var rows = await data.GetPermissionRowsAsync(login, CjIntelligenceTools.PagosPermission, CancellationToken.None);
        var none = await data.GetPermissionRowsAsync("__usuario_que_no_existe__", CjIntelligenceTools.PagosPermission, CancellationToken.None);

        _output.WriteLine($"Concesiones de {login}: {rows.Count}");
        Assert.Empty(none);                                                                  // usuario inexistente/inactivo: sin concesiones
    }
}

/// <summary>
/// Limpieza de las pruebas de concurrencia: borra SOLO las conversaciones cuyo GUID creo la propia prueba (y solo si Modulo = 'PRUEBA'),
/// de hijas a padres, y la identidad permanente de su propietario unicamente si nacio con la prueba (el propietario no conserva otras
/// conversaciones ni turnos y la identidad esta VIGENTE sin resolucion; misma regla que el script 23b). Nunca por usuario, fecha ni patron.
/// Usa la conexion de administrador ya exigida por la compuerta de concurrencia.
/// </summary>
internal static class OwnTestCleanup
{
    public static async Task DeleteAsync(IEnumerable<Guid> conversations, CancellationToken ct)
    {
        var ids = conversations.Distinct().ToList();
        if (ids.Count == 0 || Gates.Env("ConnectionStrings__CjIntelligenceAdmin") is not { } admin)
        {
            return;
        }

        await using var connection = new SqlConnection(admin);
        await connection.OpenAsync(ct);
        await using var tx = (SqlTransaction)await connection.BeginTransactionAsync(ct);
        foreach (var id in ids)
        {
            const string sql = """
                DECLARE @dueno NVARCHAR(50) = (SELECT IdUsuario FROM dbo.IA_Conversacion WHERE IdConversacion = @g AND Modulo = 'PRUEBA');
                IF @dueno IS NULL RETURN;   -- no existe o no es de PRUEBA: no se toca
                DELETE FROM dbo.IA_ResultadoConsulta WHERE IdConversacion = @g;
                DELETE FROM dbo.IA_Mensaje WHERE IdConversacion = @g;
                DELETE FROM dbo.IA_Turno WHERE IdConversacion = @g;
                DELETE FROM dbo.IA_ConversacionEstado WHERE IdConversacion = @g;
                DELETE FROM dbo.IA_Conversacion WHERE IdConversacion = @g;
                DELETE i FROM dbo.IA_IdentidadUsuario i
                WHERE i.IdUsuario = @dueno AND i.Estado = 'VIGENTE' AND i.Resolucion IS NULL
                  AND NOT EXISTS (SELECT 1 FROM dbo.IA_Conversacion c WHERE c.IdUsuario = @dueno)
                  AND NOT EXISTS (SELECT 1 FROM dbo.IA_Turno t WHERE t.IdUsuario = @dueno);
                """;
            await using var cmd = new SqlCommand(sql, connection, tx);
            cmd.Parameters.AddWithValue("@g", id);
            await cmd.ExecuteNonQueryAsync(ct);
        }

        await tx.CommitAsync(ct);
    }

    public static async Task<int> CountAsync(string sql, Action<SqlCommand> parameters, CancellationToken ct)
    {
        await using var connection = new SqlConnection(Gates.Env("ConnectionStrings__CjIntelligenceAdmin"));
        await connection.OpenAsync(ct);
        await using var cmd = new SqlCommand(sql, connection);
        parameters(cmd);
        return Convert.ToInt32(await cmd.ExecuteScalarAsync(ct));
    }
}

/// <summary>
/// CONCURRENCIA CON DOS SESIONES (categoria SqlConcurrency). Se omite salvo activacion expresa (ver TestGates.cs).
///
/// Las pruebas secuenciales (script 22) no cubren esto: una solicitud antigua que valida su bloqueo y, ANTES de escribir, ve como otra
/// solicitud lo adquiere. Aqui se FUERZA esa intercalacion: una sesion de administrador retiene un bloqueo de tabla sobre la tabla destino de
/// la escritura. La sesion A (propietaria) valida y queda detenida justo antes de escribir; la sesion B intenta adquirir el bloqueo de la
/// misma conversacion. Con la correccion (validar y escribir en UNA transaccion que toma la fila de la conversacion con UPDLOCK + HOLDLOCK),
/// B queda esperando y NO puede adquirir entre la validacion y la escritura; al liberarse la tabla, A escribe y recien entonces B decide.
/// Escribe una conversacion de prueba (Modulo = PRUEBA); su GUID se imprime para limpiarla con el script 23b. No consulta pagos.
/// </summary>
[Trait("Category", "SqlConcurrency")]
public sealed class SqlConcurrencyIntegrationTests : IAsyncLifetime
{
    private readonly ITestOutputHelper _output;
    private readonly List<Guid> _created = [];   // SOLO lo que crea esta prueba; se limpia siempre al terminar (aunque falle)

    public Task InitializeAsync() => Task.CompletedTask;

    public Task DisposeAsync() => OwnTestCleanup.DeleteAsync(_created, CancellationToken.None);

    public SqlConcurrencyIntegrationTests(ITestOutputHelper output) => _output = output;

    private static SqlCjIntelligenceConversationStore Store() =>
        new(new CjIntelligenceSqlCommandFactory(new EnvConfiguration(), Options.Create(new SqlSettings())));

    [SqlConcurrencyTheory]
    [InlineData("RESULTADO", "IA_ResultadoConsulta", CjTurnResults.Conflict)]    // A sigue siendo propietaria: B encuentra el bloqueo vigente
    [InlineData("ESTADO", "IA_ConversacionEstado", CjTurnResults.Conflict)]
    [InlineData("COMPLETAR", "IA_Mensaje", CjTurnResults.New)]                   // A completa y libera: solo entonces B puede adquirir
    public async Task NingunaSolicitudAdquiereElBloqueoEntreValidarYEscribir(string operacion, string tablaRetenida, string esperadoParaB)
    {
        var store = Store();
        var login = Gates.Env("CJ_TEST_USER_A")!;
        var ct = CancellationToken.None;

        var conversation = await store.CreateAsync(login, null, "PRUEBA", ct);
        _created.Add(conversation);
        _output.WriteLine($"GUID de prueba creado (limpiar con 23b): {conversation}");
        var ownerA = Guid.NewGuid();
        var start = await store.StartTurnAsync(login, conversation, Guid.NewGuid(), ownerA, "pregunta de concurrencia", 120, ct);
        Assert.Equal(CjTurnResults.New, start.Resultado);
        var turn = start.IdTurno!.Value;

        // Sesion de administrador: retiene un bloqueo de tabla SOLO sobre la tabla destino de la escritura de A (una tabla nueva de CJ Intelligence).
        await using var admin = new SqlConnection(Gates.Env("ConnectionStrings__CjIntelligenceAdmin"));
        await admin.OpenAsync(ct);
        await using var hold = (SqlTransaction)await admin.BeginTransactionAsync(ct);
        using (var cmd = new SqlCommand($"SELECT TOP (1) 1 FROM dbo.{tablaRetenida} WITH (TABLOCKX, HOLDLOCK)", admin, hold))
        {
            await cmd.ExecuteScalarAsync(ct);
        }

        // Sesion A: valida su bloqueo y queda detenida al escribir (la tabla esta retenida).
        Task writeA = operacion switch
        {
            "RESULTADO" => store.RecordResultAsync(turn, ownerA, new CjResultRecord(1, "prueba", "{}", "PROPIO", null, "OK", 1, 1, false, null, null, null, 10, null, null, "10", false), ct),
            "ESTADO" => store.SaveStateAsync(turn, ownerA, 0, "{}", ct),
            _ => store.CompleteAsync(turn, ownerA, new CjCompleteRequest("respuesta", "stop", "modelo-prueba", 1, 1, 1), ct)
        };

        await Task.Delay(1500, ct);
        Assert.False(writeA.IsCompleted, "A debia quedar detenida justo antes de escribir.");

        // Sesion B: otra solicitud intenta adquirir el bloqueo de la MISMA conversacion mientras A esta entre validar y escribir.
        var ownerB = Guid.NewGuid();
        var acquireB = store.StartTurnAsync(login, conversation, Guid.NewGuid(), ownerB, "otra peticion", 120, ct);
        await Task.Delay(1500, ct);
        Assert.False(acquireB.IsCompleted, "B NO puede adquirir el bloqueo mientras A esta entre validar y escribir: debe esperar.");

        await hold.CommitAsync(ct);                       // se libera la tabla: A escribe y termina; B decide despues
        await writeA.WaitAsync(TimeSpan.FromSeconds(30), ct);
        var b = await acquireB.WaitAsync(TimeSpan.FromSeconds(30), ct);

        Assert.Equal(esperadoParaB, b.Resultado);

        var open = await store.OpenAsync(login, conversation, 0, 50, ct);
        if (operacion == "RESULTADO")
        {
            Assert.Single(open.Results, r => r.IdTurno == turn);          // escribio A, una sola vez
        }

        if (operacion == "COMPLETAR")
        {
            Assert.Single(open.Messages, m => m.IdTurno == turn && m.Rol == "assistant");
        }

        // limpieza: libera lo que haya quedado en curso y elimina (logicamente) la conversacion
        if (b.IdTurno is { } bTurn && b.Resultado == CjTurnResults.New)
        {
            await store.FailAsync(bTurn, ownerB, "ERROR", "prueba de concurrencia", ct);
        }

        await store.FailAsync(turn, ownerA, "ERROR", "prueba de concurrencia", ct);
    }

    /// <summary>
    /// PRIMER MENSAJE SIMULTANEO sin conversationId: N solicitudes concurrentes con el MISMO ClientMessageId (el cliente reintenta sin haber
    /// recibido el conversationId). Debe quedar UNA sola conversacion y UN solo turno; solo una solicitud obtiene NUEVO y las demas
    /// EN_CURSO (mismo contenido) o CONTENIDO_DISTINTO (otro contenido). No consulta pagos.
    /// </summary>
    [SqlConcurrencyTheory]
    [InlineData(2, true)]
    [InlineData(8, true)]
    [InlineData(8, false)]
    public async Task PrimerMensajeSimultaneoSinConversationId_NoDuplicaConversacionesNiTurnos(int solicitudes, bool mismoContenido)
    {
        var store = Store();
        var login = Gates.Env("CJ_TEST_USER_A")!;
        var ct = CancellationToken.None;
        var clientMessageId = Guid.NewGuid();

        var starts = await Task.WhenAll(Enumerable.Range(0, solicitudes).Select(i => Task.Run(() =>
            store.StartTurnInNewConversationAsync(login, clientMessageId, Guid.NewGuid(),
                mismoContenido ? "primer mensaje simultaneo" : $"primer mensaje simultaneo {i}", "PRUEBA", 120, ct))));

        foreach (var conversation in starts.Where(s => s.IdConversacion is not null).Select(s => s.IdConversacion!.Value).Distinct())
        {
            _created.Add(conversation);                                       // lo creado por esta prueba, para limpiarlo siempre
            _output.WriteLine($"GUID de prueba creado: {conversation}");
        }

        Assert.Equal(1, starts.Count(s => s.Resultado == CjTurnResults.New));
        var expectedOthers = mismoContenido ? new[] { CjTurnResults.InProgress } : new[] { CjTurnResults.ContentMismatch, CjTurnResults.InProgress };
        Assert.All(starts.Where(s => s.Resultado != CjTurnResults.New), s => Assert.Contains(s.Resultado, expectedOthers));
        Assert.Single(starts.Where(s => s.IdConversacion is not null).Select(s => s.IdConversacion).Distinct());

        var turns = await OwnTestCleanup.CountAsync(
            "SELECT COUNT(*) FROM dbo.IA_Turno WHERE IdUsuario = @u AND ClientMessageId = @c", c => { c.Parameters.AddWithValue("@u", login); c.Parameters.AddWithValue("@c", clientMessageId); }, ct);
        Assert.Equal(1, turns);                                               // un solo turno

        var conversations = await OwnTestCleanup.CountAsync(
            "SELECT COUNT(DISTINCT t.IdConversacion) FROM dbo.IA_Turno t WHERE t.IdUsuario = @u AND t.ClientMessageId = @c", c => { c.Parameters.AddWithValue("@u", login); c.Parameters.AddWithValue("@c", clientMessageId); }, ct);
        Assert.Equal(1, conversations);                                       // una sola conversacion

    }
}

/// <summary>
/// UNA consulta REAL de pagos bajo cj_ia (categoria PagosReal): equivale al script 24. Exige activacion y autorizacion APARTE
/// (CJ_SQL_PAGOS_REAL=1). Demuestra que el procedimiento FIRMADO ejecuta el SQL dinamico del modo RESUMEN con los privilegios minimos.
/// Alcance de un empleado y un solo dia.
/// </summary>
[Trait("Category", "PagosReal")]
public sealed class PagosRealIntegrationTests
{
    [PagosRealFact]
    public async Task ResumenDeUnDia_AlcancePropio_EjecutaElSqlDinamicoConLaFirma()
    {
        var factory = new CjIntelligenceSqlCommandFactory(new EnvConfiguration(), Options.Create(new SqlSettings()));
        var gateway = new SqlCjIntelligencePagosGateway(factory);
        var login = Gates.Env("CJ_TEST_USER_PROPIO")!;
        var day = DateOnly.ParseExact(Gates.Env("CJ_PAGOS_FECHA")!, "yyyy-MM-dd");

        var args = CjIntelligencePagosTools.ParseResumen(
            $$"""{"fechaInicio":"{{day:yyyy-MM-dd}}","fechaFin":"{{day:yyyy-MM-dd}}","agruparPor":["MONEDA"],"top":5}""").Value!;

        var result = await gateway.ResumenAsync(login, "PROPIO", args, CancellationToken.None);

        Assert.Equal("PROPIO", result.NivelAplicado);
        Assert.False(string.IsNullOrWhiteSpace(result.EmpleadosAplicados));
        Assert.DoesNotContain(',', result.EmpleadosAplicados!);
        Assert.False(result.GlobalesAplicado);
    }
}

/// <summary>
/// LLAMADAS REALES A OPENAI (categoria OpenAiLive). Se omiten salvo OPENAI_LIVE_TESTS=1 y OPENAI_API_KEY. Mensajes cortos, sin datos
/// del ERP. Modelo configurable: OPENAI_MODEL (por defecto gpt-4.1-mini, el configurado hoy). La clave solo viene del entorno.
/// </summary>
[Trait("Category", "OpenAiLive")]
public sealed class OpenAiLiveTests
{
    private static OpenAiToolChatProvider Provider()
    {
        var settings = new OpenAiSettings { ApiKey = Gates.Env("OPENAI_API_KEY")!, Model = Gates.Env("OPENAI_MODEL") ?? "gpt-4.1-mini", MaxTokens = 400 };
        return new OpenAiToolChatProvider(new HttpClient { Timeout = TimeSpan.FromSeconds(90) }, Options.Create(settings));
    }

    [OpenAiLiveFact]
    public async Task RespondeTextoConTokensYModelo()
    {
        var result = await Provider().SendAsync([OpenAiToolChatMessage.User("Responde unicamente la palabra: listo")], [], CancellationToken.None);

        Assert.False(string.IsNullOrWhiteSpace(result.Content));
        Assert.True(result.PromptTokens > 0 && result.CompletionTokens > 0);
        Assert.False(string.IsNullOrWhiteSpace(result.Model));
    }

    [OpenAiLiveFact]
    public async Task ConHerramientas_ElModeloPideLaHerramientaConArgumentosQueElBackendValida()
    {
        var messages = new[]
        {
            OpenAiToolChatMessage.System(CjIntelligenceChatService.SystemPrompt),
            OpenAiToolChatMessage.User("Resume los pagos de octubre de 2026 por cliente.")
        };

        var result = await Provider().SendAsync(messages, CjIntelligencePagosTools.Definitions(), CancellationToken.None);

        // Puede pedir la herramienta o aclarar algo; si la pide, sus argumentos deben pasar la validacion estricta del backend.
        Assert.True(result.ToolCalls.Count > 0 || !string.IsNullOrWhiteSpace(result.Content));
        foreach (var call in result.ToolCalls)
        {
            Assert.Equal(CjIntelligencePagosTools.ResumenName, call.Name);
            var parsed = CjIntelligencePagosTools.ParseResumen(call.ArgumentsJson);
            Assert.True(parsed.Ok, parsed.Error);
        }
    }
}
