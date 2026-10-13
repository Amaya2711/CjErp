-- Beneficios (adelanto de sueldo / préstamo). Migración de FrmBeneficio (DXAsignacion).
-- Tablas existentes (NO se crean aquí): dbo.cabBeneficio, dbo.DetBeneficio, dbo.EmpleadoCj, dbo.EmpleadoCjDetalle, dbo.Constante.
-- PV: confirmar en la BD los tipos reales de cabBeneficio/DetBeneficio (se asume IdBeneficio BIGINT, MesPago texto 'MM/yyyy',
--     Monto numérico) y de Constante.ValorFin (correlativo base 5000000000, campo 'CORRELATIVO', correlativo 7).
-- Idempotente (CREATE OR ALTER). Ejecutar en JC_Db antes de desplegar el backend de Beneficios.
-- IdTipoBeneficio: 1 = Préstamo, 2 = Adelanto de sueldo. El préstamo admite de 1 a 60 cuotas mensuales; el adelanto siempre es 1 cuota.
-- IdAprobado: 0 = pendiente, 1 = aprobado, 2 = rechazado.
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/* 1) Empleados que pueden solicitar un beneficio (misma regla que FrmBeneficio: cargo 50 y estado 1). */
CREATE OR ALTER PROCEDURE dbo.sp_Beneficio_ListarEmpleados
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        e.IdEmpleado,
        e.NombreEmpleado,
        e.NroDocumento,
        e.IdAptoBeneficio
    FROM dbo.EmpleadoCj e
    WHERE e.IdCargo = 50
      AND e.IdEstado = 1
    ORDER BY e.NombreEmpleado;
END;
GO

/* 2) Registra el beneficio: valida aptitud, genera correlativo, cabecera y cronograma, y marca al empleado como no apto. */
CREATE OR ALTER PROCEDURE dbo.sp_Beneficio_Registrar
(
    @IdTipoBeneficio INT,
    @IdEmpleado      INT,
    @Monto           DECIMAL(18,2),
    @Meses           INT,
    @MesInicio       DATE
)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF @IdTipoBeneficio NOT IN (1, 2)
        THROW 50001, 'Tipo de beneficio no válido.', 1;
    IF @Monto IS NULL OR @Monto <= 0
        THROW 50002, 'Debe ingresar un monto mayor a cero.', 1;
    IF @IdTipoBeneficio = 2
        SET @Meses = 1;   -- adelanto de sueldo: siempre 1 cuota
    IF @Meses IS NULL OR @Meses < 1 OR @Meses > 60
        THROW 50003, 'La cantidad de meses debe estar entre 1 y 60.', 1;
    IF @MesInicio IS NULL
        THROW 50004, 'Debe indicar el mes de inicio.', 1;
    IF @MesInicio < DATEFROMPARTS(YEAR(GETDATE()), MONTH(GETDATE()), 1)
        THROW 50008, 'El mes de inicio no puede ser anterior al mes actual.', 1;

    DECLARE @Apto INT, @Existe INT;
    SELECT @Existe = COUNT(*), @Apto = MAX(IdAptoBeneficio)
    FROM dbo.EmpleadoCj
    WHERE IdEmpleado = @IdEmpleado AND IdCargo = 50 AND IdEstado = 1;

    IF @Existe = 0
        THROW 50005, 'El empleado seleccionado no existe o no puede solicitar beneficios.', 1;
    IF @Apto = 2
        THROW 50006, 'Empleado NO APTO para el beneficio solicitado. Revisar pagos pendientes.', 1;

    BEGIN TRANSACTION;

    -- Correlativo: valorfin + 1 sobre Constante CORRELATIVO/7, bloqueado para evitar duplicados por concurrencia.
    DECLARE @Actual BIGINT, @IdBeneficio BIGINT;
    SELECT @Actual = TRY_CONVERT(BIGINT, ValorFin)
    FROM dbo.Constante WITH (UPDLOCK, HOLDLOCK)
    WHERE Campo = 'CORRELATIVO' AND Correlativo = 7;

    IF @Actual IS NULL
    BEGIN
        ROLLBACK TRANSACTION;
        THROW 50007, 'No se encontró el correlativo de beneficios (Constante CORRELATIVO / 7).', 1;
    END;

    SET @IdBeneficio = @Actual + 1;

    INSERT dbo.cabBeneficio
        (IdBeneficio, IdTipoBeneficio, IdEmpleado, Monto, Meses, MesInicio, FechaCreacion, IdEstado, IdAprobado)
    VALUES
        (@IdBeneficio, @IdTipoBeneficio, @IdEmpleado, @Monto, @Meses, @MesInicio, GETDATE(), 1, 0);

    UPDATE dbo.Constante
    SET ValorFin = @IdBeneficio
    WHERE Campo = 'CORRELATIVO' AND Correlativo = 7;

    -- Cronograma: cuotas iguales redondeadas a 2 decimales; la última absorbe la diferencia de redondeo.
    DECLARE @Cuota DECIMAL(18,2) = ROUND(@Monto / @Meses, 2);

    ;WITH n AS (
        SELECT 0 AS i
        UNION ALL
        SELECT i + 1 FROM n WHERE i + 1 < @Meses
    )
    INSERT dbo.DetBeneficio (IdBeneficio, MesPago, Monto, IdEstado)
    SELECT
        @IdBeneficio,
        FORMAT(DATEADD(MONTH, n.i, @MesInicio), 'MM/yyyy'),
        CASE WHEN n.i = @Meses - 1 THEN @Monto - (@Cuota * (@Meses - 1)) ELSE @Cuota END,
        1
    FROM n
    OPTION (MAXRECURSION 100);

    UPDATE dbo.EmpleadoCj SET IdAptoBeneficio = 2 WHERE IdEmpleado = @IdEmpleado;

    COMMIT TRANSACTION;

    SELECT @IdBeneficio AS IdBeneficio;
