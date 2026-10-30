/* ================================================================
   VALIDACION (SOLO LECTURA) de equivalencia:  sp_Planilla_Consulta_Estados  vs
   sp_Planilla_Consulta_Estados_Ligero (13) + sp_Planilla_Consulta_Estados_Totales (14).
   No modifica datos. Ejecutar en JC_Db DESPUES de crear los SP 13 y 14. Ajusta @Estados / fechas.
   Resultado esperado:  filas iguales; 0 diferencias en columnas no pesadas; 0 diferencias en pesadas.
   ================================================================ */
USE [JC_Db]
GO
SET NOCOUNT ON;
DECLARE @Estados VARCHAR(50) = '0', @Ini DATE = '2026-09-29', @Fin DATE = '2026-10-29';
DECLARE @t0 DATETIME2, @msO INT, @msL INT, @msT INT;

CREATE TABLE #O (
    [FecIngreso] NVARCHAR(MAX) NULL,
    [Detalle] NVARCHAR(MAX) NULL,
    [Cuenta] NVARCHAR(MAX) NULL,
    [CuentaInter] NVARCHAR(MAX) NULL,
    [Bien] NVARCHAR(MAX) NULL,
    [Comprobante] NVARCHAR(MAX) NULL,
    [Banco] NVARCHAR(MAX) NULL,
    [RUC] NVARCHAR(MAX) NULL,
    [Moneda] NVARCHAR(MAX) NULL,
    [TotalSubtotalPorMoneda] NVARCHAR(MAX) NULL,
    [TotalMontoBckPorMoneda] NVARCHAR(MAX) NULL,
    [TotalMontoVisiblePorMoneda] NVARCHAR(MAX) NULL,
    [TotalPagadoConvertidoSoles] NVARCHAR(MAX) NULL,
    [MonedasPagadoOt] NVARCHAR(MAX) NULL,
    [MonedasImportarOt] NVARCHAR(MAX) NULL,
    [TotalMontoBckSoles] NVARCHAR(MAX) NULL,
    [TotalMontoVisibleSoles] NVARCHAR(MAX) NULL,
    [Atp] NVARCHAR(MAX) NULL,
    [Status_Pap] NVARCHAR(MAX) NULL,
    [Subtotal] NVARCHAR(MAX) NULL,
    [IGV] NVARCHAR(MAX) NULL,
    [Total] NVARCHAR(MAX) NULL,
    [SubtotalSoles] NVARCHAR(MAX) NULL,
    [IGVSoles] NVARCHAR(MAX) NULL,
    [TotalSoles] NVARCHAR(MAX) NULL,
    [Comentario] NVARCHAR(MAX) NULL,
    [Solicitante] NVARCHAR(MAX) NULL,
    [GEstor] NVARCHAR(MAX) NULL,
    [Validador] NVARCHAR(MAX) NULL,
    [FechaDeposito] NVARCHAR(MAX) NULL,
    [Estado] NVARCHAR(MAX) NULL,
    [EstadoNombre] NVARCHAR(MAX) NULL,
    [Corre] NVARCHAR(MAX) NULL,
    [IdProyecto] NVARCHAR(MAX) NULL,
    [Correlativo] NVARCHAR(MAX) NULL,
    [IdResponsable] NVARCHAR(MAX) NULL,
    [IdSite] NVARCHAR(MAX) NULL,
    [Usuario] NVARCHAR(MAX) NULL,
    [Ot] NVARCHAR(MAX) NULL,
    [IdCliente] NVARCHAR(MAX) NULL,
    [IdBien] NVARCHAR(MAX) NULL,
    [IdComprobante] NVARCHAR(MAX) NULL,
    [IdTipoPago] NVARCHAR(MAX) NULL,
    [TipoMoneda] NVARCHAR(MAX) NULL,
    [IdRendicion] NVARCHAR(MAX) NULL,
    [IdSolicitante] NVARCHAR(MAX) NULL,
    [IdValidador] NVARCHAR(MAX) NULL,
    [HoraCreacion] NVARCHAR(MAX) NULL,
    [NomResponsable] NVARCHAR(MAX) NULL,
    [IdTipoDoc] NVARCHAR(MAX) NULL,
    [Fila] NVARCHAR(MAX) NULL,
    [IdTransferencia] NVARCHAR(MAX) NULL,
    [NombreProyecto] NVARCHAR(MAX) NULL,
    [Site] NVARCHAR(MAX) NULL,
    [CorSite] NVARCHAR(MAX) NULL,
    [Tipo_Trabajo] NVARCHAR(MAX) NULL,
    [Responsable] NVARCHAR(MAX) NULL,
    [Cliente] NVARCHAR(MAX) NULL,
    [IdOc] NVARCHAR(MAX) NULL,
    [IdEstadoOc] NVARCHAR(MAX) NULL,
    [EstadoOcSemaforo] NVARCHAR(MAX) NULL,
    [TotalOcConsumo] NVARCHAR(MAX) NULL,
    [PagadoOcConsumo] NVARCHAR(MAX) NULL,
    [MontoRetencion] NVARCHAR(MAX) NULL,
    [TotalPagarOriginal] NVARCHAR(MAX) NULL,
    [TotalPlanillaBase] NVARCHAR(MAX) NULL,
    [TotalPagar] NVARCHAR(MAX) NULL,
    [IdTarea] NVARCHAR(MAX) NULL,
    [Tarea] NVARCHAR(MAX) NULL,
    [imgFactura] NVARCHAR(MAX) NULL,
    [idprovisional] NVARCHAR(MAX) NULL,
    [fechaInicio] NVARCHAR(MAX) NULL,
    [NombreEstado] NVARCHAR(MAX) NULL,
    [serie] NVARCHAR(MAX) NULL,
    [NroOperacion] NVARCHAR(MAX) NULL,
    [ObservacionPlanilla] NVARCHAR(MAX) NULL,
    [Observacion] NVARCHAR(MAX) NULL,
    [SubtotalOriginal] NVARCHAR(MAX) NULL,
    [IgvOriginal] NVARCHAR(MAX) NULL,
    [TotalOriginal] NVARCHAR(MAX) NULL,
    [SumaEmp] NVARCHAR(MAX) NULL,
    [SumaEmpSolesNativo] NVARCHAR(MAX) NULL,
    [SumaEmpUsdNativo] NVARCHAR(MAX) NULL,
    [SumaEmpEurNativo] NVARCHAR(MAX) NULL,
    [SumaEmpDopNativo] NVARCHAR(MAX) NULL,
    [SumaEmpCopNativo] NVARCHAR(MAX) NULL,
    [CantRecibosEmp] NVARCHAR(MAX) NULL,
    [IdGestor] NVARCHAR(MAX) NULL,
    [IdSolicitanteCj] NVARCHAR(MAX) NULL,
    [IdGestorCj] NVARCHAR(MAX) NULL,
    [IdValidadorCj] NVARCHAR(MAX) NULL,
    [FechaReaprobador] NVARCHAR(MAX) NULL,
    [TotalOcFila] NVARCHAR(MAX) NULL,
    [PagadoOcFila] NVARCHAR(MAX) NULL
);
CREATE TABLE #L (
    [FecIngreso] NVARCHAR(MAX) NULL,
    [Detalle] NVARCHAR(MAX) NULL,
    [Cuenta] NVARCHAR(MAX) NULL,
    [CuentaInter] NVARCHAR(MAX) NULL,
    [Bien] NVARCHAR(MAX) NULL,
    [Comprobante] NVARCHAR(MAX) NULL,
    [Banco] NVARCHAR(MAX) NULL,
    [RUC] NVARCHAR(MAX) NULL,
    [Moneda] NVARCHAR(MAX) NULL,
    [TotalSubtotalPorMoneda] NVARCHAR(MAX) NULL,
    [TotalMontoBckPorMoneda] NVARCHAR(MAX) NULL,
    [TotalMontoVisiblePorMoneda] NVARCHAR(MAX) NULL,
    [TotalPagadoConvertidoSoles] NVARCHAR(MAX) NULL,
    [MonedasPagadoOt] NVARCHAR(MAX) NULL,
    [MonedasImportarOt] NVARCHAR(MAX) NULL,
    [TotalMontoBckSoles] NVARCHAR(MAX) NULL,
    [TotalMontoVisibleSoles] NVARCHAR(MAX) NULL,
    [Atp] NVARCHAR(MAX) NULL,
    [Status_Pap] NVARCHAR(MAX) NULL,
    [Subtotal] NVARCHAR(MAX) NULL,
    [IGV] NVARCHAR(MAX) NULL,
    [Total] NVARCHAR(MAX) NULL,
    [SubtotalSoles] NVARCHAR(MAX) NULL,
    [IGVSoles] NVARCHAR(MAX) NULL,
    [TotalSoles] NVARCHAR(MAX) NULL,
    [Comentario] NVARCHAR(MAX) NULL,
    [Solicitante] NVARCHAR(MAX) NULL,
    [GEstor] NVARCHAR(MAX) NULL,
    [Validador] NVARCHAR(MAX) NULL,
    [FechaDeposito] NVARCHAR(MAX) NULL,
    [Estado] NVARCHAR(MAX) NULL,
    [EstadoNombre] NVARCHAR(MAX) NULL,
    [Corre] NVARCHAR(MAX) NULL,
    [IdProyecto] NVARCHAR(MAX) NULL,
    [Correlativo] NVARCHAR(MAX) NULL,
    [IdResponsable] NVARCHAR(MAX) NULL,
    [IdSite] NVARCHAR(MAX) NULL,
    [Usuario] NVARCHAR(MAX) NULL,
    [Ot] NVARCHAR(MAX) NULL,
    [IdCliente] NVARCHAR(MAX) NULL,
    [IdBien] NVARCHAR(MAX) NULL,
    [IdComprobante] NVARCHAR(MAX) NULL,
    [IdTipoPago] NVARCHAR(MAX) NULL,
    [TipoMoneda] NVARCHAR(MAX) NULL,
    [IdRendicion] NVARCHAR(MAX) NULL,
    [IdSolicitante] NVARCHAR(MAX) NULL,
    [IdValidador] NVARCHAR(MAX) NULL,
    [HoraCreacion] NVARCHAR(MAX) NULL,
    [NomResponsable] NVARCHAR(MAX) NULL,
    [IdTipoDoc] NVARCHAR(MAX) NULL,
    [Fila] NVARCHAR(MAX) NULL,
    [IdTransferencia] NVARCHAR(MAX) NULL,
    [NombreProyecto] NVARCHAR(MAX) NULL,
    [Site] NVARCHAR(MAX) NULL,
    [CorSite] NVARCHAR(MAX) NULL,
    [Tipo_Trabajo] NVARCHAR(MAX) NULL,
    [Responsable] NVARCHAR(MAX) NULL,
    [Cliente] NVARCHAR(MAX) NULL,
    [IdOc] NVARCHAR(MAX) NULL,
    [IdEstadoOc] NVARCHAR(MAX) NULL,
    [EstadoOcSemaforo] NVARCHAR(MAX) NULL,
    [TotalOcConsumo] NVARCHAR(MAX) NULL,
    [PagadoOcConsumo] NVARCHAR(MAX) NULL,
    [MontoRetencion] NVARCHAR(MAX) NULL,
    [TotalPagarOriginal] NVARCHAR(MAX) NULL,
    [TotalPlanillaBase] NVARCHAR(MAX) NULL,
    [TotalPagar] NVARCHAR(MAX) NULL,
    [IdTarea] NVARCHAR(MAX) NULL,
    [Tarea] NVARCHAR(MAX) NULL,
    [imgFactura] NVARCHAR(MAX) NULL,
    [idprovisional] NVARCHAR(MAX) NULL,
    [fechaInicio] NVARCHAR(MAX) NULL,
    [NombreEstado] NVARCHAR(MAX) NULL,
    [serie] NVARCHAR(MAX) NULL,
    [NroOperacion] NVARCHAR(MAX) NULL,
    [ObservacionPlanilla] NVARCHAR(MAX) NULL,
    [Observacion] NVARCHAR(MAX) NULL,
    [SubtotalOriginal] NVARCHAR(MAX) NULL,
    [IgvOriginal] NVARCHAR(MAX) NULL,
    [TotalOriginal] NVARCHAR(MAX) NULL,
    [SumaEmp] NVARCHAR(MAX) NULL,
    [SumaEmpSolesNativo] NVARCHAR(MAX) NULL,
    [SumaEmpUsdNativo] NVARCHAR(MAX) NULL,
    [SumaEmpEurNativo] NVARCHAR(MAX) NULL,
    [SumaEmpDopNativo] NVARCHAR(MAX) NULL,
    [SumaEmpCopNativo] NVARCHAR(MAX) NULL,
    [CantRecibosEmp] NVARCHAR(MAX) NULL,
    [IdGestor] NVARCHAR(MAX) NULL,
    [IdSolicitanteCj] NVARCHAR(MAX) NULL,
    [IdGestorCj] NVARCHAR(MAX) NULL,
    [IdValidadorCj] NVARCHAR(MAX) NULL,
    [FechaReaprobador] NVARCHAR(MAX) NULL,
    [TotalOcFila] NVARCHAR(MAX) NULL,
    [PagadoOcFila] NVARCHAR(MAX) NULL
);
CREATE TABLE #TT (
    [Corre] NVARCHAR(MAX) NULL,
    [IdSite] NVARCHAR(MAX) NULL,
    [IdCliente] NVARCHAR(MAX) NULL,
    [IdProyecto] NVARCHAR(MAX) NULL,
    [TotalSubtotalPorMoneda] NVARCHAR(MAX) NULL,
    [TotalMontoBckPorMoneda] NVARCHAR(MAX) NULL,
    [TotalMontoVisiblePorMoneda] NVARCHAR(MAX) NULL,
    [TotalPagadoConvertidoSoles] NVARCHAR(MAX) NULL,
    [MonedasPagadoOt] NVARCHAR(MAX) NULL,
    [MonedasImportarOt] NVARCHAR(MAX) NULL,
    [TotalMontoBckSoles] NVARCHAR(MAX) NULL,
    [TotalMontoVisibleSoles] NVARCHAR(MAX) NULL,
    [PagadoOcConsumo] NVARCHAR(MAX) NULL,
    [PagadoOcFila] NVARCHAR(MAX) NULL,
    [TotalPlanillaBase] NVARCHAR(MAX) NULL,
    [TotalPagar] NVARCHAR(MAX) NULL
);

