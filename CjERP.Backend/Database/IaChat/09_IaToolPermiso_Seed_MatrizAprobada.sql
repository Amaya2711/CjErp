/* ============================================================================
   SEED INICIAL — NO EJECUTADO. Carga la matriz APROBADA el 2026-10-03
   (docs/AI_COPILOT_FASE2_MATRIZ_PERMISOS.md) en dbo.IaToolPermiso. Requiere el script 08.
   Aplicar siguiendo el procedimiento escalonado de docs/AI_COPILOT_FASE2_INTEGRACION_DEV.md.

   - Son valores INICIALES EDITABLES: despues de cargarlos se mantienen en BD / pantalla de administracion.
     Este script NUNCA sobrescribe una fila existente (si ya existe (ToolName, IdPerfilRol), no la toca).
   - Cada fila solo se inserta si el par (IdPerfilRol, IdPerfil, IdRol) existe en SegPerfilRol y esta
     activo: protege contra identificadores que hayan cambiado. Si alguna fila de la matriz no se puede
     cargar ni existe ya, el script falla y revierte TODO (sin cargas parciales).
   - Sin ALTER a tablas. Idempotente.
   ============================================================================ */
SET NOCOUNT ON;
SET XACT_ABORT ON;

-- GUARDA DE BASE: la base destino por defecto es JC_Db (editar @BaseDestino solo si se aplica en otra base).
-- Si la base ACTIVA de la conexion en SSMS es otra (p. ej. master), el script no hace nada.
DECLARE @BaseDestino SYSNAME = N'JC_Db';
IF DB_NAME() <> @BaseDestino
    THROW 50040, 'Guarda de base: la base activa no es la base destino (@BaseDestino). Cambie la base activa en SSMS.', 1;

IF OBJECT_ID(N'dbo.IaToolPermiso', N'U') IS NULL
    THROW 50031, 'Falta dbo.IaToolPermiso: ejecute antes 08_IaToolPermiso_Base.sql (en la copia de desarrollo).', 1;

DECLARE @Tool VARCHAR(100) = 'buscar_planilla';
DECLARE @Actor NVARCHAR(100) = N'SEED_MATRIZ_2026-10-03';

DECLARE @Matriz TABLE
(
    IdPerfilRol INT NOT NULL PRIMARY KEY,
    IdPerfil INT NOT NULL,
    IdRol INT NOT NULL,
    ScopeLevel VARCHAR(10) NOT NULL,
    PermiteTotalesGlobales BIT NOT NULL
);

INSERT INTO @Matriz (IdPerfilRol, IdPerfil, IdRol, ScopeLevel, PermiteTotalesGlobales)
VALUES
    (2,   2, 4, 'TOTAL',  1),  -- FINANZAS / ADMIN
    (30,  2, 7, 'TOTAL',  0),  -- FINANZAS / ESTANDAR
    (32,  2, 8, 'TOTAL',  0),  -- FINANZAS / ESPE_FIN
    (3,   3, 4, 'EQUIPO', 0),  -- LOGISTICA / ADMIN
    (31,  4, 7, 'PROPIO', 0),  -- ADMINISTRACION / ESTANDAR
    (26,  8, 4, 'EQUIPO', 0),  -- ADMIN / ADMIN
    (27,  8, 5, 'PROPIO', 0),  -- ADMIN / SISTEMAS
    (29,  9, 4, 'EQUIPO', 0),  -- OPERACIONES / ADMIN
    (33,  9, 7, 'PROPIO', 0),  -- OPERACIONES / ESTANDAR
    (28, 14, 7, 'PROPIO', 0),  -- ESTANDAR / ESTANDAR
    (34, 15, 4, 'TOTAL',  1);  -- GERENCIA / ADMIN

BEGIN TRAN;

INSERT INTO dbo.IaToolPermiso (ToolName, IdPerfilRol, ScopeLevel, PermiteTotalesGlobales, EsActivo, UsuarioCreacion)
SELECT @Tool, m.IdPerfilRol, m.ScopeLevel, m.PermiteTotalesGlobales, 1, @Actor
FROM @Matriz m
JOIN dbo.SegPerfilRol pr
  ON pr.IdPerfilRol = m.IdPerfilRol AND pr.IdPerfil = m.IdPerfil AND pr.IdRol = m.IdRol AND pr.EsActivo = 1
WHERE NOT EXISTS (SELECT 1 FROM dbo.IaToolPermiso t WHERE t.ToolName = @Tool AND t.IdPerfilRol = m.IdPerfilRol);

-- Verificacion: cada fila de la matriz debe existir ahora (insertada ahora o ya existente).
DECLARE @Faltan INT =
(
    SELECT COUNT(*) FROM @Matriz m
    WHERE NOT EXISTS (SELECT 1 FROM dbo.IaToolPermiso t WHERE t.ToolName = @Tool AND t.IdPerfilRol = m.IdPerfilRol)
);
IF @Faltan > 0
BEGIN
    ROLLBACK TRAN;
    THROW 50032, 'Seed IaToolPermiso abortado: hay filas de la matriz cuyo (IdPerfilRol, IdPerfil, IdRol) no existe o no esta activo en SegPerfilRol. Nada se cargo.', 1;
END;

COMMIT TRAN;

-- Resultado
SELECT t.IdPerfilRol, p.NombrePerfil, r.NombreRol, t.ScopeLevel, t.PermiteTotalesGlobales, t.EsActivo, t.UsuarioCreacion
FROM dbo.IaToolPermiso t
JOIN dbo.SegPerfilRol pr ON pr.IdPerfilRol = t.IdPerfilRol
JOIN dbo.SegPerfil p ON p.IdPerfil = pr.IdPerfil
JOIN dbo.SegRol r ON r.IdRol = pr.IdRol
WHERE t.ToolName = @Tool
ORDER BY t.IdPerfilRol;
