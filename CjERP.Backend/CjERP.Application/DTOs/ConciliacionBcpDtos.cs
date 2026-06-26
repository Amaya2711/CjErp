using System.Text.Json.Serialization;

namespace CjERP.Application.DTOs;

public sealed class ConciliacionBcpAnalizarRequestDto
{
    public List<ConciliacionBcpArchivoMuestraDto> Archivos { get; set; } = [];
}

public sealed class ConciliacionBcpArchivoMuestraDto
{
    public string NombreArchivo { get; set; } = string.Empty;

    public string? TipoContenido { get; set; }

    public string? ContenidoBase64 { get; set; }

    public long? TamanoBytes { get; set; }

    public string NombreHoja { get; set; } = string.Empty;

    public int NumeroHoja { get; set; }

    public int TotalFilas { get; set; }

    public List<string> Encabezados { get; set; } = [];

    public List<List<string?>> Filas { get; set; } = [];

    public List<List<string?>> FilasMuestra { get; set; } = [];
}

public sealed class ConciliacionBcpAnalizarResponseDto
{
    public string? Resumen { get; set; }

    public bool PuedeInsertar { get; set; }

    public List<ConciliacionBcpParametroDto> ParametrosProcedimiento { get; set; } = [];

    public List<ConciliacionBcpAnalizarArchivoResponseDto> Archivos { get; set; } = [];

    public ConciliacionBcpDebugAnalisisDto? Debug { get; set; }
}

public sealed class ConciliacionBcpAnalizarArchivoResponseDto
{
    public string NombreArchivo { get; set; } = string.Empty;

    public string NombreHoja { get; set; } = string.Empty;

    public int NumeroHoja { get; set; }

    public int TotalFilas { get; set; }

    public int? FilaCabecera { get; set; }

    public int? FilaDatos { get; set; }

    public bool RequiereRevision { get; set; }

    public string? Observacion { get; set; }

    public List<string> Advertencias { get; set; } = [];

    public List<ConciliacionBcpMapeoColumnaDto> Mapeos { get; set; } = [];

    public List<Dictionary<string, object?>> FilasNormalizadas { get; set; } = [];

    public ConciliacionBcpDebugArchivoDto? Debug { get; set; }
}

public sealed class ConciliacionBcpDebugAnalisisDto
{
    public string? PromptAnalisis { get; set; }

    public List<ConciliacionBcpDebugArchivoEntradaDto> ArchivosEnviados { get; set; } = [];

    public string? RespuestaCrudaIa { get; set; }

    public string? JsonInterpretadoIa { get; set; }
}

public sealed class ConciliacionBcpDebugArchivoEntradaDto
{
    public string NombreArchivo { get; set; } = string.Empty;

    public string? TipoContenido { get; set; }

    public long? TamanoBytes { get; set; }

    public string? NombreHojaDetectadaCliente { get; set; }

    public int NumeroHojaDetectadaCliente { get; set; }

    public int TotalFilasDetectadasCliente { get; set; }

    public List<string> EncabezadosDetectadosCliente { get; set; } = [];

    public List<List<string?>> FilasMuestraCliente { get; set; } = [];
}

public sealed class ConciliacionBcpDebugArchivoDto
{
    public int MovimientosIaDetectados { get; set; }

    public int FilasNormalizadasFinales { get; set; }

    public string? MotivoSinRegistros { get; set; }
}

public sealed class ConciliacionBcpMapeoColumnaDto
{
    public string ColumnaOrigen { get; set; } = string.Empty;

    public string? ParametroDestino { get; set; }

    public decimal Confianza { get; set; }

    public string? Transformacion { get; set; }

    public string? Comentario { get; set; }
}

public sealed class ConciliacionBcpParametroDto
{
    public string Nombre { get; set; } = string.Empty;

    public string Tipo { get; set; } = string.Empty;

    public bool EsSalida { get; set; }

    public bool TieneDefault { get; set; }

    public bool EsObligatorio { get; set; }
}

public sealed class ConciliacionBcpInsertRequestDto
{
    public List<Dictionary<string, object?>> Filas { get; set; } = [];
}

public sealed class ConciliacionBcpExportRequestDto
{
    public ConciliacionBcpAnalizarResponseDto? Analisis { get; set; }
}

public sealed class ConciliacionBcpConciliarPlanillaRequestDto
{
    public int? IdCargo { get; set; }

    public int? IdEmpleado { get; set; }

    public string? Estados { get; set; }

    public DateTime? FechaInicio { get; set; }

    public DateTime? FechaFin { get; set; }

    public int? IdActivo { get; set; }
}

public sealed class ConciliacionBcpConciliarPlanillaResponseDto
{
    public string? Resumen { get; set; }

    public int TotalMovimientos { get; set; }

    public int CoincidenciasPorNroOperacion { get; set; }

    public int CoincidenciasPorCuenta { get; set; }

    public int CoincidenciasPorCuentaInter { get; set; }

    public int SinCoincidencia { get; set; }

    public List<ConciliacionBcpConciliarPlanillaRegistroDto> Registros { get; set; } = [];
}

public sealed class ConciliacionBcpActualizarComentarioRequestDto
{
    public string? Comentario { get; set; }
}

