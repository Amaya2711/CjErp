using CjERP.Infrastructure.Services;
using Xunit;

namespace CjERP.Backend.Tests.Ia.UnitTests;

/// <summary>
/// Fixtures representativos para verificar que el puerto C# de buildDashboardStructuredData/
/// buildExecutiveWeeklyReportData (cjerp-frontend/.../iachat.tsx) preserva las reglas de negocio
/// clave: totales por moneda, participacion porcentual, agregacion mensual, semaforo y la marca de
/// "informe parcial" cuando las filas disponibles son menos que el total reportado por el SP.
/// No es una prueba de integracion contra sp_IA_Planilla_Buscar (pendiente de inspeccionar) — usa
/// filas sinteticas con la misma forma (Dictionary de nombres de columna) que GastosQueryExecutor
/// ya produce.
/// </summary>
[Trait("Category", "Unit")]
public sealed class IaExecutiveReportBuilderTests
{
    private static Dictionary<string, object?> Row(
        string cliente, string proyecto, string solicitante, string site, string responsable,
        string moneda, decimal subtotal, string estado, string fecha) => new()
    {
        ["Cliente"] = cliente,
        ["Proyecto"] = proyecto,
        ["Solicitante"] = solicitante,
        ["Site"] = site,
        ["Responsable"] = responsable,
        ["Moneda"] = moneda,
        ["Subtotal"] = subtotal,
        ["Estado"] = estado,
        ["Fecha"] = fecha
    };

    [Fact]
    public void Build_UnaSolaMoneda_CalculaTotalYParticipacionCorrectos()
    {
        var rows = new List<Dictionary<string, object?>>
        {
            Row("Claro", "Backbone Norte", "Juan Perez", "LV4425", "Juan Perez", "PEN", 1000m, "PAGADO", "2026-01-10"),
            Row("Claro", "Backbone Norte", "Juan Perez", "LV4425", "Juan Perez", "PEN", 500m, "PAGADO", "2026-01-15"),
            Row("Entel", "Expansion Sur", "Ana Lopez", "LV9001", "Ana Lopez", "PEN", 1500m, "PENDIENTE", "2026-02-05"),
        };

        var payload = IaExecutiveReportBuilder.Build(rows, totalRowsReportado: 3, question: "gastos del mes", answer: "resumen");

        Assert.False(payload.HasMultipleCurrencies);
        Assert.Equal("PEN", payload.Currency);
        Assert.False(payload.InformeParcial);
        Assert.Equal(3, payload.FilasAnalizadas);

        var claroProjectRow = payload.ProjectTable.Single(r => (string)r["Proyecto"]! == "Backbone Norte");
        Assert.Equal("S/ 1,500.00", claroProjectRow["Monto"]);
        Assert.Equal("50.00%", claroProjectRow["Participación"]);
    }

    [Fact]
    public void Build_MultiplesMonedas_SepararaTotalesPorMonedaYMarcaHasMultipleCurrencies()
    {
        var rows = new List<Dictionary<string, object?>>
        {
            Row("Claro", "Backbone Norte", "Juan Perez", "LV4425", "Juan Perez", "PEN", 1000m, "PAGADO", "2026-01-10"),
            Row("Entel", "Expansion Sur", "Ana Lopez", "LV9001", "Ana Lopez", "USD", 200m, "PAGADO", "2026-01-12"),
        };

        var payload = IaExecutiveReportBuilder.Build(rows, totalRowsReportado: 2, question: "gastos", answer: "");

        Assert.True(payload.HasMultipleCurrencies);
        Assert.Equal(2, payload.CurrencyTotals.Count);
        var usdTotal = payload.CurrencyTotals.Single(c => (string)c["Moneda"]! == "USD");
        Assert.Equal("US$ 200.00", usdTotal["Monto"]);
    }

    [Fact]
    public void Build_FilasMenoresQueTotalReportado_MarcaInformeParcialYLoDiceEnElTexto()
    {
        var rows = new List<Dictionary<string, object?>>
        {
            Row("Claro", "Backbone Norte", "Juan Perez", "LV4425", "Juan Perez", "PEN", 1000m, "PAGADO", "2026-01-10"),
        };

        // Simula que el SP reporto 500 registros totales pero solo se pudieron analizar 1 (limite
        // de agregacion local alcanzado) — el payload NUNCA debe presentar ese total parcial como
        // si fuera el universo completo.
        var payload = IaExecutiveReportBuilder.Build(rows, totalRowsReportado: 500, question: "gastos", answer: "");

        Assert.True(payload.InformeParcial);
        Assert.Equal(500, payload.TotalRows);
        Assert.Equal(1, payload.FilasAnalizadas);
        Assert.Contains("INFORME PARCIAL", payload.ExecutiveReading, StringComparison.OrdinalIgnoreCase);
        Assert.Contains(
            payload.SummaryRows,
            r => (string)r["campo"]! == "Cobertura del análisis" && ((string)r["valor"]!).Contains("INFORME PARCIAL"));
    }

    [Fact]
    public void Build_SinFilas_NoLanzaExcepcionYDevuelveAgregadosVacios()
    {
        var payload = IaExecutiveReportBuilder.Build([], totalRowsReportado: 0, question: "gastos", answer: "");

        Assert.Equal(0, payload.FilasAnalizadas);
        Assert.False(payload.InformeParcial);
        Assert.Empty(payload.ProjectTable);
        Assert.Equal(5, payload.SemaphoreTable.Count);
    }

    [Fact]
    public void Build_DetectaMetricaVentasPorPalabraClaveEnPreguntaORespuesta()
    {
        var rows = new List<Dictionary<string, object?>>
        {
            Row("Claro", "Backbone Norte", "Juan Perez", "LV4425", "Juan Perez", "PEN", 1000m, "PAGADO", "2026-01-10"),
        };

        var payload = IaExecutiveReportBuilder.Build(rows, 1, question: "cuanto fue la venta este mes", answer: "");

        Assert.Equal("ventas", payload.Metric);
    }
}
