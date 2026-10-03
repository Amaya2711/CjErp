-- ============================================================================
-- SOLO LECTURA — Ronda 4: evidencia para validar la matriz de permisos propuesta.
-- No crea ni modifica nada. Sin nombres de personas ni preguntas: solo conteos y nombres/rutas de menu.
-- Devolver TODOS los result sets (subir "Numero maximo de caracteres por columna" a 8192 en SSMS).
-- ============================================================================
SET NOCOUNT ON;

-- [T1] COBERTURA REAL de "responsable O solicitante": filas con al menos un identificador corporativo.
--      "Mapeado" = el identificador corporativo existe (responsable: Empleado.IdEmpleadoCj no nulo;
--      solicitante: IdWeb=1 -> fila en EmpleadoCj; IdWeb<>1 -> Empleado.IdEmpleadoCj no nulo).
--      Una fila SIN ninguno de los dos queda invisible para PROPIO/EQUIPO de cualquier cuenta (solo TOTAL la ve).
SELECT YEAR(a.FecIngresoDate) AS Anio,
       COUNT(*) AS Filas,
       SUM(CASE WHEN er.IdEmpleadoCj IS NOT NULL THEN 1 ELSE 0 END) AS ConResponsableMapeado,
       SUM(CASE WHEN (ISNULL(a.IdWeb,0) = 1 AND scj.IdEmpleado IS NOT NULL)
                  OR (ISNULL(a.IdWeb,0) <> 1 AND se.IdEmpleadoCj IS NOT NULL) THEN 1 ELSE 0 END) AS ConSolicitanteMapeado,
       SUM(CASE WHEN er.IdEmpleadoCj IS NOT NULL
                  OR (ISNULL(a.IdWeb,0) = 1 AND scj.IdEmpleado IS NOT NULL)
                  OR (ISNULL(a.IdWeb,0) <> 1 AND se.IdEmpleadoCj IS NOT NULL) THEN 1 ELSE 0 END) AS ConAlMenosUnoMapeado,
       SUM(CASE WHEN er.IdEmpleadoCj IS NULL
                 AND NOT ((ISNULL(a.IdWeb,0) = 1 AND scj.IdEmpleado IS NOT NULL)
                       OR (ISNULL(a.IdWeb,0) <> 1 AND se.IdEmpleadoCj IS NOT NULL)) THEN 1 ELSE 0 END) AS SinNingunoMapeado
FROM dbo.Planilla a
LEFT JOIN dbo.Empleado er ON er.IdEmpleado = a.IdResponsable
LEFT JOIN dbo.Empleado se ON se.IdEmpleado = a.IdSolicitante AND ISNULL(a.IdWeb,0) <> 1
LEFT JOIN dbo.EmpleadoCj scj ON scj.IdEmpleado = a.IdSolicitante AND ISNULL(a.IdWeb,0) = 1
GROUP BY YEAR(a.FecIngresoDate)
ORDER BY Anio;

-- [T2] Menus activos y visibles asignados a cada perfil-rol de la matriz (evidencia de FUNCION; no prueba responsabilidades).
--      Misma relacion que usa el menu dinamico: SegPerfilRolMenu por (IdPerfil, IdRol).
SELECT pr.IdPerfilRol, p.NombrePerfil, r.NombreRol, m.NombreMenu, m.Ruta
FROM dbo.SegPerfilRol pr
JOIN dbo.SegPerfil p ON p.IdPerfil = pr.IdPerfil
JOIN dbo.SegRol r ON r.IdRol = pr.IdRol
JOIN dbo.SegPerfilRolMenu prm ON prm.IdPerfil = pr.IdPerfil AND prm.IdRol = pr.IdRol AND prm.EsActivo = 1
JOIN dbo.SegMenu m ON m.IdMenu = prm.IdMenu AND m.EsActivo = 1 AND m.EsVisible = 1
WHERE pr.IdPerfilRol IN (2, 30, 32, 3, 31, 26, 27, 29, 33, 28, 34) AND pr.EsActivo = 1 AND m.Ruta IS NOT NULL AND m.Ruta <> N''
ORDER BY pr.IdPerfilRol, m.Ruta;

-- [T3] Para las cuentas de la matriz: subordinados directos VALIDOS (IdResponsableCj = titular, titular > 0,
--      sin el propio titular y con fila en EmpleadoCj). Si todas tienen 0, EQUIPO equivale a PROPIO.
WITH Cuentas AS (
    SELECT upr.IdPerfilRol, upr.IdUsuario, e.IdEmpleadoCj AS Titular
    FROM dbo.SegUsuarioPerfilRol upr
    JOIN dbo.Usuario u ON u.IdUsuario = upr.IdUsuario
    LEFT JOIN dbo.Empleado e ON e.IdEmpleado = u.IdEmpleado
    WHERE upr.EsActivo = 1 AND upr.IdPerfilRol IN (2, 30, 32, 3, 31, 26, 27, 29, 33, 28, 34)
),
Conteo AS (
    SELECT c.IdPerfilRol, c.IdUsuario,
           (SELECT COUNT(*) FROM dbo.EmpleadoCjDetalle d
            JOIN dbo.EmpleadoCj sub ON sub.IdEmpleado = d.IdEmpleadoCj
            WHERE d.IdResponsableCj = c.Titular AND c.Titular > 0 AND d.IdEmpleadoCj <> c.Titular) AS SubordinadosDirectos
    FROM Cuentas c
)
SELECT IdPerfilRol, COUNT(*) AS Cuentas, MIN(SubordinadosDirectos) AS Minimo, MAX(SubordinadosDirectos) AS Maximo,
       SUM(CASE WHEN SubordinadosDirectos = 0 THEN 1 ELSE 0 END) AS CuentasSinSubordinados
FROM Conteo GROUP BY IdPerfilRol ORDER BY IdPerfilRol;

-- [T4] Comprobacion de la auditoria del IA Chat (para distinguir "nadie lo usa" de "no se registra")
SELECT COUNT(*) AS FilasTotales, MIN(FechaCreacion) AS Primera, MAX(FechaCreacion) AS Ultima
FROM dbo.IaChatAuditoria;
