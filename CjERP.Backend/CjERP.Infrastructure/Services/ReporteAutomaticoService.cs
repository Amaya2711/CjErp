using System.Diagnostics;
using System.Globalization;
using System.Text.Json;
using CjERP.Application.DTOs;
using CjERP.Application.DTOs.ReportesWhatsapp;
using CjERP.Application.Interfaces.Repositories;
using CjERP.Application.Interfaces.Services;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace CjERP.Infrastructure.Services;

public sealed class ReporteAutomaticoService : IReporteAutomaticoService
{
    private static readonly TimeSpan PdfGenerationTimeout = TimeSpan.FromSeconds(20);
    private static readonly TimeSpan WupSendTimeout = TimeSpan.FromSeconds(30);
    private const int WupMaxAttempts = 2;
    private const int WupRetryDelaySeconds = 2;
    private static readonly string[] RutasModuloRptWup =
    [
        "/mantenimiento/sistemas/rptwup",
        "/mantenimiento/sistemas/rptwupgerencial"
    ];

    private static readonly string[] RolesPermitidos = ["ADMIN", "ADMINISTRADOR", "TI", "RRHH", "SISTEMAS", "SUPERADMIN"];

    private readonly IReporteRepository _reporteRepository;
    private readonly IReportePdfService _reportePdfService;
    private readonly IAsistenciaReporteService _asistenciaReporteService;
    private readonly IWupService _wupService;
    private readonly IReporteWhatsappRuntimeMonitor _runtimeMonitor;
    private readonly ISegMenuService _segMenuService;
    private readonly ReporteWhatsappJobDefaultsOptions _defaults;
    private readonly WupSettings _wupSettings;
    private readonly ILogger<ReporteAutomaticoService> _logger;
    private static readonly TimeSpan PdfGenerationDiagnosticTimeout = TimeSpan.FromSeconds(60);

    public ReporteAutomaticoService(
        IReporteRepository reporteRepository,
        IReportePdfService reportePdfService,
        IAsistenciaReporteService asistenciaReporteService,
        IWupService wupService,
        IReporteWhatsappRuntimeMonitor runtimeMonitor,
        ISegMenuService segMenuService,
        IOptions<ReporteWhatsappJobDefaultsOptions> defaults,
        IOptions<WupSettings> wupSettings,
        ILogger<ReporteAutomaticoService> logger)
    {
        _reporteRepository = reporteRepository;
        _reportePdfService = reportePdfService;
        _asistenciaReporteService = asistenciaReporteService;
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
        return Task.FromResult(BuildPeriodoActual(ReporteWhatsappTipos.Operativo, null));
    }

