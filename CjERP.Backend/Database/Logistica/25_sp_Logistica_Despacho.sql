/*
  Logistica de equipos - X DESPACHAR (pestana "x Despachar" del FrmLogistic_v1).
  PV: NO ejecutado ni probado contra la BD. Requiere 01-05 (sp_Stock_Mover) y 24 (sp_Logistica_Auditar; EJECUTAR 24 ANTES).
  ALCANCE (migracion parcial): la CONSULTA muestra solicitudes de ambos sistemas (columna EsSistemaNuevo; filtro @Origen). Solo se
  puede OPERAR (despachar / rechazar) las del sistema nuevo, CabSolicitud.IdWeb = 1. Las demas (IdWeb NULL) siguen en el sistema
  antiguo y Grabar/Rechazar las rechazan (51412 / 51425) para no doble-procesar ni tocar un stock que el nuevo no lleva.
  Reglas fuente: docs/mobile/despachos-reglas-legado.md (secciones 1 a 6). Decisiones aprobadas el 2026-11-26:
    - Se puede despachar MENOS de lo pedido; la diferencia vuelve a Disponible (Despachado -> Disponible).
    - La imagen es obligatoria para despachar, en todos los materiales.
    - El rechazo en despacho exige motivo.

  Etapas de LogisticaEtapaConfig:
    DESPACHAR       estados 3 y 4 -> 5   Despachado -> Enviado
    RECHAZAR_DESP   estados 3 y 4 -> 6   Despachado -> Disponible

  Diferencias deliberadas respecto al sistema antiguo (documentadas en docs/mobile/despachos-reglas-legado.md, seccion 8):
   - Una transaccion por operacion; la cabecera se recalcula por solicitud (el VB solo actualizaba la de la primera linea).
   - La diferencia de cantidad SI se devuelve a Disponible (en el VB esa rama nunca se ejecutaba).
   - El rechazo SI mueve stock y la serie liberada queda libre (el VB la volvia a marcar como en uso).
   - Kardex con el IdSite correcto (el VB guardaba el id de proyecto).
   - Series: solo materiales 40 (equipos) llevan serie; la serie debe estar libre (DetLogistica.IdEstado = 2) o ser la ya
     asignada a la propia linea (88). Al cambiar de serie se libera la anterior (88 -> 2) y se bloquea la nueva (2 -> 88).
*/
SET NOCOUNT ON;
GO

/* ------------------------------------------------------------------------------------------------
   Consulta: lineas pendientes de despachar (estado 3 o 4, destino IdDespacho = 1) con filtros opcionales.
------------------------------------------------------------------------------------------------ */
CREATE OR ALTER PROCEDURE dbo.sp_Logistica_Despacho_Consultar
  @Solicitudes nvarchar(max) = NULL,   -- lista separada por comas
  @FechaIni    date          = NULL,   -- sobre CabSolicitud.FechaCreacion
  @FechaFin    date          = NULL,
  @IdCliente   int           = NULL,
  @IdProyecto  int           = NULL,
  @IdSite      nvarchar(50)  = NULL,
  @CorreSite   int           = NULL,
  @Origen      varchar(10)   = NULL    -- 'NUEVO' (IdWeb = 1), 'ANTIGUO' (IdWeb NULL); NULL = ambos
