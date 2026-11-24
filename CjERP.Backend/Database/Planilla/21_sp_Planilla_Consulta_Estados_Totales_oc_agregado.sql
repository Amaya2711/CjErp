/* ================================================================
   dbo.sp_Planilla_Consulta_Estados_Totales  (NUEVO; NO reemplaza sp_Planilla_Consulta_Estados)

   Totales financieros diferidos de la grilla de pagos_v2. Recibe los correlativos que la grilla ya
   muestra (@Correlativos = '123,456,...', salidos de sp_Planilla_Consulta_Estados_Ligero) y calcula,
   con la MISMA logica de las etapas 3 a 6 de sp_Planilla_Consulta_Estados (script Planilla/11):
     - Total pagado (Estado 4) por OT / sitio y por moneda  -> TotalSubtotalPorMoneda,
       TotalPagadoConvertidoSoles, MonedasPagadoOt
     - Totales de Importar por OT / sitio                    -> TotalMontoBckPorMoneda,
       TotalMontoVisiblePorMoneda, TotalMontoBckSoles, TotalMontoVisibleSoles, MonedasImportarOt
     - Pagado por OC y por OC + Fila (Estado 4)              -> PagadoOcConsumo, PagadoOcFila
     - Agrupacion bancaria Scotiabank / BCP                  -> TotalPlanillaBase, TotalPagar

   DIFERENCIA de rendimiento: los agregados historicos (Estado 4 / Importar) se calculan solo para los
   SITIOS (IdCliente, IdProyecto, IdSite, CorreSite) de los recibos pedidos, no para toda la tabla.
   El importe sigue siendo el historico completo del sitio/OT (no se limita al periodo de la grilla).
   Reglas financieras sin cambios: Subtotal en la moneda real; el equivalente en soles usa los
   TipoCambioUSD/EUR/DOP/COP recibidos (nunca un 3.8 fijo salvo los mismos valores por defecto del original).

   Devuelve una fila por recibo, con la clave Corre + IdSite para que el frontend complete la grilla.
   "Suma por responsable" NO va aqui: la sigue calculando el modo SoloSumaResp del SP original.

   VERSION 21: igual al script 14 salvo el calculo de PagadoOcConsumo / PagadoOcFila, que pasa de dos CROSS APPLY
   por recibo a una sola agregacion por (IdOc, Fila). Las demas columnas no cambian. Reemplaza al SP del script 14
   (CREATE OR ALTER). Validar: ejecutar con los mismos @Correlativos antes y despues y comparar PagadoOcConsumo
   y PagadoOcFila (ver consulta de comparacion al final de este archivo).

   PV: NO ejecutado en la BD real. Validar equivalencia con 16_validacion_ligero_totales_SoloLectura.sql.
   Recomendado: ejecutar antes 15_idx_Planilla_pagado_por_site.sql y Finanzas/13 (indice por Correlativo).
   Idempotente (CREATE OR ALTER). Ejecutar en JC_Db.
   ================================================================ */
