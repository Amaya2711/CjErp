-- SQL MONITOR: reduce la retencion de Monitor_TopSql de 30 a 7 dias.
-- MOTIVO: Monitor_TopSql ocupa ~930 MB (137 mil filas de ~7 KB: cada 5 minutos guarda las 20 consultas mas pesadas con hasta 4.000 caracteres
--   de texto, y casi todas se repiten). Esas escrituras y su purga diaria alimentaban el crecimiento del log de JC_Db.
-- QUE HACE: un solo UPDATE sobre dbo.Monitor_Config, codigo RETENCION_TOPSQL_DIAS. No cambia codigo, procedimientos ni otras filas.
--   La purga real la hace el SqlMonitorWorker una vez al dia (sp_Monitor_LimpiarHistorico); este script NO borra filas.
-- SEGURIDAD: idempotente; solo BAJA el valor (nunca lo sube); no hace nada si ya es <= 7 o si la fila no existe.
-- REVERSION: UPDATE dbo.Monitor_Config SET ValorNumero = 30 WHERE Codigo = 'RETENCION_TOPSQL_DIAS';   (valor original: 30)
-- Se puede ejecutar en una ventana normal de SSMS conectada a JC_Db (no usa SQLCMD).
SET NOCOUNT ON;

IF DB_NAME() <> N'JC_Db'
    THROW 51700, 'Guarda de base: la base activa no es JC_Db. No se ejecuto nada.', 1;

DECLARE @antes DECIMAL(18, 4) = (SELECT ValorNumero FROM dbo.Monitor_Config WHERE Codigo = 'RETENCION_TOPSQL_DIAS' AND IdActivo = 1);

IF @antes IS NULL
    PRINT 'No existe la fila activa RETENCION_TOPSQL_DIAS: no se cambia nada.';
ELSE IF @antes <= 7
    PRINT CONCAT('La retencion ya es ', CAST(@antes AS VARCHAR(20)), ' dias: no se cambia nada.');
ELSE
    UPDATE dbo.Monitor_Config SET ValorNumero = 7 WHERE Codigo = 'RETENCION_TOPSQL_DIAS' AND IdActivo = 1;

SELECT Codigo, ValorNumero AS DiasRetencion, @antes AS ValorAnterior
FROM dbo.Monitor_Config WHERE Codigo = 'RETENCION_TOPSQL_DIAS';
