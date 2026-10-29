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
    private const string ActualizarSp = "dbo.sp_EmpleadoResponsable_Actualizar";
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
        var buscarTodos = string.IsNullOrWhiteSpace(nombreEmpleado);
        var terms = nombreEmpleado
            .Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();

        var candidates = new List<EmpleadoResponsableBuscarDto>();
        if (buscarTodos)
        {
            var data = await connection.QueryAsync<EmpleadoResponsableBuscarDto>(
                _sqlCommandFactory.Create(
                    BuscarSp,
                    null,
                    CommandType.StoredProcedure,
                    cancellationToken));
            candidates.AddRange(data);
        }
        else
        {
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
        }

        return candidates
            // El SP vigente devuelve CE.NombreCta con el alias TipoCuenta.
            // Normalizamos el contrato antes de exponerlo para que los consumidores
            // reciban NombreCta y TipoCuenta, junto a los cÃ³digos IdEmpleado/IdBanco.
            .Select(NormalizarDatosCuenta)
            .Where(item => buscarTodos || terms.All(term => NombreResultado(item).Contains(term, StringComparison.OrdinalIgnoreCase)))
            // Un responsable puede tener varias cuentas. Conservamos cada combinación
            // para permitir su mantenimiento individual.
            .GroupBy(item => $"{item.IdEmpleado}:{item.IdBanco}:{item.Cuenta}:{NombreCuentaResultado(item)}", StringComparer.OrdinalIgnoreCase)
            .Select(group => group.First())
            .OrderBy(NombreResultado, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    private static string NombreResultado(EmpleadoResponsableBuscarDto item) =>
        !string.IsNullOrWhiteSpace(item.NombreEmpleado) ? item.NombreEmpleado.Trim() : item.Nombre.Trim();

    private static string NombreCuentaResultado(EmpleadoResponsableBuscarDto item) =>
        !string.IsNullOrWhiteSpace(item.NombreCta) ? item.NombreCta.Trim() : item.TipoCuenta.Trim();

    private static EmpleadoResponsableBuscarDto NormalizarDatosCuenta(EmpleadoResponsableBuscarDto item)
    {
        var tipoCuenta = NombreCuentaResultado(item);
        item.NombreCta = tipoCuenta;
        item.TipoCuenta = tipoCuenta;
        return item;
    }

    public async Task InsertarAsync(
        EmpleadoResponsableInsertarRequestDto request,
        CancellationToken cancellationToken = default)
    {
        await EjecutarAsync(InsertarSp, request, cancellationToken);
    }

    public async Task ActualizarAsync(
        EmpleadoResponsableInsertarRequestDto request,
        CancellationToken cancellationToken = default)
    {
        await EjecutarAsync(ActualizarSp, request, cancellationToken);
    }

    private async Task EjecutarAsync(
        string storedProcedure,
        EmpleadoResponsableInsertarRequestDto request,
        CancellationToken cancellationToken)
    {
        await using var connection = _sqlCommandFactory.CreateConnection();
        await ValidarCuentasUnicasAsync(connection, request, cancellationToken);

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
                new { ProcedureName = storedProcedure },
                CommandType.Text,
                cancellationToken))).ToList();

        if (parameters.Count == 0)
        {
            throw new InvalidOperationException($"No se encontró el store {storedProcedure} en la base de datos.");
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
                $"El store {storedProcedure} requiere parámetros no contemplados por el formulario: " +
                string.Join(", ", unsupportedRequiredParameters) + ".");
        }

        var resultado = await connection.QueryFirstOrDefaultAsync<EmpleadoResponsableOperacionResultado>(
            _sqlCommandFactory.Create(
                storedProcedure,
                dynamicParameters,
                CommandType.StoredProcedure,
                cancellationToken));

        if (resultado?.Resultado == 0)
        {
            throw new InvalidOperationException(
                string.IsNullOrWhiteSpace(resultado.Mensaje)
                    ? "No se pudo actualizar el responsable."
                    : resultado.Mensaje);
        }
    }

    // Un mismo responsable (IdEmpleado, o el de igual NroDocumento al insertar; IdCargo 10, IdEstado 1 activo) no puede tener
    // dos cuentas con el mismo nro. de cuenta, la misma interbancaria, ni el mismo banco + tipo de cuenta.
    // En edición se excluye la cuenta que se está modificando (IdEmpleado + banco + tipo + cuenta actuales).
    private async Task ValidarCuentasUnicasAsync(
        IDbConnection connection,
        EmpleadoResponsableInsertarRequestDto request,
        CancellationToken cancellationToken)
    {
        var cuenta = request.Cuenta?.Trim() ?? string.Empty;
        var cuentaInter = request.CuentaInter?.Trim() ?? string.Empty;
        if (cuenta.Length == 0 && cuentaInter.Length == 0)
        {
            return;
        }

        var esEdicion = request.IdEmpleado.GetValueOrDefault() > 0
            && request.IdBancoActual.GetValueOrDefault() > 0
            && !string.IsNullOrWhiteSpace(request.CuentaActual);

        _ = int.TryParse(request.IdBanco?.Trim(), out var idBanco);

        var duplicado = await connection.QueryFirstOrDefaultAsync<(int PorCuenta, int PorInter, int PorBancoTipo)>(
            _sqlCommandFactory.Create(
                """
                SELECT
                    ISNULL(MAX(CASE WHEN @Cuenta <> '' AND LTRIM(RTRIM(ISNULL(CE.Cuenta, ''))) = @Cuenta THEN 1 END), 0) AS PorCuenta,
                    ISNULL(MAX(CASE WHEN @CuentaInter <> '' AND LTRIM(RTRIM(ISNULL(CE.CuentaInter, ''))) = @CuentaInter THEN 1 END), 0) AS PorInter,
                    ISNULL(MAX(CASE WHEN @IdBanco > 0 AND @NombreCta <> ''
                                     AND CE.IdBanco = @IdBanco
                                     AND UPPER(LTRIM(RTRIM(ISNULL(CE.NombreCta, '')))) = UPPER(@NombreCta) THEN 1 END), 0) AS PorBancoTipo
                FROM dbo.CuentaEmpleado CE
                INNER JOIN dbo.Empleado E ON E.IdEmpleado = CE.IdEmpleado AND E.IdCargo = CE.IdCargo
                WHERE CE.IdCargo = 10
                  AND E.IdEstado = 1
                  AND (CE.IdEmpleado = @IdEmpleado
                       OR (@NroDocumento <> '' AND LTRIM(RTRIM(ISNULL(E.NroDocumento, ''))) = @NroDocumento))
                  AND NOT (@EsEdicion = 1
                           AND CE.IdEmpleado = @IdEmpleado
                           AND CE.IdBanco = @IdBancoActual
                           AND UPPER(LTRIM(RTRIM(ISNULL(CE.NombreCta, '')))) = UPPER(@NombreCtaActual)
                           AND LTRIM(RTRIM(ISNULL(CE.Cuenta, ''))) = @CuentaActual);
                """,
                new
                {
                    Cuenta = cuenta,
                    CuentaInter = cuentaInter,
                    IdBanco = idBanco,
                    NombreCta = request.NombreCta?.Trim() ?? string.Empty,
                    NroDocumento = request.NroDocumento?.Trim() ?? string.Empty,
                    EsEdicion = esEdicion ? 1 : 0,
                    IdEmpleado = request.IdEmpleado ?? 0,
                    IdBancoActual = request.IdBancoActual ?? 0,
                    NombreCtaActual = request.NombreCtaActual?.Trim() ?? string.Empty,
                    CuentaActual = request.CuentaActual?.Trim() ?? string.Empty,
                },
                CommandType.Text,
                cancellationToken));

        if (duplicado.PorCuenta == 1)
        {
            throw new InvalidOperationException($"El responsable ya tiene registrada la cuenta {cuenta}.");
        }

        if (duplicado.PorInter == 1)
        {
            throw new InvalidOperationException($"El responsable ya tiene registrada la cuenta interbancaria {cuentaInter}.");
        }

        if (duplicado.PorBancoTipo == 1)
        {
            throw new InvalidOperationException("El responsable ya tiene una cuenta del mismo banco y tipo de cuenta.");
        }
    }

    private static string? GetParameterValue(
        string parameterName,
        EmpleadoResponsableInsertarRequestDto request)
    {
        var normalizedName = NormalizeParameterName(parameterName);

        return normalizedName switch
        {
            "idempleado" or "idresponsable" => request.IdEmpleado?.ToString(),
            "idbancocta" or "idcuentaempleado" => request.IdBancoCta?.ToString(),
            "idbancoactual" => request.IdBancoActual?.ToString(),
            "cuentaactual" => request.CuentaActual,
            "nombrectaactual" or "tipocuentaactual" => request.NombreCtaActual,
            "nombre" or "nombreresponsable" or "responsable" or "nombreempleado" or "nomempleado"
                => request.Nombre,
            "cuenta" or "nrocuenta" or "numerocuenta" or "cuentabancaria"
                => request.Cuenta,
            "cuentainter" or "ctainter" or "cuentainterbancaria" or "ctainterbancaria"
                => request.CuentaInter,
            "tipocuenta" or "tipocta" or "tipodecuenta"
                => request.TipoCuenta,
            "nombrecta" or "nombrecuenta"
                => request.NombreCta,
            "idbanco" or "codigobanco" or "codigobancocta"
                => request.IdBanco,
            "banco" or "nombrebanco"
                => request.Banco,
            "nrodocumento" or "numerodocumento" or "documento" or "nrodoc"
                => request.NroDocumento,
            "usuario" or "usuarioaccion" or "usuarioregistro" or "usuariocrea" or "usuariocreacion" or "usuariomodificacion" or "usuariomodifica"
                => request.UsuarioAccion,
            "fechacreacion" or "fecharegistro" or "fechaactualizacion" or "fechamodificacion"
                => request.FechaCreacion,
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

    private sealed class EmpleadoResponsableOperacionResultado
    {
        public int? Resultado { get; set; }
        public string? Mensaje { get; set; }
    }
}