SET @t0 = SYSDATETIME();
INSERT #O EXEC dbo.sp_Planilla_Consulta_Estados @Estados = @Estados, @FechaInicio = @Ini, @FechaFin = @Fin;
SET @msO = DATEDIFF(MILLISECOND, @t0, SYSDATETIME());

SET @t0 = SYSDATETIME();
INSERT #L EXEC dbo.sp_Planilla_Consulta_Estados_Ligero @Estados = @Estados, @FechaInicio = @Ini, @FechaFin = @Fin;
SET @msL = DATEDIFF(MILLISECOND, @t0, SYSDATETIME());

DECLARE @csv VARCHAR(MAX) = (SELECT STRING_AGG(CAST(Corre AS VARCHAR(MAX)), ',') FROM (SELECT DISTINCT Corre FROM #L) x);

SET @t0 = SYSDATETIME();
INSERT #TT EXEC dbo.sp_Planilla_Consulta_Estados_Totales @Correlativos = @csv;
SET @msT = DATEDIFF(MILLISECOND, @t0, SYSDATETIME());

-- 1) Tiempos y cantidades
SELECT 'ms original' AS medida, @msO AS valor
UNION ALL SELECT 'ms ligero (primer pintado)', @msL
UNION ALL SELECT 'ms totales (diferido)', @msT
UNION ALL SELECT 'filas original', COUNT(*) FROM #O
UNION ALL SELECT 'filas ligero', COUNT(*) FROM #L
UNION ALL SELECT 'filas totales', COUNT(*) FROM #TT;

-- 2) Columnas NO pesadas: filas del original que faltan o difieren en el ligero (esperado: 0)
SELECT 'original EXCEPT ligero' AS comparacion, COUNT(*) AS filas_distintas FROM (
    SELECT [FecIngreso], [Detalle], [Cuenta], [CuentaInter], [Bien], [Comprobante], [Banco], [RUC], [Moneda], [Atp], [Status_Pap], [Subtotal], [IGV], [Total], [SubtotalSoles], [IGVSoles], [TotalSoles], [Comentario], [Solicitante], [GEstor], [Validador], [FechaDeposito], [Estado], [EstadoNombre], [Corre], [IdProyecto], [Correlativo], [IdResponsable], [IdSite], [Usuario], [Ot], [IdCliente], [IdBien], [IdComprobante], [IdTipoPago], [TipoMoneda], [IdRendicion], [IdSolicitante], [IdValidador], [HoraCreacion], [NomResponsable], [IdTipoDoc], [Fila], [IdTransferencia], [NombreProyecto], [Site], [CorSite], [Tipo_Trabajo], [Responsable], [Cliente], [IdOc], [IdEstadoOc], [EstadoOcSemaforo], [TotalOcConsumo], [MontoRetencion], [TotalPagarOriginal], [IdTarea], [Tarea], [imgFactura], [idprovisional], [fechaInicio], [NombreEstado], [serie], [NroOperacion], [ObservacionPlanilla], [Observacion], [SubtotalOriginal], [IgvOriginal], [TotalOriginal], [SumaEmp], [SumaEmpSolesNativo], [SumaEmpUsdNativo], [SumaEmpEurNativo], [SumaEmpDopNativo], [SumaEmpCopNativo], [CantRecibosEmp], [IdGestor], [IdSolicitanteCj], [IdGestorCj], [IdValidadorCj], [FechaReaprobador], [TotalOcFila] FROM #O
    EXCEPT
    SELECT [FecIngreso], [Detalle], [Cuenta], [CuentaInter], [Bien], [Comprobante], [Banco], [RUC], [Moneda], [Atp], [Status_Pap], [Subtotal], [IGV], [Total], [SubtotalSoles], [IGVSoles], [TotalSoles], [Comentario], [Solicitante], [GEstor], [Validador], [FechaDeposito], [Estado], [EstadoNombre], [Corre], [IdProyecto], [Correlativo], [IdResponsable], [IdSite], [Usuario], [Ot], [IdCliente], [IdBien], [IdComprobante], [IdTipoPago], [TipoMoneda], [IdRendicion], [IdSolicitante], [IdValidador], [HoraCreacion], [NomResponsable], [IdTipoDoc], [Fila], [IdTransferencia], [NombreProyecto], [Site], [CorSite], [Tipo_Trabajo], [Responsable], [Cliente], [IdOc], [IdEstadoOc], [EstadoOcSemaforo], [TotalOcConsumo], [MontoRetencion], [TotalPagarOriginal], [IdTarea], [Tarea], [imgFactura], [idprovisional], [fechaInicio], [NombreEstado], [serie], [NroOperacion], [ObservacionPlanilla], [Observacion], [SubtotalOriginal], [IgvOriginal], [TotalOriginal], [SumaEmp], [SumaEmpSolesNativo], [SumaEmpUsdNativo], [SumaEmpEurNativo], [SumaEmpDopNativo], [SumaEmpCopNativo], [CantRecibosEmp], [IdGestor], [IdSolicitanteCj], [IdGestorCj], [IdValidadorCj], [FechaReaprobador], [TotalOcFila] FROM #L) d
UNION ALL
SELECT 'ligero EXCEPT original', COUNT(*) FROM (
    SELECT [FecIngreso], [Detalle], [Cuenta], [CuentaInter], [Bien], [Comprobante], [Banco], [RUC], [Moneda], [Atp], [Status_Pap], [Subtotal], [IGV], [Total], [SubtotalSoles], [IGVSoles], [TotalSoles], [Comentario], [Solicitante], [GEstor], [Validador], [FechaDeposito], [Estado], [EstadoNombre], [Corre], [IdProyecto], [Correlativo], [IdResponsable], [IdSite], [Usuario], [Ot], [IdCliente], [IdBien], [IdComprobante], [IdTipoPago], [TipoMoneda], [IdRendicion], [IdSolicitante], [IdValidador], [HoraCreacion], [NomResponsable], [IdTipoDoc], [Fila], [IdTransferencia], [NombreProyecto], [Site], [CorSite], [Tipo_Trabajo], [Responsable], [Cliente], [IdOc], [IdEstadoOc], [EstadoOcSemaforo], [TotalOcConsumo], [MontoRetencion], [TotalPagarOriginal], [IdTarea], [Tarea], [imgFactura], [idprovisional], [fechaInicio], [NombreEstado], [serie], [NroOperacion], [ObservacionPlanilla], [Observacion], [SubtotalOriginal], [IgvOriginal], [TotalOriginal], [SumaEmp], [SumaEmpSolesNativo], [SumaEmpUsdNativo], [SumaEmpEurNativo], [SumaEmpDopNativo], [SumaEmpCopNativo], [CantRecibosEmp], [IdGestor], [IdSolicitanteCj], [IdGestorCj], [IdValidadorCj], [FechaReaprobador], [TotalOcFila] FROM #L
    EXCEPT
    SELECT [FecIngreso], [Detalle], [Cuenta], [CuentaInter], [Bien], [Comprobante], [Banco], [RUC], [Moneda], [Atp], [Status_Pap], [Subtotal], [IGV], [Total], [SubtotalSoles], [IGVSoles], [TotalSoles], [Comentario], [Solicitante], [GEstor], [Validador], [FechaDeposito], [Estado], [EstadoNombre], [Corre], [IdProyecto], [Correlativo], [IdResponsable], [IdSite], [Usuario], [Ot], [IdCliente], [IdBien], [IdComprobante], [IdTipoPago], [TipoMoneda], [IdRendicion], [IdSolicitante], [IdValidador], [HoraCreacion], [NomResponsable], [IdTipoDoc], [Fila], [IdTransferencia], [NombreProyecto], [Site], [CorSite], [Tipo_Trabajo], [Responsable], [Cliente], [IdOc], [IdEstadoOc], [EstadoOcSemaforo], [TotalOcConsumo], [MontoRetencion], [TotalPagarOriginal], [IdTarea], [Tarea], [imgFactura], [idprovisional], [fechaInicio], [NombreEstado], [serie], [NroOperacion], [ObservacionPlanilla], [Observacion], [SubtotalOriginal], [IgvOriginal], [TotalOriginal], [SumaEmp], [SumaEmpSolesNativo], [SumaEmpUsdNativo], [SumaEmpEurNativo], [SumaEmpDopNativo], [SumaEmpCopNativo], [CantRecibosEmp], [IdGestor], [IdSolicitanteCj], [IdGestorCj], [IdValidadorCj], [FechaReaprobador], [TotalOcFila] FROM #O) d;

-- 3) Columnas pesadas: diferencias por columna entre el original y los totales diferidos (esperado: 0)
SELECT 'sin pareja en totales' AS columna, COUNT(*) AS filas_distintas
FROM #O o WHERE NOT EXISTS (SELECT 1 FROM #TT t WHERE t.Corre = o.Corre AND t.IdSite = o.IdSite)
UNION ALL SELECT 'TotalSubtotalPorMoneda', COUNT(*) FROM #O o JOIN #TT t ON t.Corre=o.Corre AND t.IdSite=o.IdSite WHERE ISNULL(o.[TotalSubtotalPorMoneda],'~')<>ISNULL(t.[TotalSubtotalPorMoneda],'~')
UNION ALL SELECT 'TotalMontoBckPorMoneda', COUNT(*) FROM #O o JOIN #TT t ON t.Corre=o.Corre AND t.IdSite=o.IdSite WHERE ISNULL(o.[TotalMontoBckPorMoneda],'~')<>ISNULL(t.[TotalMontoBckPorMoneda],'~')
UNION ALL SELECT 'TotalMontoVisiblePorMoneda', COUNT(*) FROM #O o JOIN #TT t ON t.Corre=o.Corre AND t.IdSite=o.IdSite WHERE ISNULL(o.[TotalMontoVisiblePorMoneda],'~')<>ISNULL(t.[TotalMontoVisiblePorMoneda],'~')
UNION ALL SELECT 'TotalPagadoConvertidoSoles', COUNT(*) FROM #O o JOIN #TT t ON t.Corre=o.Corre AND t.IdSite=o.IdSite WHERE ISNULL(o.[TotalPagadoConvertidoSoles],'~')<>ISNULL(t.[TotalPagadoConvertidoSoles],'~')
UNION ALL SELECT 'MonedasPagadoOt', COUNT(*) FROM #O o JOIN #TT t ON t.Corre=o.Corre AND t.IdSite=o.IdSite WHERE ISNULL(o.[MonedasPagadoOt],'~')<>ISNULL(t.[MonedasPagadoOt],'~')
UNION ALL SELECT 'MonedasImportarOt', COUNT(*) FROM #O o JOIN #TT t ON t.Corre=o.Corre AND t.IdSite=o.IdSite WHERE ISNULL(o.[MonedasImportarOt],'~')<>ISNULL(t.[MonedasImportarOt],'~')
UNION ALL SELECT 'TotalMontoBckSoles', COUNT(*) FROM #O o JOIN #TT t ON t.Corre=o.Corre AND t.IdSite=o.IdSite WHERE ISNULL(o.[TotalMontoBckSoles],'~')<>ISNULL(t.[TotalMontoBckSoles],'~')
UNION ALL SELECT 'TotalMontoVisibleSoles', COUNT(*) FROM #O o JOIN #TT t ON t.Corre=o.Corre AND t.IdSite=o.IdSite WHERE ISNULL(o.[TotalMontoVisibleSoles],'~')<>ISNULL(t.[TotalMontoVisibleSoles],'~')
UNION ALL SELECT 'PagadoOcConsumo', COUNT(*) FROM #O o JOIN #TT t ON t.Corre=o.Corre AND t.IdSite=o.IdSite WHERE ISNULL(o.[PagadoOcConsumo],'~')<>ISNULL(t.[PagadoOcConsumo],'~')
UNION ALL SELECT 'PagadoOcFila', COUNT(*) FROM #O o JOIN #TT t ON t.Corre=o.Corre AND t.IdSite=o.IdSite WHERE ISNULL(o.[PagadoOcFila],'~')<>ISNULL(t.[PagadoOcFila],'~')
UNION ALL SELECT 'TotalPlanillaBase', COUNT(*) FROM #O o JOIN #TT t ON t.Corre=o.Corre AND t.IdSite=o.IdSite WHERE ISNULL(o.[TotalPlanillaBase],'~')<>ISNULL(t.[TotalPlanillaBase],'~')
UNION ALL SELECT 'TotalPagar', COUNT(*) FROM #O o JOIN #TT t ON t.Corre=o.Corre AND t.IdSite=o.IdSite WHERE ISNULL(o.[TotalPagar],'~')<>ISNULL(t.[TotalPagar],'~');

-- 4) Detalle (primeras 20 diferencias de TotalPagadoConvertidoSoles, si las hay)
SELECT TOP 20 o.Corre, o.IdSite, o.TotalPagadoConvertidoSoles AS original, t.TotalPagadoConvertidoSoles AS diferido
FROM #O o JOIN #TT t ON t.Corre = o.Corre AND t.IdSite = o.IdSite
WHERE ISNULL(o.TotalPagadoConvertidoSoles,'~') <> ISNULL(t.TotalPagadoConvertidoSoles,'~');

