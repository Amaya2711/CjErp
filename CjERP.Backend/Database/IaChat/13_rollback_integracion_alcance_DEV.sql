/* ============================================================================
   RECUPERACION PARCIAL EN LA COPIA DE DESARROLLO — NO EJECUTADA.
   Deshace SOLO lo que este plan agrego como tabla: elimina dbo.IaToolPermiso (y con ella su seed y su
   trigger). NO toca el SP ni los menus:
     - SP sp_IA_Planilla_Buscar: restaurar con 03_rollback_sp_IA_Planilla_Buscar_vigente_2026-06-23.sql.
     - Menus (script 10): restaurar desde el punto de restauracion tomado antes, o quitar la asignacion desde la
       pantalla de seguridad (Menu - Perfil). Este script NO usa sp_SegPerfilRolMenu_EliminarPorPerfilRol porque
       borraria TODOS los menus del perfil-rol.
   La via mas segura de recuperacion completa es RESTAURAR la copia desde el respaldo previo a la integracion.
   Guarda de base obligatoria: debe editar @BaseDestino con el nombre exacto de la base.
   ============================================================================ */
SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @BaseDestino SYSNAME = N'<NOMBRE_DE_LA_BASE_DESTINO>';
IF @BaseDestino = N'<NOMBRE_DE_LA_BASE_DESTINO>' OR DB_NAME() <> @BaseDestino
    THROW 50040, 'Guarda de base: edite @BaseDestino con el nombre exacto de la base destino y ejecute conectado a ella.', 1;

IF OBJECT_ID(N'dbo.IaToolPermiso', N'U') IS NOT NULL
BEGIN
    DROP TABLE dbo.IaToolPermiso;
    PRINT 'dbo.IaToolPermiso eliminada (copia de desarrollo).';
END
ELSE
    PRINT 'dbo.IaToolPermiso no existe: nada que deshacer.';

PRINT 'Pendiente manual: restaurar el SP con 03_rollback... y revisar los menus (ver cabecera).';
