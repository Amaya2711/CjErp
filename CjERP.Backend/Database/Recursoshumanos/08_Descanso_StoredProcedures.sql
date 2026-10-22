-- Descanso médico. Migración de frmDescanso (DXAsignacion).
-- Tablas existentes (NO se crean aquí): dbo.EmpleadoDescanso, dbo.EmpleadoCj, dbo.Constante, dbo.Asistencia.
-- PV: confirmar en la BD los tipos reales de EmpleadoDescanso (columnas usadas por el formulario original:
--     IdEmpleadoCj, IdEstado, Fecha, IdActivo, FechaInicio, FechaFin, Usuario, FechaCreacion, Ruta, IdPre, FechaPre,
--     IdPrimera, FechaPrimera, IdAutorizado, FechaAutorizado, IdRechazo, FechaRechazo).
-- Idempotente (CREATE OR ALTER). Ejecutar en JC_Db antes de desplegar el backend de Descanso médico.
-- Estados (IdEstado): 97 = 1era aprobación, 98 = 2da, 99 = 3era, 100 = 4ta, 5 = aprobado final, 0 = rechazado, 4 = vacaciones.
-- Una solicitud = un rango FechaInicio/FechaFin; se guarda UNA FILA POR DÍA (Fecha), como en el formulario original.
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/* 0) Ruta del adjunto: la ruta de SharePoint (APLICATIVOS EXTERNOS/DESCANSO_MEDICO/descanso_<id>_<archivo>.pdf) supera
      los ~50 caracteres con los que la columna fue creada ("String or binary data would be truncated ... 'Ruta'").
      Solo AMPLIA la columna a NVARCHAR(500) si hoy es menor (no reduce ni toca datos), conservando NULL/NOT NULL. */
IF EXISTS (
    SELECT 1
    FROM sys.columns c
    WHERE c.object_id = OBJECT_ID(N'dbo.EmpleadoDescanso')
      AND c.name = N'Ruta'
      AND (CASE WHEN c.system_type_id IN (231, 239) THEN c.max_length / 2 ELSE c.max_length END) BETWEEN 1 AND 499
)
BEGIN
    IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.EmpleadoDescanso') AND name = N'Ruta' AND is_nullable = 0)
        ALTER TABLE dbo.EmpleadoDescanso ALTER COLUMN Ruta NVARCHAR(500) NOT NULL;
    ELSE
        ALTER TABLE dbo.EmpleadoDescanso ALTER COLUMN Ruta NVARCHAR(500) NULL;
END
GO

/* 0b) Motivo del rechazo. PV: si la columna Observacion ya existe en la BD real no hace nada. */
IF COL_LENGTH(N'dbo.EmpleadoDescanso', N'Observacion') IS NULL
    ALTER TABLE dbo.EmpleadoDescanso ADD Observacion NVARCHAR(500) NULL;
GO

/* 1) Empleados para el combo (misma regla que frmDescanso: cargo 50 y estado 1). */
CREATE OR ALTER PROCEDURE dbo.sp_Descanso_ListarEmpleados
AS
BEGIN
    SET NOCOUNT ON;

    SELECT e.IdEmpleado, e.NombreEmpleado, e.NroDocumento
    FROM dbo.EmpleadoCj e
    WHERE e.IdCargo = 50
      AND e.IdEstado = 1
    ORDER BY e.NombreEmpleado;
END;
GO