-- 5) Filas que difieren entre original y ligero (si el original tardo mucho, pueden ser recibos nuevos o editados
--    mientras corria). Se comparan por clave: 'solo ligero' = no estaba en el original; 'solo original' = no esta en el ligero.
SELECT * FROM (
    SELECT 'solo ligero' AS origen, l.Corre, l.IdSite, l.Estado, l.FecIngreso, l.HoraCreacion, l.Subtotal, l.TipoMoneda
    FROM #L l WHERE NOT EXISTS (SELECT 1 FROM #O o WHERE o.Corre = l.Corre AND o.IdSite = l.IdSite)
    UNION ALL
    SELECT 'solo original', o.Corre, o.IdSite, o.Estado, o.FecIngreso, o.HoraCreacion, o.Subtotal, o.TipoMoneda
    FROM #O o WHERE NOT EXISTS (SELECT 1 FROM #L l WHERE l.Corre = o.Corre AND l.IdSite = o.IdSite)
) d
ORDER BY origen, TRY_CAST(Corre AS INT) DESC;

-- 6) Misma clave pero columnas distintas: cuales columnas cambian (solo filas presentes en ambos).
SELECT 'columnas distintas en filas comunes' AS detalle, COUNT(*) AS filas
FROM #O o JOIN #L l ON l.Corre = o.Corre AND l.IdSite = o.IdSite
WHERE EXISTS (
    SELECT o.[Estado], o.[Subtotal], o.[Total], o.[Observacion], o.[Detalle], o.[Solicitante], o.[Validador]
    EXCEPT
    SELECT l.[Estado], l.[Subtotal], l.[Total], l.[Observacion], l.[Detalle], l.[Solicitante], l.[Validador]);

