SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

/*
    Modulo: Arrendamientos
    Objetivo:
    - Extender el versionamiento de contratos para registrar adendas, ampliaciones
      y modificaciones sin perder historial.
    - Guardar el cambio por servicio para comparar importe/moneda/vigencia anterior y nueva.
*/

IF OBJECT_ID('dbo.a_contrato_version', 'U') IS NOT NULL
BEGIN
    IF COL_LENGTH('dbo.a_contrato_version', 'FechaVigenciaDesde') IS NULL
    BEGIN
        ALTER TABLE dbo.a_contrato_version
            ADD FechaVigenciaDesde DATE NULL;
    END;

    IF COL_LENGTH('dbo.a_contrato_version', 'FechaVigenciaHasta') IS NULL
    BEGIN
        ALTER TABLE dbo.a_contrato_version
            ADD FechaVigenciaHasta DATE NULL;
    END;

    IF COL_LENGTH('dbo.a_contrato_version', 'ImporteAlquilerAnterior') IS NULL
    BEGIN
        ALTER TABLE dbo.a_contrato_version
            ADD ImporteAlquilerAnterior DECIMAL(18,2) NULL;
    END;

    IF COL_LENGTH('dbo.a_contrato_version', 'ImporteAlquilerNuevo') IS NULL
    BEGIN
        ALTER TABLE dbo.a_contrato_version
            ADD ImporteAlquilerNuevo DECIMAL(18,2) NULL;
    END;

    IF COL_LENGTH('dbo.a_contrato_version', 'ImporteMantenimientoAnterior') IS NULL
    BEGIN
        ALTER TABLE dbo.a_contrato_version
            ADD ImporteMantenimientoAnterior DECIMAL(18,2) NULL;
    END;

    IF COL_LENGTH('dbo.a_contrato_version', 'ImporteMantenimientoNuevo') IS NULL
    BEGIN
        ALTER TABLE dbo.a_contrato_version
            ADD ImporteMantenimientoNuevo DECIMAL(18,2) NULL;
    END;

    IF COL_LENGTH('dbo.a_contrato_version', 'ImporteCocheraAnterior') IS NULL
    BEGIN
        ALTER TABLE dbo.a_contrato_version
            ADD ImporteCocheraAnterior DECIMAL(18,2) NULL;
    END;

    IF COL_LENGTH('dbo.a_contrato_version', 'ImporteCocheraNuevo') IS NULL
    BEGIN
        ALTER TABLE dbo.a_contrato_version
            ADD ImporteCocheraNuevo DECIMAL(18,2) NULL;
    END;

    IF COL_LENGTH('dbo.a_contrato_version', 'MonedaAnterior') IS NULL
    BEGIN
        ALTER TABLE dbo.a_contrato_version
            ADD MonedaAnterior CHAR(3) NULL;
    END;

    IF COL_LENGTH('dbo.a_contrato_version', 'MonedaNueva') IS NULL
    BEGIN
        ALTER TABLE dbo.a_contrato_version
            ADD MonedaNueva CHAR(3) NULL;
    END;
END;
GO

IF OBJECT_ID('dbo.a_contrato_version_detalle', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.a_contrato_version_detalle
    (
        IdContratoVersionDetalle INT IDENTITY(1,1) NOT NULL,
        IdContratoVersion INT NOT NULL,
        Servicio NVARCHAR(50) NOT NULL,
        MonedaAnterior CHAR(3) NULL,
        ImporteAnterior DECIMAL(18,2) NULL,
        MonedaNueva CHAR(3) NULL,
        ImporteNuevo DECIMAL(18,2) NULL,
        PeriodicidadAnterior NVARCHAR(30) NULL,
        PeriodicidadNueva NVARCHAR(30) NULL,
        DiaLimiteAnterior INT NULL,
        DiaLimiteNuevo INT NULL,
        Observacion NVARCHAR(500) NULL,
        UsuarioCreacion NVARCHAR(100) NOT NULL CONSTRAINT DF_a_contrato_version_detalle_UsuarioCreacion DEFAULT ('sistema'),
        FechaCreacion DATETIME2(0) NOT NULL CONSTRAINT DF_a_contrato_version_detalle_FechaCreacion DEFAULT (SYSDATETIME()),
        UsuarioModificacion NVARCHAR(100) NULL,
        FechaModificacion DATETIME2(0) NULL,
        CONSTRAINT PK_a_contrato_version_detalle PRIMARY KEY CLUSTERED (IdContratoVersionDetalle),
        CONSTRAINT FK_a_contrato_version_detalle_a_contrato_version
            FOREIGN KEY (IdContratoVersion) REFERENCES dbo.a_contrato_version (IdContratoVersion)
    );

    CREATE INDEX IX_a_contrato_version_detalle_Version
        ON dbo.a_contrato_version_detalle (IdContratoVersion, Servicio);
END;
GO
