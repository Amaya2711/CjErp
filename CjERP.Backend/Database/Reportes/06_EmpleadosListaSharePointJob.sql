-- Job EMPLEADOS_LISTA_SHAREPOINT: ejecuta dbo.sp_Consultar_EmpleadoSharepoint (no versionado, PV) y sincroniza
-- la lista M_EMPLEADOS de SharePoint (sitio CJ-TELECOM): crea los que faltan y modifica solo los campos distintos.
-- Nunca elimina ni recrea registros. Versión versionada del esquema que EmpleadosListaSharePointRepository
-- también crea solo si falta. Idempotente. NACE INACTIVO: activarlo desde la pestaña "Empleado Excel sharepoint".

IF OBJECT_ID(N'dbo.EmpleadosListaSharePointJobConfig', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.EmpleadosListaSharePointJobConfig
    (
        Id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_EmpleadosListaSharePointJobConfig PRIMARY KEY,
        CodigoJob VARCHAR(100) NOT NULL CONSTRAINT UQ_EmpleadosListaSharePointJobConfig_Codigo UNIQUE,
        Activo BIT NOT NULL CONSTRAINT DF_EmpleadosListaSharePointJobConfig_Activo DEFAULT (0),
        HoraEjecucion VARCHAR(5) NOT NULL CONSTRAINT DF_EmpleadosListaSharePointJobConfig_Hora DEFAULT ('04:00'),
        CronExpression VARCHAR(100) NOT NULL CONSTRAINT DF_EmpleadosListaSharePointJobConfig_Cron DEFAULT ('0 4 * * *'),
        TimeZone VARCHAR(100) NOT NULL CONSTRAINT DF_EmpleadosListaSharePointJobConfig_TimeZone DEFAULT ('SA Pacific Standard Time'),
        UsuarioModificacion VARCHAR(200) NULL,
        FechaModificacion DATETIME2(0) NOT NULL CONSTRAINT DF_EmpleadosListaSharePointJobConfig_Fecha DEFAULT (SYSUTCDATETIME())
    );
END;

IF NOT EXISTS (SELECT 1 FROM dbo.EmpleadosListaSharePointJobConfig WHERE CodigoJob = 'EMPLEADOS_LISTA_SHAREPOINT')
BEGIN
    INSERT INTO dbo.EmpleadosListaSharePointJobConfig (CodigoJob, Activo, HoraEjecucion, CronExpression, TimeZone)
    VALUES ('EMPLEADOS_LISTA_SHAREPOINT', 0, '04:00', '0 4 * * *', 'SA Pacific Standard Time');
END;

IF OBJECT_ID(N'dbo.EmpleadosListaSharePointLog', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.EmpleadosListaSharePointLog
    (
        Id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_EmpleadosListaSharePointLog PRIMARY KEY,
        TipoEjecucion VARCHAR(20) NOT NULL,
        Lista VARCHAR(255) NOT NULL,
        CantidadRegistros INT NOT NULL CONSTRAINT DF_EmpleadosListaSharePointLog_Cant DEFAULT (0),
        CantidadCreados INT NOT NULL CONSTRAINT DF_EmpleadosListaSharePointLog_Cre DEFAULT (0),
        CantidadActualizados INT NOT NULL CONSTRAINT DF_EmpleadosListaSharePointLog_Act DEFAULT (0),
        CantidadSinCambios INT NOT NULL CONSTRAINT DF_EmpleadosListaSharePointLog_Sin DEFAULT (0),
        Estado VARCHAR(20) NOT NULL,
        FechaInicioEjecucion DATETIMEOFFSET(0) NOT NULL,
        FechaFinEjecucion DATETIMEOFFSET(0) NULL,
        DuracionSegundos INT NOT NULL CONSTRAINT DF_EmpleadosListaSharePointLog_Dur DEFAULT (0),
        Usuario VARCHAR(200) NULL,
        Mensaje NVARCHAR(1000) NULL,
        DetalleError NVARCHAR(MAX) NULL
    );
END;
