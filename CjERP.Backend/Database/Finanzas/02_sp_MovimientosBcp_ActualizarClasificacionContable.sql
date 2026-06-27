CREATE OR ALTER PROCEDURE dbo.sp_MovimientosBcp_ActualizarClasificacionContable
    @IdMovimientoBanco INT,
    @IdAreaFlujo INT,
    @IdReferencia INT,
    @IdCuentaContable INT,
    @IdReglaContable INT,
    @ObservacionConciliacion VARCHAR(500) = NULL,
    @UsuarioConciliacion VARCHAR(100)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        BEGIN TRANSACTION;

        IF NOT EXISTS (
            SELECT 1
            FROM dbo.MovimientosBcp WITH (UPDLOCK, HOLDLOCK)
            WHERE IdMovimientoBanco = @IdMovimientoBanco
              AND IdActivo = 1
        )
        BEGIN
            THROW 50001, 'El movimiento bancario no existe o no se encuentra activo.', 1;
        END;

        IF NOT EXISTS (
            SELECT 1
            FROM dbo.ConciliacionReglaContable
            WHERE IdReglaContable = @IdReglaContable
              AND IdActivo = 1
        )
        BEGIN
            THROW 50002, 'La regla contable no existe o no se encuentra activa.', 1;
        END;

        IF NOT EXISTS (
            SELECT 1
            FROM dbo.ConciliacionReglaContable
            WHERE IdReglaContable = @IdReglaContable
              AND IdAreaFlujo = @IdAreaFlujo
              AND IdReferencia = @IdReferencia
              AND IdCuentaContable = @IdCuentaContable
              AND IdActivo = 1
        )
        BEGIN
            THROW 50003, 'La regla contable no corresponde a la combinacion Area Flujo + Referencia + Cuenta Contable.', 1;
        END;

        UPDATE dbo.MovimientosBcp
        SET IdAreaFlujo = @IdAreaFlujo,
            IdReferencia = @IdReferencia,
            IdCuentaContable = @IdCuentaContable,
            IdReglaContable = @IdReglaContable,
            EsConciliado = 1,
            EstadoConciliacion = 'CONCILIADO',
            FechaConciliacion = GETDATE(),
            UsuarioConciliacion = LTRIM(RTRIM(ISNULL(@UsuarioConciliacion, ''))),
            ObservacionConciliacion = NULLIF(LTRIM(RTRIM(@ObservacionConciliacion)), '')
        WHERE IdMovimientoBanco = @IdMovimientoBanco
          AND IdActivo = 1;

        COMMIT TRANSACTION;

        SELECT
            CAST(1 AS BIT) AS Success,
            'Clasificacion contable actualizada correctamente.' AS Message,
            @IdMovimientoBanco AS IdMovimientoBanco;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0
        BEGIN
            ROLLBACK TRANSACTION;
        END;

        DECLARE @ErrorMessage NVARCHAR(4000) = ERROR_MESSAGE();
        DECLARE @ErrorNumber INT = ERROR_NUMBER();
        DECLARE @ErrorState INT = ERROR_STATE();

        RAISERROR(@ErrorMessage, 16, CASE WHEN @ErrorState BETWEEN 1 AND 255 THEN @ErrorState ELSE 1 END);
        RETURN @ErrorNumber;
    END CATCH;
END;
