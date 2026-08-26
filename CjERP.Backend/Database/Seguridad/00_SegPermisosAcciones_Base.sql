SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF OBJECT_ID('dbo.SegPermisoAccion', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.SegPermisoAccion
    (
        IdPermisoAccion INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_SegPermisoAccion PRIMARY KEY,
        RutaPagina NVARCHAR(250) NOT NULL,
        ClaveAccion NVARCHAR(120) NOT NULL,
        Etiqueta NVARCHAR(200) NULL,
        TipoElemento NVARCHAR(30) NOT NULL,
        IdRol INT NULL,
        IdEmpleado INT NULL,
        PuedeVer BIT NOT NULL CONSTRAINT DF_SegPermisoAccion_PuedeVer DEFAULT (1),
        PuedeEjecutar BIT NOT NULL CONSTRAINT DF_SegPermisoAccion_PuedeEjecutar DEFAULT (0),
        EsActivo BIT NOT NULL CONSTRAINT DF_SegPermisoAccion_EsActivo DEFAULT (1),
        FechaCreacion DATETIME2(0) NOT NULL CONSTRAINT DF_SegPermisoAccion_FechaCreacion DEFAULT (SYSDATETIME()),
        UsuarioCreacion NVARCHAR(100) NOT NULL CONSTRAINT DF_SegPermisoAccion_UsuarioCreacion DEFAULT ('SYSTEM'),
        FechaModificacion DATETIME2(0) NULL,
        UsuarioModificacion NVARCHAR(100) NULL,
        CONSTRAINT CK_SegPermisoAccion_Sujeto CHECK
        (
            (CASE WHEN ISNULL(IdRol, 0) > 0 THEN 1 ELSE 0 END)
            +
            (CASE WHEN ISNULL(IdEmpleado, 0) > 0 THEN 1 ELSE 0 END) = 1
        ),
        CONSTRAINT CK_SegPermisoAccion_TipoElemento CHECK (TipoElemento IN ('menu', 'tab', 'button', 'system'))
    );

    CREATE UNIQUE INDEX UX_SegPermisoAccion_Rol
        ON dbo.SegPermisoAccion (RutaPagina, ClaveAccion, TipoElemento, IdRol)
        WHERE IdRol IS NOT NULL;

    CREATE UNIQUE INDEX UX_SegPermisoAccion_Empleado
        ON dbo.SegPermisoAccion (RutaPagina, ClaveAccion, TipoElemento, IdEmpleado)
        WHERE IdEmpleado IS NOT NULL;

    CREATE INDEX IX_SegPermisoAccion_Ruta
        ON dbo.SegPermisoAccion (RutaPagina, TipoElemento, EsActivo)
        INCLUDE (IdRol, IdEmpleado, ClaveAccion, PuedeVer, PuedeEjecutar, Etiqueta);

    IF OBJECT_ID('dbo.EmpleadoCj', 'U') IS NOT NULL
    BEGIN
        ALTER TABLE dbo.SegPermisoAccion
            ADD CONSTRAINT FK_SegPermisoAccion_EmpleadoCj
            FOREIGN KEY (IdEmpleado) REFERENCES dbo.EmpleadoCj (IdEmpleado);
    END;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_SegPermisoAccion_Listar
    @RutaPagina NVARCHAR(250) = NULL,
    @IdRol INT = NULL,
    @IdEmpleado INT = NULL,
    @TipoElemento NVARCHAR(30) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        p.IdPermisoAccion,
        p.RutaPagina,
        p.RutaPagina AS NombrePagina,
        p.ClaveAccion,
        p.Etiqueta,
        p.TipoElemento,
        p.IdRol,
        NULL AS NombreRol,
        p.IdEmpleado,
        NULL AS NombreEmpleado,
        p.PuedeVer,
        p.PuedeEjecutar,
        p.EsActivo,
        p.UsuarioCreacion,
        p.FechaCreacion,
        p.UsuarioModificacion,
        p.FechaModificacion
    FROM dbo.SegPermisoAccion p
    WHERE (@RutaPagina IS NULL OR LTRIM(RTRIM(@RutaPagina)) = '' OR p.RutaPagina = @RutaPagina)
      AND (@IdRol IS NULL OR p.IdRol = @IdRol)
      AND (@IdEmpleado IS NULL OR p.IdEmpleado = @IdEmpleado)
      AND (@TipoElemento IS NULL OR LTRIM(RTRIM(@TipoElemento)) = '' OR p.TipoElemento = @TipoElemento)
    ORDER BY p.RutaPagina, p.TipoElemento, p.ClaveAccion, p.IdPermisoAccion;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_SegPermisoAccion_Obtener
    @IdPermisoAccion INT
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        p.IdPermisoAccion,
        p.RutaPagina,
        p.RutaPagina AS NombrePagina,
        p.ClaveAccion,
        p.Etiqueta,
        p.TipoElemento,
        p.IdRol,
        NULL AS NombreRol,
        p.IdEmpleado,
        NULL AS NombreEmpleado,
        p.PuedeVer,
        p.PuedeEjecutar,
        p.EsActivo,
        p.UsuarioCreacion,
        p.FechaCreacion,
        p.UsuarioModificacion,
        p.FechaModificacion
    FROM dbo.SegPermisoAccion p
    WHERE p.IdPermisoAccion = @IdPermisoAccion;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_SegPermisoAccion_Guardar
    @IdPermisoAccion INT = NULL,
    @RutaPagina NVARCHAR(250),
    @ClaveAccion NVARCHAR(120),
    @Etiqueta NVARCHAR(200) = NULL,
    @TipoElemento NVARCHAR(30),
    @IdRol INT = NULL,
    @IdEmpleado INT = NULL,
    @PuedeVer BIT = 1,
    @PuedeEjecutar BIT = 0,
    @EsActivo BIT = 1,
    @Usuario NVARCHAR(100) = 'SYSTEM'
AS
BEGIN
    SET NOCOUNT ON;

    IF NULLIF(LTRIM(RTRIM(@RutaPagina)), '') IS NULL
    BEGIN
        RAISERROR('La pagina es obligatoria.', 16, 1);
        RETURN;
    END;

    IF NULLIF(LTRIM(RTRIM(@ClaveAccion)), '') IS NULL
    BEGIN
        RAISERROR('La clave de accion es obligatoria.', 16, 1);
        RETURN;
    END;

    IF NULLIF(LTRIM(RTRIM(@TipoElemento)), '') IS NULL
       OR @TipoElemento NOT IN ('menu', 'tab', 'button', 'system')
    BEGIN
        RAISERROR('El tipo de elemento no es valido.', 16, 1);
        RETURN;
    END;

    IF ISNULL(@IdRol, 0) > 0 AND ISNULL(@IdEmpleado, 0) > 0
    BEGIN
        RAISERROR('Debe registrar solo un sujeto: rol o empleado.', 16, 1);
        RETURN;
    END;

    IF ISNULL(@IdRol, 0) <= 0 AND ISNULL(@IdEmpleado, 0) <= 0
    BEGIN
        RAISERROR('Debe registrar un rol o un empleado.', 16, 1);
        RETURN;
    END;

    IF EXISTS
    (
        SELECT 1
        FROM dbo.SegPermisoAccion
        WHERE RutaPagina = @RutaPagina
          AND ClaveAccion = @ClaveAccion
          AND TipoElemento = @TipoElemento
          AND ISNULL(IdRol, 0) = ISNULL(@IdRol, 0)
          AND ISNULL(IdEmpleado, 0) = ISNULL(@IdEmpleado, 0)
          AND ISNULL(IdPermisoAccion, 0) <> ISNULL(@IdPermisoAccion, 0)
    )
    BEGIN
        RAISERROR('Ya existe un permiso con la misma pagina, accion y sujeto.', 16, 1);
        RETURN;
    END;

    IF ISNULL(@IdPermisoAccion, 0) > 0
    BEGIN
        UPDATE dbo.SegPermisoAccion
        SET RutaPagina = @RutaPagina,
            ClaveAccion = @ClaveAccion,
            Etiqueta = @Etiqueta,
            TipoElemento = @TipoElemento,
            IdRol = NULLIF(@IdRol, 0),
            IdEmpleado = NULLIF(@IdEmpleado, 0),
            PuedeVer = @PuedeVer,
            PuedeEjecutar = @PuedeEjecutar,
            EsActivo = @EsActivo,
            FechaModificacion = SYSDATETIME(),
            UsuarioModificacion = @Usuario
        WHERE IdPermisoAccion = @IdPermisoAccion;

        SELECT @IdPermisoAccion AS IdPermisoAccion;
        RETURN;
    END;

    INSERT INTO dbo.SegPermisoAccion
    (
        RutaPagina,
        ClaveAccion,
        Etiqueta,
        TipoElemento,
        IdRol,
        IdEmpleado,
        PuedeVer,
        PuedeEjecutar,
        EsActivo,
        UsuarioCreacion
    )
    VALUES
    (
        @RutaPagina,
        @ClaveAccion,
        @Etiqueta,
        @TipoElemento,
        NULLIF(@IdRol, 0),
        NULLIF(@IdEmpleado, 0),
        @PuedeVer,
        @PuedeEjecutar,
        @EsActivo,
        @Usuario
    );

    SELECT CAST(SCOPE_IDENTITY() AS INT) AS IdPermisoAccion;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_SegPermisoAccion_Eliminar
    @IdPermisoAccion INT
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM dbo.SegPermisoAccion
    WHERE IdPermisoAccion = @IdPermisoAccion;

    SELECT @IdPermisoAccion AS IdPermisoAccion;
END;
GO
