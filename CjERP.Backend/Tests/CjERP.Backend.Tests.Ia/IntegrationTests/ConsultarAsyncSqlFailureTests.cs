using System.Text.Json;
using CjERP.Application.DTOs.IaChat;
using CjERP.Backend.Tests.Ia.TestSupport;
using Xunit;

namespace CjERP.Backend.Tests.Ia.IntegrationTests;

/// <summary>
/// Escenario obligatorio: "error de ejecucion SQL tratado amigablemente" (round-trip completo).
/// UNICA prueba de toda la suite que toca la capa real de ADO.NET/SqlConnection (ver gap documentado
/// en FakeSqlCommandFactory.cs): apunta a 127.0.0.1 en un puerto casi con certeza cerrado, para que el
/// intento de conexion falle rapido (rechazo de TCP en loopback) sin requerir SQL Server real ni
/// acceso de red externo. No requiere API key valida de OpenAI (solo se llama al planner una vez,
/// antes de intentar la conexion SQL).
///
/// Clasificacion (ver seccion "Clasificacion de pruebas" del reporte de Fase 1.0): Integracion,
/// requiere intentar una conexion TCP real (aunque sea local y falle), potencialmente mas lenta que
/// el resto de la suite (Timeout defensivo de 20s). No requiere SQL Server real disponible ni
/// proveedor LLM real (no consume ninguna API paga).
/// </summary>
[Trait("Category", "Integration")]
public sealed class ConsultarAsyncSqlFailureTests : IDisposable
{
    private readonly string? _valorOriginalEnvironment =
        Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT");

    public ConsultarAsyncSqlFailureTests()
    {
        // Se fuerza "Production" para que BuildFriendlyErrorMessage no exponga el mensaje crudo de la
        // excepcion de conexion (que si incluiria la cadena de conexion/host, ver ErrorHandlingTests).
        Environment.SetEnvironmentVariable("ASPNETCORE_ENVIRONMENT", "Production");
    }

    public void Dispose()
    {
        Environment.SetEnvironmentVariable("ASPNETCORE_ENVIRONMENT", _valorOriginalEnvironment);
    }

    private static string OpenAiEnvelopeParaBuscarPlanilla()
    {
        var plannerJson = JsonSerializer.Serialize(new
        {
            route = "buscar_planilla",
            responseType = "detail",
            answer = ""
        });

        var envelope = new
        {
            choices = new[] { new { message = new { content = plannerJson } } }
        };
        return JsonSerializer.Serialize(envelope);
    }

    [Fact(Timeout = 20000)]
    public async Task FalloDeConexionSql_SeTraduceEnRespuestaAmigable_SinExponerDetallesTecnicos()
    {
        var handler = new FakeHttpMessageHandler().EnqueueJson(OpenAiEnvelopeParaBuscarPlanilla());
        var service = IaChatServiceTestFactory.Create(handler, FakeSqlCommandFactory.PointingToClosedLocalPort());

        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(15));

        var response = await service.ConsultarAsync(
            new IaChatConsultarRequestDto { Module = "GASTOS", Question = "gastos del cliente Claro" },
            idUsuario: "usuario-test",
            cts.Token);

        Assert.False(response.Success);
        Assert.NotNull(response.ErrorMessage);
        Assert.NotEmpty(response.ErrorMessage!);
        Assert.DoesNotContain("127.0.0.1", response.ErrorMessage, StringComparison.Ordinal);
        Assert.DoesNotContain("SqlException", response.ErrorMessage, StringComparison.Ordinal);

        // Solo debio llamarse al planner UNA vez: la ejecucion del SP fallo antes de llegar a pedir
        // la respuesta final a OpenAI (GenerateOpenAiFinalAnswerAsync nunca se alcanza).
        Assert.Equal(1, handler.CallCount);
    }
}
