using System.Data;
using System.Security.Claims;
using CjERP.Application.DTOs;
using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;

namespace CjERP.Api.Controllers;

[ApiController]
[Route("api/recursoshumanos/contratos")]
[Authorize]
public class ContratosController : ControllerBase
{
    private const string HistoryTableName = "dbo.EmpleadoCjHistorialLaboral";
    private const string RequestTableName = "dbo.EmpleadoCjSolicitudVigencia";
    private const string FichaStoredProcedureName = "dbo.sp_EmpleadoCj_Ficha";
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

    public ContratosController(IConfiguration configuration)
    {
        _configuration = configuration;
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

            if (solicitudExistente is not null && string.Equals(solicitudExistente.EstadoSolicitud, "PENDIENTE", StringComparison.OrdinalIgnoreCase))
            {
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
            }

            await connection.ExecuteAsync(
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
                    )
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

            await transaction.CommitAsync(cancellationToken);

            return Ok(new
            {
                success = true,
                message = "La fecha fue registrada con 1ra aprobacion y quedo pendiente de 2 validaciones.",
                data = new
                {
                    request.IdEmpleado,
                    nuevaFechaFinLaboral = nuevaFechaFin.ToString("yyyy-MM-dd"),
                    estadoSolicitud = "PENDIENTE",
                    observacion
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
            if (aprobadorId == solicitud.Aprobacion1IdEmpleado ||
                aprobadorId == solicitud.Aprobacion2IdEmpleado ||
                aprobadorId == solicitud.Aprobacion3IdEmpleado)
            {
                await transaction.RollbackAsync(cancellationToken);
                return BadRequest(new
                {
                    success = false,
                    message = "El aprobador actual ya registro una validacion en esta solicitud."
                });
            }

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
                            FechaIniLaboral = ParseNullableDate(current.FechaIniLaboral),
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
            }

            await transaction.CommitAsync(cancellationToken);

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
            IdCargo = GetInt(values, "IdCargo", "idCargo"),
            IdTipoEmpleado = GetInt(values, "IdTipoEmpleado", "idTipoEmpleado"),
            IdEmpRel = GetInt(values, "IdEmpRel", "idEmpRel"),
            IdEstado = GetInt(values, "IdEstado", "idEstado"),
            IdActivo = GetBool(values, "IdActivo", "idActivo"),
            FechaIniLaboral = GetDateString(values, "FechaIniLaboral", "fechaIniLaboral"),
            FechaFinLaboral = GetDateString(values, "FechaFinLaboral", "FechaFinlaboral", "fechaFinLaboral"),
            FechaBaja = GetDateString(values, "FechaBaja", "fechaBaja")
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
}
