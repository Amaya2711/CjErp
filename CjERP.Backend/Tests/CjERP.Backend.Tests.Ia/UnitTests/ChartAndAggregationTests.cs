using CjERP.Backend.Tests.Ia.TestSupport;
using Xunit;

namespace CjERP.Backend.Tests.Ia.UnitTests;

/// <summary>
/// Escenario obligatorio: "respuesta de tipo grafico". Protege AggregateRowsByField (estatico,
/// IaChatService.cs:1261-1297) y BuildChart (de instancia, 1062-1100) dado un conjunto de filas
/// YA OBTENIDAS (fixture controlado), sin pasar por SQL real.
///
/// ALCANCE REAL (documentado en el reporte de Fase 1.0): esto protege la FORMA del grafico resultante
/// dado un conjunto de filas de entrada conocido. NO cubre el recorrido completo "pregunta -> SQL real
/// -> filas -> grafico", porque obtener filas reales requiere ejecutar dbo.sp_IA_Planilla_Buscar contra
/// una base de datos (ver gap de ISqlCommandFactory documentado en FakeSqlCommandFactory.cs).
/// </summary>
[Trait("Category", "Unit")]
public sealed class ChartAndAggregationTests
{
    private static List<Dictionary<string, object?>> FixtureRows() =>
    [
        new() { ["Cliente"] = "Claro", ["Subtotal"] = 1000m },
        new() { ["Cliente"] = "Claro", ["Subtotal"] = 500m },
        new() { ["Cliente"] = "Entel", ["Subtotal"] = 2000m },
        new() { ["Cliente"] = null, ["Subtotal"] = 100m }
    ];

    [Fact]
    public void AggregateRowsByField_AgrupaYSumaMontosPorCategoria()
    {
        var aggregated = IaChatServiceReflection.AggregateRowsByField(FixtureRows(), "Cliente", "Subtotal");

        Assert.Equal(3, aggregated.Count); // Claro, Entel, y la categoria "sin dato" del null

        var claro = aggregated.Single(r => Equals(r["Categoria"], "Claro"));
        Assert.Equal(2, claro["Registros"]);
        Assert.Equal(1500m, claro["Monto"]);

        var entel = aggregated.Single(r => Equals(r["Categoria"], "Entel"));
        Assert.Equal(1, entel["Registros"]);
        Assert.Equal(2000m, entel["Monto"]);
    }

    [Fact]
    public void AggregateRowsByField_OrdenaDescendentePorMonto()
    {
        var aggregated = IaChatServiceReflection.AggregateRowsByField(FixtureRows(), "Cliente", "Subtotal");

        var montos = aggregated.Select(r => (decimal)r["Monto"]!).ToList();
        Assert.Equal(montos.OrderByDescending(m => m).ToList(), montos);
    }

    [Fact]
    public void BuildChart_ProduceCampoDeCategoriaYValorEsperados()
    {
        var service = IaChatServiceTestFactory.Create(new FakeHttpMessageHandler());
        var groupedRows = IaChatServiceReflection.AggregateRowsByField(FixtureRows(), "Cliente", "Subtotal");

        var chart = IaChatServiceReflection.BuildChart(service, "CLIENTE", "resumen de gastos", groupedRows);

        Assert.Equal("Categoria", chart.CategoryField);
        Assert.Equal("Total", chart.ValueField);
        Assert.Equal(groupedRows.Count, chart.Rows.Count);
    }

    [Theory]
    [InlineData("MES", "line")]
    [InlineData("ESTADO", "pie")]
    [InlineData("CLIENTE", "bar")]
    [InlineData("PROYECTO", "bar")]
    public void BuildChart_EligeTipoDeGraficoSegunElCampoDeAgrupacion(string agruparPor, string tipoEsperado)
    {
        var service = IaChatServiceTestFactory.Create(new FakeHttpMessageHandler());
        var groupedRows = IaChatServiceReflection.AggregateRowsByField(FixtureRows(), "Cliente", "Subtotal");

        // Importante: la pregunta NO debe contener la subcadena "graf" (ver el hallazgo documentado
        // mas abajo, PreguntaQueMencionaLaPalabraGrafico_FuerzaBarOLine_InclusoParaEstado).
        var chart = IaChatServiceReflection.BuildChart(service, agruparPor, "resumen ejecutivo por categoria", groupedRows);

        Assert.Equal(tipoEsperado, chart.ChartType);
    }

    [Fact]
    public void HallazgoDocumentado_PreguntaQueMencionaLaPalabraGrafico_FuerzaBarOLine_InclusoParaEstado()
    {
        // HALLAZGO DOCUMENTADO (no es un bug a corregir en Fase 1.0): BuildChart mira si la PREGUNTA
        // completa contiene la subcadena "graf" (question.Contains("graf")) para decidir si el usuario
        // pidio explicitamente un grafico, y en ese caso fuerza el tipo a "line" (si agruparPor="MES")
        // o "bar" en cualquier otro caso - PISANDO la eleccion de "pie" para ESTADO.
        // Como "graf" es solo un Contains (no una palabra completa), CUALQUIER mencion de la propia
        // palabra "grafico" en la pregunta (incluso hablando DE la palabra, no pidiendo un grafico)
        // dispara este comportamiento. Ejemplo real: preguntar "sin la palabra grafico" ya alcanza
        // para que un agrupamiento por ESTADO deje de mostrarse como "pie" y se muestre como "bar".
        var service = IaChatServiceTestFactory.Create(new FakeHttpMessageHandler());
        var groupedRows = IaChatServiceReflection.AggregateRowsByField(FixtureRows(), "Cliente", "Subtotal");

        var chart = IaChatServiceReflection.BuildChart(
            service, "ESTADO", "resumen sin la palabra grafico", groupedRows);

        Assert.Equal("bar", chart.ChartType); // no "pie", pese a agruparPor=ESTADO
    }

    [Fact]
    public void BuildChart_ConFilasVacias_DevuelveGraficoBarVacioSinLanzarExcepcion()
    {
        var service = IaChatServiceTestFactory.Create(new FakeHttpMessageHandler());

        var chart = IaChatServiceReflection.BuildChart(service, "CLIENTE", "resumen", []);

        Assert.Equal("bar", chart.ChartType);
        Assert.Empty(chart.Rows);
    }
}
