namespace CjERP.Application.DTOs.Auth
{
    public class CurrentUserDto
    {
        public string IdUsuario { get; set; } = string.Empty;
        public string? NombreEmpleado { get; set; }
        public string? Correo { get; set; }
        public int? CodEmp { get; set; }
        public int? CodVal { get; set; }
        public int? Cuadrilla { get; set; }
    }
}