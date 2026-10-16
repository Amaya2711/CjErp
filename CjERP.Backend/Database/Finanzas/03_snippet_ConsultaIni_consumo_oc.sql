/* ================================================================
   SNIPPET (NO ES UN SCRIPT COMPLETO) para dbo.sp_Planilla_ConsultaIni
   Alimenta la columna "% OC" y el semaforo "Estado OC" en la pestana TOTAL ORDENES de
   pagos_v2 (esa pestana lee sp_Planilla_ConsultaIni vía /api/tesoreria/pagos/v1; las demas
   pestanas leen sp_Planilla_Consulta_Estados, que ya trae estas columnas en el script
   Database/Planilla/05).

   ⚠ REGLA CRITICA (AGENTS.md): NO reemplazar el SP vigente con
   02_sp_Planilla_ConsultaIni_v2.sql: ese archivo es una copia de prueba y convierte
   Subtotal/IGV/Total x3.8 cuando TipoMoneda <> 1, lo que NO debe ocurrir.
   Aplicar estos cambios sobre el SP VIGENTE en JC_Db (SSMS > Script Stored Procedure as >
   ALTER To), comparando antes con su definicion actual.

   PASO 1 - (sin CTE) crear antes el indice Database/Planilla/06_ix_Planilla_IdOc_Estado.sql
            para que el calculo por fila sea rapido. NO usar un CTE que agrupe todo Planilla.

   PASO 2 - en la lista de columnas del SELECT (por ejemplo junto a "a5.IdEstado AS IdEstadoOc"):

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

   PASO 3 - en el FROM, junto a "LEFT JOIN DetOrdenCompra a5 ...":

    LEFT JOIN dbo.CabOrdenCompra coc
        ON coc.IdOc = TRY_CONVERT(INT, a.IdOc)
    OUTER APPLY
    (
        SELECT CAST(SUM(ISNULL(po.Subtotal, 0)) AS DECIMAL(18, 2)) AS PagadoOc
        FROM dbo.Planilla po
        WHERE po.Estado = 4
          AND NULLIF(LTRIM(RTRIM(CONVERT(VARCHAR(50), a.IdOc))), '') IS NOT NULL
          AND po.IdOc = a.IdOc
    ) ocp

   Verificacion (el frontend ya lee estos 3 campos):
       exec dbo.sp_Planilla_ConsultaIni @Correlativo = <un recibo con OC>;
   debe devolver EstadoOcSemaforo, TotalOcConsumo y PagadoOcConsumo.
   ================================================================ */
