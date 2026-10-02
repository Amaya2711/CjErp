// Extraido de IaChatService.cs en Fase 1.1 (docs/AI_COPILOT_IMPLEMENTATION_PLAN.md).
// Codigo movido tal cual: no se cambio ningun comportamiento, solo la ubicacion.
using System.Globalization;

namespace CjERP.Infrastructure.Services;

using static CjERP.Infrastructure.Services.IaChatSharedDefaults;
using static CjERP.Infrastructure.Services.IaTextUtils;

internal static class BuscarPlanillaQuestionHeuristics
{
    internal static BuscarPlanillaArgs ApplyExplicitStructuredFilters(string question, BuscarPlanillaArgs args)
    {
        var normalized = NormalizeText(question)?.ToLowerInvariant() ?? string.Empty;
        var mentionsResponsable = normalized.Contains("responsable", StringComparison.OrdinalIgnoreCase);
        var mentionsSolicitante = normalized.Contains("solicitante", StringComparison.OrdinalIgnoreCase);

        var responsable = ExtractResponsibleFilter(question) ?? ExtractNamedFilter(question, "responsable") ?? ExtractPersonFilter(question);
        if (!string.IsNullOrWhiteSpace(responsable))
        {
            args.Responsable = responsable;
            if (mentionsResponsable && !mentionsSolicitante)
            {
                args.Solicitante = null;
            }
        }

        var solicitante = ExtractNamedFilter(question, "solicitante");
        if (!string.IsNullOrWhiteSpace(solicitante))
        {
            args.Solicitante = solicitante;
            if (mentionsSolicitante && !mentionsResponsable)
            {
                args.Responsable = null;
            }
        }

        var cliente = ExtractNamedFilter(question, "cliente");
        if (!string.IsNullOrWhiteSpace(cliente))
        {
            args.Cliente = cliente;
        }

        var proyecto = ExtractNamedFilter(question, "proyecto");
        if (!string.IsNullOrWhiteSpace(proyecto))
        {
            args.Proyecto = proyecto;
        }

        var site = ExtractNamedFilter(question, "site") ?? ExtractNamedFilter(question, "sitio");
        if (!string.IsNullOrWhiteSpace(site))
        {
            if (LooksLikeSiteIdentifier(site))
            {
                args.IdSite = site;
                args.Site = null;
            }
            else
            {
                args.IdSite = null;
                args.Site = site;
            }
        }

        var ot = ExtractNamedFilter(question, "ot");
        if (!string.IsNullOrWhiteSpace(ot))
        {
            args.Ot = ot;
        }

        if (IsMetricOnlySearchText(args.TextoBusqueda))
        {
            args.TextoBusqueda = null;
        }

        return args.Normalize();
    }

    internal static BuscarPlanillaArgs BuildSearchArgsFromQuestion(string question)
    {
        var args = new BuscarPlanillaArgs();
        if (TryExtractDateRange(question, out var start, out var end))
        {
            args.FechaInicio = start;
            args.FechaFin = end;
        }
        else
        {
            var peruNow = DateTimeOffset.UtcNow.ToOffset(PeruOffset);
            args.FechaInicio = new DateOnly(peruNow.Year, 1, 1);
            args.FechaFin = new DateOnly(peruNow.Year, 12, 31);
        }

        args.Estados = ExtractEstadosFilter(question);
        args.Solicitante = ExtractNamedFilter(question, "solicitante");
        args.Responsable = ExtractResponsibleFilter(question) ?? ExtractPersonFilter(question);
        args.Cliente = ExtractNamedFilter(question, "cliente");
        args.Proyecto = ExtractNamedFilter(question, "proyecto");
        args.IdSite = ExtractSiteCode(question);
        args.Site = ExtractNamedFilter(question, "site") ?? ExtractNamedFilter(question, "sitio");

        if (string.IsNullOrWhiteSpace(args.TextoBusqueda))
        {
            args.TextoBusqueda = ExtractLooseSearchText(
                question,
                args.Cliente,
                args.Proyecto,
                args.Solicitante,
                args.Responsable,
                args.IdSite);
        }

        args.CoincidirTodas = ShouldCoincidirTodas(question);

        args.TamanoPagina = MaxPageSize;
        args = args.Normalize();

        if (IsMetricOnlySearchText(args.TextoBusqueda))
        {
            args.TextoBusqueda = null;
        }

        return args;
    }

