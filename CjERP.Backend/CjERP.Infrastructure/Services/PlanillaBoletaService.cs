using System.Globalization;
using System.IO.Compression;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Xml.Linq;
using CjERP.Application.DTOs;
using CjERP.Application.Interfaces.Repositories;
using CjERP.Application.Interfaces.Services;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using CjERP.Shared.Configuration;

namespace CjERP.Infrastructure.Services;

public sealed class PlanillaBoletaService : IPlanillaBoletaService
{
    private const int ActiveRecordId = 1;
    private static readonly Regex PeriodoRegex = new(@"(?<!\d)(20\d{2}(?:0[1-9]|1[0-2])|20\d{2}[-/](?:0[1-9]|1[0-2]))(?!\d)", RegexOptions.Compiled);
    private static readonly Regex DocumentoRegex = new(@"\b\d{8,15}\b", RegexOptions.Compiled);
    private static readonly Regex RucRegex = new(@"\b\d{11}\b", RegexOptions.Compiled);

    private readonly IPlanillaBoletaRepository _planillaBoletaRepository;
    private readonly PlanillaBoletaPdfGenerator _planillaBoletaPdfGenerator;
    private readonly IConfiguration _configuration;
    private readonly ILogger<PlanillaBoletaService> _logger;
    private readonly PlanillaXmlOptions _options;

    public PlanillaBoletaService(
        IPlanillaBoletaRepository planillaBoletaRepository,
        PlanillaBoletaPdfGenerator planillaBoletaPdfGenerator,
        IConfiguration configuration,
        IOptions<PlanillaXmlOptions> options,
        ILogger<PlanillaBoletaService> logger)
    {
        _planillaBoletaRepository = planillaBoletaRepository;
        _planillaBoletaPdfGenerator = planillaBoletaPdfGenerator;
        _configuration = configuration;
        _logger = logger;
        _options = options.Value;
    }

    public Task<PlanillaXmlCargaMasivaResponseDto> ValidarXmlMasivoAsync(
        IReadOnlyList<PlanillaXmlArchivoDto> archivos,
        string usuario,
        CancellationToken cancellationToken = default)
    {
        return ProcessFilesAsync(archivos, usuario, importFiles: false, cancellationToken);
    }

    public Task<PlanillaXmlCargaMasivaResponseDto> ImportarXmlMasivoAsync(
        IReadOnlyList<PlanillaXmlArchivoDto> archivos,
        string usuario,
        CancellationToken cancellationToken = default)
    {
        return ProcessFilesAsync(archivos, usuario, importFiles: true, cancellationToken);
    }

    private async Task<PlanillaXmlCargaMasivaResponseDto> ProcessFilesAsync(
        IReadOnlyList<PlanillaXmlArchivoDto> archivos,
        string usuario,
        bool importFiles,
        CancellationToken cancellationToken)
    {
        var results = new List<PlanillaXmlResultadoDto>();
        var duplicateNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var duplicateDocuments = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var now = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss", CultureInfo.InvariantCulture);

        foreach (var archivo in archivos)
        {
            cancellationToken.ThrowIfCancellationRequested();

            var result = await ValidateFileAsync(
                archivo,
                duplicateNames,
                duplicateDocuments,
                now,
                cancellationToken);

            if (importFiles && result.Valido)
            {
                try
                {
                    var xml = await ReadFileAsTextAsync(archivo, cancellationToken);
                    var importResult = await _planillaBoletaRepository.ImportarXmlAsync(
                        result.NombreArchivo,
                        xml,
                        usuario,
                        cancellationToken);

                    result.Importado = importResult.Importado || importResult.Valido;
                    result.Estado = result.Importado ? "Importado" : (importResult.Estado?.Trim() ?? "Error de importacion");
                    result.Mensaje = string.IsNullOrWhiteSpace(importResult.Mensaje)
                        ? "XML importado correctamente."
                        : importResult.Mensaje;
                    result.IdBoleta ??= importResult.IdBoleta;
                    result.Periodo ??= importResult.Periodo;
                    result.NumeroDocumento ??= importResult.NumeroDocumento;
                    result.NombreTrabajador ??= importResult.NombreTrabajador;
                    result.FechaImportacion = importResult.FechaImportacion ?? DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss", CultureInfo.InvariantCulture);

                    if (result.Importado && result.IdBoleta.HasValue && result.IdBoleta.Value > 0)
                    {
                        if (_options.GeneratePdfOnImport)
                        {
                            try
                            {
                                var pdfState = await EnsurePdfAsync(result.IdBoleta.Value, cancellationToken);
                                result.PdfGenerado = pdfState.Generated;
                                result.PdfReutilizado = pdfState.Reused;
                                result.PdfDisponible = pdfState.Available;
                                result.MensajePdf = pdfState.Message;
                            }
                            catch (Exception ex)
                            {
                                _logger.LogError(ex, "[PlanillaBoletaService] Error generando/reutilizando PDF de boleta {IdBoleta}", result.IdBoleta.Value);
                                result.PdfDisponible = false;
                                result.MensajePdf = ex.Message;
                            }
                        }
                        else
                        {
                            result.PdfDisponible = false;
                            result.MensajePdf = "PDF diferido para optimizar la importacion masiva. Se genera al descargar la boleta o al exportar el ZIP del periodo.";
                        }
                    }
                    else if (result.Importado)
                    {
                        result.PdfDisponible = false;
                        result.MensajePdf = "No se pudo resolver el IdBoleta para generar el PDF.";
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "[PlanillaBoletaService] Error importando XML {NombreArchivo}", result.NombreArchivo);
                    result.Importado = false;
                    result.Estado = "Error de importacion";
                    result.Mensaje = ex.Message;
                    result.FechaImportacion = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss", CultureInfo.InvariantCulture);
                }
            }

            results.Add(result);
        }

        var response = new PlanillaXmlCargaMasivaResponseDto
        {
            TotalArchivos = results.Count,
            Validos = results.Count(item => item.Valido),
            ConError = results.Count(item => !item.Valido),
            Importados = results.Count(item => item.Importado),
            Fallidos = importFiles ? results.Count(item => !item.Importado) : 0,
            PdfGenerados = results.Count(item => item.PdfGenerado),
            PdfReutilizados = results.Count(item => item.PdfReutilizado),
            PdfDisponibles = results.Count(item => item.PdfDisponible),
            PdfConError = results.Count(item => item.Importado && !item.PdfDisponible),
            Resultados = results
        };

        return response;
    }

    public async Task<byte[]> GenerarPdfBoletaAsync(int idBoleta, CancellationToken cancellationToken = default)
    {
        var model = await _planillaBoletaRepository.ObtenerBoletaPdfAsync(idBoleta, cancellationToken);
        if (model is null)
        {
            throw new InvalidOperationException($"No existe la boleta {idBoleta} para generar el PDF.");
        }

        await EnrichFirmaAsync(model, cancellationToken);
        var existingPdf = await _planillaBoletaRepository.ObtenerPdfExistenteAsync(idBoleta, cancellationToken);
        if (existingPdf is not null &&
            !string.IsNullOrWhiteSpace(existingPdf.ArchivoBase64) &&
            !ShouldRefreshPdfForFirma(model))
        {
            return Convert.FromBase64String(existingPdf.ArchivoBase64);
        }

        var pdfBytes = _planillaBoletaPdfGenerator.GeneratePdf(model);
        var base64 = Convert.ToBase64String(pdfBytes);
        await _planillaBoletaRepository.RegistrarPdfAsync(
            new PlanillaBoletaPdfEntity
            {
                IdBoleta = idBoleta,
                NombreArchivo = BuildPdfFileName(model.Cabecera),
                RutaArchivo = string.Empty,
                ArchivoBase64 = base64,
                FechaGeneracion = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss", CultureInfo.InvariantCulture),
                Enviado = false,
                FechaEnvio = null,
                MedioEnvio = string.Empty
            },
            cancellationToken);

        return pdfBytes;
    }

