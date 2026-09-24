CREATE OR ALTER PROCEDURE dbo.sp_Comunicacion_Monitor
AS
BEGIN
  SET NOCOUNT ON;
  DECLARE @Desde datetime2 = DATEADD(HOUR, -24, SYSUTCDATETIME());

  SELECT
    (SELECT COUNT(*) FROM dbo.Comunicacion WHERE Activo = 1 AND Estado = 1) AS TotalComunicaciones,
    (SELECT COUNT(*) FROM dbo.ComunicacionDestinatario d INNER JOIN dbo.Comunicacion c ON c.IdComunicacion = d.IdComunicacion WHERE d.Estado = 1 AND c.Activo = 1 AND c.Estado = 1) AS Destinatarios,
    (SELECT COUNT(*) FROM dbo.ComunicacionDestinatario d INNER JOIN dbo.Comunicacion c ON c.IdComunicacion = d.IdComunicacion WHERE d.Estado = 1 AND d.Leido = 0 AND c.Activo = 1 AND c.Estado = 1) AS NoLeidas,
    (SELECT COUNT(*) FROM dbo.ComunicacionDestinatario d INNER JOIN dbo.Comunicacion c ON c.IdComunicacion = d.IdComunicacion WHERE d.Estado = 1 AND d.Confirmado = 1 AND c.Activo = 1 AND c.Estado = 1) AS Confirmadas,
    (SELECT COUNT(*) FROM dbo.ComunicacionDestinatario d INNER JOIN dbo.Comunicacion c ON c.IdComunicacion = d.IdComunicacion WHERE d.Estado = 1 AND d.Confirmado = 0 AND c.Activo = 1 AND c.Estado = 1 AND c.TipoPersistencia = 3) AS ObligatoriasPendientes,
    (SELECT COUNT(*) FROM dbo.DispositivoMovil WHERE Activo = 1) AS DispositivosActivos,
    (SELECT COUNT(*) FROM dbo.ComunicacionPushEntrega WHERE Exitoso = 1 AND FechaIntento >= @Desde) AS PushEnviados24Horas,
    (SELECT COUNT(*) FROM dbo.ComunicacionPushEntrega WHERE Exitoso = 0 AND FechaIntento >= @Desde) AS PushErrores24Horas;
END
GO
