using CjERP.Backend.Tests.Ia.TestSupport;
using Xunit;

namespace CjERP.Backend.Tests.Ia.UnitTests;

/// <summary>
/// Escenario obligatorio: "error de ejecucion SQL tratado amigablemente" (capa de mapeo de mensajes).
/// Protege BuildFriendlyErrorMessage (IaChatService.cs:5032-5104) directamente por reflexion, sin
/// necesidad de provocar un error real de SQL/HTTP. El escenario de round-trip completo (una excepcion
/// real de SqlConnection propagandose a traves de ConsultarAsync) esta cubierto por separado en
/// IntegrationTests/ConsultarAsyncSqlFailureTests.cs.
///
/// Estos tests fijan la variable de entorno ASPNETCORE_ENVIRONMENT para que el resultado sea
/// determinista (BuildFriendlyErrorMessage se comporta distinto en Development vs. produccion,
/// IsDevelopmentEnvironment, IaChatService.cs:5106-5112).
/// </summary>
[Trait("Category", "Unit")]
public sealed class ErrorHandlingTests : IDisposable
{
    private readonly string? _valorOriginal = Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT");

    public ErrorHandlingTests()
    {
        Environment.SetEnvironmentVariable("ASPNETCORE_ENVIRONMENT", "Production");
    }

    public void Dispose()
    {
        Environment.SetEnvironmentVariable("ASPNETCORE_ENVIRONMENT", _valorOriginal);
    }

    [Fact]
    public void EnProduccion_NoExponeElMensajeCrudoDeUnaExcepcionGenerica()
    {
        var excepcionConDetalleTecnico = new InvalidOperationException(
            "Cannot open database \"CjERP\" requested by the login. Login failed for user 'sa'.");

        var mensaje = IaChatServiceReflection.BuildFriendlyErrorMessage(excepcionConDetalleTecnico);

        Assert.DoesNotContain("sa", mensaje, StringComparison.Ordinal);
        Assert.DoesNotContain("CjERP", mensaje, StringComparison.Ordinal);
        Assert.NotEmpty(mensaje);
    }

    [Fact]
    public void EnProduccion_MensajeDeConfiguracionFaltanteDeOpenAiSeDevuelveSinAlteraciones()
    {
        // HALLAZGO DOCUMENTADO (ajuste de suposicion inicial, no un bug): para este mensaje concreto,
        // BuildFriendlyErrorMessage NO lo reescribe a un texto distinto en produccion - lo devuelve
        // tal cual, porque el propio mensaje de "falta configurar la clave privada de OpenAI" ya es
        // en si mismo un texto seguro de mostrar al usuario (no expone datos tecnicos como una
        // connection string o una traza), asi que ninguna de las ramas de mapeo mas especificas de
        // BuildFriendlyErrorMessage necesita interceptarlo.
        var excepcion = new InvalidOperationException("Falta configurar la clave privada de OpenAI.");

        var mensaje = IaChatServiceReflection.BuildFriendlyErrorMessage(excepcion);

        Assert.Equal("Falta configurar la clave privada de OpenAI.", mensaje);
    }

    [Fact]
    public void EnDesarrollo_ExponeElMensajeCrudoParaDiagnostico()
    {
        // Comportamiento actual documentado (no una recomendacion): en Development, el mensaje
        // devuelto al usuario final SI incluye el texto crudo de la excepcion (IaChatService.cs:5034-5041).
        Environment.SetEnvironmentVariable("ASPNETCORE_ENVIRONMENT", "Development");

        var excepcion = new InvalidOperationException("Detalle tecnico especifico 12345");

        var mensaje = IaChatServiceReflection.BuildFriendlyErrorMessage(excepcion);

        Assert.Contains("Detalle tecnico especifico 12345", mensaje, StringComparison.Ordinal);
    }
}
