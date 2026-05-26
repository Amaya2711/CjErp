using System.Data;
using System.Globalization;
using CjERP.Application.DTOs;
using CjERP.Application.DTOs.ReportesWhatsapp;
using CjERP.Application.Interfaces.Services;
using Dapper;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;

namespace CjERP.Infrastructure.Services;

public class AsistenciaReporteService : IAsistenciaReporteService
{
    private const string ReporteSp = "dbo.RptAsistenciaFechas";
    private readonly IConfiguration _configuration;
    private readonly IReportePdfService _reportePdfService;

    public AsistenciaReporteService(IConfiguration configuration, IReportePdfService reportePdfService)
    {
        _configuration = configuration;
        _reportePdfService = reportePdfService;
    }

    public async Task<IEnumerable<AsistenciaReporteDto>> BuscarAsync(
        AsistenciaReporteRequestDto request,
        CancellationToken cancellationToken = default)
    {
        var rows = await QueryReporteRowsAsync(request.FechaInicio, request.FechaFin, cancellationToken);

        return rows.Select(MapRow).ToList();
    }

    public async Task<byte[]> GenerarPdfGerencialAsync(
        AsistenciaReportePdfRequestDto request,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();

        var rows = await QueryReporteRowsAsync(request.FechaInicio, request.FechaFin, cancellationToken);

        var detalle = rows
            .Select(MapPdfRow)
            .ToList();

        var periodo = new ReporteWhatsappPeriodoDto
        {
            FechaInicio = request.FechaInicio?.Trim() ?? string.Empty,
            FechaFin = request.FechaFin?.Trim() ?? string.Empty,
            FechaProceso = ResolveFechaProceso(request.FechaFin),
            EtiquetaPeriodo = $"{request.FechaInicio?.Trim()} - {request.FechaFin?.Trim()}"
        };

        var destinatario = new ReporteWhatsappEmpleadoDto
        {
            IdEmpleado = 0,
            NombreEmpleado = string.IsNullOrWhiteSpace(request.Destinatario) ? "Reporte x Empleado" : request.Destinatario.Trim()
        };

        return await _reportePdfService.GenerarReportePdfAsync(
            ReporteWhatsappTipos.Gerencial,
            destinatario,
            periodo,
            detalle,
            cancellationToken);
    }

    private async Task<IEnumerable<dynamic>> QueryReporteRowsAsync(
        string? fechaInicio,
        string? fechaFin,
        CancellationToken cancellationToken)
    {
        using var connection = new SqlConnection(_configuration.GetConnectionString("DefaultConnection"));

        var parameters = new DynamicParameters();
        parameters.Add("@FechaInicio", NullIfWhiteSpace(fechaInicio), DbType.String);
        parameters.Add("@FechaFin", NullIfWhiteSpace(fechaFin), DbType.String);

        return await connection.QueryAsync(
            new CommandDefinition(
                ReporteSp,
                parameters,
                commandType: CommandType.StoredProcedure,
                cancellationToken: cancellationToken));
    }

    private static string? NullIfWhiteSpace(string? value)
    {
        return string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    }

