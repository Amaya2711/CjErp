/*
  dbo.sp_Empleado_ListarValidadores: el Segundo validador (tipo 2) pasa a ser
  "empleados activos con perfil 55" (igual que el tipo 1 usa perfil 11 y el tipo 3 perfil 56).
  Antes eran los empleados cuyo RESPONSABLE tenia perfil 55, por eso TORRES REA (perfil 55) no aparecia.
  NO ejecutado: correr en JC_Db. No requiere cambios en el backend.
*/
USE [JC_Db]
GO

ALTER PROCEDURE dbo.sp_Empleado_ListarValidadores
(
    @TipoValidador INT
    /*
        1 = Responsable
        2 = Segundo validador
        3 = Tercer validador
    */
)
AS
BEGIN
    SET NOCOUNT ON;

    /* RESPONSABLE: empleados activos con perfil 11 */
    IF @TipoValidador = 1
    BEGIN
        SELECT DISTINCT
            a.IdEmpleado,
            a.NombreEmpleado
        FROM dbo.EmpleadoCj a
        INNER JOIN dbo.EmpleadoCjPerfil b
            ON b.IdEmpleadoCj = a.IdEmpleado
        WHERE a.IdActivo = 1
          AND b.IdPerfil = 11
        ORDER BY a.NombreEmpleado;

        RETURN;
    END;

    /* SEGUNDO VALIDADOR: empleados activos con perfil 55 */
    IF @TipoValidador = 2
    BEGIN
        SELECT DISTINCT
            a.IdEmpleado,
            a.NombreEmpleado
        FROM dbo.EmpleadoCj a
        INNER JOIN dbo.EmpleadoCjPerfil b
            ON b.IdEmpleadoCj = a.IdEmpleado
        WHERE a.IdActivo = 1
          AND b.IdPerfil = 55
        ORDER BY a.NombreEmpleado;

        RETURN;
    END;

    /* TERCER VALIDADOR: empleados activos con perfil 56 */
    IF @TipoValidador = 3
    BEGIN
        SELECT DISTINCT
            a.IdEmpleado,
            a.NombreEmpleado
        FROM dbo.EmpleadoCj a
        INNER JOIN dbo.EmpleadoCjPerfil b
            ON b.IdEmpleadoCj = a.IdEmpleado
        WHERE a.IdActivo = 1
          AND b.IdPerfil = 56
        ORDER BY a.NombreEmpleado;

        RETURN;
    END;

    THROW 50001,
          'El TipoValidador debe ser 1=Responsable, 2=Segundo validador o 3=Tercer validador.',
          1;
END;
GO
