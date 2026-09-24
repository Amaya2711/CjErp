/* El cargo del perfil móvil se obtiene del mismo registro EmpleadoCj usado como CodEmp. */
CREATE OR ALTER PROCEDURE dbo.sp_ValidarUsuario
  @pIdUsuario NVARCHAR(50),
  @pClave NVARCHAR(10)
AS
BEGIN
  SET NOCOUNT ON;
  SELECT c.IdEmpleado AS Cuadrilla, a.IdUsuario, c.Correo, c.NombreEmpleado,
         c.IdEmpleado AS CodEmp, c.IdCargo AS IdCargo, d.IdEmpleado AS CodVal,
         f.IdPerfil, f.IdRol
  FROM dbo.Usuario a
  LEFT JOIN dbo.Empleado b ON a.IdEmpleado = b.IdEmpleado
  LEFT JOIN dbo.EmpleadoCj c ON b.IdEmpleadoCj = c.IdEmpleado
  LEFT JOIN dbo.Empleado d ON b.IdEmpleadoCj = d.IdEmpleadoCj AND d.IdCargo = 13
  LEFT JOIN dbo.SegUsuarioPerfilRol e ON e.IdUsuario = a.IdUsuario
  LEFT JOIN dbo.SegPerfilRol f ON e.IdPerfilRol = f.IdPerfilRol
  WHERE a.IdUsuario = @pIdUsuario AND a.Clave = @pClave;
END
GO
