:on error exit
-- GUARDA DE BASE: la base destino es JC_Db. Si la base ACTIVA no es esa, el script no hace nada.
-- USO (inicial y TAMBIEN cada vez que se modifique sp_IA_Cj_Pagos_Buscar): la contrasena del certificado NO se guarda en el repo ni se pasa por linea de comandos: se toma de la variable de
-- entorno CJ_CERT_PASSWORD (sqlcmd la usa como variable de scripting). No usar -e. Evitar comillas simples.
--   sqlcmd -S <servidor> -d JC_Db -U <admin> -i 20c_CjIntelligence_Firma_Certificado.sql
DECLARE @BaseDestino SYSNAME = N'JC_Db';
IF DB_NAME() <> @BaseDestino
BEGIN
    RAISERROR(N'Guarda de base: la base activa no es la base destino (@BaseDestino). No se ejecuto nada.', 16, 1);
    SET NOEXEC ON;
END
GO
/* ============================================================================
   CJ INTELLIGENCE - FIRMA CON CERTIFICADO (script 20c): DISENO OBJETIVO. NO EJECUTADA.
   Requiere 18, 19 (envoltorio sin EXECUTE AS OWNER) y 20 (usuario cj_ia). Comparacion con EXECUTE AS OWNER (alternativa descartada
   por ahora): docs/CJ_INTELLIGENCE_DECISIONES_PENDIENTES.md, seccion 4.

   QUE CREA (todo dentro de JC_Db; nada a nivel de servidor ni en master):
     - Certificado cert_cj_ia_pagos, clave privada protegida con la contrasena CJ_CERT_PASSWORD (NO se usa la clave maestra de la base).
     - Usuario SIN login usr_cert_cj_ia_pagos (CREATE USER ... FROM CERTIFICATE): no puede conectarse, solo aporta permisos por firma.
     - SELECT sobre 8 tablas para ese usuario: las que usa el SQL DINAMICO de sp_IA_Planilla_Buscar (las demas tablas del SP se
       leen por encadenamiento de propiedad, sin permiso):
         Planilla, Proyecto, Cliente, Site, Empleado, EmpleadoCj, Constante, a_tipo_cambio_diario
       (NO incluye CuentaEmpleado, cabOrdenCompra, detOrdenCompra ni Importar.)
     - Firma del procedimiento dbo.sp_IA_Cj_Pagos_Buscar con ese certificado.
   PERMISOS EFECTIVOS: cj_ia ejecuta el envoltorio; MIENTRAS el envoltorio esta en la pila de llamadas, su contexto suma el SELECT
   del usuario-certificado sobre esas 8 tablas (incluido el SQL dinamico de los procedimientos que invoca). Nada mas, y solo
   mientras dura esa pila. No hay INSERT/UPDATE/DELETE ni acceso a otras tablas.
   DENY: el script 20 ya no aplica el DENY de esquema (un DENY sobre cj_ia prevaleceria sobre el GRANT aportado por la firma y la
   anularia); este script lo REVOCA si existiera. Se renuncia a esa capa; cj_ia sigue sin ningun GRANT de tabla.
   [PV] Que la firma cubra el SQL dinamico del SP compartido llamado desde el envoltorio firmado NO lo demuestran 21b (solo comprueba que
   la firma existe y es valida, y los permisos) ni 22/23 (usan @SoloValidar = 1 y no llaman al SP compartido). Lo demuestra la PRUEBA REAL
   del script 24, bajo cj_ia (una consulta de pagos acotada), que esta pendiente de autorizacion expresa.

   RENOVACION: cualquier ALTER / CREATE OR ALTER de sp_IA_Cj_Pagos_Buscar ELIMINA la firma. Este script es IDEMPOTENTE: ejecutarlo
   de nuevo vuelve a firmar. 21b falla si el envoltorio esta sin firmar. Si se cambia sp_IA_Planilla_Buscar (SP compartido) y
   empieza a usar otra tabla en SQL dinamico, hay que agregar el SELECT correspondiente (revisar con la lista de arriba).
   El certificado no caduca para efectos de firma de modulos (no se valida EXPIRY_DATE); aun asi se define una fecha.
   REVERSION: 20d_CjIntelligence_Firma_Certificado_Reversion.sql (despues: 20b si tambien se quiere quitar a cj_ia).
   ============================================================================ */
