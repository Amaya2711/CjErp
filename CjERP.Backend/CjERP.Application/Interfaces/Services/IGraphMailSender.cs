namespace CjERP.Application.Interfaces.Services;

/// <summary>Envío de correo con un adjunto por Microsoft Graph (HTTPS), según GraphMailSettings.</summary>
public interface IGraphMailSender
{
    /// <summary>true si está habilitado y tiene tenant, cliente, secreto y buzón remitente.</summary>
    bool EstaConfigurado { get; }

    Task EnviarAsync(
        IReadOnlyList<string> destinatarios,
        string asunto,
        string cuerpoTexto,
        string nombreAdjunto,
        byte[] adjunto,
        string contentTypeAdjunto,
        CancellationToken cancellationToken = default);
}
