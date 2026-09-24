using CjERP.Application.DTOs.Mobile;

namespace CjERP.Application.Interfaces.Services;

/// <summary>Contrato interno para que un módulo ERP publique comunicaciones dirigidas a EmpleadoCj.</summary>
public interface IMobileCommunicationPublisher
{
    Task<MobileIntegrationPublishResultDto> PublicarAsync(
        MobileIntegrationPublishRequestDto request,
        CancellationToken cancellationToken = default);
}
