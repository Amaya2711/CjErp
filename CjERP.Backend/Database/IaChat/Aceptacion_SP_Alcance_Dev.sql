-- ============================================================================
-- ACEPTACION del SP con alcance (02_sp_IA_Planilla_Buscar_Alcance.sql) — SOLO DESARROLLO.
-- NO EJECUTADO por quien lo preparo. Ejecutar unicamente en la BD de DESARROLLO, DESPUES de desplegar
-- el script 02 ahi. Solo invoca el SP y consulta: no crea ni modifica objetos ni datos.
-- La parte A se autoverifica (PASS/FAIL). La parte B requiere identificadores REALES de desarrollo
-- (reemplazar los NULL de las variables; con NULL el script se detiene) y comparar a ojo contra un
-- oraculo escrito de forma independiente (no reutiliza el codigo del SP).
-- ============================================================================
SET NOCOUNT ON;

-- ---------------------------------------------------------------------------
-- A. VALIDACION DE PARAMETROS (falla cerrada): cada caso debe terminar en el error esperado.
-- ---------------------------------------------------------------------------
DECLARE @R TABLE
(
    Caso      NVARCHAR(120) NOT NULL,
    Esperado  INT NOT NULL,
    Obtenido  INT NULL,
    Resultado AS (CASE WHEN Esperado = ISNULL(Obtenido, 0) THEN 'PASS' ELSE 'FAIL' END)
);

DECLARE @Grande NVARCHAR(MAX) =
(
    SELECT STRING_AGG(CONVERT(NVARCHAR(10), n), N',')
    FROM (SELECT TOP (501) ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) AS n FROM sys.all_objects a CROSS JOIN sys.all_columns b) x
);

-- A01 sin parametros de alcance (backend antiguo)
BEGIN TRY EXEC dbo.sp_IA_Planilla_Buscar @Pagina = 1, @TamanoPagina = 1; INSERT @R VALUES (N'A01 sin alcance', 50010, 0); END TRY
BEGIN CATCH INSERT @R VALUES (N'A01 sin alcance', 50010, ERROR_NUMBER()); END CATCH;

-- A02 nivel invalido
BEGIN TRY EXEC dbo.sp_IA_Planilla_Buscar @AlcanceNivel = 'X', @VerTotalesGlobales = 0; INSERT @R VALUES (N'A02 nivel invalido', 50010, 0); END TRY
BEGIN CATCH INSERT @R VALUES (N'A02 nivel invalido', 50010, ERROR_NUMBER()); END CATCH;

-- A03 VerTotalesGlobales ausente
BEGIN TRY EXEC dbo.sp_IA_Planilla_Buscar @AlcanceNivel = 'TOTAL'; INSERT @R VALUES (N'A03 sin VerTotalesGlobales', 50011, 0); END TRY
BEGIN CATCH INSERT @R VALUES (N'A03 sin VerTotalesGlobales', 50011, ERROR_NUMBER()); END CATCH;

-- A04 TOTAL con lista / con campos
BEGIN TRY EXEC dbo.sp_IA_Planilla_Buscar @AlcanceNivel = 'TOTAL', @AlcanceEmpleados = N'1', @VerTotalesGlobales = 0; INSERT @R VALUES (N'A04 TOTAL con lista', 50012, 0); END TRY
BEGIN CATCH INSERT @R VALUES (N'A04 TOTAL con lista', 50012, ERROR_NUMBER()); END CATCH;
BEGIN TRY EXEC dbo.sp_IA_Planilla_Buscar @AlcanceNivel = 'TOTAL', @AlcanceCampos = 'RS', @VerTotalesGlobales = 0; INSERT @R VALUES (N'A05 TOTAL con campos', 50012, 0); END TRY
BEGIN CATCH INSERT @R VALUES (N'A05 TOTAL con campos', 50012, ERROR_NUMBER()); END CATCH;

