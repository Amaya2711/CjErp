/*
  sp_OrdenCompra_RechazarMasivo: al rechazar la OC los recibos (Planilla) que la tenían asociada quedan con
  IdOc = NULL y Fila = NULL (antes: IdOc = '' y Fila = '' -> Fila se convertía en 0).

  Por qué NULL: "recibo sin asociar" se reconoce como (IdOc IS NULL o vacío) y (Fila IS NULL o vacío)
  (ver BuscarRecibosSinAsociarSql en OrdenCompraService). Con Fila = 0 el recibo ya no cumplía la condición y no
  podía volver a asociarse.

  Resto del SP: copia exacta de la definición vigente en BD (pegada el 13/11/2026). Solo cambia el UPDATE de Planilla.
  Antes de ejecutar: comparar con el SP vigente (Script as ALTER). Idempotente (CREATE OR ALTER).
  PV: no ejecutado en BD real.

  --- Reparación de datos YA afectados (ejecutar primero el SELECT y revisar; NO se ejecuta automáticamente) ---
  -- Recibos con IdOc vacío y Fila = 0 (resultado del SP anterior):
  --   SELECT COUNT(*) FROM dbo.Planilla
  --   WHERE LTRIM(RTRIM(CONVERT(varchar(50), IdOc))) = '' AND TRY_CONVERT(int, Fila) = 0;
  -- Si el conteo es razonable y 0 no es una fila válida en esos recibos:
  --   UPDATE dbo.Planilla SET IdOc = NULL, Fila = NULL
  --   WHERE LTRIM(RTRIM(CONVERT(varchar(50), IdOc))) = '' AND TRY_CONVERT(int, Fila) = 0;
*/
CREATE OR ALTER PROCEDURE dbo.sp_OrdenCompra_RechazarMasivo
(
    @IdsOc          VARCHAR(MAX),      -- Ejemplo: '104972,104973,104974'
    @Observacion    NVARCHAR(500),
    @IdRechazador   INT,
    @FechaRechazado DATE = NULL
)
AS
BEGIN
    SET NOCOUNT ON;

    BEGIN TRY
        BEGIN TRAN;

        IF @FechaRechazado IS NULL
            SET @FechaRechazado = CAST(GETDATE() AS DATE);

        DECLARE @Oc TABLE
        (
            IdOc INT PRIMARY KEY
        );

        INSERT INTO @Oc (IdOc)
        SELECT DISTINCT TRY_CAST(value AS INT)
        FROM STRING_SPLIT(@IdsOc, ',')
        WHERE TRY_CAST(value AS INT) IS NOT NULL;

        IF NOT EXISTS (SELECT 1 FROM @Oc)
        BEGIN
            ROLLBACK;
            SELECT 0 AS Ok, 'No se recibieron órdenes válidas para rechazar.' AS Mensaje;
            RETURN;
        END;

        UPDATE c
        SET
            c.IdEstado = 6,
            c.Observacion = @Observacion,
            c.IdRechazador = @IdRechazador,
            c.FechaRechazado = @FechaRechazado
        FROM CabOrdenCompra c
        INNER JOIN @Oc x ON x.IdOc = c.IdOc;

        UPDATE d
        SET d.IdEstado = 6
        FROM DetOrdenCompra d
        INNER JOIN @Oc x ON x.IdOc = d.IdOc;

        -- Desasociar los recibos: NULL (no '' ni 0).
        UPDATE p
        SET
            p.IdOc = NULL,
            p.Fila = NULL
        FROM Planilla p
        INNER JOIN @Oc x
            ON TRY_CAST(p.IdOc AS INT) = x.IdOc;

        COMMIT;

        SELECT
            1 AS Ok,
            'Órdenes de compra rechazadas correctamente.' AS Mensaje,
            COUNT(*) AS CantidadOc
        FROM @Oc;

    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0
            ROLLBACK;

        SELECT
            0 AS Ok,
            ERROR_MESSAGE() AS Mensaje,
            ERROR_LINE() AS LineaError;
    END CATCH
END;
