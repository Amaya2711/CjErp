/*
  Logistica / Stock - DIAGNOSTICO DE SOLO LECTURA (no modifica datos).
  Ejecutar en la BD antes de desplegar 01..04. Pegar los resultados para validar las reglas.

  Modelo de "colas" del sistema antiguo (cada bucket = unidades pendientes de la SIGUIENTE etapa):
    Aprobado   = solicitado, pendiente de aprobar          (DetSolicitud.IdEstado = 9)
    Despachado = aprobado, pendiente de despachar          (IdEstado = 4)
    Enviado    = despachado, pendiente de enviar           (IdEstado = 5)
    Campo      = enviado, pendiente de confirmar en campo  (IdEstado = 11)
    Cruce      = confirmado, pendiente de cruce            (IdEstado = 14)
    Cierre     = cruzado, pendiente de cierre              (IdEstado IN (21,7,22,23,24,25))
    Folio      = cerrado, pendiente de foliar              (IdEstado = 16)
    Culminadas = foliado                                   (IdEstado = 20)
  La equivalencia es APROXIMADA: sirve para medir cuanto se aleja hoy MaterialStock de lo que dicen los documentos.
*/
SET NOCOUNT ON;

PRINT '== 1. Columnas de MaterialStock con valores negativos ==';
SELECT s.CodPap, v.Bucket, v.Cantidad
FROM dbo.MaterialStock s
CROSS APPLY (VALUES
  ('Stock', s.Stock), ('Disponible', s.Disponible), ('Bloqueado', s.Bloqueado), ('Solicitado', s.Solicitado),
  ('Aprobado', s.Aprobado), ('Despachado', s.Despachado), ('Enviado', s.Enviado), ('Campo', s.Campo),
  ('Cruce', s.Cruce), ('Cierre', s.Cierre), ('Excedente', s.Excedente), ('Folio', s.Folio),
  ('Culminadas', s.Culminadas), ('Recepcionado', s.Recepcionado), ('Validado', s.Validado), ('Observada', s.Observada)
) v(Bucket, Cantidad)
WHERE v.Cantidad < 0
ORDER BY s.CodPap, v.Bucket;

PRINT '== 2. Stock total vs suma de buckets (por CodPap, solo los que difieren) ==';
SELECT s.CodPap,
       ISNULL(s.Stock, 0) AS Stock,
       x.SumaBuckets,
       ISNULL(s.Stock, 0) - x.SumaBuckets AS Diferencia
FROM dbo.MaterialStock s
CROSS APPLY (SELECT
    ISNULL(s.Disponible,0) + ISNULL(s.Bloqueado,0) + ISNULL(s.Solicitado,0) + ISNULL(s.Aprobado,0)
  + ISNULL(s.Despachado,0) + ISNULL(s.Enviado,0)   + ISNULL(s.Campo,0)      + ISNULL(s.Cruce,0)
  + ISNULL(s.Cierre,0)     + ISNULL(s.Excedente,0) + ISNULL(s.Folio,0)      + ISNULL(s.Culminadas,0)
  + ISNULL(s.Recepcionado,0) + ISNULL(s.Validado,0) + ISNULL(s.Observada,0) AS SumaBuckets) x
WHERE ISNULL(s.Stock, 0) <> x.SumaBuckets
ORDER BY ABS(ISNULL(s.Stock, 0) - x.SumaBuckets) DESC;

PRINT '== 3. Equipos con serie (material 40): MaterialStock.Disponible vs series disponibles en DetLogistica ==';
SELECT s.CodPap,
       ISNULL(s.Disponible, 0) AS DisponibleMaterialStock,
       ISNULL(d.SeriesDisponibles, 0) AS SeriesDisponiblesDetLogistica,
       ISNULL(d.SeriesYaSolicitadas, 0) AS SeriesYaSolicitadas,
       ISNULL(s.Disponible, 0) - ISNULL(d.SeriesDisponibles, 0) AS Diferencia
FROM dbo.MaterialStock s
OUTER APPLY (
  SELECT SUM(CASE WHEN l.IdEstado = 2  THEN 1 ELSE 0 END) AS SeriesDisponibles,
         SUM(CASE WHEN l.IdEstado = 88 THEN 1 ELSE 0 END) AS SeriesYaSolicitadas
  FROM dbo.DetLogistica l
  WHERE l.CodPap = s.CodPap AND ISNULL(l.Serie, '') NOT IN ('', 'NO APLICA')
) d
WHERE LEFT(s.CodPap, 2) = '40'
  AND ISNULL(s.Disponible, 0) <> ISNULL(d.SeriesDisponibles, 0)
ORDER BY ABS(ISNULL(s.Disponible, 0) - ISNULL(d.SeriesDisponibles, 0)) DESC;

