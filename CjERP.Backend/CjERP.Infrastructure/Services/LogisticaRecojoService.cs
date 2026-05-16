using System.Data;
using CjERP.Application.DTOs;
using CjERP.Application.Interfaces.Services;
using Dapper;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;

namespace CjERP.Infrastructure.Services;

public class LogisticaRecojoService : ILogisticaRecojoService
{
    private const string BuscarSp = "dbo.sp_Logistica_Recojo_Buscar";
    private const string InsertarSp = "dbo.sp_Logistica_Recojo_Insertar";

    private readonly IConfiguration _configuration;

    public LogisticaRecojoService(IConfiguration configuration)
    {
        _configuration = configuration;
    }

    public async Task<IEnumerable<LogisticaRecojoDto>> BuscarAsync(
        LogisticaRecojoBuscarRequestDto request,
        CancellationToken cancellationToken = default)
    {
        using var connection = BuildConnection();
        return await connection.QueryAsync<LogisticaRecojoDto>(
            new CommandDefinition(
                BuscarSp,
                BuildBuscarParameters(request),
                commandType: CommandType.StoredProcedure,
                cancellationToken: cancellationToken));
    }

    public async Task<int> InsertarAsync(
        LogisticaRecojoInsertRequestDto request,
        CancellationToken cancellationToken = default)
    {
        using var connection = BuildConnection();
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
            new CommandDefinition(
                InsertarSp,
                parameters,
                commandType: CommandType.StoredProcedure,
                cancellationToken: cancellationToken));

        return TryConvertToInt(result);
    }

    private SqlConnection BuildConnection()
    {
        return new SqlConnection(_configuration.GetConnectionString("DefaultConnection"));
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
