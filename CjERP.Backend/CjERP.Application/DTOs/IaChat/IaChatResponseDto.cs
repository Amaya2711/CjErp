namespace CjERP.Application.DTOs.IaChat;

public sealed class IaChatResponseDto
{
    public bool Success { get; set; }

    public string Module { get; set; } = "GASTOS";

    public string Answer { get; set; } = string.Empty;

    public string ResponseType { get; set; } = "conversation";

    public Dictionary<string, object?>? InterpretedFilters { get; set; }

    public List<Dictionary<string, object?>>? DetailRows { get; set; }

    public Dictionary<string, object?>? Summary { get; set; }

    public IaChatChartResponseDto? Chart { get; set; }

    public int? TotalRows { get; set; }

    public string? ErrorMessage { get; set; }
}
