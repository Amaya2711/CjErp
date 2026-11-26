namespace CjERP.Api.Configuration;

public sealed class SessionSettings
{
    public int IdleTimeoutMinutes { get; set; } = 30;

    /// <summary>
    /// Minutos de inactividad propios de ciertos usuarios (clave = IdUsuario, sin distinguir mayusculas).
    /// Los usuarios que no aparezcan usan <see cref="IdleTimeoutMinutes"/>.
    /// </summary>
    public Dictionary<string, int> UserIdleTimeoutMinutes { get; set; } = new();

    public int GetIdleTimeoutMinutes(string? userId)
    {
        var minutes = IdleTimeoutMinutes;

        if (!string.IsNullOrWhiteSpace(userId))
        {
            var key = userId.Trim();
            foreach (var entry in UserIdleTimeoutMinutes)
            {
                if (string.Equals(entry.Key.Trim(), key, StringComparison.OrdinalIgnoreCase) && entry.Value > 0)
                {
                    minutes = entry.Value;
                    break;
                }
            }
        }

        return Math.Max(1, minutes);
    }

    /// <summary>El token debe durar al menos lo mismo que la inactividad permitida, si no vence antes.</summary>
    public int GetTokenDurationMinutes(string? userId, int defaultDurationMinutes)
        => Math.Max(defaultDurationMinutes, GetIdleTimeoutMinutes(userId));
}
