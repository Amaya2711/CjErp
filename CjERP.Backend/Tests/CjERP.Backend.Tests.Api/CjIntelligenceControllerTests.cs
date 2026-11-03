using System.Reflection;
using System.Security.Claims;
using CjERP.Api.Configuration;
using CjERP.Api.Controllers;
using CjERP.Application.DTOs.CjIntelligence;
using CjERP.Application.Interfaces.Services.AI;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace CjERP.Backend.Tests.Api;

/// <summary>
/// PRUEBAS UNITARIAS del controlador /api/ai y del registro de CJ Intelligence. Sin servidor, sin SQL y sin OpenAI:
/// el servicio de chat es un doble. Verifican que la identidad sale SOLO del claim del JWT, los codigos de estado y que el
/// modulo queda deshabilitado mientras no este registrado.
/// </summary>
[Trait("Category", "Unit")]
public sealed class CjIntelligenceControllerTests
{
    private sealed class SpyService : ICjIntelligenceChatService
    {
        public List<(string Login, CjAiChatRequestDto Request)> Chats { get; } = [];
        public List<string> Logins { get; } = [];
        public List<string> Ids { get; } = [];
        public Func<CjAiResult<CjAiChatResponseDto>>? ChatResult { get; set; }

        public Task<CjAiResult<CjAiChatResponseDto>> ChatAsync(string login, CjAiChatRequestDto request, CancellationToken ct)
        {
            Chats.Add((login, request));
            return Task.FromResult(ChatResult?.Invoke() ?? CjAiResult<CjAiChatResponseDto>.Success(new CjAiChatResponseDto { Answer = "ok" }));
        }

        public Task<CjAiResult<List<CjAiConversationDto>>> ListarAsync(string login, int pagina, int tamano, CancellationToken ct)
        {
            Logins.Add(login);
            return Task.FromResult(CjAiResult<List<CjAiConversationDto>>.Success([]));
        }

        public Task<CjAiResult<CjAiConversationDetailDto>> AbrirAsync(string login, string id, CancellationToken ct)
        {
            Logins.Add(login); Ids.Add(id);
            return Task.FromResult(CjAiResult<CjAiConversationDetailDto>.Fail(CjAiErrorCodes.NotFound, "no", 404));
        }

        public Task<CjAiResult<bool>> RenombrarAsync(string login, string id, string titulo, CancellationToken ct)
        {
            Logins.Add(login); Ids.Add(id + "|" + titulo);
            return Task.FromResult(CjAiResult<bool>.Success(true));
        }

        public Task<CjAiResult<bool>> EliminarAsync(string login, string id, CancellationToken ct)
        {
            Logins.Add(login); Ids.Add(id);
            return Task.FromResult(CjAiResult<bool>.Success(true));
        }
    }

