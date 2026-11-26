/*
  Logistica de equipos - auditoria de los UPDATE (no de los INSERT), en la tabla dbo.AuditoriaCambios.
  PV: NO ejecutado ni probado contra la BD. EJECUTAR ANTES que los scripts 09, 16 y 23 (los SP de campo y cierre lo llaman).

  Misma regla de AuditoriaCambiosService (C#): solo se auditan modificaciones; las altas no. Si dbo.sp_AuditoriaCambios_Registrar
  no existe en la base, no se audita (igual que el servicio de C#).

  Uso desde otro SP, dentro de su transaccion:
    CREATE TABLE #Aud (Entidad nvarchar(100), IdRegistro nvarchar(100), Seccion nvarchar(100) NULL, Campo nvarchar(100),
                       ValorAnterior nvarchar(max) NULL, ValorNuevo nvarchar(max) NULL);
    ... INSERT INTO #Aud (...) con lo que cambio el UPDATE (o OUTPUT deleted/inserted INTO #Aud) ...
    EXEC dbo.sp_Logistica_Auditar @Usuario = @Usuario;     -- registra y vacia #Aud
  Solo se registran las filas cuyo valor nuevo es distinto del anterior. Modulo = 'LOGISTICA', Accion = 'UPDATE'.
*/
SET NOCOUNT ON;
GO
CREATE OR ALTER PROCEDURE dbo.sp_Logistica_Auditar
  @Usuario      nvarchar(100),
  @Observacion  nvarchar(500) = NULL
AS
BEGIN
  SET NOCOUNT ON;

  IF OBJECT_ID(N'tempdb..#Aud') IS NULL
    THROW 51341, 'Falta la tabla temporal #Aud en el procedimiento que llama a sp_Logistica_Auditar.', 1;

  IF OBJECT_ID(N'dbo.sp_AuditoriaCambios_Registrar', N'P') IS NULL
  BEGIN
    DELETE FROM #Aud;   -- sin procedimiento de auditoria en esta base: no se audita
    RETURN;
  END;

  SET @Usuario = ISNULL(NULLIF(LTRIM(RTRIM(@Usuario)), N''), N'SISTEMA');

  DECLARE @entidad nvarchar(100), @idReg nvarchar(100), @seccion nvarchar(100), @campo nvarchar(100),
          @ant nvarchar(max), @nue nvarchar(max);

  DECLARE c CURSOR LOCAL FAST_FORWARD FOR
    SELECT Entidad, IdRegistro, Seccion, Campo, ValorAnterior, ValorNuevo
    FROM #Aud
    WHERE ISNULL(ValorAnterior, N'') <> ISNULL(ValorNuevo, N'');

  OPEN c;
  FETCH NEXT FROM c INTO @entidad, @idReg, @seccion, @campo, @ant, @nue;
  WHILE @@FETCH_STATUS = 0
  BEGIN
    EXEC dbo.sp_AuditoriaCambios_Registrar
      @Modulo = N'LOGISTICA', @Entidad = @entidad, @IdRegistro = @idReg, @Accion = N'UPDATE', @Seccion = @seccion,
      @Campo = @campo, @ValorAnterior = @ant, @ValorNuevo = @nue, @UsuarioAccion = @Usuario, @Observacion = @Observacion;
    FETCH NEXT FROM c INTO @entidad, @idReg, @seccion, @campo, @ant, @nue;
  END;
  CLOSE c;
  DEALLOCATE c;

  DELETE FROM #Aud;
END;
GO
