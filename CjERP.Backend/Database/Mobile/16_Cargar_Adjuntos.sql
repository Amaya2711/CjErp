CREATE OR ALTER PROCEDURE dbo.sp_ComunicacionAdjunto_Crear
  @IdComunicacion bigint,
  @NombreArchivo nvarchar(260),
  @TipoContenido varchar(150),
  @TamanoBytes bigint,
  @RutaAlmacenamiento nvarchar(1000)
AS
BEGIN
  SET NOCOUNT ON;
  IF NOT EXISTS (SELECT 1 FROM dbo.Comunicacion WHERE IdComunicacion = @IdComunicacion AND Activo = 1 AND Estado = 1)
    THROW 51040, 'La comunicación no existe o no está activa.', 1;
  IF NULLIF(LTRIM(RTRIM(@NombreArchivo)), N'') IS NULL OR NULLIF(LTRIM(RTRIM(@RutaAlmacenamiento)), N'') IS NULL OR @TamanoBytes < 0
    THROW 51041, 'Metadatos de adjunto inválidos.', 1;
  INSERT dbo.ComunicacionAdjunto(IdComunicacion,NombreArchivo,TipoContenido,TamanoBytes,RutaAlmacenamiento)
  VALUES(@IdComunicacion,LEFT(LTRIM(RTRIM(@NombreArchivo)),260),LEFT(COALESCE(NULLIF(@TipoContenido,''),'application/octet-stream'),150),@TamanoBytes,LTRIM(RTRIM(@RutaAlmacenamiento)));
  SELECT SCOPE_IDENTITY() AS IdAdjunto;
END
GO
