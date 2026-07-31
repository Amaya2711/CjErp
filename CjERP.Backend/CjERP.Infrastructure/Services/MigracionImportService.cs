using System.Globalization;
using System.IO.Compression;
using System.Text;
using System.Xml.Linq;
using CjERP.Application.DTOs;
using CjERP.Application.Interfaces.Services;
using System.Data;
using CjERP.Infrastructure.Persistence.Sql;
using Dapper;
using Microsoft.Data.SqlClient;

namespace CjERP.Infrastructure.Services;

public sealed class MigracionImportService : IMigracionImportService
{
    private readonly ISqlCommandFactory _sqlCommandFactory;

    private static readonly string[] ClavesAgrupacion =
    [
        "CLIENTE",
        "PROYECTO",
        "CODIGO",
        "SITE",
        "OT",
        "AÑO_OP.",
        "TIPO_TRABAJO",
        "NRO_OC",
        "POS"
    ];

    public MigracionImportService(ISqlCommandFactory sqlCommandFactory)
    {
        _sqlCommandFactory = sqlCommandFactory;
    }

    public Task<MigracionImportAnalisisDto> AnalizarAsync(
        byte[] archivoBytes,
        string nombreArchivo,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();

        var workbook = LeerWorkbook(archivoBytes, nombreArchivo, cancellationToken);
        var filasConsolidadas = ConsolidarFilas(
            workbook.Encabezados,
            workbook.Filas,
            out var filasDuplicadas,
            out var gruposDuplicados);

        var resultado = new MigracionImportAnalisisDto
        {
            NombreArchivo = nombreArchivo,
            Hojas = workbook.Hojas,
            NombreHoja = workbook.NombreHoja,
            FilasOrigen = workbook.Filas.Count,
            FilasConsolidadas = filasConsolidadas.Count,
            FilasDuplicadasConsolidadas = filasDuplicadas,
            Encabezados = workbook.Encabezados,
            Filas = filasConsolidadas,
            Duplicados = gruposDuplicados
        };

        return Task.FromResult(resultado);
    }

    public async Task<MigracionImportEjecucionResultadoDto> AplicarAsync(
        byte[] archivoBytes,
        string nombreArchivo,
        MigracionImportModo modo,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();

        var analisis = await AnalizarAsync(archivoBytes, nombreArchivo, cancellationToken);
        var workbookHeaders = analisis.Encabezados;
        var headerIndex = CreateHeaderIndex(workbookHeaders);

        var stagingRows = analisis.Filas.Select(row => new
        {
            Ot = GetCellValue(row, headerIndex, "OT"),
            Cliente = GetCellValue(row, headerIndex, "CLIENTE"),
            Proyecto = GetCellValue(row, headerIndex, "PROYECTO"),
            IdSite = GetCellValue(row, headerIndex, "CODIGO"),
            TipoTrabajo = GetCellValue(row, headerIndex, "TIPO_TRABAJO"),
            AnoGestion = ParseNullableInt(GetCellValue(row, headerIndex, "AÑO_OP.")),
            Moneda = GetCellValue(row, headerIndex, "MONEDA"),
            IdMoneda = ParseNullableInt(GetCellValue(row, headerIndex, "ID_MONEDA")),
            MontoBck = ParseNullableDecimal(GetCellValue(row, headerIndex, "MONTO_BCK")),
            Site = GetCellValue(row, headerIndex, "SITE"),
            IdActualizar = 0,
            Fecha = DateTime.Now,
            Hora = DateTime.Now
        }).ToList();

        await using var connection = _sqlCommandFactory.CreateConnection();
        await connection.OpenAsync(cancellationToken);
        using var transaction = connection.BeginTransaction();

        try
        {
            await connection.ExecuteAsync(
                new CommandDefinition(
                    "DELETE FROM dbo.updimportar;",
                    transaction: transaction,
                    cancellationToken: cancellationToken,
                    commandTimeout: _sqlCommandFactory.DefaultCommandTimeoutSeconds));

            const string insertStagingSql = """
                INSERT INTO dbo.updimportar (
                    Ot,
                    Cliente,
                    Proyecto,
                    IdSite,
                    TipoTrabajo,
                    AnoGestion,
                    Moneda,
                    IdMoneda,
                    MontoBck,
                    Fecha,
                    Hora,
                    IdActualizar,
                    Site
                )
                VALUES (
                    @Ot,
                    @Cliente,
                    @Proyecto,
                    @IdSite,
                    @TipoTrabajo,
                    @AnoGestion,
                    @Moneda,
                    @IdMoneda,
                    @MontoBck,
                    @Fecha,
                    @Hora,
                    @IdActualizar,
                    @Site
                );
                """;

            await connection.ExecuteAsync(
                new CommandDefinition(
                    insertStagingSql,
                    stagingRows,
                    transaction: transaction,
                    cancellationToken: cancellationToken,
            commandTimeout: _sqlCommandFactory.DefaultCommandTimeoutSeconds));

            var storeName = modo == MigracionImportModo.Migrar
                ? "dbo.sp_MigracionImport_Insertar"
                : "dbo.sp_MigracionImport_Actualizar";

            var resultado = await connection.QuerySingleAsync<MigracionImportEjecucionResultadoDto>(
                new CommandDefinition(
                    storeName,
                    transaction: transaction,
                    commandType: CommandType.StoredProcedure,
                    cancellationToken: cancellationToken,
                    commandTimeout: _sqlCommandFactory.DefaultCommandTimeoutSeconds));

            await transaction.CommitAsync(cancellationToken);
            return resultado;
        }
        catch
        {
            await transaction.RollbackAsync(cancellationToken);
            throw;
        }
    }

