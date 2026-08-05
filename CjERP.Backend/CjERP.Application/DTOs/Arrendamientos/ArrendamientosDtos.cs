namespace CjERP.Application.DTOs.Arrendamientos;

// ROLLBACK-MARKER: ARRRENDAMIENTOS DTOS START

public sealed class ArrendamientosFilaDto
{
    public int? Id { get; set; }
    public string? Codigo { get; set; }
    public string? Nombre { get; set; }
    public string? Detalle { get; set; }
    public string? Estado { get; set; }
    public string? TipoPago { get; set; }
    public string? Moneda { get; set; }
    public string? MonedaAlquiler { get; set; }
    public string? MonedaMantenimiento { get; set; }
    public string? MonedaCochera { get; set; }
    public string? MonedaGarantia { get; set; }
    public decimal? Importe { get; set; }
    public decimal? ImporteAlquiler { get; set; }
    public decimal? ImporteMantenimiento { get; set; }
    public decimal? ImporteCochera { get; set; }
    public decimal? ImporteTransferido { get; set; }
    public decimal? ComisionBancaria { get; set; }
    public decimal? Itf { get; set; }
    public decimal? ImporteTotalCargado { get; set; }
    public decimal? ImporteOriginal { get; set; }
    public decimal? ImporteConvertido { get; set; }
    public decimal? DiferenciaCambio { get; set; }
    public decimal? Saldo { get; set; }
    public string? Fecha { get; set; }
    public string? FechaContabilizacion { get; set; }
    public string? FechaInicio { get; set; }
    public string? FechaFin { get; set; }
    public string? Arrendador { get; set; }
    public string? Inquilino { get; set; }
    public string? Inmueble { get; set; }
    public string? Unidad { get; set; }
    public string? Concepto { get; set; }
    public string? Periodo { get; set; }
    public string? Responsable { get; set; }
    public string? ConceptoPago { get; set; }
    public string? Observacion { get; set; }
    public string? Tipo { get; set; }
}

public sealed class ArrendamientosDashboardDto
{
    public int ArrendadoresActivos { get; set; }
    public int InquilinosActivos { get; set; }
    public int ContratosVigentes { get; set; }
    public int ObligacionesPendientes { get; set; }
    public decimal TotalPendientePEN { get; set; }
    public decimal TotalPendienteUSD { get; set; }
    public decimal PagosMesPEN { get; set; }
    public decimal PagosMesUSD { get; set; }
}

public sealed class ArrendamientosCommandResultDto
{
    public bool Success { get; set; } = true;
    public string Message { get; set; } = "Ok";
    public int? Id { get; set; }
    public int? IdSecundario { get; set; }
    public int? IdVersion { get; set; }
}

public class ArrendamientosCatalogoRequestDto
{
    public int? Id { get; set; }
    public string Codigo { get; set; } = string.Empty;
    public string Nombre { get; set; } = string.Empty;
    public string? Detalle { get; set; }
    public string? Estado { get; set; }
    public int? IdEmpleadoResponsable { get; set; }
    public string? Observacion { get; set; }
}

public sealed class ArrendamientosInmuebleRequestDto : ArrendamientosCatalogoRequestDto
{
    public string? TipoInmueble { get; set; }
    public string? Direccion { get; set; }
    public string? Ubigeo { get; set; }
    public string? Referencia { get; set; }
}

public sealed class ArrendamientosUnidadRequestDto : ArrendamientosCatalogoRequestDto
{
    public int IdInmueble { get; set; }
    public string? TipoUnidad { get; set; }
    public string? Piso { get; set; }
    public decimal? AreaM2 { get; set; }
}

public sealed class ArrendamientosContratoRequestDto
{
    public int? IdContrato { get; set; }
    public string CodigoContrato { get; set; } = string.Empty;
    public int IdArrendador { get; set; }
    public int IdInquilino { get; set; }
    public int IdInmueble { get; set; }
    public int? IdUnidadPrincipal { get; set; }
    public DateOnly? FechaFirma { get; set; }
    public DateOnly FechaInicio { get; set; }
    public DateOnly FechaFin { get; set; }
    public string Moneda { get; set; } = "PEN";
    public string MonedaAlquiler { get; set; } = "PEN";
    public string MonedaMantenimiento { get; set; } = "PEN";
    public string MonedaCochera { get; set; } = "PEN";
    public string MonedaGarantia { get; set; } = "PEN";
    public decimal ImporteAlquiler { get; set; }
    public string? PeriodicidadAlquiler { get; set; }
    public int DiaLimitePago { get; set; } = 5;
    public int DiasGracia { get; set; }
    public decimal ImporteMantenimiento { get; set; }
    public string? PeriodicidadMantenimiento { get; set; }
    public int DiaLimiteMantenimiento { get; set; } = 5;
    public decimal ImporteCochera { get; set; }
    public string? PeriodicidadCochera { get; set; }
    public int DiaLimiteCochera { get; set; } = 5;
    public decimal GarantiaPactada { get; set; }
    public decimal GarantiaPagada { get; set; }
    public decimal GarantiaPendiente { get; set; }
    public string? TipoReajuste { get; set; }
    public decimal? PorcentajeReajuste { get; set; }
    public string? FormulaReajuste { get; set; }
    public string? FrecuenciaReajuste { get; set; }
    public decimal PenalidadMora { get; set; }
    public decimal InteresMoratorio { get; set; }
    public string EstadoContrato { get; set; } = "ACTIVO";
    public string? Observaciones { get; set; }
    public string? DocumentoFirmadoNombre { get; set; }
    public string? DocumentoFirmadoUrl { get; set; }
    public decimal? DocumentoFirmadoTamanoKB { get; set; }
    public int? IdEmpleadoResponsable { get; set; }
    public DateOnly? FechaSuspension { get; set; }
    public DateOnly? FechaCancelacion { get; set; }
    public string? MotivoCancelacion { get; set; }
    public bool Activo { get; set; } = true;
}

