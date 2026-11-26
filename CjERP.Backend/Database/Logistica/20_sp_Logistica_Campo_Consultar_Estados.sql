/*
  Logistica de equipos - pagina CIERRE: x Cruzar (14), x Cerrar (21,7,22,23,24,25), x Foliar (16) y su Dashboard.
  PV: NO ejecutado ni probado contra la BD. Solo cambia dbo.sp_Logistica_Campo_Consultar (solo lectura): agrega el parametro
  @Estados (lista de estados separada por comas). Sin @Estados todo funciona igual que antes (x Campo, Observadas, Reporte).
  Ejecutar SOLO este script (no hace falta volver a correr el 09 completo).
  Devuelve tambien DetSolicitud.MontoEnvio (numeric(18,2)); se muestra en x Cerrar y x Foliar.
  Optimizado para x Cerrar / x Foliar (modo @PorSolicitud): listas de estados y solicitudes armadas una vez, solicitudes del modo
  por solicitud en una tabla temporal indexada, fecha de cabecera por solicitud (no por fila), catalogos unidos solo a las lineas
  ya filtradas y OPTION (RECOMPILE) por los muchos filtros opcionales. Mismas columnas y mismo resultado que antes.
*/
SET NOCOUNT ON;
GO
CREATE OR ALTER PROCEDURE dbo.sp_Logistica_Campo_Consultar
  @Solicitudes  nvarchar(max) = NULL,   -- lista separada por comas
  @FechaIni     date          = NULL,   -- sobre CabSolicitud.FechaCreacion
  @FechaFin     date          = NULL,
  @IdRespCampo  int           = NULL,
  @IdCliente    int           = NULL,
  @IdProyecto   int           = NULL,
  @IdSite       nvarchar(50)  = NULL,
  @CorreSite    int           = NULL,
  @IdEstado     int           = NULL,   -- NULL = 11 (pendientes de campo); 10 = observadas; -1 = todos los estados (Reporte)
  @Estados      nvarchar(100) = NULL,   -- lista de estados separada por comas (p. ej. '14' x cruzar, '21,7,22,23,24,25' x cerrar, '16,22,23,25' x foliar); tiene prioridad sobre @IdEstado
  @PorSolicitud bit           = 0,      -- 1 = como el sistema antiguo: trae TODAS las lineas (cualquier estado) de las solicitudes que tengan al menos una linea en @Estados
  @SoloEquipos  bit           = 0       -- 1 = solo materiales cuyo CodPap empieza con 10 o 40 (x foliar)
