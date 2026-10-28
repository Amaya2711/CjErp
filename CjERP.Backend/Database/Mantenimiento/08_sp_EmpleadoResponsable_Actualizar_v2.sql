/*
  sp_EmpleadoResponsable_Actualizar v2
  Cambio respecto al SP vigente en BD (script recibido 21/10/2026):
  - La cuenta a modificar se ubica por IdEmpleado + IdBancoActual + NombreCtaActual
    (empleado identificado por su documento). CuentaActual solo desambigua si esa clave
    devuelve mas de una fila.
  - Se puede cambiar nombre, cuenta e interbancaria sin disparar la validacion de duplicado.
  - Se ELIMINO la validacion de duplicado (NroDocumento + IdBanco + NombreCta): se permite
    grabar responsables con el mismo documento, banco y tipo de cuenta.
  Firma sin cambios: el backend (EmpleadoResponsableService) enlaza parametros por nombre.
  PV: ejecutar en BD real tras comparar con el SP vigente (Script as ALTER).
*/
CREATE OR ALTER PROCEDURE dbo.sp_EmpleadoResponsable_Actualizar
(
    @IdEmpleado          BIGINT,
    @IdBancoActual       INT,
    @CuentaActual        VARCHAR(100),
    @NombreCtaActual     VARCHAR(100),
    @NombreEmpleado      VARCHAR(200),
    @NroDocumento        VARCHAR(50),
    @IdBanco             INT,
    @Cuenta              VARCHAR(100),
    @CuentaInter         VARCHAR(100),
    @NombreCta           VARCHAR(100),
    @UsuarioModificacion VARCHAR(100)
)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        SET @NombreEmpleado      = UPPER(LTRIM(RTRIM(@NombreEmpleado)));
        SET @NroDocumento        = LTRIM(RTRIM(@NroDocumento));
        SET @Cuenta              = LTRIM(RTRIM(@Cuenta));
        SET @CuentaInter         = LTRIM(RTRIM(@CuentaInter));
        SET @NombreCta           = UPPER(LTRIM(RTRIM(@NombreCta)));
        SET @UsuarioModificacion = LTRIM(RTRIM(@UsuarioModificacion));
        SET @CuentaActual        = LTRIM(RTRIM(ISNULL(@CuentaActual, '')));
        SET @NombreCtaActual     = UPPER(LTRIM(RTRIM(ISNULL(@NombreCtaActual, ''))));

        IF ISNULL(@IdEmpleado, 0) <= 0
        BEGIN SELECT 0 AS Resultado, 'Debe indicar el responsable a actualizar.' AS Mensaje, @IdEmpleado AS IdEmpleado; RETURN; END;

        IF ISNULL(@NombreEmpleado, '') = ''
        BEGIN SELECT 0 AS Resultado, 'Debe ingresar el nombre del responsable.' AS Mensaje, @IdEmpleado AS IdEmpleado; RETURN; END;

        IF ISNULL(@NroDocumento, '') = ''
        BEGIN SELECT 0 AS Resultado, 'Debe ingresar el número de documento.' AS Mensaje, @IdEmpleado AS IdEmpleado; RETURN; END;

        IF ISNULL(@IdBanco, 0) <= 0
        BEGIN SELECT 0 AS Resultado, 'Debe seleccionar un banco.' AS Mensaje, @IdEmpleado AS IdEmpleado; RETURN; END;

        IF ISNULL(@NombreCta, '') = ''
        BEGIN SELECT 0 AS Resultado, 'Debe seleccionar el tipo de cuenta.' AS Mensaje, @IdEmpleado AS IdEmpleado; RETURN; END;

        IF ISNULL(@IdBancoActual, 0) <= 0
        BEGIN SELECT 0 AS Resultado, 'Debe indicar el banco actual de la cuenta.' AS Mensaje, @IdEmpleado AS IdEmpleado; RETURN; END;

        IF @NombreCtaActual = ''
        BEGIN SELECT 0 AS Resultado, 'Debe indicar el tipo de cuenta actual.' AS Mensaje, @IdEmpleado AS IdEmpleado; RETURN; END;

        DECLARE @NroDocumentoActual VARCHAR(50);

        SELECT @NroDocumentoActual = LTRIM(RTRIM(ISNULL(E.NroDocumento, '')))
        FROM dbo.Empleado E
        WHERE E.IdEmpleado = @IdEmpleado AND E.IdCargo = 10 AND E.IdEstado = 1;

        IF @NroDocumentoActual IS NULL
        BEGIN SELECT 0 AS Resultado, 'El responsable indicado no existe o no está activo.' AS Mensaje, @IdEmpleado AS IdEmpleado; RETURN; END;

        ------------------------------------------------------------
        -- UBICAR LA CUENTA: empleado (documento) + banco + tipo de cuenta
        ------------------------------------------------------------
        -- CuentaEmpleado no tiene columna IdCuenta: la fila se identifica por clave natural.
        DECLARE @Cantidad INT;
        DECLARE @UsarCuenta BIT = 0;

        SELECT @Cantidad = COUNT(*)
        FROM dbo.CuentaEmpleado CE
        WHERE CE.IdEmpleado = @IdEmpleado
          AND CE.IdCargo = 10
          AND CE.IdBanco = @IdBancoActual
          AND UPPER(LTRIM(RTRIM(ISNULL(CE.NombreCta, '')))) = @NombreCtaActual;

        -- Mas de una con la misma clave: desambiguar por la cuenta actual
        IF @Cantidad > 1 AND @CuentaActual <> ''
        BEGIN
            SET @UsarCuenta = 1;

            SELECT @Cantidad = COUNT(*)
            FROM dbo.CuentaEmpleado CE
            WHERE CE.IdEmpleado = @IdEmpleado
              AND CE.IdCargo = 10
              AND CE.IdBanco = @IdBancoActual
              AND UPPER(LTRIM(RTRIM(ISNULL(CE.NombreCta, '')))) = @NombreCtaActual
              AND LTRIM(RTRIM(ISNULL(CE.Cuenta, ''))) = @CuentaActual;
        END;

        IF @Cantidad = 0
        BEGIN SELECT 0 AS Resultado, 'La cuenta bancaria seleccionada no existe o no pertenece al responsable.' AS Mensaje, @IdEmpleado AS IdEmpleado; RETURN; END;

        IF @Cantidad > 1
        BEGIN SELECT 0 AS Resultado, 'Existen varias cuentas con el mismo documento, banco y tipo de cuenta. No es posible determinar qué registro actualizar.' AS Mensaje, @IdEmpleado AS IdEmpleado; RETURN; END;

        -- Sin validacion de duplicado: se permite mas de una cuenta con el mismo
        -- documento, banco y tipo de cuenta (solicitado 2026-10-28).

        ------------------------------------------------------------
        -- ACTUALIZAR
        ------------------------------------------------------------
        BEGIN TRANSACTION;

        UPDATE dbo.Empleado
        SET NombreEmpleado = @NombreEmpleado,
            NroDocumento   = @NroDocumento
        WHERE IdEmpleado = @IdEmpleado AND IdCargo = 10;

        UPDATE CE
        SET CE.IdBanco     = @IdBanco,
            CE.Cuenta      = @Cuenta,
            CE.CuentaInter = @CuentaInter,
            CE.NombreCta   = @NombreCta
        FROM dbo.CuentaEmpleado CE
        WHERE CE.IdEmpleado = @IdEmpleado
          AND CE.IdCargo = 10
          AND CE.IdBanco = @IdBancoActual
          AND UPPER(LTRIM(RTRIM(ISNULL(CE.NombreCta, '')))) = @NombreCtaActual
          AND (@UsarCuenta = 0 OR LTRIM(RTRIM(ISNULL(CE.Cuenta, ''))) = @CuentaActual);

        IF @@ROWCOUNT <> 1
            THROW 50001, 'No fue posible actualizar una única cuenta bancaria.', 1;

        COMMIT TRANSACTION;

        SELECT 1 AS Resultado, 'Responsable actualizado correctamente.' AS Mensaje, @IdEmpleado AS IdEmpleado;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        SELECT 0 AS Resultado, ERROR_MESSAGE() AS Mensaje, @IdEmpleado AS IdEmpleado;
    END CATCH;
END
GO
