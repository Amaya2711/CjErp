/*
  Logistica de equipos - pagina CIERRE: x Cruzar (14), x Cerrar (21,7,22,23,24,25), x Foliar (16) y su Dashboard.
  PV: NO ejecutado ni probado contra la BD. Solo cambia dbo.sp_Logistica_Campo_Consultar (solo lectura): agrega el parametro
  @Estados (lista de estados separada por comas). Sin @Estados todo funciona igual que antes (x Campo, Observadas, Reporte).
  Ejecutar SOLO este script (no hace falta volver a correr el 09 completo).
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
         b.IdEstado,
         e.ValorFin                               AS NomEstado,   -- nombre visible del estado = Constante ESTADO_LOG.ValorFin
         b.IdCliente, b.IdProyecto,
         CAST(b.IdSite AS nvarchar(50))           AS IdSite,
         b.CorreSite,
         CAST(b.TipoTrabajo AS nvarchar(100))     AS TipoTrabajo,
         s.NombreSite,
         pr.NombreProyecto,
         cl.NombreCliente,
         a.FechaCreacion
  FROM dbo.DetSolicitud b
  -- CabSolicitud puede tener 2+ filas por solicitud (destino IdMovimiento = 1 y origen = 2): una sola por linea, preferiendo el destino.
  OUTER APPLY (SELECT TOP (1) c.FechaCreacion
               FROM dbo.CabSolicitud c
               WHERE c.NroSolicitud = b.NroSolicitud
               ORDER BY CASE WHEN c.IdMovimiento = 1 THEN 0 ELSE 1 END) a
  LEFT JOIN dbo.Material m      ON CAST(m.CodPap AS nvarchar(50)) = CAST(b.CodPap AS nvarchar(50))
  LEFT JOIN dbo.Constante e     ON e.Campo = 'ESTADO_LOG' AND e.Correlativo = b.IdEstado
  LEFT JOIN dbo.Site s          ON s.IdSite = b.IdSite AND s.Correlativo = b.CorreSite
  LEFT JOIN dbo.Proyecto pr     ON pr.IdProyecto = b.IdProyecto
  LEFT JOIN dbo.Cliente cl      ON cl.IdCliente = b.IdCliente
  WHERE b.IdDespacho = 1
    AND ((@Estados IS NOT NULL AND @PorSolicitud = 0
          AND b.IdEstado IN (SELECT TRY_CONVERT(int, LTRIM(RTRIM(x.value))) FROM STRING_SPLIT(@Estados, N',') x))
         OR (@Estados IS NOT NULL AND @PorSolicitud = 1
          AND EXISTS (SELECT 1 FROM dbo.DetSolicitud d
                      WHERE d.NroSolicitud = b.NroSolicitud AND d.IdDespacho = 1
                        AND d.IdEstado IN (SELECT TRY_CONVERT(int, LTRIM(RTRIM(x.value))) FROM STRING_SPLIT(@Estados, N',') x)))
         OR (@Estados IS NULL AND (@IdEstado = -1 OR b.IdEstado = ISNULL(@IdEstado, 11))))
    AND (@SoloEquipos = 0 OR LEFT(CAST(b.CodPap AS nvarchar(50)), 2) IN (N'10', N'40'))
    AND (@Solicitudes IS NULL OR CAST(b.NroSolicitud AS nvarchar(50)) IN
           (SELECT LTRIM(RTRIM(x.value)) FROM STRING_SPLIT(@Solicitudes, N',') x WHERE LTRIM(RTRIM(x.value)) <> N''))
    AND (@FechaIni IS NULL OR CAST(a.FechaCreacion AS date) >= @FechaIni)
    AND (@FechaFin IS NULL OR CAST(a.FechaCreacion AS date) <= @FechaFin)
    AND (@IdRespCampo IS NULL OR b.IdRespCampo = @IdRespCampo)
    AND (@IdCliente IS NULL OR b.IdCliente = @IdCliente)
    AND (@IdProyecto IS NULL OR b.IdProyecto = @IdProyecto)
    AND (@IdSite IS NULL OR (b.IdSite = @IdSite AND b.CorreSite = ISNULL(@CorreSite, b.CorreSite)))
  ORDER BY b.IdSite, b.CorreSite, b.NroSolicitud, b.CodPap, TRY_CONVERT(int, b.Posicion);
END;
GO
