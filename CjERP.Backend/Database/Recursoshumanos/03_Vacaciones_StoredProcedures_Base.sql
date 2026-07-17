CREATE OR ALTER PROCEDURE dbo.sp_Vacacion_Politica_Guardar
    @IdPolitica INT = NULL,
    @Codigo NVARCHAR(50),
    @Nombre NVARCHAR(150),
    @Descripcion NVARCHAR(500) = NULL,
    @DiasBase DECIMAL(10,2),
    @DiasAdicionales DECIMAL(10,2) = 0,
    @DiasMaximoAcumulable DECIMAL(10,2) = 0,
    @MesesMinimosGoce INT = 12,
    @PermiteFraccionamiento BIT = 1,
    @MinDiasFraccion INT = 1,
    @MaxDiasPorSolicitud DECIMAL(10,2) = NULL,
    @Vigente BIT = 1,
    @UsuarioAccion NVARCHAR(50) = NULL,
    @Observacion NVARCHAR(500) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Usuario NVARCHAR(50) = ISNULL(NULLIF(LTRIM(RTRIM(@UsuarioAccion)), ''), 'sistema');

    IF ISNULL(LTRIM(RTRIM(@Codigo)), '') = ''
    BEGIN
        RAISERROR('Debe indicar el codigo de la politica.', 16, 1);
        RETURN;
    END;

    IF ISNULL(LTRIM(RTRIM(@Nombre)), '') = ''
    BEGIN
        RAISERROR('Debe indicar el nombre de la politica.', 16, 1);
        RETURN;
    END;

    IF ISNULL(@DiasBase, 0) <= 0
    BEGIN
        RAISERROR('Los dias base deben ser mayores a cero.', 16, 1);
        RETURN;
    END;

    BEGIN TRANSACTION;

    IF @IdPolitica IS NULL OR @IdPolitica = 0
    BEGIN
        INSERT INTO dbo.VacacionPolitica
        (
            Codigo,
            Nombre,
            Descripcion,
            DiasBase,
            DiasAdicionales,
            DiasMaximoAcumulable,
            MesesMinimosGoce,
            PermiteFraccionamiento,
            MinDiasFraccion,
            MaxDiasPorSolicitud,
            Vigente,
            Observacion,
            UsuarioCreacion,
            FechaCreacion
        )
        VALUES
        (
            LTRIM(RTRIM(@Codigo)),
            LTRIM(RTRIM(@Nombre)),
            @Descripcion,
            @DiasBase,
            ISNULL(@DiasAdicionales, 0),
            ISNULL(@DiasMaximoAcumulable, 0),
            ISNULL(@MesesMinimosGoce, 12),
            ISNULL(@PermiteFraccionamiento, 1),
            ISNULL(@MinDiasFraccion, 1),
            @MaxDiasPorSolicitud,
            ISNULL(@Vigente, 1),
            @Observacion,
            @Usuario,
            SYSDATETIME()
        );

        SET @IdPolitica = SCOPE_IDENTITY();
    END;
    ELSE
    BEGIN
        UPDATE dbo.VacacionPolitica
        SET Codigo = LTRIM(RTRIM(@Codigo)),
            Nombre = LTRIM(RTRIM(@Nombre)),
            Descripcion = @Descripcion,
            DiasBase = @DiasBase,
            DiasAdicionales = ISNULL(@DiasAdicionales, 0),
            DiasMaximoAcumulable = ISNULL(@DiasMaximoAcumulable, 0),
            MesesMinimosGoce = ISNULL(@MesesMinimosGoce, 12),
            PermiteFraccionamiento = ISNULL(@PermiteFraccionamiento, 1),
            MinDiasFraccion = ISNULL(@MinDiasFraccion, 1),
            MaxDiasPorSolicitud = @MaxDiasPorSolicitud,
            Vigente = ISNULL(@Vigente, 1),
            Observacion = @Observacion,
            UsuarioModificacion = @Usuario,
            FechaModificacion = SYSDATETIME()
        WHERE IdPolitica = @IdPolitica;

        IF @@ROWCOUNT = 0
        BEGIN
            ROLLBACK TRANSACTION;
            RAISERROR('No existe la politica indicada.', 16, 1);
            RETURN;
        END;
    END;

    COMMIT TRANSACTION;

    SELECT
        Ok = 1,
        Exito = 1,
        Resultado = 1,
        Accion = CASE WHEN @IdPolitica > 0 THEN 'GUARDAR_POLITICA' ELSE 'CREAR_POLITICA' END,
        Mensaje = 'Politica vacacional guardada correctamente.',
        IdPolitica = @IdPolitica;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_Vacacion_Periodo_Generar
    @IdEmpleado INT,
    @IdPolitica INT,
    @Anio INT,
    @UsuarioAccion NVARCHAR(50) = NULL,
    @Observacion NVARCHAR(500) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Usuario NVARCHAR(50) = ISNULL(NULLIF(LTRIM(RTRIM(@UsuarioAccion)), ''), 'sistema');
    DECLARE @IdPeriodo INT;
    DECLARE @DiasOtorgados DECIMAL(10,2);
    DECLARE @FechaInicioPeriodo DATE = DATEFROMPARTS(@Anio, 1, 1);
    DECLARE @FechaFinPeriodo DATE = DATEFROMPARTS(@Anio, 12, 31);

    IF ISNULL(@IdEmpleado, 0) <= 0
    BEGIN
        RAISERROR('Debe indicar el empleado.', 16, 1);
        RETURN;
    END;

    IF ISNULL(@IdPolitica, 0) <= 0
    BEGIN
        RAISERROR('Debe indicar la politica vacacional.', 16, 1);
        RETURN;
    END;

    IF ISNULL(@Anio, 0) < 2000
    BEGIN
        RAISERROR('Debe indicar un anio valido.', 16, 1);
        RETURN;
    END;

    IF NOT EXISTS (SELECT 1 FROM dbo.EmpleadoCj WHERE IdEmpleado = @IdEmpleado)
    BEGIN
        RAISERROR('No existe el empleado indicado.', 16, 1);
        RETURN;
    END;

    SELECT
        @DiasOtorgados = ISNULL(DiasBase, 0) + ISNULL(DiasAdicionales, 0)
    FROM dbo.VacacionPolitica
    WHERE IdPolitica = @IdPolitica;

    IF @DiasOtorgados IS NULL
    BEGIN
        RAISERROR('No existe la politica indicada.', 16, 1);
        RETURN;
    END;

    BEGIN TRANSACTION;

    SELECT @IdPeriodo = IdPeriodo
    FROM dbo.VacacionPeriodo
    WHERE IdEmpleado = @IdEmpleado
      AND IdPolitica = @IdPolitica
      AND Anio = @Anio;

    IF @IdPeriodo IS NULL
    BEGIN
        INSERT INTO dbo.VacacionPeriodo
        (
            IdEmpleado,
            IdPolitica,
            Anio,
            FechaInicioPeriodo,
            FechaFinPeriodo,
            DiasOtorgados,
            DiasConsumidos,
            DiasReservados,
            DiasAjustados,
            Estado,
            Observacion,
            UsuarioCreacion,
            FechaCreacion
        )
        VALUES
        (
            @IdEmpleado,
            @IdPolitica,
            @Anio,
            @FechaInicioPeriodo,
            @FechaFinPeriodo,
            @DiasOtorgados,
            0,
            0,
            0,
            'GENERADO',
            @Observacion,
            @Usuario,
            SYSDATETIME()
        );

        SET @IdPeriodo = SCOPE_IDENTITY();

        INSERT INTO dbo.VacacionMovimiento
        (
            IdEmpleado,
            IdPeriodo,
            TipoMovimiento,
            CantidadDias,
            FechaMovimiento,
            Estado,
            Referencia,
            Observacion,
            UsuarioCreacion,
            FechaCreacion
        )
        VALUES
        (
            @IdEmpleado,
            @IdPeriodo,
            'OTORGADO',
            @DiasOtorgados,
            @FechaInicioPeriodo,
            'APLICADO',
            CONCAT('PERIODO-', @Anio),
            ISNULL(@Observacion, 'Generacion inicial del periodo vacacional.'),
            @Usuario,
            SYSDATETIME()
        );
    END;
    ELSE
    BEGIN
        UPDATE dbo.VacacionPeriodo
        SET FechaInicioPeriodo = @FechaInicioPeriodo,
            FechaFinPeriodo = @FechaFinPeriodo,
            DiasOtorgados = @DiasOtorgados,
            Estado = 'GENERADO',
            Observacion = @Observacion,
            UsuarioModificacion = @Usuario,
            FechaModificacion = SYSDATETIME()
        WHERE IdPeriodo = @IdPeriodo;
    END;

    COMMIT TRANSACTION;

    SELECT
        Ok = 1,
        Exito = 1,
        Resultado = 1,
        Accion = 'GENERAR_PERIODO',
        Mensaje = 'Periodo vacacional generado correctamente.',
        IdPeriodo = @IdPeriodo;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_Vacacion_Periodo_GenerarMasivo
    @Anio INT,
    @IdPolitica INT,
    @UsuarioAccion NVARCHAR(50) = NULL,
    @Observacion NVARCHAR(500) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Usuario NVARCHAR(50) = ISNULL(NULLIF(LTRIM(RTRIM(@UsuarioAccion)), ''), 'sistema');
    DECLARE @sql NVARCHAR(MAX);
    DECLARE @IdEmpleado INT;
    DECLARE @Procesados INT = 0;

    IF ISNULL(@IdPolitica, 0) <= 0
    BEGIN
        RAISERROR('Debe indicar la politica vacacional.', 16, 1);
        RETURN;
    END;

    IF ISNULL(@Anio, 0) < 2000
    BEGIN
        RAISERROR('Debe indicar un anio valido.', 16, 1);
        RETURN;
    END;

    IF NOT EXISTS (SELECT 1 FROM dbo.VacacionPolitica WHERE IdPolitica = @IdPolitica)
    BEGIN
        RAISERROR('No existe la politica indicada.', 16, 1);
        RETURN;
    END;

    CREATE TABLE #Empleados
    (
        IdEmpleado INT NOT NULL PRIMARY KEY
    );

    SET @sql = N'
        INSERT INTO #Empleados (IdEmpleado)
        SELECT e.IdEmpleado
        FROM dbo.EmpleadoCj e
        WHERE 1 = 1 ' +
        CASE
            WHEN COL_LENGTH('dbo.EmpleadoCj', 'IdActivo') IS NOT NULL
                THEN N' AND ISNULL(e.IdActivo, 1) = 1'
            ELSE N''
        END + N'
          AND NOT EXISTS
          (
              SELECT 1
              FROM dbo.VacacionPeriodo p
              WHERE p.IdEmpleado = e.IdEmpleado
                AND p.IdPolitica = @IdPolitica
                AND p.Anio = @Anio
          );';

    EXEC sp_executesql
        @sql,
        N'@IdPolitica INT, @Anio INT',
        @IdPolitica = @IdPolitica,
        @Anio = @Anio;

    DECLARE cur CURSOR LOCAL FAST_FORWARD FOR
        SELECT IdEmpleado
        FROM #Empleados
        ORDER BY IdEmpleado;

    OPEN cur;
    FETCH NEXT FROM cur INTO @IdEmpleado;

    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC dbo.sp_Vacacion_Periodo_Generar
            @IdEmpleado = @IdEmpleado,
            @IdPolitica = @IdPolitica,
            @Anio = @Anio,
            @UsuarioAccion = @Usuario,
            @Observacion = @Observacion;

        SET @Procesados += 1;
        FETCH NEXT FROM cur INTO @IdEmpleado;
    END;

    CLOSE cur;
    DEALLOCATE cur;

    SELECT
        Ok = 1,
        Exito = 1,
        Resultado = 1,
        Accion = 'GENERAR_PERIODO_MASIVO',
        Mensaje = CONCAT('Generacion masiva completada. Empleados procesados: ', @Procesados, '.'),
        IdPolitica = @IdPolitica;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_Vacacion_Saldo_Consultar
    @IdEmpleado INT
