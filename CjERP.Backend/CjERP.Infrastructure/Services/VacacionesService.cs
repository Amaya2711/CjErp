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
        if (exito != 1)
        {
            result.Mensaje ??= "No se pudo registrar las vacaciones.";
        }
        else
        {
            result.Mensaje ??= "Vacaciones registradas correctamente.";
        }

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
                ? (string.IsNullOrWhiteSpace(result?.Mensaje) ? "Vacaciones actualizadas correctamente." : result.Mensaje)
                : "No se encontraron vacaciones para actualizar.",
            DiasSolicitados = null,
            DiasInsertados = filasActualizadas,
            FilasEmpleadoOtrosActualizadas = filasActualizadas
        };
    }

    private static DynamicParameters BuildParameters(VacacionesGrabarRequestDto request, string usuarioAccion)
    {
        var parameters = new DynamicParameters();
        parameters.Add("@IdEmpleadoCj", request.IdEmpleadoCj, DbType.Int32);
        parameters.Add("@FechaInicio", request.FechaInicio.Date, DbType.Date);
        parameters.Add("@FechaFin", request.FechaFin.Date, DbType.Date);
        parameters.Add("@IdEstado", request.IdEstado ?? 97, DbType.Int32);
        parameters.Add("@Usuario", string.IsNullOrWhiteSpace(usuarioAccion) ? "sistema" : usuarioAccion.Trim(), DbType.String);
        return parameters;
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
