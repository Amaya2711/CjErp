using System.Data;
using CjERP.Application.DTOs;
using CjERP.Application.Interfaces.Services;
using CjERP.Infrastructure.Persistence.Sql;
using System.Text.Json;
using Dapper;
using Microsoft.Data.SqlClient;

namespace CjERP.Infrastructure.Services;

public class LogisticaEquiposService : ILogisticaEquiposService
{
    private const string MaterialListarSp = "dbo.sp_Logistica_Material_Listar";
    private const string StockConsultarSp = "dbo.sp_Logistica_Stock_Consultar";
    private const string StockDescuadresSp = "dbo.sp_Logistica_Stock_Descuadres";
    private const string IngresoCatalogosSp = "dbo.sp_Logistica_Ingreso_Catalogos";
    private const string IngresoConsultarSp = "dbo.sp_Logistica_Ingreso_Consultar";
    private const string IngresoRecepcionarSp = "dbo.sp_Logistica_Ingreso_Recepcionar";
    private const string IngresoValidarSp = "dbo.sp_Logistica_Ingreso_Validar";
    private const string IngresoSerieActualizarSp = "dbo.sp_Logistica_Ingreso_SerieActualizar";
    private const string IngresoSerieImportarSp = "dbo.sp_Logistica_Ingreso_SerieImportar";
    private const string IngresoGuiaActualizarSp = "dbo.sp_Logistica_Ingreso_GuiaActualizar";
    private const string PedidoImportarSp = "dbo.sp_Logistica_Pedido_Importar";
    private const string PedidoImportarSecundarioSp = "dbo.sp_Logistica_Pedido_ImportarSecundario";

    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };

    private readonly ISqlCommandFactory _sqlCommandFactory;

    public LogisticaEquiposService(ISqlCommandFactory sqlCommandFactory)
    {
        _sqlCommandFactory = sqlCommandFactory;
    }

    public async Task<IEnumerable<LogisticaMaterialDto>> ListarMaterialesAsync(
        string? texto,
        bool soloActivos,
        CancellationToken cancellationToken = default)
    {
        await using var connection = _sqlCommandFactory.CreateConnection();
        return await connection.QueryAsync<LogisticaMaterialDto>(
            _sqlCommandFactory.Create(
                MaterialListarSp,
                new { Texto = NullIfWhiteSpace(texto), SoloActivos = soloActivos },
                CommandType.StoredProcedure,
                cancellationToken,
                commandTimeout: 60));
    }

    public async Task<IEnumerable<LogisticaStockDto>> ConsultarStockAsync(
        string? texto,
        bool soloConSaldo,
        CancellationToken cancellationToken = default)
    {
        await using var connection = _sqlCommandFactory.CreateConnection();
        return await connection.QueryAsync<LogisticaStockDto>(
            _sqlCommandFactory.Create(
                StockConsultarSp,
                new { Texto = NullIfWhiteSpace(texto), SoloConSaldo = soloConSaldo },
                CommandType.StoredProcedure,
                cancellationToken,
                commandTimeout: 120));
    }

    public async Task<IEnumerable<LogisticaStockDescuadreDto>> ConsultarDescuadresAsync(
        CancellationToken cancellationToken = default)
    {
        await using var connection = _sqlCommandFactory.CreateConnection();
        return await connection.QueryAsync<LogisticaStockDescuadreDto>(
            _sqlCommandFactory.Create(
                StockDescuadresSp,
                null,
                CommandType.StoredProcedure,
                cancellationToken,
                commandTimeout: 120));
    }

    public async Task<IEnumerable<LogisticaIngresoCatalogoDto>> ListarCatalogosIngresoAsync(
        CancellationToken cancellationToken = default)
    {
        await using var connection = _sqlCommandFactory.CreateConnection();
        return await connection.QueryAsync<LogisticaIngresoCatalogoDto>(
            _sqlCommandFactory.Create(IngresoCatalogosSp, null, CommandType.StoredProcedure, cancellationToken, commandTimeout: 60));
    }

    public async Task<IEnumerable<LogisticaIngresoLineaDto>> ConsultarIngresoAsync(
        LogisticaIngresoConsultaDto consulta,
        CancellationToken cancellationToken = default)
    {
        await using var connection = _sqlCommandFactory.CreateConnection();
        return await EjecutarAsync(() => connection.QueryAsync<LogisticaIngresoLineaDto>(
            _sqlCommandFactory.Create(
                IngresoConsultarSp,
                new
                {
                    Etapa = consulta.Etapa?.Trim().ToUpperInvariant() ?? string.Empty,
                    Pedidos = NullIfWhiteSpace(consulta.Pedidos),
                    Solicitudes = NullIfWhiteSpace(consulta.Solicitudes),
                    FechaIni = consulta.FechaIni?.Date,
                    FechaFin = consulta.FechaFin?.Date,
                    consulta.IdUbicacion,
                },
                CommandType.StoredProcedure,
                cancellationToken,
                commandTimeout: 120)));
    }

    public Task<LogisticaIngresoCambioEstadoResultDto> RecepcionarAsync(
        LogisticaIngresoCambioEstadoDto request,
        string usuario,
        CancellationToken cancellationToken = default)
    {
        return CambiarEstadoAsync(IngresoRecepcionarSp, request, usuario, false, cancellationToken);
    }

    public Task<LogisticaIngresoCambioEstadoResultDto> ValidarAsync(
        LogisticaIngresoCambioEstadoDto request,
        string usuario,
        CancellationToken cancellationToken = default)
    {
        return CambiarEstadoAsync(IngresoValidarSp, request, usuario, true, cancellationToken);
    }

    private async Task<LogisticaIngresoCambioEstadoResultDto> CambiarEstadoAsync(
        string procedimiento,
        LogisticaIngresoCambioEstadoDto request,
        string usuario,
        bool conZona,
        CancellationToken cancellationToken)
    {
        var parametros = new DynamicParameters();
        parametros.Add("@Items", JsonSerializer.Serialize(request.Items, JsonOptions), DbType.String);
        parametros.Add("@Usuario", usuario, DbType.String);
        if (conZona) parametros.Add("@IdZonaAlmacen", request.IdZonaAlmacen, DbType.Int32);
        parametros.Add("@Actualizadas", dbType: DbType.Int32, direction: ParameterDirection.Output);
        parametros.Add("@PedidosCompletos", dbType: DbType.Int32, direction: ParameterDirection.Output);

        await using var connection = _sqlCommandFactory.CreateConnection();
        await EjecutarAsync(() => connection.ExecuteAsync(
            _sqlCommandFactory.Create(procedimiento, parametros, CommandType.StoredProcedure, cancellationToken, commandTimeout: 120)));

        return new LogisticaIngresoCambioEstadoResultDto
        {
            Actualizadas = parametros.Get<int?>("@Actualizadas") ?? 0,
            PedidosCompletos = parametros.Get<int?>("@PedidosCompletos") ?? 0,
        };
    }

    public async Task ActualizarSerieAsync(
        LogisticaIngresoSerieDto request,
        string usuario,
        CancellationToken cancellationToken = default)
    {
        if (!Guid.TryParse(request.Correlativo, out var correlativo))
            throw new InvalidOperationException("Correlativo no valido.");

        await using var connection = _sqlCommandFactory.CreateConnection();
        await EjecutarAsync(() => connection.ExecuteAsync(
            _sqlCommandFactory.Create(
                IngresoSerieActualizarSp,
                new { Correlativo = correlativo, Usuario = usuario, request.Serie, request.Comentario },
                CommandType.StoredProcedure,
                cancellationToken,
                commandTimeout: 60)));
    }

    public async Task<LogisticaIngresoCargaResultDto> ImportarSeriesAsync(
        LogisticaIngresoSerieMasivaDto request,
        string usuario,
        CancellationToken cancellationToken = default)
    {
        return await EjecutarCargaAsync(
            IngresoSerieImportarSp,
            JsonSerializer.Serialize(request.Items, JsonOptions),
            usuario,
            request.SoloValidar,
            idEmpleadoCj: null,
            incluirEmpleado: false,
            cancellationToken);
    }

    public async Task<LogisticaIngresoGuiaResultDto> ActualizarGuiaAsync(
        LogisticaIngresoGuiaDto request,
        string usuario,
        CancellationToken cancellationToken = default)
    {
        var parametros = new DynamicParameters();
        parametros.Add("@Pedidos", JsonSerializer.Serialize(request.Pedidos, JsonOptions), DbType.String);
        parametros.Add("@Guia", request.Guia, DbType.String);
        parametros.Add("@FecIngreso", request.FecIngreso.Date, DbType.Date);
        parametros.Add("@Usuario", usuario, DbType.String);
        parametros.Add("@Reasignar", request.Reasignar, DbType.Boolean);
        parametros.Add("@IdCliente", request.IdCliente, DbType.Int32);
        parametros.Add("@IdProyecto", request.IdProyecto, DbType.Int32);
        parametros.Add("@TipoTrabajo", NullIfWhiteSpace(request.TipoTrabajo), DbType.String);
        parametros.Add("@IdSite", NullIfWhiteSpace(request.IdSite), DbType.String);
        parametros.Add("@CorreSite", request.CorreSite, DbType.Int32);
        parametros.Add("@PedidosActualizados", dbType: DbType.Int32, direction: ParameterDirection.Output);
        parametros.Add("@LineasActualizadas", dbType: DbType.Int32, direction: ParameterDirection.Output);

        await using var connection = _sqlCommandFactory.CreateConnection();
        await EjecutarAsync(() => connection.ExecuteAsync(
            _sqlCommandFactory.Create(IngresoGuiaActualizarSp, parametros, CommandType.StoredProcedure, cancellationToken, commandTimeout: 120)));

        return new LogisticaIngresoGuiaResultDto
        {
            PedidosActualizados = parametros.Get<int?>("@PedidosActualizados") ?? 0,
            LineasActualizadas = parametros.Get<int?>("@LineasActualizadas") ?? 0,
        };
    }

    public async Task<LogisticaIngresoCargaResultDto> ImportarPedidoAsync(
        LogisticaPedidoImportarDto request,
        string usuario,
        int? idEmpleadoCj,
        CancellationToken cancellationToken = default)
    {
        return await EjecutarCargaAsync(
            PedidoImportarSp,
            JsonSerializer.Serialize(request.Items, JsonOptions),
            usuario,
            request.SoloValidar,
            idEmpleadoCj,
            incluirEmpleado: true,
            cancellationToken);
    }

    public async Task<LogisticaIngresoCargaResultDto> ImportarSecundarioAsync(
        LogisticaSecundarioImportarDto request,
        string usuario,
        CancellationToken cancellationToken = default)
    {
        return await EjecutarCargaAsync(
            PedidoImportarSecundarioSp,
            JsonSerializer.Serialize(request.Items, JsonOptions),
            usuario,
            request.SoloValidar,
            idEmpleadoCj: null,
            incluirEmpleado: false,
            cancellationToken);
    }

    private async Task<LogisticaIngresoCargaResultDto> EjecutarCargaAsync(
        string procedimiento,
        string itemsJson,
        string usuario,
        bool soloValidar,
        int? idEmpleadoCj,
        bool incluirEmpleado,
        CancellationToken cancellationToken)
    {
        var parametros = new DynamicParameters();
        parametros.Add("@Items", itemsJson, DbType.String);
        parametros.Add("@Usuario", usuario, DbType.String);
        if (incluirEmpleado) parametros.Add("@IdEmpleadoCj", idEmpleadoCj, DbType.Int32);
        parametros.Add("@SoloValidar", soloValidar, DbType.Boolean);
        parametros.Add("@Aplicado", dbType: DbType.Boolean, direction: ParameterDirection.Output);

        await using var connection = _sqlCommandFactory.CreateConnection();
        var lineas = await EjecutarAsync(() => connection.QueryAsync<LogisticaIngresoLineaResultadoDto>(
            _sqlCommandFactory.Create(procedimiento, parametros, CommandType.StoredProcedure, cancellationToken, commandTimeout: 300)));

        return new LogisticaIngresoCargaResultDto
        {
            Aplicado = parametros.Get<bool?>("@Aplicado") ?? false,
            Lineas = lineas.ToList(),
        };
    }

    /// <summary>Los errores de negocio de los SP (THROW 51xxx) se informan al usuario como InvalidOperationException.</summary>
    private static async Task<T> EjecutarAsync<T>(Func<Task<T>> accion)
    {
        try
        {
            return await accion();
        }
        catch (SqlException ex) when (ex.Number is >= 51000 and <= 51999)
        {
            throw new InvalidOperationException(ex.Message, ex);
        }
    }

    private static string? NullIfWhiteSpace(string? value)
    {
        return string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    }
}
