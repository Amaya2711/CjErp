// Extraido de IaChatService.cs en Fase 1.1 (docs/AI_COPILOT_IMPLEMENTATION_PLAN.md).
// Codigo movido tal cual: no se cambio ningun comportamiento, solo la ubicacion.
using System.Globalization;
using System.Text.Json;

namespace CjERP.Infrastructure.Services;

using static CjERP.Infrastructure.Services.IaChatSharedDefaults;

internal static class BuscarPlanillaArgsParser
{
    internal static BuscarPlanillaArgs ParseBuscarPlanillaArgs(JsonElement? input)
    {
        var args = ParseBuscarPlanillaArgsManually(input);
        args.TamanoPagina = Math.Clamp(args.TamanoPagina <= 0 ? 50 : args.TamanoPagina, 1, MaxPageSize);
        args.Pagina = Math.Max(args.Pagina, 1);
        args.TipoCambio = args.TipoCambio is > 0 ? args.TipoCambio : null;
        return args.Normalize();
    }

    internal static BuscarPlanillaArgs ParseBuscarPlanillaArgsManually(JsonElement? input)
    {
        var args = new BuscarPlanillaArgs();
        if (input is null || input.Value.ValueKind != JsonValueKind.Object)
        {
            return args;
        }

        var value = input.Value;

        args.TextoBusqueda = GetJsonStringLikeValue(value, "textoBusqueda");
        args.Estados = GetJsonStringLikeValue(value, "estados");
        args.FechaInicio = GetJsonDateOnlyValue(value, "fechaInicio");
        args.FechaFin = GetJsonDateOnlyValue(value, "fechaFin");
        args.IdSolicitante = GetJsonIntValue(value, "idSolicitante");
        args.IdValidador = GetJsonIntValue(value, "idValidador");
        args.IdCliente = GetJsonIntValue(value, "idCliente");
        args.IdProyecto = GetJsonIntValue(value, "idProyecto");
        args.IdSite = GetJsonStringLikeValue(value, "idSite");
        args.CorreSite = GetJsonIntValue(value, "correSite");
        args.Cliente = GetJsonStringLikeValue(value, "cliente");
        args.Proyecto = GetJsonStringLikeValue(value, "proyecto");
        args.Responsable = GetJsonStringLikeValue(value, "responsable");
        args.Solicitante = GetJsonStringLikeValue(value, "solicitante");
        args.Ot = GetJsonStringLikeValue(value, "ot");
        args.CoincidirTodas = GetJsonBoolValue(value, "coincidirTodas") ?? args.CoincidirTodas;
        args.IncluirEstado99 = GetJsonBoolValue(value, "incluirEstado99") ?? args.IncluirEstado99;
        args.TodosLosEstados = GetJsonBoolValue(value, "todosLosEstados") ?? args.TodosLosEstados;
        args.Pagina = GetJsonIntValue(value, "pagina") ?? args.Pagina;
        args.TamanoPagina = GetJsonIntValue(value, "tamanoPagina") ?? args.TamanoPagina;
        args.TipoCambio = GetJsonDecimalValue(value, "tipoCambio") ?? args.TipoCambio;

        return args;
    }

    internal static string? GetJsonStringLikeValue(JsonElement source, string propertyName)
    {
        if (!source.TryGetProperty(propertyName, out var property))
        {
            return null;
        }

        return property.ValueKind switch
        {
            JsonValueKind.String => property.GetString(),
            JsonValueKind.Number => property.ToString(),
            JsonValueKind.True => bool.TrueString,
            JsonValueKind.False => bool.FalseString,
            JsonValueKind.Array => string.Join(",",
                property.EnumerateArray()
                    .Select(item => item.ValueKind == JsonValueKind.String ? item.GetString() : item.ToString())
                    .Where(item => !string.IsNullOrWhiteSpace(item))),
            _ => null
        };
    }

    internal static int? GetJsonIntValue(JsonElement source, string propertyName)
    {
        if (!source.TryGetProperty(propertyName, out var property))
        {
            return null;
        }

        if (property.ValueKind == JsonValueKind.Number && property.TryGetInt32(out var numericValue))
        {
            return numericValue;
        }

        if (property.ValueKind == JsonValueKind.String &&
            int.TryParse(property.GetString(), NumberStyles.Integer, CultureInfo.InvariantCulture, out var stringValue))
        {
            return stringValue;
        }

        return null;
    }

    internal static decimal? GetJsonDecimalValue(JsonElement source, string propertyName)
    {
        if (!source.TryGetProperty(propertyName, out var property))
        {
            return null;
        }

        if (property.ValueKind == JsonValueKind.Number && property.TryGetDecimal(out var numericValue))
        {
            return numericValue;
        }

        if (property.ValueKind == JsonValueKind.String &&
            decimal.TryParse(property.GetString(), NumberStyles.Number, CultureInfo.InvariantCulture, out var stringValue))
        {
            return stringValue;
        }

        return null;
    }

    internal static bool? GetJsonBoolValue(JsonElement source, string propertyName)
    {
        if (!source.TryGetProperty(propertyName, out var property))
        {
            return null;
        }

        if (property.ValueKind == JsonValueKind.True)
        {
            return true;
        }

        if (property.ValueKind == JsonValueKind.False)
        {
            return false;
        }

        if (property.ValueKind == JsonValueKind.String &&
            bool.TryParse(property.GetString(), out var stringValue))
        {
            return stringValue;
        }

        return null;
    }

    internal static DateOnly? GetJsonDateOnlyValue(JsonElement source, string propertyName)
    {
        if (!source.TryGetProperty(propertyName, out var property))
        {
            return null;
        }

        if (property.ValueKind == JsonValueKind.String &&
            DateOnly.TryParse(property.GetString(), CultureInfo.InvariantCulture, DateTimeStyles.None, out var dateValue))
        {
            return dateValue;
        }

        return null;
    }
}
