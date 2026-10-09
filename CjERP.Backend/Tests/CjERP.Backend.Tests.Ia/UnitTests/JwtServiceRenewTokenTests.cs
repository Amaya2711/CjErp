using System.IdentityModel.Tokens.Jwt;
using CjERP.Api.Configuration;
using CjERP.Application.DTOs.Auth;
using CjERP.Infrastructure.Services;
using Microsoft.Extensions.Options;
using Xunit;

namespace CjERP.Backend.Tests.Ia.UnitTests;

/// <summary>
/// Renovación de sesión (POST /auth/refresh): el token nuevo debe conservar identidad, perfil/rol y SessionId,
/// y traer una vigencia posterior. Si cambiara el SessionId se cerraría la sesión activa del usuario.
/// </summary>
[Trait("Category", "Unit")]
public sealed class JwtServiceRenewTokenTests
{
    private static JwtService CreateService() => new(Options.Create(new JwtSettings
    {
        Key = "clave-de-prueba-con-longitud-suficiente-para-hs256-0123456789",
        Issuer = "CjERP.Api",
        Audience = "CjERP.Client",
        DurationInMinutes = 30,
    }));

    [Fact]
    public void RenewToken_conserva_claims_y_sessionId_con_vigencia_nueva()
    {
        var service = CreateService();
        var usuario = new LoginResponseDto
        {
            IdUsuario = "ADMIN",
            NombreEmpleado = "Empleado de prueba",
            Correo = "prueba@example.com",
            CodEmp = 1160,
            IdEmpleadoCj = 77,
            IdCargo = 14,
            CodVal = 5,
            Cuadrilla = 3,
            IdPerfil = 8,
            IdRol = 5,
        };

        var original = service.GenerateToken(usuario, "sesion-abc");
        var principal = service.ValidateToken(original);
        Assert.NotNull(principal);

        var renovado = service.RenewToken(principal!);
        var principalRenovado = service.ValidateToken(renovado);
        Assert.NotNull(principalRenovado);

        foreach (var claim in new[] { "IdUsuario", "NombreEmpleado", "Correo", "CodEmp", "IdEmpleadoCj", "IdCargo", "CodVal", "Cuadrilla", "IdPerfil", "IdRol", "SessionId" })
        {
            Assert.Equal(principal!.FindFirst(claim)?.Value, principalRenovado!.FindFirst(claim)?.Value);
        }
        Assert.Equal("sesion-abc", principalRenovado!.FindFirst("SessionId")?.Value);
        Assert.Equal("ADMIN", principalRenovado.Identity?.Name);

        var handler = new JwtSecurityTokenHandler();
        Assert.True(handler.ReadJwtToken(renovado).ValidTo >= handler.ReadJwtToken(original).ValidTo);
    }
}
