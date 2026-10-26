namespace CjERP.Application.DTOs;

public sealed class NoticiaItemDto
{
    public string Titulo { get; set; } = string.Empty;
    public string Fuente { get; set; } = string.Empty;
    public string Url { get; set; } = string.Empty;
    public DateTime? FechaPublicacion { get; set; }
}

public sealed class NoticiaSeccionDto
{
    public string Clave { get; set; } = string.Empty;
    public string Titulo { get; set; } = string.Empty;
    public string Descripcion { get; set; } = string.Empty;
    public List<NoticiaItemDto> Noticias { get; set; } = [];
}

public sealed class NoticiasGerencialesDto
{
    /// <summary>Fecha del reporte (America/Lima).</summary>
    public string Fecha { get; set; } = string.Empty;
    public DateTime GeneradoUtc { get; set; }
    /// <summary>Resumen ejecutivo redactado por IA a partir de los titulares; null si la IA no esta disponible.</summary>
    public string? ResumenEjecutivo { get; set; }
    /// <summary>Implicancias para el negocio (IA); vacio si la IA no esta disponible.</summary>
    public List<string> Implicancias { get; set; } = [];
    public List<NoticiaSeccionDto> Secciones { get; set; } = [];
}
