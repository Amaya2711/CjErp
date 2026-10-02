// Extraido de IaChatService.cs en Fase 1.4 (docs/AI_COPILOT_IMPLEMENTATION_PLAN.md).
// Codigo movido tal cual: no se cambio ningun comportamiento, solo la ubicacion. Todos estos
// metodos SOLO LEEN ConversationState (LastResponse/LastToolName/LastToolParameters/GetRecentTurns);
// ninguno lo muta. La mutacion (AppendTurn/AppendAssistant) sigue ocurriendo en IaChatService.cs,
// que es quien decide CUANDO se registra un turno. Este resolver solo interpreta.
using System.Text.Json;
using CjERP.Application.DTOs.IaChat;

namespace CjERP.Infrastructure.Services;

using static CjERP.Infrastructure.Services.IaChatSharedDefaults;
using static CjERP.Infrastructure.Services.BuscarPlanillaQuestionHeuristics;
using static CjERP.Infrastructure.Services.BuscarPlanillaArgsFromMemory;
using static CjERP.Infrastructure.Services.GastosQueryPlanner;
using static CjERP.Infrastructure.Services.GastosAnalysisService;
using static CjERP.Infrastructure.Services.IaTextUtils;

public static class IaConversationFollowUpResolver
{
    public static bool TryReformatLastChart(
        string question,
        ConversationState state,
        out IaChatChartResponseDto? chart,
        out string answer)
    {
        chart = null;
        answer = string.Empty;

        var lastChart = state.LastResponse?.Chart;
        if (lastChart is null)
        {
            return false;
        }

        var requestedChartType = ResolveRequestedChartTypeForReformat(question);
        if (requestedChartType is null)
        {
            return false;
        }

        chart = new IaChatChartResponseDto
        {
            ChartType = requestedChartType,
            Title = BuildReformattedChartTitle(question, lastChart),
            CategoryField = lastChart.CategoryField,
            ValueField = lastChart.ValueField,
            Rows = lastChart.Rows.Select(CloneRow).ToList()
        };

        answer = $"Se actualizo el grafico a formato {requestedChartType} usando el ultimo resultado de la conversacion.";
        return true;
    }

    public static bool TryReuseLastResponseForFollowUp(
        string question,
        ConversationState state,
        out IaChatResponseDto? response,
        out string answer,
        out string followUpIntent)
    {
        response = null;
        answer = string.Empty;
        followUpIntent = string.Empty;

        var lastResponse = state.LastResponse;
        if (lastResponse is null)
        {
            return false;
        }

        var normalized = NormalizeText(question)?.ToLowerInvariant() ?? string.Empty;
        var wantsExport = normalized.Contains("export", StringComparison.OrdinalIgnoreCase) ||
                          normalized.Contains("pdf", StringComparison.OrdinalIgnoreCase) ||
                          normalized.Contains("reporte", StringComparison.OrdinalIgnoreCase) ||
                          normalized.Contains("descargar", StringComparison.OrdinalIgnoreCase);
        var wantsExecutiveView = normalized.Contains("formato ejecutivo", StringComparison.OrdinalIgnoreCase) ||
                                 normalized.Contains("vista ejecutiva", StringComparison.OrdinalIgnoreCase) ||
                                 normalized.Contains("cuadro ejecutivo", StringComparison.OrdinalIgnoreCase);
        var referencesCurrentResult = normalized.Contains("ese resultado", StringComparison.OrdinalIgnoreCase) ||
                                      normalized.Contains("este resultado", StringComparison.OrdinalIgnoreCase) ||
                                      normalized.Contains("resultado actual", StringComparison.OrdinalIgnoreCase) ||
                                      normalized.Contains("usar resultado actual", StringComparison.OrdinalIgnoreCase) ||
                                      normalized.Contains("mostrar ese resultado", StringComparison.OrdinalIgnoreCase) ||
                                      normalized.Contains("volver al resultado", StringComparison.OrdinalIgnoreCase) ||
                                      normalized.Contains("reutiliza el resultado", StringComparison.OrdinalIgnoreCase) ||
                                      normalized.Contains("reutilizar el resultado", StringComparison.OrdinalIgnoreCase);

        if (!wantsExport && !wantsExecutiveView && !referencesCurrentResult)
        {
            return false;
        }

        followUpIntent = wantsExport ? "export_report" : "view_executive";
        response = CloneResponse(lastResponse);
        response.Answer = wantsExport
            ? "Se reutiliza el ultimo resultado para generar el reporte solicitado."
            : "Se reutiliza el ultimo resultado para mostrarlo en formato ejecutivo.";
        response.ResponseType = NormalizeResponseType(response, lastResponse.ResponseType);

        if (response.InterpretedFilters is null)
        {
            response.InterpretedFilters = new Dictionary<string, object?>();
        }

        response.InterpretedFilters["followUpIntent"] = followUpIntent;
        response.InterpretedFilters["reusedLastResult"] = true;
        response.InterpretedFilters["routingMode"] = "conversation";

        return true;
    }

