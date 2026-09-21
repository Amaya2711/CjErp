using CjERP.Application.DTOs;

namespace CjERP.Application.Interfaces.Services;

public interface IOrdenCompraService
{
    Task<IEnumerable<OrdenCompraCabeceraDto>> BuscarCabeceraAsync(
        OrdenCompraConsultaRequestDto request,
        CancellationToken cancellationToken = default);

    Task<IEnumerable<OrdenCompraDetalleDto>> BuscarDetalleAsync(
        OrdenCompraConsultaRequestDto request,
        CancellationToken cancellationToken = default);

    Task<int> InsertarAsync(
        OrdenCompraInsertRequestDto request,
        CancellationToken cancellationToken = default);

    Task RechazarMasivoAsync(
        OrdenCompraRechazoMasivoRequestDto request,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<OrdenCompraAprobacionResultDto>> AprobarAsync(
        OrdenCompraAprobarRequestDto request,
        CancellationToken cancellationToken = default);

    Task<OrdenCompraEditarDetalleResultDto> EditarDetalleAsync(
        OrdenCompraEditarDetalleRequestDto request,
        CancellationToken cancellationToken = default);

    Task<IEnumerable<OrdenCompraReciboDto>> BuscarRecibosAsociadosAsync(
        OrdenCompraRecibosRequestDto request,
        CancellationToken cancellationToken = default);

    Task<IEnumerable<OrdenCompraReciboDto>> BuscarRecibosSinAsociarAsync(
        OrdenCompraRecibosRequestDto request,
        CancellationToken cancellationToken = default);

    Task<OrdenCompraAsociarRecibosResultDto> AsociarRecibosAsync(
        OrdenCompraAsociarRecibosRequestDto request,
        CancellationToken cancellationToken = default);

    Task<IEnumerable<OrdenCompraMontoOcDto>> BuscarMontoOcAsync(
        OrdenCompraRecibosRequestDto request,
        CancellationToken cancellationToken = default);

    Task<OrdenCompraConsumoDto?> BuscarConsumoAsync(
        OrdenCompraRecibosRequestDto request,
        CancellationToken cancellationToken = default);

    Task<OrdenCompraPdfResultDto> GenerarPdfAsync(
        int idOc,
        CancellationToken cancellationToken = default);
}