-- 7) Que columnas difieren en las filas con la misma clave (solo se muestran las que tienen diferencias).
SELECT * FROM (
SELECT 'FecIngreso' AS columna, COUNT(*) AS filas_distintas FROM #O o JOIN #L l ON l.Corre=o.Corre AND l.IdSite=o.IdSite WHERE ISNULL(o.[FecIngreso],'~')<>ISNULL(l.[FecIngreso],'~')
UNION ALL SELECT 'Detalle' AS columna, COUNT(*) AS filas_distintas FROM #O o JOIN #L l ON l.Corre=o.Corre AND l.IdSite=o.IdSite WHERE ISNULL(o.[Detalle],'~')<>ISNULL(l.[Detalle],'~')
UNION ALL SELECT 'Cuenta' AS columna, COUNT(*) AS filas_distintas FROM #O o JOIN #L l ON l.Corre=o.Corre AND l.IdSite=o.IdSite WHERE ISNULL(o.[Cuenta],'~')<>ISNULL(l.[Cuenta],'~')
UNION ALL SELECT 'CuentaInter' AS columna, COUNT(*) AS filas_distintas FROM #O o JOIN #L l ON l.Corre=o.Corre AND l.IdSite=o.IdSite WHERE ISNULL(o.[CuentaInter],'~')<>ISNULL(l.[CuentaInter],'~')
UNION ALL SELECT 'Bien' AS columna, COUNT(*) AS filas_distintas FROM #O o JOIN #L l ON l.Corre=o.Corre AND l.IdSite=o.IdSite WHERE ISNULL(o.[Bien],'~')<>ISNULL(l.[Bien],'~')
UNION ALL SELECT 'Comprobante' AS columna, COUNT(*) AS filas_distintas FROM #O o JOIN #L l ON l.Corre=o.Corre AND l.IdSite=o.IdSite WHERE ISNULL(o.[Comprobante],'~')<>ISNULL(l.[Comprobante],'~')
UNION ALL SELECT 'Banco' AS columna, COUNT(*) AS filas_distintas FROM #O o JOIN #L l ON l.Corre=o.Corre AND l.IdSite=o.IdSite WHERE ISNULL(o.[Banco],'~')<>ISNULL(l.[Banco],'~')
UNION ALL SELECT 'RUC' AS columna, COUNT(*) AS filas_distintas FROM #O o JOIN #L l ON l.Corre=o.Corre AND l.IdSite=o.IdSite WHERE ISNULL(o.[RUC],'~')<>ISNULL(l.[RUC],'~')
UNION ALL SELECT 'Moneda' AS columna, COUNT(*) AS filas_distintas FROM #O o JOIN #L l ON l.Corre=o.Corre AND l.IdSite=o.IdSite WHERE ISNULL(o.[Moneda],'~')<>ISNULL(l.[Moneda],'~')
UNION ALL SELECT 'Atp' AS columna, COUNT(*) AS filas_distintas FROM #O o JOIN #L l ON l.Corre=o.Corre AND l.IdSite=o.IdSite WHERE ISNULL(o.[Atp],'~')<>ISNULL(l.[Atp],'~')
UNION ALL SELECT 'Status_Pap' AS columna, COUNT(*) AS filas_distintas FROM #O o JOIN #L l ON l.Corre=o.Corre AND l.IdSite=o.IdSite WHERE ISNULL(o.[Status_Pap],'~')<>ISNULL(l.[Status_Pap],'~')
UNION ALL SELECT 'Subtotal' AS columna, COUNT(*) AS filas_distintas FROM #O o JOIN #L l ON l.Corre=o.Corre AND l.IdSite=o.IdSite WHERE ISNULL(o.[Subtotal],'~')<>ISNULL(l.[Subtotal],'~')
UNION ALL SELECT 'IGV' AS columna, COUNT(*) AS filas_distintas FROM #O o JOIN #L l ON l.Corre=o.Corre AND l.IdSite=o.IdSite WHERE ISNULL(o.[IGV],'~')<>ISNULL(l.[IGV],'~')
UNION ALL SELECT 'Total' AS columna, COUNT(*) AS filas_distintas FROM #O o JOIN #L l ON l.Corre=o.Corre AND l.IdSite=o.IdSite WHERE ISNULL(o.[Total],'~')<>ISNULL(l.[Total],'~')
UNION ALL SELECT 'SubtotalSoles' AS columna, COUNT(*) AS filas_distintas FROM #O o JOIN #L l ON l.Corre=o.Corre AND l.IdSite=o.IdSite WHERE ISNULL(o.[SubtotalSoles],'~')<>ISNULL(l.[SubtotalSoles],'~')
UNION ALL SELECT 'IGVSoles' AS columna, COUNT(*) AS filas_distintas FROM #O o JOIN #L l ON l.Corre=o.Corre AND l.IdSite=o.IdSite WHERE ISNULL(o.[IGVSoles],'~')<>ISNULL(l.[IGVSoles],'~')
UNION ALL SELECT 'TotalSoles' AS columna, COUNT(*) AS filas_distintas FROM #O o JOIN #L l ON l.Corre=o.Corre AND l.IdSite=o.IdSite WHERE ISNULL(o.[TotalSoles],'~')<>ISNULL(l.[TotalSoles],'~')
UNION ALL SELECT 'Comentario' AS columna, COUNT(*) AS filas_distintas FROM #O o JOIN #L l ON l.Corre=o.Corre AND l.IdSite=o.IdSite WHERE ISNULL(o.[Comentario],'~')<>ISNULL(l.[Comentario],'~')
UNION ALL SELECT 'Solicitante' AS columna, COUNT(*) AS filas_distintas FROM #O o JOIN #L l ON l.Corre=o.Corre AND l.IdSite=o.IdSite WHERE ISNULL(o.[Solicitante],'~')<>ISNULL(l.[Solicitante],'~')
UNION ALL SELECT 'GEstor' AS columna, COUNT(*) AS filas_distintas FROM #O o JOIN #L l ON l.Corre=o.Corre AND l.IdSite=o.IdSite WHERE ISNULL(o.[GEstor],'~')<>ISNULL(l.[GEstor],'~')
UNION ALL SELECT 'Validador' AS columna, COUNT(*) AS filas_distintas FROM #O o JOIN #L l ON l.Corre=o.Corre AND l.IdSite=o.IdSite WHERE ISNULL(o.[Validador],'~')<>ISNULL(l.[Validador],'~')
UNION ALL SELECT 'FechaDeposito' AS columna, COUNT(*) AS filas_distintas FROM #O o JOIN #L l ON l.Corre=o.Corre AND l.IdSite=o.IdSite WHERE ISNULL(o.[FechaDeposito],'~')<>ISNULL(l.[FechaDeposito],'~')
UNION ALL SELECT 'Estado' AS columna, COUNT(*) AS filas_distintas FROM #O o JOIN #L l ON l.Corre=o.Corre AND l.IdSite=o.IdSite WHERE ISNULL(o.[Estado],'~')<>ISNULL(l.[Estado],'~')
UNION ALL SELECT 'EstadoNombre' AS columna, COUNT(*) AS filas_distintas FROM #O o JOIN #L l ON l.Corre=o.Corre AND l.IdSite=o.IdSite WHERE ISNULL(o.[EstadoNombre],'~')<>ISNULL(l.[EstadoNombre],'~')
UNION ALL SELECT 'Corre' AS columna, COUNT(*) AS filas_distintas FROM #O o JOIN #L l ON l.Corre=o.Corre AND l.IdSite=o.IdSite WHERE ISNULL(o.[Corre],'~')<>ISNULL(l.[Corre],'~')
UNION ALL SELECT 'IdProyecto' AS columna, COUNT(*) AS filas_distintas FROM #O o JOIN #L l ON l.Corre=o.Corre AND l.IdSite=o.IdSite WHERE ISNULL(o.[IdProyecto],'~')<>ISNULL(l.[IdProyecto],'~')
UNION ALL SELECT 'Correlativo' AS columna, COUNT(*) AS filas_distintas FROM #O o JOIN #L l ON l.Corre=o.Corre AND l.IdSite=o.IdSite WHERE ISNULL(o.[Correlativo],'~')<>ISNULL(l.[Correlativo],'~')
UNION ALL SELECT 'IdResponsable' AS columna, COUNT(*) AS filas_distintas FROM #O o JOIN #L l ON l.Corre=o.Corre AND l.IdSite=o.IdSite WHERE ISNULL(o.[IdResponsable],'~')<>ISNULL(l.[IdResponsable],'~')
UNION ALL SELECT 'IdSite' AS columna, COUNT(*) AS filas_distintas FROM #O o JOIN #L l ON l.Corre=o.Corre AND l.IdSite=o.IdSite WHERE ISNULL(o.[IdSite],'~')<>ISNULL(l.[IdSite],'~')
UNION ALL SELECT 'Usuario' AS columna, COUNT(*) AS filas_distintas FROM #O o JOIN #L l ON l.Corre=o.Corre AND l.IdSite=o.IdSite WHERE ISNULL(o.[Usuario],'~')<>ISNULL(l.[Usuario],'~')
UNION ALL SELECT 'Ot' AS columna, COUNT(*) AS filas_distintas FROM #O o JOIN #L l ON l.Corre=o.Corre AND l.IdSite=o.IdSite WHERE ISNULL(o.[Ot],'~')<>ISNULL(l.[Ot],'~')
UNION ALL SELECT 'IdCliente' AS columna, COUNT(*) AS filas_distintas FROM #O o JOIN #L l ON l.Corre=o.Corre AND l.IdSite=o.IdSite WHERE ISNULL(o.[IdCliente],'~')<>ISNULL(l.[IdCliente],'~')
UNION ALL SELECT 'IdBien' AS columna, COUNT(*) AS filas_distintas FROM #O o JOIN #L l ON l.Corre=o.Corre AND l.IdSite=o.IdSite WHERE ISNULL(o.[IdBien],'~')<>ISNULL(l.[IdBien],'~')
UNION ALL SELECT 'IdComprobante' AS columna, COUNT(*) AS filas_distintas FROM #O o JOIN #L l ON l.Corre=o.Corre AND l.IdSite=o.IdSite WHERE ISNULL(o.[IdComprobante],'~')<>ISNULL(l.[IdComprobante],'~')
UNION ALL SELECT 'IdTipoPago' AS columna, COUNT(*) AS filas_distintas FROM #O o JOIN #L l ON l.Corre=o.Corre AND l.IdSite=o.IdSite WHERE ISNULL(o.[IdTipoPago],'~')<>ISNULL(l.[IdTipoPago],'~')
UNION ALL SELECT 'TipoMoneda' AS columna, COUNT(*) AS filas_distintas FROM #O o JOIN #L l ON l.Corre=o.Corre AND l.IdSite=o.IdSite WHERE ISNULL(o.[TipoMoneda],'~')<>ISNULL(l.[TipoMoneda],'~')
UNION ALL SELECT 'IdRendicion' AS columna, COUNT(*) AS filas_distintas FROM #O o JOIN #L l ON l.Corre=o.Corre AND l.IdSite=o.IdSite WHERE ISNULL(o.[IdRendicion],'~')<>ISNULL(l.[IdRendicion],'~')
UNION ALL SELECT 'IdSolicitante' AS columna, COUNT(*) AS filas_distintas FROM #O o JOIN #L l ON l.Corre=o.Corre AND l.IdSite=o.IdSite WHERE ISNULL(o.[IdSolicitante],'~')<>ISNULL(l.[IdSolicitante],'~')
UNION ALL SELECT 'IdValidador' AS columna, COUNT(*) AS filas_distintas FROM #O o JOIN #L l ON l.Corre=o.Corre AND l.IdSite=o.IdSite WHERE ISNULL(o.[IdValidador],'~')<>ISNULL(l.[IdValidador],'~')
UNION ALL SELECT 'HoraCreacion' AS columna, COUNT(*) AS filas_distintas FROM #O o JOIN #L l ON l.Corre=o.Corre AND l.IdSite=o.IdSite WHERE ISNULL(o.[HoraCreacion],'~')<>ISNULL(l.[HoraCreacion],'~')
UNION ALL SELECT 'NomResponsable' AS columna, COUNT(*) AS filas_distintas FROM #O o JOIN #L l ON l.Corre=o.Corre AND l.IdSite=o.IdSite WHERE ISNULL(o.[NomResponsable],'~')<>ISNULL(l.[NomResponsable],'~')
UNION ALL SELECT 'IdTipoDoc' AS columna, COUNT(*) AS filas_distintas FROM #O o JOIN #L l ON l.Corre=o.Corre AND l.IdSite=o.IdSite WHERE ISNULL(o.[IdTipoDoc],'~')<>ISNULL(l.[IdTipoDoc],'~')
UNION ALL SELECT 'Fila' AS columna, COUNT(*) AS filas_distintas FROM #O o JOIN #L l ON l.Corre=o.Corre AND l.IdSite=o.IdSite WHERE ISNULL(o.[Fila],'~')<>ISNULL(l.[Fila],'~')
UNION ALL SELECT 'IdTransferencia' AS columna, COUNT(*) AS filas_distintas FROM #O o JOIN #L l ON l.Corre=o.Corre AND l.IdSite=o.IdSite WHERE ISNULL(o.[IdTransferencia],'~')<>ISNULL(l.[IdTransferencia],'~')
UNION ALL SELECT 'NombreProyecto' AS columna, COUNT(*) AS filas_distintas FROM #O o JOIN #L l ON l.Corre=o.Corre AND l.IdSite=o.IdSite WHERE ISNULL(o.[NombreProyecto],'~')<>ISNULL(l.[NombreProyecto],'~')
UNION ALL SELECT 'Site' AS columna, COUNT(*) AS filas_distintas FROM #O o JOIN #L l ON l.Corre=o.Corre AND l.IdSite=o.IdSite WHERE ISNULL(o.[Site],'~')<>ISNULL(l.[Site],'~')
UNION ALL SELECT 'CorSite' AS columna, COUNT(*) AS filas_distintas FROM #O o JOIN #L l ON l.Corre=o.Corre AND l.IdSite=o.IdSite WHERE ISNULL(o.[CorSite],'~')<>ISNULL(l.[CorSite],'~')
UNION ALL SELECT 'Tipo_Trabajo' AS columna, COUNT(*) AS filas_distintas FROM #O o JOIN #L l ON l.Corre=o.Corre AND l.IdSite=o.IdSite WHERE ISNULL(o.[Tipo_Trabajo],'~')<>ISNULL(l.[Tipo_Trabajo],'~')
UNION ALL SELECT 'Responsable' AS columna, COUNT(*) AS filas_distintas FROM #O o JOIN #L l ON l.Corre=o.Corre AND l.IdSite=o.IdSite WHERE ISNULL(o.[Responsable],'~')<>ISNULL(l.[Responsable],'~')
UNION ALL SELECT 'Cliente' AS columna, COUNT(*) AS filas_distintas FROM #O o JOIN #L l ON l.Corre=o.Corre AND l.IdSite=o.IdSite WHERE ISNULL(o.[Cliente],'~')<>ISNULL(l.[Cliente],'~')
UNION ALL SELECT 'IdOc' AS columna, COUNT(*) AS filas_distintas FROM #O o JOIN #L l ON l.Corre=o.Corre AND l.IdSite=o.IdSite WHERE ISNULL(o.[IdOc],'~')<>ISNULL(l.[IdOc],'~')
UNION ALL SELECT 'IdEstadoOc' AS columna, COUNT(*) AS filas_distintas FROM #O o JOIN #L l ON l.Corre=o.Corre AND l.IdSite=o.IdSite WHERE ISNULL(o.[IdEstadoOc],'~')<>ISNULL(l.[IdEstadoOc],'~')
UNION ALL SELECT 'EstadoOcSemaforo' AS columna, COUNT(*) AS filas_distintas FROM #O o JOIN #L l ON l.Corre=o.Corre AND l.IdSite=o.IdSite WHERE ISNULL(o.[EstadoOcSemaforo],'~')<>ISNULL(l.[EstadoOcSemaforo],'~')
UNION ALL SELECT 'TotalOcConsumo' AS columna, COUNT(*) AS filas_distintas FROM #O o JOIN #L l ON l.Corre=o.Corre AND l.IdSite=o.IdSite WHERE ISNULL(o.[TotalOcConsumo],'~')<>ISNULL(l.[TotalOcConsumo],'~')
UNION ALL SELECT 'MontoRetencion' AS columna, COUNT(*) AS filas_distintas FROM #O o JOIN #L l ON l.Corre=o.Corre AND l.IdSite=o.IdSite WHERE ISNULL(o.[MontoRetencion],'~')<>ISNULL(l.[MontoRetencion],'~')
UNION ALL SELECT 'TotalPagarOriginal' AS columna, COUNT(*) AS filas_distintas FROM #O o JOIN #L l ON l.Corre=o.Corre AND l.IdSite=o.IdSite WHERE ISNULL(o.[TotalPagarOriginal],'~')<>ISNULL(l.[TotalPagarOriginal],'~')
UNION ALL SELECT 'IdTarea' AS columna, COUNT(*) AS filas_distintas FROM #O o JOIN #L l ON l.Corre=o.Corre AND l.IdSite=o.IdSite WHERE ISNULL(o.[IdTarea],'~')<>ISNULL(l.[IdTarea],'~')
UNION ALL SELECT 'Tarea' AS columna, COUNT(*) AS filas_distintas FROM #O o JOIN #L l ON l.Corre=o.Corre AND l.IdSite=o.IdSite WHERE ISNULL(o.[Tarea],'~')<>ISNULL(l.[Tarea],'~')
UNION ALL SELECT 'imgFactura' AS columna, COUNT(*) AS filas_distintas FROM #O o JOIN #L l ON l.Corre=o.Corre AND l.IdSite=o.IdSite WHERE ISNULL(o.[imgFactura],'~')<>ISNULL(l.[imgFactura],'~')
UNION ALL SELECT 'idprovisional' AS columna, COUNT(*) AS filas_distintas FROM #O o JOIN #L l ON l.Corre=o.Corre AND l.IdSite=o.IdSite WHERE ISNULL(o.[idprovisional],'~')<>ISNULL(l.[idprovisional],'~')
UNION ALL SELECT 'fechaInicio' AS columna, COUNT(*) AS filas_distintas FROM #O o JOIN #L l ON l.Corre=o.Corre AND l.IdSite=o.IdSite WHERE ISNULL(o.[fechaInicio],'~')<>ISNULL(l.[fechaInicio],'~')
UNION ALL SELECT 'NombreEstado' AS columna, COUNT(*) AS filas_distintas FROM #O o JOIN #L l ON l.Corre=o.Corre AND l.IdSite=o.IdSite WHERE ISNULL(o.[NombreEstado],'~')<>ISNULL(l.[NombreEstado],'~')
UNION ALL SELECT 'serie' AS columna, COUNT(*) AS filas_distintas FROM #O o JOIN #L l ON l.Corre=o.Corre AND l.IdSite=o.IdSite WHERE ISNULL(o.[serie],'~')<>ISNULL(l.[serie],'~')
UNION ALL SELECT 'NroOperacion' AS columna, COUNT(*) AS filas_distintas FROM #O o JOIN #L l ON l.Corre=o.Corre AND l.IdSite=o.IdSite WHERE ISNULL(o.[NroOperacion],'~')<>ISNULL(l.[NroOperacion],'~')
UNION ALL SELECT 'ObservacionPlanilla' AS columna, COUNT(*) AS filas_distintas FROM #O o JOIN #L l ON l.Corre=o.Corre AND l.IdSite=o.IdSite WHERE ISNULL(o.[ObservacionPlanilla],'~')<>ISNULL(l.[ObservacionPlanilla],'~')
UNION ALL SELECT 'Observacion' AS columna, COUNT(*) AS filas_distintas FROM #O o JOIN #L l ON l.Corre=o.Corre AND l.IdSite=o.IdSite WHERE ISNULL(o.[Observacion],'~')<>ISNULL(l.[Observacion],'~')
UNION ALL SELECT 'SubtotalOriginal' AS columna, COUNT(*) AS filas_distintas FROM #O o JOIN #L l ON l.Corre=o.Corre AND l.IdSite=o.IdSite WHERE ISNULL(o.[SubtotalOriginal],'~')<>ISNULL(l.[SubtotalOriginal],'~')
UNION ALL SELECT 'IgvOriginal' AS columna, COUNT(*) AS filas_distintas FROM #O o JOIN #L l ON l.Corre=o.Corre AND l.IdSite=o.IdSite WHERE ISNULL(o.[IgvOriginal],'~')<>ISNULL(l.[IgvOriginal],'~')
UNION ALL SELECT 'TotalOriginal' AS columna, COUNT(*) AS filas_distintas FROM #O o JOIN #L l ON l.Corre=o.Corre AND l.IdSite=o.IdSite WHERE ISNULL(o.[TotalOriginal],'~')<>ISNULL(l.[TotalOriginal],'~')
UNION ALL SELECT 'SumaEmp' AS columna, COUNT(*) AS filas_distintas FROM #O o JOIN #L l ON l.Corre=o.Corre AND l.IdSite=o.IdSite WHERE ISNULL(o.[SumaEmp],'~')<>ISNULL(l.[SumaEmp],'~')
UNION ALL SELECT 'SumaEmpSolesNativo' AS columna, COUNT(*) AS filas_distintas FROM #O o JOIN #L l ON l.Corre=o.Corre AND l.IdSite=o.IdSite WHERE ISNULL(o.[SumaEmpSolesNativo],'~')<>ISNULL(l.[SumaEmpSolesNativo],'~')
UNION ALL SELECT 'SumaEmpUsdNativo' AS columna, COUNT(*) AS filas_distintas FROM #O o JOIN #L l ON l.Corre=o.Corre AND l.IdSite=o.IdSite WHERE ISNULL(o.[SumaEmpUsdNativo],'~')<>ISNULL(l.[SumaEmpUsdNativo],'~')
UNION ALL SELECT 'SumaEmpEurNativo' AS columna, COUNT(*) AS filas_distintas FROM #O o JOIN #L l ON l.Corre=o.Corre AND l.IdSite=o.IdSite WHERE ISNULL(o.[SumaEmpEurNativo],'~')<>ISNULL(l.[SumaEmpEurNativo],'~')
UNION ALL SELECT 'SumaEmpDopNativo' AS columna, COUNT(*) AS filas_distintas FROM #O o JOIN #L l ON l.Corre=o.Corre AND l.IdSite=o.IdSite WHERE ISNULL(o.[SumaEmpDopNativo],'~')<>ISNULL(l.[SumaEmpDopNativo],'~')
UNION ALL SELECT 'SumaEmpCopNativo' AS columna, COUNT(*) AS filas_distintas FROM #O o JOIN #L l ON l.Corre=o.Corre AND l.IdSite=o.IdSite WHERE ISNULL(o.[SumaEmpCopNativo],'~')<>ISNULL(l.[SumaEmpCopNativo],'~')
UNION ALL SELECT 'CantRecibosEmp' AS columna, COUNT(*) AS filas_distintas FROM #O o JOIN #L l ON l.Corre=o.Corre AND l.IdSite=o.IdSite WHERE ISNULL(o.[CantRecibosEmp],'~')<>ISNULL(l.[CantRecibosEmp],'~')
UNION ALL SELECT 'IdGestor' AS columna, COUNT(*) AS filas_distintas FROM #O o JOIN #L l ON l.Corre=o.Corre AND l.IdSite=o.IdSite WHERE ISNULL(o.[IdGestor],'~')<>ISNULL(l.[IdGestor],'~')
UNION ALL SELECT 'IdSolicitanteCj' AS columna, COUNT(*) AS filas_distintas FROM #O o JOIN #L l ON l.Corre=o.Corre AND l.IdSite=o.IdSite WHERE ISNULL(o.[IdSolicitanteCj],'~')<>ISNULL(l.[IdSolicitanteCj],'~')
UNION ALL SELECT 'IdGestorCj' AS columna, COUNT(*) AS filas_distintas FROM #O o JOIN #L l ON l.Corre=o.Corre AND l.IdSite=o.IdSite WHERE ISNULL(o.[IdGestorCj],'~')<>ISNULL(l.[IdGestorCj],'~')
UNION ALL SELECT 'IdValidadorCj' AS columna, COUNT(*) AS filas_distintas FROM #O o JOIN #L l ON l.Corre=o.Corre AND l.IdSite=o.IdSite WHERE ISNULL(o.[IdValidadorCj],'~')<>ISNULL(l.[IdValidadorCj],'~')
UNION ALL SELECT 'FechaReaprobador' AS columna, COUNT(*) AS filas_distintas FROM #O o JOIN #L l ON l.Corre=o.Corre AND l.IdSite=o.IdSite WHERE ISNULL(o.[FechaReaprobador],'~')<>ISNULL(l.[FechaReaprobador],'~')
UNION ALL SELECT 'TotalOcFila' AS columna, COUNT(*) AS filas_distintas FROM #O o JOIN #L l ON l.Corre=o.Corre AND l.IdSite=o.IdSite WHERE ISNULL(o.[TotalOcFila],'~')<>ISNULL(l.[TotalOcFila],'~')
) x WHERE filas_distintas > 0 ORDER BY filas_distintas DESC;

