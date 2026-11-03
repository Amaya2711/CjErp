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
   CJ INTELLIGENCE - REVERSION DE LA FIRMA CON CERTIFICADO (script 20d). NO EJECUTADA.
   Quita firma, permisos, usuario-certificado y certificado. Despues de esto el modo RESUMEN de pagos falla con permiso denegado
   (no hay respaldo permisivo). NO recrea ninguna elevacion alternativa ni el DENY de esquema: si se decidiera volver a
   EXECUTE AS OWNER, se prepara por separado y requiere nueva aprobacion. No hay datos que perder.
   ============================================================================ */
SET NOCOUNT ON;
GO

IF OBJECT_ID(N'dbo.sp_IA_Cj_Pagos_Buscar', N'P') IS NOT NULL
   AND EXISTS (SELECT 1 FROM sys.crypt_properties cp JOIN sys.certificates c ON c.thumbprint = cp.thumbprint
               WHERE cp.major_id = OBJECT_ID(N'dbo.sp_IA_Cj_Pagos_Buscar') AND c.name = N'cert_cj_ia_pagos')
    DROP SIGNATURE FROM OBJECT::dbo.sp_IA_Cj_Pagos_Buscar BY CERTIFICATE cert_cj_ia_pagos;
GO

IF DATABASE_PRINCIPAL_ID(N'usr_cert_cj_ia_pagos') IS NOT NULL
    DROP USER usr_cert_cj_ia_pagos;      -- los GRANT desaparecen con el usuario
GO

IF EXISTS (SELECT 1 FROM sys.certificates WHERE name = N'cert_cj_ia_pagos')
    DROP CERTIFICATE cert_cj_ia_pagos;
GO

SET NOEXEC OFF;
GO
