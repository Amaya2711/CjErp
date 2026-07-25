SET NOCOUNT ON;
GO

DECLARE @BancoBcpId INT;
DECLARE @BancoScotiaId INT;

IF NOT EXISTS (SELECT 1 FROM dbo.Bancos WHERE Codigo = 'BCP')
BEGIN
    INSERT INTO dbo.Bancos (Codigo, Nombre, UsuarioCreacion)
    VALUES ('BCP', 'BCP', SUSER_SNAME());
END;

IF NOT EXISTS (SELECT 1 FROM dbo.Bancos WHERE Codigo = 'SCOTIABANK')
BEGIN
    INSERT INTO dbo.Bancos (Codigo, Nombre, UsuarioCreacion)
    VALUES ('SCOTIABANK', 'Scotiabank', SUSER_SNAME());
END;

SELECT @BancoBcpId = IdBanco FROM dbo.Bancos WHERE Codigo = 'BCP';
SELECT @BancoScotiaId = IdBanco FROM dbo.Bancos WHERE Codigo = 'SCOTIABANK';

IF NOT EXISTS (SELECT 1 FROM dbo.PlantillasBanco WHERE IdBanco = @BancoBcpId AND CodigoPlantilla = 'BCP_ACCOUNTDETAIL')
BEGIN
    INSERT INTO dbo.PlantillasBanco
    (
        IdBanco, CodigoPlantilla, NombrePlantilla, HojaPreferida, PatronDeteccion, OrdenPrioridad, UsuarioCreacion
    )
    VALUES
    (
        @BancoBcpId, 'BCP_ACCOUNTDETAIL', 'BCP AccountDetail', 'AccountDetail', 'AccountDetail', 1, SUSER_SNAME()
    );
END;

IF NOT EXISTS (SELECT 1 FROM dbo.PlantillasBanco WHERE IdBanco = @BancoScotiaId AND CodigoPlantilla = 'SCOTIABANK_MOVIMIENTOS')
BEGIN
    INSERT INTO dbo.PlantillasBanco
    (
        IdBanco, CodigoPlantilla, NombrePlantilla, HojaPreferida, PatronDeteccion, OrdenPrioridad, UsuarioCreacion
    )
    VALUES
    (
        @BancoScotiaId, 'SCOTIABANK_MOVIMIENTOS', 'Scotiabank Movimientos de Cuenta', 'Movimientos de Cuenta', 'Movimientos de Cuenta', 1, SUSER_SNAME()
    );
END;

DECLARE @PlantillaBcpId INT = (SELECT IdPlantillaBanco FROM dbo.PlantillasBanco WHERE IdBanco = @BancoBcpId AND CodigoPlantilla = 'BCP_ACCOUNTDETAIL');
DECLARE @PlantillaScotiaId INT = (SELECT IdPlantillaBanco FROM dbo.PlantillasBanco WHERE IdBanco = @BancoScotiaId AND CodigoPlantilla = 'SCOTIABANK_MOVIMIENTOS');

IF @PlantillaBcpId IS NOT NULL
BEGIN
    INSERT INTO dbo.PlantillasBancoColumna (IdPlantillaBanco, NombreCanonico, EncabezadoOriginal, TipoDato, Obligatorio, OrdenVisual)
    SELECT @PlantillaBcpId, v.NombreCanonico, v.EncabezadoOriginal, v.TipoDato, v.Obligatorio, v.OrdenVisual
    FROM (VALUES
        ('Empresa', 'Empresa', 'TEXT', 0, 1),
        ('Cuenta', 'Cuenta', 'TEXT', 1, 2),
        ('Moneda', 'Moneda', 'TEXT', 1, 3),
        ('Fecha', 'Fecha', 'DATE', 1, 4),
        ('FechaValuta', 'Fecha valuta', 'DATE', 0, 5),
        ('Proveedor', 'Proveedor', 'TEXT', 0, 6),
        ('ItemSistema', 'Item del sistema', 'TEXT', 0, 7),
        ('DescripcionOperacion', 'Descripcion operacion', 'TEXT', 1, 8),
        ('Monto', 'Monto', 'DECIMAL', 1, 9),
        ('SucursalAgencia', 'Sucursal - agencia', 'TEXT', 0, 10),
        ('NroOperacion', 'Nº operacion', 'TEXT', 0, 11),
        ('Usuario', 'Usuario', 'TEXT', 0, 12)
    ) v(NombreCanonico, EncabezadoOriginal, TipoDato, Obligatorio, OrdenVisual)
    WHERE NOT EXISTS
    (
        SELECT 1
        FROM dbo.PlantillasBancoColumna c
        WHERE c.IdPlantillaBanco = @PlantillaBcpId
          AND c.NombreCanonico = v.NombreCanonico
          AND c.EncabezadoOriginal = v.EncabezadoOriginal
    );
END;

IF @PlantillaScotiaId IS NOT NULL
BEGIN
    INSERT INTO dbo.PlantillasBancoColumna (IdPlantillaBanco, NombreCanonico, EncabezadoOriginal, TipoDato, Obligatorio, OrdenVisual)
    SELECT @PlantillaScotiaId, v.NombreCanonico, v.EncabezadoOriginal, v.TipoDato, v.Obligatorio, v.OrdenVisual
    FROM (VALUES
        ('Cuenta', 'Cuenta Corriente', 'TEXT', 1, 1),
        ('Moneda', 'Moneda', 'TEXT', 1, 2),
        ('Fecha', 'Fecha', 'DATE', 1, 3),
        ('DescripcionOperacion', 'Movimiento', 'TEXT', 1, 4),
        ('Monto', 'Importe', 'DECIMAL', 1, 5),
        ('Referencia', 'Referencia', 'TEXT', 0, 6),
        ('Modulo', 'Modulo', 'TEXT', 0, 7),
        ('Transaccion', 'Transac.', 'TEXT', 0, 8),
        ('Relacion', 'Relacion', 'TEXT', 0, 9)
    ) v(NombreCanonico, EncabezadoOriginal, TipoDato, Obligatorio, OrdenVisual)
    WHERE NOT EXISTS
    (
        SELECT 1
        FROM dbo.PlantillasBancoColumna c
        WHERE c.IdPlantillaBanco = @PlantillaScotiaId
          AND c.NombreCanonico = v.NombreCanonico
          AND c.EncabezadoOriginal = v.EncabezadoOriginal
    );
END;
GO
