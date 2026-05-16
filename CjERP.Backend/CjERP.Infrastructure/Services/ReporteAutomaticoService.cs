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
    private static readonly string[] RutasModuloRptWup =
    [
        "/mantenimiento/sistemas/rptwup",
        "/mantenimiento/sistemas/rptwupgerencial"
    ];

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

    public async Task<ReporteWhatsappConfiguracionDto> ObtenerConfiguracionAsync(string tipoReporte, CancellationToken cancellationToken = default)
    {
        var normalizedType = ReporteWhatsappTipos.Normalize(tipoReporte);
        var config = await _reporteRepository.ObtenerConfiguracionAsync(normalizedType, cancellationToken);
        return MergeConfiguracion(normalizedType, config);
    }

    public Task<ReporteWhatsappPeriodoDto> ObtenerPeriodoActualAsync(CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(BuildPeriodoActual());
    }

    public async Task<ReporteWhatsappDashboardDto> ObtenerDashboardAsync(string idUsuario, string tipoReporte, int topLogs = 200, CancellationToken cancellationToken = default)
    {
        var normalizedType = ReporteWhatsappTipos.Normalize(tipoReporte);
        var periodo = BuildPeriodoActual();
        var configuracion = await ObtenerConfiguracionAsync(normalizedType, cancellationToken);
        var logs = await _reporteRepository.ObtenerLogsAsync(periodo.FechaProceso, normalizedType, topLogs, cancellationToken);
        var kpis = await _reporteRepository.ObtenerKpisAsync(periodo.FechaProceso, normalizedType, cancellationToken);
        var runtime = _runtimeMonitor.GetSnapshot(normalizedType);
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
        request.TipoReporte = ReporteWhatsappTipos.Normalize(request.TipoReporte);

        if (string.IsNullOrWhiteSpace(request.HoraEjecucion))
        {
            throw new InvalidOperationException("La hora de ejecucion es obligatoria.");
        }

        if (!TimeSpan.TryParse(request.HoraEjecucion, CultureInfo.InvariantCulture, out _))
        {
            throw new InvalidOperationException("La hora de ejecucion debe tener formato HH:mm.");
        }

        request.DiasEjecucion = NormalizeDiasEjecucion(request.DiasEjecucion);

        if (ReporteWhatsappTipos.IsGerencial(request.TipoReporte) && request.DiasEjecucion.Count == 0)
        {
            throw new InvalidOperationException("Seleccione al menos un dia de ejecucion para el reporte gerencial.");
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

    public async Task<ReporteWhatsappEjecucionResultadoDto> EjecutarAsync(string tipoReporte, string origenEjecucion, string usuarioEjecucion, bool soloFallidos, CancellationToken cancellationToken = default)
    {
        var normalizedType = ReporteWhatsappTipos.Normalize(tipoReporte);
        var configuracion = await ObtenerConfiguracionAsync(normalizedType, cancellationToken);
        var periodo = BuildPeriodoActual();
        var executionId = Guid.NewGuid().ToString("N");

        var runtime = new ReporteWhatsappRuntimeStatusDto
        {
            TipoReporte = normalizedType,
            ExecutionId = executionId,
            IsRunning = true,
            OrigenEjecucion = origenEjecucion,
            UsuarioEjecucion = usuarioEjecucion,
            FechaInicio = DateTime.Now,
            Mensaje = "Iniciando proceso...",
            Periodo = periodo
        };

        if (!_runtimeMonitor.TryStart(normalizedType, runtime))
        {
            var current = _runtimeMonitor.GetSnapshot(normalizedType);
            return new ReporteWhatsappEjecucionResultadoDto
            {
                Accepted = false,
                AlreadyRunning = true,
                ExecutionId = current.ExecutionId,
                Message = "Ya existe una ejecucion de reporte WUP en curso."
            };
        }

        try
        {
            _wupSettings.EnsureConfigured();

            var empleados = soloFallidos
                ? await _reporteRepository.ObtenerEmpleadosFallidosAsync(periodo.FechaProceso, normalizedType, cancellationToken)
                : await _reporteRepository.ObtenerEmpleadosDestinoAsync(normalizedType, cancellationToken);

            empleados = empleados
                .Where(x => x.IdEmpleado > 0)
                .GroupBy(x => x.IdEmpleado)
                .Select(group => group.First())
                .ToList();

            var empleadosReporteGerencial = Array.Empty<ReporteWhatsappEmpleadoDto>();
            IReadOnlyList<ReporteWhatsappAsistenciaItemDto>? detalleGerencial = null;
            if (ReporteWhatsappTipos.IsGerencial(normalizedType))
            {
                empleadosReporteGerencial = (await _reporteRepository.ObtenerEmpleadosReporteGerencialAsync(cancellationToken))
                    .Where(x => x.IdEmpleado > 0)
                    .GroupBy(x => x.IdEmpleado)
                    .Select(group => group.First())
                    .ToArray();

                detalleGerencial = await BuildGerencialDetalleAsync(empleadosReporteGerencial, periodo, cancellationToken);
            }

            runtime.TotalEmpleados = empleados.Count;
            runtime.TotalBloques = empleados.Count == 0
                ? 0
                : (int)Math.Ceiling(empleados.Count / (decimal)Math.Max(1, configuracion.CantidadEmpleadosPorBloque));
            runtime.Mensaje = empleados.Count == 0
                ? "No se encontraron empleados para procesar."
                : "Procesando reportes por bloque.";
            _runtimeMonitor.Update(normalizedType, Clone(runtime));

            if (empleados.Count == 0)
            {
                runtime.IsRunning = false;
                runtime.FechaFin = DateTime.Now;
                _runtimeMonitor.Finish(normalizedType, Clone(runtime));
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
                _runtimeMonitor.Update(normalizedType, Clone(runtime));

                foreach (var empleado in bloques[bloqueIndex])
                {
                    ordenEnvio++;
                    runtime.EmpleadoActualId = empleado.IdEmpleado;
                    runtime.EmpleadoActualNombre = empleado.NombreEmpleado;
                    runtime.SegundosRestantesEstimados = EstimateRemainingSeconds(runtime, configuracion.DelaySegundosEntreBloques);
                    _runtimeMonitor.Update(normalizedType, Clone(runtime));

                    await ProcesarEmpleadoAsync(
                        normalizedType,
                        empleado,
                        ReporteWhatsappTipos.IsGerencial(normalizedType) ? empleadosReporteGerencial : empleados,
                        detalleGerencial,
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
                    _runtimeMonitor.Update(normalizedType, Clone(runtime));

                    for (var remaining = configuracion.DelaySegundosEntreBloques; remaining > 0; remaining--)
                    {
                        runtime.SegundosEsperaBloqueActual = remaining;
                        runtime.SegundosRestantesEstimados = EstimateRemainingSeconds(runtime, configuracion.DelaySegundosEntreBloques);
                        _runtimeMonitor.Update(normalizedType, Clone(runtime));
                        await Task.Delay(TimeSpan.FromSeconds(1), cancellationToken);
                    }
                }
            }

            runtime.IsRunning = false;
            runtime.FechaFin = DateTime.Now;
            runtime.SegundosEsperaBloqueActual = null;
            runtime.SegundosRestantesEstimados = 0;
            runtime.Mensaje = "Proceso finalizado.";
            _runtimeMonitor.Finish(normalizedType, Clone(runtime));

            return new ReporteWhatsappEjecucionResultadoDto
            {
                Accepted = true,
                ExecutionId = executionId,
                Message = "Proceso completado correctamente."
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[ReporteWUP] Error no controlado durante la ejecucion {ExecutionId}", executionId);
            runtime.IsRunning = false;
            runtime.FechaFin = DateTime.Now;
            runtime.Mensaje = $"Proceso finalizado con error: {ex.Message}";
            _runtimeMonitor.Finish(normalizedType, Clone(runtime));

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
        return menus.Any(menu => RutasModuloRptWup.Any(ruta => RutaCoincide(menu.Ruta, ruta)));
    }

    private async Task ProcesarEmpleadoAsync(
        string tipoReporte,
        ReporteWhatsappEmpleadoDto empleado,
        IReadOnlyList<ReporteWhatsappEmpleadoDto> empleadosDestino,
        IReadOnlyList<ReporteWhatsappAsistenciaItemDto>? detalleGerencial,
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
            TipoReporte = tipoReporte,
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
                log.MensajeError = "El empleado no tiene telefono WUP configurado.";
                return;
            }

            if (string.IsNullOrWhiteSpace(telefonoNormalizado))
            {
                log.EstadoEnvio = "OMITIDO_TELEFONO_INVALIDO";
                log.MensajeError = $"El telefono '{empleado.Telefono}' no cumple el formato internacional esperado.";
                return;
            }

            if (await _reporteRepository.ExisteEnvioExitosoAsync(empleado.IdEmpleado, periodo.FechaProceso, tipoReporte, cancellationToken))
            {
                log.EstadoEnvio = "DUPLICADO_OMITIDO";
                log.MensajeError = "Ya existe un envio exitoso para el empleado y periodo actual.";
                runtime.Duplicados++;
                return;
            }

            IReadOnlyList<ReporteWhatsappAsistenciaItemDto> detalle;
            if (ReporteWhatsappTipos.IsGerencial(tipoReporte))
            {
                detalle = detalleGerencial ?? Array.Empty<ReporteWhatsappAsistenciaItemDto>();
            }
            else
            {
                detalle = await _reporteRepository.ObtenerReporteAsistenciaAsync(
                    periodo.FechaInicio,
                    periodo.FechaFin,
                    empleado.IdEmpleado,
                    cancellationToken);
            }

            if (detalle.Count == 0)
            {
                log.EstadoEnvio = "OMITIDO_SIN_DATOS";
                log.MensajeError = "El store no devolvio filas para el empleado y rango solicitado.";
                return;
            }

            byte[] pdfBytes;
            try
            {
                pdfBytes = await _reportePdfService.GenerarReportePdfAsync(tipoReporte, empleado, periodo, detalle, cancellationToken);
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
                    throw new InvalidOperationException("El archivo PDF se genero vacio.");
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
                NombreArchivo = BuildFileName(tipoReporte, empleado, periodo),
                Mensaje = GetMensajeAdjunto(tipoReporte),
                Modo = GetModoEnvio(tipoReporte),
                Telefono = telefonoNormalizado,
                Contenido = base64
            };

            log.RequestJson = JsonSerializer.Serialize(new
            {
                request.NombreArchivo,
                request.Mensaje,
                request.Modo,
                request.Telefono,
                request.Contenido,
                contenidoLength = request.Contenido.Length,
                reporteGerencial = ReporteWhatsappTipos.IsGerencial(tipoReporte),
                totalEmpleadosResumen = ReporteWhatsappTipos.IsGerencial(tipoReporte) ? empleadosDestino.Count : 1
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
                    ? "El endpoint WUP respondio sin confirmar exito."
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
            _runtimeMonitor.Update(tipoReporte, Clone(runtime));
        }
    }

    private async Task<IReadOnlyList<ReporteWhatsappAsistenciaItemDto>> BuildGerencialDetalleAsync(
        IReadOnlyList<ReporteWhatsappEmpleadoDto> empleados,
        ReporteWhatsappPeriodoDto periodo,
        CancellationToken cancellationToken)
    {
        var empleadosById = empleados
            .Where(x => x.IdEmpleado > 0)
            .GroupBy(x => x.IdEmpleado)
            .ToDictionary(x => x.Key, x => x.First());

        var detallePeriodo = await _reporteRepository.ObtenerReporteAsistenciaPeriodoAsync(
            periodo.FechaInicio,
            periodo.FechaFin,
            cancellationToken);

        return detallePeriodo
            .Where(item => item.IdEmpleado > 0 && empleadosById.ContainsKey(item.IdEmpleado))
            .Select(item =>
            {
                var empleado = empleadosById[item.IdEmpleado];
                item.NombreEmpleado = string.IsNullOrWhiteSpace(item.NombreEmpleado) ? empleado.NombreEmpleado : item.NombreEmpleado;
                item.Ubicacion = string.IsNullOrWhiteSpace(item.Ubicacion) ? empleado.Ubicacion : item.Ubicacion;
                return item;
            })
            .ToList();
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

    private ReporteWhatsappConfiguracionDto MergeConfiguracion(string tipoReporte, ReporteWhatsappConfiguracionDto? fromDb)
    {
        var defaults = GetDefaults(tipoReporte);
        var config = fromDb ?? new ReporteWhatsappConfiguracionDto();
        var diasEjecucion = NormalizeDiasEjecucion(config.DiasEjecucion);
        if (diasEjecucion.Count == 0)
        {
            diasEjecucion = defaults.DiasEjecucion;
        }

        return new ReporteWhatsappConfiguracionDto
        {
            TipoReporte = tipoReporte,
            HoraEjecucion = string.IsNullOrWhiteSpace(config.HoraEjecucion) ? defaults.HoraEjecucion : NormalizeTime(config.HoraEjecucion),
            DiasEjecucion = diasEjecucion,
            CantidadEmpleadosPorBloque = config.CantidadEmpleadosPorBloque > 0 ? config.CantidadEmpleadosPorBloque : defaults.CantidadEmpleadosPorBloque,
            DelaySegundosEntreBloques = config.DelaySegundosEntreBloques > 0 ? config.DelaySegundosEntreBloques : defaults.DelaySegundosEntreBloques,
            Activo = fromDb is null ? defaults.Activo : config.Activo,
            UsuarioModificacion = config.UsuarioModificacion,
            FechaModificacion = config.FechaModificacion,
            UsaRespaldoAppSettings = fromDb is null
        };
    }

    private (string HoraEjecucion, IReadOnlyList<string> DiasEjecucion, int CantidadEmpleadosPorBloque, int DelaySegundosEntreBloques, bool Activo, string MensajeAdjunto) GetDefaults(string tipoReporte)
    {
        if (ReporteWhatsappTipos.IsGerencial(tipoReporte))
        {
            return (
                _defaults.HoraEjecucionGerencial,
                NormalizeDiasEjecucion(_defaults.DiasEjecucionGerencial),
                _defaults.CantidadEmpleadosPorBloqueGerencial,
                _defaults.DelaySegundosEntreBloquesGerencial,
                _defaults.ActivoGerencial,
                string.IsNullOrWhiteSpace(_defaults.MensajeAdjuntoGerencial) ? _defaults.MensajeAdjunto : _defaults.MensajeAdjuntoGerencial);
        }

        return (
            _defaults.HoraEjecucion,
            NormalizeDiasEjecucion(_defaults.DiasEjecucion),
            _defaults.CantidadEmpleadosPorBloque,
            _defaults.DelaySegundosEntreBloques,
            _defaults.Activo,
            _defaults.MensajeAdjunto);
    }

    private string GetMensajeAdjunto(string tipoReporte) => GetDefaults(tipoReporte).MensajeAdjunto;

    private static string GetModoEnvio(string tipoReporte) =>
        ReporteWhatsappTipos.IsGerencial(tipoReporte) ? "wsp" : "sms";

    private static string NormalizeTime(string value)
    {
        return TimeSpan.TryParse(value, CultureInfo.InvariantCulture, out var time)
            ? time.ToString(@"hh\:mm", CultureInfo.InvariantCulture)
            : value.Trim();
    }

    private static IReadOnlyList<string> NormalizeDiasEjecucion(IEnumerable<string>? dias)
    {
        if (dias is null)
        {
            return Array.Empty<string>();
        }

        return dias
            .Select(static dia => dia?.Trim().ToUpperInvariant() ?? string.Empty)
            .Where(static dia => dia is "MONDAY" or "TUESDAY" or "WEDNESDAY" or "THURSDAY" or "FRIDAY" or "SATURDAY" or "SUNDAY")
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();
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

    private static string BuildFileName(string tipoReporte, ReporteWhatsappEmpleadoDto empleado, ReporteWhatsappPeriodoDto periodo)
    {
        var employeeId = empleado.IdEmpleado > 0 ? empleado.IdEmpleado.ToString(CultureInfo.InvariantCulture) : "0";
        return ReporteWhatsappTipos.IsGerencial(tipoReporte)
            ? $"rpt_asistencia_gerencial_{employeeId}_{periodo.FechaProceso:yyyyMMdd}.pdf"
            : $"rpt_asistencia_{employeeId}_{periodo.FechaProceso:yyyyMMdd}.pdf";
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

    private static int EstimateRemainingSeconds(ReporteWhatsappRuntimeStatusDto runtime, int delaySegundosEntreBloques)
    {
        var empleadosPendientes = Math.Max(0, runtime.TotalEmpleados - runtime.EmpleadosProcesados);
        var bloquesPendientes = Math.Max(0, runtime.TotalBloques - runtime.BloqueActual);
        return empleadosPendientes + (bloquesPendientes * Math.Max(0, delaySegundosEntreBloques));
    }

    private static List<List<ReporteWhatsappEmpleadoDto>> Chunk(IReadOnlyList<ReporteWhatsappEmpleadoDto> items, int chunkSize)
    {
        var size = Math.Max(1, chunkSize);
        var result = new List<List<ReporteWhatsappEmpleadoDto>>();

        for (var index = 0; index < items.Count; index += size)
        {
            result.Add(items.Skip(index).Take(size).ToList());
        }

        return result;
    }

    private static bool RutaCoincide(string? actual, string esperada)
    {
        if (string.IsNullOrWhiteSpace(actual))
        {
            return false;
        }

        return string.Equals(actual.Trim().TrimEnd('/'), esperada.Trim().TrimEnd('/'), StringComparison.OrdinalIgnoreCase);
    }

    private static ReporteWhatsappRuntimeStatusDto Clone(ReporteWhatsappRuntimeStatusDto source)
    {
        return new ReporteWhatsappRuntimeStatusDto
        {
            TipoReporte = source.TipoReporte,
            ExecutionId = source.ExecutionId,
            IsRunning = source.IsRunning,
            OrigenEjecucion = source.OrigenEjecucion,
            UsuarioEjecucion = source.UsuarioEjecucion,
            FechaInicio = source.FechaInicio,
            FechaFin = source.FechaFin,
            Mensaje = source.Mensaje,
            TotalEmpleados = source.TotalEmpleados,
            EmpleadosProcesados = source.EmpleadosProcesados,
            Enviados = source.Enviados,
            Errores = source.Errores,
            Omitidos = source.Omitidos,
            Duplicados = source.Duplicados,
            BloqueActual = source.BloqueActual,
            TotalBloques = source.TotalBloques,
            EmpleadoActualId = source.EmpleadoActualId,
            EmpleadoActualNombre = source.EmpleadoActualNombre,
            SegundosRestantesEstimados = source.SegundosRestantesEstimados,
            SegundosEsperaBloqueActual = source.SegundosEsperaBloqueActual,
            Periodo = source.Periodo is null
                ? null
                : new ReporteWhatsappPeriodoDto
                {
                    FechaInicio = source.Periodo.FechaInicio,
                    FechaFin = source.Periodo.FechaFin,
                    FechaProceso = source.Periodo.FechaProceso,
                    EtiquetaPeriodo = source.Periodo.EtiquetaPeriodo
                }
        };
    }
}
