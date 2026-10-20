/* ################################################################
   OBSOLETO - NO EJECUTAR. Esta copia no coincide con el SP vigente en JC_Db (que trabaja por etapas
   con tablas temporales). Referencia actual: 08_sp_Planilla_Consulta_Estados_idtarea_idgestorcj.sql.
   ################################################################ */
/* ================================================================
   sp_Planilla_Consulta_Estados - REFERENCIA de la version vigente en JC_Db
   (script "ALTER" extraido de SSMS el 2026-10-18, ya ejecutado en la BD).
   Cambio respecto al script 05: nuevo parametro @IdTarea (filtra la consulta
   principal, el modo SoloSumaResp y la suma por responsable); la pestana
   Consulta de /finanzas/tesoreria/gastos lo envia al elegir el filtro Tarea.
   Incluye ademas lo agregado por otras sesiones: @ModoLiviano, @SoloSumaResp,
   @IncluirSumaResp, semaforo de OC (EstadoOcSemaforo), TotalOcConsumo /
   PagadoOcConsumo, SumaEmp*, *Soles y *Original.
   Reglas: Subtotal/IGV/Total salen en la moneda REAL del recibo; el
   equivalente en soles va en SubtotalSoles / IGVSoles / TotalSoles (ver
   AGENTS.md, regla critica de montos).
   2026-10-20: agrega IdGestor, IdSolicitanteCj, IdGestorCj e IdValidadorCj (PV: pendiente de ejecutar en BD).
   Antes de volver a ejecutarlo, comparar con el SP vigente (Script as ALTER).
   ================================================================ */
USE [JC_Db]
GO

SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE OR ALTER PROCEDURE [dbo].[sp_Planilla_Consulta_Estados]
(
    @IdCargo         INT = NULL,
    @IdEmpleado      INT = NULL,
    @IdValidador     INT = NULL,
    @IdBanco         INT = NULL,
    @Estados         VARCHAR(50) = NULL,
    @OT              VARCHAR(50) = NULL,
    @IdOc            VARCHAR(50) = NULL,
    @Fila            VARCHAR(50) = NULL,
    @IdSite          VARCHAR(50) = NULL,
    @CorSite         VARCHAR(50) = NULL,
    @IdCliente       INT = NULL,
    @IdProyecto      INT = NULL,
    @TipoTrabajo     VARCHAR(150) = NULL,
    @FechaInicio     DATE = NULL,
    @FechaFin        DATE = NULL,
    @FechaDeposito   DATE = NULL,
    @TextoBusqueda   VARCHAR(200) = NULL,
    @Correlativo     INT = NULL,
    @TipoCambioUSD   DECIMAL(18, 6) = NULL,
    @TipoCambioEUR   DECIMAL(18, 6) = NULL,
    @TipoCambioDOP   DECIMAL(18, 6) = NULL,
    @TipoCambioCOP   DECIMAL(18, 6) = NULL,
    @IncluirSumaResp BIT = 0,
    @ModoLiviano     BIT = 0,
    @SoloSumaResp    BIT = 0,

    -- NUEVO FILTRO
    @IdTarea         INT = NULL
)
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @FiltrarPorSolicitante BIT =
        CASE WHEN @IdEmpleado IS NULL THEN 0 ELSE 1 END;

    DECLARE @IdEmpleado2 VARCHAR(MAX) = '0';
    DECLARE @IncluyeEstado4 BIT = 0;

    DECLARE @EstadosFiltro TABLE
    (
        Estado INT PRIMARY KEY
    );

    DECLARE @EmpleadosFiltro TABLE
    (
        IdEmpleado INT PRIMARY KEY
    );

    ------------------------------------------------------------
    -- TIPOS DE CAMBIO
    ------------------------------------------------------------
    DECLARE @TcUsd DECIMAL(18, 6) =
        CASE WHEN ISNULL(@TipoCambioUSD, 0) > 0
             THEN @TipoCambioUSD ELSE 3.80 END;

    DECLARE @TcEur DECIMAL(18, 6) =
        CASE WHEN ISNULL(@TipoCambioEUR, 0) > 0
             THEN @TipoCambioEUR ELSE 3.80 END;

    DECLARE @TcDop DECIMAL(18, 6) =
        CASE WHEN ISNULL(@TipoCambioDOP, 0) > 0
             THEN @TipoCambioDOP ELSE 0.057 END;

    DECLARE @TcCop DECIMAL(18, 6) =
        CASE WHEN ISNULL(@TipoCambioCOP, 0) > 0
             THEN @TipoCambioCOP ELSE 0.001 END;

    ------------------------------------------------------------
    -- FILTRO DE ESTADOS
    ------------------------------------------------------------
    INSERT INTO @EstadosFiltro (Estado)
    SELECT DISTINCT
        TRY_CAST(LTRIM(RTRIM(value)) AS INT)
    FROM STRING_SPLIT(@Estados, ',')
    WHERE TRY_CAST(LTRIM(RTRIM(value)) AS INT) IS NOT NULL;

    ------------------------------------------------------------
    -- EMPLEADOS RELACIONADOS
    ------------------------------------------------------------
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

    ------------------------------------------------------------
    -- PERMISOS
    ------------------------------------------------------------
    IF EXISTS
    (
        SELECT 1
        FROM dbo.Constante
        WHERE Campo = 'PERMISOS'
          AND
          (
              TRY_CONVERT(INT, Correlativo) = @IdCargo
              OR TRY_CONVERT(INT, ValorIni) = @IdCargo
          )
    )
    BEGIN
        SET @FiltrarPorSolicitante = 0;
    END;

    IF EXISTS
    (
        SELECT 1
        FROM @EstadosFiltro
        WHERE Estado = 4
    )
    BEGIN
        SET @IncluyeEstado4 = 1;
    END;

    INSERT INTO @EmpleadosFiltro (IdEmpleado)
    SELECT DISTINCT
        TRY_CAST(LTRIM(RTRIM(value)) AS INT)
    FROM STRING_SPLIT(@IdEmpleado2, ',')
    WHERE TRY_CAST(LTRIM(RTRIM(value)) AS INT) IS NOT NULL;

    ------------------------------------------------------------
    -- MODO SOLO SUMA RESPONSABLE
    ------------------------------------------------------------
    IF @SoloSumaResp = 1
    BEGIN
        ;WITH Candidatos AS
        (
            SELECT DISTINCT
                a.IdCliente,
                a.IdProyecto,
                a.IdSite,
                a.CorreSite,
                a.Tipo_Trabajo,
                a.IdTarea,
                a.IdResponsable
            FROM Planilla a
            WHERE
            (
                NULLIF(LTRIM(RTRIM(@Estados)), '') IS NULL
                OR EXISTS
                (
                    SELECT 1
                    FROM @EstadosFiltro ef
                    WHERE ef.Estado = a.Estado
                )
            )
            AND
            (
                @FechaInicio IS NULL
                OR COALESCE(
                    TRY_CONVERT(DATE, a.FecIngreso, 101),
                    TRY_CONVERT(DATE, a.FecIngreso, 103),
                    TRY_CONVERT(DATE, a.FecIngreso, 23),
                    TRY_CONVERT(DATE, a.FecIngreso, 120),
                    TRY_CONVERT(DATE, a.FecIngreso, 126)
                ) >= @FechaInicio
            )
            AND
            (
                @FechaFin IS NULL
                OR COALESCE(
                    TRY_CONVERT(DATE, a.FecIngreso, 101),
                    TRY_CONVERT(DATE, a.FecIngreso, 103),
                    TRY_CONVERT(DATE, a.FecIngreso, 23),
                    TRY_CONVERT(DATE, a.FecIngreso, 120),
                    TRY_CONVERT(DATE, a.FecIngreso, 126)
                ) < DATEADD(DAY, 1, @FechaFin)
            )

            -- NUEVO FILTRO DE TAREA
            AND
            (
                @IdTarea IS NULL
                OR a.IdTarea = @IdTarea
            )
        )
        SELECT
            ISNULL(c.IdCliente, 0) AS IdCliente,
            ISNULL(c.IdProyecto, 0) AS IdProyecto,
            LTRIM(RTRIM(ISNULL(CONVERT(VARCHAR(50), c.IdSite), ''))) AS IdSite,
            ISNULL(c.CorreSite, 0) AS CorreSite,
            LTRIM(RTRIM(ISNULL(c.Tipo_Trabajo, ''))) AS TipoTrabajo,
            ISNULL(c.IdTarea, 0) AS IdTarea,
            ISNULL(c.IdResponsable, 0) AS IdResponsable,

            CAST(SUM(
                CASE WHEN p.TipoMoneda = 1
                     THEN ISNULL(p.Subtotal, 0) ELSE 0 END
            ) AS DECIMAL(18, 2)) AS SolesNativo,

            CAST(SUM(
                CASE WHEN p.TipoMoneda = 2
                     THEN ISNULL(p.Subtotal, 0) ELSE 0 END
            ) AS DECIMAL(18, 2)) AS UsdNativo,

            CAST(SUM(
                CASE WHEN p.TipoMoneda = 3
                     THEN ISNULL(p.Subtotal, 0) ELSE 0 END
            ) AS DECIMAL(18, 2)) AS EurNativo,

            CAST(SUM(
                CASE WHEN p.TipoMoneda = 4
                     THEN ISNULL(p.Subtotal, 0) ELSE 0 END
            ) AS DECIMAL(18, 2)) AS DopNativo,

            CAST(SUM(
                CASE WHEN p.TipoMoneda = 5
                     THEN ISNULL(p.Subtotal, 0) ELSE 0 END
            ) AS DECIMAL(18, 2)) AS CopNativo,

            COUNT(*) AS CantRecibos

        FROM Candidatos c
        INNER JOIN Planilla p
            ON p.IdCliente = c.IdCliente
           AND p.IdProyecto = c.IdProyecto
           AND p.IdSite = c.IdSite
           AND p.CorreSite = c.CorreSite
           AND p.Tipo_Trabajo = c.Tipo_Trabajo
           AND p.IdTarea = c.IdTarea
           AND p.IdResponsable = c.IdResponsable

        WHERE p.Estado IN (4, 6, 0)
          AND p.TipoMoneda IN (1, 2, 3, 4, 5)

        GROUP BY
            c.IdCliente,
            c.IdProyecto,
            c.IdSite,
            c.CorreSite,
            c.Tipo_Trabajo,
            c.IdTarea,
            c.IdResponsable

        OPTION (RECOMPILE);

        RETURN;
    END;

    ------------------------------------------------------------
    -- CONSULTA PRINCIPAL
    ------------------------------------------------------------
    ;WITH PlanillaBancoAgrupada AS
    (
        SELECT
            LTRIM(RTRIM(p.NroOperacion)) AS NroOperacion,

            STRING_AGG(
                CONVERT(VARCHAR(20), p.Correlativo),
                ', '
            ) WITHIN GROUP (
                ORDER BY p.Correlativo
            ) AS Correlativos,

            SUM(ABS(ISNULL(p.MontoRetencion, 0)))
                AS MontoRetencionAgrupado,

            -SUM(ABS(ISNULL(p.TotalPagar, 0)))
                AS TotalPagarAgrupado

        FROM Planilla p

        INNER JOIN Constante banAgrupado
            ON banAgrupado.Sociedad = 'PE01'
           AND banAgrupado.Programa = 'PLANTILLA'
           AND banAgrupado.Campo = 'BANCO'
           AND p.IdBanco = banAgrupado.Correlativo

        WHERE @ModoLiviano = 0
          AND
          (
              UPPER(LTRIM(RTRIM(ISNULL(banAgrupado.ValorIni, ''))))
                  LIKE '%SCOTI%'
              OR
              UPPER(LTRIM(RTRIM(ISNULL(banAgrupado.ValorIni, ''))))
                  LIKE '%BCP%'
          )

        GROUP BY LTRIM(RTRIM(p.NroOperacion))
    ),

    ------------------------------------------------------------
    -- TOTAL PAGADO POR OT Y MONEDA
    ------------------------------------------------------------
    PlanillaOTTotales AS
    (
        SELECT
            LTRIM(RTRIM(ISNULL(CONVERT(VARCHAR(50), p.OT), ''))) AS OT,
            p.IdCliente,
            p.IdProyecto,

            LTRIM(RTRIM(ISNULL(CONVERT(VARCHAR(50), p.IdSite), '')))
                AS IdSite,

            ISNULL(p.CorreSite, 0) AS CorreSite,
            LTRIM(RTRIM(ISNULL(p.Tipo_Trabajo, ''))) AS TipoTrabajo,
            p.TipoMoneda,

            CAST(
                SUM(ISNULL(p.Subtotal, 0))
                AS DECIMAL(18, 2)
            ) AS TotalSubtotalPorMoneda,

            CAST(
                SUM(
                    ISNULL(p.Subtotal, 0) *
                    CASE p.TipoMoneda
                        WHEN 2 THEN @TcUsd
                        WHEN 3 THEN @TcEur
                        WHEN 4 THEN @TcDop
                        WHEN 5 THEN @TcCop
                        ELSE 1
                    END
                )
                AS DECIMAL(18, 2)
            ) AS SubtotalPorMonedaEnSoles

        FROM dbo.Planilla p

        WHERE @ModoLiviano = 0
          AND p.Estado = 4

          AND UPPER(LTRIM(RTRIM(
              ISNULL(CONVERT(VARCHAR(50), p.OT), '')
          ))) NOT IN ('', '0', 'NULL')

          AND (@OT IS NULL OR p.OT = @OT)
          AND (@IdCliente IS NULL OR p.IdCliente = @IdCliente)
          AND (@IdProyecto IS NULL OR p.IdProyecto = @IdProyecto)

          AND
          (
              @IdSite IS NULL
              OR LTRIM(RTRIM(ISNULL(CONVERT(VARCHAR(50), p.IdSite), '')))
                 = LTRIM(RTRIM(@IdSite))
          )

          AND
          (
              @CorSite IS NULL
              OR p.CorreSite = TRY_CONVERT(INT, @CorSite)
          )

          AND
          (
              @TipoTrabajo IS NULL
              OR LTRIM(RTRIM(ISNULL(p.Tipo_Trabajo, '')))
                 = LTRIM(RTRIM(@TipoTrabajo))
          )

        GROUP BY
            LTRIM(RTRIM(ISNULL(CONVERT(VARCHAR(50), p.OT), ''))),
            p.IdCliente,
            p.IdProyecto,
            LTRIM(RTRIM(ISNULL(CONVERT(VARCHAR(50), p.IdSite), ''))),
            ISNULL(p.CorreSite, 0),
            LTRIM(RTRIM(ISNULL(p.Tipo_Trabajo, ''))),
            p.TipoMoneda
    ),

    PlanillaOTConvertido AS
    (
        SELECT
            OT,
            IdCliente,
            IdProyecto,
            IdSite,
            CorreSite,
            TipoTrabajo,

            CAST(
                SUM(SubtotalPorMonedaEnSoles)
                AS DECIMAL(18, 2)
            ) AS TotalPagadoConvertidoSoles,

            STRING_AGG(
                CONVERT(VARCHAR(3), TipoMoneda),
                ','
            ) AS MonedasPagado

        FROM PlanillaOTTotales

        GROUP BY
            OT,
            IdCliente,
            IdProyecto,
            IdSite,
            CorreSite,
            TipoTrabajo
    ),

    ------------------------------------------------------------
    -- TOTALES DE IMPORTAR
    ------------------------------------------------------------
    ImportarOTTotales AS
    (
        SELECT
            LTRIM(RTRIM(ISNULL(CONVERT(VARCHAR(50), imp.OT), '')))
                AS OT,

            imp.IdCliente,
            imp.IdProyecto,

            LTRIM(RTRIM(ISNULL(CONVERT(VARCHAR(50), imp.IdSite), '')))
                AS IdSite,

            ISNULL(imp.Correlativo, 0) AS CorreSite,
            LTRIM(RTRIM(ISNULL(imp.TipoTrabajo, ''))) AS TipoTrabajo,
            imp.IdMoneda,

            CAST(
                SUM(ISNULL(imp.Monto_Bck, 0))
                AS DECIMAL(18, 2)
            ) AS TotalMontoBckPorMoneda,

            CAST(
                SUM(ISNULL(imp.Monto_Visible, 0))
                AS DECIMAL(18, 2)
            ) AS TotalMontoVisiblePorMoneda,

            CAST(
                SUM(
                    ISNULL(imp.Monto_Bck, 0) *
                    CASE imp.IdMoneda
                        WHEN 2 THEN @TcUsd
                        WHEN 3 THEN @TcEur
                        WHEN 4 THEN @TcDop
                        WHEN 5 THEN @TcCop
                        ELSE 1
                    END
                )
                AS DECIMAL(18, 2)
            ) AS TotalMontoBckEnSoles,

            CAST(
                SUM(
                    ISNULL(imp.Monto_Visible, 0) *
                    CASE imp.IdMoneda
                        WHEN 2 THEN @TcUsd
                        WHEN 3 THEN @TcEur
                        WHEN 4 THEN @TcDop
                        WHEN 5 THEN @TcCop
                        ELSE 1
                    END
                )
                AS DECIMAL(18, 2)
            ) AS TotalMontoVisibleEnSoles

        FROM dbo.Importar imp

        WHERE @ModoLiviano = 0
          AND imp.IdEstado = 1

          AND UPPER(LTRIM(RTRIM(
              ISNULL(CONVERT(VARCHAR(50), imp.OT), '')
          ))) NOT IN ('', '0', 'NULL')

          AND (@OT IS NULL OR imp.OT = @OT)
          AND (@IdCliente IS NULL OR imp.IdCliente = @IdCliente)
          AND (@IdProyecto IS NULL OR imp.IdProyecto = @IdProyecto)

          AND
          (
              @IdSite IS NULL
              OR LTRIM(RTRIM(ISNULL(CONVERT(VARCHAR(50), imp.IdSite), '')))
                 = LTRIM(RTRIM(@IdSite))
          )

          AND
          (
              @CorSite IS NULL
              OR imp.Correlativo = TRY_CONVERT(INT, @CorSite)
          )

          AND
          (
              @TipoTrabajo IS NULL
              OR LTRIM(RTRIM(ISNULL(imp.TipoTrabajo, '')))
                 = LTRIM(RTRIM(@TipoTrabajo))
          )

        GROUP BY
            LTRIM(RTRIM(ISNULL(CONVERT(VARCHAR(50), imp.OT), ''))),
            imp.IdCliente,
            imp.IdProyecto,
            LTRIM(RTRIM(ISNULL(CONVERT(VARCHAR(50), imp.IdSite), ''))),
            ISNULL(imp.Correlativo, 0),
            LTRIM(RTRIM(ISNULL(imp.TipoTrabajo, ''))),
            imp.IdMoneda
    ),

    ImportarOTConvertido AS
    (
        SELECT
            OT,
            IdCliente,
            IdProyecto,
            IdSite,
            CorreSite,
            TipoTrabajo,

            CAST(
                SUM(TotalMontoBckEnSoles)
                AS DECIMAL(18, 2)
            ) AS TotalMontoBckSoles,

            CAST(
                SUM(TotalMontoVisibleEnSoles)
                AS DECIMAL(18, 2)
            ) AS TotalMontoVisibleSoles,

            STRING_AGG(
                CONVERT(VARCHAR(3), IdMoneda),
                ','
            ) AS MonedasImportar

        FROM ImportarOTTotales

        GROUP BY
            OT,
            IdCliente,
            IdProyecto,
            IdSite,
            CorreSite,
            TipoTrabajo
    ),

    ------------------------------------------------------------
    -- TOTALES POR RESPONSABLE Y TAREA
    ------------------------------------------------------------
    PlanillaResponsableTotales AS
    (
        SELECT
            ISNULL(p.IdCliente, 0) AS IdCliente,
            ISNULL(p.IdProyecto, 0) AS IdProyecto,

            LTRIM(RTRIM(ISNULL(CONVERT(VARCHAR(50), p.IdSite), '')))
                AS IdSite,

            ISNULL(p.CorreSite, 0) AS CorreSite,

            LTRIM(RTRIM(ISNULL(p.Tipo_Trabajo, '')))
                AS TipoTrabajo,

            ISNULL(p.IdTarea, 0) AS IdTarea,
            ISNULL(p.IdResponsable, 0) AS IdResponsable,

            CAST(SUM(
                CASE WHEN p.TipoMoneda = 1
                     THEN ISNULL(p.Subtotal, 0) ELSE 0 END
            ) AS DECIMAL(18, 2)) AS SolesNativo,

            CAST(SUM(
                CASE WHEN p.TipoMoneda = 2
                     THEN ISNULL(p.Subtotal, 0) ELSE 0 END
            ) AS DECIMAL(18, 2)) AS UsdNativo,

            CAST(SUM(
                CASE WHEN p.TipoMoneda = 3
                     THEN ISNULL(p.Subtotal, 0) ELSE 0 END
            ) AS DECIMAL(18, 2)) AS EurNativo,

            CAST(SUM(
                CASE WHEN p.TipoMoneda = 4
                     THEN ISNULL(p.Subtotal, 0) ELSE 0 END
            ) AS DECIMAL(18, 2)) AS DopNativo,

            CAST(SUM(
                CASE WHEN p.TipoMoneda = 5
                     THEN ISNULL(p.Subtotal, 0) ELSE 0 END
            ) AS DECIMAL(18, 2)) AS CopNativo,

            COUNT(*) AS CantRecibos

        FROM dbo.Planilla p

        WHERE @IncluirSumaResp = 1
          AND p.Estado IN (4, 6, 0)
          AND p.TipoMoneda IN (1, 2, 3, 4, 5)

          AND (@IdCliente IS NULL OR p.IdCliente = @IdCliente)
          AND (@IdProyecto IS NULL OR p.IdProyecto = @IdProyecto)

          AND
          (
              @IdSite IS NULL
              OR LTRIM(RTRIM(ISNULL(CONVERT(VARCHAR(50), p.IdSite), '')))
                 = LTRIM(RTRIM(@IdSite))
          )

          AND
          (
              @CorSite IS NULL
              OR p.CorreSite = TRY_CONVERT(INT, @CorSite)
          )

          AND
          (
              @TipoTrabajo IS NULL
              OR LTRIM(RTRIM(ISNULL(p.Tipo_Trabajo, '')))
                 = LTRIM(RTRIM(@TipoTrabajo))
          )

          -- NUEVO FILTRO
          AND
          (
              @IdTarea IS NULL
              OR p.IdTarea = @IdTarea
          )

        GROUP BY
            ISNULL(p.IdCliente, 0),
            ISNULL(p.IdProyecto, 0),
            LTRIM(RTRIM(ISNULL(CONVERT(VARCHAR(50), p.IdSite), ''))),
            ISNULL(p.CorreSite, 0),
            LTRIM(RTRIM(ISNULL(p.Tipo_Trabajo, ''))),
            ISNULL(p.IdTarea, 0),
            ISNULL(p.IdResponsable, 0)
    )

    ------------------------------------------------------------
    -- RESULTADO PRINCIPAL
    ------------------------------------------------------------
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

        CAST(
            ISNULL(pot.TotalSubtotalPorMoneda, 0)
            AS DECIMAL(18, 2)
        ) AS TotalSubtotalPorMoneda,

        CAST(
            ISNULL(iot.TotalMontoBckPorMoneda, 0)
            AS DECIMAL(18, 2)
        ) AS TotalMontoBckPorMoneda,

        CAST(
            ISNULL(iot.TotalMontoVisiblePorMoneda, 0)
            AS DECIMAL(18, 2)
        ) AS TotalMontoVisiblePorMoneda,

        CAST(
            ISNULL(potc.TotalPagadoConvertidoSoles, 0)
            AS DECIMAL(18, 2)
        ) AS TotalPagadoConvertidoSoles,

        potc.MonedasPagado AS MonedasPagadoOt,
        ioc.MonedasImportar AS MonedasImportarOt,

        CAST(
            ISNULL(ioc.TotalMontoBckSoles, 0)
            AS DECIMAL(18, 2)
        ) AS TotalMontoBckSoles,

        CAST(
            ISNULL(ioc.TotalMontoVisibleSoles, 0)
            AS DECIMAL(18, 2)
        ) AS TotalMontoVisibleSoles,

        zimp.Atp AS Atp,
        zimp.Status_Pap AS Status_Pap,

        a.Subtotal AS Subtotal,
        a.Igv AS IGV,
        a.Total AS Total,

        --------------------------------------------------------
        -- CONVERSIONES A SOLES
        --------------------------------------------------------
        CAST(
            a.Subtotal *
            CASE a.TipoMoneda
                WHEN 2 THEN @TcUsd
                WHEN 3 THEN @TcEur
                WHEN 4 THEN @TcDop
                WHEN 5 THEN @TcCop
                ELSE 1
            END
            AS DECIMAL(18, 2)
        ) AS SubtotalSoles,

        CAST(
            a.Igv *
            CASE a.TipoMoneda
                WHEN 2 THEN @TcUsd
                WHEN 3 THEN @TcEur
                WHEN 4 THEN @TcDop
                WHEN 5 THEN @TcCop
                ELSE 1
            END
            AS DECIMAL(18, 2)
        ) AS IGVSoles,

        CAST(
            a.Total *
            CASE a.TipoMoneda
                WHEN 2 THEN @TcUsd
                WHEN 3 THEN @TcEur
                WHEN 4 THEN @TcDop
                WHEN 5 THEN @TcCop
                ELSE 1
            END
            AS DECIMAL(18, 2)
        ) AS TotalSoles,

        a.Comentario,

        --------------------------------------------------------
        -- SOLICITANTE / GESTOR / VALIDADOR
        --------------------------------------------------------
        CASE
            WHEN ISNULL(a.IdWeb, 0) = 1
                THEN m_cj.NombreEmpleado
            ELSE m_emp.NombreEmpleado
        END AS Solicitante,

        CASE
            WHEN ISNULL(a.IdWeb, 0) = 1
                THEN p_cj.NombreEmpleado
            ELSE p_emp.NombreEmpleado
        END AS Gestor,

        CASE
            WHEN ISNULL(a.IdWeb, 0) = 1
                THEN o_cj.NombreEmpleado
            ELSE o_emp.NombreEmpleado
        END AS Validador,

        CONVERT(VARCHAR(10), a.FechaDeposito, 103) AS FechaDeposito,

        a.Estado,

        COALESCE(
            NULLIF(LTRIM(RTRIM(w.ValorIni)), ''),
            CONVERT(VARCHAR(20), a.Estado)
        ) AS EstadoNombre,

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
        a.IdGestor,
        -- Codigos EmpleadoCj de solicitante/gestor/validador: IdWeb=1 ya los guarda asi; en gastos antiguos
        -- se obtienen con el puente Empleado.IdEmpleadoCj (la pantalla los usa para cargar los combos).
        CASE WHEN ISNULL(a.IdWeb, 0) = 1 THEN a.IdSolicitante ELSE m_emp.IdEmpleadoCj END AS IdSolicitanteCj,
        CASE WHEN ISNULL(a.IdWeb, 0) = 1 THEN a.IdGestor ELSE p_emp.IdEmpleadoCj END AS IdGestorCj,
        CASE WHEN ISNULL(a.IdWeb, 0) = 1 THEN a.IdValidador ELSE o_emp.IdEmpleadoCj END AS IdValidadorCj,
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

        --------------------------------------------------------
        -- SEMAFORO OC
        --------------------------------------------------------
        CASE
            WHEN coc.IdEstado = 6 THEN 'R'
            WHEN ISNULL(coc.IdAprobador3, 0) > 0 THEN 'A'
            WHEN ISNULL(coc.IdAprobador2, 0) > 0 THEN '3'
            WHEN ISNULL(coc.IdAprobador1, 0) > 0 THEN '2'
            WHEN ISNULL(coc.IdGestor, 0) > 0 THEN '1'
            ELSE 'P'
        END AS EstadoOcSemaforo,

        CAST(
            COALESCE(coc.Subtotal, 0)
            AS DECIMAL(18, 2)
        ) AS TotalOcConsumo,

        CAST(
            ISNULL(ocp.PagadoOc, 0)
            AS DECIMAL(18, 2)
        ) AS PagadoOcConsumo,

        a.MontoRetencion,
        a.TotalPagar AS TotalPagarOriginal,

        CASE
            WHEN UPPER(LTRIM(RTRIM(ISNULL(ban.ValorIni, ''))))
                 LIKE '%SCOTI%'
                THEN pa.TotalPagarAgrupado
            ELSE a.TotalPagar
        END AS TotalPlanillaBase,

        CASE
            WHEN UPPER(LTRIM(RTRIM(ISNULL(ban.ValorIni, ''))))
                 LIKE '%SCOTI%'
                THEN pa.TotalPagarAgrupado
            ELSE a.TotalPagar
        END AS TotalPagar,

        --------------------------------------------------------
        -- TAREA
        --------------------------------------------------------
        a.IdTarea,
        e.ValorIni AS Tarea,

        a.imgFactura,
        a.idprovisional,
        s1.fechaInicio,
        w.ValorIni AS NombreEstado,
        a.serie,
        a.NroOperacion,

        CAST(a.Observacion AS VARCHAR(MAX))
            AS ObservacionPlanilla,

        a.Subtotal AS SubtotalOriginal,
        a.Igv AS IgvOriginal,
        a.Total AS TotalOriginal,

        --------------------------------------------------------
        -- SUMA RESPONSABLE
        --------------------------------------------------------
        CAST(
            ISNULL(prt.SolesNativo, 0)
            + ISNULL(prt.UsdNativo, 0) * @TcUsd
            + ISNULL(prt.EurNativo, 0) * @TcEur
            + ISNULL(prt.DopNativo, 0) * @TcDop
            + ISNULL(prt.CopNativo, 0) * @TcCop
            AS DECIMAL(18, 2)
        ) AS SumaEmp,

        CAST(
            ISNULL(prt.SolesNativo, 0)
            AS DECIMAL(18, 2)
        ) AS SumaEmpSolesNativo,

        CAST(
            ISNULL(prt.UsdNativo, 0)
            AS DECIMAL(18, 2)
        ) AS SumaEmpUsdNativo,

        CAST(
            ISNULL(prt.EurNativo, 0)
            AS DECIMAL(18, 2)
        ) AS SumaEmpEurNativo,

        CAST(
            ISNULL(prt.DopNativo, 0)
            AS DECIMAL(18, 2)
        ) AS SumaEmpDopNativo,

        CAST(
            ISNULL(prt.CopNativo, 0)
            AS DECIMAL(18, 2)
        ) AS SumaEmpCopNativo,

        ISNULL(prt.CantRecibos, 0) AS CantRecibosEmp

    FROM Planilla a

    ------------------------------------------------------------
    -- CUENTAS Y MAESTROS
    ------------------------------------------------------------
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

    ------------------------------------------------------------
    -- TOTALES POR OT
    ------------------------------------------------------------
    LEFT JOIN PlanillaOTTotales pot
        ON pot.OT = LTRIM(RTRIM(ISNULL(CONVERT(VARCHAR(50), a.OT), '')))
       AND ISNULL(pot.IdCliente, 0) = ISNULL(a.IdCliente, 0)
       AND ISNULL(pot.IdProyecto, 0) = ISNULL(a.IdProyecto, 0)
       AND pot.IdSite = LTRIM(RTRIM(ISNULL(CONVERT(VARCHAR(50), a.IdSite), '')))
       AND pot.CorreSite = ISNULL(a.CorreSite, 0)
       AND pot.TipoTrabajo = LTRIM(RTRIM(ISNULL(a.Tipo_Trabajo, '')))
       AND pot.TipoMoneda = a.TipoMoneda

    LEFT JOIN PlanillaOTConvertido potc
        ON potc.OT = LTRIM(RTRIM(ISNULL(CONVERT(VARCHAR(50), a.OT), '')))
       AND ISNULL(potc.IdCliente, 0) = ISNULL(a.IdCliente, 0)
       AND ISNULL(potc.IdProyecto, 0) = ISNULL(a.IdProyecto, 0)
       AND potc.IdSite = LTRIM(RTRIM(ISNULL(CONVERT(VARCHAR(50), a.IdSite), '')))
       AND potc.CorreSite = ISNULL(a.CorreSite, 0)
       AND potc.TipoTrabajo = LTRIM(RTRIM(ISNULL(a.Tipo_Trabajo, '')))

    LEFT JOIN ImportarOTConvertido ioc
        ON ioc.OT = LTRIM(RTRIM(ISNULL(CONVERT(VARCHAR(50), a.OT), '')))
       AND ISNULL(ioc.IdCliente, 0) = ISNULL(a.IdCliente, 0)
       AND ISNULL(ioc.IdProyecto, 0) = ISNULL(a.IdProyecto, 0)
       AND ioc.IdSite = LTRIM(RTRIM(ISNULL(CONVERT(VARCHAR(50), a.IdSite), '')))
       AND ioc.CorreSite = ISNULL(a.CorreSite, 0)
       AND ioc.TipoTrabajo = LTRIM(RTRIM(ISNULL(a.Tipo_Trabajo, '')))

    ------------------------------------------------------------
    -- ATP / STATUS PAP
    ------------------------------------------------------------
    LEFT JOIN dbo.Importar zimp
        ON a.IdCliente = 2
       AND zimp.IdCliente = a.IdCliente
       AND zimp.IdProyecto = a.IdProyecto
       AND zimp.IdSite = a.IdSite
       AND zimp.Correlativo = a.CorreSite
       AND zimp.TipoTrabajo = a.Tipo_Trabajo
       AND zimp.OT = a.OT
       AND zimp.IdEstado = 1

    LEFT JOIN ImportarOTTotales iot
        ON iot.OT = LTRIM(RTRIM(ISNULL(CONVERT(VARCHAR(50), a.OT), '')))
       AND ISNULL(iot.IdCliente, 0) = ISNULL(a.IdCliente, 0)
       AND ISNULL(iot.IdProyecto, 0) = ISNULL(a.IdProyecto, 0)
       AND iot.IdSite = LTRIM(RTRIM(ISNULL(CONVERT(VARCHAR(50), a.IdSite), '')))
       AND iot.CorreSite = ISNULL(a.CorreSite, 0)
       AND iot.TipoTrabajo = LTRIM(RTRIM(ISNULL(a.Tipo_Trabajo, '')))
       AND iot.IdMoneda = a.TipoMoneda

    ------------------------------------------------------------
    -- CONSUMO DE OC
    ------------------------------------------------------------
    OUTER APPLY
    (
        SELECT
            CAST(
                SUM(ISNULL(po.Subtotal, 0))
                AS DECIMAL(18, 2)
            ) AS PagadoOc

        FROM dbo.Planilla po

        WHERE @ModoLiviano = 0
          AND po.Estado = 4
          AND NULLIF(
              LTRIM(RTRIM(CONVERT(VARCHAR(50), a.IdOc))),
              ''
          ) IS NOT NULL
          AND po.IdOc = a.IdOc
    ) ocp

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

    ------------------------------------------------------------
    -- SOLICITANTE
    ------------------------------------------------------------
    LEFT JOIN Empleado m_emp
        ON m_emp.IdEmpleado = a.IdSolicitante
       AND ISNULL(a.IdWeb, 0) <> 1

    LEFT JOIN EmpleadoCj m_cj
        ON m_cj.IdEmpleado = a.IdSolicitante
       AND ISNULL(a.IdWeb, 0) = 1

    ------------------------------------------------------------
    -- VALIDADOR
    ------------------------------------------------------------
    LEFT JOIN Empleado o_emp
        ON o_emp.IdEmpleado = a.IdValidador
       AND ISNULL(a.IdWeb, 0) <> 1

    LEFT JOIN EmpleadoCj o_cj
        ON o_cj.IdEmpleado = a.IdValidador
       AND ISNULL(a.IdWeb, 0) = 1

    ------------------------------------------------------------
    -- GESTOR
    ------------------------------------------------------------
    LEFT JOIN Empleado p_emp
        ON p_emp.IdEmpleado = a.IdGestor
       AND ISNULL(a.IdWeb, 0) <> 1

    LEFT JOIN EmpleadoCj p_cj
        ON p_cj.IdEmpleado = a.IdGestor
       AND ISNULL(a.IdWeb, 0) = 1

    ------------------------------------------------------------
    -- ESTADOS Y OTROS MAESTROS
    ------------------------------------------------------------
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

    ------------------------------------------------------------
    -- FILTROS PRINCIPALES
    ------------------------------------------------------------
    WHERE
    (
        NULLIF(LTRIM(RTRIM(@Estados)), '') IS NULL
        OR EXISTS
        (
            SELECT 1
            FROM @EstadosFiltro estadoFiltro
            WHERE estadoFiltro.Estado = a.Estado
        )
    )

    AND
    (
        @Correlativo IS NULL
        OR a.Correlativo = @Correlativo
    )

    AND
    (
        @IdValidador IS NULL
        OR a.IdValidador = @IdValidador
    )

    AND
    (
        @IdBanco IS NULL
        OR a.IdBanco = @IdBanco
    )

    ------------------------------------------------------------
    -- FECHA INICIO
    ------------------------------------------------------------
    AND
    (
        NULLIF(LTRIM(RTRIM(@TextoBusqueda)), '') IS NOT NULL
        OR @FechaInicio IS NULL

        OR
        (
            @IncluyeEstado4 = 1
            AND a.FechaDeposito IS NOT NULL
            AND COALESCE(
                TRY_CONVERT(DATE, a.FechaDeposito, 101),
                TRY_CONVERT(DATE, a.FechaDeposito, 103),
                TRY_CONVERT(DATE, a.FechaDeposito, 23),
                TRY_CONVERT(DATE, a.FechaDeposito, 120),
                TRY_CONVERT(DATE, a.FechaDeposito, 126)
            ) >= @FechaInicio
        )

        OR
        (
            @IncluyeEstado4 = 0
            AND COALESCE(
                TRY_CONVERT(DATE, a.FecIngreso, 101),
                TRY_CONVERT(DATE, a.FecIngreso, 103),
                TRY_CONVERT(DATE, a.FecIngreso, 23),
                TRY_CONVERT(DATE, a.FecIngreso, 120),
                TRY_CONVERT(DATE, a.FecIngreso, 126)
            ) >= @FechaInicio
        )
    )

    ------------------------------------------------------------
    -- FECHA FIN
    ------------------------------------------------------------
    AND
    (
        NULLIF(LTRIM(RTRIM(@TextoBusqueda)), '') IS NOT NULL
        OR @FechaFin IS NULL

        OR
        (
            @IncluyeEstado4 = 1
            AND a.FechaDeposito IS NOT NULL
            AND COALESCE(
                TRY_CONVERT(DATE, a.FechaDeposito, 101),
                TRY_CONVERT(DATE, a.FechaDeposito, 103),
                TRY_CONVERT(DATE, a.FechaDeposito, 23),
                TRY_CONVERT(DATE, a.FechaDeposito, 120),
                TRY_CONVERT(DATE, a.FechaDeposito, 126)
            ) < DATEADD(DAY, 1, @FechaFin)
        )

        OR
        (
            @IncluyeEstado4 = 0
            AND COALESCE(
                TRY_CONVERT(DATE, a.FecIngreso, 101),
                TRY_CONVERT(DATE, a.FecIngreso, 103),
                TRY_CONVERT(DATE, a.FecIngreso, 23),
                TRY_CONVERT(DATE, a.FecIngreso, 120),
                TRY_CONVERT(DATE, a.FecIngreso, 126)
            ) < DATEADD(DAY, 1, @FechaFin)
        )
    )

    ------------------------------------------------------------
    -- FECHA DEPOSITO
    ------------------------------------------------------------
    AND
    (
        @FechaDeposito IS NULL
        OR
        (
            a.FechaDeposito IS NOT NULL

            AND COALESCE(
                TRY_CONVERT(DATE, a.FechaDeposito, 101),
                TRY_CONVERT(DATE, a.FechaDeposito, 103),
                TRY_CONVERT(DATE, a.FechaDeposito, 23),
                TRY_CONVERT(DATE, a.FechaDeposito, 120),
                TRY_CONVERT(DATE, a.FechaDeposito, 126)
            ) >= @FechaDeposito

            AND COALESCE(
                TRY_CONVERT(DATE, a.FechaDeposito, 101),
                TRY_CONVERT(DATE, a.FechaDeposito, 103),
                TRY_CONVERT(DATE, a.FechaDeposito, 23),
                TRY_CONVERT(DATE, a.FechaDeposito, 120),
                TRY_CONVERT(DATE, a.FechaDeposito, 126)
            ) < DATEADD(DAY, 1, @FechaDeposito)
        )
    )

    ------------------------------------------------------------
    -- FILTROS GENERALES
    ------------------------------------------------------------
    AND
    (
        @OT IS NULL
        OR LTRIM(RTRIM(ISNULL(a.Ot, '')))
           = LTRIM(RTRIM(@OT))
    )

    AND
    (
        @IdOc IS NULL
        OR LTRIM(RTRIM(ISNULL(a.IdOc, '')))
           = LTRIM(RTRIM(@IdOc))
    )

    AND
    (
        @Fila IS NULL
        OR LTRIM(RTRIM(ISNULL(CONVERT(VARCHAR(50), a.Fila), '')))
           = LTRIM(RTRIM(@Fila))
    )

    AND
    (
        @IdSite IS NULL
        OR LTRIM(RTRIM(ISNULL(a.IdSite, '')))
           = LTRIM(RTRIM(@IdSite))
    )

    AND
    (
        @IdCliente IS NULL
        OR a.IdCliente = @IdCliente
    )

    AND
    (
        @IdProyecto IS NULL
        OR a.IdProyecto = @IdProyecto
    )

    AND
    (
        @TipoTrabajo IS NULL
        OR LTRIM(RTRIM(ISNULL(a.Tipo_Trabajo, '')))
           = LTRIM(RTRIM(@TipoTrabajo))
    )

    AND
    (
        @CorSite IS NULL
        OR a.CorreSite = TRY_CONVERT(INT, @CorSite)
    )

    ------------------------------------------------------------
    -- NUEVO FILTRO POR TAREA
    ------------------------------------------------------------
    AND
    (
        @IdTarea IS NULL
        OR a.IdTarea = @IdTarea
    )

    ------------------------------------------------------------
    -- BUSQUEDA DE TEXTO
    ------------------------------------------------------------
    AND
    (
        NULLIF(LTRIM(RTRIM(@TextoBusqueda)), '') IS NULL

        OR CONVERT(VARCHAR(20), a.Correlativo)
            LIKE '%' + LTRIM(RTRIM(@TextoBusqueda)) + '%'

        OR LTRIM(RTRIM(ISNULL(a.Ot, '')))
            LIKE '%' + LTRIM(RTRIM(@TextoBusqueda)) + '%'

        OR LTRIM(RTRIM(ISNULL(a.IdOc, '')))
            LIKE '%' + LTRIM(RTRIM(@TextoBusqueda)) + '%'

        OR LTRIM(RTRIM(ISNULL(f_emp.NombreEmpleado, '')))
            LIKE '%' + LTRIM(RTRIM(@TextoBusqueda)) + '%'

        OR LTRIM(RTRIM(ISNULL(g.NombreCliente, '')))
            LIKE '%' + LTRIM(RTRIM(@TextoBusqueda)) + '%'

        OR LTRIM(RTRIM(ISNULL(b.NombreProyecto, '')))
            LIKE '%' + LTRIM(RTRIM(@TextoBusqueda)) + '%'

        OR LTRIM(RTRIM(ISNULL(c.NombreSite, '')))
            LIKE '%' + LTRIM(RTRIM(@TextoBusqueda)) + '%'

        OR LTRIM(RTRIM(ISNULL(a.Tipo_Trabajo, '')))
            LIKE '%' + LTRIM(RTRIM(@TextoBusqueda)) + '%'

        OR LTRIM(RTRIM(ISNULL(e.ValorIni, '')))
            LIKE '%' + LTRIM(RTRIM(@TextoBusqueda)) + '%'
    )

    ------------------------------------------------------------
    -- FILTRO SOLICITANTE / PERMISOS
    ------------------------------------------------------------
    AND
    (
        @FiltrarPorSolicitante = 0

        OR
        (
            ISNULL(a.IdWeb, 0) = 1
            AND z.IdEmpleado = @IdEmpleado
        )

        OR
        (
            ISNULL(a.IdWeb, 0) <> 1
            AND EXISTS
            (
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
