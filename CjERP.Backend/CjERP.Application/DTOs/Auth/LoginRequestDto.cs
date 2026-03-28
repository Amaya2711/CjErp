namespace CjERP.Application.DTOs.Auth
{
    public class LoginRequestDto
    {
        public string IdUsuario { get; set; } = string.Empty;
        public string Clave { get; set; } = string.Empty;
    }
}
