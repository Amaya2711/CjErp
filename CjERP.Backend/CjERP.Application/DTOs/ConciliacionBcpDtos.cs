using System.Text.Json;
using System.Text.Json.Serialization;

namespace CjERP.Application.DTOs;

internal sealed class FlexibleNullableInt32Converter : JsonConverter<int?>
{
    public override int? Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        return reader.TokenType switch
        {
            JsonTokenType.Null => null,
            JsonTokenType.Number when reader.TryGetInt32(out var number) => number,
            JsonTokenType.String when int.TryParse(reader.GetString(), out var parsed) => parsed,
            JsonTokenType.String => null,
            _ => null
        };
    }

    public override void Write(Utf8JsonWriter writer, int? value, JsonSerializerOptions options)
    {
        if (value.HasValue)
        {
            writer.WriteNumberValue(value.Value);
            return;
        }

        writer.WriteNullValue();
    }
}

public sealed class ConciliacionBcpAnalizarRequestDto
{
    public List<ConciliacionBcpArchivoMuestraDto> Archivos { get; set; } = [];

    public string? CodigoBanco { get; set; }
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

    public string? Empresa { get; set; }

    public string? Cuenta { get; set; }

    public string? Moneda { get; set; }

    public string? SaldoContable { get; set; }
}

public sealed class ConciliacionBcpAnalizarResponseDto
{
    public string? Resumen { get; set; }

    public bool PuedeInsertar { get; set; }

    public List<string> MotivosNoInsertables { get; set; } = [];

    public List<ConciliacionBcpParametroDto> ParametrosProcedimiento { get; set; } = [];

    public List<ConciliacionBcpAnalizarArchivoResponseDto> Archivos { get; set; } = [];

    public ConciliacionBcpDebugAnalisisDto? Debug { get; set; }
}

public sealed class ConciliacionBcpAnalizarArchivoResponseDto
{
    public string NombreArchivo { get; set; } = string.Empty;

    public string? Empresa { get; set; }

    public string? Cuenta { get; set; }

    public string? Moneda { get; set; }

    public string? SaldoContable { get; set; }

    [JsonConverter(typeof(FlexibleNullableInt32Converter))]
    public int? IdBanco { get; set; }

    public string? CodigoBanco { get; set; }

    [JsonConverter(typeof(FlexibleNullableInt32Converter))]
    public int? IdPlantillaBanco { get; set; }

    public string? CodigoPlantillaBanco { get; set; }

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

    public string? CodigoBanco { get; set; }
}

public sealed class ConciliacionBcpExportRequestDto
{
    public ConciliacionBcpAnalizarResponseDto? Analisis { get; set; }
}

public sealed class ConciliacionBcpConciliarPlanillaRequestDto
{
    public string? CodigoBanco { get; set; }

    public int? IdCargo { get; set; }

    public int? IdEmpleado { get; set; }

    public string? Estados { get; set; }

    public DateTime? FechaInicio { get; set; }

    public DateTime? FechaFin { get; set; }

    public int? IdActivo { get; set; }

    public int? IdAreaFlujo { get; set; }

    public int? IdReferencia { get; set; }

    public int? IdCuentaContable { get; set; }

    public bool? EsConciliado { get; set; }
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

    public int? IdBanco { get; set; }

    public string? CodigoBanco { get; set; }

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

    public int? IdAreaFlujo { get; set; }

    public int? IdReferencia { get; set; }

    public int? IdCuentaContable { get; set; }

    public int? IdReglaContable { get; set; }

    public bool? EsConciliado { get; set; }

    public DateTime? FechaConciliacion { get; set; }

    public string? UsuarioConciliacion { get; set; }

    public string? ObservacionConciliacionMovimiento { get; set; }

    public string? NombreAreaFlujo { get; set; }

    public string? DescripcionAreaFlujo { get; set; }

    public string? CodigoReferencia { get; set; }

    public string? NombreReferencia { get; set; }

    public string? DescripcionReferencia { get; set; }

    public string? CodigoCuenta { get; set; }

    public string? NombreCuenta { get; set; }

    public string? CuentaContableTexto { get; set; }

    public int? Orden { get; set; }

    public bool? EsPrincipal { get; set; }

    public bool? RequiereComprobante { get; set; }

    public bool? AplicaConciliacion { get; set; }

    public string? ObservacionReglaContable { get; set; }

    public string? EstadoConciliacionTexto { get; set; }

    public string? EstadoOperativoConciliacion { get; set; }

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

    public string? ResponsablePlanilla { get; set; }

    public string? ComprobantePlanilla { get; set; }

    public string? BancoPlanilla { get; set; }

    public string? SeriePlanilla { get; set; }

    public string? DetallePlanilla { get; set; }

    public string? IdOc { get; set; }

