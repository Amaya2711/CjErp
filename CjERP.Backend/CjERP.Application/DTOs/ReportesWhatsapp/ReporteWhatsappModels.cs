using System.Text.Json.Serialization;

namespace CjERP.Application.DTOs.ReportesWhatsapp;

public sealed class WupSettings
{
    public string BaseUrl { get; set; } = string.Empty;
    public string LoginEndpoint { get; set; } = "auth/login";
    public string EnviarAdjuntoEndpoint { get; set; } = "cjcomunicacionadjuntos";
    public string Usuario { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
    public int TimeoutSeconds { get; set; } = 120;

    public Uri? TryBuildBaseUri()
    {
        var normalized = BaseUrl?.Trim();
        if (string.IsNullOrWhiteSpace(normalized) || IsPlaceholderValue(normalized))
        {
            return null;
        }

        if (!Uri.TryCreate(normalized.TrimEnd('/') + "/", UriKind.Absolute, out var uri))
        {
            return null;
        }

        return uri;
    }

    public void EnsureConfigured()
    {
        if (TryBuildBaseUri() is null)
        {
            throw new InvalidOperationException(
                "La configuración WUP no es válida. Configure `WupSettings:BaseUrl` con la URL real del servicio y reemplace los valores placeholder del archivo appsettings.");
        }

        if (string.IsNullOrWhiteSpace(Usuario) || IsPlaceholderValue(Usuario))
        {
            throw new InvalidOperationException(
                "La configuración WUP no es válida. Configure `WupSettings:Usuario` con el usuario real del servicio.");
        }

        if (string.IsNullOrWhiteSpace(Password) || IsPlaceholderValue(Password))
        {
            throw new InvalidOperationException(
                "La configuración WUP no es válida. Configure `WupSettings:Password` con la contraseña real del servicio.");
        }
    }

    private static bool IsPlaceholderValue(string value)
    {
        return value.Contains("YOUR_", StringComparison.OrdinalIgnoreCase)
            || value.Contains("your_", StringComparison.OrdinalIgnoreCase)
            || value.Contains("REPLACE_", StringComparison.OrdinalIgnoreCase)
            || value.Contains("example", StringComparison.OrdinalIgnoreCase);
    }
}

public sealed class ReporteWhatsappJobDefaultsOptions
{
    public string HoraEjecucion { get; set; } = "07:00";
    public int CantidadEmpleadosPorBloque { get; set; } = 10;
    public int DelaySegundosEntreBloques { get; set; } = 30;
    public bool Activo { get; set; } = false;
    public string TipoReporte { get; set; } = "ASISTENCIA_WUP";
    public string MensajeAdjunto { get; set; } = "Estimado usuario, aquí está su reporte.";
}

public sealed class ReporteWhatsappConfiguracionDto
{
    public string HoraEjecucion { get; set; } = "07:00";
    public int CantidadEmpleadosPorBloque { get; set; } = 10;
    public int DelaySegundosEntreBloques { get; set; } = 30;
    public bool Activo { get; set; }
    public string UsuarioModificacion { get; set; } = string.Empty;
    public DateTime? FechaModificacion { get; set; }
    public bool UsaRespaldoAppSettings { get; set; }
}

public sealed class ReporteWhatsappConfiguracionUpdateDto
{
    public string HoraEjecucion { get; set; } = string.Empty;
    public int CantidadEmpleadosPorBloque { get; set; }
    public int DelaySegundosEntreBloques { get; set; }
    public bool Activo { get; set; }
}

public sealed class ReporteWhatsappEmpleadoDto
{
    public int IdEmpleado { get; set; }
    public string Usuario { get; set; } = string.Empty;
    public string NombreEmpleado { get; set; } = string.Empty;
    public string Correo { get; set; } = string.Empty;
    public string Telefono { get; set; } = string.Empty;
}

public sealed class ReporteWhatsappAsistenciaItemDto
{
    public string Fecha { get; set; } = string.Empty;
    public string NombreEmpleado { get; set; } = string.Empty;
    public string EstadoMarcacionTexto { get; set; } = string.Empty;
    public string Ubicacion { get; set; } = string.Empty;
    public string HoraEntrada { get; set; } = string.Empty;
    public string HoraSalida { get; set; } = string.Empty;
    public string TiempoHoras { get; set; } = string.Empty;
    public decimal TotalHoras { get; set; }
}

public sealed class ReporteWhatsappPeriodoDto
{
    public string FechaInicio { get; set; } = string.Empty;
    public string FechaFin { get; set; } = string.Empty;
    public DateTime FechaProceso { get; set; }
    public string EtiquetaPeriodo { get; set; } = string.Empty;
}

public sealed class ReporteWhatsappResumenEstadoDto
{
    public string EstadoMarcacionTexto { get; set; } = string.Empty;
    public int Cantidad { get; set; }
    public decimal Porcentaje { get; set; }
}

public sealed class ReporteWhatsappPdfResumenDto
{
    public IReadOnlyList<ReporteWhatsappResumenEstadoDto> Resumen { get; set; } = Array.Empty<ReporteWhatsappResumenEstadoDto>();
    public int TotalRegistros { get; set; }
}

public sealed class ReporteWhatsappSendRequestDto
{
    [JsonPropertyName("nombrearchivo")]
    public string NombreArchivo { get; set; } = string.Empty;

