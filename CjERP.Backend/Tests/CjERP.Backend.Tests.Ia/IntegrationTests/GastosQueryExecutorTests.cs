using CjERP.Backend.Tests.Ia.TestSupport;
using CjERP.Infrastructure.Services;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace CjERP.Backend.Tests.Ia.IntegrationTests;

/// <summary>
/// Test directo de GastosQueryExecutor (Fase 1.3), en aislamiento de IaChatService. Al igual que
/// ConsultarAsyncSqlFailureTests, apunta a un puerto local casi con certeza cerrado (ver gap
/// documentado en FakeSqlCommandFactory.cs: ISqlCommandFactory.CreateConnection() devuelve
/// SqlConnection concreto, no hay forma de simular filas sin una base de datos real).
/// </summary>
[Trait("Category", "Integration")]
public sealed class GastosQueryExecutorTests
{
    [Fact(Timeout = 20000)]
    public async Task EjecutarBuscarPlanillaAsync_ConexionSqlNoDisponible_PropagaExcepcion()
    {
        var executor = new GastosQueryExecutor(
            FakeSqlCommandFactory.PointingToClosedLocalPort(),
            NullLogger<GastosQueryExecutor>.Instance);

        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(15));

        await Assert.ThrowsAnyAsync<Exception>(() =>
            executor.EjecutarBuscarPlanillaAsync(new BuscarPlanillaArgs(), cts.Token));
    }
}
