using System.Data;
using CjERP.Api.Configuration;
using Dapper;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Options;

namespace CjERP.Infrastructure.Persistence.Sql;

public sealed class SqlCommandFactory : ISqlCommandFactory
{
    public SqlCommandFactory(IConfiguration configuration, IOptions<SqlSettings> sqlSettings)
    {
        var settings = sqlSettings.Value;
        var rawConnectionString = configuration.GetConnectionString("DefaultConnection")
            ?? throw new InvalidOperationException("No se encontro la cadena de conexion DefaultConnection.");

        var builder = new SqlConnectionStringBuilder(rawConnectionString)
        {
            ConnectTimeout = settings.ConnectTimeoutSeconds,
            MaxPoolSize = settings.MaxPoolSize,
            Encrypt = settings.Encrypt,
            TrustServerCertificate = settings.TrustServerCertificate
        };

        ConnectionString = builder.ConnectionString;
        DefaultCommandTimeoutSeconds = settings.DefaultCommandTimeoutSeconds;
    }

    public string ConnectionString { get; }

    public int DefaultCommandTimeoutSeconds { get; }

    public SqlConnection CreateConnection()
    {
        var connection = new SqlConnection(ConnectionString);

        // SqlClient abre con ARITHABORT OFF y SSMS con ON: SQL Server cachea un plan distinto por cada combinación
        // de SET, y el de la app puede ser mucho más lento (parameter sniffing). El pool ejecuta sp_reset_connection
        // y devuelve ARITHABORT a OFF, por eso se fija en cada apertura para que la app use el mismo plan que SSMS.
        connection.StateChange += (sender, args) =>
        {
            if (args.OriginalState != ConnectionState.Closed || args.CurrentState != ConnectionState.Open)
                return;

            using var command = ((SqlConnection)sender).CreateCommand();
            command.CommandText = "SET ARITHABORT ON;";
            command.ExecuteNonQuery();
        };

        return connection;
    }

    public CommandDefinition Create(
        string sql,
        object? parameters = null,
        CommandType? commandType = null,
        CancellationToken cancellationToken = default,
        int? commandTimeout = null)
    {
        return new CommandDefinition(
            sql,
            parameters,
            commandType: commandType,
            commandTimeout: commandTimeout ?? DefaultCommandTimeoutSeconds,
            cancellationToken: cancellationToken);
    }
}
