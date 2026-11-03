// CJ Intelligence: herramientas de pagos (definicion para el modelo + validacion ESTRICTA en el backend).
//
// El modelo solo PIDE la herramienta; el backend valida los argumentos aqui, resuelve el alcance con la identidad del JWT,
// ejecuta (sp_IA_Cj_Pagos_Buscar) y devuelve al modelo un resumen. Los argumentos NO pueden contener usuario, empleados,
// alcance, nivel ni SQL: cualquier propiedad fuera de la lista se rechaza (no se ignora).
// Primera entrega: solo agregaciones en SQL (modo RESUMEN) y comparacion de periodos; el detalle por fila queda para despues.
using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

namespace CjERP.Infrastructure.Services.AI.CjIntelligence;

public sealed record PagosPeriodo(DateOnly Inicio, DateOnly Fin);

public sealed record PagosResumenArgs(
    PagosPeriodo Periodo,
    IReadOnlyList<string> AgruparPor,
    string? Estados,
    string? Cliente,
    string? Proyecto,
    string? Site,
    string? Responsable,
    string? Solicitante,
    string? TextoBusqueda,
    int Top)
{
    /// <summary>JSON canonico (orden fijo) de los argumentos YA validados: es lo que se guarda en IA_ResultadoConsulta.</summary>
    public string ToCanonicalJson() => JsonSerializer.Serialize(new
    {
        fechaInicio = Periodo.Inicio.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
        fechaFin = Periodo.Fin.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
        agruparPor = AgruparPor,
        estados = Estados,
        cliente = Cliente,
        proyecto = Proyecto,
        site = Site,
        responsable = Responsable,
        solicitante = Solicitante,
        textoBusqueda = TextoBusqueda,
        top = Top
    });

    public string Hash() => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(ToCanonicalJson())));
}

public sealed record ToolParse<T>(T? Value, string? Error)
{
    public bool Ok => Error is null;

    public static ToolParse<T> Success(T value) => new(value, null);

    public static ToolParse<T> Fail(string error) => new(default, error);
}

public static class CjIntelligencePagosTools
{
    public const string ResumenName = "resumen_pagos";
    public const string CompararName = "comparar_periodos_pagos";
    public const int MaxRangeDays = 400;
    public const int DefaultTop = 50;
    public const int MaxTop = 100;

    /// <summary>Lista blanca de dimensiones (la misma que valida el SP; COINCIDENCIA se excluye a proposito).</summary>
    public static readonly string[] Dimensions =
    [
        "CLIENTE", "PROYECTO", "RESPONSABLE", "SOLICITANTE", "SITE", "ESTADO", "MONEDA", "BIEN",
        "COMPROBANTE", "TIPOPAGO", "TIPOTRABAJO", "FECHA", "MES"
    ];

    private static readonly string[] FilterNames = ["agruparPor", "estados", "cliente", "proyecto", "site", "responsable", "solicitante", "textoBusqueda", "top"];
    private static readonly Regex EstadosRegex = new(@"^[0-9]+(,[0-9]+)*$", RegexOptions.Compiled | RegexOptions.CultureInvariant);

    public static IReadOnlyList<OpenAiToolDefinition> Definitions() =>
    [
        new OpenAiToolDefinition
        {
            Name = ResumenName,
            Description =
                "Resume pagos/gastos (tabla Planilla) de UN periodo, agrupados por las dimensiones pedidas. Devuelve cantidades e " +
                "importes SEPARADOS POR MONEDA (sin convertir) y los totales por moneda de TODO el universo filtrado. " +
                "Usala para preguntas sobre cuanto, cuantos, por cliente/proyecto/estado/mes. Los filtros de texto son nombres, no identificadores. " +
                "Si la persona no indica un periodo, pidelo en vez de inventarlo.",
            Parameters = Schema(includePeriods: false)
        },
        new OpenAiToolDefinition
        {
            Name = CompararName,
            Description =
                "Compara DOS periodos con los mismos filtros y agrupacion. Devuelve el resumen de cada periodo y la variacion por moneda " +
                "calculada por el sistema. No mezcla monedas.",
            Parameters = Schema(includePeriods: true)
        }
    ];