    private static CjIntelligenceController Controller(ICjIntelligenceChatService? service, ClaimsPrincipal? user,
        CjERP.Infrastructure.Services.AI.CjIntelligence.CjIntelligenceOptions? options = null)
    {
        var services = new ServiceCollection();
        if (service is not null)
        {
            services.AddSingleton(service);
        }

        if (options is not null)
        {
            services.AddSingleton(options);
        }

        var controller = new CjIntelligenceController(services.BuildServiceProvider())
        {
            ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext { User = user ?? new ClaimsPrincipal(new ClaimsIdentity()) } }
        };
        return controller;
    }

    private static ClaimsPrincipal WithLogin(string login) => new(new ClaimsIdentity([new Claim("IdUsuario", login)], "test"));

    private static (int Status, string Json) Read(IActionResult result)
    {
        var (status, value) = result switch
        {
            ObjectResult o => (o.StatusCode ?? 200, o.Value),
            StatusCodeResult s => (s.StatusCode, null),
            _ => (0, null)
        };
        return (status, System.Text.Json.JsonSerializer.Serialize(value));
    }

    // ------------------------------------------------------------------ autenticacion y ruta

    [Fact]
    public void ElControladorExigeAutenticacion_YNingunaAccionEsAnonima()
    {
        var type = typeof(CjIntelligenceController);

        Assert.NotNull(type.GetCustomAttribute<AuthorizeAttribute>());
        Assert.Equal("api/ai", type.GetCustomAttribute<RouteAttribute>()!.Template);
        Assert.DoesNotContain(type.GetMethods(BindingFlags.Public | BindingFlags.Instance | BindingFlags.DeclaredOnly),
            m => m.GetCustomAttribute<AllowAnonymousAttribute>() is not null);
    }

    [Fact]
    public void Chat_LimitaElTamanoDeLaPeticion()
    {
        var chat = typeof(CjIntelligenceController).GetMethod(nameof(CjIntelligenceController.Chat))!;
        Assert.NotNull(chat.GetCustomAttribute<RequestSizeLimitAttribute>());      // 32 KB (el valor no es publico en el atributo)
    }

    // ------------------------------------------------------------------ deshabilitado mientras no este registrado

    [Fact]
    public void Status_SinModuloRegistrado_EsDeshabilitado()
    {
        var (status, json) = Read(Controller(null, WithLogin("jperez")).Status());

        Assert.Equal(200, status);
        Assert.Contains("\"Enabled\":false", json);
        Assert.Contains("\"Available\":false", json);
    }

    [Fact]
    public async Task Chat_SinModuloRegistrado_Es503ConCodigoDeshabilitado()
    {
        var (status, json) = Read(await Controller(null, WithLogin("jperez")).Chat(new CjAiChatRequestDto { Message = "hola" }, CancellationToken.None));

        Assert.Equal(503, status);
        Assert.Contains(CjAiErrorCodes.Disabled, json);
    }

    [Fact]
    public async Task TodasLasAcciones_SinModuloRegistrado_Son503()
    {
        var controller = Controller(null, WithLogin("jperez"));
        var all = new[]
        {
            Read(await controller.Listar(1, 30, CancellationToken.None)).Status,
            Read(await controller.Abrir("x", CancellationToken.None)).Status,
            Read(await controller.Renombrar("x", new CjAiRenameRequestDto { Titulo = "t" }, CancellationToken.None)).Status,
            Read(await controller.Eliminar("x", CancellationToken.None)).Status
        };

        Assert.All(all, s => Assert.Equal(503, s));
    }

    // ------------------------------------------------------------------ identidad solo desde el claim

    [Fact]
    public void Status_ConModuloYClaim_EstaDisponible_SinClaimNo()
    {
        var spy = new SpyService();

        Assert.Contains("\"Available\":true", Read(Controller(spy, WithLogin("jperez")).Status()).Json);
        Assert.Contains("\"Enabled\":true", Read(Controller(spy, WithLogin("jperez")).Status()).Json);
        Assert.Contains("\"Available\":false", Read(Controller(spy, null).Status()).Json);
    }

    [Fact]
    public async Task Chat_SinClaimIdUsuario_Es403_YNoLlegaAlServicio()
    {
        var spy = new SpyService();
        // solo hay Identity.Name: NO se acepta como respaldo
        var onlyName = new ClaimsPrincipal(new ClaimsIdentity([new Claim(ClaimTypes.Name, "jperez")], "test"));

        var (status, json) = Read(await Controller(spy, onlyName).Chat(new CjAiChatRequestDto { Message = "hola" }, CancellationToken.None));

        Assert.Equal(403, status);
        Assert.Contains(CjAiErrorCodes.PermissionDenied, json);
        Assert.Empty(spy.Chats);
    }

    [Fact]
    public async Task Chat_ClaimsContradictorios_Es403()
    {
        var spy = new SpyService();
        var user = new ClaimsPrincipal(new ClaimsIdentity([new Claim("IdUsuario", "ana"), new Claim("IdUsuario", "luis")], "test"));

        var (status, _) = Read(await Controller(spy, user).Chat(new CjAiChatRequestDto { Message = "hola" }, CancellationToken.None));

        Assert.Equal(403, status);
        Assert.Empty(spy.Chats);
    }

    [Fact]
    public async Task Chat_UsaElLoginDelJwt_ElCuerpoNoPuedeCambiarlo()
    {
        var spy = new SpyService();
        var request = new CjAiChatRequestDto { Message = "pagos de octubre", ConversationId = Guid.NewGuid().ToString(), ClientMessageId = Guid.NewGuid().ToString() };

        var (status, json) = Read(await Controller(spy, WithLogin("LRODRÍGUEZ")).Chat(request, CancellationToken.None));

        Assert.Equal(200, status);
        Assert.Contains("\"success\":true", json);
        var call = Assert.Single(spy.Chats);
        Assert.Equal("LRODRÍGUEZ", call.Login);                     // tal cual, con acento: no se normaliza
        Assert.Same(request, call.Request);
        Assert.DoesNotContain(typeof(CjAiChatRequestDto).GetProperties(), p => p.Name.Contains("Usuario", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public async Task Chat_PeticionNula_SeTrataComoVacia_NoLanza()
    {
        var spy = new SpyService();

        var (status, _) = Read(await Controller(spy, WithLogin("jperez")).Chat(null!, CancellationToken.None));

        Assert.Equal(200, status);
        Assert.Null(Assert.Single(spy.Chats).Request.Message);
    }

    [Theory]
    [InlineData(CjAiErrorCodes.Busy, 409)]
    [InlineData(CjAiErrorCodes.PermissionDenied, 403)]
    [InlineData(CjAiErrorCodes.OpenAiUnavailable, 502)]
    [InlineData(CjAiErrorCodes.SqlTimeout, 504)]
    [InlineData(CjAiErrorCodes.InvalidRequest, 400)]
    [InlineData(CjAiErrorCodes.IdempotencyConflict, 409)]
    [InlineData(CjAiErrorCodes.ScopeReduced, 403)]
    public async Task Chat_ErroresDelServicio_ConservanCodigoYEstado(string code, int status)
    {
        var spy = new SpyService { ChatResult = () => CjAiResult<CjAiChatResponseDto>.Fail(code, "mensaje", status) };

        var (actual, json) = Read(await Controller(spy, WithLogin("jperez")).Chat(new CjAiChatRequestDto { Message = "x" }, CancellationToken.None));

        Assert.Equal(status, actual);
        Assert.Contains("\"success\":false", json);
        Assert.Contains(code, json);                                // el FE traduce errorCode (friendlyError)
    }

    [Fact]
    public async Task OtrasAcciones_PasanElLoginDelClaim_YElIdentificadorDeLaRuta()
    {
        var spy = new SpyService();
        var controller = Controller(spy, WithLogin("jperez"));

        await controller.Listar(2, 10, CancellationToken.None);
        var abrir = Read(await controller.Abrir("11111111-1111-1111-1111-111111111111", CancellationToken.None));
        await controller.Renombrar("22222222-2222-2222-2222-222222222222", new CjAiRenameRequestDto { Titulo = "nuevo" }, CancellationToken.None);
        await controller.Eliminar("33333333-3333-3333-3333-333333333333", CancellationToken.None);

        Assert.All(spy.Logins, l => Assert.Equal("jperez", l));
        Assert.Equal(4, spy.Logins.Count);
        Assert.Equal(404, abrir.Status);
        Assert.Contains("22222222-2222-2222-2222-222222222222|nuevo", spy.Ids);
    }

    // ------------------------------------------------------------------ registro (AddCjIntelligence)

    private static IConfiguration Config(params (string Key, string Value)[] items) =>
        new ConfigurationBuilder().AddInMemoryCollection(items.ToDictionary(i => i.Key, i => (string?)i.Value)).Build();

    // ------------------------------------------------------------------ lanzamiento restringido (UsuariosPermitidos)

    private static CjERP.Infrastructure.Services.AI.CjIntelligence.CjIntelligenceOptions Permitidos(string lista) => new() { UsuariosPermitidos = lista };

    [Theory]
    [InlineData("JIBERICO,PTORRES,ADMIN", "PTORRES", true)]
    [InlineData("JIBERICO, PTORRES , ADMIN", "ptorres", true)]      // espacios y mayusculas
    [InlineData("JIBERICO,PTORRES,ADMIN", "AORTIZ", false)]
    [InlineData("JIBERICO,PTORRES,ADMIN", "JIBERICO2", false)]       // no es coincidencia parcial
    [InlineData("", "PTORRES", false)]                              // vacio = nadie
    [InlineData("*", "CUALQUIERA", true)]
    public void UsuariosPermitidos_Decide(string lista, string login, bool esperado)
    {
        Assert.Equal(esperado, Permitidos(lista).EsUsuarioPermitido(login));
    }

    [Fact]
    public async Task UsuarioFueraDeLaLista_Recibe403_YNoLlegaAlServicioNiAlModelo()
    {
        var spy = new SpyService();
        var controller = Controller(spy, WithLogin("AORTIZ"), Permitidos("JIBERICO,PTORRES,ADMIN"));

        var all = new[]
        {
            Read(await controller.Chat(new CjAiChatRequestDto { Message = "hola" }, CancellationToken.None)),
            Read(await controller.Listar(1, 30, CancellationToken.None)),
            Read(await controller.Abrir("x", CancellationToken.None)),
            Read(await controller.Renombrar("x", new CjAiRenameRequestDto { Titulo = "t" }, CancellationToken.None)),
            Read(await controller.Eliminar("x", CancellationToken.None))
        };

        Assert.All(all, r => { Assert.Equal(403, r.Status); Assert.Contains(CjAiErrorCodes.PermissionDenied, r.Json); });
        Assert.Empty(spy.Chats);
        Assert.Empty(spy.Logins);
        Assert.Contains("\"Available\":false", Read(controller.Status()).Json);
    }

    [Fact]
    public async Task UsuarioDeLaLista_LlegaAlServicio_ConSuLoginDelJwt()
    {
        var spy = new SpyService();
        var controller = Controller(spy, WithLogin("PTORRES"), Permitidos("JIBERICO,PTORRES,ADMIN"));

        Assert.Equal(200, Read(await controller.Chat(new CjAiChatRequestDto { Message = "hola" }, CancellationToken.None)).Status);
        Assert.Equal(["PTORRES"], spy.Chats.Select(c => c.Login));
        Assert.Contains("\"Available\":true", Read(controller.Status()).Json);
    }

    [Fact]
    public void Registro_Habilitado_RegistraLasOpciones_ConLaListaDeUsuariosPermitidos()
    {
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddCjIntelligence(Config(("CjIntelligence:Enabled", "true"), ("CjIntelligence:LoginReuseControlResolved", "true"),
            ("CjIntelligence:UsuariosPermitidos", "JIBERICO,PTORRES,ADMIN"), ("ConnectionStrings:CjIntelligence", "Data Source=ia;Initial Catalog=JC_Db")));

        var options = services.BuildServiceProvider().GetRequiredService<CjERP.Infrastructure.Services.AI.CjIntelligence.CjIntelligenceOptions>();
        Assert.True(options.EsUsuarioPermitido("admin"));
        Assert.False(options.EsUsuarioPermitido("AORTIZ"));
    }

    private static bool Registered(IServiceCollection services) => services.Any(d => d.ServiceType == typeof(ICjIntelligenceChatService));

    [Fact]
    public void Registro_SinConfiguracion_NoRegistraNada()
    {
        var services = new ServiceCollection();
        services.AddCjIntelligence(Config());

        Assert.False(Registered(services));
        Assert.Empty(services);
    }

    [Fact]
    public void Registro_HabilitadoPeroSinCadenaDeCjIntelligence_NoRegistra_NoUsaDefaultConnection()
    {
        var services = new ServiceCollection();
        services.AddCjIntelligence(Config(("CjIntelligence:Enabled", "true"), ("CjIntelligence:LoginReuseControlResolved", "true"),
            ("ConnectionStrings:DefaultConnection", "Data Source=admin;Initial Catalog=JC_Db")));

        Assert.False(Registered(services));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("false")]
    [InlineData("")]
    [InlineData("si")]
    public void Registro_SinConfirmarLaReutilizacionDeLogins_NoRegistra_AunHabilitadoYConCadena(string? confirmacion)
    {
        var items = new List<(string, string)> { ("CjIntelligence:Enabled", "true"), ("ConnectionStrings:CjIntelligence", "Data Source=ia;Initial Catalog=JC_Db") };
        if (confirmacion is not null) items.Add(("CjIntelligence:LoginReuseControlResolved", confirmacion));
        var services = new ServiceCollection();
        services.AddCjIntelligence(Config(items.ToArray()));

        Assert.False(Registered(services));
        Assert.Empty(services);
    }

    [Fact]
    public void Registro_ConCadenaPeroSinHabilitar_NoRegistra()
    {
        var services = new ServiceCollection();
        services.AddCjIntelligence(Config(("CjIntelligence:LoginReuseControlResolved", "true"), ("ConnectionStrings:CjIntelligence", "Data Source=ia;Initial Catalog=JC_Db")));

        Assert.False(Registered(services));
    }

    [Fact]
    public void Registro_Habilitado_RegistraElServicio_YNoReemplazaLaAutorizacionDelChatAnterior()
    {
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddCjIntelligence(Config(("CjIntelligence:Enabled", "true"), ("CjIntelligence:LoginReuseControlResolved", "true"),
            ("ConnectionStrings:CjIntelligence", "Data Source=ia;Initial Catalog=JC_Db")));

        Assert.True(Registered(services));
        Assert.Contains(services, d => d.ServiceType == typeof(CjERP.Infrastructure.Services.AI.CjIntelligence.ICjIntelligenceScopeResolver));
        // No debe registrar los contratos del chat anterior (IIaPermissionStore / IIaAuthorizationService / IIaEmployeeDirectory)
        Assert.DoesNotContain(services, d => d.ServiceType == typeof(IIaPermissionStore) || d.ServiceType == typeof(IIaAuthorizationService)
                                             || d.ServiceType == typeof(IIaEmployeeDirectory));
    }

}
