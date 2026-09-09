-- Registrar la página; la asignación a perfiles y roles se realiza desde Seguridad / Menú.
-- No otorga permisos automáticamente ni modifica recibos.
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF NOT EXISTS (SELECT 1 FROM dbo.SegMenu WITH (UPDLOCK, HOLDLOCK) WHERE Ruta='/finanzas/tesoreria/pagartesoreria')
BEGIN
    DECLARE @Padre INT = (
        SELECT TOP (1) IdMenuPadre FROM dbo.SegMenu
        WHERE Ruta='/finanzas/tesoreria/pagos_v1' AND EsActivo=1
        ORDER BY IdMenu
    );
    IF @Padre IS NULL
        THROW 50001, 'No se encontró el menú de referencia pagos_v1. Registre la página bajo Finanzas / Tesorería desde Seguridad / Menú.', 1;

    INSERT dbo.SegMenu
        (IdMenuPadre, NombreMenu, Ruta, Icono, OrdenMenu, NivelMenu, EsVisible, EsActivo, EsNodoPrincipal, CodigoMenu, UsuarioCreacion, FechaCreacion)
    VALUES
        (@Padre, N'Pagos de tesorería', '/finanzas/tesoreria/pagartesoreria', 'Banknote',
         (SELECT ISNULL(MAX(OrdenMenu),0)+1 FROM dbo.SegMenu WHERE IdMenuPadre=@Padre),
         3, 1, 1, 0, 'TES_PAGAR', 'MIGRACION', GETDATE());
END;

COMMIT;
