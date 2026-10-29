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
   Consulta: lineas en estado 11 con filtros opcionales.
------------------------------------------------------------------------------------------------ */
CREATE OR ALTER PROCEDURE dbo.sp_Logistica_Campo_Consultar
  @Solicitudes  nvarchar(max) = NULL,   -- lista separada por comas
  @FechaIni     date          = NULL,   -- sobre CabSolicitud.FechaCreacion
  @FechaFin     date          = NULL,
  @IdRespCampo  int           = NULL,
  @IdCliente    int           = NULL,
  @IdProyecto   int           = NULL,
  @IdSite       nvarchar(50)  = NULL,
  @CorreSite    int           = NULL
AS
BEGIN
  SET NOCOUNT ON;

  SET @Solicitudes = NULLIF(LTRIM(RTRIM(@Solicitudes)), N'');
  SET @IdSite = NULLIF(LTRIM(RTRIM(@IdSite)), N'');

  SELECT TOP (5000)
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
         b.IdEstado,
         e.ValorIni                               AS NomEstado,
         b.IdCliente, b.IdProyecto,
         CAST(b.IdSite AS nvarchar(50))           AS IdSite,
         b.CorreSite,
         CAST(b.TipoTrabajo AS nvarchar(100))     AS TipoTrabajo,
         s.NombreSite,
         pr.NombreProyecto,
         cl.NombreCliente,
         a.FechaCreacion
  FROM dbo.DetSolicitud b
  INNER JOIN dbo.CabSolicitud a ON a.NroSolicitud = b.NroSolicitud
  LEFT JOIN dbo.Material m      ON CAST(m.CodPap AS nvarchar(50)) = CAST(b.CodPap AS nvarchar(50))
  LEFT JOIN dbo.Constante e     ON e.Campo = 'ESTADO_LOG' AND e.Correlativo = b.IdEstado
  LEFT JOIN dbo.Site s          ON s.IdSite = b.IdSite AND s.Correlativo = b.CorreSite
  LEFT JOIN dbo.Proyecto pr     ON pr.IdProyecto = b.IdProyecto
  LEFT JOIN dbo.Cliente cl      ON cl.IdCliente = b.IdCliente
  WHERE b.IdEstado = 11 AND b.IdDespacho = 1
    AND (@Solicitudes IS NULL OR CAST(b.NroSolicitud AS nvarchar(50)) IN
           (SELECT LTRIM(RTRIM(x.value)) FROM STRING_SPLIT(@Solicitudes, N',') x WHERE LTRIM(RTRIM(x.value)) <> N''))
    AND (@FechaIni IS NULL OR CAST(a.FechaCreacion AS date) >= @FechaIni)
    AND (@FechaFin IS NULL OR CAST(a.FechaCreacion AS date) <= @FechaFin)
    AND (@IdRespCampo IS NULL OR b.IdRespCampo = @IdRespCampo)
    AND (@IdCliente IS NULL OR b.IdCliente = @IdCliente)
    AND (@IdProyecto IS NULL OR b.IdProyecto = @IdProyecto)
    AND (@IdSite IS NULL OR (b.IdSite = @IdSite AND b.CorreSite = ISNULL(@CorreSite, b.CorreSite)))
  ORDER BY b.IdSite, b.CorreSite, b.NroSolicitud, b.CodPap, TRY_CONVERT(int, b.Posicion);
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
    PedidoSap nvarchar(50) NULL);

  DECLARE @j TABLE (Nro nvarchar(50), Pos nvarchar(20), Estado int, Cant decimal(18,4), Obs nvarchar(500));
  INSERT INTO @j (Nro, Pos, Estado, Cant, Obs)
  SELECT LTRIM(RTRIM(j.nroSolicitud)), LTRIM(RTRIM(j.posicion)), j.idEstado, j.cantidad, NULLIF(LTRIM(RTRIM(j.observacion)), N'')
  FROM OPENJSON(@Items) WITH (nroSolicitud nvarchar(50) '$.nroSolicitud', posicion nvarchar(20) '$.posicion',
                              idEstado int '$.idEstado', cantidad decimal(18,4) '$.cantidad', observacion nvarchar(500) '$.observacion') j;

  IF NOT EXISTS (SELECT 1 FROM @j) THROW 51301, 'No hay registros seleccionados.', 1;
  IF EXISTS (SELECT 1 FROM @j WHERE Estado IS NOT NULL AND Estado NOT IN (10, 14))
    THROW 51302, 'Estado no permitido en campo (use 14 u 10).', 1;
  IF EXISTS (SELECT 1 FROM @j x WHERE NOT EXISTS
             (SELECT 1 FROM dbo.DetSolicitud b WHERE CAST(b.NroSolicitud AS nvarchar(50)) = x.Nro
                AND CAST(b.Posicion AS nvarchar(20)) = x.Pos AND b.IdDespacho = 1 AND b.IdEstado = 11))
    THROW 51303, 'Hay registros que ya no estan pendientes de campo. Vuelva a consultar.', 1;

  INSERT INTO @m (Nro, Pos, Corr, CodPap, CantEnv, Conf, Serie, Obs, IdEstadoNuevo, Dif,
                  IdCliente, IdProyecto, IdSite, CorreSite, TipoTrabajo, PedidoSap)
  SELECT x.Nro, x.Pos, CAST(b.Correlativo AS nvarchar(50)), CAST(b.CodPap AS nvarchar(50)),
         b.CantSap, ISNULL(x.Cant, b.CantSap), CAST(b.Serie AS nvarchar(100)), COALESCE(x.Obs, CAST(b.Observacion AS nvarchar(500))),
         CASE WHEN ISNULL(x.Cant, b.CantSap) <> b.CantSap OR x.Estado = 10 THEN 10
              WHEN LEFT(CAST(b.CodPap AS nvarchar(50)), 2) NOT IN (N'10', N'40') THEN 21
              ELSE 14 END,
         b.CantSap - ISNULL(x.Cant, b.CantSap),
         b.IdCliente, b.IdProyecto, CAST(b.IdSite AS nvarchar(50)), b.CorreSite, CAST(b.TipoTrabajo AS nvarchar(100)), CAST(b.PedidoSap AS nvarchar(50))
  FROM @j x
  INNER JOIN dbo.DetSolicitud b ON CAST(b.NroSolicitud AS nvarchar(50)) = x.Nro AND CAST(b.Posicion AS nvarchar(20)) = x.Pos
                               AND b.IdDespacho = 1 AND b.IdEstado = 11;

  IF EXISTS (SELECT 1 FROM @m WHERE Conf < 0 OR Conf > CantEnv OR Conf <> FLOOR(Conf))
    THROW 51304, 'La cantidad conforme debe ser un entero entre 0 y la cantidad enviada.', 1;
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

    -- Cabecera: 11 mientras queden lineas pendientes; si no, 10 si alguna quedo observada; si no, 14.
    UPDATE a
       SET a.IdEstado = CASE
             WHEN EXISTS (SELECT 1 FROM dbo.DetSolicitud d WHERE d.NroSolicitud = a.NroSolicitud AND d.IdDespacho = 1 AND d.IdEstado = 11) THEN 11
             WHEN EXISTS (SELECT 1 FROM dbo.DetSolicitud d WHERE d.NroSolicitud = a.NroSolicitud AND d.IdDespacho = 1 AND d.IdEstado = 10) THEN 10
             ELSE 14 END
    FROM dbo.CabSolicitud a
    WHERE CAST(a.NroSolicitud AS nvarchar(50)) IN (SELECT Nro FROM @m);

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

      IF @conf > 0
      BEGIN
        SET @clave = CONCAT(N'CAMPO:', @nro, N'|', @pos);
        EXEC dbo.sp_Stock_Mover
          @CodPap = @cod, @BucketOrigen = 'Campo', @BucketDestino = 'Cruce', @Cantidad = @conf,
          @Operacion = 'CAMPO', @NroSolicitud = @nro, @Posicion = @pos, @CorrelativoDet = @corr,
          @IdEstadoDoc = @estado, @Usuario = @Usuario, @IdEmpleadoCj = @IdEmpleadoCj, @Observacion = @obs,
          @ClaveIdempotencia = @clave;
      END;

      IF @dif > 0
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
