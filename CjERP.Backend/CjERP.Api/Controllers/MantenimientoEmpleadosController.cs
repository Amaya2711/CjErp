using System.Data;
using System.Globalization;
using System.Security.Claims;
using CjERP.Application.DTOs;
using CjERP.Application.Interfaces.Services;
using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;

namespace CjERP.Api.Controllers;

[ApiController]
[Route("api/mantenimiento/empleados")]
[Authorize]
public class MantenimientoEmpleadosController : ControllerBase
{
    private const string ListarSp = "dbo.sp_EmpleadoCj_Ficha";
    private const string ObtenerSp = "dbo.sp_EmpleadoCj_Ficha";
    private const string GuardarSp = "dbo.sp_EmpleadoCj_Guardar";
    private const string ActualizarSp = "dbo.sp_EmpleadoCj_Actualizar";
    private const string EliminarSp = "dbo.sp_EmpleadoCj_EliminarLogico";
    private const string AprobarSp = "dbo.sp_EmpleadoCj_AprobarCompleto";

    private readonly IConfiguration _configuration;
    private readonly IAuditoriaCambiosService _auditoriaCambiosService;

    public MantenimientoEmpleadosController(
        IConfiguration configuration,
        IAuditoriaCambiosService auditoriaCambiosService)
    {
        _configuration = configuration;
        _auditoriaCambiosService = auditoriaCambiosService;
    }

    [HttpGet]
    public async Task<IActionResult> Listar(
        [FromQuery] int? idEmpleado,
        [FromQuery] string? nombreEmpleado,
        CancellationToken cancellationToken)
    {
        var connectionString = GetConnectionString();
        if (connectionString is null)
        {
            return StatusCode(StatusCodes.Status500InternalServerError, new
            {
                success = false,
                message = "La cadena de conexion no esta configurada."
            });
        }

        await using var connection = new SqlConnection(connectionString);
        var rows = await ListarEmpleadosAsync(connection, idEmpleado, nombreEmpleado, cancellationToken);

        return Ok(new
        {
            success = true,
            message = "Empleados obtenidos correctamente.",
            data = rows
        });
    }

    [HttpGet("{idEmpleado:int}")]
    public async Task<IActionResult> ObtenerPorId(int idEmpleado, CancellationToken cancellationToken)
    {
        if (idEmpleado <= 0)
        {
            return BadRequest(new { success = false, message = "IdEmpleado es obligatorio." });
        }

        var connectionString = GetConnectionString();
        if (connectionString is null)
        {
            return StatusCode(StatusCodes.Status500InternalServerError, new
            {
                success = false,
                message = "La cadena de conexion no esta configurada."
            });
        }

        await using var connection = new SqlConnection(connectionString);
        var row = await ObtenerEmpleadoPorIdAsync(connection, idEmpleado, cancellationToken);

        if (row is null)
        {
            return NotFound(new { success = false, message = "No se encontro el empleado solicitado." });
        }

        return Ok(new
        {
            success = true,
            message = "Empleado obtenido correctamente.",
            data = row
        });
    }

    [HttpGet("lookups")]
    public async Task<IActionResult> ObtenerLookups(CancellationToken cancellationToken)
    {
        var connectionString = GetConnectionString();
        if (connectionString is null)
        {
            return StatusCode(StatusCodes.Status500InternalServerError, new
            {
                success = false,
                message = "La cadena de conexion no esta configurada."
            });
        }

        await using var connection = new SqlConnection(connectionString);

        var constantes = (await connection.QueryAsync<LookupItem>(
            new CommandDefinition(
                """
                SELECT
                    Campo,
                    CAST(Correlativo AS nvarchar(50)) AS Value,
                    ISNULL(ValorIni, '') AS Label,
                    CAST('' AS nvarchar(50)) AS Codigo,
                    ISNULL(Correlativo, 0) AS Orden
                FROM dbo.Constante
                WHERE Campo IN ('EMPRESA_CJ', 'CLIENTE_CJ', 'AREA_CJ', 'UBICACION_CJ')
                ORDER BY Campo, ISNULL(Correlativo, 0), ISNULL(ValorIni, '')
                """,
                cancellationToken: cancellationToken))).ToList();

        var responsables = await ObtenerValidadoresAsync(connection, 1, "RESPONSABLE", cancellationToken);
        var segundoValidadores = await ObtenerValidadoresAsync(connection, 2, "SEGUNDO_VALIDADOR", cancellationToken);
        var tercerValidadores = await ObtenerValidadoresAsync(connection, 3, "TERCER_VALIDADOR", cancellationToken);

        return Ok(new
        {
            success = true,
            message = "Lookups obtenidos correctamente.",
            data = new
            {
                empresas = constantes.Where(x => x.Campo == "EMPRESA_CJ").ToList(),
                clientes = constantes.Where(x => x.Campo == "CLIENTE_CJ").ToList(),
                areas = constantes.Where(x => x.Campo == "AREA_CJ").ToList(),
                ubicaciones = constantes.Where(x => x.Campo == "UBICACION_CJ").ToList(),
                responsables,
                segundoValidadores,
                tercerValidadores
            }
        });
    }

    [HttpPost]
    public async Task<IActionResult> Crear(
        [FromBody] EmpleadoCrudUpsertRequest request,
        CancellationToken cancellationToken)
    {
        var validationMessage = ValidateRequest(request);
        if (validationMessage is not null)
        {
            return BadRequest(new { success = false, message = validationMessage });
        }

        var connectionString = GetConnectionString();
        if (connectionString is null)
        {
            return StatusCode(StatusCodes.Status500InternalServerError, new
            {
                success = false,
                message = "La cadena de conexion no esta configurada."
            });
        }

        await using var connection = new SqlConnection(connectionString);
        await connection.OpenAsync(cancellationToken);
        var documentoDuplicadoMessage = await ValidarDocumentoActivoAsync(
            connection,
            null,
            request.NroDocumento,
            cancellationToken);

        if (documentoDuplicadoMessage is not null)
        {
            return BadRequest(new { success = false, message = documentoDuplicadoMessage });
        }

        var usuario = GetCurrentUserName();
        var idEmpleado = await CrearEmpleadoDirectoAsync(connection, request, usuario, cancellationToken);

        var created = await ObtenerEmpleadoPorIdAsync(connection, idEmpleado, cancellationToken);
        if (created is not null)
        {
            await RegistrarAuditoriaAsync(BuildInsertAuditEntries(created, usuario), cancellationToken);
        }

        return Ok(new
        {
            success = true,
            message = "Empleado creado correctamente.",
            data = created
        });
    }

    [HttpPut("{idEmpleado:int}")]
    public async Task<IActionResult> Actualizar(
        int idEmpleado,
        [FromBody] EmpleadoCrudUpsertRequest request,
        CancellationToken cancellationToken)
    {
        if (idEmpleado <= 0)
        {
            return BadRequest(new { success = false, message = "IdEmpleado es obligatorio." });
        }

        var validationMessage = ValidateRequest(request);
        if (validationMessage is not null)
        {
            return BadRequest(new { success = false, message = validationMessage });
        }

        var connectionString = GetConnectionString();
        if (connectionString is null)
        {
            return StatusCode(StatusCodes.Status500InternalServerError, new
            {
                success = false,
                message = "La cadena de conexion no esta configurada."
            });
        }

        await using var connection = new SqlConnection(connectionString);
        await connection.OpenAsync(cancellationToken);
        var before = await ObtenerEmpleadoPorIdAsync(connection, idEmpleado, cancellationToken);
        if (before is null)
        {
            return NotFound(new { success = false, message = "No se encontro el empleado solicitado." });
        }

        var documentoDuplicadoMessage = await ValidarDocumentoActivoAsync(
            connection,
            idEmpleado,
            request.NroDocumento,
            cancellationToken);

        if (documentoDuplicadoMessage is not null)
        {
            return BadRequest(new { success = false, message = documentoDuplicadoMessage });
        }

        var usuario = GetCurrentUserName();
        await ActualizarEmpleadoDirectoAsync(connection, idEmpleado, request, usuario, cancellationToken);

        var updated = await ObtenerEmpleadoPorIdAsync(connection, idEmpleado, cancellationToken);
        if (updated is not null)
        {
            await RegistrarAuditoriaAsync(BuildUpdateAuditEntries(before, updated, usuario), cancellationToken);
        }

        return Ok(new
        {
            success = true,
            message = "Empleado actualizado correctamente.",
            data = updated
        });
    }

