SET NOCOUNT ON;
GO

-- Plantilla Interbank "Consulta de Movimientos de Cuenta Corriente" para /finanzas/conciliacion_v1.
-- El backend asigna IdBanco = 4 a INTERBANK (BCP = 1, SCOTIABANK = 2, BBVA = 3).
-- Requiere haber ejecutado antes 04_Conciliacion_BBVA_Semillas.sql.

IF NOT EXISTS (SELECT 1 FROM dbo.Bancos WHERE Codigo = 'INTERBANK')
BEGIN
    IF EXISTS (SELECT 1 FROM dbo.Bancos WHERE IdBanco = 4)
    BEGIN
        RAISERROR('IdBanco 4 ya esta ocupado por otro banco; INTERBANK debe usar IdBanco = 4.', 16, 1);
        RETURN;
    END;

    SET IDENTITY_INSERT dbo.Bancos ON;
    INSERT INTO dbo.Bancos (IdBanco, Codigo, Nombre, UsuarioCreacion)
    VALUES (4, 'INTERBANK', 'Interbank', SUSER_SNAME());
    SET IDENTITY_INSERT dbo.Bancos OFF;
END;
GO

DECLARE @BancoId INT = (SELECT IdBanco FROM dbo.Bancos WHERE Codigo = 'INTERBANK');

IF @BancoId <> 4
    RAISERROR('INTERBANK existe con un IdBanco distinto de 4; el backend espera 4.', 16, 1);

IF NOT EXISTS (SELECT 1 FROM dbo.PlantillasBanco WHERE IdBanco = @BancoId AND CodigoPlantilla = 'INTERBANK_MOVIMIENTOS_CC')
BEGIN
    INSERT INTO dbo.PlantillasBanco
        (IdBanco, CodigoPlantilla, NombrePlantilla, HojaPreferida, PatronDeteccion, OrdenPrioridad, UsuarioCreacion)
    VALUES
        (@BancoId, 'INTERBANK_MOVIMIENTOS_CC', 'Interbank Consulta de Movimientos de Cuenta Corriente', NULL,
         'Consulta de Movimientos de Cuenta Corriente', 1, SUSER_SNAME());
END;

DECLARE @PlantillaId INT = (SELECT IdPlantillaBanco FROM dbo.PlantillasBanco WHERE IdBanco = @BancoId AND CodigoPlantilla = 'INTERBANK_MOVIMIENTOS_CC');

INSERT INTO dbo.PlantillasBancoColumna (IdPlantillaBanco, NombreCanonico, EncabezadoOriginal, TipoDato, Obligatorio, OrdenVisual)
SELECT @PlantillaId, v.NombreCanonico, v.EncabezadoOriginal, v.TipoDato, v.Obligatorio, v.OrdenVisual
FROM (VALUES
    ('Fecha', 'Fecha de operacion', 'DATE', 1, 1),
    ('FechaValuta', 'Fecha de proceso', 'DATE', 0, 2),
    ('NroOperacion', 'Nro. de operacion', 'TEXT', 0, 3),
    ('DescripcionOperacion', 'Movimiento + Descripcion', 'TEXT', 1, 4),
    ('SucursalAgencia', 'Canal', 'TEXT', 0, 5),
    ('Monto', 'Cargo / Abono', 'DECIMAL', 1, 6)
) v(NombreCanonico, EncabezadoOriginal, TipoDato, Obligatorio, OrdenVisual)
WHERE NOT EXISTS
(
    SELECT 1 FROM dbo.PlantillasBancoColumna c
    WHERE c.IdPlantillaBanco = @PlantillaId
      AND c.NombreCanonico = v.NombreCanonico
      AND c.EncabezadoOriginal = v.EncabezadoOriginal
);
GO
