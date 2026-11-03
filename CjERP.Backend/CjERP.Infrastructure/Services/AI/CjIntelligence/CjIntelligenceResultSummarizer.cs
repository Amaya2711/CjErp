// CJ Intelligence: arma el resultado COMPACTO que se entrega al modelo (y que se guarda como evidencia).
//
// Reglas de exactitud:
// - Los totales por moneda son los que calculo SQL sobre TODO el universo filtrado. Nunca se suman grupos para obtener un total.
// - Si los grupos pueden estar truncados (TOP) se declara; el modelo no debe recalcular totales con ellos.
// - Importes siempre en la moneda original: se DESCARTAN las columnas en soles y de tipo de cambio que devuelve el SP
//   (a_tipo_cambio_diario no tiene filas activas: esas cifras usan valores por defecto, no verificados).
// - La variacion entre periodos se calcula aqui, por moneda, a partir de los totales de SQL; nunca mezcla monedas.
using System.Globalization;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

namespace CjERP.Infrastructure.Services.AI.CjIntelligence;

public sealed record CjToolOutput(string Json, int? Filas, int FilasEnviadas, bool Truncado, string TotalesJson);

public static class CjIntelligenceResultSummarizer
{
    private static readonly Regex DroppedColumn = new("soles|tipocambio|sintipocambio", RegexOptions.IgnoreCase | RegexOptions.Compiled | RegexOptions.CultureInvariant);

    public static CjToolOutput BuildResumen(PagosResumenArgs args, PagosQueryResult result, string nivel, DateTime consultadoUtc, int maxGroups)
    {
        var json = SummaryNode(args, result, nivel, consultadoUtc, maxGroups, out var filas, out var enviadas, out var truncado, out var totales);
        json["herramienta"] = CjIntelligencePagosTools.ResumenName;
        return new CjToolOutput(json.ToJsonString(), filas, enviadas, truncado, totales.ToJsonString());
    }

    public static CjToolOutput BuildComparacion(
        PagosResumenArgs a, PagosQueryResult ra, PagosResumenArgs b, PagosQueryResult rb, string nivel, DateTime consultadoUtc, int maxGroups)
    {
        var nodeA = SummaryNode(a, ra, nivel, consultadoUtc, maxGroups, out var filasA, out var enviadasA, out var truncA, out var totA);
        var nodeB = SummaryNode(b, rb, nivel, consultadoUtc, maxGroups, out var filasB, out var enviadasB, out var truncB, out var totB);

        var variacion = new JsonArray();
        var warnings = new JsonArray();
        var byA = TotalsByCurrency(ra.TotalesPorMoneda);
        var byB = TotalsByCurrency(rb.TotalesPorMoneda);

        if (ra.TotalesPorMoneda.Count == 0 || rb.TotalesPorMoneda.Count == 0)
        {
            warnings.Add("Falta el total por moneda de al menos un periodo: no se calcula la variacion de esa moneda.");
        }

        foreach (var currency in byA.Keys.Union(byB.Keys, StringComparer.OrdinalIgnoreCase).OrderBy(c => c, StringComparer.OrdinalIgnoreCase))
        {
            byA.TryGetValue(currency, out var ta);
            byB.TryGetValue(currency, out var tb);
            var item = new JsonObject
            {
                ["moneda"] = currency,
                ["registrosA"] = ta.Registros,
                ["registrosB"] = tb.Registros,
                ["totalA"] = ta.Total,
                ["totalB"] = tb.Total,
                ["diferencia"] = ta.Total - tb.Total,
                ["variacionPct"] = tb.Total == 0m ? null : decimal.Round((ta.Total - tb.Total) / tb.Total * 100m, 2)
            };
            variacion.Add(item);
        }

        warnings.Add("La variacion se calcula como periodoA respecto de periodoB (base), por moneda y sobre los totales completos de SQL; no mezcla monedas.");
        if (truncA || truncB)
        {
            warnings.Add("Los grupos de algun periodo pueden estar truncados; las variaciones por moneda usan totales completos, no los grupos.");
        }

        var root = new JsonObject
        {
            ["herramienta"] = CjIntelligencePagosTools.CompararName,
            ["consultadoUtc"] = consultadoUtc.ToString("O", CultureInfo.InvariantCulture),
            ["monedasConvertidas"] = false,
            ["variacionPorMoneda"] = variacion,
            ["periodoA"] = nodeA,
            ["periodoB"] = nodeB,
            ["advertencias"] = warnings
        };

        var filas = filasA is null && filasB is null ? (int?)null : (filasA ?? 0) + (filasB ?? 0);
        var totales = new JsonObject { ["periodoA"] = totA, ["periodoB"] = totB };
        return new CjToolOutput(root.ToJsonString(), filas, enviadasA + enviadasB, truncA || truncB, totales.ToJsonString());
    }

