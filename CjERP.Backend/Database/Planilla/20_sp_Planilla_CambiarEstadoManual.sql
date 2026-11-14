/* ================================================================
   sp_Planilla_CambiarEstadoManual
   Cambio MANUAL y directo de Planilla.Estado desde pagos_v2 (columna "Cambiar estado").

   - Fija el estado EXACTAMENTE al elegido: no aplica reglas de aprobacion (limites de
     monto 1 -> 6, 6 -> 1), no toca FechaAprobador / Revisor / Observacion de la planilla.
     (sp_Planilla_ActualizarEstado y sp_Planilla_ProcesarAprobacionMasiva transforman
     estados y por eso no sirven para un cambio manual arbitrario.)
   - Un registro PAGADO (estado 4) NO se puede modificar (THROW 50014); la web ademas
     deshabilita el selector en esas filas.
   - Deja constancia en dbo.MovEstadosPagos (Estado = nuevo estado, Observacion = motivo).
   - El permiso (Constante PERMISO_ESTADO, ValorIni = codigo de empleado) y que el estado
     exista en Constante 'estado' los valida el backend (PlanillaService.CambiarEstadoManualAsync).

   PV: columnas de MovEstadosPagos tomadas de sp_Planilla_ProcesarAprobacionMasiva
       (Correlativo, Estado, Observacion, Usuario, FechaCreacion, HoraCreacion).
   Idempotente. Ejecutar en JC_Db tras revisar.
   ================================================================ */
USE [JC_Db]
GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE OR ALTER PROCEDURE [dbo].[sp_Planilla_CambiarEstadoManual]
(
    @Correlativo  INT,
    @IdSite       VARCHAR(50),
    @NuevoEstado  INT,
    @Observacion  VARCHAR(1000),
    @Usuario      VARCHAR(100)
)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    SET @Observacion = NULLIF(LTRIM(RTRIM(@Observacion)), '');

    BEGIN TRY

        IF @Observacion IS NULL
        BEGIN
            THROW 50011, 'Debe ingresar el motivo del cambio de estado.', 1;
        END;

        BEGIN TRAN;

        DECLARE
            @EstadoAnterior INT,
            @Existe BIT = 0,
            @Ahora DATETIME2(0) = SYSDATETIME();

        SELECT
            @EstadoAnterior = TRY_CONVERT(INT, p.Estado),
            @Existe = 1
        FROM dbo.Planilla p WITH (UPDLOCK, HOLDLOCK)
        WHERE p.Correlativo = @Correlativo
          AND p.IdSite = @IdSite;

        IF @Existe = 0
        BEGIN
            THROW 50012, 'No se encontró el registro en Planilla.', 1;
        END;

        /* Regla: un recibo PAGADO (estado 4) no se puede modificar. */
        IF @EstadoAnterior = 4
        BEGIN
            THROW 50014, 'El registro está PAGADO (estado 4): no se puede modificar su estado.', 1;
        END;

        IF @EstadoAnterior = @NuevoEstado
        BEGIN
            THROW 50013, 'El registro ya se encuentra en ese estado.', 1;
        END;

        UPDATE dbo.Planilla
        SET Estado = @NuevoEstado
        WHERE Correlativo = @Correlativo
          AND IdSite = @IdSite;

        INSERT INTO dbo.MovEstadosPagos
        (
            Correlativo,
            Estado,
            Observacion,
            Usuario,
            FechaCreacion,
            HoraCreacion
        )
        VALUES
        (
            @Correlativo,
            @NuevoEstado,
            @Observacion,
            @Usuario,
            CAST(@Ahora AS DATE),
            @Ahora
        );

        COMMIT TRAN;

        SELECT
            @Correlativo AS Correlativo,
            @IdSite AS IdSite,
            @EstadoAnterior AS EstadoAnterior,
            @NuevoEstado AS EstadoNuevo;

    END TRY
    BEGIN CATCH

        IF @@TRANCOUNT > 0
        BEGIN
            ROLLBACK TRAN;
        END;

        THROW;

    END CATCH;
END
GO
