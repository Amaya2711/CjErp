/*
  Ajustes idempotentes para los procedimientos de comunicaciones móviles.
  - Corrige SoloNoLeidos = 0 para que no oculte toda la bandeja.
  - Audita una sola vez la primera lectura y la primera confirmación.
  - El IdDispositivo se registra únicamente si pertenece al mismo EmpleadoCj.
*/
SET NOCOUNT ON;
GO

CREATE OR ALTER PROCEDURE dbo.sp_Comunicacion_ListarPorEmpleado
  @IdEmpleadoCj int,
  @Tipo int = NULL,
  @SoloNoLeidos bit = NULL,
  @Pagina int = 1,
  @TamanoPagina int = 20
AS
BEGIN
  SET NOCOUNT ON;
  SET @Pagina = IIF(@Pagina < 1, 1, @Pagina);
  SET @TamanoPagina = IIF(@TamanoPagina BETWEEN 1 AND 100, @TamanoPagina, 20);

  SELECT c.IdComunicacion, c.Tipo, c.Titulo, LEFT(c.Mensaje, 500) AS Resumen,
         c.Prioridad, c.TipoPersistencia, c.FechaCreacion, d.Leido, d.Confirmado,
         c.PermiteConfirmacion, d.FechaLectura, d.FechaConfirmacion
  FROM dbo.Comunicacion c
  INNER JOIN dbo.ComunicacionDestinatario d ON d.IdComunicacion = c.IdComunicacion
  WHERE d.IdEmpleadoCj = @IdEmpleadoCj AND d.Estado = 1 AND c.Activo = 1 AND c.Estado = 1
    AND (@Tipo IS NULL OR c.Tipo = @Tipo)
    AND (@SoloNoLeidos IS NULL OR @SoloNoLeidos = 0 OR d.Leido = 0)
  ORDER BY c.FechaCreacion DESC
  OFFSET (@Pagina - 1) * @TamanoPagina ROWS FETCH NEXT @TamanoPagina ROWS ONLY;

  SELECT COUNT(*)
  FROM dbo.Comunicacion c
  INNER JOIN dbo.ComunicacionDestinatario d ON d.IdComunicacion = c.IdComunicacion
  WHERE d.IdEmpleadoCj = @IdEmpleadoCj AND d.Estado = 1 AND c.Activo = 1 AND c.Estado = 1
    AND (@Tipo IS NULL OR c.Tipo = @Tipo)
    AND (@SoloNoLeidos IS NULL OR @SoloNoLeidos = 0 OR d.Leido = 0);
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_Comunicacion_MarcarLeido
  @IdComunicacion bigint,
  @IdEmpleadoCj int,
  @IdDispositivo bigint = NULL
AS
BEGIN
  SET NOCOUNT ON;
  IF @IdDispositivo IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM dbo.DispositivoMovil WHERE IdDispositivo = @IdDispositivo AND IdEmpleadoCj = @IdEmpleadoCj AND Activo = 1)
    SET @IdDispositivo = NULL;

  UPDATE dbo.ComunicacionDestinatario
  SET Leido = 1, FechaLectura = ISNULL(FechaLectura, SYSUTCDATETIME())
  WHERE IdComunicacion = @IdComunicacion AND IdEmpleadoCj = @IdEmpleadoCj AND Estado = 1 AND Leido = 0;

  IF @@ROWCOUNT > 0
  BEGIN
    INSERT dbo.ComunicacionEvento(IdComunicacion, IdEmpleadoCj, IdDispositivo, TipoEvento, Detalle)
    VALUES(@IdComunicacion, @IdEmpleadoCj, @IdDispositivo, 'LECTURA', N'Primera lectura registrada desde la aplicación móvil.');
    SELECT 1 AS Resultado, N'Lectura procesada.' AS Mensaje;
    RETURN;
  END;

  IF EXISTS (SELECT 1 FROM dbo.ComunicacionDestinatario WHERE IdComunicacion = @IdComunicacion AND IdEmpleadoCj = @IdEmpleadoCj AND Estado = 1)
    SELECT 1 AS Resultado, N'La lectura ya estaba registrada.' AS Mensaje;
  ELSE
    SELECT 0 AS Resultado, N'La comunicación no está disponible.' AS Mensaje;
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_Comunicacion_Confirmar
  @IdComunicacion bigint,
  @IdEmpleadoCj int,
  @IdDispositivo bigint = NULL
AS
BEGIN
  SET NOCOUNT ON;
  IF @IdDispositivo IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM dbo.DispositivoMovil WHERE IdDispositivo = @IdDispositivo AND IdEmpleadoCj = @IdEmpleadoCj AND Activo = 1)
    SET @IdDispositivo = NULL;

  UPDATE d
  SET Leido = 1,
      Confirmado = 1,
      FechaLectura = ISNULL(FechaLectura, SYSUTCDATETIME()),
      FechaConfirmacion = ISNULL(FechaConfirmacion, SYSUTCDATETIME())
  FROM dbo.ComunicacionDestinatario d
  INNER JOIN dbo.Comunicacion c ON c.IdComunicacion = d.IdComunicacion
  WHERE d.IdComunicacion = @IdComunicacion AND d.IdEmpleadoCj = @IdEmpleadoCj
    AND d.Estado = 1 AND c.Activo = 1 AND c.Estado = 1
    AND c.PermiteConfirmacion = 1 AND d.Confirmado = 0;

  IF @@ROWCOUNT > 0
  BEGIN
    INSERT dbo.ComunicacionEvento(IdComunicacion, IdEmpleadoCj, IdDispositivo, TipoEvento, Detalle)
    VALUES(@IdComunicacion, @IdEmpleadoCj, @IdDispositivo, 'CONFIRMACION', N'Confirmación registrada desde la aplicación móvil.');
    SELECT 1 AS Resultado, N'Confirmación procesada.' AS Mensaje;
    RETURN;
  END;

  IF EXISTS (
    SELECT 1
    FROM dbo.ComunicacionDestinatario d
    INNER JOIN dbo.Comunicacion c ON c.IdComunicacion = d.IdComunicacion
    WHERE d.IdComunicacion = @IdComunicacion AND d.IdEmpleadoCj = @IdEmpleadoCj
      AND d.Estado = 1 AND c.Activo = 1 AND c.Estado = 1
      AND c.PermiteConfirmacion = 1 AND d.Confirmado = 1)
    SELECT 1 AS Resultado, N'La confirmación ya estaba registrada.' AS Mensaje;
  ELSE
    SELECT 0 AS Resultado, N'La comunicación no permite confirmación o no está disponible.' AS Mensaje;
END
GO
