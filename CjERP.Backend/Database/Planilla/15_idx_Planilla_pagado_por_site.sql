/* ================================================================
   Planilla: indice filtrado (Estado = 4) por sitio, para sp_Planilla_Consulta_Estados_Totales (script 14).
   Esa SP acota los agregados historicos de pagados a los SITIOS de los recibos mostrados
   (IdCliente, IdProyecto, IdSite, CorreSite), por lo que busca por esas columnas y no por OT.
   Complementa a 12_idx_Planilla_pagado_ot_subtotal.sql (que sirve al SP original, sin acotar por sitio).
   Solo agrega un indice (idempotente). Ejecutar en JC_Db, de preferencia fuera de horario.
   ================================================================ */
USE [JC_Db]
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes
                WHERE object_id = OBJECT_ID('dbo.Planilla')
                  AND name = 'IX_Planilla_Pagado_Site')
BEGIN
    CREATE NONCLUSTERED INDEX IX_Planilla_Pagado_Site
        ON dbo.Planilla (IdCliente, IdProyecto, IdSite, CorreSite)
        INCLUDE (Ot, Tipo_Trabajo, TipoMoneda, Subtotal)
        WHERE Estado = 4;
END
GO
