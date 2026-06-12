IF OBJECT_ID(N'dbo.IaChatAuditoria', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.IaChatAuditoria
    (
        IdIaChatAuditoria     INT IDENTITY(1,1) PRIMARY KEY,
        IdUsuario             NVARCHAR(100) NULL,
        Modulo                VARCHAR(50) NOT NULL,
        Pregunta              NVARCHAR(MAX) NOT NULL,
        Herramienta           VARCHAR(100) NULL,
        ParametrosJson        NVARCHAR(MAX) NULL,
        DuracionMs            INT NULL,
        CantidadRegistros     INT NULL,
        FueExitoso            BIT NOT NULL,
        MensajeError          NVARCHAR(MAX) NULL,
        FechaCreacion         DATETIME2 NOT NULL DEFAULT SYSDATETIME()
    );
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_IaChatAuditoria_Insertar
    @IdUsuario         NVARCHAR(100) = NULL,
    @Modulo            VARCHAR(50),
    @Pregunta          NVARCHAR(MAX),
    @Herramienta       VARCHAR(100) = NULL,
    @ParametrosJson    NVARCHAR(MAX) = NULL,
    @DuracionMs        INT = NULL,
    @CantidadRegistros INT = NULL,
    @FueExitoso        BIT,
    @MensajeError      NVARCHAR(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    INSERT INTO dbo.IaChatAuditoria
    (
        IdUsuario,
        Modulo,
        Pregunta,
        Herramienta,
        ParametrosJson,
        DuracionMs,
        CantidadRegistros,
        FueExitoso,
        MensajeError
    )
    VALUES
    (
        NULLIF(LTRIM(RTRIM(@IdUsuario)), ''),
        UPPER(LTRIM(RTRIM(@Modulo))),
        @Pregunta,
        NULLIF(LTRIM(RTRIM(@Herramienta)), ''),
        @ParametrosJson,
        @DuracionMs,
        @CantidadRegistros,
        @FueExitoso,
        @MensajeError
    );
END;
GO
