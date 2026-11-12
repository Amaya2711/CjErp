using System.Globalization;
using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using CjERP.Api.Configuration;
using CjERP.Api.Jobs;
using Microsoft.Extensions.Options;

namespace CjERP.Api.Services;

/// <summary>
/// Sincroniza filas con una lista de SharePoint (Microsoft Graph): crea las que no existen y modifica solo los campos
/// que difieren. Nunca elimina ni recrea elementos existentes.
/// </summary>
public interface ISharePointListSyncService
{
    Task<SharePointListSyncResult> SincronizarAsync(
        string sitePath,
        string listName,
        string? keyColumn,
        string? secondaryKeyColumn,
        IReadOnlyDictionary<string, string>? columnMap,
        IReadOnlyList<IReadOnlyDictionary<string, object?>> rows,
        CancellationToken cancellationToken = default);
}

public sealed record SharePointListSyncResult(
    string ListName,
    string KeyColumn,
    int Creados,
    int Actualizados,
    int SinCambios,
    int Omitidos,
    IReadOnlyList<string> ColumnasIgnoradas,
    int Errores,
    IReadOnlyList<string> MensajesError);

public sealed class SharePointListSyncService : ISharePointListSyncService
{
    private const string GraphBase = "https://graph.microsoft.com/v1.0";
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private enum Kind { Text, Number, Boolean, DateTime, DateOnly }

    private sealed record ListColumn(string Name, Kind Kind);

    private sealed record ExistingItem(string Id, JsonElement Fields);

    private readonly HttpClient _httpClient;
    private readonly SharePointOptions _options;

    public SharePointListSyncService(HttpClient httpClient, IOptions<SharePointOptions> options)
    {
        _httpClient = httpClient;
        _options = options.Value;
    }

