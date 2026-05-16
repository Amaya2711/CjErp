namespace CjERP.Application.DTOs;

public class LogisticaRecojoBuscarRequestDto
{
    public int? IdRecojo { get; set; }
    public int? IdCliente { get; set; }
    public int? IdProyecto { get; set; }
    public string? IdSite { get; set; }
    public int? Correlativo { get; set; }
    public string? Solicitud { get; set; }
    public string? Clave { get; set; }
    public int? IdEmpresa { get; set; }
    public string? NroGuia { get; set; }
    public int? IdUbigeo { get; set; }
    public int? IdResponsable { get; set; }
    public int? IdResponsableRecojo { get; set; }
    public bool? EsActivo { get; set; }
}

public class LogisticaRecojoInsertRequestDto
{
    public int IdCliente { get; set; }
    public int IdProyecto { get; set; }
    public string IdSite { get; set; } = string.Empty;
    public int Correlativo { get; set; }
    public string Solicitud { get; set; } = string.Empty;
    public string Clave { get; set; } = string.Empty;
    public int? IdEmpresa { get; set; }
    public string NroGuia { get; set; } = string.Empty;
    public int? IdUbigeo { get; set; }
    public string DetalleUbigeo { get; set; } = string.Empty;
    public DateTime? FechaSalida { get; set; }
    public DateTime? FechaLlegada { get; set; }
    public string Observacion { get; set; } = string.Empty;
    public int? IdResponsable { get; set; }
    public DateTime? FechaRecojo { get; set; }
    public string RutaImagenGuia { get; set; } = string.Empty;
    public int? IdResponsableRecojo { get; set; }
    public string UsuarioCreacion { get; set; } = string.Empty;
}

public class LogisticaRecojoDto
{
    public int IdRecojo { get; set; }
    public int IdCliente { get; set; }
    public string NombreCliente { get; set; } = string.Empty;
    public int IdProyecto { get; set; }
    public string NombreProyecto { get; set; } = string.Empty;
    public string IdSite { get; set; } = string.Empty;
    public int Correlativo { get; set; }
    public string NombreSite { get; set; } = string.Empty;
    public string Solicitud { get; set; } = string.Empty;
    public string Clave { get; set; } = string.Empty;
    public int? IdEmpresa { get; set; }
    public string Agencia { get; set; } = string.Empty;
    public string NroGuia { get; set; } = string.Empty;
    public int? IdUbigeo { get; set; }
    public string NombreUbigeo { get; set; } = string.Empty;
    public string DetalleUbigeo { get; set; } = string.Empty;
    public DateTime? FechaSalida { get; set; }
    public DateTime? FechaLlegada { get; set; }
    public string Observacion { get; set; } = string.Empty;
    public int? IdResponsable { get; set; }
    public string Responsable { get; set; } = string.Empty;
    public DateTime? FechaRecojo { get; set; }
    public string RutaImagenGuia { get; set; } = string.Empty;
    public int? IdResponsableRecojo { get; set; }
    public string ResponsableOtro { get; set; } = string.Empty;
    public string UsuarioCreacion { get; set; } = string.Empty;
    public DateTime? FechaCreacion { get; set; }
    public string UsuarioActualizacion { get; set; } = string.Empty;
    public DateTime? FechaActualizacion { get; set; }
    public string UsuarioEliminacion { get; set; } = string.Empty;
    public DateTime? FechaEliminacion { get; set; }
    public bool EsActivo { get; set; }
}
