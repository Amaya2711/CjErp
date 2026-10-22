-- sp_OrdenCompra_BuscarCabecera: DEFINICION VIGENTE (version final).
-- Consumido por OrdenCompraService.BuscarCabeceraAsync (GET /api/facturacionfinanciera/oc/cabecera).
--
-- Filtros opcionales: cliente, proyecto, site, correlativo, OT, tipo de trabajo, solicitante, responsable, IdOc,
-- estados (CSV) y rango de fecha de creacion (@FechaInicio/@FechaFin sobre CabOrdenCompra.FechaCreacion, inclusive).
--   * CASO 1: busqueda directa por IdOc.
--   * CASO 2: consulta general. El detalle, solicitante y responsable se resuelven con OUTER APPLY ... TOP (1) por OC
--     (antes: CTE con ROW_NUMBER() sobre toda DetOrdenCompra/Empleado, ~36 s para 195 filas) y OPTION (RECOMPILE)
--     por los filtros opcionales.
-- @IdSolicitante es un IdEmpleadoCj (lo entrega sp_ListarSolicitante): se compara contra el solicitante ya resuelto
-- (SolCj.IdEmpleado) y no contra CabOrdenCompra.IdSolicitante, que en OC antiguas (IdWeb <> 1) es un IdEmpleado legacy.
-- Idempotente (CREATE OR ALTER). PV: el rendimiento depende de indices en DetOrdenCompra(IdOc),
-- Empleado(IdEmpleado) y CabOrdenCompra(FechaCreacion); verificar en la BD.

SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

