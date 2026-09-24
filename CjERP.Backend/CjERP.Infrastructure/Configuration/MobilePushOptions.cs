namespace CjERP.Infrastructure.Configuration;

public sealed class MobilePushOptions
{
    public const string SectionName = "MobilePush";
    public bool Enabled { get; set; }
    public int BatchSize { get; set; } = 100;
    public int RetryMinutes { get; set; } = 15;
    public int ReminderAfterMinutes { get; set; } = 1440;
    public int InitialMaxAgeHours { get; set; } = 24;
}
