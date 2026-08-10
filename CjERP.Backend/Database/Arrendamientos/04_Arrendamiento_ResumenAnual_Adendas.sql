USE [JC_Db]
GO

SET ANSI_NULLS ON
GO

SET QUOTED_IDENTIFIER ON
GO

/*
    Resumen anual de arrendamientos con vigencia historica por adendas.
    La base historica se toma del primer snapshot guardado del contrato.
    Las adendas se aplican solo desde su fecha de vigencia.
*/

CREATE OR ALTER PROCEDURE [dbo].[sp_Arrendamiento_ResumenAnual]
(
    @IdInmueble   INT = NULL,
    @IdInquilino  INT = NULL,
    @IdArrendador INT = NULL,
    @AnioInicio   INT = NULL,
    @AnioFin      INT = NULL
)
AS
BEGIN
    SET NOCOUNT ON;

    SET @AnioInicio = ISNULL(@AnioInicio, YEAR(GETDATE()) - 1);
    SET @AnioFin = ISNULL(@AnioFin, YEAR(GETDATE()) + 3);

    IF @AnioInicio > @AnioFin
    BEGIN
        THROW 50001, 'El ano inicial no puede ser mayor que el ano final.', 1;
    END;

    IF @AnioFin - @AnioInicio > 50
    BEGIN
        THROW 50002, 'El rango maximo permitido es de 50 anos.', 1;
    END;

    DECLARE @FechaDesde DATE = DATEFROMPARTS(@AnioInicio, 1, 1);
    DECLARE @FechaHasta DATE = DATEFROMPARTS(@AnioFin, 12, 31);

    ;WITH CalendarioMeses AS
    (
        SELECT @FechaDesde AS FechaMes

        UNION ALL

        SELECT DATEADD(MONTH, 1, FechaMes)
        FROM CalendarioMeses
        WHERE DATEADD(MONTH, 1, FechaMes) <= @FechaHasta
    ),
    Contratos AS
    (
        SELECT
            c.IdContrato,
            c.CodigoContrato,
            c.IdArrendador,
            c.IdInquilino,
            c.IdInmueble,
            c.IdUnidadPrincipal,
            c.FechaInicio,
            c.FechaFin,
            c.EstadoContrato,
            c.Moneda,
            c.MonedaAlquiler,
            c.MonedaMantenimiento,
            c.MonedaCochera,
            c.ImporteAlquiler,
            c.PeriodicidadAlquiler,
            c.DiaLimitePago,
            c.DiasGracia,
            c.ImporteMantenimiento,
            c.PeriodicidadMantenimiento,
            c.DiaLimiteMantenimiento,
            c.ImporteCochera,
            c.PeriodicidadCochera,
            c.DiaLimiteCochera,
            c.Activo
        FROM dbo.a_contrato c
        WHERE c.Activo = 1
          AND c.FechaInicio <= @FechaHasta
          AND c.FechaFin >= @FechaDesde
          AND (@IdInmueble IS NULL OR c.IdInmueble = @IdInmueble)
          AND (@IdInquilino IS NULL OR c.IdInquilino = @IdInquilino)
          AND (@IdArrendador IS NULL OR c.IdArrendador = @IdArrendador)
    ),
    VersionesHistoricas AS
    (
        SELECT
            c.IdContrato,
            c.CodigoContrato,
            c.IdArrendador,
            c.IdInquilino,
            c.IdInmueble,
            c.IdUnidadPrincipal,
            c.FechaInicio AS FechaInicioContrato,
            c.FechaFin AS FechaFinContrato,
            COALESCE(NULLIF(JSON_VALUE(v.CondicionesNuevasJson, '$.EstadoContrato'), ''), 'ACTIVO') AS EstadoContrato,
            v.IdContratoVersion,
            UPPER(LTRIM(RTRIM(ISNULL(v.TipoMovimiento, '')))) AS TipoMovimiento,
            COALESCE(v.FechaVigenciaDesde, CONVERT(DATE, v.FechaMovimiento), CONVERT(DATE, v.FechaCreacion), c.FechaInicio) AS VigenciaDesde,
            COALESCE(v.FechaVigenciaHasta, c.FechaFin) AS VigenciaHastaBase,
            COALESCE(
                TRY_CONVERT(DATE, JSON_VALUE(v.CondicionesNuevasJson, '$.FechaInicio')),
                CONVERT(DATE, v.FechaMovimiento),
                CONVERT(DATE, v.FechaCreacion)
            ) AS FechaInicioVigente,
            COALESCE(
                TRY_CONVERT(DATE, JSON_VALUE(v.CondicionesNuevasJson, '$.FechaFin')),
                c.FechaFin
            ) AS FechaFinVigente,
            COALESCE(TRY_CONVERT(DECIMAL(18,2), JSON_VALUE(v.CondicionesNuevasJson, '$.ImporteAlquiler')), c.ImporteAlquiler, 0) AS ImporteAlquiler,
            COALESCE(NULLIF(JSON_VALUE(v.CondicionesNuevasJson, '$.MonedaAlquiler'), ''), NULLIF(JSON_VALUE(v.CondicionesNuevasJson, '$.Moneda'), ''), c.MonedaAlquiler, c.Moneda, 'PEN') AS MonedaAlquiler,
            COALESCE(NULLIF(JSON_VALUE(v.CondicionesNuevasJson, '$.PeriodicidadAlquiler'), ''), c.PeriodicidadAlquiler, 'MENSUAL') AS PeriodicidadAlquiler,
            COALESCE(TRY_CONVERT(INT, JSON_VALUE(v.CondicionesNuevasJson, '$.DiaLimitePago')), c.DiaLimitePago, 5) AS DiaLimitePago,
            COALESCE(TRY_CONVERT(DECIMAL(18,2), JSON_VALUE(v.CondicionesNuevasJson, '$.ImporteMantenimiento')), c.ImporteMantenimiento, 0) AS ImporteMantenimiento,
            COALESCE(NULLIF(JSON_VALUE(v.CondicionesNuevasJson, '$.MonedaMantenimiento'), ''), NULLIF(JSON_VALUE(v.CondicionesNuevasJson, '$.Moneda'), ''), c.MonedaMantenimiento, c.Moneda, 'PEN') AS MonedaMantenimiento,
            COALESCE(NULLIF(JSON_VALUE(v.CondicionesNuevasJson, '$.PeriodicidadMantenimiento'), ''), c.PeriodicidadMantenimiento, 'MENSUAL') AS PeriodicidadMantenimiento,
            COALESCE(TRY_CONVERT(INT, JSON_VALUE(v.CondicionesNuevasJson, '$.DiaLimiteMantenimiento')), c.DiaLimiteMantenimiento, 5) AS DiaLimiteMantenimiento,
            COALESCE(TRY_CONVERT(DECIMAL(18,2), JSON_VALUE(v.CondicionesNuevasJson, '$.ImporteCochera')), c.ImporteCochera, 0) AS ImporteCochera,
            COALESCE(NULLIF(JSON_VALUE(v.CondicionesNuevasJson, '$.MonedaCochera'), ''), NULLIF(JSON_VALUE(v.CondicionesNuevasJson, '$.Moneda'), ''), c.MonedaCochera, c.Moneda, 'PEN') AS MonedaCochera,
            COALESCE(NULLIF(JSON_VALUE(v.CondicionesNuevasJson, '$.PeriodicidadCochera'), ''), c.PeriodicidadCochera, 'MENSUAL') AS PeriodicidadCochera,
            COALESCE(TRY_CONVERT(INT, JSON_VALUE(v.CondicionesNuevasJson, '$.DiaLimiteCochera')), c.DiaLimiteCochera, 5) AS DiaLimiteCochera,
            COALESCE(NULLIF(JSON_VALUE(v.CondicionesNuevasJson, '$.Moneda'), ''), c.Moneda, 'PEN') AS MonedaContrato
        FROM Contratos c
        INNER JOIN dbo.a_contrato_version v
            ON v.IdContrato = c.IdContrato
        WHERE v.CondicionesNuevasJson IS NOT NULL
          AND UPPER(LTRIM(RTRIM(ISNULL(v.TipoMovimiento, '')))) <> 'CREACION'
    ),
    VersionBaseContrato AS
    (
        SELECT
            c.IdContrato,
            c.CodigoContrato,
            c.IdArrendador,
            c.IdInquilino,
            c.IdInmueble,
            c.IdUnidadPrincipal,
            c.FechaInicio AS FechaInicioContrato,
            c.FechaFin AS FechaFinContrato,
            COALESCE(NULLIF(JSON_VALUE(v0.CondicionesNuevasJson, '$.EstadoContrato'), ''), c.EstadoContrato) AS EstadoContrato,
            CAST(NULL AS INT) AS IdContratoVersion,
            CAST('BASE' AS NVARCHAR(30)) AS TipoMovimiento,
            c.FechaInicio AS VigenciaDesde,
            c.FechaFin AS VigenciaHastaBase,
            COALESCE(
                TRY_CONVERT(DATE, JSON_VALUE(v0.CondicionesNuevasJson, '$.FechaInicio')),
                c.FechaInicio
            ) AS FechaInicioVigente,
            COALESCE(
                TRY_CONVERT(DATE, JSON_VALUE(v0.CondicionesNuevasJson, '$.FechaFin')),
                c.FechaFin
            ) AS FechaFinVigente,
            COALESCE(TRY_CONVERT(DECIMAL(18,2), JSON_VALUE(v0.CondicionesNuevasJson, '$.ImporteAlquiler')), c.ImporteAlquiler, 0) AS ImporteAlquiler,
            COALESCE(NULLIF(JSON_VALUE(v0.CondicionesNuevasJson, '$.MonedaAlquiler'), ''), NULLIF(JSON_VALUE(v0.CondicionesNuevasJson, '$.Moneda'), ''), c.MonedaAlquiler, c.Moneda, 'PEN') AS MonedaAlquiler,
            COALESCE(NULLIF(JSON_VALUE(v0.CondicionesNuevasJson, '$.PeriodicidadAlquiler'), ''), c.PeriodicidadAlquiler, 'MENSUAL') AS PeriodicidadAlquiler,
            COALESCE(TRY_CONVERT(INT, JSON_VALUE(v0.CondicionesNuevasJson, '$.DiaLimitePago')), c.DiaLimitePago, 5) AS DiaLimitePago,
            COALESCE(TRY_CONVERT(DECIMAL(18,2), JSON_VALUE(v0.CondicionesNuevasJson, '$.ImporteMantenimiento')), c.ImporteMantenimiento, 0) AS ImporteMantenimiento,
            COALESCE(NULLIF(JSON_VALUE(v0.CondicionesNuevasJson, '$.MonedaMantenimiento'), ''), NULLIF(JSON_VALUE(v0.CondicionesNuevasJson, '$.Moneda'), ''), c.MonedaMantenimiento, c.Moneda, 'PEN') AS MonedaMantenimiento,
            COALESCE(NULLIF(JSON_VALUE(v0.CondicionesNuevasJson, '$.PeriodicidadMantenimiento'), ''), c.PeriodicidadMantenimiento, 'MENSUAL') AS PeriodicidadMantenimiento,
            COALESCE(TRY_CONVERT(INT, JSON_VALUE(v0.CondicionesNuevasJson, '$.DiaLimiteMantenimiento')), c.DiaLimiteMantenimiento, 5) AS DiaLimiteMantenimiento,
            COALESCE(TRY_CONVERT(DECIMAL(18,2), JSON_VALUE(v0.CondicionesNuevasJson, '$.ImporteCochera')), c.ImporteCochera, 0) AS ImporteCochera,
            COALESCE(NULLIF(JSON_VALUE(v0.CondicionesNuevasJson, '$.MonedaCochera'), ''), NULLIF(JSON_VALUE(v0.CondicionesNuevasJson, '$.Moneda'), ''), c.MonedaCochera, c.Moneda, 'PEN') AS MonedaCochera,
            COALESCE(NULLIF(JSON_VALUE(v0.CondicionesNuevasJson, '$.PeriodicidadCochera'), ''), c.PeriodicidadCochera, 'MENSUAL') AS PeriodicidadCochera,
            COALESCE(TRY_CONVERT(INT, JSON_VALUE(v0.CondicionesNuevasJson, '$.DiaLimiteCochera')), c.DiaLimiteCochera, 5) AS DiaLimiteCochera,
            COALESCE(NULLIF(JSON_VALUE(v0.CondicionesNuevasJson, '$.Moneda'), ''), c.Moneda, 'PEN') AS MonedaContrato
        FROM Contratos c
        OUTER APPLY
        (
            SELECT TOP (1)
                v.CondicionesNuevasJson
            FROM dbo.a_contrato_version v
            WHERE v.IdContrato = c.IdContrato
              AND v.CondicionesNuevasJson IS NOT NULL
            ORDER BY
                COALESCE(v.FechaVigenciaDesde, CONVERT(DATE, v.FechaMovimiento), CONVERT(DATE, v.FechaCreacion), c.FechaInicio) ASC,
                v.IdContratoVersion ASC
        ) v0
    ),
    VersionesBase AS
    (
        SELECT
            IdContrato,
            CodigoContrato,
            IdArrendador,
            IdInquilino,
            IdInmueble,
            IdUnidadPrincipal,
            FechaInicioContrato,
            FechaFinContrato,
            EstadoContrato,
            IdContratoVersion,
            TipoMovimiento,
            VigenciaDesde,
            VigenciaHastaBase,
            FechaInicioVigente,
            FechaFinVigente,
            ImporteAlquiler,
            MonedaAlquiler,
            PeriodicidadAlquiler,
            DiaLimitePago,
            ImporteMantenimiento,
            MonedaMantenimiento,
            PeriodicidadMantenimiento,
            DiaLimiteMantenimiento,
            ImporteCochera,
            MonedaCochera,
            PeriodicidadCochera,
            DiaLimiteCochera,
            MonedaContrato
        FROM VersionBaseContrato

        UNION ALL

        SELECT
            IdContrato,
            CodigoContrato,
            IdArrendador,
            IdInquilino,
            IdInmueble,
            IdUnidadPrincipal,
            FechaInicioContrato,
            FechaFinContrato,
            EstadoContrato,
            IdContratoVersion,
            TipoMovimiento,
            VigenciaDesde,
            VigenciaHastaBase,
            FechaInicioVigente,
            FechaFinVigente,
            ImporteAlquiler,
            MonedaAlquiler,
            PeriodicidadAlquiler,
            DiaLimitePago,
            ImporteMantenimiento,
            MonedaMantenimiento,
            PeriodicidadMantenimiento,
            DiaLimiteMantenimiento,
            ImporteCochera,
            MonedaCochera,
            PeriodicidadCochera,
            DiaLimiteCochera,
            MonedaContrato
        FROM VersionesHistoricas
    ),
    VersionesRango AS
    (
        SELECT
            vb.*,
            CASE
                WHEN vb.VigenciaDesde < vb.FechaInicioContrato THEN vb.FechaInicioContrato
                ELSE vb.VigenciaDesde
            END AS VigenciaDesdeCalc,
            LEAD(vb.VigenciaDesde) OVER
            (
                PARTITION BY vb.IdContrato
                ORDER BY vb.VigenciaDesde,
                         CASE WHEN vb.TipoMovimiento = 'BASE' THEN 0 ELSE 1 END,
                         ISNULL(vb.IdContratoVersion, 0)
            ) AS SiguienteVigenciaDesde
        FROM VersionesBase vb
    ),
    VersionesServicios AS
    (
        SELECT
            vr.IdContrato,
            vr.CodigoContrato,
            vr.IdArrendador,
            vr.IdInquilino,
            vr.IdInmueble,
            vr.IdUnidadPrincipal,
            vr.EstadoContrato,
            vr.IdContratoVersion,
            vr.TipoMovimiento,
            vr.VigenciaDesdeCalc,
            vr.VigenciaHastaCalc,
            s.OrdenServicio,
            s.Servicio,
            s.ImporteServicio,
            s.MonedaServicio,
            s.PeriodicidadServicio,
            s.DiaLimiteServicio,
            CASE
                WHEN s.PeriodicidadServicio LIKE '%MENSUAL%' THEN 1
                WHEN s.PeriodicidadServicio LIKE '%BIMESTRAL%' OR s.PeriodicidadServicio LIKE '%CADA 2 MES%' THEN 2
                WHEN s.PeriodicidadServicio LIKE '%TRIMESTRAL%' OR s.PeriodicidadServicio LIKE '%CADA 3 MES%' THEN 3
                WHEN s.PeriodicidadServicio LIKE '%CUATRIMESTRAL%' OR s.PeriodicidadServicio LIKE '%CADA 4 MES%' THEN 4
                WHEN s.PeriodicidadServicio LIKE '%SEMESTRAL%' OR s.PeriodicidadServicio LIKE '%CADA 6 MES%' THEN 6
                WHEN s.PeriodicidadServicio LIKE '%ANUAL%' OR s.PeriodicidadServicio LIKE '%CADA 12 MES%' THEN 12
                ELSE 1
            END AS FrecuenciaMeses
        FROM
        (
            SELECT
                vr.*,
                CASE
                    WHEN vr.SiguienteVigenciaDesde IS NULL THEN vr.VigenciaHastaBase
                    WHEN vr.VigenciaHastaBase IS NULL THEN DATEADD(DAY, -1, vr.SiguienteVigenciaDesde)
                    WHEN vr.VigenciaHastaBase > DATEADD(DAY, -1, vr.SiguienteVigenciaDesde) THEN DATEADD(DAY, -1, vr.SiguienteVigenciaDesde)
                    ELSE vr.VigenciaHastaBase
                END AS VigenciaHastaCalc
            FROM VersionesRango vr
        ) vr
        CROSS APPLY
        (
            VALUES
            (
                1,
                'ALQUILER',
                COALESCE(vr.ImporteAlquiler, 0),
                COALESCE(vr.MonedaAlquiler, vr.MonedaContrato, 'PEN'),
                UPPER(LTRIM(RTRIM(ISNULL(vr.PeriodicidadAlquiler, 'MENSUAL')))),
                vr.DiaLimitePago
            ),
            (
                2,
                'MANTENIMIENTO',
                COALESCE(vr.ImporteMantenimiento, 0),
                COALESCE(vr.MonedaMantenimiento, vr.MonedaContrato, 'PEN'),
                UPPER(LTRIM(RTRIM(ISNULL(vr.PeriodicidadMantenimiento, 'MENSUAL')))),
                vr.DiaLimiteMantenimiento
            ),
            (
                3,
                'COCHERA',
                COALESCE(vr.ImporteCochera, 0),
                COALESCE(vr.MonedaCochera, vr.MonedaContrato, 'PEN'),
                UPPER(LTRIM(RTRIM(ISNULL(vr.PeriodicidadCochera, 'MENSUAL')))),
                vr.DiaLimiteCochera
            )
        ) s
        (
            OrdenServicio,
            Servicio,
            ImporteServicio,
            MonedaServicio,
            PeriodicidadServicio,
            DiaLimiteServicio
        )
        WHERE ISNULL(s.ImporteServicio, 0) <> 0
          AND vr.VigenciaDesdeCalc IS NOT NULL
          AND vr.VigenciaHastaCalc IS NOT NULL
          AND vr.VigenciaDesdeCalc <= vr.VigenciaHastaCalc
    ),
    CuotasBase AS
    (
        SELECT
            vs.IdContrato,
            vs.CodigoContrato,
            vs.IdArrendador,
            vs.IdInquilino,
            vs.IdInmueble,
            vs.IdUnidadPrincipal,
            vs.EstadoContrato,
            vs.OrdenServicio,
            vs.Servicio,
            vs.MonedaServicio AS Moneda,
            vs.PeriodicidadServicio AS Periodicidad,
            vs.DiaLimiteServicio,
            cm.FechaMes,
            YEAR(cm.FechaMes) AS Anio,
            MONTH(cm.FechaMes) AS Mes,
            DATENAME(MONTH, cm.FechaMes) AS NombreMes,
            vs.ImporteServicio,
            ROW_NUMBER() OVER
            (
                PARTITION BY
                    vs.IdContrato,
                    vs.Servicio,
                    vs.MonedaServicio,
                    YEAR(cm.FechaMes),
                    MONTH(cm.FechaMes)
                ORDER BY
                    vs.VigenciaDesdeCalc DESC,
                    CASE WHEN vs.TipoMovimiento = 'BASE' THEN 0 ELSE 1 END DESC,
                    ISNULL(vs.IdContratoVersion, 0) DESC
            ) AS RN
        FROM VersionesServicios vs
        INNER JOIN CalendarioMeses cm
            ON cm.FechaMes >= DATEFROMPARTS(YEAR(vs.VigenciaDesdeCalc), MONTH(vs.VigenciaDesdeCalc), 1)
           AND cm.FechaMes <= DATEFROMPARTS(YEAR(vs.VigenciaHastaCalc), MONTH(vs.VigenciaHastaCalc), 1)
        WHERE DATEDIFF
              (
                  MONTH,
                  DATEFROMPARTS(YEAR(vs.VigenciaDesdeCalc), MONTH(vs.VigenciaDesdeCalc), 1),
                  cm.FechaMes
              ) % vs.FrecuenciaMeses = 0
    ),
    ContratoMensual AS
    (
        SELECT
            cb.IdContrato,
            cb.CodigoContrato,
            cb.IdArrendador,
            cb.IdInquilino,
            cb.IdInmueble,
            cb.IdUnidadPrincipal,
            cb.EstadoContrato,
            cb.OrdenServicio,
            cb.Servicio,
            cb.Moneda,
            cb.Periodicidad,
            cb.Anio,
            cb.Mes,
            COUNT(1) AS NumeroCuotas,
            CAST(SUM(cb.ImporteServicio) AS DECIMAL(18,2)) AS ImporteContratoMensual
        FROM CuotasBase cb
        WHERE cb.RN = 1
        GROUP BY
            cb.IdContrato,
            cb.CodigoContrato,
            cb.IdArrendador,
            cb.IdInquilino,
            cb.IdInmueble,
            cb.IdUnidadPrincipal,
            cb.EstadoContrato,
            cb.OrdenServicio,
            cb.Servicio,
            cb.Moneda,
            cb.Periodicidad,
            cb.Anio,
            cb.Mes
    ),
    PagosNormalizados AS
    (
        SELECT
            p.IdPago,
            p.IdInquilino,
            p.IdArrendador,
            YEAR(p.FechaOperacion) AS Anio,
            MONTH(p.FechaOperacion) AS Mes,
            UPPER(LTRIM(RTRIM(p.MonedaOperacion))) AS Moneda,
            UPPER(LTRIM(RTRIM(ISNULL(p.TipoPago, 'COMPLETO')))) AS TipoPago,
            CASE
                WHEN UPPER(LTRIM(RTRIM(ISNULL(p.ConceptoPago, '')))) LIKE '%ALQUILER%' THEN 'ALQUILER'
                WHEN UPPER(LTRIM(RTRIM(ISNULL(p.ConceptoPago, '')))) LIKE '%MANTENIMIENTO%' THEN 'MANTENIMIENTO'
                WHEN UPPER(LTRIM(RTRIM(ISNULL(p.ConceptoPago, '')))) LIKE '%COCHERA%' THEN 'COCHERA'
                ELSE UPPER(LTRIM(RTRIM(ISNULL(p.ConceptoPago, 'SIN CONCEPTO'))))
            END AS Servicio,
            CAST(ISNULL(NULLIF(p.ImporteOriginal, 0), p.ImporteTransferido) AS DECIMAL(18,2)) AS ImporteBase
        FROM dbo.a_pago p
        WHERE p.Activo = 1
          AND p.FechaOperacion >= @FechaDesde
          AND p.FechaOperacion <= @FechaHasta
          AND (@IdInquilino IS NULL OR p.IdInquilino = @IdInquilino)
          AND (@IdArrendador IS NULL OR p.IdArrendador = @IdArrendador)
          AND UPPER(LTRIM(RTRIM(ISNULL(p.EstadoValidacion, '')))) NOT IN ('RECHAZADO', 'ANULADO')
    ),
    PagosMensuales AS
    (
        SELECT
            pn.IdInquilino,
            pn.IdArrendador,
            pn.Anio,
            pn.Mes,
            pn.Moneda,
            pn.Servicio,
            CASE
                WHEN SUM(CASE WHEN pn.TipoPago = 'EXONERADO' THEN 1 ELSE 0 END) > 0 THEN 'EXONERADO'
                ELSE 'COMPLETO'
            END AS TipoPago,
            COUNT(DISTINCT pn.IdPago) AS CantidadPagos,
            CAST(SUM(CASE WHEN pn.TipoPago = 'EXONERADO' THEN 0 ELSE pn.ImporteBase END) AS DECIMAL(18,2)) AS ImportePagadoMensual,
            CAST(SUM(CASE WHEN pn.TipoPago = 'EXONERADO' THEN pn.ImporteBase ELSE 0 END) AS DECIMAL(18,2)) AS ImporteExoneradoMensual
        FROM PagosNormalizados pn
        WHERE pn.Servicio IN ('ALQUILER', 'MANTENIMIENTO', 'COCHERA')
        GROUP BY
            pn.IdInquilino,
            pn.IdArrendador,
            pn.Anio,
            pn.Mes,
            pn.Moneda,
            pn.Servicio
    ),
    ResultadoBase AS
    (
        SELECT
            cm.IdContrato,
            cm.CodigoContrato,
            cm.IdArrendador,
            cm.IdInquilino,
            cm.IdInmueble,
            cm.IdUnidadPrincipal,
            cm.EstadoContrato,
            cm.OrdenServicio,
            cm.Servicio,
            cm.Moneda,
            cm.Periodicidad,
            pm.TipoPago,
            cm.Anio,
            cm.Mes,
            cm.NumeroCuotas,
            cm.ImporteContratoMensual,
            CAST(ISNULL(pm.ImportePagadoMensual, 0) AS DECIMAL(18,2)) AS ImportePagadoMensual,
            CAST(ISNULL(pm.ImporteExoneradoMensual, 0) AS DECIMAL(18,2)) AS ImporteExoneradoMensual,
            CAST(
                CASE
                    WHEN UPPER(LTRIM(RTRIM(ISNULL(pm.TipoPago, '')))) = 'EXONERADO' THEN cm.ImporteContratoMensual
                    ELSE ISNULL(pm.ImporteExoneradoMensual, 0)
                END
                AS DECIMAL(18,2)
            ) AS ImporteExoneradoAplicadoMensual,
            ISNULL(pm.CantidadPagos, 0) AS CantidadPagos,
            CAST(cm.ImporteContratoMensual - ISNULL(pm.ImportePagadoMensual, 0) AS DECIMAL(18,2)) AS DeudaMensual,
            CAST(
                cm.ImporteContratoMensual
                - ISNULL(pm.ImportePagadoMensual, 0)
                - CASE
                    WHEN UPPER(LTRIM(RTRIM(ISNULL(pm.TipoPago, '')))) = 'EXONERADO' THEN cm.ImporteContratoMensual
                    ELSE ISNULL(pm.ImporteExoneradoMensual, 0)
                  END
                AS DECIMAL(18,2)
            ) AS SaldoRealMensual
        FROM ContratoMensual cm
        LEFT JOIN PagosMensuales pm
            ON pm.IdInquilino = cm.IdInquilino
           AND pm.IdArrendador = cm.IdArrendador
           AND pm.Anio = cm.Anio
           AND pm.Mes = cm.Mes
           AND pm.Servicio = cm.Servicio
           AND pm.Moneda = UPPER(LTRIM(RTRIM(cm.Moneda)))
    )
    SELECT
        rb.IdInmueble,
        rb.IdUnidadPrincipal,
        rb.IdContrato,
        rb.CodigoContrato,
        rb.IdArrendador,
        ar.CodigoArrendador,
        ar.RazonSocial AS Arrendador,
        rb.IdInquilino,
        iq.CodigoInquilino,
        iq.NombreComercial AS Inquilino,
        iq.RazonSocial AS RazonSocialInquilino,
        rb.EstadoContrato,
        rb.OrdenServicio,
        rb.Servicio,
        rb.Periodicidad,
        rb.Moneda,
        rb.TipoPago,
        rb.Anio,
        rb.Mes,
        CASE rb.Mes
            WHEN 1 THEN 'ENERO'
            WHEN 2 THEN 'FEBRERO'
            WHEN 3 THEN 'MARZO'
            WHEN 4 THEN 'ABRIL'
            WHEN 5 THEN 'MAYO'
            WHEN 6 THEN 'JUNIO'
            WHEN 7 THEN 'JULIO'
            WHEN 8 THEN 'AGOSTO'
            WHEN 9 THEN 'SETIEMBRE'
            WHEN 10 THEN 'OCTUBRE'
            WHEN 11 THEN 'NOVIEMBRE'
            WHEN 12 THEN 'DICIEMBRE'
        END AS NombreMes,
        CONCAT(rb.Anio, '-', RIGHT('0' + CONVERT(VARCHAR(2), rb.Mes), 2)) AS Periodo,
        rb.NumeroCuotas,
        rb.ImporteContratoMensual AS Contrato,
        rb.ImportePagadoMensual AS Pagado,
        rb.ImporteExoneradoAplicadoMensual AS Exonerado,
        CASE WHEN rb.SaldoRealMensual < 0 THEN 0 ELSE rb.SaldoRealMensual END AS Debe,
        CASE WHEN rb.SaldoRealMensual < 0 THEN 0 ELSE rb.SaldoRealMensual END AS SaldoReal,
        CAST(SUM(rb.ImporteContratoMensual) OVER (PARTITION BY rb.IdContrato, rb.Anio, rb.Servicio, rb.Moneda) AS DECIMAL(18,2)) AS TotalContratoAnualServicio,
        CAST(SUM(rb.ImportePagadoMensual) OVER (PARTITION BY rb.IdContrato, rb.Anio, rb.Servicio, rb.Moneda) AS DECIMAL(18,2)) AS TotalPagadoAnualServicio,
        CAST(SUM(rb.ImporteExoneradoAplicadoMensual) OVER (PARTITION BY rb.IdContrato, rb.Anio, rb.Servicio, rb.Moneda) AS DECIMAL(18,2)) AS TotalExoneradoAnualServicio,
        CAST(
            SUM(rb.ImporteContratoMensual) OVER (PARTITION BY rb.IdContrato, rb.Anio, rb.Servicio, rb.Moneda)
            - SUM(rb.ImportePagadoMensual) OVER (PARTITION BY rb.IdContrato, rb.Anio, rb.Servicio, rb.Moneda)
            - SUM(rb.ImporteExoneradoAplicadoMensual) OVER (PARTITION BY rb.IdContrato, rb.Anio, rb.Servicio, rb.Moneda)
            AS DECIMAL(18,2)
        ) AS TotalDebeAnualServicio,
        CAST(
            SUM(rb.SaldoRealMensual) OVER
            (
                PARTITION BY rb.IdContrato, rb.Servicio, rb.Moneda
                ORDER BY rb.Anio, rb.Mes
                ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
            )
            AS DECIMAL(18,2)
        ) AS SaldoAcumulado,
        rb.CantidadPagos
    FROM ResultadoBase rb
    INNER JOIN dbo.a_inquilino iq
        ON iq.IdInquilino = rb.IdInquilino
    INNER JOIN dbo.a_arrendador ar
        ON ar.IdArrendador = rb.IdArrendador
    ORDER BY
        iq.NombreComercial,
        rb.IdInmueble,
        rb.IdContrato,
        rb.OrdenServicio,
        rb.Anio,
        rb.Mes
    OPTION (MAXRECURSION 32767);
END
GO
