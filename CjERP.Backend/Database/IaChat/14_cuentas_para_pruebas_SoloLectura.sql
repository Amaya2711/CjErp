-- ============================================================================
-- SOLO LECTURA — Ayuda para ELEGIR cuentas de prueba del IA Chat. No modifica nada.
-- Muestra, por cuenta con perfil-rol activo, el permiso IA que recibira (segun dbo.IaToolPermiso), si resuelve
-- empleado corporativo y cuantos subordinados directos validos tiene. Uselo SOLO en su maquina para decidir
-- con que cuentas probar; NO comparta ni pegue contrasenas (este script no las lee) y no es necesario enviarme
-- los nombres de usuario: basta indicarme el IdPerfilRol y el caso (PROPIO/EQUIPO/TOTAL) de la cuenta elegida.
-- ============================================================================
SET NOCOUNT ON;

SELECT upr.IdUsuario,
       upr.IdPerfilRol,
       p.NombrePerfil,
       r.NombreRol,
       t.ScopeLevel,
       t.PermiteTotalesGlobales,
       cj.IdEmpleado AS IdEmpleadoCj,
       CASE WHEN cj.IdEmpleado IS NULL THEN 0 ELSE 1 END AS ResuelveEmpleado,
       (SELECT COUNT(*) FROM dbo.EmpleadoCjDetalle d
        JOIN dbo.EmpleadoCj sub ON sub.IdEmpleado = d.IdEmpleadoCj
        WHERE d.IdResponsableCj = cj.IdEmpleado AND cj.IdEmpleado > 0 AND d.IdEmpleadoCj <> cj.IdEmpleado) AS SubordinadosDirectos
FROM dbo.SegUsuarioPerfilRol upr
JOIN dbo.SegPerfilRol pr ON pr.IdPerfilRol = upr.IdPerfilRol AND pr.EsActivo = 1
JOIN dbo.SegPerfil p ON p.IdPerfil = pr.IdPerfil
JOIN dbo.SegRol r ON r.IdRol = pr.IdRol
LEFT JOIN dbo.IaToolPermiso t ON t.IdPerfilRol = pr.IdPerfilRol AND t.ToolName = 'buscar_planilla' AND t.EsActivo = 1
LEFT JOIN dbo.Usuario u ON u.IdUsuario = upr.IdUsuario
LEFT JOIN dbo.Empleado e ON e.IdEmpleado = u.IdEmpleado
LEFT JOIN dbo.EmpleadoCj cj ON cj.IdEmpleado = e.IdEmpleadoCj
WHERE upr.EsActivo = 1
ORDER BY t.ScopeLevel, upr.IdPerfilRol, upr.IdUsuario;

-- Cuentas con el mismo empleado corporativo (para el caso "dos cuentas del mismo empleado")
SELECT e.IdEmpleadoCj, COUNT(*) AS Cuentas
FROM dbo.Usuario u JOIN dbo.Empleado e ON e.IdEmpleado = u.IdEmpleado
WHERE e.IdEmpleadoCj IS NOT NULL
GROUP BY e.IdEmpleadoCj HAVING COUNT(*) > 1
ORDER BY Cuentas DESC, e.IdEmpleadoCj;

-- Cuentas SIN perfil-rol activo (deben quedar denegadas): solo el conteo
SELECT COUNT(*) AS CuentasSinPerfilRolActivo
FROM dbo.Usuario u
WHERE NOT EXISTS (SELECT 1 FROM dbo.SegUsuarioPerfilRol upr
                  JOIN dbo.SegPerfilRol pr ON pr.IdPerfilRol = upr.IdPerfilRol AND pr.EsActivo = 1
                  WHERE upr.IdUsuario = u.IdUsuario AND upr.EsActivo = 1);
