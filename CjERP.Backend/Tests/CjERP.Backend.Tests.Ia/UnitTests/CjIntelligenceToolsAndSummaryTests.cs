using System.Text.Json;
using System.Text.Json.Nodes;
using CjERP.Infrastructure.Services;
using CjERP.Infrastructure.Services.AI.CjIntelligence;
using Xunit;

namespace CjERP.Backend.Tests.Ia.UnitTests;

/// <summary>CJ Intelligence: validacion estricta de argumentos de herramientas y armado del resultado para el modelo (sin SQL ni red).</summary>
[Trait("Category", "Unit")]
public sealed class CjIntelligenceToolsAndSummaryTests
{
    [Fact]
    public void OrderGroups_OrdenaPorClienteProyectoSiteTipoTrabajoPeriodoYMoneda_SinTocarLasCifras()
    {
        var rows = new List<Dictionary<string, object?>>
        {
            Row(("Moneda", "SOLES"), ("Mes", "2026-10"), ("Cliente", "B"), ("Proyecto", "P1"), ("Total", 5m)),
            Row(("Moneda", "DOLARES"), ("Mes", "2026-09"), ("Cliente", "A"), ("Proyecto", "P2"), ("Total", 7m)),
            Row(("Moneda", "SOLES"), ("Mes", "2026-09"), ("Cliente", "A"), ("Proyecto", "P1"), ("Total", 9m)),
            Row(("Moneda", "DOLARES"), ("Mes", "2026-09"), ("Cliente", "A"), ("Proyecto", "P1"), ("Total", 3m)),
            Row(("Moneda", "SOLES"), ("Mes", "2026-08"), ("Cliente", null), ("Proyecto", "P1"), ("Total", 1m))
        };

        var ordered = CjIntelligenceResultSummarizer.OrderGroups(rows);

        // cliente A (P1: 09 DOLARES, 09 SOLES), cliente A P2, cliente B, sin cliente al final
        Assert.Equal([3m, 9m, 7m, 5m, 1m], ordered.Select(r => (decimal)r["Total"]!));
        Assert.Equal(rows.Count, ordered.Count);
        Assert.Equal(25m, ordered.Sum(r => (decimal)r["Total"]!));
    }

    [Fact]
    public void OrderGroups_ReconocePeriodoYTipoDeTrabajoConOtrosNombres_YSinColumnasConocidasConservaElOrden()
    {
        var porTipo = CjIntelligenceResultSummarizer.OrderGroups(
        [
            Row(("tipo_trabajo", "Z"), ("fecha", "2026-10-02"), ("n", 1)),
            Row(("tipo_trabajo", "A"), ("fecha", "2026-10-05"), ("n", 2)),
            Row(("tipo_trabajo", "A"), ("fecha", "2026-10-01"), ("n", 3))
        ]);
        Assert.Equal([3, 2, 1], porTipo.Select(r => (int)r["n"]!));

        var sinColumnas = CjIntelligenceResultSummarizer.OrderGroups([Row(("Estado", "9"), ("n", 1)), Row(("Estado", "1"), ("n", 2))]);
        Assert.Equal([1, 2], sinColumnas.Select(r => (int)r["n"]!));
    }

    private const string Valid = """{"fechaInicio":"2026-10-01","fechaFin":"2026-10-31","agruparPor":["cliente","MES"],"estados":"4","cliente":"ACME","proyecto":null,"site":null,"responsable":null,"solicitante":null,"textoBusqueda":null,"top":null}""";

    [Fact]
    public void Resumen_ArgumentosValidos_SeNormalizanYTomanValoresPorDefecto()
    {
        var r = CjIntelligencePagosTools.ParseResumen(Valid);

        Assert.True(r.Ok, r.Error);
        Assert.Equal(new DateOnly(2026, 10, 1), r.Value!.Periodo.Inicio);
        Assert.Equal(new[] { "CLIENTE", "MES" }, r.Value.AgruparPor);
        Assert.Equal(CjIntelligencePagosTools.DefaultTop, r.Value.Top);
        Assert.Equal("ACME", r.Value.Cliente);
        Assert.Null(r.Value.Proyecto);
    }

