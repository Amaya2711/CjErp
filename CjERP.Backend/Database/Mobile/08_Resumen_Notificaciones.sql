SET NOCOUNT ON;
GO

CREATE OR ALTER PROCEDURE dbo.sp_Comunicacion_ResumenPorEmpleado
  @IdEmpleadoCj int
AS
BEGIN
  SET NOCOUNT ON;

  SELECT
    COUNT(*) AS Total,
    COALESCE(SUM(CASE WHEN d.Leido = 0 THEN 1 ELSE 0 END), 0) AS NoLeidas,
    COALESCE(SUM(CASE WHEN c.Tipo = 2 THEN 1 ELSE 0 END), 0) AS Alertas,
    COALESCE(SUM(CASE WHEN c.Tipo = 0 THEN 1 ELSE 0 END), 0) AS Comunicados,
    COALESCE(SUM(CASE
      WHEN c.TipoPersistencia = 1 AND d.Leido = 0 THEN 1
      WHEN c.TipoPersistencia IN (2, 3) AND d.Confirmado = 0 THEN 1
      ELSE 0 END), 0) AS Pendientes,
    COALESCE(SUM(CASE WHEN c.TipoPersistencia = 3 AND d.Confirmado = 0 THEN 1 ELSE 0 END), 0) AS Obligatorias
  FROM dbo.Comunicacion c
  INNER JOIN dbo.ComunicacionDestinatario d ON d.IdComunicacion = c.IdComunicacion
  WHERE d.IdEmpleadoCj = @IdEmpleadoCj
    AND d.Estado = 1
    AND c.Activo = 1
    AND c.Estado = 1;
END
GO
