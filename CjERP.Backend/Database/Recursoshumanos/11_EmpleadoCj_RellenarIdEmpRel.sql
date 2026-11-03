/*
  Rellena EmpleadoCj.IdEmpRel (= Empleado.IdEmpleado legacy) en empleados activos que lo tienen NULL o 0.
  Sin ese enlace sp_EmpleadoCj_Ficha no resuelve el usuario (EmpleadoCj.IdEmpRel -> Empleado -> Usuario.IdEmpleado).

  Alcance seguro: SOLO toca IdEmpRel NULL/0. No modifica los que ya apuntan a un Empleado
  (aunque existan otras filas Empleado con el mismo IdEmpleadoCj: requieren revision manual).
  Elige el legacy cuando hay exactamente un Empleado con IdEmpleadoCj = EmpleadoCj.IdEmpleado,
  o, si hay varios, cuando exactamente uno de ellos tiene Usuario.
  Idempotente. PV: revisar el preview (seccion 1) antes de ejecutar la seccion 2.
*/

/* ---------- 1) PREVIEW (solo lectura) ---------- */
;WITH Cand AS
(
    SELECT
        c.IdEmpleado AS IdEmpleadoCj,
        c.NombreEmpleado,
        e.IdEmpleado AS IdEmpleadoLegacy,
        CASE WHEN EXISTS (SELECT 1 FROM dbo.Usuario u WHERE u.IdEmpleado = e.IdEmpleado) THEN 1 ELSE 0 END AS TieneUsuario
    FROM dbo.EmpleadoCj c
    JOIN dbo.Empleado e ON e.IdEmpleadoCj = c.IdEmpleado
    WHERE c.IdEstado = 1
      AND ISNULL(c.IdEmpRel, 0) = 0
),
Resumen AS
(
    SELECT IdEmpleadoCj, COUNT(*) AS Legacy, SUM(TieneUsuario) AS ConUsuario
    FROM Cand
    GROUP BY IdEmpleadoCj
)
SELECT
    ca.IdEmpleadoCj, ca.NombreEmpleado, ca.IdEmpleadoLegacy, ca.TieneUsuario,
    CASE
        WHEN r.Legacy = 1 THEN 'AUTO (unico)'
        WHEN r.ConUsuario = 1 AND ca.TieneUsuario = 1 THEN 'AUTO (unico con usuario)'
        ELSE 'REVISAR MANUAL'
    END AS Accion
FROM Cand ca
JOIN Resumen r ON r.IdEmpleadoCj = ca.IdEmpleadoCj
ORDER BY ca.IdEmpleadoCj, ca.IdEmpleadoLegacy;
GO

/* ---------- 2) ACTUALIZACION ---------- */
;WITH Cand AS
(
    SELECT
        c.IdEmpleado AS IdEmpleadoCj,
        e.IdEmpleado AS IdEmpleadoLegacy,
        CASE WHEN EXISTS (SELECT 1 FROM dbo.Usuario u WHERE u.IdEmpleado = e.IdEmpleado) THEN 1 ELSE 0 END AS TieneUsuario
    FROM dbo.EmpleadoCj c
    JOIN dbo.Empleado e ON e.IdEmpleadoCj = c.IdEmpleado
    WHERE c.IdEstado = 1
      AND ISNULL(c.IdEmpRel, 0) = 0
),
Resumen AS
(
    SELECT IdEmpleadoCj, COUNT(*) AS Legacy, SUM(TieneUsuario) AS ConUsuario
    FROM Cand
    GROUP BY IdEmpleadoCj
),
Elegido AS
(
    SELECT ca.IdEmpleadoCj, ca.IdEmpleadoLegacy
    FROM Cand ca
    JOIN Resumen r ON r.IdEmpleadoCj = ca.IdEmpleadoCj
    WHERE r.Legacy = 1
       OR (r.ConUsuario = 1 AND ca.TieneUsuario = 1)
)
UPDATE c
SET c.IdEmpRel = el.IdEmpleadoLegacy
FROM dbo.EmpleadoCj c
JOIN Elegido el ON el.IdEmpleadoCj = c.IdEmpleado
WHERE ISNULL(c.IdEmpRel, 0) = 0;

SELECT @@ROWCOUNT AS EmpleadosActualizados;
GO
