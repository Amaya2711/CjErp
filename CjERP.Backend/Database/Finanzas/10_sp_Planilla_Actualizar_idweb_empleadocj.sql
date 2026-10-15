/* ================================================================
   sp_Planilla_Actualizar: toda modificacion hecha desde la web deja
   Planilla.IdWeb = 1, y por eso IdSolicitante / IdGestor / IdValidador
   deben ser codigos de EmpleadoCj (los que cargan los combos del modulo
   de gastos: EmpleadoCjPerfil perfil 11 / 12 / 13).
   Cambios respecto al SP vigente en JC_Db (14/10/2026):
     1) Si la fila NO es IdWeb = 1, los tres codigos son obligatorios
        (aunque la persona sea la misma): se vuelven a elegir de EmpleadoCj.
     2) Todo codigo enviado debe existir en EmpleadoCjPerfil con el perfil
        correspondiente (11 solicitante, 12 gestor, 13 validador).
     3) El UPDATE fija IdWeb = 1.
   El resto del SP no cambia. Idempotente. Ejecutar en JC_Db.
   ================================================================ */
USE JC_Db;
GO
CREATE OR ALTER PROCEDURE [dbo].[sp_Planilla_Actualizar]
(
    @Correlativo       INT,

    @IdProyecto        INT = NULL,
    @IdSite            VARCHAR(50) = NULL,
    @CorreSite         INT = NULL,
    @IdTipoTrabajo     INT = NULL,
    @IdTarea           INT = NULL,

    @IdResponsable     INT = NULL,
    @IdCliente         INT = NULL,
    @IdBien            INT = NULL,
    @IdComprobante     INT = NULL,
    @RUC               VARCHAR(20) = NULL,
    @Serie             VARCHAR(20) = NULL,
    @IdTipoPago        INT = NULL,
    @TipoMoneda        INT = NULL,
    @Total             DECIMAL(18,2) = NULL,
    @Subtotal          DECIMAL(18,2) = NULL,
    @Igv               DECIMAL(18,2) = NULL,

    @IdSolicitante     INT = NULL,
    @IdGestor          INT = NULL,
    @IdValidador       INT = NULL,

    @IdBancoCta        INT = NULL,
    @Cuenta            VARCHAR(100) = NULL,
    @CuentaInter       VARCHAR(100) = NULL,
    @NroOperacion      VARCHAR(100) = NULL,
    @NombreCta         VARCHAR(100) = NULL,
    @TipoTrabajo       VARCHAR(100) = NULL,
    @SiteNombre        VARCHAR(200) = NULL,
    @Usuario           VARCHAR(50) = NULL,

    @TipoCambio        DECIMAL(18,4) = NULL,
    @FecEmision        DATE = NULL,

    @Detalle           NVARCHAR(MAX) = NULL,
    @IdRendicion       INT = NULL,
    @Comentario        NVARCHAR(MAX) = NULL,
    @FechaPropuesta    DATE = NULL,
    @Ot                VARCHAR(50) = NULL,
    @RutaFactura       VARCHAR(2500) = NULL,
    @IdUsuarioFactura  INT = NULL,
    @FechaVencimiento  DATE = NULL,
    @IdProvisional     INT = NULL
)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @StartedTran BIT = 0;

    BEGIN TRY

        /* =========================================================
           Validar existencia del registro
           ========================================================= */
        IF NOT EXISTS
        (
            SELECT 1
            FROM dbo.Planilla
            WHERE Correlativo = @Correlativo
        )
        BEGIN
            THROW 50000,
                  'No se encontró el documento de Planilla con el correlativo indicado.',
                  1;
        END;

        /* =========================================================
           Obtener los valores actuales y efectivos
           ========================================================= */
        DECLARE @IdTareaActual            INT;
        DECLARE @IdProvisionalActual      INT;
        DECLARE @IdTareaEfectiva          INT;
        DECLARE @IdProvisionalEfectivo    INT;
        DECLARE @IdWebActual              INT;

        SELECT
            @IdTareaActual = IdTarea,
            @IdProvisionalActual = IdProvisional,
            @IdWebActual = ISNULL(IdWeb, 0)
        FROM dbo.Planilla
        WHERE Correlativo = @Correlativo;

        SET @IdTareaEfectiva =
            COALESCE(@IdTarea, @IdTareaActual);

        SET @IdProvisionalEfectivo =
            COALESCE(@IdProvisional, @IdProvisionalActual);

        /* =========================================================
           Solicitante / Gestor / Validador = codigos de EmpleadoCj.
           Una fila que aun no es IdWeb = 1 trae codigos de Empleado:
           deben volver a enviarse (modificados o no) desde EmpleadoCj.
           ========================================================= */
        IF @IdWebActual <> 1
           AND (@IdSolicitante IS NULL OR @IdGestor IS NULL OR @IdValidador IS NULL)
        BEGIN
            THROW 50002,
                  'Este documento proviene del sistema anterior: debe seleccionar solicitante, gestor y validador para actualizarlo.',
                  1;
        END;

        IF @IdSolicitante IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM dbo.EmpleadoCjPerfil WHERE IdEmpleadoCj = @IdSolicitante AND IdPerfil = 11)
        BEGIN
            THROW 50003, 'El solicitante seleccionado no es un empleado CJ con perfil de solicitante.', 1;
        END;

        IF @IdGestor IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM dbo.EmpleadoCjPerfil WHERE IdEmpleadoCj = @IdGestor AND IdPerfil = 12)
        BEGIN
            THROW 50004, 'El gestor seleccionado no es un empleado CJ con perfil de gestor.', 1;
        END;

        IF @IdValidador IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM dbo.EmpleadoCjPerfil WHERE IdEmpleadoCj = @IdValidador AND IdPerfil = 13)
        BEGIN
            THROW 50005, 'El validador seleccionado no es un empleado CJ con perfil de validador.', 1;
        END;

        /* =========================================================
           Validación del suministro provisional
           Solo aplica si realmente se envió IdTarea o IdProvisional
           en la actualización.
           ========================================================= */
        IF (
            (@IdTarea IS NOT NULL OR @IdProvisional IS NOT NULL)
            AND EXISTS
            (
                SELECT 1
                FROM dbo.Constante
                WHERE Campo = 'ID_REEMBOLSO'
                  AND Correlativo = @IdTareaEfectiva
            )
            AND ISNULL(@IdProvisionalEfectivo, 0) <= 0
        )
        BEGIN
            THROW 50001,
                  'No se puede actualizar. Debe seleccionar un suministro provisional.',
                  1;
        END;

        /* =========================================================
           Transacción segura
           ========================================================= */
        IF @@TRANCOUNT = 0
        BEGIN
            BEGIN TRANSACTION;
            SET @StartedTran = 1;
        END;

        /* =========================================================
           Actualización del registro
           Cuando el parámetro llega NULL, se conserva el valor
           actual almacenado en la tabla.
           ========================================================= */
        UPDATE dbo.Planilla
        SET
            IdProyecto =
                COALESCE(@IdProyecto, IdProyecto),

            IdSite =
                COALESCE(
                    NULLIF(LTRIM(RTRIM(@IdSite)), ''),
                    IdSite
                ),

            CorreSite =
                COALESCE(@CorreSite, CorreSite),

            IdTipoTrabajo =
                COALESCE(@IdTipoTrabajo, IdTipoTrabajo),

            IdTarea =
                COALESCE(@IdTarea, IdTarea),

            Detalle =
                COALESCE(@Detalle, Detalle),

            IdResponsable =
                COALESCE(@IdResponsable, IdResponsable),

            IdCliente =
                COALESCE(@IdCliente, IdCliente),

            IdBien =
                COALESCE(@IdBien, IdBien),

            IdComprobante =
                COALESCE(@IdComprobante, IdComprobante),

            RUC =
                COALESCE(
                    NULLIF(LTRIM(RTRIM(@RUC)), ''),
                    RUC
                ),

            Serie =
                COALESCE(
                    NULLIF(LTRIM(RTRIM(@Serie)), ''),
                    Serie
                ),

            IdTipoPago =
                COALESCE(@IdTipoPago, IdTipoPago),

            TipoMoneda =
                COALESCE(@TipoMoneda, TipoMoneda),

            Total =
                COALESCE(@Total, Total),

            Subtotal =
                COALESCE(@Subtotal, Subtotal),

            Igv =
                COALESCE(@Igv, Igv),

            IdRendicion =
                COALESCE(@IdRendicion, IdRendicion),

            Comentario =
                COALESCE(@Comentario, Comentario),

            IdSolicitante =
                COALESCE(@IdSolicitante, IdSolicitante),

            IdGestor =
                COALESCE(@IdGestor, IdGestor),

            IdValidador =
                COALESCE(@IdValidador, IdValidador),

            IdWeb = 1,

            FechaPropuesta =
                CASE
                    WHEN @FechaPropuesta IS NULL
                        THEN FechaPropuesta
                    ELSE CONVERT(VARCHAR(10), @FechaPropuesta, 101)
                END,

            IdBancoCta =
                COALESCE(@IdBancoCta, IdBancoCta),

            Cuenta =
                COALESCE(
                    NULLIF(LTRIM(RTRIM(@Cuenta)), ''),
                    Cuenta
                ),

            CuentaInter =
                COALESCE(
                    NULLIF(LTRIM(RTRIM(@CuentaInter)), ''),
                    CuentaInter
                ),

            NroOperacion =
                COALESCE(
                    NULLIF(LTRIM(RTRIM(@NroOperacion)), ''),
                    NroOperacion
                ),

            NombreCta =
                COALESCE(
                    NULLIF(LTRIM(RTRIM(@NombreCta)), ''),
                    NombreCta
                ),

            Tipo_Trabajo =
                COALESCE(
                    NULLIF(LTRIM(RTRIM(@TipoTrabajo)), ''),
                    Tipo_Trabajo
                ),

            Site =
                COALESCE(
                    NULLIF(LTRIM(RTRIM(@SiteNombre)), ''),
                    Site
                ),

            Usuario =
                COALESCE(
                    NULLIF(LTRIM(RTRIM(@Usuario)), ''),
                    Usuario
                ),

            OT =
                COALESCE(
                    NULLIF(LTRIM(RTRIM(@Ot)), ''),
                    OT
                ),

            TipoCambio =
                COALESCE(@TipoCambio, TipoCambio),

            FecEmision =
                CASE
                    WHEN @FecEmision IS NULL
                        THEN FecEmision
                    ELSE CONVERT(VARCHAR(10), @FecEmision, 101)
                END,

            ImgFactura =
                COALESCE(
                    NULLIF(LTRIM(RTRIM(@RutaFactura)), ''),
                    ImgFactura
                ),

            IdUsuarioFactura =
                COALESCE(
                    @IdUsuarioFactura,
                    IdUsuarioFactura
                ),

            TotalPagar =
                COALESCE(@Total, TotalPagar),

            FechaPagoCre =
                CASE
                    WHEN @FechaVencimiento IS NULL
                        THEN FechaPagoCre
                    ELSE CONVERT(VARCHAR(10), @FechaVencimiento, 101)
                END,

            IdProvisional =
                COALESCE(
                    @IdProvisional,
                    IdProvisional
                )

        WHERE Correlativo = @Correlativo;

        DECLARE @FilasActualizadas INT = @@ROWCOUNT;

        IF @StartedTran = 1 AND XACT_STATE() = 1
            COMMIT TRANSACTION;

        SELECT
            1 AS Success,
            @Correlativo AS CorrelativoActualizado,
            @FilasActualizadas AS FilasActualizadas,
            'Documento actualizado correctamente.' AS Mensaje;

    END TRY
    BEGIN CATCH

        IF XACT_STATE() <> 0
            ROLLBACK TRANSACTION;

        THROW;

    END CATCH;
END;
GO