    public async Task<SharePointListSyncResult> SincronizarAsync(
        string sitePath,
        string listName,
        string? keyColumn,
        string? secondaryKeyColumn,
        IReadOnlyDictionary<string, string>? columnMap,
        IReadOnlyList<IReadOnlyDictionary<string, object?>> rows,
        CancellationToken cancellationToken = default)
    {
        ValidateConfiguration();
        if (rows.Count == 0)
        {
            throw new InvalidOperationException("No hay filas para sincronizar.");
        }

        var sourceColumns = rows[0].Keys.ToList();
        var requestedKey = string.IsNullOrWhiteSpace(keyColumn) ? sourceColumns[0] : keyColumn.Trim();
        var sourceKey = sourceColumns.FirstOrDefault(c => string.Equals(c, requestedKey, StringComparison.OrdinalIgnoreCase))
            ?? throw new InvalidOperationException(
                $"La columna clave '{requestedKey}' no existe en el resultado de sp_Consultar_EmpleadoSharepoint. Columnas: {string.Join(", ", sourceColumns)}.");

        var token = await GetAccessTokenAsync(cancellationToken);
        var siteId = await GetSiteIdAsync(token, sitePath, cancellationToken);
        var listId = await GetListIdAsync(token, siteId, listName, cancellationToken);
        var columns = await GetColumnsAsync(token, siteId, listId, cancellationToken);

        // Columna del SP -> columna de la lista (nombre interno o nombre para mostrar).
        var map = new Dictionary<string, ListColumn>(StringComparer.OrdinalIgnoreCase);
        var ignoradas = new List<string>();
        if (columnMap is { Count: > 0 })
        {
            // Homologación explícita: solo se sincronizan las columnas mapeadas; si alguna no existe se detiene.
            var faltantes = new List<string>();
            foreach (var (spColumn, listColumnName) in columnMap)
            {
                var source = sourceColumns.FirstOrDefault(c => string.Equals(c, spColumn, StringComparison.OrdinalIgnoreCase));
                if (source is null)
                {
                    faltantes.Add($"SP:{spColumn}");
                    continue;
                }

                if (!columns.TryGetValue(listColumnName, out var column))
                {
                    faltantes.Add($"Lista:{listColumnName}");
                    continue;
                }

                map[source] = column;
            }

            ignoradas.AddRange(sourceColumns.Where(c => !map.ContainsKey(c)));
            if (faltantes.Count > 0)
            {
                throw new InvalidOperationException(
                    $"La homologacion de columnas no coincide: no se encontro {string.Join(", ", faltantes)}. " +
                    $"Columnas del SP: {string.Join(", ", sourceColumns)}. " +
                    $"Columnas de la lista (editables/simples): {string.Join(", ", columns.Values.Select(c => c.Name).Distinct())}.");
            }
        }
        else
        {
            foreach (var source in sourceColumns)
            {
                if (columns.TryGetValue(source, out var column)) map[source] = column;
                else ignoradas.Add(source);
            }
        }

        if (!map.TryGetValue(sourceKey, out var keyListColumn))
        {
            var listaColumnas = string.Join(", ", columns.Values.Select(c => c.Name).Distinct());
            throw new InvalidOperationException(
                $"La columna clave '{sourceKey}' no existe (o no es editable/simple) en la lista '{listName}'. " +
                $"Configure SharePoint:EmpleadosLista:KeyColumn con una columna presente en ambos lados. " +
                $"Columnas del SP: {string.Join(", ", sourceColumns)}. Columnas de la lista: {listaColumnas}.");
        }

        // Clave secundaria (p. ej. documento de identidad): empareja registros que aún no tienen la clave principal
        // y evita chocar con columnas de valor único al crear.
        string? sourceSecondary = null;
        ListColumn? secondaryListColumn = null;
        if (!string.IsNullOrWhiteSpace(secondaryKeyColumn))
        {
            sourceSecondary = sourceColumns.FirstOrDefault(c => string.Equals(c, secondaryKeyColumn.Trim(), StringComparison.OrdinalIgnoreCase));
            if (sourceSecondary is not null && map.TryGetValue(sourceSecondary, out var sec) &&
                !string.Equals(sec.Name, keyListColumn.Name, StringComparison.OrdinalIgnoreCase))
            {
                secondaryListColumn = sec;
            }
            else
            {
                sourceSecondary = null;
            }
        }

        var (existentes, porSecundaria) = await GetExistingItemsAsync(
            token, siteId, listId, keyListColumn, secondaryListColumn, cancellationToken);
        var zona = AsistenciaSharePointTimeZone.Resolve();
        var itemsUrl = $"{GraphBase}/sites/{siteId}/lists/{listId}/items";

        int creados = 0, actualizados = 0, sinCambios = 0, omitidos = 0, errores = 0;
        var mensajesError = new List<string>();
        var vistos = new HashSet<string>(StringComparer.Ordinal);
        const int MaxErrores = 20;

        foreach (var row in rows)
        {
            var keyValue = NormalizeKey(row.GetValueOrDefault(sourceKey));
            if (keyValue is null || !vistos.Add(keyValue))
            {
                omitidos++; // sin clave o clave repetida en el SP: no se puede sincronizar con seguridad.
                continue;
            }

            var secondaryValue = sourceSecondary is null ? null : NormalizeKey(row.GetValueOrDefault(sourceSecondary));

            try
            {
                ExistingItem? existing = null;
                if (!existentes.TryGetValue(keyValue, out existing) && secondaryValue is not null)
                {
                    porSecundaria.TryGetValue(secondaryValue, out existing);
                }

                if (existing is null)
                {
                    var nuevos = new Dictionary<string, object?>();
                    foreach (var (source, column) in map)
                    {
                        if (TryConvert(row.GetValueOrDefault(source), column.Kind, zona, out _, out var json) && json is not null)
                        {
                            nuevos[column.Name] = json;
                        }
                    }

                    var respuesta = await SendJsonAsync(HttpMethod.Post, itemsUrl, token, new { fields = nuevos }, cancellationToken);
                    creados++;

                    // Se registra el elemento creado para no duplicarlo si el SP repite al empleado.
                    using var creado = JsonDocument.Parse(respuesta);
                    var nuevoId = creado.RootElement.TryGetProperty("id", out var idProp) ? idProp.GetString() : null;
                    if (nuevoId is not null)
                    {
                        using var fieldsDoc = JsonDocument.Parse(JsonSerializer.Serialize(nuevos, JsonOptions));
                        var item = new ExistingItem(nuevoId, fieldsDoc.RootElement.Clone());
                        existentes.TryAdd(keyValue, item);
                        if (secondaryValue is not null) porSecundaria.TryAdd(secondaryValue, item);
                    }

                    continue;
                }

                var cambios = new Dictionary<string, object?>();
                foreach (var (source, column) in map)
                {
                    if (!TryConvert(row.GetValueOrDefault(source), column.Kind, zona, out var deseado, out var json))
                    {
                        continue; // valor no convertible: no se toca el campo.
                    }

                    var actual = ReadExisting(existing.Fields, column, zona);
                    if (!Equals(deseado, actual))
                    {
                        cambios[column.Name] = json; // null = vaciar el campo porque en origen quedó vacío
                    }
                }

                if (cambios.Count == 0)
                {
                    sinCambios++;
                    continue;
                }

                await SendJsonAsync(HttpMethod.Patch, $"{itemsUrl}/{existing.Id}/fields", token, cambios, cancellationToken);
                actualizados++;
                existentes.TryAdd(keyValue, existing);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                // Un empleado con problema (valor de opción inválido, restricción de unicidad, etc.) no detiene al resto.
                errores++;
                if (mensajesError.Count < 5) mensajesError.Add($"{sourceKey}={keyValue}: {ex.Message}");
                if (errores >= MaxErrores)
                {
                    mensajesError.Add($"Se detuvo tras {MaxErrores} errores.");
                    break;
                }
            }
        }

        return new SharePointListSyncResult(listName, sourceKey, creados, actualizados, sinCambios, omitidos, ignoradas, errores, mensajesError);
    }

