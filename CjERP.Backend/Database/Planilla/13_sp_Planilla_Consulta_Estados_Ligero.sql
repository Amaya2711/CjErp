/* ================================================================
   dbo.sp_Planilla_Consulta_Estados_Ligero  (NUEVO; NO reemplaza sp_Planilla_Consulta_Estados)

   Primer pintado de la grilla de pagos_v2: mismas columnas, mismos filtros y misma firma que
   sp_Planilla_Consulta_Estados (script Planilla/11), pero SIN los calculos financieros agregados
   (totales pagados por OT/sitio, Importar, consumo de OC por IdOc+Fila, agrupacion bancaria,
   suma por responsable). Esas columnas salen en 0/NULL (TotalPagar/TotalPlanillaBase = TotalPagar del
   recibo) y se completan despues con dbo.sp_Planilla_Consulta_Estados_Totales (script 14), solo para los
   correlativos mostrados.

   - Filtros (Etapa 1) y datos descriptivos (Etapa 2) identicos a los del script 11.
   - Montos Subtotal/IGV/Total en la moneda REAL del recibo (regla critica de AGENTS.md).
   - Requiere trg_Planilla_SincronizarFechasDate (Finanzas/03): usa FecIngresoDate/FechaDepositoDate.
   - PV: NO ejecutado en la BD real. Validar equivalencia con 16_validacion_ligero_totales_SoloLectura.sql.
   Idempotente (CREATE OR ALTER). Ejecutar en JC_Db.
   ================================================================ */
