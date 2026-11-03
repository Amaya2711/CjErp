/* ============================================================
   dbo.sp_OrdenCompra_Consulta_Estados
   Consulta "analisis-gastos" (OC/Gastos de oc_v1 / oc_v2 y OcResumenPanel).

   Sincronizado con el SP vigente en JC_Db (30/10/2026) + cambio:
   las planillas con Estado = 3 (RECHAZADO) se excluyen de TODO el
   bloque PLANILLA (cantidad, estados, responsable, solicitante,
   moneda, montos y fechas), no solo de correlativos y montos.
   Union Planilla <-> detalle OC: IdOc + Fila.
   PV: ejecutar en BD tras comparar con el SP vigente (Script as ALTER).
   ============================================================ */
USE [JC_Db]
GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE OR ALTER PROCEDURE [dbo].[sp_OrdenCompra_Consulta_Estados]
(
    @pProyecto      VARCHAR(200) = NULL,
    @Ano            INT = NULL,
    @Id             INT = NULL,

    /* PERMITE VARIOS: '4404,4405,4410' */
    @IdResponsable  VARCHAR(500) = NULL,

    /* PERMITE VARIOS: '1160,4404,5521' */
    @IdSolicitante  VARCHAR(500) = NULL,

    @IdCliente      INT = NULL,

    /* PERMITE VARIOS: '79,82,91' */
    @IdProyecto     VARCHAR(500) = NULL,

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
    SET @Estados = NULLIF(LTRIM(RTRIM(@Estados)), '');
    SET @IdResponsable = NULLIF(LTRIM(RTRIM(@IdResponsable)), '');
    SET @IdSolicitante = NULLIF(LTRIM(RTRIM(@IdSolicitante)), '');
    SET @IdProyecto = NULLIF(LTRIM(RTRIM(@IdProyecto)), '');
    SET @IdSite = NULLIF(LTRIM(RTRIM(@IdSite)), '');

    IF @Ano = 0
        SET @Ano = NULL;

    IF @Id = 0
        SET @Id = NULL;

    IF @IdCliente = 0
        SET @IdCliente = NULL;


    /* ============================================================
       CONSULTA PRINCIPAL
       ============================================================ */

    SELECT DISTINCT

        /* CABORDENCOMPRA */
        a6.IdOc,

        /* RESPONSABLE OC */
        a6.IdResponsable AS IdResponsableOc,
        RespOc.NombreEmpleado AS ResponsableOc,

        /* SOLICITANTE OC
           IdWeb = 1 -> EmpleadoCj ; IdWeb <> 1 / NULL -> Empleado */
        a6.IdSolicitante AS IdSolicitanteOc,

        CASE
            WHEN ISNULL(a6.IdWeb, 0) = 1
                THEN SolOcCj.NombreEmpleado
            ELSE
                SolOcCjOld.NombreEmpleado
        END AS SolicitanteOc,

        /* VALIDADOR OC
           IdWeb = 1 -> EmpleadoCj ; IdWeb <> 1 / NULL -> Empleado */
        a6.IdValidador AS IdValidadorOc,

        CASE
            WHEN ISNULL(a6.IdWeb, 0) = 1
                THEN ValOcCj.NombreEmpleado
            ELSE
                ValOc.NombreEmpleado
        END AS ValidadorOc,

        /* ID WEB */
        ISNULL(a6.IdWeb, 0) AS IdWebOc,

        /* MONEDA ORDEN DE COMPRA */
        a6.IdMoneda AS IdMonedaOc,
        MonedaOc.ValorIni AS MonedaOc,

        /* MONTO DETALLE OC POR IDOC + FILA */
        (ISNULL(a5.PrecioUnitario, 0) * ISNULL(a5.Cantidad, 0)) AS SubtotalOc,

        a6.Igv AS IgvOc,
        a6.Total AS TotalOc,

        /* DETORDENCOMPRA */
        a5.IdCliente,
        cli.NombreCliente AS Cliente,
        a5.IdProyecto,
        pro.NombreProyecto,
        a5.IdSite,
        a5.Correlativo AS CorSite,
        st.NombreSite AS Site,
        a5.FechaCreacion AS FechaOc,
        a5.IdAprobador1,
        a5.IdAprobador2,
        a5.IdAprobador3,

        /* ESTADO ORDEN COMPRA */
        a5.IdEstado AS IdEstadoOc,

        CASE
            WHEN a5.IdEstado = 6 THEN 'RECHAZADO'
            WHEN a5.IdAprobador3 > 0 THEN 'Aprobado'
            WHEN a5.IdAprobador2 > 0 THEN 'En 3era Aprob.'
            WHEN a5.IdAprobador1 > 0 THEN 'En 2da Aprob.'
            WHEN a6.IdGestor > 0 THEN 'En 1era aprobacion'
            ELSE 'en Pre Aprob.'
        END AS EstadoOc,

        /* PLANILLA - EXISTENCIA */
        CASE
            WHEN ISNULL(pl.CantidadPlanillas, 0) > 0
                THEN 1
            ELSE 0
        END AS TienePlanilla,

        ISNULL(pl.CantidadPlanillas, 0) AS CantidadPlanillas,

        /* PLANILLA - CORRELATIVOS
           TODOS LOS ESTADOS EXCEPTO PLANILLA.ESTADO = 3 (RECHAZADO) */
        plPagada.CorrelativoPlanilla,

        /* PLANILLA - ESTADO */
        pl.IdEstadoPlanilla,
        pl.EstadoPlanilla,
        ISNULL(pl.CantidadEstadosPlanilla, 0) AS CantidadEstadosPlanilla,

        /* PLANILLA - RESPONSABLE */
        pl.IdResponsablePlanilla,
        RespPla.NombreEmpleado AS ResponsablePlanilla,
        ISNULL(pl.CantidadResponsables, 0) AS CantidadResponsablesPlanilla,

        /* PLANILLA - SOLICITANTE */
        pl.IdSolicitantePlanilla,
        SolPla.NombreEmpleado AS SolicitantePlanilla,
        ISNULL(pl.CantidadSolicitantes, 0) AS CantidadSolicitantesPlanilla,

        /* PLANILLA - MONEDA */
        pl.TipoMonedaPlanilla AS IdMonedaPlanilla,
        pl.MonedaPlanilla,
        ISNULL(pl.CantidadMonedasPlanilla, 0) AS CantidadMonedasPlanilla,

        /* PLANILLA - MONTOS */
        ISNULL(pl.SubtotalPlanilla, 0) AS SubtotalPlanilla,
        ISNULL(pl.IgvPlanilla, 0) AS IgvPlanilla,
        ISNULL(pl.TotalPlanilla, 0) AS TotalPlanilla,
        ISNULL(pl.MontoRetencionPlanilla, 0) AS MontoRetencionPlanilla,
        ISNULL(pl.TotalPagarPlanilla, 0) AS TotalPagarPlanilla,

        /* PLANILLA - FECHAS */
        pl.PrimeraFechaIngreso,
        pl.UltimaFechaIngreso,
        pl.PrimeraFechaDeposito,
        pl.UltimaFechaDeposito,

        /* VALIDACIÓN RESPONSABLE */
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

        /* IMPORTAR */
        CASE
            WHEN ISNULL(imp.CantidadImportar, 0) > 0
                THEN 1
            ELSE 0
        END AS TieneImportar,

        ISNULL(imp.CantidadImportar, 0) AS CantidadImportar,
        ISNULL(imp.CantidadImportarActivos, 0) AS CantidadImportarActivos,
        ISNULL(imp.CantidadImportarInactivos, 0) AS CantidadImportarInactivos,

        imp.Atp,
        imp.Status_Pap,

        /* STATUS CLARO */
        ope.StatusClaro,

        /* COMPARACIÓN OC VS PLANILLA */
        ISNULL((ISNULL(a5.PrecioUnitario, 0) * ISNULL(a5.Cantidad, 0)), 0)
        -
        ISNULL(pl.SubtotalPlanilla, 0)
        AS SaldoOcVsPlanilla,

        /* PORCENTAJE CONSUMIDO OC
           SubtotalPlanilla (IdOc + Fila) / SubtotalOc detalle (IdOc + Fila) x 100
           SubtotalPlanilla considera todos los estados excepto Estado = 3 */
        CASE
            WHEN ISNULL((ISNULL(a5.PrecioUnitario, 0) * ISNULL(a5.Cantidad, 0)), 0) = 0
                THEN 0
            ELSE
                CAST(
                    ROUND(
                        (
                            ISNULL(pl.SubtotalPlanilla, 0)
                            /
                            NULLIF((ISNULL(a5.PrecioUnitario, 0) * ISNULL(a5.Cantidad, 0)), 0)
                        ) * 100,
                        2
                    )
                    AS DECIMAL(18,2)
                )
        END AS PorcentajeConsumidoOc,

        /* ESTADO GENERAL DE RELACIÓN */
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
        END AS EstadoRelacion,

        a5.TipoTrabajo,
        a5.idtarea,
        tar.valorini as Tarea,
        CtaEmp.idCargo,
        CtaEmp.Cuenta,
        CtaEmp.CuentaInter,
        CtaEmp.NombreCta,
        ConsBco.ValorIni as Banco,
        a6.IdComprobante,
        comp.ValorIni as Comprobante,
        a5.fila,
        a5.detalle


    /* CABORDENCOMPRA */
    FROM dbo.CabOrdenCompra a6

    /* DETORDENCOMPRA */
    LEFT JOIN dbo.DetOrdenCompra a5
        ON a5.IdOc = a6.IdOc

    /* COMPROBANTE */
    LEFT JOIN dbo.Constante Comp
        ON Comp.campo = 'tipo_comprobante' AND Comp.Correlativo = a5.IdComprobante

    /* TAREA */
    LEFT JOIN dbo.Constante Tar
        ON tar.Campo = 'tarea'
       AND tar.Correlativo = a5.IdTarea

    /* RESPONSABLE OC */
    LEFT JOIN dbo.Empleado RespOc
        ON RespOc.IdEmpleado = a6.IdResponsable

    /* CUENTA RESPONSABLE */
    LEFT JOIN dbo.CuentaEmpleado CtaEmp
        ON CtaEmp.IdEmpleado = a6.IdResponsable

    /* BANCO CUENTA RESPONSABLE */
    LEFT JOIN dbo.Constante ConsBco
        ON ConsBco.campo = 'BANCO' AND ConsBco.Correlativo = CtaEmp.IdBanco

    /* SOLICITANTE OC - SISTEMA ANTIGUO (IdWeb <> 1 / NULL)
       CabOrdenCompra.IdSolicitante -> Empleado.IdEmpleado */
    LEFT JOIN dbo.Empleado SolOc
        ON SolOc.IdEmpleado = a6.IdSolicitante
       AND ISNULL(a6.IdWeb, 0) <> 1

    /* SOLICITANTE OC - SISTEMA ANTIGUO -> EMPLEADOCJ
       Empleado.IdEmpleadoCj -> EmpleadoCj.IdEmpleado */
    LEFT JOIN dbo.EmpleadoCj SolOcCjOld
        ON SolOcCjOld.IdEmpleado = SolOc.IdEmpleadoCj
       AND ISNULL(a6.IdWeb, 0) <> 1

    /* SOLICITANTE OC - WEB (IdWeb = 1)
       CabOrdenCompra.IdSolicitante -> EmpleadoCj.IdEmpleado */
    LEFT JOIN dbo.EmpleadoCj SolOcCj
        ON SolOcCj.IdEmpleado = a6.IdSolicitante
       AND ISNULL(a6.IdWeb, 0) = 1

    /* VALIDADOR OC - SISTEMA ANTIGUO */
    LEFT JOIN dbo.Empleado ValOc
        ON ValOc.IdEmpleado = a6.IdValidador
       AND ISNULL(a6.IdWeb, 0) <> 1

    /* VALIDADOR OC - WEB */
    LEFT JOIN dbo.EmpleadoCj ValOcCj
        ON ValOcCj.IdEmpleado = a6.IdValidador
       AND ISNULL(a6.IdWeb, 0) = 1

    /* MONEDA ORDEN DE COMPRA */
    LEFT JOIN dbo.Constante MonedaOc
        ON MonedaOc.Campo = 'TIPO_MONEDA'
       AND MonedaOc.Correlativo = a6.IdMoneda

    /* CLIENTE */
    LEFT JOIN dbo.Cliente cli
        ON cli.IdCliente = a5.IdCliente

    /* PROYECTO */
    LEFT JOIN dbo.Proyecto pro
        ON pro.IdProyecto = a5.IdProyecto

    /* SITE */
    LEFT JOIN dbo.Site st
        ON st.IdSite = a5.IdSite
       AND st.Correlativo = a5.Correlativo


    /* ============================================================
       PLANILLA (sin Estado = 3 RECHAZADO)
       ============================================================ */

    OUTER APPLY
    (
        SELECT

            /* CANTIDAD PLANILLAS */
            COUNT(*) AS CantidadPlanillas,

            /* ESTADOS PLANILLA */
            COUNT(DISTINCT p.Estado) AS CantidadEstadosPlanilla,

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

            /* RESPONSABLE PLANILLA */
            COUNT(DISTINCT p.IdResponsable) AS CantidadResponsables,

            CASE
                WHEN COUNT(DISTINCT p.IdResponsable) = 1
                    THEN MAX(p.IdResponsable)
                ELSE NULL
            END AS IdResponsablePlanilla,

            /* SOLICITANTE PLANILLA */
            COUNT(DISTINCT p.IdSolicitante) AS CantidadSolicitantes,

            CASE
                WHEN COUNT(DISTINCT p.IdSolicitante) = 1
                    THEN MAX(p.IdSolicitante)
                ELSE NULL
            END AS IdSolicitantePlanilla,

            /* MONEDA PLANILLA */
            COUNT(DISTINCT p.TipoMoneda) AS CantidadMonedasPlanilla,

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

            /* MONTOS PLANILLA (Estado <> 3; el WHERE ya excluye el 3) */
            SUM(
                CASE
                    WHEN ISNULL(p.Estado, 0) <> 3
                        THEN ISNULL(p.Subtotal, 0)
                    ELSE 0
                END
            ) AS SubtotalPlanilla,

            SUM(
                CASE
                    WHEN ISNULL(p.Estado, 0) <> 3
                        THEN ISNULL(p.Igv, 0)
                    ELSE 0
                END
            ) AS IgvPlanilla,

            SUM(
                CASE
                    WHEN ISNULL(p.Estado, 0) <> 3
                        THEN ISNULL(p.Total, 0)
                    ELSE 0
                END
            ) AS TotalPlanilla,

            SUM(
                CASE
                    WHEN ISNULL(p.Estado, 0) <> 3
                        THEN ISNULL(p.MontoRetencion, 0)
                    ELSE 0
                END
            ) AS MontoRetencionPlanilla,

            SUM(
                CASE
                    WHEN ISNULL(p.Estado, 0) <> 3
                        THEN ISNULL(p.TotalPagar, 0)
                    ELSE 0
                END
            ) AS TotalPagarPlanilla,

            /* PRIMERA FECHA INGRESO */
            MIN
            (
                COALESCE
                (
                    TRY_CONVERT(DATE, NULLIF(LTRIM(RTRIM(CONVERT(VARCHAR(50), p.FecIngreso))), ''), 101),
                    TRY_CONVERT(DATE, NULLIF(LTRIM(RTRIM(CONVERT(VARCHAR(50), p.FecIngreso))), ''), 103),
                    TRY_CONVERT(DATE, NULLIF(LTRIM(RTRIM(CONVERT(VARCHAR(50), p.FecIngreso))), ''), 23)
                )
            ) AS PrimeraFechaIngreso,

            /* ÚLTIMA FECHA INGRESO */
            MAX
            (
                COALESCE
                (
                    TRY_CONVERT(DATE, NULLIF(LTRIM(RTRIM(CONVERT(VARCHAR(50), p.FecIngreso))), ''), 101),
                    TRY_CONVERT(DATE, NULLIF(LTRIM(RTRIM(CONVERT(VARCHAR(50), p.FecIngreso))), ''), 103),
                    TRY_CONVERT(DATE, NULLIF(LTRIM(RTRIM(CONVERT(VARCHAR(50), p.FecIngreso))), ''), 23)
                )
            ) AS UltimaFechaIngreso,

            /* PRIMERA FECHA DEPÓSITO */
            MIN
            (
                COALESCE
                (
                    TRY_CONVERT(DATE, NULLIF(LTRIM(RTRIM(CONVERT(VARCHAR(50), p.FechaDeposito))), ''), 101),
                    TRY_CONVERT(DATE, NULLIF(LTRIM(RTRIM(CONVERT(VARCHAR(50), p.FechaDeposito))), ''), 103),
                    TRY_CONVERT(DATE, NULLIF(LTRIM(RTRIM(CONVERT(VARCHAR(50), p.FechaDeposito))), ''), 23)
                )
            ) AS PrimeraFechaDeposito,

            /* ÚLTIMA FECHA DEPÓSITO */
            MAX
            (
                COALESCE
                (
                    TRY_CONVERT(DATE, NULLIF(LTRIM(RTRIM(CONVERT(VARCHAR(50), p.FechaDeposito))), ''), 101),
                    TRY_CONVERT(DATE, NULLIF(LTRIM(RTRIM(CONVERT(VARCHAR(50), p.FechaDeposito))), ''), 103),
                    TRY_CONVERT(DATE, NULLIF(LTRIM(RTRIM(CONVERT(VARCHAR(50), p.FechaDeposito))), ''), 23)
                )
            ) AS UltimaFechaDeposito

        FROM dbo.Planilla p

        /* ESTADO PLANILLA */
        LEFT JOIN dbo.Constante EstadoPla
            ON EstadoPla.Campo = 'ESTADO'
           AND EstadoPla.Correlativo = p.Estado

        /* MONEDA PLANILLA */
        LEFT JOIN dbo.Constante MonedaPla
            ON MonedaPla.Campo = 'TIPO_MONEDA'
           AND MonedaPla.Correlativo = p.TipoMoneda

        WHERE
            p.IdOc = a5.IdOc

            AND p.Fila = a5.Fila

            AND ISNULL(p.Estado, 0) <> 3

    ) pl


    /* ============================================================
       CORRELATIVOS PLANILLA
       TODOS LOS ESTADOS EXCEPTO PLANILLA.ESTADO = 3 (RECHAZADO)
       ============================================================ */

    OUTER APPLY
    (
        SELECT
            STRING_AGG(
                CONVERT(VARCHAR(MAX), p4.Correlativo),
                ', '
            ) AS CorrelativoPlanilla

        FROM dbo.Planilla p4

        WHERE
            p4.IdOc = a5.IdOc

            AND p4.Fila = a5.Fila

            AND ISNULL(p4.Estado, 0) <> 3

    ) plPagada


    /* RESPONSABLE PLANILLA */
    LEFT JOIN dbo.Empleado RespPla
        ON RespPla.IdEmpleado = pl.IdResponsablePlanilla

    /* SOLICITANTE PLANILLA */
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

            MAX(imp1.Atp) AS Atp,

            MAX(imp1.Status_Pap) AS Status_Pap

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

            MAX(EstadoClaro.ValorIni) AS StatusClaro

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

    /* ID OC */
    AND
    (
        @Id IS NULL
        OR a6.IdOc = @Id
    )

    /* RESPONSABLES MÚLTIPLES */
    AND
    (
        @IdResponsable IS NULL
        OR EXISTS
        (
            SELECT 1
            FROM STRING_SPLIT(@IdResponsable, ',') AS resp
            WHERE TRY_CONVERT(INT, LTRIM(RTRIM(resp.value))) = a6.IdResponsable
        )
    )

    /* SOLICITANTES MÚLTIPLES
       IdWeb = 1      -> @IdSolicitante compara contra EmpleadoCj.IdEmpleado
       IdWeb = 0/NULL -> @IdSolicitante compara contra Empleado.IdEmpleadoCj
       El parámetro siempre debe recibir el identificador equivalente de EmpleadoCj. */
    AND
    (
        @IdSolicitante IS NULL
        OR EXISTS
        (
            SELECT 1
            FROM STRING_SPLIT(@IdSolicitante, ',') AS sol
            WHERE
                TRY_CONVERT(INT, LTRIM(RTRIM(sol.value)))
                =
                CASE
                    WHEN ISNULL(a6.IdWeb, 0) = 1
                        THEN SolOcCj.IdEmpleado
                    ELSE
                        SolOc.IdEmpleadoCj
                END
        )
    )

    /* CLIENTE */
    AND
    (
        @IdCliente IS NULL
        OR a5.IdCliente = @IdCliente
    )

    /* PROYECTOS MÚLTIPLES */
    AND
    (
        @IdProyecto IS NULL
        OR EXISTS
        (
            SELECT 1
            FROM STRING_SPLIT(@IdProyecto, ',') AS proy
            WHERE TRY_CONVERT(INT, LTRIM(RTRIM(proy.value))) = a5.IdProyecto
        )
    )

    /* SITE */
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

    /* NOMBRE PROYECTO */
    AND
    (
        @pProyecto IS NULL
        OR LTRIM(RTRIM(UPPER(pro.NombreProyecto))) = LTRIM(RTRIM(UPPER(@pProyecto)))
    )

    /* ESTADOS DETORDENCOMPRA */
    AND
    (
        @Estados IS NULL
        OR EXISTS
        (
            SELECT 1
            FROM STRING_SPLIT(@Estados, ',') AS est
            WHERE TRY_CONVERT(INT, LTRIM(RTRIM(est.value))) = a5.IdEstado
        )
    )

    /* FECHA INICIO */
    AND
    (
        @FechaInicio IS NULL
        OR TRY_CONVERT(DATE, a5.FechaCreacion) >= @FechaInicio
    )

    /* FECHA FIN */
    AND
    (
        @FechaFin IS NULL
        OR TRY_CONVERT(DATE, a5.FechaCreacion) <= @FechaFin
    )

    /* AÑO */
    AND
    (
        @Ano IS NULL
        OR YEAR(TRY_CONVERT(DATE, a5.FechaCreacion)) = @Ano
    )

    /* ORDEN */
    ORDER BY
        a6.IdOc DESC,
        a5.IdCliente,
        a5.IdProyecto,
        a5.IdSite,
        a5.Correlativo;

END;
GO
