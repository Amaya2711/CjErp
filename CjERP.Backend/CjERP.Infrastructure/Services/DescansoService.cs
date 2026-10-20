using System.Data;
using CjERP.Application.DTOs;
using CjERP.Application.Interfaces.Services;
using CjERP.Infrastructure.Persistence.Sql;
using Dapper;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Logging;
using MimeKit;
using QuestPDF.Fluent;

namespace CjERP.Infrastructure.Services;

/// <summary>
/// Descanso médico. Migración de frmDescanso (DXAsignacion): registro por rango con adjunto, aprobación en 4 etapas
/// (97 a 98 a 99 a 100 a 5), rechazo, listado y carta PDF enviada por correo al aprobar la etapa final.
/// </summary>
public sealed class DescansoService : IDescansoService
{
    private const string CampoCorreos = "correo_DESCANSO";
    private const string ConstanteListarSp = "dbo.sp_Constante_ListarPorCampo";
    private const int EtapaFinal = 100;
    private static readonly TimeSpan TiempoMaximoCorreo = TimeSpan.FromSeconds(45);

    private readonly ISqlCommandFactory _sql;
    private readonly ISmtpMailSender _mailSender;
    private readonly ILogger<DescansoService> _logger;

    public DescansoService(ISqlCommandFactory sql, ISmtpMailSender mailSender, ILogger<DescansoService> logger)
    {
        _sql = sql;
        _mailSender = mailSender;
        _logger = logger;
    }

    public async Task<IReadOnlyList<DescansoEmpleadoDto>> ListarEmpleadosAsync(CancellationToken cancellationToken = default)
    {
        await using var connection = _sql.CreateConnection();
        var rows = await connection.QueryAsync<DescansoEmpleadoDto>(
            _sql.Create("dbo.sp_Descanso_ListarEmpleados", null, CommandType.StoredProcedure, cancellationToken));
        return rows.ToList();
    }

    public async Task<IReadOnlyList<DescansoListItemDto>> ListarAsync(
        int? idEstado,
        int? idEmpleadoCj,
        DateTime? fechaInicial,
        DateTime? fechaFinal,
        CancellationToken cancellationToken = default)
    {
        await using var connection = _sql.CreateConnection();
        var rows = await connection.QueryAsync<DescansoListItemDto>(
            _sql.Create(
                "dbo.sp_Descanso_Listar",
                new
                {
                    IdEstado = idEstado,
                    IdEmpleadoCj = idEmpleadoCj,
                    FechaInicial = fechaInicial?.Date,
                    FechaFinal = fechaFinal?.Date
                },
                CommandType.StoredProcedure,
                cancellationToken,
                commandTimeout: 60));
        return rows.ToList();
    }

    public async Task<int> RegistrarAsync(DescansoRegistrarRequestDto request, string usuario, CancellationToken cancellationToken = default)
    {
        if (request.IdEmpleadoCj <= 0)
        {
            throw new InvalidOperationException("Debe seleccionar empleado.");
        }

        if (request.FechaFin.Date < request.FechaInicio.Date)
        {
            throw new InvalidOperationException("La fecha fin no puede ser menor que la fecha inicio.");
        }

        if (string.IsNullOrWhiteSpace(request.Ruta))
        {
            throw new InvalidOperationException("Debe ingresar documentos adjuntos.");
        }

        try
        {
            await using var connection = _sql.CreateConnection();
            var dias = await connection.QueryFirstOrDefaultAsync<int?>(
                _sql.Create(
                    "dbo.sp_Descanso_Registrar",
                    new
                    {
                        request.IdEmpleadoCj,
                        FechaInicio = request.FechaInicio.Date,
                        FechaFin = request.FechaFin.Date,
                        Ruta = request.Ruta.Trim(),
                        Usuario = usuario
                    },
                    CommandType.StoredProcedure,
                    cancellationToken,
                    commandTimeout: 60));

            return dias ?? 0;
        }
        catch (SqlException ex) when (ex.Number is >= 50101 and <= 50107)
        {
            throw new InvalidOperationException(ex.Message);
        }
    }

