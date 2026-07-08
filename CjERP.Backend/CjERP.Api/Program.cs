using System.Text;
using System.Threading.RateLimiting;
using System.IO.Compression;
using CjERP.Api.Configuration;
using CjERP.Api.Health;
using CjERP.Api.Middleware;
using CjERP.Api.Services;
using CjERP.Application.DTOs.ReportesWhatsapp;
using CjERP.Application.DTOs.WhatsappInbound;
using CjERP.Application.Interfaces;
using CjERP.Application.Interfaces.Repositories;
using CjERP.Application.Interfaces.Services;
using CjERP.Infrastructure.DependencyInjection;
using CjERP.Infrastructure.Repositories;
using CjERP.Infrastructure.Services;
using CjERP.Shared.Configuration;
using Hangfire;
using Hangfire.SqlServer;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.ResponseCompression;
using Microsoft.IdentityModel.Tokens;
using QuestPDF.Infrastructure;

var builder = WebApplication.CreateBuilder(args);

builder.Services.Configure<JwtSettings>(
    builder.Configuration.GetSection("JwtSettings"));
builder.Services.Configure<SessionSettings>(
    builder.Configuration.GetSection("SessionSettings"));
builder.Services.Configure<SqlSettings>(
    builder.Configuration.GetSection("SqlSettings"));
builder.Services.Configure<SmtpSettings>(
    builder.Configuration.GetSection("SmtpSettings"));
builder.Services.Configure<SharePointOptions>(
    builder.Configuration.GetSection(SharePointOptions.SectionName));
builder.Services.Configure<PlanillaXmlOptions>(
    builder.Configuration.GetSection(PlanillaXmlOptions.SectionName));
builder.Services.Configure<WupSettings>(
    builder.Configuration.GetSection("WupSettings"));
builder.Services.Configure<WhatsappInboundSettings>(
    builder.Configuration.GetSection("WhatsappInboundSettings"));
builder.Services.Configure<MetaWhatsAppSettings>(
    builder.Configuration.GetSection("MetaWhatsAppSettings"));
builder.Services.Configure<ReporteWhatsappJobDefaultsOptions>(
    builder.Configuration.GetSection("ReporteWhatsAppJobDefaults"));
builder.Services.Configure<OpenAiSettings>(
    builder.Configuration.GetSection("OpenAI"));
builder.Services.Configure<AnthropicSettings>(
    builder.Configuration.GetSection("Anthropic"));

var openAiSettings = builder.Configuration
    .GetSection("OpenAI")
    .Get<OpenAiSettings>() ?? new OpenAiSettings();
var openAiApiKey = Environment.GetEnvironmentVariable("OPENAI_API_KEY");
if (!string.IsNullOrWhiteSpace(openAiApiKey))
{
    openAiSettings.ApiKey = openAiApiKey;
}

var openAiModel = Environment.GetEnvironmentVariable("OPENAI_MODEL");
if (!string.IsNullOrWhiteSpace(openAiModel))
{
    openAiSettings.Model = openAiModel;
}

builder.Services.AddSingleton(Microsoft.Extensions.Options.Options.Create(openAiSettings));

var anthropicSettings = builder.Configuration
    .GetSection("Anthropic")
    .Get<AnthropicSettings>() ?? new AnthropicSettings();
var anthropicApiKey = Environment.GetEnvironmentVariable("ANTHROPIC_API_KEY");
if (!string.IsNullOrWhiteSpace(anthropicApiKey))
{
    anthropicSettings.ApiKey = anthropicApiKey;
}

var anthropicModel = Environment.GetEnvironmentVariable("ANTHROPIC_MODEL");
if (!string.IsNullOrWhiteSpace(anthropicModel))
{
    anthropicSettings.Model = anthropicModel;
}

var anthropicMaxTokens = Environment.GetEnvironmentVariable("ANTHROPIC_MAX_TOKENS");
if (int.TryParse(anthropicMaxTokens, out var parsedAnthropicMaxTokens) && parsedAnthropicMaxTokens > 0)
{
    anthropicSettings.MaxTokens = parsedAnthropicMaxTokens;
}

builder.Services.AddSingleton(Microsoft.Extensions.Options.Options.Create(anthropicSettings));

var jwtSettings = builder.Configuration
    .GetSection("JwtSettings")
    .Get<JwtSettings>()!;
var configuredOrigins = builder.Configuration
    .GetSection("Cors:AllowedOrigins")
    .Get<string[]>()?
    .Where(origin => !string.IsNullOrWhiteSpace(origin))
    .ToArray() ?? Array.Empty<string>();
