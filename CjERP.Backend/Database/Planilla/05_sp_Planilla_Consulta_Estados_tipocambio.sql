/* ================================================================
   sp_Planilla_Consulta_Estados
   1) Restaura la compatibilidad con los parametros de tipo de cambio que
      envian pagos_v1, pagos_v2 e Historial (TipoCambioUSD / EUR / DOP / COP).
      El script 04 los dejo fuera y el SP respondia 500:
      "@TipoCambioUSD is not a parameter for procedure".
   2) Agrega SumaEmp ("SumaResp." del legado FrmAdmPago) para la pestana
      "Suma responsable" de pagos_v2:
        SumaEmp = SUM(Subtotal) de Planilla con Estado IN (4,6,0), mismo
                  IdCliente/IdProyecto/IdSite/CorreSite/Tipo_Trabajo/IdTarea/
                  IdResponsable que la fila, convertido a soles con el tipo
                  de cambio de la pantalla segun TipoMoneda:
                  1 SOLES x1 | 2 DOLARES x@TipoCambioUSD | 3 EUROS x@TipoCambioEUR
                  4 PESO DOMINICANO x@TipoCambioDOP | 5 PESO COLOMBIANO x@TipoCambioCOP
      Si el parametro llega NULL/<=0 se usan los valores por defecto de la
      pantalla (USD 3.80, EUR 3.80, DOP 0.057, COP 0.001).
      Columnas nuevas: SumaEmp, SumaEmpSolesNativo, SumaEmpUsdNativo,
      SumaEmpEurNativo, SumaEmpDopNativo, SumaEmpCopNativo, CantRecibosEmp,
      SubtotalOriginal, IgvOriginal, TotalOriginal (montos en moneda nativa).
      Subtotal/IGV/Total salen en la moneda REAL del recibo (los scripts 01/04
      los convertian x3.8 cuando TipoMoneda <> 1, lo que mostraba 8,260.86 para un
      recibo de US$ 2,173.91). El equivalente en soles va en SubtotalSoles,
      IGVSoles y TotalSoles, con el tipo de cambio de la pantalla.
      TotalOcConsumo / PagadoOcConsumo: total de la OC (CabOrdenCompra.Subtotal) y pagado
      (Planilla.Estado = 4 de esa OC); con ellos pagos_v2 muestra la columna "% OC".
      EstadoOcSemaforo: semaforo de la OC (R/A/3/2/1/P) para la columna Est. de la grilla.
      Tarea: se devuelve el nombre de la tarea (Constante TAREA, join e); los scripts
      01/04 solo devolvian IdTarea y la columna Tarea de pagos_v2 salia vacia.
      RENDIMIENTO: SumaEmp agrupa todo Planilla en estados 4/6/0, asi que solo se
      calcula con @IncluirSumaResp = 1 (lo envia la pestana "Suma responsable").
      Con 0 (por defecto) las bandejas no pagan ese costo y las columnas SumaEmp*
      salen en 0.
   Base = script 04 (version 01 + ObservacionPlanilla).
   PV: la version vigente antes del 15/10 (no versionada) pudo calcular otras
   columnas con estos parametros; validar contra el frontend.
   Idempotente. Ejecutar en JC_Db.
   ================================================================ */