    // ---------- conversión / comparación ----------

    private static string? NormalizeKey(object? value)
    {
        var text = value switch
        {
            null => null,
            JsonElement element => element.ValueKind switch
            {
                JsonValueKind.Null or JsonValueKind.Undefined => null,
                JsonValueKind.String => element.GetString(),
                _ => element.GetRawText()
            },
            _ => Convert.ToString(value, CultureInfo.InvariantCulture)
        };

        text = text?.Trim();
        if (string.IsNullOrEmpty(text)) return null;
        return decimal.TryParse(text, NumberStyles.Number, CultureInfo.InvariantCulture, out var number)
            ? number.ToString("0.############", CultureInfo.InvariantCulture)
            : text.ToUpperInvariant();
    }

    /// <summary>Convierte un valor del SP al tipo de la columna: valor comparable y valor JSON a enviar.</summary>
    private static bool TryConvert(object? value, Kind kind, TimeZoneInfo zona, out object? comparable, out object? json)
    {
        comparable = null;
        json = null;
        if (value is null) return true;

        switch (kind)
        {
            case Kind.Text:
            {
                var text = Convert.ToString(value, CultureInfo.InvariantCulture)?.Trim();
                if (string.IsNullOrEmpty(text)) return true;
                comparable = json = text;
                return true;
            }
            case Kind.Number:
            {
                if (value is string s && string.IsNullOrWhiteSpace(s)) return true;
                if (!TryToDecimal(value, out var number)) return false;
                comparable = number;
                json = number;
                return true;
            }
            case Kind.Boolean:
            {
                bool? flag = value switch
                {
                    bool b => b,
                    string s when s.Trim() is "1" or "true" or "True" or "SI" or "Si" or "si" or "sí" => true,
                    string s when s.Trim() is "0" or "false" or "False" or "NO" or "No" or "no" => false,
                    string => null,
                    _ => TryToDecimal(value, out var n) ? n != 0 : null
                };
                if (flag is null) return false;
                comparable = json = flag.Value;
                return true;
            }
            default:
            {
                if (!TryToDateTime(value, out var local)) return value is string e && string.IsNullOrWhiteSpace(e);
                if (kind == Kind.DateOnly)
                {
                    comparable = local.Date;
                    json = local.Date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
                    return true;
                }

                var utc = TimeZoneInfo.ConvertTimeToUtc(DateTime.SpecifyKind(local, DateTimeKind.Unspecified), zona);
                utc = TruncateMinute(utc);
                comparable = utc;
                json = utc.ToString("yyyy-MM-dd'T'HH:mm:ss'Z'", CultureInfo.InvariantCulture);
                return true;
            }
        }
    }

