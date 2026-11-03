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
   CJ INTELLIGENCE - FUNCION Y PROCEDIMIENTOS (script 19). PROPUESTA, NO EJECUTADA.
   Requiere el script 18. Todo es nuevo (prefijos sp_IA_Cj_ / fn_IA_Cj_); nada reemplaza un objeto existente.
   NO modifica sp_IA_Planilla_Buscar: lo invoca desde sp_IA_Cj_Pagos_Buscar.

   IDENTIDAD. El usuario es SIEMPRE el nombre de usuario (dbo.Usuario.IdUsuario, texto, clave primaria),
   tal como llega en el claim "IdUsuario" del JWT. fn_IA_Cj_UsuarioValido lo valida contra dbo.Usuario:
   existe exactamente una fila Y IdEstado = 1 (decision confirmada: 1 = activo, 0 = inactivo). Usuario inexistente,
   inactivo, con IdEstado NULL o ambiguo => NULL y TODO se deniega, aunque conserve roles o permisos.
   La condicion se evalua en CADA operacion: las de conversacion (via @IdUsuario) y las que dependen de un token
   (renovar, registrar resultado, guardar estado, completar) la comprueban sobre el propietario de la conversacion,
   de modo que un usuario desactivado a mitad de un turno ya no puede seguir escribiendo.
   Ningun procedimiento recibe un id numerico ni una lista de empleados del llamador.

   IDENTIDAD PERMANENTE (control de reutilizacion de logins). El nombre de usuario puede reutilizarse (un login eliminado y recreado, o la
   fila de dbo.Usuario reapuntada a otra persona al aprobar un empleado). La HUELLA de la persona es IdEmpleado + hash del DOCUMENTO
   (Usuario -> Empleado -> EmpleadoCj.IdDocumento/NroDocumento; la misma cadena que usa el alcance). IdEmpleado SOLO no basta: se genera con
   MAX+1, no hay clave unica en Empleado, cambia con el reingreso y puede repetirse si se elimina la ultima fila (ver docs).
     fn_IA_Cj_Huella(login)           huella actual; SIN FILAS si falta algun dato (IdEmpleado <= 0, empleado repetido, sin documento): no hay identidad
                                      confiable y el login queda DENEGADO (no se registra ninguna identidad).
     fn_IA_Cj_UsuarioValido           exige IdEstado = 1, huella valida y, si el login ya tiene identidad VIGENTE, que IdEmpleado Y documento coincidan.
     sp_IA_Cj_Identidad_Asegurar      (interno) registra la primera huella al crear la primera conversacion y devuelve el IdIdentidad.
   Cada conversacion guarda IdIdentidad (inmutable, FK): las anteriores y las nuevas quedan identificadas para siempre. TODAS las
   operaciones exigen ademas que IdIdentidad sea la identidad VIGENTE del login (fn_IA_Cj_IdentidadVigente).
   Si la huella cambia, el login queda DENEGADO en TODAS las operaciones hasta que un administrador lo resuelva con sp_IA_Cj_Identidad_Resolver
   (exige aprobador, motivo y evidencia; queda en IA_IdentidadAuditoria con el login SQL real y los valores antes/despues):
     CONTINUAR = SOLO si el documento NO cambio (misma persona por documento; p. ej. reingreso con otro IdEmpleado) y el administrador lo confirma
                 con evidencia; si el documento cambio se rechaza (51074) y solo cabe SEPARAR. Conserva el historial.
     SEPARAR   = es otra persona: el historial anterior se archiva sin borrar (IdUsuario = '~retirada:<guid>' y, ademas, conserva su IdIdentidad
                 RETIRADA, que ningun login puede igualar) y el login recibe una identidad nueva y vacia. El disparador TR_IA_Conversacion_Identidad
                 protege contra actualizaciones ACCIDENTALES (no es prueba de que solo Resolver pueda activar la marca: cualquier sesion con permiso puede llamar a
                 sp_set_session_context; la defensa real contra una manipulacion deliberada es IdIdentidad y los permisos).
   Ninguno se concede a cj_ia, ninguno se ejecuta solo y ninguno toca dbo.Usuario. vw_IA_Cj_Identidad_Conflicto lista los conflictos pendientes.

   ALCANCE EN SQL. sp_IA_Cj_Autorizacion_Alcance deriva, a partir del usuario validado y de sus concesiones
   vigentes en IaToolPermiso, el nivel aplicable y la lista de empleados (Usuario -> Empleado -> EmpleadoCj;
   equipo = titular + subordinados directos de EmpleadoCjDetalle). sp_IA_Cj_Pagos_Buscar la usa y NO acepta
   lista de empleados: lo que llegue del backend no puede ampliar ni cambiar a quienes se consulta.
   El backend recibe de vuelta lo aplicado (OUTPUT) y falla cerrado si difiere de lo que el esperaba.

   ELEVACION DE PRIVILEGIOS (diseno objetivo: FIRMA CON CERTIFICADO; docs/CJ_INTELLIGENCE_DECISIONES_PENDIENTES.md, secc. 4):
   sp_IA_Cj_Pagos_Buscar se crea SIN "EXECUTE AS OWNER". El script 20c lo FIRMA con el certificado cert_cj_ia_pagos, cuyo
   usuario (sin login) tiene SELECT solo sobre las 8 tablas del SQL dinamico de sp_IA_Planilla_Buscar. IMPORTANTE:
   cada CREATE OR ALTER / ALTER de ese procedimiento ELIMINA la firma. Despues de ejecutar este script hay que ejecutar
   20c (idempotente) y validar con 21b. Sin firma, el modo RESUMEN falla con permiso denegado (no hay respaldo permisivo).

   BLOQUEO POR CONVERSACION (IA_Conversacion.BloqueoPropietario / BloqueoExpira):
   - Adquisicion atomica en sp_IA_Cj_Turno_Iniciar (UPDLOCK + HOLDLOCK dentro de una transaccion).
   - Propietario = GUID generado por el backend por CADA solicitud (cada reintento, uno nuevo).
   - Solo escribe (resultados, estado, respuesta, cierre) quien es propietario Y no expiro: si otra solicitud
     adquirio el bloqueo, su token ya no coincide (THROW 51050); la liberacion es condicionada al token.
   - Latido: sp_IA_Cj_Turno_Renovar extiende el bloqueo mientras dura la llamada larga (ver diseno, seccion 4).

   ATOMICIDAD DE LAS ESCRITURAS: los procedimientos que escriben bajo el bloqueo (resultado, estado, completar, fallar, renovar) abren una
   transaccion CORTA, toman la fila de la conversacion con UPDLOCK + HOLDLOCK, validan propietario/expiracion/usuario activo y escriben
   en la MISMA transaccion. Quien intente adquirir el bloqueo (sp_IA_Cj_Turno_Iniciar, que usa el mismo candado de fila) queda
   esperando hasta que esa transaccion termine: no existe un intervalo entre "validar" y "escribir" en el que otra solicitud pueda
   quedarse con el bloqueo. Ninguna llamada externa ocurre dentro de la transaccion.

   IDEMPOTENCIA: ClientMessageId es OBLIGATORIO y unico POR USUARIO (no por conversacion). Reutilizarlo con otro contenido
   (CONTENIDO_DISTINTO) o en otra conversacion (ID_REUTILIZADO) es un conflicto. El PRIMER mensaje (sin conversacion todavia) se inicia
   con sp_IA_Cj_Turno_IniciarNueva, que serializa por (usuario, ClientMessageId), reutiliza la conversacion ya creada si es un
   reintento y evita crear conversaciones duplicadas.

   RECUPERACION Y DUPLICADOS: ver docs/CJ_INTELLIGENCE_DISENO.md, seccion 4.

   DEPENDENCIAS: script 18; Usuario, Empleado, EmpleadoCj, EmpleadoCjDetalle, SegUsuarioPerfilRol, SegPerfilRol,
   SegPerfil, SegRol, IaToolPermiso (solo lectura).
   IDEMPOTENTE (CREATE OR ALTER). REVERSION: 18b (previa al uso) o DROP de cada objeto.
   ============================================================================ */
SET NOCOUNT ON;
GO

-- ===========================================================================
-- IDENTIDAD
-- ===========================================================================
-- Devuelve el IdUsuario CANONICO (tal como esta guardado en dbo.Usuario y como lo devuelve la autenticacion) SOLO si existe
-- exactamente UNA fila con ese nombre Y su IdEstado = 1 (activo). Usuario inexistente, ambiguo, con IdEstado 0, con IdEstado NULL
-- o con cualquier otro valor => NULL y todo se deniega. La comparacion de nombre usa la collation de la columna
-- (SQL_Latin1_General_CP1_CI_AS: no distingue mayusculas, SI distingue acentos), la misma que el login.
-- Condicion de estado confirmada por el responsable (1 = activo, 0 = inactivo); NO modifica estados ni la autenticacion general.
-- Sin acceso para cj_ia: solo se invoca desde los procedimientos de este script (encadenamiento de propiedad).
-- Huella ACTUAL de la persona detras de un login activo. Misma cadena que el alcance (Usuario -> Empleado -> EmpleadoCj). Sin filas si no hay
-- huella confiable: IdEmpleado <= 0, empleado legado repetido (Empleado no tiene clave unica), sin EmpleadoCj o sin documento.
-- El documento se normaliza (mayusculas, sin espacios, guiones ni puntos) y se guarda solo su SHA-256 junto con el tipo de documento.
CREATE OR ALTER FUNCTION dbo.fn_IA_Cj_Huella (@Login NVARCHAR(100))
RETURNS TABLE
AS
RETURN
(
    SELECT u.IdUsuario, u.IdEmpleado,
           CONVERT(CHAR(64), HASHBYTES('SHA2_256', CONCAT(ISNULL(CAST(cj.IdDocumento AS NVARCHAR(10)), N''), N':',
                  UPPER(REPLACE(REPLACE(REPLACE(LTRIM(RTRIM(cj.NroDocumento)), N' ', N''), N'-', N''), N'.', N'')))), 2) AS HuellaDocumento
    FROM dbo.Usuario u
    INNER JOIN dbo.Empleado e ON e.IdEmpleado = u.IdEmpleado
    INNER JOIN dbo.EmpleadoCj cj ON cj.IdEmpleado = e.IdEmpleadoCj
    WHERE u.IdUsuario = LTRIM(RTRIM(@Login)) AND u.IdEstado = 1 AND u.IdEmpleado > 0
      AND (SELECT COUNT(*) FROM dbo.Empleado e2 WHERE e2.IdEmpleado = u.IdEmpleado) = 1
      AND LTRIM(RTRIM(ISNULL(cj.NroDocumento, N''))) <> N''
);
GO

