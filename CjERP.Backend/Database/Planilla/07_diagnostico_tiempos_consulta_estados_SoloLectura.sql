/* ================================================================
   DIAGNOSTICO DE TIEMPOS (SOLO LECTURA) de dbo.sp_Planilla_Consulta_Estados
   Mide cada llamada que hace pagos_v2 al abrir/cambiar de pestana, para ubicar cual es la lenta.
   Ejecutar en JC_Db con "Include Actual Execution Plan" opcional. Enviar el bloque "Messages".
   No modifica datos.
   ================================================================ */
USE JC_Db;
GO
SET NOCOUNT ON;
SET STATISTICS TIME ON;
SET STATISTICS IO ON;

DECLARE @hoy DATE = CAST(GETDATE() AS DATE);
DECLARE @desde DATE = DATEADD(DAY, -30, @hoy);

PRINT '=== 1) Bandeja Aprobar COMPLETA (estado 0, 30 dias) ===';
EXEC dbo.sp_Planilla_Consulta_Estados @Estados = '0', @FechaInicio = @desde, @FechaFin = @hoy,
     @TipoCambioUSD = 3.5, @TipoCambioEUR = 3.8, @TipoCambioDOP = 0.057, @TipoCambioCOP = 0.001;

PRINT '=== 2) Misma bandeja en ModoLiviano (lo que usan ahora los contadores) ===';
EXEC dbo.sp_Planilla_Consulta_Estados @Estados = '0', @FechaInicio = @desde, @FechaFin = @hoy, @ModoLiviano = 1;

PRINT '=== 3) Suma responsable de la bandeja (segunda llamada de la grilla) ===';
EXEC dbo.sp_Planilla_Consulta_Estados @Estados = '0', @FechaInicio = @desde, @FechaFin = @hoy, @SoloSumaResp = 1;

PRINT '=== 4) Re-aprobar completa (estado 6, sin fechas) ===';
EXEC dbo.sp_Planilla_Consulta_Estados @Estados = '6',
     @TipoCambioUSD = 3.5, @TipoCambioEUR = 3.8, @TipoCambioDOP = 0.057, @TipoCambioCOP = 0.001;

PRINT '=== 5) Resumen de contadores (SP liviano) ===';
EXEC dbo.sp_Planilla_Consulta_Estados_Resumen;

SET STATISTICS IO OFF;
SET STATISTICS TIME OFF;
GO
