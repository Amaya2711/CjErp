using CjERP.Application.Interfaces.Services;

namespace CjERP.Infrastructure.Services;

/// <summary>
/// Cliente del gestor de archivos antiguo (GET mgr001.php?i=codigo&amp;t=nombre|contenido; el contenido llega en base64).
/// Equivale a GestorArchivo.descargar del sistema VB, pero devuelve los bytes en vez de abrir el archivo.
/// </summary>
public sealed class GestorArchivoLegacyService(HttpClient http) : IGestorArchivoLegacyService
{
    private const string Url = "https://www.elnk.uno/cjmultimedia/mgr001.php";

    public async Task<GestorArchivoLegacyResultado?> DescargarAsync(string codigo, CancellationToken ct = default)
    {
        codigo = codigo?.Trim() ?? string.Empty;
        if (codigo.Length == 0 || !codigo.All(char.IsDigit)) return null;

        http.Timeout = TimeSpan.FromMinutes(2);
        async Task<string> RecuperarAsync(string tipo) => Limpiar(await http.GetStringAsync(
            $"{Url}?i={Uri.EscapeDataString(codigo)}&t={tipo}", ct));

        var nombre = await RecuperarAsync("nombre");
        var contenido = await RecuperarAsync("contenido");
        if (string.IsNullOrWhiteSpace(contenido)) return null;

        var bytes = Convert.FromBase64String(contenido);
        var nombreSeguro = Path.GetFileName(nombre);
        if (string.IsNullOrWhiteSpace(nombreSeguro)) nombreSeguro = $"archivo-{codigo}";
        return new GestorArchivoLegacyResultado(nombreSeguro, ObtenerTipoContenido(nombreSeguro), bytes);
    }

    private static string Limpiar(string value) => value.Replace("\r", "").Replace("\n", "").Trim().Trim('"');

    private static string ObtenerTipoContenido(string fileName) => Path.GetExtension(fileName).ToLowerInvariant() switch
    {
        ".pdf" => "application/pdf",
        ".jpg" or ".jpeg" => "image/jpeg",
        ".png" => "image/png",
        ".gif" => "image/gif",
        ".bmp" => "image/bmp",
        ".webp" => "image/webp",
        ".txt" => "text/plain",
        ".xls" => "application/vnd.ms-excel",
        ".xlsx" => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        _ => "application/octet-stream",
    };
}