    private static JsonObject Schema(bool includePeriods)
    {
        var properties = new JsonObject();
        var required = new JsonArray();

        void Add(string name, JsonObject schema)
        {
            properties[name] = schema;
            required.Add(name);
        }

        JsonObject Str(int max, string desc) => new()
        {
            ["type"] = new JsonArray("string", "null"),
            ["maxLength"] = max,
            ["description"] = desc
        };

        if (includePeriods)
        {
            JsonObject Periodo(string desc) => new()
            {
                ["type"] = "object",
                ["additionalProperties"] = false,
                ["description"] = desc,
                ["properties"] = new JsonObject
                {
                    ["fechaInicio"] = new JsonObject { ["type"] = "string", ["description"] = "yyyy-MM-dd" },
                    ["fechaFin"] = new JsonObject { ["type"] = "string", ["description"] = "yyyy-MM-dd, no anterior a fechaInicio" }
                },
                ["required"] = new JsonArray("fechaInicio", "fechaFin")
            };

            Add("periodoA", Periodo("Primer periodo (p. ej. el mes mas reciente)."));
            Add("periodoB", Periodo("Segundo periodo, con el que se compara."));
        }
        else
        {
            Add("fechaInicio", new JsonObject { ["type"] = "string", ["description"] = "yyyy-MM-dd" });
            Add("fechaFin", new JsonObject { ["type"] = "string", ["description"] = "yyyy-MM-dd, no anterior a fechaInicio; maximo 400 dias de rango" });
        }

        Add("agruparPor", new JsonObject
        {
            ["type"] = new JsonArray("array", "null"),
            ["description"] = "De 1 a 3 dimensiones; vacio o null = sin agrupar extra (se agrupa por moneda).",
            ["items"] = new JsonObject { ["type"] = "string", ["enum"] = new JsonArray(Dimensions.Select(d => (JsonNode)d).ToArray()) },
            ["maxItems"] = 3
        });
        Add("estados", Str(100, "Codigos de estado separados por coma (p. ej. 4 = pagado). null = todos."));
        Add("cliente", Str(150, "Nombre del cliente."));
        Add("proyecto", Str(150, "Nombre del proyecto."));
        Add("site", Str(150, "Nombre del site."));
        Add("responsable", Str(150, "Nombre del responsable."));
        Add("solicitante", Str(150, "Nombre del solicitante."));
        Add("textoBusqueda", Str(500, "Palabras clave libres del detalle o comentarios."));
        Add("top", new JsonObject { ["type"] = new JsonArray("integer", "null"), ["minimum"] = 1, ["maximum"] = MaxTop, ["description"] = $"Maximo de grupos (por defecto {DefaultTop})." });

        return new JsonObject
        {
            ["type"] = "object",
            ["additionalProperties"] = false,
            ["properties"] = properties,
            ["required"] = required
        };
    }

    public static ToolParse<PagosResumenArgs> ParseResumen(string? argumentsJson)
    {
        if (!TryOpen(argumentsJson, out var doc, out var error))
        {
            return ToolParse<PagosResumenArgs>.Fail(error!);
        }

        using (doc)
        {
            var allowed = new HashSet<string>(["fechaInicio", "fechaFin"]);
            allowed.UnionWith(FilterNames);
            var unknown = FirstUnknown(doc!.RootElement, allowed);
            if (unknown is not null)
            {
                return ToolParse<PagosResumenArgs>.Fail($"Argumento no permitido: '{unknown}'.");
            }

            var inicio = ReadDate(doc.RootElement, "fechaInicio", out var e1);
            var fin = ReadDate(doc.RootElement, "fechaFin", out var e2);
            var period = ValidatePeriod(inicio, fin, e1 ?? e2, "");
            if (period.Error is not null)
            {
                return ToolParse<PagosResumenArgs>.Fail(period.Error);
            }

            return ReadFilters(doc.RootElement, period.Value!);
        }
    }