    internal static bool ShouldCoincidirTodas(string question)
    {
        var normalized = NormalizeText(question)?.ToLowerInvariant() ?? string.Empty;

        return normalized.Contains("coincidir todas", StringComparison.OrdinalIgnoreCase) ||
               normalized.Contains("coincidencia exacta", StringComparison.OrdinalIgnoreCase) ||
               normalized.Contains("coincidencia total", StringComparison.OrdinalIgnoreCase) ||
               normalized.Contains("todos los terminos", StringComparison.OrdinalIgnoreCase) ||
               normalized.Contains("todos los términos", StringComparison.OrdinalIgnoreCase) ||
               normalized.Contains("todos los filtros", StringComparison.OrdinalIgnoreCase) ||
               normalized.Contains("exactamente", StringComparison.OrdinalIgnoreCase) ||
               normalized.Contains("exacto", StringComparison.OrdinalIgnoreCase);
    }

    internal static int? ExtractTop(string question)
    {
        var match = System.Text.RegularExpressions.Regex.Match(
            question,
            @"\btop\s*(\d{1,3})\b",
            System.Text.RegularExpressions.RegexOptions.IgnoreCase | System.Text.RegularExpressions.RegexOptions.CultureInvariant);

        if (!match.Success)
        {
            return null;
        }

        return int.TryParse(match.Groups[1].Value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var value)
            ? Math.Clamp(value, 1, MaxTop)
            : null;
    }

    internal static string? ExtractNamedFilter(string question, string token)
    {
        var pattern = $@"\b{System.Text.RegularExpressions.Regex.Escape(token)}\s+(?<value>[A-Za-zÁÉÍÓÚáéíóúÑñ0-9\.\-_ ]{{3,80}})";
        var match = System.Text.RegularExpressions.Regex.Match(
            question,
            pattern,
            System.Text.RegularExpressions.RegexOptions.IgnoreCase | System.Text.RegularExpressions.RegexOptions.CultureInvariant);

        if (!match.Success)
        {
            return null;
        }

        var value = match.Groups["value"].Value.Trim();
        value = TrimAtStructuralSeparator(value);
        value = System.Text.RegularExpressions.Regex.Replace(
            value,
            @"\b(de este mes|del este mes|de este año|del este año|de 20\d{2}|del 20\d{2}|este mes|este año|mes pasado|hoy|ayer)\b.*$",
            string.Empty,
            System.Text.RegularExpressions.RegexOptions.IgnoreCase | System.Text.RegularExpressions.RegexOptions.CultureInvariant);

        return NormalizeText(value);
    }

    internal static string? ExtractLooseSearchText(string question, params string?[] explicitFilters)
    {
        var normalized = NormalizeText(question)?.ToLowerInvariant() ?? string.Empty;
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return null;
        }

        foreach (var filter in explicitFilters)
        {
            var normalizedFilter = NormalizeText(filter)?.ToLowerInvariant();
            if (string.IsNullOrWhiteSpace(normalizedFilter))
            {
                continue;
            }

            normalized = System.Text.RegularExpressions.Regex.Replace(
                normalized,
                $@"(?<!\w){System.Text.RegularExpressions.Regex.Escape(normalizedFilter).Replace("\\ ", "\\s+")}(?!\w)",
                " ",
                System.Text.RegularExpressions.RegexOptions.IgnoreCase | System.Text.RegularExpressions.RegexOptions.CultureInvariant);
        }

        normalized = System.Text.RegularExpressions.Regex.Replace(
            normalized,
            @"\b(comparacion|comparar|comparando|comparativa|comparativo|contra|vs|versus|frente|frentea|montooc2|montooc|monto|oc2|conpagado|conpagadosoles|subtotalesoles|subtotalsoles|saldoocsitio|suboc|subplanilla|adelafic|diferenciafic|venta|ventas|quiero|saber|mostrar|consultar|buscar|registros|registro|planilla|detalle|detalles|total|suma|sumado|gasto|gastos|cliente|clientes|proyecto|proyectos|site|sitio|sitios|responsable|responsables|solicitante|solicitantes|estado|estados|considerando|considera|considerar|pagado|pagada|pagados|pagadas|aprobado|aprobada|aprobados|aprobadas|pendiente|pendientes|observado|observada|observados|observadas|rechazado|rechazada|rechazados|rechazadas|separado|separada|separados|separadas|agrupado|agrupada|agrupados|agrupadas|de|del|para|por|con|en|el|la|los|las|periodo|periodo|mes|ano|año|inicio|fin|desde|hasta|ejecuta|ejecutar|store|sp|ia|modulo|módulo|texto|busqueda|general|coincidir|todas)\b",
            " ",
            System.Text.RegularExpressions.RegexOptions.IgnoreCase | System.Text.RegularExpressions.RegexOptions.CultureInvariant);