    private static WorkbookData LeerWorkbook(byte[] archivoBytes, string nombreArchivo, CancellationToken cancellationToken)
    {
        using var memoryStream = new MemoryStream(archivoBytes);
        using var archive = new ZipArchive(memoryStream, ZipArchiveMode.Read, leaveOpen: false);

        var sharedStrings = LeerSharedStrings(archive, cancellationToken);
        var workbookXml = LeerXmlDesdeZip(archive, "xl/workbook.xml");
        var workbookRelsXml = LeerXmlDesdeZip(archive, "xl/_rels/workbook.xml.rels");
        var nsMain = XNamespace.Get("http://schemas.openxmlformats.org/spreadsheetml/2006/main");
        var nsRel = XNamespace.Get("http://schemas.openxmlformats.org/officeDocument/2006/relationships");
        var nsPkgRel = XNamespace.Get("http://schemas.openxmlformats.org/package/2006/relationships");

        var sheets = workbookXml
            .Descendants(nsMain + "sheet")
            .Select(sheet => new
            {
                Name = sheet.Attribute("name")?.Value ?? string.Empty,
                Rid = sheet.Attribute(nsRel + "id")?.Value ?? string.Empty
            })
            .Where(sheet => !string.IsNullOrWhiteSpace(sheet.Name) && !string.IsNullOrWhiteSpace(sheet.Rid))
            .ToList();

        if (sheets.Count == 0)
        {
            throw new InvalidOperationException("El archivo Excel no contiene hojas.");
        }

        var sheetName = sheets.Any(sheet => string.Equals(sheet.Name, "GENERAL", StringComparison.OrdinalIgnoreCase))
            ? sheets.First(sheet => string.Equals(sheet.Name, "GENERAL", StringComparison.OrdinalIgnoreCase)).Name
            : sheets[0].Name;

        var sheetRelId = sheets.First(sheet => string.Equals(sheet.Name, sheetName, StringComparison.OrdinalIgnoreCase)).Rid;
        var target = workbookRelsXml
            .Descendants(nsPkgRel + "Relationship")
            .FirstOrDefault(rel => string.Equals(rel.Attribute("Id")?.Value, sheetRelId, StringComparison.OrdinalIgnoreCase))
            ?.Attribute("Target")?.Value;

        if (string.IsNullOrWhiteSpace(target))
        {
            throw new InvalidOperationException($"No se pudo ubicar la hoja {sheetName}.");
        }

        var sheetPath = target.StartsWith("xl/", StringComparison.OrdinalIgnoreCase)
            ? target
            : $"xl/{target.TrimStart('/')}";

        var sheetXml = LeerXmlDesdeZip(archive, sheetPath);
        var rows = LeerRows(sheetXml, sharedStrings, cancellationToken);

        if (rows.Count == 0)
        {
            throw new InvalidOperationException("La hoja seleccionada no contiene filas.");
        }

        var headers = rows[0].Values
            .Select((value, index) => string.IsNullOrWhiteSpace(value) ? $"Columna {index + 1}" : value)
            .ToList();
        var dataRows = rows
            .Skip(1)
            .Where(row => row.Values.Any(cell => !string.IsNullOrWhiteSpace(cell)))
            .Select(row => new WorkbookRowData(
                row.SourceRowNumber,
                AsegurarLongitud(row.Values, headers.Count)))
            .ToList();

        return new WorkbookData(
            nombreArchivo,
            sheets.Select(sheet => sheet.Name).ToList(),
            sheetName,
            headers,
            dataRows);
    }

