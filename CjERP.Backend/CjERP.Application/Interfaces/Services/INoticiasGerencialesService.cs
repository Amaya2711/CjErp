using CjERP.Application.DTOs;

namespace CjERP.Application.Interfaces.Services;

public interface INoticiasGerencialesService
{
    /// <summary>
    /// Reporte diario de noticias gerenciales del rubro (telecomunicaciones e infraestructura) y del entorno de negocios.
    /// Se guarda en cache; <paramref name="forzarActualizacion"/> lo regenera (con un minimo de 10 minutos entre regeneraciones).
    /// </summary>
    Task<NoticiasGerencialesDto> ObtenerAsync(bool forzarActualizacion, CancellationToken cancellationToken);
}