END;
GO

/* 3) Listado (reemplaza la consulta pBeneficio de ModuleJc.vb). Todos los filtros son opcionales. */
CREATE OR ALTER PROCEDURE dbo.sp_Beneficio_Listar
(
    @IdBeneficio     BIGINT = NULL,
    @IdEmpleado      INT    = NULL,
    @IdTipoBeneficio INT    = NULL,
    @IdAprobado      INT    = NULL
)
AS
BEGIN
    SET NOCOUNT ON;

    SELECT DISTINCT
        a.IdBeneficio,
        a.IdTipoBeneficio,
        t.ValorIni      AS TipoBeneficio,
        a.IdEmpleado,
        b.NombreEmpleado,
        b.NroDocumento,
        a.Monto,
        a.Meses,
        a.MesInicio,
        a.FechaCreacion,
        a.IdEstado,
        e.ValorIni      AS NombreCliente,      -- empresa del empleado (EMPRESA_CJ)
        a.IdAprobado,
        f.ValorIni      AS TxtAprobado,
        a.IdAprobador,
        ap.NombreEmpleado AS Aprobador,
        a.FechaAprobador
    FROM dbo.cabBeneficio a
    LEFT JOIN dbo.EmpleadoCj b          ON a.IdEmpleado = b.IdEmpleado
    LEFT JOIN dbo.EmpleadoCjDetalle d   ON b.IdEmpleado = d.IdEmpleadoCj
    LEFT JOIN dbo.Constante e           ON e.Campo = 'EMPRESA_CJ' AND d.IdEmpresaCj = e.Correlativo
    LEFT JOIN dbo.Constante f           ON f.Campo = 'APROBADO_PAGO_BENEFICIO' AND a.IdAprobado = f.Correlativo
    LEFT JOIN dbo.Constante t           ON t.Campo = 'BENEFICIO' AND t.Correlativo = a.IdTipoBeneficio
    LEFT JOIN dbo.EmpleadoCj ap         ON a.IdAprobador = ap.IdEmpleado
    WHERE (@IdBeneficio IS NULL     OR a.IdBeneficio = @IdBeneficio)
      AND (@IdEmpleado IS NULL      OR a.IdEmpleado = @IdEmpleado)
      AND (@IdTipoBeneficio IS NULL OR a.IdTipoBeneficio = @IdTipoBeneficio)
      AND (@IdAprobado IS NULL      OR a.IdAprobado = @IdAprobado)
    ORDER BY a.IdBeneficio DESC;
END;
GO

/* 4) Cronograma de cuotas de un beneficio (grilla y PDF). */
CREATE OR ALTER PROCEDURE dbo.sp_Beneficio_Detalle
(
    @IdBeneficio BIGINT
)
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        d.IdBeneficio,
        d.MesPago,
        d.Monto,
        d.IdEstado
    FROM dbo.DetBeneficio d
    WHERE d.IdBeneficio = @IdBeneficio
    ORDER BY RIGHT(d.MesPago, 4), LEFT(d.MesPago, 2);   -- 'MM/yyyy' -> año, mes
END;
GO

/* 5) Aprueba un beneficio pendiente. Devuelve las filas afectadas (0 = ya no estaba pendiente). */
CREATE OR ALTER PROCEDURE dbo.sp_Beneficio_Aprobar
(
    @IdBeneficio BIGINT,
    @IdAprobador INT
)
AS
BEGIN
    SET NOCOUNT ON;

    UPDATE dbo.cabBeneficio
    SET IdAprobado = 1,
        IdAprobador = @IdAprobador,
        FechaAprobador = GETDATE()
    WHERE IdBeneficio = @IdBeneficio
      AND IdAprobado = 0;

    SELECT @@ROWCOUNT AS Filas;
END;
GO

/* 6) Rechaza un beneficio pendiente (IdAprobado = 2, IdEstado = 0), igual que Rechazar() de FrmBeneficio.
      Mejora sobre el original: si el empleado no tiene otro beneficio vigente (pendiente o aprobado, no rechazado),
      se le devuelve a apto (IdAptoBeneficio = 1; PV: confirmar que 1 es el valor "apto" en la BD). */
CREATE OR ALTER PROCEDURE dbo.sp_Beneficio_Rechazar
(
    @IdBeneficio BIGINT,
    @IdRechazo   INT
)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Filas INT = 0, @IdEmpleado INT;

    BEGIN TRANSACTION;

    SELECT @IdEmpleado = IdEmpleado
    FROM dbo.cabBeneficio WITH (UPDLOCK)
    WHERE IdBeneficio = @IdBeneficio AND IdAprobado = 0;

    IF @IdEmpleado IS NOT NULL
    BEGIN
        UPDATE dbo.cabBeneficio
        SET IdAprobado = 2,
            IdEstado = 0,
            IdRechazo = @IdRechazo,
            FechaRechazo = GETDATE()
        WHERE IdBeneficio = @IdBeneficio
          AND IdAprobado = 0;

        SET @Filas = @@ROWCOUNT;

        IF @Filas > 0
           AND NOT EXISTS (
                SELECT 1
                FROM dbo.cabBeneficio
                WHERE IdEmpleado = @IdEmpleado
                  AND IdBeneficio <> @IdBeneficio
                  AND IdAprobado IN (0, 1)
                  AND ISNULL(IdEstado, 1) <> 0
           )
            UPDATE dbo.EmpleadoCj SET IdAptoBeneficio = 1 WHERE IdEmpleado = @IdEmpleado;
    END;

    COMMIT TRANSACTION;

    SELECT @Filas AS Filas;
END;
GO
