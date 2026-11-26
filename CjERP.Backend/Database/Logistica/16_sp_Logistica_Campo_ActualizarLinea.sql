/*
  Logistica de equipos - x CAMPO: edicion directa desde la grilla de UNA linea (NroSolicitud + Posicion + Correlativo).
  PV: NO ejecutado en BD. Requiere 09 (sp_Logistica_Campo_Grabar).
  @Campos = lista separada por comas de lo que se cambia: observacion, serie, nroguia, cantsap, estado (lo no listado no se toca; asi se puede limpiar un texto).
   - observacion / serie / nroguia / cantsap (cantidad real = DetSolicitud.CantSap): UPDATE directo de DetSolicitud (solo lineas IdDespacho = 1 en estado 11, pendientes de campo).
   - estado (10, 14 o 19): graba EXACTAMENTE el estado elegido (sin la regla Aplica=0 -> 21) y ejecuta el flujo completo de sp_Logistica_Campo_Grabar para esa linea (estado, stock, kardex, cabecera);
     con 10 la observacion es obligatoria. @Cantidad = cantidad conforme (opcional).
*/
SET NOCOUNT ON;
GO
CREATE OR ALTER PROCEDURE dbo.sp_Logistica_Campo_ActualizarLinea
  @NroSolicitud  nvarchar(50),
  @Posicion      nvarchar(20),
  @Correlativo   nvarchar(50)  = NULL,
  @Campos        nvarchar(100),
  @Observacion   nvarchar(500) = NULL,
  @Serie         nvarchar(100) = NULL,
  @NroGuia       nvarchar(50)  = NULL,
  @CantSap       decimal(18,4) = NULL,
  @IdEstado      int           = NULL,
  @Cantidad      decimal(18,4) = NULL,
  @Usuario       nvarchar(50)  = NULL,
  @IdEmpleadoCj  int           = NULL
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  DECLARE @c TABLE (Campo nvarchar(30) PRIMARY KEY);
  INSERT INTO @c SELECT DISTINCT LOWER(LTRIM(RTRIM(value))) FROM STRING_SPLIT(@Campos, N',') WHERE LTRIM(RTRIM(value)) <> N'';
  IF EXISTS (SELECT 1 FROM @c WHERE Campo NOT IN (N'observacion', N'serie', N'nroguia', N'cantsap', N'estado'))
    THROW 51311, 'Campo no editable en x Campo (use observacion, serie, nroguia, cantsap o estado).', 1;
  IF EXISTS (SELECT 1 FROM @c WHERE Campo = N'cantsap') AND (@CantSap IS NULL OR @CantSap < 0)
    THROW 51314, 'La cantidad real debe ser un numero mayor o igual a 0 (admite decimales).', 1;
  IF NOT EXISTS (SELECT 1 FROM @c) THROW 51312, 'No se indico que campo cambiar.', 1;

  SET @NroSolicitud = LTRIM(RTRIM(@NroSolicitud));
  SET @Posicion = LTRIM(RTRIM(@Posicion));
  SET @Correlativo = NULLIF(LTRIM(RTRIM(@Correlativo)), N'');
  SET @Observacion = NULLIF(LTRIM(RTRIM(@Observacion)), N'');
  SET @Serie = NULLIF(LTRIM(RTRIM(@Serie)), N'');
  SET @NroGuia = NULLIF(LTRIM(RTRIM(@NroGuia)), N'');

  BEGIN TRY
    BEGIN TRANSACTION;

    -- Valores anteriores y nuevos (OUTPUT) para la auditoria de los UPDATE en dbo.AuditoriaCambios (script 24).
    IF OBJECT_ID(N'dbo.sp_Logistica_Auditar', N'P') IS NULL
      THROW 51340, 'Falta dbo.sp_Logistica_Auditar (ejecute el script 24).', 1;
    DECLARE @o TABLE (Obs0 nvarchar(500), Obs1 nvarchar(500), Ser0 nvarchar(100), Ser1 nvarchar(100),
                      Gui0 nvarchar(50), Gui1 nvarchar(50), Can0 decimal(18,4), Can1 decimal(18,4));

    UPDATE b
       SET b.Observacion = CASE WHEN EXISTS (SELECT 1 FROM @c WHERE Campo = N'observacion') THEN @Observacion ELSE b.Observacion END,
           b.Serie       = CASE WHEN EXISTS (SELECT 1 FROM @c WHERE Campo = N'serie')       THEN @Serie       ELSE b.Serie END,
           b.NroGuia     = CASE WHEN EXISTS (SELECT 1 FROM @c WHERE Campo = N'nroguia')     THEN @NroGuia     ELSE b.NroGuia END,
           b.CantSap     = CASE WHEN EXISTS (SELECT 1 FROM @c WHERE Campo = N'cantsap')     THEN @CantSap     ELSE b.CantSap END
    OUTPUT CAST(deleted.Observacion AS nvarchar(500)), CAST(inserted.Observacion AS nvarchar(500)),
           CAST(deleted.Serie AS nvarchar(100)), CAST(inserted.Serie AS nvarchar(100)),
           CAST(deleted.NroGuia AS nvarchar(50)), CAST(inserted.NroGuia AS nvarchar(50)),
           CAST(deleted.CantSap AS decimal(18,4)), CAST(inserted.CantSap AS decimal(18,4))
      INTO @o
    FROM dbo.DetSolicitud b
    WHERE CAST(b.NroSolicitud AS nvarchar(50)) = @NroSolicitud
      AND CAST(b.Posicion AS nvarchar(20)) = @Posicion
      AND (@Correlativo IS NULL OR CAST(b.Correlativo AS nvarchar(50)) = @Correlativo)
      AND b.IdDespacho = 1 AND b.IdEstado = 11;

    IF @@ROWCOUNT = 0
      THROW 51310, 'La linea ya no esta pendiente de campo. Vuelva a consultar.', 1;

    -- Auditoria de los campos editados (solo los de @Campos). Se vacia #Aud antes del flujo de estado, que usa la suya.
    CREATE TABLE #Aud (Entidad nvarchar(100), IdRegistro nvarchar(100), Seccion nvarchar(100) NULL, Campo nvarchar(100),
                       ValorAnterior nvarchar(max) NULL, ValorNuevo nvarchar(max) NULL);
    INSERT INTO #Aud (Entidad, IdRegistro, Seccion, Campo, ValorAnterior, ValorNuevo)
    SELECT N'DetSolicitud', CONCAT(@NroSolicitud, N'-', @Posicion), N'CAMPO', v.Campo, v.Ant, v.Nue
    FROM @o o
    CROSS APPLY (VALUES (N'observacion', N'Observacion', o.Obs0, o.Obs1),
                        (N'serie',       N'Serie',       o.Ser0, o.Ser1),
                        (N'nroguia',     N'NroGuia',     o.Gui0, o.Gui1),
                        (N'cantsap',     N'CantSap',     CONVERT(nvarchar(50), o.Can0), CONVERT(nvarchar(50), o.Can1))) v (Clave, Campo, Ant, Nue)
    WHERE EXISTS (SELECT 1 FROM @c WHERE Campo = v.Clave);
    EXEC dbo.sp_Logistica_Auditar @Usuario = @Usuario;
    DROP TABLE #Aud;

    IF EXISTS (SELECT 1 FROM @c WHERE Campo = N'estado')
    BEGIN
      IF @IdEstado IS NULL OR @IdEstado NOT IN (10, 14, 19)
        THROW 51313, 'Estado no permitido en campo (use 14, 10 o 19).', 1;

      -- Observacion = la ya guardada en la linea (recien actualizada arriba si se edito en esta llamada).
      DECLARE @items nvarchar(max) = (
        SELECT b.NroSolicitud AS nroSolicitud, b.Posicion AS posicion, @IdEstado AS idEstado,
               @Cantidad AS cantidad, CAST(b.Observacion AS nvarchar(500)) AS observacion
        FROM dbo.DetSolicitud b
        WHERE CAST(b.NroSolicitud AS nvarchar(50)) = @NroSolicitud
          AND CAST(b.Posicion AS nvarchar(20)) = @Posicion
          AND (@Correlativo IS NULL OR CAST(b.Correlativo AS nvarchar(50)) = @Correlativo)
          AND b.IdDespacho = 1 AND b.IdEstado = 11
        FOR JSON PATH, INCLUDE_NULL_VALUES);

      DECLARE @p int, @d int;
      EXEC dbo.sp_Logistica_Campo_Grabar @Items = @items, @Usuario = @Usuario, @IdEmpleadoCj = @IdEmpleadoCj,
           @IdResponsable = @IdEmpleadoCj, @RespetarEstado = 1, @Procesadas = @p OUTPUT, @ConDiferencia = @d OUTPUT;
    END;

    COMMIT TRANSACTION;
  END TRY
  BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
  END CATCH;
END;
GO