-- Identidad VIGENTE del login (NULL si no tiene). Usada por TODAS las operaciones sobre conversaciones.
CREATE OR ALTER FUNCTION dbo.fn_IA_Cj_IdentidadVigente (@Login NVARCHAR(100))
RETURNS UNIQUEIDENTIFIER
AS
BEGIN
    RETURN (SELECT i.IdIdentidad FROM dbo.IA_IdentidadUsuario i WHERE i.IdUsuario = LTRIM(RTRIM(@Login)) AND i.Estado = 'VIGENTE');
END;
GO

-- Devuelve el IdUsuario CANONICO (tal como esta guardado en dbo.Usuario y como lo devuelve la autenticacion) SOLO si existe
-- exactamente UNA fila con ese nombre Y su IdEstado = 1 (activo), tiene HUELLA valida y, si el login ya tiene identidad VIGENTE, la huella
-- (IdEmpleado y documento) sigue siendo la registrada. Usuario inexistente, ambiguo, inactivo, sin huella, con la huella cambiada o con
-- cualquier otro valor => NULL y todo se deniega. La comparacion de nombre usa la collation de la columna
-- (SQL_Latin1_General_CP1_CI_AS: no distingue mayusculas, SI distingue acentos), la misma que el login.
-- Condicion de estado confirmada por el responsable (1 = activo, 0 = inactivo); NO modifica estados ni la autenticacion general.
-- Sin acceso para cj_ia: solo se invoca desde los procedimientos de este script (encadenamiento de propiedad).
CREATE OR ALTER FUNCTION dbo.fn_IA_Cj_UsuarioValido (@IdUsuario NVARCHAR(100))
RETURNS NVARCHAR(50)
AS
BEGIN
    DECLARE @r NVARCHAR(50);
    SELECT @r = MIN(u.IdUsuario)
    FROM dbo.Usuario u
    CROSS APPLY dbo.fn_IA_Cj_Huella(u.IdUsuario) h               -- sin huella valida (sin filas) => el login no es valido
    WHERE u.IdUsuario = LTRIM(RTRIM(@IdUsuario)) AND u.IdEstado = 1
      AND u.IdEmpleado > 0
      AND u.IdUsuario NOT LIKE N'~%'                             -- el prefijo '~' esta reservado a los historiales archivados
      -- identidad permanente: si el login ya tiene identidad VIGENTE, IdEmpleado Y documento deben seguir siendo los registrados
      AND NOT EXISTS (SELECT 1 FROM dbo.IA_IdentidadUsuario i
                      WHERE i.IdUsuario = u.IdUsuario AND i.Estado = 'VIGENTE'
                        AND (i.IdEmpleado <> h.IdEmpleado OR i.HuellaDocumento <> h.HuellaDocumento))
    HAVING COUNT(*) = 1;
    RETURN @r;
END;
GO

-- ===========================================================================
-- IDENTIDAD PERMANENTE: registro (interno) y resolucion de conflictos (solo administrador). NINGUNO se concede a cj_ia.
-- ===========================================================================
-- Registra la PRIMERA huella: si el login no tiene identidad VIGENTE, la crea con la huella actual. Sin huella valida => THROW 51010 y NO crea nada.
-- Concurrente-seguro: bloqueo de rango + indice unico filtrado. Devuelve el IdIdentidad VIGENTE.
CREATE OR ALTER PROCEDURE dbo.sp_IA_Cj_Identidad_Asegurar
    @Login       NVARCHAR(50),
    @IdIdentidad UNIQUEIDENTIFIER OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    SET @IdIdentidad = NULL;
    DECLARE @ids TABLE (IdIdentidad UNIQUEIDENTIFIER);
    BEGIN TRAN;
    SELECT @IdIdentidad = i.IdIdentidad FROM dbo.IA_IdentidadUsuario i WITH (UPDLOCK, HOLDLOCK) WHERE i.IdUsuario = @Login AND i.Estado = 'VIGENTE';
    IF @IdIdentidad IS NULL
    BEGIN
        INSERT dbo.IA_IdentidadUsuario (IdUsuario, IdEmpleado, HuellaDocumento)
        OUTPUT inserted.IdIdentidad INTO @ids
        SELECT h.IdUsuario, h.IdEmpleado, h.HuellaDocumento FROM dbo.fn_IA_Cj_Huella(@Login) h;
        SELECT @IdIdentidad = IdIdentidad FROM @ids;
    END
    COMMIT;
    IF @IdIdentidad IS NULL
        THROW 51010, 'Sin huella valida para registrar la identidad: se deniega.', 1;
END;
GO

-- Resolucion de un conflicto de identidad. SOLO administrador (sin EXECUTE para cj_ia). Exige aprobador, motivo y evidencia.
CREATE OR ALTER PROCEDURE dbo.sp_IA_Cj_Identidad_Resolver
    @IdUsuario            NVARCHAR(100),
    @Accion               VARCHAR(10),             -- CONTINUAR | SEPARAR
    @AprobadoPor          NVARCHAR(100),
    @Motivo               NVARCHAR(500),
    @Evidencia            NVARCHAR(1000),          -- como se comprobo que es / no es la misma persona (acta, ticket, ficha de RRHH...)
    @ConfirmaMismaPersona BIT = 0                  -- CONTINUAR exige 1: confirmacion explicita de que es la MISMA PERSONA (no basta que sea el mismo login)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    SET @Accion = UPPER(NULLIF(LTRIM(RTRIM(@Accion)), ''));
    SET @AprobadoPor = NULLIF(LTRIM(RTRIM(@AprobadoPor)), N'');
    SET @Motivo = NULLIF(LTRIM(RTRIM(@Motivo)), N'');
    SET @Evidencia = NULLIF(LTRIM(RTRIM(@Evidencia)), N'');
    IF @Accion IS NULL OR @Accion NOT IN ('CONTINUAR', 'SEPARAR') THROW 51070, 'Accion invalida (CONTINUAR | SEPARAR).', 1;
    IF @AprobadoPor IS NULL OR @Motivo IS NULL THROW 51071, 'Se exige quien aprueba y el motivo.', 1;
    IF @Evidencia IS NULL OR LEN(@Evidencia) < 15 THROW 51071, 'Se exige la evidencia de la comprobacion (minimo 15 caracteres).', 1;
    IF @Accion = 'CONTINUAR' AND ISNULL(@ConfirmaMismaPersona, 0) <> 1 THROW 51075, 'CONTINUAR exige confirmar que es la MISMA PERSONA, no solo el mismo login.', 1;

    -- huella ACTUAL: sin ella no se puede resolver nada (corregir primero los datos del empleado; no se corrige aqui)
    DECLARE @Login NVARCHAR(50), @Emp INT, @Doc CHAR(64);
    SELECT @Login = h.IdUsuario, @Emp = h.IdEmpleado, @Doc = h.HuellaDocumento FROM dbo.fn_IA_Cj_Huella(LTRIM(RTRIM(@IdUsuario))) h;
    IF @Login IS NULL THROW 51072, 'El login no existe, no esta activo o no tiene huella valida (empleado/documento): no se puede resolver.', 1;

    DECLARE @IdIdentidad UNIQUEIDENTIFIER, @EmpReg INT, @DocReg CHAR(64), @Nueva UNIQUEIDENTIFIER, @Conv INT = 0, @Turnos INT = 0;

    -- La marca de sesion 'cjia_resolver' (proteccion contra actualizaciones ACCIDENTALES de IdUsuario; ver el disparador) se activa SOLO durante el
    -- archivado y se limpia SIEMPRE: al terminar bien y ante CUALQUIER error (sp_set_session_context no es transaccional: un ROLLBACK no la limpia).
    BEGIN TRY
        BEGIN TRAN;
        SELECT @IdIdentidad = i.IdIdentidad, @EmpReg = i.IdEmpleado, @DocReg = i.HuellaDocumento
        FROM dbo.IA_IdentidadUsuario i WITH (UPDLOCK, HOLDLOCK) WHERE i.IdUsuario = @Login AND i.Estado = 'VIGENTE';

        IF @IdIdentidad IS NULL OR (@EmpReg = @Emp AND @DocReg = @Doc)
            THROW 51073, 'No hay conflicto de identidad para este login: no se hace nada.', 1;

        IF @Accion = 'CONTINUAR'
        BEGIN
            -- misma persona = mismo documento. Si el documento cambio, NO se continua ni se reasigna el historial: es otra persona o un dato
            -- corregido que debe revisar un administrador; el login sigue denegado y solo cabe SEPARAR (accion explicita, nunca automatica).
            IF @DocReg <> @Doc
                THROW 51074, 'El documento de la persona cambio: no se puede CONTINUAR. Si es otra persona, use SEPARAR.', 1;

            UPDATE dbo.IA_IdentidadUsuario
            SET IdEmpleadoAnterior = IdEmpleado, IdEmpleado = @Emp, Resolucion = 'CONTINUAR',
                ResueltaPor = @AprobadoPor, FechaResolucion = SYSUTCDATETIME(), Motivo = @Motivo
            WHERE IdIdentidad = @IdIdentidad;
            SET @Nueva = @IdIdentidad;
        END
        ELSE
        BEGIN
            -- SEPARAR: el historial anterior no se borra. Se archiva bajo un propietario inalcanzable Y conserva su IdIdentidad (que pasa a RETIRADA).
            DECLARE @Archivo NVARCHAR(50) = N'~retirada:' + LOWER(CONVERT(NVARCHAR(36), @IdIdentidad));
            EXEC sp_set_session_context @key = N'cjia_resolver', @value = 1;
            UPDATE dbo.IA_Conversacion SET IdUsuario = @Archivo WHERE IdUsuario = @Login AND IdIdentidad = @IdIdentidad;
            SET @Conv = @@ROWCOUNT;
            UPDATE dbo.IA_Turno SET IdUsuario = @Archivo WHERE IdUsuario = @Login AND IdConversacion IN (SELECT IdConversacion FROM dbo.IA_Conversacion WHERE IdIdentidad = @IdIdentidad);
            SET @Turnos = @@ROWCOUNT;
            EXEC sp_set_session_context @key = N'cjia_resolver', @value = NULL;     -- fin del archivado: la marca se limpia de inmediato

            UPDATE dbo.IA_IdentidadUsuario
            SET Estado = 'RETIRADA', IdEmpleadoAnterior = IdEmpleado, Resolucion = 'SEPARAR',
                ResueltaPor = @AprobadoPor, FechaResolucion = SYSUTCDATETIME(), Motivo = @Motivo
            WHERE IdIdentidad = @IdIdentidad;

            SET @Nueva = NEWID();
            INSERT dbo.IA_IdentidadUsuario (IdIdentidad, IdUsuario, IdEmpleado, HuellaDocumento) VALUES (@Nueva, @Login, @Emp, @Doc);
        END

        INSERT dbo.IA_IdentidadAuditoria (IdUsuario, Accion, AdminSql, AprobadoPor, Motivo, Evidencia, IdIdentidadAnterior, IdIdentidadPosterior,
                                          IdEmpleadoAnterior, HuellaDocAnterior, IdEmpleadoPosterior, HuellaDocPosterior, ConversacionesArchivadas, TurnosArchivados)
        VALUES (@Login, @Accion, ORIGINAL_LOGIN(), @AprobadoPor, @Motivo, @Evidencia, @IdIdentidad, @Nueva,
                @EmpReg, @DocReg, @Emp, @Doc, @Conv, @Turnos);
        COMMIT;
        EXEC sp_set_session_context @key = N'cjia_resolver', @value = NULL;         -- defensa adicional: nunca queda activada al terminar
    END TRY
    BEGIN CATCH
        EXEC sp_set_session_context @key = N'cjia_resolver', @value = NULL;         -- limpia la marca ante CUALQUIER error
        IF @@TRANCOUNT > 0 ROLLBACK;                                                -- revierte archivado, identidad y auditoria juntos
        THROW;
    END CATCH;
