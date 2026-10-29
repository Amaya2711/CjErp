/*
  Logistica de equipos - Solicitud: corrige sp_Logistica_Solicitud_Disponible (reemplaza la version del script 08).
  PV: NO ejecutado ni probado contra la BD.

  Cambios frente a la version del 08 (el Listado del sistema antiguo filtra por cliente + proyecto + site + correlativo
  y toma lineas en estado 2 y 3; la version anterior solo filtraba por site y mostraba lineas de otros proyectos):
   - Modo SITIO (@Texto NULL = vista Listado): lineas en estado 2 o 3 del cliente, proyecto, site y correlativo indicados.
   - Modo TEXTO (vistas Adicional): lineas en estado 2 de cualquier site que coincidan con el texto.
   - MismoSite = 1 solo si coinciden cliente, proyecto, site y correlativo (cuando se informan).
*/
SET NOCOUNT ON;
GO

CREATE OR ALTER PROCEDURE dbo.sp_Logistica_Solicitud_Disponible
  @Texto      nvarchar(100) = NULL,
  @IdSite     nvarchar(50)  = NULL,
  @CorreSite  int           = NULL,
  @IdCliente  int           = NULL,
  @IdProyecto int           = NULL
AS
BEGIN
  SET NOCOUNT ON;

  SET @Texto = NULLIF(LTRIM(RTRIM(@Texto)), N'');
  SET @IdSite = NULLIF(LTRIM(RTRIM(@IdSite)), N'');
  IF @Texto IS NULL AND @IdSite IS NULL
    THROW 51200, 'Indique un material o seleccione la relacion cliente-proyecto-site.', 1;

  SELECT TOP (5000)
         CONVERT(varchar(36), d.Correlativo)                  AS Correlativo,
         d.PedidoSap,
         CAST(d.CodPap AS nvarchar(50))                       AS CodPap,
         m.NombreMaterial,
         m.UnidadMedida,
         CAST(d.Serie AS nvarchar(100))                       AS Serie,
         CAST(d.CantSap AS decimal(18,4))                     AS CantSap,
         CAST(d.CantSap - ISNULL(r.Reservado, 0) AS decimal(18,4)) AS Saldo,
         d.IdCliente, d.IdProyecto, d.IdSite, d.CorreSite, d.TipoTrabajo,
         s.NombreSite,
         cl.NombreCliente,
         pr.NombreProyecto,
         CAST(CASE WHEN @IdSite IS NOT NULL AND d.IdSite = @IdSite
                        AND d.CorreSite = ISNULL(@CorreSite, d.CorreSite)
                        AND d.IdCliente = ISNULL(@IdCliente, d.IdCliente)
                        AND d.IdProyecto = ISNULL(@IdProyecto, d.IdProyecto)
                   THEN 1 ELSE 0 END AS bit)                  AS MismoSite,
         CAST(ISNULL(ms.Disponible, 0) AS decimal(18,4))      AS StockDisponible
  FROM dbo.DetLogistica d
  LEFT JOIN dbo.Material m       ON m.CodPap = d.CodPap
  LEFT JOIN dbo.Site s           ON s.IdSite = d.IdSite AND s.Correlativo = d.CorreSite
  LEFT JOIN dbo.Cliente cl       ON cl.IdCliente = d.IdCliente
  LEFT JOIN dbo.Proyecto pr      ON pr.IdProyecto = d.IdProyecto
  LEFT JOIN dbo.MaterialStock ms ON ms.CodPap = d.CodPap
  OUTER APPLY (SELECT SUM(ds.CantSap) AS Reservado
               FROM dbo.DetSolicitud ds
               WHERE ds.Correlativo = CONVERT(varchar(36), d.Correlativo)
                 AND ds.IdDespacho = 1 AND ds.IdEstado NOT IN (6, 19)) r
  WHERE (d.IdEstado = 2 OR (@Texto IS NULL AND d.IdEstado = 3))
    AND d.CantSap - ISNULL(r.Reservado, 0) > 0
    AND (@Texto IS NULL
         OR CAST(d.CodPap AS nvarchar(50)) LIKE @Texto + N'%'
         OR m.NombreMaterial LIKE N'%' + @Texto + N'%')
    AND (@Texto IS NOT NULL
         OR (d.IdSite = @IdSite
             AND d.CorreSite = ISNULL(@CorreSite, d.CorreSite)
             AND d.IdCliente = ISNULL(@IdCliente, d.IdCliente)
             AND d.IdProyecto = ISNULL(@IdProyecto, d.IdProyecto)))
  ORDER BY CASE WHEN @IdSite IS NOT NULL AND d.IdSite = @IdSite THEN 0 ELSE 1 END, m.NombreMaterial, d.PedidoSap, d.Posicion;
END;
GO
