/* Descanso médico: carga/reemplazo del documento anexo (Ruta de SharePoint) de una solicitud ya registrada.
   Actualiza todas las filas (una por día) del rango. No cambia el estado. Idempotente (CREATE OR ALTER).
   PV: ejecutar en la BD real. */
CREATE OR ALTER PROCEDURE dbo.sp_Descanso_ActualizarRuta
(
    @IdEmpleadoCj INT,
    @FechaInicio  DATE,
    @FechaFin     DATE,
    @Ruta         NVARCHAR(500)
)
AS
BEGIN
    SET NOCOUNT ON;

    IF @Ruta IS NULL OR LTRIM(RTRIM(@Ruta)) = ''
        THROW 50113, 'Debe ingresar el documento adjunto.', 1;

    UPDATE dbo.EmpleadoDescanso
    SET Ruta = LTRIM(RTRIM(@Ruta))
    WHERE IdEmpleadoCj = @IdEmpleadoCj
      AND CONVERT(DATE, FechaInicio) = @FechaInicio
      AND CONVERT(DATE, FechaFin) = @FechaFin
      AND IdActivo = 1;

    SELECT @@ROWCOUNT AS Filas;
END;
GO
