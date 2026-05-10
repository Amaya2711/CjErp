using System.Diagnostics;
using System.Globalization;
using System.Text.Json;
using CjERP.Application.DTOs.ReportesWhatsapp;
using CjERP.Application.Interfaces.Repositories;
using CjERP.Application.Interfaces.Services;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace CjERP.Infrastructure.Services;

public sealed class ReporteAutomaticoService : IReporteAutomaticoService
{
    private const string RutaModuloRptWup = "/mantenimiento/sistemas/rptwup";
    private static readonly string[] RolesPermitidos = ["ADMIN", "ADMINISTRADOR", "TI", "RRHH", "SISTEMAS", "SUPERADMIN"];

    private readonly IReporteRepository _reporteRepository;
    private readonly IReportePdfService _reportePdfService;
    private readonly IWupService _wupService;
    private readonly IReporteWhatsappRuntimeMonitor _runtimeMonitor;
    private readonly ISegMenuService _segMenuService;
    private readonly ReporteWhatsappJobDefaultsOptions _defaults;
    private readonly WupSettings _wupSettings;
    private readonly ILogger<ReporteAutomaticoService> _logger;

    public ReporteAutomaticoService(
        IReporteRepository reporteRepository,
        IReportePdfService reportePdfService,
        IWupService wupService,
        IReporteWhatsappRuntimeMonitor runtimeMonitor,
        ISegMenuService segMenuService,
        IOptions<ReporteWhatsappJobDefaultsOptions> defaults,
        IOptions<WupSettings> wupSettings,
        ILogger<ReporteAutomaticoService> logger)
    {
        _reporteRepository = reporteRepository;
        _reportePdfService = reportePdfService;
        _wupService = wupService;
        _runtimeMonitor = runtimeMonitor;
        _segMenuService = segMenuService;
        _defaults = defaults.Value;
        _wupSettings = wupSettings.Value;
        _logger = logger;
    }

    public async Task<ReporteWhatsappConfiguracionDto> ObtenerConfiguracionAsync(CancellationToken cancellationToken = default)
    {
        var config = await _reporteRepository.ObtenerConfiguracionAsync(cancellationToken);
        return MergeConfiguracion(config);
    }

    public Task<ReporteWhatsappPeriodoDto> ObtenerPeriodoActualAsync(CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(BuildPeriodoActual());
    }

    public async Task<ReporteWhatsappDashboardDto> ObtenerDashboardAsync(string idUsuario, int topLogs = 200, CancellationToken cancellationToken = default)
    {
        var periodo = BuildPeriodoActual();
        var configuracion = await ObtenerConfiguracionAsync(cancellationToken);
        var logs = await _reporteRepository.ObtenerLogsAsync(periodo.FechaProceso, topLogs, cancellationToken);
        var kpis = await _reporteRepository.ObtenerKpisAsync(periodo.FechaProceso, cancellationToken);
        var runtime = _runtimeMonitor.GetSnapshot();
        var puedeAdministrar = await UsuarioTieneAccesoAdministrativoAsync(idUsuario, cancellationToken);

        return new ReporteWhatsappDashboardDto
        {
            PuedeAdministrar = puedeAdministrar,
            Configuracion = configuracion,
            PeriodoActual = periodo,
            Runtime = runtime,
            Kpis = kpis,
            Logs = logs
        };
    }

    public async Task ActualizarConfiguracionAsync(ReporteWhatsappConfiguracionUpdateDto request, string usuarioModificacion, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(request.HoraEjecucion))
        {
            throw new InvalidOperationException("La hora de ejecución es obligatoria.");
        }

        if (!TimeSpan.TryParse(request.HoraEjecucion, CultureInfo.InvariantCulture, out _))
        {
            throw new InvalidOperationException("La hora de ejecución debe tener formato HH:mm.");
        }

        if (request.CantidadEmpleadosPorBloque < 1)
        {
            throw new InvalidOperationException("La cantidad de empleados por bloque debe ser mayor o igual a 1.");
        }

        if (request.DelaySegundosEntreBloques < 10)
        {
            throw new InvalidOperationException("El tiempo de espera entre bloques debe ser mayor o igual a 10 segundos.");
        }

