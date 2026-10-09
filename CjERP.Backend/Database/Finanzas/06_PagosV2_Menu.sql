-- Registra en el menú las páginas /finanzas/tesoreria/pagos_v2 y /finanzas/tesoreria/pagartesoreria_v2.
-- La asignación a perfiles y roles se realiza desde Seguridad / Menú (este script no otorga permisos).
-- Idempotente: no duplica si la ruta ya existe. Ejecutar en la BD antes de asignar las páginas.
SET XACT_ABORT ON;
BEGIN TRANSACTION;

DECLARE @Padre INT = (
    SELECT TOP (1) IdMenuPadre FROM dbo.SegMenu
    WHERE Ruta='/finanzas/tesoreria/pagos_v1' AND EsActivo=1
    ORDER BY IdMenu
);
IF @Padre IS NULL
    THROW 50001, 'No se encontró el menú de referencia pagos_v1. Registre las páginas bajo Finanzas / Tesorería desde Seguridad / Menú.', 1;

IF NOT EXISTS (SELECT 1 FROM dbo.SegMenu WITH (UPDLOCK, HOLDLOCK) WHERE Ruta='/finanzas/tesoreria/pagos_v2')
    INSERT dbo.SegMenu
        (IdMenuPadre, NombreMenu, Ruta, Icono, OrdenMenu, NivelMenu, EsVisible, EsActivo, EsNodoPrincipal, CodigoMenu, UsuarioCreacion, FechaCreacion)
    VALUES
        (@Padre, N'Pagos V2', '/finanzas/tesoreria/pagos_v2', 'Banknote',
         (SELECT ISNULL(MAX(OrdenMenu),0)+1 FROM dbo.SegMenu WHERE IdMenuPadre=@Padre),
         3, 1, 1, 0, 'TES_PAGOS_V2', 'MIGRACION', GETDATE());

IF NOT EXISTS (SELECT 1 FROM dbo.SegMenu WITH (UPDLOCK, HOLDLOCK) WHERE Ruta='/finanzas/tesoreria/pagartesoreria_v2')
    INSERT dbo.SegMenu
        (IdMenuPadre, NombreMenu, Ruta, Icono, OrdenMenu, NivelMenu, EsVisible, EsActivo, EsNodoPrincipal, CodigoMenu, UsuarioCreacion, FechaCreacion)
    VALUES
        (@Padre, N'Pagos de tesorería V2', '/finanzas/tesoreria/pagartesoreria_v2', 'Banknote',
         (SELECT ISNULL(MAX(OrdenMenu),0)+1 FROM dbo.SegMenu WHERE IdMenuPadre=@Padre),
         3, 1, 1, 0, 'TES_PAGAR_V2', 'MIGRACION', GETDATE());

COMMIT;
