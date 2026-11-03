:on error exit
-- GUARDA DE BASE: la base destino es JC_Db. Si la base ACTIVA no es esa, el script no hace nada.
-- USO. La clave NO se guarda en el repo ni se pasa por linea de comandos: sqlcmd toma como variable de scripting cualquier
-- VARIABLE DE ENTORNO del proceso, asi que basta definir CJ_IA_PASSWORD en el entorno de la sesion (desde el gestor de
-- secretos) y ejecutar:
--   sqlcmd -S <servidor> -d JC_Db -U <admin> -i 20_CjIntelligence_Usuario_cj_ia.sql
-- (sqlcmd no hace eco del script ni de la clave; no usar -e. Evitar comillas simples en la clave.)
DECLARE @BaseDestino SYSNAME = N'JC_Db';
IF DB_NAME() <> @BaseDestino
BEGIN
    RAISERROR(N'Guarda de base: la base activa no es la base destino (@BaseDestino). No se ejecuto nada.', 16, 1);
    SET NOEXEC ON;
END
GO
/* ============================================================================
   CJ INTELLIGENCE - USUARIO cj_ia CON PRIVILEGIOS MINIMOS (script 20). PROPUESTA, NO EJECUTADA.
   Requiere los scripts 18 y 19. Este script NO cambia ninguna cadena de conexion: eso es un paso
   aparte (variable de entorno ConnectionStrings__CjIntelligence en Railway) que solo se hara con
   autorizacion expresa.

   QUE CREA: un login SQL (nivel servidor), un usuario en JC_Db y el rol rol_cj_ia.

   PERMISOS (todo por procedimiento; NINGUN permiso directo sobre tablas):
     Consultar pagos ............ EXECUTE sp_IA_Cj_Pagos_Buscar
                                  (envoltorio FIRMADO con certificado, script 20c: llama a sp_IA_Planilla_Buscar con
                                   SELECT solo sobre 8 tablas mientras el envoltorio esta en la pila; cj_ia NO tiene
                                   EXECUTE sobre sp_IA_Planilla_Buscar ni SELECT sobre Planilla)
     Resolver autorizaciones .... EXECUTE sp_IA_Cj_Autorizacion_Permisos / _Empleado / _Equipo
     Guardar conversaciones ..... EXECUTE sp_IA_Cj_Conversacion_Crear / _Listar / _Abrir / _Renombrar / _Eliminar,
                                  sp_IA_Cj_Turno_Iniciar / _IniciarNueva / _Renovar / _Completar / _Fallar,
                                  sp_IA_Cj_Resultado_Registrar, sp_IA_Cj_Estado_Guardar, sp_IA_Cj_Auditoria_Registrar
   SIN DENY de esquema (decision de diseno): el diseno objetivo firma sp_IA_Cj_Pagos_Buscar con un certificado (20c). Un DENY
   SELECT/INSERT/UPDATE/DELETE sobre dbo al rol de cj_ia prevaleceria sobre el GRANT que aporta la firma y la anularia. Se
   renuncia a esa capa; cj_ia sigue sin NINGUN GRANT de tabla y 21 / 21b / 23 lo comprueban (sin SELECT/INSERT/UPDATE/DELETE).
   Ejecutar este script y DESPUES 20c (certificado, usuario sin login, SELECT sobre 8 tablas, firma). Sin 20c, el modo
   RESUMEN de pagos falla con permiso denegado.
   NO recibe EXECUTE sobre sp_IA_Cj_Autorizacion_Alcance (interno) ni sobre fn_IA_Cj_UsuarioValido: los SP los usan por
   encadenamiento de propiedad y asi se prueba que cj_ia no puede invocarlos directamente.
   NO recibe: db_owner, db_datareader, db_datawriter, db_ddladmin, VIEW DEFINITION, CONTROL, ni EXECUTE sobre
   nada que no este en la lista. No puede crear objetos permanentes.
   El rol public conserva lo que ya tiene por defecto en el servidor (p. ej. tablas temporales en tempdb).

   REVERSION: 20b_CjIntelligence_Usuario_cj_ia_Reversion.sql (no hay datos que perder; si ya se ejecuto 20c, antes 20d).
   ============================================================================ */
