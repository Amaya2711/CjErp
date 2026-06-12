namespace CjERP.Shared.Configuration;

public sealed class AnthropicSettings
{
    public string ApiKey { get; set; } = string.Empty;

    public string Model { get; set; } = string.Empty;

    public int MaxTokens { get; set; } = 1500;
}
