namespace CjERP.Application.DTOs;

public class LogisticaSuministroBuscarRequestDto
{
    public long? IdProvisional { get; set; }
    public int? IdCliente { get; set; }
    public int? IdProyecto { get; set; }
    public DateTime? FechaInicio { get; set; }
    public DateTime? FechaFin { get; set; }
}

public class LogisticaSuministroInsertRequestDto
{
    public int IdCliente { get; set; }
    public int IdProyecto { get; set; }
    public string IdSite { get; set; } = string.Empty;
    public int? Correlativo { get; set; }
    public string? TipoTrabajo { get; set; }
    public string? Ot { get; set; }
    public int? IdTarea { get; set; }
    public DateTime? FechaInicio { get; set; }
    public int? IdAprobador { get; set; }
    public string? Comentario { get; set; }
    public decimal? Monto { get; set; }
    public int? IdMoneda { get; set; }
    public int? IdEnergia { get; set; }
    public int? IdEmpresa { get; set; }
    public int? IdEstado { get; set; }
    public decimal? MontoClaro { get; set; }
    public decimal? MontoCj { get; set; }
    public DateTime? FechaOnAir { get; set; }
    public string? Observacion { get; set; }
    public DateTime? FechaCnx { get; set; }
    public string? NroSuministro { get; set; }
    public DateTime? FechaEnvioEmail { get; set; }
    public DateTime? FechaDesembolsoClaro { get; set; }
    public int? ValidacionCliente { get; set; }
    public string? Ceco { get; set; }
    public string? Cege { get; set; }
    public string? ImagenUrl { get; set; }
    public string? ImagenPath { get; set; }
}

public class LogisticaSuministroUpdateRequestDto
{
    public long? IdProvisional { get; set; }
    public int IdCliente { get; set; }
    public int IdProyecto { get; set; }
    public string IdSite { get; set; } = string.Empty;
    public int? Correlativo { get; set; }
    public string? TipoTrabajo { get; set; }
    public string? Ot { get; set; }
    public int? IdTarea { get; set; }
    public DateTime? FechaInicio { get; set; }
    public int? IdAprobador { get; set; }
    public string? Comentario { get; set; }
    public decimal? Monto { get; set; }
    public int? IdMoneda { get; set; }
    public int? IdEnergia { get; set; }
    public int? IdEmpresa { get; set; }
    public int? IdEstado { get; set; }
    public decimal? MontoClaro { get; set; }
    public decimal? MontoCj { get; set; }
    public DateTime? FechaOnAir { get; set; }
    public string? Observacion { get; set; }
    public DateTime? FechaCnx { get; set; }
    public string? NroSuministro { get; set; }
    public DateTime? FechaEnvioEmail { get; set; }
    public DateTime? FechaDesembolsoClaro { get; set; }
    public int? ValidacionCliente { get; set; }
    public string? Ceco { get; set; }
    public string? Cege { get; set; }
    public string? ImagenUrl { get; set; }
    public string? ImagenPath { get; set; }
}

public class LogisticaSuministroDto
{
    public int? IdSuministro { get; set; }
    public int? IdSuministroProvisional { get; set; }
    public int? IdCliente { get; set; }
    public string? NombreCliente { get; set; }
    public int? IdProyecto { get; set; }
    public string? NombreProyecto { get; set; }
    public string? IdSite { get; set; }
    public string? NombreSite { get; set; }
    public int? Correlativo { get; set; }
    public string? TipoTrabajo { get; set; }
    public string? Ot { get; set; }
    public int? IdTarea { get; set; }
    public string? Tarea { get; set; }
    public DateTime? FechaInicio { get; set; }
    public int? IdAprobador { get; set; }
    public string? Aprobador { get; set; }
    public string? Comentario { get; set; }
    public decimal? Monto { get; set; }
    public int? IdMoneda { get; set; }
    public string? Moneda { get; set; }
    public int? IdEnergia { get; set; }
    public string? Tarifa { get; set; }
    public int? IdEmpresa { get; set; }
    public string? Empresa { get; set; }
    public int? IdEstado { get; set; }
    public decimal? MontoClaro { get; set; }
    public decimal? MontoCj { get; set; }
    public DateTime? FechaOnAir { get; set; }
    public string? Observacion { get; set; }
    public DateTime? FechaCnx { get; set; }
    public string? NroSuministro { get; set; }
    public string? EstadoSuministro { get; set; }
    public int? ValidacionCliente { get; set; }
    public string? Validacion { get; set; }
    public DateTime? FechaEnvioEmail { get; set; }
    public DateTime? FechaDesembolsoClaro { get; set; }
    public string? Ceco { get; set; }
    public string? Cege { get; set; }
    public string? ImagenUrl { get; set; }
    public string? ImagenPath { get; set; }
    public bool? EsActivo { get; set; }
    public string? UsuarioCreacion { get; set; }
    public DateTime? FechaCreacion { get; set; }
    public string? UsuarioActualizacion { get; set; }
    public DateTime? FechaActualizacion { get; set; }
    public string? UsuarioEliminacion { get; set; }
    public DateTime? FechaEliminacion { get; set; }
}

public class LogisticaSuministroKpiDto
{
    public decimal? TotalPagadoMes { get; set; }
    public decimal? TotalReembolsadoMes { get; set; }
    public decimal? SaldoPendienteReembolso { get; set; }
    public int? SuministrosProvisionalesActivos { get; set; }
    public int? CasosRiesgoMedio { get; set; }
    public int? CasosRiesgoCritico { get; set; }
    public decimal? PorcentajePagosValidacionPrevia { get; set; }
    public decimal? IndiceRecupero { get; set; }
}
