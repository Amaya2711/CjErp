-- Reporte WhatsApp por Meta (/mantenimiento/sistemas/rptwup_v1): empleados DESMARCADOS (no reciben el reporte).
-- Por defecto todos los empleados de dbo.sp_EmpleadoCj_Listar_Wup estan habilitados (sin fila en esta tabla).
-- Idempotente. El backend tambien la crea si no existe.
IF OBJECT_ID('dbo.ReporteWhatsappExcluido', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.ReporteWhatsappExcluido
    (
        TipoReporte nvarchar(50) NOT NULL,
        IdEmpleado int NOT NULL,
        UsuarioModificacion nvarchar(100) NULL,
        FechaModificacion datetime NOT NULL CONSTRAINT DF_ReporteWhatsappExcluido_Fecha DEFAULT (GETDATE()),
        CONSTRAINT PK_ReporteWhatsappExcluido PRIMARY KEY (TipoReporte, IdEmpleado)
    );
END;
GO

-- Menu: pagina /mantenimiento/sistemas/rptwup_v1 bajo el mismo padre que /mantenimiento/sistemas/rptwup.
-- La asignacion a perfiles y roles se hace desde Seguridad / Menu (este script no otorga permisos).
SET XACT_ABORT ON;
BEGIN TRANSACTION;

DECLARE @Padre INT = (
    SELECT TOP (1) IdMenuPadre FROM dbo.SegMenu
    WHERE Ruta = '/mantenimiento/sistemas/rptwup' AND EsActivo = 1
    ORDER BY IdMenu
);
IF @Padre IS NULL
    THROW 50001, 'No se encontro el menu de referencia /mantenimiento/sistemas/rptwup. Registre la pagina desde Seguridad / Menu.', 1;

IF NOT EXISTS (SELECT 1 FROM dbo.SegMenu WITH (UPDLOCK, HOLDLOCK) WHERE Ruta = '/mantenimiento/sistemas/rptwup_v1')
    INSERT dbo.SegMenu
        (IdMenuPadre, NombreMenu, Ruta, Icono, OrdenMenu, NivelMenu, EsVisible, EsActivo, EsNodoPrincipal, CodigoMenu, UsuarioCreacion, FechaCreacion)
    VALUES
        (@Padre, N'Reporte WhatsApp Meta', '/mantenimiento/sistemas/rptwup_v1', 'Send',
         (SELECT ISNULL(MAX(OrdenMenu), 0) + 1 FROM dbo.SegMenu WHERE IdMenuPadre = @Padre),
         3, 1, 1, 0, 'SIS_RPTWUP_V1', 'MIGRACION', GETDATE());

COMMIT;
