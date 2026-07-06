using System.Data;
using System.Globalization;
using CjERP.Application.DTOs;
using CjERP.Application.Interfaces.Repositories;
using CjERP.Infrastructure.Persistence.Sql;
using Dapper;

namespace CjERP.Infrastructure.Repositories;

public sealed class PlanillaBoletaRepository : IPlanillaBoletaRepository
{
    private const string StoredProcedureName = "dbo.sp_PlanillaBoleta_ImportarXml";
    private readonly ISqlCommandFactory _sqlCommandFactory;

    public PlanillaBoletaRepository(ISqlCommandFactory sqlCommandFactory)
    {
        _sqlCommandFactory = sqlCommandFactory;
    }

    public async Task<PlanillaXmlResultadoDto> ImportarXmlAsync(
        string nombreArchivo,
        string xml,
        string usuario,
        CancellationToken cancellationToken = default)
    {
        await using var connection = _sqlCommandFactory.CreateConnection();
        var parameters = await BuildParametersAsync(connection, nombreArchivo, xml, usuario, cancellationToken);

        var row = await connection.QueryFirstOrDefaultAsync(
            _sqlCommandFactory.Create(
                StoredProcedureName,
                parameters,
                CommandType.StoredProcedure,
                cancellationToken,
                commandTimeout: 180));

        if (row is null)
        {
            return new PlanillaXmlResultadoDto
            {
                NombreArchivo = nombreArchivo,
                Valido = true,
                Importado = true,
                Estado = "Importado",
                Mensaje = "XML importado correctamente."
            };
        }

        return MapRow(row, nombreArchivo);
    }

    public async Task<bool> ExisteBoletaDuplicadaActivaAsync(
        string periodo,
        string numeroDocumento,
        int idActivo,
        CancellationToken cancellationToken = default)
    {
        await using var connection = _sqlCommandFactory.CreateConnection();
        var tableColumns = await GetPlanillaBoletaCabeceraColumnsAsync(connection, cancellationToken);

        var sql = tableColumns.Contains("IdActivo")
            ? """
              SELECT TOP 1 1
              FROM dbo.PlanillaBoletaCabecera
              WHERE REPLACE(REPLACE(LTRIM(RTRIM(Periodo)), '-', ''), '/', '') = REPLACE(REPLACE(LTRIM(RTRIM(@Periodo)), '-', ''), '/', '')
                AND LTRIM(RTRIM(NumeroDocumento)) = LTRIM(RTRIM(@NumeroDocumento))
                AND ISNULL(IdActivo, 1) = @IdActivo
              """
            : """
              SELECT TOP 1 1
              FROM dbo.PlanillaBoletaCabecera
              WHERE REPLACE(REPLACE(LTRIM(RTRIM(Periodo)), '-', ''), '/', '') = REPLACE(REPLACE(LTRIM(RTRIM(@Periodo)), '-', ''), '/', '')
                AND LTRIM(RTRIM(NumeroDocumento)) = LTRIM(RTRIM(@NumeroDocumento))
              """;

        var exists = await connection.QueryFirstOrDefaultAsync<int?>(
            _sqlCommandFactory.Create(
                sql,
                new
                {
                    Periodo = periodo,
                    NumeroDocumento = numeroDocumento,
                    IdActivo = idActivo
                },
                CommandType.Text,
                cancellationToken,
                commandTimeout: 120));

        return exists.HasValue;
    }

