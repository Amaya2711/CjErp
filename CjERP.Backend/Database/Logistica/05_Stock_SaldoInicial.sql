/*
  Logistica / Stock - CARGA DEL SALDO INICIAL DESDE LOS DOCUMENTOS (reemplaza la version que copiaba MaterialStock).
  PV: no ejecutado ni probado contra la BD.

  Motivo: el diagnostico (00) mostro que los buckets de cola de MaterialStock estan corruptos (Solicitado y Cruce
  negativos por millones, Culminadas en 0). Por eso el saldo se reconstruye asi:
    - Colas (Aprobado..Culminadas): suma de DetSolicitud.CantSap por IdEstado (IdDespacho = 1), mismo mapeo del diagnostico.
    - Disponible, material con serie (CodPap 40*): cantidad de series en DetLogistica con IdEstado = 2.
    - Disponible, resto: MaterialStock.Disponible si es positivo.
    - Bloqueado, Excedente, Observada, Recepcionado, Validado: MaterialStock si es positivo (no hay otra fuente).
  NO habilita el trigger 04 (el trigger copiaria al libro los descuentos erroneos del sistema antiguo).
  Todo CodPap cuyo valor en MaterialStock difiera del reconstruido queda en dbo.StockSaldoInicialExcepcion para revision.
  Ejecutar UNA sola vez; se niega si StockSaldo ya tiene datos. Reversa: 99_Reversa_Stock.sql.
*/
SET NOCOUNT ON;
SET XACT_ABORT ON;

IF EXISTS (SELECT 1 FROM dbo.StockSaldo)
  THROW 52001, 'StockSaldo ya tiene datos: el saldo inicial ya fue cargado.', 1;

IF OBJECT_ID(N'dbo.StockSaldoInicialExcepcion', N'U') IS NULL
  CREATE TABLE dbo.StockSaldoInicialExcepcion (
    CodPap          varchar(30)   NOT NULL,
    Bucket          varchar(20)   NOT NULL,
    EnMaterialStock decimal(18,4) NOT NULL,
    Reconstruido    decimal(18,4) NOT NULL,
    Diferencia      decimal(18,4) NOT NULL,
    Fecha           datetime2(0)  NOT NULL CONSTRAINT DF_StockSaldoIniExc_Fecha DEFAULT (SYSDATETIME()),
    CONSTRAINT PK_StockSaldoInicialExcepcion PRIMARY KEY (CodPap, Bucket)
  );

IF OBJECT_ID(N'tempdb..#Origen') IS NOT NULL DROP TABLE #Origen;

;WITH colas AS (
  SELECT d.CodPap,
         CASE
           WHEN d.IdEstado = 9  THEN 'Aprobado'
           WHEN d.IdEstado = 4  THEN 'Despachado'
           WHEN d.IdEstado = 5  THEN 'Enviado'
           WHEN d.IdEstado = 11 THEN 'Campo'
           WHEN d.IdEstado = 14 THEN 'Cruce'
           WHEN d.IdEstado IN (21, 7, 22, 23, 24, 25) THEN 'Cierre'
           WHEN d.IdEstado = 16 THEN 'Folio'
           WHEN d.IdEstado = 20 THEN 'Culminadas'
         END AS Bucket,
         CAST(d.CantSap AS decimal(18,4)) AS Cantidad
  FROM dbo.DetSolicitud d
  WHERE d.IdDespacho = 1
),
series AS (
  SELECT l.CodPap, CAST(COUNT(*) AS decimal(18,4)) AS Cantidad
  FROM dbo.DetLogistica l
  WHERE l.IdEstado = 2 AND ISNULL(l.Serie, '') NOT IN ('', 'NO APLICA')
  GROUP BY l.CodPap
),
ms AS (
  SELECT s.CodPap, v.Bucket, CAST(ISNULL(v.Cantidad, 0) AS decimal(18,4)) AS Cantidad
  FROM dbo.MaterialStock s
  CROSS APPLY (VALUES
    ('Disponible', s.Disponible), ('Bloqueado', s.Bloqueado), ('Excedente', s.Excedente), ('Observada', s.Observada),
    ('Recepcionado', s.Recepcionado), ('Validado', s.Validado)
  ) v (Bucket, Cantidad)
)
SELECT CodPap, Bucket, SUM(Cantidad) AS Cantidad
INTO #Origen
FROM (
  SELECT CodPap, Bucket, Cantidad FROM colas WHERE Bucket IS NOT NULL
  UNION ALL
  SELECT CodPap, 'Disponible', Cantidad FROM series
  UNION ALL
  SELECT CodPap, Bucket, Cantidad FROM ms
  WHERE Cantidad > 0
    AND NOT (Bucket = 'Disponible' AND EXISTS (SELECT 1 FROM series x WHERE x.CodPap = ms.CodPap))
) u
GROUP BY CodPap, Bucket
HAVING SUM(Cantidad) > 0;

BEGIN TRANSACTION;

  INSERT INTO dbo.StockSaldo (CodPap, IdAlmacen, Bucket, Cantidad)
  SELECT CodPap, 0, Bucket, Cantidad FROM #Origen;

  INSERT INTO dbo.StockMovimiento (CodPap, IdAlmacen, BucketOrigen, BucketDestino, Cantidad, Operacion, Usuario, Observacion)
  SELECT CodPap, 0, NULL, Bucket, Cantidad, 'SALDO_INICIAL', ORIGINAL_LOGIN(), N'Carga inicial reconstruida desde documentos'
  FROM #Origen;

  -- Excepciones: todo bucket donde MaterialStock difiere de lo reconstruido (incluye negativos del sistema antiguo).
  INSERT INTO dbo.StockSaldoInicialExcepcion (CodPap, Bucket, EnMaterialStock, Reconstruido, Diferencia)
  SELECT x.CodPap, x.Bucket, x.EnMaterialStock, ISNULL(o.Cantidad, 0), ISNULL(o.Cantidad, 0) - x.EnMaterialStock
  FROM (
    SELECT s.CodPap, v.Bucket, CAST(ISNULL(v.Cantidad, 0) AS decimal(18,4)) AS EnMaterialStock
    FROM dbo.MaterialStock s
    CROSS APPLY (VALUES
      ('Disponible', s.Disponible), ('Bloqueado', s.Bloqueado), ('Excedente', s.Excedente), ('Observada', s.Observada),
      ('Recepcionado', s.Recepcionado), ('Validado', s.Validado), ('Aprobado', s.Aprobado), ('Despachado', s.Despachado),
      ('Enviado', s.Enviado), ('Campo', s.Campo), ('Cruce', s.Cruce), ('Cierre', s.Cierre), ('Folio', s.Folio),
      ('Culminadas', s.Culminadas)
    ) v (Bucket, Cantidad)
  ) x
  LEFT JOIN #Origen o ON o.CodPap = x.CodPap AND o.Bucket = x.Bucket
  WHERE ISNULL(o.Cantidad, 0) <> x.EnMaterialStock;

COMMIT TRANSACTION;

SELECT (SELECT COUNT(*) FROM dbo.StockSaldo)                    AS FilasSaldo,
       (SELECT COUNT(*) FROM dbo.StockMovimiento)               AS FilasLibro,
       (SELECT COUNT(*) FROM dbo.StockSaldoInicialExcepcion)    AS Excepciones;

SELECT Bucket, COUNT(*) AS Casos, SUM(Diferencia) AS DiferenciaTotal
FROM dbo.StockSaldoInicialExcepcion
GROUP BY Bucket
ORDER BY Bucket;
