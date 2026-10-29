/*
  Logistica de equipos - SOLICITUD y X APROBAR (pestanas Solicitud y x Aprobar del FrmLogistic_v1).
  PV: NO ejecutado ni probado contra la BD. Nombres de tablas/columnas tomados del sistema antiguo (DXAsignacion);
  validar en BD antes de desplegar: CabSolicitud, DetSolicitud, MovMaterial, Kardex, DetLogistica, Importar, Empleado,
  EmpleadoCjDetalle, Ubigeo, Constante (CORRELATIVO/1 = correlativo de solicitudes, FORMA_ENVIO).
  Requiere 01-05 (sp_Stock_Mover) y 07.

  Reglas del sistema antiguo que se conservan
   - Solicitud: nro = Constante CORRELATIVO/1 + 1; estado 9 (x aprobar) si algun material sale de otro site o no tiene
     linea de origen (o es AUTOPORTANTE); si todo sale del mismo site queda en 3 (sin aprobacion).
   - Aprobar: 9 -> 4 (cabecera y detalle), MovMaterial pasa a 4, las series asignadas quedan en 88.
   - Observar: 9 -> 6 exige observacion; las series vuelven a 2.

  Diferencias deliberadas (informadas al usuario)
   - Una transaccion por operacion; consultas parametrizadas.
   - El stock se mueve con sp_Stock_Mover segun LogisticaEtapaConfig: SOLICITAR Disponible -> Aprobado (estado 9) o
     Disponible -> Despachado (estado 3); APROBAR Aprobado -> Despachado; OBSERVAR Aprobado -> Disponible.
     El VB descontaba "solicitado" (que nunca sumaba) y al observar no liberaba nada.
   - Al aprobar el VB tomaba siempre la primera fila del detalle para el stock y contaba tambien las filas de origen
     (IdDespacho = 0); aqui se mueve cada fila de destino (IdDespacho = 1) una sola vez.
   - No se crea la CabSolicitud de origen (IdMovimiento = 2) que el VB insertaba solo si habia un unico material.
   - Solo cantidades enteras. No incluye "agregar detalles a una solicitud en x aprobar" ni el flujo de excedentes.
*/
SET NOCOUNT ON;
GO

/* ------------------------------------------------------------------------------------------------
   Catalogos: formas de envio, empleados de entrega/razon social (cargo 99), solicitantes (cargo 11), validadores (cargo 13).
------------------------------------------------------------------------------------------------ */
CREATE OR ALTER PROCEDURE dbo.sp_Logistica_Solicitud_Catalogos
AS
BEGIN
  SET NOCOUNT ON;

  SELECT CAST('FORMA_ENVIO' AS varchar(20)) AS Tipo, CAST(c.Correlativo AS int) AS Id,
         CAST(c.ValorIni AS nvarchar(200)) AS Nombre, CAST(NULL AS nvarchar(50)) AS Documento, CAST(NULL AS nvarchar(50)) AS Telefono
  FROM dbo.Constante c WHERE c.Campo = 'FORMA_ENVIO'
  UNION ALL
  SELECT 'ENTREGA', e.IdEmpleado, CAST(e.NombreEmpleado AS nvarchar(200)), CAST(e.NroDocumento AS nvarchar(50)), CAST(e.Telefono AS nvarchar(50))
  FROM dbo.Empleado e WHERE e.IdCargo = 99 AND e.IdEstado = 1
  UNION ALL
  SELECT 'SOLICITANTE', e.IdEmpleado, CAST(e.NombreEmpleado AS nvarchar(200)), CAST(e.NroDocumento AS nvarchar(50)), CAST(e.Telefono AS nvarchar(50))
  FROM dbo.Empleado e WHERE e.IdCargo = 11
  UNION ALL
  SELECT 'VALIDADOR', e.IdEmpleado, CAST(e.NombreEmpleado AS nvarchar(200)), CAST(e.NroDocumento AS nvarchar(50)), CAST(e.Telefono AS nvarchar(50))
  FROM dbo.Empleado e WHERE e.IdCargo = 13
  ORDER BY 1, 3;
