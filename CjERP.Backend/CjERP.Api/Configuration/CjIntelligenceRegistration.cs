using CjERP.Application.Interfaces.Services.AI;
using CjERP.Infrastructure.Persistence.Sql;
using CjERP.Infrastructure.Services;
using CjERP.Infrastructure.Services.AI.CjIntelligence;
using Microsoft.Extensions.Logging;

namespace CjERP.Api.Configuration;

/// <summary>
/// Registro de CJ Intelligence. NO esta conectado a Program.cs: al aprobarse el despliegue se agrega UNA linea
/// (builder.Services.AddCjIntelligence(builder.Configuration)). Solo registra el modulo si se cumplen LAS TRES condiciones:
///   1. CjIntelligence:Enabled = true
///   2. la cadena ConnectionStrings:CjIntelligence (usuario cj_ia; nunca se usa DefaultConnection)
///   3. CjIntelligence:LoginReuseControlResolved = true: confirmacion EXPLICITA de que ya se resolvio la reutilizacion de logins (un login
///      eliminado y reutilizado heredaria el historial de conversaciones; es un riesgo abierto que bloquea habilitar el modulo para usuarios).
/// En cualquier otro caso no registra nada y el modulo queda deshabilitado (el chat anterior no cambia).
/// No reemplaza ningun registro existente: el servicio de autorizacion de CJ Intelligence se construye aparte, con sus
/// propios almacenes (conexion cj_ia), para no tocar IIaPermissionStore/IIaAuthorizationService del chat anterior.
/// </summary>
public static class CjIntelligenceRegistration
{
    public static IServiceCollection AddCjIntelligence(this IServiceCollection services, IConfiguration configuration)
    {
        var enabled = string.Equals(configuration["CjIntelligence:Enabled"], "true", StringComparison.OrdinalIgnoreCase);
        var hasConnection = !string.IsNullOrWhiteSpace(configuration.GetConnectionString(CjIntelligenceSqlCommandFactory.ConnectionName));
        var loginReuseResolved = string.Equals(configuration["CjIntelligence:LoginReuseControlResolved"], "true", StringComparison.OrdinalIgnoreCase);
        if (!enabled || !hasConnection || !loginReuseResolved)
        {
            return services;
        }

        var options = new CjIntelligenceOptions();
        configuration.GetSection("CjIntelligence").Bind(options);
        services.AddSingleton(options);

        services.AddSingleton<ICjIntelligenceSqlCommandFactory, CjIntelligenceSqlCommandFactory>();
        services.AddSingleton<ICjIntelligenceAuthorizationData, SqlCjIntelligenceAuthorizationData>();
        services.AddSingleton<ICjIntelligenceConversationStore, SqlCjIntelligenceConversationStore>();
        services.AddSingleton<ICjIntelligencePagosGateway, SqlCjIntelligencePagosGateway>();

        services.AddSingleton<ICjIntelligenceScopeResolver>(sp =>
        {
            var data = sp.GetRequiredService<ICjIntelligenceAuthorizationData>();
            var authorization = new IaAuthorizationService(
                new CjIntelligencePermissionStore(data, sp.GetRequiredService<ILogger<CjIntelligencePermissionStore>>()),
                new CjIntelligenceEmployeeDirectory(data),
                sp.GetRequiredService<ILogger<IaAuthorizationService>>());
            return new CjIntelligenceScopeResolver(authorization, sp.GetRequiredService<ILogger<CjIntelligenceScopeResolver>>());
        });

        services.AddHttpClient<IOpenAiToolChatProvider, OpenAiToolChatProvider>(client => client.Timeout = TimeSpan.FromSeconds(90));
        services.AddScoped<ICjIntelligenceChatService, CjIntelligenceChatService>();
        return services;
    }
}
