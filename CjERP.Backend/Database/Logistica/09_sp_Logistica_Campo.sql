/*
  Logistica de equipos - X CAMPO (conformidad en campo, pestana x Campo del FrmLogistic_v1).
  PV: NO ejecutado ni probado contra la BD. Tablas/columnas tomadas del sistema antiguo (DXAsignacion):
  CabSolicitud, DetSolicitud (FechaCampo, IdRespCampo, CantCampo, RutaImagen, ImagenEnvio), MovMaterial, Kardex, Material,
  Cliente, Proyecto, Site, Constante. Requiere 01-05 (sp_Stock_Mover) y 08 (CabSolicitud/DetSolicitud ya con datos).

  Reglas del sistema antiguo que se conservan
   - Solo lineas de destino (IdDespacho = 1) en estado 11 (enviadas).
   - Estado destino 14 (x cruzar). Si la cantidad conforme es menor a la enviada o se elige 10, la linea queda en 10 (observada)
     y exige observacion. Materiales que no son cod. 10/40 (Aplica = 0) saltan a 21 (x cerrar).
   - La cantidad conforme reemplaza CantSap y se guarda en CantCampo.
   - Cabecera: 14 cuando todas las lineas salieron de 11, 10 si alguna quedo observada, 11 mientras queden pendientes.

  Diferencias deliberadas (informadas al usuario)
   - Una transaccion por operacion; consultas parametrizadas.
   - Stock con sp_Stock_Mover segun LogisticaEtapaConfig: conforme Campo -> Cruce; la diferencia Campo -> Observada
     (el VB la mandaba a Cruce y luego la devolvia desde Observadas).
   - El VB actualizaba la cabecera fila por fila (ganaba la ultima); aqui se calcula una vez por solicitud.
*/
SET NOCOUNT ON;
GO

/* ------------------------------------------------------------------------------------------------
   Consulta: lineas en estado 11 (o @IdEstado: Observadas usa 10; -1 = todos los estados, para el Reporte) con filtros opcionales.
------------------------------------------------------------------------------------------------ */
CREATE OR ALTER PROCEDURE dbo.sp_Logistica_Campo_Consultar
  @Solicitudes  nvarchar(max) = NULL,   -- lista separada por comas
  @FechaIni     date          = NULL,   -- sobre CabSolicitud.FechaCreacion
  @FechaFin     date          = NULL,
  @IdRespCampo  int           = NULL,
  @IdCliente    int           = NULL,
  @IdProyecto   int           = NULL,
  @IdSite       nvarchar(50)  = NULL,
  @CorreSite    int           = NULL,
  @IdEstado     int           = NULL,   -- NULL = 11 (pendientes de campo); 10 = observadas; -1 = todos los estados (Reporte)
  @Estados      nvarchar(100) = NULL,   -- lista de estados separada por comas (p. ej. '14' x cruzar, '21,7,22,23,24,25' x cerrar, '16,22,23,25' x foliar); tiene prioridad sobre @IdEstado
  @PorSolicitud bit           = 0,      -- 1 = como el sistema antiguo: trae TODAS las lineas (cualquier estado) de las solicitudes que tengan al menos una linea en @Estados
  @SoloEquipos  bit           = 0       -- 1 = solo materiales cuyo CodPap empieza con 10 o 40 (x foliar)
