/* ============================================================================
   RECUPERACION (ROLLBACK) — NO EJECUTADA. Restaura dbo.sp_IA_Planilla_Buscar a la
   definicion que estaba VIGENTE antes del 2026-10-03 (modify_date 2026-06-23),
   extraida literalmente de OBJECT_DEFINITION por Metadata_Alcance_SoloLectura.sql
   (archivo de resultados Metadata_1d.sql). Es compatible con el backend ACTUAL
   desplegado (no envia @AlcanceNivel / @AlcanceCampos / @AlcanceEmpleados /
   @VerTotalesGlobales). Solo restaura este procedimiento: no toca tablas ni datos.
   Diferencias respecto a la definicion original: (a) CREATE -> CREATE OR ALTER,
   (b) se omite el bloque de comentarios (version anterior comentada) que seguia
   al END, (c) espacios finales de linea recortados. Sin cambios de logica.
   ============================================================================ */
CREATE OR ALTER PROCEDURE [dbo].[sp_IA_Planilla_Buscar]
(
    @TextoBusqueda      NVARCHAR(500) = NULL,

    @Estados            VARCHAR(100) = NULL,

    @FechaInicio        NVARCHAR(50) = NULL,
    @FechaFin           NVARCHAR(50) = NULL,
    @FormatoFecha       VARCHAR(10) = 'DMY', -- Formato esperado para parámetros de entrada del usuario

    @IdSite             NVARCHAR(50) = NULL,
    @CorreSite          INT = NULL,
    @Site               NVARCHAR(150) = NULL,

    @Cliente            NVARCHAR(150) = NULL,
    @Proyecto           NVARCHAR(150) = NULL,
    @Responsable        NVARCHAR(150) = NULL,
    @Solicitante        NVARCHAR(150) = NULL,
    @Ot                 NVARCHAR(100) = NULL,

    @CoincidirTodas     BIT = 0,
    @IncluirEstado99    BIT = 1,

    @Pagina             INT = 1,
    @TamanoPagina       INT = 50000,

    @TipoCambio         DECIMAL(18, 6) = 3.80
)
AS
BEGIN
    SET NOCOUNT ON;

    BEGIN TRY

        /* ============================================================
           1. NORMALIZAR PARÁMETROS
           ============================================================ */
        SET @TextoBusqueda = NULLIF(LTRIM(RTRIM(@TextoBusqueda)), N'');
        SET @Estados = NULLIF(LTRIM(RTRIM(@Estados)), '');

        SET @FechaInicio = NULLIF(LTRIM(RTRIM(@FechaInicio)), N'');
        SET @FechaFin = NULLIF(LTRIM(RTRIM(@FechaFin)), N'');
        SET @FormatoFecha = UPPER(NULLIF(LTRIM(RTRIM(@FormatoFecha)), ''));

        IF @FormatoFecha IS NULL
            SET @FormatoFecha = 'DMY';

        IF @FormatoFecha NOT IN ('MDY', 'DMY')
            SET @FormatoFecha = 'DMY';

        SET @IdSite = NULLIF(LTRIM(RTRIM(@IdSite)), N'');
        SET @Site = NULLIF(LTRIM(RTRIM(@Site)), N'');
        SET @Cliente = NULLIF(LTRIM(RTRIM(@Cliente)), N'');
        SET @Proyecto = NULLIF(LTRIM(RTRIM(@Proyecto)), N'');
        SET @Responsable = NULLIF(LTRIM(RTRIM(@Responsable)), N'');
        SET @Solicitante = NULLIF(LTRIM(RTRIM(@Solicitante)), N'');
        SET @Ot = NULLIF(LTRIM(RTRIM(@Ot)), N'');

        SET @Pagina =
            CASE
                WHEN ISNULL(@Pagina, 0) < 1 THEN 1
                ELSE @Pagina
            END;

        SET @TamanoPagina =
            CASE
                WHEN ISNULL(@TamanoPagina, 0) < 1 THEN 50
                WHEN @TamanoPagina > 50000 THEN 50000
                ELSE @TamanoPagina
            END;

        SET @TipoCambio =
            CASE
                WHEN ISNULL(@TipoCambio, 0) <= 0 THEN 3.80
                ELSE @TipoCambio
            END;

        /* ============================================================
           1.1 NORMALIZAR PARÁMETROS DE FECHA

           IMPORTANTE:
           - El campo físico a.FecIngreso se guarda como VARCHAR mm/dd/yyyy.
           - Para filtrar se convierte con estilo 101.
           - Para mostrar se convierte a estilo 103.
           ============================================================ */

        DECLARE @FechaInicioDate DATE = NULL;
        DECLARE @FechaFinDate DATE = NULL;

        SET @FechaInicioDate =
            CASE
                WHEN @FechaInicio IS NULL THEN NULL

                -- Serial Excel
                WHEN TRY_CONVERT(INT, @FechaInicio) IS NOT NULL
                     AND TRY_CONVERT(INT, @FechaInicio) BETWEEN 30000 AND 60000
                    THEN CONVERT(DATE, DATEADD(DAY, TRY_CONVERT(INT, @FechaInicio), '18991230'))

                -- ISO yyyy-MM-dd
                WHEN TRY_CONVERT(DATE, @FechaInicio, 23) IS NOT NULL
                    THEN TRY_CONVERT(DATE, @FechaInicio, 23)

                -- ISO compacto yyyyMMdd
                WHEN TRY_CONVERT(DATE, @FechaInicio, 112) IS NOT NULL
                    THEN TRY_CONVERT(DATE, @FechaInicio, 112)

                -- Parámetro en formato dd/mm/yyyy
                WHEN @FormatoFecha = 'DMY'
                     AND TRY_CONVERT(DATE, @FechaInicio, 103) IS NOT NULL
                    THEN TRY_CONVERT(DATE, @FechaInicio, 103)

                -- Parámetro en formato mm/dd/yyyy
                WHEN @FormatoFecha = 'MDY'
                     AND TRY_CONVERT(DATE, @FechaInicio, 101) IS NOT NULL
                    THEN TRY_CONVERT(DATE, @FechaInicio, 101)

                -- Respaldo DMY
                WHEN TRY_CONVERT(DATE, @FechaInicio, 103) IS NOT NULL
                    THEN TRY_CONVERT(DATE, @FechaInicio, 103)

                -- Respaldo MDY
                WHEN TRY_CONVERT(DATE, @FechaInicio, 101) IS NOT NULL
                    THEN TRY_CONVERT(DATE, @FechaInicio, 101)

                ELSE NULL
            END;

        SET @FechaFinDate =
            CASE
                WHEN @FechaFin IS NULL THEN NULL

                -- Serial Excel
                WHEN TRY_CONVERT(INT, @FechaFin) IS NOT NULL
                     AND TRY_CONVERT(INT, @FechaFin) BETWEEN 30000 AND 60000
                    THEN CONVERT(DATE, DATEADD(DAY, TRY_CONVERT(INT, @FechaFin), '18991230'))

                -- ISO yyyy-MM-dd
                WHEN TRY_CONVERT(DATE, @FechaFin, 23) IS NOT NULL
                    THEN TRY_CONVERT(DATE, @FechaFin, 23)

                -- ISO compacto yyyyMMdd
                WHEN TRY_CONVERT(DATE, @FechaFin, 112) IS NOT NULL
                    THEN TRY_CONVERT(DATE, @FechaFin, 112)

                -- Parámetro en formato dd/mm/yyyy
                WHEN @FormatoFecha = 'DMY'
                     AND TRY_CONVERT(DATE, @FechaFin, 103) IS NOT NULL
                    THEN TRY_CONVERT(DATE, @FechaFin, 103)

                -- Parámetro en formato mm/dd/yyyy
                WHEN @FormatoFecha = 'MDY'
                     AND TRY_CONVERT(DATE, @FechaFin, 101) IS NOT NULL
                    THEN TRY_CONVERT(DATE, @FechaFin, 101)

                -- Respaldo DMY
                WHEN TRY_CONVERT(DATE, @FechaFin, 103) IS NOT NULL
                    THEN TRY_CONVERT(DATE, @FechaFin, 103)

                -- Respaldo MDY
                WHEN TRY_CONVERT(DATE, @FechaFin, 101) IS NOT NULL
                    THEN TRY_CONVERT(DATE, @FechaFin, 101)

                ELSE NULL
            END;

        IF @FechaInicio IS NOT NULL AND @FechaInicioDate IS NULL
        BEGIN
            THROW 50002, 'FechaInicio no tiene un formato válido. Use dd/mm/yyyy, yyyy-MM-dd, yyyyMMdd, mm/dd/yyyy o serial Excel.', 1;
        END;

        IF @FechaFin IS NOT NULL AND @FechaFinDate IS NULL
        BEGIN
            THROW 50003, 'FechaFin no tiene un formato válido. Use dd/mm/yyyy, yyyy-MM-dd, yyyyMMdd, mm/dd/yyyy o serial Excel.', 1;
        END;

        /* ============================================================
           2. OBTENER PALABRAS CLAVE
           ============================================================ */
        DECLARE @Terminos TABLE
        (
            Termino NVARCHAR(100) NOT NULL PRIMARY KEY
        );

        IF @TextoBusqueda IS NOT NULL
        BEGIN
            DECLARE @TextoNormalizado NVARCHAR(500);

            SET @TextoNormalizado = LOWER(@TextoBusqueda);

            SET @TextoNormalizado = REPLACE(@TextoNormalizado, ',', ' ');
            SET @TextoNormalizado = REPLACE(@TextoNormalizado, '.', ' ');
            SET @TextoNormalizado = REPLACE(@TextoNormalizado, ';', ' ');
            SET @TextoNormalizado = REPLACE(@TextoNormalizado, ':', ' ');
            SET @TextoNormalizado = REPLACE(@TextoNormalizado, '-', ' ');
            SET @TextoNormalizado = REPLACE(@TextoNormalizado, '/', ' ');
            SET @TextoNormalizado = REPLACE(@TextoNormalizado, '\', ' ');
            SET @TextoNormalizado = REPLACE(@TextoNormalizado, '(', ' ');
            SET @TextoNormalizado = REPLACE(@TextoNormalizado, ')', ' ');

            INSERT INTO @Terminos
            (
                Termino
            )
            SELECT DISTINCT
                LEFT(LTRIM(RTRIM(value)), 100)
            FROM STRING_SPLIT(@TextoNormalizado, ' ')
            WHERE LEN(LTRIM(RTRIM(value))) >= 3
              AND LTRIM(RTRIM(value)) NOT IN
              (
                  N'los',
                  N'las',
                  N'una',
                  N'uno',
                  N'para',
                  N'por',
                  N'con',
                  N'que',
                  N'del',
                  N'este',
                  N'esta',
                  N'estos',
                  N'estas',
                  N'mostrar',
                  N'muestra',
                  N'muéstrame',
                  N'buscar',
                  N'busca',
                  N'consulta',
                  N'consultar',
                  N'quiero',
                  N'necesito',
                  N'gasto',
                  N'gastos',
                  N'pago',
                  N'pagos',
                  N'planilla',
                  N'registro',
                  N'registros',
                  N'saber',
                  N'dame',
                  N'ver',
                  N'listar',
                  N'obtener',
                  N'informe',
                  N'reporte',
                  N'reportes',
                  N'periodo',
                  N'período',
                  N'mes',
                  N'año',
                  N'durante',
                  N'correspondiente',
                  N'informacion',
                  N'información',
                  N'datos',
                  N'el',
                  N'la',
                  N'de',
                  N'en',
                  N'cuantos',
                  N'cuántos',
                  N'recibos',
                  N'recibo'
              );
        END;

        /* ============================================================
           3. FILTRAR CANDIDATOS PRIMERO
           ============================================================ */
        CREATE TABLE #Candidatos
        (
            IdPlanilla    INT NOT NULL PRIMARY KEY,
            Fecha         DATE NULL,
            Coincidencias INT NOT NULL
        );

        INSERT INTO #Candidatos
        (
            IdPlanilla,
            Fecha,
            Coincidencias
        )
        SELECT
            x.IdPlanilla,
            MAX(x.Fecha) AS Fecha,
            MAX(x.Coincidencias) AS Coincidencias
        FROM
        (
            SELECT
                a.Correlativo AS IdPlanilla,

                -- El campo está guardado como VARCHAR mm/dd/yyyy.
                -- Se convierte a DATE solo para filtrar y ordenar.
                TRY_CONVERT(DATE, a.FecIngreso, 101) AS Fecha,

                (
                    SELECT
                        COUNT(*)
                    FROM @Terminos t
                    WHERE
                        LOWER(
                            CONCAT(
                                ISNULL(CONVERT(NVARCHAR(MAX), a.Detalle), N''), N' ',
                                ISNULL(CONVERT(NVARCHAR(MAX), a.Comentario), N''), N' ',
                                ISNULL(CONVERT(NVARCHAR(MAX), cli.NombreCliente), N''), N' ',
                                ISNULL(CONVERT(NVARCHAR(MAX), pro.NombreProyecto), N''), N' ',
                                ISNULL(CONVERT(NVARCHAR(MAX), sit.NombreSite), N''), N' ',
                                ISNULL(CONVERT(NVARCHAR(MAX), a.IdSite), N''), N' ',
                                ISNULL(CONVERT(NVARCHAR(MAX), a.Ot), N''), N' ',
                                ISNULL(CONVERT(NVARCHAR(MAX), emp.NombreEmpleado), N''), N' ',
                                ISNULL(CONVERT(NVARCHAR(MAX), a.Responsable), N''), N' ',

                                ISNULL(
                                    CONVERT(
                                        NVARCHAR(MAX),
                                        CASE
                                            WHEN ISNULL(a.IdWeb, 0) = 1
                                                THEN m_cj.NombreEmpleado
                                            ELSE
                                                m_emp.NombreEmpleado
                                        END
                                    ),
                                    N''
                                ), N' ',

                                ISNULL(CONVERT(NVARCHAR(MAX), est.ValorIni), N''), N' ',
                                ISNULL(CONVERT(NVARCHAR(MAX), bien.ValorIni), N''), N' ',
                                ISNULL(CONVERT(NVARCHAR(MAX), comp.ValorIni), N''), N' ',
                                ISNULL(CONVERT(NVARCHAR(MAX), tpago.ValorIni), N''), N' ',
                                ISNULL(CONVERT(NVARCHAR(MAX), a.Tipo_Trabajo), N''), N' ',
                                ISNULL(CONVERT(NVARCHAR(MAX), a.Serie), N''), N' ',
                                ISNULL(CONVERT(NVARCHAR(MAX), a.IdOc), N'')
                            )
                        ) COLLATE Latin1_General_100_CI_AI
                        LIKE
                        N'%'
                        +
                        t.Termino COLLATE Latin1_General_100_CI_AI
                        +
                        N'%'
                ) AS Coincidencias,

                (
                    SELECT
                        COUNT(*)
                    FROM @Terminos
                ) AS TotalTerminos

            FROM dbo.Planilla a

            INNER JOIN dbo.Proyecto pro
                ON pro.IdProyecto = a.IdProyecto

            LEFT JOIN dbo.Cliente cli
                ON cli.IdCliente = a.IdCliente

            LEFT JOIN dbo.Site sit
                ON sit.IdSite = a.IdSite
                AND sit.Correlativo = a.CorreSite

            LEFT JOIN dbo.Empleado emp
                ON emp.IdEmpleado = a.IdResponsable

            LEFT JOIN dbo.Empleado m_emp
                ON m_emp.IdEmpleado = a.IdSolicitante
               AND ISNULL(a.IdWeb, 0) <> 1

            LEFT JOIN dbo.EmpleadoCj m_cj
                ON m_cj.IdEmpleado = a.IdSolicitante
               AND ISNULL(a.IdWeb, 0) = 1

            LEFT JOIN dbo.Constante est
                ON est.Sociedad = 'PE01'
                AND est.Programa = 'MAESTRO'
                AND est.Campo = 'ESTADO'
                AND est.Correlativo = a.Estado

            LEFT JOIN dbo.Constante bien
                ON bien.Sociedad = 'PE01'
                AND bien.Programa = 'PLANTILLA'
                AND bien.Campo = 'TIPO_BIEN'
                AND bien.Correlativo = a.IdBien

            LEFT JOIN dbo.Constante comp
                ON comp.Sociedad = 'PE01'
                AND comp.Programa = 'PLANTILLA'
                AND comp.Campo = 'TIPO_COMPROBANTE'
                AND comp.Correlativo = a.IdComprobante

            LEFT JOIN dbo.Constante tpago
                ON tpago.Sociedad = 'PE01'
                AND tpago.Programa = 'PLANTILLA'
                AND tpago.Campo = 'TIPO_PAGO'
                AND tpago.Correlativo = a.IdTipoPago

            WHERE
                (
                    @FechaInicioDate IS NULL
                    OR TRY_CONVERT(DATE, a.FecIngreso, 101) >= @FechaInicioDate
                )
                AND
                (
                    @FechaFinDate IS NULL
                    OR TRY_CONVERT(DATE, a.FecIngreso, 101) < DATEADD(DAY, 1, @FechaFinDate)
                )
                AND
                (
                    @Estados IS NULL
                    OR EXISTS
                    (
                        SELECT 1
                        FROM STRING_SPLIT(@Estados, ',') estados
                        WHERE NULLIF(LTRIM(RTRIM(estados.value)), '') IS NOT NULL
                          AND ISNULL(est.ValorIni, '')
                              COLLATE Latin1_General_100_CI_AI
                              LIKE
                              '%'
                              +
                              LTRIM(RTRIM(estados.value))
                              +
                              '%'
                    )
                )
                AND
                (
                    @IdSite IS NULL
                    OR CONVERT(NVARCHAR(50), a.IdSite) = @IdSite
                )
                AND
                (
                    @CorreSite IS NULL
                    OR a.CorreSite = @CorreSite
                )
                AND
                (
                    @Site IS NULL
                    OR ISNULL(sit.NombreSite, '')
                       COLLATE Latin1_General_100_CI_AI
                       LIKE '%' + @Site + '%'
                )
                AND
                (
                    @Cliente IS NULL
                    OR ISNULL(cli.NombreCliente, '')
                       COLLATE Latin1_General_100_CI_AI
                       LIKE '%' + @Cliente + '%'
                )
                AND
                (
                    @Proyecto IS NULL
                    OR ISNULL(pro.NombreProyecto, '')
                       COLLATE Latin1_General_100_CI_AI
                       LIKE '%' + @Proyecto + '%'
                )
                AND
                (
                    @Responsable IS NULL
                    OR COALESCE(emp.NombreEmpleado, a.Responsable, '')
                       COLLATE Latin1_General_100_CI_AI
                       LIKE '%' + @Responsable + '%'
                )
                AND
                (
                    @Solicitante IS NULL
                    OR ISNULL(
                           CASE
                               WHEN ISNULL(a.IdWeb, 0) = 1
                                   THEN m_cj.NombreEmpleado
                               ELSE
                                   m_emp.NombreEmpleado
                           END,
                           ''
                       )
                       COLLATE Latin1_General_100_CI_AI
                       LIKE '%' + @Solicitante + '%'
                )
                AND
                (
                    @Ot IS NULL
                    OR CONVERT(NVARCHAR(100), a.Ot)
                       COLLATE Latin1_General_100_CI_AI
                       LIKE '%' + @Ot + '%'
                )
        ) x
        WHERE
            x.TotalTerminos = 0
            OR
            (
                @CoincidirTodas = 1
                AND x.Coincidencias = x.TotalTerminos
            )
            OR
            (
                @CoincidirTodas = 0
                AND x.Coincidencias > 0
            )
        GROUP BY
            x.IdPlanilla;

        /* ============================================================
           4. PAGINAR CANDIDATOS ANTES DE CÁLCULOS PESADOS
           ============================================================ */
        CREATE TABLE #Pagina
        (
            IdPlanilla     INT NOT NULL PRIMARY KEY,
            Fecha          DATE NULL,
            Coincidencias  INT NOT NULL,
            TotalRegistros INT NOT NULL
        );

        INSERT INTO #Pagina
        (
            IdPlanilla,
            Fecha,
            Coincidencias,
            TotalRegistros
        )
        SELECT
            p.IdPlanilla,
            p.Fecha,
            p.Coincidencias,
            p.TotalRegistros
        FROM
        (
            SELECT
                c.IdPlanilla,
                c.Fecha,
                c.Coincidencias,
                COUNT(*) OVER() AS TotalRegistros,
                ROW_NUMBER() OVER
                (
                    ORDER BY
                        c.Coincidencias DESC,
                        c.Fecha DESC,
                        c.IdPlanilla DESC
                ) AS NumeroFila
            FROM #Candidatos c
        ) p
        WHERE p.NumeroFila BETWEEN
              ((@Pagina - 1) * @TamanoPagina) + 1
              AND
              (@Pagina * @TamanoPagina);

        /* ============================================================
           5. RESULTADO FINAL
           ============================================================ */
        SELECT
            a.Correlativo AS IdPlanilla,

            -- ÚNICO FORMATO PERMITIDO PARA VISUALIZAR:
            -- dd/mm/yyyy
            CONVERT(VARCHAR(10), TRY_CONVERT(DATE, a.FecIngreso, 101), 103) AS Fecha,

            a.FechaDeposito,

            CAST(ISNULL(a.Detalle, '') AS VARCHAR(MAX)) AS Detalle,

            a.Comentario,

            ISNULL(est.ValorIni, '') AS Estado,

            ISNULL(cli.NombreCliente, '') AS Cliente,

            ISNULL(pro.NombreProyecto, '') AS Proyecto,

            a.IdSite,

            ISNULL(sit.NombreSite, '') AS Site,

            a.Ot,

            a.IdResponsable,

            COALESCE(emp.NombreEmpleado, a.Responsable, '') AS Responsable,

            CASE
                WHEN ISNULL(a.IdWeb, 0) = 1
                    THEN ISNULL(m_cj.NombreEmpleado, '')
                ELSE
                    ISNULL(m_emp.NombreEmpleado, '')
            END AS Solicitante,

            ISNULL(bien.ValorIni, '') AS Bien,

            ISNULL(comp.ValorIni, '') AS Comprobante,

            ISNULL(tpago.ValorIni, '') AS TipoPago,

            ISNULL(mon.ValorIni, '') AS Moneda,

            CAST(ISNULL(a.Subtotal, 0) AS DECIMAL(18, 2)) AS Subtotal,

            CAST(ISNULL(a.Igv, 0) AS DECIMAL(18, 2)) AS Igv,

            CAST(ISNULL(a.Total, 0) AS DECIMAL(18, 2)) AS Total,

            CAST(actual.SubtotalActualSoles AS DECIMAL(18, 2)) AS SubtotalSoles,

            CAST(COALESCE(montoSitio.MontoOc, 0) AS DECIMAL(18, 2)) AS Ventas,

            CAST(COALESCE(pagSitio.TotalPagadoHistoricoSoles, 0) AS DECIMAL(18, 2)) AS TotalPagadoHistoricoSoles,

            CAST(calcSitio.ConPagadoSoles AS DECIMAL(18, 2)) AS ConPagadoSoles,

            CAST(calcMoneda.ConPagadoMonedaRegistro AS DECIMAL(18, 2)) AS ConPagadoMonedaRegistro,

            CASE
                WHEN a.TipoMoneda = 1
                    THEN CONCAT('S/.', FORMAT(CAST(calcMoneda.ConPagadoMonedaRegistro AS DECIMAL(18, 2)), 'N2'))
                ELSE CONCAT('$', FORMAT(CAST(calcMoneda.ConPagadoMonedaRegistro AS DECIMAL(18, 2)), 'N2'))
            END AS ConPagado,

            CAST(
                COALESCE(montoSitio.MontoOc, 0)
                -
                calcMoneda.ConPagadoMonedaRegistro
                AS DECIMAL(18, 2)
            ) AS SaldoOcSitio,

            CAST(COALESCE(ocEmpleado.SubOc, 0) AS DECIMAL(18, 2)) AS SubOc,

            CAST(COALESCE(pagoOcEmpleado.SubPlanilla, 0) AS DECIMAL(18, 2)) AS SubPlanilla,

            CAST(calcOcEmpleado.SubPlanillaConRegistroActual AS DECIMAL(18, 2)) AS SubPlanillaConRegistroActual,

            CAST(
                CASE
                    WHEN COALESCE(ocEmpleado.SubOc, 0) = 0
                        THEN 0
                    ELSE
                        (
                            COALESCE(pagoOcEmpleado.SubPlanilla, 0)
                            /
                            NULLIF(ocEmpleado.SubOc, 0)
                        ) * 100
                END
                AS DECIMAL(18, 2)
            ) AS PorcentajeSubPlanilla,

            CAST(calcOcEmpleado.SubPlanillaConRegistroActual AS DECIMAL(18, 2)) AS AdelaFic,

            CAST(validacionOc.DiferenciaFic AS DECIMAL(18, 2)) AS DiferenciaFic,

            validacionOc.CodigoValidacionFic,

            validacionOc.ResultadoValidacionFic,

            CAST(validacionOc.PorcentajeFic AS DECIMAL(18, 2)) AS PorcentajeFic,

            a.Tipo_Trabajo,

            a.IdOc,

            a.Serie,

            a.Usuario,

            a.HoraCreacion,

            pg.Coincidencias,

            pg.TotalRegistros

        FROM #Pagina pg

        INNER JOIN dbo.Planilla a
            ON a.Correlativo = pg.IdPlanilla

        INNER JOIN dbo.Proyecto pro
            ON pro.IdProyecto = a.IdProyecto

        LEFT JOIN dbo.Cliente cli
            ON cli.IdCliente = a.IdCliente

        LEFT JOIN dbo.Site sit
            ON sit.IdSite = a.IdSite
            AND sit.Correlativo = a.CorreSite

        LEFT JOIN dbo.Empleado emp
            ON emp.IdEmpleado = a.IdResponsable

        LEFT JOIN dbo.Empleado m_emp
            ON m_emp.IdEmpleado = a.IdSolicitante
           AND ISNULL(a.IdWeb, 0) <> 1

        LEFT JOIN dbo.EmpleadoCj m_cj
            ON m_cj.IdEmpleado = a.IdSolicitante
           AND ISNULL(a.IdWeb, 0) = 1

        LEFT JOIN dbo.Constante bien
            ON bien.Sociedad = 'PE01'
            AND bien.Programa = 'PLANTILLA'
            AND bien.Campo = 'TIPO_BIEN'
            AND bien.Correlativo = a.IdBien

        LEFT JOIN dbo.Constante comp
            ON comp.Sociedad = 'PE01'
            AND comp.Programa = 'PLANTILLA'
            AND comp.Campo = 'TIPO_COMPROBANTE'
            AND comp.Correlativo = a.IdComprobante

        LEFT JOIN dbo.Constante tpago
            ON tpago.Sociedad = 'PE01'
            AND tpago.Programa = 'PLANTILLA'
            AND tpago.Campo = 'TIPO_PAGO'
            AND tpago.Correlativo = a.IdTipoPago

        LEFT JOIN dbo.Constante mon
            ON mon.Sociedad = 'PE01'
            AND mon.Programa = 'PLANTILLA'
            AND mon.Campo = 'TIPO_MONEDA'
            AND mon.Correlativo = a.TipoMoneda

        LEFT JOIN dbo.Constante est
            ON est.Sociedad = 'PE01'
            AND est.Programa = 'MAESTRO'
            AND est.Campo = 'ESTADO'
            AND est.Correlativo = a.Estado

        OUTER APPLY
        (
            SELECT
                CAST(
                    CASE
                        WHEN a.TipoMoneda = 1
                            THEN ISNULL(a.Subtotal, 0)
                        WHEN a.TipoMoneda = 2
                            THEN ISNULL(a.Subtotal, 0) * @TipoCambio
                        ELSE ISNULL(a.Subtotal, 0)
                    END
                    AS DECIMAL(18, 6)
                ) AS SubtotalActualSoles
        ) actual

        OUTER APPLY
        (
            SELECT
                CAST(
                    COALESCE(SUM(ISNULL(i.MontoOc, 0)), 0)
                    AS DECIMAL(18, 6)
                ) AS MontoOc
            FROM dbo.Importar i
            WHERE i.idestado=1
              AND i.IdCliente = a.IdCliente
              AND i.IdProyecto = a.IdProyecto
              AND i.IdSite = a.IdSite
              AND i.Correlativo = a.CorreSite
              AND
              (
                  i.TipoTrabajo = a.Tipo_Trabajo
                  OR
                  (
                      i.TipoTrabajo IS NULL
                      AND a.Tipo_Trabajo IS NULL
                  )
              )
        ) montoSitio

        OUTER APPLY
        (
            SELECT
                CAST(
                    COALESCE(
                        SUM(
                            CASE
                                WHEN p.TipoMoneda = 1
                                    THEN ISNULL(p.Subtotal, 0)
                                WHEN p.TipoMoneda = 2
                                    THEN ISNULL(p.Subtotal, 0) * @TipoCambio
                                ELSE ISNULL(p.Subtotal, 0)
                            END
                        ),
                        0
                    )
                    AS DECIMAL(18, 6)
                ) AS TotalPagadoHistoricoSoles
            FROM dbo.Planilla p
            WHERE p.IdCliente = a.IdCliente
              AND p.IdProyecto = a.IdProyecto
              AND p.IdSite = a.IdSite
              AND p.CorreSite = a.CorreSite
              AND p.Correlativo <> a.Correlativo
              AND p.Estado = 4
              AND
              (
                  p.Tipo_Trabajo = a.Tipo_Trabajo
                  OR
                  (
                      p.Tipo_Trabajo IS NULL
                      AND a.Tipo_Trabajo IS NULL
                  )
              )
        ) pagSitio

        OUTER APPLY
        (
            SELECT
                CAST(
                    COALESCE(pagSitio.TotalPagadoHistoricoSoles, 0)
                    +
                    COALESCE(actual.SubtotalActualSoles, 0)
                    AS DECIMAL(18, 6)
                ) AS ConPagadoSoles
        ) calcSitio

        OUTER APPLY
        (
            SELECT
                CAST(
                    CASE
                        WHEN a.TipoMoneda = 2
                            THEN calcSitio.ConPagadoSoles / NULLIF(@TipoCambio, 0)
                        ELSE calcSitio.ConPagadoSoles
                    END
                    AS DECIMAL(18, 6)
                ) AS ConPagadoMonedaRegistro
        ) calcMoneda

        OUTER APPLY
        (
            SELECT
                CAST(
                    COALESCE(
                        SUM(
                            CASE
                                WHEN doc.IdMoneda = 1
                                    THEN ISNULL(det.PrecioUnitario, 0) * ISNULL(det.Cantidad, 0)
                                ELSE
                                    (
                                        ISNULL(det.PrecioUnitario, 0)
                                        *
                                        ISNULL(det.Cantidad, 0)
                                    ) * @TipoCambio
                            END
                        ),
                        0
                    )
                    AS DECIMAL(18, 6)
                ) AS SubOc,

                MAX(doc.IdMoneda) AS IdMonedaOc
            FROM dbo.detOrdenCompra det

            LEFT JOIN dbo.cabOrdenCompra doc
                ON doc.IdOc = det.IdOc

            WHERE det.IdOc = a.IdOc
              AND det.Fila = a.Fila
              AND det.IdEstado NOT IN (3)
              AND det.IdSite = a.IdSite
              AND
              (
                  det.TipoTrabajo = a.Tipo_Trabajo
                  OR
                  (
                      det.TipoTrabajo IS NULL
                      AND a.Tipo_Trabajo IS NULL
                  )
              )
        ) ocEmpleado

        OUTER APPLY
        (
            SELECT
                CAST(
                    COALESCE(
                        SUM(
                            CASE
                                WHEN pla.TipoMoneda = 1
                                    THEN ISNULL(pla.Subtotal, 0)
                                WHEN pla.TipoMoneda = 2
                                    THEN ISNULL(pla.Subtotal, 0) * @TipoCambio
                                ELSE ISNULL(pla.Subtotal, 0)
                            END
                        ),
                        0
                    )
                    AS DECIMAL(18, 6)
                ) AS SubPlanilla
            FROM dbo.Planilla pla
            WHERE pla.IdOc = a.IdOc
              AND pla.IdCliente = a.IdCliente
              AND pla.IdProyecto = a.IdProyecto
              AND pla.IdSite = a.IdSite
              AND pla.CorreSite = a.CorreSite
              AND pla.Fila = a.Fila
              AND pla.Correlativo <> a.Correlativo
              AND
              (
                  pla.Tipo_Trabajo = a.Tipo_Trabajo
                  OR
                  (
                      pla.Tipo_Trabajo IS NULL
                      AND a.Tipo_Trabajo IS NULL
                  )
              )
              AND
              (
                  pla.Estado = 4
                  OR
                  (
                      @IncluirEstado99 = 1
                      AND pla.Estado = 99
                  )
              )
        ) pagoOcEmpleado

        OUTER APPLY
        (
            SELECT
                CAST(
                    COALESCE(pagoOcEmpleado.SubPlanilla, 0)
                    +
                    COALESCE(actual.SubtotalActualSoles, 0)
                    AS DECIMAL(18, 6)
                ) AS SubPlanillaConRegistroActual
        ) calcOcEmpleado

        OUTER APPLY
        (
            SELECT
                CAST(
                    COALESCE(ocEmpleado.SubOc, 0)
                    -
                    COALESCE(calcOcEmpleado.SubPlanillaConRegistroActual, 0)
                    AS DECIMAL(18, 6)
                ) AS DiferenciaFic,

                CASE
                    WHEN
                        COALESCE(ocEmpleado.SubOc, 0)
                        -
                        COALESCE(calcOcEmpleado.SubPlanillaConRegistroActual, 0) > 0
                        THEN 1

                    WHEN
                        COALESCE(ocEmpleado.SubOc, 0)
                        -
                        COALESCE(calcOcEmpleado.SubPlanillaConRegistroActual, 0) < 0
                        THEN -1

                    ELSE 0
                END AS CodigoValidacionFic,

                CASE
                    WHEN
                        COALESCE(ocEmpleado.SubOc, 0)
                        -
                        COALESCE(calcOcEmpleado.SubPlanillaConRegistroActual, 0) > 0
                        THEN 'MAYOR_A_CERO'

                    WHEN
                        COALESCE(ocEmpleado.SubOc, 0)
                        -
                        COALESCE(calcOcEmpleado.SubPlanillaConRegistroActual, 0) < 0
                        THEN 'MENOR_A_CERO'

                    ELSE 'IGUAL_A_CERO'
                END AS ResultadoValidacionFic,

                CAST(
                    CASE
                        WHEN COALESCE(ocEmpleado.SubOc, 0) = 0
                            THEN 0
                        ELSE
                            (
                                COALESCE(calcOcEmpleado.SubPlanillaConRegistroActual, 0)
                                /
                                NULLIF(ocEmpleado.SubOc, 0)
                            ) * 100
                    END
                    AS DECIMAL(18, 2)
                ) AS PorcentajeFic
        ) validacionOc

        ORDER BY
            pg.Coincidencias DESC,
            pg.Fecha DESC,
            pg.IdPlanilla DESC

        OPTION (RECOMPILE);

    END TRY
    BEGIN CATCH

        DECLARE @MensajeError NVARCHAR(2048);

        SET @MensajeError =
            CONCAT(
                'Error al realizar la búsqueda de planilla para IA. ',
                'Detalle: ',
                ERROR_MESSAGE(),
                ' | Error SQL: ',
                ERROR_NUMBER(),
                ' | Línea: ',
                ERROR_LINE()
            );

        THROW 50001, @MensajeError, 1;

    END CATCH;
END;
GO
