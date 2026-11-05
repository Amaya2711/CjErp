/*
  Logistica de equipos - x CAMPO: edicion directa desde la grilla de UNA linea (NroSolicitud + Posicion + Correlativo).
  PV: NO ejecutado en BD. Requiere 09 (sp_Logistica_Campo_Grabar).
  @Campos = lista separada por comas de lo que se cambia: observacion, serie, estado (lo no listado no se toca; asi se puede limpiar un texto).
   - observacion / serie: UPDATE directo de DetSolicitud (solo lineas IdDespacho = 1 en estado 11, pendientes de campo).
   - estado (14 o 10): ejecuta el flujo completo de sp_Logistica_Campo_Grabar para esa linea (estado, stock, kardex, cabecera);
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
  IF EXISTS (SELECT 1 FROM @c WHERE Campo NOT IN (N'observacion', N'serie', N'estado'))
    THROW 51311, 'Campo no editable en x Campo (use observacion, serie o estado).', 1;
  IF NOT EXISTS (SELECT 1 FROM @c) THROW 51312, 'No se indico que campo cambiar.', 1;

  SET @NroSolicitud = LTRIM(RTRIM(@NroSolicitud));
  SET @Posicion = LTRIM(RTRIM(@Posicion));
  SET @Correlativo = NULLIF(LTRIM(RTRIM(@Correlativo)), N'');
  SET @Observacion = NULLIF(LTRIM(RTRIM(@Observacion)), N'');
  SET @Serie = NULLIF(LTRIM(RTRIM(@Serie)), N'');

  BEGIN TRY
    BEGIN TRANSACTION;

    UPDATE b
       SET b.Observacion = CASE WHEN EXISTS (SELECT 1 FROM @c WHERE Campo = N'observacion') THEN @Observacion ELSE b.Observacion END,
           b.Serie       = CASE WHEN EXISTS (SELECT 1 FROM @c WHERE Campo = N'serie')       THEN @Serie       ELSE b.Serie END
    FROM dbo.DetSolicitud b
    WHERE CAST(b.NroSolicitud AS nvarchar(50)) = @NroSolicitud
      AND CAST(b.Posicion AS nvarchar(20)) = @Posicion
      AND (@Correlativo IS NULL OR CAST(b.Correlativo AS nvarchar(50)) = @Correlativo)
      AND b.IdDespacho = 1 AND b.IdEstado = 11;

    IF @@ROWCOUNT = 0
      THROW 51310, 'La linea ya no esta pendiente de campo. Vuelva a consultar.', 1;

    IF EXISTS (SELECT 1 FROM @c WHERE Campo = N'estado')
    BEGIN
      IF @IdEstado IS NULL OR @IdEstado NOT IN (10, 14)
        THROW 51313, 'Estado no permitido en campo (use 14 u 10).', 1;

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
           @IdResponsable = @IdEmpleadoCj, @Procesadas = @p OUTPUT, @ConDiferencia = @d OUTPUT;
    END;

    COMMIT TRANSACTION;
  END TRY
  BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
  END CATCH;
END;
GO
