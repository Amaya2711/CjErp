// Puerto en C# de la agregacion deterministica que hoy construye el frontend en
// cjerp-frontend/src/features/reportes/administrativo/iachat.tsx (buildDashboardStructuredData,
// buildExecutiveWeeklyReportData y sus helpers: detectReportMetric, normalizeRowsForMetric,
// resolveReportAmount, buildTopRowsByField, buildMonthlyRows, normalizeCurrencyLabel,
// formatMoneyByCurrency). Se verifico (lectura linea por linea del .tsx) que toda esa logica es
// pura: opera solo sobre response.detailRows/response.interpretedFilters, sin llamar a ningun
// servicio externo ni volver a invocar IA. Por eso es portable sin perder informacion de negocio,
// usando como entrada las mismas filas (DetailRows) que ConversationState.LastResponse ya contiene
// para una conversacion PROPIA del usuario (propiedad verificada por IaConversationStore.TryGetOwned
// antes de llegar aqui). Esto NO equivale a que esas filas esten autorizadas por alcance de datos
// (Propio/Equipo/Total): esa verificacion depende de IIaAuthorizationService, que todavia no existe
// (bloqueado por inspeccionar sp_IA_Planilla_Buscar, ver docs/AI_COPILOT_IMPLEMENTATION_PLAN.md).
// Este builder no decide ni valida permisos — solo reconstruye de forma fiel lo que ya se le entrega.
//
// Reduccion deliberada frente al original (documentada, no oculta): NO se portan los helpers
// buildDisplayFilters/resolveFieldValue sobre InterpretedFilters completos (listado de filtros
// aplicados) ni buildDetailedGridRows (anexo de detalle columna por columna) — ambos son
// presentacion secundaria, no datos de negocio nuevos, y ampliar el puerto para cubrirlos es
// trabajo aparte si se requiere. Los campos de negocio (montos, porcentajes, semaforo, lectura
// ejecutiva, conclusion, recomendaciones) si estan completos.
using System.Globalization;

namespace CjERP.Infrastructure.Services;

public sealed class IaExecutiveReportPayload
{
    public string Metric { get; set; } = "gastos";
    public string Currency { get; set; } = "PEN";
    public bool HasMultipleCurrencies { get; set; }
    public string Period { get; set; } = "No especificado";
    public int TotalRows { get; set; }
    public int FilasAnalizadas { get; set; }
    public bool InformeParcial { get; set; }
    public List<Dictionary<string, object?>> SummaryRows { get; set; } = [];
    public List<Dictionary<string, object?>> KpiRows { get; set; } = [];
    public List<Dictionary<string, object?>> MonthTable { get; set; } = [];
    public List<Dictionary<string, object?>> ProjectTable { get; set; } = [];
    public List<Dictionary<string, object?>> SolicitanteTable { get; set; } = [];
    public List<Dictionary<string, object?>> SiteTable { get; set; } = [];
    public List<Dictionary<string, object?>> CurrencyTable { get; set; } = [];
    public List<Dictionary<string, object?>> CurrencyTotals { get; set; } = [];
    public List<Dictionary<string, object?>> SemaphoreTable { get; set; } = [];
    public string ExecutiveReading { get; set; } = string.Empty;
    public string Conclusion { get; set; } = string.Empty;
    public List<string> Recommendations { get; set; } = [];

    // Solo en resumenes calculados en SQL (modo RESUMEN): dimensiones pedidas, tabla de grupos, barras por moneda
    // (top por moneda, importes de monedas distintas NUNCA se mezclan) y filtros aplicados a la consulta.
    public List<string> GroupDimensions { get; set; } = [];
    public List<Dictionary<string, object?>> GroupTable { get; set; } = [];
    public List<Dictionary<string, object?>> BarsByCurrency { get; set; } = [];
    public List<Dictionary<string, object?>> AppliedFilters { get; set; } = [];

    /// <summary>
    /// true cuando la metrica pedida (p.ej. ventas) depende de campos no disponibles por permisos: el informe
    /// NO contiene montos, porcentajes ni semaforos de esa metrica (no son cero: no existen para este usuario).
    /// </summary>
    public bool MetricUnavailable { get; set; }

    public List<string> UnavailableFields { get; set; } = [];
}

internal sealed record TopRowAggregate(string Label, decimal Amount, int Count, string? Currency, double Participation, int? Ranking);

internal sealed record MonthAggregate(string Month, DateOnly SortKey, decimal Amount, string? Currency);

public static class IaExecutiveReportBuilder
{
    private static readonly CultureInfo Pe = CultureInfo.GetCultureInfo("es-PE");

