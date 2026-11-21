SET NOCOUNT ON;
GO

-- Limpieza de la carga BBVA erronea (20 filas grabadas con el backend anterior: titulos y saldos
-- del archivo, con IdBanco = 1 (BCP) pero CodigoBanco = 'BBVA').
-- Criterio: CodigoBanco = 'BBVA' AND IdBanco <> 3 AND sin conciliar.
-- Las filas BBVA correctas llevaran IdBanco = 3, por eso no se tocan.

-- PASO 1: revisar que lo que se va a borrar es basura (ejecutar solo este SELECT primero).
SELECT IdMovimientoBanco, IdBanco, CodigoBanco, Cuenta, Fecha, Monto, NroOperacion,
       DescripcionOperacion, ArchivoOrigen, FechaImportacion, EsConciliado
FROM dbo.MovimientosConciliacion
WHERE CodigoBanco = 'BBVA' AND IdBanco <> 3
ORDER BY IdMovimientoBanco;
GO

-- PASO 2: borrado protegido. Solo confirma si afecta exactamente @Esperadas filas; si no, revierte.
DECLARE @Esperadas INT = 20;
DECLARE @Afectadas INT;

BEGIN TRY
    BEGIN TRANSACTION;

    -- Respaldo de lo borrado (tabla permanente por si hay que restaurar).
    -- El UNION ALL evita que SELECT INTO herede la propiedad IDENTITY (error 8101 al insertar el id).
    IF OBJECT_ID('dbo.MovimientosConciliacion_RespaldoBBVA', 'U') IS NULL
        SELECT * INTO dbo.MovimientosConciliacion_RespaldoBBVA
        FROM (
            SELECT * FROM dbo.MovimientosConciliacion WHERE 1 = 0
            UNION ALL
            SELECT * FROM dbo.MovimientosConciliacion WHERE 1 = 0
        ) AS plantilla;

    INSERT INTO dbo.MovimientosConciliacion_RespaldoBBVA
    SELECT * FROM dbo.MovimientosConciliacion
    WHERE CodigoBanco = 'BBVA' AND IdBanco <> 3 AND ISNULL(EsConciliado, 0) = 0;

    DELETE FROM dbo.MovimientosConciliacion
    WHERE CodigoBanco = 'BBVA' AND IdBanco <> 3 AND ISNULL(EsConciliado, 0) = 0;

    SET @Afectadas = @@ROWCOUNT;

    IF @Afectadas <> @Esperadas
    BEGIN
        ROLLBACK TRANSACTION;
        PRINT CONCAT('REVERTIDO: se esperaban ', @Esperadas, ' filas y el criterio afecta ', @Afectadas, '. No se borro nada.');
    END
    ELSE
    BEGIN
        COMMIT TRANSACTION;
        PRINT CONCAT('OK: ', @Afectadas, ' filas borradas (respaldo en dbo.MovimientosConciliacion_RespaldoBBVA).');
    END;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO
