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
/// Beneficios (adelanto de sueldo / préstamo). Migración de FrmBeneficio (DXAsignacion): registro, aprobación con
/// envío de PDF por correo, rechazo, listado y cronograma.
/// </summary>
public sealed class BeneficioService : IBeneficioService
{
    private const string CampoCorreos = "correo_beneficio";
    private const string ConstanteListarSp = "dbo.sp_Constante_ListarPorCampo";
    private static readonly TimeSpan TiempoMaximoCorreo = TimeSpan.FromSeconds(45);

    private readonly ISqlCommandFactory _sql;
    private readonly ISmtpMailSender _mailSender;
    private readonly ILogger<BeneficioService> _logger;

    public BeneficioService(ISqlCommandFactory sql, ISmtpMailSender mailSender, ILogger<BeneficioService> logger)
    {
        _sql = sql;
        _mailSender = mailSender;
        _logger = logger;
    }

    public async Task<IReadOnlyList<BeneficioEmpleadoDto>> ListarEmpleadosAsync(CancellationToken cancellationToken = default)
    {
        await using var connection = _sql.CreateConnection();
        var rows = await connection.QueryAsync<BeneficioEmpleadoDto>(
            _sql.Create("dbo.sp_Beneficio_ListarEmpleados", null, CommandType.StoredProcedure, cancellationToken));
        return rows.ToList();
    }

    public async Task<IReadOnlyList<BeneficioListItemDto>> ListarAsync(
        int? idEmpleado,
        int? idTipoBeneficio,
        int? idAprobado,
        CancellationToken cancellationToken = default)
    {
        return await ListarInternoAsync(null, idEmpleado, idTipoBeneficio, idAprobado, cancellationToken);
    }

    public async Task<IReadOnlyList<BeneficioCuotaDto>> ObtenerCronogramaAsync(long idBeneficio, CancellationToken cancellationToken = default)
    {
        await using var connection = _sql.CreateConnection();
        var rows = await connection.QueryAsync<BeneficioCuotaDto>(
            _sql.Create("dbo.sp_Beneficio_Detalle", new { IdBeneficio = idBeneficio }, CommandType.StoredProcedure, cancellationToken));
        return rows.ToList();
    }

    public async Task<BeneficioRegistrarResultDto> RegistrarAsync(BeneficioRegistrarRequestDto request, CancellationToken cancellationToken = default)
    {
        if (request.IdTipoBeneficio is not (1 or 2))
        {
            throw new InvalidOperationException("Tipo de beneficio no válido.");
        }

        if (request.IdEmpleado <= 0)
        {
            throw new InvalidOperationException("Debe seleccionar un empleado.");
        }

        if (request.Monto <= 0)
        {
            throw new InvalidOperationException("Debe ingresar un monto mayor a cero.");
        }

        // Adelanto de sueldo: siempre 1 cuota, sin importar lo enviado por el cliente.
        var meses = request.IdTipoBeneficio == 2 ? 1 : request.Meses;
        if (meses is < 1 or > 60)
        {
            throw new InvalidOperationException("La cantidad de meses debe estar entre 1 y 60.");
        }

        var primerDiaMesActual = new DateTime(HoraLima().Year, HoraLima().Month, 1);
        if (new DateTime(request.MesInicio.Year, request.MesInicio.Month, 1) < primerDiaMesActual)
        {
            throw new InvalidOperationException("El mes de inicio no puede ser anterior al mes actual.");
        }

        try
        {
            await using var connection = _sql.CreateConnection();
            var id = await connection.QueryFirstOrDefaultAsync<long?>(
                _sql.Create(
                    "dbo.sp_Beneficio_Registrar",
                    new
                    {
                        request.IdTipoBeneficio,
                        request.IdEmpleado,
                        Monto = decimal.Round(request.Monto, 2),
                        Meses = meses,
                        MesInicio = new DateTime(request.MesInicio.Year, request.MesInicio.Month, 1)
                    },
                    CommandType.StoredProcedure,
                    cancellationToken,
                    commandTimeout: 60));

            if (id is null or <= 0)
            {
                throw new InvalidOperationException("No se pudo registrar el beneficio.");
            }

            return new BeneficioRegistrarResultDto { IdBeneficio = id.Value };
        }
        catch (SqlException ex) when (ex.Number is >= 50001 and <= 50008)
        {
            // Reglas de negocio del SP (empleado no apto, correlativo ausente, etc.).
            throw new InvalidOperationException(ex.Message);
        }
    }

    public async Task<IReadOnlyList<BeneficioAccionItemResultDto>> AprobarAsync(
        IReadOnlyCollection<long> idsBeneficio,
        int idAprobador,
        CancellationToken cancellationToken = default)
    {
        var resultados = new List<BeneficioAccionItemResultDto>();

        foreach (var id in idsBeneficio.Distinct())
        {
            var filas = await EjecutarAccionAsync(
                "dbo.sp_Beneficio_Aprobar",
                new { IdBeneficio = id, IdAprobador = idAprobador },
                cancellationToken);

            var item = new BeneficioAccionItemResultDto
            {
                IdBeneficio = id,
                Procesado = filas > 0,
                Mensaje = filas > 0 ? "Beneficio aprobado." : "El beneficio no existe o ya no estaba pendiente."
            };

            if (filas > 0)
            {
                await EnviarCorreoAprobacionAsync(item, cancellationToken);
            }

            resultados.Add(item);
        }

        return resultados;
    }

