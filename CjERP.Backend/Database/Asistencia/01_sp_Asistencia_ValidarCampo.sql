USE [JC_Db]
GO

SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE OR ALTER PROCEDURE [dbo].[sp_Asistencia_ValidarCampo]
(
    @IdEmpleado INT = NULL,
    @FechaInicio DATE = NULL,
    @FechaFin DATE = NULL
)
AS
BEGIN
    SET NOCOUNT ON;

    BEGIN TRY
        SELECT
            b.nombreempleado,
            c.ValorIni AS estado,
            a.hora,
            a.latitud,
            a.longitud,
            a.horasalida,
            a.latitudsalida,
            a.longitudsalida,
            a.comentario,
            a.estadomarcacion,
            a.estadosalida,
            a.idempleado,
            a.fechaasistencia,
            a.imagen,
            a.imagensalida,
            e.nombreempleado AS responsable,
            a.observacion,
            c1.ValorIni AS Empresa,
            d1.ValorIni AS Cliente,
            e1.ValorIni AS Area,
            f1.ValorIni AS Ubicacion
        FROM Asistencia a
        LEFT JOIN EmpleadoCj b ON a.IdEmpleado = b.IdEmpleado
        LEFT JOIN Constante c ON c.Campo = 'estado_asistencia' AND a.IdEstado = c.Correlativo
        LEFT JOIN EmpleadoCjDetalle d ON a.IdEmpleado = d.IdEmpleadoCj
        LEFT JOIN EmpleadoCj e ON d.IdResponsableCj = e.IdEmpleado
        LEFT JOIN dbo.Constante c1 ON c1.Campo = 'EMPRESA_CJ' AND d.IdEmpresaCj = c1.Correlativo
        LEFT JOIN dbo.Constante d1 ON d1.Campo = 'CLIENTE_CJ' AND d.IdClienteCj = d1.Correlativo
        LEFT JOIN dbo.Constante e1 ON e1.Campo = 'AREA_CJ' AND d.IdAreaCj = e1.Correlativo
        LEFT JOIN dbo.Constante f1 ON f1.Campo = 'UBICACION_CJ' AND d.IdUbicacionCj = f1.Correlativo
        WHERE (a.EstadoMarcacion = 9 OR a.EstadoSalida = 9)
          AND (@IdEmpleado IS NULL OR a.IdEmpleado = @IdEmpleado)
          AND (@FechaInicio IS NULL OR CONVERT(DATE, a.FechaAsistencia) >= @FechaInicio)
          AND (@FechaFin IS NULL OR CONVERT(DATE, a.FechaAsistencia) <= @FechaFin)
        ORDER BY a.FechaAsistencia DESC, b.NombreEmpleado;
    END TRY
    BEGIN CATCH
        DECLARE @MensajeError NVARCHAR(4000) = ERROR_MESSAGE();
        RAISERROR(@MensajeError, 16, 1);
    END CATCH
END
GO