    private static List<string> LeerSharedStrings(ZipArchive archive, CancellationToken cancellationToken)
    {
        var sharedStringsEntry = archive.GetEntry("xl/sharedStrings.xml");
        if (sharedStringsEntry is null)
        {
            return [];
        }

        cancellationToken.ThrowIfCancellationRequested();
        var sharedStringsXml = LeerXmlDesdeEntry(sharedStringsEntry);
        var nsMain = XNamespace.Get("http://schemas.openxmlformats.org/spreadsheetml/2006/main");

        return sharedStringsXml
            .Descendants(nsMain + "si")
            .Select(si => string.Concat(si.Descendants(nsMain + "t").Select(t => t.Value)))
            .ToList();
    }

    private static List<WorkbookRowData> LeerRows(XDocument sheetXml, IReadOnlyList<string> sharedStrings, CancellationToken cancellationToken)
    {
        var nsMain = XNamespace.Get("http://schemas.openxmlformats.org/spreadsheetml/2006/main");
        var rows = new List<WorkbookRowData>();

        foreach (var row in sheetXml.Descendants(nsMain + "row"))
        {
            cancellationToken.ThrowIfCancellationRequested();

            var cells = row.Elements(nsMain + "c").ToList();
            if (cells.Count == 0)
            {
                continue;
            }

            var valuesByIndex = new SortedDictionary<int, string?>();
            var maxIndex = -1;

            foreach (var cell in cells)
            {
                var reference = cell.Attribute("r")?.Value ?? string.Empty;
                var index = GetColumnIndex(reference);
                if (index < 0)
                {
                    continue;
                }

                var value = ReadCellValue(cell, sharedStrings, nsMain);
                valuesByIndex[index] = value;
                if (index > maxIndex)
                {
                    maxIndex = index;
                }
            }

            if (maxIndex < 0)
            {
                continue;
            }

            var ordered = new string?[maxIndex + 1];
            foreach (var pair in valuesByIndex)
            {
                ordered[pair.Key] = pair.Value;
            }

            var rowNumber = int.TryParse(row.Attribute("r")?.Value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var parsedRowNumber)
                ? parsedRowNumber
                : rows.Count + 1;

            rows.Add(new WorkbookRowData(
                rowNumber,
                ordered.Select(value => (string?)value).ToList()));
        }

        return rows;
    }

    private static string? ReadCellValue(XElement cell, IReadOnlyList<string> sharedStrings, XNamespace nsMain)
    {
        var cellType = cell.Attribute("t")?.Value;
        if (string.Equals(cellType, "inlineStr", StringComparison.OrdinalIgnoreCase))
        {
            return cell.Descendants(nsMain + "t").Select(t => t.Value).FirstOrDefault() ?? string.Empty;
        }

        var rawValue = cell.Element(nsMain + "v")?.Value;
        if (string.IsNullOrWhiteSpace(rawValue))
        {
            return string.Empty;
        }

        if (string.Equals(cellType, "s", StringComparison.OrdinalIgnoreCase) &&
            int.TryParse(rawValue, NumberStyles.Integer, CultureInfo.InvariantCulture, out var sharedIndex) &&
            sharedIndex >= 0 &&
            sharedIndex < sharedStrings.Count)
        {
            return sharedStrings[sharedIndex];
        }

        return rawValue;
    }