CREATE OR ALTER PROCEDURE [dbo].[sp_OrdenCompra_BuscarCabecera]
(
    @IdCliente      INT = NULL,
    @IdProyecto     INT = NULL,
    @IdSite         VARCHAR(50) = NULL,
    @Correlativo    INT = NULL,
    @Ot             VARCHAR(50) = NULL,
    @TipoTrabajo    VARCHAR(50) = NULL,
    @IdSolicitante  INT = NULL,
    @IdResponsable  INT = NULL,
    @IdOc           VARCHAR(50) = NULL,
    @Estados        VARCHAR(MAX) = NULL,  -- Ej.: '1,2,6'
    @FechaInicio    DATE = NULL,          -- Filtra CabOrdenCompra.FechaCreacion
    @FechaFin       DATE = NULL
)
AS
BEGIN
    SET NOCOUNT ON;

    /* NORMALIZACIÓN */
    SET @IdCliente = NULLIF(@IdCliente, 0);
    SET @IdProyecto = NULLIF(@IdProyecto, 0);
    SET @Correlativo = NULLIF(@Correlativo, 0);
    SET @IdSolicitante = NULLIF(@IdSolicitante, 0);
    SET @IdResponsable = NULLIF(@IdResponsable, 0);

    SET @IdSite = NULLIF(LTRIM(RTRIM(@IdSite)), '');
    SET @Ot = NULLIF(LTRIM(RTRIM(@Ot)), '');
    SET @TipoTrabajo = NULLIF(LTRIM(RTRIM(@TipoTrabajo)), '');
    SET @IdOc = NULLIF(LTRIM(RTRIM(@IdOc)), '');
    SET @Estados = NULLIF(LTRIM(RTRIM(@Estados)), '');

    IF @FechaInicio IS NOT NULL AND @FechaFin IS NOT NULL AND @FechaInicio > @FechaFin
        THROW 50001, 'FechaInicio no puede ser mayor que FechaFin.', 1;

    /* Estados: valores numéricos separados por comas; ignorar espacios; validar entrada. */
    DECLARE @FiltroEstados TABLE (IdEstado INT NOT NULL PRIMARY KEY);
    IF @Estados IS NOT NULL
    BEGIN
        IF EXISTS (
            SELECT 1
            FROM STRING_SPLIT(@Estados, ',') AS s
            WHERE TRY_CONVERT(INT, LTRIM(RTRIM(s.value))) IS NULL
        )
            THROW 50002, 'El parametro Estados debe contener solo numeros enteros separados por comas.', 1;

        INSERT INTO @FiltroEstados (IdEstado)
        SELECT DISTINCT TRY_CONVERT(INT, LTRIM(RTRIM(s.value)))
        FROM STRING_SPLIT(@Estados, ',') AS s
        WHERE TRY_CONVERT(INT, LTRIM(RTRIM(s.value))) IS NOT NULL;
    END;

    /* ID OC NUMÉRICO */
    DECLARE @IdOcNumerico INT = NULL;
    IF @IdOc IS NOT NULL
    BEGIN
        SET @IdOcNumerico = TRY_CONVERT(INT, @IdOc);
        IF @IdOcNumerico IS NULL SET @IdOcNumerico = -1;
    END;

    /* CASO 1: BÚSQUEDA DIRECTA POR ID OC (sin cambios) */
    IF @IdOcNumerico IS NOT NULL
    BEGIN
        SELECT
            a.IdOc,
            a.IdWeb,
            a.IdSolicitante,
            SolCj.NombreEmpleado AS Solicitante,
            a.IdResponsable,
            Resp.NombreEmpleado AS Responsable,
            a.Subtotal,
            a.Igv,
            a.Total,
            Mon.ValorIni AS Moneda,
            Comp.ValorIni AS Comprobante,
            a.IdAprobador1,
            a.IdAprobador2,
            a.IdAprobador3,
            Apr1Cj.NombreEmpleado AS Nombre1,
            Apr2Cj.NombreEmpleado AS Nombre2,
            Apr3Cj.NombreEmpleado AS Nombre3,
            ecd.IdResponsableCj AS IdValidador,
            CASE
                WHEN a.IdEstado = 6 THEN Est.ValorIni
                WHEN ISNULL(a.IdAprobador3, 0) > 0 THEN 'Aprobado'
                WHEN ISNULL(a.IdAprobador2, 0) > 0 THEN 'En 3era Aprob.'
                WHEN ISNULL(a.IdAprobador1, 0) > 0 THEN 'En 2da Aprob.'
                WHEN ISNULL(a.IdGestor, 0) > 0 THEN 'en 1er Aprob.'
                ELSE 'En PreAprobacion'
            END AS Estado,
            Resp.NroDocumento,
            a.FechaCreacion AS Fecha,
            a.IdEstado,
            Cli.NombreCliente,
            Pro.NombreProyecto,
            Det.IdSite,
            SiteOc.NombreSite,
            Val1.NombreEmpleado AS Validador,
            Val2.NombreEmpleado AS Validador2,
            Val3.NombreEmpleado AS Validador3,
            ecd.IdResponsableCj,
            ecd.IdSegundoVacaciones,
            ecd.IdTerceroVacaciones
        FROM dbo.CabOrdenCompra a

        OUTER APPLY (
            SELECT TOP (1)
                d.IdOc, d.IdCliente, d.IdProyecto, d.IdSite,
                d.Correlativo, d.Ot, d.TipoTrabajo
            FROM dbo.DetOrdenCompra d
            WHERE d.IdOc = a.IdOc
              AND (@IdCliente IS NULL OR d.IdCliente = @IdCliente)
              AND (@IdProyecto IS NULL OR d.IdProyecto = @IdProyecto)
              AND (@IdSite IS NULL OR d.IdSite = @IdSite)
              AND (@Correlativo IS NULL OR d.Correlativo = @Correlativo)
              AND (@Ot IS NULL OR d.Ot = @Ot)
              AND (@TipoTrabajo IS NULL OR d.TipoTrabajo = @TipoTrabajo)
            ORDER BY d.Correlativo, d.IdCliente, d.IdProyecto, d.IdSite
        ) Det

        OUTER APPLY (
            SELECT TOP (1)
                e.IdEmpleado, e.IdEmpleadoCj, e.IdCargo,
                e.NombreEmpleado, e.Telefono
            FROM dbo.Empleado e
            WHERE ISNULL(a.IdWeb, 0) <> 1
              AND e.IdEmpleado = a.IdSolicitante
              AND e.IdCargo IN (10, 11, 83)
            ORDER BY CASE
                WHEN e.IdCargo = 10 THEN 1
                WHEN e.IdCargo = 11 THEN 2
                WHEN e.IdCargo = 83 THEN 3
                ELSE 99 END,
                e.IdEmpleadoCj
        ) SolLegacy

        LEFT JOIN dbo.EmpleadoCj SolCj
          ON SolCj.IdEmpleado = CASE
                WHEN ISNULL(a.IdWeb, 0) = 1 THEN a.IdSolicitante
                ELSE SolLegacy.IdEmpleadoCj END
        LEFT JOIN dbo.EmpleadoCjDetalle ecd ON ecd.IdEmpleadoCj = SolCj.IdEmpleado

        OUTER APPLY (
            SELECT TOP (1)
                e.IdEmpleado, e.IdEmpleadoCj, e.IdCargo,
                e.NombreEmpleado, e.NroDocumento
            FROM dbo.Empleado e
            WHERE e.IdEmpleado = a.IdResponsable
            ORDER BY CASE
                WHEN e.IdCargo = 10 THEN 1
                WHEN e.IdCargo = 11 THEN 2
                WHEN e.IdCargo = 83 THEN 3
                ELSE 99 END,
                e.IdCargo, e.IdEmpleadoCj
        ) Resp

        LEFT JOIN dbo.Constante Mon
          ON Mon.Correlativo = a.IdMoneda AND Mon.Campo = 'tipo_moneda'
        LEFT JOIN dbo.Constante Comp
          ON Comp.Correlativo = a.IdComprobante AND Comp.Campo = 'tipo_comprobante'
        LEFT JOIN dbo.Constante Est
          ON Est.Correlativo = a.IdEstado AND Est.Campo = 'estado_log'
        LEFT JOIN dbo.Cliente Cli ON Cli.IdCliente = Det.IdCliente
        LEFT JOIN dbo.Proyecto Pro ON Pro.IdProyecto = Det.IdProyecto
        LEFT JOIN dbo.Site SiteOc
          ON SiteOc.IdSite = Det.IdSite AND SiteOc.Correlativo = Det.Correlativo
        LEFT JOIN dbo.EmpleadoCj Val1 ON Val1.IdEmpleado = ecd.IdResponsableCj
        LEFT JOIN dbo.EmpleadoCj Val2 ON Val2.IdEmpleado = ecd.IdSegundoVacaciones
        LEFT JOIN dbo.EmpleadoCj Val3 ON Val3.IdEmpleado = ecd.IdTerceroVacaciones
        LEFT JOIN dbo.EmpleadoCj Apr1Cj ON Apr1Cj.IdEmpleado = a.IdAprobador1
        LEFT JOIN dbo.EmpleadoCj Apr2Cj ON Apr2Cj.IdEmpleado = a.IdAprobador2
        LEFT JOIN dbo.EmpleadoCj Apr3Cj ON Apr3Cj.IdEmpleado = a.IdAprobador3
        WHERE a.IdOc = @IdOcNumerico
          AND (@IdSolicitante IS NULL OR SolCj.IdEmpleado = @IdSolicitante)
          AND (@IdResponsable IS NULL OR a.IdResponsable = @IdResponsable)
          AND (@Estados IS NULL OR EXISTS
              (SELECT 1 FROM @FiltroEstados f WHERE f.IdEstado = a.IdEstado))
          AND (@FechaInicio IS NULL OR a.FechaCreacion >= @FechaInicio)
          AND (@FechaFin IS NULL OR a.FechaCreacion < DATEADD(DAY, 1, @FechaFin))
          AND (
              (@IdCliente IS NULL AND @IdProyecto IS NULL AND @IdSite IS NULL
               AND @Correlativo IS NULL AND @Ot IS NULL AND @TipoTrabajo IS NULL)
              OR Det.IdOc IS NOT NULL
          );
        RETURN;
    END;

    /* CASO 2: CONSULTA GENERAL (OUTER APPLY por OC en lugar de CTE con ROW_NUMBER sobre toda la tabla) */
    SELECT
        a.IdOc,
        a.IdWeb,
        a.IdSolicitante,
        SolCj.NombreEmpleado AS Solicitante,
        a.IdResponsable,
        Resp.NombreEmpleado AS Responsable,
        a.Subtotal,
        a.Igv,
        a.Total,
        Mon.ValorIni AS Moneda,
        Comp.ValorIni AS Comprobante,
        a.IdAprobador1,
        a.IdAprobador2,
        a.IdAprobador3,
        Apr1Cj.NombreEmpleado AS Nombre1,
        Apr2Cj.NombreEmpleado AS Nombre2,
        Apr3Cj.NombreEmpleado AS Nombre3,
        ecd.IdResponsableCj AS IdValidador,
        CASE
            WHEN a.IdEstado = 6 THEN Est.ValorIni
            WHEN ISNULL(a.IdAprobador3, 0) > 0 THEN 'Aprobado'
            WHEN ISNULL(a.IdAprobador2, 0) > 0 THEN 'En 3era Aprob.'
            WHEN ISNULL(a.IdAprobador1, 0) > 0 THEN 'En 2da Aprob.'
            WHEN ISNULL(a.IdGestor, 0) > 0 THEN 'en 1er Aprob.'
            ELSE 'En PreAprobacion'
        END AS Estado,
        Resp.NroDocumento,
        a.FechaCreacion AS Fecha,
        a.IdEstado,
        Cli.NombreCliente,
        Pro.NombreProyecto,
        Det.IdSite,
        SiteOc.NombreSite,
        Val1.NombreEmpleado AS Validador,
        Val2.NombreEmpleado AS Validador2,
        Val3.NombreEmpleado AS Validador3,
        ecd.IdResponsableCj,
        ecd.IdSegundoVacaciones,
        ecd.IdTerceroVacaciones
    FROM dbo.CabOrdenCompra a

    OUTER APPLY (
        SELECT TOP (1)
            d.IdOc, d.IdCliente, d.IdProyecto, d.IdSite,
            d.Correlativo, d.Ot, d.TipoTrabajo
        FROM dbo.DetOrdenCompra d
        WHERE d.IdOc = a.IdOc
          AND (@IdCliente IS NULL OR d.IdCliente = @IdCliente)
          AND (@IdProyecto IS NULL OR d.IdProyecto = @IdProyecto)
          AND (@IdSite IS NULL OR d.IdSite = @IdSite)
          AND (@Correlativo IS NULL OR d.Correlativo = @Correlativo)
          AND (@Ot IS NULL OR d.Ot = @Ot)
          AND (@TipoTrabajo IS NULL OR d.TipoTrabajo = @TipoTrabajo)
        ORDER BY d.Correlativo, d.IdCliente, d.IdProyecto, d.IdSite
    ) Det

    OUTER APPLY (
        SELECT TOP (1)
            e.IdEmpleado, e.IdEmpleadoCj, e.IdCargo,
            e.NombreEmpleado, e.Telefono
        FROM dbo.Empleado e
        WHERE ISNULL(a.IdWeb, 0) <> 1
          AND e.IdEmpleado = a.IdSolicitante
          AND e.IdCargo IN (10, 11, 83)
        ORDER BY CASE
            WHEN e.IdCargo = 10 THEN 1
            WHEN e.IdCargo = 11 THEN 2
            WHEN e.IdCargo = 83 THEN 3
            ELSE 99 END,
            e.IdEmpleadoCj
    ) SolLegacy

    LEFT JOIN dbo.EmpleadoCj SolCj
      ON SolCj.IdEmpleado = CASE
          WHEN ISNULL(a.IdWeb, 0) = 1 THEN a.IdSolicitante
          ELSE SolLegacy.IdEmpleadoCj END
    LEFT JOIN dbo.EmpleadoCjDetalle ecd ON ecd.IdEmpleadoCj = SolCj.IdEmpleado

    OUTER APPLY (
        SELECT TOP (1)
            e.IdEmpleado, e.IdEmpleadoCj, e.IdCargo,
            e.NombreEmpleado, e.NroDocumento
        FROM dbo.Empleado e
        WHERE e.IdEmpleado = a.IdResponsable
        ORDER BY CASE
            WHEN e.IdCargo = 10 THEN 1
            WHEN e.IdCargo = 11 THEN 2
            WHEN e.IdCargo = 83 THEN 3
            ELSE 99 END,
            e.IdCargo, e.IdEmpleadoCj
    ) Resp

    LEFT JOIN dbo.Constante Mon
      ON Mon.Correlativo = a.IdMoneda AND Mon.Campo = 'tipo_moneda'
    LEFT JOIN dbo.Constante Comp
      ON Comp.Correlativo = a.IdComprobante AND Comp.Campo = 'tipo_comprobante'
    LEFT JOIN dbo.Constante Est
      ON Est.Correlativo = a.IdEstado AND Est.Campo = 'estado_log'
    LEFT JOIN dbo.Cliente Cli ON Cli.IdCliente = Det.IdCliente
    LEFT JOIN dbo.Proyecto Pro ON Pro.IdProyecto = Det.IdProyecto
    LEFT JOIN dbo.Site SiteOc
      ON SiteOc.IdSite = Det.IdSite AND SiteOc.Correlativo = Det.Correlativo
    LEFT JOIN dbo.EmpleadoCj Val1 ON Val1.IdEmpleado = ecd.IdResponsableCj
    LEFT JOIN dbo.EmpleadoCj Val2 ON Val2.IdEmpleado = ecd.IdSegundoVacaciones
    LEFT JOIN dbo.EmpleadoCj Val3 ON Val3.IdEmpleado = ecd.IdTerceroVacaciones
    LEFT JOIN dbo.EmpleadoCj Apr1Cj ON Apr1Cj.IdEmpleado = a.IdAprobador1
    LEFT JOIN dbo.EmpleadoCj Apr2Cj ON Apr2Cj.IdEmpleado = a.IdAprobador2
    LEFT JOIN dbo.EmpleadoCj Apr3Cj ON Apr3Cj.IdEmpleado = a.IdAprobador3
    WHERE a.IdOc > 0
      AND (@IdSolicitante IS NULL OR SolCj.IdEmpleado = @IdSolicitante)
      AND (@IdResponsable IS NULL OR a.IdResponsable = @IdResponsable)
      AND (@Estados IS NULL OR EXISTS
          (SELECT 1 FROM @FiltroEstados f WHERE f.IdEstado = a.IdEstado))
      AND (@FechaInicio IS NULL OR a.FechaCreacion >= @FechaInicio)
      AND (@FechaFin IS NULL OR a.FechaCreacion < DATEADD(DAY, 1, @FechaFin))
      AND (
          (@IdCliente IS NULL AND @IdProyecto IS NULL AND @IdSite IS NULL
           AND @Correlativo IS NULL AND @Ot IS NULL AND @TipoTrabajo IS NULL)
          OR Det.IdOc IS NOT NULL
      )
    ORDER BY a.IdOc
    OPTION (RECOMPILE); -- los filtros son opcionales (patron "catch-all"): un plan por combinacion evita el plan generico lento
END
GO