    [Fact]
    public void Resumen_JsonCanonico_EsEstableYElHashCambiaConLosArgumentos()
    {
        var a = CjIntelligencePagosTools.ParseResumen(Valid).Value!;
        var b = CjIntelligencePagosTools.ParseResumen(Valid.Replace("ACME", "OTRO")).Value!;

        Assert.Equal(a.ToCanonicalJson(), CjIntelligencePagosTools.ParseResumen(Valid).Value!.ToCanonicalJson());
        Assert.Equal(64, a.Hash().Length);
        Assert.NotEqual(a.Hash(), b.Hash());
        using var doc = JsonDocument.Parse(a.ToCanonicalJson());
        Assert.Equal("2026-10-01", doc.RootElement.GetProperty("fechaInicio").GetString());
    }

    [Theory]
    [InlineData("usuario")]
    [InlineData("idUsuario")]
    [InlineData("IdUsuario")]
    [InlineData("empleados")]
    [InlineData("alcance")]
    [InlineData("nivel")]
    [InlineData("alcanceEmpleados")]
    [InlineData("sql")]
    [InlineData("verTotalesGlobales")]
    public void Resumen_NoAceptaUsuarioEmpleadosAlcanceNiSql(string property)
    {
        var json = $$"""{"fechaInicio":"2026-10-01","fechaFin":"2026-10-31","{{property}}":"x"}""";

        var r = CjIntelligencePagosTools.ParseResumen(json);

        Assert.False(r.Ok);
        Assert.Contains(property, r.Error);
    }

    [Theory]
    [InlineData("""{"fechaInicio":"2026-10-31","fechaFin":"2026-10-01"}""")]                       // fin anterior
    [InlineData("""{"fechaInicio":"2025-01-01","fechaFin":"2026-10-31"}""")]                       // > 400 dias
    [InlineData("""{"fechaInicio":"01/10/2026","fechaFin":"31/10/2026"}""")]                        // formato
    [InlineData("""{"fechaInicio":"2026-10-01"}""")]                                                // falta fin
    [InlineData("""{"fechaInicio":null,"fechaFin":"2026-10-31"}""")]
    [InlineData("""{"fechaInicio":"2026-10-01","fechaFin":"2026-10-31","agruparPor":["COINCIDENCIA"]}""")]
    [InlineData("""{"fechaInicio":"2026-10-01","fechaFin":"2026-10-31","agruparPor":["CLIENTE","PROYECTO","SITE","MES"]}""")]
    [InlineData("""{"fechaInicio":"2026-10-01","fechaFin":"2026-10-31","agruparPor":"CLIENTE"}""")]
    [InlineData("""{"fechaInicio":"2026-10-01","fechaFin":"2026-10-31","estados":"4; DROP TABLE x"}""")]
    [InlineData("""{"fechaInicio":"2026-10-01","fechaFin":"2026-10-31","top":0}""")]
    [InlineData("""{"fechaInicio":"2026-10-01","fechaFin":"2026-10-31","top":101}""")]
    [InlineData("""{"fechaInicio":"2026-10-01","fechaFin":"2026-10-31","top":"5"}""")]
    [InlineData("""{"fechaInicio":"2026-10-01","fechaFin":"2026-10-31","cliente":123}""")]
    [InlineData("""{"fechaInicio":"2026-10-01","fechaFin":"2026-10-31","cliente":"a\u0000b"}""")]
    [InlineData("not json")]
    [InlineData("[]")]
    [InlineData("")]
    public void Resumen_ArgumentosInvalidos_SeRechazan(string json)
    {
        Assert.False(CjIntelligencePagosTools.ParseResumen(json).Ok);
    }