    private static List<List<string?>> ConsolidarFilas(
        IReadOnlyList<string> headers,
        IReadOnlyList<WorkbookRowData> rows,
        out int filasDuplicadas,
        out List<MigracionImportGrupoDuplicadoDto> gruposDuplicados)
    {
        var keyIndexes = ClavesAgrupacion
            .Select(clave => FindHeaderIndex(headers, clave))
            .ToArray();
        var montoIndex = FindHeaderIndex(headers, "MONTO_OC");

        if (keyIndexes.Any(index => index < 0) || montoIndex < 0)
        {
            filasDuplicadas = 0;
            gruposDuplicados = [];
            return rows.Select(row => AsegurarLongitud(row.Values, headers.Count)).ToList();
        }

        var grouped = new Dictionary<string, DuplicateGroupBuilder>(StringComparer.OrdinalIgnoreCase);

        foreach (var row in rows)
        {
            var normalizedRow = AsegurarLongitud(row.Values, headers.Count);
            var key = string.Join("||", keyIndexes.Select(index => NormalizeKey(normalizedRow[index])));

            if (!grouped.TryGetValue(key, out var existing))
            {
                grouped[key] = new DuplicateGroupBuilder(
                    normalizedRow,
                    [
                        new MigracionImportRegistroDuplicadoDto
                        {
                            FilaOrigen = row.SourceRowNumber,
                            Valores = new List<string?>(normalizedRow)
                        }
                    ],
                    ParseAmount(normalizedRow[montoIndex]));
                continue;
            }

            existing.Registros.Add(new MigracionImportRegistroDuplicadoDto
            {
                FilaOrigen = row.SourceRowNumber,
                Valores = new List<string?>(normalizedRow)
            });

            existing.ConsolidatedRow[montoIndex] = FormatAmount(SumAmount(existing.ConsolidatedRow[montoIndex], normalizedRow[montoIndex]));
            existing.MontoOcTotal = SumAmount(existing.MontoOcTotal, normalizedRow[montoIndex]);

            for (var i = 0; i < normalizedRow.Count; i++)
            {
                if (i == montoIndex)
                {
                    continue;
                }

                if (string.IsNullOrWhiteSpace(existing.ConsolidatedRow[i]) && !string.IsNullOrWhiteSpace(normalizedRow[i]))
                {
                    existing.ConsolidatedRow[i] = normalizedRow[i];
                }
            }
        }

        filasDuplicadas = rows.Count - grouped.Count;
        gruposDuplicados = grouped
            .Where(pair => pair.Value.Registros.Count > 1)
            .Select(pair => new MigracionImportGrupoDuplicadoDto
            {
                Clave = BuildDuplicateKey(headers, keyIndexes, pair.Value.ConsolidatedRow),
                CantidadRegistros = pair.Value.Registros.Count,
                MontoOcTotal = pair.Value.MontoOcTotal,
                Registros = pair.Value.Registros
            })
            .ToList();

        return grouped.Values.Select(group => group.ConsolidatedRow).ToList();
    }

    private static decimal SumAmount(string? existingValue, string? nextValue)
    {
        return ParseAmount(existingValue) + ParseAmount(nextValue);
    }

    private static decimal SumAmount(decimal existingValue, string? nextValue)
    {
        return existingValue + ParseAmount(nextValue);
    }

    private static decimal ParseAmount(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return 0m;
        }

        var cleaned = new string(value.Where(ch => char.IsDigit(ch) || ch is ',' or '.' or '-').ToArray());
        if (string.IsNullOrWhiteSpace(cleaned))
        {
            return 0m;
        }

        var lastComma = cleaned.LastIndexOf(',');
        var lastDot = cleaned.LastIndexOf('.');

        if (lastComma >= 0 && lastDot >= 0)
        {
            cleaned = lastComma > lastDot
                ? cleaned.Replace(".", string.Empty, StringComparison.Ordinal).Replace(',', '.')
                : cleaned.Replace(",", string.Empty, StringComparison.Ordinal);
        }
        else if (lastComma >= 0)
        {
            cleaned = cleaned.Replace(',', '.');
        }

