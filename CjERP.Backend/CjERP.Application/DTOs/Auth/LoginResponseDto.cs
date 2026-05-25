namespace CjERP.Application.DTOs.Auth
{
    public class LoginResponseDto
    {
        public int? Cuadrilla { get; set; }
        public string IdUsuario { get; set; } = string.Empty;
        public string? Correo { get; set; }
        public string? NombreEmpleado { get; set; }
        public int? CodEmp { get; set; }
        public int? IdEmpleado { get; set; }
        public int? IdCargo { get; set; }
        public int? CodVal { get; set; }

        public string? Token { get; set; }
        public string? SessionId { get; set; }
        public DateTime? Expiration { get; set; }
        public int? IdPerfil { get; set; }
        public int? IdRol { get; set; }

    }
}
