namespace CjERP.Application.DTOs.Mobile;

public sealed class MobileIntegrationPublishRequestDto
{
    public string Modulo { get; set; } = string.Empty;
    public string Titulo { get; set; } = string.Empty;
    public string Mensaje { get; set; } = string.Empty;
    public IReadOnlyCollection<int> DestinatariosEmpleadoCj { get; set; } = [];
    public int Tipo { get; set; } = 1;
    public int Prioridad { get; set; }
    public int TipoPersistencia { get; set; }
    public bool PermiteConfirmacion { get; set; }
    public string? RutaDestino { get; set; }
    public long? IdReferencia { get; set; }
    public string? TipoReferencia { get; set; }
}

public sealed class MobileIntegrationPublishResultDto
{
    public long IdComunicacion { get; set; }
    public int Destinatarios { get; set; }
}
