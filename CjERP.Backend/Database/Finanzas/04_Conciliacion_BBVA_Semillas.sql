SET NOCOUNT ON;
GO

-- Plantilla BBVA "Historico de Movimientos" para /finanzas/conciliacion_v1.
-- El backend asigna IdBanco = 3 a BBVA (BCP = 1, SCOTIABANK = 2), por eso se fuerza ese id.

IF NOT EXISTS (SELECT 1 FROM dbo.Bancos WHERE Codigo = 'BBVA')
BEGIN
    IF EXISTS (SELECT 1 FROM dbo.Bancos WHERE IdBanco = 3)
    BEGIN
        RAISERROR('IdBanco 3 ya esta ocupado por otro banco; BBVA debe usar IdBanco = 3.', 16, 1);
        RETURN;
    END;

    SET IDENTITY_INSERT dbo.Bancos ON;
    INSERT INTO dbo.Bancos (IdBanco, Codigo, Nombre, UsuarioCreacion)
    VALUES (3, 'BBVA', 'BBVA', SUSER_SNAME());
    SET IDENTITY_INSERT dbo.Bancos OFF;
END;
GO

DECLARE @BancoBbvaId INT = (SELECT IdBanco FROM dbo.Bancos WHERE Codigo = 'BBVA');

IF @BancoBbvaId <> 3
    RAISERROR('BBVA existe con un IdBanco distinto de 3; el backend espera 3.', 16, 1);

IF NOT EXISTS (SELECT 1 FROM dbo.PlantillasBanco WHERE IdBanco = @BancoBbvaId AND CodigoPlantilla = 'BBVA_HISTORICO_MOVIMIENTOS')
BEGIN
    INSERT INTO dbo.PlantillasBanco
        (IdBanco, CodigoPlantilla, NombrePlantilla, HojaPreferida, PatronDeteccion, OrdenPrioridad, UsuarioCreacion)
    VALUES
        (@BancoBbvaId, 'BBVA_HISTORICO_MOVIMIENTOS', 'BBVA Historico de Movimientos', NULL, 'Historico de Movimientos', 1, SUSER_SNAME());
END;

DECLARE @PlantillaBbvaId INT = (SELECT IdPlantillaBanco FROM dbo.PlantillasBanco WHERE IdBanco = @BancoBbvaId AND CodigoPlantilla = 'BBVA_HISTORICO_MOVIMIENTOS');

INSERT INTO dbo.PlantillasBancoColumna (IdPlantillaBanco, NombreCanonico, EncabezadoOriginal, TipoDato, Obligatorio, OrdenVisual)
SELECT @PlantillaBbvaId, v.NombreCanonico, v.EncabezadoOriginal, v.TipoDato, v.Obligatorio, v.OrdenVisual
FROM (VALUES
    ('Fecha', 'F. Operacion', 'DATE', 1, 1),
    ('FechaValuta', 'F. Valor', 'DATE', 0, 2),
    ('Referencia', 'Codigo', 'TEXT', 0, 3),
    ('NroOperacion', 'N. Doc.', 'TEXT', 1, 4),
    ('DescripcionOperacion', 'Concepto', 'TEXT', 1, 5),
    ('Monto', 'Importe', 'DECIMAL', 1, 6),
    ('SucursalAgencia', 'Oficina', 'TEXT', 0, 7)
) v(NombreCanonico, EncabezadoOriginal, TipoDato, Obligatorio, OrdenVisual)
WHERE NOT EXISTS
(
    SELECT 1 FROM dbo.PlantillasBancoColumna c
    WHERE c.IdPlantillaBanco = @PlantillaBbvaId
      AND c.NombreCanonico = v.NombreCanonico
      AND c.EncabezadoOriginal = v.EncabezadoOriginal
);
GO