    [Fact]
    public void Resumen_TextoDemasiadoLargo_YRangoExactoDe400Dias()
    {
        var largo = $$"""{"fechaInicio":"2026-10-01","fechaFin":"2026-10-31","cliente":"{{new string('a', 151)}}"}""";
        Assert.False(CjIntelligencePagosTools.ParseResumen(largo).Ok);

        var inicio = new DateOnly(2025, 9, 1);
        var finOk = inicio.AddDays(CjIntelligencePagosTools.MaxRangeDays);
        Assert.True(CjIntelligencePagosTools.ParseResumen($$"""{"fechaInicio":"{{inicio:yyyy-MM-dd}}","fechaFin":"{{finOk:yyyy-MM-dd}}"}""").Ok);
        Assert.False(CjIntelligencePagosTools.ParseResumen($$"""{"fechaInicio":"{{inicio:yyyy-MM-dd}}","fechaFin":"{{finOk.AddDays(1):yyyy-MM-dd}}"}""").Ok);
    }

    [Fact]
    public void Comparar_DosPeriodosConLosMismosFiltros()
    {
        var json = """{"periodoA":{"fechaInicio":"2026-10-01","fechaFin":"2026-10-31"},"periodoB":{"fechaInicio":"2026-09-01","fechaFin":"2026-09-30"},"agruparPor":["CLIENTE"],"cliente":"ACME","top":10}""";

        var r = CjIntelligencePagosTools.ParseComparar(json);

        Assert.True(r.Ok, r.Error);
        Assert.Equal(new DateOnly(2026, 10, 1), r.Value.A.Periodo.Inicio);
        Assert.Equal(new DateOnly(2026, 9, 30), r.Value.B.Periodo.Fin);
        Assert.Equal("ACME", r.Value.B.Cliente);
        Assert.Equal(10, r.Value.A.Top);
    }

    [Theory]
    [InlineData("""{"periodoA":{"fechaInicio":"2026-10-01","fechaFin":"2026-10-31"}}""")]
    [InlineData("""{"periodoA":{"fechaInicio":"2026-10-01","fechaFin":"2026-10-31","usuario":"x"},"periodoB":{"fechaInicio":"2026-09-01","fechaFin":"2026-09-30"}}""")]
    [InlineData("""{"periodoA":{"fechaInicio":"2026-10-01","fechaFin":"2026-10-31"},"periodoB":{"fechaInicio":"2026-09-30","fechaFin":"2026-09-01"}}""")]
    [InlineData("""{"periodoA":{"fechaInicio":"2026-10-01","fechaFin":"2026-10-31"},"periodoB":{"fechaInicio":"2026-09-01","fechaFin":"2026-09-30"},"empleados":"1"}""")]
    [InlineData("""{"fechaInicio":"2026-10-01","fechaFin":"2026-10-31"}""")]
    public void Comparar_Invalidos_SeRechazan(string json)
    {
        Assert.False(CjIntelligencePagosTools.ParseComparar(json).Ok);
    }

    [Fact]
    public void Definiciones_EsquemaEstricto_SinUsuarioNiEmpleados_YTodoRequerido()
    {
        var defs = CjIntelligencePagosTools.Definitions();

        Assert.Equal(new[] { CjIntelligencePagosTools.ResumenName, CjIntelligencePagosTools.CompararName }, defs.Select(d => d.Name).ToArray());
        foreach (var def in defs)
        {
            Assert.True(def.Strict);
            Assert.False(def.Parameters["additionalProperties"]!.GetValue<bool>());
            var properties = def.Parameters["properties"]!.AsObject().Select(p => p.Key).ToHashSet();
            var required = def.Parameters["required"]!.AsArray().Select(n => n!.GetValue<string>()).ToHashSet();
            Assert.Equal(properties, required);                          // strict: todas requeridas (las opcionales admiten null)
            Assert.DoesNotContain(properties, p => p.Contains("usuario", StringComparison.OrdinalIgnoreCase)
                                                   || p.Contains("empleado", StringComparison.OrdinalIgnoreCase)
                                                   || p.Contains("alcance", StringComparison.OrdinalIgnoreCase)
                                                   || p.Contains("nivel", StringComparison.OrdinalIgnoreCase));
        }
    }