    public async Task<IReadOnlyList<DescansoAccionItemResultDto>> AprobarAsync(
        IReadOnlyCollection<DescansoSolicitudKeyDto> solicitudes,
        int idAprobador,
        CancellationToken cancellationToken = default)
    {
        var resultados = new List<DescansoAccionItemResultDto>();

        foreach (var solicitud in solicitudes)
        {
            var item = NuevoResultado(solicitud);

            try
            {
                var filas = await EjecutarAccionAsync(
                    "dbo.sp_Descanso_Aprobar",
                    new
                    {
                        solicitud.IdEmpleadoCj,
                        FechaInicio = solicitud.FechaInicio.Date,
                        FechaFin = solicitud.FechaFin.Date,
                        solicitud.IdEstadoActual,
                        IdAprobador = idAprobador
                    },
                    cancellationToken);

                item.Procesado = filas > 0;
                item.Mensaje = filas > 0 ? "Solicitud aprobada." : "La solicitud no existe o ya no estaba en esa etapa.";
            }
            catch (SqlException ex) when (ex.Number is 50111 or 50112)
            {
                item.Procesado = false;
                item.Mensaje = ex.Message;
            }

            if (item.Procesado && solicitud.IdEstadoActual == EtapaFinal)
            {
                await EnviarCorreoAprobacionAsync(item, cancellationToken);
            }

            resultados.Add(item);
        }

        return resultados;
    }

    public async Task<IReadOnlyList<DescansoAccionItemResultDto>> RechazarAsync(
        IReadOnlyCollection<DescansoSolicitudKeyDto> solicitudes,
        int idRechazo,
        CancellationToken cancellationToken = default)
    {
        var resultados = new List<DescansoAccionItemResultDto>();

        foreach (var solicitud in solicitudes)
        {
            var item = NuevoResultado(solicitud);
            var filas = await EjecutarAccionAsync(
                "dbo.sp_Descanso_Rechazar",
                new
                {
                    solicitud.IdEmpleadoCj,
                    FechaInicio = solicitud.FechaInicio.Date,
                    FechaFin = solicitud.FechaFin.Date,
                    IdRechazo = idRechazo
                },
                cancellationToken);

            item.Procesado = filas > 0;
            item.Mensaje = filas > 0 ? "Solicitud rechazada." : "La solicitud no existe o ya no se puede rechazar en su etapa actual.";
            resultados.Add(item);
        }

        return resultados;
    }

    public async Task<(byte[] Contenido, string NombreArchivo)?> GenerarPdfAsync(
        int idEmpleadoCj,
        DateTime fechaInicio,
        DateTime fechaFin,
        CancellationToken cancellationToken = default)
    {
        await using var connection = _sql.CreateConnection();
        var carta = await connection.QueryFirstOrDefaultAsync<DescansoCartaDto>(
            _sql.Create(
                "dbo.sp_Descanso_Carta",
                new { IdEmpleadoCj = idEmpleadoCj, FechaInicio = fechaInicio.Date, FechaFin = fechaFin.Date },
                CommandType.StoredProcedure,
                cancellationToken));

        if (carta is null)
        {
            return null;
        }

        var pdf = new DescansoPdfDocument(carta, HoraLima()).GeneratePdf();
        return (pdf, $"DescansoMedico_{idEmpleadoCj}_{carta.FechaInicio:yyyyMMdd}.pdf");
    }

    private static DescansoAccionItemResultDto NuevoResultado(DescansoSolicitudKeyDto solicitud) => new()
    {
        IdEmpleadoCj = solicitud.IdEmpleadoCj,
        FechaInicio = solicitud.FechaInicio,
        FechaFin = solicitud.FechaFin
    };

    private async Task<int> EjecutarAccionAsync(string sp, object parametros, CancellationToken cancellationToken)
    {
        await using var connection = _sql.CreateConnection();
        return await connection.QueryFirstOrDefaultAsync<int?>(
            _sql.Create(sp, parametros, CommandType.StoredProcedure, cancellationToken, commandTimeout: 120)) ?? 0;
    }