END;
GO

-- Conflictos pendientes (identidad registrada cuya huella ya no coincide, login eliminado o sin huella actual). Solo lectura.
CREATE OR ALTER VIEW dbo.vw_IA_Cj_Identidad_Conflicto
AS
SELECT i.IdIdentidad, i.IdUsuario, i.IdEmpleado AS IdEmpleadoRegistrado, h.IdEmpleado AS IdEmpleadoActual, u.IdEstado AS IdEstadoActual,
       CASE WHEN u.IdUsuario IS NULL THEN 'LOGIN_ELIMINADO'
            WHEN h.IdUsuario IS NULL THEN 'SIN_HUELLA_ACTUAL'
            WHEN i.HuellaDocumento <> h.HuellaDocumento THEN 'DOCUMENTO_DISTINTO'
            ELSE 'EMPLEADO_DISTINTO' END AS Motivo,
       i.FechaAlta
FROM dbo.IA_IdentidadUsuario i
LEFT JOIN dbo.Usuario u ON u.IdUsuario = i.IdUsuario
OUTER APPLY dbo.fn_IA_Cj_Huella(i.IdUsuario) h
WHERE i.Estado = 'VIGENTE' AND (u.IdUsuario IS NULL OR h.IdUsuario IS NULL OR i.IdEmpleado <> h.IdEmpleado OR i.HuellaDocumento <> h.HuellaDocumento);
GO

-- ===========================================================================
-- AUTORIZACION Y ALCANCE (interno: NO se concede a cj_ia; lo usan sp_IA_Cj_Pagos_Buscar y las pruebas)
-- Errores (THROW): 51040 sin identidad/permiso | 51041 nivel > concedido o invalido | 51043 totales globales no autorizados
--                  51047 empleado no resuelto de forma unica | 51048 alcance de mas de 500 empleados
-- ===========================================================================
CREATE OR ALTER PROCEDURE dbo.sp_IA_Cj_Autorizacion_Alcance
    @IdUsuario           NVARCHAR(100),
    @ToolName            VARCHAR(100),
    @NivelSolicitado     VARCHAR(10),                 -- PROPIO | EQUIPO | TOTAL (nunca por defecto)
    @VerTotalesGlobales  BIT = 0,
    @NivelAplicado       VARCHAR(10) OUTPUT,
    @EmpleadosAplicados  NVARCHAR(MAX) OUTPUT,        -- "1,2,3" ordenado; NULL si TOTAL
    @GlobalesAplicado    BIT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;

    SELECT @NivelAplicado = NULL, @EmpleadosAplicados = NULL, @GlobalesAplicado = 0;

    DECLARE @Login NVARCHAR(50) = dbo.fn_IA_Cj_UsuarioValido(@IdUsuario);
    IF @Login IS NULL
        THROW 51040, 'Identidad ausente o inexistente: se deniega.', 1;

    SET @ToolName = NULLIF(LTRIM(RTRIM(@ToolName)), '');
    IF @ToolName IS NULL
        THROW 51040, 'Herramienta ausente: se deniega.', 1;

    SET @NivelSolicitado = UPPER(NULLIF(LTRIM(RTRIM(@NivelSolicitado)), ''));
    IF @NivelSolicitado IS NULL OR @NivelSolicitado NOT IN ('PROPIO', 'EQUIPO', 'TOTAL')
        THROW 51041, 'Nivel de alcance ausente o invalido: se deniega.', 1;

    -- Concesiones vigentes del usuario (union determinista: nivel mas amplio concedido; igual que IaAuthorizationService).
    DECLARE @MaxNivel INT = 0, @GrantGlobales INT = 0;
    SELECT @MaxNivel = ISNULL(MAX(CASE t.ScopeLevel WHEN 'TOTAL' THEN 3 WHEN 'EQUIPO' THEN 2 WHEN 'PROPIO' THEN 1 ELSE 0 END), 0),
           @GrantGlobales = ISNULL(MAX(CAST(t.PermiteTotalesGlobales AS INT)), 0)
    FROM dbo.SegUsuarioPerfilRol upr
    INNER JOIN dbo.SegPerfilRol pr ON pr.IdPerfilRol = upr.IdPerfilRol AND pr.EsActivo = 1
    INNER JOIN dbo.SegPerfil p ON p.IdPerfil = pr.IdPerfil AND p.EsActivo = 1
    INNER JOIN dbo.SegRol r ON r.IdRol = pr.IdRol AND r.EsActivo = 1
    INNER JOIN dbo.IaToolPermiso t ON t.IdPerfilRol = pr.IdPerfilRol AND t.ToolName = @ToolName AND t.EsActivo = 1
    WHERE upr.IdUsuario = @Login AND upr.EsActivo = 1;

    IF @MaxNivel = 0
        THROW 51040, 'Sin permiso activo para la herramienta: se deniega.', 1;
    IF (CASE @NivelSolicitado WHEN 'TOTAL' THEN 3 WHEN 'EQUIPO' THEN 2 ELSE 1 END) > @MaxNivel
        THROW 51041, 'El nivel solicitado supera el concedido: se deniega.', 1;

    SET @VerTotalesGlobales = ISNULL(@VerTotalesGlobales, 0);
    IF @VerTotalesGlobales = 1 AND @GrantGlobales = 0
        THROW 51043, 'Totales globales no autorizados para este usuario.', 1;

    IF @NivelSolicitado = 'TOTAL'
    BEGIN
        SELECT @NivelAplicado = 'TOTAL', @EmpleadosAplicados = NULL, @GlobalesAplicado = @VerTotalesGlobales;
        RETURN;
    END

    -- Empleado titular derivado de la cuenta; debe resolverse a UNO solo y positivo.
    DECLARE @Titulares TABLE (IdEmpleadoCj INT PRIMARY KEY);
    INSERT @Titulares (IdEmpleadoCj)
    SELECT DISTINCT cj.IdEmpleado
    FROM dbo.Usuario u
    INNER JOIN dbo.Empleado e ON e.IdEmpleado = u.IdEmpleado
    INNER JOIN dbo.EmpleadoCj cj ON cj.IdEmpleado = e.IdEmpleadoCj
    WHERE u.IdUsuario = @Login AND cj.IdEmpleado IS NOT NULL;

    DECLARE @Titular INT = (SELECT MIN(IdEmpleadoCj) FROM @Titulares);
    IF (SELECT COUNT(*) FROM @Titulares) <> 1 OR @Titular IS NULL OR @Titular <= 0
        THROW 51047, 'El empleado de la cuenta no se resuelve de forma unica: se deniega.', 1;

    DECLARE @Ids TABLE (IdEmpleadoCj INT PRIMARY KEY);
    INSERT @Ids (IdEmpleadoCj) VALUES (@Titular);

    IF @NivelSolicitado = 'EQUIPO'
        INSERT @Ids (IdEmpleadoCj)
        SELECT DISTINCT d.IdEmpleadoCj
        FROM dbo.EmpleadoCjDetalle d
        INNER JOIN dbo.EmpleadoCj sub ON sub.IdEmpleado = d.IdEmpleadoCj
        WHERE d.IdResponsableCj = @Titular AND d.IdEmpleadoCj <> @Titular AND d.IdEmpleadoCj > 0;

    IF (SELECT COUNT(*) FROM @Ids) > 500
        THROW 51048, 'El alcance supera 500 empleados: se deniega.', 1;

    SELECT @NivelAplicado = @NivelSolicitado,
           @GlobalesAplicado = @VerTotalesGlobales,
           @EmpleadosAplicados = (SELECT STRING_AGG(CAST(i.IdEmpleadoCj AS NVARCHAR(20)), N',') WITHIN GROUP (ORDER BY i.IdEmpleadoCj) FROM @Ids i);
END;
GO

