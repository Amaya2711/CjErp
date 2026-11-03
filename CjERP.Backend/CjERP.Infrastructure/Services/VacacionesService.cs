using System.Data;
using CjERP.Application.DTOs;
using CjERP.Application.Interfaces.Services;
using CjERP.Infrastructure.Persistence.Sql;
using Dapper;
using Microsoft.Extensions.Logging;

namespace CjERP.Infrastructure.Services;

public sealed class VacacionesService : IVacacionesService
{
    private const string GrabarSp = "dbo.sp_EmpleadoOtros_GrabarVacaciones";
    private const string AprobarSp = "dbo.sp_EmpleadoOtros_ActualizaarVacaciones";
    private const string PoliticaGuardarSp = "dbo.sp_Vacacion_Politica_Guardar";
    private const string PeriodoGenerarSp = "dbo.sp_Vacacion_Periodo_Generar";
    private const string PeriodoGenerarMasivoSp = "dbo.sp_Vacacion_Periodo_GenerarMasivo";
    private const string SaldoConsultarSp = "dbo.sp_Vacacion_Saldo_Consultar";
    private const string SolicitudRegistrarSp = "dbo.sp_Vacacion_Solicitud_Registrar";
    private const string SolicitudAprobarSp = "dbo.sp_Vacacion_Solicitud_Aprobar";
    private const string SolicitudRechazarSp = "dbo.sp_Vacacion_Solicitud_Rechazar";
    private const string SolicitudCancelarSp = "dbo.sp_Vacacion_Solicitud_Cancelar";
    private const string SolicitudFinalizarSp = "dbo.sp_Vacacion_Solicitud_Finalizar";
    private const string MovimientoRevertirSp = "dbo.sp_Vacacion_Movimiento_Revertir";

    private const int EstadoTerceraValidacion = 99;
    // Regla de negocio: una solicitud (inicio y fin inclusive) no puede ser menor a 7 días.
    private const int MinDiasSolicitud = 7;
    private static readonly TimeSpan TiempoMaximoCorreo = TimeSpan.FromSeconds(45);

    private readonly ISqlCommandFactory _sqlCommandFactory;
    private readonly IVacacionesCorreoService _correoService;
    private readonly ILogger<VacacionesService> _logger;

    public VacacionesService(
        ISqlCommandFactory sqlCommandFactory,
        IVacacionesCorreoService correoService,
        ILogger<VacacionesService> logger)
    {
        _sqlCommandFactory = sqlCommandFactory;
        _correoService = correoService;
        _logger = logger;
    }

    public async Task<VacacionesGrabarResultDto> GrabarAsync(
        VacacionesGrabarRequestDto request,
        string usuarioAccion,
        CancellationToken cancellationToken = default)
    {
        ValidarRequest(request);

        await using var connection = _sqlCommandFactory.CreateConnection();
        var result = await connection.QueryFirstOrDefaultAsync<VacacionesGrabarResultDto>(
            _sqlCommandFactory.Create(
                GrabarSp,
                BuildParameters(request, usuarioAccion),
                CommandType.StoredProcedure,
                cancellationToken,
                commandTimeout: 120));

        if (result is null)
        {
            return new VacacionesGrabarResultDto
            {
                Exito = 1,
                Mensaje = "Vacaciones registradas correctamente."
            };
        }

        var exito = result.Exito ?? result.Resultado ?? 1;
        result.Mensaje ??= exito == 1
            ? "Vacaciones registradas correctamente."
            : "No se pudo registrar las vacaciones.";

        return result;
    }

    public async Task<VacacionesGrabarResultDto> RechazarAsync(
        VacacionesRechazarRequestDto request,
        string usuarioAccion,
        CancellationToken cancellationToken = default)
    {
        ValidarRechazoRequest(request);

        await using var connection = _sqlCommandFactory.CreateConnection();

        var rowsAffected = await connection.ExecuteAsync(
            _sqlCommandFactory.Create(
                @"UPDATE dbo.EmpleadoOtros
                  SET IdEstado = 0
                  WHERE IdEmpleadoCj = @IdEmpleadoCj
                    AND FechaInicio = @FechaInicio
                    AND FechaFin = @FechaFin
                    AND IdEstado IN (97, 98, 99)",
                new
                {
                    request.IdEmpleadoCj,
                    FechaInicio = request.FechaInicio.Date,
                    FechaFin = request.FechaFin.Date,
                    Usuario = string.IsNullOrWhiteSpace(usuarioAccion) ? "sistema" : usuarioAccion.Trim()
                },
                CommandType.Text,
                cancellationToken,
                commandTimeout: 120));

        return new VacacionesGrabarResultDto
        {
            Exito = rowsAffected > 0 ? 1 : 0,
            Resultado = rowsAffected > 0 ? 1 : 0,
            Mensaje = rowsAffected > 0
                ? "Vacaciones rechazadas correctamente."
                : "No se encontraron vacaciones activas para rechazar.",
            DiasSolicitados = null,
            DiasInsertados = rowsAffected
        };
    }

