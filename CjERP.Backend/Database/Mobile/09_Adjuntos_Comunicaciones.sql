SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.ComunicacionAdjunto', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.ComunicacionAdjunto
  (
    IdAdjunto bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_ComunicacionAdjunto PRIMARY KEY,
    IdComunicacion bigint NOT NULL,
    NombreArchivo nvarchar(260) NOT NULL,
    TipoContenido varchar(150) NOT NULL CONSTRAINT DF_ComunicacionAdjunto_TipoContenido DEFAULT 'application/octet-stream',
    TamanoBytes bigint NOT NULL CONSTRAINT CK_ComunicacionAdjunto_Tamano CHECK (TamanoBytes >= 0),
    RutaAlmacenamiento nvarchar(1000) NOT NULL,
    FechaCreacion datetime2 NOT NULL CONSTRAINT DF_ComunicacionAdjunto_FechaCreacion DEFAULT SYSUTCDATETIME(),
    Activo bit NOT NULL CONSTRAINT DF_ComunicacionAdjunto_Activo DEFAULT 1,
    CONSTRAINT FK_ComunicacionAdjunto_Comunicacion FOREIGN KEY(IdComunicacion) REFERENCES dbo.Comunicacion(IdComunicacion)
  );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.ComunicacionAdjunto') AND name = N'IX_ComunicacionAdjunto_Comunicacion_Activo')
  CREATE NONCLUSTERED INDEX IX_ComunicacionAdjunto_Comunicacion_Activo ON dbo.ComunicacionAdjunto(IdComunicacion, Activo);

COMMIT TRANSACTION;
GO

CREATE OR ALTER PROCEDURE dbo.sp_ComunicacionAdjunto_ListarPorEmpleado
  @IdComunicacion bigint,
  @IdEmpleadoCj int
AS
BEGIN
  SET NOCOUNT ON;
  SELECT a.IdAdjunto, a.IdComunicacion, a.NombreArchivo, a.TipoContenido, a.TamanoBytes, a.FechaCreacion, a.RutaAlmacenamiento
  FROM dbo.ComunicacionAdjunto a
  INNER JOIN dbo.ComunicacionDestinatario d ON d.IdComunicacion = a.IdComunicacion
  INNER JOIN dbo.Comunicacion c ON c.IdComunicacion = a.IdComunicacion
  WHERE a.IdComunicacion = @IdComunicacion
    AND d.IdEmpleadoCj = @IdEmpleadoCj AND d.Estado = 1
    AND c.Activo = 1 AND c.Estado = 1
    AND a.Activo = 1
  ORDER BY a.IdAdjunto;
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_ComunicacionAdjunto_ObtenerPorEmpleado
  @IdComunicacion bigint,
  @IdAdjunto bigint,
  @IdEmpleadoCj int
AS
BEGIN
  SET NOCOUNT ON;
  SELECT TOP (1) a.IdAdjunto, a.IdComunicacion, a.NombreArchivo, a.TipoContenido, a.TamanoBytes, a.FechaCreacion, a.RutaAlmacenamiento
  FROM dbo.ComunicacionAdjunto a
  INNER JOIN dbo.ComunicacionDestinatario d ON d.IdComunicacion = a.IdComunicacion
  INNER JOIN dbo.Comunicacion c ON c.IdComunicacion = a.IdComunicacion
  WHERE a.IdComunicacion = @IdComunicacion AND a.IdAdjunto = @IdAdjunto
    AND d.IdEmpleadoCj = @IdEmpleadoCj AND d.Estado = 1
    AND c.Activo = 1 AND c.Estado = 1
    AND a.Activo = 1;
END
GO
