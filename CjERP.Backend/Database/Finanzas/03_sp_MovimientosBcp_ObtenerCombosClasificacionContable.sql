CREATE OR ALTER PROCEDURE dbo.sp_MovimientosBcp_ObtenerCombosClasificacionContable
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        af.IdAreaFlujo,
        af.NombreAreaFlujo
    FROM dbo.ConciliacionAreaFlujo af
    WHERE af.IdActivo = 1
    ORDER BY af.NombreAreaFlujo;

    SELECT
        r.IdReferencia,
        r.CodigoReferencia,
        r.NombreReferencia
    FROM dbo.ConciliacionReferencia r
    WHERE r.IdActivo = 1
    ORDER BY r.CodigoReferencia, r.NombreReferencia;

    SELECT
        p.IdCuentaContable,
        p.CodigoCuenta,
        p.NombreCuenta,
        CONCAT(ISNULL(p.CodigoCuenta, ''), ' - ', ISNULL(p.NombreCuenta, '')) AS CuentaContableTexto
    FROM dbo.PlanCuentaContable p
    WHERE p.IdActivo = 1
    ORDER BY p.CodigoCuenta, p.NombreCuenta;

    SELECT
        rc.IdReglaContable,
        rc.IdAreaFlujo,
        rc.IdReferencia,
        rc.IdCuentaContable,
        rc.Orden,
        rc.EsPrincipal,
        rc.RequiereComprobante,
        rc.AplicaConciliacion,
        rc.Observacion
    FROM dbo.ConciliacionReglaContable rc
    WHERE rc.IdActivo = 1
    ORDER BY rc.IdAreaFlujo, rc.IdReferencia, rc.IdCuentaContable, rc.Orden, rc.IdReglaContable;
END;