    private static DateTime ResolveFechaProceso(string? fechaFin)
    {
        if (DateTime.TryParse(fechaFin?.Trim(), CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsed))
        {
            return parsed.Date;
        }

        var parts = fechaFin?.Split('/', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (parts?.Length == 3 &&
            int.TryParse(parts[0], out var day) &&
            int.TryParse(parts[1], out var month) &&
            int.TryParse(parts[2], out var year))
        {
            return new DateTime(year, month, day);
        }

        return DateTime.Today;
    }

    private static AsistenciaReporteDto MapRow(dynamic row)
    {
        var values = (IDictionary<string, object?>)row;

        return new AsistenciaReporteDto
        {
            Fecha = GetDateString(values, "Fecha", "fecha"),
            Hora = GetTimeString(values, "Hora", "hora", "Fecha", "fecha", "HoraEntrada", "horaEntrada"),
            NombreEmpleado = GetString(values, "nombreempleado", "NombreEmpleado", "nombreEmpleado"),
            TipoAprobacion = GetString(values, "TipoAprobacion", "tipoAprobacion", "tipo_aprobacion"),
            Responsable = GetString(values, "Responsable", "responsable"),
            Estado = GetString(values, "Estado", "estado"),
            Comentario = GetString(values, "Comentario", "comentario"),
            Observacion = GetString(values, "Observacion", "observacion", "Comentario", "comentario"),
            Empresa = GetString(values, "empresa", "Empresa"),
            Cliente = GetString(values, "Cliente", "cliente"),
            Proyecto = GetString(values, "Proyecto", "proyecto", "NombreProyecto", "nombreProyecto"),
            Site = GetString(values, "Site", "site", "NombreSite", "nombreSite"),
            Area = GetString(values, "Area", "area"),
            Ubicacion = GetString(values, "Ubicacion", "ubicacion"),
            IdEmpleado = GetInt(values, "IdEmpleado", "idEmpleado"),
            EstadoAct = GetString(values, "EstadoAct", "estadoAct"),
            Sexo = GetString(values, "Sexo", "sexo"),
            FechaIniLaboral = GetDateString(values, "FechaIniLaboral", "fechaIniLaboral"),
            FechaFinLaboral = GetDateString(values, "FechaFinlaboral", "FechaFinLaboral", "fechaFinLaboral"),
            Salida = GetTimeString(values, "Salida", "salida", "HoraSalida", "horaSalida"),
            EstadoMarcacionTexto = GetString(values, "EstadoMarcacionTexto", "estadoMarcacionTexto"),
            TiempoTrabajado = GetString(values, "TiempoTrabajado", "tiempoTrabajado"),
            TotalHoras = GetDecimal(values, "TotalHoras", "totalHoras"),
            TotalHorasEmpleado = GetDecimal(values, "TotalHorasEmpleado", "totalHorasEmpleado", "HorasLaboradas", "horasLaboradas"),
            TotalHorasLaborales = GetDecimal(values, "TotalHorasLaborales", "totalHorasLaborales"),
            TotalHorasFaltaAprobar = GetDecimal(values, "TotalHorasFaltaAprobar", "totalHorasFaltaAprobar"),
            EstadoValidacionHoras = GetString(values, "EstadoValidacionHoras", "estadoValidacionHoras", "Estadovalidacionhoras", "estadovalidacionhoras"),
            TiempoHoras = GetString(values, "TiempoHoras", "tiempoHoras"),
            OrigenMarcacion = GetString(values, "OrigenMarcacion", "origenMarcacion")
        };
    }

    private static ReporteWhatsappAsistenciaItemDto MapPdfRow(dynamic row)
    {
        var values = (IDictionary<string, object?>)row;

        return new ReporteWhatsappAsistenciaItemDto
        {
            IdEmpleado = GetInt(values, "IdEmpleado", "idEmpleado") ?? 0,
            Fecha = GetDateDisplayString(values, "Fecha", "fecha"),
            NombreEmpleado = GetString(values, "nombreempleado", "NombreEmpleado", "nombreEmpleado"),
            Responsable = GetString(values, "Responsable", "responsable"),
            Estado = GetString(values, "Estado", "estado"),
            EstadoMarcacionTexto = GetString(values, "EstadoMarcacionTexto", "estadoMarcacionTexto", "Estado", "estado"),
            Ubicacion = GetString(values, "Ubicacion", "ubicacion"),
            HoraEntrada = GetTimeString(values, "Hora", "hora", "HoraEntrada", "horaEntrada"),
            HoraSalida = GetTimeString(values, "Salida", "salida", "HoraSalida", "horaSalida"),
            TiempoHoras = GetString(values, "TiempoHoras", "tiempoHoras"),
            TotalHoras = GetDecimal(values, "TotalHoras", "totalHoras"),
            TotalHorasFaltaIncompleto = GetDecimal(values, "TotalHorasFaltaIncompleto", "totalHorasFaltaIncompleto", "HrsOtrosEmpleado", "hrsOtrosEmpleado", "HrsOtros", "hrsOtros", "ValorNuevoEstado", "valorNuevoEstado"),
            TotalHorasEmpleado = GetDecimal(values, "TotalHorasEmpleado", "totalHorasEmpleado"),
            TotalHorasLaborales = GetDecimal(values, "TotalHorasLaborales", "totalHorasLaborales"),
            TotalHorasFaltaAprobar = GetDecimal(values, "TotalHorasFaltaAprobar", "totalHorasFaltaAprobar"),
            DiferenciaHoras = GetDecimal(values, "DiferenciaHoras", "diferenciaHoras"),
            EstadoValidacionHoras = GetString(values, "EstadoValidacionHoras", "estadoValidacionHoras", "Estadovalidacionhoras", "estadovalidacionhoras"),
            Observacion = GetString(values, "Observacion", "observacion", "Comentario", "comentario")
        };
    }

    private static string GetDateString(IDictionary<string, object?> values, params string[] keys)
    {
        foreach (var key in keys)
        {
            if (!TryGetValue(values, key, out var value) || value is null || value is DBNull)
            {
                continue;
            }

            if (value is DateTime dateTime)
            {
                return dateTime.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
            }

            if (value is DateTimeOffset dateTimeOffset)
            {
                return dateTimeOffset.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
            }

            var text = Convert.ToString(value, CultureInfo.InvariantCulture)?.Trim();
            if (string.IsNullOrWhiteSpace(text))
            {
                continue;
            }

            if (DateTime.TryParse(text, CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsedDate))
            {
                return parsedDate.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
            }

            return text;
        }

        return string.Empty;
    }

    private static string GetDateDisplayString(IDictionary<string, object?> values, params string[] keys)
    {
        foreach (var key in keys)
        {
            if (!TryGetValue(values, key, out var value) || value is null || value is DBNull)
            {
                continue;
            }

            if (value is DateTime dateTime)
            {
                return dateTime.ToString("dd/MM/yyyy", CultureInfo.InvariantCulture);
            }

            if (value is DateTimeOffset dateTimeOffset)
            {
                return dateTimeOffset.ToString("dd/MM/yyyy", CultureInfo.InvariantCulture);
            }

            var text = Convert.ToString(value, CultureInfo.InvariantCulture)?.Trim();
            if (string.IsNullOrWhiteSpace(text))
            {
                continue;
            }

            if (DateTime.TryParse(text, CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsedDate))
            {
                return parsedDate.ToString("dd/MM/yyyy", CultureInfo.InvariantCulture);
            }

            return text;
        }

        return string.Empty;
    }

    private static string GetTimeString(IDictionary<string, object?> values, params string[] keys)
    {
        foreach (var key in keys)
        {
            if (!TryGetValue(values, key, out var value) || value is null || value is DBNull)
            {
                continue;
            }

            var formatted = FormatTimeValue(value);
            if (!string.IsNullOrWhiteSpace(formatted) && formatted != "00:00:00")
            {
                return formatted;
            }
        }

        return string.Empty;
    }

    private static string FormatTimeValue(object value)
    {
        if (value is DateTime dateTime)
        {
            if (dateTime.Year == 1900 && dateTime.Month == 1 && dateTime.Day == 1 && dateTime.TimeOfDay == TimeSpan.Zero)
            {
                return string.Empty;
            }

            return dateTime.ToString("HH:mm:ss", CultureInfo.InvariantCulture);
        }

        if (value is DateTimeOffset dateTimeOffset)
        {
            return dateTimeOffset.ToString("HH:mm:ss", CultureInfo.InvariantCulture);
        }

        if (value is TimeSpan timeSpan)
        {
            return timeSpan.ToString(@"hh\:mm\:ss", CultureInfo.InvariantCulture);
        }

        var text = Convert.ToString(value, CultureInfo.InvariantCulture)?.Trim();
        if (string.IsNullOrWhiteSpace(text))
        {
            return string.Empty;
        }

        if (DateTime.TryParse(text, CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsedDateTime))
        {
            if (parsedDateTime.Year == 1900 && parsedDateTime.Month == 1 && parsedDateTime.Day == 1 && parsedDateTime.TimeOfDay == TimeSpan.Zero)
            {
                return string.Empty;
            }

            return parsedDateTime.ToString("HH:mm:ss", CultureInfo.InvariantCulture);
        }

        if (TimeSpan.TryParse(text, CultureInfo.InvariantCulture, out var parsedTimeSpan))
        {
            return parsedTimeSpan.ToString(@"hh\:mm\:ss", CultureInfo.InvariantCulture);
        }

        return text;
    }

    private static string GetString(IDictionary<string, object?> values, params string[] keys)
    {
        foreach (var key in keys)
        {
            if (!TryGetValue(values, key, out var value) || value is null || value is DBNull)
            {
                continue;
            }

            if (value is DateTime dateTime)
            {
                return dateTime.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
            }

            if (value is DateTimeOffset dateTimeOffset)
            {
                return dateTimeOffset.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
            }

            if (value is TimeSpan timeSpan)
            {
                return timeSpan.ToString(@"hh\:mm\:ss", CultureInfo.InvariantCulture);
            }

            return Convert.ToString(value, CultureInfo.InvariantCulture)?.Trim() ?? string.Empty;
        }

        return string.Empty;
    }

    private static int? GetInt(IDictionary<string, object?> values, params string[] keys)
    {
        foreach (var key in keys)
        {
            if (!TryGetValue(values, key, out var value) || value is null || value is DBNull)
            {
                continue;
            }

            if (value is int number)
            {
                return number;
            }

            if (int.TryParse(Convert.ToString(value, CultureInfo.InvariantCulture), out var parsed))
            {
                return parsed;
            }
        }

        return null;
    }

    private static decimal GetDecimal(IDictionary<string, object?> values, params string[] keys)
    {
        foreach (var key in keys)
        {
            if (!TryGetValue(values, key, out var value) || value is null || value is DBNull)
            {
                continue;
            }

            if (value is decimal decimalValue)
            {
                return decimalValue;
            }

            if (decimal.TryParse(Convert.ToString(value, CultureInfo.InvariantCulture), NumberStyles.Any, CultureInfo.InvariantCulture, out var parsed))
            {
                return parsed;
            }
        }

        return 0m;
    }

    private static bool TryGetValue(IDictionary<string, object?> values, string key, out object? value)
    {
        if (values.TryGetValue(key, out value))
        {
            return true;
        }

        var match = values.Keys.FirstOrDefault(existingKey =>
            string.Equals(existingKey, key, StringComparison.OrdinalIgnoreCase));

        if (match is not null && values.TryGetValue(match, out value))
        {
            return true;
        }

        value = null;
        return false;
    }
}
