-- Registra en el menú la página /recursoshumanos/descansomedico (Descanso médico).
-- La asignación a perfiles y roles se realiza desde Seguridad / Menú (este script no otorga permisos).
-- Idempotente: no duplica si la ruta ya existe. Se registra bajo el mismo padre que /recursoshumanos/vacacionespage.
SET XACT_ABORT ON;
BEGIN TRANSACTION;

DECLARE @Padre INT = (
    SELECT TOP (1) IdMenuPadre FROM dbo.SegMenu
    WHERE Ruta='/recursoshumanos/vacacionespage' AND EsActivo=1
    ORDER BY IdMenu
);
IF @Padre IS NULL
    THROW 50001, 'No se encontró el menú de referencia vacacionespage. Registre la página bajo Recursos Humanos desde Seguridad / Menú.', 1;

IF NOT EXISTS (SELECT 1 FROM dbo.SegMenu WITH (UPDLOCK, HOLDLOCK) WHERE Ruta='/recursoshumanos/descansomedico')
    INSERT dbo.SegMenu
        (IdMenuPadre, NombreMenu, Ruta, Icono, OrdenMenu, NivelMenu, EsVisible, EsActivo, EsNodoPrincipal, CodigoMenu, UsuarioCreacion, FechaCreacion)
    VALUES
        (@Padre, N'Descanso médico', '/recursoshumanos/descansomedico', 'Stethoscope',
         (SELECT ISNULL(MAX(OrdenMenu),0)+1 FROM dbo.SegMenu WHERE IdMenuPadre=@Padre),
         3, 1, 1, 0, 'RRHH_DESCANSO', 'MIGRACION', GETDATE());

COMMIT;
