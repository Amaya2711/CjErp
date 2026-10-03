-- ============================================================================
-- SOLO LECTURA — Ronda 3 de metadata para decidir permisos del IA Chat.
-- No crea ni modifica nada. Sin preguntas de usuarios ni nombres de personas: solo conteos por perfil/rol.
-- Devolver TODOS los result sets, sin recortar (subir "Numero maximo de caracteres por columna" a 8192
-- en SSMS o usar cuadricula).
-- ============================================================================
SET NOCOUNT ON;

-- [S1] Definicion COMPLETA vigente de dbo.sp_ValidarUsuario, una fila por linea
--      (la ronda 2 la trunco por ancho de columna; la version del repo difiere de la desplegada).
DECLARE @Def NVARCHAR(MAX) = OBJECT_DEFINITION(OBJECT_ID(N'dbo.sp_ValidarUsuario', N'P'));
DECLARE @L TABLE (NumeroLinea INT, Texto NVARCHAR(MAX));
IF @Def IS NOT NULL
BEGIN
    DECLARE @Pos INT = 1, @Fin INT, @N INT = 1;
    WHILE @Pos <= DATALENGTH(@Def) / 2
    BEGIN
        SET @Fin = CHARINDEX(NCHAR(10), @Def, @Pos);
        IF @Fin = 0 SET @Fin = DATALENGTH(@Def) / 2 + 1;
        INSERT @L VALUES (@N, REPLACE(SUBSTRING(@Def, @Pos, @Fin - @Pos), NCHAR(13), N''));
        SET @Pos = @Fin + 1; SET @N += 1;
    END;
END;
SELECT NumeroLinea, Texto AS DefinicionSpValidarUsuario FROM @L ORDER BY NumeroLinea;

-- [S2] Quien usa HOY el IA Chat (ultimos 90 dias), agrupado por perfil/rol activo de la cuenta.
--      PerfilRol NULL = cuentas del IA Chat SIN perfil-rol activo (quedarian denegadas por defecto).
IF OBJECT_ID(N'dbo.IaChatAuditoria', N'U') IS NOT NULL
BEGIN
    SELECT pr.IdPerfil, p.NombrePerfil, pr.IdRol, r.NombreRol,
           COUNT(DISTINCT a.IdUsuario) AS CuentasQueUsaronIaChat,
           COUNT(*) AS Consultas
    FROM dbo.IaChatAuditoria a
    LEFT JOIN dbo.SegUsuarioPerfilRol upr ON upr.IdUsuario = a.IdUsuario AND upr.EsActivo = 1
    LEFT JOIN dbo.SegPerfilRol pr ON pr.IdPerfilRol = upr.IdPerfilRol
    LEFT JOIN dbo.SegPerfil p ON p.IdPerfil = pr.IdPerfil
    LEFT JOIN dbo.SegRol r ON r.IdRol = pr.IdRol
    WHERE a.Herramienta = 'buscar_planilla' AND a.FechaCreacion >= DATEADD(DAY, -90, SYSDATETIME())
    GROUP BY pr.IdPerfil, p.NombrePerfil, pr.IdRol, r.NombreRol
    ORDER BY pr.IdPerfil, pr.IdRol;

    -- [S3] De esas cuentas, cuantas NO resuelven un EmpleadoCj (Propio/Equipo las denegaria)
    SELECT COUNT(DISTINCT a.IdUsuario) AS CuentasIaChatSinEmpleadoCj
    FROM dbo.IaChatAuditoria a
    LEFT JOIN dbo.Usuario u ON u.IdUsuario = a.IdUsuario
    LEFT JOIN dbo.Empleado e ON e.IdEmpleado = u.IdEmpleado
    LEFT JOIN dbo.EmpleadoCj cj ON cj.IdEmpleado = e.IdEmpleadoCj
    WHERE a.Herramienta = 'buscar_planilla' AND a.FechaCreacion >= DATEADD(DAY, -90, SYSDATETIME())
      AND cj.IdEmpleado IS NULL;
END;

-- [S4] Perfil/rol activos: cuantas de sus cuentas resuelven un EmpleadoCj (todas las cuentas, no solo IA Chat)
SELECT pr.IdPerfil, p.NombrePerfil, pr.IdRol, r.NombreRol,
       COUNT(DISTINCT upr.IdUsuario) AS CuentasActivas,
       COUNT(DISTINCT CASE WHEN cj.IdEmpleado IS NOT NULL THEN upr.IdUsuario END) AS CuentasConEmpleadoCj
FROM dbo.SegUsuarioPerfilRol upr
JOIN dbo.SegPerfilRol pr ON pr.IdPerfilRol = upr.IdPerfilRol
LEFT JOIN dbo.SegPerfil p ON p.IdPerfil = pr.IdPerfil
LEFT JOIN dbo.SegRol r ON r.IdRol = pr.IdRol
LEFT JOIN dbo.Usuario u ON u.IdUsuario = upr.IdUsuario
LEFT JOIN dbo.Empleado e ON e.IdEmpleado = u.IdEmpleado
LEFT JOIN dbo.EmpleadoCj cj ON cj.IdEmpleado = e.IdEmpleadoCj
WHERE upr.EsActivo = 1
GROUP BY pr.IdPerfil, p.NombrePerfil, pr.IdRol, r.NombreRol
ORDER BY pr.IdPerfil, pr.IdRol;
