using System.Collections.Concurrent;
using CjERP.Api.Configuration;
using CjERP.Application.Interfaces.Services;
using Microsoft.Extensions.Options;

namespace CjERP.Infrastructure.Services;

public class ActiveUserSessionService : IActiveUserSessionService
{
    private readonly ConcurrentDictionary<string, SessionState> _activeSessions = new(StringComparer.OrdinalIgnoreCase);
    private readonly TimeSpan _idleTimeout;
    private static readonly TimeSpan RefreshWriteThreshold = TimeSpan.FromMinutes(1);

    public ActiveUserSessionService(IOptions<SessionSettings> sessionSettings)
    {
        var minutes = Math.Max(1, sessionSettings.Value.IdleTimeoutMinutes);
        _idleTimeout = TimeSpan.FromMinutes(minutes);
    }

    public void SetActiveSession(string userId, string sessionId)
    {
        if (string.IsNullOrWhiteSpace(userId) || string.IsNullOrWhiteSpace(sessionId))
        {
            return;
        }

        _activeSessions[userId.Trim()] = new SessionState(sessionId.Trim(), DateTimeOffset.UtcNow);
    }

    public bool ValidateAndRefreshSession(string userId, string sessionId)
    {
        if (string.IsNullOrWhiteSpace(userId) || string.IsNullOrWhiteSpace(sessionId))
        {
            return false;
        }

        var trimmedUserId = userId.Trim();
        if (!_activeSessions.TryGetValue(trimmedUserId, out var activeSession))
        {
            return false;
        }

        if (!string.Equals(activeSession.SessionId, sessionId.Trim(), StringComparison.Ordinal))
        {
            return false;
        }

        var utcNow = DateTimeOffset.UtcNow;
        if (utcNow - activeSession.LastActivityUtc > _idleTimeout)
        {
            _activeSessions.TryRemove(trimmedUserId, out _);
            return false;
        }

        if (utcNow - activeSession.LastActivityUtc >= RefreshWriteThreshold)
        {
            _activeSessions[trimmedUserId] = activeSession with { LastActivityUtc = utcNow };
        }

        return true;
    }

    public void LogoutUser(string userId)
    {
        if (string.IsNullOrWhiteSpace(userId))
        {
            return;
        }

        _activeSessions.TryRemove(userId.Trim(), out _);
    }

    public int PruneExpiredSessions()
    {
        if (_activeSessions.IsEmpty)
        {
            return 0;
        }

        var utcNow = DateTimeOffset.UtcNow;
        var removed = 0;

        foreach (var entry in _activeSessions)
        {
            if (utcNow - entry.Value.LastActivityUtc <= _idleTimeout)
            {
                continue;
            }

            if (_activeSessions.TryRemove(entry.Key, out _))
            {
                removed++;
            }
        }

        return removed;
    }

    private sealed record SessionState(string SessionId, DateTimeOffset LastActivityUtc);
}
