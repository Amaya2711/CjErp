/*
  10_Cxc_Detracciones.sql
  Portal Cuentas por Cobrar - detracciones RECIBIDAS (el cliente deposita la detraccion de una factura de CJ TELECOM).
  - Clave: NumeroConstancia (unica). Volver a cargar el mismo archivo no duplica.
  - Solo se guardan detracciones donde el proveedor es CJ TELECOM (RUC 20505958111). Las EMITIDAS (compras) no se cargan.
  - Un mismo comprobante puede tener 2 depositos (esporadico): se guardan ambos y se marca Observacion
    "por confirmar por el area".
  - IdDocumento enlaza con dbo.CxcDocumentos (SIRE) por RUC cliente + tipo + serie + numero (sin ceros a la izquierda).
  - Montos en soles tal como los informa SUNAT (sin conversion).
  NO ejecutado automaticamente: ejecutar manualmente.
*/

IF OBJECT_ID('dbo.CxcDetracciones', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.CxcDetracciones
    (
        IdDetraccion            INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_CxcDetracciones PRIMARY KEY,
        NumeroConstancia        VARCHAR(30)   NOT NULL,
        Sentido                 VARCHAR(10)   NOT NULL CONSTRAINT DF_CxcDetracciones_Sentido DEFAULT ('RECIBIDA'),

        TipoCuenta              VARCHAR(80)   NULL,
        NumeroCuenta            VARCHAR(30)   NULL,
        FechaPago               DATE          NULL,
        MontoDeposito           DECIMAL(18,2) NOT NULL,
        NumeroPagoDetracciones  VARCHAR(30)   NULL,

        RucProveedor            VARCHAR(15)   NULL,
        NombreProveedor         NVARCHAR(200) NULL,
        TipoDocAdquiriente      VARCHAR(5)    NULL,
        NroDocAdquiriente       VARCHAR(15)   NULL,
        NombreAdquiriente       NVARCHAR(200) NULL,

        PeriodoTributario       CHAR(6)       NULL,
        TipoComprobante         VARCHAR(5)    NULL,
        SerieComprobante        VARCHAR(10)   NULL,
        NumeroComprobante       VARCHAR(20)   NULL,
        TipoBien                VARCHAR(5)    NULL,
        TipoOperacion           VARCHAR(5)    NULL,

        IdDocumento             INT           NULL,  -- comprobante del SIRE (dbo.CxcDocumentos) cuando se encuentra
        Observacion             NVARCHAR(300) NULL,  -- p.ej. posible deposito duplicado, por confirmar por el area

        ArchivoOrigen           NVARCHAR(260) NULL,
        FechaCarga              DATETIME2(0)  NOT NULL CONSTRAINT DF_CxcDetracciones_FechaCarga DEFAULT (SYSDATETIME()),
        UsuarioCarga            VARCHAR(100)  NULL,
        IdActivo                BIT           NOT NULL CONSTRAINT DF_CxcDetracciones_IdActivo DEFAULT (1)
    );

    CREATE UNIQUE INDEX UX_CxcDetracciones_Constancia ON dbo.CxcDetracciones (NumeroConstancia);
    CREATE INDEX IX_CxcDetracciones_Comprobante ON dbo.CxcDetracciones (NroDocAdquiriente, TipoComprobante, SerieComprobante);
    CREATE INDEX IX_CxcDetracciones_IdDocumento ON dbo.CxcDetracciones (IdDocumento);
END
GO

SELECT 'dbo.CxcDetracciones lista' AS Resultado, COUNT(*) AS Filas FROM dbo.CxcDetracciones;
