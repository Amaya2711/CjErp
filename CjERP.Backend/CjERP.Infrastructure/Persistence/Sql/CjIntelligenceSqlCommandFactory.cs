// CJ Intelligence: fabrica de conexiones EXCLUSIVA para el usuario de minimo privilegio (cj_ia, script 20).
// - Lee ConnectionStrings:CjIntelligence. Si falta o esta vacia LANZA: NUNCA cae a DefaultConnection,
//   porque esa conexion es sysadmin y rompería el principio de privilegios minimos.
// - Reutiliza SqlCommandFactory (timeouts, pool, ARITHABORT) sin modificarla ni duplicar su logica:
//   se le entrega una configuracion en memoria cuyo unico valor es la cadena de CJ Intelligence.
// - Tipo propio (ICjIntelligenceSqlCommandFactory) para que el contenedor no confunda esta fabrica
//   con la ISqlCommandFactory del resto del ERP.
// NO esta registrada en DI ni hay cadena configurada todavia.
using System.Data;
using CjERP.Api.Configuration;
using Dapper;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Options;

namespace CjERP.Infrastructure.Persistence.Sql;

public interface ICjIntelligenceSqlCommandFactory : ISqlCommandFactory
{
}

public sealed class CjIntelligenceSqlCommandFactory : ICjIntelligenceSqlCommandFactory
{
    public const string ConnectionName = "CjIntelligence";

    private readonly SqlCommandFactory _inner;

    public CjIntelligenceSqlCommandFactory(IConfiguration configuration, IOptions<SqlSettings> sqlSettings)
    {
        var raw = configuration.GetConnectionString(ConnectionName);
        if (string.IsNullOrWhiteSpace(raw))
        {
            // Mensaje sin valores: nunca incluye la cadena.
            throw new InvalidOperationException(
                $"CJ Intelligence requiere la cadena de conexion '{ConnectionName}' (usuario de minimo privilegio). " +
                "No se usa DefaultConnection como respaldo.");
        }

        _inner = new SqlCommandFactory(new SingleConnectionConfiguration(raw), sqlSettings);
    }

    // Configuracion minima (sin agregar paquetes): solo responde ConnectionStrings:DefaultConnection con la
    // cadena de CJ Intelligence, que es lo unico que lee SqlCommandFactory (GetConnectionString).
    private sealed class SingleConnectionConfiguration : IConfiguration
    {
        private readonly string _connectionString;

        public SingleConnectionConfiguration(string connectionString) => _connectionString = connectionString;

        public string? this[string key]
        {
            get => string.Equals(key, "ConnectionStrings:DefaultConnection", StringComparison.OrdinalIgnoreCase) ? _connectionString : null;
            set => throw new NotSupportedException();
        }

        public IConfigurationSection GetSection(string key) =>
            string.Equals(key, "ConnectionStrings", StringComparison.OrdinalIgnoreCase)
                ? new Section("ConnectionStrings", this)
                : new Section(key, this);

        public IEnumerable<IConfigurationSection> GetChildren() => Array.Empty<IConfigurationSection>();

        public Microsoft.Extensions.Primitives.IChangeToken GetReloadToken() =>
            new Microsoft.Extensions.Primitives.CancellationChangeToken(CancellationToken.None);

        private sealed class Section : IConfigurationSection
        {
            private readonly SingleConnectionConfiguration _root;

            public Section(string path, SingleConnectionConfiguration root)
            {
                Path = path;
                Key = path;
                _root = root;
            }

            public string Key { get; }

            public string Path { get; }

            public string? Value
            {
                get => _root[Path];
                set => throw new NotSupportedException();
            }

            public string? this[string key]
            {
                get => _root[$"{Path}:{key}"];
                set => throw new NotSupportedException();
            }

            public IConfigurationSection GetSection(string key) => new Section($"{Path}:{key}", _root);

            public IEnumerable<IConfigurationSection> GetChildren() => Array.Empty<IConfigurationSection>();

            public Microsoft.Extensions.Primitives.IChangeToken GetReloadToken() => _root.GetReloadToken();
        }
    }

    public string ConnectionString => _inner.ConnectionString;

    public int DefaultCommandTimeoutSeconds => _inner.DefaultCommandTimeoutSeconds;

    public SqlConnection CreateConnection() => _inner.CreateConnection();

    public CommandDefinition Create(
        string sql,
        object? parameters = null,
        CommandType? commandType = null,
        CancellationToken cancellationToken = default,
        int? commandTimeout = null) =>
        _inner.Create(sql, parameters, commandType, cancellationToken, commandTimeout);
}