-- Lecturas de autorizacion que usa el backend (sin concesion => cero filas => el backend deniega)
CREATE OR ALTER PROCEDURE dbo.sp_IA_Cj_Autorizacion_Permisos
    @IdUsuario NVARCHAR(100),
    @ToolName  VARCHAR(100)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @Login NVARCHAR(50) = dbo.fn_IA_Cj_UsuarioValido(@IdUsuario);

    SELECT t.ScopeLevel, t.PermiteTotalesGlobales
    FROM dbo.SegUsuarioPerfilRol upr
    INNER JOIN dbo.SegPerfilRol pr ON pr.IdPerfilRol = upr.IdPerfilRol AND pr.EsActivo = 1
    INNER JOIN dbo.SegPerfil p ON p.IdPerfil = pr.IdPerfil AND p.EsActivo = 1
    INNER JOIN dbo.SegRol r ON r.IdRol = pr.IdRol AND r.EsActivo = 1
    INNER JOIN dbo.IaToolPermiso t ON t.IdPerfilRol = pr.IdPerfilRol AND t.ToolName = NULLIF(LTRIM(RTRIM(@ToolName)), '') AND t.EsActivo = 1
    WHERE @Login IS NOT NULL AND upr.IdUsuario = @Login AND upr.EsActivo = 1;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_IA_Cj_Autorizacion_Empleado
    @IdUsuario NVARCHAR(100)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @Login NVARCHAR(50) = dbo.fn_IA_Cj_UsuarioValido(@IdUsuario);

    -- Hasta 2 filas: el backend trata 0 (no resuelto) o 2 (ambiguo) como DENEGADO.
    SELECT DISTINCT TOP (2) cj.IdEmpleado AS IdEmpleadoCj
    FROM dbo.Usuario u
    INNER JOIN dbo.Empleado e ON e.IdEmpleado = u.IdEmpleado
    INNER JOIN dbo.EmpleadoCj cj ON cj.IdEmpleado = e.IdEmpleadoCj
    WHERE @Login IS NOT NULL AND u.IdUsuario = @Login;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_IA_Cj_Autorizacion_Equipo
    @IdEmpleadoCj INT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT DISTINCT d.IdEmpleadoCj
    FROM dbo.EmpleadoCjDetalle d
    INNER JOIN dbo.EmpleadoCj sub ON sub.IdEmpleado = d.IdEmpleadoCj
    WHERE @IdEmpleadoCj > 0 AND d.IdResponsableCj = @IdEmpleadoCj AND d.IdEmpleadoCj <> @IdEmpleadoCj AND d.IdEmpleadoCj > 0;
END;
GO

-- ===========================================================================
-- CONVERSACIONES. @IdUsuario = nombre de usuario del JWT (texto). Identidad invalida => THROW 51010.
-- ===========================================================================
CREATE OR ALTER PROCEDURE dbo.sp_IA_Cj_Conversacion_Crear
    @IdUsuario NVARCHAR(100),
    @Titulo    NVARCHAR(250) = NULL,
    @Modulo    VARCHAR(30) = 'PAGOS'
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @U NVARCHAR(50) = dbo.fn_IA_Cj_UsuarioValido(@IdUsuario);
    IF @U IS NULL THROW 51010, 'Identidad ausente o inexistente.', 1;

    DECLARE @Ident UNIQUEIDENTIFIER;
    EXEC dbo.sp_IA_Cj_Identidad_Asegurar @Login = @U, @IdIdentidad = @Ident OUTPUT;

    DECLARE @Id UNIQUEIDENTIFIER = NEWID();

    BEGIN TRAN;
    INSERT dbo.IA_Conversacion (IdConversacion, IdUsuario, IdIdentidad, Titulo, Modulo)
    VALUES (@Id, @U, @Ident, LEFT(NULLIF(LTRIM(RTRIM(@Titulo)), N''), 250), UPPER(NULLIF(LTRIM(RTRIM(@Modulo)), '')));
    INSERT dbo.IA_ConversacionEstado (IdConversacion) VALUES (@Id);
    COMMIT;

    SELECT @Id AS IdConversacion;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_IA_Cj_Conversacion_Listar
    @IdUsuario NVARCHAR(100),
    @Pagina    INT = 1,
    @Tamano    INT = 30
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @U NVARCHAR(50) = dbo.fn_IA_Cj_UsuarioValido(@IdUsuario);
    IF @U IS NULL THROW 51010, 'Identidad ausente o inexistente.', 1;
    IF @Pagina IS NULL OR @Pagina < 1 SET @Pagina = 1;
    IF @Tamano IS NULL OR @Tamano < 1 SET @Tamano = 30;
    IF @Tamano > 100 SET @Tamano = 100;

    SELECT c.IdConversacion, c.Titulo, c.Modulo, c.FechaCreacion, c.FechaUltimoMensaje
    FROM dbo.IA_Conversacion c
    WHERE c.IdUsuario = @U AND c.IdIdentidad = dbo.fn_IA_Cj_IdentidadVigente(@U) AND c.IdActivo = 1
    ORDER BY c.FechaUltimoMensaje DESC, c.IdConversacion
    OFFSET (@Pagina - 1) * @Tamano ROWS FETCH NEXT @Tamano ROWS ONLY;
END;
GO

-- Cuatro conjuntos de resultados con forma fija. Conversacion inexistente, inactiva o AJENA: los cuatro salen
-- VACIOS (no se distingue "ajena" de "inexistente").
CREATE OR ALTER PROCEDURE dbo.sp_IA_Cj_Conversacion_Abrir
    @IdUsuario       NVARCHAR(100),
    @IdConversacion  UNIQUEIDENTIFIER,
    @DesdeSecuencia  INT = 0,
    @Cantidad        INT = 100,
    @Encontrada      BIT = NULL OUTPUT      -- 1 = existe, esta activa y es del usuario; 0 en cualquier otro caso
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @U NVARCHAR(50) = dbo.fn_IA_Cj_UsuarioValido(@IdUsuario);
    IF @U IS NULL THROW 51010, 'Identidad ausente o inexistente.', 1;
    IF @DesdeSecuencia IS NULL OR @DesdeSecuencia < 0 SET @DesdeSecuencia = 0;
    IF @Cantidad IS NULL OR @Cantidad < 1 SET @Cantidad = 100;
    IF @Cantidad > 200 SET @Cantidad = 200;

    SET @Encontrada = CASE WHEN EXISTS (SELECT 1 FROM dbo.IA_Conversacion c
                                        WHERE c.IdConversacion = @IdConversacion AND c.IdUsuario = @U AND c.IdIdentidad = dbo.fn_IA_Cj_IdentidadVigente(@U) AND c.IdActivo = 1) THEN 1 ELSE 0 END;

    SELECT c.IdConversacion, c.Titulo, c.Modulo, c.FechaCreacion, c.FechaUltimoMensaje, c.UltimaSecuencia
    FROM dbo.IA_Conversacion c
    WHERE c.IdConversacion = @IdConversacion AND c.IdUsuario = @U AND c.IdIdentidad = dbo.fn_IA_Cj_IdentidadVigente(@U) AND c.IdActivo = 1;

    SELECT e.Version, e.EstadoJson, e.Resumen, e.ResumenHastaSecuencia, e.FechaActualizacion
    FROM dbo.IA_ConversacionEstado e
    INNER JOIN dbo.IA_Conversacion c ON c.IdConversacion = e.IdConversacion
    WHERE c.IdConversacion = @IdConversacion AND c.IdUsuario = @U AND c.IdIdentidad = dbo.fn_IA_Cj_IdentidadVigente(@U) AND c.IdActivo = 1;

    SELECT TOP (@Cantidad) m.IdMensaje, m.IdTurno, m.Secuencia, m.Rol, m.Contenido, m.Fecha, m.Modelo, m.FinishReason
    FROM dbo.IA_Mensaje m
    INNER JOIN dbo.IA_Conversacion c ON c.IdConversacion = m.IdConversacion
    WHERE c.IdConversacion = @IdConversacion AND c.IdUsuario = @U AND c.IdIdentidad = dbo.fn_IA_Cj_IdentidadVigente(@U) AND c.IdActivo = 1
      AND m.IdActivo = 1 AND m.Secuencia IS NOT NULL AND m.Secuencia > @DesdeSecuencia
      AND m.Rol IN ('user', 'assistant')
    ORDER BY m.Secuencia;

    -- Resultados que traen DATOS (Estado = OK) con su ALCANCE APLICADO, de los turnos de la pagina de mensajes Y de los turnos que cubre el
    -- resumen guardado: el backend los usa para comprobar, contra los permisos vigentes, si cada mensaje/resumen puede mostrarse o enviarse
    -- al modelo. Sin los JSON de resultado.
    DECLARE @ResumenHasta INT = (SELECT e.ResumenHastaSecuencia FROM dbo.IA_ConversacionEstado e WHERE e.IdConversacion = @IdConversacion);
    SELECT r.IdResultado, r.IdTurno,
           (SELECT MIN(m.Secuencia) FROM dbo.IA_Mensaje m WHERE m.IdTurno = r.IdTurno) AS SecuenciaTurno,
           r.Intento, r.Orden, r.Herramienta, r.AlcanceNivel, r.AlcanceEmpleados, r.UsaTotalesGlobales, r.Estado,
           r.FechaConsulta, r.Filas, r.FilasEnviadas, r.Truncado, r.HashResultado
    FROM dbo.IA_ResultadoConsulta r
    INNER JOIN dbo.IA_Conversacion c ON c.IdConversacion = r.IdConversacion
    WHERE c.IdConversacion = @IdConversacion AND c.IdUsuario = @U AND c.IdIdentidad = dbo.fn_IA_Cj_IdentidadVigente(@U) AND c.IdActivo = 1 AND r.Estado = 'OK'
      AND r.IdTurno IN (SELECT m.IdTurno FROM dbo.IA_Mensaje m
                        WHERE m.IdConversacion = @IdConversacion AND m.IdTurno IS NOT NULL
                          AND (m.Secuencia > @DesdeSecuencia OR (@ResumenHasta IS NOT NULL AND m.Secuencia <= @ResumenHasta)))
    ORDER BY r.IdTurno, r.Intento, r.Orden;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_IA_Cj_Conversacion_Renombrar
    @IdUsuario      NVARCHAR(100),
    @IdConversacion UNIQUEIDENTIFIER,
    @Titulo         NVARCHAR(250)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @U NVARCHAR(50) = dbo.fn_IA_Cj_UsuarioValido(@IdUsuario);
    IF @U IS NULL THROW 51010, 'Identidad ausente o inexistente.', 1;
    IF NULLIF(LTRIM(RTRIM(@Titulo)), N'') IS NULL THROW 51011, 'El titulo no puede estar vacio.', 1;

    UPDATE dbo.IA_Conversacion
    SET Titulo = LEFT(LTRIM(RTRIM(@Titulo)), 250)
    WHERE IdConversacion = @IdConversacion AND IdUsuario = @U AND IdIdentidad = dbo.fn_IA_Cj_IdentidadVigente(@U) AND IdActivo = 1;

    SELECT @@ROWCOUNT AS Actualizadas;
