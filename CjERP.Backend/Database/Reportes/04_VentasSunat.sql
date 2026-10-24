-- Reporte / Ventas SUNAT: carga mensual del "Registro de Ventas" SIRE (Excel); la validación asigna IdCliente (NroDocIdentidad = Cliente.NroDocumento), Empresa e IdEmpresa (RELACION_VTA / EMPRESA_VTA).
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
        IdEmpresa                  INT                  NULL,       -- ValorFin de Constante RELACION_VTA cuyo ValorIni = NroDocIdentidad (RUC del cliente)
        IdCliente                  INT                  NULL,       -- dbo.Cliente.IdCliente cuando NombreCliente = RazonSocial
        Empresa                    VARCHAR(150)         NULL,       -- ValorIni de Constante EMPRESA_VTA (via RELACION_VTA por RUC del cliente)
        FechaCarga                 DATETIME2(0)         NOT NULL CONSTRAINT DF_VentasSunat_FechaCarga DEFAULT (SYSDATETIME()),
        UsuarioCarga               VARCHAR(100)         NULL
    );
    CREATE INDEX IX_VentasSunat_Lote ON dbo.VentasSunat (Lote);
    CREATE INDEX IX_VentasSunat_Periodo ON dbo.VentasSunat (Periodo, RucEmisor);
    CREATE INDEX IX_VentasSunat_Doc ON dbo.VentasSunat (RucEmisor, TipoCp, Serie, NroCp);
END
GO

-- Tablas creadas con una version anterior de este script: agregar la columna Empresa.
IF COL_LENGTH('dbo.VentasSunat', 'Empresa') IS NULL
    ALTER TABLE dbo.VentasSunat ADD Empresa VARCHAR(150) NULL;
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

-- Asigna IdCliente: ventassunat.NroDocIdentidad (RUC del cliente) = dbo.Cliente.NroDocumento.
-- IdEmpresa y Empresa NO se asignan aqui: los graba sp_VentasSunat_AsignarEmpresa (regla RELACION_VTA / EMPRESA_VTA, resuelta por el backend).
-- PV: confirmar en la BD que dbo.Cliente tenga la columna NroDocumento.
CREATE OR ALTER PROCEDURE dbo.sp_VentasSunat_Validar
    @Lote UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRANSACTION;

    -- Si el documento esta repetido en Cliente se toma un solo IdCliente: primero el activo (Estado = 1), luego el menor id.
    SELECT Doc, IdCliente
    INTO #Cli
    FROM (
        SELECT LTRIM(RTRIM(CONVERT(VARCHAR(30), NroDocumento))) AS Doc,
               IdCliente,
               ROW_NUMBER() OVER (
                   PARTITION BY LTRIM(RTRIM(CONVERT(VARCHAR(30), NroDocumento)))
                   ORDER BY CASE WHEN Estado = 1 THEN 0 ELSE 1 END, IdCliente) AS rn
        FROM dbo.Cliente
        WHERE NroDocumento IS NOT NULL
          AND LTRIM(RTRIM(CONVERT(VARCHAR(30), NroDocumento))) <> ''
    ) x
    WHERE rn = 1;

    -- Se reasigna todo el lote: un RUC que ya no coincide deja el IdCliente en NULL.
    UPDATE v SET IdCliente = c.IdCliente
    FROM dbo.VentasSunat v
    LEFT JOIN #Cli c ON c.Doc = LTRIM(RTRIM(v.NroDocIdentidad))
    WHERE v.Lote = @Lote;

    DECLARE @ClienteAsignado INT = (SELECT COUNT(*) FROM dbo.VentasSunat WHERE Lote = @Lote AND IdCliente IS NOT NULL);

    COMMIT;

    SELECT
        COUNT(*)                                             AS TotalFilas,
        @ClienteAsignado                                     AS ClienteAsignado,
        SUM(CASE WHEN IdCliente IS NULL THEN 1 ELSE 0 END)   AS SinCliente
    FROM dbo.VentasSunat WHERE Lote = @Lote;
END
GO

-- Informa si el periodo (AAAAMM) del RUC emisor ya esta cargado: cantidad de registros, lote mas reciente, fecha y usuario de la carga.
-- Cantidad = 0 cuando no existe. Se usa antes de grabar para preguntar si se reemplaza.
CREATE OR ALTER PROCEDURE dbo.sp_VentasSunat_ConsultarPeriodo
    @Periodo    CHAR(6),
    @RucEmisor  VARCHAR(11)
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        COUNT(*)           AS Cantidad,
        (SELECT TOP (1) Lote         FROM dbo.VentasSunat WHERE Periodo = @Periodo AND RucEmisor = @RucEmisor ORDER BY IdVentaSunat DESC) AS Lote,
        MAX(FechaCarga)    AS FechaCarga,
        (SELECT TOP (1) UsuarioCarga FROM dbo.VentasSunat WHERE Periodo = @Periodo AND RucEmisor = @RucEmisor ORDER BY IdVentaSunat DESC) AS UsuarioCarga
    FROM dbo.VentasSunat
    WHERE Periodo = @Periodo AND RucEmisor = @RucEmisor;
