using System.Data;
using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;

namespace CjERP.Api.Controllers;

[ApiController]
[Route("api/empleado/ficha")]
[Authorize]
public class EmpleadoFichaController : ControllerBase
{
    private const string StoredProcedureName = "dbo.sp_EmpleadoCj_Ficha";
    private static readonly string[] CandidateParameterNames =
    [
        "IdEmpleado",
        "idEmpleado",
        "IdEmpleadoCj",
        "idEmpleadoCj",
        "CodEmp",
        "codEmp",
        "NombreEmpleado",
        "nombreEmpleado"
    ];

    private readonly IConfiguration _configuration;

    public EmpleadoFichaController(IConfiguration configuration)
    {
        _configuration = configuration;
    }

    [HttpGet]
    public async Task<IActionResult> Obtener(
        [FromQuery] int? idEmpleado,
        [FromQuery] string? nombreEmpleado,
        CancellationToken cancellationToken)
    {
        var normalizedNombreEmpleado = string.IsNullOrWhiteSpace(nombreEmpleado)
            ? string.Empty
            : nombreEmpleado.Trim();

        var connectionString = _configuration.GetConnectionString("DefaultConnection");
        if (string.IsNullOrWhiteSpace(connectionString))
        {
            return StatusCode(StatusCodes.Status500InternalServerError, new
            {
                success = false,
                message = "La cadena de conexion no esta configurada."
            });
        }

        await using var connection = new SqlConnection(connectionString);

        var existingProcedure = await connection.ExecuteScalarAsync<int?>(
            new CommandDefinition(
                @"
SELECT OBJECT_ID(@StoredProcedureName)
",
                new { StoredProcedureName = StoredProcedureName },
                cancellationToken: cancellationToken));

        if (!existingProcedure.HasValue)
        {
            return NotFound(new
            {
                success = false,
                message = $"No se encontro el store {StoredProcedureName}."
            });
        }

        var parameterNames = (await connection.QueryAsync<string>(
            new CommandDefinition(
                @"
SELECT p.name
FROM sys.parameters p
WHERE p.object_id = @ObjectId
ORDER BY p.parameter_id
",
                new { ObjectId = existingProcedure.Value },
                cancellationToken: cancellationToken)))
            .Select(value => value.Trim())
            .Where(value => !string.IsNullOrWhiteSpace(value))
            .ToList();

        var commandParameters = BuildParameters(parameterNames, idEmpleado, normalizedNombreEmpleado);

        var rows = (await connection.QueryAsync(
            new CommandDefinition(
                StoredProcedureName,
                commandParameters,
                commandType: CommandType.StoredProcedure,
                cancellationToken: cancellationToken)))
            .Select(MapRow)
            .ToList();

        var columns = rows
            .SelectMany(row => row.Keys)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        return Ok(new
        {
            success = true,
            message = "Ficha de empleado obtenida correctamente.",
            data = new
            {
                rows,
                columns,
                totalRows = rows.Count
            }
        });
    }

    private static DynamicParameters BuildParameters(
        IReadOnlyCollection<string> parameterNames,
        int? idEmpleado,
        string nombreEmpleado)
    {
        var parameters = new DynamicParameters();

        if (parameterNames.Count == 0)
        {
            return parameters;
        }

        if ((idEmpleado is null or <= 0) && string.IsNullOrWhiteSpace(nombreEmpleado))
        {
            return parameters;
        }

        var resolvedParameterName = ResolveParameterName(parameterNames, idEmpleado, nombreEmpleado);
        if (string.IsNullOrWhiteSpace(resolvedParameterName))
        {
            throw new InvalidOperationException(
                $"No se pudo determinar el parametro de entrada para {StoredProcedureName}.");
        }

        if (!string.IsNullOrWhiteSpace(nombreEmpleado))
        {
            parameters.Add(resolvedParameterName, nombreEmpleado, DbType.String);
        }
        else if (idEmpleado.HasValue && idEmpleado.Value > 0)
        {
            parameters.Add(resolvedParameterName, idEmpleado.Value, DbType.Int32);
        }

        return parameters;
    }

    private static string? ResolveParameterName(
        IEnumerable<string> parameterNames,
        int? idEmpleado,
        string nombreEmpleado)
    {
        var normalizedNames = parameterNames
            .Select(name => NormalizeParameterName(name))
            .Where(name => !string.IsNullOrWhiteSpace(name))
            .ToList();

        var preferredCandidates = !string.IsNullOrWhiteSpace(nombreEmpleado)
            ? new[] { "NombreEmpleado", "nombreEmpleado" }
            : idEmpleado.HasValue && idEmpleado.Value > 0
                ? new[] { "IdEmpleado", "idEmpleado", "IdEmpleadoCj", "idEmpleadoCj", "CodEmp", "codEmp" }
                : [];

        foreach (var candidate in preferredCandidates.Concat(CandidateParameterNames))
        {
            if (normalizedNames.Contains(NormalizeParameterName(candidate), StringComparer.OrdinalIgnoreCase))
            {
                return candidate.StartsWith("@", StringComparison.Ordinal) ? candidate : "@" + candidate;
            }
        }

        if (parameterNames.Count() == 1)
        {
            var singleName = parameterNames.First().Trim();
            return singleName.StartsWith("@", StringComparison.Ordinal) ? singleName : "@" + singleName;
        }

        return null;
    }

    private static string NormalizeParameterName(string value)
    {
        return value.Trim().TrimStart('@');
    }

    private static Dictionary<string, object?> MapRow(dynamic row)
    {
        var data = (IDictionary<string, object>)row;
        var result = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);

        foreach (var item in data)
        {
            if (string.IsNullOrWhiteSpace(item.Key))
            {
                continue;
            }

            result[item.Key] = NormalizeValue(item.Value);
        }

        return result;
    }

    private static object? NormalizeValue(object? value)
    {
        if (value is null || value == DBNull.Value)
        {
            return null;
        }

        return value switch
        {
            DateTime dateValue => dateValue.ToString("yyyy-MM-dd HH:mm:ss"),
            DateTimeOffset dateOffsetValue => dateOffsetValue.ToString("yyyy-MM-dd HH:mm:ss"),
            _ => value
        };
    }
}