    public async Task<VacacionesGrabarResultDto> ModificarFechasAsync(
        VacacionesModificarFechasRequestDto request,
        string usuarioAccion,
        CancellationToken cancellationToken = default)
    {
        ValidarModificacionFechasRequest(request);

        var fechaInicio = request.FechaInicio.Date;
        var fechaFin = request.FechaFin.Date;
        var nuevaInicio = request.NuevaFechaInicio.Date;
        var nuevaFin = request.NuevaFechaFin.Date;
        var diasNuevos = (nuevaFin - nuevaInicio).Days + 1;

        await using var connection = _sqlCommandFactory.CreateConnection();

        // Solo se puede modificar mientras no esté aprobada al 100 % (97/98/99 = validaciones pendientes).
        var estadoActual = await connection.QueryFirstOrDefaultAsync<int?>(
            _sqlCommandFactory.Create(
                @"SELECT TOP 1 IdEstado
                  FROM dbo.EmpleadoOtros
                  WHERE IdEmpleadoCj = @IdEmpleadoCj AND FechaInicio = @FechaInicio AND FechaFin = @FechaFin
                    AND IdEstado IN (0, 97, 98, 99)
                  ORDER BY IdEstado DESC",
                new { request.IdEmpleadoCj, FechaInicio = fechaInicio, FechaFin = fechaFin },
                CommandType.Text,
                cancellationToken));

        if (estadoActual is null or 0)
        {
            throw new InvalidOperationException(
                "Solo se pueden modificar las fechas de solicitudes pendientes de validación (no aprobadas al 100 % ni rechazadas).");
        }

        // Otras solicitudes vigentes del empleado (excluye rechazadas y la que se modifica).
        var otras = (await connection.QueryAsync<(DateTime FechaInicio, DateTime FechaFin, int IdEstado)>(
            _sqlCommandFactory.Create(
                @"SELECT DISTINCT CAST(FechaInicio AS date) AS FechaInicio, CAST(FechaFin AS date) AS FechaFin, IdEstado
                  FROM dbo.EmpleadoOtros
                  WHERE IdEmpleadoCj = @IdEmpleadoCj
                    AND IdEstado IN (97, 98, 99, 4)
                    AND NOT (FechaInicio = @FechaInicio AND FechaFin = @FechaFin)",
                new { request.IdEmpleadoCj, FechaInicio = fechaInicio, FechaFin = fechaFin },
                CommandType.Text,
                cancellationToken))).ToList();

        var cruce = otras.FirstOrDefault(o => o.FechaInicio <= nuevaFin && o.FechaFin >= nuevaInicio);
        if (cruce != default)
        {
            throw new InvalidOperationException(
                $"Las nuevas fechas se cruzan con otra solicitud del empleado ({cruce.FechaInicio:dd/MM/yyyy} al {cruce.FechaFin:dd/MM/yyyy}).");
        }

        // Saldo (SaldoVacaciones del listado legacy: calculado − tomadas) menos los días de las otras solicitudes pendientes.
        var filasSaldo = await connection.QueryAsync(
            _sqlCommandFactory.Create(
                "dbo.sp_EmpleadoOtros_ListarVacaciones",
                new { IdEmpleadoCj = request.IdEmpleadoCj },
                CommandType.StoredProcedure,
                cancellationToken,
                commandTimeout: 120));

        decimal? saldo = filasSaldo
            .Select(f => ((IDictionary<string, object?>)f).TryGetValue("SaldoVacaciones", out var v) && v is not null
                ? Convert.ToDecimal(v)
                : (decimal?)null)
            .FirstOrDefault(v => v is not null);

        if (saldo is not null)
        {
            var diasPendientesOtras = otras
                .Where(o => o.IdEstado is 97 or 98 or 99)
                .Sum(o => (o.FechaFin - o.FechaInicio).Days + 1);
            var disponible = saldo.Value - diasPendientesOtras;

            if (diasNuevos > disponible)
            {
                throw new InvalidOperationException(
                    $"Los días solicitados ({diasNuevos}) superan el saldo disponible ({disponible:0.##}): saldo {saldo.Value:0.##} menos {diasPendientesOtras} día(s) en otras solicitudes pendientes.");
            }
        }

        // EmpleadoOtros guarda UNA FILA POR DÍA (Fecha). Además de cambiar FechaInicio/FechaFin hay que
        // sincronizar los días: borrar los que quedan fuera del nuevo rango y crear los que faltan
        // (copiando una fila de la solicitud). Si no, quedan días huérfanos en 97/98/99 que se ven como
        // una solicitud pendiente aunque el resto ya esté aprobado. Todo en una transacción.
        var filas = await connection.QueryFirstAsync<int>(
            _sqlCommandFactory.Create(
                @"SET XACT_ABORT ON;
                  BEGIN TRAN;

                  SELECT TOP 1 * INTO #tpl
                  FROM dbo.EmpleadoOtros
                  WHERE IdEmpleadoCj = @IdEmpleadoCj AND FechaInicio = @FechaInicio AND FechaFin = @FechaFin
                    AND IdEstado IN (97, 98, 99)
                  ORDER BY Fecha;

                  -- Días del nuevo rango que aún no tienen fila en la solicitud
                  SELECT DATEADD(DAY, n.i, @NuevaFechaInicio) AS Fecha
                  INTO #dias
                  FROM (SELECT TOP (DATEDIFF(DAY, @NuevaFechaInicio, @NuevaFechaFin) + 1)
                               ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) - 1 AS i
                        FROM sys.all_objects) n
                  WHERE NOT EXISTS (
                      SELECT 1 FROM dbo.EmpleadoOtros x
                      WHERE x.IdEmpleadoCj = @IdEmpleadoCj AND x.FechaInicio = @FechaInicio AND x.FechaFin = @FechaFin
                        AND x.IdEstado IN (97, 98, 99)
                        AND CAST(x.Fecha AS date) = DATEADD(DAY, n.i, @NuevaFechaInicio));

                  DELETE FROM dbo.EmpleadoOtros
                  WHERE IdEmpleadoCj = @IdEmpleadoCj AND FechaInicio = @FechaInicio AND FechaFin = @FechaFin
                    AND IdEstado IN (97, 98, 99)
                    AND CAST(Fecha AS date) NOT BETWEEN @NuevaFechaInicio AND @NuevaFechaFin;

                  IF EXISTS (SELECT 1 FROM #dias) AND EXISTS (SELECT 1 FROM #tpl)
                  BEGIN
                      DECLARE @cols NVARCHAR(MAX), @sel NVARCHAR(MAX);
                      SELECT @cols = STRING_AGG(CAST(QUOTENAME(name) AS NVARCHAR(MAX)), ',') WITHIN GROUP (ORDER BY column_id),
                             @sel  = STRING_AGG(CAST(CASE WHEN name = 'Fecha' THEN 'd.Fecha' ELSE 't.' + QUOTENAME(name) END AS NVARCHAR(MAX)), ',') WITHIN GROUP (ORDER BY column_id)
                      FROM sys.columns
                      WHERE object_id = OBJECT_ID('dbo.EmpleadoOtros')
                        AND is_identity = 0 AND is_computed = 0 AND system_type_id <> 189;

                      EXEC (N'INSERT INTO dbo.EmpleadoOtros (' + @cols + N') SELECT ' + @sel + N' FROM #tpl t CROSS JOIN #dias d');
                  END;

                  UPDATE dbo.EmpleadoOtros
                  SET FechaInicio = @NuevaFechaInicio, FechaFin = @NuevaFechaFin
                  WHERE IdEmpleadoCj = @IdEmpleadoCj
                    AND FechaInicio = @FechaInicio
                    AND FechaFin = @FechaFin
                    AND IdEstado IN (97, 98, 99);
                  DECLARE @filas INT = @@ROWCOUNT;

                  COMMIT;
                  SELECT @filas;",
                new
                {
                    request.IdEmpleadoCj,
                    FechaInicio = fechaInicio,
                    FechaFin = fechaFin,
                    NuevaFechaInicio = nuevaInicio,
                    NuevaFechaFin = nuevaFin
                },
                CommandType.Text,
                cancellationToken,
                commandTimeout: 120));

        _logger.LogInformation(
            "[Vacaciones] Modificación de fechas IdEmpleadoCj={IdEmpleadoCj} {FechaInicio:yyyy-MM-dd}/{FechaFin:yyyy-MM-dd} -> {NuevaInicio:yyyy-MM-dd}/{NuevaFin:yyyy-MM-dd} por {Usuario}. Filas={Filas}",
            request.IdEmpleadoCj, fechaInicio, fechaFin, nuevaInicio, nuevaFin, NormalizeUsuario(usuarioAccion), filas);

        return new VacacionesGrabarResultDto
        {
            Exito = filas > 0 ? 1 : 0,
            Resultado = filas > 0 ? 1 : 0,
            Mensaje = filas > 0
                ? "Fechas de vacaciones modificadas correctamente."
                : "No se encontró la solicitud pendiente para modificar.",
            DiasSolicitados = diasNuevos,
            DiasInsertados = filas
        };
    }

