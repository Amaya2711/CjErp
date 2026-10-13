-- sp_EmpleadoOtros_ListarVacaciones: agrega el filtro opcional @IdEmpleadoCj (dueño de la solicitud).
-- Sin el parámetro (NULL) el resultado es el mismo de antes. Ya aplicado en JC_Db el 2026-10-13; se versiona aquí.
-- Uso: el rol ESTANDAR (7) consulta solo sus vacaciones (VacacionesController.Listar fuerza el valor desde el JWT).
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE OR ALTER PROCEDURE [dbo].[sp_EmpleadoOtros_ListarVacaciones]
(
    @FechaInicial   DATE = NULL,
    @FechaFinal     DATE = NULL,
    @IdEstado       INT  = NULL,
    @NombreEmpleado VARCHAR(200) = NULL,
    @IdEmpleadoCj   INT  = NULL      -- NUEVO: filtra por dueño de la solicitud (NULL = todos)
)
AS
BEGIN
    SET NOCOUNT ON;

    SELECT DISTINCT
        a.IdEmpleadoCj,
        a.IdEstado,

        CASE
            WHEN a.IdActivo = 0 THEN 'INACTIVO'
            ELSE 'ACTIVO'
        END AS IdActivo,

        b.NombreEmpleado,

        CASE
            --WHEN a.IdEstado = 99 THEN 'VACACIONES'
            WHEN a.IdEstado = 0 THEN 'RECHAZADO'
            ELSE c.ValorIni
        END AS Estado,

        a.FechaInicio,
        a.FechaFin,
        a.Usuario,
        a.FechaCreacion,

        d.IdResponsableCj,
        d.IdSegundoVacaciones,
        d.IdTerceroVacaciones,

        e.NombreEmpleado AS PrimerValidador,
        f.NombreEmpleado AS SegundoValidador,
        g.NombreEmpleado AS TercerValidador,

        e.NombreEmpleado AS Responsable,

        CASE
            WHEN a.IdEstado = 97 THEN CAST('20000101' AS DATE)
            WHEN a.IdEstado = 98 THEN a.FechaPre
            WHEN a.IdEstado = 99 THEN a.FechaPrimera
        END AS FechaAprob,

        sv.SaldoVacaciones

    FROM EmpleadoOtros a

    LEFT JOIN EmpleadoCj b
        ON a.IdEmpleadoCj = b.IdEmpleado

    LEFT JOIN Constante c
        ON c.Campo = 'ESTADO_ASISTENCIA'
       AND c.Correlativo = a.IdEstado

    LEFT JOIN EmpleadoCjDetalle d
        ON a.IdEmpleadoCj = d.IdEmpleadoCj

    LEFT JOIN EmpleadoCj e
        ON d.IdResponsableCj = e.IdEmpleado

    LEFT JOIN EmpleadoCj f
        ON d.IdSegundoVacaciones = f.IdEmpleado

    LEFT JOIN EmpleadoCj g
        ON d.IdTerceroVacaciones = g.IdEmpleado

    LEFT JOIN Empleado h
        ON a.IdPre = h.IdEmpleado

    LEFT JOIN EmpleadoCj i
        ON h.IdEmpleadoCj = i.IdEmpleado

    LEFT JOIN Empleado j
        ON a.IdPrimera = j.IdEmpleado

    LEFT JOIN EmpleadoCj k
        ON j.IdEmpleadoCj = k.IdEmpleado

    LEFT JOIN
    (
        SELECT
            emp.IdEmpleado,
            x.DiasVacacionesCalculados - ISNULL(vt.DiasVacacionesTomadas, 0) AS SaldoVacaciones

        FROM EmpleadoCj emp

        LEFT JOIN EmpleadoCjDetalle det
            ON emp.IdEmpleado = det.IdEmpleadoCj

        LEFT JOIN Constante cons
            ON cons.Campo = 'EMPRESA_CJ'
           AND det.IdEmpresaCj = cons.Correlativo

        LEFT JOIN
        (
            SELECT
                eo.IdEmpleadoCj,
                COUNT(*) AS DiasVacacionesTomadas
            FROM EmpleadoOtros eo
            WHERE eo.IdEstado = 4
            GROUP BY eo.IdEmpleadoCj
        ) vt
            ON emp.IdEmpleado = vt.IdEmpleadoCj

        CROSS APPLY
        (
            SELECT emp.FechaVacaciones AS FechaBaseVacaciones
        ) f

        CROSS APPLY
        (
            SELECT
                CASE
                    WHEN emp.FechaVacaciones IS NULL THEN 0
                    WHEN f.FechaBaseVacaciones > CAST(GETDATE() AS DATE) THEN 0
                    ELSE DATEDIFF(DAY, f.FechaBaseVacaciones, CAST(GETDATE() AS DATE)) + 1
                END AS DiasTranscurridos
        ) d

        CROSS APPLY
        (
            SELECT
                CASE
                    WHEN emp.FechaVacaciones IS NULL THEN 0
                    WHEN TRY_CONVERT(DECIMAL(10,2), cons.ValorFin) IS NULL THEN 0
                    ELSE ROUND(
                            (d.DiasTranscurridos / 365.0)
                            * TRY_CONVERT(DECIMAL(10,2), cons.ValorFin),
                            2
                         ) + ISNULL(emp.DiasVacMype, 0)
                END AS DiasVacacionesCalculados
        ) x

        WHERE emp.IdCargo = 50
          AND emp.IdActivo = 1
    ) sv
        ON a.IdEmpleadoCj = sv.IdEmpleado

    WHERE
        (
            @FechaInicial IS NULL
            OR @FechaFinal IS NULL
            OR (
                a.FechaInicio <= @FechaFinal
                AND a.FechaFin >= @FechaInicial
            )
        )
        AND (
            @IdEstado IS NULL
            OR a.IdEstado = @IdEstado
        )
        AND (
            @NombreEmpleado IS NULL
            OR LTRIM(RTRIM(@NombreEmpleado)) = ''
            OR b.NombreEmpleado LIKE '%' + LTRIM(RTRIM(@NombreEmpleado)) + '%'
        )
        AND (
            @IdEmpleadoCj IS NULL                 -- NUEVO
            OR a.IdEmpleadoCj = @IdEmpleadoCj     -- NUEVO
        )

    ORDER BY
        a.FechaInicio DESC,
        b.NombreEmpleado;

END;
GO