    public async Task<PlanillaBoletaPdfDto?> ObtenerBoletaPdfAsync(int idBoleta, CancellationToken cancellationToken = default)
    {
        await using var connection = _sqlCommandFactory.CreateConnection();

        var cabecera = await connection.QueryFirstOrDefaultAsync<PlanillaBoletaCabeceraPdfDto>(
            _sqlCommandFactory.Create(
                """
                SELECT TOP 1
                    IdBoleta,
                    Ruc,
                    Empleador,
                    Periodo,
                    TipoDocumento,
                    NumeroDocumento,
                    NombreTrabajador,
                    Situacion,
                    CONVERT(varchar(10), FechaIngreso, 103) AS FechaIngreso,
                    TipoTrabajador,
                    RegimenPensionario,
                    CUSPP,
                    DiasLaborados,
                    DiasNoLaborados,
                    DiasSubsidiados,
                    Condicion,
                    JornadaHoras,
                    SobretiempoHoras,
                    NetoPagar
                FROM dbo.PlanillaBoletaCabecera
                WHERE IdBoleta = @IdBoleta
                """,
                new { IdBoleta = idBoleta },
                CommandType.Text,
                cancellationToken,
                commandTimeout: 120));

        if (cabecera is null)
        {
            return null;
        }

        var detalles = (await connection.QueryAsync<PlanillaBoletaDetallePdfDto>(
            _sqlCommandFactory.Create(
                """
                SELECT
                    Categoria,
                    CodigoConcepto,
                    Concepto,
                    Monto
                FROM dbo.PlanillaBoletaDetalle
                WHERE IdBoleta = @IdBoleta
                ORDER BY Categoria, CodigoConcepto, Concepto
                """,
                new { IdBoleta = idBoleta },
                CommandType.Text,
                cancellationToken,
                commandTimeout: 120))).ToList();

        var suspensiones = (await connection.QueryAsync<PlanillaBoletaSuspensionPdfDto>(
            _sqlCommandFactory.Create(
                """
                SELECT
                    Tipo,
                    Motivo,
                    Dias
                FROM dbo.PlanillaBoletaSuspension
                WHERE IdBoleta = @IdBoleta
                ORDER BY Tipo, Motivo
                """,
                new { IdBoleta = idBoleta },
                CommandType.Text,
                cancellationToken,
                commandTimeout: 120))).ToList();

        var firma = await connection.QueryFirstOrDefaultAsync<PlanillaEmpresaFirmaDto>(
            _sqlCommandFactory.Create(
                """
                SELECT TOP 1
                    Ruc,
                    RazonSocial,
                    NombreCorto,
                    RutaFirma,
                    FirmaBase64,
                    NombreRepresentante,
                    CargoRepresentante,
                    IdActivo
                FROM dbo.PlanillaEmpresaFirma
                WHERE Ruc = @Ruc
                  AND ISNULL(IdActivo, 1) = 1
                ORDER BY IdActivo DESC
                """,
                new { Ruc = cabecera.Ruc },
                CommandType.Text,
                cancellationToken,
                commandTimeout: 120));

        return new PlanillaBoletaPdfDto
        {
            Cabecera = cabecera,
            Ingresos = detalles.Where(x => string.Equals(x.Categoria, "INGRESO", StringComparison.OrdinalIgnoreCase)).ToList(),
            Descuentos = detalles.Where(x => string.Equals(x.Categoria, "DESCUENTO", StringComparison.OrdinalIgnoreCase)).ToList(),
            AportesTrabajador = detalles.Where(x => string.Equals(x.Categoria, "APORTE_TRABAJADOR", StringComparison.OrdinalIgnoreCase)).ToList(),
            AportesEmpleador = detalles.Where(x => string.Equals(x.Categoria, "APORTE_EMPLEADOR", StringComparison.OrdinalIgnoreCase)).ToList(),
            Suspensiones = suspensiones,
            FirmaEmpresa = firma
        };
    }

    public async Task<int?> ObtenerIdBoletaPorPeriodoYNroDocumentoAsync(
        string periodo,
        string numeroDocumento,
        CancellationToken cancellationToken = default)
    {
        await using var connection = _sqlCommandFactory.CreateConnection();
        var tableColumns = await GetPlanillaBoletaCabeceraColumnsAsync(connection, cancellationToken);

        if (tableColumns.Count == 0)
        {
            return null;
        }

        var hasIdActivoColumn = tableColumns.Contains("IdActivo");
        var hasNumeroDocumentoColumn = tableColumns.Contains("NumeroDocumento");
        var hasNroDocumentoColumn = !hasNumeroDocumentoColumn && tableColumns.Contains("NroDocumento");

        var numeroDocumentoSelect = hasNumeroDocumentoColumn
            ? "cab.NumeroDocumento"
            : hasNroDocumentoColumn
                ? "cab.NroDocumento"
                : null;

        if (numeroDocumentoSelect is null)
        {
            return null;
        }

        var idActivoFilter = hasIdActivoColumn
            ? "AND ISNULL(cab.IdActivo, 1) = 1"
            : string.Empty;

        var periodoTokens = BuildPeriodoTokens(periodo);
        if (periodoTokens.Length == 0)
        {
            return null;
        }

        var sql = $"""
            SELECT TOP 1 cab.IdBoleta
            FROM dbo.PlanillaBoletaCabecera cab
            WHERE REPLACE(REPLACE(LTRIM(RTRIM(ISNULL(cab.Periodo, ''))), '-', ''), '/', '') IN @PeriodoTokens
              AND LTRIM(RTRIM(ISNULL({numeroDocumentoSelect}, ''))) = LTRIM(RTRIM(@NumeroDocumento))
              {idActivoFilter}
            ORDER BY cab.IdBoleta
            """;

        var idBoleta = await connection.QueryFirstOrDefaultAsync<int?>(
            _sqlCommandFactory.Create(
                sql,
                new
                {
                    PeriodoTokens = periodoTokens,
                    NumeroDocumento = numeroDocumento
                },
                CommandType.Text,
                cancellationToken,
                commandTimeout: 120));

        return idBoleta;
    }