-- 8) Detalle de las filas con la misma clave que difieren en alguna columna (clave y hora de creacion).
SELECT TOP 20 o.Corre, o.IdSite, o.Estado AS estado_original, l.Estado AS estado_ligero,
       o.HoraCreacion, o.Subtotal AS subtotal_original, l.Subtotal AS subtotal_ligero
FROM #O o JOIN #L l ON l.Corre = o.Corre AND l.IdSite = o.IdSite
WHERE EXISTS (
    SELECT o.[FecIngreso], o.[Detalle], o.[Cuenta], o.[CuentaInter], o.[Bien], o.[Comprobante], o.[Banco], o.[RUC], o.[Moneda], o.[Atp], o.[Status_Pap], o.[Subtotal], o.[IGV], o.[Total], o.[SubtotalSoles], o.[IGVSoles], o.[TotalSoles], o.[Comentario], o.[Solicitante], o.[GEstor], o.[Validador], o.[FechaDeposito], o.[Estado], o.[EstadoNombre], o.[Corre], o.[IdProyecto], o.[Correlativo], o.[IdResponsable], o.[IdSite], o.[Usuario], o.[Ot], o.[IdCliente], o.[IdBien], o.[IdComprobante], o.[IdTipoPago], o.[TipoMoneda], o.[IdRendicion], o.[IdSolicitante], o.[IdValidador], o.[HoraCreacion], o.[NomResponsable], o.[IdTipoDoc], o.[Fila], o.[IdTransferencia], o.[NombreProyecto], o.[Site], o.[CorSite], o.[Tipo_Trabajo], o.[Responsable], o.[Cliente], o.[IdOc], o.[IdEstadoOc], o.[EstadoOcSemaforo], o.[TotalOcConsumo], o.[MontoRetencion], o.[TotalPagarOriginal], o.[IdTarea], o.[Tarea], o.[imgFactura], o.[idprovisional], o.[fechaInicio], o.[NombreEstado], o.[serie], o.[NroOperacion], o.[ObservacionPlanilla], o.[Observacion], o.[SubtotalOriginal], o.[IgvOriginal], o.[TotalOriginal], o.[SumaEmp], o.[SumaEmpSolesNativo], o.[SumaEmpUsdNativo], o.[SumaEmpEurNativo], o.[SumaEmpDopNativo], o.[SumaEmpCopNativo], o.[CantRecibosEmp], o.[IdGestor], o.[IdSolicitanteCj], o.[IdGestorCj], o.[IdValidadorCj], o.[FechaReaprobador], o.[TotalOcFila]
    EXCEPT
    SELECT l.[FecIngreso], l.[Detalle], l.[Cuenta], l.[CuentaInter], l.[Bien], l.[Comprobante], l.[Banco], l.[RUC], l.[Moneda], l.[Atp], l.[Status_Pap], l.[Subtotal], l.[IGV], l.[Total], l.[SubtotalSoles], l.[IGVSoles], l.[TotalSoles], l.[Comentario], l.[Solicitante], l.[GEstor], l.[Validador], l.[FechaDeposito], l.[Estado], l.[EstadoNombre], l.[Corre], l.[IdProyecto], l.[Correlativo], l.[IdResponsable], l.[IdSite], l.[Usuario], l.[Ot], l.[IdCliente], l.[IdBien], l.[IdComprobante], l.[IdTipoPago], l.[TipoMoneda], l.[IdRendicion], l.[IdSolicitante], l.[IdValidador], l.[HoraCreacion], l.[NomResponsable], l.[IdTipoDoc], l.[Fila], l.[IdTransferencia], l.[NombreProyecto], l.[Site], l.[CorSite], l.[Tipo_Trabajo], l.[Responsable], l.[Cliente], l.[IdOc], l.[IdEstadoOc], l.[EstadoOcSemaforo], l.[TotalOcConsumo], l.[MontoRetencion], l.[TotalPagarOriginal], l.[IdTarea], l.[Tarea], l.[imgFactura], l.[idprovisional], l.[fechaInicio], l.[NombreEstado], l.[serie], l.[NroOperacion], l.[ObservacionPlanilla], l.[Observacion], l.[SubtotalOriginal], l.[IgvOriginal], l.[TotalOriginal], l.[SumaEmp], l.[SumaEmpSolesNativo], l.[SumaEmpUsdNativo], l.[SumaEmpEurNativo], l.[SumaEmpDopNativo], l.[SumaEmpCopNativo], l.[CantRecibosEmp], l.[IdGestor], l.[IdSolicitanteCj], l.[IdGestorCj], l.[IdValidadorCj], l.[FechaReaprobador], l.[TotalOcFila]);

DROP TABLE #O, #L, #TT;
