/* ------------------------------------------------------------------------------------------------
   Rechazar solicitudes de equipos desde Solicitud > Historial. PV: NO ejecutado ni probado contra la BD.
   Solo se rechazan solicitudes en estado 9 (x aprobar) o 3 (sin aprobacion); cualquier otra se rechaza con error.
   Efecto (mismo criterio que OBSERVAR en sp_Logistica_Solicitud_Aprobar, script 08):
     - Cabecera, detalle (DetSolicitud) y MovMaterial pasan a estado 6 (decision: se reutiliza el 6 de 'observada').
     - El stock vuelve a Disponible: desde 'Aprobado' si la solicitud estaba en 9, desde 'Despachado' si estaba en 3.
     - DetSolicitud.IdRespRec = @IdEmpleadoCj y DetSolicitud.FechaRechazar = fecha y hora actual (PV: FechaRechazar debe ser datetime).
     - Las series bloqueadas en logistica (estado 88) de esas filas vuelven a estado 2.
   @Items = [{"nroSolicitud":"123"}] rechaza toda la solicitud; [{"nroSolicitud":"123","posicion":"2"}] rechaza SOLO esa posicion
   (detalle en Historial): la linea pasa a 6, su stock vuelve a Disponible y la cabecera pasa a 6 solo cuando ya no quedan
   lineas en el estado anterior. @Observacion (motivo) es obligatoria y queda en CabSolicitud.Observacion.
   Idempotencia del stock: clave 'RECHAZAR:<nro>|<pos>'.
------------------------------------------------------------------------------------------------ */
CREATE OR ALTER PROCEDURE dbo.sp_Logistica_Solicitud_Rechazar
  @Items        nvarchar(max),
  @Observacion  nvarchar(500),
  @Usuario      nvarchar(50),
  @IdEmpleadoCj int           = NULL,
  @Procesadas   int           OUTPUT
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  IF OBJECT_ID(N'dbo.sp_Stock_Mover', N'P') IS NULL
    THROW 51230, 'Falta dbo.sp_Stock_Mover (ejecute los scripts de stock 01 a 05).', 1;

  SET @Observacion = NULLIF(LTRIM(RTRIM(@Observacion)), N'');
  IF @Observacion IS NULL THROW 51231, 'Debe ingresar el motivo del rechazo.', 1;

  DECLARE @ahora datetime = CONVERT(datetime, SYSDATETIMEOFFSET() AT TIME ZONE 'SA Pacific Standard Time');
  DECLARE @hoy date = CAST(@ahora AS date);
  DECLARE @estadoNuevo int = 6;

  DECLARE @s TABLE (Seq int IDENTITY(1,1) PRIMARY KEY, Nro nvarchar(50) NOT NULL, Pos nvarchar(50) NULL, EstadoAnterior int NULL);
  INSERT INTO @s (Nro, Pos)
  SELECT DISTINCT LTRIM(RTRIM(j.nroSolicitud)), NULLIF(LTRIM(RTRIM(ISNULL(j.posicion, N''))), N'')
  FROM OPENJSON(@Items) WITH (nroSolicitud nvarchar(50) '$.nroSolicitud', posicion nvarchar(50) '$.posicion') j
  WHERE LTRIM(RTRIM(ISNULL(j.nroSolicitud, N''))) <> N'';

  IF NOT EXISTS (SELECT 1 FROM @s) THROW 51232, 'No hay solicitudes seleccionadas.', 1;

  UPDATE x SET x.EstadoAnterior = a.IdEstado
  FROM @s x INNER JOIN dbo.CabSolicitud a ON a.NroSolicitud = x.Nro;

  IF EXISTS (SELECT 1 FROM @s WHERE EstadoAnterior = 6)
    THROW 51235, 'No se puede rechazar una solicitud que ya esta rechazada.', 1;

  IF EXISTS (SELECT 1 FROM @s WHERE EstadoAnterior IS NULL OR EstadoAnterior NOT IN (9, 3))
    THROW 51233, 'Solo se pueden rechazar solicitudes x aprobar (9) o sin aprobacion (3). Vuelva a consultar.', 1;

  -- Rechazo por posicion: la posicion debe existir y seguir en el estado de la solicitud (no rechazada antes).
  IF EXISTS (SELECT 1 FROM @s x WHERE x.Pos IS NOT NULL
               AND NOT EXISTS (SELECT 1 FROM dbo.DetSolicitud b
                               WHERE b.NroSolicitud = x.Nro AND b.IdDespacho = 1 AND b.IdEstado = x.EstadoAnterior
                                 AND CAST(b.Posicion AS nvarchar(50)) = x.Pos))
    THROW 51234, 'La posicion indicada ya esta rechazada o no existe. Vuelva a consultar.', 1;

  BEGIN TRY
    BEGIN TRANSACTION;

    -- Filas de destino que devuelven stock (se capturan antes de cambiar su estado).
    DECLARE @m TABLE (Id int IDENTITY(1,1) PRIMARY KEY, Nro nvarchar(50), CodPap nvarchar(50), Cant decimal(18,4), Pos nvarchar(50),
                      Corr nvarchar(50), Serie nvarchar(100), Origen varchar(20));
    INSERT INTO @m (Nro, CodPap, Cant, Pos, Corr, Serie, Origen)
    SELECT CAST(b.NroSolicitud AS nvarchar(50)), CAST(b.CodPap AS nvarchar(50)), b.CantSap, CAST(b.Posicion AS nvarchar(50)),
           CAST(b.Correlativo AS nvarchar(50)), CAST(b.Serie AS nvarchar(100)),
           CASE WHEN x.EstadoAnterior = 9 THEN 'Aprobado' ELSE 'Despachado' END
    FROM dbo.DetSolicitud b
    INNER JOIN @s x ON x.Nro = b.NroSolicitud
    WHERE b.IdDespacho = 1 AND b.IdEstado = x.EstadoAnterior
      AND (x.Pos IS NULL OR CAST(b.Posicion AS nvarchar(50)) = x.Pos);

    -- Detalle (incluye la fila espejo del site de origen) y MovMaterial: solo las posiciones pedidas.
    UPDATE b SET b.IdEstado      = @estadoNuevo,
                 b.IdRespRec     = @IdEmpleadoCj,   -- EmpleadoCj con el que se ingreso al sistema (JWT)
                 b.FechaRechazar = @ahora,          -- fecha y hora actual (America/Lima)
                 b.Observacion   = @Observacion
    FROM dbo.DetSolicitud b INNER JOIN @s x ON x.Nro = b.NroSolicitud
    WHERE b.IdEstado = x.EstadoAnterior
      AND (x.Pos IS NULL OR CAST(b.Posicion AS nvarchar(50)) = x.Pos);

    UPDATE mm SET mm.IdEstado = @estadoNuevo, mm.IdSolicitante = ISNULL(@IdEmpleadoCj, mm.IdSolicitante)
    FROM dbo.MovMaterial mm INNER JOIN @s x ON x.Nro = mm.NroSolicitud
    WHERE mm.IdEstado = x.EstadoAnterior
      AND (x.Pos IS NULL OR CAST(mm.Posicion AS nvarchar(50)) = x.Pos);

    -- Cabecera: pasa a 6 solo si ya no queda ninguna linea de destino en el estado anterior.
    UPDATE a SET a.IdEstado = @estadoNuevo, a.Observacion = @Observacion
    FROM dbo.CabSolicitud a
    WHERE a.NroSolicitud IN (SELECT Nro FROM @s)
      AND NOT EXISTS (SELECT 1 FROM dbo.DetSolicitud b
                      WHERE b.NroSolicitud = a.NroSolicitud AND b.IdDespacho = 1 AND b.IdEstado = a.IdEstado);

    UPDATE l SET l.IdEstado = 2
    FROM dbo.DetLogistica l
    WHERE l.PedidoSap <> '9999999999' AND LEN(ISNULL(l.Serie, '')) > 0 AND l.IdEstado = 88
      AND l.Serie IN (SELECT m.Serie FROM @m m WHERE ISNULL(m.Serie, '') NOT IN ('', 'NO APLICA'));

    DECLARE @i int = 1, @max int = (SELECT ISNULL(MAX(Id), 0) FROM @m);
    DECLARE @cod nvarchar(50), @cant decimal(18,4), @nro nvarchar(50), @pos nvarchar(50), @corr nvarchar(50), @origen varchar(20), @clave nvarchar(100);
    WHILE @i <= @max
    BEGIN
      SELECT @cod = CodPap, @cant = Cant, @nro = Nro, @pos = Pos, @corr = Corr, @origen = Origen FROM @m WHERE Id = @i;
      SET @clave = CONCAT(N'RECHAZAR:', @nro, N'|', @pos);
      EXEC dbo.sp_Stock_Mover
        @CodPap = @cod, @BucketOrigen = @origen, @BucketDestino = 'Disponible', @Cantidad = @cant,
        @Operacion = 'RECHAZAR', @NroSolicitud = @nro, @Posicion = @pos, @CorrelativoDet = @corr,
        @IdEstadoDoc = @estadoNuevo, @Usuario = @Usuario, @IdEmpleadoCj = @IdEmpleadoCj, @Observacion = @Observacion,
        @ClaveIdempotencia = @clave;
      SET @i += 1;
    END;

    SET @Procesadas = (SELECT COUNT(DISTINCT CONCAT(Nro, N'|', ISNULL(Pos, N''))) FROM @s);
    COMMIT TRANSACTION;
  END TRY
  BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
  END CATCH;
END;
GO
