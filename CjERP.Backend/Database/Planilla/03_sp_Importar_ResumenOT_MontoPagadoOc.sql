USE [JC_Db]
GO

SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE OR ALTER PROCEDURE dbo.sp_Importar_ResumenOT
    @Ot             VARCHAR(50) = NULL,
    @IdCliente      INT = NULL,
    @IdProyecto     INT = NULL,
    @IdSite         VARCHAR(11) = NULL,
    @Correlativo    INT = NULL,
    @TipoTrabajo    VARCHAR(150) = NULL,
    @IdOc           INT = NULL,
    @Fila           INT = NULL
AS
BEGIN
    SET NOCOUNT ON;

    SET @Ot = NULLIF(LTRIM(RTRIM(@Ot)), '');
    SET @TipoTrabajo = NULLIF(LTRIM(RTRIM(@TipoTrabajo)), '');
    IF @IdOc = 0 SET @IdOc = NULL;
    -- @Fila = 0 es una fila válida de la orden de compra; no convertirla a NULL.

    ;WITH ImportarAgrupado AS
    (
        SELECT
            a.IdCliente, a.IdProyecto, a.IdSite, a.Correlativo, a.TipoTrabajo, a.IdMoneda,
            MAX(a.Cliente) AS Cliente,
            MAX(a.Proyecto) AS Proyecto,
            MAX(a.Site) AS Site,
            MAX(moneda.ValorIni) AS Moneda,
            SUM(ISNULL(a.MontoOC, 0)) AS MontoOC,
            SUM(ISNULL(a.MontoLiq, 0)) AS MontoLiq,
            SUM(ISNULL(a.Monto_Bck, 0)) AS Monto_Bck,
            COUNT(*) AS CantidadRegistrosImportar
        FROM dbo.Importar a
        LEFT JOIN dbo.Constante moneda
            ON moneda.Campo = 'TIPO_MONEDA'
           AND moneda.Correlativo = a.IdMoneda
        WHERE a.IdEstado = 1
          AND (@Ot IS NULL OR LTRIM(RTRIM(a.Ot)) = @Ot)
          AND (@IdCliente IS NULL OR a.IdCliente = @IdCliente)
          AND (@IdProyecto IS NULL OR a.IdProyecto = @IdProyecto)
          AND (@IdSite IS NULL OR a.IdSite = @IdSite)
          AND (@Correlativo IS NULL OR a.Correlativo = @Correlativo)
          AND (@TipoTrabajo IS NULL OR a.TipoTrabajo = @TipoTrabajo)
        GROUP BY a.IdCliente, a.IdProyecto, a.IdSite, a.Correlativo, a.TipoTrabajo, a.IdMoneda
    )
    SELECT
        i.IdCliente, i.IdProyecto, i.IdSite, i.Correlativo, i.TipoTrabajo,
        i.Cliente, i.Proyecto, i.Site, i.IdMoneda, i.Moneda,
        ISNULL(i.MontoOC, 0) AS MontoOC,
        ISNULL(i.MontoLiq, 0) AS MontoLiq,
        ISNULL(i.Monto_Bck, 0) AS Monto_Bck,
        ISNULL(i.CantidadRegistrosImportar, 0) AS CantidadRegistrosImportar,
        CAST(ISNULL(rel.MontoPlanilla, 0) AS DECIMAL(18,2)) AS MontoPlanilla,
        -- Se conservan los importes nativos para que el cliente aplique el
        -- tipo de cambio vigente y muestre el detalle de la conversión.
        CAST(ISNULL(rel.MontoPlanillaSoles, 0) AS DECIMAL(18,2)) AS MontoPlanillaSoles,
        CAST(ISNULL(rel.MontoPlanillaDolares, 0) AS DECIMAL(18,2)) AS MontoPlanillaDolares,
        ISNULL(rel.CantidadRegistrosPlanilla, 0) AS CantidadRegistrosPlanilla,

        -- Pago acumulado de la OC solicitada: misma OC, misma fila y solo estado 4.
        CAST(ISNULL(pagosOc.MontoPagadoOc, 0) AS DECIMAL(18,2)) AS MontoPagadoOc,
        ISNULL(pagosOc.CantidadPagosOc, 0) AS CantidadPagosOc,

        detalleOc.IdOcOrdenCompra,
        detalleOc.FilaOrdenCompra,
        CAST(ISNULL(detalleOc.CantidadOrdenCompra, 0) AS DECIMAL(18,2)) AS CantidadOrdenCompra,
        CAST(ISNULL(detalleOc.PrecioUnitarioOrdenCompra, 0) AS DECIMAL(18,2)) AS PrecioUnitarioOrdenCompra,
        CAST(ISNULL(detalleOc.MontoDetalleOrdenCompra, 0) AS DECIMAL(18,2)) AS MontoDetalleOrdenCompra,
        CAST(ISNULL(detalleOc.SubtotalCabOrdenCompra, 0) AS DECIMAL(18,2)) AS SubtotalCabOrdenCompra,
        CAST(ISNULL(detalleOc.IgvCabOrdenCompra, 0) AS DECIMAL(18,2)) AS IgvCabOrdenCompra,
        CAST(ISNULL(detalleOc.TotalCabOrdenCompra, 0) AS DECIMAL(18,2)) AS TotalCabOrdenCompra,
        detalleOc.IdMonedaOrdenCompra,
        detalleOc.CodigoMonedaOrdenCompra,
        detalleOc.MonedaOrdenCompra,
        CAST(ISNULL(i.MontoOC, 0) - ISNULL(rel.MontoPlanilla, 0) AS DECIMAL(18,2)) AS SaldoMontoOC,
        CAST(ISNULL(i.MontoLiq, 0) - ISNULL(rel.MontoPlanilla, 0) AS DECIMAL(18,2)) AS SaldoMontoLiq,
        CAST(ISNULL(i.Monto_Bck, 0) - ISNULL(rel.MontoPlanilla, 0) AS DECIMAL(18,2)) AS SaldoMontoBck,
        CAST(CASE WHEN ISNULL(i.Monto_Bck, 0) = 0 THEN 0
                  ELSE ISNULL(rel.MontoPlanilla, 0) * 100.0 / i.Monto_Bck END AS DECIMAL(18,2)) AS PorcentajeMontoBck
    FROM (SELECT 1 AS Semilla) semilla
    LEFT JOIN ImportarAgrupado i ON 1 = 1
    OUTER APPLY
    (
        SELECT SUM(ISNULL(p.Subtotal, 0)) AS MontoPagadoOc, COUNT(*) AS CantidadPagosOc
        FROM dbo.Planilla p
        WHERE @IdOc IS NOT NULL
          AND @Fila IS NOT NULL
          AND LTRIM(RTRIM(CONVERT(VARCHAR(50), p.IdOc))) = CONVERT(VARCHAR(50), @IdOc)
          AND p.Fila = @Fila
          AND p.Estado = 4
    ) pagosOc
    OUTER APPLY
    (
        SELECT
            SUM(ISNULL(p.Subtotal, 0)) AS MontoPlanilla,
            SUM(CASE WHEN p.TipoMoneda = 1 THEN ISNULL(p.Subtotal, 0) ELSE 0 END) AS MontoPlanillaSoles,
            SUM(CASE WHEN p.TipoMoneda <> 1 THEN ISNULL(p.Subtotal, 0) ELSE 0 END) AS MontoPlanillaDolares,
            COUNT(*) AS CantidadRegistrosPlanilla
        FROM dbo.Planilla p
        WHERE p.IdCliente = i.IdCliente
          AND p.IdProyecto = i.IdProyecto
          AND p.IdSite = i.IdSite
          AND p.CorreSite = i.Correlativo
          AND (p.Tipo_Trabajo = i.TipoTrabajo OR (p.Tipo_Trabajo IS NULL AND i.TipoTrabajo IS NULL))
          AND p.Estado = 4
    ) rel
    OUTER APPLY
    (
        SELECT TOP (1)
            d.IdOc AS IdOcOrdenCompra, d.Fila AS FilaOrdenCompra,
            d.Cantidad AS CantidadOrdenCompra, d.PrecioUnitario AS PrecioUnitarioOrdenCompra,
            ISNULL(d.Cantidad, 0) * ISNULL(d.PrecioUnitario, 0) AS MontoDetalleOrdenCompra,
            c.Subtotal AS SubtotalCabOrdenCompra, c.Igv AS IgvCabOrdenCompra, c.Total AS TotalCabOrdenCompra,
            c.IdMoneda AS IdMonedaOrdenCompra, moneda.Correlativo AS CodigoMonedaOrdenCompra,
            moneda.ValorIni AS MonedaOrdenCompra
        FROM dbo.DetOrdenCompra d
        LEFT JOIN dbo.CabOrdenCompra c ON c.IdOc = d.IdOc
        LEFT JOIN dbo.Constante moneda ON moneda.Campo = 'TIPO_MONEDA' AND moneda.Correlativo = c.IdMoneda
        WHERE @IdOc IS NOT NULL AND @Fila IS NOT NULL
          AND d.IdOc = @IdOc AND d.Fila = @Fila
    ) detalleOc
    ORDER BY i.IdCliente, i.IdProyecto, i.IdSite, i.Correlativo, i.TipoTrabajo, i.IdMoneda;
END
GO