    private static void ValidarModificacionFechasRequest(VacacionesModificarFechasRequestDto request)
    {
        ValidarRechazoRequest(new VacacionesRechazarRequestDto
        {
            IdEmpleadoCj = request.IdEmpleadoCj,
            FechaInicio = request.FechaInicio,
            FechaFin = request.FechaFin
        });

        if (request.NuevaFechaInicio == default || request.NuevaFechaFin == default)
        {
            throw new InvalidOperationException("Debe indicar las nuevas fechas de inicio y fin.");
        }

        if (request.NuevaFechaFin.Date < request.NuevaFechaInicio.Date)
        {
            throw new InvalidOperationException("La nueva fecha fin no puede ser menor que la nueva fecha inicio.");
        }

        var dias = (request.NuevaFechaFin.Date - request.NuevaFechaInicio.Date).Days + 1;
        if (dias < MinDiasSolicitud)
        {
            throw new InvalidOperationException(
                $"No se puede registrar menos de {MinDiasSolicitud} días de vacaciones (se solicitaron {dias}).");
        }

        if (request.NuevaFechaInicio.Date == request.FechaInicio.Date && request.NuevaFechaFin.Date == request.FechaFin.Date)
        {
            throw new InvalidOperationException("Las fechas indicadas son iguales a las actuales.");
        }
    }

