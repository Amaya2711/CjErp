/*
  Logistica de equipos - INGRESO (pestanas Pedido, x Recepcionar, Series y x Validar del FrmLogistic_v1).
  PV: NO ejecutado ni probado contra la BD. Nombres de tablas/columnas tomados del sistema antiguo (DXAsignacion);
  validar en BD antes de desplegar: CabLogistica, DetLogistica, CargaLogistica, MovMaterial, Kardex_material, KARDEX,
  MaterialSerie, logCabLogistica, logDetLogistica, Material, Cliente, Proyecto, Site, Importar, Constante.
  Requiere 01-05 (sp_Stock_Mover) solo para sp_Logistica_Pedido_Importar.

  Diferencias deliberadas frente al sistema antiguo (informadas al usuario):
   - Todo ocurre en UNA transaccion por operacion (el VB grababa fila a fila sin transaccion).
   - Consultas parametrizadas (el VB concatenaba SQL).
   - Recepcionar/Validar solo actuan sobre lineas que siguen en el estado esperado (evita doble envio).
   - Importar pedido es idempotente por (PedidoSap, CodPap, Posicion, Site): las lineas ya cargadas se omiten
     (el VB las volvia a insertar duplicadas).
   - Asignacion masiva de series: las lineas cod. 40 sin serie pasan a "no recepcionado" (8) solo si estaban
     en estado 0 (el VB tambien retrocedia las ya recepcionadas/validadas).
   - El comentario de la linea se reemplaza con el texto editado (el VB lo concatenaba y lo duplicaba).
   - Regla de stock sin cambios: al importar el pedido el stock entra a Disponible (ver LogisticaStock en memoria).
*/
SET NOCOUNT ON;
GO

/* ------------------------------------------------------------------------------------------------
   Catalogos de la pantalla (Constante): ubicacion, zona de almacen y estados de linea.
------------------------------------------------------------------------------------------------ */
CREATE OR ALTER PROCEDURE dbo.sp_Logistica_Ingreso_Catalogos
AS
BEGIN
  SET NOCOUNT ON;

  SELECT c.Campo AS Tipo, CAST(c.Correlativo AS int) AS Correlativo, c.ValorIni AS Nombre
  FROM dbo.Constante c
  WHERE c.Campo IN ('UBICACION', 'UBI_ALMACEN', 'ESTADO_LOG')
  ORDER BY c.Campo, c.Correlativo;
END;
GO

/* ------------------------------------------------------------------------------------------------
   Consulta de lineas por etapa: PEDIDO (resultado de la carga), RECEPCION (estado 0), VALIDACION (estado 1)
   y SERIE (estado <> 99, exige al menos un filtro).
------------------------------------------------------------------------------------------------ */
CREATE OR ALTER PROCEDURE dbo.sp_Logistica_Ingreso_Consultar
  @Etapa         varchar(12),
  @Pedidos       nvarchar(max) = NULL,   -- lista separada por comas
  @Solicitudes   nvarchar(max) = NULL,   -- lista separada por comas
  @FechaIni      date          = NULL,   -- sobre DetLogistica.FecIngreso (fecha de guia)
  @FechaFin      date          = NULL,
  @IdUbicacion   int           = NULL
AS
BEGIN
  SET NOCOUNT ON;

  IF @Etapa NOT IN ('PEDIDO', 'RECEPCION', 'VALIDACION', 'SERIE')
    THROW 51100, 'Etapa no valida.', 1;

  SET @Pedidos = NULLIF(LTRIM(RTRIM(@Pedidos)), N'');
  SET @Solicitudes = NULLIF(LTRIM(RTRIM(@Solicitudes)), N'');

  DECLARE @hayFiltro bit = CASE WHEN @Pedidos IS NOT NULL OR @Solicitudes IS NOT NULL
                                  OR @FechaIni IS NOT NULL OR @FechaFin IS NOT NULL OR @IdUbicacion IS NOT NULL
                                THEN 1 ELSE 0 END;

  IF @Etapa IN ('PEDIDO', 'SERIE') AND @hayFiltro = 0
    THROW 51101, 'Indique al menos un filtro: pedido, solicitud o fecha.', 1;

  SELECT TOP (10000)
         a.PedidoSap,
         CAST(a.IdSolicitud AS nvarchar(100))                 AS IdSolicitud,
         CAST(a.Region AS nvarchar(100))                      AS Region,
         CAST(b.Guia AS nvarchar(100))                        AS Guia,
         b.FecIngreso,
         a.FechaCreacion,
         b.IdSite,
         b.CorreSite,
         b.TipoTrabajo,
         CAST(b.Observacion AS nvarchar(500))                 AS Observacion,
         CAST(b.Posicion AS nvarchar(50))                     AS Posicion,
         CAST(b.Serie AS nvarchar(100))                       AS Serie,
         CAST(b.CodPap AS nvarchar(50))                       AS CodPap,
         CAST(b.Centro AS nvarchar(50))                       AS Centro,
         CAST(b.Almacen AS nvarchar(50))                      AS Almacen,
         CAST(b.Lote AS nvarchar(50))                         AS Lote,
         CONVERT(varchar(36), b.Correlativo)                 AS Correlativo,
         b.IdEstado,
         b.IdCliente,
         b.IdProyecto,
         CAST(b.Comentario AS nvarchar(500))                  AS Comentario,
         c.NombreMaterial,
         c.UnidadMedida,
         d.NombreCliente,
         e.NombreProyecto,
         f.NombreSite,
         g.ValorIni                                           AS NomEstado,
         CAST(COALESCE(b.CantSap, 0) AS decimal(18,4))        AS CantSap,
         b.IdUbicacion,
         b.Fecha
  FROM dbo.CabLogistica a
  INNER JOIN dbo.DetLogistica b ON b.PedidoSap = a.PedidoSap AND b.IdSite = a.IdSite
  LEFT JOIN dbo.Material  c ON c.CodPap = b.CodPap
  LEFT JOIN dbo.Cliente   d ON d.IdCliente = b.IdCliente
  LEFT JOIN dbo.Proyecto  e ON e.IdProyecto = b.IdProyecto
  LEFT JOIN dbo.Site      f ON f.IdSite = b.IdSite AND f.Correlativo = b.CorreSite
  LEFT JOIN dbo.Constante g ON g.Campo = 'ESTADO_LOG' AND g.Correlativo = b.IdEstado
  WHERE (@Etapa NOT IN ('RECEPCION', 'VALIDACION') OR a.CorreSite = b.CorreSite)
    AND (@Etapa <> 'RECEPCION' OR (b.IdEstado = 0
         AND (@hayFiltro = 0 OR (b.IdCliente > 0 AND b.IdProyecto > 0 AND b.IdSite <> ''))))
    AND (@Etapa <> 'VALIDACION' OR b.IdEstado = 1)
    AND (@Etapa <> 'SERIE' OR b.IdEstado <> 99)
    AND (@Pedidos IS NULL OR a.PedidoSap IN
           (SELECT LTRIM(RTRIM(s.value)) FROM STRING_SPLIT(@Pedidos, N',') s WHERE LTRIM(RTRIM(s.value)) <> N''))
    AND (@Solicitudes IS NULL OR a.IdSolicitud IN
           (SELECT LTRIM(RTRIM(s.value)) FROM STRING_SPLIT(@Solicitudes, N',') s WHERE LTRIM(RTRIM(s.value)) <> N''))
    AND (@FechaIni IS NULL OR CAST(b.FecIngreso AS date) >= @FechaIni)
    AND (@FechaFin IS NULL OR CAST(b.FecIngreso AS date) <= @FechaFin)
    AND (@IdUbicacion IS NULL OR b.IdUbicacion = @IdUbicacion)
  ORDER BY a.PedidoSap, b.CodPap, b.Posicion;
END;
GO

