using CjERP.Api.Configuration;
using CjERP.Application.Interfaces.Services;
using CjERP.Infrastructure.Persistence.Context;
using CjERP.Infrastructure.Persistence.Sql;
using CjERP.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

namespace CjERP.Infrastructure.DependencyInjection
{
    public static class InfrastructureServiceRegistrationExtensions
    {
        public static IServiceCollection AddInfrastructure(
            this IServiceCollection services,
            IConfiguration configuration)
        {
            var sqlSettingsSection = configuration.GetSection("SqlSettings");
            var sqlSettings = new SqlSettings
            {
                DefaultCommandTimeoutSeconds = GetInt(sqlSettingsSection["DefaultCommandTimeoutSeconds"], 60),
                ConnectTimeoutSeconds = GetInt(sqlSettingsSection["ConnectTimeoutSeconds"], 15),
                MaxPoolSize = GetInt(sqlSettingsSection["MaxPoolSize"], 100),
                Encrypt = GetBool(sqlSettingsSection["Encrypt"], false),
                TrustServerCertificate = GetBool(sqlSettingsSection["TrustServerCertificate"], true),
                SlowRequestThresholdMs = GetInt(sqlSettingsSection["SlowRequestThresholdMs"], 1500),
                RateLimitPermitLimit = GetInt(sqlSettingsSection["RateLimitPermitLimit"], 120),
                RateLimitWindowSeconds = GetInt(sqlSettingsSection["RateLimitWindowSeconds"], 60)
            };
            var sqlCommandFactory = new SqlCommandFactory(configuration, Options.Create(sqlSettings));

            services.AddSingleton<ISqlCommandFactory>(sqlCommandFactory);
            services.AddScoped<ISqlMonitorService, SqlMonitorService>();

            services.AddDbContext<CJERPDbContext>(options =>
                options.UseSqlServer(
                    sqlCommandFactory.ConnectionString,
                    sqlOptions => sqlOptions.CommandTimeout(sqlSettings.DefaultCommandTimeoutSeconds)));

            return services;
        }

        private static int GetInt(string? value, int defaultValue)
        {
            return int.TryParse(value, out var parsed) ? parsed : defaultValue;
        }

        private static bool GetBool(string? value, bool defaultValue)
        {
            return bool.TryParse(value, out var parsed) ? parsed : defaultValue;
        }
    }
}
