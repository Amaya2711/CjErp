using CjERP.Application.DTOs.Mobile;

namespace CjERP.Application.Interfaces.Services;

public interface IMobilePushDispatchService
{
    Task<MobilePushDispatchResultDto> ProcesarAsync(CancellationToken cancellationToken = default);
}
