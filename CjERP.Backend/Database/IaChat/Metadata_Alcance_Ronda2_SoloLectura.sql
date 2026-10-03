-- ============================================================================
-- IA Chat — metadata de alcance, RONDA 2 (completa lo que la ronda 1 no cubrió)
-- SOLO LECTURA. Sin datos personales: solo ids, conteos y definiciones.
-- Ejecutar en la BD del ERP (JC_Db) y devolver TODOS los result sets.
-- ============================================================================
SET NOCOUNT ON;

-- [R1] Columnas de SegPerfilRol (mapa perfil-rol; la ronda 1 no lo incluyó)
SELECT c.column_id AS Orden, c.name AS Columna, ty.name AS Tipo, c.is_nullable AS PermiteNull
FROM sys.columns c JOIN sys.types ty ON ty.user_type_id = c.user_type_id
WHERE c.object_id = OBJECT_ID(N'dbo.SegPerfilRol') ORDER BY c.column_id;

-- [R2] Perfil/rol con cantidad de cuentas activas (nombres de perfil/rol, no de personas)
IF COL_LENGTH(N'dbo.SegPerfilRol', N'IdPerfilRol') IS NOT NULL
   AND COL_LENGTH(N'dbo.SegPerfilRol', N'IdPerfil') IS NOT NULL
   AND COL_LENGTH(N'dbo.SegPerfilRol', N'IdRol') IS NOT NULL
    EXEC sp_executesql N'
    SELECT pr.IdPerfilRol, pr.IdPerfil, p.NombrePerfil, pr.IdRol, r.NombreRol,
           COUNT(DISTINCT CASE WHEN upr.EsActivo = 1 THEN upr.IdUsuario END) AS CuentasActivas
    FROM dbo.SegPerfilRol pr
    LEFT JOIN dbo.SegPerfil p ON p.IdPerfil = pr.IdPerfil
    LEFT JOIN dbo.SegRol r ON r.IdRol = pr.IdRol
    LEFT JOIN dbo.SegUsuarioPerfilRol upr ON upr.IdPerfilRol = pr.IdPerfilRol
    GROUP BY pr.IdPerfilRol, pr.IdPerfil, p.NombrePerfil, pr.IdRol, r.NombreRol
    ORDER BY pr.IdPerfil, pr.IdRol;';

-- [R3] Cuentas con más de un perfil-rol activo (el login actual devuelve una fila por cada uno)
SELECT COUNT(*) AS CuentasConVariosPerfilRol
FROM (SELECT IdUsuario FROM dbo.SegUsuarioPerfilRol WHERE EsActivo = 1
      GROUP BY IdUsuario HAVING COUNT(*) > 1) x;

-- [R4] Vínculo cuenta -> empleado (Usuario.IdEmpleado -> Empleado -> EmpleadoCj)
SELECT COUNT(*) AS TotalCuentas,
       SUM(CASE WHEN u.IdEmpleado IS NULL THEN 1 ELSE 0 END) AS SinIdEmpleado,
       SUM(CASE WHEN u.IdEmpleado IS NOT NULL AND e.IdEmpleado IS NULL THEN 1 ELSE 0 END) AS IdEmpleadoSinFilaEmpleado,
       SUM(CASE WHEN e.IdEmpleado IS NOT NULL AND e.IdEmpleadoCj IS NULL THEN 1 ELSE 0 END) AS EmpleadoSinIdEmpleadoCj,
       SUM(CASE WHEN e.IdEmpleadoCj IS NOT NULL AND cj.IdEmpleado IS NULL THEN 1 ELSE 0 END) AS IdEmpleadoCjSinFilaEmpleadoCj
FROM dbo.Usuario u
LEFT JOIN dbo.Empleado e ON e.IdEmpleado = u.IdEmpleado
LEFT JOIN dbo.EmpleadoCj cj ON cj.IdEmpleado = e.IdEmpleadoCj;

-- [R5] Empleados corporativos con más de una cuenta, y con más de un Empleado legacy
SELECT 'EmpleadoCj con >1 cuenta' AS Chequeo, COUNT(*) AS Cantidad
FROM (SELECT e.IdEmpleadoCj FROM dbo.Usuario u JOIN dbo.Empleado e ON e.IdEmpleado = u.IdEmpleado
      WHERE e.IdEmpleadoCj IS NOT NULL GROUP BY e.IdEmpleadoCj HAVING COUNT(*) > 1) x
