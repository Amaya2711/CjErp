/* Campos adicionales utilizados por la carga MIGRAR. */
IF COL_LENGTH('dbo.updimportar', 'Correlativo') IS NULL
    ALTER TABLE dbo.updimportar ADD Correlativo int NULL;
GO

IF COL_LENGTH('dbo.updimportar', 'IdZona') IS NULL
    ALTER TABLE dbo.updimportar ADD IdZona int NULL;
GO

IF COL_LENGTH('dbo.updimportar', 'Mes') IS NULL
    ALTER TABLE dbo.updimportar ADD Mes int NULL;
GO

IF COL_LENGTH('dbo.updimportar', 'Ano') IS NULL
    ALTER TABLE dbo.updimportar ADD Ano int NULL;
GO

IF COL_LENGTH('dbo.updimportar', 'Estado_Oc') IS NULL
    ALTER TABLE dbo.updimportar ADD Estado_Oc nvarchar(100) NULL;
GO

IF COL_LENGTH('dbo.updimportar', 'Nro_Oc') IS NULL
    ALTER TABLE dbo.updimportar ADD Nro_Oc nvarchar(100) NULL;
GO

IF COL_LENGTH('dbo.updimportar', 'Posicion') IS NULL
    ALTER TABLE dbo.updimportar ADD Posicion nvarchar(100) NULL;
GO

IF COL_LENGTH('dbo.updimportar', 'MontoOc') IS NULL
    ALTER TABLE dbo.updimportar ADD MontoOc numeric(18, 2) NULL;
GO

IF COL_LENGTH('dbo.updimportar', 'MontoLiq') IS NULL
    ALTER TABLE dbo.updimportar ADD MontoLiq numeric(18, 2) NULL;
GO

IF COL_LENGTH('dbo.updimportar', 'Porcentaje') IS NULL
    ALTER TABLE dbo.updimportar ADD Porcentaje numeric(18, 2) NULL;
GO
