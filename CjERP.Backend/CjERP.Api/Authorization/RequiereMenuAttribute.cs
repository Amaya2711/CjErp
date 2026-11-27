using System.Security.Claims;
using CjERP.Application.Interfaces.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.Extensions.Caching.Memory;

namespace CjERP.Api.Authorization;

/// <summary>Acción de SegRolMenuPermiso que debe tener el rol del usuario sobre el menú.</summary>
public enum MenuAccion
{
    Ver,
    Crear,
    Editar,
    Eliminar,
    Aprobar,
    Exportar
}

/// <summary>
/// Exige en el servidor que la sesión pertenezca a la APLICACIÓN indicada (claim App del JWT, fijada en el login),
/// que el usuario siga activo y que alguno de sus roles de esa aplicación (SegRolApp) tenga el permiso indicado sobre el menú
/// identificado por CodigoMenu (SegMenu / SegRolMenuPermiso). El cargo permitido se valida una vez en el login (SegApp.CargosPermitidos).
/// Se aplica solo donde se declara (endpoints api/mobile/...); no afecta al resto de la API.
/// Sin permiso: 403. Sin token válido: 401 (lo resuelve [Authorize]).
/// </summary>
[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method, AllowMultiple = true)]
public sealed class RequiereMenuAttribute : TypeFilterAttribute
{
    public RequiereMenuAttribute(string app, string codigoMenu, MenuAccion accion = MenuAccion.Ver)
        : base(typeof(RequiereMenuFilter))
    {
        Arguments = new object[] { app, codigoMenu, accion };
    }
}

internal sealed class RequiereMenuFilter : IAsyncActionFilter
{
    private static readonly TimeSpan CacheDuration = TimeSpan.FromSeconds(60);

    private readonly string _app;
    private readonly string _codigoMenu;
    private readonly MenuAccion _accion;
    private readonly ISegRolMenuPermisoService _permisos;
    private readonly IMemoryCache _cache;

    public RequiereMenuFilter(
        string app,
        string codigoMenu,
        MenuAccion accion,
        ISegRolMenuPermisoService permisos,
        IMemoryCache cache)
    {
        _app = app.Trim().ToUpperInvariant();
        _codigoMenu = codigoMenu;
        _accion = accion;
        _permisos = permisos;
        _cache = cache;
    }

    public async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
    {
        var user = context.HttpContext.User;

        if (user.Identity?.IsAuthenticated != true)
        {
            context.Result = new UnauthorizedResult();
            return;
        }

        // La sesión debe haberse iniciado para ESTA aplicación (claim App); un token de otra app no sirve aquí.
        if (!string.Equals(user.FindFirstValue("App"), _app, StringComparison.OrdinalIgnoreCase))
        {
            context.Result = Denegado("Esta sesión no pertenece a esta aplicación.");
            return;
        }

        // Se leen de la BD los roles activos del usuario QUE PERTENECEN a esta aplicación y se autoriza si alguno concede el permiso;
        // también se exige que el usuario siga activo (así un cambio de rol o una baja rige en menos de 60 s, sin esperar al token).
        var idUsuario = user.FindFirstValue("IdUsuario");
        if (string.IsNullOrWhiteSpace(idUsuario))
        {
            context.Result = Denegado("No se pudo identificar al usuario.");
            return;
        }

        var acceso = await ObtenerAccesoAsync(idUsuario, _app);
        if (!acceso.Activo)
        {
            context.Result = Denegado("El usuario esta inactivo.");
            return;
        }
        if (acceso.Roles.Count == 0)
        {
            context.Result = Denegado("El usuario no tiene un rol asignado para esta aplicación.");
            return;
        }

        var autorizado = false;
        foreach (var idRol in acceso.Roles)
        {
            var permisos = await ObtenerPermisosAsync(idRol);
            var permiso = permisos.FirstOrDefault(p =>
                string.Equals(p.CodigoMenu, _codigoMenu, StringComparison.OrdinalIgnoreCase) && p.Estado);

            if (permiso != null && permiso.PuedeVer && _accion switch
            {
                MenuAccion.Ver => true,
                MenuAccion.Crear => permiso.PuedeCrear,
                MenuAccion.Editar => permiso.PuedeEditar,
                MenuAccion.Eliminar => permiso.PuedeEliminar,
                MenuAccion.Aprobar => permiso.PuedeAprobar,
                MenuAccion.Exportar => permiso.PuedeExportar,
                _ => false
            })
            {
                autorizado = true;
                break;
            }
        }

        if (!autorizado)
        {
            context.Result = Denegado("No tiene permiso para esta operación.");
            return;
        }

        await next();
    }

    private async Task<CjERP.Application.DTOs.Seguridad.AccesoUsuarioDto> ObtenerAccesoAsync(string idUsuario, string app)
    {
        var key = $"RequiereMenu:acceso:{app}:{idUsuario.Trim().ToUpperInvariant()}";
        if (_cache.TryGetValue(key, out CjERP.Application.DTOs.Seguridad.AccesoUsuarioDto? cached) && cached != null)
            return cached;

        var acceso = await _permisos.ObtenerAccesoUsuarioAsync(idUsuario, app);
        _cache.Set(key, acceso, CacheDuration);
        return acceso;
    }

    private async Task<IReadOnlyList<CjERP.Application.DTOs.Seguridad.SegRolMenuPermisoDto>> ObtenerPermisosAsync(int idRol)
    {
        var key = $"RequiereMenu:rol:{idRol}";
        if (_cache.TryGetValue(key, out IReadOnlyList<CjERP.Application.DTOs.Seguridad.SegRolMenuPermisoDto>? cached) && cached != null)
            return cached;

        var lista = (await _permisos.ListarPorRolAsync(idRol)).ToList();
        _cache.Set(key, lista, CacheDuration);
        return lista;
    }

    private static ObjectResult Denegado(string mensaje) =>
        new(new { success = false, message = mensaje }) { StatusCode = StatusCodes.Status403Forbidden };
}