UNION ALL
SELECT 'EmpleadoCj con >1 fila en Empleado (legacy)', COUNT(*)
FROM (SELECT IdEmpleadoCj FROM dbo.Empleado WHERE IdEmpleadoCj IS NOT NULL
      GROUP BY IdEmpleadoCj HAVING COUNT(*) > 1) y;

-- [R6] Jerarquía: integridad referencial real de EmpleadoCjDetalle
SELECT COUNT(*) AS Filas,
       SUM(CASE WHEN d.IdEmpleadoCj IS NOT NULL AND ce.IdEmpleado IS NULL THEN 1 ELSE 0 END) AS IdEmpleadoCjHuerfano,
       SUM(CASE WHEN d.IdResponsableCj IS NOT NULL AND cr.IdEmpleado IS NULL THEN 1 ELSE 0 END) AS IdResponsableCjHuerfano,
       SUM(CASE WHEN d.IdResponsableCj = d.IdEmpleadoCj THEN 1 ELSE 0 END) AS ResponsableEsElMismo
FROM dbo.EmpleadoCjDetalle d
LEFT JOIN dbo.EmpleadoCj ce ON ce.IdEmpleado = d.IdEmpleadoCj
LEFT JOIN dbo.EmpleadoCj cr ON cr.IdEmpleado = d.IdResponsableCj;

-- [R7] Jerarquía: clasificación de cada empleado por lo que ocurre al subir por IdResponsableCj.
--      RAIZ_AUTORREFERENCIADA : IdResponsableCj = IdEmpleadoCj (cima legítima, esperada: 1)
--      LLEGA_A_RAIZ           : cadena normal; se informa su profundidad
--      EN_CICLO               : vuelve a pasar por sí mismo sin llegar a una raíz
--      CADENA_SIN_SALIDA      : no llega a una raíz ni vuelve a sí mismo (huérfano o cadena rota/muy larga)
;WITH Subida AS (
    SELECT d.IdEmpleadoCj AS Origen, d.IdResponsableCj AS Actual, 1 AS Nivel
    FROM dbo.EmpleadoCjDetalle d
    WHERE d.IdResponsableCj IS NOT NULL AND d.IdResponsableCj <> d.IdEmpleadoCj
    UNION ALL
    SELECT s.Origen, d.IdResponsableCj, s.Nivel + 1
    FROM Subida s
    JOIN dbo.EmpleadoCjDetalle d ON d.IdEmpleadoCj = s.Actual
    WHERE s.Nivel < 60
      AND d.IdResponsableCj IS NOT NULL
      AND d.IdResponsableCj <> d.IdEmpleadoCj
      AND s.Actual <> s.Origen
),
Roots AS (
    SELECT IdEmpleadoCj FROM dbo.EmpleadoCjDetalle WHERE IdResponsableCj = IdEmpleadoCj
),
Estado AS (
    SELECT d.IdEmpleadoCj,
           CASE
               WHEN d.IdResponsableCj = d.IdEmpleadoCj THEN 'RAIZ_AUTORREFERENCIADA'
               WHEN EXISTS (SELECT 1 FROM Subida s WHERE s.Origen = d.IdEmpleadoCj AND s.Actual = d.IdEmpleadoCj) THEN 'EN_CICLO'
               WHEN EXISTS (SELECT 1 FROM Subida s JOIN Roots r ON r.IdEmpleadoCj = s.Actual WHERE s.Origen = d.IdEmpleadoCj) THEN 'LLEGA_A_RAIZ'
               WHEN d.IdResponsableCj IS NOT NULL AND EXISTS (SELECT 1 FROM Roots r WHERE r.IdEmpleadoCj = d.IdResponsableCj) THEN 'LLEGA_A_RAIZ'
               ELSE 'CADENA_SIN_SALIDA'
           END AS Clase,
           (SELECT MIN(s.Nivel) FROM Subida s JOIN Roots r ON r.IdEmpleadoCj = s.Actual WHERE s.Origen = d.IdEmpleadoCj) AS ProfundidadHastaRaiz
    FROM dbo.EmpleadoCjDetalle d
)
SELECT Clase, COUNT(*) AS Empleados, MAX(ProfundidadHastaRaiz) AS ProfundidadMaxima
FROM Estado GROUP BY Clase ORDER BY Clase
OPTION (MAXRECURSION 100);

