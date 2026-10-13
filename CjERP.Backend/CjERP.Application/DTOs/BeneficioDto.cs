namespace CjERP.Application.DTOs;

public sealed class BeneficioEmpleadoDto
{
    public int IdEmpleado { get; set; }
    public string? NombreEmpleado { get; set; }
    public string? NroDocumento { get; set; }
    public int? IdAptoBeneficio { get; set; }
}

public sealed class BeneficioListItemDto
{
    public long IdBeneficio { get; set; }
    public int IdTipoBeneficio { get; set; }
    public string? TipoBeneficio { get; set; }
    public int IdEmpleado { get; set; }
    public string? NombreEmpleado { get; set; }
    public string? NroDocumento { get; set; }
    public decimal Monto { get; set; }
    public int Meses { get; set; }
    public DateTime? MesInicio { get; set; }
    public DateTime? FechaCreacion { get; set; }
    public int? IdEstado { get; set; }
    /// <summary>Empresa del empleado (Constante EMPRESA_CJ).</summary>
    public string? NombreCliente { get; set; }
    public int? IdAprobado { get; set; }
    public string? TxtAprobado { get; set; }
    public int? IdAprobador { get; set; }
    public string? Aprobador { get; set; }
    public DateTime? FechaAprobador { get; set; }
}

public sealed class BeneficioCuotaDto
{
    public long IdBeneficio { get; set; }
    public string? MesPago { get; set; }
    public decimal Monto { get; set; }
    public int? IdEstado { get; set; }
}

public sealed class BeneficioRegistrarRequestDto
{
    /// <summary>1 = Préstamo, 2 = Adelanto de sueldo.</summary>
    public int IdTipoBeneficio { get; set; }
    public int IdEmpleado { get; set; }
    public decimal Monto { get; set; }
    public int Meses { get; set; } = 1;
    public DateTime MesInicio { get; set; }
}

public sealed class BeneficioRegistrarResultDto
{
    public long IdBeneficio { get; set; }
}

public sealed class BeneficioAccionRequestDto
{
    public List<long> IdsBeneficio { get; set; } = new();
}

public sealed class BeneficioAccionItemResultDto
{
    public long IdBeneficio { get; set; }
    public bool Procesado { get; set; }
    public string? Mensaje { get; set; }
    /// <summary>Solo al aprobar: null = no aplica / no se intentó.</summary>
    public bool? CorreoEnviado { get; set; }
    public string? CorreoMensaje { get; set; }
}
