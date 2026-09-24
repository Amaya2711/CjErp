/*
  Prueba manual de adjuntos para una comunicación existente.
  Antes de ejecutar, cargue el archivo con el mecanismo corporativo de SharePoint
  y reemplace @RutaAlmacenamiento por el StoragePath que devuelve el ERP.
  No use una URL pública ni una ruta local del equipo.
*/
SET XACT_ABORT ON;
DECLARE @IdComunicacion bigint = 5;
DECLARE @NombreArchivo nvarchar(260) = N'reemplace-por-archivo.pdf';
DECLARE @TipoContenido varchar(150) = 'application/pdf';
DECLARE @TamanoBytes bigint = 0;
DECLARE @RutaAlmacenamiento nvarchar(1000) = N'REEMPLACE_POR_STORAGE_PATH_DE_SHAREPOINT';

IF @RutaAlmacenamiento LIKE N'REEMPLACE_%'
  THROW 51020, 'Reemplace @RutaAlmacenamiento por el StoragePath corporativo antes de ejecutar.', 1;

IF NOT EXISTS (SELECT 1 FROM dbo.Comunicacion WHERE IdComunicacion = @IdComunicacion AND Activo = 1)
  THROW 51021, 'La comunicación indicada no existe o no está activa.', 1;

BEGIN TRANSACTION;
INSERT dbo.ComunicacionAdjunto(IdComunicacion, NombreArchivo, TipoContenido, TamanoBytes, RutaAlmacenamiento)
VALUES(@IdComunicacion, @NombreArchivo, @TipoContenido, @TamanoBytes, @RutaAlmacenamiento);
COMMIT TRANSACTION;

SELECT SCOPE_IDENTITY() AS IdAdjuntoCreado, @IdComunicacion AS IdComunicacion;