        var tokens = System.Text.RegularExpressions.Regex.Matches(normalized, @"[\p{L}0-9\-_]+")
            .Select(match => match.Value.Trim())
            .Where(token =>
                token.Length > 1 &&
                !System.Text.RegularExpressions.Regex.IsMatch(token, @"^\d+$") &&
                !System.Text.RegularExpressions.Regex.IsMatch(token, @"^\d{4}-\d{2}-\d{2}$") &&
                !System.Text.RegularExpressions.Regex.IsMatch(token, @"^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$"))
            .Take(4)
            .ToList();

        return tokens.Count == 0 ? null : NormalizeText(string.Join(" ", tokens));
    }

    internal static bool IsMetricOnlySearchText(string? value)
    {
        var normalized = NormalizeText(value)?.ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return false;
        }

        var tokens = System.Text.RegularExpressions.Regex.Matches(normalized, @"[\p{L}0-9\-_]+")
            .Select(match => match.Value.Trim())
            .Where(token => token.Length > 0)
            .ToList();

        if (tokens.Count == 0)
        {
            return false;
        }

        return tokens.All(token =>
            token is "venta" or "ventas" or "gasto" or "gastos" or "montooc" or "montooc2" or "ventasvsgastos");
    }

    internal static string TrimAtStructuralSeparator(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return string.Empty;
        }

        var separatorIndex = value.IndexOfAny(new[] { ',', ';', ':', ')' });
        if (separatorIndex >= 0)
        {
            value = value[..separatorIndex];
        }

        return value.Trim().TrimEnd('.', ',', ';', ':');
    }

    internal static string? ExtractResponsibleFilter(string question)
    {
        var patterns = new[]
        {
            @"\b(?:para\s+el\s+|para\s+la\s+|del\s+|de\s+el\s+|de\s+la\s+)?responsable(?:\s+de)?\s+(?<value>[A-Za-zÃÃ‰ÃÃ“ÃšÃ¡Ã©Ã­Ã³ÃºÃ‘Ã±0-9\.\-_ ]{3,80})",
            @"\bresponsable(?:\s+de)?\s+(?<value>[A-Za-zÃÃ‰ÃÃ“ÃšÃ¡Ã©Ã­Ã³ÃºÃ‘Ã±0-9\.\-_ ]{3,80})"
        };

        foreach (var pattern in patterns)
        {
            var match = System.Text.RegularExpressions.Regex.Match(
                question,
                pattern,
                System.Text.RegularExpressions.RegexOptions.IgnoreCase | System.Text.RegularExpressions.RegexOptions.CultureInvariant);

            if (!match.Success)
            {
                continue;
            }

            var value = match.Groups["value"].Value.Trim();
            value = TrimAtStructuralSeparator(value);
            value = System.Text.RegularExpressions.Regex.Replace(
                value,
                @"\b(de este mes|del este mes|de este aÃ±o|del este aÃ±o|de 20\d{2}|del 20\d{2}|este mes|este aÃ±o|mes pasado|hoy|ayer)\b.*$",
                string.Empty,
                System.Text.RegularExpressions.RegexOptions.IgnoreCase | System.Text.RegularExpressions.RegexOptions.CultureInvariant);

            value = value.Trim().TrimEnd('.', ',', ';', ':');
            if (!string.IsNullOrWhiteSpace(value))
            {
                return NormalizeText(value);
            }
        }

        return null;
    }

    internal static string? ExtractPersonFilter(string question)
    {
        var patterns = new[]
        {
            @"\b(?:para\s+el\s+|para\s+la\s+|del\s+|de\s+el\s+|de\s+la\s+)?(?:responsable|empleado|trabajador|colaborador|usuario|asesor)(?:\s+de)?\s+(?<value>[A-Za-zÁÉÍÓÚáéíóúÑñ0-9\.\-_ ]{3,80})",
            @"\b(?:responsable|empleado|trabajador|colaborador|usuario|asesor)(?:\s+de)?\s+(?<value>[A-Za-zÁÉÍÓÚáéíóúÑñ0-9\.\-_ ]{3,80})"
        };

        foreach (var pattern in patterns)
        {
            var match = System.Text.RegularExpressions.Regex.Match(
                question,
                pattern,
                System.Text.RegularExpressions.RegexOptions.IgnoreCase | System.Text.RegularExpressions.RegexOptions.CultureInvariant);

            if (!match.Success)
            {
                continue;
            }

            var value = match.Groups["value"].Value.Trim();
            value = TrimAtStructuralSeparator(value);
            value = System.Text.RegularExpressions.Regex.Replace(
                value,
                @"\b(de este mes|del este mes|de este año|del este año|de 20\d{2}|del 20\d{2}|este mes|este año|mes pasado|hoy|ayer)\b.*$",
                string.Empty,
                System.Text.RegularExpressions.RegexOptions.IgnoreCase | System.Text.RegularExpressions.RegexOptions.CultureInvariant);

            value = SanitizePersonFilterValue(value);
            if (!string.IsNullOrWhiteSpace(value) && LooksLikePersonName(value))
            {
                return NormalizeText(value);
            }
        }

        return null;
    }

    internal static bool LooksLikePersonName(string value)
    {
        var tokens = NormalizeText(value)?
            .Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Where(token => token.Length > 1)
            .ToArray() ?? Array.Empty<string>();

        if (tokens.Length < 2)
        {
            return false;
        }

        var forbidden = new[]
        {
            "gasto",
            "gastos",
            "cliente",
            "clientes",
            "proyecto",
            "proyectos",
            "site",
            "sitio",
            "sitios",
            "mes",
            "año",
            "anio",
            "hoy",
            "ayer",
            "pendiente",
            "pendientes",
            "estado"
        };

        return !tokens.Any(token => forbidden.Any(forbiddenToken => token.Equals(forbiddenToken, StringComparison.OrdinalIgnoreCase)));
    }

    internal static string SanitizePersonFilterValue(string value)
    {
        var cleaned = NormalizeText(value) ?? string.Empty;

        cleaned = System.Text.RegularExpressions.Regex.Replace(
            cleaned,
            @"^(responsable|empleado|trabajador|colaborador|usuario|asesor)\s+",
            string.Empty,
            System.Text.RegularExpressions.RegexOptions.IgnoreCase | System.Text.RegularExpressions.RegexOptions.CultureInvariant);

        cleaned = System.Text.RegularExpressions.Regex.Replace(
            cleaned,
            @"\b(de|del|para|con|en|al)\s*$",
            string.Empty,
            System.Text.RegularExpressions.RegexOptions.IgnoreCase | System.Text.RegularExpressions.RegexOptions.CultureInvariant);

        cleaned = System.Text.RegularExpressions.Regex.Replace(
            cleaned,
            @"\s{2,}",
            " ",
            System.Text.RegularExpressions.RegexOptions.CultureInvariant);

        return cleaned.Trim().TrimEnd('.', ',', ';', ':');
    }

    internal static string? ExtractEstadosFilter(string question)
    {
        var normalized = NormalizeText(question)?.ToLowerInvariant() ?? string.Empty;

        if (normalized.Contains("pagado", StringComparison.OrdinalIgnoreCase) ||
            normalized.Contains("pagada", StringComparison.OrdinalIgnoreCase) ||
            normalized.Contains("pagados", StringComparison.OrdinalIgnoreCase) ||
            normalized.Contains("pagadas", StringComparison.OrdinalIgnoreCase))
        {
            return "PAGADO";
        }

        if (normalized.Contains("pendiente", StringComparison.OrdinalIgnoreCase) ||
            normalized.Contains("pendientes", StringComparison.OrdinalIgnoreCase))
        {
            return "PENDIENTE";
        }

        if (normalized.Contains("activo", StringComparison.OrdinalIgnoreCase) &&
            !normalized.Contains("inactivo", StringComparison.OrdinalIgnoreCase))
        {
            return "ACTIVO";
        }

        if (normalized.Contains("inactivo", StringComparison.OrdinalIgnoreCase))
        {
            return "INACTIVO";
        }

        if (normalized.Contains("anulado", StringComparison.OrdinalIgnoreCase) ||
            normalized.Contains("anulada", StringComparison.OrdinalIgnoreCase) ||
            normalized.Contains("anulados", StringComparison.OrdinalIgnoreCase) ||
            normalized.Contains("anuladas", StringComparison.OrdinalIgnoreCase))
        {
            return "ANULADO";
        }

        if (normalized.Contains("rechazado", StringComparison.OrdinalIgnoreCase) ||
            normalized.Contains("rechazada", StringComparison.OrdinalIgnoreCase) ||
            normalized.Contains("rechazados", StringComparison.OrdinalIgnoreCase) ||
            normalized.Contains("rechazadas", StringComparison.OrdinalIgnoreCase))
        {
            return "RECHAZADO";
        }

        return null;
    }

    internal static string? ExtractSiteCode(string question)
    {
        var match = System.Text.RegularExpressions.Regex.Match(
            question,
            @"\b([A-Z]{3}\d{3,})\b",
            System.Text.RegularExpressions.RegexOptions.CultureInvariant);

        return match.Success ? NormalizeText(match.Groups[1].Value) : null;
    }

    internal static bool LooksLikeSiteIdentifier(string value)
    {
        var normalized = NormalizeText(value)?.ToUpperInvariant();
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return false;
        }

        return System.Text.RegularExpressions.Regex.IsMatch(
            normalized,
            @"^[A-Z]{2,}\d+[A-Z0-9_]*$",
            System.Text.RegularExpressions.RegexOptions.CultureInvariant);
    }

    internal static bool TryExtractYearRange(string question, out DateOnly start, out DateOnly end)
    {
        var match = System.Text.RegularExpressions.Regex.Match(
            question,
            @"\b(20\d{2}|19\d{2})\b",
            System.Text.RegularExpressions.RegexOptions.CultureInvariant);

        if (match.Success && int.TryParse(match.Groups[1].Value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var year))
        {
            start = new DateOnly(year, 1, 1);
            end = new DateOnly(year, 12, 31);
            return true;
        }

        start = default;
        end = default;
        return false;
    }

    internal static bool TryExtractDateRange(string question, out DateOnly start, out DateOnly end)
    {
        var normalized = question.ToLowerInvariant();
        var peruYear = DateTimeOffset.UtcNow.ToOffset(PeruOffset).Year;

        if (TryExtractExplicitDateRange(question, out start, out end))
        {
            return true;
        }

        if (TryExtractQuarterRange(normalized, peruYear, out start, out end))
        {
            return true;
        }

        if (TryExtractMonthRange(normalized, peruYear, out start, out end))
        {
            return true;
        }

        if (TryExtractYearRange(question, out start, out end))
        {
            return true;
        }

        start = new DateOnly(peruYear, 1, 1);
        end = new DateOnly(peruYear, 12, 31);
        return true;
    }

    internal static bool TryExtractExplicitDateRange(string question, out DateOnly start, out DateOnly end)
    {
        start = default;
        end = default;

        var startText = ExtractExplicitDateToken(question, @"(?:fecha\s+inicio|desde)\s*(?:[:=]\s*)?(?<value>\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2})");
        var endText = ExtractExplicitDateToken(question, @"(?:fecha\s+fin|hasta)\s*(?:[:=]\s*)?(?<value>\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2})");

        var hasStart = TryParseQuestionDate(startText, out var parsedStart);
        var hasEnd = TryParseQuestionDate(endText, out var parsedEnd);

        if (hasStart && hasEnd)
        {
            start = parsedStart;
            end = parsedEnd;
            return true;
        }

        if (hasStart)
        {
            start = parsedStart;
            end = parsedStart;
            return true;
        }

        if (hasEnd)
        {
            start = parsedEnd;
            end = parsedEnd;
            return true;
        }

        return false;
    }

    internal static string? ExtractExplicitDateToken(string question, string pattern)
    {
        var match = System.Text.RegularExpressions.Regex.Match(
            question,
            pattern,
            System.Text.RegularExpressions.RegexOptions.CultureInvariant | System.Text.RegularExpressions.RegexOptions.IgnoreCase);

        if (!match.Success)
        {
            return null;
        }

        return match.Groups["value"].Value.Trim();
    }

    internal static bool TryParseQuestionDate(string? value, out DateOnly date)
    {
        date = default;
        if (string.IsNullOrWhiteSpace(value))
        {
            return false;
        }

        var formats = new[]
        {
            "yyyy-MM-dd",
            "yyyy/M/d",
            "yyyy/MM/dd",
            "dd/MM/yyyy",
            "d/M/yyyy",
            "MM/dd/yyyy",
            "M/d/yyyy",
            "dd-MM-yyyy",
            "d-M-yyyy",
            "MM-dd-yyyy",
            "M-d-yyyy"
        };

        return DateOnly.TryParseExact(value.Trim(), formats, CultureInfo.InvariantCulture, DateTimeStyles.None, out date);
    }

    internal static bool TryExtractQuarterRange(string normalizedQuestion, int fallbackYear, out DateOnly start, out DateOnly end)
    {
        var match = System.Text.RegularExpressions.Regex.Match(
            normalizedQuestion,
            @"\b(?:(?<ord>primer|segundo|tercer|cuarto|1er|2do|3er|4to)\s+)?trimestre(?:\s+(?:de\s+)?)?(?<year>20\d{2}|19\d{2})?\b",
            System.Text.RegularExpressions.RegexOptions.CultureInvariant | System.Text.RegularExpressions.RegexOptions.IgnoreCase);

        if (!match.Success)
        {
            start = default;
            end = default;
            return false;
        }

        var year = fallbackYear;
        if (match.Groups["year"].Success &&
            int.TryParse(match.Groups["year"].Value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var parsedYear))
        {
            year = parsedYear;
        }

        var ordinal = NormalizeText(match.Groups["ord"].Value)?.ToLowerInvariant();
        var quarter = ordinal switch
        {
            "primer" or "1er" => 1,
            "segundo" or "2do" => 2,
            "tercer" or "3er" => 3,
            "cuarto" or "4to" => 4,
            _ => 0
        };

        if (quarter == 0)
        {
            if (normalizedQuestion.Contains("primero", StringComparison.OrdinalIgnoreCase))
            {
                quarter = 1;
            }
            else if (normalizedQuestion.Contains("segundo", StringComparison.OrdinalIgnoreCase))
            {
                quarter = 2;
            }
            else if (normalizedQuestion.Contains("tercero", StringComparison.OrdinalIgnoreCase))
            {
                quarter = 3;
            }
            else if (normalizedQuestion.Contains("cuarto", StringComparison.OrdinalIgnoreCase))
            {
                quarter = 4;
            }
        }

        if (quarter == 0)
        {
            start = default;
            end = default;
            return false;
        }

        var firstMonth = (quarter - 1) * 3 + 1;
        start = new DateOnly(year, firstMonth, 1);
        end = new DateOnly(year, firstMonth + 2, DateTime.DaysInMonth(year, firstMonth + 2));
        return true;
    }

    internal static bool TryExtractMonthRange(string normalizedQuestion, int fallbackYear, out DateOnly start, out DateOnly end)
    {
        var monthMap = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase)
        {
            ["enero"] = 1,
            ["febrero"] = 2,
            ["marzo"] = 3,
            ["abril"] = 4,
            ["mayo"] = 5,
            ["junio"] = 6,
            ["julio"] = 7,
            ["agosto"] = 8,
            ["setiembre"] = 9,
            ["septiembre"] = 9,
            ["octubre"] = 10,
            ["noviembre"] = 11,
            ["diciembre"] = 12
        };

        var match = System.Text.RegularExpressions.Regex.Match(
            normalizedQuestion,
            @"\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|setiembre|septiembre|octubre|noviembre|diciembre)\b(?:\s+(?:de\s+)?)?(?<year>20\d{2}|19\d{2})?\b",
            System.Text.RegularExpressions.RegexOptions.CultureInvariant | System.Text.RegularExpressions.RegexOptions.IgnoreCase);

        if (!match.Success)
        {
            start = default;
            end = default;
            return false;
        }

        var monthName = match.Groups[1].Value;
        if (!monthMap.TryGetValue(monthName, out var month))
        {
            start = default;
            end = default;
            return false;
        }

        var year = fallbackYear;
        if (match.Groups["year"].Success &&
            int.TryParse(match.Groups["year"].Value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var parsedYear))
        {
            year = parsedYear;
        }

        start = new DateOnly(year, month, 1);
        end = new DateOnly(year, month, DateTime.DaysInMonth(year, month));
        return true;
    }
}
