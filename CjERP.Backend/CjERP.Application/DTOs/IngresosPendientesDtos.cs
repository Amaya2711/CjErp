namespace CjERP.Application.DTOs;

/// <summary>
/// Ingreso bancario pendiente de aplicar a facturas (portal CxC, pestana INGRESO).
/// Regla: movimiento conciliado, Monto &gt; 0, Area Flujo "INGRESOS OP" y saldo por aplicar &gt; 0.
/// </summary>
public sealed class IngresoPendienteDto
{
    public int IdMovimientoBanco { get; set; }

    public int IdBanco { get; set; }

    public string? CodigoBanco { get; set; }

    public string? Empresa { get; set; }

    public string? Cuenta { get; set; }

    public string? Moneda { get; set; }

    public DateTime? Fecha { get; set; }

    public string? NroOperacion { get; set; }

    public string? DescripcionOperacion { get; set; }

    /// <summary>Importe del ingreso en su moneda original (sin conversion).</summary>
    public decimal Monto { get; set; }

    /// <summary>Monto menos lo ya aplicado a facturas. Mientras no exista la tabla de aplicaciones, es igual al Monto.</summary>
    public decimal SaldoPorAplicar { get; set; }

    public string? AreaFlujo { get; set; }

    public DateTime? FechaConciliacion { get; set; }

    public string? UsuarioConciliacion { get; set; }
}

public sealed class IngresosPendientesResponseDto
{
    public List<IngresoPendienteDto> Ingresos { get; set; } = [];

    public int Total { get; set; }
}
