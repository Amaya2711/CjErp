SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF OBJECT_ID('dbo.Bancos', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Bancos
    (
        IdBanco INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Bancos PRIMARY KEY,
        Codigo VARCHAR(20) NOT NULL,
        Nombre VARCHAR(100) NOT NULL,
        Activo BIT NOT NULL CONSTRAINT DF_Bancos_Activo DEFAULT (1),
        FechaCreacion DATETIME2(0) NOT NULL CONSTRAINT DF_Bancos_FechaCreacion DEFAULT (SYSDATETIME()),
        UsuarioCreacion VARCHAR(100) NULL
    );

    CREATE UNIQUE INDEX UX_Bancos_Codigo ON dbo.Bancos(Codigo);
END;
GO

IF OBJECT_ID('dbo.PlantillasBanco', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.PlantillasBanco
    (
        IdPlantillaBanco INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_PlantillasBanco PRIMARY KEY,
        IdBanco INT NOT NULL,
        CodigoPlantilla VARCHAR(50) NOT NULL,
        NombrePlantilla VARCHAR(150) NOT NULL,
        HojaPreferida VARCHAR(100) NULL,
        PatronDeteccion VARCHAR(250) NULL,
        OrdenPrioridad INT NOT NULL CONSTRAINT DF_PlantillasBanco_OrdenPrioridad DEFAULT (1),
        Activo BIT NOT NULL CONSTRAINT DF_PlantillasBanco_Activo DEFAULT (1),
        FechaCreacion DATETIME2(0) NOT NULL CONSTRAINT DF_PlantillasBanco_FechaCreacion DEFAULT (SYSDATETIME()),
        UsuarioCreacion VARCHAR(100) NULL,
        CONSTRAINT FK_PlantillasBanco_Bancos FOREIGN KEY (IdBanco) REFERENCES dbo.Bancos(IdBanco)
    );

    CREATE UNIQUE INDEX UX_PlantillasBanco_Codigo ON dbo.PlantillasBanco(IdBanco, CodigoPlantilla);
END;
GO

IF OBJECT_ID('dbo.PlantillasBancoColumna', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.PlantillasBancoColumna
    (
        IdPlantillaBancoColumna INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_PlantillasBancoColumna PRIMARY KEY,
        IdPlantillaBanco INT NOT NULL,
        NombreCanonico VARCHAR(50) NOT NULL,
        EncabezadoOriginal VARCHAR(150) NOT NULL,
        TipoDato VARCHAR(30) NULL,
        Obligatorio BIT NOT NULL CONSTRAINT DF_PlantillasBancoColumna_Obligatorio DEFAULT (0),
        OrdenVisual INT NOT NULL CONSTRAINT DF_PlantillasBancoColumna_OrdenVisual DEFAULT (1),
        Activo BIT NOT NULL CONSTRAINT DF_PlantillasBancoColumna_Activo DEFAULT (1),
        CONSTRAINT FK_PlantillasBancoColumna_PlantillasBanco FOREIGN KEY (IdPlantillaBanco) REFERENCES dbo.PlantillasBanco(IdPlantillaBanco)
    );

    CREATE UNIQUE INDEX UX_PlantillasBancoColumna ON dbo.PlantillasBancoColumna(IdPlantillaBanco, NombreCanonico, EncabezadoOriginal);
END;
GO

IF OBJECT_ID('dbo.MovimientosConciliacion', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.MovimientosConciliacion
    (
        IdMovimientoBanco INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_MovimientosConciliacion PRIMARY KEY,
        IdBanco INT NOT NULL,
        CodigoBanco VARCHAR(20) NOT NULL,
        IdPlantillaBanco INT NULL,
        CodigoPlantillaBanco VARCHAR(50) NULL,
        Empresa VARCHAR(250) NULL,
        Cuenta VARCHAR(100) NULL,
        Moneda VARCHAR(20) NULL,
        Fecha DATE NULL,
        FechaValuta DATE NULL,
        Proveedor VARCHAR(250) NULL,
        ItemSistema VARCHAR(250) NULL,
        DescripcionOperacion VARCHAR(500) NULL,
        CDR VARCHAR(150) NULL,
        Referencia VARCHAR(250) NULL,
        Modulo VARCHAR(150) NULL,
        Transaccion VARCHAR(150) NULL,
        Relacion VARCHAR(150) NULL,
        Monto DECIMAL(18,2) NULL,
        SucursalAgencia VARCHAR(150) NULL,
        NroOperacion VARCHAR(100) NULL,
        Usuario VARCHAR(100) NULL,
        ArchivoOrigen VARCHAR(255) NULL,
        FechaImportacion DATETIME2(0) NOT NULL CONSTRAINT DF_MovimientosConciliacion_FechaImportacion DEFAULT (SYSDATETIME()),
        UsuarioImportacion VARCHAR(100) NULL,
        IdActivo BIT NOT NULL CONSTRAINT DF_MovimientosConciliacion_IdActivo DEFAULT (1),
        EsNroOperacionValido BIT NOT NULL CONSTRAINT DF_MovimientosConciliacion_EsNroOperacionValido DEFAULT (0),
        TipoMovimientoBanco VARCHAR(80) NULL,
        EstadoConciliacion VARCHAR(80) NULL,
        Comentario VARCHAR(500) NULL,
        IdAreaFlujo INT NULL,
        IdReferencia INT NULL,
        IdCuentaContable INT NULL,
        IdReglaContable INT NULL,
        EsConciliado BIT NULL,
        FechaConciliacion DATETIME2(0) NULL,
        UsuarioConciliacion VARCHAR(100) NULL,
        ObservacionConciliacion VARCHAR(500) NULL,
        CamposExtraJson NVARCHAR(MAX) NULL
    );

    CREATE UNIQUE INDEX UX_MovimientosBancarios_Unico
        ON dbo.MovimientosConciliacion
        (IdBanco, Cuenta, Fecha, Monto, NroOperacion, DescripcionOperacion);
END;
GO

IF COL_LENGTH('dbo.MovimientosConciliacion', 'CDR') IS NULL
BEGIN
    ALTER TABLE dbo.MovimientosConciliacion
        ADD CDR VARCHAR(150) NULL;
END;
GO

IF OBJECT_ID('dbo.ConciliacionAuditoria', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.ConciliacionAuditoria
    (
        IdAuditoria BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_ConciliacionAuditoria PRIMARY KEY,
        Entidad VARCHAR(100) NOT NULL,
        IdRegistro VARCHAR(50) NOT NULL,
        Accion VARCHAR(30) NOT NULL,
        Campo VARCHAR(100) NULL,
        ValorAnterior NVARCHAR(MAX) NULL,
        ValorNuevo NVARCHAR(MAX) NULL,
        Usuario VARCHAR(100) NULL,
        FechaAuditoria DATETIME2(0) NOT NULL CONSTRAINT DF_ConciliacionAuditoria_FechaAuditoria DEFAULT (SYSDATETIME()),
        IdBanco INT NULL,
        IdPlantillaBanco INT NULL,
        ArchivoOrigen VARCHAR(255) NULL
    );
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_MovimientosConciliacion_Insertar
    @FilasJson NVARCHAR(MAX)
AS
BEGIN
    SET NOCOUNT ON;

    IF ISJSON(@FilasJson) <> 1
    BEGIN
        RAISERROR('El payload JSON no es valido.', 16, 1);
        RETURN;
    END;

    ;WITH src AS
    (
        SELECT
            TRY_CONVERT(INT, JSON_VALUE(value, '$.IdBanco')) AS IdBanco,
            JSON_VALUE(value, '$.CodigoBanco') AS CodigoBanco,
            TRY_CONVERT(INT, JSON_VALUE(value, '$.IdPlantillaBanco')) AS IdPlantillaBanco,
            JSON_VALUE(value, '$.CodigoPlantillaBanco') AS CodigoPlantillaBanco,
            JSON_VALUE(value, '$.Empresa') AS Empresa,
            JSON_VALUE(value, '$.Cuenta') AS Cuenta,
            JSON_VALUE(value, '$.Moneda') AS Moneda,
            TRY_CONVERT(DATE, JSON_VALUE(value, '$.Fecha')) AS Fecha,
            TRY_CONVERT(DATE, JSON_VALUE(value, '$.FechaValuta')) AS FechaValuta,
            JSON_VALUE(value, '$.Proveedor') AS Proveedor,
            JSON_VALUE(value, '$.ItemSistema') AS ItemSistema,
            JSON_VALUE(value, '$.DescripcionOperacion') AS DescripcionOperacion,
            JSON_VALUE(value, '$.CDR') AS CDR,
            JSON_VALUE(value, '$.Referencia') AS Referencia,
            JSON_VALUE(value, '$.Modulo') AS Modulo,
            JSON_VALUE(value, '$.Transaccion') AS Transaccion,
            JSON_VALUE(value, '$.Relacion') AS Relacion,
            TRY_CONVERT(DECIMAL(18,2), JSON_VALUE(value, '$.Monto')) AS Monto,
            JSON_VALUE(value, '$.SucursalAgencia') AS SucursalAgencia,
            JSON_VALUE(value, '$.NroOperacion') AS NroOperacion,
            JSON_VALUE(value, '$.Usuario') AS Usuario,
            JSON_VALUE(value, '$.ArchivoOrigen') AS ArchivoOrigen,
            JSON_VALUE(value, '$.UsuarioImportacion') AS UsuarioImportacion,
            TRY_CONVERT(BIT, JSON_VALUE(value, '$.IdActivo')) AS IdActivo,
            TRY_CONVERT(BIT, JSON_VALUE(value, '$.EsNroOperacionValido')) AS EsNroOperacionValido,
            JSON_VALUE(value, '$.TipoMovimientoBanco') AS TipoMovimientoBanco,
            JSON_VALUE(value, '$.EstadoConciliacion') AS EstadoConciliacion,
            JSON_VALUE(value, '$.Comentario') AS Comentario,
            TRY_CONVERT(INT, JSON_VALUE(value, '$.IdAreaFlujo')) AS IdAreaFlujo,
            TRY_CONVERT(INT, JSON_VALUE(value, '$.IdReferencia')) AS IdReferencia,
            TRY_CONVERT(INT, JSON_VALUE(value, '$.IdCuentaContable')) AS IdCuentaContable,
            TRY_CONVERT(INT, JSON_VALUE(value, '$.IdReglaContable')) AS IdReglaContable,
            TRY_CONVERT(BIT, JSON_VALUE(value, '$.EsConciliado')) AS EsConciliado,
            TRY_CONVERT(DATETIME2(0), JSON_VALUE(value, '$.FechaConciliacion')) AS FechaConciliacion,
            JSON_VALUE(value, '$.UsuarioConciliacion') AS UsuarioConciliacion,
            JSON_VALUE(value, '$.ObservacionConciliacion') AS ObservacionConciliacion,
            JSON_QUERY(value, '$.CamposExtraJson') AS CamposExtraJson
        FROM OPENJSON(@FilasJson)
    )
    INSERT INTO dbo.MovimientosConciliacion
    (
        IdBanco, CodigoBanco, IdPlantillaBanco, CodigoPlantillaBanco, Empresa, Cuenta, Moneda,
        Fecha, FechaValuta, Proveedor, ItemSistema, DescripcionOperacion, CDR, Referencia, Modulo,
        Transaccion, Relacion, Monto, SucursalAgencia, NroOperacion, Usuario, ArchivoOrigen,
        UsuarioImportacion, IdActivo, EsNroOperacionValido, TipoMovimientoBanco, EstadoConciliacion,
        Comentario, IdAreaFlujo, IdReferencia, IdCuentaContable, IdReglaContable, EsConciliado,
        FechaConciliacion, UsuarioConciliacion, ObservacionConciliacion, CamposExtraJson
    )
    SELECT
        ISNULL(IdBanco, 1),
        ISNULL(CodigoBanco, 'BCP'),
        IdPlantillaBanco,
        CodigoPlantillaBanco,
        Empresa, Cuenta, Moneda,
        Fecha, FechaValuta, Proveedor, ItemSistema, DescripcionOperacion, CDR, Referencia, Modulo,
        Transaccion, Relacion, Monto, SucursalAgencia, NroOperacion, Usuario, ArchivoOrigen,
        UsuarioImportacion, ISNULL(IdActivo, 1), ISNULL(EsNroOperacionValido, 0), TipoMovimientoBanco, EstadoConciliacion,
        Comentario, IdAreaFlujo, IdReferencia, IdCuentaContable, IdReglaContable, EsConciliado,
        FechaConciliacion, UsuarioConciliacion, ObservacionConciliacion, CamposExtraJson
    FROM src;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_MovimientosConciliacion_Buscar
    @IdBanco INT = NULL,
    @NroOperacion VARCHAR(100) = NULL,
    @DescripcionOperacion VARCHAR(500) = NULL,
    @TextoBusqueda VARCHAR(250) = NULL,
    @TipoBusqueda VARCHAR(30) = NULL,
    @Empresa VARCHAR(250) = NULL,
    @Cuenta VARCHAR(100) = NULL,
    @Moneda VARCHAR(20) = NULL,
    @FechaInicio DATE = NULL,
    @FechaFin DATE = NULL,
    @IdActivo BIT = NULL,
    @IdAreaFlujo INT = NULL,
    @IdReferencia INT = NULL,
    @IdCuentaContable INT = NULL,
    @EsConciliado BIT = NULL
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        mov.IdMovimientoBanco,
        mov.IdBanco,
        mov.CodigoBanco,
        mov.IdPlantillaBanco,
        mov.CodigoPlantillaBanco,
        mov.Empresa,
        mov.Cuenta,
        mov.Moneda,
        mov.Fecha,
        mov.FechaValuta,
        mov.Proveedor,
        mov.ItemSistema,
        mov.DescripcionOperacion,
        mov.CDR,
        mov.Referencia,
        mov.Modulo,
        mov.Transaccion,
        mov.Relacion,
        mov.Monto,
        mov.SucursalAgencia,
        mov.NroOperacion,
        mov.Usuario,
        mov.ArchivoOrigen,
        mov.FechaImportacion,
        mov.UsuarioImportacion,
        mov.IdActivo,
        mov.EsNroOperacionValido,
        mov.TipoMovimientoBanco,
        mov.EstadoConciliacion,
        mov.Comentario,
        mov.IdAreaFlujo,
        mov.IdReferencia,
        mov.IdCuentaContable,
        mov.IdReglaContable,
        mov.EsConciliado,
        mov.FechaConciliacion,
        mov.UsuarioConciliacion,
        mov.ObservacionConciliacion,
        af.NombreAreaFlujo,
        af.Descripcion AS DescripcionAreaFlujo,
        cref.CodigoReferencia,
        cref.NombreReferencia,
        cref.Descripcion AS DescripcionReferencia,
        pcc.CodigoCuenta,
        pcc.NombreCuenta,
        CONCAT(ISNULL(pcc.CodigoCuenta, ''), CASE WHEN pcc.CodigoCuenta IS NOT NULL AND pcc.NombreCuenta IS NOT NULL THEN ' - ' ELSE '' END, ISNULL(pcc.NombreCuenta, '')) AS CuentaContableTexto,
        rcon.Orden,
        rcon.EsPrincipal,
        rcon.RequiereComprobante,
        rcon.AplicaConciliacion,
        rcon.Observacion AS ObservacionReglaContable,
        CASE
            WHEN mov.EsConciliado = 1 THEN 'CONCILIADO'
            WHEN UPPER(ISNULL(af.NombreAreaFlujo, '')) = 'NO CONSIDERAR' THEN 'NO CONSIDERAR'
            WHEN ISNULL(rcon.AplicaConciliacion, 1) = 0 THEN 'NO APLICA'
            ELSE 'PENDIENTE'
        END AS EstadoConciliacionTexto,
        CASE
            WHEN UPPER(ISNULL(af.NombreAreaFlujo, '')) = 'NO CONSIDERAR' THEN 'NO CONSIDERAR'
            WHEN ISNULL(rcon.AplicaConciliacion, 1) = 0 THEN 'NO APLICA'
            WHEN mov.EsConciliado = 1 THEN 'CONCILIADO'
            ELSE 'PENDIENTE'
        END AS EstadoOperativoConciliacion
    FROM dbo.MovimientosConciliacion mov
    LEFT JOIN dbo.ConciliacionAreaFlujo af
        ON af.IdAreaFlujo = mov.IdAreaFlujo
    LEFT JOIN dbo.ConciliacionReferencia cref
        ON cref.IdReferencia = mov.IdReferencia
    LEFT JOIN dbo.PlanCuentaContable pcc
        ON pcc.IdCuentaContable = mov.IdCuentaContable
    LEFT JOIN dbo.ConciliacionReglaContable rcon
        ON rcon.IdReglaContable = mov.IdReglaContable
    WHERE (@IdBanco IS NULL OR mov.IdBanco = @IdBanco)
      AND (@IdActivo IS NULL OR mov.IdActivo = @IdActivo)
      AND (@EsConciliado IS NULL OR mov.EsConciliado = @EsConciliado)
      AND (@IdAreaFlujo IS NULL OR mov.IdAreaFlujo = @IdAreaFlujo)
      AND (@IdReferencia IS NULL OR mov.IdReferencia = @IdReferencia)
      AND (@IdCuentaContable IS NULL OR mov.IdCuentaContable = @IdCuentaContable)
      AND (
            @Empresa IS NULL OR LTRIM(RTRIM(@Empresa)) = '' OR mov.Empresa LIKE '%' + LTRIM(RTRIM(@Empresa)) + '%'
          )
      AND (
            @Cuenta IS NULL OR LTRIM(RTRIM(@Cuenta)) = '' OR mov.Cuenta LIKE '%' + LTRIM(RTRIM(@Cuenta)) + '%'
          )
      AND (
            @Moneda IS NULL OR LTRIM(RTRIM(@Moneda)) = '' OR mov.Moneda = LTRIM(RTRIM(@Moneda))
          )
      AND (
            @FechaInicio IS NULL OR mov.Fecha >= @FechaInicio
          )
      AND (
            @FechaFin IS NULL OR mov.Fecha <= @FechaFin
          )
      AND (
            @NroOperacion IS NULL OR LTRIM(RTRIM(@NroOperacion)) = '' OR mov.NroOperacion LIKE '%' + LTRIM(RTRIM(@NroOperacion)) + '%'
          )
      AND (
            @DescripcionOperacion IS NULL OR LTRIM(RTRIM(@DescripcionOperacion)) = '' OR mov.DescripcionOperacion LIKE '%' + LTRIM(RTRIM(@DescripcionOperacion)) + '%'
          )
      AND (
            @TextoBusqueda IS NULL OR LTRIM(RTRIM(@TextoBusqueda)) = '' OR
            mov.Empresa LIKE '%' + LTRIM(RTRIM(@TextoBusqueda)) + '%' OR
            mov.Cuenta LIKE '%' + LTRIM(RTRIM(@TextoBusqueda)) + '%' OR
            mov.DescripcionOperacion LIKE '%' + LTRIM(RTRIM(@TextoBusqueda)) + '%' OR
            mov.NroOperacion LIKE '%' + LTRIM(RTRIM(@TextoBusqueda)) + '%'
          )
    ORDER BY mov.Fecha DESC, mov.Empresa, mov.Cuenta, mov.NroOperacion, mov.IdMovimientoBanco;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_MovimientosConciliacion_ActualizarClasificacionContable
    @IdMovimientoBanco INT,
    @IdAreaFlujo INT,
    @IdReferencia INT,
    @IdCuentaContable INT,
    @IdReglaContable INT,
    @UsuarioConciliacion VARCHAR(100) = NULL,
    @ObservacionConciliacion VARCHAR(500) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS
    (
        SELECT 1
        FROM dbo.MovimientosConciliacion WITH (UPDLOCK, HOLDLOCK)
        WHERE IdMovimientoBanco = @IdMovimientoBanco
    )
    BEGIN
        RAISERROR('No se encontro el movimiento bancario.', 16, 1);
        RETURN;
    END;

    UPDATE dbo.MovimientosConciliacion
    SET IdAreaFlujo = @IdAreaFlujo,
        IdReferencia = @IdReferencia,
        IdCuentaContable = @IdCuentaContable,
        IdReglaContable = @IdReglaContable,
        EsConciliado = 1,
        EstadoConciliacion = 'CONCILIADO',
        FechaConciliacion = SYSDATETIME(),
        UsuarioConciliacion = LTRIM(RTRIM(ISNULL(@UsuarioConciliacion, ''))),
        ObservacionConciliacion = NULLIF(LTRIM(RTRIM(@ObservacionConciliacion)), '')
    WHERE IdMovimientoBanco = @IdMovimientoBanco;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_MovimientosConciliacion_ObtenerCombosClasificacionContable
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        af.IdAreaFlujo,
        af.NombreAreaFlujo
    FROM dbo.ConciliacionAreaFlujo af
    WHERE af.IdActivo = 1
    ORDER BY af.NombreAreaFlujo;

    SELECT
        r.IdReferencia,
        r.CodigoReferencia,
        r.NombreReferencia
    FROM dbo.ConciliacionReferencia r
    WHERE r.IdActivo = 1
    ORDER BY r.CodigoReferencia, r.NombreReferencia;

    SELECT
        p.IdCuentaContable,
        p.CodigoCuenta,
        p.NombreCuenta,
        CONCAT(ISNULL(p.CodigoCuenta, ''), ' - ', ISNULL(p.NombreCuenta, '')) AS CuentaContableTexto
    FROM dbo.PlanCuentaContable p
    WHERE p.IdActivo = 1
    ORDER BY p.CodigoCuenta, p.NombreCuenta;

    SELECT
        rc.IdReglaContable,
        rc.IdAreaFlujo,
        rc.IdReferencia,
        rc.IdCuentaContable,
        rc.Orden,
        rc.EsPrincipal,
        rc.RequiereComprobante,
        rc.AplicaConciliacion,
        rc.Observacion
    FROM dbo.ConciliacionReglaContable rc
    WHERE rc.IdActivo = 1
    ORDER BY rc.IdAreaFlujo, rc.IdReferencia, rc.IdCuentaContable, rc.Orden, rc.IdReglaContable;
END;
GO
