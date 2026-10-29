/* ================================================================
   Rendimiento de dbo.sp_Planilla_ProcesarAprobacionMasiva (aprobar 15+ registros).

   Causa (diagnostico 29/10/2026, indices de dbo.Planilla en JC_Db):
   - El SP busca cada registro por Correlativo + IdSite con
     WITH (UPDLOCK, HOLDLOCK). El clustered (PK) empieza por IdProyecto, IdSite,
     IdTipoTrabajo, IdTarea, Correlativo, IdCliente y ningun otro indice tiene
     Correlativo como primera columna: cada busqueda escanea y toma bloqueos de
     rango (serializable), que escalan a la tabla y frenan al resto de usuarios,
     la consulta de la bandeja y los KPIs.
   - El acumulado diario (regla 2.2 / 2.7) filtra por IdResponsable, TipoMoneda,
     Estado IN (6,10) y CAST(FecIngreso AS DATE) (FecIngreso es texto).

   Este script SOLO crea indices (no cambia el SP ni reglas de negocio).
   Idempotente. Ejecutar en JC_Db, de preferencia fuera de horario
   (ONLINE = ON requiere Enterprise; si falla, quitar la opcion).

   PRE-CHECK:
     SELECT name FROM sys.indexes WHERE object_id = OBJECT_ID('dbo.Planilla')
        AND name IN ('IX_Planilla_Correlativo_IdSite','IX_Planilla_Estado_Responsable_Moneda_FecIngresoDate');
   ================================================================ */
USE [JC_Db]
GO

/* 1) Busqueda por Correlativo + IdSite (join del SP y de los UPDATE posteriores). */
IF NOT EXISTS (SELECT 1 FROM sys.indexes
                WHERE object_id = OBJECT_ID('dbo.Planilla')
                  AND name = 'IX_Planilla_Correlativo_IdSite')
BEGIN
    CREATE NONCLUSTERED INDEX IX_Planilla_Correlativo_IdSite
        ON dbo.Planilla (Correlativo, IdSite)
        INCLUDE (Estado, IdResponsable, TipoMoneda, Total, FecIngreso);
END
GO

/* 2) Acumulado diario: Estado 6/10 por responsable, moneda y fecha. */
IF NOT EXISTS (SELECT 1 FROM sys.indexes
                WHERE object_id = OBJECT_ID('dbo.Planilla')
                  AND name = 'IX_Planilla_Estado_Responsable_Moneda_FecIngresoDate')
BEGIN
    CREATE NONCLUSTERED INDEX IX_Planilla_Estado_Responsable_Moneda_FecIngresoDate
        ON dbo.Planilla (Estado, IdResponsable, TipoMoneda, FecIngresoDate)
        INCLUDE (Total);
END
GO
