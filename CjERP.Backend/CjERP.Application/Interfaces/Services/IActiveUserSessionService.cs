namespace CjERP.Application.Interfaces.Services;

public sealed record ActiveUserSessionInfo(string UserId, int Sesiones, DateTimeOffset UltimaActividadUtc);

public interface IActiveUserSessionService
{
    void SetActiveSession(string userId, string sessionId);
    bool ValidateAndRefreshSession(string userId, string sessionId);
    void LogoutUser(string userId);
    void LogoutSession(string userId, string sessionId);
    int PruneExpiredSessions();

    /// <summary>Usuarios con alguna sesión cuya última actividad es posterior a <paramref name="desdeUtc"/>.</summary>
    IReadOnlyList<ActiveUserSessionInfo> ListarUsuariosActivos(DateTimeOffset desdeUtc);
}
