// CJ Intelligence: compatibilidad de lo GUARDADO con los permisos VIGENTES.
//
// Resolver los permisos actuales antes de consultar SQL no basta: una respuesta, un resultado o un resumen guardados pudieron generarse
// con un alcance mayor (p. ej. TOTAL) y el usuario pudo perderlo despues. Antes de devolver una respuesta completada, de mostrar una
// conversacion o de incorporar mensajes, resumenes, estado o resultados al contexto del modelo, se comprueba que lo guardado esta
// CONTENIDO en el alcance actual. Si no, no se devuelve ni se envia al modelo (el texto se sustituye por un aviso sin cifras).
//
// Regla de contencion de un resultado con datos (Estado = OK), segun el alcance con el que SQL lo produjo:
//   - Uso de totales globales            => exige que el usuario aun pueda verlos.
//   - TOTAL                              => solo es compatible si el alcance vigente sigue siendo TOTAL.
//   - PROPIO / EQUIPO con empleados L    => compatible si el alcance vigente es TOTAL, o si TODOS los empleados de L siguen en el vigente
//                                           (un equipo que pierde un integrante invalida lo calculado con el; si solo crece, sigue valiendo).
//   - Nivel desconocido o lista ilegible => incompatible (falla cerrado).
// Los resultados sin datos (BLOQUEADO / ERROR) no restringen. De cada turno solo cuenta el ULTIMO intento (el que produjo la respuesta).
//
// Estado de la conversacion: solo se conservan los FILTROS (periodo, cliente, proyecto...), re-validados con el mismo analizador estricto
// de las herramientas; nunca cifras. Las cifras anteriores no se reutilizan: hay que volver a consultar con el alcance vigente.
using System.Text.Json;
using System.Text.Json.Nodes;
using CjERP.Application.Interfaces.Services.AI;

namespace CjERP.Infrastructure.Services.AI.CjIntelligence;

public sealed record CjMessageView(CjMessageRow Row, string Content, bool Omitted);

public static class CjIntelligenceHistoryGuard
{
    public const string OmittedText =
        "[Respuesta omitida: contenia informacion que excede tus permisos actuales. Vuelve a consultar para obtener datos con tu alcance vigente.]";

    public static bool IsResultCompatible(CjResultRefRow result, IaResolvedScope current)
    {
        if (result is null || current is null)
        {
            return false;
        }

        if (!string.Equals(result.Estado?.Trim(), "OK", StringComparison.OrdinalIgnoreCase))
        {
            return true;                       // sin datos: nada que restringir
        }

        if (result.UsaTotalesGlobales && !current.CanViewGlobalTotals)
        {
            return false;
        }

        switch (result.AlcanceNivel?.Trim().ToUpperInvariant())
        {
            case "TOTAL":
                return current.Level == IaScopeLevel.Total;

            case "PROPIO":
            case "EQUIPO":
                // Sin evidencia suficiente del alcance (lista de empleados ausente o ilegible) se EXCLUYE siempre, tambien para TOTAL.
                if (!TryParseIds(result.AlcanceEmpleados, out var ids))
                {
                    return false;
                }

                if (current.Level == IaScopeLevel.Total)
                {
                    return true;
                }

                var allowed = new HashSet<int>(current.EmployeeIds);
                return ids.All(allowed.Contains);

            default:
                return false;
        }
    }

    /// <summary>Turnos con al menos un resultado del ULTIMO intento fuera del alcance vigente.</summary>
    public static HashSet<long> IncompatibleTurns(IEnumerable<CjResultRefRow> results, IaResolvedScope current)
    {
        var incompatible = new HashSet<long>();
        foreach (var turn in (results ?? []).GroupBy(r => r.IdTurno))
        {
            var last = turn.Max(r => r.Intento);
            if (turn.Where(r => r.Intento == last).Any(r => !IsResultCompatible(r, current)))
            {
                incompatible.Add(turn.Key);
            }
        }

        return incompatible;
    }