AS
BEGIN
  SET NOCOUNT ON;

  SET @Solicitudes = NULLIF(LTRIM(RTRIM(@Solicitudes)), N'');
  SET @IdSite = NULLIF(LTRIM(RTRIM(@IdSite)), N'');

  DECLARE @sol TABLE (Nro nvarchar(50) PRIMARY KEY);
  IF @Solicitudes IS NOT NULL
    INSERT INTO @sol (Nro)
    SELECT DISTINCT LTRIM(RTRIM(x.value)) FROM STRING_SPLIT(@Solicitudes, N',') x WHERE LTRIM(RTRIM(x.value)) <> N'';

  SELECT TOP (5000)
         CAST(b.NroSolicitud AS nvarchar(50))   AS NroSolicitud,
         CAST(b.PedidoSap AS nvarchar(50))      AS PedidoSap,
         CAST(b.Correlativo AS nvarchar(50))    AS Correlativo,
         CAST(b.Posicion AS nvarchar(20))       AS Posicion,
         CAST(b.CodPap AS nvarchar(50))         AS CodPap,
         m.NombreMaterial,
         m.UnidadMedida,
         CAST(CASE WHEN LEFT(CAST(b.CodPap AS nvarchar(50)), 2) = N'40' THEN 1 ELSE 0 END AS bit) AS EsEquipo,
         CAST(b.CantSap AS decimal(18,4))       AS CantSap,
         CAST(b.Serie AS nvarchar(100))         AS Serie,
         CAST(b.Observacion AS nvarchar(500))   AS Observacion,
         CAST(b.RutaImagen AS nvarchar(500))    AS RutaImagen,
         b.IdEstado,
         e.Nombre                               AS NomEstado,
         b.IdCliente, b.IdProyecto,
         CAST(b.IdSite AS nvarchar(50))         AS IdSite,
         b.CorreSite,
         CAST(b.TipoTrabajo AS nvarchar(100))   AS TipoTrabajo,
         s.NombreSite,
         pr.NombreProyecto,
         cl.NombreCliente,
         a.FechaCreacion,
         o.Nuevo                                AS EsSistemaNuevo
  FROM dbo.DetSolicitud b
  OUTER APPLY (SELECT TOP (1) c.FechaCreacion
               FROM dbo.CabSolicitud c
               WHERE c.NroSolicitud = b.NroSolicitud
               ORDER BY CASE WHEN c.IdMovimiento = 1 THEN 0 ELSE 1 END) a
  OUTER APPLY (SELECT CAST(CASE WHEN EXISTS (SELECT 1 FROM dbo.CabSolicitud w WHERE w.NroSolicitud = b.NroSolicitud AND w.IdWeb = 1)
                                THEN 1 ELSE 0 END AS bit) AS Nuevo) o
  LEFT JOIN dbo.Material m  ON CAST(m.CodPap AS nvarchar(50)) = CAST(b.CodPap AS nvarchar(50))
  LEFT JOIN (SELECT TRY_CONVERT(int, c.Correlativo) AS IdEstado, MAX(c.ValorFin) AS Nombre
             FROM dbo.Constante c
             WHERE c.Campo = 'ESTADO_LOG' AND TRY_CONVERT(int, c.Correlativo) IS NOT NULL
             GROUP BY TRY_CONVERT(int, c.Correlativo)) e ON e.IdEstado = b.IdEstado
  LEFT JOIN dbo.Site s      ON s.IdSite = b.IdSite AND s.Correlativo = b.CorreSite
  LEFT JOIN dbo.Proyecto pr ON pr.IdProyecto = b.IdProyecto
  LEFT JOIN dbo.Cliente cl  ON cl.IdCliente = b.IdCliente
  WHERE b.IdDespacho = 1
    AND b.IdEstado IN (3, 4)
    -- Migracion parcial: se LEEN las solicitudes de ambos sistemas (EsSistemaNuevo indica el origen); solo las del nuevo (IdWeb = 1)
    -- se pueden despachar o rechazar (lo exigen los SP Grabar y Rechazar).
    AND (@Origen IS NULL OR (@Origen = 'NUEVO' AND o.Nuevo = 1) OR (@Origen = 'ANTIGUO' AND o.Nuevo = 0))
    AND (@Solicitudes IS NULL OR CAST(b.NroSolicitud AS nvarchar(50)) IN (SELECT Nro FROM @sol))
    AND (@IdCliente IS NULL OR b.IdCliente = @IdCliente)
    AND (@IdProyecto IS NULL OR b.IdProyecto = @IdProyecto)
    AND (@IdSite IS NULL OR (b.IdSite = @IdSite AND b.CorreSite = ISNULL(@CorreSite, b.CorreSite)))
    AND (@FechaIni IS NULL OR CAST(a.FechaCreacion AS date) >= @FechaIni)
    AND (@FechaFin IS NULL OR CAST(a.FechaCreacion AS date) <= @FechaFin)
  ORDER BY b.IdSite, b.CorreSite, b.NroSolicitud, b.CodPap, TRY_CONVERT(int, b.Posicion)
  OPTION (RECOMPILE);
END;
GO

/* ------------------------------------------------------------------------------------------------
   Series disponibles de un material (solo equipos 40): DetLogistica validadas (IdEstado = 2), sin 'NO APLICA'.
------------------------------------------------------------------------------------------------ */
CREATE OR ALTER PROCEDURE dbo.sp_Logistica_Despacho_Series
  @CodPap nvarchar(50),
  @Buscar nvarchar(100) = NULL
AS
BEGIN
  SET NOCOUNT ON;
  SET @Buscar = NULLIF(LTRIM(RTRIM(@Buscar)), N'');

  SELECT TOP (200)
         CAST(l.Serie AS nvarchar(100))    AS Serie,
         CAST(l.PedidoSap AS nvarchar(50)) AS PedidoSap,
         CAST(l.IdSite AS nvarchar(50))    AS IdSite
  FROM dbo.DetLogistica l
  WHERE CAST(l.CodPap AS nvarchar(50)) = @CodPap
    AND l.IdEstado = 2
    AND LEN(ISNULL(l.Serie, N'')) > 0
    AND l.Serie <> N'NO APLICA'
    AND (@Buscar IS NULL OR l.Serie LIKE N'%' + @Buscar + N'%')
  ORDER BY l.Serie;
END;
GO

