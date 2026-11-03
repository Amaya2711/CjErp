using System.Security.Claims;
using CjERP.Api.Controllers;
using CjERP.Application.DTOs.CjIntelligence;
using CjERP.Application.Interfaces.Services.AI;
using CjERP.Infrastructure.Persistence.Sql;
using CjERP.Infrastructure.Services;
using CjERP.Infrastructure.Services.AI.CjIntelligence;
using CjERP.Api.Configuration;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Xunit;
using Xunit.Abstractions;

namespace CjERP.Backend.Tests.Integration;

/// <summary>
/// IDENTIDAD PERMANENTE de extremo a extremo contra SQL (categoria SqlIdentity). OMITIDA por defecto: requiere scripts 18-20 aplicados, autorizacion
/// de escrituras de prueba y la conexion de administrador (solo para alterar la huella de la identidad que CREA ESTA PRUEBA y para ejecutar
/// sp_IA_Cj_Identidad_Resolver, que cj_ia NO puede ejecutar). Activacion: CJ_SQL_INTEGRATION=1, CJ_SQL_IDENTITY=1, ConnectionStrings__CjIntelligence,
/// ConnectionStrings__CjIntelligenceAdmin, CJ_TEST_USER_A (un usuario activo SIN uso previo del modulo: la prueba lo comprueba y FALLA si lo tuvo).
///
/// Recorre: login reutilizado (IdEmpleado distinto) -> denegado; CONTINUAR sin confirmar -> 51075; CONTINUAR -> acceso; mismo IdEmpleado con otro documento ->
/// CONTINUAR rechazado (51074); SEPARAR -> el historial anterior no es accesible desde los procedimientos (store) NI desde la API (controlador real + servicio
/// de chat real; el modelo y pagos explotan si se alcanzan); conversaciones nuevas con la identidad nueva; auditoria de ambas resoluciones.
/// Limpieza: solo lo que creo esta prueba (conversaciones por GUID; identidades y auditoria del login de prueba, que no tenia ninguna).
/// </summary>
[Trait("Category", "SqlIdentity")]
public sealed class SqlIdentityIntegrationTests : IAsyncLifetime
{
    private readonly ITestOutputHelper _output;
    private readonly List<Guid> _created = [];
    private string? _login;
    private bool _clean;

    public SqlIdentityIntegrationTests(ITestOutputHelper output) => _output = output;

    public Task InitializeAsync() => Task.CompletedTask;

    public async Task DisposeAsync()
    {
        if (!_clean || _login is null || Gates.Env("ConnectionStrings__CjIntelligenceAdmin") is not { } admin)
        {
            return;
        }

        await using var connection = new SqlConnection(admin);
        await connection.OpenAsync();
        foreach (var id in _created.Distinct())
        {
            await Exec(connection, """
                DELETE FROM dbo.IA_ResultadoConsulta WHERE IdConversacion = @g;
                DELETE FROM dbo.IA_Mensaje WHERE IdConversacion = @g;
                DELETE FROM dbo.IA_Turno WHERE IdConversacion = @g;
                DELETE FROM dbo.IA_ConversacionEstado WHERE IdConversacion = @g;
                DELETE FROM dbo.IA_Conversacion WHERE IdConversacion = @g AND Modulo = 'PRUEBA';
                """, ("@g", id));
        }

        // el login de prueba no tenia identidad ni auditoria antes de esta prueba (se comprobo): se eliminan las que genero
        await Exec(connection, "DELETE FROM dbo.IA_IdentidadAuditoria WHERE IdUsuario = @u;", ("@u", _login));
        await Exec(connection, "DELETE FROM dbo.IA_IdentidadUsuario WHERE IdUsuario = @u AND NOT EXISTS (SELECT 1 FROM dbo.IA_Conversacion c WHERE c.IdIdentidad = IA_IdentidadUsuario.IdIdentidad);", ("@u", _login));
    }