    public static IaExecutiveReportPayload Build(
        List<Dictionary<string, object?>> detailRows,
        int? totalRowsReportado,
        string? question,
        string? answer,
        IReadOnlyCollection<string>? unavailableFields = null)
    {
        var totalRows = totalRowsReportado ?? detailRows.Count;
        var filasAnalizadas = detailRows.Count;
        var informeParcial = totalRows > filasAnalizadas;

        var metric = DetectMetric(question, answer);

        // Metrica no disponible por permisos: no se calcula NADA con ella (ni totales, ni porcentajes, ni
        // semaforos, ni lecturas derivadas). Un cero real solo existe cuando la columna esta presente.
        if (metric == "ventas" && IaGlobalColumns.IsUnavailable(unavailableFields, ResolveMetricAmountField(metric)))
        {
            return BuildUnavailablePayload(metric, totalRows, filasAnalizadas, informeParcial, unavailableFields!);
        }
        var metricRows = NormalizeRowsForMetric(detailRows, metric);

        var currencyRows = BuildTopRowsByField(metricRows, metric, ["Moneda"], 10, splitByCurrency: false, forceCurrencyKey: true);
        var hasMultipleCurrencies = currencyRows.Count > 1;
        var primaryCurrency = currencyRows.Count > 0 ? NormalizeCurrencyLabel(currencyRows[0].Label) : "PEN";

        var totalAmount = metricRows.Sum(row => ResolveReportAmount(row, metric));
        var totalRecords = metricRows.Count;

        var statusRows = BuildTopRowsByField(detailRows, metric, ["Estado"], 20, splitByCurrency: false);
        var totalPagado = statusRows.Where(s => NormalizeAscii(s.Label).Contains("pagado")).Sum(s => s.Count);
        var paidPercent = filasAnalizadas > 0 ? (double)totalPagado / filasAnalizadas * 100.0 : 0.0;

        var monthRows = BuildMonthlyRows(metricRows, metric, hasMultipleCurrencies);
        var projectRows = BuildTopRowsByField(metricRows, metric, ["Proyecto"], 8, hasMultipleCurrencies);
        var solicitanteRows = BuildTopRowsByField(metricRows, metric, ["Solicitante"], 8, hasMultipleCurrencies);
        var siteRows = BuildTopRowsByField(metricRows, metric, ["Site", "Sitio"], 5, hasMultipleCurrencies, includeRanking: true);
        var clientRows = BuildTopRowsByField(metricRows, metric, ["Cliente"], 5, hasMultipleCurrencies);
        var responsibleRows = BuildTopRowsByField(metricRows, metric, ["Responsable"], 5, hasMultipleCurrencies);

        var topMonth = monthRows.OrderByDescending(m => m.Amount).FirstOrDefault();
        var topProject = projectRows.FirstOrDefault();
        var topSolicitante = solicitanteRows.FirstOrDefault();
        var topSite = siteRows.FirstOrDefault();
        var topClient = clientRows.FirstOrDefault();
        var topResponsable = responsibleRows.FirstOrDefault();
        var topStatus = statusRows.FirstOrDefault();

        var currencyTotalsLabel = currencyRows.Count > 0
            ? string.Join(" | ", currencyRows.Select(c => $"{c.Label}: {FormatMoney(c.Amount, c.Label)}"))
            : "Sin moneda";

        var hasRiskStates = statusRows.Any(s =>
        {
            var normalized = NormalizeAscii(s.Label);
            return normalized.Contains("rechaz") || normalized.Contains("observ") || normalized.Contains("pend");
        });
        var hasNegative = metricRows.Any(r => ResolveReportAmount(r, metric) < 0);

        string SemaphoreState(double share) =>
            hasNegative ? "Rojo" : share >= 60 ? "Rojo" : share >= 40 ? "Amarillo" : "Verde";

        var period = "No especificado"; // PV: puerto reducido, no recibe InterpretedFilters completos (ver cabecera del archivo)

        var payload = new IaExecutiveReportPayload
        {
            Metric = metric,
            Currency = primaryCurrency,
            HasMultipleCurrencies = hasMultipleCurrencies,
            Period = period,
            TotalRows = totalRows,
            FilasAnalizadas = filasAnalizadas,
            InformeParcial = informeParcial,
            CurrencyTotals = currencyRows.Select(c => new Dictionary<string, object?>
            {
                ["Moneda"] = c.Label,
                ["Monto"] = FormatMoney(c.Amount, c.Label),
                ["Registros"] = c.Count,
                ["Participacion"] = $"{c.Participation:F2}%"
            }).ToList(),
            MonthTable = monthRows.Select(m => BuildRowWithOptionalCurrency("Mes", m.Month, hasMultipleCurrencies, m.Currency, primaryCurrency, FormatMoney(m.Amount, m.Currency ?? primaryCurrency))).ToList(),
            ProjectTable = projectRows.Select(p => BuildTableRow("Proyecto", p, hasMultipleCurrencies, primaryCurrency)).ToList(),
            SolicitanteTable = solicitanteRows.Select(p => BuildTableRow("Solicitante", p, hasMultipleCurrencies, primaryCurrency)).ToList(),
            SiteTable = siteRows.Select(p => BuildTableRow("Site", p, hasMultipleCurrencies, primaryCurrency, includeRanking: true)).ToList(),
            CurrencyTable = currencyRows.Select(c => new Dictionary<string, object?>
            {
                ["Moneda"] = c.Label,
                ["Monto"] = FormatMoney(c.Amount, c.Label),
                ["Participación"] = $"{c.Participation:F2}%"
            }).ToList(),
            SemaphoreTable =
            [
                new Dictionary<string, object?>
                {
                    ["Indicador"] = "Estado de registros",
                    ["Estado"] = hasRiskStates ? (paidPercent >= 80 ? "Amarillo" : "Rojo") : "Verde",
                    ["Comentario"] = topStatus is not null
                        ? $"Predomina {topStatus.Label} con {topStatus.Count} registros."
                        : "No hay estado disponible para evaluar."
                },
                new Dictionary<string, object?>
                {
                    ["Indicador"] = "Concentración mensual",
                    ["Estado"] = SemaphoreState(topMonth is not null && totalAmount > 0 ? (double)(topMonth.Amount / totalAmount) * 100.0 : 0),
                    ["Comentario"] = topMonth is not null
                        ? $"{topMonth.Month} concentra {FormatMoney(topMonth.Amount, topMonth.Currency ?? primaryCurrency)}."
                        : "Sin distribución mensual suficiente."
                },
                new Dictionary<string, object?>
                {
                    ["Indicador"] = "Concentración por proyecto",
                    ["Estado"] = SemaphoreState(topProject?.Participation ?? 0),
                    ["Comentario"] = topProject is not null
                        ? $"{topProject.Label} concentra {topProject.Participation:F2}% del total."
                        : "Sin proyecto principal identificado."
                },
                new Dictionary<string, object?>
                {
                    ["Indicador"] = "Concentración por solicitante",
                    ["Estado"] = SemaphoreState(topSolicitante?.Participation ?? 0),
                    ["Comentario"] = topSolicitante is not null
                        ? $"{topSolicitante.Label} concentra {topSolicitante.Participation:F2}% del total."
                        : "Sin solicitante principal identificado."
                },
                new Dictionary<string, object?>
                {
                    ["Indicador"] = "Seguimiento operativo",
                    ["Estado"] = hasNegative || hasRiskStates ? "Amarillo" : "Verde",
                    ["Comentario"] = hasNegative
                        ? "Existen montos negativos que requieren validación."
                        : hasRiskStates
                            ? "Se recomienda seguimiento a estados no pagados."
                            : "El comportamiento operativo luce controlado con la información disponible."
                }
            ]
        };

        var primarySubject = topResponsable?.Label ?? topClient?.Label ?? topProject?.Label ?? "Selección actual";
        payload.SummaryRows =
        [
            KeyValueRow("Responsable / cliente / proyecto analizado", primarySubject),
            KeyValueRow("Periodo evaluado", period),
            KeyValueRow("Total general", hasMultipleCurrencies ? "No consolidado por mezcla de monedas" : FormatMoney(totalAmount, primaryCurrency)),
            KeyValueRow("Cantidad de registros", totalRecords),
            KeyValueRow("Estado principal", topStatus?.Label ?? "Sin estado"),
            KeyValueRow("Monedas identificadas", currencyRows.Count > 0 ? string.Join(", ", currencyRows.Select(c => c.Label)) : "Sin moneda"),
            .. (hasMultipleCurrencies ? currencyRows.Select(c => KeyValueRow(c.Label, FormatMoney(c.Amount, c.Label))) : []),
            .. (hasMultipleCurrencies ? [KeyValueRow("Desglose por moneda", currencyTotalsLabel)] : Array.Empty<Dictionary<string, object?>>()),
            KeyValueRow("Cobertura del análisis", informeParcial
                ? $"INFORME PARCIAL: {filasAnalizadas} de {totalRows} registros totales (limite de analisis alcanzado)"
                : $"{totalRecords} registros analizados")
        ];

        payload.KpiRows =
        [
            new Dictionary<string, object?> { ["Indicador"] = "Total analizado", ["Resultado"] = hasMultipleCurrencies ? "No consolidado por mezcla de monedas" : FormatMoney(totalAmount, primaryCurrency) },
            new Dictionary<string, object?> { ["Indicador"] = "Total registros", ["Resultado"] = totalRecords.ToString(CultureInfo.InvariantCulture) },
            new Dictionary<string, object?> { ["Indicador"] = "% pagado", ["Resultado"] = $"{paidPercent:F2}%" },
            new Dictionary<string, object?> { ["Indicador"] = "Desglose por moneda", ["Resultado"] = currencyRows.Count > 0 ? currencyTotalsLabel : "Sin dato" },
            new Dictionary<string, object?> { ["Indicador"] = "Mes con mayor monto", ["Resultado"] = topMonth is not null ? $"{topMonth.Month} ({FormatMoney(topMonth.Amount, topMonth.Currency ?? primaryCurrency)})" : "Sin dato" },
            new Dictionary<string, object?> { ["Indicador"] = "Proyecto principal", ["Resultado"] = topProject?.Label ?? "Sin dato" },
            new Dictionary<string, object?> { ["Indicador"] = "Solicitante principal", ["Resultado"] = topSolicitante?.Label ?? "Sin dato" },
            new Dictionary<string, object?> { ["Indicador"] = "Site principal", ["Resultado"] = topSite?.Label ?? "Sin dato" }
        ];

        payload.ExecutiveReading = string.Join(" ", new List<string?>
        {
            hasMultipleCurrencies ? $"La data mezcla monedas, por lo que el analisis se separa en: {currencyTotalsLabel}." : null,
            topMonth is not null ? $"El mes con mayor concentración es {topMonth.Month}, con {FormatMoney(topMonth.Amount, topMonth.Currency ?? primaryCurrency)}." : null,
            topProject is not null ? $"El proyecto principal es {topProject.Label}, con una participación de {topProject.Participation:F2}% del total analizado." : null,
            topSolicitante is not null ? $"El solicitante con mayor participación es {topSolicitante.Label}, lo que sugiere un punto prioritario de seguimiento." : null,
            topSite is not null ? $"El site de mayor impacto es {topSite.Label}, que concentra {FormatMoney(topSite.Amount, topSite.Currency ?? primaryCurrency)}." : null
        }.Where(s => !string.IsNullOrEmpty(s)));

        payload.Conclusion = topProject is not null
            ? $"La gestión se concentra principalmente en {topProject.Label}. Conviene monitorear semanalmente su evolución y validar el comportamiento de {topSolicitante?.Label ?? "los solicitantes principales"} para sostener control gerencial."
            : "La información disponible permite un seguimiento general, pero se recomienda profundizar el análisis por proyecto o responsable para una lectura gerencial más precisa.";

        payload.Recommendations = new List<string?>
        {
            topProject is not null ? $"Dar seguimiento semanal al proyecto {topProject.Label} por su mayor participación." : null,
            topSolicitante is not null ? $"Revisar la concentración económica del solicitante {topSolicitante.Label}." : null,
            topSite is not null ? $"Monitorear el impacto operativo del site {topSite.Label}." : null,
            hasRiskStates ? "Revisar los registros no pagados o con estados de seguimiento antes del próximo corte." : "Mantener el control de estados para sostener el nivel de pago observado.",
            metric == "ventas"
                ? "Validar la continuidad comercial comparando ventas contra gasto o rentabilidad cuando corresponda."
                : "Separar el análisis por cliente, proyecto o estado para reforzar la toma de decisiones."
        }.Where(s => !string.IsNullOrEmpty(s)).Take(5).Select(s => s!).ToList();

        if (informeParcial)
        {
            payload.ExecutiveReading =
                $"INFORME PARCIAL: el análisis cubre {filasAnalizadas} de {totalRows} registros totales. " + payload.ExecutiveReading;
        }

        return payload;
    }

