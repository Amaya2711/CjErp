/*
  Logistica / Stock - VISTAS de conciliacion. PV: no ejecutado ni probado contra la BD.
  vStockConciliacion : por CodPap y bucket, lo que dice MaterialStock (proyeccion / sistema antiguo) vs StockSaldo (libro).
  vStockDescuadres   : solo las diferencias y los saldos negativos. Debe estar vacia cuando todo cuadra.
*/
SET NOCOUNT ON;
GO

CREATE OR ALTER VIEW dbo.vStockConciliacion
AS
WITH legacy AS (
  SELECT s.CodPap, v.Bucket, CAST(ISNULL(v.Cantidad, 0) AS decimal(18,4)) AS Cantidad
  FROM dbo.MaterialStock s
  CROSS APPLY (VALUES
    ('Recepcionado', s.Recepcionado), ('Validado', s.Validado), ('Disponible', s.Disponible), ('Bloqueado', s.Bloqueado),
    ('Solicitado', s.Solicitado), ('Aprobado', s.Aprobado), ('Despachado', s.Despachado), ('Enviado', s.Enviado),
    ('Campo', s.Campo), ('Cruce', s.Cruce), ('Cierre', s.Cierre), ('Folio', s.Folio), ('Culminadas', s.Culminadas),
    ('Excedente', s.Excedente), ('Observada', s.Observada)
  ) v (Bucket, Cantidad)
),
libro AS (
  SELECT CodPap, Bucket, SUM(Cantidad) AS Cantidad
  FROM dbo.StockSaldo
  GROUP BY CodPap, Bucket
)
SELECT COALESCE(l.CodPap, g.CodPap) AS CodPap,
       COALESCE(l.Bucket, g.Bucket) AS Bucket,
       ISNULL(l.Cantidad, 0) AS EnMaterialStock,
       CAST(ISNULL(g.Cantidad, 0) AS decimal(18,4)) AS EnStockSaldo,
       ISNULL(l.Cantidad, 0) - CAST(ISNULL(g.Cantidad, 0) AS decimal(18,4)) AS Diferencia
FROM legacy l
FULL OUTER JOIN libro g ON g.CodPap = l.CodPap AND g.Bucket = l.Bucket;
GO

CREATE OR ALTER VIEW dbo.vStockDescuadres
AS
SELECT CodPap, Bucket, EnMaterialStock, EnStockSaldo, Diferencia,
       CASE WHEN EnStockSaldo < 0 THEN N'SALDO NEGATIVO' ELSE N'DIFERENCIA' END AS Tipo
FROM dbo.vStockConciliacion
WHERE Diferencia <> 0 OR EnStockSaldo < 0;
GO
