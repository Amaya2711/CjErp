IF COL_LENGTH('dbo.updimportar', 'Moneda') IS NULL
BEGIN
    ALTER TABLE dbo.updimportar
    ADD Moneda nvarchar(100) NULL;
END;
GO

IF COL_LENGTH('dbo.updimportar', 'IdMoneda') IS NULL
BEGIN
    ALTER TABLE dbo.updimportar
    ADD IdMoneda int NULL;
END;
GO

IF COL_LENGTH('dbo.updimportar', 'MontoBck') IS NULL
BEGIN
    ALTER TABLE dbo.updimportar
    ADD MontoBck numeric(18, 2) NULL;
END;
GO