SET NOCOUNT ON;
GO

IF '$(CJ_CERT_PASSWORD)' = ''
    THROW 51110, 'Falta la variable de entorno CJ_CERT_PASSWORD. No se crea nada.', 1;
IF OBJECT_ID(N'dbo.sp_IA_Cj_Pagos_Buscar', N'P') IS NULL
    THROW 51111, 'Falta dbo.sp_IA_Cj_Pagos_Buscar (script 19).', 1;
IF EXISTS (SELECT 1 FROM sys.sql_modules WHERE object_id = OBJECT_ID(N'dbo.sp_IA_Cj_Pagos_Buscar') AND execute_as_principal_id IS NOT NULL)
    THROW 51112, 'El envoltorio usa EXECUTE AS: no corresponde firmarlo. Vuelva a ejecutar el script 19.', 1;
IF DATABASE_PRINCIPAL_ID(N'rol_cj_ia') IS NULL
    THROW 51113, 'Falta el rol rol_cj_ia (script 20).', 1;
GO

-- 1. Retirar un DENY de esquema si una ejecucion anterior del script 20 lo aplico (anularia la firma). REVOKE elimina el DENY; no concede nada.
REVOKE SELECT, INSERT, UPDATE, DELETE ON SCHEMA::dbo FROM rol_cj_ia;
GO

-- 2. Certificado (clave privada protegida por contrasena, no por la clave maestra)
IF NOT EXISTS (SELECT 1 FROM sys.certificates WHERE name = N'cert_cj_ia_pagos')
    CREATE CERTIFICATE cert_cj_ia_pagos
        ENCRYPTION BY PASSWORD = N'$(CJ_CERT_PASSWORD)'
        WITH SUBJECT = N'CJ Intelligence - firma de sp_IA_Cj_Pagos_Buscar', EXPIRY_DATE = '20361231';
GO

-- 3. Usuario sin login, solo para aportar permisos por firma
IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'usr_cert_cj_ia_pagos')
    CREATE USER usr_cert_cj_ia_pagos FROM CERTIFICATE cert_cj_ia_pagos;
GO

-- 4. Permisos del usuario-certificado: SELECT solo sobre las tablas del SQL dinamico del SP compartido
GRANT SELECT ON OBJECT::dbo.Planilla             TO usr_cert_cj_ia_pagos;
GRANT SELECT ON OBJECT::dbo.Proyecto             TO usr_cert_cj_ia_pagos;
GRANT SELECT ON OBJECT::dbo.Cliente              TO usr_cert_cj_ia_pagos;
GRANT SELECT ON OBJECT::dbo.Site                 TO usr_cert_cj_ia_pagos;
GRANT SELECT ON OBJECT::dbo.Empleado             TO usr_cert_cj_ia_pagos;
GRANT SELECT ON OBJECT::dbo.EmpleadoCj           TO usr_cert_cj_ia_pagos;
GRANT SELECT ON OBJECT::dbo.Constante            TO usr_cert_cj_ia_pagos;
GRANT SELECT ON OBJECT::dbo.a_tipo_cambio_diario TO usr_cert_cj_ia_pagos;
GO

-- 5. Firma (idempotente: solo firma si el envoltorio no tiene la firma de este certificado)
IF NOT EXISTS (SELECT 1 FROM sys.crypt_properties cp JOIN sys.certificates c ON c.thumbprint = cp.thumbprint
               WHERE cp.major_id = OBJECT_ID(N'dbo.sp_IA_Cj_Pagos_Buscar') AND c.name = N'cert_cj_ia_pagos')
    ADD SIGNATURE TO OBJECT::dbo.sp_IA_Cj_Pagos_Buscar BY CERTIFICATE cert_cj_ia_pagos WITH PASSWORD = N'$(CJ_CERT_PASSWORD)';
GO

SELECT 'firmas_del_envoltorio' AS Seccion, c.name AS Certificado
FROM sys.crypt_properties cp JOIN sys.certificates c ON c.thumbprint = cp.thumbprint
WHERE cp.major_id = OBJECT_ID(N'dbo.sp_IA_Cj_Pagos_Buscar');
GO

SET NOEXEC OFF;
GO
