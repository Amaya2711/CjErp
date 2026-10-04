-- GUARDA DE BASE: la base destino por defecto es JC_Db (editar @BaseDestino solo si se aplica en otra base).
-- Si la base ACTIVA de la conexion en SSMS es otra (p. ej. master), el script no hace nada.
DECLARE @BaseDestino SYSNAME = N'JC_Db';
IF DB_NAME() <> @BaseDestino
BEGIN
    RAISERROR(N'Guarda de base: la base activa no es la base destino (@BaseDestino). Cambie la base activa en SSMS. No se ejecuto nada.', 16, 1);
    SET NOEXEC ON;
END
GO
/* ============================================================================
   VERSION 2 (columnas de analisis + tipo de cambio multimoneda). NO EJECUTADO.
   Parte de 02_sp_IA_Planilla_Buscar_Alcance.sql (alcance, paginacion y 15 columnas
   globales intactos) y le incorpora, desde dbo.sp_Planilla_Consulta_Estados:
     - Tipos de cambio USD/EUR/DOP/COP (parametros nuevos AL FINAL, todos opcionales).
       Resolucion: parametro > dbo.a_tipo_cambio_diario (ultimo dia <= hoy, columna Venta,
       moneda->PEN, Activo = 1) > valores por defecto (decision de negocio 2026-10-03):
       USD 3.50 | EUR 3.80 | DOP 0.057 | COP 0.0010. TipoCambioFaltante = 1 solo si la
       moneda del registro no es 1-5.
       @TipoCambio (legado) sigue aceptandose: se usa como USD si llega > 0; ahora su valor
       por defecto es NULL (antes 3.80) y alimenta los calculos globales existentes.
     - Columnas por fila (propias del registro, no globales): Cuenta, CuentaInter, RUC (del
       responsable; decision de negocio 2026-10-03), IdEstado, IdCliente, IdProyecto,
       CorreSite, TipoMoneda, IGV/Total en soles, TipoCambioAplicado, TipoCambioFaltante,
       Banco, NroOperacion, FecEmision, FechaPagoCre, Gestor, Validador, Tarea, IdEstadoOc,
       EstadoOcSemaforo, MontoRetencion, TotalPagarOriginal, TotalPagarSoles.
       SubtotalSoles ahora convierte EUR/DOP/COP (antes se trataban 1:1) y es NULL si falta TC.
     - Columnas GLOBALES nuevas (NULL sin @VerTotalesGlobales = 1; deben estar en
       IaGlobalColumns.cs): TotalSubtotalPorMoneda, TotalMontoBckPorMoneda,
       TotalMontoVisiblePorMoneda, TotalPagadoConvertidoSoles, TipoCambioFaltanteOT,
       TotalPagarProcesado.
     - NO se incorporan los filtros por @IdCargo/@IdEmpleado/PERMISOS (el alcance lo da el
       backend). OJO: Cuenta, CuentaInter y RUC son datos personales/bancarios que salen para
       toda fila dentro del alcance (incluido TOTAL sin totales globales); si se quieren
       restringir, moverlos a las columnas globales (IaGlobalColumns.cs + CASE del SELECT).
   Recuperacion: 03 restaura la version previa a la Fase 2; para volver a la version con
   alcance sin columnas nuevas, ejecutar 02.

   AVISO historico del script 02: se ejecutó en JC_Db el 2026-10-03 a las 07:14 con el
   backend actual (incompatible) y se revirtió a las 07:28 con el script 03 (ver el
   anexo del incidente en docs/AI_COPILOT_IMPLEMENTATION_PLAN.md). Aplicar solo según el
   procedimiento escalonado (docs/AI_COPILOT_FASE2_INTEGRACION_DEV.md), junto con el
   backend que envía los parámetros de alcance.

   Base: definición vigente de dbo.sp_IA_Planilla_Buscar en JC_Db
   (modify_date 2026-06-23, extraída por Metadata_Alcance_SoloLectura.sql).
   El bloque comentado de la versión anterior que traía el SP vigente al final
   no se reproduce aquí.

   CAMBIOS (todo lo demás es idéntico a la definición vigente):
   1. Parámetros nuevos, al final (sin orden posicional que romper):
        @AlcanceNivel        VARCHAR(12)    'TOTAL' | 'RESTRINGIDO'
        @AlcanceCampos       VARCHAR(2)     'R' | 'S' | 'RS'   (solo RESTRINGIDO)
        @AlcanceEmpleados    NVARCHAR(MAX)  lista "1,2,3" de EmpleadoCj.IdEmpleado
        @VerTotalesGlobales  BIT            permiso independiente del alcance
   2. FALLA CERRADA: alcance ausente o inválido => THROW 5001x (sin asumir TOTAL).
   3. Lista de identificadores validada estrictamente (solo dígitos y comas,
      sin elementos vacíos, enteros positivos, máximo 500 distintos).
   4. El alcance se aplica en el WHERE de #Candidatos, ANTES de COUNT(*) OVER()
      y de la paginación. Los filtros del usuario (@Responsable, @Solicitante,
      etc.) siguen combinándose con AND: solo pueden reducir el alcance.
   5. Con @VerTotalesGlobales = 0, las 15 columnas globales devuelven NULL
      (no 0): Ventas, TotalPagadoHistoricoSoles, ConPagadoSoles,
      ConPagadoMonedaRegistro, ConPagado, SaldoOcSitio, SubOc, SubPlanilla,
      SubPlanillaConRegistroActual, PorcentajeSubPlanilla, AdelaFic,
      DiferenciaFic, CodigoValidacionFic, ResultadoValidacionFic,
      PorcentajeFic. Además cada bloque APPLY global lleva la condición
      "@VerTotalesGlobales = 1" con la INTENCIÓN de evitar su costo; que el
      motor realmente NO los ejecute sin el permiso está SIN VERIFICAR:
      debe comprobarse con ejecución y plan de ejecución reales (ver el anexo
      del plan). El NULL de las 15 columnas NO depende de esa optimización.
      Con el permiso concedido, los cálculos son los de siempre.

   REGLA DE PERTENENCIA (decisión confirmada: Propio = responsable O
   solicitante; Equipo = titular + subordinados directos, ya resuelto por el
   backend en @AlcanceEmpleados):
     responsable CJ  = Empleado(IdResponsable).IdEmpleadoCj
     solicitante CJ  = IdWeb = 1 -> EmpleadoCj(IdSolicitante).IdEmpleado
                       IdWeb <> 1 -> Empleado(IdSolicitante).IdEmpleadoCj
   Un identificador corporativo NULL nunca coincide (falla cerrada).

   COMPATIBILIDAD: un backend anterior (que no envía @AlcanceNivel) recibirá
   el error 50010. Desplegar SQL y backend juntos. Sin ALTER a tablas.
   PV: un índice con IdResponsable como clave puede mejorar el filtro
   (propuesta, no incluida).
   ============================================================================ */
