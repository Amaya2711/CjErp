using CjERP.Infrastructure.Services;

namespace CjERP.Backend.Tests.Ia.TestSupport;

/// <summary>
/// Fake de <see cref="IOpenAiChatProvider"/> para probar GastosQueryPlanner sin HTTP real y sin
/// depender del formato de solicitud que arma OpenAiChatProvider. Devuelve, en orden, las respuestas
/// encoladas y registra los mensajes recibidos en cada llamada para poder hacer asserts sobre lo que
/// el planner le pidio al provider.
/// </summary>
internal sealed class FakeOpenAiChatProvider : IOpenAiChatProvider
{
    private readonly Queue<string> _responses = new();
    private readonly bool _hasConfiguration;
    private readonly string _configurationError;

    public List<List<OpenAiChatMessage>> ReceivedMessages { get; } = [];

    public FakeOpenAiChatProvider(bool hasConfiguration = true, string configurationError = "")
    {
        _hasConfiguration = hasConfiguration;
        _configurationError = configurationError;
    }

    public FakeOpenAiChatProvider EnqueueResponse(string rawResponse)
    {
        _responses.Enqueue(rawResponse);
        return this;
    }

    public bool HasConfiguration(out string errorMessage)
    {
        errorMessage = _configurationError;
        return _hasConfiguration;
    }

    public Task<string> SendChatCompletionAsync(
        List<OpenAiChatMessage> messages, CancellationToken cancellationToken, bool responseFormatJson)
    {
        ReceivedMessages.Add(messages);

        if (_responses.Count == 0)
        {
            throw new InvalidOperationException(
                "FakeOpenAiChatProvider: se recibio una llamada sin respuesta encolada.");
        }

        return Task.FromResult(_responses.Dequeue());
    }
}
