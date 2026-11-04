/* ------------------------------------------------------------------------------------------------
   Historial de solicitudes de equipos (pestana Solicitud > Historial).
   Lista las solicitudes registradas (CabSolicitud) en cualquier estado, con filtros opcionales. Solo lectura.
   Estado: nombre de Constante 'ESTADO_LOG' (PV: confirmar que el correlativo coincide con CabSolicitud.IdEstado).
   Lineas / Cantidad: filas de destino (DetSolicitud.IdDespacho = 1) de la solicitud.
   Sin filtro de fechas toma los ultimos 30 dias para no recorrer toda la tabla.
------------------------------------------------------------------------------------------------ */
CREATE OR ALTER PROCEDURE dbo.sp_Logistica_Solicitud_Historial
  @FechaIni     date          = NULL,
  @FechaFin     date          = NULL,
  @NroSolicitud nvarchar(50)  = NULL,
  @IdEstado     int           = NULL,
  @IdCliente    int           = NULL,
  @IdProyecto   int           = NULL,
  @IdSite       nvarchar(50)  = NULL,
  @CorreSite    int           = NULL,
  @Solicitante  nvarchar(100) = NULL,
  @Usuario      nvarchar(50)  = NULL
AS
BEGIN
  SET NOCOUNT ON;

  SET @NroSolicitud = NULLIF(LTRIM(RTRIM(@NroSolicitud)), N'');
  SET @Solicitante  = NULLIF(LTRIM(RTRIM(@Solicitante)), N'');
  SET @Usuario      = NULLIF(LTRIM(RTRIM(@Usuario)), N'');
  IF @NroSolicitud IS NULL
  BEGIN
    IF @FechaFin IS NULL SET @FechaFin = CAST(CONVERT(datetime, SYSDATETIMEOFFSET() AT TIME ZONE 'SA Pacific Standard Time') AS date);
    IF @FechaIni IS NULL SET @FechaIni = DATEADD(DAY, -30, @FechaFin);
  END;

  SELECT TOP (2000)
         CAST(a.NroSolicitud AS nvarchar(50))           AS NroSolicitud,
         a.IdCliente, a.IdProyecto, a.IdSite, a.CorreSite,
         CAST(a.TipoTrabajo AS nvarchar(100))           AS TipoTrabajo,
         cl.NombreCliente, pr.NombreProyecto, s.NombreSite,
         CAST(a.Usuario AS nvarchar(50))                AS Usuario,
         a.FechaCreacion,
         sol.NombreEmpleado                             AS Solicitante,
         fe.ValorIni                                    AS FormaEnvio,
         CAST(a.Direccion AS nvarchar(300))             AS Direccion,
         CAST(a.Referencia AS nvarchar(300))            AS Referencia,
         ISNULL(det.Lineas, 0)                          AS Lineas,
         ISNULL(det.Cantidad, 0)                        AS Cantidad,
         a.IdEstado,
         es.ValorIni                                    AS NomEstado
  FROM dbo.CabSolicitud a
  OUTER APPLY (SELECT COUNT(*) AS Lineas, SUM(b.CantSap) AS Cantidad
               FROM dbo.DetSolicitud b
               WHERE b.NroSolicitud = a.NroSolicitud AND b.IdDespacho = 1) det
  LEFT JOIN dbo.Cliente cl   ON cl.IdCliente = a.IdCliente
  LEFT JOIN dbo.Proyecto pr  ON pr.IdProyecto = a.IdProyecto
  LEFT JOIN dbo.Site s       ON s.IdSite = a.IdSite AND s.Correlativo = a.CorreSite
  LEFT JOIN dbo.Empleado sol ON sol.IdEmpleado = a.IdSolicitante
  LEFT JOIN dbo.Constante fe ON fe.Campo = 'FORMA_ENVIO' AND fe.Correlativo = a.FormaEnvio
  LEFT JOIN dbo.Constante es ON es.Campo = 'ESTADO_LOG' AND es.Correlativo = a.IdEstado
  WHERE (@NroSolicitud IS NULL OR CAST(a.NroSolicitud AS nvarchar(50)) = @NroSolicitud)
    AND (@FechaIni IS NULL OR CAST(a.FechaCreacion AS date) >= @FechaIni)
    AND (@FechaFin IS NULL OR CAST(a.FechaCreacion AS date) <= @FechaFin)
    AND (@IdEstado IS NULL OR a.IdEstado = @IdEstado)
    AND (@IdCliente IS NULL OR a.IdCliente = @IdCliente)
    AND (@IdProyecto IS NULL OR a.IdProyecto = @IdProyecto)
    AND (@IdSite IS NULL OR (a.IdSite = @IdSite AND a.CorreSite = ISNULL(@CorreSite, a.CorreSite)))
    AND (@Solicitante IS NULL OR sol.NombreEmpleado LIKE N'%' + @Solicitante + N'%')
    AND (@Usuario IS NULL OR CAST(a.Usuario AS nvarchar(50)) = @Usuario)
  ORDER BY a.FechaCreacion DESC, TRY_CONVERT(bigint, a.NroSolicitud) DESC;
END;
GO