    public static bool TryListMatchesFromLastResult(
        string question,
        ConversationState state,
        out IaChatResponseDto? response,
        out string answer)
    {
        response = null;
        answer = string.Empty;

        var lastResponse = state.LastResponse;
        if (lastResponse?.DetailRows is null || lastResponse.DetailRows.Count == 0)
        {
            return false;
        }

        var normalized = NormalizeText(question)?.ToLowerInvariant() ?? string.Empty;
        var wantsListing = normalized.Contains("cuales son", StringComparison.OrdinalIgnoreCase) ||
                           normalized.Contains("cuáles son", StringComparison.OrdinalIgnoreCase) ||
                           normalized.Contains("muestra", StringComparison.OrdinalIgnoreCase) ||
                           normalized.Contains("lista", StringComparison.OrdinalIgnoreCase) ||
                           normalized.Contains("encuentras", StringComparison.OrdinalIgnoreCase) ||
                           normalized.Contains("existen", StringComparison.OrdinalIgnoreCase) ||
                           normalized.Contains("buscar", StringComparison.OrdinalIgnoreCase);

        if (!wantsListing)
        {
            return false;
        }

        var targetToken = ExtractFollowUpToken(question);
        if (string.IsNullOrWhiteSpace(targetToken))
        {
            return false;
        }

        var matches = FindMatchingNames(lastResponse.DetailRows, targetToken);
        if (matches.Count == 0)
        {
            return false;
        }

        response = new IaChatResponseDto
        {
            Success = true,
            Module = lastResponse.Module,
            Answer = BuildListMatchesAnswer(targetToken, matches, lastResponse.TotalRows ?? lastResponse.DetailRows.Count),
            ResponseType = "summary",
            InterpretedFilters = new Dictionary<string, object?>
            {
                ["module"] = lastResponse.Module,
                ["routingMode"] = "conversation",
                ["followUpIntent"] = "list_matches",
                ["targetToken"] = targetToken,
                ["reusedLastResult"] = true
            },
            DetailRows = matches.Select(item => new Dictionary<string, object?>
            {
                ["Coincidencia"] = item.Name,
                ["Campo"] = item.Field,
                ["Registros"] = item.Count,
                ["Ejemplo"] = item.Example
            }).ToList(),
            Summary = new Dictionary<string, object?>
            {
                ["cantidadCoincidencias"] = matches.Count,
                ["totalRegistrosBase"] = lastResponse.TotalRows ?? lastResponse.DetailRows.Count
            },
            TotalRows = matches.Count
        };

        answer = response.Answer;
        return true;
    }

