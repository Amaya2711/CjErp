-- sp_Movimientos_Consulta_GastosIngresos: version con mejoras de rendimiento.
-- Consumido por PlanillaConsultaService ("movimientos-gastos-ingresos") -> /reportes/gerencial/analisis (y otras).
-- NO EJECUTADO. Probar primero en un entorno de pruebas y comparar contra la version vigente (ver bloque de validacion al final).
--
-- Cambios respecto a la version vigente (mismas columnas y mismo orden de salida):
--   1. OPTION (RECOMPILE) en los dos INSERT: con tantos filtros opcionales (@x IS NULL OR ...) el plan en cache
--      quedaba optimizado para otros valores. Con RECOMPILE las condiciones sobre variables se evalúan como constantes
--      y se descartan las ramas no usadas (p. ej. la rama de FecIngreso cuando @IncluyeEstado4 = 1).
--   2. Se QUITA "SELECT DISTINCT" (ordenar/hacer hash de ~50 columnas, varias VARCHAR(MAX)). DISTINCT enmascaraba
--      duplicados de joins; ahora cada join que podia devolver mas de una fila se resuelve con OUTER APPLY ... TOP (1):
--        - CuentaEmpleado (un empleado puede tener varias cuentas) -> antes cada cuenta generaba una fila distinta
--          que DISTINCT NO colapsaba (posible doble conteo del gasto). Ahora: una sola cuenta por gasto.
--        - Site (IdSite + Correlativo), Constante BANCO y Constante TAREA (sin Sociedad/Programa).
--   3. Joins a Constante agrupados con OUTER APPLY TOP (1) donde la llave no es unica garantizada.
--   4. Filtro por FechaDeposito (estado 4) comparando el texto 'yyyy-mm-dd' directamente (sin TRY_CONVERT): habilita el
--      indice de 17_idx_Planilla_Estado_FechaDeposito.sql. FecIngreso (otros estados) conserva TRY_CONVERT: formato sin verificar.
--   CAMBIO DE COMPORTAMIENTO CONOCIDO: si un responsable tiene varias cuentas, antes salian N filas (una por cuenta);
--      ahora sale 1 (la de menor Cuenta, criterio estable). Corrige el posible doble conteo.
-- Idempotente (CREATE OR ALTER).

SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

