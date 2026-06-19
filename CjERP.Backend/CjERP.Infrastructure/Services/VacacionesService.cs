using System.Data;
using CjERP.Application.DTOs;
using CjERP.Application.Interfaces.Services;
using CjERP.Infrastructure.Persistence.Sql;
using Dapper;

namespace CjERP.Infrastructure.Services;

public sealed class VacacionesService : IVacacionesService
{
    private const string GrabarSp = "dbo.sp_EmpleadoOtros_GrabarVacaciones";
    private readonly ISqlCommandFactory _sqlCommandFactory;

    public VacacionesService(ISqlCommandFactory sqlCommandFactory)
    {
        _sqlCommandFactory = sqlCommandFactory;
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

    private static DynamicParameters BuildParameters(VacacionesGrabarRequestDto request, string usuarioAccion)
    {
        var parameters = new DynamicParameters();
        parameters.Add("@IdEmpleadoCj", request.IdEmpleadoCj, DbType.Int32);
        parameters.Add("@FechaInicio", request.FechaInicio.Date, DbType.Date);
        parameters.Add("@FechaFin", request.FechaFin.Date, DbType.Date);
        parameters.Add("@IdResponsableCj", request.IdResponsableCj, DbType.Int32);
        parameters.Add("@IdSegundoVacaciones", request.IdSegundoVacaciones, DbType.Int32);
        parameters.Add("@IdTerceroVacaciones", request.IdTerceroVacaciones, DbType.Int32);
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

        if (request.IdResponsableCj is null || request.IdResponsableCj <= 0)
        {
            throw new InvalidOperationException("Debe seleccionar el primer aprobador.");
        }

        if (request.IdSegundoVacaciones is null || request.IdSegundoVacaciones <= 0)
        {
            throw new InvalidOperationException("Debe seleccionar el segundo aprobador.");
        }

        if (request.IdTerceroVacaciones is null || request.IdTerceroVacaciones <= 0)
        {
            throw new InvalidOperationException("Debe seleccionar el tercer aprobador.");
        }
    }
}