END;
GO

-- sp_Logistica_Solicitud_Disponible vive en 12_sp_Logistica_Solicitud_Disponible.sql (filtra por cliente + proyecto + site).
GO

/* ------------------------------------------------------------------------------------------------
   Registrar solicitud. Items = [{"correlativo":"guid|null","codPap":"...","cantidad":1}]
   (correlativo = linea de DetLogistica de origen; vacio = sale del stock disponible sin linea de origen).
------------------------------------------------------------------------------------------------ */
CREATE OR ALTER PROCEDURE dbo.sp_Logistica_Solicitud_Registrar
  @IdCliente      int,
  @IdProyecto     int,
  @IdSite         nvarchar(50),
  @CorreSite      int,
  @TipoTrabajo    nvarchar(100),
  @IdSolicitante  int,
  @FormaEnvio     int,
  @RazonSocial    int,
  @Ubigeo         nvarchar(20),
  @Direccion      nvarchar(300),
  @Referencia     nvarchar(300) = NULL,
  @IdConEntrega1  int,
  @IdConEntrega2  int           = NULL,
  @ImagenSolicitud nvarchar(500) = NULL,
  @Items          nvarchar(max),
  @Usuario        nvarchar(50),
  @IdEmpleadoCj   int           = NULL,
  @NroSolicitud   nvarchar(50)  OUTPUT,
  @IdEstado       int           OUTPUT
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  IF OBJECT_ID(N'dbo.sp_Stock_Mover', N'P') IS NULL
    THROW 51201, 'Falta dbo.sp_Stock_Mover (ejecute los scripts de stock 01 a 05).', 1;

  DECLARE @ahora datetime = CONVERT(datetime, SYSDATETIMEOFFSET() AT TIME ZONE 'SA Pacific Standard Time');
  DECLARE @hoy date = CAST(@ahora AS date);
  SET @IdSite = LTRIM(RTRIM(@IdSite));
  SET @TipoTrabajo = LTRIM(RTRIM(@TipoTrabajo));

  DECLARE @t TABLE (Seq int IDENTITY(1,1) PRIMARY KEY, Correlativo uniqueidentifier NULL, CodPap nvarchar(50) NOT NULL, Cant decimal(18,4) NOT NULL);
  INSERT INTO @t (Correlativo, CodPap, Cant)
  SELECT TRY_CONVERT(uniqueidentifier, NULLIF(j.correlativo, N'')), LTRIM(RTRIM(j.codPap)), j.cantidad
  FROM OPENJSON(@Items) WITH (correlativo nvarchar(40) '$.correlativo', codPap nvarchar(50) '$.codPap', cantidad decimal(18,4) '$.cantidad') j
  WHERE j.cantidad > 0;

  IF NOT EXISTS (SELECT 1 FROM @t) THROW 51202, 'No hay materiales para solicitar.', 1;
  IF EXISTS (SELECT 1 FROM @t WHERE Cant <> FLOOR(Cant)) THROW 51206, 'Solo se aceptan cantidades enteras.', 1;
  IF ISNULL(@TipoTrabajo, N'') = N'' THROW 51208, 'Debe seleccionar el tipo de trabajo.', 1;
  IF NOT EXISTS (SELECT 1 FROM dbo.Importar i WHERE i.IdCliente = @IdCliente AND i.IdProyecto = @IdProyecto
                 AND i.IdSite = @IdSite AND i.Correlativo = @CorreSite AND i.IdEstado = 1)
    THROW 51207, 'La relacion cliente-proyecto-site no existe o no esta activa.', 1;
  IF NOT EXISTS (SELECT 1 FROM dbo.Empleado e WHERE e.IdEmpleado = @IdSolicitante) THROW 51209, 'Debe seleccionar el solicitante.', 1;
  IF ISNULL(@FormaEnvio, 0) = 0 OR ISNULL(@RazonSocial, 0) = 0 OR ISNULL(@Ubigeo, N'') = N'' OR ISNULL(LTRIM(RTRIM(@Direccion)), N'') = N''
    THROW 51210, 'Complete medio de envio, razon social, ubigeo y direccion de entrega.', 1;
  IF ISNULL(@IdConEntrega1, 0) = 0 THROW 51211, 'Debe registrar al menos un responsable de entrega.', 1;
  IF @IdConEntrega2 IS NOT NULL AND @IdConEntrega2 = @IdConEntrega1 THROW 51211, 'Los responsables de entrega deben ser distintos.', 1;

  -- El site destino no admite nuevas solicitudes si ya tiene procesos culminados (idbloqueo = 1).
  IF EXISTS (SELECT 1 FROM dbo.DetSolicitud ds WHERE ds.IdDespacho = 1 AND SUBSTRING(CAST(ds.CodPap AS nvarchar(50)), 1, 2) IN (N'10', N'40')
             AND ds.IdCliente = @IdCliente AND ds.IdSite = @IdSite AND ds.IdBloqueo = 1)
    THROW 51203, 'El site ya tiene procesos culminados. Consulte con Gerencia.', 1;

  IF EXISTS (SELECT 1 FROM @t x WHERE x.Correlativo IS NOT NULL AND NOT EXISTS
             (SELECT 1 FROM dbo.DetLogistica d WHERE d.Correlativo = x.Correlativo AND d.IdEstado = 2 AND CAST(d.CodPap AS nvarchar(50)) = x.CodPap))
    THROW 51204, 'Hay lineas que ya no estan validadas o no corresponden al material. Vuelva a consultar.', 1;
  IF EXISTS (SELECT 1 FROM @t x WHERE x.Correlativo IS NULL AND NOT EXISTS (SELECT 1 FROM dbo.Material m WHERE CAST(m.CodPap AS nvarchar(50)) = x.CodPap))
    THROW 51204, 'Hay materiales que no existen en el catalogo.', 1;
  IF EXISTS (SELECT 1
             FROM (SELECT Correlativo, SUM(Cant) AS Cant FROM @t WHERE Correlativo IS NOT NULL GROUP BY Correlativo) g
             INNER JOIN dbo.DetLogistica d ON d.Correlativo = g.Correlativo
             WHERE g.Cant > d.CantSap - ISNULL((SELECT SUM(ds.CantSap) FROM dbo.DetSolicitud ds
                                                WHERE ds.Correlativo = CONVERT(varchar(36), d.Correlativo)
                                                  AND ds.IdDespacho = 1 AND ds.IdEstado NOT IN (6, 19)), 0))
    THROW 51205, 'La cantidad solicitada supera el saldo de la linea. Vuelva a consultar.', 1;

  -- Estado 9 (x aprobar) si algun material sale de otro site, no tiene linea de origen o es autoportante.
  SET @IdEstado = CASE WHEN EXISTS (SELECT 1 FROM @t x
                                    LEFT JOIN dbo.DetLogistica d ON d.Correlativo = x.Correlativo
                                    LEFT JOIN dbo.Material m ON CAST(m.CodPap AS nvarchar(50)) = x.CodPap
                                    WHERE x.Correlativo IS NULL OR d.IdSite <> @IdSite OR d.CorreSite <> @CorreSite
                                       OR m.NombreMaterial LIKE N'%AUTOPORTANTE%')
                       THEN 9 ELSE 3 END;
  DECLARE @bucketDestino varchar(20) = CASE WHEN @IdEstado = 9 THEN 'Aprobado' ELSE 'Despachado' END;

  DECLARE @nombreCliente nvarchar(200) = (SELECT TOP 1 CAST(NombreCliente AS nvarchar(200)) FROM dbo.Cliente WHERE IdCliente = @IdCliente);
  DECLARE @nombreProyecto nvarchar(200) = (SELECT TOP 1 CAST(NombreProyecto AS nvarchar(200)) FROM dbo.Proyecto WHERE IdProyecto = @IdProyecto);
  DECLARE @pedidoCab nvarchar(50) = ISNULL((SELECT TOP 1 CAST(d.PedidoSap AS nvarchar(50)) FROM @t x
                                            INNER JOIN dbo.DetLogistica d ON d.Correlativo = x.Correlativo ORDER BY x.Seq), N'');

  BEGIN TRY
    BEGIN TRANSACTION;

    -- Correlativo de solicitudes (Constante CORRELATIVO/1), tomado con bloqueo para evitar duplicados.
    DECLARE @n bigint;
    UPDATE dbo.Constante WITH (UPDLOCK, ROWLOCK)
       SET @n = ISNULL(TRY_CONVERT(bigint, ValorFin), 0) + 1,
           ValorFin = CONVERT(nvarchar(50), ISNULL(TRY_CONVERT(bigint, ValorFin), 0) + 1)
     WHERE Campo = 'CORRELATIVO' AND Correlativo = 1;
    IF @@ROWCOUNT = 0 THROW 51212, 'No existe el correlativo de solicitudes en Constante (CORRELATIVO/1).', 1;
    SET @NroSolicitud = CONVERT(nvarchar(50), @n);

    INSERT INTO dbo.CabSolicitud
      (IdCliente, IdProyecto, IdSite, CorreSite, TipoTrabajo, PedidoSap, NroSolicitud, IdSolicitud, ObsSolicitud, Region, Oc, IdZona, NroGuia,
       Observacion, Usuario, FechaCreacion, HoraCreacion, IdEstado, NombreCliente, NombreProyecto, NombreTrabajo,
       FormaEnvio, RazonSocial, Ubigeo, Direccion, Referencia, IdConEntrega1, IdConEntrega2, IdSolicitante, IdMovimiento)
    VALUES
      (@IdCliente, @IdProyecto, @IdSite, @CorreSite, @TipoTrabajo, @pedidoCab, @NroSolicitud, '', '', '', '', 0, '',
       '', @Usuario, @hoy, @ahora, @IdEstado, @nombreCliente, @nombreProyecto, @TipoTrabajo,
       @FormaEnvio, @RazonSocial, @Ubigeo, @Direccion, ISNULL(@Referencia, N''), @IdConEntrega1, ISNULL(@IdConEntrega2, 0), @IdSolicitante, 1);

    -- Detalle de destino (IdDespacho = 1). Posicion = indice de la fila (0..n-1), como el sistema antiguo.
    INSERT INTO dbo.DetSolicitud
      (IdCliente, IdProyecto, IdSite, CorreSite, TipoTrabajo, PedidoSap, Correlativo, CodPap, Posicion, CantSap, Centro, Almacen, Lote,
       Usuario, Fecha, Hora, IdEstado, Observacion, NroEnvio, IdClienteOrigen, IdProyectoOrigen, IdSiteOrigen, CorreSiteOrigen,
       TipoTrabajoOrigen, NroSolicitud, Serie, IdDespacho, FechaSolicitud, IdRespSolicitud, FechaAprobar, ImagenSolicitud, CantDesp, IdBloqueo)
    SELECT @IdCliente, @IdProyecto, @IdSite, @CorreSite, @TipoTrabajo, ISNULL(d.PedidoSap, ''), ISNULL(CONVERT(varchar(36), x.Correlativo), ''),
           x.CodPap, CONVERT(varchar(20), x.Seq - 1), x.Cant, '', '', '',
           @Usuario, @hoy, @ahora, @IdEstado, '', 1, ISNULL(d.IdCliente, 0), ISNULL(d.IdProyecto, 0), ISNULL(d.IdSite, '0'), ISNULL(d.CorreSite, 0),
           ISNULL(d.TipoTrabajo, ''), @NroSolicitud, '', 1, @hoy, @IdSolicitante,
           CASE WHEN @IdEstado = 9 THEN CAST('20000101' AS date) ELSE @hoy END, ISNULL(@ImagenSolicitud, ''), x.Cant, 0
    FROM @t x
    LEFT JOIN dbo.DetLogistica d ON d.Correlativo = x.Correlativo;

    -- Fila espejo del site de origen (IdDespacho = 0), solo cuando la solicitud requiere aprobacion.
    IF @IdEstado = 9
      INSERT INTO dbo.DetSolicitud
        (IdCliente, IdProyecto, IdSite, CorreSite, TipoTrabajo, PedidoSap, Correlativo, CodPap, Posicion, CantSap, Centro, Almacen, Lote,
         Usuario, Fecha, Hora, IdEstado, Observacion, NroEnvio, IdClienteOrigen, IdProyectoOrigen, IdSiteOrigen, CorreSiteOrigen,
         TipoTrabajoOrigen, NroSolicitud, Serie, IdDespacho, FechaAprobar, CantDesp, IdBloqueo)
      SELECT ISNULL(d.IdCliente, 0), ISNULL(d.IdProyecto, 0), ISNULL(d.IdSite, '0'), ISNULL(d.CorreSite, 0), @TipoTrabajo,
             ISNULL(d.PedidoSap, ''), ISNULL(CONVERT(varchar(36), x.Correlativo), ''), x.CodPap, CONVERT(varchar(20), x.Seq - 1), x.Cant, '', '', '',
             @Usuario, @hoy, @ahora, @IdEstado, '', 1, @IdCliente, @IdProyecto, @IdSite, @CorreSite,
             @TipoTrabajo, @NroSolicitud, '', 0, CAST('20000101' AS date), x.Cant, 0
      FROM @t x
      LEFT JOIN dbo.DetLogistica d ON d.Correlativo = x.Correlativo;

    INSERT INTO dbo.MovMaterial
      (PedidoSap, Correlativo, Posicion, IdEstado, Usuario, Fecha, Hora, Observacion, CodPap, CantSap, NroSolicitud, IdMovimiento,
       IdCliente, IdProyecto, IdSite, CorreSite, TipoTrabajo, IdSolicitante)
    SELECT ISNULL(d.PedidoSap, ''), ISNULL(CONVERT(varchar(36), x.Correlativo), ''), CONVERT(varchar(20), x.Seq - 1), @IdEstado, @Usuario, @hoy, @ahora,
           '', x.CodPap, x.Cant, @NroSolicitud, 1, @IdCliente, @IdProyecto, @IdSite, @CorreSite, @TipoTrabajo, @IdSolicitante
    FROM @t x LEFT JOIN dbo.DetLogistica d ON d.Correlativo = x.Correlativo;

    IF @IdEstado = 9
      INSERT INTO dbo.MovMaterial
        (PedidoSap, Correlativo, Posicion, IdEstado, Usuario, Fecha, Hora, Observacion, CodPap, CantSap, NroSolicitud, IdMovimiento,
         IdCliente, IdProyecto, IdSite, CorreSite, TipoTrabajo)
      SELECT ISNULL(d.PedidoSap, ''), ISNULL(CONVERT(varchar(36), x.Correlativo), ''), CONVERT(varchar(20), x.Seq - 1), @IdEstado, @Usuario, @hoy, @ahora,
             '', x.CodPap, x.Cant, @NroSolicitud, 2, @IdCliente, @IdProyecto, @IdSite, @CorreSite, @TipoTrabajo
      FROM @t x LEFT JOIN dbo.DetLogistica d ON d.Correlativo = x.Correlativo;

    INSERT INTO dbo.Kardex
      (TipoMovimiento, CantSap, CodPap, CantAnterior, CantRestante, Observaciones, IdCliente, IdProyecto, IdSite, CorreSite,
       IdEmpleadoCj, Fecha, Hora, IdEstado, NroSolicitud, FilaSolicitud, Serie)
    SELECT 3, x.Cant, x.CodPap, 0, 0, 'SOLICITUD', @IdCliente, @IdProyecto, @IdSite, @CorreSite,
           @IdEmpleadoCj, @hoy, @ahora, 3, @NroSolicitud, x.Seq - 1, ''
    FROM @t x;

    -- Stock: Disponible -> Aprobado (x aprobar) o Disponible -> Despachado (sin aprobacion). Falla si no alcanza (51001).
    DECLARE @i int = 1, @max int = (SELECT MAX(Seq) FROM @t);
    DECLARE @cod nvarchar(50), @cant decimal(18,4), @corr nvarchar(50), @clave nvarchar(100), @pos nvarchar(50);
    WHILE @i <= @max
    BEGIN
      SELECT @cod = CodPap, @cant = Cant, @corr = CONVERT(nvarchar(50), Correlativo) FROM @t WHERE Seq = @i;
      SET @pos = CAST(@i - 1 AS nvarchar(50));
      SET @clave = CONCAT(N'SOLICITAR:', @NroSolicitud, N'|', @pos);
      EXEC dbo.sp_Stock_Mover
        @CodPap = @cod, @BucketOrigen = 'Disponible', @BucketDestino = @bucketDestino, @Cantidad = @cant,
        @Operacion = 'SOLICITAR', @NroSolicitud = @NroSolicitud, @Posicion = @pos, @CorrelativoDet = @corr,
        @IdEstadoDoc = @IdEstado, @Usuario = @Usuario, @IdEmpleadoCj = @IdEmpleadoCj, @Observacion = N'Solicitud de equipos',
        @ClaveIdempotencia = @clave;
      SET @i += 1;
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
   x Aprobar: solicitudes pendientes (estado 9), con filtro opcional por relacion cliente-proyecto-site.
