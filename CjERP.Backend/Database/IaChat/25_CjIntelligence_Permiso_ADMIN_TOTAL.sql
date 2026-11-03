-- CJ INTELLIGENCE: concede nivel TOTAL (con totales globales) a ADMIN para la herramienta de pagos (buscar_planilla).
-- AUTORIZADO por el usuario el 2026-11-02 ("asignarle permiso TOTAL; ADMIN es controlado por PTORRES").
-- QUE HACE: un UPDATE sobre dbo.IaToolPermiso, fila del perfil-rol 27 (hoy PROPIO, sin totales globales) -> TOTAL con totales globales.
--   Se elige esa fila y NO una asignacion nueva en SegUsuarioPerfilRol para no dar a ADMIN permisos de OTROS modulos del ERP:
--   el cambio afecta SOLO a CJ Intelligence.
-- SEGURIDAD: aborta si la base no es JC_Db, si la fila no existe, si el perfil-rol 27 tiene hoy usuarios activos distintos de ADMIN
--   (el cambio ampliaria el acceso a otras personas) o si ya esta en TOTAL (no hace nada). No toca Usuario, Seg*, Planilla ni procedimientos.
-- EFECTO: ADMIN (y solo ADMIN; ver guarda) pasa a ver TODOS los pagos y los totales globales en CJ Intelligence, siempre que este en
--   CjIntelligence:UsuariosPermitidos. El nivel solo se aplica si su identidad sigue siendo valida (fn_IA_Cj_UsuarioValido).
-- REVERSION: ver el bloque final (vuelve a PROPIO sin totales globales).
-- Se ejecuta en una ventana normal de SSMS conectada a JC_Db (no usa SQLCMD). Ejecutar completo.
SET NOCOUNT ON;

IF DB_NAME() <> N'JC_Db'
    THROW 51800, 'Guarda de base: la base activa no es JC_Db. No se ejecuto nada.', 1;

DECLARE @PerfilRol INT = 27;
DECLARE @Tool VARCHAR(100) = 'buscar_planilla';
DECLARE @Nivel VARCHAR(10), @Glob BIT;

SELECT @Nivel = ScopeLevel, @Glob = PermiteTotalesGlobales
FROM dbo.IaToolPermiso WHERE ToolName = @Tool AND IdPerfilRol = @PerfilRol AND EsActivo = 1;

IF @Nivel IS NULL
    THROW 51801, 'No existe la fila activa de IaToolPermiso para el perfil-rol 27: no se cambia nada.', 1;

-- Guarda: el perfil-rol 27 solo debe tener a ADMIN como usuario activo
DECLARE @Otros INT = (
    SELECT COUNT(*)
    FROM dbo.SegUsuarioPerfilRol upr
    INNER JOIN dbo.Usuario u ON u.IdUsuario = upr.IdUsuario AND u.IdEstado = 1
    WHERE upr.IdPerfilRol = @PerfilRol AND upr.EsActivo = 1 AND upr.IdUsuario <> N'ADMIN');
IF @Otros > 0
    THROW 51802, 'El perfil-rol 27 tiene otros usuarios activos ademas de ADMIN: el cambio ampliaria su acceso. No se cambio nada.', 1;

IF NOT EXISTS (SELECT 1 FROM dbo.SegUsuarioPerfilRol WHERE IdPerfilRol = @PerfilRol AND IdUsuario = N'ADMIN' AND EsActivo = 1)
    THROW 51803, 'ADMIN no tiene asignacion activa al perfil-rol 27: no se cambia nada.', 1;

IF @Nivel = 'TOTAL' AND @Glob = 1
    PRINT 'El perfil-rol 27 ya es TOTAL con totales globales: no se cambia nada.';
ELSE
    UPDATE dbo.IaToolPermiso
    SET ScopeLevel = 'TOTAL', PermiteTotalesGlobales = 1,
        FechaModificacion = SYSDATETIME(), UsuarioModificacion = 'AJUSTE_ADMIN_TOTAL_2026-11-02'
    WHERE ToolName = @Tool AND IdPerfilRol = @PerfilRol AND EsActivo = 1;

SELECT IdIaToolPermiso, ToolName, IdPerfilRol, ScopeLevel, PermiteTotalesGlobales, EsActivo, UsuarioModificacion,
       @Nivel AS NivelAnterior, @Glob AS GlobalesAnterior
FROM dbo.IaToolPermiso WHERE ToolName = @Tool AND IdPerfilRol = @PerfilRol;

/* REVERSION (ejecutar aparte si hace falta volver al estado anterior):
UPDATE dbo.IaToolPermiso
SET ScopeLevel = 'PROPIO', PermiteTotalesGlobales = 0, FechaModificacion = SYSDATETIME(), UsuarioModificacion = 'REVERSION_ADMIN_TOTAL'
WHERE ToolName = 'buscar_planilla' AND IdPerfilRol = 27 AND EsActivo = 1;
*/
