namespace CjERP.Shared.Configuration;

public sealed class OpenAiSettings
{
    public string ApiKey { get; set; } = string.Empty;

    public string Model { get; set; } = "gpt-4.1-mini";

    public int MaxTokens { get; set; } = 1500;
}
