-- SQL MONITOR: sp_Monitor_CapturarTopSql cada 15 minutos y sin guardar consultas repetidas.
-- MOTIVO (medido el 2026-11-02): Monitor_TopSql pesa ~930 MB (137.106 filas, ~6 KB de texto cada una) y alimento el crecimiento del log de JC_Db.
--   * Hay DOS monitores escribiendo a la vez: produccion (host contenedor) y un PC local (DESKTOP-GK6IOAM, "CJ SQL Monitor"), a ~94 s y ~236 s entre capturas.
--   * 48,3 % de las filas eran consultas SIN ejecuciones nuevas desde la captura anterior; solo hay 408 consultas distintas.
-- QUE CAMBIA (se conserva TODO lo demas de la definicion vigente, incluido TOP (20), el orden y el filtro de sp_Monitor_%):
--   1) Fila nueva en Monitor_Config: TOPSQL_INTERVALO_MIN = 15 (idempotente). Para cambiar la frecuencia basta un UPDATE de esa fila.
--   2) Limite de frecuencia dentro del procedimiento: no captura si la ultima captura es mas reciente que (intervalo - 1) minutos.
--      Vale para CUALQUIER instancia que lo llame; no hace falta tocar ni publicar el servicio C# (SqlMonitorWorker sigue llamando cada 5 min).
--   3) @Desde = ultima captura; AND qs.last_execution_time > @Desde -> solo consultas ejecutadas despues de esa captura.
-- EFECTO: de ~5.700-11.000 filas/dia a <= 1.920 (96 capturas x 20), y menos aun por el filtro de repetidos.
--   La pantalla Top SQL (sp_Monitor_TopSql_Listar: ultimas N horas, por CpuTotalMs) no cambia columnas ni contratos; con 15 min entre capturas hay menos puntos historicos.
--   Las alertas (sp_Monitor_GenerarAlertas) y WaitStats siguen cada 5 minutos: este script solo afecta a Top SQL.
-- SEGURIDAD: CREATE OR ALTER sobre un procedimiento del ERP (Monitor), comparado con la definicion vigente (ver 02_ROLLBACK_...). REVERSION: ejecutar ese archivo.
-- Se puede ejecutar en una ventana normal de SSMS conectada a JC_Db (no usa SQLCMD). Ejecutar de una vez, completo.
IF DB_NAME() <> N'JC_Db' THROW 51701, 'Guarda de base: la base activa no es JC_Db. No se ejecuto nada.', 1;
GO
-- Fila de configuracion (idempotente)
IF NOT EXISTS (SELECT 1 FROM dbo.Monitor_Config WHERE Codigo = 'TOPSQL_INTERVALO_MIN')
    INSERT dbo.Monitor_Config (Codigo, Descripcion, ValorNumero) VALUES ('TOPSQL_INTERVALO_MIN', 'Minutos entre capturas de Top SQL', 15);
GO
/* ================================================================
   12. TOP SQL HIST�RICO
   Recomendaci�n: cada 5 minutos
   ================================================================ */

CREATE OR ALTER PROCEDURE dbo.sp_Monitor_CapturarTopSql
AS
BEGIN
    SET NOCOUNT ON;

    -- Limite de frecuencia: lee Monitor_Config 'TOPSQL_INTERVALO_MIN' (si no existe, 5 = comportamiento anterior). Si la ultima captura guardada es mas
    -- reciente que (intervalo - 1) minutos no hace nada. Vale para CUALQUIER instancia que llame (hoy hay dos monitores escribiendo a la vez).
    DECLARE @IntervaloMin INT = ISNULL((SELECT TOP (1) CONVERT(INT, ValorNumero) FROM dbo.Monitor_Config WHERE Codigo = 'TOPSQL_INTERVALO_MIN' AND IdActivo = 1), 5);
    DECLARE @Ultima DATETIME2(7) = (SELECT MAX(FechaHora) FROM dbo.Monitor_TopSql);
    IF @Ultima IS NOT NULL AND DATEDIFF(SECOND, @Ultima, SYSDATETIME()) < (@IntervaloMin - 1) * 60
        RETURN;

    -- Solo se guardan consultas ejecutadas DESPUES de la captura anterior (antes ~48 % de las filas eran repetidos).
    DECLARE @Desde DATETIME2(7) = ISNULL(@Ultima, '19000101');



    INSERT INTO dbo.Monitor_TopSql
    (
        DatabaseName,
        QueryHash,

        ExecutionCount,

        CpuTotalMs,
        CpuPromedioMs,

        TiempoTotalMs,
        TiempoPromedioMs,

        LogicalReadsTotal,
        LogicalReadsPromedio,

        LogicalWritesTotal,

        RowsTotal,

        LastExecutionTime,

        SqlText
    )

    SELECT TOP (20)

        DB_NAME(txt.dbid),

        qs.query_hash,

        qs.execution_count,


        CONVERT
        (
            BIGINT,
            qs.total_worker_time / 1000
        ),


        CONVERT
        (
            BIGINT,
            (
                qs.total_worker_time /
                NULLIF(qs.execution_count,0)
            ) / 1000
        ),


        CONVERT
        (
            BIGINT,
            qs.total_elapsed_time / 1000
        ),


        CONVERT
        (
            BIGINT,
            (
                qs.total_elapsed_time /
                NULLIF(qs.execution_count,0)
            ) / 1000
        ),


        qs.total_logical_reads,


        CONVERT
        (
            BIGINT,
            qs.total_logical_reads /
            NULLIF(qs.execution_count,0)
        ),


        qs.total_logical_writes,

        qs.total_rows,

        qs.last_execution_time,

        LEFT(txt.text,4000)


    FROM sys.dm_exec_query_stats qs

    OUTER APPLY sys.dm_exec_sql_text(qs.sql_handle) txt

    WHERE

        DB_NAME(txt.dbid) = DB_NAME()

        AND qs.last_execution_time > @Desde

        AND
        (
            txt.text IS NULL

            OR txt.text NOT LIKE
                '%sp_Monitor_%'
        )

    ORDER BY
        qs.total_worker_time DESC;

END;
GO
