USE [JC_Db]
GO

/*
  Actualización puntual de dbo.sp_Importar_ResumenOT.
  Conserva la definición actual y únicamente:
  1) mantiene Fila = 0 como valor válido;
  2) agrega MontoPagadoOc; y
  3) lo calcula por Planilla.IdOc + Planilla.Fila, Estado = 4.
*/
DECLARE @Definicion NVARCHAR(MAX) = OBJECT_DEFINITION(OBJECT_ID(N'dbo.sp_Importar_ResumenOT'));

IF @Definicion IS NULL
    THROW 50001, 'No existe dbo.sp_Importar_ResumenOT.', 1;

-- OBJECT_DEFINITION puede devolver CREATE PROCEDURE. Al aplicarla sobre un
-- procedimiento existente debe ejecutarse como ALTER PROCEDURE.
SET @Definicion = REPLACE(@Definicion, N'CREATE PROCEDURE', N'ALTER PROCEDURE');
SET @Definicion = REPLACE(@Definicion, N'CREATE PROC', N'ALTER PROC');

IF CHARINDEX(N'MontoPagadoOc', @Definicion) > 0
    THROW 50002, 'El procedimiento ya contiene MontoPagadoOc; no se aplicaron cambios.', 1;

DECLARE @MarcaFila NVARCHAR(MAX) =
    N'        IF @Fila = 0' + CHAR(13) + CHAR(10) +
    N'            SET @Fila = NULL;';

IF CHARINDEX(@MarcaFila, @Definicion) = 0
    THROW 50003, 'No se encontró el bloque de normalización de @Fila.', 1;

SET @Definicion = REPLACE(
    @Definicion,
    @MarcaFila,
    N'        -- @Fila = 0 es una fila válida; no se normaliza a NULL.'
);

DECLARE @MarcaResultado NVARCHAR(MAX) =
    N'            COALESCE(' + CHAR(13) + CHAR(10) +
    N'                rel.CantidadRegistrosPlanilla,';

IF CHARINDEX(@MarcaResultado, @Definicion) = 0
    THROW 50004, 'No se encontró el bloque de resultado de Planilla.', 1;

SET @Definicion = REPLACE(
    @Definicion,
    @MarcaResultado,
    N'            CAST(COALESCE(pagosOc.MontoPagadoOc, 0) AS DECIMAL(18,2)) AS MontoPagadoOc,' + CHAR(13) + CHAR(10) + CHAR(13) + CHAR(10) +
    @MarcaResultado
);

DECLARE @MarcaApply NVARCHAR(MAX) = N'        ) rel' + CHAR(13) + CHAR(10) + CHAR(13) + CHAR(10) + CHAR(13) + CHAR(10) + N'        /* ============================================================';

IF CHARINDEX(@MarcaApply, @Definicion) = 0
    THROW 50005, 'No se encontró el cierre del APPLY rel.', 1;

SET @Definicion = REPLACE(
    @Definicion,
    @MarcaApply,
    N'        ) rel' + CHAR(13) + CHAR(10) + CHAR(13) + CHAR(10) +
    N'        OUTER APPLY' + CHAR(13) + CHAR(10) +
    N'        (' + CHAR(13) + CHAR(10) +
    N'            SELECT SUM(ISNULL(p.Subtotal, 0)) AS MontoPagadoOc' + CHAR(13) + CHAR(10) +
    N'            FROM dbo.Planilla p' + CHAR(13) + CHAR(10) +
    N'            WHERE @IdOc IS NOT NULL' + CHAR(13) + CHAR(10) +
    N'              AND @Fila IS NOT NULL' + CHAR(13) + CHAR(10) +
    N'              AND LTRIM(RTRIM(CONVERT(VARCHAR(50), p.IdOc))) = CONVERT(VARCHAR(50), @IdOc)' + CHAR(13) + CHAR(10) +
    N'              AND p.Fila = @Fila' + CHAR(13) + CHAR(10) +
    N'              AND p.Estado = 4' + CHAR(13) + CHAR(10) +
    N'        ) pagosOc' + CHAR(13) + CHAR(10) + CHAR(13) + CHAR(10) + CHAR(13) + CHAR(10) +
    N'        /* ============================================================'
);

EXEC sys.sp_executesql @Definicion;
GO