    [HttpPost("{idEmpleado:int}/aprobar")]
    public async Task<IActionResult> Aprobar(int idEmpleado, CancellationToken cancellationToken)
    {
        if (idEmpleado <= 0)
        {
            return BadRequest(new { success = false, message = "IdEmpleado es obligatorio." });
        }

        var connectionString = GetConnectionString();
        if (connectionString is null)
        {
            return StatusCode(StatusCodes.Status500InternalServerError, new
            {
                success = false,
                message = "La cadena de conexion no esta configurada."
            });
        }

        await using var connection = new SqlConnection(connectionString);
        await connection.OpenAsync(cancellationToken);

        var before = await ObtenerEmpleadoPorIdAsync(connection, idEmpleado, cancellationToken);
        if (before is null)
        {
            return NotFound(new { success = false, message = "No se encontro el empleado solicitado." });
        }

        try
        {
            var usuario = GetCurrentUserName();
            var idAprobador = await ResolveCurrentEmployeeCodeAsync(connection, cancellationToken);
            if (idAprobador is null or <= 0)
            {
                return StatusCode(StatusCodes.Status500InternalServerError, new
                {
                    success = false,
                    message = "No se pudo identificar el codigo numerico del usuario aprobador."
                });
            }

            await AprobarEmpleadoDirectoAsync(connection, idEmpleado, usuario, idAprobador.Value, cancellationToken);
        }
        catch (Exception ex)
        {
            return StatusCode(StatusCodes.Status500InternalServerError, new
            {
                success = false,
                message = $"No se pudo aprobar el empleado. {ex.Message}"
            });
        }

        var usuarioAuditoria = GetCurrentUserName();
        var after = await ObtenerEmpleadoPorIdAsync(connection, idEmpleado, cancellationToken);
        if (after is not null)
        {
            await RegistrarAuditoriaAsync(BuildUpdateAuditEntries(before, after, usuarioAuditoria), cancellationToken);
        }

        return Ok(new
        {
            success = true,
            message = "Empleado aprobado correctamente.",
            data = after
        });
    }

