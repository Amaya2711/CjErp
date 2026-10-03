-- GUARDA DE BASE (obligatoria): edite @BaseDestino con el nombre EXACTO de la base donde DECIDE aplicar este script
-- (copia de pruebas o, con autorizacion expresa, la base real) y ejecute conectado a ella. Si el nombre no coincide
-- o no se edito, NO se ejecuta nada de este script (NOEXEC).
DECLARE @BaseDestino SYSNAME = N'<NOMBRE_DE_LA_BASE_DESTINO>';
IF @BaseDestino = N'<NOMBRE_DE_LA_BASE_DESTINO>' OR DB_NAME() <> @BaseDestino
BEGIN
    RAISERROR(N'Guarda de base: edite @BaseDestino con el nombre exacto de la base destino y ejecute conectado a ella. No se ejecuto nada.', 16, 1);
    SET NOEXEC ON;
END
GO
/* ============================================================================
   MIGRACION — NO EJECUTADA todavia. Matriz aprobada el 2026-10-03 (docs/AI_COPILOT_FASE2_MATRIZ_PERMISOS.md).
   Aplicar siguiendo el procedimiento escalonado de docs/AI_COPILOT_FASE2_INTEGRACION_DEV.md.

   Tabla de permisos del IA Chat por perfil-rol (configuracion EDITABLE, no valores fijos en codigo).
   Solo crea la estructura: NO inserta ninguna fila (sin seed). La configuracion inicial se cargara
   despues, desde una matriz aprobada, y se mantendra con la pantalla de administracion (ver plan).

   Reglas de diseno:
   - Una fila = (herramienta, IdPerfilRol) -> alcance de filas (PROPIO/EQUIPO/TOTAL) y permiso de
     totales globales de OC/site, INDEPENDIENTE del alcance.
   - Sin fila, o con EsActivo = 0 => acceso denegado (fail-closed). Un perfil-rol NUEVO no recibe
     acceso automaticamente: no hay triggers ni valores por defecto que inserten filas.
   - Desactivar = EsActivo 0. No se eliminan filas: un trigger INSTEAD OF DELETE lo impide para
     conservar el historial. El registro de "quien, cuando, valor anterior y nuevo" lo escribe la API de
     administracion en dbo.AuditoriaCambios (sp_AuditoriaCambios_Registrar); aqui solo quedan
     FechaCreacion/UsuarioCreacion y FechaModificacion/UsuarioModificacion de la ultima accion.
   - Los permisos se consultan por IdUsuario en cada consulta y exportacion (sin cache): un cambio
     rige de inmediato, sin cerrar sesion ni redesplegar.
   - Sin ALTER a tablas existentes. Idempotente.
   ============================================================================ */
IF OBJECT_ID(N'dbo.IaToolPermiso', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.IaToolPermiso
    (
        IdIaToolPermiso        INT IDENTITY(1, 1) NOT NULL CONSTRAINT PK_IaToolPermiso PRIMARY KEY,
        ToolName               VARCHAR(100) NOT NULL,
        IdPerfilRol            INT NOT NULL,
        ScopeLevel             VARCHAR(10) NOT NULL,
        PermiteTotalesGlobales BIT NOT NULL CONSTRAINT DF_IaToolPermiso_Globales DEFAULT (0),
        EsActivo               BIT NOT NULL CONSTRAINT DF_IaToolPermiso_Activo DEFAULT (1),
        FechaCreacion          DATETIME2 NOT NULL CONSTRAINT DF_IaToolPermiso_FechaCreacion DEFAULT (SYSDATETIME()),
        UsuarioCreacion        NVARCHAR(100) NOT NULL,
        FechaModificacion      DATETIME2 NULL,
        UsuarioModificacion    NVARCHAR(100) NULL,
        CONSTRAINT CK_IaToolPermiso_Scope CHECK (ScopeLevel IN ('PROPIO', 'EQUIPO', 'TOTAL')),
        CONSTRAINT FK_IaToolPermiso_SegPerfilRol FOREIGN KEY (IdPerfilRol) REFERENCES dbo.SegPerfilRol (IdPerfilRol)
    );

    CREATE UNIQUE INDEX UX_IaToolPermiso_Tool_PerfilRol ON dbo.IaToolPermiso (ToolName, IdPerfilRol);
END;
GO

-- Impide el borrado fisico (el historial se conserva): se desactiva con EsActivo = 0.
CREATE OR ALTER TRIGGER dbo.TR_IaToolPermiso_SinBorrado
ON dbo.IaToolPermiso
INSTEAD OF DELETE
AS
BEGIN
    SET NOCOUNT ON;
    THROW 50030, 'IaToolPermiso: no se eliminan configuraciones; desactive con EsActivo = 0.', 1;
END;
GO
SET NOEXEC OFF;
GO
