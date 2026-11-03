:on error exit
-- GUARDA DE BASE: la base destino es JC_Db.
DECLARE @BaseDestino SYSNAME = N'JC_Db';
IF DB_NAME() <> @BaseDestino
BEGIN
    RAISERROR(N'Guarda de base: la base activa no es la base destino (@BaseDestino). No se ejecuto nada.', 16, 1);
    SET NOEXEC ON;
END
GO
/* ============================================================================
   CJ INTELLIGENCE - REVERSION DEL USUARIO cj_ia (script 20). NO EJECUTADA.
   Elimina SOLO el usuario, el rol y el login creados por el script 20. No hay datos que perder.
   Si ya se ejecuto 20c (firma), ejecutar ANTES 20d.
   Antes: quitar la cadena ConnectionStrings__CjIntelligence del entorno (si se habia configurado),
   porque el backend de CJ Intelligence dejara de poder conectarse.
   ============================================================================ */
SET NOCOUNT ON;
GO

IF EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'rol_cj_ia' AND type = 'R')
   AND EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'cj_ia')
   AND EXISTS (SELECT 1 FROM sys.database_role_members rm
               WHERE rm.role_principal_id = DATABASE_PRINCIPAL_ID(N'rol_cj_ia') AND rm.member_principal_id = DATABASE_PRINCIPAL_ID(N'cj_ia'))
    ALTER ROLE rol_cj_ia DROP MEMBER cj_ia;
GO

-- Los GRANT/DENY del rol desaparecen al soltarlo; el DROP falla si aun tiene miembros (no los tiene tras el paso anterior).
IF EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'rol_cj_ia' AND type = 'R')
    DROP ROLE rol_cj_ia;
GO
IF EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'cj_ia')
    DROP USER cj_ia;
GO

USE master;
GO
IF EXISTS (SELECT 1 FROM sys.server_principals WHERE name = N'cj_ia')
    DROP LOGIN cj_ia;
GO
USE JC_Db;
GO

SET NOEXEC OFF;
GO