AS
BEGIN
    SET NOCOUNT ON;

    IF ISNULL(@IdEmpleado, 0) <= 0
    BEGIN
        RAISERROR('Debe indicar el empleado.', 16, 1);
        RETURN;
    END;

    SELECT
        p.IdPeriodo,
        p.IdEmpleado,
        p.IdPolitica,
        p.Anio,
        p.FechaInicioPeriodo,
        p.FechaFinPeriodo,
        p.DiasOtorgados,
        p.DiasConsumidos,
        p.DiasReservados,
        p.DiasDisponibles,
        Estado = p.Estado
    FROM dbo.VacacionPeriodo p
    WHERE p.IdEmpleado = @IdEmpleado
    ORDER BY p.Anio DESC, p.IdPeriodo DESC;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_Vacacion_Solicitud_Registrar
    @IdEmpleado INT,
    @IdPeriodo INT,
    @FechaInicio DATE,
    @FechaFin DATE,
    @CantidadDias DECIMAL(10,2),
    @Motivo NVARCHAR(500) = NULL,
    @Observacion NVARCHAR(500) = NULL,
    @UsuarioAccion NVARCHAR(50) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Usuario NVARCHAR(50) = ISNULL(NULLIF(LTRIM(RTRIM(@UsuarioAccion)), ''), 'sistema');
    DECLARE @IdSolicitud INT;
    DECLARE @Disponible DECIMAL(10,2);
    DECLARE @PeriodoEmpleado INT;

    IF ISNULL(@IdEmpleado, 0) <= 0 OR ISNULL(@IdPeriodo, 0) <= 0
    BEGIN
        RAISERROR('Debe indicar el empleado y el periodo.', 16, 1);
        RETURN;
    END;

    IF @FechaFin < @FechaInicio
    BEGIN
        RAISERROR('La fecha fin no puede ser menor que la fecha inicio.', 16, 1);
        RETURN;
    END;

    IF ISNULL(@CantidadDias, 0) <= 0
    BEGIN
        RAISERROR('La cantidad de dias debe ser mayor a cero.', 16, 1);
        RETURN;
    END;

    SELECT
        @PeriodoEmpleado = p.IdEmpleado,
        @Disponible = p.DiasDisponibles
    FROM dbo.VacacionPeriodo p
    WHERE p.IdPeriodo = @IdPeriodo;

    IF @PeriodoEmpleado IS NULL
    BEGIN
        RAISERROR('No existe el periodo vacacional indicado.', 16, 1);
        RETURN;
    END;

    IF @PeriodoEmpleado <> @IdEmpleado
    BEGIN
        RAISERROR('El periodo indicado no corresponde al empleado.', 16, 1);
        RETURN;
    END;

    IF ISNULL(@Disponible, 0) < @CantidadDias
    BEGIN
        RAISERROR('El saldo disponible es insuficiente para registrar la solicitud.', 16, 1);
        RETURN;
    END;

    BEGIN TRANSACTION;

    INSERT INTO dbo.VacacionSolicitud
    (
        IdEmpleado,
        IdPeriodo,
        FechaInicio,
        FechaFin,
        CantidadDias,
        Estado,
        Motivo,
        Observacion,
        FechaCreacion,
        UsuarioCreacion
    )
    VALUES
    (
        @IdEmpleado,
        @IdPeriodo,
        @FechaInicio,
        @FechaFin,
        @CantidadDias,
        'PENDIENTE',
        @Motivo,
        @Observacion,
        SYSDATETIME(),
        @Usuario
    );

    SET @IdSolicitud = SCOPE_IDENTITY();

    UPDATE dbo.VacacionPeriodo
    SET DiasReservados = DiasReservados + @CantidadDias,
        UsuarioModificacion = @Usuario,
        FechaModificacion = SYSDATETIME()
    WHERE IdPeriodo = @IdPeriodo;

    INSERT INTO dbo.VacacionMovimiento
    (
        IdEmpleado,
        IdPeriodo,
        IdSolicitud,
        TipoMovimiento,
        CantidadDias,
        FechaMovimiento,
        Estado,
        Referencia,
        Observacion,
        UsuarioCreacion,
        FechaCreacion
    )
    VALUES
    (
        @IdEmpleado,
        @IdPeriodo,
        @IdSolicitud,
        'RESERVA',
        @CantidadDias,
        @FechaInicio,
        'APLICADO',
        CONCAT('SOL-', @IdSolicitud),
        ISNULL(@Observacion, 'Reserva por solicitud de vacaciones.'),
        @Usuario,
        SYSDATETIME()
    );

    COMMIT TRANSACTION;

    SELECT
        Ok = 1,
        Exito = 1,
        Resultado = 1,
        Accion = 'REGISTRAR_SOLICITUD',
        Mensaje = 'Solicitud vacacional registrada correctamente.',
        IdSolicitud = @IdSolicitud;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_Vacacion_Solicitud_Aprobar
    @IdSolicitud INT,
    @UsuarioAccion NVARCHAR(50) = NULL,
    @Observacion NVARCHAR(500) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Usuario NVARCHAR(50) = ISNULL(NULLIF(LTRIM(RTRIM(@UsuarioAccion)), ''), 'sistema');

    IF ISNULL(@IdSolicitud, 0) <= 0
    BEGIN
        RAISERROR('Debe indicar la solicitud.', 16, 1);
        RETURN;
    END;

    UPDATE dbo.VacacionSolicitud
    SET Estado = 'APROBADO',
        Observacion = COALESCE(@Observacion, Observacion),
        FechaAprobacion = SYSDATETIME(),
        UsuarioAprobacion = @Usuario,
        FechaModificacion = SYSDATETIME(),
        UsuarioModificacion = @Usuario
    WHERE IdSolicitud = @IdSolicitud
      AND Estado = 'PENDIENTE';

    IF @@ROWCOUNT = 0
    BEGIN
        RAISERROR('La solicitud no existe o no se encuentra pendiente.', 16, 1);
        RETURN;
    END;

    SELECT
        Ok = 1,
        Exito = 1,
        Resultado = 1,
        Accion = 'APROBAR_SOLICITUD',
        Mensaje = 'Solicitud vacacional aprobada correctamente.',
        IdSolicitud = @IdSolicitud;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_Vacacion_Solicitud_Rechazar
    @IdSolicitud INT,
    @MotivoRechazo NVARCHAR(500),
    @UsuarioAccion NVARCHAR(50) = NULL,
    @Observacion NVARCHAR(500) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Usuario NVARCHAR(50) = ISNULL(NULLIF(LTRIM(RTRIM(@UsuarioAccion)), ''), 'sistema');
    DECLARE @IdPeriodo INT;
    DECLARE @IdEmpleado INT;
    DECLARE @CantidadDias DECIMAL(10,2);

    SELECT
        @IdPeriodo = IdPeriodo,
        @IdEmpleado = IdEmpleado,
        @CantidadDias = CantidadDias
    FROM dbo.VacacionSolicitud
    WHERE IdSolicitud = @IdSolicitud
      AND Estado IN ('PENDIENTE', 'APROBADO');

    IF @IdPeriodo IS NULL
    BEGIN
        RAISERROR('La solicitud no existe o no se puede rechazar.', 16, 1);
        RETURN;
    END;

    BEGIN TRANSACTION;

    UPDATE dbo.VacacionSolicitud
    SET Estado = 'RECHAZADO',
        Observacion = COALESCE(@Observacion, Observacion),
        MotivoRechazo = @MotivoRechazo,
        FechaRechazo = SYSDATETIME(),
        UsuarioRechazo = @Usuario,
        FechaModificacion = SYSDATETIME(),
        UsuarioModificacion = @Usuario
    WHERE IdSolicitud = @IdSolicitud;

    UPDATE dbo.VacacionPeriodo
    SET DiasReservados = CASE WHEN DiasReservados >= @CantidadDias THEN DiasReservados - @CantidadDias ELSE 0 END,
        UsuarioModificacion = @Usuario,
        FechaModificacion = SYSDATETIME()
    WHERE IdPeriodo = @IdPeriodo;

    INSERT INTO dbo.VacacionMovimiento
    (
        IdEmpleado,
        IdPeriodo,
        IdSolicitud,
        TipoMovimiento,
        CantidadDias,
        FechaMovimiento,
        Estado,
        Referencia,
        Observacion,
        UsuarioCreacion,
        FechaCreacion
    )
    VALUES
    (
        @IdEmpleado,
        @IdPeriodo,
        @IdSolicitud,
        'REVERSA',
        -@CantidadDias,
        CAST(SYSDATETIME() AS DATE),
        'APLICADO',
        CONCAT('SOL-', @IdSolicitud),
        ISNULL(@Observacion, 'Liberacion de reserva por rechazo de solicitud.'),
        @Usuario,
        SYSDATETIME()
    );

    COMMIT TRANSACTION;

    SELECT
        Ok = 1,
        Exito = 1,
        Resultado = 1,
        Accion = 'RECHAZAR_SOLICITUD',
        Mensaje = 'Solicitud vacacional rechazada correctamente.',
        IdSolicitud = @IdSolicitud;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_Vacacion_Solicitud_Cancelar
    @IdSolicitud INT,
    @MotivoCancelacion NVARCHAR(500),
    @UsuarioAccion NVARCHAR(50) = NULL,
    @Observacion NVARCHAR(500) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Usuario NVARCHAR(50) = ISNULL(NULLIF(LTRIM(RTRIM(@UsuarioAccion)), ''), 'sistema');
    DECLARE @IdPeriodo INT;
    DECLARE @IdEmpleado INT;
    DECLARE @CantidadDias DECIMAL(10,2);

    SELECT
        @IdPeriodo = IdPeriodo,
        @IdEmpleado = IdEmpleado,
        @CantidadDias = CantidadDias
    FROM dbo.VacacionSolicitud
    WHERE IdSolicitud = @IdSolicitud
      AND Estado IN ('PENDIENTE', 'APROBADO');

    IF @IdPeriodo IS NULL
    BEGIN
        RAISERROR('La solicitud no existe o no se puede cancelar.', 16, 1);
        RETURN;
    END;

    BEGIN TRANSACTION;

    UPDATE dbo.VacacionSolicitud
    SET Estado = 'CANCELADO',
        Observacion = COALESCE(@Observacion, Observacion),
        MotivoCancelacion = @MotivoCancelacion,
        FechaCancelacion = SYSDATETIME(),
        UsuarioCancelacion = @Usuario,
        FechaModificacion = SYSDATETIME(),
        UsuarioModificacion = @Usuario
    WHERE IdSolicitud = @IdSolicitud;

    UPDATE dbo.VacacionPeriodo
    SET DiasReservados = CASE WHEN DiasReservados >= @CantidadDias THEN DiasReservados - @CantidadDias ELSE 0 END,
        UsuarioModificacion = @Usuario,
        FechaModificacion = SYSDATETIME()
    WHERE IdPeriodo = @IdPeriodo;

    INSERT INTO dbo.VacacionMovimiento
    (
        IdEmpleado,
        IdPeriodo,
        IdSolicitud,
        TipoMovimiento,
        CantidadDias,
        FechaMovimiento,
        Estado,
        Referencia,
        Observacion,
        UsuarioCreacion,
        FechaCreacion
    )
    VALUES
    (
        @IdEmpleado,
        @IdPeriodo,
        @IdSolicitud,
        'REVERSA',
        -@CantidadDias,
        CAST(SYSDATETIME() AS DATE),
        'APLICADO',
        CONCAT('SOL-', @IdSolicitud),
        ISNULL(@Observacion, 'Liberacion de reserva por cancelacion de solicitud.'),
        @Usuario,
        SYSDATETIME()
    );

    COMMIT TRANSACTION;

    SELECT
        Ok = 1,
        Exito = 1,
        Resultado = 1,
        Accion = 'CANCELAR_SOLICITUD',
        Mensaje = 'Solicitud vacacional cancelada correctamente.',
        IdSolicitud = @IdSolicitud;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_Vacacion_Solicitud_Finalizar
    @IdSolicitud INT,
    @UsuarioAccion NVARCHAR(50) = NULL,
    @Observacion NVARCHAR(500) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Usuario NVARCHAR(50) = ISNULL(NULLIF(LTRIM(RTRIM(@UsuarioAccion)), ''), 'sistema');
    DECLARE @IdPeriodo INT;
    DECLARE @IdEmpleado INT;
    DECLARE @CantidadDias DECIMAL(10,2);
    DECLARE @FechaInicio DATE;

    SELECT
        @IdPeriodo = IdPeriodo,
        @IdEmpleado = IdEmpleado,
        @CantidadDias = CantidadDias,
        @FechaInicio = FechaInicio
    FROM dbo.VacacionSolicitud
    WHERE IdSolicitud = @IdSolicitud
      AND Estado = 'APROBADO';

    IF @IdPeriodo IS NULL
    BEGIN
        RAISERROR('La solicitud no existe o no se encuentra aprobada.', 16, 1);
        RETURN;
    END;

    BEGIN TRANSACTION;

    UPDATE dbo.VacacionSolicitud
    SET Estado = 'FINALIZADO',
        Observacion = COALESCE(@Observacion, Observacion),
        FechaFinalizacion = SYSDATETIME(),
        UsuarioFinalizacion = @Usuario,
        FechaModificacion = SYSDATETIME(),
        UsuarioModificacion = @Usuario
    WHERE IdSolicitud = @IdSolicitud;

    UPDATE dbo.VacacionPeriodo
    SET DiasReservados = CASE WHEN DiasReservados >= @CantidadDias THEN DiasReservados - @CantidadDias ELSE 0 END,
        DiasConsumidos = DiasConsumidos + @CantidadDias,
        UsuarioModificacion = @Usuario,
        FechaModificacion = SYSDATETIME()
    WHERE IdPeriodo = @IdPeriodo;

    INSERT INTO dbo.VacacionMovimiento
    (
        IdEmpleado,
        IdPeriodo,
        IdSolicitud,
        TipoMovimiento,
        CantidadDias,
        FechaMovimiento,
        Estado,
        Referencia,
        Observacion,
        UsuarioCreacion,
        FechaCreacion
    )
    VALUES
    (
        @IdEmpleado,
        @IdPeriodo,
        @IdSolicitud,
        'CONSUMO',
        @CantidadDias,
        ISNULL(@FechaInicio, CAST(SYSDATETIME() AS DATE)),
        'APLICADO',
        CONCAT('SOL-', @IdSolicitud),
        ISNULL(@Observacion, 'Consumo por vacaciones finalizadas.'),
        @Usuario,
        SYSDATETIME()
    );

    COMMIT TRANSACTION;

    SELECT
        Ok = 1,
        Exito = 1,
        Resultado = 1,
        Accion = 'FINALIZAR_SOLICITUD',
        Mensaje = 'Solicitud vacacional finalizada correctamente.',
        IdSolicitud = @IdSolicitud;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_Vacacion_Movimiento_Revertir
    @IdVacacionMovimiento INT,
    @UsuarioAccion NVARCHAR(50) = NULL,
    @Observacion NVARCHAR(500) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Usuario NVARCHAR(50) = ISNULL(NULLIF(LTRIM(RTRIM(@UsuarioAccion)), ''), 'sistema');
    DECLARE @IdPeriodo INT;
    DECLARE @IdEmpleado INT;
    DECLARE @IdSolicitud INT;
    DECLARE @TipoMovimiento NVARCHAR(30);
    DECLARE @CantidadDias DECIMAL(10,2);
    DECLARE @IdMovimientoReversa INT;

    SELECT
        @IdPeriodo = IdPeriodo,
        @IdEmpleado = IdEmpleado,
        @IdSolicitud = IdSolicitud,
        @TipoMovimiento = TipoMovimiento,
        @CantidadDias = CantidadDias
    FROM dbo.VacacionMovimiento
    WHERE IdVacacionMovimiento = @IdVacacionMovimiento;

    IF @IdPeriodo IS NULL
    BEGIN
        RAISERROR('No existe el movimiento indicado.', 16, 1);
        RETURN;
    END;

    IF EXISTS
    (
        SELECT 1
        FROM dbo.VacacionMovimiento
        WHERE IdMovimientoOrigen = @IdVacacionMovimiento
          AND TipoMovimiento = 'REVERSA'
    )
    BEGIN
        RAISERROR('El movimiento ya fue revertido previamente.', 16, 1);
        RETURN;
    END;

    BEGIN TRANSACTION;

    IF @TipoMovimiento = 'OTORGADO'
    BEGIN
        UPDATE dbo.VacacionPeriodo
        SET DiasOtorgados = CASE WHEN DiasOtorgados >= @CantidadDias THEN DiasOtorgados - @CantidadDias ELSE 0 END,
            UsuarioModificacion = @Usuario,
            FechaModificacion = SYSDATETIME()
        WHERE IdPeriodo = @IdPeriodo;
    END
    ELSE IF @TipoMovimiento = 'RESERVA'
    BEGIN
        UPDATE dbo.VacacionPeriodo
        SET DiasReservados = CASE WHEN DiasReservados >= @CantidadDias THEN DiasReservados - @CantidadDias ELSE 0 END,
            UsuarioModificacion = @Usuario,
            FechaModificacion = SYSDATETIME()
        WHERE IdPeriodo = @IdPeriodo;
    END
    ELSE IF @TipoMovimiento = 'CONSUMO'
    BEGIN
        UPDATE dbo.VacacionPeriodo
        SET DiasConsumidos = CASE WHEN DiasConsumidos >= @CantidadDias THEN DiasConsumidos - @CantidadDias ELSE 0 END,
            UsuarioModificacion = @Usuario,
            FechaModificacion = SYSDATETIME()
        WHERE IdPeriodo = @IdPeriodo;
    END
    ELSE IF @TipoMovimiento = 'AJUSTE'
    BEGIN
        UPDATE dbo.VacacionPeriodo
        SET DiasAjustados = DiasAjustados - @CantidadDias,
            UsuarioModificacion = @Usuario,
            FechaModificacion = SYSDATETIME()
        WHERE IdPeriodo = @IdPeriodo;
    END
    ELSE IF @TipoMovimiento = 'LIQUIDACION'
    BEGIN
        UPDATE dbo.VacacionPeriodo
        SET EsLiquidado = 0,
            FechaLiquidacion = NULL,
            UsuarioModificacion = @Usuario,
            FechaModificacion = SYSDATETIME()
        WHERE IdPeriodo = @IdPeriodo;
    END;

    INSERT INTO dbo.VacacionMovimiento
    (
        IdEmpleado,
        IdPeriodo,
        IdSolicitud,
        IdMovimientoOrigen,
        TipoMovimiento,
        CantidadDias,
        FechaMovimiento,
        Estado,
        Referencia,
        Observacion,
        UsuarioCreacion,
        FechaCreacion
    )
    VALUES
    (
        @IdEmpleado,
        @IdPeriodo,
        @IdSolicitud,
        @IdVacacionMovimiento,
        'REVERSA',
        -@CantidadDias,
        CAST(SYSDATETIME() AS DATE),
        'APLICADO',
        CONCAT('REV-', @IdVacacionMovimiento),
        ISNULL(@Observacion, CONCAT('Reversion del movimiento ', @IdVacacionMovimiento, '.')),
        @Usuario,
        SYSDATETIME()
    );

    SET @IdMovimientoReversa = SCOPE_IDENTITY();

    COMMIT TRANSACTION;

    SELECT
        Ok = 1,
        Exito = 1,
        Resultado = 1,
        Accion = 'REVERTIR_MOVIMIENTO',
        Mensaje = 'Movimiento vacacional revertido correctamente.',
        IdVacacionMovimiento = @IdVacacionMovimiento,
        IdMovimientoReversa = @IdMovimientoReversa;
END;
GO