AS
BEGIN
  SET NOCOUNT ON;

  SET @Solicitudes = NULLIF(LTRIM(RTRIM(@Solicitudes)), N'');
  SET @IdSite = NULLIF(LTRIM(RTRIM(@IdSite)), N'');
  SET @Estados = NULLIF(LTRIM(RTRIM(@Estados)), N'');

  -- Optimizado: las listas se arman una sola vez (antes STRING_SPLIT se evaluaba por fila), las solicitudes del modo
  -- @PorSolicitud se calculan una sola vez (antes era un EXISTS por fila), la fecha de la cabecera se resuelve por solicitud
  -- (antes un OUTER APPLY por fila) y los catalogos se unen solo a las lineas ya filtradas.
  DECLARE @est TABLE (Id int PRIMARY KEY);
  IF @Estados IS NOT NULL
    INSERT INTO @est (Id)
    SELECT DISTINCT TRY_CONVERT(int, LTRIM(RTRIM(x.value))) FROM STRING_SPLIT(@Estados, N',') x
    WHERE TRY_CONVERT(int, LTRIM(RTRIM(x.value))) IS NOT NULL;

  DECLARE @sol TABLE (Nro nvarchar(50) PRIMARY KEY);
  IF @Solicitudes IS NOT NULL
    INSERT INTO @sol (Nro)
    SELECT DISTINCT LTRIM(RTRIM(x.value)) FROM STRING_SPLIT(@Solicitudes, N',') x WHERE LTRIM(RTRIM(x.value)) <> N'';

  IF OBJECT_ID(N'tempdb..#solEstado') IS NOT NULL DROP TABLE #solEstado;
  IF OBJECT_ID(N'tempdb..#det') IS NOT NULL DROP TABLE #det;
  IF OBJECT_ID(N'tempdb..#cab') IS NOT NULL DROP TABLE #cab;
  IF OBJECT_ID(N'tempdb..#estLog') IS NOT NULL DROP TABLE #estLog;

  -- Solicitudes con al menos una linea en @Estados (solo en modo @PorSolicitud); la tabla se crea siempre para fijar el tipo.
  SELECT d.NroSolicitud INTO #solEstado FROM dbo.DetSolicitud d WHERE 1 = 0;
  IF @Estados IS NOT NULL AND @PorSolicitud = 1
    INSERT INTO #solEstado (NroSolicitud)
    SELECT DISTINCT d.NroSolicitud FROM dbo.DetSolicitud d
    WHERE d.IdDespacho = 1 AND d.IdEstado IN (SELECT Id FROM @est);
  CREATE CLUSTERED INDEX IX_solEstado ON #solEstado (NroSolicitud);

  -- Lineas que cumplen todos los filtros salvo la fecha (que sale de la cabecera).
  SELECT b.NroSolicitud, b.PedidoSap, b.Correlativo, b.Posicion, b.CodPap, b.CantSap, b.Serie, b.Observacion, b.RutaImagen,
         b.ImagenEnvio, b.NroGuia, b.MontoEnvio, b.IdEstado, b.IdCliente, b.IdProyecto, b.IdSite, b.CorreSite, b.TipoTrabajo
  INTO #det
  FROM dbo.DetSolicitud b
  WHERE b.IdDespacho = 1
    AND ((@Estados IS NOT NULL AND @PorSolicitud = 0 AND b.IdEstado IN (SELECT Id FROM @est))
         OR (@Estados IS NOT NULL AND @PorSolicitud = 1 AND b.NroSolicitud IN (SELECT NroSolicitud FROM #solEstado))
         OR (@Estados IS NULL AND (@IdEstado = -1 OR b.IdEstado = ISNULL(@IdEstado, 11))))
    AND (@SoloEquipos = 0 OR LEFT(CAST(b.CodPap AS nvarchar(50)), 2) IN (N'10', N'40'))
    AND (@Solicitudes IS NULL OR CAST(b.NroSolicitud AS nvarchar(50)) IN (SELECT Nro FROM @sol))
    AND (@IdRespCampo IS NULL OR b.IdRespCampo = @IdRespCampo)
    AND (@IdCliente IS NULL OR b.IdCliente = @IdCliente)
    AND (@IdProyecto IS NULL OR b.IdProyecto = @IdProyecto)
    AND (@IdSite IS NULL OR (b.IdSite = @IdSite AND b.CorreSite = ISNULL(@CorreSite, b.CorreSite)))
  OPTION (RECOMPILE);

  -- CabSolicitud puede tener 2+ filas por solicitud (destino IdMovimiento = 1 y origen = 2): una sola por solicitud, preferiendo el destino.
  SELECT c.NroSolicitud,
         COALESCE(MAX(CASE WHEN c.IdMovimiento = 1 THEN c.FechaCreacion END), MAX(c.FechaCreacion)) AS FechaCreacion
  INTO #cab
  FROM dbo.CabSolicitud c
  WHERE c.NroSolicitud IN (SELECT DISTINCT NroSolicitud FROM #det)
  GROUP BY c.NroSolicitud;
  CREATE CLUSTERED INDEX IX_cab ON #cab (NroSolicitud);

  -- Nombre de cada estado (Constante ESTADO_LOG) leido UNA vez: unir Constante directo a cada fila repetia la busqueda
  -- por fila (5120 escaneos y un worktable de 58140 en la medicion del 25/11/2026: 27 s para ~5000 filas).
  SELECT TRY_CONVERT(int, c.Correlativo) AS IdEstado, MAX(c.ValorFin) AS Nombre
  INTO #estLog
  FROM dbo.Constante c
  WHERE c.Campo = 'ESTADO_LOG' AND TRY_CONVERT(int, c.Correlativo) IS NOT NULL
  GROUP BY TRY_CONVERT(int, c.Correlativo);
  CREATE CLUSTERED INDEX IX_estLog ON #estLog (IdEstado);

  -- Sin el tope de 5000 de antes: en modo @PorSolicitud hay mas lineas y se truncaria silenciosamente (el sistema antiguo no tiene tope).
  SELECT TOP (50000)
         CAST(b.NroSolicitud AS nvarchar(50))     AS NroSolicitud,
         CAST(b.PedidoSap AS nvarchar(50))        AS PedidoSap,
         CAST(b.Correlativo AS nvarchar(50))      AS Correlativo,
         CAST(b.Posicion AS nvarchar(20))         AS Posicion,
         CAST(b.CodPap AS nvarchar(50))           AS CodPap,
         m.NombreMaterial,
         m.UnidadMedida,
         CAST(b.CantSap AS decimal(18,4))         AS CantSap,
         CAST(b.Serie AS nvarchar(100))           AS Serie,
         CAST(b.Observacion AS nvarchar(500))     AS Observacion,
         CAST(b.RutaImagen AS nvarchar(500))      AS RutaImagen,
         CAST(b.ImagenEnvio AS nvarchar(500))     AS ImagenEnvio,
         b.NroGuia                                AS NroGuia,   -- numero de guia
         CAST(b.MontoEnvio AS numeric(18,2))      AS MontoEnvio,   -- monto de envio (DetSolicitud.MontoEnvio)
         b.IdEstado,
         e.Nombre                                 AS NomEstado,   -- nombre visible del estado = Constante ESTADO_LOG.ValorFin
         b.IdCliente, b.IdProyecto,
         CAST(b.IdSite AS nvarchar(50))           AS IdSite,
         b.CorreSite,
         CAST(b.TipoTrabajo AS nvarchar(100))     AS TipoTrabajo,
         s.NombreSite,
         pr.NombreProyecto,
         cl.NombreCliente,
         a.FechaCreacion
  FROM #det b
  LEFT JOIN #cab a              ON a.NroSolicitud = b.NroSolicitud
  LEFT JOIN dbo.Material m      ON CAST(m.CodPap AS nvarchar(50)) = CAST(b.CodPap AS nvarchar(50))
  LEFT JOIN #estLog e           ON e.IdEstado = b.IdEstado
  LEFT JOIN dbo.Site s          ON s.IdSite = b.IdSite AND s.Correlativo = b.CorreSite
  LEFT JOIN dbo.Proyecto pr     ON pr.IdProyecto = b.IdProyecto
  LEFT JOIN dbo.Cliente cl      ON cl.IdCliente = b.IdCliente
  WHERE (@FechaIni IS NULL OR CAST(a.FechaCreacion AS date) >= @FechaIni)
    AND (@FechaFin IS NULL OR CAST(a.FechaCreacion AS date) <= @FechaFin)
  ORDER BY b.IdSite, b.CorreSite, b.NroSolicitud, b.CodPap, TRY_CONVERT(int, b.Posicion)
  OPTION (RECOMPILE);
END;
GO
