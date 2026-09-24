namespace CjERP.Application.DTOs.Mobile;

public sealed class MobileCommunicationMonitorDto
{
    public int TotalComunicaciones { get; set; }
    public int Destinatarios { get; set; }
    public int NoLeidas { get; set; }
    public int Confirmadas { get; set; }
    public int ObligatoriasPendientes { get; set; }
    public int DispositivosActivos { get; set; }
    public int PushEnviados24Horas { get; set; }
    public int PushErrores24Horas { get; set; }
}

public sealed class MobileCommunicationDeliveryDetailDto
{
    public int IdEmpleadoCj { get; set; }
    public string NombreEmpleado { get; set; } = string.Empty;
    public bool Leido { get; set; }
    public DateTime? FechaLectura { get; set; }
    public bool Confirmado { get; set; }
    public DateTime? FechaConfirmacion { get; set; }
    public bool TieneDispositivoActivo { get; set; }
    public string? UltimoPushEstado { get; set; }
    public string? UltimoPushTipo { get; set; }
    public DateTime? FechaUltimoPush { get; set; }
    public string? CodigoUltimoPush { get; set; }
}
