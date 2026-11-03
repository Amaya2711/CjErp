// CJ Intelligence: identidad del usuario y verificacion de lo que SQL aplico.
//
// FLUJO DE LA IDENTIDAD (docs/CJ_INTELLIGENCE_DISENO.md, seccion 2):
//   login -> sp_ValidarUsuario -> JwtService firma el claim "IdUsuario" (= dbo.Usuario.IdUsuario, nombre de usuario, texto)
//   -> JwtBearer valida firma, emisor, audiencia y vigencia -> OnTokenValidated exige sesion activa
//   -> el controlador lee SOLO el claim "IdUsuario" (nunca body, query, cabeceras ni argumentos del modelo)
//   -> se pasa como parametro @IdUsuario a los procedimientos sp_IA_Cj_*, que lo revalidan con fn_IA_Cj_UsuarioActivo.
// Los argumentos de las herramientas que genera el modelo NO incluyen usuario ni empleados: el esquema de cada
// herramienta debe rechazarlos (additionalProperties = false).
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using CjERP.Application.Interfaces.Services.AI;

namespace CjERP.Infrastructure.Services.AI.CjIntelligence;

public static class CjIntelligenceIdentity
{
    public const string ClaimType = "IdUsuario";

    /// <summary>Longitud de dbo.Usuario.IdUsuario (nvarchar(50)).</summary>
    public const int MaxLength = 50;

    /// <summary>
    /// Devuelve el nombre de usuario del claim "IdUsuario". Falso si falta, esta vacio, excede la longitud, contiene
    /// caracteres de control o hay varios claims con valores distintos. Sin respaldo a otros claims ni a Identity.Name.
    /// </summary>
    public static bool TryGetLogin(ClaimsPrincipal? user, out string login)
    {
        login = string.Empty;
        if (user is null)
        {
            return false;
        }

        var values = user.FindAll(ClaimType)
            .Select(c => c.Value?.Trim() ?? string.Empty)
            .Distinct(StringComparer.Ordinal)
            .ToList();

        if (values.Count != 1)
        {
            return false;
        }

        var value = values[0];
        if (value.Length is 0 or > MaxLength || value.Any(char.IsControl))
        {
            return false;
        }

        login = value;
        return true;
    }
}

/// <summary>
/// El backend resuelve el alcance (IaAuthorizationService) y SQL lo deriva de nuevo desde el usuario. Esta verificacion
/// compara ambos: si difieren, se falla cerrado y no se entrega nada al modelo. Calcula tambien el AlcanceHash.
/// </summary>
public static class CjIntelligenceScopeEvidence
{
    public static string LevelCode(IaScopeLevel level) => level switch
    {
        IaScopeLevel.Propio => "PROPIO",
        IaScopeLevel.Equipo => "EQUIPO",
        IaScopeLevel.Total => "TOTAL",
        _ => "DESCONOCIDO"
    };

    /// <summary>true solo si el nivel y el conjunto de empleados aplicados por SQL coinciden EXACTAMENTE con los esperados.</summary>
    public static bool Matches(IaResolvedScope expected, string? appliedLevel, string? appliedEmployees)
    {
        if (expected is null || !string.Equals(appliedLevel?.Trim(), LevelCode(expected.Level), StringComparison.Ordinal))
        {
            return false;
        }

        if (expected.Level == IaScopeLevel.Total)
        {
            return string.IsNullOrWhiteSpace(appliedEmployees);
        }

        if (string.IsNullOrWhiteSpace(appliedEmployees))
        {
            return false;
        }

        var parts = appliedEmployees.Split(',', StringSplitOptions.TrimEntries);
        var ids = new List<int>(parts.Length);
        foreach (var part in parts)
        {
            if (!int.TryParse(part, System.Globalization.NumberStyles.None, System.Globalization.CultureInfo.InvariantCulture, out var id) || id <= 0)
            {
                return false;
            }

            ids.Add(id);
        }

        return ids.Distinct().OrderBy(i => i).SequenceEqual(expected.EmployeeIds);
    }

    /// <summary>SHA-256 (hex, 64) del nivel y los empleados aplicados; sirve de huella en IA_ResultadoConsulta.AlcanceHash.</summary>
    public static string Hash(string appliedLevel, string? appliedEmployees)
    {
        var canonical = $"{appliedLevel?.Trim()}|{appliedEmployees?.Trim() ?? string.Empty}";
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(canonical)));
    }
}
