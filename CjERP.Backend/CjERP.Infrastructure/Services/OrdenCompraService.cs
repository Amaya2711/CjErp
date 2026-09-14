using System.Data;
using System.Globalization;
using System.Text.Json;
using CjERP.Application.DTOs;
using CjERP.Application.Interfaces.Services;
using CjERP.Infrastructure.Persistence.Sql;
using Dapper;
using QuestPDF.Fluent;

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
    private const string BuscarAprobacionSql = """
        SELECT TOP 1 IdOc, IdAprobador1, IdAprobador2, IdAprobador3, IdEstado
        FROM dbo.CabOrdenCompra
        WHERE IdOc = @IdOc;
        """;
    private const string BuscarPdfMetadataSql = """
        SELECT TOP 1
            cab.FechaOrden,
            COALESCE(forma.ValorIni, '') AS FormaPago,
            cab.DiasPago
        FROM dbo.CabOrdenCompra cab
        OUTER APPLY (
            SELECT TOP 1 c.ValorIni
            FROM dbo.Constante c
            WHERE c.Correlativo = cab.IdFormaPago
              AND LOWER(c.Campo) IN ('forma_pago', 'tipo_pago', 'formapago', 'tipopago')
            ORDER BY c.Campo
        ) forma
        WHERE cab.IdOc = @IdOc;
        """;
    private const string BuscarDetalleEditarSql = """
        SELECT TOP 1
            IdOc,
            IdSite,
            Correlativo,
            Fila,
            IdAprobador3,
            {0} AS ValorAnterior
        FROM dbo.DetOrdenCompra
        WHERE IdOc = @IdOc
          AND IdSite = @IdSite
          AND (@Correlativo IS NULL OR Correlativo = @Correlativo)
          AND (@Fila IS NULL OR Fila = @Fila);
        """;
    private const string ActualizarDetalleSql = """
        UPDATE dbo.DetOrdenCompra
        SET {0} = {1}
        WHERE IdOc = @IdOc
          AND IdSite = @IdSite
          AND (@Correlativo IS NULL OR Correlativo = @Correlativo)
          AND (@Fila IS NULL OR Fila = @Fila);
        """;
    private const string BuscarRecibosAsociadosSql = """
        SELECT
            a.CorreSite AS Correlativo,
            a.FecIngreso,
            a.Subtotal,
            a.Igv,
            a.Total,
            b.ValorIni AS Moneda,
            a.Detalle,
            COALESCE(a.ImgSustento, '') AS RutaImagen,
            a.IdCliente,
            a.IdProyecto,
            a.IdSite,
            a.CorreSite,
            a.Tipo_Trabajo AS TipoTrabajo,
            c.ValorIni AS Comprobante,
            d.NombreEmpleado AS Responsable,
            d.NroDocumento,
            e.ValorIni AS Estado,
            f.ValorIni AS Tarea,
            a.Fila,
            TRY_CONVERT(int, NULLIF(LTRIM(RTRIM(CONVERT(varchar(50), a.IdOc))), '')) AS IdOc
        FROM dbo.Planilla a
        LEFT JOIN dbo.Constante b ON b.Campo = 'TIPO_MONEDA' AND a.TipoMoneda = b.Correlativo
        LEFT JOIN dbo.Constante c ON c.Campo = 'TIPO_COMPROBANTE' AND a.IdComprobante = c.Correlativo
        LEFT JOIN dbo.Empleado d ON a.IdResponsable = d.IdEmpleado
        LEFT JOIN dbo.Constante e ON e.Campo = 'ESTADO' AND e.Correlativo = a.Estado
        LEFT JOIN dbo.Constante f ON f.Campo = 'TAREA' AND f.Correlativo = a.IdTarea
        WHERE TRY_CONVERT(int, NULLIF(LTRIM(RTRIM(CONVERT(varchar(50), a.IdOc))), '')) = @IdOc
          AND (@Fila IS NULL OR a.Fila = @Fila)
        ORDER BY a.TipoMoneda, a.FecIngreso, a.Correlativo;
        """;
    private const string BuscarRecibosSinAsociarSql = """
        SELECT
            a.Correlativo,
            a.FecIngreso,
            a.Subtotal,
            a.Igv,
            a.Total,
            b.ValorIni AS Moneda,
            a.Detalle,
            COALESCE(a.ImgSustento, '') AS RutaImagen,
            a.IdCliente,
            a.IdProyecto,
            a.IdSite,
            a.CorreSite,
            a.Tipo_Trabajo AS TipoTrabajo,
            c.ValorIni AS Comprobante,
            d.NombreEmpleado AS Responsable,
            d.NroDocumento,
            e.ValorIni AS Estado,
            f.ValorIni AS Tarea,
            a.Fila,
            TRY_CONVERT(int, NULLIF(LTRIM(RTRIM(CONVERT(varchar(50), a.IdOc))), '')) AS IdOc
        FROM dbo.Planilla a
        LEFT JOIN dbo.Constante b ON b.Campo = 'TIPO_MONEDA' AND a.TipoMoneda = b.Correlativo
        LEFT JOIN dbo.Constante c ON c.Campo = 'TIPO_COMPROBANTE' AND a.IdComprobante = c.Correlativo
        LEFT JOIN dbo.Empleado d ON a.IdResponsable = d.IdEmpleado
        LEFT JOIN dbo.Constante e ON e.Campo = 'ESTADO' AND a.Estado = e.Correlativo
        LEFT JOIN dbo.Constante f ON f.Campo = 'TAREA' AND f.Correlativo = a.IdTarea
        WHERE (a.Fila IS NULL OR TRY_CONVERT(varchar(50), a.Fila) = '')
          AND a.Estado IN (0, 1, 4, 5, 6)
          AND (a.IdOc IS NULL OR LTRIM(RTRIM(CONVERT(varchar(50), a.IdOc))) = '')
          AND EXISTS (
              SELECT 1
              FROM dbo.DetOrdenCompra doc
              WHERE doc.IdOc = @IdOc
                AND (@Fila IS NULL OR doc.Fila = @Fila)
                AND doc.IdCliente = a.IdCliente
                AND doc.IdProyecto = a.IdProyecto
                AND doc.IdSite = a.IdSite
                AND ISNULL(doc.Correlativo, 0) = ISNULL(a.CorreSite, 0)
                AND ISNULL(doc.TipoTrabajo, '') = ISNULL(a.Tipo_Trabajo, '')
          )
        ORDER BY a.TipoMoneda, a.FecIngreso, a.Correlativo;
        """;
    private const string AsociarReciboSql = """
        UPDATE a
        SET IdOc = CONVERT(varchar(50), @IdOc),
            Fila = doc.Fila
        FROM dbo.Planilla a
        CROSS APPLY (
            SELECT TOP 1 d.Fila
            FROM dbo.DetOrdenCompra d
            WHERE d.IdOc = @IdOc
              AND (@Fila IS NULL OR d.Fila = @Fila)
              AND d.IdCliente = a.IdCliente
              AND d.IdProyecto = a.IdProyecto
              AND d.IdSite = a.IdSite
              AND ISNULL(d.Correlativo, 0) = ISNULL(a.CorreSite, 0)
              AND ISNULL(d.TipoTrabajo, '') = ISNULL(a.Tipo_Trabajo, '')
            ORDER BY d.Fila
        ) doc
        WHERE a.Correlativo = @Correlativo
          AND (a.IdOc IS NULL OR LTRIM(RTRIM(CONVERT(varchar(50), a.IdOc))) = '')
          AND (@RequierePagado = 0 OR a.Estado = 4);
        """;
    private const string BuscarMontoOcSql = """
        WITH PosicionObjetivo AS (
            SELECT TOP 1
                doc.IdSite,
                doc.TipoTrabajo
            FROM dbo.DetOrdenCompra doc
            WHERE doc.IdOc = @IdOc
              AND (@Fila IS NULL OR doc.Fila = @Fila)
            ORDER BY doc.Fila
        )
        SELECT
            f.IdOc,
            f.IdCliente,
            f.IdProyecto,
            f.Correlativo,
            b.NombreCliente,
            c.NombreProyecto,
            f.TipoTrabajo,
            f.IdSite,
            d.NombreSite,
            COALESCE(a.MontoOc, 0) AS MontoOc,
            COALESCE(f.Cantidad * f.PrecioUnitario, 0) AS PagadoFic,
            CASE WHEN COALESCE(a.MontoOc, 0) = 0 THEN 0
                 ELSE COALESCE(f.Cantidad * f.PrecioUnitario, 0) / NULLIF(a.MontoOc, 0)
            END AS AvanceFic,
            CASE WHEN f.IdEstado = 1 THEN COALESCE(f.Cantidad * f.PrecioUnitario, 0) ELSE 0 END AS Pagado,
            CASE WHEN COALESCE(a.MontoOc, 0) = 0 THEN 0
                 ELSE (CASE WHEN f.IdEstado = 1 THEN COALESCE(f.Cantidad * f.PrecioUnitario, 0) ELSE 0 END) / NULLIF(a.MontoOc, 0)
            END AS Avance,
            COALESCE(a.MontoOc, 0) - COALESCE(f.Cantidad * f.PrecioUnitario, 0) AS Saldo,
            f.Detalle,
            CASE
                WHEN f.IdEstado = 6 THEN COALESCE(n.ValorIni, 'Rechazado')
                WHEN f.IdAprobador3 > 0 THEN 'Aprobado'
                WHEN f.IdAprobador2 > 0 THEN 'En 3er. Aprob'
                WHEN f.IdAprobador1 > 0 THEN 'En 2da. Aprob'
                ELSE 'En 1er. Aprob'
            END AS Estado,
            f.Fila,
            COALESCE(sol.NombreEmpleado, solWeb.NombreEmpleado, '') AS Solicitante
        FROM PosicionObjetivo objetivo
        INNER JOIN dbo.DetOrdenCompra f
            ON f.IdSite = objetivo.IdSite
           AND ISNULL(f.TipoTrabajo, '') = ISNULL(objetivo.TipoTrabajo, '')
        OUTER APPLY (
            SELECT TOP 1 imp.MontoOc, imp.Correlativo
            FROM dbo.Importar imp
            WHERE imp.IdSite = f.IdSite
              AND ISNULL(imp.TipoTrabajo, '') = ISNULL(f.TipoTrabajo, '')
              AND imp.IdEstado = 1
            ORDER BY
                CASE WHEN imp.IdCliente = f.IdCliente THEN 0 ELSE 1 END,
                CASE WHEN imp.IdProyecto = f.IdProyecto THEN 0 ELSE 1 END,
                CASE WHEN ISNULL(imp.Correlativo, 0) = ISNULL(f.Correlativo, 0) THEN 0 ELSE 1 END
        ) a
        LEFT JOIN dbo.CabOrdenCompra cab ON cab.IdOc = f.IdOc
        LEFT JOIN dbo.Empleado empSol
            ON cab.IdSolicitante = empSol.IdEmpleado
           AND (cab.IdWeb <> 1 OR cab.IdWeb IS NULL)
        LEFT JOIN dbo.EmpleadoCj sol
            ON sol.IdEmpleado = empSol.IdEmpleadoCj
           AND (cab.IdWeb <> 1 OR cab.IdWeb IS NULL)
        LEFT JOIN dbo.EmpleadoCj solWeb
            ON cab.IdSolicitante = solWeb.IdEmpleado
           AND cab.IdWeb = 1
        LEFT JOIN dbo.Cliente b ON f.IdCliente = b.IdCliente
        LEFT JOIN dbo.Proyecto c ON f.IdProyecto = c.IdProyecto
        LEFT JOIN dbo.Site d ON f.IdSite = d.IdSite AND f.Correlativo = d.Correlativo
        LEFT JOIN dbo.Constante n ON f.IdEstado = n.Correlativo AND n.Campo = 'estado_log'
        WHERE ISNULL(f.IdEstado, 0) <> 6
        ORDER BY f.TipoTrabajo, f.IdOc, f.Fila;
        """;
    private readonly ISqlCommandFactory _sqlCommandFactory;

    public OrdenCompraService(ISqlCommandFactory sqlCommandFactory)
    {
        _sqlCommandFactory = sqlCommandFactory;
    }

    public async Task<IEnumerable<OrdenCompraCabeceraDto>> BuscarCabeceraAsync(
        OrdenCompraConsultaRequestDto request,
        CancellationToken cancellationToken = default)
    {
        await using var connection = _sqlCommandFactory.CreateConnection();
        return await connection.QueryAsync<OrdenCompraCabeceraDto>(
            _sqlCommandFactory.Create(
                BuscarCabeceraSp,
                BuildConsultaParameters(request),
                CommandType.StoredProcedure,
                cancellationToken,
                commandTimeout: 120));
    }

    public async Task<IEnumerable<OrdenCompraDetalleDto>> BuscarDetalleAsync(
        OrdenCompraConsultaRequestDto request,
        CancellationToken cancellationToken = default)
    {
        await using var connection = _sqlCommandFactory.CreateConnection();
        return await connection.QueryAsync<OrdenCompraDetalleDto>(
            _sqlCommandFactory.Create(
                BuscarDetalleSp,
                BuildConsultaParameters(request),
                CommandType.StoredProcedure,
                cancellationToken,
                commandTimeout: 120));
    }

    public async Task<int> InsertarAsync(
        OrdenCompraInsertRequestDto request,
        CancellationToken cancellationToken = default)
    {
        await using var connection = _sqlCommandFactory.CreateConnection();

        var detalleJson = JsonSerializer.Serialize(
            request.Detalle.Select(item => new
            {
                item.IdCliente,
                item.IdProyecto,
                item.IdSite,
                item.Correlativo,
                item.TipoTrabajo,
                item.IdTarea,
                item.Ot,
                item.Detalle,
                item.Cantidad,
                item.PrecioUnitario,
                item.IdComprobante,
                item.ImgOc,
                item.ImgPresupuesto,
                item.Peso
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
            _sqlCommandFactory.Create(
                InsertarSp,
                parameters,
                CommandType.StoredProcedure,
                cancellationToken,
                commandTimeout: 120));

        if (request.IdWeb > 0 && idOc > 0)
        {
            await connection.ExecuteAsync(
                _sqlCommandFactory.Create(
                    ActualizarIdWebSql,
                    new { IdWeb = request.IdWeb, IdOc = idOc },
                    CommandType.Text,
                    cancellationToken,
                    commandTimeout: 120));
        }

        return idOc;
    }

    public async Task RechazarMasivoAsync(
        OrdenCompraRechazoMasivoRequestDto request,
        CancellationToken cancellationToken = default)
    {
        await using var connection = _sqlCommandFactory.CreateConnection();

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
            _sqlCommandFactory.Create(
                RechazarMasivoSp,
                parameters,
                CommandType.StoredProcedure,
                cancellationToken,
                commandTimeout: 120));
    }

    public async Task<IReadOnlyList<OrdenCompraAprobacionResultDto>> AprobarAsync(
        OrdenCompraAprobarRequestDto request,
        CancellationToken cancellationToken = default)
    {
        var idsOc = request.IdsOc
            .Where(id => id > 0)
            .Distinct()
            .ToArray();

        if (idsOc.Length == 0)
        {
            throw new InvalidOperationException("Seleccione al menos una orden de compra para aprobar.");
        }

        if (request.IdAprobador is null or <= 0)
        {
            throw new InvalidOperationException("No se pudo resolver el aprobador.");
        }

        await using var connection = _sqlCommandFactory.CreateConnection();
        await connection.OpenAsync(cancellationToken);
        await using var transaction = await connection.BeginTransactionAsync(cancellationToken);

        try
        {
            var results = new List<OrdenCompraAprobacionResultDto>();
            foreach (var idOc in idsOc)
            {
                var snapshot = await connection.QuerySingleOrDefaultAsync<OrdenCompraAprobacionSnapshot>(
                    new CommandDefinition(
                        BuscarAprobacionSql,
                        new { IdOc = idOc },
                        transaction,
                        cancellationToken: cancellationToken,
                        commandTimeout: 120));

                if (snapshot is null)
                {
                    throw new InvalidOperationException($"No se encontro la orden de compra {idOc}.");
                }

                if (snapshot.IdEstado == 6)
                {
                    throw new InvalidOperationException($"La orden de compra {idOc} esta rechazada y no puede aprobarse.");
                }

                var nivel = request.Nivel is >= 1 and <= 3
                    ? request.Nivel.Value
                    : ResolveNextApprovalLevel(snapshot);

                ValidateApprovalLevel(snapshot, nivel, idOc);

                var idEstado = nivel == 3 ? 1 : 0;
                var fecha = DateTime.Now;
                var column = $"IdAprobador{nivel}";
                var dateColumn = $"FechaAprobador{nivel}";

                await connection.ExecuteAsync(
                    new CommandDefinition(
                        $"""
                        UPDATE dbo.CabOrdenCompra
                        SET IdEstado = @IdEstado,
                            {column} = @IdAprobador,
                            {dateColumn} = @Fecha
                        WHERE IdOc = @IdOc;
                        """,
                        new { IdOc = idOc, IdEstado = idEstado, IdAprobador = request.IdAprobador.Value, Fecha = fecha },
                        transaction,
                        cancellationToken: cancellationToken,
                        commandTimeout: 120));

                var detalleSet = nivel == 3
                    ? $"{column} = @IdAprobador, {dateColumn} = @Fecha, IdEstado = 1"
                    : $"{column} = @IdAprobador, {dateColumn} = @Fecha";

                await connection.ExecuteAsync(
                    new CommandDefinition(
                        $"""
                        UPDATE dbo.DetOrdenCompra
                        SET {detalleSet}
                        WHERE IdOc = @IdOc;
                        """,
                        new { IdOc = idOc, IdAprobador = request.IdAprobador.Value, Fecha = fecha },
                        transaction,
                        cancellationToken: cancellationToken,
                        commandTimeout: 120));

                results.Add(new OrdenCompraAprobacionResultDto
                {
                    IdOc = idOc,
                    Nivel = nivel,
                    IdAprobador = request.IdAprobador.Value
                });
            }

            await transaction.CommitAsync(cancellationToken);
            return results;
        }
        catch
        {
            await transaction.RollbackAsync(cancellationToken);
            throw;
        }
    }

    public async Task<OrdenCompraEditarDetalleResultDto> EditarDetalleAsync(
        OrdenCompraEditarDetalleRequestDto request,
        CancellationToken cancellationToken = default)
    {
        if (request.IdOc <= 0 || string.IsNullOrWhiteSpace(request.IdSite))
        {
            throw new InvalidOperationException("Debe indicar OC y Site para actualizar el detalle.");
        }

        if (request.Correlativo is null && request.Fila is null)
        {
            throw new InvalidOperationException("Debe indicar correlativo o fila para actualizar el detalle.");
        }

        var field = ResolveEditableDetailField(request.Campo);

        await using var connection = _sqlCommandFactory.CreateConnection();
        var parameters = new DynamicParameters();
        parameters.Add("@IdOc", request.IdOc, DbType.Int32);
        parameters.Add("@IdSite", NullIfWhiteSpace(request.IdSite), DbType.String);
        parameters.Add("@Correlativo", request.Correlativo, DbType.Int32);
        parameters.Add("@Fila", request.Fila, DbType.Int32);
        parameters.Add("@Valor", request.Valor, DbType.String);

        var snapshot = await connection.QuerySingleOrDefaultAsync<OrdenCompraDetalleEditSnapshot>(
            _sqlCommandFactory.Create(
                string.Format(BuscarDetalleEditarSql, field.SelectExpression),
                parameters,
                CommandType.Text,
                cancellationToken,
                commandTimeout: 120));

        if (snapshot is null)
        {
            throw new InvalidOperationException("No se encontro el detalle de la orden de compra.");
        }

        if (snapshot.IdAprobador3 is > 0)
        {
            throw new InvalidOperationException("Documento ya aprobado, no se puede modificar.");
        }

        await connection.ExecuteAsync(
            _sqlCommandFactory.Create(
                string.Format(ActualizarDetalleSql, field.ColumnName, field.UpdateExpression),
                parameters,
                CommandType.Text,
                cancellationToken,
                commandTimeout: 120));

        return new OrdenCompraEditarDetalleResultDto
        {
            IdOc = request.IdOc,
            IdSite = request.IdSite,
            Correlativo = request.Correlativo,
            Fila = request.Fila,
            Campo = field.ColumnName,
            ValorAnterior = snapshot.ValorAnterior,
            ValorNuevo = request.Valor
        };
    }

    public async Task<IEnumerable<OrdenCompraReciboDto>> BuscarRecibosAsociadosAsync(
        OrdenCompraRecibosRequestDto request,
        CancellationToken cancellationToken = default)
    {
        if (request.IdOc <= 0)
        {
            throw new InvalidOperationException("Debe indicar la OC para consultar recibos asociados.");
        }

        await using var connection = _sqlCommandFactory.CreateConnection();
        return await connection.QueryAsync<OrdenCompraReciboDto>(
            _sqlCommandFactory.Create(
                BuscarRecibosAsociadosSql,
                new { request.IdOc, request.Fila },
                CommandType.Text,
                cancellationToken,
                commandTimeout: 120));
    }

    public async Task<IEnumerable<OrdenCompraReciboDto>> BuscarRecibosSinAsociarAsync(
        OrdenCompraRecibosRequestDto request,
        CancellationToken cancellationToken = default)
    {
        if (request.IdOc <= 0)
        {
            throw new InvalidOperationException("Debe indicar la OC para consultar recibos sin asociar.");
        }

        await using var connection = _sqlCommandFactory.CreateConnection();
        return await connection.QueryAsync<OrdenCompraReciboDto>(
            _sqlCommandFactory.Create(
                BuscarRecibosSinAsociarSql,
                new { request.IdOc, request.Fila },
                CommandType.Text,
                cancellationToken,
                commandTimeout: 120));
    }

    public async Task<OrdenCompraAsociarRecibosResultDto> AsociarRecibosAsync(
        OrdenCompraAsociarRecibosRequestDto request,
        CancellationToken cancellationToken = default)
    {
        if (request.IdOc <= 0)
        {
            throw new InvalidOperationException("Debe indicar la OC para asociar recibos.");
        }

        var correlativos = request.Correlativos
            .Where(item => item > 0)
            .Distinct()
            .ToArray();

        if (correlativos.Length == 0)
        {
            throw new InvalidOperationException("Seleccione al menos un recibo para asociar.");
        }

        await using var connection = _sqlCommandFactory.CreateConnection();
        await connection.OpenAsync(cancellationToken);
        await using var transaction = await connection.BeginTransactionAsync(cancellationToken);

        try
        {
            var asociados = 0;
            var requierePagado = request.Nivel is 2 or 3 ? 1 : 0;

            foreach (var correlativo in correlativos)
            {
                asociados += await connection.ExecuteAsync(
                    new CommandDefinition(
                        AsociarReciboSql,
                        new { request.IdOc, request.Fila, Correlativo = correlativo, RequierePagado = requierePagado },
                        transaction,
                        cancellationToken: cancellationToken,
                        commandTimeout: 120));
            }

            await transaction.CommitAsync(cancellationToken);

            return new OrdenCompraAsociarRecibosResultDto
            {
                IdOc = request.IdOc,
                Solicitados = correlativos.Length,
                Asociados = asociados
            };
        }
        catch
        {
            await transaction.RollbackAsync(cancellationToken);
            throw;
        }
    }

    public async Task<IEnumerable<OrdenCompraMontoOcDto>> BuscarMontoOcAsync(
        OrdenCompraRecibosRequestDto request,
        CancellationToken cancellationToken = default)
    {
        if (request.IdOc <= 0)
        {
            throw new InvalidOperationException("Debe indicar la OC para consultar el monto OC.");
        }

        await using var connection = _sqlCommandFactory.CreateConnection();
        return await connection.QueryAsync<OrdenCompraMontoOcDto>(
            _sqlCommandFactory.Create(
                BuscarMontoOcSql,
                new { request.IdOc, request.Fila },
                CommandType.Text,
                cancellationToken,
                commandTimeout: 120));
    }

    public async Task<OrdenCompraPdfResultDto> GenerarPdfAsync(
        int idOc,
        CancellationToken cancellationToken = default)
    {
        if (idOc <= 0)
        {
            throw new InvalidOperationException("Debe indicar una orden de compra valida.");
        }

        var consulta = new OrdenCompraConsultaRequestDto { IdOc = idOc.ToString(CultureInfo.InvariantCulture) };
        var cabecera = (await BuscarCabeceraAsync(consulta, cancellationToken))
            .FirstOrDefault(item => item.IdOc == idOc);

        if (cabecera is null)
        {
            throw new InvalidOperationException($"No se encontro la orden de compra {idOc}.");
        }

        var detalle = (await BuscarDetalleAsync(consulta, cancellationToken))
            .Where(item => item.IdOc == idOc)
            .OrderBy(item => item.Fila ?? int.MaxValue)
            .ThenBy(item => item.IdSite)
            .ThenBy(item => item.Tarea)
            .ToList();

        var metadata = await BuscarPdfMetadataAsync(idOc, cancellationToken);
        // Logo corporativo para documentos: fondo blanco, apto para impresión.
        var logoPath = FindProjectFile("cjerp-frontend", "src", "assets", "cj-telecom-logo-white.svg");
        var footerImagePaths = new[]
        {
            FindProjectFile("cjerp-frontend", "src", "assets", "PiePagina.png")
        }
        .Where(path => !string.IsNullOrWhiteSpace(path))
        .Select(path => path!)
        .ToArray();
        var document = new OrdenCompraPdfDocument(cabecera, detalle, metadata, logoPath, footerImagePaths);
        var content = document.GeneratePdf();
        var year = (metadata.FechaOrden ?? cabecera.Fecha ?? DateTime.Today).Year;

        return new OrdenCompraPdfResultDto
        {
            Content = content,
            FileName = $"OC_{cabecera.IdOc}_{year}.pdf"
        };
    }

    private async Task<OrdenCompraPdfMetadataDto> BuscarPdfMetadataAsync(
        int idOc,
        CancellationToken cancellationToken)
    {
        try
        {
            await using var connection = _sqlCommandFactory.CreateConnection();
            var metadata = await connection.QuerySingleOrDefaultAsync<OrdenCompraPdfMetadataDto>(
                _sqlCommandFactory.Create(
                    BuscarPdfMetadataSql,
                    new { IdOc = idOc },
                    CommandType.Text,
                    cancellationToken,
                    commandTimeout: 60));

            return metadata ?? new OrdenCompraPdfMetadataDto();
        }
        catch
        {
            return new OrdenCompraPdfMetadataDto();
        }
    }

    private static string? FindProjectFile(params string[] pathParts)
    {
        var current = new DirectoryInfo(AppContext.BaseDirectory);
        while (current is not null)
        {
            var candidate = Path.Combine(new[] { current.FullName }.Concat(pathParts).ToArray());
            if (File.Exists(candidate))
            {
                return candidate;
            }

            current = current.Parent;
        }

        return null;
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

    private static int ResolveNextApprovalLevel(OrdenCompraAprobacionSnapshot snapshot)
    {
        if (snapshot.IdAprobador1 is null or <= 0) return 1;
        if (snapshot.IdAprobador2 is null or <= 0) return 2;
        if (snapshot.IdAprobador3 is null or <= 0) return 3;
        throw new InvalidOperationException($"La orden de compra {snapshot.IdOc} ya tiene los tres niveles aprobados.");
    }

    private static void ValidateApprovalLevel(OrdenCompraAprobacionSnapshot snapshot, int nivel, int idOc)
    {
        if (nivel == 1 && snapshot.IdAprobador1 is > 0)
        {
            throw new InvalidOperationException($"La orden de compra {idOc} ya tiene 1er aprobador.");
        }

        if (nivel == 2)
        {
            if (snapshot.IdAprobador1 is null or <= 0)
            {
                throw new InvalidOperationException($"La orden de compra {idOc} requiere 1er aprobador antes del 2do.");
            }

            if (snapshot.IdAprobador2 is > 0)
            {
                throw new InvalidOperationException($"La orden de compra {idOc} ya tiene 2do aprobador.");
            }
        }

        if (nivel == 3)
        {
            if (snapshot.IdAprobador1 is null or <= 0 || snapshot.IdAprobador2 is null or <= 0)
            {
                throw new InvalidOperationException($"La orden de compra {idOc} requiere 1er y 2do aprobador antes del 3ero.");
            }

            if (snapshot.IdAprobador3 is > 0)
            {
                throw new InvalidOperationException($"La orden de compra {idOc} ya tiene 3er aprobador.");
            }
        }
    }

    private static EditableDetailField ResolveEditableDetailField(string campo)
    {
        var normalized = (campo ?? string.Empty).Trim().ToLowerInvariant();
        return normalized switch
        {
            "detalle" => new("Detalle", "CONVERT(nvarchar(max), Detalle)", "@Valor"),
            "cantidad" => new("Cantidad", "CONVERT(nvarchar(80), Cantidad)", "TRY_CONVERT(decimal(18, 4), @Valor)"),
            "preciounitario" => new("PrecioUnitario", "CONVERT(nvarchar(80), PrecioUnitario)", "TRY_CONVERT(decimal(18, 4), @Valor)"),
            "ot" => new("Ot", "CONVERT(nvarchar(80), Ot)", "@Valor"),
            "tipotrabajo" => new("TipoTrabajo", "CONVERT(nvarchar(120), TipoTrabajo)", "@Valor"),
            "idtarea" => new("IdTarea", "CONVERT(nvarchar(80), IdTarea)", "TRY_CONVERT(int, @Valor)"),
            "idcomprobante" => new("IdComprobante", "CONVERT(nvarchar(80), IdComprobante)", "TRY_CONVERT(int, @Valor)"),
            "imgoc" => new("ImgOc", "CONVERT(nvarchar(250), ImgOc)", "@Valor"),
            "imgpresupuesto" => new("ImgPresupuesto", "CONVERT(nvarchar(250), ImgPresupuesto)", "@Valor"),
            "peso" => new("Peso", "CONVERT(nvarchar(80), Peso)", "TRY_CONVERT(decimal(18, 4), @Valor)"),
            _ => throw new InvalidOperationException("El campo indicado no esta habilitado para edicion.")
        };
    }

    private sealed class OrdenCompraAprobacionSnapshot
    {
        public int IdOc { get; set; }
        public int? IdAprobador1 { get; set; }
        public int? IdAprobador2 { get; set; }
        public int? IdAprobador3 { get; set; }
        public int? IdEstado { get; set; }
    }

    private sealed class OrdenCompraDetalleEditSnapshot
    {
        public int IdOc { get; set; }
        public string IdSite { get; set; } = string.Empty;
        public int? Correlativo { get; set; }
        public int? Fila { get; set; }
        public int? IdAprobador3 { get; set; }
        public string? ValorAnterior { get; set; }
    }

    private sealed record EditableDetailField(string ColumnName, string SelectExpression, string UpdateExpression);
}