    public string? CorrelativoPlanilla { get; set; }

    public int? IdRegistroPlanilla { get; set; }

    public decimal? TotalPlanillaBase { get; set; }

    public decimal? TotalPagar { get; set; }

    public string? Comentario { get; set; }

    public string? ObservacionConciliacion { get; set; }
}

public sealed class ConciliacionBcpActualizarClasificacionRequestDto
{
    public int IdMovimientoBanco { get; set; }

    public int IdAreaFlujo { get; set; }

    public int IdReferencia { get; set; }

    public int IdCuentaContable { get; set; }

    public int IdReglaContable { get; set; }

    public string? ObservacionConciliacion { get; set; }
}

public sealed class ConciliacionBcpClasificacionCombosResponseDto
{
    public List<ConciliacionAreaFlujoOptionDto> AreasFlujo { get; set; } = [];

    public List<ConciliacionReferenciaOptionDto> Referencias { get; set; } = [];

    public List<ConciliacionCuentaContableOptionDto> CuentasContables { get; set; } = [];

    public List<ConciliacionReglaContableOptionDto> ReglasContables { get; set; } = [];
}

public sealed class ConciliacionAreaFlujoOptionDto
{
    public int IdAreaFlujo { get; set; }

    public string NombreAreaFlujo { get; set; } = string.Empty;
}

public sealed class ConciliacionReferenciaOptionDto
{
    public int IdReferencia { get; set; }

    public string CodigoReferencia { get; set; } = string.Empty;

    public string NombreReferencia { get; set; } = string.Empty;
}

public sealed class ConciliacionCuentaContableOptionDto
{
    public int IdCuentaContable { get; set; }

    public string CodigoCuenta { get; set; } = string.Empty;

    public string NombreCuenta { get; set; } = string.Empty;

    public string CuentaContableTexto { get; set; } = string.Empty;
}

public sealed class ConciliacionReglaContableOptionDto
{
    public int IdReglaContable { get; set; }

    public int IdAreaFlujo { get; set; }

    public int IdReferencia { get; set; }

    public int IdCuentaContable { get; set; }

    public int? Orden { get; set; }

    public bool? EsPrincipal { get; set; }

    public bool? RequiereComprobante { get; set; }

    public bool? AplicaConciliacion { get; set; }

    public string? Observacion { get; set; }
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

    [JsonConverter(typeof(FlexibleConciliacionBcpPromptValidacionesDtoConverter))]
    public ConciliacionBcpPromptValidacionesDto? Validaciones { get; set; }
}

public sealed class ConciliacionBcpPromptResumenArchivoDto
{
    [JsonConverter(typeof(FlexibleNullableInt32Converter))]
    public int? IdBanco { get; set; }

    public string? CodigoBanco { get; set; }

    [JsonConverter(typeof(FlexibleNullableInt32Converter))]
    public int? IdPlantillaBanco { get; set; }

    public string? CodigoPlantillaBanco { get; set; }

    public string? ArchivoOrigen { get; set; }

    public string? Empresa { get; set; }

    public string? Cuenta { get; set; }

    public string? Moneda { get; set; }

    public string? TipoCuenta { get; set; }

    [JsonIgnore]
    public decimal? SaldoLiquido { get; set; }

    [JsonIgnore]
    public decimal? SaldoNoDisponible { get; set; }

    [JsonIgnore]
    public decimal? SaldoContable { get; set; }

    [JsonPropertyName("saldoLiquido")]
    public JsonElement? SaldoLiquidoRaw { get; set; }

    [JsonPropertyName("saldoNoDisponible")]
    public JsonElement? SaldoNoDisponibleRaw { get; set; }

    [JsonPropertyName("saldoContable")]
    public JsonElement? SaldoContableRaw { get; set; }

    public int TotalMovimientos { get; set; }

    [JsonIgnore]
    public decimal? TotalIngresos { get; set; }

    [JsonIgnore]
    public decimal? TotalEgresos { get; set; }

    [JsonIgnore]
    public decimal? Neto { get; set; }

    [JsonPropertyName("totalIngresos")]
    public JsonElement? TotalIngresosRaw { get; set; }

    [JsonPropertyName("totalEgresos")]
    public JsonElement? TotalEgresosRaw { get; set; }

    [JsonPropertyName("neto")]
    public JsonElement? NetoRaw { get; set; }

    [JsonIgnore]
    public List<ConciliacionBcpPromptMovimientoDto> Movimientos { get; set; } = [];

    [JsonPropertyName("movimientos")]
    public JsonElement? MovimientosRaw { get; set; }

    public ConciliacionBcpPromptResumenArchivoDetalleDto? Resumen { get; set; }
}

