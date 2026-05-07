using System.Data;
using System.Globalization;
using CjERP.Application.DTOs;
using CjERP.Application.Interfaces.Services;
using Dapper;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;

namespace CjERP.Infrastructure.Services;

public class AsistenciaReporteService : IAsistenciaReporteService
{
    private const string ReporteSp = "dbo.RptAsistenciaFechas";
    private readonly IConfiguration _configuration;

    public AsistenciaReporteService(IConfiguration configuration)
    {
        _configuration = configuration;
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

    private static string? NullIfWhiteSpace(string? value)
    {
        return string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    }

    private static AsistenciaReporteDto MapRow(dynamic row)
    {
        var values = (IDictionary<string, object?>)row;

        return new AsistenciaReporteDto
        {
            Fecha = GetDateString(values, "Fecha", "fecha"),
            Hora = GetTimeString(values, "Hora", "hora", "Fecha", "fecha", "HoraEntrada", "horaEntrada"),
            NombreEmpleado = GetString(values, "nombreempleado", "NombreEmpleado", "nombreEmpleado"),
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
