/* ================================================================
   VALIDACION (SOLO LECTURA) - Planilla.FecIngresoDate / FechaDepositoDate
   Objetivo: confirmar que las columnas DATE coinciden con el texto que
   hoy convierte sp_Planilla_ConsultaIni con TRY_CONVERT, antes de que el
   SP las use en sus filtros. Ejecutar en JC_Db; recorre Planilla 1 vez.
   Si "sin_date_con_texto" o "distintos" son > 0, NO usar las columnas
   DATE sin revisar esos casos.
   ================================================================ */
USE JC_Db;
SET NOCOUNT ON;

;WITH x AS (
    SELECT a.Correlativo, a.Estado, a.FecIngresoDate, a.FechaDepositoDate, a.FecIngreso, a.FechaDeposito,
           COALESCE(TRY_CONVERT(DATE, NULLIF(LTRIM(RTRIM(a.FecIngreso)), ''), 101),
                    TRY_CONVERT(DATE, NULLIF(LTRIM(RTRIM(a.FecIngreso)), ''), 103),
                    TRY_CONVERT(DATE, NULLIF(LTRIM(RTRIM(a.FecIngreso)), ''), 23)) AS IngTxt,
           COALESCE(TRY_CONVERT(DATE, NULLIF(LTRIM(RTRIM(a.FechaDeposito)), ''), 23),
                    TRY_CONVERT(DATE, NULLIF(LTRIM(RTRIM(a.FechaDeposito)), ''), 101),
                    TRY_CONVERT(DATE, NULLIF(LTRIM(RTRIM(a.FechaDeposito)), ''), 103)) AS DepTxt
    FROM dbo.Planilla a
)
SELECT
    COUNT_BIG(*)                                                                      AS total_filas,
    -- FecIngreso
    SUM(CASE WHEN IngTxt IS NOT NULL AND FecIngresoDate IS NULL THEN 1 ELSE 0 END)    AS ing_sin_date_con_texto,
    SUM(CASE WHEN IngTxt IS NOT NULL AND FecIngresoDate IS NOT NULL AND IngTxt <> FecIngresoDate THEN 1 ELSE 0 END) AS ing_distintos,
    SUM(CASE WHEN IngTxt IS NULL AND FecIngresoDate IS NOT NULL THEN 1 ELSE 0 END)    AS ing_date_sin_texto,
    -- FechaDeposito
    SUM(CASE WHEN DepTxt IS NOT NULL AND FechaDepositoDate IS NULL THEN 1 ELSE 0 END) AS dep_sin_date_con_texto,
    SUM(CASE WHEN DepTxt IS NOT NULL AND FechaDepositoDate IS NOT NULL AND DepTxt <> FechaDepositoDate THEN 1 ELSE 0 END) AS dep_distintos,
    SUM(CASE WHEN DepTxt IS NULL AND FechaDepositoDate IS NOT NULL THEN 1 ELSE 0 END) AS dep_date_sin_texto
FROM x;

-- Ultimos 90 dias (lo que mas importa para las pestanas)
;WITH x AS (
    SELECT a.Correlativo, a.Estado, a.FecIngresoDate, a.FechaDepositoDate, a.FecIngreso, a.FechaDeposito,
           COALESCE(TRY_CONVERT(DATE, NULLIF(LTRIM(RTRIM(a.FecIngreso)), ''), 101),
                    TRY_CONVERT(DATE, NULLIF(LTRIM(RTRIM(a.FecIngreso)), ''), 103),
                    TRY_CONVERT(DATE, NULLIF(LTRIM(RTRIM(a.FecIngreso)), ''), 23)) AS IngTxt,
           COALESCE(TRY_CONVERT(DATE, NULLIF(LTRIM(RTRIM(a.FechaDeposito)), ''), 23),
                    TRY_CONVERT(DATE, NULLIF(LTRIM(RTRIM(a.FechaDeposito)), ''), 101),
                    TRY_CONVERT(DATE, NULLIF(LTRIM(RTRIM(a.FechaDeposito)), ''), 103)) AS DepTxt
    FROM dbo.Planilla a
)
SELECT TOP (50) Correlativo, Estado, FecIngreso, FecIngresoDate, IngTxt, FechaDeposito, FechaDepositoDate, DepTxt
FROM x
WHERE (IngTxt IS NOT NULL AND (FecIngresoDate IS NULL OR FecIngresoDate <> IngTxt))
   OR (DepTxt IS NOT NULL AND (FechaDepositoDate IS NULL OR FechaDepositoDate <> DepTxt))
ORDER BY Correlativo DESC;   -- muestra de inconsistencias (vacia = todo coincide)
