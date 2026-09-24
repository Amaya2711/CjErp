namespace CjERP.Api.Configuration;

public sealed class MobileAppVersionOptions
{
    public const string SectionName = "MobileAppVersion";
    public bool Enabled { get; set; }
    public string MinimumAndroid { get; set; } = string.Empty;
    public string RecommendedAndroid { get; set; } = string.Empty;
    public string AndroidUpdateUrl { get; set; } = string.Empty;
    public string MinimumIos { get; set; } = string.Empty;
    public string RecommendedIos { get; set; } = string.Empty;
    public string IosUpdateUrl { get; set; } = string.Empty;
    public bool ForceUpdate { get; set; }
    public string Message { get; set; } = "Hay una nueva versión disponible de CJ ERP Push.";
}