    public async Task<PlanillaBoletaPdfEntity?> ObtenerPdfExistenteAsync(int idBoleta, CancellationToken cancellationToken = default)
    {
        await using var connection = _sqlCommandFactory.CreateConnection();

        return await connection.QueryFirstOrDefaultAsync<PlanillaBoletaPdfEntity>(
            _sqlCommandFactory.Create(
                """
                SELECT TOP 1
                    IdPdf,
                    IdBoleta,
                    NombreArchivo,
                    RutaArchivo,
                    ArchivoBase64,
                    FechaGeneracion,
                    Enviado,
                    FechaEnvio,
                    MedioEnvio
                FROM dbo.PlanillaBoletaPdf
                WHERE IdBoleta = @IdBoleta
                ORDER BY IdPdf DESC
                """,
                new { IdBoleta = idBoleta },
                CommandType.Text,
                cancellationToken,
                commandTimeout: 120));
    }

    public async Task RegistrarPdfAsync(PlanillaBoletaPdfEntity pdf, CancellationToken cancellationToken = default)
    {
        await using var connection = _sqlCommandFactory.CreateConnection();

        var existing = await ObtenerPdfExistenteAsync(pdf.IdBoleta, cancellationToken);
        if (existing is null)
        {
            await connection.ExecuteAsync(
                _sqlCommandFactory.Create(
                    """
                    INSERT INTO dbo.PlanillaBoletaPdf
                    (
                        IdBoleta,
                        NombreArchivo,
                        RutaArchivo,
                        ArchivoBase64,
                        FechaGeneracion,
                        Enviado,
                        FechaEnvio,
                        MedioEnvio
                    )
                    VALUES
                    (
                        @IdBoleta,
                        @NombreArchivo,
                        @RutaArchivo,
                        @ArchivoBase64,
                        @FechaGeneracion,
                        @Enviado,
                        @FechaEnvio,
                        @MedioEnvio
                    )
                    """,
                    pdf,
                    CommandType.Text,
                    cancellationToken,
                    commandTimeout: 120));
            return;
        }

        await connection.ExecuteAsync(
            _sqlCommandFactory.Create(
                """
                UPDATE dbo.PlanillaBoletaPdf
                SET NombreArchivo = @NombreArchivo,
                    RutaArchivo = @RutaArchivo,
                    ArchivoBase64 = @ArchivoBase64,
                    FechaGeneracion = @FechaGeneracion,
                    Enviado = @Enviado,
                    FechaEnvio = @FechaEnvio,
                    MedioEnvio = @MedioEnvio
                WHERE IdPdf = @IdPdf
                """,
                new
                {
                    existing.IdPdf,
                    pdf.NombreArchivo,
                    pdf.RutaArchivo,
                    pdf.ArchivoBase64,
                    pdf.FechaGeneracion,
                    pdf.Enviado,
                    pdf.FechaEnvio,
                    pdf.MedioEnvio
                },
                CommandType.Text,
                cancellationToken,
                commandTimeout: 120));
    }

    public async Task ActualizarEstadoEnvioAsync(
        int idBoleta,
        bool enviado,
        string? medioEnvio,
        string? fechaEnvio,
        CancellationToken cancellationToken = default)
    {
        await using var connection = _sqlCommandFactory.CreateConnection();

        await connection.ExecuteAsync(
            _sqlCommandFactory.Create(
                """
                UPDATE dbo.PlanillaBoletaPdf
                SET Enviado = @Enviado,
                    FechaEnvio = @FechaEnvio,
                    MedioEnvio = @MedioEnvio
                WHERE IdBoleta = @IdBoleta
                """,
                new
                {
                    IdBoleta = idBoleta,
                    Enviado = enviado,
                    FechaEnvio = fechaEnvio,
                    MedioEnvio = medioEnvio
                },
                CommandType.Text,
                cancellationToken,
                commandTimeout: 120));
    }

