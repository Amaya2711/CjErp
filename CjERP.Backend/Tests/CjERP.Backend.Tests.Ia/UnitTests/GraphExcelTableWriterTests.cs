using System.Net;
using System.Text;
using System.Text.Json;
using CjERP.Infrastructure.Services.Graph;
using Xunit;

namespace CjERP.Backend.Tests.Ia.UnitTests;

/// <summary>
/// Actualización de la tabla de Excel en SharePoint (job GASTOS_EXCEL_SHAREPOINT) contra un Microsoft Graph simulado:
/// secuencia de llamadas, escritura por lotes, cierre de sesión aun con errores y validación de columnas.
/// </summary>
[Trait("Category", "Unit")]
public sealed class GraphExcelTableWriterTests
{
    private sealed record Call(HttpMethod Method, string Url, string? Session, string Body);

    private sealed class FakeGraph : HttpMessageHandler
    {
        private readonly string _bodyAddress;
        private readonly Func<Call, HttpStatusCode?>? _fail;

        public List<Call> Calls { get; } = [];

        public FakeGraph(string bodyAddress, Func<Call, HttpStatusCode?>? fail = null)
        {
            _bodyAddress = bodyAddress;
            _fail = fail;
        }

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            var session = request.Headers.TryGetValues("workbook-session-id", out var values) ? values.First() : null;
            var body = request.Content is null ? string.Empty : await request.Content.ReadAsStringAsync(cancellationToken);
            var call = new Call(request.Method, request.RequestUri!.AbsoluteUri, session, body);
            Calls.Add(call);

            if (_fail?.Invoke(call) is { } status)
            {
                return Json(status, "{\"error\":\"simulado\"}");
            }

            if (call.Url.EndsWith("/createSession")) return Json(HttpStatusCode.Created, "{\"id\":\"sesion-1\"}");
            if (call.Url.EndsWith("/dataBodyRange")) return Json(HttpStatusCode.OK, JsonSerializer.Serialize(new { address = _bodyAddress }));
            return Json(HttpStatusCode.OK, "{}");
        }

        private static HttpResponseMessage Json(HttpStatusCode status, string body) =>
            new(status) { Content = new StringContent(body, Encoding.UTF8, "application/json") };
    }

    private static List<object?[]> Rows(int count, int width = 10) =>
        Enumerable.Range(1, count)
            .Select(i => Enumerable.Range(0, width).Select(c => (object?)$"r{i}c{c}").ToArray())
            .ToList();

    [Fact]
    public async Task Limpia_la_tabla_y_escribe_por_lotes_cerrando_la_sesion()
    {
        var graph = new FakeGraph("Hoja1!A2:J5");
        using var http = new HttpClient(graph);

        var written = await GraphExcelTableWriter.ReplaceTableBodyAsync(
            http, "token", "drive-1", "item-1", "TBL_GASTOS", Rows(450), 200);

        Assert.Equal(450, written);

        var calls = graph.Calls;
        Assert.EndsWith("/workbook/createSession", calls[0].Url);
        Assert.Null(calls[0].Session);
        Assert.EndsWith("/workbook/tables/TBL_GASTOS/dataBodyRange", calls[1].Url);
        Assert.Contains("/worksheets('Hoja1')/range(address='A2:J5')/clear", calls[2].Url);
        Assert.Equal(HttpMethod.Post, calls[2].Method);
        Assert.Contains("\"applyTo\":\"all\"", calls[2].Body);

        var patches = calls.Where(c => c.Method == HttpMethod.Patch).ToList();
        Assert.Equal(3, patches.Count);
        Assert.Contains("range(address='A2:J201')", patches[0].Url);
        Assert.Contains("range(address='A202:J401')", patches[1].Url);
        Assert.Contains("range(address='A402:J451')", patches[2].Url);
        Assert.Equal(200, JsonDocument.Parse(patches[0].Body).RootElement.GetProperty("values").GetArrayLength());
        Assert.Equal(50, JsonDocument.Parse(patches[2].Body).RootElement.GetProperty("values").GetArrayLength());

        Assert.EndsWith("/workbook/closeSession", calls[^1].Url);
        Assert.All(calls.Skip(1), c => Assert.Equal("sesion-1", c.Session));
    }

    [Fact]
    public async Task Respeta_la_hoja_con_espacios_y_la_primera_columna_de_la_tabla()
    {
        var graph = new FakeGraph("'Mi Hoja'!B3:K10");
        using var http = new HttpClient(graph);

        await GraphExcelTableWriter.ReplaceTableBodyAsync(http, "token", "d", "i", "TBL_GASTOS", Rows(2), 200);

        var patch = Assert.Single(graph.Calls, c => c.Method == HttpMethod.Patch);
        Assert.Contains("worksheets('Mi%20Hoja')", patch.Url);
        Assert.Contains("range(address='B3:K4')", patch.Url);
    }

    [Fact]
    public async Task Si_falla_la_escritura_igual_cierra_la_sesion()
    {
        var graph = new FakeGraph("Hoja1!A2:J5", c => c.Method == HttpMethod.Patch ? HttpStatusCode.InternalServerError : null);
        using var http = new HttpClient(graph);

        var ex = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            GraphExcelTableWriter.ReplaceTableBodyAsync(http, "token", "d", "i", "TBL_GASTOS", Rows(10), 200));

        Assert.Contains("escribir las filas", ex.Message);
        Assert.EndsWith("/workbook/closeSession", graph.Calls[^1].Url);
    }

    [Fact]
    public async Task Si_la_tabla_tiene_menos_columnas_no_limpia_ni_escribe()
    {
        var graph = new FakeGraph("Hoja1!A2:H5"); // 8 columnas; se envían 10
        using var http = new HttpClient(graph);

        var ex = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            GraphExcelTableWriter.ReplaceTableBodyAsync(http, "token", "d", "i", "TBL_GASTOS", Rows(5), 200));

        Assert.Contains("8 columnas", ex.Message);
        Assert.DoesNotContain(graph.Calls, c => c.Url.Contains("/clear"));
        Assert.DoesNotContain(graph.Calls, c => c.Method == HttpMethod.Patch);
        Assert.EndsWith("/workbook/closeSession", graph.Calls[^1].Url);
    }

    [Fact]
    public async Task Sin_filas_no_llama_a_graph()
    {
        var graph = new FakeGraph("Hoja1!A2:J5");
        using var http = new HttpClient(graph);

        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            GraphExcelTableWriter.ReplaceTableBodyAsync(http, "token", "d", "i", "TBL_GASTOS", [], 200));

        Assert.Empty(graph.Calls);
    }
}
