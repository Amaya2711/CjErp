namespace CjERP.Api.Configuration;

public sealed class SqlSettings
{
    public int DefaultCommandTimeoutSeconds { get; set; } = 60;
    public int ConnectTimeoutSeconds { get; set; } = 15;
    public int MaxPoolSize { get; set; } = 100;
    public bool Encrypt { get; set; }
    public bool TrustServerCertificate { get; set; } = true;
    public int SlowRequestThresholdMs { get; set; } = 1500;
    public int RateLimitPermitLimit { get; set; } = 120;
    public int RateLimitWindowSeconds { get; set; } = 60;
}
