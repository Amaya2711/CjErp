-- Registra en SegMenu el menu de la app movil de logistica (CodigoMenu = MOB_LOG_DESPACHOS).
-- NO otorga permisos: asignarlo desde Seguridad / Menu a un rol propio (p. ej. "Movil Logistica"),
-- nunca al rol estandar (lo comparten empleados IdCargo=50 y externos IdCargo=51).
-- EsVisible = 0: no aparece en el menu del ERP web; solo lo consume la app movil.
-- Rol sugerido: "Despachador movil" (crear en Seguridad / Roles). Permisos del menu sobre ese rol:
--   Ver (consultar pendientes y series) + Editar (despachar, subir foto) + Aprobar (rechazar).
-- Idempotente. Se registra bajo el mismo padre que /logistica/gestionequipos/recojo.
-- PV: no ejecutado en la BD real. Revisar antes de correr.
SET XACT_ABORT ON;
BEGIN TRANSACTION;

-- Padre: "Gestion Equipos" (CodigoMenu 'LOG_GESTION EQUIPOS', IdMenu 117 al 2026-11-26). Se busca por codigo porque la ruta del
-- menu "Recojo equipos" esta guardada con barras invertidas y no sirve de referencia.
DECLARE @Padre INT = (
    SELECT TOP (1) IdMenu FROM dbo.SegMenu
    WHERE CodigoMenu = 'LOG_GESTION EQUIPOS' AND EsActivo=1
    ORDER BY IdMenu
);
IF @Padre IS NULL
    THROW 50001, 'No se encontro el menu padre LOG_GESTION EQUIPOS. Registre el padre desde Seguridad / Menu.', 1;

IF NOT EXISTS (SELECT 1 FROM dbo.SegMenu WITH (UPDLOCK, HOLDLOCK) WHERE CodigoMenu='MOB_LOG_DESPACHOS')
    INSERT dbo.SegMenu
        (IdMenuPadre, NombreMenu, Ruta, Icono, OrdenMenu, NivelMenu, EsVisible, EsActivo, EsNodoPrincipal, CodigoMenu, UsuarioCreacion, FechaCreacion)
    VALUES
        (@Padre, N'Despachos de logística (móvil)', '/mobile/logistica/despachos', 'Smartphone',
         (SELECT ISNULL(MAX(OrdenMenu),0)+1 FROM dbo.SegMenu WHERE IdMenuPadre=@Padre),
         (SELECT ISNULL(NivelMenu, 2) + 1 FROM dbo.SegMenu WHERE IdMenu=@Padre), 0, 1, 0, 'MOB_LOG_DESPACHOS', 'MIGRACION', GETDATE());

COMMIT;
