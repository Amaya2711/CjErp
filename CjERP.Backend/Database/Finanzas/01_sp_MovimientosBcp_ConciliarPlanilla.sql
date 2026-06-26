CREATE OR ALTER PROCEDURE [dbo].[sp_MovimientosBcp_ConciliarPlanilla]
(
    @IdCargo     INT,
    @IdEmpleado  INT,
    @Estados     VARCHAR(50),
    @FechaInicio DATE = NULL,
    @FechaFin    DATE = NULL,
    @IdActivo    BIT = 1
)
AS
BEGIN
    SET NOCOUNT ON;

    CREATE TABLE #PlanillaEstados
    (
        FecIngreso         VARCHAR(10) NULL,
        Detalle            VARCHAR(MAX) NULL,
        Cuenta             VARCHAR(250) NULL,
        CuentaInter        VARCHAR(250) NULL,
        Bien               VARCHAR(250) NULL,
        Comprobante        VARCHAR(250) NULL,
        Banco              VARCHAR(250) NULL,
        RUC                VARCHAR(50) NULL,
        Moneda             VARCHAR(100) NULL,
        Subtotal           DECIMAL(18, 2) NULL,
        IGV                DECIMAL(18, 2) NULL,
        Total              DECIMAL(18, 2) NULL,
        Comentario         VARCHAR(MAX) NULL,
        Solicitante        VARCHAR(250) NULL,
        GEstor             VARCHAR(250) NULL,
        Validador          VARCHAR(250) NULL,
        FechaDeposito      VARCHAR(10) NULL,
        Estado             INT NULL,
        Corre              INT NULL,
        IdProyecto         INT NULL,
        Correlativo        INT NULL,
        IdResponsable      INT NULL,
        IdSite             INT NULL,
        Usuario            VARCHAR(100) NULL,
        Ot                 VARCHAR(100) NULL,
        IdCliente          INT NULL,
        IdBien             INT NULL,
        IdComprobante      INT NULL,
        IdTipoPago         INT NULL,
        TipoMoneda         INT NULL,
        IdRendicion        INT NULL,
        IdSolicitante      INT NULL,
        IdValidador        INT NULL,
        HoraCreacion       DATETIME NULL,
        NomResponsable     VARCHAR(250) NULL,
        IdTipoDoc          INT NULL,
        Fila               INT NULL,
        IdTransferencia    INT NULL,
        NombreProyecto     VARCHAR(250) NULL,
        Site               VARCHAR(250) NULL,
        CorSite            INT NULL,
        Tipo_Trabajo       VARCHAR(250) NULL,
        Responsable        VARCHAR(250) NULL,
        Cliente            VARCHAR(250) NULL,
        IdOc               INT NULL,
        TotalPagar         DECIMAL(18, 2) NULL,
        IdTarea            INT NULL,
        imgFactura         VARCHAR(MAX) NULL,
        idprovisional      INT NULL,
        fechaInicio        DATETIME NULL,
        NombreEstado       VARCHAR(250) NULL,
        serie              VARCHAR(50) NULL,
        NroOperacion       VARCHAR(50) NULL
    );

    INSERT INTO #PlanillaEstados
    EXEC dbo.sp_Planilla_Consulta_Estados
        @IdCargo     = @IdCargo,
        @IdEmpleado  = @IdEmpleado,
        @Estados     = @Estados,
        @FechaInicio = @FechaInicio,
        @FechaFin    = @FechaFin;

    ;WITH MovimientosBase AS
    (
        SELECT
            m.IdMovimientoBanco,
            m.Empresa,
            m.Cuenta,
            m.Moneda,
            m.Fecha,
            m.DescripcionOperacion,
            m.Monto,
            m.NroOperacion,
            m.SucursalAgencia,
            m.EstadoConciliacion,
            m.TipoMovimientoBanco,
            m.IdActivo
        FROM dbo.MovimientosBcp m
        WHERE (@FechaInicio IS NULL OR m.Fecha >= @FechaInicio)
          AND (@FechaFin IS NULL OR m.Fecha <= @FechaFin)
          AND (@IdActivo IS NULL OR m.IdActivo = @IdActivo)
    ),
    MovimientosNormalizados AS
    (
        SELECT
            m.*,
            LTRIM(RTRIM(ISNULL(m.NroOperacion, ''))) AS NroOperacionNormalizado,
            ISNULL(digits.DescripcionNumerica, '') AS DescripcionNumerica
        FROM MovimientosBase m
        OUTER APPLY
        (
            SELECT DescripcionNumerica =
            (
                SELECT '' + SUBSTRING(ISNULL(m.DescripcionOperacion, ''), seq.N, 1)
                FROM
                (
                    SELECT TOP (LEN(ISNULL(m.DescripcionOperacion, '')))
                        ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) AS N
                    FROM sys.all_objects
                ) seq
                WHERE SUBSTRING(ISNULL(m.DescripcionOperacion, ''), seq.N, 1) LIKE '[0-9]'
                ORDER BY seq.N
                FOR XML PATH(''), TYPE
            ).value('.', 'varchar(500)')
        ) digits
    ),
    PlanillaNormalizada AS
    (
        SELECT
            p.*,
            LTRIM(RTRIM(ISNULL(p.NroOperacion, ''))) AS NroOperacionNormalizado,
            TRY_CONVERT(DATE, p.FechaDeposito, 103) AS FechaDepositoOrden,
            ISNULL(cuenta.CuentaNumerica, '') AS CuentaNumerica,
            ISNULL(cuentaInter.CuentaInterNumerica, '') AS CuentaInterNumerica
        FROM #PlanillaEstados p
        OUTER APPLY
        (
            SELECT CuentaNumerica =
            (
                SELECT '' + SUBSTRING(ISNULL(p.Cuenta, ''), seq.N, 1)
                FROM
                (
                    SELECT TOP (LEN(ISNULL(p.Cuenta, '')))
                        ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) AS N
                    FROM sys.all_objects
                ) seq
                WHERE SUBSTRING(ISNULL(p.Cuenta, ''), seq.N, 1) LIKE '[0-9]'
                ORDER BY seq.N
                FOR XML PATH(''), TYPE
            ).value('.', 'varchar(250)')
        ) cuenta
        OUTER APPLY
        (
            SELECT CuentaInterNumerica =
            (
                SELECT '' + SUBSTRING(ISNULL(p.CuentaInter, ''), seq.N, 1)
                FROM
                (
                    SELECT TOP (LEN(ISNULL(p.CuentaInter, '')))
                        ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) AS N
                    FROM sys.all_objects
                ) seq
                WHERE SUBSTRING(ISNULL(p.CuentaInter, ''), seq.N, 1) LIKE '[0-9]'
                ORDER BY seq.N
                FOR XML PATH(''), TYPE
            ).value('.', 'varchar(250)')
        ) cuentaInter
    )
    SELECT
        m.IdMovimientoBanco,
        m.Empresa,
        m.Cuenta,
        m.Moneda,
        m.Fecha,
        m.DescripcionOperacion,
        m.Monto,
        m.NroOperacion,
        m.SucursalAgencia,
        m.EstadoConciliacion,
        m.TipoMovimientoBanco,
        m.IdActivo,
        ISNULL(match.ResultadoConciliacion, 'SIN COINCIDENCIA') AS ResultadoConciliacion,
        match.TipoCoincidencia,
        match.NroOperacionPlanilla,
        match.CuentaPlanilla,
        match.CuentaInterPlanilla,
        match.IdRegistroPlanilla,
        ISNULL(match.ObservacionConciliacion, 'No se encontro coincidencia con planilla.') AS ObservacionConciliacion
    FROM MovimientosNormalizados m
    OUTER APPLY
    (
        SELECT TOP (1)
            candidate.ResultadoConciliacion,
            candidate.TipoCoincidencia,
            candidate.NroOperacionPlanilla,
            candidate.CuentaPlanilla,
            candidate.CuentaInterPlanilla,
            candidate.IdRegistroPlanilla,
            candidate.ObservacionConciliacion
        FROM
        (
            SELECT
                1 AS Prioridad,
                'COINCIDENCIA POR NRO OPERACION' AS ResultadoConciliacion,
                'NRO OPERACION' AS TipoCoincidencia,
                p.NroOperacion AS NroOperacionPlanilla,
                p.Cuenta AS CuentaPlanilla,
                p.CuentaInter AS CuentaInterPlanilla,
                p.Corre AS IdRegistroPlanilla,
                CONCAT('Coincidencia exacta por NroOperacion: ', p.NroOperacion) AS ObservacionConciliacion,
                ISNULL(p.Corre, 0) AS OrdenPlanilla
            FROM PlanillaNormalizada p
            WHERE m.NroOperacionNormalizado <> ''
              AND p.NroOperacionNormalizado = m.NroOperacionNormalizado

            UNION ALL

            SELECT
                2 AS Prioridad,
                'COINCIDENCIA POR CUENTA' AS ResultadoConciliacion,
                'CUENTA' AS TipoCoincidencia,
                p.NroOperacion AS NroOperacionPlanilla,
                p.Cuenta AS CuentaPlanilla,
                p.CuentaInter AS CuentaInterPlanilla,
                p.Corre AS IdRegistroPlanilla,
                CONCAT('Coincidencia por Cuenta dentro de DescripcionOperacion: ', p.Cuenta) AS ObservacionConciliacion,
                ISNULL(p.Corre, 0) AS OrdenPlanilla
            FROM PlanillaNormalizada p
            WHERE m.DescripcionNumerica <> ''
              AND p.CuentaNumerica <> ''
              AND
              (
                    p.CuentaNumerica LIKE '%' + m.DescripcionNumerica + '%'
                 OR m.DescripcionNumerica LIKE '%' + p.CuentaNumerica + '%'
              )

            UNION ALL

            SELECT
                3 AS Prioridad,
                'COINCIDENCIA POR CUENTA INTER' AS ResultadoConciliacion,
                'CUENTA INTER' AS TipoCoincidencia,
                p.NroOperacion AS NroOperacionPlanilla,
                p.Cuenta AS CuentaPlanilla,
                p.CuentaInter AS CuentaInterPlanilla,
                p.Corre AS IdRegistroPlanilla,
                CONCAT('Coincidencia por CuentaInter dentro de DescripcionOperacion: ', p.CuentaInter) AS ObservacionConciliacion,
                ISNULL(p.Corre, 0) AS OrdenPlanilla
            FROM PlanillaNormalizada p
            WHERE m.DescripcionNumerica <> ''
              AND p.CuentaInterNumerica <> ''
              AND
              (
                    p.CuentaInterNumerica LIKE '%' + m.DescripcionNumerica + '%'
                 OR m.DescripcionNumerica LIKE '%' + p.CuentaInterNumerica + '%'
              )
        ) candidate
        ORDER BY candidate.Prioridad, candidate.OrdenPlanilla
    ) match
    ORDER BY m.Fecha DESC, m.Empresa, m.Moneda, m.NroOperacion;
END;
