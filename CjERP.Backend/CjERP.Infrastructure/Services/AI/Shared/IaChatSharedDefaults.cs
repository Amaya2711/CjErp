// Extraido de IaChatService.cs al cerrar formalmente la Fase 1 (docs/AI_COPILOT_IMPLEMENTATION_PLAN.md).
// Codigo movido tal cual: no se cambio ningun comportamiento, solo la ubicacion y el nombre del
// contenedor. Estos 5 miembros eran los unicos que seguian viviendo en IaChatService.cs tras el
// paso 1.14 (IaChatService ya no implementaba IIaChatService ni tenia estado de instancia — era ya
// una bolsa de constantes/helper compartidos, no un servicio). Se renombran al moverse porque este
// es un archivo nuevo sin consumidores previos que dependan de un nombre especifico (a diferencia
// del paso 1.14, donde "IaChatService" se conservo porque 11+ archivos ya estables lo referenciaban).
//
// Agrupa dos tipos de valor compartido por el modulo IA, sin mezclarlos con logica de negocio:
// - Identidad y limites del (unico) tool de GASTOS: ToolBuscarPlanilla, MaxPageSize, MaxTop.
// - Infraestructura transversal de IA chat: PeruOffset (zona horaria de negocio), JsonOptions
//   (serializacion), BuildCompactDictionaryPreview (preview compacto para logs).
using static CjERP.Infrastructure.Services.GastosAnalysisService;

namespace CjERP.Infrastructure.Services;

internal static class IaChatSharedDefaults
{
    internal const string ToolBuscarPlanilla = "buscar_planilla";
    internal const int MaxPageSize = 20000;
    internal const int MaxTop = 100;
    internal static readonly TimeSpan PeruOffset = TimeSpan.FromHours(-5);
    internal static readonly System.Text.Json.JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true,
        DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull
    };

    internal static string BuildCompactDictionaryPreview(Dictionary<string, object?> values)
    {
        return string.Join(", ", values
            .Take(6)
            .Select(item => $"{item.Key}: {FormatPreviewValue(item.Value)}"));
    }
}
