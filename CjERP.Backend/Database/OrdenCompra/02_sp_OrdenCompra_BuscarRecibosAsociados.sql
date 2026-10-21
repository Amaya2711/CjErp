/*
  sp_OrdenCompra_BuscarRecibosAsociados
  Recibos (dbo.Planilla) asociados a una OC (Planilla.IdOc = @IdOc, y Fila si viene).
  Reemplaza el SQL inline OrdenCompraService.BuscarRecibosAsociadosSql.

  Corrige el duplicado de filas: Empleado.IdEmpleadoCj no es unico, asi que los joins
  "por IdEmpleadoCj" (responsable / gestor / validador) multiplicaban cada recibo
  (p. ej. 2 x 3 = 6 filas y la "Suma de recibos" salia 6 veces). Ahora cada nombre se
  obtiene con OUTER APPLY TOP 1 y el recibo sale una sola vez.
  El desempate usa la misma prioridad de cargo (10, 11, 83) que sp_OrdenCompra_BuscarDetalle.

  Mismas columnas y mismo orden que el SQL inline (compatible con OrdenCompraReciboDto).
  Montos en la moneda real del recibo (sin convertir).
*/
CREATE OR ALTER PROCEDURE dbo.sp_OrdenCompra_BuscarRecibosAsociados
(
    @IdOc INT,
    @Fila INT = NULL
)
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        a.Correlativo,
        a.FecIngreso,
        a.Subtotal,
        a.Igv,
        a.Total,
        b.ValorIni AS Moneda,
        a.Detalle,
        COALESCE(a.ImgSustento, '') AS RutaImagen,
        a.IdCliente,
        a.IdProyecto,
        a.IdSite,
        a.CorreSite,
        a.Tipo_Trabajo AS TipoTrabajo,
        c.ValorIni AS Comprobante,
        COALESCE(NULLIF(LTRIM(RTRIM(tipoPago.ValorIni)), ''), CONVERT(varchar(20), a.IdTipoPago), '') AS TipoPago,
        COALESCE(responsableCj.NombreEmpleado, d.NombreEmpleado, responsablePorCj.NombreEmpleado, CONVERT(varchar(20), a.IdResponsable), '') AS Responsable,
        COALESCE(gestorCj.NombreEmpleado, gestorLegacy.NombreEmpleado, gestorPorCj.NombreEmpleado, CONVERT(varchar(20), a.IdGestor), '') AS Gestor,
        COALESCE(validadorCj.NombreEmpleado, validadorLegacy.NombreEmpleado, validadorPorCj.NombreEmpleado, CONVERT(varchar(20), a.IdValidador), '') AS Validador,
        d.NroDocumento,
        e.ValorIni AS Estado,
        f.ValorIni AS Tarea,
        a.Fila,
        TRY_CONVERT(int, NULLIF(LTRIM(RTRIM(CONVERT(varchar(50), a.IdOc))), '')) AS IdOc
    FROM dbo.Planilla a
    LEFT JOIN dbo.Constante b ON b.Campo = 'TIPO_MONEDA' AND a.TipoMoneda = b.Correlativo
    LEFT JOIN dbo.Constante c ON c.Campo = 'TIPO_COMPROBANTE' AND a.IdComprobante = c.Correlativo
    LEFT JOIN dbo.Constante tipoPago ON tipoPago.Campo = 'TIPO_PAGO' AND a.IdTipoPago = tipoPago.Correlativo
    LEFT JOIN dbo.Empleado d ON a.IdResponsable = d.IdEmpleado
    LEFT JOIN dbo.EmpleadoCj responsableCj ON a.IdResponsable = responsableCj.IdEmpleado AND ISNULL(a.IdWeb, 0) = 1
    OUTER APPLY (SELECT TOP 1 x.NombreEmpleado FROM dbo.Empleado x WHERE x.IdEmpleadoCj = a.IdResponsable ORDER BY CASE WHEN x.IdCargo = 10 THEN 1 WHEN x.IdCargo = 11 THEN 2 WHEN x.IdCargo = 83 THEN 3 ELSE 99 END, x.IdCargo, x.IdEmpleado) responsablePorCj
    LEFT JOIN dbo.Empleado gestorLegacy ON a.IdGestor = gestorLegacy.IdEmpleado AND ISNULL(a.IdWeb, 0) <> 1
    LEFT JOIN dbo.EmpleadoCj gestorCj ON a.IdGestor = gestorCj.IdEmpleado AND ISNULL(a.IdWeb, 0) = 1
    OUTER APPLY (SELECT TOP 1 x.NombreEmpleado FROM dbo.Empleado x WHERE x.IdEmpleadoCj = a.IdGestor ORDER BY CASE WHEN x.IdCargo = 10 THEN 1 WHEN x.IdCargo = 11 THEN 2 WHEN x.IdCargo = 83 THEN 3 ELSE 99 END, x.IdCargo, x.IdEmpleado) gestorPorCj
    LEFT JOIN dbo.Empleado validadorLegacy ON a.IdValidador = validadorLegacy.IdEmpleado AND ISNULL(a.IdWeb, 0) <> 1
    LEFT JOIN dbo.EmpleadoCj validadorCj ON a.IdValidador = validadorCj.IdEmpleado AND ISNULL(a.IdWeb, 0) = 1
    OUTER APPLY (SELECT TOP 1 x.NombreEmpleado FROM dbo.Empleado x WHERE x.IdEmpleadoCj = a.IdValidador ORDER BY CASE WHEN x.IdCargo = 10 THEN 1 WHEN x.IdCargo = 11 THEN 2 WHEN x.IdCargo = 83 THEN 3 ELSE 99 END, x.IdCargo, x.IdEmpleado) validadorPorCj
    LEFT JOIN dbo.Constante e ON e.Campo = 'ESTADO' AND e.Correlativo = a.Estado
    LEFT JOIN dbo.Constante f ON f.Campo = 'TAREA' AND f.Correlativo = a.IdTarea
    WHERE TRY_CONVERT(int, NULLIF(LTRIM(RTRIM(CONVERT(varchar(50), a.IdOc))), '')) = @IdOc
      AND (@Fila IS NULL OR a.Fila = @Fila)
    ORDER BY a.TipoMoneda, a.FecIngreso, a.Correlativo;
END;
GO
