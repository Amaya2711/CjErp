:on error exit
-- GUARDA DE BASE: la base destino es JC_Db. Si la base ACTIVA no es esa, el script no hace nada.
DECLARE @BaseDestino SYSNAME = N'JC_Db';
IF DB_NAME() <> @BaseDestino
BEGIN
    RAISERROR(N'Guarda de base: la base activa no es la base destino (@BaseDestino). No se ejecuto nada.', 16, 1);
    SET NOEXEC ON;
END
GO
/* ============================================================================
   CJ INTELLIGENCE - CONTRA-FIRMA DEL PROCEDIMIENTO COMPARTIDO (script 20e).
   AUTORIZADO por el dueno del sistema el 2026-11-02 tras el resultado del script 24 (FALLA: SELECT denegado sobre 'Constante').

   POR QUE: la firma del envoltorio (20c) da permisos al envoltorio, pero NO a los procedimientos que ese envoltorio llama. El SQL dinamico
   de dbo.sp_IA_Planilla_Buscar (procedimiento COMPARTIDO del ERP) se ejecuta dentro de ese segundo procedimiento y por eso fallaba con el error 229.
   SQL Server lo resuelve con una CONTRA-FIRMA (COUNTER SIGNATURE) del procedimiento llamado, con el MISMO certificado.

   QUE HACE (una sola sentencia efectiva):
     ADD COUNTER SIGNATURE TO OBJECT::dbo.sp_IA_Planilla_Buscar BY CERTIFICATE cert_cj_ia_pagos
   QUE NO HACE: no modifica la DEFINICION de sp_IA_Planilla_Buscar (su modify_date SI se actualiza, porque agregar una firma la actualiza; el script 21 ya lo contempla), no concede ningun permiso nuevo (el usuario-certificado
   sigue teniendo SELECT solo sobre las mismas 8 tablas, y solo mientras el envoltorio firmado esta en la pila), no toca otros objetos del ERP.
   LIMITE CONOCIDO: cualquier ALTER / CREATE OR ALTER de dbo.sp_IA_Planilla_Buscar ELIMINA la contra-firma: volver a ejecutar este script (idempotente)
   y repetir la validacion. Quien modifique ese procedimiento debe saberlo (el chat de IA actual lo usa).

   REQUISITOS: scripts 18, 19, 20, 20c ejecutados. Variable de entorno CJ_CERT_PASSWORD (la misma del 20c; NO se imprime).
   COMANDO: sqlcmd -S <SERVIDOR> -d JC_Db -E -b -I -i 20e_CjIntelligence_ContraFirma_SP_Compartido.sql
   VERIFICACION: 21b (etapa de firma) + repetir el script 24. REVERSION: 20f_CjIntelligence_ContraFirma_Reversion.sql.
   ============================================================================ */
SET NOCOUNT ON;
GO

IF '$(CJ_CERT_PASSWORD)' = ''
    THROW 51120, 'Falta la variable de entorno CJ_CERT_PASSWORD. No se firma nada.', 1;
IF OBJECT_ID(N'dbo.sp_IA_Planilla_Buscar', N'P') IS NULL
    THROW 51121, 'Falta dbo.sp_IA_Planilla_Buscar.', 1;
IF NOT EXISTS (SELECT 1 FROM sys.certificates WHERE name = N'cert_cj_ia_pagos')
    THROW 51122, 'Falta el certificado cert_cj_ia_pagos (script 20c).', 1;
IF NOT EXISTS (SELECT 1 FROM sys.crypt_properties cp JOIN sys.certificates c ON c.thumbprint = cp.thumbprint
               WHERE cp.major_id = OBJECT_ID(N'dbo.sp_IA_Cj_Pagos_Buscar') AND c.name = N'cert_cj_ia_pagos')
    THROW 51123, 'El envoltorio sp_IA_Cj_Pagos_Buscar no esta firmado (script 20c): la contra-firma no tendria efecto.', 1;
GO

-- Idempotente: solo contra-firma si el procedimiento compartido no tiene ya una firma de este certificado.
IF NOT EXISTS (SELECT 1 FROM sys.crypt_properties cp JOIN sys.certificates c ON c.thumbprint = cp.thumbprint
               WHERE cp.major_id = OBJECT_ID(N'dbo.sp_IA_Planilla_Buscar') AND c.name = N'cert_cj_ia_pagos')
    ADD COUNTER SIGNATURE TO OBJECT::dbo.sp_IA_Planilla_Buscar BY CERTIFICATE cert_cj_ia_pagos WITH PASSWORD = N'$(CJ_CERT_PASSWORD)';
GO

SELECT 'firmas_del_procedimiento_compartido' AS Seccion, OBJECT_NAME(cp.major_id) AS Objeto, cp.crypt_type_desc AS Tipo, c.name AS Certificado
FROM sys.crypt_properties cp JOIN sys.certificates c ON c.thumbprint = cp.thumbprint
WHERE cp.major_id = OBJECT_ID(N'dbo.sp_IA_Planilla_Buscar');
GO

SET NOEXEC OFF;
GO