USE [JC_Db]
GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE OR ALTER PROCEDURE [dbo].[sp_Planilla_Consulta_Estados_Ligero]
(
    @IdCargo        INT = NULL,
    @IdEmpleado     INT = NULL,
    @IdValidador    INT = NULL,
    @IdBanco        INT = NULL,
    @Estados        VARCHAR(50) = NULL,
    @OT             VARCHAR(50) = NULL,
    @IdOc           VARCHAR(50) = NULL,
    @Fila           VARCHAR(50) = NULL,
    @IdSite         VARCHAR(50) = NULL,
    @CorSite        VARCHAR(50) = NULL,
    @IdCliente      INT = NULL,
    @IdProyecto     INT = NULL,
    @TipoTrabajo    VARCHAR(150) = NULL,
    @FechaInicio    DATE = NULL,
    @FechaFin       DATE = NULL,
    @FechaDeposito  DATE = NULL,
    @TextoBusqueda  VARCHAR(200) = NULL,
    @Correlativo    INT = NULL,
    @TipoCambioUSD  DECIMAL(18, 6) = NULL,
    @TipoCambioEUR  DECIMAL(18, 6) = NULL,
    @TipoCambioDOP  DECIMAL(18, 6) = NULL,
    @TipoCambioCOP  DECIMAL(18, 6) = NULL,
    @IncluirSumaResp BIT = 0,
    @ModoLiviano     BIT = 0,
    @SoloSumaResp    BIT = 0,
    @IdTarea         INT = NULL,
    @IdResponsable   VARCHAR(MAX) = NULL
)
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @FiltrarPorSolicitante BIT = CASE WHEN @IdEmpleado IS NULL THEN 0 ELSE 1 END;
    DECLARE @IdEmpleado2 VARCHAR(MAX) = '0';
    DECLARE @IncluyeEstado4 BIT = 0;
    DECLARE @EstadosFiltro TABLE (Estado INT PRIMARY KEY);
    DECLARE @EmpleadosFiltro TABLE (IdEmpleado INT PRIMARY KEY);
    DECLARE @ResponsablesFiltro TABLE (IdResponsable INT PRIMARY KEY);

    -- Tipos de cambio a soles (los de la pantalla; por defecto los de pagos_v2).
    DECLARE @TcUsd DECIMAL(18, 6) = CASE WHEN ISNULL(@TipoCambioUSD, 0) > 0 THEN @TipoCambioUSD ELSE 3.80 END;
    DECLARE @TcEur DECIMAL(18, 6) = CASE WHEN ISNULL(@TipoCambioEUR, 0) > 0 THEN @TipoCambioEUR ELSE 3.80 END;
    DECLARE @TcDop DECIMAL(18, 6) = CASE WHEN ISNULL(@TipoCambioDOP, 0) > 0 THEN @TipoCambioDOP ELSE 0.057 END;
    DECLARE @TcCop DECIMAL(18, 6) = CASE WHEN ISNULL(@TipoCambioCOP, 0) > 0 THEN @TipoCambioCOP ELSE 0.001 END;

    INSERT INTO @EstadosFiltro (Estado)
    SELECT DISTINCT TRY_CAST(LTRIM(RTRIM(value)) AS INT)
    FROM STRING_SPLIT(@Estados, ',')
    WHERE TRY_CAST(LTRIM(RTRIM(value)) AS INT) IS NOT NULL;

    INSERT INTO @ResponsablesFiltro (IdResponsable)
    SELECT DISTINCT TRY_CAST(LTRIM(RTRIM(value)) AS INT)
    FROM STRING_SPLIT(@IdResponsable, ',')
    WHERE TRY_CAST(LTRIM(RTRIM(value)) AS INT) IS NOT NULL;

    IF @IdEmpleado IS NOT NULL
    BEGIN
        SELECT @IdEmpleado2 =
            ISNULL(
                STRING_AGG(CONVERT(VARCHAR(20), b.IdEmpleado), ','),
                '0'
            )
        FROM EmpleadoCj a
        LEFT JOIN Empleado b
            ON a.IdEmpleado = b.IdEmpleadoCj
        WHERE a.IdEmpleado = @IdEmpleado
          AND b.IdEmpleado IS NOT NULL;
    END;

    IF EXISTS (
        SELECT 1
        FROM dbo.Constante
        WHERE Campo = 'PERMISOS'
          AND (
                TRY_CONVERT(INT, Correlativo) = @IdCargo
             OR TRY_CONVERT(INT, ValorIni) = @IdCargo
          )
    )
    BEGIN
        SET @FiltrarPorSolicitante = 0;
    END;

    IF EXISTS (
        SELECT 1
        FROM @EstadosFiltro
        WHERE Estado = 4
    )
    BEGIN
        SET @IncluyeEstado4 = 1;
    END;

    INSERT INTO @EmpleadosFiltro (IdEmpleado)
    SELECT DISTINCT TRY_CAST(LTRIM(RTRIM(value)) AS INT)
    FROM STRING_SPLIT(@IdEmpleado2, ',')
    WHERE TRY_CAST(LTRIM(RTRIM(value)) AS INT) IS NOT NULL;

    -- ================================================================
    -- CONSULTA FINAL POR ETAPAS (antes era UN SELECT de ~40 joins que tardaba 9-18 s SOLO en compilarse
    -- cada vez que el plan se recompilaba; medido con 07_diagnostico). Cada etapa es pequena y compila en ms.
    -- ================================================================

    -- Etapa 1: recibos filtrados (solo filtros que dependen de Planilla; sin joins).
    SELECT
        a.FecIngreso, a.Detalle, a.Subtotal, a.Igv, a.Total, a.TipoMoneda, a.Comentario, a.IdWeb,
        a.IdSolicitante, a.IdGestor, a.IdValidador, a.FechaDeposito, a.Estado, a.Correlativo,
        a.IdProyecto, a.IdResponsable, a.IdSite, a.CorreSite, a.Usuario, a.Ot, a.IdCliente, a.IdBien,
        a.IdComprobante, a.IdTipoPago, a.IdRendicion, a.HoraCreacion, a.Responsable, a.IdTipoDoc, a.Fila,
        a.IdTransferencia, a.Tipo_Trabajo, a.IdOc, a.MontoRetencion, a.TotalPagar, a.IdTarea, a.imgFactura,
        a.idprovisional, a.serie, a.NroOperacion, a.Observacion, a.IdBanco, a.FechaReaprobador,
        -- OT del recibo normalizada; sin OT (vacia, 0 o NULL) los totales se toman del sitio.
        CASE WHEN UPPER(LTRIM(RTRIM(ISNULL(CONVERT(VARCHAR(50), a.OT), '')))) IN ('', '0', 'NULL') THEN '' ELSE LTRIM(RTRIM(CONVERT(VARCHAR(50), a.OT))) END AS OtNorm,
        CASE WHEN UPPER(LTRIM(RTRIM(ISNULL(CONVERT(VARCHAR(50), a.OT), '')))) IN ('', '0', 'NULL') THEN 0 ELSE 1 END AS OtValida
    INTO #B
    FROM Planilla a
    WHERE (
        NULLIF(LTRIM(RTRIM(@Estados)), '') IS NULL
        OR EXISTS (
        SELECT 1
        FROM @EstadosFiltro estadoFiltro
        WHERE estadoFiltro.Estado = a.Estado
        )
    )
    AND (@Correlativo IS NULL OR a.Correlativo = @Correlativo)
    AND (@IdValidador IS NULL OR a.IdValidador = @IdValidador)
    AND (
        @IdBanco IS NULL
        OR a.IdBanco = @IdBanco
    )
    AND (
        NULLIF(LTRIM(RTRIM(@TextoBusqueda)), '') IS NOT NULL
        OR
        @FechaInicio IS NULL
        OR (
            @IncluyeEstado4 = 1
            AND a.FechaDeposito IS NOT NULL
            AND a.FechaDepositoDate >= @FechaInicio
        )
        OR (
            @IncluyeEstado4 = 0
            AND a.FecIngresoDate >= @FechaInicio
        )
    )
    AND (
        NULLIF(LTRIM(RTRIM(@TextoBusqueda)), '') IS NOT NULL
        OR
        @FechaFin IS NULL
        OR (
            @IncluyeEstado4 = 1
            AND a.FechaDeposito IS NOT NULL
            AND a.FechaDepositoDate < DATEADD(DAY, 1, @FechaFin)
        )
        OR (
            @IncluyeEstado4 = 0
            AND a.FecIngresoDate < DATEADD(DAY, 1, @FechaFin)
        )
    )
    AND (
        @FechaDeposito IS NULL
        OR (
            a.FechaDeposito IS NOT NULL
            AND a.FechaDepositoDate >= @FechaDeposito
            AND a.FechaDepositoDate < DATEADD(DAY, 1, @FechaDeposito)
        )
    )
    AND (
        @OT IS NULL
        OR LTRIM(RTRIM(ISNULL(a.Ot, ''))) = LTRIM(RTRIM(@OT))
    )
    AND (
        @IdOc IS NULL
        OR LTRIM(RTRIM(ISNULL(a.IdOc, ''))) = LTRIM(RTRIM(@IdOc))
    )
    AND (
        @Fila IS NULL
        OR LTRIM(RTRIM(ISNULL(CONVERT(VARCHAR(50), a.Fila), ''))) = LTRIM(RTRIM(@Fila))
    )
    AND (
        @IdSite IS NULL
        OR LTRIM(RTRIM(ISNULL(a.IdSite, ''))) = LTRIM(RTRIM(@IdSite))
    )
    AND (
        @IdCliente IS NULL
        OR a.IdCliente = @IdCliente
    )
    AND (
        @IdProyecto IS NULL
        OR a.IdProyecto = @IdProyecto
    )
    AND (
        @TipoTrabajo IS NULL
        OR LTRIM(RTRIM(ISNULL(a.Tipo_Trabajo, ''))) = LTRIM(RTRIM(@TipoTrabajo))
    )
    AND (
        @CorSite IS NULL
        OR a.CorreSite = TRY_CONVERT(INT, @CorSite)
    )
    AND (
        @IdTarea IS NULL
        OR a.IdTarea = @IdTarea
    )
    AND (
        NULLIF(LTRIM(RTRIM(@IdResponsable)), '') IS NULL
        OR EXISTS (
            SELECT 1
            FROM @ResponsablesFiltro rf
            WHERE rf.IdResponsable = a.IdResponsable
        )
    )
    OPTION (RECOMPILE);

    -- Etapa 2: datos descriptivos (catalogos, empleados, sitio, OC, Importar). Las columnas que dependen
    -- de los totales (etapas 3-6) salen en 0/NULL y se completan con UPDATE.
    SELECT DISTINCT
        CONVERT(VARCHAR(10), a.FecIngreso, 103) AS FecIngreso,
        CAST(a.Detalle AS VARCHAR(MAX)) AS Detalle,
        a4.cuenta AS Cuenta,
        a4.cuentainter AS CuentaInter,
        h.ValorIni AS Bien,
        i.ValorIni AS Comprobante,
        ban.ValorIni AS Banco,
        f_emp.NroDocumento AS RUC,
        k.ValorIni AS Moneda,
        CAST(0 AS DECIMAL(18, 2)) AS TotalSubtotalPorMoneda,
        CAST(0 AS DECIMAL(18, 2)) AS TotalMontoBckPorMoneda,
        CAST(0 AS DECIMAL(18, 2)) AS TotalMontoVisiblePorMoneda,
        CAST(0 AS DECIMAL(18, 2)) AS TotalPagadoConvertidoSoles,
        CAST(NULL AS VARCHAR(8000)) AS MonedasPagadoOt,
        CAST(NULL AS VARCHAR(8000)) AS MonedasImportarOt,
        CAST(0 AS DECIMAL(18, 2)) AS TotalMontoBckSoles,
        CAST(0 AS DECIMAL(18, 2)) AS TotalMontoVisibleSoles,
        zimp.Atp AS Atp,
        zimp.Status_Pap AS Status_Pap,
        -- Subtotal / IGV / Total en la MONEDA REAL del recibo (TipoMoneda <> 1 NO se convierte).
        a.Subtotal AS Subtotal,
        a.Igv AS IGV,
        a.Total AS Total,
        -- Equivalente en soles con el tipo de cambio de la pantalla (moneda no soportada: sin conversion).
        CAST(a.Subtotal * CASE a.TipoMoneda WHEN 2 THEN @TcUsd WHEN 3 THEN @TcEur WHEN 4 THEN @TcDop WHEN 5 THEN @TcCop ELSE 1 END AS DECIMAL(18, 2)) AS SubtotalSoles,
        CAST(a.Igv * CASE a.TipoMoneda WHEN 2 THEN @TcUsd WHEN 3 THEN @TcEur WHEN 4 THEN @TcDop WHEN 5 THEN @TcCop ELSE 1 END AS DECIMAL(18, 2)) AS IGVSoles,
        CAST(a.Total * CASE a.TipoMoneda WHEN 2 THEN @TcUsd WHEN 3 THEN @TcEur WHEN 4 THEN @TcDop WHEN 5 THEN @TcCop ELSE 1 END AS DECIMAL(18, 2)) AS TotalSoles,
        a.Comentario,
        -- Solicitante: IdWeb = 1 -> Planilla.IdSolicitante se compara con EmpleadoCj.IdEmpleado; IdWeb <> 1 ->
        -- se busca en Empleado.IdEmpleado y luego Empleado.IdEmpleadoCj contra EmpleadoCj.IdEmpleado. Se muestra
        -- EmpleadoCj.NombreEmpleado (si no hay puente a EmpleadoCj, el nombre de Empleado).
        COALESCE(m_cj.NombreEmpleado, m_emp.NombreEmpleado) AS Solicitante,
        CASE
            WHEN ISNULL(a.IdWeb, 0) = 1 THEN p_cj.NombreEmpleado
            ELSE p_emp.NombreEmpleado
        END AS GEstor,
        CASE
            WHEN ISNULL(a.IdWeb, 0) = 1 THEN o_cj.NombreEmpleado
            ELSE o_emp.NombreEmpleado
        END AS Validador,
        CONVERT(VARCHAR(10), a.FechaDeposito, 103) AS FechaDeposito,
        a.Estado,
        COALESCE(NULLIF(LTRIM(RTRIM(w.ValorIni)), ''), CONVERT(VARCHAR(20), a.Estado)) AS EstadoNombre,
        a.Correlativo AS Corre,
        a.IdProyecto,
        w.Correlativo,
        a.IdResponsable,
        a.IdSite,
        a.Usuario,
        a.Ot,
        a.IdCliente,
        a.IdBien,
        a.IdComprobante,
        a.IdTipoPago,
        a.TipoMoneda,
        a.IdRendicion,
        a.IdSolicitante,
        a.IdValidador,
        a.IdGestor,
        -- Codigos EmpleadoCj de solicitante/gestor/validador: IdWeb=1 ya los guarda asi; en gastos antiguos
        -- se obtienen con el puente Empleado.IdEmpleadoCj (la pantalla los usa para cargar los combos).
        CASE WHEN ISNULL(a.IdWeb, 0) = 1 THEN a.IdSolicitante ELSE m_emp.IdEmpleadoCj END AS IdSolicitanteCj,
        CASE WHEN ISNULL(a.IdWeb, 0) = 1 THEN a.IdGestor ELSE p_emp.IdEmpleadoCj END AS IdGestorCj,
        CASE WHEN ISNULL(a.IdWeb, 0) = 1 THEN a.IdValidador ELSE o_emp.IdEmpleadoCj END AS IdValidadorCj,
        a.HoraCreacion,
        a.Responsable AS NomResponsable,
        a.IdTipoDoc,
        a.Fila,
        a.IdTransferencia,
        b.NombreProyecto,
        c.NombreSite AS Site,
        CASE
            WHEN c.Correlativo IS NULL THEN 1
            ELSE c.Correlativo
        END AS CorSite,
        a.Tipo_Trabajo,
        f_emp.NombreEmpleado AS Responsable,
        g.NombreCliente AS Cliente,
        a.IdOc,
        coc.IdEstado AS IdEstadoOc,
        -- Semaforo de la OC (columna "Est." de pagos_v1/v2): R rechazada | A aprobada |
        -- 3, 2, 1 = en la N-esima aprobacion | P pre-aprobacion (misma regla que sp_IA_Planilla_Buscar v2).
        CASE
            WHEN coc.IdEstado = 6 THEN 'R'
            WHEN ISNULL(coc.IdAprobador3, 0) > 0 THEN 'A'
            WHEN ISNULL(coc.IdAprobador2, 0) > 0 THEN '3'
            WHEN ISNULL(coc.IdAprobador1, 0) > 0 THEN '2'
            WHEN ISNULL(coc.IdGestor, 0) > 0 THEN '1'
            ELSE 'P'
        END AS EstadoOcSemaforo,
        CAST(COALESCE(coc.Subtotal, 0) AS DECIMAL(18, 2)) AS TotalOcConsumo,
        CAST(0 AS DECIMAL(18, 2)) AS PagadoOcConsumo,
        a.MontoRetencion,
        a.TotalPagar AS TotalPagarOriginal,
        a.TotalPagar AS TotalPlanillaBase,
        a.TotalPagar AS TotalPagar,
        a.IdTarea,
        e.ValorIni AS Tarea,
        a.imgFactura,
        a.idprovisional,
        s1.fechaInicio,
        w.ValorIni AS NombreEstado,
        a.serie,
        a.NroOperacion,
        a.FechaReaprobador,
        CAST(a.Observacion AS VARCHAR(MAX)) AS ObservacionPlanilla,
        CAST(a.Observacion AS VARCHAR(MAX)) AS Observacion,
        a.Subtotal AS SubtotalOriginal,
        a.Igv AS IgvOriginal,
        a.Total AS TotalOriginal,
        CAST(0 AS DECIMAL(18, 2)) AS SumaEmp,
        CAST(0 AS DECIMAL(18, 2)) AS SumaEmpSolesNativo,
        CAST(0 AS DECIMAL(18, 2)) AS SumaEmpUsdNativo,
        CAST(0 AS DECIMAL(18, 2)) AS SumaEmpEurNativo,
        CAST(0 AS DECIMAL(18, 2)) AS SumaEmpDopNativo,
        CAST(0 AS DECIMAL(18, 2)) AS SumaEmpCopNativo,
        CAST(0 AS INT) AS CantRecibosEmp,
        -- Consumo de la OC por IdOc + Fila (DetOrdenCompra): total de la linea y pagado (Estado 4) de esa fila.
        -- TotalOcFila se calcula aqui; PagadoOcFila se completa en la Etapa 5.
        CAST(ISNULL(det_oc.TotalOcFila, 0) AS DECIMAL(18, 2)) AS TotalOcFila,
        CAST(0 AS DECIMAL(18, 2)) AS PagadoOcFila,
        -- columnas auxiliares para las etapas siguientes (no salen en el resultado final)
        a.OtNorm AS h_OtNorm,
        a.OtValida AS h_OtValida,
        a.CorreSite AS h_CorreSite
    INTO #R
    FROM #B a
    LEFT JOIN CuentaEmpleado a4
        ON a4.IdEmpleado = a.IdResponsable
    LEFT JOIN Constante e
        ON e.Sociedad = 'PE01'
       AND e.Programa = 'PLANTILLA'
       AND e.Campo = 'TAREA'
       AND a.IdTarea = e.Correlativo
    LEFT JOIN Empleado f_emp
        ON f_emp.IdEmpleado = a.IdResponsable
       AND f_emp.IdCargo IN (10, 11, 83)
    LEFT JOIN Cliente g
        ON g.IdCliente = a.IdCliente
    LEFT JOIN dbo.CabOrdenCompra coc
        ON coc.IdOc = TRY_CONVERT(INT, a.IdOc)
    -- Total de la linea de la OC (IdOc + Fila): mismo calculo que OrdenCompraService (SubtotalD).
    OUTER APPLY (
        SELECT SUM(ISNULL(det.Cantidad, 0) * ISNULL(det.PrecioUnitario, 0)) AS TotalOcFila
        FROM dbo.DetOrdenCompra det
        WHERE det.IdOc = TRY_CONVERT(INT, a.IdOc)
          AND det.Fila = a.Fila
    ) det_oc
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
    LEFT JOIN Constante ban
        ON ban.Sociedad = 'PE01'
       AND ban.Programa = 'PLANTILLA'
       AND ban.Campo = 'BANCO'
       AND a.IdBanco = ban.Correlativo
    -- ATP y Status PAP: solo AMX (cliente 2) desde Importar, igual que sp_Planilla_ConsultaIni.
    LEFT JOIN dbo.Importar zimp
        ON a.IdCliente = 2
       AND zimp.IdCliente = a.IdCliente
       AND zimp.IdProyecto = a.IdProyecto
       AND zimp.IdSite = a.IdSite
       AND zimp.Correlativo = a.CorreSite
       AND zimp.TipoTrabajo = a.Tipo_Trabajo
       AND zimp.OT = a.OT
       AND zimp.IdEstado = 1
    LEFT JOIN Constante k
        ON k.Sociedad = 'PE01'
       AND k.Programa = 'PLANTILLA'
       AND k.Campo = 'TIPO_MONEDA'
       AND a.TipoMoneda = k.Correlativo
    -- Un mismo IdEmpleado puede tener varias filas en Empleado (distinto cargo): se toma una sola, con
    -- puente a EmpleadoCj y prefiriendo cargo 10, 11, 83 (mismo criterio que sp_OrdenCompra_BuscarCabecera).
    OUTER APPLY (
        SELECT TOP 1 e.IdEmpleadoCj, e.NombreEmpleado
        FROM Empleado e
        WHERE e.IdEmpleado = a.IdSolicitante
          AND ISNULL(a.IdWeb, 0) <> 1
        ORDER BY CASE WHEN ISNULL(e.IdEmpleadoCj, 0) > 0 THEN 0 ELSE 1 END,
                 CASE e.IdCargo WHEN 10 THEN 1 WHEN 11 THEN 2 WHEN 83 THEN 3 ELSE 99 END,
                 e.IdEmpleadoCj
    ) m_emp
    LEFT JOIN EmpleadoCj m_cj
        ON m_cj.IdEmpleado = CASE WHEN ISNULL(a.IdWeb, 0) = 1 THEN a.IdSolicitante ELSE m_emp.IdEmpleadoCj END
    LEFT JOIN Empleado o_emp
        ON o_emp.IdEmpleado = a.IdValidador
       AND ISNULL(a.IdWeb, 0) <> 1
    LEFT JOIN EmpleadoCj o_cj
        ON o_cj.IdEmpleado = a.IdValidador
       AND ISNULL(a.IdWeb, 0) = 1
    LEFT JOIN Empleado p_emp
        ON p_emp.IdEmpleado = a.IdGestor
       AND ISNULL(a.IdWeb, 0) <> 1
    LEFT JOIN EmpleadoCj p_cj
        ON p_cj.IdEmpleado = a.IdGestor
       AND ISNULL(a.IdWeb, 0) = 1
    LEFT JOIN Constante w
        ON w.Sociedad = 'PE01'
       AND w.Programa = 'MAESTRO'
       AND w.Campo = 'ESTADO'
       AND a.Estado = w.Correlativo
    LEFT JOIN Site c
        ON a.IdSite = c.IdSite
       AND a.CorreSite = c.Correlativo
    LEFT JOIN EmpleadoCj z
        ON a.IdSolicitante = z.IdEmpleado
    LEFT JOIN Empleado z1
        ON a.IdSolicitante = z1.IdEmpleado
    LEFT JOIN Suministro_provisional s1
        ON a.idprovisional = s1.idprovisional
    INNER JOIN Proyecto b
        ON a.IdProyecto = b.IdProyecto
    WHERE (
        NULLIF(LTRIM(RTRIM(@TextoBusqueda)), '') IS NULL
        OR CONVERT(VARCHAR(20), a.Correlativo) LIKE '%' + LTRIM(RTRIM(@TextoBusqueda)) + '%'
        OR LTRIM(RTRIM(ISNULL(a.Ot, ''))) LIKE '%' + LTRIM(RTRIM(@TextoBusqueda)) + '%'
        OR LTRIM(RTRIM(ISNULL(a.IdOc, ''))) LIKE '%' + LTRIM(RTRIM(@TextoBusqueda)) + '%'
        OR LTRIM(RTRIM(ISNULL(f_emp.NombreEmpleado, ''))) LIKE '%' + LTRIM(RTRIM(@TextoBusqueda)) + '%'
        OR LTRIM(RTRIM(ISNULL(g.NombreCliente, ''))) LIKE '%' + LTRIM(RTRIM(@TextoBusqueda)) + '%'
        OR LTRIM(RTRIM(ISNULL(b.NombreProyecto, ''))) LIKE '%' + LTRIM(RTRIM(@TextoBusqueda)) + '%'
        OR LTRIM(RTRIM(ISNULL(c.NombreSite, ''))) LIKE '%' + LTRIM(RTRIM(@TextoBusqueda)) + '%'
        OR LTRIM(RTRIM(ISNULL(a.Tipo_Trabajo, ''))) LIKE '%' + LTRIM(RTRIM(@TextoBusqueda)) + '%'
        OR LTRIM(RTRIM(ISNULL(e.ValorIni, ''))) LIKE '%' + LTRIM(RTRIM(@TextoBusqueda)) + '%'
    )
    AND (
        @FiltrarPorSolicitante = 0
        OR (
            ISNULL(a.IdWeb, 0) = 1
            AND z.IdEmpleado = @IdEmpleado
        )
        OR (
            ISNULL(a.IdWeb, 0) <> 1
            AND EXISTS (
                SELECT 1
                FROM @EmpleadosFiltro empleadoFiltro
                WHERE empleadoFiltro.IdEmpleado = z1.IdEmpleado
            )
        )
    );

    -- Resultado (mismo orden de columnas que la version de una sola consulta; las columnas nuevas
    -- IdGestor / IdSolicitanteCj / IdGestorCj / IdValidadorCj van al final; TotalOcFila / PagadoOcFila,
    -- despues de FechaReaprobador).
    SELECT
        FecIngreso, Detalle, Cuenta, CuentaInter, Bien, Comprobante, Banco, RUC, Moneda,
        TotalSubtotalPorMoneda, TotalMontoBckPorMoneda, TotalMontoVisiblePorMoneda, TotalPagadoConvertidoSoles,
        MonedasPagadoOt, MonedasImportarOt, TotalMontoBckSoles, TotalMontoVisibleSoles, Atp, Status_Pap,
        Subtotal, IGV, Total, SubtotalSoles, IGVSoles, TotalSoles, Comentario, Solicitante, GEstor, Validador,
        FechaDeposito, Estado, EstadoNombre, Corre, IdProyecto, Correlativo, IdResponsable, IdSite, Usuario, Ot,
        IdCliente, IdBien, IdComprobante, IdTipoPago, TipoMoneda, IdRendicion, IdSolicitante, IdValidador,
        HoraCreacion, NomResponsable, IdTipoDoc, Fila, IdTransferencia, NombreProyecto, Site, CorSite,
        Tipo_Trabajo, Responsable, Cliente, IdOc, IdEstadoOc, EstadoOcSemaforo, TotalOcConsumo, PagadoOcConsumo,
        MontoRetencion, TotalPagarOriginal, TotalPlanillaBase, TotalPagar, IdTarea, Tarea, imgFactura,
        idprovisional, fechaInicio, NombreEstado, serie, NroOperacion, ObservacionPlanilla, Observacion,
        SubtotalOriginal, IgvOriginal, TotalOriginal, SumaEmp, SumaEmpSolesNativo, SumaEmpUsdNativo,
        SumaEmpEurNativo, SumaEmpDopNativo, SumaEmpCopNativo, CantRecibosEmp,
        IdGestor, IdSolicitanteCj, IdGestorCj, IdValidadorCj, FechaReaprobador,
        TotalOcFila, PagadoOcFila
    FROM #R
    ORDER BY Corre DESC;
END;
GO
