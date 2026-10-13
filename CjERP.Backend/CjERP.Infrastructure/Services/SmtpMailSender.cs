using CjERP.Application.Interfaces.Services;
using CjERP.Shared.Configuration;
using MailKit.Security;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using MimeKit;
using MailKitSmtpClient = MailKit.Net.Smtp.SmtpClient;

namespace CjERP.Infrastructure.Services;

public sealed class SmtpMailSender : ISmtpMailSender
{
    private readonly SmtpSettings _smtpSettings;
    private readonly ILogger<SmtpMailSender> _logger;

    public SmtpMailSender(IOptions<SmtpSettings> smtpSettings, ILogger<SmtpMailSender> logger)
    {
        _smtpSettings = smtpSettings.Value;
        _logger = logger;
    }

    public async Task EnviarAsync(
        IReadOnlyList<string> destinatarios,
        string asunto,
        string cuerpoTexto,
        string nombreAdjunto,
        byte[] adjunto,
        string contentTypeAdjunto,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(_smtpSettings.Host) ||
            string.IsNullOrWhiteSpace(_smtpSettings.UserName) ||
            string.IsNullOrWhiteSpace(_smtpSettings.Password) ||
            string.IsNullOrWhiteSpace(_smtpSettings.From))
        {
            throw new InvalidOperationException("La configuración SMTP no está completa.");
        }

        var message = new MimeMessage();
        message.From.Add(MailboxAddress.Parse(_smtpSettings.From));
        foreach (var destinatario in destinatarios)
        {
            message.To.Add(MailboxAddress.Parse(destinatario));
        }

        message.Subject = asunto;
        var body = new BodyBuilder { TextBody = cuerpoTexto };
        body.Attachments.Add(nombreAdjunto, adjunto, ContentType.Parse(contentTypeAdjunto));
        message.Body = body.ToMessageBody();

        // Mismos intentos de protocolo que usa el envío de correo de OC.
        var attempts = new List<SecureSocketOptions>();
        void AddAttempt(SecureSocketOptions option)
        {
            if (!attempts.Contains(option)) attempts.Add(option);
        }

        if (_smtpSettings.EnableSsl)
        {
            AddAttempt(SecureSocketOptions.StartTls);
            AddAttempt(SecureSocketOptions.Auto);
        }
        else
        {
            AddAttempt(SecureSocketOptions.None);
            AddAttempt(SecureSocketOptions.Auto);
        }

        if (_smtpSettings.AllowInsecureFallback)
        {
            AddAttempt(SecureSocketOptions.None);
        }

        Exception? lastError = null;
        foreach (var socketOptions in attempts)
        {
            try
            {
                using var smtp = new MailKitSmtpClient
                {
                    Timeout = Math.Max(1, _smtpSettings.TimeoutSeconds) * 1000
                };
                if (_smtpSettings.AllowInvalidCertificate)
                {
                    smtp.ServerCertificateValidationCallback = static (_, _, _, _) => true;
                }

                await smtp.ConnectAsync(_smtpSettings.Host, _smtpSettings.Port, socketOptions, cancellationToken);
                await smtp.AuthenticateAsync(_smtpSettings.UserName, _smtpSettings.Password, cancellationToken);
                await smtp.SendAsync(message, cancellationToken);
                await smtp.DisconnectAsync(true, cancellationToken);
                return;
            }
            catch (OperationCanceledException)
            {
                throw;
            }
            catch (Exception ex)
            {
                lastError = ex;
                _logger.LogWarning(ex,
                    "Falló el envío SMTP. Host={Host}, puerto={Port}, protocolo={SocketOptions}",
                    _smtpSettings.Host,
                    _smtpSettings.Port,
                    socketOptions);
            }
        }

        throw new InvalidOperationException("No se pudo enviar el correo por SMTP.", lastError);
    }
}
