using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;

namespace CjERP.Infrastructure.Services.Graph;

/// <summary>
/// Reemplaza el cuerpo de una tabla de Excel (libro en SharePoint/OneDrive) usando la API de libros de
/// Microsoft Graph: abre una sesión, lee el rango de datos de la tabla, lo limpia, escribe las filas nuevas por
/// lotes y cierra la sesión (siempre, aunque falle un paso). Solo hace HTTP: el token y el archivo ya vienen resueltos.
/// </summary>
public static class GraphExcelTableWriter
{
    public const int DefaultBatchSize = 200;
    private const int MaxAttempts = 4;
    private static readonly TimeSpan MaxRetryDelay = TimeSpan.FromSeconds(30);

    public static async Task<int> ReplaceTableBodyAsync(
        HttpClient http,
        string accessToken,
        string driveId,
        string itemId,
        string tableName,
        IReadOnlyList<object?[]> rows,
        int batchSize = DefaultBatchSize,
        CancellationToken cancellationToken = default)
    {
        if (rows.Count == 0)
        {
            throw new InvalidOperationException("No hay filas para escribir en la tabla de Excel.");
        }

        var width = rows[0].Length;
        if (width == 0 || rows.Any(row => row.Length != width))
        {
            throw new InvalidOperationException("Todas las filas deben tener la misma cantidad de columnas.");
        }

        var workbookUrl = $"https://graph.microsoft.com/v1.0/drives/{Uri.EscapeDataString(driveId)}/items/{Uri.EscapeDataString(itemId)}/workbook";
        var size = Math.Clamp(batchSize <= 0 ? DefaultBatchSize : batchSize, 1, 1000);

        var sessionId = await CreateSessionAsync(http, accessToken, workbookUrl, cancellationToken);
        try
        {
            // dataBodyRange actual: de ahí salen la hoja, la fila de inicio y la primera columna.
            var bodyJson = await SendAsync(
                http, HttpMethod.Get,
                $"{workbookUrl}/tables/{Uri.EscapeDataString(tableName)}/dataBodyRange",
                accessToken, sessionId, null, "leer el rango de la tabla", cancellationToken);
            var address = ParseAddress(bodyJson);

            if (address.ColumnCount < width)
            {
                throw new InvalidOperationException(
                    $"La tabla '{tableName}' tiene {address.ColumnCount} columnas y se necesitan {width}. " +
                    "Revise que la tabla del Excel coincida con los datos que envía el job.");
            }

            var sheetUrl = $"{workbookUrl}/worksheets('{Uri.EscapeDataString(address.Sheet.Replace("'", "''"))}')";

            // Limpiar todo el cuerpo actual de la tabla.
            await SendAsync(
                http, HttpMethod.Post,
                $"{sheetUrl}/range(address='{address.BodyAddress}')/clear",
                accessToken, sessionId, "{\"applyTo\":\"all\"}", "limpiar la tabla", cancellationToken);

            // Escribir en lotes desde la primera fila de datos.
            var firstColumn = address.StartColumn;
            var lastColumn = address.StartColumn + width - 1;
            var rowPointer = address.StartRow;
            for (var index = 0; index < rows.Count; index += size)
            {
                var take = Math.Min(size, rows.Count - index);
                var chunk = new List<object?[]>(take);
                for (var i = 0; i < take; i++)
                {
                    chunk.Add(rows[index + i]);
                }

                var range = $"{ColumnName(firstColumn)}{rowPointer}:{ColumnName(lastColumn)}{rowPointer + take - 1}";
                var payload = JsonSerializer.Serialize(new { values = chunk });
                await SendAsync(
                    http, HttpMethod.Patch,
                    $"{sheetUrl}/range(address='{range}')",
                    accessToken, sessionId, payload, "escribir las filas", cancellationToken);

                rowPointer += take;
            }

            return rows.Count;
        }
        finally
        {
            await CloseSessionAsync(http, accessToken, workbookUrl, sessionId);
        }
    }

    private static async Task<string> CreateSessionAsync(
        HttpClient http, string accessToken, string workbookUrl, CancellationToken cancellationToken)
    {
        var json = await SendAsync(
            http, HttpMethod.Post, $"{workbookUrl}/createSession",
            accessToken, null, "{\"persistChanges\": true}", "abrir la sesión del libro", cancellationToken);
        using var document = JsonDocument.Parse(json);
        return document.RootElement.TryGetProperty("id", out var id) && !string.IsNullOrWhiteSpace(id.GetString())
            ? id.GetString()!
            : throw new InvalidOperationException("Microsoft Graph no devolvió el id de la sesión del libro.");
    }

    private static async Task CloseSessionAsync(HttpClient http, string accessToken, string workbookUrl, string sessionId)
    {
        try
        {
            // Cierre best-effort: no debe ocultar el error original ni cancelarse con el job.
            await SendAsync(
                http, HttpMethod.Post, $"{workbookUrl}/closeSession",
                accessToken, sessionId, "{}", "cerrar la sesión del libro", CancellationToken.None);
        }
        catch
        {
            // La sesión caduca sola en el servidor.
        }
    }

    private static async Task<string> SendAsync(
        HttpClient http,
        HttpMethod method,
        string url,
        string accessToken,
        string? sessionId,
        string? jsonBody,
        string action,
        CancellationToken cancellationToken)
    {
        for (var attempt = 1; ; attempt++)
        {
            using var request = new HttpRequestMessage(method, url);
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
            if (!string.IsNullOrWhiteSpace(sessionId))
            {
                request.Headers.TryAddWithoutValidation("workbook-session-id", sessionId);
            }

            if (jsonBody is not null)
            {
                request.Content = new StringContent(jsonBody, Encoding.UTF8, "application/json");
            }

            using var response = await http.SendAsync(request, cancellationToken);
            var body = await response.Content.ReadAsStringAsync(cancellationToken);
            if (response.IsSuccessStatusCode)
            {
                return body;
            }

            var transitorio = response.StatusCode is HttpStatusCode.TooManyRequests
                or HttpStatusCode.ServiceUnavailable or HttpStatusCode.GatewayTimeout;
            if (transitorio && attempt < MaxAttempts)
            {
                var wait = response.Headers.RetryAfter?.Delta ?? TimeSpan.FromSeconds(2 * attempt);
                await Task.Delay(wait > MaxRetryDelay ? MaxRetryDelay : wait, cancellationToken);
                continue;
            }

            throw new InvalidOperationException(
                $"No se pudo {action} en Excel (Microsoft Graph). Detalle: {(int)response.StatusCode} {response.StatusCode} {body}");
        }
    }

    internal sealed record TableBodyAddress(
        string Sheet, string BodyAddress, int StartRow, int StartColumn, int ColumnCount);

    /// <summary>Interpreta direcciones como <c>Hoja1!A2:J50</c> o <c>'Mi hoja'!A2:J50</c>.</summary>
    internal static TableBodyAddress ParseAddress(string dataBodyRangeJson)
    {
        using var document = JsonDocument.Parse(dataBodyRangeJson);
        var full = document.RootElement.TryGetProperty("address", out var addressProperty)
            ? addressProperty.GetString()
            : null;
        if (string.IsNullOrWhiteSpace(full))
        {
            throw new InvalidOperationException("Microsoft Graph no devolvió la dirección del rango de la tabla.");
        }

        var separator = full.LastIndexOf('!');
        if (separator <= 0)
        {
            throw new InvalidOperationException($"No se pudo interpretar la dirección del rango: {full}");
        }

        var sheet = full[..separator];
        if (sheet.Length >= 2 && sheet[0] == '\'' && sheet[^1] == '\'')
        {
            sheet = sheet[1..^1].Replace("''", "'");
        }

        var bodyAddress = full[(separator + 1)..];
        var corners = bodyAddress.Split(':');
        var topLeft = SplitCell(corners[0]);
        var bottomRight = SplitCell(corners.Length > 1 ? corners[1] : corners[0]);
        return new TableBodyAddress(
            sheet,
            bodyAddress,
            topLeft.Row,
            topLeft.Column,
            bottomRight.Column - topLeft.Column + 1);
    }

    private static (int Column, int Row) SplitCell(string cell)
    {
        var letters = new string(cell.TakeWhile(char.IsLetter).ToArray()).ToUpperInvariant();
        var digits = new string(cell.SkipWhile(char.IsLetter).Where(char.IsDigit).ToArray());
        if (letters.Length == 0 || !int.TryParse(digits, out var row))
        {
            throw new InvalidOperationException($"No se pudo interpretar la celda: {cell}");
        }

        var column = 0;
        foreach (var letter in letters)
        {
            column = column * 26 + (letter - 'A' + 1);
        }

        return (column, row);
    }

    /// <summary>1 → A, 26 → Z, 27 → AA.</summary>
    internal static string ColumnName(int column)
    {
        var name = new StringBuilder();
        while (column > 0)
        {
            column--;
            name.Insert(0, (char)('A' + column % 26));
            column /= 26;
        }

        return name.ToString();
    }
}