/* 2) Registra el descanso: una fila por día del rango con estado 97. Todo o nada (transacción). */
CREATE OR ALTER PROCEDURE dbo.sp_Descanso_Registrar
(
    @IdEmpleadoCj INT,
    @FechaInicio  DATE,
    @FechaFin     DATE,
    @Ruta         NVARCHAR(500),
    @Usuario      NVARCHAR(100)
)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF @IdEmpleadoCj IS NULL OR @IdEmpleadoCj <= 0
        THROW 50101, 'Debe seleccionar empleado.', 1;
    IF @FechaInicio IS NULL OR @FechaFin IS NULL
        THROW 50102, 'Debe indicar fecha inicio y fecha fin.', 1;
    IF @FechaFin < @FechaInicio
        THROW 50103, 'La fecha fin no puede ser menor que la fecha inicio.', 1;
    IF DATEDIFF(DAY, @FechaInicio, @FechaFin) + 1 > 366
        THROW 50104, 'El rango no puede superar 366 días.', 1;
    IF @Ruta IS NULL OR LTRIM(RTRIM(@Ruta)) = ''
        THROW 50105, 'Debe ingresar documentos adjuntos.', 1;
    IF NOT EXISTS (SELECT 1 FROM dbo.EmpleadoCj WHERE IdEmpleado = @IdEmpleadoCj)
        THROW 50106, 'El empleado seleccionado no existe.', 1;

    DECLARE @Dias INT = DATEDIFF(DAY, @FechaInicio, @FechaFin) + 1;

    ;WITH n AS (
        SELECT 0 AS i
        UNION ALL
        SELECT i + 1 FROM n WHERE i + 1 < @Dias
    )
    SELECT DATEADD(DAY, n.i, @FechaInicio) AS Fecha
    INTO #Dias
    FROM n
    OPTION (MAXRECURSION 400);

    BEGIN TRANSACTION;

    IF EXISTS (
        SELECT 1
        FROM dbo.EmpleadoDescanso d WITH (UPDLOCK, HOLDLOCK)
        JOIN #Dias x ON CONVERT(DATE, d.Fecha) = x.Fecha
        WHERE d.IdEmpleadoCj = @IdEmpleadoCj
          AND d.IdEstado IN (4, 97, 98, 99, 100)
          AND d.IdActivo = 1
    )
    BEGIN
        ROLLBACK TRANSACTION;
        THROW 50107, 'Ya existe esa fecha registrada. Revisar.', 1;
    END;

    INSERT dbo.EmpleadoDescanso
        (IdEmpleadoCj, IdEstado, Fecha, IdActivo, FechaInicio, FechaFin, Usuario, FechaCreacion, Ruta)
    SELECT @IdEmpleadoCj, 97, x.Fecha, 1, @FechaInicio, @FechaFin, @Usuario, GETDATE(), @Ruta
    FROM #Dias x;

    COMMIT TRANSACTION;

    SELECT @Dias AS DiasRegistrados;
END;
GO

/* 3) Listado agrupado por solicitud (reemplaza pDescansoAgru). Todos los filtros son opcionales. */
CREATE OR ALTER PROCEDURE dbo.sp_Descanso_Listar
(
    @IdEstado     INT  = NULL,
    @IdEmpleadoCj INT  = NULL,
    @FechaInicial DATE = NULL,
    @FechaFinal   DATE = NULL,
    -- "Mis pendientes": solo solicitudes en la etapa que le corresponde al validador (PV: 97 = 1er validador,
    -- 98 = 2do, 99 = 3ro, según EmpleadoCjDetalle.IdResponsableCj / IdSegundoVacaciones / IdTerceroVacaciones).
    @IdValidador  INT  = NULL
)
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        a.IdEmpleadoCj,
        a.IdEstado,
        CASE WHEN a.IdEstado = 0 THEN 'RECHAZADO' ELSE c.ValorIni END AS Estado,
        b.NombreEmpleado,
        b.NroDocumento,
        CONVERT(DATE, a.FechaInicio) AS FechaInicio,
        CONVERT(DATE, a.FechaFin)    AS FechaFin,
        COUNT(*)                     AS Dias,
        MAX(a.Usuario)               AS Usuario,
        MIN(a.FechaCreacion)         AS FechaCreacion,
        MAX(a.Ruta)                  AS Ruta,
        r.NombreEmpleado             AS PrimerValidador,
        s.NombreEmpleado             AS SegundoValidador,
        t.NombreEmpleado             AS TercerValidador,
        MAX(a.FechaPre)              AS FechaPre,
        MAX(a.FechaPrimera)          AS FechaPrimera,
        MAX(a.FechaAutorizado)       AS FechaAutorizado
    FROM dbo.EmpleadoDescanso a
    LEFT JOIN dbo.EmpleadoCj b         ON a.IdEmpleadoCj = b.IdEmpleado
    LEFT JOIN dbo.Constante c          ON c.Campo = 'ESTADO_ASISTENCIA' AND c.Correlativo = a.IdEstado
    LEFT JOIN dbo.EmpleadoCjDetalle d  ON a.IdEmpleadoCj = d.IdEmpleadoCj
    LEFT JOIN dbo.EmpleadoCj r         ON d.IdResponsableCj = r.IdEmpleado
    LEFT JOIN dbo.EmpleadoCj s         ON d.IdSegundoVacaciones = s.IdEmpleado
    LEFT JOIN dbo.EmpleadoCj t         ON d.IdTerceroVacaciones = t.IdEmpleado
    WHERE (@IdEstado IS NULL     OR a.IdEstado = @IdEstado)
      AND (@IdEmpleadoCj IS NULL OR a.IdEmpleadoCj = @IdEmpleadoCj)
      AND (@FechaInicial IS NULL OR @FechaFinal IS NULL
           OR (CONVERT(DATE, a.FechaInicio) <= @FechaFinal AND CONVERT(DATE, a.FechaFin) >= @FechaInicial))
      AND (@IdValidador IS NULL
           OR (a.IdEstado = 97 AND d.IdResponsableCj      = @IdValidador)
           OR (a.IdEstado = 98 AND d.IdSegundoVacaciones  = @IdValidador)
           OR (a.IdEstado = 99 AND d.IdTerceroVacaciones  = @IdValidador))
    GROUP BY a.IdEmpleadoCj, a.IdEstado, CASE WHEN a.IdEstado = 0 THEN 'RECHAZADO' ELSE c.ValorIni END,
             b.NombreEmpleado, b.NroDocumento, CONVERT(DATE, a.FechaInicio), CONVERT(DATE, a.FechaFin),
             r.NombreEmpleado, s.NombreEmpleado, t.NombreEmpleado
    ORDER BY CONVERT(DATE, a.FechaInicio) DESC, b.NombreEmpleado;
