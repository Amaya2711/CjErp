USE [JC_Db]
GO

/*
    MontoPlanilla debe representar los pagos (Planilla.Subtotal) de la OT
    solicitada. Se conserva Estado = 4 y se agrega el filtro por Planilla.Ot.
    No modifica MontoPagadoOc ni el cálculo del consumo de la OC.
*/
SET NOCOUNT ON;
GO

DECLARE @definition NVARCHAR(MAX) = OBJECT_DEFINITION(OBJECT_ID(N'dbo.sp_Importar_ResumenOT'));

IF @definition IS NULL
    THROW 50000, 'No se encontró dbo.sp_Importar_ResumenOT.', 1;

SET @definition = REPLACE(@definition, CHAR(13), N'');

IF CHARINDEX(N'LTRIM(RTRIM(pla.Ot)) = @Ot', @definition) > 0
BEGIN
    PRINT 'El filtro de OT para MontoPlanilla ya se encuentra aplicado.';
    RETURN;
END;

DECLARE @estadoPosicion INT = CHARINDEX(
    N'AND pla.Estado',
    @definition COLLATE Latin1_General_100_CI_AI
);

IF @estadoPosicion = 0
    THROW 50001, 'No se encontró la condición pla.Estado en sp_Importar_ResumenOT.', 1;

DECLARE @finLineaEstado INT = CHARINDEX(CHAR(10), @definition, @estadoPosicion);

IF @finLineaEstado = 0
    SET @finLineaEstado = LEN(@definition) + 1;

DECLARE @filtroOt NVARCHAR(MAX) = N'

                 /* Mismos pagos de la OT solicitada: se suma Subtotal. */
                 AND
                 (
                        @Ot IS NULL
                     OR LTRIM(RTRIM(ISNULL(pla.Ot, ''''))) = @Ot
                 )';

SET @filtroOt = REPLACE(@filtroOt, CHAR(13), N'');
SET @definition = STUFF(@definition, @finLineaEstado, 0, @filtroOt);

-- OBJECT_DEFINITION puede conservar CREATE PROCEDURE de versiones antiguas.
SET @definition = REPLACE(@definition, N'CREATE OR ALTER PROCEDURE', N'ALTER PROCEDURE');
SET @definition = REPLACE(@definition, N'CREATE PROCEDURE', N'ALTER PROCEDURE');

EXEC sys.sp_executesql @definition;
GO