    public async Task<IReadOnlyList<int>> ListarBoletasPorPeriodoAsync(string periodo, CancellationToken cancellationToken = default)
    {
        await using var connection = _sqlCommandFactory.CreateConnection();

        var rows = await connection.QueryAsync<int>(
            _sqlCommandFactory.Create(
                """
                SELECT IdBoleta
                FROM dbo.PlanillaBoletaCabecera
                WHERE REPLACE(REPLACE(Periodo, '-', ''), '/', '') = REPLACE(REPLACE(@Periodo, '-', ''), '/', '')
                ORDER BY IdBoleta
                """,
                new { Periodo = periodo },
                CommandType.Text,
                cancellationToken,
                commandTimeout: 120));

        return rows.ToList();
    }

    private async Task<DynamicParameters> BuildParametersAsync(
        Microsoft.Data.SqlClient.SqlConnection connection,
        string nombreArchivo,
        string xml,
        string usuario,
        CancellationToken cancellationToken)
    {
        var availableParameters = (await GetStoredProcedureParametersAsync(connection, cancellationToken))
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        var parameters = new DynamicParameters();
        AddParameterIfExists(availableParameters, parameters, nombreArchivo, DbType.String,
            "@NombreArchivo", "@Archivo", "@NomArchivo", "@FileName", "@NombreXml");
        AddParameterIfExists(availableParameters, parameters, xml, DbType.String,
            "@Xml", "@XML", "@ContenidoXml", "@XmlContenido", "@ArchivoXml");
        AddParameterIfExists(availableParameters, parameters, usuario, DbType.String,
            "@Usuario", "@UsuarioAccion", "@UsuarioCreacion", "@UserName", "@Usr");

        if (!availableParameters.Contains("@Xml") &&
            !availableParameters.Contains("@XML") &&
            !availableParameters.Contains("@ContenidoXml") &&
            !availableParameters.Contains("@XmlContenido") &&
            !availableParameters.Contains("@ArchivoXml"))
        {
            throw new InvalidOperationException("No se encontro un parametro compatible para enviar el contenido XML al store de planillas.");
        }

        return parameters;
    }

    private async Task<IReadOnlyList<string>> GetStoredProcedureParametersAsync(
        Microsoft.Data.SqlClient.SqlConnection connection,
        CancellationToken cancellationToken)
    {
        const string sql = """
            SELECT p.name
            FROM sys.parameters p
            INNER JOIN sys.objects o ON p.object_id = o.object_id
            INNER JOIN sys.schemas s ON o.schema_id = s.schema_id
            WHERE s.name = @SchemaName
              AND o.name = @ProcedureName
            """;

        var rows = await connection.QueryAsync<string>(
            _sqlCommandFactory.Create(
                sql,
                new { SchemaName = "dbo", ProcedureName = "sp_PlanillaBoleta_ImportarXml" },
                CommandType.Text,
                cancellationToken));

        return rows.ToList();
    }

    private async Task<HashSet<string>> GetPlanillaBoletaCabeceraColumnsAsync(
        Microsoft.Data.SqlClient.SqlConnection connection,
        CancellationToken cancellationToken)
    {
        const string sql = """
            SELECT c.name
            FROM sys.columns c
            INNER JOIN sys.tables t ON t.object_id = c.object_id
            INNER JOIN sys.schemas s ON s.schema_id = t.schema_id
            WHERE s.name = 'dbo'
              AND t.name = 'PlanillaBoletaCabecera';
            """;

        var columns = await connection.QueryAsync<string>(
            _sqlCommandFactory.Create(
                sql,
                commandType: CommandType.Text,
                cancellationToken: cancellationToken));

        return columns.ToHashSet(StringComparer.OrdinalIgnoreCase);
    }

