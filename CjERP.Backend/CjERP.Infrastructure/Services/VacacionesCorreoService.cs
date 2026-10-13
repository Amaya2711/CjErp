using System.Data;
using System.Text;
using CjERP.Application.DTOs;
using CjERP.Application.Interfaces.Services;
using CjERP.Infrastructure.Persistence.Sql;
using Dapper;
using Microsoft.Extensions.Logging;
using MimeKit;
using QuestPDF.Fluent;

namespace CjERP.Infrastructure.Services;

public sealed class VacacionesCorreoService : IVacacionesCorreoService
{
    private const string ConstanteListarSp = "dbo.sp_Constante_ListarPorCampo";
    private const string CampoDestinatarios = "correo_vacaciones";

    // Mismas columnas que usa el reporte de referencia (vVacaciones). Se convierten a texto para no depender del tipo real.
    private const string CartaSql = """
        SELECT TOP 1
            IdEmpleadoCj,
            CONVERT(nvarchar(200), NombreEmpleado) AS NombreEmpleado,
            CONVERT(nvarchar(50), NroDocumento) AS NroDocumento,
            CONVERT(nvarchar(200), NombreCliente) AS NombreCliente,
            FechaInicio,
            FechaFin,
            CONVERT(nvarchar(200), PreAprobador) AS PreAprobador,
            CONVERT(nvarchar(200), PrimAprobador) AS PrimAprobador,
            CONVERT(nvarchar(200), Autorizado) AS Autorizado
        FROM dbo.vVacaciones
        WHERE IdEmpleadoCj = @IdEmpleadoCj
          AND CONVERT(date, FechaInicio) = @FechaInicio
          AND (@UsarFechaFin = 0 OR CONVERT(date, FechaFin) = @FechaFin)
        ORDER BY FechaFin DESC;
        """;

    private readonly ISqlCommandFactory _sqlCommandFactory;
    private readonly ISmtpMailSender _mailSender;
    private readonly ILogger<VacacionesCorreoService> _logger;

    public VacacionesCorreoService(
        ISqlCommandFactory sqlCommandFactory,
        ISmtpMailSender mailSender,
        ILogger<VacacionesCorreoService> logger)
    {
        _sqlCommandFactory = sqlCommandFactory;
        _mailSender = mailSender;
        _logger = logger;
    }

    public async Task<VacacionesCorreoResultDto> EnviarCorreoAprobacionFinalAsync(
        int idEmpleadoCj,
        DateTime fechaInicio,
        DateTime fechaFin,
        CancellationToken cancellationToken = default)
    {
        var destinatarios = await ObtenerDestinatariosAsync(cancellationToken);
        if (destinatarios.Count == 0)
        {
            _logger.LogWarning(
                "[Vacaciones] No se envió correo: no hay destinatarios activos en Constante '{Campo}' (ValorFin = 1).",
                CampoDestinatarios);
            return new VacacionesCorreoResultDto
            {
                Mensaje = "No hay destinatarios activos configurados en 'correo_vacaciones'."
            };
        }

        var carta = await ObtenerCartaAsync(idEmpleadoCj, fechaInicio, fechaFin, cancellationToken);
        if (carta is null)
        {
            return new VacacionesCorreoResultDto
            {
                Destinatarios = destinatarios.Count,
                Mensaje = "No se encontró la solicitud en vVacaciones para generar el PDF."
            };
        }

        var pdf = new VacacionesPdfDocument(carta, HoraLima()).GeneratePdf();
        var inicio = carta.FechaInicio.ToString("dd/MM/yyyy");
        var fin = carta.FechaFin.ToString("dd/MM/yyyy");
        var nombre = string.IsNullOrWhiteSpace(carta.NombreEmpleado) ? $"Empleado {idEmpleadoCj}" : carta.NombreEmpleado.Trim();

        var cuerpo = new StringBuilder()
            .AppendLine("Se aprobó la 3ra validación de la solicitud de vacaciones.")
            .AppendLine()
            .AppendLine($"Colaborador: {nombre}")
            .AppendLine($"Periodo: {inicio} al {fin}")
            .AppendLine()
            .AppendLine("Se adjunta la solicitud en PDF.")
            .ToString();

        await _mailSender.EnviarAsync(
            destinatarios,
            $"Vacaciones aprobadas - {nombre} ({inicio} al {fin})",
            cuerpo,
            NombreArchivo(nombre, carta.FechaInicio),
            pdf,
            "application/pdf",
            cancellationToken);

        return new VacacionesCorreoResultDto
        {
            Enviado = true,
            Destinatarios = destinatarios.Count,
            Mensaje = "Correo enviado correctamente."
        };
    }

    private async Task<IReadOnlyList<string>> ObtenerDestinatariosAsync(CancellationToken cancellationToken)
    {
        await using var connection = _sqlCommandFactory.CreateConnection();
        var rows = await connection.QueryAsync(
            _sqlCommandFactory.Create(
                ConstanteListarSp,
                new { Campo = CampoDestinatarios },
                CommandType.StoredProcedure,
                cancellationToken,
                commandTimeout: 30));

        var correos = new List<string>();
        foreach (var row in rows)
        {
            var data = (IDictionary<string, object?>)row;
            if (Texto(data, "ValorFin") != "1")
            {
                continue;
            }

            // El correo viene en ValorIni (igual que Constante 'CORREO_OC'). PV: confirmar en la BD.
            var correo = Texto(data, "ValorIni");
            if (!string.IsNullOrWhiteSpace(correo) && MailboxAddress.TryParse(correo, out _))
            {
                correos.Add(correo);
            }
        }

        return correos.Distinct(StringComparer.OrdinalIgnoreCase).ToArray();
    }

    private async Task<VacacionesCartaDto?> ObtenerCartaAsync(
        int idEmpleadoCj,
        DateTime fechaInicio,
        DateTime fechaFin,
        CancellationToken cancellationToken)
    {
        await using var connection = _sqlCommandFactory.CreateConnection();

        async Task<VacacionesCartaDto?> Buscar(bool usarFechaFin) =>
            await connection.QueryFirstOrDefaultAsync<VacacionesCartaDto>(
                _sqlCommandFactory.Create(
                    CartaSql,
                    new
                    {
                        IdEmpleadoCj = idEmpleadoCj,
                        FechaInicio = fechaInicio.Date,
                        FechaFin = fechaFin.Date,
                        UsarFechaFin = usarFechaFin ? 1 : 0
                    },
                    CommandType.Text,
                    cancellationToken,
                    commandTimeout: 30));

        return await Buscar(true) ?? await Buscar(false);
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

    private static string NombreArchivo(string nombre, DateTime fechaInicio)
    {
        var limpio = new string(nombre.Where(c => char.IsLetterOrDigit(c) || c == ' ').ToArray()).Trim().Replace(' ', '_');
        return $"Solicitud_Vacaciones_{(limpio.Length == 0 ? "Empleado" : limpio)}_{fechaInicio:yyyyMMdd}.pdf";
    }
}