    public async Task<string> ObtenerPdfBase64Async(int idBoleta, CancellationToken cancellationToken = default)
    {
        var existingPdf = await _planillaBoletaRepository.ObtenerPdfExistenteAsync(idBoleta, cancellationToken);
        if (existingPdf is not null && !string.IsNullOrWhiteSpace(existingPdf.ArchivoBase64))
        {
            return existingPdf.ArchivoBase64;
        }

        var pdfBytes = await GenerarPdfBoletaAsync(idBoleta, cancellationToken);
        return Convert.ToBase64String(pdfBytes);
    }

    public Task<int?> ObtenerIdBoletaPorPeriodoYNroDocumentoAsync(
        string periodo,
        string numeroDocumento,
        CancellationToken cancellationToken = default)
    {
        return _planillaBoletaRepository.ObtenerIdBoletaPorPeriodoYNroDocumentoAsync(periodo, numeroDocumento, cancellationToken);
    }

    public async Task<byte[]> GenerarZipPeriodoAsync(string periodo, CancellationToken cancellationToken = default)
    {
        var boletas = await _planillaBoletaRepository.ListarBoletasPorPeriodoAsync(periodo, cancellationToken);
        if (boletas.Count == 0)
        {
            throw new InvalidOperationException($"No existen boletas para el periodo {periodo}.");
        }

        await using var memoryStream = new MemoryStream();
        using (var archive = new ZipArchive(memoryStream, ZipArchiveMode.Create, leaveOpen: true))
        {
            foreach (var idBoleta in boletas)
            {
                cancellationToken.ThrowIfCancellationRequested();
                var pdfBytes = await GenerarPdfBoletaAsync(idBoleta, cancellationToken);
                var model = await _planillaBoletaRepository.ObtenerBoletaPdfAsync(idBoleta, cancellationToken);
                var fileName = model is null
                    ? $"Boleta_{idBoleta}.pdf"
                    : BuildPdfFileName(model.Cabecera);

                var entry = archive.CreateEntry(fileName, CompressionLevel.Fastest);
                await using var entryStream = entry.Open();
                await entryStream.WriteAsync(pdfBytes, cancellationToken);
            }
        }

        return memoryStream.ToArray();
    }

    public async Task EnviarBoletaPreparadaAsync(int idBoleta, string medioEnvio, string destino, CancellationToken cancellationToken = default)
    {
        _ = destino;
        var base64 = await ObtenerPdfBase64Async(idBoleta, cancellationToken);
        if (string.IsNullOrWhiteSpace(base64))
        {
            throw new InvalidOperationException("No se pudo preparar el PDF para el envío.");
        }

        await _planillaBoletaRepository.ActualizarEstadoEnvioAsync(
            idBoleta,
            enviado: true,
            medioEnvio,
            DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss", CultureInfo.InvariantCulture),
            cancellationToken);
    }

    public async Task<PlanillaFirmaDiagnosticoDto> ObtenerDiagnosticoFirmaAsync(int idBoleta, CancellationToken cancellationToken = default)
    {
        var model = await _planillaBoletaRepository.ObtenerBoletaPdfAsync(idBoleta, cancellationToken);
        if (model is null)
        {
            throw new InvalidOperationException($"No existe la boleta {idBoleta} para diagnosticar la firma.");
        }

        var firma = model.FirmaEmpresa;
        var diagnostico = new PlanillaFirmaDiagnosticoDto
        {
            IdBoleta = idBoleta,
            Ruc = model.Cabecera.Ruc ?? string.Empty,
            RutaFirmaOriginal = firma?.RutaFirma?.Trim() ?? string.Empty,
            FirmaBase64InicialDisponible = !string.IsNullOrWhiteSpace(firma?.FirmaBase64)
        };

        if (firma is null)
        {
            diagnostico.MensajeFinal = "La boleta no tiene configuracion de firma asociada.";
            return diagnostico;
        }

        if (!string.IsNullOrWhiteSpace(firma.FirmaBase64))
        {
            diagnostico.FirmaBase64FinalDisponible = true;
            diagnostico.FirmaBase64FinalLength = firma.FirmaBase64.Trim().Length;
            diagnostico.MensajeFinal = "La firma ya existe en Base64 dentro del modelo de la boleta.";
            return diagnostico;
        }

        if (string.IsNullOrWhiteSpace(firma.RutaFirma))
        {
            diagnostico.MensajeFinal = "RutaFirma esta vacia.";
            return diagnostico;
        }

        var candidateUris = BuildRutaFirmaCandidateUris(firma.RutaFirma);
        diagnostico.CandidateUrls = candidateUris
            .Select(item => item.AbsoluteUri)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        try
        {
            var imageBytes = await ResolveFirmaBytesAsync(firma.RutaFirma, cancellationToken, diagnostico.Intentos);
            if (imageBytes.Length > 0)
            {
                diagnostico.FirmaBase64FinalDisponible = true;
                diagnostico.FirmaBase64FinalLength = Convert.ToBase64String(imageBytes).Length;
                diagnostico.MensajeFinal = $"La firma fue resuelta correctamente con {imageBytes.Length} bytes.";
            }
            else
            {
                diagnostico.MensajeFinal = "No se pudo resolver la firma desde RutaFirma.";
            }
        }
        catch (Exception ex)
        {
            diagnostico.Intentos.Add(new PlanillaFirmaDiagnosticoIntentoDto
            {
                Etapa = "resolucion-firma",
                Url = diagnostico.RutaFirmaOriginal,
                Exitoso = false,
                Mensaje = ex.Message
            });
            diagnostico.MensajeFinal = $"Ocurrio un error durante el diagnostico de firma: {ex.Message}";
        }

        return diagnostico;
    }

    private async Task<PdfProcessResult> EnsurePdfAsync(int idBoleta, CancellationToken cancellationToken)
    {
        var model = await _planillaBoletaRepository.ObtenerBoletaPdfAsync(idBoleta, cancellationToken);
        if (model is null)
        {
            throw new InvalidOperationException($"No existe la boleta {idBoleta} para generar el PDF.");
        }

        await EnrichFirmaAsync(model, cancellationToken);
        var existingPdf = await _planillaBoletaRepository.ObtenerPdfExistenteAsync(idBoleta, cancellationToken);
        if (existingPdf is not null &&
            !string.IsNullOrWhiteSpace(existingPdf.ArchivoBase64) &&
            !ShouldRefreshPdfForFirma(model))
        {
            return new PdfProcessResult(false, true, true, "PDF reutilizado desde PlanillaBoletaPdf.");
        }

        await GenerarPdfBoletaAsync(idBoleta, cancellationToken);
        return existingPdf is null
            ? new PdfProcessResult(true, false, true, "PDF generado y registrado correctamente.")
            : new PdfProcessResult(true, false, true, "PDF regenerado para actualizar la firma de la boleta.");
    }