public sealed class ConciliacionBcpPromptResumenArchivoDetalleDto
{
    public decimal? SaldoContable { get; set; }

    public decimal? SaldoDisponible { get; set; }

    public decimal? SaldoLiquido { get; set; }

    public string? Moneda { get; set; }
}

public sealed class ConciliacionBcpPromptMovimientoDto
{
    [JsonConverter(typeof(FlexibleNullableInt32Converter))]
    public int? IdBanco { get; set; }

    public string? CodigoBanco { get; set; }

    [JsonConverter(typeof(FlexibleNullableInt32Converter))]
    public int? IdPlantillaBanco { get; set; }

    public string? CodigoPlantillaBanco { get; set; }

    public string? Empresa { get; set; }

    public string? Cuenta { get; set; }

    public string? Moneda { get; set; }

    public string? Fecha { get; set; }

    public string? FechaValuta { get; set; }

    public string? Proveedor { get; set; }

    public string? ItemSistema { get; set; }

    public string? DescripcionOperacion { get; set; }

    public string? Referencia { get; set; }

    public string? CDR { get; set; }

    public string? Modulo { get; set; }

    public string? Transaccion { get; set; }

    public string? Relacion { get; set; }

    public decimal? Monto { get; set; }

    public string? SucursalAgencia { get; set; }

    public string? NumeroOperacion { get; set; }

    public string? Usuario { get; set; }

    public string? ArchivoOrigen { get; set; }

    [JsonExtensionData]
    public Dictionary<string, JsonElement>? ExtraData { get; set; }
}

public sealed class ConciliacionBcpPromptValidacionesDto
{
    public bool Insertable { get; set; }

    public int TotalArchivosConError { get; set; }

    public List<string> ArchivosConError { get; set; } = [];

    public List<Dictionary<string, object?>> DuplicadosDetectados { get; set; } = [];

    public List<string> Observaciones { get; set; } = [];
}

internal sealed class FlexibleConciliacionBcpPromptValidacionesDtoConverter : JsonConverter<ConciliacionBcpPromptValidacionesDto?>
{
    public override ConciliacionBcpPromptValidacionesDto? Read(
        ref Utf8JsonReader reader,
        Type typeToConvert,
        JsonSerializerOptions options)
    {
        return reader.TokenType switch
        {
            JsonTokenType.Null => null,
            JsonTokenType.StartObject =>
                JsonSerializer.Deserialize<ConciliacionBcpPromptValidacionesDto>(
                    ref reader,
                    options),
            JsonTokenType.String => new ConciliacionBcpPromptValidacionesDto
            {
                Insertable = false,
                Observaciones = string.IsNullOrWhiteSpace(reader.GetString())
                    ? []
                    : [reader.GetString()!.Trim()]
            },
            JsonTokenType.StartArray => ReadFromArray(ref reader, options),
            _ => null
        };
    }

    public override void Write(
        Utf8JsonWriter writer,
        ConciliacionBcpPromptValidacionesDto? value,
        JsonSerializerOptions options)
    {
        JsonSerializer.Serialize(writer, value, options);
    }

    private static ConciliacionBcpPromptValidacionesDto ReadFromArray(
        ref Utf8JsonReader reader,
        JsonSerializerOptions options)
    {
        var observaciones = new List<string>();

        while (reader.Read())
        {
            if (reader.TokenType == JsonTokenType.EndArray)
            {
                break;
            }

            if (reader.TokenType == JsonTokenType.String)
            {
                var item = reader.GetString();
                if (!string.IsNullOrWhiteSpace(item))
                {
                    observaciones.Add(item.Trim());
                }
                continue;
            }

            if (reader.TokenType == JsonTokenType.StartObject)
            {
                try
                {
                    var item = JsonSerializer.Deserialize<ConciliacionBcpPromptValidacionesDto>(ref reader, options);
                    if (item is not null)
                    {
                        observaciones.AddRange(item.Observaciones.Where(x => !string.IsNullOrWhiteSpace(x)));
                    }
                }
                catch
                {
                    SkipValue(ref reader);
                }
                continue;
            }

            SkipValue(ref reader);
        }

        return new ConciliacionBcpPromptValidacionesDto
        {
            Insertable = false,
            Observaciones = observaciones
        };
    }

    private static void SkipValue(ref Utf8JsonReader reader)
    {
            if (reader.TokenType is JsonTokenType.StartObject or JsonTokenType.StartArray)
            {
                var depth = 1;
                while (depth > 0 && reader.Read())
                {
                    if (reader.TokenType is JsonTokenType.StartObject or JsonTokenType.StartArray)
                    {
                        depth++;
                    }
                    else if (reader.TokenType is JsonTokenType.EndObject or JsonTokenType.EndArray)
                    {
                        depth--;
                    }
                }
            }
    }
}
