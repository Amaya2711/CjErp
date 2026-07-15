using System.Data;
using System.Globalization;
using System.IO.Compression;
using System.Security.Claims;
using System.Security;
using System.Text;
using System.Xml.Linq;
using CjERP.Api.Services;
using CjERP.Application.DTOs;
using CjERP.Application.Interfaces.Services;
using CjERP.Shared.Configuration;
using Dapper;
using MailKit.Net.Smtp;
using MailKit.Security;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Options;
using MimeKit;

namespace CjERP.Api.Controllers;

[ApiController]
[Route("api/recursoshumanos/contratos")]
[Authorize]
public class ContratosController : ControllerBase
{
    private const string HistoryTableName = "dbo.EmpleadoCjHistorialLaboral";
    private const string RequestTableName = "dbo.EmpleadoCjSolicitudVigencia";
    private const string FichaStoredProcedureName = "dbo.sp_EmpleadoCj_Ficha";
    private static readonly string[] ThirdApprovalNotificationEmails =
    [
        "juan.manuel.amaya.suarez@gmail.com",
        "aortiz@cj-telecom.com",
        "ptorres@cj-telecom.com"
    ];
    private static readonly string[] FichaCandidateParameterNames =
    [
        "IdEmpleado",
        "idEmpleado",
        "IdEmpleadoCj",
        "idEmpleadoCj",
        "CodEmp",
        "codEmp",
        "NombreEmpleado",
        "nombreEmpleado"
    ];
    private readonly IConfiguration _configuration;
    private readonly IAuditoriaCambiosService _auditoriaCambiosService;
    private readonly ISharePointCommercialUploadService _sharePointCommercialUploadService;
    private readonly SmtpSettings _smtpSettings;
    private readonly ILogger<ContratosController> _logger;

    public ContratosController(
        IConfiguration configuration,
        IAuditoriaCambiosService auditoriaCambiosService,
        ISharePointCommercialUploadService sharePointCommercialUploadService,
        IOptions<SmtpSettings> smtpSettings,
        ILogger<ContratosController> logger)
    {
        _configuration = configuration;
        _auditoriaCambiosService = auditoriaCambiosService;
        _sharePointCommercialUploadService = sharePointCommercialUploadService;
        _smtpSettings = smtpSettings.Value;
        _logger = logger;
    }

    [HttpGet("{idEmpleado:int}")]
    public async Task<IActionResult> ObtenerPorEmpleado(int idEmpleado, CancellationToken cancellationToken)
    {
        if (idEmpleado <= 0)
        {
            return BadRequest(new { success = false, message = "IdEmpleado es obligatorio." });
        }

        var connectionString = _configuration.GetConnectionString("DefaultConnection");
        if (string.IsNullOrWhiteSpace(connectionString))
        {
            return StatusCode(StatusCodes.Status500InternalServerError, new
            {
                success = false,
                message = "La cadena de conexion no esta configurada."
            });
        }

        await using var connection = new SqlConnection(connectionString);

        var employee = await ObtenerFichaContratoEmpleadoAsync(connection, idEmpleado, cancellationToken);

        if (employee is null)
        {
            return NotFound(new { success = false, message = "No se encontro el empleado solicitado." });
        }

        var historyExists = await connection.ExecuteScalarAsync<int>(
            new CommandDefinition(
                "SELECT COUNT(1) FROM sys.objects WHERE object_id = OBJECT_ID(@TableName) AND type = 'U';",
                new { TableName = HistoryTableName },
                cancellationToken: cancellationToken));

        IReadOnlyList<ContratoEmpleadoHistorialDto> history = Array.Empty<ContratoEmpleadoHistorialDto>();

        if (historyExists > 0)
        {
            history = (await connection.QueryAsync<ContratoEmpleadoHistorialDto>(
                new CommandDefinition(
                    $"""
                    SELECT
                        IdHistorialLaboral,
                        IdEmpleado,
                        CONVERT(varchar(10), FechaIniLaboral, 23) AS FechaIniLaboral,
                        CONVERT(varchar(10), FechaFinLaboral, 23) AS FechaFinLaboral,
                        CONVERT(varchar(10), FechaBaja, 23) AS FechaBaja,
                        IdEstado,
                        CAST(IdActivo AS bit) AS IdActivo,
                        IdTipoEmpleado,
                        IdCargo,
                        IdEmpRel,
                        ISNULL(MotivoMovimiento, '') AS MotivoMovimiento,
                        ISNULL(TipoMovimiento, '') AS TipoMovimiento,
                        ISNULL(Observacion, '') AS Observacion,
                        ISNULL(UsuarioCre, '') AS UsuarioCre,
                        CONVERT(varchar(19), FechaCreacion, 120) AS FechaCreacion
                    FROM {HistoryTableName}
                    WHERE IdEmpleado = @IdEmpleado
                    ORDER BY ISNULL(FechaCreacion, '19000101') DESC, IdHistorialLaboral DESC
                    """,
                    new { IdEmpleado = idEmpleado },
                    cancellationToken: cancellationToken)))
                .ToList();
        }

        return Ok(new
        {
            success = true,
            message = "Contrato del empleado obtenido correctamente.",
            data = new ContratoEmpleadoResponseDto
            {
                Empleado = employee,
                Historial = history,
                SolicitudVigencia = await ObtenerSolicitudVigenciaAsync(connection, idEmpleado, cancellationToken)
            }
        });
    }