        await _reporteRepository.ActualizarConfiguracionAsync(request, usuarioModificacion, cancellationToken);
    }

    public async Task<ReporteWhatsappEjecucionResultadoDto> EjecutarAsync(string origenEjecucion, string usuarioEjecucion, bool soloFallidos, CancellationToken cancellationToken = default)
    {
        var configuracion = await ObtenerConfiguracionAsync(cancellationToken);
        var periodo = BuildPeriodoActual();
        var executionId = Guid.NewGuid().ToString("N");

        var runtime = new ReporteWhatsappRuntimeStatusDto
        {
            ExecutionId = executionId,
            IsRunning = true,
            OrigenEjecucion = origenEjecucion,
            UsuarioEjecucion = usuarioEjecucion,
            FechaInicio = DateTime.Now,
            Mensaje = "Iniciando proceso...",
            Periodo = periodo
        };

        if (!_runtimeMonitor.TryStart(runtime))
        {
            var current = _runtimeMonitor.GetSnapshot();
            return new ReporteWhatsappEjecucionResultadoDto
            {
                Accepted = false,
                AlreadyRunning = true,
                ExecutionId = current.ExecutionId,
                Message = "Ya existe una ejecución de reporte WUP en curso."
            };
        }

        try
        {
            _wupSettings.EnsureConfigured();

            var empleados = soloFallidos
                ? await _reporteRepository.ObtenerEmpleadosFallidosAsync(periodo.FechaProceso, _defaults.TipoReporte, cancellationToken)
                : await _reporteRepository.ObtenerEmpleadosDestinoAsync(cancellationToken);

            empleados = empleados
                .Where(x => x.IdEmpleado > 0)
                .GroupBy(x => x.IdEmpleado)
                .Select(group => group.First())
                .ToList();

            runtime.TotalEmpleados = empleados.Count;
            runtime.TotalBloques = empleados.Count == 0
                ? 0
                : (int)Math.Ceiling(empleados.Count / (decimal)Math.Max(1, configuracion.CantidadEmpleadosPorBloque));
            runtime.Mensaje = empleados.Count == 0
                ? "No se encontraron empleados para procesar."
                : "Procesando reportes por bloque.";
            _runtimeMonitor.Update(Clone(runtime));

            if (empleados.Count == 0)
            {
                runtime.IsRunning = false;
                runtime.FechaFin = DateTime.Now;
                _runtimeMonitor.Finish(Clone(runtime));
                return new ReporteWhatsappEjecucionResultadoDto
                {
                    Accepted = true,
                    ExecutionId = executionId,
                    Message = runtime.Mensaje
                };
            }

            var bloques = Chunk(empleados, configuracion.CantidadEmpleadosPorBloque);
            var ordenEnvio = 0;

            for (var bloqueIndex = 0; bloqueIndex < bloques.Count; bloqueIndex++)
            {
                cancellationToken.ThrowIfCancellationRequested();

                runtime.BloqueActual = bloqueIndex + 1;
                runtime.SegundosEsperaBloqueActual = null;
                runtime.Mensaje = $"Procesando bloque {runtime.BloqueActual} de {runtime.TotalBloques}.";
                _runtimeMonitor.Update(Clone(runtime));

                foreach (var empleado in bloques[bloqueIndex])
                {
                    ordenEnvio++;
                    runtime.EmpleadoActualId = empleado.IdEmpleado;
                    runtime.EmpleadoActualNombre = empleado.NombreEmpleado;
                    runtime.SegundosRestantesEstimados = EstimateRemainingSeconds(runtime, configuracion.DelaySegundosEntreBloques);
                    _runtimeMonitor.Update(Clone(runtime));

                    await ProcesarEmpleadoAsync(
                        empleado,
                        periodo,
                        configuracion,
                        origenEjecucion,
                        usuarioEjecucion,
                        bloqueIndex + 1,
                        ordenEnvio,
                        runtime,
                        cancellationToken);
                }

                var isLastBlock = bloqueIndex == bloques.Count - 1;
                if (!isLastBlock && configuracion.DelaySegundosEntreBloques > 0)
                {
                    runtime.Mensaje = $"Esperando {configuracion.DelaySegundosEntreBloques} segundos antes del siguiente bloque.";
                    runtime.SegundosEsperaBloqueActual = configuracion.DelaySegundosEntreBloques;
                    _runtimeMonitor.Update(Clone(runtime));

                    for (var remaining = configuracion.DelaySegundosEntreBloques; remaining > 0; remaining--)
                    {
                        runtime.SegundosEsperaBloqueActual = remaining;
                        runtime.SegundosRestantesEstimados = EstimateRemainingSeconds(runtime, configuracion.DelaySegundosEntreBloques);
                        _runtimeMonitor.Update(Clone(runtime));
                        await Task.Delay(TimeSpan.FromSeconds(1), cancellationToken);
                    }
                }
            }

            runtime.IsRunning = false;
            runtime.FechaFin = DateTime.Now;
            runtime.SegundosEsperaBloqueActual = null;
            runtime.SegundosRestantesEstimados = 0;
            runtime.Mensaje = "Proceso finalizado.";
            _runtimeMonitor.Finish(Clone(runtime));

            return new ReporteWhatsappEjecucionResultadoDto
            {
                Accepted = true,
                ExecutionId = executionId,
                Message = "Proceso completado correctamente."
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[ReporteWUP] Error no controlado durante la ejecución {ExecutionId}", executionId);
            runtime.IsRunning = false;
            runtime.FechaFin = DateTime.Now;
            runtime.Mensaje = $"Proceso finalizado con error: {ex.Message}";
            _runtimeMonitor.Finish(Clone(runtime));

            return new ReporteWhatsappEjecucionResultadoDto
            {
                Accepted = false,
                ExecutionId = executionId,
                Message = ex.Message
            };
        }
    }

    public async Task<bool> UsuarioTieneAccesoAdministrativoAsync(string idUsuario, CancellationToken cancellationToken = default)
    {
        if (!string.IsNullOrWhiteSpace(idUsuario))
        {
            var normalizedUser = idUsuario.Trim().ToUpperInvariant();
            if (normalizedUser is "ADMIN" or "ADMINISTRADOR" or "SISTEMA" or "SYSTEM")
            {
                return true;
            }
        }

        if (await _reporteRepository.UsuarioTieneAccesoAdministrativoAsync(idUsuario, RolesPermitidos, cancellationToken))
        {
            return true;
        }

        if (string.IsNullOrWhiteSpace(idUsuario))
        {
            return false;
        }

        var menus = await _segMenuService.ListarMenuDinamicoAsync(idUsuario.Trim(), null, null);
        return menus.Any(menu => RutaCoincide(menu.Ruta, RutaModuloRptWup));
    }

    private async Task ProcesarEmpleadoAsync(
        ReporteWhatsappEmpleadoDto empleado,
        ReporteWhatsappPeriodoDto periodo,
        ReporteWhatsappConfiguracionDto configuracion,
        string origenEjecucion,
        string usuarioEjecucion,
        int numeroBloque,
        int ordenEnvio,
        ReporteWhatsappRuntimeStatusDto runtime,
        CancellationToken cancellationToken)
    {
        var stopwatch = Stopwatch.StartNew();
        var telefonoNormalizado = NormalizePhone(empleado.Telefono);
        var log = new ReporteWhatsappLogDto
        {
            IdEmpleado = empleado.IdEmpleado,
            Usuario = string.IsNullOrWhiteSpace(empleado.Usuario) ? empleado.NombreEmpleado : empleado.Usuario,
            Telefono = telefonoNormalizado ?? empleado.Telefono ?? string.Empty,
            FechaProceso = periodo.FechaProceso.Date,
            TipoReporte = _defaults.TipoReporte,
            NumeroBloque = numeroBloque,
            OrdenEnvio = ordenEnvio,
            TiempoEsperaEntreBloques = configuracion.DelaySegundosEntreBloques,
            OrigenEjecucion = origenEjecucion,
            UsuarioEjecucion = usuarioEjecucion,
            NombreEmpleado = empleado.NombreEmpleado
        };

        try
        {
            if (string.IsNullOrWhiteSpace(empleado.Telefono))
            {
                log.EstadoEnvio = "OMITIDO_SIN_TELEFONO";
                log.MensajeError = "El empleado no tiene teléfono WUP configurado.";
                return;
            }

            if (string.IsNullOrWhiteSpace(telefonoNormalizado))
            {
                log.EstadoEnvio = "OMITIDO_TELEFONO_INVALIDO";
                log.MensajeError = $"El teléfono '{empleado.Telefono}' no cumple el formato internacional esperado.";
                return;
            }

            if (await _reporteRepository.ExisteEnvioExitosoAsync(empleado.IdEmpleado, periodo.FechaProceso, _defaults.TipoReporte, cancellationToken))
            {
                log.EstadoEnvio = "DUPLICADO_OMITIDO";
                log.MensajeError = "Ya existe un envío exitoso para el empleado y período actual.";
                runtime.Duplicados++;
                return;
            }

            var detalle = await _reporteRepository.ObtenerReporteAsistenciaAsync(
                periodo.FechaInicio,
                periodo.FechaFin,
                empleado.IdEmpleado,
                cancellationToken);

            if (detalle.Count == 0)
            {
                log.EstadoEnvio = "OMITIDO_SIN_DATOS";
                log.MensajeError = "El store no devolvió filas para el empleado y rango solicitado.";
                return;
            }

            byte[] pdfBytes;
            try
            {
                pdfBytes = await _reportePdfService.GenerarReportePdfAsync(empleado, periodo, detalle, cancellationToken);
            }
            catch (Exception ex)
            {
                log.EstadoEnvio = "ERROR_GENERANDO_REPORTE";
                log.MensajeError = ex.Message;
                runtime.Errores++;
                return;
            }

            string base64;
            try
            {
                base64 = Convert.ToBase64String(pdfBytes);
                if (string.IsNullOrWhiteSpace(base64))
                {
                    throw new InvalidOperationException("El archivo PDF se generó vacío.");
                }
            }
            catch (Exception ex)
            {
                log.EstadoEnvio = "ERROR_CONVERSION_BASE64";
                log.MensajeError = ex.Message;
                runtime.Errores++;
                return;
            }

            var request = new ReporteWhatsappSendRequestDto
            {
                NombreArchivo = BuildFileName(empleado, periodo),
                Mensaje = _defaults.MensajeAdjunto,
                Telefono = telefonoNormalizado,
                Contenido = base64
            };

            log.RequestJson = JsonSerializer.Serialize(new
            {
                request.NombreArchivo,
                request.Mensaje,
                request.Telefono,
                contenidoLength = request.Contenido.Length
            });

            var response = await ExecuteWithRetryAsync(
                () => _wupService.EnviarAdjuntoAsync(request, cancellationToken),
                2,
                cancellationToken);

            log.ResponseJson = response.ResponseBody;

            if (!response.Success)
            {
                log.EstadoEnvio = "ERROR_ENDPOINT_WUP";
                log.MensajeError = string.IsNullOrWhiteSpace(response.ErrorMessage)
                    ? "El endpoint WUP respondió sin confirmar éxito."
                    : response.ErrorMessage;
                runtime.Errores++;
                return;
            }

            log.EstadoEnvio = "ENVIADO";
            log.FechaEnvio = DateTime.Now;
            runtime.Enviados++;
        }
        catch (Exception ex)
        {
            log.EstadoEnvio = "ERROR";
            log.MensajeError = ex.Message;
            runtime.Errores++;
        }
        finally
        {
            stopwatch.Stop();
            log.DuracionEnvioSegundos = Math.Round((decimal)stopwatch.Elapsed.TotalSeconds, 2);

            if (log.EstadoEnvio.StartsWith("OMITIDO", StringComparison.OrdinalIgnoreCase))
            {
                runtime.Omitidos++;
            }

            if (log.EstadoEnvio == "DUPLICADO_OMITIDO")
            {
                runtime.Omitidos++;
            }

            runtime.EmpleadosProcesados++;
            runtime.SegundosRestantesEstimados = EstimateRemainingSeconds(runtime, configuracion.DelaySegundosEntreBloques);

            await _reporteRepository.InsertarLogAsync(log, cancellationToken);
            _runtimeMonitor.Update(Clone(runtime));
        }
    }

    private static async Task<ReporteWhatsappSendResponseDto> ExecuteWithRetryAsync(
        Func<Task<ReporteWhatsappSendResponseDto>> action,
        int maxAttempts,
        CancellationToken cancellationToken)
    {
        ReporteWhatsappSendResponseDto? last = null;

        for (var attempt = 1; attempt <= maxAttempts; attempt++)
        {
            cancellationToken.ThrowIfCancellationRequested();
            last = await action();
            if (last.Success)
            {
                return last;
            }

            if (attempt < maxAttempts)
            {
                await Task.Delay(TimeSpan.FromSeconds(2), cancellationToken);
            }
        }

        return last ?? new ReporteWhatsappSendResponseDto
        {
            Success = false,
            ErrorMessage = "No se obtuvo respuesta del servicio WUP."
        };
    }

    private ReporteWhatsappConfiguracionDto MergeConfiguracion(ReporteWhatsappConfiguracionDto? fromDb)
    {
        var config = fromDb ?? new ReporteWhatsappConfiguracionDto();
        var result = new ReporteWhatsappConfiguracionDto
        {
            HoraEjecucion = string.IsNullOrWhiteSpace(config.HoraEjecucion) ? _defaults.HoraEjecucion : NormalizeTime(config.HoraEjecucion),
            CantidadEmpleadosPorBloque = config.CantidadEmpleadosPorBloque > 0 ? config.CantidadEmpleadosPorBloque : _defaults.CantidadEmpleadosPorBloque,
            DelaySegundosEntreBloques = config.DelaySegundosEntreBloques > 0 ? config.DelaySegundosEntreBloques : _defaults.DelaySegundosEntreBloques,
            Activo = fromDb is null ? _defaults.Activo : config.Activo,
            UsuarioModificacion = config.UsuarioModificacion,
            FechaModificacion = config.FechaModificacion,
            UsaRespaldoAppSettings = fromDb is null
        };

        return result;
    }

    private static string NormalizeTime(string value)
    {
        return TimeSpan.TryParse(value, CultureInfo.InvariantCulture, out var time)
            ? time.ToString(@"hh\:mm", CultureInfo.InvariantCulture)
            : value.Trim();
    }

    private static ReporteWhatsappPeriodoDto BuildPeriodoActual()
    {
        var timeZone = ResolvePeruTimeZone();
        var now = TimeZoneInfo.ConvertTime(DateTimeOffset.UtcNow, timeZone).Date;

        DateTime start;
        DateTime end;

        if (now.Day == 1)
        {
            var previousMonth = now.AddMonths(-1);
            start = new DateTime(previousMonth.Year, previousMonth.Month, 1);
            end = new DateTime(previousMonth.Year, previousMonth.Month, DateTime.DaysInMonth(previousMonth.Year, previousMonth.Month));
        }
        else
        {
            start = new DateTime(now.Year, now.Month, 1);
            end = now.AddDays(-1);
        }

        return new ReporteWhatsappPeriodoDto
        {
            FechaInicio = start.ToString("dd/MM/yyyy", CultureInfo.InvariantCulture),
            FechaFin = end.ToString("dd/MM/yyyy", CultureInfo.InvariantCulture),
            FechaProceso = end.Date,
            EtiquetaPeriodo = $"{start:dd/MM/yyyy} - {end:dd/MM/yyyy}"
        };
    }

    private static TimeZoneInfo ResolvePeruTimeZone()
    {
        foreach (var timeZoneId in new[] { "SA Pacific Standard Time", "America/Lima" })
        {
            try
            {
                return TimeZoneInfo.FindSystemTimeZoneById(timeZoneId);
            }
            catch
            {
                // Intentar siguiente zona.
            }
        }

        return TimeZoneInfo.Utc;
    }

    private static string BuildFileName(ReporteWhatsappEmpleadoDto empleado, ReporteWhatsappPeriodoDto periodo)
    {
        var safeName = string.Join("_", (empleado.NombreEmpleado ?? $"EMP_{empleado.IdEmpleado}")
            .Trim()
            .Split(Path.GetInvalidFileNameChars(), StringSplitOptions.RemoveEmptyEntries))
            .Replace(' ', '_');

        return $"reporte_asistencia_{safeName}_{periodo.FechaProceso:yyyyMMdd}.pdf";
    }

    private static string? NormalizePhone(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        var digits = new string(value.Where(char.IsDigit).ToArray());
        if (digits.Length == 9 && digits.StartsWith('9'))
        {
            return $"51{digits}";
        }

        if (digits.Length == 11 && digits.StartsWith("51", StringComparison.Ordinal))
        {
            return digits;
        }

        return null;
    }

    private static bool RutaCoincide(string? actual, string expected)
    {
        if (string.IsNullOrWhiteSpace(actual))
        {
            return false;
        }

        var normalizedActual = NormalizeRuta(actual);
        var normalizedExpected = NormalizeRuta(expected);
        return string.Equals(normalizedActual, normalizedExpected, StringComparison.OrdinalIgnoreCase);
    }

    private static string NormalizeRuta(string value)
    {
        var trimmed = value.Trim();
        if (!trimmed.StartsWith('/'))
        {
            trimmed = "/" + trimmed;
        }

        return trimmed.TrimEnd('/');
    }

    private static int EstimateRemainingSeconds(ReporteWhatsappRuntimeStatusDto runtime, int delayBetweenBlocks)
    {
        var remainingEmployees = Math.Max(0, runtime.TotalEmpleados - runtime.EmpleadosProcesados);
        var remainingBlocks = Math.Max(0, runtime.TotalBloques - runtime.BloqueActual);
        return remainingEmployees * 4 + remainingBlocks * Math.Max(0, delayBetweenBlocks);
    }

    private static List<List<ReporteWhatsappEmpleadoDto>> Chunk(IReadOnlyList<ReporteWhatsappEmpleadoDto> source, int size)
    {
        var result = new List<List<ReporteWhatsappEmpleadoDto>>();
        for (var index = 0; index < source.Count; index += size)
        {
            result.Add(source.Skip(index).Take(size).ToList());
        }

        return result;
    }

    private static ReporteWhatsappRuntimeStatusDto Clone(ReporteWhatsappRuntimeStatusDto snapshot)
    {
        return new ReporteWhatsappRuntimeStatusDto
        {
            ExecutionId = snapshot.ExecutionId,
            IsRunning = snapshot.IsRunning,
            OrigenEjecucion = snapshot.OrigenEjecucion,
            UsuarioEjecucion = snapshot.UsuarioEjecucion,
            FechaInicio = snapshot.FechaInicio,
            FechaFin = snapshot.FechaFin,
            Mensaje = snapshot.Mensaje,
            TotalEmpleados = snapshot.TotalEmpleados,
            EmpleadosProcesados = snapshot.EmpleadosProcesados,
            Enviados = snapshot.Enviados,
            Errores = snapshot.Errores,
            Omitidos = snapshot.Omitidos,
            Duplicados = snapshot.Duplicados,
            BloqueActual = snapshot.BloqueActual,
            TotalBloques = snapshot.TotalBloques,
            EmpleadoActualId = snapshot.EmpleadoActualId,
            EmpleadoActualNombre = snapshot.EmpleadoActualNombre,
            SegundosRestantesEstimados = snapshot.SegundosRestantesEstimados,
            SegundosEsperaBloqueActual = snapshot.SegundosEsperaBloqueActual,
            Periodo = snapshot.Periodo is null
                ? null
                : new ReporteWhatsappPeriodoDto
                {
                    FechaInicio = snapshot.Periodo.FechaInicio,
                    FechaFin = snapshot.Periodo.FechaFin,
                    FechaProceso = snapshot.Periodo.FechaProceso,
                    EtiquetaPeriodo = snapshot.Periodo.EtiquetaPeriodo
                }
        };
    }
}
