:on error exit
-- GUARDA DE BASE: la base destino es JC_Db. Si la base ACTIVA no es esa, el script no hace nada.
DECLARE @BaseDestino SYSNAME = N'JC_Db';
IF DB_NAME() <> @BaseDestino
BEGIN
    RAISERROR(N'Guarda de base: la base activa no es la base destino (@BaseDestino). No se ejecuto nada.', 16, 1);
    SET NOEXEC ON;
END
GO
/* ============================================================================
   CJ INTELLIGENCE - ESQUEMA (script 18). PROPUESTA, NO EJECUTADA.
   Ver docs/CJ_INTELLIGENCE_DISENO.md. Ejecutar con sqlcmd (la primera linea ":on error exit" detiene el
   script ante el primer error; en SSMS activar el modo SQLCMD).

   CAMBIOS SOBRE OBJETOS EXISTENTES (todos sobre tablas VACIAS y sin otros consumidores, verificado 2026-11-01):
   1. IA_Conversacion.IdUsuario: INT -> NVARCHAR(50) NOT NULL.
      Justificacion: Usuario.IdUsuario (clave primaria real de dbo.Usuario) es el NOMBRE de usuario (texto);
      los 328 valores son no numericos. Usuario.Id (INT) no es identity, no tiene restriccion de unicidad y
      existe un valor 0: no sirve como clave de propiedad. Se aborta si la tabla tiene filas.
      Se recrea IX_IA_Conversacion_Usuario (unico indice que incluye la columna).
   2. IA_AuditoriaConsulta: ADD UsuarioLogin NVARCHAR(100) NULL (aditivo). La columna INT IdUsuario queda sin uso (NULL).
      Justificacion: por la misma razon no puede guardar el usuario; no se cambia su tipo para no alterar la
      forma existente de la tabla de auditoria.
   3. IA_Conversacion: ADD Modulo, UltimaSecuencia, BloqueoPropietario, BloqueoExpira (+ CHECK de coherencia).
   4. IA_Mensaje: ADD IdTurno, Secuencia, FinishReason, DuracionModeloMs (+ FK, 2 indices unicos filtrados).
   5. IA_Conversacion: ADD IdIdentidad (identidad permanente del propietario; FK a IA_IdentidadUsuario; inmutable por trigger).
   TABLAS NUEVAS: IA_Turno, IA_ConversacionEstado, IA_ResultadoConsulta, IA_IdentidadUsuario, IA_IdentidadAuditoria.
   NO TOCA: Planilla, Seg*, Usuario, IaToolPermiso, IaChatAuditoria, sp_IA_Planilla_Buscar, ningun otro objeto del ERP
   ni del chat anterior (que no usa ninguna de estas tablas).

   MODELO (sin vinculos circulares: todo apunta hacia IA_Turno / IA_Conversacion)
     IA_Conversacion  1---N  IA_Turno          (un turno = una peticion, con ClientMessageId unico)
     IA_Turno         1---N  IA_Mensaje        (como maximo 1 'user' y 1 'assistant' por turno)
     IA_Turno         1---N  IA_ResultadoConsulta (una fila por llamada a herramienta)
     IA_ResultadoConsulta N---1 IA_AuditoriaConsulta (IdAuditoria, opcional)
     IA_Conversacion  1---1  IA_ConversacionEstado
   ORDEN ESTABLE: IA_Conversacion.UltimaSecuencia (incremento atomico) -> IA_Mensaje.Secuencia, indice unico.
   IDEMPOTENCIA: IA_Turno.IdUsuario + indice unico (IdUsuario, ClientMessageId): un identificador de peticion pertenece a UNA conversacion
   y a UN contenido; reutilizarlo con otro contenido o en otra conversacion es un conflicto (409), nunca se reproduce en silencio.
   IDENTIDAD PERMANENTE (control de reutilizacion de logins): IA_IdentidadUsuario registra, por cada login que usa el modulo, una
   identidad (GUID) con la HUELLA de la persona a la que pertenecia: dbo.Usuario.IdEmpleado + hash del documento (EmpleadoCj.IdDocumento/NroDocumento). Si el mismo login pasa a otra persona
   (login eliminado y reutilizado, o fila reasignada), la huella ya no coincide y fn_IA_Cj_UsuarioValido devuelve NULL: el login queda
   DENEGADO en todas las operaciones y NO hereda el historial. Solo un administrador lo resuelve (sp_IA_Cj_Identidad_Resolver, sin EXECUTE
   para cj_ia). No modifica dbo.Usuario ni reasigna conversaciones por si sola. Cada conversacion queda ligada para siempre a la
   identidad con la que nacio (IdIdentidad); cada CONTINUAR/SEPARAR queda en IA_IdentidadAuditoria. Ver docs/CJ_INTELLIGENCE_IDENTIDAD.md.
   PERMISOS VIGENTES: IA_ResultadoConsulta guarda el alcance aplicado (nivel + empleados + totales globales) para que el backend
   compruebe, antes de devolver o enviar al modelo una respuesta/resumen/resultado guardado, que sigue dentro de los permisos actuales.

   DEPENDENCIAS: dbo.IA_Conversacion, dbo.IA_Mensaje, dbo.IA_AuditoriaConsulta con la estructura verificada.
   IDEMPOTENTE. Pre-chequeo: aborta si la forma de las tablas base no es la esperada.
   REVERSION: 18b_CjIntelligence_Reversion_PreUso.sql (solo antes de existir datos reales).
   ============================================================================ */
SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

-- 0. PRE-CHEQUEO
IF OBJECT_ID(N'dbo.IA_Conversacion', N'U') IS NULL OR OBJECT_ID(N'dbo.IA_Mensaje', N'U') IS NULL
   OR OBJECT_ID(N'dbo.IA_AuditoriaConsulta', N'U') IS NULL OR OBJECT_ID(N'dbo.Usuario', N'U') IS NULL
    THROW 51000, 'Pre-chequeo: faltan IA_Conversacion, IA_Mensaje, IA_AuditoriaConsulta o Usuario.', 1;

IF COL_LENGTH(N'dbo.IA_Conversacion', N'IdConversacion') IS NULL OR COL_LENGTH(N'dbo.IA_Conversacion', N'IdUsuario') IS NULL
   OR COL_LENGTH(N'dbo.IA_Conversacion', N'Titulo') IS NULL OR COL_LENGTH(N'dbo.IA_Conversacion', N'FechaUltimoMensaje') IS NULL
   OR COL_LENGTH(N'dbo.IA_Conversacion', N'IdActivo') IS NULL
   OR COL_LENGTH(N'dbo.IA_Mensaje', N'IdMensaje') IS NULL OR COL_LENGTH(N'dbo.IA_Mensaje', N'IdConversacion') IS NULL
   OR COL_LENGTH(N'dbo.IA_Mensaje', N'Rol') IS NULL OR COL_LENGTH(N'dbo.IA_Mensaje', N'Contenido') IS NULL
    THROW 51001, 'Pre-chequeo: IA_Conversacion o IA_Mensaje no tienen las columnas esperadas.', 1;
GO

-- 1. IA_Conversacion.IdUsuario INT -> NVARCHAR(50) (solo con la tabla vacia)
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.IA_Conversacion') AND name = N'IdUsuario' AND TYPE_NAME(user_type_id) = N'int')
BEGIN
    IF EXISTS (SELECT 1 FROM dbo.IA_Conversacion)
        THROW 51002, 'IA_Conversacion tiene filas: no se cambia el tipo de IdUsuario. Revisar antes de continuar.', 1;

    IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_IA_Conversacion_Usuario' AND object_id = OBJECT_ID(N'dbo.IA_Conversacion'))
        DROP INDEX IX_IA_Conversacion_Usuario ON dbo.IA_Conversacion;

    ALTER TABLE dbo.IA_Conversacion ALTER COLUMN IdUsuario NVARCHAR(50) NOT NULL;

    CREATE INDEX IX_IA_Conversacion_Usuario ON dbo.IA_Conversacion (IdUsuario, FechaUltimoMensaje DESC);
END;
GO

-- 2. IA_AuditoriaConsulta: usuario por nombre de usuario (aditivo)
IF COL_LENGTH(N'dbo.IA_AuditoriaConsulta', N'UsuarioLogin') IS NULL
    ALTER TABLE dbo.IA_AuditoriaConsulta ADD UsuarioLogin NVARCHAR(100) NULL;
GO

-- 3. IA_Conversacion: modulo, secuencia, bloqueo
IF COL_LENGTH(N'dbo.IA_Conversacion', N'Modulo') IS NULL
    ALTER TABLE dbo.IA_Conversacion ADD Modulo VARCHAR(30) NULL;