    private static readonly HashSet<string> SqlSummaryMeasureFields = new(StringComparer.OrdinalIgnoreCase)
    {
        "Moneda", "Registros", "SubtotalMonedaOriginal", "IgvMonedaOriginal", "TotalMonedaOriginal",
        "SubtotalSolesEquivalente", "FilasSinTipoCambio"
    };

    /// <summary>
    /// Informe ejecutivo de un RESUMEN calculado en SQL (sp_IA_Planilla_Buscar modo RESUMEN). Sus filas son GRUPOS
    /// (dimensiones + Moneda + Registros + Subtotal/Igv/Total en moneda original), no registros de detalle, por lo que
    /// no sirven a Build(). Los importes se muestran siempre por moneda; las barras se arman por moneda.
    /// </summary>
    public static IaExecutiveReportPayload BuildFromSqlSummary(
        List<Dictionary<string, object?>> groups,
        List<Dictionary<string, object?>> totalsByCurrency,
        IReadOnlyList<string>? dimensions,
        int? totalRowsReportado,
        string? question,
        string? answer,
        Dictionary<string, object?>? toolParameters = null)
    {
        var metric = DetectMetric(question, answer);

        var totals = totalsByCurrency.Select(t => new
        {
            Moneda = ResolveFieldText(t, "Moneda") ?? "Sin dato",
            Registros = (int)ResolveNumericField(t, "Registros"),
            Subtotal = ResolveNumericField(t, "SubtotalMonedaOriginal"),
            Igv = ResolveNumericField(t, "IgvMonedaOriginal"),
            Total = ResolveNumericField(t, "TotalMonedaOriginal"),
            Soles = ResolveNumericField(t, "SubtotalSolesEquivalente"),
            SinTc = (int)ResolveNumericField(t, "FilasSinTipoCambio")
        }).ToList();

        var totalRecords = totals.Sum(t => t.Registros);
        var hasMultipleCurrencies = totals.Count > 1;
        var primaryCurrency = totals.Count > 0 ? totals[0].Moneda : "Sin dato";
        var dimKeys = groups.Count > 0
            ? groups[0].Keys.Where(k => !SqlSummaryMeasureFields.Contains(k)).ToList()
            : [];

        string GroupLabel(Dictionary<string, object?> row)
        {
            var parts = dimKeys.Select(k => ResolveFieldText(row, k) ?? "Sin dato").ToList();
            return parts.Count > 0 ? string.Join(" / ", parts) : ResolveFieldText(row, "Moneda") ?? "Total";
        }

        decimal CurrencySubtotal(string moneda) =>
            totals.Where(t => string.Equals(t.Moneda, moneda, StringComparison.OrdinalIgnoreCase)).Sum(t => t.Subtotal);

        double Share(decimal part, decimal whole) => whole == 0 ? 0 : (double)(part / whole * 100m);

        var rankedGroups = groups
            .Select(g => new
            {
                Row = g,
                Label = GroupLabel(g),
                Moneda = ResolveFieldText(g, "Moneda") ?? "Sin dato",
                Registros = (int)ResolveNumericField(g, "Registros"),
                Subtotal = ResolveNumericField(g, "SubtotalMonedaOriginal"),
                Igv = ResolveNumericField(g, "IgvMonedaOriginal"),
                Total = ResolveNumericField(g, "TotalMonedaOriginal")
            })
            .ToList();

        var topGroup = rankedGroups.OrderByDescending(g => g.Subtotal).FirstOrDefault();
        var allWithRate = totals.Count > 0 && totals.All(t => t.SinTc == 0);
        var totalSinTc = totals.Sum(t => t.SinTc);

        var payload = new IaExecutiveReportPayload
        {
            Metric = metric,
            Currency = primaryCurrency,
            HasMultipleCurrencies = hasMultipleCurrencies,
            Period = FormatSummaryPeriod(toolParameters),
            TotalRows = totalRowsReportado ?? totalRecords,
            FilasAnalizadas = totalRecords,
            InformeParcial = false,
            GroupDimensions = (dimensions ?? []).ToList(),
            CurrencyTotals = totals.Select(t => new Dictionary<string, object?>
            {
                ["Moneda"] = t.Moneda,
                ["Monto"] = FormatMoneyByLabel(t.Subtotal, t.Moneda),
                ["Registros"] = t.Registros,
                ["Participacion"] = $"{Share(t.Registros, totalRecords):F2}% de los registros"
            }).ToList(),
            CurrencyTable = totals.Select(t => new Dictionary<string, object?>
            {
                ["Moneda"] = t.Moneda,
                ["Subtotal"] = FormatMoneyByLabel(t.Subtotal, t.Moneda),
                ["IGV"] = FormatMoneyByLabel(t.Igv, t.Moneda),
                ["Total"] = FormatMoneyByLabel(t.Total, t.Moneda),
                ["Registros"] = t.Registros
            }).ToList(),
            GroupTable = rankedGroups.Take(15).Select(g =>
            {
                var row = new Dictionary<string, object?>();
                foreach (var key in dimKeys)
                {
                    row[key] = ResolveFieldText(g.Row, key) ?? "Sin dato";
                }

                row["Moneda"] = g.Moneda;
                row["Registros"] = g.Registros;
                row["Subtotal"] = FormatMoneyByLabel(g.Subtotal, g.Moneda);
                row["IGV"] = FormatMoneyByLabel(g.Igv, g.Moneda);
                row["Total"] = FormatMoneyByLabel(g.Total, g.Moneda);
                row["Participacion"] = $"{Share(g.Subtotal, CurrencySubtotal(g.Moneda)):F2}%";
                return row;
            }).ToList(),
            BarsByCurrency = totals.SelectMany(t => rankedGroups
                .Where(g => string.Equals(g.Moneda, t.Moneda, StringComparison.OrdinalIgnoreCase))
                .OrderByDescending(g => g.Subtotal)
                .Take(10)
                .Select(g => new Dictionary<string, object?>
                {
                    ["Moneda"] = t.Moneda,
                    ["Etiqueta"] = g.Label,
                    ["MontoNumero"] = g.Subtotal,
                    ["Monto"] = FormatMoneyByLabel(g.Subtotal, t.Moneda),
                    ["Participacion"] = Share(g.Subtotal, t.Subtotal)
                })).ToList()
        };

        payload.AppliedFilters = BuildAppliedFilterRows(toolParameters);

        payload.KpiRows =
        [
            new Dictionary<string, object?> { ["Indicador"] = "Total registros", ["Resultado"] = totalRecords.ToString("N0", Pe) },
            .. totals.Select(t => new Dictionary<string, object?>
            {
                ["Indicador"] = $"Subtotal {t.Moneda}",
                ["Resultado"] = $"{FormatMoneyByLabel(t.Subtotal, t.Moneda)} ({t.Registros:N0} registros)"
            }),
            .. totals.Select(t => new Dictionary<string, object?>
            {
                ["Indicador"] = $"Total con IGV {t.Moneda}",
                ["Resultado"] = FormatMoneyByLabel(t.Total, t.Moneda)
            }),
            new Dictionary<string, object?>
            {
                ["Indicador"] = "Grupo principal",
                ["Resultado"] = topGroup is null
                    ? "Sin dato"
                    : $"{topGroup.Label} ({FormatMoneyByLabel(topGroup.Subtotal, topGroup.Moneda)})"
            },
            .. (hasMultipleCurrencies && allWithRate
                ? [new Dictionary<string, object?>
                {
                    ["Indicador"] = "Equivalente en soles (referencial, tipo de cambio aplicado)",
                    ["Resultado"] = FormatMoneyByLabel(totals.Sum(t => t.Soles), "PEN")
                }]
                : Array.Empty<Dictionary<string, object?>>()),
            .. (totalSinTc > 0
                ? [new Dictionary<string, object?>
                {
                    ["Indicador"] = "Registros sin tipo de cambio",
                    ["Resultado"] = totalSinTc.ToString("N0", Pe)
                }]
                : Array.Empty<Dictionary<string, object?>>())
        ];

        payload.SummaryRows =
        [
            KeyValueRow("Periodo evaluado", payload.Period),
            KeyValueRow("Agrupado por", payload.GroupDimensions.Count > 0 ? string.Join(", ", payload.GroupDimensions) : "Moneda"),
            KeyValueRow("Cantidad de registros", totalRecords),
            KeyValueRow("Monedas identificadas", totals.Count > 0 ? string.Join(", ", totals.Select(t => t.Moneda)) : "Sin moneda"),
            KeyValueRow("Cobertura del análisis", $"{totalRecords} registros agrupados en {groups.Count} grupos (los importes no mezclan monedas)")
        ];

        payload.ExecutiveReading = string.Join(" ", new List<string?>
        {
            hasMultipleCurrencies ? $"La data incluye varias monedas; los importes se presentan separados: {string.Join(" | ", totals.Select(t => $"{t.Moneda}: {FormatMoneyByLabel(t.Subtotal, t.Moneda)}"))}." : null,
            topGroup is not null ? $"El grupo con mayor monto es {topGroup.Label}, con {FormatMoneyByLabel(topGroup.Subtotal, topGroup.Moneda)} ({Share(topGroup.Subtotal, CurrencySubtotal(topGroup.Moneda)):F2}% de su moneda)." : null,
            $"Se analizaron {totalRecords:N0} registros en {groups.Count} grupos."
        }.Where(s => !string.IsNullOrEmpty(s)));

        payload.Conclusion = topGroup is not null
            ? $"El gasto se concentra principalmente en {topGroup.Label}. Conviene dar seguimiento a ese grupo y revisar el detalle de los registros que lo componen."
            : "No hay grupos suficientes para una lectura gerencial.";

        payload.Recommendations = new List<string?>
        {
            topGroup is not null ? $"Revisar el detalle de {topGroup.Label} por su mayor participación." : null,
            totalSinTc > 0 ? "Registrar el tipo de cambio de las monedas sin equivalencia para consolidar en soles." : null,
            "Consultar el detalle de un grupo específico para validar sus registros."
        }.Where(s => !string.IsNullOrEmpty(s)).Select(s => s!).ToList();

        return payload;
    }

