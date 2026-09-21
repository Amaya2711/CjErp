USE [JC_Db]
GO

/*
    Corrección puntual para sp_Importar_ResumenOT.

    - MontoPagadoOc se mantiene calculado solo con Planilla.Estado = 4.
    - SubtotalCabOrdenCompra (Total OC en Pagos V1) se obtiene directamente
      desde DetOrdenCompra + CabOrdenCompra por @IdOc y @Fila; no depende del
      estado de la Planilla seleccionada.
    - El script modifica el procedimiento instalado; no lo recrea.
*/
SET NOCOUNT ON;
GO

DECLARE @definition NVARCHAR(MAX) = OBJECT_DEFINITION(OBJECT_ID(N'dbo.sp_Importar_ResumenOT'));

IF @definition IS NULL
    THROW 50000, 'No se encontró dbo.sp_Importar_ResumenOT.', 1;

-- Normaliza saltos de línea para que las sustituciones no dependan del editor.
SET @definition = REPLACE(@definition, CHAR(13), N'');

IF CHARINDEX(N') cabeceraOc', @definition) > 0
BEGIN
    PRINT 'La corrección de Total OC ya se encuentra aplicada.';
    RETURN;
END;

DECLARE @anchor NVARCHAR(MAX) = N'        ) rel

        OUTER APPLY
        (
            SELECT SUM(ISNULL(p.Subtotal, 0)) AS MontoPagadoOc';

DECLARE @replacement NVARCHAR(MAX) = N'        ) rel

        /* Total de la cabecera OC independiente del estado de Planilla. */
        OUTER APPLY
        (
            SELECT TOP (1)
                det.IdOc AS IdOcOrdenCompra,
                det.Fila AS FilaOrdenCompra,
                cab.Subtotal AS SubtotalCabOrdenCompra,
                cab.Igv AS IgvCabOrdenCompra,
                cab.Total AS TotalCabOrdenCompra
            FROM dbo.DetOrdenCompra det
            INNER JOIN dbo.CabOrdenCompra cab
                ON cab.IdOc = det.IdOc
            WHERE @IdOc IS NOT NULL
              AND @Fila IS NOT NULL
              AND det.IdOc = @IdOc
              AND det.Fila = @Fila
        ) cabeceraOc

        OUTER APPLY
        (
            SELECT SUM(ISNULL(p.Subtotal, 0)) AS MontoPagadoOc';

SET @anchor = REPLACE(@anchor, CHAR(13), N'');
SET @replacement = REPLACE(@replacement, CHAR(13), N'');

IF CHARINDEX(@anchor, @definition) = 0
    THROW 50001, 'No se encontró el bloque esperado de rel/pagosOc. Revise la versión actual del store antes de ejecutar.', 1;

SET @definition = REPLACE(@definition, @anchor, @replacement);

SET @definition = REPLACE(
    @definition,
    N'                    rel.SubtotalCabOrdenCompra,',
    N'                    cabeceraOc.SubtotalCabOrdenCompra,
                    rel.SubtotalCabOrdenCompra,'
);
SET @definition = REPLACE(
    @definition,
    N'                    rel.IgvCabOrdenCompra,',
    N'                    cabeceraOc.IgvCabOrdenCompra,
                    rel.IgvCabOrdenCompra,'
);
SET @definition = REPLACE(
    @definition,
    N'                    rel.TotalCabOrdenCompra,',
    N'                    cabeceraOc.TotalCabOrdenCompra,
                    rel.TotalCabOrdenCompra,'
);
-- Aun sin una Planilla pagada, la cabecera encontrada debe permitir que el
-- resumen de la OC/Fila sea devuelto por el procedimiento.
SET @definition = REPLACE(
    @definition,
    N'OR rel.IdOcOrdenCompra = @IdOc',
    N'OR COALESCE(rel.IdOcOrdenCompra, cabeceraOc.IdOcOrdenCompra) = @IdOc'
);
SET @definition = REPLACE(
    @definition,
    N'OR rel.FilaOrdenCompra = @Fila',
    N'OR COALESCE(rel.FilaOrdenCompra, cabeceraOc.FilaOrdenCompra) = @Fila'
);

EXEC sys.sp_executesql @definition;
GO