CREATE OR ALTER PROCEDURE [dbo].[sp_Movimientos_Consulta_GastosIngresos]
(
    @IdCargo          INT         = NULL,
    @IdEmpleado       INT         = NULL,
    @IdValidador      INT         = NULL,
    @Estados          VARCHAR(50) = '4',
    @FechaInicio      DATE        = NULL,
    @FechaFin         DATE        = NULL,
    @FechaDeposito    DATE        = NULL,
    @IdCliente        INT         = NULL,
    @IdProyecto       INT         = NULL,
    @IdSite           VARCHAR(50) = NULL,
    @TipoMovimiento   VARCHAR(20) = NULL
)
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @FiltrarPorSolicitante BIT = 0;
    DECLARE @IdEmpleado2 VARCHAR(MAX) = NULL;
    DECLARE @IncluyeEstado4 BIT = 0;
    DECLARE @AnoInicio INT = NULL;
    DECLARE @AnoFin INT = NULL;
    -- Planilla.FechaDeposito es NVARCHAR 'yyyy-mm-dd' (verificado: 86.726 filas estado 4, todas de 10 caracteres).
    -- Comparar como texto es equivalente a comparar fechas y permite usar indices (sin TRY_CONVERT sobre la columna).
    DECLARE @FechaInicioTxt NVARCHAR(10) = CONVERT(NVARCHAR(10), @FechaInicio, 23);
    DECLARE @FechaFinTxt NVARCHAR(10) = CONVERT(NVARCHAR(10), @FechaFin, 23);

    SET @IdCargo = NULLIF(@IdCargo, 0);
    SET @IdEmpleado = NULLIF(@IdEmpleado, 0);
    SET @IdValidador = NULLIF(@IdValidador, 0);
    SET @IdCliente = NULLIF(@IdCliente, 0);
    SET @IdProyecto = NULLIF(@IdProyecto, 0);
    SET @IdSite = NULLIF(LTRIM(RTRIM(@IdSite)), '');
    IF @IdSite = '0' SET @IdSite = NULL;

    SET @Estados = NULLIF(LTRIM(RTRIM(@Estados)), '');
    SET @Estados = ISNULL(@Estados, '4');

    SET @TipoMovimiento = NULLIF(UPPER(LTRIM(RTRIM(@TipoMovimiento))), '');
    IF @TipoMovimiento IN ('TODOS', 'TODO', 'AMBOS') SET @TipoMovimiento = NULL;

    SET @AnoInicio = CASE WHEN @FechaInicio IS NULL THEN NULL ELSE YEAR(@FechaInicio) END;
    SET @AnoFin = CASE WHEN @FechaFin IS NULL THEN NULL ELSE YEAR(@FechaFin) END;

    /* Empleados relacionados (solo Planilla) */
    IF @IdEmpleado IS NOT NULL
    BEGIN
        SELECT @IdEmpleado2 = STRING_AGG(CONVERT(VARCHAR(20), emp.IdEmpleado), ',')
        FROM dbo.EmpleadoCj ecj
        INNER JOIN dbo.Empleado emp ON emp.IdEmpleadoCj = ecj.IdEmpleado
        WHERE ecj.IdEmpleado = @IdEmpleado;

        SET @FiltrarPorSolicitante = 1;
    END;

    /* Permisos del cargo (solo Planilla) */
    IF @IdCargo IS NOT NULL
       AND EXISTS
       (
           SELECT 1
           FROM dbo.Constante
           WHERE Campo = 'PERMISOS'
             AND (TRY_CONVERT(INT, Correlativo) = @IdCargo OR TRY_CONVERT(INT, ValorIni) = @IdCargo)
       )
    BEGIN
        SET @FiltrarPorSolicitante = 0;
    END;

    /* Estados como tabla (se evalua una sola vez, no por fila) */
    DECLARE @EstadosTbl TABLE (Estado INT PRIMARY KEY);
    INSERT INTO @EstadosTbl (Estado)
    SELECT DISTINCT TRY_CONVERT(INT, LTRIM(RTRIM(value)))
    FROM STRING_SPLIT(@Estados, ',')
    WHERE TRY_CONVERT(INT, LTRIM(RTRIM(value))) IS NOT NULL;

    IF EXISTS (SELECT 1 FROM @EstadosTbl WHERE Estado = 4)
    BEGIN
        SET @IncluyeEstado4 = 1;
    END;

    DECLARE @SolicitantesTbl TABLE (IdSolicitante INT PRIMARY KEY);
    INSERT INTO @SolicitantesTbl (IdSolicitante)
    SELECT DISTINCT TRY_CONVERT(INT, LTRIM(RTRIM(value)))
    FROM STRING_SPLIT(ISNULL(@IdEmpleado2, ''), ',')
    WHERE TRY_CONVERT(INT, LTRIM(RTRIM(value))) IS NOT NULL;

    CREATE TABLE #Movimientos
    (
        TipoMovimiento       VARCHAR(20)    NOT NULL,
        IdOrigen             INT            NULL,
        FechaMovimiento      DATE           NULL,
        FechaRegistro        DATE           NULL,
        FechaDeposito        DATE           NULL,
        IdCliente            INT            NULL,
        Cliente              VARCHAR(250)   NULL,
        IdProyecto           INT            NULL,
        Proyecto             VARCHAR(250)   NULL,
        IdSite               VARCHAR(50)    NULL,
        CorreSite            INT            NULL,
        Site                 VARCHAR(250)   NULL,
        TipoTrabajo          VARCHAR(250)   NULL,
        OT                   VARCHAR(100)   NULL,
        Detalle              VARCHAR(MAX)   NULL,
        Bien                 VARCHAR(250)   NULL,
        Comprobante          VARCHAR(250)   NULL,
        RUC                  VARCHAR(50)    NULL,
        Serie                VARCHAR(100)   NULL,
        NroOperacion         VARCHAR(100)   NULL,
        IdMoneda             INT            NULL,
        Moneda               VARCHAR(100)   NULL,
        Subtotal             DECIMAL(18,2)  NULL,
        IGV                  DECIMAL(18,2)  NULL,
        MontoGasto           DECIMAL(18,2)  NULL,
        MontoIngreso         DECIMAL(18,2)  NULL,
        MontoMovimiento      DECIMAL(18,2)  NULL,
        MontoFirmado         DECIMAL(18,2)  NULL,
        Estado               INT            NULL,
        NombreEstado         VARCHAR(150)   NULL,
        Comentario           VARCHAR(MAX)   NULL,
        Solicitante          VARCHAR(250)   NULL,
        Gestor               VARCHAR(250)   NULL,
        Validador            VARCHAR(250)   NULL,
        Responsable          VARCHAR(250)   NULL,
        IdResponsable        INT            NULL,
        IdSolicitante        INT            NULL,
        IdValidador          INT            NULL,
        Banco                VARCHAR(150)   NULL,
        Cuenta               VARCHAR(100)   NULL,
        CuentaInterbancaria  VARCHAR(100)   NULL,
        IdTarea              INT            NULL,
        Tarea                VARCHAR(250)   NULL,
        MontoOC              DECIMAL(18,2)  NULL,
        MontoLiquidado       DECIMAL(18,2)  NULL,
        Facturado            DECIMAL(18,2)  NULL,
        Mes                  INT            NULL,
        Ano                  INT            NULL,
        NroOC                VARCHAR(100)   NULL,
        StatusPap            VARCHAR(100)   NULL,
        StatusCj             VARCHAR(100)   NULL,
        Usuario              VARCHAR(150)   NULL,
        Origen               VARCHAR(50)    NULL
    );

    /* ============================================================
       GASTOS DE PLANILLA
       ============================================================ */
    IF @TipoMovimiento IS NULL OR @TipoMovimiento IN ('GASTO', 'GASTOS')
    BEGIN
        INSERT INTO #Movimientos
        (
            TipoMovimiento, IdOrigen, FechaMovimiento, FechaRegistro, FechaDeposito,
            IdCliente, Cliente, IdProyecto, Proyecto, IdSite, CorreSite, Site,
            TipoTrabajo, OT, Detalle, Bien, Comprobante, RUC, Serie, NroOperacion,
            IdMoneda, Moneda, Subtotal, IGV, MontoGasto, MontoIngreso, MontoMovimiento, MontoFirmado,
            Estado, NombreEstado, Comentario, Solicitante, Gestor, Validador, Responsable,
            IdResponsable, IdSolicitante, IdValidador, Banco, Cuenta, CuentaInterbancaria,
            IdTarea, Tarea, MontoOC, MontoLiquidado, Facturado, Mes, Ano,
            NroOC, StatusPap, StatusCj, Usuario, Origen
        )
        SELECT
            'GASTO',
            a.Correlativo,
            CASE WHEN @IncluyeEstado4 = 1 THEN TRY_CONVERT(DATE, a.FechaDeposito) ELSE TRY_CONVERT(DATE, a.FecIngreso) END,
            TRY_CONVERT(DATE, a.FecIngreso),
            TRY_CONVERT(DATE, a.FechaDeposito),
            a.IdCliente,
            cli.NombreCliente,
            a.IdProyecto,
            pro.NombreProyecto,
            CONVERT(VARCHAR(50), a.IdSite),
            a.CorreSite,
            sit.NombreSite,
            CONVERT(VARCHAR(250), a.Tipo_Trabajo),
            CONVERT(VARCHAR(100), a.OT),
            CAST(a.Detalle AS VARCHAR(MAX)),
            bien.ValorIni,
            comp.ValorIni,
            resp.NroDocumento,
            CONVERT(VARCHAR(100), a.Serie),
            CONVERT(VARCHAR(100), a.NroOperacion),
            a.TipoMoneda,
            mon.ValorIni,
            TRY_CONVERT(DECIMAL(18,2), ISNULL(a.Subtotal, 0)),
            TRY_CONVERT(DECIMAL(18,2), ISNULL(a.IGV, 0)),
            TRY_CONVERT(DECIMAL(18,2), COALESCE(a.TotalPagar, a.Total, 0)),
            CONVERT(DECIMAL(18,2), 0),
            TRY_CONVERT(DECIMAL(18,2), COALESCE(a.TotalPagar, a.Total, 0)),
            TRY_CONVERT(DECIMAL(18,2), COALESCE(a.TotalPagar, a.Total, 0) * -1),
            a.Estado,
            est.ValorIni,
            CAST(a.Comentario AS VARCHAR(MAX)),
            CASE WHEN ISNULL(a.IdWeb, 0) = 1 THEN sol_cj.NombreEmpleado ELSE sol_emp.NombreEmpleado END,
            CASE WHEN ISNULL(a.IdWeb, 0) = 1 THEN ges_cj.NombreEmpleado ELSE ges_emp.NombreEmpleado END,
            CASE WHEN ISNULL(a.IdWeb, 0) = 1 THEN val_cj.NombreEmpleado ELSE val_emp.NombreEmpleado END,
            resp.NombreEmpleado,
            a.IdResponsable,
            a.IdSolicitante,
            a.IdValidador,
            ban.ValorIni,
            cue.Cuenta,
            cue.CuentaInter,
            a.IdTarea,
            tar.ValorIni,
            NULL, NULL, NULL,
            MONTH(TRY_CONVERT(DATE, a.FechaDeposito)),
            YEAR(TRY_CONVERT(DATE, a.FechaDeposito)),
            NULL, NULL, NULL,
            CONVERT(VARCHAR(150), a.Usuario),
            'PLANILLA'
        FROM dbo.Planilla a
        INNER JOIN dbo.Proyecto pro ON pro.IdProyecto = a.IdProyecto
        LEFT JOIN dbo.Cliente cli ON cli.IdCliente = a.IdCliente
        OUTER APPLY (SELECT TOP (1) s.NombreSite
                     FROM dbo.Site s
                     WHERE s.IdSite = a.IdSite AND s.Correlativo = a.CorreSite
                     ORDER BY s.NombreSite) sit
        OUTER APPLY (SELECT TOP (1) c.Cuenta, c.CuentaInter
                     FROM dbo.CuentaEmpleado c
                     WHERE c.IdEmpleado = a.IdResponsable
                     ORDER BY c.Cuenta) cue
        LEFT JOIN dbo.Empleado resp
            ON resp.IdEmpleado = a.IdResponsable AND resp.IdCargo IN (10, 11, 83)
        LEFT JOIN dbo.Constante bien
            ON bien.Sociedad = 'PE01' AND bien.Programa = 'PLANTILLA' AND bien.Campo = 'TIPO_BIEN' AND bien.Correlativo = a.IdBien
        LEFT JOIN dbo.Constante comp
            ON comp.Sociedad = 'PE01' AND comp.Programa = 'PLANTILLA' AND comp.Campo = 'TIPO_COMPROBANTE' AND comp.Correlativo = a.IdComprobante
        LEFT JOIN dbo.Constante mon
            ON mon.Sociedad = 'PE01' AND mon.Programa = 'PLANTILLA' AND mon.Campo = 'TIPO_MONEDA' AND mon.Correlativo = a.TipoMoneda
        LEFT JOIN dbo.Constante est
            ON est.Sociedad = 'PE01' AND est.Programa = 'MAESTRO' AND est.Campo = 'ESTADO' AND est.Correlativo = a.Estado
        OUTER APPLY (SELECT TOP (1) k.ValorIni
                     FROM dbo.Constante k
                     WHERE k.Campo = 'BANCO' AND k.Correlativo = a.IdBanco
                     ORDER BY k.Sociedad) ban
        OUTER APPLY (SELECT TOP (1) k.ValorIni
                     FROM dbo.Constante k
                     WHERE k.Campo = 'TAREA' AND k.Correlativo = a.IdTarea
                     ORDER BY k.Sociedad) tar
        LEFT JOIN dbo.Empleado sol_emp ON sol_emp.IdEmpleado = a.IdSolicitante AND ISNULL(a.IdWeb, 0) <> 1
        LEFT JOIN dbo.EmpleadoCj sol_cj ON sol_cj.IdEmpleado = a.IdSolicitante AND ISNULL(a.IdWeb, 0) = 1
        LEFT JOIN dbo.Empleado ges_emp ON ges_emp.IdEmpleado = a.IdGestor AND ISNULL(a.IdWeb, 0) <> 1
        LEFT JOIN dbo.EmpleadoCj ges_cj ON ges_cj.IdEmpleado = a.IdGestor AND ISNULL(a.IdWeb, 0) = 1
        LEFT JOIN dbo.Empleado val_emp ON val_emp.IdEmpleado = a.IdValidador AND ISNULL(a.IdWeb, 0) <> 1
        LEFT JOIN dbo.EmpleadoCj val_cj ON val_cj.IdEmpleado = a.IdValidador AND ISNULL(a.IdWeb, 0) = 1
        WHERE a.Estado IN (SELECT Estado FROM @EstadosTbl)
          AND (@IdValidador IS NULL OR a.IdValidador = @IdValidador)
          AND (@IdCliente IS NULL OR a.IdCliente = @IdCliente)
          AND (@IdProyecto IS NULL OR a.IdProyecto = @IdProyecto)
          AND (@IdSite IS NULL OR LTRIM(RTRIM(CONVERT(VARCHAR(50), a.IdSite))) = @IdSite)
          AND (@FechaInicio IS NULL
               OR (@IncluyeEstado4 = 1 AND a.FechaDeposito >= @FechaInicioTxt)
               OR (@IncluyeEstado4 = 0 AND TRY_CONVERT(DATE, a.FecIngreso) >= @FechaInicio))
          AND (@FechaFin IS NULL
               OR (@IncluyeEstado4 = 1 AND a.FechaDeposito <= @FechaFinTxt)
               OR (@IncluyeEstado4 = 0 AND TRY_CONVERT(DATE, a.FecIngreso) <= @FechaFin))
          AND (@FechaDeposito IS NULL OR TRY_CONVERT(DATE, a.FechaDeposito) = @FechaDeposito)
          AND (@IdEmpleado IS NULL
               OR @FiltrarPorSolicitante = 0
               OR (ISNULL(a.IdWeb, 0) = 1 AND a.IdSolicitante = @IdEmpleado)
               OR (ISNULL(a.IdWeb, 0) <> 1 AND a.IdSolicitante IN (SELECT IdSolicitante FROM @SolicitantesTbl)))
        OPTION (RECOMPILE);
    END;

    /* ============================================================
       INGRESOS DE IMPORTAR
       ============================================================ */
    IF @TipoMovimiento IS NULL OR @TipoMovimiento IN ('INGRESO', 'INGRESOS')
    BEGIN
        INSERT INTO #Movimientos
        (
            TipoMovimiento, IdOrigen, FechaMovimiento, FechaRegistro, FechaDeposito,
            IdCliente, Cliente, IdProyecto, Proyecto, IdSite, CorreSite, Site,
            TipoTrabajo, OT, Detalle, Bien, Comprobante, RUC, Serie, NroOperacion,
            IdMoneda, Moneda, Subtotal, IGV, MontoGasto, MontoIngreso, MontoMovimiento, MontoFirmado,
            Estado, NombreEstado, Comentario, Solicitante, Gestor, Validador, Responsable,
            IdResponsable, IdSolicitante, IdValidador, Banco, Cuenta, CuentaInterbancaria,
            IdTarea, Tarea, MontoOC, MontoLiquidado, Facturado, Mes, Ano,
            NroOC, StatusPap, StatusCj, Usuario, Origen
        )
        SELECT
            'INGRESO',
            imp.Correlativo,
            CASE WHEN ano.AnoGestion BETWEEN 1900 AND 9999 THEN DATEFROMPARTS(ano.AnoGestion, 1, 1) ELSE NULL END,
            NULL, NULL,
            imp.IdCliente,
            cli.NombreCliente,
            imp.IdProyecto,
            pro.NombreProyecto,
            CONVERT(VARCHAR(50), imp.IdSite),
            imp.Correlativo,
            sit.NombreSite,
            CONVERT(VARCHAR(250), imp.TipoTrabajo),
            CONVERT(VARCHAR(100), imp.OT),
            CONCAT('Ingreso',
                   CASE WHEN cli.NombreCliente IS NOT NULL THEN CONCAT(' - ', cli.NombreCliente) ELSE '' END,
                   CASE WHEN pro.NombreProyecto IS NOT NULL THEN CONCAT(' - ', pro.NombreProyecto) ELSE '' END,
                   CASE WHEN sit.NombreSite IS NOT NULL THEN CONCAT(' - ', sit.NombreSite) ELSE '' END),
            NULL, NULL, NULL, NULL, NULL,
            imp.IdMoneda,
            mon.ValorIni,
            NULL, NULL,
            CONVERT(DECIMAL(18,2), 0),
            TRY_CONVERT(DECIMAL(18,2), ISNULL(imp.MontoLiq, 0)),
            TRY_CONVERT(DECIMAL(18,2), ISNULL(imp.MontoLiq, 0)),
            TRY_CONVERT(DECIMAL(18,2), ISNULL(imp.MontoLiq, 0)),
            imp.IdEstado,
            CASE WHEN imp.IdEstado = 1 THEN 'ACTIVO' ELSE CONCAT('ESTADO ', CONVERT(VARCHAR(20), imp.IdEstado)) END,
            NULL, NULL, NULL, NULL, NULL,
            NULL, NULL, NULL, NULL, NULL, NULL,
            NULL, NULL,
            TRY_CONVERT(DECIMAL(18,2), imp.MontoOc),
            TRY_CONVERT(DECIMAL(18,2), imp.MontoLiq),
            TRY_CONVERT(DECIMAL(18,2), imp.Facturado),
            NULL,
            ano.AnoGestion,
            CONVERT(VARCHAR(100), imp.Nro_Oc),
            CONVERT(VARCHAR(100), imp.STATUS_PAP),
            CONVERT(VARCHAR(100), imp.Status_Cj),
            NULL,
            'IMPORTAR'
        FROM dbo.Importar imp
        LEFT JOIN dbo.Cliente cli ON cli.IdCliente = imp.IdCliente
        LEFT JOIN dbo.Proyecto pro ON pro.IdProyecto = imp.IdProyecto
        OUTER APPLY (SELECT TOP (1) s.NombreSite
                     FROM dbo.Site s
                     WHERE s.IdSite = imp.IdSite AND s.Correlativo = imp.Correlativo
                     ORDER BY s.NombreSite) sit
        OUTER APPLY (SELECT TOP (1) k.ValorIni
                     FROM dbo.Constante k
                     WHERE k.Campo = 'MONEDA' AND k.Correlativo = imp.IdMoneda
                     ORDER BY k.Sociedad) mon
        OUTER APPLY
        (
            SELECT TRY_CONVERT(INT, NULLIF(LTRIM(RTRIM(CONVERT(VARCHAR(50), imp.Anogestion))), '')) AS AnoGestion
        ) ano
        WHERE imp.IdEstado = 1
          AND (@IdCliente IS NULL OR imp.IdCliente = @IdCliente)
          AND (@IdProyecto IS NULL OR imp.IdProyecto = @IdProyecto)
          AND (@IdSite IS NULL OR LTRIM(RTRIM(CONVERT(VARCHAR(50), imp.IdSite))) = @IdSite)
          AND (@AnoInicio IS NULL OR ano.AnoGestion >= @AnoInicio)
          AND (@AnoFin IS NULL OR ano.AnoGestion <= @AnoFin)
        OPTION (RECOMPILE);
    END;

    /* ============================================================
       RESULTADO CONSOLIDADO (mismas columnas y orden que la version vigente)
       ============================================================ */
    SELECT
        TipoMovimiento, IdOrigen,
        FechaMovimiento, CONVERT(VARCHAR(10), FechaMovimiento, 103) AS FechaMovimientoTexto,
        FechaRegistro, CONVERT(VARCHAR(10), FechaRegistro, 103) AS FechaRegistroTexto,
        FechaDeposito, CONVERT(VARCHAR(10), FechaDeposito, 103) AS FechaDepositoTexto,
        IdCliente, Cliente, IdProyecto, Proyecto, IdSite, CorreSite, Site,
        TipoTrabajo, OT, Detalle, Bien, Comprobante, RUC, Serie, NroOperacion,
        IdMoneda, Moneda, Subtotal, IGV, MontoGasto, MontoIngreso, MontoMovimiento, MontoFirmado,
        Estado, NombreEstado, Comentario, Solicitante, Gestor, Validador, Responsable,
        IdResponsable, IdSolicitante, IdValidador, Banco, Cuenta, CuentaInterbancaria,
        IdTarea, Tarea, MontoOC, MontoLiquidado, Facturado, Mes, Ano,
        NroOC, StatusPap, StatusCj, Usuario, Origen
    FROM #Movimientos
    ORDER BY Ano DESC, ISNULL(Mes, 0) DESC, FechaMovimiento DESC, TipoMovimiento, IdOrigen DESC;

    DROP TABLE #Movimientos;
END;
GO

/* ============================================================
   VALIDACION (ejecutar en pruebas, NO forma parte del SP)
   1) Duplicados en la version VIGENTE (si devuelve filas, hoy hay doble conteo):
        EXEC dbo.sp_Movimientos_Consulta_GastosIngresos @FechaInicio='2026-01-01', @FechaFin='2026-11-20';
        -- guardar el resultado en #Old y ejecutar:
        -- SELECT IdOrigen, COUNT(*) FROM #Old WHERE TipoMovimiento='GASTO' GROUP BY IdOrigen HAVING COUNT(*) > 1;
   2) Comparar vigente vs nueva (mismo rango): conteo de filas y SUM(MontoMovimiento) por TipoMovimiento y Moneda.
      Diferencias esperables solo si el punto 1 devolvio duplicados.
   3) Tiempos: SET STATISTICS TIME, IO ON; ejecutar ambas con el mismo rango.
   ============================================================ */
