// Fase 2 — directorio real de empleados para el alcance del IA Chat (IIaEmployeeDirectory).
// ESTADO: implementado, SIN probar contra una BD y NO activo (ver IaPermissionStore).
//
// Identidad: Usuario.IdEmpleado -> Empleado.IdEmpleadoCj -> EmpleadoCj.IdEmpleado, calculada en servidor
// por IdUsuario (no se usa el claim del JWT). Exige fila en EmpleadoCj; si no se resuelve, devuelve null y
// el servicio de autorizacion DENIEGA Propio/Equipo.
// Equipo = subordinados DIRECTOS: EmpleadoCjDetalle.IdResponsableCj = titular. Se ignora el titular <= 0,
// el propio titular (raiz autorreferenciada) y los ids sin fila en EmpleadoCj (huerfanos). IdResponsableCj = 0
// significa "sin responsable" en esos datos y nunca se trata como empleado.
using CjERP.Application.Interfaces.Services.AI;
using CjERP.Infrastructure.Persistence.Sql;
using Dapper;

namespace CjERP.Infrastructure.Services;

public sealed class IaEmployeeDirectory : IIaEmployeeDirectory
{
    private readonly ISqlCommandFactory _sqlCommandFactory;

    public IaEmployeeDirectory(ISqlCommandFactory sqlCommandFactory)
    {
        _sqlCommandFactory = sqlCommandFactory;
    }

    public async Task<int?> ResolveEmpleadoCjAsync(string idUsuario, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(idUsuario))
        {
            return null;
        }

        await using var connection = _sqlCommandFactory.CreateConnection();

        var ids = (await connection.QueryAsync<int>(
                _sqlCommandFactory.Create(
                    """
                    SELECT DISTINCT cj.IdEmpleado
                    FROM dbo.Usuario u
                    INNER JOIN dbo.Empleado e ON e.IdEmpleado = u.IdEmpleado
                    INNER JOIN dbo.EmpleadoCj cj ON cj.IdEmpleado = e.IdEmpleadoCj
                    WHERE u.IdUsuario = @IdUsuario
                    """,
                    new { IdUsuario = idUsuario },
                    cancellationToken: cancellationToken)))
            .ToList();

        // Resultado unico y positivo; cualquier otra cosa (ninguno o ambiguo) = no resuelto.
        return ids.Count == 1 && ids[0] > 0 ? ids[0] : null;
    }

    public async Task<IReadOnlyList<int>> GetDirectReportsAsync(int idEmpleadoCj, CancellationToken cancellationToken)
    {
        if (idEmpleadoCj <= 0)
        {
            return Array.Empty<int>();
        }

        await using var connection = _sqlCommandFactory.CreateConnection();

        var ids = await connection.QueryAsync<int>(
            _sqlCommandFactory.Create(
                """
                SELECT DISTINCT d.IdEmpleadoCj
                FROM dbo.EmpleadoCjDetalle d
                INNER JOIN dbo.EmpleadoCj sub ON sub.IdEmpleado = d.IdEmpleadoCj
                WHERE d.IdResponsableCj = @Titular
                  AND d.IdEmpleadoCj <> @Titular
                  AND d.IdEmpleadoCj > 0
                """,
                new { Titular = idEmpleadoCj },
                cancellationToken: cancellationToken));

        return ids.ToList();
    }
}
