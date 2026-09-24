namespace CjERP.Api.Configuration;

public sealed class SharePointOptions
{
    public const string SectionName = "SharePoint";

    public string TenantId { get; set; } = string.Empty;
    public string ClientId { get; set; } = string.Empty;
    public string ClientSecret { get; set; } = string.Empty;
    public string HostName { get; set; } = "cjtelecom.sharepoint.com";
    public string SitePath { get; set; } = "/sites/CJ-PROYECTOS";
    public string DocumentLibraryName { get; set; } = "APLICATIVOS EXTERNOS";
    public string ExpensesFolderPath { get; set; } = "GASTO_FOTOS";
    public string ReembolsosFolderPath { get; set; } = "REEMBOLSOS";
    public string MobileCommunicationsFolderPath { get; set; } = "COMUNICACIONES";
    public Dictionary<string, string> FolderPaths { get; set; } = new(StringComparer.OrdinalIgnoreCase);
    public SharePointAsistenciaOptions Asistencia { get; set; } = new();
}

public sealed class SharePointAsistenciaOptions
{
    public string DocumentLibraryName { get; set; } = "Documentos compartidos";
    public string FolderPath { get; set; } = "Asistencia";
}
