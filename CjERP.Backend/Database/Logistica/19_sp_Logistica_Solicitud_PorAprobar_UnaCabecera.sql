/*
  Logistica de equipos - x APROBAR: una cabecera por solicitud y pendiente segun las LINEAS en estado 9.
  PV: NO ejecutado ni probado contra la BD. Recrea dbo.sp_Logistica_Solicitud_PorAprobar (lectura) y dbo.sp_Logistica_Solicitud_Aprobar.

  - Solicitudes del sistema antiguo tienen DOS filas en CabSolicitud (IdMovimiento 1 destino / 2 origen): se usa una sola (destino).
  - En solicitudes antiguas la cabecera puede estar en estado 3 mientras sus lineas de destino estan en 9 (pendientes). El sistema
    antiguo las lista por las lineas, por eso ahora PorAprobar y Aprobar validan IdDespacho = 1 AND IdEstado = 9 en DetSolicitud.
  Ejecutar SOLO este script (no el 08 completo).
*/
SET NOCOUNT ON;
GO
CREATE OR ALTER PROCEDURE dbo.sp_Logistica_Solicitud_PorAprobar
  @IdCliente  int           = NULL,
  @IdProyecto int           = NULL,
  @IdSite     nvarchar(50)  = NULL,
  @CorreSite  int           = NULL
AS
BEGIN
  SET NOCOUNT ON;

  SELECT TOP (2000)
         CAST(a.NroSolicitud AS nvarchar(50))           AS NroSolicitud,
         a.IdCliente, a.IdProyecto, a.IdSite, a.CorreSite,
         CAST(a.TipoTrabajo AS nvarchar(100))           AS TipoTrabajo,
         cl.NombreCliente, pr.NombreProyecto, s.NombreSite,
         CAST(a.Usuario AS nvarchar(50))                AS Usuario,
         a.FechaCreacion,
         sol.NombreEmpleado                             AS Solicitante,
         fe.ValorIni                                    AS FormaEnvio,
         CAST(a.Direccion AS nvarchar(300))             AS Direccion,
         CAST(a.Referencia AS nvarchar(300))            AS Referencia,
         det.Lineas,
         det.Cantidad,
         CAST(9 AS int)                                 AS IdEstado
  -- Una sola cabecera por solicitud (el sistema antiguo crea 2: destino IdMovimiento = 1 y origen = 2): la de destino. Ver script 19.
  FROM (SELECT c.*,
               ROW_NUMBER() OVER (PARTITION BY c.NroSolicitud
                                  ORDER BY CASE WHEN c.IdMovimiento = 1 THEN 0 ELSE 1 END, c.IdMovimiento) AS rn
        FROM dbo.CabSolicitud c) a
  OUTER APPLY (SELECT COUNT(*) AS Lineas, SUM(b.CantSap) AS Cantidad
               FROM dbo.DetSolicitud b
               WHERE b.NroSolicitud = a.NroSolicitud AND b.IdDespacho = 1 AND b.IdEstado = 9) det
  LEFT JOIN dbo.Cliente cl   ON cl.IdCliente = a.IdCliente
  LEFT JOIN dbo.Proyecto pr  ON pr.IdProyecto = a.IdProyecto
  LEFT JOIN dbo.Site s       ON s.IdSite = a.IdSite AND s.Correlativo = a.CorreSite
  LEFT JOIN dbo.Empleado sol ON sol.IdEmpleado = a.IdSolicitante
  LEFT JOIN dbo.Constante fe ON fe.Campo = 'FORMA_ENVIO' AND fe.Correlativo = a.FormaEnvio
  -- Pendiente = tiene lineas de destino en estado 9 (la cabecera de solicitudes antiguas puede estar en 3).
  WHERE a.rn = 1 AND ISNULL(det.Lineas, 0) > 0
    AND (@IdCliente IS NULL OR a.IdCliente = @IdCliente)
    AND (@IdProyecto IS NULL OR a.IdProyecto = @IdProyecto)
    AND (@IdSite IS NULL OR (a.IdSite = @IdSite AND a.CorreSite = ISNULL(@CorreSite, a.CorreSite)))
  ORDER BY a.FechaCreacion DESC, a.NroSolicitud DESC;
