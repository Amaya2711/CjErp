using System.Collections.Concurrent;
using CjERP.Application.Interfaces.Services;

namespace CjERP.Infrastructure.Services;

public class ActiveUserSessionService : IActiveUserSessionService
{
    private readonly ConcurrentDictionary<string, string> _activeSessions = new(StringComparer.OrdinalIgnoreCase);

    public void SetActiveSession(string userId, string sessionId)
    {
        if (string.IsNullOrWhiteSpace(userId) || string.IsNullOrWhiteSpace(sessionId))
        {
            return;
        }

        _activeSessions[userId.Trim()] = sessionId.Trim();
    }

    public bool IsSessionActive(string userId, string sessionId)
    {
        if (string.IsNullOrWhiteSpace(userId) || string.IsNullOrWhiteSpace(sessionId))
        {
            return false;
        }

        return _activeSessions.TryGetValue(userId.Trim(), out var activeSessionId) &&
               string.Equals(activeSessionId, sessionId.Trim(), StringComparison.Ordinal);
    }

    public void LogoutUser(string userId)
    {
        if (string.IsNullOrWhiteSpace(userId))
        {
            return;
        }

        _activeSessions.TryRemove(userId.Trim(), out _);
    }
}