public sealed class ArrendamientosContratoUnidadRequestDto
{
    public int? IdContratoUnidad { get; set; }
    public int IdContrato { get; set; }
    public int IdUnidad { get; set; }
    public DateOnly FechaInicio { get; set; }
    public DateOnly? FechaFin { get; set; }
    public decimal? AreaM2 { get; set; }
    public decimal? CanonMensual { get; set; }
    public string Estado { get; set; } = "ACTIVO";
    public string? Observacion { get; set; }
}

public sealed class ArrendamientosObligacionGenerarItemDto
{
    public int IdContrato { get; set; }
    public int? IdContratoVersion { get; set; }
    public int? IdUnidad { get; set; }
    public int IdConcepto { get; set; }
    public DateOnly PeriodoDesde { get; set; }
    public DateOnly PeriodoHasta { get; set; }
    public DateOnly FechaEmision { get; set; }
    public DateOnly FechaVencimiento { get; set; }
    public string Moneda { get; set; } = "PEN";
    public decimal? TipoCambio { get; set; }
    public decimal ImporteOriginal { get; set; }
    public decimal? ImporteConvertido { get; set; }
    public decimal? Interes { get; set; }
    public decimal? Penalidad { get; set; }
    public decimal? Descuento { get; set; }
    public decimal? Ajuste { get; set; }
    public string? Observacion { get; set; }
    public bool EsGeneradaAutomaticamente { get; set; } = true;
}

public sealed class ArrendamientosObligacionGenerarRequestDto
{
    public List<ArrendamientosObligacionGenerarItemDto> Obligaciones { get; set; } = [];
}

public sealed class ArrendamientosPagoRequestDto
{
    public int? IdPago { get; set; }
    public string NumeroOperacion { get; set; } = string.Empty;
    public DateOnly FechaOperacion { get; set; }
    public DateOnly? FechaContabilizacion { get; set; }
    public int IdInquilino { get; set; }
    public int IdArrendador { get; set; }
    public int? IdEmpleadoRegistrador { get; set; }
    public string? CuentaOrigen { get; set; }
    public string? CuentaDestino { get; set; }
    public string? Banco { get; set; }
    public string MonedaOperacion { get; set; } = "PEN";
    public string TipoPago { get; set; } = "COMPLETO";
    public string ConceptoPago { get; set; } = "ALQUILER";
    public decimal? TipoCambio { get; set; }
    public decimal ImporteTransferido { get; set; }
    public decimal ComisionBancaria { get; set; }
    public decimal Itf { get; set; }
    public decimal ImporteTotalCargado { get; set; }
    public decimal ImporteOriginal { get; set; }
    public decimal ImporteConvertido { get; set; }
    public decimal DiferenciaCambio { get; set; }
    public string? TipoTransferencia { get; set; }
    public string? ConceptoBanco { get; set; }
    public string? Observacion { get; set; }
    public string? VoucherNombre { get; set; }
    public string? VoucherExtension { get; set; }
    public long? VoucherTamanoBytes { get; set; }
    public string? VoucherRuta { get; set; }
    public string? VoucherUrl { get; set; }
}

public sealed class ArrendamientosPagoAprobacionRequestDto
{
    public int NivelAprobacion { get; set; } = 1;
    public bool Aprobado { get; set; } = true;
    public int? IdEmpleadoAprobador { get; set; }
    public string? Observacion { get; set; }
}

public sealed class ArrendamientosPagoAplicacionItemDto
{
    public int IdObligacion { get; set; }
    public int? IdConcepto { get; set; }
    public string MonedaAplicacion { get; set; } = "PEN";
    public decimal? TipoCambioAplicado { get; set; }
    public decimal ImporteAplicado { get; set; }
    public decimal? ImporteCapital { get; set; }
    public decimal? ImporteInteres { get; set; }
    public decimal? ImportePenalidad { get; set; }
    public decimal? ImporteDescuento { get; set; }
    public decimal? ImporteAjuste { get; set; }
}

