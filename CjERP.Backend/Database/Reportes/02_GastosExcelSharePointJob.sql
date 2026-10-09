-- Job GASTOS_EXCEL_SHAREPOINT: actualiza la tabla TBL_GASTOS del libro GASTOS.xlsx en SharePoint
-- con los gastos de Planilla (cliente/estado configurables, por defecto IdCliente=4 y Estado=4).
-- Es la versión versionada del esquema que GastosExcelSharePointRepository también crea solo si falta.
-- Idempotente. El job queda ACTIVO y se ejecuta automáticamente en la hora configurada (hora de Perú).

IF OBJECT_ID(N'dbo.GastosExcelSharePointJobConfig', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.GastosExcelSharePointJobConfig
    (
        Id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_GastosExcelSharePointJobConfig PRIMARY KEY,
        CodigoJob VARCHAR(100) NOT NULL CONSTRAINT UQ_GastosExcelSharePointJobConfig_Codigo UNIQUE,
        Activo BIT NOT NULL CONSTRAINT DF_GastosExcelSharePointJobConfig_Activo DEFAULT (1),
        HoraEjecucion VARCHAR(5) NOT NULL CONSTRAINT DF_GastosExcelSharePointJobConfig_Hora DEFAULT ('03:00'),
        CronExpression VARCHAR(100) NOT NULL CONSTRAINT DF_GastosExcelSharePointJobConfig_Cron DEFAULT ('0 3 * * *'),
        TimeZone VARCHAR(100) NOT NULL CONSTRAINT DF_GastosExcelSharePointJobConfig_TimeZone DEFAULT ('SA Pacific Standard Time'),
        IdCliente INT NOT NULL CONSTRAINT DF_GastosExcelSharePointJobConfig_IdCliente DEFAULT (4),
        EstadoPlanilla INT NOT NULL CONSTRAINT DF_GastosExcelSharePointJobConfig_Estado DEFAULT (4),
        UsuarioModificacion VARCHAR(200) NULL,
        FechaModificacion DATETIME2(0) NOT NULL CONSTRAINT DF_GastosExcelSharePointJobConfig_Fecha DEFAULT (SYSUTCDATETIME())
    );
END;

IF NOT EXISTS (SELECT 1 FROM dbo.GastosExcelSharePointJobConfig WHERE CodigoJob = 'GASTOS_EXCEL_SHAREPOINT')
BEGIN
    INSERT INTO dbo.GastosExcelSharePointJobConfig (CodigoJob, Activo, HoraEjecucion, CronExpression, TimeZone, IdCliente, EstadoPlanilla)
    VALUES ('GASTOS_EXCEL_SHAREPOINT', 1, '03:00', '0 3 * * *', 'SA Pacific Standard Time', 4, 4);
END;

-- Activa también la configuración que fue creada con la versión inicial del job, solo si nadie la ha guardado
-- todavía (UsuarioModificacion IS NULL): no pisa lo que un administrador haya desactivado.
UPDATE dbo.GastosExcelSharePointJobConfig
SET Activo = 1,
    FechaModificacion = SYSUTCDATETIME()
WHERE CodigoJob = 'GASTOS_EXCEL_SHAREPOINT'
  AND Activo = 0
  AND UsuarioModificacion IS NULL;

IF OBJECT_ID(N'dbo.GastosExcelSharePointLog', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.GastosExcelSharePointLog
    (
        Id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_GastosExcelSharePointLog PRIMARY KEY,
        TipoEjecucion VARCHAR(20) NOT NULL,
        IdCliente INT NOT NULL,
        EstadoPlanilla INT NOT NULL,
        Archivo VARCHAR(255) NOT NULL,
        Tabla VARCHAR(100) NOT NULL,
        CantidadRegistros INT NOT NULL CONSTRAINT DF_GastosExcelSharePointLog_Cantidad DEFAULT (0),
        Estado VARCHAR(20) NOT NULL,
        FechaInicioEjecucion DATETIMEOFFSET(0) NOT NULL,
        FechaFinEjecucion DATETIMEOFFSET(0) NULL,
        DuracionSegundos INT NOT NULL CONSTRAINT DF_GastosExcelSharePointLog_Duracion DEFAULT (0),
        Usuario VARCHAR(200) NULL,
        Mensaje NVARCHAR(1000) NULL,
        DetalleError NVARCHAR(MAX) NULL
    );
END;