    private async Task EnrichFirmaAsync(PlanillaBoletaPdfDto model, CancellationToken cancellationToken)
    {
        var firma = model.FirmaEmpresa;
        if (firma is null)
        {
            return;
        }

        if (!string.IsNullOrWhiteSpace(firma.FirmaBase64))
        {
            return;
        }

        if (string.IsNullOrWhiteSpace(firma.RutaFirma))
        {
            return;
        }

        try
        {
            var imageBytes = await ResolveFirmaBytesAsync(firma.RutaFirma, cancellationToken);
            if (imageBytes.Length > 0)
            {
                firma.FirmaBase64 = Convert.ToBase64String(imageBytes);
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "[PlanillaBoletaService] No se pudo resolver la firma remota/local desde RutaFirma: {RutaFirma}", firma.RutaFirma);
        }
    }

    private async Task<byte[]> ResolveFirmaBytesAsync(
        string rutaFirma,
        CancellationToken cancellationToken,
        List<PlanillaFirmaDiagnosticoIntentoDto>? diagnosticAttempts = null)
    {
        var normalizedRoute = rutaFirma.Trim();

        if (File.Exists(normalizedRoute))
        {
            diagnosticAttempts?.Add(new PlanillaFirmaDiagnosticoIntentoDto
            {
                Etapa = "archivo-local",
                Url = normalizedRoute,
                Exitoso = true,
                Mensaje = "La firma se resolvio desde archivo local.",
                BytesDescargados = (int)new FileInfo(normalizedRoute).Length
            });
            return await File.ReadAllBytesAsync(normalizedRoute, cancellationToken);
        }

        var candidateUris = BuildRutaFirmaCandidateUris(normalizedRoute);
        if (candidateUris.Count == 0)
        {
            diagnosticAttempts?.Add(new PlanillaFirmaDiagnosticoIntentoDto
            {
                Etapa = "candidate-uris",
                Url = normalizedRoute,
                Exitoso = false,
                Mensaje = "No se construyeron URLs candidatas para RutaFirma."
            });
            return Array.Empty<byte>();
        }

        using var handler = new HttpClientHandler
        {
            AllowAutoRedirect = true,
            UseCookies = true,
            UseDefaultCredentials = true
        };
        using var client = new HttpClient(handler, disposeHandler: true)
        {
            Timeout = TimeSpan.FromSeconds(30)
        };

        foreach (var candidateUri in candidateUris)
        {
            try
            {
                var sharePointBytes = await TryResolveSharePointFirmaBytesAsync(candidateUri, cancellationToken, diagnosticAttempts);
                if (sharePointBytes.Length > 0)
                {
                    return sharePointBytes;
                }

                using var request = new HttpRequestMessage(HttpMethod.Get, candidateUri);
                request.Headers.TryAddWithoutValidation("User-Agent", "CjERP-PlanillaBoleta/1.0");
                request.Headers.TryAddWithoutValidation("Accept", "image/*,*/*;q=0.8");

                using var response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
                if (!response.IsSuccessStatusCode)
                {
                    diagnosticAttempts?.Add(new PlanillaFirmaDiagnosticoIntentoDto
                    {
                        Etapa = "http-directo",
                        Url = candidateUri.AbsoluteUri,
                        Exitoso = false,
                        StatusCode = (int)response.StatusCode,
                        Mensaje = $"Respuesta no satisfactoria: {response.StatusCode}"
                    });
                    continue;
                }

                var mediaType = response.Content.Headers.ContentType?.MediaType ?? string.Empty;
                if (!mediaType.StartsWith("image/", StringComparison.OrdinalIgnoreCase) &&
                    !candidateUri.AbsolutePath.EndsWith(".png", StringComparison.OrdinalIgnoreCase) &&
                    !candidateUri.AbsolutePath.EndsWith(".jpg", StringComparison.OrdinalIgnoreCase) &&
                    !candidateUri.AbsolutePath.EndsWith(".jpeg", StringComparison.OrdinalIgnoreCase) &&
                    !candidateUri.AbsolutePath.EndsWith(".bmp", StringComparison.OrdinalIgnoreCase))
                {
                    diagnosticAttempts?.Add(new PlanillaFirmaDiagnosticoIntentoDto
                    {
                        Etapa = "http-directo",
                        Url = candidateUri.AbsoluteUri,
                        Exitoso = false,
                        StatusCode = (int)response.StatusCode,
                        Mensaje = $"La respuesta no fue reconocida como imagen. MediaType: {mediaType}"
                    });
                    continue;
                }

                var bytes = await response.Content.ReadAsByteArrayAsync(cancellationToken);
                if (bytes.Length > 0)
                {
                    diagnosticAttempts?.Add(new PlanillaFirmaDiagnosticoIntentoDto
                    {
                        Etapa = "http-directo",
                        Url = candidateUri.AbsoluteUri,
                        Exitoso = true,
                        StatusCode = (int)response.StatusCode,
                        Mensaje = $"Imagen descargada correctamente. MediaType: {mediaType}",
                        BytesDescargados = bytes.Length
                    });
                    return bytes;
                }

                diagnosticAttempts?.Add(new PlanillaFirmaDiagnosticoIntentoDto
                {
                    Etapa = "http-directo",
                    Url = candidateUri.AbsoluteUri,
                    Exitoso = false,
                    StatusCode = (int)response.StatusCode,
                    Mensaje = "La respuesta fue satisfactoria pero no devolvio bytes."
                });
            }
            catch (Exception ex)
            {
                diagnosticAttempts?.Add(new PlanillaFirmaDiagnosticoIntentoDto
                {
                    Etapa = "http-directo",
                    Url = candidateUri.AbsoluteUri,
                    Exitoso = false,
                    Mensaje = ex.Message
                });
                _logger.LogDebug(ex, "[PlanillaBoletaService] Fallo al descargar firma desde {FirmaUri}", candidateUri);
            }
        }

        return Array.Empty<byte>();
    }

