using CjERP.Api.Configuration;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Options;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;

namespace CjERP.Api.Services;

public interface ISharePointCommercialUploadService
{
    Task<SharePointCommercialUploadResult> UploadExpenseInvoiceAsync(
        IFormFile file,
        ExpenseInvoiceUploadContext context,
        CancellationToken cancellationToken = default);

    Task<byte[]> DownloadFileAsync(string filePath, CancellationToken cancellationToken = default);
}

public sealed record ExpenseInvoiceUploadContext(
    int? GastoId,
    string? FiltroOperativoKey,
    string? Serie,
    string? Responsable,
    string? FolderPath = null,
    string? FolderKey = null,
    string? FilePrefix = null);

public sealed record SharePointCommercialUploadResult(
    string FileName,
    string FileUrl,
    string StoragePath);

public sealed class SharePointCommercialUploadService : ISharePointCommercialUploadService
{
    private static readonly HashSet<string> AllowedExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".jpg",
        ".jpeg",
        ".png",
        ".webp",
        ".bmp",
        ".pdf",
        ".doc",
        ".docx",
        ".xls",
        ".xlsx",
        ".csv",
        ".txt"
    };

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private readonly HttpClient _httpClient;
    private readonly SharePointOptions _options;

    public SharePointCommercialUploadService(
        HttpClient httpClient,
        IOptions<SharePointOptions> options)
    {
        _httpClient = httpClient;
        _options = options.Value;
    }

    public async Task<SharePointCommercialUploadResult> UploadExpenseInvoiceAsync(
        IFormFile file,
        ExpenseInvoiceUploadContext context,
        CancellationToken cancellationToken = default)
    {
        ValidateConfiguration();
        ValidateFile(file);

        var accessToken = await GetAccessTokenAsync(cancellationToken);
        var siteId = await GetSiteIdAsync(accessToken, cancellationToken);
        var driveId = await GetDriveIdAsync(siteId, accessToken, cancellationToken);
        var fileName = BuildFileName(file.FileName, context);
        var normalizedFolderPath = ResolveFolderPath(context);
        var uploadPath = string.IsNullOrWhiteSpace(normalizedFolderPath)
            ? EncodePathSegment(fileName)
            : $"{EncodePath(normalizedFolderPath)}/{EncodePathSegment(fileName)}";
        var requestUrl = $"https://graph.microsoft.com/v1.0/drives/{driveId}/root:/{uploadPath}:/content";

        await using var stream = file.OpenReadStream();
        using var request = new HttpRequestMessage(HttpMethod.Put, requestUrl)
        {
            Content = new StreamContent(stream)
        };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        request.Content.Headers.ContentType = MediaTypeHeaderValue.Parse(file.ContentType ?? "application/octet-stream");

        using var response = await _httpClient.SendAsync(request, cancellationToken);
        var responseContent = await response.Content.ReadAsStringAsync(cancellationToken);

        if (!response.IsSuccessStatusCode)
        {
            throw new InvalidOperationException(
                $"No se pudo cargar la factura a SharePoint. Detalle: {response.StatusCode} {responseContent}");
        }

        using var document = JsonDocument.Parse(responseContent);
        var webUrl = document.RootElement.TryGetProperty("webUrl", out var webUrlProperty)
            ? webUrlProperty.GetString() ?? string.Empty
            : string.Empty;
        var storagePath = BuildStoragePath(fileName, normalizedFolderPath);

        return new SharePointCommercialUploadResult(fileName, webUrl, storagePath);
    }

    public async Task<byte[]> DownloadFileAsync(string filePath, CancellationToken cancellationToken = default)
    {
        ValidateConfiguration();

        var normalizedFilePath = NormalizeFolderPath(filePath);
        if (string.IsNullOrWhiteSpace(normalizedFilePath))
        {
            throw new InvalidOperationException("La ruta de SharePoint es obligatoria.");
        }

        var accessToken = await GetAccessTokenAsync(cancellationToken);
        var siteId = await GetSiteIdAsync(accessToken, cancellationToken);
        var driveId = await GetDriveIdAsync(siteId, accessToken, cancellationToken);
        var requestUrl = $"https://graph.microsoft.com/v1.0/drives/{driveId}/root:/{EncodePath(normalizedFilePath)}:/content";

        using var request = new HttpRequestMessage(HttpMethod.Get, requestUrl);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

        using var response = await _httpClient.SendAsync(request, cancellationToken);
        var responseContent = await response.Content.ReadAsStringAsync(cancellationToken);

        if (!response.IsSuccessStatusCode)
        {
            throw new InvalidOperationException(
                $"No se pudo descargar la plantilla desde SharePoint. Detalle: {response.StatusCode} {responseContent}");
        }

        return await response.Content.ReadAsByteArrayAsync(cancellationToken);
    }

    private void ValidateConfiguration()
    {
        if (string.IsNullOrWhiteSpace(_options.TenantId) ||
            string.IsNullOrWhiteSpace(_options.ClientId) ||
            string.IsNullOrWhiteSpace(_options.ClientSecret) ||
            string.IsNullOrWhiteSpace(_options.HostName) ||
            string.IsNullOrWhiteSpace(_options.SitePath) ||
            string.IsNullOrWhiteSpace(_options.DocumentLibraryName))
        {
            throw new InvalidOperationException(
                "La integracion con SharePoint no esta configurada. Revise la seccion SharePoint en appsettings.");
        }

        if (_options.ClientSecret.StartsWith("REPLACE_WITH_", StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException(
                "La integracion con SharePoint no esta configurada. Reemplace SharePoint:ClientSecret con el client secret VALUE real en appsettings o variables de entorno.");
        }

        if (Guid.TryParse(_options.ClientSecret, out _))
        {
            throw new InvalidOperationException(
                "SharePoint:ClientSecret parece ser el secret ID y no el secret VALUE. En Azure debe usar el valor del secreto, no el identificador.");
        }
    }

    private static void ValidateFile(IFormFile file)
    {
        if (file.Length <= 0)
        {
            throw new InvalidOperationException("La imagen seleccionada esta vacia.");
        }

        var extension = Path.GetExtension(file.FileName);
        if (string.IsNullOrWhiteSpace(extension) || !AllowedExtensions.Contains(extension))
        {
            throw new InvalidOperationException(
                "Solo se permiten archivos JPG, JPEG, PNG, WEBP, BMP, PDF, DOC, DOCX, XLS, XLSX, CSV o TXT.");
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
        var responseContent = await response.Content.ReadAsStringAsync(cancellationToken);

        if (!response.IsSuccessStatusCode)
        {
            throw new InvalidOperationException(
                $"No se pudo obtener el token de Microsoft Graph. Detalle: {response.StatusCode} {responseContent}");
        }

        using var document = JsonDocument.Parse(responseContent);
        return document.RootElement.GetProperty("access_token").GetString()
            ?? throw new InvalidOperationException("Microsoft Graph no devolvio un access_token valido.");
    }

    private async Task<string> GetSiteIdAsync(string accessToken, CancellationToken cancellationToken)
    {
        var sitePath = _options.SitePath.StartsWith('/') ? _options.SitePath : $"/{_options.SitePath}";
        var requestUrl = $"https://graph.microsoft.com/v1.0/sites/{_options.HostName}:{sitePath}";
        using var request = new HttpRequestMessage(HttpMethod.Get, requestUrl);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

        using var response = await _httpClient.SendAsync(request, cancellationToken);
        var responseContent = await response.Content.ReadAsStringAsync(cancellationToken);

        if (!response.IsSuccessStatusCode)
        {
            throw new InvalidOperationException(
                $"No se pudo resolver el sitio de SharePoint. Detalle: {response.StatusCode} {responseContent}");
        }

        using var document = JsonDocument.Parse(responseContent);
        return document.RootElement.GetProperty("id").GetString()
            ?? throw new InvalidOperationException("No se obtuvo el identificador del sitio de SharePoint.");
    }

    private async Task<string> GetDriveIdAsync(
        string siteId,
        string accessToken,
        CancellationToken cancellationToken)
    {
        var requestUrl = $"https://graph.microsoft.com/v1.0/sites/{siteId}/drives";
        using var request = new HttpRequestMessage(HttpMethod.Get, requestUrl);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

        using var response = await _httpClient.SendAsync(request, cancellationToken);
        var responseContent = await response.Content.ReadAsStringAsync(cancellationToken);

        if (!response.IsSuccessStatusCode)
        {
            throw new InvalidOperationException(
                $"No se pudo consultar la biblioteca de SharePoint. Detalle: {response.StatusCode} {responseContent}");
        }

        using var document = JsonDocument.Parse(responseContent);
        var drives = document.RootElement.GetProperty("value").EnumerateArray();

        foreach (var drive in drives)
        {
            var name = drive.TryGetProperty("name", out var nameProperty)
                ? nameProperty.GetString()
                : null;

            if (!string.Equals(name, _options.DocumentLibraryName, StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            return drive.GetProperty("id").GetString()
                ?? throw new InvalidOperationException("La biblioteca de SharePoint no devolvio un id valido.");
        }

        throw new InvalidOperationException(
            $"No se encontro la biblioteca '{_options.DocumentLibraryName}' en SharePoint.");
    }

    private string BuildStoragePath(string fileName, string folderPath)
    {
        var segments = new List<string> { _options.DocumentLibraryName.Trim('/') };

        if (!string.IsNullOrWhiteSpace(folderPath))
        {
            segments.Add(folderPath);
        }

        segments.Add(fileName);
        return string.Join("/", segments.Where(segment => !string.IsNullOrWhiteSpace(segment)));
    }

    private static string BuildFileName(string originalFileName, ExpenseInvoiceUploadContext context)
    {
        var extension = Path.GetExtension(originalFileName).ToLowerInvariant();
        var filePrefix = NormalizeToken(context.FilePrefix);
        var baseNameParts = new[]
        {
            string.IsNullOrWhiteSpace(filePrefix) ? "gasto" : filePrefix,
            context.GastoId?.ToString(),
            NormalizeToken(context.FiltroOperativoKey),
            NormalizeToken(context.Serie),
            NormalizeToken(context.Responsable),
            DateTime.UtcNow.ToString("yyyyMMddHHmmss")
        };

        var baseName = string.Join("_", baseNameParts.Where(part => !string.IsNullOrWhiteSpace(part)));
        return $"{baseName}{extension}";
    }

    private static string NormalizeToken(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return string.Empty;
        }

        var builder = new StringBuilder();

        foreach (var character in value.Trim())
        {
            builder.Append(char.IsLetterOrDigit(character) ? character : '_');
        }

        return builder.ToString().Trim('_');
    }

    private static string NormalizeFolderPath(string? folderPath)
    {
        return (folderPath ?? string.Empty).Trim().Trim('/');
    }

    private string ResolveFolderPath(ExpenseInvoiceUploadContext context)
    {
        var requestedFolderPath = NormalizeFolderPath(context.FolderPath);
        if (!string.IsNullOrWhiteSpace(requestedFolderPath))
        {
            return requestedFolderPath;
        }

        var folderKey = context.FolderKey?.Trim();
        if (!string.IsNullOrWhiteSpace(folderKey) &&
            _options.FolderPaths.TryGetValue(folderKey, out var configuredFolderPath))
        {
            var normalizedConfiguredPath = NormalizeFolderPath(configuredFolderPath);
            if (!string.IsNullOrWhiteSpace(normalizedConfiguredPath))
            {
                return normalizedConfiguredPath;
            }
        }

        return NormalizeFolderPath(_options.ExpensesFolderPath);
    }

    private static string EncodePath(string path)
    {
        return string.Join("/", path.Split('/', StringSplitOptions.RemoveEmptyEntries).Select(EncodePathSegment));
    }

    private static string EncodePathSegment(string segment)
    {
        return Uri.EscapeDataString(segment);
    }
}
