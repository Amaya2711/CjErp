namespace CjERP.Api.Configuration;

public sealed class MobileMonitorOptions
{
    public const string SectionName = "MobileMonitor";
    public List<int> AdminRoleIds { get; set; } = [5];
}
