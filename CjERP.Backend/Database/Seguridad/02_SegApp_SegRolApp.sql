/*
  Seguridad - APLICACIONES (web y apps moviles) y a cual pertenece cada ROL. PV: NO ejecutado ni probado contra la BD.
  Solo CREA tablas nuevas y las llena; no modifica ninguna tabla existente. Idempotente.

  Modelo
    SegApp     : catalogo de aplicaciones. 'WEB' = ERP web; 'MOB_LOGISTICA' = app movil de logistica (CJ Despachos); futuras: MOB_xxx.
                 CargosPermitidos = lista de IdCargo (EmpleadoCj.IdCargo) que pueden entrar, separada por comas; NULL = cualquiera.
    SegRolApp  : un rol pertenece a las apps que aparezcan aqui. Un rol SIN fila en SegRolApp pertenece a 'WEB' (asi los roles actuales
                 -- CONSULTA, REGISTRO, ADMIN, SISTEMAS, LOGISTICA, ESTANDAR... -- siguen siendo de la web sin migrar nada).
  Login (AuthService): el cliente envia la app ('WEB' si no envia nada). El backend elige el perfil-rol del usuario QUE PERTENEZCA a esa
  app (el mas antiguo si hubiera varios) y valida, ANTES de crear la sesion: aplicacion activa, usuario activo (IdEstado = 1) y cargo
  permitido. Un usuario puede tener un rol de web y otro de cada app movil sin que se estorben.

  Uso para dar acceso a una app movil (ejemplo):
    1) Crear el rol en Seguridad / Roles (p. ej. "Despachador movil").
    2) EXEC dbo.sp_SegRolApp_Asignar @IdRol = <id del rol>, @CodigoApp = 'MOB_LOGISTICA';
    3) En Seguridad / Menu darle a ese rol el menu MOB_LOG_DESPACHOS (Ver + Editar + Aprobar).
    4) Asignar el rol al usuario (Seguridad / usuario-perfil-rol: AGREGA, no reemplaza el rol de la web).
*/
SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

IF OBJECT_ID(N'dbo.SegApp', N'U') IS NULL
  CREATE TABLE dbo.SegApp (
    CodigoApp         varchar(30)    NOT NULL CONSTRAINT PK_SegApp PRIMARY KEY,
    Nombre            nvarchar(100)  NOT NULL,
    CargosPermitidos  varchar(100)   NULL,
    EsActivo          bit            NOT NULL CONSTRAINT DF_SegApp_EsActivo DEFAULT (1),
    FechaCreacion     datetime2(0)   NOT NULL CONSTRAINT DF_SegApp_Fecha DEFAULT (SYSDATETIME())
  );
GO

IF OBJECT_ID(N'dbo.SegRolApp', N'U') IS NULL
  CREATE TABLE dbo.SegRolApp (
    IdRol          int          NOT NULL,
    CodigoApp      varchar(30)  NOT NULL,
    EsActivo       bit          NOT NULL CONSTRAINT DF_SegRolApp_EsActivo DEFAULT (1),
    FechaCreacion  datetime2(0) NOT NULL CONSTRAINT DF_SegRolApp_Fecha DEFAULT (SYSDATETIME()),
    CONSTRAINT PK_SegRolApp PRIMARY KEY (IdRol, CodigoApp),
    CONSTRAINT FK_SegRolApp_SegApp FOREIGN KEY (CodigoApp) REFERENCES dbo.SegApp (CodigoApp)
  );
GO

MERGE dbo.SegApp AS t
USING (VALUES
  ('WEB',           N'ERP Web',                    CAST(NULL AS varchar(100))),
  ('MOB_LOGISTICA', N'CJ Despachos (logistica)',   '50')
) AS s (CodigoApp, Nombre, CargosPermitidos)
  ON t.CodigoApp = s.CodigoApp
WHEN NOT MATCHED THEN INSERT (CodigoApp, Nombre, CargosPermitidos) VALUES (s.CodigoApp, s.Nombre, s.CargosPermitidos);
GO

CREATE OR ALTER PROCEDURE dbo.sp_SegRolApp_Asignar
  @IdRol     int,
  @CodigoApp varchar(30),
  @Activo    bit = 1
AS
BEGIN
  SET NOCOUNT ON;

  IF @IdRol IS NULL OR NOT EXISTS (SELECT 1 FROM dbo.SegRol WHERE IdRol = @IdRol)
    THROW 52400, 'El rol indicado no existe en SegRol.', 1;
  IF NOT EXISTS (SELECT 1 FROM dbo.SegApp WHERE CodigoApp = @CodigoApp)
    THROW 52401, 'La aplicacion indicada no existe en SegApp.', 1;
  IF @CodigoApp = 'WEB'
    THROW 52402, 'Los roles sin fila en SegRolApp ya pertenecen a la web; no se asigna WEB explicitamente.', 1;

  MERGE dbo.SegRolApp AS t
  USING (SELECT @IdRol AS IdRol, @CodigoApp AS CodigoApp) AS s ON t.IdRol = s.IdRol AND t.CodigoApp = s.CodigoApp
  WHEN MATCHED THEN UPDATE SET EsActivo = @Activo
  WHEN NOT MATCHED THEN INSERT (IdRol, CodigoApp, EsActivo) VALUES (@IdRol, @CodigoApp, @Activo);

  SELECT ra.IdRol, r.NombreRol, ra.CodigoApp, ra.EsActivo FROM dbo.SegRolApp ra JOIN dbo.SegRol r ON r.IdRol = ra.IdRol WHERE ra.IdRol = @IdRol;
END;
GO