var defaultCorsOrigins = new[]
{
    "https://cj-erp.vercel.app",
    "http://localhost:5173",
    "https://localhost:5173"
};
var allowedOrigins = configuredOrigins
    .Concat(defaultCorsOrigins)
    .Where(origin => !string.IsNullOrWhiteSpace(origin))
    .Distinct(StringComparer.OrdinalIgnoreCase)
    .ToArray();

QuestPDF.Settings.License = LicenseType.Community;
var defaultConnection = builder.Configuration.GetConnectionString("DefaultConnection");

if (string.IsNullOrWhiteSpace(defaultConnection) ||
    defaultConnection.Contains("SET_VIA_ENVIRONMENT_OR_LOCAL_SETTINGS", StringComparison.OrdinalIgnoreCase))
{
    throw new InvalidOperationException(
        "ConnectionStrings:DefaultConnection no esta configurada. Definela en appsettings.Development.json o mediante variable de entorno antes de iniciar la API.");
}

builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase;
        options.JsonSerializerOptions.DictionaryKeyPolicy = System.Text.Json.JsonNamingPolicy.CamelCase;
    });
builder.Services.AddResponseCompression(options =>
{
    options.EnableForHttps = true;
    options.Providers.Add<BrotliCompressionProvider>();
    options.Providers.Add<GzipCompressionProvider>();
});
builder.Services.AddResponseCaching();
builder.Services.Configure<BrotliCompressionProviderOptions>(options =>
{
    options.Level = CompressionLevel.Fastest;
});
builder.Services.Configure<GzipCompressionProviderOptions>(options =>
{
    options.Level = CompressionLevel.Fastest;
});
builder.Services.AddEndpointsApiExplorer();
var sqlSettings = builder.Configuration
    .GetSection("SqlSettings")
    .Get<SqlSettings>() ?? new SqlSettings();
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.AddFixedWindowLimiter("api", limiterOptions =>
    {
        limiterOptions.PermitLimit = sqlSettings.RateLimitPermitLimit;
        limiterOptions.Window = TimeSpan.FromSeconds(sqlSettings.RateLimitWindowSeconds);
        limiterOptions.QueueLimit = 0;
    });
});
builder.Services.AddHealthChecks()
    .AddCheck<SqlServerHealthCheck>("sqlserver");
builder.Services.AddHangfire(configuration => configuration
    .SetDataCompatibilityLevel(CompatibilityLevel.Version_180)
    .UseSimpleAssemblyNameTypeSerializer()
    .UseRecommendedSerializerSettings()
    .UseSqlServerStorage(
        defaultConnection,
        new SqlServerStorageOptions
        {
            PrepareSchemaIfNecessary = true,
            QueuePollInterval = TimeSpan.FromSeconds(1),
            CommandBatchMaxTimeout = TimeSpan.FromMinutes(5),
            SlidingInvisibilityTimeout = TimeSpan.FromMinutes(5),
            UseRecommendedIsolationLevel = true
        }));
builder.Services.AddHangfireServer();

builder.Services.AddSwaggerGen(options =>
{
    options.SwaggerDoc("v1", new() { Title = "CjERP API", Version = "v1" });

    options.AddSecurityDefinition("Bearer", new Microsoft.OpenApi.Models.OpenApiSecurityScheme
    {
        Name = "Authorization",
        Type = Microsoft.OpenApi.Models.SecuritySchemeType.Http,
        Scheme = "bearer",
        BearerFormat = "JWT",
        In = Microsoft.OpenApi.Models.ParameterLocation.Header,
        Description = "Ingrese el token JWT así: Bearer {token}"
    });

    options.AddSecurityRequirement(new Microsoft.OpenApi.Models.OpenApiSecurityRequirement
    {
        {
            new Microsoft.OpenApi.Models.OpenApiSecurityScheme
            {
                Reference = new Microsoft.OpenApi.Models.OpenApiReference
                {
                    Type = Microsoft.OpenApi.Models.ReferenceType.SecurityScheme,
                    Id = "Bearer"
                }
            },
            Array.Empty<string>()
        }
    });
});

builder.Services.AddInfrastructure(builder.Configuration);

