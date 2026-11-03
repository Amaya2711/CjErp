-- RESPALDO / REVERSION: definicion VIGENTE de dbo.sp_Monitor_CapturarTopSql en JC_Db al 2026-11-02 (antes del script 03).
-- Ejecutar este archivo restaura exactamente el procedimiento anterior. Obtenido con OBJECT_DEFINITION.
-- Para volver tambien a la frecuencia anterior no hace falta mas: sin el codigo nuevo la fila TOPSQL_INTERVALO_MIN se ignora
-- (opcional: DELETE FROM dbo.Monitor_Config WHERE Codigo = 'TOPSQL_INTERVALO_MIN';).
GO
/* ================================================================
   12. TOP SQL HIST�RICO
   Recomendaci�n: cada 5 minutos
   ================================================================ */

CREATE OR ALTER PROCEDURE dbo.sp_Monitor_CapturarTopSql
AS
BEGIN
    SET NOCOUNT ON;


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
