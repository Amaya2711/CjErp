using System.Globalization;
using System.Diagnostics;
using System.Text;
using System.Text.Json;
using CjERP.Api.Configuration;
using CjERP.Api.Jobs;
using CjERP.Application.Interfaces.Repositories;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace CjERP.Api.Services;

public interface IAsistenciaSharePointService
{
    Task<AsistenciaSharePointExecutionResult> EjecutarAsync(
        DateTime fechaInicio,
        DateTime fechaFin,
        string tipoEjecucion,
        string? usuario,
        CancellationToken cancellationToken = default);
}

public sealed record AsistenciaSharePointExecutionResult(
    string TipoEjecucion,
    DateTime FechaInicio,
    DateTime FechaFin,
    int CantidadRegistros,
    string NombreArchivo,
    string RutaSharePoint,
    string Estado,
    bool Reemplazado,
    DateTimeOffset FechaGeneracion);

public sealed class AsistenciaSharePointService : IAsistenciaSharePointService
{
    private const string StoredProcedure = "sp_asistencia_buscarporfechas_job";
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = true
    };

    private readonly IAsistenciaSharePointRepository _repository;
    private readonly ISharePointCommercialUploadService _sharePointUploadService;
    private readonly SharePointOptions _sharePointOptions;
    private readonly ILogger<AsistenciaSharePointService> _logger;

    public AsistenciaSharePointService(
        IAsistenciaSharePointRepository repository,
        ISharePointCommercialUploadService sharePointUploadService,
        IOptions<SharePointOptions> sharePointOptions,
        ILogger<AsistenciaSharePointService> logger)
    {
        _repository = repository;
        _sharePointUploadService = sharePointUploadService;
        _sharePointOptions = sharePointOptions.Value;
        _logger = logger;
    }

    public async Task<AsistenciaSharePointExecutionResult> EjecutarAsync(
        DateTime fechaInicio,
        DateTime fechaFin,
        string tipoEjecucion,
        string? usuario,
        CancellationToken cancellationToken = default)
    {
        var inicio = fechaInicio.Date;
        var fin = fechaFin.Date;
        if (inicio > fin)
        {
            throw new ArgumentException("La fecha de inicio no puede ser mayor que la fecha fin.");
        }

        var zonaPeru = AsistenciaSharePointTimeZone.Resolve();
        var fechaGeneracion = TimeZoneInfo.ConvertTime(DateTimeOffset.UtcNow, zonaPeru);
        var tipo = string.IsNullOrWhiteSpace(tipoEjecucion) ? "AUTOMATICO" : tipoEjecucion.Trim().ToUpperInvariant();
        var nombreArchivo = $"Asistencia_{fin:yyyyMMdd}.json";
        var executionStartedAt = DateTimeOffset.UtcNow;
        var stopwatch = Stopwatch.StartNew();
        var log = new CjERP.Application.DTOs.AsistenciaSharePointLogDto
        {
            TipoEjecucion = tipo,
            FechaInicio = inicio,
            FechaFin = fin,
            NombreArchivo = nombreArchivo,
            Estado = "INICIADO",
            FechaInicioEjecucion = executionStartedAt,
            Usuario = usuario,
            Mensaje = "Exportacion iniciada."
        };
        var logId = await _repository.IniciarLogAsync(log, cancellationToken);

        _logger.LogInformation(
            "Iniciando exportacion de asistencia. Tipo={TipoEjecucion}, FechaInicio={FechaInicio}, FechaFin={FechaFin}, Usuario={Usuario}, Store={StoredProcedure}",
            tipo,
            inicio,
            fin,
            usuario,
            StoredProcedure);

        try
        {
            var rows = await _repository.ObtenerPorFechasAsync(inicio, fin, cancellationToken);
            var payload = new
            {
                fechaGeneracion,
                fechaInicio = inicio.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                fechaFin = fin.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                procedimiento = StoredProcedure,
                origen = "JC_Db",
                tipo = "ASISTENCIA",
                cantidadRegistros = rows.Count,
                datos = rows.Select(row => new
                {
                    idEmpleado = row.IdEmpleado,
                    nombreEmpleado = row.NombreEmpleado,
                    fechaAsistencia = row.FechaAsistencia?.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                    hora = row.Hora?.ToString("HH:mm:ss", CultureInfo.InvariantCulture),
                    horaSalida = row.HoraSalida?.ToString("HH:mm:ss", CultureInfo.InvariantCulture),
                    latitudSalida = row.LatitudSalida,
                    longitudSalida = row.LongitudSalida,
                    idEstado = row.IdEstado,
                    estado = row.Estado
                })
            };

            var json = JsonSerializer.Serialize(payload, JsonOptions);
            var content = Encoding.UTF8.GetBytes(json);
            var upload = await _sharePointUploadService.UploadBytesAsync(
                content,
                nombreArchivo,
                _sharePointOptions.Asistencia.FolderPath,
                "application/json",
                _sharePointOptions.Asistencia.DocumentLibraryName,
                cancellationToken);

            var estado = rows.Count == 0 ? "SIN_DATOS" : "COMPLETADO";
            stopwatch.Stop();
            log.CantidadRegistros = rows.Count;
            log.Estado = estado;
            log.FechaFinEjecucion = DateTimeOffset.UtcNow;
            log.DuracionSegundos = (int)stopwatch.Elapsed.TotalSeconds;
            log.NombreArchivo = upload.FileName;
            log.Mensaje = $"Archivo cargado en {upload.StoragePath}.";
            await _repository.FinalizarLogAsync(logId, log, cancellationToken);

            _logger.LogInformation(
                "Exportacion de asistencia completada. Tipo={TipoEjecucion}, Registros={CantidadRegistros}, Archivo={NombreArchivo}, Ruta={RutaSharePoint}, Estado={Estado}",
                tipo,
                rows.Count,
                upload.FileName,
                upload.StoragePath,
                estado);

            return new AsistenciaSharePointExecutionResult(
                tipo,
                inicio,
                fin,
                rows.Count,
                upload.FileName,
                upload.StoragePath,
                estado,
                true,
                fechaGeneracion);
        }
        catch (Exception ex)
        {
            stopwatch.Stop();
            log.Estado = "ERROR";
            log.FechaFinEjecucion = DateTimeOffset.UtcNow;
            log.DuracionSegundos = (int)stopwatch.Elapsed.TotalSeconds;
            log.Mensaje = "La exportacion fallo.";
            log.DetalleError = ex.Message;
            await _repository.FinalizarLogAsync(logId, log, CancellationToken.None);
            _logger.LogError(ex, "Error en la exportacion de asistencia a SharePoint.");
            throw;
        }
    }

}