    private static async Task Exec(SqlConnection connection, string sql, params (string Name, object Value)[] parameters)
    {
        await using var cmd = new SqlCommand(sql, connection);
        foreach (var (name, value) in parameters)
        {
            cmd.Parameters.AddWithValue(name, value);
        }

        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task<T?> Scalar<T>(string sql, params (string Name, object Value)[] parameters)
    {
        await using var connection = new SqlConnection(Gates.Env("ConnectionStrings__CjIntelligenceAdmin"));
        await connection.OpenAsync();
        await using var cmd = new SqlCommand(sql, connection);
        foreach (var (name, value) in parameters)
        {
            cmd.Parameters.AddWithValue(name, value);
        }

        var result = await cmd.ExecuteScalarAsync();
        return result is null or DBNull ? default : (T)Convert.ChangeType(result, Nullable.GetUnderlyingType(typeof(T)) ?? typeof(T));
    }

    private static async Task<int?> ResolveErrorAsync(string login, string accion, bool confirma)
    {
        await using var connection = new SqlConnection(Gates.Env("ConnectionStrings__CjIntelligenceAdmin"));
        await connection.OpenAsync();
        await using var cmd = new SqlCommand("dbo.sp_IA_Cj_Identidad_Resolver", connection) { CommandType = System.Data.CommandType.StoredProcedure };
        cmd.Parameters.AddWithValue("@IdUsuario", login);
        cmd.Parameters.AddWithValue("@Accion", accion);
        cmd.Parameters.AddWithValue("@AprobadoPor", "prueba-integracion");
        cmd.Parameters.AddWithValue("@Motivo", "prueba automatica de identidad");
        cmd.Parameters.AddWithValue("@Evidencia", "evidencia de prueba suficiente (integracion)");
        cmd.Parameters.AddWithValue("@ConfirmaMismaPersona", confirma);
        try
        {
            await cmd.ExecuteNonQueryAsync();
            return null;                                              // sin error
        }
        catch (SqlException ex)
        {
            return ex.Number;
        }
    }

    private static SqlCjIntelligenceConversationStore Store() =>
        new(new CjIntelligenceSqlCommandFactory(new EnvConfiguration(), Options.Create(new SqlSettings())));

    private sealed class ExplodingProvider : IOpenAiToolChatProvider
    {
        public bool HasConfiguration(out string errorMessage) { errorMessage = string.Empty; return true; }
        public Task<OpenAiToolChatResult> SendAsync(IReadOnlyList<OpenAiToolChatMessage> messages, IReadOnlyList<OpenAiToolDefinition> tools, CancellationToken ct) =>
            throw new InvalidOperationException("El modelo no debia recibir nada.");
    }

    private sealed class ExplodingPagos : ICjIntelligencePagosGateway
    {
        public Task<PagosQueryResult> ResumenAsync(string login, string nivelSolicitado, PagosResumenArgs args, CancellationToken ct) =>
            throw new InvalidOperationException("No debia consultarse pagos.");
    }

    // La API usa el servicio REAL sobre el almacen REAL; solo el alcance se simplifica (la identidad la decide SQL, que es lo que se prueba).
    private sealed class AllowScopes : ICjIntelligenceScopeResolver
    {
        public Task<CjIntelligenceScopeDecision> ResolveAsync(string? idUsuario, CancellationToken ct) =>
            Task.FromResult(CjIntelligenceScopeDecision.Allow(IaResolvedScope.ForRestricted(IaScopeLevel.Propio, IaScopeFields.ResponsableOSolicitante, [10], false)));
    }

    private static CjIntelligenceController Api(string login)
    {
        var service = new CjIntelligenceChatService(new ExplodingProvider(), new AllowScopes(), Store(), new ExplodingPagos(), new CjIntelligenceOptions(),
            NullLogger<CjIntelligenceChatService>.Instance);
        var services = new ServiceCollection().AddSingleton<ICjIntelligenceChatService>(service).BuildServiceProvider();
        var user = new ClaimsPrincipal(new ClaimsIdentity([new Claim("IdUsuario", login)], "test"));
        return new CjIntelligenceController(services) { ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext { User = user } } };
    }

