-- SOLO LECTURA. Validacion de la FIRMA CON CERTIFICADO (diseno objetivo), despues de 19, 20 y 20c. No modifica nada.
-- Ejecutar tambien DESPUES de cada modificacion de sp_IA_Cj_Pagos_Buscar (un ALTER elimina la firma) y de volver a firmar con 20c.
-- Uso: sqlcmd -S <servidor> -d JC_Db -U <admin> -i 21b_CjIntelligence_Validacion_Firma_SoloLectura.sql
-- Cada fila: OK | FALLA. Cualquier FALLA detiene el despliegue.
SET NOCOUNT ON;
DECLARE @r TABLE (Orden INT IDENTITY(1,1), Chequeo VARCHAR(160), Resultado VARCHAR(5), Detalle NVARCHAR(300));

INSERT @r (Chequeo, Resultado, Detalle)
SELECT 'El envoltorio NO usa EXECUTE AS', CASE WHEN execute_as_principal_id IS NULL THEN 'OK' ELSE 'FALLA' END, NULL
FROM sys.sql_modules WHERE object_id = OBJECT_ID('dbo.sp_IA_Cj_Pagos_Buscar');

INSERT @r (Chequeo, Resultado, Detalle)
SELECT 'El envoltorio esta FIRMADO con cert_cj_ia_pagos (un ALTER elimina la firma: volver a ejecutar 20c)',
       CASE WHEN EXISTS (SELECT 1 FROM sys.crypt_properties cp JOIN sys.certificates c ON c.thumbprint = cp.thumbprint
                         WHERE cp.major_id = OBJECT_ID('dbo.sp_IA_Cj_Pagos_Buscar') AND c.name = 'cert_cj_ia_pagos') THEN 'OK' ELSE 'FALLA' END, NULL;

INSERT @r (Chequeo, Resultado, Detalle)
SELECT 'La firma del envoltorio es VALIDA para su definicion actual',
       CASE WHEN EXISTS (SELECT 1 FROM sys.certificates c CROSS APPLY sys.fn_check_object_signatures(N'certificate', c.thumbprint) f
                         WHERE c.name = 'cert_cj_ia_pagos' AND f.entity_id = OBJECT_ID('dbo.sp_IA_Cj_Pagos_Buscar') AND f.is_signature_valid = 1) THEN 'OK' ELSE 'FALLA' END, NULL;

INSERT @r (Chequeo, Resultado, Detalle)
SELECT 'Ningun otro procedimiento de CJ Intelligence esta firmado',
       CASE WHEN NOT EXISTS (SELECT 1 FROM sys.crypt_properties cp JOIN sys.objects o ON o.object_id = cp.major_id
                             WHERE o.name LIKE 'sp[_]IA[_]Cj[_]%' AND o.name <> 'sp_IA_Cj_Pagos_Buscar') THEN 'OK' ELSE 'FALLA' END, NULL;

INSERT @r (Chequeo, Resultado, Detalle)
SELECT 'usr_cert_cj_ia_pagos no tiene login (no puede conectarse)',
       CASE WHEN EXISTS (SELECT 1 FROM sys.database_principals WHERE name = 'usr_cert_cj_ia_pagos' AND type = 'C' AND sid IS NOT NULL
                         AND NOT EXISTS (SELECT 1 FROM sys.server_principals sp WHERE sp.sid = sys.database_principals.sid)) THEN 'OK' ELSE 'FALLA' END, NULL;

-- Permisos del usuario-certificado: exactamente SELECT sobre las 8 tablas esperadas y nada mas
INSERT @r (Chequeo, Resultado, Detalle)
SELECT 'usr_cert_cj_ia_pagos: SELECT exacto sobre las 8 tablas del SQL dinamico',
       CASE WHEN (SELECT COUNT(*) FROM sys.database_permissions p WHERE p.grantee_principal_id = DATABASE_PRINCIPAL_ID('usr_cert_cj_ia_pagos')
                  AND p.permission_name = 'SELECT' AND p.state = 'G' AND p.class = 1
                  AND OBJECT_NAME(p.major_id) IN ('Planilla','Proyecto','Cliente','Site','Empleado','EmpleadoCj','Constante','a_tipo_cambio_diario')) = 8
             AND (SELECT COUNT(*) FROM sys.database_permissions p WHERE p.grantee_principal_id = DATABASE_PRINCIPAL_ID('usr_cert_cj_ia_pagos')
                  AND p.permission_name <> 'CONNECT') = 8 THEN 'OK' ELSE 'FALLA' END, NULL;

INSERT @r (Chequeo, Resultado, Detalle)
SELECT 'Sin acceso del usuario-certificado a CuentaEmpleado/cabOrdenCompra/detOrdenCompra/Importar',
       CASE WHEN NOT EXISTS (SELECT 1 FROM sys.database_permissions p WHERE p.grantee_principal_id = DATABASE_PRINCIPAL_ID('usr_cert_cj_ia_pagos')
                             AND OBJECT_NAME(p.major_id) IN ('CuentaEmpleado','cabOrdenCompra','detOrdenCompra','Importar')) THEN 'OK' ELSE 'FALLA' END, NULL;

-- El DENY de esquema anularia la firma: debe estar retirado
INSERT @r (Chequeo, Resultado, Detalle)
SELECT 'Sin DENY de esquema sobre rol_cj_ia (anularia la firma)',
       CASE WHEN NOT EXISTS (SELECT 1 FROM sys.database_permissions p WHERE p.grantee_principal_id = DATABASE_PRINCIPAL_ID('rol_cj_ia') AND p.state = 'D') THEN 'OK' ELSE 'FALLA' END, NULL;

INSERT @r (Chequeo, Resultado, Detalle)
SELECT 'rol_cj_ia sin ningun GRANT de tabla',
       CASE WHEN NOT EXISTS (SELECT 1 FROM sys.database_permissions p WHERE p.grantee_principal_id = DATABASE_PRINCIPAL_ID('rol_cj_ia')
                             AND p.state IN ('G','W') AND p.permission_name IN ('SELECT','INSERT','UPDATE','DELETE','CONTROL')) THEN 'OK' ELSE 'FALLA' END, NULL;

INSERT @r (Chequeo, Resultado, Detalle)
SELECT 'La clave privada del certificado NO esta protegida por la clave maestra',
       CASE WHEN EXISTS (SELECT 1 FROM sys.certificates WHERE name = 'cert_cj_ia_pagos' AND pvt_key_encryption_type = 'PW') THEN 'OK' ELSE 'FALLA' END, NULL;

SELECT Orden, Chequeo, Resultado, Detalle FROM @r ORDER BY Orden;
SELECT SUM(CASE WHEN Resultado = 'FALLA' THEN 1 ELSE 0 END) AS Fallas, COUNT(*) AS Chequeos FROM @r;