    private static object? ReadExisting(JsonElement fields, ListColumn column, TimeZoneInfo zona)
    {
        if (!fields.TryGetProperty(column.Name, out var element) ||
            element.ValueKind is JsonValueKind.Null or JsonValueKind.Undefined)
        {
            return null;
        }

        switch (column.Kind)
        {
            case Kind.Text:
            {
                var text = (element.ValueKind == JsonValueKind.String ? element.GetString() : element.GetRawText())?.Trim();
                return string.IsNullOrEmpty(text) ? null : text;
            }
            case Kind.Number:
                if (element.ValueKind == JsonValueKind.Number) return element.GetDecimal();
                return decimal.TryParse(element.ToString(), NumberStyles.Number, CultureInfo.InvariantCulture, out var n) ? n : null;
            case Kind.Boolean:
                return element.ValueKind switch
                {
                    JsonValueKind.True => true,
                    JsonValueKind.False => false,
                    _ => null
                };
            default:
            {
                var raw = element.ToString();
                if (string.IsNullOrWhiteSpace(raw)) return null;
                if (column.Kind == Kind.DateOnly)
                {
                    if (raw.Length == 10 && DateTime.TryParse(raw, CultureInfo.InvariantCulture, DateTimeStyles.None, out var plain))
                    {
                        return plain.Date;
                    }

                    return DateTimeOffset.TryParse(raw, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var dto)
                        ? TimeZoneInfo.ConvertTime(dto, zona).Date
                        : null;
                }

                return DateTimeOffset.TryParse(raw, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var instant)
                    ? TruncateMinute(instant.UtcDateTime)
                    : null;
            }
        }
    }

    private static DateTime TruncateMinute(DateTime value) =>
        new(value.Ticks - value.Ticks % TimeSpan.TicksPerMinute, DateTimeKind.Utc);

    private static bool TryToDecimal(object value, out decimal result)
    {
        try
        {
            result = value is string s
                ? decimal.Parse(s.Trim(), NumberStyles.Number | NumberStyles.AllowExponent, CultureInfo.InvariantCulture)
                : Convert.ToDecimal(value, CultureInfo.InvariantCulture);
            return true;
        }
        catch (Exception ex) when (ex is FormatException or InvalidCastException or OverflowException)
        {
            result = 0;
            return false;
        }
    }

    // El SP entrega fechas en hora de Perú (sin zona): se interpretan como locales de Lima.
    private static bool TryToDateTime(object value, out DateTime local)
    {
        switch (value)
        {
            case DateTime dt:
                local = dt;
                return true;
            case DateTimeOffset dto:
                local = dto.DateTime;
                return true;
            case string s when DateTime.TryParse(s, CultureInfo.GetCultureInfo("es-PE"), DateTimeStyles.None, out var parsed):
                local = parsed;
                return true;
            default:
                local = default;
                return false;
        }
    }

    // ---------- Graph ----------

