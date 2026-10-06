/* ================================================================
   Planilla: mantiene FecIngresoDate / FechaDepositoDate a partir del texto
   FecIngreso / FechaDeposito, sin importar quien escriba (sp_Planilla_Insertar,
   sp_Planilla_Actualizar, SPs masivos, SQL inline de PagoTesoreriaService, apps legacy).
   - Mismo orden de formatos que sp_Planilla_ConsultaIni y la validacion 01:
       FecIngreso:     101 -> 103 -> 23
       FechaDeposito:  23  -> 101 -> 103
   - Nunca pisa una fecha DATE existente con NULL (Viaticos escribe FechaDepositoDate
     directamente sin tocar el texto).
   - Idempotente. Ejecutar en JC_Db.
   PRE-CHECK (debe devolver is_computed = 0 y ningun trigger que use OUTPUT):
     SELECT name,is_computed FROM sys.columns WHERE object_id=OBJECT_ID('dbo.Planilla')
       AND name IN ('FecIngresoDate','FechaDepositoDate');
     SELECT name FROM sys.triggers WHERE parent_id=OBJECT_ID('dbo.Planilla');
   ================================================================ */
USE JC_Db;
GO
CREATE OR ALTER TRIGGER dbo.trg_Planilla_SincronizarFechasDate
ON dbo.Planilla
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF TRIGGER_NESTLEVEL(OBJECT_ID('dbo.trg_Planilla_SincronizarFechasDate')) > 1 RETURN;
    IF NOT (UPDATE(FecIngreso) OR UPDATE(FechaDeposito)) RETURN;

    UPDATE p
       SET p.FecIngresoDate      = COALESCE(x.Ing, p.FecIngresoDate),
           p.FechaDepositoDate   = COALESCE(x.Dep, p.FechaDepositoDate)
      FROM dbo.Planilla p
      JOIN inserted i ON i.Correlativo = p.Correlativo
     CROSS APPLY (SELECT
            Ing = COALESCE(TRY_CONVERT(DATE, NULLIF(LTRIM(RTRIM(i.FecIngreso)), ''), 101),
                           TRY_CONVERT(DATE, NULLIF(LTRIM(RTRIM(i.FecIngreso)), ''), 103),
                           TRY_CONVERT(DATE, NULLIF(LTRIM(RTRIM(i.FecIngreso)), ''), 23)),
            Dep = COALESCE(TRY_CONVERT(DATE, NULLIF(LTRIM(RTRIM(i.FechaDeposito)), ''), 23),
                           TRY_CONVERT(DATE, NULLIF(LTRIM(RTRIM(i.FechaDeposito)), ''), 101),
                           TRY_CONVERT(DATE, NULLIF(LTRIM(RTRIM(i.FechaDeposito)), ''), 103))) x
     WHERE (x.Ing IS NOT NULL AND (p.FecIngresoDate    IS NULL OR p.FecIngresoDate    <> x.Ing))
        OR (x.Dep IS NOT NULL AND (p.FechaDepositoDate IS NULL OR p.FechaDepositoDate <> x.Dep));
END
GO

/* ---- BACKFILL de las filas existentes sin fecha DATE (una sola vez) ---- */
;WITH x AS (
    SELECT p.Correlativo,
           Ing = COALESCE(TRY_CONVERT(DATE, NULLIF(LTRIM(RTRIM(p.FecIngreso)), ''), 101),
                          TRY_CONVERT(DATE, NULLIF(LTRIM(RTRIM(p.FecIngreso)), ''), 103),
                          TRY_CONVERT(DATE, NULLIF(LTRIM(RTRIM(p.FecIngreso)), ''), 23)),
           Dep = COALESCE(TRY_CONVERT(DATE, NULLIF(LTRIM(RTRIM(p.FechaDeposito)), ''), 23),
                          TRY_CONVERT(DATE, NULLIF(LTRIM(RTRIM(p.FechaDeposito)), ''), 101),
                          TRY_CONVERT(DATE, NULLIF(LTRIM(RTRIM(p.FechaDeposito)), ''), 103))
      FROM dbo.Planilla p
     WHERE p.FecIngresoDate IS NULL OR p.FechaDepositoDate IS NULL
)
UPDATE p
   SET p.FecIngresoDate    = COALESCE(p.FecIngresoDate, x.Ing),
       p.FechaDepositoDate = COALESCE(p.FechaDepositoDate, x.Dep)
  FROM dbo.Planilla p JOIN x ON x.Correlativo = p.Correlativo
 WHERE (p.FecIngresoDate IS NULL AND x.Ing IS NOT NULL)
    OR (p.FechaDepositoDate IS NULL AND x.Dep IS NOT NULL);
-- Luego repetir 01_validacion_fechas_Planilla_SoloLectura.sql: *_sin_date_con_texto debe ser 0.
GO
