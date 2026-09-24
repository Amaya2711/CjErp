SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.ComunicacionPushEntrega', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.ComunicacionPushEntrega
  (
    IdEntrega bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_ComunicacionPushEntrega PRIMARY KEY,
    IdComunicacion bigint NOT NULL,
    IdEmpleadoCj int NOT NULL,
    IdDispositivo bigint NOT NULL,
    TipoEntrega varchar(20) NOT NULL,
    Exitoso bit NOT NULL,
    TokenInvalido bit NOT NULL CONSTRAINT DF_ComPushEntrega_TokenInvalido DEFAULT 0,
    CodigoError varchar(100) NULL,
    FechaIntento datetime2 NOT NULL CONSTRAINT DF_ComPushEntrega_FechaIntento DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_ComPushEntrega_Comunicacion FOREIGN KEY(IdComunicacion) REFERENCES dbo.Comunicacion(IdComunicacion),
    CONSTRAINT FK_ComPushEntrega_Empleado FOREIGN KEY(IdEmpleadoCj) REFERENCES dbo.EmpleadoCj(IdEmpleado),
    CONSTRAINT FK_ComPushEntrega_Dispositivo FOREIGN KEY(IdDispositivo) REFERENCES dbo.DispositivoMovil(IdDispositivo),
    CONSTRAINT CK_ComPushEntrega_Tipo CHECK (TipoEntrega IN ('INICIAL', 'RECORDATORIO'))
  );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.ComunicacionPushEntrega') AND name = N'IX_ComPushEntrega_Busqueda')
  CREATE NONCLUSTERED INDEX IX_ComPushEntrega_Busqueda ON dbo.ComunicacionPushEntrega(IdComunicacion, IdEmpleadoCj, IdDispositivo, TipoEntrega, FechaIntento DESC);

COMMIT TRANSACTION;
GO

CREATE OR ALTER PROCEDURE dbo.sp_ComunicacionPush_ObtenerPendientes
  @Maximo int = 100,
  @RetryMinutes int = 15,
  @ReminderAfterMinutes int = 1440,
  @InitialMaxAgeHours int = 24
