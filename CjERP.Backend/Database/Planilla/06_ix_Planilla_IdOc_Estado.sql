/*
    Indice para el calculo "% OC" (pagado por OC) de dbo.sp_Planilla_Consulta_Estados
    (script 05) y dbo.sp_Planilla_ConsultaIni (snippet Finanzas/03):
        SELECT SUM(Subtotal) FROM Planilla WHERE Estado = 4 AND IdOc = <oc de la fila>

    Sin este indice cada fila recorre todos los recibos pagados (estado 4) para sumar su OC y
    las grillas de pagos se vuelven lentas. Con el, cada fila hace una busqueda puntual.

    Recomendacion (misma que 02_ix_Planilla_Consulta_Estados_Perf.sql):
    1. ejecutar primero en QA y comparar tiempos (SET STATISTICS TIME ON)
    2. validar impacto de escritura en Planilla (es un indice angosto: IdOc, Estado + Subtotal)
    3. crear en horario de baja carga; si la edicion de SQL Server lo permite usar WITH (ONLINE = ON)

    PV: confirmar el tipo de dato real de Planilla.IdOc en JC_Db.
    Idempotente. Ejecutar en JC_Db.
*/
USE JC_Db;
GO
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IX_Planilla_IdOc_Estado'
      AND object_id = OBJECT_ID('dbo.Planilla')
)
BEGIN
    CREATE NONCLUSTERED INDEX IX_Planilla_IdOc_Estado
    ON dbo.Planilla (IdOc, Estado)
    INCLUDE (Subtotal);
END;
GO
