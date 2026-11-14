USE [JC_Db]
GO
-- Copia del SP vigente en BD (13/11/2026) con los correos aliasados (CorreoEmpleado / CorreoResponsable).
-- Ya aplicado en BD (13/11/2026): correoempleado / correoresponsable.
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE OR ALTER PROCEDURE [dbo].[sp_EmpleadoPendiente_Listar]
(
    @IdPendiente INT = NULL,
    @IdEmpleado INT = NULL,
    @IdResponsable INT = NULL,
    @IdEstado INT = NULL,
    @FechaInicio DATE = NULL,
    @FechaFin DATE = NULL
)
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        ep.IdPendiente,
        ep.IdEmpleado,
        emp.NombreEmpleado,
        ep.FechaInicio,
        ep.FechaEstimacionTermino,
        ep.FechaRealTermino,
        ep.IdEstado,
        est.ValorIni AS Estado,
        ep.Comentario,
        ep.Observacion,
        ep.IdResponsable,
        resp.NombreEmpleado AS Responsable,
        ep.Ruta,
        ep.IdActivo,
        ep.UsuarioCreacion,
        ep.FechaCreacion,
        ep.UsuarioModificacion,
        ep.FechaModificacion,
        emp.Correo  AS CorreoEmpleado,
        resp.Correo AS CorreoResponsable
    FROM dbo.EmpleadoPendiente ep
    LEFT JOIN dbo.EmpleadoCj emp  ON emp.IdEmpleado  = ep.IdEmpleado
    LEFT JOIN dbo.EmpleadoCj resp ON resp.IdEmpleado = ep.IdResponsable
    LEFT JOIN dbo.Constante est
        ON est.Campo = 'ESTADO_PENDIENTE'
       AND est.Correlativo = ep.IdEstado
    WHERE ep.IdActivo = 1
      AND (@IdPendiente IS NULL OR ep.IdPendiente = @IdPendiente)
      AND (@IdEmpleado IS NULL OR ep.IdEmpleado = @IdEmpleado)
      AND (@IdResponsable IS NULL OR ep.IdResponsable = @IdResponsable)
      AND (@IdEstado IS NULL OR ep.IdEstado = @IdEstado)
      AND (@FechaInicio IS NULL OR ep.FechaInicio >= @FechaInicio)
      AND (@FechaFin IS NULL OR ep.FechaInicio <= @FechaFin)
    ORDER BY ep.FechaInicio DESC, ep.IdPendiente DESC;
END;
GO
