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
        using var connection = new SqlConnection(_configuration.GetConnectionString("DefaultConnection"));

        var parameters = new DynamicParameters();
        parameters.Add("@FechaInicio", NullIfWhiteSpace(request.FechaInicio), DbType.String);
        parameters.Add("@FechaFin", NullIfWhiteSpace(request.FechaFin), DbType.String);

        var rows = await connection.QueryAsync(
            new CommandDefinition(
                ReporteSp,
                parameters,
                commandType: CommandType.StoredProcedure,
                cancellationToken: cancellationToken));

        return rows.Select(MapRow).ToList();
    }

    public async Task<byte[]> GenerarPdfGerencialAsync(
        AsistenciaReportePdfRequestDto request,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();

        var detalle = request.Items
            .Select(item => new ReporteWhatsappAsistenciaItemDto
            {
                IdEmpleado = item.IdEmpleado ?? 0,
                Fecha = NormalizePdfDate(item.Fecha),
                NombreEmpleado = item.NombreEmpleado?.Trim() ?? string.Empty,
                EstadoMarcacionTexto = string.IsNullOrWhiteSpace(item.EstadoMarcacionTexto) ? "SIN CLASIFICAR" : item.EstadoMarcacionTexto.Trim(),
                Ubicacion = item.Ubicacion?.Trim() ?? string.Empty,
                HoraEntrada = NormalizeTime(item.Hora),
                HoraSalida = NormalizeTime(item.Salida),
                TiempoHoras = string.Empty,
                TotalHoras = item.TotalHoras,
                TotalHorasEmpleado = item.TotalHorasEmpleado != 0m ? item.TotalHorasEmpleado : item.TotalHoras,
                TotalHorasLaborales = item.TotalHorasLaborales,
                DiferenciaHoras = item.TotalHoras - item.TotalHorasLaborales,
                EstadoValidacionHoras = string.IsNullOrWhiteSpace(item.EstadoValidacionHoras)
                    ? (item.TotalHoras - item.TotalHorasLaborales >= 0m ? "COMPLETO" : "REVISAR")
                    : item.EstadoValidacionHoras.Trim()
            })
            .Where(item => item.IdEmpleado > 0 && !string.IsNullOrWhiteSpace(item.NombreEmpleado))
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

    private static string? NullIfWhiteSpace(string? value)
    {
        return string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    }

    private static string NormalizePdfDate(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return string.Empty;
        }

        var trimmed = value.Trim();
        if (trimmed.Contains('/'))
        {
            return trimmed;
        }

        if (DateTime.TryParse(trimmed, CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsed))
        {
            return parsed.ToString("dd/MM/yyyy", CultureInfo.InvariantCulture);
        }

        var parts = trimmed.Split('-', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        return parts.Length == 3
            ? $"{parts[2]}/{parts[1]}/{parts[0]}"
            : trimmed;
    }

    private static string NormalizeTime(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return string.Empty;
        }

        if (TimeSpan.TryParse(value.Trim(), CultureInfo.InvariantCulture, out var time))
        {
            return time.ToString(@"hh\:mm\:ss", CultureInfo.InvariantCulture);
        }

        return value.Trim();
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
            Responsable = GetString(values, "Responsable", "responsable"),
            Estado = GetString(values, "Estado", "estado"),
            Comentario = GetString(values, "Comentario", "comentario"),
            Empresa = GetString(values, "empresa", "Empresa"),
            Cliente = GetString(values, "Cliente", "cliente"),
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
            TotalHorasLaborales = GetDecimal(values, "TotalHorasLaborales", "totalHorasLaborales"),
            EstadoValidacionHoras = GetString(values, "EstadoValidacionHoras", "estadoValidacionHoras", "Estadovalidacionhoras", "estadovalidacionhoras"),
            TiempoHoras = GetString(values, "TiempoHoras", "tiempoHoras"),
            OrigenMarcacion = GetString(values, "OrigenMarcacion", "origenMarcacion")
        };
    }

    private static string GetDateString(IDictionary<string, object?> values, params string[] keys)
    {
        foreach (var key in keys)
        {
            if (!values.TryGetValue(key, out var value) || value is null || value is DBNull)
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

    private static string GetTimeString(IDictionary<string, object?> values, params string[] keys)
    {
        foreach (var key in keys)
        {
            if (!values.TryGetValue(key, out var value) || value is null || value is DBNull)
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
            if (!values.TryGetValue(key, out var value) || value is null || value is DBNull)
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
            if (!values.TryGetValue(key, out var value) || value is null || value is DBNull)
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
            if (!values.TryGetValue(key, out var value) || value is null || value is DBNull)
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
}
