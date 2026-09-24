using System.Collections.Concurrent;
using CjERP.Api.Configuration;
using CjERP.Application.Interfaces.Services;
using Microsoft.Extensions.Options;

namespace CjERP.Infrastructure.Services;

public class ActiveUserSessionService : IActiveUserSessionService
{
    private readonly ConcurrentDictionary<string, ConcurrentDictionary<string, SessionState>> _activeSessions = new(StringComparer.OrdinalIgnoreCase);
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

        var sessions = _activeSessions.GetOrAdd(userId.Trim(), _ => new ConcurrentDictionary<string, SessionState>(StringComparer.Ordinal));
        sessions[sessionId.Trim()] = new SessionState(DateTimeOffset.UtcNow);
    }

    public bool ValidateAndRefreshSession(string userId, string sessionId)
    {
        if (string.IsNullOrWhiteSpace(userId) || string.IsNullOrWhiteSpace(sessionId))
        {
            return false;
        }

        var trimmedUserId = userId.Trim();
        if (!_activeSessions.TryGetValue(trimmedUserId, out var sessions) ||
            !sessions.TryGetValue(sessionId.Trim(), out var activeSession))
        {
            return false;
        }

        var utcNow = DateTimeOffset.UtcNow;
        if (utcNow - activeSession.LastActivityUtc > _idleTimeout)
        {
            sessions.TryRemove(sessionId.Trim(), out _);
            RemoveUserIfNoSessions(trimmedUserId, sessions);
            return false;
        }

        if (utcNow - activeSession.LastActivityUtc >= RefreshWriteThreshold)
        {
            sessions[sessionId.Trim()] = activeSession with { LastActivityUtc = utcNow };
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

    public void LogoutSession(string userId, string sessionId)
    {
        if (string.IsNullOrWhiteSpace(userId) || string.IsNullOrWhiteSpace(sessionId) ||
            !_activeSessions.TryGetValue(userId.Trim(), out var sessions)) return;
        sessions.TryRemove(sessionId.Trim(), out _);
        RemoveUserIfNoSessions(userId.Trim(), sessions);
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
            foreach (var session in entry.Value)
            {
                if (utcNow - session.Value.LastActivityUtc > _idleTimeout && entry.Value.TryRemove(session.Key, out _)) removed++;
            }
            RemoveUserIfNoSessions(entry.Key, entry.Value);
        }

        return removed;
    }

    private void RemoveUserIfNoSessions(string userId, ConcurrentDictionary<string, SessionState> sessions)
    {
        if (sessions.IsEmpty) _activeSessions.TryRemove(userId, out _);
    }

    private sealed record SessionState(DateTimeOffset LastActivityUtc);
}
