-- ============================================================================
-- VERIFICACION INTEGRAL (SOLO LECTURA) de la integracion del alcance del IA Chat.
-- Valida lo que el script 04 NO valida: 04 solo mira el estado de dbo.sp_IA_Planilla_Buscar. Este script
-- comprueba ademas: la tabla dbo.IaToolPermiso (estructura y restricciones), la carga de la matriz aprobada,
-- los pares IdPerfilRol/IdPerfil/IdRol, los menus Chat IA y la cobertura de cuentas. No inserta ni modifica nada
-- y es seguro ejecutarlo en cualquier base, incluida JC_Db (cuando aun no hay tabla, informa PENDIENTE/FALTA).
--
-- Dependencias reales: sys.parameters/objects/columns/indexes/foreign_keys/check_constraints/triggers (lectura de
-- catalogo), dbo.SegPerfilRol, dbo.SegUsuarioPerfilRol, dbo.SegPerfilRolMenu, dbo.SegMenu, dbo.Usuario,
-- dbo.Empleado, dbo.EmpleadoCj; dbo.IaToolPermiso solo por SQL dinamico (puede no existir). No requiere
-- VIEW SERVER STATE. Resultado: una fila por chequeo (PASS / FAIL / FALTA / DIFERENTE / PENDIENTE / INFO).
-- Nota: los valores de la matriz son los INICIALES aprobados; si luego se editan legitimamente desde la
-- pantalla/BD, "DIFERENTE" es esperable (la verificacion es de la carga inicial).
-- ============================================================================
SET NOCOUNT ON;

DECLARE @R TABLE (Orden INT IDENTITY(1, 1), Chequeo NVARCHAR(130), Resultado VARCHAR(12), Detalle NVARCHAR(400));

DECLARE @Esperada TABLE
(
    IdPerfilRol INT PRIMARY KEY, IdPerfil INT, IdRol INT, ScopeLevel VARCHAR(10), PermiteTotalesGlobales BIT
);
INSERT @Esperada VALUES
    (2, 2, 4, 'TOTAL', 1), (30, 2, 7, 'TOTAL', 0), (32, 2, 8, 'TOTAL', 0), (3, 3, 4, 'EQUIPO', 0),
    (31, 4, 7, 'PROPIO', 0), (26, 8, 4, 'EQUIPO', 0), (27, 8, 5, 'PROPIO', 0), (29, 9, 4, 'EQUIPO', 0),
    (33, 9, 7, 'PROPIO', 0), (28, 14, 7, 'PROPIO', 0), (34, 15, 4, 'TOTAL', 1);

-- C00 Contexto
INSERT @R (Chequeo, Resultado, Detalle)
VALUES (N'C00 Base y servidor', 'INFO', CONCAT(DB_NAME(), N' @ ', @@SERVERNAME));

-- C01 SP: version por firma (el cuerpo se valida con 04/05)
DECLARE @pn INT = (SELECT COUNT(*) FROM sys.parameters WHERE object_id = OBJECT_ID(N'dbo.sp_IA_Planilla_Buscar'));
DECLARE @p4 INT = (SELECT COUNT(*) FROM sys.parameters WHERE object_id = OBJECT_ID(N'dbo.sp_IA_Planilla_Buscar')
                   AND name IN (N'@AlcanceNivel', N'@AlcanceCampos', N'@AlcanceEmpleados', N'@VerTotalesGlobales'));
INSERT @R (Chequeo, Resultado, Detalle)
VALUES (N'C01 SP sp_IA_Planilla_Buscar (solo firma)', 'INFO',
        CASE WHEN @p4 = 4 THEN CONCAT(@pn, N' parametros: firma CON ALCANCE (22 = script 02; 26 = v2 columnas de analisis; 29 = v3 modo resumen; validar el cuerpo con 04/05)')
             WHEN @pn = 18 AND @p4 = 0 THEN N'18 parametros: firma ANTERIOR (sin alcance)'
             ELSE CONCAT(N'INCONSISTENTE: parametros=', @pn, N', de alcance=', @p4) END);

-- C02 Tabla dbo.IaToolPermiso: estructura y restricciones
DECLARE @tabla BIT = CASE WHEN OBJECT_ID(N'dbo.IaToolPermiso', N'U') IS NULL THEN 0 ELSE 1 END;
IF @tabla = 0
    INSERT @R (Chequeo, Resultado, Detalle) VALUES (N'C02 Tabla dbo.IaToolPermiso', 'FALTA', N'No existe: falta ejecutar 08_IaToolPermiso_Base.sql (en la copia)');
