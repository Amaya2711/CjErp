namespace CjERP.Application.Interfaces.Services;

public interface IInicioIndicadoresService
{
    /// <summary>
    /// Indicador (0/1) de pendientes del solicitante para el acceso directo de Alertas:
    /// 1 si sp_OrdenCompra_ResumenEstados (1era/2da/3era validacion) o sp_Planilla_Consulta_Estados_Resumen traen algun total mayor a 0.
    /// </summary>
    Task<int> ObtenerIndicadorPendientesAsync(int idSolicitante, CancellationToken cancellationToken = default);
}
