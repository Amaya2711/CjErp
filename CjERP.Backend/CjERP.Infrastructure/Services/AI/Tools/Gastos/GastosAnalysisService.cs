// Extraido de IaChatService.cs en Fase 1.3 (docs/AI_COPILOT_IMPLEMENTATION_PLAN.md).
// Codigo movido tal cual: no se cambio ningun comportamiento, solo la ubicacion. Toda la logica
// aqui es pura (recibe filas ya obtenidas por GastosQueryExecutor y las agrega/interpreta): no
// toca SQL, HTTP ni ConversationState. Es una clase estatica (sin dependencias externas), igual
// que BuscarPlanillaQuestionHeuristics en Fase 1.1: no hay seam real que justifique una interfaz.
using System.Globalization;

namespace CjERP.Infrastructure.Services;

using static CjERP.Infrastructure.Services.IaTextUtils;

public static class GastosAnalysisService
{
    internal static string BuildDetailAnswer(
        List<Dictionary<string, object?>> detailRows,
        int totalRows,
        BuscarPlanillaArgs args)
    {
        if (totalRows <= 0 || detailRows.Count == 0)
        {
            return "No se encontraron registros para los filtros indicados.";
        }

        var previewCount = Math.Min(detailRows.Count, 3);
        var preview = string.Join(
            "; ",
            detailRows
                .Take(previewCount)
                .Select(row => BuildRowPreview(row)));

        var scope = BuildScopeText(args);

        return string.IsNullOrWhiteSpace(preview)
            ? $"Se encontraron {totalRows} registros de detalle{scope}."
            : $"Se encontraron {totalRows} registros de detalle{scope}. Vista previa: {preview}.";
    }

    internal static List<Dictionary<string, object?>> AggregateRowsByField(
        List<Dictionary<string, object?>> rows,
        string groupField,
        string? amountField)
    {
        var grouped = new Dictionary<string, LocalAggregationBucket>(StringComparer.OrdinalIgnoreCase);

        foreach (var row in rows)
        {
            var category = NormalizeAggregationLabel(row.TryGetValue(groupField, out var categoryValue) ? categoryValue : null);
            var bucket = grouped.TryGetValue(category, out var existing)
                ? existing
                : new LocalAggregationBucket(category);

            bucket.Count += 1;
            if (!string.IsNullOrWhiteSpace(amountField) && row.TryGetValue(amountField, out var amountValue))
            {
                bucket.Amount += NormalizeDecimalValue(amountValue);
            }

            grouped[category] = bucket;
        }

        var totalAmount = grouped.Values.Sum(item => item.Amount);

        return grouped.Values
            .OrderByDescending(item => item.Amount)
            .Select(item => new Dictionary<string, object?>
            {
                ["Categoria"] = item.Category,
                ["Registros"] = item.Count,
                ["Monto"] = item.Amount,
                ["Porcentaje"] = totalAmount > 0 ? $"{Math.Round((item.Amount / totalAmount) * 100)}%" : "-",
                ["Total"] = item.Amount
            })
            .ToList();
    }

    internal static string NormalizeAggregationLabel(object? value)
    {
        var text = Convert.ToString(value, CultureInfo.InvariantCulture)?.Trim();
        return string.IsNullOrWhiteSpace(text) ? "Sin dato" : text;
    }

    internal static decimal NormalizeDecimalValue(object? value)
    {
        return value switch
        {
            decimal decimalValue => decimalValue,
            double doubleValue => (decimal)doubleValue,
            float floatValue => (decimal)floatValue,
            int intValue => intValue,
            long longValue => longValue,
            short shortValue => shortValue,
            byte byteValue => byteValue,
            string stringValue when decimal.TryParse(stringValue.Replace(",", string.Empty), NumberStyles.Number, CultureInfo.InvariantCulture, out var parsed) => parsed,
            _ => 0m
        };
    }

    internal static string BuildRowPreview(Dictionary<string, object?> row)
    {
        var preferredKeys = new[]
        {
            "Cliente",
            "Proyecto",
            "Responsable",
            "Solicitante",
            "Site",
            "Ot",
            "Estado",
            "Ventas",
            "MontoOc",
            "MontoOc2",
            "ConPagado",
            "SubOc",
            "SubPlanilla"
        };

        var values = preferredKeys
            .Where(key => row.ContainsKey(key))
            .Select(key => $"{key}: {FormatPreviewValue(row[key])}")
            .Take(4)
            .ToList();

        if (values.Count == 0)
        {
            return string.Join(", ", row.Take(3).Select(item => $"{item.Key}: {FormatPreviewValue(item.Value)}"));
        }

        return string.Join(", ", values);
    }