END;
GO

/* 4) Avanza una solicitud a la siguiente etapa (97 -> 98 -> 99 -> 100 -> 5). Devuelve los días actualizados.
      Al aprobar la etapa final (100 -> 5) exige adjunto y marca la asistencia del rango con estado 5. */
CREATE OR ALTER PROCEDURE dbo.sp_Descanso_Aprobar
(
    @IdEmpleadoCj  INT,
    @FechaInicio   DATE,
    @FechaFin      DATE,
    @IdEstadoActual INT,
    @IdAprobador   INT
)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF @IdEstadoActual NOT IN (97, 98, 99, 100)
        THROW 50111, 'La solicitud no está en una etapa aprobable.', 1;

    DECLARE @Filas INT = 0;

    BEGIN TRANSACTION;

    IF @IdEstadoActual = 100
       AND EXISTS (
            SELECT 1 FROM dbo.EmpleadoDescanso
            WHERE IdEmpleadoCj = @IdEmpleadoCj AND IdEstado = 100
              AND CONVERT(DATE, FechaInicio) = @FechaInicio AND CONVERT(DATE, FechaFin) = @FechaFin
              AND (Ruta IS NULL OR LTRIM(RTRIM(Ruta)) = ''))
    BEGIN
        ROLLBACK TRANSACTION;
        THROW 50112, 'Existen solicitudes sin documentos adjuntos, validar.', 1;
    END;

    IF @IdEstadoActual = 97
        UPDATE dbo.EmpleadoDescanso
        SET IdEstado = 98, IdPre = @IdAprobador, FechaPre = CONVERT(DATE, GETDATE())
        WHERE IdEmpleadoCj = @IdEmpleadoCj AND IdEstado = 97
          AND CONVERT(DATE, FechaInicio) = @FechaInicio AND CONVERT(DATE, FechaFin) = @FechaFin;
    ELSE IF @IdEstadoActual = 98
        UPDATE dbo.EmpleadoDescanso
        SET IdEstado = 99, IdPrimera = @IdAprobador, FechaPrimera = CONVERT(DATE, GETDATE())
        WHERE IdEmpleadoCj = @IdEmpleadoCj AND IdEstado = 98
          AND CONVERT(DATE, FechaInicio) = @FechaInicio AND CONVERT(DATE, FechaFin) = @FechaFin;
    ELSE IF @IdEstadoActual = 99
        UPDATE dbo.EmpleadoDescanso
        SET IdEstado = 100, IdAutorizado = @IdAprobador, FechaAutorizado = CONVERT(DATE, GETDATE())
        WHERE IdEmpleadoCj = @IdEmpleadoCj AND IdEstado = 99
          AND CONVERT(DATE, FechaInicio) = @FechaInicio AND CONVERT(DATE, FechaFin) = @FechaFin;
    ELSE
        UPDATE dbo.EmpleadoDescanso
        SET IdEstado = 5, IdAutorizado = @IdAprobador, FechaAutorizado = CONVERT(DATE, GETDATE())
        WHERE IdEmpleadoCj = @IdEmpleadoCj AND IdEstado = 100
          AND CONVERT(DATE, FechaInicio) = @FechaInicio AND CONVERT(DATE, FechaFin) = @FechaFin;

    SET @Filas = @@ROWCOUNT;

    -- Etapa final: la asistencia del rango queda como descanso aprobado (estado 5), como hacía el formulario original.
    IF @IdEstadoActual = 100 AND @Filas > 0
        UPDATE dbo.Asistencia
        SET IdEstado = 5
        WHERE IdEmpleado = @IdEmpleadoCj
          AND CONVERT(DATE, FechaAsistencia) BETWEEN @FechaInicio AND @FechaFin;

    COMMIT TRANSACTION;

    SELECT @Filas AS Filas;
