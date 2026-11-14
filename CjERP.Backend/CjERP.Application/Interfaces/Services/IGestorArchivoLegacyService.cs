namespace CjERP.Application.Interfaces.Services;

/// <summary>Archivo recuperado del gestor de archivos del sistema antiguo (elnk.uno/cjmultimedia).</summary>
public sealed record GestorArchivoLegacyResultado(string Nombre, string ContentType, byte[] Contenido);

/// <summary>Descarga de archivos/imágenes registrados en el sistema antiguo, por código numérico.</summary>
public interface IGestorArchivoLegacyService
{
    /// <summary>Devuelve null si el código no existe o el gestor no entrega contenido. Lanza HttpRequestException/FormatException ante fallos del gestor.</summary>
    Task<GestorArchivoLegacyResultado?> DescargarAsync(string codigo, CancellationToken ct = default);
}