/* ------------------------------------------------------------------------------------------------
   x Recepcionar: lineas en estado 0 pasan a 1 (recepcionado) o 4/6/8. Items = [{"correlativo":"guid","idEstado":1}]
------------------------------------------------------------------------------------------------ */
CREATE OR ALTER PROCEDURE dbo.sp_Logistica_Ingreso_Recepcionar
  @Items        nvarchar(max),
  @Usuario      nvarchar(50),
  @Actualizadas int OUTPUT,
  @PedidosCompletos int OUTPUT
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  DECLARE @ahora datetime = CONVERT(datetime, SYSDATETIMEOFFSET() AT TIME ZONE 'SA Pacific Standard Time');
  DECLARE @hoy date = CAST(@ahora AS date);

  DECLARE @t TABLE (Correlativo uniqueidentifier NOT NULL PRIMARY KEY, IdEstado int NOT NULL);
  INSERT INTO @t (Correlativo, IdEstado)
  SELECT TRY_CONVERT(uniqueidentifier, j.correlativo), ISNULL(j.idEstado, 1)
  FROM OPENJSON(@Items) WITH (correlativo nvarchar(40) '$.correlativo', idEstado int '$.idEstado') j
  WHERE TRY_CONVERT(uniqueidentifier, j.correlativo) IS NOT NULL;

  IF NOT EXISTS (SELECT 1 FROM @t) THROW 51110, 'No hay registros para recepcionar.', 1;
  IF EXISTS (SELECT 1 FROM @t WHERE IdEstado NOT IN (1, 4, 6, 8))
    THROW 51111, 'Estado no permitido en recepcion (use 1, 4, 6 u 8).', 1;
  IF EXISTS (SELECT 1 FROM @t x WHERE NOT EXISTS (SELECT 1 FROM dbo.DetLogistica d WHERE d.Correlativo = x.Correlativo AND d.IdEstado = 0))
    THROW 51112, 'Hay registros que ya no estan pendientes de recepcion. Vuelva a consultar.', 1;

  BEGIN TRY
    BEGIN TRANSACTION;

    UPDATE d
       SET d.IdEstado = x.IdEstado, d.FechaRecepcion = @hoy
    FROM dbo.DetLogistica d
    INNER JOIN @t x ON x.Correlativo = d.Correlativo;
    SET @Actualizadas = @@ROWCOUNT;

    INSERT INTO dbo.MovMaterial
      (PedidoSap, Correlativo, Posicion, IdEstado, Usuario, Fecha, Hora, Observacion, CodPap, CantSap, IdMovimiento,
       IdCliente, IdProyecto, IdSite, CorreSite, TipoTrabajo)
    SELECT d.PedidoSap, CONVERT(varchar(36), d.Correlativo), '0', x.IdEstado, @Usuario, @hoy, @ahora,
           ISNULL(NULLIF(d.Observacion, ''), '0'), d.CodPap, CASE WHEN ISNULL(d.CantSap, 0) = 0 THEN 1 ELSE d.CantSap END, 1,
           d.IdCliente, d.IdProyecto, d.IdSite, d.CorreSite, d.TipoTrabajo
    FROM dbo.DetLogistica d
    INNER JOIN @t x ON x.Correlativo = d.Correlativo;

    INSERT INTO dbo.Kardex_Material (CodPap, Correlativo, CantSap, Observacion, CodKardex, Usuario, Fecha, Hora)
    SELECT d.CodPap, CONVERT(varchar(36), d.Correlativo), CASE WHEN ISNULL(d.CantSap, 0) = 0 THEN 1 ELSE d.CantSap END,
           ISNULL(NULLIF(d.Observacion, ''), '0'), 1, @Usuario, @hoy, @ahora
    FROM dbo.DetLogistica d
    INNER JOIN @t x ON x.Correlativo = d.Correlativo
    WHERE x.IdEstado = 1;

    -- La cabecera pasa a 1 cuando todas las lineas del pedido y site estan recepcionadas.
    UPDATE a SET a.IdEstado = 1
    FROM dbo.CabLogistica a
    WHERE EXISTS (SELECT 1 FROM dbo.DetLogistica d INNER JOIN @t x ON x.Correlativo = d.Correlativo
                  WHERE d.PedidoSap = a.PedidoSap AND d.IdSite = a.IdSite)
      AND NOT EXISTS (SELECT 1 FROM dbo.DetLogistica d WHERE d.PedidoSap = a.PedidoSap AND d.IdSite = a.IdSite AND d.IdEstado <> 1);
    SET @PedidosCompletos = @@ROWCOUNT;

    COMMIT TRANSACTION;
  END TRY
  BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
  END CATCH;
END;
GO

/* ------------------------------------------------------------------------------------------------
   x Validar: lineas en estado 1 pasan a 2 (validado) o 4/6/8. El estado 6 exige serie.
   Items = [{"correlativo":"guid","idEstado":2}]. @IdZonaAlmacen opcional (DetLogistica.idZonaAlmacen).
------------------------------------------------------------------------------------------------ */
CREATE OR ALTER PROCEDURE dbo.sp_Logistica_Ingreso_Validar
  @Items          nvarchar(max),
  @Usuario        nvarchar(50),
  @IdZonaAlmacen  int = NULL,
  @Actualizadas   int OUTPUT,
  @PedidosCompletos int OUTPUT
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  DECLARE @ahora datetime = CONVERT(datetime, SYSDATETIMEOFFSET() AT TIME ZONE 'SA Pacific Standard Time');
  DECLARE @hoy date = CAST(@ahora AS date);

  DECLARE @t TABLE (Correlativo uniqueidentifier NOT NULL PRIMARY KEY, IdEstado int NOT NULL);
  INSERT INTO @t (Correlativo, IdEstado)
  SELECT TRY_CONVERT(uniqueidentifier, j.correlativo), ISNULL(j.idEstado, 2)
  FROM OPENJSON(@Items) WITH (correlativo nvarchar(40) '$.correlativo', idEstado int '$.idEstado') j
  WHERE TRY_CONVERT(uniqueidentifier, j.correlativo) IS NOT NULL;

  IF NOT EXISTS (SELECT 1 FROM @t) THROW 51120, 'No hay registros para validar.', 1;
  IF EXISTS (SELECT 1 FROM @t WHERE IdEstado NOT IN (2, 4, 6, 8))
    THROW 51121, 'Estado no permitido en validacion (use 2, 4, 6 u 8).', 1;
  IF EXISTS (SELECT 1 FROM @t x WHERE NOT EXISTS (SELECT 1 FROM dbo.DetLogistica d WHERE d.Correlativo = x.Correlativo AND d.IdEstado = 1))
    THROW 51122, 'Hay registros que ya no estan pendientes de validacion. Vuelva a consultar.', 1;
  IF EXISTS (SELECT 1 FROM @t x INNER JOIN dbo.DetLogistica d ON d.Correlativo = x.Correlativo
             WHERE x.IdEstado = 6 AND (d.Serie IS NULL OR LTRIM(RTRIM(d.Serie)) IN ('', 'NULL')))
    THROW 51123, 'No se puede grabar la validacion en estado 6 si el registro no tiene serie.', 1;

  BEGIN TRY
    BEGIN TRANSACTION;

    UPDATE d
       SET d.IdEstado = x.IdEstado,
           d.FechaValidacion = @hoy,
           d.IdZonaAlmacen = COALESCE(@IdZonaAlmacen, d.IdZonaAlmacen)
    FROM dbo.DetLogistica d
    INNER JOIN @t x ON x.Correlativo = d.Correlativo;
    SET @Actualizadas = @@ROWCOUNT;

    INSERT INTO dbo.MovMaterial
      (PedidoSap, Correlativo, Posicion, IdEstado, Usuario, Fecha, Hora, Observacion, CodPap, CantSap, IdMovimiento,
       IdCliente, IdProyecto, IdSite, CorreSite, TipoTrabajo)
    SELECT d.PedidoSap, CONVERT(varchar(36), d.Correlativo), '0', x.IdEstado, @Usuario, @hoy, @ahora,
           ISNULL(NULLIF(d.Observacion, ''), '0'), d.CodPap, CASE WHEN ISNULL(d.CantSap, 0) = 0 THEN 1 ELSE d.CantSap END, 1,
           d.IdCliente, d.IdProyecto, d.IdSite, d.CorreSite, d.TipoTrabajo
    FROM dbo.DetLogistica d
    INNER JOIN @t x ON x.Correlativo = d.Correlativo;

    -- No mueve stock: la validacion solo cambia el estado (igual que el sistema antiguo).
    UPDATE a SET a.IdEstado = 2
    FROM dbo.CabLogistica a
    WHERE EXISTS (SELECT 1 FROM dbo.DetLogistica d INNER JOIN @t x ON x.Correlativo = d.Correlativo
                  WHERE d.PedidoSap = a.PedidoSap AND d.IdSite = a.IdSite)
      AND NOT EXISTS (SELECT 1 FROM dbo.DetLogistica d WHERE d.PedidoSap = a.PedidoSap AND d.IdSite = a.IdSite AND d.IdEstado <> 2);
    SET @PedidosCompletos = @@ROWCOUNT;

    COMMIT TRANSACTION;
  END TRY
  BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
  END CATCH;
END;
GO

