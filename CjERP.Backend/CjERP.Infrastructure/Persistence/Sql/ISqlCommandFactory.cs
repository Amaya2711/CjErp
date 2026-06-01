using System.Data;
using Dapper;
using Microsoft.Data.SqlClient;

namespace CjERP.Infrastructure.Persistence.Sql;

public interface ISqlCommandFactory
{
    SqlConnection CreateConnection();
    CommandDefinition Create(
        string sql,
        object? parameters = null,
        CommandType? commandType = null,
        CancellationToken cancellationToken = default,
        int? commandTimeout = null);
    string ConnectionString { get; }
    int DefaultCommandTimeoutSeconds { get; }
}