    // ------------------------------------------------------------------

    private static JsonObject SummaryNode(
        PagosResumenArgs args, PagosQueryResult result, string nivel, DateTime consultadoUtc, int maxGroups,
        out int? filas, out int enviadas, out bool truncado, out JsonArray totales)
    {
        var groups = OrderGroups(result.Grupos.Take(maxGroups).Select(Clean).ToList());
        truncado = result.Grupos.Count > maxGroups || result.Grupos.Count >= args.Top;
        enviadas = groups.Count;

        totales = new JsonArray(result.TotalesPorMoneda.Select(r => (JsonNode?)ToNode(Clean(r))).ToArray());
        filas = result.TotalesPorMoneda.Count == 0
            ? null
            : result.TotalesPorMoneda.Sum(r => (int)Math.Min(int.MaxValue, TryLong(r, "Registros")));

        var warnings = new JsonArray { "Importes en la moneda original de cada registro; no se convirtieron." };
        if (result.TotalesPorMoneda.Count == 0)
        {
            warnings.Add("No hay totales por moneda del universo filtrado: no calcule totales sumando los grupos.");
        }

        if (truncado)
        {
            warnings.Add("Los grupos pueden estar incompletos (limite de grupos). Los totales por moneda cubren TODO el universo filtrado; no los recalcule sumando grupos.");
        }

        if (result.Grupos.Count == 0 && result.TotalesPorMoneda.Count == 0)
        {
            warnings.Add("Consulta ejecutada correctamente sin registros para los criterios.");
        }

        var filters = new JsonObject();
        void Put(string name, string? value)
        {
            if (!string.IsNullOrWhiteSpace(value))
            {
                filters[name] = value;
            }
        }

        Put("estados", args.Estados); Put("cliente", args.Cliente); Put("proyecto", args.Proyecto); Put("site", args.Site);
        Put("responsable", args.Responsable); Put("solicitante", args.Solicitante); Put("textoBusqueda", args.TextoBusqueda);

        return new JsonObject
        {
            ["consultadoUtc"] = consultadoUtc.ToString("O", CultureInfo.InvariantCulture),
            ["periodo"] = new JsonObject
            {
                ["inicio"] = args.Periodo.Inicio.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                ["fin"] = args.Periodo.Fin.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture)
            },
            ["filtros"] = filters,
            ["agrupadoPor"] = new JsonArray(args.AgruparPor.Select(d => (JsonNode?)JsonValue.Create(d)).ToArray()),
            ["alcance"] = nivel,
            ["monedasConvertidas"] = false,
            ["totalesPorMoneda"] = totales.DeepClone(),
            ["totalesDisponibles"] = result.TotalesPorMoneda.Count > 0,
            ["grupos"] = new JsonArray(groups.Select(g => (JsonNode?)ToNode(g)).ToArray()),
            ["gruposDevueltos"] = groups.Count,
            ["gruposPosiblementeTruncados"] = truncado,
            ["advertencias"] = warnings
        };
    }

    // Orden de presentacion (regla del negocio): cliente, proyecto, site, tipo de trabajo, tarea, periodo, moneda.
    // Cada nivel acepta varios nombres de columna; solo se usan los que existen en el resultado (segun lo agrupado).
    private static readonly string[][] OrderLevels =
    [
        ["cliente"], ["proyecto"], ["site"], ["tipotrabajo"], ["tarea"], ["fecha", "mes", "periodo"], ["moneda"]
    ];

    private static string NormalizeColumn(string name) => name.Replace("_", string.Empty).Replace(" ", string.Empty).ToLowerInvariant();

    /// <summary>
    /// Ordena los grupos por cliente, proyecto, site, tipo de trabajo, tarea, periodo y moneda (ascendente, vacios al final).
    /// Solo ordena; no agrega, quita ni modifica filas ni cifras. Se aplica DESPUES de recortar a los grupos que se envian, de modo que
    /// no cambia cuales grupos entran. Si ninguna de esas columnas existe, conserva el orden recibido.
    /// </summary>
    public static List<Dictionary<string, object?>> OrderGroups(List<Dictionary<string, object?>> rows)
    {
        if (rows.Count < 2)
        {
            return rows;
        }

        var columns = new List<string>();
        foreach (var aliases in OrderLevels)
        {
            foreach (var key in rows[0].Keys)
            {
                if (aliases.Contains(NormalizeColumn(key)) && !columns.Contains(key))
                {
                    columns.Add(key);
                }
            }
        }

        if (columns.Count == 0)
        {
            return rows;
        }

        static string? Text(Dictionary<string, object?> row, string column) =>
            row.TryGetValue(column, out var value) && value is not null ? Convert.ToString(value, CultureInfo.InvariantCulture)?.Trim() : null;

        IOrderedEnumerable<Dictionary<string, object?>>? ordered = null;
        foreach (var column in columns)
        {
            var col = column;
            ordered = ordered is null
                ? rows.OrderBy(r => string.IsNullOrEmpty(Text(r, col))).ThenBy(r => Text(r, col) ?? string.Empty, StringComparer.OrdinalIgnoreCase)
                : ordered.ThenBy(r => string.IsNullOrEmpty(Text(r, col))).ThenBy(r => Text(r, col) ?? string.Empty, StringComparer.OrdinalIgnoreCase);
        }

        return ordered!.ToList();
    }

    /// <summary>Quita las columnas en soles / tipo de cambio y normaliza valores.</summary>
    public static Dictionary<string, object?> Clean(Dictionary<string, object?> row) =>
        row.Where(kv => !DroppedColumn.IsMatch(kv.Key)).ToDictionary(kv => kv.Key, kv => Normalize(kv.Value));

    private static object? Normalize(object? value) => value switch
    {
        null => null,
        DBNull => null,
        decimal d => decimal.Round(d, 2),
        double d => Math.Round(d, 2),
        float f => Math.Round((double)f, 2),
        DateTime dt => dt.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
        DateTimeOffset dto => dto.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
        _ => value
    };

    private static JsonObject ToNode(Dictionary<string, object?> row)
    {
        var node = new JsonObject();
        foreach (var (key, value) in row)
        {
            node[key] = value switch
            {
                null => null,
                string s => JsonValue.Create(s),
                bool b => JsonValue.Create(b),
                int i => JsonValue.Create(i),
                long l => JsonValue.Create(l),
                short sh => JsonValue.Create((int)sh),
                byte by => JsonValue.Create((int)by),
                decimal d => JsonValue.Create(d),
                double d => JsonValue.Create(d),
                _ => JsonValue.Create(Convert.ToString(value, CultureInfo.InvariantCulture))
            };
        }

        return node;
    }

    private static long TryLong(Dictionary<string, object?> row, string name)
    {
        var entry = row.FirstOrDefault(kv => string.Equals(kv.Key, name, StringComparison.OrdinalIgnoreCase));
        return entry.Value is null ? 0 : Convert.ToInt64(entry.Value, CultureInfo.InvariantCulture);
    }

    private static decimal TryDecimal(Dictionary<string, object?> row, string name)
    {
        var entry = row.FirstOrDefault(kv => string.Equals(kv.Key, name, StringComparison.OrdinalIgnoreCase));
        return entry.Value is null ? 0m : Convert.ToDecimal(entry.Value, CultureInfo.InvariantCulture);
    }

    private static Dictionary<string, (long Registros, decimal Total)> TotalsByCurrency(IReadOnlyList<Dictionary<string, object?>> totals)
    {
        var map = new Dictionary<string, (long, decimal)>(StringComparer.OrdinalIgnoreCase);
        foreach (var row in totals)
        {
            var entry = row.FirstOrDefault(kv => string.Equals(kv.Key, "Moneda", StringComparison.OrdinalIgnoreCase));
            var currency = Convert.ToString(entry.Value, CultureInfo.InvariantCulture)?.Trim();
            if (string.IsNullOrEmpty(currency))
            {
                currency = "Sin dato";
            }

            var (registros, total) = map.TryGetValue(currency, out var current) ? current : (0L, 0m);
            map[currency] = (registros + TryLong(row, "Registros"), total + TryDecimal(row, "TotalMonedaOriginal"));
        }

        return map;
    }
}
