using System.Data;
using System.Text.Json;
using CjERP.Application.DTOs;
using CjERP.Application.Interfaces.Services;
using Dapper;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;

namespace CjERP.Infrastructure.Services;

public class OrdenCompraService : IOrdenCompraService
{
    private const string BuscarCabeceraSp = "dbo.sp_OrdenCompra_BuscarCabecera";
    private const string BuscarDetalleSp = "dbo.sp_OrdenCompra_BuscarDetalle";
    private const string InsertarSp = "dbo.sp_OrdenCompra_Insertar";
    private const string RechazarMasivoSp = "dbo.sp_OrdenCompra_RechazarMasivo";
    private const string ActualizarIdWebSql = """
        UPDATE dbo.CabOrdenCompra
        SET IdWeb = @IdWeb
        WHERE IdOc = @IdOc;
        """;

    private readonly IConfiguration _configuration;

    public OrdenCompraService(IConfiguration configuration)
    {
        _configuration = configuration;
    }

    public async Task<IEnumerable<OrdenCompraCabeceraDto>> BuscarCabeceraAsync(
        OrdenCompraConsultaRequestDto request,
        CancellationToken cancellationToken = default)
    {
        using var connection = BuildConnection();
        return await connection.QueryAsync<OrdenCompraCabeceraDto>(
            new CommandDefinition(
                BuscarCabeceraSp,
                BuildConsultaParameters(request),
                commandType: CommandType.StoredProcedure,
                cancellationToken: cancellationToken));
    }

    public async Task<IEnumerable<OrdenCompraDetalleDto>> BuscarDetalleAsync(
        OrdenCompraConsultaRequestDto request,
        CancellationToken cancellationToken = default)
    {
        using var connection = BuildConnection();
        return await connection.QueryAsync<OrdenCompraDetalleDto>(
            new CommandDefinition(
                BuscarDetalleSp,
                BuildConsultaParameters(request),
                commandType: CommandType.StoredProcedure,
                cancellationToken: cancellationToken));
    }

    public async Task<int> InsertarAsync(
        OrdenCompraInsertRequestDto request,
        CancellationToken cancellationToken = default)
    {
        using var connection = BuildConnection();

        var detalleJson = JsonSerializer.Serialize(
            request.Detalle.Select(item => new
            {
                item.IdCliente,
                item.IdProyecto,
                item.IdSite,
                item.Detalle,
                item.Cantidad,
                item.PrecioUnitario
            }));

        var parameters = new DynamicParameters();
        parameters.Add("@IdSolicitante", request.IdSolicitante, DbType.Int32);
        parameters.Add("@IdResponsable", request.IdResponsable, DbType.Int32);
        parameters.Add("@FechaOrden", request.FechaOrden.Date, DbType.Date);
        parameters.Add("@Observacion", NullIfWhiteSpace(request.Observacion), DbType.String);
        parameters.Add("@UsuarioCreacion", NullIfWhiteSpace(request.UsuarioCreacion), DbType.String);
        parameters.Add("@FechaCreacion", request.FechaCreacion.Date, DbType.Date);
        parameters.Add("@HoraCreacion", request.HoraCreacion, DbType.Time);
        parameters.Add("@IdMoneda", request.IdMoneda, DbType.Int32);
        parameters.Add("@IdComprobante", request.IdComprobante, DbType.Int32);
        parameters.Add("@IdEstado", request.IdEstado, DbType.Int32);
        parameters.Add("@IdValidador", request.IdValidador, DbType.Int32);
        parameters.Add("@IdGestor", request.IdGestor, DbType.Int32);
        parameters.Add("@IdFormaPago", request.IdFormaPago, DbType.Int32);
        parameters.Add("@DiasPago", request.DiasPago, DbType.Int32);
        parameters.Add("@Peso", request.Peso, DbType.Decimal);
        parameters.Add("@Detalle", detalleJson, DbType.String);

        var idOc = await connection.ExecuteScalarAsync<int>(
            new CommandDefinition(
                InsertarSp,
                parameters,
                commandType: CommandType.StoredProcedure,
                cancellationToken: cancellationToken));

        if (request.IdWeb > 0 && idOc > 0)
        {
            await connection.ExecuteAsync(
                new CommandDefinition(
                    ActualizarIdWebSql,
                    new { IdWeb = request.IdWeb, IdOc = idOc },
                    commandType: CommandType.Text,
                    cancellationToken: cancellationToken));
        }

        return idOc;
    }

    public async Task RechazarMasivoAsync(
        OrdenCompraRechazoMasivoRequestDto request,
        CancellationToken cancellationToken = default)
    {
        using var connection = BuildConnection();

        var idsOc = request.IdsOc
            .Where(id => id > 0)
            .Distinct()
            .ToArray();

        var idsOcCsv = string.Join(",", idsOc);

        var parameters = new DynamicParameters();
        parameters.Add("@IdsOc", idsOcCsv, DbType.String);
        parameters.Add("@Observacion", NullIfWhiteSpace(request.Observacion), DbType.String);
        parameters.Add("@IdRechazador", request.IdAprobador, DbType.Int32);

        await connection.ExecuteAsync(
            new CommandDefinition(
                RechazarMasivoSp,
                parameters,
                commandType: CommandType.StoredProcedure,
                cancellationToken: cancellationToken));
    }

    private SqlConnection BuildConnection()
    {
        return new SqlConnection(_configuration.GetConnectionString("DefaultConnection"));
    }

    private static DynamicParameters BuildConsultaParameters(OrdenCompraConsultaRequestDto request)
    {
        var parameters = new DynamicParameters();
        parameters.Add("@IdCliente", request.IdCliente, DbType.Int32);
        parameters.Add("@IdProyecto", request.IdProyecto, DbType.Int32);
        parameters.Add("@IdSite", NullIfWhiteSpace(request.IdSite), DbType.String);
        parameters.Add("@Correlativo", request.Correlativo, DbType.Int32);
        parameters.Add("@Ot", NullIfWhiteSpace(request.Ot), DbType.String);
        parameters.Add("@TipoTrabajo", NullIfWhiteSpace(request.TipoTrabajo), DbType.String);
        parameters.Add("@IdSolicitante", request.IdSolicitante, DbType.Int32);
        parameters.Add("@IdResponsable", request.IdResponsable, DbType.Int32);
        parameters.Add("@IdOc", NullIfWhiteSpace(request.IdOc), DbType.String);
        return parameters;
    }

    private static string? NullIfWhiteSpace(string? value)
    {
        return string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    }
}
