-- ============================================================================
-- ACEPTACION del modo RESUMEN de sp_IA_Planilla_Buscar (17_sp_IA_Planilla_Buscar_v3_ModoResumen.sql).
-- Ejecutar en JC_Db DESPUES de aplicar el script 17. Solo invoca el SP y consulta: no crea ni modifica datos.
-- Parte A: validaciones de parametros (autoverificada PASS/FAIL).
-- Parte B: coherencia con el detalle y con un conteo independiente (comparar a ojo; ver notas).
-- ============================================================================
SET NOCOUNT ON;

-- ---------------------------------------------------------------------------
-- A. VALIDACION DE PARAMETROS DEL MODO (falla cerrada)
-- ---------------------------------------------------------------------------
DECLARE @R TABLE (Caso NVARCHAR(120) NOT NULL, Esperado INT NOT NULL, Obtenido INT NULL,
                  Resultado AS (CASE WHEN Esperado = ISNULL(Obtenido, 0) THEN 'PASS' ELSE 'FAIL' END));

BEGIN TRY EXEC dbo.sp_IA_Planilla_Buscar @AlcanceNivel='TOTAL', @VerTotalesGlobales=0, @Modo='OTRO'; INSERT @R VALUES (N'M01 modo invalido', 50020, 0); END TRY
BEGIN CATCH INSERT @R VALUES (N'M01 modo invalido', 50020, ERROR_NUMBER()); END CATCH;

BEGIN TRY EXEC dbo.sp_IA_Planilla_Buscar @AlcanceNivel='TOTAL', @VerTotalesGlobales=0, @Modo='RESUMEN'; INSERT @R VALUES (N'M02 RESUMEN sin AgruparPor', 50021, 0); END TRY
BEGIN CATCH INSERT @R VALUES (N'M02 RESUMEN sin AgruparPor', 50021, ERROR_NUMBER()); END CATCH;

BEGIN TRY EXEC dbo.sp_IA_Planilla_Buscar @AlcanceNivel='TOTAL', @VerTotalesGlobales=0, @Modo='RESUMEN', @AgruparPor='CLIENTE;DROP TABLE X'; INSERT @R VALUES (N'M03 dimension no permitida (inyeccion)', 50022, 0); END TRY
BEGIN CATCH INSERT @R VALUES (N'M03 dimension no permitida (inyeccion)', 50022, ERROR_NUMBER()); END CATCH;

BEGIN TRY EXEC dbo.sp_IA_Planilla_Buscar @AlcanceNivel='TOTAL', @VerTotalesGlobales=0, @Modo='RESUMEN', @AgruparPor='CLIENTE,PROYECTO,SITE,ESTADO'; INSERT @R VALUES (N'M04 mas de 3 dimensiones', 50023, 0); END TRY
BEGIN CATCH INSERT @R VALUES (N'M04 mas de 3 dimensiones', 50023, ERROR_NUMBER()); END CATCH;

-- El alcance sigue siendo obligatorio tambien en RESUMEN
BEGIN TRY EXEC dbo.sp_IA_Planilla_Buscar @Modo='RESUMEN', @AgruparPor='CLIENTE'; INSERT @R VALUES (N'M05 RESUMEN sin alcance', 50010, 0); END TRY
BEGIN CATCH INSERT @R VALUES (N'M05 RESUMEN sin alcance', 50010, ERROR_NUMBER()); END CATCH;

BEGIN TRY EXEC dbo.sp_IA_Planilla_Buscar @AlcanceNivel='RESTRINGIDO', @AlcanceCampos='RS', @AlcanceEmpleados=N'1 OR 1=1', @VerTotalesGlobales=0, @Modo='RESUMEN', @AgruparPor='CLIENTE'; INSERT @R VALUES (N'M06 alcance invalido en RESUMEN', 50015, 0); END TRY
BEGIN CATCH INSERT @R VALUES (N'M06 alcance invalido en RESUMEN', 50015, ERROR_NUMBER()); END CATCH;

SELECT Caso, Esperado, Obtenido, Resultado FROM @R ORDER BY Caso;
IF EXISTS (SELECT 1 FROM @R WHERE Resultado = 'FAIL') PRINT 'PARTE A: HAY CASOS FAIL - NO continuar.';
ELSE PRINT 'PARTE A: todos los casos PASS.';

