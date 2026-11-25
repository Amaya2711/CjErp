/*
  Logistica de equipos - DASHBOARD (resumen ejecutivo sobre las solicitudes y x Campo).
  PV: NO ejecutado ni probado contra la BD. Solo lectura (no modifica datos).
  Lineas de destino (IdDespacho = 1) de TODAS las solicitudes, sin importar su estado. Filtros opcionales: cliente / proyecto / site.
  Devuelve 6 conjuntos de resultados, en este orden:
   1) Resumen   : 1 fila con totales (solicitudes, lineas, pendientes de campo = estado 11, observadas = estado 10, antiguedad).
   2) Estados   : lineas y solicitudes por estado (nombre = Constante ESTADO_LOG.ValorFin).
   3) Antiguedad: lineas pendientes de campo (estado 11) por rango de dias desde la creacion de la solicitud.
   4) Tendencia : solicitudes creadas por dia en los ultimos 30 dias.
   5) Proyectos : top 8 proyectos con mas lineas pendientes u observadas.
   6) Antiguas  : top 8 solicitudes pendientes de campo mas antiguas.
*/
SET NOCOUNT ON;
GO
CREATE OR ALTER PROCEDURE dbo.sp_Logistica_Dashboard_Resumen
  @IdCliente  int          = NULL,
  @IdProyecto int          = NULL,
  @IdSite     nvarchar(50) = NULL,
  @CorreSite  int          = NULL
AS
BEGIN
  SET NOCOUNT ON;

  SET @IdSite = NULLIF(LTRIM(RTRIM(@IdSite)), N'');
  DECLARE @hoy date = CAST(CONVERT(datetime, SYSDATETIMEOFFSET() AT TIME ZONE 'SA Pacific Standard Time') AS date);

  IF OBJECT_ID(N'tempdb..#L') IS NOT NULL DROP TABLE #L;

  -- Base: una fila por linea de destino; la fecha es la de creacion de la solicitud (CabSolicitud, preferiendo el destino).
  SELECT CAST(b.NroSolicitud AS nvarchar(50)) AS Nro,
         b.IdEstado,
         b.IdProyecto,
         CAST(b.IdSite AS nvarchar(50))       AS IdSite,
         b.CorreSite,
         CAST(a.FechaCreacion AS date)        AS Fecha
  INTO #L
  FROM dbo.DetSolicitud b
  OUTER APPLY (SELECT TOP (1) c.FechaCreacion
               FROM dbo.CabSolicitud c
               WHERE c.NroSolicitud = b.NroSolicitud
               ORDER BY CASE WHEN c.IdMovimiento = 1 THEN 0 ELSE 1 END) a
  WHERE b.IdDespacho = 1
    AND (@IdCliente  IS NULL OR b.IdCliente  = @IdCliente)
    AND (@IdProyecto IS NULL OR b.IdProyecto = @IdProyecto)
    AND (@IdSite IS NULL OR (b.IdSite = @IdSite AND b.CorreSite = ISNULL(@CorreSite, b.CorreSite)));

  -- 1) Resumen
  SELECT COUNT(DISTINCT Nro)                                                      AS Solicitudes,
         COUNT(*)                                                                 AS Lineas,
         ISNULL(SUM(CASE WHEN IdEstado = 11 THEN 1 ELSE 0 END), 0)                AS LineasPendientes,
         COUNT(DISTINCT CASE WHEN IdEstado = 11 THEN Nro END)                     AS SolicitudesPendientes,
         ISNULL(SUM(CASE WHEN IdEstado = 10 THEN 1 ELSE 0 END), 0)                AS LineasObservadas,
         COUNT(DISTINCT CASE WHEN IdEstado = 10 THEN Nro END)                     AS SolicitudesObservadas,
         MAX(CASE WHEN IdEstado = 11 THEN DATEDIFF(day, Fecha, @hoy) END)         AS DiasMaxPendiente,
         AVG(CASE WHEN IdEstado = 11 THEN CAST(DATEDIFF(day, Fecha, @hoy) AS decimal(18,2)) END) AS DiasPromPendiente
  FROM #L;

  -- 2) Estados
  SELECT l.IdEstado,
         ISNULL(e.ValorFin, CONCAT(N'Estado ', l.IdEstado)) AS Estado,
         COUNT(*)                                           AS Lineas,
         COUNT(DISTINCT l.Nro)                              AS Solicitudes
  FROM #L l
  LEFT JOIN dbo.Constante e ON e.Campo = 'ESTADO_LOG' AND e.Correlativo = l.IdEstado
  GROUP BY l.IdEstado, e.ValorFin
  ORDER BY COUNT(*) DESC, l.IdEstado;

  -- 3) Antiguedad de lo pendiente de campo
  SELECT Rango, Orden, COUNT(*) AS Lineas
  FROM (SELECT CASE WHEN d <= 3 THEN N'0-3 días' WHEN d <= 7 THEN N'4-7 días' WHEN d <= 15 THEN N'8-15 días' ELSE N'Más de 15 días' END AS Rango,
               CASE WHEN d <= 3 THEN 1 WHEN d <= 7 THEN 2 WHEN d <= 15 THEN 3 ELSE 4 END                                          AS Orden
        FROM (SELECT DATEDIFF(day, Fecha, @hoy) AS d FROM #L WHERE IdEstado = 11 AND Fecha IS NOT NULL) x) y
  GROUP BY Rango, Orden
  ORDER BY Orden;

  -- 4) Tendencia: solicitudes creadas por dia (ultimos 30 dias, incluido hoy)
  SELECT Fecha, COUNT(DISTINCT Nro) AS Solicitudes
  FROM #L
  WHERE Fecha >= DATEADD(day, -29, @hoy) AND Fecha <= @hoy
  GROUP BY Fecha
  ORDER BY Fecha;

  -- 5) Proyectos con mas lineas pendientes u observadas
  SELECT TOP (8)
         ISNULL(pr.NombreProyecto, CONCAT(N'Proyecto ', l.IdProyecto)) AS Proyecto,
         SUM(CASE WHEN l.IdEstado = 11 THEN 1 ELSE 0 END)              AS Pendientes,
         SUM(CASE WHEN l.IdEstado = 10 THEN 1 ELSE 0 END)              AS Observadas,
         COUNT(*)                                                      AS Total
  FROM #L l
  LEFT JOIN dbo.Proyecto pr ON pr.IdProyecto = l.IdProyecto
  GROUP BY l.IdProyecto, pr.NombreProyecto
  HAVING SUM(CASE WHEN l.IdEstado IN (10, 11) THEN 1 ELSE 0 END) > 0
  ORDER BY SUM(CASE WHEN l.IdEstado IN (10, 11) THEN 1 ELSE 0 END) DESC, COUNT(*) DESC;

  -- 6) Solicitudes pendientes de campo mas antiguas
  SELECT TOP (8)
         l.Nro                                  AS NroSolicitud,
         MIN(l.Fecha)                           AS FechaCreacion,
         DATEDIFF(day, MIN(l.Fecha), @hoy)      AS Dias,
         COUNT(*)                               AS Lineas,
         MAX(pr.NombreProyecto)                 AS Proyecto,
         MAX(s.NombreSite)                      AS Site
  FROM #L l
  LEFT JOIN dbo.Proyecto pr ON pr.IdProyecto = l.IdProyecto
  LEFT JOIN dbo.Site s      ON s.IdSite = l.IdSite AND s.Correlativo = l.CorreSite
  WHERE l.IdEstado = 11 AND l.Fecha IS NOT NULL
  GROUP BY l.Nro
  ORDER BY MIN(l.Fecha) ASC, l.Nro;
END;
GO
