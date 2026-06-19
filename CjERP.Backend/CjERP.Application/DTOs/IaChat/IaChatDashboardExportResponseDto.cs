namespace CjERP.Application.DTOs.IaChat;

public sealed class IaChatDashboardExportResponseDto
{
    public bool Success { get; set; }

    public string Module { get; set; } = "GASTOS";

    public string HtmlContent { get; set; } = string.Empty;

    public string FileName { get; set; } = "reporte-dashboard.pdf";

    public string? ErrorMessage { get; set; }
}
