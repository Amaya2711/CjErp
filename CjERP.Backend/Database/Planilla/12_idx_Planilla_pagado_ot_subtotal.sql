/* ================================================================
   Planilla: indice filtrado para los totales pagados (Estado = 4) por OT/sitio/moneda de
   sp_Planilla_Consulta_Estados (#PlanillaOT). Diagnostico 29/10/2026: ~161.000 lecturas por ejecucion,
   porque IX_Planilla_AnalisisOTPagada no incluye Subtotal y obliga a leer la tabla.
   Solo agrega un indice (idempotente). Ejecutar en JC_Db, de preferencia fuera de horario.
   ================================================================ */
USE [JC_Db]
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes
                WHERE object_id = OBJECT_ID('dbo.Planilla')
                  AND name = 'IX_Planilla_Pagado_Ot_Subtotal')
BEGIN
    CREATE NONCLUSTERED INDEX IX_Planilla_Pagado_Ot_Subtotal
        ON dbo.Planilla (Ot, IdCliente, IdProyecto, IdSite, CorreSite, Tipo_Trabajo, TipoMoneda)
        INCLUDE (Subtotal)
        WHERE Estado = 4;
END
GO