    public async Task<ReporteWhatsappDashboardDto> ObtenerDashboardAsync(string idUsuario, string tipoReporte, int topLogs = 200, CancellationToken cancellationToken = default)
    {
        var normalizedType = ReporteWhatsappTipos.Normalize(tipoReporte);
        var configuracion = await ObtenerConfiguracionAsync(normalizedType, cancellationToken);
        var periodo = BuildPeriodoActual(normalizedType, configuracion);
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
        var periodo = BuildPeriodoActual(normalizedType, configuracion);
        var executionId = Guid.NewGuid().ToString("N");

        var runtime = new ReporteWhatsappRuntimeStatusDto
        {
            TipoReporte = normalizedType,
            ExecutionId = executionId,
            IsRunning = true,
            OrigenEjecucion = origenEjecucion,
            UsuarioEjecucion = usuarioEjecucion,
            FechaInicio = GetPeruNow(),
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
                runtime.FechaFin = GetPeruNow();
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
            runtime.FechaFin = GetPeruNow();
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
            runtime.FechaFin = GetPeruNow();
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
            SetRuntimeStep(tipoReporte, runtime, $"Validando destino WUP de {empleado.NombreEmpleado}.");

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
                SetRuntimeStep(tipoReporte, runtime, $"Preparando dataset gerencial para {empleado.NombreEmpleado}.");
                detalle = detalleGerencial ?? Array.Empty<ReporteWhatsappAsistenciaItemDto>();
            }
            else
            {
                SetRuntimeStep(tipoReporte, runtime, $"Consultando asistencia para {empleado.NombreEmpleado}.");
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
                SetRuntimeStep(
                    tipoReporte,
                    runtime,
                    ReporteWhatsappTipos.IsGerencial(tipoReporte)
                        ? $"Generando PDF gerencial ejecutivo para {empleado.NombreEmpleado}."
                        : $"Generando PDF de asistencia para {empleado.NombreEmpleado}.");

                using var pdfTimeoutCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
                pdfTimeoutCts.CancelAfter(PdfGenerationTimeout);
                if (ReporteWhatsappTipos.IsGerencial(tipoReporte))
                {
                    pdfBytes = await _asistenciaReporteService.GenerarPdfGerencialEjecutivoAsync(
                        new AsistenciaGerencialPdfRequestDto
                        {
                            FechaInicio = periodo.FechaInicio,
                            FechaFin = periodo.FechaFin,
                            UsarPeriodoAutomatico = false,
                            Destinatario = "Gerencia CJ Telecom"
                        },
                        pdfTimeoutCts.Token);
                }
                else
                {
                    pdfBytes = await _reportePdfService.GenerarReportePdfAsync(tipoReporte, empleado, periodo, detalle, pdfTimeoutCts.Token);
                }

                _logger.LogInformation(
                    "[ReporteWUP] PDF generado. Tipo={TipoReporte}, EmpleadoId={EmpleadoId}, Empleado={Empleado}, Registros={Registros}, PdfBytes={PdfBytes}, AdvertenciaTimeout={AdvertenciaTimeout}",
                    tipoReporte,
                    empleado.IdEmpleado,
                    empleado.NombreEmpleado,
                    detalle.Count,
                    pdfBytes.Length,
                    "Si el dashboard vuelve a quedarse en esta etapa mas de 60s, el foco es QuestPDF/report builder.");

                if (stopwatch.Elapsed > PdfGenerationDiagnosticTimeout)
                {
                    _logger.LogWarning(
                        "[ReporteWUP] La generacion del PDF tomo mas de lo esperado. Tipo={TipoReporte}, EmpleadoId={EmpleadoId}, Empleado={Empleado}, Segundos={Segundos}",
                        tipoReporte,
                        empleado.IdEmpleado,
                        empleado.NombreEmpleado,
                        Math.Round(stopwatch.Elapsed.TotalSeconds, 2));
                }
            }
            catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
            {
                log.EstadoEnvio = "ERROR_GENERANDO_REPORTE_TIMEOUT";
                log.MensajeError = $"La generacion del PDF supero el tiempo maximo permitido de {PdfGenerationTimeout.TotalSeconds:0} segundos.";
                runtime.Errores++;
                SetRuntimeStep(tipoReporte, runtime, $"Timeout generando PDF para {empleado.NombreEmpleado}.");
                return;
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

            var nombreArchivo = ReporteWhatsappTipos.IsGerencial(tipoReporte)
                ? $"Reporte_Gerencial_Asistencia_{ParsePeriodoDate(periodo.FechaInicio):yyyyMMdd}_{ParsePeriodoDate(periodo.FechaFin):yyyyMMdd}.pdf"
                : BuildFileName(tipoReporte, empleado, periodo);

            var request = new ReporteWhatsappSendRequestDto
            {
                NombreArchivo = nombreArchivo,
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
                pdfBytesLength = pdfBytes.Length,
                reporteGerencial = ReporteWhatsappTipos.IsGerencial(tipoReporte),
                totalEmpleadosResumen = ReporteWhatsappTipos.IsGerencial(tipoReporte) ? empleadosDestino.Count : 1,
                pdfGeneratorVersion = ReporteWhatsappTipos.IsGerencial(tipoReporte)
                    ? "GERENCIAL_EXEC_V2_20260530"
                    : "OPERATIVO_V1"
            });

            SetRuntimeStep(tipoReporte, runtime, $"Enviando PDF a WUP para {empleado.NombreEmpleado}.");
            _logger.LogInformation(
                "[ReporteWUP] Iniciando envio WUP. Tipo={TipoReporte}, EmpleadoId={EmpleadoId}, Empleado={Empleado}, Telefono={Telefono}, Archivo={Archivo}, Base64Length={Base64Length}",
                tipoReporte,
                empleado.IdEmpleado,
                empleado.NombreEmpleado,
                telefonoNormalizado,
                request.NombreArchivo,
                request.Contenido?.Length ?? 0);

            var response = await ExecuteWithRetryAsync(
                async sendToken =>
                {
                    using var attemptTimeoutCts = CancellationTokenSource.CreateLinkedTokenSource(sendToken);
                    attemptTimeoutCts.CancelAfter(WupSendTimeout);
                    return await _wupService.EnviarAdjuntoAsync(request, attemptTimeoutCts.Token);
                },
                WupMaxAttempts,
                cancellationToken);

            log.ResponseJson = response.ResponseBody;

            if (!response.Success)
            {
                log.EstadoEnvio = "ERROR_ENDPOINT_WUP";
                log.MensajeError = string.IsNullOrWhiteSpace(response.ErrorMessage)
                    ? "El endpoint WUP respondio sin confirmar exito."
                    : response.ErrorMessage;
                runtime.Errores++;
                SetRuntimeStep(tipoReporte, runtime, $"WUP rechazo o no confirmo el envio para {empleado.NombreEmpleado}.");
                return;
            }

            log.EstadoEnvio = "ENVIADO";
            log.FechaEnvio = GetPeruNow();
            runtime.Enviados++;
            SetRuntimeStep(tipoReporte, runtime, $"PDF enviado correctamente a {empleado.NombreEmpleado}.");
        }
        catch (Exception ex)
        {
            log.EstadoEnvio = "ERROR";
            log.MensajeError = ex.Message;
            runtime.Errores++;
            SetRuntimeStep(tipoReporte, runtime, $"Error procesando a {empleado.NombreEmpleado}: {ex.Message}");
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

            try
            {
                await _reporteRepository.InsertarLogAsync(log, cancellationToken);
            }
            catch (Exception ex)
            {
                runtime.Errores++;
                runtime.Mensaje = $"No se pudo registrar el log del envio: {ex.Message}";
                _logger.LogError(
                    ex,
                    "[ReporteWUP] No se pudo registrar el log. Tipo={TipoReporte}, EmpleadoId={EmpleadoId}, Empleado={Empleado}, Estado={Estado}",
                    tipoReporte,
                    empleado.IdEmpleado,
                    empleado.NombreEmpleado,
                    log.EstadoEnvio);
            }

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
            .Select(item =>
            {
                if (item.IdEmpleado > 0 && empleadosById.TryGetValue(item.IdEmpleado, out var empleado))
                {
                    item.NombreEmpleado = string.IsNullOrWhiteSpace(item.NombreEmpleado) ? empleado.NombreEmpleado : item.NombreEmpleado;
                    item.Ubicacion = string.IsNullOrWhiteSpace(item.Ubicacion) ? empleado.Ubicacion : item.Ubicacion;
                }

                return item;
            })
            .ToList();
    }