------------------------------------------------------------------------------------------------ */
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
         a.IdEstado
  FROM dbo.CabSolicitud a
  OUTER APPLY (SELECT COUNT(*) AS Lineas, SUM(b.CantSap) AS Cantidad
               FROM dbo.DetSolicitud b
               WHERE b.NroSolicitud = a.NroSolicitud AND b.IdDespacho = 1 AND b.IdEstado = 9) det
  LEFT JOIN dbo.Cliente cl   ON cl.IdCliente = a.IdCliente
  LEFT JOIN dbo.Proyecto pr  ON pr.IdProyecto = a.IdProyecto
  LEFT JOIN dbo.Site s       ON s.IdSite = a.IdSite AND s.Correlativo = a.CorreSite
  LEFT JOIN dbo.Empleado sol ON sol.IdEmpleado = a.IdSolicitante
  LEFT JOIN dbo.Constante fe ON fe.Campo = 'FORMA_ENVIO' AND fe.Correlativo = a.FormaEnvio
  WHERE a.IdEstado = 9 AND ISNULL(det.Lineas, 0) > 0
    AND (@IdCliente IS NULL OR a.IdCliente = @IdCliente)
    AND (@IdProyecto IS NULL OR a.IdProyecto = @IdProyecto)
    AND (@IdSite IS NULL OR (a.IdSite = @IdSite AND a.CorreSite = ISNULL(@CorreSite, a.CorreSite)))
  ORDER BY a.FechaCreacion DESC, a.NroSolicitud DESC;
