-- Registra en el menu la pagina /logistica/gestionequipos/all (Logistica de equipos: todas las pestanas).
-- La asignacion a perfiles y roles se realiza desde Seguridad / Menu (este script no otorga permisos).
-- Idempotente: no duplica si la ruta ya existe. Se registra bajo el mismo padre que /logistica/gestionequipos/recojo.
-- PV: no ejecutado en la BD real.
SET XACT_ABORT ON;
BEGIN TRANSACTION;

DECLARE @Padre INT = (
    SELECT TOP (1) IdMenuPadre FROM dbo.SegMenu
    WHERE Ruta='/logistica/gestionequipos/recojo' AND EsActivo=1
    ORDER BY IdMenu
);
IF @Padre IS NULL
    THROW 50001, 'No se encontro el menu de referencia /logistica/gestionequipos/recojo. Registre la pagina bajo Logistica desde Seguridad / Menu.', 1;

IF NOT EXISTS (SELECT 1 FROM dbo.SegMenu WITH (UPDLOCK, HOLDLOCK) WHERE Ruta='/logistica/gestionequipos/all')
    INSERT dbo.SegMenu
        (IdMenuPadre, NombreMenu, Ruta, Icono, OrdenMenu, NivelMenu, EsVisible, EsActivo, EsNodoPrincipal, CodigoMenu, UsuarioCreacion, FechaCreacion)
    VALUES
        (@Padre, N'Logística de equipos', '/logistica/gestionequipos/all', 'Package',
         (SELECT ISNULL(MAX(OrdenMenu),0)+1 FROM dbo.SegMenu WHERE IdMenuPadre=@Padre),
         3, 1, 1, 0, 'LOG_EQUIPOS_ALL', 'MIGRACION', GETDATE());

COMMIT;
