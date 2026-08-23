namespace CjERP.Application.DTOs;

public sealed class MigracionImportProcesarNewRequestDto
{
    public string Accion { get; set; } = "VALIDAR";

    public List<MigracionImportProcesarNewFilaDto> Datos { get; set; } = [];
}

public sealed class MigracionImportProcesarNewFilaDto
{
    public int? FilaExcel { get; set; }

    public string? OT { get; set; }

    public string? Cliente { get; set; }

    public string? Proyecto { get; set; }

    public string? IdSite { get; set; }

    public string? Site { get; set; }

    public string? TipoTrabajo { get; set; }

    public string? Status_Atp { get; set; }

    public string? ATP { get; set; }

    public string? Status_Pap { get; set; }

    public string? Estado_Oc { get; set; }

    public string? Nro_Oc { get; set; }

    public string? Posicion { get; set; }

    public decimal? MontoOc { get; set; }

    public decimal? MontoLiq { get; set; }

    public decimal? Monto_Bck { get; set; }

    public string? CenFile { get; set; }

    public string? Status_Gis { get; set; }

    public string? Estado_Ea { get; set; }

    public string? Folio { get; set; }

    public string? Folio2 { get; set; }

    public string? StatusOt { get; set; }

    public string? StatusOt2 { get; set; }

    public string? Zona { get; set; }

    public string? Capitalizacion { get; set; }

    public string? Status_Cj { get; set; }

    public string? Facturado { get; set; }

    public string? PrePasivo { get; set; }

    public string? Proyecto2 { get; set; }

    public string? DiasOn { get; set; }

    public string? AntOn { get; set; }

    public string? Gerencia { get; set; }

    public decimal? AnoGestion { get; set; }

    public int? IdMoneda { get; set; }
}

public sealed class MigracionImportProcesarNewResumenDto
{
    public string Accion { get; set; } = string.Empty;

    public int FilasExcel { get; set; }

    public int RegistrosConsolidados { get; set; }

    public int Coinciden { get; set; }

    public int ConDiferencias { get; set; }

    public int NoEncontrados { get; set; }

    public int Observados { get; set; }

    public int Ambiguos { get; set; }

    public int Actualizados { get; set; }
}

public sealed class MigracionImportProcesarNewDetalleDto
{
    public string EstadoValidacion { get; set; } = string.Empty;

    public string OT { get; set; } = string.Empty;

    public string Cliente { get; set; } = string.Empty;

    public string Proyecto { get; set; } = string.Empty;

    public string IdSite { get; set; } = string.Empty;

    public string Site { get; set; } = string.Empty;

    public string TipoTrabajo { get; set; } = string.Empty;

    public int? IdMoneda { get; set; }

    public int? CantidadFilasExcel { get; set; }

    public string? Estado_Oc { get; set; }

    public string? Nro_Oc { get; set; }

    public string? Posicion { get; set; }

    public decimal? MontoOc { get; set; }

    public decimal? MontoLiq { get; set; }

    public decimal? Monto_Bck { get; set; }

    public decimal? MontoOcActual { get; set; }

    public decimal? MontoLiqActual { get; set; }

    public decimal? MontoBckActual { get; set; }

    public string? Observacion { get; set; }
}

public sealed class MigracionImportProcesarNewResultadoDto
{
    public MigracionImportProcesarNewResumenDto Resumen { get; set; } = new();

    public List<MigracionImportProcesarNewDetalleDto> Detalle { get; set; } = [];

    public List<MigracionImportProcesarNewDetalleDto> Problemas { get; set; } = [];
}
