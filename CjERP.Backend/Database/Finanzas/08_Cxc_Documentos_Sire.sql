/*
  08_Cxc_Documentos_Sire.sql
  Portal CxC - pestana INGRESO > Carga de datos.
  Crea dbo.CxcDocumentos: comprobantes de venta cargados desde el txt SIRE/SUNAT (RVIE).
  - No toca MovimientosConciliacion ni VentasSunat.
  - CarSunat es la clave unica: impide duplicar al volver a cargar un txt.
  - Montos en la moneda real del comprobante (Moneda); no se convierte a soles. TipoCambio solo informativo.
  NO ejecutado automaticamente: revisar y ejecutar manualmente.
*/
IF OBJECT_ID(N'dbo.CxcDocumentos', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.CxcDocumentos
    (
        IdDocumento                  INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_CxcDocumentos PRIMARY KEY,
        CarSunat                     VARCHAR(40)   NOT NULL,
        RucEmisor                    VARCHAR(15)   NULL,
        RazonSocialEmisor            NVARCHAR(200) NULL,
        Periodo                      CHAR(6)       NULL,
        FechaEmision                 DATE          NULL,
        FechaVencimiento             DATE          NULL,
        TipoCp                       VARCHAR(5)    NULL,
        SerieCp                      VARCHAR(10)   NULL,
        NroCp                        VARCHAR(20)   NULL,
        NroFinalRango                VARCHAR(20)   NULL,
        TipoDocIdentidad             VARCHAR(5)    NULL,
        NroDocIdentidad              VARCHAR(20)   NULL,
        RazonSocialCliente           NVARCHAR(250) NULL,
        ValorFacturadoExportacion    DECIMAL(18,2) NOT NULL CONSTRAINT DF_CxcDoc_VFE DEFAULT 0,
        BiGravada                    DECIMAL(18,2) NOT NULL CONSTRAINT DF_CxcDoc_BI  DEFAULT 0,
        DsctoBi                      DECIMAL(18,2) NOT NULL CONSTRAINT DF_CxcDoc_DBI DEFAULT 0,
        Igv                          DECIMAL(18,2) NOT NULL CONSTRAINT DF_CxcDoc_IGV DEFAULT 0,
        DsctoIgv                     DECIMAL(18,2) NOT NULL CONSTRAINT DF_CxcDoc_DIG DEFAULT 0,
        MtoExonerado                 DECIMAL(18,2) NOT NULL CONSTRAINT DF_CxcDoc_EXO DEFAULT 0,
        MtoInafecto                  DECIMAL(18,2) NOT NULL CONSTRAINT DF_CxcDoc_INA DEFAULT 0,
        Isc                          DECIMAL(18,2) NOT NULL CONSTRAINT DF_CxcDoc_ISC DEFAULT 0,
        BiGravIvap                   DECIMAL(18,2) NOT NULL CONSTRAINT DF_CxcDoc_BIV DEFAULT 0,
        Ivap                         DECIMAL(18,2) NOT NULL CONSTRAINT DF_CxcDoc_IVP DEFAULT 0,
        Icbper                       DECIMAL(18,2) NOT NULL CONSTRAINT DF_CxcDoc_ICB DEFAULT 0,
        OtrosTributos                DECIMAL(18,2) NOT NULL CONSTRAINT DF_CxcDoc_OTR DEFAULT 0,
        TotalCp                      DECIMAL(18,2) NOT NULL,
        Moneda                       VARCHAR(5)    NULL,
        TipoCambio                   DECIMAL(10,3) NULL,
        FechaEmisionDocModificado    DATE          NULL,
        TipoCpModificado             VARCHAR(5)    NULL,
        SerieCpModificado            VARCHAR(10)   NULL,
        NroCpModificado              VARCHAR(20)   NULL,
        IdProyectoOperadores         VARCHAR(50)   NULL,
        TipoNota                     VARCHAR(5)    NULL,
        EstadoComprobante            VARCHAR(5)    NULL,
        ValorFobEmbarcado            DECIMAL(18,2) NULL,
        ValorOpGratuitas             DECIMAL(18,2) NULL,
        TipoOperacion                VARCHAR(10)   NULL,
        DamCp                        VARCHAR(30)   NULL,
        Clu                          VARCHAR(30)   NULL,
        ArchivoOrigen                NVARCHAR(260) NULL,
        FechaCarga                   DATETIME2(0)  NOT NULL CONSTRAINT DF_CxcDoc_FC DEFAULT SYSDATETIME(),
        UsuarioCarga                 VARCHAR(100)  NULL,
        IdActivo                     BIT           NOT NULL CONSTRAINT DF_CxcDoc_Act DEFAULT 1
    );

    CREATE UNIQUE INDEX UX_CxcDocumentos_CarSunat ON dbo.CxcDocumentos (CarSunat);
    CREATE INDEX IX_CxcDocumentos_Cliente ON dbo.CxcDocumentos (NroDocIdentidad, FechaEmision);
    CREATE INDEX IX_CxcDocumentos_Periodo ON dbo.CxcDocumentos (Periodo);
END
GO
