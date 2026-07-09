IF OBJECT_ID('dbo.EmpleadoCjSolicitudVigencia', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.EmpleadoCjSolicitudVigencia
    (
        IdSolicitudVigencia INT IDENTITY(1,1) NOT NULL,
        IdEmpleado INT NOT NULL,
        FechaFinActual DATE NULL,
        NuevaFechaFinLaboral DATE NOT NULL,
        EstadoSolicitud NVARCHAR(20) NOT NULL CONSTRAINT DF_EmpleadoCjSolicitudVigencia_EstadoSolicitud DEFAULT ('PENDIENTE'),
        Aprobacion1IdEmpleado INT NULL,
        Aprobacion1Usuario NVARCHAR(100) NULL,
        Aprobacion1Fecha DATETIME2(0) NULL,
        Aprobacion1Observacion NVARCHAR(500) NULL,
        Aprobacion2IdEmpleado INT NULL,
        Aprobacion2Usuario NVARCHAR(100) NULL,
        Aprobacion2Fecha DATETIME2(0) NULL,
        Aprobacion2Observacion NVARCHAR(500) NULL,
        Aprobacion3IdEmpleado INT NULL,
        Aprobacion3Usuario NVARCHAR(100) NULL,
        Aprobacion3Fecha DATETIME2(0) NULL,
        Aprobacion3Observacion NVARCHAR(500) NULL,
        FechaAplicacion DATETIME2(0) NULL,
        UsuarioCre NVARCHAR(100) NOT NULL CONSTRAINT DF_EmpleadoCjSolicitudVigencia_UsuarioCre DEFAULT ('SISTEMA'),
        FechaCreacion DATETIME2(0) NOT NULL CONSTRAINT DF_EmpleadoCjSolicitudVigencia_FechaCreacion DEFAULT (GETDATE()),
        UsuarioMod NVARCHAR(100) NOT NULL CONSTRAINT DF_EmpleadoCjSolicitudVigencia_UsuarioMod DEFAULT ('SISTEMA'),
        FechaMod DATETIME2(0) NOT NULL CONSTRAINT DF_EmpleadoCjSolicitudVigencia_FechaMod DEFAULT (GETDATE()),
        CONSTRAINT PK_EmpleadoCjSolicitudVigencia PRIMARY KEY CLUSTERED (IdSolicitudVigencia),
        CONSTRAINT CK_EmpleadoCjSolicitudVigencia_EstadoSolicitud CHECK (EstadoSolicitud IN ('PENDIENTE', 'APROBADO', 'RECHAZADO', 'ANULADO'))
    );

    CREATE UNIQUE INDEX UX_EmpleadoCjSolicitudVigencia_IdEmpleado_Pendiente
        ON dbo.EmpleadoCjSolicitudVigencia (IdEmpleado)
        WHERE EstadoSolicitud = 'PENDIENTE';

    CREATE INDEX IX_EmpleadoCjSolicitudVigencia_Estado_Fecha
        ON dbo.EmpleadoCjSolicitudVigencia (EstadoSolicitud, FechaCreacion DESC, IdSolicitudVigencia DESC);
END