SET NOCOUNT ON;
GO

IF '$(CJ_IA_PASSWORD)' = ''
    THROW 51100, 'Falta la variable de entorno CJ_IA_PASSWORD. No se crea nada.', 1;
GO

-- Login a nivel de servidor (la politica de claves de Windows/Linux se aplica; sin expiracion para servicio).
USE master;
GO
IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = N'cj_ia')
    CREATE LOGIN cj_ia WITH PASSWORD = N'$(CJ_IA_PASSWORD)', CHECK_POLICY = ON, CHECK_EXPIRATION = OFF, DEFAULT_DATABASE = JC_Db;
GO
USE JC_Db;
GO

IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'cj_ia')
    CREATE USER cj_ia FOR LOGIN cj_ia WITH DEFAULT_SCHEMA = dbo;
GO

IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'rol_cj_ia' AND type = 'R')
    CREATE ROLE rol_cj_ia AUTHORIZATION dbo;
GO

IF NOT EXISTS (SELECT 1 FROM sys.database_role_members rm
               WHERE rm.role_principal_id = DATABASE_PRINCIPAL_ID(N'rol_cj_ia') AND rm.member_principal_id = DATABASE_PRINCIPAL_ID(N'cj_ia'))
    ALTER ROLE rol_cj_ia ADD MEMBER cj_ia;
GO

-- Lista explicita (no GRANT EXECUTE a nivel de esquema): solo estos procedimientos. NO se conceden sp_IA_Cj_Identidad_Asegurar (interno) ni sp_IA_Cj_Identidad_Resolver (solo administrador).
GRANT EXECUTE ON OBJECT::dbo.sp_IA_Cj_Pagos_Buscar               TO rol_cj_ia;
GRANT EXECUTE ON OBJECT::dbo.sp_IA_Cj_Autorizacion_Permisos      TO rol_cj_ia;
GRANT EXECUTE ON OBJECT::dbo.sp_IA_Cj_Autorizacion_Empleado      TO rol_cj_ia;
GRANT EXECUTE ON OBJECT::dbo.sp_IA_Cj_Autorizacion_Equipo        TO rol_cj_ia;
GRANT EXECUTE ON OBJECT::dbo.sp_IA_Cj_Conversacion_Crear         TO rol_cj_ia;
GRANT EXECUTE ON OBJECT::dbo.sp_IA_Cj_Conversacion_Listar        TO rol_cj_ia;
GRANT EXECUTE ON OBJECT::dbo.sp_IA_Cj_Conversacion_Abrir         TO rol_cj_ia;
GRANT EXECUTE ON OBJECT::dbo.sp_IA_Cj_Conversacion_Renombrar     TO rol_cj_ia;
GRANT EXECUTE ON OBJECT::dbo.sp_IA_Cj_Conversacion_Eliminar      TO rol_cj_ia;
GRANT EXECUTE ON OBJECT::dbo.sp_IA_Cj_Turno_Iniciar              TO rol_cj_ia;
GRANT EXECUTE ON OBJECT::dbo.sp_IA_Cj_Turno_IniciarNueva         TO rol_cj_ia;
GRANT EXECUTE ON OBJECT::dbo.sp_IA_Cj_Turno_Renovar              TO rol_cj_ia;
GRANT EXECUTE ON OBJECT::dbo.sp_IA_Cj_Turno_Completar            TO rol_cj_ia;
GRANT EXECUTE ON OBJECT::dbo.sp_IA_Cj_Turno_Fallar               TO rol_cj_ia;
GRANT EXECUTE ON OBJECT::dbo.sp_IA_Cj_Resultado_Registrar        TO rol_cj_ia;
GRANT EXECUTE ON OBJECT::dbo.sp_IA_Cj_Estado_Guardar             TO rol_cj_ia;
GRANT EXECUTE ON OBJECT::dbo.sp_IA_Cj_Auditoria_Registrar        TO rol_cj_ia;
GO

-- (sin DENY de esquema: ver cabecera)
-- Si una ejecucion anterior lo aplico, 20c lo retira (REVOKE).

SET NOEXEC OFF;
GO
