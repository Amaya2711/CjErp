CREATE OR ALTER PROCEDURE dbo.sp_Comunicacion_Crear
  @Tipo int,
  @Titulo nvarchar(250),
  @Mensaje nvarchar(max),
  @Prioridad int,
  @TipoPersistencia int,
  @FechaProgramada datetime2 = NULL,
  @FechaVencimiento datetime2 = NULL,
  @RutaDestino nvarchar(500) = NULL,
  @IdReferencia bigint = NULL,
  @TipoReferencia varchar(50) = NULL,
  @PermiteConfirmacion bit = 0,
  @IdUsuarioCreacion nvarchar(100),
  @IdEmpleadoCreacion int = NULL,
  @DestinatariosJson nvarchar(max)
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;
  IF @Tipo NOT BETWEEN 0 AND 5 OR @TipoPersistencia NOT BETWEEN 0 AND 3
    THROW 51030, 'Tipo o persistencia inválidos.', 1;
  IF NULLIF(LTRIM(RTRIM(@Titulo)), N'') IS NULL OR NULLIF(LTRIM(RTRIM(@Mensaje)), N'') IS NULL
    THROW 51031, 'Título y mensaje son obligatorios.', 1;
  IF @TipoPersistencia = 3 AND @PermiteConfirmacion = 0
    THROW 51032, 'La comunicación obligatoria requiere confirmación.', 1;
  IF ISJSON(@DestinatariosJson) <> 1 OR NOT EXISTS (SELECT 1 FROM OPENJSON(@DestinatariosJson))
    THROW 51033, 'Debe indicar destinatarios.', 1;
  IF EXISTS (SELECT 1 FROM OPENJSON(@DestinatariosJson) j LEFT JOIN dbo.EmpleadoCj e ON e.IdEmpleado = TRY_CONVERT(int, j.value) WHERE TRY_CONVERT(int, j.value) IS NULL OR ISNULL(e.IdActivo, 1) <> 1)
    THROW 51034, 'Existe un destinatario EmpleadoCj inexistente o inactivo.', 1;

  BEGIN TRANSACTION;
  INSERT dbo.Comunicacion(Tipo,Titulo,Mensaje,Prioridad,TipoPersistencia,FechaProgramada,FechaVencimiento,IdUsuarioCreacion,IdEmpleadoCreacion,RutaDestino,IdReferencia,TipoReferencia,PermiteConfirmacion)
  VALUES(@Tipo,LTRIM(RTRIM(@Titulo)),@Mensaje,@Prioridad,@TipoPersistencia,@FechaProgramada,@FechaVencimiento,@IdUsuarioCreacion,@IdEmpleadoCreacion,@RutaDestino,@IdReferencia,@TipoReferencia,@PermiteConfirmacion);
  DECLARE @IdComunicacion bigint = SCOPE_IDENTITY();

  ;WITH Destinatarios AS (SELECT DISTINCT TRY_CONVERT(int, value) AS IdEmpleadoCj FROM OPENJSON(@DestinatariosJson))
  INSERT dbo.ComunicacionDestinatario(IdComunicacion,IdEmpleadoCj,FechaEnvio)
  SELECT @IdComunicacion, IdEmpleadoCj, SYSUTCDATETIME() FROM Destinatarios;

  INSERT dbo.ComunicacionEvento(IdComunicacion,IdEmpleadoCj,TipoEvento,Detalle)
  SELECT @IdComunicacion, IdEmpleadoCj, 'CREADO', N'Comunicación creada desde el ERP.' FROM (SELECT DISTINCT TRY_CONVERT(int, value) AS IdEmpleadoCj FROM OPENJSON(@DestinatariosJson)) d;
  COMMIT TRANSACTION;
  SELECT @IdComunicacion AS IdComunicacion, (SELECT COUNT(*) FROM dbo.ComunicacionDestinatario WHERE IdComunicacion = @IdComunicacion) AS Destinatarios;
END
GO
