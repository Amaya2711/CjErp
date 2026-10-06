/* ================================================================
   COMPARACION (SOLO LECTURA) sp_Planilla_ConsultaIni  (v1, actual)  vs  sp_Planilla_ConsultaIni_v2
   Ejecuta ambos SP con los mismos parametros en varios escenarios y compara:
   filas v1, filas v2, filas solo en v1, filas solo en v2, y tiempo de cada uno.
   Esperado:
     - Escenarios con Estado (0,1,2,3,4,5,7,8,9) y escenario sin fechas: SoloV1 = 0 y SoloV2 = 0.
     - Escenarios Estado NULL + rango de fechas: puede haber SoloV2 > 0 (cambio de regla
       deliberado: v2 usa FechaDeposito si existe, si no FecIngreso). SoloV1 debe ser 0
       salvo recibos con FechaDeposito fuera del rango pero FecIngreso dentro (los pierde v2 por la regla).
   Requisitos: trigger 03 aplicado y validacion 01 con *_sin_date_con_texto = 0.
   ================================================================ */
USE JC_Db;
SET NOCOUNT ON;

DECLARE @cols NVARCHAR(MAX) =
 (SELECT STRING_AGG(CAST(QUOTENAME(name) + N' ' + system_type_name + N' NULL' AS NVARCHAR(MAX)), N',')
         WITHIN GROUP (ORDER BY column_ordinal)
    FROM sys.dm_exec_describe_first_result_set(N'EXEC dbo.sp_Planilla_ConsultaIni', NULL, 0));
IF @cols IS NULL THROW 50000, 'No se pudo describir el resultado de sp_Planilla_ConsultaIni.', 1;

CREATE TABLE #esc (Id INT IDENTITY, Nombre VARCHAR(60), IdEstado INT NULL, Ini DATE NULL, Fin DATE NULL);
DECLARE @hoy DATE = CAST(SYSDATETIME() AS DATE);
INSERT #esc (Nombre, IdEstado, Ini, Fin) VALUES
 ('Estado 4 (pagado) 30 dias',   4, DATEADD(DAY,-30,@hoy), @hoy),
 ('Estado 4 (pagado) 90 dias',   4, DATEADD(DAY,-90,@hoy), @hoy),
 ('Estado 0 30 dias',            0, DATEADD(DAY,-30,@hoy), @hoy),
 ('Estado 1 30 dias',            1, DATEADD(DAY,-30,@hoy), @hoy),
 ('Estado 5 90 dias',            5, DATEADD(DAY,-90,@hoy), @hoy),
 ('Estado 8 90 dias',            8, DATEADD(DAY,-90,@hoy), @hoy),
 ('Estado 9 90 dias',            9, DATEADD(DAY,-90,@hoy), @hoy),
 ('Estado 7 90 dias',            7, DATEADD(DAY,-90,@hoy), @hoy),
 ('Solo FechaInicio (Estado 1)', 1, DATEADD(DAY,-30,@hoy), NULL),
 ('Solo FechaFin (Estado 1)',    1, NULL, @hoy),
 ('SIN estado + 30 dias (regla nueva)', NULL, DATEADD(DAY,-30,@hoy), @hoy),
 ('SIN estado + 90 dias (regla nueva)', NULL, DATEADD(DAY,-90,@hoy), @hoy),
 ('Estado 1 SIN fechas (sin filtro)',  1, NULL, NULL);

CREATE TABLE #res (Escenario VARCHAR(60), FilasV1 INT, FilasV2 INT, SoloV1 INT, SoloV2 INT, MsV1 INT, MsV2 INT);

DECLARE @i INT = 1, @n INT = (SELECT COUNT(*) FROM #esc), @sql NVARCHAR(MAX), @args NVARCHAR(400);
WHILE @i <= @n
BEGIN
    SELECT @args = N'@IdEstado=' + ISNULL(CAST(IdEstado AS NVARCHAR(10)), N'NULL')
                 + N', @FechaInicio=' + ISNULL(N'''' + CONVERT(NVARCHAR(10), Ini, 23) + N'''', N'NULL')
                 + N', @FechaFin='    + ISNULL(N'''' + CONVERT(NVARCHAR(10), Fin, 23) + N'''', N'NULL')
      FROM #esc WHERE Id = @i;

    SET @sql = N'
    CREATE TABLE #a (' + @cols + N'); CREATE TABLE #b (' + @cols + N');
    DECLARE @t DATETIME2, @m1 INT, @m2 INT;
    SET @t = SYSDATETIME(); INSERT #a EXEC dbo.sp_Planilla_ConsultaIni    ' + @args + N'; SET @m1 = DATEDIFF(MILLISECOND,@t,SYSDATETIME());
    SET @t = SYSDATETIME(); INSERT #b EXEC dbo.sp_Planilla_ConsultaIni_v2 ' + @args + N'; SET @m2 = DATEDIFF(MILLISECOND,@t,SYSDATETIME());
    INSERT #res
    SELECT (SELECT Nombre FROM #esc WHERE Id=' + CAST(@i AS NVARCHAR(10)) + N'),
           (SELECT COUNT(*) FROM #a), (SELECT COUNT(*) FROM #b),
           (SELECT COUNT(*) FROM (SELECT * FROM #a EXCEPT SELECT * FROM #b) q),
           (SELECT COUNT(*) FROM (SELECT * FROM #b EXCEPT SELECT * FROM #a) q),
           @m1, @m2;';
    EXEC sys.sp_executesql @sql;
    SET @i += 1;
END

SELECT * FROM #res ORDER BY Escenario;
/* Detalle de diferencias de un escenario: repetir manualmente
   INSERT #a EXEC ... v1 ; INSERT #b EXEC ... v2 ; SELECT * FROM #a EXCEPT SELECT * FROM #b ; y al reves. */