END;
GO

-- Borrado LOGICO. No toca mensajes, turnos ni resultados (retencion pendiente de decision).
-- No elimina con un turno en curso (bloqueo vigente).
CREATE OR ALTER PROCEDURE dbo.sp_IA_Cj_Conversacion_Eliminar
    @IdUsuario      NVARCHAR(100),
    @IdConversacion UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @U NVARCHAR(50) = dbo.fn_IA_Cj_UsuarioValido(@IdUsuario);
    IF @U IS NULL THROW 51010, 'Identidad ausente o inexistente.', 1;

    UPDATE dbo.IA_Conversacion
    SET IdActivo = 0
    WHERE IdConversacion = @IdConversacion AND IdUsuario = @U AND IdIdentidad = dbo.fn_IA_Cj_IdentidadVigente(@U) AND IdActivo = 1
      AND (BloqueoPropietario IS NULL OR BloqueoExpira <= SYSUTCDATETIME());

    SELECT @@ROWCOUNT AS Eliminadas;
END;
GO

-- ===========================================================================
-- TURNOS: idempotencia, bloqueo atomico y recuperacion
-- Resultado: NUEVO | REINTENTO | COMPLETADO | EN_CURSO | CONFLICTO | AGOTADO | NO_ENCONTRADA
--   NUEVO / REINTENTO -> el llamador YA tiene el bloqueo y debe procesar.
--   COMPLETADO        -> devolver ContenidoAsistente guardado; no procesar.
--   EN_CURSO          -> la misma peticion sigue activa en otra solicitud: 409.
--   CONFLICTO         -> otro turno de esta conversacion esta en curso: 409.
--   AGOTADO           -> maximo de intentos del turno: pedir una peticion nueva.
--   NO_ENCONTRADA     -> inexistente, inactiva o de otro usuario (no se distingue).
-- ===========================================================================
CREATE OR ALTER PROCEDURE dbo.sp_IA_Cj_Turno_Iniciar
    @IdUsuario       NVARCHAR(100),
    @IdConversacion  UNIQUEIDENTIFIER,
    @ClientMessageId UNIQUEIDENTIFIER,
    @Propietario     UNIQUEIDENTIFIER,
    @Contenido       NVARCHAR(MAX),
    @TtlSegundos     INT = 120,
    @MaxIntentos     TINYINT = 3
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @U NVARCHAR(50) = dbo.fn_IA_Cj_UsuarioValido(@IdUsuario);
    IF @U IS NULL THROW 51010, 'Identidad ausente o inexistente.', 1;
    IF @IdConversacion IS NULL OR @ClientMessageId IS NULL OR @Propietario IS NULL
        THROW 51020, 'Parametros obligatorios ausentes (ClientMessageId es obligatorio).', 1;
    IF @Contenido IS NULL OR LEN(LTRIM(RTRIM(@Contenido))) = 0
        THROW 51021, 'El mensaje no puede estar vacio.', 1;
    IF @TtlSegundos IS NULL OR @TtlSegundos < 30 SET @TtlSegundos = 30;
    IF @TtlSegundos > 600 SET @TtlSegundos = 600;
    IF @MaxIntentos IS NULL OR @MaxIntentos < 1 SET @MaxIntentos = 3;

    DECLARE @Ahora DATETIME2(7), @Expira DATETIME2(7), @Encontrada BIT = 0, @Vigente BIT = 0;
    DECLARE @BloqOwner UNIQUEIDENTIFIER, @BloqExp DATETIME2(7), @Rc INT;
    DECLARE @IdTurno BIGINT, @Estado VARCHAR(15), @Intentos TINYINT, @Seq INT, @Resultado VARCHAR(20), @ConvTurno UNIQUEIDENTIFIER;
    DECLARE @Recurso NVARCHAR(255) = N'cjia_cm:' + @U + N':' + CONVERT(NVARCHAR(36), @ClientMessageId);

    BEGIN TRY
        BEGIN TRAN;

        -- Serializa las peticiones con el MISMO (usuario, ClientMessageId): un reintento simultaneo espera al primero.
        EXEC @Rc = sys.sp_getapplock @Resource = @Recurso, @LockMode = 'Exclusive', @LockOwner = 'Transaction', @LockTimeout = 10000;
        IF @Rc < 0 THROW 51061, 'No se pudo serializar la peticion; reintente.', 1;

        SET @Ahora = SYSUTCDATETIME();
        SET @Expira = DATEADD(SECOND, @TtlSegundos, @Ahora);

        -- Serializa a quienes compiten por ESTA conversacion hasta el COMMIT.
        SELECT @BloqOwner = c.BloqueoPropietario, @BloqExp = c.BloqueoExpira, @Encontrada = 1
        FROM dbo.IA_Conversacion c WITH (UPDLOCK, HOLDLOCK)
        WHERE c.IdConversacion = @IdConversacion AND c.IdUsuario = @U AND c.IdIdentidad = dbo.fn_IA_Cj_IdentidadVigente(@U) AND c.IdActivo = 1;

        IF @Encontrada = 0
        BEGIN
            SET @Resultado = 'NO_ENCONTRADA';
        END
        ELSE
        BEGIN
            SET @Vigente = CASE WHEN @BloqOwner IS NOT NULL AND @BloqExp > @Ahora THEN 1 ELSE 0 END;

            -- El identificador pertenece al USUARIO (no a la conversacion): se busca en todas sus conversaciones.
            SELECT @IdTurno = t.IdTurno, @Estado = t.Estado, @Intentos = t.Intentos, @ConvTurno = t.IdConversacion
            FROM dbo.IA_Turno t
            WHERE t.IdUsuario = @U AND t.ClientMessageId = @ClientMessageId;

            IF @IdTurno IS NOT NULL AND @ConvTurno <> @IdConversacion
            BEGIN
                SET @IdTurno = NULL;                      -- no se expone nada de la otra conversacion
                SET @Resultado = 'ID_REUTILIZADO';
            END
            ELSE IF @IdTurno IS NOT NULL AND EXISTS (
                SELECT 1 FROM dbo.IA_Mensaje um
                WHERE um.IdTurno = @IdTurno AND um.Rol = 'user'
                  AND um.Contenido COLLATE Latin1_General_BIN2 <> @Contenido COLLATE Latin1_General_BIN2)
            BEGIN
                SET @IdTurno = NULL;                      -- mismo identificador, OTRO contenido: conflicto, no se reproduce nada
                SET @Resultado = 'CONTENIDO_DISTINTO';
            END
            ELSE
            BEGIN
                -- Turnos PROCESANDO de esta conversacion con el bloqueo vencido: ya no hay nadie trabajando.
                IF @Vigente = 0
                    UPDATE dbo.IA_Turno
                    SET Estado = 'INTERRUMPIDO', FechaFin = @Ahora, Error = N'Interrumpido: el bloqueo caduco sin finalizar.'
                    WHERE IdConversacion = @IdConversacion AND Estado = 'PROCESANDO' AND IdTurno <> ISNULL(@IdTurno, 0);

                IF @IdTurno IS NOT NULL
                BEGIN
                    IF @Estado = 'COMPLETADO'
                        SET @Resultado = 'COMPLETADO';
                    ELSE IF @Estado = 'PROCESANDO' AND @Vigente = 1
                        SET @Resultado = 'EN_CURSO';
                    ELSE IF @Vigente = 1
                        SET @Resultado = 'CONFLICTO';
                    ELSE IF @Intentos >= @MaxIntentos
                    BEGIN
                        UPDATE dbo.IA_Turno SET Estado = 'ERROR', FechaFin = @Ahora, Error = N'Maximo de intentos alcanzado.' WHERE IdTurno = @IdTurno;
                        SET @Resultado = 'AGOTADO';
                    END
                    ELSE
                    BEGIN
                        SET @Intentos = @Intentos + 1;
                        UPDATE dbo.IA_Turno
                        SET Estado = 'PROCESANDO', Intentos = @Intentos, FechaUltimoLatido = @Ahora, FechaFin = NULL, Error = NULL
                        WHERE IdTurno = @IdTurno;
                        UPDATE dbo.IA_Conversacion SET BloqueoPropietario = @Propietario, BloqueoExpira = @Expira WHERE IdConversacion = @IdConversacion;
                        SET @Resultado = 'REINTENTO';
                    END
                END
                ELSE IF @Vigente = 1
                BEGIN
                    SET @Resultado = 'CONFLICTO';
                END
                ELSE
                BEGIN
                    UPDATE dbo.IA_Conversacion
                    SET @Seq = UltimaSecuencia = UltimaSecuencia + 1,
                        BloqueoPropietario = @Propietario,
                        BloqueoExpira = @Expira,
                        FechaUltimoMensaje = @Ahora
                    WHERE IdConversacion = @IdConversacion;

                    INSERT dbo.IA_Turno (IdConversacion, IdUsuario, ClientMessageId, Estado, Intentos, FechaInicio, FechaUltimoLatido)
                    VALUES (@IdConversacion, @U, @ClientMessageId, 'PROCESANDO', 1, @Ahora, @Ahora);
                    SET @IdTurno = SCOPE_IDENTITY();
                    SET @Intentos = 1;

                    INSERT dbo.IA_Mensaje (IdConversacion, Rol, Contenido, Fecha, IdTurno, Secuencia)
                    VALUES (@IdConversacion, 'user', @Contenido, @Ahora, @IdTurno, @Seq);

                    SET @Resultado = 'NUEVO';
                END
            END
        END

        COMMIT;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        THROW;
    END CATCH;

    SELECT @Resultado AS Resultado, @IdTurno AS IdTurno, @Intentos AS Intentos,
           um.IdMensaje AS IdMensajeUsuario, um.Secuencia AS SecuenciaUsuario, um.Contenido AS ContenidoUsuario,
           am.IdMensaje AS IdMensajeAsistente, am.Secuencia AS SecuenciaAsistente, am.Contenido AS ContenidoAsistente,
           @IdConversacion AS IdConversacion
    FROM (SELECT 1 AS x) d
    LEFT JOIN dbo.IA_Mensaje um ON um.IdTurno = @IdTurno AND um.Rol = 'user' AND @Resultado NOT IN ('NO_ENCONTRADA', 'ID_REUTILIZADO', 'CONTENIDO_DISTINTO')
    LEFT JOIN dbo.IA_Mensaje am ON am.IdTurno = @IdTurno AND am.Rol = 'assistant' AND @Resultado = 'COMPLETADO';
