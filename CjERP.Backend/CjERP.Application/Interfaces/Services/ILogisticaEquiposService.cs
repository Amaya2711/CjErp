using CjERP.Application.DTOs;

namespace CjERP.Application.Interfaces.Services;

/// <summary>Flujo de logistica de equipos (formulario Logistica_v1). Se amplia por fases, una etapa a la vez.</summary>
public interface ILogisticaEquiposService
{
    Task<IEnumerable<LogisticaMaterialDto>> ListarMaterialesAsync(
        string? texto,
        bool soloActivos,
        CancellationToken cancellationToken = default);

    Task<IEnumerable<LogisticaStockDto>> ConsultarStockAsync(
        string? texto,
        bool soloConSaldo,
        CancellationToken cancellationToken = default);

    Task<IEnumerable<LogisticaStockDescuadreDto>> ConsultarDescuadresAsync(
        CancellationToken cancellationToken = default);

    // ---- Ingreso de equipos: Pedido, x Recepcionar, Series y x Validar ----
    Task<IEnumerable<LogisticaIngresoCatalogoDto>> ListarCatalogosIngresoAsync(CancellationToken cancellationToken = default);

    Task<IEnumerable<LogisticaIngresoLineaDto>> ConsultarIngresoAsync(
        LogisticaIngresoConsultaDto consulta,
        CancellationToken cancellationToken = default);

    Task<LogisticaIngresoCambioEstadoResultDto> RecepcionarAsync(
        LogisticaIngresoCambioEstadoDto request,
        string usuario,
        CancellationToken cancellationToken = default);

    Task<LogisticaIngresoCambioEstadoResultDto> ValidarAsync(
        LogisticaIngresoCambioEstadoDto request,
        string usuario,
        CancellationToken cancellationToken = default);

    Task ActualizarSerieAsync(
        LogisticaIngresoSerieDto request,
        string usuario,
        CancellationToken cancellationToken = default);

    Task<LogisticaIngresoCargaResultDto> ImportarSeriesAsync(
        LogisticaIngresoSerieMasivaDto request,
        string usuario,
        CancellationToken cancellationToken = default);

    Task<LogisticaIngresoGuiaResultDto> ActualizarGuiaAsync(
        LogisticaIngresoGuiaDto request,
        string usuario,
        CancellationToken cancellationToken = default);

    Task<LogisticaIngresoCargaResultDto> ImportarPedidoAsync(
        LogisticaPedidoImportarDto request,
        string usuario,
        int? idEmpleadoCj,
        CancellationToken cancellationToken = default);

    Task<LogisticaIngresoCargaResultDto> ImportarSecundarioAsync(
        LogisticaSecundarioImportarDto request,
        string usuario,
        CancellationToken cancellationToken = default);

    // ---- Solicitud y x Aprobar ----
    Task<IEnumerable<LogisticaSolicitudCatalogoDto>> ListarCatalogosSolicitudAsync(CancellationToken cancellationToken = default);

    Task<IEnumerable<LogisticaSolicitudDisponibleDto>> ListarDisponiblesSolicitudAsync(
        string? texto,
        string? idSite,
        int? correSite,
        int? idCliente,
        int? idProyecto,
        CancellationToken cancellationToken = default);

    Task<IEnumerable<LogisticaSolicitudConsumibleDto>> ListarConsumiblesSolicitudAsync(
        string? texto,
        CancellationToken cancellationToken = default);

    /// <summary>Registra la solicitud y mueve el stock. Devuelve el numero y el estado resultante (9 o 3).</summary>
    Task<LogisticaSolicitudRegistrarResultDto> RegistrarSolicitudAsync(
        LogisticaSolicitudRegistrarDto request,
        string usuario,
        int? idEmpleadoCj,
        CancellationToken cancellationToken = default);

    Task<IEnumerable<LogisticaSolicitudPorAprobarDto>> ListarPorAprobarAsync(
        LogisticaSolicitudPorAprobarConsultaDto consulta,
        CancellationToken cancellationToken = default);

    Task<IEnumerable<LogisticaSolicitudDetalleDto>> ListarDetalleSolicitudAsync(
        string nroSolicitud,
        CancellationToken cancellationToken = default);

    Task<LogisticaSolicitudAprobarResultDto> AprobarSolicitudesAsync(
        LogisticaSolicitudAprobarDto request,
        string usuario,
        int? idEmpleadoCj,
        CancellationToken cancellationToken = default);

    Task<LogisticaSolicitudCorreoCabDto?> ObtenerCabeceraSolicitudAsync(
        string nroSolicitud,
        CancellationToken cancellationToken = default);

    // ---- x Campo ----
    Task<IEnumerable<LogisticaCampoLineaDto>> ConsultarCampoAsync(
        LogisticaCampoConsultaDto consulta,
        CancellationToken cancellationToken = default);

    Task<LogisticaCampoGrabarResultDto> GrabarCampoAsync(
        LogisticaCampoGrabarDto request,
        string usuario,
        int? idEmpleadoCj,
        CancellationToken cancellationToken = default);
}

/// <summary>PDF y correo de la solicitud de equipos (Constante correo_logistica / correo_logistica_impl).</summary>
public interface ILogisticaSolicitudCorreoService
{
    /// <summary>Genera el PDF de la solicitud y lo envia. Un fallo no debe revertir la operacion de negocio: devuelve (false, mensaje).</summary>
    Task<(bool Enviado, string Mensaje)> EnviarSolicitudAsync(
        string nroSolicitud,
        string titulo,
        CancellationToken cancellationToken = default);
}