    [JsonPropertyName("mensaje")]
    public string Mensaje { get; set; } = string.Empty;

    [JsonPropertyName("telefono")]
    public string Telefono { get; set; } = string.Empty;

    [JsonPropertyName("contenido")]
    public string Contenido { get; set; } = string.Empty;
}

public sealed class ReporteWhatsappSendResponseDto
{
    public bool Success { get; set; }
    public int StatusCode { get; set; }
    public string ResponseBody { get; set; } = string.Empty;
    public string ErrorMessage { get; set; } = string.Empty;
}

public sealed class ReporteWhatsappLogDto
{
    public int IdLog { get; set; }
    public int IdEmpleado { get; set; }
    public string Usuario { get; set; } = string.Empty;
    public string Telefono { get; set; } = string.Empty;
    public DateTime FechaProceso { get; set; }
    public string TipoReporte { get; set; } = string.Empty;
    public string EstadoEnvio { get; set; } = string.Empty;
    public string MensajeError { get; set; } = string.Empty;
    public DateTime? FechaEnvio { get; set; }
    public string RequestJson { get; set; } = string.Empty;
    public string ResponseJson { get; set; } = string.Empty;
    public int? NumeroBloque { get; set; }
    public int? OrdenEnvio { get; set; }
    public int? TiempoEsperaEntreBloques { get; set; }
    public decimal? DuracionEnvioSegundos { get; set; }
    public string OrigenEjecucion { get; set; } = string.Empty;
    public string UsuarioEjecucion { get; set; } = string.Empty;
    public string NombreEmpleado { get; set; } = string.Empty;
}

public sealed class ReporteWhatsappKpiDto
{
    public int TotalProcesados { get; set; }
    public int TotalEnviados { get; set; }
    public int TotalErrores { get; set; }
    public int TotalOmitidos { get; set; }
    public int TotalDuplicados { get; set; }
    public int TotalPendientesRetry { get; set; }
}

public sealed class ReporteWhatsappRuntimeStatusDto
{
    public string ExecutionId { get; set; } = string.Empty;
    public bool IsRunning { get; set; }
    public string OrigenEjecucion { get; set; } = string.Empty;
    public string UsuarioEjecucion { get; set; } = string.Empty;
    public DateTime? FechaInicio { get; set; }
    public DateTime? FechaFin { get; set; }
    public string Mensaje { get; set; } = string.Empty;
    public int TotalEmpleados { get; set; }
    public int EmpleadosProcesados { get; set; }
    public int Enviados { get; set; }
    public int Errores { get; set; }
    public int Omitidos { get; set; }
    public int Duplicados { get; set; }
    public int BloqueActual { get; set; }
    public int TotalBloques { get; set; }
    public int? EmpleadoActualId { get; set; }
    public string EmpleadoActualNombre { get; set; } = string.Empty;
    public int? SegundosRestantesEstimados { get; set; }
    public int? SegundosEsperaBloqueActual { get; set; }
    public ReporteWhatsappPeriodoDto? Periodo { get; set; }
}

public sealed class ReporteWhatsappDashboardDto
{
    public bool PuedeAdministrar { get; set; }
    public ReporteWhatsappConfiguracionDto Configuracion { get; set; } = new();
    public ReporteWhatsappPeriodoDto PeriodoActual { get; set; } = new();
    public ReporteWhatsappRuntimeStatusDto Runtime { get; set; } = new();
    public ReporteWhatsappKpiDto Kpis { get; set; } = new();
    public IReadOnlyList<ReporteWhatsappLogDto> Logs { get; set; } = Array.Empty<ReporteWhatsappLogDto>();
}

public sealed class ReporteWhatsappEjecucionResultadoDto
{
    public bool Accepted { get; set; }
    public bool AlreadyRunning { get; set; }
    public string ExecutionId { get; set; } = string.Empty;
    public string JobId { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
}
