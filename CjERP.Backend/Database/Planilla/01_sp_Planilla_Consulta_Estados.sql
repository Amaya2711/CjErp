ALTER PROCEDURE [dbo].[sp_Planilla_Consulta_Estados]
(
    @IdCargo        INT = NULL,
    @IdEmpleado     INT = NULL,
    @IdValidador    INT = NULL,
    @IdBanco        INT = NULL,
    @Estados        VARCHAR(50),
    @OT             VARCHAR(50) = NULL,
    @IdOc           VARCHAR(50) = NULL,
    @Fila           VARCHAR(50) = NULL,
    @IdSite         VARCHAR(50) = NULL,
    @CorSite        VARCHAR(50) = NULL,
    @FechaInicio    DATE = NULL,
    @FechaFin       DATE = NULL,
    @FechaDeposito  DATE = NULL
)
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @FiltrarPorSolicitante BIT = CASE WHEN @IdEmpleado IS NULL THEN 0 ELSE 1 END;
    DECLARE @IdEmpleado2 VARCHAR(MAX) = '0';
    DECLARE @IncluyeEstado4 BIT = 0;
    DECLARE @EstadosFiltro TABLE (Estado INT PRIMARY KEY);
    DECLARE @EmpleadosFiltro TABLE (IdEmpleado INT PRIMARY KEY);

    INSERT INTO @EstadosFiltro (Estado)
    SELECT DISTINCT TRY_CAST(LTRIM(RTRIM(value)) AS INT)
    FROM STRING_SPLIT(@Estados, ',')
    WHERE TRY_CAST(LTRIM(RTRIM(value)) AS INT) IS NOT NULL;

    IF @IdEmpleado IS NOT NULL
    BEGIN
        SELECT @IdEmpleado2 =
            ISNULL(
                STRING_AGG(CONVERT(VARCHAR(20), b.IdEmpleado), ','),
                '0'
            )
        FROM EmpleadoCj a
        LEFT JOIN Empleado b
            ON a.IdEmpleado = b.IdEmpleadoCj
        WHERE a.IdEmpleado = @IdEmpleado
          AND b.IdEmpleado IS NOT NULL;
    END;

    IF EXISTS (
        SELECT 1
        FROM dbo.Constante
        WHERE Campo = 'PERMISOS'
          AND (
                TRY_CONVERT(INT, Correlativo) = @IdCargo
             OR TRY_CONVERT(INT, ValorIni) = @IdCargo
          )
    )
    BEGIN
        SET @FiltrarPorSolicitante = 0;
    END;

    IF EXISTS (
        SELECT 1
        FROM @EstadosFiltro
        WHERE Estado = 4
    )
    BEGIN
        SET @IncluyeEstado4 = 1;
    END;

    INSERT INTO @EmpleadosFiltro (IdEmpleado)
    SELECT DISTINCT TRY_CAST(LTRIM(RTRIM(value)) AS INT)
    FROM STRING_SPLIT(@IdEmpleado2, ',')
    WHERE TRY_CAST(LTRIM(RTRIM(value)) AS INT) IS NOT NULL;

    ;WITH PlanillaBancoAgrupada AS
    (
        SELECT
            LTRIM(RTRIM(p.NroOperacion)) AS NroOperacion,
            STRING_AGG(CONVERT(VARCHAR(20), p.Correlativo), ', ') WITHIN GROUP (ORDER BY p.Correlativo) AS Correlativos,
            SUM(ABS(ISNULL(p.MontoRetencion, 0))) AS MontoRetencionAgrupado,
            -SUM(ABS(ISNULL(p.TotalPagar, 0))) AS TotalPagarAgrupado
        FROM Planilla p
        INNER JOIN Constante banAgrupado
            ON banAgrupado.Sociedad = 'PE01'
           AND banAgrupado.Programa = 'PLANTILLA'
           AND banAgrupado.Campo = 'BANCO'
           AND p.IdBanco = banAgrupado.Correlativo
        WHERE
            UPPER(LTRIM(RTRIM(ISNULL(banAgrupado.ValorIni, '')))) LIKE '%SCOTI%'
            OR UPPER(LTRIM(RTRIM(ISNULL(banAgrupado.ValorIni, '')))) LIKE '%BCP%'
        GROUP BY LTRIM(RTRIM(p.NroOperacion))
    )

    SELECT DISTINCT
        CONVERT(VARCHAR(10), a.FecIngreso, 103) AS FecIngreso,
        CAST(a.Detalle AS VARCHAR(MAX)) AS Detalle,
        a4.cuenta AS Cuenta,
        a4.cuentainter AS CuentaInter,
        h.ValorIni AS Bien,
        i.ValorIni AS Comprobante,
        ban.ValorIni AS Banco,
        f_emp.NroDocumento AS RUC,
        k.ValorIni AS Moneda,
        CASE
            WHEN a.TipoMoneda = 1 THEN a.Subtotal
            ELSE a.Subtotal * 3.8
        END AS Subtotal,
        CASE
            WHEN a.TipoMoneda = 1 THEN a.Igv
            ELSE a.Igv * 3.8
        END AS IGV,
        CASE
            WHEN a.TipoMoneda = 1 THEN a.Total
            ELSE a.Total * 3.8
        END AS Total,
        a.Comentario,
        CASE
            WHEN ISNULL(a.IdWeb, 0) = 1 THEN m_cj.NombreEmpleado
            ELSE m_emp.NombreEmpleado
        END AS Solicitante,
        CASE
            WHEN ISNULL(a.IdWeb, 0) = 1 THEN p_cj.NombreEmpleado
            ELSE p_emp.NombreEmpleado
        END AS GEstor,
        CASE
            WHEN ISNULL(a.IdWeb, 0) = 1 THEN o_cj.NombreEmpleado
            ELSE o_emp.NombreEmpleado
        END AS Validador,
        CONVERT(VARCHAR(10), a.FechaDeposito, 103) AS FechaDeposito,
        a.Estado,
        a.Correlativo AS Corre,
        a.IdProyecto,
        w.Correlativo,
        a.IdResponsable,
        a.IdSite,
        a.Usuario,
        a.Ot,
        a.IdCliente,
        a.IdBien,
        a.IdComprobante,
        a.IdTipoPago,
        a.TipoMoneda,
        a.IdRendicion,
        a.IdSolicitante,
        a.IdValidador,
        a.HoraCreacion,
        a.Responsable AS NomResponsable,
        a.IdTipoDoc,
        a.Fila,
        a.IdTransferencia,
        b.NombreProyecto,
        c.NombreSite AS Site,
        CASE
            WHEN c.Correlativo IS NULL THEN 1
            ELSE c.Correlativo
        END AS CorSite,
        a.Tipo_Trabajo,
        f_emp.NombreEmpleado AS Responsable,
        g.NombreCliente AS Cliente,
        a.IdOc,
        a.MontoRetencion,
        a.TotalPagar AS TotalPagarOriginal,
        CASE
            WHEN UPPER(LTRIM(RTRIM(ISNULL(ban.ValorIni, '')))) LIKE '%SCOTI%'
                THEN pa.TotalPagarAgrupado
            ELSE a.TotalPagar
        END AS TotalPlanillaBase,
        CASE
            WHEN UPPER(LTRIM(RTRIM(ISNULL(ban.ValorIni, '')))) LIKE '%SCOTI%'
                THEN pa.TotalPagarAgrupado
            ELSE a.TotalPagar
        END AS TotalPagar,
        a.IdTarea,
        a.imgFactura,
        a.idprovisional,
        s1.fechaInicio,
        w.ValorIni AS NombreEstado,
        a.serie,
        a.NroOperacion
    FROM Planilla a
    LEFT JOIN CuentaEmpleado a4
        ON a4.IdEmpleado = a.IdResponsable
    LEFT JOIN Constante e
        ON e.Sociedad = 'PE01'
       AND e.Programa = 'PLANTILLA'
       AND e.Campo = 'TAREA'
       AND a.IdTarea = e.Correlativo
    LEFT JOIN Empleado f_emp
        ON f_emp.IdEmpleado = a.IdResponsable
       AND f_emp.IdCargo IN (10, 11, 83)
    LEFT JOIN Cliente g
        ON g.IdCliente = a.IdCliente
    LEFT JOIN Constante h
        ON h.Sociedad = 'PE01'
       AND h.Programa = 'PLANTILLA'
       AND h.Campo = 'TIPO_BIEN'
       AND a.IdBien = h.Correlativo
    LEFT JOIN Constante i
        ON i.Sociedad = 'PE01'
       AND i.Programa = 'PLANTILLA'
       AND i.Campo = 'TIPO_COMPROBANTE'
       AND a.IdComprobante = i.Correlativo
    LEFT JOIN Constante ban
        ON ban.Sociedad = 'PE01'
       AND ban.Programa = 'PLANTILLA'
       AND ban.Campo = 'BANCO'
       AND a.IdBanco = ban.Correlativo
        LEFT JOIN PlanillaBancoAgrupada pa
            ON pa.NroOperacion = LTRIM(RTRIM(a.NroOperacion))
    LEFT JOIN Constante j
        ON j.Sociedad = 'PE01'
       AND j.Programa = 'PLANTILLA'
       AND j.Campo = 'TIPO_PAGO'
       AND a.IdTipoPago = j.Correlativo
    LEFT JOIN Constante k
        ON k.Sociedad = 'PE01'
       AND k.Programa = 'PLANTILLA'
       AND k.Campo = 'TIPO_MONEDA'
       AND a.TipoMoneda = k.Correlativo
    LEFT JOIN Constante l
        ON l.Sociedad = 'PE01'
       AND l.Programa = 'PLANTILLA'
       AND l.Campo = 'RENDICION'
       AND a.IdRendicion = l.Correlativo
    LEFT JOIN Empleado m_emp
        ON m_emp.IdEmpleado = a.IdSolicitante
       AND ISNULL(a.IdWeb, 0) <> 1
    LEFT JOIN EmpleadoCj m_cj
        ON m_cj.IdEmpleado = a.IdSolicitante
       AND ISNULL(a.IdWeb, 0) = 1
    LEFT JOIN Empleado o_emp
        ON o_emp.IdEmpleado = a.IdValidador
       AND ISNULL(a.IdWeb, 0) <> 1
    LEFT JOIN EmpleadoCj o_cj
        ON o_cj.IdEmpleado = a.IdValidador
       AND ISNULL(a.IdWeb, 0) = 1
    LEFT JOIN Empleado p_emp
        ON p_emp.IdEmpleado = a.IdGestor
       AND ISNULL(a.IdWeb, 0) <> 1
    LEFT JOIN EmpleadoCj p_cj
        ON p_cj.IdEmpleado = a.IdGestor
       AND ISNULL(a.IdWeb, 0) = 1
    LEFT JOIN Constante w
        ON w.Sociedad = 'PE01'
       AND w.Programa = 'MAESTRO'
       AND w.Campo = 'ESTADO'
       AND a.Estado = w.Correlativo
    LEFT JOIN Site c
        ON a.IdSite = c.IdSite
       AND a.CorreSite = c.Correlativo
    LEFT JOIN EmpleadoCj z
        ON a.IdSolicitante = z.IdEmpleado
    LEFT JOIN Empleado z1
        ON a.IdSolicitante = z1.IdEmpleado
    LEFT JOIN Suministro_provisional s1
        ON a.idprovisional = s1.idprovisional
    INNER JOIN Proyecto b
        ON a.IdProyecto = b.IdProyecto
    WHERE EXISTS (
        SELECT 1
        FROM @EstadosFiltro estadoFiltro
        WHERE estadoFiltro.Estado = a.Estado
    )
    AND (@IdValidador IS NULL OR a.IdValidador = @IdValidador)
    AND (
        @IdBanco IS NULL
        OR a.IdBanco = @IdBanco
    )
    AND (
        @FechaInicio IS NULL
        OR (
            @IncluyeEstado4 = 1
            AND a.FechaDeposito IS NOT NULL
            AND a.FechaDeposito >= @FechaInicio
        )
        OR (
            @IncluyeEstado4 = 0
            AND a.FecIngreso >= @FechaInicio
        )
    )
    AND (
        @FechaFin IS NULL
        OR (
            @IncluyeEstado4 = 1
            AND a.FechaDeposito IS NOT NULL
            AND a.FechaDeposito < DATEADD(DAY, 1, @FechaFin)
        )
        OR (
            @IncluyeEstado4 = 0
            AND a.FecIngreso < DATEADD(DAY, 1, @FechaFin)
        )
    )
    AND (
        @FechaDeposito IS NULL
        OR (
            a.FechaDeposito IS NOT NULL
            AND a.FechaDeposito >= @FechaDeposito
            AND a.FechaDeposito < DATEADD(DAY, 1, @FechaDeposito)
        )
    )
    AND (
        @OT IS NULL
        OR LTRIM(RTRIM(ISNULL(a.Ot, ''))) = LTRIM(RTRIM(@OT))
    )
    AND (
        @IdOc IS NULL
        OR LTRIM(RTRIM(ISNULL(a.IdOc, ''))) = LTRIM(RTRIM(@IdOc))
    )
    AND (
        @Fila IS NULL
        OR LTRIM(RTRIM(ISNULL(CONVERT(VARCHAR(50), a.Fila), ''))) = LTRIM(RTRIM(@Fila))
    )
    AND (
        @IdSite IS NULL
        OR LTRIM(RTRIM(ISNULL(a.IdSite, ''))) = LTRIM(RTRIM(@IdSite))
    )
    AND (
        @CorSite IS NULL
        OR a.CorreSite = TRY_CONVERT(INT, @CorSite)
    )
    AND (
        @FiltrarPorSolicitante = 0
        OR (
            ISNULL(a.IdWeb, 0) = 1
            AND z.IdEmpleado = @IdEmpleado
        )
        OR (
            ISNULL(a.IdWeb, 0) <> 1
            AND EXISTS (
                SELECT 1
                FROM @EmpleadosFiltro empleadoFiltro
                WHERE empleadoFiltro.IdEmpleado = z1.IdEmpleado
            )
        )
    )
    ORDER BY a.Correlativo DESC
    OPTION (RECOMPILE);
END;
