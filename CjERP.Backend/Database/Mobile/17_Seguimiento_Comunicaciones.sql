/* Ejecutar después de 12_Despacho_Push.sql. No expone PushToken. */
CREATE OR ALTER PROCEDURE dbo.sp_Comunicacion_Seguimiento
  @IdComunicacion bigint
AS
BEGIN
  SET NOCOUNT ON;

  IF NOT EXISTS (SELECT 1 FROM dbo.Comunicacion WHERE IdComunicacion = @IdComunicacion)
    THROW 51040, 'La comunicación indicada no existe.', 1;

  SELECT
    d.IdEmpleadoCj,
    e.NombreEmpleado,
    d.Leido,
    d.FechaLectura,
    d.Confirmado,
    d.FechaConfirmacion,
    CAST(CASE WHEN EXISTS
      (SELECT 1 FROM dbo.DispositivoMovil dm WHERE dm.IdEmpleadoCj = d.IdEmpleadoCj AND dm.Activo = 1)
      THEN 1 ELSE 0 END AS bit) AS TieneDispositivoActivo,
    CASE WHEN p.IdEntrega IS NULL THEN NULL WHEN p.Exitoso = 1 THEN 'ENVIADO' WHEN p.TokenInvalido = 1 THEN 'TOKEN_INVALIDO' ELSE 'ERROR' END AS UltimoPushEstado,
    p.TipoEntrega AS UltimoPushTipo,
    p.FechaIntento AS FechaUltimoPush,
    p.CodigoError AS CodigoUltimoPush
  FROM dbo.ComunicacionDestinatario d
  INNER JOIN dbo.EmpleadoCj e ON e.IdEmpleado = d.IdEmpleadoCj
  OUTER APPLY
  (
    SELECT TOP (1) IdEntrega, Exitoso, TokenInvalido, TipoEntrega, FechaIntento, CodigoError
    FROM dbo.ComunicacionPushEntrega
    WHERE IdComunicacion = d.IdComunicacion AND IdEmpleadoCj = d.IdEmpleadoCj
    ORDER BY FechaIntento DESC, IdEntrega DESC
  ) p
  WHERE d.IdComunicacion = @IdComunicacion
  ORDER BY e.NombreEmpleado, d.IdEmpleadoCj;
END
GO