    public static bool TryBuildAmbiguousRoleFollowUpArgs(string question, ConversationState state, out BuscarPlanillaArgs args)
    {
        args = new BuscarPlanillaArgs();

        var normalized = NormalizeText(question)?.ToLowerInvariant() ?? string.Empty;
        var wantsAmbos = normalized == "ambos" ||
                         normalized == "ambos casos" ||
                         normalized == "ambos casos." ||
                         normalized.Contains("ambos", StringComparison.OrdinalIgnoreCase);
        var wantsResponsable = normalized.Contains("responsable", StringComparison.OrdinalIgnoreCase);
        var wantsSolicitante = normalized.Contains("solicitante", StringComparison.OrdinalIgnoreCase);
        var wantsConfirmation = normalized == "ok" ||
                                 normalized == "si" ||
                                 normalized == "sí" ||
                                 normalized == "dale" ||
                                 normalized == "listo" ||
                                 normalized == "perfecto" ||
                                 normalized == "correcto";

        if (!wantsAmbos && !wantsResponsable && !wantsSolicitante && !wantsConfirmation)
        {
            return false;
        }

        var priorUserQuestion = state.GetRecentTurns(12)
            .AsEnumerable()
            .Reverse()
            .FirstOrDefault(turn => string.Equals(turn.Role, "user", StringComparison.OrdinalIgnoreCase) &&
                                    !string.Equals(turn.Text, NormalizeText(question) ?? string.Empty, StringComparison.OrdinalIgnoreCase));

        if (priorUserQuestion is null)
        {
            return false;
        }

        var baseArgs = BuildSearchArgsFromQuestion(priorUserQuestion.Text);
        var person = ExtractPersonFilter(priorUserQuestion.Text);

        if (string.IsNullOrWhiteSpace(person))
        {
            person = ExtractNamedFilter(priorUserQuestion.Text, "solicitante");
        }

        if (string.IsNullOrWhiteSpace(person))
        {
            person = ExtractNamedFilter(priorUserQuestion.Text, "responsable");
        }

        if (string.IsNullOrWhiteSpace(person))
        {
            person = ExtractClarifiedTokenFromLastAssistant(state);
        }

        if (string.IsNullOrWhiteSpace(person))
        {
            return false;
        }

        if (wantsConfirmation && !wantsAmbos && !wantsResponsable && !wantsSolicitante)
        {
            wantsAmbos = true;
        }

        if (wantsAmbos)
        {
            baseArgs.Responsable = person;
            baseArgs.Solicitante = person;
        }
        else if (wantsResponsable && !wantsSolicitante)
        {
            baseArgs.Responsable = person;
            baseArgs.Solicitante = null;
        }
        else if (wantsSolicitante && !wantsResponsable)
        {
            baseArgs.Solicitante = person;
            baseArgs.Responsable = null;
        }
        else
        {
            baseArgs.Responsable = person;
            baseArgs.Solicitante = person;
        }

        baseArgs.TextoBusqueda = ExtractLooseSearchText(
            priorUserQuestion.Text,
            baseArgs.Cliente,
            baseArgs.Proyecto,
            baseArgs.Solicitante,
            baseArgs.Responsable,
            baseArgs.IdSite);

        args = baseArgs.Normalize();
        return true;
    }

    public static bool TryBuildContextualRefinementArgs(string question, ConversationState state, out BuscarPlanillaArgs args)
    {
        args = new BuscarPlanillaArgs();

        var normalized = NormalizeText(question)?.ToLowerInvariant() ?? string.Empty;
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return false;
        }

        var wantsContextualRefinement =
            HasExplicitStructuredFilters(question) ||
            normalized.Contains("solo quiero", StringComparison.OrdinalIgnoreCase) ||
            normalized.Contains("solo deseo", StringComparison.OrdinalIgnoreCase) ||
            normalized.Contains("mostrar solo", StringComparison.OrdinalIgnoreCase) ||
            normalized.Contains("muestra solo", StringComparison.OrdinalIgnoreCase) ||
            normalized.Contains("visualizar solo", StringComparison.OrdinalIgnoreCase) ||
            normalized.Contains("solo visualizar", StringComparison.OrdinalIgnoreCase) ||
            normalized.Contains("filtrar", StringComparison.OrdinalIgnoreCase) ||
            normalized.Contains("filtra", StringComparison.OrdinalIgnoreCase) ||
            normalized.Contains("que sean", StringComparison.OrdinalIgnoreCase) ||
            normalized.Contains("que son", StringComparison.OrdinalIgnoreCase) ||
            normalized.Contains("únicamente", StringComparison.OrdinalIgnoreCase) ||
            normalized.Contains("unicamente", StringComparison.OrdinalIgnoreCase) ||
            normalized.Contains("solamente", StringComparison.OrdinalIgnoreCase);

        if (!wantsContextualRefinement)
        {
            return false;
        }