END;
GO

/* 5) Rechaza una solicitud (IdEstado 97, 98, 99 o 4 -> 0, IdActivo 0) y graba el motivo en Observacion.
      Devuelve los días actualizados. */
CREATE OR ALTER PROCEDURE dbo.sp_Descanso_Rechazar
(
    @IdEmpleadoCj INT,
    @FechaInicio  DATE,
    @FechaFin     DATE,
    @IdRechazo    INT,
    @Observacion  NVARCHAR(500)
)
AS
BEGIN
    SET NOCOUNT ON;

    IF @Observacion IS NULL OR LTRIM(RTRIM(@Observacion)) = ''
        THROW 50113, 'Debe ingresar el motivo del rechazo.', 1;

    UPDATE dbo.EmpleadoDescanso
    SET IdEstado = 0,
        IdActivo = 0,
        Observacion = LTRIM(RTRIM(@Observacion)),
        IdRechazo = @IdRechazo,
        FechaRechazo = CONVERT(DATE, GETDATE())
    WHERE IdEmpleadoCj = @IdEmpleadoCj
      AND IdEstado IN (4, 97, 98, 99)
      AND CONVERT(DATE, FechaInicio) = @FechaInicio
      AND CONVERT(DATE, FechaFin) = @FechaFin;

    SELECT @@ROWCOUNT AS Filas;
END;
GO

/* 6) Datos de la carta PDF de una solicitud. */
CREATE OR ALTER PROCEDURE dbo.sp_Descanso_Carta
(
    @IdEmpleadoCj INT,
    @FechaInicio  DATE,
    @FechaFin     DATE
)
AS
BEGIN
    SET NOCOUNT ON;

    SELECT TOP (1)
        b.IdEmpleado                    AS IdEmpleadoCj,
        b.NombreEmpleado,
        b.NroDocumento,
        e.ValorIni                      AS NombreCliente,       -- empresa (EMPRESA_CJ)
        CONVERT(DATE, a.FechaInicio)    AS FechaInicio,
        CONVERT(DATE, a.FechaFin)       AS FechaFin,
        (SELECT COUNT(*) FROM dbo.EmpleadoDescanso x
          WHERE x.IdEmpleadoCj = a.IdEmpleadoCj
            AND CONVERT(DATE, x.FechaInicio) = CONVERT(DATE, a.FechaInicio)
            AND CONVERT(DATE, x.FechaFin) = CONVERT(DATE, a.FechaFin)
            AND x.IdEstado = a.IdEstado) AS Dias,
        pre.NombreEmpleado              AS PreAprobador,
        pri.NombreEmpleado              AS PrimAprobador,
        aut.NombreEmpleado              AS Autorizado
    FROM dbo.EmpleadoDescanso a
    JOIN dbo.EmpleadoCj b               ON a.IdEmpleadoCj = b.IdEmpleado
    LEFT JOIN dbo.EmpleadoCjDetalle d   ON b.IdEmpleado = d.IdEmpleadoCj
    LEFT JOIN dbo.Constante e           ON e.Campo = 'EMPRESA_CJ' AND d.IdEmpresaCj = e.Correlativo
    LEFT JOIN dbo.EmpleadoCj pre        ON a.IdPre = pre.IdEmpleado
    LEFT JOIN dbo.EmpleadoCj pri        ON a.IdPrimera = pri.IdEmpleado
    LEFT JOIN dbo.EmpleadoCj aut        ON a.IdAutorizado = aut.IdEmpleado
    WHERE a.IdEmpleadoCj = @IdEmpleadoCj
      AND CONVERT(DATE, a.FechaInicio) = @FechaInicio
      AND CONVERT(DATE, a.FechaFin) = @FechaFin
    ORDER BY a.IdEstado;
END;
GO