/* ------------------------------------------------------------------------------------------------
   Despachar.
   @Items = [{"nroSolicitud":"123","posicion":"0","serie":"ABC","cantidad":2,"rutaImagen":"...","observacion":"..."}]
   cantidad opcional (por defecto la pedida); 0 < cantidad <= pedida; los equipos (40) se despachan completos.
   rutaImagen obligatoria. serie obligatoria en equipos (40).
   @IdResponsable = empleado que despacha (queda en DetSolicitud.IdRespDespacho y CabSolicitud.IdDespachador).
------------------------------------------------------------------------------------------------ */
CREATE OR ALTER PROCEDURE dbo.sp_Logistica_Despacho_Grabar
  @Items          nvarchar(max),
  @Usuario        nvarchar(50),
  @IdEmpleadoCj   int = NULL,
  @IdResponsable  int = NULL,
  @Procesadas     int OUTPUT,
  @ConDiferencia  int OUTPUT
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  IF OBJECT_ID(N'dbo.sp_Stock_Mover', N'P') IS NULL
    THROW 51400, 'Falta dbo.sp_Stock_Mover (ejecute los scripts de stock 01 a 05).', 1;
  IF OBJECT_ID(N'dbo.sp_Logistica_Auditar', N'P') IS NULL
    THROW 51401, 'Falta dbo.sp_Logistica_Auditar (ejecute el script 24).', 1;

  DECLARE @ahora datetime = CONVERT(datetime, SYSDATETIMEOFFSET() AT TIME ZONE 'SA Pacific Standard Time');
  DECLARE @hoy date = CAST(@ahora AS date);

  CREATE TABLE #Aud (Entidad nvarchar(100), IdRegistro nvarchar(100), Seccion nvarchar(100) NULL, Campo nvarchar(100),
                     ValorAnterior nvarchar(max) NULL, ValorNuevo nvarchar(max) NULL);

  DECLARE @j TABLE (Nro nvarchar(50), Pos nvarchar(20), Serie nvarchar(100), Cant decimal(18,4), Ruta nvarchar(500), Obs nvarchar(500));
  INSERT INTO @j (Nro, Pos, Serie, Cant, Ruta, Obs)
  SELECT LTRIM(RTRIM(j.nroSolicitud)), LTRIM(RTRIM(j.posicion)), NULLIF(LTRIM(RTRIM(j.serie)), N''), j.cantidad,
         NULLIF(LTRIM(RTRIM(j.rutaImagen)), N''), NULLIF(LTRIM(RTRIM(j.observacion)), N'')
  FROM OPENJSON(@Items) WITH (nroSolicitud nvarchar(50) '$.nroSolicitud', posicion nvarchar(20) '$.posicion',
                              serie nvarchar(100) '$.serie', cantidad decimal(18,4) '$.cantidad',
                              rutaImagen nvarchar(500) '$.rutaImagen', observacion nvarchar(500) '$.observacion') j;

  IF NOT EXISTS (SELECT 1 FROM @j) THROW 51402, 'No hay registros seleccionados.', 1;
  IF EXISTS (SELECT 1 FROM @j GROUP BY Nro, Pos HAVING COUNT(*) > 1)
    THROW 51403, 'Hay lineas repetidas en la solicitud de despacho.', 1;
  IF EXISTS (SELECT 1 FROM @j WHERE Ruta IS NULL)
    THROW 51404, 'La imagen es obligatoria para despachar.', 1;
  -- DetSolicitud.RutaImagen es nvarchar(150) (verificado en la BD el 2026-11-26): una ruta mas larga se truncaria o fallaria.
  IF EXISTS (SELECT 1 FROM @j WHERE LEN(Ruta) > 150)
    THROW 51411, 'La ruta de la imagen supera los 150 caracteres que admite DetSolicitud.RutaImagen.', 1;
  IF EXISTS (SELECT 1 FROM @j x WHERE NOT EXISTS
             (SELECT 1 FROM dbo.DetSolicitud b WHERE CAST(b.NroSolicitud AS nvarchar(50)) = x.Nro
                AND CAST(b.Posicion AS nvarchar(20)) = x.Pos AND b.IdDespacho = 1 AND b.IdEstado IN (3, 4)))
    THROW 51405, 'Hay registros que ya no estan pendientes de despacho. Vuelva a consultar.', 1;

  DECLARE @m TABLE (
    Id int IDENTITY(1,1) PRIMARY KEY,
    Nro nvarchar(50) NOT NULL, Pos nvarchar(20) NOT NULL, Corr nvarchar(50) NOT NULL, CodPap nvarchar(50) NOT NULL,
    EsEquipo bit NOT NULL, CantPed decimal(18,4) NOT NULL, Conf decimal(18,4) NOT NULL, Dif decimal(18,4) NOT NULL,
    SerieAnt nvarchar(100) NULL, SerieNueva nvarchar(100) NULL, Ruta nvarchar(500) NOT NULL, Obs nvarchar(500) NULL, ObsAnt nvarchar(500) NULL,
    EstadoAnt int NOT NULL, RutaAnt nvarchar(500) NULL,
    IdCliente int NULL, IdProyecto int NULL, IdSite nvarchar(50) NULL, CorreSite int NULL, TipoTrabajo nvarchar(100) NULL, PedidoSap nvarchar(50) NULL);

  INSERT INTO @m (Nro, Pos, Corr, CodPap, EsEquipo, CantPed, Conf, Dif, SerieAnt, SerieNueva, Ruta, Obs, ObsAnt, EstadoAnt, RutaAnt,
                  IdCliente, IdProyecto, IdSite, CorreSite, TipoTrabajo, PedidoSap)
  SELECT x.Nro, x.Pos, CAST(b.Correlativo AS nvarchar(50)), CAST(b.CodPap AS nvarchar(50)),
         CAST(CASE WHEN LEFT(CAST(b.CodPap AS nvarchar(50)), 2) = N'40' THEN 1 ELSE 0 END AS bit),
         b.CantSap, ISNULL(x.Cant, b.CantSap), b.CantSap - ISNULL(x.Cant, b.CantSap),
         NULLIF(CAST(b.Serie AS nvarchar(100)), N''), x.Serie, x.Ruta, x.Obs, CAST(b.Observacion AS nvarchar(500)),
         b.IdEstado, CAST(b.RutaImagen AS nvarchar(500)),
         b.IdCliente, b.IdProyecto, CAST(b.IdSite AS nvarchar(50)), b.CorreSite, CAST(b.TipoTrabajo AS nvarchar(100)), CAST(b.PedidoSap AS nvarchar(50))
  FROM @j x
  INNER JOIN dbo.DetSolicitud b ON CAST(b.NroSolicitud AS nvarchar(50)) = x.Nro AND CAST(b.Posicion AS nvarchar(20)) = x.Pos
                               AND b.IdDespacho = 1 AND b.IdEstado IN (3, 4);

  IF EXISTS (SELECT 1 FROM @m m WHERE NOT EXISTS (SELECT 1 FROM dbo.CabSolicitud w WHERE w.NroSolicitud = m.Nro AND w.IdWeb = 1))
    THROW 51412, 'Solo se pueden despachar solicitudes del sistema nuevo (IdWeb = 1). Las del sistema antiguo se despachan en el sistema antiguo.', 1;
  IF EXISTS (SELECT 1 FROM @m WHERE Conf <= 0 OR Conf > CantPed)
    THROW 51406, 'La cantidad a despachar debe ser mayor que 0 y no superar la cantidad pedida. Para no despachar una linea, rechacela.', 1;
  IF EXISTS (SELECT 1 FROM @m WHERE EsEquipo = 1 AND Conf <> CantPed)
    THROW 51407, 'Los equipos (codigo 40) se despachan completos: no admiten cantidad parcial.', 1;
  IF EXISTS (SELECT 1 FROM @m WHERE EsEquipo = 1 AND SerieNueva IS NULL)
    THROW 51408, 'Los equipos (codigo 40) requieren serie para despachar.', 1;
  IF EXISTS (SELECT 1 FROM @m WHERE SerieNueva IS NOT NULL AND EsEquipo = 1 GROUP BY SerieNueva, CodPap HAVING COUNT(*) > 1)
    THROW 51409, 'Hay series repetidas en el despacho.', 1;

  BEGIN TRY
    BEGIN TRANSACTION;

    -- Series (equipos): la serie debe estar libre (2) o ser la ya asignada a la propia linea (88). Se valida bloqueando.
    IF EXISTS (SELECT 1 FROM @m m WHERE m.EsEquipo = 1 AND NOT EXISTS
               (SELECT 1 FROM dbo.DetLogistica l WITH (UPDLOCK, HOLDLOCK)
                WHERE l.Serie = m.SerieNueva AND CAST(l.CodPap AS nvarchar(50)) = m.CodPap
                  AND (l.IdEstado = 2 OR (l.IdEstado = 88 AND m.SerieAnt = m.SerieNueva))))
      THROW 51410, 'Hay series que no pertenecen al material o no estan disponibles.', 1;

    -- Libera la serie anterior (88 -> 2) cuando se cambia; bloquea la nueva (2 -> 88).
    UPDATE l SET l.IdEstado = 2
    FROM dbo.DetLogistica l
    INNER JOIN @m m ON l.Serie = m.SerieAnt AND CAST(l.CodPap AS nvarchar(50)) = m.CodPap
    WHERE m.EsEquipo = 1 AND m.SerieAnt IS NOT NULL AND m.SerieAnt <> m.SerieNueva AND l.IdEstado = 88;

    UPDATE l SET l.IdEstado = 88
    FROM dbo.DetLogistica l
    INNER JOIN @m m ON l.Serie = m.SerieNueva AND CAST(l.CodPap AS nvarchar(50)) = m.CodPap
    WHERE m.EsEquipo = 1 AND l.IdEstado = 2;

    UPDATE b
       SET b.IdEstado = 5, b.RutaImagen = m.Ruta, b.FechaDespacho = @hoy, b.IdRespDespacho = @IdResponsable,
           b.CantDesp = m.Conf, b.CantSap = m.Conf,
           b.Serie = CASE WHEN m.EsEquipo = 1 THEN m.SerieNueva ELSE b.Serie END,
           b.Observacion = COALESCE(m.Obs, b.Observacion)
    FROM dbo.DetSolicitud b
    INNER JOIN @m m ON CAST(b.NroSolicitud AS nvarchar(50)) = m.Nro AND CAST(b.Posicion AS nvarchar(20)) = m.Pos
                   AND b.IdDespacho = 1 AND b.IdEstado IN (3, 4);

    -- Auditoria de los UPDATE (no de los INSERT) via dbo.sp_Logistica_Auditar (script 24).
    INSERT INTO #Aud (Entidad, IdRegistro, Seccion, Campo, ValorAnterior, ValorNuevo)
    SELECT N'DetSolicitud', CONCAT(m.Nro, N'-', m.Pos), N'DESPACHO', v.Campo, v.Ant, v.Nue
    FROM @m m
    CROSS APPLY (VALUES (N'IdEstado', CONVERT(nvarchar(50), m.EstadoAnt), CONVERT(nvarchar(50), 5)),
                        (N'CantSap', CONVERT(nvarchar(50), m.CantPed), CONVERT(nvarchar(50), m.Conf)),
                        (N'Serie', m.SerieAnt, CASE WHEN m.EsEquipo = 1 THEN m.SerieNueva ELSE m.SerieAnt END),
                        (N'RutaImagen', m.RutaAnt, m.Ruta),
                        (N'Observacion', m.ObsAnt, COALESCE(m.Obs, m.ObsAnt))) v (Campo, Ant, Nue);

    -- Cabecera: 5 cuando ya no quedan lineas por despachar (3/4) y hay despachadas; si no, no cambia el estado.
    UPDATE a
       SET a.IdEstado = x.Nuevo, a.IdDespachador = @IdResponsable
    OUTPUT N'CabSolicitud', CONVERT(nvarchar(100), inserted.NroSolicitud), N'DESPACHO', N'IdEstado',
           CONVERT(nvarchar(50), deleted.IdEstado), CONVERT(nvarchar(50), inserted.IdEstado)
      INTO #Aud (Entidad, IdRegistro, Seccion, Campo, ValorAnterior, ValorNuevo)
    FROM dbo.CabSolicitud a
    CROSS APPLY (SELECT CASE
        WHEN EXISTS (SELECT 1 FROM dbo.DetSolicitud d WHERE d.NroSolicitud = a.NroSolicitud AND d.IdDespacho = 1 AND d.IdEstado IN (3, 4)) THEN a.IdEstado
        WHEN EXISTS (SELECT 1 FROM dbo.DetSolicitud d WHERE d.NroSolicitud = a.NroSolicitud AND d.IdDespacho = 1 AND d.IdEstado = 5) THEN 5
        ELSE a.IdEstado END AS Nuevo) x
    WHERE CAST(a.NroSolicitud AS nvarchar(50)) IN (SELECT Nro FROM @m);

    EXEC dbo.sp_Logistica_Auditar @Usuario = @Usuario;

    INSERT INTO dbo.MovMaterial
      (PedidoSap, Correlativo, Posicion, IdEstado, Usuario, Fecha, Hora, Observacion, CodPap, CantSap, NroSolicitud, IdMovimiento,
       IdCliente, IdProyecto, IdSite, CorreSite, TipoTrabajo, IdSolicitante)
    SELECT ISNULL(m.PedidoSap, ''), m.Corr, m.Pos, 5, @Usuario, @hoy, @ahora, ISNULL(m.Obs, ''), m.CodPap, m.Conf, m.Nro, 1,
           m.IdCliente, m.IdProyecto, m.IdSite, m.CorreSite, m.TipoTrabajo, @IdResponsable
    FROM @m m;

    INSERT INTO dbo.MovMaterial
      (PedidoSap, Correlativo, Posicion, IdEstado, Usuario, Fecha, Hora, Observacion, CodPap, CantSap, NroSolicitud, IdMovimiento,
       IdCliente, IdProyecto, IdSite, CorreSite, TipoTrabajo, IdSolicitante)
    SELECT ISNULL(m.PedidoSap, ''), m.Corr, m.Pos, 5, @Usuario, @hoy, @ahora, ISNULL(m.Obs, ''), m.CodPap, m.Dif, m.Nro, 3,
           m.IdCliente, m.IdProyecto, m.IdSite, m.CorreSite, m.TipoTrabajo, @IdResponsable
    FROM @m m WHERE m.Dif > 0;

    INSERT INTO dbo.Kardex
      (TipoMovimiento, CantSap, CodPap, CantAnterior, CantRestante, Observaciones, IdCliente, IdProyecto, IdSite, CorreSite,
       IdEmpleadoCj, Fecha, Hora, IdEstado, NroSolicitud, FilaSolicitud, Serie)
    SELECT 3, m.Conf, m.CodPap, 0, 0, 'DESPACHADO', m.IdCliente, m.IdProyecto, m.IdSite, m.CorreSite,
           @IdEmpleadoCj, @hoy, @ahora, m.EstadoAnt, m.Nro, TRY_CONVERT(int, m.Pos), ISNULL(m.SerieNueva, ISNULL(m.SerieAnt, ''))
    FROM @m m;

    INSERT INTO dbo.Kardex
      (TipoMovimiento, CantSap, CodPap, CantAnterior, CantRestante, Observaciones, IdCliente, IdProyecto, IdSite, CorreSite,
       IdEmpleadoCj, Fecha, Hora, IdEstado, NroSolicitud, FilaSolicitud, Serie)
    SELECT 3, m.Dif, m.CodPap, 0, 0, 'DEV-DESPACHADO', m.IdCliente, m.IdProyecto, m.IdSite, m.CorreSite,
           @IdEmpleadoCj, @hoy, @ahora, m.EstadoAnt, m.Nro, TRY_CONVERT(int, m.Pos), ISNULL(m.SerieNueva, ISNULL(m.SerieAnt, ''))
    FROM @m m WHERE m.Dif > 0;

    -- Stock: lo despachado Despachado -> Enviado; la diferencia Despachado -> Disponible. Falla si no alcanza (51001).
    DECLARE @i int = 1, @max int = (SELECT MAX(Id) FROM @m);
    DECLARE @cod nvarchar(50), @conf decimal(18,4), @dif decimal(18,4), @nro nvarchar(50), @pos nvarchar(20),
            @corr nvarchar(50), @serie nvarchar(100), @obs nvarchar(500), @clave nvarchar(100);
    WHILE @i <= @max
    BEGIN
      SELECT @cod = CodPap, @conf = Conf, @dif = Dif, @nro = Nro, @pos = Pos, @corr = Corr,
             @serie = ISNULL(SerieNueva, SerieAnt), @obs = Obs
      FROM @m WHERE Id = @i;

      SET @clave = CONCAT(N'DESPACHAR:', @nro, N'|', @pos);
      EXEC dbo.sp_Stock_Mover
        @CodPap = @cod, @BucketOrigen = 'Despachado', @BucketDestino = 'Enviado', @Cantidad = @conf,
        @Operacion = 'DESPACHAR', @Serie = @serie, @NroSolicitud = @nro, @Posicion = @pos, @CorrelativoDet = @corr,
        @IdEstadoDoc = 5, @Usuario = @Usuario, @IdEmpleadoCj = @IdEmpleadoCj, @Observacion = @obs,
        @ClaveIdempotencia = @clave;

      IF @dif > 0
      BEGIN
        SET @clave = CONCAT(N'DESPACHAR_DIF:', @nro, N'|', @pos);
        EXEC dbo.sp_Stock_Mover
          @CodPap = @cod, @BucketOrigen = 'Despachado', @BucketDestino = 'Disponible', @Cantidad = @dif,
          @Operacion = 'DESPACHAR_DIF', @Serie = @serie, @NroSolicitud = @nro, @Posicion = @pos, @CorrelativoDet = @corr,
          @IdEstadoDoc = 5, @Usuario = @Usuario, @IdEmpleadoCj = @IdEmpleadoCj, @Observacion = @obs,
          @ClaveIdempotencia = @clave;
      END;

      SET @i += 1;
    END;

    SET @Procesadas = (SELECT COUNT(*) FROM @m);
    SET @ConDiferencia = (SELECT COUNT(*) FROM @m WHERE Dif > 0);
    COMMIT TRANSACTION;
  END TRY
  BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
  END CATCH;
