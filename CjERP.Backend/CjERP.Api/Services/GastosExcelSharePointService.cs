using System.Diagnostics;
using System.Globalization;
using CjERP.Api.Configuration;
using CjERP.Api.Jobs;
using CjERP.Application.DTOs;
using CjERP.Application.Interfaces.Repositories;
using Microsoft.Extensions.Options;

namespace CjERP.Api.Services;

public interface IGastosExcelSharePointService
{
    Task<GastosExcelSharePointExecutionResult> EjecutarAsync(
        string tipoEjecucion,
        string? usuario,
        CancellationToken cancellationToken = default);
}

public sealed record GastosExcelSharePointExecutionResult(
    string TipoEjecucion,
    int CantidadRegistros,
    string Archivo,
    string Tabla,
    string Estado);

/// <summary>
/// Actualiza la tabla de gastos (TBL_GASTOS) del libro GASTOS.xlsx en SharePoint con los gastos de Planilla del
/// cliente/estado configurados. Nunca vacía la tabla si la consulta no devuelve filas.
/// </summary>
public sealed class GastosExcelSharePointService : IGastosExcelSharePointService
{
    private readonly IGastosExcelSharePointRepository _repository;
    private readonly ISharePointExcelTableService _excelTableService;
    private readonly SharePointGastosExcelOptions _options;
    private readonly ILogger<GastosExcelSharePointService> _logger;

    public GastosExcelSharePointService(
        IGastosExcelSharePointRepository repository,
        ISharePointExcelTableService excelTableService,
        IOptions<SharePointOptions> sharePointOptions,
        ILogger<GastosExcelSharePointService> logger)
    {
        _repository = repository;
        _excelTableService = excelTableService;
        _options = sharePointOptions.Value.GastosExcel;
        _logger = logger;
    }

    public async Task<GastosExcelSharePointExecutionResult> EjecutarAsync(
        string tipoEjecucion,
        string? usuario,
        CancellationToken cancellationToken = default)
    {
        var tipo = string.IsNullOrWhiteSpace(tipoEjecucion) ? "AUTOMATICO" : tipoEjecucion.Trim().ToUpperInvariant();
        var config = await _repository.ObtenerConfiguracionAsync(cancellationToken) ?? new GastosExcelSharePointConfigDto();
        var stopwatch = Stopwatch.StartNew();
        var log = new GastosExcelSharePointLogDto
        {
            TipoEjecucion = tipo,
            IdCliente = config.IdCliente,
            EstadoPlanilla = config.EstadoPlanilla,
            Archivo = _options.FileName,
            Tabla = _options.TableName,
            Estado = "INICIADO",
            FechaInicioEjecucion = DateTimeOffset.UtcNow,
            Usuario = usuario,
            Mensaje = "Actualizacion iniciada."
        };
        var logId = await _repository.IniciarLogAsync(log, cancellationToken);

        _logger.LogInformation(
            "Iniciando actualizacion de {Archivo}/{Tabla}. Tipo={Tipo}, IdCliente={IdCliente}, EstadoPlanilla={Estado}, Usuario={Usuario}",
            _options.FileName, _options.TableName, tipo, config.IdCliente, config.EstadoPlanilla, usuario);

        try
        {
            var gastos = await _repository.ObtenerGastosAsync(config.IdCliente, config.EstadoPlanilla, cancellationToken);

            if (gastos.Count == 0)
            {
                // Sin datos no se toca el Excel: limpiar la tabla y no escribir nada dejaría el archivo vacío.
                log.Estado = "SIN_DATOS";
                log.Mensaje = "La consulta devolvio 0 filas; no se modifico el Excel.";
            }
            else
            {
                var zona = AsistenciaSharePointTimeZone.Resolve();
                var actualizacion = TimeZoneInfo.ConvertTime(DateTimeOffset.UtcNow, zona)
                    .ToString("dd/MM/yyyy HH:mm", CultureInfo.InvariantCulture);
                var filas = gastos
                    .Select(g => new object?[]
                    {
                        g.IdSite ?? string.Empty,
                        g.NombreSite ?? string.Empty,
                        g.Anio ?? 0,
                        g.Proyecto ?? string.Empty,
                        g.Cliente ?? string.Empty,
                        g.Trabajo ?? string.Empty,
                        g.Tarea ?? string.Empty,
                        g.TotalGastos ?? 0m,
                        g.Moneda ?? string.Empty,
                        actualizacion
                    })
                    .ToList();

                var resultado = await _excelTableService.ReplaceTableBodyAsync(
                    _options.DocumentLibraryName,
                    _options.FolderPath,
                    _options.FileName,
                    _options.TableName,
                    filas,
                    cancellationToken);

                log.Estado = "COMPLETADO";
                log.Mensaje = $"Tabla {_options.TableName} actualizada en {resultado.StoragePath}: {resultado.RowsWritten} filas.";
            }

            stopwatch.Stop();
            log.CantidadRegistros = gastos.Count;
            log.FechaFinEjecucion = DateTimeOffset.UtcNow;
            log.DuracionSegundos = (int)stopwatch.Elapsed.TotalSeconds;
            await _repository.FinalizarLogAsync(logId, log, CancellationToken.None);

            _logger.LogInformation(
                "Actualizacion de {Archivo}/{Tabla} finalizada. Estado={Estado}, Registros={Registros}",
                _options.FileName, _options.TableName, log.Estado, gastos.Count);

            return new GastosExcelSharePointExecutionResult(tipo, gastos.Count, _options.FileName, _options.TableName, log.Estado);
        }
        catch (Exception ex)
        {
            stopwatch.Stop();
            log.Estado = "ERROR";
            log.FechaFinEjecucion = DateTimeOffset.UtcNow;
            log.DuracionSegundos = (int)stopwatch.Elapsed.TotalSeconds;
            log.Mensaje = "La actualizacion del Excel fallo.";
            log.DetalleError = ex.Message;
            await _repository.FinalizarLogAsync(logId, log, CancellationToken.None);
            _logger.LogError(ex, "Error al actualizar {Archivo}/{Tabla} en SharePoint.", _options.FileName, _options.TableName);
            throw;
        }
    }
}
