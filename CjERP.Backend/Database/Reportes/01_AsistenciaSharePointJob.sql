IF OBJECT_ID(N'dbo.AsistenciaSharePointJobConfig', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.AsistenciaSharePointJobConfig
    (
        Id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_AsistenciaSharePointJobConfig PRIMARY KEY,
        CodigoJob VARCHAR(100) NOT NULL CONSTRAINT UQ_AsistenciaSharePointJobConfig_Codigo UNIQUE,
        Activo BIT NOT NULL CONSTRAINT DF_AsistenciaSharePointJobConfig_Activo DEFAULT (1),
        HoraEjecucion VARCHAR(5) NOT NULL CONSTRAINT DF_AsistenciaSharePointJobConfig_Hora DEFAULT ('02:00'),
        CronExpression VARCHAR(100) NOT NULL CONSTRAINT DF_AsistenciaSharePointJobConfig_Cron DEFAULT ('0 2 * * *'),
        TimeZone VARCHAR(100) NOT NULL CONSTRAINT DF_AsistenciaSharePointJobConfig_TimeZone DEFAULT ('SA Pacific Standard Time'),
        UsuarioModificacion VARCHAR(200) NULL,
        FechaModificacion DATETIME2(0) NOT NULL CONSTRAINT DF_AsistenciaSharePointJobConfig_Fecha DEFAULT (SYSUTCDATETIME())
    );
END;

IF NOT EXISTS (SELECT 1 FROM dbo.AsistenciaSharePointJobConfig WHERE CodigoJob = 'ASISTENCIA_SHAREPOINT')
BEGIN
    INSERT INTO dbo.AsistenciaSharePointJobConfig (CodigoJob, Activo, HoraEjecucion, CronExpression, TimeZone)
    VALUES ('ASISTENCIA_SHAREPOINT', 1, '02:00', '0 2 * * *', 'SA Pacific Standard Time');
END;

IF OBJECT_ID(N'dbo.AsistenciaSharePointExportLog', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.AsistenciaSharePointExportLog
    (
        Id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_AsistenciaSharePointExportLog PRIMARY KEY,
        TipoEjecucion VARCHAR(20) NOT NULL,
        FechaInicio DATE NOT NULL,
        FechaFin DATE NOT NULL,
        NombreArchivo VARCHAR(255) NOT NULL,
        CantidadRegistros INT NOT NULL CONSTRAINT DF_AsistenciaSharePointExportLog_Cantidad DEFAULT (0),
        Estado VARCHAR(20) NOT NULL,
        FechaInicioEjecucion DATETIMEOFFSET(0) NOT NULL,
        FechaFinEjecucion DATETIMEOFFSET(0) NULL,
        DuracionSegundos INT NOT NULL CONSTRAINT DF_AsistenciaSharePointExportLog_Duracion DEFAULT (0),
        Usuario VARCHAR(200) NULL,
        Mensaje NVARCHAR(1000) NULL,
        DetalleError NVARCHAR(MAX) NULL
    );
END;
