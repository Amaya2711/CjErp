-- Reporte / Ventas SUNAT: carga mensual del "Registro de Ventas" SIRE (Excel) y validación de IdCliente (IdEmpresa queda pendiente de regla).
-- Una carga = un periodo (año-mes, columna Periodo AAAAMM) de un RUC emisor: recargar el mismo periodo REEMPLAZA lo anterior.
-- Idempotente (IF NOT EXISTS / CREATE OR ALTER). PV: no ejecutado en la BD real; validar que dbo.Cliente tenga IdCliente, NombreCliente, Estado.
SET XACT_ABORT ON;
GO

-- La primera versión de la tabla (formato "Registro de Ventas - Acumulado", sin columna Periodo) se descarta: era de prueba.
-- Si ya cargó datos reales en esa versión, respáldelos antes de ejecutar este script.
IF OBJECT_ID('dbo.VentasSunat', 'U') IS NOT NULL AND COL_LENGTH('dbo.VentasSunat', 'Periodo') IS NULL
    DROP TABLE dbo.VentasSunat;
GO

IF OBJECT_ID('dbo.VentasSunat', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.VentasSunat
    (
        IdVentaSunat               BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_VentasSunat PRIMARY KEY,
        Lote                       UNIQUEIDENTIFIER     NOT NULL,
        Periodo                    CHAR(6)              NOT NULL,   -- AAAAMM (columna Periodo del SIRE)
        Anio                       SMALLINT             NOT NULL,   -- derivado de Periodo
        Mes                        TINYINT              NOT NULL,   -- derivado de Periodo
        RucEmisor                  VARCHAR(11)          NOT NULL,   -- Ruc
        RazonSocialEmisor          VARCHAR(250)         NULL,       -- Razon Social (empresa emisora)
        CarSunat                   VARCHAR(40)          NULL,       -- CAR SUNAT
        FechaEmision               DATE                 NOT NULL,   -- Fecha de emisión
        FechaVcto                  DATE                 NULL,       -- Fecha Vcto/Pago
        TipoCp                     VARCHAR(3)           NOT NULL,   -- Tipo CP/Doc.
        Serie                      VARCHAR(10)          NOT NULL,   -- Serie del CDP
        NroCp                      VARCHAR(20)          NOT NULL,   -- Nro CP o Doc. Nro Inicial (Rango)
        NroFinal                   VARCHAR(20)          NULL,       -- Nro Final (Rango)
        TipoDocIdentidad           VARCHAR(2)           NULL,       -- Tipo Doc Identidad
        NroDocIdentidad            VARCHAR(20)          NULL,       -- Nro Doc Identidad (RUC del cliente)
        RazonSocial                VARCHAR(250)         NULL,       -- Apellidos Nombres/ Razón Social (cliente)
        ValorFacturadoExportacion  DECIMAL(18,2)        NULL,
        BiGravada                  DECIMAL(18,2)        NULL,
        DsctoBi                    DECIMAL(18,2)        NULL,       -- en notas de crédito viene negativo
        Igv                        DECIMAL(18,2)        NULL,       -- IGV / IPM
        DsctoIgv                   DECIMAL(18,2)        NULL,
        MtoExonerado               DECIMAL(18,2)        NULL,
        MtoInafecto                DECIMAL(18,2)        NULL,
        Isc                        DECIMAL(18,2)        NULL,
        BiGravIvap                 DECIMAL(18,2)        NULL,
        Ivap                       DECIMAL(18,2)        NULL,
        Icbper                     DECIMAL(18,2)        NULL,
        OtrosTributos              DECIMAL(18,2)        NULL,
        TotalCp                    DECIMAL(18,2)        NULL,       -- Total CP (negativo en notas de crédito)
        Moneda                     VARCHAR(3)           NULL,       -- PEN / USD (en la moneda del comprobante; sin convertir)
        TipoCambio                 DECIMAL(10,3)        NULL,
        FecEmisionDocMod           DATE                 NULL,
        TipoCpMod                  VARCHAR(3)           NULL,
        SerieCpMod                 VARCHAR(10)          NULL,
        NroCpMod                   VARCHAR(20)          NULL,
        IdProyectoOperadores       VARCHAR(30)          NULL,
        TipoNota                   VARCHAR(3)           NULL,
        EstComp                    VARCHAR(3)           NULL,
        ValorFobEmbarcado          DECIMAL(18,2)        NULL,
        ValorOpGratuitas           DECIMAL(18,2)        NULL,
        TipoOperacion              VARCHAR(10)          NULL,
        DamCp                      VARCHAR(30)          NULL,
        Clu                        VARCHAR(30)          NULL,
        IdEmpresa                  INT                  NULL,       -- pendiente: se registrará con una regla propia (no la asigna la validación)
        IdCliente                  INT                  NULL,       -- dbo.Cliente.IdCliente cuando NombreCliente = RazonSocial
        FechaCarga                 DATETIME2(0)         NOT NULL CONSTRAINT DF_VentasSunat_FechaCarga DEFAULT (SYSDATETIME()),
        UsuarioCarga               VARCHAR(100)         NULL
    );
    CREATE INDEX IX_VentasSunat_Lote ON dbo.VentasSunat (Lote);
    CREATE INDEX IX_VentasSunat_Periodo ON dbo.VentasSunat (Periodo, RucEmisor);
    CREATE INDEX IX_VentasSunat_Doc ON dbo.VentasSunat (RucEmisor, TipoCp, Serie, NroCp);
END
GO

-- @Datos: JSON array con las filas del Excel SIRE (claves camelCase). Reemplaza TODO lo cargado antes del mismo
-- Periodo + RucEmisor y devuelve el resumen de la carga.
CREATE OR ALTER PROCEDURE dbo.sp_VentasSunat_Cargar
    @Datos   NVARCHAR(MAX),
    @Lote    UNIQUEIDENTIFIER,
    @Usuario VARCHAR(100) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRANSACTION;

    SELECT *
    INTO #Datos
    FROM OPENJSON(@Datos) WITH
    (
        rucEmisor                 VARCHAR(11)   '$.rucEmisor',
        razonSocialEmisor         VARCHAR(250)  '$.razonSocialEmisor',
        periodo                   CHAR(6)       '$.periodo',
        carSunat                  VARCHAR(40)   '$.carSunat',
        fechaEmision              DATE          '$.fechaEmision',
        fechaVcto                 DATE          '$.fechaVcto',
        tipoCp                    VARCHAR(3)    '$.tipoCp',
        serie                     VARCHAR(10)   '$.serie',
        nroCp                     VARCHAR(20)   '$.nroCp',
        nroFinal                  VARCHAR(20)   '$.nroFinal',
        tipoDocIdentidad          VARCHAR(2)    '$.tipoDocIdentidad',
        nroDocIdentidad           VARCHAR(20)   '$.nroDocIdentidad',
        razonSocial               VARCHAR(250)  '$.razonSocial',
        valorFacturadoExportacion DECIMAL(18,2) '$.valorFacturadoExportacion',
        biGravada                 DECIMAL(18,2) '$.biGravada',
        dsctoBi                   DECIMAL(18,2) '$.dsctoBi',
        igv                       DECIMAL(18,2) '$.igv',
        dsctoIgv                  DECIMAL(18,2) '$.dsctoIgv',
        mtoExonerado              DECIMAL(18,2) '$.mtoExonerado',
        mtoInafecto               DECIMAL(18,2) '$.mtoInafecto',
        isc                       DECIMAL(18,2) '$.isc',
        biGravIvap                DECIMAL(18,2) '$.biGravIvap',
        ivap                      DECIMAL(18,2) '$.ivap',
        icbper                    DECIMAL(18,2) '$.icbper',
        otrosTributos             DECIMAL(18,2) '$.otrosTributos',
        totalCp                   DECIMAL(18,2) '$.totalCp',
        moneda                    VARCHAR(3)    '$.moneda',
        tipoCambio                DECIMAL(10,3) '$.tipoCambio',
        fecEmisionDocMod          DATE          '$.fecEmisionDocMod',
        tipoCpMod                 VARCHAR(3)    '$.tipoCpMod',
        serieCpMod                VARCHAR(10)   '$.serieCpMod',
        nroCpMod                  VARCHAR(20)   '$.nroCpMod',
        idProyectoOperadores      VARCHAR(30)   '$.idProyectoOperadores',
        tipoNota                  VARCHAR(3)    '$.tipoNota',
        estComp                   VARCHAR(3)    '$.estComp',
        valorFobEmbarcado         DECIMAL(18,2) '$.valorFobEmbarcado',
        valorOpGratuitas          DECIMAL(18,2) '$.valorOpGratuitas',
        tipoOperacion             VARCHAR(10)   '$.tipoOperacion',
        damCp                     VARCHAR(30)   '$.damCp',
        clu                       VARCHAR(30)   '$.clu'
    );

    DELETE v
    FROM dbo.VentasSunat v
    WHERE EXISTS (SELECT 1 FROM #Datos d WHERE d.periodo = v.Periodo AND d.rucEmisor = v.RucEmisor);
    DECLARE @Reemplazados INT = @@ROWCOUNT;

    INSERT dbo.VentasSunat
        (Lote, Periodo, Anio, Mes, RucEmisor, RazonSocialEmisor, CarSunat, FechaEmision, FechaVcto, TipoCp, Serie, NroCp,
         NroFinal, TipoDocIdentidad, NroDocIdentidad, RazonSocial, ValorFacturadoExportacion, BiGravada, DsctoBi, Igv,
         DsctoIgv, MtoExonerado, MtoInafecto, Isc, BiGravIvap, Ivap, Icbper, OtrosTributos, TotalCp, Moneda, TipoCambio,
         FecEmisionDocMod, TipoCpMod, SerieCpMod, NroCpMod, IdProyectoOperadores, TipoNota, EstComp, ValorFobEmbarcado,
         ValorOpGratuitas, TipoOperacion, DamCp, Clu, UsuarioCarga)
    SELECT @Lote, periodo, CAST(LEFT(periodo, 4) AS SMALLINT), CAST(RIGHT(periodo, 2) AS TINYINT), rucEmisor, razonSocialEmisor,
           carSunat, fechaEmision, fechaVcto, tipoCp, serie, nroCp, nroFinal, tipoDocIdentidad, nroDocIdentidad, razonSocial,
           valorFacturadoExportacion, biGravada, dsctoBi, igv, dsctoIgv, mtoExonerado, mtoInafecto, isc, biGravIvap, ivap,
           icbper, otrosTributos, totalCp, moneda, tipoCambio, fecEmisionDocMod, tipoCpMod, serieCpMod, nroCpMod,
           idProyectoOperadores, tipoNota, estComp, valorFobEmbarcado, valorOpGratuitas, tipoOperacion, damCp, clu, @Usuario
    FROM #Datos;
    DECLARE @Insertados INT = @@ROWCOUNT;

    COMMIT;

    SELECT @Lote AS Lote, (SELECT MAX(periodo) FROM #Datos) AS Periodo, @Insertados AS Insertados, @Reemplazados AS Reemplazados;
END
GO

-- Asigna IdCliente: ventassunat.RazonSocial = cliente.NombreCliente (cliente del comprobante).
-- IdEmpresa NO se asigna aquí: la columna queda para una regla de registro posterior.
CREATE OR ALTER PROCEDURE dbo.sp_VentasSunat_Validar
    @Lote UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRANSACTION;

    -- ventassunat.RazonSocial = cliente.NombreCliente (sin distinguir mayúsculas/tildes ni espacios dobles/sobrantes).
    -- Si el nombre está repetido se toma un solo IdCliente: primero el activo (Estado = 1), luego el menor id.
    SELECT Nombre, IdCliente
    INTO #Cli
    FROM (
        SELECT REPLACE(REPLACE(REPLACE(LTRIM(RTRIM(NombreCliente)), '  ', ' '), '  ', ' '), '  ', ' ') COLLATE Latin1_General_CI_AI AS Nombre,
               IdCliente,
               ROW_NUMBER() OVER (
                   PARTITION BY REPLACE(REPLACE(REPLACE(LTRIM(RTRIM(NombreCliente)), '  ', ' '), '  ', ' '), '  ', ' ') COLLATE Latin1_General_CI_AI
                   ORDER BY CASE WHEN Estado = 1 THEN 0 ELSE 1 END, IdCliente) AS rn
        FROM dbo.Cliente
        WHERE NombreCliente IS NOT NULL
    ) x
    WHERE rn = 1;

    UPDATE v SET IdCliente = c.IdCliente
    FROM dbo.VentasSunat v
    JOIN #Cli c
      ON c.Nombre = REPLACE(REPLACE(REPLACE(LTRIM(RTRIM(v.RazonSocial)), '  ', ' '), '  ', ' '), '  ', ' ') COLLATE Latin1_General_CI_AI
    WHERE v.Lote = @Lote;
    DECLARE @ClienteAsignado INT = @@ROWCOUNT;

    COMMIT;

    SELECT
        COUNT(*)                                             AS TotalFilas,
        @ClienteAsignado                                     AS ClienteAsignado,
        SUM(CASE WHEN IdCliente IS NULL THEN 1 ELSE 0 END)   AS SinCliente
    FROM dbo.VentasSunat WHERE Lote = @Lote;
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_VentasSunat_Listar
    @Lote UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;
    SELECT IdVentaSunat,
           RucEmisor AS rucEmisor, RazonSocialEmisor AS razonSocialEmisor, Periodo AS periodo, CarSunat AS carSunat,
           FechaEmision AS fechaEmision, FechaVcto AS fechaVcto, TipoCp AS tipoCp, Serie AS serie, NroCp AS nroCp,
           NroFinal AS nroFinal, TipoDocIdentidad AS tipoDocIdentidad, NroDocIdentidad AS nroDocIdentidad,
           RazonSocial AS razonSocial, ValorFacturadoExportacion AS valorFacturadoExportacion, BiGravada AS biGravada,
           DsctoBi AS dsctoBi, Igv AS igv, DsctoIgv AS dsctoIgv, MtoExonerado AS mtoExonerado, MtoInafecto AS mtoInafecto,
           Isc AS isc, BiGravIvap AS biGravIvap, Ivap AS ivap, Icbper AS icbper, OtrosTributos AS otrosTributos,
           TotalCp AS totalCp, Moneda AS moneda, TipoCambio AS tipoCambio, FecEmisionDocMod AS fecEmisionDocMod,
           TipoCpMod AS tipoCpMod, SerieCpMod AS serieCpMod, NroCpMod AS nroCpMod, IdProyectoOperadores AS idProyectoOperadores,
           TipoNota AS tipoNota, EstComp AS estComp, ValorFobEmbarcado AS valorFobEmbarcado, ValorOpGratuitas AS valorOpGratuitas,
           TipoOperacion AS tipoOperacion, DamCp AS damCp, Clu AS clu, IdEmpresa, IdCliente
    FROM dbo.VentasSunat
    WHERE Lote = @Lote
    ORDER BY IdVentaSunat;
END
GO

-- Menú (ruta nueva). Se registra bajo el mismo padre que /reportes/gerencial/backlog; asignar permisos desde Seguridad / Menú.
IF NOT EXISTS (SELECT 1 FROM dbo.SegMenu WHERE Ruta = '/reportes/gerencial/ventassunat')
BEGIN
    DECLARE @Padre INT = (SELECT TOP (1) IdMenuPadre FROM dbo.SegMenu WHERE Ruta = '/reportes/gerencial/backlog' AND EsActivo = 1 ORDER BY IdMenu);
    IF @Padre IS NULL
        THROW 50001, 'No se encontró el menú de referencia backlog. Registre la página desde Seguridad / Menú.', 1;
    INSERT dbo.SegMenu
        (IdMenuPadre, NombreMenu, Ruta, Icono, OrdenMenu, NivelMenu, EsVisible, EsActivo, EsNodoPrincipal, CodigoMenu, UsuarioCreacion, FechaCreacion)
    VALUES
        (@Padre, N'Ventas SUNAT', '/reportes/gerencial/ventassunat', 'FileSpreadsheet',
         (SELECT ISNULL(MAX(OrdenMenu),0)+1 FROM dbo.SegMenu WHERE IdMenuPadre = @Padre),
         3, 1, 1, 0, 'REP_VENTAS_SUNAT', 'MIGRACION', GETDATE());
END
GO
