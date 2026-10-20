namespace CjERP.Application.DTOs;

public class LogisticaMaterialDto
{
    public string CodPap { get; set; } = string.Empty;
    public string? NombreMaterial { get; set; }
    public string? UnidadMedida { get; set; }
    public int? CodEstado { get; set; }
}

/// <summary>Saldos por bucket (cola) de un material. Cada bucket = unidades pendientes de la siguiente etapa.</summary>
public class LogisticaStockDto
{
    public string CodPap { get; set; } = string.Empty;
    public string? NombreMaterial { get; set; }
    public string? UnidadMedida { get; set; }
    public decimal Stock { get; set; }
    public decimal Disponible { get; set; }
    public decimal Bloqueado { get; set; }
    public decimal Solicitado { get; set; }
    public decimal Aprobado { get; set; }
    public decimal Despachado { get; set; }
    public decimal Enviado { get; set; }
    public decimal Campo { get; set; }
    public decimal Cruce { get; set; }
    public decimal Cierre { get; set; }
    public decimal Excedente { get; set; }
    public decimal Folio { get; set; }
    public decimal Culminadas { get; set; }
    public decimal Recepcionado { get; set; }
    public decimal Validado { get; set; }
    public decimal Observada { get; set; }
}

public class LogisticaStockDescuadreDto
{
    public string CodPap { get; set; } = string.Empty;
    public string? NombreMaterial { get; set; }
    public string Bucket { get; set; } = string.Empty;
    public decimal EnMaterialStock { get; set; }
    public decimal EnStockSaldo { get; set; }
    public decimal Diferencia { get; set; }
    public string Tipo { get; set; } = string.Empty;
}
