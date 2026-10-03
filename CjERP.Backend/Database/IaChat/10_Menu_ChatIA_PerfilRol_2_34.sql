/* ============================================================================
   HABILITACION DEL MENU "CHAT IA" — NO EJECUTADO. Probar primero en una COPIA de la base.
   Asigna el menu /reportes/administrativo/iachat a FINANZAS/ADMIN (IdPerfil 2, IdRol 4) y
   GERENCIA/ADMIN (IdPerfil 15, IdRol 4) usando la seguridad EXISTENTE (dbo.SegPerfilRolMenu), con el mismo
   procedimiento que usa la pantalla de seguridad: dbo.sp_SegPerfilRolMenu_Insertar
   (parametros tomados de SegMenuService.GuardarAsignacionPerfilRolAsync).

   - NO usa sp_SegPerfilRolMenu_EliminarPorPerfilRol: no borra ni reemplaza los menus que ya tienen.
   - Idempotente: si la asignacion ya existe y esta activa, no hace nada; si existe INACTIVA, NO la modifica
     y avisa (decision manual).
   - Falla si el menu no es unico (0 o mas de 1 fila activa en SegMenu con esa ruta) o si algun perfil-rol
     no existe. Los menus padre visibles se derivan por la jerarquia en SegMenuService (no se tocan aqui).
   - Es solo la visibilidad en el menu: el permiso de datos lo da dbo.IaToolPermiso (el backend valida ambos
     por separado).
   ============================================================================ */
SET NOCOUNT ON;
SET XACT_ABORT ON;

-- GUARDA DE BASE (obligatoria): edite @BaseDestino con el nombre EXACTO de la base donde DECIDE aplicar este script
-- (copia de pruebas o, con autorizacion expresa, la base real) y ejecute conectado a ella. Si no coincide o no se
-- edito, el script se detiene sin tocar nada.
-- ORDEN: este script se aplica DESPUES de validar el alcance (ver docs/AI_COPILOT_FASE2_INTEGRACION_DEV.md).
DECLARE @BaseDestino SYSNAME = N'<NOMBRE_DE_LA_BASE_DESTINO>';
IF @BaseDestino = N'<NOMBRE_DE_LA_BASE_DESTINO>' OR DB_NAME() <> @BaseDestino
    THROW 50040, 'Guarda de base: edite @BaseDestino con el nombre exacto de la base destino y ejecute conectado a ella.', 1;

DECLARE @Ruta NVARCHAR(200) = N'/reportes/administrativo/iachat';
DECLARE @Actor NVARCHAR(100) = N'SEED_MENU_CHATIA_2026-10-03';

DECLARE @Menus INT = (SELECT COUNT(*) FROM dbo.SegMenu WHERE EsActivo = 1 AND Ruta = @Ruta);
IF @Menus <> 1
    THROW 50033, 'El menu Chat IA no es unico en SegMenu (se esperaba exactamente 1 fila activa con esa ruta).', 1;
DECLARE @IdMenu INT = (SELECT IdMenu FROM dbo.SegMenu WHERE EsActivo = 1 AND Ruta = @Ruta);

DECLARE @Destinos TABLE (IdPerfil INT NOT NULL, IdRol INT NOT NULL, PRIMARY KEY (IdPerfil, IdRol));
INSERT INTO @Destinos VALUES (2, 4), (15, 4);

IF EXISTS (SELECT 1 FROM @Destinos d WHERE NOT EXISTS
           (SELECT 1 FROM dbo.SegPerfilRol pr WHERE pr.IdPerfil = d.IdPerfil AND pr.IdRol = d.IdRol AND pr.EsActivo = 1))
    THROW 50034, 'Algun perfil-rol destino no existe o no esta activo en SegPerfilRol.', 1;

DECLARE @IdPerfil INT, @IdRol INT;
DECLARE c CURSOR LOCAL FAST_FORWARD FOR SELECT IdPerfil, IdRol FROM @Destinos ORDER BY IdPerfil, IdRol;
OPEN c;
FETCH NEXT FROM c INTO @IdPerfil, @IdRol;
WHILE @@FETCH_STATUS = 0
BEGIN
    IF EXISTS (SELECT 1 FROM dbo.SegPerfilRolMenu WHERE IdPerfil = @IdPerfil AND IdRol = @IdRol AND IdMenu = @IdMenu AND EsActivo = 1)
        PRINT CONCAT('Ya asignado y activo: perfil ', @IdPerfil, ' rol ', @IdRol);
    ELSE IF EXISTS (SELECT 1 FROM dbo.SegPerfilRolMenu WHERE IdPerfil = @IdPerfil AND IdRol = @IdRol AND IdMenu = @IdMenu)
        PRINT CONCAT('REVISAR: existe INACTIVO para perfil ', @IdPerfil, ' rol ', @IdRol, ' (no se modifica).');
    ELSE
    BEGIN
        EXEC dbo.sp_SegPerfilRolMenu_Insertar
            @IdPerfil = @IdPerfil, @IdRol = @IdRol, @IdMenu = @IdMenu, @Acceso = 1, @UsuarioCreacion = @Actor;
        PRINT CONCAT('Asignado: perfil ', @IdPerfil, ' rol ', @IdRol);
    END;
    FETCH NEXT FROM c INTO @IdPerfil, @IdRol;
END;
CLOSE c;
DEALLOCATE c;

-- Resultado
SELECT prm.IdPerfil, prm.IdRol, prm.IdMenu, prm.EsActivo
FROM dbo.SegPerfilRolMenu prm
WHERE prm.IdMenu = @IdMenu AND ((prm.IdPerfil = 2 AND prm.IdRol = 4) OR (prm.IdPerfil = 15 AND prm.IdRol = 4));
