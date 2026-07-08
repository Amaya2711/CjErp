namespace CjERP.Shared.Configuration;

public sealed class SmtpSettings
{
    public string Host { get; set; } = string.Empty;
    public int Port { get; set; } = 587;
    public string UserName { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
    public string From { get; set; } = string.Empty;
    public bool EnableSsl { get; set; } = true;
    public bool AllowInvalidCertificate { get; set; }
    public bool AllowInsecureFallback { get; set; } = true;
    public int TimeoutSeconds { get; set; } = 30;
}
