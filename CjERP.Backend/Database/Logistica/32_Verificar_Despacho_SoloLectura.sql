/*
  Logistica / x Despachar - VERIFICACION de una solicitud. SOLO LECTURA (solo SELECT; no modifica nada).
  Uso: poner el numero de solicitud en @Nro y ejecutar ANTES y DESPUES de despachar/rechazar desde el movil; comparar.
  Muestra: cabecera, lineas, series, stock del libro y de MaterialStock, movimientos del libro, MovMaterial, Kardex y auditoria.
*/
SET NOCOUNT ON;
SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;

DECLARE @Nro nvarchar(10) = N'1000006788';   -- <-- numero de solicitud a verificar

PRINT '=== 1. Cabecera (2 filas = destino y origen; IdWeb = 1 -> sistema nuevo) ===';
SELECT c.NroSolicitud, c.IdMovimiento, c.IdWeb, c.IdEstado, c.IdDespachador, c.Observacion
FROM dbo.CabSolicitud c WHERE c.NroSolicitud = @Nro ORDER BY c.IdMovimiento;

PRINT '=== 2. Lineas de destino (IdDespacho = 1) ===';
SELECT b.Posicion, b.CodPap, b.CantSap, b.CantDesp, b.Serie, b.IdEstado, b.FechaDespacho, b.IdRespDespacho,
       b.FechaRechazar, b.IdRespRec, b.RutaImagen, b.Observacion
FROM dbo.DetSolicitud b WHERE b.NroSolicitud = @Nro AND b.IdDespacho = 1 ORDER BY TRY_CONVERT(int, b.Posicion);

PRINT '=== 3. Series de las lineas (DetLogistica: 2 = libre, 88 = en uso) ===';
SELECT l.CodPap, l.Serie, l.IdEstado
FROM dbo.DetLogistica l
WHERE EXISTS (SELECT 1 FROM dbo.DetSolicitud b WHERE b.NroSolicitud = @Nro AND b.IdDespacho = 1
              AND b.Serie = l.Serie AND CAST(b.CodPap AS nvarchar(50)) = CAST(l.CodPap AS nvarchar(50)) AND LEN(ISNULL(b.Serie, '')) > 0)
ORDER BY l.CodPap, l.Serie;

PRINT '=== 4. Stock del libro (StockSaldo) por material de la solicitud ===';
SELECT s.CodPap,
       SUM(CASE WHEN s.Bucket = 'Disponible' THEN s.Cantidad ELSE 0 END) AS Disponible,
       SUM(CASE WHEN s.Bucket = 'Aprobado'   THEN s.Cantidad ELSE 0 END) AS Aprobado,
       SUM(CASE WHEN s.Bucket = 'Despachado' THEN s.Cantidad ELSE 0 END) AS Despachado,
       SUM(CASE WHEN s.Bucket = 'Enviado'    THEN s.Cantidad ELSE 0 END) AS Enviado
FROM dbo.StockSaldo s
WHERE s.CodPap IN (SELECT DISTINCT CAST(b.CodPap AS nvarchar(50)) FROM dbo.DetSolicitud b WHERE b.NroSolicitud = @Nro AND b.IdDespacho = 1)
GROUP BY s.CodPap ORDER BY s.CodPap;

PRINT '=== 5. MaterialStock (sistema antiguo): Disponible debe seguir al libro; las colas NO deben cambiar tras el despacho ===';
SELECT CAST(m.CodPap AS nvarchar(50)) AS CodPap, m.Stock, m.Disponible, m.Despachado, m.Enviado, m.Campo, m.Cruce
FROM dbo.MaterialStock m
WHERE CAST(m.CodPap AS nvarchar(50)) IN (SELECT DISTINCT CAST(b.CodPap AS nvarchar(50)) FROM dbo.DetSolicitud b WHERE b.NroSolicitud = @Nro AND b.IdDespacho = 1)
ORDER BY m.CodPap;

PRINT '=== 6. Movimientos del libro de esta solicitud ===';
SELECT m.IdMovimiento, m.FechaHoraUtc, m.Operacion, m.CodPap, m.BucketOrigen, m.BucketDestino, m.Cantidad, m.Posicion, m.Serie, m.IdEstadoDoc, m.Usuario, m.Observacion
FROM dbo.StockMovimiento m WHERE m.NroSolicitud = @Nro ORDER BY m.IdMovimiento;

PRINT '=== 7. MovMaterial ===';
SELECT mm.Posicion, mm.IdEstado, mm.IdMovimiento, mm.CodPap, mm.CantSap, mm.Usuario, mm.Fecha, mm.Observacion
FROM dbo.MovMaterial mm WHERE mm.NroSolicitud = @Nro ORDER BY mm.Hora;

PRINT '=== 8. Kardex ===';
SELECT k.FilaSolicitud, k.TipoMovimiento, k.CodPap, k.CantSap, k.Observaciones, k.IdEstado, k.Serie, k.Fecha
FROM dbo.Kardex k WHERE k.NroSolicitud = @Nro ORDER BY k.Hora;

PRINT '=== 9. Auditoria (modulo LOGISTICA, seccion DESPACHO) ===';
SELECT a.FechaAccion, a.Entidad, a.IdRegistro, a.Seccion, a.Campo, a.ValorAnterior, a.ValorNuevo, a.UsuarioAccion
FROM dbo.AuditoriaCambios a
WHERE a.Modulo = 'LOGISTICA' AND (a.IdRegistro = @Nro OR a.IdRegistro LIKE @Nro + N'-%')
ORDER BY a.IdAuditoria;
