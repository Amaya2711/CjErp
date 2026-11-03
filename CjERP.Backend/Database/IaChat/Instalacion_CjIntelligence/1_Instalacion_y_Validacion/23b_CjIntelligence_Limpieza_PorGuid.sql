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
   CJ INTELLIGENCE - LIMPIEZA DE UNA CONVERSACION DE PRUEBA POR GUID (23b). NO EJECUTADA. Como administrador.
   Uso: sqlcmd -S <servidor> -d JC_Db -U <admin> -i 23b_CjIntelligence_Limpieza_PorGuid.sql -v GuidPrueba="<guid impreso por 23>"
   SEGURIDAD: borra SOLO la conversacion con ese GUID y sus filas hijas, y SOLO si tiene Modulo = 'PRUEBA'; si no, aborta.
   No borra por usuario, fecha ni patron.
   IDENTIDAD: la identidad permanente del propietario nace con su primera conversacion. Se elimina SOLO si, tras borrar esta conversacion, el
   propietario no tiene NINGUNA otra conversacion ni turno y su identidad es VIGENTE sin resolucion (es decir, nacio con la prueba). Si el
   usuario ya usaba el modulo, su identidad se conserva.
   ============================================================================ */
SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @g UNIQUEIDENTIFIER = TRY_CONVERT(UNIQUEIDENTIFIER, N'$(GuidPrueba)');
IF @g IS NULL THROW 51500, 'GuidPrueba no es un GUID valido.', 1;
IF NOT EXISTS (SELECT 1 FROM dbo.IA_Conversacion WHERE IdConversacion = @g)
    THROW 51501, 'No existe una conversacion con ese GUID: no se borra nada.', 1;
IF NOT EXISTS (SELECT 1 FROM dbo.IA_Conversacion WHERE IdConversacion = @g AND Modulo = 'PRUEBA')
    THROW 51502, 'La conversacion no es de PRUEBA: no se borra.', 1;

DECLARE @dueno NVARCHAR(50) = (SELECT IdUsuario FROM dbo.IA_Conversacion WHERE IdConversacion = @g);

BEGIN TRAN;
DELETE FROM dbo.IA_ResultadoConsulta WHERE IdConversacion = @g;
DELETE FROM dbo.IA_Mensaje WHERE IdConversacion = @g;
DELETE FROM dbo.IA_Turno WHERE IdConversacion = @g;
DELETE FROM dbo.IA_ConversacionEstado WHERE IdConversacion = @g;
DELETE FROM dbo.IA_Conversacion WHERE IdConversacion = @g;
DELETE i FROM dbo.IA_IdentidadUsuario i
WHERE i.IdUsuario = @dueno AND i.Estado = 'VIGENTE' AND i.Resolucion IS NULL
  AND NOT EXISTS (SELECT 1 FROM dbo.IA_Conversacion c WHERE c.IdUsuario = @dueno)
  AND NOT EXISTS (SELECT 1 FROM dbo.IA_Turno t WHERE t.IdUsuario = @dueno);
COMMIT;

SELECT COUNT(*) AS FilasRestantes FROM dbo.IA_Conversacion WHERE IdConversacion = @g;
GO

SET NOEXEC OFF;
GO
