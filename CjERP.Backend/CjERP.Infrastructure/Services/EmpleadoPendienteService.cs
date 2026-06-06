using System.Data;
using CjERP.Application.DTOs;
using CjERP.Application.Interfaces.Services;
using CjERP.Infrastructure.Persistence.Sql;
using Dapper;

namespace CjERP.Infrastructure.Services;

public class EmpleadoPendienteService : IEmpleadoPendienteService
{
    private const string BuscarSp = "dbo.sp_EmpleadoPendiente_Listar";
    private const string InsertarSp = "dbo.sp_EmpleadoPendiente_Insertar";
    private const string ActualizarSp = "dbo.sp_EmpleadoPendiente_Actualizar";

    private readonly ISqlCommandFactory _sqlCommandFactory;

    public EmpleadoPendienteService(ISqlCommandFactory sqlCommandFactory)
    {
        _sqlCommandFactory = sqlCommandFactory;
    }

    public async Task<IEnumerable<EmpleadoPendienteDto>> BuscarAsync(
        EmpleadoPendienteBuscarRequestDto request,
        CancellationToken cancellationToken = default)
    {
        await using var connection = _sqlCommandFactory.CreateConnection();
        return await connection.QueryAsync<EmpleadoPendienteDto>(
            _sqlCommandFactory.Create(
                BuscarSp,
                BuildBuscarParameters(request),
                CommandType.StoredProcedure,
                cancellationToken,
                commandTimeout: 120));
    }

    public async Task<EmpleadoPendienteCommandResultDto> InsertarAsync(
        EmpleadoPendienteInsertRequestDto request,
        CancellationToken cancellationToken = default)
    {
        return await ExecuteCommandAsync(
            InsertarSp,
            BuildInsertParameters(request),
            cancellationToken);
    }

    public async Task<EmpleadoPendienteCommandResultDto> ActualizarAsync(
        EmpleadoPendienteUpdateRequestDto request,
        CancellationToken cancellationToken = default)
    {
        return await ExecuteCommandAsync(
            ActualizarSp,
            BuildUpdateParameters(request),
            cancellationToken);
    }

    private async Task<EmpleadoPendienteCommandResultDto> ExecuteCommandAsync(
        string storedProcedure,
        DynamicParameters parameters,
        CancellationToken cancellationToken)
    {
        await using var connection = _sqlCommandFactory.CreateConnection();
        var result = await connection.QueryFirstOrDefaultAsync<EmpleadoPendienteCommandResultDto>(
            _sqlCommandFactory.Create(
                storedProcedure,
                parameters,
                CommandType.StoredProcedure,
                cancellationToken,
                commandTimeout: 120));

        return result ?? new EmpleadoPendienteCommandResultDto
        {
            Resultado = 0,
            Mensaje = "El procedimiento no devolvio resultado."
        };
    }

    private static DynamicParameters BuildBuscarParameters(EmpleadoPendienteBuscarRequestDto request)
    {
        var parameters = new DynamicParameters();
        parameters.Add("@IdPendiente", request.IdPendiente, DbType.Int32);
        parameters.Add("@IdEmpleado", request.IdEmpleado, DbType.Int32);
        parameters.Add("@IdResponsable", request.IdResponsable, DbType.Int32);
        // El store permite estado por defecto 1 para registros nuevos, pero si enviamos NULL
        // desde Dapper se pierde ese default SQL y falla el INSERT.
        parameters.Add("@IdEstado", request.IdEstado ?? 1, DbType.Int32);
        parameters.Add("@FechaInicio", request.FechaInicio, DbType.Date);
        parameters.Add("@FechaFin", request.FechaFin, DbType.Date);
        return parameters;
    }

    private static DynamicParameters BuildInsertParameters(EmpleadoPendienteInsertRequestDto request)
    {
        var parameters = new DynamicParameters();
        parameters.Add("@IdEmpleado", request.IdEmpleado, DbType.Int32);
        parameters.Add("@FechaInicio", request.FechaInicio, DbType.Date);
        parameters.Add("@FechaEstimacionTermino", request.FechaEstimacionTermino, DbType.Date);
        parameters.Add("@FechaRealTermino", request.FechaRealTermino, DbType.Date);
        parameters.Add("@IdEstado", request.IdEstado, DbType.Int32);
        parameters.Add("@Comentario", NullIfWhiteSpace(request.Comentario), DbType.String);
        parameters.Add("@Observacion", NullIfWhiteSpace(request.Observacion), DbType.String);
        parameters.Add("@IdResponsable", request.IdResponsable, DbType.Int32);
        parameters.Add("@Ruta", NullIfWhiteSpace(request.Ruta), DbType.String);
        parameters.Add("@UsuarioCreacion", NullIfWhiteSpace(request.UsuarioCreacion), DbType.String);
        return parameters;
    }

    private static DynamicParameters BuildUpdateParameters(EmpleadoPendienteUpdateRequestDto request)
    {
        var parameters = new DynamicParameters();
        parameters.Add("@IdPendiente", request.IdPendiente, DbType.Int32);
        parameters.Add("@IdEmpleado", request.IdEmpleado, DbType.Int32);
        parameters.Add("@FechaInicio", request.FechaInicio, DbType.Date);
        parameters.Add("@FechaEstimacionTermino", request.FechaEstimacionTermino, DbType.Date);
        parameters.Add("@FechaRealTermino", request.FechaRealTermino, DbType.Date);
        parameters.Add("@IdEstado", request.IdEstado, DbType.Int32);
        parameters.Add("@Comentario", NullIfWhiteSpace(request.Comentario), DbType.String);
        parameters.Add("@Observacion", NullIfWhiteSpace(request.Observacion), DbType.String);
        parameters.Add("@IdResponsable", request.IdResponsable, DbType.Int32);
        parameters.Add("@Ruta", NullIfWhiteSpace(request.Ruta), DbType.String);
        parameters.Add("@UsuarioModificacion", NullIfWhiteSpace(request.UsuarioModificacion), DbType.String);
        return parameters;
    }

    private static string? NullIfWhiteSpace(string? value)
    {
        return string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    }
}