    // ------------------------------------------------------------------ resumidor

    private static Dictionary<string, object?> Row(params (string K, object? V)[] items) => items.ToDictionary(i => i.K, i => i.V);

    private static PagosResumenArgs Args(int top = 50) =>
        CjIntelligencePagosTools.ParseResumen($$"""{"fechaInicio":"2026-10-01","fechaFin":"2026-10-31","agruparPor":["CLIENTE"],"top":{{top}}}""").Value!;

    private static PagosQueryResult Result(IReadOnlyList<Dictionary<string, object?>> groups, IReadOnlyList<Dictionary<string, object?>> totals) =>
        new("PROPIO", "10", false, groups, totals, 120);

    private static Dictionary<string, object?> Group(string cliente, string moneda, long reg, decimal total) => Row(
        ("Cliente", cliente), ("Moneda", moneda), ("Registros", reg), ("SubtotalMonedaOriginal", total / 1.18m), ("IgvMonedaOriginal", total - total / 1.18m),
        ("TotalMonedaOriginal", total), ("SubtotalSolesEquivalente", 99999m), ("FilasSinTipoCambio", 0), ("TipoCambioAplicado", 3.5m));

    private static Dictionary<string, object?> Total(string moneda, long reg, decimal total) => Row(
        ("Moneda", moneda), ("Registros", reg), ("TotalMonedaOriginal", total), ("TotalSolesEquivalente", 77777m));

