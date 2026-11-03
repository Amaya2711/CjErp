:on error exit
-- GUARDA DE BASE: la base destino es JC_Db.
DECLARE @BaseDestino SYSNAME = N'JC_Db';
IF DB_NAME() <> @BaseDestino
BEGIN
    RAISERROR(N'Guarda de base: la base activa no es la base destino (@BaseDestino). No se ejecuto nada.', 16, 1);
    SET NOEXEC ON;
END
GO
/* ============================================================================
   CJ INTELLIGENCE - REVERSION PREVIA AL USO (scripts 18 y 19). NO EJECUTADA.

   SOLO es valida mientras NO existan datos reales de CJ Intelligence. Despues de la puesta en marcha NO se
   usa: ver "Recuperacion posterior" en docs/CJ_INTELLIGENCE_DISENO.md (destruiria historial y evidencia).

   GUARDA: aborta con error (THROW, y :on error exit detiene sqlcmd) si CUALQUIERA de estas tablas tiene filas:
   IA_Turno, IA_ResultadoConsulta, IA_ConversacionEstado, IA_Mensaje, IA_Conversacion, IA_AuditoriaConsulta.
   (Las seis estaban en 0 filas antes del script 18.) No elimina nada con datos.
   Solo elimina lo creado por 18/19 y devuelve IA_Conversacion.IdUsuario a INT y IA_AuditoriaConsulta a 20 columnas.
   ============================================================================ */
SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

DECLARE @n BIGINT = 0, @t BIGINT;
IF OBJECT_ID(N'dbo.IA_Turno', N'U') IS NOT NULL             BEGIN SELECT @t = COUNT_BIG(*) FROM dbo.IA_Turno;             SET @n += @t; END
IF OBJECT_ID(N'dbo.IA_IdentidadUsuario', N'U') IS NOT NULL  BEGIN SELECT @t = COUNT_BIG(*) FROM dbo.IA_IdentidadUsuario;  SET @n += @t; END
IF OBJECT_ID(N'dbo.IA_IdentidadAuditoria', N'U') IS NOT NULL BEGIN SELECT @t = COUNT_BIG(*) FROM dbo.IA_IdentidadAuditoria; SET @n += @t; END
IF OBJECT_ID(N'dbo.IA_ResultadoConsulta', N'U') IS NOT NULL BEGIN SELECT @t = COUNT_BIG(*) FROM dbo.IA_ResultadoConsulta; SET @n += @t; END
IF OBJECT_ID(N'dbo.IA_ConversacionEstado', N'U') IS NOT NULL BEGIN SELECT @t = COUNT_BIG(*) FROM dbo.IA_ConversacionEstado; SET @n += @t; END
IF OBJECT_ID(N'dbo.IA_Mensaje', N'U') IS NOT NULL           BEGIN SELECT @t = COUNT_BIG(*) FROM dbo.IA_Mensaje;           SET @n += @t; END
IF OBJECT_ID(N'dbo.IA_Conversacion', N'U') IS NOT NULL      BEGIN SELECT @t = COUNT_BIG(*) FROM dbo.IA_Conversacion;      SET @n += @t; END
IF OBJECT_ID(N'dbo.IA_AuditoriaConsulta', N'U') IS NOT NULL BEGIN SELECT @t = COUNT_BIG(*) FROM dbo.IA_AuditoriaConsulta; SET @n += @t; END
IF @n > 0
    THROW 51003, 'REVERSION ABORTADA: ya existen filas en las tablas de CJ Intelligence. Use el procedimiento de recuperacion posterior.', 1;
GO

-- Procedimientos y funcion del script 19 (no contienen datos)
DECLARE @sql NVARCHAR(MAX) = N'';
SELECT @sql += N'DROP PROCEDURE dbo.' + QUOTENAME(name) + N';' + CHAR(10) FROM sys.procedures WHERE name LIKE N'sp[_]IA[_]Cj[_]%';
SELECT @sql += N'DROP VIEW dbo.' + QUOTENAME(name) + N';' + CHAR(10) FROM sys.views WHERE name LIKE N'vw[_]IA[_]Cj[_]%';
SELECT @sql += N'DROP FUNCTION dbo.' + QUOTENAME(name) + N';' + CHAR(10) FROM sys.objects WHERE type IN ('FN', 'IF') AND name LIKE N'fn[_]IA[_]Cj[_]%';
EXEC sys.sp_executesql @sql;
GO

-- Tablas nuevas (de hijas a padres)
IF OBJECT_ID(N'dbo.IA_ResultadoConsulta', N'U') IS NOT NULL DROP TABLE dbo.IA_ResultadoConsulta;
-- (la identidad se elimina al final, despues de quitar IdIdentidad de IA_Conversacion)
IF OBJECT_ID(N'dbo.IA_ConversacionEstado', N'U') IS NOT NULL DROP TABLE dbo.IA_ConversacionEstado;
GO