-- A06 campos invalidos / ausentes
BEGIN TRY EXEC dbo.sp_IA_Planilla_Buscar @AlcanceNivel = 'RESTRINGIDO', @AlcanceCampos = 'X', @AlcanceEmpleados = N'1', @VerTotalesGlobales = 0; INSERT @R VALUES (N'A06 campos invalidos', 50013, 0); END TRY
BEGIN CATCH INSERT @R VALUES (N'A06 campos invalidos', 50013, ERROR_NUMBER()); END CATCH;
BEGIN TRY EXEC dbo.sp_IA_Planilla_Buscar @AlcanceNivel = 'RESTRINGIDO', @AlcanceEmpleados = N'1', @VerTotalesGlobales = 0; INSERT @R VALUES (N'A07 campos ausentes', 50013, 0); END TRY
BEGIN CATCH INSERT @R VALUES (N'A07 campos ausentes', 50013, ERROR_NUMBER()); END CATCH;

-- A08 lista ausente / vacia
BEGIN TRY EXEC dbo.sp_IA_Planilla_Buscar @AlcanceNivel = 'RESTRINGIDO', @AlcanceCampos = 'RS', @VerTotalesGlobales = 0; INSERT @R VALUES (N'A08 lista ausente', 50014, 0); END TRY
BEGIN CATCH INSERT @R VALUES (N'A08 lista ausente', 50014, ERROR_NUMBER()); END CATCH;
BEGIN TRY EXEC dbo.sp_IA_Planilla_Buscar @AlcanceNivel = 'RESTRINGIDO', @AlcanceCampos = 'RS', @AlcanceEmpleados = N'', @VerTotalesGlobales = 0; INSERT @R VALUES (N'A09 lista vacia', 50014, 0); END TRY
BEGIN CATCH INSERT @R VALUES (N'A09 lista vacia', 50014, ERROR_NUMBER()); END CATCH;

-- A10..A13 caracteres no permitidos
BEGIN TRY EXEC dbo.sp_IA_Planilla_Buscar @AlcanceNivel = 'RESTRINGIDO', @AlcanceCampos = 'RS', @AlcanceEmpleados = N'1;2', @VerTotalesGlobales = 0; INSERT @R VALUES (N'A10 separador ;', 50015, 0); END TRY
BEGIN CATCH INSERT @R VALUES (N'A10 separador ;', 50015, ERROR_NUMBER()); END CATCH;
BEGIN TRY EXEC dbo.sp_IA_Planilla_Buscar @AlcanceNivel = 'RESTRINGIDO', @AlcanceCampos = 'RS', @AlcanceEmpleados = N'-1', @VerTotalesGlobales = 0; INSERT @R VALUES (N'A11 negativo', 50015, 0); END TRY
BEGIN CATCH INSERT @R VALUES (N'A11 negativo', 50015, ERROR_NUMBER()); END CATCH;
BEGIN TRY EXEC dbo.sp_IA_Planilla_Buscar @AlcanceNivel = 'RESTRINGIDO', @AlcanceCampos = 'RS', @AlcanceEmpleados = N'1, 2', @VerTotalesGlobales = 0; INSERT @R VALUES (N'A12 espacio', 50015, 0); END TRY
BEGIN CATCH INSERT @R VALUES (N'A12 espacio', 50015, ERROR_NUMBER()); END CATCH;
BEGIN TRY EXEC dbo.sp_IA_Planilla_Buscar @AlcanceNivel = 'RESTRINGIDO', @AlcanceCampos = 'RS', @AlcanceEmpleados = N'1 OR 1=1', @VerTotalesGlobales = 0; INSERT @R VALUES (N'A13 inyeccion', 50015, 0); END TRY
BEGIN CATCH INSERT @R VALUES (N'A13 inyeccion', 50015, ERROR_NUMBER()); END CATCH;

