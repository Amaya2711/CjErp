using System.Text.Json;
using CjERP.Infrastructure.Services;
using Xunit;

namespace CjERP.Backend.Tests.Ia.UnitTests;

/// <summary>
/// PRUEBAS SINTETICAS: tratamiento de las 15 columnas globales como "no disponibles" (no cero) en
/// retirada de columnas, analisis y informe ejecutivo. Trabajan con filas en memoria; no ejecutan SQL.
/// </summary>
[Trait("Category", "Unit")]
public sealed class UnavailableFieldsTests
{
    private static readonly string[] Expected =
    [
        "Ventas", "TotalPagadoHistoricoSoles", "ConPagadoSoles", "ConPagadoMonedaRegistro", "ConPagado",
        "SaldoOcSitio", "SubOc", "SubPlanilla", "SubPlanillaConRegistroActual", "PorcentajeSubPlanilla",
        "AdelaFic", "DiferenciaFic", "CodigoValidacionFic", "ResultadoValidacionFic", "PorcentajeFic"
    ];

    [Fact]
    public void LasQuinceColumnasGlobales_CoincidenConElContratoDelSp()
    {
        Assert.Equal(15, IaGlobalColumns.Names.Count);
        Assert.Equal(Expected.OrderBy(n => n), IaGlobalColumns.Names.OrderBy(n => n));
        Assert.All(Expected, name => Assert.True(IaGlobalColumns.IsGlobal(name.ToUpperInvariant())));
        Assert.False(IaGlobalColumns.IsGlobal("Subtotal"));
        Assert.False(IaGlobalColumns.IsGlobal("SubtotalSoles"));
        Assert.False(IaGlobalColumns.IsGlobal(null));
    }

    [Fact]
    public void StripFromRows_RetiraSoloLasGlobales_NoMutaLaEntrada_YConservaCerosReales()
    {
        var input = new List<Dictionary<string, object?>>
        {
            new()
            {
                ["IdPlanilla"] = 1, ["Subtotal"] = 0m, ["Total"] = null, ["ventas"] = null,
                ["SubOc"] = 5m, ["PorcentajeFic"] = null, ["Cliente"] = "X"
            }
        };

        var result = IaGlobalColumns.StripFromRows(input);

        Assert.Equal(["IdPlanilla", "Subtotal", "Total", "Cliente"], result[0].Keys);
        Assert.Equal(0m, result[0]["Subtotal"]);          // un cero real de una columna NO global se conserva
        Assert.Null(result[0]["Total"]);                  // un NULL no global tampoco se convierte en cero
        Assert.Equal(7, input[0].Count);                  // la entrada no se modifica
        Assert.NotSame(input[0], result[0]);
    }

    [Theory]
    [InlineData("ventas del site LIM123", true)]
    [InlineData("cual es el saldo de la OC", true)]
    [InlineData("monto de la orden de compra 4500", true)]
    [InlineData("porcentaje de avance del proyecto", true)]
    [InlineData("total acumulado pagado", true)]
    [InlineData("gastos de la OC 4500 del cliente Claro", false)]
    [InlineData("gastos pagados de enero por solicitante", false)]
    public void QuestionNeedsGlobalMetric_SoloSiHayColumnasNoDisponibles(string question, bool expected)
    {
        Assert.Equal(expected, IaGlobalColumns.QuestionNeedsGlobalMetric(question, IaGlobalColumns.Names));
        Assert.False(IaGlobalColumns.QuestionNeedsGlobalMetric(question, []));
        Assert.False(IaGlobalColumns.QuestionNeedsGlobalMetric(question, null));
    }

    [Fact]
    public void Analisis_ConColumnasNoDisponibles_ListaLosCamposYNoComparaVentasContraGastos()
    {
        // Filas YA sin las columnas globales (como las entrega el ejecutor).
        var rows = new List<Dictionary<string, object?>>
        {
            new() { ["IdPlanilla"] = 1, ["Subtotal"] = 100m, ["Moneda"] = "SOLES", ["Estado"] = "PAGADO", ["Site"] = "A" }
        };

        var payload = GastosAnalysisService.BuildOpenAiAnalysisPayload(
            "compara ventas contra gastos", new BuscarPlanillaArgs(), rows, 1,
            new Dictionary<string, object?>(), new Dictionary<string, object?>(), IaGlobalColumns.Names);

        using var json = JsonDocument.Parse(JsonSerializer.Serialize(payload));
        var root = json.RootElement;

        Assert.Equal(15, root.GetProperty("unavailableFields").GetArrayLength());
        Assert.Equal("single_metric", root.GetProperty("assumptions").GetProperty("analysisMode").GetString());
        Assert.Equal(JsonValueKind.Null, root.GetProperty("comparison").ValueKind);
        Assert.Contains("NO estan disponibles", root.GetProperty("assumptions").GetProperty("unavailableFieldsRule").GetString());
        Assert.NotEqual("Ventas", root.GetProperty("amountField").GetString());
    }

