namespace CjERP.Application.DTOs.Auth
{
    public class LoginResponseDto
    {
        public int? Cuadrilla { get; set; }
        public string IdUsuario { get; set; } = string.Empty;
        public string? Correo { get; set; }
        public string? NombreEmpleado { get; set; }
        public int? CodEmp { get; set; }
        public int? CodVal { get; set; }

        public string? Token { get; set; }
        public DateTime? Expiration { get; set; }
    }
}