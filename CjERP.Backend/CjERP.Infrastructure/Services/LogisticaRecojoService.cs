using System.Data;
using CjERP.Application.DTOs;
using CjERP.Application.Interfaces.Services;
using CjERP.Infrastructure.Persistence.Sql;
using Dapper;

namespace CjERP.Infrastructure.Services;

public class LogisticaRecojoService : ILogisticaRecojoService
{
    private const string BuscarSp = "dbo.sp_Logistica_Recojo_Buscar";
    private const string InsertarSp = "dbo.sp_Logistica_Recojo_Insertar";

    private readonly ISqlCommandFactory _sqlCommandFactory;

    public LogisticaRecojoService(ISqlCommandFactory sqlCommandFactory)
    {
        _sqlCommandFactory = sqlCommandFactory;
    }

    public async Task<IEnumerable<LogisticaRecojoDto>> BuscarAsync(
        LogisticaRecojoBuscarRequestDto request,
        CancellationToken cancellationToken = default)
    {
        await using var connection = _sqlCommandFactory.CreateConnection();
        return await connection.QueryAsync<LogisticaRecojoDto>(
            _sqlCommandFactory.Create(
                BuscarSp,
                BuildBuscarParameters(request),
                CommandType.StoredProcedure,
                cancellationToken,
                commandTimeout: 120));
    }

    public async Task<int> InsertarAsync(
        LogisticaRecojoInsertRequestDto request,
        CancellationToken cancellationToken = default)
    {
        await using var connection = _sqlCommandFactory.CreateConnection();
        var parameters = new DynamicParameters();
        parameters.Add("@IdCliente", request.IdCliente, DbType.Int32);
        parameters.Add("@IdProyecto", request.IdProyecto, DbType.Int32);
        parameters.Add("@IdSite", NullIfWhiteSpace(request.IdSite), DbType.String);
        parameters.Add("@Correlativo", request.Correlativo, DbType.Int32);
        parameters.Add("@Solicitud", NullIfWhiteSpace(request.Solicitud), DbType.String);
        parameters.Add("@Clave", NullIfWhiteSpace(request.Clave), DbType.String);
        parameters.Add("@IdEmpresa", request.IdEmpresa, DbType.Int32);
        parameters.Add("@NroGuia", NullIfWhiteSpace(request.NroGuia), DbType.String);
        parameters.Add("@IdUbigeo", request.IdUbigeo, DbType.Int32);
        parameters.Add("@DetalleUbigeo", NullIfWhiteSpace(request.DetalleUbigeo), DbType.String);
        parameters.Add("@FechaSalida", request.FechaSalida, DbType.DateTime);
        parameters.Add("@FechaLlegada", request.FechaLlegada, DbType.DateTime);
        parameters.Add("@Observacion", NullIfWhiteSpace(request.Observacion), DbType.String);
        parameters.Add("@IdResponsable", request.IdResponsable, DbType.Int32);
        parameters.Add("@FechaRecojo", request.FechaRecojo, DbType.DateTime);
        parameters.Add("@RutaImagenGuia", NullIfWhiteSpace(request.RutaImagenGuia), DbType.String);
        parameters.Add("@IdResponsableRecojo", request.IdResponsableRecojo, DbType.Int32);
        parameters.Add("@UsuarioCreacion", NullIfWhiteSpace(request.UsuarioCreacion), DbType.String);

        var result = await connection.ExecuteScalarAsync<object?>(
            _sqlCommandFactory.Create(
                InsertarSp,
                parameters,
                CommandType.StoredProcedure,
                cancellationToken,
                commandTimeout: 120));

        return TryConvertToInt(result);
    }

    private static DynamicParameters BuildBuscarParameters(LogisticaRecojoBuscarRequestDto request)
    {
        var parameters = new DynamicParameters();
        parameters.Add("@IdRecojo", request.IdRecojo, DbType.Int32);
        parameters.Add("@IdCliente", request.IdCliente, DbType.Int32);
        parameters.Add("@IdProyecto", request.IdProyecto, DbType.Int32);
        parameters.Add("@IdSite", NullIfWhiteSpace(request.IdSite), DbType.String);
        parameters.Add("@Correlativo", request.Correlativo, DbType.Int32);
        parameters.Add("@Solicitud", NullIfWhiteSpace(request.Solicitud), DbType.String);
        parameters.Add("@Clave", NullIfWhiteSpace(request.Clave), DbType.String);
        parameters.Add("@IdEmpresa", request.IdEmpresa, DbType.Int32);
        parameters.Add("@NroGuia", NullIfWhiteSpace(request.NroGuia), DbType.String);
        parameters.Add("@IdUbigeo", request.IdUbigeo, DbType.Int32);
        parameters.Add("@IdResponsable", request.IdResponsable, DbType.Int32);
        parameters.Add("@IdResponsableRecojo", request.IdResponsableRecojo, DbType.Int32);
        parameters.Add("@EsActivo", request.EsActivo, DbType.Boolean);
        return parameters;
    }

    private static string? NullIfWhiteSpace(string? value)
    {
        return string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    }

    private static int TryConvertToInt(object? value)
    {
        if (value is null)
        {
            return 0;
        }

        return int.TryParse(Convert.ToString(value), out var parsed) ? parsed : 0;
    }
}