    [HttpDelete("{idEmpleado:int}")]
    public async Task<IActionResult> Eliminar(int idEmpleado, CancellationToken cancellationToken)
    {
        if (idEmpleado <= 0)
        {
            return BadRequest(new { success = false, message = "IdEmpleado es obligatorio." });
        }

        var connectionString = GetConnectionString();
        if (connectionString is null)
        {
            return StatusCode(StatusCodes.Status500InternalServerError, new
            {
                success = false,
                message = "La cadena de conexion no esta configurada."
            });
        }

        await using var connection = new SqlConnection(connectionString);
        await connection.OpenAsync(cancellationToken);
        var before = await ObtenerEmpleadoPorIdAsync(connection, idEmpleado, cancellationToken);
        if (before is null)
        {
            return NotFound(new { success = false, message = "No se encontro el empleado solicitado." });
        }

        var usuario = GetCurrentUserName();
        var fechaActual = DateTime.Now.Date;
        var auditoriaVacaciones = new List<AuditoriaCambioDto>();
        EmpleadoCrudDto? after;

        await using (var transaction = connection.BeginTransaction())
        {
            await connection.ExecuteAsync(
                new CommandDefinition(
                    EliminarSp,
                    new
                    {
                        IdEmpleado = idEmpleado,
                        Usuario = usuario
                    },
                    transaction: transaction,
                    commandType: CommandType.StoredProcedure,
                    cancellationToken: cancellationToken));

            await connection.ExecuteAsync(
                new CommandDefinition(
                    """
                    UPDATE dbo.EmpleadoCj
                    SET IdActivo = 0,
                        FechaFinLaboral = @FechaActual,
                        FechaBaja = @FechaActual
                    WHERE IdEmpleado = @IdEmpleado;
                    """,
                    new
                    {
                        IdEmpleado = idEmpleado,
                        FechaActual = fechaActual
                    },
                    transaction: transaction,
                    commandType: CommandType.Text,
                    cancellationToken: cancellationToken));

            auditoriaVacaciones.AddRange(
                await ResetVacacionesPorBajaAsync(connection, idEmpleado, usuario, fechaActual, transaction, cancellationToken));

            after = await ObtenerEmpleadoPorIdAsync(connection, idEmpleado, transaction, cancellationToken);
            await transaction.CommitAsync(cancellationToken);
        }

        var auditoria = BuildUpdateAuditEntries(
                before,
                after ?? before,
                usuario)
            .Where(cambio =>
                string.Equals(cambio.Campo, "IdActivo", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(cambio.Campo, "FechaFinLaboral", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(cambio.Campo, "FechaBaja", StringComparison.OrdinalIgnoreCase))
            .ToList();
        auditoria.AddRange(auditoriaVacaciones);

        await RegistrarAuditoriaAsync(auditoria, cancellationToken);

        return Ok(new
        {
            success = true,
            message = "Empleado dado de baja correctamente."
        });
    }

    private async Task<List<EmpleadoCrudDto>> ListarEmpleadosAsync(
        SqlConnection connection,
        int? idEmpleado,
        string? nombreEmpleado,
        CancellationToken cancellationToken)
    {
        var rows = await connection.QueryAsync(
            new CommandDefinition(
                ListarSp,
                new
                {
                    IdEmpleado = idEmpleado,
                    NombreEmpleado = string.IsNullOrWhiteSpace(nombreEmpleado) ? null : nombreEmpleado.Trim()
                },
                commandType: CommandType.StoredProcedure,
                cancellationToken: cancellationToken));

        return rows
            .Select(row => MapEmpleadoCrudRow((IDictionary<string, object>)row))
            .Where(item => item.IdEmpleado > 0)
            .ToList();
    }

    private async Task<EmpleadoCrudDto?> ObtenerEmpleadoPorIdAsync(
        SqlConnection connection,
        int idEmpleado,
        CancellationToken cancellationToken)
    {
        return await ObtenerEmpleadoPorIdAsync(connection, idEmpleado, transaction: null, cancellationToken);
    }

    private async Task<EmpleadoCrudDto?> ObtenerEmpleadoPorIdAsync(
        SqlConnection connection,
        int idEmpleado,
        SqlTransaction? transaction,
        CancellationToken cancellationToken)
    {
        var row = await connection.QueryFirstOrDefaultAsync(
            new CommandDefinition(
                ObtenerSp,
                new { IdEmpleado = idEmpleado },
                transaction: transaction,
                commandType: CommandType.StoredProcedure,
                cancellationToken: cancellationToken));

        if (row is null)
        {
            return null;
        }

        return MapEmpleadoCrudRow((IDictionary<string, object>)row);
    }

    private static async Task<List<LookupItem>> ObtenerValidadoresAsync(
        SqlConnection connection,
        int tipoValidador,
        string campo,
        CancellationToken cancellationToken)
    {
        var rows = await connection.QueryAsync(
            new CommandDefinition(
                "dbo.sp_Empleado_ListarValidadores",
                new { TipoValidador = tipoValidador },
                commandType: CommandType.StoredProcedure,
                cancellationToken: cancellationToken));

        return rows
            .Select(row =>
            {
                var values = (IDictionary<string, object>)row;
                return new LookupItem
                {
                    Value = GetString(values, "IdEmpleado", "idEmpleado"),
                    Label = GetString(values, "NombreEmpleado", "nombreEmpleado"),
                    Codigo = string.Empty,
                    Campo = campo,
                    Orden = 0
                };
            })
            .ToList();
    }

    private static async Task<string?> ValidarDocumentoActivoAsync(
        SqlConnection connection,
        int? idEmpleado,
        string? nroDocumento,
        CancellationToken cancellationToken)
    {
        var documento = NormalizeOptionalString(nroDocumento);
        if (string.IsNullOrWhiteSpace(documento))
        {
            return null;
        }

        var existeActivo = await connection.ExecuteScalarAsync<int>(
            new CommandDefinition(
                """
                SELECT TOP (1) 1
                FROM dbo.EmpleadoCj
                WHERE LTRIM(RTRIM(NroDocumento)) = @NroDocumento
                  AND IdCargo = 50
                  AND ISNULL(IdActivo, 0) = 1
                  AND (@IdEmpleado IS NULL OR IdEmpleado <> @IdEmpleado);
                """,
                new
                {
                    NroDocumento = documento,
                    IdEmpleado = idEmpleado
                },
                commandType: CommandType.Text,
                cancellationToken: cancellationToken));

        return existeActivo == 1
            ? "Ya existe un empleado activo con el mismo numero de documento."
            : null;
    }

    private static Task SetEmpleadoEstadoAsync(
        SqlConnection connection,
        int idEmpleado,
        int idEstado,
        CancellationToken cancellationToken)
    {
        return connection.ExecuteAsync(
            new CommandDefinition(
                """
                UPDATE dbo.EmpleadoCj
                SET IdEstado = @IdEstado
                WHERE IdEmpleado = @IdEmpleado;
                """,
                new
                {
                    IdEmpleado = idEmpleado,
                    IdEstado = idEstado
                },
                commandType: CommandType.Text,
                cancellationToken: cancellationToken));
    }

    private static async Task<int> CrearEmpleadoDirectoAsync(
        SqlConnection connection,
        EmpleadoCrudUpsertRequest request,
        string usuario,
        CancellationToken cancellationToken)
    {
        await using var transaction = connection.BeginTransaction();

        try
        {
            var idEmpleado = await connection.QuerySingleAsync<int>(
                new CommandDefinition(
                    """
                    DECLARE @IdEmpleado INT;

                    SELECT @IdEmpleado = ISNULL(MAX(IdEmpleado), 0) + 1
                    FROM dbo.EmpleadoCj WITH (UPDLOCK, HOLDLOCK);

                    INSERT INTO dbo.EmpleadoCj
                    (
                        IdEmpleado,
                        NombreEmpleado,
                        InicialesEmpleado,
                        IdCargo,
                        NroDocumento,
                        Telefono,
                        Correo,
                        UsuarioCre,
                        FechaCreacion,
                        IdEstado,
                        Direccion,
                        IdPuesto,
                        FechaIniLaboral,
                        FechaFinLaboral,
                        IdActivo,
                        IdAptoBeneficio,
                        IdEmpRel,
                        IdEstable,
                        IdEmpleadoAnt
                    )
                    VALUES
                    (
                        @IdEmpleado,
                        @NombreEmpleado,
                        '',
                        50,
                        @NroDocumento,
                        @Telefono,
                        @Correo,
                        @Usuario,
                        SYSDATETIME(),
                        9,
                        @Direccion,
                        @IdPuesto,
                        @FechaIniLaboral,
                        @FechaFinLaboral,
                        1,
                        1,
                        0,
                        0,
                        0
                    );

                    SELECT @IdEmpleado;
                    """,
                    new
                    {
                        NombreEmpleado = request.NombreEmpleado.Trim(),
                        NroDocumento = NormalizeOptionalString(request.NroDocumento),
                        Telefono = NormalizeOptionalString(request.Telefono),
                        Correo = NormalizeOptionalString(request.Correo),
                        Usuario = usuario,
                        Direccion = NormalizeOptionalString(request.Direccion),
                        IdPuesto = request.IdPuesto,
                        FechaIniLaboral = ParseNullableDate(request.FechaIniLaboral),
                        FechaFinLaboral = ParseNullableDate(request.FechaFinLaboral)
                    },
                    transaction: transaction,
                    commandType: CommandType.Text,
                    cancellationToken: cancellationToken));

            await UpsertEmpleadoDetalleAsync(connection, idEmpleado, request, transaction, cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return idEmpleado;
        }
        catch
        {
            await transaction.RollbackAsync(cancellationToken);
            throw;
        }
    }

    private static async Task ActualizarEmpleadoDirectoAsync(
        SqlConnection connection,
        int idEmpleado,
        EmpleadoCrudUpsertRequest request,
        string usuario,
        CancellationToken cancellationToken)
    {
        await using var transaction = connection.BeginTransaction();

        try
        {
            await connection.ExecuteAsync(
                new CommandDefinition(
                    """
                    UPDATE dbo.EmpleadoCj
                    SET NombreEmpleado = @NombreEmpleado,
                        NroDocumento = @NroDocumento,
                        Telefono = @Telefono,
                        Correo = @Correo,
                        Direccion = @Direccion,
                        IdPuesto = @IdPuesto,
                        FechaIniLaboral = @FechaIniLaboral,
                        FechaFinLaboral = @FechaFinLaboral,
                        IdCargo = 50,
                        IdActivo = 1
                    WHERE IdEmpleado = @IdEmpleado;
                    """,
                    new
                    {
                        IdEmpleado = idEmpleado,
                        NombreEmpleado = request.NombreEmpleado.Trim(),
                        NroDocumento = NormalizeOptionalString(request.NroDocumento),
                        Telefono = NormalizeOptionalString(request.Telefono),
                        Correo = NormalizeOptionalString(request.Correo),
                        Direccion = NormalizeOptionalString(request.Direccion),
                        IdPuesto = request.IdPuesto,
                        FechaIniLaboral = ParseNullableDate(request.FechaIniLaboral),
                        FechaFinLaboral = ParseNullableDate(request.FechaFinLaboral)
                    },
                    transaction: transaction,
                    commandType: CommandType.Text,
                    cancellationToken: cancellationToken));

            await UpsertEmpleadoDetalleAsync(connection, idEmpleado, request, transaction, cancellationToken);
            await transaction.CommitAsync(cancellationToken);
        }
        catch
        {
            await transaction.RollbackAsync(cancellationToken);
            throw;
        }
    }

    private static async Task UpsertEmpleadoDetalleAsync(
        SqlConnection connection,
        int idEmpleado,
        EmpleadoCrudUpsertRequest request,
        SqlTransaction transaction,
        CancellationToken cancellationToken)
    {
        var existeDetalle = await connection.ExecuteScalarAsync<int>(
            new CommandDefinition(
                """
                SELECT TOP (1) 1
                FROM dbo.EmpleadoCjDetalle
                WHERE IdEmpleadoCj = @IdEmpleado;
                """,
                new { IdEmpleado = idEmpleado },
                transaction: transaction,
                commandType: CommandType.Text,
                cancellationToken: cancellationToken));

        if (existeDetalle == 1)
        {
            await connection.ExecuteAsync(
                new CommandDefinition(
                    """
                    UPDATE dbo.EmpleadoCjDetalle
                    SET IdEmpresaCj = @IdEmpresaCj,
                        IdClienteCj = @IdClienteCj,
                        IdAreaCj = @IdAreaCj,
                        IdUbicacionCj = @IdUbicacionCj,
                        IdResponsableCj = @IdResponsableCj,
                        IdSegundoVacaciones = @IdSegundoVacaciones,
                        IdTerceroVacaciones = @IdTerceroVacaciones
                    WHERE IdEmpleadoCj = @IdEmpleado;
                    """,
                    new
                    {
                        IdEmpleado = idEmpleado,
                        IdEmpresaCj = request.IdEmpresaCj,
                        IdClienteCj = request.IdClienteCj,
                        IdAreaCj = request.IdAreaCj,
                        IdUbicacionCj = request.IdUbicacionCj,
                        IdResponsableCj = request.IdResponsableCj,
                        IdSegundoVacaciones = request.IdSegundoVacaciones,
                        IdTerceroVacaciones = request.IdTerceroVacaciones
                    },
                    transaction: transaction,
                    commandType: CommandType.Text,
                    cancellationToken: cancellationToken));
        }
        else
        {
            await connection.ExecuteAsync(
                new CommandDefinition(
                    """
                    INSERT INTO dbo.EmpleadoCjDetalle
                    (
                        IdEmpleadoCj,
                        IdEmpresaCj,
                        IdClienteCj,
                        IdAreaCj,
                        IdUbicacionCj,
                        IdResponsableCj,
                        IdSegundoVacaciones,
                        IdTerceroVacaciones
                    )
                    VALUES
                    (
                        @IdEmpleado,
                        @IdEmpresaCj,
                        @IdClienteCj,
                        @IdAreaCj,
                        @IdUbicacionCj,
                        @IdResponsableCj,
                        @IdSegundoVacaciones,
                        @IdTerceroVacaciones
                    );
                    """,
                    new
                    {
                        IdEmpleado = idEmpleado,
                        IdEmpresaCj = request.IdEmpresaCj,
                        IdClienteCj = request.IdClienteCj,
                        IdAreaCj = request.IdAreaCj,
                        IdUbicacionCj = request.IdUbicacionCj,
                        IdResponsableCj = request.IdResponsableCj,
                        IdSegundoVacaciones = request.IdSegundoVacaciones,
                        IdTerceroVacaciones = request.IdTerceroVacaciones
                    },
                    transaction: transaction,
                    commandType: CommandType.Text,
                    cancellationToken: cancellationToken));
        }
    }

    private static DynamicParameters BuildUpsertParameters(EmpleadoCrudUpsertRequest request, string usuario)
    {
        var parameters = new DynamicParameters();
        parameters.Add("@NombreEmpleado", request.NombreEmpleado.Trim(), DbType.String);
        parameters.Add("@NroDocumento", NormalizeOptionalString(request.NroDocumento), DbType.String);
        parameters.Add("@Telefono", NormalizeOptionalString(request.Telefono), DbType.String);
        parameters.Add("@Correo", NormalizeOptionalString(request.Correo), DbType.String);
        parameters.Add("@FechaIniLaboral", ParseNullableDate(request.FechaIniLaboral), DbType.Date);
        parameters.Add("@FechaFinLaboral", ParseNullableDate(request.FechaFinLaboral), DbType.Date);
        parameters.Add("@IdPuesto", request.IdPuesto, DbType.Int32);
        parameters.Add("@Direccion", NormalizeOptionalString(request.Direccion), DbType.String);
        parameters.Add("@IdEmpresaCj", request.IdEmpresaCj, DbType.Int32);
        parameters.Add("@IdClienteCj", request.IdClienteCj, DbType.Int32);
        parameters.Add("@IdAreaCj", request.IdAreaCj, DbType.Int32);
        parameters.Add("@IdUbicacionCj", request.IdUbicacionCj, DbType.Int32);
        parameters.Add("@IdResponsableCj", request.IdResponsableCj, DbType.Int32);
        parameters.Add("@IdSegundoVacaciones", request.IdSegundoVacaciones, DbType.Int32);
        parameters.Add("@IdTerceroVacaciones", request.IdTerceroVacaciones, DbType.Int32);
        parameters.Add("@Usuario", usuario, DbType.String);
        return parameters;
    }

    private static EmpleadoCrudDto MapEmpleadoCrudRow(IDictionary<string, object> values)
    {
        return new EmpleadoCrudDto
        {
            IdEmpleado = GetInt(values, "IdEmpleado", "idEmpleado", "IdEmpleadoCj", "idEmpleadoCj") ?? 0,
            NombreEmpleado = GetString(values, "NombreEmpleado", "nombreEmpleado"),
            NroDocumento = GetString(values, "NroDocumento", "nroDocumento"),
            Telefono = GetString(values, "Telefono", "telefono"),
            Correo = GetString(values, "Correo", "correo"),
            Empresa = GetString(values, "Empresa", "empresa"),
            Cliente = GetString(values, "Cliente", "cliente"),
            Area = GetString(values, "Area", "area"),
            Ubicacion = GetString(values, "Ubicacion", "ubicacion"),
            Responsable = GetString(values, "Responsable", "responsable"),
            SoValidador = GetString(values, "SoValidador", "soValidador", "SolValidador", "solValidador"),
            TerValidador = GetString(values, "TerValidador", "terValidador", "TercerValidador", "tercerValidador"),
            FechaIniLaboral = GetDateString(values, "FechaIniLaboral", "fechaIniLaboral"),
            FechaFinLaboral = GetDateString(values, "FechaFinLaboral", "fechaFinLaboral"),
            FechaBaja = GetDateString(values, "FechaBaja", "fechaBaja"),
            Direccion = GetString(values, "Direccion", "direccion"),
            CargoPrint = GetString(values, "CargoPrint", "cargoPrint"),
            Estado = GetString(values, "Estado", "estado"),
            IdEstado = GetInt(values, "IdEstado", "idEstado"),
            IdActivo = GetInt(values, "IdActivo", "idActivo"),
            IdEmpresaCj = GetInt(values, "IdEmpresaCj", "idEmpresaCj"),
            IdClienteCj = GetInt(values, "IdClienteCj", "idClienteCj"),
            IdAreaCj = GetInt(values, "IdAreaCj", "idAreaCj"),
            IdUbicacionCj = GetInt(values, "IdUbicacionCj", "idUbicacionCj"),
            IdResponsableCj = GetInt(values, "IdResponsableCj", "idResponsableCj"),
            IdSegundoVacaciones = GetInt(values, "IdSegundoVacaciones", "idSegundoVacaciones"),
            IdTerceroVacaciones = GetInt(values, "IdTerceroVacaciones", "idTerceroVacaciones")
        };
    }

    private static string? ValidateRequest(EmpleadoCrudUpsertRequest request)
    {
        if (request is null)
        {
            return "La solicitud es obligatoria.";
        }

        if (string.IsNullOrWhiteSpace(request.NombreEmpleado))
        {
            return "El nombre del empleado es obligatorio.";
        }

        if (string.IsNullOrWhiteSpace(request.NroDocumento))
        {
            return "El numero de documento es obligatorio.";
        }

        if (string.IsNullOrWhiteSpace(request.Telefono))
        {
            return "El telefono es obligatorio.";
        }

        if (string.IsNullOrWhiteSpace(request.Correo))
        {
            return "El correo es obligatorio.";
        }

        if (string.IsNullOrWhiteSpace(request.Direccion))
        {
            return "La direccion es obligatoria.";
        }

        if (string.IsNullOrWhiteSpace(request.FechaIniLaboral))
        {
            return "La fecha de inicio laboral es obligatoria.";
        }

        if (request.IdEmpresaCj is null or <= 0)
        {
            return "La empresa es obligatoria.";
        }

        if (request.IdClienteCj is null or <= 0)
        {
            return "El cliente es obligatorio.";
        }

        if (request.IdAreaCj is null or <= 0)
        {
            return "El area es obligatoria.";
        }

        if (request.IdUbicacionCj is null or <= 0)
        {
            return "La ubicacion es obligatoria.";
        }

        if (request.IdResponsableCj is null or <= 0)
        {
            return "El responsable es obligatorio.";
        }

        if (request.IdSegundoVacaciones is null or <= 0)
        {
            return "El 2do validador es obligatorio.";
        }

        if (request.IdTerceroVacaciones is null or <= 0)
        {
            return "El 3er validador es obligatorio.";
        }

        if (!string.IsNullOrWhiteSpace(request.Correo) && !request.Correo.Contains('@'))
        {
            return "El correo no es valido.";
        }

        return null;
    }

    private static string? NormalizeOptionalString(string? value)
    {
        var cleaned = value?.Trim();
        return string.IsNullOrWhiteSpace(cleaned) ? null : cleaned;
    }

    private static DateTime? ParseNullableDate(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        return DateTime.TryParse(value, out var parsed) ? parsed.Date : null;
    }

    private string? GetConnectionString()
    {
        var connectionString = _configuration.GetConnectionString("DefaultConnection");
        return string.IsNullOrWhiteSpace(connectionString) ? null : connectionString;
    }

    private string GetCurrentUserName()
    {
        return User?.Identity?.Name
            ?? User?.FindFirstValue(ClaimTypes.Email)
            ?? User?.FindFirstValue(ClaimTypes.Name)
            ?? "SISTEMA";
    }

    private int? GetCurrentEmployeeCode()
    {
        var rawCode = User?.FindFirstValue("CodEmp")
            ?? User?.FindFirstValue("CodEmpleado")
            ?? User?.FindFirstValue("IdEmpleado");

        return int.TryParse(rawCode, out var parsed) && parsed > 0 ? parsed : null;
    }

    private async Task<int?> ResolveCurrentEmployeeCodeAsync(
        SqlConnection connection,
        CancellationToken cancellationToken)
    {
        var codeFromClaims = GetCurrentEmployeeCode();
        if (codeFromClaims is > 0)
        {
            return codeFromClaims;
        }

        var currentUserName = GetCurrentUserName();
        if (string.IsNullOrWhiteSpace(currentUserName))
        {
            return null;
        }

        return await connection.QueryFirstOrDefaultAsync<int?>(
            new CommandDefinition(
                """
                SELECT
                    TOP (1) IdEmpleado
                FROM dbo.Usuario
                WHERE LTRIM(RTRIM(IdUsuario)) = @IdUsuario;
                """,
                new { IdUsuario = currentUserName },
                cancellationToken: cancellationToken));
    }

    private static async Task AprobarEmpleadoDirectoAsync(
        SqlConnection connection,
        int idEmpleado,
        string usuario,
        int idAprobador,
        CancellationToken cancellationToken)
    {
        await using var transaction = connection.BeginTransaction();

        try
        {
            var empleado = await connection.QueryFirstOrDefaultAsync<EmpleadoAprobacionData>(
                new CommandDefinition(
                    """
                    SELECT
                        IdEmpleado,
                        NombreEmpleado,
                        NroDocumento,
                        Telefono,
                        Correo,
                        Direccion,
                        FechaIniLaboral
                    FROM dbo.EmpleadoCj
                    WHERE IdEmpleado = @IdEmpleado;
                    """,
                    new { IdEmpleado = idEmpleado },
                    transaction: transaction,
                    cancellationToken: cancellationToken));

            if (empleado is null)
            {
                throw new InvalidOperationException("No se encontro el empleado solicitado.");
            }

            await connection.ExecuteAsync(
                new CommandDefinition(
                    """
                    UPDATE dbo.EmpleadoCj
                    SET IdEstado = 1,
                        IdActivo = 1
                    WHERE IdEmpleado = @IdEmpleado;
                    """,
                    new { IdEmpleado = idEmpleado },
                    transaction: transaction,
                    cancellationToken: cancellationToken));

            await EnsureUsuarioEmpleadoAsync(connection, empleado, idAprobador, transaction, cancellationToken);
            await GenerarAsistenciaAprobacionAsync(connection, empleado, idAprobador, transaction, cancellationToken);

            await transaction.CommitAsync(cancellationToken);
        }
        catch
        {
            await transaction.RollbackAsync(cancellationToken);
            throw;
        }
    }

    private static async Task EnsureUsuarioEmpleadoAsync(
        SqlConnection connection,
        EmpleadoAprobacionData empleado,
        int idAprobador,
        SqlTransaction transaction,
        CancellationToken cancellationToken)
    {
        var usuarioGenerado = BuildGeneratedUserName(empleado.NombreEmpleado, empleado.IdEmpleado);

        var usuarioExistente = await connection.QueryFirstOrDefaultAsync<int?>(
            new CommandDefinition(
                """
                SELECT TOP (1) Id
                FROM dbo.Usuario
                WHERE IdEmpleado = @IdEmpleado
                   OR IdUsuario = @IdUsuario;
                """,
                new
                {
                    IdEmpleado = empleado.IdEmpleado,
                    IdUsuario = usuarioGenerado
                },
                transaction: transaction,
                cancellationToken: cancellationToken));

        if (usuarioExistente.HasValue)
        {
            await connection.ExecuteAsync(
                new CommandDefinition(
                    """
                    IF COL_LENGTH('dbo.Usuario', 'NombreDispositivo') IS NOT NULL
                    BEGIN
                        UPDATE dbo.Usuario
                        SET IdUsuario = @IdUsuario,
                            Clave = 'ADMIN',
                            IdEstado = 1,
                            IdEmpleado = @IdEmpleado,
                            IdCargo = 84,
                            NombreDispositivo = ISNULL(NombreDispositivo, '')
                        WHERE Id = @Id;
                    END
                    ELSE
                    BEGIN
                        UPDATE dbo.Usuario
                        SET IdUsuario = @IdUsuario,
                            Clave = 'ADMIN',
                            IdEstado = 1,
                            IdEmpleado = @IdEmpleado,
                            IdCargo = 84
                        WHERE Id = @Id;
                    END
                    """,
                    new
                    {
                        Id = usuarioExistente.Value,
                        IdUsuario = usuarioGenerado,
                        IdEmpleado = empleado.IdEmpleado
                    },
                    transaction: transaction,
                    cancellationToken: cancellationToken));

            return;
        }

        var nuevoId = await connection.ExecuteScalarAsync<int>(
            new CommandDefinition(
                """
                SELECT ISNULL(MAX(Id), 0) + 1
                FROM dbo.Usuario WITH (UPDLOCK, HOLDLOCK);
                """,
                transaction: transaction,
                cancellationToken: cancellationToken));

        await connection.ExecuteAsync(
            new CommandDefinition(
                """
                IF COL_LENGTH('dbo.Usuario', 'NombreDispositivo') IS NOT NULL
                BEGIN
                    INSERT INTO dbo.Usuario
                    (
                        Id,
                        IdUsuario,
                        Clave,
                        IdEstado,
                        IdEmpleado,
                        IdCargo,
                        NombreDispositivo
                    )
                    VALUES
                    (
                        @Id,
                        @IdUsuario,
                        'ADMIN',
                        1,
                        @IdEmpleado,
                        84,
                        ''
                    );
                END
                ELSE
                BEGIN
                    INSERT INTO dbo.Usuario
                    (
                        Id,
                        IdUsuario,
                        Clave,
                        IdEstado,
                        IdEmpleado,
                        IdCargo
                    )
                    VALUES
                    (
                        @Id,
                        @IdUsuario,
                        'ADMIN',
                        1,
                        @IdEmpleado,
                        84
                    );
                END
                """,
                new
                {
                    Id = nuevoId,
                    IdUsuario = usuarioGenerado,
                    IdEmpleado = empleado.IdEmpleado
                },
                transaction: transaction,
                cancellationToken: cancellationToken));
    }

    private static async Task GenerarAsistenciaAprobacionAsync(
        SqlConnection connection,
        EmpleadoAprobacionData empleado,
        int idAprobador,
        SqlTransaction transaction,
        CancellationToken cancellationToken)
    {
        var fechaProceso = DateTime.Today;
        var fechaBase = (empleado.FechaIniLaboral ?? fechaProceso).Date;
        var primerDiaMes = new DateTime(fechaBase.Year, fechaBase.Month, 1);

        if (fechaBase <= fechaProceso)
        {
            await connection.ExecuteAsync(
                new CommandDefinition(
                    """
                    ;WITH FechasActivas AS
                    (
                        SELECT @FechaBase AS Fecha
                        UNION ALL
                        SELECT DATEADD(DAY, 1, Fecha)
                        FROM FechasActivas
                        WHERE Fecha < @FechaProceso
                    )
                    INSERT INTO dbo.Asistencia
                    (
                        IdEmpleado,
                        FechaAsistencia,
                        IdEstado,
                        Comentario,
                        UsuarioCre,
                        FechaCreacion,
                        IdAprobador
                    )
                    SELECT
                        @IdEmpleado,
                        Fecha,
                        0,
                        '',
                        @IdAprobador,
                        SYSDATETIME(),
                        @IdAprobador
                    FROM FechasActivas fa
                    WHERE NOT EXISTS
                    (
                        SELECT 1
                        FROM dbo.Asistencia a
                        WHERE a.IdEmpleado = @IdEmpleado
                          AND CONVERT(DATE, a.FechaAsistencia) = fa.Fecha
                    )
                    OPTION (MAXRECURSION 0);
                    """,
                    new
                    {
                        IdEmpleado = empleado.IdEmpleado,
                        FechaBase = fechaBase,
                        FechaProceso = fechaProceso,
                        IdAprobador = idAprobador
                    },
                    transaction: transaction,
                    cancellationToken: cancellationToken));
        }

        if (primerDiaMes < fechaBase)
        {
            await connection.ExecuteAsync(
                new CommandDefinition(
                    """
                    ;WITH FechasInactivas AS
                    (
                        SELECT @PrimerDiaMes AS Fecha
                        UNION ALL
                        SELECT DATEADD(DAY, 1, Fecha)
                        FROM FechasInactivas
                        WHERE Fecha < DATEADD(DAY, -1, @FechaBase)
                    )
                    INSERT INTO dbo.Asistencia
                    (
                        IdEmpleado,
                        FechaAsistencia,
                        IdEstado,
                        Comentario,
                        UsuarioCre,
                        FechaCreacion,
                        IdAprobador
                    )
                    SELECT
                        @IdEmpleado,
                        Fecha,
                        16,
                        '',
                        @IdAprobador,
                        SYSDATETIME(),
                        @IdAprobador
                    FROM FechasInactivas fi
                    WHERE NOT EXISTS
                    (
                        SELECT 1
                        FROM dbo.Asistencia a
                        WHERE a.IdEmpleado = @IdEmpleado
                          AND CONVERT(DATE, a.FechaAsistencia) = fi.Fecha
                    )
                    OPTION (MAXRECURSION 0);
                    """,
                    new
                    {
                        IdEmpleado = empleado.IdEmpleado,
                        PrimerDiaMes = primerDiaMes,
                        FechaBase = fechaBase,
                        IdAprobador = idAprobador
                    },
                    transaction: transaction,
                    cancellationToken: cancellationToken));
        }
    }

    private static async Task<List<AuditoriaCambioDto>> ResetVacacionesPorBajaAsync(
        SqlConnection connection,
        int idEmpleado,
        string usuario,
        DateTime fechaActual,
        SqlTransaction transaction,
        CancellationToken cancellationToken)
    {
        var auditoria = new List<AuditoriaCambioDto>();

        if (await TableExistsAsync(connection, "dbo.EmpleadoOtros", transaction, cancellationToken))
        {
            var hasLegacyPrimaryKey = await ColumnExistsAsync(
                connection,
                "dbo.EmpleadoOtros",
                "IdEmpleadoOtros",
                transaction,
                cancellationToken);

            var legacyRows = (await connection.QueryAsync<EmpleadoOtrosLegacySnapshot>(
                new CommandDefinition(
                    hasLegacyPrimaryKey
                        ? """
                          SELECT
                              ISNULL(IdEmpleadoOtros, 0) AS IdEmpleadoOtros,
                              IdEmpleadoCj,
                              ISNULL(IdEstado, 0) AS IdEstado
                          FROM dbo.EmpleadoOtros
                          WHERE IdEmpleadoCj = @IdEmpleado;
                          """
                        : """
                          SELECT
                              ROW_NUMBER() OVER (ORDER BY FechaInicio, FechaFin, IdEmpleadoCj) AS IdEmpleadoOtros,
                              IdEmpleadoCj,
                              ISNULL(IdEstado, 0) AS IdEstado
                          FROM dbo.EmpleadoOtros
                          WHERE IdEmpleadoCj = @IdEmpleado;
                          """,
                    new { IdEmpleado = idEmpleado },
                    transaction: transaction,
                    cancellationToken: cancellationToken))).ToList();

            await connection.ExecuteAsync(
                new CommandDefinition(
                    """
                    UPDATE dbo.EmpleadoOtros
                    SET IdEstado = 0
                    WHERE IdEmpleadoCj = @IdEmpleado;
                    """,
                    new { IdEmpleado = idEmpleado },
                    transaction: transaction,
                    cancellationToken: cancellationToken));

            foreach (var row in legacyRows.Where(row => row.IdEstado != 0))
            {
                auditoria.Add(new AuditoriaCambioDto
                {
                    Modulo = "Mantenimiento",
                    Entidad = "EmpleadoOtros",
                    IdRegistro = row.IdEmpleadoOtros.ToString(CultureInfo.InvariantCulture),
                    Accion = "UPDATE",
                    Seccion = "Vacaciones",
                    Campo = "IdEstado",
                    ValorAnterior = row.IdEstado.ToString(CultureInfo.InvariantCulture),
                    ValorNuevo = "0",
                    UsuarioAccion = usuario,
                    Observacion = "Reset de vacaciones legacy por baja de empleado."
                });
            }
        }

        if (await TableExistsAsync(connection, "dbo.VacacionPeriodo", transaction, cancellationToken))
        {
            var periodos = (await connection.QueryAsync<VacacionPeriodoSnapshot>(
                new CommandDefinition(
                    """
                    SELECT
                        IdPeriodo,
                        IdEmpleado,
                        DiasOtorgados,
                        DiasConsumidos,
                        DiasReservados,
                        DiasAjustados,
                        Estado,
                        EsLiquidado,
                        FechaLiquidacion
                    FROM dbo.VacacionPeriodo
                    WHERE IdEmpleado = @IdEmpleado;
                    """,
                    new { IdEmpleado = idEmpleado },
                    transaction: transaction,
                    cancellationToken: cancellationToken))).ToList();

            await connection.ExecuteAsync(
                new CommandDefinition(
                    """
                    UPDATE dbo.VacacionPeriodo
                    SET DiasOtorgados = 0,
                        DiasConsumidos = 0,
                        DiasReservados = 0,
                        DiasAjustados = 0,
                        Estado = 'LIQUIDADO',
                        EsLiquidado = 1,
                        FechaLiquidacion = @FechaActual,
                        UsuarioModificacion = @Usuario,
                        FechaModificacion = SYSDATETIME(),
                        Observacion = CASE
                            WHEN NULLIF(LTRIM(RTRIM(Observacion)), '') IS NULL THEN 'Baja de empleado: vacaciones reiniciadas a 0.'
                            ELSE CONCAT(Observacion, ' | Baja de empleado: vacaciones reiniciadas a 0.')
                        END
                    WHERE IdEmpleado = @IdEmpleado;
                    """,
                    new
                    {
                        IdEmpleado = idEmpleado,
                        FechaActual = fechaActual,
                        Usuario = usuario
                    },
                    transaction: transaction,
                    cancellationToken: cancellationToken));

            foreach (var periodo in periodos)
            {
                auditoria.AddRange(BuildVacacionPeriodoAuditEntries(periodo, usuario, fechaActual));
            }
        }

        if (await TableExistsAsync(connection, "dbo.VacacionSolicitud", transaction, cancellationToken))
        {
            var solicitudes = (await connection.QueryAsync<VacacionSolicitudSnapshot>(
                new CommandDefinition(
                    """
                    SELECT
                        IdSolicitud,
                        Estado,
                        CantidadDias
                    FROM dbo.VacacionSolicitud
                    WHERE IdEmpleado = @IdEmpleado
                      AND Estado IN ('PENDIENTE', 'APROBADO');
                    """,
                    new { IdEmpleado = idEmpleado },
                    transaction: transaction,
                    cancellationToken: cancellationToken))).ToList();

            await connection.ExecuteAsync(
                new CommandDefinition(
                    """
                    UPDATE dbo.VacacionSolicitud
                    SET Estado = 'CANCELADO',
                        MotivoCancelacion = 'Baja de empleado',
                        FechaCancelacion = SYSDATETIME(),
                        UsuarioCancelacion = @Usuario,
                        FechaModificacion = SYSDATETIME(),
                        UsuarioModificacion = @Usuario,
                        Observacion = CASE
                            WHEN NULLIF(LTRIM(RTRIM(Observacion)), '') IS NULL THEN 'Cancelado por baja de empleado.'
                            ELSE CONCAT(Observacion, ' | Cancelado por baja de empleado.')
                        END
                    WHERE IdEmpleado = @IdEmpleado
                      AND Estado IN ('PENDIENTE', 'APROBADO');
                    """,
                    new
                    {
                        IdEmpleado = idEmpleado,
                        Usuario = usuario
                    },
                    transaction: transaction,
                    cancellationToken: cancellationToken));

            foreach (var solicitud in solicitudes)
            {
                auditoria.Add(new AuditoriaCambioDto
                {
                    Modulo = "Mantenimiento",
                    Entidad = "VacacionSolicitud",
                    IdRegistro = solicitud.IdSolicitud.ToString(CultureInfo.InvariantCulture),
                    Accion = "UPDATE",
                    Seccion = "Vacaciones",
                    Campo = "Estado",
                    ValorAnterior = NullIfWhiteSpace(solicitud.Estado),
                    ValorNuevo = "CANCELADO",
                    UsuarioAccion = usuario,
                    Observacion = $"Cancelacion por baja de empleado. Dias involucrados: {solicitud.CantidadDias:0.00}."
                });
            }
        }

        if (await TableExistsAsync(connection, "dbo.VacacionMovimiento", transaction, cancellationToken))
        {
            var movimientos = (await connection.QueryAsync<VacacionMovimientoSnapshot>(
                new CommandDefinition(
                    """
                    SELECT
                        IdVacacionMovimiento,
                        Estado,
                        CantidadDias
                    FROM dbo.VacacionMovimiento
                    WHERE IdEmpleado = @IdEmpleado
                      AND Estado = 'APLICADO';
                    """,
                    new { IdEmpleado = idEmpleado },
                    transaction: transaction,
                    cancellationToken: cancellationToken))).ToList();

            await connection.ExecuteAsync(
                new CommandDefinition(
                    """
                    UPDATE dbo.VacacionMovimiento
                    SET Estado = 'ANULADO',
                        UsuarioModificacion = @Usuario,
                        FechaModificacion = SYSDATETIME(),
                        Observacion = CASE
                            WHEN NULLIF(LTRIM(RTRIM(Observacion)), '') IS NULL THEN 'Anulado por baja de empleado.'
                            ELSE CONCAT(Observacion, ' | Anulado por baja de empleado.')
                        END
                    WHERE IdEmpleado = @IdEmpleado
                      AND Estado = 'APLICADO';
                    """,
                    new
                    {
                        IdEmpleado = idEmpleado,
                        Usuario = usuario
                    },
                    transaction: transaction,
                    cancellationToken: cancellationToken));

            foreach (var movimiento in movimientos)
            {
                auditoria.Add(new AuditoriaCambioDto
                {
                    Modulo = "Mantenimiento",
                    Entidad = "VacacionMovimiento",
                    IdRegistro = movimiento.IdVacacionMovimiento.ToString(CultureInfo.InvariantCulture),
                    Accion = "UPDATE",
                    Seccion = "Vacaciones",
                    Campo = "Estado",
                    ValorAnterior = NullIfWhiteSpace(movimiento.Estado),
                    ValorNuevo = "ANULADO",
                    UsuarioAccion = usuario,
                    Observacion = $"Anulacion por baja de empleado. Dias del movimiento: {movimiento.CantidadDias:0.00}."
                });
            }
        }

        return auditoria;
    }

    private static IEnumerable<AuditoriaCambioDto> BuildVacacionPeriodoAuditEntries(
        VacacionPeriodoSnapshot periodo,
        string usuario,
        DateTime fechaActual)
    {
        var cambios = new (string Campo, string? ValorAnterior, string? ValorNuevo)[]
        {
            ("DiasOtorgados", periodo.DiasOtorgados.ToString("0.00", CultureInfo.InvariantCulture), "0.00"),
            ("DiasConsumidos", periodo.DiasConsumidos.ToString("0.00", CultureInfo.InvariantCulture), "0.00"),
            ("DiasReservados", periodo.DiasReservados.ToString("0.00", CultureInfo.InvariantCulture), "0.00"),
            ("DiasAjustados", periodo.DiasAjustados.ToString("0.00", CultureInfo.InvariantCulture), "0.00"),
            ("Estado", NullIfWhiteSpace(periodo.Estado), "LIQUIDADO"),
            ("EsLiquidado", periodo.EsLiquidado ? "1" : "0", "1"),
            ("FechaLiquidacion", periodo.FechaLiquidacion?.ToString("yyyy-MM-dd"), fechaActual.ToString("yyyy-MM-dd"))
        };

        foreach (var cambio in cambios)
        {
            if (string.Equals(cambio.ValorAnterior, cambio.ValorNuevo, StringComparison.Ordinal))
            {
                continue;
            }

            yield return new AuditoriaCambioDto
            {
                Modulo = "Mantenimiento",
                Entidad = "VacacionPeriodo",
                IdRegistro = periodo.IdPeriodo.ToString(CultureInfo.InvariantCulture),
                Accion = "UPDATE",
                Seccion = "Vacaciones",
                Campo = cambio.Campo,
                ValorAnterior = cambio.ValorAnterior,
                ValorNuevo = cambio.ValorNuevo,
                UsuarioAccion = usuario,
                Observacion = "Actualizacion automatica de vacaciones por baja de empleado."
            };
        }
    }

    private static async Task<bool> TableExistsAsync(
        SqlConnection connection,
        string tableName,
        SqlTransaction transaction,
        CancellationToken cancellationToken)
    {
        var exists = await connection.ExecuteScalarAsync<int>(
            new CommandDefinition(
                "SELECT CASE WHEN OBJECT_ID(@TableName, 'U') IS NOT NULL THEN 1 ELSE 0 END;",
                new { TableName = tableName },
                transaction: transaction,
                cancellationToken: cancellationToken));

        return exists == 1;
    }

    private static async Task<bool> ColumnExistsAsync(
        SqlConnection connection,
        string tableName,
        string columnName,
        SqlTransaction transaction,
        CancellationToken cancellationToken)
    {
        var exists = await connection.ExecuteScalarAsync<int>(
            new CommandDefinition(
                "SELECT CASE WHEN COL_LENGTH(@TableName, @ColumnName) IS NOT NULL THEN 1 ELSE 0 END;",
                new
                {
                    TableName = tableName,
                    ColumnName = columnName
                },
                transaction: transaction,
                cancellationToken: cancellationToken));

        return exists == 1;
    }

    private static string BuildGeneratedUserName(string? nombreEmpleado, int idEmpleado)
    {
        var baseUsuario = (nombreEmpleado ?? string.Empty)
            .Trim()
            .ToLowerInvariant()
            .Replace(" ", string.Empty, StringComparison.Ordinal)
            .Replace(".", string.Empty, StringComparison.Ordinal)
            .Replace(",", string.Empty, StringComparison.Ordinal);

        if (string.IsNullOrWhiteSpace(baseUsuario))
        {
            baseUsuario = $"emp{idEmpleado}";
        }

        return $"{baseUsuario}{idEmpleado:00000}";
    }

    private sealed class EmpleadoAprobacionData
    {
        public int IdEmpleado { get; set; }
        public string NombreEmpleado { get; set; } = string.Empty;
        public string NroDocumento { get; set; } = string.Empty;
        public string Telefono { get; set; } = string.Empty;
        public string Correo { get; set; } = string.Empty;
        public string Direccion { get; set; } = string.Empty;
        public DateTime? FechaIniLaboral { get; set; }
    }

    private sealed class EmpleadoOtrosLegacySnapshot
    {
        public int IdEmpleadoOtros { get; set; }
        public int IdEmpleadoCj { get; set; }
        public int IdEstado { get; set; }
    }

    private sealed class VacacionPeriodoSnapshot
    {
        public int IdPeriodo { get; set; }
        public int IdEmpleado { get; set; }
        public decimal DiasOtorgados { get; set; }
        public decimal DiasConsumidos { get; set; }
        public decimal DiasReservados { get; set; }
        public decimal DiasAjustados { get; set; }
        public string Estado { get; set; } = string.Empty;
        public bool EsLiquidado { get; set; }
        public DateTime? FechaLiquidacion { get; set; }
    }

    private sealed class VacacionSolicitudSnapshot
    {
        public int IdSolicitud { get; set; }
        public string Estado { get; set; } = string.Empty;
        public decimal CantidadDias { get; set; }
    }

    private sealed class VacacionMovimientoSnapshot
    {
        public int IdVacacionMovimiento { get; set; }
        public string Estado { get; set; } = string.Empty;
        public decimal CantidadDias { get; set; }
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

    private static string GetString(IDictionary<string, object> values, params string[] keys)
    {
        foreach (var key in keys)
        {
            if (!values.TryGetValue(key, out var value) || value is null || value == DBNull.Value)
            {
                continue;
            }

            var text = value.ToString()?.Trim() ?? string.Empty;
            if (!string.IsNullOrWhiteSpace(text))
            {
                return text;
            }
        }

        return string.Empty;
    }

    private static int? GetInt(IDictionary<string, object> values, params string[] keys)
    {
        var text = GetString(values, keys);
        return int.TryParse(text, out var parsed) ? parsed : null;
    }

    private static string GetDateString(IDictionary<string, object> values, params string[] keys)
    {
        foreach (var key in keys)
        {
            if (!values.TryGetValue(key, out var value) || value is null || value == DBNull.Value)
            {
                continue;
            }

            if (value is DateTime dateTime)
            {
                return dateTime.ToString("yyyy-MM-dd");
            }

            var text = value.ToString()?.Trim() ?? string.Empty;
            if (DateTime.TryParse(text, out var parsed))
            {
                return parsed.ToString("yyyy-MM-dd");
            }

            if (!string.IsNullOrWhiteSpace(text))
            {
                return text;
            }
        }

        return string.Empty;
    }

    private static IEnumerable<AuditoriaCambioDto> BuildInsertAuditEntries(
        EmpleadoCrudDto item,
        string usuario)
    {
        foreach (var field in BuildAuditFieldMap(item))
        {
            if (string.IsNullOrWhiteSpace(field.Value.Value))
            {
                continue;
            }

            yield return new AuditoriaCambioDto
            {
                Modulo = "Mantenimiento",
                Entidad = "EmpleadoCj",
                IdRegistro = item.IdEmpleado.ToString(CultureInfo.InvariantCulture),
                Accion = "INSERT",
                Seccion = field.Value.Section,
                Campo = field.Key,
                ValorAnterior = null,
                ValorNuevo = field.Value.Value,
                UsuarioAccion = usuario,
                Observacion = "Creacion de empleado desde mantenimiento."
            };
        }
    }

    private static IEnumerable<AuditoriaCambioDto> BuildUpdateAuditEntries(
        EmpleadoCrudDto before,
        EmpleadoCrudDto after,
        string usuario)
    {
        var beforeMap = BuildAuditFieldMap(before);
        var afterMap = BuildAuditFieldMap(after);

        foreach (var field in afterMap)
        {
            var beforeField = beforeMap.TryGetValue(field.Key, out var found)
                ? found
                : new AuditFieldValue(field.Value.Section, null);
            var previous = NullIfWhiteSpace(beforeField.Value);
            var current = NullIfWhiteSpace(field.Value.Value);

            if (string.Equals(previous, current, StringComparison.Ordinal))
            {
                continue;
            }

            yield return new AuditoriaCambioDto
            {
                Modulo = "Mantenimiento",
                Entidad = "EmpleadoCj",
                IdRegistro = after.IdEmpleado.ToString(CultureInfo.InvariantCulture),
                Accion = "UPDATE",
                Seccion = field.Value.Section,
                Campo = field.Key,
                ValorAnterior = previous,
                ValorNuevo = current,
                UsuarioAccion = usuario,
                Observacion = "Actualizacion de empleado desde mantenimiento."
            };
        }
    }

    private static Dictionary<string, AuditFieldValue> BuildAuditFieldMap(EmpleadoCrudDto item)
    {
        return new Dictionary<string, AuditFieldValue>(StringComparer.OrdinalIgnoreCase)
        {
            ["NombreEmpleado"] = new("Principal", NullIfWhiteSpace(item.NombreEmpleado)),
            ["NroDocumento"] = new("Principal", NullIfWhiteSpace(item.NroDocumento)),
            ["Telefono"] = new("Principal", NullIfWhiteSpace(item.Telefono)),
            ["Correo"] = new("Principal", NullIfWhiteSpace(item.Correo)),
            ["Direccion"] = new("Principal", NullIfWhiteSpace(item.Direccion)),
            ["FechaIniLaboral"] = new("Laboral", NullIfWhiteSpace(item.FechaIniLaboral)),
            ["FechaFinLaboral"] = new("Laboral", NullIfWhiteSpace(item.FechaFinLaboral)),
            ["FechaBaja"] = new("Laboral", NullIfWhiteSpace(item.FechaBaja)),
            ["CargoPrint"] = new("Laboral", NullIfWhiteSpace(item.CargoPrint)),
            ["IdEstado"] = new("Estado", FormatInt(item.IdEstado)),
            ["IdActivo"] = new("Estado", FormatInt(item.IdActivo)),
            ["IdEmpresaCj"] = new("Detalle", FormatInt(item.IdEmpresaCj)),
            ["Empresa"] = new("Detalle", NullIfWhiteSpace(item.Empresa)),
            ["IdClienteCj"] = new("Detalle", FormatInt(item.IdClienteCj)),
            ["Cliente"] = new("Detalle", NullIfWhiteSpace(item.Cliente)),
            ["IdAreaCj"] = new("Detalle", FormatInt(item.IdAreaCj)),
            ["Area"] = new("Detalle", NullIfWhiteSpace(item.Area)),
            ["IdUbicacionCj"] = new("Detalle", FormatInt(item.IdUbicacionCj)),
            ["Ubicacion"] = new("Detalle", NullIfWhiteSpace(item.Ubicacion)),
            ["IdResponsableCj"] = new("Aprobaciones", FormatInt(item.IdResponsableCj)),
            ["Responsable"] = new("Aprobaciones", NullIfWhiteSpace(item.Responsable)),
            ["IdSegundoVacaciones"] = new("Aprobaciones", FormatInt(item.IdSegundoVacaciones)),
            ["SoValidador"] = new("Aprobaciones", NullIfWhiteSpace(item.SoValidador)),
            ["IdTerceroVacaciones"] = new("Aprobaciones", FormatInt(item.IdTerceroVacaciones)),
            ["TerValidador"] = new("Aprobaciones", NullIfWhiteSpace(item.TerValidador))
        };
    }

    private static string? FormatInt(int? value)
    {
        return value.HasValue ? value.Value.ToString(CultureInfo.InvariantCulture) : null;
    }

    private static string? NullIfWhiteSpace(string? value)
    {
        return string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    }

    public sealed class EmpleadoCrudDto
    {
        public int IdEmpleado { get; set; }
        public string NombreEmpleado { get; set; } = string.Empty;
        public string NroDocumento { get; set; } = string.Empty;
        public string Telefono { get; set; } = string.Empty;
        public string Correo { get; set; } = string.Empty;
        public string Empresa { get; set; } = string.Empty;
        public string Cliente { get; set; } = string.Empty;
        public string Area { get; set; } = string.Empty;
        public string Ubicacion { get; set; } = string.Empty;
        public string Responsable { get; set; } = string.Empty;
        public string SoValidador { get; set; } = string.Empty;
        public string TerValidador { get; set; } = string.Empty;
        public string FechaIniLaboral { get; set; } = string.Empty;
        public string FechaFinLaboral { get; set; } = string.Empty;
        public string FechaBaja { get; set; } = string.Empty;
        public string Direccion { get; set; } = string.Empty;
        public string CargoPrint { get; set; } = string.Empty;
        public string Estado { get; set; } = string.Empty;
        public int? IdEstado { get; set; }
        public int? IdActivo { get; set; }
        public int? IdEmpresaCj { get; set; }
        public int? IdClienteCj { get; set; }
        public int? IdAreaCj { get; set; }
        public int? IdUbicacionCj { get; set; }
        public int? IdResponsableCj { get; set; }
        public int? IdSegundoVacaciones { get; set; }
        public int? IdTerceroVacaciones { get; set; }
    }

    public sealed class EmpleadoCrudUpsertRequest
    {
        public string NombreEmpleado { get; set; } = string.Empty;
        public string? NroDocumento { get; set; }
        public string? Telefono { get; set; }
        public string? Correo { get; set; }
        public string? Direccion { get; set; }
        public string? FechaIniLaboral { get; set; }
        public string? FechaFinLaboral { get; set; }
        public int? IdPuesto { get; set; }
        public int? IdEmpresaCj { get; set; }
        public int? IdClienteCj { get; set; }
        public int? IdAreaCj { get; set; }
        public int? IdUbicacionCj { get; set; }
        public int? IdResponsableCj { get; set; }
        public int? IdSegundoVacaciones { get; set; }
        public int? IdTerceroVacaciones { get; set; }
    }

    public sealed class LookupItem
    {
        public string Value { get; set; } = string.Empty;
        public string Label { get; set; } = string.Empty;
        public string Codigo { get; set; } = string.Empty;
        public string Campo { get; set; } = string.Empty;
        public int Orden { get; set; }
    }

    private sealed record AuditFieldValue(string Section, string? Value);
}
