namespace CjERP.Application.DTOs.Auth
{
    public class LoginRequestDto
    {
        public string IdUsuario { get; set; } = string.Empty;
        public string Clave { get; set; } = string.Empty;
        /// <summary>Aplicacion desde la que se inicia sesion (SegApp.CodigoApp). Vacio = "WEB" (comportamiento de siempre).</summary>
        public string? App { get; set; }
    }
}
