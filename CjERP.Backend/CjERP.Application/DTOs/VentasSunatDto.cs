namespace CjERP.Application.DTOs;

/// <summary>Fila del Registro de Ventas SIRE (Excel). Una carga corresponde a un solo Periodo (AAAAMM) y RUC emisor.</summary>
public class VentasSunatFilaDto
{
    public string? RucEmisor { get; set; }
    public string? RazonSocialEmisor { get; set; }
    public string? Periodo { get; set; }
    public string? CarSunat { get; set; }
    public DateTime? FechaEmision { get; set; }
    public DateTime? FechaVcto { get; set; }
    public string? TipoCp { get; set; }
    public string? Serie { get; set; }
    public string? NroCp { get; set; }
    public string? NroFinal { get; set; }
    public string? TipoDocIdentidad { get; set; }
    public string? NroDocIdentidad { get; set; }
    public string? RazonSocial { get; set; }
    public decimal? ValorFacturadoExportacion { get; set; }
    public decimal? BiGravada { get; set; }
    public decimal? DsctoBi { get; set; }
    public decimal? Igv { get; set; }
    public decimal? DsctoIgv { get; set; }
    public decimal? MtoExonerado { get; set; }
    public decimal? MtoInafecto { get; set; }
    public decimal? Isc { get; set; }
    public decimal? BiGravIvap { get; set; }
    public decimal? Ivap { get; set; }
    public decimal? Icbper { get; set; }
    public decimal? OtrosTributos { get; set; }
    public decimal? TotalCp { get; set; }
    public string? Moneda { get; set; }
    public decimal? TipoCambio { get; set; }
    public DateTime? FecEmisionDocMod { get; set; }
    public string? TipoCpMod { get; set; }
    public string? SerieCpMod { get; set; }
    public string? NroCpMod { get; set; }
    public string? IdProyectoOperadores { get; set; }
    public string? TipoNota { get; set; }
    public string? EstComp { get; set; }
    public decimal? ValorFobEmbarcado { get; set; }
    public decimal? ValorOpGratuitas { get; set; }
    public string? TipoOperacion { get; set; }
    public string? DamCp { get; set; }
    public string? Clu { get; set; }
}

public sealed class VentasSunatRegistroDto : VentasSunatFilaDto
{
    public long IdVentaSunat { get; set; }
    public int? IdEmpresa { get; set; }
    public int? IdCliente { get; set; }

    /// <summary>
    /// Empresa de venta: RucEmisor = Constante.Adicional del campo EMPRESA_cj; Empresa = su ValorIni e IdEmpresa = su Correlativo.
    /// Se calcula al validar y se graba en dbo.VentasSunat (Empresa, IdEmpresa).
    /// </summary>
    public string? Empresa { get; set; }

    /// <summary>NombreCliente de dbo.Cliente para el IdCliente asignado (NroDocIdentidad = Cliente.NroDocumento).</summary>
    public string? NombreCliente { get; set; }
}

public sealed class VentasSunatCargarRequestDto
{
    public List<VentasSunatFilaDto> Datos { get; set; } = new();
}

public sealed class VentasSunatValidarRequestDto
{
    public Guid Lote { get; set; }
}

public sealed class VentasSunatCargaResultDto
{
    public Guid Lote { get; set; }
    public string Periodo { get; set; } = string.Empty;
    public int Insertados { get; set; }
    public int Reemplazados { get; set; }
}

public sealed class VentasSunatValidacionResumenDto
{
    public int TotalFilas { get; set; }
    public int ClienteAsignado { get; set; }
    public int SinCliente { get; set; }
}

public sealed class VentasSunatValidacionResultDto
{
    public VentasSunatValidacionResumenDto Resumen { get; set; } = new();
    public IReadOnlyList<VentasSunatRegistroDto> Registros { get; set; } = Array.Empty<VentasSunatRegistroDto>();
}

/// <summary>Historial de un periodo ya cargado (si existe): datos de la carga y sus registros con IdCliente / IdEmpresa / Empresa.</summary>
public sealed class VentasSunatHistorialDto
{
    public bool Existe { get; set; }
    public int Cantidad { get; set; }
    public Guid? Lote { get; set; }
    public DateTime? FechaCarga { get; set; }
    public string? UsuarioCarga { get; set; }
    public IReadOnlyList<VentasSunatRegistroDto> Registros { get; set; } = Array.Empty<VentasSunatRegistroDto>();
}

/// <summary>Periodo ya cargado (un renglon por Periodo + RUC emisor) para el Historial de la pantalla.</summary>
public sealed class VentasSunatPeriodoDto
{
    public string Periodo { get; set; } = string.Empty;
    public string RucEmisor { get; set; } = string.Empty;
    public int Cantidad { get; set; }
    public DateTime? FechaCarga { get; set; }
    public Guid? Lote { get; set; }
    public string? UsuarioCarga { get; set; }
}

/// <summary>Cliente de dbo.Cliente (IdCliente, NroDocumento = RUC o DNI, NombreCliente) para agrupar costos por cliente.</summary>
public sealed class VentasSunatClienteDto
{
    public int IdCliente { get; set; }
    public string? NroDocumento { get; set; }
    public string? NombreCliente { get; set; }
}
