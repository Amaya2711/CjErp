using System.Data;
using CjERP.Application.DTOs;
using CjERP.Application.Interfaces.Services;
using CjERP.Infrastructure.Persistence.Sql;
using Dapper;

namespace CjERP.Infrastructure.Services;

public class LogisticaReembolsoService : ILogisticaReembolsoService
{
    private const string BuscarSp = "dbo.sp_Planilla_Listar_Reembolso";

    private readonly ISqlCommandFactory _sqlCommandFactory;

    public LogisticaReembolsoService(ISqlCommandFactory sqlCommandFactory)
    {
        _sqlCommandFactory = sqlCommandFactory;
    }

    public async Task<IEnumerable<LogisticaReembolsoDto>> BuscarAsync(
        LogisticaReembolsoBuscarRequestDto request,
        CancellationToken cancellationToken = default)
    {
        await using var connection = _sqlCommandFactory.CreateConnection();
        var data = await connection.QueryAsync<LogisticaReembolsoDto>(
            _sqlCommandFactory.Create(
                BuscarSp,
                commandType: CommandType.StoredProcedure,
                cancellationToken: cancellationToken,
                commandTimeout: 120));

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
}