        if (!string.Equals(state.LastToolName, ToolBuscarPlanilla, StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        var baseArgs = BuildArgsFromToolParameters(state.LastToolParameters);
        if (baseArgs is null)
        {
            return false;
        }

        if (TryExtractDateRange(question, out var start, out var end))
        {
            baseArgs.FechaInicio = start;
            baseArgs.FechaFin = end;
        }

        var estados = ExtractEstadosFilter(question);
        if (!string.IsNullOrWhiteSpace(estados))
        {
            baseArgs.Estados = estados;
        }

        baseArgs = ApplyExplicitStructuredFilters(question, baseArgs);

        var refinedSearchText = ExtractLooseSearchText(
            question,
            baseArgs.Cliente,
            baseArgs.Proyecto,
            baseArgs.Solicitante,
            baseArgs.Responsable,
            baseArgs.IdSite,
            baseArgs.Ot);

        if (!string.IsNullOrWhiteSpace(refinedSearchText))
        {
            baseArgs.TextoBusqueda = refinedSearchText;
        }
        else if (HasExplicitStructuredFilters(question))
        {
            baseArgs.TextoBusqueda = null;
        }

        baseArgs.CoincidirTodas = ShouldCoincidirTodas(question);
        args = baseArgs.Normalize();
        return true;
    }

    private static string? ExtractClarifiedTokenFromLastAssistant(ConversationState state)
    {
        var answer = state.LastResponse?.Answer;
        if (string.IsNullOrWhiteSpace(answer))
        {
            return null;
        }

        var patterns = new[]
        {
            @"(?:solamente|solo|únicamente|unicamente|visualizar|buscar|mostrar|filtrar)\s+(?:de|del|a|al)\s+""(?<value>[^""]{3,120})""",
            @"(?:solamente|solo|únicamente|unicamente|visualizar|buscar|mostrar|filtrar)\s+(?:de|del|a|al)\s+\*\*(?<value>[^*]{3,120})\*\*",
            @"""(?<value>[^""]{3,120})""",
            @"\*\*(?<value>[^*]{3,120})\*\*"
        };

        foreach (var pattern in patterns)
        {
            var match = System.Text.RegularExpressions.Regex.Match(
                answer,
                pattern,
                System.Text.RegularExpressions.RegexOptions.CultureInvariant | System.Text.RegularExpressions.RegexOptions.IgnoreCase);

            if (match.Success)
            {
                var value = NormalizeText(match.Groups["value"].Value);
                if (!string.IsNullOrWhiteSpace(value) &&
                    value.Length >= 3 &&
                    !value.Equals("responsable", StringComparison.OrdinalIgnoreCase) &&
                    !value.Equals("solicitante", StringComparison.OrdinalIgnoreCase) &&
                    !value.Equals("ambos", StringComparison.OrdinalIgnoreCase))
                {
                    return value;
                }
            }
        }

        var fallbackMatch = System.Text.RegularExpressions.Regex.Match(
            answer,
            @"\b([A-ZÁÉÍÓÚÑ0-9][A-ZÁÉÍÓÚÑ0-9\s\-_]{5,120})\b",
            System.Text.RegularExpressions.RegexOptions.CultureInvariant);

        if (fallbackMatch.Success)
        {
            var value = NormalizeText(fallbackMatch.Groups[1].Value);
            if (!string.IsNullOrWhiteSpace(value))
            {
                return value;
            }
        }

        return null;
    }

    private static string ExtractFollowUpToken(string question)
    {
        var normalized = NormalizeText(question)?.ToLowerInvariant() ?? string.Empty;
        var tokenCandidates = new[]
        {
            "tafur",
            "alexis",
            "francesco",
            "saba"
        };

        foreach (var candidate in tokenCandidates)
        {
            if (normalized.Contains(candidate, StringComparison.OrdinalIgnoreCase))
            {
                return candidate.ToUpperInvariant();
            }
        }

        var match = System.Text.RegularExpressions.Regex.Match(normalized, @"\b([a-z]{4,})\b");
        return match.Success ? match.Groups[1].Value.ToUpperInvariant() : string.Empty;
    }

    private static List<(string Name, string Field, int Count, string Example)> FindMatchingNames(
        List<Dictionary<string, object?>> detailRows,
        string token)
    {
        var preferredFields = new[] { "Responsable", "Solicitante", "Usuario", "NombreEmpleado", "Empleado" };
        var grouped = new Dictionary<(string Name, string Field), (int Count, string Example)>();

        foreach (var row in detailRows)
        {
            foreach (var field in preferredFields)
            {
                if (!row.TryGetValue(field, out var value) || value is null)
                {
                    continue;
                }

                var text = Convert.ToString(value, System.Globalization.CultureInfo.InvariantCulture)?.Trim();
                if (string.IsNullOrWhiteSpace(text) || !text.Contains(token, StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }

                var key = (text.ToUpperInvariant(), field);
                if (grouped.TryGetValue(key, out var existing))
                {
                    grouped[key] = (existing.Count + 1, existing.Example);
                }
                else
                {
                    grouped[key] = (1, BuildRowPreview(row));
                }
            }
        }

        return grouped
            .Select(item => (item.Key.Name, item.Key.Field, item.Value.Count, item.Value.Example))
            .OrderByDescending(item => item.Count)
            .ThenBy(item => item.Name, StringComparer.OrdinalIgnoreCase)
            .Take(10)
            .ToList();
    }

    private static string BuildListMatchesAnswer(string token, List<(string Name, string Field, int Count, string Example)> matches, int baseRowCount)
    {
        var lines = matches
            .Select((match, index) => $"{index + 1}. {match.Name} ({match.Field}, {match.Count} registros)")
            .ToList();

        var preview = string.Join(Environment.NewLine, lines.Take(10));
        return $"En la búsqueda anterior encontré estas coincidencias con {token} sobre {baseRowCount} registros base:{Environment.NewLine}{preview}{Environment.NewLine}{Environment.NewLine}Si quieres, puedo usar uno de esos nombres para refinar la consulta.";
    }

    private static IaChatResponseDto CloneResponse(IaChatResponseDto response)
    {
        var cloned = JsonSerializer.Deserialize<IaChatResponseDto>(
            JsonSerializer.Serialize(response, JsonOptions),
            JsonOptions);

        return cloned ?? new IaChatResponseDto
        {
            Success = response.Success,
            Module = response.Module,
            Answer = response.Answer,
            ResponseType = response.ResponseType,
            InterpretedFilters = response.InterpretedFilters is null
                ? null
                : new Dictionary<string, object?>(response.InterpretedFilters),
            DetailRows = response.DetailRows is null
                ? null
                : response.DetailRows.Select(row => new Dictionary<string, object?>(row)).ToList(),
            Summary = response.Summary is null
                ? null
                : new Dictionary<string, object?>(response.Summary),
            Chart = response.Chart is null
                ? null
                : new IaChatChartResponseDto
                {
                    ChartType = response.Chart.ChartType,
                    Title = response.Chart.Title,
                    CategoryField = response.Chart.CategoryField,
                    ValueField = response.Chart.ValueField,
                    Rows = response.Chart.Rows.Select(CloneRow).ToList()
                },
            TotalRows = response.TotalRows,
            ErrorMessage = response.ErrorMessage
        };
    }

    private static string? ResolveRequestedChartTypeForReformat(string question)
    {
        var normalized = question.ToLowerInvariant();

        if (normalized.Contains("ejecutivo", StringComparison.OrdinalIgnoreCase) ||
            normalized.Contains("gerencial", StringComparison.OrdinalIgnoreCase) ||
            normalized.Contains("resumen ejecutivo", StringComparison.OrdinalIgnoreCase) ||
            normalized.Contains("formato ejecutivo", StringComparison.OrdinalIgnoreCase) ||
            normalized.Contains("formato gerencial", StringComparison.OrdinalIgnoreCase) ||
            normalized.Contains("darle formato ejecutivo", StringComparison.OrdinalIgnoreCase) ||
            normalized.Contains("darle formato gerencial", StringComparison.OrdinalIgnoreCase) ||
            normalized.Contains("reporte ejecutivo", StringComparison.OrdinalIgnoreCase) ||
            normalized.Contains("vista ejecutiva", StringComparison.OrdinalIgnoreCase))
        {
            return "bar";
        }

        if (normalized.Contains("barra", StringComparison.OrdinalIgnoreCase) ||
            normalized.Contains("barras", StringComparison.OrdinalIgnoreCase) ||
            normalized.Contains("column", StringComparison.OrdinalIgnoreCase))
        {
            return "bar";
        }

        if (normalized.Contains("pastel", StringComparison.OrdinalIgnoreCase) ||
            normalized.Contains("torta", StringComparison.OrdinalIgnoreCase) ||
            normalized.Contains("pie", StringComparison.OrdinalIgnoreCase) ||
            normalized.Contains("dona", StringComparison.OrdinalIgnoreCase))
        {
            return "pie";
        }

        if (normalized.Contains("linea", StringComparison.OrdinalIgnoreCase) ||
            normalized.Contains("lineal", StringComparison.OrdinalIgnoreCase) ||
            normalized.Contains("tendencia", StringComparison.OrdinalIgnoreCase))
        {
            return "line";
        }

        return null;
    }

    private static string BuildReformattedChartTitle(string question, IaChatChartResponseDto lastChart)
    {
        var normalized = question.ToLowerInvariant();

        if (normalized.Contains("ejecutivo", StringComparison.OrdinalIgnoreCase) ||
            normalized.Contains("gerencial", StringComparison.OrdinalIgnoreCase) ||
            normalized.Contains("formato ejecutivo", StringComparison.OrdinalIgnoreCase) ||
            normalized.Contains("formato gerencial", StringComparison.OrdinalIgnoreCase))
        {
            return $"Resumen ejecutivo - {lastChart.Title}";
        }

        return lastChart.Title;
    }

    private static string NormalizeResponseType(IaChatResponseDto response, string fallback)
    {
        var normalized = NormalizeText(response.ResponseType)?.ToLowerInvariant();
        if (normalized is "conversation" or "detail" or "summary" or "chart")
        {
            return normalized;
        }

        if (response.Chart is not null)
        {
            return "chart";
        }

        if (response.DetailRows is not null && response.DetailRows.Count > 0)
        {
            return "summary";
        }

        return fallback;
    }
}