public sealed class ArrendamientosPagoAplicacionRequestDto
{
    public List<ArrendamientosPagoAplicacionItemDto> Aplicaciones { get; set; } = [];
}

public sealed class ArrendamientosPagoRevertirRequestDto
{
    public string? Observacion { get; set; }
}

public sealed class ArrendamientosFraccionamientoRequestDto
{
    public string NumeroFraccionamiento { get; set; } = string.Empty;
    public int IdInquilino { get; set; }
    public int IdContrato { get; set; }
    public DateOnly FechaFraccionamiento { get; set; }
    public decimal ImporteTotalFraccionado { get; set; }
    public string Moneda { get; set; } = "PEN";
    public int CantidadCuotas { get; set; }
    public DateOnly FechaInicial { get; set; }
    public string Periodicidad { get; set; } = "MENSUAL";
    public decimal ImportePorCuota { get; set; }
    public decimal? CuotaFinalDiferente { get; set; }
    public decimal InteresFraccionamiento { get; set; }
    public string Estado { get; set; } = "PENDIENTE";
    public string? Motivo { get; set; }
    public string? DocumentoAceptacionNombre { get; set; }
    public string? DocumentoAceptacionUrl { get; set; }
    public int? IdEmpleadoAprueba { get; set; }
}

public sealed class ArrendamientosGarantiaRequestDto
{
    public int? IdGarantia { get; set; }
    public int IdContrato { get; set; }
    public int IdInquilino { get; set; }
    public decimal GarantiaPactada { get; set; }
    public decimal GarantiaPagada { get; set; }
    public decimal GarantiaParcialPagada { get; set; }
    public decimal GarantiaPendiente { get; set; }
    public decimal GarantiaAplicadaDeudas { get; set; }
    public decimal GarantiaDevuelta { get; set; }
    public decimal GarantiaRetenida { get; set; }
    public decimal GarantiaEjecutada { get; set; }
    public DateOnly? FechaDevolucion { get; set; }
    public string? MotivoRetencion { get; set; }
    public string? DocumentosSustentatorios { get; set; }
    public string Estado { get; set; } = "VIGENTE";
}

public sealed class ArrendamientosCobranzaGestionRequestDto
{
    public int IdContrato { get; set; }
    public int IdInquilino { get; set; }
    public int? IdObligacion { get; set; }
    public string TipoGestion { get; set; } = string.Empty;
    public string? ResultadoGestion { get; set; }
    public DateOnly? CompromisoPagoFecha { get; set; }
    public decimal? CompromisoPagoImporte { get; set; }
    public string Estado { get; set; } = "ABIERTA";
    public string? Contacto { get; set; }
    public string? Observacion { get; set; }
    public int? IdEmpleadoGestor { get; set; }
}

public sealed class ArrendamientosArbitrioDetalleDto
{
    public int Anio { get; set; }
    public int Mes { get; set; }
    public DateOnly PeriodoDesde { get; set; }
    public DateOnly PeriodoHasta { get; set; }
    public decimal Importe { get; set; }
    public string? Estado { get; set; }
    public string? Observacion { get; set; }
}

public sealed class ArrendamientosArbitrioRequestDto
{
    public int? IdArbitrio { get; set; }
    public int IdContrato { get; set; }
    public int IdInmueble { get; set; }
    public int? IdUnidad { get; set; }
    public string Periodicidad { get; set; } = "ANUAL";
    public decimal MontoAnual { get; set; }
    public string Moneda { get; set; } = "PEN";
    public DateOnly FechaInicio { get; set; }
    public DateOnly? FechaFin { get; set; }
    public bool AplicaAreaComun { get; set; }
    public bool AplicaLocalPropio { get; set; } = true;
    public string Estado { get; set; } = "ACTIVO";
    public string? Observacion { get; set; }
    public List<ArrendamientosArbitrioDetalleDto> Detalles { get; set; } = [];
}

public sealed class ArrendamientosTipoCambioRequestDto
{
    public int? IdTipoCambioDiario { get; set; }
    public DateOnly FechaTipoCambio { get; set; }
    public string MonedaOrigen { get; set; } = "USD";
    public string MonedaDestino { get; set; } = "PEN";
    public decimal Compra { get; set; }
    public decimal Venta { get; set; }
    public string? Fuente { get; set; }
    public bool EsManual { get; set; }
    public bool Activo { get; set; } = true;
    public string? Observacion { get; set; }
}

public sealed class ArrendamientosEstadoCuentaFiltroDto
{
    public int? IdContrato { get; set; }
    public int? IdInquilino { get; set; }
    public int? IdConcepto { get; set; }
}

// ROLLBACK-MARKER: ARRRENDAMIENTOS DTOS END