builder.Services.AddScoped<IAuthService, AuthService>();
builder.Services.AddSingleton<IActiveUserSessionService, ActiveUserSessionService>();
builder.Services.AddHostedService<ActiveUserSessionCleanupHostedService>();
builder.Services.AddScoped<IJwtService, JwtService>();
builder.Services.AddScoped<ISegPerfilService, SegPerfilService>();
builder.Services.AddScoped<ISegRolService, SegRolService>();
builder.Services.AddScoped<ISegMenuService, SegMenuService>();
builder.Services.AddScoped<ISegUsuarioService, SegUsuarioService>();
builder.Services.AddScoped<ISegRolMenuPermisoService, SegRolMenuPermisoService>();
builder.Services.AddScoped<ILookupService, LookupService>();
builder.Services.AddScoped<IEmpleadoCtaService, EmpleadoCtaService>();
builder.Services.AddScoped<IChequeEmpleadoService, ChequeEmpleadoService>();
builder.Services.AddScoped<IPlanillaService, PlanillaService>();
builder.Services.AddScoped<IPlanillaBoletaService, PlanillaBoletaService>();
builder.Services.AddScoped<PlanillaBoletaPdfGenerator>();
builder.Services.AddScoped<IPlanillaConsultaService, PlanillaConsultaService>();
builder.Services.AddHttpClient<IConciliacionBcpService, ConciliacionBcpService>(client =>
{
    client.BaseAddress = new Uri("https://api.openai.com");
    client.Timeout = TimeSpan.FromSeconds(120);
});
builder.Services.AddScoped<IVacacionesService, VacacionesService>();
builder.Services.AddScoped<IOrdenCompraService, OrdenCompraService>();
builder.Services.AddScoped<IEmpleadoPendienteService, EmpleadoPendienteService>();
builder.Services.AddScoped<ILogisticaRecojoService, LogisticaRecojoService>();
builder.Services.AddScoped<ILogisticaReembolsoService, LogisticaReembolsoService>();
builder.Services.AddScoped<ILogisticaSuministroService, LogisticaSuministroService>();
builder.Services.AddScoped<ICompensacionService, CompensacionService>();
builder.Services.AddScoped<IAuditoriaCambiosService, AuditoriaCambiosService>();
builder.Services.AddScoped<IAsistenciaReporteService, AsistenciaReporteService>();
builder.Services.AddScoped<IAsistenciaValidarCampoService, AsistenciaValidarCampoService>();
builder.Services.AddScoped<IReporteRepository, ReporteRepository>();
builder.Services.AddScoped<IPlanillaBoletaRepository, PlanillaBoletaRepository>();
builder.Services.AddScoped<IReportePdfService, ReportePdfService>();
builder.Services.AddScoped<IReporteAutomaticoService, ReporteAutomaticoService>();
builder.Services.AddScoped<IReporteWhatsappJobScheduler, ReporteWhatsappJobScheduler>();
builder.Services.AddScoped<IWhatsappInboundService, WhatsappInboundService>();
builder.Services.AddHttpClient<IMetaWhatsAppService, MetaWhatsAppService>(client =>
{
    client.BaseAddress = new Uri("https://graph.facebook.com/");
    client.Timeout = TimeSpan.FromSeconds(60);
});
builder.Services.AddSingleton<IReporteWhatsappRuntimeMonitor, ReporteWhatsappRuntimeMonitor>();
builder.Services.AddHttpClient<IIaChatService, IaChatService>(client =>
{
    client.BaseAddress = new Uri("https://api.openai.com");
    client.Timeout = TimeSpan.FromSeconds(90);
});
builder.Services.AddHttpClient<ISharePointCommercialUploadService, SharePointCommercialUploadService>();
builder.Services.AddHttpClient<IWupAuthService, WupAuthService>((serviceProvider, client) =>
{
    var settings = serviceProvider.GetRequiredService<Microsoft.Extensions.Options.IOptions<WupSettings>>().Value;
    var baseUri = settings.TryBuildBaseUri();
    if (baseUri is not null)
    {
        client.BaseAddress = baseUri;
    }

    client.Timeout = TimeSpan.FromSeconds(Math.Max(30, settings.TimeoutSeconds));
});
builder.Services.AddHttpClient<IWupService, WupService>((serviceProvider, client) =>
{
    var settings = serviceProvider.GetRequiredService<Microsoft.Extensions.Options.IOptions<WupSettings>>().Value;
    var baseUri = settings.TryBuildBaseUri();
    if (baseUri is not null)
    {
        client.BaseAddress = baseUri;
    }

    client.Timeout = TimeSpan.FromSeconds(Math.Max(30, settings.TimeoutSeconds));
});

builder.Services.AddCors(options =>
{
    options.AddPolicy("ReactPolicy", policy =>
    {
        policy
            .WithOrigins(allowedOrigins)
            .AllowAnyHeader()
            .AllowAnyMethod();
    });
});