    public static ToolParse<(PagosResumenArgs A, PagosResumenArgs B)> ParseComparar(string? argumentsJson)
    {
        if (!TryOpen(argumentsJson, out var doc, out var error))
        {
            return ToolParse<(PagosResumenArgs, PagosResumenArgs)>.Fail(error!);
        }

        using (doc)
        {
            var allowed = new HashSet<string>(["periodoA", "periodoB"]);
            allowed.UnionWith(FilterNames);
            var unknown = FirstUnknown(doc!.RootElement, allowed);
            if (unknown is not null)
            {
                return ToolParse<(PagosResumenArgs, PagosResumenArgs)>.Fail($"Argumento no permitido: '{unknown}'.");
            }

            var a = ReadPeriod(doc.RootElement, "periodoA");
            var b = ReadPeriod(doc.RootElement, "periodoB");
            if (a.Error is not null)
            {
                return ToolParse<(PagosResumenArgs, PagosResumenArgs)>.Fail(a.Error);
            }

            if (b.Error is not null)
            {
                return ToolParse<(PagosResumenArgs, PagosResumenArgs)>.Fail(b.Error);
            }

            var first = ReadFilters(doc.RootElement, a.Value!);
            var second = ReadFilters(doc.RootElement, b.Value!);
            if (!first.Ok)
            {
                return ToolParse<(PagosResumenArgs, PagosResumenArgs)>.Fail(first.Error!);
            }

            return ToolParse<(PagosResumenArgs, PagosResumenArgs)>.Success((first.Value!, second.Value!));
        }
    }

    // ------------------------------------------------------------------ lectura estricta

    private static bool TryOpen(string? json, out JsonDocument? doc, out string? error)
    {
        doc = null;
        error = null;
        if (string.IsNullOrWhiteSpace(json) || json.Length > 8000)
        {
            error = "Argumentos ausentes o demasiado largos.";
            return false;
        }

        try
        {
            doc = JsonDocument.Parse(json);
        }
        catch (JsonException)
        {
            error = "Los argumentos no son JSON valido.";
            return false;
        }

        if (doc.RootElement.ValueKind != JsonValueKind.Object)
        {
            doc.Dispose();
            doc = null;
            error = "Los argumentos deben ser un objeto JSON.";
            return false;
        }

        return true;
    }

    private static string? FirstUnknown(JsonElement root, HashSet<string> allowed) =>
        root.EnumerateObject().Select(p => p.Name).FirstOrDefault(n => !allowed.Contains(n));

