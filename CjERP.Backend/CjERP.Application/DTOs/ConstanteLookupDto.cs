namespace CjERP.Application.DTOs
{
    public class ConstanteLookupDto
    {
        public string Campo { get; set; } = string.Empty;
        public string Codigo { get; set; } = string.Empty;
        public string Descripcion { get; set; } = string.Empty;
        public string Valor { get; set; } = string.Empty;
        public int Orden { get; set; }
    }
}
