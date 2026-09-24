using CjERP.Application.DTOs.Mobile;
using CjERP.Application.Interfaces.Services;

namespace CjERP.Infrastructure.Services;

public sealed class MobileCommunicationPublisher(IMobileCommunicationService communications) : IMobileCommunicationPublisher
{
    public async Task<MobileIntegrationPublishResultDto> PublicarAsync(
        MobileIntegrationPublishRequestDto request,
        CancellationToken cancellationToken = default)
    {
        var module = (request.Modulo ?? string.Empty).Trim();
        var recipients = request.DestinatariosEmpleadoCj?.Where(id => id > 0).Distinct().ToList() ?? [];
        if (string.IsNullOrWhiteSpace(module) || module.Length > 50)
            throw new ArgumentException("El módulo de origen es obligatorio y no puede superar 50 caracteres.", nameof(request));
        if (string.IsNullOrWhiteSpace(request.Titulo) || string.IsNullOrWhiteSpace(request.Mensaje) || recipients.Count == 0)
            throw new ArgumentException("Título, mensaje y al menos un destinatario EmpleadoCj son obligatorios.", nameof(request));
        if (request.Tipo is < 0 or > 5 || request.TipoPersistencia is < 0 or > 3)
            throw new ArgumentException("Tipo o persistencia inválidos.", nameof(request));
        if (request.TipoPersistencia == 3 && !request.PermiteConfirmacion)
            throw new ArgumentException("Una comunicación obligatoria debe requerir confirmación.", nameof(request));

        var created = await communications.CrearAsync(new MobileCommunicationCreateRequestDto
        {
            Tipo = request.Tipo,
            Titulo = request.Titulo.Trim(),
            Mensaje = request.Mensaje.Trim(),
            Prioridad = request.Prioridad,
            TipoPersistencia = request.TipoPersistencia,
            PermiteConfirmacion = request.PermiteConfirmacion,
            RutaDestino = request.RutaDestino?.Trim(),
            IdReferencia = request.IdReferencia,
            TipoReferencia = string.IsNullOrWhiteSpace(request.TipoReferencia) ? module : request.TipoReferencia.Trim(),
            Destinatarios = recipients
        }, $"INTEGRACION:{module}", null, cancellationToken);

        return new MobileIntegrationPublishResultDto
        {
            IdComunicacion = created.IdComunicacion,
            Destinatarios = created.Destinatarios
        };
    }
}