END;
GO

-- ===========================================================================
-- PRIMER MENSAJE (el cliente aun no tiene conversationId): crea la conversacion Y el turno de forma atomica e IDEMPOTENTE.
-- Un reintento con el mismo ClientMessageId (sin conversationId, porque la respuesta se perdio) NO crea otra conversacion: reutiliza la
-- ya creada y aplica las mismas reglas de sp_IA_Cj_Turno_Iniciar (COMPLETADO, EN_CURSO, REINTENTO, CONTENIDO_DISTINTO...).
-- Devuelve el mismo conjunto de columnas que sp_IA_Cj_Turno_Iniciar (incluye IdConversacion).
-- ===========================================================================
CREATE OR ALTER PROCEDURE dbo.sp_IA_Cj_Turno_IniciarNueva
    @IdUsuario       NVARCHAR(100),
    @ClientMessageId UNIQUEIDENTIFIER,
    @Propietario     UNIQUEIDENTIFIER,
    @Contenido       NVARCHAR(MAX),
    @Modulo          VARCHAR(30) = 'PAGOS',
    @TtlSegundos     INT = 120,
    @MaxIntentos     TINYINT = 3
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @U NVARCHAR(50) = dbo.fn_IA_Cj_UsuarioValido(@IdUsuario);
    IF @U IS NULL THROW 51010, 'Identidad ausente o inexistente.', 1;
    IF @ClientMessageId IS NULL OR @Propietario IS NULL
        THROW 51020, 'Parametros obligatorios ausentes (ClientMessageId es obligatorio).', 1;

    DECLARE @IdConversacion UNIQUEIDENTIFIER, @Rc INT;
    DECLARE @Recurso NVARCHAR(255) = N'cjia_cm:' + @U + N':' + CONVERT(NVARCHAR(36), @ClientMessageId);

    BEGIN TRY
        BEGIN TRAN;

        EXEC @Rc = sys.sp_getapplock @Resource = @Recurso, @LockMode = 'Exclusive', @LockOwner = 'Transaction', @LockTimeout = 10000;
        IF @Rc < 0 THROW 51061, 'No se pudo serializar la peticion; reintente.', 1;

        -- Reintento: el identificador ya inicio una conversacion de este usuario.
        SELECT @IdConversacion = t.IdConversacion FROM dbo.IA_Turno t WHERE t.IdUsuario = @U AND t.ClientMessageId = @ClientMessageId;

        IF @IdConversacion IS NULL
        BEGIN
            DECLARE @Ident UNIQUEIDENTIFIER;
            EXEC dbo.sp_IA_Cj_Identidad_Asegurar @Login = @U, @IdIdentidad = @Ident OUTPUT;
            SET @IdConversacion = NEWID();
            INSERT dbo.IA_Conversacion (IdConversacion, IdUsuario, IdIdentidad, Modulo)
            VALUES (@IdConversacion, @U, @Ident, UPPER(NULLIF(LTRIM(RTRIM(@Modulo)), '')));
            INSERT dbo.IA_ConversacionEstado (IdConversacion) VALUES (@IdConversacion);
        END

        -- Devuelve el conjunto de resultados al llamador (misma forma que Turno_Iniciar).
        EXEC dbo.sp_IA_Cj_Turno_Iniciar
            @IdUsuario = @IdUsuario, @IdConversacion = @IdConversacion, @ClientMessageId = @ClientMessageId,
            @Propietario = @Propietario, @Contenido = @Contenido, @TtlSegundos = @TtlSegundos, @MaxIntentos = @MaxIntentos;

        COMMIT;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        THROW;
    END CATCH;
END;
GO

-- Latido: extiende el bloqueo SOLO si la solicitud sigue siendo la propietaria y no expiro.
-- Renovado = 0 => perdio el bloqueo: el backend cancela la llamada en curso y no escribe nada mas.
CREATE OR ALTER PROCEDURE dbo.sp_IA_Cj_Turno_Renovar
    @IdTurno     BIGINT,
    @Propietario UNIQUEIDENTIFIER,
    @TtlSegundos INT = 120
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    IF @TtlSegundos IS NULL OR @TtlSegundos < 30 SET @TtlSegundos = 30;
    IF @TtlSegundos > 600 SET @TtlSegundos = 600;

    DECLARE @Ahora DATETIME2(7) = SYSUTCDATETIME(), @Filas INT;

    BEGIN TRAN;

    -- UNA sola sentencia valida y extiende bajo el candado de la fila de la conversacion.
    UPDATE c
    SET c.BloqueoExpira = DATEADD(SECOND, @TtlSegundos, @Ahora)
    FROM dbo.IA_Conversacion c WITH (UPDLOCK, HOLDLOCK)
    INNER JOIN dbo.IA_Turno t ON t.IdConversacion = c.IdConversacion
    WHERE t.IdTurno = @IdTurno AND t.Estado = 'PROCESANDO'
      AND c.BloqueoPropietario = @Propietario AND c.BloqueoExpira > @Ahora
      AND dbo.fn_IA_Cj_UsuarioValido(c.IdUsuario) IS NOT NULL      -- usuario aun activo y con la misma huella
      AND c.IdIdentidad = dbo.fn_IA_Cj_IdentidadVigente(c.IdUsuario);   -- la conversacion es de la identidad VIGENTE
    SET @Filas = @@ROWCOUNT;

    IF @Filas = 1
        UPDATE dbo.IA_Turno SET FechaUltimoLatido = @Ahora WHERE IdTurno = @IdTurno;

    COMMIT;

    SELECT CAST(@Filas AS INT) AS Renovado;
END;
GO

-- Evidencia de UNA llamada a herramienta. Solo la solicitud propietaria con bloqueo vigente (51050 si no).
CREATE OR ALTER PROCEDURE dbo.sp_IA_Cj_Resultado_Registrar
    @IdTurno            BIGINT,
    @Propietario        UNIQUEIDENTIFIER,
    @Orden              SMALLINT,
    @Herramienta        VARCHAR(100),
    @ArgumentosJson     NVARCHAR(MAX),
    @AlcanceNivel       VARCHAR(12),
    @AlcanceHash        CHAR(64) = NULL,
    @Estado             VARCHAR(10),
    @Filas              INT = NULL,
    @FilasEnviadas      INT = NULL,
    @Truncado           BIT = 0,
    @TotalesJson        NVARCHAR(MAX) = NULL,
    @ResumenJson        NVARCHAR(MAX) = NULL,
    @HashResultado      CHAR(64) = NULL,
    @DuracionSqlMs      INT = NULL,
    @Error              NVARCHAR(500) = NULL,
    @IdAuditoria        BIGINT = NULL,
    @AlcanceEmpleados   NVARCHAR(MAX) = NULL,
    @UsaTotalesGlobales BIT = 0
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @IdConversacion UNIQUEIDENTIFIER, @Intento TINYINT, @IdResultado BIGINT;

    BEGIN TRY
        BEGIN TRAN;

        -- Valida el bloqueo Y escribe en la MISMA transaccion, con la fila de la conversacion tomada (UPDLOCK + HOLDLOCK):
        -- otra solicitud que quiera adquirir el bloqueo espera a que esta transaccion termine.
        SELECT @IdConversacion = t.IdConversacion, @Intento = t.Intentos
        FROM dbo.IA_Conversacion c WITH (UPDLOCK, HOLDLOCK)
        INNER JOIN dbo.IA_Turno t ON t.IdConversacion = c.IdConversacion
        WHERE t.IdTurno = @IdTurno AND t.Estado = 'PROCESANDO'
          AND c.BloqueoPropietario = @Propietario AND c.BloqueoExpira > SYSUTCDATETIME()
          AND dbo.fn_IA_Cj_UsuarioValido(c.IdUsuario) IS NOT NULL      -- usuario aun activo y con la misma huella
      AND c.IdIdentidad = dbo.fn_IA_Cj_IdentidadVigente(c.IdUsuario);   -- la conversacion es de la identidad VIGENTE

        IF @IdConversacion IS NULL
            THROW 51050, 'Bloqueo perdido o turno no activo: la solicitud ya no puede escribir.', 1;

        INSERT dbo.IA_ResultadoConsulta
            (IdConversacion, IdTurno, Intento, Orden, Herramienta, ArgumentosJson, AlcanceNivel, AlcanceHash, AlcanceEmpleados, UsaTotalesGlobales,
             Estado, Filas, FilasEnviadas, Truncado, TotalesJson, ResumenJson, HashResultado, DuracionSqlMs, Error, IdAuditoria)
        VALUES
            (@IdConversacion, @IdTurno, @Intento, @Orden, @Herramienta, @ArgumentosJson, @AlcanceNivel, @AlcanceHash, @AlcanceEmpleados, ISNULL(@UsaTotalesGlobales, 0),
             @Estado, @Filas, @FilasEnviadas, ISNULL(@Truncado, 0), @TotalesJson, @ResumenJson, @HashResultado, @DuracionSqlMs,
             LEFT(@Error, 500), @IdAuditoria);
        SET @IdResultado = SCOPE_IDENTITY();

        COMMIT;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        THROW;
    END CATCH;

    SELECT @IdResultado AS IdResultado;
