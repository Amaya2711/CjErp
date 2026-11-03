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
   CJ INTELLIGENCE - REVERSION DE LA CONTRA-FIRMA (script 20f). Deja sp_IA_Planilla_Buscar exactamente como estaba antes del 20e.
   No modifica su definicion, no toca datos. Despues de esto el modo RESUMEN de pagos de CJ Intelligence vuelve a fallar con permiso denegado.
   COMANDO: sqlcmd -S <SERVIDOR> -d JC_Db -E -b -I -i 20f_CjIntelligence_ContraFirma_Reversion.sql
   ============================================================================ */
SET NOCOUNT ON;
GO

IF OBJECT_ID(N'dbo.sp_IA_Planilla_Buscar', N'P') IS NOT NULL
   AND EXISTS (SELECT 1 FROM sys.crypt_properties cp JOIN sys.certificates c ON c.thumbprint = cp.thumbprint
               WHERE cp.major_id = OBJECT_ID(N'dbo.sp_IA_Planilla_Buscar') AND c.name = N'cert_cj_ia_pagos')
    DROP COUNTER SIGNATURE FROM OBJECT::dbo.sp_IA_Planilla_Buscar BY CERTIFICATE cert_cj_ia_pagos;
GO

SET NOEXEC OFF;
GO