END
GO

-- Periodos cargados (uno por Periodo + RucEmisor): cantidad de registros, lote mas reciente, fecha y usuario de la carga.
-- Alimenta el Historial de la pantalla al abrirla, sin necesidad de cargar un Excel.
CREATE OR ALTER PROCEDURE dbo.sp_VentasSunat_ListarPeriodos
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        v.Periodo,
        v.RucEmisor,
        COUNT(*)           AS Cantidad,
        MAX(v.FechaCarga)  AS FechaCarga,
        (SELECT TOP (1) x.Lote         FROM dbo.VentasSunat x WHERE x.Periodo = v.Periodo AND x.RucEmisor = v.RucEmisor ORDER BY x.IdVentaSunat DESC) AS Lote,
        (SELECT TOP (1) x.UsuarioCarga FROM dbo.VentasSunat x WHERE x.Periodo = v.Periodo AND x.RucEmisor = v.RucEmisor ORDER BY x.IdVentaSunat DESC) AS UsuarioCarga
    FROM dbo.VentasSunat v
    GROUP BY v.Periodo, v.RucEmisor
    ORDER BY v.Periodo DESC, v.RucEmisor;
END
GO

-- Graba Empresa e IdEmpresa de cada RUC de cliente del lote. @Asignaciones: JSON [{ "ruc": "...", "empresa": "..." | null, "idEmpresa": 1 | null }].
-- La regla (RELACION_VTA -> EMPRESA_VTA de dbo.Constante) la resuelve el backend con sp_Constante_ListarPorCampo:
-- IdEmpresa = ValorFin de RELACION_VTA (ValorIni = RUC del cliente) y Empresa = ValorIni de la fila de EMPRESA_VTA con ese mismo ValorFin.
-- Un RUC sin empresa queda en NULL (revalidar refresca el valor).
CREATE OR ALTER PROCEDURE dbo.sp_VentasSunat_AsignarEmpresa
    @Lote          UNIQUEIDENTIFIER,
    @Asignaciones  NVARCHAR(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    SELECT ruc, empresa, idEmpresa
    INTO #Asig
    FROM OPENJSON(@Asignaciones) WITH
    (
        ruc       VARCHAR(20)  '$.ruc',
        empresa   VARCHAR(150) '$.empresa',
        idEmpresa INT          '$.idEmpresa'
    );

    UPDATE v SET Empresa = a.empresa, IdEmpresa = a.idEmpresa
    FROM dbo.VentasSunat v
    JOIN #Asig a ON a.ruc = LTRIM(RTRIM(v.NroDocIdentidad))
    WHERE v.Lote = @Lote;

    SELECT @@ROWCOUNT AS Actualizados;
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_VentasSunat_Listar
    @Lote UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;
    SELECT v.IdVentaSunat,
           RucEmisor AS rucEmisor, RazonSocialEmisor AS razonSocialEmisor, Periodo AS periodo, CarSunat AS carSunat,
           FechaEmision AS fechaEmision, FechaVcto AS fechaVcto, TipoCp AS tipoCp, Serie AS serie, NroCp AS nroCp,
           NroFinal AS nroFinal, TipoDocIdentidad AS tipoDocIdentidad, NroDocIdentidad AS nroDocIdentidad,
           RazonSocial AS razonSocial, ValorFacturadoExportacion AS valorFacturadoExportacion, BiGravada AS biGravada,
           DsctoBi AS dsctoBi, Igv AS igv, DsctoIgv AS dsctoIgv, MtoExonerado AS mtoExonerado, MtoInafecto AS mtoInafecto,
           Isc AS isc, BiGravIvap AS biGravIvap, Ivap AS ivap, Icbper AS icbper, OtrosTributos AS otrosTributos,
           TotalCp AS totalCp, Moneda AS moneda, TipoCambio AS tipoCambio, FecEmisionDocMod AS fecEmisionDocMod,
           TipoCpMod AS tipoCpMod, SerieCpMod AS serieCpMod, NroCpMod AS nroCpMod, IdProyectoOperadores AS idProyectoOperadores,
           TipoNota AS tipoNota, EstComp AS estComp, ValorFobEmbarcado AS valorFobEmbarcado, ValorOpGratuitas AS valorOpGratuitas,
           TipoOperacion AS tipoOperacion, DamCp AS damCp, Clu AS clu, IdEmpresa, v.IdCliente, v.Empresa, cli.NombreCliente
    FROM dbo.VentasSunat v
    OUTER APPLY (SELECT TOP (1) c.NombreCliente FROM dbo.Cliente c WHERE c.IdCliente = v.IdCliente) cli
    WHERE v.Lote = @Lote
    ORDER BY v.IdVentaSunat;
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
