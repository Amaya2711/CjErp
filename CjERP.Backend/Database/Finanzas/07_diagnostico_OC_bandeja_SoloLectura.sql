-- DIAGNOSTICO (solo lectura): tiempos de la carga de la bandeja de Ordenes de compra
-- (/finanzas/facturacionfinanciera/oc_v1 -> GET /api/facturacionfinanciera/oc/cabecera).
-- No modifica datos. Ejecutar en la BD de produccion con "Incluir plan de ejecucion real" desactivado
-- y leer la pestaña Mensajes (tiempos en "elapsed time").
--
-- La carga hace DOS consultas seguidas:
--   [1] dbo.sp_OrdenCompra_BuscarCabecera (sin filtros: devuelve TODAS las OC)
--   [2] Enriquecimiento de validadores/solicitante sobre CabOrdenCompra para esas mismas OC.
-- [2] antes filtraba con CHARINDEX sobre una lista CSV de todas las OC (cuadratico); ahora usa STRING_SPLIT.

SET NOCOUNT ON;
SET STATISTICS TIME ON;

PRINT N'== [1] sp_OrdenCompra_BuscarCabecera sin filtros (mire el tiempo y la cantidad de filas del resultado)';
EXEC dbo.sp_OrdenCompra_BuscarCabecera
     @IdCliente = NULL, @IdProyecto = NULL, @IdSite = NULL, @Correlativo = NULL,
     @Ot = NULL, @TipoTrabajo = NULL, @IdSolicitante = NULL, @IdResponsable = NULL, @IdOc = NULL;

PRINT N'== Cantidad de OC en CabOrdenCompra';
SELECT COUNT(*) AS TotalOc FROM dbo.CabOrdenCompra;

-- Lista CSV con todas las OC (equivale a la que envia la API).
DECLARE @IdsOcCsv nvarchar(max) =
    STUFF((SELECT ',' + CONVERT(varchar(20), IdOc) FROM dbo.CabOrdenCompra ORDER BY IdOc FOR XML PATH('')), 1, 1, '');
PRINT N'Longitud de la lista CSV: ' + CONVERT(varchar(20), LEN(@IdsOcCsv)) + N' caracteres';

PRINT N'== [2a] Enriquecimiento ANTERIOR (CHARINDEX sobre la lista CSV)';
SELECT COUNT(*) AS Filas
FROM dbo.CabOrdenCompra cab
LEFT JOIN dbo.Empleado solicitanteLegacy ON solicitanteLegacy.IdEmpleado = cab.IdSolicitante AND ISNULL(cab.IdWeb, 0) <> 1
LEFT JOIN dbo.EmpleadoCj solicitanteCj ON solicitanteCj.IdEmpleado = cab.IdSolicitante AND ISNULL(cab.IdWeb, 0) = 1
LEFT JOIN dbo.EmpleadoCj solicitanteUnificado ON solicitanteUnificado.IdEmpleado = solicitanteLegacy.IdEmpleadoCj
LEFT JOIN dbo.Empleado validadorNombreLegacy ON validadorNombreLegacy.IdEmpleado = cab.IdValidador AND ISNULL(cab.IdWeb, 0) <> 1
LEFT JOIN dbo.EmpleadoCj validadorCj ON validadorCj.IdEmpleado = cab.IdValidador AND ISNULL(cab.IdWeb, 0) = 1
OUTER APPLY (
    SELECT TOP 1 detalle.IdResponsableCj, detalle.IdSegundoVacaciones, detalle.IdTerceroVacaciones
    FROM dbo.EmpleadoCjDetalle detalle
    WHERE detalle.IdEmpleadoCj = CASE WHEN ISNULL(cab.IdWeb, 0) = 1 THEN cab.IdSolicitante ELSE solicitanteLegacy.IdEmpleadoCj END
) detalleEmpleado
LEFT JOIN dbo.EmpleadoCj responsable ON responsable.IdEmpleado = detalleEmpleado.IdResponsableCj
LEFT JOIN dbo.EmpleadoCj segundo ON segundo.IdEmpleado = detalleEmpleado.IdSegundoVacaciones
LEFT JOIN dbo.EmpleadoCj tercero ON tercero.IdEmpleado = detalleEmpleado.IdTerceroVacaciones
WHERE CHARINDEX(',' + CONVERT(varchar(20), cab.IdOc) + ',', ',' + @IdsOcCsv + ',') > 0;

PRINT N'== [2b] Enriquecimiento NUEVO (STRING_SPLIT): debe devolver las mismas filas, en mucho menos tiempo';
SELECT COUNT(*) AS Filas
FROM dbo.CabOrdenCompra cab
LEFT JOIN dbo.Empleado solicitanteLegacy ON solicitanteLegacy.IdEmpleado = cab.IdSolicitante AND ISNULL(cab.IdWeb, 0) <> 1
LEFT JOIN dbo.EmpleadoCj solicitanteCj ON solicitanteCj.IdEmpleado = cab.IdSolicitante AND ISNULL(cab.IdWeb, 0) = 1
LEFT JOIN dbo.EmpleadoCj solicitanteUnificado ON solicitanteUnificado.IdEmpleado = solicitanteLegacy.IdEmpleadoCj
LEFT JOIN dbo.Empleado validadorNombreLegacy ON validadorNombreLegacy.IdEmpleado = cab.IdValidador AND ISNULL(cab.IdWeb, 0) <> 1
LEFT JOIN dbo.EmpleadoCj validadorCj ON validadorCj.IdEmpleado = cab.IdValidador AND ISNULL(cab.IdWeb, 0) = 1
OUTER APPLY (
    SELECT TOP 1 detalle.IdResponsableCj, detalle.IdSegundoVacaciones, detalle.IdTerceroVacaciones
    FROM dbo.EmpleadoCjDetalle detalle
    WHERE detalle.IdEmpleadoCj = CASE WHEN ISNULL(cab.IdWeb, 0) = 1 THEN cab.IdSolicitante ELSE solicitanteLegacy.IdEmpleadoCj END
) detalleEmpleado
LEFT JOIN dbo.EmpleadoCj responsable ON responsable.IdEmpleado = detalleEmpleado.IdResponsableCj
LEFT JOIN dbo.EmpleadoCj segundo ON segundo.IdEmpleado = detalleEmpleado.IdSegundoVacaciones
LEFT JOIN dbo.EmpleadoCj tercero ON tercero.IdEmpleado = detalleEmpleado.IdTerceroVacaciones
WHERE cab.IdOc IN (SELECT TRY_CONVERT(int, ids.value) FROM STRING_SPLIT(@IdsOcCsv, ',') ids);

SET STATISTICS TIME OFF;
