-- sp_Movimientos_Analisis: version LIVIANA de sp_Movimientos_Consulta_GastosIngresos para /reportes/gerencial/analisis.
-- Consumido por consulta "movimientos-analisis" (PlanillaConsultaService). NO EJECUTADO: probar primero en pruebas.
--
-- Por que existe: el SP completo devuelve ~40.500 filas x 62 columnas (rango 2026). La pantalla solo usa ~15 columnas;
-- el resto (solicitante/gestor/validador, banco, cuenta, comprobante, RUC, comentario, etc.) solo hace crecer el
-- tiempo del SP (joins a Empleado/EmpleadoCj/CuentaEmpleado/Constante) y, sobre todo, el JSON que viaja al navegador.
--   * Mismos parametros y misma logica de filtros que sp_Movimientos_Consulta_GastosIngresos (ver 16_...).
--   * Mismos nombres de columna que la pantalla ya lee: TipoMovimiento, FechaMovimiento, Cliente, Proyecto, Site,
--     TipoTrabajo, Tarea, IdMoneda, Moneda, Subtotal, MontoGasto, MontoIngreso, MontoMovimiento, MontoFirmado, Detalle.
--   * Sin tabla temporal y sin ORDER BY (la pantalla ordena y agrupa por su cuenta).
--   * Se mantiene Detalle completo (la grilla lo muestra y exporta).
--   * Los montos NUNCA se convierten de moneda (regla del proyecto): se devuelven en la moneda original.
-- No modifica sp_Movimientos_Consulta_GastosIngresos: ingresosegresos y analisisproyecto siguen usando el completo.
-- Idempotente (CREATE OR ALTER).

SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

