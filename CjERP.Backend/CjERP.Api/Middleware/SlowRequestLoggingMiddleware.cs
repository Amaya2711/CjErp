using System.Diagnostics;

namespace CjERP.Api.Middleware;

public sealed class SlowRequestLoggingMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<SlowRequestLoggingMiddleware> _logger;
    private readonly int _thresholdMs;

    public SlowRequestLoggingMiddleware(
        RequestDelegate next,
        ILogger<SlowRequestLoggingMiddleware> logger,
        IConfiguration configuration)
    {
        _next = next;
        _logger = logger;
        _thresholdMs = configuration.GetSection("SqlSettings").GetValue<int?>("SlowRequestThresholdMs") ?? 1500;
    }

    public async Task Invoke(HttpContext context)
    {
        var stopwatch = Stopwatch.StartNew();
        await _next(context);
        stopwatch.Stop();

        if (stopwatch.ElapsedMilliseconds < _thresholdMs)
        {
            return;
        }

        var userId = context.User?.FindFirst("IdUsuario")?.Value ?? context.User?.Identity?.Name ?? "anon";
        _logger.LogWarning(
            "Slow request detected. {Method} {Path} responded {StatusCode} in {ElapsedMs} ms. User={UserId} TraceId={TraceId}",
            context.Request.Method,
            context.Request.Path,
            context.Response.StatusCode,
            stopwatch.ElapsedMilliseconds,
            userId,
            context.TraceIdentifier);
    }
}
