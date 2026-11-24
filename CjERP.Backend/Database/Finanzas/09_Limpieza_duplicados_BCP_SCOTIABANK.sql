/*
  09_Limpieza_duplicados_BCP_SCOTIABANK.sql
  Problema: movimientos del BCP quedaron grabados dos veces (BCP y SCOTIABANK) porque el indice unico incluye IdBanco.
  Solucion: conservar la fila BCP y retirar la copia SCOTIABANK (cuenta con formato BCP, no CCMN/CCME).
  Seguridad:
   - PASO 1 es solo lectura: revisar antes de continuar.
   - PASO 2 respalda en dbo.MovimientosConciliacion_RespaldoDupBcpScotia y borra en una transaccion;
     solo confirma si se borran exactamente las filas esperadas.
   - NO se retira una copia que tenga mas avance de conciliacion que su original BCP (se lista aparte para revisar a mano).
  NO ejecutado automaticamente.
*/

------------------------------------------------------------------------------
-- PASO 1: SOLO LECTURA
------------------------------------------------------------------------------
IF OBJECT_ID('tempdb..#Copias') IS NOT NULL DROP TABLE #Copias;

SELECT  s.IdMovimientoBanco AS IdCopia,
        b.IdMovimientoBanco AS IdOriginal,
        s.Cuenta, s.Fecha, s.Monto, s.NroOperacion,
        s.EsConciliado AS CopiaConciliada,
        b.EsConciliado AS OriginalConciliado
INTO    #Copias
FROM    dbo.MovimientosConciliacion s
JOIN    dbo.MovimientosConciliacion b
          ON  b.CodigoBanco = 'BCP'
          AND b.IdActivo = 1
          AND b.Cuenta = s.Cuenta
          AND b.Fecha = s.Fecha
          AND b.Monto = s.Monto
          AND ISNULL(b.NroOperacion, '') = ISNULL(s.NroOperacion, '')
          AND ISNULL(b.DescripcionOperacion, '') = ISNULL(s.DescripcionOperacion, '')
WHERE   s.CodigoBanco = 'SCOTIABANK'
  AND   s.IdActivo = 1
  AND   s.Cuenta NOT LIKE 'CCM%';

SELECT 'Copias SCOTIABANK con original BCP' AS Concepto, COUNT(*) AS Filas FROM #Copias
UNION ALL
SELECT 'De ellas, retirables (la copia no tiene mas avance que el original)', COUNT(*)
FROM #Copias WHERE NOT (CopiaConciliada = 1 AND ISNULL(OriginalConciliado, 0) = 0)
UNION ALL
SELECT 'De ellas, a revisar a mano (copia conciliada y original no)', COUNT(*)
FROM #Copias WHERE CopiaConciliada = 1 AND ISNULL(OriginalConciliado, 0) = 0
UNION ALL
SELECT 'SCOTIABANK con cuenta formato BCP SIN original BCP (no se tocan)', COUNT(*)
FROM dbo.MovimientosConciliacion s
WHERE s.CodigoBanco = 'SCOTIABANK' AND s.IdActivo = 1 AND s.Cuenta NOT LIKE 'CCM%'
  AND s.IdMovimientoBanco NOT IN (SELECT IdCopia FROM #Copias);

-- Detalle de las que requieren revision manual
SELECT * FROM #Copias WHERE CopiaConciliada = 1 AND ISNULL(OriginalConciliado, 0) = 0;

-- Detalle de las que no tienen original (por si hay algo legitimo)
SELECT s.IdMovimientoBanco, s.Cuenta, s.Fecha, s.Monto, s.NroOperacion, s.DescripcionOperacion, s.EsConciliado
FROM dbo.MovimientosConciliacion s
WHERE s.CodigoBanco = 'SCOTIABANK' AND s.IdActivo = 1 AND s.Cuenta NOT LIKE 'CCM%'
  AND s.IdMovimientoBanco NOT IN (SELECT IdCopia FROM #Copias)
ORDER BY s.Fecha DESC;
GO

------------------------------------------------------------------------------
-- PASO 2: RESPALDO + BORRADO (ejecutar solo despues de revisar el PASO 1)
-- Ejecutar el PASO 1 y el PASO 2 en la misma sesion (usa la tabla temporal #Copias).
------------------------------------------------------------------------------
/*
IF OBJECT_ID('dbo.MovimientosConciliacion_RespaldoDupBcpScotia') IS NULL
BEGIN
    -- UNION ALL evita arrastrar la propiedad IDENTITY a la tabla de respaldo.
    SELECT * INTO dbo.MovimientosConciliacion_RespaldoDupBcpScotia
    FROM (SELECT * FROM dbo.MovimientosConciliacion WHERE 1 = 0
          UNION ALL
          SELECT * FROM dbo.MovimientosConciliacion WHERE 1 = 0) x;
END

DECLARE @Esperadas INT =
    (SELECT COUNT(*) FROM #Copias WHERE NOT (CopiaConciliada = 1 AND ISNULL(OriginalConciliado, 0) = 0));
DECLARE @Afectadas INT;

BEGIN TRAN;

INSERT INTO dbo.MovimientosConciliacion_RespaldoDupBcpScotia
SELECT m.*
FROM dbo.MovimientosConciliacion m
WHERE m.IdMovimientoBanco IN
      (SELECT IdCopia FROM #Copias WHERE NOT (CopiaConciliada = 1 AND ISNULL(OriginalConciliado, 0) = 0));

DELETE m
FROM dbo.MovimientosConciliacion m
WHERE m.IdMovimientoBanco IN
      (SELECT IdCopia FROM #Copias WHERE NOT (CopiaConciliada = 1 AND ISNULL(OriginalConciliado, 0) = 0));

SET @Afectadas = @@ROWCOUNT;

IF @Afectadas = @Esperadas
BEGIN
    COMMIT;
    SELECT 'OK: filas retiradas y respaldadas' AS Resultado, @Afectadas AS Filas;
END
ELSE
BEGIN
    ROLLBACK;
    SELECT 'REVERTIDO: la cantidad no coincide' AS Resultado, @Esperadas AS Esperadas, @Afectadas AS Afectadas;
END
*/
