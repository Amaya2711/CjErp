using System.Data;
using System.Net.Http.Json;
using System.Text.Json;
using CjERP.Application.DTOs.Mobile;
using CjERP.Application.Interfaces.Services;
using CjERP.Infrastructure.Configuration;
using CjERP.Infrastructure.Persistence.Sql;
using Dapper;
using Microsoft.Extensions.Options;

namespace CjERP.Infrastructure.Services;

public sealed class MobilePushDispatchService(
    ISqlCommandFactory sql,
    HttpClient httpClient,
    IOptions<MobilePushOptions> options) : IMobilePushDispatchService
{
    public async Task<MobilePushDispatchResultDto> ProcesarAsync(CancellationToken cancellationToken = default)
    {
        var settings = options.Value;
        var result = new MobilePushDispatchResultDto { Habilitado = settings.Enabled };
        if (!settings.Enabled) return result;

        await using var connection = sql.CreateConnection();
        var candidates = (await connection.QueryAsync<PushCandidate>(sql.Create(
            "dbo.sp_ComunicacionPush_ObtenerPendientes",
            new { Maximo = Math.Clamp(settings.BatchSize, 1, 100), settings.RetryMinutes, settings.ReminderAfterMinutes, settings.InitialMaxAgeHours },
            CommandType.StoredProcedure,
            cancellationToken))).AsList();

        foreach (var candidate in candidates)
        {
            result.Evaluados++;
            var outcome = await SendAsync(candidate, cancellationToken);
            await connection.ExecuteAsync(sql.Create(
                "dbo.sp_ComunicacionPush_RegistrarResultado",
                new
                {
                    candidate.IdComunicacion,
                    candidate.IdEmpleadoCj,
                    candidate.IdDispositivo,
                    candidate.TipoEntrega,
                    outcome.Success,
                    outcome.InvalidToken,
                    outcome.ErrorCode
                },
                CommandType.StoredProcedure,
                cancellationToken));

            if (outcome.Success) result.Enviados++;
            else result.Errores++;
            if (outcome.InvalidToken) result.TokensInvalidos++;
        }
        return result;
    }

    private async Task<PushOutcome> SendAsync(PushCandidate candidate, CancellationToken cancellationToken)
    {
        if (!candidate.PushToken.StartsWith("ExponentPushToken[", StringComparison.Ordinal) &&
            !candidate.PushToken.StartsWith("ExpoPushToken[", StringComparison.Ordinal))
            return new(false, true, "TOKEN_NO_EXPO");

        using var response = await httpClient.PostAsJsonAsync("send", new[]
        {
            new
            {
                to = candidate.PushToken,
                title = candidate.Titulo,
                body = "Tiene una nueva comunicación de CJ Telecom.",
                sound = "default",
                data = new { idReferencia = candidate.IdComunicacion, ruta = $"/comunicacion/{candidate.IdComunicacion}", tipo = candidate.Tipo, tipoPersistencia = candidate.TipoPersistencia }
            }
        }, cancellationToken);

        if (!response.IsSuccessStatusCode) return new(false, false, $"HTTP_{(int)response.StatusCode}");
        using var document = JsonDocument.Parse(await response.Content.ReadAsStreamAsync(cancellationToken));
        var ticket = document.RootElement.TryGetProperty("data", out var tickets) && tickets.GetArrayLength() > 0 ? tickets[0] : default;
        var status = ticket.ValueKind == JsonValueKind.Object && ticket.TryGetProperty("status", out var statusValue) ? statusValue.GetString() : null;
        if (string.Equals(status, "ok", StringComparison.OrdinalIgnoreCase)) return new(true, false, null);
        var error = ticket.ValueKind == JsonValueKind.Object && ticket.TryGetProperty("details", out var details) && details.TryGetProperty("error", out var errorValue) ? errorValue.GetString() : "EXPO_RECHAZO";
        return new(false, string.Equals(error, "DeviceNotRegistered", StringComparison.OrdinalIgnoreCase), error ?? "EXPO_RECHAZO");
    }

    private sealed class PushCandidate
    {
        public long IdComunicacion { get; init; }
        public int IdEmpleadoCj { get; init; }
        public long IdDispositivo { get; init; }
        public string PushToken { get; init; } = string.Empty;
        public string Titulo { get; init; } = string.Empty;
        public int Tipo { get; init; }
        public int TipoPersistencia { get; init; }
        public string TipoEntrega { get; init; } = string.Empty;
    }

    private sealed record PushOutcome(bool Success, bool InvalidToken, string? ErrorCode);
}
