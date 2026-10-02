// Extraido de IaChatService.cs (fila 1.13 de la tabla original de docs/AI_COPILOT_IMPLEMENTATION_PLAN.md,
// PV levantado tras lectura linea por linea — ver anexo de hallazgos del paso 1.13). Codigo movido
// tal cual: no se cambio ningun comportamiento, solo la ubicacion.
//
// Division deliberada (autorizada explicitamente, no es la extraccion 1:1 del metodo completo):
// la validacion compartida con ConsultarAsync (modulo permitido via AllowedModules, pregunta y
// resumen contextual no vacios) se queda en IaChatService.GenerarDashboardReporteAsync como
// guardia de entrada — AllowedModules es privado a IaChatService y no se duplica aqui. Esta clase
// recibe los campos ya validados y no vacios, y encapsula unicamente el trabajo que depende de
// IAnthropicMessagesProvider: verificar configuracion, llamar al proveedor, normalizar el HTML y
// construir la respuesta de exito/error. FailureDashboard no vive aqui ni en IaChatService: se
// movio a IaChatDashboardExportResponseDto.Failure(...) para que ninguna de las dos clases dependa
// de la otra para construir una respuesta de error.
using CjERP.Application.DTOs.IaChat;
using Microsoft.Extensions.Logging;

using static CjERP.Infrastructure.Services.IaTextUtils;
using static CjERP.Infrastructure.Services.IaErrorMessageBuilder;
using static CjERP.Infrastructure.Services.AnthropicMessagesProvider;

namespace CjERP.Infrastructure.Services;

public interface IIaDashboardExportService
{
    Task<IaChatDashboardExportResponseDto> GenerarAsync(
        string question,
        string contextualSummary,
        string? structuredDataJson,
        string module,
        string? idUsuario,
        CancellationToken cancellationToken);
}

public sealed class IaDashboardExportService : IIaDashboardExportService
{
    private readonly IAnthropicMessagesProvider _anthropicMessagesProvider;
    private readonly ILogger<IaDashboardExportService> _logger;

    public IaDashboardExportService(
        IAnthropicMessagesProvider anthropicMessagesProvider,
        ILogger<IaDashboardExportService> logger)
    {
        _anthropicMessagesProvider = anthropicMessagesProvider;
        _logger = logger;
    }

