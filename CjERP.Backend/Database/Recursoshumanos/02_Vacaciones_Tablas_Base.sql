IF OBJECT_ID('dbo.VacacionPolitica', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.VacacionPolitica
    (
        IdPolitica              INT IDENTITY(1,1) NOT NULL,
        Codigo                  NVARCHAR(50) NOT NULL,
        Nombre                  NVARCHAR(150) NOT NULL,
        Descripcion             NVARCHAR(500) NULL,
        DiasBase                DECIMAL(10,2) NOT NULL CONSTRAINT DF_VacacionPolitica_DiasBase DEFAULT (30),
        DiasAdicionales         DECIMAL(10,2) NOT NULL CONSTRAINT DF_VacacionPolitica_DiasAdicionales DEFAULT (0),
        DiasMaximoAcumulable    DECIMAL(10,2) NOT NULL CONSTRAINT DF_VacacionPolitica_DiasMaximoAcumulable DEFAULT (0),
        MesesMinimosGoce        INT NOT NULL CONSTRAINT DF_VacacionPolitica_MesesMinimosGoce DEFAULT (12),
        PermiteFraccionamiento  BIT NOT NULL CONSTRAINT DF_VacacionPolitica_PermiteFraccionamiento DEFAULT (1),
        MinDiasFraccion         INT NOT NULL CONSTRAINT DF_VacacionPolitica_MinDiasFraccion DEFAULT (1),
        MaxDiasPorSolicitud     DECIMAL(10,2) NULL,
        Vigente                 BIT NOT NULL CONSTRAINT DF_VacacionPolitica_Vigente DEFAULT (1),
        Observacion             NVARCHAR(500) NULL,
        UsuarioCreacion         NVARCHAR(50) NOT NULL CONSTRAINT DF_VacacionPolitica_UsuarioCreacion DEFAULT ('sistema'),
        FechaCreacion           DATETIME2(0) NOT NULL CONSTRAINT DF_VacacionPolitica_FechaCreacion DEFAULT (SYSDATETIME()),
        UsuarioModificacion     NVARCHAR(50) NULL,
        FechaModificacion       DATETIME2(0) NULL,
        CONSTRAINT PK_VacacionPolitica PRIMARY KEY CLUSTERED (IdPolitica),
        CONSTRAINT UX_VacacionPolitica_Codigo UNIQUE (Codigo),
        CONSTRAINT CK_VacacionPolitica_DiasBase CHECK (DiasBase > 0),
        CONSTRAINT CK_VacacionPolitica_DiasAdicionales CHECK (DiasAdicionales >= 0),
        CONSTRAINT CK_VacacionPolitica_DiasMaximoAcumulable CHECK (DiasMaximoAcumulable >= 0),
        CONSTRAINT CK_VacacionPolitica_MesesMinimosGoce CHECK (MesesMinimosGoce > 0),
        CONSTRAINT CK_VacacionPolitica_MinDiasFraccion CHECK (MinDiasFraccion > 0)
    );
END;
GO

IF OBJECT_ID('dbo.VacacionPeriodo', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.VacacionPeriodo
    (
        IdPeriodo               INT IDENTITY(1,1) NOT NULL,
        IdEmpleado              INT NOT NULL,
        IdPolitica              INT NOT NULL,
        Anio                    INT NOT NULL,
        FechaInicioPeriodo      DATE NULL,
        FechaFinPeriodo         DATE NULL,
        DiasOtorgados           DECIMAL(10,2) NOT NULL CONSTRAINT DF_VacacionPeriodo_DiasOtorgados DEFAULT (0),
        DiasConsumidos          DECIMAL(10,2) NOT NULL CONSTRAINT DF_VacacionPeriodo_DiasConsumidos DEFAULT (0),
        DiasReservados          DECIMAL(10,2) NOT NULL CONSTRAINT DF_VacacionPeriodo_DiasReservados DEFAULT (0),
        DiasAjustados           DECIMAL(10,2) NOT NULL CONSTRAINT DF_VacacionPeriodo_DiasAjustados DEFAULT (0),
        DiasDisponibles         AS (([DiasOtorgados] + [DiasAjustados]) - ([DiasConsumidos] + [DiasReservados])) PERSISTED,
        Estado                  NVARCHAR(20) NOT NULL CONSTRAINT DF_VacacionPeriodo_Estado DEFAULT ('GENERADO'),
        EsLiquidado             BIT NOT NULL CONSTRAINT DF_VacacionPeriodo_EsLiquidado DEFAULT (0),
        FechaLiquidacion        DATE NULL,
        Observacion             NVARCHAR(500) NULL,
        UsuarioCreacion         NVARCHAR(50) NOT NULL CONSTRAINT DF_VacacionPeriodo_UsuarioCreacion DEFAULT ('sistema'),
        FechaCreacion           DATETIME2(0) NOT NULL CONSTRAINT DF_VacacionPeriodo_FechaCreacion DEFAULT (SYSDATETIME()),
        UsuarioModificacion     NVARCHAR(50) NULL,
        FechaModificacion       DATETIME2(0) NULL,
        CONSTRAINT PK_VacacionPeriodo PRIMARY KEY CLUSTERED (IdPeriodo),
        CONSTRAINT UX_VacacionPeriodo_EmpleadoPoliticaAnio UNIQUE (IdEmpleado, IdPolitica, Anio),
        CONSTRAINT FK_VacacionPeriodo_EmpleadoCj FOREIGN KEY (IdEmpleado) REFERENCES dbo.EmpleadoCj (IdEmpleado),
        CONSTRAINT FK_VacacionPeriodo_VacacionPolitica FOREIGN KEY (IdPolitica) REFERENCES dbo.VacacionPolitica (IdPolitica),
        CONSTRAINT CK_VacacionPeriodo_Anio CHECK (Anio >= 2000),
        CONSTRAINT CK_VacacionPeriodo_DiasOtorgados CHECK (DiasOtorgados >= 0),
        CONSTRAINT CK_VacacionPeriodo_DiasConsumidos CHECK (DiasConsumidos >= 0),
        CONSTRAINT CK_VacacionPeriodo_DiasReservados CHECK (DiasReservados >= 0),
        CONSTRAINT CK_VacacionPeriodo_DiasAjustados CHECK (DiasAjustados >= 0)
    );

    CREATE INDEX IX_VacacionPeriodo_IdEmpleado
        ON dbo.VacacionPeriodo (IdEmpleado, Estado, Anio DESC);

    CREATE INDEX IX_VacacionPeriodo_IdPolitica
        ON dbo.VacacionPeriodo (IdPolitica, Anio DESC);
END;
GO

IF OBJECT_ID('dbo.VacacionSolicitud', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.VacacionSolicitud
    (
        IdSolicitud             INT IDENTITY(1,1) NOT NULL,
        IdEmpleado              INT NOT NULL,
        IdPeriodo               INT NOT NULL,
        FechaInicio             DATE NOT NULL,
        FechaFin                DATE NOT NULL,
        CantidadDias            DECIMAL(10,2) NOT NULL,
        Estado                  NVARCHAR(20) NOT NULL CONSTRAINT DF_VacacionSolicitud_Estado DEFAULT ('PENDIENTE'),
        Motivo                  NVARCHAR(500) NULL,
        Observacion             NVARCHAR(500) NULL,
        FechaCreacion           DATETIME2(0) NOT NULL CONSTRAINT DF_VacacionSolicitud_FechaCreacion DEFAULT (SYSDATETIME()),
        UsuarioCreacion         NVARCHAR(50) NOT NULL CONSTRAINT DF_VacacionSolicitud_UsuarioCreacion DEFAULT ('sistema'),
        FechaAprobacion         DATETIME2(0) NULL,
        UsuarioAprobacion       NVARCHAR(50) NULL,
        FechaRechazo            DATETIME2(0) NULL,
        UsuarioRechazo          NVARCHAR(50) NULL,
        MotivoRechazo           NVARCHAR(500) NULL,
        FechaCancelacion        DATETIME2(0) NULL,
        UsuarioCancelacion      NVARCHAR(50) NULL,
        MotivoCancelacion       NVARCHAR(500) NULL,
        FechaFinalizacion       DATETIME2(0) NULL,
        UsuarioFinalizacion     NVARCHAR(50) NULL,
        FechaModificacion       DATETIME2(0) NULL,
        UsuarioModificacion     NVARCHAR(50) NULL,
        CONSTRAINT PK_VacacionSolicitud PRIMARY KEY CLUSTERED (IdSolicitud),
        CONSTRAINT FK_VacacionSolicitud_EmpleadoCj FOREIGN KEY (IdEmpleado) REFERENCES dbo.EmpleadoCj (IdEmpleado),
        CONSTRAINT FK_VacacionSolicitud_VacacionPeriodo FOREIGN KEY (IdPeriodo) REFERENCES dbo.VacacionPeriodo (IdPeriodo),
        CONSTRAINT CK_VacacionSolicitud_CantidadDias CHECK (CantidadDias > 0),
        CONSTRAINT CK_VacacionSolicitud_RangoFechas CHECK (FechaFin >= FechaInicio)
    );

    CREATE INDEX IX_VacacionSolicitud_IdEmpleado
        ON dbo.VacacionSolicitud (IdEmpleado, Estado, FechaInicio DESC);

    CREATE INDEX IX_VacacionSolicitud_IdPeriodo
        ON dbo.VacacionSolicitud (IdPeriodo, Estado, IdSolicitud DESC);
END;
GO

IF OBJECT_ID('dbo.VacacionMovimiento', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.VacacionMovimiento
    (
        IdVacacionMovimiento    INT IDENTITY(1,1) NOT NULL,
        IdEmpleado              INT NOT NULL,
        IdPeriodo               INT NOT NULL,
        IdSolicitud             INT NULL,
        IdMovimientoOrigen      INT NULL,
        TipoMovimiento          NVARCHAR(30) NOT NULL,
        CantidadDias            DECIMAL(10,2) NOT NULL,
        FechaMovimiento         DATE NOT NULL,
        Estado                  NVARCHAR(20) NOT NULL CONSTRAINT DF_VacacionMovimiento_Estado DEFAULT ('APLICADO'),
        Referencia              NVARCHAR(100) NULL,
        Observacion             NVARCHAR(500) NULL,
        UsuarioCreacion         NVARCHAR(50) NOT NULL CONSTRAINT DF_VacacionMovimiento_UsuarioCreacion DEFAULT ('sistema'),
        FechaCreacion           DATETIME2(0) NOT NULL CONSTRAINT DF_VacacionMovimiento_FechaCreacion DEFAULT (SYSDATETIME()),
        UsuarioModificacion     NVARCHAR(50) NULL,
        FechaModificacion       DATETIME2(0) NULL,
        CONSTRAINT PK_VacacionMovimiento PRIMARY KEY CLUSTERED (IdVacacionMovimiento),
        CONSTRAINT FK_VacacionMovimiento_EmpleadoCj FOREIGN KEY (IdEmpleado) REFERENCES dbo.EmpleadoCj (IdEmpleado),
        CONSTRAINT FK_VacacionMovimiento_VacacionPeriodo FOREIGN KEY (IdPeriodo) REFERENCES dbo.VacacionPeriodo (IdPeriodo),
        CONSTRAINT FK_VacacionMovimiento_VacacionSolicitud FOREIGN KEY (IdSolicitud) REFERENCES dbo.VacacionSolicitud (IdSolicitud),
        CONSTRAINT FK_VacacionMovimiento_VacacionMovimientoOrigen FOREIGN KEY (IdMovimientoOrigen) REFERENCES dbo.VacacionMovimiento (IdVacacionMovimiento),
        CONSTRAINT CK_VacacionMovimiento_CantidadDias CHECK (CantidadDias <> 0),
        CONSTRAINT CK_VacacionMovimiento_Tipo CHECK (TipoMovimiento IN ('OTORGADO', 'RESERVA', 'CONSUMO', 'AJUSTE', 'REVERSA', 'LIQUIDACION'))
    );

    CREATE INDEX IX_VacacionMovimiento_IdEmpleado
        ON dbo.VacacionMovimiento (IdEmpleado, FechaMovimiento DESC, IdPeriodo);

    CREATE INDEX IX_VacacionMovimiento_IdPeriodo
        ON dbo.VacacionMovimiento (IdPeriodo, FechaMovimiento DESC, TipoMovimiento);

    CREATE INDEX IX_VacacionMovimiento_IdSolicitud
        ON dbo.VacacionMovimiento (IdSolicitud, FechaMovimiento DESC)
        WHERE IdSolicitud IS NOT NULL;
END;
GO
