using System.Globalization;
using System.Text;
using System.Text.Json;
using System.Xml.Linq;
using CjERP.Application.DTOs;
using CjERP.Application.Interfaces.Services;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging;

namespace CjERP.Infrastructure.Services;

/// <summary>
/// Noticias gerenciales diarias. Los titulares son reales (Google News RSS, sin clave): la IA (OpenAI / ChatGPT, opcional)
/// solo redacta el resumen ejecutivo a partir de esos titulares y nunca agrega noticias.
/// Rubro de referencia: infraestructura y soluciones integrales de telecomunicaciones (CJ Telecom / Sites del Peru).
/// </summary>
public sealed class NoticiasGerencialesService : INoticiasGerencialesService
{
    private const int MaxPorSeccion = 3;
    private static readonly TimeSpan CacheDuracion = TimeSpan.FromHours(6);
    private static readonly TimeSpan MinimoEntreActualizaciones = TimeSpan.FromMinutes(10);
    private static readonly SemaphoreSlim Candado = new(1, 1);

    private sealed record SeccionDef(string Clave, string Titulo, string Descripcion, string Consulta, string Idioma, string Pais);

    private static readonly SeccionDef[] Secciones =
    [
        new("telecom_mundo", "Telecomunicaciones e infraestructura - mundo",
            "Torres, fibra, 5G, operadores y compartición de infraestructura a nivel global.",
            "(telecom towers OR \"tower companies\" OR \"5G infrastructure\" OR \"fiber network\" OR \"network sharing\")", "en", "US"),
        new("telecom_peru", "Telecomunicaciones - Perú y Latinoamérica",
            "Regulación, inversión de operadores y despliegue de infraestructura en la región.",
            "(telecomunicaciones OR torres OR \"fibra óptica\" OR 5G OR OSIPTEL OR MTC) (Perú OR Latinoamérica OR Colombia OR Chile)", "es-419", "PE"),
        new("negocios_peru", "Economía y negocios - Perú",
            "Inversión, construcción, política económica y entorno empresarial local.",
            "(economía OR inversión OR construcción OR BCRP OR \"tipo de cambio\") Perú empresas", "es-419", "PE"),
        new("macro_mundo", "Mercados y macroeconomía global",
            "Tasas, inflación, mercados y cadena de suministro con impacto en costos y financiamiento.",
            "(global economy OR inflation OR \"interest rates\" OR \"supply chain\" OR \"copper prices\") markets", "en", "US"),
    ];

    private readonly HttpClient _httpClient;
    private readonly IMemoryCache _cache;
    private readonly IOpenAiChatProvider _openAi;
    private readonly ILogger<NoticiasGerencialesService> _logger;

    public NoticiasGerencialesService(
        HttpClient httpClient,
        IMemoryCache cache,
        IOpenAiChatProvider openAi,
        ILogger<NoticiasGerencialesService> logger)
    {
        _httpClient = httpClient;
        _cache = cache;
        _openAi = openAi;
        _logger = logger;
    }

    public async Task<NoticiasGerencialesDto> ObtenerAsync(bool forzarActualizacion, CancellationToken cancellationToken)
    {
        var hoy = FechaLima(DateTime.UtcNow);
        var clave = $"noticias-gerenciales:{hoy}";

        if (_cache.TryGetValue(clave, out NoticiasGerencialesDto? vigente) && vigente is not null
            && (!forzarActualizacion || DateTime.UtcNow - vigente.GeneradoUtc < MinimoEntreActualizaciones))
        {
            return vigente;
        }

        await Candado.WaitAsync(cancellationToken);
        try
        {
            // Otra solicitud pudo generarlo mientras se esperaba el candado.
            if (_cache.TryGetValue(clave, out vigente) && vigente is not null && DateTime.UtcNow - vigente.GeneradoUtc < MinimoEntreActualizaciones)
            {
                return vigente;
            }

            var secciones = (await Task.WhenAll(Secciones.Select(s => CargarSeccionAsync(s, cancellationToken)))).ToList();
            var reporte = new NoticiasGerencialesDto { Fecha = hoy, GeneradoUtc = DateTime.UtcNow, Secciones = secciones };

            await CompletarResumenAsync(reporte, cancellationToken);

            // Solo se guarda si hay noticias: un fallo de red no debe quedar cacheado seis horas.
            if (secciones.Any(s => s.Noticias.Count > 0))
            {
                _cache.Set(clave, reporte, CacheDuracion);
            }

            return reporte;
        }
        finally
        {
            Candado.Release();
        }
    }

