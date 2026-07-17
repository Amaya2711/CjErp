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

    private readonly ISqlCommandFactory _sqlCommandFactory;
    private readonly ILogger<VacacionesService> _logger;

    public VacacionesService(ISqlCommandFactory sqlCommandFactory, ILogger<VacacionesService> logger)
    {
        _sqlCommandFactory = sqlCommandFactory;
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

        return new VacacionesGrabarResultDto
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