USE [JC_Db]
GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE OR ALTER PROCEDURE [dbo].[sp_Planilla_Consulta_Estados_Totales]
(
    @Correlativos   VARCHAR(MAX),
    @TipoCambioUSD  DECIMAL(18, 6) = NULL,
    @TipoCambioEUR  DECIMAL(18, 6) = NULL,
    @TipoCambioDOP  DECIMAL(18, 6) = NULL,
    @TipoCambioCOP  DECIMAL(18, 6) = NULL
)
AS
BEGIN
    SET NOCOUNT ON;

    -- Mismos tipos de cambio por defecto que sp_Planilla_Consulta_Estados.
    DECLARE @TcUsd DECIMAL(18, 6) = CASE WHEN ISNULL(@TipoCambioUSD, 0) > 0 THEN @TipoCambioUSD ELSE 3.80 END;
    DECLARE @TcEur DECIMAL(18, 6) = CASE WHEN ISNULL(@TipoCambioEUR, 0) > 0 THEN @TipoCambioEUR ELSE 3.80 END;
    DECLARE @TcDop DECIMAL(18, 6) = CASE WHEN ISNULL(@TipoCambioDOP, 0) > 0 THEN @TipoCambioDOP ELSE 0.057 END;
    DECLARE @TcCop DECIMAL(18, 6) = CASE WHEN ISNULL(@TipoCambioCOP, 0) > 0 THEN @TipoCambioCOP ELSE 0.001 END;

    CREATE TABLE #Ids (Correlativo INT NOT NULL PRIMARY KEY);

    INSERT INTO #Ids (Correlativo)
    SELECT DISTINCT TRY_CAST(LTRIM(RTRIM(value)) AS INT)
    FROM STRING_SPLIT(@Correlativos, ',')
    WHERE TRY_CAST(LTRIM(RTRIM(value)) AS INT) IS NOT NULL;

    -- Recibos pedidos (solo las columnas que usan los calculos).
    SELECT
        a.Correlativo, a.IdSite, a.IdCliente, a.IdProyecto, a.CorreSite, a.Tipo_Trabajo,
        a.IdOc, a.Fila, a.TipoMoneda, a.NroOperacion, a.TotalPagar,
        ban.ValorIni AS Banco,
        CASE WHEN UPPER(LTRIM(RTRIM(ISNULL(CONVERT(VARCHAR(50), a.OT), '')))) IN ('', '0', 'NULL') THEN '' ELSE LTRIM(RTRIM(CONVERT(VARCHAR(50), a.OT))) END AS OtNorm,
        CASE WHEN UPPER(LTRIM(RTRIM(ISNULL(CONVERT(VARCHAR(50), a.OT), '')))) IN ('', '0', 'NULL') THEN 0 ELSE 1 END AS OtValida
    INTO #K
    FROM #Ids i
    INNER JOIN dbo.Planilla a
        ON a.Correlativo = i.Correlativo
    LEFT JOIN dbo.Constante ban
        ON ban.Sociedad = 'PE01'
       AND ban.Programa = 'PLANTILLA'
       AND ban.Campo = 'BANCO'
       AND a.IdBanco = ban.Correlativo
    OPTION (RECOMPILE);

    -- Sitios implicados: los agregados historicos se acotan a ellos.
    SELECT DISTINCT IdCliente, IdProyecto, IdSite, ISNULL(CorreSite, 0) AS CorreSite
    INTO #KSite
    FROM #K;

    -- Pagado (Estado 4) por OT / sitio / moneda (misma agrupacion que el SP original).
    SELECT
            CASE WHEN UPPER(LTRIM(RTRIM(ISNULL(CONVERT(VARCHAR(50), p.OT), '')))) IN ('', '0', 'NULL') THEN '' ELSE LTRIM(RTRIM(CONVERT(VARCHAR(50), p.OT))) END AS OT,
            p.IdCliente, p.IdProyecto,
            LTRIM(RTRIM(ISNULL(CONVERT(VARCHAR(50), p.IdSite), ''))) AS IdSite,
            ISNULL(p.CorreSite, 0) AS CorreSite,
            LTRIM(RTRIM(ISNULL(p.Tipo_Trabajo, ''))) AS TipoTrabajo,
            p.TipoMoneda,
            CAST(SUM(ISNULL(p.Subtotal, 0)) AS DECIMAL(18, 2)) AS TotalSubtotalPorMoneda,
            CAST(SUM(ISNULL(p.Subtotal, 0) * CASE p.TipoMoneda WHEN 2 THEN @TcUsd WHEN 3 THEN @TcEur WHEN 4 THEN @TcDop WHEN 5 THEN @TcCop ELSE 1 END) AS DECIMAL(18, 2)) AS SubtotalPorMonedaEnSoles
    INTO #PlanillaOT
    FROM dbo.Planilla p
    WHERE p.Estado = 4
      AND EXISTS (
            SELECT 1
            FROM #KSite ks
            WHERE ks.IdCliente = p.IdCliente
              AND ks.IdProyecto = p.IdProyecto
              AND ks.IdSite = p.IdSite
              AND ks.CorreSite = ISNULL(p.CorreSite, 0))
    GROUP BY CASE WHEN UPPER(LTRIM(RTRIM(ISNULL(CONVERT(VARCHAR(50), p.OT), '')))) IN ('', '0', 'NULL') THEN '' ELSE LTRIM(RTRIM(CONVERT(VARCHAR(50), p.OT))) END, p.IdCliente, p.IdProyecto,
        LTRIM(RTRIM(ISNULL(CONVERT(VARCHAR(50), p.IdSite), ''))), ISNULL(p.CorreSite, 0),
        LTRIM(RTRIM(ISNULL(p.Tipo_Trabajo, ''))), p.TipoMoneda
    OPTION (RECOMPILE);

    SELECT
            OT, IdCliente, IdProyecto, IdSite, CorreSite, TipoTrabajo,
            CAST(SUM(SubtotalPorMonedaEnSoles) AS DECIMAL(18, 2)) AS TotalPagadoConvertidoSoles,
            STRING_AGG(CONVERT(VARCHAR(3), TipoMoneda), ',') AS MonedasPagado
    INTO #PlanillaOTConv
    FROM #PlanillaOT
    GROUP BY OT, IdCliente, IdProyecto, IdSite, CorreSite, TipoTrabajo;

    SELECT
            IdCliente, IdProyecto, IdSite, CorreSite, TipoTrabajo, TipoMoneda,
            CAST(SUM(TotalSubtotalPorMoneda) AS DECIMAL(18, 2)) AS TotalSubtotalPorMoneda,
            CAST(SUM(SubtotalPorMonedaEnSoles) AS DECIMAL(18, 2)) AS SubtotalPorMonedaEnSoles
    INTO #PlanillaSitio
    FROM #PlanillaOT
    GROUP BY IdCliente, IdProyecto, IdSite, CorreSite, TipoTrabajo, TipoMoneda;

    SELECT
            IdCliente, IdProyecto, IdSite, CorreSite, TipoTrabajo,
            CAST(SUM(SubtotalPorMonedaEnSoles) AS DECIMAL(18, 2)) AS TotalPagadoConvertidoSoles,
            STRING_AGG(CONVERT(VARCHAR(3), TipoMoneda), ',') AS MonedasPagado
    INTO #PlanillaSitioConv
    FROM #PlanillaSitio
    GROUP BY IdCliente, IdProyecto, IdSite, CorreSite, TipoTrabajo;

    -- Importar (IdEstado = 1) por OT / sitio / moneda.
    SELECT
            CASE WHEN UPPER(LTRIM(RTRIM(ISNULL(CONVERT(VARCHAR(50), imp.OT), '')))) IN ('', '0', 'NULL') THEN '' ELSE LTRIM(RTRIM(CONVERT(VARCHAR(50), imp.OT))) END AS OT,
            imp.IdCliente, imp.IdProyecto,
            LTRIM(RTRIM(ISNULL(CONVERT(VARCHAR(50), imp.IdSite), ''))) AS IdSite,
            ISNULL(imp.Correlativo, 0) AS CorreSite,
            LTRIM(RTRIM(ISNULL(imp.TipoTrabajo, ''))) AS TipoTrabajo,
            imp.IdMoneda,
            CAST(SUM(ISNULL(imp.Monto_Bck, 0)) AS DECIMAL(18, 2)) AS TotalMontoBckPorMoneda,
            CAST(SUM(ISNULL(imp.Monto_Visible, 0)) AS DECIMAL(18, 2)) AS TotalMontoVisiblePorMoneda,
            CAST(SUM(ISNULL(imp.Monto_Bck, 0) * CASE imp.IdMoneda WHEN 2 THEN @TcUsd WHEN 3 THEN @TcEur WHEN 4 THEN @TcDop WHEN 5 THEN @TcCop ELSE 1 END) AS DECIMAL(18, 2)) AS TotalMontoBckEnSoles,
            CAST(SUM(ISNULL(imp.Monto_Visible, 0) * CASE imp.IdMoneda WHEN 2 THEN @TcUsd WHEN 3 THEN @TcEur WHEN 4 THEN @TcDop WHEN 5 THEN @TcCop ELSE 1 END) AS DECIMAL(18, 2)) AS TotalMontoVisibleEnSoles
    INTO #ImpOT
    FROM dbo.Importar imp
    WHERE imp.IdEstado = 1
      AND EXISTS (
            SELECT 1
            FROM #KSite ks
            WHERE ks.IdCliente = imp.IdCliente
              AND ks.IdProyecto = imp.IdProyecto
              AND ks.IdSite = imp.IdSite
              AND ks.CorreSite = ISNULL(imp.Correlativo, 0))
    GROUP BY CASE WHEN UPPER(LTRIM(RTRIM(ISNULL(CONVERT(VARCHAR(50), imp.OT), '')))) IN ('', '0', 'NULL') THEN '' ELSE LTRIM(RTRIM(CONVERT(VARCHAR(50), imp.OT))) END, imp.IdCliente, imp.IdProyecto,
        LTRIM(RTRIM(ISNULL(CONVERT(VARCHAR(50), imp.IdSite), ''))), ISNULL(imp.Correlativo, 0),
        LTRIM(RTRIM(ISNULL(imp.TipoTrabajo, ''))), imp.IdMoneda
    OPTION (RECOMPILE);

    SELECT
            OT, IdCliente, IdProyecto, IdSite, CorreSite, TipoTrabajo,
            CAST(SUM(TotalMontoBckEnSoles) AS DECIMAL(18, 2)) AS TotalMontoBckSoles,
            CAST(SUM(TotalMontoVisibleEnSoles) AS DECIMAL(18, 2)) AS TotalMontoVisibleSoles,
            STRING_AGG(CONVERT(VARCHAR(3), IdMoneda), ',') AS MonedasImportar
    INTO #ImpOTConv
    FROM #ImpOT
    GROUP BY OT, IdCliente, IdProyecto, IdSite, CorreSite, TipoTrabajo;

    SELECT
            IdCliente, IdProyecto, IdSite, CorreSite, TipoTrabajo, IdMoneda,
            CAST(SUM(TotalMontoBckPorMoneda) AS DECIMAL(18, 2)) AS TotalMontoBckPorMoneda,
            CAST(SUM(TotalMontoVisiblePorMoneda) AS DECIMAL(18, 2)) AS TotalMontoVisiblePorMoneda,
            CAST(SUM(TotalMontoBckEnSoles) AS DECIMAL(18, 2)) AS TotalMontoBckEnSoles,
            CAST(SUM(TotalMontoVisibleEnSoles) AS DECIMAL(18, 2)) AS TotalMontoVisibleEnSoles
    INTO #ImpSitio
    FROM #ImpOT
    GROUP BY IdCliente, IdProyecto, IdSite, CorreSite, TipoTrabajo, IdMoneda;

    SELECT
            IdCliente, IdProyecto, IdSite, CorreSite, TipoTrabajo,
            CAST(SUM(TotalMontoBckEnSoles) AS DECIMAL(18, 2)) AS TotalMontoBckSoles,
            CAST(SUM(TotalMontoVisibleEnSoles) AS DECIMAL(18, 2)) AS TotalMontoVisibleSoles,
            STRING_AGG(CONVERT(VARCHAR(3), IdMoneda), ',') AS MonedasImportar
    INTO #ImpSitioConv
    FROM #ImpSitio
    GROUP BY IdCliente, IdProyecto, IdSite, CorreSite, TipoTrabajo;

    -- Resultado por recibo (valores iniciales = los del SP original antes de las etapas 3 a 6).
    SELECT
        k.Correlativo AS Corre,
        k.IdSite,
        k.IdCliente,
        k.IdProyecto,
        CAST(0 AS DECIMAL(18, 2)) AS TotalSubtotalPorMoneda,
        CAST(0 AS DECIMAL(18, 2)) AS TotalMontoBckPorMoneda,
        CAST(0 AS DECIMAL(18, 2)) AS TotalMontoVisiblePorMoneda,
        CAST(0 AS DECIMAL(18, 2)) AS TotalPagadoConvertidoSoles,
        CAST(NULL AS VARCHAR(8000)) AS MonedasPagadoOt,
        CAST(NULL AS VARCHAR(8000)) AS MonedasImportarOt,
        CAST(0 AS DECIMAL(18, 2)) AS TotalMontoBckSoles,
        CAST(0 AS DECIMAL(18, 2)) AS TotalMontoVisibleSoles,
        CAST(0 AS DECIMAL(18, 2)) AS PagadoOcConsumo,
        CAST(0 AS DECIMAL(18, 2)) AS PagadoOcFila,
        k.TotalPagar AS TotalPlanillaBase,
        k.TotalPagar AS TotalPagar,
        k.CorreSite AS h_CorreSite,
        k.Tipo_Trabajo, k.TipoMoneda, k.IdOc, k.Fila, k.NroOperacion, k.Banco,
        k.OtNorm AS h_OtNorm, k.OtValida AS h_OtValida
    INTO #R
    FROM #K k;

    -- Totales pagados por OT / sitio.
    UPDATE r
    SET TotalSubtotalPorMoneda = CAST(ISNULL(COALESCE(pot.TotalSubtotalPorMoneda, pst.TotalSubtotalPorMoneda), 0) AS DECIMAL(18, 2)),
        TotalPagadoConvertidoSoles = CAST(ISNULL(COALESCE(potc.TotalPagadoConvertidoSoles, pstc.TotalPagadoConvertidoSoles), 0) AS DECIMAL(18, 2)),
        MonedasPagadoOt = COALESCE(potc.MonedasPagado, pstc.MonedasPagado)
    FROM #R r
    LEFT JOIN #PlanillaOT pot
        ON pot.OT = r.h_OtNorm
       AND r.h_OtValida = 1
       AND ISNULL(pot.IdCliente, 0) = ISNULL(r.IdCliente, 0)
       AND ISNULL(pot.IdProyecto, 0) = ISNULL(r.IdProyecto, 0)
       AND pot.IdSite = LTRIM(RTRIM(ISNULL(CONVERT(VARCHAR(50), r.IdSite), '')))
       AND pot.CorreSite = ISNULL(r.h_CorreSite, 0)
       AND pot.TipoTrabajo = LTRIM(RTRIM(ISNULL(r.Tipo_Trabajo, '')))
       AND pot.TipoMoneda = r.TipoMoneda
    LEFT JOIN #PlanillaSitio pst
        ON r.h_OtValida = 0
       AND pst.IdCliente = r.IdCliente
       AND pst.IdProyecto = r.IdProyecto
       AND pst.IdSite = LTRIM(RTRIM(ISNULL(CONVERT(VARCHAR(50), r.IdSite), '')))
       AND pst.CorreSite = ISNULL(r.h_CorreSite, 0)
       AND pst.TipoTrabajo = LTRIM(RTRIM(ISNULL(r.Tipo_Trabajo, '')))
       AND pst.TipoMoneda = r.TipoMoneda
    LEFT JOIN #PlanillaOTConv potc
        ON potc.OT = r.h_OtNorm
       AND r.h_OtValida = 1
       AND ISNULL(potc.IdCliente, 0) = ISNULL(r.IdCliente, 0)
       AND ISNULL(potc.IdProyecto, 0) = ISNULL(r.IdProyecto, 0)
       AND potc.IdSite = LTRIM(RTRIM(ISNULL(CONVERT(VARCHAR(50), r.IdSite), '')))
       AND potc.CorreSite = ISNULL(r.h_CorreSite, 0)
       AND potc.TipoTrabajo = LTRIM(RTRIM(ISNULL(r.Tipo_Trabajo, '')))
    LEFT JOIN #PlanillaSitioConv pstc
        ON r.h_OtValida = 0
       AND pstc.IdCliente = r.IdCliente
       AND pstc.IdProyecto = r.IdProyecto
       AND pstc.IdSite = LTRIM(RTRIM(ISNULL(CONVERT(VARCHAR(50), r.IdSite), '')))
       AND pstc.CorreSite = ISNULL(r.h_CorreSite, 0)
       AND pstc.TipoTrabajo = LTRIM(RTRIM(ISNULL(r.Tipo_Trabajo, '')));

    -- Totales de Importar por OT / sitio.
    UPDATE r
    SET TotalMontoBckPorMoneda = CAST(ISNULL(COALESCE(iot.TotalMontoBckPorMoneda, ist.TotalMontoBckPorMoneda), 0) AS DECIMAL(18, 2)),
        TotalMontoVisiblePorMoneda = CAST(ISNULL(COALESCE(iot.TotalMontoVisiblePorMoneda, ist.TotalMontoVisiblePorMoneda), 0) AS DECIMAL(18, 2)),
        MonedasImportarOt = COALESCE(ioc.MonedasImportar, istc.MonedasImportar),
        TotalMontoBckSoles = CAST(ISNULL(COALESCE(ioc.TotalMontoBckSoles, istc.TotalMontoBckSoles), 0) AS DECIMAL(18, 2)),
        TotalMontoVisibleSoles = CAST(ISNULL(COALESCE(ioc.TotalMontoVisibleSoles, istc.TotalMontoVisibleSoles), 0) AS DECIMAL(18, 2))
    FROM #R r
    LEFT JOIN #ImpOT iot
        ON iot.OT = r.h_OtNorm
       AND r.h_OtValida = 1
       AND ISNULL(iot.IdCliente, 0) = ISNULL(r.IdCliente, 0)
       AND ISNULL(iot.IdProyecto, 0) = ISNULL(r.IdProyecto, 0)
       AND iot.IdSite = LTRIM(RTRIM(ISNULL(CONVERT(VARCHAR(50), r.IdSite), '')))
       AND iot.CorreSite = ISNULL(r.h_CorreSite, 0)
       AND iot.TipoTrabajo = LTRIM(RTRIM(ISNULL(r.Tipo_Trabajo, '')))
       AND iot.IdMoneda = r.TipoMoneda
    LEFT JOIN #ImpSitio ist
        ON r.h_OtValida = 0
       AND ist.IdCliente = r.IdCliente
       AND ist.IdProyecto = r.IdProyecto
       AND ist.IdSite = LTRIM(RTRIM(ISNULL(CONVERT(VARCHAR(50), r.IdSite), '')))
       AND ist.CorreSite = ISNULL(r.h_CorreSite, 0)
       AND ist.TipoTrabajo = LTRIM(RTRIM(ISNULL(r.Tipo_Trabajo, '')))
       AND ist.IdMoneda = r.TipoMoneda
    LEFT JOIN #ImpOTConv ioc
        ON ioc.OT = r.h_OtNorm
       AND r.h_OtValida = 1
       AND ISNULL(ioc.IdCliente, 0) = ISNULL(r.IdCliente, 0)
       AND ISNULL(ioc.IdProyecto, 0) = ISNULL(r.IdProyecto, 0)
       AND ioc.IdSite = LTRIM(RTRIM(ISNULL(CONVERT(VARCHAR(50), r.IdSite), '')))
       AND ioc.CorreSite = ISNULL(r.h_CorreSite, 0)
       AND ioc.TipoTrabajo = LTRIM(RTRIM(ISNULL(r.Tipo_Trabajo, '')))
    LEFT JOIN #ImpSitioConv istc
        ON r.h_OtValida = 0
       AND istc.IdCliente = r.IdCliente
       AND istc.IdProyecto = r.IdProyecto
       AND istc.IdSite = LTRIM(RTRIM(ISNULL(CONVERT(VARCHAR(50), r.IdSite), '')))
       AND istc.CorreSite = ISNULL(r.h_CorreSite, 0)
       AND istc.TipoTrabajo = LTRIM(RTRIM(ISNULL(r.Tipo_Trabajo, '')));

    -- Pagado (Estado 4) por OC y por OC + Fila en UNA sola agregacion (antes eran dos CROSS APPLY por recibo,
    -- ~1.5 s de espera en tempdb con 400 recibos). Requiere IX_Planilla_IdOc_Estado (Planilla/06).
    -- Mismo resultado: por OC = suma de todas las filas de esa OC; por OC + Fila = suma del grupo (IdOc, Fila).
    SELECT DISTINCT r.IdOc
    INTO #OcPedidas
    FROM #R r
    WHERE NULLIF(LTRIM(RTRIM(CONVERT(VARCHAR(50), r.IdOc))), '') IS NOT NULL;

    SELECT po.IdOc, po.Fila, SUM(ISNULL(po.Subtotal, 0)) AS PagadoFila
    INTO #OcFila
    FROM dbo.Planilla po
    INNER JOIN #OcPedidas op
        ON op.IdOc = po.IdOc
    WHERE po.Estado = 4
    GROUP BY po.IdOc, po.Fila;

    SELECT IdOc, SUM(PagadoFila) AS PagadoOc
    INTO #OcTot
    FROM #OcFila
    GROUP BY IdOc;

    UPDATE r
    SET PagadoOcConsumo = CAST(ISNULL(t.PagadoOc, 0) AS DECIMAL(18, 2))
    FROM #R r
    LEFT JOIN #OcTot t
        ON t.IdOc = r.IdOc
    WHERE NULLIF(LTRIM(RTRIM(CONVERT(VARCHAR(50), r.IdOc))), '') IS NOT NULL;

    -- Fila NULL no coincide (igual que el "po.Fila = r.Fila" original).
    UPDATE r
    SET PagadoOcFila = CAST(ISNULL(f.PagadoFila, 0) AS DECIMAL(18, 2))
    FROM #R r
    LEFT JOIN #OcFila f
        ON f.IdOc = r.IdOc
       AND f.Fila = r.Fila
    WHERE NULLIF(LTRIM(RTRIM(CONVERT(VARCHAR(50), r.IdOc))), '') IS NOT NULL
      AND r.Fila IS NOT NULL;

    -- Agrupado por banco (Scotiabank / BCP) para TotalPagar y TotalPlanillaBase. Solo las operaciones pedidas.
    SELECT
        LTRIM(RTRIM(p.NroOperacion)) AS NroOperacion,
        -SUM(ABS(ISNULL(p.TotalPagar, 0))) AS TotalPagarAgrupado
    INTO #PBA
    FROM dbo.Planilla p
    INNER JOIN dbo.Constante banAgrupado
        ON banAgrupado.Sociedad = 'PE01'
       AND banAgrupado.Programa = 'PLANTILLA'
       AND banAgrupado.Campo = 'BANCO'
       AND p.IdBanco = banAgrupado.Correlativo
    WHERE (UPPER(LTRIM(RTRIM(ISNULL(banAgrupado.ValorIni, '')))) LIKE '%SCOTI%'
           OR UPPER(LTRIM(RTRIM(ISNULL(banAgrupado.ValorIni, '')))) LIKE '%BCP%')
      AND LTRIM(RTRIM(p.NroOperacion)) IN (
            SELECT LTRIM(RTRIM(r.NroOperacion))
            FROM #R r
            WHERE UPPER(LTRIM(RTRIM(ISNULL(r.Banco, '')))) LIKE '%SCOTI%')
    GROUP BY LTRIM(RTRIM(p.NroOperacion));

    UPDATE r
    SET TotalPlanillaBase = pa.TotalPagarAgrupado,
        TotalPagar = pa.TotalPagarAgrupado
    FROM #R r
    LEFT JOIN #PBA pa
        ON pa.NroOperacion = LTRIM(RTRIM(r.NroOperacion))
    WHERE UPPER(LTRIM(RTRIM(ISNULL(r.Banco, '')))) LIKE '%SCOTI%';

    SELECT
        Corre, IdSite, IdCliente, IdProyecto,
        TotalSubtotalPorMoneda, TotalMontoBckPorMoneda, TotalMontoVisiblePorMoneda, TotalPagadoConvertidoSoles,
        MonedasPagadoOt, MonedasImportarOt, TotalMontoBckSoles, TotalMontoVisibleSoles,
        PagadoOcConsumo, PagadoOcFila, TotalPlanillaBase, TotalPagar
    FROM #R
    ORDER BY Corre DESC;
