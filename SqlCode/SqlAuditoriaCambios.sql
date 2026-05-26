IF OBJECT_ID('dbo.AuditoriaCambios', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.AuditoriaCambios
    (
        IdAuditoria BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        Modulo NVARCHAR(100) NOT NULL,
        Entidad NVARCHAR(100) NOT NULL,
        IdRegistro NVARCHAR(100) NOT NULL,
        Accion NVARCHAR(20) NOT NULL,
        Seccion NVARCHAR(100) NULL,
        Campo NVARCHAR(100) NOT NULL,
        ValorAnterior NVARCHAR(MAX) NULL,
        ValorNuevo NVARCHAR(MAX) NULL,
        UsuarioAccion NVARCHAR(100) NOT NULL,
        FechaAccion DATETIME2(0) NOT NULL CONSTRAINT DF_AuditoriaCambios_FechaAccion DEFAULT SYSDATETIME(),
        Observacion NVARCHAR(250) NULL
    );

    CREATE INDEX IX_AuditoriaCambios_EntidadRegistroFecha
        ON dbo.AuditoriaCambios (Entidad, IdRegistro, FechaAccion DESC);

    CREATE INDEX IX_AuditoriaCambios_ModuloFecha
        ON dbo.AuditoriaCambios (Modulo, FechaAccion DESC);
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_AuditoriaCambios_Registrar
    @Modulo NVARCHAR(100),
    @Entidad NVARCHAR(100),
    @IdRegistro NVARCHAR(100),
    @Accion NVARCHAR(20),
    @Seccion NVARCHAR(100) = NULL,
    @Campo NVARCHAR(100),
    @ValorAnterior NVARCHAR(MAX) = NULL,
    @ValorNuevo NVARCHAR(MAX) = NULL,
    @UsuarioAccion NVARCHAR(100),
    @Observacion NVARCHAR(250) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    INSERT INTO dbo.AuditoriaCambios
    (
        Modulo,
        Entidad,
        IdRegistro,
        Accion,
        Seccion,
        Campo,
        ValorAnterior,
        ValorNuevo,
        UsuarioAccion,
        Observacion
    )
    VALUES
    (
        LTRIM(RTRIM(@Modulo)),
        LTRIM(RTRIM(@Entidad)),
        LTRIM(RTRIM(@IdRegistro)),
        UPPER(LTRIM(RTRIM(@Accion))),
        NULLIF(LTRIM(RTRIM(@Seccion)), ''),
        LTRIM(RTRIM(@Campo)),
        NULLIF(@ValorAnterior, ''),
        NULLIF(@ValorNuevo, ''),
        LTRIM(RTRIM(@UsuarioAccion)),
        NULLIF(LTRIM(RTRIM(@Observacion)), '')
    );
END;
GO