    [HttpPost("plantilla")]
    public async Task<IActionResult> GenerarPlantilla(
        [FromBody] ContratoPlantillaGenerarRequestDto request,
        CancellationToken cancellationToken)
    {
        try
        {
            if (request is null || string.IsNullOrWhiteSpace(request.DocumentPath))
            {
                return BadRequest(new { success = false, message = "La ruta del documento es obligatoria." });
            }

            if (!request.DocumentPath.Contains("FORMATOS_CONTRATOS", StringComparison.OrdinalIgnoreCase))
            {
                return BadRequest(new { success = false, message = "La ruta del documento no es valida." });
            }

            var replacements = NormalizeReplacements(request.Replacements);
            if (replacements.Count == 0)
            {
                return BadRequest(new { success = false, message = "Debe enviar al menos un campo para reemplazar." });
            }

            var templateBytes = await _sharePointCommercialUploadService.DownloadFileAsync(
                request.DocumentPath,
                cancellationToken);

            var renderedBytes = ReplaceWordPlaceholders(templateBytes, replacements);
            var fileName = string.IsNullOrWhiteSpace(request.FileName)
                ? Path.GetFileName(request.DocumentPath)
                : request.FileName.Trim();

            return File(
                renderedBytes,
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                fileName);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new
            {
                success = false,
                message = ex.Message
            });
        }
        catch (Exception ex)
        {
            return StatusCode(StatusCodes.Status500InternalServerError, new
            {
                success = false,
                message = "No se pudo generar la plantilla del contrato.",
                detail = ex.ToString()
            });
        }
    }

    [HttpPut("renovar")]
    public async Task<IActionResult> Renovar(
        [FromBody] ContratoEmpleadoRenovarRequestDto request,
        CancellationToken cancellationToken)
    {
        if (request.IdEmpleado <= 0)
        {
            return BadRequest(new { success = false, message = "IdEmpleado es obligatorio." });
        }

        if (!DateTime.TryParse(request.NuevaFechaFinLaboral, out var nuevaFechaFinLaboral))
        {
            return BadRequest(new { success = false, message = "NuevaFechaFinLaboral es invalida." });
        }

        var connectionString = _configuration.GetConnectionString("DefaultConnection");
        if (string.IsNullOrWhiteSpace(connectionString))
        {
            return StatusCode(StatusCodes.Status500InternalServerError, new
            {
                success = false,
                message = "La cadena de conexion no esta configurada."
            });
        }

        await using var connection = new SqlConnection(connectionString);
        await connection.OpenAsync(cancellationToken);
        await using var transaction = await connection.BeginTransactionAsync(cancellationToken);

        try
        {
            var current = await ObtenerFichaContratoEmpleadoAsync(connection, request.IdEmpleado, cancellationToken, transaction);
            if (current is null)
            {
                await transaction.RollbackAsync(cancellationToken);
                return NotFound(new { success = false, message = "No se encontro el empleado solicitado." });
            }

            var tableExists = await connection.ExecuteScalarAsync<int>(
                new CommandDefinition(
                    "SELECT COUNT(1) FROM sys.objects WHERE object_id = OBJECT_ID(@TableName) AND type = 'U';",
                    new { TableName = RequestTableName },
                    transaction: transaction,
                    cancellationToken: cancellationToken));

            if (tableExists <= 0)
            {
                await transaction.RollbackAsync(cancellationToken);
                return BadRequest(new
                {
                    success = false,
                    message = $"No existe la tabla de solicitudes {RequestTableName}."
                });
            }

            if (!string.IsNullOrWhiteSpace(current.FechaIniLaboral) &&
                DateTime.TryParse(current.FechaIniLaboral, out var fechaInicioLaboral) &&
                nuevaFechaFinLaboral.Date < fechaInicioLaboral.Date)
            {
                await transaction.RollbackAsync(cancellationToken);
                return BadRequest(new
                {
                    success = false,
                    message = "La nueva fecha fin no puede ser menor que la fecha de inicio laboral vigente."
                });
            }

            var usuario = ResolveUsuarioActual();
            var aprobadorId = ResolveIdAprobador();
            if (aprobadorId is null or <= 0)
            {
                await transaction.RollbackAsync(cancellationToken);
                return BadRequest(new
                {
                    success = false,
                    message = "No se pudo resolver el aprobador actual para registrar la primera validacion."
                });
            }

            var solicitudExistente = await ObtenerSolicitudVigenciaAsync(connection, request.IdEmpleado, cancellationToken, transaction);
            var fechaFinActual = ParseNullableDate(current.FechaFinLaboral);
            var nuevaFechaFin = nuevaFechaFinLaboral.Date;
            var observacion = string.IsNullOrWhiteSpace(request.Observacion)
                ? $"Solicitud de renovacion hasta {nuevaFechaFin:yyyy-MM-dd}"
                : request.Observacion.Trim();

            var auditoriaCambios = new List<AuditoriaCambioDto>();

            if (solicitudExistente is not null && string.Equals(solicitudExistente.EstadoSolicitud, "PENDIENTE", StringComparison.OrdinalIgnoreCase))
            {
                if (solicitudExistente.AprobacionesRealizadas >= 1)
                {
                    var nuevaFechaTexto = nuevaFechaFin.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
                    if (string.Equals(solicitudExistente.NuevaFechaFinLaboral, nuevaFechaTexto, StringComparison.OrdinalIgnoreCase))
                    {
                        await transaction.RollbackAsync(cancellationToken);
                        return Ok(new
                        {
                            success = true,
                            message = "La solicitud pendiente ya tiene registrada esa fecha fin.",
                            data = new
                            {
                                request.IdEmpleado,
                                nuevaFechaFinLaboral = nuevaFechaTexto,
                                estadoSolicitud = solicitudExistente.EstadoSolicitud,
                                observacion,
                                actualizoSolicitudPendiente = true
                            }
                        });
                    }

                    await connection.ExecuteAsync(
                        new CommandDefinition(
                            $"""
                            UPDATE {RequestTableName}
                            SET NuevaFechaFinLaboral = @NuevaFechaFinLaboral,
                                UsuarioMod = @UsuarioMod,
                                FechaMod = GETDATE()
                            WHERE IdSolicitudVigencia = @IdSolicitudVigencia
                            """,
                            new
                            {
                                solicitudExistente.IdSolicitudVigencia,
                                NuevaFechaFinLaboral = nuevaFechaFin,
                                UsuarioMod = usuario
                            },
                            transaction: transaction,
                            cancellationToken: cancellationToken));

                    auditoriaCambios.AddRange(BuildSolicitudActualizacionFechaAuditEntries(
                        solicitudExistente,
                        nuevaFechaFin,
                        usuario));

                    await transaction.CommitAsync(cancellationToken);
                    await RegistrarAuditoriaAsync(auditoriaCambios, cancellationToken);

                    return Ok(new
                    {
                        success = true,
                        message = "La fecha fin propuesta fue actualizada en la solicitud pendiente.",
                        data = new
                        {
                            request.IdEmpleado,
                            nuevaFechaFinLaboral = nuevaFechaTexto,
                            estadoSolicitud = solicitudExistente.EstadoSolicitud,
                            observacion,
                            actualizoSolicitudPendiente = true
                        }
                    });
                }

                await connection.ExecuteAsync(
                    new CommandDefinition(
                        $"""
                        UPDATE {RequestTableName}
                        SET EstadoSolicitud = 'ANULADO',
                            UsuarioMod = @UsuarioMod,
                            FechaMod = GETDATE()
                        WHERE IdSolicitudVigencia = @IdSolicitudVigencia
                        """,
                        new
                        {
                            solicitudExistente.IdSolicitudVigencia,
                            UsuarioMod = usuario
                        },
                        transaction: transaction,
                        cancellationToken: cancellationToken));

                auditoriaCambios.Add(new AuditoriaCambioDto
                {
                    Modulo = "RecursosHumanos",
                    Entidad = "EmpleadoCjSolicitudVigencia",
                    IdRegistro = solicitudExistente.IdSolicitudVigencia.ToString(CultureInfo.InvariantCulture),
                    Accion = "UPDATE",
                    Seccion = "Solicitud",
                    Campo = "EstadoSolicitud",
                    ValorAnterior = solicitudExistente.EstadoSolicitud,
                    ValorNuevo = "ANULADO",
                    UsuarioAccion = usuario,
                    Observacion = "Se anulo la solicitud pendiente anterior por cambio de fecha fin."
                });
            }

            var idNuevaSolicitud = await connection.QuerySingleAsync<int>(
                new CommandDefinition(
                    $"""
                    INSERT INTO {RequestTableName}
                    (
                        IdEmpleado,
                        FechaFinActual,
                        NuevaFechaFinLaboral,
                        EstadoSolicitud,
                        Aprobacion1IdEmpleado,
                        Aprobacion1Usuario,
                        Aprobacion1Fecha,
                        Aprobacion1Observacion,
                        Aprobacion2IdEmpleado,
                        Aprobacion2Usuario,
                        Aprobacion2Fecha,
                        Aprobacion2Observacion,
                        Aprobacion3IdEmpleado,
                        Aprobacion3Usuario,
                        Aprobacion3Fecha,
                        Aprobacion3Observacion,
                        UsuarioCre,
                        FechaCreacion,
                        UsuarioMod,
                        FechaMod
                    )
                    VALUES
                    (
                        @IdEmpleado,
                        @FechaFinActual,
                        @NuevaFechaFinLaboral,
                        'PENDIENTE',
                        @AprobadorId,
                        @AprobadorUsuario,
                        GETDATE(),
                        @Aprobacion1Observacion,
                        NULL,
                        NULL,
                        NULL,
                        NULL,
                        NULL,
                        NULL,
                        NULL,
                        NULL,
                        @UsuarioCre,
                        GETDATE(),
                        @UsuarioMod,
                        GETDATE()
                    );

                    SELECT CAST(SCOPE_IDENTITY() AS int);
                    """,
                    new
                    {
                        request.IdEmpleado,
                        FechaFinActual = fechaFinActual,
                        NuevaFechaFinLaboral = nuevaFechaFin,
                        AprobadorId = aprobadorId,
                        AprobadorUsuario = usuario,
                        Aprobacion1Observacion = observacion,
                        UsuarioCre = usuario,
                        UsuarioMod = usuario
                    },
                    transaction: transaction,
                    cancellationToken: cancellationToken));

            auditoriaCambios.AddRange(BuildSolicitudCreacionAuditEntries(
                idNuevaSolicitud,
                request.IdEmpleado,
                fechaFinActual,
                nuevaFechaFin,
                aprobadorId.Value,
                usuario,
                observacion));

            await transaction.CommitAsync(cancellationToken);

            await RegistrarAuditoriaAsync(auditoriaCambios, cancellationToken);

            return Ok(new
            {
                success = true,
                message = "La fecha fue registrada con 1ra aprobacion y quedo pendiente de 2 validaciones.",
                data = new
                {
                    request.IdEmpleado,
                    nuevaFechaFinLaboral = nuevaFechaFin.ToString("yyyy-MM-dd"),
                    estadoSolicitud = "PENDIENTE",
                    observacion,
                    actualizoSolicitudPendiente = false
                }
            });
        }
        catch (Exception ex)
        {
            await transaction.RollbackAsync(cancellationToken);
            return StatusCode(StatusCodes.Status500InternalServerError, new
            {
                success = false,
                message = "No se pudo renovar la vigencia del contrato.",
                detail = ex.ToString()
            });
        }
    }

    [HttpPost("{idEmpleado:int}/aprobar-vigencia")]
    public async Task<IActionResult> AprobarVigencia(
        int idEmpleado,
        [FromBody] ContratoEmpleadoAprobarVigenciaRequestDto request,
        CancellationToken cancellationToken)
    {
        if (idEmpleado <= 0)
        {
            return BadRequest(new { success = false, message = "IdEmpleado es obligatorio." });
        }

        var connectionString = _configuration.GetConnectionString("DefaultConnection");
        if (string.IsNullOrWhiteSpace(connectionString))
        {
            return StatusCode(StatusCodes.Status500InternalServerError, new
            {
                success = false,
                message = "La cadena de conexion no esta configurada."
            });
        }

        await using var connection = new SqlConnection(connectionString);
        await connection.OpenAsync(cancellationToken);
        await using var transaction = await connection.BeginTransactionAsync(cancellationToken);

        try
        {
            var requestExists = await connection.ExecuteScalarAsync<int>(
                new CommandDefinition(
                    "SELECT COUNT(1) FROM sys.objects WHERE object_id = OBJECT_ID(@TableName) AND type = 'U';",
                    new { TableName = RequestTableName },
                    transaction: transaction,
                    cancellationToken: cancellationToken));

            if (requestExists <= 0)
            {
                await transaction.RollbackAsync(cancellationToken);
                return BadRequest(new
                {
                    success = false,
                    message = $"No existe la tabla de solicitudes {RequestTableName}."
                });
            }

            var solicitud = await ObtenerSolicitudVigenciaAsync(connection, idEmpleado, cancellationToken, transaction);
            if (solicitud is null)
            {
                await transaction.RollbackAsync(cancellationToken);
                return NotFound(new
                {
                    success = false,
                    message = "No existe una solicitud de vigencia pendiente para este empleado."
                });
            }

            if (!string.Equals(solicitud.EstadoSolicitud, "PENDIENTE", StringComparison.OrdinalIgnoreCase))
            {
                await transaction.RollbackAsync(cancellationToken);
                return BadRequest(new
                {
                    success = false,
                    message = "La solicitud ya no se encuentra pendiente de aprobacion."
                });
            }

            var aprobadorId = ResolveIdAprobador();
            if (aprobadorId is null or <= 0)
            {
                await transaction.RollbackAsync(cancellationToken);
                return BadRequest(new
                {
                    success = false,
                    message = "No se pudo resolver el aprobador actual."
                });
            }

            var usuario = ResolveUsuarioActual();
            var current = await ObtenerFichaContratoEmpleadoAsync(connection, idEmpleado, cancellationToken, transaction);
            if (current is null)
            {
                await transaction.RollbackAsync(cancellationToken);
                return NotFound(new { success = false, message = "No se encontro el empleado solicitado." });
            }

            if (!string.IsNullOrWhiteSpace(current.FechaIniLaboral) &&
                DateTime.TryParse(current.FechaIniLaboral, out var fechaInicioLaboral) &&
                DateTime.TryParse(solicitud.NuevaFechaFinLaboral, out var nuevaFechaFinLaboral) &&
                nuevaFechaFinLaboral.Date < fechaInicioLaboral.Date)
            {
                await transaction.RollbackAsync(cancellationToken);
                return BadRequest(new
                {
                    success = false,
                    message = "La nueva fecha fin no puede ser menor que la fecha de inicio laboral vigente."
                });
            }

            var aprobacionesRealizadas = solicitud.AprobacionesRealizadas;
            var siguienteAprobacion = aprobacionesRealizadas + 1;
            var nivelAprobacionSolicitado = request.NivelAprobacion <= 0 ? siguienteAprobacion : request.NivelAprobacion;

            if (nivelAprobacionSolicitado != siguienteAprobacion)
            {
                await transaction.RollbackAsync(cancellationToken);
                return BadRequest(new
                {
                    success = false,
                    message = $"La siguiente aprobacion pendiente es la #{siguienteAprobacion}."
                });
            }

            var observacion = string.IsNullOrWhiteSpace(request.Observacion)
                ? $"Aprobacion #{nivelAprobacionSolicitado} registrada por {usuario}"
                : request.Observacion.Trim();

            if (nivelAprobacionSolicitado == 3 &&
                (string.IsNullOrWhiteSpace(request.DocumentPath) || string.IsNullOrWhiteSpace(request.FileName)))
            {
                await transaction.RollbackAsync(cancellationToken);
                return BadRequest(new
                {
                    success = false,
                    message = "La aprobacion de 3era validacion requiere la ruta y el nombre del documento Word seleccionado."
                });
            }

            var auditoriaCambios = new List<AuditoriaCambioDto>();
            if (siguienteAprobacion > solicitud.AprobacionesRequeridas)
            {
                await transaction.RollbackAsync(cancellationToken);
                return BadRequest(new
                {
                    success = false,
                    message = "La solicitud ya completo la cantidad requerida de aprobaciones."
                });
            }

            var estadoFinal = siguienteAprobacion >= solicitud.AprobacionesRequeridas ? "APROBADO" : "PENDIENTE";
            var updateSql = nivelAprobacionSolicitado switch
            {
                1 => $"""
                     UPDATE {RequestTableName}
                     SET Aprobacion1IdEmpleado = @AprobadorId,
                         Aprobacion1Usuario = @AprobadorUsuario,
                         Aprobacion1Fecha = GETDATE(),
                         Aprobacion1Observacion = @Observacion,
                         EstadoSolicitud = @EstadoSolicitud,
                         UsuarioMod = @UsuarioMod,
                         FechaMod = GETDATE()
                     WHERE IdSolicitudVigencia = @IdSolicitudVigencia
                     """,
                2 => $"""
                     UPDATE {RequestTableName}
                     SET Aprobacion2IdEmpleado = @AprobadorId,
                         Aprobacion2Usuario = @AprobadorUsuario,
                         Aprobacion2Fecha = GETDATE(),
                         Aprobacion2Observacion = @Observacion,
                         EstadoSolicitud = @EstadoSolicitud,
                         UsuarioMod = @UsuarioMod,
                         FechaMod = GETDATE()
                     WHERE IdSolicitudVigencia = @IdSolicitudVigencia
                     """,
                _ => $"""
                     UPDATE {RequestTableName}
                     SET Aprobacion3IdEmpleado = @AprobadorId,
                         Aprobacion3Usuario = @AprobadorUsuario,
                         Aprobacion3Fecha = GETDATE(),
                         Aprobacion3Observacion = @Observacion,
                         EstadoSolicitud = @EstadoSolicitud,
                         UsuarioMod = @UsuarioMod,
                         FechaMod = GETDATE(),
                        FechaAplicacion = GETDATE()
                     WHERE IdSolicitudVigencia = @IdSolicitudVigencia
                     """
            };

            var fechaAccion = DateTime.Now;

            await connection.ExecuteAsync(
                new CommandDefinition(
                    updateSql,
                    new
                    {
                        solicitud.IdSolicitudVigencia,
                        AprobadorId = aprobadorId,
                        AprobadorUsuario = usuario,
                        Observacion = observacion,
                        EstadoSolicitud = estadoFinal,
                        UsuarioMod = usuario
                    },
                    transaction: transaction,
                    cancellationToken: cancellationToken));

            auditoriaCambios.AddRange(BuildAprobacionAuditEntries(
                solicitud,
                nivelAprobacionSolicitado,
                aprobadorId.Value,
                usuario,
                observacion,
                estadoFinal,
                fechaAccion));

            if (estadoFinal == "APROBADO")
            {
                if (!DateTime.TryParse(solicitud.NuevaFechaFinLaboral, out var solicitudNuevaFechaFinLaboral))
                {
                    await transaction.RollbackAsync(cancellationToken);
                    return BadRequest(new
                    {
                        success = false,
                        message = "La nueva fecha fin de la solicitud es invalida."
                    });
                }

                if (solicitudNuevaFechaFinLaboral.Date < DateTime.Today.AddYears(-10))
                {
                    await transaction.RollbackAsync(cancellationToken);
                    return BadRequest(new
                    {
                        success = false,
                        message = "La nueva fecha fin de la solicitud es invalida."
                    });
                }

                var historyExists = await connection.ExecuteScalarAsync<int>(
                    new CommandDefinition(
                        "SELECT COUNT(1) FROM sys.objects WHERE object_id = OBJECT_ID(@TableName) AND type = 'U';",
                        new { TableName = HistoryTableName },
                        transaction: transaction,
                        cancellationToken: cancellationToken));

                if (historyExists <= 0)
                {
                    await transaction.RollbackAsync(cancellationToken);
                    return BadRequest(new
                    {
                        success = false,
                        message = $"No existe la tabla de historial {HistoryTableName}."
                    });
                }

                var fechaIniHistorial = ParseNullableDate(current.FechaFinLaboral)?.Date.AddDays(1) ?? solicitudNuevaFechaFinLaboral.Date;

                await connection.ExecuteAsync(
                    new CommandDefinition(
                        $"""
                        INSERT INTO {HistoryTableName}
                        (
                            IdEmpleado,
                            FechaIniLaboral,
                            FechaFinLaboral,
                            FechaBaja,
                            IdEstado,
                            IdActivo,
                            IdTipoEmpleado,
                            IdCargo,
                            IdEmpRel,
                            MotivoMovimiento,
                            TipoMovimiento,
                            Observacion,
                            UsuarioCre,
                            FechaCreacion
                        )
                        VALUES
                        (
                            @IdEmpleado,
                            @FechaIniLaboral,
                            @FechaFinLaboral,
                            @FechaBaja,
                            @IdEstado,
                            @IdActivo,
                            @IdTipoEmpleado,
                            @IdCargo,
                            @IdEmpRel,
                            @MotivoMovimiento,
                            @TipoMovimiento,
                            @Observacion,
                            @UsuarioCre,
                            GETDATE()
                        )
                        """,
                        new
                        {
                            current.IdEmpleado,
                            FechaIniLaboral = fechaIniHistorial,
                            FechaFinLaboral = solicitudNuevaFechaFinLaboral.Date,
                            FechaBaja = ParseNullableDate(current.FechaBaja),
                            current.IdEstado,
                            IdActivo = current.IdActivo ?? true,
                            current.IdTipoEmpleado,
                            current.IdCargo,
                            current.IdEmpRel,
                            MotivoMovimiento = "RENOVACION",
                            TipoMovimiento = "RENOVACION",
                            Observacion = observacion,
                            UsuarioCre = usuario
                        },
                        transaction: transaction,
                        cancellationToken: cancellationToken));

                await connection.ExecuteAsync(
                    new CommandDefinition(
                        """
                        ;WITH Target AS
                        (
                            SELECT TOP (1) *
                            FROM dbo.EmpleadoCj
                            WHERE IdEmpleado = @IdEmpleado
                            ORDER BY ISNULL(FechaCreacion, '19000101') DESC, ISNULL(FechaIniLaboral, '19000101') DESC
                        )
                        UPDATE Target
                        SET FechaFinLaboral = @NuevaFechaFinLaboral
                        """,
                        new
                        {
                            solicitud.IdEmpleado,
                            NuevaFechaFinLaboral = solicitudNuevaFechaFinLaboral.Date
                        },
                        transaction: transaction,
                        cancellationToken: cancellationToken));

                auditoriaCambios.Add(new AuditoriaCambioDto
                {
                    Modulo = "RecursosHumanos",
                    Entidad = "EmpleadoCj",
                    IdRegistro = solicitud.IdEmpleado.ToString(CultureInfo.InvariantCulture),
                    Accion = "UPDATE",
                    Seccion = "Contrato",
                    Campo = "FechaFinLaboral",
                    ValorAnterior = current.FechaFinLaboral,
                    ValorNuevo = solicitud.NuevaFechaFinLaboral,
                    UsuarioAccion = usuario,
                    Observacion = "Aplicacion final de la renovacion aprobada."
                });
            }

            await transaction.CommitAsync(cancellationToken);

            await RegistrarAuditoriaAsync(auditoriaCambios, cancellationToken);

            if (estadoFinal == "APROBADO" && nivelAprobacionSolicitado == 3)
            {
                await TrySendThirdApprovalEmailAsync(
                    request.DocumentPath!,
                    request.FileName!,
                    current,
                    solicitud.NuevaFechaFinLaboral,
                    cancellationToken);
            }

            return Ok(new
            {
                success = true,
                message = estadoFinal == "APROBADO"
                    ? "La vigencia del contrato fue aprobada y aplicada correctamente."
                    : "La aprobacion fue registrada correctamente. La solicitud continua pendiente de validaciones.",
                data = new
                {
                    solicitud.IdSolicitudVigencia,
                    solicitud.IdEmpleado,
                    nuevaFechaFinLaboral = solicitud.NuevaFechaFinLaboral,
                    estadoSolicitud = estadoFinal,
                    aprobacionesRealizadas = nivelAprobacionSolicitado,
                    aprobacionesRequeridas = solicitud.AprobacionesRequeridas
                }
            });
        }
        catch (Exception ex)
        {
            await transaction.RollbackAsync(cancellationToken);
            return StatusCode(StatusCodes.Status500InternalServerError, new
            {
                success = false,
                message = "No se pudo registrar la aprobacion de la vigencia del contrato.",
                detail = ex.ToString()
            });
        }
    }

    private async Task TrySendThirdApprovalEmailAsync(
        string documentPath,
        string fileName,
        ContratoEmpleadoDetalleDto current,
        string newEndDate,
        CancellationToken cancellationToken)
    {
        try
        {
            if (!IsSmtpConfigured())
            {
                _logger.LogWarning(
                    "No se envio la notificacion de tercera aprobacion porque SMTP no esta configurado correctamente.");
                return;
            }

            var subject = $"Aprobacion 3era vigencia contrato - {NormalizeMailSubjectValue(current.NombreEmpleado, "Empleado")}";
            var body = BuildThirdApprovalMailBody(current.NombreEmpleado, current.NroDocumento, current.FechaFinLaboral, newEndDate);
            var attachment = await BuildThirdApprovalAttachmentAsync(
                documentPath,
                fileName,
                current,
                newEndDate,
                cancellationToken);

            await SendMailWithAttachmentAsync(
                ThirdApprovalNotificationEmails,
                subject,
                body,
                attachment.FileName,
                attachment.Bytes,
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(
                ex,
                "No se pudo enviar la notificacion de tercera aprobacion del contrato a {Recipient}.",
                string.Join(", ", ThirdApprovalNotificationEmails));
        }
    }

    private async Task<(string FileName, byte[] Bytes)> BuildThirdApprovalAttachmentAsync(
        string documentPath,
        string fileName,
        ContratoEmpleadoDetalleDto current,
        string newEndDate,
        CancellationToken cancellationToken)
    {
        if (!documentPath.Contains("FORMATOS_CONTRATOS", StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException("La ruta del documento no es valida.");
        }

        var templateBytes = await _sharePointCommercialUploadService.DownloadFileAsync(documentPath, cancellationToken);
        var replacements = BuildContractReplacements(current, newEndDate);
        var renderedBytes = ReplaceWordPlaceholders(templateBytes, replacements);
        var normalizedFileName = NormalizeAttachmentFileName(fileName);
        return (normalizedFileName, renderedBytes);
    }

    private async Task SendMailWithAttachmentAsync(
        IEnumerable<string> recipients,
        string subject,
        string body,
        string attachmentName,
        byte[] attachmentContent,
        string contentType,
        CancellationToken cancellationToken)
    {
        using var smtp = new SmtpClient
        {
            Timeout = Math.Max(1, _smtpSettings.TimeoutSeconds) * 1000
        };

        if (_smtpSettings.AllowInvalidCertificate)
        {
            smtp.ServerCertificateValidationCallback = static (_, _, _, _) => true;
        }

        var message = new MimeMessage();
        message.From.Add(MailboxAddress.Parse(_smtpSettings.From));
        var normalizedRecipients = recipients
            .Where(email => !string.IsNullOrWhiteSpace(email))
            .Select(email => email.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        if (normalizedRecipients.Count == 0)
        {
            throw new InvalidOperationException("No hay destinatarios configurados para el correo de aprobacion.");
        }

        message.To.Add(MailboxAddress.Parse(normalizedRecipients[0]));
        foreach (var recipient in normalizedRecipients.Skip(1))
        {
            message.Cc.Add(MailboxAddress.Parse(recipient));
        }
        message.Subject = subject;

        var bodyBuilder = new BodyBuilder
        {
            TextBody = body
        };
        bodyBuilder.Attachments.Add(attachmentName, attachmentContent, ContentType.Parse(contentType));
        message.Body = bodyBuilder.ToMessageBody();

        var socketOptions = _smtpSettings.EnableSsl ? SecureSocketOptions.StartTls : SecureSocketOptions.None;
        await smtp.ConnectAsync(_smtpSettings.Host, _smtpSettings.Port, socketOptions, cancellationToken);
        await smtp.AuthenticateAsync(_smtpSettings.UserName, _smtpSettings.Password, cancellationToken);
        await smtp.SendAsync(message, cancellationToken);
        await smtp.DisconnectAsync(true, cancellationToken);
    }

    private bool IsSmtpConfigured()
    {
        return !string.IsNullOrWhiteSpace(_smtpSettings.Host) &&
               !string.IsNullOrWhiteSpace(_smtpSettings.UserName) &&
               !string.IsNullOrWhiteSpace(_smtpSettings.Password) &&
               !string.IsNullOrWhiteSpace(_smtpSettings.From);
    }

    private static string NormalizeMailSubjectValue(string? value, string fallback)
    {
        var text = (value ?? string.Empty).Trim();
        return string.IsNullOrWhiteSpace(text) ? fallback : text;
    }

    private static string BuildThirdApprovalMailBody(
        string employeeName,
        string nroDocumento,
        string currentEndDate,
        string newEndDate)
    {
        var nombre = NormalizeMailSubjectValue(employeeName, "Empleado");
        var documento = string.IsNullOrWhiteSpace(nroDocumento) ? "N/D" : nroDocumento.Trim();
        var fechaActual = string.IsNullOrWhiteSpace(currentEndDate) ? "N/D" : currentEndDate.Trim();
        var fechaNueva = string.IsNullOrWhiteSpace(newEndDate) ? "N/D" : newEndDate.Trim();

        return
            $"Estimado(a),{Environment.NewLine}{Environment.NewLine}" +
            $"Se ha completado la 3era validacion de la renovacion de contrato del colaborador {nombre}.{Environment.NewLine}" +
            $"Documento: {documento}{Environment.NewLine}" +
            $"Fecha fin actual: {fechaActual}{Environment.NewLine}" +
            $"Nueva fecha fin: {fechaNueva}{Environment.NewLine}{Environment.NewLine}" +
            $"La actualizacion ya fue registrada en el sistema.{Environment.NewLine}{Environment.NewLine}" +
            $"Saludos cordiales,{Environment.NewLine}CJ ERP";
    }

    private static Dictionary<string, string> BuildContractReplacements(
        ContratoEmpleadoDetalleDto current,
        string newEndDate)
    {
        var contractEndDate = ParseContractWordDate(current.FechaFinLaboral);
        var nextStartDate = contractEndDate?.Date.AddDays(1);
        var proposalEndDate = ParseContractWordDate(newEndDate) ?? contractEndDate;
        var months = GetMonthsDifference(nextStartDate, proposalEndDate);

        return new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            ["NOMBREEMPLEADO"] = current.NombreEmpleado ?? string.Empty,
            ["NombreEmpleado"] = current.NombreEmpleado ?? string.Empty,
            ["NRODOCUMENTO"] = current.NroDocumento ?? string.Empty,
            ["NroDocumento"] = current.NroDocumento ?? string.Empty,
            ["DIRECCION"] = current.Direccion ?? string.Empty,
            ["Direccion"] = current.Direccion ?? string.Empty,
            ["AREA"] = current.Area ?? string.Empty,
            ["Area"] = current.Area ?? string.Empty,
            ["CLIENTE"] = current.Cliente ?? string.Empty,
            ["Cliente"] = current.Cliente ?? string.Empty,
            ["UBICACION"] = current.Ubicacion ?? string.Empty,
            ["Ubicacion"] = current.Ubicacion ?? string.Empty,
            ["CargoPrint"] = current.CargoPrint ?? string.Empty,
            ["FECHAINILABORAL"] = FormatContractWordDate(current.FechaIniLaboral),
            ["FechaIniLaboral"] = FormatContractWordDate(current.FechaIniLaboral),
            ["FECHAFINLABORAL"] = FormatContractWordDate(proposalEndDate),
            ["FechaFinLaboral"] = FormatContractWordDate(proposalEndDate),
            ["N_FECHAINILABORAL"] = FormatContractWordDate(nextStartDate),
            ["N_FechaIniLaboral"] = FormatContractWordDate(nextStartDate),
            ["N_fechainilaboral"] = FormatContractWordDate(nextStartDate),
            ["N_FECHAFINLABORAL"] = FormatContractWordDate(proposalEndDate),
            ["N_FechaFinLaboral"] = FormatContractWordDate(proposalEndDate),
            ["N_FechaFinalLaboral"] = FormatContractWordDate(proposalEndDate),
            ["MESES_N"] = months,
            ["Meses_N"] = months
        };
    }

    private static string NormalizeAttachmentFileName(string fileName)
    {
        var raw = (fileName ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(raw))
        {
            return "Contrato.docx";
        }

        foreach (var invalidChar in Path.GetInvalidFileNameChars())
        {
            raw = raw.Replace(invalidChar, '_');
        }

        return raw.EndsWith(".docx", StringComparison.OrdinalIgnoreCase) ? raw : $"{raw}.docx";
    }

    private static DateTime? ParseContractWordDate(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        return DateTime.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsed)
            ? parsed
            : DateTime.TryParse(value, out parsed)
                ? parsed
                : null;
    }

    private static string FormatContractWordDate(string? value)
    {
        var parsed = ParseContractWordDate(value);
        return parsed.HasValue ? FormatContractWordDate(parsed.Value) : string.Empty;
    }

    private static string FormatContractWordDate(DateTime? value)
    {
        return value.HasValue ? FormatContractWordDate(value.Value) : string.Empty;
    }

    private static string FormatContractWordDate(DateTime value)
    {
        return value.ToString("dd/MM/yyyy", CultureInfo.InvariantCulture);
    }

    private static string GetMonthsDifference(DateTime? startDate, DateTime? endDate)
    {
        if (!startDate.HasValue || !endDate.HasValue)
        {
            return string.Empty;
        }

        var diffYears = endDate.Value.Year - startDate.Value.Year;
        var diffMonths = endDate.Value.Month - startDate.Value.Month;
        var totalMonths = diffYears * 12 + diffMonths;

        if (totalMonths < 0)
        {
            return string.Empty;
        }

        if (endDate.Value.Date < startDate.Value.Date)
        {
            return Math.Max(totalMonths - 1, 0).ToString(CultureInfo.InvariantCulture);
        }

        return totalMonths.ToString(CultureInfo.InvariantCulture);
    }

    [HttpPut("historial/{idHistorialLaboral:int}/desactivar")]
    public async Task<IActionResult> DesactivarHistorial(
        int idHistorialLaboral,
        CancellationToken cancellationToken)
    {
        if (idHistorialLaboral <= 0)
        {
            return BadRequest(new { success = false, message = "IdHistorialLaboral es obligatorio." });
        }

        var connectionString = _configuration.GetConnectionString("DefaultConnection");
        if (string.IsNullOrWhiteSpace(connectionString))
        {
            return StatusCode(StatusCodes.Status500InternalServerError, new
            {
                success = false,
                message = "La cadena de conexion no esta configurada."
            });
        }

        await using var connection = new SqlConnection(connectionString);
        await connection.OpenAsync(cancellationToken);
        await using var transaction = await connection.BeginTransactionAsync(cancellationToken);

        try
        {
            var historyExists = await connection.ExecuteScalarAsync<int>(
                new CommandDefinition(
                    "SELECT COUNT(1) FROM sys.objects WHERE object_id = OBJECT_ID(@TableName) AND type = 'U';",
                    new { TableName = HistoryTableName },
                    transaction: transaction,
                    cancellationToken: cancellationToken));

            if (historyExists <= 0)
            {
                await transaction.RollbackAsync(cancellationToken);
                return BadRequest(new
                {
                    success = false,
                    message = $"No existe la tabla de historial {HistoryTableName}."
                });
            }

            var historyRow = await connection.QueryFirstOrDefaultAsync(
                new CommandDefinition(
                    $"""
                    SELECT TOP (1)
                        h.IdHistorialLaboral,
                        h.IdEmpleado,
                        CONVERT(varchar(10), h.FechaFinLaboral, 23) AS FechaFinLaboral,
                        CAST(ISNULL(h.IdActivo, 1) AS bit) AS IdActivo
                    FROM {HistoryTableName} h
                    WHERE h.IdHistorialLaboral = @IdHistorialLaboral
                    """,
                    new { IdHistorialLaboral = idHistorialLaboral },
                    transaction: transaction,
                    cancellationToken: cancellationToken));

            if (historyRow is null)
            {
                await transaction.RollbackAsync(cancellationToken);
                return NotFound(new { success = false, message = "No se encontro el registro de historial solicitado." });
            }

            var historyValues = (IDictionary<string, object?>)historyRow;
            var idEmpleado = GetInt(historyValues, "IdEmpleado", "idEmpleado");
            var fechaFinHistorial = GetDateString(historyValues, "FechaFinLaboral", "fechaFinLaboral");
            var idActivo = GetBool(historyValues, "IdActivo", "idActivo") ?? true;

            if (!idEmpleado.HasValue)
            {
                await transaction.RollbackAsync(cancellationToken);
                return BadRequest(new
                {
                    success = false,
                    message = "No se pudo determinar el empleado asociado al historial."
                });
            }

            if (!idActivo)
            {
                await transaction.RollbackAsync(cancellationToken);
                return BadRequest(new
                {
                    success = false,
                    message = "El registro ya se encuentra desactivado."
                });
            }

            var current = await ObtenerFichaContratoEmpleadoAsync(connection, idEmpleado.Value, cancellationToken, transaction);
            if (current is null)
            {
                await transaction.RollbackAsync(cancellationToken);
                return NotFound(new { success = false, message = "No se encontro el empleado asociado al historial." });
            }

            if (!string.IsNullOrWhiteSpace(current.FechaFinLaboral) &&
                !string.IsNullOrWhiteSpace(fechaFinHistorial) &&
                DateTime.TryParse(current.FechaFinLaboral, out var fechaFinActual) &&
                DateTime.TryParse(fechaFinHistorial, out var fechaFinRegistro) &&
                fechaFinActual.Date == fechaFinRegistro.Date)
            {
                await transaction.RollbackAsync(cancellationToken);
                return BadRequest(new
                {
                    success = false,
                    message = "No es posible desactivar el registro porque coincide con la fecha fin vigente del empleado."
                });
            }

            var usuario = User.FindFirstValue("Usuario")
                ?? User.FindFirstValue("usuario")
                ?? User.FindFirstValue(ClaimTypes.Name)
                ?? User.Identity?.Name
                ?? "SISTEMA";

            await connection.ExecuteAsync(
                new CommandDefinition(
                    $"""
                    UPDATE {HistoryTableName}
                    SET IdActivo = 0
                    WHERE IdHistorialLaboral = @IdHistorialLaboral
                    """,
                    new { IdHistorialLaboral = idHistorialLaboral },
                    transaction: transaction,
                    cancellationToken: cancellationToken));

            await transaction.CommitAsync(cancellationToken);

            return Ok(new
            {
                success = true,
                message = $"El registro de historial {idHistorialLaboral} fue desactivado correctamente.",
                data = new
                {
                    idHistorialLaboral,
                    usuario
                }
            });
        }
        catch (Exception ex)
        {
            await transaction.RollbackAsync(cancellationToken);
            return StatusCode(StatusCodes.Status500InternalServerError, new
            {
                success = false,
                message = "No se pudo desactivar el registro del historial.",
                detail = ex.ToString()
            });
        }
    }

    private static DateTime? ParseNullableDate(string? value)
    {
        return DateTime.TryParse(value, out var parsed) ? parsed : null;
    }

    private static string? FormatAuditDate(DateTime? value)
    {
        return value?.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
    }

    private static string FormatAuditDate(DateTime value)
    {
        return value.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
    }

    private static IEnumerable<AuditoriaCambioDto> BuildSolicitudCreacionAuditEntries(
        int idSolicitudVigencia,
        int idEmpleado,
        DateTime? fechaFinActual,
        DateTime nuevaFechaFinLaboral,
        int aprobadorId,
        string usuario,
        string observacion)
    {
        var idRegistro = idSolicitudVigencia.ToString(CultureInfo.InvariantCulture);
        var fechaActualTexto = FormatAuditDate(fechaFinActual);
        var nuevaFechaTexto = FormatAuditDate(nuevaFechaFinLaboral);
        var fechaAprobacionTexto = FormatAuditDate(DateTime.Now);

        yield return new AuditoriaCambioDto
        {
            Modulo = "RecursosHumanos",
            Entidad = "EmpleadoCjSolicitudVigencia",
            IdRegistro = idRegistro,
            Accion = "INSERT",
            Seccion = "Solicitud",
            Campo = "EstadoSolicitud",
            ValorAnterior = null,
            ValorNuevo = "PENDIENTE",
            UsuarioAccion = usuario,
            Observacion = observacion
        };

        yield return new AuditoriaCambioDto
        {
            Modulo = "RecursosHumanos",
            Entidad = "EmpleadoCjSolicitudVigencia",
            IdRegistro = idRegistro,
            Accion = "INSERT",
            Seccion = "Solicitud",
            Campo = "IdEmpleado",
            ValorAnterior = null,
            ValorNuevo = idEmpleado.ToString(CultureInfo.InvariantCulture),
            UsuarioAccion = usuario,
            Observacion = observacion
        };

        yield return new AuditoriaCambioDto
        {
            Modulo = "RecursosHumanos",
            Entidad = "EmpleadoCjSolicitudVigencia",
            IdRegistro = idRegistro,
            Accion = "INSERT",
            Seccion = "Solicitud",
            Campo = "FechaFinActual",
            ValorAnterior = null,
            ValorNuevo = fechaActualTexto,
            UsuarioAccion = usuario,
            Observacion = observacion
        };

        yield return new AuditoriaCambioDto
        {
            Modulo = "RecursosHumanos",
            Entidad = "EmpleadoCjSolicitudVigencia",
            IdRegistro = idRegistro,
            Accion = "INSERT",
            Seccion = "Solicitud",
            Campo = "NuevaFechaFinLaboral",
            ValorAnterior = null,
            ValorNuevo = nuevaFechaTexto,
            UsuarioAccion = usuario,
            Observacion = observacion
        };

        yield return new AuditoriaCambioDto
        {
            Modulo = "RecursosHumanos",
            Entidad = "EmpleadoCjSolicitudVigencia",
            IdRegistro = idRegistro,
            Accion = "INSERT",
            Seccion = "Aprobacion 1",
            Campo = "Aprobacion1IdEmpleado",
            ValorAnterior = null,
            ValorNuevo = aprobadorId.ToString(CultureInfo.InvariantCulture),
            UsuarioAccion = usuario,
            Observacion = observacion
        };

        yield return new AuditoriaCambioDto
        {
            Modulo = "RecursosHumanos",
            Entidad = "EmpleadoCjSolicitudVigencia",
            IdRegistro = idRegistro,
            Accion = "INSERT",
            Seccion = "Aprobacion 1",
            Campo = "Aprobacion1Usuario",
            ValorAnterior = null,
            ValorNuevo = usuario,
            UsuarioAccion = usuario,
            Observacion = observacion
        };

        yield return new AuditoriaCambioDto
        {
            Modulo = "RecursosHumanos",
            Entidad = "EmpleadoCjSolicitudVigencia",
            IdRegistro = idRegistro,
            Accion = "INSERT",
            Seccion = "Aprobacion 1",
            Campo = "Aprobacion1Fecha",
            ValorAnterior = null,
            ValorNuevo = fechaAprobacionTexto,
            UsuarioAccion = usuario,
            Observacion = observacion
        };

        yield return new AuditoriaCambioDto
        {
            Modulo = "RecursosHumanos",
            Entidad = "EmpleadoCjSolicitudVigencia",
            IdRegistro = idRegistro,
            Accion = "INSERT",
            Seccion = "Aprobacion 1",
            Campo = "Aprobacion1Observacion",
            ValorAnterior = null,
            ValorNuevo = observacion,
            UsuarioAccion = usuario,
            Observacion = observacion
        };
    }

    private static IEnumerable<AuditoriaCambioDto> BuildAprobacionAuditEntries(
        ContratoEmpleadoSolicitudVigenciaDto solicitud,
        int nivelAprobacion,
        int aprobadorId,
        string usuario,
        string observacion,
        string estadoFinal,
        DateTime fechaAccion)
    {
        var idRegistro = solicitud.IdSolicitudVigencia.ToString(CultureInfo.InvariantCulture);
        var numeroAprobacion = nivelAprobacion.ToString(CultureInfo.InvariantCulture);
        var fechaTexto = FormatAuditDate(fechaAccion);

        yield return new AuditoriaCambioDto
        {
            Modulo = "RecursosHumanos",
            Entidad = "EmpleadoCjSolicitudVigencia",
            IdRegistro = idRegistro,
            Accion = "UPDATE",
            Seccion = $"Aprobacion {numeroAprobacion}",
            Campo = $"Aprobacion{numeroAprobacion}IdEmpleado",
            ValorAnterior = null,
            ValorNuevo = aprobadorId.ToString(CultureInfo.InvariantCulture),
            UsuarioAccion = usuario,
            Observacion = observacion
        };

        yield return new AuditoriaCambioDto
        {
            Modulo = "RecursosHumanos",
            Entidad = "EmpleadoCjSolicitudVigencia",
            IdRegistro = idRegistro,
            Accion = "UPDATE",
            Seccion = $"Aprobacion {numeroAprobacion}",
            Campo = $"Aprobacion{numeroAprobacion}Usuario",
            ValorAnterior = null,
            ValorNuevo = usuario,
            UsuarioAccion = usuario,
            Observacion = observacion
        };

        yield return new AuditoriaCambioDto
        {
            Modulo = "RecursosHumanos",
            Entidad = "EmpleadoCjSolicitudVigencia",
            IdRegistro = idRegistro,
            Accion = "UPDATE",
            Seccion = $"Aprobacion {numeroAprobacion}",
            Campo = $"Aprobacion{numeroAprobacion}Fecha",
            ValorAnterior = null,
            ValorNuevo = fechaTexto,
            UsuarioAccion = usuario,
            Observacion = observacion
        };

        yield return new AuditoriaCambioDto
        {
            Modulo = "RecursosHumanos",
            Entidad = "EmpleadoCjSolicitudVigencia",
            IdRegistro = idRegistro,
            Accion = "UPDATE",
            Seccion = $"Aprobacion {numeroAprobacion}",
            Campo = $"Aprobacion{numeroAprobacion}Observacion",
            ValorAnterior = null,
            ValorNuevo = observacion,
            UsuarioAccion = usuario,
            Observacion = observacion
        };

        yield return new AuditoriaCambioDto
        {
            Modulo = "RecursosHumanos",
            Entidad = "EmpleadoCjSolicitudVigencia",
            IdRegistro = idRegistro,
            Accion = "UPDATE",
            Seccion = "Solicitud",
            Campo = "EstadoSolicitud",
            ValorAnterior = solicitud.EstadoSolicitud,
            ValorNuevo = estadoFinal,
            UsuarioAccion = usuario,
            Observacion = observacion
        };

        if (string.Equals(estadoFinal, "APROBADO", StringComparison.OrdinalIgnoreCase))
        {
            yield return new AuditoriaCambioDto
            {
                Modulo = "RecursosHumanos",
                Entidad = "EmpleadoCjSolicitudVigencia",
                IdRegistro = idRegistro,
                Accion = "UPDATE",
                Seccion = "Solicitud",
                Campo = "FechaAplicacion",
                ValorAnterior = null,
                ValorNuevo = fechaTexto,
                UsuarioAccion = usuario,
                Observacion = observacion
            };
        }
    }

    private static IEnumerable<AuditoriaCambioDto> BuildSolicitudActualizacionFechaAuditEntries(
        ContratoEmpleadoSolicitudVigenciaDto solicitud,
        DateTime nuevaFechaFinLaboral,
        string usuario)
    {
        var observacion = $"Se actualizo la fecha fin propuesta durante el flujo de aprobacion.";
        yield return new AuditoriaCambioDto
        {
            Modulo = "RecursosHumanos",
            Entidad = "EmpleadoCjSolicitudVigencia",
            IdRegistro = solicitud.IdSolicitudVigencia.ToString(CultureInfo.InvariantCulture),
            Accion = "UPDATE",
            Seccion = "Solicitud",
            Campo = "NuevaFechaFinLaboral",
            ValorAnterior = solicitud.NuevaFechaFinLaboral,
            ValorNuevo = FormatAuditDate(nuevaFechaFinLaboral),
            UsuarioAccion = usuario,
            Observacion = observacion
        };
    }

    private async Task RegistrarAuditoriaAsync(
        IEnumerable<AuditoriaCambioDto> cambios,
        CancellationToken cancellationToken)
    {
        var lote = cambios
            .Where(cambio =>
                !string.IsNullOrWhiteSpace(cambio.Modulo) &&
                !string.IsNullOrWhiteSpace(cambio.Entidad) &&
                !string.IsNullOrWhiteSpace(cambio.IdRegistro) &&
                !string.IsNullOrWhiteSpace(cambio.Accion) &&
                !string.IsNullOrWhiteSpace(cambio.Campo) &&
                !string.IsNullOrWhiteSpace(cambio.UsuarioAccion))
            .ToList();

        if (lote.Count == 0)
        {
            return;
        }

        await _auditoriaCambiosService.RegistrarLoteAsync(lote, cancellationToken);
    }

    private string ResolveUsuarioActual()
    {
        return User.FindFirstValue("Usuario")
            ?? User.FindFirstValue("IdUsuario")
            ?? User.FindFirstValue(ClaimTypes.Name)
            ?? User.Identity?.Name
            ?? "SISTEMA";
    }

    private int? ResolveIdAprobador()
    {
        var aprobadorClaim = User.FindFirstValue("IdEmpleado")
            ?? User.FindFirstValue("CodEmp")
            ?? User.FindFirstValue("CodEmpleadoMostrar");

        return int.TryParse(aprobadorClaim, out var idAprobador) && idAprobador > 0
            ? idAprobador
            : null;
    }

    private async Task<ContratoEmpleadoSolicitudVigenciaDto?> ObtenerSolicitudVigenciaAsync(
        SqlConnection connection,
        int idEmpleado,
        CancellationToken cancellationToken,
        IDbTransaction? transaction = null)
    {
        var requestExists = await connection.ExecuteScalarAsync<int>(
            new CommandDefinition(
                "SELECT COUNT(1) FROM sys.objects WHERE object_id = OBJECT_ID(@TableName) AND type = 'U';",
                new { TableName = RequestTableName },
                transaction: transaction,
                cancellationToken: cancellationToken));

        if (requestExists <= 0)
        {
            return null;
        }

        var request = await connection.QueryFirstOrDefaultAsync(
            new CommandDefinition(
                $"""
                SELECT TOP (1)
                    IdSolicitudVigencia,
                    IdEmpleado,
                    CONVERT(varchar(10), FechaFinActual, 23) AS FechaFinActual,
                    CONVERT(varchar(10), NuevaFechaFinLaboral, 23) AS NuevaFechaFinLaboral,
                    ISNULL(EstadoSolicitud, '') AS EstadoSolicitud,
                    Aprobacion1IdEmpleado,
                    Aprobacion2IdEmpleado,
                    Aprobacion3IdEmpleado,
                    ISNULL(Aprobacion1Usuario, '') AS Aprobacion1Usuario,
                    ISNULL(Aprobacion2Usuario, '') AS Aprobacion2Usuario,
                    ISNULL(Aprobacion3Usuario, '') AS Aprobacion3Usuario,
                    ISNULL(Aprobacion1Observacion, '') AS Aprobacion1Observacion,
                    ISNULL(Aprobacion2Observacion, '') AS Aprobacion2Observacion,
                    ISNULL(Aprobacion3Observacion, '') AS Aprobacion3Observacion,
                    CONVERT(varchar(19), Aprobacion1Fecha, 120) AS Aprobacion1Fecha,
                    CONVERT(varchar(19), Aprobacion2Fecha, 120) AS Aprobacion2Fecha,
                    CONVERT(varchar(19), Aprobacion3Fecha, 120) AS Aprobacion3Fecha,
                    ISNULL(UsuarioCre, '') AS UsuarioCre,
                    CONVERT(varchar(19), FechaCreacion, 120) AS FechaCreacion,
                    ISNULL(UsuarioMod, '') AS UsuarioMod,
                    CONVERT(varchar(19), FechaMod, 120) AS FechaMod,
                    CASE WHEN Aprobacion1IdEmpleado IS NULL THEN 0 ELSE 1 END
                      + CASE WHEN Aprobacion2IdEmpleado IS NULL THEN 0 ELSE 1 END
                      + CASE WHEN Aprobacion3IdEmpleado IS NULL THEN 0 ELSE 1 END AS AprobacionesRealizadas
                FROM {RequestTableName}
                WHERE IdEmpleado = @IdEmpleado
                ORDER BY CASE WHEN EstadoSolicitud = 'PENDIENTE' THEN 0 ELSE 1 END,
                         ISNULL(FechaCreacion, '19000101') DESC,
                         IdSolicitudVigencia DESC
                """,
                new { IdEmpleado = idEmpleado },
                transaction: transaction,
                cancellationToken: cancellationToken));

        if (request is null)
        {
            return null;
        }

        var values = (IDictionary<string, object?>)request;
        return new ContratoEmpleadoSolicitudVigenciaDto
        {
            IdSolicitudVigencia = GetInt(values, "IdSolicitudVigencia", "idSolicitudVigencia") ?? 0,
            IdEmpleado = GetInt(values, "IdEmpleado", "idEmpleado") ?? idEmpleado,
            FechaFinActual = GetDateString(values, "FechaFinActual", "fechaFinActual"),
            NuevaFechaFinLaboral = GetDateString(values, "NuevaFechaFinLaboral", "nuevaFechaFinLaboral"),
            EstadoSolicitud = GetString(values, "EstadoSolicitud", "estadoSolicitud"),
            Aprobacion1IdEmpleado = GetInt(values, "Aprobacion1IdEmpleado", "aprobacion1IdEmpleado"),
            Aprobacion2IdEmpleado = GetInt(values, "Aprobacion2IdEmpleado", "aprobacion2IdEmpleado"),
            Aprobacion3IdEmpleado = GetInt(values, "Aprobacion3IdEmpleado", "aprobacion3IdEmpleado"),
            Aprobacion1Usuario = GetString(values, "Aprobacion1Usuario", "aprobacion1Usuario"),
            Aprobacion2Usuario = GetString(values, "Aprobacion2Usuario", "aprobacion2Usuario"),
            Aprobacion3Usuario = GetString(values, "Aprobacion3Usuario", "aprobacion3Usuario"),
            Aprobacion1Observacion = GetString(values, "Aprobacion1Observacion", "aprobacion1Observacion"),
            Aprobacion2Observacion = GetString(values, "Aprobacion2Observacion", "aprobacion2Observacion"),
            Aprobacion3Observacion = GetString(values, "Aprobacion3Observacion", "aprobacion3Observacion"),
            Aprobacion1Fecha = GetDateString(values, "Aprobacion1Fecha", "aprobacion1Fecha"),
            Aprobacion2Fecha = GetDateString(values, "Aprobacion2Fecha", "aprobacion2Fecha"),
            Aprobacion3Fecha = GetDateString(values, "Aprobacion3Fecha", "aprobacion3Fecha"),
            UsuarioCre = GetString(values, "UsuarioCre", "usuarioCre"),
            FechaCreacion = GetDateString(values, "FechaCreacion", "fechaCreacion"),
            UsuarioMod = GetString(values, "UsuarioMod", "usuarioMod"),
            FechaMod = GetDateString(values, "FechaMod", "fechaMod"),
            AprobacionesRealizadas = GetInt(values, "AprobacionesRealizadas", "aprobacionesRealizadas") ?? 0
        };
    }

    private static async Task<ContratoEmpleadoDetalleDto?> ObtenerFichaContratoEmpleadoAsync(
        SqlConnection connection,
        int idEmpleado,
        CancellationToken cancellationToken,
        IDbTransaction? transaction = null)
    {
        var existingProcedure = await connection.ExecuteScalarAsync<int?>(
            new CommandDefinition(
                "SELECT OBJECT_ID(@StoredProcedureName)",
                new { StoredProcedureName = FichaStoredProcedureName },
                transaction: transaction,
                cancellationToken: cancellationToken));

        if (!existingProcedure.HasValue)
        {
            return await connection.QueryFirstOrDefaultAsync<ContratoEmpleadoDetalleDto>(
                new CommandDefinition(
                    """
                    SELECT TOP (1)
                        IdEmpleado,
                        ISNULL(NombreEmpleado, '') AS NombreEmpleado,
                        ISNULL(NroDocumento, '') AS NroDocumento,
                        ISNULL(Correo, '') AS Correo,
                        ISNULL(Telefono, '') AS Telefono,
                        ISNULL(c.ValorIni, '') AS Empresa,
                        ISNULL(d.ValorIni, '') AS Cliente,
                        ISNULL(e.ValorIni, '') AS Area,
                        ISNULL(f.ValorIni, '') AS Ubicacion,
                        ISNULL(b.Direccion, '') AS Direccion,
                        IdCargo,
                        IdTipoEmpleado,
                        IdEmpRel,
                        IdEstado,
                        CAST(IdActivo AS bit) AS IdActivo,
                        CONVERT(varchar(10), FechaIniLaboral, 23) AS FechaIniLaboral,
                        CONVERT(varchar(10), FechaFinLaboral, 23) AS FechaFinLaboral,
                        CONVERT(varchar(10), FechaBaja, 23) AS FechaBaja
                    FROM dbo.EmpleadoCj
                    LEFT JOIN dbo.EmpleadoCjDetalle b
                        ON IdEmpleado = b.IdEmpleadoCj
                    LEFT JOIN dbo.Constante c
                        ON c.Campo = 'EMPRESA_CJ'
                       AND b.IdEmpresaCj = c.Correlativo
                    LEFT JOIN dbo.Constante d
                        ON d.Campo = 'CLIENTE_CJ'
                       AND b.IdClienteCj = d.Correlativo
                    LEFT JOIN dbo.Constante e
                        ON e.Campo = 'AREA_CJ'
                       AND b.IdAreaCj = e.Correlativo
                    LEFT JOIN dbo.Constante f
                        ON f.Campo = 'UBICACION_CJ'
                       AND b.IdUbicacionCj = f.Correlativo
                    WHERE IdEmpleado = @IdEmpleado
                    ORDER BY ISNULL(FechaCreacion, '19000101') DESC, ISNULL(FechaIniLaboral, '19000101') DESC
                    """,
                    new { IdEmpleado = idEmpleado },
                    transaction: transaction,
                    cancellationToken: cancellationToken));
        }

        var parameterNames = (await connection.QueryAsync<string>(
            new CommandDefinition(
                """
                SELECT p.name
                FROM sys.parameters p
                WHERE p.object_id = @ObjectId
                ORDER BY p.parameter_id
                """,
                new { ObjectId = existingProcedure.Value },
                transaction: transaction,
                cancellationToken: cancellationToken)))
            .Select(value => value.Trim())
            .Where(value => !string.IsNullOrWhiteSpace(value))
            .ToList();

        var commandParameters = BuildFichaParameters(parameterNames, idEmpleado);

        var row = await connection.QueryFirstOrDefaultAsync(
            new CommandDefinition(
                FichaStoredProcedureName,
                commandParameters,
                transaction: transaction,
                commandType: CommandType.StoredProcedure,
                cancellationToken: cancellationToken));

        if (row is null)
        {
            return null;
        }

        var values = (IDictionary<string, object?>)row;

        return new ContratoEmpleadoDetalleDto
        {
            IdEmpleado = GetInt(values, "IdEmpleado", "idEmpleado", "IdEmpleadoCj", "idEmpleadoCj") ?? idEmpleado,
            NombreEmpleado = GetString(values, "NombreEmpleado", "nombreEmpleado", "nombreempleado"),
            NroDocumento = GetString(values, "NroDocumento", "nroDocumento", "Nrodocumento"),
            Correo = GetString(values, "Correo", "correo", "Email", "email"),
            Telefono = GetString(values, "Telefono", "telefono", "Celular", "celular"),
            Empresa = GetString(values, "Empresa", "empresa"),
            Cliente = GetString(values, "Cliente", "cliente"),
            Area = GetString(values, "Area", "area"),
            Ubicacion = GetString(values, "Ubicacion", "ubicacion"),
            Direccion = GetString(values, "Direccion", "direccion"),
            CargoPrint = GetString(values, "CargoPrint", "cargoPrint", "Cargo", "cargo"),
            IdCargo = GetInt(values, "IdCargo", "idCargo"),
            IdTipoEmpleado = GetInt(values, "IdTipoEmpleado", "idTipoEmpleado"),
            IdEmpRel = GetInt(values, "IdEmpRel", "idEmpRel"),
            IdEstado = GetInt(values, "IdEstado", "idEstado"),
            IdActivo = GetBool(values, "IdActivo", "idActivo"),
            FechaIniLaboral = GetDateString(values, "FechaIniLaboral", "fechaIniLaboral", "fechainilaboral"),
            FechaFinLaboral = GetDateString(values, "FechaFinLaboral", "FechaFinlaboral", "fechaFinLaboral", "fechafinlaboral", "fechfinlaboral"),
            FechaBaja = GetDateString(values, "FechaBaja", "fechaBaja"),
            MesesN = GetString(values, "Meses_N", "MesesN", "meses_n", "Meses", "meses"),
            NuevaFechaFinLaboral = GetDateString(values, "NuevaFechaFinLaboral", "nuevaFechaFinLaboral"),
            Aprobacion1Fecha = GetDateString(values, "Aprobacion1Fecha", "aprobacion1Fecha"),
            Aprobacion2Fecha = GetDateString(values, "Aprobacion2Fecha", "aprobacion2Fecha"),
            Aprobacion3Fecha = GetDateString(values, "Aprobacion3Fecha", "aprobacion3Fecha")
        };
    }

    private static DynamicParameters BuildFichaParameters(IReadOnlyCollection<string> parameterNames, int idEmpleado)
    {
        var parameters = new DynamicParameters();

        if (parameterNames.Count == 0)
        {
            return parameters;
        }

        var normalizedNames = parameterNames
            .Select(name => name.Trim().TrimStart('@'))
            .Where(name => !string.IsNullOrWhiteSpace(name))
            .ToList();

        foreach (var candidate in FichaCandidateParameterNames)
        {
            if (normalizedNames.Contains(candidate, StringComparer.OrdinalIgnoreCase))
            {
                parameters.Add(candidate.StartsWith("@", StringComparison.Ordinal) ? candidate : "@" + candidate, idEmpleado, DbType.Int32);
                return parameters;
            }
        }

        if (parameterNames.Count == 1)
        {
            var singleName = parameterNames.First().Trim();
            parameters.Add(singleName.StartsWith("@", StringComparison.Ordinal) ? singleName : "@" + singleName, idEmpleado, DbType.Int32);
        }

        return parameters;
    }

    private static string GetString(IDictionary<string, object?> values, params string[] keys)
    {
        foreach (var key in keys)
        {
            if (!TryGetValue(values, key, out var value) || value is null || value is DBNull)
            {
                continue;
            }

            var text = value.ToString()?.Trim();
            if (!string.IsNullOrWhiteSpace(text))
            {
                return text;
            }
        }

        return string.Empty;
    }

    private static int? GetInt(IDictionary<string, object?> values, params string[] keys)
    {
        foreach (var key in keys)
        {
            if (!TryGetValue(values, key, out var value) || value is null || value is DBNull)
            {
                continue;
            }

            if (value is int intValue)
            {
                return intValue;
            }

            if (int.TryParse(value.ToString(), out var parsed))
            {
                return parsed;
            }
        }

        return null;
    }

    private static bool? GetBool(IDictionary<string, object?> values, params string[] keys)
    {
        foreach (var key in keys)
        {
            if (!TryGetValue(values, key, out var value) || value is null || value is DBNull)
            {
                continue;
            }

            if (value is bool boolValue)
            {
                return boolValue;
            }

            if (value is byte byteValue)
            {
                return byteValue != 0;
            }

            if (bool.TryParse(value.ToString(), out var parsedBool))
            {
                return parsedBool;
            }

            if (int.TryParse(value.ToString(), out var parsedInt))
            {
                return parsedInt != 0;
            }
        }

        return null;
    }

    private static string GetDateString(IDictionary<string, object?> values, params string[] keys)
    {
        foreach (var key in keys)
        {
            if (!TryGetValue(values, key, out var value) || value is null || value is DBNull)
            {
                continue;
            }

            if (value is DateTime dateValue)
            {
                return dateValue.ToString("yyyy-MM-dd");
            }

            if (DateTime.TryParse(value.ToString(), out var parsed))
            {
                return parsed.ToString("yyyy-MM-dd");
            }
        }

        return string.Empty;
    }

    private static bool TryGetValue(IDictionary<string, object?> values, string key, out object? value)
    {
        if (values.TryGetValue(key, out value))
        {
            return true;
        }

        var matched = values.Keys.FirstOrDefault(item => item.Equals(key, StringComparison.OrdinalIgnoreCase));
        if (matched is null)
        {
            value = null;
            return false;
        }

        value = values[matched];
        return true;
    }

    private static Dictionary<string, string> NormalizeReplacements(IReadOnlyDictionary<string, string>? replacements)
    {
        var result = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

        if (replacements is null)
        {
            return result;
        }

        foreach (var pair in replacements)
        {
            var key = pair.Key?.Trim();
            if (string.IsNullOrWhiteSpace(key))
            {
                continue;
            }

            var value = pair.Value?.Trim() ?? string.Empty;
            foreach (var variant in ExpandReplacementKeyVariants(key))
            {
                result[variant] = value;
            }
        }

        return result
            .OrderByDescending(pair => pair.Key.Length)
            .ThenBy(pair => pair.Key, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(pair => pair.Key, pair => pair.Value, StringComparer.OrdinalIgnoreCase);
    }

    private static IEnumerable<string> ExpandReplacementKeyVariants(string key)
    {
        var trimmed = key.Trim();
        if (string.IsNullOrWhiteSpace(trimmed))
        {
            yield break;
        }

        yield return trimmed;

        if (IsWrappedPlaceholder(trimmed))
        {
            yield break;
        }

        yield return $"({trimmed})";
    }

    private static bool IsWrappedPlaceholder(string value)
    {
        return value.Length >= 2 &&
               ((value[0] == '(' && value[^1] == ')') ||
                (value[0] == '[' && value[^1] == ']') ||
                (value[0] == '{' && value[^1] == '}'));
    }

    private static byte[] ReplaceWordPlaceholders(byte[] templateBytes, IReadOnlyDictionary<string, string> replacements)
    {
        using var inputStream = new MemoryStream(templateBytes);
        using var inputArchive = new ZipArchive(inputStream, ZipArchiveMode.Read, leaveOpen: false);
        using var outputStream = new MemoryStream();

        using (var outputArchive = new ZipArchive(outputStream, ZipArchiveMode.Create, leaveOpen: true))
        {
            foreach (var entry in inputArchive.Entries)
            {
                var newEntry = outputArchive.CreateEntry(entry.FullName, CompressionLevel.Optimal);
                using var entryStream = entry.Open();
                using var newEntryStream = newEntry.Open();

                if (entry.FullName.EndsWith(".xml", StringComparison.OrdinalIgnoreCase))
                {
                    using var reader = new StreamReader(entryStream, Encoding.UTF8, detectEncodingFromByteOrderMarks: true);
                    var content = reader.ReadToEnd();
                    content = ReplaceWordXmlPlaceholders(content, replacements);

                    using var writer = new StreamWriter(newEntryStream, new UTF8Encoding(false), leaveOpen: true);
                    writer.Write(content);
                    writer.Flush();
                }
                else
                {
                    entryStream.CopyTo(newEntryStream);
                }
            }
        }

        return outputStream.ToArray();
    }

    private static string ReplaceWordXmlPlaceholders(string content, IReadOnlyDictionary<string, string> replacements)
    {
        if (string.IsNullOrWhiteSpace(content) || replacements.Count == 0)
        {
            return content;
        }

        var orderedReplacements = OrderReplacementsForWord(replacements);

        try
        {
            var document = XDocument.Parse(content, LoadOptions.PreserveWhitespace);
            var wordNamespace = XNamespace.Get("http://schemas.openxmlformats.org/wordprocessingml/2006/main");

            foreach (var paragraph in document.Descendants(wordNamespace + "p"))
            {
                ReplaceInParagraph(paragraph, orderedReplacements, wordNamespace);
            }

            var serialized = document.Declaration is null
                ? document.ToString(SaveOptions.DisableFormatting)
                : $"{document.Declaration}{document.ToString(SaveOptions.DisableFormatting)}";

            foreach (var replacement in orderedReplacements)
            {
                if (string.IsNullOrWhiteSpace(replacement.Key))
                {
                    continue;
                }

                var escapedValue = SecurityElement.Escape(replacement.Value ?? string.Empty) ?? string.Empty;
                serialized = serialized.Replace(replacement.Key, escapedValue, StringComparison.OrdinalIgnoreCase);
            }

            return serialized;
        }
        catch
        {
            foreach (var replacement in orderedReplacements)
            {
                if (string.IsNullOrWhiteSpace(replacement.Key))
                {
                    continue;
                }

                var escapedValue = SecurityElement.Escape(replacement.Value ?? string.Empty) ?? string.Empty;
                content = content.Replace(replacement.Key, escapedValue, StringComparison.OrdinalIgnoreCase);
            }

            return content;
        }
    }

    private static void ReplaceInParagraph(
        XElement paragraph,
        IReadOnlyList<KeyValuePair<string, string>> replacements,
        XNamespace wordNamespace)
    {
        var textNodes = paragraph.Descendants(wordNamespace + "t").ToList();
        if (textNodes.Count == 0)
        {
            return;
        }

        foreach (var replacement in replacements)
        {
            if (string.IsNullOrWhiteSpace(replacement.Key))
            {
                continue;
            }

            while (TryReplaceAcrossTextNodes(textNodes, replacement.Key, replacement.Value ?? string.Empty, wordNamespace))
            {
            }
        }
    }

    private static IReadOnlyList<KeyValuePair<string, string>> OrderReplacementsForWord(IReadOnlyDictionary<string, string> replacements)
    {
        return replacements
            .OrderByDescending(pair => pair.Key.Length)
            .ThenBy(pair => pair.Key, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    private static bool TryReplaceAcrossTextNodes(
        List<XElement> textNodes,
        string placeholder,
        string replacementValue,
        XNamespace wordNamespace)
    {
        var combinedText = string.Concat(textNodes.Select(node => node.Value));
        if (string.IsNullOrEmpty(combinedText))
        {
            return false;
        }

        var matchIndex = combinedText.IndexOf(placeholder, StringComparison.OrdinalIgnoreCase);
        if (matchIndex < 0)
        {
            return false;
        }

        var start = ResolveTextPosition(textNodes, matchIndex);
        var end = ResolveTextPosition(textNodes, matchIndex + placeholder.Length);
        if (start is null || end is null)
        {
            return false;
        }

        var startNode = textNodes[start.Value.NodeIndex];
        var endNode = textNodes[end.Value.NodeIndex];
        var startText = startNode.Value;
        var endText = endNode.Value;

        var prefix = start.Value.Offset > 0 ? startText[..start.Value.Offset] : string.Empty;
        var suffix = end.Value.Offset < endText.Length ? endText[end.Value.Offset..] : string.Empty;

        if (start.Value.NodeIndex == end.Value.NodeIndex)
        {
            startNode.Value = prefix + replacementValue + suffix;
            EnsureRunBold(startNode, wordNamespace);
            return true;
        }

        startNode.Value = prefix + replacementValue;
        EnsureRunBold(startNode, wordNamespace);

        for (var nodeIndex = start.Value.NodeIndex + 1; nodeIndex < end.Value.NodeIndex; nodeIndex++)
        {
            textNodes[nodeIndex].Value = string.Empty;
        }

        endNode.Value = suffix;
        return true;
    }

    private static void EnsureRunBold(XElement? textNode, XNamespace wordNamespace)
    {
        var run = textNode?.Parent;
        if (run is null || run.Name != wordNamespace + "r")
        {
            return;
        }

        var runProperties = run.Element(wordNamespace + "rPr");
        if (runProperties is null)
        {
            runProperties = new XElement(wordNamespace + "rPr");
            run.AddFirst(runProperties);
        }

        var boldElement = runProperties.Element(wordNamespace + "b");
        if (boldElement is null)
        {
            runProperties.AddFirst(new XElement(wordNamespace + "b"));
            return;
        }

        boldElement.SetAttributeValue(wordNamespace + "val", "true");
    }

    private static (int NodeIndex, int Offset)? ResolveTextPosition(List<XElement> textNodes, int charIndex)
    {
        var remaining = charIndex;

        for (var index = 0; index < textNodes.Count; index++)
        {
            var value = textNodes[index].Value ?? string.Empty;
            if (remaining <= value.Length)
            {
                return (index, remaining);
            }

            remaining -= value.Length;
        }

        if (charIndex == string.Concat(textNodes.Select(node => node.Value)).Length)
        {
            var lastIndex = textNodes.Count - 1;
            return (lastIndex, textNodes[lastIndex].Value.Length);
        }

        return null;
    }
}