    private static DateOnly? ReadDate(JsonElement obj, string name, out string? error)
    {
        error = null;
        if (!obj.TryGetProperty(name, out var el) || el.ValueKind == JsonValueKind.Null)
        {
            error = $"Falta '{name}' (yyyy-MM-dd).";
            return null;
        }

        if (el.ValueKind != JsonValueKind.String
            || !DateOnly.TryParseExact(el.GetString(), "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var d))
        {
            error = $"'{name}' debe ser una fecha yyyy-MM-dd.";
            return null;
        }

        return d;
    }

    private static ToolParse<PagosPeriodo> ValidatePeriod(DateOnly? inicio, DateOnly? fin, string? readError, string label)
    {
        if (readError is not null || inicio is null || fin is null)
        {
            return ToolParse<PagosPeriodo>.Fail(readError ?? "Periodo incompleto.");
        }

        if (fin < inicio)
        {
            return ToolParse<PagosPeriodo>.Fail($"{label}fechaFin no puede ser anterior a fechaInicio.");
        }

        if (fin.Value.DayNumber - inicio.Value.DayNumber > MaxRangeDays)
        {
            return ToolParse<PagosPeriodo>.Fail($"{label}El rango maximo es de {MaxRangeDays} dias.");
        }

        return ToolParse<PagosPeriodo>.Success(new PagosPeriodo(inicio.Value, fin.Value));
    }

    private static ToolParse<PagosPeriodo> ReadPeriod(JsonElement root, string name)
    {
        if (!root.TryGetProperty(name, out var el) || el.ValueKind != JsonValueKind.Object)
        {
            return ToolParse<PagosPeriodo>.Fail($"Falta '{name}'.");
        }

        var unknown = FirstUnknown(el, ["fechaInicio", "fechaFin"]);
        if (unknown is not null)
        {
            return ToolParse<PagosPeriodo>.Fail($"Argumento no permitido en {name}: '{unknown}'.");
        }

        var inicio = ReadDate(el, "fechaInicio", out var e1);
        var fin = ReadDate(el, "fechaFin", out var e2);
        return ValidatePeriod(inicio, fin, e1 ?? e2, $"{name}: ");
    }

    private static ToolParse<PagosResumenArgs> ReadFilters(JsonElement root, PagosPeriodo periodo)
    {
        var dims = new List<string>();
        if (root.TryGetProperty("agruparPor", out var g) && g.ValueKind != JsonValueKind.Null)
        {
            if (g.ValueKind != JsonValueKind.Array)
            {
                return ToolParse<PagosResumenArgs>.Fail("'agruparPor' debe ser una lista.");
            }

            foreach (var item in g.EnumerateArray())
            {
                var value = item.ValueKind == JsonValueKind.String ? item.GetString()?.Trim().ToUpperInvariant() : null;
                if (value is null || !Dimensions.Contains(value))
                {
                    return ToolParse<PagosResumenArgs>.Fail($"Dimension no permitida en 'agruparPor'. Permitidas: {string.Join(", ", Dimensions)}.");
                }

                if (!dims.Contains(value))
                {
                    dims.Add(value);
                }
            }

            if (dims.Count > 3)
            {
                return ToolParse<PagosResumenArgs>.Fail("'agruparPor' admite como maximo 3 dimensiones.");
            }
        }

        string? Text(string name, int max, out string? err)
        {
            err = null;
            if (!root.TryGetProperty(name, out var el) || el.ValueKind == JsonValueKind.Null)
            {
                return null;
            }

            if (el.ValueKind != JsonValueKind.String)
            {
                err = $"'{name}' debe ser texto.";
                return null;
            }

            var value = el.GetString()?.Trim();
            if (string.IsNullOrEmpty(value))
            {
                return null;
            }

            if (value.Length > max || value.Any(char.IsControl))
            {
                err = $"'{name}' excede {max} caracteres o contiene caracteres de control.";
                return null;
            }

            return value;
        }

        var estados = Text("estados", 100, out var eEstados);
        var cliente = Text("cliente", 150, out var eCliente);
        var proyecto = Text("proyecto", 150, out var eProyecto);
        var site = Text("site", 150, out var eSite);
        var responsable = Text("responsable", 150, out var eResp);
        var solicitante = Text("solicitante", 150, out var eSol);
        var texto = Text("textoBusqueda", 500, out var eTexto);

        var firstError = new[] { eEstados, eCliente, eProyecto, eSite, eResp, eSol, eTexto }.FirstOrDefault(e => e is not null);
        if (firstError is not null)
        {
            return ToolParse<PagosResumenArgs>.Fail(firstError);
        }

        if (estados is not null && !EstadosRegex.IsMatch(estados))
        {
            return ToolParse<PagosResumenArgs>.Fail("'estados' debe ser una lista de codigos numericos separados por coma.");
        }

        var top = DefaultTop;
        if (root.TryGetProperty("top", out var t) && t.ValueKind != JsonValueKind.Null)
        {
            if (t.ValueKind != JsonValueKind.Number || !t.TryGetInt32(out top) || top < 1 || top > MaxTop)
            {
                return ToolParse<PagosResumenArgs>.Fail($"'top' debe ser un entero entre 1 y {MaxTop}.");
            }
        }

        return ToolParse<PagosResumenArgs>.Success(new PagosResumenArgs(periodo, dims, estados, cliente, proyecto, site, responsable, solicitante, texto, top));
    }
}