CREATE OR ALTER PROCEDURE [dbo].[sp_IA_Planilla_Buscar]
(
    @TextoBusqueda      NVARCHAR(500) = NULL,

    @Estados            VARCHAR(100) = NULL,

    @FechaInicio        NVARCHAR(50) = NULL,
    @FechaFin           NVARCHAR(50) = NULL,
    @FormatoFecha       VARCHAR(10) = 'DMY', -- Formato esperado para parámetros de entrada del usuario

    @IdSite             NVARCHAR(50) = NULL,
    @CorreSite          INT = NULL,
    @Site               NVARCHAR(150) = NULL,

    @Cliente            NVARCHAR(150) = NULL,
    @Proyecto           NVARCHAR(150) = NULL,
    @Responsable        NVARCHAR(150) = NULL,
    @Solicitante        NVARCHAR(150) = NULL,
    @Ot                 NVARCHAR(100) = NULL,

    @CoincidirTodas     BIT = 0,
    @IncluirEstado99    BIT = 1,

    @Pagina             INT = 1,
    @TamanoPagina       INT = 50000,

    @TipoCambio         DECIMAL(18, 6) = NULL, -- legado: se usa como USD si llega > 0

    -- Alcance obligatorio (sin valores por defecto utilizables)
    @AlcanceNivel       VARCHAR(12) = NULL,
    @AlcanceCampos      VARCHAR(2) = NULL,
    @AlcanceEmpleados   NVARCHAR(MAX) = NULL,
    @VerTotalesGlobales BIT = NULL,

    -- Tipos de cambio a soles (opcionales; ver cabecera para la resolucion). Siempre al final.
    @TipoCambioUSD      DECIMAL(18, 6) = NULL,
    @TipoCambioEUR      DECIMAL(18, 6) = NULL,
    @TipoCambioDOP      DECIMAL(18, 6) = NULL,
    @TipoCambioCOP      DECIMAL(18, 6) = NULL
)
AS
BEGIN
    SET NOCOUNT ON;

    /* ============================================================
       0. VALIDAR ALCANCE (falla cerrada, antes de cualquier consulta)
       ============================================================ */
    DECLARE @AlcanceIds TABLE
    (
        IdEmpleadoCj INT NOT NULL PRIMARY KEY
    );

    SET @AlcanceNivel = UPPER(NULLIF(LTRIM(RTRIM(@AlcanceNivel)), ''));
    SET @AlcanceCampos = UPPER(NULLIF(LTRIM(RTRIM(@AlcanceCampos)), ''));

    IF @AlcanceNivel IS NULL OR @AlcanceNivel NOT IN ('TOTAL', 'RESTRINGIDO')
        THROW 50010, 'Alcance ausente o invalido: AlcanceNivel debe ser TOTAL o RESTRINGIDO.', 1;

    IF @VerTotalesGlobales IS NULL
        THROW 50011, 'Alcance invalido: VerTotalesGlobales es obligatorio (0 o 1).', 1;

    IF @AlcanceNivel = 'TOTAL'
    BEGIN
        IF @AlcanceCampos IS NOT NULL OR NULLIF(LTRIM(RTRIM(@AlcanceEmpleados)), N'') IS NOT NULL
            THROW 50012, 'Alcance invalido: TOTAL no admite AlcanceCampos ni AlcanceEmpleados.', 1;
    END
    ELSE
    BEGIN
        IF @AlcanceCampos IS NULL OR @AlcanceCampos NOT IN ('R', 'S', 'RS')
            THROW 50013, 'Alcance invalido: AlcanceCampos debe ser R, S o RS.', 1;

        IF @AlcanceEmpleados IS NULL OR LEN(@AlcanceEmpleados) = 0
            THROW 50014, 'Alcance invalido: AlcanceEmpleados es obligatorio para RESTRINGIDO.', 1;

        -- Solo digitos y comas, sin espacios ni otros caracteres.
        IF @AlcanceEmpleados LIKE N'%[^0-9,]%'
            THROW 50015, 'Alcance invalido: AlcanceEmpleados solo admite digitos y comas.', 1;

        -- Sin elementos vacios (",,", coma inicial o final) ni mas de 9 digitos por elemento.
        IF EXISTS
        (
            SELECT 1
            FROM STRING_SPLIT(@AlcanceEmpleados, N',') s
            WHERE LEN(s.value) = 0 OR LEN(s.value) > 9
        )
            THROW 50016, 'Alcance invalido: AlcanceEmpleados contiene elementos vacios o demasiado largos.', 1;

        INSERT INTO @AlcanceIds (IdEmpleadoCj)
        SELECT DISTINCT CONVERT(INT, s.value)
        FROM STRING_SPLIT(@AlcanceEmpleados, N',') s
        WHERE CONVERT(INT, s.value) > 0;

        IF NOT EXISTS (SELECT 1 FROM @AlcanceIds)
            THROW 50017, 'Alcance invalido: AlcanceEmpleados no contiene identificadores positivos.', 1;

        IF (SELECT COUNT(*) FROM @AlcanceIds) > 500
            THROW 50018, 'Alcance invalido: AlcanceEmpleados supera el maximo de 500 identificadores.', 1;
    END;

    BEGIN TRY

        /* ============================================================
           1. NORMALIZAR PARÁMETROS
           ============================================================ */
        SET @TextoBusqueda = NULLIF(LTRIM(RTRIM(@TextoBusqueda)), N'');
        SET @Estados = NULLIF(LTRIM(RTRIM(@Estados)), '');

        SET @FechaInicio = NULLIF(LTRIM(RTRIM(@FechaInicio)), N'');
        SET @FechaFin = NULLIF(LTRIM(RTRIM(@FechaFin)), N'');
        SET @FormatoFecha = UPPER(NULLIF(LTRIM(RTRIM(@FormatoFecha)), ''));

        IF @FormatoFecha IS NULL
            SET @FormatoFecha = 'DMY';

        IF @FormatoFecha NOT IN ('MDY', 'DMY')
            SET @FormatoFecha = 'DMY';

        SET @IdSite = NULLIF(LTRIM(RTRIM(@IdSite)), N'');
        SET @Site = NULLIF(LTRIM(RTRIM(@Site)), N'');
        SET @Cliente = NULLIF(LTRIM(RTRIM(@Cliente)), N'');
        SET @Proyecto = NULLIF(LTRIM(RTRIM(@Proyecto)), N'');
        SET @Responsable = NULLIF(LTRIM(RTRIM(@Responsable)), N'');
        SET @Solicitante = NULLIF(LTRIM(RTRIM(@Solicitante)), N'');
        SET @Ot = NULLIF(LTRIM(RTRIM(@Ot)), N'');

        SET @Pagina =
            CASE
                WHEN ISNULL(@Pagina, 0) < 1 THEN 1
                ELSE @Pagina
            END;

        SET @TamanoPagina =
            CASE
                WHEN ISNULL(@TamanoPagina, 0) < 1 THEN 50
                WHEN @TamanoPagina > 50000 THEN 50000
                ELSE @TamanoPagina
            END;

        /* ============================================================
           1.0 TIPOS DE CAMBIO A SOLES
           1 SOLES | 2 USD | 3 EUR | 4 DOP | 5 COP (Planilla.TipoMoneda)
           Orden: parametro > dbo.a_tipo_cambio_diario (Venta, ultimo dia <= hoy) > defecto (USD 3.50, EUR 3.80, DOP 0.057, COP 0.0010).
           ============================================================ */
        IF @TipoCambioUSD IS NULL AND ISNULL(@TipoCambio, 0) > 0
            SET @TipoCambioUSD = @TipoCambio;

        SET @TipoCambioUSD = CASE WHEN ISNULL(@TipoCambioUSD, 0) <= 0 THEN NULL ELSE @TipoCambioUSD END;
        SET @TipoCambioEUR = CASE WHEN ISNULL(@TipoCambioEUR, 0) <= 0 THEN NULL ELSE @TipoCambioEUR END;
        SET @TipoCambioDOP = CASE WHEN ISNULL(@TipoCambioDOP, 0) <= 0 THEN NULL ELSE @TipoCambioDOP END;
        SET @TipoCambioCOP = CASE WHEN ISNULL(@TipoCambioCOP, 0) <= 0 THEN NULL ELSE @TipoCambioCOP END;

        IF OBJECT_ID(N'dbo.a_tipo_cambio_diario', N'U') IS NOT NULL
           AND (@TipoCambioUSD IS NULL OR @TipoCambioEUR IS NULL OR @TipoCambioDOP IS NULL OR @TipoCambioCOP IS NULL)
        BEGIN
            DECLARE @TcHoy DATE = CONVERT(DATE, SYSDATETIMEOFFSET() AT TIME ZONE N'SA Pacific Standard Time');
            DECLARE @TcTablaUSD DECIMAL(18, 6), @TcTablaEUR DECIMAL(18, 6), @TcTablaDOP DECIMAL(18, 6), @TcTablaCOP DECIMAL(18, 6);

            BEGIN TRY
                EXEC sys.sp_executesql
                    N'SELECT
                        @usd = (SELECT TOP (1) t.Venta FROM dbo.a_tipo_cambio_diario t
                                WHERE t.Activo = 1 AND t.MonedaOrigen = ''USD'' AND t.MonedaDestino = ''PEN'' AND t.FechaTipoCambio <= @hoy
                                ORDER BY t.FechaTipoCambio DESC),
                        @eur = (SELECT TOP (1) t.Venta FROM dbo.a_tipo_cambio_diario t
                                WHERE t.Activo = 1 AND t.MonedaOrigen = ''EUR'' AND t.MonedaDestino = ''PEN'' AND t.FechaTipoCambio <= @hoy
                                ORDER BY t.FechaTipoCambio DESC),
                        @dop = (SELECT TOP (1) t.Venta FROM dbo.a_tipo_cambio_diario t
                                WHERE t.Activo = 1 AND t.MonedaOrigen = ''DOP'' AND t.MonedaDestino = ''PEN'' AND t.FechaTipoCambio <= @hoy
                                ORDER BY t.FechaTipoCambio DESC),
                        @cop = (SELECT TOP (1) t.Venta FROM dbo.a_tipo_cambio_diario t
                                WHERE t.Activo = 1 AND t.MonedaOrigen = ''COP'' AND t.MonedaDestino = ''PEN'' AND t.FechaTipoCambio <= @hoy
                                ORDER BY t.FechaTipoCambio DESC);',
                    N'@hoy DATE, @usd DECIMAL(18,6) OUTPUT, @eur DECIMAL(18,6) OUTPUT, @dop DECIMAL(18,6) OUTPUT, @cop DECIMAL(18,6) OUTPUT',
                    @hoy = @TcHoy,
                    @usd = @TcTablaUSD OUTPUT, @eur = @TcTablaEUR OUTPUT,
                    @dop = @TcTablaDOP OUTPUT, @cop = @TcTablaCOP OUTPUT;
            END TRY
            BEGIN CATCH
                -- La tabla de tipos de cambio no es obligatoria: ante cualquier fallo se usa el respaldo.
                SET @TcTablaUSD = NULL; SET @TcTablaEUR = NULL; SET @TcTablaDOP = NULL; SET @TcTablaCOP = NULL;
            END CATCH;

            SET @TipoCambioUSD = COALESCE(@TipoCambioUSD, @TcTablaUSD);
            SET @TipoCambioEUR = COALESCE(@TipoCambioEUR, @TcTablaEUR);
            SET @TipoCambioDOP = COALESCE(@TipoCambioDOP, @TcTablaDOP);
            SET @TipoCambioCOP = COALESCE(@TipoCambioCOP, @TcTablaCOP);
        END;

        -- Valores por defecto (decision de negocio 2026-10-03) cuando no hay parametro ni tabla.
        SET @TipoCambioUSD = COALESCE(@TipoCambioUSD, 3.50);
        SET @TipoCambioEUR = COALESCE(@TipoCambioEUR, 3.80);
        SET @TipoCambioDOP = COALESCE(@TipoCambioDOP, 0.057);
        SET @TipoCambioCOP = COALESCE(@TipoCambioCOP, 0.0010);

        -- Los calculos globales existentes usan @TipoCambio (solo USD): se alinea con el USD resuelto.
        SET @TipoCambio = @TipoCambioUSD;

        /* ============================================================
           1.1 NORMALIZAR PARÁMETROS DE FECHA

           IMPORTANTE:
           - El campo físico a.FecIngreso se guarda como VARCHAR mm/dd/yyyy.
           - Para filtrar se convierte con estilo 101.
           - Para mostrar se convierte a estilo 103.
           ============================================================ */

        DECLARE @FechaInicioDate DATE = NULL;
        DECLARE @FechaFinDate DATE = NULL;

        SET @FechaInicioDate =
            CASE
                WHEN @FechaInicio IS NULL THEN NULL

                -- Serial Excel
                WHEN TRY_CONVERT(INT, @FechaInicio) IS NOT NULL
                     AND TRY_CONVERT(INT, @FechaInicio) BETWEEN 30000 AND 60000
                    THEN CONVERT(DATE, DATEADD(DAY, TRY_CONVERT(INT, @FechaInicio), '18991230'))

                -- ISO yyyy-MM-dd
                WHEN TRY_CONVERT(DATE, @FechaInicio, 23) IS NOT NULL
                    THEN TRY_CONVERT(DATE, @FechaInicio, 23)

                -- ISO compacto yyyyMMdd
                WHEN TRY_CONVERT(DATE, @FechaInicio, 112) IS NOT NULL
                    THEN TRY_CONVERT(DATE, @FechaInicio, 112)

                -- Parámetro en formato dd/mm/yyyy
                WHEN @FormatoFecha = 'DMY'
                     AND TRY_CONVERT(DATE, @FechaInicio, 103) IS NOT NULL
                    THEN TRY_CONVERT(DATE, @FechaInicio, 103)

                -- Parámetro en formato mm/dd/yyyy
                WHEN @FormatoFecha = 'MDY'
                     AND TRY_CONVERT(DATE, @FechaInicio, 101) IS NOT NULL
                    THEN TRY_CONVERT(DATE, @FechaInicio, 101)

                -- Respaldo DMY
                WHEN TRY_CONVERT(DATE, @FechaInicio, 103) IS NOT NULL
                    THEN TRY_CONVERT(DATE, @FechaInicio, 103)

                -- Respaldo MDY
                WHEN TRY_CONVERT(DATE, @FechaInicio, 101) IS NOT NULL
                    THEN TRY_CONVERT(DATE, @FechaInicio, 101)

                ELSE NULL
            END;

        SET @FechaFinDate =
            CASE
                WHEN @FechaFin IS NULL THEN NULL

                -- Serial Excel
                WHEN TRY_CONVERT(INT, @FechaFin) IS NOT NULL
                     AND TRY_CONVERT(INT, @FechaFin) BETWEEN 30000 AND 60000
                    THEN CONVERT(DATE, DATEADD(DAY, TRY_CONVERT(INT, @FechaFin), '18991230'))

                -- ISO yyyy-MM-dd
                WHEN TRY_CONVERT(DATE, @FechaFin, 23) IS NOT NULL
                    THEN TRY_CONVERT(DATE, @FechaFin, 23)

                -- ISO compacto yyyyMMdd
                WHEN TRY_CONVERT(DATE, @FechaFin, 112) IS NOT NULL
                    THEN TRY_CONVERT(DATE, @FechaFin, 112)

                -- Parámetro en formato dd/mm/yyyy
                WHEN @FormatoFecha = 'DMY'
                     AND TRY_CONVERT(DATE, @FechaFin, 103) IS NOT NULL
                    THEN TRY_CONVERT(DATE, @FechaFin, 103)

                -- Parámetro en formato mm/dd/yyyy
                WHEN @FormatoFecha = 'MDY'
                     AND TRY_CONVERT(DATE, @FechaFin, 101) IS NOT NULL
                    THEN TRY_CONVERT(DATE, @FechaFin, 101)

                -- Respaldo DMY
                WHEN TRY_CONVERT(DATE, @FechaFin, 103) IS NOT NULL
                    THEN TRY_CONVERT(DATE, @FechaFin, 103)

                -- Respaldo MDY
                WHEN TRY_CONVERT(DATE, @FechaFin, 101) IS NOT NULL
                    THEN TRY_CONVERT(DATE, @FechaFin, 101)

                ELSE NULL
            END;

        IF @FechaInicio IS NOT NULL AND @FechaInicioDate IS NULL
        BEGIN
            THROW 50002, 'FechaInicio no tiene un formato válido. Use dd/mm/yyyy, yyyy-MM-dd, yyyyMMdd, mm/dd/yyyy o serial Excel.', 1;
        END;

        IF @FechaFin IS NOT NULL AND @FechaFinDate IS NULL
        BEGIN
            THROW 50003, 'FechaFin no tiene un formato válido. Use dd/mm/yyyy, yyyy-MM-dd, yyyyMMdd, mm/dd/yyyy o serial Excel.', 1;
        END;

        /* ============================================================
           2. OBTENER PALABRAS CLAVE
           ============================================================ */
        DECLARE @Terminos TABLE
        (
            Termino NVARCHAR(100) NOT NULL PRIMARY KEY
        );

        IF @TextoBusqueda IS NOT NULL
        BEGIN
            DECLARE @TextoNormalizado NVARCHAR(500);

            SET @TextoNormalizado = LOWER(@TextoBusqueda);

            SET @TextoNormalizado = REPLACE(@TextoNormalizado, ',', ' ');
            SET @TextoNormalizado = REPLACE(@TextoNormalizado, '.', ' ');
            SET @TextoNormalizado = REPLACE(@TextoNormalizado, ';', ' ');
            SET @TextoNormalizado = REPLACE(@TextoNormalizado, ':', ' ');
            SET @TextoNormalizado = REPLACE(@TextoNormalizado, '-', ' ');
            SET @TextoNormalizado = REPLACE(@TextoNormalizado, '/', ' ');
            SET @TextoNormalizado = REPLACE(@TextoNormalizado, '\', ' ');
            SET @TextoNormalizado = REPLACE(@TextoNormalizado, '(', ' ');
            SET @TextoNormalizado = REPLACE(@TextoNormalizado, ')', ' ');

            INSERT INTO @Terminos
            (
                Termino
            )
            SELECT DISTINCT
                LEFT(LTRIM(RTRIM(value)), 100)
            FROM STRING_SPLIT(@TextoNormalizado, ' ')
            WHERE LEN(LTRIM(RTRIM(value))) >= 3
              AND LTRIM(RTRIM(value)) NOT IN
              (
                  N'los',
                  N'las',
                  N'una',
                  N'uno',
                  N'para',
                  N'por',
                  N'con',
                  N'que',
                  N'del',
                  N'este',
                  N'esta',
                  N'estos',
                  N'estas',
                  N'mostrar',
                  N'muestra',
                  N'muéstrame',
                  N'buscar',
                  N'busca',
                  N'consulta',
                  N'consultar',
                  N'quiero',
                  N'necesito',
                  N'gasto',
                  N'gastos',
                  N'pago',
                  N'pagos',
                  N'planilla',
                  N'registro',
                  N'registros',
                  N'saber',
                  N'dame',
                  N'ver',
                  N'listar',
                  N'obtener',
                  N'informe',
                  N'reporte',
                  N'reportes',
                  N'periodo',
                  N'período',
                  N'mes',
                  N'año',
                  N'durante',
                  N'correspondiente',
                  N'informacion',
                  N'información',
                  N'datos',
                  N'el',
                  N'la',
                  N'de',
                  N'en',
                  N'cuantos',
                  N'cuántos',
                  N'recibos',
                  N'recibo'
              );
        END;

        /* ============================================================
           3. FILTRAR CANDIDATOS PRIMERO
              (el alcance se aplica AQUI, antes del conteo y la paginación)
           ============================================================ */
        CREATE TABLE #Candidatos
        (
            IdPlanilla    INT NOT NULL PRIMARY KEY,
            Fecha         DATE NULL,
            Coincidencias INT NOT NULL
        );

        INSERT INTO #Candidatos
        (
            IdPlanilla,
            Fecha,
            Coincidencias
        )
        SELECT
            x.IdPlanilla,
            MAX(x.Fecha) AS Fecha,
            MAX(x.Coincidencias) AS Coincidencias
        FROM
        (
            SELECT
                a.Correlativo AS IdPlanilla,

                -- El campo está guardado como VARCHAR mm/dd/yyyy.
                -- Se convierte a DATE solo para filtrar y ordenar.
                TRY_CONVERT(DATE, a.FecIngreso, 101) AS Fecha,

                (
                    SELECT
                        COUNT(*)
                    FROM @Terminos t
                    WHERE
                        LOWER(
                            CONCAT(
                                ISNULL(CONVERT(NVARCHAR(MAX), a.Detalle), N''), N' ',
                                ISNULL(CONVERT(NVARCHAR(MAX), a.Comentario), N''), N' ',
                                ISNULL(CONVERT(NVARCHAR(MAX), cli.NombreCliente), N''), N' ',
                                ISNULL(CONVERT(NVARCHAR(MAX), pro.NombreProyecto), N''), N' ',
                                ISNULL(CONVERT(NVARCHAR(MAX), sit.NombreSite), N''), N' ',
                                ISNULL(CONVERT(NVARCHAR(MAX), a.IdSite), N''), N' ',
                                ISNULL(CONVERT(NVARCHAR(MAX), a.Ot), N''), N' ',
                                ISNULL(CONVERT(NVARCHAR(MAX), emp.NombreEmpleado), N''), N' ',
                                ISNULL(CONVERT(NVARCHAR(MAX), a.Responsable), N''), N' ',

                                ISNULL(
                                    CONVERT(
                                        NVARCHAR(MAX),
                                        CASE
                                            WHEN ISNULL(a.IdWeb, 0) = 1
                                                THEN m_cj.NombreEmpleado
                                            ELSE
                                                m_emp.NombreEmpleado
                                        END
                                    ),
                                    N''
                                ), N' ',

                                ISNULL(CONVERT(NVARCHAR(MAX), est.ValorIni), N''), N' ',
                                ISNULL(CONVERT(NVARCHAR(MAX), bien.ValorIni), N''), N' ',
                                ISNULL(CONVERT(NVARCHAR(MAX), comp.ValorIni), N''), N' ',
                                ISNULL(CONVERT(NVARCHAR(MAX), tpago.ValorIni), N''), N' ',
                                ISNULL(CONVERT(NVARCHAR(MAX), a.Tipo_Trabajo), N''), N' ',
                                ISNULL(CONVERT(NVARCHAR(MAX), a.Serie), N''), N' ',
                                ISNULL(CONVERT(NVARCHAR(MAX), a.IdOc), N'')
                            )
                        ) COLLATE Latin1_General_100_CI_AI
                        LIKE
                        N'%'
                        +
                        t.Termino COLLATE Latin1_General_100_CI_AI
                        +
                        N'%'
                ) AS Coincidencias,

                (
                    SELECT
                        COUNT(*)
                    FROM @Terminos
                ) AS TotalTerminos

            FROM dbo.Planilla a

            INNER JOIN dbo.Proyecto pro
                ON pro.IdProyecto = a.IdProyecto

            LEFT JOIN dbo.Cliente cli
                ON cli.IdCliente = a.IdCliente

            LEFT JOIN dbo.Site sit
                ON sit.IdSite = a.IdSite
                AND sit.Correlativo = a.CorreSite

            LEFT JOIN dbo.Empleado emp
                ON emp.IdEmpleado = a.IdResponsable

            LEFT JOIN dbo.Empleado m_emp
                ON m_emp.IdEmpleado = a.IdSolicitante
               AND ISNULL(a.IdWeb, 0) <> 1

            LEFT JOIN dbo.EmpleadoCj m_cj
                ON m_cj.IdEmpleado = a.IdSolicitante
               AND ISNULL(a.IdWeb, 0) = 1

            LEFT JOIN dbo.Constante est
                ON est.Sociedad = 'PE01'
                AND est.Programa = 'MAESTRO'
                AND est.Campo = 'ESTADO'
                AND est.Correlativo = a.Estado

            LEFT JOIN dbo.Constante bien
                ON bien.Sociedad = 'PE01'
                AND bien.Programa = 'PLANTILLA'
                AND bien.Campo = 'TIPO_BIEN'
                AND bien.Correlativo = a.IdBien

            LEFT JOIN dbo.Constante comp
                ON comp.Sociedad = 'PE01'
                AND comp.Programa = 'PLANTILLA'
                AND comp.Campo = 'TIPO_COMPROBANTE'
                AND comp.Correlativo = a.IdComprobante

            LEFT JOIN dbo.Constante tpago
                ON tpago.Sociedad = 'PE01'
                AND tpago.Programa = 'PLANTILLA'
                AND tpago.Campo = 'TIPO_PAGO'
                AND tpago.Correlativo = a.IdTipoPago

            WHERE
                -- ALCANCE (obligatorio). Un identificador corporativo NULL nunca coincide.
                (
                    @AlcanceNivel = 'TOTAL'
                    OR
                    (
                        @AlcanceNivel = 'RESTRINGIDO'
                        AND
                        (
                            (
                                @AlcanceCampos IN ('R', 'RS')
                                AND EXISTS
                                (
                                    SELECT 1
                                    FROM @AlcanceIds ai
                                    WHERE ai.IdEmpleadoCj = emp.IdEmpleadoCj
                                )
                            )
                            OR
                            (
                                @AlcanceCampos IN ('S', 'RS')
                                AND EXISTS
                                (
                                    SELECT 1
                                    FROM @AlcanceIds ai
                                    WHERE ai.IdEmpleadoCj =
                                          CASE
                                              WHEN ISNULL(a.IdWeb, 0) = 1
                                                  THEN m_cj.IdEmpleado
                                              ELSE
                                                  m_emp.IdEmpleadoCj
                                          END
                                )
                            )
                        )
                    )
                )
                AND
                (
                    @FechaInicioDate IS NULL
                    OR TRY_CONVERT(DATE, a.FecIngreso, 101) >= @FechaInicioDate
                )
                AND
                (
                    @FechaFinDate IS NULL
                    OR TRY_CONVERT(DATE, a.FecIngreso, 101) < DATEADD(DAY, 1, @FechaFinDate)
                )
                AND
                (
                    @Estados IS NULL
                    OR EXISTS
                    (
                        SELECT 1
                        FROM STRING_SPLIT(@Estados, ',') estados
                        WHERE NULLIF(LTRIM(RTRIM(estados.value)), '') IS NOT NULL
                          AND ISNULL(est.ValorIni, '')
                              COLLATE Latin1_General_100_CI_AI
                              LIKE
                              '%'
                              +
                              LTRIM(RTRIM(estados.value))
                              +
                              '%'
                    )
                )
                AND
                (
                    @IdSite IS NULL
                    OR CONVERT(NVARCHAR(50), a.IdSite) = @IdSite
                )
                AND
                (
                    @CorreSite IS NULL
                    OR a.CorreSite = @CorreSite
                )
                AND
                (
                    @Site IS NULL
                    OR ISNULL(sit.NombreSite, '')
                       COLLATE Latin1_General_100_CI_AI
                       LIKE '%' + @Site + '%'
                )
                AND
                (
                    @Cliente IS NULL
                    OR ISNULL(cli.NombreCliente, '')
                       COLLATE Latin1_General_100_CI_AI
                       LIKE '%' + @Cliente + '%'
                )
                AND
                (
                    @Proyecto IS NULL
                    OR ISNULL(pro.NombreProyecto, '')
                       COLLATE Latin1_General_100_CI_AI
                       LIKE '%' + @Proyecto + '%'
                )
                AND
                (
                    @Responsable IS NULL
                    OR COALESCE(emp.NombreEmpleado, a.Responsable, '')
                       COLLATE Latin1_General_100_CI_AI
                       LIKE '%' + @Responsable + '%'
                )
                AND
                (
                    @Solicitante IS NULL
                    OR ISNULL(
                           CASE
                               WHEN ISNULL(a.IdWeb, 0) = 1
                                   THEN m_cj.NombreEmpleado
                               ELSE
                                   m_emp.NombreEmpleado
                           END,
                           ''
                       )
                       COLLATE Latin1_General_100_CI_AI
                       LIKE '%' + @Solicitante + '%'
                )
                AND
                (
                    @Ot IS NULL
                    OR CONVERT(NVARCHAR(100), a.Ot)
                       COLLATE Latin1_General_100_CI_AI
                       LIKE '%' + @Ot + '%'
                )
        ) x
        WHERE
            x.TotalTerminos = 0
            OR
            (
                @CoincidirTodas = 1
                AND x.Coincidencias = x.TotalTerminos
            )
            OR
            (
                @CoincidirTodas = 0
                AND x.Coincidencias > 0
            )
        GROUP BY
            x.IdPlanilla;

        /* ============================================================
           4. PAGINAR CANDIDATOS ANTES DE CÁLCULOS PESADOS
           ============================================================ */
        CREATE TABLE #Pagina
        (
            IdPlanilla     INT NOT NULL PRIMARY KEY,
            Fecha          DATE NULL,
            Coincidencias  INT NOT NULL,
            TotalRegistros INT NOT NULL
        );

        INSERT INTO #Pagina
        (
            IdPlanilla,
            Fecha,
            Coincidencias,
            TotalRegistros
        )
        SELECT
            p.IdPlanilla,
            p.Fecha,
            p.Coincidencias,
            p.TotalRegistros
        FROM
        (
            SELECT
                c.IdPlanilla,
                c.Fecha,
                c.Coincidencias,
                COUNT(*) OVER() AS TotalRegistros,
                ROW_NUMBER() OVER
                (
                    ORDER BY
                        c.Coincidencias DESC,
                        c.Fecha DESC,
                        c.IdPlanilla DESC
                ) AS NumeroFila
            FROM #Candidatos c
        ) p
        WHERE p.NumeroFila BETWEEN
              ((@Pagina - 1) * @TamanoPagina) + 1
              AND
              (@Pagina * @TamanoPagina);

        /* ============================================================
           5. RESULTADO FINAL
              Las 15 columnas globales (site/OC sobre toda la tabla) devuelven
              NULL cuando @VerTotalesGlobales = 0; con el permiso, los
              cálculos son idénticos a la versión anterior.
           ============================================================ */
        SELECT
            a.Correlativo AS IdPlanilla,

            -- ÚNICO FORMATO PERMITIDO PARA VISUALIZAR:
            -- dd/mm/yyyy
            CONVERT(VARCHAR(10), TRY_CONVERT(DATE, a.FecIngreso, 101), 103) AS Fecha,

            a.FechaDeposito,

            CAST(ISNULL(a.Detalle, '') AS VARCHAR(MAX)) AS Detalle,

            a.Comentario,

            ISNULL(est.ValorIni, '') AS Estado,

            ISNULL(cli.NombreCliente, '') AS Cliente,

            ISNULL(pro.NombreProyecto, '') AS Proyecto,

            a.IdSite,

            ISNULL(sit.NombreSite, '') AS Site,

            a.Ot,

            a.IdResponsable,

            COALESCE(emp.NombreEmpleado, a.Responsable, '') AS Responsable,

            CASE
                WHEN ISNULL(a.IdWeb, 0) = 1
                    THEN ISNULL(m_cj.NombreEmpleado, '')
                ELSE
                    ISNULL(m_emp.NombreEmpleado, '')
            END AS Solicitante,

            ISNULL(bien.ValorIni, '') AS Bien,

            ISNULL(comp.ValorIni, '') AS Comprobante,

            ISNULL(tpago.ValorIni, '') AS TipoPago,

            ISNULL(mon.ValorIni, '') AS Moneda,

            CAST(ISNULL(a.Subtotal, 0) AS DECIMAL(18, 2)) AS Subtotal,

            CAST(ISNULL(a.Igv, 0) AS DECIMAL(18, 2)) AS Igv,

            CAST(ISNULL(a.Total, 0) AS DECIMAL(18, 2)) AS Total,

            -- Valores de la propia fila (no son globales): se mantienen siempre.
            -- NULL cuando falta el tipo de cambio de la moneda (ver TipoCambioFaltante).
            CAST(ISNULL(a.Subtotal, 0) * tcFila.Tc AS DECIMAL(18, 2)) AS SubtotalSoles,

            CAST(ISNULL(a.Igv, 0) * tcFila.Tc AS DECIMAL(18, 2)) AS IGVSoles,

            CAST(ISNULL(a.Total, 0) * tcFila.Tc AS DECIMAL(18, 2)) AS TotalSoles,

            CAST(tcFila.Tc AS DECIMAL(18, 6)) AS TipoCambioAplicado,

            CASE WHEN tcFila.Tc IS NULL THEN 1 ELSE 0 END AS TipoCambioFaltante,

            a.Estado AS IdEstado,

            a.IdCliente,

            a.IdProyecto,

            a.CorreSite,

            a.TipoMoneda,

            ISNULL(ban.ValorIni, '') AS Banco,

            a.NroOperacion,

            a.FecEmision,

            a.FechaPagoCre,

            CASE
                WHEN ISNULL(a.IdWeb, 0) = 1
                    THEN ISNULL(g_cj.NombreEmpleado, '')
                ELSE
                    ISNULL(g_emp.NombreEmpleado, '')
            END AS Gestor,

            CASE
                WHEN ISNULL(a.IdWeb, 0) = 1
                    THEN ISNULL(v_cj.NombreEmpleado, '')
                ELSE
                    ISNULL(v_emp.NombreEmpleado, '')
            END AS Validador,

            ISNULL(tarea.ValorIni, '') AS Tarea,

            coc.IdEstado AS IdEstadoOc,

            -- R rechazada | A aprobada | 3, 2, 1 en N-esima aprobacion | P pre-aprobacion
            CASE
                WHEN coc.IdEstado = 6 THEN 'R'
                WHEN ISNULL(coc.IdAprobador3, 0) > 0 THEN 'A'
                WHEN ISNULL(coc.IdAprobador2, 0) > 0 THEN '3'
                WHEN ISNULL(coc.IdAprobador1, 0) > 0 THEN '2'
                WHEN ISNULL(coc.IdGestor, 0) > 0 THEN '1'
                ELSE 'P'
            END AS EstadoOcSemaforo,

            a.MontoRetencion,

            a.TotalPagar AS TotalPagarOriginal,

            CAST(a.TotalPagar * tcFila.Tc AS DECIMAL(18, 2)) AS TotalPagarSoles,

            -- Datos bancarios/identidad del responsable (misma fuente que sp_Planilla_Consulta_Estados).
            ctaEmp.Cuenta,

            ctaEmp.CuentaInter,

            CASE
                WHEN emp.IdCargo IN (10, 11, 83)
                    THEN emp.NroDocumento
            END AS RUC,

            -- [1/15] Ventas
            CASE WHEN @VerTotalesGlobales = 1
                THEN CAST(COALESCE(montoSitio.MontoOc, 0) AS DECIMAL(18, 2))
            END AS Ventas,

            -- [2/15] TotalPagadoHistoricoSoles
            CASE WHEN @VerTotalesGlobales = 1
                THEN CAST(COALESCE(pagSitio.TotalPagadoHistoricoSoles, 0) AS DECIMAL(18, 2))
            END AS TotalPagadoHistoricoSoles,

            -- [3/15] ConPagadoSoles
            CASE WHEN @VerTotalesGlobales = 1
                THEN CAST(calcSitio.ConPagadoSoles AS DECIMAL(18, 2))
            END AS ConPagadoSoles,

            -- [4/15] ConPagadoMonedaRegistro
            CASE WHEN @VerTotalesGlobales = 1
                THEN CAST(calcMoneda.ConPagadoMonedaRegistro AS DECIMAL(18, 2))
            END AS ConPagadoMonedaRegistro,

            -- [5/15] ConPagado
            CASE WHEN @VerTotalesGlobales = 1
                THEN
                    CASE
                        WHEN a.TipoMoneda = 1
                            THEN CONCAT('S/.', FORMAT(CAST(calcMoneda.ConPagadoMonedaRegistro AS DECIMAL(18, 2)), 'N2'))
                        ELSE CONCAT('$', FORMAT(CAST(calcMoneda.ConPagadoMonedaRegistro AS DECIMAL(18, 2)), 'N2'))
                    END
            END AS ConPagado,

            -- [6/15] SaldoOcSitio
            CASE WHEN @VerTotalesGlobales = 1
                THEN
                    CAST(
                        COALESCE(montoSitio.MontoOc, 0)
                        -
                        calcMoneda.ConPagadoMonedaRegistro
                        AS DECIMAL(18, 2)
                    )
            END AS SaldoOcSitio,

            -- [7/15] SubOc
            CASE WHEN @VerTotalesGlobales = 1
                THEN CAST(COALESCE(ocEmpleado.SubOc, 0) AS DECIMAL(18, 2))
            END AS SubOc,

            -- [8/15] SubPlanilla
            CASE WHEN @VerTotalesGlobales = 1
                THEN CAST(COALESCE(pagoOcEmpleado.SubPlanilla, 0) AS DECIMAL(18, 2))
            END AS SubPlanilla,

            -- [9/15] SubPlanillaConRegistroActual
            CASE WHEN @VerTotalesGlobales = 1
                THEN CAST(calcOcEmpleado.SubPlanillaConRegistroActual AS DECIMAL(18, 2))
            END AS SubPlanillaConRegistroActual,

            -- [10/15] PorcentajeSubPlanilla
            CASE WHEN @VerTotalesGlobales = 1
                THEN
                    CAST(
                        CASE
                            WHEN COALESCE(ocEmpleado.SubOc, 0) = 0
                                THEN 0
                            ELSE
                                (
                                    COALESCE(pagoOcEmpleado.SubPlanilla, 0)
                                    /
                                    NULLIF(ocEmpleado.SubOc, 0)
                                ) * 100
                        END
                        AS DECIMAL(18, 2)
                    )
            END AS PorcentajeSubPlanilla,

            -- [11/15] AdelaFic
            CASE WHEN @VerTotalesGlobales = 1
                THEN CAST(calcOcEmpleado.SubPlanillaConRegistroActual AS DECIMAL(18, 2))
            END AS AdelaFic,

            -- [12/15] DiferenciaFic
            CASE WHEN @VerTotalesGlobales = 1
                THEN CAST(validacionOc.DiferenciaFic AS DECIMAL(18, 2))
            END AS DiferenciaFic,

            -- [13/15] CodigoValidacionFic
            CASE WHEN @VerTotalesGlobales = 1
                THEN validacionOc.CodigoValidacionFic
            END AS CodigoValidacionFic,

            -- [14/15] ResultadoValidacionFic
            CASE WHEN @VerTotalesGlobales = 1
                THEN validacionOc.ResultadoValidacionFic
            END AS ResultadoValidacionFic,

            -- [15/15] PorcentajeFic
            CASE WHEN @VerTotalesGlobales = 1
                THEN CAST(validacionOc.PorcentajeFic AS DECIMAL(18, 2))
            END AS PorcentajeFic,

            -- [16/21] TotalSubtotalPorMoneda (pagado, estado 4, por site/trabajo y moneda del registro)
            CASE WHEN @VerTotalesGlobales = 1
                THEN CAST(ISNULL(pot.TotalSubtotalPorMoneda, 0) AS DECIMAL(18, 2))
            END AS TotalSubtotalPorMoneda,

            -- [17/21] TotalMontoBckPorMoneda
            CASE WHEN @VerTotalesGlobales = 1
                THEN CAST(ISNULL(iot.TotalMontoBckPorMoneda, 0) AS DECIMAL(18, 2))
            END AS TotalMontoBckPorMoneda,

            -- [18/21] TotalMontoVisiblePorMoneda
            CASE WHEN @VerTotalesGlobales = 1
                THEN CAST(ISNULL(iot.TotalMontoVisiblePorMoneda, 0) AS DECIMAL(18, 2))
            END AS TotalMontoVisiblePorMoneda,

            -- [19/21] TotalPagadoConvertidoSoles (NULL tambien si falta algun TC)
            CASE WHEN @VerTotalesGlobales = 1
                THEN pots.TotalPagadoConvertidoSoles
            END AS TotalPagadoConvertidoSoles,

            -- [20/21] TipoCambioFaltanteOT
            CASE WHEN @VerTotalesGlobales = 1
                THEN CAST(ISNULL(pots.TipoCambioFaltanteOT, 0) AS INT)
            END AS TipoCambioFaltanteOT,

            -- [21/21] TotalPagarProcesado (suma sobre otras filas con el mismo NroOperacion en Scotiabank)
            CASE WHEN @VerTotalesGlobales = 1
                THEN
                    CASE
                        WHEN UPPER(LTRIM(RTRIM(ISNULL(ban.ValorIni, '')))) LIKE '%SCOTI%'
                            THEN pbanco.TotalPagarAgrupado
                        ELSE
                            a.TotalPagar
                    END
            END AS TotalPagarProcesado,

            a.Tipo_Trabajo,

            a.IdOc,

            a.Serie,

            a.Usuario,

            a.HoraCreacion,

            pg.Coincidencias,

            pg.TotalRegistros

        FROM #Pagina pg

        INNER JOIN dbo.Planilla a
            ON a.Correlativo = pg.IdPlanilla

        INNER JOIN dbo.Proyecto pro
            ON pro.IdProyecto = a.IdProyecto

        LEFT JOIN dbo.Cliente cli
            ON cli.IdCliente = a.IdCliente

        LEFT JOIN dbo.Site sit
            ON sit.IdSite = a.IdSite
            AND sit.Correlativo = a.CorreSite

        LEFT JOIN dbo.Empleado emp
            ON emp.IdEmpleado = a.IdResponsable

        LEFT JOIN dbo.Empleado m_emp
            ON m_emp.IdEmpleado = a.IdSolicitante
           AND ISNULL(a.IdWeb, 0) <> 1

        LEFT JOIN dbo.EmpleadoCj m_cj
            ON m_cj.IdEmpleado = a.IdSolicitante
           AND ISNULL(a.IdWeb, 0) = 1

        LEFT JOIN dbo.Constante bien
            ON bien.Sociedad = 'PE01'
            AND bien.Programa = 'PLANTILLA'
            AND bien.Campo = 'TIPO_BIEN'
            AND bien.Correlativo = a.IdBien

        LEFT JOIN dbo.Constante comp
            ON comp.Sociedad = 'PE01'
            AND comp.Programa = 'PLANTILLA'
            AND comp.Campo = 'TIPO_COMPROBANTE'
            AND comp.Correlativo = a.IdComprobante

        LEFT JOIN dbo.Constante tpago
            ON tpago.Sociedad = 'PE01'
            AND tpago.Programa = 'PLANTILLA'
            AND tpago.Campo = 'TIPO_PAGO'
            AND tpago.Correlativo = a.IdTipoPago

        LEFT JOIN dbo.Constante mon
            ON mon.Sociedad = 'PE01'
            AND mon.Programa = 'PLANTILLA'
            AND mon.Campo = 'TIPO_MONEDA'
            AND mon.Correlativo = a.TipoMoneda

        LEFT JOIN dbo.Constante est
            ON est.Sociedad = 'PE01'
            AND est.Programa = 'MAESTRO'
            AND est.Campo = 'ESTADO'
            AND est.Correlativo = a.Estado

        LEFT JOIN dbo.Constante ban
            ON ban.Sociedad = 'PE01'
            AND ban.Programa = 'PLANTILLA'
            AND ban.Campo = 'BANCO'
            AND ban.Correlativo = a.IdBanco

        LEFT JOIN dbo.Constante tarea
            ON tarea.Sociedad = 'PE01'
            AND tarea.Programa = 'PLANTILLA'
            AND tarea.Campo = 'TAREA'
            AND tarea.Correlativo = a.IdTarea

        LEFT JOIN dbo.CabOrdenCompra coc
            ON coc.IdOc = TRY_CONVERT(INT, a.IdOc)

        LEFT JOIN dbo.Empleado g_emp
            ON g_emp.IdEmpleado = a.IdGestor
           AND ISNULL(a.IdWeb, 0) <> 1

        LEFT JOIN dbo.EmpleadoCj g_cj
            ON g_cj.IdEmpleado = a.IdGestor
           AND ISNULL(a.IdWeb, 0) = 1

        LEFT JOIN dbo.Empleado v_emp
            ON v_emp.IdEmpleado = a.IdValidador
           AND ISNULL(a.IdWeb, 0) <> 1

        LEFT JOIN dbo.EmpleadoCj v_cj
            ON v_cj.IdEmpleado = a.IdValidador
           AND ISNULL(a.IdWeb, 0) = 1

        -- TOP 1 evita multiplicar la fila si el responsable tiene mas de una CuentaEmpleado.
        OUTER APPLY
        (
            SELECT TOP (1)
                ce.Cuenta,
                ce.CuentaInter
            FROM dbo.CuentaEmpleado ce
            WHERE ce.IdEmpleado = a.IdResponsable
            ORDER BY ce.IdEmpleado
        ) ctaEmp

        -- Tipo de cambio de la moneda del registro (NULL si no hay TC o la moneda no es 1-5).
        OUTER APPLY
        (
            SELECT
                CASE a.TipoMoneda
                    WHEN 1 THEN CAST(1 AS DECIMAL(18, 6))
                    WHEN 2 THEN @TipoCambioUSD
                    WHEN 3 THEN @TipoCambioEUR
                    WHEN 4 THEN @TipoCambioDOP
                    WHEN 5 THEN @TipoCambioCOP
                END AS Tc
        ) tcFila

        OUTER APPLY
        (
            SELECT
                CAST(
                    CASE
                        WHEN a.TipoMoneda = 1
                            THEN ISNULL(a.Subtotal, 0)
                        WHEN a.TipoMoneda = 2
                            THEN ISNULL(a.Subtotal, 0) * @TipoCambio
                        ELSE ISNULL(a.Subtotal, 0)
                    END
                    AS DECIMAL(18, 6)
                ) AS SubtotalActualSoles
        ) actual

        -- Los 4 bloques APPLY siguientes son GLOBALES (toda la tabla por site/OC).
        -- Llevan "WHERE @VerTotalesGlobales = 1" con la intencion de no ejecutarse sin el
        -- permiso; esa omision NO esta verificada (pendiente plan de ejecucion real).
        -- La proteccion de datos la dan los CASE del SELECT final, no esta condicion.
        OUTER APPLY
        (
            SELECT
                CAST(
                    COALESCE(SUM(ISNULL(i.MontoOc, 0)), 0)
                    AS DECIMAL(18, 6)
                ) AS MontoOc
            FROM dbo.Importar i
            WHERE @VerTotalesGlobales = 1
              AND i.idestado=1
              AND i.IdCliente = a.IdCliente
              AND i.IdProyecto = a.IdProyecto
              AND i.IdSite = a.IdSite
              AND i.Correlativo = a.CorreSite
              AND
              (
                  i.TipoTrabajo = a.Tipo_Trabajo
                  OR
                  (
                      i.TipoTrabajo IS NULL
                      AND a.Tipo_Trabajo IS NULL
                  )
              )
        ) montoSitio

        OUTER APPLY
        (
            SELECT
                CAST(
                    COALESCE(
                        SUM(
                            CASE
                                WHEN p.TipoMoneda = 1
                                    THEN ISNULL(p.Subtotal, 0)
                                WHEN p.TipoMoneda = 2
                                    THEN ISNULL(p.Subtotal, 0) * @TipoCambio
                                ELSE ISNULL(p.Subtotal, 0)
                            END
                        ),
                        0
                    )
                    AS DECIMAL(18, 6)
                ) AS TotalPagadoHistoricoSoles
            FROM dbo.Planilla p
            WHERE @VerTotalesGlobales = 1
              AND p.IdCliente = a.IdCliente
              AND p.IdProyecto = a.IdProyecto
              AND p.IdSite = a.IdSite
              AND p.CorreSite = a.CorreSite
              AND p.Correlativo <> a.Correlativo
              AND p.Estado = 4
              AND
              (
                  p.Tipo_Trabajo = a.Tipo_Trabajo
                  OR
                  (
                      p.Tipo_Trabajo IS NULL
                      AND a.Tipo_Trabajo IS NULL
                  )
              )
        ) pagSitio

        OUTER APPLY
        (
            SELECT
                CAST(
                    COALESCE(pagSitio.TotalPagadoHistoricoSoles, 0)
                    +
                    COALESCE(actual.SubtotalActualSoles, 0)
                    AS DECIMAL(18, 6)
                ) AS ConPagadoSoles
        ) calcSitio

        OUTER APPLY
        (
            SELECT
                CAST(
                    CASE
                        WHEN a.TipoMoneda = 2
                            THEN calcSitio.ConPagadoSoles / NULLIF(@TipoCambio, 0)
                        ELSE calcSitio.ConPagadoSoles
                    END
                    AS DECIMAL(18, 6)
                ) AS ConPagadoMonedaRegistro
        ) calcMoneda

        OUTER APPLY
        (
            SELECT
                CAST(
                    COALESCE(
                        SUM(
                            CASE
                                WHEN doc.IdMoneda = 1
                                    THEN ISNULL(det.PrecioUnitario, 0) * ISNULL(det.Cantidad, 0)
                                ELSE
                                    (
                                        ISNULL(det.PrecioUnitario, 0)
                                        *
                                        ISNULL(det.Cantidad, 0)
                                    ) * @TipoCambio
                            END
                        ),
                        0
                    )
                    AS DECIMAL(18, 6)
                ) AS SubOc,

                MAX(doc.IdMoneda) AS IdMonedaOc
            FROM dbo.detOrdenCompra det

            LEFT JOIN dbo.cabOrdenCompra doc
                ON doc.IdOc = det.IdOc

            WHERE @VerTotalesGlobales = 1
              AND det.IdOc = a.IdOc
              AND det.Fila = a.Fila
              AND det.IdEstado NOT IN (3)
              AND det.IdSite = a.IdSite
              AND
              (
                  det.TipoTrabajo = a.Tipo_Trabajo
                  OR
                  (
                      det.TipoTrabajo IS NULL
                      AND a.Tipo_Trabajo IS NULL
                  )
              )
        ) ocEmpleado

        OUTER APPLY
        (
            SELECT
                CAST(
                    COALESCE(
                        SUM(
                            CASE
                                WHEN pla.TipoMoneda = 1
                                    THEN ISNULL(pla.Subtotal, 0)
                                WHEN pla.TipoMoneda = 2
                                    THEN ISNULL(pla.Subtotal, 0) * @TipoCambio
                                ELSE ISNULL(pla.Subtotal, 0)
                            END
                        ),
                        0
                    )
                    AS DECIMAL(18, 6)
                ) AS SubPlanilla
            FROM dbo.Planilla pla
            WHERE @VerTotalesGlobales = 1
              AND pla.IdOc = a.IdOc
              AND pla.IdCliente = a.IdCliente
              AND pla.IdProyecto = a.IdProyecto
              AND pla.IdSite = a.IdSite
              AND pla.CorreSite = a.CorreSite
              AND pla.Fila = a.Fila
              AND pla.Correlativo <> a.Correlativo
              AND
              (
                  pla.Tipo_Trabajo = a.Tipo_Trabajo
                  OR
                  (
                      pla.Tipo_Trabajo IS NULL
                      AND a.Tipo_Trabajo IS NULL
                  )
              )
              AND
              (
                  pla.Estado = 4
                  OR
                  (
                      @IncluirEstado99 = 1
                      AND pla.Estado = 99
                  )
              )
        ) pagoOcEmpleado

        OUTER APPLY
        (
            SELECT
                CAST(
                    COALESCE(pagoOcEmpleado.SubPlanilla, 0)
                    +
                    COALESCE(actual.SubtotalActualSoles, 0)
                    AS DECIMAL(18, 6)
                ) AS SubPlanillaConRegistroActual
        ) calcOcEmpleado

        OUTER APPLY
        (
            SELECT
                CAST(
                    COALESCE(ocEmpleado.SubOc, 0)
                    -
                    COALESCE(calcOcEmpleado.SubPlanillaConRegistroActual, 0)
                    AS DECIMAL(18, 6)
                ) AS DiferenciaFic,

                CASE
                    WHEN
                        COALESCE(ocEmpleado.SubOc, 0)
                        -
                        COALESCE(calcOcEmpleado.SubPlanillaConRegistroActual, 0) > 0
                        THEN 1

                    WHEN
                        COALESCE(ocEmpleado.SubOc, 0)
                        -
                        COALESCE(calcOcEmpleado.SubPlanillaConRegistroActual, 0) < 0
                        THEN -1

                    ELSE 0
                END AS CodigoValidacionFic,

                CASE
                    WHEN
                        COALESCE(ocEmpleado.SubOc, 0)
                        -
                        COALESCE(calcOcEmpleado.SubPlanillaConRegistroActual, 0) > 0
                        THEN 'MAYOR_A_CERO'

                    WHEN
                        COALESCE(ocEmpleado.SubOc, 0)
                        -
                        COALESCE(calcOcEmpleado.SubPlanillaConRegistroActual, 0) < 0
                        THEN 'MENOR_A_CERO'

                    ELSE 'IGUAL_A_CERO'
                END AS ResultadoValidacionFic,

                CAST(
                    CASE
                        WHEN COALESCE(ocEmpleado.SubOc, 0) = 0
                            THEN 0
                        ELSE
                            (
                                COALESCE(calcOcEmpleado.SubPlanillaConRegistroActual, 0)
                                /
                                NULLIF(ocEmpleado.SubOc, 0)
                            ) * 100
                    END
                    AS DECIMAL(18, 2)
                ) AS PorcentajeFic
        ) validacionOc

        -- Globales nuevos (mismo criterio que los anteriores: la condicion @VerTotalesGlobales = 1
        -- busca evitar su costo; la proteccion real la dan los CASE del SELECT).
        OUTER APPLY
        (
            SELECT
                SUM(ISNULL(p.Subtotal, 0)) AS TotalSubtotalPorMoneda
            FROM dbo.Planilla p
            WHERE @VerTotalesGlobales = 1
              AND p.Estado = 4
              AND p.IdCliente = a.IdCliente
              AND p.IdProyecto = a.IdProyecto
              AND p.IdSite = a.IdSite
              AND ISNULL(p.CorreSite, 0) = ISNULL(a.CorreSite, 0)
              AND p.TipoMoneda = a.TipoMoneda
              AND (p.Tipo_Trabajo = a.Tipo_Trabajo OR (p.Tipo_Trabajo IS NULL AND a.Tipo_Trabajo IS NULL))
              AND (@Ot IS NULL OR CONVERT(NVARCHAR(100), p.Ot) = CONVERT(NVARCHAR(100), a.Ot))
        ) pot

        OUTER APPLY
        (
            SELECT
                MAX(
                    CASE
                        WHEN p.TipoMoneda = 1 THEN 0
                        WHEN p.TipoMoneda = 2 AND @TipoCambioUSD IS NULL THEN 1
                        WHEN p.TipoMoneda = 3 AND @TipoCambioEUR IS NULL THEN 1
                        WHEN p.TipoMoneda = 4 AND @TipoCambioDOP IS NULL THEN 1
                        WHEN p.TipoMoneda = 5 AND @TipoCambioCOP IS NULL THEN 1
                        WHEN p.TipoMoneda NOT IN (1, 2, 3, 4, 5) OR p.TipoMoneda IS NULL THEN 1
                        ELSE 0
                    END
                ) AS TipoCambioFaltanteOT,
                CAST(
                    CASE
                        WHEN MAX(
                                 CASE
                                     WHEN p.TipoMoneda = 1 THEN 0
                                     WHEN p.TipoMoneda = 2 AND @TipoCambioUSD IS NULL THEN 1
                                     WHEN p.TipoMoneda = 3 AND @TipoCambioEUR IS NULL THEN 1
                                     WHEN p.TipoMoneda = 4 AND @TipoCambioDOP IS NULL THEN 1
                                     WHEN p.TipoMoneda = 5 AND @TipoCambioCOP IS NULL THEN 1
                                     WHEN p.TipoMoneda NOT IN (1, 2, 3, 4, 5) OR p.TipoMoneda IS NULL THEN 1
                                     ELSE 0
                                 END
                             ) = 1
                            THEN NULL
                        ELSE
                            SUM(
                                ISNULL(p.Subtotal, 0)
                                *
                                CASE p.TipoMoneda
                                    WHEN 1 THEN CAST(1 AS DECIMAL(18, 6))
                                    WHEN 2 THEN @TipoCambioUSD
                                    WHEN 3 THEN @TipoCambioEUR
                                    WHEN 4 THEN @TipoCambioDOP
                                    WHEN 5 THEN @TipoCambioCOP
                                END
                            )
                    END
                    AS DECIMAL(18, 2)
                ) AS TotalPagadoConvertidoSoles
            FROM dbo.Planilla p
            WHERE @VerTotalesGlobales = 1
              AND p.Estado = 4
              AND p.IdCliente = a.IdCliente
              AND p.IdProyecto = a.IdProyecto
              AND p.IdSite = a.IdSite
              AND ISNULL(p.CorreSite, 0) = ISNULL(a.CorreSite, 0)
              AND (p.Tipo_Trabajo = a.Tipo_Trabajo OR (p.Tipo_Trabajo IS NULL AND a.Tipo_Trabajo IS NULL))
              AND (@Ot IS NULL OR CONVERT(NVARCHAR(100), p.Ot) = CONVERT(NVARCHAR(100), a.Ot))
        ) pots

        OUTER APPLY
        (
            SELECT
                SUM(ISNULL(imp.Monto_Bck, 0)) AS TotalMontoBckPorMoneda,
                SUM(ISNULL(imp.Monto_Visible, 0)) AS TotalMontoVisiblePorMoneda
            FROM dbo.Importar imp
            WHERE @VerTotalesGlobales = 1
              AND imp.IdEstado = 1
              AND imp.IdCliente = a.IdCliente
              AND imp.IdProyecto = a.IdProyecto
              AND imp.IdSite = a.IdSite
              AND ISNULL(imp.Correlativo, 0) = ISNULL(a.CorreSite, 0)
              AND imp.IdMoneda = a.TipoMoneda
              AND (imp.TipoTrabajo = a.Tipo_Trabajo OR (imp.TipoTrabajo IS NULL AND a.Tipo_Trabajo IS NULL))
              AND (@Ot IS NULL OR CONVERT(NVARCHAR(100), imp.OT) = CONVERT(NVARCHAR(100), a.Ot))
        ) iot

        -- Solo Scotiabank agrupa por NroOperacion (misma regla que sp_Planilla_Consulta_Estados).
        OUTER APPLY
        (
            SELECT
                -SUM(ABS(ISNULL(px.TotalPagar, 0))) AS TotalPagarAgrupado
            FROM dbo.Planilla px
            WHERE @VerTotalesGlobales = 1
              AND UPPER(LTRIM(RTRIM(ISNULL(ban.ValorIni, '')))) LIKE '%SCOTI%'
              AND NULLIF(LTRIM(RTRIM(a.NroOperacion)), '') IS NOT NULL
              AND LTRIM(RTRIM(px.NroOperacion)) = LTRIM(RTRIM(a.NroOperacion))
        ) pbanco

        ORDER BY
            pg.Coincidencias DESC,
            pg.Fecha DESC,
            pg.IdPlanilla DESC

        OPTION (RECOMPILE);

    END TRY
    BEGIN CATCH

        DECLARE @MensajeError NVARCHAR(2048);

        SET @MensajeError =
            CONCAT(
                'Error al realizar la búsqueda de planilla para IA. ',
                'Detalle: ',
                ERROR_MESSAGE(),
                ' | Error SQL: ',
                ERROR_NUMBER(),
                ' | Línea: ',
                ERROR_LINE()
            );

        THROW 50001, @MensajeError, 1;

    END CATCH;
END;
GO
SET NOEXEC OFF;
GO