PRINT '== 4. Cola esperada segun DetSolicitud (IdDespacho = 1) vs bucket de MaterialStock ==';
;WITH esperado AS (
  SELECT CodPap, Bucket, SUM(CantSap) AS Esperado
  FROM (
    SELECT d.CodPap, d.CantSap,
           CASE
             WHEN d.IdEstado = 9  THEN 'Aprobado'
             WHEN d.IdEstado = 4  THEN 'Despachado'
             WHEN d.IdEstado = 5  THEN 'Enviado'
             WHEN d.IdEstado = 11 THEN 'Campo'
             WHEN d.IdEstado = 14 THEN 'Cruce'
             WHEN d.IdEstado IN (21, 7, 22, 23, 24, 25) THEN 'Cierre'
             WHEN d.IdEstado = 16 THEN 'Folio'
             WHEN d.IdEstado = 20 THEN 'Culminadas'
           END AS Bucket
    FROM dbo.DetSolicitud d
    WHERE d.IdDespacho = 1
  ) q
  WHERE Bucket IS NOT NULL
  GROUP BY CodPap, Bucket
),
actual AS (
  SELECT s.CodPap, v.Bucket, ISNULL(v.Cantidad, 0) AS Actual
  FROM dbo.MaterialStock s
  CROSS APPLY (VALUES
    ('Aprobado', s.Aprobado), ('Despachado', s.Despachado), ('Enviado', s.Enviado), ('Campo', s.Campo),
    ('Cruce', s.Cruce), ('Cierre', s.Cierre), ('Folio', s.Folio), ('Culminadas', s.Culminadas)
  ) v(Bucket, Cantidad)
)
SELECT COALESCE(a.CodPap, e.CodPap) AS CodPap,
       COALESCE(a.Bucket, e.Bucket) AS Bucket,
       ISNULL(a.Actual, 0)   AS EnMaterialStock,
       ISNULL(e.Esperado, 0) AS SegunDocumentos,
       ISNULL(a.Actual, 0) - ISNULL(e.Esperado, 0) AS Diferencia
FROM actual a
FULL OUTER JOIN esperado e ON e.CodPap = a.CodPap AND e.Bucket = a.Bucket
WHERE ISNULL(a.Actual, 0) <> ISNULL(e.Esperado, 0)
ORDER BY ABS(ISNULL(a.Actual, 0) - ISNULL(e.Esperado, 0)) DESC;

PRINT '== 5. Resumen por bucket: total en MaterialStock vs total segun documentos ==';
;WITH esperado AS (
  SELECT Bucket, SUM(CantSap) AS Esperado
  FROM (
    SELECT d.CantSap,
           CASE
             WHEN d.IdEstado = 9  THEN 'Aprobado'
             WHEN d.IdEstado = 4  THEN 'Despachado'
             WHEN d.IdEstado = 5  THEN 'Enviado'
             WHEN d.IdEstado = 11 THEN 'Campo'
             WHEN d.IdEstado = 14 THEN 'Cruce'
             WHEN d.IdEstado IN (21, 7, 22, 23, 24, 25) THEN 'Cierre'
             WHEN d.IdEstado = 16 THEN 'Folio'
             WHEN d.IdEstado = 20 THEN 'Culminadas'
           END AS Bucket
    FROM dbo.DetSolicitud d
    WHERE d.IdDespacho = 1
  ) q
  WHERE Bucket IS NOT NULL
  GROUP BY Bucket
),
actual AS (
  SELECT v.Bucket, SUM(ISNULL(v.Cantidad, 0)) AS Actual
  FROM dbo.MaterialStock s
  CROSS APPLY (VALUES
    ('Disponible', s.Disponible), ('Solicitado', s.Solicitado), ('Aprobado', s.Aprobado), ('Despachado', s.Despachado),
    ('Enviado', s.Enviado), ('Campo', s.Campo), ('Cruce', s.Cruce), ('Cierre', s.Cierre),
    ('Excedente', s.Excedente), ('Folio', s.Folio), ('Culminadas', s.Culminadas), ('Observada', s.Observada)
  ) v(Bucket, Cantidad)
  GROUP BY v.Bucket
)
SELECT a.Bucket, a.Actual AS EnMaterialStock, ISNULL(e.Esperado, 0) AS SegunDocumentos, a.Actual - ISNULL(e.Esperado, 0) AS Diferencia
FROM actual a
LEFT JOIN esperado e ON e.Bucket = a.Bucket
ORDER BY a.Bucket;

PRINT '== 6. Solicitudes pendientes sin cabecera (huerfanas) ==';
SELECT COUNT(*) AS DetalleSinCabecera
FROM dbo.DetSolicitud d
WHERE d.IdDespacho = 1
  AND NOT EXISTS (SELECT 1 FROM dbo.CabSolicitud c WHERE c.NroSolicitud = d.NroSolicitud AND c.IdSite = d.IdSite AND c.CorreSite = d.CorreSite);