    [Fact]
    public void Resumen_DescartaColumnasEnSolesYTipoDeCambio_YUsaLosTotalesDeSql()
    {
        var result = Result([Group("ACME", "SOLES", 3, 118m)], [Total("SOLES", 3, 118m), Total("DOLARES", 2, 500m)]);

        var output = CjIntelligenceResultSummarizer.BuildResumen(Args(), result, "PROPIO", new DateTime(2026, 11, 1, 12, 0, 0, DateTimeKind.Utc), 50);

        Assert.DoesNotContain("SolesEquivalente", output.Json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("FilasSinTipoCambio", output.Json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("TipoCambioAplicado", output.Json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("77777", output.Json);
        Assert.DoesNotContain("99999", output.Json);
        Assert.Equal(5, output.Filas);                                 // 3 + 2: de los totales de SQL
        Assert.False(output.Truncado);
        using var doc = JsonDocument.Parse(output.Json);
        Assert.Equal(2, doc.RootElement.GetProperty("totalesPorMoneda").GetArrayLength());
        Assert.False(doc.RootElement.GetProperty("monedasConvertidas").GetBoolean());
        Assert.Equal("PROPIO", doc.RootElement.GetProperty("alcance").GetString());
        Assert.Equal("2026-10-01", doc.RootElement.GetProperty("periodo").GetProperty("inicio").GetString());
    }

    [Fact]
    public void Resumen_GruposPosiblementeTruncados_SeDeclaran_YNoSeSumanParaObtenerTotales()
    {
        var groups = Enumerable.Range(0, 5).Select(i => Group($"C{i}", "SOLES", 1, 100m)).ToList();
        var result = Result(groups, [Total("SOLES", 40, 4000m)]);

        var output = CjIntelligenceResultSummarizer.BuildResumen(Args(top: 5), result, "PROPIO", DateTime.UtcNow, 50);

        Assert.True(output.Truncado);
        Assert.Equal(40, output.Filas);                                 // universo completo, no las 5 filas recibidas
        Assert.Equal(5, output.FilasEnviadas);
        Assert.Contains("TODO el universo filtrado", output.Json);
    }

    [Fact]
    public void Resumen_RecortaLosGruposQueSeEnvianAlModelo()
    {
        var groups = Enumerable.Range(0, 30).Select(i => Group($"C{i}", "SOLES", 1, 100m)).ToList();

        var output = CjIntelligenceResultSummarizer.BuildResumen(Args(), Result(groups, [Total("SOLES", 30, 3000m)]), "PROPIO", DateTime.UtcNow, 10);

        Assert.Equal(10, output.FilasEnviadas);
        Assert.True(output.Truncado);
    }

    [Fact]
    public void Resumen_SinTotales_AdviertePeroNoCalculaTotalesSumandoGrupos()
    {
        var output = CjIntelligenceResultSummarizer.BuildResumen(Args(), Result([Group("ACME", "SOLES", 3, 118m)], []), "PROPIO", DateTime.UtcNow, 50);

        Assert.Null(output.Filas);
        using var doc = JsonDocument.Parse(output.Json);
        Assert.False(doc.RootElement.GetProperty("totalesDisponibles").GetBoolean());
        Assert.Contains("no calcule totales sumando los grupos", output.Json);
    }

    [Fact]
    public void Resumen_SinRegistros_IndicaConsultaCorrectaSinDatos()
    {
        var output = CjIntelligenceResultSummarizer.BuildResumen(Args(), Result([], []), "PROPIO", DateTime.UtcNow, 50);

        Assert.Contains("sin registros", output.Json);
        Assert.Equal(0, output.FilasEnviadas);
    }

    [Fact]
    public void Comparacion_VariacionPorMoneda_SinMezclarMonedas()
    {
        var a = Args();
        var ra = Result([], [Total("SOLES", 10, 1200m), Total("DOLARES", 2, 300m)]);
        var rb = Result([], [Total("SOLES", 8, 1000m), Total("EUROS", 1, 50m)]);

        var output = CjIntelligenceResultSummarizer.BuildComparacion(a, ra, a, rb, "PROPIO", DateTime.UtcNow, 50);

        using var doc = JsonDocument.Parse(output.Json);
        var rows = doc.RootElement.GetProperty("variacionPorMoneda").EnumerateArray().ToDictionary(e => e.GetProperty("moneda").GetString()!);
        Assert.Equal(3, rows.Count);
        Assert.Equal(200m, rows["SOLES"].GetProperty("diferencia").GetDecimal());
        Assert.Equal(20m, rows["SOLES"].GetProperty("variacionPct").GetDecimal());
        Assert.Equal(300m, rows["DOLARES"].GetProperty("totalA").GetDecimal());
        Assert.Equal(JsonValueKind.Null, rows["DOLARES"].GetProperty("variacionPct").ValueKind);   // base B = 0
        Assert.Equal(-50m, rows["EUROS"].GetProperty("diferencia").GetDecimal());
        Assert.False(doc.RootElement.GetProperty("monedasConvertidas").GetBoolean());
        Assert.Equal(21, output.Filas);
    }

    [Fact]
    public void Comparacion_SinTotalesDeUnPeriodo_Advierte()
    {
        var a = Args();
        var output = CjIntelligenceResultSummarizer.BuildComparacion(a, Result([], [Total("SOLES", 1, 10m)]), a, Result([], []), "PROPIO", DateTime.UtcNow, 50);

        Assert.Contains("Falta el total por moneda", output.Json);
    }

    [Fact]
    public void Limpieza_NormalizaDecimalesYFechas()
    {
        var clean = CjIntelligenceResultSummarizer.Clean(Row(("Importe", 12.3456m), ("Fecha", new DateTime(2026, 10, 5, 8, 0, 0)), ("X", DBNull.Value), ("TotalSoles", 1m)));

        Assert.Equal(12.35m, clean["Importe"]);
        Assert.Equal("2026-10-05", clean["Fecha"]);
        Assert.Null(clean["X"]);
        Assert.DoesNotContain("TotalSoles", clean.Keys);
    }
}
