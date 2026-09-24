USE [JC_Db]
GO

SET ANSI_NULLS ON
GO

SET QUOTED_IDENTIFIER ON
GO


ALTER PROCEDURE [dbo].[sp_OrdenCompra_Consulta_Estados]
(
    @pProyecto      VARCHAR(200) = NULL,
    @Ano            INT = NULL,
    @Id             INT = NULL,
    @IdResponsable  INT = NULL,
    @IdCliente      INT = NULL,
    @IdProyecto     INT = NULL,
    @IdSite         VARCHAR(MAX) = NULL,
    @Estados        VARCHAR(200) = NULL,
    @FechaInicio    DATE = NULL,
    @FechaFin       DATE = NULL
)
AS
BEGIN

    SET NOCOUNT ON;


    /* ============================================================
       NORMALIZACIÓN DE PARÁMETROS
       ============================================================ */

    SET @pProyecto = NULLIF(LTRIM(RTRIM(@pProyecto)), '');
    SET @Estados   = NULLIF(LTRIM(RTRIM(@Estados)), '');

    IF @Ano = 0
        SET @Ano = NULL;

    IF @Id = 0
        SET @Id = NULL;

    IF @IdResponsable = 0
        SET @IdResponsable = NULL;

    IF @IdCliente = 0
        SET @IdCliente = NULL;

    IF @IdProyecto = 0
        SET @IdProyecto = NULL;

    SET @IdSite = NULLIF(LTRIM(RTRIM(@IdSite)), '');


    /* ============================================================
       CONSULTA PRINCIPAL
       ============================================================ */

    SELECT DISTINCT

        /* ========================================================
           CABORDENCOMPRA
           ======================================================== */

        a6.IdOc,

        a6.IdResponsable AS IdResponsableOc,

        RespOc.NombreEmpleado AS ResponsableOc,


        /* ========================================================
           MONEDA ORDEN DE COMPRA
           ======================================================== */

        a6.IdMoneda AS IdMonedaOc,

        MonedaOc.ValorIni AS MonedaOc,


        /* ========================================================
           MONTOS CABORDENCOMPRA
           ======================================================== */

        a6.Subtotal AS SubtotalOc,

        a6.Igv AS IgvOc,

        a6.Total AS TotalOc,


        /* ========================================================
           DETORDENCOMPRA
           ======================================================== */

        a5.IdCliente,

        cli.NombreCliente AS Cliente,

        a5.IdProyecto,

        pro.NombreProyecto,

        a5.IdSite,

        a5.Correlativo AS CorSite,

        st.NombreSite AS Site,

        a5.FechaCreacion AS FechaOc,

        a5.PrecioUnitario AS PrecioUniOc,

        a5.Cantidad AS CantOc,

        a5.IdAprobador1,

        a5.IdAprobador2,

        a5.IdAprobador3,

        CASE
            WHEN ISNULL(a5.IdAprobador1, 0) > 0
                THEN CONCAT('Registrado (', CONVERT(VARCHAR(20), a5.IdAprobador1), ')')
            ELSE 'Pendiente'
        END AS PrimeraValidacion,

        CASE
            WHEN ISNULL(a5.IdAprobador2, 0) > 0
                THEN CONCAT('Registrado (', CONVERT(VARCHAR(20), a5.IdAprobador2), ')')
            ELSE 'Pendiente'
        END AS SegundaValidacion,

        CASE
            WHEN ISNULL(a5.IdAprobador3, 0) > 0
                THEN CONCAT('Registrado (', CONVERT(VARCHAR(20), a5.IdAprobador3), ')')
            ELSE 'Pendiente'
        END AS TerceraValidacion,


        /* ========================================================
           ESTADO ORDEN COMPRA
           ======================================================== */

        a5.IdEstado AS IdEstadoOc,

        CASE
            WHEN a5.IdEstado = 1 THEN 'APROBADO'
            WHEN a5.IdEstado = 6 THEN 'RECHAZADO'
            WHEN a5.IdEstado IS NULL THEN 'SIN ESTADO'
            ELSE 'PENDIENTE'
        END AS EstadoOc,


        /* ========================================================
           MONTO DETALLE OC
           ======================================================== */

        ISNULL(a5.PrecioUnitario, 0)
        *
        ISNULL(a5.Cantidad, 0)
        AS MontoDetalleOc,


        /* ========================================================
           PLANILLA - EXISTENCIA
           ======================================================== */

        CASE
            WHEN ISNULL(pl.CantidadPlanillas, 0) > 0
                THEN 1
            ELSE 0
        END AS TienePlanilla,

        ISNULL(
            pl.CantidadPlanillas,
            0
        ) AS CantidadPlanillas,


        /* ========================================================
           PLANILLA - CORRELATIVOS
           ======================================================== */

        pl.CorrelativoPlanilla,


        /* ========================================================
           PLANILLA - ESTADO
           ======================================================== */

        pl.IdEstadoPlanilla,

        pl.EstadoPlanilla,

        ISNULL(
            pl.CantidadEstadosPlanilla,
            0
        ) AS CantidadEstadosPlanilla,


        /* ========================================================
           PLANILLA - RESPONSABLE
           ======================================================== */

        pl.IdResponsablePlanilla,

        RespPla.NombreEmpleado AS ResponsablePlanilla,

        ISNULL(
            pl.CantidadResponsables,
            0
        ) AS CantidadResponsablesPlanilla,


        /* ========================================================
           PLANILLA - SOLICITANTE
           ======================================================== */

        pl.IdSolicitantePlanilla,

        SolPla.NombreEmpleado AS SolicitantePlanilla,

        ISNULL(
            pl.CantidadSolicitantes,
            0
        ) AS CantidadSolicitantesPlanilla,


        /* ========================================================
           PLANILLA - MONEDA
           ======================================================== */

        pl.TipoMonedaPlanilla AS IdMonedaPlanilla,

        pl.MonedaPlanilla,

        ISNULL(
            pl.CantidadMonedasPlanilla,
            0
        ) AS CantidadMonedasPlanilla,


        /* ========================================================
           PLANILLA - MONTOS
           ======================================================== */

        ISNULL(
            pl.SubtotalPlanilla,
            0
        ) AS SubtotalPlanilla,

        ISNULL(
            pl.IgvPlanilla,
            0
        ) AS IgvPlanilla,

        ISNULL(
            pl.TotalPlanilla,
            0
        ) AS TotalPlanilla,

        ISNULL(
            pl.MontoRetencionPlanilla,
            0
        ) AS MontoRetencionPlanilla,

        ISNULL(
            pl.TotalPagarPlanilla,
            0
        ) AS TotalPagarPlanilla,


        /* ========================================================
           PLANILLA - FECHAS
           ======================================================== */

        pl.PrimeraFechaIngreso,

        pl.UltimaFechaIngreso,

        pl.PrimeraFechaDeposito,

        pl.UltimaFechaDeposito,


        /* ========================================================
           VALIDACIÓN RESPONSABLE
           ======================================================== */

        CASE
            WHEN ISNULL(pl.CantidadPlanillas, 0) = 0
                THEN 'SIN PLANILLA'

            WHEN ISNULL(pl.CantidadResponsables, 0) > 1
                THEN 'VARIOS RESPONSABLES EN PLANILLA'

            WHEN pl.IdResponsablePlanilla = a6.IdResponsable
                THEN 'RESPONSABLE COINCIDE'

            ELSE
                'RESPONSABLE DIFERENTE'

        END AS ValidacionResponsable,


        /* ========================================================
           IMPORTAR
           ======================================================== */

        CASE
            WHEN ISNULL(imp.CantidadImportar, 0) > 0
                THEN 1
            ELSE 0
        END AS TieneImportar,

        ISNULL(
            imp.CantidadImportar,
            0
        ) AS CantidadImportar,

        ISNULL(
            imp.CantidadImportarActivos,
            0
        ) AS CantidadImportarActivos,

        ISNULL(
            imp.CantidadImportarInactivos,
            0
        ) AS CantidadImportarInactivos,

        imp.Atp,

        imp.Status_Pap,


        /* ========================================================
           STATUS CLARO
           ======================================================== */

        ope.StatusClaro,


        /* ========================================================
           COMPARACIÓN OC VS PLANILLA
           ======================================================== */

        ISNULL(a6.Subtotal, 0)
        -
        ISNULL(pl.SubtotalPlanilla, 0)
        AS SaldoOcVsPlanilla,


        CASE
            WHEN ISNULL(a6.Total, 0) = 0
                THEN 0

            ELSE
                CAST(
                    ROUND(
                        (
                            ISNULL(pl.TotalPlanilla, 0)
                            /
                            NULLIF(a6.Total, 0)
                        ) * 100,
                        2
                    ) AS DECIMAL(18, 2)
                )

        END AS PorcentajeConsumidoOc,


        /* ========================================================
           ESTADO GENERAL DE RELACIÓN
           ======================================================== */

        CASE
            WHEN ISNULL(pl.CantidadPlanillas, 0) = 0
                 AND ISNULL(imp.CantidadImportar, 0) = 0
                THEN 'SIN PLANILLA / SIN IMPORTAR'

            WHEN ISNULL(pl.CantidadPlanillas, 0) = 0
                 AND ISNULL(imp.CantidadImportar, 0) > 0
                THEN 'SIN PLANILLA'

            WHEN ISNULL(pl.CantidadPlanillas, 0) > 0
                 AND ISNULL(imp.CantidadImportar, 0) = 0
                THEN 'SIN IMPORTAR'

            ELSE
                'RELACION COMPLETA'

        END AS EstadoRelacion


    /* ============================================================
       CABORDENCOMPRA
       ============================================================ */

    FROM dbo.CabOrdenCompra a6


    /* ============================================================
       DETORDENCOMPRA
       ============================================================ */

    LEFT JOIN dbo.DetOrdenCompra a5
        ON a5.IdOc = a6.IdOc


    /* ============================================================
       RESPONSABLE OC
       ============================================================ */

    LEFT JOIN dbo.Empleado RespOc
        ON RespOc.IdEmpleado = a6.IdResponsable


    /* ============================================================
       MONEDA ORDEN DE COMPRA
       ============================================================ */

    LEFT JOIN dbo.Constante MonedaOc
        ON MonedaOc.Campo = 'TIPO_MONEDA'
       AND MonedaOc.Correlativo = a6.IdMoneda


    /* ============================================================
       CLIENTE
       ============================================================ */

    LEFT JOIN dbo.Cliente cli
        ON cli.IdCliente = a5.IdCliente


    /* ============================================================
       PROYECTO
       ============================================================ */

    LEFT JOIN dbo.Proyecto pro
        ON pro.IdProyecto = a5.IdProyecto


    /* ============================================================
       SITE
       ============================================================ */

    LEFT JOIN dbo.Site st
        ON st.IdSite = a5.IdSite
       AND st.Correlativo = a5.Correlativo


    /* ============================================================
       PLANILLA
       ============================================================ */

    OUTER APPLY
    (
        SELECT

            /* ====================================================
               CANTIDAD PLANILLAS
               ==================================================== */

            COUNT(*) AS CantidadPlanillas,


            /* ====================================================
               CORRELATIVOS PLANILLA
               ==================================================== */

            STRING_AGG(
                CONVERT(VARCHAR(MAX), p.Correlativo),
                ', '
            ) AS CorrelativoPlanilla,


            /* ====================================================
               ESTADOS PLANILLA
               ==================================================== */

            COUNT(
                DISTINCT p.Estado
            ) AS CantidadEstadosPlanilla,

            CASE
                WHEN COUNT(DISTINCT p.Estado) = 1
                    THEN MAX(p.Estado)

                ELSE NULL

            END AS IdEstadoPlanilla,

            CASE
                WHEN COUNT(*) = 0
                    THEN NULL

                WHEN COUNT(DISTINCT p.Estado) = 1
                    THEN MAX(EstadoPla.ValorIni)

                ELSE
                    'VARIOS ESTADOS'

            END AS EstadoPlanilla,


            /* ====================================================
               RESPONSABLE PLANILLA
               ==================================================== */

            COUNT(
                DISTINCT p.IdResponsable
            ) AS CantidadResponsables,

            CASE
                WHEN COUNT(DISTINCT p.IdResponsable) = 1
                    THEN MAX(p.IdResponsable)

                ELSE NULL

            END AS IdResponsablePlanilla,


            /* ====================================================
               SOLICITANTE PLANILLA

               Planilla.IdSolicitante
                         ↓
               Empleado.IdEmpleado
               ==================================================== */

            COUNT(
                DISTINCT p.IdSolicitante
            ) AS CantidadSolicitantes,

            CASE
                WHEN COUNT(DISTINCT p.IdSolicitante) = 1
                    THEN MAX(p.IdSolicitante)

                ELSE NULL

            END AS IdSolicitantePlanilla,


            /* ====================================================
               MONEDA PLANILLA
               ==================================================== */

            COUNT(
                DISTINCT p.TipoMoneda
            ) AS CantidadMonedasPlanilla,

            CASE
                WHEN COUNT(DISTINCT p.TipoMoneda) = 1
                    THEN MAX(p.TipoMoneda)

                ELSE NULL

            END AS TipoMonedaPlanilla,

            CASE
                WHEN COUNT(*) = 0
                    THEN NULL

                WHEN COUNT(DISTINCT p.TipoMoneda) = 1
                    THEN MAX(MonedaPla.ValorIni)

                ELSE
                    'VARIAS MONEDAS'

            END AS MonedaPlanilla,


            /* ====================================================
               MONTOS PLANILLA
               ==================================================== */

            SUM(
                ISNULL(p.Subtotal, 0)
            ) AS SubtotalPlanilla,

            SUM(
                ISNULL(p.Igv, 0)
            ) AS IgvPlanilla,

            SUM(
                ISNULL(p.Total, 0)
            ) AS TotalPlanilla,

            SUM(
                ISNULL(p.MontoRetencion, 0)
            ) AS MontoRetencionPlanilla,

            SUM(
                ISNULL(p.TotalPagar, 0)
            ) AS TotalPagarPlanilla,


            /* ====================================================
               PRIMERA FECHA INGRESO
               ==================================================== */

            MIN
            (
                COALESCE
                (
                    TRY_CONVERT(
                        DATE,
                        NULLIF(
                            LTRIM(
                                RTRIM(
                                    CONVERT(VARCHAR(50), p.FecIngreso)
                                )
                            ),
                            ''
                        ),
                        101
                    ),

                    TRY_CONVERT(
                        DATE,
                        NULLIF(
                            LTRIM(
                                RTRIM(
                                    CONVERT(VARCHAR(50), p.FecIngreso)
                                )
                            ),
                            ''
                        ),
                        103
                    ),

                    TRY_CONVERT(
                        DATE,
                        NULLIF(
                            LTRIM(
                                RTRIM(
                                    CONVERT(VARCHAR(50), p.FecIngreso)
                                )
                            ),
                            ''
                        ),
                        23
                    )
                )
            ) AS PrimeraFechaIngreso,


            /* ====================================================
               ÚLTIMA FECHA INGRESO
               ==================================================== */

            MAX
            (
                COALESCE
                (
                    TRY_CONVERT(
                        DATE,
                        NULLIF(
                            LTRIM(
                                RTRIM(
                                    CONVERT(VARCHAR(50), p.FecIngreso)
                                )
                            ),
                            ''
                        ),
                        101
                    ),

                    TRY_CONVERT(
                        DATE,
                        NULLIF(
                            LTRIM(
                                RTRIM(
                                    CONVERT(VARCHAR(50), p.FecIngreso)
                                )
                            ),
                            ''
                        ),
                        103
                    ),

                    TRY_CONVERT(
                        DATE,
                        NULLIF(
                            LTRIM(
                                RTRIM(
                                    CONVERT(VARCHAR(50), p.FecIngreso)
                                )
                            ),
                            ''
                        ),
                        23
                    )
                )
            ) AS UltimaFechaIngreso,


            /* ====================================================
               PRIMERA FECHA DEPÓSITO
               ==================================================== */

            MIN
            (
                COALESCE
                (
                    TRY_CONVERT(
                        DATE,
                        NULLIF(
                            LTRIM(
                                RTRIM(
                                    CONVERT(VARCHAR(50), p.FechaDeposito)
                                )
                            ),
                            ''
                        ),
                        101
                    ),

                    TRY_CONVERT(
                        DATE,
                        NULLIF(
                            LTRIM(
                                RTRIM(
                                    CONVERT(VARCHAR(50), p.FechaDeposito)
                                )
                            ),
                            ''
                        ),
                        103
                    ),

                    TRY_CONVERT(
                        DATE,
                        NULLIF(
                            LTRIM(
                                RTRIM(
                                    CONVERT(VARCHAR(50), p.FechaDeposito)
                                )
                            ),
                            ''
                        ),
                        23
                    )
                )
            ) AS PrimeraFechaDeposito,


            /* ====================================================
               ÚLTIMA FECHA DEPÓSITO
               ==================================================== */

            MAX
            (
                COALESCE
                (
                    TRY_CONVERT(
                        DATE,
                        NULLIF(
                            LTRIM(
                                RTRIM(
                                    CONVERT(VARCHAR(50), p.FechaDeposito)
                                )
                            ),
                            ''
                        ),
                        101
                    ),

                    TRY_CONVERT(
                        DATE,
                        NULLIF(
                            LTRIM(
                                RTRIM(
                                    CONVERT(VARCHAR(50), p.FechaDeposito)
                                )
                            ),
                            ''
                        ),
                        103
                    ),

                    TRY_CONVERT(
                        DATE,
                        NULLIF(
                            LTRIM(
                                RTRIM(
                                    CONVERT(VARCHAR(50), p.FechaDeposito)
                                )
                            ),
                            ''
                        ),
                        23
                    )
                )
            ) AS UltimaFechaDeposito


        FROM dbo.Planilla p


        /* ========================================================
           ESTADO PLANILLA
           ======================================================== */

        LEFT JOIN dbo.Constante EstadoPla
            ON EstadoPla.Campo = 'ESTADO'
           AND EstadoPla.Correlativo = p.Estado


        /* ========================================================
           MONEDA PLANILLA
           ======================================================== */

        LEFT JOIN dbo.Constante MonedaPla
            ON MonedaPla.Campo = 'TIPO_MONEDA'
           AND MonedaPla.Correlativo = p.TipoMoneda


        WHERE

            p.IdOc = a5.IdOc

            AND p.IdCliente = a5.IdCliente

            AND p.IdProyecto = a5.IdProyecto

            AND p.IdSite = a5.IdSite

            AND p.CorreSite = a5.Correlativo

    ) pl


    /* ============================================================
       RESPONSABLE PLANILLA
       ============================================================ */

    LEFT JOIN dbo.Empleado RespPla
        ON RespPla.IdEmpleado = pl.IdResponsablePlanilla


    /* ============================================================
       SOLICITANTE PLANILLA

       Planilla.IdSolicitante
                ↓
       Empleado.IdEmpleado
       ============================================================ */

    LEFT JOIN dbo.Empleado SolPla
        ON SolPla.IdEmpleado = pl.IdSolicitantePlanilla


    /* ============================================================
       IMPORTAR
       ============================================================ */

    OUTER APPLY
    (
        SELECT

            COUNT(*) AS CantidadImportar,

            SUM(
                CASE
                    WHEN imp1.IdEstado = 1
                        THEN 1
                    ELSE 0
                END
            ) AS CantidadImportarActivos,

            SUM(
                CASE
                    WHEN ISNULL(imp1.IdEstado, 0) <> 1
                        THEN 1
                    ELSE 0
                END
            ) AS CantidadImportarInactivos,

            MAX(
                imp1.Atp
            ) AS Atp,

            MAX(
                imp1.Status_Pap
            ) AS Status_Pap

        FROM dbo.Importar imp1

        WHERE
            imp1.IdCliente = a5.IdCliente

            AND imp1.IdProyecto = a5.IdProyecto

            AND imp1.IdSite = a5.IdSite

            AND imp1.Correlativo = a5.Correlativo

    ) imp


    /* ============================================================
       DB_OPERACIONES_CJ
       ============================================================ */

    OUTER APPLY
    (
        SELECT

            MAX(
                EstadoClaro.ValorIni
            ) AS StatusClaro

        FROM dbo.Db_Operaciones_Cj op

        LEFT JOIN dbo.Constante EstadoClaro
            ON EstadoClaro.Campo = 'OPE_STATUS_CLARO'
           AND EstadoClaro.Correlativo = op.Status_Claro

        WHERE

            op.IdCliente = a5.IdCliente

            AND op.IdProyecto = a5.IdProyecto

            AND op.IdSite = a5.IdSite

            AND op.CorreSite = a5.Correlativo

    ) ope


    /* ============================================================
       FILTROS
       ============================================================ */

    WHERE 1 = 1


      /* ==========================================================
         ID OC
         ========================================================== */

      AND
      (
            @Id IS NULL
            OR a6.IdOc = @Id
      )


      /* ==========================================================
         RESPONSABLE CABORDENCOMPRA
         ========================================================== */

      AND
      (
            @IdResponsable IS NULL
            OR a6.IdResponsable = @IdResponsable
      )


      /* ==========================================================
         CLIENTE
         ========================================================== */

      AND
      (
            @IdCliente IS NULL
            OR a5.IdCliente = @IdCliente
      )


      /* ==========================================================
         PROYECTO
         ========================================================== */

      AND
      (
            @IdProyecto IS NULL
            OR a5.IdProyecto = @IdProyecto
      )


      /* ==========================================================
         SITE
         ========================================================== */

      AND
      (
            @IdSite IS NULL
            OR EXISTS
            (
                SELECT 1
                FROM STRING_SPLIT(@IdSite, ',') AS site
                WHERE LTRIM(RTRIM(site.value)) = CONVERT(VARCHAR(200), a5.IdSite)
            )
      )


      /* ==========================================================
         NOMBRE PROYECTO
         ========================================================== */

      AND
      (
            @pProyecto IS NULL

            OR LTRIM(RTRIM(UPPER(pro.NombreProyecto)))
               =
               LTRIM(RTRIM(UPPER(@pProyecto)))
      )


      /* ==========================================================
         ESTADOS DETORDENCOMPRA
         ========================================================== */

      AND
      (
            @Estados IS NULL

            OR EXISTS
            (
                SELECT 1

                FROM STRING_SPLIT(
                    @Estados,
                    ','
                ) AS est

                WHERE TRY_CONVERT(
                          INT,
                          LTRIM(RTRIM(est.value))
                      ) = a5.IdEstado
            )
      )


      /* ==========================================================
         FECHA INICIO
         ========================================================== */

      AND
      (
            @FechaInicio IS NULL

            OR TRY_CONVERT(
                    DATE,
                    a5.FechaCreacion
               ) >= @FechaInicio
      )


      /* ==========================================================
         FECHA FIN
         ========================================================== */

      AND
      (
            @FechaFin IS NULL

            OR TRY_CONVERT(
                    DATE,
                    a5.FechaCreacion
               ) <= @FechaFin
      )


      /* ==========================================================
         AÑO
         ========================================================== */

      AND
      (
            @Ano IS NULL

            OR YEAR(
                    TRY_CONVERT(
                        DATE,
                        a5.FechaCreacion
                    )
               ) = @Ano
      )


    /* ============================================================
       ORDEN
       ============================================================ */

    ORDER BY

        a6.IdOc DESC,

        a5.IdCliente,

        a5.IdProyecto,

        a5.IdSite,

        a5.Correlativo;

END
GO