    public async Task<VacacionesGrabarResultDto> AprobarAsync(
        VacacionesAprobarRequestDto request,
        string usuarioAccion,
        int idUsuarioAprueba,
        CancellationToken cancellationToken = default)
    {
        ValidarAprobacionRequest(request);

        await using var connection = _sqlCommandFactory.CreateConnection();
        var parametrosSp = new
        {
            request.IdEmpleadoCj,
            IdEstadoActual = request.IdEstadoActual,
            FechaInicio = request.FechaInicio.Date,
            FechaFin = request.FechaFin.Date,
            IdUsuarioAprueba = idUsuarioAprueba
        };

        _logger.LogInformation(
            "[Vacaciones] Ejecutando {StoredProcedure} con params {@Params}",
            AprobarSp,
            parametrosSp);

        var result = await connection.QueryFirstOrDefaultAsync<VacacionesGrabarResultDto>(
            _sqlCommandFactory.Create(
                AprobarSp,
                parametrosSp,
                CommandType.StoredProcedure,
                cancellationToken,
                commandTimeout: 120));

        var filasActualizadas =
            result?.FilasEmpleadoOtrosActualizadas
            ?? result?.Ok
            ?? result?.Exito
            ?? result?.Resultado
            ?? 0;

        var resultado = new VacacionesGrabarResultDto
        {
            Exito = filasActualizadas > 0 ? 1 : 0,
            Resultado = filasActualizadas > 0 ? 1 : 0,
            Ok = filasActualizadas > 0 ? 1 : 0,
            Mensaje = filasActualizadas > 0
                ? (string.IsNullOrWhiteSpace(result?.Mensaje) ? "Vacaciones actualizadas correctamente." : result!.Mensaje)
                : "No se encontraron vacaciones para actualizar.",
            DiasSolicitados = null,
            DiasInsertados = filasActualizadas,
            FilasEmpleadoOtrosActualizadas = filasActualizadas
        };

        // Solo la aprobación de la 3ra validación dispara el correo con el PDF.
        if (filasActualizadas > 0 && request.IdEstadoActual == EstadoTerceraValidacion)
        {
            await EnviarCorreoAprobacionFinalAsync(request, resultado, cancellationToken);
        }

        return resultado;
    }

    /// <summary>La aprobación ya quedó registrada: un fallo del correo no la revierte, solo se informa.</summary>
    private async Task EnviarCorreoAprobacionFinalAsync(
        VacacionesAprobarRequestDto request,
        VacacionesGrabarResultDto resultado,
        CancellationToken cancellationToken)
    {
        try
        {
            using var limite = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            limite.CancelAfter(TiempoMaximoCorreo);

            var correo = await _correoService.EnviarCorreoAprobacionFinalAsync(
                request.IdEmpleadoCj,
                request.FechaInicio,
                request.FechaFin,
                limite.Token);

            resultado.CorreoEnviado = correo.Enviado;
            resultado.CorreoMensaje = correo.Mensaje;
        }
        catch (Exception ex)
        {
            _logger.LogError(
                ex,
                "[Vacaciones] No se pudo enviar el correo de aprobación final. IdEmpleadoCj={IdEmpleadoCj}, {FechaInicio:yyyy-MM-dd} a {FechaFin:yyyy-MM-dd}",
                request.IdEmpleadoCj,
                request.FechaInicio,
                request.FechaFin);

            resultado.CorreoEnviado = false;
            resultado.CorreoMensaje = $"La validación se registró, pero no se pudo enviar el correo: {ex.Message}";
        }
    }