    private async Task<NoticiaSeccionDto> CargarSeccionAsync(SeccionDef def, CancellationToken ct)
    {
        var seccion = new NoticiaSeccionDto { Clave = def.Clave, Titulo = def.Titulo, Descripcion = def.Descripcion };
        try
        {
            var query = Uri.EscapeDataString($"{def.Consulta} when:2d");
            var url = $"https://news.google.com/rss/search?q={query}&hl={def.Idioma}&gl={def.Pais}&ceid={def.Pais}:{def.Idioma.Split('-')[0]}";

            using var request = new HttpRequestMessage(HttpMethod.Get, url);
            request.Headers.UserAgent.ParseAdd("Mozilla/5.0 (compatible; CjERP/1.0)");
            using var response = await _httpClient.SendAsync(request, ct);
            response.EnsureSuccessStatusCode();
            var xml = await response.Content.ReadAsStringAsync(ct);

            var vistos = new HashSet<string>();
            seccion.Noticias = XDocument.Parse(xml)
                .Descendants("item")
                .Select(item =>
                {
                    var tituloCompleto = (item.Element("title")?.Value ?? string.Empty).Trim();
                    var fuente = (item.Element("source")?.Value ?? string.Empty).Trim();
                    // Google News agrega " - Fuente" al titulo.
                    var titulo = !string.IsNullOrEmpty(fuente) && tituloCompleto.EndsWith($" - {fuente}", StringComparison.Ordinal)
                        ? tituloCompleto[..^(fuente.Length + 3)]
                        : tituloCompleto;
                    DateTime? fecha = DateTime.TryParse(item.Element("pubDate")?.Value, CultureInfo.InvariantCulture,
                        DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal, out var f) ? f : null;
                    return new NoticiaItemDto { Titulo = titulo, Fuente = fuente, Url = (item.Element("link")?.Value ?? string.Empty).Trim(), FechaPublicacion = fecha };
                })
                .Where(n => n.Titulo.Length > 0 && n.Url.StartsWith("http", StringComparison.OrdinalIgnoreCase))
                .OrderByDescending(n => n.FechaPublicacion)
                .Where(n => vistos.Add(Normalizar(n.Titulo)))
                .Take(MaxPorSeccion)
                .ToList();
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogWarning(ex, "No se pudieron obtener las noticias de la seccion {Seccion}.", def.Clave);
        }

        return seccion;
    }

    private async Task CompletarResumenAsync(NoticiasGerencialesDto reporte, CancellationToken ct)
    {
        if (reporte.Secciones.All(s => s.Noticias.Count == 0) || !_openAi.HasConfiguration(out _))
        {
            return;
        }

        try
        {
            var titulares = new StringBuilder();
            foreach (var seccion in reporte.Secciones.Where(s => s.Noticias.Count > 0))
            {
                titulares.AppendLine($"## {seccion.Titulo}");
                foreach (var n in seccion.Noticias)
                {
                    titulares.AppendLine($"- {n.Titulo} ({n.Fuente})");
                }
            }

            const string sistema = """
Eres analista de inteligencia de mercado para la gerencia de CJ Telecom, empresa peruana de infraestructura y soluciones integrales de telecomunicaciones (torres/sites, construcción y arrendamiento de infraestructura).
Recibes solo titulares de prensa reales del día. Redacta en español, tono gerencial, conciso y sin sensacionalismo.
Reglas estrictas: usa únicamente lo que dicen los titulares; no inventes cifras, hechos, empresas ni fechas; si los titulares no sustentan una conclusión, no la incluyas.
Responde SOLO con JSON válido: {"resumenEjecutivo":"máximo 110 palabras","implicancias":["3 a 4 viñetas cortas sobre posible impacto o acción para CJ Telecom, formuladas como posibilidad"]}
""";

            var mensajes = new List<OpenAiChatMessage>
            {
                new() { Role = "system", Content = sistema },
                new() { Role = "user", Content = $"Titulares del {reporte.Fecha}:{Environment.NewLine}{titulares}" },
            };

            var texto = await _openAi.SendChatCompletionAsync(mensajes, ct, responseFormatJson: true);
            var inicio = texto.IndexOf('{');
            var fin = texto.LastIndexOf('}');
            if (inicio < 0 || fin <= inicio)
            {
                return;
            }

            using var doc = JsonDocument.Parse(texto[inicio..(fin + 1)]);
            if (doc.RootElement.TryGetProperty("resumenEjecutivo", out var resumen) && resumen.ValueKind == JsonValueKind.String)
            {
                reporte.ResumenEjecutivo = resumen.GetString()?.Trim();
            }

            if (doc.RootElement.TryGetProperty("implicancias", out var impl) && impl.ValueKind == JsonValueKind.Array)
            {
                reporte.Implicancias = impl.EnumerateArray()
                    .Where(x => x.ValueKind == JsonValueKind.String)
                    .Select(x => x.GetString()!.Trim())
                    .Where(x => x.Length > 0)
                    .Take(4)
                    .ToList();
            }
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            // El resumen es opcional: sin IA igual se muestran los titulares.
            _logger.LogWarning(ex, "No se pudo generar el resumen ejecutivo de noticias.");
        }
    }

    private static string Normalizar(string titulo) =>
        new(titulo.ToLowerInvariant().Where(char.IsLetterOrDigit).Take(80).ToArray());

    private static string FechaLima(DateTime utc) => utc.AddHours(-5).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
}
