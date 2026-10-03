-- ============================================================================
-- SOLO LECTURA. (1) Definicion COMPLETA vigente de dbo.sp_IA_Planilla_Buscar, una fila por linea, para
-- compararla localmente contra la version anterior (03) y la de alcance (02). (2) Una llamada con los
-- MISMOS parametros que envia hoy el backend (ruta antigua), para ver si el SP la acepta o con que error.
-- No crea ni modifica objetos ni datos. Devolver TODOS los result sets, sin recortar columnas.
-- En SSMS: Herramientas > Opciones > Resultados de la consulta > Texto > "Numero maximo de caracteres
-- por columna" = 8192, o usar "Resultados en cuadricula" y copiar las celdas.
-- ============================================================================
SET NOCOUNT ON;

DECLARE @obj INT = OBJECT_ID(N'dbo.sp_IA_Planilla_Buscar', N'P');

-- [1] Metadatos del objeto
SELECT @@SERVERNAME AS Servidor, DB_NAME() AS BaseDatos, o.create_date AS Creado, o.modify_date AS UltimaModificacion
FROM sys.objects o WHERE o.object_id = @obj;

-- [2] Definicion completa, una fila por linea (con marca de lineas que mencionan el alcance)
DECLARE @Def NVARCHAR(MAX) = OBJECT_DEFINITION(@obj);
DECLARE @L TABLE (NumeroLinea INT, Texto NVARCHAR(MAX));
IF @Def IS NOT NULL
BEGIN
    DECLARE @Pos INT = 1, @Fin INT, @N INT = 1;
    WHILE @Pos <= DATALENGTH(@Def) / 2
    BEGIN
        SET @Fin = CHARINDEX(NCHAR(10), @Def, @Pos);
        IF @Fin = 0 SET @Fin = DATALENGTH(@Def) / 2 + 1;
        INSERT @L VALUES (@N, REPLACE(SUBSTRING(@Def, @Pos, @Fin - @Pos), NCHAR(13), N''));
        SET @Pos = @Fin + 1; SET @N += 1;
    END;
END;
SELECT NumeroLinea,
       CASE WHEN Texto LIKE N'%AlcanceNivel%' OR Texto LIKE N'%50010%' THEN N'>>' ELSE N'' END AS Marca,
       Texto AS DefinicionSP
FROM @L ORDER BY NumeroLinea;

-- [3] Llamada IDENTICA a la del backend actual (ruta antigua): mismos parametros, pagina de 1 fila.
--     Es una lectura (SELECT dentro del SP). Resultado esperado con la version anterior: 1 fila (o 0 si no hay
--     datos con esos filtros) y la fila "OK". Con la version de alcance: error 50010.
BEGIN TRY
    EXEC dbo.sp_IA_Planilla_Buscar
        @TextoBusqueda = NULL, @Estados = 'PAGADO',
        @FechaInicio = '20260101', @FechaFin = '20261231',
        @IdSite = NULL, @Site = NULL, @CorreSite = NULL,
        @Cliente = NULL, @Proyecto = NULL, @Responsable = NULL, @Solicitante = NULL, @Ot = NULL,
        @CoincidirTodas = 0, @IncluirEstado99 = 1,
        @Pagina = 1, @TamanoPagina = 1, @TipoCambio = 3.8;
    SELECT 'OK' AS ResultadoLlamadaHeredada, CAST(NULL AS INT) AS NumeroError, CAST(NULL AS NVARCHAR(4000)) AS MensajeError;
END TRY
BEGIN CATCH
    SELECT 'ERROR' AS ResultadoLlamadaHeredada, ERROR_NUMBER() AS NumeroError, LEFT(ERROR_MESSAGE(), 4000) AS MensajeError;
END CATCH;
