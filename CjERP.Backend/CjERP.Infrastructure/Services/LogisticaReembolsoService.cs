using System.Data;
using CjERP.Application.DTOs;
using CjERP.Application.Interfaces.Services;
using Dapper;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;

namespace CjERP.Infrastructure.Services;

public class LogisticaReembolsoService : ILogisticaReembolsoService
{
    private const string BuscarSp = "dbo.sp_Planilla_Listar_Reembolso";

    private readonly IConfiguration _configuration;

    public LogisticaReembolsoService(IConfiguration configuration)
    {
        _configuration = configuration;
    }

    public async Task<IEnumerable<LogisticaReembolsoDto>> BuscarAsync(
        LogisticaReembolsoBuscarRequestDto request,
        CancellationToken cancellationToken = default)
    {
        using var connection = BuildConnection();
        var data = await connection.QueryAsync<LogisticaReembolsoDto>(
            new CommandDefinition(
                BuscarSp,
                commandType: CommandType.StoredProcedure,
                cancellationToken: cancellationToken));

        if (request.Correlativo is > 0)
        {
            return data.Where(item => item.Correlativo == request.Correlativo.Value);
        }

        return data;
    }

    public Task ActualizarAsync(
        LogisticaReembolsoUpdateRequestDto request,
        CancellationToken cancellationToken = default)
    {
        throw new NotSupportedException(
            "No existe store de actualizacion configurado para reembolso. El endpoint queda preparado, pero no ejecuta cambios.");
    }

    private SqlConnection BuildConnection()
    {
        return new SqlConnection(_configuration.GetConnectionString("DefaultConnection"));
    }
}
