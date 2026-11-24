/*
  Agrega la cuenta 3351 - OTROS ACTIVOS FIJOS y la habilita para ACTIVO / ACTIVO_FIJO / ACTIVO_FIJO.
  La nueva regla se clona de la regla existente de la cuenta 3321 (EDIFICACIONES), asi hereda
  Orden, RequiereComprobante, AplicaConciliacion, etc. No toca movimientos ya clasificados.
  Es idempotente: se puede ejecutar mas de una vez.

  PASO 1 (opcional, solo lectura): revisar lo que existe antes de ejecutar.
*/
SELECT p.IdCuentaContable, p.CodigoCuenta, p.NombreCuenta, p.IdActivo
FROM dbo.PlanCuentaContable p
WHERE p.CodigoCuenta IN ('3321', '3351');

SELECT rc.*
FROM dbo.ConciliacionReglaContable rc
JOIN dbo.PlanCuentaContable p ON p.IdCuentaContable = rc.IdCuentaContable
WHERE p.CodigoCuenta IN ('3321', '3351');
GO

/* PASO 2: crear cuenta y regla */
SET XACT_ABORT ON;
BEGIN TRAN;

-- 1) Cuenta 3351 en el plan contable (si no existe)
IF NOT EXISTS (SELECT 1 FROM dbo.PlanCuentaContable WHERE CodigoCuenta = '3351')
BEGIN
    INSERT INTO dbo.PlanCuentaContable (CodigoCuenta, NombreCuenta, IdActivo)
    VALUES ('3351', 'OTROS ACTIVOS FIJOS', 1);
END
ELSE
BEGIN
    -- si existia inactiva, la reactiva
    UPDATE dbo.PlanCuentaContable SET IdActivo = 1 WHERE CodigoCuenta = '3351' AND IdActivo <> 1;
END

DECLARE @IdCuentaNueva INT = (SELECT TOP 1 IdCuentaContable FROM dbo.PlanCuentaContable WHERE CodigoCuenta = '3351');
DECLARE @IdCuentaBase  INT = (SELECT TOP 1 IdCuentaContable FROM dbo.PlanCuentaContable WHERE CodigoCuenta = '3321');

IF @IdCuentaNueva IS NULL OR @IdCuentaBase IS NULL
BEGIN
    RAISERROR('No se encontro la cuenta 3351 o la 3321 en PlanCuentaContable.', 16, 1);
    ROLLBACK TRAN;
    RETURN;
END

-- 2) Regla ACTIVO / ACTIVO_FIJO -> 3351, clonada de la de 3321
IF NOT EXISTS (
    SELECT 1
    FROM dbo.ConciliacionReglaContable rc
    JOIN dbo.ConciliacionReglaContable base
      ON base.IdAreaFlujo = rc.IdAreaFlujo AND base.IdReferencia = rc.IdReferencia
    WHERE base.IdCuentaContable = @IdCuentaBase
      AND rc.IdCuentaContable = @IdCuentaNueva
)
BEGIN
    INSERT INTO dbo.ConciliacionReglaContable
        (IdAreaFlujo, IdReferencia, IdCuentaContable, Orden, EsPrincipal, RequiereComprobante, AplicaConciliacion, Observacion, IdActivo)
    SELECT
        base.IdAreaFlujo, base.IdReferencia, @IdCuentaNueva,
        base.Orden + 1,      -- queda despues de 3321
        0,                   -- 3321 sigue siendo la principal
        base.RequiereComprobante, base.AplicaConciliacion,
        base.Observacion, 1
    FROM dbo.ConciliacionReglaContable base
    WHERE base.IdCuentaContable = @IdCuentaBase
      AND base.IdActivo = 1;
END

COMMIT TRAN;

-- Verificacion: debe mostrar 3321 y 3351 bajo ACTIVO / ACTIVO_FIJO
SELECT af.NombreAreaFlujo, r.CodigoReferencia, p.CodigoCuenta, p.NombreCuenta, rc.Orden, rc.EsPrincipal, rc.IdActivo
FROM dbo.ConciliacionReglaContable rc
JOIN dbo.ConciliacionAreaFlujo af ON af.IdAreaFlujo = rc.IdAreaFlujo
JOIN dbo.ConciliacionReferencia r ON r.IdReferencia = rc.IdReferencia
JOIN dbo.PlanCuentaContable p ON p.IdCuentaContable = rc.IdCuentaContable
WHERE af.NombreAreaFlujo = 'ACTIVO' AND r.CodigoReferencia = 'ACTIVO_FIJO'
ORDER BY rc.Orden;
