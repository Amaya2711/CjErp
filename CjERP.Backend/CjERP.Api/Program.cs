using System.Text;
using CjERP.Api.Configuration;
using CjERP.Api.Services;
using CjERP.Application.DTOs.ReportesWhatsapp;
using CjERP.Application.Interfaces;
using CjERP.Application.Interfaces.Repositories;
using CjERP.Application.Interfaces.Services;
using CjERP.Infrastructure.DependencyInjection;
using CjERP.Infrastructure.Repositories;
using CjERP.Infrastructure.Services;
using Hangfire;
using Hangfire.SqlServer;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.IdentityModel.Tokens;
using QuestPDF.Infrastructure;

var builder = WebApplication.CreateBuilder(args);

builder.Services.Configure<JwtSettings>(
    builder.Configuration.GetSection("JwtSettings"));
builder.Services.Configure<SharePointOptions>(
    builder.Configuration.GetSection(SharePointOptions.SectionName));
builder.Services.Configure<WupSettings>(
    builder.Configuration.GetSection("WupSettings"));
builder.Services.Configure<ReporteWhatsappJobDefaultsOptions>(
    builder.Configuration.GetSection("ReporteWhatsAppJobDefaults"));

var jwtSettings = builder.Configuration
    .GetSection("JwtSettings")
    .Get<JwtSettings>()!;
var allowedOrigins = builder.Configuration
    .GetSection("Cors:AllowedOrigins")
    .Get<string[]>()?
    .Where(origin => !string.IsNullOrWhiteSpace(origin))
    .ToArray() ?? Array.Empty<string>();

QuestPDF.Settings.License = LicenseType.Community;

builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase;
        options.JsonSerializerOptions.DictionaryKeyPolicy = System.Text.Json.JsonNamingPolicy.CamelCase;
    });
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddHangfire(configuration => configuration
    .SetDataCompatibilityLevel(CompatibilityLevel.Version_180)
    .UseSimpleAssemblyNameTypeSerializer()
    .UseRecommendedSerializerSettings()
    .UseSqlServerStorage(
        builder.Configuration.GetConnectionString("DefaultConnection"),
        new SqlServerStorageOptions
        {
            PrepareSchemaIfNecessary = true,
            QueuePollInterval = TimeSpan.FromSeconds(15),
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
builder.Services.AddScoped<IJwtService, JwtService>();
builder.Services.AddScoped<ISegPerfilService, SegPerfilService>();
builder.Services.AddScoped<ISegRolService, SegRolService>();
builder.Services.AddScoped<ISegMenuService, SegMenuService>();
builder.Services.AddScoped<ISegUsuarioService, SegUsuarioService>();
builder.Services.AddScoped<ISegRolMenuPermisoService, SegRolMenuPermisoService>();
builder.Services.AddScoped<ILookupService, LookupService>();
builder.Services.AddScoped<IEmpleadoCtaService, EmpleadoCtaService>();
builder.Services.AddScoped<IPlanillaService, PlanillaService>();
builder.Services.AddScoped<IPlanillaConsultaService, PlanillaConsultaService>();
builder.Services.AddScoped<IOrdenCompraService, OrdenCompraService>();
builder.Services.AddScoped<IAsistenciaReporteService, AsistenciaReporteService>();
builder.Services.AddScoped<IReporteRepository, ReporteRepository>();
builder.Services.AddScoped<IReportePdfService, ReportePdfService>();
builder.Services.AddScoped<IReporteAutomaticoService, ReporteAutomaticoService>();
builder.Services.AddScoped<IReporteWhatsappJobScheduler, ReporteWhatsappJobScheduler>();
builder.Services.AddSingleton<IReporteWhatsappRuntimeMonitor, ReporteWhatsappRuntimeMonitor>();
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
        if (allowedOrigins.Length > 0)
        {
            policy
                .WithOrigins(allowedOrigins)
                .AllowAnyHeader()
                .AllowAnyMethod();
        }
    });
});

builder.Services.AddAuthentication(options =>
{
    options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
})
.AddJwtBearer(options =>
{
    options.RequireHttpsMetadata = true;
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
});

builder.Services.AddAuthorization();

var app = builder.Build();

app.UseForwardedHeaders(new ForwardedHeadersOptions
{
    ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto
});

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseHttpsRedirection();
app.UseCors("ReactPolicy");
app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

using (var scope = app.Services.CreateScope())
{
    var scheduler = scope.ServiceProvider.GetRequiredService<IReporteWhatsappJobScheduler>();
    await scheduler.ReprogramarAsync();
}

app.Run();
