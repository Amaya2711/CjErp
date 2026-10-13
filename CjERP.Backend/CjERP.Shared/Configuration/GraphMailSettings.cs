namespace CjERP.Shared.Configuration;

/// <summary>
/// Envío de correo por Microsoft Graph (HTTPS). Evita el SMTP saliente, bloqueado desde el hosting.
/// Si TenantId/ClientId/ClientSecret quedan vacíos se toman de la sección SharePoint (misma app de Azure).
/// La app necesita el permiso de aplicación Mail.Send con consentimiento de administrador.
/// </summary>
public sealed class GraphMailSettings
{
    public const string SectionName = "GraphMail";

    public bool Enabled { get; set; } = true;
    public string SenderMailbox { get; set; } = "TI2@cj-telecom.com";
    public string TenantId { get; set; } = string.Empty;
    public string ClientId { get; set; } = string.Empty;
    public string ClientSecret { get; set; } = string.Empty;
}