AS
BEGIN
  SET NOCOUNT ON;
  DECLARE @Ahora datetime2 = SYSUTCDATETIME();
  SET @Maximo = IIF(@Maximo BETWEEN 1 AND 100, @Maximo, 100);

  ;WITH Candidatos AS
  (
    SELECT c.IdComunicacion, d.IdEmpleadoCj, dm.IdDispositivo, dm.PushToken, c.Titulo, c.Tipo, c.TipoPersistencia, 'INICIAL' AS TipoEntrega, c.FechaCreacion AS FechaOrden
    FROM dbo.Comunicacion c
    INNER JOIN dbo.ComunicacionDestinatario d ON d.IdComunicacion = c.IdComunicacion
    INNER JOIN dbo.DispositivoMovil dm ON dm.IdEmpleadoCj = d.IdEmpleadoCj AND dm.Activo = 1
    WHERE c.Activo = 1 AND c.Estado = 1 AND d.Estado = 1
      AND (c.FechaProgramada IS NULL OR c.FechaProgramada <= @Ahora)
      AND c.FechaCreacion >= DATEADD(HOUR, -@InitialMaxAgeHours, @Ahora)
      AND NOT EXISTS (SELECT 1 FROM dbo.ComunicacionPushEntrega e WHERE e.IdComunicacion = c.IdComunicacion AND e.IdEmpleadoCj = d.IdEmpleadoCj AND e.IdDispositivo = dm.IdDispositivo AND e.TipoEntrega = 'INICIAL' AND e.Exitoso = 1)
      AND NOT EXISTS (SELECT 1 FROM dbo.ComunicacionPushEntrega e WHERE e.IdComunicacion = c.IdComunicacion AND e.IdEmpleadoCj = d.IdEmpleadoCj AND e.IdDispositivo = dm.IdDispositivo AND e.TipoEntrega = 'INICIAL' AND e.Exitoso = 0 AND e.FechaIntento > DATEADD(MINUTE, -@RetryMinutes, @Ahora))

    UNION ALL

    SELECT c.IdComunicacion, d.IdEmpleadoCj, dm.IdDispositivo, dm.PushToken, c.Titulo, c.Tipo, c.TipoPersistencia, 'RECORDATORIO', c.FechaCreacion
    FROM dbo.Comunicacion c
    INNER JOIN dbo.ComunicacionDestinatario d ON d.IdComunicacion = c.IdComunicacion
    INNER JOIN dbo.DispositivoMovil dm ON dm.IdEmpleadoCj = d.IdEmpleadoCj AND dm.Activo = 1
    WHERE c.Activo = 1 AND c.Estado = 1 AND d.Estado = 1 AND c.TipoPersistencia IN (2, 3)
      AND c.FechaCreacion <= DATEADD(MINUTE, -@ReminderAfterMinutes, @Ahora)
      AND ((c.PermiteConfirmacion = 1 AND d.Confirmado = 0) OR (c.PermiteConfirmacion = 0 AND d.Leido = 0))
      AND NOT EXISTS (SELECT 1 FROM dbo.ComunicacionPushEntrega e WHERE e.IdComunicacion = c.IdComunicacion AND e.IdEmpleadoCj = d.IdEmpleadoCj AND e.IdDispositivo = dm.IdDispositivo AND e.TipoEntrega = 'RECORDATORIO' AND e.Exitoso = 1 AND e.FechaIntento > DATEADD(MINUTE, -@ReminderAfterMinutes, @Ahora))
      AND NOT EXISTS (SELECT 1 FROM dbo.ComunicacionPushEntrega e WHERE e.IdComunicacion = c.IdComunicacion AND e.IdEmpleadoCj = d.IdEmpleadoCj AND e.IdDispositivo = dm.IdDispositivo AND e.TipoEntrega = 'RECORDATORIO' AND e.Exitoso = 0 AND e.FechaIntento > DATEADD(MINUTE, -@RetryMinutes, @Ahora))
  )
  SELECT TOP (@Maximo) IdComunicacion, IdEmpleadoCj, IdDispositivo, PushToken, Titulo, Tipo, TipoPersistencia, TipoEntrega
  FROM Candidatos
  ORDER BY FechaOrden, IdComunicacion, IdDispositivo;
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_ComunicacionPush_RegistrarResultado
  @IdComunicacion bigint,
  @IdEmpleadoCj int,
  @IdDispositivo bigint,
  @TipoEntrega varchar(20),
  @Exitoso bit,
  @TokenInvalido bit = 0,
  @CodigoError varchar(100) = NULL
AS
BEGIN
  SET NOCOUNT ON;
  INSERT dbo.ComunicacionPushEntrega(IdComunicacion, IdEmpleadoCj, IdDispositivo, TipoEntrega, Exitoso, TokenInvalido, CodigoError)
  VALUES(@IdComunicacion, @IdEmpleadoCj, @IdDispositivo, @TipoEntrega, @Exitoso, @TokenInvalido, NULLIF(@CodigoError, ''));

  IF @TokenInvalido = 1
    UPDATE dbo.DispositivoMovil SET Activo = 0, FechaUltimoAcceso = SYSUTCDATETIME()
    WHERE IdDispositivo = @IdDispositivo AND IdEmpleadoCj = @IdEmpleadoCj;

  INSERT dbo.ComunicacionEvento(IdComunicacion, IdEmpleadoCj, IdDispositivo, TipoEvento, Detalle)
  VALUES(@IdComunicacion, @IdEmpleadoCj, @IdDispositivo,
    IIF(@Exitoso = 1, 'PUSH_ENVIADO', IIF(@TokenInvalido = 1, 'PUSH_TOKEN_INVALIDO', 'PUSH_ERROR')),
    CONCAT(N'Tipo=', @TipoEntrega, N'; Estado=', IIF(@Exitoso = 1, N'OK', N'ERROR'), N'; Codigo=', COALESCE(@CodigoError, N'SIN_CODIGO')));
END
GO