    /// <summary>Mensajes listos para mostrar o enviar al modelo: la respuesta de un turno incompatible se sustituye por un aviso sin cifras.</summary>
    public static IReadOnlyList<CjMessageView> FilterMessages(IEnumerable<CjMessageRow> messages, IEnumerable<CjResultRefRow> results, IaResolvedScope current)
    {
        var incompatible = IncompatibleTurns(results, current);
        return (messages ?? [])
            // Una respuesta del asistente sin turno asociado no tiene evidencia de su alcance: se excluye.
            .Select(m => m.Rol == "assistant" && (m.IdTurno is not { } turn || incompatible.Contains(turn))
                ? new CjMessageView(m, OmittedText, true)
                : new CjMessageView(m, m.Contenido, false))
            .ToList();
    }

    /// <summary>Un resumen guardado solo sirve si ninguno de los turnos que cubre quedo fuera del alcance vigente.</summary>
    public static bool IsSummaryCompatible(CjConversationState? state, IEnumerable<CjResultRefRow> results, IaResolvedScope current)
    {
        if (state is null || string.IsNullOrWhiteSpace(state.Resumen))
        {
            return true;
        }

        var all = (results ?? []).ToList();
        var incompatible = IncompatibleTurns(all, current);
        if (incompatible.Count == 0)
        {
            return true;
        }

        // Sin saber hasta donde llega el resumen, cualquier turno incompatible lo invalida.
        if (state.ResumenHastaSecuencia is not { } hasta)
        {
            return false;
        }

        return !all.Any(r => incompatible.Contains(r.IdTurno) && (r.SecuenciaTurno is null || r.SecuenciaTurno <= hasta));
    }

    /// <summary>
    /// Conserva SOLO los filtros de la ultima consulta, re-validados con el analizador estricto (nunca cifras ni otros campos).
    /// Devuelve null si no hay estado util o no pasa la validacion.
    /// </summary>
    public static string? SanitizeState(string? estadoJson)
    {
        if (string.IsNullOrWhiteSpace(estadoJson))
        {
            return null;
        }

        try
        {
            using var doc = JsonDocument.Parse(estadoJson);
            if (doc.RootElement.ValueKind != JsonValueKind.Object
                || !doc.RootElement.TryGetProperty("ultimaConsulta", out var last)
                || last.ValueKind != JsonValueKind.Object
                || !last.TryGetProperty("herramienta", out var tool) || tool.ValueKind != JsonValueKind.String
                || !last.TryGetProperty("argumentos", out var args) || args.ValueKind != JsonValueKind.Object)
            {
                return null;
            }

            string canonical;
            switch (tool.GetString())
            {
                case CjIntelligencePagosTools.ResumenName:
                {
                    var parsed = CjIntelligencePagosTools.ParseResumen(args.GetRawText());
                    if (!parsed.Ok) return null;
                    canonical = parsed.Value!.ToCanonicalJson();
                    break;
                }

                case CjIntelligencePagosTools.CompararName:
                {
                    var parsed = CjIntelligencePagosTools.ParseComparar(args.GetRawText());
                    if (!parsed.Ok) return null;
                    canonical = $"{{\"periodoA\":{parsed.Value.A.ToCanonicalJson()},\"periodoB\":{parsed.Value.B.ToCanonicalJson()}}}";
                    break;
                }

                default:
                    return null;
            }

            return new JsonObject
            {
                ["ultimaConsulta"] = new JsonObject { ["herramienta"] = tool.GetString(), ["argumentos"] = JsonNode.Parse(canonical) }
            }.ToJsonString();
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static bool TryParseIds(string? list, out List<int> ids)
    {
        ids = [];
        if (string.IsNullOrWhiteSpace(list))
        {
            return false;
        }

        foreach (var part in list.Split(',', StringSplitOptions.TrimEntries))
        {
            if (!int.TryParse(part, System.Globalization.NumberStyles.None, System.Globalization.CultureInfo.InvariantCulture, out var id) || id <= 0)
            {
                return false;
            }

            ids.Add(id);
        }

        return ids.Count > 0;
    }
}
