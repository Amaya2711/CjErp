/* Campos requeridos para reproducir las validaciones del MIGRAR legado.
   updimportar recibe el Excel; Importar conserva los valores finales. */
IF COL_LENGTH('dbo.updimportar', 'Zona') IS NULL
    ALTER TABLE dbo.updimportar ADD Zona nvarchar(250) NULL;
GO

IF COL_LENGTH('dbo.updimportar', 'Work') IS NULL
    ALTER TABLE dbo.updimportar ADD Work nvarchar(250) NULL;
GO

IF COL_LENGTH('dbo.updimportar', 'Empleado') IS NULL
    ALTER TABLE dbo.updimportar ADD Empleado nvarchar(250) NULL;
GO

IF COL_LENGTH('dbo.updimportar', 'Esting') IS NULL
    ALTER TABLE dbo.updimportar ADD Esting nvarchar(250) NULL;
GO

IF COL_LENGTH('dbo.updimportar', 'Plano') IS NULL
    ALTER TABLE dbo.updimportar ADD Plano nvarchar(250) NULL;
GO

IF COL_LENGTH('dbo.updimportar', 'Valmet') IS NULL
    ALTER TABLE dbo.updimportar ADD Valmet nvarchar(250) NULL;
GO

IF COL_LENGTH('dbo.updimportar', 'StatusCw') IS NULL
    ALTER TABLE dbo.updimportar ADD StatusCw nvarchar(250) NULL;
GO

IF COL_LENGTH('dbo.updimportar', 'StatusRini') IS NULL
    ALTER TABLE dbo.updimportar ADD StatusRini nvarchar(250) NULL;
GO

IF COL_LENGTH('dbo.Importar', 'Work') IS NULL
    ALTER TABLE dbo.Importar ADD Work nvarchar(250) NULL;
GO

IF COL_LENGTH('dbo.Importar', 'Zona') IS NULL
    ALTER TABLE dbo.Importar ADD Zona nvarchar(250) NULL;
GO

IF COL_LENGTH('dbo.Importar', 'Empleado') IS NULL
    ALTER TABLE dbo.Importar ADD Empleado nvarchar(250) NULL;
GO

IF COL_LENGTH('dbo.Importar', 'Esting') IS NULL
    ALTER TABLE dbo.Importar ADD Esting nvarchar(250) NULL;
GO

IF COL_LENGTH('dbo.Importar', 'Plano') IS NULL
    ALTER TABLE dbo.Importar ADD Plano nvarchar(250) NULL;
GO

IF COL_LENGTH('dbo.Importar', 'Valmet') IS NULL
    ALTER TABLE dbo.Importar ADD Valmet nvarchar(250) NULL;
GO

IF COL_LENGTH('dbo.Importar', 'Status_Cw') IS NULL
    ALTER TABLE dbo.Importar ADD Status_Cw nvarchar(250) NULL;
GO

IF COL_LENGTH('dbo.Importar', 'Status_Rini') IS NULL
    ALTER TABLE dbo.Importar ADD Status_Rini nvarchar(250) NULL;
GO
