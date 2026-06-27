using System.Data;
using System.Globalization;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using CjERP.Application.DTOs;
using CjERP.Application.Interfaces.Services;
using CjERP.Infrastructure.Persistence.Sql;
using CjERP.Shared.Configuration;
using Dapper;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace CjERP.Infrastructure.Services;

public sealed class ConciliacionBcpService : IConciliacionBcpService
{
    private const string StoredProcedureInsert = "dbo.sp_MovimientosBcp_Insertar";
    private const string StoredProcedureBuscarMovimientos = "dbo.sp_MovimientosBcp_Buscar";
    private const string StoredProcedurePlanillaEstados = "dbo.sp_Planilla_Consulta_Estados";
    private const string StoredProcedureActualizarClasificacionContable = "dbo.sp_MovimientosBcp_ActualizarClasificacionContable";
    private const string MovimientosTableName = "dbo.MovimientosBcp";
    private const string MovimientosUniqueIndexName = "UX_MovimientosBancarios_Unico";
    private const int MaxSampleRows = 8;
    private static readonly Dictionary<string, string[]> HeaderAliases = new(StringComparer.OrdinalIgnoreCase)
    {
        ["Empresa"] = ["empresa", "company", "business name"],
        ["Cuenta"] = ["cuenta", "cuentas", "account", "account number", "account no"],
        ["Moneda"] = ["moneda", "currency", "curr"],
        ["Fecha"] = ["fecha", "transaction date", "posting date", "operation date", "booking date", "date"],
        ["FechaValuta"] = ["fechavaluta", "fecha valuta", "fecha valua", "value date", "fecha valor"],
        ["Proveedor"] = ["proveedor", "beneficiario", "supplier", "vendor", "counterparty"],
        ["ItemSistema"] = ["itemsistema", "item del sistema", "item sistema", "system item"],
        ["DescripcionOperacion"] = ["descripcionoperacion", "descripcion operacion", "descripción operación", "description", "transaction description", "detail", "details", "glosa"],
        ["Monto"] = ["monto", "importe", "amount", "transaction amount"],
        ["SucursalAgencia"] = ["sucursalagencia", "sucursal agencia", "sucursal - agencia", "branch", "office"],
        ["NroOperacion"] = ["nrooperacion", "nro operacion", "n° operacion", "nº operacion", "numero operacion", "reference", "reference number", "transaction number", "operation number", "document number"],
        ["Usuario"] = ["usuario", "user", "channel user"]
    };
    private static readonly string[] OrderedMovementColumns =
    [
        "Empresa",
        "Cuenta",
        "Moneda",
        "Fecha",
        "FechaValuta",
        "Proveedor",
        "ItemSistema",
        "DescripcionOperacion",
        "Monto",
        "SucursalAgencia",
        "NroOperacion",
        "Usuario",
        "ArchivoOrigen",
        "UsuarioImportacion",
        "IdActivo",
        "EsNroOperacionValido",
        "TipoMovimientoBanco",
        "EstadoConciliacion"
    ];

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };

    private readonly HttpClient _httpClient;
    private readonly ISqlCommandFactory _sqlCommandFactory;
    private readonly OpenAiSettings _openAiSettings;
    private readonly ILogger<ConciliacionBcpService> _logger;
    private readonly IAuditoriaCambiosService _auditoriaCambiosService;

    public ConciliacionBcpService(
        HttpClient httpClient,
        ISqlCommandFactory sqlCommandFactory,
        IOptions<OpenAiSettings> openAiSettings,
        ILogger<ConciliacionBcpService> logger,
        IAuditoriaCambiosService auditoriaCambiosService)
    {
        _httpClient = httpClient;
        _sqlCommandFactory = sqlCommandFactory;
        _openAiSettings = openAiSettings.Value;
        _logger = logger;
        _auditoriaCambiosService = auditoriaCambiosService;
    }

    public async Task<ConciliacionBcpAnalizarResponseDto> AnalizarAsync(
        ConciliacionBcpAnalizarRequestDto request,
        string? usuario,
        CancellationToken cancellationToken = default)
    {
        var archivos = (request?.Archivos ?? []).Where(archivo => archivo is not null).ToList();

        if (archivos.Count == 0)
        {
            return new ConciliacionBcpAnalizarResponseDto
            {
                Resumen = "Debes cargar al menos un archivo Excel para analizar."
            };
        }

        await using var connection = _sqlCommandFactory.CreateConnection();
        await connection.OpenAsync(cancellationToken);
        var parametrosProcedimiento = await LoadStoredProcedureParametersAsync(connection, cancellationToken);
        var rawAnalysis = archivos.Any(HasRawFileContent)
            ? await AnalyzeRawFilesWithOpenAiAsync(archivos, cancellationToken)
            : null;

        if (rawAnalysis?.ParsedResponse is not null)
        {
            return BuildAppAnalysisResponseFromPrompt(rawAnalysis, archivos, parametrosProcedimiento);
        }

        var archivosAnalizados = new List<ConciliacionBcpAnalizarArchivoResponseDto>();
        foreach (var archivo in archivos)
        {
            archivosAnalizados.Add(
                await AnalyzeFileAsync(archivo, null, parametrosProcedimiento, usuario, cancellationToken));
        }

        return new ConciliacionBcpAnalizarResponseDto
        {
            Resumen = archivosAnalizados.Any()
                ? $"Se analizaron {archivosAnalizados.Count} archivo(s) Excel usando la estructura de {StoredProcedureInsert}."
                : "No se pudo analizar ningun archivo.",
            PuedeInsertar = archivosAnalizados.Count > 0 &&
                            archivosAnalizados.All(item => item.FilasNormalizadas.Count > 0 && !item.RequiereRevision),
            ParametrosProcedimiento = parametrosProcedimiento.Select(MapParameter).ToList(),
            Archivos = archivosAnalizados,
            Debug = rawAnalysis?.Debug
        };
    }

    public async Task<ConciliacionBcpInsertResponseDto> InsertarAsync(
        ConciliacionBcpInsertRequestDto request,
        string? usuario,
        CancellationToken cancellationToken = default)
    {
        var filas = request?.Filas ?? [];

        if (filas.Count == 0)
        {
            return new ConciliacionBcpInsertResponseDto
            {
                Errores = ["No hay filas normalizadas para insertar."]
            };
        }

        await using var connection = _sqlCommandFactory.CreateConnection();
        await connection.OpenAsync(cancellationToken);
        var parametrosProcedimiento = await LoadStoredProcedureParametersAsync(connection, cancellationToken);

        if (parametrosProcedimiento.Count == 0)
        {
            return new ConciliacionBcpInsertResponseDto
            {
                FilasRecibidas = filas.Count,
                Errores = [$"No se encontro el stored procedure {StoredProcedureInsert} o no tiene parametros visibles."]
            };
        }

        try
        {
            var uniqueKeyColumns = await LoadUniqueIndexColumnsAsync(connection, cancellationToken);
            var duplicateFilter = await FilterDuplicateRowsAsync(
                connection,
                filas,
                uniqueKeyColumns,
                cancellationToken);

            var filasParaInsertar = duplicateFilter.Filas;
            var advertencias = duplicateFilter.Advertencias;

            if (filasParaInsertar.Count == 0)
            {
                advertencias = BuildManagerialInsertWarnings(
                    advertencias,
                    duplicateFilter.FilasDuplicadasEnBase,
                    duplicateFilter.FilasDuplicadasEnLote,
                    0,
                    uniqueKeyColumns);

                return new ConciliacionBcpInsertResponseDto
                {
                    FilasRecibidas = filas.Count,
                    FilasOmitidasDuplicadas = duplicateFilter.FilasDuplicadas,
                    Advertencias = advertencias.Count > 0
                        ? advertencias
                        : ["Todas las filas recibidas ya existen en MovimientosBcp o repiten la llave unica."]
                };
            }

            if (CanUseJsonPayload(parametrosProcedimiento))
            {
                var jsonParameter = parametrosProcedimiento.First(item => !item.EsSalida);
                var parametros = new DynamicParameters();
                parametros.Add(
                    TrimAt(jsonParameter.Nombre),
                    JsonSerializer.Serialize(filasParaInsertar, JsonOptions),
                    DbType.String);

                await connection.ExecuteAsync(
                    _sqlCommandFactory.Create(
                        StoredProcedureInsert,
                        parametros,
                        CommandType.StoredProcedure,
                        cancellationToken,
                        commandTimeout: 300));

                return new ConciliacionBcpInsertResponseDto
                {
                    FilasRecibidas = filas.Count,
                    FilasInsertadas = filasParaInsertar.Count,
                    FilasOmitidasDuplicadas = duplicateFilter.FilasDuplicadas,
                    Advertencias = advertencias
                };
            }

            using var transaction = connection.BeginTransaction();
            var filasInsertadas = 0;
            var filasOmitidasDuplicadas = duplicateFilter.FilasDuplicadas;
            var filasOmitidasPorIndiceDuranteInsercion = 0;

            foreach (var fila in filasParaInsertar)
            {
                var parametros = new DynamicParameters();
                var normalizedRow = new Dictionary<string, object?>(fila, StringComparer.OrdinalIgnoreCase);

                foreach (var parametro in parametrosProcedimiento.Where(item => !item.EsSalida))
                {
                    var key = TrimAt(parametro.Nombre);
                    if (!normalizedRow.TryGetValue(key, out var rawValue))
                    {
                        continue;
                    }

                    parametros.Add(
                        key,
                        NormalizeParameterValue(rawValue, parametro.Tipo),
                        ResolveDbType(parametro.Tipo));
                }

                TryAddAuditParameters(parametros, parametrosProcedimiento, usuario);

                try
                {
                    await connection.ExecuteAsync(
                        new CommandDefinition(
                            StoredProcedureInsert,
                            parametros,
                            transaction: transaction,
                            commandType: CommandType.StoredProcedure,
                            commandTimeout: 300,
                            cancellationToken: cancellationToken));

                    filasInsertadas++;
                }
                catch (SqlException sqlException) when (IsDuplicateKeyViolation(sqlException))
                {
                    filasOmitidasDuplicadas++;
                    filasOmitidasPorIndiceDuranteInsercion++;
                }
            }

            transaction.Commit();

            advertencias = BuildManagerialInsertWarnings(
                advertencias,
                duplicateFilter.FilasDuplicadasEnBase,
                duplicateFilter.FilasDuplicadasEnLote,
                filasOmitidasPorIndiceDuranteInsercion,
                uniqueKeyColumns);

            return new ConciliacionBcpInsertResponseDto
            {
                FilasRecibidas = filas.Count,
                FilasInsertadas = filasInsertadas,
                FilasOmitidasDuplicadas = filasOmitidasDuplicadas,
                Advertencias = advertencias
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[ConciliacionBcp] Error insertando movimientos mediante {StoredProcedure}", StoredProcedureInsert);
            return new ConciliacionBcpInsertResponseDto
            {
                FilasRecibidas = filas.Count,
                Errores = [$"No se pudo insertar la informacion en {StoredProcedureInsert}: {ex.Message}"]
            };
        }
    }

    public async Task<ConciliacionBcpExportResponseDto> ExportarAnalisisAsync(
        ConciliacionBcpExportRequestDto request,
        string? usuario,
        CancellationToken cancellationToken = default)
    {
        if (request.Analisis?.Archivos?.Count is not > 0)
        {
            throw new InvalidOperationException("Primero debes analizar los archivos antes de exportar.");
        }

        if (!HasOpenAiConfiguration())
        {
            return BuildExportResponseFromAnalysis(request.Analisis);
        }

        try
        {
            var payload = new
            {
                analisis = request.Analisis
            };

            var exportJson = await SendOpenAiChatCompletionAsync(
                [
                    new OpenAiChatMessage
                    {
                        Role = "system",
                        Content = BuildExportPrompt()
                    },
                    new OpenAiChatMessage
                    {
                        Role = "user",
                        Content = JsonSerializer.Serialize(payload, JsonOptions)
                    }
                ],
                cancellationToken,
                responseFormatJson: true);

            var exportResponse = ParseExportResponse(exportJson);
            return exportResponse ?? BuildExportResponseFromAnalysis(request.Analisis);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "[ConciliacionBcp] OpenAI fallo al preparar la exportacion. Se usara la salida deterministica.");
            return BuildExportResponseFromAnalysis(request.Analisis);
        }
    }

    public async Task<ConciliacionBcpConciliarPlanillaResponseDto> ConciliarPlanillaAsync(
        ConciliacionBcpConciliarPlanillaRequestDto request,
        string? usuario,
        CancellationToken cancellationToken = default)
    {
        if (!request.IdCargo.HasValue || !request.IdEmpleado.HasValue || string.IsNullOrWhiteSpace(request.Estados))
        {
            throw new InvalidOperationException("IdCargo, IdEmpleado y Estados son obligatorios para ejecutar la conciliacion.");
        }

        await using var connection = _sqlCommandFactory.CreateConnection();
        await connection.OpenAsync(cancellationToken);

        var parametrosMovimientos = new DynamicParameters();
        parametrosMovimientos.Add("NroOperacion", null, DbType.String);
        parametrosMovimientos.Add("DescripcionOperacion", null, DbType.String);
        parametrosMovimientos.Add("TextoBusqueda", null, DbType.String);
        parametrosMovimientos.Add("TipoBusqueda", "PARECIDA", DbType.String);
        parametrosMovimientos.Add("Empresa", null, DbType.String);
        parametrosMovimientos.Add("Cuenta", null, DbType.String);
        parametrosMovimientos.Add("Moneda", null, DbType.String);
        parametrosMovimientos.Add("FechaInicio", request.FechaInicio?.Date, DbType.Date);
        parametrosMovimientos.Add("FechaFin", request.FechaFin?.Date, DbType.Date);
        parametrosMovimientos.Add("IdActivo", request.IdActivo, DbType.Int32);
        parametrosMovimientos.Add("IdAreaFlujo", request.IdAreaFlujo, DbType.Int32);
        parametrosMovimientos.Add("IdReferencia", request.IdReferencia, DbType.Int32);
        parametrosMovimientos.Add("IdCuentaContable", request.IdCuentaContable, DbType.Int32);
        parametrosMovimientos.Add("EsConciliado", request.EsConciliado, DbType.Boolean);

        _logger.LogInformation(
            "[ConciliacionBcpService] Ejecutando conciliacion con banco={StoredProcedureMovimientos} y planilla={StoredProcedurePlanilla}. IdCargo={IdCargo}, IdEmpleado={IdEmpleado}, Estados={Estados}, FechaInicioFiltro={FechaInicioFiltro}, FechaFinFiltro={FechaFinFiltro}, IdActivo={IdActivo}, Usuario={Usuario}",
            StoredProcedureBuscarMovimientos,
            StoredProcedurePlanillaEstados,
            request.IdCargo,
            request.IdEmpleado,
            request.Estados?.Trim(),
            request.FechaInicio?.Date,
            request.FechaFin?.Date,
            request.IdActivo,
            usuario ?? "sistema");

        var movimientos = (await connection.QueryAsync<MovimientoBcpBusquedaRow>(
                _sqlCommandFactory.Create(
                    StoredProcedureBuscarMovimientos,
                    parametrosMovimientos,
                    CommandType.StoredProcedure,
                    cancellationToken,
                    commandTimeout: 300)))
            .ToList();

        var rangoFechasBusqueda = ResolveConciliationDateRange(
            request.FechaInicio?.Date,
            request.FechaFin?.Date,
            movimientos);
        _logger.LogInformation(
            "[ConciliacionBcpService] Rango usado para conciliacion. FechaInicio={FechaInicio}, FechaFin={FechaFin}, OrigenRango={OrigenRango}",
            rangoFechasBusqueda.FechaInicio,
            rangoFechasBusqueda.FechaFin,
            rangoFechasBusqueda.EsDesdeFiltroUsuario ? "FiltroUsuario" : "MovimientosBcp");

        var parametrosPlanilla = new DynamicParameters();
        parametrosPlanilla.Add("IdCargo", request.IdCargo.Value, DbType.Int32);
        parametrosPlanilla.Add("IdEmpleado", request.IdEmpleado.Value, DbType.Int32);
        parametrosPlanilla.Add("Estados", request.Estados?.Trim(), DbType.String);
        parametrosPlanilla.Add("FechaInicio", rangoFechasBusqueda.FechaInicio, DbType.Date);
        parametrosPlanilla.Add("FechaFin", rangoFechasBusqueda.FechaFin, DbType.Date);

        var planilla = (await connection.QueryAsync(
                _sqlCommandFactory.Create(
                    StoredProcedurePlanillaEstados,
                    parametrosPlanilla,
                    CommandType.StoredProcedure,
                    cancellationToken,
                    commandTimeout: 300)))
            .Select(MapDynamicRow)
            .Select(MapPlanillaRow)
            .Select((item, index) =>
            {
                item.RowKey = item.Corre.HasValue
                    ? $"CORRE:{item.Corre.Value.ToString(CultureInfo.InvariantCulture)}"
                    : $"ROW:{index.ToString(CultureInfo.InvariantCulture)}";
                return item;
            })
            .ToList();

        var registros = BuildConciliacionRegistros(movimientos, planilla)
            .OrderByDescending(item => item.Fecha)
            .ThenBy(item => item.Empresa)
            .ThenBy(item => item.Moneda)
            .ThenBy(item => item.NroOperacion)
            .ThenBy(item => item.IdMovimientoBanco)
            .ToList();

        var coincidenciasPorNroOperacion = registros.Count(item =>
            string.Equals(item.TipoCoincidencia, "NRO OPERACION", StringComparison.OrdinalIgnoreCase));
        var coincidenciasPorCuenta = registros.Count(item =>
            string.Equals(item.TipoCoincidencia, "CUENTA", StringComparison.OrdinalIgnoreCase));
        var coincidenciasPorCuentaInter = registros.Count(item =>
            string.Equals(item.TipoCoincidencia, "CUENTA INTER", StringComparison.OrdinalIgnoreCase));
        var sinCoincidencia = registros.Count(item =>
            string.Equals(item.ResultadoConciliacion, "SIN COINCIDENCIA", StringComparison.OrdinalIgnoreCase));

        return new ConciliacionBcpConciliarPlanillaResponseDto
        {
            Resumen =
                $"Conciliación ejecutada sobre {registros.Count} movimiento(s): " +
                $"{coincidenciasPorNroOperacion} por Nro. Operación, " +
                $"{coincidenciasPorCuenta} por Cuenta, " +
                $"{coincidenciasPorCuentaInter} por Cuenta Inter y " +
                $"{sinCoincidencia} sin coincidencia.",
            TotalMovimientos = registros.Count,
            CoincidenciasPorNroOperacion = coincidenciasPorNroOperacion,
            CoincidenciasPorCuenta = coincidenciasPorCuenta,
            CoincidenciasPorCuentaInter = coincidenciasPorCuentaInter,
            SinCoincidencia = sinCoincidencia,
            Registros = registros
        };
    }

    public async Task<ConciliacionBcpConciliarPlanillaRegistroDto> ActualizarComentarioMovimientoAsync(
        int idMovimientoBanco,
        ConciliacionBcpActualizarComentarioRequestDto request,
        string? usuario,
        CancellationToken cancellationToken = default)
    {
        if (idMovimientoBanco <= 0)
        {
            throw new InvalidOperationException("El IdMovimientoBanco es invalido.");
        }

        await using var connection = _sqlCommandFactory.CreateConnection();
        await connection.OpenAsync(cancellationToken);

        var movimiento = await GetMovimientoByIdAsync(connection, idMovimientoBanco, cancellationToken);

        if (movimiento is null)
        {
            throw new InvalidOperationException("No se encontro el movimiento BCP solicitado.");
        }

        var comentarioAnterior = NullIfWhiteSpace(movimiento.Comentario);
        var comentarioNuevo = NullIfWhiteSpace(request.Comentario);

        if (string.Equals(comentarioAnterior, comentarioNuevo, StringComparison.Ordinal))
        {
            return BuildConciliacionRegistroActualizado(movimiento, comentarioAnterior);
        }

        await connection.ExecuteAsync(
            _sqlCommandFactory.Create(
                """
                UPDATE dbo.MovimientosBcp
                SET Comentario = @Comentario
                WHERE IdMovimientoBanco = @IdMovimientoBanco
                """,
                new
                {
                    IdMovimientoBanco = idMovimientoBanco,
                    Comentario = comentarioNuevo
                },
                CommandType.Text,
                cancellationToken));

        await _auditoriaCambiosService.RegistrarLoteAsync(
            [
                new AuditoriaCambioDto
                {
                    Modulo = "Finanzas",
                    Entidad = "MovimientosBcp",
                    IdRegistro = idMovimientoBanco.ToString(CultureInfo.InvariantCulture),
                    Accion = "UPDATE",
                    Seccion = "Conciliacion Planilla",
                    Campo = "Comentario",
                    ValorAnterior = comentarioAnterior,
                    ValorNuevo = comentarioNuevo,
                    UsuarioAccion = usuario ?? "sistema",
                    Observacion = "Actualizacion manual del comentario desde conciliacion planilla."
                }
            ],
            cancellationToken);

        movimiento.Comentario = comentarioNuevo;
        return BuildConciliacionRegistroActualizado(movimiento, comentarioNuevo);
    }

    public async Task<ConciliacionBcpClasificacionCombosResponseDto> ObtenerCombosClasificacionAsync(
        CancellationToken cancellationToken = default)
    {
        await using var connection = _sqlCommandFactory.CreateConnection();
        await connection.OpenAsync(cancellationToken);

        var areasFlujo = (await connection.QueryAsync<ConciliacionAreaFlujoOptionDto>(
            _sqlCommandFactory.Create(
                """
                SELECT
                    IdAreaFlujo,
                    NombreAreaFlujo
                FROM dbo.ConciliacionAreaFlujo
                WHERE IdActivo = 1
                ORDER BY NombreAreaFlujo
                """,
                commandType: CommandType.Text,
                cancellationToken: cancellationToken))).ToList();

        var referencias = (await connection.QueryAsync<ConciliacionReferenciaOptionDto>(
            _sqlCommandFactory.Create(
                """
                SELECT
                    IdReferencia,
                    CodigoReferencia,
                    NombreReferencia
                FROM dbo.ConciliacionReferencia
                WHERE IdActivo = 1
                ORDER BY CodigoReferencia, NombreReferencia
                """,
                commandType: CommandType.Text,
                cancellationToken: cancellationToken))).ToList();

        var cuentasContables = (await connection.QueryAsync<ConciliacionCuentaContableOptionDto>(
            _sqlCommandFactory.Create(
                """
                SELECT
                    IdCuentaContable,
                    CodigoCuenta,
                    NombreCuenta,
                    CONCAT(ISNULL(CodigoCuenta, ''), ' - ', ISNULL(NombreCuenta, '')) AS CuentaContableTexto
                FROM dbo.PlanCuentaContable
                WHERE IdActivo = 1
                ORDER BY CodigoCuenta, NombreCuenta
                """,
                commandType: CommandType.Text,
                cancellationToken: cancellationToken))).ToList();

        var reglasContables = (await connection.QueryAsync<ConciliacionReglaContableOptionDto>(
            _sqlCommandFactory.Create(
                """
                SELECT
                    IdReglaContable,
                    IdAreaFlujo,
                    IdReferencia,
                    IdCuentaContable,
                    Orden,
                    EsPrincipal,
                    RequiereComprobante,
                    AplicaConciliacion,
                    Observacion
                FROM dbo.ConciliacionReglaContable
                WHERE IdActivo = 1
                ORDER BY IdAreaFlujo, IdReferencia, IdCuentaContable, Orden, IdReglaContable
                """,
                commandType: CommandType.Text,
                cancellationToken: cancellationToken))).ToList();

        return new ConciliacionBcpClasificacionCombosResponseDto
        {
            AreasFlujo = areasFlujo,
            Referencias = referencias,
            CuentasContables = cuentasContables,
            ReglasContables = reglasContables
        };
    }

    public async Task<ConciliacionBcpConciliarPlanillaRegistroDto> ActualizarClasificacionContableAsync(
        ConciliacionBcpActualizarClasificacionRequestDto request,
        string? usuario,
        CancellationToken cancellationToken = default)
    {
        if (request.IdMovimientoBanco <= 0)
        {
            throw new InvalidOperationException("El IdMovimientoBanco es invalido.");
        }

        if (request.IdAreaFlujo <= 0 || request.IdReferencia <= 0 || request.IdCuentaContable <= 0 || request.IdReglaContable <= 0)
        {
            throw new InvalidOperationException("La clasificacion contable requiere Area Flujo, Referencia, Cuenta Contable y Regla.");
        }

        await using var connection = _sqlCommandFactory.CreateConnection();
        await connection.OpenAsync(cancellationToken);

        var parametros = new DynamicParameters();
        parametros.Add("IdMovimientoBanco", request.IdMovimientoBanco, DbType.Int32);
        parametros.Add("IdAreaFlujo", request.IdAreaFlujo, DbType.Int32);
        parametros.Add("IdReferencia", request.IdReferencia, DbType.Int32);
        parametros.Add("IdCuentaContable", request.IdCuentaContable, DbType.Int32);
        parametros.Add("IdReglaContable", request.IdReglaContable, DbType.Int32);
        parametros.Add("ObservacionConciliacion", NullIfWhiteSpace(request.ObservacionConciliacion), DbType.String);
        parametros.Add("UsuarioConciliacion", string.IsNullOrWhiteSpace(usuario) ? "sistema" : usuario.Trim(), DbType.String);

        await connection.ExecuteAsync(
            _sqlCommandFactory.Create(
                StoredProcedureActualizarClasificacionContable,
                parametros,
                CommandType.StoredProcedure,
                cancellationToken,
                commandTimeout: 120));

        var movimientoActualizado = await GetMovimientoByIdAsync(connection, request.IdMovimientoBanco, cancellationToken);
        if (movimientoActualizado is null)
        {
            throw new InvalidOperationException("No se pudo recuperar el movimiento actualizado.");
        }

        return BuildConciliacionRegistroActualizado(
            movimientoActualizado,
            movimientoActualizado.Comentario);
    }

    private async Task<MovimientoBcpBusquedaRow?> GetMovimientoByIdAsync(
        IDbConnection connection,
        int idMovimientoBanco,
        CancellationToken cancellationToken)
    {
        return await connection.QuerySingleOrDefaultAsync<MovimientoBcpBusquedaRow>(
            _sqlCommandFactory.Create(
                """
                SELECT
                    mov.IdMovimientoBanco,
                    mov.Empresa,
                    mov.Cuenta,
                    mov.Moneda,
                    mov.Fecha,
                    mov.FechaValuta,
                    mov.Proveedor,
                    mov.ItemSistema,
                    mov.DescripcionOperacion,
                    mov.Monto,
                    mov.SucursalAgencia,
                    mov.NroOperacion,
                    mov.Usuario,
                    mov.ArchivoOrigen,
                    mov.FechaImportacion,
                    mov.UsuarioImportacion,
                    mov.IdActivo,
                    mov.EsNroOperacionValido,
                    mov.TipoMovimientoBanco,
                    mov.EstadoConciliacion,
                    mov.Comentario,
                    mov.IdAreaFlujo,
                    mov.IdReferencia,
                    mov.IdCuentaContable,
                    mov.IdReglaContable,
                    mov.EsConciliado,
                    mov.FechaConciliacion,
                    mov.UsuarioConciliacion,
                    mov.ObservacionConciliacion,
                    af.NombreAreaFlujo,
                    af.Descripcion AS DescripcionAreaFlujo,
                    cref.CodigoReferencia,
                    cref.NombreReferencia,
                    cref.Descripcion AS DescripcionReferencia,
                    pcc.CodigoCuenta,
                    pcc.NombreCuenta,
                    CONCAT(ISNULL(pcc.CodigoCuenta, ''), CASE WHEN pcc.CodigoCuenta IS NOT NULL AND pcc.NombreCuenta IS NOT NULL THEN ' - ' ELSE '' END, ISNULL(pcc.NombreCuenta, '')) AS CuentaContableTexto,
                    rcon.Orden,
                    rcon.EsPrincipal,
                    rcon.RequiereComprobante,
                    rcon.AplicaConciliacion,
                    rcon.Observacion AS ObservacionReglaContable,
                    CASE
                        WHEN mov.EsConciliado = 1 THEN 'CONCILIADO'
                        WHEN UPPER(ISNULL(af.NombreAreaFlujo, '')) = 'NO CONSIDERAR' THEN 'NO CONSIDERAR'
                        WHEN ISNULL(rcon.AplicaConciliacion, 1) = 0 THEN 'NO APLICA'
                        ELSE 'PENDIENTE'
                    END AS EstadoConciliacionTexto,
                    CASE
                        WHEN UPPER(ISNULL(af.NombreAreaFlujo, '')) = 'NO CONSIDERAR' THEN 'NO CONSIDERAR'
                        WHEN ISNULL(rcon.AplicaConciliacion, 1) = 0 THEN 'NO APLICA'
                        WHEN mov.EsConciliado = 1 THEN 'CONCILIADO'
                        ELSE 'PENDIENTE'
                    END AS EstadoOperativoConciliacion
                FROM dbo.MovimientosBcp mov
                LEFT JOIN dbo.ConciliacionAreaFlujo af
                    ON af.IdAreaFlujo = mov.IdAreaFlujo
                LEFT JOIN dbo.ConciliacionReferencia cref
                    ON cref.IdReferencia = mov.IdReferencia
                LEFT JOIN dbo.PlanCuentaContable pcc
                    ON pcc.IdCuentaContable = mov.IdCuentaContable
                LEFT JOIN dbo.ConciliacionReglaContable rcon
                    ON rcon.IdReglaContable = mov.IdReglaContable
                WHERE mov.IdMovimientoBanco = @IdMovimientoBanco
                """,
                new { IdMovimientoBanco = idMovimientoBanco },
                CommandType.Text,
                cancellationToken));
    }

    private static Dictionary<string, object?> MapDynamicRow(dynamic row)
    {
        if (row is IDictionary<string, object?> typedDictionary)
        {
            var result = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);
            foreach (var item in typedDictionary)
            {
                result[item.Key] = item.Value;
            }

            return result;
        }

        if (row is IDictionary<string, object> dictionary)
        {
            var result = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);
            foreach (var item in dictionary)
            {
                result[item.Key] = item.Value;
            }

            return result;
        }

        return new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);
    }

    private static PlanillaConciliacionRow MapPlanillaRow(Dictionary<string, object?> row)
    {
        var nroOperacion = NormalizeText(GetDictionaryString(row, "NroOperacion"));
        var cuenta = NormalizeText(GetDictionaryString(row, "Cuenta"));
        var cuentaInter = NormalizeText(GetDictionaryString(row, "CuentaInter"));
        var cliente = NormalizeText(GetDictionaryString(row, "Cliente"));
        var proyecto = NormalizeText(GetDictionaryString(row, "NombreProyecto"));
        var site = NormalizeText(GetDictionaryString(row, "Site"));
        var tipoTrabajo = NormalizeText(GetDictionaryString(row, "Tipo_Trabajo"));
        var tarea = NormalizeText(GetDictionaryString(row, "tarea"));
        var responsable = NormalizeText(GetDictionaryString(row, "Responsable"));
        var comprobante = NormalizeText(GetDictionaryString(row, "Comprobante"));
        var banco = NormalizeText(GetDictionaryString(row, "Banco"));
        var serie = NormalizeText(GetDictionaryString(row, "Serie"));
        var detalle = NormalizeText(GetDictionaryString(row, "Detalle"));

        return new PlanillaConciliacionRow
        {
            NroOperacion = nroOperacion,
            NroOperacionNormalizado = nroOperacion?.Trim() ?? string.Empty,
            Cuenta = cuenta,
            CuentaInter = cuentaInter,
            Cliente = cliente,
            Proyecto = proyecto,
            Site = site,
            TipoTrabajo = tipoTrabajo,
            Tarea = tarea,
            Responsable = responsable,
            Comprobante = comprobante,
            Banco = banco,
            Serie = serie,
            Detalle = detalle,
            CuentaNumerica = ExtractDigits(cuenta),
            CuentaInterNumerica = ExtractDigits(cuentaInter),
            Corre = GetDictionaryInt(row, "Corre"),
            FechaDeposito = GetDictionaryDate(row, "FechaDeposito"),
            TotalPagar = GetDictionaryDecimal(row, "TotalPagar")
        };
    }

    private static List<ConciliacionBcpConciliarPlanillaRegistroDto> BuildConciliacionRegistros(
        IReadOnlyList<MovimientoBcpBusquedaRow> movimientos,
        IReadOnlyList<PlanillaConciliacionRow> planillaRows)
    {
        var contexts = movimientos
            .Select(movimiento =>
            {
                var nroOperacionNormalizado = NormalizeText(movimiento.NroOperacion)?.Trim() ?? string.Empty;
                var descripcionNumerica = ExtractDigits(movimiento.DescripcionOperacion);
                var candidates = planillaRows
                    .Select(planilla => BuildConciliacionCandidate(movimiento, nroOperacionNormalizado, descripcionNumerica, planilla))
                    .Where(candidate => candidate is not null)
                    .Select(candidate => candidate!)
                    .ToList();

                return new MovimientoConciliacionContext
                {
                    Movimiento = movimiento,
                    Candidates = candidates
                };
            })
            .ToList();

        var assignments = contexts
            .SelectMany(context => context.Candidates.Select(candidate => new ConciliacionAssignment
            {
                Movimiento = context.Movimiento,
                Candidate = candidate
            }))
            .GroupBy(item => item.Candidate.Planilla.RowKey, StringComparer.OrdinalIgnoreCase)
            .Select(group => group
                .OrderBy(item => item.Candidate.Prioridad)
                .ThenBy(item => item.Candidate.DiferenciaMontoAbs ?? decimal.MaxValue)
                .ThenBy(item => item.Candidate.DiferenciaFechaDias ?? int.MaxValue)
                .ThenBy(item => item.Candidate.OrdenPlanilla)
                .ThenBy(item => item.Movimiento.IdMovimientoBanco)
                .First())
            .ToList();

        var assignmentsByMovimiento = assignments
            .GroupBy(item => item.Movimiento.IdMovimientoBanco)
            .ToDictionary(
                group => group.Key,
                group => group.Select(item => item.Candidate).ToList());

        return contexts
            .Select(context => BuildConciliacionRegistro(
                context.Movimiento,
                assignmentsByMovimiento.TryGetValue(context.Movimiento.IdMovimientoBanco, out var assignedCandidates)
                    ? assignedCandidates
                    : [],
                context.Candidates.Count > 0))
            .ToList();
    }

    private static ConciliacionBcpConciliarPlanillaRegistroDto BuildConciliacionRegistro(
        MovimientoBcpBusquedaRow movimiento,
        IReadOnlyList<ConciliacionCandidate> assignedCandidates,
        bool hadUnassignedCandidates)
    {
        var candidate = assignedCandidates
            .OrderBy(item => item.Prioridad)
            .ThenBy(item => item.DiferenciaMontoAbs ?? decimal.MaxValue)
            .ThenBy(item => item.DiferenciaFechaDias ?? int.MaxValue)
            .ThenBy(item => item.OrdenPlanilla)
            .FirstOrDefault();

        var totalPagar = assignedCandidates.Count > 0
            ? assignedCandidates.Sum(item => item.Planilla.TotalPagar ?? 0m)
            : (decimal?)null;
        var correlativoPlanilla = assignedCandidates.Count > 0
            ? string.Join(", ",
                assignedCandidates
                    .Select(item => item.Planilla.Corre)
                    .Where(value => value.HasValue)
                    .Select(value => value!.Value)
                    .Distinct()
                    .OrderBy(value => value)
                    .Select(value => value.ToString(CultureInfo.InvariantCulture)))
            : null;

        return new ConciliacionBcpConciliarPlanillaRegistroDto
        {
            IdMovimientoBanco = movimiento.IdMovimientoBanco,
            Empresa = movimiento.Empresa,
            Cuenta = movimiento.Cuenta,
            Moneda = movimiento.Moneda,
            Fecha = movimiento.Fecha,
            DescripcionOperacion = movimiento.DescripcionOperacion,
            Monto = movimiento.Monto,
            NroOperacion = movimiento.NroOperacion,
            SucursalAgencia = movimiento.SucursalAgencia,
            EstadoConciliacion = movimiento.EstadoConciliacion,
            TipoMovimientoBanco = movimiento.TipoMovimientoBanco,
            IdActivo = movimiento.IdActivo,
            IdAreaFlujo = movimiento.IdAreaFlujo,
            IdReferencia = movimiento.IdReferencia,
            IdCuentaContable = movimiento.IdCuentaContable,
            IdReglaContable = movimiento.IdReglaContable,
            EsConciliado = movimiento.EsConciliado,
            FechaConciliacion = movimiento.FechaConciliacion,
            UsuarioConciliacion = movimiento.UsuarioConciliacion,
            ObservacionConciliacionMovimiento = movimiento.ObservacionConciliacion,
            NombreAreaFlujo = movimiento.NombreAreaFlujo,
            DescripcionAreaFlujo = movimiento.DescripcionAreaFlujo,
            CodigoReferencia = movimiento.CodigoReferencia,
            NombreReferencia = movimiento.NombreReferencia,
            DescripcionReferencia = movimiento.DescripcionReferencia,
            CodigoCuenta = movimiento.CodigoCuenta,
            NombreCuenta = movimiento.NombreCuenta,
            CuentaContableTexto = movimiento.CuentaContableTexto,
            Orden = movimiento.Orden,
            EsPrincipal = movimiento.EsPrincipal,
            RequiereComprobante = movimiento.RequiereComprobante,
            AplicaConciliacion = movimiento.AplicaConciliacion,
            ObservacionReglaContable = movimiento.ObservacionReglaContable,
            EstadoConciliacionTexto = movimiento.EstadoConciliacionTexto,
            EstadoOperativoConciliacion = movimiento.EstadoOperativoConciliacion,
            ResultadoConciliacion = candidate?.ResultadoConciliacion ?? "SIN COINCIDENCIA",
            TipoCoincidencia = candidate?.TipoCoincidencia,
            NroOperacionPlanilla = candidate?.Planilla.NroOperacion,
            CuentaPlanilla = candidate?.Planilla.Cuenta,
            CuentaInterPlanilla = candidate?.Planilla.CuentaInter,
            ClientePlanilla = candidate?.Planilla.Cliente,
            ProyectoPlanilla = candidate?.Planilla.Proyecto,
            SitePlanilla = candidate?.Planilla.Site,
            TipoTrabajoPlanilla = candidate?.Planilla.TipoTrabajo,
            TareaPlanilla = candidate?.Planilla.Tarea,
            ResponsablePlanilla = candidate?.Planilla.Responsable,
            ComprobantePlanilla = candidate?.Planilla.Comprobante,
            BancoPlanilla = candidate?.Planilla.Banco,
            SeriePlanilla = candidate?.Planilla.Serie,
            DetallePlanilla = candidate?.Planilla.Detalle,
            CorrelativoPlanilla = correlativoPlanilla,
            IdRegistroPlanilla = candidate?.Planilla.Corre,
            TotalPagar = totalPagar,
            Comentario = movimiento.Comentario,
            ObservacionConciliacion = candidate is not null
                ? assignedCandidates.Count > 1
                    ? $"Se encontraron {assignedCandidates.Count} coincidencias. TotalPagar acumulado: {totalPagar:0.##}."
                    : candidate.ObservacionConciliacion
                : hadUnassignedCandidates
                    ? "Las coincidencias detectadas ya fueron asignadas a otros movimientos para evitar duplicados."
                    : "No se encontro coincidencia con planilla."
        };
    }

    private static ConciliacionBcpConciliarPlanillaRegistroDto BuildConciliacionRegistroActualizado(
        MovimientoBcpBusquedaRow movimiento,
        string? comentario)
    {
        return new ConciliacionBcpConciliarPlanillaRegistroDto
        {
            IdMovimientoBanco = movimiento.IdMovimientoBanco,
            Empresa = movimiento.Empresa,
            Cuenta = movimiento.Cuenta,
            Moneda = movimiento.Moneda,
            Fecha = movimiento.Fecha,
            DescripcionOperacion = movimiento.DescripcionOperacion,
            Monto = movimiento.Monto,
            NroOperacion = movimiento.NroOperacion,
            SucursalAgencia = movimiento.SucursalAgencia,
            EstadoConciliacion = movimiento.EstadoConciliacion,
            TipoMovimientoBanco = movimiento.TipoMovimientoBanco,
            IdActivo = movimiento.IdActivo,
            IdAreaFlujo = movimiento.IdAreaFlujo,
            IdReferencia = movimiento.IdReferencia,
            IdCuentaContable = movimiento.IdCuentaContable,
            IdReglaContable = movimiento.IdReglaContable,
            EsConciliado = movimiento.EsConciliado,
            FechaConciliacion = movimiento.FechaConciliacion,
            UsuarioConciliacion = movimiento.UsuarioConciliacion,
            ObservacionConciliacionMovimiento = movimiento.ObservacionConciliacion,
            NombreAreaFlujo = movimiento.NombreAreaFlujo,
            DescripcionAreaFlujo = movimiento.DescripcionAreaFlujo,
            CodigoReferencia = movimiento.CodigoReferencia,
            NombreReferencia = movimiento.NombreReferencia,
            DescripcionReferencia = movimiento.DescripcionReferencia,
            CodigoCuenta = movimiento.CodigoCuenta,
            NombreCuenta = movimiento.NombreCuenta,
            CuentaContableTexto = movimiento.CuentaContableTexto,
            Orden = movimiento.Orden,
            EsPrincipal = movimiento.EsPrincipal,
            RequiereComprobante = movimiento.RequiereComprobante,
            AplicaConciliacion = movimiento.AplicaConciliacion,
            ObservacionReglaContable = movimiento.ObservacionReglaContable,
            EstadoConciliacionTexto = movimiento.EstadoConciliacionTexto,
            EstadoOperativoConciliacion = movimiento.EstadoOperativoConciliacion,
            Comentario = comentario,
            ResultadoConciliacion = movimiento.EsConciliado == true ? "CONCILIADO" : "ACTUALIZADO"
        };
    }

    private static ConciliacionCandidate? BuildConciliacionCandidate(
        MovimientoBcpBusquedaRow movimiento,
        string nroOperacionNormalizado,
        string descripcionNumerica,
        PlanillaConciliacionRow planilla)
    {
        if (!string.IsNullOrWhiteSpace(nroOperacionNormalizado) &&
            string.Equals(planilla.NroOperacionNormalizado, nroOperacionNormalizado, StringComparison.OrdinalIgnoreCase))
        {
            return new ConciliacionCandidate
            {
                Prioridad = 1,
                ResultadoConciliacion = "COINCIDENCIA POR NRO OPERACION",
                TipoCoincidencia = "NRO OPERACION",
                Planilla = planilla,
                ObservacionConciliacion = $"Coincidencia exacta por NroOperacion: {planilla.NroOperacion}",
                OrdenPlanilla = planilla.Corre ?? 0,
                DiferenciaMontoAbs = CalculateAmountDifferenceAbsolute(movimiento.Monto, planilla.TotalPagar),
                DiferenciaFechaDias = CalculateDateDifferenceDays(movimiento.Fecha, planilla.FechaDeposito)
            };
        }

        if (!string.IsNullOrWhiteSpace(descripcionNumerica) &&
            !string.IsNullOrWhiteSpace(planilla.CuentaNumerica) &&
            (planilla.CuentaNumerica.Contains(descripcionNumerica, StringComparison.OrdinalIgnoreCase) ||
             descripcionNumerica.Contains(planilla.CuentaNumerica, StringComparison.OrdinalIgnoreCase)))
        {
            return new ConciliacionCandidate
            {
                Prioridad = 2,
                ResultadoConciliacion = "COINCIDENCIA POR CUENTA",
                TipoCoincidencia = "CUENTA",
                Planilla = planilla,
                ObservacionConciliacion = $"Coincidencia por Cuenta dentro de DescripcionOperacion: {planilla.Cuenta}",
                OrdenPlanilla = planilla.Corre ?? 0,
                DiferenciaMontoAbs = CalculateAmountDifferenceAbsolute(movimiento.Monto, planilla.TotalPagar),
                DiferenciaFechaDias = CalculateDateDifferenceDays(movimiento.Fecha, planilla.FechaDeposito)
            };
        }

        if (!string.IsNullOrWhiteSpace(descripcionNumerica) &&
            !string.IsNullOrWhiteSpace(planilla.CuentaInterNumerica) &&
            (planilla.CuentaInterNumerica.Contains(descripcionNumerica, StringComparison.OrdinalIgnoreCase) ||
             descripcionNumerica.Contains(planilla.CuentaInterNumerica, StringComparison.OrdinalIgnoreCase)))
        {
            return new ConciliacionCandidate
            {
                Prioridad = 3,
                ResultadoConciliacion = "COINCIDENCIA POR CUENTA INTER",
                TipoCoincidencia = "CUENTA INTER",
                Planilla = planilla,
                ObservacionConciliacion = $"Coincidencia por CuentaInter dentro de DescripcionOperacion: {planilla.CuentaInter}",
                OrdenPlanilla = planilla.Corre ?? 0,
                DiferenciaMontoAbs = CalculateAmountDifferenceAbsolute(movimiento.Monto, planilla.TotalPagar),
                DiferenciaFechaDias = CalculateDateDifferenceDays(movimiento.Fecha, planilla.FechaDeposito)
            };
        }

        return null;
    }

    private static decimal? CalculateAmountDifferenceAbsolute(decimal? montoMovimiento, decimal? totalPagar)
    {
        if (!montoMovimiento.HasValue || !totalPagar.HasValue)
        {
            return null;
        }

        return Math.Abs(Math.Abs(montoMovimiento.Value) - Math.Abs(totalPagar.Value));
    }

    private static int? CalculateDateDifferenceDays(DateTime? fechaMovimiento, DateTime? fechaPlanilla)
    {
        if (!fechaMovimiento.HasValue || !fechaPlanilla.HasValue)
        {
            return null;
        }

        return Math.Abs((fechaMovimiento.Value.Date - fechaPlanilla.Value.Date).Days);
    }

    private static string ExtractDigits(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return string.Empty;
        }

        var builder = new StringBuilder(value.Length);
        foreach (var character in value)
        {
            if (char.IsDigit(character))
            {
                builder.Append(character);
            }
        }

        return builder.ToString();
    }

    private static string? GetDictionaryString(IReadOnlyDictionary<string, object?> row, string key)
    {
        return row.TryGetValue(key, out var value) ? value?.ToString() : null;
    }

    private static int? GetDictionaryInt(IReadOnlyDictionary<string, object?> row, string key)
    {
        if (!row.TryGetValue(key, out var value) || value is null)
        {
            return null;
        }

        return value switch
        {
            int intValue => intValue,
            long longValue when longValue >= int.MinValue && longValue <= int.MaxValue => (int)longValue,
            short shortValue => shortValue,
            byte byteValue => byteValue,
            decimal decimalValue when decimalValue >= int.MinValue && decimalValue <= int.MaxValue => (int)decimalValue,
            _ when int.TryParse(value.ToString(), out var parsed) => parsed,
            _ => null
        };
    }

    private static decimal? GetDictionaryDecimal(IReadOnlyDictionary<string, object?> row, string key)
    {
        if (!row.TryGetValue(key, out var value) || value is null)
        {
            return null;
        }

        return value switch
        {
            decimal decimalValue => decimalValue,
            JsonElement jsonElement when jsonElement.ValueKind == JsonValueKind.Number && jsonElement.TryGetDecimal(out var number) => number,
            _ => TryParseDecimalValue(value.ToString() ?? string.Empty)
        };
    }

    private static DateTime? GetDictionaryDate(IReadOnlyDictionary<string, object?> row, string key)
    {
        if (!row.TryGetValue(key, out var value) || value is null)
        {
            return null;
        }

        return value switch
        {
            DateTime dateTime => dateTime,
            _ when DateTime.TryParse(value.ToString(), CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsed) => parsed,
            _ when DateTime.TryParse(value.ToString(), new CultureInfo("es-PE"), DateTimeStyles.None, out var parsedEs) => parsedEs,
            _ => null
        };
    }

    private static ConciliacionDateRange ResolveConciliationDateRange(
        DateTime? fechaInicioFiltro,
        DateTime? fechaFinFiltro,
        IReadOnlyList<MovimientoBcpBusquedaRow> movimientos)
    {
        if (fechaInicioFiltro.HasValue && fechaFinFiltro.HasValue)
        {
            return new ConciliacionDateRange(fechaInicioFiltro.Value.Date, fechaFinFiltro.Value.Date, true);
        }

        var fechas = movimientos
            .Where(item => item.Fecha.HasValue)
            .Select(item => item.Fecha!.Value.Date)
            .ToList();

        if (fechas.Count > 0)
        {
            return new ConciliacionDateRange(fechas.Min(), fechas.Max(), false);
        }

        return new ConciliacionDateRange(fechaInicioFiltro?.Date, fechaFinFiltro?.Date, false);
    }

    private async Task<List<string>> LoadUniqueIndexColumnsAsync(
        SqlConnection connection,
        CancellationToken cancellationToken)
    {
        const string sql = @"
SELECT c.name AS ColumnName
FROM sys.indexes i
INNER JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
INNER JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
WHERE i.object_id = OBJECT_ID(@TableName)
  AND i.name = @IndexName
  AND ic.is_included_column = 0
ORDER BY ic.key_ordinal;";

        var rows = await connection.QueryAsync<string>(
            _sqlCommandFactory.Create(
                sql,
                new { TableName = MovimientosTableName, IndexName = MovimientosUniqueIndexName },
                CommandType.Text,
                cancellationToken));

        return rows.Where(item => !string.IsNullOrWhiteSpace(item)).ToList();
    }

    private async Task<ConciliacionBcpDuplicateFilterResult> FilterDuplicateRowsAsync(
        SqlConnection connection,
        IReadOnlyList<Dictionary<string, object?>> filas,
        IReadOnlyList<string> uniqueKeyColumns,
        CancellationToken cancellationToken)
    {
        if (uniqueKeyColumns.Count == 0 || filas.Count == 0)
        {
            return new ConciliacionBcpDuplicateFilterResult(filas.ToList(), 0, [], 0, 0);
        }

        var existingKeys = await LoadExistingUniqueKeysAsync(connection, uniqueKeyColumns, cancellationToken);
        var existingKeysSet = new HashSet<string>(existingKeys, StringComparer.OrdinalIgnoreCase);
        var seenInPayload = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var filteredRows = new List<Dictionary<string, object?>>(filas.Count);
        var duplicateCount = 0;
        var duplicateCountInDatabase = 0;
        var duplicateCountInPayload = 0;

        foreach (var fila in filas)
        {
            var key = BuildUniqueKey(fila, uniqueKeyColumns);

            if (existingKeysSet.Contains(key))
            {
                duplicateCount++;
                duplicateCountInDatabase++;
                continue;
            }

            if (!seenInPayload.Add(key))
            {
                duplicateCount++;
                duplicateCountInPayload++;
                continue;
            }

            filteredRows.Add(fila);
        }

        var advertencias = new List<string>();
        if (duplicateCount > 0)
        {
            advertencias.Add(
                $"Se omitieron {duplicateCount} fila(s) duplicada(s) por la llave unica de MovimientosBcp ({string.Join(", ", uniqueKeyColumns)}).");

            if (duplicateCountInDatabase > 0)
            {
                advertencias.Add(
                    $"{duplicateCountInDatabase} fila(s) ya existian en la base de datos con esa misma llave unica.");
            }

            if (duplicateCountInPayload > 0)
            {
                advertencias.Add(
                    $"{duplicateCountInPayload} fila(s) venian repetidas dentro del mismo lote enviado a insertar.");
            }
        }

        return new ConciliacionBcpDuplicateFilterResult(
            filteredRows,
            duplicateCount,
            advertencias,
            duplicateCountInDatabase,
            duplicateCountInPayload);
    }

    private static List<string> BuildManagerialInsertWarnings(
        IReadOnlyList<string> existingWarnings,
        int filasDuplicadasEnBase,
        int filasDuplicadasEnLote,
        int filasOmitidasPorIndiceDuranteInsercion,
        IReadOnlyList<string> uniqueKeyColumns)
    {
        var warnings = new List<string>();

        var totalOmitidas = filasDuplicadasEnBase + filasDuplicadasEnLote + filasOmitidasPorIndiceDuranteInsercion;
        if (totalOmitidas > 0)
        {
            warnings.Add(
                $"Se omitieron {totalOmitidas} registro(s) por control de duplicados en la llave ({string.Join(", ", uniqueKeyColumns)}).");
        }

        if (filasDuplicadasEnBase > 0)
        {
            warnings.Add($"{filasDuplicadasEnBase} registro(s) ya existían en la base de datos.");
        }

        if (filasDuplicadasEnLote > 0)
        {
            warnings.Add($"{filasDuplicadasEnLote} registro(s) venían repetidos en el archivo procesado.");
        }

        if (filasOmitidasPorIndiceDuranteInsercion > 0)
        {
            warnings.Add($"{filasOmitidasPorIndiceDuranteInsercion} registro(s) fueron descartados al grabar por validación final de llave única.");
        }

        return warnings.Count > 0
            ? warnings
            : existingWarnings.Distinct(StringComparer.OrdinalIgnoreCase).ToList();
    }

    private async Task<HashSet<string>> LoadExistingUniqueKeysAsync(
        SqlConnection connection,
        IReadOnlyList<string> uniqueKeyColumns,
        CancellationToken cancellationToken)
    {
        var keyExpression = string.Join(" + N'|' + ", uniqueKeyColumns.Select(GetSqlKeyExpression));
        var sql = $"SELECT DISTINCT {keyExpression} AS UniqueKey FROM {MovimientosTableName};";

        var rows = await connection.QueryAsync<string>(
            _sqlCommandFactory.Create(sql, commandType: CommandType.Text, cancellationToken: cancellationToken));

        return rows.Where(item => !string.IsNullOrWhiteSpace(item))
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
    }

    private static string GetSqlKeyExpression(string columnName)
    {
        var safeColumn = columnName.Replace("]", "]]");
        return $"ISNULL(CONVERT(nvarchar(4000), [{safeColumn}]), N'<NULL>')";
    }

    private static string BuildUniqueKey(
        IReadOnlyDictionary<string, object?> fila,
        IReadOnlyList<string> uniqueKeyColumns)
    {
        var values = uniqueKeyColumns.Select(column =>
            NormalizeKeyPart(GetUniqueKeyValue(fila, column)));

        return string.Join("|", values);
    }

    private static object? GetUniqueKeyValue(IReadOnlyDictionary<string, object?> fila, string column)
    {
        if (TryGetValueIgnoreCase(fila, column, out var directValue))
        {
            return directValue;
        }

        if (string.Equals(column, "NroOperacion", StringComparison.OrdinalIgnoreCase))
        {
            if (TryGetValueIgnoreCase(fila, "NumeroOperacion", out var numeroOperacion))
            {
                return numeroOperacion;
            }
        }

        return null;
    }

    private static string NormalizeKeyPart(object? value)
    {
        if (value is JsonElement jsonElement)
        {
            value = jsonElement.ValueKind switch
            {
                JsonValueKind.String => jsonElement.GetString(),
                JsonValueKind.Number => jsonElement.ToString(),
                JsonValueKind.True => true,
                JsonValueKind.False => false,
                JsonValueKind.Null => null,
                _ => jsonElement.ToString()
            };
        }

        if (value is null || value == DBNull.Value)
        {
            return "<NULL>";
        }

        if (value is DateTime dateTime)
        {
            return dateTime.ToString("yyyy-MM-dd HH:mm:ss.fff", CultureInfo.InvariantCulture);
        }

        if (value is DateOnly dateOnly)
        {
            return dateOnly.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
        }

        if (value is IFormattable formattable)
        {
            var formatted = formattable.ToString(null, CultureInfo.InvariantCulture)?.Trim();
            return string.IsNullOrWhiteSpace(formatted) ? "<NULL>" : formatted;
        }

        var text = value.ToString()?.Trim();
        return string.IsNullOrWhiteSpace(text) ? "<NULL>" : text;
    }

    private static bool IsDuplicateKeyViolation(SqlException exception)
    {
        return exception.Number is 2601 or 2627;
    }

    private async Task<ConciliacionBcpAnalizarArchivoResponseDto> AnalyzeFileAsync(
        ConciliacionBcpArchivoMuestraDto archivo,
        ConciliacionBcpAnalizarArchivoAiResponseDto? aiArchivoFromBatch,
        IReadOnlyList<StoredProcedureParameterInfo> parametrosProcedimiento,
        string? usuario,
        CancellationToken cancellationToken)
    {
        if (!HasOpenAiConfiguration())
        {
            throw new InvalidOperationException(
                "No se pudo analizar la estructura con ChatGPT porque OpenAI no esta configurado en el backend.");
        }

        try
        {
            var aiArchivo = aiArchivoFromBatch;

            if (aiArchivo is null)
            {
                var analysisInstructions = BuildBcpAnalysisInstructions();
                var promptPayload = new
                {
                    archivo = new
                    {
                        archivo.NombreArchivo,
                        archivo.NombreHoja,
                        archivo.NumeroHoja,
                        archivo.TotalFilas,
                        archivo.Encabezados,
                        archivo.Filas,
                        archivo.FilasMuestra
                    },
                    parametrosProcedimiento = parametrosProcedimiento.Select(MapParameter).ToList(),
                    instrucciones = analysisInstructions
                };

                var analysisJson = await SendOpenAiChatCompletionAsync(
                    [
                        new OpenAiChatMessage
                        {
                            Role = "system",
                            Content = """
 Eres un analista experto en archivos Excel de movimientos bancarios BCP.
 Tu tarea es identificar la estructura del archivo, reconocer la hoja correcta, detectar encabezados aunque tengan variaciones, y devolver un JSON valido que sirva para consolidar e insertar movimientos en dbo.MovimientosBcp.
 Debes respetar las reglas de normalizacion, validacion y clasificacion descritas en las instrucciones del usuario.
 No inventes columnas ni valores.
 Responde exclusivamente en JSON valido.
 La respuesta debe tener un objeto raiz con la propiedad "archivos", incluso si solo analizas un archivo.
 Cada elemento de "archivos" debe incluir: nombreArchivo, nombreHoja, numeroHoja, filaCabecera, filaDatos, requiereRevision, observacion, advertencias, mapeos y filasNormalizadas.
 No uses markdown, bloques ```json ni texto adicional.
 """
                        },
                        new OpenAiChatMessage
                        {
                            Role = "user",
                            Content = JsonSerializer.Serialize(promptPayload, JsonOptions)
                        }
                    ],
                    cancellationToken,
                    responseFormatJson: true);

                var aiResponse = ParseAiAnalysisResponse(analysisJson, archivo.NombreArchivo);
                aiArchivo = aiResponse?.Archivos?.FirstOrDefault();
            }

            if (aiArchivo is null)
            {
                throw new InvalidOperationException(
                    $"ChatGPT no devolvio una estructura util para el archivo {archivo.NombreArchivo}.");
            }

            var normalizedHeaders = archivo.Encabezados
                .Where(header => !string.IsNullOrWhiteSpace(header))
                .Select(header => new HeaderInfo(header.Trim(), NormalizeKey(header)))
                .ToList();
            var mapeosIa = NormalizeMappings(aiArchivo.Mapeos, parametrosProcedimiento);
            var mapeosHeuristicos = BuildBcpFallbackMappings(normalizedHeaders);
            var mapeos = MergeMappings(mapeosIa, mapeosHeuristicos);
            var advertencias = (aiArchivo.Advertencias ?? [])
                .Where(item => !string.IsNullOrWhiteSpace(item))
                .Select(item => item.Trim())
                .ToList();

            if (mapeos.Count == 0)
            {
                var procParams = parametrosProcedimiento
                    .Where(parametro => !parametro.EsSalida)
                    .ToList();
                mapeos = BuildFallbackFromStoredProcedureParams(normalizedHeaders, procParams);
            }

            var filasNormalizadasIa = BuildNormalizedRowsFromAiOutput(
                aiArchivo.FilasNormalizadas,
                archivo.NombreArchivo,
                usuario);

            if (mapeosIa.Count == 0 && mapeos.Count > 0 && filasNormalizadasIa.Count == 0)
            {
                advertencias.Add("ChatGPT no devolvio mapeos validos completos; se aplico apoyo heuristico BCP para completar la estructura.");
            }

            if (mapeos.Count == 0 && filasNormalizadasIa.Count == 0)
            {
                throw new InvalidOperationException(
                    $"ChatGPT no devolvio mapeos validos para el archivo {archivo.NombreArchivo}.");
            }

            var filaCabecera = aiArchivo.FilaCabecera ?? (archivo.Encabezados.Count > 0 ? 1 : null);
            var filaDatos = aiArchivo.FilaDatos ?? ((filaCabecera ?? 1) + 1);
            var filasNormalizadas = filasNormalizadasIa.Count > 0
                ? filasNormalizadasIa
                : BuildNormalizedRowsFromAnalysis(
                    archivo,
                    mapeos,
                    filaCabecera,
                    filaDatos,
                    usuario);

            if (filasNormalizadas.Count == 0)
            {
                advertencias.Add("No se generaron filas normalizadas para el consolidado Movimientos ordenados.");
            }

            var requiereRevision = (aiArchivo.RequiereRevision ?? false) || filasNormalizadas.Count == 0;

            return new ConciliacionBcpAnalizarArchivoResponseDto
            {
                NombreArchivo = archivo.NombreArchivo,
                NombreHoja = NormalizeText(aiArchivo.NombreHoja) ?? archivo.NombreHoja,
                NumeroHoja = aiArchivo.NumeroHoja ?? archivo.NumeroHoja,
                TotalFilas = archivo.TotalFilas,
                FilaCabecera = filaCabecera,
                FilaDatos = filaDatos,
                RequiereRevision = requiereRevision,
                Observacion = NormalizeText(aiArchivo.Observacion)
                    ?? "Analisis validado con ChatGPT y consolidado en formato Movimientos ordenados.",
                Advertencias = advertencias,
                Mapeos = mapeos,
                FilasNormalizadas = filasNormalizadas
            };
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "[ConciliacionBcp] OpenAI fallo al analizar {Archivo}.", archivo.NombreArchivo);
            throw new InvalidOperationException(
                $"No se pudo completar el analisis con ChatGPT para {archivo.NombreArchivo}: {ex.Message}",
                ex);
        }
    }

    private async Task<ConciliacionBcpRawAnalysisResult?> AnalyzeRawFilesWithOpenAiAsync(
        IReadOnlyList<ConciliacionBcpArchivoMuestraDto> archivos,
        CancellationToken cancellationToken)
    {
        var rawFiles = archivos.Where(HasRawFileContent).ToList();
        if (rawFiles.Count == 0)
        {
            return null;
        }

        var prompt = BuildRawFilesPrompt();
        var analysisJson = await SendOpenAiRawFilesAnalysisAsync(rawFiles, prompt, cancellationToken);
        var parsed = ParsePromptAnalysisResponse(analysisJson);

        return new ConciliacionBcpRawAnalysisResult(
            parsed,
            new ConciliacionBcpDebugAnalisisDto
            {
                PromptAnalisis = prompt,
                RespuestaCrudaIa = analysisJson,
                JsonInterpretadoIa = parsed is null ? null : JsonSerializer.Serialize(parsed, JsonOptions),
                ArchivosEnviados = rawFiles.Select(MapDebugInputFile).ToList()
            });
    }

    private static bool HasRawFileContent(ConciliacionBcpArchivoMuestraDto archivo)
    {
        return !string.IsNullOrWhiteSpace(archivo.ContenidoBase64);
    }

    private static ConciliacionBcpAnalizarResponseDto BuildAppAnalysisResponseFromPrompt(
        ConciliacionBcpRawAnalysisResult rawAnalysis,
        IReadOnlyList<ConciliacionBcpArchivoMuestraDto> archivos,
        IReadOnlyList<StoredProcedureParameterInfo> parametrosProcedimiento)
    {
        var promptResponse = rawAnalysis.ParsedResponse!;
        var archivoAliasMap = BuildArchivoAliasMap(promptResponse, archivos);
        var clientMetadata = archivos
            .Select(ExtractClientFileMetadata)
            .ToList();
        var movimientosAsignados = BuildPromptMovementsByFile(promptResponse, archivos, clientMetadata, archivoAliasMap);
        var archivosAnalizados = new List<ConciliacionBcpAnalizarArchivoResponseDto>();

        for (var index = 0; index < archivos.Count; index++)
        {
            var archivo = archivos[index];
            var metadata = clientMetadata[index];
            var nombreArchivo = NormalizeText(archivo.NombreArchivo) ?? string.Empty;
            var resumen = FindBestResumenForFile(promptResponse.ResumenArchivos, metadata, nombreArchivo, archivoAliasMap);

            var movimientosArchivo = movimientosAsignados[archivo.NombreArchivo]
                .Select(MapPromptMovimientoToRow)
                .Where(HasMeaningfulMovementData)
                .ToList();

            var advertencias = new List<string>();
            if (promptResponse.Validaciones?.Observaciones?.Count > 0)
            {
                advertencias.AddRange(promptResponse.Validaciones.Observaciones.Where(item =>
                    ShouldAttachObservationToFile(item, nombreArchivo, archivos.Count)));
            }

            if (promptResponse.Validaciones?.ArchivosConError?.Any(item =>
                    IsMatchingArchivoOrigen(item, nombreArchivo, archivoAliasMap)) == true)
            {
                advertencias.Add("El archivo fue marcado con error durante el analisis.");
            }

            archivosAnalizados.Add(new ConciliacionBcpAnalizarArchivoResponseDto
            {
                NombreArchivo = archivo.NombreArchivo,
                NombreHoja = archivo.NombreHoja,
                NumeroHoja = archivo.NumeroHoja,
                TotalFilas = archivo.TotalFilas,
                FilaCabecera = archivo.Encabezados.Count > 0 ? 1 : null,
                FilaDatos = archivo.Encabezados.Count > 0 ? 2 : null,
                RequiereRevision = movimientosArchivo.Count == 0 ||
                                   promptResponse.Validaciones?.Insertable == false,
                Observacion = BuildPromptObservation(resumen, movimientosArchivo.Count),
                Advertencias = advertencias.Distinct(StringComparer.OrdinalIgnoreCase).ToList(),
                Mapeos = [],
                FilasNormalizadas = movimientosArchivo,
                Debug = new ConciliacionBcpDebugArchivoDto
                {
                    MovimientosIaDetectados = movimientosArchivo.Count,
                    FilasNormalizadasFinales = movimientosArchivo.Count,
                    MotivoSinRegistros = movimientosArchivo.Count == 0
                        ? BuildMissingRowsReason(promptResponse, archivo, resumen, archivoAliasMap)
                        : null
                }
            });
        }

        return new ConciliacionBcpAnalizarResponseDto
        {
            Resumen = $"Se analizaron {promptResponse.ArchivosProcesados} archivo(s) Excel usando la IA sobre los documentos completos.",
            PuedeInsertar = promptResponse.Validaciones?.Insertable == true && archivosAnalizados.All(item => item.FilasNormalizadas.Count > 0),
            ParametrosProcedimiento = parametrosProcedimiento.Select(MapParameter).ToList(),
            Archivos = archivosAnalizados,
            Debug = rawAnalysis.Debug
        };
    }

    private static Dictionary<string, List<ConciliacionBcpPromptMovimientoDto>> BuildPromptMovementsByFile(
        ConciliacionBcpPromptAnalysisResponseDto promptResponse,
        IReadOnlyList<ConciliacionBcpArchivoMuestraDto> archivos,
        IReadOnlyList<ClientFileMetadata> clientMetadata,
        IReadOnlyDictionary<string, string> archivoAliasMap)
    {
        var movimientosPorArchivo = archivos.ToDictionary(
            item => item.NombreArchivo,
            _ => new List<ConciliacionBcpPromptMovimientoDto>(),
            StringComparer.OrdinalIgnoreCase);
        var movimientosExactosPorClave = promptResponse.Movimientos
            .GroupBy(GetPromptMovementCompositeKey, StringComparer.OrdinalIgnoreCase)
            .Where(group => !string.IsNullOrWhiteSpace(group.Key))
            .ToDictionary(
                group => group.Key,
                group => group.ToList(),
                StringComparer.OrdinalIgnoreCase);
        var movimientosYaAsignados = new HashSet<ConciliacionBcpPromptMovimientoDto>();

        for (var index = 0; index < archivos.Count; index++)
        {
            var compositeKey = GetClientMetadataCompositeKey(clientMetadata[index]);
            if (string.IsNullOrWhiteSpace(compositeKey) ||
                !movimientosExactosPorClave.TryGetValue(compositeKey, out var movimientosExactos))
            {
                continue;
            }

            var nombreArchivoDestino = archivos[index].NombreArchivo;
            movimientosPorArchivo[nombreArchivoDestino].AddRange(
                movimientosExactos.Select(movimiento => CloneMovementForArchivoOrigen(movimiento, nombreArchivoDestino)));
            foreach (var movimiento in movimientosExactos)
            {
                movimientosYaAsignados.Add(movimiento);
            }
        }

        foreach (var movimiento in promptResponse.Movimientos)
        {
            if (movimientosYaAsignados.Contains(movimiento))
            {
                continue;
            }

            var matchedFileName = FindBestMatchingFileNameForMovement(
                movimiento,
                archivos,
                clientMetadata,
                promptResponse.ResumenArchivos,
                archivoAliasMap);

            if (matchedFileName is not null &&
                movimientosPorArchivo.TryGetValue(matchedFileName, out var movimientos))
            {
                movimientos.Add(CloneMovementForArchivoOrigen(movimiento, matchedFileName));
            }
        }

        return movimientosPorArchivo;
    }

    private static ConciliacionBcpPromptMovimientoDto CloneMovementForArchivoOrigen(
        ConciliacionBcpPromptMovimientoDto movimiento,
        string archivoOrigen)
    {
        return new ConciliacionBcpPromptMovimientoDto
        {
            Empresa = movimiento.Empresa,
            Cuenta = movimiento.Cuenta,
            Moneda = movimiento.Moneda,
            Fecha = movimiento.Fecha,
            FechaValuta = movimiento.FechaValuta,
            Proveedor = movimiento.Proveedor,
            ItemSistema = movimiento.ItemSistema,
            DescripcionOperacion = movimiento.DescripcionOperacion,
            Monto = movimiento.Monto,
            SucursalAgencia = movimiento.SucursalAgencia,
            NumeroOperacion = movimiento.NumeroOperacion,
            Usuario = movimiento.Usuario,
            ArchivoOrigen = archivoOrigen
        };
    }

    private static ConciliacionBcpDebugArchivoEntradaDto MapDebugInputFile(ConciliacionBcpArchivoMuestraDto archivo)
    {
        return new ConciliacionBcpDebugArchivoEntradaDto
        {
            NombreArchivo = archivo.NombreArchivo,
            TipoContenido = archivo.TipoContenido,
            TamanoBytes = archivo.TamanoBytes,
            NombreHojaDetectadaCliente = archivo.NombreHoja,
            NumeroHojaDetectadaCliente = archivo.NumeroHoja,
            TotalFilasDetectadasCliente = archivo.TotalFilas,
            EncabezadosDetectadosCliente = archivo.Encabezados,
            FilasMuestraCliente = archivo.FilasMuestra
        };
    }

    private static Dictionary<string, string> BuildArchivoAliasMap(
        ConciliacionBcpPromptAnalysisResponseDto promptResponse,
        IReadOnlyList<ConciliacionBcpArchivoMuestraDto> archivos)
    {
        var aliasMap = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        if (archivos.Count == 0)
        {
            return aliasMap;
        }

        var clientMetadata = archivos
            .Select(ExtractClientFileMetadata)
            .ToList();

        foreach (var resumen in promptResponse.ResumenArchivos)
        {
            var alias = NormalizeText(resumen.ArchivoOrigen);
            if (string.IsNullOrWhiteSpace(alias) || aliasMap.ContainsKey(alias))
            {
                continue;
            }

            var matchingFile = clientMetadata.FirstOrDefault(item =>
                IsSameNormalizedValue(item.Cuenta, resumen.Cuenta) &&
                IsSameNormalizedValue(item.Empresa, resumen.Empresa) &&
                IsSameNormalizedValue(item.Moneda, resumen.Moneda));

            if (matchingFile is not null)
            {
                aliasMap[alias] = matchingFile.NombreArchivo;
            }
        }

        var aliasesPendientes = promptResponse.ResumenArchivos
            .Select(item => NormalizeText(item.ArchivoOrigen))
            .Where(item => !string.IsNullOrWhiteSpace(item))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Where(item => item is not null && !aliasMap.ContainsKey(item))
            .Select(item => item!)
            .ToList();

        if (aliasesPendientes.Count > 0)
        {
            var archivosDisponibles = archivos
                .Select(item => item.NombreArchivo)
                .Where(item => aliasMap.Values.All(mapped => !string.Equals(mapped, item, StringComparison.OrdinalIgnoreCase)))
                .ToList();

            foreach (var pair in aliasesPendientes
                         .OrderBy(GetAliasSortIndex)
                         .Zip(archivosDisponibles, (alias, nombreArchivo) => new { alias, nombreArchivo }))
            {
                aliasMap[pair.alias] = pair.nombreArchivo;
            }
        }

        return aliasMap;
    }

    private static ConciliacionBcpPromptResumenArchivoDto? FindBestResumenForFile(
        IReadOnlyList<ConciliacionBcpPromptResumenArchivoDto> resumenes,
        ClientFileMetadata metadata,
        string expectedFileName,
        IReadOnlyDictionary<string, string>? archivoAliasMap = null)
    {
        var compositeKey = GetClientMetadataCompositeKey(metadata);
        if (!string.IsNullOrWhiteSpace(compositeKey))
        {
            var exactResumen = resumenes.FirstOrDefault(item =>
                string.Equals(GetPromptResumenCompositeKey(item), compositeKey, StringComparison.OrdinalIgnoreCase));

            if (exactResumen is not null)
            {
                return exactResumen;
            }
        }

        var metadataCandidates = resumenes
            .Select(item => new
            {
                Resumen = item,
                Score = GetPromptMatchScore(item.Cuenta, item.Empresa, item.Moneda, metadata)
            })
            .Where(item => item.Score > 0)
            .OrderByDescending(item => item.Score)
            .ToList();

        if (metadataCandidates.Count > 0)
        {
            return metadataCandidates[0].Resumen;
        }

        return resumenes.FirstOrDefault(item =>
            IsMatchingArchivoOrigen(item.ArchivoOrigen, expectedFileName, archivoAliasMap));
    }

    private static bool IsMatchingArchivoOrigen(
        string? aiArchivoOrigen,
        string expectedFileName,
        IReadOnlyDictionary<string, string>? archivoAliasMap = null)
    {
        var aiName = NormalizeText(aiArchivoOrigen);
        var expectedName = NormalizeText(expectedFileName);

        if (string.IsNullOrWhiteSpace(aiName) || string.IsNullOrWhiteSpace(expectedName))
        {
            return false;
        }

        if (string.Equals(aiName, expectedName, StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        var aiComparable = NormalizeFileComparable(aiName);
        var expectedComparable = NormalizeFileComparable(expectedName);

        if (aiComparable == expectedComparable ||
            aiComparable.Contains(expectedComparable, StringComparison.OrdinalIgnoreCase) ||
            expectedComparable.Contains(aiComparable, StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        if (archivoAliasMap is not null &&
            archivoAliasMap.TryGetValue(aiName, out var mappedFileName))
        {
            return IsMatchingArchivoOrigen(mappedFileName, expectedFileName);
        }

        return false;
    }

    private static string NormalizeFileComparable(string value)
    {
        var fileName = Path.GetFileNameWithoutExtension(value);
        return NormalizeKey(fileName);
    }

    private static bool ShouldAttachObservationToFile(string observation, string fileName, int totalFiles)
    {
        if (string.IsNullOrWhiteSpace(observation))
        {
            return false;
        }

        if (totalFiles == 1)
        {
            return true;
        }

        return IsMatchingArchivoOrigen(observation, fileName);
    }

    private static bool IsMovementMatchingFile(
        ConciliacionBcpPromptMovimientoDto movimiento,
        ConciliacionBcpArchivoMuestraDto archivo,
        ConciliacionBcpPromptResumenArchivoDto? resumen)
    {
        var clientMetadata = ExtractClientFileMetadata(archivo);
        var cuentasObjetivo = new[] { resumen?.Cuenta, clientMetadata.Cuenta }
            .Select(NormalizeKey)
            .Where(item => !string.IsNullOrWhiteSpace(item))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        var empresasObjetivo = new[] { resumen?.Empresa, clientMetadata.Empresa }
            .Select(NormalizeKey)
            .Where(item => !string.IsNullOrWhiteSpace(item))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        var monedasObjetivo = new[] { resumen?.Moneda, clientMetadata.Moneda }
            .Select(NormalizeKey)
            .Where(item => !string.IsNullOrWhiteSpace(item))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        var cuentaMovimiento = NormalizeKey(movimiento.Cuenta);
        var empresaMovimiento = NormalizeKey(movimiento.Empresa);
        var monedaMovimiento = NormalizeKey(movimiento.Moneda);

        if (cuentasObjetivo.Count > 0 && !cuentasObjetivo.Contains(cuentaMovimiento, StringComparer.OrdinalIgnoreCase))
        {
            return false;
        }

        if (empresasObjetivo.Count > 0 && !empresasObjetivo.Contains(empresaMovimiento, StringComparer.OrdinalIgnoreCase))
        {
            return false;
        }

        if (monedasObjetivo.Count > 0 && !monedasObjetivo.Contains(monedaMovimiento, StringComparer.OrdinalIgnoreCase))
        {
            return false;
        }

        return cuentasObjetivo.Count > 0 || empresasObjetivo.Count > 0 || monedasObjetivo.Count > 0;
    }

    private static string BuildMissingRowsReason(
        ConciliacionBcpPromptAnalysisResponseDto promptResponse,
        ConciliacionBcpArchivoMuestraDto archivo,
        ConciliacionBcpPromptResumenArchivoDto? resumen,
        IReadOnlyDictionary<string, string>? archivoAliasMap = null)
    {
        var nombreArchivo = NormalizeText(archivo.NombreArchivo) ?? string.Empty;
        var anyRowsReturned = promptResponse.Movimientos.Count > 0;
        var anyMatchingByMetadata = promptResponse.Movimientos.Any(item =>
            IsMovementMatchingFile(item, archivo, resumen));
        var anyMatchingByFuzzyName = promptResponse.Movimientos.Any(item =>
            IsMatchingArchivoOrigen(item.ArchivoOrigen, nombreArchivo, archivoAliasMap));

        if (!anyRowsReturned)
        {
            return "La IA devolvio cero movimientos en total para esta ejecucion.";
        }

        if (anyMatchingByMetadata)
        {
            return "La IA devolvio movimientos para este archivo, pero ninguno pudo normalizarse con la estructura final.";
        }

        if (!anyMatchingByFuzzyName)
        {
            return "La IA devolvio movimientos, pero no los asocio a este archivo con un archivoOrigen reconocible.";
        }

        return "La IA devolvio movimientos para este archivo, pero ninguno cumplio las validaciones minimas para convertirse en registro final.";
    }

    private static string? FindBestMatchingFileNameForMovement(
        ConciliacionBcpPromptMovimientoDto movimiento,
        IReadOnlyList<ConciliacionBcpArchivoMuestraDto> archivos,
        IReadOnlyList<ClientFileMetadata> clientMetadata,
        IReadOnlyList<ConciliacionBcpPromptResumenArchivoDto> resumenes,
        IReadOnlyDictionary<string, string>? archivoAliasMap = null)
    {
        var metadataCandidates = clientMetadata
            .Select((metadata, index) => new
            {
                metadata.NombreArchivo,
                Score = GetPromptMatchScore(movimiento.Cuenta, movimiento.Empresa, movimiento.Moneda, metadata),
                Index = index
            })
            .Where(item => item.Score > 0)
            .OrderByDescending(item => item.Score)
            .ThenBy(item => item.Index)
            .ToList();

        if (metadataCandidates.Count > 0)
        {
            return metadataCandidates[0].NombreArchivo;
        }

        var resumenMatchedFile = resumenes
            .Where(resumen => IsMovementMatchingResumen(movimiento, resumen))
            .Select(resumen => FindBestMatchingFileNameForResumen(resumen, clientMetadata, archivoAliasMap))
            .FirstOrDefault(nombreArchivo => !string.IsNullOrWhiteSpace(nombreArchivo));

        if (!string.IsNullOrWhiteSpace(resumenMatchedFile))
        {
            return resumenMatchedFile;
        }

        var aliasMatchedFile = archivos
            .Select(item => item.NombreArchivo)
            .FirstOrDefault(nombreArchivo =>
                IsMatchingArchivoOrigen(movimiento.ArchivoOrigen, nombreArchivo, archivoAliasMap));

        return aliasMatchedFile;
    }

    private static string? FindBestMatchingFileNameForResumen(
        ConciliacionBcpPromptResumenArchivoDto resumen,
        IReadOnlyList<ClientFileMetadata> clientMetadata,
        IReadOnlyDictionary<string, string>? archivoAliasMap = null)
    {
        var metadataCandidate = clientMetadata
            .Select((metadata, index) => new
            {
                metadata.NombreArchivo,
                Score = GetPromptMatchScore(resumen.Cuenta, resumen.Empresa, resumen.Moneda, metadata),
                Index = index
            })
            .Where(item => item.Score > 0)
            .OrderByDescending(item => item.Score)
            .ThenBy(item => item.Index)
            .FirstOrDefault();

        if (metadataCandidate is not null)
        {
            return metadataCandidate.NombreArchivo;
        }

        var alias = NormalizeText(resumen.ArchivoOrigen);
        if (!string.IsNullOrWhiteSpace(alias) &&
            archivoAliasMap is not null &&
            archivoAliasMap.TryGetValue(alias, out var mappedFileName))
        {
            return mappedFileName;
        }

        return null;
    }

    private static bool IsMovementMatchingResumen(
        ConciliacionBcpPromptMovimientoDto movimiento,
        ConciliacionBcpPromptResumenArchivoDto resumen)
    {
        var compositeMovimiento = BuildCompositeKey(movimiento.Cuenta, movimiento.Empresa, movimiento.Moneda);
        var compositeResumen = BuildCompositeKey(resumen.Cuenta, resumen.Empresa, resumen.Moneda);

        if (!string.IsNullOrWhiteSpace(compositeMovimiento) &&
            string.Equals(compositeMovimiento, compositeResumen, StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        var cuentaMovimiento = NormalizeKey(movimiento.Cuenta);
        var empresaMovimiento = NormalizeKey(movimiento.Empresa);
        var monedaMovimiento = NormalizeKey(movimiento.Moneda);
        var cuentaResumen = NormalizeKey(resumen.Cuenta);
        var empresaResumen = NormalizeKey(resumen.Empresa);
        var monedaResumen = NormalizeKey(resumen.Moneda);

        if (!string.IsNullOrWhiteSpace(cuentaMovimiento) &&
            string.Equals(cuentaMovimiento, cuentaResumen, StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        return !string.IsNullOrWhiteSpace(empresaMovimiento) &&
               !string.IsNullOrWhiteSpace(monedaMovimiento) &&
               string.Equals(empresaMovimiento, empresaResumen, StringComparison.OrdinalIgnoreCase) &&
               string.Equals(monedaMovimiento, monedaResumen, StringComparison.OrdinalIgnoreCase);
    }

    private static int GetPromptMatchScore(
        string? cuenta,
        string? empresa,
        string? moneda,
        ClientFileMetadata metadata)
    {
        var score = 0;

        if (IsSameNormalizedValue(cuenta, metadata.Cuenta))
        {
            score += 8;
        }

        if (IsSameNormalizedValue(empresa, metadata.Empresa))
        {
            score += 4;
        }

        if (IsSameNormalizedValue(moneda, metadata.Moneda))
        {
            score += 2;
        }

        return score;
    }

    private static string GetPromptMovementCompositeKey(ConciliacionBcpPromptMovimientoDto movimiento)
    {
        return BuildCompositeKey(movimiento.Cuenta, movimiento.Empresa, movimiento.Moneda);
    }

    private static string GetPromptResumenCompositeKey(ConciliacionBcpPromptResumenArchivoDto resumen)
    {
        return BuildCompositeKey(resumen.Cuenta, resumen.Empresa, resumen.Moneda);
    }

    private static string GetClientMetadataCompositeKey(ClientFileMetadata metadata)
    {
        return BuildCompositeKey(metadata.Cuenta, metadata.Empresa, metadata.Moneda);
    }

    private static string BuildCompositeKey(string? cuenta, string? empresa, string? moneda)
    {
        var cuentaKey = NormalizeKey(cuenta);
        var empresaKey = NormalizeKey(empresa);
        var monedaKey = NormalizeKey(moneda);

        return string.IsNullOrWhiteSpace(cuentaKey) ||
               string.IsNullOrWhiteSpace(empresaKey) ||
               string.IsNullOrWhiteSpace(monedaKey)
            ? string.Empty
            : $"{cuentaKey}|{empresaKey}|{monedaKey}";
    }

    private static int GetAliasSortIndex(string alias)
    {
        var normalizedAlias = NormalizeText(alias) ?? string.Empty;
        var match = Regex.Match(normalizedAlias, @"(\d+)$");
        return match.Success && int.TryParse(match.Groups[1].Value, out var index)
            ? index
            : int.MaxValue;
    }

    private static ClientFileMetadata ExtractClientFileMetadata(ConciliacionBcpArchivoMuestraDto archivo)
    {
        string? cuenta = null;
        string? empresa = null;
        string? moneda = null;

        foreach (var row in archivo.Filas.Take(40))
        {
            var normalizedCells = row
                .Select(NormalizeText)
                .Where(text => !string.IsNullOrWhiteSpace(text))
                .Select(text => text!)
                .ToList();

            if (normalizedCells.Count == 0)
            {
                continue;
            }

            if (cuenta is null && TryExtractRowLabeledValue(normalizedCells, "Cuenta", out var cuentaTexto))
            {
                SplitCuentaEmpresa(cuentaTexto, out cuenta, out empresa);
            }

            if (moneda is null && TryExtractRowLabeledValue(normalizedCells, "Moneda", out var monedaTexto))
            {
                moneda = monedaTexto;
            }
        }

        return new ClientFileMetadata(
            archivo.NombreArchivo,
            NormalizeText(cuenta),
            NormalizeText(empresa),
            NormalizeText(moneda));
    }

    private static bool TryExtractLabeledValue(string text, string label, out string value)
    {
        value = string.Empty;
        var pattern = $"^{Regex.Escape(label)}\\s*[:,-]?\\s*(.+)$";
        var match = Regex.Match(text, pattern, RegexOptions.IgnoreCase);
        if (!match.Success)
        {
            return false;
        }

        value = match.Groups[1].Value.Trim();
        return !string.IsNullOrWhiteSpace(value);
    }

    private static bool TryExtractRowLabeledValue(IReadOnlyList<string> cells, string label, out string value)
    {
        value = string.Empty;
        if (cells.Count == 0)
        {
            return false;
        }

        var firstCell = NormalizeText(cells[0]) ?? string.Empty;
        if (string.Equals(firstCell, label, StringComparison.OrdinalIgnoreCase) ||
            firstCell.StartsWith(label + ":", StringComparison.OrdinalIgnoreCase) ||
            firstCell.StartsWith(label + ",", StringComparison.OrdinalIgnoreCase) ||
            firstCell.StartsWith(label + "-", StringComparison.OrdinalIgnoreCase))
        {
            var remainingCells = cells
                .Skip(1)
                .Where(cell => !string.IsNullOrWhiteSpace(cell))
                .ToList();

            if (remainingCells.Count > 0)
            {
                value = label.Equals("Cuenta", StringComparison.OrdinalIgnoreCase) && remainingCells.Count >= 2
                    ? $"{remainingCells[0]} - {string.Join(" ", remainingCells.Skip(1))}"
                    : string.Join(" ", remainingCells);

                return !string.IsNullOrWhiteSpace(value);
            }
        }

        foreach (var cell in cells)
        {
            if (TryExtractLabeledValue(cell, label, out value))
            {
                return true;
            }
        }

        var joined = string.Join(" ", cells);
        return TryExtractLabeledValue(joined, label, out value);
    }

    private static void SplitCuentaEmpresa(string cuentaEmpresa, out string? cuenta, out string? empresa)
    {
        cuenta = null;
        empresa = null;

        var normalized = NormalizeText(cuentaEmpresa);
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return;
        }

        var parts = normalized.Split(" - ", 2, StringSplitOptions.TrimEntries);
        if (parts.Length == 2)
        {
            cuenta = parts[0];
            empresa = parts[1];
            return;
        }

        cuenta = normalized;
    }

    private static string ResolveArchivoOrigenDisplay(
        string? archivoOrigen,
        string? empresa,
        string? cuenta,
        string? moneda)
    {
        var normalizedOrigen = NormalizeText(archivoOrigen);
        if (!string.IsNullOrWhiteSpace(normalizedOrigen) && !IsGenericArchivoOrigen(normalizedOrigen))
        {
            return normalizedOrigen;
        }

        var segments = new[]
        {
            NormalizeText(empresa),
            NormalizeText(cuenta),
            NormalizeText(moneda)
        }
        .Where(item => !string.IsNullOrWhiteSpace(item))
        .ToList();

        if (segments.Count > 0)
        {
            return string.Join(" | ", segments);
        }

        return normalizedOrigen ?? string.Empty;
    }

    private static bool IsGenericArchivoOrigen(string archivoOrigen)
    {
        var normalized = NormalizeKey(archivoOrigen);
        return normalized is "accountdetail" or "sheet1" or "hoja1" or "movimientos" or "movimientosordenados"
               || normalized.Contains("parsedtextforsheet", StringComparison.OrdinalIgnoreCase)
               || normalized.Contains("tabnameaccountdetail", StringComparison.OrdinalIgnoreCase)
               || normalized.Contains("tabsxlsx", StringComparison.OrdinalIgnoreCase);
    }

    private static bool IsSameNormalizedValue(string? left, string? right)
    {
        var normalizedLeft = NormalizeKey(left);
        var normalizedRight = NormalizeKey(right);
        return !string.IsNullOrWhiteSpace(normalizedLeft) &&
               !string.IsNullOrWhiteSpace(normalizedRight) &&
               string.Equals(normalizedLeft, normalizedRight, StringComparison.OrdinalIgnoreCase);
    }

    private static string BuildPromptObservation(ConciliacionBcpPromptResumenArchivoDto? resumen, int totalMovimientos)
    {
        if (resumen is null)
        {
            return totalMovimientos > 0
                ? "Analisis generado con IA sobre el documento completo."
                : "La IA no devolvio movimientos validos para este archivo.";
        }

        return $"Empresa: {NormalizeText(resumen.Empresa) ?? "(sin empresa)"} | " +
               $"Cuenta: {NormalizeText(resumen.Cuenta) ?? "(sin cuenta)"} | " +
               $"Moneda: {NormalizeText(resumen.Moneda) ?? "(sin moneda)"} | " +
               $"Movimientos: {resumen.TotalMovimientos}";
    }

    private static Dictionary<string, object?> MapPromptMovimientoToRow(ConciliacionBcpPromptMovimientoDto movimiento)
    {
        var row = CreateEmptyOrderedMovementRow();
        row["Empresa"] = NormalizeText(movimiento.Empresa);
        row["Cuenta"] = NormalizeText(movimiento.Cuenta);
        row["Moneda"] = NormalizeText(movimiento.Moneda);
        row["Fecha"] = NormalizeText(movimiento.Fecha);
        row["FechaValuta"] = NormalizeText(movimiento.FechaValuta);
        row["Proveedor"] = NormalizeText(movimiento.Proveedor);
        row["ItemSistema"] = NormalizeText(movimiento.ItemSistema);
        row["DescripcionOperacion"] = NormalizeText(movimiento.DescripcionOperacion);
        row["Monto"] = movimiento.Monto;
        row["SucursalAgencia"] = NormalizeText(movimiento.SucursalAgencia);
        row["NroOperacion"] = NormalizeText(movimiento.NumeroOperacion);
        row["Usuario"] = NormalizeText(movimiento.Usuario);
        row["ArchivoOrigen"] = ResolveArchivoOrigenDisplay(
            movimiento.ArchivoOrigen,
            movimiento.Empresa,
            movimiento.Cuenta,
            movimiento.Moneda);

        var descripcionOperacion = row["DescripcionOperacion"]?.ToString();
        var nroOperacion = row["NroOperacion"]?.ToString();
        var esNroOperacionValido = IsValidOperationNumber(nroOperacion);
        row["IdActivo"] = true;
        row["EsNroOperacionValido"] = esNroOperacionValido;
        row["TipoMovimientoBanco"] = ResolveTipoMovimientoBanco(descripcionOperacion);
        row["EstadoConciliacion"] = ResolveEstadoConciliacion(esNroOperacionValido, descripcionOperacion);

        return row;
    }

    private static ConciliacionBcpPromptAnalysisResponseDto? ParsePromptAnalysisResponse(string analysisJson)
    {
        var candidate = ExtractJsonCandidate(analysisJson) ?? analysisJson;
        return JsonSerializer.Deserialize<ConciliacionBcpPromptAnalysisResponseDto>(candidate, JsonOptions);
    }

    private static ConciliacionBcpExportResponseDto? ParseExportResponse(string exportJson)
    {
        var candidate = ExtractJsonCandidate(exportJson) ?? exportJson;
        return JsonSerializer.Deserialize<ConciliacionBcpExportResponseDto>(candidate, JsonOptions);
    }

    private static ConciliacionBcpExportResponseDto BuildExportResponseFromAnalysis(
        ConciliacionBcpAnalizarResponseDto analysis)
    {
        var movimientos = analysis.Archivos
            .SelectMany(item => item.FilasNormalizadas.Select(MapAnalysisRowToPromptMovimiento))
            .Where(item => !string.IsNullOrWhiteSpace(item.Fecha))
            .OrderByDescending(item => item.Fecha)
            .ThenBy(item => item.Empresa)
            .ThenBy(item => item.Moneda)
            .ThenBy(item => item.NumeroOperacion)
            .ToList();

        var resumenArchivos = analysis.Archivos
            .Select(item =>
            {
                var rows = item.FilasNormalizadas;
                var ingresos = rows.Sum(row => GetDecimal(row, "Monto") > 0 ? GetDecimal(row, "Monto") : 0m);
                var egresos = rows.Sum(row => GetDecimal(row, "Monto") < 0 ? GetDecimal(row, "Monto") : 0m);
                var firstRow = rows.FirstOrDefault();
                return new ConciliacionBcpPromptResumenArchivoDto
                {
                    ArchivoOrigen = ResolveArchivoOrigenDisplay(
                        item.NombreArchivo,
                        firstRow?.GetValueOrDefault("Empresa")?.ToString(),
                        firstRow?.GetValueOrDefault("Cuenta")?.ToString(),
                        firstRow?.GetValueOrDefault("Moneda")?.ToString()),
                    Empresa = firstRow?.GetValueOrDefault("Empresa")?.ToString(),
                    Cuenta = firstRow?.GetValueOrDefault("Cuenta")?.ToString(),
                    Moneda = firstRow?.GetValueOrDefault("Moneda")?.ToString(),
                    TipoCuenta = null,
                    TotalMovimientos = rows.Count,
                    TotalIngresos = ingresos,
                    TotalEgresos = egresos,
                    Neto = ingresos + egresos
                };
            })
            .ToList();

        var totalIngresos = resumenArchivos.Sum(item => item.TotalIngresos ?? 0m);
        var totalEgresos = resumenArchivos.Sum(item => item.TotalEgresos ?? 0m);

        return new ConciliacionBcpExportResponseDto
        {
            NombreArchivo = "movimientos_consolidados_ordenados_por_operacion.xlsx",
            ArchivosProcesados = analysis.Archivos.Count,
            TotalMovimientos = movimientos.Count,
            TotalIngresos = totalIngresos,
            TotalEgresos = totalEgresos,
            Neto = totalIngresos + totalEgresos,
            CantidadDuplicadosDetectados = CountDuplicateMovements(movimientos),
            Insertable = analysis.PuedeInsertar,
            ResumenArchivos = resumenArchivos,
            Movimientos = movimientos
        };
    }

    private static ConciliacionBcpPromptMovimientoDto MapAnalysisRowToPromptMovimiento(Dictionary<string, object?> row)
    {
        return new ConciliacionBcpPromptMovimientoDto
        {
            Empresa = GetText(row, "Empresa"),
            Cuenta = GetText(row, "Cuenta"),
            Moneda = GetText(row, "Moneda"),
            Fecha = GetText(row, "Fecha"),
            FechaValuta = GetText(row, "FechaValuta"),
            Proveedor = GetText(row, "Proveedor"),
            ItemSistema = GetText(row, "ItemSistema"),
            DescripcionOperacion = GetText(row, "DescripcionOperacion"),
            Monto = GetDecimal(row, "Monto"),
            SucursalAgencia = GetText(row, "SucursalAgencia"),
            NumeroOperacion = GetText(row, "NroOperacion"),
            Usuario = GetText(row, "Usuario"),
            ArchivoOrigen = GetText(row, "ArchivoOrigen")
        };
    }

    private static string? GetText(IReadOnlyDictionary<string, object?> row, string field)
    {
        return TryGetValueIgnoreCase(row, field, out var value)
            ? NormalizeText(value?.ToString())
            : null;
    }

    private static decimal GetDecimal(IReadOnlyDictionary<string, object?> row, string field)
    {
        if (!TryGetValueIgnoreCase(row, field, out var value) || value is null)
        {
            return 0m;
        }

        return value switch
        {
            decimal decimalValue => decimalValue,
            JsonElement jsonElement when jsonElement.ValueKind == JsonValueKind.Number && jsonElement.TryGetDecimal(out var number) => number,
            _ => TryParseDecimalValue(value.ToString() ?? string.Empty) ?? 0m
        };
    }

    private static int CountDuplicateMovements(IReadOnlyList<ConciliacionBcpPromptMovimientoDto> movimientos)
    {
        return movimientos
            .GroupBy(item => string.Join("|",
                NormalizeText(item.Empresa) ?? string.Empty,
                NormalizeText(item.Cuenta) ?? string.Empty,
                NormalizeText(item.Fecha) ?? string.Empty,
                NormalizeText(item.NumeroOperacion) ?? string.Empty,
                NormalizeText(item.DescripcionOperacion) ?? string.Empty,
                item.Monto?.ToString(CultureInfo.InvariantCulture) ?? "0"))
            .Count(group => group.Count() > 1);
    }

    private static string BuildRawFilesPrompt()
    {
        return """
Actúa como un analizador experto de archivos Excel bancarios BCP.

Vas a recibir uno o varios archivos Excel de movimientos bancarios. Debes analizar SIEMPRE el contenido real de los archivos cargados usando la API de ChatGPT instalada en el sistema.

Tu objetivo es consolidar todos los movimientos encontrados en un único resultado normalizado, para luego generar un Excel final con el mismo formato del archivo:
“movimientos_consolidados_ordenados_por_operacion.xlsx”.

IMPORTANTE:
Devuelve únicamente un JSON válido.
No devuelvas explicaciones.
No devuelvas markdown.
No inventes datos.
Si un campo no existe, devuélvelo como null.

Estructura conocida de los archivos:
Los archivos suelen tener una hoja llamada “AccountDetail”.

En la parte superior del archivo se encuentran datos de cabecera:
- Cuenta
- Moneda
- Tipo de cuenta

También puede existir una sección de saldos:
- Saldo líquido (A)
- Saldo no disponible (B)
- Saldo contable (A+B)
- Cheques en trámite
- Consultas en trámite

Luego existe una tabla de movimientos. La fila de encabezados puede tener una de estas estructuras:

Estructura 1:
- Fecha
- Fecha valuta
- Descripción operación
- Monto
- Sucursal - agencia
- Nº operación
- Usuario

Estructura 2:
- Fecha
- PROVEEDOR
- ITEM DEL SISTEMA
- Descripción operación
- Monto
- Sucursal - agencia
- Nº operación
- Usuario

Reglas de análisis:
1. Buscar automáticamente la hoja que contiene los movimientos. Normalmente será “AccountDetail”.
2. Detectar la cuenta desde la fila donde la primera columna dice “Cuenta”.
3. Separar la cuenta bancaria y la empresa cuando el valor tenga el formato:
   “193-2390016-0-74 - CJ TELECOM SAC”.
   En ese caso:
   - Cuenta = “193-2390016-0-74”
   - Empresa = “CJ TELECOM SAC”
4. Detectar la moneda desde la fila donde la primera columna dice “Moneda”.
5. Detectar el tipo de cuenta desde la fila donde la primera columna dice “Tipo de cuenta”.
6. Detectar los saldos desde la sección donde aparecen los encabezados de saldos.
7. Detectar automáticamente la fila de encabezados de movimientos buscando la columna “Fecha”.
8. No asumir una posición fija de columnas. Usar siempre el nombre del encabezado.
9. Si el archivo tiene columna “PROVEEDOR”, mapearla como proveedor.
10. Si el archivo tiene columna “ITEM DEL SISTEMA”, mapearla como itemSistema.
11. Si el archivo no tiene “PROVEEDOR” ni “ITEM DEL SISTEMA”, devolver esos campos como null.
12. Si existe la columna “Fecha valuta”, mapearla como fechaValuta.
13. Si no existe “Fecha valuta”, devolver fechaValuta como null.
14. Mantener todos los movimientos de todos los archivos.
15. Ignorar filas vacías, títulos, subtítulos, totales, saldos y cualquier fila que no corresponda a un movimiento bancario.
16. Una fila es movimiento válido si tiene fecha válida, descripción de operación y monto numérico.
17. Convertir fechas al formato yyyy-MM-dd.
18. Convertir montos y saldos a número decimal.
19. Mantener egresos como montos negativos.
20. Mantener ingresos como montos positivos.
21. No cambiar la descripción original de la operación.
22. No cambiar el número de operación.
23. No completar proveedor ni itemSistema por deducción.
24. Agregar el nombre del archivo origen en cada movimiento.
25. El valor de archivoOrigen debe ser el nombre exacto del archivo de entrada, no la hoja del Excel.
26. Ordenar los movimientos por:
    - Fecha descendente
    - Empresa ascendente
    - Moneda ascendente
    - Nº operación ascendente

Columnas finales requeridas para el Excel:
- Empresa
- Cuenta
- Moneda
- Fecha
- Fecha valuta
- Proveedor
- Item del sistema
- Descripción operación
- Monto
- Sucursal - agencia
- Nº operación
- Usuario

Devuelve el resultado con esta estructura JSON exacta:

{
  "archivosProcesados": 0,
  "totalMovimientos": 0,
  "resumenArchivos": [
    {
      "archivoOrigen": "",
      "empresa": "",
      "cuenta": "",
      "moneda": "",
      "tipoCuenta": "",
      "saldoLiquido": 0,
      "saldoNoDisponible": 0,
      "saldoContable": 0,
      "totalMovimientos": 0,
      "totalIngresos": 0,
      "totalEgresos": 0,
      "neto": 0
    }
  ],
  "movimientos": [
    {
      "empresa": "",
      "cuenta": "",
      "moneda": "",
      "fecha": "",
      "fechaValuta": null,
      "proveedor": null,
      "itemSistema": null,
      "descripcionOperacion": "",
      "monto": 0,
      "sucursalAgencia": "",
      "numeroOperacion": "",
      "usuario": null,
      "archivoOrigen": ""
    }
  ],
  "validaciones": {
    "insertable": true,
    "totalArchivosConError": 0,
    "archivosConError": [],
    "duplicadosDetectados": [],
    "observaciones": []
  }
}

Validaciones obligatorias:
1. totalMovimientos debe ser igual a la cantidad de elementos del arreglo movimientos.
2. archivosProcesados debe ser igual a la cantidad de archivos analizados correctamente.
3. En resumenArchivos, totalMovimientos debe coincidir con los movimientos del archivoOrigen.
4. totalIngresos debe sumar solo montos mayores a 0.
5. totalEgresos debe sumar solo montos menores a 0.
6. neto debe ser totalIngresos + totalEgresos.
7. Detectar posibles duplicados usando:
   empresa + cuenta + fecha + numeroOperacion + descripcionOperacion + monto.
8. Si existen duplicados, agregarlos en duplicadosDetectados.
9. Si un archivo no tiene movimientos válidos, agregarlo a archivosConError.
10. Si existe algún error crítico, insertable debe ser false.

El JSON devuelto será usado por el backend para:
1. Mostrar la vista previa del análisis.
2. Activar el botón “Exportar análisis”.
3. Generar un Excel con las hojas:
   - Resumen
   - Movimientos Ordenados

No debes programar la lectura pensando que siempre están las mismas columnas. El análisis debe detectar la fila de encabezados y mapear columnas por nombre, porque algunos archivos tienen “Proveedor” e “Item del sistema”, y otros no.
""";
    }

    private static string BuildExportPrompt()
    {
        return """
Genera el archivo Excel final usando el JSON normalizado del análisis.

El Excel debe llamarse:
movimientos_consolidados_ordenados_por_operacion.xlsx

Debe contener dos hojas:

1. Resumen
Debe mostrar:
- Archivos procesados
- Total de movimientos
- Total de ingresos
- Total de egresos
- Neto
- Cantidad de duplicados detectados
- Estado insertable

También debe incluir un resumen por archivo con:
Archivo origen, Empresa, Cuenta, Moneda, Tipo de cuenta, Total movimientos, Total ingresos, Total egresos y Neto.

2. Movimientos Ordenados
Debe contener exactamente estas columnas y en este orden:
Empresa
Cuenta
Moneda
Fecha
Fecha valuta
Proveedor
Item del sistema
Descripción operación
Monto
Sucursal - agencia
Nº operación
Usuario

Reglas de formato:
1. Encabezados en negrita.
2. Aplicar autofiltro.
3. Congelar la primera fila.
4. Formato de fecha dd/MM/yyyy.
5. Formato numérico para Monto con dos decimales.
6. Ajustar ancho de columnas.
7. Ordenar la hoja por Fecha descendente, Empresa, Moneda y Nº operación.
8. No incluir columnas técnicas como archivoOrigen, validaciones o claves internas en la hoja Movimientos Ordenados, salvo que el usuario lo solicite.

Devuelve únicamente JSON válido con esta estructura:
{
  "nombreArchivo": "movimientos_consolidados_ordenados_por_operacion.xlsx",
  "archivosProcesados": 0,
  "totalMovimientos": 0,
  "totalIngresos": 0,
  "totalEgresos": 0,
  "neto": 0,
  "cantidadDuplicadosDetectados": 0,
  "insertable": true,
  "resumenArchivos": [
    {
      "archivoOrigen": "",
      "empresa": "",
      "cuenta": "",
      "moneda": "",
      "tipoCuenta": "",
      "saldoLiquido": 0,
      "saldoNoDisponible": 0,
      "saldoContable": 0,
      "totalMovimientos": 0,
      "totalIngresos": 0,
      "totalEgresos": 0,
      "neto": 0
    }
  ],
  "movimientos": [
    {
      "empresa": "",
      "cuenta": "",
      "moneda": "",
      "fecha": "",
      "fechaValuta": null,
      "proveedor": null,
      "itemSistema": null,
      "descripcionOperacion": "",
      "monto": 0,
      "sucursalAgencia": "",
      "numeroOperacion": "",
      "usuario": null,
      "archivoOrigen": ""
    }
  ]
}
""";
    }

    private static object BuildBcpAnalysisInstructions()
    {
        return new
        {
            contexto = new
            {
                objetivo = "Analizar archivos Excel de movimientos bancarios BCP para consolidarlos y mapearlos hacia dbo.MovimientosBcp.",
                tecnologia = new[]
                {
                    "Frontend: React + Vite + TypeScript",
                    "Backend: .NET 8 C#",
                    "Base de datos: SQL Server",
                    "Libreria de lectura Excel: ClosedXML"
                },
                tablaDestino = new
                {
                    nombre = "dbo.MovimientosBcp",
                    columnas = new[]
                    {
                        "Empresa",
                        "Cuenta",
                        "Moneda",
                        "Fecha",
                        "FechaValuta",
                        "Proveedor",
                        "ItemSistema",
                        "DescripcionOperacion",
                        "Monto",
                        "SucursalAgencia",
                        "NroOperacion",
                        "Usuario",
                        "ArchivoOrigen",
                        "FechaImportacion",
                        "UsuarioImportacion",
                        "IdActivo",
                        "EsNroOperacionValido",
                        "TipoMovimientoBanco",
                        "EstadoConciliacion"
                    }
                }
            },
            reglasLecturaExcel = new[]
            {
                "Leer la primera hoja de cada archivo, salvo que exista una hoja llamada Movimientos Ordenados; si existe, usar esa hoja.",
                "Detectar encabezados aunque tengan variaciones ortograficas o acentos.",
                "Ignorar filas vacias.",
                "Limpiar espacios al inicio y al final de todos los textos.",
                "Convertir Fecha y FechaValuta a tipo DATE.",
                "Convertir Monto a DECIMAL(18,2), considerando montos negativos.",
                "Mantener NroOperacion como texto para no perder ceros a la izquierda.",
                "Los NroOperacion vacios, NULL, 0, 0000000 o similares deben considerarse no validos."
            },
            equivalenciasEncabezados = new[]
            {
                new { destino = "NroOperacion", variantes = new[] { "Nº operacion", "Nro operacion", "N° operacion", "Numero Operacion" } },
                new { destino = "DescripcionOperacion", variantes = new[] { "Descripcion operacion", "Descripcion Operacion", "Descripción operación" } },
                new { destino = "FechaValuta", variantes = new[] { "Fecha valuta", "Fecha Valuta" } },
                new { destino = "SucursalAgencia", variantes = new[] { "Sucursal - agencia", "SucursalAgencia", "Sucursal Agencia" } },
                new { destino = "ItemSistema", variantes = new[] { "Item del sistema", "ItemSistema" } }
            },
            reglasCamposCalculados = new object[]
            {
                new
                {
                    campo = "EsNroOperacionValido",
                    regla = "1 si NroOperacion tiene un valor numerico mayor a cero, 0 si esta vacio, NULL, 0, 0000000 o no es numerico."
                },
                new
                {
                    campo = "TipoMovimientoBanco",
                    reglas = new[]
                    {
                        "Si DescripcionOperacion contiene ITF, guardar IMPUESTO ITF.",
                        "Si contiene COMISION, guardar COMISION BANCARIA.",
                        "Si contiene MANTENIMIENTO, guardar CARGO BANCARIO.",
                        "Si contiene TRANSFER, guardar TRANSFERENCIA.",
                        "Si contiene ABONO, guardar ABONO.",
                        "Si contiene CARGO, guardar CARGO.",
                        "Caso contrario, guardar MOVIMIENTO OPERATIVO."
                    }
                },
                new
                {
                    campo = "EstadoConciliacion",
                    reglas = new[]
                    {
                        "Si EsNroOperacionValido = 1, guardar PENDIENTE CONCILIACION.",
                        "Si EsNroOperacionValido = 0 y DescripcionOperacion contiene ITF, guardar NO CONCILIABLE - ITF.",
                        "Si EsNroOperacionValido = 0 y no es ITF, guardar PENDIENTE VALIDACION SIN NRO OPERACION."
                    }
                }
            },
            validacionDuplicados = new
            {
                clave = new[] { "Cuenta", "Fecha", "NroOperacion", "Monto", "DescripcionOperacion" },
                regla = "Si ya existe un registro activo con la misma combinacion, no insertar nuevamente y marcarlo como duplicado."
            },
            salidaEsperada = new
            {
                debesRetornar = new[]
                {
                    "nombreArchivo",
                    "nombreHoja",
                    "numeroHoja",
                    "filaCabecera",
                    "filaDatos",
                    "requiereRevision",
                    "observacion",
                    "advertencias",
                    "mapeos",
                    "filasNormalizadas"
                },
                notas = new[]
                {
                    "Si la estructura es compatible, indica requiereRevision = false.",
                    "Si hay ambiguedad o faltan columnas criticas, marca requiereRevision = true.",
                    "Los mapeos deben usar solo columnas reales detectadas en el archivo.",
                    "filasNormalizadas debe devolver las filas listas para exportarse en la estructura Movimientos ordenados."
                }
            }
        };
    }

    private static List<Dictionary<string, object?>> BuildNormalizedRowsFromAnalysis(
        ConciliacionBcpArchivoMuestraDto archivo,
        IReadOnlyList<ConciliacionBcpMapeoColumnaDto> mapeos,
        int? filaCabecera,
        int? filaDatos,
        string? usuario)
    {
        var matrix = archivo.Filas
            .Where(row => row is not null)
            .Select(row => row.Select(cell => cell?.Trim() ?? string.Empty).ToList())
            .ToList();

        if (matrix.Count == 0)
        {
            return [];
        }

        var headerRowIndex = Math.Max((filaCabecera ?? 1) - 1, 0);
        if (headerRowIndex >= matrix.Count)
        {
            return [];
        }

        var dataStartIndex = Math.Max((filaDatos ?? (headerRowIndex + 2)) - 1, headerRowIndex + 1);
        var headerRow = matrix[headerRowIndex];
        var sourceIndexes = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);

        for (var index = 0; index < headerRow.Count; index++)
        {
            var normalized = NormalizeKey(headerRow[index]);
            if (!string.IsNullOrWhiteSpace(normalized) && !sourceIndexes.ContainsKey(normalized))
            {
                sourceIndexes[normalized] = index;
            }
        }

        var contextValues = BuildContextValues(matrix, headerRowIndex);
        var rows = new List<Dictionary<string, object?>>();

        for (var rowIndex = dataStartIndex; rowIndex < matrix.Count; rowIndex++)
        {
            var sourceRow = matrix[rowIndex];
            if (IsEmptyRow(sourceRow))
            {
                continue;
            }

            var normalizedRow = CreateEmptyOrderedMovementRow();

            foreach (var mapeo in mapeos)
            {
                if (string.IsNullOrWhiteSpace(mapeo.ParametroDestino))
                {
                    continue;
                }

                var sourceKey = NormalizeKey(mapeo.ColumnaOrigen);
                if (!sourceIndexes.TryGetValue(sourceKey, out var sourceIndex))
                {
                    continue;
                }

                var rawValue = sourceIndex < sourceRow.Count ? sourceRow[sourceIndex] : string.Empty;
                normalizedRow[mapeo.ParametroDestino] = NormalizeCellForTarget(mapeo.ParametroDestino, rawValue);
            }

            ApplyHeaderFallbackValues(normalizedRow, sourceRow, sourceIndexes);
            ApplyContextValues(normalizedRow, contextValues);

            normalizedRow["ArchivoOrigen"] = archivo.NombreArchivo;
            normalizedRow["UsuarioImportacion"] = string.IsNullOrWhiteSpace(usuario) ? null : usuario.Trim();
            normalizedRow["IdActivo"] = true;

            var descripcionOperacion = normalizedRow.TryGetValue("DescripcionOperacion", out var descripcionValue)
                ? descripcionValue?.ToString()
                : null;
            var nroOperacion = normalizedRow.TryGetValue("NroOperacion", out var nroValue)
                ? nroValue?.ToString()
                : null;

            var esNroOperacionValido = IsValidOperationNumber(nroOperacion);
            normalizedRow["EsNroOperacionValido"] = esNroOperacionValido;
            normalizedRow["TipoMovimientoBanco"] = ResolveTipoMovimientoBanco(descripcionOperacion);
            normalizedRow["EstadoConciliacion"] = ResolveEstadoConciliacion(esNroOperacionValido, descripcionOperacion);

            if (HasMeaningfulMovementData(normalizedRow))
            {
                rows.Add(normalizedRow);
            }
        }

        return rows
            .OrderBy(row => row.TryGetValue("NroOperacion", out var nro) ? NormalizeSortableText(nro?.ToString()) : "~~~~")
            .ThenBy(row => row.TryGetValue("Fecha", out var fecha) ? NormalizeSortableText(fecha?.ToString()) : "~~~~")
            .ToList();
    }

    private static List<Dictionary<string, object?>> BuildNormalizedRowsFromAiOutput(
        IReadOnlyList<Dictionary<string, object?>>? rows,
        string nombreArchivo,
        string? usuario)
    {
        if (rows is null || rows.Count == 0)
        {
            return [];
        }

        var normalizedRows = new List<Dictionary<string, object?>>();

        foreach (var sourceRow in rows)
        {
            if (sourceRow.Count == 0)
            {
                continue;
            }

            var normalizedRow = CreateEmptyOrderedMovementRow();

            foreach (var column in OrderedMovementColumns)
            {
                if (!TryGetValueIgnoreCase(sourceRow, column, out var rawValue))
                {
                    continue;
                }

                normalizedRow[column] = rawValue is null
                    ? null
                    : NormalizeCellForTarget(column, rawValue.ToString());
            }

            normalizedRow["ArchivoOrigen"] = nombreArchivo;
            normalizedRow["UsuarioImportacion"] = string.IsNullOrWhiteSpace(usuario) ? null : usuario.Trim();
            normalizedRow["IdActivo"] = true;

            var descripcionOperacion = normalizedRow.TryGetValue("DescripcionOperacion", out var descripcionValue)
                ? descripcionValue?.ToString()
                : null;
            var nroOperacion = normalizedRow.TryGetValue("NroOperacion", out var nroValue)
                ? nroValue?.ToString()
                : null;

            var esNroOperacionValido = IsValidOperationNumber(nroOperacion);
            normalizedRow["EsNroOperacionValido"] = esNroOperacionValido;
            normalizedRow["TipoMovimientoBanco"] = ResolveTipoMovimientoBanco(descripcionOperacion);
            normalizedRow["EstadoConciliacion"] = ResolveEstadoConciliacion(esNroOperacionValido, descripcionOperacion);

            if (HasMeaningfulMovementData(normalizedRow))
            {
                normalizedRows.Add(normalizedRow);
            }
        }

        return normalizedRows
            .OrderBy(row => row.TryGetValue("NroOperacion", out var nro) ? NormalizeSortableText(nro?.ToString()) : "~~~~")
            .ThenBy(row => row.TryGetValue("Fecha", out var fecha) ? NormalizeSortableText(fecha?.ToString()) : "~~~~")
            .ToList();
    }

    private static Dictionary<string, object?> CreateEmptyOrderedMovementRow()
    {
        var row = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);

        foreach (var column in OrderedMovementColumns)
        {
            row[column] = null;
        }

        return row;
    }

    private static Dictionary<string, string> BuildContextValues(IReadOnlyList<List<string>> matrix, int headerRowIndex)
    {
        var result = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

        for (var rowIndex = 0; rowIndex < headerRowIndex; rowIndex++)
        {
            var row = matrix[rowIndex];
            if (row.Count == 0)
            {
                continue;
            }

            var firstCell = NormalizeText(row[0]);
            if (string.IsNullOrWhiteSpace(firstCell))
            {
                continue;
            }

            var label = NormalizeKey(firstCell);
            var value = row.Skip(1)
                .Select(NormalizeText)
                .FirstOrDefault(item => !string.IsNullOrWhiteSpace(item));

            if (string.IsNullOrWhiteSpace(value))
            {
                continue;
            }

            if (!result.ContainsKey("Cuenta") && MatchesAlias("Cuenta", label))
            {
                var accountParts = value.Split(" - ", 2, StringSplitOptions.TrimEntries);
                result["Cuenta"] = accountParts[0];

                if (accountParts.Length > 1 && !result.ContainsKey("Empresa"))
                {
                    result["Empresa"] = accountParts[1];
                }
            }

            if (!result.ContainsKey("Moneda") && MatchesAlias("Moneda", label))
            {
                result["Moneda"] = value;
            }

            if (!result.ContainsKey("Empresa") && MatchesAlias("Empresa", label))
            {
                result["Empresa"] = value;
            }
        }

        return result;
    }

    private static void ApplyHeaderFallbackValues(
        Dictionary<string, object?> normalizedRow,
        IReadOnlyList<string?> sourceRow,
        IReadOnlyDictionary<string, int> sourceIndexes)
    {
        FillValueIfMissing(normalizedRow, "Fecha", sourceRow, sourceIndexes);
        FillValueIfMissing(normalizedRow, "FechaValuta", sourceRow, sourceIndexes);
        FillValueIfMissing(normalizedRow, "DescripcionOperacion", sourceRow, sourceIndexes);
        FillValueIfMissing(normalizedRow, "NroOperacion", sourceRow, sourceIndexes);
        FillValueIfMissing(normalizedRow, "SucursalAgencia", sourceRow, sourceIndexes);
        FillValueIfMissing(normalizedRow, "Usuario", sourceRow, sourceIndexes);
        FillValueIfMissing(normalizedRow, "Proveedor", sourceRow, sourceIndexes);

        if (!HasValue(normalizedRow, "Monto"))
        {
            var monto = TryResolveAmount(sourceRow, sourceIndexes);
            if (monto is not null)
            {
                normalizedRow["Monto"] = monto;
            }
        }
    }

    private static void ApplyContextValues(
        Dictionary<string, object?> normalizedRow,
        IReadOnlyDictionary<string, string> contextValues)
    {
        foreach (var field in new[] { "Cuenta", "Moneda", "Empresa" })
        {
            if (!HasValue(normalizedRow, field) && contextValues.TryGetValue(field, out var value))
            {
                normalizedRow[field] = value;
            }
        }
    }

    private static void FillValueIfMissing(
        Dictionary<string, object?> normalizedRow,
        string targetField,
        IReadOnlyList<string?> sourceRow,
        IReadOnlyDictionary<string, int> sourceIndexes)
    {
        if (HasValue(normalizedRow, targetField))
        {
            return;
        }

        var sourceIndex = FindSourceIndex(sourceIndexes, targetField);
        if (!sourceIndex.HasValue || sourceIndex.Value >= sourceRow.Count)
        {
            return;
        }

        var value = NormalizeCellForTarget(targetField, sourceRow[sourceIndex.Value]);
        if (value is not null)
        {
            normalizedRow[targetField] = value;
        }
    }

    private static object? TryResolveAmount(
        IReadOnlyList<string?> sourceRow,
        IReadOnlyDictionary<string, int> sourceIndexes)
    {
        var debit = TryReadDecimal(sourceRow, sourceIndexes, ["debit", "withdrawal", "cargo"]);
        var credit = TryReadDecimal(sourceRow, sourceIndexes, ["credit", "deposit", "abono"]);

        if (debit.HasValue && debit.Value != 0)
        {
            return debit.Value * -1;
        }

        if (credit.HasValue && credit.Value != 0)
        {
            return credit.Value;
        }

        return null;
    }

    private static decimal? TryReadDecimal(
        IReadOnlyList<string?> sourceRow,
        IReadOnlyDictionary<string, int> sourceIndexes,
        IEnumerable<string> aliases)
    {
        var sourceIndex = FindSourceIndex(sourceIndexes, aliases);
        if (!sourceIndex.HasValue || sourceIndex.Value >= sourceRow.Count)
        {
            return null;
        }

        var rawValue = NormalizeText(sourceRow[sourceIndex.Value]);
        return rawValue is null ? null : TryParseDecimalValue(rawValue);
    }

    private static int? FindSourceIndex(
        IReadOnlyDictionary<string, int> sourceIndexes,
        string targetField)
    {
        return HeaderAliases.TryGetValue(targetField, out var aliases)
            ? FindSourceIndex(sourceIndexes, aliases)
            : null;
    }

    private static int? FindSourceIndex(
        IReadOnlyDictionary<string, int> sourceIndexes,
        IEnumerable<string> aliases)
    {
        foreach (var alias in aliases)
        {
            var normalizedAlias = NormalizeKey(alias);

            foreach (var pair in sourceIndexes)
            {
                if (pair.Key == normalizedAlias ||
                    pair.Key.Contains(normalizedAlias, StringComparison.OrdinalIgnoreCase) ||
                    normalizedAlias.Contains(pair.Key, StringComparison.OrdinalIgnoreCase))
                {
                    return pair.Value;
                }
            }
        }

        return null;
    }

    private static bool MatchesAlias(string targetField, string normalizedValue)
    {
        return HeaderAliases.TryGetValue(targetField, out var aliases) &&
               aliases.Any(alias =>
               {
                   var normalizedAlias = NormalizeKey(alias);
                   return normalizedValue == normalizedAlias ||
                          normalizedValue.Contains(normalizedAlias, StringComparison.OrdinalIgnoreCase) ||
                          normalizedAlias.Contains(normalizedValue, StringComparison.OrdinalIgnoreCase);
               });
    }

    private static bool HasValue(IReadOnlyDictionary<string, object?> row, string field)
    {
        return row.TryGetValue(field, out var value) && !string.IsNullOrWhiteSpace(value?.ToString());
    }

    private static bool TryGetValueIgnoreCase(
        IReadOnlyDictionary<string, object?> row,
        string field,
        out object? value)
    {
        if (row.TryGetValue(field, out value))
        {
            return true;
        }

        foreach (var pair in row)
        {
            if (string.Equals(pair.Key, field, StringComparison.OrdinalIgnoreCase))
            {
                value = pair.Value;
                return true;
            }
        }

        value = null;
        return false;
    }

    private static bool IsEmptyRow(IReadOnlyList<string?> row)
    {
        return row.All(cell => string.IsNullOrWhiteSpace(cell));
    }

    private static bool HasMeaningfulMovementData(IReadOnlyDictionary<string, object?> row)
    {
        return OrderedMovementColumns
            .Where(column => column is not ("ArchivoOrigen" or "UsuarioImportacion" or "IdActivo" or "EsNroOperacionValido" or "TipoMovimientoBanco" or "EstadoConciliacion"))
            .Any(column =>
            {
                if (!row.TryGetValue(column, out var value))
                {
                    return false;
                }

                return !string.IsNullOrWhiteSpace(value?.ToString());
            });
    }

    private static object? NormalizeCellForTarget(string targetField, string? rawValue)
    {
        var value = NormalizeText(rawValue);
        if (value is null)
        {
            return null;
        }

        return targetField switch
        {
            "Fecha" or "FechaValuta" => TryParseDateValue(value)?.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) ?? value,
            "Monto" => TryParseDecimalValue(value) is decimal decimalValue ? decimalValue : value,
            "NroOperacion" => NormalizeOperationNumber(value),
            _ => value
        };
    }

    private static string NormalizeOperationNumber(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return string.Empty;
        }

        var trimmed = value.Trim();
        if (trimmed.EndsWith(".00", StringComparison.Ordinal))
        {
            return trimmed[..^3];
        }

        if (trimmed.EndsWith(".0", StringComparison.Ordinal))
        {
            return trimmed[..^2];
        }

        return trimmed;
    }

    private static bool IsValidOperationNumber(string? nroOperacion)
    {
        var value = NormalizeOperationNumber(nroOperacion);
        if (string.IsNullOrWhiteSpace(value))
        {
            return false;
        }

        if (!value.All(char.IsDigit))
        {
            return false;
        }

        return value.Trim('0').Length > 0;
    }

    private static string ResolveTipoMovimientoBanco(string? descripcionOperacion)
    {
        var description = NormalizeKey(descripcionOperacion);

        if (description.Contains("itf", StringComparison.OrdinalIgnoreCase))
        {
            return "IMPUESTO ITF";
        }

        if (description.Contains("comision", StringComparison.OrdinalIgnoreCase))
        {
            return "COMISION BANCARIA";
        }

        if (description.Contains("mantenimiento", StringComparison.OrdinalIgnoreCase))
        {
            return "CARGO BANCARIO";
        }

        if (description.Contains("transfer", StringComparison.OrdinalIgnoreCase))
        {
            return "TRANSFERENCIA";
        }

        if (description.Contains("abono", StringComparison.OrdinalIgnoreCase))
        {
            return "ABONO";
        }

        if (description.Contains("cargo", StringComparison.OrdinalIgnoreCase))
        {
            return "CARGO";
        }

        return "MOVIMIENTO OPERATIVO";
    }

    private static string ResolveEstadoConciliacion(bool esNroOperacionValido, string? descripcionOperacion)
    {
        if (esNroOperacionValido)
        {
            return "PENDIENTE CONCILIACION";
        }

        return NormalizeKey(descripcionOperacion).Contains("itf", StringComparison.OrdinalIgnoreCase)
            ? "NO CONCILIABLE - ITF"
            : "PENDIENTE VALIDACION SIN NRO OPERACION";
    }

    private static string NormalizeSortableText(string? value)
    {
        return string.IsNullOrWhiteSpace(value) ? "~~~~" : value.Trim();
    }

    private static ConciliacionBcpAnalizarArchivoResponseDto BuildFallbackAnalysis(
        ConciliacionBcpArchivoMuestraDto archivo,
        IReadOnlyList<StoredProcedureParameterInfo> parametrosProcedimiento)
    {
        var normalizedHeaders = archivo.Encabezados
            .Where(header => !string.IsNullOrWhiteSpace(header))
            .Select(header => new HeaderInfo(header.Trim(), NormalizeKey(header)))
            .ToList();

        var mapeos = BuildBcpFallbackMappings(normalizedHeaders);
        var procParams = parametrosProcedimiento
            .Where(parametro => !parametro.EsSalida)
            .ToList();

        var criticalTargets = new[] { "Cuenta", "Fecha", "Monto", "DescripcionOperacion", "NroOperacion" };
        var mappedTargets = mapeos
            .Select(item => item.ParametroDestino)
            .Where(item => !string.IsNullOrWhiteSpace(item))
            .Select(item => item!)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
        var missingCriticalTargets = criticalTargets.Where(target => !mappedTargets.Contains(target)).ToList();
        var hojaConsolidadaDetectada = string.Equals(
            NormalizeKey(archivo.NombreHoja),
            NormalizeKey("Movimientos Ordenados"),
            StringComparison.OrdinalIgnoreCase);

        return new ConciliacionBcpAnalizarArchivoResponseDto
        {
            NombreArchivo = archivo.NombreArchivo,
            NombreHoja = archivo.NombreHoja,
            NumeroHoja = archivo.NumeroHoja,
            TotalFilas = archivo.TotalFilas,
            FilaCabecera = archivo.Encabezados.Count > 0 ? 1 : null,
            FilaDatos = archivo.Encabezados.Count > 0 ? 2 : null,
            RequiereRevision = mapeos.Count == 0 || missingCriticalTargets.Count > 0,
            Advertencias =
            [
                hojaConsolidadaDetectada
                    ? "Se detecto la hoja Movimientos Ordenados y se aplico analisis heuristico BCP sin OpenAI."
                    : "Analisis heuristico BCP generado sin OpenAI.",
                missingCriticalTargets.Count > 0
                    ? $"Faltan columnas criticas: {string.Join(", ", missingCriticalTargets)}."
                    : "Se identificaron las columnas criticas principales."
            ],
            Mapeos = mapeos.Count > 0 ? mapeos : BuildFallbackFromStoredProcedureParams(normalizedHeaders, procParams)
        };
    }

    private static List<ConciliacionBcpMapeoColumnaDto> BuildBcpFallbackMappings(
        IReadOnlyList<HeaderInfo> normalizedHeaders)
    {
        var aliases = new Dictionary<string, string[]>(StringComparer.OrdinalIgnoreCase)
        {
            ["Empresa"] = ["empresa"],
            ["Cuenta"] = ["cuenta"],
            ["Moneda"] = ["moneda"],
            ["Fecha"] = ["fecha"],
            ["FechaValuta"] = ["fechavaluta", "fecha valuta", "fecha valua", "fecha valuta "],
            ["Proveedor"] = ["proveedor"],
            ["ItemSistema"] = ["itemsistema", "item del sistema", "item sistema"],
            ["DescripcionOperacion"] = ["descripcionoperacion", "descripcion operacion", "descripción operación", "descripcion operación", "detalle operacion"],
            ["Monto"] = ["monto"],
            ["SucursalAgencia"] = ["sucursalagencia", "sucursal agencia", "sucursal - agencia"],
            ["NroOperacion"] = ["nrooperacion", "nro operacion", "n° operacion", "nº operacion", "numero operacion"],
            ["Usuario"] = ["usuario"]
        };

        var result = new List<ConciliacionBcpMapeoColumnaDto>();

        foreach (var header in normalizedHeaders)
        {
            var match = aliases.FirstOrDefault(pair =>
                pair.Value.Any(alias => NormalizeKey(alias) == header.Normalized || header.Normalized.Contains(NormalizeKey(alias), StringComparison.OrdinalIgnoreCase)));

            if (string.IsNullOrWhiteSpace(match.Key))
            {
                continue;
            }

            result.Add(new ConciliacionBcpMapeoColumnaDto
            {
                ColumnaOrigen = header.Header,
                ParametroDestino = match.Key,
                Confianza = 0.95m,
                Comentario = "Coincidencia heuristica BCP por encabezado normalizado."
            });
        }

        return result;
    }

    private static List<ConciliacionBcpMapeoColumnaDto> BuildFallbackFromStoredProcedureParams(
        IReadOnlyList<HeaderInfo> normalizedHeaders,
        IReadOnlyList<StoredProcedureParameterInfo> procParams)
    {
        var procMatches = new List<ConciliacionBcpMapeoColumnaDto>();

        foreach (var header in normalizedHeaders)
        {
            var match = procParams.FirstOrDefault(parametro =>
                string.Equals(NormalizeKey(parametro.Nombre), header.Normalized, StringComparison.OrdinalIgnoreCase));

            if (match is null)
            {
                continue;
            }

            procMatches.Add(new ConciliacionBcpMapeoColumnaDto
            {
                ColumnaOrigen = header.Header,
                ParametroDestino = TrimAt(match.Nombre),
                Confianza = 0.85m,
                Comentario = "Coincidencia heuristica por nombre normalizado del stored procedure."
            });
        }

        return procMatches;
    }

    private async Task<List<StoredProcedureParameterInfo>> LoadStoredProcedureParametersAsync(
        SqlConnection connection,
        CancellationToken cancellationToken)
    {
        const string sql = @"
SELECT
    p.name AS Name,
    t.name AS TypeName,
    p.max_length AS MaxLength,
    p.is_output AS IsOutput,
    p.has_default_value AS HasDefaultValue
FROM sys.parameters p
INNER JOIN sys.types t ON t.user_type_id = p.user_type_id
WHERE p.object_id = OBJECT_ID(@StoredProcedureName)
ORDER BY p.parameter_id;";

        var rows = await connection.QueryAsync<StoredProcedureParameterInfo>(
            _sqlCommandFactory.Create(
                sql,
                new { StoredProcedureName = StoredProcedureInsert },
                CommandType.Text,
                cancellationToken));

        return rows.ToList();
    }

    private static List<ConciliacionBcpMapeoColumnaDto> NormalizeMappings(
        IEnumerable<ConciliacionBcpMapeoColumnaDto>? mappings,
        IReadOnlyList<StoredProcedureParameterInfo> parametrosProcedimiento)
    {
        if (mappings is null)
        {
            return [];
        }

        var procParams = parametrosProcedimiento
            .Where(item => !item.EsSalida)
            .Select(item => TrimAt(item.Nombre))
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
        var validTargets = OrderedMovementColumns
            .Concat(procParams)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        return mappings
            .Where(item => !string.IsNullOrWhiteSpace(item.ColumnaOrigen))
            .Select(item =>
            {
                var normalizedTarget = string.IsNullOrWhiteSpace(item.ParametroDestino)
                    ? null
                    : TrimAt(item.ParametroDestino);

                return new ConciliacionBcpMapeoColumnaDto
                {
                    ColumnaOrigen = item.ColumnaOrigen.Trim(),
                    ParametroDestino = normalizedTarget is not null && validTargets.Contains(normalizedTarget)
                        ? normalizedTarget
                        : null,
                    Confianza = ClampConfidence(item.Confianza),
                    Transformacion = NormalizeText(item.Transformacion),
                    Comentario = NormalizeText(item.Comentario)
                };
            })
            .Where(item => item.ParametroDestino is not null)
            .ToList();
    }

    private static List<ConciliacionBcpMapeoColumnaDto> MergeMappings(
        IReadOnlyList<ConciliacionBcpMapeoColumnaDto> preferredMappings,
        IReadOnlyList<ConciliacionBcpMapeoColumnaDto> fallbackMappings)
    {
        var result = new List<ConciliacionBcpMapeoColumnaDto>();
        var usedSourceColumns = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var usedTargets = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        void AddMappings(IEnumerable<ConciliacionBcpMapeoColumnaDto> mappings)
        {
            foreach (var mapping in mappings)
            {
                if (string.IsNullOrWhiteSpace(mapping.ColumnaOrigen) || string.IsNullOrWhiteSpace(mapping.ParametroDestino))
                {
                    continue;
                }

                if (!usedSourceColumns.Add(mapping.ColumnaOrigen) || !usedTargets.Add(mapping.ParametroDestino))
                {
                    continue;
                }

                result.Add(mapping);
            }
        }

        AddMappings(preferredMappings);
        AddMappings(fallbackMappings);

        return result;
    }

    private static ConciliacionBcpAnalisisAiResponseDto? ParseAiAnalysisResponse(string analysisJson, string nombreArchivo)
    {
        var candidate = ExtractJsonCandidate(analysisJson) ?? analysisJson;

        try
        {
            var parsedResponse = JsonSerializer.Deserialize<ConciliacionBcpAnalisisAiResponseDto>(candidate, JsonOptions);
            if (parsedResponse?.Archivos?.Count > 0)
            {
                return parsedResponse;
            }
        }
        catch (JsonException)
        {
            // El modelo a veces devuelve un objeto unico en vez de la coleccion "archivos".
        }

        try
        {
            var parsedFile = JsonSerializer.Deserialize<ConciliacionBcpAnalizarArchivoAiResponseDto>(candidate, JsonOptions);
            if (LooksLikeUsefulAiFile(parsedFile))
            {
                return new ConciliacionBcpAnalisisAiResponseDto
                {
                    Archivos = [EnsureAiFileDefaults(parsedFile!, nombreArchivo)]
                };
            }
        }
        catch (JsonException)
        {
            // Seguimos con variantes envueltas en otras propiedades.
        }

        try
        {
            using var document = JsonDocument.Parse(candidate);
            var root = document.RootElement;

            if (root.ValueKind != JsonValueKind.Object)
            {
                return null;
            }

            if (TryReadAiFileFromProperty(root, "archivo", out var nestedFile) ||
                TryReadAiFileFromProperty(root, "resultado", out nestedFile) ||
                TryReadAiFileFromProperty(root, "analisis", out nestedFile))
            {
                return new ConciliacionBcpAnalisisAiResponseDto
                {
                    Archivos = [EnsureAiFileDefaults(nestedFile!, nombreArchivo)]
                };
            }

            var parsedRootAsFile = JsonSerializer.Deserialize<ConciliacionBcpAnalizarArchivoAiResponseDto>(root.GetRawText(), JsonOptions);
            if (LooksLikeUsefulAiFile(parsedRootAsFile))
            {
                return new ConciliacionBcpAnalisisAiResponseDto
                {
                    Archivos = [EnsureAiFileDefaults(parsedRootAsFile!, nombreArchivo)]
                };
            }
        }
        catch (JsonException)
        {
            return null;
        }

        return null;
    }

    private static bool TryReadAiFileFromProperty(
        JsonElement root,
        string propertyName,
        out ConciliacionBcpAnalizarArchivoAiResponseDto? archivo)
    {
        archivo = null;

        if (!root.TryGetProperty(propertyName, out var property) || property.ValueKind != JsonValueKind.Object)
        {
            return false;
        }

        archivo = JsonSerializer.Deserialize<ConciliacionBcpAnalizarArchivoAiResponseDto>(property.GetRawText(), JsonOptions);
        return LooksLikeUsefulAiFile(archivo);
    }

    private static bool LooksLikeUsefulAiFile(ConciliacionBcpAnalizarArchivoAiResponseDto? archivo)
    {
        if (archivo is null)
        {
            return false;
        }

        return !string.IsNullOrWhiteSpace(archivo.NombreArchivo) ||
               !string.IsNullOrWhiteSpace(archivo.NombreHoja) ||
               archivo.FilasNormalizadas is { Count: > 0 } ||
               archivo.Mapeos is { Count: > 0 } ||
               archivo.FilaCabecera.HasValue ||
               archivo.FilaDatos.HasValue;
    }

    private static ConciliacionBcpAnalizarArchivoAiResponseDto EnsureAiFileDefaults(
        ConciliacionBcpAnalizarArchivoAiResponseDto archivo,
        string nombreArchivo)
    {
        archivo.NombreArchivo = NormalizeText(archivo.NombreArchivo) ?? nombreArchivo;
        archivo.Advertencias ??= [];
        archivo.Mapeos ??= [];
        archivo.FilasNormalizadas ??= [];
        return archivo;
    }

    private static ConciliacionBcpParametroDto MapParameter(StoredProcedureParameterInfo parametro)
    {
        return new ConciliacionBcpParametroDto
        {
            Nombre = TrimAt(parametro.Nombre),
            Tipo = parametro.Tipo,
            EsSalida = parametro.EsSalida,
            TieneDefault = parametro.TieneDefault,
            EsObligatorio = !parametro.EsSalida && !parametro.TieneDefault
        };
    }

    private async Task<string> SendOpenAiRawFilesAnalysisAsync(
        IReadOnlyList<ConciliacionBcpArchivoMuestraDto> archivos,
        string prompt,
        CancellationToken cancellationToken)
    {
        var messageContent = new List<OpenAiResponsesContentItem>
        {
            new()
            {
                Type = "input_text",
                Text = prompt
            }
        };

        messageContent.AddRange(archivos.Select(archivo => new OpenAiResponsesContentItem
        {
            Type = "input_file",
            Filename = archivo.NombreArchivo,
            FileData = BuildDataUrl(archivo)
        }));

        var requestPayload = new OpenAiResponsesRequest
        {
            Model = _openAiSettings.Model.Trim(),
            Temperature = 0,
            Input =
            [
                new OpenAiResponsesInputItem
                {
                    Role = "user",
                    Content = messageContent
                }
            ]
        };

        using var httpRequest = new HttpRequestMessage(HttpMethod.Post, "https://api.openai.com/v1/responses");
        httpRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _openAiSettings.ApiKey.Trim());
        httpRequest.Content = new StringContent(
            JsonSerializer.Serialize(requestPayload, JsonOptions),
            Encoding.UTF8,
            "application/json");

        using var response = await _httpClient.SendAsync(httpRequest, cancellationToken);
        var payload = await response.Content.ReadAsStringAsync(cancellationToken);

        if (!response.IsSuccessStatusCode)
        {
            throw new InvalidOperationException($"OpenAI devolvio un error {(int)response.StatusCode}: {Truncate(payload, 500)}");
        }

        var content = ExtractResponsesOutputText(payload);

        if (string.IsNullOrWhiteSpace(content))
        {
            throw new InvalidOperationException("OpenAI no devolvio contenido util al analizar los archivos adjuntos.");
        }

        return content.Trim();
    }

    private async Task<string> SendOpenAiChatCompletionAsync(
        List<OpenAiChatMessage> messages,
        CancellationToken cancellationToken,
        bool responseFormatJson)
    {
        var requestPayload = new OpenAiChatCompletionRequest
        {
            Model = _openAiSettings.Model.Trim(),
            MaxCompletionTokens = _openAiSettings.MaxTokens > 0 ? _openAiSettings.MaxTokens : 1500,
            Temperature = 0,
            Messages = messages,
            ResponseFormat = responseFormatJson ? new OpenAiResponseFormat { Type = "json_object" } : null
        };

        using var httpRequest = new HttpRequestMessage(HttpMethod.Post, "https://api.openai.com/v1/chat/completions");
        httpRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _openAiSettings.ApiKey.Trim());
        httpRequest.Content = new StringContent(
            JsonSerializer.Serialize(requestPayload, JsonOptions),
            Encoding.UTF8,
            "application/json");

        using var response = await _httpClient.SendAsync(httpRequest, cancellationToken);
        var payload = await response.Content.ReadAsStringAsync(cancellationToken);

        if (!response.IsSuccessStatusCode)
        {
            throw new InvalidOperationException($"OpenAI devolvio un error {(int)response.StatusCode}: {Truncate(payload, 500)}");
        }

        var openAiResponse = JsonSerializer.Deserialize<OpenAiChatCompletionResponse>(payload, JsonOptions);
        var content = openAiResponse?.Choices.FirstOrDefault()?.Message?.Content;

        if (string.IsNullOrWhiteSpace(content))
        {
            throw new InvalidOperationException("OpenAI no devolvio contenido util.");
        }

        return content.Trim();
    }

    private static string BuildDataUrl(ConciliacionBcpArchivoMuestraDto archivo)
    {
        var mimeType = string.IsNullOrWhiteSpace(archivo.TipoContenido)
            ? "application/octet-stream"
            : archivo.TipoContenido.Trim();

        return $"data:{mimeType};base64,{archivo.ContenidoBase64}";
    }

    private static void TryAddAuditParameters(
        DynamicParameters parameters,
        IReadOnlyList<StoredProcedureParameterInfo> procParams,
        string? usuario)
    {
        if (string.IsNullOrWhiteSpace(usuario))
        {
            return;
        }

        AddIfExists(parameters, procParams, "Usuario", usuario);
        AddIfExists(parameters, procParams, "UsuarioAccion", usuario);
        AddIfExists(parameters, procParams, "IdUsuario", usuario);
    }

    private static void AddIfExists(
        DynamicParameters parameters,
        IReadOnlyList<StoredProcedureParameterInfo> procParams,
        string candidateName,
        object? value)
    {
        if (procParams.Any(parametro => string.Equals(TrimAt(parametro.Nombre), candidateName, StringComparison.OrdinalIgnoreCase)))
        {
            parameters.Add(candidateName, value);
        }
    }

    private static bool CanUseJsonPayload(IReadOnlyList<StoredProcedureParameterInfo> parametrosProcedimiento)
    {
        var parametrosActivos = parametrosProcedimiento.Where(item => !item.EsSalida).ToList();
        if (parametrosActivos.Count != 1)
        {
            return false;
        }

        var nombre = NormalizeKey(parametrosActivos[0].Nombre);
        var tipo = parametrosActivos[0].Tipo;

        return nombre.Contains("json", StringComparison.OrdinalIgnoreCase) ||
               nombre.Contains("datos", StringComparison.OrdinalIgnoreCase) ||
               (tipo.Contains("char", StringComparison.OrdinalIgnoreCase) && nombre.Contains("mov", StringComparison.OrdinalIgnoreCase));
    }

    private static object? NormalizeParameterValue(object? rawValue, string sqlType)
    {
        if (rawValue is null || rawValue == DBNull.Value)
        {
            return null;
        }

        if (rawValue is JsonElement jsonElement)
        {
            rawValue = jsonElement.ValueKind switch
            {
                JsonValueKind.String => jsonElement.GetString(),
                JsonValueKind.Number when jsonElement.TryGetDecimal(out var decimalValue) => decimalValue,
                JsonValueKind.True => true,
                JsonValueKind.False => false,
                JsonValueKind.Null => null,
                _ => jsonElement.ToString()
            };
        }

        var type = sqlType.Trim().ToLowerInvariant();
        var text = rawValue?.ToString()?.Trim();

        if (string.IsNullOrWhiteSpace(text))
        {
            return null;
        }

        return type switch
        {
            "int" or "bigint" or "smallint" or "tinyint" =>
                TryParseLongValue(text),
            "decimal" or "numeric" or "money" or "smallmoney" or "float" or "real" =>
                TryParseDecimalValue(text),
            "bit" =>
                bool.TryParse(text, out var boolValue)
                    ? boolValue
                    : text == "1",
            "date" or "datetime" or "datetime2" or "smalldatetime" =>
                TryParseDateValue(text),
            _ => text
        };
    }

    private static DateTime? TryParseDateValue(string value)
    {
        var dateText = value.Split(' ', 'T')[0].Trim();

        if (DateTime.TryParseExact(dateText, "MMddyyyy", CultureInfo.InvariantCulture, DateTimeStyles.None, out var compactUsDate))
        {
            return compactUsDate;
        }

        if (DateTime.TryParseExact(dateText, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var isoDate))
        {
            return isoDate;
        }

        if (DateTime.TryParseExact(dateText, "MM/dd/yyyy", CultureInfo.InvariantCulture, DateTimeStyles.None, out var usDate))
        {
            return usDate;
        }

        if (DateTime.TryParseExact(dateText, "dd/MM/yyyy", CultureInfo.InvariantCulture, DateTimeStyles.None, out var peruDate))
        {
            return peruDate;
        }

        return DateTime.TryParse(dateText, CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsedDate)
            ? parsedDate
            : null;
    }

    private static long? TryParseLongValue(string value)
    {
        var normalized = value.Replace(" ", string.Empty);

        if (long.TryParse(normalized, NumberStyles.Any, CultureInfo.InvariantCulture, out var invariantValue))
        {
            return invariantValue;
        }

        if (long.TryParse(normalized, NumberStyles.Any, new CultureInfo("es-PE"), out var peruValue))
        {
            return peruValue;
        }

        return null;
    }

    private static decimal? TryParseDecimalValue(string value)
    {
        var normalized = value.Replace(" ", string.Empty);

        if (decimal.TryParse(normalized, NumberStyles.Any, CultureInfo.InvariantCulture, out var invariantValue))
        {
            return invariantValue;
        }

        if (decimal.TryParse(normalized, NumberStyles.Any, new CultureInfo("es-PE"), out var peruValue))
        {
            return peruValue;
        }

        if (decimal.TryParse(normalized.Replace(",", string.Empty), NumberStyles.Any, CultureInfo.InvariantCulture, out var strippedValue))
        {
            return strippedValue;
        }

        return null;
    }

    private static DbType? ResolveDbType(string sqlType)
    {
        var type = sqlType.Trim().ToLowerInvariant();

        return type switch
        {
            "int" or "bigint" or "smallint" or "tinyint" => DbType.Int64,
            "decimal" or "numeric" or "money" or "smallmoney" or "float" or "real" => DbType.Decimal,
            "bit" => DbType.Boolean,
            "date" => DbType.Date,
            "datetime" or "datetime2" or "smalldatetime" => DbType.DateTime,
            _ => DbType.String
        };
    }

    private bool HasOpenAiConfiguration()
    {
        return !string.IsNullOrWhiteSpace(_openAiSettings.ApiKey) &&
               !string.IsNullOrWhiteSpace(_openAiSettings.Model);
    }

    private static string? NormalizeText(string? value)
    {
        return string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    }

    private static decimal ClampConfidence(decimal value)
    {
        if (value < 0m)
        {
            return 0m;
        }

        if (value > 1m)
        {
            return 1m;
        }

        return value;
    }

    private static string NormalizeKey(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return string.Empty;
        }

        var normalized = value.Trim();
        var builder = new StringBuilder(normalized.Length);

        foreach (var character in normalized.Normalize(NormalizationForm.FormD))
        {
            var category = CharUnicodeInfo.GetUnicodeCategory(character);
            if (category == UnicodeCategory.NonSpacingMark)
            {
                continue;
            }

            if (char.IsLetterOrDigit(character))
            {
                builder.Append(char.ToLowerInvariant(character));
            }
        }

        return builder.ToString();
    }

    private static string TrimAt(string value)
    {
        return value.Trim().TrimStart('@');
    }

    private static string? NullIfWhiteSpace(string? value)
    {
        return string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    }

    private static string Truncate(string? value, int maxLength)
    {
        if (string.IsNullOrEmpty(value))
        {
            return string.Empty;
        }

        return value.Length <= maxLength ? value : value[..maxLength];
    }

    private static string? ExtractJsonCandidate(string text)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            return null;
        }

        var start = text.IndexOf('{');
        var end = text.LastIndexOf('}');

        if (start < 0 || end <= start)
        {
            return null;
        }

        return text[start..(end + 1)];
    }

    private static string? ExtractResponsesOutputText(string payload)
    {
        using var document = JsonDocument.Parse(payload);
        var root = document.RootElement;

        if (root.TryGetProperty("output_text", out var outputText) && outputText.ValueKind == JsonValueKind.String)
        {
            return outputText.GetString();
        }

        if (!root.TryGetProperty("output", out var output) || output.ValueKind != JsonValueKind.Array)
        {
            return null;
        }

        foreach (var outputItem in output.EnumerateArray())
        {
            if (!outputItem.TryGetProperty("content", out var content) || content.ValueKind != JsonValueKind.Array)
            {
                continue;
            }

            foreach (var contentItem in content.EnumerateArray())
            {
                if (!contentItem.TryGetProperty("type", out var typeElement))
                {
                    continue;
                }

                var type = typeElement.GetString();
                if (type is not ("output_text" or "text"))
                {
                    continue;
                }

                if (contentItem.TryGetProperty("text", out var textElement))
                {
                    return textElement.ValueKind == JsonValueKind.String
                        ? textElement.GetString()
                        : textElement.GetRawText();
                }
            }
        }

        return null;
    }

    private sealed class StoredProcedureParameterInfo
    {
        public string Name { get; set; } = string.Empty;

        public string TypeName { get; set; } = string.Empty;

        public short MaxLength { get; set; }

        public bool IsOutput { get; set; }

        public bool HasDefaultValue { get; set; }

        public string Tipo => TypeName;

        public string Nombre => Name;

        public bool EsSalida => IsOutput;

        public bool TieneDefault => HasDefaultValue;
    }

    private sealed class OpenAiResponsesRequest
    {
        public string Model { get; set; } = string.Empty;

        public List<OpenAiResponsesInputItem> Input { get; set; } = [];

        public decimal? Temperature { get; set; }
    }

    private sealed class OpenAiResponsesInputItem
    {
        public string Role { get; set; } = string.Empty;

        public List<OpenAiResponsesContentItem> Content { get; set; } = [];
    }

    private sealed class OpenAiResponsesContentItem
    {
        public string Type { get; set; } = string.Empty;

        public string? Text { get; set; }

        [JsonPropertyName("file_data")]
        public string? FileData { get; set; }

        public string? Filename { get; set; }
    }

    private sealed class OpenAiChatCompletionRequest
    {
        public string Model { get; set; } = string.Empty;

        public List<OpenAiChatMessage> Messages { get; set; } = [];

        [JsonPropertyName("max_completion_tokens")]
        public int? MaxCompletionTokens { get; set; }

        public decimal? Temperature { get; set; }

        [JsonPropertyName("response_format")]
        public OpenAiResponseFormat? ResponseFormat { get; set; }
    }

    private sealed class OpenAiChatCompletionResponse
    {
        public List<OpenAiChoice> Choices { get; set; } = [];
    }

    private sealed class OpenAiChoice
    {
        public OpenAiChatMessage? Message { get; set; }
    }

    private sealed class OpenAiChatMessage
    {
        public string Role { get; set; } = string.Empty;

        public string? Content { get; set; }
    }

    private sealed class OpenAiResponseFormat
    {
        public string Type { get; set; } = "json_object";
    }

    private sealed record HeaderInfo(string Header, string Normalized);

    private sealed record ConciliacionBcpRawAnalysisResult(
        ConciliacionBcpPromptAnalysisResponseDto? ParsedResponse,
        ConciliacionBcpDebugAnalisisDto Debug);

    private sealed record ConciliacionBcpDuplicateFilterResult(
        List<Dictionary<string, object?>> Filas,
        int FilasDuplicadas,
        List<string> Advertencias,
        int FilasDuplicadasEnBase,
        int FilasDuplicadasEnLote);

    private sealed record ClientFileMetadata(
        string NombreArchivo,
        string? Cuenta,
        string? Empresa,
        string? Moneda);

    private sealed class MovimientoBcpBusquedaRow
    {
        public int IdMovimientoBanco { get; set; }
        public string? Empresa { get; set; }
        public string? Cuenta { get; set; }
        public string? Moneda { get; set; }
        public DateTime? Fecha { get; set; }
        public DateTime? FechaValuta { get; set; }
        public string? Proveedor { get; set; }
        public string? ItemSistema { get; set; }
        public string? DescripcionOperacion { get; set; }
        public decimal? Monto { get; set; }
        public string? SucursalAgencia { get; set; }
        public string? NroOperacion { get; set; }
        public string? Usuario { get; set; }
        public string? ArchivoOrigen { get; set; }
        public DateTime? FechaImportacion { get; set; }
        public string? UsuarioImportacion { get; set; }
        public bool? IdActivo { get; set; }
        public bool? EsNroOperacionValido { get; set; }
        public string? TipoMovimientoBanco { get; set; }
        public string? EstadoConciliacion { get; set; }
        public string? Comentario { get; set; }
        public int? IdAreaFlujo { get; set; }
        public int? IdReferencia { get; set; }
        public int? IdCuentaContable { get; set; }
        public int? IdReglaContable { get; set; }
        public bool? EsConciliado { get; set; }
        public DateTime? FechaConciliacion { get; set; }
        public string? UsuarioConciliacion { get; set; }
        public string? ObservacionConciliacion { get; set; }
        public string? NombreAreaFlujo { get; set; }
        public string? DescripcionAreaFlujo { get; set; }
        public string? CodigoReferencia { get; set; }
        public string? NombreReferencia { get; set; }
        public string? DescripcionReferencia { get; set; }
        public string? CodigoCuenta { get; set; }
        public string? NombreCuenta { get; set; }
        public string? CuentaContableTexto { get; set; }
        public int? Orden { get; set; }
        public bool? EsPrincipal { get; set; }
        public bool? RequiereComprobante { get; set; }
        public bool? AplicaConciliacion { get; set; }
        public string? ObservacionReglaContable { get; set; }
        public string? EstadoConciliacionTexto { get; set; }
        public string? EstadoOperativoConciliacion { get; set; }
    }

    private sealed class PlanillaConciliacionRow
    {
        public string RowKey { get; set; } = string.Empty;
        public string? NroOperacion { get; set; }
        public string NroOperacionNormalizado { get; set; } = string.Empty;
        public string? Cuenta { get; set; }
        public string? CuentaInter { get; set; }
        public string? Cliente { get; set; }
        public string? Proyecto { get; set; }
        public string? Site { get; set; }
        public string? TipoTrabajo { get; set; }
        public string? Tarea { get; set; }
        public string? Responsable { get; set; }
        public string? Comprobante { get; set; }
        public string? Banco { get; set; }
        public string? Serie { get; set; }
        public string? Detalle { get; set; }
        public string CuentaNumerica { get; set; } = string.Empty;
        public string CuentaInterNumerica { get; set; } = string.Empty;
        public int? Corre { get; set; }
        public DateTime? FechaDeposito { get; set; }
        public decimal? TotalPagar { get; set; }
    }

    private sealed record ConciliacionDateRange(DateTime? FechaInicio, DateTime? FechaFin, bool EsDesdeFiltroUsuario);

    private sealed class ConciliacionCandidate
    {
        public int Prioridad { get; set; }
        public string ResultadoConciliacion { get; set; } = string.Empty;
        public string TipoCoincidencia { get; set; } = string.Empty;
        public PlanillaConciliacionRow Planilla { get; set; } = new();
        public string ObservacionConciliacion { get; set; } = string.Empty;
        public int OrdenPlanilla { get; set; }
        public decimal? DiferenciaMontoAbs { get; set; }
        public int? DiferenciaFechaDias { get; set; }
    }

    private sealed class MovimientoConciliacionContext
    {
        public MovimientoBcpBusquedaRow Movimiento { get; set; } = new();
        public List<ConciliacionCandidate> Candidates { get; set; } = [];
    }

    private sealed class ConciliacionAssignment
    {
        public MovimientoBcpBusquedaRow Movimiento { get; set; } = new();
        public ConciliacionCandidate Candidate { get; set; } = new();
    }
}