    public Task<VacacionOperacionResultDto> GuardarPoliticaAsync(
        VacacionPoliticaGuardarRequestDto request,
        string usuarioAccion,
        CancellationToken cancellationToken = default)
    {
        ValidarPoliticaRequest(request);

        return ExecuteOperacionAsync(
            PoliticaGuardarSp,
            new
            {
                request.IdPolitica,
                request.Codigo,
                request.Nombre,
                request.Descripcion,
                request.DiasBase,
                request.DiasAdicionales,
                request.DiasMaximoAcumulable,
                request.MesesMinimosGoce,
                request.PermiteFraccionamiento,
                request.MinDiasFraccion,
                request.MaxDiasPorSolicitud,
                request.Vigente,
                UsuarioAccion = NormalizeUsuario(usuarioAccion),
                request.Observacion
            },
            cancellationToken);
    }

    public Task<VacacionOperacionResultDto> GenerarPeriodoAsync(
        VacacionPeriodoGenerarRequestDto request,
        string usuarioAccion,
        CancellationToken cancellationToken = default)
    {
        ValidarPeriodoRequest(request);

        return ExecuteOperacionAsync(
            PeriodoGenerarSp,
            new
            {
                request.IdEmpleado,
                request.IdPolitica,
                request.Anio,
                UsuarioAccion = NormalizeUsuario(usuarioAccion),
                request.Observacion
            },
            cancellationToken);
    }

    public Task<VacacionOperacionResultDto> GenerarPeriodoMasivoAsync(
        VacacionPeriodoGenerarMasivoRequestDto request,
        string usuarioAccion,
        CancellationToken cancellationToken = default)
    {
        if (request.IdPolitica <= 0)
        {
            throw new InvalidOperationException("Debe indicar la política vacacional.");
        }

        if (request.Anio <= 2000)
        {
            throw new InvalidOperationException("Debe indicar un año válido.");
        }

        return ExecuteOperacionAsync(
            PeriodoGenerarMasivoSp,
            new
            {
                request.Anio,
                request.IdPolitica,
                UsuarioAccion = NormalizeUsuario(usuarioAccion),
                request.Observacion
            },
            cancellationToken);
    }

    public async Task<IReadOnlyList<VacacionSaldoDto>> ConsultarSaldoAsync(
        int idEmpleado,
        CancellationToken cancellationToken = default)
    {
        if (idEmpleado <= 0)
        {
            throw new InvalidOperationException("Debe indicar el empleado.");
        }

        await using var connection = _sqlCommandFactory.CreateConnection();
        var rows = await connection.QueryAsync<VacacionSaldoDto>(
            _sqlCommandFactory.Create(
                SaldoConsultarSp,
                new { IdEmpleado = idEmpleado },
                CommandType.StoredProcedure,
                cancellationToken,
                commandTimeout: 120));

        return rows.ToList();
    }

    public async Task<IReadOnlyList<VacacionSolicitudListItemDto>> ListarSolicitudesAsync(
        VacacionSolicitudListarRequestDto request,
        CancellationToken cancellationToken = default)
    {
        await using var connection = _sqlCommandFactory.CreateConnection();

        const string sql = """
            SELECT
                s.IdSolicitud,
                s.IdEmpleado,
                NombreEmpleado = LTRIM(RTRIM(ISNULL(e.NombreEmpleado, ''))),
                e.NroDocumento,
                s.IdPeriodo,
                p.Anio,
                s.FechaInicio,
                s.FechaFin,
                s.CantidadDias,
                s.Estado,
                s.Motivo,
                s.Observacion,
                s.FechaCreacion,
                s.UsuarioCreacion,
                s.FechaAprobacion,
                s.UsuarioAprobacion,
                s.FechaRechazo,
                s.UsuarioRechazo,
                s.MotivoRechazo,
                s.FechaCancelacion,
                s.UsuarioCancelacion,
                s.MotivoCancelacion,
                s.FechaFinalizacion,
                s.UsuarioFinalizacion
            FROM dbo.VacacionSolicitud s
            INNER JOIN dbo.VacacionPeriodo p
                ON p.IdPeriodo = s.IdPeriodo
            LEFT JOIN dbo.EmpleadoCj e
                ON e.IdEmpleado = s.IdEmpleado
            WHERE (@Estado IS NULL OR LTRIM(RTRIM(@Estado)) = '' OR s.Estado = @Estado)
              AND (@IdEmpleado IS NULL OR s.IdEmpleado = @IdEmpleado)
              AND (@FechaInicioDesde IS NULL OR s.FechaInicio >= @FechaInicioDesde)
              AND (@FechaInicioHasta IS NULL OR s.FechaInicio < DATEADD(DAY, 1, @FechaInicioHasta))
              AND (
                    @NombreEmpleado IS NULL
                    OR LTRIM(RTRIM(@NombreEmpleado)) = ''
                    OR ISNULL(e.NombreEmpleado, '') LIKE '%' + @NombreEmpleado + '%'
                  )
            ORDER BY s.FechaCreacion DESC, s.IdSolicitud DESC;
            """;

        var rows = await connection.QueryAsync<VacacionSolicitudListItemDto>(
            _sqlCommandFactory.Create(
                sql,
                new
                {
                    Estado = string.IsNullOrWhiteSpace(request.Estado) ? null : request.Estado.Trim(),
                    request.IdEmpleado,
                    FechaInicioDesde = request.FechaInicioDesde?.Date,
                    FechaInicioHasta = request.FechaInicioHasta?.Date,
                    NombreEmpleado = string.IsNullOrWhiteSpace(request.NombreEmpleado) ? null : request.NombreEmpleado.Trim()
                },
                CommandType.Text,
                cancellationToken,
                commandTimeout: 120));

        return rows.ToList();
    }

