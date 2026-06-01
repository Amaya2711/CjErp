namespace CjERP.Application.Interfaces.Services;

public interface IActiveUserSessionService
{
    void SetActiveSession(string userId, string sessionId);
    bool ValidateAndRefreshSession(string userId, string sessionId);
    void LogoutUser(string userId);
}
