namespace CjERP.Application.DTOs.IaChat;

public sealed class IaChatDashboardExportResponseDto
{
    public bool Success { get; set; }

    public string Module { get; set; } = "GASTOS";

    public string HtmlContent { get; set; } = string.Empty;

    public string FileName { get; set; } = "reporte-dashboard.pdf";

    public string? ErrorMessage { get; set; }

    // Movido desde IaChatService.FailureDashboard (paso 1.13 de docs/AI_COPILOT_IMPLEMENTATION_PLAN.md).
    // Vive en el propio DTO (no en IaChatService ni en IaDashboardExportService) para que ambos
    // consumidores construyan la misma respuesta de error sin que uno dependa del otro.
    public static IaChatDashboardExportResponseDto Failure(string module, string errorMessage) => new()
    {
        Success = false,
        Module = string.IsNullOrWhiteSpace(module) ? "GASTOS" : module,
        HtmlContent = string.Empty,
        ErrorMessage = errorMessage
    };
}