    public async Task<IReadOnlyList<VacacionMovimientoListItemDto>> ListarMovimientosAsync(
        VacacionMovimientoListarRequestDto request,
        CancellationToken cancellationToken = default)
    {
        await using var connection = _sqlCommandFactory.CreateConnection();

        const string sql = """
            SELECT
                m.IdVacacionMovimiento,
                m.IdEmpleado,
                NombreEmpleado = LTRIM(RTRIM(ISNULL(e.NombreEmpleado, ''))),
                e.NroDocumento,
                m.IdPeriodo,
                p.Anio,
                m.IdSolicitud,
                m.FechaMovimiento,
                m.TipoMovimiento,
                m.CantidadDias,
                m.Estado,
                m.Referencia,
                m.Observacion,
                m.IdMovimientoOrigen,
                m.UsuarioCreacion,
                m.FechaCreacion
            FROM dbo.VacacionMovimiento m
            LEFT JOIN dbo.VacacionPeriodo p
                ON p.IdPeriodo = m.IdPeriodo
            LEFT JOIN dbo.EmpleadoCj e
                ON e.IdEmpleado = m.IdEmpleado
            WHERE (@Estado IS NULL OR LTRIM(RTRIM(@Estado)) = '' OR m.Estado = @Estado)
              AND (@TipoMovimiento IS NULL OR LTRIM(RTRIM(@TipoMovimiento)) = '' OR m.TipoMovimiento = @TipoMovimiento)
              AND (@IdEmpleado IS NULL OR m.IdEmpleado = @IdEmpleado)
              AND (@FechaDesde IS NULL OR m.FechaMovimiento >= @FechaDesde)
              AND (@FechaHasta IS NULL OR m.FechaMovimiento < DATEADD(DAY, 1, @FechaHasta))
              AND (
                    @NombreEmpleado IS NULL
                    OR LTRIM(RTRIM(@NombreEmpleado)) = ''
                    OR ISNULL(e.NombreEmpleado, '') LIKE '%' + @NombreEmpleado + '%'
                  )
            ORDER BY m.FechaMovimiento DESC, m.IdVacacionMovimiento DESC;
            """;

        var rows = await connection.QueryAsync<VacacionMovimientoListItemDto>(
            _sqlCommandFactory.Create(
                sql,
                new
                {
                    Estado = string.IsNullOrWhiteSpace(request.Estado) ? null : request.Estado.Trim(),
                    TipoMovimiento = string.IsNullOrWhiteSpace(request.TipoMovimiento) ? null : request.TipoMovimiento.Trim(),
                    request.IdEmpleado,
                    FechaDesde = request.FechaDesde?.Date,
                    FechaHasta = request.FechaHasta?.Date,
                    NombreEmpleado = string.IsNullOrWhiteSpace(request.NombreEmpleado) ? null : request.NombreEmpleado.Trim()
                },
                CommandType.Text,
                cancellationToken,
                commandTimeout: 120));

        return rows.ToList();
    }

    public Task<VacacionOperacionResultDto> RegistrarSolicitudAsync(
        VacacionSolicitudRegistrarRequestDto request,
        string usuarioAccion,
        CancellationToken cancellationToken = default)
    {
        ValidarSolicitudRegistrarRequest(request);

        return ExecuteOperacionAsync(
            SolicitudRegistrarSp,
            new
            {
                request.IdEmpleado,
                request.IdPeriodo,
                FechaInicio = request.FechaInicio.Date,
                FechaFin = request.FechaFin.Date,
                request.CantidadDias,
                request.Motivo,
                request.Observacion,
                UsuarioAccion = NormalizeUsuario(usuarioAccion)
            },
            cancellationToken);
    }

