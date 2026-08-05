SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

/*
    Modulo: Arrendamientos
    Objetivo:
    - Crear las tablas base y procedimientos principales para administrar arrendadores,
      inquilinos, inmuebles, unidades, contratos, obligaciones, pagos, fraccionamientos,
      garantias, arbitrios, cobranza y tipo de cambio.
    Convencion:
    - Prefijo a_ para las tablas del modulo.
    - Monedas en CHAR(3).
    - Importes en DECIMAL(18,2) o DECIMAL(18,4) segun corresponda.
    - Historico por versionamiento, sin borrado fisico de movimientos validos.
*/

IF OBJECT_ID('dbo.a_parametro', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.a_parametro
    (
        IdParametro INT IDENTITY(1,1) NOT NULL,
        Codigo NVARCHAR(100) NOT NULL,
        ValorTexto NVARCHAR(500) NULL,
        ValorNumero DECIMAL(18,6) NULL,
        ValorFecha DATE NULL,
        Activo BIT NOT NULL CONSTRAINT DF_a_parametro_Activo DEFAULT (1),
        Observacion NVARCHAR(500) NULL,
        UsuarioCreacion NVARCHAR(100) NOT NULL CONSTRAINT DF_a_parametro_UsuarioCreacion DEFAULT ('sistema'),
        FechaCreacion DATETIME2(0) NOT NULL CONSTRAINT DF_a_parametro_FechaCreacion DEFAULT (SYSDATETIME()),
        UsuarioModificacion NVARCHAR(100) NULL,
        FechaModificacion DATETIME2(0) NULL,
        CONSTRAINT PK_a_parametro PRIMARY KEY CLUSTERED (IdParametro)
    );

    CREATE UNIQUE INDEX UX_a_parametro_Codigo
        ON dbo.a_parametro (Codigo);
END;
GO

IF OBJECT_ID('dbo.a_tipo_cambio_diario', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.a_tipo_cambio_diario
    (
        IdTipoCambioDiario INT IDENTITY(1,1) NOT NULL,
        FechaTipoCambio DATE NOT NULL,
        MonedaOrigen CHAR(3) NOT NULL,
        MonedaDestino CHAR(3) NOT NULL,
        Compra DECIMAL(18,6) NOT NULL,
        Venta DECIMAL(18,6) NOT NULL,
        Promedio AS (([Compra] + [Venta]) / (2.0)) PERSISTED,
        Fuente NVARCHAR(100) NULL,
        EsManual BIT NOT NULL CONSTRAINT DF_a_tipo_cambio_diario_EsManual DEFAULT (0),
        Activo BIT NOT NULL CONSTRAINT DF_a_tipo_cambio_diario_Activo DEFAULT (1),
        Observacion NVARCHAR(500) NULL,
        UsuarioCreacion NVARCHAR(100) NOT NULL CONSTRAINT DF_a_tipo_cambio_diario_UsuarioCreacion DEFAULT ('sistema'),
        FechaCreacion DATETIME2(0) NOT NULL CONSTRAINT DF_a_tipo_cambio_diario_FechaCreacion DEFAULT (SYSDATETIME()),
        UsuarioModificacion NVARCHAR(100) NULL,
        FechaModificacion DATETIME2(0) NULL,
        CONSTRAINT PK_a_tipo_cambio_diario PRIMARY KEY CLUSTERED (IdTipoCambioDiario),
        CONSTRAINT CK_a_tipo_cambio_diario_Monedas CHECK (LEN(MonedaOrigen) = 3 AND LEN(MonedaDestino) = 3),
        CONSTRAINT CK_a_tipo_cambio_diario_Valores CHECK (Compra > 0 AND Venta > 0)
    );

    CREATE UNIQUE INDEX UX_a_tipo_cambio_diario_FechaMoneda
        ON dbo.a_tipo_cambio_diario (FechaTipoCambio, MonedaOrigen, MonedaDestino);

    CREATE INDEX IX_a_tipo_cambio_diario_Activo
        ON dbo.a_tipo_cambio_diario (Activo, FechaTipoCambio DESC);
END;
GO

IF OBJECT_ID('dbo.a_arrendador', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.a_arrendador
    (
        IdArrendador INT IDENTITY(1,1) NOT NULL,
        CodigoArrendador NVARCHAR(50) NOT NULL,
        TipoDocumento NVARCHAR(20) NULL,
        NumeroDocumento NVARCHAR(30) NULL,
        RazonSocial NVARCHAR(250) NOT NULL,
        NombreComercial NVARCHAR(250) NULL,
        Contacto NVARCHAR(150) NULL,
        Telefono NVARCHAR(50) NULL,
        Correo NVARCHAR(150) NULL,
        Direccion NVARCHAR(500) NULL,
        IdEmpleadoResponsable INT NULL,
        Activo BIT NOT NULL CONSTRAINT DF_a_arrendador_Activo DEFAULT (1),
        Observacion NVARCHAR(500) NULL,
        UsuarioCreacion NVARCHAR(100) NOT NULL CONSTRAINT DF_a_arrendador_UsuarioCreacion DEFAULT ('sistema'),
        FechaCreacion DATETIME2(0) NOT NULL CONSTRAINT DF_a_arrendador_FechaCreacion DEFAULT (SYSDATETIME()),
        UsuarioModificacion NVARCHAR(100) NULL,
        FechaModificacion DATETIME2(0) NULL,
        CONSTRAINT PK_a_arrendador PRIMARY KEY CLUSTERED (IdArrendador)
    );

    CREATE UNIQUE INDEX UX_a_arrendador_Codigo
        ON dbo.a_arrendador (CodigoArrendador);
END;
GO

IF OBJECT_ID('dbo.a_inquilino', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.a_inquilino
    (
        IdInquilino INT IDENTITY(1,1) NOT NULL,
        CodigoInquilino NVARCHAR(50) NOT NULL,
        TipoDocumento NVARCHAR(20) NULL,
        NumeroDocumento NVARCHAR(30) NULL,
        RazonSocial NVARCHAR(250) NOT NULL,
        NombreComercial NVARCHAR(250) NULL,
        Contacto NVARCHAR(150) NULL,
        Telefono NVARCHAR(50) NULL,
        Correo NVARCHAR(150) NULL,
        Direccion NVARCHAR(500) NULL,
        IdEmpleadoResponsable INT NULL,
        Activo BIT NOT NULL CONSTRAINT DF_a_inquilino_Activo DEFAULT (1),
        Observacion NVARCHAR(500) NULL,
        UsuarioCreacion NVARCHAR(100) NOT NULL CONSTRAINT DF_a_inquilino_UsuarioCreacion DEFAULT ('sistema'),
        FechaCreacion DATETIME2(0) NOT NULL CONSTRAINT DF_a_inquilino_FechaCreacion DEFAULT (SYSDATETIME()),
        UsuarioModificacion NVARCHAR(100) NULL,
        FechaModificacion DATETIME2(0) NULL,
        CONSTRAINT PK_a_inquilino PRIMARY KEY CLUSTERED (IdInquilino)
    );

    CREATE UNIQUE INDEX UX_a_inquilino_Codigo
        ON dbo.a_inquilino (CodigoInquilino);
END;
GO

IF OBJECT_ID('dbo.a_inmueble', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.a_inmueble
    (
        IdInmueble INT IDENTITY(1,1) NOT NULL,
        CodigoInmueble NVARCHAR(50) NOT NULL,
        NombreInmueble NVARCHAR(250) NOT NULL,
        TipoInmueble NVARCHAR(50) NOT NULL,
        DireccionCompleta NVARCHAR(500) NULL,
        Ubigeo NVARCHAR(20) NULL,
        Referencia NVARCHAR(250) NULL,
        IdEmpleadoResponsable INT NULL,
        Activo BIT NOT NULL CONSTRAINT DF_a_inmueble_Activo DEFAULT (1),
        Observacion NVARCHAR(500) NULL,
        UsuarioCreacion NVARCHAR(100) NOT NULL CONSTRAINT DF_a_inmueble_UsuarioCreacion DEFAULT ('sistema'),
        FechaCreacion DATETIME2(0) NOT NULL CONSTRAINT DF_a_inmueble_FechaCreacion DEFAULT (SYSDATETIME()),
        UsuarioModificacion NVARCHAR(100) NULL,
        FechaModificacion DATETIME2(0) NULL,
        CONSTRAINT PK_a_inmueble PRIMARY KEY CLUSTERED (IdInmueble)
    );

    CREATE UNIQUE INDEX UX_a_inmueble_Codigo
        ON dbo.a_inmueble (CodigoInmueble);
END;
GO

IF OBJECT_ID('dbo.a_unidad', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.a_unidad
    (
        IdUnidad INT IDENTITY(1,1) NOT NULL,
        IdInmueble INT NOT NULL,
        CodigoUnidad NVARCHAR(50) NOT NULL,
        NombreUnidad NVARCHAR(250) NOT NULL,
        TipoUnidad NVARCHAR(30) NOT NULL,
        Piso NVARCHAR(50) NULL,
        AreaM2 DECIMAL(18,2) NULL,
        Descripcion NVARCHAR(500) NULL,
        Activo BIT NOT NULL CONSTRAINT DF_a_unidad_Activo DEFAULT (1),
        Observacion NVARCHAR(500) NULL,
        UsuarioCreacion NVARCHAR(100) NOT NULL CONSTRAINT DF_a_unidad_UsuarioCreacion DEFAULT ('sistema'),
        FechaCreacion DATETIME2(0) NOT NULL CONSTRAINT DF_a_unidad_FechaCreacion DEFAULT (SYSDATETIME()),
        UsuarioModificacion NVARCHAR(100) NULL,
        FechaModificacion DATETIME2(0) NULL,
        CONSTRAINT PK_a_unidad PRIMARY KEY CLUSTERED (IdUnidad),
        CONSTRAINT FK_a_unidad_a_inmueble FOREIGN KEY (IdInmueble) REFERENCES dbo.a_inmueble (IdInmueble),
        CONSTRAINT CK_a_unidad_AreaM2 CHECK (AreaM2 IS NULL OR AreaM2 >= 0)
    );

    CREATE UNIQUE INDEX UX_a_unidad_InmuebleCodigo
        ON dbo.a_unidad (IdInmueble, CodigoUnidad);

    CREATE INDEX IX_a_unidad_Inmueble
        ON dbo.a_unidad (IdInmueble, Activo, NombreUnidad);
END;
GO

IF OBJECT_ID('dbo.a_concepto', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.a_concepto
    (
        IdConcepto INT IDENTITY(1,1) NOT NULL,
        CodigoConcepto NVARCHAR(50) NOT NULL,
        NombreConcepto NVARCHAR(150) NOT NULL,
        TipoConcepto NVARCHAR(30) NOT NULL,
        EsObligacionMensual BIT NOT NULL CONSTRAINT DF_a_concepto_EsObligacionMensual DEFAULT (1),
        EsObligacionFutura BIT NOT NULL CONSTRAINT DF_a_concepto_EsObligacionFutura DEFAULT (0),
        Activo BIT NOT NULL CONSTRAINT DF_a_concepto_Activo DEFAULT (1),
        Observacion NVARCHAR(500) NULL,
        UsuarioCreacion NVARCHAR(100) NOT NULL CONSTRAINT DF_a_concepto_UsuarioCreacion DEFAULT ('sistema'),
        FechaCreacion DATETIME2(0) NOT NULL CONSTRAINT DF_a_concepto_FechaCreacion DEFAULT (SYSDATETIME()),
        UsuarioModificacion NVARCHAR(100) NULL,
        FechaModificacion DATETIME2(0) NULL,
        CONSTRAINT PK_a_concepto PRIMARY KEY CLUSTERED (IdConcepto)
    );

    CREATE UNIQUE INDEX UX_a_concepto_Codigo
        ON dbo.a_concepto (CodigoConcepto);
END;
GO

IF OBJECT_ID('dbo.a_contrato', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.a_contrato
    (
        IdContrato INT IDENTITY(1,1) NOT NULL,
        CodigoContrato NVARCHAR(50) NOT NULL,
        IdArrendador INT NOT NULL,
        IdInquilino INT NOT NULL,
        IdInmueble INT NOT NULL,
        IdUnidadPrincipal INT NULL,
        FechaFirma DATE NULL,
        FechaInicio DATE NOT NULL,
        FechaFin DATE NOT NULL,
        Moneda CHAR(3) NOT NULL,
        ImporteAlquiler DECIMAL(18,2) NOT NULL CONSTRAINT DF_a_contrato_ImporteAlquiler DEFAULT (0),
        PeriodicidadAlquiler NVARCHAR(30) NOT NULL CONSTRAINT DF_a_contrato_PeriodicidadAlquiler DEFAULT ('MENSUAL'),
        DiaLimitePago INT NOT NULL CONSTRAINT DF_a_contrato_DiaLimitePago DEFAULT (5),
        DiasGracia INT NOT NULL CONSTRAINT DF_a_contrato_DiasGracia DEFAULT (0),
        ImporteMantenimiento DECIMAL(18,2) NOT NULL CONSTRAINT DF_a_contrato_ImporteMantenimiento DEFAULT (0),
        PeriodicidadMantenimiento NVARCHAR(30) NOT NULL CONSTRAINT DF_a_contrato_PeriodicidadMantenimiento DEFAULT ('MENSUAL'),
        DiaLimiteMantenimiento INT NOT NULL CONSTRAINT DF_a_contrato_DiaLimiteMantenimiento DEFAULT (5),
        GarantiaPactada DECIMAL(18,2) NOT NULL CONSTRAINT DF_a_contrato_GarantiaPactada DEFAULT (0),
        GarantiaPagada DECIMAL(18,2) NOT NULL CONSTRAINT DF_a_contrato_GarantiaPagada DEFAULT (0),
        GarantiaPendiente DECIMAL(18,2) NOT NULL CONSTRAINT DF_a_contrato_GarantiaPendiente DEFAULT (0),
        TipoReajuste NVARCHAR(50) NULL,
        PorcentajeReajuste DECIMAL(18,6) NULL,
        FormulaReajuste NVARCHAR(500) NULL,
        FrecuenciaReajuste NVARCHAR(30) NULL,
        PenalidadMora DECIMAL(18,2) NOT NULL CONSTRAINT DF_a_contrato_PenalidadMora DEFAULT (0),
        InteresMoratorio DECIMAL(18,2) NOT NULL CONSTRAINT DF_a_contrato_InteresMoratorio DEFAULT (0),
        EstadoContrato NVARCHAR(30) NOT NULL CONSTRAINT DF_a_contrato_EstadoContrato DEFAULT ('ACTIVO'),
        Observaciones NVARCHAR(1000) NULL,
        DocumentoFirmadoNombre NVARCHAR(250) NULL,
        DocumentoFirmadoUrl NVARCHAR(1000) NULL,
        DocumentoFirmadoTamanoKB DECIMAL(18,2) NULL,
        IdEmpleadoResponsable INT NULL,
        FechaSuspension DATE NULL,
        FechaCancelacion DATE NULL,
        MotivoCancelacion NVARCHAR(500) NULL,
        Activo BIT NOT NULL CONSTRAINT DF_a_contrato_Activo DEFAULT (1),
        UsuarioCreacion NVARCHAR(100) NOT NULL CONSTRAINT DF_a_contrato_UsuarioCreacion DEFAULT ('sistema'),
        FechaCreacion DATETIME2(0) NOT NULL CONSTRAINT DF_a_contrato_FechaCreacion DEFAULT (SYSDATETIME()),
        UsuarioModificacion NVARCHAR(100) NULL,
        FechaModificacion DATETIME2(0) NULL,
        CONSTRAINT PK_a_contrato PRIMARY KEY CLUSTERED (IdContrato),
        CONSTRAINT CK_a_contrato_Moneda CHECK (LEN(Moneda) = 3),
        CONSTRAINT CK_a_contrato_Fechas CHECK (FechaFin >= FechaInicio),
        CONSTRAINT CK_a_contrato_Importes CHECK (
            ImporteAlquiler >= 0 AND
            ImporteMantenimiento >= 0 AND
            GarantiaPactada >= 0 AND
            GarantiaPagada >= 0 AND
            GarantiaPendiente >= 0 AND
            PenalidadMora >= 0 AND
            InteresMoratorio >= 0
        ),
        CONSTRAINT FK_a_contrato_a_arrendador FOREIGN KEY (IdArrendador) REFERENCES dbo.a_arrendador (IdArrendador),
        CONSTRAINT FK_a_contrato_a_inquilino FOREIGN KEY (IdInquilino) REFERENCES dbo.a_inquilino (IdInquilino),
        CONSTRAINT FK_a_contrato_a_inmueble FOREIGN KEY (IdInmueble) REFERENCES dbo.a_inmueble (IdInmueble)
    );

    CREATE UNIQUE INDEX UX_a_contrato_Codigo
        ON dbo.a_contrato (CodigoContrato);

    CREATE INDEX IX_a_contrato_Inquilino
        ON dbo.a_contrato (IdInquilino, EstadoContrato, FechaInicio DESC);

    CREATE INDEX IX_a_contrato_Arrendador
        ON dbo.a_contrato (IdArrendador, EstadoContrato, FechaInicio DESC);
END;
GO

IF OBJECT_ID('dbo.a_contrato', 'U') IS NOT NULL
   AND OBJECT_ID('dbo.a_unidad', 'U') IS NOT NULL
   AND NOT EXISTS (
        SELECT 1
        FROM sys.foreign_keys
        WHERE name = 'FK_a_contrato_a_unidad_Principal'
    )
BEGIN
    ALTER TABLE dbo.a_contrato
        ADD CONSTRAINT FK_a_contrato_a_unidad_Principal FOREIGN KEY (IdUnidadPrincipal) REFERENCES dbo.a_unidad (IdUnidad);
END;
GO

IF OBJECT_ID('dbo.a_contrato_unidad', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.a_contrato_unidad
    (
        IdContratoUnidad INT IDENTITY(1,1) NOT NULL,
        IdContrato INT NOT NULL,
        IdUnidad INT NOT NULL,
        FechaInicio DATE NOT NULL,
        FechaFin DATE NULL,
        AreaM2 DECIMAL(18,2) NULL,
        CanonMensual DECIMAL(18,2) NULL,
        Estado NVARCHAR(20) NOT NULL CONSTRAINT DF_a_contrato_unidad_Estado DEFAULT ('ACTIVO'),
        Observacion NVARCHAR(500) NULL,
        UsuarioCreacion NVARCHAR(100) NOT NULL CONSTRAINT DF_a_contrato_unidad_UsuarioCreacion DEFAULT ('sistema'),
        FechaCreacion DATETIME2(0) NOT NULL CONSTRAINT DF_a_contrato_unidad_FechaCreacion DEFAULT (SYSDATETIME()),
        UsuarioModificacion NVARCHAR(100) NULL,
        FechaModificacion DATETIME2(0) NULL,
        CONSTRAINT PK_a_contrato_unidad PRIMARY KEY CLUSTERED (IdContratoUnidad),
        CONSTRAINT FK_a_contrato_unidad_a_contrato FOREIGN KEY (IdContrato) REFERENCES dbo.a_contrato (IdContrato),
        CONSTRAINT FK_a_contrato_unidad_a_unidad FOREIGN KEY (IdUnidad) REFERENCES dbo.a_unidad (IdUnidad),
        CONSTRAINT CK_a_contrato_unidad_Fechas CHECK (FechaFin IS NULL OR FechaFin >= FechaInicio),
        CONSTRAINT CK_a_contrato_unidad_Canon CHECK (CanonMensual IS NULL OR CanonMensual >= 0),
        CONSTRAINT CK_a_contrato_unidad_Area CHECK (AreaM2 IS NULL OR AreaM2 >= 0)
    );

    CREATE INDEX IX_a_contrato_unidad_Contrato
        ON dbo.a_contrato_unidad (IdContrato, Estado, FechaInicio DESC);

    CREATE INDEX IX_a_contrato_unidad_Unidad
        ON dbo.a_contrato_unidad (IdUnidad, Estado, FechaInicio DESC);
END;
GO

IF OBJECT_ID('dbo.a_contrato_version', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.a_contrato_version
    (
        IdContratoVersion INT IDENTITY(1,1) NOT NULL,
        IdContrato INT NOT NULL,
        TipoMovimiento NVARCHAR(30) NOT NULL,
        FechaMovimiento DATETIME2(0) NOT NULL CONSTRAINT DF_a_contrato_version_FechaMovimiento DEFAULT (SYSDATETIME()),
        UsuarioAccion NVARCHAR(100) NOT NULL,
        Motivo NVARCHAR(500) NULL,
        CondicionesAnterioresJson NVARCHAR(MAX) NULL,
        CondicionesNuevasJson NVARCHAR(MAX) NULL,
        DocumentoNombre NVARCHAR(250) NULL,
        DocumentoUrl NVARCHAR(1000) NULL,
        DocumentoTamanoKB DECIMAL(18,2) NULL,
        UsuarioCreacion NVARCHAR(100) NOT NULL CONSTRAINT DF_a_contrato_version_UsuarioCreacion DEFAULT ('sistema'),
        FechaCreacion DATETIME2(0) NOT NULL CONSTRAINT DF_a_contrato_version_FechaCreacion DEFAULT (SYSDATETIME()),
        UsuarioModificacion NVARCHAR(100) NULL,
        FechaModificacion DATETIME2(0) NULL,
        CONSTRAINT PK_a_contrato_version PRIMARY KEY CLUSTERED (IdContratoVersion),
        CONSTRAINT FK_a_contrato_version_a_contrato FOREIGN KEY (IdContrato) REFERENCES dbo.a_contrato (IdContrato),
        CONSTRAINT CK_a_contrato_version_Tipo CHECK (TipoMovimiento IN ('CREACION', 'RENOVACION', 'AMPLIACION', 'ADENDA', 'SUSPENSION', 'RESOLUCION', 'CANCELACION', 'FINALIZACION', 'MODIFICACION'))
    );

    CREATE INDEX IX_a_contrato_version_Contrato
        ON dbo.a_contrato_version (IdContrato, FechaMovimiento DESC, IdContratoVersion DESC);
END;
GO

IF OBJECT_ID('dbo.a_contrato_documento', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.a_contrato_documento
    (
        IdContratoDocumento INT IDENTITY(1,1) NOT NULL,
        IdContrato INT NOT NULL,
        IdContratoVersion INT NULL,
        TipoDocumento NVARCHAR(50) NOT NULL,
        NombreArchivo NVARCHAR(250) NOT NULL,
        Extension NVARCHAR(20) NULL,
        TamanoBytes BIGINT NULL,
        RutaArchivo NVARCHAR(1000) NULL,
        UrlArchivo NVARCHAR(1000) NULL,
        IdEmpleadoCarga INT NULL,
        FechaCarga DATETIME2(0) NOT NULL CONSTRAINT DF_a_contrato_documento_FechaCarga DEFAULT (SYSDATETIME()),
        Activo BIT NOT NULL CONSTRAINT DF_a_contrato_documento_Activo DEFAULT (1),
        Observacion NVARCHAR(500) NULL,
        UsuarioCreacion NVARCHAR(100) NOT NULL CONSTRAINT DF_a_contrato_documento_UsuarioCreacion DEFAULT ('sistema'),
        FechaCreacion DATETIME2(0) NOT NULL CONSTRAINT DF_a_contrato_documento_FechaCreacion DEFAULT (SYSDATETIME()),
        UsuarioModificacion NVARCHAR(100) NULL,
        FechaModificacion DATETIME2(0) NULL,
        CONSTRAINT PK_a_contrato_documento PRIMARY KEY CLUSTERED (IdContratoDocumento),
        CONSTRAINT FK_a_contrato_documento_a_contrato FOREIGN KEY (IdContrato) REFERENCES dbo.a_contrato (IdContrato),
        CONSTRAINT FK_a_contrato_documento_a_contrato_version FOREIGN KEY (IdContratoVersion) REFERENCES dbo.a_contrato_version (IdContratoVersion)
    );

    CREATE INDEX IX_a_contrato_documento_Contrato
        ON dbo.a_contrato_documento (IdContrato, FechaCarga DESC);
END;
GO

IF OBJECT_ID('dbo.a_obligacion', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.a_obligacion
    (
        IdObligacion INT IDENTITY(1,1) NOT NULL,
        IdContrato INT NOT NULL,
        IdContratoVersion INT NULL,
        IdUnidad INT NULL,
        IdConcepto INT NOT NULL,
        FechaGeneracion DATETIME2(0) NOT NULL CONSTRAINT DF_a_obligacion_FechaGeneracion DEFAULT (SYSDATETIME()),
        Anio INT NOT NULL,
        Mes INT NOT NULL,
        PeriodoDesde DATE NOT NULL,
        PeriodoHasta DATE NOT NULL,
        FechaEmision DATE NOT NULL,
        FechaVencimiento DATE NOT NULL,
        Moneda CHAR(3) NOT NULL,
        TipoCambio DECIMAL(18,6) NULL,
        ImporteOriginal DECIMAL(18,2) NOT NULL CONSTRAINT DF_a_obligacion_ImporteOriginal DEFAULT (0),
        ImporteConvertido DECIMAL(18,2) NOT NULL CONSTRAINT DF_a_obligacion_ImporteConvertido DEFAULT (0),
        Interes DECIMAL(18,2) NOT NULL CONSTRAINT DF_a_obligacion_Interes DEFAULT (0),
        Penalidad DECIMAL(18,2) NOT NULL CONSTRAINT DF_a_obligacion_Penalidad DEFAULT (0),
        Descuento DECIMAL(18,2) NOT NULL CONSTRAINT DF_a_obligacion_Descuento DEFAULT (0),
        Ajuste DECIMAL(18,2) NOT NULL CONSTRAINT DF_a_obligacion_Ajuste DEFAULT (0),
        TotalPagar DECIMAL(18,2) NOT NULL CONSTRAINT DF_a_obligacion_TotalPagar DEFAULT (0),
        TotalPagado DECIMAL(18,2) NOT NULL CONSTRAINT DF_a_obligacion_TotalPagado DEFAULT (0),
        SaldoPendiente DECIMAL(18,2) NOT NULL CONSTRAINT DF_a_obligacion_SaldoPendiente DEFAULT (0),
        Estado NVARCHAR(20) NOT NULL CONSTRAINT DF_a_obligacion_Estado DEFAULT ('PENDIENTE'),
        Observacion NVARCHAR(500) NULL,
        EsGeneradaAutomaticamente BIT NOT NULL CONSTRAINT DF_a_obligacion_EsGeneradaAutomaticamente DEFAULT (1),
        Activo BIT NOT NULL CONSTRAINT DF_a_obligacion_Activo DEFAULT (1),
        UsuarioCreacion NVARCHAR(100) NOT NULL CONSTRAINT DF_a_obligacion_UsuarioCreacion DEFAULT ('sistema'),
        FechaCreacion DATETIME2(0) NOT NULL CONSTRAINT DF_a_obligacion_FechaCreacion DEFAULT (SYSDATETIME()),
        UsuarioModificacion NVARCHAR(100) NULL,
        FechaModificacion DATETIME2(0) NULL,
        CONSTRAINT PK_a_obligacion PRIMARY KEY CLUSTERED (IdObligacion),
        CONSTRAINT FK_a_obligacion_a_contrato FOREIGN KEY (IdContrato) REFERENCES dbo.a_contrato (IdContrato),
        CONSTRAINT FK_a_obligacion_a_contrato_version FOREIGN KEY (IdContratoVersion) REFERENCES dbo.a_contrato_version (IdContratoVersion),
        CONSTRAINT FK_a_obligacion_a_unidad FOREIGN KEY (IdUnidad) REFERENCES dbo.a_unidad (IdUnidad),
        CONSTRAINT FK_a_obligacion_a_concepto FOREIGN KEY (IdConcepto) REFERENCES dbo.a_concepto (IdConcepto),
        CONSTRAINT CK_a_obligacion_Moneda CHECK (LEN(Moneda) = 3),
        CONSTRAINT CK_a_obligacion_Fechas CHECK (PeriodoHasta >= PeriodoDesde AND FechaVencimiento >= FechaEmision),
        CONSTRAINT CK_a_obligacion_Montos CHECK (
            ImporteOriginal >= 0 AND ImporteConvertido >= 0 AND Interes >= 0 AND Penalidad >= 0 AND Descuento >= 0 AND Ajuste >= 0 AND TotalPagar >= 0 AND TotalPagado >= 0 AND SaldoPendiente >= 0
        )
    );

    CREATE UNIQUE INDEX UX_a_obligacion_Unica
        ON dbo.a_obligacion (IdContrato, IdUnidad, IdConcepto, PeriodoDesde, PeriodoHasta);

    CREATE INDEX IX_a_obligacion_ContratoEstado
        ON dbo.a_obligacion (IdContrato, Estado, FechaVencimiento DESC, IdObligacion DESC);

    CREATE INDEX IX_a_obligacion_Inquilino
        ON dbo.a_obligacion (Estado, FechaVencimiento DESC, IdConcepto);
END;
GO

IF OBJECT_ID('dbo.a_obligacion_movimiento', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.a_obligacion_movimiento
    (
        IdObligacionMovimiento INT IDENTITY(1,1) NOT NULL,
        IdObligacion INT NOT NULL,
        IdPago INT NULL,
        TipoMovimiento NVARCHAR(30) NOT NULL,
        Moneda CHAR(3) NOT NULL,
        TipoCambio DECIMAL(18,6) NULL,
        ImporteOriginal DECIMAL(18,2) NOT NULL,
        ImporteConvertido DECIMAL(18,2) NOT NULL,
        Observacion NVARCHAR(500) NULL,
        FechaMovimiento DATETIME2(0) NOT NULL CONSTRAINT DF_a_obligacion_movimiento_FechaMovimiento DEFAULT (SYSDATETIME()),
        UsuarioAccion NVARCHAR(100) NOT NULL CONSTRAINT DF_a_obligacion_movimiento_UsuarioAccion DEFAULT ('sistema'),
        Reversado BIT NOT NULL CONSTRAINT DF_a_obligacion_movimiento_Reversado DEFAULT (0),
        IdMovimientoOrigen INT NULL,
        UsuarioCreacion NVARCHAR(100) NOT NULL CONSTRAINT DF_a_obligacion_movimiento_UsuarioCreacion DEFAULT ('sistema'),
        FechaCreacion DATETIME2(0) NOT NULL CONSTRAINT DF_a_obligacion_movimiento_FechaCreacion DEFAULT (SYSDATETIME()),
        UsuarioModificacion NVARCHAR(100) NULL,
        FechaModificacion DATETIME2(0) NULL,
        CONSTRAINT PK_a_obligacion_movimiento PRIMARY KEY CLUSTERED (IdObligacionMovimiento),
        CONSTRAINT FK_a_obligacion_movimiento_a_obligacion FOREIGN KEY (IdObligacion) REFERENCES dbo.a_obligacion (IdObligacion),
        CONSTRAINT FK_a_obligacion_movimiento_a_obligacion_movimiento_origen FOREIGN KEY (IdMovimientoOrigen) REFERENCES dbo.a_obligacion_movimiento (IdObligacionMovimiento),
        CONSTRAINT CK_a_obligacion_movimiento_Monedas CHECK (LEN(Moneda) = 3)
    );

    CREATE INDEX IX_a_obligacion_movimiento_Obligacion
        ON dbo.a_obligacion_movimiento (IdObligacion, FechaMovimiento DESC, IdObligacionMovimiento DESC);
END;
GO

IF OBJECT_ID('dbo.a_pago', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.a_pago
    (
        IdPago INT IDENTITY(1,1) NOT NULL,
        NumeroOperacion NVARCHAR(100) NOT NULL,
        FechaOperacion DATE NOT NULL,
        FechaContabilizacion DATE NULL,
        IdInquilino INT NOT NULL,
        IdArrendador INT NOT NULL,
        IdEmpleadoRegistrador INT NULL,
        IdEmpleadoValidador INT NULL,
        CuentaOrigen NVARCHAR(100) NULL,
        CuentaDestino NVARCHAR(100) NULL,
        Banco NVARCHAR(100) NULL,
        MonedaOperacion CHAR(3) NOT NULL,
        TipoPago NVARCHAR(20) NOT NULL CONSTRAINT DF_a_pago_TipoPago DEFAULT ('COMPLETO'),
        ConceptoPago NVARCHAR(30) NOT NULL CONSTRAINT DF_a_pago_ConceptoPago DEFAULT ('ALQUILER'),
        TipoCambio DECIMAL(18,6) NULL,
        ImporteTransferido DECIMAL(18,2) NOT NULL CONSTRAINT DF_a_pago_ImporteTransferido DEFAULT (0),
        ComisionBancaria DECIMAL(18,2) NOT NULL CONSTRAINT DF_a_pago_ComisionBancaria DEFAULT (0),
        Itf DECIMAL(18,2) NOT NULL CONSTRAINT DF_a_pago_Itf DEFAULT (0),
        ImporteTotalCargado DECIMAL(18,2) NOT NULL CONSTRAINT DF_a_pago_ImporteTotalCargado DEFAULT (0),
        ImporteOriginal DECIMAL(18,2) NOT NULL CONSTRAINT DF_a_pago_ImporteOriginal DEFAULT (0),
        ImporteConvertido DECIMAL(18,2) NOT NULL CONSTRAINT DF_a_pago_ImporteConvertido DEFAULT (0),
        DiferenciaCambio DECIMAL(18,2) NOT NULL CONSTRAINT DF_a_pago_DiferenciaCambio DEFAULT (0),
        TipoTransferencia NVARCHAR(50) NULL,
        ConceptoBanco NVARCHAR(250) NULL,
        Observacion NVARCHAR(500) NULL,
        EstadoValidacion NVARCHAR(30) NOT NULL CONSTRAINT DF_a_pago_EstadoValidacion DEFAULT ('PENDIENTE'),
        FechaValidacion DATETIME2(0) NULL,
        VoucherNombre NVARCHAR(250) NULL,
        VoucherExtension NVARCHAR(20) NULL,
        VoucherTamanoBytes BIGINT NULL,
        VoucherRuta NVARCHAR(1000) NULL,
        VoucherUrl NVARCHAR(1000) NULL,
        Activo BIT NOT NULL CONSTRAINT DF_a_pago_Activo DEFAULT (1),
        UsuarioCreacion NVARCHAR(100) NOT NULL CONSTRAINT DF_a_pago_UsuarioCreacion DEFAULT ('sistema'),
        FechaCreacion DATETIME2(0) NOT NULL CONSTRAINT DF_a_pago_FechaCreacion DEFAULT (SYSDATETIME()),
        UsuarioModificacion NVARCHAR(100) NULL,
        FechaModificacion DATETIME2(0) NULL,
        CONSTRAINT PK_a_pago PRIMARY KEY CLUSTERED (IdPago),
        CONSTRAINT FK_a_pago_a_inquilino FOREIGN KEY (IdInquilino) REFERENCES dbo.a_inquilino (IdInquilino),
        CONSTRAINT FK_a_pago_a_arrendador FOREIGN KEY (IdArrendador) REFERENCES dbo.a_arrendador (IdArrendador),
        CONSTRAINT CK_a_pago_Moneda CHECK (LEN(MonedaOperacion) = 3),
        CONSTRAINT CK_a_pago_TipoPago CHECK (TipoPago IN ('COMPLETO', 'PARCIAL', 'EXONERADO')),
        CONSTRAINT CK_a_pago_ConceptoPago CHECK (ConceptoPago IN ('ALQUILER', 'MANTENIMIENTO', 'COCHERA', 'OTRO')),
        CONSTRAINT CK_a_pago_Montos CHECK (
            ImporteTransferido >= 0 AND ComisionBancaria >= 0 AND Itf >= 0 AND ImporteTotalCargado >= 0 AND ImporteOriginal >= 0 AND ImporteConvertido >= 0
        ),
        CONSTRAINT CK_a_pago_Estado CHECK (EstadoValidacion IN ('PENDIENTE', 'PARCIAL', 'APROBADO', 'RECHAZADO', 'ANULADO'))
    );

    CREATE UNIQUE INDEX UX_a_pago_NumeroOperacion
        ON dbo.a_pago (NumeroOperacion, FechaOperacion, IdInquilino, IdArrendador);

    CREATE INDEX IX_a_pago_Estado
        ON dbo.a_pago (EstadoValidacion, FechaOperacion DESC, IdPago DESC);
END;
GO

IF COL_LENGTH('dbo.a_pago', 'ConceptoPago') IS NULL
BEGIN
    ALTER TABLE dbo.a_pago
        ADD ConceptoPago NVARCHAR(30) NULL;

    UPDATE dbo.a_pago
    SET ConceptoPago = 'ALQUILER'
    WHERE ConceptoPago IS NULL;

    ALTER TABLE dbo.a_pago
        ALTER COLUMN ConceptoPago NVARCHAR(30) NOT NULL;
END;
GO

IF COL_LENGTH('dbo.a_pago', 'TipoPago') IS NULL
BEGIN
    ALTER TABLE dbo.a_pago
        ADD TipoPago NVARCHAR(20) NULL;

    UPDATE dbo.a_pago
    SET TipoPago = 'COMPLETO'
    WHERE TipoPago IS NULL;

    ALTER TABLE dbo.a_pago
        ALTER COLUMN TipoPago NVARCHAR(20) NOT NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.default_constraints
    WHERE parent_object_id = OBJECT_ID('dbo.a_pago')
      AND name = 'DF_a_pago_ConceptoPago'
)
BEGIN
    ALTER TABLE dbo.a_pago
        ADD CONSTRAINT DF_a_pago_ConceptoPago DEFAULT ('ALQUILER') FOR ConceptoPago;
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.check_constraints
    WHERE parent_object_id = OBJECT_ID('dbo.a_pago')
      AND name = 'CK_a_pago_ConceptoPago'
)
BEGIN
    ALTER TABLE dbo.a_pago
        ADD CONSTRAINT CK_a_pago_ConceptoPago CHECK (ConceptoPago IN ('ALQUILER', 'MANTENIMIENTO', 'COCHERA', 'OTRO'));
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.default_constraints
    WHERE parent_object_id = OBJECT_ID('dbo.a_pago')
      AND name = 'DF_a_pago_TipoPago'
)
BEGIN
    ALTER TABLE dbo.a_pago
        ADD CONSTRAINT DF_a_pago_TipoPago DEFAULT ('COMPLETO') FOR TipoPago;
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.check_constraints
    WHERE parent_object_id = OBJECT_ID('dbo.a_pago')
      AND name = 'CK_a_pago_TipoPago'
)
BEGIN
    ALTER TABLE dbo.a_pago
        ADD CONSTRAINT CK_a_pago_TipoPago CHECK (TipoPago IN ('COMPLETO', 'PARCIAL', 'EXONERADO'));
END;
GO

IF OBJECT_ID('dbo.a_obligacion_movimiento', 'U') IS NOT NULL
   AND NOT EXISTS (
        SELECT 1
        FROM sys.foreign_keys
        WHERE name = 'FK_a_obligacion_movimiento_a_pago'
    )
BEGIN
    ALTER TABLE dbo.a_obligacion_movimiento
        ADD CONSTRAINT FK_a_obligacion_movimiento_a_pago FOREIGN KEY (IdPago) REFERENCES dbo.a_pago (IdPago);
END;
GO

IF OBJECT_ID('dbo.a_pago_aprobacion', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.a_pago_aprobacion
    (
        IdPagoAprobacion INT IDENTITY(1,1) NOT NULL,
        IdPago INT NOT NULL,
        NivelAprobacion INT NOT NULL,
        EstadoAprobacion NVARCHAR(20) NOT NULL,
        IdEmpleadoAprobador INT NULL,
        FechaAprobacion DATETIME2(0) NULL,
        Observacion NVARCHAR(500) NULL,
        UsuarioCreacion NVARCHAR(100) NOT NULL CONSTRAINT DF_a_pago_aprobacion_UsuarioCreacion DEFAULT ('sistema'),
        FechaCreacion DATETIME2(0) NOT NULL CONSTRAINT DF_a_pago_aprobacion_FechaCreacion DEFAULT (SYSDATETIME()),
        UsuarioModificacion NVARCHAR(100) NULL,
        FechaModificacion DATETIME2(0) NULL,
        CONSTRAINT PK_a_pago_aprobacion PRIMARY KEY CLUSTERED (IdPagoAprobacion),
        CONSTRAINT FK_a_pago_aprobacion_a_pago FOREIGN KEY (IdPago) REFERENCES dbo.a_pago (IdPago),
        CONSTRAINT CK_a_pago_aprobacion_Estado CHECK (EstadoAprobacion IN ('PENDIENTE', 'APROBADO', 'RECHAZADO', 'ANULADO'))
    );

    CREATE UNIQUE INDEX UX_a_pago_aprobacion_PagoNivel
        ON dbo.a_pago_aprobacion (IdPago, NivelAprobacion);
END;
GO

IF OBJECT_ID('dbo.a_pago_aplicacion', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.a_pago_aplicacion
    (
        IdPagoAplicacion INT IDENTITY(1,1) NOT NULL,
        IdPago INT NOT NULL,
        IdObligacion INT NOT NULL,
        IdConcepto INT NULL,
        MonedaAplicacion CHAR(3) NOT NULL,
        TipoCambioAplicado DECIMAL(18,6) NULL,
        ImporteAplicado DECIMAL(18,2) NOT NULL,
        ImporteCapital DECIMAL(18,2) NOT NULL CONSTRAINT DF_a_pago_aplicacion_ImporteCapital DEFAULT (0),
        ImporteInteres DECIMAL(18,2) NOT NULL CONSTRAINT DF_a_pago_aplicacion_ImporteInteres DEFAULT (0),
        ImportePenalidad DECIMAL(18,2) NOT NULL CONSTRAINT DF_a_pago_aplicacion_ImportePenalidad DEFAULT (0),
        ImporteDescuento DECIMAL(18,2) NOT NULL CONSTRAINT DF_a_pago_aplicacion_ImporteDescuento DEFAULT (0),
        ImporteAjuste DECIMAL(18,2) NOT NULL CONSTRAINT DF_a_pago_aplicacion_ImporteAjuste DEFAULT (0),
        SaldoFavorGenerado DECIMAL(18,2) NOT NULL CONSTRAINT DF_a_pago_aplicacion_SaldoFavorGenerado DEFAULT (0),
        FechaAplicacion DATETIME2(0) NOT NULL CONSTRAINT DF_a_pago_aplicacion_FechaAplicacion DEFAULT (SYSDATETIME()),
        UsuarioAccion NVARCHAR(100) NOT NULL CONSTRAINT DF_a_pago_aplicacion_UsuarioAccion DEFAULT ('sistema'),
        Reversado BIT NOT NULL CONSTRAINT DF_a_pago_aplicacion_Reversado DEFAULT (0),
        IdPagoAplicacionOrigen INT NULL,
        UsuarioCreacion NVARCHAR(100) NOT NULL CONSTRAINT DF_a_pago_aplicacion_UsuarioCreacion DEFAULT ('sistema'),
        FechaCreacion DATETIME2(0) NOT NULL CONSTRAINT DF_a_pago_aplicacion_FechaCreacion DEFAULT (SYSDATETIME()),
        UsuarioModificacion NVARCHAR(100) NULL,
        FechaModificacion DATETIME2(0) NULL,
        CONSTRAINT PK_a_pago_aplicacion PRIMARY KEY CLUSTERED (IdPagoAplicacion),
        CONSTRAINT FK_a_pago_aplicacion_a_pago FOREIGN KEY (IdPago) REFERENCES dbo.a_pago (IdPago),
        CONSTRAINT FK_a_pago_aplicacion_a_obligacion FOREIGN KEY (IdObligacion) REFERENCES dbo.a_obligacion (IdObligacion),
        CONSTRAINT FK_a_pago_aplicacion_a_concepto FOREIGN KEY (IdConcepto) REFERENCES dbo.a_concepto (IdConcepto),
        CONSTRAINT FK_a_pago_aplicacion_a_pago_aplicacion_origen FOREIGN KEY (IdPagoAplicacionOrigen) REFERENCES dbo.a_pago_aplicacion (IdPagoAplicacion),
        CONSTRAINT CK_a_pago_aplicacion_Moneda CHECK (LEN(MonedaAplicacion) = 3),
        CONSTRAINT CK_a_pago_aplicacion_Montos CHECK (
            ImporteAplicado >= 0 AND ImporteCapital >= 0 AND ImporteInteres >= 0 AND ImportePenalidad >= 0 AND ImporteDescuento >= 0 AND ImporteAjuste >= 0 AND SaldoFavorGenerado >= 0
        )
    );

    CREATE INDEX IX_a_pago_aplicacion_Pago
        ON dbo.a_pago_aplicacion (IdPago, Reversado, FechaAplicacion DESC);

    CREATE INDEX IX_a_pago_aplicacion_Obligacion
        ON dbo.a_pago_aplicacion (IdObligacion, Reversado, FechaAplicacion DESC);
END;
GO

IF OBJECT_ID('dbo.a_pago_documento', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.a_pago_documento
    (
        IdPagoDocumento INT IDENTITY(1,1) NOT NULL,
        IdPago INT NOT NULL,
        TipoDocumento NVARCHAR(50) NOT NULL,
        NombreArchivo NVARCHAR(250) NOT NULL,
        Extension NVARCHAR(20) NULL,
        TamanoBytes BIGINT NULL,
        RutaArchivo NVARCHAR(1000) NULL,
        UrlArchivo NVARCHAR(1000) NULL,
        IdEmpleadoCarga INT NULL,
        FechaCarga DATETIME2(0) NOT NULL CONSTRAINT DF_a_pago_documento_FechaCarga DEFAULT (SYSDATETIME()),
        Activo BIT NOT NULL CONSTRAINT DF_a_pago_documento_Activo DEFAULT (1),
        Observacion NVARCHAR(500) NULL,
        UsuarioCreacion NVARCHAR(100) NOT NULL CONSTRAINT DF_a_pago_documento_UsuarioCreacion DEFAULT ('sistema'),
        FechaCreacion DATETIME2(0) NOT NULL CONSTRAINT DF_a_pago_documento_FechaCreacion DEFAULT (SYSDATETIME()),
        UsuarioModificacion NVARCHAR(100) NULL,
        FechaModificacion DATETIME2(0) NULL,
        CONSTRAINT PK_a_pago_documento PRIMARY KEY CLUSTERED (IdPagoDocumento),
        CONSTRAINT FK_a_pago_documento_a_pago FOREIGN KEY (IdPago) REFERENCES dbo.a_pago (IdPago)
    );

    CREATE INDEX IX_a_pago_documento_Pago
        ON dbo.a_pago_documento (IdPago, FechaCarga DESC);
END;
GO

IF OBJECT_ID('dbo.a_saldo_favor', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.a_saldo_favor
    (
        IdSaldoFavor INT IDENTITY(1,1) NOT NULL,
        IdInquilino INT NOT NULL,
        IdContrato INT NULL,
        IdConcepto INT NULL,
        Moneda CHAR(3) NOT NULL,
        TipoCambio DECIMAL(18,6) NULL,
        ImporteOriginal DECIMAL(18,2) NOT NULL,
        ImporteConvertido DECIMAL(18,2) NOT NULL,
        FechaOrigen DATE NOT NULL,
        FechaVencimiento DATE NULL,
        Estado NVARCHAR(20) NOT NULL CONSTRAINT DF_a_saldo_favor_Estado DEFAULT ('DISPONIBLE'),
        Observacion NVARCHAR(500) NULL,
        UsuarioCreacion NVARCHAR(100) NOT NULL CONSTRAINT DF_a_saldo_favor_UsuarioCreacion DEFAULT ('sistema'),
        FechaCreacion DATETIME2(0) NOT NULL CONSTRAINT DF_a_saldo_favor_FechaCreacion DEFAULT (SYSDATETIME()),
        UsuarioModificacion NVARCHAR(100) NULL,
        FechaModificacion DATETIME2(0) NULL,
        CONSTRAINT PK_a_saldo_favor PRIMARY KEY CLUSTERED (IdSaldoFavor),
        CONSTRAINT FK_a_saldo_favor_a_inquilino FOREIGN KEY (IdInquilino) REFERENCES dbo.a_inquilino (IdInquilino),
        CONSTRAINT FK_a_saldo_favor_a_contrato FOREIGN KEY (IdContrato) REFERENCES dbo.a_contrato (IdContrato),
        CONSTRAINT FK_a_saldo_favor_a_concepto FOREIGN KEY (IdConcepto) REFERENCES dbo.a_concepto (IdConcepto),
        CONSTRAINT CK_a_saldo_favor_Moneda CHECK (LEN(Moneda) = 3),
        CONSTRAINT CK_a_saldo_favor_Montos CHECK (ImporteOriginal >= 0 AND ImporteConvertido >= 0)
    );

    CREATE INDEX IX_a_saldo_favor_Inquilino
        ON dbo.a_saldo_favor (IdInquilino, Estado, FechaOrigen DESC);
END;
GO

IF OBJECT_ID('dbo.a_fraccionamiento', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.a_fraccionamiento
    (
        IdFraccionamiento INT IDENTITY(1,1) NOT NULL,
        NumeroFraccionamiento NVARCHAR(50) NOT NULL,
        IdInquilino INT NOT NULL,
        IdContrato INT NOT NULL,
        FechaFraccionamiento DATE NOT NULL,
        ImporteTotalFraccionado DECIMAL(18,2) NOT NULL,
        Moneda CHAR(3) NOT NULL,
        CantidadCuotas INT NOT NULL,
        FechaInicial DATE NOT NULL,
        Periodicidad NVARCHAR(30) NOT NULL,
        ImportePorCuota DECIMAL(18,2) NOT NULL,
        CuotaFinalDiferente DECIMAL(18,2) NULL,
        InteresFraccionamiento DECIMAL(18,2) NOT NULL CONSTRAINT DF_a_fraccionamiento_InteresFraccionamiento DEFAULT (0),
        Estado NVARCHAR(20) NOT NULL CONSTRAINT DF_a_fraccionamiento_Estado DEFAULT ('PENDIENTE'),
        Motivo NVARCHAR(500) NULL,
        DocumentoAceptacionNombre NVARCHAR(250) NULL,
        DocumentoAceptacionUrl NVARCHAR(1000) NULL,
        IdEmpleadoAprueba INT NULL,
        FechaAprobacion DATETIME2(0) NULL,
        UsuarioCreacion NVARCHAR(100) NOT NULL CONSTRAINT DF_a_fraccionamiento_UsuarioCreacion DEFAULT ('sistema'),
        FechaCreacion DATETIME2(0) NOT NULL CONSTRAINT DF_a_fraccionamiento_FechaCreacion DEFAULT (SYSDATETIME()),
        UsuarioModificacion NVARCHAR(100) NULL,
        FechaModificacion DATETIME2(0) NULL,
        CONSTRAINT PK_a_fraccionamiento PRIMARY KEY CLUSTERED (IdFraccionamiento),
        CONSTRAINT FK_a_fraccionamiento_a_inquilino FOREIGN KEY (IdInquilino) REFERENCES dbo.a_inquilino (IdInquilino),
        CONSTRAINT FK_a_fraccionamiento_a_contrato FOREIGN KEY (IdContrato) REFERENCES dbo.a_contrato (IdContrato),
        CONSTRAINT CK_a_fraccionamiento_Moneda CHECK (LEN(Moneda) = 3),
        CONSTRAINT CK_a_fraccionamiento_Cuotas CHECK (CantidadCuotas > 0),
        CONSTRAINT CK_a_fraccionamiento_Montos CHECK (ImporteTotalFraccionado >= 0 AND ImportePorCuota >= 0 AND InteresFraccionamiento >= 0)
    );

    CREATE UNIQUE INDEX UX_a_fraccionamiento_Numero
        ON dbo.a_fraccionamiento (NumeroFraccionamiento);

    CREATE INDEX IX_a_fraccionamiento_Contrato
        ON dbo.a_fraccionamiento (IdContrato, Estado, FechaFraccionamiento DESC);
END;
GO

IF OBJECT_ID('dbo.a_fraccionamiento_cuota', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.a_fraccionamiento_cuota
    (
        IdFraccionamientoCuota INT IDENTITY(1,1) NOT NULL,
        IdFraccionamiento INT NOT NULL,
        NumeroCuota INT NOT NULL,
        FechaVencimiento DATE NOT NULL,
        Moneda CHAR(3) NOT NULL,
        ImporteCuota DECIMAL(18,2) NOT NULL,
        ImportePagado DECIMAL(18,2) NOT NULL CONSTRAINT DF_a_fraccionamiento_cuota_ImportePagado DEFAULT (0),
        SaldoPendiente DECIMAL(18,2) NOT NULL CONSTRAINT DF_a_fraccionamiento_cuota_SaldoPendiente DEFAULT (0),
        Estado NVARCHAR(20) NOT NULL CONSTRAINT DF_a_fraccionamiento_cuota_Estado DEFAULT ('PENDIENTE'),
        Observacion NVARCHAR(500) NULL,
        UsuarioCreacion NVARCHAR(100) NOT NULL CONSTRAINT DF_a_fraccionamiento_cuota_UsuarioCreacion DEFAULT ('sistema'),
        FechaCreacion DATETIME2(0) NOT NULL CONSTRAINT DF_a_fraccionamiento_cuota_FechaCreacion DEFAULT (SYSDATETIME()),
        UsuarioModificacion NVARCHAR(100) NULL,
        FechaModificacion DATETIME2(0) NULL,
        CONSTRAINT PK_a_fraccionamiento_cuota PRIMARY KEY CLUSTERED (IdFraccionamientoCuota),
        CONSTRAINT FK_a_fraccionamiento_cuota_a_fraccionamiento FOREIGN KEY (IdFraccionamiento) REFERENCES dbo.a_fraccionamiento (IdFraccionamiento),
        CONSTRAINT CK_a_fraccionamiento_cuota_Moneda CHECK (LEN(Moneda) = 3),
        CONSTRAINT CK_a_fraccionamiento_cuota_Montos CHECK (ImporteCuota >= 0 AND ImportePagado >= 0 AND SaldoPendiente >= 0)
    );

    CREATE UNIQUE INDEX UX_a_fraccionamiento_cuota
        ON dbo.a_fraccionamiento_cuota (IdFraccionamiento, NumeroCuota);
END;
GO

IF OBJECT_ID('dbo.a_garantia', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.a_garantia
    (
        IdGarantia INT IDENTITY(1,1) NOT NULL,
        IdContrato INT NOT NULL,
        IdInquilino INT NOT NULL,
        GarantiaPactada DECIMAL(18,2) NOT NULL CONSTRAINT DF_a_garantia_GarantiaPactada DEFAULT (0),
        GarantiaPagada DECIMAL(18,2) NOT NULL CONSTRAINT DF_a_garantia_GarantiaPagada DEFAULT (0),
        GarantiaParcialPagada DECIMAL(18,2) NOT NULL CONSTRAINT DF_a_garantia_GarantiaParcialPagada DEFAULT (0),
        GarantiaPendiente DECIMAL(18,2) NOT NULL CONSTRAINT DF_a_garantia_GarantiaPendiente DEFAULT (0),
        GarantiaAplicadaDeudas DECIMAL(18,2) NOT NULL CONSTRAINT DF_a_garantia_GarantiaAplicadaDeudas DEFAULT (0),
        GarantiaDevuelta DECIMAL(18,2) NOT NULL CONSTRAINT DF_a_garantia_GarantiaDevuelta DEFAULT (0),
        GarantiaRetenida DECIMAL(18,2) NOT NULL CONSTRAINT DF_a_garantia_GarantiaRetenida DEFAULT (0),
        GarantiaEjecutada DECIMAL(18,2) NOT NULL CONSTRAINT DF_a_garantia_GarantiaEjecutada DEFAULT (0),
        FechaDevolucion DATE NULL,
        MotivoRetencion NVARCHAR(500) NULL,
        DocumentosSustentatorios NVARCHAR(1000) NULL,
        Estado NVARCHAR(20) NOT NULL CONSTRAINT DF_a_garantia_Estado DEFAULT ('VIGENTE'),
        UsuarioCreacion NVARCHAR(100) NOT NULL CONSTRAINT DF_a_garantia_UsuarioCreacion DEFAULT ('sistema'),
        FechaCreacion DATETIME2(0) NOT NULL CONSTRAINT DF_a_garantia_FechaCreacion DEFAULT (SYSDATETIME()),
        UsuarioModificacion NVARCHAR(100) NULL,
        FechaModificacion DATETIME2(0) NULL,
        CONSTRAINT PK_a_garantia PRIMARY KEY CLUSTERED (IdGarantia),
        CONSTRAINT FK_a_garantia_a_contrato FOREIGN KEY (IdContrato) REFERENCES dbo.a_contrato (IdContrato),
        CONSTRAINT FK_a_garantia_a_inquilino FOREIGN KEY (IdInquilino) REFERENCES dbo.a_inquilino (IdInquilino),
        CONSTRAINT CK_a_garantia_Montos CHECK (
            GarantiaPactada >= 0 AND GarantiaPagada >= 0 AND GarantiaParcialPagada >= 0 AND GarantiaPendiente >= 0 AND GarantiaAplicadaDeudas >= 0 AND GarantiaDevuelta >= 0 AND GarantiaRetenida >= 0 AND GarantiaEjecutada >= 0
        )
    );

    CREATE UNIQUE INDEX UX_a_garantia_Contrato
        ON dbo.a_garantia (IdContrato);
END;
GO

IF OBJECT_ID('dbo.a_garantia_movimiento', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.a_garantia_movimiento
    (
        IdGarantiaMovimiento INT IDENTITY(1,1) NOT NULL,
        IdGarantia INT NOT NULL,
        TipoMovimiento NVARCHAR(30) NOT NULL,
        Moneda CHAR(3) NOT NULL,
        TipoCambio DECIMAL(18,6) NULL,
        ImporteOriginal DECIMAL(18,2) NOT NULL,
        ImporteConvertido DECIMAL(18,2) NOT NULL,
        Observacion NVARCHAR(500) NULL,
        FechaMovimiento DATETIME2(0) NOT NULL CONSTRAINT DF_a_garantia_movimiento_FechaMovimiento DEFAULT (SYSDATETIME()),
        UsuarioAccion NVARCHAR(100) NOT NULL CONSTRAINT DF_a_garantia_movimiento_UsuarioAccion DEFAULT ('sistema'),
        UsuarioCreacion NVARCHAR(100) NOT NULL CONSTRAINT DF_a_garantia_movimiento_UsuarioCreacion DEFAULT ('sistema'),
        FechaCreacion DATETIME2(0) NOT NULL CONSTRAINT DF_a_garantia_movimiento_FechaCreacion DEFAULT (SYSDATETIME()),
        UsuarioModificacion NVARCHAR(100) NULL,
        FechaModificacion DATETIME2(0) NULL,
        CONSTRAINT PK_a_garantia_movimiento PRIMARY KEY CLUSTERED (IdGarantiaMovimiento),
        CONSTRAINT FK_a_garantia_movimiento_a_garantia FOREIGN KEY (IdGarantia) REFERENCES dbo.a_garantia (IdGarantia),
        CONSTRAINT CK_a_garantia_movimiento_Moneda CHECK (LEN(Moneda) = 3),
        CONSTRAINT CK_a_garantia_movimiento_Montos CHECK (ImporteOriginal >= 0 AND ImporteConvertido >= 0)
    );

    CREATE INDEX IX_a_garantia_movimiento_Garantia
        ON dbo.a_garantia_movimiento (IdGarantia, FechaMovimiento DESC);
END;
GO

IF OBJECT_ID('dbo.a_cobranza_gestion', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.a_cobranza_gestion
    (
        IdCobranzaGestion INT IDENTITY(1,1) NOT NULL,
        IdContrato INT NOT NULL,
        IdInquilino INT NOT NULL,
        IdObligacion INT NULL,
        FechaGestion DATETIME2(0) NOT NULL CONSTRAINT DF_a_cobranza_gestion_FechaGestion DEFAULT (SYSDATETIME()),
        TipoGestion NVARCHAR(50) NOT NULL,
        ResultadoGestion NVARCHAR(100) NULL,
        CompromisoPagoFecha DATE NULL,
        CompromisoPagoImporte DECIMAL(18,2) NULL,
        Estado NVARCHAR(20) NOT NULL CONSTRAINT DF_a_cobranza_gestion_Estado DEFAULT ('ABIERTA'),
        Contacto NVARCHAR(150) NULL,
        Observacion NVARCHAR(500) NULL,
        IdEmpleadoGestor INT NULL,
        UsuarioCreacion NVARCHAR(100) NOT NULL CONSTRAINT DF_a_cobranza_gestion_UsuarioCreacion DEFAULT ('sistema'),
        FechaCreacion DATETIME2(0) NOT NULL CONSTRAINT DF_a_cobranza_gestion_FechaCreacion DEFAULT (SYSDATETIME()),
        UsuarioModificacion NVARCHAR(100) NULL,
        FechaModificacion DATETIME2(0) NULL,
        CONSTRAINT PK_a_cobranza_gestion PRIMARY KEY CLUSTERED (IdCobranzaGestion),
        CONSTRAINT FK_a_cobranza_gestion_a_contrato FOREIGN KEY (IdContrato) REFERENCES dbo.a_contrato (IdContrato),
        CONSTRAINT FK_a_cobranza_gestion_a_inquilino FOREIGN KEY (IdInquilino) REFERENCES dbo.a_inquilino (IdInquilino),
        CONSTRAINT FK_a_cobranza_gestion_a_obligacion FOREIGN KEY (IdObligacion) REFERENCES dbo.a_obligacion (IdObligacion),
        CONSTRAINT CK_a_cobranza_gestion_Estado CHECK (Estado IN ('ABIERTA', 'CERRADA', 'INCUMPLIDA', 'ANULADA')),
        CONSTRAINT CK_a_cobranza_gestion_Importe CHECK (CompromisoPagoImporte IS NULL OR CompromisoPagoImporte >= 0)
    );

    CREATE INDEX IX_a_cobranza_gestion_Inquilino
        ON dbo.a_cobranza_gestion (IdInquilino, Estado, FechaGestion DESC);
END;
GO

IF OBJECT_ID('dbo.a_cobranza_compromiso', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.a_cobranza_compromiso
    (
        IdCobranzaCompromiso INT IDENTITY(1,1) NOT NULL,
        IdCobranzaGestion INT NOT NULL,
        FechaCompromiso DATE NOT NULL,
        ImporteCompromiso DECIMAL(18,2) NOT NULL,
        Estado NVARCHAR(20) NOT NULL CONSTRAINT DF_a_cobranza_compromiso_Estado DEFAULT ('PENDIENTE'),
        Observacion NVARCHAR(500) NULL,
        UsuarioCreacion NVARCHAR(100) NOT NULL CONSTRAINT DF_a_cobranza_compromiso_UsuarioCreacion DEFAULT ('sistema'),
        FechaCreacion DATETIME2(0) NOT NULL CONSTRAINT DF_a_cobranza_compromiso_FechaCreacion DEFAULT (SYSDATETIME()),
        UsuarioModificacion NVARCHAR(100) NULL,
        FechaModificacion DATETIME2(0) NULL,
        CONSTRAINT PK_a_cobranza_compromiso PRIMARY KEY CLUSTERED (IdCobranzaCompromiso),
        CONSTRAINT FK_a_cobranza_compromiso_a_cobranza_gestion FOREIGN KEY (IdCobranzaGestion) REFERENCES dbo.a_cobranza_gestion (IdCobranzaGestion),
        CONSTRAINT CK_a_cobranza_compromiso_Importe CHECK (ImporteCompromiso >= 0),
        CONSTRAINT CK_a_cobranza_compromiso_Estado CHECK (Estado IN ('PENDIENTE', 'CUMPLIDO', 'INCUMPLIDO', 'ANULADO'))
    );

    CREATE INDEX IX_a_cobranza_compromiso_Estado
        ON dbo.a_cobranza_compromiso (Estado, FechaCompromiso DESC);
END;
GO

IF OBJECT_ID('dbo.a_arbitrio', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.a_arbitrio
    (
        IdArbitrio INT IDENTITY(1,1) NOT NULL,
        IdContrato INT NOT NULL,
        IdInmueble INT NOT NULL,
        IdUnidad INT NULL,
        Periodicidad NVARCHAR(30) NOT NULL,
        MontoAnual DECIMAL(18,2) NOT NULL CONSTRAINT DF_a_arbitrio_MontoAnual DEFAULT (0),
        Moneda CHAR(3) NOT NULL,
        FechaInicio DATE NOT NULL,
        FechaFin DATE NULL,
        AplicaAreaComun BIT NOT NULL CONSTRAINT DF_a_arbitrio_AplicaAreaComun DEFAULT (0),
        AplicaLocalPropio BIT NOT NULL CONSTRAINT DF_a_arbitrio_AplicaLocalPropio DEFAULT (1),
        Estado NVARCHAR(20) NOT NULL CONSTRAINT DF_a_arbitrio_Estado DEFAULT ('ACTIVO'),
        Observacion NVARCHAR(500) NULL,
        UsuarioCreacion NVARCHAR(100) NOT NULL CONSTRAINT DF_a_arbitrio_UsuarioCreacion DEFAULT ('sistema'),
        FechaCreacion DATETIME2(0) NOT NULL CONSTRAINT DF_a_arbitrio_FechaCreacion DEFAULT (SYSDATETIME()),
        UsuarioModificacion NVARCHAR(100) NULL,
        FechaModificacion DATETIME2(0) NULL,
        CONSTRAINT PK_a_arbitrio PRIMARY KEY CLUSTERED (IdArbitrio),
        CONSTRAINT FK_a_arbitrio_a_contrato FOREIGN KEY (IdContrato) REFERENCES dbo.a_contrato (IdContrato),
        CONSTRAINT FK_a_arbitrio_a_inmueble FOREIGN KEY (IdInmueble) REFERENCES dbo.a_inmueble (IdInmueble),
        CONSTRAINT FK_a_arbitrio_a_unidad FOREIGN KEY (IdUnidad) REFERENCES dbo.a_unidad (IdUnidad),
        CONSTRAINT CK_a_arbitrio_Moneda CHECK (LEN(Moneda) = 3),
        CONSTRAINT CK_a_arbitrio_Monto CHECK (MontoAnual >= 0),
        CONSTRAINT CK_a_arbitrio_Periodicidad CHECK (Periodicidad IN ('MENSUAL', 'BIMESTRAL', 'TRIMESTRAL', 'SEMESTRAL', 'ANUAL', 'PERSONALIZADO'))
    );

    CREATE INDEX IX_a_arbitrio_Contrato
        ON dbo.a_arbitrio (IdContrato, Estado, FechaInicio DESC);
END;
GO

IF OBJECT_ID('dbo.a_arbitrio_detalle', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.a_arbitrio_detalle
    (
        IdArbitrioDetalle INT IDENTITY(1,1) NOT NULL,
        IdArbitrio INT NOT NULL,
        Anio INT NOT NULL,
        Mes INT NOT NULL,
        PeriodoDesde DATE NOT NULL,
        PeriodoHasta DATE NOT NULL,
        Importe DECIMAL(18,2) NOT NULL,
        Estado NVARCHAR(20) NOT NULL CONSTRAINT DF_a_arbitrio_detalle_Estado DEFAULT ('PENDIENTE'),
        Observacion NVARCHAR(500) NULL,
        UsuarioCreacion NVARCHAR(100) NOT NULL CONSTRAINT DF_a_arbitrio_detalle_UsuarioCreacion DEFAULT ('sistema'),
        FechaCreacion DATETIME2(0) NOT NULL CONSTRAINT DF_a_arbitrio_detalle_FechaCreacion DEFAULT (SYSDATETIME()),
        UsuarioModificacion NVARCHAR(100) NULL,
        FechaModificacion DATETIME2(0) NULL,
        CONSTRAINT PK_a_arbitrio_detalle PRIMARY KEY CLUSTERED (IdArbitrioDetalle),
        CONSTRAINT FK_a_arbitrio_detalle_a_arbitrio FOREIGN KEY (IdArbitrio) REFERENCES dbo.a_arbitrio (IdArbitrio),
        CONSTRAINT CK_a_arbitrio_detalle_Mes CHECK (Mes BETWEEN 1 AND 12),
        CONSTRAINT CK_a_arbitrio_detalle_Fechas CHECK (PeriodoHasta >= PeriodoDesde),
        CONSTRAINT CK_a_arbitrio_detalle_Importe CHECK (Importe >= 0)
    );

    CREATE UNIQUE INDEX UX_a_arbitrio_detalle_ArbitrioPeriodo
        ON dbo.a_arbitrio_detalle (IdArbitrio, Anio, Mes);
END;
GO

IF OBJECT_ID('dbo.a_alerta', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.a_alerta
    (
        IdAlerta INT IDENTITY(1,1) NOT NULL,
        IdContrato INT NULL,
        IdInquilino INT NULL,
        IdObligacion INT NULL,
        TipoAlerta NVARCHAR(50) NOT NULL,
        FechaAlerta DATETIME2(0) NOT NULL CONSTRAINT DF_a_alerta_FechaAlerta DEFAULT (SYSDATETIME()),
        FechaVencimiento DATE NULL,
        Prioridad NVARCHAR(20) NOT NULL CONSTRAINT DF_a_alerta_Prioridad DEFAULT ('MEDIA'),
        Estado NVARCHAR(20) NOT NULL CONSTRAINT DF_a_alerta_Estado DEFAULT ('PENDIENTE'),
        Mensaje NVARCHAR(1000) NOT NULL,
        IdEmpleadoResponsable INT NULL,
        FechaAtencion DATETIME2(0) NULL,
        Observacion NVARCHAR(500) NULL,
        UsuarioCreacion NVARCHAR(100) NOT NULL CONSTRAINT DF_a_alerta_UsuarioCreacion DEFAULT ('sistema'),
        FechaCreacion DATETIME2(0) NOT NULL CONSTRAINT DF_a_alerta_FechaCreacion DEFAULT (SYSDATETIME()),
        UsuarioModificacion NVARCHAR(100) NULL,
        FechaModificacion DATETIME2(0) NULL,
        CONSTRAINT PK_a_alerta PRIMARY KEY CLUSTERED (IdAlerta),
        CONSTRAINT FK_a_alerta_a_contrato FOREIGN KEY (IdContrato) REFERENCES dbo.a_contrato (IdContrato),
        CONSTRAINT FK_a_alerta_a_inquilino FOREIGN KEY (IdInquilino) REFERENCES dbo.a_inquilino (IdInquilino),
        CONSTRAINT FK_a_alerta_a_obligacion FOREIGN KEY (IdObligacion) REFERENCES dbo.a_obligacion (IdObligacion),
        CONSTRAINT CK_a_alerta_Prioridad CHECK (Prioridad IN ('BAJA', 'MEDIA', 'ALTA', 'CRITICA')),
        CONSTRAINT CK_a_alerta_Estado CHECK (Estado IN ('PENDIENTE', 'ATENDIDA', 'ANULADA'))
    );

    CREATE INDEX IX_a_alerta_Estado
        ON dbo.a_alerta (Estado, Prioridad, FechaAlerta DESC);
END;
GO

IF OBJECT_ID('dbo.EmpleadoCj', 'U') IS NOT NULL
BEGIN
    IF COL_LENGTH('dbo.a_arrendador', 'IdEmpleadoResponsable') IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
            FROM sys.foreign_keys
            WHERE name = 'FK_a_arrendador_EmpleadoCj'
        )
    BEGIN
        ALTER TABLE dbo.a_arrendador
            ADD CONSTRAINT FK_a_arrendador_EmpleadoCj FOREIGN KEY (IdEmpleadoResponsable) REFERENCES dbo.EmpleadoCj (IdEmpleado);
    END;

    IF COL_LENGTH('dbo.a_inquilino', 'IdEmpleadoResponsable') IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
            FROM sys.foreign_keys
            WHERE name = 'FK_a_inquilino_EmpleadoCj'
        )
    BEGIN
        ALTER TABLE dbo.a_inquilino
            ADD CONSTRAINT FK_a_inquilino_EmpleadoCj FOREIGN KEY (IdEmpleadoResponsable) REFERENCES dbo.EmpleadoCj (IdEmpleado);
    END;

    IF COL_LENGTH('dbo.a_inmueble', 'IdEmpleadoResponsable') IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
            FROM sys.foreign_keys
            WHERE name = 'FK_a_inmueble_EmpleadoCj'
        )
    BEGIN
        ALTER TABLE dbo.a_inmueble
            ADD CONSTRAINT FK_a_inmueble_EmpleadoCj FOREIGN KEY (IdEmpleadoResponsable) REFERENCES dbo.EmpleadoCj (IdEmpleado);
    END;

    IF COL_LENGTH('dbo.a_contrato', 'IdEmpleadoResponsable') IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
            FROM sys.foreign_keys
            WHERE name = 'FK_a_contrato_EmpleadoCj'
        )
    BEGIN
        ALTER TABLE dbo.a_contrato
            ADD CONSTRAINT FK_a_contrato_EmpleadoCj FOREIGN KEY (IdEmpleadoResponsable) REFERENCES dbo.EmpleadoCj (IdEmpleado);
    END;

    IF COL_LENGTH('dbo.a_pago', 'IdEmpleadoRegistrador') IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
            FROM sys.foreign_keys
            WHERE name = 'FK_a_pago_EmpleadoCj_Registrador'
        )
    BEGIN
        ALTER TABLE dbo.a_pago
            ADD CONSTRAINT FK_a_pago_EmpleadoCj_Registrador FOREIGN KEY (IdEmpleadoRegistrador) REFERENCES dbo.EmpleadoCj (IdEmpleado);
    END;

    IF COL_LENGTH('dbo.a_pago', 'IdEmpleadoValidador') IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
            FROM sys.foreign_keys
            WHERE name = 'FK_a_pago_EmpleadoCj_Validador'
        )
    BEGIN
        ALTER TABLE dbo.a_pago
            ADD CONSTRAINT FK_a_pago_EmpleadoCj_Validador FOREIGN KEY (IdEmpleadoValidador) REFERENCES dbo.EmpleadoCj (IdEmpleado);
    END;

    IF COL_LENGTH('dbo.a_cobranza_gestion', 'IdEmpleadoGestor') IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
            FROM sys.foreign_keys
            WHERE name = 'FK_a_cobranza_gestion_EmpleadoCj'
        )
    BEGIN
        ALTER TABLE dbo.a_cobranza_gestion
            ADD CONSTRAINT FK_a_cobranza_gestion_EmpleadoCj FOREIGN KEY (IdEmpleadoGestor) REFERENCES dbo.EmpleadoCj (IdEmpleado);
    END;

END;
GO

MERGE dbo.a_concepto AS target
USING
(
    SELECT 'ALQUILER' AS CodigoConcepto, 'Alquiler' AS NombreConcepto, 'CARGO' AS TipoConcepto, CAST(1 AS BIT) AS EsObligacionMensual, CAST(0 AS BIT) AS EsObligacionFutura UNION ALL
    SELECT 'MANTENIMIENTO', 'Mantenimiento', 'CARGO', 1, 0 UNION ALL
    SELECT 'ARBITRIO', 'Arbitrio', 'CARGO', 1, 0 UNION ALL
    SELECT 'GARANTIA', 'Garantia', 'GARANTIA', 0, 1 UNION ALL
    SELECT 'PENALIDAD', 'Penalidad', 'CARGO', 0, 0 UNION ALL
    SELECT 'INTERES', 'Interes', 'CARGO', 0, 0 UNION ALL
    SELECT 'SERVICIO', 'Servicio', 'CARGO', 1, 0 UNION ALL
    SELECT 'OTROS', 'Otros cargos', 'CARGO', 1, 0
) AS source
ON target.CodigoConcepto = source.CodigoConcepto
WHEN NOT MATCHED THEN
    INSERT (CodigoConcepto, NombreConcepto, TipoConcepto, EsObligacionMensual, EsObligacionFutura, Activo, UsuarioCreacion, FechaCreacion)
    VALUES (source.CodigoConcepto, source.NombreConcepto, source.TipoConcepto, source.EsObligacionMensual, source.EsObligacionFutura, 1, 'sistema', SYSDATETIME());
GO

MERGE dbo.a_parametro AS target
USING
(
    SELECT 'TIPO_CAMBIO_USD_GLOBAL' AS Codigo, CAST('3.7500' AS NVARCHAR(500)) AS ValorTexto, CAST(3.7500 AS DECIMAL(18,6)) AS ValorNumero, CAST(NULL AS DATE) AS ValorFecha UNION ALL
    SELECT 'TIPO_CAMBIO_DOP_GLOBAL', CAST('0.0600' AS NVARCHAR(500)), CAST(0.0600 AS DECIMAL(18,6)), CAST(NULL AS DATE) UNION ALL
    SELECT 'PAGO_APROBACIONES_MINIMAS', CAST('2' AS NVARCHAR(500)), CAST(2 AS DECIMAL(18,6)), CAST(NULL AS DATE) UNION ALL
    SELECT 'PAGO_PERMITE_SALDO_FAVOR', CAST('1' AS NVARCHAR(500)), CAST(1 AS DECIMAL(18,6)), CAST(NULL AS DATE)
) AS source
ON target.Codigo = source.Codigo
WHEN NOT MATCHED THEN
    INSERT (Codigo, ValorTexto, ValorNumero, ValorFecha, Activo, UsuarioCreacion, FechaCreacion)
    VALUES (source.Codigo, source.ValorTexto, source.ValorNumero, source.ValorFecha, 1, 'sistema', SYSDATETIME());
GO

CREATE OR ALTER PROCEDURE dbo.sp_a_TipoCambioDiario_Guardar
    @IdTipoCambioDiario INT = NULL,
    @FechaTipoCambio DATE,
    @MonedaOrigen CHAR(3),
    @MonedaDestino CHAR(3),
    @Compra DECIMAL(18,6),
    @Venta DECIMAL(18,6),
    @Fuente NVARCHAR(100) = NULL,
    @EsManual BIT = 0,
    @Activo BIT = 1,
    @Observacion NVARCHAR(500) = NULL,
    @UsuarioAccion NVARCHAR(100) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Usuario NVARCHAR(100) = ISNULL(NULLIF(LTRIM(RTRIM(@UsuarioAccion)), ''), 'sistema');

    IF @FechaTipoCambio IS NULL
    BEGIN
        RAISERROR('Debe indicar la fecha del tipo de cambio.', 16, 1);
        RETURN;
    END;

    IF LEN(ISNULL(@MonedaOrigen, '')) <> 3 OR LEN(ISNULL(@MonedaDestino, '')) <> 3
    BEGIN
        RAISERROR('Debe indicar monedas validas de tres caracteres.', 16, 1);
        RETURN;
    END;

    IF ISNULL(@Compra, 0) <= 0 OR ISNULL(@Venta, 0) <= 0
    BEGIN
        RAISERROR('Los valores de compra y venta deben ser mayores a cero.', 16, 1);
        RETURN;
    END;

    BEGIN TRANSACTION;

    IF @IdTipoCambioDiario IS NULL OR @IdTipoCambioDiario = 0
    BEGIN
        IF EXISTS (
            SELECT 1
            FROM dbo.a_tipo_cambio_diario
            WHERE FechaTipoCambio = @FechaTipoCambio
              AND MonedaOrigen = @MonedaOrigen
              AND MonedaDestino = @MonedaDestino
        )
        BEGIN
            ROLLBACK TRANSACTION;
            RAISERROR('Ya existe un tipo de cambio para la fecha y monedas indicadas.', 16, 1);
            RETURN;
        END;

        INSERT INTO dbo.a_tipo_cambio_diario
        (
            FechaTipoCambio, MonedaOrigen, MonedaDestino, Compra, Venta, Fuente, EsManual, Activo, Observacion,
            UsuarioCreacion, FechaCreacion
        )
        VALUES
        (
            @FechaTipoCambio, @MonedaOrigen, @MonedaDestino, @Compra, @Venta, @Fuente, ISNULL(@EsManual, 0), ISNULL(@Activo, 1), @Observacion,
            @Usuario, SYSDATETIME()
        );

        SET @IdTipoCambioDiario = SCOPE_IDENTITY();
    END;
    ELSE
    BEGIN
        UPDATE dbo.a_tipo_cambio_diario
        SET FechaTipoCambio = @FechaTipoCambio,
            MonedaOrigen = @MonedaOrigen,
            MonedaDestino = @MonedaDestino,
            Compra = @Compra,
            Venta = @Venta,
            Fuente = @Fuente,
            EsManual = ISNULL(@EsManual, 0),
            Activo = ISNULL(@Activo, 1),
            Observacion = @Observacion,
            UsuarioModificacion = @Usuario,
            FechaModificacion = SYSDATETIME()
        WHERE IdTipoCambioDiario = @IdTipoCambioDiario;

        IF @@ROWCOUNT = 0
        BEGIN
            ROLLBACK TRANSACTION;
            RAISERROR('No existe el tipo de cambio indicado.', 16, 1);
            RETURN;
        END;
    END;

    COMMIT TRANSACTION;

    SELECT
        Exito = 1,
        Mensaje = 'Tipo de cambio guardado correctamente.',
        IdTipoCambioDiario = @IdTipoCambioDiario;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_a_Arrendador_Guardar
    @IdArrendador INT = NULL,
    @CodigoArrendador NVARCHAR(50),
    @TipoDocumento NVARCHAR(20) = NULL,
    @NumeroDocumento NVARCHAR(30) = NULL,
    @RazonSocial NVARCHAR(250),
    @NombreComercial NVARCHAR(250) = NULL,
    @Contacto NVARCHAR(150) = NULL,
    @Telefono NVARCHAR(50) = NULL,
    @Correo NVARCHAR(150) = NULL,
    @Direccion NVARCHAR(500) = NULL,
    @IdEmpleadoResponsable INT = NULL,
    @Activo BIT = 1,
    @Observacion NVARCHAR(500) = NULL,
    @UsuarioAccion NVARCHAR(100) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Usuario NVARCHAR(100) = ISNULL(NULLIF(LTRIM(RTRIM(@UsuarioAccion)), ''), 'sistema');

    IF ISNULL(LTRIM(RTRIM(@CodigoArrendador)), '') = ''
    BEGIN
        RAISERROR('Debe indicar el codigo del arrendador.', 16, 1);
        RETURN;
    END;

    IF ISNULL(LTRIM(RTRIM(@RazonSocial)), '') = ''
    BEGIN
        RAISERROR('Debe indicar la razon social del arrendador.', 16, 1);
        RETURN;
    END;

    BEGIN TRANSACTION;

    IF @IdArrendador IS NULL OR @IdArrendador = 0
    BEGIN
        IF EXISTS (SELECT 1 FROM dbo.a_arrendador WHERE CodigoArrendador = LTRIM(RTRIM(@CodigoArrendador)))
        BEGIN
            ROLLBACK TRANSACTION;
            RAISERROR('Ya existe un arrendador con el mismo codigo.', 16, 1);
            RETURN;
        END;

        INSERT INTO dbo.a_arrendador
        (
            CodigoArrendador, TipoDocumento, NumeroDocumento, RazonSocial, NombreComercial, Contacto, Telefono, Correo, Direccion,
            IdEmpleadoResponsable, Activo, Observacion, UsuarioCreacion, FechaCreacion
        )
        VALUES
        (
            LTRIM(RTRIM(@CodigoArrendador)), @TipoDocumento, @NumeroDocumento, LTRIM(RTRIM(@RazonSocial)), @NombreComercial, @Contacto, @Telefono, @Correo, @Direccion,
            @IdEmpleadoResponsable, ISNULL(@Activo, 1), @Observacion, @Usuario, SYSDATETIME()
        );

        SET @IdArrendador = SCOPE_IDENTITY();
    END;
    ELSE
    BEGIN
        UPDATE dbo.a_arrendador
        SET CodigoArrendador = LTRIM(RTRIM(@CodigoArrendador)),
            TipoDocumento = @TipoDocumento,
            NumeroDocumento = @NumeroDocumento,
            RazonSocial = LTRIM(RTRIM(@RazonSocial)),
            NombreComercial = @NombreComercial,
            Contacto = @Contacto,
            Telefono = @Telefono,
            Correo = @Correo,
            Direccion = @Direccion,
            IdEmpleadoResponsable = @IdEmpleadoResponsable,
            Activo = ISNULL(@Activo, 1),
            Observacion = @Observacion,
            UsuarioModificacion = @Usuario,
            FechaModificacion = SYSDATETIME()
        WHERE IdArrendador = @IdArrendador;

        IF @@ROWCOUNT = 0
        BEGIN
            ROLLBACK TRANSACTION;
            RAISERROR('No existe el arrendador indicado.', 16, 1);
            RETURN;
        END;
    END;

    COMMIT TRANSACTION;

    SELECT Exito = 1, Mensaje = 'Arrendador guardado correctamente.', IdArrendador = @IdArrendador;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_a_Inquilino_Guardar
    @IdInquilino INT = NULL,
    @CodigoInquilino NVARCHAR(50),
    @TipoDocumento NVARCHAR(20) = NULL,
    @NumeroDocumento NVARCHAR(30) = NULL,
    @RazonSocial NVARCHAR(250),
    @NombreComercial NVARCHAR(250) = NULL,
    @Contacto NVARCHAR(150) = NULL,
    @Telefono NVARCHAR(50) = NULL,
    @Correo NVARCHAR(150) = NULL,
    @Direccion NVARCHAR(500) = NULL,
    @IdEmpleadoResponsable INT = NULL,
    @Activo BIT = 1,
    @Observacion NVARCHAR(500) = NULL,
    @UsuarioAccion NVARCHAR(100) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Usuario NVARCHAR(100) = ISNULL(NULLIF(LTRIM(RTRIM(@UsuarioAccion)), ''), 'sistema');

    IF ISNULL(LTRIM(RTRIM(@CodigoInquilino)), '') = ''
    BEGIN
        RAISERROR('Debe indicar el codigo del inquilino.', 16, 1);
        RETURN;
    END;

    IF ISNULL(LTRIM(RTRIM(@RazonSocial)), '') = ''
    BEGIN
        RAISERROR('Debe indicar la razon social del inquilino.', 16, 1);
        RETURN;
    END;

    BEGIN TRANSACTION;

    IF @IdInquilino IS NULL OR @IdInquilino = 0
    BEGIN
        IF EXISTS (SELECT 1 FROM dbo.a_inquilino WHERE CodigoInquilino = LTRIM(RTRIM(@CodigoInquilino)))
        BEGIN
            ROLLBACK TRANSACTION;
            RAISERROR('Ya existe un inquilino con el mismo codigo.', 16, 1);
            RETURN;
        END;

        INSERT INTO dbo.a_inquilino
        (
            CodigoInquilino, TipoDocumento, NumeroDocumento, RazonSocial, NombreComercial, Contacto, Telefono, Correo, Direccion,
            IdEmpleadoResponsable, Activo, Observacion, UsuarioCreacion, FechaCreacion
        )
        VALUES
        (
            LTRIM(RTRIM(@CodigoInquilino)), @TipoDocumento, @NumeroDocumento, LTRIM(RTRIM(@RazonSocial)), @NombreComercial, @Contacto, @Telefono, @Correo, @Direccion,
            @IdEmpleadoResponsable, ISNULL(@Activo, 1), @Observacion, @Usuario, SYSDATETIME()
        );

        SET @IdInquilino = SCOPE_IDENTITY();
    END;
    ELSE
    BEGIN
        UPDATE dbo.a_inquilino
        SET CodigoInquilino = LTRIM(RTRIM(@CodigoInquilino)),
            TipoDocumento = @TipoDocumento,
            NumeroDocumento = @NumeroDocumento,
            RazonSocial = LTRIM(RTRIM(@RazonSocial)),
            NombreComercial = @NombreComercial,
            Contacto = @Contacto,
            Telefono = @Telefono,
            Correo = @Correo,
            Direccion = @Direccion,
            IdEmpleadoResponsable = @IdEmpleadoResponsable,
            Activo = ISNULL(@Activo, 1),
            Observacion = @Observacion,
            UsuarioModificacion = @Usuario,
            FechaModificacion = SYSDATETIME()
        WHERE IdInquilino = @IdInquilino;

        IF @@ROWCOUNT = 0
        BEGIN
            ROLLBACK TRANSACTION;
            RAISERROR('No existe el inquilino indicado.', 16, 1);
            RETURN;
        END;
    END;

    COMMIT TRANSACTION;

    SELECT Exito = 1, Mensaje = 'Inquilino guardado correctamente.', IdInquilino = @IdInquilino;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_a_Inmueble_Guardar
    @IdInmueble INT = NULL,
    @CodigoInmueble NVARCHAR(50),
    @NombreInmueble NVARCHAR(250),
    @TipoInmueble NVARCHAR(50),
    @DireccionCompleta NVARCHAR(500) = NULL,
    @Ubigeo NVARCHAR(20) = NULL,
    @Referencia NVARCHAR(250) = NULL,
    @IdEmpleadoResponsable INT = NULL,
    @Activo BIT = 1,
    @Observacion NVARCHAR(500) = NULL,
    @UsuarioAccion NVARCHAR(100) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Usuario NVARCHAR(100) = ISNULL(NULLIF(LTRIM(RTRIM(@UsuarioAccion)), ''), 'sistema');

    IF ISNULL(LTRIM(RTRIM(@CodigoInmueble)), '') = ''
    BEGIN
        RAISERROR('Debe indicar el codigo del inmueble.', 16, 1);
        RETURN;
    END;

    IF ISNULL(LTRIM(RTRIM(@NombreInmueble)), '') = ''
    BEGIN
        RAISERROR('Debe indicar el nombre del inmueble.', 16, 1);
        RETURN;
    END;

    IF ISNULL(LTRIM(RTRIM(@TipoInmueble)), '') = ''
    BEGIN
        RAISERROR('Debe indicar el tipo de inmueble.', 16, 1);
        RETURN;
    END;

    BEGIN TRANSACTION;

    IF @IdInmueble IS NULL OR @IdInmueble = 0
    BEGIN
        IF EXISTS (SELECT 1 FROM dbo.a_inmueble WHERE CodigoInmueble = LTRIM(RTRIM(@CodigoInmueble)))
        BEGIN
            ROLLBACK TRANSACTION;
            RAISERROR('Ya existe un inmueble con el mismo codigo.', 16, 1);
            RETURN;
        END;

        INSERT INTO dbo.a_inmueble
        (
            CodigoInmueble, NombreInmueble, TipoInmueble, DireccionCompleta, Ubigeo, Referencia, IdEmpleadoResponsable, Activo, Observacion,
            UsuarioCreacion, FechaCreacion
        )
        VALUES
        (
            LTRIM(RTRIM(@CodigoInmueble)), LTRIM(RTRIM(@NombreInmueble)), LTRIM(RTRIM(@TipoInmueble)), @DireccionCompleta, @Ubigeo, @Referencia,
            @IdEmpleadoResponsable, ISNULL(@Activo, 1), @Observacion, @Usuario, SYSDATETIME()
        );

        SET @IdInmueble = SCOPE_IDENTITY();
    END;
    ELSE
    BEGIN
        UPDATE dbo.a_inmueble
        SET CodigoInmueble = LTRIM(RTRIM(@CodigoInmueble)),
            NombreInmueble = LTRIM(RTRIM(@NombreInmueble)),
            TipoInmueble = LTRIM(RTRIM(@TipoInmueble)),
            DireccionCompleta = @DireccionCompleta,
            Ubigeo = @Ubigeo,
            Referencia = @Referencia,
            IdEmpleadoResponsable = @IdEmpleadoResponsable,
            Activo = ISNULL(@Activo, 1),
            Observacion = @Observacion,
            UsuarioModificacion = @Usuario,
            FechaModificacion = SYSDATETIME()
        WHERE IdInmueble = @IdInmueble;

        IF @@ROWCOUNT = 0
        BEGIN
            ROLLBACK TRANSACTION;
            RAISERROR('No existe el inmueble indicado.', 16, 1);
            RETURN;
        END;
    END;

    COMMIT TRANSACTION;

    SELECT Exito = 1, Mensaje = 'Inmueble guardado correctamente.', IdInmueble = @IdInmueble;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_a_Unidad_Guardar
    @IdUnidad INT = NULL,
    @IdInmueble INT,
    @CodigoUnidad NVARCHAR(50),
    @NombreUnidad NVARCHAR(250),
    @TipoUnidad NVARCHAR(30),
    @Piso NVARCHAR(50) = NULL,
    @AreaM2 DECIMAL(18,2) = NULL,
    @Descripcion NVARCHAR(500) = NULL,
    @Activo BIT = 1,
    @Observacion NVARCHAR(500) = NULL,
    @UsuarioAccion NVARCHAR(100) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Usuario NVARCHAR(100) = ISNULL(NULLIF(LTRIM(RTRIM(@UsuarioAccion)), ''), 'sistema');

    IF ISNULL(@IdInmueble, 0) <= 0
    BEGIN
        RAISERROR('Debe indicar el inmueble.', 16, 1);
        RETURN;
    END;

    IF ISNULL(LTRIM(RTRIM(@CodigoUnidad)), '') = ''
    BEGIN
        RAISERROR('Debe indicar el codigo de la unidad.', 16, 1);
        RETURN;
    END;

    IF ISNULL(LTRIM(RTRIM(@NombreUnidad)), '') = ''
    BEGIN
        RAISERROR('Debe indicar el nombre de la unidad.', 16, 1);
        RETURN;
    END;

    IF ISNULL(LTRIM(RTRIM(@TipoUnidad)), '') = ''
    BEGIN
        RAISERROR('Debe indicar el tipo de unidad.', 16, 1);
        RETURN;
    END;

    BEGIN TRANSACTION;

    IF @IdUnidad IS NULL OR @IdUnidad = 0
    BEGIN
        IF EXISTS (SELECT 1 FROM dbo.a_unidad WHERE IdInmueble = @IdInmueble AND CodigoUnidad = LTRIM(RTRIM(@CodigoUnidad)))
        BEGIN
            ROLLBACK TRANSACTION;
            RAISERROR('Ya existe una unidad con el mismo codigo para el inmueble.', 16, 1);
            RETURN;
        END;

        INSERT INTO dbo.a_unidad
        (
            IdInmueble, CodigoUnidad, NombreUnidad, TipoUnidad, Piso, AreaM2, Descripcion, Activo, Observacion,
            UsuarioCreacion, FechaCreacion
        )
        VALUES
        (
            @IdInmueble, LTRIM(RTRIM(@CodigoUnidad)), LTRIM(RTRIM(@NombreUnidad)), LTRIM(RTRIM(@TipoUnidad)), @Piso, @AreaM2, @Descripcion, ISNULL(@Activo, 1), @Observacion,
            @Usuario, SYSDATETIME()
        );

        SET @IdUnidad = SCOPE_IDENTITY();
    END;
    ELSE
    BEGIN
        UPDATE dbo.a_unidad
        SET IdInmueble = @IdInmueble,
            CodigoUnidad = LTRIM(RTRIM(@CodigoUnidad)),
            NombreUnidad = LTRIM(RTRIM(@NombreUnidad)),
            TipoUnidad = LTRIM(RTRIM(@TipoUnidad)),
            Piso = @Piso,
            AreaM2 = @AreaM2,
            Descripcion = @Descripcion,
            Activo = ISNULL(@Activo, 1),
            Observacion = @Observacion,
            UsuarioModificacion = @Usuario,
            FechaModificacion = SYSDATETIME()
        WHERE IdUnidad = @IdUnidad;

        IF @@ROWCOUNT = 0
        BEGIN
            ROLLBACK TRANSACTION;
            RAISERROR('No existe la unidad indicada.', 16, 1);
            RETURN;
        END;
    END;

    COMMIT TRANSACTION;

    SELECT Exito = 1, Mensaje = 'Unidad guardada correctamente.', IdUnidad = @IdUnidad;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_a_Contrato_Guardar
    @IdContrato INT = NULL,
    @CodigoContrato NVARCHAR(50),
    @IdArrendador INT,
    @IdInquilino INT,
    @IdInmueble INT,
    @IdUnidadPrincipal INT = NULL,
    @FechaFirma DATE = NULL,
    @FechaInicio DATE,
    @FechaFin DATE,
    @Moneda CHAR(3),
    @ImporteAlquiler DECIMAL(18,2) = 0,
    @PeriodicidadAlquiler NVARCHAR(30) = 'MENSUAL',
    @DiaLimitePago INT = 5,
    @DiasGracia INT = 0,
    @ImporteMantenimiento DECIMAL(18,2) = 0,
    @PeriodicidadMantenimiento NVARCHAR(30) = 'MENSUAL',
    @DiaLimiteMantenimiento INT = 5,
    @GarantiaPactada DECIMAL(18,2) = 0,
    @GarantiaPagada DECIMAL(18,2) = 0,
    @GarantiaPendiente DECIMAL(18,2) = 0,
    @TipoReajuste NVARCHAR(50) = NULL,
    @PorcentajeReajuste DECIMAL(18,6) = NULL,
    @FormulaReajuste NVARCHAR(500) = NULL,
    @FrecuenciaReajuste NVARCHAR(30) = NULL,
    @PenalidadMora DECIMAL(18,2) = 0,
    @InteresMoratorio DECIMAL(18,2) = 0,
    @EstadoContrato NVARCHAR(30) = 'ACTIVO',
    @Observaciones NVARCHAR(1000) = NULL,
    @DocumentoFirmadoNombre NVARCHAR(250) = NULL,
    @DocumentoFirmadoUrl NVARCHAR(1000) = NULL,
    @DocumentoFirmadoTamanoKB DECIMAL(18,2) = NULL,
    @IdEmpleadoResponsable INT = NULL,
    @FechaSuspension DATE = NULL,
    @FechaCancelacion DATE = NULL,
    @MotivoCancelacion NVARCHAR(500) = NULL,
    @Activo BIT = 1,
    @UsuarioAccion NVARCHAR(100) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Usuario NVARCHAR(100) = ISNULL(NULLIF(LTRIM(RTRIM(@UsuarioAccion)), ''), 'sistema');
    DECLARE @AnteriorJson NVARCHAR(MAX);
    DECLARE @NuevoJson NVARCHAR(MAX);
    DECLARE @IdContratoVersion INT;

    IF ISNULL(LTRIM(RTRIM(@CodigoContrato)), '') = ''
    BEGIN
        RAISERROR('Debe indicar el codigo del contrato.', 16, 1);
        RETURN;
    END;

    IF ISNULL(@IdArrendador, 0) <= 0 OR ISNULL(@IdInquilino, 0) <= 0 OR ISNULL(@IdInmueble, 0) <= 0
    BEGIN
        RAISERROR('Debe indicar arrendador, inquilino e inmueble.', 16, 1);
        RETURN;
    END;

    IF @FechaInicio IS NULL OR @FechaFin IS NULL OR @FechaFin < @FechaInicio
    BEGIN
        RAISERROR('Las fechas del contrato no son validas.', 16, 1);
        RETURN;
    END;

    IF LEN(ISNULL(@Moneda, '')) <> 3
    BEGIN
        RAISERROR('Debe indicar una moneda valida de tres caracteres.', 16, 1);
        RETURN;
    END;

    BEGIN TRANSACTION;

    IF @IdContrato IS NULL OR @IdContrato = 0
    BEGIN
        IF EXISTS (SELECT 1 FROM dbo.a_contrato WHERE CodigoContrato = LTRIM(RTRIM(@CodigoContrato)))
        BEGIN
            ROLLBACK TRANSACTION;
            RAISERROR('Ya existe un contrato con el mismo codigo.', 16, 1);
            RETURN;
        END;

        INSERT INTO dbo.a_contrato
        (
            CodigoContrato, IdArrendador, IdInquilino, IdInmueble, IdUnidadPrincipal, FechaFirma, FechaInicio, FechaFin, Moneda,
            ImporteAlquiler, PeriodicidadAlquiler, DiaLimitePago, DiasGracia, ImporteMantenimiento, PeriodicidadMantenimiento, DiaLimiteMantenimiento,
            GarantiaPactada, GarantiaPagada, GarantiaPendiente, TipoReajuste, PorcentajeReajuste, FormulaReajuste, FrecuenciaReajuste,
            PenalidadMora, InteresMoratorio, EstadoContrato, Observaciones, DocumentoFirmadoNombre, DocumentoFirmadoUrl,
            DocumentoFirmadoTamanoKB, IdEmpleadoResponsable, FechaSuspension, FechaCancelacion, MotivoCancelacion, Activo,
            UsuarioCreacion, FechaCreacion
        )
        VALUES
        (
            LTRIM(RTRIM(@CodigoContrato)), @IdArrendador, @IdInquilino, @IdInmueble, @IdUnidadPrincipal, @FechaFirma, @FechaInicio, @FechaFin, @Moneda,
            ISNULL(@ImporteAlquiler, 0), ISNULL(@PeriodicidadAlquiler, 'MENSUAL'), ISNULL(@DiaLimitePago, 5), ISNULL(@DiasGracia, 0), ISNULL(@ImporteMantenimiento, 0), ISNULL(@PeriodicidadMantenimiento, 'MENSUAL'), ISNULL(@DiaLimiteMantenimiento, 5),
            ISNULL(@GarantiaPactada, 0), ISNULL(@GarantiaPagada, 0), ISNULL(@GarantiaPendiente, 0), @TipoReajuste, @PorcentajeReajuste, @FormulaReajuste, @FrecuenciaReajuste,
            ISNULL(@PenalidadMora, 0), ISNULL(@InteresMoratorio, 0), ISNULL(@EstadoContrato, 'ACTIVO'), @Observaciones, @DocumentoFirmadoNombre, @DocumentoFirmadoUrl,
            @DocumentoFirmadoTamanoKB, @IdEmpleadoResponsable, @FechaSuspension, @FechaCancelacion, @MotivoCancelacion, ISNULL(@Activo, 1),
            @Usuario, SYSDATETIME()
        );

        SET @IdContrato = SCOPE_IDENTITY();

        SET @NuevoJson =
        (
            SELECT
                @IdContrato AS IdContrato,
                @CodigoContrato AS CodigoContrato,
                @IdArrendador AS IdArrendador,
                @IdInquilino AS IdInquilino,
                @IdInmueble AS IdInmueble,
                @IdUnidadPrincipal AS IdUnidadPrincipal,
                @FechaFirma AS FechaFirma,
                @FechaInicio AS FechaInicio,
                @FechaFin AS FechaFin,
                @Moneda AS Moneda,
                @ImporteAlquiler AS ImporteAlquiler,
                @ImporteMantenimiento AS ImporteMantenimiento,
                @GarantiaPactada AS GarantiaPactada,
                @GarantiaPagada AS GarantiaPagada,
                @GarantiaPendiente AS GarantiaPendiente,
                @EstadoContrato AS EstadoContrato
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
        );

        INSERT INTO dbo.a_contrato_version
        (
            IdContrato, TipoMovimiento, FechaMovimiento, UsuarioAccion, Motivo, CondicionesAnterioresJson, CondicionesNuevasJson,
            DocumentoNombre, DocumentoUrl, DocumentoTamanoKB, UsuarioCreacion, FechaCreacion
        )
        VALUES
        (
            @IdContrato, 'CREACION', SYSDATETIME(), @Usuario, 'Creacion inicial del contrato.', NULL, @NuevoJson,
            @DocumentoFirmadoNombre, @DocumentoFirmadoUrl, @DocumentoFirmadoTamanoKB, @Usuario, SYSDATETIME()
        );

        SET @IdContratoVersion = SCOPE_IDENTITY();
    END;
    ELSE
    BEGIN
        SELECT @AnteriorJson =
        (
            SELECT
                IdContrato,
                CodigoContrato,
                IdArrendador,
                IdInquilino,
                IdInmueble,
                IdUnidadPrincipal,
                FechaFirma,
                FechaInicio,
                FechaFin,
                Moneda,
                ImporteAlquiler,
                ImporteMantenimiento,
                GarantiaPactada,
                GarantiaPagada,
                GarantiaPendiente,
                EstadoContrato,
                FechaSuspension,
                FechaCancelacion
            FROM dbo.a_contrato
            WHERE IdContrato = @IdContrato
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
        );

        UPDATE dbo.a_contrato
        SET CodigoContrato = LTRIM(RTRIM(@CodigoContrato)),
            IdArrendador = @IdArrendador,
            IdInquilino = @IdInquilino,
            IdInmueble = @IdInmueble,
            IdUnidadPrincipal = @IdUnidadPrincipal,
            FechaFirma = @FechaFirma,
            FechaInicio = @FechaInicio,
            FechaFin = @FechaFin,
            Moneda = @Moneda,
            ImporteAlquiler = ISNULL(@ImporteAlquiler, 0),
            PeriodicidadAlquiler = ISNULL(@PeriodicidadAlquiler, 'MENSUAL'),
            DiaLimitePago = ISNULL(@DiaLimitePago, 5),
            DiasGracia = ISNULL(@DiasGracia, 0),
            ImporteMantenimiento = ISNULL(@ImporteMantenimiento, 0),
            PeriodicidadMantenimiento = ISNULL(@PeriodicidadMantenimiento, 'MENSUAL'),
            DiaLimiteMantenimiento = ISNULL(@DiaLimiteMantenimiento, 5),
            GarantiaPactada = ISNULL(@GarantiaPactada, 0),
            GarantiaPagada = ISNULL(@GarantiaPagada, 0),
            GarantiaPendiente = ISNULL(@GarantiaPendiente, 0),
            TipoReajuste = @TipoReajuste,
            PorcentajeReajuste = @PorcentajeReajuste,
            FormulaReajuste = @FormulaReajuste,
            FrecuenciaReajuste = @FrecuenciaReajuste,
            PenalidadMora = ISNULL(@PenalidadMora, 0),
            InteresMoratorio = ISNULL(@InteresMoratorio, 0),
            EstadoContrato = ISNULL(@EstadoContrato, 'ACTIVO'),
            Observaciones = @Observaciones,
            DocumentoFirmadoNombre = @DocumentoFirmadoNombre,
            DocumentoFirmadoUrl = @DocumentoFirmadoUrl,
            DocumentoFirmadoTamanoKB = @DocumentoFirmadoTamanoKB,
            IdEmpleadoResponsable = @IdEmpleadoResponsable,
            FechaSuspension = @FechaSuspension,
            FechaCancelacion = @FechaCancelacion,
            MotivoCancelacion = @MotivoCancelacion,
            Activo = ISNULL(@Activo, 1),
            UsuarioModificacion = @Usuario,
            FechaModificacion = SYSDATETIME()
        WHERE IdContrato = @IdContrato;

        IF @@ROWCOUNT = 0
        BEGIN
            ROLLBACK TRANSACTION;
            RAISERROR('No existe el contrato indicado.', 16, 1);
            RETURN;
        END;

        SET @NuevoJson =
        (
            SELECT
                IdContrato,
                CodigoContrato,
                IdArrendador,
                IdInquilino,
                IdInmueble,
                IdUnidadPrincipal,
                FechaFirma,
                FechaInicio,
                FechaFin,
                Moneda,
                ImporteAlquiler,
                ImporteMantenimiento,
                GarantiaPactada,
                GarantiaPagada,
                GarantiaPendiente,
                EstadoContrato,
                FechaSuspension,
                FechaCancelacion
            FROM dbo.a_contrato
            WHERE IdContrato = @IdContrato
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
        );

        INSERT INTO dbo.a_contrato_version
        (
            IdContrato, TipoMovimiento, FechaMovimiento, UsuarioAccion, Motivo, CondicionesAnterioresJson, CondicionesNuevasJson,
            DocumentoNombre, DocumentoUrl, DocumentoTamanoKB, UsuarioCreacion, FechaCreacion
        )
        VALUES
        (
            @IdContrato, 'MODIFICACION', SYSDATETIME(), @Usuario, 'Actualizacion de contrato.', @AnteriorJson, @NuevoJson,
            @DocumentoFirmadoNombre, @DocumentoFirmadoUrl, @DocumentoFirmadoTamanoKB, @Usuario, SYSDATETIME()
        );

        SET @IdContratoVersion = SCOPE_IDENTITY();
    END;

    COMMIT TRANSACTION;

    SELECT Exito = 1, Mensaje = 'Contrato guardado correctamente.', IdContrato = @IdContrato, IdContratoVersion = @IdContratoVersion;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_a_Contrato_Unidad_Guardar
    @IdContratoUnidad INT = NULL,
    @IdContrato INT,
    @IdUnidad INT,
    @FechaInicio DATE,
    @FechaFin DATE = NULL,
    @AreaM2 DECIMAL(18,2) = NULL,
    @CanonMensual DECIMAL(18,2) = NULL,
    @Estado NVARCHAR(20) = 'ACTIVO',
    @Observacion NVARCHAR(500) = NULL,
    @UsuarioAccion NVARCHAR(100) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Usuario NVARCHAR(100) = ISNULL(NULLIF(LTRIM(RTRIM(@UsuarioAccion)), ''), 'sistema');

    IF ISNULL(@IdContrato, 0) <= 0 OR ISNULL(@IdUnidad, 0) <= 0
    BEGIN
        RAISERROR('Debe indicar contrato y unidad.', 16, 1);
        RETURN;
    END;

    IF @FechaInicio IS NULL OR (@FechaFin IS NOT NULL AND @FechaFin < @FechaInicio)
    BEGIN
        RAISERROR('Las fechas del contrato-unidad no son validas.', 16, 1);
        RETURN;
    END;

    BEGIN TRANSACTION;

    IF @IdContratoUnidad IS NULL OR @IdContratoUnidad = 0
    BEGIN
        INSERT INTO dbo.a_contrato_unidad
        (
            IdContrato, IdUnidad, FechaInicio, FechaFin, AreaM2, CanonMensual, Estado, Observacion,
            UsuarioCreacion, FechaCreacion
        )
        VALUES
        (
            @IdContrato, @IdUnidad, @FechaInicio, @FechaFin, @AreaM2, @CanonMensual, ISNULL(@Estado, 'ACTIVO'), @Observacion,
            @Usuario, SYSDATETIME()
        );

        SET @IdContratoUnidad = SCOPE_IDENTITY();
    END;
    ELSE
    BEGIN
        UPDATE dbo.a_contrato_unidad
        SET IdContrato = @IdContrato,
            IdUnidad = @IdUnidad,
            FechaInicio = @FechaInicio,
            FechaFin = @FechaFin,
            AreaM2 = @AreaM2,
            CanonMensual = @CanonMensual,
            Estado = ISNULL(@Estado, 'ACTIVO'),
            Observacion = @Observacion,
            UsuarioModificacion = @Usuario,
            FechaModificacion = SYSDATETIME()
        WHERE IdContratoUnidad = @IdContratoUnidad;

        IF @@ROWCOUNT = 0
        BEGIN
            ROLLBACK TRANSACTION;
            RAISERROR('No existe la relacion contrato-unidad indicada.', 16, 1);
            RETURN;
        END;
    END;

    COMMIT TRANSACTION;

    SELECT Exito = 1, Mensaje = 'Relacion contrato-unidad guardada correctamente.', IdContratoUnidad = @IdContratoUnidad;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_a_Obligacion_Generar
    @ObligacionesJson NVARCHAR(MAX),
    @UsuarioAccion NVARCHAR(100) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Usuario NVARCHAR(100) = ISNULL(NULLIF(LTRIM(RTRIM(@UsuarioAccion)), ''), 'sistema');

    IF ISJSON(@ObligacionesJson) <> 1
    BEGIN
        RAISERROR('El payload de obligaciones no es valido.', 16, 1);
        RETURN;
    END;

    BEGIN TRANSACTION;

    ;WITH src AS
    (
        SELECT
            TRY_CONVERT(INT, JSON_VALUE(value, '$.IdContrato')) AS IdContrato,
            TRY_CONVERT(INT, JSON_VALUE(value, '$.IdContratoVersion')) AS IdContratoVersion,
            TRY_CONVERT(INT, JSON_VALUE(value, '$.IdUnidad')) AS IdUnidad,
            TRY_CONVERT(INT, JSON_VALUE(value, '$.IdConcepto')) AS IdConcepto,
            TRY_CONVERT(DATE, JSON_VALUE(value, '$.PeriodoDesde')) AS PeriodoDesde,
            TRY_CONVERT(DATE, JSON_VALUE(value, '$.PeriodoHasta')) AS PeriodoHasta,
            TRY_CONVERT(DATE, JSON_VALUE(value, '$.FechaEmision')) AS FechaEmision,
            TRY_CONVERT(DATE, JSON_VALUE(value, '$.FechaVencimiento')) AS FechaVencimiento,
            TRY_CONVERT(CHAR(3), JSON_VALUE(value, '$.Moneda')) AS Moneda,
            TRY_CONVERT(DECIMAL(18,6), JSON_VALUE(value, '$.TipoCambio')) AS TipoCambio,
            TRY_CONVERT(DECIMAL(18,2), JSON_VALUE(value, '$.ImporteOriginal')) AS ImporteOriginal,
            TRY_CONVERT(DECIMAL(18,2), JSON_VALUE(value, '$.ImporteConvertido')) AS ImporteConvertido,
            TRY_CONVERT(DECIMAL(18,2), JSON_VALUE(value, '$.Interes')) AS Interes,
            TRY_CONVERT(DECIMAL(18,2), JSON_VALUE(value, '$.Penalidad')) AS Penalidad,
            TRY_CONVERT(DECIMAL(18,2), JSON_VALUE(value, '$.Descuento')) AS Descuento,
            TRY_CONVERT(DECIMAL(18,2), JSON_VALUE(value, '$.Ajuste')) AS Ajuste,
            TRY_CONVERT(NVARCHAR(500), JSON_VALUE(value, '$.Observacion')) AS Observacion,
            TRY_CONVERT(BIT, JSON_VALUE(value, '$.EsGeneradaAutomaticamente')) AS EsGeneradaAutomaticamente
        FROM OPENJSON(@ObligacionesJson)
    ),
    data AS
    (
        SELECT
            IdContrato,
            IdContratoVersion,
            IdUnidad,
            IdConcepto,
            YEAR(PeriodoDesde) AS Anio,
            MONTH(PeriodoDesde) AS Mes,
            PeriodoDesde,
            PeriodoHasta,
            FechaEmision,
            FechaVencimiento,
            Moneda,
            TipoCambio,
            ImporteOriginal,
            ImporteConvertido,
            Interes,
            Penalidad,
            Descuento,
            Ajuste,
            Observacion,
            ISNULL(EsGeneradaAutomaticamente, 1) AS EsGeneradaAutomaticamente
        FROM src
        WHERE IdContrato IS NOT NULL
          AND IdConcepto IS NOT NULL
          AND PeriodoDesde IS NOT NULL
          AND PeriodoHasta IS NOT NULL
          AND FechaEmision IS NOT NULL
          AND FechaVencimiento IS NOT NULL
    )
    INSERT INTO dbo.a_obligacion
    (
        IdContrato, IdContratoVersion, IdUnidad, IdConcepto, FechaGeneracion, Anio, Mes, PeriodoDesde, PeriodoHasta, FechaEmision,
        FechaVencimiento, Moneda, TipoCambio, ImporteOriginal, ImporteConvertido, Interes, Penalidad, Descuento, Ajuste, TotalPagar,
        TotalPagado, SaldoPendiente, Estado, Observacion, EsGeneradaAutomaticamente, Activo, UsuarioCreacion, FechaCreacion
    )
    SELECT
        d.IdContrato,
        d.IdContratoVersion,
        d.IdUnidad,
        d.IdConcepto,
        SYSDATETIME(),
        d.Anio,
        d.Mes,
        d.PeriodoDesde,
        d.PeriodoHasta,
        d.FechaEmision,
        d.FechaVencimiento,
        d.Moneda,
        d.TipoCambio,
        ISNULL(d.ImporteOriginal, 0),
        ISNULL(d.ImporteConvertido, ISNULL(d.ImporteOriginal, 0)),
        ISNULL(d.Interes, 0),
        ISNULL(d.Penalidad, 0),
        ISNULL(d.Descuento, 0),
        ISNULL(d.Ajuste, 0),
        (ISNULL(d.ImporteConvertido, ISNULL(d.ImporteOriginal, 0)) + ISNULL(d.Interes, 0) + ISNULL(d.Penalidad, 0) + ISNULL(d.Ajuste, 0) - ISNULL(d.Descuento, 0)),
        0,
        (ISNULL(d.ImporteConvertido, ISNULL(d.ImporteOriginal, 0)) + ISNULL(d.Interes, 0) + ISNULL(d.Penalidad, 0) + ISNULL(d.Ajuste, 0) - ISNULL(d.Descuento, 0)),
        'PENDIENTE',
        d.Observacion,
        d.EsGeneradaAutomaticamente,
        1,
        @Usuario,
        SYSDATETIME()
    FROM data d
    WHERE NOT EXISTS
    (
        SELECT 1
        FROM dbo.a_obligacion o
        WHERE o.IdContrato = d.IdContrato
          AND ISNULL(o.IdUnidad, 0) = ISNULL(d.IdUnidad, 0)
          AND o.IdConcepto = d.IdConcepto
          AND o.PeriodoDesde = d.PeriodoDesde
          AND o.PeriodoHasta = d.PeriodoHasta
    );

    COMMIT TRANSACTION;

    SELECT
        Exito = 1,
        Mensaje = 'Obligaciones generadas correctamente.',
        RegistrosInsertados = @@ROWCOUNT;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_a_Pago_Registrar
    @IdPago INT = NULL,
    @NumeroOperacion NVARCHAR(100),
    @FechaOperacion DATE,
    @FechaContabilizacion DATE = NULL,
    @IdInquilino INT,
    @IdArrendador INT,
    @IdEmpleadoRegistrador INT = NULL,
    @CuentaOrigen NVARCHAR(100) = NULL,
    @CuentaDestino NVARCHAR(100) = NULL,
    @Banco NVARCHAR(100) = NULL,
    @MonedaOperacion CHAR(3),
    @TipoPago NVARCHAR(20) = 'COMPLETO',
    @ConceptoPago NVARCHAR(30) = 'ALQUILER',
    @TipoCambio DECIMAL(18,6) = NULL,
    @ImporteTransferido DECIMAL(18,2) = 0,
    @ComisionBancaria DECIMAL(18,2) = 0,
    @Itf DECIMAL(18,2) = 0,
    @ImporteTotalCargado DECIMAL(18,2) = 0,
    @ImporteOriginal DECIMAL(18,2) = 0,
    @ImporteConvertido DECIMAL(18,2) = 0,
    @DiferenciaCambio DECIMAL(18,2) = 0,
    @TipoTransferencia NVARCHAR(50) = NULL,
    @ConceptoBanco NVARCHAR(250) = NULL,
    @Observacion NVARCHAR(500) = NULL,
    @VoucherNombre NVARCHAR(250) = NULL,
    @VoucherExtension NVARCHAR(20) = NULL,
    @VoucherTamanoBytes BIGINT = NULL,
    @VoucherRuta NVARCHAR(1000) = NULL,
    @VoucherUrl NVARCHAR(1000) = NULL,
    @UsuarioAccion NVARCHAR(100) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Usuario NVARCHAR(100) = ISNULL(NULLIF(LTRIM(RTRIM(@UsuarioAccion)), ''), 'sistema');
    DECLARE @EstadoActual NVARCHAR(30);
    DECLARE @TipoPagoNormalizado NVARCHAR(20) = UPPER(LTRIM(RTRIM(ISNULL(@TipoPago, 'COMPLETO'))));
    DECLARE @ConceptoPagoNormalizado NVARCHAR(30) = UPPER(LTRIM(RTRIM(ISNULL(@ConceptoPago, 'ALQUILER'))));

    IF ISNULL(LTRIM(RTRIM(@NumeroOperacion)), '') = ''
    BEGIN
        RAISERROR('Debe indicar el numero de operacion.', 16, 1);
        RETURN;
    END;

    IF ISNULL(@IdInquilino, 0) <= 0 OR ISNULL(@IdArrendador, 0) <= 0
    BEGIN
        RAISERROR('Debe indicar inquilino y arrendador.', 16, 1);
        RETURN;
    END;

    IF LEN(ISNULL(@MonedaOperacion, '')) <> 3
    BEGIN
        RAISERROR('Debe indicar una moneda valida de tres caracteres.', 16, 1);
        RETURN;
    END;

    IF @TipoPagoNormalizado NOT IN ('COMPLETO', 'PARCIAL', 'EXONERADO')
    BEGIN
        RAISERROR('Debe indicar un tipo de pago valido: COMPLETO, PARCIAL o EXONERADO.', 16, 1);
        RETURN;
    END;

    IF @ConceptoPagoNormalizado NOT IN ('ALQUILER', 'MANTENIMIENTO', 'COCHERA', 'OTRO')
    BEGIN
        RAISERROR('Debe indicar un concepto de pago valido: ALQUILER, MANTENIMIENTO, COCHERA u OTRO.', 16, 1);
        RETURN;
    END;

    IF @TipoPagoNormalizado = 'COMPLETO'
       AND @FechaContabilizacion IS NOT NULL
       AND EXISTS
       (
           SELECT 1
           FROM dbo.a_pago
           WHERE IdInquilino = @IdInquilino
             AND UPPER(LTRIM(RTRIM(ConceptoPago))) = @ConceptoPagoNormalizado
             AND UPPER(LTRIM(RTRIM(TipoPago))) = 'COMPLETO'
             AND YEAR(FechaContabilizacion) = YEAR(@FechaContabilizacion)
             AND MONTH(FechaContabilizacion) = MONTH(@FechaContabilizacion)
             AND (@IdPago IS NULL OR IdPago <> @IdPago)
       )
    BEGIN
        RAISERROR('Ya existe un pago COMPLETO para el mismo inquilino, concepto y periodo de contabilizacion.', 16, 1);
        RETURN;
    END;

    BEGIN TRANSACTION;

    IF EXISTS
    (
        SELECT 1
        FROM dbo.a_pago
        WHERE NumeroOperacion = LTRIM(RTRIM(@NumeroOperacion))
          AND FechaOperacion = @FechaOperacion
          AND IdInquilino = @IdInquilino
          AND IdArrendador = @IdArrendador
          AND (@IdPago IS NULL OR IdPago <> @IdPago)
    )
    BEGIN
        ROLLBACK TRANSACTION;
        RAISERROR('Ya existe un pago con el mismo numero de operacion.', 16, 1);
        RETURN;
    END;

    IF ISNULL(@IdPago, 0) > 0
    BEGIN
        SELECT @EstadoActual = EstadoValidacion
        FROM dbo.a_pago
        WHERE IdPago = @IdPago;

        IF @EstadoActual IS NULL
        BEGIN
            ROLLBACK TRANSACTION;
            RAISERROR('No existe el pago indicado para actualizar.', 16, 1);
            RETURN;
        END;

        IF @EstadoActual NOT IN ('PENDIENTE', 'RECHAZADO')
        BEGIN
            ROLLBACK TRANSACTION;
            RAISERROR('Solo se pueden editar pagos pendientes o rechazados.', 16, 1);
            RETURN;
        END;

        UPDATE dbo.a_pago
        SET NumeroOperacion = LTRIM(RTRIM(@NumeroOperacion)),
            FechaOperacion = @FechaOperacion,
            FechaContabilizacion = @FechaContabilizacion,
            IdInquilino = @IdInquilino,
            IdArrendador = @IdArrendador,
            IdEmpleadoRegistrador = @IdEmpleadoRegistrador,
            CuentaOrigen = @CuentaOrigen,
            CuentaDestino = @CuentaDestino,
            Banco = @Banco,
            MonedaOperacion = @MonedaOperacion,
            TipoPago = @TipoPagoNormalizado,
            ConceptoPago = @ConceptoPagoNormalizado,
            TipoCambio = @TipoCambio,
            ImporteTransferido = ISNULL(@ImporteTransferido, 0),
            ComisionBancaria = ISNULL(@ComisionBancaria, 0),
            Itf = ISNULL(@Itf, 0),
            ImporteTotalCargado = ISNULL(@ImporteTotalCargado, 0),
            ImporteOriginal = ISNULL(@ImporteOriginal, 0),
            ImporteConvertido = ISNULL(@ImporteConvertido, 0),
            DiferenciaCambio = ISNULL(@DiferenciaCambio, 0),
            TipoTransferencia = @TipoTransferencia,
            ConceptoBanco = @ConceptoBanco,
            Observacion = @Observacion,
            EstadoValidacion = 'PENDIENTE',
            FechaValidacion = NULL,
            VoucherNombre = @VoucherNombre,
            VoucherExtension = @VoucherExtension,
            VoucherTamanoBytes = @VoucherTamanoBytes,
            VoucherRuta = @VoucherRuta,
            VoucherUrl = @VoucherUrl,
            Activo = 1,
            UsuarioModificacion = @Usuario,
            FechaModificacion = SYSDATETIME()
        WHERE IdPago = @IdPago;
    END
    ELSE
    BEGIN
        INSERT INTO dbo.a_pago
        (
            NumeroOperacion, FechaOperacion, FechaContabilizacion, IdInquilino, IdArrendador, IdEmpleadoRegistrador, CuentaOrigen,
            CuentaDestino, Banco, MonedaOperacion, TipoPago, ConceptoPago, TipoCambio, ImporteTransferido, ComisionBancaria, Itf, ImporteTotalCargado,
            ImporteOriginal, ImporteConvertido, DiferenciaCambio, TipoTransferencia, ConceptoBanco, Observacion, EstadoValidacion,
            VoucherNombre, VoucherExtension, VoucherTamanoBytes, VoucherRuta, VoucherUrl, Activo, UsuarioCreacion, FechaCreacion
        )
        VALUES
        (
            LTRIM(RTRIM(@NumeroOperacion)), @FechaOperacion, @FechaContabilizacion, @IdInquilino, @IdArrendador, @IdEmpleadoRegistrador, @CuentaOrigen,
            @CuentaDestino, @Banco, @MonedaOperacion, @TipoPagoNormalizado, @ConceptoPagoNormalizado, @TipoCambio, ISNULL(@ImporteTransferido, 0), ISNULL(@ComisionBancaria, 0), ISNULL(@Itf, 0), ISNULL(@ImporteTotalCargado, 0),
            ISNULL(@ImporteOriginal, 0), ISNULL(@ImporteConvertido, 0), ISNULL(@DiferenciaCambio, 0), @TipoTransferencia, @ConceptoBanco, @Observacion, 'PENDIENTE',
            @VoucherNombre, @VoucherExtension, @VoucherTamanoBytes, @VoucherRuta, @VoucherUrl, 1, @Usuario, SYSDATETIME()
        );

        SET @IdPago = SCOPE_IDENTITY();
    END;

    MERGE dbo.a_pago_aprobacion AS target
    USING (SELECT @IdPago AS IdPago, 1 AS NivelAprobacion) AS source
    ON target.IdPago = source.IdPago AND target.NivelAprobacion = source.NivelAprobacion
    WHEN MATCHED THEN
        UPDATE SET
            EstadoAprobacion = 'PENDIENTE',
            IdEmpleadoAprobador = NULL,
            FechaAprobacion = NULL,
            Observacion = 'Aprobacion inicial pendiente.',
            UsuarioModificacion = @Usuario,
            FechaModificacion = SYSDATETIME()
    WHEN NOT MATCHED THEN
        INSERT (IdPago, NivelAprobacion, EstadoAprobacion, Observacion, UsuarioCreacion, FechaCreacion)
        VALUES (@IdPago, 1, 'PENDIENTE', 'Aprobacion inicial pendiente.', @Usuario, SYSDATETIME());

    COMMIT TRANSACTION;

    SELECT Exito = 1, Mensaje = 'Pago registrado correctamente.', IdPago = @IdPago;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_a_Pago_Aprobar
    @IdPago INT,
    @NivelAprobacion INT,
    @Aprobado BIT,
    @IdEmpleadoAprobador INT = NULL,
    @Observacion NVARCHAR(500) = NULL,
    @UsuarioAccion NVARCHAR(100) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Usuario NVARCHAR(100) = ISNULL(NULLIF(LTRIM(RTRIM(@UsuarioAccion)), ''), 'sistema');
    DECLARE @EstadoFinal NVARCHAR(20) = CASE WHEN @Aprobado = 1 THEN 'APROBADO' ELSE 'RECHAZADO' END;
    DECLARE @AprobacionesMinimas INT = 2;

    SELECT @AprobacionesMinimas = ISNULL(TRY_CONVERT(INT, ValorNumero), @AprobacionesMinimas)
    FROM dbo.a_parametro
    WHERE Codigo = 'PAGO_APROBACIONES_MINIMAS'
      AND Activo = 1;

    IF ISNULL(@IdPago, 0) <= 0
    BEGIN
        RAISERROR('Debe indicar el pago.', 16, 1);
        RETURN;
    END;

    IF ISNULL(@NivelAprobacion, 0) <= 0
    BEGIN
        RAISERROR('Debe indicar el nivel de aprobacion.', 16, 1);
        RETURN;
    END;

    BEGIN TRANSACTION;

    IF NOT EXISTS (SELECT 1 FROM dbo.a_pago WHERE IdPago = @IdPago)
    BEGIN
        ROLLBACK TRANSACTION;
        RAISERROR('No existe el pago indicado.', 16, 1);
        RETURN;
    END;

    MERGE dbo.a_pago_aprobacion AS target
    USING (SELECT @IdPago AS IdPago, @NivelAprobacion AS NivelAprobacion) AS source
    ON target.IdPago = source.IdPago AND target.NivelAprobacion = source.NivelAprobacion
    WHEN MATCHED THEN
        UPDATE SET
            EstadoAprobacion = @EstadoFinal,
            IdEmpleadoAprobador = @IdEmpleadoAprobador,
            FechaAprobacion = CASE WHEN @Aprobado = 1 THEN SYSDATETIME() ELSE NULL END,
            Observacion = @Observacion,
            UsuarioModificacion = @Usuario,
            FechaModificacion = SYSDATETIME()
    WHEN NOT MATCHED THEN
        INSERT (IdPago, NivelAprobacion, EstadoAprobacion, IdEmpleadoAprobador, FechaAprobacion, Observacion, UsuarioCreacion, FechaCreacion)
        VALUES (@IdPago, @NivelAprobacion, @EstadoFinal, @IdEmpleadoAprobador, CASE WHEN @Aprobado = 1 THEN SYSDATETIME() ELSE NULL END, @Observacion, @Usuario, SYSDATETIME());

    IF @Aprobado = 1
    BEGIN
        IF (
            SELECT COUNT(1)
            FROM dbo.a_pago_aprobacion
            WHERE IdPago = @IdPago
              AND EstadoAprobacion = 'APROBADO'
        ) >= @AprobacionesMinimas
        BEGIN
            UPDATE dbo.a_pago
            SET EstadoValidacion = 'APROBADO',
                FechaValidacion = SYSDATETIME(),
                IdEmpleadoValidador = @IdEmpleadoAprobador,
                UsuarioModificacion = @Usuario,
                FechaModificacion = SYSDATETIME()
            WHERE IdPago = @IdPago;
        END
        ELSE
        BEGIN
            UPDATE dbo.a_pago
            SET EstadoValidacion = 'PARCIAL',
                UsuarioModificacion = @Usuario,
                FechaModificacion = SYSDATETIME()
            WHERE IdPago = @IdPago;
        END;
    END
    ELSE
    BEGIN
        UPDATE dbo.a_pago
        SET EstadoValidacion = 'RECHAZADO',
            UsuarioModificacion = @Usuario,
            FechaModificacion = SYSDATETIME()
        WHERE IdPago = @IdPago;
    END;

    COMMIT TRANSACTION;

    SELECT Exito = 1, Mensaje = 'Aprobacion de pago registrada correctamente.', IdPago = @IdPago;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_a_Pago_Aplicar
    @IdPago INT,
    @AplicacionesJson NVARCHAR(MAX),
    @UsuarioAccion NVARCHAR(100) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Usuario NVARCHAR(100) = ISNULL(NULLIF(LTRIM(RTRIM(@UsuarioAccion)), ''), 'sistema');
    DECLARE @ImporteDisponible DECIMAL(18,2);
    DECLARE @TotalAplicado DECIMAL(18,2);

    IF ISJSON(@AplicacionesJson) <> 1
    BEGIN
        RAISERROR('El payload de aplicaciones no es valido.', 16, 1);
        RETURN;
    END;

    SELECT @ImporteDisponible = ISNULL(ImporteConvertido, 0)
    FROM dbo.a_pago
    WHERE IdPago = @IdPago
      AND EstadoValidacion IN ('APROBADO', 'PARCIAL', 'PENDIENTE');

    IF @ImporteDisponible IS NULL
    BEGIN
        RAISERROR('No existe el pago indicado o no se puede aplicar.', 16, 1);
        RETURN;
    END;

    BEGIN TRANSACTION;

    ;WITH src AS
    (
        SELECT
            TRY_CONVERT(INT, JSON_VALUE(value, '$.IdObligacion')) AS IdObligacion,
            TRY_CONVERT(INT, JSON_VALUE(value, '$.IdConcepto')) AS IdConcepto,
            TRY_CONVERT(CHAR(3), JSON_VALUE(value, '$.MonedaAplicacion')) AS MonedaAplicacion,
            TRY_CONVERT(DECIMAL(18,6), JSON_VALUE(value, '$.TipoCambioAplicado')) AS TipoCambioAplicado,
            TRY_CONVERT(DECIMAL(18,2), JSON_VALUE(value, '$.ImporteAplicado')) AS ImporteAplicado,
            TRY_CONVERT(DECIMAL(18,2), JSON_VALUE(value, '$.ImporteCapital')) AS ImporteCapital,
            TRY_CONVERT(DECIMAL(18,2), JSON_VALUE(value, '$.ImporteInteres')) AS ImporteInteres,
            TRY_CONVERT(DECIMAL(18,2), JSON_VALUE(value, '$.ImportePenalidad')) AS ImportePenalidad,
            TRY_CONVERT(DECIMAL(18,2), JSON_VALUE(value, '$.ImporteDescuento')) AS ImporteDescuento,
            TRY_CONVERT(DECIMAL(18,2), JSON_VALUE(value, '$.ImporteAjuste')) AS ImporteAjuste
        FROM OPENJSON(@AplicacionesJson)
    ),
    data AS
    (
        SELECT
            IdObligacion,
            IdConcepto,
            MonedaAplicacion,
            TipoCambioAplicado,
            ISNULL(ImporteAplicado, 0) AS ImporteAplicado,
            ISNULL(ImporteCapital, 0) AS ImporteCapital,
            ISNULL(ImporteInteres, 0) AS ImporteInteres,
            ISNULL(ImportePenalidad, 0) AS ImportePenalidad,
            ISNULL(ImporteDescuento, 0) AS ImporteDescuento,
            ISNULL(ImporteAjuste, 0) AS ImporteAjuste
        FROM src
        WHERE IdObligacion IS NOT NULL
    )
    SELECT @TotalAplicado = ISNULL(SUM(ImporteAplicado), 0)
    FROM data;

    IF @TotalAplicado > @ImporteDisponible
    BEGIN
        ROLLBACK TRANSACTION;
        RAISERROR('El importe aplicado supera el disponible del pago.', 16, 1);
        RETURN;
    END;

    INSERT INTO dbo.a_pago_aplicacion
    (
        IdPago, IdObligacion, IdConcepto, MonedaAplicacion, TipoCambioAplicado, ImporteAplicado, ImporteCapital, ImporteInteres,
        ImportePenalidad, ImporteDescuento, ImporteAjuste, SaldoFavorGenerado, FechaAplicacion, UsuarioAccion, UsuarioCreacion, FechaCreacion
    )
    SELECT
        @IdPago,
        d.IdObligacion,
        d.IdConcepto,
        d.MonedaAplicacion,
        d.TipoCambioAplicado,
        d.ImporteAplicado,
        d.ImporteCapital,
        d.ImporteInteres,
        d.ImportePenalidad,
        d.ImporteDescuento,
        d.ImporteAjuste,
        0,
        SYSDATETIME(),
        @Usuario,
        @Usuario,
        SYSDATETIME()
    FROM data d;

    UPDATE o
    SET TotalPagado = TotalPagado + x.TotalAplicadoObligacion,
        SaldoPendiente = CASE
                            WHEN (o.TotalPagar - (o.TotalPagado + x.TotalAplicadoObligacion)) < 0 THEN 0
                            ELSE (o.TotalPagar - (o.TotalPagado + x.TotalAplicadoObligacion))
                         END,
        Estado = CASE
                    WHEN (o.TotalPagar - (o.TotalPagado + x.TotalAplicadoObligacion)) <= 0 THEN 'PAGADO'
                    WHEN (o.TotalPagado + x.TotalAplicadoObligacion) > 0 THEN 'PARCIAL'
                    ELSE o.Estado
                 END,
        UsuarioModificacion = @Usuario,
        FechaModificacion = SYSDATETIME()
    FROM dbo.a_obligacion o
    INNER JOIN
    (
        SELECT IdObligacion, SUM(ImporteAplicado) AS TotalAplicadoObligacion
        FROM data
        GROUP BY IdObligacion
    ) x
        ON x.IdObligacion = o.IdObligacion;

    INSERT INTO dbo.a_obligacion_movimiento
    (
        IdObligacion, IdPago, TipoMovimiento, Moneda, TipoCambio, ImporteOriginal, ImporteConvertido, Observacion,
        FechaMovimiento, UsuarioAccion, UsuarioCreacion, FechaCreacion
    )
    SELECT
        d.IdObligacion,
        @IdPago,
        'PAGO_APLICADO',
        d.MonedaAplicacion,
        d.TipoCambioAplicado,
        d.ImporteAplicado,
        d.ImporteAplicado,
        'Aplicacion de pago.',
        SYSDATETIME(),
        @Usuario,
        @Usuario,
        SYSDATETIME()
    FROM data d;

    IF @TotalAplicado < @ImporteDisponible
    BEGIN
        INSERT INTO dbo.a_saldo_favor
        (
            IdInquilino, IdContrato, IdConcepto, Moneda, TipoCambio, ImporteOriginal, ImporteConvertido, FechaOrigen,
            Estado, Observacion, UsuarioCreacion, FechaCreacion
        )
        SELECT TOP (1)
            p.IdInquilino,
            o.IdContrato,
            NULL,
            p.MonedaOperacion,
            p.TipoCambio,
            (@ImporteDisponible - @TotalAplicado),
            (@ImporteDisponible - @TotalAplicado),
            p.FechaOperacion,
            'DISPONIBLE',
            'Saldo a favor generado por excedente o pago adelantado.',
            @Usuario,
            SYSDATETIME()
        FROM dbo.a_pago p
        LEFT JOIN dbo.a_obligacion o ON o.IdObligacion = (SELECT TOP 1 IdObligacion FROM data ORDER BY IdObligacion)
        WHERE p.IdPago = @IdPago;
    END;

    UPDATE dbo.a_pago
    SET EstadoValidacion = CASE WHEN @TotalAplicado = @ImporteDisponible THEN 'APROBADO' ELSE 'PARCIAL' END,
        UsuarioModificacion = @Usuario,
        FechaModificacion = SYSDATETIME()
    WHERE IdPago = @IdPago;

    COMMIT TRANSACTION;

    SELECT Exito = 1, Mensaje = 'Pago aplicado correctamente.', IdPago = @IdPago, TotalAplicado = @TotalAplicado, SaldoPendiente = @ImporteDisponible - @TotalAplicado;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_a_Pago_Revertir
    @IdPago INT,
    @UsuarioAccion NVARCHAR(100) = NULL,
    @Observacion NVARCHAR(500) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Usuario NVARCHAR(100) = ISNULL(NULLIF(LTRIM(RTRIM(@UsuarioAccion)), ''), 'sistema');

    BEGIN TRANSACTION;

    IF NOT EXISTS (SELECT 1 FROM dbo.a_pago WHERE IdPago = @IdPago)
    BEGIN
        ROLLBACK TRANSACTION;
        RAISERROR('No existe el pago indicado.', 16, 1);
        RETURN;
    END;

    UPDATE o
    SET TotalPagado = CASE WHEN o.TotalPagado - x.TotalAplicado < 0 THEN 0 ELSE o.TotalPagado - x.TotalAplicado END,
        SaldoPendiente = o.TotalPagar - CASE WHEN o.TotalPagado - x.TotalAplicado < 0 THEN 0 ELSE o.TotalPagado - x.TotalAplicado END,
        Estado = CASE
                    WHEN o.TotalPagar - CASE WHEN o.TotalPagado - x.TotalAplicado < 0 THEN 0 ELSE o.TotalPagado - x.TotalAplicado END <= 0 THEN 'PAGADO'
                    WHEN o.TotalPagado - x.TotalAplicado > 0 THEN 'PARCIAL'
                    ELSE 'PENDIENTE'
                 END,
        UsuarioModificacion = @Usuario,
        FechaModificacion = SYSDATETIME()
    FROM dbo.a_obligacion o
    INNER JOIN
    (
        SELECT IdObligacion, SUM(ImporteAplicado) AS TotalAplicado
        FROM dbo.a_pago_aplicacion
        WHERE IdPago = @IdPago
          AND Reversado = 0
        GROUP BY IdObligacion
    ) x
        ON x.IdObligacion = o.IdObligacion;

    UPDATE dbo.a_pago_aplicacion
    SET Reversado = 1,
        UsuarioModificacion = @Usuario,
        FechaModificacion = SYSDATETIME()
    WHERE IdPago = @IdPago
      AND Reversado = 0;

    UPDATE dbo.a_pago
    SET EstadoValidacion = 'ANULADO',
        UsuarioModificacion = @Usuario,
        FechaModificacion = SYSDATETIME()
    WHERE IdPago = @IdPago;

    INSERT INTO dbo.a_obligacion_movimiento
    (
        IdObligacion, IdPago, TipoMovimiento, Moneda, TipoCambio, ImporteOriginal, ImporteConvertido, Observacion,
        FechaMovimiento, UsuarioAccion, UsuarioCreacion, FechaCreacion
    )
    SELECT
        pa.IdObligacion,
        @IdPago,
        'REVERSA',
        pa.MonedaAplicacion,
        pa.TipoCambioAplicado,
        pa.ImporteAplicado,
        pa.ImporteAplicado,
        ISNULL(@Observacion, 'Reversa de pago.'),
        SYSDATETIME(),
        @Usuario,
        @Usuario,
        SYSDATETIME()
    FROM dbo.a_pago_aplicacion pa
    WHERE pa.IdPago = @IdPago;

    COMMIT TRANSACTION;

    SELECT Exito = 1, Mensaje = 'Pago revertido correctamente.', IdPago = @IdPago;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_a_Fraccionamiento_Guardar
    @NumeroFraccionamiento NVARCHAR(50),
    @IdInquilino INT,
    @IdContrato INT,
    @FechaFraccionamiento DATE,
    @ImporteTotalFraccionado DECIMAL(18,2),
    @Moneda CHAR(3),
    @CantidadCuotas INT,
    @FechaInicial DATE,
    @Periodicidad NVARCHAR(30),
    @ImportePorCuota DECIMAL(18,2),
    @CuotaFinalDiferente DECIMAL(18,2) = NULL,
    @InteresFraccionamiento DECIMAL(18,2) = 0,
    @Estado NVARCHAR(20) = 'PENDIENTE',
    @Motivo NVARCHAR(500) = NULL,
    @DocumentoAceptacionNombre NVARCHAR(250) = NULL,
    @DocumentoAceptacionUrl NVARCHAR(1000) = NULL,
    @IdEmpleadoAprueba INT = NULL,
    @UsuarioAccion NVARCHAR(100) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Usuario NVARCHAR(100) = ISNULL(NULLIF(LTRIM(RTRIM(@UsuarioAccion)), ''), 'sistema');
    DECLARE @IdFraccionamiento INT;
    DECLARE @i INT = 1;

    IF ISNULL(LTRIM(RTRIM(@NumeroFraccionamiento)), '') = ''
    BEGIN
        RAISERROR('Debe indicar el numero de fraccionamiento.', 16, 1);
        RETURN;
    END;

    IF ISNULL(@CantidadCuotas, 0) <= 0
    BEGIN
        RAISERROR('La cantidad de cuotas debe ser mayor a cero.', 16, 1);
        RETURN;
    END;

    BEGIN TRANSACTION;

    IF EXISTS (SELECT 1 FROM dbo.a_fraccionamiento WHERE NumeroFraccionamiento = LTRIM(RTRIM(@NumeroFraccionamiento)))
    BEGIN
        ROLLBACK TRANSACTION;
        RAISERROR('Ya existe el fraccionamiento indicado.', 16, 1);
        RETURN;
    END;

    INSERT INTO dbo.a_fraccionamiento
    (
        NumeroFraccionamiento, IdInquilino, IdContrato, FechaFraccionamiento, ImporteTotalFraccionado, Moneda,
        CantidadCuotas, FechaInicial, Periodicidad, ImportePorCuota, CuotaFinalDiferente, InteresFraccionamiento, Estado, Motivo,
        DocumentoAceptacionNombre, DocumentoAceptacionUrl, IdEmpleadoAprueba, FechaAprobacion, UsuarioCreacion, FechaCreacion
    )
    VALUES
    (
        LTRIM(RTRIM(@NumeroFraccionamiento)), @IdInquilino, @IdContrato, @FechaFraccionamiento, @ImporteTotalFraccionado, @Moneda,
        @CantidadCuotas, @FechaInicial, @Periodicidad, @ImportePorCuota, @CuotaFinalDiferente, ISNULL(@InteresFraccionamiento, 0), ISNULL(@Estado, 'PENDIENTE'), @Motivo,
        @DocumentoAceptacionNombre, @DocumentoAceptacionUrl, @IdEmpleadoAprueba, CASE WHEN @IdEmpleadoAprueba IS NULL THEN NULL ELSE SYSDATETIME() END, @Usuario, SYSDATETIME()
    );

    SET @IdFraccionamiento = SCOPE_IDENTITY();

    WHILE @i <= @CantidadCuotas
    BEGIN
        INSERT INTO dbo.a_fraccionamiento_cuota
        (
            IdFraccionamiento, NumeroCuota, FechaVencimiento, Moneda, ImporteCuota, ImportePagado, SaldoPendiente, Estado,
            UsuarioCreacion, FechaCreacion
        )
        VALUES
        (
            @IdFraccionamiento, @i, DATEADD(MONTH, @i - 1, @FechaInicial), @Moneda,
            CASE WHEN @i = @CantidadCuotas AND @CuotaFinalDiferente IS NOT NULL THEN @CuotaFinalDiferente ELSE @ImportePorCuota END,
            0,
            CASE WHEN @i = @CantidadCuotas AND @CuotaFinalDiferente IS NOT NULL THEN @CuotaFinalDiferente ELSE @ImportePorCuota END,
            'PENDIENTE',
            @Usuario,
            SYSDATETIME()
        );

        SET @i += 1;
    END;

    COMMIT TRANSACTION;

    SELECT Exito = 1, Mensaje = 'Fraccionamiento guardado correctamente.', IdFraccionamiento = @IdFraccionamiento;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_a_Garantia_Guardar
    @IdGarantia INT = NULL,
    @IdContrato INT,
    @IdInquilino INT,
    @GarantiaPactada DECIMAL(18,2) = 0,
    @GarantiaPagada DECIMAL(18,2) = 0,
    @GarantiaParcialPagada DECIMAL(18,2) = 0,
    @GarantiaPendiente DECIMAL(18,2) = 0,
    @GarantiaAplicadaDeudas DECIMAL(18,2) = 0,
    @GarantiaDevuelta DECIMAL(18,2) = 0,
    @GarantiaRetenida DECIMAL(18,2) = 0,
    @GarantiaEjecutada DECIMAL(18,2) = 0,
    @FechaDevolucion DATE = NULL,
    @MotivoRetencion NVARCHAR(500) = NULL,
    @DocumentosSustentatorios NVARCHAR(1000) = NULL,
    @Estado NVARCHAR(20) = 'VIGENTE',
    @UsuarioAccion NVARCHAR(100) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Usuario NVARCHAR(100) = ISNULL(NULLIF(LTRIM(RTRIM(@UsuarioAccion)), ''), 'sistema');

    BEGIN TRANSACTION;

    IF @IdGarantia IS NULL OR @IdGarantia = 0
    BEGIN
        INSERT INTO dbo.a_garantia
        (
            IdContrato, IdInquilino, GarantiaPactada, GarantiaPagada, GarantiaParcialPagada, GarantiaPendiente, GarantiaAplicadaDeudas,
            GarantiaDevuelta, GarantiaRetenida, GarantiaEjecutada, FechaDevolucion, MotivoRetencion, DocumentosSustentatorios, Estado,
            UsuarioCreacion, FechaCreacion
        )
        VALUES
        (
            @IdContrato, @IdInquilino, @GarantiaPactada, @GarantiaPagada, @GarantiaParcialPagada, @GarantiaPendiente, @GarantiaAplicadaDeudas,
            @GarantiaDevuelta, @GarantiaRetenida, @GarantiaEjecutada, @FechaDevolucion, @MotivoRetencion, @DocumentosSustentatorios, @Estado,
            @Usuario, SYSDATETIME()
        );

        SET @IdGarantia = SCOPE_IDENTITY();
    END;
    ELSE
    BEGIN
        UPDATE dbo.a_garantia
        SET IdContrato = @IdContrato,
            IdInquilino = @IdInquilino,
            GarantiaPactada = @GarantiaPactada,
            GarantiaPagada = @GarantiaPagada,
            GarantiaParcialPagada = @GarantiaParcialPagada,
            GarantiaPendiente = @GarantiaPendiente,
            GarantiaAplicadaDeudas = @GarantiaAplicadaDeudas,
            GarantiaDevuelta = @GarantiaDevuelta,
            GarantiaRetenida = @GarantiaRetenida,
            GarantiaEjecutada = @GarantiaEjecutada,
            FechaDevolucion = @FechaDevolucion,
            MotivoRetencion = @MotivoRetencion,
            DocumentosSustentatorios = @DocumentosSustentatorios,
            Estado = @Estado,
            UsuarioModificacion = @Usuario,
            FechaModificacion = SYSDATETIME()
        WHERE IdGarantia = @IdGarantia;

        IF @@ROWCOUNT = 0
        BEGIN
            ROLLBACK TRANSACTION;
            RAISERROR('No existe la garantia indicada.', 16, 1);
            RETURN;
        END;
    END;

    INSERT INTO dbo.a_garantia_movimiento
    (
        IdGarantia, TipoMovimiento, Moneda, TipoCambio, ImporteOriginal, ImporteConvertido, Observacion, FechaMovimiento,
        UsuarioAccion, UsuarioCreacion, FechaCreacion
    )
    VALUES
    (
        @IdGarantia, 'GUARDAR', 'PEN', NULL, @GarantiaPactada, @GarantiaPactada, 'Registro o actualizacion de garantia.', SYSDATETIME(),
        @Usuario, @Usuario, SYSDATETIME()
    );

    COMMIT TRANSACTION;

    SELECT Exito = 1, Mensaje = 'Garantia guardada correctamente.', IdGarantia = @IdGarantia;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_a_Cobranza_Gestion_Registrar
    @IdContrato INT,
    @IdInquilino INT,
    @IdObligacion INT = NULL,
    @TipoGestion NVARCHAR(50),
    @ResultadoGestion NVARCHAR(100) = NULL,
    @CompromisoPagoFecha DATE = NULL,
    @CompromisoPagoImporte DECIMAL(18,2) = NULL,
    @Estado NVARCHAR(20) = 'ABIERTA',
    @Contacto NVARCHAR(150) = NULL,
    @Observacion NVARCHAR(500) = NULL,
    @IdEmpleadoGestor INT = NULL,
    @UsuarioAccion NVARCHAR(100) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Usuario NVARCHAR(100) = ISNULL(NULLIF(LTRIM(RTRIM(@UsuarioAccion)), ''), 'sistema');
    DECLARE @IdCobranzaGestion INT;

    BEGIN TRANSACTION;

    INSERT INTO dbo.a_cobranza_gestion
    (
        IdContrato, IdInquilino, IdObligacion, TipoGestion, ResultadoGestion, CompromisoPagoFecha, CompromisoPagoImporte, Estado,
        Contacto, Observacion, IdEmpleadoGestor, UsuarioCreacion, FechaCreacion
    )
    VALUES
    (
        @IdContrato, @IdInquilino, @IdObligacion, @TipoGestion, @ResultadoGestion, @CompromisoPagoFecha, @CompromisoPagoImporte, @Estado,
        @Contacto, @Observacion, @IdEmpleadoGestor, @Usuario, SYSDATETIME()
    );

    SET @IdCobranzaGestion = SCOPE_IDENTITY();

    IF @CompromisoPagoFecha IS NOT NULL AND @CompromisoPagoImporte IS NOT NULL
    BEGIN
        INSERT INTO dbo.a_cobranza_compromiso
        (
            IdCobranzaGestion, FechaCompromiso, ImporteCompromiso, Estado, Observacion, UsuarioCreacion, FechaCreacion
        )
        VALUES
        (
            @IdCobranzaGestion, @CompromisoPagoFecha, @CompromisoPagoImporte, 'PENDIENTE', @Observacion, @Usuario, SYSDATETIME()
        );
    END;

    COMMIT TRANSACTION;

    SELECT Exito = 1, Mensaje = 'Gestion de cobranza registrada correctamente.', IdCobranzaGestion = @IdCobranzaGestion;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_a_Arbitrio_Guardar
    @IdArbitrio INT = NULL,
    @IdContrato INT,
    @IdInmueble INT,
    @IdUnidad INT = NULL,
    @Periodicidad NVARCHAR(30),
    @MontoAnual DECIMAL(18,2) = 0,
    @Moneda CHAR(3),
    @FechaInicio DATE,
    @FechaFin DATE = NULL,
    @AplicaAreaComun BIT = 0,
    @AplicaLocalPropio BIT = 1,
    @Estado NVARCHAR(20) = 'ACTIVO',
    @Observacion NVARCHAR(500) = NULL,
    @DetalleJson NVARCHAR(MAX) = NULL,
    @UsuarioAccion NVARCHAR(100) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Usuario NVARCHAR(100) = ISNULL(NULLIF(LTRIM(RTRIM(@UsuarioAccion)), ''), 'sistema');
    DECLARE @IdArbitrioGenerado INT;

    IF LEN(ISNULL(@Moneda, '')) <> 3
    BEGIN
        RAISERROR('Debe indicar una moneda valida de tres caracteres.', 16, 1);
        RETURN;
    END;

    BEGIN TRANSACTION;

    IF @IdArbitrio IS NULL OR @IdArbitrio = 0
    BEGIN
        INSERT INTO dbo.a_arbitrio
        (
            IdContrato, IdInmueble, IdUnidad, Periodicidad, MontoAnual, Moneda, FechaInicio, FechaFin, AplicaAreaComun,
            AplicaLocalPropio, Estado, Observacion, UsuarioCreacion, FechaCreacion
        )
        VALUES
        (
            @IdContrato, @IdInmueble, @IdUnidad, @Periodicidad, @MontoAnual, @Moneda, @FechaInicio, @FechaFin, @AplicaAreaComun,
            @AplicaLocalPropio, @Estado, @Observacion, @Usuario, SYSDATETIME()
        );

        SET @IdArbitrioGenerado = SCOPE_IDENTITY();
    END;
    ELSE
    BEGIN
        UPDATE dbo.a_arbitrio
        SET IdContrato = @IdContrato,
            IdInmueble = @IdInmueble,
            IdUnidad = @IdUnidad,
            Periodicidad = @Periodicidad,
            MontoAnual = @MontoAnual,
            Moneda = @Moneda,
            FechaInicio = @FechaInicio,
            FechaFin = @FechaFin,
            AplicaAreaComun = @AplicaAreaComun,
            AplicaLocalPropio = @AplicaLocalPropio,
            Estado = @Estado,
            Observacion = @Observacion,
            UsuarioModificacion = @Usuario,
            FechaModificacion = SYSDATETIME()
        WHERE IdArbitrio = @IdArbitrio;

        SET @IdArbitrioGenerado = @IdArbitrio;
    END;

    IF ISJSON(@DetalleJson) = 1
    BEGIN
        INSERT INTO dbo.a_arbitrio_detalle
        (
            IdArbitrio, Anio, Mes, PeriodoDesde, PeriodoHasta, Importe, Estado, Observacion, UsuarioCreacion, FechaCreacion
        )
        SELECT
            @IdArbitrioGenerado,
            TRY_CONVERT(INT, JSON_VALUE(value, '$.Anio')),
            TRY_CONVERT(INT, JSON_VALUE(value, '$.Mes')),
            TRY_CONVERT(DATE, JSON_VALUE(value, '$.PeriodoDesde')),
            TRY_CONVERT(DATE, JSON_VALUE(value, '$.PeriodoHasta')),
            TRY_CONVERT(DECIMAL(18,2), JSON_VALUE(value, '$.Importe')),
            ISNULL(JSON_VALUE(value, '$.Estado'), 'PENDIENTE'),
            JSON_VALUE(value, '$.Observacion'),
            @Usuario,
            SYSDATETIME()
        FROM OPENJSON(@DetalleJson)
        WHERE TRY_CONVERT(INT, JSON_VALUE(value, '$.Anio')) IS NOT NULL
          AND TRY_CONVERT(INT, JSON_VALUE(value, '$.Mes')) IS NOT NULL
          AND TRY_CONVERT(DATE, JSON_VALUE(value, '$.PeriodoDesde')) IS NOT NULL
          AND TRY_CONVERT(DATE, JSON_VALUE(value, '$.PeriodoHasta')) IS NOT NULL;
    END;

    COMMIT TRANSACTION;

    SELECT Exito = 1, Mensaje = 'Arbitrio guardado correctamente.', IdArbitrio = @IdArbitrioGenerado;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_a_EstadoCuenta_Consultar
    @IdContrato INT = NULL,
    @IdInquilino INT = NULL,
    @IdConcepto INT = NULL
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        o.IdObligacion,
        o.IdContrato,
        o.IdUnidad,
        o.IdConcepto,
        c.NombreConcepto,
        o.Anio,
        o.Mes,
        o.PeriodoDesde,
        o.PeriodoHasta,
        o.FechaVencimiento,
        o.Moneda,
        o.ImporteOriginal,
        o.ImporteConvertido,
        o.Interes,
        o.Penalidad,
        o.Descuento,
        o.Ajuste,
        o.TotalPagar,
        o.TotalPagado,
        o.SaldoPendiente,
        o.Estado,
        o.Observacion
    FROM dbo.a_obligacion o
    INNER JOIN dbo.a_concepto c
        ON c.IdConcepto = o.IdConcepto
    WHERE (@IdContrato IS NULL OR o.IdContrato = @IdContrato)
      AND (@IdInquilino IS NULL OR EXISTS (SELECT 1 FROM dbo.a_contrato ct WHERE ct.IdContrato = o.IdContrato AND ct.IdInquilino = @IdInquilino))
      AND (@IdConcepto IS NULL OR o.IdConcepto = @IdConcepto)
    ORDER BY o.FechaVencimiento DESC, o.IdObligacion DESC;
END;
GO