    private static string FormatSummaryPeriod(Dictionary<string, object?>? toolParameters)
    {
        var start = ResolveToolText(toolParameters, "fechaInicio");
        var end = ResolveToolText(toolParameters, "fechaFin");
        return start is null && end is null ? "No especificado" : $"{start ?? "…"} a {end ?? "…"}";
    }

    private static List<Dictionary<string, object?>> BuildAppliedFilterRows(Dictionary<string, object?>? toolParameters)
    {
        var labels = new (string Key, string Label)[]
        {
            ("estados", "Estado"), ("cliente", "Cliente"), ("proyecto", "Proyecto"), ("site", "Site"), ("idSite", "Id site"),
            ("ot", "OT"), ("responsable", "Responsable"), ("solicitante", "Solicitante"), ("textoBusqueda", "Texto de búsqueda")
        };

        var rows = labels
            .Select(l => (l.Label, Value: ResolveToolText(toolParameters, l.Key)))
            .Where(l => l.Value is not null)
            .Select(l => KeyValueRow(l.Label, l.Value))
            .ToList();

        if (toolParameters is not null && toolParameters.TryGetValue("todosLosEstados", out var all) && all is true)
        {
            rows.Insert(0, KeyValueRow("Estado", "Todos los estados"));
        }

        return rows;
    }