    public Task<VacacionOperacionResultDto> AprobarSolicitudAsync(
        VacacionSolicitudAprobarRequestDto request,
        string usuarioAccion,
        CancellationToken cancellationToken = default)
    {
        if (request.IdSolicitud <= 0)
        {
            throw new InvalidOperationException("Debe indicar la solicitud.");
        }

        return ExecuteOperacionAsync(
            SolicitudAprobarSp,
            new
            {
                request.IdSolicitud,
                UsuarioAccion = NormalizeUsuario(usuarioAccion),
                request.Observacion
            },
            cancellationToken);
    }

    public Task<VacacionOperacionResultDto> RechazarSolicitudAsync(
        VacacionSolicitudRechazarRequestDto request,
        string usuarioAccion,
        CancellationToken cancellationToken = default)
    {
        if (request.IdSolicitud <= 0)
        {
            throw new InvalidOperationException("Debe indicar la solicitud.");
        }

        if (string.IsNullOrWhiteSpace(request.MotivoRechazo))
        {
            throw new InvalidOperationException("Debe indicar el motivo del rechazo.");
        }

        return ExecuteOperacionAsync(
            SolicitudRechazarSp,
            new
            {
                request.IdSolicitud,
                request.MotivoRechazo,
                UsuarioAccion = NormalizeUsuario(usuarioAccion),
                request.Observacion
            },
            cancellationToken);
    }

    public Task<VacacionOperacionResultDto> CancelarSolicitudAsync(
        VacacionSolicitudCancelarRequestDto request,
        string usuarioAccion,
        CancellationToken cancellationToken = default)
    {
        if (request.IdSolicitud <= 0)
        {
            throw new InvalidOperationException("Debe indicar la solicitud.");
        }

        if (string.IsNullOrWhiteSpace(request.MotivoCancelacion))
        {
            throw new InvalidOperationException("Debe indicar el motivo de cancelación.");
        }

        return ExecuteOperacionAsync(
            SolicitudCancelarSp,
            new
            {
                request.IdSolicitud,
                request.MotivoCancelacion,
                UsuarioAccion = NormalizeUsuario(usuarioAccion),
                request.Observacion
            },
            cancellationToken);
    }

    public Task<VacacionOperacionResultDto> FinalizarSolicitudAsync(
        VacacionSolicitudFinalizarRequestDto request,
        string usuarioAccion,
        CancellationToken cancellationToken = default)
    {
        if (request.IdSolicitud <= 0)
        {
            throw new InvalidOperationException("Debe indicar la solicitud.");
        }

        return ExecuteOperacionAsync(
            SolicitudFinalizarSp,
            new
            {
                request.IdSolicitud,
                UsuarioAccion = NormalizeUsuario(usuarioAccion),
                request.Observacion
            },
            cancellationToken);
    }

    public Task<VacacionOperacionResultDto> RevertirMovimientoAsync(
        VacacionMovimientoRevertirRequestDto request,
        string usuarioAccion,
        CancellationToken cancellationToken = default)
    {
        if (request.IdVacacionMovimiento <= 0)
        {
            throw new InvalidOperationException("Debe indicar el movimiento.");
        }

        return ExecuteOperacionAsync(
            MovimientoRevertirSp,
            new
            {
                request.IdVacacionMovimiento,
                UsuarioAccion = NormalizeUsuario(usuarioAccion),
                request.Observacion
            },
            cancellationToken);
    }

    private async Task<VacacionOperacionResultDto> ExecuteOperacionAsync(
        string storedProcedure,
        object parameters,
        CancellationToken cancellationToken)
    {
        await using var connection = _sqlCommandFactory.CreateConnection();

        _logger.LogInformation(
            "[Vacaciones] Ejecutando {StoredProcedure} con params {@Params}",
            storedProcedure,
            parameters);

        var result = await connection.QueryFirstOrDefaultAsync<VacacionOperacionResultDto>(
            _sqlCommandFactory.Create(
                storedProcedure,
                parameters,
                CommandType.StoredProcedure,
                cancellationToken,
                commandTimeout: 120));

        return result ?? new VacacionOperacionResultDto
        {
            Ok = 1,
            Exito = 1,
            Resultado = 1,
            Mensaje = "Operación ejecutada correctamente."
        };
    }

    private static DynamicParameters BuildParameters(VacacionesGrabarRequestDto request, string usuarioAccion)
    {
        var parameters = new DynamicParameters();
        parameters.Add("@IdEmpleadoCj", request.IdEmpleadoCj, DbType.Int32);
        parameters.Add("@FechaInicio", request.FechaInicio.Date, DbType.Date);
        parameters.Add("@FechaFin", request.FechaFin.Date, DbType.Date);
        parameters.Add("@IdEstado", request.IdEstado ?? 97, DbType.Int32);
        parameters.Add("@Usuario", NormalizeUsuario(usuarioAccion), DbType.String);
        return parameters;
    }

