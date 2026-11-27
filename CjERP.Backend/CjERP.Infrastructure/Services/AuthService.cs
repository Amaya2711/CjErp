using System.Data;
using CjERP.Application.DTOs.Auth;
using CjERP.Application.Exceptions;
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
        private const string AppWeb = "WEB";

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

            var app = NormalizarApp(request.App);
            result.App = app;
            var appsConfiguradas = await AppsConfiguradasAsync(connection, cancellationToken);

            if (app == AppWeb)
            {
                // Web: comportamiento de siempre. Solo se hace determinista el perfil-rol (el SP toma uno cualquiera si hay varios)
                // y se ignoran los roles que pertenecen a una app movil.
                await AsegurarAccesoEstandarAsync(connection, result, appsConfiguradas, cancellationToken);
                if (appsConfiguradas)
                    await ResolverPerfilRolWebAsync(connection, result, cancellationToken);
            }
            else
            {
                // App movil: se valida TODO antes de que el controlador cree la sesion.
                await ValidarAccesoAppAsync(connection, result, app, appsConfiguradas, cancellationToken);
            }

            return result;
        }

        private static string NormalizarApp(string? app)
        {
            var codigo = string.IsNullOrWhiteSpace(app) ? AppWeb : app.Trim().ToUpperInvariant();
            if (codigo.Length > 30 || !codigo.All(c => char.IsAsciiLetterOrDigit(c) || c == '_'))
                throw new AccesoAplicacionException("Aplicacion no valida.");
            return codigo;
        }

        private async Task<bool> AppsConfiguradasAsync(Microsoft.Data.SqlClient.SqlConnection connection, CancellationToken cancellationToken)
        {
            return await connection.ExecuteScalarAsync<int>(
                _sqlCommandFactory.Create(
                    "SELECT CASE WHEN OBJECT_ID(N'dbo.SegApp', N'U') IS NOT NULL AND OBJECT_ID(N'dbo.SegRolApp', N'U') IS NOT NULL THEN 1 ELSE 0 END",
                    cancellationToken: cancellationToken)) == 1;
        }

        /// <summary>Perfil-rol de la WEB: el mas antiguo entre los que no pertenecen a una app movil (mismo filtro que sp_ValidarUsuario).</summary>
        private async Task ResolverPerfilRolWebAsync(
            Microsoft.Data.SqlClient.SqlConnection connection, LoginResponseDto usuario, CancellationToken cancellationToken)
        {
            var fila = await connection.QueryFirstOrDefaultAsync<PerfilRolFila>(
                _sqlCommandFactory.Create(
                    """
                    SELECT TOP (1) f.IdPerfil, f.IdRol
                    FROM dbo.SegUsuarioPerfilRol e
                    INNER JOIN dbo.SegPerfilRol f ON f.IdPerfilRol = e.IdPerfilRol
                    WHERE e.IdUsuario = @IdUsuario
                      AND e.EsActivo = 1
                      AND NOT EXISTS (SELECT 1 FROM dbo.SegRolApp ra
                                      WHERE ra.IdRol = f.IdRol AND ra.CodigoApp <> 'WEB' AND ISNULL(ra.EsActivo, 1) = 1)
                    ORDER BY e.IdUsuarioPerfilRol
                    """,
                    new { IdUsuario = usuario.IdUsuario.Trim() },
                    cancellationToken: cancellationToken));

            if (fila != null)
            {
                usuario.IdPerfil = fila.IdPerfil;
                usuario.IdRol = fila.IdRol;
            }
        }

        private async Task ValidarAccesoAppAsync(
            Microsoft.Data.SqlClient.SqlConnection connection, LoginResponseDto usuario, string app, bool appsConfiguradas,
            CancellationToken cancellationToken)
        {
            if (!appsConfiguradas)
                throw new AccesoAplicacionException("Las aplicaciones moviles aun no estan habilitadas en el servidor.");

            var cfg = await connection.QueryFirstOrDefaultAsync<AppFila>(
                _sqlCommandFactory.Create(
                    "SELECT CargosPermitidos, EsActivo FROM dbo.SegApp WHERE CodigoApp = @App",
                    new { App = app },
                    cancellationToken: cancellationToken));
            if (cfg == null || !cfg.EsActivo)
                throw new AccesoAplicacionException("Aplicacion no disponible.");

            var idUsuario = usuario.IdUsuario.Trim();

            // El login de la web no valida Usuario.IdEstado; las apps moviles si.
            var estado = await connection.ExecuteScalarAsync<int?>(
                _sqlCommandFactory.Create(
                    "SELECT TOP (1) IdEstado FROM dbo.Usuario WHERE IdUsuario = @IdUsuario",
                    new { IdUsuario = idUsuario },
                    cancellationToken: cancellationToken));
            if (estado != 1)
                throw new AccesoAplicacionException("El usuario esta inactivo.");

            usuario.IdCargo = usuario.CodEmp is > 0
                ? await connection.ExecuteScalarAsync<int?>(
                    _sqlCommandFactory.Create(
                        "SELECT TOP (1) IdCargo FROM dbo.EmpleadoCj WHERE IdEmpleado = @IdEmpleadoCj",
                        new { IdEmpleadoCj = usuario.CodEmp!.Value },
                        cancellationToken: cancellationToken))
                : null;

            if (!string.IsNullOrWhiteSpace(cfg.CargosPermitidos))
            {
                var permitidos = cfg.CargosPermitidos.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                    .Select(c => int.TryParse(c, out var n) ? n : (int?)null)
                    .Where(n => n.HasValue).Select(n => n!.Value).ToHashSet();
                if (usuario.IdCargo is not int cargo || !permitidos.Contains(cargo))
                    throw new AccesoAplicacionException("Esta aplicacion no esta habilitada para su cargo.");
            }

            var fila = await connection.QueryFirstOrDefaultAsync<PerfilRolFila>(
                _sqlCommandFactory.Create(
                    """
                    SELECT TOP (1) f.IdPerfil, f.IdRol
                    FROM dbo.SegUsuarioPerfilRol e
                    INNER JOIN dbo.SegPerfilRol f ON f.IdPerfilRol = e.IdPerfilRol
                    WHERE e.IdUsuario = @IdUsuario
                      AND ISNULL(e.EsActivo, 1) = 1
                      AND ISNULL(f.EsActivo, 1) = 1
                      AND EXISTS (SELECT 1 FROM dbo.SegRolApp ra
                                  WHERE ra.IdRol = f.IdRol AND ra.CodigoApp = @App AND ISNULL(ra.EsActivo, 1) = 1)
                    ORDER BY e.IdUsuarioPerfilRol
                    """,
                    new { IdUsuario = idUsuario, App = app },
                    cancellationToken: cancellationToken));
            if (fila == null)
                throw new AccesoAplicacionException("No tiene un rol asignado para esta aplicacion. Solicitelo al administrador.");

            usuario.IdPerfil = fila.IdPerfil;
            usuario.IdRol = fila.IdRol;
        }

        private sealed class PerfilRolFila
        {
            public int IdPerfil { get; set; }
            public int IdRol { get; set; }
        }

        private sealed class AppFila
        {
            public string? CargosPermitidos { get; set; }
            public bool EsActivo { get; set; }
        }

        /// <summary>
        /// Si el usuario no tiene ningun perfil-rol activo (sin accesos directos), le asigna ESTANDAR-ESTANDAR
        /// (mismo SP que usuario-perfil-rol-menu) y garantiza su registro en EmpleadoCjPerfil (perfil estandar).
        /// Un fallo aqui no bloquea el login.
        /// </summary>
        private async Task AsegurarAccesoEstandarAsync(
            Microsoft.Data.SqlClient.SqlConnection connection,
            LoginResponseDto usuario,
            bool appsConfiguradas,
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
                              AND ISNULL(pr.EsActivo, 1) = 1
                              {filtroWeb}) THEN 1 ELSE 0 END
                        """.Replace("{filtroWeb}", appsConfiguradas
                            // Solo cuentan los roles de la web: quien tiene SOLO rol de app movil tambien recibe el acceso estandar web.
                            ? "AND NOT EXISTS (SELECT 1 FROM dbo.SegRolApp ra WHERE ra.IdRol = pr.IdRol AND ra.CodigoApp <> 'WEB' AND ISNULL(ra.EsActivo, 1) = 1)"
                            : string.Empty),
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
