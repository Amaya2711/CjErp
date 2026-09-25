using System.Collections.Concurrent;
using System.Data;
using System.Text;
using CjERP.Application.DTOs;
using CjERP.Application.Interfaces.Services;
using Dapper;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;

namespace CjERP.Infrastructure.Services;

public class AuditoriaCambiosService : IAuditoriaCambiosService
{
    private const string RegistrarSp = "dbo.sp_AuditoriaCambios_Registrar";
    private static readonly ConcurrentDictionary<string, bool> ProcedureAvailabilityCache = new(StringComparer.OrdinalIgnoreCase);

    private readonly IConfiguration _configuration;

    public AuditoriaCambiosService(IConfiguration configuration)
    {
        _configuration = configuration;
    }

    public async Task RegistrarAsync(AuditoriaCambioDto cambio, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(cambio);
        await RegistrarLoteAsync([cambio], cancellationToken);
    }

    public async Task RegistrarLoteAsync(IEnumerable<AuditoriaCambioDto> cambios, CancellationToken cancellationToken = default)
    {
        var lote = cambios
            .Where(static item => item is not null)
            .Where(static item =>
                !string.IsNullOrWhiteSpace(item.Modulo) &&
                !string.IsNullOrWhiteSpace(item.Entidad) &&
                !string.IsNullOrWhiteSpace(item.IdRegistro) &&
                !string.IsNullOrWhiteSpace(item.Accion) &&
                !string.IsNullOrWhiteSpace(item.Campo) &&
                !string.IsNullOrWhiteSpace(item.UsuarioAccion))
            .ToList();

        if (lote.Count == 0)
        {
            return;
        }

        await using var connection = new SqlConnection(_configuration.GetConnectionString("DefaultConnection"));
        var hasProcedure = await HasStoredProcedureAsync(connection, RegistrarSp, cancellationToken);
        if (!hasProcedure)
        {
            return;
        }

        // Una llamada por campo es muy costosa cuando la API y SQL Server están
        // en redes distintas. Agrupamos hasta 100 auditorías (1,000 parámetros,
        // por debajo del límite de SQL Server) en un único viaje a SQL.
        foreach (var grupo in lote.Chunk(100))
        {
            var parameters = new DynamicParameters();
            var commandText = new StringBuilder();

            foreach (var (cambio, index) in grupo.Select((cambio, index) => (cambio, index)))
            {
                commandText.Append($"EXEC {RegistrarSp} @Modulo = @Modulo{index}, @Entidad = @Entidad{index}, @IdRegistro = @IdRegistro{index}, @Accion = @Accion{index}, @Seccion = @Seccion{index}, @Campo = @Campo{index}, @ValorAnterior = @ValorAnterior{index}, @ValorNuevo = @ValorNuevo{index}, @UsuarioAccion = @UsuarioAccion{index}, @Observacion = @Observacion{index};");

                parameters.Add($"@Modulo{index}", cambio.Modulo.Trim(), DbType.String);
                parameters.Add($"@Entidad{index}", cambio.Entidad.Trim(), DbType.String);
                parameters.Add($"@IdRegistro{index}", cambio.IdRegistro.Trim(), DbType.String);
                parameters.Add($"@Accion{index}", cambio.Accion.Trim().ToUpperInvariant(), DbType.String);
                parameters.Add($"@Seccion{index}", NullIfWhiteSpace(cambio.Seccion), DbType.String);
                parameters.Add($"@Campo{index}", cambio.Campo.Trim(), DbType.String);
                parameters.Add($"@ValorAnterior{index}", NullIfWhiteSpace(cambio.ValorAnterior), DbType.String);
                parameters.Add($"@ValorNuevo{index}", NullIfWhiteSpace(cambio.ValorNuevo), DbType.String);
                parameters.Add($"@UsuarioAccion{index}", cambio.UsuarioAccion.Trim(), DbType.String);
                parameters.Add($"@Observacion{index}", NullIfWhiteSpace(cambio.Observacion), DbType.String);
            }

            await connection.ExecuteAsync(
                new CommandDefinition(
                    commandText.ToString(),
                    parameters,
                    commandType: CommandType.Text,
                    cancellationToken: cancellationToken,
                    commandTimeout: 120));
        }
    }

    public async Task<IReadOnlyList<AuditoriaCambioConsultaDto>> ConsultarAsync(
        AuditoriaCambioFiltroDto filtro,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(filtro);

        await using var connection = new SqlConnection(_configuration.GetConnectionString("DefaultConnection"));

        const string sql = """
        SELECT TOP (@Top)
            IdAuditoria,
            Modulo,
            Entidad,
            IdRegistro,
            Accion,
            Seccion,
            Campo,
            ValorAnterior,
            ValorNuevo,
            UsuarioAccion,
            FechaAccion,
            Observacion
        FROM dbo.AuditoriaCambios
        WHERE (@Modulo IS NULL OR Modulo = @Modulo)
          AND (@Entidad IS NULL OR Entidad = @Entidad)
          AND (@IdRegistro IS NULL OR IdRegistro = @IdRegistro)
          AND (@Seccion IS NULL OR Seccion = @Seccion)
          AND (@Campo IS NULL OR Campo = @Campo)
          AND (@UsuarioAccion IS NULL OR UsuarioAccion = @UsuarioAccion)
          AND (@FechaDesde IS NULL OR FechaAccion >= @FechaDesde)
          AND (@FechaHasta IS NULL OR FechaAccion < DATEADD(DAY, 1, @FechaHasta))
        ORDER BY FechaAccion DESC, IdAuditoria DESC;
        """;

        var result = await connection.QueryAsync<AuditoriaCambioConsultaDto>(
            new CommandDefinition(
                sql,
                new
                {
                    Top = NormalizeTop(filtro.Top),
                    Modulo = NullIfWhiteSpace(filtro.Modulo),
                    Entidad = NullIfWhiteSpace(filtro.Entidad),
                    IdRegistro = NullIfWhiteSpace(filtro.IdRegistro),
                    Seccion = NullIfWhiteSpace(filtro.Seccion),
                    Campo = NullIfWhiteSpace(filtro.Campo),
                    UsuarioAccion = NullIfWhiteSpace(filtro.UsuarioAccion),
                    filtro.FechaDesde,
                    filtro.FechaHasta
                },
                cancellationToken: cancellationToken));

        return result.ToList();
    }

    private static async Task<bool> HasStoredProcedureAsync(
        SqlConnection connection,
        string procedureName,
        CancellationToken cancellationToken)
    {
        if (ProcedureAvailabilityCache.TryGetValue(procedureName, out var cached))
        {
            return cached;
        }

        const string sql = """
        SELECT CASE WHEN OBJECT_ID(@ProcedureName, 'P') IS NOT NULL THEN 1 ELSE 0 END;
        """;

        var exists = await connection.ExecuteScalarAsync<int>(
            new CommandDefinition(
                sql,
                new { ProcedureName = procedureName },
                cancellationToken: cancellationToken));

        var available = exists == 1;
        ProcedureAvailabilityCache[procedureName] = available;
        return available;
    }

    private static string? NullIfWhiteSpace(string? value)
    {
        return string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    }

    private static int NormalizeTop(int top)
    {
        if (top <= 0)
        {
            return 300;
        }

        return Math.Min(top, 1000);
    }
}
