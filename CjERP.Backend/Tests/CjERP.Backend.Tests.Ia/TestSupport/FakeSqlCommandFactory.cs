using CjERP.Infrastructure.Persistence.Sql;
using Dapper;
using Microsoft.Data.SqlClient;

namespace CjERP.Backend.Tests.Ia.TestSupport;

/// <summary>
/// GAP DOCUMENTADO (ver seccion "Seams faltantes" del reporte de Fase 1.0):
/// <see cref="ISqlCommandFactory.CreateConnection"/> devuelve el tipo concreto y sellado-en-la-practica
/// <c>Microsoft.Data.SqlClient.SqlConnection</c>, no una interfaz como <c>IDbConnection</c>. Eso impide
/// sustituir por completo la ejecucion real de <c>dbo.sp_IA_Planilla_Buscar</c> sin una base de datos
/// real: no existe forma de "fingir" filas devueltas por Dapper sobre un <c>SqlConnection</c> autentico.
///
/// Esta clase por eso NO finge resultados de SQL. Se usa en dos roles distintos segun el test:
///
/// 1) <see cref="NeverCalled"/>: para pruebas que NUNCA deberian tocar SQL (p.ej. la ruta "conversation"
///    del planner, o el rechazo temprano de preguntas peligrosas). Si algun cambio futuro hiciera que el
///    codigo bajo prueba llamara a <see cref="CreateConnection"/> inesperadamente, el test falla de forma
///    ruidosa e inmediata en vez de intentar abrir una conexion real silenciosamente.
///
/// 2) <see cref="PointingToClosedLocalPort"/>: para el unico test de integracion que SI necesita tocar
///    la capa SQL real (el manejo de errores de <c>ConsultarAsync</c> cuando la ejecucion del SP falla).
///    Apunta a <c>127.0.0.1</c> en un puerto casi con certeza cerrado, para que el intento de conexion
///    falle rapido (rechazo de TCP en loopback) sin requerir una instancia real de SQL Server ni acceso
///    de red externo.
/// </summary>
public sealed class FakeSqlCommandFactory : ISqlCommandFactory
{
    private readonly string? _connectionStringOverride;

    private FakeSqlCommandFactory(string? connectionStringOverride)
    {
        _connectionStringOverride = connectionStringOverride;
    }

    public static FakeSqlCommandFactory NeverCalled() => new(connectionStringOverride: null);

    public static FakeSqlCommandFactory PointingToClosedLocalPort() =>
        new("Server=127.0.0.1,1;Connect Timeout=1;TrustServerCertificate=true;Encrypt=false");

    public string ConnectionString => _connectionStringOverride
        ?? throw new InvalidOperationException(
            "FakeSqlCommandFactory.NeverCalled(): el codigo bajo prueba intento leer la cadena de " +
            "conexion. Este test esperaba que la ruta ejecutada nunca tocara SQL.");

    public int DefaultCommandTimeoutSeconds => 5;

    public SqlConnection CreateConnection()
    {
        if (_connectionStringOverride is null)
        {
            throw new InvalidOperationException(
                "FakeSqlCommandFactory.NeverCalled(): el codigo bajo prueba intento abrir una " +
                "conexion SQL real. Este test esperaba que la ruta ejecutada (p.ej. route=conversation " +
                "o el rechazo temprano de preguntas peligrosas) nunca llegara a la capa de SQL.");
        }

        return new SqlConnection(_connectionStringOverride);
    }

    public CommandDefinition Create(
        string sql,
        object? parameters = null,
        System.Data.CommandType? commandType = null,
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
