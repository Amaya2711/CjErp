/* ============================================================================
   AJUSTE DE MATRIZ — NO EJECUTADO. IdPerfilRol 26 (ADMIN / ADMIN): EQUIPO/0 -> TOTAL/1 (decision del
   responsable de negocio, 2026-10-03). El seed 09 no sobrescribe filas existentes, por eso este script
   actualiza la fila ya cargada en JC_Db. Idempotente. Sin ALTER. No elimina filas.
   Verificar despues con 12_verificar_integracion_alcance_SoloLectura.sql.
   ============================================================================ */
SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @BaseDestino SYSNAME = N'JC_Db';
IF DB_NAME() <> @BaseDestino
    THROW 50040, 'Guarda de base: la base activa no es la base destino (@BaseDestino). Cambie la base activa en SSMS.', 1;

IF OBJECT_ID(N'dbo.IaToolPermiso', N'U') IS NULL
    THROW 50031, 'Falta dbo.IaToolPermiso: ejecute antes 08_IaToolPermiso_Base.sql.', 1;

DECLARE @Tool VARCHAR(100) = 'buscar_planilla';
DECLARE @Actor NVARCHAR(100) = N'AJUSTE_MATRIZ_2026-10-03';

-- Antes
SELECT IdPerfilRol, ScopeLevel, PermiteTotalesGlobales, EsActivo
FROM dbo.IaToolPermiso WHERE ToolName = @Tool AND IdPerfilRol = 26;

BEGIN TRAN;

UPDATE dbo.IaToolPermiso
SET ScopeLevel = 'TOTAL', PermiteTotalesGlobales = 1, EsActivo = 1,
    FechaModificacion = SYSDATETIME(), UsuarioModificacion = @Actor
WHERE ToolName = @Tool AND IdPerfilRol = 26
  AND (ScopeLevel <> 'TOTAL' OR PermiteTotalesGlobales <> 1 OR EsActivo <> 1);

-- Si la fila no existia (seed 09 viejo no ejecutado), se inserta solo si el par existe y esta activo.
INSERT INTO dbo.IaToolPermiso (ToolName, IdPerfilRol, ScopeLevel, PermiteTotalesGlobales, EsActivo, UsuarioCreacion)
SELECT @Tool, 26, 'TOTAL', 1, 1, @Actor
FROM dbo.SegPerfilRol pr
WHERE pr.IdPerfilRol = 26 AND pr.IdPerfil = 8 AND pr.IdRol = 4 AND pr.EsActivo = 1
  AND NOT EXISTS (SELECT 1 FROM dbo.IaToolPermiso t WHERE t.ToolName = @Tool AND t.IdPerfilRol = 26);

IF NOT EXISTS (SELECT 1 FROM dbo.IaToolPermiso
               WHERE ToolName = @Tool AND IdPerfilRol = 26 AND ScopeLevel = 'TOTAL' AND PermiteTotalesGlobales = 1 AND EsActivo = 1)
BEGIN
    ROLLBACK TRAN;
    THROW 50041, 'No se pudo dejar IdPerfilRol 26 en TOTAL/1 (revisar SegPerfilRol 26 = IdPerfil 8, IdRol 4, activo).', 1;
END;

COMMIT TRAN;

-- Despues
SELECT IdPerfilRol, ScopeLevel, PermiteTotalesGlobales, EsActivo, UsuarioModificacion
FROM dbo.IaToolPermiso WHERE ToolName = @Tool AND IdPerfilRol = 26;