END;
GO

/* ------------------------------------------------------------------------------------------------
   Detalle de una solicitud (filas de destino, IdDespacho = 1).
------------------------------------------------------------------------------------------------ */
CREATE OR ALTER PROCEDURE dbo.sp_Logistica_Solicitud_Detalle
  @NroSolicitud nvarchar(50)
AS
BEGIN
  SET NOCOUNT ON;

  SELECT CAST(b.Posicion AS nvarchar(20))   AS Posicion,
         CAST(b.Correlativo AS nvarchar(50)) AS Correlativo,
         b.PedidoSap,
         CAST(b.CodPap AS nvarchar(50))     AS CodPap,
         m.NombreMaterial,
         m.UnidadMedida,
         CAST(b.CantSap AS decimal(18,4))   AS CantSap,
         CAST(b.Serie AS nvarchar(100))     AS Serie,
         b.IdEstado,
         e.ValorIni                         AS NomEstado,
         b.IdSiteOrigen,
         so.NombreSite                      AS NombreSiteOrigen
  FROM dbo.DetSolicitud b
  LEFT JOIN dbo.Material m   ON CAST(m.CodPap AS nvarchar(50)) = CAST(b.CodPap AS nvarchar(50))
  LEFT JOIN dbo.Constante e  ON e.Campo = 'ESTADO_LOG' AND e.Correlativo = b.IdEstado
  LEFT JOIN dbo.Site so      ON so.IdSite = b.IdSiteOrigen AND so.Correlativo = b.CorreSiteOrigen
  WHERE b.NroSolicitud = @NroSolicitud AND b.IdDespacho = 1
  ORDER BY TRY_CONVERT(int, b.Posicion);