    private async Task<Dictionary<string, ListColumn>> GetColumnsAsync(
        string token, string siteId, string listId, CancellationToken cancellationToken)
    {
        var result = new Dictionary<string, ListColumn>(StringComparer.OrdinalIgnoreCase);
        var url = $"{GraphBase}/sites/{siteId}/lists/{listId}/columns?$top=500";
        while (url is not null)
        {
            using var document = await GetJsonAsync(url, token, cancellationToken);
            foreach (var column in document.RootElement.GetProperty("value").EnumerateArray())
            {
                var name = column.TryGetProperty("name", out var n) ? n.GetString() : null;
                if (string.IsNullOrWhiteSpace(name)) continue;
                if (column.TryGetProperty("readOnly", out var ro) && ro.ValueKind == JsonValueKind.True) continue;

                Kind? kind = null;
                if (column.TryGetProperty("text", out _) || column.TryGetProperty("choice", out _)) kind = Kind.Text;
                else if (column.TryGetProperty("number", out _) || column.TryGetProperty("currency", out _)) kind = Kind.Number;
                else if (column.TryGetProperty("boolean", out _)) kind = Kind.Boolean;
                else if (column.TryGetProperty("dateTime", out var dt))
                {
                    var dateOnly = dt.TryGetProperty("format", out var f) &&
                                   string.Equals(f.GetString(), "dateOnly", StringComparison.OrdinalIgnoreCase);
                    kind = dateOnly ? Kind.DateOnly : Kind.DateTime;
                }

                if (kind is null) continue; // lookup, persona, calculada, etc.: no se sincroniza.

                var listColumn = new ListColumn(name, kind.Value);
                result[name] = listColumn;
                if (column.TryGetProperty("displayName", out var d) && !string.IsNullOrWhiteSpace(d.GetString()))
                {
                    result.TryAdd(d.GetString()!, listColumn);
                }
            }

            url = document.RootElement.TryGetProperty("@odata.nextLink", out var next) ? next.GetString() : null;
        }

        return result;
    }

    private async Task<(Dictionary<string, ExistingItem> ByKey, Dictionary<string, ExistingItem> BySecondary)> GetExistingItemsAsync(
        string token, string siteId, string listId, ListColumn keyColumn, ListColumn? secondaryColumn, CancellationToken cancellationToken)
    {
        var byKey = new Dictionary<string, ExistingItem>(StringComparer.Ordinal);
        var bySecondary = new Dictionary<string, ExistingItem>(StringComparer.Ordinal);
        var url = $"{GraphBase}/sites/{siteId}/lists/{listId}/items?$expand=fields&$top=999";
        while (url is not null)
        {
            using var document = await GetJsonAsync(url, token, cancellationToken);
            foreach (var item in document.RootElement.GetProperty("value").EnumerateArray())
            {
                var id = item.GetProperty("id").GetString();
                if (id is null || !item.TryGetProperty("fields", out var fields)) continue;

                var existing = new ExistingItem(id, fields.Clone());
                object? keyValue = fields.TryGetProperty(keyColumn.Name, out var key) ? key : null;
                var normalized = NormalizeKey(keyValue);
                // Clave repetida en la lista: se conserva el primero y se actualiza solo ese.
                if (normalized is not null) byKey.TryAdd(normalized, existing);

                if (secondaryColumn is not null)
                {
                    object? secValue = fields.TryGetProperty(secondaryColumn.Name, out var sec) ? sec : null;
                    var secNormalized = NormalizeKey(secValue);
                    if (secNormalized is not null) bySecondary.TryAdd(secNormalized, existing);
                }
            }

            url = document.RootElement.TryGetProperty("@odata.nextLink", out var next) ? next.GetString() : null;
        }

        return (byKey, bySecondary);
    }

    private async Task<string> GetListIdAsync(string token, string siteId, string listName, CancellationToken cancellationToken)
    {
        var names = new List<string>();
        var url = $"{GraphBase}/sites/{siteId}/lists?$select=id,name,displayName&$top=200";
        while (url is not null)
        {
            using var document = await GetJsonAsync(url, token, cancellationToken);
            foreach (var list in document.RootElement.GetProperty("value").EnumerateArray())
            {
                var name = list.TryGetProperty("name", out var n) ? n.GetString() : null;
                var display = list.TryGetProperty("displayName", out var d) ? d.GetString() : null;
                if (string.Equals(name, listName, StringComparison.OrdinalIgnoreCase) ||
                    string.Equals(display, listName, StringComparison.OrdinalIgnoreCase))
                {
                    return list.GetProperty("id").GetString()
                        ?? throw new InvalidOperationException("SharePoint no devolvio el id de la lista.");
                }

                if (display is not null) names.Add(display);
            }

            url = document.RootElement.TryGetProperty("@odata.nextLink", out var next) ? next.GetString() : null;
        }

        throw new InvalidOperationException(
            $"No se encontro la lista '{listName}' en SharePoint. Listas disponibles: {string.Join(", ", names)}");
    }