END;
GO
CREATE OR ALTER PROCEDURE dbo.sp_Logistica_Solicitud_Aprobar
  @Items        nvarchar(max),
  @Accion       varchar(10),
  @IdValidador  int           = NULL,
  @Observacion  nvarchar(500) = NULL,
  @Usuario      nvarchar(50),
  @IdEmpleadoCj int           = NULL,
  @Procesadas   int           OUTPUT
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  IF OBJECT_ID(N'dbo.sp_Stock_Mover', N'P') IS NULL
    THROW 51220, 'Falta dbo.sp_Stock_Mover (ejecute los scripts de stock 01 a 05).', 1;
  IF @Accion NOT IN ('APROBAR', 'OBSERVAR') THROW 51221, 'Accion no valida.', 1;

  SET @Observacion = NULLIF(LTRIM(RTRIM(@Observacion)), N'');
  IF @Accion = 'APROBAR' AND NOT EXISTS (SELECT 1 FROM dbo.Empleado e WHERE e.IdEmpleado = @IdValidador)
    THROW 51222, 'Debe seleccionar el validador.', 1;
  IF @Accion = 'OBSERVAR' AND @Observacion IS NULL THROW 51223, 'Debe ingresar la observacion.', 1;

  DECLARE @ahora datetime = CONVERT(datetime, SYSDATETIMEOFFSET() AT TIME ZONE 'SA Pacific Standard Time');
  DECLARE @hoy date = CAST(@ahora AS date);

  DECLARE @s TABLE (Seq int IDENTITY(1,1) PRIMARY KEY, Nro nvarchar(50) NOT NULL);
  INSERT INTO @s (Nro)
  SELECT DISTINCT LTRIM(RTRIM(j.nroSolicitud))
  FROM OPENJSON(@Items) WITH (nroSolicitud nvarchar(50) '$.nroSolicitud') j
  WHERE LTRIM(RTRIM(ISNULL(j.nroSolicitud, N''))) <> N'';

  IF NOT EXISTS (SELECT 1 FROM @s) THROW 51224, 'No hay solicitudes seleccionadas.', 1;
  IF EXISTS (SELECT 1 FROM @s x WHERE NOT EXISTS (SELECT 1 FROM dbo.DetSolicitud b WHERE b.NroSolicitud = x.Nro AND b.IdDespacho = 1 AND b.IdEstado = 9))
    THROW 51225, 'Hay solicitudes que ya no estan pendientes de aprobacion. Vuelva a consultar.', 1;

  DECLARE @estadoNuevo int = CASE WHEN @Accion = 'APROBAR' THEN 4 ELSE 6 END;

  BEGIN TRY
    BEGIN TRANSACTION;

    -- Filas de destino que se mueven de stock (se capturan antes de cambiar su estado).
    DECLARE @m TABLE (Id int IDENTITY(1,1) PRIMARY KEY, Nro nvarchar(50), CodPap nvarchar(50), Cant decimal(18,4), Pos nvarchar(50),
                      Corr nvarchar(50), Serie nvarchar(100), IdCliente int, IdProyecto int, IdSite nvarchar(50), CorreSite int);
    INSERT INTO @m (Nro, CodPap, Cant, Pos, Corr, Serie, IdCliente, IdProyecto, IdSite, CorreSite)
    SELECT CAST(b.NroSolicitud AS nvarchar(50)), CAST(b.CodPap AS nvarchar(50)), b.CantSap, CAST(b.Posicion AS nvarchar(50)),
           CAST(b.Correlativo AS nvarchar(50)), CAST(b.Serie AS nvarchar(100)), b.IdCliente, b.IdProyecto, CAST(b.IdSite AS nvarchar(50)), b.CorreSite
    FROM dbo.DetSolicitud b
    INNER JOIN @s x ON x.Nro = b.NroSolicitud
    WHERE b.IdDespacho = 1 AND b.IdEstado = 9;

    IF @Accion = 'APROBAR'
    BEGIN
      UPDATE a SET a.IdEstado = 4, a.IdValidador = @IdValidador, a.Observacion = ISNULL(@Observacion, a.Observacion)
      FROM dbo.CabSolicitud a INNER JOIN @s x ON x.Nro = a.NroSolicitud;

      UPDATE b SET b.IdEstado = 4, b.FechaAprobar = @hoy, b.IdRespAprobar = @IdValidador
      FROM dbo.DetSolicitud b INNER JOIN @s x ON x.Nro = b.NroSolicitud
      WHERE b.IdEstado = 9;

      UPDATE mm SET mm.IdEstado = 4, mm.IdSolicitante = @IdValidador
      FROM dbo.MovMaterial mm INNER JOIN @s x ON x.Nro = mm.NroSolicitud
      WHERE mm.IdEstado = 9;

      -- Series asignadas a la solicitud quedan bloqueadas en logistica (88).
      UPDATE l SET l.IdEstado = 88
      FROM dbo.DetLogistica l
      WHERE l.PedidoSap <> '9999999999' AND LEN(ISNULL(l.Serie, '')) > 0
        AND l.Serie IN (SELECT m.Serie FROM @m m WHERE ISNULL(m.Serie, '') NOT IN ('', 'NO APLICA'));

      INSERT INTO dbo.Kardex
        (TipoMovimiento, CantSap, CodPap, CantAnterior, CantRestante, Observaciones, IdCliente, IdProyecto, IdSite, CorreSite,
         IdEmpleadoCj, Fecha, Hora, IdEstado, NroSolicitud, FilaSolicitud, Serie)
      SELECT 3, m.Cant, m.CodPap, 0, 0, 'APROBADO', m.IdCliente, m.IdProyecto, m.IdSite, m.CorreSite,
             @IdEmpleadoCj, @hoy, @ahora, 1, m.Nro, TRY_CONVERT(int, m.Pos), ISNULL(m.Serie, '')
      FROM @m m;
    END
    ELSE
    BEGIN
      UPDATE a SET a.IdEstado = 6, a.Observacion = @Observacion
      FROM dbo.CabSolicitud a INNER JOIN @s x ON x.Nro = a.NroSolicitud;

      UPDATE b SET b.IdEstado = 6, b.FechaObs = @hoy, b.IdRespObs = COALESCE(@IdValidador, @IdEmpleadoCj)
      FROM dbo.DetSolicitud b INNER JOIN @s x ON x.Nro = b.NroSolicitud
      WHERE b.IdEstado = 9;

      UPDATE mm SET mm.IdEstado = 6, mm.IdSolicitante = COALESCE(@IdValidador, @IdEmpleadoCj)
      FROM dbo.MovMaterial mm INNER JOIN @s x ON x.Nro = mm.NroSolicitud
      WHERE mm.IdEstado = 9;

      UPDATE l SET l.IdEstado = 2
      FROM dbo.DetLogistica l
      WHERE l.PedidoSap <> '9999999999' AND LEN(ISNULL(l.Serie, '')) > 0 AND l.IdEstado = 88
        AND l.Serie IN (SELECT m.Serie FROM @m m WHERE ISNULL(m.Serie, '') NOT IN ('', 'NO APLICA'));
    END;

    DECLARE @i int = 1, @max int = (SELECT ISNULL(MAX(Id), 0) FROM @m);
    DECLARE @cod nvarchar(50), @cant decimal(18,4), @nro nvarchar(50), @pos nvarchar(50), @corr nvarchar(50), @clave nvarchar(100);
    DECLARE @origen varchar(20) = 'Aprobado';
    DECLARE @destino varchar(20) = CASE WHEN @Accion = 'APROBAR' THEN 'Despachado' ELSE 'Disponible' END;
    WHILE @i <= @max
    BEGIN
      SELECT @cod = CodPap, @cant = Cant, @nro = Nro, @pos = Pos, @corr = Corr FROM @m WHERE Id = @i;
      SET @clave = CONCAT(@Accion, N':', @nro, N'|', @pos);
      EXEC dbo.sp_Stock_Mover
        @CodPap = @cod, @BucketOrigen = @origen, @BucketDestino = @destino, @Cantidad = @cant,
        @Operacion = @Accion, @NroSolicitud = @nro, @Posicion = @pos, @CorrelativoDet = @corr,
        @IdEstadoDoc = @estadoNuevo, @Usuario = @Usuario, @IdEmpleadoCj = @IdEmpleadoCj, @Observacion = @Observacion,
        @ClaveIdempotencia = @clave;
      SET @i += 1;
    END;

    SET @Procesadas = (SELECT COUNT(*) FROM @s);
    COMMIT TRANSACTION;
  END TRY
  BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
  END CATCH;
END;
GO