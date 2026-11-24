namespace CjERP.Application.DTOs;

public sealed class CxcCargaSireRequestDto
{
    public string NombreArchivo { get; set; } = string.Empty;
    public string Contenido { get; set; } = string.Empty;
    /// <summary>true = solo analiza y no graba; false = graba unicamente los registros nuevos.</summary>
    public bool SoloAnalizar { get; set; } = true;
}

public sealed class CxcCargaSireFilaDto
{
    public int Linea { get; set; }
    /// <summary>NUEVO | YA_EXISTE | REPETIDO_EN_ARCHIVO | INVALIDO</summary>
    public string Estado { get; set; } = string.Empty;
    public string? Motivo { get; set; }
    public string CarSunat { get; set; } = string.Empty;
    public DateTime? FechaEmision { get; set; }
    public string? TipoCp { get; set; }
    public string? SerieCp { get; set; }
    public string? NroCp { get; set; }
    public string? NroDocIdentidad { get; set; }
    public string? RazonSocialCliente { get; set; }
    public string? Moneda { get; set; }
    public decimal TotalCp { get; set; }
}

public sealed class CxcCargaSireResponseDto
{
    public bool SoloAnalizar { get; set; }
    public bool Grabado { get; set; }
    public int TotalFilas { get; set; }
    public int Nuevos { get; set; }
    public int YaExisten { get; set; }
    public int RepetidosEnArchivo { get; set; }
    public int Invalidos { get; set; }
    public int Insertados { get; set; }
    public string Mensaje { get; set; } = string.Empty;
    public List<CxcCargaSireFilaDto> Filas { get; set; } = new();
}

public sealed class CxcDocumentoDto
{
    public int IdDocumento { get; set; }
    public string CarSunat { get; set; } = string.Empty;
    public string? Periodo { get; set; }
    public DateTime? FechaEmision { get; set; }
    public DateTime? FechaVencimiento { get; set; }
    public string? TipoCp { get; set; }
    public string? SerieCp { get; set; }
    public string? NroCp { get; set; }
    public string? NroDocIdentidad { get; set; }
    public string? RazonSocialCliente { get; set; }
    public decimal TotalCp { get; set; }
    public string? Moneda { get; set; }
    public decimal? TipoCambio { get; set; }
    public string? ArchivoOrigen { get; set; }
    public DateTime FechaCarga { get; set; }
    public string? UsuarioCarga { get; set; }
}
