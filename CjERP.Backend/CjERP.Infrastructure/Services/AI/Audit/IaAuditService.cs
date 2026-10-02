// Extraido de IaChatService.cs (fila 1.9 de la tabla original de docs/AI_COPILOT_IMPLEMENTATION_PLAN.md).
// Codigo movido tal cual: no se cambio ningun comportamiento, solo la ubicacion. Unico punto del
// sistema que ejecuta dbo.sp_IaChatAuditoria_Insertar. A diferencia de las extracciones puras
// anteriores, esta clase tiene una dependencia real (ISqlCommandFactory + ILogger), por eso usa
// interfaz (seam real para test/DI), igual que GastosQueryExecutor en Fase 1.3.
using System.Data;
using System.Text.Json;
using CjERP.Infrastructure.Persistence.Sql;
using Dapper;
using Microsoft.Extensions.Logging;

using static CjERP.Infrastructure.Services.IaTextUtils;

namespace CjERP.Infrastructure.Services;

public interface IIaAuditService
{
    Task RegistrarAsync(
        string? idUsuario,
        string module,
        string question,
        string? herramienta,
        Dictionary<string, object?> parametros,
        int duracionMs,
        int cantidadRegistros,
        bool fueExitoso,
        string? mensajeError,
        CancellationToken cancellationToken);
}

public sealed class IaAuditService : IIaAuditService
{
    private const string StoredProcedureAuditoria = "dbo.sp_IaChatAuditoria_Insertar";

    private readonly ISqlCommandFactory _sqlCommandFactory;
    private readonly ILogger<IaAuditService> _logger;

    public IaAuditService(ISqlCommandFactory sqlCommandFactory, ILogger<IaAuditService> logger)
    {
        _sqlCommandFactory = sqlCommandFactory;
        _logger = logger;
    }

    public async Task RegistrarAsync(
        string? idUsuario,
        string module,
        string question,
        string? herramienta,
        Dictionary<string, object?> parametros,
        int duracionMs,
        int cantidadRegistros,
        bool fueExitoso,
        string? mensajeError,
        CancellationToken cancellationToken)
    {
        try
        {
            await using var connection = _sqlCommandFactory.CreateConnection();
            var parameters = new DynamicParameters();
            parameters.Add("@IdUsuario", NormalizeText(idUsuario), DbType.String, size: 100);
            parameters.Add("@Modulo", module, DbType.String, size: 50);
            parameters.Add("@Pregunta", question, DbType.String);
            parameters.Add("@Herramienta", NormalizeText(herramienta), DbType.String, size: 100);
            parameters.Add("@ParametrosJson", JsonSerializer.Serialize(parametros, IaChatSharedDefaults.JsonOptions), DbType.String);
            parameters.Add("@DuracionMs", duracionMs, DbType.Int32);
            parameters.Add("@CantidadRegistros", cantidadRegistros, DbType.Int32);
            parameters.Add("@FueExitoso", fueExitoso, DbType.Boolean);
            parameters.Add("@MensajeError", NormalizeText(mensajeError), DbType.String);

            await connection.ExecuteAsync(
                _sqlCommandFactory.Create(
                    StoredProcedureAuditoria,
                    parameters,
                    CommandType.StoredProcedure,
                    cancellationToken,
                    commandTimeout: 30));
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "No se pudo registrar la auditoria de IA Chat.");
        }
    }
}