    public async Task<IaChatDashboardExportResponseDto> GenerarAsync(
        string question,
        string contextualSummary,
        string? structuredDataJson,
        string module,
        string? idUsuario,
        CancellationToken cancellationToken)
    {
        if (!_anthropicMessagesProvider.HasConfiguration(out var configurationError))
        {
            return IaChatDashboardExportResponseDto.Failure(module, configurationError);
        }

        try
        {
            var systemPrompt = """
Eres un analista de datos senior especializado en visualizaciones ejecutivas.

Debes responder exclusivamente con un documento HTML completo y valido, listo para renderizar en navegador.

Reglas obligatorias:
- Devuelve unicamente HTML valido. No devuelvas Markdown, JSON, comentarios ni explicaciones fuera del HTML.
- Usa Chart.js para los graficos e incluyelo mediante CDN.
- Inserta la carga de Chart.js antes de inicializar cualquier grafico y ejecuta la creacion de graficos al final del body o en DOMContentLoaded/window.onload, nunca antes de que la libreria este disponible.
- El dashboard debe verse como un informe gerencial profesional, no como texto plano.
- El formato final debe ser decidido por Claude segun el analisis de la respuesta recibida.
- No uses una plantilla fija ni una distribucion rigida; deja que el analisis determine la composicion final.
- Construye siempre un unico contenedor raiz principal, preferiblemente <main id="report-root">, centrado y con ancho maximo.
- La visualizacion debe usar solo estos recursos ejecutivos: tarjetas KPI, barras verticales, barras horizontales, tortas/donas y tablas compactas de apoyo.
- Elige dinamicamente el tipo de grafico segun la lectura de la data: temporal -> barras verticales, concentracion/ranking -> barras horizontales, participacion -> torta/dona, indicadores clave -> KPI.
- Si la data muestra fuerte concentracion, resalta ese patron visualmente; si la data es dispersa, prioriza comparativos y rankings.
- Incluye solo las secciones que aporten valor segun el analisis, pero evita que el resultado sea solo un bloque de texto.
- Usa fondo transparente y componentes limpios compatibles con modo claro y oscuro.
- Usa formato de moneda en soles peruanos (S/) con abreviatura K/M segun escala cuando aplique.
- Todos los valores numericos deben incluir separador de miles.
- No incluyas titulos principales gigantes; usa etiquetas pequenas de seccion.
- Asegura que el HTML se renderice correctamente sin dependencias adicionales aparte de Chart.js.
""";

            var userPrompt = $$"""
A partir del siguiente resumen de datos, genera un dashboard gerencial interactivo en HTML usando Chart.js.

Objetivo:
- La composicion visual debe surgir del analisis de la data.
- No generes un reporte textual plano.
- No uses una plantilla fija; deja que el analisis decida la estructura final.

Lineamientos de composicion:
- Usa un unico contenedor raiz identificado como <main id="report-root">.
- Mantén el contenido centrado y limpio, con estilo de dashboard gerencial.
- La salida debe apoyarse solamente en estas piezas visuales: KPI, barras verticales, barras horizontales, tortas/donas y tablas compactas.
- Si la data es temporal, usa barras verticales.
- Si la data concentra montos por categoria, usa barras horizontales.
- Si la data representa participacion porcentual, usa torta o dona.
- Si la data resume resultados principales, usa KPI.
- Si algun bloque no aporta valor segun el analisis, omitelo.
- Si hay fuerte concentracion, resalta el patron visualmente.
- Si la data es dispersa, prioriza comparativos y rankings.
- No dejes contenedores graficos vacios: cada bloque de grafico debe mostrar un canvas/render visible o, si no es posible por falta de data, una tabla de respaldo compacta en su lugar.
- Si incluyes un bloque de "comportamiento mensual", debe renderizar al menos un grafico visible y, debajo o al costado, una mini tabla con los valores usados.

Reglas de diseño:
- Usa una composicion ejecutiva y clara.
- Resalta visualmente la concentracion, riesgos y hallazgos mas relevantes.
- Usa paleta de colores coherente y profesional.
- Fondo transparente, compatible con modo claro y oscuro.
- Usa formato de moneda en soles peruanos (S/) con abreviatura K/M segun escala.
- Todos los numeros redondeados y formateados con separador de miles.
- Si existe informacion por moneda o el JSON incluye hasMultipleCurrencies = true, muéstrala claramente en paneles separados y no consolides importes de distintas monedas en una sola cifra.
- Evita bloques largos de texto; privilegia tarjetas, tablas compactas y graficos.
- Si existe informacion por moneda, acompaña el desglose con un grafico claro por moneda o una tabla compacta de apoyo para que la zona no quede visualmente vacia.

Consulta original:
{{question}}

RESUMEN CONTEXTUAL:
{{contextualSummary}}

BASE ESTRUCTURADA EXACTA (JSON):
{{structuredDataJson ?? "{}"}}

Reglas adicionales:
- Usa la base estructurada exacta como fuente principal para tablas, KPIs y graficos.
- No recalcules ni inventes totales fuera de esa base estructurada.
- Si el resumen textual y el JSON difieren, prioriza siempre el JSON estructurado.
- La salida final debe ser HTML completo y valido, listo para renderizar en pantalla.
- Debes decidir tu propio layout final segun la data, siempre dentro de las visualizaciones permitidas.

Devuelve solo un HTML completo y valido.
""";

            var messages = new List<AnthropicMessageRequest>
            {
                new()
                {
                    Role = "user",
                    Content =
                    [
                        new AnthropicContentBlock
                        {
                            Type = "text",
                            Text = userPrompt
                        }
                    ]
                }
            };

            var anthropicResponse = await _anthropicMessagesProvider.SendMessageAsync(
                systemPrompt,
                messages,
                tools: [],
                cancellationToken);

            var htmlContent = NormalizeDashboardHtml(ExtractAssistantText(anthropicResponse.Content));
            if (string.IsNullOrWhiteSpace(htmlContent))
            {
                throw new InvalidOperationException("La IA no devolvio HTML util para el reporte.");
            }

            return new IaChatDashboardExportResponseDto
            {
                Success = true,
                Module = module,
                HtmlContent = htmlContent,
                FileName = $"gastos-reporte-dashboard-{DateTimeOffset.UtcNow.ToOffset(IaChatSharedDefaults.PeruOffset):yyyyMMddHHmmss}.html"
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error generando dashboard IA. Usuario={Usuario} Module={Module}", idUsuario, module);
            return IaChatDashboardExportResponseDto.Failure(module, BuildFriendlyErrorMessage(ex));
        }
    }

    private static string NormalizeDashboardHtml(string? rawHtml)
    {
        var html = NormalizeText(rawHtml) ?? string.Empty;
        if (string.IsNullOrWhiteSpace(html))
        {
            return string.Empty;
        }

        html = html.Trim();

        if (html.StartsWith("```", StringComparison.Ordinal))
        {
            var firstBreak = html.IndexOf('\n');
            if (firstBreak >= 0)
            {
                html = html[(firstBreak + 1)..];
            }

            if (html.EndsWith("```", StringComparison.Ordinal))
            {
                html = html[..^3];
            }

            html = html.Trim();
        }

        if (!html.Contains("<html", StringComparison.OrdinalIgnoreCase))
        {
            html = $$"""
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Reporte ejecutivo</title>
</head>
<body>
{{html}}
</body>
</html>
""";
        }

        return html;
    }
}
