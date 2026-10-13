/*
  sp_Planilla_ConsultarPorOT — reporte ejecutivo por responsable (/reportes/gerencial/responsable).

  Cambio respecto a la versión anterior (única diferencia funcional):
    - Se admite consultar SIN responsable cuando se indica @IdCliente (ámbito operativo:
      cliente, y opcionalmente proyecto/site). En ese caso no se filtra por responsable en la OC ni en la planilla.
    - Con @IdResponsables o @NroDocumento el comportamiento es el mismo de antes.
    - Mensajes 51001 y 51002 ajustados al nuevo criterio. Columnas de salida sin cambios.

  Idempotente (CREATE OR ALTER). Basado en la definición vigente en la BD (sp_helptext).
*/
CREATE OR ALTER PROCEDURE [dbo].[sp_Planilla_ConsultarPorOT]
(
    @IdResponsables VARCHAR(MAX) = NULL,
    @NroDocumento   VARCHAR(50)  = NULL,
    @IdCliente      INT          = NULL,
    @IdProyecto     INT          = NULL,
    @IdSite         VARCHAR(50)  = NULL,
    @CorreSite      INT          = NULL,
    @TipoTrabajo    VARCHAR(100) = NULL,
    @Ot             VARCHAR(50)  = NULL,
    @Fila           INT          = NULL,
    @IdOc           BIGINT       = NULL
)
AS
BEGIN
    SET NOCOUNT ON;

    ------------------------------------------------------------
    -- 1. NORMALIZACION DE PARAMETROS
    ------------------------------------------------------------
    SET @IdResponsables = NULLIF(LTRIM(RTRIM(@IdResponsables)), '');
    SET @NroDocumento   = NULLIF(LTRIM(RTRIM(@NroDocumento)), '');
    SET @IdSite         = NULLIF(LTRIM(RTRIM(@IdSite)), '');
    SET @TipoTrabajo    = NULLIF(LTRIM(RTRIM(@TipoTrabajo)), '');
    SET @Ot             = NULLIF(LTRIM(RTRIM(@Ot)), '');

    ------------------------------------------------------------
    -- 2. VALIDACION DE BUSQUEDA OBLIGATORIA
    --    Responsables, documento o cliente (ambito operativo).
    ------------------------------------------------------------
    IF @IdResponsables IS NULL
       AND @NroDocumento IS NULL
       AND @IdCliente IS NULL
    BEGIN
        THROW 51001,
            'Debe ingresar IdResponsables, NroDocumento o IdCliente.',
            1;
    END;

    IF @IdResponsables IS NOT NULL
       AND @NroDocumento IS NOT NULL
    BEGIN
        THROW 51002,
            'Debe utilizar solo un criterio de responsable: IdResponsables o NroDocumento.',
            1;
    END;

    -- 1 = filtrar por responsable; 0 = consulta por ambito operativo sin responsable.
    DECLARE @FiltrarResponsable BIT =
        CASE WHEN @IdResponsables IS NOT NULL OR @NroDocumento IS NOT NULL THEN 1 ELSE 0 END;

    ------------------------------------------------------------
    -- 3. PROCESAR LISTA DE RESPONSABLES
    ------------------------------------------------------------
    CREATE TABLE #Responsables
    (
        IdResponsable BIGINT NOT NULL PRIMARY KEY
    );

    IF @IdResponsables IS NOT NULL
    BEGIN
        IF EXISTS
        (
            SELECT 1
            FROM STRING_SPLIT(@IdResponsables, ',')
            WHERE
                NULLIF(LTRIM(RTRIM(value)), '') IS NULL
                OR TRY_CONVERT(BIGINT, LTRIM(RTRIM(value))) IS NULL
        )
        BEGIN
            THROW 51003,
                'La lista de responsables contiene valores invalidos.',
                1;
        END;

        INSERT INTO #Responsables (IdResponsable)
        SELECT DISTINCT TRY_CONVERT(BIGINT, LTRIM(RTRIM(value)))
        FROM STRING_SPLIT(@IdResponsables, ',');
    END;

    ------------------------------------------------------------
    -- 4. RESOLVER RESPONSABLES POR DOCUMENTO
    --    SOLO SE UTILIZA dbo.Empleado.
    --    SI UN DOCUMENTO TIENE VARIOS IDEMPLEADO, SE INCLUYEN TODOS.
    --    IDWEB NO INTERVIENE.
    ------------------------------------------------------------
    IF @NroDocumento IS NOT NULL
    BEGIN
        INSERT INTO #Responsables (IdResponsable)
        SELECT DISTINCT e.IdEmpleado
        FROM dbo.Empleado e
        WHERE
            e.NroDocumento = @NroDocumento
            AND e.IdEmpleado IS NOT NULL;

        IF NOT EXISTS (SELECT 1 FROM #Responsables)
        BEGIN
            THROW 51004,
                'No se encontraron responsables en Empleado para el documento indicado.',
                1;
        END;
    END;

    ------------------------------------------------------------
    -- 5. OBTENER DETALLES DE ORDEN DE COMPRA
    --    RESPONSABLE: CabOrdenCompra.IdResponsable = Empleado.IdEmpleado
    --    NO SE UTILIZA EmpleadoCj.
    ------------------------------------------------------------
    ;WITH DetalleOC AS
    (
        SELECT
            d.IdOc,
            d.FechaCreacion,

            d.IdCliente,
            d.IdProyecto,

            d.IdSite,
            d.Correlativo AS CorreSite,

            d.TipoTrabajo,
            d.Ot,
            d.Fila,

            d.Cantidad,
            d.PrecioUnitario,

            CAST(d.Cantidad * d.PrecioUnitario AS DECIMAL(19,4)) AS SubtotalOC,

            d.Detalle AS DetalleOC,

            ----------------------------------------------------
            -- CABECERA OC
            ----------------------------------------------------

            b.IdWeb AS IdWebOC,

            b.IdResponsable AS IdResponsableOC,
            empOC.NombreEmpleado AS NombreResponsableOC,
            empOC.NroDocumento AS NroDocumentoResponsableOC,

            b.IdSolicitante,
            b.IdMoneda,

            ----------------------------------------------------
            -- INDICADOR DE EXISTENCIA
            ----------------------------------------------------

            CAST(1 AS INT) AS ExisteOC

        FROM dbo.DetOrdenCompra d

        LEFT JOIN dbo.CabOrdenCompra b
            ON b.IdOc = d.IdOc

        -- RESPONSABLE: SIEMPRE TABLA EMPLEADO
        LEFT JOIN dbo.Empleado empOC
            ON empOC.IdEmpleado = b.IdResponsable

        -- FILTROS
        WHERE
            (
                @FiltrarResponsable = 0
                OR EXISTS
                (
                    SELECT 1
                    FROM #Responsables r
                    WHERE r.IdResponsable = b.IdResponsable
                )
            )
            AND (@IdCliente   IS NULL OR d.IdCliente   = @IdCliente)
            AND (@IdProyecto  IS NULL OR d.IdProyecto  = @IdProyecto)
            AND (@IdSite      IS NULL OR d.IdSite      = @IdSite)
            AND (@CorreSite   IS NULL OR d.Correlativo = @CorreSite)
            AND (@TipoTrabajo IS NULL OR d.TipoTrabajo = @TipoTrabajo)
            AND (@Ot          IS NULL OR d.Ot          = @Ot)
            AND (@Fila        IS NULL OR d.Fila        = @Fila)
            AND (@IdOc        IS NULL OR d.IdOc        = @IdOc)
    ),

    ------------------------------------------------------------
    -- 6. OBTENER PLANILLAS PAGADAS
    --    SOLO ESTADO = 4
    --    RESPONSABLE: Planilla.IdResponsable = Empleado.IdEmpleado
    --    NO SE UTILIZA EmpleadoCj.
    ------------------------------------------------------------
    Pagos AS
    (
        SELECT
            ----------------------------------------------------
            -- IDENTIFICADOR DEL PAGO
            ----------------------------------------------------

            p.Correlativo AS CorrelativoPago,

            ----------------------------------------------------
            -- DATOS DE REFERENCIA
            ----------------------------------------------------

            p.IdOc,
            p.IdCliente,
            p.IdProyecto,
            p.IdSite,
            p.CorreSite,

            p.Tipo_Trabajo AS TipoTrabajo,

            p.Ot,
            p.Fila,

            ----------------------------------------------------
            -- RESPONSABLE DE PLANILLA
            ----------------------------------------------------

            p.IdWeb AS IdWebPlanilla,

            p.IdResponsable AS IdResponsablePlanilla,
            empP.NombreEmpleado AS NombreResponsablePlanilla,
            empP.NroDocumento AS NroDocumentoResponsablePlanilla,

            ----------------------------------------------------
            -- DATOS DEL PAGO
            ----------------------------------------------------

            p.FechaDeposito,
            p.Serie,
            p.NroOperacion,

            p.Estado AS EstadoPlanilla,

            ----------------------------------------------------
            -- INDICADOR DE EXISTENCIA
            ----------------------------------------------------

            CAST(1 AS INT) AS ExistePago

        FROM dbo.Planilla p

        -- RESPONSABLE: SIEMPRE TABLA EMPLEADO
        LEFT JOIN dbo.Empleado empP
            ON empP.IdEmpleado = p.IdResponsable

        -- FILTROS
        WHERE
            p.Estado = 4
            AND
            (
                @FiltrarResponsable = 0
                OR EXISTS
                (
                    SELECT 1
                    FROM #Responsables r
                    WHERE r.IdResponsable = p.IdResponsable
                )
            )
            AND (@IdCliente   IS NULL OR p.IdCliente    = @IdCliente)
            AND (@IdProyecto  IS NULL OR p.IdProyecto   = @IdProyecto)
            AND (@IdSite      IS NULL OR p.IdSite       = @IdSite)
            AND (@CorreSite   IS NULL OR p.CorreSite    = @CorreSite)
            AND (@TipoTrabajo IS NULL OR p.Tipo_Trabajo = @TipoTrabajo)
            AND (@Ot          IS NULL OR p.Ot           = @Ot)
            AND (@Fila        IS NULL OR p.Fila         = @Fila)
            AND (@IdOc        IS NULL OR p.IdOc         = @IdOc)
    ),

    ------------------------------------------------------------
    -- 7. CONSOLIDAR OC Y PLANILLA
    --    RELACION PRINCIPAL: IdOc + Fila (OT NO PARTICIPA).
    --    FULL OUTER JOIN: CONSERVA REGISTROS SIN COINCIDENCIA.
    ------------------------------------------------------------
    Consolidado AS
    (
        SELECT
            ----------------------------------------------------
            -- CLASIFICACION
            ----------------------------------------------------

            CASE
                WHEN d.ExisteOC = 1
                     AND p.ExistePago = 1
                    THEN 'OC CON PAGO'

                WHEN d.ExisteOC = 1
                    THEN 'OC SIN PAGO'

                WHEN p.ExistePago = 1
                    THEN 'PLANILLA SIN OC ASOCIADA'

                ELSE 'SIN CLASIFICAR'
            END AS TipoRegistro,

            ----------------------------------------------------
            -- IDENTIFICADORES
            ----------------------------------------------------

            COALESCE(d.IdOc, p.IdOc) AS IdOc,

            d.IdOc AS IdOcDetalleOC,
            p.IdOc AS IdOcPlanilla,

            COALESCE(d.Fila, p.Fila) AS Fila,

            d.Fila AS FilaOC,
            p.Fila AS FilaPlanilla,

            ----------------------------------------------------
            -- CLIENTE
            ----------------------------------------------------

            COALESCE(d.IdCliente, p.IdCliente) AS IdCliente,

            d.IdCliente AS IdClienteOC,
            p.IdCliente AS IdClientePlanilla,

            ----------------------------------------------------
            -- PROYECTO
            ----------------------------------------------------

            COALESCE(d.IdProyecto, p.IdProyecto) AS IdProyecto,

            d.IdProyecto AS IdProyectoOC,
            p.IdProyecto AS IdProyectoPlanilla,

            ----------------------------------------------------
            -- SITE
            ----------------------------------------------------

            COALESCE(d.IdSite, p.IdSite) AS IdSite,

            d.IdSite AS IdSiteOC,
            p.IdSite AS IdSitePlanilla,

            COALESCE(d.CorreSite, p.CorreSite) AS CorreSite,

            d.CorreSite AS CorreSiteOC,
            p.CorreSite AS CorreSitePlanilla,

            ----------------------------------------------------
            -- TIPO DE TRABAJO
            ----------------------------------------------------

            COALESCE(d.TipoTrabajo, p.TipoTrabajo) AS TipoTrabajo,

            d.TipoTrabajo AS TipoTrabajoOC,
            p.TipoTrabajo AS TipoTrabajoPlanilla,

            ----------------------------------------------------
            -- OT: SOLO REFERENCIAL
            ----------------------------------------------------

            COALESCE(d.Ot, p.Ot) AS Ot,

            d.Ot AS OtOC,
            p.Ot AS OtPlanilla,

            ----------------------------------------------------
            -- ORDEN DE COMPRA
            ----------------------------------------------------

            d.FechaCreacion AS FechaOC,

            d.IdWebOC,

            d.IdResponsableOC,
            d.NombreResponsableOC,
            d.NroDocumentoResponsableOC,

            d.IdSolicitante,
            d.IdMoneda,

            d.Cantidad,
            d.PrecioUnitario,
            d.SubtotalOC,
            d.DetalleOC,

            ----------------------------------------------------
            -- PLANILLA
            ----------------------------------------------------

            p.CorrelativoPago,

            p.IdWebPlanilla,

            p.IdResponsablePlanilla,
            p.NombreResponsablePlanilla,
            p.NroDocumentoResponsablePlanilla,

            p.FechaDeposito,
            p.Serie,
            p.NroOperacion,
            p.EstadoPlanilla,

            ----------------------------------------------------
            -- INDICADORES
            ----------------------------------------------------

            ISNULL(d.ExisteOC, 0) AS TieneOC,
            ISNULL(p.ExistePago, 0) AS TienePago,

            ----------------------------------------------------
            -- VALIDACION DE DATOS COMPLEMENTARIOS
            ----------------------------------------------------

            CASE
                WHEN d.ExisteOC = 1
                     AND p.ExistePago = 1
                THEN
                    CASE
                        WHEN EXISTS
                        (
                            SELECT
                                d.IdCliente,
                                d.IdProyecto,
                                d.IdSite,
                                d.CorreSite,
                                d.TipoTrabajo

                            INTERSECT

                            SELECT
                                p.IdCliente,
                                p.IdProyecto,
                                p.IdSite,
                                p.CorreSite,
                                p.TipoTrabajo
                        )
                        THEN 'COINCIDENCIA COMPLETA'

                        ELSE 'DIFERENCIA EN DATOS COMPLEMENTARIOS'
                    END

                WHEN d.ExisteOC = 1
                    THEN 'SIN PAGO ASOCIADO'

                WHEN p.ExistePago = 1
                    THEN 'SIN DETALLE OC ASOCIADO'

                ELSE 'REVISAR'
            END AS ObservacionVinculacion

        FROM DetalleOC d

        FULL OUTER JOIN Pagos p
            ON d.IdOc = p.IdOc
           AND d.Fila = p.Fila
    )

    ------------------------------------------------------------
    -- 8. RESULTADO FINAL
    ------------------------------------------------------------
    SELECT
        -- CLASIFICACION
        x.TipoRegistro,
        x.ObservacionVinculacion,

        -- IDENTIFICACION PRINCIPAL
        x.IdOc,
        x.Fila,
        x.Ot,

        -- IDENTIFICADORES POR ORIGEN
        x.IdOcDetalleOC,
        x.IdOcPlanilla,

        x.FilaOC,
        x.FilaPlanilla,

        x.OtOC,
        x.OtPlanilla,

        -- CLIENTE
        x.IdCliente,
        cli.NombreCliente,

        x.IdClienteOC,
        x.IdClientePlanilla,

        -- PROYECTO
        x.IdProyecto,
        pro.NombreProyecto,

        x.IdProyectoOC,
        x.IdProyectoPlanilla,

        -- SITE
        x.IdSite,
        s.NombreSite,

        x.IdSiteOC,
        x.IdSitePlanilla,

        x.CorreSite,
        x.CorreSiteOC,
        x.CorreSitePlanilla,

        -- TIPO TRABAJO
        x.TipoTrabajo,
        x.TipoTrabajoOC,
        x.TipoTrabajoPlanilla,

        -- ORDEN DE COMPRA
        x.FechaOC,

        x.IdWebOC,

        x.IdResponsableOC,
        x.NombreResponsableOC,
        x.NroDocumentoResponsableOC,

        x.IdSolicitante,

        x.IdMoneda,
        mon.ValorIni AS MonedaOC,

        x.Cantidad,
        x.PrecioUnitario,
        x.SubtotalOC,
        x.DetalleOC,

        -- PLANILLA PAGADA
        x.CorrelativoPago,

        x.IdWebPlanilla,

        x.IdResponsablePlanilla,
        x.NombreResponsablePlanilla,
        x.NroDocumentoResponsablePlanilla,

        x.FechaDeposito,
        x.Serie,
        x.NroOperacion,
        x.EstadoPlanilla,

        -- INDICADORES
        x.TieneOC,
        x.TienePago

    FROM Consolidado x

    -- CLIENTE
    LEFT JOIN dbo.Cliente cli
        ON cli.IdCliente = x.IdCliente

    -- PROYECTO
    LEFT JOIN dbo.Proyecto pro
        ON pro.IdProyecto = x.IdProyecto

    -- SITE
    LEFT JOIN dbo.Site s
        ON s.IdSite = x.IdSite
       AND s.Correlativo = x.CorreSite

    -- MONEDA
    LEFT JOIN dbo.Constante mon
        ON mon.Campo = 'tipo_moneda'
       AND mon.Correlativo = x.IdMoneda

    ------------------------------------------------------------
    -- 9. ORDENAMIENTO
    ------------------------------------------------------------
    ORDER BY
        x.IdOc,
        x.Fila,
        x.CorrelativoPago,
        x.IdCliente,
        x.IdProyecto

    OPTION (RECOMPILE);
END;
GO