END;
GO

-- Cierra el turno con la respuesta, libera el bloqueo (condicionado) y es IDEMPOTENTE (YA_COMPLETADO).
CREATE OR ALTER PROCEDURE dbo.sp_IA_Cj_Turno_Completar
    @IdTurno          BIGINT,
    @Propietario      UNIQUEIDENTIFIER,
    @Contenido        NVARCHAR(MAX),
    @FinishReason     VARCHAR(30) = NULL,
    @Modelo           VARCHAR(100) = NULL,
    @TokensEntrada    INT = NULL,
    @TokensSalida     INT = NULL,
    @DuracionModeloMs INT = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF @Contenido IS NULL OR LEN(LTRIM(RTRIM(@Contenido))) = 0
        THROW 51021, 'La respuesta no puede estar vacia.', 1;

    DECLARE @Ahora DATETIME2(7) = SYSUTCDATETIME(), @IdConversacion UNIQUEIDENTIFIER, @Estado VARCHAR(15);
    DECLARE @Seq INT, @IdMsg BIGINT, @Resultado VARCHAR(15);
    DECLARE @BloqOwner UNIQUEIDENTIFIER, @BloqExp DATETIME2(7), @LoginDueno NVARCHAR(50), @IdentidadConv UNIQUEIDENTIFIER;

    BEGIN TRY
        BEGIN TRAN;

        SELECT @IdConversacion = t.IdConversacion FROM dbo.IA_Turno t WHERE t.IdTurno = @IdTurno;
        IF @IdConversacion IS NULL
            THROW 51051, 'Turno inexistente.', 1;

        SELECT @BloqOwner = c.BloqueoPropietario, @BloqExp = c.BloqueoExpira, @LoginDueno = c.IdUsuario, @IdentidadConv = c.IdIdentidad
        FROM dbo.IA_Conversacion c WITH (UPDLOCK, HOLDLOCK) WHERE c.IdConversacion = @IdConversacion;

        SELECT @Estado = t.Estado FROM dbo.IA_Turno t WHERE t.IdTurno = @IdTurno;

        IF @Estado = 'COMPLETADO'
        BEGIN
            SET @Resultado = 'YA_COMPLETADO';
        END
        ELSE
        BEGIN
            IF @Estado <> 'PROCESANDO' OR @BloqOwner IS NULL OR @BloqOwner <> @Propietario OR @BloqExp <= @Ahora
               OR dbo.fn_IA_Cj_UsuarioValido(@LoginDueno) IS NULL      -- el usuario ya no esta activo o su huella cambio
               OR @IdentidadConv IS NULL OR @IdentidadConv <> ISNULL(dbo.fn_IA_Cj_IdentidadVigente(@LoginDueno), CAST(0x0 AS UNIQUEIDENTIFIER))   -- conversacion archivada
                THROW 51050, 'Bloqueo perdido o turno no activo: la solicitud ya no puede escribir.', 1;

            UPDATE dbo.IA_Conversacion
            SET @Seq = UltimaSecuencia = UltimaSecuencia + 1,
                FechaUltimoMensaje = @Ahora,
                BloqueoPropietario = NULL,
                BloqueoExpira = NULL,
                Titulo = ISNULL(Titulo, LEFT((SELECT TOP (1) m.Contenido FROM dbo.IA_Mensaje m
                                              WHERE m.IdTurno = @IdTurno AND m.Rol = 'user'), 80))
            WHERE IdConversacion = @IdConversacion;

            INSERT dbo.IA_Mensaje (IdConversacion, Rol, Contenido, Fecha, TokensEntrada, TokensSalida, Modelo,
                                   IdTurno, Secuencia, FinishReason, DuracionModeloMs)
            VALUES (@IdConversacion, 'assistant', @Contenido, @Ahora, @TokensEntrada, @TokensSalida, @Modelo,
                    @IdTurno, @Seq, @FinishReason, @DuracionModeloMs);
            SET @IdMsg = SCOPE_IDENTITY();

            UPDATE dbo.IA_Turno SET Estado = 'COMPLETADO', FechaFin = @Ahora, FechaUltimoLatido = @Ahora, Error = NULL
            WHERE IdTurno = @IdTurno;

            SET @Resultado = 'OK';
        END

        COMMIT;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        THROW;
    END CATCH;

    SELECT @Resultado AS Resultado, am.IdMensaje, am.Secuencia, am.Contenido
    FROM dbo.IA_Mensaje am WHERE am.IdTurno = @IdTurno AND am.Rol = 'assistant';
END;
GO

-- ERROR o INTERRUMPIDO y libera el bloqueo SOLO si la solicitud sigue siendo la propietaria (Filas = 0 si no).
CREATE OR ALTER PROCEDURE dbo.sp_IA_Cj_Turno_Fallar
    @IdTurno     BIGINT,
    @Propietario UNIQUEIDENTIFIER,
    @Estado      VARCHAR(15) = 'ERROR',
    @Error       NVARCHAR(500) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF @Estado NOT IN ('ERROR', 'INTERRUMPIDO') THROW 51052, 'Estado de fallo invalido.', 1;

    DECLARE @Ahora DATETIME2(7) = SYSUTCDATETIME(), @Filas INT = 0, @IdConversacion UNIQUEIDENTIFIER;

    BEGIN TRY
        BEGIN TRAN;

        -- Toma primero el candado de la fila de la conversacion; despues comprueba y actualiza ambas tablas en la misma transaccion.
        SELECT @IdConversacion = c.IdConversacion
        FROM dbo.IA_Conversacion c WITH (UPDLOCK, HOLDLOCK)
        INNER JOIN dbo.IA_Turno t ON t.IdConversacion = c.IdConversacion
        WHERE t.IdTurno = @IdTurno;

        UPDATE t
        SET t.Estado = @Estado, t.FechaFin = @Ahora, t.Error = LEFT(@Error, 500)
        FROM dbo.IA_Turno t
        WHERE t.IdTurno = @IdTurno AND t.Estado = 'PROCESANDO'
          AND EXISTS (SELECT 1 FROM dbo.IA_Conversacion c WHERE c.IdConversacion = @IdConversacion AND c.BloqueoPropietario = @Propietario);
        SET @Filas = @@ROWCOUNT;

        -- Liberacion condicionada al propietario (nunca libera el bloqueo de otra solicitud).
        UPDATE dbo.IA_Conversacion
        SET BloqueoPropietario = NULL, BloqueoExpira = NULL
        WHERE IdConversacion = @IdConversacion AND BloqueoPropietario = @Propietario;

        COMMIT;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        THROW;
    END CATCH;

    SELECT @Filas AS Filas;
END;
GO

-- Estado estructurado con version optimista; solo la solicitud propietaria con bloqueo vigente.
CREATE OR ALTER PROCEDURE dbo.sp_IA_Cj_Estado_Guardar
    @IdTurno               BIGINT,
    @Propietario           UNIQUEIDENTIFIER,
    @VersionEsperada       INT,
    @EstadoJson            NVARCHAR(MAX),
    @Resumen               NVARCHAR(MAX) = NULL,
    @ResumenHastaSecuencia INT = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF @EstadoJson IS NULL OR ISJSON(@EstadoJson) <> 1 THROW 51060, 'EstadoJson no es JSON valido.', 1;

    DECLARE @IdConversacion UNIQUEIDENTIFIER, @Motivo VARCHAR(20), @Version INT;

    BEGIN TRY
        BEGIN TRAN;

        -- Valida el bloqueo y escribe en la MISMA transaccion, con la fila de la conversacion tomada.
        SELECT @IdConversacion = t.IdConversacion
        FROM dbo.IA_Conversacion c WITH (UPDLOCK, HOLDLOCK)
        INNER JOIN dbo.IA_Turno t ON t.IdConversacion = c.IdConversacion
        WHERE t.IdTurno = @IdTurno AND t.Estado = 'PROCESANDO'
          AND c.BloqueoPropietario = @Propietario AND c.BloqueoExpira > SYSUTCDATETIME()
          AND dbo.fn_IA_Cj_UsuarioValido(c.IdUsuario) IS NOT NULL      -- usuario aun activo y con la misma huella
      AND c.IdIdentidad = dbo.fn_IA_Cj_IdentidadVigente(c.IdUsuario);   -- la conversacion es de la identidad VIGENTE

        IF @IdConversacion IS NULL
        BEGIN
            SET @Motivo = 'BLOQUEO_PERDIDO';
        END
        ELSE
        BEGIN
            UPDATE dbo.IA_ConversacionEstado
            SET EstadoJson = @EstadoJson,
                Resumen = ISNULL(@Resumen, Resumen),
                ResumenHastaSecuencia = ISNULL(@ResumenHastaSecuencia, ResumenHastaSecuencia),
                Version = Version + 1,
                FechaActualizacion = SYSUTCDATETIME()
            WHERE IdConversacion = @IdConversacion AND Version = @VersionEsperada;

            SET @Motivo = CASE WHEN @@ROWCOUNT = 1 THEN 'OK' ELSE 'VERSION_DISTINTA' END;
            SELECT @Version = e.Version FROM dbo.IA_ConversacionEstado e WHERE e.IdConversacion = @IdConversacion;
        END

        COMMIT;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        THROW;
    END CATCH;

    SELECT CAST(CASE WHEN @Motivo = 'OK' THEN 1 ELSE 0 END AS INT) AS Filas, @Motivo AS Motivo, @Version AS Version;
END;
GO