    private static async Task<ReporteWhatsappSendResponseDto> ExecuteWithRetryAsync(
        Func<CancellationToken, Task<ReporteWhatsappSendResponseDto>> action,
        int maxAttempts,
        CancellationToken cancellationToken)
    {
        ReporteWhatsappSendResponseDto? last = null;

        for (var attempt = 1; attempt <= maxAttempts; attempt++)
        {
            cancellationToken.ThrowIfCancellationRequested();
            try
            {
                last = await action(cancellationToken);
            }
            catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
            {
                last = new ReporteWhatsappSendResponseDto
                {
                    Success = false,
                    StatusCode = 408,
                    ResponseBody = string.Empty,
                    ErrorMessage = $"El envio a WUP supero el tiempo maximo permitido de {WupSendTimeout.TotalSeconds:0} segundos."
                };
            }

            if (last.Success)
            {
                return last;
            }

            if (attempt < maxAttempts)
            {
                await Task.Delay(TimeSpan.FromSeconds(WupRetryDelaySeconds), cancellationToken);
            }
        }

        return last ?? new ReporteWhatsappSendResponseDto
        {
            Success = false,
            ErrorMessage = "No se obtuvo respuesta del servicio WUP."
        };
    }

    private void SetRuntimeStep(string tipoReporte, ReporteWhatsappRuntimeStatusDto runtime, string message)
    {
        runtime.Mensaje = message;
        _runtimeMonitor.Update(tipoReporte, Clone(runtime));
        _logger.LogInformation(
            "[ReporteWUP] Runtime step. Tipo={TipoReporte}, ExecutionId={ExecutionId}, EmpleadoActual={EmpleadoActual}, Mensaje={Mensaje}",
            tipoReporte,
            runtime.ExecutionId,
            runtime.EmpleadoActualNombre,
            message);
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
            UsarSemanaEnCurso = ReporteWhatsappTipos.IsGerencial(tipoReporte)
                ? (fromDb is null ? defaults.UsarSemanaEnCurso : config.UsarSemanaEnCurso)
                : false,
            UsarMesEnCurso = ReporteWhatsappTipos.IsGerencial(tipoReporte)
                ? (fromDb is null ? defaults.UsarMesEnCurso : config.UsarMesEnCurso)
                : false,
            UsuarioModificacion = config.UsuarioModificacion,
            FechaModificacion = config.FechaModificacion,
            UsaRespaldoAppSettings = fromDb is null
        };
    }

    private (string HoraEjecucion, IReadOnlyList<string> DiasEjecucion, int CantidadEmpleadosPorBloque, int DelaySegundosEntreBloques, bool Activo, bool UsarSemanaEnCurso, bool UsarMesEnCurso, string MensajeAdjunto) GetDefaults(string tipoReporte)
    {
        if (ReporteWhatsappTipos.IsGerencial(tipoReporte))
        {
            return (
                _defaults.HoraEjecucionGerencial,
                NormalizeDiasEjecucion(_defaults.DiasEjecucionGerencial),
                _defaults.CantidadEmpleadosPorBloqueGerencial,
                _defaults.DelaySegundosEntreBloquesGerencial,
                _defaults.ActivoGerencial,
                _defaults.UsarSemanaEnCursoGerencial,
                _defaults.UsarMesEnCursoGerencial,
                string.IsNullOrWhiteSpace(_defaults.MensajeAdjuntoGerencial) ? _defaults.MensajeAdjunto : _defaults.MensajeAdjuntoGerencial);
        }

        return (
            _defaults.HoraEjecucion,
            NormalizeDiasEjecucion(_defaults.DiasEjecucion),
            _defaults.CantidadEmpleadosPorBloque,
            _defaults.DelaySegundosEntreBloques,
            _defaults.Activo,
            false,
            false,
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

    private static ReporteWhatsappPeriodoDto BuildPeriodoActual(string tipoReporte, ReporteWhatsappConfiguracionDto? configuracion)
    {
        var timeZone = ResolvePeruTimeZone();
        var now = TimeZoneInfo.ConvertTime(DateTimeOffset.UtcNow, timeZone).Date;

        DateTime start;
        DateTime end;

        if (ReporteWhatsappTipos.IsGerencial(tipoReporte) && configuracion?.UsarMesEnCurso == true)
        {
            start = new DateTime(now.Year, now.Month, 1);
            end = now;
        }
        else if (ReporteWhatsappTipos.IsGerencial(tipoReporte))
        {
            var offset = ((int)now.DayOfWeek + 6) % 7;
            var currentWeekStart = now.AddDays(-offset);
            start = currentWeekStart.AddDays(-7);
            end = start.AddDays(6);
        }
        else if (now.Day == 1)
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

    private static DateTime GetPeruNow()
    {
        return TimeZoneInfo.ConvertTime(DateTimeOffset.UtcNow, ResolvePeruTimeZone()).DateTime;
    }

    private static string BuildFileName(string tipoReporte, ReporteWhatsappEmpleadoDto empleado, ReporteWhatsappPeriodoDto periodo)
    {
        var employeeId = empleado.IdEmpleado > 0 ? empleado.IdEmpleado.ToString(CultureInfo.InvariantCulture) : "0";
        return ReporteWhatsappTipos.IsGerencial(tipoReporte)
            ? $"Reporte_Gerencial_Asistencia_{ParsePeriodoDate(periodo.FechaInicio):yyyyMMdd}_{ParsePeriodoDate(periodo.FechaFin):yyyyMMdd}.pdf"
            : $"rpt_asistencia_{employeeId}_{periodo.FechaProceso:yyyyMMdd}.pdf";
    }

    private static DateTime ParsePeriodoDate(string value)
    {
        if (DateTime.TryParseExact(value, "dd/MM/yyyy", CultureInfo.InvariantCulture, DateTimeStyles.None, out var displayDate))
        {
            return displayDate;
        }

        if (DateTime.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsed))
        {
            return parsed;
        }

        return DateTime.Today;
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
