namespace CjERP.Application.Interfaces.Services;

/// <summary>Envío SMTP genérico con un adjunto, según SmtpSettings.</summary>
public interface ISmtpMailSender
{
    Task EnviarAsync(
        IReadOnlyList<string> destinatarios,
        string asunto,
        string cuerpoTexto,
        string nombreAdjunto,
        byte[] adjunto,
        string contentTypeAdjunto,
        CancellationToken cancellationToken = default);
}