    [Fact]
    public void Analisis_SinColumnasNoDisponibles_NoAgregaCamposNiRegla()
    {
        var rows = new List<Dictionary<string, object?>>
        {
            new() { ["IdPlanilla"] = 1, ["Subtotal"] = 100m, ["Moneda"] = "SOLES", ["Estado"] = "PAGADO" }
        };

        var payload = GastosAnalysisService.BuildOpenAiAnalysisPayload(
            "gastos", new BuscarPlanillaArgs(), rows, 1,
            new Dictionary<string, object?>(), new Dictionary<string, object?>());

        using var json = JsonDocument.Parse(JsonSerializer.Serialize(payload));
        Assert.Equal(JsonValueKind.Null, json.RootElement.GetProperty("unavailableFields").ValueKind);
        Assert.Equal(JsonValueKind.Null, json.RootElement.GetProperty("assumptions").GetProperty("unavailableFieldsRule").ValueKind);
    }

    [Fact]
    public void Analisis_UnCeroRealDeVentas_SeConservaComoCero_YSeAnalizaComoVentas()
    {
        var rows = new List<Dictionary<string, object?>>
        {
            new() { ["IdPlanilla"] = 1, ["Ventas"] = 0m, ["Subtotal"] = 50m, ["Moneda"] = "SOLES", ["Ot"] = "1", ["Site"] = "A" }
        };

        var payload = GastosAnalysisService.BuildOpenAiAnalysisPayload(
            "ventas", new BuscarPlanillaArgs(), rows, 1,
            new Dictionary<string, object?>(), new Dictionary<string, object?>());

        using var json = JsonDocument.Parse(JsonSerializer.Serialize(payload));
        Assert.Equal("Ventas", json.RootElement.GetProperty("amountField").GetString());
        Assert.Equal(0m, json.RootElement.GetProperty("totalAmount").GetDecimal());   // cero real, columna presente
        Assert.Equal(JsonValueKind.Null, json.RootElement.GetProperty("unavailableFields").ValueKind);
    }

    [Fact]
    public void Informe_MetricaVentasNoDisponible_NoCalculaMontosPorcentajesNiSemaforos()
    {
        var rows = new List<Dictionary<string, object?>>
        {
            new() { ["IdPlanilla"] = 1, ["Subtotal"] = 100m, ["Moneda"] = "SOLES", ["Estado"] = "PAGADO", ["Proyecto"] = "P", ["Site"] = "A" }
        };

        var report = IaExecutiveReportBuilder.Build(rows, 1, "informe de ventas", "respuesta", IaGlobalColumns.Names);

        Assert.True(report.MetricUnavailable);
        Assert.Equal("ventas", report.Metric);
        Assert.Equal(15, report.UnavailableFields.Count);
        Assert.Empty(report.KpiRows);
        Assert.Empty(report.SemaphoreTable);
        Assert.Empty(report.ProjectTable);
        Assert.Empty(report.SiteTable);
        Assert.Empty(report.MonthTable);
        Assert.Empty(report.CurrencyTotals);
        Assert.Empty(report.Recommendations);
        Assert.Contains("no esta disponible", report.ExecutiveReading);
        Assert.DoesNotContain("%", report.ExecutiveReading);
        Assert.Contains(report.SummaryRows, row => Equals(row["valor"], "No disponible por permisos"));
    }

    [Fact]
    public void Informe_MetricaGastosConColumnasGlobalesNoDisponibles_SiSeCalcula()
    {
        var rows = new List<Dictionary<string, object?>>
        {
            new() { ["IdPlanilla"] = 1, ["Subtotal"] = 100m, ["Moneda"] = "SOLES", ["Estado"] = "PAGADO", ["Proyecto"] = "P", ["Site"] = "A" }
        };

        var report = IaExecutiveReportBuilder.Build(rows, 1, "gastos del proyecto P", "respuesta", IaGlobalColumns.Names);

        Assert.False(report.MetricUnavailable);
        Assert.NotEmpty(report.KpiRows);
        Assert.NotEmpty(report.SemaphoreTable);
    }

    [Fact]
    public void Informe_UnCeroRealDeVentas_NoSeTrataComoNoDisponible()
    {
        var rows = new List<Dictionary<string, object?>>
        {
            new() { ["IdPlanilla"] = 1, ["Ventas"] = 0m, ["Subtotal"] = 10m, ["Moneda"] = "SOLES", ["Estado"] = "PAGADO", ["Ot"] = "1", ["Site"] = "A" }
        };

        var report = IaExecutiveReportBuilder.Build(rows, 1, "informe de ventas", "respuesta");

        Assert.False(report.MetricUnavailable);
        Assert.Empty(report.UnavailableFields);
        Assert.NotEmpty(report.KpiRows);
    }
}
