/* Diagnostico (SOLO LECTURA) de la pestana Total Ordenes de pagos_v2: misma llamada que envia el frontend
   (sin @Estados, rango de fechas, 4 TC). Ejecutar en JC_Db y enviar el bloque Messages (tiempos) o el error. */
USE JC_Db;
GO
SET NOCOUNT ON;
SET STATISTICS TIME ON;

EXEC dbo.sp_Planilla_Consulta_Estados
     @FechaInicio = '2026-10-17', @FechaFin = '2026-10-19',
     @TipoCambioUSD = 3.5, @TipoCambioEUR = 3.8, @TipoCambioDOP = 0.057, @TipoCambioCOP = 0.001;

-- Misma llamada con un correlativo puntual (sin fechas)
EXEC dbo.sp_Planilla_Consulta_Estados @Correlativo = 129631,
     @TipoCambioUSD = 3.5, @TipoCambioEUR = 3.8, @TipoCambioDOP = 0.057, @TipoCambioCOP = 0.001;

SET STATISTICS TIME OFF;
GO