CREATE OR ALTER PROCEDURE [dbo].[sp_Movimientos_Analisis]
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
    -- Planilla.FechaDeposito es NVARCHAR 'yyyy-mm-dd' (verificado en estado 4): se compara como texto.
    DECLARE @FechaInicioTxt NVARCHAR(10) = CONVERT(NVARCHAR(10), @FechaInicio, 23);
    DECLARE @FechaFinTxt NVARCHAR(10) = CONVERT(NVARCHAR(10), @FechaFin, 23);

    SET @IdCargo = NULLIF(@IdCargo, 0);
    SET @IdEmpleado = NULLIF(@IdEmpleado, 0);
    SET @IdValidador = NULLIF(@IdValidador, 0);
    SET @IdCliente = NULLIF(@IdCliente, 0);
    SET @IdProyecto = NULLIF(@IdProyecto, 0);
    SET @IdSite = NULLIF(LTRIM(RTRIM(@IdSite)), '');
    IF @IdSite = '0' SET @IdSite = NULL;

    SET @Estados = ISNULL(NULLIF(LTRIM(RTRIM(@Estados)), ''), '4');

    SET @TipoMovimiento = NULLIF(UPPER(LTRIM(RTRIM(@TipoMovimiento))), '');
    IF @TipoMovimiento IN ('TODOS', 'TODO', 'AMBOS') SET @TipoMovimiento = NULL;

    DECLARE @VerGastos BIT = CASE WHEN @TipoMovimiento IS NULL OR @TipoMovimiento IN ('GASTO', 'GASTOS') THEN 1 ELSE 0 END;
    DECLARE @VerIngresos BIT = CASE WHEN @TipoMovimiento IS NULL OR @TipoMovimiento IN ('INGRESO', 'INGRESOS') THEN 1 ELSE 0 END;

    SET @AnoInicio = CASE WHEN @FechaInicio IS NULL THEN NULL ELSE YEAR(@FechaInicio) END;
    SET @AnoFin = CASE WHEN @FechaFin IS NULL THEN NULL ELSE YEAR(@FechaFin) END;

    IF @IdEmpleado IS NOT NULL
    BEGIN
        SELECT @IdEmpleado2 = STRING_AGG(CONVERT(VARCHAR(20), emp.IdEmpleado), ',')
        FROM dbo.EmpleadoCj ecj
        INNER JOIN dbo.Empleado emp ON emp.IdEmpleadoCj = ecj.IdEmpleado
        WHERE ecj.IdEmpleado = @IdEmpleado;

        SET @FiltrarPorSolicitante = 1;
    END;

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

    SELECT
        'GASTO'                                                         AS TipoMovimiento,
        CASE WHEN @IncluyeEstado4 = 1 THEN TRY_CONVERT(DATE, a.FechaDeposito)
             ELSE TRY_CONVERT(DATE, a.FecIngreso) END                   AS FechaMovimiento,
        cli.NombreCliente                                               AS Cliente,
        pro.NombreProyecto                                              AS Proyecto,
        sit.NombreSite                                                  AS Site,
        CONVERT(VARCHAR(250), a.Tipo_Trabajo)                           AS TipoTrabajo,
        tar.ValorIni                                                    AS Tarea,
        a.TipoMoneda                                                    AS IdMoneda,
        mon.ValorIni                                                    AS Moneda,
        TRY_CONVERT(DECIMAL(18,2), ISNULL(a.Subtotal, 0))               AS Subtotal,
        TRY_CONVERT(DECIMAL(18,2), COALESCE(a.TotalPagar, a.Total, 0))  AS MontoGasto,
        CONVERT(DECIMAL(18,2), 0)                                       AS MontoIngreso,
        TRY_CONVERT(DECIMAL(18,2), COALESCE(a.TotalPagar, a.Total, 0))  AS MontoMovimiento,
        TRY_CONVERT(DECIMAL(18,2), COALESCE(a.TotalPagar, a.Total, 0) * -1) AS MontoFirmado,
        CAST(a.Detalle AS VARCHAR(MAX))                                 AS Detalle
    FROM dbo.Planilla a
    INNER JOIN dbo.Proyecto pro ON pro.IdProyecto = a.IdProyecto
    LEFT JOIN dbo.Cliente cli ON cli.IdCliente = a.IdCliente
    OUTER APPLY (SELECT TOP (1) s.NombreSite
                 FROM dbo.Site s
                 WHERE s.IdSite = a.IdSite AND s.Correlativo = a.CorreSite
                 ORDER BY s.NombreSite) sit
    LEFT JOIN dbo.Constante mon
        ON mon.Sociedad = 'PE01' AND mon.Programa = 'PLANTILLA' AND mon.Campo = 'TIPO_MONEDA' AND mon.Correlativo = a.TipoMoneda
    OUTER APPLY (SELECT TOP (1) k.ValorIni
                 FROM dbo.Constante k
                 WHERE k.Campo = 'TAREA' AND k.Correlativo = a.IdTarea
                 ORDER BY k.Sociedad) tar
    WHERE @VerGastos = 1
      AND a.Estado IN (SELECT Estado FROM @EstadosTbl)
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

    UNION ALL

    SELECT
        'INGRESO'                                                       AS TipoMovimiento,
        CASE WHEN ano.AnoGestion BETWEEN 1900 AND 9999
             THEN DATEFROMPARTS(ano.AnoGestion, 1, 1) ELSE NULL END     AS FechaMovimiento,
        cli.NombreCliente                                               AS Cliente,
        pro.NombreProyecto                                              AS Proyecto,
        sit.NombreSite                                                  AS Site,
        CONVERT(VARCHAR(250), imp.TipoTrabajo)                          AS TipoTrabajo,
        NULL                                                            AS Tarea,
        imp.IdMoneda                                                    AS IdMoneda,
        mon.ValorIni                                                    AS Moneda,
        NULL                                                            AS Subtotal,
        CONVERT(DECIMAL(18,2), 0)                                       AS MontoGasto,
        TRY_CONVERT(DECIMAL(18,2), ISNULL(imp.MontoLiq, 0))             AS MontoIngreso,
        TRY_CONVERT(DECIMAL(18,2), ISNULL(imp.MontoLiq, 0))             AS MontoMovimiento,
        TRY_CONVERT(DECIMAL(18,2), ISNULL(imp.MontoLiq, 0))             AS MontoFirmado,
        CONCAT('Ingreso',
               CASE WHEN cli.NombreCliente IS NOT NULL THEN CONCAT(' - ', cli.NombreCliente) ELSE '' END,
               CASE WHEN pro.NombreProyecto IS NOT NULL THEN CONCAT(' - ', pro.NombreProyecto) ELSE '' END,
               CASE WHEN sit.NombreSite IS NOT NULL THEN CONCAT(' - ', sit.NombreSite) ELSE '' END) AS Detalle
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
    WHERE @VerIngresos = 1
      AND imp.IdEstado = 1
      AND (@IdCliente IS NULL OR imp.IdCliente = @IdCliente)
      AND (@IdProyecto IS NULL OR imp.IdProyecto = @IdProyecto)
      AND (@IdSite IS NULL OR LTRIM(RTRIM(CONVERT(VARCHAR(50), imp.IdSite))) = @IdSite)
      AND (@AnoInicio IS NULL OR ano.AnoGestion >= @AnoInicio)
      AND (@AnoFin IS NULL OR ano.AnoGestion <= @AnoFin)
    OPTION (RECOMPILE);
END;
GO

/* VALIDACION (pruebas): mismo rango en ambos SP; deben coincidir filas y sumas por TipoMovimiento/Moneda.
   EXEC dbo.sp_Movimientos_Consulta_GastosIngresos @FechaInicio='2026-01-01', @FechaFin='2026-11-20';  -- 40.536 filas
   EXEC dbo.sp_Movimientos_Analisis                @FechaInicio='2026-01-01', @FechaFin='2026-11-20';
   Con SET STATISTICS TIME, IO ON comparar elapsed y lecturas.                                                          */
