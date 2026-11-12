using System.Diagnostics;
using CjERP.Api.Configuration;
using CjERP.Application.DTOs;
using CjERP.Application.Interfaces.Repositories;
using Microsoft.Extensions.Options;

namespace CjERP.Api.Services;

public interface IEmpleadosListaSharePointService
{
    Task<EmpleadosListaSharePointExecutionResult> EjecutarAsync(
        string tipoEjecucion,
        string? usuario,
        CancellationToken cancellationToken = default);
}

public sealed record EmpleadosListaSharePointExecutionResult(
    string TipoEjecucion,
    int CantidadRegistros,
    int Creados,
    int Actualizados,
    int SinCambios,
    string Estado);

/// <summary>
/// Ejecuta dbo.sp_Consultar_EmpleadoSharepoint y sincroniza la lista M_EMPLEADOS de SharePoint: agrega los empleados
/// que no existen y modifica solo los campos distintos. Nunca elimina ni recrea registros, y si el SP no devuelve
/// filas no toca la lista.
/// </summary>
public sealed class EmpleadosListaSharePointService : IEmpleadosListaSharePointService
{
    private readonly IEmpleadosListaSharePointRepository _repository;
    private readonly ISharePointListSyncService _syncService;
    private readonly SharePointEmpleadosListaOptions _options;
    private readonly ILogger<EmpleadosListaSharePointService> _logger;

    public EmpleadosListaSharePointService(
        IEmpleadosListaSharePointRepository repository,
        ISharePointListSyncService syncService,
        IOptions<SharePointOptions> sharePointOptions,
        ILogger<EmpleadosListaSharePointService> logger)
    {
        _repository = repository;
        _syncService = syncService;
        _options = sharePointOptions.Value.EmpleadosLista;
        _logger = logger;
    }

    public async Task<EmpleadosListaSharePointExecutionResult> EjecutarAsync(
        string tipoEjecucion,
        string? usuario,
        CancellationToken cancellationToken = default)
    {
        var tipo = string.IsNullOrWhiteSpace(tipoEjecucion) ? "AUTOMATICO" : tipoEjecucion.Trim().ToUpperInvariant();
        var stopwatch = Stopwatch.StartNew();
        var log = new EmpleadosListaSharePointLogDto
        {
            TipoEjecucion = tipo,
            Lista = _options.ListName,
            Estado = "INICIADO",
            FechaInicioEjecucion = DateTimeOffset.UtcNow,
            Usuario = usuario,
            Mensaje = "Sincronizacion iniciada."
        };
        var logId = await _repository.IniciarLogAsync(log, cancellationToken);
        _logger.LogInformation("Iniciando sincronizacion de la lista {Lista}. Tipo={Tipo}, Usuario={Usuario}", _options.ListName, tipo, usuario);

        try
        {
            var filas = await _repository.ConsultarEmpleadosAsync(cancellationToken);
            log.CantidadRegistros = filas.Count;

            if (filas.Count == 0)
            {
                log.Estado = "SIN_DATOS";
                log.Mensaje = "El SP devolvio 0 filas; no se modifico la lista.";
            }
            else
            {
                var resultado = await _syncService.SincronizarAsync(
                    _options.SitePath, _options.ListName, _options.KeyColumn, _options.SecondaryKeyColumn, _options.ColumnMap, filas, cancellationToken);

                log.CantidadCreados = resultado.Creados;
                log.CantidadActualizados = resultado.Actualizados;
                log.CantidadSinCambios = resultado.SinCambios;
                log.Estado = resultado.Errores > 0 ? "CON_ERRORES" : "COMPLETADO";
                if (resultado.Errores > 0)
                {
                    log.DetalleError = string.Join(Environment.NewLine, resultado.MensajesError);
                }

                log.Mensaje = Truncar(
                    $"Lista {resultado.ListName} (clave {resultado.KeyColumn}): {resultado.Creados} creados, " +
                    $"{resultado.Actualizados} actualizados, {resultado.SinCambios} sin cambios, {resultado.Omitidos} omitidos, " +
                    $"{resultado.Errores} con error." +
                    (resultado.ColumnasIgnoradas.Count > 0
                        ? $" Columnas del SP sin equivalente en la lista: {string.Join(", ", resultado.ColumnasIgnoradas)}."
                        : string.Empty));
            }

            stopwatch.Stop();
            log.FechaFinEjecucion = DateTimeOffset.UtcNow;
            log.DuracionSegundos = (int)stopwatch.Elapsed.TotalSeconds;
            await _repository.FinalizarLogAsync(logId, log, CancellationToken.None);

            _logger.LogInformation("Sincronizacion de {Lista} finalizada. {Mensaje}", _options.ListName, log.Mensaje);
            return new EmpleadosListaSharePointExecutionResult(
                tipo, filas.Count, log.CantidadCreados, log.CantidadActualizados, log.CantidadSinCambios, log.Estado);
        }
        catch (Exception ex)
        {
            stopwatch.Stop();
            log.Estado = "ERROR";
            log.FechaFinEjecucion = DateTimeOffset.UtcNow;
            log.DuracionSegundos = (int)stopwatch.Elapsed.TotalSeconds;
            log.Mensaje = "La sincronizacion de la lista fallo (los cambios ya aplicados se conservan).";
            log.DetalleError = ex.Message;
            await _repository.FinalizarLogAsync(logId, log, CancellationToken.None);
            _logger.LogError(ex, "Error al sincronizar la lista {Lista} en SharePoint.", _options.ListName);
            throw;
        }
    }

    private static string Truncar(string value) => value.Length <= 1000 ? value : value[..997] + "...";
}