-- IA_Mensaje: quitar lo agregado por el script 18
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_IA_Mensaje_Turno_Rol' AND object_id = OBJECT_ID(N'dbo.IA_Mensaje'))
    DROP INDEX UX_IA_Mensaje_Turno_Rol ON dbo.IA_Mensaje;
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_IA_Mensaje_Conversacion_Secuencia' AND object_id = OBJECT_ID(N'dbo.IA_Mensaje'))
    DROP INDEX UX_IA_Mensaje_Conversacion_Secuencia ON dbo.IA_Mensaje;
IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_IA_Mensaje_Turno')
    ALTER TABLE dbo.IA_Mensaje DROP CONSTRAINT FK_IA_Mensaje_Turno;
IF COL_LENGTH(N'dbo.IA_Mensaje', N'DuracionModeloMs') IS NOT NULL ALTER TABLE dbo.IA_Mensaje DROP COLUMN DuracionModeloMs;
IF COL_LENGTH(N'dbo.IA_Mensaje', N'FinishReason')     IS NOT NULL ALTER TABLE dbo.IA_Mensaje DROP COLUMN FinishReason;
IF COL_LENGTH(N'dbo.IA_Mensaje', N'Secuencia')        IS NOT NULL ALTER TABLE dbo.IA_Mensaje DROP COLUMN Secuencia;
IF COL_LENGTH(N'dbo.IA_Mensaje', N'IdTurno')          IS NOT NULL ALTER TABLE dbo.IA_Mensaje DROP COLUMN IdTurno;
GO

IF OBJECT_ID(N'dbo.IA_Turno', N'U') IS NOT NULL DROP TABLE dbo.IA_Turno;
GO

-- IA_AuditoriaConsulta: quitar la columna agregada
IF COL_LENGTH(N'dbo.IA_AuditoriaConsulta', N'UsuarioLogin') IS NOT NULL
    ALTER TABLE dbo.IA_AuditoriaConsulta DROP COLUMN UsuarioLogin;
GO

-- IA_Conversacion: quitar el disparador, la FK y la columna de identidad; luego las tablas de identidad
IF OBJECT_ID(N'dbo.TR_IA_Conversacion_Identidad', N'TR') IS NOT NULL DROP TRIGGER dbo.TR_IA_Conversacion_Identidad;
IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_IA_Conversacion_Identidad') ALTER TABLE dbo.IA_Conversacion DROP CONSTRAINT FK_IA_Conversacion_Identidad;
IF COL_LENGTH(N'dbo.IA_Conversacion', N'IdIdentidad') IS NOT NULL ALTER TABLE dbo.IA_Conversacion DROP COLUMN IdIdentidad;
IF OBJECT_ID(N'dbo.IA_IdentidadAuditoria', N'U') IS NOT NULL DROP TABLE dbo.IA_IdentidadAuditoria;
IF OBJECT_ID(N'dbo.IA_IdentidadUsuario', N'U') IS NOT NULL DROP TABLE dbo.IA_IdentidadUsuario;

-- IA_Conversacion: quitar lo agregado y devolver IdUsuario a INT (tabla vacia garantizada por la guarda)
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_IA_Conversacion_Bloqueo' AND parent_object_id = OBJECT_ID(N'dbo.IA_Conversacion'))
    ALTER TABLE dbo.IA_Conversacion DROP CONSTRAINT CK_IA_Conversacion_Bloqueo;
IF COL_LENGTH(N'dbo.IA_Conversacion', N'BloqueoExpira')      IS NOT NULL ALTER TABLE dbo.IA_Conversacion DROP COLUMN BloqueoExpira;
IF COL_LENGTH(N'dbo.IA_Conversacion', N'BloqueoPropietario') IS NOT NULL ALTER TABLE dbo.IA_Conversacion DROP COLUMN BloqueoPropietario;
IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = N'DF_IA_Conversacion_UltimaSecuencia')
    ALTER TABLE dbo.IA_Conversacion DROP CONSTRAINT DF_IA_Conversacion_UltimaSecuencia;
IF COL_LENGTH(N'dbo.IA_Conversacion', N'UltimaSecuencia')    IS NOT NULL ALTER TABLE dbo.IA_Conversacion DROP COLUMN UltimaSecuencia;
IF COL_LENGTH(N'dbo.IA_Conversacion', N'Modulo')             IS NOT NULL ALTER TABLE dbo.IA_Conversacion DROP COLUMN Modulo;
GO

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.IA_Conversacion') AND name = N'IdUsuario' AND TYPE_NAME(user_type_id) = N'nvarchar')
BEGIN
    IF EXISTS (SELECT 1 FROM dbo.IA_Conversacion) THROW 51003, 'REVERSION ABORTADA: IA_Conversacion tiene filas.', 1;
    IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_IA_Conversacion_Usuario' AND object_id = OBJECT_ID(N'dbo.IA_Conversacion'))
        DROP INDEX IX_IA_Conversacion_Usuario ON dbo.IA_Conversacion;
    ALTER TABLE dbo.IA_Conversacion ALTER COLUMN IdUsuario INT NOT NULL;
    CREATE INDEX IX_IA_Conversacion_Usuario ON dbo.IA_Conversacion (IdUsuario, FechaUltimoMensaje DESC);
END;
GO

SET NOEXEC OFF;
GO
