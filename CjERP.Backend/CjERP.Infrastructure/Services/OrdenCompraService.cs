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
    private const string BuscarOrigenPagoNuevoSql = """
        SELECT TOP 1
            det.IdProyecto,
            det.IdCliente,
            det.IdSite,
            det.Correlativo AS CorreSite,
            det.IdTarea,
            det.TipoTrabajo,
            det.Detalle,
            det.Ot,
            cab.IdAprobador1,
            cab.IdSolicitante,
            cab.IdResponsable,
            cab.IdGestor,
            cab.IdValidador,
            cab.IdMoneda,
            cab.IdComprobante,
            cab.IdFormaPago,
            cab.Subtotal AS SubtotalOc,
            site.NombreSite AS SiteNombre
        FROM dbo.CabOrdenCompra cab
        INNER JOIN dbo.DetOrdenCompra det ON det.IdOc = cab.IdOc
        LEFT JOIN dbo.Site site ON site.IdSite = det.IdSite AND site.Correlativo = det.Correlativo
        WHERE cab.IdOc = @IdOc
          AND det.Fila = @Fila
          AND cab.IdEstado = 1
          AND det.IdEstado = 1
          AND ISNULL(det.IdAprobador1, 0) > 0
          AND ISNULL(det.IdAprobador3, 0) > 0;
        """;
    private const string BuscarBancoCuentaPagoNuevoSql = """
        SELECT TOP 1 cuenta.IdBanco
        FROM dbo.CuentaEmpleado cuenta
        WHERE cuenta.IdEmpleado = @IdResponsable
          AND LTRIM(RTRIM(ISNULL(cuenta.Cuenta, ''))) = LTRIM(RTRIM(@Cuenta))
          AND LTRIM(RTRIM(ISNULL(cuenta.CuentaInter, ''))) = LTRIM(RTRIM(@CuentaInter))
          AND LTRIM(RTRIM(ISNULL(cuenta.NombreCta, ''))) = LTRIM(RTRIM(@NombreCta));
        """;
    private const string BuscarSaldoPagoNuevoSql = """
        SELECT ISNULL(SUM(ISNULL(planilla.Subtotal, 0)), 0)
        FROM dbo.Planilla planilla
        WHERE TRY_CONVERT(INT, NULLIF(LTRIM(RTRIM(CONVERT(VARCHAR(50), planilla.IdOc))), '')) = @IdOc
          AND planilla.IdProyecto = @IdProyecto
          AND planilla.IdSite = @IdSite
          AND ISNULL(planilla.CorreSite, 0) = ISNULL(@CorreSite, 0)
          AND ISNULL(planilla.Estado, 0) <> 3;
        """;
    private const string AsociarPagoNuevoOcSql = """
        UPDATE dbo.Planilla
        SET IdOc = CONVERT(VARCHAR(50), @IdOc),
            Fila = @Fila
        WHERE Correlativo = @Correlativo;
        """;
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
            cab.FechaCreacion AS FechaOrden,
            COALESCE(forma.ValorIni, '') AS FormaPago,
            cab.DiasPago,
            CAST(CASE
                WHEN cab.IdEstado IN (3, 6)
                  OR EXISTS (
                      SELECT 1
                      FROM dbo.DetOrdenCompra det
                      WHERE det.IdOc = cab.IdOc
                        AND det.IdEstado IN (3, 6)
                  ) THEN 1
                ELSE 0
            END AS bit) AS EsRechazada
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
    private const string BuscarAprobadoresRegistradosPdfSql = """
        SELECT TOP 1
            ISNULL(cab.IdWeb, 0) AS IdWeb,
            CASE WHEN MIN(CASE WHEN ISNULL(det.IdAprobador1, 0) > 0 THEN 1 ELSE 0 END) = 1
                 THEN MAX(det.IdAprobador1) END AS IdAprobador1,
            CASE WHEN MIN(CASE WHEN ISNULL(det.IdAprobador2, 0) > 0 THEN 1 ELSE 0 END) = 1
                 THEN MAX(det.IdAprobador2) END AS IdAprobador2,
            CASE WHEN MIN(CASE WHEN ISNULL(det.IdAprobador3, 0) > 0 THEN 1 ELSE 0 END) = 1
                 THEN MAX(det.IdAprobador3) END AS IdAprobador3
        FROM dbo.CabOrdenCompra cab
        INNER JOIN dbo.DetOrdenCompra det ON det.IdOc = cab.IdOc
        WHERE cab.IdOc = @IdOc
        GROUP BY cab.IdOc, cab.IdWeb;
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
            COALESCE(NULLIF(LTRIM(RTRIM(tipoPago.ValorIni)), ''), CONVERT(varchar(20), a.IdTipoPago), '') AS TipoPago,
            COALESCE(responsableCj.NombreEmpleado, d.NombreEmpleado, responsablePorCj.NombreEmpleado, CONVERT(varchar(20), a.IdResponsable), '') AS Responsable,
            COALESCE(gestorCj.NombreEmpleado, gestorLegacy.NombreEmpleado, gestorPorCj.NombreEmpleado, CONVERT(varchar(20), a.IdGestor), '') AS Gestor,
            COALESCE(validadorCj.NombreEmpleado, validadorLegacy.NombreEmpleado, validadorPorCj.NombreEmpleado, CONVERT(varchar(20), a.IdValidador), '') AS Validador,
            d.NroDocumento,
            e.ValorIni AS Estado,
            f.ValorIni AS Tarea,
            a.Fila,
            TRY_CONVERT(int, NULLIF(LTRIM(RTRIM(CONVERT(varchar(50), a.IdOc))), '')) AS IdOc
        FROM dbo.Planilla a
        LEFT JOIN dbo.Constante b ON b.Campo = 'TIPO_MONEDA' AND a.TipoMoneda = b.Correlativo
        LEFT JOIN dbo.Constante c ON c.Campo = 'TIPO_COMPROBANTE' AND a.IdComprobante = c.Correlativo
        LEFT JOIN dbo.Constante tipoPago ON tipoPago.Campo = 'TIPO_PAGO' AND a.IdTipoPago = tipoPago.Correlativo
        LEFT JOIN dbo.Empleado d ON a.IdResponsable = d.IdEmpleado
        LEFT JOIN dbo.EmpleadoCj responsableCj ON a.IdResponsable = responsableCj.IdEmpleado AND ISNULL(a.IdWeb, 0) = 1
        LEFT JOIN dbo.Empleado responsablePorCj ON a.IdResponsable = responsablePorCj.IdEmpleadoCj
        LEFT JOIN dbo.Empleado gestorLegacy ON a.IdGestor = gestorLegacy.IdEmpleado AND ISNULL(a.IdWeb, 0) <> 1
        LEFT JOIN dbo.EmpleadoCj gestorCj ON a.IdGestor = gestorCj.IdEmpleado AND ISNULL(a.IdWeb, 0) = 1
        LEFT JOIN dbo.Empleado gestorPorCj ON a.IdGestor = gestorPorCj.IdEmpleadoCj
        LEFT JOIN dbo.Empleado validadorLegacy ON a.IdValidador = validadorLegacy.IdEmpleado AND ISNULL(a.IdWeb, 0) <> 1
        LEFT JOIN dbo.EmpleadoCj validadorCj ON a.IdValidador = validadorCj.IdEmpleado AND ISNULL(a.IdWeb, 0) = 1
        LEFT JOIN dbo.Empleado validadorPorCj ON a.IdValidador = validadorPorCj.IdEmpleadoCj
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
            tipoPago.ValorIni AS TipoPago,
            d.NombreEmpleado AS Responsable,
            COALESCE(gestorCj.NombreEmpleado, gestorLegacy.NombreEmpleado, '') AS Gestor,
            COALESCE(validadorCj.NombreEmpleado, validadorLegacy.NombreEmpleado, '') AS Validador,
            d.NroDocumento,
            e.ValorIni AS Estado,
            f.ValorIni AS Tarea,
            a.Fila,
            TRY_CONVERT(int, NULLIF(LTRIM(RTRIM(CONVERT(varchar(50), a.IdOc))), '')) AS IdOc
        FROM dbo.Planilla a
        LEFT JOIN dbo.Constante b ON b.Campo = 'TIPO_MONEDA' AND a.TipoMoneda = b.Correlativo
        LEFT JOIN dbo.Constante c ON c.Campo = 'TIPO_COMPROBANTE' AND a.IdComprobante = c.Correlativo
        LEFT JOIN dbo.Constante tipoPago ON tipoPago.Campo = 'TIPO_PAGO' AND a.IdTipoPago = tipoPago.Correlativo
        LEFT JOIN dbo.Empleado d ON a.IdResponsable = d.IdEmpleado
        LEFT JOIN dbo.Empleado gestorLegacy ON a.IdGestor = gestorLegacy.IdEmpleado AND ISNULL(a.IdWeb, 0) <> 1
        LEFT JOIN dbo.EmpleadoCj gestorCj ON a.IdGestor = gestorCj.IdEmpleado AND ISNULL(a.IdWeb, 0) = 1
        LEFT JOIN dbo.Empleado validadorLegacy ON a.IdValidador = validadorLegacy.IdEmpleado AND ISNULL(a.IdWeb, 0) <> 1
        LEFT JOIN dbo.EmpleadoCj validadorCj ON a.IdValidador = validadorCj.IdEmpleado AND ISNULL(a.IdWeb, 0) = 1
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
            cab.FechaCreacion AS FechaOc,
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
    private const string BuscarEdicionCabeceraSql = """
        SELECT TOP 1
            IdOc, IdSolicitante, IdResponsable, IdValidador, IdGestor,
            IdMoneda, IdComprobante, IdFormaPago, DiasPago,
            FechaCreacion AS FechaOrden, ISNULL(Observacion, '') AS Observacion
        FROM dbo.CabOrdenCompra
        WHERE IdOc = @IdOc;
        """;
    private const string ActualizarDatosOperativosInsertSql = """
        ;WITH DetalleOrdenado AS (
            SELECT
                IdOc,
                Fila,
                ROW_NUMBER() OVER (PARTITION BY IdOc ORDER BY Fila) AS Posicion
            FROM dbo.DetOrdenCompra
            WHERE IdOc = @IdOc
        )
        UPDATE det
        SET Correlativo = @Correlativo,
            TipoTrabajo = @TipoTrabajo,
            IdTipoTrabajo = COALESCE(tipoTrabajo.IdTipoTrabajo, det.IdTipoTrabajo),
            IdTarea = @IdTarea,
            Ot = @Ot,
            IdComprobante = COALESCE(@IdComprobante, @IdComprobanteCabecera),
            UsuarioCreacion = @UsuarioCreacion,
            FechaCreacion = @FechaCreacion,
            HoraCreacion = @HoraCreacion
        FROM dbo.DetOrdenCompra det
        INNER JOIN DetalleOrdenado ordenado
            ON ordenado.IdOc = det.IdOc
           AND ordenado.Fila = det.Fila
        OUTER APPLY (
            SELECT TOP (1) constante.Correlativo AS IdTipoTrabajo
            FROM dbo.Constante constante
            WHERE constante.Campo = 'TIPO_TRABAJO'
              AND UPPER(LTRIM(RTRIM(constante.ValorIni))) = UPPER(LTRIM(RTRIM(@TipoTrabajo)))
            ORDER BY constante.Correlativo
        ) tipoTrabajo
        WHERE det.IdOc = @IdOc
          AND ordenado.Posicion = @Posicion;
        """;
    private const string ActualizarCabeceraEdicionSql = """
        UPDATE dbo.CabOrdenCompra
        SET IdSolicitante = @IdSolicitante,
            IdResponsable = @IdResponsable,
            UsuarioCreacion = @UsuarioCreacion,
            FechaCreacion = @FechaCreacion,
            HoraCreacion = @HoraCreacion,
            Observacion = @Observacion,
            IdMoneda = @IdMoneda,
            IdComprobante = @IdComprobante,
            IdValidador = @IdValidador,
            IdGestor = @IdGestor,
            IdFormaPago = @IdFormaPago,
            DiasPago = @DiasPago,
            Subtotal = @Subtotal,
            Igv = @Igv,
            Total = @Total
        WHERE IdOc = @IdOc;
        """;
    private const string ActualizarDetalleEdicionSql = """
        UPDATE dbo.DetOrdenCompra
        SET IdCliente = COALESCE(NULLIF(@IdCliente, 0), IdCliente),
            IdProyecto = COALESCE(NULLIF(@IdProyecto, 0), IdProyecto),
            IdSite = COALESCE(NULLIF(@IdSite, ''), IdSite),
            Correlativo = COALESCE(NULLIF(@Correlativo, 0), Correlativo),
            TipoTrabajo = COALESCE(NULLIF(@TipoTrabajo, ''), TipoTrabajo),
            IdTarea = COALESCE(NULLIF(@IdTarea, 0), IdTarea),
            Ot = COALESCE(NULLIF(@Ot, ''), Ot),
            Detalle = @Detalle,
            Cantidad = @Cantidad,
            PrecioUnitario = @PrecioUnitario,
            IdComprobante = @IdComprobante,
            ImgOc = @ImgOc,
            ImgPresupuesto = @ImgPresupuesto
        WHERE IdOc = @IdOc AND Fila = @Fila;
        """;
    private const string BuscarEdicionDetalleSql = """
        SELECT
            det.IdOc,
            cab.IdSolicitante,
            cab.IdResponsable,
            cab.IdMoneda,
            det.IdCliente,
            cli.NombreCliente,
            det.IdProyecto,
            pro.NombreProyecto,
            det.IdSite,
            COALESCE(NULLIF(sit.NombreSite, ''), NULLIF(imp.Site, ''), '') AS NombreSite,
            COALESCE(NULLIF(det.TipoTrabajo, ''), NULLIF(planilla.TipoTrabajo, ''), NULLIF(imp.TipoTrabajo, ''), '') AS TipoTrabajo,
            COALESCE(NULLIF(det.IdTarea, 0), planilla.IdTarea) AS IdTarea,
            COALESCE(NULLIF(tarea.ValorIni, ''), '') AS Tarea,
             det.Detalle,
             det.Cantidad,
             det.PrecioUnitario,
             COALESCE(det.Cantidad, 0) * COALESCE(det.PrecioUnitario, 0) AS SubtotalD,
             COALESCE(NULLIF(det.Ot, ''), NULLIF(planilla.Ot, ''), NULLIF(imp.Ot, ''), '') AS Ot,
            det.Fila,
            det.Correlativo,
            det.ImgOc,
            det.ImgPresupuesto,
            det.IdComprobante
        FROM dbo.DetOrdenCompra det
        INNER JOIN dbo.CabOrdenCompra cab ON cab.IdOc = det.IdOc
        LEFT JOIN dbo.Cliente cli ON cli.IdCliente = det.IdCliente
        LEFT JOIN dbo.Proyecto pro ON pro.IdProyecto = det.IdProyecto
        OUTER APPLY (
            SELECT TOP 1 site.NombreSite
            FROM dbo.Site site
            WHERE site.IdSite = det.IdSite
            ORDER BY CASE WHEN site.Correlativo = det.Correlativo THEN 0 ELSE 1 END, site.Correlativo
        ) sit
        OUTER APPLY (
            SELECT TOP 1
                p.Tipo_Trabajo AS TipoTrabajo,
                p.IdTarea,
                p.Ot
            FROM dbo.Planilla p
            -- IdOc de Planilla se almacena como texto. Compararlo directamente
            -- evita convertir toda la tabla por cada fila de DetOrdenCompra y
            -- permite aprovechar un índice por (IdOc, Fila, Correlativo).
            WHERE p.IdOc = CONVERT(varchar(50), det.IdOc)
              AND (p.Fila = det.Fila OR det.Fila IS NULL)
            ORDER BY CASE WHEN p.Fila = det.Fila THEN 0 ELSE 1 END, p.Correlativo DESC
        ) planilla
        OUTER APPLY (
            SELECT TOP 1 i.Site, i.TipoTrabajo, i.Ot
            FROM dbo.Importar i
            WHERE i.IdCliente = det.IdCliente
              AND i.IdProyecto = det.IdProyecto
              AND i.IdSite = det.IdSite
            ORDER BY CASE WHEN i.Correlativo = det.Correlativo THEN 0 ELSE 1 END, i.Correlativo
        ) imp
        LEFT JOIN dbo.Constante tarea ON tarea.Correlativo = COALESCE(NULLIF(det.IdTarea, 0), planilla.IdTarea)
            AND LOWER(tarea.Campo) IN ('tarea', 'tipo_tarea')
        WHERE det.IdOc = @IdOc
        ORDER BY det.Fila;
        """;
    private const string InsertarDetalleEdicionSql = """
        INSERT INTO dbo.DetOrdenCompra
            (IdOc, Fila, IdCliente, IdProyecto, IdSite, Correlativo, TipoTrabajo, IdTipoTrabajo, IdTarea, Ot,
             Detalle, Cantidad, PrecioUnitario, IdComprobante, ImgOc, ImgPresupuesto,
             UsuarioCreacion, FechaCreacion, HoraCreacion)
        SELECT
            @IdOc, @Fila, @IdCliente, @IdProyecto, @IdSite, @Correlativo, @TipoTrabajo,
            tipoTrabajo.IdTipoTrabajo, @IdTarea, @Ot,
            @Detalle, @Cantidad, @PrecioUnitario, COALESCE(@IdComprobante, @IdComprobanteCabecera), @ImgOc, @ImgPresupuesto,
            @UsuarioCreacion, @FechaCreacion, @HoraCreacion
        FROM (VALUES (1)) origen(Id)
        OUTER APPLY (
            SELECT TOP (1) constante.Correlativo AS IdTipoTrabajo
            FROM dbo.Constante constante
            WHERE constante.Campo = 'TIPO_TRABAJO'
              AND UPPER(LTRIM(RTRIM(constante.ValorIni))) = UPPER(LTRIM(RTRIM(@TipoTrabajo)))
            ORDER BY constante.Correlativo
        ) tipoTrabajo;
        """;
    private const string BuscarConsumoOcSql = """
        SELECT TOP (1)
            cab.IdOc,
            @Fila AS Fila,
            COALESCE(cab.Subtotal, 0) AS TotalOc,
            COALESCE((
                SELECT SUM(COALESCE(p.Subtotal, 0))
                FROM dbo.Planilla p
                WHERE TRY_CONVERT(INT, NULLIF(LTRIM(RTRIM(CONVERT(VARCHAR(50), p.IdOc))), '')) = @IdOc
                  AND (@Fila IS NULL OR p.Fila = @Fila)
                  AND p.Estado = 4
            ), 0) AS PagadoOc
        FROM dbo.CabOrdenCompra cab
        WHERE cab.IdOc = @IdOc
          AND (
              @Fila IS NULL
              OR EXISTS (
                  SELECT 1
                  FROM dbo.DetOrdenCompra det
                  WHERE det.IdOc = cab.IdOc
                    AND det.Fila = @Fila
              )
          );
        """;
    private readonly ISqlCommandFactory _sqlCommandFactory;
    private readonly IPlanillaService _planillaService;

    private sealed class PagoNuevoOrigen
    {
        public int IdProyecto { get; set; }
        public int IdCliente { get; set; }
        public string IdSite { get; set; } = string.Empty;
        public int CorreSite { get; set; }
        public int IdTarea { get; set; }
        public string? TipoTrabajo { get; set; }
        public string? Detalle { get; set; }
        public string? Ot { get; set; }
        public int IdAprobador1 { get; set; }
        public int IdSolicitante { get; set; }
        public int IdResponsable { get; set; }
        public int IdGestor { get; set; }
        public int IdValidador { get; set; }
        public int IdMoneda { get; set; }
        public int IdComprobante { get; set; }
        public int IdFormaPago { get; set; }
        public decimal SubtotalOc { get; set; }
        public string? SiteNombre { get; set; }
    }

    public OrdenCompraService(ISqlCommandFactory sqlCommandFactory, IPlanillaService planillaService)
    {
        _sqlCommandFactory = sqlCommandFactory;
        _planillaService = planillaService;
    }

    public async Task<IEnumerable<OrdenCompraCabeceraDto>> BuscarCabeceraAsync(
        OrdenCompraConsultaRequestDto request,
        CancellationToken cancellationToken = default)
    {
        await using var connection = _sqlCommandFactory.CreateConnection();
        var cabeceras = (await connection.QueryAsync<OrdenCompraCabeceraDto>(
            _sqlCommandFactory.Create(
                BuscarCabeceraSp,
                BuildConsultaParameters(request),
                CommandType.StoredProcedure,
                cancellationToken,
                commandTimeout: 120))).ToList();

        // Los tres niveles vigentes se definen en EmpleadoCjDetalle del
        // solicitante. No se deben reutilizar los nombres históricos que pueda
        // devolver sp_OrdenCompra_BuscarCabecera para los niveles 2 y 3.
        var idsOc = cabeceras
            .Select(item => item.IdOc)
            .Where(idOc => idOc > 0)
            .Distinct()
            .ToArray();

        if (idsOc.Length == 0)
            return cabeceras;

        var validadores = await connection.QueryAsync<ValidadorOcLookup>(
            new CommandDefinition(
                """
                SELECT cab.IdOc,
                       responsable.NombreEmpleado AS Validador,
                       segundo.NombreEmpleado AS Validador2,
                       tercero.NombreEmpleado AS Validador3
                FROM dbo.CabOrdenCompra cab
                LEFT JOIN dbo.Empleado solicitanteLegacy
                    ON solicitanteLegacy.IdEmpleado = cab.IdSolicitante
                   AND ISNULL(cab.IdWeb, 0) <> 1
                OUTER APPLY (
                    SELECT TOP 1
                        detalle.IdResponsableCj,
                        detalle.IdSegundoVacaciones,
                        detalle.IdTerceroVacaciones
                    FROM dbo.EmpleadoCjDetalle detalle
                    WHERE detalle.IdEmpleadoCj = CASE
                        WHEN ISNULL(cab.IdWeb, 0) = 1 THEN cab.IdSolicitante
                        ELSE solicitanteLegacy.IdEmpleadoCj
                    END
                ) detalleEmpleado
                LEFT JOIN dbo.EmpleadoCj responsable
                    ON responsable.IdEmpleado = detalleEmpleado.IdResponsableCj
                LEFT JOIN dbo.EmpleadoCj segundo
                    ON segundo.IdEmpleado = detalleEmpleado.IdSegundoVacaciones
                LEFT JOIN dbo.EmpleadoCj tercero
                    ON tercero.IdEmpleado = detalleEmpleado.IdTerceroVacaciones
                WHERE EXISTS (
                    SELECT 1
                    FROM STRING_SPLIT(@IdsOcCsv, ',') ids
                    WHERE TRY_CONVERT(int, LTRIM(RTRIM(ids.value))) = cab.IdOc
                );
                """,
                new { IdsOcCsv = string.Join(',', idsOc) },
                cancellationToken: cancellationToken,
                commandTimeout: 120));

        var validadoresPorOc = validadores.ToDictionary(item => item.IdOc);

        foreach (var cabecera in cabeceras)
        {
            if (!validadoresPorOc.TryGetValue(cabecera.IdOc, out var validadoresEmpleado))
                continue;

            if (!string.IsNullOrWhiteSpace(validadoresEmpleado.Validador))
                cabecera.Validador = validadoresEmpleado.Validador.Trim();
            if (!string.IsNullOrWhiteSpace(validadoresEmpleado.Validador2))
                cabecera.Validador2 = validadoresEmpleado.Validador2.Trim();
            if (!string.IsNullOrWhiteSpace(validadoresEmpleado.Validador3))
                cabecera.Validador3 = validadoresEmpleado.Validador3.Trim();
        }

        return cabeceras;
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

        // El store legado inserta el detalle, pero en algunas versiones no
        // materializa TipoTrabajo ni IdTarea recibidos en el JSON. Se persisten
        // explícitamente por posición para que la OC pueda reutilizar su filtro
        // operativo al consultarla o editarla.
        if (idOc > 0)
        {
            var posicion = 0;
            foreach (var item in request.Detalle)
            {
                posicion++;
                await connection.ExecuteAsync(
                    _sqlCommandFactory.Create(
                        ActualizarDatosOperativosInsertSql,
                        new
                        {
                            IdOc = idOc,
                            Posicion = posicion,
                            Correlativo = item.Correlativo,
                            TipoTrabajo = NullIfWhiteSpace(item.TipoTrabajo),
                            IdTarea = item.IdTarea,
                            Ot = NullIfWhiteSpace(item.Ot),
                             IdComprobante = item.IdComprobante,
                             IdComprobanteCabecera = request.IdComprobante,
                             UsuarioCreacion = NullIfWhiteSpace(request.UsuarioCreacion),
                             FechaCreacion = request.FechaCreacion.Date,
                             HoraCreacion = request.HoraCreacion,
                        },
                        CommandType.Text,
                        cancellationToken,
                        commandTimeout: 120));
            }
        }

        return idOc;
    }

    public async Task<OrdenCompraEdicionDto?> ObtenerEdicionAsync(
        int idOc,
        CancellationToken cancellationToken = default)
    {
        await using var connection = _sqlCommandFactory.CreateConnection();
        var cabecera = await connection.QuerySingleOrDefaultAsync<OrdenCompraEdicionDto>(
            _sqlCommandFactory.Create(
                BuscarEdicionCabeceraSql,
                new { IdOc = idOc },
                CommandType.Text,
                cancellationToken,
                commandTimeout: 120));

        if (cabecera is null)
        {
            return null;
        }

        var detalle = await connection.QueryAsync<OrdenCompraDetalleDto>(
            _sqlCommandFactory.Create(
                BuscarEdicionDetalleSql,
                new { IdOc = idOc },
                CommandType.Text,
                cancellationToken,
                commandTimeout: 120));
        cabecera.Detalle = detalle.ToList();
        return cabecera;
    }

    public async Task ActualizarAsync(
        OrdenCompraActualizarRequestDto request,
        CancellationToken cancellationToken = default)
    {
        await using var connection = _sqlCommandFactory.CreateConnection();
        await connection.OpenAsync(cancellationToken);
        await using var transaction = await connection.BeginTransactionAsync(cancellationToken);

        try
        {
            var subtotal = request.Detalle.Sum(item => item.Cantidad * item.PrecioUnitario);
            var igv = request.IdComprobante is 2 or 6 ? subtotal * 0.18m : 0m;
            var headerAffected = await connection.ExecuteAsync(new CommandDefinition(
                ActualizarCabeceraEdicionSql,
                new
                {
                    request.IdOc,
                    request.IdSolicitante,
                    request.IdResponsable,
                    FechaOrden = request.FechaOrden.Date,
                    UsuarioCreacion = NullIfWhiteSpace(request.UsuarioCreacion),
                    FechaCreacion = request.FechaCreacion.Date,
                    HoraCreacion = request.HoraCreacion,
                    Observacion = NullIfWhiteSpace(request.Observacion),
                    request.IdMoneda,
                    request.IdComprobante,
                    request.IdValidador,
                    request.IdGestor,
                    request.IdFormaPago,
                    request.DiasPago,
                    request.Peso,
                    Subtotal = subtotal,
                    Igv = igv,
                    Total = subtotal + igv,
                }, transaction, cancellationToken: cancellationToken));

            if (headerAffected == 0)
            {
                throw new InvalidOperationException("No se encontró la orden de compra a actualizar.");
            }

            var nextFila = await connection.ExecuteScalarAsync<int>(new CommandDefinition(
                "SELECT ISNULL(MAX(Fila), 0) FROM dbo.DetOrdenCompra WHERE IdOc = @IdOc;",
                new { request.IdOc }, transaction, cancellationToken: cancellationToken));

            foreach (var item in request.Detalle)
            {
                var parameters = new
                {
                    request.IdOc,
                    Fila = item.Fila.GetValueOrDefault(),
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
                    ImgOc = NullIfWhiteSpace(item.ImgOc),
                    ImgPresupuesto = NullIfWhiteSpace(item.ImgPresupuesto),
                    item.Peso,
                };

                if (item.Fila is > 0)
                {
                    var updated = await connection.ExecuteAsync(new CommandDefinition(
                        ActualizarDetalleEdicionSql, parameters, transaction, cancellationToken: cancellationToken));
                    if (updated == 0)
                    {
                        throw new InvalidOperationException($"No se encontró la posición {item.Fila} de la OC {request.IdOc}.");
                    }
                }
                else
                {
                    nextFila++;
                    var insertParameters = new
                    {
                        request.IdOc,
                        Fila = nextFila,
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
                        IdComprobanteCabecera = request.IdComprobante,
                        ImgOc = NullIfWhiteSpace(item.ImgOc),
                        ImgPresupuesto = NullIfWhiteSpace(item.ImgPresupuesto),
                        UsuarioCreacion = NullIfWhiteSpace(request.UsuarioCreacion),
                        FechaCreacion = request.FechaCreacion.Date,
                        HoraCreacion = request.HoraCreacion,
                        item.Peso,
                    };
                    await connection.ExecuteAsync(new CommandDefinition(
                        InsertarDetalleEdicionSql, insertParameters, transaction, cancellationToken: cancellationToken));
                }
            }

            await transaction.CommitAsync(cancellationToken);
        }
        catch
        {
            await transaction.RollbackAsync(CancellationToken.None);
            throw;
        }
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

    public async Task<OrdenCompraConsumoDto?> BuscarConsumoAsync(
        OrdenCompraRecibosRequestDto request,
        CancellationToken cancellationToken = default)
    {
        await using var connection = _sqlCommandFactory.CreateConnection();
        return await connection.QueryFirstOrDefaultAsync<OrdenCompraConsumoDto>(
            _sqlCommandFactory.Create(
                BuscarConsumoOcSql,
                new { request.IdOc, request.Fila },
                CommandType.Text,
                cancellationToken,
                commandTimeout: 120));
    }

    public async Task<OrdenCompraGenerarPagoNuevoResultDto> GenerarPagoNuevoAsync(
        OrdenCompraGenerarPagoNuevoRequestDto request,
        string usuarioAccion,
        CancellationToken cancellationToken = default)
    {
        await using var connection = _sqlCommandFactory.CreateConnection();
        var origen = await connection.QuerySingleOrDefaultAsync<PagoNuevoOrigen>(
            _sqlCommandFactory.Create(
                BuscarOrigenPagoNuevoSql,
                new { request.IdOc, request.Fila },
                CommandType.Text,
                cancellationToken,
                commandTimeout: 120));

        if (origen is null)
        {
            throw new InvalidOperationException("La OC no está aprobada o la fila seleccionada ya no existe.");
        }

        if (origen.IdTarea != request.IdTarea || origen.IdComprobante != request.IdComprobante)
        {
            throw new InvalidOperationException("Los datos operativos de la OC cambiaron. Actualice la grilla antes de registrar el pago.");
        }

        if (origen.IdSolicitante <= 0 || origen.IdResponsable <= 0 || origen.IdAprobador1 <= 0 || origen.IdMoneda <= 0 || origen.IdFormaPago <= 0)
        {
            throw new InvalidOperationException("La OC no tiene solicitante, responsable, primer aprobador o moneda válidos.");
        }

        var idBancoCta = await connection.QuerySingleOrDefaultAsync<int?>(
            _sqlCommandFactory.Create(
                BuscarBancoCuentaPagoNuevoSql,
                new
                {
                    IdResponsable = origen.IdResponsable,
                    Cuenta = request.Cuenta.Trim(),
                    CuentaInter = request.CuentaInter.Trim(),
                    NombreCta = request.NombreCta.Trim()
                },
                CommandType.Text,
                cancellationToken,
                commandTimeout: 120));

        if (idBancoCta is null or <= 0)
        {
            throw new InvalidOperationException("La cuenta seleccionada ya no corresponde al responsable de la OC. Actualice la grilla.");
        }

        var subtotalRegistrado = await connection.ExecuteScalarAsync<decimal>(
            _sqlCommandFactory.Create(
                BuscarSaldoPagoNuevoSql,
                new { request.IdOc, origen.IdProyecto, origen.IdSite, origen.CorreSite },
                CommandType.Text,
                cancellationToken,
                commandTimeout: 120));
        var saldoDisponible = Math.Max(0m, origen.SubtotalOc - subtotalRegistrado);
        if (request.Monto > saldoDisponible)
        {
            throw new InvalidOperationException("El monto solicitado supera el saldo disponible de la OC.");
        }

        var igv = origen.IdComprobante == 2 ? Math.Round(request.Monto * 0.18m, 2) : 0m;
        var planillaInsertResult = await _planillaService.InsertarPlanillaAsync(
            new PlanillaInsertRequestDto
            {
                IdProyecto = origen.IdProyecto,
                IdSite = origen.IdSite,
                CorreSite = origen.CorreSite,
                IdTarea = origen.IdTarea,
                Responsable = origen.IdResponsable.ToString(CultureInfo.InvariantCulture),
                IdCliente = origen.IdCliente,
                IdBancoCta = idBancoCta,
                CuentaNumero = request.Cuenta.Trim(),
                CuentaInter = request.CuentaInter.Trim(),
                NombreCta = request.NombreCta.Trim(),
                TipoPago = origen.IdFormaPago.ToString(CultureInfo.InvariantCulture),
                Monto = request.Monto,
                Subtotal = request.Monto,
                Igv = igv,
                Total = request.Monto + igv,
                IdRendicion = 1,
                Detalle = origen.Detalle ?? string.Empty,
                Solicitante = origen.IdSolicitante.ToString(CultureInfo.InvariantCulture),
                Gestor = origen.IdAprobador1.ToString(CultureInfo.InvariantCulture),
                Validador = origen.IdAprobador1.ToString(CultureInfo.InvariantCulture),
                Moneda = origen.IdMoneda.ToString(CultureInfo.InvariantCulture),
                Bien = "1",
                Comprobante = origen.IdComprobante.ToString(CultureInfo.InvariantCulture),
                TipoTrabajo = origen.TipoTrabajo ?? string.Empty,
                SiteNombre = origen.SiteNombre ?? origen.IdSite,
                Usuario = usuarioAccion,
                Ot = origen.Ot ?? string.Empty,
                TipoCambio = 3.80m,
                FechaEmision = DateTime.Today.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture)
            },
            cancellationToken);

        await connection.ExecuteAsync(
            _sqlCommandFactory.Create(
                AsociarPagoNuevoOcSql,
                new { request.IdOc, request.Fila, Correlativo = planillaInsertResult.CorrelativoGenerado },
                CommandType.Text,
                cancellationToken,
                commandTimeout: 120));

        return new OrdenCompraGenerarPagoNuevoResultDto
        {
            Correlativo = planillaInsertResult.CorrelativoGenerado,
            IdOc = request.IdOc,
            Fila = request.Fila,
            Subtotal = request.Monto,
            Igv = igv,
            Total = request.Monto + igv
        };
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

        // Los nombres del PDF deben reflejar solo aprobaciones ya registradas en
        // DetOrdenCompra; IdValidador/Validador son usuarios asignados, no evidencia
        // de que hayan aprobado un nivel.
        var aprobadores = await BuscarAprobadoresRegistradosPdfAsync(idOc, cancellationToken);
        cabecera.Validador = aprobadores.Validador1;
        cabecera.Validador2 = aprobadores.Validador2;
        cabecera.Validador3 = aprobadores.Validador3;

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

    private async Task<AprobadoresRegistradosPdf> BuscarAprobadoresRegistradosPdfAsync(
        int idOc,
        CancellationToken cancellationToken)
    {
        await using var connection = _sqlCommandFactory.CreateConnection();
        var aprobadores = await connection.QuerySingleOrDefaultAsync<AprobadoresRegistradosPdfLookup>(
            _sqlCommandFactory.Create(
                BuscarAprobadoresRegistradosPdfSql,
                new { IdOc = idOc },
                CommandType.Text,
                cancellationToken,
                commandTimeout: 60));

        if (aprobadores is null)
            return new AprobadoresRegistradosPdf();

        var ids = new[] { aprobadores.IdAprobador1, aprobadores.IdAprobador2, aprobadores.IdAprobador3 }
            .Where(id => id is > 0)
            .Select(id => id!.Value)
            .Distinct()
            .ToArray();
        if (ids.Length == 0)
            return new AprobadoresRegistradosPdf();

        var tablaEmpleado = aprobadores.IdWeb == 1 ? "dbo.EmpleadoCj" : "dbo.Empleado";
        var nombres = (await connection.QueryAsync<EmpleadoNombreLookup>(
            _sqlCommandFactory.Create(
                $"SELECT IdEmpleado, NombreEmpleado FROM {tablaEmpleado} WHERE IdEmpleado IN @Ids;",
                new { Ids = ids },
                CommandType.Text,
                cancellationToken,
                commandTimeout: 60)))
            .ToDictionary(item => item.IdEmpleado, item => item.NombreEmpleado?.Trim() ?? string.Empty);

        return new AprobadoresRegistradosPdf
        {
            Validador1 = aprobadores.IdAprobador1 is > 0 && nombres.TryGetValue(aprobadores.IdAprobador1.Value, out var nombre1) ? nombre1 : string.Empty,
            Validador2 = aprobadores.IdAprobador2 is > 0 && nombres.TryGetValue(aprobadores.IdAprobador2.Value, out var nombre2) ? nombre2 : string.Empty,
            Validador3 = aprobadores.IdAprobador3 is > 0 && nombres.TryGetValue(aprobadores.IdAprobador3.Value, out var nombre3) ? nombre3 : string.Empty,
        };
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

    private sealed class ValidadorOcLookup
    {
        public int IdOc { get; set; }
        public string? Validador { get; set; }
        public string? Validador2 { get; set; }
        public string? Validador3 { get; set; }
    }

    private sealed class AprobadoresRegistradosPdfLookup
    {
        public int IdWeb { get; set; }
        public int? IdAprobador1 { get; set; }
        public int? IdAprobador2 { get; set; }
        public int? IdAprobador3 { get; set; }
    }

    private sealed class EmpleadoNombreLookup
    {
        public int IdEmpleado { get; set; }
        public string? NombreEmpleado { get; set; }
    }

    private sealed class AprobadoresRegistradosPdf
    {
        public string Validador1 { get; set; } = string.Empty;
        public string Validador2 { get; set; } = string.Empty;
        public string Validador3 { get; set; } = string.Empty;
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


