using System.Data;
using System.Text;
using CjERP.Application.Interfaces.Services;
using CjERP.Infrastructure.Persistence.Sql;
using Dapper;
using Microsoft.Extensions.Logging;
using MimeKit;
using QuestPDF.Fluent;

namespace CjERP.Infrastructure.Services;

/// <summary>
/// Correo con el PDF de la solicitud de equipos. Destinatarios: Constante 'correo_logistica' (ValorFin = 1, correo en ValorIni),
/// el correo del solicitante y, si su area es MODER/DENSIF/RO (5, 8, 11), Constante 'correo_logistica_impl'. PV: confirmar las
/// constantes en la BD (el sistema antiguo tenia los correos escritos en el codigo).
/// </summary>
public sealed class LogisticaSolicitudCorreoService : ILogisticaSolicitudCorreoService
{
    private const string ConstanteListarSp = "dbo.sp_Constante_ListarPorCampo";
    private const string CampoBase = "correo_logistica";
    private const string CampoImplementacion = "correo_logistica_impl";
    private static readonly int[] AreasImplementacion = { 5, 8, 11 };

    private readonly ISqlCommandFactory _sqlCommandFactory;
    private readonly ILogisticaEquiposService _equipos;
    private readonly ISmtpMailSender _mailSender;
    private readonly ILogger<LogisticaSolicitudCorreoService> _logger;

    public LogisticaSolicitudCorreoService(
        ISqlCommandFactory sqlCommandFactory,
        ILogisticaEquiposService equipos,
        ISmtpMailSender mailSender,
        ILogger<LogisticaSolicitudCorreoService> logger)
    {
        _sqlCommandFactory = sqlCommandFactory;
        _equipos = equipos;
        _mailSender = mailSender;
        _logger = logger;
    }

    public async Task<(bool Enviado, string Mensaje)> EnviarSolicitudAsync(
        string nroSolicitud,
        string titulo,
        CancellationToken cancellationToken = default)
    {
        try
        {
            var cab = await _equipos.ObtenerCabeceraSolicitudAsync(nroSolicitud, cancellationToken);
            if (cab is null) return (false, "No se encontro la solicitud para generar el PDF.");

            var detalle = (await _equipos.ListarDetalleSolicitudAsync(nroSolicitud, cancellationToken)).ToList();

            var destinatarios = new List<string>(await ObtenerConstanteAsync(CampoBase, cancellationToken));
            if (!string.IsNullOrWhiteSpace(cab.SolicitanteCorreo) && MailboxAddress.TryParse(cab.SolicitanteCorreo.Trim(), out _))
                destinatarios.Add(cab.SolicitanteCorreo.Trim());
            if (AreasImplementacion.Contains(cab.AreaCj))
                destinatarios.AddRange(await ObtenerConstanteAsync(CampoImplementacion, cancellationToken));

            var lista = destinatarios.Distinct(StringComparer.OrdinalIgnoreCase).ToArray();
            if (lista.Length == 0)
                return (false, $"No hay destinatarios activos en Constante '{CampoBase}' (ValorFin = 1).");

            var pdf = new LogisticaSolicitudPdfDocument(cab, detalle).GeneratePdf();
            var proyecto = (cab.NombreProyecto ?? string.Empty).Replace("\r", " ").Replace("\n", " ").Trim();
            var cuerpo = new StringBuilder()
                .AppendLine("Buen dia, se agradece atender el pedido adjunto.")
                .AppendLine();
            if (!string.IsNullOrWhiteSpace(cab.Referencia)) cuerpo.AppendLine(cab.Referencia.Trim());
            if (!string.IsNullOrWhiteSpace(cab.Observacion)) cuerpo.AppendLine(cab.Observacion.Trim());

            await _mailSender.EnviarAsync(
                lista,
                $"{titulo} - {cab.IdSite} - {cab.NombreSite} - Proyecto : {proyecto}",
                cuerpo.ToString(),
                $"Solicitud_{cab.NroSolicitud}.pdf",
                pdf,
                "application/pdf",
                cancellationToken);

            return (true, "Correo enviado correctamente.");
        }
        catch (Exception ex)
        {
            // El correo no debe revertir la solicitud ni la aprobacion.
            _logger.LogError(ex, "[LogisticaSolicitud] No se pudo enviar el correo de la solicitud {Nro}.", nroSolicitud);
            return (false, "No se pudo enviar el correo de la solicitud.");
        }
    }

    private async Task<IReadOnlyList<string>> ObtenerConstanteAsync(string campo, CancellationToken cancellationToken)
    {
        await using var connection = _sqlCommandFactory.CreateConnection();
        var rows = await connection.QueryAsync(
            _sqlCommandFactory.Create(ConstanteListarSp, new { Campo = campo }, CommandType.StoredProcedure, cancellationToken, commandTimeout: 30));

        var correos = new List<string>();
        foreach (var row in rows)
        {
            var data = (IDictionary<string, object?>)row;
            if (Texto(data, "ValorFin") != "1") continue;
            var correo = Texto(data, "ValorIni");
            if (!string.IsNullOrWhiteSpace(correo) && MailboxAddress.TryParse(correo, out _)) correos.Add(correo);
        }

        return correos;
    }

    private static string? Texto(IDictionary<string, object?> data, string campo)
    {
        foreach (var par in data)
        {
            if (string.Equals(par.Key, campo, StringComparison.OrdinalIgnoreCase)) return Convert.ToString(par.Value)?.Trim();
        }

        return null;
    }
}