    private IReadOnlyList<Uri> BuildRutaFirmaCandidateUris(string rutaFirma)
    {
        var candidates = new List<Uri>();
        var normalized = rutaFirma.Trim().Replace('\\', '/');

        if (Uri.TryCreate(normalized, UriKind.Absolute, out var absoluteUri) &&
            (absoluteUri.Scheme == Uri.UriSchemeHttp || absoluteUri.Scheme == Uri.UriSchemeHttps))
        {
            candidates.AddRange(BuildFirmaCandidateUris(absoluteUri));
            return candidates
                .DistinctBy(item => item.AbsoluteUri, StringComparer.OrdinalIgnoreCase)
                .ToList();
        }

        var hostName = _configuration["SharePoint:HostName"]?.Trim();
        var sitePath = NormalizeSharePointPath(_configuration["SharePoint:SitePath"]);
        var documentLibraryName = (_configuration["SharePoint:DocumentLibraryName"] ?? string.Empty).Trim().Trim('/');

        if (string.IsNullOrWhiteSpace(hostName) || string.IsNullOrWhiteSpace(sitePath))
        {
            return candidates;
        }

        var pathCandidates = new List<string>();
        var routeWithoutLeadingSlash = normalized.TrimStart('/');
        var sitePathWithoutLeadingSlash = sitePath.TrimStart('/');

        if (!string.IsNullOrWhiteSpace(routeWithoutLeadingSlash))
        {
            pathCandidates.Add(routeWithoutLeadingSlash);

            if (!string.IsNullOrWhiteSpace(documentLibraryName) &&
                !routeWithoutLeadingSlash.StartsWith(documentLibraryName, StringComparison.OrdinalIgnoreCase) &&
                !routeWithoutLeadingSlash.StartsWith(sitePathWithoutLeadingSlash, StringComparison.OrdinalIgnoreCase))
            {
                pathCandidates.Add($"{documentLibraryName}/{routeWithoutLeadingSlash}");
            }

            if (!routeWithoutLeadingSlash.StartsWith(sitePathWithoutLeadingSlash, StringComparison.OrdinalIgnoreCase))
            {
                pathCandidates.Add($"{sitePathWithoutLeadingSlash}/{routeWithoutLeadingSlash}");

                if (!string.IsNullOrWhiteSpace(documentLibraryName) &&
                    !routeWithoutLeadingSlash.StartsWith(documentLibraryName, StringComparison.OrdinalIgnoreCase))
                {
                    pathCandidates.Add($"{sitePathWithoutLeadingSlash}/{documentLibraryName}/{routeWithoutLeadingSlash}");
                }
            }
        }

        foreach (var pathCandidate in pathCandidates
                     .Where(static item => !string.IsNullOrWhiteSpace(item))
                     .Distinct(StringComparer.OrdinalIgnoreCase))
        {
            if (TryBuildSharePointAbsoluteUri(hostName, pathCandidate, out var candidateUri))
            {
                candidates.AddRange(BuildFirmaCandidateUris(candidateUri));
            }
        }

        return candidates
            .DistinctBy(item => item.AbsoluteUri, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    private async Task<byte[]> TryResolveSharePointFirmaBytesAsync(
        Uri uri,
        CancellationToken cancellationToken,
        List<PlanillaFirmaDiagnosticoIntentoDto>? diagnosticAttempts = null)
    {
        var hostName = _configuration["SharePoint:HostName"]?.Trim();
        var sitePath = NormalizeSharePointPath(_configuration["SharePoint:SitePath"]);
        var documentLibraryName = (_configuration["SharePoint:DocumentLibraryName"] ?? string.Empty).Trim().Trim('/');
        var tenantId = _configuration["SharePoint:TenantId"]?.Trim();
        var clientId = _configuration["SharePoint:ClientId"]?.Trim();
        var clientSecret = _configuration["SharePoint:ClientSecret"]?.Trim();

        if (string.IsNullOrWhiteSpace(hostName) ||
            string.IsNullOrWhiteSpace(sitePath) ||
            string.IsNullOrWhiteSpace(documentLibraryName) ||
            string.IsNullOrWhiteSpace(tenantId) ||
            string.IsNullOrWhiteSpace(clientId) ||
            string.IsNullOrWhiteSpace(clientSecret) ||
            clientSecret.StartsWith("REPLACE_WITH_", StringComparison.OrdinalIgnoreCase) ||
            !uri.Host.Contains("sharepoint.com", StringComparison.OrdinalIgnoreCase))
        {
            diagnosticAttempts?.Add(new PlanillaFirmaDiagnosticoIntentoDto
            {
                Etapa = "sharepoint-config",
                Url = uri.AbsoluteUri,
                Exitoso = false,
                Mensaje = "La configuracion de SharePoint no esta completa o la URL no corresponde a SharePoint."
            });
            return Array.Empty<byte>();
        }

        var fileServerRelativePath = ResolveSharePointFileServerRelativePath(uri);
        if (string.IsNullOrWhiteSpace(fileServerRelativePath))
        {
            diagnosticAttempts?.Add(new PlanillaFirmaDiagnosticoIntentoDto
            {
                Etapa = "sharepoint-path",
                Url = uri.AbsoluteUri,
                Exitoso = false,
                Mensaje = "No se pudo resolver el server relative path del archivo."
            });
            return Array.Empty<byte>();
        }

        var normalizedFileServerRelativePath = NormalizeComparableSharePointPath(fileServerRelativePath);
        var libraryPrefix = NormalizeComparableSharePointPath($"{sitePath}/{documentLibraryName}");
        if (!normalizedFileServerRelativePath.StartsWith(libraryPrefix, StringComparison.OrdinalIgnoreCase))
        {
            diagnosticAttempts?.Add(new PlanillaFirmaDiagnosticoIntentoDto
            {
                Etapa = "sharepoint-path",
                Url = uri.AbsoluteUri,
                Exitoso = false,
                Mensaje = $"La ruta no cae dentro de la biblioteca esperada. ServerRelativePath: {normalizedFileServerRelativePath}"
            });
            return Array.Empty<byte>();
        }

        var driveRelativePath = normalizedFileServerRelativePath[libraryPrefix.Length..].Trim('/');
        if (string.IsNullOrWhiteSpace(driveRelativePath))
        {
            diagnosticAttempts?.Add(new PlanillaFirmaDiagnosticoIntentoDto
            {
                Etapa = "sharepoint-path",
                Url = uri.AbsoluteUri,
                Exitoso = false,
                Mensaje = "No se pudo obtener la ruta relativa dentro del drive."
            });
            return Array.Empty<byte>();
        }

        using var client = new HttpClient
        {
            Timeout = TimeSpan.FromSeconds(30)
        };

        var accessToken = await GetSharePointAccessTokenAsync(client, tenantId, clientId, clientSecret, cancellationToken);
        if (string.IsNullOrWhiteSpace(accessToken))
        {
            diagnosticAttempts?.Add(new PlanillaFirmaDiagnosticoIntentoDto
            {
                Etapa = "graph-token",
                Url = "https://login.microsoftonline.com",
                Exitoso = false,
                Mensaje = "No se pudo obtener access token para Microsoft Graph."
            });
            return Array.Empty<byte>();
        }

        diagnosticAttempts?.Add(new PlanillaFirmaDiagnosticoIntentoDto
        {
            Etapa = "graph-token",
            Url = "https://login.microsoftonline.com",
            Exitoso = true,
            Mensaje = "Token de Microsoft Graph obtenido correctamente."
        });

        var shareUrlCandidates = BuildSharePointAbsoluteFileUrls(uri);
        foreach (var shareUrl in shareUrlCandidates)
        {
            var sharedItemBytes = await TryDownloadSharePointSharedItemAsync(client, shareUrl, accessToken, cancellationToken, diagnosticAttempts);
            if (sharedItemBytes.Length > 0)
            {
                return sharedItemBytes;
            }
        }

        var siteId = await GetSharePointSiteIdAsync(client, hostName, sitePath, accessToken, cancellationToken);
        var driveId = await GetSharePointDriveIdAsync(client, siteId, documentLibraryName, accessToken, cancellationToken);
        var encodedPath = string.Join("/", driveRelativePath.Split('/', StringSplitOptions.RemoveEmptyEntries).Select(Uri.EscapeDataString));
        var requestUrl = $"https://graph.microsoft.com/v1.0/drives/{driveId}/root:/{encodedPath}:/content";

        using var request = new HttpRequestMessage(HttpMethod.Get, requestUrl);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        using var response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellationToken);

        if (!response.IsSuccessStatusCode)
        {
            var responseContent = await response.Content.ReadAsStringAsync(cancellationToken);
            diagnosticAttempts?.Add(new PlanillaFirmaDiagnosticoIntentoDto
            {
                Etapa = "graph-drive-content",
                Url = requestUrl,
                Exitoso = false,
                StatusCode = (int)response.StatusCode,
                Mensaje = responseContent
            });
            _logger.LogWarning(
                "[PlanillaBoletaService] Microsoft Graph no pudo descargar la firma desde SharePoint. Status: {StatusCode}. Detalle: {Detalle}",
                response.StatusCode,
                responseContent);
            return Array.Empty<byte>();
        }

        var bytes = await response.Content.ReadAsByteArrayAsync(cancellationToken);
        diagnosticAttempts?.Add(new PlanillaFirmaDiagnosticoIntentoDto
        {
            Etapa = "graph-drive-content",
            Url = requestUrl,
            Exitoso = bytes.Length > 0,
            StatusCode = (int)response.StatusCode,
            Mensaje = bytes.Length > 0
                ? "Archivo descargado correctamente desde drives/{id}/root:/path:/content."
                : "La descarga fue satisfactoria pero no devolvio bytes.",
            BytesDescargados = bytes.Length
        });
        return bytes;
    }

    private async Task<byte[]> TryDownloadSharePointSharedItemAsync(
        HttpClient client,
        Uri shareUrl,
        string accessToken,
        CancellationToken cancellationToken,
        List<PlanillaFirmaDiagnosticoIntentoDto>? diagnosticAttempts = null)
    {
        var encodedSharingUrl = EncodeSharingUrl(shareUrl.AbsoluteUri);
        var requestUrl = $"https://graph.microsoft.com/v1.0/shares/{encodedSharingUrl}/driveItem/content";
        using var request = new HttpRequestMessage(HttpMethod.Get, requestUrl);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        using var response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellationToken);

        if (!response.IsSuccessStatusCode)
        {
            var responseContent = await response.Content.ReadAsStringAsync(cancellationToken);
            diagnosticAttempts?.Add(new PlanillaFirmaDiagnosticoIntentoDto
            {
                Etapa = "graph-share-content",
                Url = shareUrl.AbsoluteUri,
                Exitoso = false,
                StatusCode = (int)response.StatusCode,
                Mensaje = responseContent
            });
            _logger.LogDebug(
                "[PlanillaBoletaService] Graph shares endpoint no pudo descargar firma. Url: {ShareUrl}. Status: {StatusCode}. Detalle: {Detalle}",
                shareUrl,
                response.StatusCode,
                responseContent);
            return Array.Empty<byte>();
        }

        var bytes = await response.Content.ReadAsByteArrayAsync(cancellationToken);
        diagnosticAttempts?.Add(new PlanillaFirmaDiagnosticoIntentoDto
        {
            Etapa = "graph-share-content",
            Url = shareUrl.AbsoluteUri,
            Exitoso = bytes.Length > 0,
            StatusCode = (int)response.StatusCode,
            Mensaje = bytes.Length > 0
                ? "Archivo descargado correctamente desde shares/{encoded}/driveItem/content."
                : "La descarga por share fue satisfactoria pero no devolvio bytes.",
            BytesDescargados = bytes.Length
        });
        return bytes;
    }