        return decimal.TryParse(cleaned, NumberStyles.Any, CultureInfo.InvariantCulture, out var parsed)
            ? parsed
            : 0m;
    }

    private static string FormatAmount(decimal value)
    {
        var rounded = Math.Round(value, 2, MidpointRounding.AwayFromZero);
        return rounded % 1 == 0 ? rounded.ToString("0", CultureInfo.InvariantCulture) : rounded.ToString("0.##", CultureInfo.InvariantCulture);
    }

    private static Dictionary<string, int> CreateHeaderIndex(IReadOnlyList<string> headers)
    {
        var index = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        for (var i = 0; i < headers.Count; i++)
        {
            var normalized = NormalizeHeader(headers[i]);
            if (!index.ContainsKey(normalized))
            {
                index[normalized] = i;
            }
        }

        return index;
    }

    private static string GetCellValue(IReadOnlyList<string?> row, IReadOnlyDictionary<string, int> index, string headerName)
    {
        var resolvedIndex = FindHeaderIndex(index, headerName);
        return resolvedIndex >= 0 && resolvedIndex < row.Count
            ? row[resolvedIndex] ?? string.Empty
            : string.Empty;
    }

    private static int FindHeaderIndex(IReadOnlyDictionary<string, int> index, string headerName)
    {
        var normalized = NormalizeHeader(headerName);
        return index.TryGetValue(normalized, out var resolved) ? resolved : -1;
    }

    private static int? ParseNullableInt(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        var cleaned = new string(value.Where(ch => char.IsDigit(ch) || ch == '-' || ch == '+').ToArray());
        return int.TryParse(cleaned, NumberStyles.Integer, CultureInfo.InvariantCulture, out var parsed)
            ? parsed
            : null;
    }

    private static decimal? ParseNullableDecimal(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        var cleaned = new string(value.Where(ch => char.IsDigit(ch) || ch is ',' or '.' or '-').ToArray());
        if (string.IsNullOrWhiteSpace(cleaned))
        {
            return null;
        }

        var lastComma = cleaned.LastIndexOf(',');
        var lastDot = cleaned.LastIndexOf('.');

        if (lastComma >= 0 && lastDot >= 0)
        {
            cleaned = lastComma > lastDot
                ? cleaned.Replace(".", string.Empty, StringComparison.Ordinal).Replace(',', '.')
                : cleaned.Replace(",", string.Empty, StringComparison.Ordinal);
        }
        else if (lastComma >= 0)
        {
            cleaned = cleaned.Replace(',', '.');
        }

        return decimal.TryParse(cleaned, NumberStyles.Any, CultureInfo.InvariantCulture, out var parsed)
            ? parsed
            : null;
    }

    private static string BuildDuplicateKey(
        IReadOnlyList<string> headers,
        IReadOnlyList<int> keyIndexes,
        IReadOnlyList<string?> row)
    {
        return string.Join(" | ", keyIndexes.Select(index => $"{headers[index]}={row[index]}"));
    }

    private static string NormalizeKey(string? value)
    {
        return (value ?? string.Empty)
            .Trim()
            .ToUpperInvariant();
    }

    private static int FindHeaderIndex(IReadOnlyList<string> headers, string headerName)
    {
        var target = NormalizeHeader(headerName);
        for (var i = 0; i < headers.Count; i++)
        {
            if (NormalizeHeader(headers[i]) == target)
            {
                return i;
            }
        }

        return -1;
    }

    private static string NormalizeHeader(string value)
    {
        var normalized = value.Trim().Normalize(NormalizationForm.FormD);
        var builder = new StringBuilder(normalized.Length);
        foreach (var ch in normalized)
        {
            var category = char.GetUnicodeCategory(ch);
            if (category != System.Globalization.UnicodeCategory.NonSpacingMark)
            {
                builder.Append(char.ToUpperInvariant(ch));
            }
        }

        return builder.ToString().Normalize(NormalizationForm.FormC);
    }

    private static List<string?> AsegurarLongitud(IReadOnlyList<string?> row, int length)
    {
        var result = new List<string?>(length);
        for (var i = 0; i < length; i++)
        {
            result.Add(i < row.Count ? row[i] : string.Empty);
        }
        return result;
    }

    private static int GetColumnIndex(string cellReference)
    {
        if (string.IsNullOrWhiteSpace(cellReference))
        {
            return -1;
        }

        var letters = new string(cellReference.TakeWhile(char.IsLetter).ToArray());
        if (string.IsNullOrWhiteSpace(letters))
        {
            return -1;
        }

        var sum = 0;
        foreach (var ch in letters.ToUpperInvariant())
        {
            sum = (sum * 26) + (ch - 'A' + 1);
        }

        return sum - 1;
    }

    private static XDocument LeerXmlDesdeZip(ZipArchive archive, string entryName)
    {
        var entry = archive.GetEntry(entryName);
        if (entry is null)
        {
            throw new InvalidOperationException($"No se encontro la entrada {entryName} en el archivo Excel.");
        }

        return LeerXmlDesdeEntry(entry);
    }

    private static XDocument LeerXmlDesdeEntry(ZipArchiveEntry entry)
    {
        using var stream = entry.Open();
        using var reader = new StreamReader(stream, Encoding.UTF8, detectEncodingFromByteOrderMarks: true);
        return XDocument.Parse(reader.ReadToEnd(), LoadOptions.None);
    }

    private sealed record WorkbookData(
        string NombreArchivo,
        List<string> Hojas,
        string NombreHoja,
        List<string> Encabezados,
        List<WorkbookRowData> Filas);

    private sealed record WorkbookRowData(int SourceRowNumber, List<string?> Values);

    private sealed class DuplicateGroupBuilder
    {
        public DuplicateGroupBuilder(
            List<string?> consolidatedRow,
            List<MigracionImportRegistroDuplicadoDto> registros,
            decimal montoOcTotal)
        {
            ConsolidatedRow = consolidatedRow;
            Registros = registros;
            MontoOcTotal = montoOcTotal;
        }

        public List<string?> ConsolidatedRow { get; }

        public List<MigracionImportRegistroDuplicadoDto> Registros { get; }

        public decimal MontoOcTotal { get; set; }
    }
}

