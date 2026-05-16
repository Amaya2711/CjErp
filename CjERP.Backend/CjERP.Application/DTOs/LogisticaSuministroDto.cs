namespace CjERP.Application.DTOs;

public class LogisticaSuministroBuscarRequestDto
{
    public long? IdProvisional { get; set; }
    public int? IdCliente { get; set; }
    public int? IdProyecto { get; set; }
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
    public string? ImagenUrl { get; set; }
    public string? ImagenPath { get; set; }
}

public class LogisticaSuministroUpdateRequestDto
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
