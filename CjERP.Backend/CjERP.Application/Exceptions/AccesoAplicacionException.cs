namespace CjERP.Application.Exceptions;

/// <summary>
/// El usuario se autentico bien pero no puede usar la aplicacion que pidio (inactivo, cargo no permitido, sin rol para esa app...).
/// Se lanza ANTES de crear la sesion; el controlador la devuelve como 403 con este mensaje.
/// </summary>
public sealed class AccesoAplicacionException : Exception
{
    public AccesoAplicacionException(string message) : base(message) { }
}
