using System.Data;
using CjERP.Application.DTOs.Auth;
using CjERP.Application.Interfaces.Services;
using CjERP.Infrastructure.Persistence.Sql;
using Dapper;
using Microsoft.Extensions.Logging;

namespace CjERP.Infrastructure.Services
{
    public class AuthService : IAuthService
    {
        // Par PERFIL-ROL "ESTANDAR"-"ESTANDAR" (IdPerfilRol 28) y perfil "ESTANDAR" de EmpleadoCjPerfil (PV: validar ids en BD).
        private const int PerfilEstandar = 14;
        private const int RolEstandar = 7;
        private static readonly int[] PerfilesEmpleadoPorDefecto = { 10, 11 };
        private const int IdCreacionPorDefecto = 999;

        private readonly ISqlCommandFactory _sqlCommandFactory;
        private readonly ISegMenuService _segMenuService;
        private readonly ILogger<AuthService> _logger;

        public AuthService(
            ISqlCommandFactory sqlCommandFactory,
            ISegMenuService segMenuService,
            ILogger<AuthService> logger)
        {
            _sqlCommandFactory = sqlCommandFactory;
            _segMenuService = segMenuService;
            _logger = logger;
        }

        public async Task<LoginResponseDto?> LoginAsync(LoginRequestDto request, CancellationToken cancellationToken = default)
        {
            await using var connection = _sqlCommandFactory.CreateConnection();

            var requestedUser = request.IdUsuario?.Trim();

            var parameters = new DynamicParameters();
            parameters.Add("@pIdUsuario", requestedUser, DbType.String);
            parameters.Add("@pClave", request.Clave, DbType.String);

            var result = await connection.QueryFirstOrDefaultAsync<LoginResponseDto>(
                _sqlCommandFactory.Create(
                    "dbo.sp_ValidarUsuario",
                    parameters,
                    CommandType.StoredProcedure,
                    cancellationToken));

            if (result == null)
                return null;

            if (!string.Equals(result.IdUsuario?.Trim(), requestedUser, StringComparison.OrdinalIgnoreCase))
                return null;

            // sp_ValidarUsuario already returns EmpleadoCj.IdEmpleado in CodEmp.
            // Mobile authorization must use that corporate employee identifier directly.
            result.IdEmpleadoCj = result.CodEmp;

            await AsegurarAccesoEstandarAsync(connection, result, cancellationToken);

            return result;
        }

        /// <summary>
        /// Si el usuario no tiene ningun perfil-rol activo (sin accesos directos), le asigna ESTANDAR-ESTANDAR
        /// (mismo SP que usuario-perfil-rol-menu) y garantiza su registro en EmpleadoCjPerfil (perfil estandar).
        /// Un fallo aqui no bloquea el login.
        /// </summary>
        private async Task AsegurarAccesoEstandarAsync(
            Microsoft.Data.SqlClient.SqlConnection connection,
            LoginResponseDto usuario,
            CancellationToken cancellationToken)
        {
            try
            {
                var tienePerfilRol = await connection.ExecuteScalarAsync<int>(
                    _sqlCommandFactory.Create(
                        """
                        SELECT CASE WHEN EXISTS (
                            SELECT 1
                            FROM dbo.SegUsuarioPerfilRol upr
                            INNER JOIN dbo.SegPerfilRol pr ON pr.IdPerfilRol = upr.IdPerfilRol
                            WHERE upr.IdUsuario = @IdUsuario
                              AND ISNULL(upr.EsActivo, 1) = 1
                              AND ISNULL(pr.EsActivo, 1) = 1) THEN 1 ELSE 0 END
                        """,
                        new { IdUsuario = usuario.IdUsuario.Trim() },
                        cancellationToken: cancellationToken));

                if (tienePerfilRol == 1)
                    return;

                await _segMenuService.GuardarUsuarioPerfilRolAsync(
                    usuario.IdUsuario.Trim(), PerfilEstandar, RolEstandar, "SISTEMA");

                usuario.IdPerfil = PerfilEstandar;
                usuario.IdRol = RolEstandar;

                if (usuario.CodEmp is not > 0)
                    return;

                // Hora de negocio America/Lima (UTC-5), fecha sin hora como el INSERT manual.
                var fechaLima = DateTime.UtcNow.AddHours(-5).Date;

                foreach (var idPerfil in PerfilesEmpleadoPorDefecto)
                    await connection.ExecuteAsync(
                        _sqlCommandFactory.Create(
                            """
                            IF NOT EXISTS (SELECT 1 FROM dbo.EmpleadoCjPerfil
                                           WHERE IdEmpleadoCj = @IdEmpleadoCj AND IdPerfil = @IdPerfil)
                                INSERT INTO dbo.EmpleadoCjPerfil
                                VALUES (@IdEmpleadoCj, @IdPerfil, 1, @IdCreacion, @FechaCreacion, 0, '')
                            """,
                            new
                            {
                                IdEmpleadoCj = usuario.CodEmp.Value,
                                IdPerfil = idPerfil,
                                IdCreacion = IdCreacionPorDefecto,
                                FechaCreacion = fechaLima
                            },
                            cancellationToken: cancellationToken));
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "No se pudo asignar el acceso estandar por defecto al usuario {IdUsuario}.", usuario.IdUsuario);
            }
        }
    }
}
