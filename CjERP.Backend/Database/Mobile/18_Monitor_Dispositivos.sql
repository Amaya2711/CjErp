CREATE OR ALTER PROCEDURE dbo.sp_DispositivoMovil_ListarAdmin
  @SoloActivos bit = 1,
  @Maximo int = 100
AS
BEGIN
  SET NOCOUNT ON;
  SET @Maximo = IIF(@Maximo BETWEEN 1 AND 200, @Maximo, 100);

  SELECT TOP (@Maximo)
    d.IdDispositivo,
    d.IdEmpleadoCj,
    e.NombreEmpleado,
    d.IdUsuario,
    d.Plataforma,
    d.Modelo,
    d.VersionSistema,
    d.VersionApp,
    d.FechaRegistro,
    d.FechaUltimoAcceso,
    d.Activo
  FROM dbo.DispositivoMovil d
  INNER JOIN dbo.EmpleadoCj e ON e.IdEmpleado = d.IdEmpleadoCj
  WHERE @SoloActivos = 0 OR d.Activo = 1
  ORDER BY d.Activo DESC, d.FechaUltimoAcceso DESC, d.IdDispositivo DESC;
END
GO
