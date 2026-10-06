using System.Data;
using System.Text;
using CjERP.Application.DTOs;
using CjERP.Application.Interfaces.Services;
using CjERP.Infrastructure.Persistence.Sql;
using Dapper;

namespace CjERP.Infrastructure.Services;

public sealed class EmpleadoResponsableService : IEmpleadoResponsableService
{
    private const string BuscarSp = "dbo.sp_EmpleadoResponsable_Buscar";
    private const string InsertarSp = "dbo.sp_EmpleadoResponsable_Insertar";
    private readonly ISqlCommandFactory _sqlCommandFactory;

    public EmpleadoResponsableService(ISqlCommandFactory sqlCommandFactory)
    {
        _sqlCommandFactory = sqlCommandFactory;
    }

    public async Task<IReadOnlyList<EmpleadoResponsableBuscarDto>> BuscarAsync(
        string nombreEmpleado,
        CancellationToken cancellationToken = default)
    {
        await using var connection = _sqlCommandFactory.CreateConnection();
        var terms = nombreEmpleado
            .Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();

        var candidates = new List<EmpleadoResponsableBuscarDto>();
        foreach (var term in terms)
        {
            var data = await connection.QueryAsync<EmpleadoResponsableBuscarDto>(
                _sqlCommandFactory.Create(
                    BuscarSp,
                    new { NombreEmpleado = term },
                    CommandType.StoredProcedure,
                    cancellationToken));
            candidates.AddRange(data);
        }

        return candidates
            .Where(item => terms.All(term => NombreResultado(item).Contains(term, StringComparison.OrdinalIgnoreCase)))
            .GroupBy(item => item.IdEmpleado is > 0 ? $"id:{item.IdEmpleado}" : NombreResultado(item), StringComparer.OrdinalIgnoreCase)
            .Select(group => group.First())
            .OrderBy(NombreResultado, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    private static string NombreResultado(EmpleadoResponsableBuscarDto item) =>
        !string.IsNullOrWhiteSpace(item.NombreEmpleado) ? item.NombreEmpleado.Trim() : item.Nombre.Trim();

    public async Task InsertarAsync(
        EmpleadoResponsableInsertarRequestDto request,
        CancellationToken cancellationToken = default)
    {
        await using var connection = _sqlCommandFactory.CreateConnection();
        var parameters = (await connection.QueryAsync<StoredProcedureParameter>(
            _sqlCommandFactory.Create(
                """
                SELECT
                    p.name AS Name,
                    p.is_output AS IsOutput,
                    p.has_default_value AS HasDefaultValue
                FROM sys.parameters p
                WHERE p.object_id = OBJECT_ID(@ProcedureName, 'P')
                ORDER BY p.parameter_id;
                """,
                new { ProcedureName = InsertarSp },
                CommandType.Text,
                cancellationToken))).ToList();

        if (parameters.Count == 0)
        {
            throw new InvalidOperationException("No se encontró el store sp_EmpleadoResponsable_Insertar en la base de datos.");
        }

        var dynamicParameters = new DynamicParameters();
        var unsupportedRequiredParameters = new List<string>();

        foreach (var parameter in parameters.Where(parameter => !parameter.IsOutput))
        {
            var value = GetParameterValue(parameter.Name, request);

            if (value is null)
            {
                if (!parameter.HasDefaultValue)
                {
                    unsupportedRequiredParameters.Add(parameter.Name);
                }

                continue;
            }

            dynamicParameters.Add(parameter.Name, value);
        }

        if (unsupportedRequiredParameters.Count > 0)
        {
            throw new InvalidOperationException(
                "El store sp_EmpleadoResponsable_Insertar requiere parámetros no contemplados por el formulario: " +
                string.Join(", ", unsupportedRequiredParameters) + ".");
        }

        await connection.ExecuteAsync(
            _sqlCommandFactory.Create(
                InsertarSp,
                dynamicParameters,
                CommandType.StoredProcedure,
                cancellationToken));
    }

    private static string? GetParameterValue(
        string parameterName,
        EmpleadoResponsableInsertarRequestDto request)
    {
        var normalizedName = NormalizeParameterName(parameterName);

        return normalizedName switch
        {
            "nombre" or "nombreresponsable" or "responsable" or "nombreempleado" or "nomempleado"
                => request.Nombre,
            "cuenta" or "nrocuenta" or "numerocuenta" or "cuentabancaria"
                => request.Cuenta,
            "cuentainter" or "ctainter" or "cuentainterbancaria" or "ctainterbancaria"
                => request.CuentaInter,
            "tipocuenta" or "tipocta" or "tipodecuenta"
                => request.TipoCuenta,
            "banco" or "nombrebanco"
                => request.Banco,
            "nrodocumento" or "numerodocumento" or "documento" or "nrodoc"
                => request.NroDocumento,
            "usuario" or "usuarioaccion" or "usuarioregistro" or "usuariocrea"
                => request.UsuarioAccion,
            _ => null
        };
    }

    private static string NormalizeParameterName(string parameterName)
    {
        var builder = new StringBuilder(parameterName.Length);

        foreach (var character in parameterName.Trim().TrimStart('@').Normalize(NormalizationForm.FormD))
        {
            if (System.Globalization.CharUnicodeInfo.GetUnicodeCategory(character) == System.Globalization.UnicodeCategory.NonSpacingMark)
            {
                continue;
            }

            if (char.IsLetterOrDigit(character))
            {
                builder.Append(char.ToLowerInvariant(character));
            }
        }

        return builder.ToString();
    }

    private sealed class StoredProcedureParameter
    {
        public string Name { get; set; } = string.Empty;
        public bool IsOutput { get; set; }
        public bool HasDefaultValue { get; set; }
    }
}
