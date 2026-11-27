/*
  Logistica / Stock - RESTAURA las columnas de COLA de MaterialStock que la proyeccion del sistema nuevo pisó (ver 30).
  PV: NO ejecutado. Requiere la copia del script 28 (bkp.MaterialStock_<sufijo>). Ejecutar DESPUES del 30.

  Que hace
    - Compara la copia (bkp) con MaterialStock actual en las columnas de cola: Solicitado, Aprobado, Despachado, Enviado, Campo,
      Cruce, Cierre, Folio, Culminadas, Excedente, Observada.
    - RESTAURABLE: el valor actual es igual al que proyecto el libro (StockSaldo), o sea el sistema antiguo NO volvio a tocar esas
      columnas desde que fueron pisadas. Se devuelven a los valores de la copia.
    - LEGADO CAMBIO DESPUES (se omite): el sistema antiguo las modifico despues; restaurar la copia borraria esos cambios. Se
      listan para decision humana.
    - Stock se recalcula como Stock_copia + cambio de los buckets compartidos (Disponible, Bloqueado, Recepcionado, Validado),
      igual que la nueva proyeccion. Disponible/Bloqueado/Recepcionado/Validado NO se tocan.
  Uso: poner @Sufijo (el de la tabla bkp.MaterialStock_<sufijo>) y dejar @Aplicar = 0 para ver el listado; con 1 aplica.
*/
SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @Sufijo sysname = N'20261127_0926';
DECLARE @Aplicar bit = 0;

DECLARE @bk sysname = N'MaterialStock_' + @Sufijo;
IF OBJECT_ID(N'bkp.' + QUOTENAME(@bk), N'U') IS NULL
  THROW 52300, 'No existe la copia bkp.MaterialStock_<sufijo>. Revise @Sufijo.', 1;

IF OBJECT_ID(N'tempdb..#rest') IS NOT NULL DROP TABLE #rest;
CREATE TABLE #rest (
  CodPap nvarchar(50) NOT NULL PRIMARY KEY,
  Estado varchar(40) NOT NULL,
  Sol_b numeric(18,4), Apr_b numeric(18,4), Des_b numeric(18,4), Env_b numeric(18,4), Cam_b numeric(18,4), Cru_b numeric(18,4),
  Cie_b numeric(18,4), Fol_b numeric(18,4), Cul_b numeric(18,4), Exc_b numeric(18,4), Obs_b numeric(18,4),
  Stock_nuevo numeric(18,4));

DECLARE @sql nvarchar(max) = N'
;WITH b AS (SELECT CAST(CodPap AS nvarchar(50)) AS CodPap, Stock, Disponible, Bloqueado, Recepcionado, Validado,
                   Solicitado, Aprobado, Despachado, Enviado, Campo, Cruce, Cierre, Folio, Culminadas, Excedente, Observada
            FROM bkp.' + QUOTENAME(@bk) + N'),
m AS (SELECT CAST(CodPap AS nvarchar(50)) AS CodPap, Disponible, Bloqueado, Recepcionado, Validado,
             Solicitado, Aprobado, Despachado, Enviado, Campo, Cruce, Cierre, Folio, Culminadas, Excedente, Observada
      FROM dbo.MaterialStock),
s AS (SELECT CodPap,
             SUM(CASE WHEN Bucket = ''Solicitado'' THEN Cantidad ELSE 0 END) AS Solicitado, SUM(CASE WHEN Bucket = ''Aprobado'' THEN Cantidad ELSE 0 END) AS Aprobado,
             SUM(CASE WHEN Bucket = ''Despachado'' THEN Cantidad ELSE 0 END) AS Despachado, SUM(CASE WHEN Bucket = ''Enviado'' THEN Cantidad ELSE 0 END) AS Enviado,
             SUM(CASE WHEN Bucket = ''Campo'' THEN Cantidad ELSE 0 END) AS Campo, SUM(CASE WHEN Bucket = ''Cruce'' THEN Cantidad ELSE 0 END) AS Cruce,
             SUM(CASE WHEN Bucket = ''Cierre'' THEN Cantidad ELSE 0 END) AS Cierre, SUM(CASE WHEN Bucket = ''Folio'' THEN Cantidad ELSE 0 END) AS Folio,
             SUM(CASE WHEN Bucket = ''Culminadas'' THEN Cantidad ELSE 0 END) AS Culminadas, SUM(CASE WHEN Bucket = ''Excedente'' THEN Cantidad ELSE 0 END) AS Excedente,
             SUM(CASE WHEN Bucket = ''Observada'' THEN Cantidad ELSE 0 END) AS Observada
      FROM dbo.StockSaldo GROUP BY CodPap)