    private static string? ResolveToolText(Dictionary<string, object?>? toolParameters, string key)
    {
        if (toolParameters is null || !TryGetCaseInsensitive(toolParameters, key, out var value) || value is null)
        {
            return null;
        }

        var text = Convert.ToString(value, CultureInfo.InvariantCulture)?.Trim();
        return string.IsNullOrEmpty(text) ? null : text;
    }

    // Etiqueta de moneda de Constante.ValorIni (SOLES, DOLARES, EUROS...) -> simbolo. Las demas se muestran con su etiqueta.
    private static string FormatMoneyByLabel(decimal value, string currencyLabel)
    {
        var normalized = NormalizeAscii(currencyLabel);
        var formatted = value.ToString("N2", Pe);
        if (normalized is "pen" or "s/" or "s/." || normalized.Contains("sol"))
        {
            return $"S/ {formatted}";
        }

        if (normalized.Contains("usd") || normalized.Contains("dolar") || normalized.Contains("us$"))
        {
            return $"US$ {formatted}";
        }

        if (normalized.Contains("eur"))
        {
            return $"€ {formatted}";
        }

        return $"{formatted} {currencyLabel}";
    }

    private static IaExecutiveReportPayload BuildUnavailablePayload(
        string metric,
        int totalRows,
        int filasAnalizadas,
        bool informeParcial,
        IReadOnlyCollection<string> unavailableFields)
    {
        const string message =
            "La metrica de ventas no esta disponible para este usuario segun los permisos configurados; " +
            "no se calcularon totales, porcentajes ni semaforos con ella.";

        return new IaExecutiveReportPayload
        {
            Metric = metric,
            TotalRows = totalRows,
            FilasAnalizadas = filasAnalizadas,
            InformeParcial = informeParcial,
            MetricUnavailable = true,
            UnavailableFields = unavailableFields.ToList(),
            SummaryRows =
            [
                KeyValueRow("Metrica solicitada", "Ventas"),
                KeyValueRow("Disponibilidad", "No disponible por permisos"),
                KeyValueRow("Cantidad de registros analizados", filasAnalizadas)
            ],
            ExecutiveReading = message,
            Conclusion = message
        };
    }

