/* Campos de staging utilizados por el modo ACTUALIZAR de la migración. */
IF COL_LENGTH('dbo.updimportar', 'StatusAtp') IS NULL
    ALTER TABLE dbo.updimportar ADD StatusAtp nvarchar(250) NULL;
GO

IF COL_LENGTH('dbo.updimportar', 'EstatusPap') IS NULL
    ALTER TABLE dbo.updimportar ADD EstatusPap nvarchar(250) NULL;
GO

IF COL_LENGTH('dbo.updimportar', 'EstatusOt') IS NULL
    ALTER TABLE dbo.updimportar ADD EstatusOt nvarchar(250) NULL;
GO

IF COL_LENGTH('dbo.updimportar', 'Capitalizacion') IS NULL
    ALTER TABLE dbo.updimportar ADD Capitalizacion nvarchar(250) NULL;
GO