INSERT INTO #rest (CodPap, Estado, Sol_b, Apr_b, Des_b, Env_b, Cam_b, Cru_b, Cie_b, Fol_b, Cul_b, Exc_b, Obs_b, Stock_nuevo)
SELECT b.CodPap,
       CASE WHEN ISNULL(m.Solicitado,0) = ISNULL(s.Solicitado,0) AND ISNULL(m.Aprobado,0) = ISNULL(s.Aprobado,0) AND ISNULL(m.Despachado,0) = ISNULL(s.Despachado,0)
             AND ISNULL(m.Enviado,0) = ISNULL(s.Enviado,0) AND ISNULL(m.Campo,0) = ISNULL(s.Campo,0) AND ISNULL(m.Cruce,0) = ISNULL(s.Cruce,0)
             AND ISNULL(m.Cierre,0) = ISNULL(s.Cierre,0) AND ISNULL(m.Folio,0) = ISNULL(s.Folio,0) AND ISNULL(m.Culminadas,0) = ISNULL(s.Culminadas,0)
             AND ISNULL(m.Excedente,0) = ISNULL(s.Excedente,0) AND ISNULL(m.Observada,0) = ISNULL(s.Observada,0)
            THEN ''RESTAURABLE'' ELSE ''LEGADO CAMBIO DESPUES'' END,
       b.Solicitado, b.Aprobado, b.Despachado, b.Enviado, b.Campo, b.Cruce, b.Cierre, b.Folio, b.Culminadas, b.Excedente, b.Observada,
       ISNULL(b.Stock, 0) + (ISNULL(m.Disponible,0) + ISNULL(m.Bloqueado,0) + ISNULL(m.Recepcionado,0) + ISNULL(m.Validado,0))
                          - (ISNULL(b.Disponible,0) + ISNULL(b.Bloqueado,0) + ISNULL(b.Recepcionado,0) + ISNULL(b.Validado,0))
FROM b JOIN m ON m.CodPap = b.CodPap LEFT JOIN s ON s.CodPap = b.CodPap
WHERE ISNULL(m.Solicitado,0) <> ISNULL(b.Solicitado,0) OR ISNULL(m.Aprobado,0) <> ISNULL(b.Aprobado,0) OR ISNULL(m.Despachado,0) <> ISNULL(b.Despachado,0)
   OR ISNULL(m.Enviado,0) <> ISNULL(b.Enviado,0) OR ISNULL(m.Campo,0) <> ISNULL(b.Campo,0) OR ISNULL(m.Cruce,0) <> ISNULL(b.Cruce,0)
   OR ISNULL(m.Cierre,0) <> ISNULL(b.Cierre,0) OR ISNULL(m.Folio,0) <> ISNULL(b.Folio,0) OR ISNULL(m.Culminadas,0) <> ISNULL(b.Culminadas,0)
   OR ISNULL(m.Excedente,0) <> ISNULL(b.Excedente,0) OR ISNULL(m.Observada,0) <> ISNULL(b.Observada,0);';
EXEC (@sql);

SELECT Estado, COUNT(*) AS Materiales FROM #rest GROUP BY Estado;
SELECT TOP 100 r.CodPap, r.Estado,
       r.Des_b AS Despachado_copia, ms.Despachado AS Despachado_hoy, r.Cam_b AS Campo_copia, ms.Campo AS Campo_hoy, r.Cru_b AS Cruce_copia, ms.Cruce AS Cruce_hoy
FROM #rest r JOIN dbo.MaterialStock ms ON CAST(ms.CodPap AS nvarchar(50)) = r.CodPap ORDER BY r.Estado, r.CodPap;

IF @Aplicar = 1
BEGIN
  BEGIN TRY
    BEGIN TRANSACTION;

    EXEC sys.sp_set_session_context @key = N'StockSync', @value = 1;   -- el trigger no debe capturar este cambio

    UPDATE ms
       SET ms.Solicitado = r.Sol_b, ms.Aprobado = r.Apr_b, ms.Despachado = r.Des_b, ms.Enviado = r.Env_b, ms.Campo = r.Cam_b,
           ms.Cruce = r.Cru_b, ms.Cierre = r.Cie_b, ms.Folio = r.Fol_b, ms.Culminadas = r.Cul_b, ms.Excedente = r.Exc_b,
           ms.Observada = r.Obs_b, ms.Stock = r.Stock_nuevo
    FROM dbo.MaterialStock ms
    JOIN #rest r ON r.CodPap = CAST(ms.CodPap AS nvarchar(50))
    WHERE r.Estado = 'RESTAURABLE';

    DECLARE @n int = @@ROWCOUNT;
    EXEC sys.sp_set_session_context @key = N'StockSync', @value = 0;
    COMMIT TRANSACTION;
    SELECT @n AS MaterialesRestaurados;
  END TRY
  BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    EXEC sys.sp_set_session_context @key = N'StockSync', @value = 0;
    THROW;
  END CATCH;
END;