    internal static string BuildScopeText(BuscarPlanillaArgs args)
    {
        var parts = new List<string>();

        if (!string.IsNullOrWhiteSpace(args.TextoBusqueda))
        {
            parts.Add($"para '{args.TextoBusqueda}'");
        }

        if (!string.IsNullOrWhiteSpace(args.Solicitante))
        {
            parts.Add($"con solicitante '{args.Solicitante}'");
        }

        if (!string.IsNullOrWhiteSpace(args.Estados))
        {
            parts.Add(args.EstadosAplicadosPorDefecto
                ? $"con estados {args.Estados} (aplicado por defecto)"
                : $"con estados {args.Estados}");
        }

        if (args.FechaInicio.HasValue || args.FechaFin.HasValue)
        {
            var start = args.FechaInicio?.ToString("yyyy-MM-dd") ?? "inicio";
            var end = args.FechaFin?.ToString("yyyy-MM-dd") ?? "fin";
            parts.Add($"periodo consultado: {start} a {end}");
        }

        if (parts.Count == 0)
        {
            return string.Empty;
        }

        return $" ({string.Join(", ", parts)})";
    }

    internal static string BuildPeriodText(BuscarPlanillaArgs args)
    {
        if (!args.FechaInicio.HasValue && !args.FechaFin.HasValue)
        {
            return "Periodo consultado: no especificado.";
        }

        var start = args.FechaInicio?.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) ?? "inicio";
        var end = args.FechaFin?.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) ?? "fin";
        return args.FechasAplicadasPorDefecto
            ? $"Periodo consultado: {start} a {end} (aplicado por defecto)."
            : $"Periodo consultado: {start} a {end}.";
    }

    internal static object BuildOpenAiAnalysisPayload(
        string question,
        BuscarPlanillaArgs args,
        List<Dictionary<string, object?>> detailRows,
        int totalRows,
        Dictionary<string, object?> toolParameters,
        Dictionary<string, object?> interpretedFilters)
    {
        var compareVentasAndGastos = ShouldCompareVentasAndGastos(question, detailRows);
        var amountField = ResolveAnalysisValueField(question, detailRows);
        var analysisRows = ApplyBusinessAnalysisRules(question, detailRows, amountField, out var analysisRuleSummary);
        var totalAmount = analysisRows.Sum(row => NormalizeDecimalValue(GetRowValue(row, amountField)));
        var statusBreakdown = BuildSingleFieldBreakdown(analysisRows, "Estado", amountField);
        var currencyBreakdown = BuildSingleFieldBreakdown(analysisRows, "Moneda", amountField);
        var currencyTotals = currencyBreakdown
            .Select(item => new
            {
                Moneda = GetRowText(item, "Moneda"),
                Registros = (int)Math.Round(NormalizeDecimalValue(GetRowValue(item, "Registros"))),
                Monto = NormalizeDecimalValue(GetRowValue(item, amountField ?? "Monto"))
            })
            .ToList();
        var hasMultipleCurrencies = currencyBreakdown.Count > 1;
        decimal? consolidatedTotalAmount = hasMultipleCurrencies ? null : totalAmount;
        var clientProjectBreakdown = BuildClientProjectBreakdown(analysisRows, amountField);
        var monthBreakdown = BuildMonthBreakdown(analysisRows, amountField);
        var siteBreakdown = BuildSingleFieldBreakdown(analysisRows, "Site", amountField, "IdSite", "Site");
        var responsibleBreakdown = BuildSingleFieldBreakdown(analysisRows, "Responsable", amountField);
        var solicitanteBreakdown = BuildSingleFieldBreakdown(analysisRows, "Solicitante", amountField);
        var topRecords = BuildTopRecords(analysisRows, amountField, 10);
        var availableFields = BuildAvailableFields(detailRows);
        var detailSample = BuildDetailSample(analysisRows, amountField, question);
        var comparisonPayload = compareVentasAndGastos
            ? BuildVentasVsGastosComparisonPayload(question, detailRows)
            : null;

        return new
        {
            question,
            period = BuildPeriodText(args),
            assumptions = new
            {
                defaultStateApplied = args.EstadosAplicadosPorDefecto,
                defaultState = args.EstadosAplicadosPorDefecto ? args.Estados : null,
                defaultPeriodApplied = args.FechasAplicadasPorDefecto,
                analysisRule = analysisRuleSummary,
                analysisMode = compareVentasAndGastos ? "comparison_ventas_vs_gastos" : "single_metric",
                multipleCurrencies = hasMultipleCurrencies
            },
            totalRows,
            analysisRows = analysisRows.Count,
            amountField,
            totalAmount = consolidatedTotalAmount,
            hasMultipleCurrencies,
            currencyTotals,
            sourceCoverage = "Los agregados y totales se calcularon sobre el 100% de las filas devueltas por SQL.",
            availableFields,
            toolParameters,
            interpretedFilters,
            breakdowns = new
            {
                currency = TrimBreakdown(currencyBreakdown, 20),
                status = TrimBreakdown(statusBreakdown, 20),
                clientProject = TrimBreakdown(clientProjectBreakdown, 80),
                month = monthBreakdown,
                site = TrimBreakdown(siteBreakdown, 50),
                responsable = TrimBreakdown(responsibleBreakdown, 50),
                solicitante = TrimBreakdown(solicitanteBreakdown, 50)
            },
            topRecords,
            detailSample,
            comparison = comparisonPayload
        };
    }

    internal static List<Dictionary<string, object?>> ApplyBusinessAnalysisRules(
        string question,
        List<Dictionary<string, object?>> rows,
        string? amountField,
        out string? analysisRuleSummary)
    {
        analysisRuleSummary = null;

        if (!ShouldDeduplicateVentas(question, amountField))
        {
            return rows;
        }

        var grouped = new Dictionary<string, (Dictionary<string, object?> Row, int Count)>(StringComparer.OrdinalIgnoreCase);

        foreach (var row in rows)
        {
            var ot = NormalizeAggregationLabel(GetRowValue(row, "Ot", "OT"));
            var site = NormalizeAggregationLabel(GetRowValue(row, "Site", "SITE", "IdSite"));
            var key = $"{ot}||{site}";

            if (grouped.TryGetValue(key, out var existing))
            {
                grouped[key] = (existing.Row, existing.Count + 1);
                continue;
            }

            var clone = CloneRow(row);
            clone["CoincidenciasVentasOtSite"] = 1;
            grouped[key] = (clone, 1);
        }

        var result = grouped.Values
            .Select(item =>
            {
                item.Row["CoincidenciasVentasOtSite"] = item.Count;
                return item.Row;
            })
            .ToList();

        analysisRuleSummary = "Cuando la consulta pide ventas, el campo Ventas se calcula una sola vez por cada combinacion OT + SITE; no se suman filas repetidas del mismo cruce.";
        return result;
    }

    internal static bool ShouldDeduplicateVentas(string question, string? amountField)
    {
        if (string.IsNullOrWhiteSpace(amountField) ||
            !string.Equals(amountField, "Ventas", StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        return System.Text.RegularExpressions.Regex.IsMatch(
            question,
            @"\bventa\b|\bventas\b",
            System.Text.RegularExpressions.RegexOptions.IgnoreCase | System.Text.RegularExpressions.RegexOptions.CultureInvariant);
    }

    internal static bool ShouldCompareVentasAndGastos(string question, List<Dictionary<string, object?>> rows)
    {
        if (string.IsNullOrWhiteSpace(question))
        {
            return false;
        }

        var hasVentasField = rows.Any(row => row.Keys.Any(key => string.Equals(key, "Ventas", StringComparison.OrdinalIgnoreCase)));
        var hasExpenseField = !string.IsNullOrWhiteSpace(ResolveExpenseField(rows));

        if (!hasVentasField || !hasExpenseField)
        {
            return false;
        }

        var mentionsVentas = System.Text.RegularExpressions.Regex.IsMatch(
            question,
            @"\bventa\b|\bventas\b",
            System.Text.RegularExpressions.RegexOptions.IgnoreCase | System.Text.RegularExpressions.RegexOptions.CultureInvariant);

        var mentionsGastos = System.Text.RegularExpressions.Regex.IsMatch(
            question,
            @"\bgasto\b|\bgastos\b",
            System.Text.RegularExpressions.RegexOptions.IgnoreCase | System.Text.RegularExpressions.RegexOptions.CultureInvariant);

        var mentionsComparison = System.Text.RegularExpressions.Regex.IsMatch(
            question,
            @"\bcomparacion\b|\bcomparativa\b|\bcomparativo\b|\bcomparar\b|\bcontra\b|\bversus\b|\bvs\b|\bfrente\b",
            System.Text.RegularExpressions.RegexOptions.IgnoreCase | System.Text.RegularExpressions.RegexOptions.CultureInvariant);

        return mentionsVentas && mentionsGastos && mentionsComparison;
    }

    internal static object BuildVentasVsGastosComparisonPayload(
        string question,
        List<Dictionary<string, object?>> detailRows)
    {
        const string ventasField = "Ventas";
        const string gastosField = "Subtotal";

        var gastosRows = detailRows;
        var ventasRows = ApplyBusinessAnalysisRules(question, detailRows, ventasField, out var ventasRuleSummary);

        var totalGastos = gastosRows.Sum(row => NormalizeDecimalValue(GetRowValue(row, gastosField)));
        var totalVentas = ventasRows.Sum(row => NormalizeDecimalValue(GetRowValue(row, ventasField)));
        var diferencia = totalVentas - totalGastos;
        var porcentajeGastosSobreVentas = totalVentas == 0m ? 0m : Math.Round((totalGastos / totalVentas) * 100m, 2);

        return new
        {
            enabled = true,
            gastosField,
            ventasField,
            rules = new
            {
                ventas = ventasRuleSummary,
                gastos = "Para gastos se suman las filas del periodo filtrado usando siempre el campo Subtotal."
            },
            totals = new
            {
                registrosGastos = gastosRows.Count,
                registrosVentas = ventasRows.Count,
                gastos = totalGastos,
                ventas = totalVentas,
                diferenciaVentasMenosGastos = diferencia,
                porcentajeGastosSobreVentas = porcentajeGastosSobreVentas
            },
            breakdowns = new
            {
                currency = TrimBreakdown(BuildDualMetricFieldBreakdown(gastosRows, ventasRows, "Moneda", gastosField, ventasField), 20),
                month = BuildDualMetricMonthBreakdown(gastosRows, ventasRows, gastosField, ventasField),
                clientProject = TrimBreakdown(BuildDualMetricClientProjectBreakdown(gastosRows, ventasRows, gastosField, ventasField), 80),
                site = TrimBreakdown(BuildDualMetricFieldBreakdown(gastosRows, ventasRows, "Site", gastosField, ventasField, "IdSite"), 50)
            },
            topRecords = new
            {
                gastos = BuildTopRecords(gastosRows, gastosField, 10),
                ventas = BuildTopRecords(ventasRows, ventasField, 10)
            }
        };
    }

    internal static List<string> BuildAvailableFields(List<Dictionary<string, object?>> rows)
    {
        return rows
            .SelectMany(row => row.Keys)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(key => key, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    internal static List<Dictionary<string, object?>> TrimBreakdown(List<Dictionary<string, object?>> rows, int limit)
    {
        return rows.Count <= limit ? rows : rows.Take(limit).ToList();
    }

    internal static List<Dictionary<string, object?>> BuildDetailSample(
        List<Dictionary<string, object?>> rows,
        string? amountField,
        string question)
    {
        var wantsOnlyTotals = question.Contains("solamente totales", StringComparison.OrdinalIgnoreCase) ||
                              question.Contains("solo totales", StringComparison.OrdinalIgnoreCase) ||
                              question.Contains("sin detalle", StringComparison.OrdinalIgnoreCase) ||
                              question.Contains("no detalle", StringComparison.OrdinalIgnoreCase);

        var limit = wantsOnlyTotals ? 5 : 20;

        var amountOutputKey = ResolveAnalysisAmountOutputKey(amountField);

        return rows
            .Take(limit)
            .Select(row => new Dictionary<string, object?>
            {
                ["IdPlanilla"] = GetRowValue(row, "IdPlanilla", "IDPLANILLA"),
                ["Fecha"] = GetRowText(row, "Fecha", "FECHA", "FechaIngresoTexto"),
                ["Cliente"] = GetRowText(row, "Cliente"),
                ["Proyecto"] = GetRowText(row, "Proyecto"),
                ["Site"] = GetRowText(row, "Site", "IdSite"),
                ["Responsable"] = GetRowText(row, "Responsable"),
                ["Solicitante"] = GetRowText(row, "Solicitante"),
                ["Estado"] = GetRowText(row, "Estado"),
                [amountOutputKey] = NormalizeDecimalValue(GetRowValue(row, amountField))
            })
            .ToList();
    }

    internal static List<Dictionary<string, object?>> BuildSingleFieldBreakdown(
        List<Dictionary<string, object?>> rows,
        string primaryField,
        string? amountField,
        params string[] fallbackFields)
    {
        var groups = new Dictionary<string, (int Count, decimal Amount)>(StringComparer.OrdinalIgnoreCase);
        var amountOutputKey = ResolveAnalysisAmountOutputKey(amountField);

        foreach (var row in rows)
        {
            var rawValue = GetRowValue(row, primaryField, fallbackFields);
            var label = NormalizeAggregationLabel(rawValue);
            (int Count, decimal Amount) current = groups.TryGetValue(label, out var existing) ? existing : (0, 0m);

            current.Count += 1;
            if (!string.IsNullOrWhiteSpace(amountField))
            {
                current.Amount += NormalizeDecimalValue(GetRowValue(row, amountField));
            }

            groups[label] = current;
        }

        return groups
            .OrderByDescending(item => item.Value.Amount)
            .ThenBy(item => item.Key, StringComparer.OrdinalIgnoreCase)
            .Select(item => new Dictionary<string, object?>
            {
                [primaryField] = item.Key,
                ["Registros"] = item.Value.Count,
                [amountOutputKey] = item.Value.Amount
            })
            .ToList();
    }

    internal static List<Dictionary<string, object?>> BuildClientProjectBreakdown(
        List<Dictionary<string, object?>> rows,
        string? amountField)
    {
        var groups = new Dictionary<(string Cliente, string Proyecto), (int Count, decimal Amount)>();
        var amountOutputKey = ResolveAnalysisAmountOutputKey(amountField);

        foreach (var row in rows)
        {
            var cliente = NormalizeAggregationLabel(GetRowValue(row, "Cliente"));
            var proyecto = NormalizeAggregationLabel(GetRowValue(row, "Proyecto"));
            var key = (cliente, proyecto);
            (int Count, decimal Amount) current = groups.TryGetValue(key, out var existing) ? existing : (0, 0m);

            current.Count += 1;
            if (!string.IsNullOrWhiteSpace(amountField))
            {
                current.Amount += NormalizeDecimalValue(GetRowValue(row, amountField));
            }

            groups[key] = current;
        }

        return groups
            .OrderByDescending(item => item.Value.Amount)
            .ThenBy(item => item.Key.Cliente, StringComparer.OrdinalIgnoreCase)
            .ThenBy(item => item.Key.Proyecto, StringComparer.OrdinalIgnoreCase)
            .Select(item => new Dictionary<string, object?>
            {
                ["Cliente"] = item.Key.Cliente,
                ["Proyecto"] = item.Key.Proyecto,
                ["Registros"] = item.Value.Count,
                [amountOutputKey] = item.Value.Amount
            })
            .ToList();
    }

    internal static List<Dictionary<string, object?>> BuildMonthBreakdown(
        List<Dictionary<string, object?>> rows,
        string? amountField)
    {
        var groups = new Dictionary<(int Year, int Month), (int Count, decimal Amount)>();
        var amountOutputKey = ResolveAnalysisAmountOutputKey(amountField);

        foreach (var row in rows)
        {
            if (!TryGetRowDate(row, out var date))
            {
                continue;
            }

            var key = (date.Year, date.Month);
            (int Count, decimal Amount) current = groups.TryGetValue(key, out var existing) ? existing : (0, 0m);

            current.Count += 1;
            if (!string.IsNullOrWhiteSpace(amountField))
            {
                current.Amount += NormalizeDecimalValue(GetRowValue(row, amountField));
            }

            groups[key] = current;
        }

        return groups
            .OrderByDescending(item => item.Key.Year)
            .ThenBy(item => item.Key.Month)
            .Select(item => new Dictionary<string, object?>
            {
                ["Mes"] = new DateTime(item.Key.Year, item.Key.Month, 1).ToString("MMMM yyyy", CultureInfo.GetCultureInfo("es-PE")),
                ["Registros"] = item.Value.Count,
                [amountOutputKey] = item.Value.Amount
            })
            .ToList();
    }

    internal static List<Dictionary<string, object?>> BuildDualMetricFieldBreakdown(
        List<Dictionary<string, object?>> gastosRows,
        List<Dictionary<string, object?>> ventasRows,
        string primaryField,
        string gastosField,
        string ventasField,
        params string[] fallbackFields)
    {
        var groups = new Dictionary<string, (int GastoCount, decimal Gastos, int VentaCount, decimal Ventas)>(StringComparer.OrdinalIgnoreCase);

        foreach (var row in gastosRows)
        {
            var label = NormalizeAggregationLabel(GetRowValue(row, primaryField, fallbackFields));
            var current = groups.TryGetValue(label, out var existing) ? existing : (GastoCount: 0, Gastos: 0m, VentaCount: 0, Ventas: 0m);
            current.GastoCount += 1;
            current.Gastos += NormalizeDecimalValue(GetRowValue(row, gastosField));
            groups[label] = current;
        }

        foreach (var row in ventasRows)
        {
            var label = NormalizeAggregationLabel(GetRowValue(row, primaryField, fallbackFields));
            var current = groups.TryGetValue(label, out var existing) ? existing : (GastoCount: 0, Gastos: 0m, VentaCount: 0, Ventas: 0m);
            current.VentaCount += 1;
            current.Ventas += NormalizeDecimalValue(GetRowValue(row, ventasField));
            groups[label] = current;
        }

        return groups
            .OrderByDescending(item => item.Value.Ventas)
            .ThenByDescending(item => item.Value.Gastos)
            .ThenBy(item => item.Key, StringComparer.OrdinalIgnoreCase)
            .Select(item => new Dictionary<string, object?>
            {
                [primaryField] = item.Key,
                ["RegistrosGastos"] = item.Value.GastoCount,
                ["Gastos"] = item.Value.Gastos,
                ["RegistrosVentas"] = item.Value.VentaCount,
                ["Ventas"] = item.Value.Ventas,
                ["DiferenciaVentasMenosGastos"] = item.Value.Ventas - item.Value.Gastos
            })
            .ToList();
    }

    internal static List<Dictionary<string, object?>> BuildDualMetricClientProjectBreakdown(
        List<Dictionary<string, object?>> gastosRows,
        List<Dictionary<string, object?>> ventasRows,
        string gastosField,
        string ventasField)
    {
        var groups = new Dictionary<(string Cliente, string Proyecto), (int GastoCount, decimal Gastos, int VentaCount, decimal Ventas)>();

        foreach (var row in gastosRows)
        {
            var key = (
                NormalizeAggregationLabel(GetRowValue(row, "Cliente")),
                NormalizeAggregationLabel(GetRowValue(row, "Proyecto")));
            var current = groups.TryGetValue(key, out var existing) ? existing : (GastoCount: 0, Gastos: 0m, VentaCount: 0, Ventas: 0m);
            current.GastoCount += 1;
            current.Gastos += NormalizeDecimalValue(GetRowValue(row, gastosField));
            groups[key] = current;
        }

        foreach (var row in ventasRows)
        {
            var key = (
                NormalizeAggregationLabel(GetRowValue(row, "Cliente")),
                NormalizeAggregationLabel(GetRowValue(row, "Proyecto")));
            var current = groups.TryGetValue(key, out var existing) ? existing : (GastoCount: 0, Gastos: 0m, VentaCount: 0, Ventas: 0m);
            current.VentaCount += 1;
            current.Ventas += NormalizeDecimalValue(GetRowValue(row, ventasField));
            groups[key] = current;
        }

        return groups
            .OrderByDescending(item => item.Value.Ventas)
            .ThenByDescending(item => item.Value.Gastos)
            .ThenBy(item => item.Key.Cliente, StringComparer.OrdinalIgnoreCase)
            .ThenBy(item => item.Key.Proyecto, StringComparer.OrdinalIgnoreCase)
            .Select(item => new Dictionary<string, object?>
            {
                ["Cliente"] = item.Key.Cliente,
                ["Proyecto"] = item.Key.Proyecto,
                ["RegistrosGastos"] = item.Value.GastoCount,
                ["Gastos"] = item.Value.Gastos,
                ["RegistrosVentas"] = item.Value.VentaCount,
                ["Ventas"] = item.Value.Ventas,
                ["DiferenciaVentasMenosGastos"] = item.Value.Ventas - item.Value.Gastos
            })
            .ToList();
    }

    internal static List<Dictionary<string, object?>> BuildDualMetricMonthBreakdown(
        List<Dictionary<string, object?>> gastosRows,
        List<Dictionary<string, object?>> ventasRows,
        string gastosField,
        string ventasField)
    {
        var groups = new Dictionary<(int Year, int Month), (int GastoCount, decimal Gastos, int VentaCount, decimal Ventas)>();

        foreach (var row in gastosRows)
        {
            if (!TryGetRowDate(row, out var date))
            {
                continue;
            }

            var key = (date.Year, date.Month);
            var current = groups.TryGetValue(key, out var existing) ? existing : (GastoCount: 0, Gastos: 0m, VentaCount: 0, Ventas: 0m);
            current.GastoCount += 1;
            current.Gastos += NormalizeDecimalValue(GetRowValue(row, gastosField));
            groups[key] = current;
        }

        foreach (var row in ventasRows)
        {
            if (!TryGetRowDate(row, out var date))
            {
                continue;
            }

            var key = (date.Year, date.Month);
            var current = groups.TryGetValue(key, out var existing) ? existing : (GastoCount: 0, Gastos: 0m, VentaCount: 0, Ventas: 0m);
            current.VentaCount += 1;
            current.Ventas += NormalizeDecimalValue(GetRowValue(row, ventasField));
            groups[key] = current;
        }

        return groups
            .OrderByDescending(item => item.Key.Year)
            .ThenBy(item => item.Key.Month)
            .Select(item => new Dictionary<string, object?>
            {
                ["Mes"] = new DateTime(item.Key.Year, item.Key.Month, 1).ToString("MMMM yyyy", CultureInfo.GetCultureInfo("es-PE")),
                ["RegistrosGastos"] = item.Value.GastoCount,
                ["Gastos"] = item.Value.Gastos,
                ["RegistrosVentas"] = item.Value.VentaCount,
                ["Ventas"] = item.Value.Ventas,
                ["DiferenciaVentasMenosGastos"] = item.Value.Ventas - item.Value.Gastos
            })
            .ToList();
    }

    internal static List<Dictionary<string, object?>> BuildTopRecords(
        List<Dictionary<string, object?>> rows,
        string? amountField,
        int limit = 5)
    {
        var amountOutputKey = ResolveAnalysisAmountOutputKey(amountField);

        return rows
            .OrderByDescending(row => NormalizeDecimalValue(GetRowValue(row, amountField)))
            .ThenBy(row => NormalizeText(GetRowText(row, "Cliente", "Proyecto", "Responsable", "Solicitante", "Site", "Estado")) ?? string.Empty, StringComparer.OrdinalIgnoreCase)
            .Take(limit)
            .Select(row => new Dictionary<string, object?>
            {
                ["IdPlanilla"] = GetRowValue(row, "IdPlanilla") ?? GetRowValue(row, "IDPLANILLA"),
                ["Fecha"] = GetRowText(row, "Fecha", "FECHA", "FechaIngresoTexto"),
                ["Cliente"] = GetRowText(row, "Cliente"),
                ["Proyecto"] = GetRowText(row, "Proyecto"),
                ["Site"] = GetRowText(row, "Site", "IdSite"),
                ["Responsable"] = GetRowText(row, "Responsable"),
                ["Solicitante"] = GetRowText(row, "Solicitante"),
                ["Estado"] = GetRowText(row, "Estado"),
                [amountOutputKey] = NormalizeDecimalValue(GetRowValue(row, amountField))
            })
            .ToList();
    }

    internal static string ResolveAnalysisAmountOutputKey(string? amountField)
    {
        return string.IsNullOrWhiteSpace(amountField) ? "Monto" : amountField;
    }

    internal static string? ResolveExpenseField(List<Dictionary<string, object?>> rows)
    {
        var preferred = new[] { "Subtotal", "SubTotal" };

        foreach (var candidate in preferred)
        {
            if (rows.Any(row => row.Keys.Any(key => string.Equals(key, candidate, StringComparison.OrdinalIgnoreCase))))
            {
                return candidate;
            }
        }

        return null;
    }

    internal static object? GetRowValue(Dictionary<string, object?> row, string? key, params string[] additionalKeys)
    {
        if (string.IsNullOrWhiteSpace(key))
        {
            return null;
        }

        var keys = new List<string> { key };
        keys.AddRange(additionalKeys ?? []);

        foreach (var candidate in keys)
        {
            foreach (var entry in row)
            {
                if (string.Equals(entry.Key, candidate, StringComparison.OrdinalIgnoreCase))
                {
                    return entry.Value;
                }
            }
        }

        return null;
    }

    internal static string? GetRowText(Dictionary<string, object?> row, params string[] keys)
    {
        var value = GetRowValue(row, keys.FirstOrDefault(), keys.Skip(1).ToArray());
        return NormalizeText(value?.ToString());
    }

    internal static bool TryGetRowDate(Dictionary<string, object?> row, out DateTime date)
    {
        var candidate = GetRowValue(row, "Fecha", "FECHA", "FechaIngresoTexto", "FechaDeposito", "FechaDepositoTexto");
        switch (candidate)
        {
            case DateTime dateTime:
                date = dateTime;
                return true;
            case DateTimeOffset dateTimeOffset:
                date = dateTimeOffset.DateTime;
                return true;
            case string text when DateTime.TryParse(text, CultureInfo.InvariantCulture, DateTimeStyles.AllowWhiteSpaces, out var parsedInvariant):
                date = parsedInvariant;
                return true;
            case string text when DateTime.TryParse(text, CultureInfo.GetCultureInfo("es-PE"), DateTimeStyles.AllowWhiteSpaces, out var parsedPe):
                date = parsedPe;
                return true;
            case string text when DateTime.TryParse(text, CultureInfo.GetCultureInfo("en-US"), DateTimeStyles.AllowWhiteSpaces, out var parsedUs):
                date = parsedUs;
                return true;
            default:
                date = default;
                return false;
        }
    }

    internal static string FormatPreviewValue(object? value)
    {
        if (value is null)
        {
            return "-";
        }

        return value switch
        {
            DateTime dateTime => dateTime.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            DateTimeOffset dateTimeOffset => dateTimeOffset.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            decimal decimalValue => decimalValue.ToString(CultureInfo.InvariantCulture),
            double doubleValue => doubleValue.ToString(CultureInfo.InvariantCulture),
            float floatValue => floatValue.ToString(CultureInfo.InvariantCulture),
            _ => Convert.ToString(value, CultureInfo.InvariantCulture) ?? "-"
        };
    }

    internal static string ResolveCategoryField(
        List<Dictionary<string, object?>> rows,
        string agruparPor)
    {
        var preferred = agruparPor.Trim();
        var match = rows
            .SelectMany(row => row.Keys)
            .FirstOrDefault(key => string.Equals(key, preferred, StringComparison.OrdinalIgnoreCase));

        return match
            ?? rows.SelectMany(row => row.Keys)
                .FirstOrDefault(key => !IsNumericField(key) && !string.Equals(key, "Total", StringComparison.OrdinalIgnoreCase))
            ?? preferred;
    }

    internal static string ResolveValueField(List<Dictionary<string, object?>> rows)
    {
        var preferred = new[]
        {
            "SubTotalSoles",
            "SubtotalSoles",
            "SubTotal",
            "Subtotal",
            "ConPagadoSoles",
            "ConPagado",
            "Ventas",
            "MontoOc2",
            "MontoOc",
            "SubOc",
            "SubPlanilla",
            "DiferenciaFic",
            "TotalSoles",
            "TotalMonto",
            "MontoTotal",
            "Total",
            "Valor",
            "Importe",
            "Saldo",
            "Cantidad",
            "CantidadRegistros",
            "TotalRegistros"
        };

        foreach (var candidate in preferred)
        {
            if (rows.Any(row => row.Keys.Any(key => string.Equals(key, candidate, StringComparison.OrdinalIgnoreCase))))
            {
                return candidate;
            }
        }

        var inferredField = rows
            .SelectMany(row => row.Keys)
            .FirstOrDefault(key => IsNumericField(key) || LooksLikeNumericField(key));

        return inferredField ?? "Total";
    }

    internal static string ResolveAnalysisValueField(string question, List<Dictionary<string, object?>> rows)
    {
        if (ShouldPrioritizeVentasMetric(question) &&
            rows.Any(row => row.Keys.Any(key => string.Equals(key, "Ventas", StringComparison.OrdinalIgnoreCase))))
        {
            return "Ventas";
        }

        return ResolveExpenseField(rows) ?? "Subtotal";
    }

    internal static bool ShouldPrioritizeVentasMetric(string question)
    {
        return System.Text.RegularExpressions.Regex.IsMatch(
            question,
            @"\bventa\b|\bventas\b",
            System.Text.RegularExpressions.RegexOptions.IgnoreCase | System.Text.RegularExpressions.RegexOptions.CultureInvariant);
    }

    internal static bool IsNumericField(string key)
    {
        return string.Equals(key, "Total", StringComparison.OrdinalIgnoreCase) ||
               string.Equals(key, "TotalSoles", StringComparison.OrdinalIgnoreCase) ||
               string.Equals(key, "TotalMonto", StringComparison.OrdinalIgnoreCase) ||
               string.Equals(key, "MontoTotal", StringComparison.OrdinalIgnoreCase) ||
               string.Equals(key, "TotalRegistros", StringComparison.OrdinalIgnoreCase) ||
               string.Equals(key, "Monto", StringComparison.OrdinalIgnoreCase) ||
               string.Equals(key, "Ventas", StringComparison.OrdinalIgnoreCase) ||
               string.Equals(key, "MontoOc", StringComparison.OrdinalIgnoreCase) ||
               string.Equals(key, "MontoOc2", StringComparison.OrdinalIgnoreCase) ||
               string.Equals(key, "Cantidad", StringComparison.OrdinalIgnoreCase) ||
               string.Equals(key, "CantidadRegistros", StringComparison.OrdinalIgnoreCase) ||
               string.Equals(key, "Valor", StringComparison.OrdinalIgnoreCase) ||
               string.Equals(key, "Importe", StringComparison.OrdinalIgnoreCase) ||
               string.Equals(key, "Saldo", StringComparison.OrdinalIgnoreCase) ||
               string.Equals(key, "SubTotal", StringComparison.OrdinalIgnoreCase) ||
               string.Equals(key, "SubTotalSoles", StringComparison.OrdinalIgnoreCase) ||
               string.Equals(key, "ConPagado", StringComparison.OrdinalIgnoreCase) ||
               string.Equals(key, "ConPagadoSoles", StringComparison.OrdinalIgnoreCase) ||
               string.Equals(key, "SubOc", StringComparison.OrdinalIgnoreCase) ||
               string.Equals(key, "SubPlanilla", StringComparison.OrdinalIgnoreCase) ||
               string.Equals(key, "DiferenciaFic", StringComparison.OrdinalIgnoreCase);
    }

    internal static bool LooksLikeNumericField(string key)
    {
        var normalized = key.ToLowerInvariant();

        return normalized.Contains("total", StringComparison.OrdinalIgnoreCase) ||
               normalized.Contains("monto", StringComparison.OrdinalIgnoreCase) ||
               normalized.Contains("cantidad", StringComparison.OrdinalIgnoreCase) ||
               normalized.Contains("valor", StringComparison.OrdinalIgnoreCase) ||
               normalized.Contains("importe", StringComparison.OrdinalIgnoreCase) ||
               normalized.Contains("saldo", StringComparison.OrdinalIgnoreCase) ||
               normalized.Contains("pagado", StringComparison.OrdinalIgnoreCase) ||
               normalized.Contains("suboc", StringComparison.OrdinalIgnoreCase) ||
               normalized.Contains("subplanilla", StringComparison.OrdinalIgnoreCase) ||
               normalized.Contains("diferencia", StringComparison.OrdinalIgnoreCase);
    }

    internal static Dictionary<string, object?> CloneRow(Dictionary<string, object?> row)
    {
        return row.ToDictionary(item => item.Key, item => item.Value);
    }

    private sealed class LocalAggregationBucket
    {
        public LocalAggregationBucket(string category)
        {
            Category = category;
        }

        public string Category { get; }

        public int Count { get; set; }

        public decimal Amount { get; set; }
    }
}
