/*
  Mantenimiento de empleados: dbo.sp_EmpleadoCj_Actualizar vigente (2026-11-24).
  Agrega @FecNacimiento y, para Rechazar, @UsuarioDel / @FechaEliminar / @InicialesEmpleado.
  Todos los parametros nuevos son opcionales: NULL = conserva el valor (COALESCE).
  El SP NO recibe IdActivo: el rechazo lo baja con un UPDATE aparte (ver MantenimientoEmpleadosController.Rechazar).
  Orden de despliegue: ejecutar este script ANTES de publicar el backend.
*/
USE [JC_Db]
GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

ALTER PROCEDURE [dbo].[sp_EmpleadoCj_Actualizar]
(
    @IdEmpleado              INT,
    @NombreEmpleado          VARCHAR(150) = NULL,
    @NroDocumento            VARCHAR(50) = NULL,

    @IdDocumento             INT = NULL,
    @IdSexo                  INT = NULL,

    @Telefono                VARCHAR(50) = NULL,
    @Correo                  VARCHAR(150) = NULL,

    @FecNacimiento           DATE = NULL,   -- FecNacimiento (nuevo)
    @FechaIngreso            DATE = NULL,
    @FechaIniLaboral         DATE = NULL,
    @FechaFinLaboral         DATE = NULL,

    @IdPuesto                INT = NULL,
    @Direccion               VARCHAR(250) = NULL,

    @IdEmpresaCj             INT = NULL,
    @IdClienteCj             INT = NULL,
    @IdAreaCj                INT = NULL,
    @IdUbicacionCj           INT = NULL,
    @IdResponsableCj         INT = NULL,
    @IdSegundoVacaciones     INT = NULL,
    @IdTerceroVacaciones     INT = NULL,

    @IdEstado                INT = NULL,
    @Usuario                 VARCHAR(100),

    @UsuarioDel              VARCHAR(100) = NULL,
    @FechaEliminar           DATETIME = NULL,
    @InicialesEmpleado       VARCHAR(50) = NULL
)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY

        BEGIN TRAN;

        DECLARE @NroDocumentoActual VARCHAR(50);

        /* VALIDAR QUE EL EMPLEADO EXISTA */
        SELECT
            @NroDocumentoActual = NroDocumento
        FROM dbo.EmpleadoCj
        WHERE IdEmpleado = @IdEmpleado;

        IF @NroDocumentoActual IS NULL
        BEGIN
            RAISERROR(
                'No existe el empleado.',
                16,
                1
            );
        END;

        /* VALIDAR DUPLICIDAD DE DOCUMENTO */
        IF NULLIF(LTRIM(RTRIM(@NroDocumento)), '') IS NOT NULL
           AND
           ISNULL(LTRIM(RTRIM(@NroDocumentoActual)), '')
               <>
           ISNULL(LTRIM(RTRIM(@NroDocumento)), '')
        BEGIN

            IF EXISTS
            (
                SELECT 1
                FROM dbo.EmpleadoCj
                WHERE
                    ISNULL(LTRIM(RTRIM(NroDocumento)), '') =
                    ISNULL(LTRIM(RTRIM(@NroDocumento)), '')

                    AND ISNULL(LTRIM(RTRIM(@NroDocumento)), '') <> ''

                    AND IdEmpleado <> @IdEmpleado
            )
            BEGIN
                RAISERROR(
                    'Ya existe otro empleado con el mismo NroDocumento.',
                    16,
                    1
                );
            END;

        END;

        /* ACTUALIZAR CABECERA DEL EMPLEADO */
        UPDATE dbo.EmpleadoCj
        SET
            NombreEmpleado =
                COALESCE(
                    NULLIF(LTRIM(RTRIM(@NombreEmpleado)), ''),
                    NombreEmpleado
                ),

            NroDocumento =
                COALESCE(
                    NULLIF(LTRIM(RTRIM(@NroDocumento)), ''),
                    NroDocumento
                ),

            IdDocumento =
                COALESCE(
                    @IdDocumento,
                    IdDocumento
                ),

            IdSexo =
                COALESCE(
                    @IdSexo,
                    IdSexo
                ),

            Telefono =
                COALESCE(
                    NULLIF(LTRIM(RTRIM(@Telefono)), ''),
                    Telefono
                ),

            Correo =
                COALESCE(
                    NULLIF(LTRIM(RTRIM(@Correo)), ''),
                    Correo
                ),

            -- FecNacimiento (nuevo)
            FecNacimiento =
                COALESCE(
                    @FecNacimiento,
                    FecNacimiento
                ),

            FechaIngreso =
                COALESCE(
                    @FechaIngreso,
                    FechaIngreso
                ),

            FechaIniLaboral =
                COALESCE(
                    @FechaIniLaboral,
                    FechaIniLaboral
                ),

            FechaFinLaboral =
                COALESCE(
                    @FechaFinLaboral,
                    FechaFinLaboral
                ),

            IdPuesto =
                COALESCE(
                    @IdPuesto,
                    IdPuesto
                ),

            Direccion =
                COALESCE(
                    NULLIF(LTRIM(RTRIM(@Direccion)), ''),
                    Direccion
                ),

            IdEstado =
                COALESCE(
                    @IdEstado,
                    IdEstado
                ),

            UsuarioDel =
                COALESCE(
                    NULLIF(LTRIM(RTRIM(@UsuarioDel)), ''),
                    UsuarioDel
                ),

            FechaEliminar =
                COALESCE(
                    @FechaEliminar,
                    FechaEliminar
                ),

            InicialesEmpleado =
                COALESCE(
                    NULLIF(LTRIM(RTRIM(@InicialesEmpleado)), ''),
                    InicialesEmpleado
                )

        WHERE IdEmpleado = @IdEmpleado;

        /* ACTUALIZAR DETALLE */
        IF EXISTS
        (
            SELECT 1
            FROM dbo.EmpleadoCjDetalle
            WHERE IdEmpleadoCj = @IdEmpleado
        )
        BEGIN

            UPDATE dbo.EmpleadoCjDetalle
            SET
                IdEmpresaCj =
                    COALESCE(
                        @IdEmpresaCj,
                        IdEmpresaCj
                    ),

                IdClienteCj =
                    COALESCE(
                        @IdClienteCj,
                        IdClienteCj
                    ),

                IdAreaCj =
                    COALESCE(
                        @IdAreaCj,
                        IdAreaCj
                    ),

                IdUbicacionCj =
                    COALESCE(
                        @IdUbicacionCj,
                        IdUbicacionCj
                    ),

                IdResponsableCj =
                    COALESCE(
                        @IdResponsableCj,
                        IdResponsableCj
                    ),

                IdSegundoVacaciones =
                    COALESCE(
                        @IdSegundoVacaciones,
                        IdSegundoVacaciones
                    ),

                IdTerceroVacaciones =
                    COALESCE(
                        @IdTerceroVacaciones,
                        IdTerceroVacaciones
                    )

            WHERE IdEmpleadoCj = @IdEmpleado;

        END
        ELSE
        BEGIN

            INSERT INTO dbo.EmpleadoCjDetalle
            (
                IdEmpleadoCj,
                IdEmpresaCj,
                IdClienteCj,
                IdAreaCj,
                IdUbicacionCj,
                IdResponsableCj,
                IdSegundoVacaciones,
                IdTerceroVacaciones
            )
            VALUES
            (
                @IdEmpleado,
                @IdEmpresaCj,
                @IdClienteCj,
                @IdAreaCj,
                @IdUbicacionCj,
                @IdResponsableCj,
                @IdSegundoVacaciones,
                @IdTerceroVacaciones
            );

        END;

        COMMIT TRAN;

        /* RESULTADO */
        SELECT
            CAST(1 AS BIT) AS Success,
            'Empleado actualizado correctamente.' AS Mensaje,
            @IdEmpleado AS IdEmpleado;

    END TRY

    BEGIN CATCH

        IF @@TRANCOUNT > 0
            ROLLBACK TRAN;

        THROW;

    END CATCH;

END;
GO
