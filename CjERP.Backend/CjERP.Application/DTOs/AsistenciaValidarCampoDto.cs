using System.Text.Json.Serialization;

namespace CjERP.Application.DTOs;

public class AsistenciaValidarCampoFiltroDto
{
    public string? Responsable { get; set; }
    public string? Empleado { get; set; }
    public string? Estado { get; set; }
    public string? FechaDesde { get; set; }
    public string? FechaHasta { get; set; }
    public string? Search { get; set; }
}

public class AsistenciaValidarCampoClaveDto
{
    public int? IdAsistencia { get; set; }
    public int? IdEmpleado { get; set; }
    public string? FechaAsistencia { get; set; }
}

public class AsistenciaValidarCampoGuardarDto
{
    public int? IdAsistencia { get; set; }
    public int? IdEmpleado { get; set; }
    public string FechaAsistencia { get; set; } = string.Empty;
    public string? Responsable { get; set; }
    public string? Empleado { get; set; }
    public string? Estado { get; set; }
    public string? Ingreso { get; set; }
    public string? Salida { get; set; }
    public string? Observacion { get; set; }
    public string? Latitud { get; set; }
    public string? Longitud { get; set; }
    public string? LatitudSalida { get; set; }
    public string? LongitudSalida { get; set; }
    public string? Imagen { get; set; }
    public string? ImagenSalida { get; set; }
    public string? UsuarioAccion { get; set; }
}

public class AsistenciaValidarCampoAccionDto : AsistenciaValidarCampoClaveDto
{
    public string Observacion { get; set; } = string.Empty;
    public int? IdAprobador { get; set; }
    public string? UsuarioAccion { get; set; }
}

public class AsistenciaValidarCampoListaDto
{
    public List<string> Columns { get; set; } = [];
    public List<Dictionary<string, object?>> Rows { get; set; } = [];
}

public class AsistenciaValidarCampoOperacionResultadoDto
{
    public string IdRegistro { get; set; } = string.Empty;
    public Dictionary<string, object?>? Row { get; set; }
}