    private static string[] BuildPeriodoTokens(string? periodo)
    {
        var normalized = (periodo ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return Array.Empty<string>();
        }

        var compact = normalized.Replace("-", string.Empty).Replace("/", string.Empty).Trim();
        var tokens = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        if (!string.IsNullOrWhiteSpace(compact))
        {
            tokens.Add(compact);
        }

        if (DateTime.TryParseExact(
                normalized.Replace("-", "/"),
                new[] { "MM/yyyy", "M/yyyy", "yyyy/MM", "yyyy/M", "yyyyMM" },
                CultureInfo.InvariantCulture,
                DateTimeStyles.None,
                out var parsed))
        {
            tokens.Add(parsed.ToString("MMyyyy", CultureInfo.InvariantCulture));
            tokens.Add(parsed.ToString("yyyyMM", CultureInfo.InvariantCulture));
        }

        return tokens.ToArray();
    }

    private static void AddParameterIfExists(
        IReadOnlySet<string> availableParameters,
        DynamicParameters parameters,
        object? value,
        DbType dbType,
        params string[] candidateNames)
    {
        var parameterName = candidateNames.FirstOrDefault(availableParameters.Contains);
        if (string.IsNullOrWhiteSpace(parameterName))
        {
            return;
        }

        parameters.Add(parameterName, value, dbType);
    }

    private static PlanillaXmlResultadoDto MapRow(dynamic row, string nombreArchivo)
    {
        var values = ((IDictionary<string, object>)row)
            .ToDictionary(item => item.Key, item => item.Value, StringComparer.OrdinalIgnoreCase);

        return new PlanillaXmlResultadoDto
        {
            NombreArchivo = nombreArchivo,
            Valido = GetBool(values, "Valido", "EsValido", "Success") ?? true,
            Importado = GetBool(values, "Importado", "Exito", "Success") ?? true,
            Estado = GetString(values, "Estado", "Resultado", "Status") ?? "Importado",
            Mensaje = GetString(values, "Mensaje", "Message", "Observacion") ?? "XML importado correctamente.",
            Periodo = GetString(values, "Periodo"),
            NumeroDocumento = GetString(values, "NumeroDocumento", "NroDocumento", "Documento"),
            NombreTrabajador = GetString(values, "NombreTrabajador", "Trabajador", "ApellidosNombres"),
            IdBoleta = GetInt(values, "IdBoleta", "IdPlanillaBoleta", "Correlativo"),
            FechaImportacion = GetDate(values, "FechaImportacion", "FechaRegistro", "FechaProceso")
        };
    }

    private static string? GetString(IReadOnlyDictionary<string, object> values, params string[] keys)
    {
        foreach (var key in keys)
        {
            if (values.TryGetValue(key, out var value) && value is not null && value != DBNull.Value)
            {
                var text = value.ToString()?.Trim();
                if (!string.IsNullOrWhiteSpace(text))
                {
                    return text;
                }
            }
        }

        return null;
    }

    private static bool? GetBool(IReadOnlyDictionary<string, object> values, params string[] keys)
    {
        foreach (var key in keys)
        {
            if (!values.TryGetValue(key, out var value) || value is null || value == DBNull.Value)
            {
                continue;
            }

            if (value is bool boolValue)
            {
                return boolValue;
            }

            if (bool.TryParse(value.ToString(), out var parsedBool))
            {
                return parsedBool;
            }

            if (int.TryParse(value.ToString(), out var parsedInt))
            {
                return parsedInt != 0;
            }
        }

        return null;
    }

    private static int? GetInt(IReadOnlyDictionary<string, object> values, params string[] keys)
    {
        foreach (var key in keys)
        {
            if (!values.TryGetValue(key, out var value) || value is null || value == DBNull.Value)
            {
                continue;
            }

            if (value is int intValue)
            {
                return intValue;
            }

            if (int.TryParse(value.ToString(), NumberStyles.Any, CultureInfo.InvariantCulture, out var parsed))
            {
                return parsed;
            }
        }

        return null;
    }

    private static string? GetDate(IReadOnlyDictionary<string, object> values, params string[] keys)
    {
        foreach (var key in keys)
        {
            if (!values.TryGetValue(key, out var value) || value is null || value == DBNull.Value)
            {
                continue;
            }

            if (value is DateTime dateTime)
            {
                return dateTime.ToString("yyyy-MM-dd HH:mm:ss", CultureInfo.InvariantCulture);
            }

            if (DateTime.TryParse(value.ToString(), CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsed))
            {
                return parsed.ToString("yyyy-MM-dd HH:mm:ss", CultureInfo.InvariantCulture);
            }
        }

        return null;
    }
}
