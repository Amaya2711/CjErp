namespace CjERP.Application.DTOs;

public class PlanillaXmlArchivoDto
{
    public string NombreArchivo { get; set; } = string.Empty;
    public byte[] Contenido { get; set; } = [];
    public long TamanioBytes { get; set; }
}