ELSE
BEGIN
    DECLARE @cols TABLE (Nombre SYSNAME);
    INSERT @cols VALUES (N'IdIaToolPermiso'), (N'ToolName'), (N'IdPerfilRol'), (N'ScopeLevel'), (N'PermiteTotalesGlobales'),
                        (N'EsActivo'), (N'FechaCreacion'), (N'UsuarioCreacion'), (N'FechaModificacion'), (N'UsuarioModificacion');
    DECLARE @faltanCols INT = (SELECT COUNT(*) FROM @cols c WHERE NOT EXISTS
        (SELECT 1 FROM sys.columns x WHERE x.object_id = OBJECT_ID(N'dbo.IaToolPermiso') AND x.name = c.Nombre));
    DECLARE @extraCols INT = (SELECT COUNT(*) FROM sys.columns x WHERE x.object_id = OBJECT_ID(N'dbo.IaToolPermiso')
        AND x.name NOT IN (SELECT Nombre FROM @cols));
    INSERT @R (Chequeo, Resultado, Detalle)
    VALUES (N'C02a Columnas', CASE WHEN @faltanCols = 0 AND @extraCols = 0 THEN 'PASS' ELSE 'FAIL' END,
            CONCAT(N'faltan=', @faltanCols, N'; adicionales=', @extraCols));
    INSERT @R (Chequeo, Resultado, Detalle)
    VALUES (N'C02b Indice unico (ToolName, IdPerfilRol)',
            CASE WHEN EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_IaToolPermiso_Tool_PerfilRol'
                              AND object_id = OBJECT_ID(N'dbo.IaToolPermiso') AND is_unique = 1) THEN 'PASS' ELSE 'FAIL' END, N'');
    INSERT @R (Chequeo, Resultado, Detalle)
    VALUES (N'C02c FK a SegPerfilRol',
            CASE WHEN EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_IaToolPermiso_SegPerfilRol'
                              AND parent_object_id = OBJECT_ID(N'dbo.IaToolPermiso')) THEN 'PASS' ELSE 'FAIL' END, N'');
    INSERT @R (Chequeo, Resultado, Detalle)
    VALUES (N'C02d CHECK de ScopeLevel',
            CASE WHEN EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_IaToolPermiso_Scope'
                              AND parent_object_id = OBJECT_ID(N'dbo.IaToolPermiso')) THEN 'PASS' ELSE 'FAIL' END, N'');
    INSERT @R (Chequeo, Resultado, Detalle)
    VALUES (N'C02e Trigger anti-borrado habilitado',
            CASE WHEN EXISTS (SELECT 1 FROM sys.triggers WHERE name = N'TR_IaToolPermiso_SinBorrado'
                              AND parent_id = OBJECT_ID(N'dbo.IaToolPermiso') AND is_instead_of_trigger = 1 AND is_disabled = 0)
                 THEN 'PASS' ELSE 'FAIL' END, N'');
END;