END;
GO

/* ================================================================
   VALIDACION (solo lectura; ejecutar DESPUES de aplicar este script). Compara el SP nuevo contra la logica
   original (dos CROSS APPLY) calculada directamente sobre dbo.Planilla. Debe devolver 0 filas.

   DECLARE @ids VARCHAR(MAX);
   SELECT @ids = STRING_AGG(CAST(Correlativo AS VARCHAR(20)), ',')
   FROM (SELECT TOP (400) Correlativo FROM dbo.Planilla WHERE Estado IN (0,2,6,7,10) ORDER BY Correlativo DESC) t;

   CREATE TABLE #nuevo (
       Corre INT, IdSite VARCHAR(50), IdCliente INT, IdProyecto INT,
       TotalSubtotalPorMoneda DECIMAL(18,2), TotalMontoBckPorMoneda DECIMAL(18,2), TotalMontoVisiblePorMoneda DECIMAL(18,2),
       TotalPagadoConvertidoSoles DECIMAL(18,2), MonedasPagadoOt VARCHAR(8000), MonedasImportarOt VARCHAR(8000),
       TotalMontoBckSoles DECIMAL(18,2), TotalMontoVisibleSoles DECIMAL(18,2),
       PagadoOcConsumo DECIMAL(18,2), PagadoOcFila DECIMAL(18,2), TotalPlanillaBase DECIMAL(18,2), TotalPagar DECIMAL(18,2));
   INSERT INTO #nuevo EXEC dbo.sp_Planilla_Consulta_Estados_Totales @Correlativos = @ids;

   SELECT n.Corre, n.PagadoOcConsumo AS ConsumoNuevo, x.PagadoOc AS ConsumoOriginal,
          n.PagadoOcFila AS FilaNuevo, y.PagadoOcFila AS FilaOriginal
   FROM #nuevo n
   JOIN dbo.Planilla p ON p.Correlativo = n.Corre
   OUTER APPLY (SELECT CAST(ISNULL(SUM(ISNULL(po.Subtotal,0)),0) AS DECIMAL(18,2)) AS PagadoOc
                FROM dbo.Planilla po WHERE po.Estado = 4 AND po.IdOc = p.IdOc) x
   OUTER APPLY (SELECT CAST(ISNULL(SUM(ISNULL(po.Subtotal,0)),0) AS DECIMAL(18,2)) AS PagadoOcFila
                FROM dbo.Planilla po WHERE po.Estado = 4 AND po.IdOc = p.IdOc AND po.Fila = p.Fila) y
   WHERE NULLIF(LTRIM(RTRIM(CONVERT(VARCHAR(50), p.IdOc))), '') IS NOT NULL
     AND (n.PagadoOcConsumo <> x.PagadoOc
          OR (p.Fila IS NOT NULL AND n.PagadoOcFila <> y.PagadoOcFila));
   ================================================================ */
