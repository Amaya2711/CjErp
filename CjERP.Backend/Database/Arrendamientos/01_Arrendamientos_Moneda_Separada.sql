-- ROLLBACK-MARKER: ARRRENDAMIENTOS MONEDA SEPARADA START
-- Este script agrega moneda independiente para alquiler y mantenimiento en contratos.

IF COL_LENGTH('dbo.a_contrato', 'MonedaAlquiler') IS NULL
BEGIN
    ALTER TABLE dbo.a_contrato
        ADD MonedaAlquiler CHAR(3) NULL;
END;
GO

IF COL_LENGTH('dbo.a_contrato', 'MonedaMantenimiento') IS NULL
BEGIN
    ALTER TABLE dbo.a_contrato
        ADD MonedaMantenimiento CHAR(3) NULL;
END;
GO

UPDATE dbo.a_contrato
SET MonedaAlquiler = ISNULL(NULLIF(LTRIM(RTRIM(MonedaAlquiler)), ''), ISNULL(NULLIF(LTRIM(RTRIM(Moneda)), ''), 'PEN')),
    MonedaMantenimiento = ISNULL(NULLIF(LTRIM(RTRIM(MonedaMantenimiento)), ''), ISNULL(NULLIF(LTRIM(RTRIM(Moneda)), ''), 'PEN'))
WHERE MonedaAlquiler IS NULL
   OR MonedaMantenimiento IS NULL;
GO

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.a_contrato') AND name = 'MonedaAlquiler' AND is_nullable = 1)
BEGIN
    ALTER TABLE dbo.a_contrato
        ALTER COLUMN MonedaAlquiler CHAR(3) NOT NULL;
END;
GO

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.a_contrato') AND name = 'MonedaMantenimiento' AND is_nullable = 1)
BEGIN
    ALTER TABLE dbo.a_contrato
        ALTER COLUMN MonedaMantenimiento CHAR(3) NOT NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.check_constraints
    WHERE parent_object_id = OBJECT_ID('dbo.a_contrato')
      AND name = 'CK_a_contrato_MonedaAlquiler'
)
BEGIN
    ALTER TABLE dbo.a_contrato
        ADD CONSTRAINT CK_a_contrato_MonedaAlquiler CHECK (LEN(MonedaAlquiler) = 3);
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.check_constraints
    WHERE parent_object_id = OBJECT_ID('dbo.a_contrato')
      AND name = 'CK_a_contrato_MonedaMantenimiento'
)
BEGIN
    ALTER TABLE dbo.a_contrato
        ADD CONSTRAINT CK_a_contrato_MonedaMantenimiento CHECK (LEN(MonedaMantenimiento) = 3);
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
    @MonedaAlquiler CHAR(3) = NULL,
    @MonedaMantenimiento CHAR(3) = NULL,
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
    DECLARE @MonedaContrato CHAR(3) = ISNULL(NULLIF(LTRIM(RTRIM(@Moneda)), ''), 'PEN');
    DECLARE @MonedaAlquilerContrato CHAR(3) = ISNULL(NULLIF(LTRIM(RTRIM(@MonedaAlquiler)), ''), @MonedaContrato);
    DECLARE @MonedaMantenimientoContrato CHAR(3) = ISNULL(NULLIF(LTRIM(RTRIM(@MonedaMantenimiento)), ''), @MonedaContrato);

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

    IF LEN(ISNULL(@MonedaContrato, '')) <> 3
       OR LEN(ISNULL(@MonedaAlquilerContrato, '')) <> 3
       OR LEN(ISNULL(@MonedaMantenimientoContrato, '')) <> 3
    BEGIN
        RAISERROR('Debe indicar monedas validas de tres caracteres.', 16, 1);
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
            MonedaAlquiler, MonedaMantenimiento, ImporteAlquiler, PeriodicidadAlquiler, DiaLimitePago, DiasGracia, ImporteMantenimiento, PeriodicidadMantenimiento, DiaLimiteMantenimiento,
            GarantiaPactada, GarantiaPagada, GarantiaPendiente, TipoReajuste, PorcentajeReajuste, FormulaReajuste, FrecuenciaReajuste,
            PenalidadMora, InteresMoratorio, EstadoContrato, Observaciones, DocumentoFirmadoNombre, DocumentoFirmadoUrl,
            DocumentoFirmadoTamanoKB, IdEmpleadoResponsable, FechaSuspension, FechaCancelacion, MotivoCancelacion, Activo,
            UsuarioCreacion, FechaCreacion
        )
        VALUES
        (
            LTRIM(RTRIM(@CodigoContrato)), @IdArrendador, @IdInquilino, @IdInmueble, @IdUnidadPrincipal, @FechaFirma, @FechaInicio, @FechaFin, @MonedaContrato,
            @MonedaAlquilerContrato, @MonedaMantenimientoContrato, ISNULL(@ImporteAlquiler, 0), ISNULL(@PeriodicidadAlquiler, 'MENSUAL'), ISNULL(@DiaLimitePago, 5), ISNULL(@DiasGracia, 0), ISNULL(@ImporteMantenimiento, 0), ISNULL(@PeriodicidadMantenimiento, 'MENSUAL'), ISNULL(@DiaLimiteMantenimiento, 5),
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
                @MonedaContrato AS Moneda,
                @MonedaAlquilerContrato AS MonedaAlquiler,
                @MonedaMantenimientoContrato AS MonedaMantenimiento,
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
                MonedaAlquiler,
                MonedaMantenimiento,
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
            Moneda = @MonedaContrato,
            MonedaAlquiler = @MonedaAlquilerContrato,
            MonedaMantenimiento = @MonedaMantenimientoContrato,
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
                MonedaAlquiler,
                MonedaMantenimiento,
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