/* ------------------------------------------------------------------------------------------------
   Series (individual): registra la serie y/o el comentario de una linea.
------------------------------------------------------------------------------------------------ */
CREATE OR ALTER PROCEDURE dbo.sp_Logistica_Ingreso_SerieActualizar
  @Correlativo  uniqueidentifier,
  @Usuario      nvarchar(50),
  @Serie        nvarchar(100) = NULL,   -- NULL = no cambia la serie
  @Comentario   nvarchar(500) = NULL    -- NULL = no cambia el comentario (se reemplaza, no se concatena)
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  DECLARE @ahora datetime = CONVERT(datetime, SYSDATETIMEOFFSET() AT TIME ZONE 'SA Pacific Standard Time');
  DECLARE @hoy date = CAST(@ahora AS date);

  SET @Serie = LTRIM(RTRIM(@Serie));

  IF NOT EXISTS (SELECT 1 FROM dbo.DetLogistica WHERE Correlativo = @Correlativo)
    THROW 51130, 'No existe el registro indicado.', 1;

  IF @Serie IS NOT NULL AND @Serie <> N'' AND @Serie <> N'NO APLICA'
  BEGIN
    IF EXISTS (SELECT 1 FROM dbo.DetLogistica d WHERE d.Serie = @Serie AND d.Correlativo <> @Correlativo AND d.IdEstado <> 99)
       OR EXISTS (SELECT 1 FROM dbo.MaterialSerie m WHERE m.Serie = @Serie AND m.IdEstado <> 0
                  AND CONVERT(varchar(36), m.Correlativo) <> CONVERT(varchar(36), @Correlativo))
      THROW 51131, 'La serie ya esta registrada en otro registro.', 1;
  END;

  BEGIN TRY
    BEGIN TRANSACTION;

    UPDATE dbo.DetLogistica
       SET Serie = CASE WHEN @Serie IS NULL THEN Serie ELSE @Serie END,
           Comentario = CASE WHEN @Comentario IS NULL THEN Comentario ELSE @Comentario END
     WHERE Correlativo = @Correlativo;

    INSERT INTO dbo.logDetLogistica
      (IdCliente, IdProyecto, IdSite, CorreSite, TipoTrabajo, PedidoSap, CodPap, Posicion, CantSap, Centro, Almacen, Lote,
       Usuario, Fecha, Hora, IdEstado, Observacion, Serie)
    SELECT d.IdCliente, d.IdProyecto, d.IdSite, d.CorreSite, d.TipoTrabajo, d.PedidoSap, d.CodPap, '', d.CantSap, '', '', '',
           @Usuario, @hoy, @ahora, 1, CONVERT(varchar(36), d.Correlativo), d.Serie
    FROM dbo.DetLogistica d
    WHERE d.Correlativo = @Correlativo;

    COMMIT TRANSACTION;
  END TRY
  BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
  END CATCH;
END;
GO