END;
GO

/* ------------------------------------------------------------------------------------------------
   Rechazar en despacho (estado 6). El motivo es obligatorio.
   @Items = [{"nroSolicitud":"123","posicion":"0"}]
   Efecto: la linea pasa a 6, su stock vuelve Despachado -> Disponible y la serie bloqueada (88) queda libre (2).
------------------------------------------------------------------------------------------------ */
CREATE OR ALTER PROCEDURE dbo.sp_Logistica_Despacho_Rechazar
  @Items         nvarchar(max),
  @Observacion   nvarchar(500),
  @Usuario       nvarchar(50),
  @IdEmpleadoCj  int = NULL,
  @Procesadas    int OUTPUT
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  IF OBJECT_ID(N'dbo.sp_Stock_Mover', N'P') IS NULL
    THROW 51420, 'Falta dbo.sp_Stock_Mover (ejecute los scripts de stock 01 a 05).', 1;
  IF OBJECT_ID(N'dbo.sp_Logistica_Auditar', N'P') IS NULL
    THROW 51421, 'Falta dbo.sp_Logistica_Auditar (ejecute el script 24).', 1;

  SET @Observacion = NULLIF(LTRIM(RTRIM(@Observacion)), N'');
  IF @Observacion IS NULL THROW 51422, 'Debe ingresar el motivo del rechazo.', 1;

  DECLARE @ahora datetime = CONVERT(datetime, SYSDATETIMEOFFSET() AT TIME ZONE 'SA Pacific Standard Time');
  DECLARE @hoy date = CAST(@ahora AS date);

  CREATE TABLE #Aud (Entidad nvarchar(100), IdRegistro nvarchar(100), Seccion nvarchar(100) NULL, Campo nvarchar(100),
                     ValorAnterior nvarchar(max) NULL, ValorNuevo nvarchar(max) NULL);

  DECLARE @j TABLE (Nro nvarchar(50), Pos nvarchar(20));
  INSERT INTO @j (Nro, Pos)
  SELECT DISTINCT LTRIM(RTRIM(j.nroSolicitud)), LTRIM(RTRIM(j.posicion))
  FROM OPENJSON(@Items) WITH (nroSolicitud nvarchar(50) '$.nroSolicitud', posicion nvarchar(20) '$.posicion') j
  WHERE LTRIM(RTRIM(ISNULL(j.nroSolicitud, N''))) <> N'' AND LTRIM(RTRIM(ISNULL(j.posicion, N''))) <> N'';

  IF NOT EXISTS (SELECT 1 FROM @j) THROW 51423, 'No hay registros seleccionados.', 1;
  IF EXISTS (SELECT 1 FROM @j x WHERE NOT EXISTS
             (SELECT 1 FROM dbo.DetSolicitud b WHERE CAST(b.NroSolicitud AS nvarchar(50)) = x.Nro
                AND CAST(b.Posicion AS nvarchar(20)) = x.Pos AND b.IdDespacho = 1 AND b.IdEstado IN (3, 4)))
    THROW 51424, 'Hay registros que ya no estan pendientes de despacho. Vuelva a consultar.', 1;

  DECLARE @m TABLE (
    Id int IDENTITY(1,1) PRIMARY KEY,
    Nro nvarchar(50) NOT NULL, Pos nvarchar(20) NOT NULL, Corr nvarchar(50) NOT NULL, CodPap nvarchar(50) NOT NULL,
    Cant decimal(18,4) NOT NULL, Serie nvarchar(100) NULL, EstadoAnt int NOT NULL, ObsAnt nvarchar(500) NULL,
    IdCliente int NULL, IdProyecto int NULL, IdSite nvarchar(50) NULL, CorreSite int NULL, TipoTrabajo nvarchar(100) NULL, PedidoSap nvarchar(50) NULL);

  INSERT INTO @m (Nro, Pos, Corr, CodPap, Cant, Serie, EstadoAnt, ObsAnt, IdCliente, IdProyecto, IdSite, CorreSite, TipoTrabajo, PedidoSap)
  SELECT x.Nro, x.Pos, CAST(b.Correlativo AS nvarchar(50)), CAST(b.CodPap AS nvarchar(50)), b.CantSap,
         NULLIF(CAST(b.Serie AS nvarchar(100)), N''), b.IdEstado, CAST(b.Observacion AS nvarchar(500)),
         b.IdCliente, b.IdProyecto, CAST(b.IdSite AS nvarchar(50)), b.CorreSite, CAST(b.TipoTrabajo AS nvarchar(100)), CAST(b.PedidoSap AS nvarchar(50))
  FROM @j x
  INNER JOIN dbo.DetSolicitud b ON CAST(b.NroSolicitud AS nvarchar(50)) = x.Nro AND CAST(b.Posicion AS nvarchar(20)) = x.Pos
                               AND b.IdDespacho = 1 AND b.IdEstado IN (3, 4);

  IF EXISTS (SELECT 1 FROM @m m WHERE NOT EXISTS (SELECT 1 FROM dbo.CabSolicitud w WHERE w.NroSolicitud = m.Nro AND w.IdWeb = 1))
    THROW 51425, 'Solo se pueden rechazar solicitudes del sistema nuevo (IdWeb = 1). Las del sistema antiguo se rechazan en el sistema antiguo.', 1;

  BEGIN TRY
    BEGIN TRANSACTION;

    -- Detalle (incluye la fila espejo del site de origen en el mismo estado).
    UPDATE b SET b.IdEstado = 6, b.IdRespRec = @IdEmpleadoCj, b.FechaRechazar = @ahora, b.Observacion = @Observacion
    FROM dbo.DetSolicitud b
    INNER JOIN @m m ON CAST(b.NroSolicitud AS nvarchar(50)) = m.Nro AND CAST(b.Posicion AS nvarchar(20)) = m.Pos
    WHERE b.IdEstado IN (3, 4);

    INSERT INTO #Aud (Entidad, IdRegistro, Seccion, Campo, ValorAnterior, ValorNuevo)
    SELECT N'DetSolicitud', CONCAT(m.Nro, N'-', m.Pos), N'DESPACHO', v.Campo, v.Ant, v.Nue
    FROM @m m
    CROSS APPLY (VALUES (N'IdEstado', CONVERT(nvarchar(50), m.EstadoAnt), CONVERT(nvarchar(50), 6)),
                        (N'Observacion', m.ObsAnt, @Observacion)) v (Campo, Ant, Nue);

    -- Series bloqueadas por estas lineas quedan libres.
    UPDATE l SET l.IdEstado = 2
    FROM dbo.DetLogistica l
    INNER JOIN @m m ON l.Serie = m.Serie AND CAST(l.CodPap AS nvarchar(50)) = m.CodPap
    WHERE m.Serie IS NOT NULL AND m.Serie <> N'NO APLICA' AND l.IdEstado = 88;

    -- Cabecera: 6 si todas las lineas de destino quedaron rechazadas; 5 si ya no hay pendientes y hay despachadas.
    UPDATE a
       SET a.IdEstado = x.Nuevo,
           a.Observacion = CASE WHEN x.Nuevo = 6 THEN @Observacion ELSE a.Observacion END
    OUTPUT N'CabSolicitud', CONVERT(nvarchar(100), inserted.NroSolicitud), N'DESPACHO', N'IdEstado',
           CONVERT(nvarchar(50), deleted.IdEstado), CONVERT(nvarchar(50), inserted.IdEstado)
      INTO #Aud (Entidad, IdRegistro, Seccion, Campo, ValorAnterior, ValorNuevo)
    FROM dbo.CabSolicitud a
    CROSS APPLY (SELECT CASE
        WHEN EXISTS (SELECT 1 FROM dbo.DetSolicitud d WHERE d.NroSolicitud = a.NroSolicitud AND d.IdDespacho = 1 AND d.IdEstado IN (3, 4)) THEN a.IdEstado
        WHEN EXISTS (SELECT 1 FROM dbo.DetSolicitud d WHERE d.NroSolicitud = a.NroSolicitud AND d.IdDespacho = 1 AND d.IdEstado = 5) THEN 5
        WHEN NOT EXISTS (SELECT 1 FROM dbo.DetSolicitud d WHERE d.NroSolicitud = a.NroSolicitud AND d.IdDespacho = 1 AND d.IdEstado <> 6) THEN 6
        ELSE a.IdEstado END AS Nuevo) x
    WHERE CAST(a.NroSolicitud AS nvarchar(50)) IN (SELECT Nro FROM @m);

    EXEC dbo.sp_Logistica_Auditar @Usuario = @Usuario;

    INSERT INTO dbo.MovMaterial
      (PedidoSap, Correlativo, Posicion, IdEstado, Usuario, Fecha, Hora, Observacion, CodPap, CantSap, NroSolicitud, IdMovimiento,
       IdCliente, IdProyecto, IdSite, CorreSite, TipoTrabajo, IdSolicitante)
    SELECT ISNULL(m.PedidoSap, ''), m.Corr, m.Pos, 6, @Usuario, @hoy, @ahora, @Observacion, m.CodPap, m.Cant, m.Nro, 1,
           m.IdCliente, m.IdProyecto, m.IdSite, m.CorreSite, m.TipoTrabajo, @IdEmpleadoCj
    FROM @m m;

    INSERT INTO dbo.Kardex
      (TipoMovimiento, CantSap, CodPap, CantAnterior, CantRestante, Observaciones, IdCliente, IdProyecto, IdSite, CorreSite,
       IdEmpleadoCj, Fecha, Hora, IdEstado, NroSolicitud, FilaSolicitud, Serie)
    SELECT 3, m.Cant, m.CodPap, 0, 0, 'RECHAZO-DESPACHO', m.IdCliente, m.IdProyecto, m.IdSite, m.CorreSite,
           @IdEmpleadoCj, @hoy, @ahora, m.EstadoAnt, m.Nro, TRY_CONVERT(int, m.Pos), ISNULL(m.Serie, '')
    FROM @m m;

    DECLARE @i int = 1, @max int = (SELECT MAX(Id) FROM @m);
    DECLARE @cod nvarchar(50), @cant decimal(18,4), @nro nvarchar(50), @pos nvarchar(20), @corr nvarchar(50), @serie nvarchar(100), @clave nvarchar(100);
    WHILE @i <= @max
    BEGIN
      SELECT @cod = CodPap, @cant = Cant, @nro = Nro, @pos = Pos, @corr = Corr, @serie = Serie FROM @m WHERE Id = @i;
      SET @clave = CONCAT(N'RECHAZAR_DESP:', @nro, N'|', @pos);
      EXEC dbo.sp_Stock_Mover
        @CodPap = @cod, @BucketOrigen = 'Despachado', @BucketDestino = 'Disponible', @Cantidad = @cant,
        @Operacion = 'RECHAZAR_DESP', @Serie = @serie, @NroSolicitud = @nro, @Posicion = @pos, @CorrelativoDet = @corr,
        @IdEstadoDoc = 6, @Usuario = @Usuario, @IdEmpleadoCj = @IdEmpleadoCj, @Observacion = @Observacion,
        @ClaveIdempotencia = @clave;
      SET @i += 1;
    END;

    SET @Procesadas = (SELECT COUNT(*) FROM @m);
    COMMIT TRANSACTION;
  END TRY
  BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
  END CATCH;
END;
GO
