// Fase 2 — columnas GLOBALES de dbo.sp_IA_Planilla_Buscar (agregados de site/OC sobre toda la tabla).
// Con la version del SP con alcance (02_sp_IA_Planilla_Buscar_Alcance.sql), si la cuenta no tiene el
// permiso de totales globales, esas 15 columnas llegan en NULL. Un NULL NO es un cero: significa
// "dato no permitido". Este archivo es el unico lugar que conoce la lista y define como se trata:
// las columnas se RETIRAN de las filas (no quedan como null ni se convierten a 0) y el resultado lleva
// la lista explicita de campos no disponibles, de modo que un cero real (columna presente con valor 0)
// siempre se distingue de un dato no permitido (columna ausente + listada como no disponible).
using System.Text.RegularExpressions;

namespace CjERP.Infrastructure.Services;

internal static class IaGlobalColumns
{
    /// <summary>Las 21 columnas globales del SP (15 de la Fase 2 + 6 de la version 2; ver los scripts 02 y 16).</summary>
    internal static readonly IReadOnlyList<string> Names =
    [
        "Ventas",
        "TotalPagadoHistoricoSoles",
        "ConPagadoSoles",
        "ConPagadoMonedaRegistro",
        "ConPagado",
        "SaldoOcSitio",
        "SubOc",
        "SubPlanilla",
        "SubPlanillaConRegistroActual",
        "PorcentajeSubPlanilla",
        "AdelaFic",
        "DiferenciaFic",
        "CodigoValidacionFic",
        "ResultadoValidacionFic",
        "PorcentajeFic",
        // Version 2 del SP (16_sp_IA_Planilla_Buscar_v2_ColumnasAnalisis.sql): agregados por site/OT/banco
        // sobre toda la tabla; mismo tratamiento que las 15 anteriores (NULL = no permitido, nunca 0).
        "TotalSubtotalPorMoneda",
        "TotalMontoBckPorMoneda",
        "TotalMontoVisiblePorMoneda",
        "TotalPagadoConvertidoSoles",
        "TipoCambioFaltanteOT",
        "TotalPagarProcesado"
    ];

    private static readonly HashSet<string> NameSet = new(Names, StringComparer.OrdinalIgnoreCase);

    internal static bool IsGlobal(string? name) => name is not null && NameSet.Contains(name);

    /// <summary>
    /// Devuelve filas NUEVAS sin ninguna de las 15 columnas (comparacion sin distinguir mayusculas).
    /// No modifica las filas de entrada. Defensa en profundidad: aunque una version antigua del SP
    /// devolviera valores, no llegan al analisis, a la memoria ni al cliente.
    /// </summary>
    internal static List<Dictionary<string, object?>> StripFromRows(IEnumerable<Dictionary<string, object?>> rows) =>
        rows.Select(row => row
                .Where(item => !IsGlobal(item.Key))
                .ToDictionary(item => item.Key, item => item.Value))
            .ToList();

    internal static bool IsUnavailable(IReadOnlyCollection<string>? unavailable, string field) =>
        unavailable is { Count: > 0 } && unavailable.Contains(field, StringComparer.OrdinalIgnoreCase);

    // La pregunta depende de una metrica global (ventas, saldo, valor de OC, acumulado pagado...).
    // Heuristica deliberadamente ESTRECHA: no bloquea consultas de gasto que solo filtran por una OC.
    private static readonly Regex GlobalMetricQuestion = new(
        @"\bventas?\b|\bsaldos?\b|\bcon\s*pagado\b|\bconpagado\b|\bcomprometid\w*\b|\bacumulad\w*\b|\bsub\s*oc\b|\bsuboc\b|\b(monto|valor|importe|total)\s+(de\s+)?(la\s+|las\s+)?(oc|ocs|orden(es)?\s+de\s+compra)\b|\b(porcentaje|%)\s+de\s+(avance|uso|ejecucion|ejecución|consumo)\b",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);

    /// <summary>La pregunta menciona una metrica global (ventas, saldos, valor de OC...), con independencia del permiso.</summary>
    internal static bool MentionsGlobalMetric(string? question) =>
        !string.IsNullOrWhiteSpace(question) && GlobalMetricQuestion.IsMatch(question);

    internal static bool QuestionNeedsGlobalMetric(string? question, IReadOnlyCollection<string>? unavailable) =>
        unavailable is { Count: > 0 }
        && !string.IsNullOrWhiteSpace(question)
        && GlobalMetricQuestion.IsMatch(question);

    internal const string UnavailableAnswer =
        "Esa información (ventas, saldos y totales de órdenes de compra por site) no está disponible para tu usuario " +
        "según los permisos configurados. No puedo estimarla ni reemplazarla con otros valores. " +
        "Puedo ayudarte con los gastos dentro de tu alcance.";

    internal const string AnalysisRule =
        "Los campos listados en unavailableFields NO estan disponibles por permisos (no son cero). " +
        "No los estimes, no los sustituyas por otros campos, no calcules saldos, porcentajes, comparaciones, " +
        "semaforos ni totales con ellos y no los presentes como 0; si la pregunta los requiere, indica que no estan disponibles.";
}