    public async Task<IReadOnlyList<BeneficioAccionItemResultDto>> RechazarAsync(
        IReadOnlyCollection<long> idsBeneficio,
        int idRechazo,
        CancellationToken cancellationToken = default)
    {
        var resultados = new List<BeneficioAccionItemResultDto>();

        foreach (var id in idsBeneficio.Distinct())
        {
            var filas = await EjecutarAccionAsync(
                "dbo.sp_Beneficio_Rechazar",
                new { IdBeneficio = id, IdRechazo = idRechazo },
                cancellationToken);

            resultados.Add(new BeneficioAccionItemResultDto
            {
                IdBeneficio = id,
                Procesado = filas > 0,
                Mensaje = filas > 0 ? "Beneficio rechazado." : "El beneficio no existe o ya no estaba pendiente."
            });
        }

        return resultados;
    }

    public async Task<(byte[] Contenido, string NombreArchivo)?> GenerarPdfAsync(long idBeneficio, CancellationToken cancellationToken = default)
    {
        var beneficio = (await ListarInternoAsync(idBeneficio, null, null, null, cancellationToken)).FirstOrDefault();
        if (beneficio is null)
        {
            return null;
        }

        var cuotas = await ObtenerCronogramaAsync(idBeneficio, cancellationToken);
        var pdf = new BeneficioPdfDocument(beneficio, cuotas, HoraLima()).GeneratePdf();
        var tipo = beneficio.IdTipoBeneficio == 2 ? "Adelanto" : "Prestamo";
        return (pdf, $"{tipo}_{idBeneficio}.pdf");
    }

    private async Task<IReadOnlyList<BeneficioListItemDto>> ListarInternoAsync(
        long? idBeneficio,
        int? idEmpleado,
        int? idTipoBeneficio,
        int? idAprobado,
        CancellationToken cancellationToken)
    {
        await using var connection = _sql.CreateConnection();
        var rows = await connection.QueryAsync<BeneficioListItemDto>(
            _sql.Create(
                "dbo.sp_Beneficio_Listar",
                new
                {
                    IdBeneficio = idBeneficio,
                    IdEmpleado = idEmpleado,
                    IdTipoBeneficio = idTipoBeneficio,
                    IdAprobado = idAprobado
                },
                CommandType.StoredProcedure,
                cancellationToken));
        return rows.ToList();
    }

    private async Task<int> EjecutarAccionAsync(string sp, object parametros, CancellationToken cancellationToken)
    {
        await using var connection = _sql.CreateConnection();
        return await connection.QueryFirstOrDefaultAsync<int?>(
            _sql.Create(sp, parametros, CommandType.StoredProcedure, cancellationToken, commandTimeout: 60)) ?? 0;
    }

    /// <summary>La aprobación ya quedó registrada: un fallo del correo no la revierte, solo se informa.</summary>
    private async Task EnviarCorreoAprobacionAsync(BeneficioAccionItemResultDto item, CancellationToken cancellationToken)
    {
        try
        {
            using var limite = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            limite.CancelAfter(TiempoMaximoCorreo);

            var destinatarios = await ObtenerDestinatariosAsync(limite.Token);
            if (destinatarios.Count == 0)
            {
                _logger.LogWarning("[Beneficio] No se envió correo: sin destinatarios activos en Constante '{Campo}' (ValorFin = 1).", CampoCorreos);
                item.CorreoEnviado = false;
                item.CorreoMensaje = $"No hay destinatarios activos configurados en '{CampoCorreos}'.";
                return;
            }

            var pdf = await GenerarPdfAsync(item.IdBeneficio, limite.Token);
            var beneficio = (await ListarInternoAsync(item.IdBeneficio, null, null, null, limite.Token)).FirstOrDefault();
            if (pdf is null || beneficio is null)
            {
                item.CorreoEnviado = false;
                item.CorreoMensaje = "No se pudo generar el PDF del beneficio.";
                return;
            }

            var nombre = string.IsNullOrWhiteSpace(beneficio.NombreEmpleado) ? $"Empleado {beneficio.IdEmpleado}" : beneficio.NombreEmpleado.Trim();
            await _mailSender.EnviarAsync(
                destinatarios,
                $"APROBADO - Solicitud de beneficio - {nombre}",
                $"Buen día, se aprueba el beneficio solicitado para el empleado: {nombre}",
                pdf.Value.NombreArchivo,
                pdf.Value.Contenido,
                "application/pdf",
                limite.Token);

            item.CorreoEnviado = true;
            item.CorreoMensaje = "Correo enviado correctamente.";
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[Beneficio] No se pudo enviar el correo de aprobación. IdBeneficio={IdBeneficio}", item.IdBeneficio);
            item.CorreoEnviado = false;
            item.CorreoMensaje = $"La aprobación se registró, pero no se pudo enviar el correo: {ex.Message}";
        }
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

            // El correo viene en ValorIni (igual que 'CORREO_OC' y 'correo_vacaciones'). PV: confirmar en la BD.
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
