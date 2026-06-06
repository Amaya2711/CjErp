namespace CjERP.Shared.Configuration;

public sealed class PlanillaXmlOptions
{
    public const string SectionName = "PlanillaXml";

    public long MaxFileSizeBytes { get; set; } = 10_000_000;
    public bool GeneratePdfOnImport { get; set; }
}