    private static int Status(IActionResult result) => result switch { ObjectResult o => o.StatusCode ?? 200, StatusCodeResult s => s.StatusCode, _ => 0 };

    [SqlIdentityFact]
    public async Task LoginReutilizado_ContinuarSoloConMismoDocumento_SepararArchivaElHistorial_ProcedimientosYApi()
    {
        var login = Gates.Env("CJ_TEST_USER_A")!;
        var ct = CancellationToken.None;
        var store = Store();

        // Precondicion: usuario SIN uso previo del modulo (la prueba solo toca lo que ella crea). Si no se cumple, FALLA: no se omite en silencio.
        var previo = await Scalar<int>("SELECT (SELECT COUNT(*) FROM dbo.IA_IdentidadUsuario WHERE IdUsuario = @u) + (SELECT COUNT(*) FROM dbo.IA_Conversacion WHERE IdUsuario = @u)", ("@u", login));
        Assert.True(previo == 0, "CJ_TEST_USER_A ya uso el modulo: elija un usuario activo sin conversaciones ni identidad.");
        _login = login;
        _clean = true;

        // 1. Primera huella: crear la primera conversacion registra la identidad
        var c1 = await store.CreateAsync(login, null, "PRUEBA", ct);
        _created.Add(c1);
        _output.WriteLine($"GUID de prueba creado: {c1}");
        var idOld = await Scalar<Guid>("SELECT IdIdentidad FROM dbo.IA_IdentidadUsuario WHERE IdUsuario = @u AND Estado = 'VIGENTE'", ("@u", login));
        Assert.Equal(idOld, await Scalar<Guid>("SELECT IdIdentidad FROM dbo.IA_Conversacion WHERE IdConversacion = @g", ("@g", c1)));
        var emp = await Scalar<int>("SELECT IdEmpleado FROM dbo.IA_IdentidadUsuario WHERE IdIdentidad = @i", ("@i", idOld));

        // 2. Login reutilizado (otro IdEmpleado): denegado desde los procedimientos y desde la API
        await using (var admin = new SqlConnection(Gates.Env("ConnectionStrings__CjIntelligenceAdmin")))
        {
            await admin.OpenAsync(ct);
            await Exec(admin, "UPDATE dbo.IA_IdentidadUsuario SET IdEmpleado = IdEmpleado + 900000 WHERE IdIdentidad = @i", ("@i", idOld));
        }

        await Assert.ThrowsAsync<CjIntelligenceIdentityException>(() => store.ListAsync(login, 1, 30, ct));
        await Assert.ThrowsAsync<CjIntelligenceIdentityException>(() => store.OpenAsync(login, c1, 0, 50, ct));
        await Assert.ThrowsAsync<CjIntelligenceIdentityException>(() => store.CreateAsync(login, null, "PRUEBA", ct));
        Assert.Equal(403, Status(await Api(login).Abrir(c1.ToString(), ct)));
        Assert.Equal(403, Status(await Api(login).Listar(1, 30, ct)));

        // 3. CONTINUAR exige confirmar la misma persona (no basta el login)
        Assert.Equal(51075, await ResolveErrorAsync(login, "CONTINUAR", confirma: false));
        await Assert.ThrowsAsync<CjIntelligenceIdentityException>(() => store.ListAsync(login, 1, 30, ct));
        Assert.Null(await ResolveErrorAsync(login, "CONTINUAR", confirma: true));         // mismo documento: permitido
        Assert.True((await store.OpenAsync(login, c1, 0, 50, ct)).Found);                 // historial intacto
        Assert.Equal(200, Status(await Api(login).Abrir(c1.ToString(), ct)));

        // 4. Mismo IdEmpleado, OTRO documento: CONTINUAR rechazado aunque se confirme
        await using (var admin = new SqlConnection(Gates.Env("ConnectionStrings__CjIntelligenceAdmin")))
        {
            await admin.OpenAsync(ct);
            await Exec(admin, "UPDATE dbo.IA_IdentidadUsuario SET HuellaDocumento = REPLICATE('A', 64) WHERE IdIdentidad = @i", ("@i", idOld));
        }

        await Assert.ThrowsAsync<CjIntelligenceIdentityException>(() => store.OpenAsync(login, c1, 0, 50, ct));
        Assert.Equal(51074, await ResolveErrorAsync(login, "CONTINUAR", confirma: true));
        await Assert.ThrowsAsync<CjIntelligenceIdentityException>(() => store.OpenAsync(login, c1, 0, 50, ct));

        // 5. SEPARAR: otra persona. El historial anterior ya no es accesible (procedimientos Y API); el login arranca vacio
        Assert.Null(await ResolveErrorAsync(login, "SEPARAR", confirma: false));
        Assert.False((await store.OpenAsync(login, c1, 0, 50, ct)).Found);
        Assert.Empty(await store.ListAsync(login, 1, 30, ct));
        Assert.False(await store.RenameAsync(login, c1, "secuestrada", ct));
        Assert.False(await store.DeleteAsync(login, c1, ct));
        var api = Api(login);
        Assert.Equal(404, Status(await api.Abrir(c1.ToString(), ct)));
        Assert.Equal(404, Status(await api.Renombrar(c1.ToString(), new CjAiRenameRequestDto { Titulo = "x" }, ct)));
        Assert.Equal(404, Status(await api.Eliminar(c1.ToString(), ct)));
        Assert.Equal(404, Status(await api.Chat(new CjAiChatRequestDto { Message = "pagos", ClientMessageId = Guid.NewGuid().ToString(), ConversationId = c1.ToString() }, ct)));
        Assert.Equal(200, Status(await api.Listar(1, 30, ct)));

        // 6. Las conversaciones anteriores y las nuevas quedan identificadas de forma permanente
        Assert.Equal(1, await Scalar<int>("SELECT COUNT(*) FROM dbo.IA_Conversacion WHERE IdConversacion = @g AND IdIdentidad = @i AND IdUsuario LIKE N'~retirada:%'", ("@g", c1), ("@i", idOld)));
        var c2 = await store.CreateAsync(login, null, "PRUEBA", ct);
        _created.Add(c2);
        var idNew = await Scalar<Guid>("SELECT IdIdentidad FROM dbo.IA_IdentidadUsuario WHERE IdUsuario = @u AND Estado = 'VIGENTE'", ("@u", login));
        Assert.NotEqual(idOld, idNew);
        Assert.Equal(idNew, await Scalar<Guid>("SELECT IdIdentidad FROM dbo.IA_Conversacion WHERE IdConversacion = @g", ("@g", c2)));
        Assert.Equal("RETIRADA", await Scalar<string>("SELECT Estado FROM dbo.IA_IdentidadUsuario WHERE IdIdentidad = @i", ("@i", idOld)));

        // 7. Auditoria de CONTINUAR y SEPARAR: administrador, fecha, motivo y valores anteriores/posteriores
        Assert.Equal(2, await Scalar<int>("SELECT COUNT(*) FROM dbo.IA_IdentidadAuditoria WHERE IdUsuario = @u AND AdminSql IS NOT NULL AND AprobadoPor = 'prueba-integracion' AND Motivo IS NOT NULL AND Evidencia IS NOT NULL AND FechaUtc IS NOT NULL", ("@u", login)));
        Assert.Equal(1, await Scalar<int>("SELECT COUNT(*) FROM dbo.IA_IdentidadAuditoria WHERE IdUsuario = @u AND Accion = 'CONTINUAR' AND IdEmpleadoAnterior = @e + 900000 AND IdEmpleadoPosterior = @e AND HuellaDocAnterior = HuellaDocPosterior", ("@u", login), ("@e", emp)));
        Assert.Equal(1, await Scalar<int>("SELECT COUNT(*) FROM dbo.IA_IdentidadAuditoria WHERE IdUsuario = @u AND Accion = 'SEPARAR' AND IdIdentidadAnterior = @a AND IdIdentidadPosterior = @b AND HuellaDocAnterior = REPLICATE('A', 64) AND ConversacionesArchivadas >= 1", ("@u", login), ("@a", idOld), ("@b", idNew)));
    }
}