    /// <summary>La aprobación ya quedó registrada: un fallo del correo no la revierte, solo se informa.</summary>
    private async Task EnviarCorreoAprobacionAsync(DescansoAccionItemResultDto item, CancellationToken cancellationToken)
    {
        try
        {
            using var limite = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            limite.CancelAfter(TiempoMaximoCorreo);

            var destinatarios = await ObtenerDestinatariosAsync(limite.Token);
            if (destinatarios.Count == 0)
            {
                _logger.LogWarning("[Descanso] No se envió correo: sin destinatarios activos en Constante '{Campo}' (ValorFin = 1).", CampoCorreos);
                item.CorreoEnviado = false;
                item.CorreoMensaje = $"No hay destinatarios activos configurados en '{CampoCorreos}'.";
                return;
            }

            var pdf = await GenerarPdfAsync(item.IdEmpleadoCj, item.FechaInicio, item.FechaFin, limite.Token);
            if (pdf is null)
            {
                item.CorreoEnviado = false;
                item.CorreoMensaje = "No se pudo generar el PDF de la solicitud.";
                return;
            }

            var nombre = await ObtenerNombreEmpleadoAsync(item.IdEmpleadoCj, limite.Token);
            var inicio = item.FechaInicio.ToString("dd/MM/yyyy");
            var fin = item.FechaFin.ToString("dd/MM/yyyy");

            await _mailSender.EnviarAsync(
                destinatarios,
                $"APROBADO - Descanso médico - {nombre}",
                $"Buen día, se aprueban los días de descanso médico para el empleado: {nombre}, registrados entre las fechas: {inicio} - {fin}",
                pdf.Value.NombreArchivo,
                pdf.Value.Contenido,
                "application/pdf",
                limite.Token);

            item.CorreoEnviado = true;
            item.CorreoMensaje = "Correo enviado correctamente.";
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[Descanso] No se pudo enviar el correo de aprobación. IdEmpleadoCj={IdEmpleadoCj}", item.IdEmpleadoCj);
            item.CorreoEnviado = false;
            item.CorreoMensaje = $"La aprobación se registró, pero no se pudo enviar el correo: {ex.Message}";
        }
    }

    private async Task<string> ObtenerNombreEmpleadoAsync(int idEmpleadoCj, CancellationToken cancellationToken)
    {
        await using var connection = _sql.CreateConnection();
        var nombre = await connection.QueryFirstOrDefaultAsync<string?>(
            _sql.Create(
                "SELECT TOP (1) NombreEmpleado FROM dbo.EmpleadoCj WHERE IdEmpleado = @IdEmpleadoCj",
                new { IdEmpleadoCj = idEmpleadoCj },
                CommandType.Text,
                cancellationToken,
                commandTimeout: 30));
        return string.IsNullOrWhiteSpace(nombre) ? $"Empleado {idEmpleadoCj}" : nombre.Trim();
    }

    private async Task<IReadOnlyList<string>> ObtenerDestinatariosAsync(CancellationToken cancellationToken)
    {
        await using var connection = _sql.CreateConnection();
        var rows = await connection.QueryAsync(
            _sql.Create(ConstanteListarSp, new { Campo = CampoCorreos }, CommandType.StoredProcedure, cancellationToken, commandTimeout: 30));

        var correos = new List<string>();
        foreach (var row in rows)
        {
            var data = (IDictionary<string, object?>)row;
            if (Texto(data, "ValorFin") != "1")
            {
                continue;
            }

            // El correo viene en ValorIni (igual que 'CORREO_OC', 'correo_vacaciones' y 'correo_beneficio'). PV: confirmar en la BD.
            var correo = Texto(data, "ValorIni");
            if (!string.IsNullOrWhiteSpace(correo) && MailboxAddress.TryParse(correo, out _))
            {
                correos.Add(correo);
            }
        }

        return correos.Distinct(StringComparer.OrdinalIgnoreCase).ToArray();
    }

    private static string? Texto(IDictionary<string, object?> data, string campo)
    {
        foreach (var par in data)
        {
            if (string.Equals(par.Key, campo, StringComparison.OrdinalIgnoreCase))
            {
                return Convert.ToString(par.Value)?.Trim();
            }
        }

        return null;
    }

    private static DateTime HoraLima()
    {
        foreach (var id in new[] { "America/Lima", "SA Pacific Standard Time" })
        {
            try
            {
                return TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, TimeZoneInfo.FindSystemTimeZoneById(id));
            }
            catch (TimeZoneNotFoundException)
            {
            }
        }

        return DateTime.UtcNow.AddHours(-5);
    }
}
