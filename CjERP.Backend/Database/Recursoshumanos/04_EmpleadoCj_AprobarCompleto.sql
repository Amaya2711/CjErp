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
    DECLARE @IdEmpRel INT;
    DECLARE @IdEmpleadoLegacy INT;
    DECLARE @IdUsuarioGenerado NVARCHAR(100);
    DECLARE @SqlInsertEmpleado NVARCHAR(MAX);
    DECLARE @ColumnasEmpleado NVARCHAR(MAX);
    DECLARE @ValoresEmpleado NVARCHAR(MAX);
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
        @FechaInicioLaboral = FechaIniLaboral,
        @IdEmpRel = IdEmpRel
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

        IF OBJECT_ID('dbo.Empleado', 'U') IS NOT NULL
           AND COL_LENGTH('dbo.Empleado', 'IdEmpleado') IS NOT NULL
        BEGIN
            SELECT TOP (1) @IdEmpleadoLegacy = IdEmpleado
            FROM dbo.Empleado
            WHERE
            (
                (@IdEmpRel IS NOT NULL AND IdEmpleado = @IdEmpRel)
                OR (COL_LENGTH('dbo.Empleado', 'IdEmpleadoCj') IS NOT NULL AND IdEmpleadoCj = @IdEmpleado)
                OR (
                    NULLIF(LTRIM(RTRIM(@NroDocumento)), '') IS NOT NULL
                    AND COL_LENGTH('dbo.Empleado', 'NroDocumento') IS NOT NULL
                    AND LTRIM(RTRIM(ISNULL(NroDocumento, ''))) = LTRIM(RTRIM(@NroDocumento))
                )
                OR (
                    NULLIF(LTRIM(RTRIM(@NombreEmpleado)), '') IS NOT NULL
                    AND COL_LENGTH('dbo.Empleado', 'NombreEmpleado') IS NOT NULL
                    AND UPPER(LTRIM(RTRIM(ISNULL(NombreEmpleado, '')))) = UPPER(LTRIM(RTRIM(@NombreEmpleado)))
                )
            )
            AND (COL_LENGTH('dbo.Empleado', 'IdEstado') IS NULL OR ISNULL(IdEstado, 0) = 1)
            ORDER BY IdEmpleado;

            IF ISNULL(@IdEmpleadoLegacy, 0) <= 0
            BEGIN
                SELECT @IdEmpleadoLegacy = ISNULL(MAX(IdEmpleado), 0) + 1
                FROM dbo.Empleado WITH (UPDLOCK, HOLDLOCK);

                SET @ColumnasEmpleado = N'IdEmpleado';
                SET @ValoresEmpleado = N'@IdEmpleadoLegacy';

                IF COL_LENGTH('dbo.Empleado', 'NombreEmpleado') IS NOT NULL
                BEGIN
                    SET @ColumnasEmpleado += N', NombreEmpleado';
                    SET @ValoresEmpleado += N', ISNULL(@NombreEmpleado, '''')';
                END;

                IF COL_LENGTH('dbo.Empleado', 'InicialesEmpleado') IS NOT NULL
                BEGIN
                    SET @ColumnasEmpleado += N', InicialesEmpleado';
                    SET @ValoresEmpleado += N', ''''';
                END;

                IF COL_LENGTH('dbo.Empleado', 'IdCargo') IS NOT NULL
                BEGIN
                    SET @ColumnasEmpleado += N', IdCargo';
                    SET @ValoresEmpleado += N', 10';
                END;

                IF COL_LENGTH('dbo.Empleado', 'IdDocumento') IS NOT NULL
                BEGIN
                    SET @ColumnasEmpleado += N', IdDocumento';
                    SET @ValoresEmpleado += N', 6';
                END;

                IF COL_LENGTH('dbo.Empleado', 'NroDocumento') IS NOT NULL
                BEGIN
                    SET @ColumnasEmpleado += N', NroDocumento';
                    SET @ValoresEmpleado += N', ISNULL(@NroDocumento, '''')';
                END;

                IF COL_LENGTH('dbo.Empleado', 'Telefono') IS NOT NULL
                BEGIN
                    SET @ColumnasEmpleado += N', Telefono';
                    SET @ValoresEmpleado += N', ISNULL(@Telefono, '''')';
                END;

                IF COL_LENGTH('dbo.Empleado', 'Correo') IS NOT NULL
                BEGIN
                    SET @ColumnasEmpleado += N', Correo';
                    SET @ValoresEmpleado += N', ISNULL(@Correo, '''')';
                END;

                IF COL_LENGTH('dbo.Empleado', 'IdEstado') IS NOT NULL
                BEGIN
                    SET @ColumnasEmpleado += N', IdEstado';
                    SET @ValoresEmpleado += N', 1';
                END;

                IF COL_LENGTH('dbo.Empleado', 'IdCheque') IS NOT NULL
                BEGIN
                    SET @ColumnasEmpleado += N', IdCheque';
                    SET @ValoresEmpleado += N', NULL';
                END;

                IF COL_LENGTH('dbo.Empleado', 'IdEmpleadoCj') IS NOT NULL
                BEGIN
                    SET @ColumnasEmpleado += N', IdEmpleadoCj';
                    SET @ValoresEmpleado += N', @IdEmpleado';
                END;

                IF COL_LENGTH('dbo.Empleado', 'NombreEmpleadoCJ') IS NOT NULL
                BEGIN
                    SET @ColumnasEmpleado += N', NombreEmpleadoCJ';
                    SET @ValoresEmpleado += N', ISNULL(@NombreEmpleado, '''')';
                END;

                SET @SqlInsertEmpleado = N'
                    INSERT INTO dbo.Empleado (' + @ColumnasEmpleado + N')
                    VALUES (' + @ValoresEmpleado + N');';

                EXEC sp_executesql
                    @SqlInsertEmpleado,
                    N'@IdEmpleadoLegacy INT, @IdEmpleado INT, @NombreEmpleado NVARCHAR(200), @NroDocumento NVARCHAR(50), @Telefono NVARCHAR(50), @Correo NVARCHAR(150)',
                    @IdEmpleadoLegacy = @IdEmpleadoLegacy,
                    @IdEmpleado = @IdEmpleado,
                    @NombreEmpleado = @NombreEmpleado,
                    @NroDocumento = @NroDocumento,
                    @Telefono = @Telefono,
                    @Correo = @Correo;
            END;

            IF COL_LENGTH('dbo.EmpleadoCj', 'IdEmpRel') IS NOT NULL
            BEGIN
                UPDATE dbo.EmpleadoCj
                SET IdEmpRel = @IdEmpleadoLegacy
                WHERE IdEmpleado = @IdEmpleado
                  AND ISNULL(IdEmpRel, 0) <> @IdEmpleadoLegacy;
            END;
        END;

        IF ISNULL(@IdEmpleadoLegacy, 0) <= 0
        BEGIN
            SET @IdEmpleadoLegacy = @IdEmpleado;
        END;

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
                IF OBJECT_ID('dbo.SP_GenerarUsuario', 'P') IS NOT NULL
                   OR OBJECT_ID('dbo.sp_GenerarUsuario', 'P') IS NOT NULL
                BEGIN
                    EXEC dbo.SP_GenerarUsuario
                        @NombreCompleto = @NombreEmpleado,
                        @UsuarioGenerado = @IdUsuarioGenerado OUTPUT;
                END;

                IF NULLIF(LTRIM(RTRIM(@IdUsuarioGenerado)), '') IS NULL
                BEGIN
                    DECLARE @NombreNormalizado NVARCHAR(200) = UPPER(LTRIM(RTRIM(ISNULL(@NombreEmpleado, ''))));
                    DECLARE @PosPrimerEspacio INT = CHARINDEX(' ', @NombreNormalizado);
                    DECLARE @ApellidoBase NVARCHAR(100);
                    DECLARE @InicialNombre NVARCHAR(1);
                    DECLARE @BaseUsuario NVARCHAR(100);
                    DECLARE @SecuenciaUsuario INT = 1;

                    IF @PosPrimerEspacio > 0
                    BEGIN
                        SET @ApellidoBase = LEFT(@NombreNormalizado, @PosPrimerEspacio - 1);
                        SET @InicialNombre = SUBSTRING(LTRIM(SUBSTRING(@NombreNormalizado, @PosPrimerEspacio + 1, LEN(@NombreNormalizado))), 1, 1);
                    END
                    ELSE
                    BEGIN
                        SET @ApellidoBase = @NombreNormalizado;
                        SET @InicialNombre = '';
                    END;

                    SET @BaseUsuario = LOWER(REPLACE(REPLACE(REPLACE(CONCAT(ISNULL(@InicialNombre, ''), ISNULL(@ApellidoBase, '')), ' ', ''), '.', ''), ',', ''));

                    IF ISNULL(@BaseUsuario, '') = ''
                    BEGIN
                        SET @BaseUsuario = CONCAT('emp', @IdEmpleado);
                    END;

                    SET @IdUsuarioGenerado = @BaseUsuario;

                    WHILE EXISTS
                    (
                        SELECT 1
                        FROM dbo.Usuario
                        WHERE LTRIM(RTRIM(IdUsuario)) = @IdUsuarioGenerado
                          AND ISNULL(IdEmpleado, 0) <> @IdEmpleadoLegacy
                    )
                    BEGIN
                        SET @SecuenciaUsuario += 1;
                        SET @IdUsuarioGenerado = CONCAT(@BaseUsuario, @SecuenciaUsuario);
                    END;
                END;
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
                        @IdEmpleadoLegacy,
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
                        @IdEmpleadoLegacy,
                        @IdCargoUsuario
                    );
                END
            END
            ELSE
            BEGIN
                UPDATE dbo.Usuario
                SET Clave = COALESCE(NULLIF(@ClaveInicial, ''), Clave),
                    IdEstado = COALESCE(IdEstado, 1),
                    IdEmpleado = @IdEmpleadoLegacy,
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
        IdEmpleadoLegacy = @IdEmpleadoLegacy,
        IdUsuarioGenerado = @IdUsuarioGenerado,
        AsistenciaActiva = @CantidadAsistenciaActiva,
        AsistenciaInactiva = @CantidadAsistenciaInactiva;
END;
GO