/* ------------------------------------------------------------------------------------------------
   Series (masivo): asigna series de un Excel a lineas cod. 40 sin serie y las registra en MaterialSerie.
   Items = [{"pedido":"..","codPap":"..","site":"..","serie":".."}]. Valida todo antes de grabar.
   Devuelve una fila por linea del archivo: Fila, Estado (OK/ERROR), Mensaje.
------------------------------------------------------------------------------------------------ */
CREATE OR ALTER PROCEDURE dbo.sp_Logistica_Ingreso_SerieImportar
  @Items       nvarchar(max),
  @Usuario     nvarchar(50),
  @SoloValidar bit = 0,
  @Aplicado    bit OUTPUT
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;
  SET @Aplicado = 0;

  DECLARE @ahora datetime = CONVERT(datetime, SYSDATETIMEOFFSET() AT TIME ZONE 'SA Pacific Standard Time');
  DECLARE @hoy date = CAST(@ahora AS date);

  CREATE TABLE #x (
    Fila int NOT NULL, PedidoSap nvarchar(50) NULL, CodPap nvarchar(50) NULL, Site nvarchar(100) NULL, Serie nvarchar(100) NULL,
    Ord int NULL, Estado varchar(8) NOT NULL DEFAULT 'OK', Mensaje nvarchar(300) NOT NULL DEFAULT N'', Destino uniqueidentifier NULL);

  INSERT INTO #x (Fila, PedidoSap, CodPap, Site, Serie)
  SELECT CAST(a.[key] AS int) + 1,
         NULLIF(LTRIM(RTRIM(JSON_VALUE(a.value, '$.pedido'))), N''),
         NULLIF(LTRIM(RTRIM(JSON_VALUE(a.value, '$.codPap'))), N''),
         NULLIF(LTRIM(RTRIM(JSON_VALUE(a.value, '$.site'))), N''),
         NULLIF(LTRIM(RTRIM(JSON_VALUE(a.value, '$.serie'))), N'')
  FROM OPENJSON(@Items) a;

  IF NOT EXISTS (SELECT 1 FROM #x) THROW 51140, 'No hay registros para procesar.', 1;

  -- Los materiales cod. 10 no llevan serie: se ignoran (igual que el sistema antiguo).
  DELETE FROM #x WHERE LEFT(ISNULL(CodPap, N''), 2) = N'10';

  UPDATE #x SET Estado = 'ERROR', Mensaje = N'Falta pedido, codigo de material o serie.'
  WHERE PedidoSap IS NULL OR CodPap IS NULL OR Serie IS NULL;

  UPDATE x SET Estado = 'ERROR', Mensaje = N'Serie repetida en el archivo.'
  FROM #x x WHERE x.Estado = 'OK' AND EXISTS (SELECT 1 FROM #x y WHERE y.Serie = x.Serie AND y.Fila <> x.Fila);

  UPDATE x SET Estado = 'ERROR', Mensaje = N'La serie ya existe.'
  FROM #x x
  WHERE x.Estado = 'OK'
    AND (EXISTS (SELECT 1 FROM dbo.MaterialSerie m WHERE m.Serie = x.Serie AND m.IdEstado <> 0)
         OR EXISTS (SELECT 1 FROM dbo.DetLogistica d WHERE d.Serie = x.Serie AND d.IdEstado <> 99));

  -- Emparejamiento: n-esima serie del archivo (por pedido y material) con la n-esima linea libre.
  ;WITH f AS (
    SELECT Fila, ROW_NUMBER() OVER (PARTITION BY PedidoSap, CodPap ORDER BY Fila) AS n FROM #x WHERE Estado = 'OK'),
  l AS (
    SELECT d.PedidoSap, d.CodPap, d.Correlativo,
           ROW_NUMBER() OVER (PARTITION BY d.PedidoSap, d.CodPap
                              ORDER BY CASE WHEN d.IdEstado = 8 THEN 1 ELSE 0 END, d.Posicion, d.Hora, d.Correlativo) AS n
    FROM dbo.DetLogistica d
    WHERE (d.Serie IS NULL OR LTRIM(RTRIM(d.Serie)) = N'') AND d.IdEstado <> 99)
  UPDATE x SET x.Destino = l.Correlativo
  FROM #x x INNER JOIN f ON f.Fila = x.Fila
  LEFT JOIN l ON l.PedidoSap = x.PedidoSap AND l.CodPap = x.CodPap AND l.n = f.n
  WHERE x.Estado = 'OK';

  UPDATE #x SET Estado = 'ERROR', Mensaje = N'No hay una linea del pedido sin serie para este material.'
  WHERE Estado = 'OK' AND Destino IS NULL;

  IF @SoloValidar = 1 OR EXISTS (SELECT 1 FROM #x WHERE Estado = 'ERROR')
  BEGIN
    SELECT Fila, Estado, Mensaje FROM #x ORDER BY Fila;
    RETURN;
  END;

  BEGIN TRY
    BEGIN TRANSACTION;

    UPDATE d SET d.Serie = x.Serie
    FROM dbo.DetLogistica d INNER JOIN #x x ON x.Destino = d.Correlativo;

    INSERT INTO dbo.MaterialSerie (CodPap, Serie, PedidoSap, IdEstado, Usuario, Fecha, Hora, Correlativo)
    SELECT x.CodPap, x.Serie, x.PedidoSap, 1, @Usuario, @hoy, @ahora, CONVERT(varchar(36), x.Destino)
    FROM #x x;

    -- Lineas cod. 40 de esos pedidos que quedaron sin serie: "no recepcionado" (solo si seguian en estado 0).
    UPDATE d SET d.IdEstado = 8, d.Comentario = LTRIM(ISNULL(d.Comentario, N'') + N' NO TIENE SERIE ASIGNADA')
    FROM dbo.DetLogistica d
    WHERE d.PedidoSap IN (SELECT PedidoSap FROM #x)
      AND LEFT(d.CodPap, 2) = N'40' AND d.IdEstado = 0
      AND (d.Serie IS NULL OR LTRIM(RTRIM(d.Serie)) = N'');

    COMMIT TRANSACTION;
    SET @Aplicado = 1;
  END TRY
  BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
  END CATCH;

  SELECT Fila, Estado, Mensaje FROM #x ORDER BY Fila;
END;
GO

/* ------------------------------------------------------------------------------------------------
   Series: actualiza guia y fecha de ingreso de uno o varios pedidos y, opcionalmente, reasigna
   cliente / proyecto / site / tipo de trabajo (debe existir la relacion en Importar con estado 1).
   @Pedidos = ["4400000001","4400000002"]
------------------------------------------------------------------------------------------------ */
CREATE OR ALTER PROCEDURE dbo.sp_Logistica_Ingreso_GuiaActualizar
  @Pedidos       nvarchar(max),
  @Guia          nvarchar(50),
  @FecIngreso    date,
  @Usuario       nvarchar(50),
  @Reasignar     bit           = 0,
  @IdCliente     int           = NULL,
  @IdProyecto    int           = NULL,
  @TipoTrabajo   nvarchar(100) = NULL,
  @IdSite        nvarchar(20)  = NULL,
  @CorreSite     int           = NULL,
  @PedidosActualizados int OUTPUT,
  @LineasActualizadas  int OUTPUT
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  DECLARE @ahora datetime = CONVERT(datetime, SYSDATETIMEOFFSET() AT TIME ZONE 'SA Pacific Standard Time');
  DECLARE @hoy date = CAST(@ahora AS date);

  SET @Guia = NULLIF(LTRIM(RTRIM(@Guia)), N'');
  IF @Guia IS NULL THROW 51150, 'Debe ingresar la guia.', 1;
  IF @FecIngreso IS NULL THROW 51151, 'Debe ingresar la fecha de ingreso.', 1;

  DECLARE @p TABLE (PedidoSap nvarchar(50) NOT NULL PRIMARY KEY);
  INSERT INTO @p SELECT DISTINCT LTRIM(RTRIM(value)) FROM OPENJSON(@Pedidos) WHERE LTRIM(RTRIM(value)) <> N'';
  IF NOT EXISTS (SELECT 1 FROM @p) THROW 51152, 'No hay pedidos seleccionados.', 1;

  DECLARE @nombreCliente nvarchar(200), @nombreProyecto nvarchar(200);

  IF @Reasignar = 1
  BEGIN
    IF @IdCliente IS NULL OR @IdProyecto IS NULL OR @IdSite IS NULL OR @CorreSite IS NULL OR NULLIF(LTRIM(RTRIM(@TipoTrabajo)), N'') IS NULL
      THROW 51153, 'Para reasignar indique cliente, proyecto, site y tipo de trabajo.', 1;
    IF NOT EXISTS (SELECT 1 FROM dbo.Importar WHERE IdCliente = @IdCliente AND IdProyecto = @IdProyecto AND IdSite = @IdSite AND IdEstado = 1)
      THROW 51154, 'No existe la relacion cliente - proyecto - site indicada.', 1;
    SELECT @nombreCliente = NombreCliente FROM dbo.Cliente WHERE IdCliente = @IdCliente;
    SELECT @nombreProyecto = NombreProyecto FROM dbo.Proyecto WHERE IdProyecto = @IdProyecto;
  END;

  BEGIN TRY
    BEGIN TRANSACTION;

    UPDATE a
       SET a.NroGuia = @Guia,
           a.FechaIngreso = @FecIngreso,
           a.IdCliente = CASE WHEN @Reasignar = 1 THEN @IdCliente ELSE a.IdCliente END,
           a.IdProyecto = CASE WHEN @Reasignar = 1 THEN @IdProyecto ELSE a.IdProyecto END,
           a.TipoTrabajo = CASE WHEN @Reasignar = 1 THEN @TipoTrabajo ELSE a.TipoTrabajo END,
           a.IdSite = CASE WHEN @Reasignar = 1 THEN @IdSite ELSE a.IdSite END,
           a.CorreSite = CASE WHEN @Reasignar = 1 THEN @CorreSite ELSE a.CorreSite END,
           a.NombreCliente = CASE WHEN @Reasignar = 1 THEN @nombreCliente ELSE a.NombreCliente END,
           a.NombreProyecto = CASE WHEN @Reasignar = 1 THEN @nombreProyecto ELSE a.NombreProyecto END,
           a.NombreTrabajo = CASE WHEN @Reasignar = 1 THEN @TipoTrabajo ELSE a.NombreTrabajo END
    FROM dbo.CabLogistica a
    INNER JOIN @p p ON p.PedidoSap = a.PedidoSap;
    SET @PedidosActualizados = @@ROWCOUNT;

    UPDATE d
       SET d.Guia = @Guia,
           d.FecIngreso = @FecIngreso,
           d.IdCliente = CASE WHEN @Reasignar = 1 THEN @IdCliente ELSE d.IdCliente END,
           d.IdProyecto = CASE WHEN @Reasignar = 1 THEN @IdProyecto ELSE d.IdProyecto END,
           d.TipoTrabajo = CASE WHEN @Reasignar = 1 THEN @TipoTrabajo ELSE d.TipoTrabajo END,
           d.IdSite = CASE WHEN @Reasignar = 1 THEN @IdSite ELSE d.IdSite END,
           d.CorreSite = CASE WHEN @Reasignar = 1 THEN @CorreSite ELSE d.CorreSite END
    FROM dbo.DetLogistica d
    INNER JOIN @p p ON p.PedidoSap = d.PedidoSap;
    SET @LineasActualizadas = @@ROWCOUNT;

    IF @Reasignar = 1
    BEGIN
      INSERT INTO dbo.logCabLogistica
        (IdCliente, IdProyecto, IdSite, CorreSite, TipoTrabajo, PedidoSap, IdSolicitud, ObsSolicitud, Region, Oc, IdZona, NroGuia,
         Observacion, Usuario, FechaCreacion, HoraCreacion, IdSolicitante, IdEstado, NombreCliente, NombreProyecto, NombreTrabajo)
      SELECT @IdCliente, @IdProyecto, @IdSite, @CorreSite, @TipoTrabajo, a.PedidoSap, a.IdSolicitud, '', '', '', 0, @Guia,
             '', @Usuario, @hoy, @ahora, 0, 1, @nombreCliente, @nombreProyecto, @TipoTrabajo
      FROM dbo.CabLogistica a INNER JOIN @p p ON p.PedidoSap = a.PedidoSap;

      INSERT INTO dbo.logDetLogistica
        (IdCliente, IdProyecto, IdSite, CorreSite, TipoTrabajo, PedidoSap, CodPap, Posicion, CantSap, Centro, Almacen, Lote,
         Usuario, Fecha, Hora, IdEstado, Observacion)
      SELECT @IdCliente, @IdProyecto, @IdSite, @CorreSite, @TipoTrabajo, d.PedidoSap, d.CodPap, '', d.CantSap, '', '', '',
             @Usuario, @hoy, @ahora, 1, CONVERT(varchar(36), d.Correlativo)
      FROM dbo.DetLogistica d INNER JOIN @p p ON p.PedidoSap = d.PedidoSap;
    END;

    COMMIT TRANSACTION;
  END TRY
  BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
  END CATCH;
END;
GO

/* ------------------------------------------------------------------------------------------------
   Pedido: importa la hoja PRINCIPAL del Excel. Crea cabecera, lineas (cod. 40: una por unidad solicitada),
   registro de carga, kardex y entrada de stock a Disponible (sp_Stock_Mover).
   Items = [{fila, pedidoSap, idSolicitud, site, descSite, solicitante, codPap, descripcion, cantSolicitada, cantSap,
             centro, almOrigen, lote, obsSolic, region, oc, posicion, cliente, proyecto, tipoTrabajo, fecIngreso, guia}]
   Devuelve una fila por linea: Fila, Estado (OK / OMITIDO / ERROR), Mensaje.
   Si hay algun ERROR o @SoloValidar = 1 no se graba nada.
------------------------------------------------------------------------------------------------ */
CREATE OR ALTER PROCEDURE dbo.sp_Logistica_Pedido_Importar
  @Items         nvarchar(max),
  @Usuario       nvarchar(50),
  @IdEmpleadoCj  int           = NULL,
  @SoloValidar   bit           = 0,
  @Aplicado      bit OUTPUT
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;
  SET @Aplicado = 0;

  DECLARE @ahora datetime = CONVERT(datetime, SYSDATETIMEOFFSET() AT TIME ZONE 'SA Pacific Standard Time');
  DECLARE @hoy date = CAST(@ahora AS date);

  CREATE TABLE #l (
    Ord int NOT NULL PRIMARY KEY, Fila int NOT NULL,
    PedidoSap nvarchar(50) NULL, IdSolicitud nvarchar(50) NULL, IdSite nvarchar(20) NULL, DescSite nvarchar(200) NULL,
    Solicitante nvarchar(200) NULL, CodPap nvarchar(50) NULL, Descripcion nvarchar(300) NULL,
    CantSolicitada decimal(18,4) NOT NULL, CantSap decimal(18,4) NOT NULL,
    Centro nvarchar(50) NULL, Almacen nvarchar(50) NULL, Lote nvarchar(50) NULL, Obs nvarchar(500) NULL,
    Region nvarchar(100) NULL, Oc nvarchar(50) NULL, Posicion nvarchar(20) NOT NULL,
    Cliente nvarchar(200) NULL, Proyecto nvarchar(200) NULL, TipoTrabajo nvarchar(100) NULL,
    FecIngreso date NULL, Guia nvarchar(50) NULL,
    IdCliente int NULL, IdProyecto int NULL, CorreSite int NULL,
    Estado varchar(8) NOT NULL DEFAULT 'OK', Mensaje nvarchar(300) NOT NULL DEFAULT N'');

  INSERT INTO #l (Ord, Fila, PedidoSap, IdSolicitud, IdSite, DescSite, Solicitante, CodPap, Descripcion, CantSolicitada, CantSap,
                  Centro, Almacen, Lote, Obs, Region, Oc, Posicion, Cliente, Proyecto, TipoTrabajo, FecIngreso, Guia)
  SELECT CAST(a.[key] AS int),
         ISNULL(TRY_CONVERT(int, JSON_VALUE(a.value, '$.fila')), CAST(a.[key] AS int) + 2),
         NULLIF(LTRIM(RTRIM(JSON_VALUE(a.value, '$.pedidoSap'))), N''),
         LTRIM(RTRIM(JSON_VALUE(a.value, '$.idSolicitud'))),
         NULLIF(LTRIM(RTRIM(JSON_VALUE(a.value, '$.site'))), N''),
         LTRIM(RTRIM(JSON_VALUE(a.value, '$.descSite'))),
         LTRIM(RTRIM(JSON_VALUE(a.value, '$.solicitante'))),
         NULLIF(LTRIM(RTRIM(JSON_VALUE(a.value, '$.codPap'))), N''),
         LTRIM(RTRIM(JSON_VALUE(a.value, '$.descripcion'))),
         ISNULL(TRY_CONVERT(decimal(18,4), JSON_VALUE(a.value, '$.cantSolicitada')), 0),
         ISNULL(TRY_CONVERT(decimal(18,4), JSON_VALUE(a.value, '$.cantSap')), 0),
         LTRIM(RTRIM(JSON_VALUE(a.value, '$.centro'))),
         LTRIM(RTRIM(JSON_VALUE(a.value, '$.almOrigen'))),
         NULLIF(LTRIM(RTRIM(JSON_VALUE(a.value, '$.lote'))), N''),
         LEFT(LTRIM(RTRIM(JSON_VALUE(a.value, '$.obsSolic'))), 500),
         LTRIM(RTRIM(JSON_VALUE(a.value, '$.region'))),
         LTRIM(RTRIM(JSON_VALUE(a.value, '$.oc'))),
         ISNULL(NULLIF(LTRIM(RTRIM(JSON_VALUE(a.value, '$.posicion'))), N''), N'0'),
         LTRIM(RTRIM(JSON_VALUE(a.value, '$.cliente'))),
         LTRIM(RTRIM(JSON_VALUE(a.value, '$.proyecto'))),
         LTRIM(RTRIM(JSON_VALUE(a.value, '$.tipoTrabajo'))),
         TRY_CONVERT(date, JSON_VALUE(a.value, '$.fecIngreso'), 23),
         LTRIM(RTRIM(JSON_VALUE(a.value, '$.guia')))
  FROM OPENJSON(@Items) a;

  IF NOT EXISTS (SELECT 1 FROM #l) THROW 51160, 'No hay registros para importar.', 1;

  -- Validaciones (mismos mensajes del sistema antiguo).
  UPDATE #l SET Estado = 'ERROR', Mensaje = N'Falta el Pedido SAP.' WHERE PedidoSap IS NULL;
  UPDATE #l SET Estado = 'ERROR', Mensaje = N'Debe ingresar LOTE.' WHERE Estado = 'OK' AND Lote IS NULL;
  UPDATE #l SET Estado = 'ERROR', Mensaje = N'Falta el codigo de material (CODPAP de 2 digitos o mas).'
  WHERE Estado = 'OK' AND (CodPap IS NULL OR LEN(CodPap) < 2);
  UPDATE #l SET Estado = 'ERROR', Mensaje = N'Falta el Site.' WHERE Estado = 'OK' AND IdSite IS NULL;

  UPDATE l SET l.CorreSite = s.Correlativo
  FROM #l l CROSS APPLY (SELECT TOP 1 Correlativo FROM dbo.Site s WHERE s.IdSite = l.IdSite AND s.NombreSite = l.DescSite ORDER BY s.Correlativo) s
  WHERE l.Estado = 'OK';
  UPDATE #l SET Estado = 'ERROR', Mensaje = N'No existe correlativo de SITE.' WHERE Estado = 'OK' AND CorreSite IS NULL;

  UPDATE l SET l.IdCliente = c.IdCliente
  FROM #l l CROSS APPLY (SELECT TOP 1 IdCliente FROM dbo.Cliente c WHERE c.NombreCliente = l.Cliente ORDER BY c.IdCliente) c
  WHERE l.Estado = 'OK';
  UPDATE #l SET Estado = 'ERROR', Mensaje = N'No existe Cliente.' WHERE Estado = 'OK' AND IdCliente IS NULL;

  UPDATE l SET l.IdProyecto = p.IdProyecto
  FROM #l l CROSS APPLY (SELECT TOP 1 IdProyecto FROM dbo.Proyecto p WHERE p.NombreProyecto = l.Proyecto AND p.Estado = 1 ORDER BY p.IdProyecto) p
  WHERE l.Estado = 'OK';
  UPDATE #l SET Estado = 'ERROR', Mensaje = N'No existe Proyecto.' WHERE Estado = 'OK' AND IdProyecto IS NULL;

  UPDATE l SET l.Estado = 'ERROR', l.Mensaje = N'No existe relacion cliente, proyecto, site.'
  FROM #l l
  WHERE l.Estado = 'OK'
    AND NOT EXISTS (SELECT 1 FROM dbo.Importar i WHERE i.IdCliente = l.IdCliente AND i.IdProyecto = l.IdProyecto
                    AND i.IdSite = l.IdSite AND i.Correlativo = l.CorreSite AND i.IdEstado = 1);

  -- Lineas ya cargadas (misma posicion del mismo pedido y site): se omiten para no duplicar.
  UPDATE l SET l.Estado = 'OMITIDO', l.Mensaje = N'La linea ya fue cargada anteriormente.'
  FROM #l l
  WHERE l.Estado = 'OK'
    AND EXISTS (SELECT 1 FROM dbo.DetLogistica d WHERE d.PedidoSap = l.PedidoSap AND d.CodPap = l.CodPap
                AND CAST(d.Posicion AS nvarchar(20)) = l.Posicion AND d.IdSite = l.IdSite AND d.CorreSite = l.CorreSite);

  IF @SoloValidar = 1 OR EXISTS (SELECT 1 FROM #l WHERE Estado = 'ERROR') OR NOT EXISTS (SELECT 1 FROM #l WHERE Estado = 'OK')
  BEGIN
    SELECT Fila, Estado, Mensaje FROM #l ORDER BY Ord;
    RETURN;
  END;

  IF OBJECT_ID(N'dbo.sp_Stock_Mover', N'P') IS NULL
    THROW 51161, 'Falta dbo.sp_Stock_Mover (ejecute los scripts de stock 01 a 05 antes de importar pedidos).', 1;

  BEGIN TRY
    BEGIN TRANSACTION;

    DECLARE @ord int, @pedido nvarchar(50), @idSol nvarchar(50), @site nvarchar(20), @desc nvarchar(200), @codpap nvarchar(50),
            @descMat nvarchar(300), @cantSol decimal(18,4), @cantSap decimal(18,4), @centro nvarchar(50), @alm nvarchar(50),
            @lote nvarchar(50), @obs nvarchar(500), @region nvarchar(100), @oc nvarchar(50), @pos nvarchar(20),
            @cli nvarchar(200), @proy nvarchar(200), @trab nvarchar(100), @fec date, @guia nvarchar(50),
            @idCli int, @idProy int, @corre int, @solicitante nvarchar(200);

    DECLARE c CURSOR LOCAL FAST_FORWARD FOR
      SELECT Ord, PedidoSap, IdSolicitud, IdSite, DescSite, CodPap, Descripcion, CantSolicitada, CantSap, Centro, Almacen, Lote,
             Obs, Region, Oc, Posicion, Cliente, Proyecto, TipoTrabajo, FecIngreso, Guia, IdCliente, IdProyecto, CorreSite, Solicitante
      FROM #l WHERE Estado = 'OK' ORDER BY Ord;
    OPEN c;
    FETCH NEXT FROM c INTO @ord, @pedido, @idSol, @site, @desc, @codpap, @descMat, @cantSol, @cantSap, @centro, @alm, @lote,
                           @obs, @region, @oc, @pos, @cli, @proy, @trab, @fec, @guia, @idCli, @idProy, @corre, @solicitante;
    WHILE @@FETCH_STATUS = 0
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM dbo.Material WHERE CodPap = @codpap)
        INSERT INTO dbo.Material (CodPap, NombreMaterial, CodEstado, UnidadMedida) VALUES (@codpap, @descMat, 1, 'UND');

      IF NOT EXISTS (SELECT 1 FROM dbo.CabLogistica WHERE PedidoSap = @pedido AND IdCliente = @idCli AND IdProyecto = @idProy
                     AND IdSite = @site AND CorreSite = @corre)
        INSERT INTO dbo.CabLogistica
          (IdCliente, IdProyecto, IdSite, CorreSite, TipoTrabajo, PedidoSap, NroSolicitud, IdSolicitud, ObsSolicitud, Region, Oc,
           IdZona, NroGuia, Observacion, Usuario, FechaCreacion, HoraCreacion, IdSolicitante, IdEstado,
           NombreCliente, NombreProyecto, NombreTrabajo)
        VALUES (@idCli, @idProy, @site, @corre, @trab, @pedido, 0, @idSol, @descMat, @region, @oc,
                0, '', @obs, @Usuario, @hoy, @ahora, 0, 0, @cli, @proy, @trab);

      -- Cod. 40: una linea por unidad solicitada (las no recibidas del pedido SAP quedan en estado 8). Resto: una linea.
      DECLARE @unidades int = CASE WHEN LEFT(@codpap, 2) = N'40' AND @cantSol > 1 THEN CAST(@cantSol AS int) ELSE 1 END;
      DECLARE @k int = 1;
      WHILE @k <= @unidades
      BEGIN
        DECLARE @cantFila decimal(18,4) = CASE WHEN @unidades > 1 THEN 1 ELSE @cantSap END;
        DECLARE @estadoFila int = CASE WHEN @unidades > 1 AND @k > @cantSap THEN 8 ELSE 0 END;
        DECLARE @ids TABLE (Correlativo uniqueidentifier);
        DELETE FROM @ids;

        INSERT INTO dbo.DetLogistica
          (IdCliente, IdProyecto, IdSite, CorreSite, TipoTrabajo, PedidoSap, CodPap, Posicion, CantSap, Centro, Almacen, Lote,
           Usuario, Fecha, Hora, IdEstado, Observacion, Serie, FecIngreso, Guia, IdUbicacion, Region, Oc)
        OUTPUT inserted.Correlativo INTO @ids
        VALUES (@idCli, @idProy, @site, @corre, @trab, @pedido, @codpap, @pos, @cantFila, @centro, @alm, @lote,
                @Usuario, @hoy, @ahora, @estadoFila, @obs, CASE WHEN LEFT(@codpap, 2) = N'10' THEN 'NO APLICA' ELSE '' END,
                ISNULL(@fec, '19000101'), ISNULL(@guia, ''), 0, @region, @oc);

        INSERT INTO dbo.Kardex
          (TipoMovimiento, CantSap, CodPap, CantAnterior, CantRestante, Observaciones, IdCliente, IdProyecto, IdSite, CorreSite,
           IdEmpleadoCj, Fecha, Hora, IdEstado, PedidoSap, FilaPedido, Serie)
        VALUES (1, @cantFila, @codpap, 0, @cantFila, 'CREACION CONVERTIR', @idCli, @idProy, @site, @corre,
                @IdEmpleadoCj, @hoy, @ahora, 0, @pedido, TRY_CONVERT(int, @pos), '');

        IF @cantFila > 0
        BEGIN
          DECLARE @corrDet nvarchar(50) = (SELECT TOP 1 CONVERT(nvarchar(50), Correlativo) FROM @ids);
          DECLARE @clave nvarchar(100) = CONCAT(N'PEDIMP:', @pedido, N'|', @codpap, N'|', @pos, N'|', @site, N'|', @k);
          EXEC dbo.sp_Stock_Mover
            @CodPap = @codpap, @BucketOrigen = NULL, @BucketDestino = 'Disponible', @Cantidad = @cantFila,
            @Operacion = 'PEDIDO_IMPORTAR', @Posicion = @pos, @CorrelativoDet = @corrDet, @IdEstadoDoc = @estadoFila,
            @Usuario = @Usuario, @IdEmpleadoCj = @IdEmpleadoCj, @Observacion = N'Importacion de pedido',
            @ClaveIdempotencia = @clave;
        END;

        SET @k += 1;
      END;

      INSERT INTO dbo.CargaLogistica
        (IdCliente, IdProyecto, IdSite, CorreSite, IdTipoTrabajo, CodPro, PedidoSap, IdSolicitud, DescSite, Solicitante, IdSolicitante,
         CantSolicitada, CantSap, Centro, Almacen, Lote, Obs, Region, Oc, Posicion, Usuario, Fecha, Hora, UsuarioTmp,
         NombreCliente, NombreProyecto, NombreTrabajo)
      VALUES (@idCli, @idProy, @site, @corre, '0', @codpap, @pedido, @idSol, @descMat, @solicitante, 0,
              @cantSol, @cantSap, @centro, @alm, @lote, @obs, @region, @oc, @pos, @Usuario, @hoy, @ahora, 'NUEVO',
              @cli, @proy, @trab);

      FETCH NEXT FROM c INTO @ord, @pedido, @idSol, @site, @desc, @codpap, @descMat, @cantSol, @cantSap, @centro, @alm, @lote,
                             @obs, @region, @oc, @pos, @cli, @proy, @trab, @fec, @guia, @idCli, @idProy, @corre, @solicitante;
    END;
    CLOSE c; DEALLOCATE c;

    COMMIT TRANSACTION;
    SET @Aplicado = 1;
  END TRY
  BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
  END CATCH;

  SELECT Fila, Estado, Mensaje FROM #l ORDER BY Ord;
END;
GO

/* ------------------------------------------------------------------------------------------------
   Pedido - hoja SECUNDARIO: REASIGNA lo ya cargado entre sites (no mueve stock: es una redistribucion).
   - Cod. 40: mueve N unidades de la solicitud (lineas en estado 0 o 1) al Site indicado; prefiere las que ya estan en ese site.
   - Cod. 10: reparte la cantidad entre sites. La suma del archivo (por solicitud, material y lote) debe ser igual a la
     cantidad existente; las lineas sobrantes pasan a estado 99 (anuladas) en lugar de borrarse.
   - Otros materiales se omiten (el sistema antiguo solo trataba 10 y 40).
   Items = [{fila, idMaterial, idSolicitud, site, descSite, descripcion, cantidad, lote}]
   Devuelve una fila por linea: Fila, Estado (OK / OMITIDO / ERROR), Mensaje. Si hay algun ERROR no se graba nada.
------------------------------------------------------------------------------------------------ */
CREATE OR ALTER PROCEDURE dbo.sp_Logistica_Pedido_ImportarSecundario
  @Items       nvarchar(max),
  @Usuario     nvarchar(50),
  @SoloValidar bit = 0,
  @Aplicado    bit OUTPUT
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;
  SET @Aplicado = 0;

  DECLARE @ahora datetime = CONVERT(datetime, SYSDATETIMEOFFSET() AT TIME ZONE 'SA Pacific Standard Time');
  DECLARE @hoy date = CAST(@ahora AS date);

  CREATE TABLE #s (
    Ord int NOT NULL PRIMARY KEY, Fila int NOT NULL, CodPap nvarchar(50) NULL, IdSolicitud nvarchar(50) NULL,
    IdSite nvarchar(20) NULL, DescSite nvarchar(200) NULL, Cantidad decimal(18,4) NOT NULL, Lote nvarchar(50) NULL,
    CorreSite int NULL, Tipo nvarchar(2) NULL, Resuelta bit NOT NULL DEFAULT 0,
    Estado varchar(8) NOT NULL DEFAULT 'OK', Mensaje nvarchar(300) NOT NULL DEFAULT N'');

  INSERT INTO #s (Ord, Fila, CodPap, IdSolicitud, IdSite, DescSite, Cantidad, Lote)
  SELECT CAST(a.[key] AS int),
         ISNULL(TRY_CONVERT(int, JSON_VALUE(a.value, '$.fila')), CAST(a.[key] AS int) + 2),
         NULLIF(LTRIM(RTRIM(JSON_VALUE(a.value, '$.idMaterial'))), N''),
         NULLIF(LTRIM(RTRIM(JSON_VALUE(a.value, '$.idSolicitud'))), N''),
         NULLIF(LTRIM(RTRIM(JSON_VALUE(a.value, '$.site'))), N''),
         LTRIM(RTRIM(JSON_VALUE(a.value, '$.descSite'))),
         ISNULL(TRY_CONVERT(decimal(18,4), JSON_VALUE(a.value, '$.cantidad')), 0),
         NULLIF(LTRIM(RTRIM(JSON_VALUE(a.value, '$.lote'))), N'')
  FROM OPENJSON(@Items) a;

  IF NOT EXISTS (SELECT 1 FROM #s) THROW 51170, 'No hay registros para procesar.', 1;

  UPDATE #s SET Tipo = LEFT(CodPap, 2);
  UPDATE #s SET Estado = 'ERROR', Mensaje = N'La plantilla esta incompleta: falta Id. solicitud, material o site.'
  WHERE IdSolicitud IS NULL OR CodPap IS NULL OR IdSite IS NULL OR LEN(CodPap) < 2;
  UPDATE #s SET Estado = 'ERROR', Mensaje = N'La cantidad debe ser mayor que cero.' WHERE Estado = 'OK' AND Cantidad <= 0;
  UPDATE #s SET Estado = 'ERROR', Mensaje = N'Material cod. 40: la cantidad debe ser un numero entero.'
  WHERE Estado = 'OK' AND Tipo = N'40' AND Cantidad <> FLOOR(Cantidad);
  UPDATE #s SET Estado = 'OMITIDO', Mensaje = N'Solo se reasignan materiales cod. 10 y 40.' WHERE Estado = 'OK' AND Tipo NOT IN (N'10', N'40');

  UPDATE s SET s.CorreSite = x.Correlativo
  FROM #s s CROSS APPLY (SELECT TOP 1 Correlativo FROM dbo.Site t WHERE t.IdSite = s.IdSite AND t.NombreSite = s.DescSite ORDER BY t.Correlativo) x
  WHERE s.Estado = 'OK';
  UPDATE #s SET Estado = 'ERROR', Mensaje = N'No existe correlativo de Site.' WHERE Estado = 'OK' AND CorreSite IS NULL;

  -- Lineas existentes de cada solicitud y material (sin anuladas).
  CREATE TABLE #lin (
    Correlativo uniqueidentifier NOT NULL PRIMARY KEY, IdSolicitud nvarchar(50) NOT NULL, PedidoSap nvarchar(50) NOT NULL,
    IdSite nvarchar(20) NULL, CorreSite int NULL, CodPap nvarchar(50) NOT NULL, Lote nvarchar(50) NULL, CantSap decimal(18,4) NULL,
    IdEstado int NULL, Asignado bit NOT NULL DEFAULT 0, NuevoSite nvarchar(20) NULL, NuevoCorre int NULL, NuevoCant decimal(18,4) NULL);

  INSERT INTO #lin (Correlativo, IdSolicitud, PedidoSap, IdSite, CorreSite, CodPap, Lote, CantSap, IdEstado)
  SELECT d.Correlativo, k.IdSolicitud, d.PedidoSap, d.IdSite, d.CorreSite, d.CodPap, d.Lote, d.CantSap, d.IdEstado
  FROM (SELECT DISTINCT IdSolicitud, CodPap FROM #s WHERE Estado = 'OK') k
  INNER JOIN dbo.DetLogistica d ON d.CodPap = k.CodPap AND d.IdEstado <> 99
  WHERE EXISTS (SELECT 1 FROM dbo.CabLogistica a WHERE a.PedidoSap = d.PedidoSap AND a.IdSolicitud = k.IdSolicitud);

  UPDATE s SET s.Estado = 'ERROR', s.Mensaje = N'No existe detalle con ese Id. solicitud y material.'
  FROM #s s WHERE s.Estado = 'OK' AND NOT EXISTS (SELECT 1 FROM #lin l WHERE l.IdSolicitud = s.IdSolicitud AND l.CodPap = s.CodPap);

  -- Cod. 40: unidades pedidas contra unidades movibles (estados 0 y 1).
  UPDATE s SET s.Estado = 'ERROR',
         s.Mensaje = CONCAT(N'Unidades insuficientes: se piden ', CONVERT(int, g.Pedidas), N' y hay ', g.Disponibles, N' en estado creado/recepcionado.')
  FROM #s s
  CROSS APPLY (SELECT SUM(x.Cantidad) AS Pedidas,
                      (SELECT COUNT(*) FROM #lin l WHERE l.IdSolicitud = s.IdSolicitud AND l.CodPap = s.CodPap AND l.IdEstado IN (0, 1)) AS Disponibles
               FROM #s x WHERE x.Estado = 'OK' AND x.Tipo = N'40' AND x.IdSolicitud = s.IdSolicitud AND x.CodPap = s.CodPap) g
  WHERE s.Estado = 'OK' AND s.Tipo = N'40' AND g.Pedidas > g.Disponibles;

  -- Cod. 10: por solicitud, material y lote la suma del archivo debe coincidir con lo existente.
  UPDATE s SET s.Estado = 'ERROR',
         s.Mensaje = CASE
           WHEN g.Existentes = 0 THEN N'No existe una linea con ese lote para la solicitud y el material.'
           WHEN g.Avanzadas > 0 THEN N'Hay lineas de ese lote que ya avanzaron de etapa (solicitadas); no se pueden reasignar.'
           ELSE CONCAT(N'La suma del archivo (', CONVERT(decimal(18,2), g.Archivo), N') no coincide con la cantidad existente (',
                       CONVERT(decimal(18,2), g.Existente), N') del lote.') END
  FROM #s s
  CROSS APPLY (SELECT (SELECT SUM(x.Cantidad) FROM #s x WHERE x.Estado = 'OK' AND x.Tipo = N'10' AND x.IdSolicitud = s.IdSolicitud
                         AND x.CodPap = s.CodPap AND ISNULL(x.Lote, N'') = ISNULL(s.Lote, N'')) AS Archivo,
                      (SELECT COUNT(*) FROM #lin l WHERE l.IdSolicitud = s.IdSolicitud AND l.CodPap = s.CodPap AND ISNULL(l.Lote, N'') = ISNULL(s.Lote, N'')) AS Existentes,
                      (SELECT COUNT(*) FROM #lin l WHERE l.IdSolicitud = s.IdSolicitud AND l.CodPap = s.CodPap AND ISNULL(l.Lote, N'') = ISNULL(s.Lote, N'')
                         AND l.IdEstado NOT IN (0, 1, 2)) AS Avanzadas,
                      (SELECT SUM(ISNULL(l.CantSap, 0)) FROM #lin l WHERE l.IdSolicitud = s.IdSolicitud AND l.CodPap = s.CodPap
                         AND ISNULL(l.Lote, N'') = ISNULL(s.Lote, N'')) AS Existente) g
  WHERE s.Estado = 'OK' AND s.Tipo = N'10'
    AND (g.Existentes = 0 OR g.Avanzadas > 0 OR ISNULL(g.Archivo, 0) <> ISNULL(g.Existente, 0));

  -- Un error en cualquier fila del grupo invalida todo el grupo.
  UPDATE s SET s.Estado = 'ERROR', s.Mensaje = N'Otra fila de la misma solicitud y material tiene error.'
  FROM #s s
  WHERE s.Estado = 'OK' AND EXISTS (SELECT 1 FROM #s e WHERE e.Estado = 'ERROR' AND e.IdSolicitud = s.IdSolicitud AND e.CodPap = s.CodPap
                                    AND (s.Tipo = N'40' OR ISNULL(e.Lote, N'') = ISNULL(s.Lote, N'')));

  IF @SoloValidar = 1 OR EXISTS (SELECT 1 FROM #s WHERE Estado = 'ERROR') OR NOT EXISTS (SELECT 1 FROM #s WHERE Estado = 'OK')
  BEGIN
    SELECT Fila, Estado, Mensaje FROM #s ORDER BY Ord;
    RETURN;
  END;

  BEGIN TRY
    BEGIN TRANSACTION;

    DECLARE @nuevas TABLE (Plantilla uniqueidentifier NOT NULL, IdSite nvarchar(20) NOT NULL, CorreSite int NOT NULL, Cantidad decimal(18,4) NOT NULL);
    DECLARE @ord int, @sol nvarchar(50), @cod nvarchar(50), @lote nvarchar(50), @site nvarchar(20), @corre int, @cant decimal(18,4), @n int, @cor uniqueidentifier;

    -- Cod. 40: asigna N unidades por fila, prefiriendo las que ya estan en el site indicado.
    DECLARE c40 CURSOR LOCAL FAST_FORWARD FOR
      SELECT Ord, IdSolicitud, CodPap, IdSite, CorreSite, Cantidad FROM #s WHERE Estado = 'OK' AND Tipo = N'40' ORDER BY Ord;
    OPEN c40;
    FETCH NEXT FROM c40 INTO @ord, @sol, @cod, @site, @corre, @cant;
    WHILE @@FETCH_STATUS = 0
    BEGIN
      SET @n = CAST(@cant AS int);
      UPDATE l SET l.Asignado = 1, l.NuevoSite = @site, l.NuevoCorre = @corre
      FROM #lin l
      WHERE l.Correlativo IN (SELECT TOP (@n) p.Correlativo FROM #lin p
                              WHERE p.IdSolicitud = @sol AND p.CodPap = @cod AND p.IdEstado IN (0, 1) AND p.Asignado = 0
                              ORDER BY CASE WHEN p.IdSite = @site AND p.CorreSite = @corre THEN 0 ELSE 1 END, p.PedidoSap, p.Correlativo);
      FETCH NEXT FROM c40 INTO @ord, @sol, @cod, @site, @corre, @cant;
    END;
    CLOSE c40; DEALLOCATE c40;

    -- Cod. 10, paso 1: filas que ya coinciden exactamente con una linea (mismo site y cantidad) no cambian.
    DECLARE c10 CURSOR LOCAL FAST_FORWARD FOR
      SELECT Ord, IdSolicitud, CodPap, Lote, IdSite, CorreSite, Cantidad FROM #s WHERE Estado = 'OK' AND Tipo = N'10' ORDER BY Ord;
    OPEN c10;
    FETCH NEXT FROM c10 INTO @ord, @sol, @cod, @lote, @site, @corre, @cant;
    WHILE @@FETCH_STATUS = 0
    BEGIN
      SET @cor = (SELECT TOP 1 l.Correlativo FROM #lin l
                  WHERE l.IdSolicitud = @sol AND l.CodPap = @cod AND ISNULL(l.Lote, N'') = ISNULL(@lote, N'') AND l.Asignado = 0
                    AND l.IdSite = @site AND l.CorreSite = @corre AND l.CantSap = @cant ORDER BY l.Correlativo);
      IF @cor IS NOT NULL
      BEGIN
        UPDATE #lin SET Asignado = 1, NuevoSite = @site, NuevoCorre = @corre, NuevoCant = @cant WHERE Correlativo = @cor;
        UPDATE #s SET Resuelta = 1 WHERE Ord = @ord;
      END;
      FETCH NEXT FROM c10 INTO @ord, @sol, @cod, @lote, @site, @corre, @cant;
    END;
    CLOSE c10; DEALLOCATE c10;

    -- Cod. 10, paso 2: el resto de filas toma una linea libre (se actualiza) o, si no hay, se crea una nueva copiando una existente.
    DECLARE c10b CURSOR LOCAL FAST_FORWARD FOR
      SELECT Ord, IdSolicitud, CodPap, Lote, IdSite, CorreSite, Cantidad FROM #s WHERE Estado = 'OK' AND Tipo = N'10' AND Resuelta = 0 ORDER BY Ord;
    OPEN c10b;
    FETCH NEXT FROM c10b INTO @ord, @sol, @cod, @lote, @site, @corre, @cant;
    WHILE @@FETCH_STATUS = 0
    BEGIN
      SET @cor = (SELECT TOP 1 l.Correlativo FROM #lin l
                  WHERE l.IdSolicitud = @sol AND l.CodPap = @cod AND ISNULL(l.Lote, N'') = ISNULL(@lote, N'') AND l.Asignado = 0
                  ORDER BY l.Correlativo);
      IF @cor IS NOT NULL
        UPDATE #lin SET Asignado = 1, NuevoSite = @site, NuevoCorre = @corre, NuevoCant = @cant WHERE Correlativo = @cor;
      ELSE
        INSERT INTO @nuevas (Plantilla, IdSite, CorreSite, Cantidad)
        SELECT TOP 1 l.Correlativo, @site, @corre, @cant FROM #lin l
        WHERE l.IdSolicitud = @sol AND l.CodPap = @cod AND ISNULL(l.Lote, N'') = ISNULL(@lote, N'') ORDER BY l.Correlativo;
      FETCH NEXT FROM c10b INTO @ord, @sol, @cod, @lote, @site, @corre, @cant;
    END;
    CLOSE c10b; DEALLOCATE c10b;

    -- Cabeceras que faltan para los sites de destino (copia de la cabecera del mismo pedido).
    INSERT INTO dbo.CabLogistica
      (IdCliente, IdProyecto, IdSite, CorreSite, TipoTrabajo, PedidoSap, NroSolicitud, IdSolicitud, ObsSolicitud, Region, Oc,
       IdZona, NroGuia, Observacion, Usuario, FechaCreacion, HoraCreacion, IdSolicitante, IdEstado, NombreCliente, NombreProyecto, NombreTrabajo)
    SELECT c.IdCliente, c.IdProyecto, d.IdSite, d.CorreSite, c.TipoTrabajo, c.PedidoSap, c.NroSolicitud, c.IdSolicitud, c.ObsSolicitud, c.Region, c.Oc,
           c.IdZona, c.NroGuia, c.Observacion, @Usuario, @hoy, @ahora, c.IdSolicitante, c.IdEstado, c.NombreCliente, c.NombreProyecto, c.NombreTrabajo
    FROM (SELECT l.PedidoSap, l.NuevoSite AS IdSite, l.NuevoCorre AS CorreSite FROM #lin l WHERE l.Asignado = 1 AND l.NuevoSite IS NOT NULL
          UNION
          SELECT l.PedidoSap, n.IdSite, n.CorreSite FROM @nuevas n INNER JOIN #lin l ON l.Correlativo = n.Plantilla) d
    CROSS APPLY (SELECT TOP 1 * FROM dbo.CabLogistica x WHERE x.PedidoSap = d.PedidoSap ORDER BY x.FechaCreacion) c
    WHERE NOT EXISTS (SELECT 1 FROM dbo.CabLogistica y WHERE y.PedidoSap = d.PedidoSap AND y.IdSite = d.IdSite AND y.CorreSite = d.CorreSite);

    -- Lineas existentes: nuevo site y, en cod. 10, nueva cantidad.
    UPDATE t SET t.IdSite = l.NuevoSite, t.CorreSite = l.NuevoCorre, t.CantSap = ISNULL(l.NuevoCant, t.CantSap)
    FROM dbo.DetLogistica t INNER JOIN #lin l ON l.Correlativo = t.Correlativo
    WHERE l.Asignado = 1 AND (t.IdSite <> l.NuevoSite OR t.CorreSite <> l.NuevoCorre OR (l.NuevoCant IS NOT NULL AND t.CantSap <> l.NuevoCant));

    -- Lineas nuevas (cod. 10) copiando la existente de referencia.
    INSERT INTO dbo.DetLogistica
      (IdCliente, IdProyecto, IdSite, CorreSite, TipoTrabajo, PedidoSap, CodPap, Posicion, CantSap, Centro, Almacen, Lote,
       Usuario, Fecha, Hora, IdEstado, Observacion, Serie, FecIngreso, Guia, IdUbicacion, Region, Oc)
    SELECT t.IdCliente, t.IdProyecto, n.IdSite, n.CorreSite, t.TipoTrabajo, t.PedidoSap, t.CodPap, t.Posicion, n.Cantidad, t.Centro, t.Almacen, t.Lote,
           @Usuario, @hoy, @ahora, t.IdEstado, t.Observacion, t.Serie, t.FecIngreso, t.Guia, t.IdUbicacion, t.Region, t.Oc
    FROM @nuevas n INNER JOIN dbo.DetLogistica t ON t.Correlativo = n.Plantilla;

    -- Lineas sobrantes de cod. 10 (del mismo grupo): se anulan, no se borran.
    UPDATE t SET t.IdEstado = 99, t.Comentario = LTRIM(ISNULL(t.Comentario, N'') + N' ANULADA POR REASIGNACION')
    FROM dbo.DetLogistica t INNER JOIN #lin l ON l.Correlativo = t.Correlativo
    WHERE l.Asignado = 0 AND LEFT(l.CodPap, 2) = N'10'
      AND EXISTS (SELECT 1 FROM #s s WHERE s.Estado = 'OK' AND s.Tipo = N'10' AND s.IdSolicitud = l.IdSolicitud AND s.CodPap = l.CodPap
                  AND ISNULL(s.Lote, N'') = ISNULL(l.Lote, N''));

    -- Rastro en el log de detalle.
    INSERT INTO dbo.logDetLogistica
      (IdCliente, IdProyecto, IdSite, CorreSite, TipoTrabajo, PedidoSap, CodPap, Posicion, CantSap, Centro, Almacen, Lote,
       Usuario, Fecha, Hora, IdEstado, Observacion)
    SELECT t.IdCliente, t.IdProyecto, t.IdSite, t.CorreSite, t.TipoTrabajo, t.PedidoSap, t.CodPap, '', t.CantSap, '', '', '',
           @Usuario, @hoy, @ahora, t.IdEstado, CONCAT('REASIGNACION SECUNDARIO ', CONVERT(varchar(36), t.Correlativo))
    FROM dbo.DetLogistica t INNER JOIN #lin l ON l.Correlativo = t.Correlativo
    WHERE l.Asignado = 1;

    COMMIT TRANSACTION;
    SET @Aplicado = 1;
  END TRY
  BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
  END CATCH;

  SELECT Fila, Estado, Mensaje FROM #s ORDER BY Ord;
END;
GO
