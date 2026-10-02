using CjERP.Backend.Tests.Ia.TestSupport;
using CjERP.Infrastructure.Services;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace CjERP.Backend.Tests.Ia.IntegrationTests;

/// <summary>
/// Test directo de IaAuditService (extraido en el paso 1.9 original de la tabla de Fase 1), en
/// aislamiento de IaChatService. A diferencia de GastosQueryExecutor (que propaga excepciones de
/// SQL), el comportamiento preservado de RegistrarAsync es tragarse cualquier excepcion y solo
/// loguear una advertencia (try/catch interno, idéntico al método original dentro de
/// IaChatService.cs) para que un fallo de auditoría nunca interrumpa la respuesta al usuario.
/// </summary>
[Trait("Category", "Integration")]
public sealed class IaAuditServiceTests
{
    [Fact(Timeout = 20000)]
    public async Task RegistrarAsync_ConexionSqlNoDisponible_NoPropagaExcepcion()
    {
        var auditService = new IaAuditService(
            FakeSqlCommandFactory.PointingToClosedLocalPort(),
            NullLogger<IaAuditService>.Instance);

        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(15));

        var exception = await Record.ExceptionAsync(() => auditService.RegistrarAsync(
            idUsuario: "123",
            module: "GASTOS",
            question: "pregunta de prueba",
            herramienta: "buscar_planilla",
            parametros: new Dictionary<string, object?>(),
            duracionMs: 10,
            cantidadRegistros: 0,
            fueExitoso: true,
            mensajeError: null,
            cancellationToken: cts.Token));

        Assert.Null(exception);
    }
}