    private static string NormalizeUsuario(string usuarioAccion)
    {
        return string.IsNullOrWhiteSpace(usuarioAccion) ? "sistema" : usuarioAccion.Trim();
    }

    private static void ValidarPoliticaRequest(VacacionPoliticaGuardarRequestDto request)
    {
        if (string.IsNullOrWhiteSpace(request.Codigo))
        {
            throw new InvalidOperationException("Debe indicar el código de la política.");
        }

        if (string.IsNullOrWhiteSpace(request.Nombre))
        {
            throw new InvalidOperationException("Debe indicar el nombre de la política.");
        }

        if (request.DiasBase <= 0)
        {
            throw new InvalidOperationException("Los días base deben ser mayores a cero.");
        }
    }

    private static void ValidarPeriodoRequest(VacacionPeriodoGenerarRequestDto request)
    {
        if (request.IdEmpleado <= 0)
        {
            throw new InvalidOperationException("Debe indicar el empleado.");
        }

        if (request.IdPolitica <= 0)
        {
            throw new InvalidOperationException("Debe indicar la política vacacional.");
        }

        if (request.Anio <= 2000)
        {
            throw new InvalidOperationException("Debe indicar un año válido.");
        }
    }

    private static void ValidarSolicitudRegistrarRequest(VacacionSolicitudRegistrarRequestDto request)
    {
        if (request.IdEmpleado <= 0)
        {
            throw new InvalidOperationException("Debe indicar el empleado.");
        }

        if (request.IdPeriodo <= 0)
        {
            throw new InvalidOperationException("Debe indicar el período vacacional.");
        }

        if (request.FechaInicio == default)
        {
            throw new InvalidOperationException("Debe indicar la fecha de inicio.");
        }

        if (request.FechaFin == default)
        {
            throw new InvalidOperationException("Debe indicar la fecha fin.");
        }

        if (request.FechaFin.Date < request.FechaInicio.Date)
        {
            throw new InvalidOperationException("La fecha fin no puede ser menor que la fecha inicio.");
        }

        if (request.CantidadDias <= 0)
        {
            throw new InvalidOperationException("La cantidad de días debe ser mayor a cero.");
        }
    }

    private static void ValidarRequest(VacacionesGrabarRequestDto request)
    {
        if (request.IdEmpleadoCj <= 0)
        {
            throw new InvalidOperationException("Debe seleccionar el empleado.");
        }

        if (request.FechaInicio == default)
        {
            throw new InvalidOperationException("Debe seleccionar la fecha de inicio.");
        }

        if (request.FechaFin == default)
        {
            throw new InvalidOperationException("Debe seleccionar la fecha fin.");
        }

        if (request.FechaFin.Date < request.FechaInicio.Date)
        {
            throw new InvalidOperationException("La fecha fin no puede ser menor que la fecha inicio.");
        }

        var dias = (request.FechaFin.Date - request.FechaInicio.Date).Days + 1;
        if (dias < MinDiasSolicitud)
        {
            throw new InvalidOperationException(
                $"No se puede registrar menos de {MinDiasSolicitud} días de vacaciones (se solicitaron {dias}).");
        }
    }

    private static void ValidarRechazoRequest(VacacionesRechazarRequestDto request)
    {
        if (request.IdEmpleadoCj <= 0)
        {
            throw new InvalidOperationException("Debe seleccionar el empleado.");
        }

        if (request.FechaInicio == default)
        {
            throw new InvalidOperationException("Debe indicar la fecha inicial.");
        }

        if (request.FechaFin == default)
        {
            throw new InvalidOperationException("Debe indicar la fecha final.");
        }

        if (request.FechaFin.Date < request.FechaInicio.Date)
        {
            throw new InvalidOperationException("La fecha fin no puede ser menor que la fecha inicio.");
        }
    }

    private static void ValidarAprobacionRequest(VacacionesAprobarRequestDto request)
    {
        if (request.IdEmpleadoCj <= 0)
        {
            throw new InvalidOperationException("Debe seleccionar el empleado.");
        }

        if (request.FechaInicio == default)
        {
            throw new InvalidOperationException("Debe indicar la fecha inicial.");
        }

        if (request.FechaFin == default)
        {
            throw new InvalidOperationException("Debe indicar la fecha final.");
        }

        if (request.FechaFin.Date < request.FechaInicio.Date)
        {
            throw new InvalidOperationException("La fecha fin no puede ser menor que la fecha inicio.");
        }

        if (request.IdEstadoActual is not (97 or 98 or 99))
        {
            throw new InvalidOperationException("Debe seleccionar un validador válido.");
        }
    }
}