IF COL_LENGTH(N'dbo.IA_Conversacion', N'UltimaSecuencia') IS NULL
    ALTER TABLE dbo.IA_Conversacion ADD UltimaSecuencia INT NOT NULL CONSTRAINT DF_IA_Conversacion_UltimaSecuencia DEFAULT (0);
IF COL_LENGTH(N'dbo.IA_Conversacion', N'BloqueoPropietario') IS NULL
    ALTER TABLE dbo.IA_Conversacion ADD BloqueoPropietario UNIQUEIDENTIFIER NULL;
IF COL_LENGTH(N'dbo.IA_Conversacion', N'BloqueoExpira') IS NULL
    ALTER TABLE dbo.IA_Conversacion ADD BloqueoExpira DATETIME2(7) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_IA_Conversacion_Bloqueo' AND parent_object_id = OBJECT_ID(N'dbo.IA_Conversacion'))
    ALTER TABLE dbo.IA_Conversacion ADD CONSTRAINT CK_IA_Conversacion_Bloqueo
        CHECK ((BloqueoPropietario IS NULL AND BloqueoExpira IS NULL) OR (BloqueoPropietario IS NOT NULL AND BloqueoExpira IS NOT NULL));
GO

-- 4. IA_Turno
IF OBJECT_ID(N'dbo.IA_Turno', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.IA_Turno
    (
        IdTurno           BIGINT IDENTITY(1, 1) NOT NULL CONSTRAINT PK_IA_Turno PRIMARY KEY,
        IdConversacion    UNIQUEIDENTIFIER NOT NULL,
        IdUsuario         NVARCHAR(50) NOT NULL,               -- nombre de usuario canonico (copia del propietario de la conversacion)
        ClientMessageId   UNIQUEIDENTIFIER NOT NULL,           -- OBLIGATORIO; lo genera el navegador; unico POR USUARIO
        Estado            VARCHAR(15) NOT NULL,                -- PROCESANDO | COMPLETADO | ERROR | INTERRUMPIDO
        Intentos          TINYINT NOT NULL CONSTRAINT DF_IA_Turno_Intentos DEFAULT (1),
        FechaInicio       DATETIME2(7) NOT NULL CONSTRAINT DF_IA_Turno_FechaInicio DEFAULT (SYSUTCDATETIME()),
        FechaUltimoLatido DATETIME2(7) NOT NULL CONSTRAINT DF_IA_Turno_FechaUltimoLatido DEFAULT (SYSUTCDATETIME()),
        FechaFin          DATETIME2(7) NULL,
        Error             NVARCHAR(500) NULL,                  -- mensaje corto, sin datos de negocio ni secretos
        CONSTRAINT CK_IA_Turno_Estado CHECK (Estado IN ('PROCESANDO', 'COMPLETADO', 'ERROR', 'INTERRUMPIDO')),
        CONSTRAINT CK_IA_Turno_Intentos CHECK (Intentos BETWEEN 1 AND 10),
        CONSTRAINT FK_IA_Turno_Conversacion FOREIGN KEY (IdConversacion) REFERENCES dbo.IA_Conversacion (IdConversacion)
    );

    -- Idempotencia GLOBAL por usuario: el mismo ClientMessageId no puede usarse en dos conversaciones ni con otro contenido.
    CREATE UNIQUE INDEX UX_IA_Turno_Usuario_ClientMessage ON dbo.IA_Turno (IdUsuario, ClientMessageId);
    CREATE INDEX IX_IA_Turno_Conversacion_Estado ON dbo.IA_Turno (IdConversacion, Estado) INCLUDE (IdTurno);
END;
GO

-- 5. IA_Mensaje: orden, vinculo al turno y metadatos
IF COL_LENGTH(N'dbo.IA_Mensaje', N'IdTurno') IS NULL
    ALTER TABLE dbo.IA_Mensaje ADD IdTurno BIGINT NULL;
IF COL_LENGTH(N'dbo.IA_Mensaje', N'Secuencia') IS NULL
    ALTER TABLE dbo.IA_Mensaje ADD Secuencia INT NULL;
IF COL_LENGTH(N'dbo.IA_Mensaje', N'FinishReason') IS NULL
    ALTER TABLE dbo.IA_Mensaje ADD FinishReason VARCHAR(30) NULL;
IF COL_LENGTH(N'dbo.IA_Mensaje', N'DuracionModeloMs') IS NULL
    ALTER TABLE dbo.IA_Mensaje ADD DuracionModeloMs INT NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_IA_Mensaje_Turno')
    ALTER TABLE dbo.IA_Mensaje ADD CONSTRAINT FK_IA_Mensaje_Turno FOREIGN KEY (IdTurno) REFERENCES dbo.IA_Turno (IdTurno);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_IA_Mensaje_Conversacion_Secuencia' AND object_id = OBJECT_ID(N'dbo.IA_Mensaje'))
    CREATE UNIQUE INDEX UX_IA_Mensaje_Conversacion_Secuencia ON dbo.IA_Mensaje (IdConversacion, Secuencia) WHERE Secuencia IS NOT NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_IA_Mensaje_Turno_Rol' AND object_id = OBJECT_ID(N'dbo.IA_Mensaje'))
    CREATE UNIQUE INDEX UX_IA_Mensaje_Turno_Rol ON dbo.IA_Mensaje (IdTurno, Rol) WHERE IdTurno IS NOT NULL AND Rol IN ('user', 'assistant');
GO

-- 6. IA_ConversacionEstado
IF OBJECT_ID(N'dbo.IA_ConversacionEstado', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.IA_ConversacionEstado
    (
        IdConversacion         UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_IA_ConversacionEstado PRIMARY KEY,
        Version                INT NOT NULL CONSTRAINT DF_IA_ConversacionEstado_Version DEFAULT (0),
        EstadoJson             NVARCHAR(MAX) NOT NULL CONSTRAINT DF_IA_ConversacionEstado_Json DEFAULT (N'{}'),
        Resumen                NVARCHAR(MAX) NULL,
        ResumenHastaSecuencia  INT NULL,
        FechaActualizacion     DATETIME2(7) NOT NULL CONSTRAINT DF_IA_ConversacionEstado_Fecha DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT CK_IA_ConversacionEstado_Json CHECK (ISJSON(EstadoJson) = 1),
        CONSTRAINT FK_IA_ConversacionEstado_Conversacion FOREIGN KEY (IdConversacion) REFERENCES dbo.IA_Conversacion (IdConversacion)
    );
END;
GO

-- 7. IA_ResultadoConsulta
IF OBJECT_ID(N'dbo.IA_ResultadoConsulta', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.IA_ResultadoConsulta
    (
        IdResultado      BIGINT IDENTITY(1, 1) NOT NULL CONSTRAINT PK_IA_ResultadoConsulta PRIMARY KEY,
        IdConversacion   UNIQUEIDENTIFIER NOT NULL,
        IdTurno          BIGINT NOT NULL,
        Intento          TINYINT NOT NULL,
        Orden            SMALLINT NOT NULL,
        Herramienta      VARCHAR(100) NOT NULL,
        ArgumentosJson   NVARCHAR(MAX) NOT NULL,               -- argumentos YA validados y normalizados por el backend
        AlcanceNivel     VARCHAR(12) NOT NULL,                 -- PROPIO | EQUIPO | TOTAL | DENEGADO (el APLICADO por SQL)
        AlcanceHash      CHAR(64) NULL,                        -- SHA-256 del conjunto de empleados APLICADO
        AlcanceEmpleados NVARCHAR(MAX) NULL,                   -- "1,2,3" (EmpleadoCj.IdEmpleado) aplicado por SQL; NULL si TOTAL. Permite comprobar
                                                               -- despues si el resultado SIGUE dentro de los permisos vigentes del usuario
        UsaTotalesGlobales BIT NOT NULL CONSTRAINT DF_IA_ResultadoConsulta_Globales DEFAULT (0),  -- 1 si el resultado requirio totales globales
        Estado           VARCHAR(10) NOT NULL,                 -- OK | ERROR | BLOQUEADO
        FechaConsulta    DATETIME2(7) NOT NULL CONSTRAINT DF_IA_ResultadoConsulta_Fecha DEFAULT (SYSUTCDATETIME()),
        Filas            INT NULL,
        FilasEnviadas    INT NULL,
        Truncado         BIT NOT NULL CONSTRAINT DF_IA_ResultadoConsulta_Truncado DEFAULT (0),
        TotalesJson      NVARCHAR(MAX) NULL,                   -- totales POR MONEDA (sin conversion)
        ResumenJson      NVARCHAR(MAX) NULL,                   -- lo entregado al modelo (compacto)
        HashResultado    CHAR(64) NULL,                        -- SHA-256 de ResumenJson
        DuracionSqlMs    INT NULL,
        Error            NVARCHAR(500) NULL,
        IdAuditoria      BIGINT NULL,
        CONSTRAINT CK_IA_ResultadoConsulta_Estado CHECK (Estado IN ('OK', 'ERROR', 'BLOQUEADO')),
        CONSTRAINT CK_IA_ResultadoConsulta_TotalesJson CHECK (TotalesJson IS NULL OR ISJSON(TotalesJson) = 1),
        CONSTRAINT CK_IA_ResultadoConsulta_ResumenJson CHECK (ResumenJson IS NULL OR ISJSON(ResumenJson) = 1),
        CONSTRAINT CK_IA_ResultadoConsulta_ArgsJson CHECK (ISJSON(ArgumentosJson) = 1),
        CONSTRAINT FK_IA_ResultadoConsulta_Conversacion FOREIGN KEY (IdConversacion) REFERENCES dbo.IA_Conversacion (IdConversacion),
        CONSTRAINT FK_IA_ResultadoConsulta_Turno FOREIGN KEY (IdTurno) REFERENCES dbo.IA_Turno (IdTurno),
        CONSTRAINT FK_IA_ResultadoConsulta_Auditoria FOREIGN KEY (IdAuditoria) REFERENCES dbo.IA_AuditoriaConsulta (Id)
    );

    CREATE UNIQUE INDEX UX_IA_ResultadoConsulta_Turno_Intento_Orden ON dbo.IA_ResultadoConsulta (IdTurno, Intento, Orden);
    CREATE INDEX IX_IA_ResultadoConsulta_Conversacion_Fecha ON dbo.IA_ResultadoConsulta (IdConversacion, FechaConsulta DESC);
END;
GO

-- 8. IA_IdentidadUsuario (control de reutilizacion de logins; ver el encabezado y el script 19)
-- Huella = IdEmpleado + HuellaDocumento (SHA-256 de IdDocumento:NroDocumento normalizado, de EmpleadoCj). IdEmpleado SOLO no basta: se genera con
-- MAX+1 y puede cambiar (reingreso) o repetirse; el documento identifica a la persona. dbo.Usuario.Id NO sirve (no es identity, no es unico, existe un 0).
-- Collation explicita = la de dbo.Usuario.IdUsuario para que las comparaciones no choquen.
IF OBJECT_ID(N'dbo.IA_IdentidadUsuario', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.IA_IdentidadUsuario
    (
        IdIdentidad        UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_IA_IdentidadUsuario PRIMARY KEY CONSTRAINT DF_IA_IdentidadUsuario_Id DEFAULT (NEWID()),
        IdUsuario          NVARCHAR(50) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,   -- login canonico al registrarse
        IdEmpleado         INT NOT NULL,                                                 -- huella: dbo.Usuario.IdEmpleado al registrarse (o al CONTINUAR)
        HuellaDocumento    CHAR(64) NOT NULL,                                            -- huella: SHA-256 (hex) del documento de la persona; sin huella valida no hay identidad
        Estado             VARCHAR(10) NOT NULL CONSTRAINT DF_IA_IdentidadUsuario_Estado DEFAULT ('VIGENTE'),
        FechaAlta          DATETIME2(7) NOT NULL CONSTRAINT DF_IA_IdentidadUsuario_Alta DEFAULT (SYSUTCDATETIME()),
        Resolucion         VARCHAR(10) NULL,                                             -- CONTINUAR | SEPARAR (solo si un administrador resolvio un conflicto)
        IdEmpleadoAnterior INT NULL,
        ResueltaPor        NVARCHAR(100) NULL,
        FechaResolucion    DATETIME2(7) NULL,
        Motivo             NVARCHAR(500) NULL,
        CONSTRAINT CK_IA_IdentidadUsuario_Estado CHECK (Estado IN ('VIGENTE', 'RETIRADA')),
        CONSTRAINT CK_IA_IdentidadUsuario_Resolucion CHECK (Resolucion IS NULL OR Resolucion IN ('CONTINUAR', 'SEPARAR'))
    );

    -- una sola identidad VIGENTE por login
    CREATE UNIQUE INDEX UX_IA_IdentidadUsuario_Vigente ON dbo.IA_IdentidadUsuario (IdUsuario) WHERE Estado = 'VIGENTE';
END;
GO

-- 9. IA_IdentidadAuditoria: registro permanente de cada CONTINUAR / SEPARAR (quien, cuando, por que y valores antes/despues)
IF OBJECT_ID(N'dbo.IA_IdentidadAuditoria', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.IA_IdentidadAuditoria
    (
        IdAuditoria           BIGINT IDENTITY(1, 1) NOT NULL CONSTRAINT PK_IA_IdentidadAuditoria PRIMARY KEY,
        FechaUtc              DATETIME2(7) NOT NULL CONSTRAINT DF_IA_IdentidadAuditoria_Fecha DEFAULT (SYSUTCDATETIME()),
        IdUsuario             NVARCHAR(50) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
        Accion                VARCHAR(10) NOT NULL,
        AdminSql              NVARCHAR(128) NOT NULL,                  -- ORIGINAL_LOGIN(): el login SQL real que ejecuto la resolucion
        AprobadoPor           NVARCHAR(100) NOT NULL,                  -- quien aprobo (declarado por el administrador)
        Motivo                NVARCHAR(500) NOT NULL,
        Evidencia             NVARCHAR(1000) NOT NULL,                 -- como se comprobo que es / no es la misma persona
        IdIdentidadAnterior   UNIQUEIDENTIFIER NOT NULL,
        IdIdentidadPosterior  UNIQUEIDENTIFIER NOT NULL,               -- = anterior en CONTINUAR; la nueva en SEPARAR
        IdEmpleadoAnterior    INT NULL,
        HuellaDocAnterior     CHAR(64) NULL,
        IdEmpleadoPosterior   INT NULL,
        HuellaDocPosterior    CHAR(64) NULL,
        ConversacionesArchivadas INT NOT NULL CONSTRAINT DF_IA_IdentidadAuditoria_Conv DEFAULT (0),
        TurnosArchivados      INT NOT NULL CONSTRAINT DF_IA_IdentidadAuditoria_Turnos DEFAULT (0),
        CONSTRAINT CK_IA_IdentidadAuditoria_Accion CHECK (Accion IN ('CONTINUAR', 'SEPARAR'))
    );

    CREATE INDEX IX_IA_IdentidadAuditoria_Usuario ON dbo.IA_IdentidadAuditoria (IdUsuario, FechaUtc DESC);
END;
GO

-- 10. IA_Conversacion.IdIdentidad: cada conversacion queda ligada PARA SIEMPRE a la identidad con la que nacio.
-- Tabla vacia garantizada (se verifico; si hubiera filas, se aborta: no se atribuyen conversaciones existentes a nadie).
IF COL_LENGTH(N'dbo.IA_Conversacion', N'IdIdentidad') IS NULL
BEGIN
    IF EXISTS (SELECT 1 FROM dbo.IA_Conversacion)
        THROW 51003, 'IA_Conversacion tiene filas: no se les atribuye una identidad. Revisar antes de continuar.', 1;
    ALTER TABLE dbo.IA_Conversacion ADD IdIdentidad UNIQUEIDENTIFIER NULL;
END;
GO
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.IA_Conversacion') AND name = N'IdIdentidad' AND is_nullable = 1)
    ALTER TABLE dbo.IA_Conversacion ALTER COLUMN IdIdentidad UNIQUEIDENTIFIER NOT NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_IA_Conversacion_Identidad')
    ALTER TABLE dbo.IA_Conversacion ADD CONSTRAINT FK_IA_Conversacion_Identidad FOREIGN KEY (IdIdentidad) REFERENCES dbo.IA_IdentidadUsuario (IdIdentidad);
GO

-- Disparador de inmutabilidad: IdIdentidad no cambia nunca; IdUsuario solo cambia con la marca de sesion que activa sp_IA_Cj_Identidad_Resolver.
-- Es una PROTECCION CONTRA ACTUALIZACIONES ACCIDENTALES: NO demuestra que solo Resolver pueda establecer la marca (cualquier sesion con permiso
-- puede llamar a sp_set_session_context). Una manipulacion deliberada no devolveria el historial de todos modos: IdIdentidad es inmutable y toda
-- operacion exige la identidad VIGENTE del login.
CREATE OR ALTER TRIGGER dbo.TR_IA_Conversacion_Identidad ON dbo.IA_Conversacion AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF UPDATE(IdIdentidad)
        THROW 51080, 'IA_Conversacion.IdIdentidad es inmutable.', 1;
    IF UPDATE(IdUsuario) AND ISNULL(TRY_CONVERT(INT, SESSION_CONTEXT(N'cjia_resolver')), 0) <> 1
        THROW 51081, 'IA_Conversacion.IdUsuario solo cambia con sp_IA_Cj_Identidad_Resolver.', 1;
END;
GO

SET NOEXEC OFF;
GO
