namespace CjERP.Application.DTOs;

public sealed class DescansoEmpleadoDto
{
    public int IdEmpleado { get; set; }
    public string? NombreEmpleado { get; set; }
    public string? NroDocumento { get; set; }
}

/// <summary>Una solicitud de descanso médico (rango de fechas; en la BD hay una fila por día).</summary>
public sealed class DescansoListItemDto
{
    public int IdEmpleadoCj { get; set; }
    public int IdEstado { get; set; }
    public string? Estado { get; set; }
    public string? NombreEmpleado { get; set; }
    public string? NroDocumento { get; set; }
    public DateTime FechaInicio { get; set; }
    public DateTime FechaFin { get; set; }
    public int Dias { get; set; }
    public string? Usuario { get; set; }
    public DateTime? FechaCreacion { get; set; }
    public string? Ruta { get; set; }
    public string? PrimerValidador { get; set; }
    public string? SegundoValidador { get; set; }
    public string? TercerValidador { get; set; }
    public DateTime? FechaPre { get; set; }
    public DateTime? FechaPrimera { get; set; }
    public DateTime? FechaAutorizado { get; set; }
}

public sealed class DescansoRegistrarRequestDto
{
    public int IdEmpleadoCj { get; set; }
    public DateTime FechaInicio { get; set; }
    public DateTime FechaFin { get; set; }
    /// <summary>Ruta del adjunto en SharePoint (obtenida de /adjunto).</summary>
    public string? Ruta { get; set; }
}

public sealed class DescansoSolicitudKeyDto
{
    public int IdEmpleadoCj { get; set; }
    public DateTime FechaInicio { get; set; }
    public DateTime FechaFin { get; set; }
    /// <summary>Etapa actual (97, 98, 99 o 100); solo se usa al aprobar.</summary>
    public int IdEstadoActual { get; set; }
}

public sealed class DescansoAccionRequestDto
{
    public List<DescansoSolicitudKeyDto> Solicitudes { get; set; } = new();
}

public sealed class DescansoAccionItemResultDto
{
    public int IdEmpleadoCj { get; set; }
    public DateTime FechaInicio { get; set; }
    public DateTime FechaFin { get; set; }
    public bool Procesado { get; set; }
    public string? Mensaje { get; set; }
    /// <summary>Solo en la aprobación final: null = no aplica.</summary>
    public bool? CorreoEnviado { get; set; }
    public string? CorreoMensaje { get; set; }
}

public sealed class DescansoCartaDto
{
    public int IdEmpleadoCj { get; set; }
    public string? NombreEmpleado { get; set; }
    public string? NroDocumento { get; set; }
    public string? NombreCliente { get; set; }
    public DateTime FechaInicio { get; set; }
    public DateTime FechaFin { get; set; }
    public int Dias { get; set; }
    public string? PreAprobador { get; set; }
    public string? PrimAprobador { get; set; }
    public string? Autorizado { get; set; }
}
