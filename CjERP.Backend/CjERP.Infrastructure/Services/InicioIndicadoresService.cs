using System.Data;
using CjERP.Application.Interfaces.Services;
using CjERP.Infrastructure.Persistence.Sql;
using Dapper;
using Microsoft.Extensions.Logging;

namespace CjERP.Infrastructure.Services;

public class InicioIndicadoresService : IInicioIndicadoresService
{
    // sp_OrdenCompra_ResumenEstados devuelve una fila por estado (Estado, Cantidad); solo interesan las validaciones pendientes.
    private static readonly string[] EstadosOcPendientes = { "1era Validacion", "2da Validacion", "3era Validacion" };

    private sealed class ResumenOcRow
    {
        public string? Estado { get; set; }
        public long Cantidad { get; set; }
    }

    private sealed class ResumenPlanillaRow
    {
        public long Cantidad { get; set; }
    }

    private readonly ISqlCommandFactory _sqlCommandFactory;
    private readonly ILogger<InicioIndicadoresService> _logger;

    public InicioIndicadoresService(ISqlCommandFactory sqlCommandFactory, ILogger<InicioIndicadoresService> logger)
    {
        _sqlCommandFactory = sqlCommandFactory;
        _logger = logger;
    }

    public async Task<int> ObtenerIndicadorPendientesAsync(int idSolicitante, CancellationToken cancellationToken = default)
    {
        if (idSolicitante <= 0)
            return 0;

        await using var connection = _sqlCommandFactory.CreateConnection();

        // Planilla/CabOrdenCompra.IdSolicitante guarda el id de EmpleadoCj (IdWeb = 1) o el de Empleado (legacy, IdWeb <> 1):
        // se evalua con el CodEmp y con los Empleado enlazados a ese EmpleadoCj.
        var idsSolicitante = new List<int> { idSolicitante };
        try
        {
            idsSolicitante.AddRange(await connection.QueryAsync<int>(
                _sqlCommandFactory.Create(
                    "SELECT IdEmpleado FROM dbo.Empleado WHERE IdEmpleadoCj = @IdEmpleadoCj",
                    new { IdEmpleadoCj = idSolicitante },
                    cancellationToken: cancellationToken)));
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "No se pudieron resolver los Empleado enlazados al EmpleadoCj {IdEmpleadoCj}.", idSolicitante);
        }

        var indicador = 0;

        foreach (var id in idsSolicitante.Where(i => i > 0).Distinct())
        {
            indicador = await EvaluarSolicitanteAsync(connection, id, cancellationToken);
            if (indicador == 1)
                break;
        }


        return indicador;
    }

    private async Task<int> EvaluarSolicitanteAsync(Microsoft.Data.SqlClient.SqlConnection connection, int idSolicitante, CancellationToken cancellationToken)
    {
        var indicador = 0;

        try
        {
            var ordenes = await connection.QueryAsync<ResumenOcRow>(
                _sqlCommandFactory.Create(
                    "dbo.sp_OrdenCompra_ResumenEstados",
                    new { IdSolicitante = idSolicitante },
                    CommandType.StoredProcedure,
                    cancellationToken));

            if (ordenes.Any(o => o.Cantidad > 0
                                 && EstadosOcPendientes.Contains(o.Estado?.Trim(), StringComparer.OrdinalIgnoreCase)))
            {
                indicador = 1;
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "No se pudo ejecutar sp_OrdenCompra_ResumenEstados para el solicitante {IdSolicitante}.", idSolicitante);
        }

        if (indicador == 1)
            return indicador;

        try
        {
            // Con @Estados por defecto del SP (0,1,2,5,6,7,8,9,10,11,12): cualquier cantidad > 0 activa el indicador.
            var planillas = await connection.QueryAsync<ResumenPlanillaRow>(
                _sqlCommandFactory.Create(
                    "dbo.sp_Planilla_Consulta_Estados_Resumen",
                    new { IdSolicitante = idSolicitante },
                    CommandType.StoredProcedure,
                    cancellationToken));

            if (planillas.Any(p => p.Cantidad > 0))
                indicador = 1;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "No se pudo ejecutar sp_Planilla_Consulta_Estados_Resumen para el solicitante {IdSolicitante}.", idSolicitante);
        }

        return indicador;
    }
}
