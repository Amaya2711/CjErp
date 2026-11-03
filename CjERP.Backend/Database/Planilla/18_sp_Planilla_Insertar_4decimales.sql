/* ============================================================
   dbo.sp_Planilla_Insertar  -  montos a 4 decimales

   Cambio unico respecto al SP vigente en JC_Db (30/10/2026):
   @Total, @Subtotal y @Igv pasan de DECIMAL(18,2) a DECIMAL(18,4).
   Las columnas Planilla.Total/Subtotal/IGV/TotalPagar ya son
   numeric(18,4); con DECIMAL(18,2) el SP recortaba a 2 decimales
   (ej. pago nuevo de OC 197.9831 se guardaba como 197.98).
   El cuerpo del SP no cambia.
   PV: comparar con el SP vigente en BD (Script as ALTER) antes de ejecutar.
   ============================================================ */
USE [JC_Db]
GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE OR ALTER PROCEDURE [dbo].[sp_Planilla_Insertar]
(
    @IdProyecto        INT,
    @IdSite            VARCHAR(50),
    @CorreSite         INT,
    @IdTipoTrabajo     INT,
    @IdTarea           INT,

    @IdResponsable     INT,
    @IdCliente         INT,
    @IdBien            INT,
    @IdComprobante     INT,
    @RUC               VARCHAR(20),
    @Serie             VARCHAR(20),
    @IdTipoPago        INT,
    @TipoMoneda        INT,
    @Total             DECIMAL(18,4),
    @Subtotal          DECIMAL(18,4),
    @Igv               DECIMAL(18,4),

    @IdSolicitante     INT,
    @IdGestor          INT,
    @IdValidador       INT,

    @IdBancoCta        INT,
    @Cuenta            VARCHAR(100),
    @CuentaInter       VARCHAR(100),
    @NombreCta         VARCHAR(100),
    @TipoTrabajo       VARCHAR(100),
    @SiteNombre        VARCHAR(200),
    @Usuario           VARCHAR(50),

    @TipoCambio        DECIMAL(18,4),
    @FecEmision        DATE,

    -- OPCIONALES
    @Detalle           NVARCHAR(MAX) = NULL,
    @IdRendicion       INT = NULL,
    @Comentario        NVARCHAR(MAX) = NULL,
    @FechaPropuesta    DATE = NULL,
    @Ot                VARCHAR(50) = NULL,
    @RutaFactura       VARCHAR(2500) = NULL,
    @IdUsuarioFactura  INT = NULL,
    @FechaVencimiento  DATE = NULL,
    @IdProvisional     INT = NULL,
    @NroOperacion      NVARCHAR(50) = NULL,
    @FechaDeposito     NVARCHAR(15) = NULL
)
AS
BEGIN

    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY

        /*
            YA NO SE VALIDA IdProvisional COMO OBLIGATORIO.
            PUEDE VENIR NULL O 0 SEGÚN EL FRONTEND.
        */

        /*
            NORMALIZACIÓN DE PARÁMETROS OPCIONALES
        */
        SET @NroOperacion = NULLIF(LTRIM(RTRIM(@NroOperacion)), '');

        SET @FechaDeposito = NULLIF(LTRIM(RTRIM(@FechaDeposito)), '');

        /*
            OPCIONAL:
            SI EL FRONTEND ENVÍA 0 EN IdProvisional,
            SE CONVIERTE A NULL.
        */
        SET @IdProvisional = NULLIF(@IdProvisional, 0);


        BEGIN TRANSACTION;


        DECLARE @Correlativo INT;


        /*
            CONTROL DE CONCURRENCIA
        */
        SELECT
            @Correlativo = ISNULL(MAX(Correlativo), 0) + 1
        FROM dbo.Planilla WITH (UPDLOCK, HOLDLOCK);


        /*
            FECHAS
        */
        DECLARE @FechaActual VARCHAR(10) =
            CONVERT(VARCHAR(10), GETDATE(), 101);


        DECLARE @FechaHoraActual VARCHAR(19) =
            CONVERT(VARCHAR(10), GETDATE(), 101)
            + ' ' +
            CONVERT(VARCHAR(8), GETDATE(), 108);


        DECLARE @FecEmisionTxt VARCHAR(10) =
        (
            CASE
                WHEN @FecEmision IS NULL
                    THEN NULL
                ELSE
                    CONVERT(VARCHAR(10), @FecEmision, 101)
            END
        );


        DECLARE @FechaPropuestaTxt VARCHAR(10) =
        (
            CASE
                WHEN @FechaPropuesta IS NULL
                    THEN NULL
                ELSE
                    CONVERT(VARCHAR(10), @FechaPropuesta, 101)
            END
        );


        DECLARE @FechaVencimientoTxt VARCHAR(10) =
        (
            CASE
                WHEN @FechaVencimiento IS NULL
                    THEN NULL
                ELSE
                    CONVERT(VARCHAR(10), @FechaVencimiento, 101)
            END
        );


        /*
            INSERT PLANILLA
        */
        INSERT INTO dbo.Planilla
        (
            IdProyecto,
            IdSite,
            CorreSite,
            IdTipoTrabajo,
            IdTarea,

            Correlativo,
            FecIngreso,
            Detalle,

            IdResponsable,
            IdCliente,
            IdBien,
            IdComprobante,

            RUC,
            Serie,

            IdTipoPago,
            TipoMoneda,

            Total,
            Subtotal,
            Igv,

            IdRendicion,
            Comentario,

            IdSolicitante,
            IdGestor,
            IdValidador,

            Estado,
            FechaPropuesta,

            IdBancoCta,
            Cuenta,
            CuentaInter,
            NombreCta,

            tipo_trabajo,
            Site,

            usuario,
            fechacreacion,
            horacreacion,

            ot,

            TipoCambio,
            fecemision,

            imgfactura,
            idusuariofactura,
            fecimafactura,

            totalpagar,

            fechapagoCre,

            IdUrgente,
            idWeb,

            IdProvisional,

            NroOperacion,
            FechaDeposito
        )
        VALUES
        (
            @IdProyecto,
            @IdSite,
            @CorreSite,
            @IdTipoTrabajo,
            @IdTarea,

            @Correlativo,
            @FechaActual,
            @Detalle,

            @IdResponsable,
            @IdCliente,
            @IdBien,
            @IdComprobante,

            @RUC,
            @Serie,

            @IdTipoPago,
            @TipoMoneda,

            @Total,
            @Subtotal,
            @Igv,

            @IdRendicion,
            @Comentario,

            @IdSolicitante,
            @IdGestor,
            @IdValidador,

            0,
            @FechaPropuestaTxt,

            @IdBancoCta,
            @Cuenta,
            @CuentaInter,
            @NombreCta,

            @TipoTrabajo,
            @SiteNombre,

            @Usuario,
            @FechaActual,
            @FechaHoraActual,

            @Ot,

            @TipoCambio,
            @FecEmisionTxt,

            @RutaFactura,
            @IdUsuarioFactura,
            @FechaActual,

            @Total,

            @FechaVencimientoTxt,

            0,
            1,

            @IdProvisional,

            @NroOperacion,
            @FechaDeposito
        );


        COMMIT TRANSACTION;


        /*
            OUTPUT
        */
        SELECT
            @Correlativo AS CorrelativoGenerado,
            @IdProvisional AS IdProvisional,
            @NroOperacion AS NroOperacion,
            @FechaDeposito AS FechaDeposito;


    END TRY

    BEGIN CATCH

        IF @@TRANCOUNT > 0
            ROLLBACK TRANSACTION;


        DECLARE @ErrorMessage NVARCHAR(4000) = ERROR_MESSAGE();

        DECLARE @ErrorSeverity INT = ERROR_SEVERITY();

        DECLARE @ErrorState INT = ERROR_STATE();


        RAISERROR
        (
            @ErrorMessage,
            @ErrorSeverity,
            @ErrorState
        );

    END CATCH

END;
GO