-- ===========================================================================
-- AUDITORIA: IA_AuditoriaConsulta con UNA columna agregada (UsuarioLogin, script 18); IdUsuario INT queda NULL.
--   Pregunta = primeros 500 caracteres (o NULL); SqlHash = hash de argumentos normalizados; SqlGenerado = NULL;
--   TablasConsultadas = herramienta/SP; UsuarioLogin = el nombre de usuario recibido (dato de auditoria, no decide acceso).
-- ===========================================================================
CREATE OR ALTER PROCEDURE dbo.sp_IA_Cj_Auditoria_Registrar
    @IdUsuario            NVARCHAR(100),
    @IdConversacion       UNIQUEIDENTIFIER = NULL,
    @Pregunta             NVARCHAR(MAX) = NULL,
    @SqlHash              VARCHAR(128) = NULL,
    @TablasConsultadas    NVARCHAR(MAX) = NULL,
    @DuracionMs           INT = NULL,
    @CantidadRegistros    INT = NULL,
    @Modelo               VARCHAR(100) = NULL,
    @TokensEntrada        INT = NULL,
    @TokensSalida         INT = NULL,
    @Exitoso              BIT,
    @Error                NVARCHAR(MAX) = NULL,
    @BloqueadoSeguridad   BIT = 0,
    @MotivoBloqueo        NVARCHAR(MAX) = NULL,
    @AuthorizationAllowed BIT = 0,
    @AuthorizationReason  NVARCHAR(500) = NULL,
    @AppliedScopes        NVARCHAR(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    INSERT dbo.IA_AuditoriaConsulta
        (IdUsuario, UsuarioLogin, IdConversacion, Pregunta, SqlHash, SqlGenerado, TablasConsultadas, DuracionMs, CantidadRegistros,
         Modelo, TokensEntrada, TokensSalida, Exitoso, Error, BloqueadoSeguridad, MotivoBloqueo,
         AuthorizationAllowed, AuthorizationReason, AppliedScopes)
    VALUES
        (NULL, LEFT(LTRIM(RTRIM(@IdUsuario)), 100), @IdConversacion, LEFT(@Pregunta, 500), @SqlHash, NULL, @TablasConsultadas, @DuracionMs, @CantidadRegistros,
         @Modelo, @TokensEntrada, @TokensSalida, @Exitoso, LEFT(@Error, 2000), ISNULL(@BloqueadoSeguridad, 0), LEFT(@MotivoBloqueo, 2000),
         ISNULL(@AuthorizationAllowed, 0), LEFT(@AuthorizationReason, 500), @AppliedScopes);

    SELECT SCOPE_IDENTITY() AS IdAuditoria;
END;
GO

-- ===========================================================================
-- PAGOS: envoltorio de dbo.sp_IA_Planilla_Buscar (sin modificarlo).
--
-- SIN "EXECUTE AS OWNER": el privilegio que necesita el SQL dinamico del SP compartido (modo RESUMEN) lo aporta la FIRMA con
-- certificado (script 20c): SELECT solo sobre Planilla, Proyecto, Cliente, Site, Empleado, EmpleadoCj, Constante y
-- a_tipo_cambio_diario, y solo mientras este procedimiento firmado esta en la pila de llamadas. Cualquier ALTER de este
-- procedimiento ELIMINA la firma: volver a ejecutar 20c y validar con 21b. Este envoltorio NO usa SQL dinamico.
--
-- ALCANCE: se DERIVA en SQL (sp_IA_Cj_Autorizacion_Alcance) desde @IdUsuario (que debe ser un usuario existente con
-- IdEstado = 1); este procedimiento NO recibe lista de empleados. Lo aplicado se devuelve en @NivelAplicado /
-- @EmpleadosAplicados / @GlobalesAplicado (OUTPUT).
-- Limites: fechas ISO obligatorias, rango <= 400 dias, pagina <= 200, TOP <= 100, modo DETALLE/RESUMEN.
-- @SoloValidar = 1: valida TODO y vuelve sin llamar a sp_IA_Planilla_Buscar (pruebas 22/23: no consultan pagos). Que la firma
-- cubra el SQL dinamico NO lo demuestra @SoloValidar: lo demuestra la prueba real 24 (pendiente de autorizacion).
-- No se envian tipos de cambio: el SP aplicara sus valores por defecto y devolvera columnas "Soles"; el backend las descarta.
-- ===========================================================================
CREATE OR ALTER PROCEDURE dbo.sp_IA_Cj_Pagos_Buscar
    @IdUsuario          NVARCHAR(100),
    @ToolName           VARCHAR(100) = 'buscar_planilla',
    @NivelSolicitado    VARCHAR(10),            -- PROPIO | EQUIPO | TOTAL (no puede superar el concedido)
    @VerTotalesGlobales BIT = 0,
    @FechaInicio        NVARCHAR(50),           -- ISO yyyy-MM-dd, obligatoria
    @FechaFin           NVARCHAR(50),           -- ISO yyyy-MM-dd, obligatoria
    @Modo               VARCHAR(10) = 'RESUMEN',
    @AgruparPor         VARCHAR(100) = NULL,
    @Top                INT = 50,
    @Pagina             INT = 1,
    @TamanoPagina       INT = 50,
    @Estados            VARCHAR(100) = NULL,
    @TextoBusqueda      NVARCHAR(500) = NULL,
    @IdSite             NVARCHAR(50) = NULL,
    @CorreSite          INT = NULL,
    @Site               NVARCHAR(150) = NULL,
    @Cliente            NVARCHAR(150) = NULL,
    @Proyecto           NVARCHAR(150) = NULL,
    @Responsable        NVARCHAR(150) = NULL,
    @Solicitante        NVARCHAR(150) = NULL,
    @Ot                 NVARCHAR(100) = NULL,
    @CoincidirTodas     BIT = NULL,
    @IncluirEstado99    BIT = NULL,
    @SoloValidar        BIT = 0,                -- 1 = valida TODO y devuelve sin llamar a sp_IA_Planilla_Buscar (pruebas: no consulta pagos)
    @NivelAplicado      VARCHAR(10) = NULL OUTPUT,
    @EmpleadosAplicados NVARCHAR(MAX) = NULL OUTPUT,
    @GlobalesAplicado   BIT = NULL OUTPUT
AS
BEGIN
    SET NOCOUNT ON;

    -- 1) Autorizacion y alcance (lanza 51040/51041/51043/51047/51048; nunca hay TOTAL por defecto)
    DECLARE @Nivel VARCHAR(10), @Lista NVARCHAR(MAX), @Globales BIT;
    EXEC dbo.sp_IA_Cj_Autorizacion_Alcance
        @IdUsuario = @IdUsuario, @ToolName = @ToolName, @NivelSolicitado = @NivelSolicitado,
        @VerTotalesGlobales = @VerTotalesGlobales,
        @NivelAplicado = @Nivel OUTPUT, @EmpleadosAplicados = @Lista OUTPUT, @GlobalesAplicado = @Globales OUTPUT;

    IF @Nivel IS NULL OR (@Nivel <> 'TOTAL' AND NULLIF(@Lista, N'') IS NULL)
        THROW 51041, 'Alcance no resuelto: se deniega.', 1;

    -- 2) Limites de la consulta
    DECLARE @D1 DATE = TRY_CONVERT(DATE, NULLIF(LTRIM(RTRIM(@FechaInicio)), N''), 23);
    DECLARE @D2 DATE = TRY_CONVERT(DATE, NULLIF(LTRIM(RTRIM(@FechaFin)), N''), 23);
    IF @D1 IS NULL OR @D2 IS NULL OR @D2 < @D1
        THROW 51044, 'FechaInicio y FechaFin son obligatorias (yyyy-MM-dd) y FechaFin no puede ser anterior.', 1;
    IF DATEDIFF(DAY, @D1, @D2) > 400
        THROW 51045, 'El rango de fechas supera 400 dias.', 1;

    SET @Modo = UPPER(NULLIF(LTRIM(RTRIM(@Modo)), ''));
    IF @Modo IS NULL OR @Modo NOT IN ('DETALLE', 'RESUMEN') THROW 51046, 'Modo invalido.', 1;
    IF @Top IS NULL OR @Top < 1 SET @Top = 50;
    IF @Top > 100 SET @Top = 100;
    IF @Pagina IS NULL OR @Pagina < 1 SET @Pagina = 1;
    IF @TamanoPagina IS NULL OR @TamanoPagina < 1 SET @TamanoPagina = 50;
    IF @TamanoPagina > 200 SET @TamanoPagina = 200;

    DECLARE @ParamNivel VARCHAR(12) = CASE WHEN @Nivel = 'TOTAL' THEN 'TOTAL' ELSE 'RESTRINGIDO' END;
    DECLARE @ParamCampos VARCHAR(2) = CASE WHEN @Nivel = 'TOTAL' THEN NULL ELSE 'RS' END;
    DECLARE @IsoIni NVARCHAR(50) = CONVERT(NVARCHAR(10), @D1, 23), @IsoFin NVARCHAR(50) = CONVERT(NVARCHAR(10), @D2, 23);

    -- 3) Lo aplicado se devuelve por OUTPUT cuando el procedimiento termina bien (si falla, el backend no recibe datos ni valores)
    SELECT @NivelAplicado = @Nivel, @EmpleadosAplicados = @Lista, @GlobalesAplicado = @Globales;

    -- Modo de solo validacion: ninguna consulta de pagos (lo usan las pruebas 22 y 23)
    IF ISNULL(@SoloValidar, 0) = 1
        RETURN;

    EXEC dbo.sp_IA_Planilla_Buscar
        @TextoBusqueda      = @TextoBusqueda,
        @Estados            = @Estados,
        @FechaInicio        = @IsoIni,
        @FechaFin           = @IsoFin,
        @IdSite             = @IdSite,
        @CorreSite          = @CorreSite,
        @Site               = @Site,
        @Cliente            = @Cliente,
        @Proyecto           = @Proyecto,
        @Responsable        = @Responsable,
        @Solicitante        = @Solicitante,
        @Ot                 = @Ot,
        @CoincidirTodas     = @CoincidirTodas,
        @IncluirEstado99    = @IncluirEstado99,
        @Pagina             = @Pagina,
        @TamanoPagina       = @TamanoPagina,
        @AlcanceNivel       = @ParamNivel,
        @AlcanceCampos      = @ParamCampos,
        @AlcanceEmpleados   = @Lista,
        @VerTotalesGlobales = @Globales,
        @Modo               = @Modo,
        @AgruparPor         = @AgruparPor,
        @Top                = @Top;
END;
GO

SET NOEXEC OFF;
GO
