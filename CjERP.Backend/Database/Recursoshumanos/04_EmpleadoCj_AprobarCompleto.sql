CREATE OR ALTER PROCEDURE dbo.sp_EmpleadoCj_AprobarCompleto
    @IdEmpleado INT,
    @UsuarioAccion NVARCHAR(50) = NULL,
    @IdAprobador INT = NULL,
    @IdUsuarioNuevo NVARCHAR(100) = NULL,
    @ClaveInicial NVARCHAR(100) = 'ADMIN',
    @IdCargoUsuario INT = 84,
    @GenerarAsistencia BIT = 1
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Usuario NVARCHAR(50) = ISNULL(NULLIF(LTRIM(RTRIM(@UsuarioAccion)), ''), 'sistema');
    DECLARE @FechaProceso DATE = CONVERT(DATE, SYSDATETIME());
    DECLARE @FechaInicioLaboral DATE;
    DECLARE @FechaBase DATE;
    DECLARE @PrimerDiaMes DATE;
    DECLARE @NombreEmpleado NVARCHAR(200);
    DECLARE @NroDocumento NVARCHAR(50);
    DECLARE @Telefono NVARCHAR(50);
    DECLARE @Correo NVARCHAR(150);
    DECLARE @Direccion NVARCHAR(200);
    DECLARE @IdUsuarioGenerado NVARCHAR(100);
    DECLARE @CantidadAsistenciaActiva INT = 0;
    DECLARE @CantidadAsistenciaInactiva INT = 0;
    DECLARE @Mensaje NVARCHAR(1000) = N'Empleado aprobado correctamente.';

    IF ISNULL(@IdEmpleado, 0) <= 0
    BEGIN
        RAISERROR('Debe indicar el empleado a aprobar.', 16, 1);
        RETURN;
    END;

    IF NOT EXISTS (SELECT 1 FROM dbo.EmpleadoCj WHERE IdEmpleado = @IdEmpleado)
    BEGIN
        RAISERROR('No existe el empleado indicado.', 16, 1);
        RETURN;
    END;

    SELECT
        @NombreEmpleado = NombreEmpleado,
        @NroDocumento = NroDocumento,
        @Telefono = Telefono,
        @Correo = Correo,
        @Direccion = Direccion,
        @FechaInicioLaboral = FechaIniLaboral
    FROM dbo.EmpleadoCj
    WHERE IdEmpleado = @IdEmpleado;

    SET @FechaBase = COALESCE(@FechaInicioLaboral, @FechaProceso);
    SET @PrimerDiaMes = DATEFROMPARTS(YEAR(@FechaBase), MONTH(@FechaBase), 1);

    BEGIN TRY
        BEGIN TRANSACTION;

        UPDATE dbo.EmpleadoCj
        SET IdEstado = 1,
            IdActivo = 1
        WHERE IdEmpleado = @IdEmpleado;

        IF OBJECT_ID('dbo.Usuario', 'U') IS NOT NULL
           AND COL_LENGTH('dbo.Usuario', 'IdUsuario') IS NOT NULL
           AND COL_LENGTH('dbo.Usuario', 'Clave') IS NOT NULL
           AND COL_LENGTH('dbo.Usuario', 'IdEstado') IS NOT NULL
           AND COL_LENGTH('dbo.Usuario', 'IdEmpleado') IS NOT NULL
           AND COL_LENGTH('dbo.Usuario', 'IdCargo') IS NOT NULL
        BEGIN
            SET @IdUsuarioGenerado = NULLIF(LTRIM(RTRIM(@IdUsuarioNuevo)), '');

            IF @IdUsuarioGenerado IS NULL
            BEGIN
                DECLARE @BaseUsuario NVARCHAR(100) = LOWER(REPLACE(REPLACE(REPLACE(LTRIM(RTRIM(ISNULL(@NombreEmpleado, ''))), ' ', ''), '.', ''), ',', ''));
                IF ISNULL(@BaseUsuario, '') = ''
                BEGIN
                    SET @BaseUsuario = CONCAT('emp', @IdEmpleado);
                END;

                SET @IdUsuarioGenerado = CONCAT(@BaseUsuario, RIGHT(CONCAT('00000', CAST(@IdEmpleado AS NVARCHAR(10))), 5));
            END

            IF NOT EXISTS (SELECT 1 FROM dbo.Usuario WHERE IdUsuario = @IdUsuarioGenerado)
            BEGIN
                IF COL_LENGTH('dbo.Usuario', 'Id') IS NOT NULL
                BEGIN
                    DECLARE @NuevoIdUsuario INT;

                    SELECT @NuevoIdUsuario = ISNULL(MAX(Id), 0) + 1
                    FROM dbo.Usuario WITH (UPDLOCK, HOLDLOCK);

                    INSERT INTO dbo.Usuario
                    (
                        Id,
                        IdUsuario,
                        Clave,
                        IdEstado,
                        IdEmpleado,
                        IdCargo
                    )
                    VALUES
                    (
                        @NuevoIdUsuario,
                        @IdUsuarioGenerado,
                        @ClaveInicial,
                        1,
                        @IdEmpleado,
                        @IdCargoUsuario
                    );
                END
                ELSE
                BEGIN
                    INSERT INTO dbo.Usuario
                    (
                        IdUsuario,
                        Clave,
                        IdEstado,
                        IdEmpleado,
                        IdCargo
                    )
                    VALUES
                    (
                        @IdUsuarioGenerado,
                        @ClaveInicial,
                        1,
                        @IdEmpleado,
                        @IdCargoUsuario
                    );
                END
            END
            ELSE
            BEGIN
                UPDATE dbo.Usuario
                SET Clave = COALESCE(NULLIF(@ClaveInicial, ''), Clave),
                    IdEstado = COALESCE(IdEstado, 1),
                    IdEmpleado = COALESCE(IdEmpleado, @IdEmpleado),
                    IdCargo = COALESCE(IdCargo, @IdCargoUsuario)
                WHERE IdUsuario = @IdUsuarioGenerado;
            END
        END
        ELSE
        BEGIN
            SET @Mensaje = CONCAT(@Mensaje, ' No se encontro estructura compatible para dbo.Usuario.');
        END

        IF @GenerarAsistencia = 1
           AND OBJECT_ID('dbo.Asistencia', 'U') IS NOT NULL
           AND COL_LENGTH('dbo.Asistencia', 'IdEmpleado') IS NOT NULL
           AND COL_LENGTH('dbo.Asistencia', 'FechaAsistencia') IS NOT NULL
           AND COL_LENGTH('dbo.Asistencia', 'IdEstado') IS NOT NULL
        BEGIN
            IF @FechaBase <= @FechaProceso
            BEGIN
                ;WITH FechasActivas AS
                (
                    SELECT @FechaBase AS Fecha
                    UNION ALL
                    SELECT DATEADD(DAY, 1, Fecha)
                    FROM FechasActivas
                    WHERE Fecha < @FechaProceso
                )
                INSERT INTO dbo.Asistencia
                (
                    IdEmpleado,
                    FechaAsistencia,
                    IdEstado,
                    Comentario,
                    UsuarioCre,
                    FechaCreacion,
                    IdAprobador
                )
                SELECT
                    @IdEmpleado,
                    Fecha,
                    0,
                    '',
                    COALESCE(@IdAprobador, @IdEmpleado),
                    SYSDATETIME(),
                    COALESCE(@IdAprobador, @IdEmpleado)
                FROM FechasActivas fa
                WHERE NOT EXISTS
                (
                    SELECT 1
                    FROM dbo.Asistencia a
                    WHERE a.IdEmpleado = @IdEmpleado
                      AND CONVERT(DATE, a.FechaAsistencia) = fa.Fecha
                )
                OPTION (MAXRECURSION 0);

                SET @CantidadAsistenciaActiva = @@ROWCOUNT;
            END

            IF @PrimerDiaMes < @FechaBase
            BEGIN
                ;WITH FechasInactivas AS
                (
                    SELECT @PrimerDiaMes AS Fecha
                    UNION ALL
                    SELECT DATEADD(DAY, 1, Fecha)
                    FROM FechasInactivas
                    WHERE Fecha < DATEADD(DAY, -1, @FechaBase)
                )
                INSERT INTO dbo.Asistencia
                (
                    IdEmpleado,
                    FechaAsistencia,
                    IdEstado,
                    Comentario,
                    UsuarioCre,
                    FechaCreacion,
                    IdAprobador
                )
                SELECT
                    @IdEmpleado,
                    Fecha,
                    16,
                    '',
                    COALESCE(@IdAprobador, @IdEmpleado),
                    SYSDATETIME(),
                    COALESCE(@IdAprobador, @IdEmpleado)
                FROM FechasInactivas fi
                WHERE NOT EXISTS
                (
                    SELECT 1
                    FROM dbo.Asistencia a
                    WHERE a.IdEmpleado = @IdEmpleado
                      AND CONVERT(DATE, a.FechaAsistencia) = fi.Fecha
                )
                OPTION (MAXRECURSION 0);

                SET @CantidadAsistenciaInactiva = @@ROWCOUNT;
            END
        END
        ELSE
        BEGIN
            SET @Mensaje = CONCAT(@Mensaje, ' No se encontro estructura compatible para dbo.Asistencia.');
        END

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        DECLARE @ErrorMessage NVARCHAR(4000) = ERROR_MESSAGE();
        DECLARE @ErrorSeverity INT = ERROR_SEVERITY();
        DECLARE @ErrorState INT = ERROR_STATE();

        IF @@TRANCOUNT > 0
        BEGIN
            ROLLBACK TRANSACTION;
        END

        RAISERROR(@ErrorMessage, @ErrorSeverity, @ErrorState);
        RETURN;
    END CATCH;

    SELECT
        Ok = 1,
        Exito = 1,
        Resultado = 1,
        Accion = 'APROBAR_EMPLEADO',
        Mensaje = @Mensaje,
        IdEmpleado = @IdEmpleado,
        IdUsuarioGenerado = @IdUsuarioGenerado,
        AsistenciaActiva = @CantidadAsistenciaActiva,
        AsistenciaInactiva = @CantidadAsistenciaInactiva;
END;
GO
