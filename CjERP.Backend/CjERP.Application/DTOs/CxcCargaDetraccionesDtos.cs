namespace CjERP.Application.DTOs;

public sealed class CxcCargaDetraccionesRequestDto
{
    public string NombreArchivo { get; set; } = string.Empty;
    public string Contenido { get; set; } = string.Empty;
    /// <summary>true = solo analiza y no graba; false = graba unicamente las detracciones nuevas.</summary>
    public bool SoloAnalizar { get; set; } = true;
}

public sealed class CxcCargaDetraccionFilaDto
{
    public int Linea { get; set; }
    /// <summary>NUEVO | YA_EXISTE | REPETIDO_EN_ARCHIVO | INVALIDO | OMITIDO_COMPRA</summary>
    public string Estado { get; set; } = string.Empty;
    public string? Motivo { get; set; }
    /// <summary>Avisos que no bloquean (sin factura en el SIRE, posible deposito duplicado).</summary>
    public string? Aviso { get; set; }
    public string NumeroConstancia { get; set; } = string.Empty;
    public DateTime? FechaPago { get; set; }
    public decimal MontoDeposito { get; set; }
    public string? RucCliente { get; set; }
    public string? Cliente { get; set; }
    public string? TipoComprobante { get; set; }
    public string? SerieComprobante { get; set; }
    public string? NumeroComprobante { get; set; }
    public string? NumeroCuenta { get; set; }
    public bool FacturaEnSire { get; set; }
}

public sealed class CxcCargaDetraccionesResponseDto
{
    public bool SoloAnalizar { get; set; }
    public bool Grabado { get; set; }
    public int TotalFilas { get; set; }
    public int Nuevos { get; set; }
    public int YaExisten { get; set; }
    public int RepetidosEnArchivo { get; set; }
    public int Invalidos { get; set; }
    public int OmitidosCompra { get; set; }
    public int SinFacturaSire { get; set; }
    public int PosiblesDuplicados { get; set; }
    public int Insertados { get; set; }
    public string Mensaje { get; set; } = string.Empty;
    public List<CxcCargaDetraccionFilaDto> Filas { get; set; } = new();
}

public sealed class CxcDetraccionDto
{
    public int IdDetraccion { get; set; }
    public string NumeroConstancia { get; set; } = string.Empty;
    public DateTime? FechaPago { get; set; }
    public decimal MontoDeposito { get; set; }
    public string? NroDocAdquiriente { get; set; }
    public string? NombreAdquiriente { get; set; }
    public string? TipoComprobante { get; set; }
    public string? SerieComprobante { get; set; }
    public string? NumeroComprobante { get; set; }
    public string? PeriodoTributario { get; set; }
    public string? NumeroCuenta { get; set; }
    public int? IdDocumento { get; set; }
    public string? Observacion { get; set; }
    public string? ArchivoOrigen { get; set; }
    public DateTime FechaCarga { get; set; }
    public string? UsuarioCarga { get; set; }
}
