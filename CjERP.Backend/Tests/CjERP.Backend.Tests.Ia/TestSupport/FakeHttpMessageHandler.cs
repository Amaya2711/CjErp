using System.Net;
using System.Text;

namespace CjERP.Backend.Tests.Ia.TestSupport;

/// <summary>
/// Handler de HttpClient controlado por el test: cada llamada saliente (a OpenAI o a cualquier
/// endpoint) consume la siguiente respuesta encolada. No hay red real involucrada en ningún caso.
/// Si el código bajo prueba hace más llamadas HTTP de las esperadas, la cola se vacía y el handler
/// lanza una excepción explícita (en vez de colgarse o devolver silenciosamente un 500), lo que
/// convierte cualquier llamada HTTP inesperada en un fallo de test claro y accionable.
/// </summary>
public sealed class FakeHttpMessageHandler : HttpMessageHandler
{
    private readonly Queue<Func<HttpRequestMessage, HttpResponseMessage>> _responses = new();

    public int CallCount { get; private set; }

    public List<string> RequestBodies { get; } = [];

    /// <summary>Encola una respuesta 200 OK con el contenido JSON indicado (tal cual, sin envolver).</summary>
    public FakeHttpMessageHandler EnqueueJson(string jsonContent)
    {
        _responses.Enqueue(_ => new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent(jsonContent, Encoding.UTF8, "application/json")
        });
        return this;
    }

    public FakeHttpMessageHandler EnqueueStatus(HttpStatusCode statusCode, string body = "")
    {
        _responses.Enqueue(_ => new HttpResponseMessage(statusCode)
        {
            Content = new StringContent(body, Encoding.UTF8, "application/json")
        });
        return this;
    }

    protected override async Task<HttpResponseMessage> SendAsync(
        HttpRequestMessage request, CancellationToken cancellationToken)
    {
        CallCount++;

        if (request.Content is not null)
        {
            RequestBodies.Add(await request.Content.ReadAsStringAsync(cancellationToken));
        }

        if (_responses.Count == 0)
        {
            throw new InvalidOperationException(
                $"FakeHttpMessageHandler: se recibio una llamada HTTP #{CallCount} " +
                $"({request.Method} {request.RequestUri}) sin respuesta encolada. " +
                "Esto normalmente significa que el codigo bajo prueba hizo mas llamadas " +
                "de las que el test esperaba (por ejemplo, un segundo turno al planner).");
        }

        return _responses.Dequeue().Invoke(request);
    }
}
