namespace CjERP.Application.DTOs.IaChat;

public sealed class IaChatChartResponseDto
{
    public string ChartType { get; set; } = "bar";

    public string Title { get; set; } = string.Empty;

    public string CategoryField { get; set; } = string.Empty;

    public string ValueField { get; set; } = string.Empty;

    public List<Dictionary<string, object?>> Rows { get; set; } = [];
}
