using CjERP.Application.DTOs.Mobile;
namespace CjERP.Application.Interfaces.Services;
public interface IMobileDeviceService { Task<MobileCommandResultDto> RegistrarAsync(int idEmpleado, string idUsuario, MobileDeviceRegistrationDto request, CancellationToken cancellationToken = default); Task<MobileCommandResultDto> DesactivarAsync(int idEmpleado, string idUsuario, string deviceId, CancellationToken cancellationToken = default); Task<IReadOnlyList<MobileDeviceAdminDto>> ListarAdminAsync(bool soloActivos, int maximo, CancellationToken cancellationToken = default); }
