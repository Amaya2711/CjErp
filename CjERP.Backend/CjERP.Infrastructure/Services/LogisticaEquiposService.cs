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

    private const string SolicitudCatalogosSp = "dbo.sp_Logistica_Solicitud_Catalogos";
    private const string SolicitudDisponibleSp = "dbo.sp_Logistica_Solicitud_Disponible";
    private const string SolicitudConsumibleSp = "dbo.sp_Logistica_Solicitud_Consumible";
    private const string SolicitudRegistrarSp = "dbo.sp_Logistica_Solicitud_Registrar";
    private const string SolicitudPorAprobarSp = "dbo.sp_Logistica_Solicitud_PorAprobar";
    private const string SolicitudDetalleSp = "dbo.sp_Logistica_Solicitud_Detalle";
    private const string SolicitudAprobarSp = "dbo.sp_Logistica_Solicitud_Aprobar";
    private const string SolicitudCorreoSp = "dbo.sp_Logistica_Solicitud_Correo";
    private const string CampoConsultarSp = "dbo.sp_Logistica_Campo_Consultar";
    private const string CampoGrabarSp = "dbo.sp_Logistica_Campo_Grabar";

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

    // ---- Solicitud y x Aprobar ----

    public async Task<IEnumerable<LogisticaSolicitudCatalogoDto>> ListarCatalogosSolicitudAsync(
        CancellationToken cancellationToken = default)
    {
        await using var connection = _sqlCommandFactory.CreateConnection();
        return await connection.QueryAsync<LogisticaSolicitudCatalogoDto>(
            _sqlCommandFactory.Create(SolicitudCatalogosSp, null, CommandType.StoredProcedure, cancellationToken, commandTimeout: 60));
    }

    public async Task<IEnumerable<LogisticaSolicitudDisponibleDto>> ListarDisponiblesSolicitudAsync(
        string? texto,
        string? idSite,
        int? correSite,
        int? idCliente,
        int? idProyecto,
        CancellationToken cancellationToken = default)
    {
        await using var connection = _sqlCommandFactory.CreateConnection();
        return await EjecutarAsync(() => connection.QueryAsync<LogisticaSolicitudDisponibleDto>(
            _sqlCommandFactory.Create(
                SolicitudDisponibleSp,
                new
                {
                    Texto = NullIfWhiteSpace(texto),
                    IdSite = NullIfWhiteSpace(idSite),
                    CorreSite = correSite,
                    IdCliente = idCliente,
                    IdProyecto = idProyecto,
                },
                CommandType.StoredProcedure,
                cancellationToken,
                commandTimeout: 120)));
    }

    public async Task<IEnumerable<LogisticaSolicitudConsumibleDto>> ListarConsumiblesSolicitudAsync(
        string? texto,
        CancellationToken cancellationToken = default)
    {
        await using var connection = _sqlCommandFactory.CreateConnection();
        return await connection.QueryAsync<LogisticaSolicitudConsumibleDto>(
            _sqlCommandFactory.Create(
                SolicitudConsumibleSp,
                new { Texto = NullIfWhiteSpace(texto) },
                CommandType.StoredProcedure,
                cancellationToken,
                commandTimeout: 60));
    }

    public async Task<LogisticaSolicitudRegistrarResultDto> RegistrarSolicitudAsync(
        LogisticaSolicitudRegistrarDto request,
        string usuario,
        int? idEmpleadoCj,
        CancellationToken cancellationToken = default)
    {
        var parametros = new DynamicParameters();
        parametros.Add("@IdCliente", request.IdCliente, DbType.Int32);
        parametros.Add("@IdProyecto", request.IdProyecto, DbType.Int32);
        parametros.Add("@IdSite", request.IdSite, DbType.String);
        parametros.Add("@CorreSite", request.CorreSite, DbType.Int32);
        parametros.Add("@TipoTrabajo", request.TipoTrabajo, DbType.String);
        parametros.Add("@IdSolicitante", request.IdSolicitante, DbType.Int32);
        parametros.Add("@FormaEnvio", request.FormaEnvio, DbType.Int32);
        parametros.Add("@RazonSocial", request.RazonSocial, DbType.Int32);
        parametros.Add("@Ubigeo", request.Ubigeo, DbType.String);
        parametros.Add("@Direccion", request.Direccion, DbType.String);
        parametros.Add("@Referencia", NullIfWhiteSpace(request.Referencia), DbType.String);
        parametros.Add("@IdConEntrega1", request.IdConEntrega1, DbType.Int32);
        parametros.Add("@IdConEntrega2", request.IdConEntrega2, DbType.Int32);
        parametros.Add("@ImagenSolicitud", NullIfWhiteSpace(request.ImagenSolicitud), DbType.String);
        parametros.Add("@Items", JsonSerializer.Serialize(request.Items, JsonOptions), DbType.String);
        parametros.Add("@Usuario", usuario, DbType.String);
        parametros.Add("@IdEmpleadoCj", idEmpleadoCj, DbType.Int32);
        parametros.Add("@NroSolicitud", dbType: DbType.String, size: 50, direction: ParameterDirection.Output);
        parametros.Add("@IdEstado", dbType: DbType.Int32, direction: ParameterDirection.Output);

        await using var connection = _sqlCommandFactory.CreateConnection();
        await EjecutarAsync(() => connection.ExecuteAsync(
            _sqlCommandFactory.Create(SolicitudRegistrarSp, parametros, CommandType.StoredProcedure, cancellationToken, commandTimeout: 180)));

        return new LogisticaSolicitudRegistrarResultDto
        {
            NroSolicitud = parametros.Get<string?>("@NroSolicitud") ?? string.Empty,
            IdEstado = parametros.Get<int?>("@IdEstado") ?? 0,
        };
    }

    public async Task<IEnumerable<LogisticaSolicitudPorAprobarDto>> ListarPorAprobarAsync(
        LogisticaSolicitudPorAprobarConsultaDto consulta,
        CancellationToken cancellationToken = default)
    {
        await using var connection = _sqlCommandFactory.CreateConnection();
        return await connection.QueryAsync<LogisticaSolicitudPorAprobarDto>(
            _sqlCommandFactory.Create(
                SolicitudPorAprobarSp,
                new { consulta.IdCliente, consulta.IdProyecto, IdSite = NullIfWhiteSpace(consulta.IdSite), consulta.CorreSite },
                CommandType.StoredProcedure,
                cancellationToken,
                commandTimeout: 120));
    }

    public async Task<IEnumerable<LogisticaSolicitudDetalleDto>> ListarDetalleSolicitudAsync(
        string nroSolicitud,
        CancellationToken cancellationToken = default)
    {
        await using var connection = _sqlCommandFactory.CreateConnection();
        return await connection.QueryAsync<LogisticaSolicitudDetalleDto>(
            _sqlCommandFactory.Create(
                SolicitudDetalleSp,
                new { NroSolicitud = nroSolicitud.Trim() },
                CommandType.StoredProcedure,
                cancellationToken,
                commandTimeout: 60));
    }

    public async Task<LogisticaSolicitudAprobarResultDto> AprobarSolicitudesAsync(
        LogisticaSolicitudAprobarDto request,
        string usuario,
        int? idEmpleadoCj,
        CancellationToken cancellationToken = default)
    {
        var items = request.Solicitudes.Select(nro => new { nroSolicitud = nro });
        var parametros = new DynamicParameters();
        parametros.Add("@Items", JsonSerializer.Serialize(items, JsonOptions), DbType.String);
        parametros.Add("@Accion", request.Accion?.Trim().ToUpperInvariant() ?? string.Empty, DbType.String);
        parametros.Add("@IdValidador", request.IdValidador, DbType.Int32);
        parametros.Add("@Observacion", NullIfWhiteSpace(request.Observacion), DbType.String);
        parametros.Add("@Usuario", usuario, DbType.String);
        parametros.Add("@IdEmpleadoCj", idEmpleadoCj, DbType.Int32);
        parametros.Add("@Procesadas", dbType: DbType.Int32, direction: ParameterDirection.Output);

        await using var connection = _sqlCommandFactory.CreateConnection();
        await EjecutarAsync(() => connection.ExecuteAsync(
            _sqlCommandFactory.Create(SolicitudAprobarSp, parametros, CommandType.StoredProcedure, cancellationToken, commandTimeout: 180)));

        return new LogisticaSolicitudAprobarResultDto { Procesadas = parametros.Get<int?>("@Procesadas") ?? 0 };
    }

    public async Task<LogisticaSolicitudCorreoCabDto?> ObtenerCabeceraSolicitudAsync(
        string nroSolicitud,
        CancellationToken cancellationToken = default)
    {
        await using var connection = _sqlCommandFactory.CreateConnection();
        return await connection.QueryFirstOrDefaultAsync<LogisticaSolicitudCorreoCabDto>(
            _sqlCommandFactory.Create(
                SolicitudCorreoSp,
                new { NroSolicitud = nroSolicitud.Trim() },
                CommandType.StoredProcedure,
                cancellationToken,
                commandTimeout: 60));
    }

    // ---- x Campo ----

    public async Task<IEnumerable<LogisticaCampoLineaDto>> ConsultarCampoAsync(
        LogisticaCampoConsultaDto consulta,
        CancellationToken cancellationToken = default)
    {
        await using var connection = _sqlCommandFactory.CreateConnection();
        return await EjecutarAsync(() => connection.QueryAsync<LogisticaCampoLineaDto>(
            _sqlCommandFactory.Create(
                CampoConsultarSp,
                new
                {
                    Solicitudes = NullIfWhiteSpace(consulta.Solicitudes),
                    FechaIni = consulta.FechaIni?.Date,
                    FechaFin = consulta.FechaFin?.Date,
                    consulta.IdRespCampo,
                    consulta.IdCliente,
                    consulta.IdProyecto,
                    IdSite = NullIfWhiteSpace(consulta.IdSite),
                    consulta.CorreSite,
                },
                CommandType.StoredProcedure,
                cancellationToken,
                commandTimeout: 120)));
    }

    public async Task<LogisticaCampoGrabarResultDto> GrabarCampoAsync(
        LogisticaCampoGrabarDto request,
        string usuario,
        int? idEmpleadoCj,
        CancellationToken cancellationToken = default)
    {
        var parametros = new DynamicParameters();
        parametros.Add("@Items", JsonSerializer.Serialize(request.Items, JsonOptions), DbType.String);
        parametros.Add("@Usuario", usuario, DbType.String);
        parametros.Add("@IdEmpleadoCj", idEmpleadoCj, DbType.Int32);
        parametros.Add("@IdResponsable", idEmpleadoCj, DbType.Int32);
        parametros.Add("@Procesadas", dbType: DbType.Int32, direction: ParameterDirection.Output);
        parametros.Add("@ConDiferencia", dbType: DbType.Int32, direction: ParameterDirection.Output);

        await using var connection = _sqlCommandFactory.CreateConnection();
        await EjecutarAsync(() => connection.ExecuteAsync(
            _sqlCommandFactory.Create(CampoGrabarSp, parametros, CommandType.StoredProcedure, cancellationToken, commandTimeout: 180)));

        return new LogisticaCampoGrabarResultDto
        {
            Procesadas = parametros.Get<int?>("@Procesadas") ?? 0,
            ConDiferencia = parametros.Get<int?>("@ConDiferencia") ?? 0,
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
