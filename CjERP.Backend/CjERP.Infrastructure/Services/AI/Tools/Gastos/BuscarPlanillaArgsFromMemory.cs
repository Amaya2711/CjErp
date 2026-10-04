// Extraido de IaChatService.cs en Fase 1.1 (docs/AI_COPILOT_IMPLEMENTATION_PLAN.md).
// Codigo movido tal cual: no se cambio ningun comportamiento, solo la ubicacion.
using System.Globalization;

namespace CjERP.Infrastructure.Services;

using static CjERP.Infrastructure.Services.IaTextUtils;

internal static class BuscarPlanillaArgsFromMemory
{
    internal static BuscarPlanillaArgs? BuildArgsFromToolParameters(Dictionary<string, object?>? toolParameters)
    {
        if (toolParameters is null || toolParameters.Count == 0)
        {
            return null;
        }

        var args = new BuscarPlanillaArgs
        {
            TextoBusqueda = GetDictionaryString(toolParameters, "textoBusqueda"),
            Estados = GetDictionaryString(toolParameters, "estados"),
            FechaInicio = GetDictionaryDateOnly(toolParameters, "fechaInicio"),
            FechaFin = GetDictionaryDateOnly(toolParameters, "fechaFin"),
            IdSolicitante = GetDictionaryInt(toolParameters, "idSolicitante"),
            IdValidador = GetDictionaryInt(toolParameters, "idValidador"),
            IdCliente = GetDictionaryInt(toolParameters, "idCliente"),
            IdProyecto = GetDictionaryInt(toolParameters, "idProyecto"),
            IdSite = GetDictionaryString(toolParameters, "idSite"),
            Site = GetDictionaryString(toolParameters, "site"),
            CorreSite = GetDictionaryInt(toolParameters, "correSite"),
            Cliente = GetDictionaryString(toolParameters, "cliente"),
            Proyecto = GetDictionaryString(toolParameters, "proyecto"),
            Responsable = GetDictionaryString(toolParameters, "responsable"),
            Solicitante = GetDictionaryString(toolParameters, "solicitante"),
            Ot = GetDictionaryString(toolParameters, "ot"),
            CoincidirTodas = GetDictionaryBool(toolParameters, "coincidirTodas") ?? false,
            IncluirEstado99 = GetDictionaryBool(toolParameters, "incluirEstado99") ?? true,
            TodosLosEstados = GetDictionaryBool(toolParameters, "todosLosEstados") ?? false,
            Pagina = GetDictionaryInt(toolParameters, "pagina") ?? 1,
            TamanoPagina = GetDictionaryInt(toolParameters, "tamanoPagina") ?? 50,
            TipoCambio = GetDictionaryDecimal(toolParameters, "tipoCambio")
        };

        return args.Normalize();
    }

    internal static string? GetDictionaryString(Dictionary<string, object?> source, string key)
    {
        if (!source.TryGetValue(key, out var value) || value is null)
        {
            return null;
        }

        return NormalizeText(Convert.ToString(value, CultureInfo.InvariantCulture));
    }

    internal static int? GetDictionaryInt(Dictionary<string, object?> source, string key)
    {
        if (!source.TryGetValue(key, out var value) || value is null)
        {
            return null;
        }

        return value switch
        {
            int intValue => intValue,
            long longValue when longValue <= int.MaxValue && longValue >= int.MinValue => (int)longValue,
            decimal decimalValue when decimalValue <= int.MaxValue && decimalValue >= int.MinValue => (int)decimalValue,
            string stringValue when int.TryParse(stringValue, NumberStyles.Integer, CultureInfo.InvariantCulture, out var parsed) => parsed,
            _ => null
        };
    }

    internal static bool? GetDictionaryBool(Dictionary<string, object?> source, string key)
    {
        if (!source.TryGetValue(key, out var value) || value is null)
        {
            return null;
        }

        return value switch
        {
            bool boolValue => boolValue,
            string stringValue when bool.TryParse(stringValue, out var parsed) => parsed,
            _ => null
        };
    }

    internal static decimal? GetDictionaryDecimal(Dictionary<string, object?> source, string key)
    {
        if (!source.TryGetValue(key, out var value) || value is null)
        {
            return null;
        }

        return value switch
        {
            decimal decimalValue => decimalValue,
            double doubleValue => Convert.ToDecimal(doubleValue, CultureInfo.InvariantCulture),
            float floatValue => Convert.ToDecimal(floatValue, CultureInfo.InvariantCulture),
            int intValue => intValue,
            long longValue => longValue,
            string stringValue when decimal.TryParse(stringValue, NumberStyles.Number, CultureInfo.InvariantCulture, out var parsed) => parsed,
            _ => null
        };
    }

    internal static DateOnly? GetDictionaryDateOnly(Dictionary<string, object?> source, string key)
    {
        if (!source.TryGetValue(key, out var value) || value is null)
        {
            return null;
        }

        if (value is DateOnly dateOnlyValue)
        {
            return dateOnlyValue;
        }

        if (value is DateTime dateTimeValue)
        {
            return DateOnly.FromDateTime(dateTimeValue);
        }

        var text = Convert.ToString(value, CultureInfo.InvariantCulture);
        return DateOnly.TryParse(text, CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsed)
            ? parsed
            : null;
    }
}