-- ---------------------------------------------------------------------------
-- B. COHERENCIA (setiembre 2026, PAGADO, alcance TOTAL). Cambie las fechas si quiere otro periodo.
-- ---------------------------------------------------------------------------
-- B01 Resumen por CLIENTE (+ Moneda implicita). Result set 1: grupos; result set 2: totales por moneda.
EXEC dbo.sp_IA_Planilla_Buscar @AlcanceNivel='TOTAL', @VerTotalesGlobales=0,
     @FechaInicio='2026-09-01', @FechaFin='2026-09-30', @Estados='PAGADO',
     @Modo='RESUMEN', @AgruparPor='CLIENTE', @Top=50;

-- B02 Cliente + Moneda explicita (no debe duplicar la columna Moneda) y por FECHA (dia)
EXEC dbo.sp_IA_Planilla_Buscar @AlcanceNivel='TOTAL', @VerTotalesGlobales=0,
     @FechaInicio='2026-09-01', @FechaFin='2026-09-30', @Estados='PAGADO',
     @Modo='RESUMEN', @AgruparPor='CLIENTE,MONEDA', @Top=50;
EXEC dbo.sp_IA_Planilla_Buscar @AlcanceNivel='TOTAL', @VerTotalesGlobales=0,
     @FechaInicio='2026-09-01', @FechaFin='2026-09-30', @Estados='PAGADO',
     @Modo='RESUMEN', @AgruparPor='FECHA', @Top=100;

-- B03 ORACULO independiente (no reutiliza el SP): registros y subtotal por moneda del mismo universo.
--     Debe coincidir con el result set 2 de B01 (Registros y SubtotalMonedaOriginal por moneda).
SELECT ISNULL(mon.ValorIni, N'Sin dato') AS Moneda, COUNT(*) AS Registros, SUM(ISNULL(a.Subtotal, 0)) AS SubtotalMonedaOriginal
FROM dbo.Planilla a
INNER JOIN dbo.Proyecto pro ON pro.IdProyecto = a.IdProyecto
LEFT JOIN dbo.Constante est ON est.Sociedad='PE01' AND est.Programa='MAESTRO' AND est.Campo='ESTADO' AND est.Correlativo = a.Estado
LEFT JOIN dbo.Constante mon ON mon.Sociedad='PE01' AND mon.Programa='PLANTILLA' AND mon.Campo='TIPO_MONEDA' AND mon.Correlativo = a.TipoMoneda
WHERE TRY_CONVERT(DATE, a.FecIngreso, 101) >= '2026-09-01'
  AND TRY_CONVERT(DATE, a.FecIngreso, 101) <  '2026-10-01'
  AND ISNULL(est.ValorIni, '') COLLATE Latin1_General_100_CI_AI LIKE '%PAGADO%'
GROUP BY ISNULL(mon.ValorIni, N'Sin dato')
ORDER BY COUNT(*) DESC;

-- B04 DETALLE con los mismos filtros: TotalRegistros (primera fila) debe ser igual a la SUMA de Registros del
--     result set 2 de B01 (todas las monedas).
EXEC dbo.sp_IA_Planilla_Buscar @AlcanceNivel='TOTAL', @VerTotalesGlobales=0,
     @FechaInicio='2026-09-01', @FechaFin='2026-09-30', @Estados='PAGADO', @Pagina=1, @TamanoPagina=3;

-- B05 Alcance RESTRINGIDO en RESUMEN: debe resumir solo el universo del empleado (reemplace por un IdEmpleadoCj real).
-- EXEC dbo.sp_IA_Planilla_Buscar @AlcanceNivel='RESTRINGIDO', @AlcanceCampos='RS', @AlcanceEmpleados=N'77',
--      @VerTotalesGlobales=0, @FechaInicio='2026-09-01', @FechaFin='2026-09-30', @Modo='RESUMEN', @AgruparPor='CLIENTE';

-- B06 TIEMPO: compare con el detalle con globales (el RESUMEN no calcula columnas globales y no trae filas).
SET STATISTICS TIME ON;
EXEC dbo.sp_IA_Planilla_Buscar @AlcanceNivel='TOTAL', @VerTotalesGlobales=0,
     @FechaInicio='2026-01-01', @FechaFin='2026-12-31', @Estados='PAGADO',
     @Modo='RESUMEN', @AgruparPor='CLIENTE,MES', @Top=200;
SET STATISTICS TIME OFF;