AS
BEGIN
  SET NOCOUNT ON;

  SET @Solicitudes = NULLIF(LTRIM(RTRIM(@Solicitudes)), N'');
  SET @IdSite = NULLIF(LTRIM(RTRIM(@IdSite)), N'');
  SET @Estados = NULLIF(LTRIM(RTRIM(@Estados)), N'');

  -- Optimizado: las listas se arman una sola vez (antes STRING_SPLIT se evaluaba por fila), las solicitudes del modo
  -- @PorSolicitud se calculan una sola vez (antes era un EXISTS por fila), la fecha de la cabecera se resuelve por solicitud
  -- (antes un OUTER APPLY por fila) y los catalogos se unen solo a las lineas ya filtradas.
  DECLARE @est TABLE (Id int PRIMARY KEY);
  IF @Estados IS NOT NULL
    INSERT INTO @est (Id)
    SELECT DISTINCT TRY_CONVERT(int, LTRIM(RTRIM(x.value))) FROM STRING_SPLIT(@Estados, N',') x
    WHERE TRY_CONVERT(int, LTRIM(RTRIM(x.value))) IS NOT NULL;

  DECLARE @sol TABLE (Nro nvarchar(50) PRIMARY KEY);
  IF @Solicitudes IS NOT NULL
    INSERT INTO @sol (Nro)
    SELECT DISTINCT LTRIM(RTRIM(x.value)) FROM STRING_SPLIT(@Solicitudes, N',') x WHERE LTRIM(RTRIM(x.value)) <> N'';

  IF OBJECT_ID(N'tempdb..#solEstado') IS NOT NULL DROP TABLE #solEstado;
  IF OBJECT_ID(N'tempdb..#det') IS NOT NULL DROP TABLE #det;
  IF OBJECT_ID(N'tempdb..#cab') IS NOT NULL DROP TABLE #cab;
  IF OBJECT_ID(N'tempdb..#estLog') IS NOT NULL DROP TABLE #estLog;

  -- Solicitudes con al menos una linea en @Estados (solo en modo @PorSolicitud); la tabla se crea siempre para fijar el tipo.
  SELECT d.NroSolicitud INTO #solEstado FROM dbo.DetSolicitud d WHERE 1 = 0;
  IF @Estados IS NOT NULL AND @PorSolicitud = 1
    INSERT INTO #solEstado (NroSolicitud)
    SELECT DISTINCT d.NroSolicitud FROM dbo.DetSolicitud d
    WHERE d.IdDespacho = 1 AND d.IdEstado IN (SELECT Id FROM @est);
  CREATE CLUSTERED INDEX IX_solEstado ON #solEstado (NroSolicitud);

  -- Lineas que cumplen todos los filtros salvo la fecha (que sale de la cabecera).
  SELECT b.NroSolicitud, b.PedidoSap, b.Correlativo, b.Posicion, b.CodPap, b.CantSap, b.Serie, b.Observacion, b.RutaImagen,
         b.ImagenEnvio, b.NroGuia, b.MontoEnvio, b.IdEstado, b.IdCliente, b.IdProyecto, b.IdSite, b.CorreSite, b.TipoTrabajo
  INTO #det
  FROM dbo.DetSolicitud b
  WHERE b.IdDespacho = 1
    AND ((@Estados IS NOT NULL AND @PorSolicitud = 0 AND b.IdEstado IN (SELECT Id FROM @est))
         OR (@Estados IS NOT NULL AND @PorSolicitud = 1 AND b.NroSolicitud IN (SELECT NroSolicitud FROM #solEstado))
         OR (@Estados IS NULL AND (@IdEstado = -1 OR b.IdEstado = ISNULL(@IdEstado, 11))))
    AND (@SoloEquipos = 0 OR LEFT(CAST(b.CodPap AS nvarchar(50)), 2) IN (N'10', N'40'))
    AND (@Solicitudes IS NULL OR CAST(b.NroSolicitud AS nvarchar(50)) IN (SELECT Nro FROM @sol))
    AND (@IdRespCampo IS NULL OR b.IdRespCampo = @IdRespCampo)
    AND (@IdCliente IS NULL OR b.IdCliente = @IdCliente)
    AND (@IdProyecto IS NULL OR b.IdProyecto = @IdProyecto)
    AND (@IdSite IS NULL OR (b.IdSite = @IdSite AND b.CorreSite = ISNULL(@CorreSite, b.CorreSite)))
  OPTION (RECOMPILE);

  -- CabSolicitud puede tener 2+ filas por solicitud (destino IdMovimiento = 1 y origen = 2): una sola por solicitud, preferiendo el destino.
  SELECT c.NroSolicitud,
         COALESCE(MAX(CASE WHEN c.IdMovimiento = 1 THEN c.FechaCreacion END), MAX(c.FechaCreacion)) AS FechaCreacion
  INTO #cab
  FROM dbo.CabSolicitud c
  WHERE c.NroSolicitud IN (SELECT DISTINCT NroSolicitud FROM #det)
  GROUP BY c.NroSolicitud;
  CREATE CLUSTERED INDEX IX_cab ON #cab (NroSolicitud);

  -- Nombre de cada estado (Constante ESTADO_LOG) leido UNA vez: unir Constante directo a cada fila repetia la busqueda
  -- por fila (5120 escaneos y un worktable de 58140 en la medicion del 25/11/2026: 27 s para ~5000 filas).
  SELECT TRY_CONVERT(int, c.Correlativo) AS IdEstado, MAX(c.ValorFin) AS Nombre
  INTO #estLog
  FROM dbo.Constante c
  WHERE c.Campo = 'ESTADO_LOG' AND TRY_CONVERT(int, c.Correlativo) IS NOT NULL
  GROUP BY TRY_CONVERT(int, c.Correlativo);
  CREATE CLUSTERED INDEX IX_estLog ON #estLog (IdEstado);

  -- Sin el tope de 5000 de antes: en modo @PorSolicitud hay mas lineas y se truncaria silenciosamente (el sistema antiguo no tiene tope).
  SELECT TOP (50000)
         CAST(b.NroSolicitud AS nvarchar(50))     AS NroSolicitud,
         CAST(b.PedidoSap AS nvarchar(50))        AS PedidoSap,
         CAST(b.Correlativo AS nvarchar(50))      AS Correlativo,
         CAST(b.Posicion AS nvarchar(20))         AS Posicion,
         CAST(b.CodPap AS nvarchar(50))           AS CodPap,
         m.NombreMaterial,
         m.UnidadMedida,
         CAST(b.CantSap AS decimal(18,4))         AS CantSap,
         CAST(b.Serie AS nvarchar(100))           AS Serie,
         CAST(b.Observacion AS nvarchar(500))     AS Observacion,
         CAST(b.RutaImagen AS nvarchar(500))      AS RutaImagen,
         CAST(b.ImagenEnvio AS nvarchar(500))     AS ImagenEnvio,
         b.NroGuia                                AS NroGuia,   -- numero de guia
         CAST(b.MontoEnvio AS numeric(18,2))      AS MontoEnvio,   -- monto de envio (DetSolicitud.MontoEnvio)
         b.IdEstado,
         e.Nombre                                 AS NomEstado,   -- nombre visible del estado = Constante ESTADO_LOG.ValorFin
         b.IdCliente, b.IdProyecto,
         CAST(b.IdSite AS nvarchar(50))           AS IdSite,
         b.CorreSite,
         CAST(b.TipoTrabajo AS nvarchar(100))     AS TipoTrabajo,
         s.NombreSite,
         pr.NombreProyecto,
         cl.NombreCliente,
         a.FechaCreacion
  FROM #det b
  LEFT JOIN #cab a              ON a.NroSolicitud = b.NroSolicitud
  LEFT JOIN dbo.Material m      ON CAST(m.CodPap AS nvarchar(50)) = CAST(b.CodPap AS nvarchar(50))
  LEFT JOIN #estLog e           ON e.IdEstado = b.IdEstado
  LEFT JOIN dbo.Site s          ON s.IdSite = b.IdSite AND s.Correlativo = b.CorreSite
  LEFT JOIN dbo.Proyecto pr     ON pr.IdProyecto = b.IdProyecto
  LEFT JOIN dbo.Cliente cl      ON cl.IdCliente = b.IdCliente
  WHERE (@FechaIni IS NULL OR CAST(a.FechaCreacion AS date) >= @FechaIni)
    AND (@FechaFin IS NULL OR CAST(a.FechaCreacion AS date) <= @FechaFin)
  ORDER BY b.IdSite, b.CorreSite, b.NroSolicitud, b.CodPap, TRY_CONVERT(int, b.Posicion)
  OPTION (RECOMPILE);
END;
GO

/* ------------------------------------------------------------------------------------------------
   Grabar la conformidad de campo.
   Items = [{"nroSolicitud":"123","posicion":"0","correlativo":"...","idEstado":14,"cantidad":2,"observacion":"..."}]
   idEstado opcional (14 por defecto; permitido 14 o 10). cantidad = cantidad conforme (0..CantSap).
------------------------------------------------------------------------------------------------ */
CREATE OR ALTER PROCEDURE dbo.sp_Logistica_Campo_Grabar
  @Items         nvarchar(max),
  @Usuario       nvarchar(50),
  @IdEmpleadoCj  int = NULL,
  @IdResponsable int = NULL,
  @RespetarEstado bit = 0,   -- 1 = edicion directa de la grilla: se graba el estado elegido (10, 14 o 19) sin la regla Aplica=0 -> 21
  @Procesadas    int OUTPUT,
  @ConDiferencia int OUTPUT
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  IF OBJECT_ID(N'dbo.sp_Stock_Mover', N'P') IS NULL
    THROW 51300, 'Falta dbo.sp_Stock_Mover (ejecute los scripts de stock 01 a 05).', 1;

  DECLARE @ahora datetime = CONVERT(datetime, SYSDATETIMEOFFSET() AT TIME ZONE 'SA Pacific Standard Time');
  DECLARE @hoy date = CAST(@ahora AS date);

  DECLARE @m TABLE (
    Id int IDENTITY(1,1) PRIMARY KEY,
    Nro nvarchar(50) NOT NULL, Pos nvarchar(20) NOT NULL, Corr nvarchar(50) NOT NULL, CodPap nvarchar(50) NOT NULL,
    CantEnv decimal(18,4) NOT NULL, Conf decimal(18,4) NOT NULL, Serie nvarchar(100) NULL, Obs nvarchar(500) NULL,
    IdEstadoNuevo int NOT NULL, Dif decimal(18,4) NOT NULL,
    IdCliente int NULL, IdProyecto int NULL, IdSite nvarchar(50) NULL, CorreSite int NULL, TipoTrabajo nvarchar(100) NULL,
    PedidoSap nvarchar(50) NULL, ObsAnt nvarchar(500) NULL);

  -- Auditoria de los UPDATE (no de los INSERT) en dbo.AuditoriaCambios, via dbo.sp_Logistica_Auditar (script 24).
  IF OBJECT_ID(N'dbo.sp_Logistica_Auditar', N'P') IS NULL
    THROW 51340, 'Falta dbo.sp_Logistica_Auditar (ejecute el script 24).', 1;
  CREATE TABLE #Aud (Entidad nvarchar(100), IdRegistro nvarchar(100), Seccion nvarchar(100) NULL, Campo nvarchar(100),
                     ValorAnterior nvarchar(max) NULL, ValorNuevo nvarchar(max) NULL);

  DECLARE @j TABLE (Nro nvarchar(50), Pos nvarchar(20), Estado int, Cant decimal(18,4), Obs nvarchar(500));
  INSERT INTO @j (Nro, Pos, Estado, Cant, Obs)
  SELECT LTRIM(RTRIM(j.nroSolicitud)), LTRIM(RTRIM(j.posicion)), j.idEstado, j.cantidad, NULLIF(LTRIM(RTRIM(j.observacion)), N'')
  FROM OPENJSON(@Items) WITH (nroSolicitud nvarchar(50) '$.nroSolicitud', posicion nvarchar(20) '$.posicion',
                              idEstado int '$.idEstado', cantidad decimal(18,4) '$.cantidad', observacion nvarchar(500) '$.observacion') j;

  IF NOT EXISTS (SELECT 1 FROM @j) THROW 51301, 'No hay registros seleccionados.', 1;
  IF EXISTS (SELECT 1 FROM @j WHERE Estado IS NOT NULL AND Estado NOT IN (10, 14)
             AND NOT (@RespetarEstado = 1 AND Estado = 19))
    THROW 51302, 'Estado no permitido en campo (use 14, 10 o 19).', 1;
  IF EXISTS (SELECT 1 FROM @j x WHERE NOT EXISTS
             (SELECT 1 FROM dbo.DetSolicitud b WHERE CAST(b.NroSolicitud AS nvarchar(50)) = x.Nro
                AND CAST(b.Posicion AS nvarchar(20)) = x.Pos AND b.IdDespacho = 1 AND b.IdEstado = 11))
    THROW 51303, 'Hay registros que ya no estan pendientes de campo. Vuelva a consultar.', 1;

  INSERT INTO @m (Nro, Pos, Corr, CodPap, CantEnv, Conf, Serie, Obs, IdEstadoNuevo, Dif,
                  IdCliente, IdProyecto, IdSite, CorreSite, TipoTrabajo, PedidoSap, ObsAnt)
  SELECT x.Nro, x.Pos, CAST(b.Correlativo AS nvarchar(50)), CAST(b.CodPap AS nvarchar(50)),
         b.CantSap, ISNULL(x.Cant, b.CantSap), CAST(b.Serie AS nvarchar(100)), COALESCE(x.Obs, CAST(b.Observacion AS nvarchar(500))),
         CASE WHEN @RespetarEstado = 1 AND x.Estado IS NOT NULL THEN x.Estado
              WHEN ISNULL(x.Cant, b.CantSap) <> b.CantSap OR x.Estado = 10 THEN 10
              WHEN LEFT(CAST(b.CodPap AS nvarchar(50)), 2) NOT IN (N'10', N'40') THEN 21
              ELSE 14 END,
         b.CantSap - ISNULL(x.Cant, b.CantSap),
         b.IdCliente, b.IdProyecto, CAST(b.IdSite AS nvarchar(50)), b.CorreSite, CAST(b.TipoTrabajo AS nvarchar(100)), CAST(b.PedidoSap AS nvarchar(50)),
         CAST(b.Observacion AS nvarchar(500))
  FROM @j x
  INNER JOIN dbo.DetSolicitud b ON CAST(b.NroSolicitud AS nvarchar(50)) = x.Nro AND CAST(b.Posicion AS nvarchar(20)) = x.Pos
                               AND b.IdDespacho = 1 AND b.IdEstado = 11;

  IF EXISTS (SELECT 1 FROM @m WHERE Conf < 0 OR Conf > CantEnv)
    THROW 51304, 'La cantidad conforme debe estar entre 0 y la cantidad real (admite decimales).', 1;
  IF EXISTS (SELECT 1 FROM @m WHERE IdEstadoNuevo = 10 AND Obs IS NULL)
    THROW 51305, 'Hay registros observados (estado 10 o cantidad distinta) sin observacion.', 1;

  BEGIN TRY
    BEGIN TRANSACTION;

    UPDATE b
       SET b.IdEstado = m.IdEstadoNuevo, b.FechaCampo = @hoy, b.IdRespCampo = @IdResponsable,
           b.CantCampo = m.Conf, b.CantSap = m.Conf, b.Observacion = COALESCE(m.Obs, b.Observacion)
    FROM dbo.DetSolicitud b
    INNER JOIN @m m ON CAST(b.NroSolicitud AS nvarchar(50)) = m.Nro AND CAST(b.Posicion AS nvarchar(20)) = m.Pos
                   AND b.IdDespacho = 1 AND b.IdEstado = 11;

    -- Auditoria: lo que cambio cada linea (estado 11 -> nuevo, cantidad real -> conforme, observacion).
    INSERT INTO #Aud (Entidad, IdRegistro, Seccion, Campo, ValorAnterior, ValorNuevo)
    SELECT N'DetSolicitud', CONCAT(m.Nro, N'-', m.Pos), N'CAMPO', v.Campo, v.Ant, v.Nue
    FROM @m m
    CROSS APPLY (VALUES (N'IdEstado', CONVERT(nvarchar(50), 11), CONVERT(nvarchar(50), m.IdEstadoNuevo)),
                        (N'CantSap', CONVERT(nvarchar(50), m.CantEnv), CONVERT(nvarchar(50), m.Conf)),
                        (N'Observacion', m.ObsAnt, COALESCE(m.Obs, m.ObsAnt))) v (Campo, Ant, Nue);

    -- Cabecera: 11 mientras queden lineas pendientes; si no, 10 si alguna quedo observada; si no, 14.
    UPDATE a
       SET a.IdEstado = CASE
             WHEN EXISTS (SELECT 1 FROM dbo.DetSolicitud d WHERE d.NroSolicitud = a.NroSolicitud AND d.IdDespacho = 1 AND d.IdEstado = 11) THEN 11
             WHEN EXISTS (SELECT 1 FROM dbo.DetSolicitud d WHERE d.NroSolicitud = a.NroSolicitud AND d.IdDespacho = 1 AND d.IdEstado = 10) THEN 10
             ELSE 14 END
    OUTPUT N'CabSolicitud', CONVERT(nvarchar(100), inserted.NroSolicitud), N'CAMPO', N'IdEstado',
           CONVERT(nvarchar(50), deleted.IdEstado), CONVERT(nvarchar(50), inserted.IdEstado)
      INTO #Aud (Entidad, IdRegistro, Seccion, Campo, ValorAnterior, ValorNuevo)
    FROM dbo.CabSolicitud a
    WHERE CAST(a.NroSolicitud AS nvarchar(50)) IN (SELECT Nro FROM @m);

    EXEC dbo.sp_Logistica_Auditar @Usuario = @Usuario;

    INSERT INTO dbo.MovMaterial
      (PedidoSap, Correlativo, Posicion, IdEstado, Usuario, Fecha, Hora, Observacion, CodPap, CantSap, NroSolicitud, IdMovimiento,
       IdCliente, IdProyecto, IdSite, CorreSite, TipoTrabajo, IdSolicitante)
    SELECT ISNULL(m.PedidoSap, ''), m.Corr, m.Pos, m.IdEstadoNuevo, @Usuario, @hoy, @ahora, ISNULL(m.Obs, ''), m.CodPap, m.Conf, m.Nro, 1,
           m.IdCliente, m.IdProyecto, m.IdSite, m.CorreSite, m.TipoTrabajo, @IdResponsable
    FROM @m m;

    INSERT INTO dbo.MovMaterial
      (PedidoSap, Correlativo, Posicion, IdEstado, Usuario, Fecha, Hora, Observacion, CodPap, CantSap, NroSolicitud, IdMovimiento,
       IdCliente, IdProyecto, IdSite, CorreSite, TipoTrabajo, IdSolicitante)
    SELECT ISNULL(m.PedidoSap, ''), m.Corr, m.Pos, m.IdEstadoNuevo, @Usuario, @hoy, @ahora, ISNULL(m.Obs, ''), m.CodPap, m.Dif, m.Nro, 3,
           m.IdCliente, m.IdProyecto, m.IdSite, m.CorreSite, m.TipoTrabajo, @IdResponsable
    FROM @m m WHERE m.Dif > 0;

    INSERT INTO dbo.Kardex
      (TipoMovimiento, CantSap, CodPap, CantAnterior, CantRestante, Observaciones, IdCliente, IdProyecto, IdSite, CorreSite,
       IdEmpleadoCj, Fecha, Hora, IdEstado, NroSolicitud, FilaSolicitud, Serie)
    SELECT 3, m.Conf, m.CodPap, 0, 0, 'CAMPO', m.IdCliente, m.IdProyecto, m.IdSite, m.CorreSite,
           @IdEmpleadoCj, @hoy, @ahora, 11, m.Nro, TRY_CONVERT(int, m.Pos), ISNULL(m.Serie, '')
    FROM @m m WHERE m.Conf > 0;

    INSERT INTO dbo.Kardex
      (TipoMovimiento, CantSap, CodPap, CantAnterior, CantRestante, Observaciones, IdCliente, IdProyecto, IdSite, CorreSite,
       IdEmpleadoCj, Fecha, Hora, IdEstado, NroSolicitud, FilaSolicitud, Serie)
    SELECT 3, m.Dif, m.CodPap, 0, 0, 'DEV-CAMPO', m.IdCliente, m.IdProyecto, m.IdSite, m.CorreSite,
           @IdEmpleadoCj, @hoy, @ahora, 11, m.Nro, TRY_CONVERT(int, m.Pos), ISNULL(m.Serie, '')
    FROM @m m WHERE m.Dif > 0;

    -- Stock: conforme Campo -> Cruce; diferencia Campo -> Observada. Falla si no alcanza (51001).
    DECLARE @i int = 1, @max int = (SELECT MAX(Id) FROM @m);
    DECLARE @cod nvarchar(50), @conf decimal(18,4), @dif decimal(18,4), @nro nvarchar(50), @pos nvarchar(20),
            @corr nvarchar(50), @estado int, @obs nvarchar(500), @clave nvarchar(100);
    WHILE @i <= @max
    BEGIN
      SELECT @cod = CodPap, @conf = Conf, @dif = Dif, @nro = Nro, @pos = Pos, @corr = Corr, @estado = IdEstadoNuevo, @obs = Obs
      FROM @m WHERE Id = @i;

      -- Estado 19 (retorno a almacen) elegido a mano: solo cambia el estado, no mueve stock (PV: definir bucket).
      IF @conf > 0 AND @estado <> 19
      BEGIN
        SET @clave = CONCAT(N'CAMPO:', @nro, N'|', @pos);
        EXEC dbo.sp_Stock_Mover
          @CodPap = @cod, @BucketOrigen = 'Campo', @BucketDestino = 'Cruce', @Cantidad = @conf,
          @Operacion = 'CAMPO', @NroSolicitud = @nro, @Posicion = @pos, @CorrelativoDet = @corr,
          @IdEstadoDoc = @estado, @Usuario = @Usuario, @IdEmpleadoCj = @IdEmpleadoCj, @Observacion = @obs,
          @ClaveIdempotencia = @clave;
      END;

      IF @dif > 0 AND @estado <> 19
      BEGIN
        SET @clave = CONCAT(N'CAMPO_DIF:', @nro, N'|', @pos);
        EXEC dbo.sp_Stock_Mover
          @CodPap = @cod, @BucketOrigen = 'Campo', @BucketDestino = 'Observada', @Cantidad = @dif,
          @Operacion = 'CAMPO_DIF', @NroSolicitud = @nro, @Posicion = @pos, @CorrelativoDet = @corr,
          @IdEstadoDoc = @estado, @Usuario = @Usuario, @IdEmpleadoCj = @IdEmpleadoCj, @Observacion = @obs,
          @ClaveIdempotencia = @clave;
      END;

      SET @i += 1;
    END;

    SET @Procesadas = (SELECT COUNT(*) FROM @m);
    SET @ConDiferencia = (SELECT COUNT(*) FROM @m WHERE IdEstadoNuevo = 10);
    COMMIT TRANSACTION;
  END TRY
  BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
  END CATCH;
END;
GO