-- A14..A17 elementos vacios o demasiado largos
BEGIN TRY EXEC dbo.sp_IA_Planilla_Buscar @AlcanceNivel = 'RESTRINGIDO', @AlcanceCampos = 'RS', @AlcanceEmpleados = N'1,,2', @VerTotalesGlobales = 0; INSERT @R VALUES (N'A14 elemento vacio', 50016, 0); END TRY
BEGIN CATCH INSERT @R VALUES (N'A14 elemento vacio', 50016, ERROR_NUMBER()); END CATCH;
BEGIN TRY EXEC dbo.sp_IA_Planilla_Buscar @AlcanceNivel = 'RESTRINGIDO', @AlcanceCampos = 'RS', @AlcanceEmpleados = N',1', @VerTotalesGlobales = 0; INSERT @R VALUES (N'A15 coma inicial', 50016, 0); END TRY
BEGIN CATCH INSERT @R VALUES (N'A15 coma inicial', 50016, ERROR_NUMBER()); END CATCH;
BEGIN TRY EXEC dbo.sp_IA_Planilla_Buscar @AlcanceNivel = 'RESTRINGIDO', @AlcanceCampos = 'RS', @AlcanceEmpleados = N'1,', @VerTotalesGlobales = 0; INSERT @R VALUES (N'A16 coma final', 50016, 0); END TRY
BEGIN CATCH INSERT @R VALUES (N'A16 coma final', 50016, ERROR_NUMBER()); END CATCH;
BEGIN TRY EXEC dbo.sp_IA_Planilla_Buscar @AlcanceNivel = 'RESTRINGIDO', @AlcanceCampos = 'RS', @AlcanceEmpleados = N'1234567890', @VerTotalesGlobales = 0; INSERT @R VALUES (N'A17 10 digitos', 50016, 0); END TRY
BEGIN CATCH INSERT @R VALUES (N'A17 10 digitos', 50016, ERROR_NUMBER()); END CATCH;

-- A18 sin identificadores positivos
BEGIN TRY EXEC dbo.sp_IA_Planilla_Buscar @AlcanceNivel = 'RESTRINGIDO', @AlcanceCampos = 'RS', @AlcanceEmpleados = N'0,0', @VerTotalesGlobales = 0; INSERT @R VALUES (N'A18 solo ceros', 50017, 0); END TRY
BEGIN CATCH INSERT @R VALUES (N'A18 solo ceros', 50017, ERROR_NUMBER()); END CATCH;

-- A19 mas de 500 identificadores
BEGIN TRY EXEC dbo.sp_IA_Planilla_Buscar @AlcanceNivel = 'RESTRINGIDO', @AlcanceCampos = 'RS', @AlcanceEmpleados = @Grande, @VerTotalesGlobales = 0; INSERT @R VALUES (N'A19 501 ids', 50018, 0); END TRY
BEGIN CATCH INSERT @R VALUES (N'A19 501 ids', 50018, ERROR_NUMBER()); END CATCH;

SELECT Caso, Esperado, Obtenido, Resultado FROM @R ORDER BY Caso;
IF EXISTS (SELECT 1 FROM @R WHERE Resultado = 'FAIL')
    PRINT 'PARTE A: HAY CASOS FAIL - NO continuar.';
ELSE
    PRINT 'PARTE A: todos los casos PASS.';

-- ---------------------------------------------------------------------------
-- B. DATOS REALES DE DESARROLLO (reemplazar los NULL; escribir CSV canonico "1,2,3").
-- ---------------------------------------------------------------------------
DECLARE @ListaPropio  NVARCHAR(MAX) = NULL;   -- p.ej. N'123'          (EmpleadoCj.IdEmpleado del titular)
DECLARE @ListaEquipo  NVARCHAR(MAX) = NULL;   -- p.ej. N'123,130,131'  (titular + subordinados directos)
DECLARE @CsvOtroEmp   NVARCHAR(MAX) = NULL;   -- empleado AJENO al equipo, para comprobar exclusion
IF @ListaPropio IS NULL OR @ListaEquipo IS NULL OR @CsvOtroEmp IS NULL
BEGIN
    PRINT 'Defina @ListaPropio, @ListaEquipo y @CsvOtroEmp para ejecutar la parte B.';
    RETURN;
END;

-- ORACULO (independiente del SP): cuantas filas de Planilla pertenecen a una lista segun la regla
-- "responsable O solicitante" (responsable = Empleado(IdResponsable).IdEmpleadoCj;
--  solicitante = IdWeb=1 ? EmpleadoCj(IdSolicitante).IdEmpleado : Empleado(IdSolicitante).IdEmpleadoCj).
-- Sin filtros de fecha/estado/texto: se compara contra TotalRegistros del SP con los mismos (ningun) filtros.
-- B01..B03: ejecutar el oraculo y el SP y comparar:  <conteo oraculo>  ==  TotalRegistros (primera fila del SP).
DECLARE @Oraculo TABLE (Caso NVARCHAR(40), Conteo INT);