-- [R8] Jerarquía: ids (sin nombres) de los empleados cuya clase NO es LLEGA_A_RAIZ (para corregirlos en origen)
;WITH Subida AS (
    SELECT d.IdEmpleadoCj AS Origen, d.IdResponsableCj AS Actual, 1 AS Nivel
    FROM dbo.EmpleadoCjDetalle d
    WHERE d.IdResponsableCj IS NOT NULL AND d.IdResponsableCj <> d.IdEmpleadoCj
    UNION ALL
    SELECT s.Origen, d.IdResponsableCj, s.Nivel + 1
    FROM Subida s
    JOIN dbo.EmpleadoCjDetalle d ON d.IdEmpleadoCj = s.Actual
    WHERE s.Nivel < 60 AND d.IdResponsableCj IS NOT NULL AND d.IdResponsableCj <> d.IdEmpleadoCj AND s.Actual <> s.Origen
),
Roots AS (SELECT IdEmpleadoCj FROM dbo.EmpleadoCjDetalle WHERE IdResponsableCj = IdEmpleadoCj)
SELECT d.IdEmpleadoCj, d.IdResponsableCj,
       CASE WHEN EXISTS (SELECT 1 FROM Subida s WHERE s.Origen = d.IdEmpleadoCj AND s.Actual = d.IdEmpleadoCj) THEN 'EN_CICLO'
            ELSE 'CADENA_SIN_SALIDA' END AS Clase
FROM dbo.EmpleadoCjDetalle d
WHERE d.IdResponsableCj <> d.IdEmpleadoCj
  AND NOT EXISTS (SELECT 1 FROM Subida s JOIN Roots r ON r.IdEmpleadoCj = s.Actual WHERE s.Origen = d.IdEmpleadoCj)
  AND NOT EXISTS (SELECT 1 FROM Roots r WHERE r.IdEmpleadoCj = d.IdResponsableCj)
OPTION (MAXRECURSION 100);

-- [R9] Planilla: cobertura de los identificadores que usaría el alcance
SELECT COUNT(*) AS TotalPlanilla,
       SUM(CASE WHEN a.IdResponsable IS NULL THEN 1 ELSE 0 END) AS SinIdResponsable,
       SUM(CASE WHEN a.IdResponsable IS NOT NULL AND er.IdEmpleado IS NULL THEN 1 ELSE 0 END) AS IdResponsableSinEmpleado,
       SUM(CASE WHEN er.IdEmpleado IS NOT NULL AND er.IdEmpleadoCj IS NULL THEN 1 ELSE 0 END) AS ResponsableSinIdEmpleadoCj,
       SUM(CASE WHEN a.IdSolicitante IS NULL THEN 1 ELSE 0 END) AS SinIdSolicitante,
       SUM(CASE WHEN ISNULL(a.IdWeb,0) = 1 THEN 1 ELSE 0 END) AS FilasIdWeb1,
       SUM(CASE WHEN ISNULL(a.IdWeb,0) = 1 AND a.IdSolicitante IS NOT NULL AND scj.IdEmpleado IS NULL THEN 1 ELSE 0 END) AS SolicitanteWebSinEmpleadoCj,
       SUM(CASE WHEN ISNULL(a.IdWeb,0) <> 1 AND a.IdSolicitante IS NOT NULL AND se.IdEmpleado IS NULL THEN 1 ELSE 0 END) AS SolicitanteLegacySinEmpleado,
       SUM(CASE WHEN ISNULL(a.IdWeb,0) <> 1 AND se.IdEmpleado IS NOT NULL AND se.IdEmpleadoCj IS NULL THEN 1 ELSE 0 END) AS SolicitanteLegacySinIdEmpleadoCj
FROM dbo.Planilla a
LEFT JOIN dbo.Empleado er ON er.IdEmpleado = a.IdResponsable
LEFT JOIN dbo.Empleado se ON se.IdEmpleado = a.IdSolicitante AND ISNULL(a.IdWeb,0) <> 1
LEFT JOIN dbo.EmpleadoCj scj ON scj.IdEmpleado = a.IdSolicitante AND ISNULL(a.IdWeb,0) = 1;

-- [R10] Definición vigente de sp_ValidarUsuario (confirma cómo se derivan CodEmp/IdEmpleadoCj/IdPerfil/IdRol)
SELECT o.modify_date AS UltimaModificacion, OBJECT_DEFINITION(o.object_id) AS Definicion
FROM sys.objects o WHERE o.object_id = OBJECT_ID(N'dbo.sp_ValidarUsuario', N'P');
