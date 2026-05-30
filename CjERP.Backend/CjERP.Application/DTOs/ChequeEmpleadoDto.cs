namespace CjERP.Application.DTOs;

public class ChequeEmpleadoFiltroDto
{
    public int? IdEmpleado { get; set; }
    public int? IdEstado { get; set; }
}

public class ChequeEmpleadoDto
{
    public int IdCheque { get; set; }
    public int IdBanco { get; set; }
    public DateTime FechaCheque { get; set; }
    public string NroCheque { get; set; } = string.Empty;
    public decimal Importe { get; set; }
    public int IdMoneda { get; set; }
    public int IdEmpleado { get; set; }
    public int IdEstado { get; set; }
    public string? Ruta { get; set; }
    public DateTime? FechaCreacion { get; set; }
    public DateTime? FechaModificacion { get; set; }
}

public class ChequeEmpleadoGuardarDto
{
    public int? IdCheque { get; set; }
    public int IdBanco { get; set; }
    public string FechaCheque { get; set; } = string.Empty;
    public string NroCheque { get; set; } = string.Empty;
    public decimal Importe { get; set; }
    public int IdMoneda { get; set; }
    public int IdEmpleado { get; set; }
    public int IdEstado { get; set; }
    public string? Ruta { get; set; }
    public string? UsuarioAccion { get; set; }
}

public class ChequeEmpleadoRechazarDto
{
    public int? IdEstadoRechazado { get; set; }
    public string Observacion { get; set; } = string.Empty;
    public string? UsuarioAccion { get; set; }
}

public class ChequeEmpleadoOperacionResultadoDto
{
    public int IdCheque { get; set; }
    public ChequeEmpleadoDto? Row { get; set; }
}