INSERT @Oraculo
SELECT N'B01 Propio (RS)', COUNT(*)
FROM dbo.Planilla a
INNER JOIN dbo.Proyecto pro ON pro.IdProyecto = a.IdProyecto
LEFT JOIN dbo.Empleado emp ON emp.IdEmpleado = a.IdResponsable
LEFT JOIN dbo.Empleado m_emp ON m_emp.IdEmpleado = a.IdSolicitante AND ISNULL(a.IdWeb, 0) <> 1
LEFT JOIN dbo.EmpleadoCj m_cj ON m_cj.IdEmpleado = a.IdSolicitante AND ISNULL(a.IdWeb, 0) = 1
WHERE emp.IdEmpleadoCj IN (SELECT CONVERT(INT, value) FROM STRING_SPLIT(@ListaPropio, N','))
   OR (CASE WHEN ISNULL(a.IdWeb, 0) = 1 THEN m_cj.IdEmpleado ELSE m_emp.IdEmpleadoCj END)
      IN (SELECT CONVERT(INT, value) FROM STRING_SPLIT(@ListaPropio, N','));

INSERT @Oraculo
SELECT N'B02 Equipo (RS)', COUNT(*)
FROM dbo.Planilla a
INNER JOIN dbo.Proyecto pro ON pro.IdProyecto = a.IdProyecto
LEFT JOIN dbo.Empleado emp ON emp.IdEmpleado = a.IdResponsable
LEFT JOIN dbo.Empleado m_emp ON m_emp.IdEmpleado = a.IdSolicitante AND ISNULL(a.IdWeb, 0) <> 1
LEFT JOIN dbo.EmpleadoCj m_cj ON m_cj.IdEmpleado = a.IdSolicitante AND ISNULL(a.IdWeb, 0) = 1
WHERE emp.IdEmpleadoCj IN (SELECT CONVERT(INT, value) FROM STRING_SPLIT(@ListaEquipo, N','))
   OR (CASE WHEN ISNULL(a.IdWeb, 0) = 1 THEN m_cj.IdEmpleado ELSE m_emp.IdEmpleadoCj END)
      IN (SELECT CONVERT(INT, value) FROM STRING_SPLIT(@ListaEquipo, N','));

INSERT @Oraculo
SELECT N'B03 Total', COUNT(*)
FROM dbo.Planilla a
INNER JOIN dbo.Proyecto pro ON pro.IdProyecto = a.IdProyecto;

SELECT * FROM @Oraculo ORDER BY Caso;

-- B01 Propio: TotalRegistros (columna de la primera fila) debe igualar el conteo B01.
EXEC dbo.sp_IA_Planilla_Buscar @AlcanceNivel = 'RESTRINGIDO', @AlcanceCampos = 'RS', @AlcanceEmpleados = @ListaPropio, @VerTotalesGlobales = 0, @Pagina = 1, @TamanoPagina = 5;
-- B02 Equipo: igual al conteo B02 (y >= B01 si el titular esta en el equipo).
EXEC dbo.sp_IA_Planilla_Buscar @AlcanceNivel = 'RESTRINGIDO', @AlcanceCampos = 'RS', @AlcanceEmpleados = @ListaEquipo, @VerTotalesGlobales = 0, @Pagina = 1, @TamanoPagina = 5;
-- B03 Total: igual al conteo B03.
EXEC dbo.sp_IA_Planilla_Buscar @AlcanceNivel = 'TOTAL', @VerTotalesGlobales = 0, @Pagina = 1, @TamanoPagina = 5;

