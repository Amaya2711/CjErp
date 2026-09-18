namespace CjERP.Application.DTOs;

public class GestorValidadorLookupDto
{
    public List<SolicitanteLookupDto> Gestores { get; set; } = [];
    public List<SolicitanteLookupDto> Validadores { get; set; } = [];
}
