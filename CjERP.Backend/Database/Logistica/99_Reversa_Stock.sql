/*
  Logistica / Stock - REVERSA. Deja la BD como estaba antes de 01..06 (elimina SOLO objetos creados por estos scripts).
  PV: no ejecutado ni probado. NO toca MaterialStock, DetSolicitud ni ninguna tabla del sistema antiguo.
  ATENCION: borra el libro (StockMovimiento) y los saldos (StockSaldo): conservar una copia si se quiere auditar.
  Orden: primero quitar el trigger (deja de capturar), luego vistas y SP, luego tablas.
*/
SET NOCOUNT ON;

IF OBJECT_ID(N'dbo.trg_MaterialStock_Ledger', N'TR') IS NOT NULL DROP TRIGGER dbo.trg_MaterialStock_Ledger;

IF OBJECT_ID(N'dbo.sp_Logistica_Stock_Descuadres', N'P')  IS NOT NULL DROP PROCEDURE dbo.sp_Logistica_Stock_Descuadres;
IF OBJECT_ID(N'dbo.sp_Logistica_Stock_Consultar', N'P')   IS NOT NULL DROP PROCEDURE dbo.sp_Logistica_Stock_Consultar;
IF OBJECT_ID(N'dbo.sp_Logistica_Material_Listar', N'P')   IS NOT NULL DROP PROCEDURE dbo.sp_Logistica_Material_Listar;
IF OBJECT_ID(N'dbo.sp_Stock_Mover', N'P')                 IS NOT NULL DROP PROCEDURE dbo.sp_Stock_Mover;
IF OBJECT_ID(N'dbo.sp_Stock_ProyectarMaterialStock', N'P') IS NOT NULL DROP PROCEDURE dbo.sp_Stock_ProyectarMaterialStock;

IF OBJECT_ID(N'dbo.vStockDescuadres', N'V')   IS NOT NULL DROP VIEW dbo.vStockDescuadres;
IF OBJECT_ID(N'dbo.vStockConciliacion', N'V') IS NOT NULL DROP VIEW dbo.vStockConciliacion;

IF OBJECT_ID(N'dbo.StockSaldoInicialExcepcion', N'U') IS NOT NULL DROP TABLE dbo.StockSaldoInicialExcepcion;
IF OBJECT_ID(N'dbo.LogisticaEtapaConfig', N'U') IS NOT NULL DROP TABLE dbo.LogisticaEtapaConfig;
IF OBJECT_ID(N'dbo.StockMovimiento', N'U')      IS NOT NULL DROP TABLE dbo.StockMovimiento;
IF OBJECT_ID(N'dbo.StockSaldo', N'U')           IS NOT NULL DROP TABLE dbo.StockSaldo;
IF OBJECT_ID(N'dbo.StockBucket', N'U')          IS NOT NULL DROP TABLE dbo.StockBucket;
