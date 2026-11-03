:on error exit
-- GUARDA DE BASE: la base destino es JC_Db.
DECLARE @BaseDestino SYSNAME = N'JC_Db';
IF DB_NAME() <> @BaseDestino
BEGIN
    RAISERROR(N'Guarda de base: la base activa no es la base destino (@BaseDestino). No se ejecuto nada.', 16, 1);
    SET NOEXEC ON;
END
GO
/* ============================================================================
   CJ INTELLIGENCE - PRUEBA REAL DE PAGOS BAJO LA IDENTIDAD cj_ia (script 24).
   >>> NO EJECUTADA. CONSULTA PAGOS DE VERDAD: requiere AUTORIZACION EXPRESA, SEPARADA de la de los scripts 18-23. <<<

   POR QUE EXISTE: las pruebas 22 y 23 usan @SoloValidar = 1 y NO ejecutan sp_IA_Planilla_Buscar; por tanto NO demuestran que el
   procedimiento FIRMADO (20c) pueda ejecutar el SQL dinamico del modo RESUMEN con los privilegios minimos del certificado.
   Este script lo demuestra con UNA sola ejecucion real, acotada, conectado como cj_ia.

   QUE EJECUTA (exactamente una llamada a sp_IA_Cj_Pagos_Buscar, SoloValidar = 0):
     - Modo RESUMEN (el que usa SQL dinamico), agrupado SOLO por moneda, TOP 5.
     - Alcance PROPIO de un unico empleado (CJ_TEST_USER_PROPIO), UN SOLO DIA (CJ_PAGOS_FECHA, yyyy-MM-dd).
     - Solo lectura: no escribe en ninguna tabla permanente (usa tablas temporales de tempdb, como cualquier consulta del chat anterior).
   CRITERIO DE EXITO (columna Veredicto): OK = termino sin error, NivelAplicado = PROPIO y un unico empleado aplicado.
     FALLA_PERMISOS_SQL_DINAMICO = error 229/230/297: la firma NO cubre el SQL dinamico del SP llamado (no se amplian permisos: se
     corrige el diseno o se descarta con aprobacion). FALLA_OTRO = cualquier otro error.

   REQUISITOS PREVIOS (todos): scripts 18, 19, 20 y 20c ejecutados; 21 (etapa 20) y 21b con 0 FALLA; 23 con 0 FALLA; respaldo
   confirmado y hallazgo del log atendido; autorizacion expresa de este script, del dia elegido y de la ventana horaria.
   CONEXION: como cj_ia, con la clave en SQLCMDPASSWORD (entorno) y TIMEOUT DEL CLIENTE DE 30 s:
       sqlcmd -S <servidor> -d JC_Db -U cj_ia -t 30 -i 24_CjIntelligence_PruebaReal_Pagos_cj_ia.sql
   VARIABLES DE ENTORNO (no secretas): CJ_TEST_USER_PROPIO (usuario activo, nivel maximo PROPIO, empleado unico), CJ_PAGOS_FECHA.

   LIMITES Y DETENCION. El tamano de pagina y TOP NO garantizan trabajo interno pequeno de SQL (el SP arma todos los candidatos del
   alcance y la fecha antes de paginar); por eso el alcance es un empleado y el rango un dia. SUPERVISION DURANTE la ejecucion
   (desde otra sesion de administrador, solo lectura; aun no existe un vigilante automatico):
       SELECT r.session_id, r.status, r.total_elapsed_time/1000 seg, r.logical_reads, r.wait_type, r.blocking_session_id
       FROM sys.dm_exec_requests r JOIN sys.dm_exec_sessions s ON s.session_id = r.session_id
       WHERE s.context_info = 0x434A49415245414C;          -- marca puesta por este script
   DETENER (KILL de ESA sesion) si: tiempo > 30 s, logical_reads > 500000, bloqueos sobre otras sesiones > 5 s, o cualquier
   sintoma de lentitud del ERP. SOLO AL TERMINAR se conocen: totales de STATISTICS IO/TIME, filas y plan real. No repetir ni ampliar
   el rango sin nueva autorizacion; si se supera algun umbral no se continua con otras pruebas de rendimiento.
   Esta prueba NO sustituye al plan de rendimiento (hasta 7 ejecuciones): ese sigue pendiente y es otra autorizacion.
   ============================================================================ */
SET NOCOUNT ON;
SET LOCK_TIMEOUT 5000;
SET CONTEXT_INFO 0x434A49415245414C;

IF SUSER_SNAME() <> N'cj_ia' OR USER_NAME() <> N'cj_ia'
    THROW 51600, 'Este script debe ejecutarse CONECTADO como cj_ia (no como administrador).', 1;

DECLARE @Propio NVARCHAR(50) = N'$(CJ_TEST_USER_PROPIO)';
DECLARE @Fecha DATE = TRY_CONVERT(DATE, N'$(CJ_PAGOS_FECHA)', 23);
IF @Propio = N'' OR @Fecha IS NULL
    THROW 51601, 'Faltan CJ_TEST_USER_PROPIO o CJ_PAGOS_FECHA (yyyy-MM-dd).', 1;

DECLARE @F NVARCHAR(10) = CONVERT(NVARCHAR(10), @Fecha, 23);
DECLARE @nivel VARCHAR(10), @lista NVARCHAR(MAX), @glob BIT;
DECLARE @err INT = NULL, @msg NVARCHAR(400) = NULL, @t0 DATETIME2(3) = SYSUTCDATETIME();

SET STATISTICS IO ON;
SET STATISTICS TIME ON;
BEGIN TRY
    EXEC dbo.sp_IA_Cj_Pagos_Buscar
        @IdUsuario = @Propio, @NivelSolicitado = 'PROPIO', @VerTotalesGlobales = 0,
        @FechaInicio = @F, @FechaFin = @F, @Modo = 'RESUMEN', @AgruparPor = 'MONEDA', @Top = 5,
        @SoloValidar = 0,
        @NivelAplicado = @nivel OUTPUT, @EmpleadosAplicados = @lista OUTPUT, @GlobalesAplicado = @glob OUTPUT;
END TRY
BEGIN CATCH
    SET @err = ERROR_NUMBER();
    SET @msg = LEFT(ERROR_MESSAGE(), 400);
END CATCH;
SET STATISTICS TIME OFF;
SET STATISTICS IO OFF;

SELECT
    DATEDIFF(MILLISECOND, @t0, SYSUTCDATETIME()) AS Milisegundos,
    @err AS NumeroError,
    @msg AS MensajeError,
    @nivel AS NivelAplicado,
    CASE WHEN @lista IS NULL THEN NULL WHEN CHARINDEX(N',', @lista) > 0 THEN 'varios' ELSE 'uno' END AS EmpleadosAplicados,
    CASE
        WHEN @err IS NULL AND @nivel = 'PROPIO' AND @lista IS NOT NULL AND CHARINDEX(N',', @lista) = 0 THEN 'OK'
        WHEN @err IN (229, 230, 297) THEN 'FALLA_PERMISOS_SQL_DINAMICO'
        ELSE 'FALLA_OTRO'
    END AS Veredicto;
GO

SET NOEXEC OFF;
GO
