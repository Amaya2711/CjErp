/* ================================================================
   sp_Planilla_ActualizarEstado: al RECHAZAR (@CodEstado = 3) graba
   Planilla.IdRechazador (= @IdAprobador) y Planilla.FechaRechazar.
   El resto del comportamiento es el del SP vigente en JC_Db (14/10/2026).
   - FechaRechazar usa el mismo formato texto MM/DD/YYYY (estilo 101) que
     FechaAprobador / FechaReAprobador.
   - Los demas estados no tocan IdRechazador/FechaRechazar.
   PRE-CHECK (PV, deben existir; ajustar tipo de FechaRechazar si no es texto):
     SELECT c.name, t.name AS tipo, c.max_length
       FROM sys.columns c JOIN sys.types t ON t.user_type_id = c.user_type_id
      WHERE c.object_id = OBJECT_ID('dbo.Planilla')
        AND c.name IN ('IdRechazador','FechaRechazar');
   Idempotente. Ejecutar en JC_Db.
   ================================================================ */
USE JC_Db;
GO
CREATE OR ALTER PROCEDURE [dbo].[sp_Planilla_ActualizarEstado]
(
    @Correlativo INT,
    @IdSite VARCHAR(50),
    @CodEstado INT,
    @Observacion NVARCHAR(MAX) = NULL,
    @IdAprobador INT
)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        BEGIN TRANSACTION;

        DECLARE @IdEst INT = @CodEstado;
        DECLARE @Total DECIMAL(18,2);
        DECLARE @Moneda VARCHAR(50);
        DECLARE @FechaAprobacion VARCHAR(10);

        SET @FechaAprobacion = CONVERT(VARCHAR(10), GETDATE(), 101); -- MM/DD/YYYY

        IF @CodEstado IN (2,3) AND ISNULL(LTRIM(RTRIM(@Observacion)), '') = ''
        BEGIN
            RAISERROR('Debe ingresar detalle indicando el motivo del rechazo u observacion.', 16, 1);
            ROLLBACK TRANSACTION;
            RETURN;
        END;

        SELECT
            @Total = ISNULL(a.Total, 0),
            @Moneda = UPPER(ISNULL(k.ValorIni, ''))
        FROM dbo.Planilla a
        LEFT JOIN dbo.Constante k
            ON k.Sociedad = 'PE01'
           AND k.Programa = 'PLANTILLA'
           AND k.Campo = 'TIPO_MONEDA'
           AND a.TipoMoneda = k.Correlativo
        WHERE a.Correlativo = @Correlativo
          AND a.IdSite = @IdSite;

        IF @Total IS NULL
        BEGIN
            RAISERROR('No se encontró la orden de pago indicada.', 16, 1);
            ROLLBACK TRANSACTION;
            RETURN;
        END;

        IF @CodEstado = 1
        BEGIN
            IF (@Moneda = 'SOLES' AND @Total >= 2000)
               OR (@Moneda = 'DOLARES' AND @Total >= 530)
            BEGIN
                SET @IdEst = 6; -- Segunda aprobación
            END;
        END;

        IF @CodEstado = 6
        BEGIN
            SET @IdEst = 1;

            UPDATE dbo.Planilla
            SET Estado = @IdEst,
                Observacion = @Observacion,
                FechaReAprobador = @FechaAprobacion,
                IdReAprobador = @IdAprobador
            WHERE Correlativo = @Correlativo
              AND IdSite = @IdSite;
        END
        ELSE IF @CodEstado = 3
        BEGIN
            -- Rechazo: ademas del estado y la observacion, queda quien y cuando rechazo.
            UPDATE dbo.Planilla
            SET Estado = @IdEst,
                Observacion = @Observacion,
                FechaAprobador = @FechaAprobacion,
                IdRechazador = @IdAprobador,
                FechaRechazar = @FechaAprobacion
            WHERE Correlativo = @Correlativo
              AND IdSite = @IdSite;
        END
        ELSE
        BEGIN
            UPDATE dbo.Planilla
            SET Estado = @IdEst,
                Observacion = @Observacion,
                FechaAprobador = @FechaAprobacion
            WHERE Correlativo = @Correlativo
              AND IdSite = @IdSite;
        END;

        IF @@ROWCOUNT = 0
        BEGIN
            RAISERROR('No se actualizó ningún registro.', 16, 1);
            ROLLBACK TRANSACTION;
            RETURN;
        END;

        COMMIT TRANSACTION;

        SELECT
            @Correlativo AS Correlativo,
            @IdSite AS IdSite,
            @CodEstado AS EstadoSolicitado,
            @IdEst AS EstadoAplicado,
            CASE
                WHEN @CodEstado = 1 AND @IdEst = 6
                    THEN 'Por el valor del monto solicitado debe pasar por 2da aprobacion.'
                WHEN @CodEstado = 6
                    THEN 'Documento reaprobado correctamente.'
                ELSE 'Estado actualizado correctamente.'
            END AS Mensaje;

    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0
            ROLLBACK TRANSACTION;

        DECLARE @ErrorMessage NVARCHAR(4000) = ERROR_MESSAGE();
        DECLARE @ErrorSeverity INT = ERROR_SEVERITY();

        RAISERROR(@ErrorMessage, @ErrorSeverity, 1);
    END CATCH;
END
GO
