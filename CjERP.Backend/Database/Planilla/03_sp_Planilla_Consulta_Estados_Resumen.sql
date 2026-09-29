/*
  Resumen liviano para los KPI de /finanzas/tesoreria/pagos_v1.
  Devuelve únicamente el conteo por estado; no realiza los joins ni las
  agregaciones de detalle de sp_Planilla_Consulta_Estados.
*/
CREATE OR ALTER PROCEDURE dbo.sp_Planilla_Consulta_Estados_Resumen
(
    @FechaInicio DATE = NULL,
    @FechaFin DATE = NULL
)
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        p.Estado,
        COUNT_BIG(1) AS Cantidad
    FROM dbo.Planilla p
    WHERE p.Estado IN (0, 2, 6, 10)
      AND (
          @FechaInicio IS NULL
          OR COALESCE(
              TRY_CONVERT(DATE, p.FecIngreso, 101),
              TRY_CONVERT(DATE, p.FecIngreso, 103),
              TRY_CONVERT(DATE, p.FecIngreso, 23),
              TRY_CONVERT(DATE, p.FecIngreso, 120),
              TRY_CONVERT(DATE, p.FecIngreso, 126)
          ) >= @FechaInicio
      )
      AND (
          @FechaFin IS NULL
          OR COALESCE(
              TRY_CONVERT(DATE, p.FecIngreso, 101),
              TRY_CONVERT(DATE, p.FecIngreso, 103),
              TRY_CONVERT(DATE, p.FecIngreso, 23),
              TRY_CONVERT(DATE, p.FecIngreso, 120),
              TRY_CONVERT(DATE, p.FecIngreso, 126)
          ) < DATEADD(DAY, 1, @FechaFin)
      )
    GROUP BY p.Estado;
END;
GO