    private async Task<string> GetSiteIdAsync(string token, string sitePath, CancellationToken cancellationToken)
    {
        var path = sitePath.StartsWith('/') ? sitePath : $"/{sitePath}";
        using var document = await GetJsonAsync($"{GraphBase}/sites/{_options.HostName}:{path}", token, cancellationToken);
        return document.RootElement.GetProperty("id").GetString()
            ?? throw new InvalidOperationException("No se obtuvo el identificador del sitio de SharePoint.");
    }

    private async Task<JsonDocument> GetJsonAsync(string url, string token, CancellationToken cancellationToken)
    {
        using var response = await SendWithRetryAsync(() =>
        {
            var request = new HttpRequestMessage(HttpMethod.Get, url);
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            return request;
        }, cancellationToken);
        var content = await response.Content.ReadAsStringAsync(cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            throw new InvalidOperationException($"Error de Microsoft Graph ({(int)response.StatusCode}): {content}");
        }

        return JsonDocument.Parse(content);
    }

    private async Task<string> SendJsonAsync(HttpMethod method, string url, string token, object body, CancellationToken cancellationToken)
    {
        var json = JsonSerializer.Serialize(body, JsonOptions);
        using var response = await SendWithRetryAsync(() =>
        {
            var request = new HttpRequestMessage(method, url)
            {
                Content = new StringContent(json, Encoding.UTF8, "application/json")
            };
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            return request;
        }, cancellationToken);
        var content = await response.Content.ReadAsStringAsync(cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            throw new InvalidOperationException(
                $"No se pudo escribir en la lista de SharePoint ({method} {(int)response.StatusCode}): {content}");
        }

        return string.IsNullOrWhiteSpace(content) ? "{}" : content;
    }

    // Graph limita el ritmo de escrituras en listas (429/503 con Retry-After).
    private async Task<HttpResponseMessage> SendWithRetryAsync(
        Func<HttpRequestMessage> requestFactory, CancellationToken cancellationToken)
    {
        for (var attempt = 1; ; attempt++)
        {
            using var request = requestFactory();
            var response = await _httpClient.SendAsync(request, cancellationToken);
            if (response.StatusCode is not (HttpStatusCode.TooManyRequests or HttpStatusCode.ServiceUnavailable) || attempt >= 6)
            {
                return response;
            }

            var wait = response.Headers.RetryAfter?.Delta ?? TimeSpan.FromSeconds(Math.Min(30, 2 * attempt));
            response.Dispose();
            await Task.Delay(wait > TimeSpan.FromSeconds(60) ? TimeSpan.FromSeconds(60) : wait, cancellationToken);
        }
    }

    private async Task<string> GetAccessTokenAsync(CancellationToken cancellationToken)
    {
        using var request = new HttpRequestMessage(
            HttpMethod.Post,
            $"https://login.microsoftonline.com/{_options.TenantId}/oauth2/v2.0/token")
        {
            Content = new FormUrlEncodedContent(new Dictionary<string, string>
            {
                ["client_id"] = _options.ClientId,
                ["client_secret"] = _options.ClientSecret,
                ["grant_type"] = "client_credentials",
                ["scope"] = "https://graph.microsoft.com/.default"
            })
        };

        using var response = await _httpClient.SendAsync(request, cancellationToken);
        var content = await response.Content.ReadAsStringAsync(cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            throw new InvalidOperationException(
                $"No se pudo obtener el token de Microsoft Graph. Detalle: {response.StatusCode} {content}");
        }

        using var document = JsonDocument.Parse(content);
        return document.RootElement.GetProperty("access_token").GetString()
            ?? throw new InvalidOperationException("Microsoft Graph no devolvio un access_token valido.");
    }

    private void ValidateConfiguration()
    {
        if (string.IsNullOrWhiteSpace(_options.TenantId) ||
            string.IsNullOrWhiteSpace(_options.ClientId) ||
            string.IsNullOrWhiteSpace(_options.ClientSecret) ||
            string.IsNullOrWhiteSpace(_options.HostName) ||
            _options.ClientSecret.StartsWith("REPLACE_WITH_", StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException(
                "La integracion con SharePoint no esta configurada. Revise la seccion SharePoint en appsettings.");
        }
    }
}