END;
GO

/* ------------------------------------------------------------------------------------------------
   Aprobar u observar solicitudes en estado 9. Items = [{"nroSolicitud":"123"}].
   @Accion = APROBAR (exige validador) | OBSERVAR (exige observacion).
------------------------------------------------------------------------------------------------ */
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
  IF EXISTS (SELECT 1 FROM @s x WHERE NOT EXISTS (SELECT 1 FROM dbo.CabSolicitud a WHERE a.NroSolicitud = x.Nro AND a.IdEstado = 9))
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

/* ------------------------------------------------------------------------------------------------
   Datos de cabecera de la solicitud para el PDF y el correo (el detalle sale de sp_Logistica_Solicitud_Detalle).
------------------------------------------------------------------------------------------------ */
CREATE OR ALTER PROCEDURE dbo.sp_Logistica_Solicitud_Correo
  @NroSolicitud nvarchar(50)
AS
BEGIN
  SET NOCOUNT ON;

  SELECT TOP 1
         CAST(a.NroSolicitud AS nvarchar(50))   AS NroSolicitud,
         a.IdEstado,
         cl.NombreCliente, pr.NombreProyecto,
         CAST(a.IdSite AS nvarchar(50))         AS IdSite,
         s.NombreSite,
         CAST(a.TipoTrabajo AS nvarchar(100))   AS TipoTrabajo,
         sol.NombreEmpleado                     AS Solicitante,
         CAST(sol.Correo AS nvarchar(200))      AS SolicitanteCorreo,
         CAST(ISNULL(cj.IdAreaCj, 0) AS int)    AS AreaCj,
         fe.ValorIni                            AS FormaEnvio,
         rs.NombreEmpleado                      AS RazonSocial,
         u.NombreUbigeo                         AS Ubigeo,
         CAST(a.Direccion AS nvarchar(300))     AS Direccion,
         CAST(a.Referencia AS nvarchar(300))    AS Referencia,
         CAST(a.Observacion AS nvarchar(500))   AS Observacion,
         a.FechaCreacion,
         CAST(a.Usuario AS nvarchar(50))        AS Usuario,
         e1.NombreEmpleado                      AS Entrega1,
         e2.NombreEmpleado                      AS Entrega2
  FROM dbo.CabSolicitud a
  LEFT JOIN dbo.Cliente cl            ON cl.IdCliente = a.IdCliente
  LEFT JOIN dbo.Proyecto pr           ON pr.IdProyecto = a.IdProyecto
  LEFT JOIN dbo.Site s                ON s.IdSite = a.IdSite AND s.Correlativo = a.CorreSite
  LEFT JOIN dbo.Empleado sol          ON sol.IdEmpleado = a.IdSolicitante
  LEFT JOIN dbo.EmpleadoCjDetalle cj  ON cj.IdEmpleadoCj = sol.IdEmpleadoCj
  LEFT JOIN dbo.Constante fe          ON fe.Campo = 'FORMA_ENVIO' AND fe.Correlativo = a.FormaEnvio
  LEFT JOIN dbo.Empleado rs           ON rs.IdEmpleado = a.RazonSocial
  LEFT JOIN dbo.Ubigeo u              ON CAST(u.CodUbigeo AS nvarchar(20)) = CAST(a.Ubigeo AS nvarchar(20))
  LEFT JOIN dbo.Empleado e1           ON e1.IdEmpleado = a.IdConEntrega1
  LEFT JOIN dbo.Empleado e2           ON e2.IdEmpleado = a.IdConEntrega2
  WHERE a.NroSolicitud = @NroSolicitud;
END;
GO