USE JC_Db;
GO
CREATE OR ALTER PROCEDURE [dbo].[sp_Planilla_Consulta_Estados]
(
    @IdCargo        INT = NULL,
    @IdEmpleado     INT = NULL,
    @IdValidador    INT = NULL,
    @IdBanco        INT = NULL,
    @Estados        VARCHAR(50) = NULL,
    @OT             VARCHAR(50) = NULL,
    @IdOc           VARCHAR(50) = NULL,
    @Fila           VARCHAR(50) = NULL,
    @IdSite         VARCHAR(50) = NULL,
    @CorSite        VARCHAR(50) = NULL,
    @IdCliente      INT = NULL,
    @IdProyecto     INT = NULL,
    @TipoTrabajo    VARCHAR(150) = NULL,
    @FechaInicio    DATE = NULL,
    @FechaFin       DATE = NULL,
    @FechaDeposito  DATE = NULL,
    @TextoBusqueda  VARCHAR(200) = NULL,
    @Correlativo    INT = NULL,
    @TipoCambioUSD  DECIMAL(18, 6) = NULL,
    @TipoCambioEUR  DECIMAL(18, 6) = NULL,
    @TipoCambioDOP  DECIMAL(18, 6) = NULL,
    @TipoCambioCOP  DECIMAL(18, 6) = NULL,
    @IncluirSumaResp BIT = 0
)
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @FiltrarPorSolicitante BIT = CASE WHEN @IdEmpleado IS NULL THEN 0 ELSE 1 END;
    DECLARE @IdEmpleado2 VARCHAR(MAX) = '0';
    DECLARE @IncluyeEstado4 BIT = 0;
    DECLARE @EstadosFiltro TABLE (Estado INT PRIMARY KEY);
    DECLARE @EmpleadosFiltro TABLE (IdEmpleado INT PRIMARY KEY);

    -- Tipos de cambio a soles (los de la pantalla; por defecto los de pagos_v2).
    DECLARE @TcUsd DECIMAL(18, 6) = CASE WHEN ISNULL(@TipoCambioUSD, 0) > 0 THEN @TipoCambioUSD ELSE 3.80 END;
    DECLARE @TcEur DECIMAL(18, 6) = CASE WHEN ISNULL(@TipoCambioEUR, 0) > 0 THEN @TipoCambioEUR ELSE 3.80 END;
    DECLARE @TcDop DECIMAL(18, 6) = CASE WHEN ISNULL(@TipoCambioDOP, 0) > 0 THEN @TipoCambioDOP ELSE 0.057 END;
    DECLARE @TcCop DECIMAL(18, 6) = CASE WHEN ISNULL(@TipoCambioCOP, 0) > 0 THEN @TipoCambioCOP ELSE 0.001 END;

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
    ),
    PlanillaOTTotales AS
    (
        SELECT
            LTRIM(RTRIM(ISNULL(CONVERT(VARCHAR(50), p.OT), ''))) AS OT,
            p.IdCliente, p.IdProyecto,
            LTRIM(RTRIM(ISNULL(CONVERT(VARCHAR(50), p.IdSite), ''))) AS IdSite,
            ISNULL(p.CorreSite, 0) AS CorreSite,
            LTRIM(RTRIM(ISNULL(p.Tipo_Trabajo, ''))) AS TipoTrabajo,
            p.TipoMoneda,
            CAST(SUM(ISNULL(p.Subtotal, 0)) AS DECIMAL(18, 2)) AS TotalSubtotalPorMoneda
        FROM dbo.Planilla p
        WHERE p.Estado = 4
          AND UPPER(LTRIM(RTRIM(ISNULL(CONVERT(VARCHAR(50), p.OT), '')))) NOT IN ('', '0', 'NULL')
          AND (@OT IS NULL OR p.OT = @OT)
          AND (@IdCliente IS NULL OR p.IdCliente = @IdCliente)
          AND (@IdProyecto IS NULL OR p.IdProyecto = @IdProyecto)
          AND (@IdSite IS NULL OR LTRIM(RTRIM(ISNULL(CONVERT(VARCHAR(50), p.IdSite), ''))) = LTRIM(RTRIM(@IdSite)))
          AND (@CorSite IS NULL OR p.CorreSite = TRY_CONVERT(INT, @CorSite))
          AND (@TipoTrabajo IS NULL OR LTRIM(RTRIM(ISNULL(p.Tipo_Trabajo, ''))) = LTRIM(RTRIM(@TipoTrabajo)))
        GROUP BY LTRIM(RTRIM(ISNULL(CONVERT(VARCHAR(50), p.OT), ''))), p.IdCliente, p.IdProyecto,
            LTRIM(RTRIM(ISNULL(CONVERT(VARCHAR(50), p.IdSite), ''))), ISNULL(p.CorreSite, 0),
            LTRIM(RTRIM(ISNULL(p.Tipo_Trabajo, ''))), p.TipoMoneda
    ),
    ImportarOTTotales AS
    (
        SELECT
            LTRIM(RTRIM(ISNULL(CONVERT(VARCHAR(50), imp.OT), ''))) AS OT,
            imp.IdCliente, imp.IdProyecto,
            LTRIM(RTRIM(ISNULL(CONVERT(VARCHAR(50), imp.IdSite), ''))) AS IdSite,
            ISNULL(imp.Correlativo, 0) AS CorreSite,
            LTRIM(RTRIM(ISNULL(imp.TipoTrabajo, ''))) AS TipoTrabajo,
            imp.IdMoneda,
            CAST(SUM(ISNULL(imp.Monto_Bck, 0)) AS DECIMAL(18, 2)) AS TotalMontoBckPorMoneda,
            CAST(SUM(ISNULL(imp.Monto_Visible, 0)) AS DECIMAL(18, 2)) AS TotalMontoVisiblePorMoneda
        FROM dbo.Importar imp
        WHERE imp.IdEstado = 1
          AND UPPER(LTRIM(RTRIM(ISNULL(CONVERT(VARCHAR(50), imp.OT), '')))) NOT IN ('', '0', 'NULL')
          AND (@OT IS NULL OR imp.OT = @OT)
          AND (@IdCliente IS NULL OR imp.IdCliente = @IdCliente)
          AND (@IdProyecto IS NULL OR imp.IdProyecto = @IdProyecto)
          AND (@IdSite IS NULL OR LTRIM(RTRIM(ISNULL(CONVERT(VARCHAR(50), imp.IdSite), ''))) = LTRIM(RTRIM(@IdSite)))
          AND (@CorSite IS NULL OR imp.Correlativo = TRY_CONVERT(INT, @CorSite))
          AND (@TipoTrabajo IS NULL OR LTRIM(RTRIM(ISNULL(imp.TipoTrabajo, ''))) = LTRIM(RTRIM(@TipoTrabajo)))
        GROUP BY LTRIM(RTRIM(ISNULL(CONVERT(VARCHAR(50), imp.OT), ''))), imp.IdCliente, imp.IdProyecto,
            LTRIM(RTRIM(ISNULL(CONVERT(VARCHAR(50), imp.IdSite), ''))), ISNULL(imp.Correlativo, 0),
            LTRIM(RTRIM(ISNULL(imp.TipoTrabajo, ''))), imp.IdMoneda
    ),
    OcPagadoTotales AS
    (
        -- Pagado por OC (Planilla.Estado = 4), igual que /facturacionfinanciera/oc/consumo
        -- (OrdenCompraService.BuscarConsumoOcSql). Alimenta "% OC" de la grilla de pagos.
        SELECT
            TRY_CONVERT(INT, NULLIF(LTRIM(RTRIM(CONVERT(VARCHAR(50), p.IdOc))), '')) AS IdOc,
            CAST(SUM(ISNULL(p.Subtotal, 0)) AS DECIMAL(18, 2)) AS PagadoOc
        FROM dbo.Planilla p
        WHERE p.Estado = 4
          AND TRY_CONVERT(INT, NULLIF(LTRIM(RTRIM(CONVERT(VARCHAR(50), p.IdOc))), '')) IS NOT NULL
          AND (@IdCliente IS NULL OR p.IdCliente = @IdCliente)
          AND (@IdProyecto IS NULL OR p.IdProyecto = @IdProyecto)
        GROUP BY TRY_CONVERT(INT, NULLIF(LTRIM(RTRIM(CONVERT(VARCHAR(50), p.IdOc))), ''))
    ),
    PlanillaResponsableTotales AS
    (
        -- "Suma responsable" del legado (SumaEmp): subtotales por moneda de los
        -- recibos 4 (pagado), 6 y 0 del mismo responsable en la misma tarea.
        SELECT
            ISNULL(p.IdCliente, 0) AS IdCliente,
            ISNULL(p.IdProyecto, 0) AS IdProyecto,
            LTRIM(RTRIM(ISNULL(CONVERT(VARCHAR(50), p.IdSite), ''))) AS IdSite,
            ISNULL(p.CorreSite, 0) AS CorreSite,
            LTRIM(RTRIM(ISNULL(p.Tipo_Trabajo, ''))) AS TipoTrabajo,
            ISNULL(p.IdTarea, 0) AS IdTarea,
            ISNULL(p.IdResponsable, 0) AS IdResponsable,
            CAST(SUM(CASE WHEN p.TipoMoneda = 1 THEN ISNULL(p.Subtotal, 0) ELSE 0 END) AS DECIMAL(18, 2)) AS SolesNativo,
            CAST(SUM(CASE WHEN p.TipoMoneda = 2 THEN ISNULL(p.Subtotal, 0) ELSE 0 END) AS DECIMAL(18, 2)) AS UsdNativo,
            CAST(SUM(CASE WHEN p.TipoMoneda = 3 THEN ISNULL(p.Subtotal, 0) ELSE 0 END) AS DECIMAL(18, 2)) AS EurNativo,
            CAST(SUM(CASE WHEN p.TipoMoneda = 4 THEN ISNULL(p.Subtotal, 0) ELSE 0 END) AS DECIMAL(18, 2)) AS DopNativo,
            CAST(SUM(CASE WHEN p.TipoMoneda = 5 THEN ISNULL(p.Subtotal, 0) ELSE 0 END) AS DECIMAL(18, 2)) AS CopNativo,
            COUNT(*) AS CantRecibos
        FROM dbo.Planilla p
        WHERE @IncluirSumaResp = 1
          AND p.Estado IN (4, 6, 0)
          AND p.TipoMoneda IN (1, 2, 3, 4, 5)
          AND (@IdCliente IS NULL OR p.IdCliente = @IdCliente)
          AND (@IdProyecto IS NULL OR p.IdProyecto = @IdProyecto)
          AND (@IdSite IS NULL OR LTRIM(RTRIM(ISNULL(CONVERT(VARCHAR(50), p.IdSite), ''))) = LTRIM(RTRIM(@IdSite)))
          AND (@CorSite IS NULL OR p.CorreSite = TRY_CONVERT(INT, @CorSite))
          AND (@TipoTrabajo IS NULL OR LTRIM(RTRIM(ISNULL(p.Tipo_Trabajo, ''))) = LTRIM(RTRIM(@TipoTrabajo)))
        GROUP BY ISNULL(p.IdCliente, 0), ISNULL(p.IdProyecto, 0),
            LTRIM(RTRIM(ISNULL(CONVERT(VARCHAR(50), p.IdSite), ''))), ISNULL(p.CorreSite, 0),
            LTRIM(RTRIM(ISNULL(p.Tipo_Trabajo, ''))), ISNULL(p.IdTarea, 0), ISNULL(p.IdResponsable, 0)
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
        CAST(ISNULL(pot.TotalSubtotalPorMoneda, 0) AS DECIMAL(18, 2)) AS TotalSubtotalPorMoneda,
        CAST(ISNULL(iot.TotalMontoBckPorMoneda, 0) AS DECIMAL(18, 2)) AS TotalMontoBckPorMoneda,
        CAST(ISNULL(iot.TotalMontoVisiblePorMoneda, 0) AS DECIMAL(18, 2)) AS TotalMontoVisiblePorMoneda,
        -- Subtotal / IGV / Total en la MONEDA REAL del recibo (TipoMoneda <> 1 NO se convierte).
        a.Subtotal AS Subtotal,
        a.Igv AS IGV,
        a.Total AS Total,
        -- Equivalente en soles con el tipo de cambio de la pantalla (moneda no soportada: sin conversion).
        CAST(a.Subtotal * CASE a.TipoMoneda WHEN 2 THEN @TcUsd WHEN 3 THEN @TcEur WHEN 4 THEN @TcDop WHEN 5 THEN @TcCop ELSE 1 END AS DECIMAL(18, 2)) AS SubtotalSoles,
        CAST(a.Igv * CASE a.TipoMoneda WHEN 2 THEN @TcUsd WHEN 3 THEN @TcEur WHEN 4 THEN @TcDop WHEN 5 THEN @TcCop ELSE 1 END AS DECIMAL(18, 2)) AS IGVSoles,
        CAST(a.Total * CASE a.TipoMoneda WHEN 2 THEN @TcUsd WHEN 3 THEN @TcEur WHEN 4 THEN @TcDop WHEN 5 THEN @TcCop ELSE 1 END AS DECIMAL(18, 2)) AS TotalSoles,
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
        COALESCE(NULLIF(LTRIM(RTRIM(w.ValorIni)), ''), CONVERT(VARCHAR(20), a.Estado)) AS EstadoNombre,
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
         coc.IdEstado AS IdEstadoOc,
         -- Semaforo de la OC (columna "Est." de pagos_v1/v2): R rechazada | A aprobada |
         -- 3, 2, 1 = en la N-esima aprobacion | P pre-aprobacion (misma regla que sp_IA_Planilla_Buscar v2).
         CASE
             WHEN coc.IdEstado = 6 THEN 'R'
             WHEN ISNULL(coc.IdAprobador3, 0) > 0 THEN 'A'
             WHEN ISNULL(coc.IdAprobador2, 0) > 0 THEN '3'
             WHEN ISNULL(coc.IdAprobador1, 0) > 0 THEN '2'
             WHEN ISNULL(coc.IdGestor, 0) > 0 THEN '1'
             ELSE 'P'
         END AS EstadoOcSemaforo,
         CAST(COALESCE(coc.Subtotal, 0) AS DECIMAL(18, 2)) AS TotalOcConsumo,
         CAST(ISNULL(ocp.PagadoOc, 0) AS DECIMAL(18, 2)) AS PagadoOcConsumo,
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
        e.ValorIni AS Tarea,
        a.imgFactura,
        a.idprovisional,
        s1.fechaInicio,
        w.ValorIni AS NombreEstado,
        a.serie,
        a.NroOperacion,
        CAST(a.Observacion AS VARCHAR(MAX)) AS ObservacionPlanilla,
        a.Subtotal AS SubtotalOriginal,
        a.Igv AS IgvOriginal,
        a.Total AS TotalOriginal,
        CAST(
            ISNULL(prt.SolesNativo, 0)
            + ISNULL(prt.UsdNativo, 0) * @TcUsd
            + ISNULL(prt.EurNativo, 0) * @TcEur
            + ISNULL(prt.DopNativo, 0) * @TcDop
            + ISNULL(prt.CopNativo, 0) * @TcCop
        AS DECIMAL(18, 2)) AS SumaEmp,
        CAST(ISNULL(prt.SolesNativo, 0) AS DECIMAL(18, 2)) AS SumaEmpSolesNativo,
        CAST(ISNULL(prt.UsdNativo, 0) AS DECIMAL(18, 2)) AS SumaEmpUsdNativo,
        CAST(ISNULL(prt.EurNativo, 0) AS DECIMAL(18, 2)) AS SumaEmpEurNativo,
        CAST(ISNULL(prt.DopNativo, 0) AS DECIMAL(18, 2)) AS SumaEmpDopNativo,
        CAST(ISNULL(prt.CopNativo, 0) AS DECIMAL(18, 2)) AS SumaEmpCopNativo,
        ISNULL(prt.CantRecibos, 0) AS CantRecibosEmp
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
     LEFT JOIN dbo.CabOrdenCompra coc
         ON coc.IdOc = TRY_CONVERT(INT, a.IdOc)
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
    LEFT JOIN PlanillaOTTotales pot
        ON pot.OT = LTRIM(RTRIM(ISNULL(CONVERT(VARCHAR(50), a.OT), '')))
       AND ISNULL(pot.IdCliente, 0) = ISNULL(a.IdCliente, 0)
       AND ISNULL(pot.IdProyecto, 0) = ISNULL(a.IdProyecto, 0)
       AND pot.IdSite = LTRIM(RTRIM(ISNULL(CONVERT(VARCHAR(50), a.IdSite), '')))
       AND pot.CorreSite = ISNULL(a.CorreSite, 0)
       AND pot.TipoTrabajo = LTRIM(RTRIM(ISNULL(a.Tipo_Trabajo, '')))
       AND pot.TipoMoneda = a.TipoMoneda
    LEFT JOIN ImportarOTTotales iot
        ON iot.OT = LTRIM(RTRIM(ISNULL(CONVERT(VARCHAR(50), a.OT), '')))
       AND ISNULL(iot.IdCliente, 0) = ISNULL(a.IdCliente, 0)
       AND ISNULL(iot.IdProyecto, 0) = ISNULL(a.IdProyecto, 0)
       AND iot.IdSite = LTRIM(RTRIM(ISNULL(CONVERT(VARCHAR(50), a.IdSite), '')))
       AND iot.CorreSite = ISNULL(a.CorreSite, 0)
       AND iot.TipoTrabajo = LTRIM(RTRIM(ISNULL(a.Tipo_Trabajo, '')))
       AND iot.IdMoneda = a.TipoMoneda
    LEFT JOIN OcPagadoTotales ocp
        ON ocp.IdOc = coc.IdOc
    LEFT JOIN PlanillaResponsableTotales prt
        ON prt.IdCliente = ISNULL(a.IdCliente, 0)
       AND prt.IdProyecto = ISNULL(a.IdProyecto, 0)
       AND prt.IdSite = LTRIM(RTRIM(ISNULL(CONVERT(VARCHAR(50), a.IdSite), '')))
       AND prt.CorreSite = ISNULL(a.CorreSite, 0)
       AND prt.TipoTrabajo = LTRIM(RTRIM(ISNULL(a.Tipo_Trabajo, '')))
       AND prt.IdTarea = ISNULL(a.IdTarea, 0)
       AND prt.IdResponsable = ISNULL(a.IdResponsable, 0)
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
    WHERE (
        NULLIF(LTRIM(RTRIM(@Estados)), '') IS NULL
        OR EXISTS (
        SELECT 1
        FROM @EstadosFiltro estadoFiltro
        WHERE estadoFiltro.Estado = a.Estado
        )
    )
    AND (@Correlativo IS NULL OR a.Correlativo = @Correlativo)
    AND (@IdValidador IS NULL OR a.IdValidador = @IdValidador)
    AND (
        @IdBanco IS NULL
        OR a.IdBanco = @IdBanco
    )
    AND (
        NULLIF(LTRIM(RTRIM(@TextoBusqueda)), '') IS NOT NULL
        OR
        @FechaInicio IS NULL
        OR (
            @IncluyeEstado4 = 1
            AND a.FechaDeposito IS NOT NULL
            AND COALESCE(TRY_CONVERT(DATE, a.FechaDeposito, 101), TRY_CONVERT(DATE, a.FechaDeposito, 103), TRY_CONVERT(DATE, a.FechaDeposito, 23), TRY_CONVERT(DATE, a.FechaDeposito, 120), TRY_CONVERT(DATE, a.FechaDeposito, 126)) >= @FechaInicio
        )
        OR (
            @IncluyeEstado4 = 0
            AND COALESCE(TRY_CONVERT(DATE, a.FecIngreso, 101), TRY_CONVERT(DATE, a.FecIngreso, 103), TRY_CONVERT(DATE, a.FecIngreso, 23), TRY_CONVERT(DATE, a.FecIngreso, 120), TRY_CONVERT(DATE, a.FecIngreso, 126)) >= @FechaInicio
        )
    )
    AND (
        NULLIF(LTRIM(RTRIM(@TextoBusqueda)), '') IS NOT NULL
        OR
        @FechaFin IS NULL
        OR (
            @IncluyeEstado4 = 1
            AND a.FechaDeposito IS NOT NULL
            AND COALESCE(TRY_CONVERT(DATE, a.FechaDeposito, 101), TRY_CONVERT(DATE, a.FechaDeposito, 103), TRY_CONVERT(DATE, a.FechaDeposito, 23), TRY_CONVERT(DATE, a.FechaDeposito, 120), TRY_CONVERT(DATE, a.FechaDeposito, 126)) < DATEADD(DAY, 1, @FechaFin)
        )
        OR (
            @IncluyeEstado4 = 0
            AND COALESCE(TRY_CONVERT(DATE, a.FecIngreso, 101), TRY_CONVERT(DATE, a.FecIngreso, 103), TRY_CONVERT(DATE, a.FecIngreso, 23), TRY_CONVERT(DATE, a.FecIngreso, 120), TRY_CONVERT(DATE, a.FecIngreso, 126)) < DATEADD(DAY, 1, @FechaFin)
        )
    )
    AND (
        @FechaDeposito IS NULL
        OR (
            a.FechaDeposito IS NOT NULL
            AND COALESCE(TRY_CONVERT(DATE, a.FechaDeposito, 101), TRY_CONVERT(DATE, a.FechaDeposito, 103), TRY_CONVERT(DATE, a.FechaDeposito, 23), TRY_CONVERT(DATE, a.FechaDeposito, 120), TRY_CONVERT(DATE, a.FechaDeposito, 126)) >= @FechaDeposito
            AND COALESCE(TRY_CONVERT(DATE, a.FechaDeposito, 101), TRY_CONVERT(DATE, a.FechaDeposito, 103), TRY_CONVERT(DATE, a.FechaDeposito, 23), TRY_CONVERT(DATE, a.FechaDeposito, 120), TRY_CONVERT(DATE, a.FechaDeposito, 126)) < DATEADD(DAY, 1, @FechaDeposito)
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
        @IdCliente IS NULL
        OR a.IdCliente = @IdCliente
    )
    AND (
        @IdProyecto IS NULL
        OR a.IdProyecto = @IdProyecto
    )
    AND (
        @TipoTrabajo IS NULL
        OR LTRIM(RTRIM(ISNULL(a.Tipo_Trabajo, ''))) = LTRIM(RTRIM(@TipoTrabajo))
    )
    AND (
        @CorSite IS NULL
        OR a.CorreSite = TRY_CONVERT(INT, @CorSite)
    )
    AND (
        NULLIF(LTRIM(RTRIM(@TextoBusqueda)), '') IS NULL
        OR CONVERT(VARCHAR(20), a.Correlativo) LIKE '%' + LTRIM(RTRIM(@TextoBusqueda)) + '%'
        OR LTRIM(RTRIM(ISNULL(a.Ot, ''))) LIKE '%' + LTRIM(RTRIM(@TextoBusqueda)) + '%'
        OR LTRIM(RTRIM(ISNULL(a.IdOc, ''))) LIKE '%' + LTRIM(RTRIM(@TextoBusqueda)) + '%'
        OR LTRIM(RTRIM(ISNULL(f_emp.NombreEmpleado, ''))) LIKE '%' + LTRIM(RTRIM(@TextoBusqueda)) + '%'
        OR LTRIM(RTRIM(ISNULL(g.NombreCliente, ''))) LIKE '%' + LTRIM(RTRIM(@TextoBusqueda)) + '%'
        OR LTRIM(RTRIM(ISNULL(b.NombreProyecto, ''))) LIKE '%' + LTRIM(RTRIM(@TextoBusqueda)) + '%'
        OR LTRIM(RTRIM(ISNULL(c.NombreSite, ''))) LIKE '%' + LTRIM(RTRIM(@TextoBusqueda)) + '%'
        OR LTRIM(RTRIM(ISNULL(a.Tipo_Trabajo, ''))) LIKE '%' + LTRIM(RTRIM(@TextoBusqueda)) + '%'
        OR LTRIM(RTRIM(ISNULL(e.ValorIni, ''))) LIKE '%' + LTRIM(RTRIM(@TextoBusqueda)) + '%'
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
GO