-- B04 Solo responsable (R) y solo solicitante (S): R + S - interseccion = RS. Comparar contra el oraculo por campo.
EXEC dbo.sp_IA_Planilla_Buscar @AlcanceNivel = 'RESTRINGIDO', @AlcanceCampos = 'R', @AlcanceEmpleados = @ListaEquipo, @VerTotalesGlobales = 0, @Pagina = 1, @TamanoPagina = 5;
EXEC dbo.sp_IA_Planilla_Buscar @AlcanceNivel = 'RESTRINGIDO', @AlcanceCampos = 'S', @AlcanceEmpleados = @ListaEquipo, @VerTotalesGlobales = 0, @Pagina = 1, @TamanoPagina = 5;

-- B05 Un empleado ajeno al equipo no aporta filas nuevas: TotalRegistros(@CsvOtroEmp) debe ser el conteo de ESE empleado
--     y NINGUNA fila de B02 debe cambiar al pedir @ListaEquipo (verificar que no aparecen filas de @CsvOtroEmp en B02 salvo coincidencia legitima).
EXEC dbo.sp_IA_Planilla_Buscar @AlcanceNivel = 'RESTRINGIDO', @AlcanceCampos = 'RS', @AlcanceEmpleados = @CsvOtroEmp, @VerTotalesGlobales = 0, @Pagina = 1, @TamanoPagina = 5;

-- B06 Filtro de usuario SOLO reduce: pedir un Responsable por NOMBRE ajeno al equipo con alcance de equipo
--     debe devolver <= B02 (normalmente 0), nunca ampliar. Sustituir el nombre por uno real ajeno.
EXEC dbo.sp_IA_Planilla_Buscar @AlcanceNivel = 'RESTRINGIDO', @AlcanceCampos = 'RS', @AlcanceEmpleados = @ListaEquipo, @VerTotalesGlobales = 0, @Responsable = N'NOMBRE_AJENO', @Pagina = 1, @TamanoPagina = 5;

-- B07 Totales globales: SIN permiso las columnas globales (15 de la Fase 2 + 6 de la version 2, script 16) deben ser NULL (no 0); CON permiso, con valores.
EXEC dbo.sp_IA_Planilla_Buscar @AlcanceNivel = 'RESTRINGIDO', @AlcanceCampos = 'RS', @AlcanceEmpleados = @ListaPropio, @VerTotalesGlobales = 0, @Pagina = 1, @TamanoPagina = 5;
EXEC dbo.sp_IA_Planilla_Buscar @AlcanceNivel = 'RESTRINGIDO', @AlcanceCampos = 'RS', @AlcanceEmpleados = @ListaPropio, @VerTotalesGlobales = 1, @Pagina = 1, @TamanoPagina = 5;
--     Paridad de calculos: para el MISMO IdPlanilla, las 15 columnas con permiso deben igualar las del SP
--     ANTERIOR (version vigente antes del cambio, en un entorno que aun la conserve) con los mismos filtros.

-- B08 Paginacion: TotalRegistros identico en todas las paginas y sin filas repetidas entre paginas.
EXEC dbo.sp_IA_Planilla_Buscar @AlcanceNivel = 'RESTRINGIDO', @AlcanceCampos = 'RS', @AlcanceEmpleados = @ListaEquipo, @VerTotalesGlobales = 0, @Pagina = 1, @TamanoPagina = 3;
EXEC dbo.sp_IA_Planilla_Buscar @AlcanceNivel = 'RESTRINGIDO', @AlcanceCampos = 'RS', @AlcanceEmpleados = @ListaEquipo, @VerTotalesGlobales = 0, @Pagina = 2, @TamanoPagina = 3;
EXEC dbo.sp_IA_Planilla_Buscar @AlcanceNivel = 'RESTRINGIDO', @AlcanceCampos = 'RS', @AlcanceEmpleados = @ListaEquipo, @VerTotalesGlobales = 0, @Pagina = 3, @TamanoPagina = 3;

-- B09 PLAN DE EJECUCION (verifica la INTENCION de omitir los 4 APPLY globales; hoy NO verificada):
--     activar "Incluir plan de ejecucion real" / SET STATISTICS IO ON y comparar B07 sin y con permiso.
--     Esperado SIN permiso: sin lecturas sobre Importar / detOrdenCompra / Planilla(p, pla) en los APPLY globales.
--     Si el plan los sigue ejecutando, la omision NO se logro (los NULL siguen siendo correctos, el costo no baja).