    private static Dictionary<string, object?> KeyValueRow(string campo, object? valor) =>
        new() { ["campo"] = campo, ["valor"] = valor };

    private static Dictionary<string, object?> BuildRowWithOptionalCurrency(
        string etiquetaCampo, string etiquetaValor, bool hasMultipleCurrencies, string? currency, string primaryCurrency, string monto)
    {
        var row = new Dictionary<string, object?> { [etiquetaCampo] = etiquetaValor };
        if (hasMultipleCurrencies)
        {
            row["Moneda"] = currency ?? primaryCurrency;
        }

        row["Monto"] = monto;
        return row;
    }

    private static Dictionary<string, object?> BuildTableRow(
        string etiquetaCampo, TopRowAggregate item, bool hasMultipleCurrencies, string primaryCurrency, bool includeRanking = false)
    {
        var row = new Dictionary<string, object?>();
        if (includeRanking)
        {
            row["Ranking"] = item.Ranking;
        }

        row[etiquetaCampo] = item.Label;
        if (hasMultipleCurrencies)
        {
            row["Moneda"] = item.Currency ?? primaryCurrency;
        }

        row["Monto"] = FormatMoney(item.Amount, item.Currency ?? primaryCurrency);
        row["Participación"] = $"{item.Participation:F2}%";
        return row;
    }

