USE [JC_Db]
GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/* ================================================================
   dbo.sp_Planilla_ConsultaIni_v2   (PRUEBA EN PARALELO)

   Es sp_Planilla_ConsultaIni con UN SOLO cambio: el bloque "FILTRO DE FECHAS".
     1) Usa las columnas DATE de Planilla (FecIngresoDate / FechaDepositoDate,
        con indices IX_Planilla_FecIngresoDate / IX_Planilla_FechaDepositoDate)
        en lugar de TRY_CONVERT sobre el texto fila por fila (que obliga a
        recorrer toda la tabla).
     2) Regla de fecha por estado (sin cambios respecto al SP actual):
          @IdEstado = 4                -> FechaDeposito
          @IdEstado NULL u otro valor  -> FecIngreso
   Los demas filtros, joins, columnas y el DISTINCT/ORDER BY no cambian.

   REQUISITO: ejecutar antes 01_validacion_fechas_Planilla_SoloLectura.sql y
   confirmar que no hay recibos con texto de fecha y columna DATE vacia/distinta.

   Despliegue: crear este _v2, comparar resultados contra el SP actual y, si
   coinciden, aplicar el mismo cuerpo con ALTER sobre sp_Planilla_ConsultaIni.
   ================================================================ */

CREATE OR ALTER PROCEDURE [dbo].[sp_Planilla_ConsultaIni_v2]
(
    @IdEstado       INT = NULL,
    @FechaInicio    DATE = NULL,
    @FechaFin       DATE = NULL,

    @Correlativo    INT = NULL,
    @IdCliente      INT = NULL,
    @TipoMoneda     INT = NULL,
    @IdComprobante  INT = NULL,
    @IdBanco        INT = NULL,
    @IdResponsable  INT = NULL,
    @IdSolicitante  INT = NULL,
    @IdOc           INT = NULL
)
AS
BEGIN

    SET NOCOUNT ON;

    SELECT DISTINCT

        CONVERT(
            VARCHAR(10),
            COALESCE(
                TRY_CONVERT(DATE, NULLIF(LTRIM(RTRIM(a.FecIngreso)), ''), 101),
                TRY_CONVERT(DATE, NULLIF(LTRIM(RTRIM(a.FecIngreso)), ''), 103),
                TRY_CONVERT(DATE, NULLIF(LTRIM(RTRIM(a.FecIngreso)), ''), 23)
            ),
            103
        ) AS FecIngreso,

        CAST(a.Detalle AS VARCHAR(MAX)) AS Detalle,

        h.ValorIni AS Bien,

        i.ValorIni AS Comprobante,

        f.NroDocumento AS RUC,

        a.Serie,

        j.ValorIni AS TipoPago,

        CONVERT(
            VARCHAR(10),
            COALESCE(
                TRY_CONVERT(DATE, NULLIF(LTRIM(RTRIM(a.FecEmision)), ''), 101),
                TRY_CONVERT(DATE, NULLIF(LTRIM(RTRIM(a.FecEmision)), ''), 103),
                TRY_CONVERT(DATE, NULLIF(LTRIM(RTRIM(a.FecEmision)), ''), 23)
            ),
            103
        ) AS FecEmision,

        k.ValorIni AS Moneda,

        a.Subtotal AS Subtotalb,

        a.Igv AS Igvb,

        a.Total AS Totalb,

        CASE
            WHEN a.TipoMoneda = 1 THEN a.Subtotal
            ELSE a.Subtotal * 3.8
        END AS Subtotal,

        CASE
            WHEN a.TipoMoneda = 1 THEN a.Igv
            ELSE a.Igv * 3.8
        END AS IGV,

        CASE
            WHEN a.TipoMoneda = 1 THEN a.Total
            ELSE a.Total * 3.8
        END AS Total,

        l.ValorIni AS Rendicion,

        a.Observacion,

        a.Comentario,

        CASE
            WHEN ISNULL(a.IdWeb, 0) = 1
                THEN SolCjWeb.NombreEmpleado
            ELSE
                SolCjOld.NombreEmpleado
        END AS Solicitante,

        n.NombreEmpleado AS Gestor,

        o.NombreEmpleado AS Validador,

        p.NombreEmpleado AS Ejecutor,

        q.ValorIni AS Transferencia,

        r.ValorIni AS Banco,

        s.ValorIni AS Moneda2,

        t.ValorIni AS Rendir,

        CONVERT(
            VARCHAR(10),
            COALESCE(
                TRY_CONVERT(DATE, NULLIF(LTRIM(RTRIM(a.FechaDeposito)), ''), 23),
                TRY_CONVERT(DATE, NULLIF(LTRIM(RTRIM(a.FechaDeposito)), ''), 101),
                TRY_CONVERT(DATE, NULLIF(LTRIM(RTRIM(a.FechaDeposito)), ''), 103)
            ),
            103
        ) AS FechaDeposito,

        u.ValorIni AS Detraccion,

        a.Otro,
        a.Otro2,
        a.Otro3,
        a.Otro4,

        a.Estado,

        CONVERT(
            VARCHAR(10),
            COALESCE(
                TRY_CONVERT(DATE, NULLIF(LTRIM(RTRIM(a.FechaPropuesta)), ''), 101),
                TRY_CONVERT(DATE, NULLIF(LTRIM(RTRIM(a.FechaPropuesta)), ''), 103),
                TRY_CONVERT(DATE, NULLIF(LTRIM(RTRIM(a.FechaPropuesta)), ''), 23)
            ),
            103
        ) AS FechaPropuesta,

        a4.Cuenta,

        a4.CuentaInter,

        a4.NombreCta,

        v.ValorIni AS BancoCta,

        a.Correlativo AS Correlativo,

        w.ValorIni AS EstadoPla,

        a.IdProyecto,

        w.Correlativo AS IdEstadoPlanilla,

        a.IdResponsable,

        a.IdSite,

        a.Usuario,

        a.Ot,

        a.IdCliente,

        CONVERT(
            VARCHAR(10),
            COALESCE(
                TRY_CONVERT(DATE, NULLIF(LTRIM(RTRIM(a.FechaCreacion)), ''), 101),
                TRY_CONVERT(DATE, NULLIF(LTRIM(RTRIM(a.FechaCreacion)), ''), 103),
                TRY_CONVERT(DATE, NULLIF(LTRIM(RTRIM(a.FechaCreacion)), ''), 23)
            ),
            103
        ) AS FechaCreacion,

        a.IdTarea,

        a.IdBancoCta,

        a.IdBien,

        a.IdComprobante,

        a.IdTipoPago,

        a.TipoMoneda,

        a.IdRendicion,

        a.IdSolicitante,

        a.IdGestor,

        a.IdValidador,

        a.HoraCreacion,

        a.Responsable AS NomResponsable,

        SolEmp.Telefono AS Telefono,

        a.IdUrgente,

        x.Usuario AS UsuarioObs,

        y.ValorIni AS FormaPago,

        a.IdTipoDoc,

        a.Fila,

        a.imgfactura,

        a.NroOperacion,

        z.Atp,

        z.Status_Pap,

        a3.ValorIni AS Status_Claro,

        a.IdTransferencia,

        b.NombreProyecto,

        c.NombreSite AS Site,

        f.IdCheque,

        CASE
            WHEN c.Correlativo IS NULL THEN 1
            ELSE c.Correlativo
        END AS CorSite,

        a.Tipo_Trabajo,

        e.ValorIni AS Tarea,

        f.NombreEmpleado AS Responsable,

        g.NombreCliente AS Cliente,

        CONVERT(
            VARCHAR(10),
            COALESCE(
                TRY_CONVERT(
                    DATE,
                    NULLIF(
                        NULLIF(LTRIM(RTRIM(a.FechaAprobador)), ''),
                        '01/00/1900'
                    ),
                    103
                ),
                TRY_CONVERT(
                    DATE,
                    NULLIF(
                        NULLIF(LTRIM(RTRIM(a.FechaAprobador)), ''),
                        '01/00/1900'
                    ),
                    101
                ),
                TRY_CONVERT(
                    DATE,
                    NULLIF(
                        NULLIF(LTRIM(RTRIM(a.FechaAprobador)), ''),
                        '01/00/1900'
                    ),
                    23
                )
            ),
            103
        ) AS FechaAprobador,

        CONVERT(
            VARCHAR(10),
            TRY_CONVERT(DATE, a.FechaReAprobador),
            103
        ) AS FechaReAprobador,

        a.RevisionPm,

        a.RevisionPmAprobar,

        a5.IdAprobador3,

        a5.IdEstado AS IdEstadoOc,

        CASE
            WHEN a5.IdEstado = 0 THEN 'CREADA'
            WHEN a5.IdEstado = 1 THEN 'APROBADO'
            WHEN a5.IdEstado = 6 THEN 'RECHAZADO'
            ELSE 'SIN ESTADO'
        END AS EstadoOc,

        a.IdOc,

        a.IdAnticipo,

        a.MontoRetencion,

        a.TotalPagar,

        a.IdRegularizar,

        CONVERT(
            VARCHAR(10),
            TRY_CONVERT(DATE, a.FechaPagoCre),
            103
        ) AS FechaPagoCre


    FROM Planilla a


    LEFT JOIN CuentaEmpleado a4
        ON a4.IdEmpleado = a.IdResponsable


    LEFT JOIN Constante e
        ON e.Sociedad = 'PE01'
       AND e.Programa = 'PLANTILLA'
       AND e.Campo = 'TAREA'
       AND a.IdTarea = e.Correlativo


    LEFT JOIN Empleado f
        ON f.IdEmpleado = a.IdResponsable
       AND f.IdCargo IN (10,11,83)


    LEFT JOIN Cliente g
        ON g.IdCliente = a.IdCliente


    LEFT JOIN Constante h
        ON h.Sociedad = 'PE01'
       AND h.Programa = 'PLANTILLA'
       AND h.Campo = 'TIPO_BIEN'
       AND a.IdBien = h.Correlativo


    LEFT JOIN Constante i
        ON i.Sociedad = 'PE01'
       AND i.Programa = 'PLANTILLA'
       AND i.Campo = 'TIPO_COMPROBANTE'
       AND a.IdComprobante = i.Correlativo


    LEFT JOIN Constante j
        ON j.Sociedad = 'PE01'
       AND j.Programa = 'PLANTILLA'
       AND j.Campo = 'TIPO_PAGO'
       AND a.IdTipoPago = j.Correlativo


    LEFT JOIN Constante k
        ON k.Sociedad = 'PE01'
       AND k.Programa = 'PLANTILLA'
       AND k.Campo = 'TIPO_MONEDA'
       AND a.TipoMoneda = k.Correlativo


    LEFT JOIN Constante l
        ON l.Sociedad = 'PE01'
       AND l.Programa = 'PLANTILLA'
       AND l.Campo = 'RENDICION'
       AND a.IdRendicion = l.Correlativo


    /* ============================================================
       SOLICITANTE - SISTEMA ANTIGUO
       IdWeb = 0 / NULL

       Planilla.IdSolicitante
           -> Empleado.IdEmpleado
           -> Empleado.IdEmpleadoCj
           -> EmpleadoCj.IdEmpleado
       ============================================================ */

    LEFT JOIN dbo.Empleado SolEmp
        ON SolEmp.IdEmpleado = a.IdSolicitante
       AND ISNULL(a.IdWeb, 0) <> 1


    LEFT JOIN dbo.EmpleadoCj SolCjOld
        ON SolCjOld.IdEmpleado = SolEmp.IdEmpleadoCj
       AND ISNULL(a.IdWeb, 0) <> 1


    /* ============================================================
       SOLICITANTE - WEB
       IdWeb = 1

       Planilla.IdSolicitante
           -> EmpleadoCj.IdEmpleado
       ============================================================ */

    LEFT JOIN dbo.EmpleadoCj SolCjWeb
        ON SolCjWeb.IdEmpleado = a.IdSolicitante
       AND ISNULL(a.IdWeb, 0) = 1


    LEFT JOIN Empleado n
        ON n.IdEmpleado = a.IdGestor


    LEFT JOIN Empleado o
        ON o.IdEmpleado = a.IdValidador


    LEFT JOIN Empleado p
        ON p.IdEmpleado = a.IdEjecutor


    LEFT JOIN Constante q
        ON q.Sociedad = 'PE01'
       AND q.Programa = 'PLANTILLA'
       AND q.Campo = 'TIPO_TRANSFERENCIA'
       AND a.IdTransferencia = q.Correlativo


    LEFT JOIN Constante r
        ON r.Campo = 'BANCO_emp'
       AND a4.IdBanco = r.Correlativo


    LEFT JOIN Constante s
        ON s.Sociedad = 'PE01'
       AND s.Programa = 'PLANTILLA'
       AND s.Campo = 'TIPO_MONEDA'
       AND a.IdMoneda2 = s.Correlativo


    LEFT JOIN Constante t
        ON t.Sociedad = 'PE01'
       AND t.Programa = 'PLANTILLA'
       AND t.Campo = 'ESTADO_RENDIR'
       AND a.IdRendir = t.Correlativo


    LEFT JOIN Constante u
        ON u.Sociedad = 'PE01'
       AND u.Programa = 'PLANTILLA'
       AND u.Campo = 'DETRACCION'
       AND a.IdRetencion = u.Correlativo


    LEFT JOIN Constante v
        ON v.Sociedad = 'PE01'
       AND v.Programa = 'PLANTILLA'
       AND v.Campo = 'BANCO'
       AND a4.IdBanco = v.Correlativo


    LEFT JOIN Constante w
        ON w.Sociedad = 'PE01'
       AND w.Programa = 'MAESTRO'
       AND w.Campo = 'ESTADO'
       AND a.Estado = w.Correlativo


    LEFT JOIN Site c
        ON a.IdSite = c.IdSite
       AND a.CorreSite = c.Correlativo


    LEFT JOIN MovEstadosPagos x
        ON a.Correlativo = x.Correlativo
       AND x.Estado = 2


    LEFT JOIN Constante y
        ON y.Campo = 'FORMA_PAGO'
       AND y.Correlativo = a.IdTipoDoc


    LEFT JOIN Importar z
        ON z.IdCliente = a.IdCliente
       AND z.IdProyecto = a.IdProyecto
       AND z.IdSite = a.IdSite
       AND z.Correlativo = a.CorreSite
       AND z.TipoTrabajo = a.Tipo_Trabajo
       AND z.OT = a.OT
       AND a.IdCliente = 2
       AND z.IdEstado = 1


    LEFT JOIN Db_Operaciones_Cj a2
        ON a2.IdCliente = a.IdCliente
       AND a2.IdProyecto = a.IdProyecto
       AND a2.IdSite = a.IdSite
       AND a2.CorreSite = a.CorreSite
       AND a2.OT = a.OT


    LEFT JOIN Constante a3
        ON a3.Campo = 'OPE_STATUS_CLARO'
       AND a3.Correlativo = a2.Status_Claro


    LEFT JOIN DetOrdenCompra a5
        ON a5.IdOc = a.IdOc
       AND a.IdCliente = a5.IdCliente
       AND a.IdProyecto = a5.IdProyecto
       AND a.IdSite = a5.IdSite
       AND a5.Correlativo = a.CorreSite


    INNER JOIN Proyecto b
        ON a.IdProyecto = b.IdProyecto


    WHERE

        /* ===========================
           FILTRO ESTADO
           =========================== */
        (
            @IdEstado IS NULL
            OR a.Estado = @IdEstado
        )


        /* ===========================
           FILTRO CORRELATIVO
           =========================== */
        AND
        (
            @Correlativo IS NULL
            OR a.Correlativo = @Correlativo
        )


        /* ===========================
           FILTRO CLIENTE
           =========================== */
        AND
        (
            @IdCliente IS NULL
            OR a.IdCliente = @IdCliente
        )


        /* ===========================
           FILTRO MONEDA
           =========================== */
        AND
        (
            @TipoMoneda IS NULL
            OR a.TipoMoneda = @TipoMoneda
        )


        /* ===========================
           FILTRO COMPROBANTE
           =========================== */
        AND
        (
            @IdComprobante IS NULL
            OR a.IdComprobante = @IdComprobante
        )


        /* ===========================
           FILTRO BANCO
           =========================== */
        AND
        (
            @IdBanco IS NULL
            OR a4.IdBanco = @IdBanco
        )


        /* ===========================
           FILTRO RESPONSABLE
           =========================== */
        AND
        (
            @IdResponsable IS NULL
            OR a.IdResponsable = @IdResponsable
        )


        /* ===========================
           FILTRO SOLICITANTE

           IdWeb = 1
               Buscar por EmpleadoCj.IdEmpleado

           IdWeb = 0 / NULL
               Buscar por Empleado.IdEmpleadoCj
           =========================== */
        AND
        (
            @IdSolicitante IS NULL

            OR

            @IdSolicitante =
                CASE
                    WHEN ISNULL(a.IdWeb, 0) = 1
                        THEN SolCjWeb.IdEmpleado
                    ELSE
                        SolEmp.IdEmpleadoCj
                END
        )


        /* ===========================
           FILTRO ORDEN DE COMPRA
           =========================== */
        AND
        (
            @IdOc IS NULL
            OR a.IdOc = @IdOc
        )


        /* =============================================
           FILTRO DE FECHAS  (UNICO BLOQUE MODIFICADO)

           Sin @FechaInicio ni @FechaFin: sin filtro de fecha
           (igual que antes, incluye filas con fecha vacia).
           Con alguna: se compara contra las columnas DATE
           (sargables). Rango: [@FechaInicio, @FechaFin] inclusive.
           ============================================= */
        AND
        (
            (@FechaInicio IS NULL AND @FechaFin IS NULL)

            OR

            /* Estado 4: FECHA DE DEPOSITO */
            (
                @IdEstado = 4
                AND a.FechaDepositoDate >= ISNULL(@FechaInicio, '00010101')
                AND a.FechaDepositoDate <  DATEADD(DAY, 1, ISNULL(@FechaFin, '99991230'))
            )

            OR

            /* Sin estado (todos) u otro estado distinto de 4: FECHA DE INGRESO (igual que antes) */
            (
                (@IdEstado IS NULL OR @IdEstado <> 4)
                AND a.FecIngresoDate >= ISNULL(@FechaInicio, '00010101')
                AND a.FecIngresoDate <  DATEADD(DAY, 1, ISNULL(@FechaFin, '99991230'))
            )
        )


    ORDER BY

        a.Correlativo DESC;

    /* Opcional (probar por separado): OPTION (RECOMPILE) permite que el optimizador use
       los indices con los valores reales de cada llamada, a cambio de compilar en cada
       ejecucion. Solo agregarlo si el tiempo de compilacion medido es bajo. */

END
GO