    private static IReadOnlyList<Uri> BuildFirmaCandidateUris(Uri uri)
    {
        var candidates = new List<Uri> { uri };

        var queryValues = ParseQueryString(uri.Query);
        if (queryValues.TryGetValue("id", out var idValue) && !string.IsNullOrWhiteSpace(idValue))
        {
            var decodedId = WebUtility.UrlDecode(idValue);
            if (Uri.TryCreate(decodedId, UriKind.Absolute, out var absoluteIdUri))
            {
                candidates.Add(absoluteIdUri);
            }
            else if (decodedId.StartsWith("/", StringComparison.Ordinal))
            {
                candidates.Add(new Uri(uri.GetLeftPart(UriPartial.Authority) + decodedId));
            }
        }

        return candidates
            .DistinctBy(item => item.AbsoluteUri, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    private static IReadOnlyList<Uri> BuildSharePointAbsoluteFileUrls(Uri uri)
    {
        var urls = new List<Uri>();

        var serverRelativePath = ResolveSharePointFileServerRelativePath(uri);
        if (!string.IsNullOrWhiteSpace(serverRelativePath))
        {
            try
            {
                urls.Add(new Uri($"{uri.Scheme}://{uri.Host}{serverRelativePath}"));
            }
            catch
            {
                // Ignore malformed candidate and continue with the original URL.
            }
        }

        urls.Add(uri);

        return urls
            .DistinctBy(item => item.AbsoluteUri, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    private static string ResolveSharePointFileServerRelativePath(Uri uri)
    {
        var queryValues = ParseQueryString(uri.Query);
        if (queryValues.TryGetValue("id", out var idValue) && !string.IsNullOrWhiteSpace(idValue))
        {
            var decodedId = WebUtility.UrlDecode(idValue);
            if (!string.IsNullOrWhiteSpace(decodedId) && decodedId.StartsWith("/", StringComparison.Ordinal))
            {
                return decodedId.Trim();
            }
        }

        var absolutePath = uri.AbsolutePath.Trim();
        if (string.IsNullOrWhiteSpace(absolutePath))
        {
            return string.Empty;
        }

        var shareLinkPrefixes = new[]
        {
            "/:i:/r/",
            "/:u:/r/",
            "/:w:/r/",
            "/:b:/r/",
            "/:x:/r/",
            "/:p:/r/",
            "/:f:/r/"
        };

        foreach (var prefix in shareLinkPrefixes)
        {
            if (absolutePath.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
            {
                return "/" + absolutePath[prefix.Length..].TrimStart('/');
            }
        }

        return absolutePath;
    }

    private static bool TryBuildSharePointAbsoluteUri(string hostName, string pathOrUrl, out Uri uri)
    {
        uri = default!;

        if (string.IsNullOrWhiteSpace(hostName) || string.IsNullOrWhiteSpace(pathOrUrl))
        {
            return false;
        }

        var normalized = pathOrUrl.Trim().Replace('\\', '/');
        if (Uri.TryCreate(normalized, UriKind.Absolute, out uri) &&
            (uri.Scheme == Uri.UriSchemeHttp || uri.Scheme == Uri.UriSchemeHttps))
        {
            return true;
        }

        string pathPart;
        string queryPart = string.Empty;

        var querySeparatorIndex = normalized.IndexOf('?');
        if (querySeparatorIndex >= 0)
        {
            pathPart = normalized[..querySeparatorIndex];
            queryPart = normalized[querySeparatorIndex..];
        }
        else
        {
            pathPart = normalized;
        }

        pathPart = pathPart.Trim('/');
        if (string.IsNullOrWhiteSpace(pathPart))
        {
            return false;
        }

        var escapedPath = string.Join(
            "/",
            pathPart
                .Split('/', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .Select(Uri.EscapeDataString));

        return Uri.TryCreate($"https://{hostName}/{escapedPath}{queryPart}", UriKind.Absolute, out uri);
    }

    private static string NormalizeSharePointPath(string? value)
    {
        var normalized = (value ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return string.Empty;
        }

        if (!normalized.StartsWith("/", StringComparison.Ordinal))
        {
            normalized = "/" + normalized;
        }

        return normalized.TrimEnd('/');
    }

    private static string NormalizeComparableSharePointPath(string? value)
    {
        var normalized = WebUtility.UrlDecode(value ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return string.Empty;
        }

        normalized = normalized.Replace('\\', '/');
        if (!normalized.StartsWith("/", StringComparison.Ordinal))
        {
            normalized = "/" + normalized;
        }

        while (normalized.Contains("//", StringComparison.Ordinal))
        {
            normalized = normalized.Replace("//", "/", StringComparison.Ordinal);
        }

        return normalized.TrimEnd('/');
    }

    private static string EncodeSharingUrl(string absoluteUrl)
    {
        var bytes = Encoding.UTF8.GetBytes(absoluteUrl);
        var base64 = Convert.ToBase64String(bytes)
            .TrimEnd('=')
            .Replace('/', '_')
            .Replace('+', '-');

        return $"u!{base64}";
    }

    private static bool ShouldRefreshPdfForFirma(PlanillaBoletaPdfDto model)
    {
        var firma = model.FirmaEmpresa;
        if (firma is null)
        {
            return false;
        }

        return !string.IsNullOrWhiteSpace(firma.FirmaBase64);
    }

    private async Task<string> GetSharePointAccessTokenAsync(
        HttpClient client,
        string tenantId,
        string clientId,
        string clientSecret,
        CancellationToken cancellationToken)
    {
        using var request = new HttpRequestMessage(
            HttpMethod.Post,
            $"https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/token")
        {
            Content = new FormUrlEncodedContent(new Dictionary<string, string>
            {
                ["client_id"] = clientId,
                ["client_secret"] = clientSecret,
                ["grant_type"] = "client_credentials",
                ["scope"] = "https://graph.microsoft.com/.default"
            })
        };

        using var response = await client.SendAsync(request, cancellationToken);
        var responseContent = await response.Content.ReadAsStringAsync(cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            _logger.LogWarning(
                "[PlanillaBoletaService] No se pudo obtener token de Graph para firma SharePoint. Status: {StatusCode}. Detalle: {Detalle}",
                response.StatusCode,
                responseContent);
            return string.Empty;
        }

        using var document = JsonDocument.Parse(responseContent);
        return document.RootElement.TryGetProperty("access_token", out var accessTokenProperty)
            ? accessTokenProperty.GetString() ?? string.Empty
            : string.Empty;
    }

    private async Task<string> GetSharePointSiteIdAsync(
        HttpClient client,
        string hostName,
        string sitePath,
        string accessToken,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(accessToken))
        {
            return string.Empty;
        }

        var requestUrl = $"https://graph.microsoft.com/v1.0/sites/{hostName}:{sitePath}";
        using var request = new HttpRequestMessage(HttpMethod.Get, requestUrl);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        using var response = await client.SendAsync(request, cancellationToken);
        var responseContent = await response.Content.ReadAsStringAsync(cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            _logger.LogWarning(
                "[PlanillaBoletaService] No se pudo resolver el site de SharePoint para firma. Status: {StatusCode}. Detalle: {Detalle}",
                response.StatusCode,
                responseContent);
            return string.Empty;
        }

        using var document = JsonDocument.Parse(responseContent);
        return document.RootElement.TryGetProperty("id", out var idProperty)
            ? idProperty.GetString() ?? string.Empty
            : string.Empty;
    }

    private async Task<string> GetSharePointDriveIdAsync(
        HttpClient client,
        string siteId,
        string documentLibraryName,
        string accessToken,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(siteId) || string.IsNullOrWhiteSpace(accessToken))
        {
            return string.Empty;
        }

        using var request = new HttpRequestMessage(HttpMethod.Get, $"https://graph.microsoft.com/v1.0/sites/{siteId}/drives");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        using var response = await client.SendAsync(request, cancellationToken);
        var responseContent = await response.Content.ReadAsStringAsync(cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            _logger.LogWarning(
                "[PlanillaBoletaService] No se pudo listar drives de SharePoint para firma. Status: {StatusCode}. Detalle: {Detalle}",
                response.StatusCode,
                responseContent);
            return string.Empty;
        }

        using var document = JsonDocument.Parse(responseContent);
        if (!document.RootElement.TryGetProperty("value", out var valueProperty))
        {
            return string.Empty;
        }

        foreach (var drive in valueProperty.EnumerateArray())
        {
            var name = drive.TryGetProperty("name", out var nameProperty)
                ? nameProperty.GetString()
                : null;

            if (!string.Equals(name, documentLibraryName, StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            return drive.TryGetProperty("id", out var idProperty)
                ? idProperty.GetString() ?? string.Empty
                : string.Empty;
        }

        return string.Empty;
    }

    private static Dictionary<string, string> ParseQueryString(string query)
    {
        var values = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        if (string.IsNullOrWhiteSpace(query))
        {
            return values;
        }

        var segments = query.TrimStart('?')
            .Split('&', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

        foreach (var segment in segments)
        {
            var parts = segment.Split('=', 2);
            var key = WebUtility.UrlDecode(parts[0]);
            if (string.IsNullOrWhiteSpace(key))
            {
                continue;
            }

            var value = parts.Length == 2 ? WebUtility.UrlDecode(parts[1]) : string.Empty;
            values[key] = value;
        }

        return values;
    }

    private static string BuildPdfFileName(PlanillaBoletaCabeceraPdfDto cabecera)
    {
        var periodo = NormalizePeriodToken(cabecera.Periodo);
        var documento = Regex.Replace(cabecera.NumeroDocumento ?? string.Empty, @"[^\dA-Za-z]", string.Empty);
        return $"Boleta_{periodo}_{documento}.pdf";
    }

    private static string NormalizePeriodToken(string? value)
    {
        var text = (value ?? string.Empty).Trim().Replace("-", string.Empty).Replace("/", string.Empty);
        return string.IsNullOrWhiteSpace(text) ? DateTime.Now.ToString("yyyyMM", CultureInfo.InvariantCulture) : text;
    }

    private async Task<PlanillaXmlResultadoDto> ValidateFileAsync(
        PlanillaXmlArchivoDto archivo,
        ISet<string> duplicateNames,
        ISet<string> duplicateDocuments,
        string validationTimestamp,
        CancellationToken cancellationToken)
    {
        var result = new PlanillaXmlResultadoDto
        {
            NombreArchivo = archivo?.NombreArchivo?.Trim() ?? string.Empty,
            Estado = "Pendiente",
            FechaValidacion = validationTimestamp
        };

        if (archivo is null)
        {
            result.Estado = "Error de validacion";
            result.Mensaje = "No se recibio el archivo.";
            return result;
        }

        var fileName = Path.GetFileName(archivo.NombreArchivo ?? string.Empty).Trim();
        result.NombreArchivo = fileName;

        if (string.IsNullOrWhiteSpace(fileName))
        {
            result.Estado = "Error de validacion";
            result.Mensaje = "El nombre del archivo es obligatorio.";
            return result;
        }

        if (!string.Equals(fileName, archivo.NombreArchivo?.Trim(), StringComparison.Ordinal))
        {
            result.Estado = "Error de validacion";
            result.Mensaje = "El nombre del archivo es invalido.";
            return result;
        }

        if (fileName.IndexOfAny(Path.GetInvalidFileNameChars()) >= 0)
        {
            result.Estado = "Error de validacion";
            result.Mensaje = "El nombre del archivo contiene caracteres no permitidos.";
            return result;
        }

        if (!duplicateNames.Add(fileName))
        {
            result.Estado = "Error de validacion";
            result.Mensaje = "El archivo esta duplicado dentro de la misma carga.";
            return result;
        }

        if (!string.Equals(Path.GetExtension(fileName), ".xml", StringComparison.OrdinalIgnoreCase))
        {
            result.Estado = "Error de validacion";
            result.Mensaje = "Solo se permiten archivos con extension .xml.";
            return result;
        }

        if (archivo.TamanioBytes <= 0 || archivo.Contenido.Length == 0)
        {
            result.Estado = "Error de validacion";
            result.Mensaje = "El archivo esta vacio.";
            return result;
        }

        if (_options.MaxFileSizeBytes > 0 && archivo.TamanioBytes > _options.MaxFileSizeBytes)
        {
            result.Estado = "Error de validacion";
            result.Mensaje = $"El archivo excede el tamano maximo permitido de {_options.MaxFileSizeBytes} bytes.";
            return result;
        }

        try
        {
            var xml = await ReadFileAsTextAsync(archivo, cancellationToken);
            if (string.IsNullOrWhiteSpace(xml))
            {
                result.Estado = "Error de validacion";
                result.Mensaje = "El archivo no contiene informacion XML.";
                return result;
            }

            var document = XDocument.Parse(xml, LoadOptions.PreserveWhitespace);
            var root = document.Root;

            if (root is null || !string.Equals(root.Name.LocalName, "Workbook", StringComparison.OrdinalIgnoreCase))
            {
                result.Estado = "Error de validacion";
                result.Mensaje = "El XML no tiene una estructura Workbook valida.";
                return result;
            }

            var worksheets = root.Descendants().Where(node => string.Equals(node.Name.LocalName, "Worksheet", StringComparison.OrdinalIgnoreCase)).ToList();
            if (worksheets.Count == 0)
            {
                result.Estado = "Error de validacion";
                result.Mensaje = "El XML no contiene nodos Worksheet.";
                return result;
            }

            var rows = root.Descendants().Where(node => string.Equals(node.Name.LocalName, "Row", StringComparison.OrdinalIgnoreCase)).ToList();
            if (rows.Count == 0)
            {
                result.Estado = "Error de validacion";
                result.Mensaje = "El XML no contiene nodos Row.";
                return result;
            }

            var parsed = ExtractMetadata(document);
            result.Periodo = parsed.Periodo;
            result.NumeroDocumento = parsed.NumeroDocumento;
            result.NombreTrabajador = parsed.NombreTrabajador;

            if (string.IsNullOrWhiteSpace(parsed.Ruc))
            {
                result.Estado = "Error de validacion";
                result.Mensaje = "No se pudo identificar el RUC en el XML.";
                return result;
            }

            if (string.IsNullOrWhiteSpace(parsed.Periodo))
            {
                result.Estado = "Error de validacion";
                result.Mensaje = "No se pudo identificar el periodo en el XML.";
                return result;
            }

            if (string.IsNullOrWhiteSpace(parsed.NumeroDocumento))
            {
                result.Estado = "Error de validacion";
                result.Mensaje = "No se pudo identificar el numero de documento en el XML.";
                return result;
            }

            if (string.IsNullOrWhiteSpace(parsed.NombreTrabajador))
            {
                result.Estado = "Error de validacion";
                result.Mensaje = "No se pudo identificar el nombre del trabajador en el XML.";
                return result;
            }

            var duplicateKey = BuildDuplicateDocumentKey(parsed.Periodo, parsed.NumeroDocumento, ActiveRecordId);
            if (!duplicateDocuments.Add(duplicateKey))
            {
                result.Estado = "Error de validacion";
                result.Mensaje = "El XML esta duplicado dentro de la misma carga por Periodo + NumeroDocumento + IdActivo.";
                return result;
            }

            var duplicateExists = await _planillaBoletaRepository.ExisteBoletaDuplicadaActivaAsync(
                parsed.Periodo,
                parsed.NumeroDocumento,
                ActiveRecordId,
                cancellationToken);

            if (duplicateExists)
            {
                result.Estado = "Error de validacion";
                result.Mensaje = "Ya existe una boleta activa registrada con el mismo Periodo + NumeroDocumento + IdActivo.";
                return result;
            }

            result.Valido = true;
            result.Estado = "Validado";
            result.Mensaje = "XML validado correctamente.";
            return result;
        }
        catch (Exception ex) when (ex is System.Xml.XmlException or InvalidOperationException or IOException)
        {
            result.Estado = "Error de validacion";
            result.Mensaje = ex is System.Xml.XmlException
                ? "El archivo contiene XML mal formado."
                : ex.Message;
            return result;
        }
    }

    private static async Task<string> ReadFileAsTextAsync(PlanillaXmlArchivoDto archivo, CancellationToken cancellationToken)
    {
        await using var stream = new MemoryStream(archivo.Contenido, writable: false);
        using var reader = new StreamReader(stream, Encoding.UTF8, detectEncodingFromByteOrderMarks: true, leaveOpen: false);
        return await reader.ReadToEndAsync(cancellationToken);
    }

    private static ParsedPlanillaMetadata ExtractMetadata(XDocument document)
    {
        var rows = document
            .Descendants()
            .Where(node => string.Equals(node.Name.LocalName, "Row", StringComparison.OrdinalIgnoreCase))
            .Select(row => row
                .Descendants()
                .Where(node => string.Equals(node.Name.LocalName, "Data", StringComparison.OrdinalIgnoreCase))
                .Select(node => NormalizeText(node.Value))
                .Where(value => !string.IsNullOrWhiteSpace(value))
                .ToList())
            .Where(row => row.Count > 0)
            .ToList();

        var flattenedText = string.Join(" ", rows.SelectMany(item => item));
        var documentInfo = ExtractDocumentIdentity(rows);

        var ruc = FindValueByLabel(rows, "ruc", "nro ruc", "numero ruc") ?? RucRegex.Match(flattenedText).Value;
        var periodo = NormalizePeriodo(FindValueByLabel(rows, "periodo", "periodo tributario", "periodo laboral") ?? PeriodoRegex.Match(flattenedText).Value);
        var numeroDocumento = documentInfo.NumeroDocumento;
        var nombreTrabajador = documentInfo.NombreTrabajador;

        if (string.IsNullOrWhiteSpace(numeroDocumento))
        {
            numeroDocumento = FindValueByLabel(rows, "numero documento", "nro documento", "documento", "dni");
        }

        if (string.IsNullOrWhiteSpace(numeroDocumento))
        {
            numeroDocumento = DocumentoRegex.Match(flattenedText).Value;
        }

        if (string.IsNullOrWhiteSpace(nombreTrabajador))
        {
            nombreTrabajador = FindValueByLabel(rows, "nombre trabajador", "apellidos y nombres", "trabajador", "nombres");
        }

        if (string.IsNullOrWhiteSpace(nombreTrabajador))
        {
            nombreTrabajador = rows
                .SelectMany(item => item)
                .FirstOrDefault(value =>
                    value.Contains(' ') &&
                    !DocumentoRegex.IsMatch(value) &&
                    !PeriodoRegex.IsMatch(value) &&
                    !string.Equals(value, ruc, StringComparison.OrdinalIgnoreCase) &&
                    !value.Contains(':'));
        }

        return new ParsedPlanillaMetadata
        {
            Ruc = NormalizeText(ruc),
            Periodo = periodo,
            NumeroDocumento = NormalizeText(numeroDocumento),
            NombreTrabajador = NormalizeText(nombreTrabajador)
        };
    }

    private static string? FindValueByLabel(IReadOnlyList<List<string>> rows, params string[] labels)
    {
        foreach (var row in rows)
        {
            for (var index = 0; index < row.Count; index++)
            {
                var current = NormalizeSearch(row[index]);
                if (!labels.Any(label => current.Contains(NormalizeSearch(label), StringComparison.Ordinal)))
                {
                    continue;
                }

                if (index + 1 < row.Count && !string.IsNullOrWhiteSpace(row[index + 1]))
                {
                    return row[index + 1];
                }

                var inlineParts = row[index].Split(':', 2, StringSplitOptions.TrimEntries);
                if (inlineParts.Length == 2 && !string.IsNullOrWhiteSpace(inlineParts[1]))
                {
                    return inlineParts[1];
                }
            }
        }

        return null;
    }

    private static DocumentIdentityInfo ExtractDocumentIdentity(IReadOnlyList<List<string>> rows)
    {
        foreach (var row in rows)
        {
            var identityFromDataRow = TryExtractIdentityFromDataRow(row);
            if (!string.IsNullOrWhiteSpace(identityFromDataRow.NumeroDocumento) ||
                !string.IsNullOrWhiteSpace(identityFromDataRow.NombreTrabajador))
            {
                return identityFromDataRow;
            }
        }

        for (var rowIndex = 0; rowIndex < rows.Count - 1; rowIndex++)
        {
            var headerRow = rows[rowIndex];
            if (headerRow.Count < 3)
            {
                continue;
            }

            var normalizedHeader = headerRow.Select(NormalizeSearch).ToList();
            var numeroIndex = normalizedHeader.FindIndex(value => value.Contains("numero"));
            var nombreIndex = normalizedHeader.FindIndex(value =>
                value.Contains("nombre y apellidos") ||
                value.Contains("nombres y apellidos") ||
                value.Contains("apellidos y nombres") ||
                value.Contains("nombre trabajador"));

            if (numeroIndex < 0 || nombreIndex < 0)
            {
                continue;
            }

            var valueRow = rows[rowIndex + 1];
            var numeroDocumento = GetCellValue(valueRow, numeroIndex);
            var nombreTrabajador = GetCellValue(valueRow, nombreIndex);

            if (!string.IsNullOrWhiteSpace(numeroDocumento) || !string.IsNullOrWhiteSpace(nombreTrabajador))
            {
                return new DocumentIdentityInfo(
                    NumeroDocumento: NormalizeDocumentValue(numeroDocumento),
                    NombreTrabajador: NormalizeText(nombreTrabajador));
            }
        }

        return new DocumentIdentityInfo(string.Empty, string.Empty);
    }

    private static DocumentIdentityInfo TryExtractIdentityFromDataRow(IReadOnlyList<string> row)
    {
        if (row.Count < 3)
        {
            return new DocumentIdentityInfo(string.Empty, string.Empty);
        }

        for (var index = 0; index < row.Count; index++)
        {
            var current = NormalizeText(row[index]);
            var currentSearch = NormalizeSearch(current);

            if (!IsDocumentTypeToken(currentSearch))
            {
                continue;
            }

            var numeroDocumento = index + 1 < row.Count
                ? NormalizeDocumentValue(row[index + 1])
                : string.Empty;

            if (string.IsNullOrWhiteSpace(numeroDocumento))
            {
                continue;
            }

            var nombreTrabajador = index + 2 < row.Count
                ? NormalizeText(row[index + 2])
                : string.Empty;

            if (LooksLikePersonName(nombreTrabajador))
            {
                return new DocumentIdentityInfo(numeroDocumento, nombreTrabajador);
            }
        }

        return new DocumentIdentityInfo(string.Empty, string.Empty);
    }

    private static string GetCellValue(IReadOnlyList<string> row, int index)
    {
        return index >= 0 && index < row.Count
            ? NormalizeText(row[index])
            : string.Empty;
    }

    private static string NormalizeDocumentValue(string? value)
    {
        var normalized = NormalizeText(value);
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return string.Empty;
        }

        var match = DocumentoRegex.Match(normalized);
        return match.Success ? match.Value : normalized;
    }

    private static bool IsDocumentTypeToken(string value)
    {
        return value is "dni" or "ce" or "c.e." or "pasaporte" or "doc" or "documento";
    }

    private static bool LooksLikePersonName(string? value)
    {
        var normalized = NormalizeText(value);
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return false;
        }

        if (PeriodoRegex.IsMatch(normalized) || DocumentoRegex.IsMatch(normalized))
        {
            return false;
        }

        var normalizedSearch = NormalizeSearch(normalized);
        if (normalizedSearch.Contains("nombre y apellidos") ||
            normalizedSearch.Contains("nombres y apellidos") ||
            normalizedSearch.Contains("apellidos y nombres") ||
            normalizedSearch.Contains("situacion"))
        {
            return false;
        }

        return normalized.Contains(' ');
    }

    private static string NormalizePeriodo(string? value)
    {
        var normalized = NormalizeText(value);
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return string.Empty;
        }

        var match = PeriodoRegex.Match(normalized);
        return match.Success ? match.Value.Replace("/", "-") : normalized;
    }

    private static string NormalizeText(string? value)
    {
        return string.IsNullOrWhiteSpace(value)
            ? string.Empty
            : value.Trim().Replace("\r", " ").Replace("\n", " ");
    }

    private static string NormalizeSearch(string? value)
    {
        return NormalizeText(value).ToLowerInvariant();
    }

    private static string BuildDuplicateDocumentKey(string? periodo, string? numeroDocumento, int idActivo)
    {
        return string.Join(
            "|",
            NormalizePeriodo(periodo),
            NormalizeText(numeroDocumento),
            idActivo.ToString(CultureInfo.InvariantCulture));
    }

    private sealed class ParsedPlanillaMetadata
    {
        public string Ruc { get; set; } = string.Empty;
        public string Periodo { get; set; } = string.Empty;
        public string NumeroDocumento { get; set; } = string.Empty;
        public string NombreTrabajador { get; set; } = string.Empty;
    }

    private sealed record DocumentIdentityInfo(string NumeroDocumento, string NombreTrabajador);

    private sealed record PdfProcessResult(bool Generated, bool Reused, bool Available, string Message);
}
