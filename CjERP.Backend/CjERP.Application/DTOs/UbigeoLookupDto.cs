namespace CjERP.Application.DTOs;

public class UbigeoLookupDto
{
    public int IdUbigeo { get; set; }
    /// <summary>Código tal como está en dbo.Ubigeo.CodUbigeo (texto: conserva ceros a la izquierda).</summary>
    public string? CodUbigeo { get; set; }
    public string NombreUbigeo { get; set; } = string.Empty;
}