public sealed class ConciliacionBcpConciliarPlanillaRegistroDto
{
    public int IdMovimientoBanco { get; set; }

    public string? Empresa { get; set; }

    public string? Cuenta { get; set; }

    public string? Moneda { get; set; }

    public DateTime? Fecha { get; set; }

    public string? DescripcionOperacion { get; set; }

    public decimal? Monto { get; set; }

    public string? NroOperacion { get; set; }

    public string? SucursalAgencia { get; set; }

    public string? EstadoConciliacion { get; set; }

    public string? TipoMovimientoBanco { get; set; }

    public bool? IdActivo { get; set; }

    public string ResultadoConciliacion { get; set; } = "SIN COINCIDENCIA";

    public string? TipoCoincidencia { get; set; }

    public string? NroOperacionPlanilla { get; set; }

    public string? CuentaPlanilla { get; set; }

    public string? CuentaInterPlanilla { get; set; }

    public string? ClientePlanilla { get; set; }

    public string? ProyectoPlanilla { get; set; }

    public string? SitePlanilla { get; set; }

    public string? TipoTrabajoPlanilla { get; set; }

    public string? TareaPlanilla { get; set; }

    public int? IdRegistroPlanilla { get; set; }

    public decimal? TotalPagar { get; set; }

    public string? Comentario { get; set; }

    public string? ObservacionConciliacion { get; set; }
}

public sealed class ConciliacionBcpExportResponseDto
{
    public string NombreArchivo { get; set; } = "movimientos_consolidados_ordenados_por_operacion.xlsx";

    public int ArchivosProcesados { get; set; }

    public int TotalMovimientos { get; set; }

    public decimal TotalIngresos { get; set; }

    public decimal TotalEgresos { get; set; }

    public decimal Neto { get; set; }

    public int CantidadDuplicadosDetectados { get; set; }

    public bool Insertable { get; set; }

    public List<ConciliacionBcpPromptResumenArchivoDto> ResumenArchivos { get; set; } = [];

    public List<ConciliacionBcpPromptMovimientoDto> Movimientos { get; set; } = [];
}

public sealed class ConciliacionBcpInsertResponseDto
{
    public int FilasRecibidas { get; set; }

    public int FilasInsertadas { get; set; }

    public int FilasOmitidasDuplicadas { get; set; }

    public List<string> Advertencias { get; set; } = [];

    public List<string> Errores { get; set; } = [];
}

public sealed class ConciliacionBcpAnalisisAiResponseDto
{
    public string? Resumen { get; set; }

    public List<ConciliacionBcpAnalizarArchivoAiResponseDto> Archivos { get; set; } = [];
}

public sealed class ConciliacionBcpAnalizarArchivoAiResponseDto
{
    public string? NombreArchivo { get; set; }

    public string? NombreHoja { get; set; }

    public int? NumeroHoja { get; set; }

    public int? FilaCabecera { get; set; }

    public int? FilaDatos { get; set; }

    public bool? RequiereRevision { get; set; }

    public string? Observacion { get; set; }

    public List<string>? Advertencias { get; set; }

    public List<ConciliacionBcpMapeoColumnaDto>? Mapeos { get; set; }

    public List<Dictionary<string, object?>>? FilasNormalizadas { get; set; }
}

public sealed class ConciliacionBcpPromptAnalysisResponseDto
{
    public int ArchivosProcesados { get; set; }

    public int TotalMovimientos { get; set; }

    public List<ConciliacionBcpPromptResumenArchivoDto> ResumenArchivos { get; set; } = [];

    public List<ConciliacionBcpPromptMovimientoDto> Movimientos { get; set; } = [];

    public ConciliacionBcpPromptValidacionesDto? Validaciones { get; set; }
}

public sealed class ConciliacionBcpPromptResumenArchivoDto
{
    public string? ArchivoOrigen { get; set; }

    public string? Empresa { get; set; }

    public string? Cuenta { get; set; }

    public string? Moneda { get; set; }

    public string? TipoCuenta { get; set; }

    public decimal? SaldoLiquido { get; set; }

    public decimal? SaldoNoDisponible { get; set; }

    public decimal? SaldoContable { get; set; }

    public int TotalMovimientos { get; set; }

    public decimal? TotalIngresos { get; set; }

    public decimal? TotalEgresos { get; set; }

    public decimal? Neto { get; set; }
}

public sealed class ConciliacionBcpPromptMovimientoDto
{
    public string? Empresa { get; set; }

    public string? Cuenta { get; set; }

    public string? Moneda { get; set; }

    public string? Fecha { get; set; }

    public string? FechaValuta { get; set; }

    public string? Proveedor { get; set; }

    public string? ItemSistema { get; set; }

    public string? DescripcionOperacion { get; set; }

    public decimal? Monto { get; set; }

    public string? SucursalAgencia { get; set; }

    public string? NumeroOperacion { get; set; }

    public string? Usuario { get; set; }

    public string? ArchivoOrigen { get; set; }
}

public sealed class ConciliacionBcpPromptValidacionesDto
{
    public bool Insertable { get; set; }

    public int TotalArchivosConError { get; set; }

    public List<string> ArchivosConError { get; set; } = [];

    public List<Dictionary<string, object?>> DuplicadosDetectados { get; set; } = [];

    public List<string> Observaciones { get; set; } = [];
}