    internal static string DetectMetric(string? question, string? answer)
    {
        var text = $"{question} {answer}".ToLowerInvariant();
        return text.Contains("venta") ? "ventas" : "gastos";
    }

    private static string ResolveMetricAmountField(string metric) => metric == "ventas" ? "Ventas" : "Subtotal";

    internal static List<Dictionary<string, object?>> NormalizeRowsForMetric(
        List<Dictionary<string, object?>> rows, string metric)
    {
        if (metric != "ventas")
        {
            return rows;
        }

        var grouped = new Dictionary<string, Dictionary<string, object?>>(StringComparer.Ordinal);
        foreach (var row in rows)
        {
            var ot = ResolveFieldText(row, "Ot", "OT") ?? string.Empty;
            var site = ResolveFieldText(row, "Site", "Sitio") ?? string.Empty;
            var fallbackKey = ResolveFieldText(row, "IdPlanilla", "IDPLANILLA") ?? Guid.NewGuid().ToString("N");
            var key = !string.IsNullOrEmpty(ot) || !string.IsNullOrEmpty(site) ? $"{ot}||{site}" : fallbackKey;

            if (!grouped.TryGetValue(key, out var current))
            {
                grouped[key] = row;
                continue;
            }

            var currentVentas = ResolveNumericField(current, "Ventas", "ventas");
            var nextVentas = ResolveNumericField(row, "Ventas", "ventas");
            if (nextVentas > currentVentas)
            {
                grouped[key] = row;
            }
        }

        return grouped.Values.ToList();
    }

    internal static decimal ResolveReportAmount(Dictionary<string, object?> row, string metric)
    {
        var field = ResolveMetricAmountField(metric);
        return ResolveNumericField(row, field, field.ToLowerInvariant());
    }