builder.Services.AddAuthentication(options =>
{
    options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
})
.AddJwtBearer(options =>
{
    options.RequireHttpsMetadata = !builder.Environment.IsDevelopment();
    options.SaveToken = true;
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuer = true,
        ValidateAudience = true,
        ValidateLifetime = true,
        ValidateIssuerSigningKey = true,
        ValidIssuer = jwtSettings.Issuer,
        ValidAudience = jwtSettings.Audience,
        IssuerSigningKey = new SymmetricSecurityKey(
            Encoding.UTF8.GetBytes(jwtSettings.Key)),
        ClockSkew = TimeSpan.Zero
    };
    options.Events = new JwtBearerEvents
    {
        OnTokenValidated = context =>
        {
            var userId = context.Principal?.FindFirst("IdUsuario")?.Value
                         ?? context.Principal?.Identity?.Name;
            var sessionId = context.Principal?.FindFirst("SessionId")?.Value;

            if (string.IsNullOrWhiteSpace(userId) || string.IsNullOrWhiteSpace(sessionId))
            {
                context.Fail("Sesion invalida.");
                return Task.CompletedTask;
            }

            var activeSessionService = context.HttpContext.RequestServices.GetRequiredService<IActiveUserSessionService>();
            if (!activeSessionService.ValidateAndRefreshSession(userId, sessionId))
            {
                context.Fail("La sesion expiro o ya no esta activa.");
            }

            return Task.CompletedTask;
        }
    };
});

builder.Services.AddAuthorization();

var app = builder.Build();

app.Logger.LogInformation(
    "OpenAI config loaded. ApiKeyFromEnv={ApiKeyFromEnv} ApiKeyConfigured={ApiKeyConfigured} ModelFromEnv={ModelFromEnv} Model={Model} MaxTokens={MaxTokens}",
    !string.IsNullOrWhiteSpace(openAiApiKey),
    !string.IsNullOrWhiteSpace(openAiSettings.ApiKey),
    !string.IsNullOrWhiteSpace(openAiModel),
    string.IsNullOrWhiteSpace(openAiSettings.Model) ? "(vacío)" : openAiSettings.Model,
    openAiSettings.MaxTokens);

app.Logger.LogInformation(
    "Anthropic config loaded. ApiKeyFromEnv={ApiKeyFromEnv} ApiKeyConfigured={ApiKeyConfigured} ModelFromEnv={ModelFromEnv} Model={Model} MaxTokens={MaxTokens}",
    !string.IsNullOrWhiteSpace(anthropicApiKey),
    !string.IsNullOrWhiteSpace(anthropicSettings.ApiKey),
    !string.IsNullOrWhiteSpace(anthropicModel),
    string.IsNullOrWhiteSpace(anthropicSettings.Model) ? "(vacio)" : anthropicSettings.Model,
    anthropicSettings.MaxTokens);

app.UseExceptionHandler(exceptionApp =>
{
    exceptionApp.Run(async context =>
    {
        var exceptionFeature = context.Features.Get<IExceptionHandlerFeature>();
        var exception = exceptionFeature?.Error;

        context.Response.StatusCode = StatusCodes.Status500InternalServerError;
        context.Response.ContentType = "application/json";
        await context.Response.WriteAsJsonAsync(new
        {
            success = false,
            message = "Ocurrio un error interno al procesar la solicitud.",
            detail = app.Environment.IsDevelopment() ? exception?.Message : null,
            exceptionType = app.Environment.IsDevelopment() ? exception?.GetType().FullName : null
        });
    });
});

app.UseForwardedHeaders(new ForwardedHeadersOptions
{
    ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto
});

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

if (!app.Environment.IsDevelopment())
{
    app.UseHttpsRedirection();
}

app.UseResponseCompression();
app.UseMiddleware<SlowRequestLoggingMiddleware>();
app.UseCors("ReactPolicy");
app.UseRateLimiter();
app.UseResponseCaching();
app.UseAuthentication();
app.UseAuthorization();

app.MapControllers().RequireRateLimiting("api");
app.MapHealthChecks("/health").RequireRateLimiting("api");

using (var scope = app.Services.CreateScope())
{
    var scheduler = scope.ServiceProvider.GetRequiredService<IReporteWhatsappJobScheduler>();
    await scheduler.ReprogramarAsync(ReporteWhatsappTipos.Operativo);
    await scheduler.ReprogramarAsync(ReporteWhatsappTipos.Gerencial);
}

app.Run();