-- C03 Carga de la matriz aprobada (fila por fila)
CREATE TABLE #Actual (IdPerfilRol INT, ScopeLevel VARCHAR(10), PermiteTotalesGlobales BIT, EsActivo BIT, UsuarioCreacion NVARCHAR(100));
IF @tabla = 1
    EXEC (N'INSERT #Actual SELECT IdPerfilRol, ScopeLevel, PermiteTotalesGlobales, EsActivo, UsuarioCreacion
            FROM dbo.IaToolPermiso WHERE ToolName = ''buscar_planilla''');

IF @tabla = 0
    INSERT @R (Chequeo, Resultado, Detalle) VALUES (N'C03 Matriz cargada', 'PENDIENTE', N'Depende de C02 (tabla inexistente)');
ELSE
BEGIN
    INSERT @R (Chequeo, Resultado, Detalle)
    SELECT CONCAT(N'C03 Fila IdPerfilRol=', e.IdPerfilRol),
           CASE WHEN a.IdPerfilRol IS NULL THEN 'FALTA'
                WHEN a.ScopeLevel = e.ScopeLevel AND a.PermiteTotalesGlobales = e.PermiteTotalesGlobales AND a.EsActivo = 1 THEN 'PASS'
                ELSE 'DIFERENTE' END,
           CONCAT(N'esperado ', e.ScopeLevel, N'/globales=', e.PermiteTotalesGlobales,
                  CASE WHEN a.IdPerfilRol IS NULL THEN N'; actual: no existe'
                       ELSE CONCAT(N'; actual ', a.ScopeLevel, N'/globales=', a.PermiteTotalesGlobales, N'/activo=', a.EsActivo) END)
    FROM @Esperada e LEFT JOIN #Actual a ON a.IdPerfilRol = e.IdPerfilRol
    ORDER BY e.IdPerfilRol;

    INSERT @R (Chequeo, Resultado, Detalle)
    SELECT CONCAT(N'C03x Fila adicional IdPerfilRol=', a.IdPerfilRol), 'INFO',
           CONCAT(a.ScopeLevel, N'/globales=', a.PermiteTotalesGlobales, N'/activo=', a.EsActivo, N' (no esta en la matriz inicial; puede ser una edicion legitima)')
    FROM #Actual a WHERE NOT EXISTS (SELECT 1 FROM @Esperada e WHERE e.IdPerfilRol = a.IdPerfilRol);
END;

-- C04 Los pares IdPerfilRol / IdPerfil / IdRol de la matriz existen y estan activos en SegPerfilRol
INSERT @R (Chequeo, Resultado, Detalle)
SELECT CONCAT(N'C04 SegPerfilRol IdPerfilRol=', e.IdPerfilRol),
       CASE WHEN pr.IdPerfilRol IS NOT NULL THEN 'PASS' ELSE 'FAIL' END,
       CONCAT(N'esperado perfil ', e.IdPerfil, N', rol ', e.IdRol)
FROM @Esperada e
LEFT JOIN dbo.SegPerfilRol pr ON pr.IdPerfilRol = e.IdPerfilRol AND pr.IdPerfil = e.IdPerfil AND pr.IdRol = e.IdRol AND pr.EsActivo = 1
ORDER BY e.IdPerfilRol;

-- C05 Menu Chat IA: unico y asignado solo a los perfil-rol esperados (de los 11 de la matriz)
DECLARE @menus INT = (SELECT COUNT(*) FROM dbo.SegMenu WHERE EsActivo = 1 AND Ruta = N'/reportes/administrativo/iachat');
INSERT @R (Chequeo, Resultado, Detalle)
VALUES (N'C05a Menu Chat IA unico en SegMenu', CASE WHEN @menus = 1 THEN 'PASS' ELSE 'FAIL' END, CONCAT(N'filas activas con la ruta: ', @menus));

DECLARE @holders TABLE (IdPerfilRol INT PRIMARY KEY);
INSERT @holders
SELECT DISTINCT e.IdPerfilRol
FROM @Esperada e
JOIN dbo.SegPerfilRolMenu prm ON prm.IdPerfil = e.IdPerfil AND prm.IdRol = e.IdRol AND prm.EsActivo = 1
JOIN dbo.SegMenu m ON m.IdMenu = prm.IdMenu AND m.EsActivo = 1 AND m.Ruta = N'/reportes/administrativo/iachat';
DECLARE @lista NVARCHAR(100) = (SELECT STRING_AGG(CONVERT(NVARCHAR(10), IdPerfilRol), N',') WITHIN GROUP (ORDER BY IdPerfilRol) FROM @holders);
DECLARE @tiene2y34 BIT = CASE WHEN EXISTS (SELECT 1 FROM @holders WHERE IdPerfilRol = 2) AND EXISTS (SELECT 1 FROM @holders WHERE IdPerfilRol = 34) THEN 1 ELSE 0 END;
DECLARE @otros INT = (SELECT COUNT(*) FROM @holders WHERE IdPerfilRol NOT IN (26, 27, 2, 34));
INSERT @R (Chequeo, Resultado, Detalle)
VALUES (N'C05b Perfil-rol de la matriz con menu Chat IA',
        CASE WHEN @otros > 0 THEN 'FAIL'
             WHEN @tiene2y34 = 1 THEN 'PASS'
             ELSE 'PENDIENTE' END,
        CONCAT(N'tienen el menu: [', ISNULL(@lista, N''), N']. Antes del paso de menu se esperan solo 26 y 27 (PENDIENTE); despues, 26,27,2,34 (PASS). ',
               N'Cualquier otro (3,28,29,30,31,32,33) es FAIL: no se aprobaron cambios de menu para ellos'));

-- C06 Cobertura de cuentas (solo conteos)
DECLARE @cuentasConPermiso INT = 0, @cuentasSinPermiso INT = 0;
IF @tabla = 1
BEGIN
    SELECT @cuentasConPermiso = COUNT(DISTINCT upr.IdUsuario)
    FROM dbo.SegUsuarioPerfilRol upr
    JOIN dbo.SegPerfilRol pr ON pr.IdPerfilRol = upr.IdPerfilRol AND pr.EsActivo = 1
    JOIN #Actual a ON a.IdPerfilRol = pr.IdPerfilRol AND a.EsActivo = 1
    WHERE upr.EsActivo = 1;
END;
DECLARE @cuentasActivas INT = (SELECT COUNT(DISTINCT upr.IdUsuario) FROM dbo.SegUsuarioPerfilRol upr
                               JOIN dbo.SegPerfilRol pr ON pr.IdPerfilRol = upr.IdPerfilRol AND pr.EsActivo = 1 WHERE upr.EsActivo = 1);
DECLARE @totalCuentas INT = (SELECT COUNT(*) FROM dbo.Usuario);
INSERT @R (Chequeo, Resultado, Detalle)
VALUES (N'C06 Cuentas con permiso IA efectivo', 'INFO',
        CONCAT(N'cuentas con perfil-rol activo=', @cuentasActivas, N'; con permiso IA activo=', @cuentasConPermiso,
               N'; sin permiso (denegadas)=', @totalCuentas - @cuentasConPermiso, N' de ', @totalCuentas, N' cuentas'));

-- C07 Cuentas con permiso que NO resuelven empleado corporativo (Propio/Equipo las denegaria)
DECLARE @sinEmp INT = 0;
IF @tabla = 1
    SELECT @sinEmp = COUNT(DISTINCT upr.IdUsuario)
    FROM dbo.SegUsuarioPerfilRol upr
    JOIN dbo.SegPerfilRol pr ON pr.IdPerfilRol = upr.IdPerfilRol AND pr.EsActivo = 1
    JOIN #Actual a ON a.IdPerfilRol = pr.IdPerfilRol AND a.EsActivo = 1 AND a.ScopeLevel IN ('PROPIO', 'EQUIPO')
    LEFT JOIN dbo.Usuario u ON u.IdUsuario = upr.IdUsuario
    LEFT JOIN dbo.Empleado e ON e.IdEmpleado = u.IdEmpleado
    LEFT JOIN dbo.EmpleadoCj cj ON cj.IdEmpleado = e.IdEmpleadoCj
    WHERE upr.EsActivo = 1 AND cj.IdEmpleado IS NULL;
INSERT @R (Chequeo, Resultado, Detalle)
VALUES (N'C07 Cuentas PROPIO/EQUIPO sin empleado corporativo', CASE WHEN @tabla = 0 THEN 'PENDIENTE' WHEN @sinEmp = 0 THEN 'PASS' ELSE 'INFO' END,
        CONCAT(N'cuentas: ', @sinEmp, N' (se esperan 0 con la matriz inicial; si hay, quedaran denegadas)'));

-- C08 Auditoria del IA Chat: el SP de registro existe? (en JC_Db el 2026-10-03 NO existia: ninguna auditoria se registro)
DECLARE @spAud INT = (SELECT COUNT(*) FROM sys.parameters WHERE object_id = OBJECT_ID(N'dbo.sp_IaChatAuditoria_Insertar'));
INSERT @R (Chequeo, Resultado, Detalle)
VALUES (N'C08 SP dbo.sp_IaChatAuditoria_Insertar',
        CASE WHEN OBJECT_ID(N'dbo.sp_IaChatAuditoria_Insertar', N'P') IS NULL THEN 'FALTA' WHEN @spAud = 9 THEN 'PASS' ELSE 'FAIL' END,
        CONCAT(N'parametros=', @spAud, N' (esperados 9). Si falta: ejecutar 01_IaChatAuditoria.sql (idempotente) en la copia; sin el, la auditoria (incluidos los accesos denegados) falla en silencio'));

DROP TABLE #Actual;
SELECT Orden, Chequeo, Resultado, Detalle FROM @R ORDER BY Orden;