    internal static List<TopRowAggregate> BuildTopRowsByField(
        List<Dictionary<string, object?>> rows,
        string metric,
        string[] fields,
        int limit = 5,
        bool splitByCurrency = false,
        bool includeRanking = false,
        bool forceCurrencyKey = false)
    {
        var grouped = new Dictionary<string, (string Label, decimal Amount, int Count, string? Currency)>(StringComparer.Ordinal);

        foreach (var row in rows)
        {
            string label;
            string? currency;
            if (forceCurrencyKey)
            {
                label = NormalizeCurrencyLabel(ResolveFieldText(row, fields));
                currency = label;
            }
            else
            {
                label = ResolveFieldText(row, fields) ?? "Sin dato";
                currency = splitByCurrency ? NormalizeCurrencyLabel(ResolveFieldText(row, "Moneda")) : null;
            }

            var key = $"{label}||{currency}";
            var amount = ResolveReportAmount(row, metric);
            var (_, existingAmount, existingCount, existingCurrency) = grouped.TryGetValue(key, out var found)
                ? found
                : (label, 0m, 0, currency);

            grouped[key] = (label, existingAmount + amount, existingCount + 1, existingCurrency);
        }

        var total = grouped.Values.Sum(v => v.Amount);

        return grouped.Values
            .OrderByDescending(v => v.Amount)
            .Take(limit)
            .Select((v, index) => new TopRowAggregate(
                v.Currency is not null && !forceCurrencyKey ? $"{v.Label} ({v.Currency})" : v.Label,
                v.Amount,
                v.Count,
                v.Currency,
                total > 0 ? (double)(v.Amount / total) * 100.0 : 0,
                includeRanking ? index + 1 : null))
            .ToList();
    }

    internal static List<MonthAggregate> BuildMonthlyRows(
        List<Dictionary<string, object?>> rows, string metric, bool splitByCurrency)
    {
        var grouped = new Dictionary<string, (DateOnly SortKey, string Month, decimal Amount, string? Currency)>(StringComparer.Ordinal);

        foreach (var row in rows)
        {
            if (!TryResolveDate(row, out var date, "Fecha", "FECHA", "FechaIngresoTexto"))
            {
                continue;
            }

            var sortKey = new DateOnly(date.Year, date.Month, 1);
            var currency = splitByCurrency ? NormalizeCurrencyLabel(ResolveFieldText(row, "Moneda")) : null;
            var key = splitByCurrency ? $"{sortKey:yyyy-MM}||{currency}" : $"{sortKey:yyyy-MM}";

            var monthLabel = date.ToString("MMMM yyyy", Pe);
            var (_, _, existingAmount, existingCurrency) = grouped.TryGetValue(key, out var found)
                ? found
                : (sortKey, monthLabel, 0m, currency);

            grouped[key] = (sortKey, monthLabel, existingAmount + ResolveReportAmount(row, metric), existingCurrency);
        }

        return grouped.Values
            .OrderBy(v => v.SortKey)
            .Select(v => new MonthAggregate(v.Month, v.SortKey, v.Amount, v.Currency))
            .ToList();
    }

    internal static string NormalizeCurrencyLabel(string? value)
    {
        var normalized = NormalizeAscii(value ?? string.Empty);
        return normalized.Contains("usd") || normalized.Contains("dolar") || normalized.Contains("us$")
            ? "USD"
            : "PEN";
    }

    internal static string FormatMoney(decimal value, string currency)
    {
        var formatted = value.ToString("N2", Pe);
        return currency == "USD" ? $"US$ {formatted}" : $"S/ {formatted}";
    }

    private static string NormalizeAscii(string value) => value.Trim().ToLowerInvariant();

    private static string? ResolveFieldText(Dictionary<string, object?> row, params string[] fields)
    {
        foreach (var field in fields)
        {
            if (TryGetCaseInsensitive(row, field, out var value) && value is not null)
            {
                var text = value.ToString();
                if (!string.IsNullOrEmpty(text))
                {
                    return text;
                }
            }
        }

        return null;
    }

    private static decimal ResolveNumericField(Dictionary<string, object?> row, params string[] fields)
    {
        foreach (var field in fields)
        {
            if (!TryGetCaseInsensitive(row, field, out var value) || value is null)
            {
                continue;
            }

            if (TryToDecimal(value, out var numeric))
            {
                return numeric;
            }
        }

        return 0m;
    }

    private static bool TryResolveDate(Dictionary<string, object?> row, out DateTime date, params string[] fields)
    {
        foreach (var field in fields)
        {
            if (TryGetCaseInsensitive(row, field, out var value) && value is not null)
            {
                var text = value.ToString();
                if (!string.IsNullOrWhiteSpace(text) && DateTime.TryParse(
                        text, Pe, System.Globalization.DateTimeStyles.None, out date))
                {
                    return true;
                }
            }
        }

        date = default;
        return false;
    }

    private static bool TryGetCaseInsensitive(Dictionary<string, object?> row, string field, out object? value)
    {
        foreach (var kvp in row)
        {
            if (string.Equals(kvp.Key, field, StringComparison.OrdinalIgnoreCase))
            {
                value = kvp.Value;
                return true;
            }
        }

        value = null;
        return false;
    }

    private static bool TryToDecimal(object value, out decimal result)
    {
        switch (value)
        {
            case decimal d: result = d; return true;
            case double db: result = (decimal)db; return true;
            case float f: result = (decimal)f; return true;
            case int i: result = i; return true;
            case long l: result = l; return true;
            case string s when decimal.TryParse(s, NumberStyles.Any, CultureInfo.InvariantCulture, out var parsed):
                result = parsed;
                return true;
            default:
                result = 0m;
                return false;
        }
    }
}
