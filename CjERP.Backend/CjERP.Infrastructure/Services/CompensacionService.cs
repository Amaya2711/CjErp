using System.Data;
using System.Globalization;
using CjERP.Application.DTOs;
using CjERP.Application.Interfaces.Services;
using Dapper;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;

namespace CjERP.Infrastructure.Services;

public sealed class CompensacionService : ICompensacionService
{
    private const string TableName = "dbo.EmpleadoCompensacion";
    private const string MovimientoTableName = "dbo.EmpleadoCompensacionMovimiento";
    private const string SaldoSp = "dbo.sp_EmpleadoCompensacionSaldo_Listar";
    private const int EstadoNuevoCompensacion = 97;
    private static readonly string[] OptionalColumns = ["IdSaldoCompensacion", "IdMovimiento", "ProcesadoSaldo"];
    private readonly IConfiguration _configuration;
    private readonly IAuditoriaCambiosService _auditoriaCambiosService;

    public CompensacionService(
        IConfiguration configuration,
        IAuditoriaCambiosService auditoriaCambiosService)
    {
        _configuration = configuration;
        _auditoriaCambiosService = auditoriaCambiosService;
    }

    public async Task<IReadOnlyList<CompensacionDto>> ListarAsync(
        CompensacionFiltroDto filtro,
        CancellationToken cancellationToken = default)
    {
        await using var connection = CreateConnection();
        var rows = (await connection.QueryAsync<CompensacionDto>(
            new CommandDefinition(
                "dbo.sp_EmpleadoCompensacion_Consultar",
                new
                {
                    filtro.IdEmpleadoCj,
                    filtro.IdEstado,
                    IdActivo = ResolveIdActivo(filtro),
                    FechaInicio = (filtro.FechaInicio ?? filtro.FechaDesde)?.Date,
                    FechaFin = (filtro.FechaFin ?? filtro.FechaHasta)?.Date
                },
                commandType: CommandType.StoredProcedure,
                cancellationToken: cancellationToken))).ToList();

        foreach (var row in rows)
        {
            row.IdEmpleadoCompensacion = BuildSyntheticId(row.IdEmpleadoCj, row.FechaInicio, row.IdActivo);
        }

        return rows;
    }

    public async Task<IReadOnlyList<CompensacionSaldoDto>> ListarSaldosAsync(
        CancellationToken cancellationToken = default)
    {
        await using var connection = CreateConnection();
        var rows = await connection.QueryAsync<CompensacionSaldoDto>(
            new CommandDefinition(
                SaldoSp,
                new { IdEmpleadoCj = (int?)null },
                commandType: CommandType.StoredProcedure,
                cancellationToken: cancellationToken));

        return rows.ToList();
    }

    public async Task<CompensacionDto?> ObtenerPorIdAsync(
        long id,
        CancellationToken cancellationToken = default)
    {
        await using var connection = CreateConnection();
        return await ObtenerPorIdAsync(connection, id, cancellationToken);
    }

    public async Task<CompensacionSaldoDto?> ObtenerSaldoAsync(
        int idEmpleadoCj,
        CancellationToken cancellationToken = default)
    {
        if (idEmpleadoCj <= 0)
        {
            return null;
        }

        await using var connection = CreateConnection();
        return await GetSaldoAsync(connection, idEmpleadoCj, cancellationToken);
    }

    public async Task<long> CrearAsync(
        CompensacionUpsertDto request,
        string usuarioAccion,
        CancellationToken cancellationToken = default)
    {
        ValidateRequest(request);

        await using var connection = CreateConnection();
        await connection.OpenAsync(cancellationToken);
        var usuario = ResolveUsuario(usuarioAccion);
        await EnsureSufficientSaldoAsync(connection, request, cancellationToken);
        var saldoDisponible = await GetSaldoAsync(connection, request.IdEmpleadoCj!.Value, cancellationToken)
            ?? throw new InvalidOperationException("No se encontró saldo disponible para el empleado.");

        var saldoActual = await ObtenerSaldoActivoAsync(connection, request.IdEmpleadoCj!.Value, cancellationToken);
        using var transaction = connection.BeginTransaction();

        {
            var movimientoInsertResult = await connection.QueryFirstOrDefaultAsync<MovimientoGuardarResultDto>(
                new CommandDefinition(
                    "dbo.sp_EmpleadoCompensacionMovimiento_Insertar",
                    new
                    {
                        IdEmpleadoCj = request.IdEmpleadoCj,
                        IdEmpleadoCompensacion = (int?)null,
                        TipoMovimiento = "TOMADO",
                        Fecha = request.FechaInicio?.Date ?? request.Fecha?.Date,
                        CantidadDias = request.CantidadDias,
                        Motivo = string.IsNullOrWhiteSpace(request.TipoCompensacion) ? "COMPENSACION" : request.TipoCompensacion.Trim(),
                        Comentario = string.IsNullOrWhiteSpace(request.Comentario) ? null : request.Comentario.Trim(),
                        IdEstado = request.IdEstado ?? EstadoNuevoCompensacion,
                        Usuario = usuario
                    },
                    transaction: transaction,
                    commandType: CommandType.StoredProcedure,
                    cancellationToken: cancellationToken));

            if (movimientoInsertResult is null)
            {
                throw new InvalidOperationException("No se obtuvo respuesta al guardar el movimiento de compensaciÃƒÂ³n.");
            }

            if (movimientoInsertResult.Resultado != 1)
            {
                throw new InvalidOperationException(movimientoInsertResult.Mensaje ?? "No se pudo registrar el movimiento de compensaciÃƒÂ³n.");
            }

            var saldoSaveResult = await connection.QueryFirstOrDefaultAsync<SaldoGuardarResultDto>(
                new CommandDefinition(
                    "dbo.sp_EmpleadoCompensacionSaldo_Guardar",
                    new
                    {
                        IdEmpleadoCj = request.IdEmpleadoCj,
                        DiasBase = saldoActual?.DiasBase ?? saldoDisponible.DiasBase,
                        DiasGanados = saldoActual?.DiasGanados ?? saldoDisponible.DiasGanados,
                        DiasTomados = (saldoActual?.DiasTomados ?? saldoDisponible.DiasTomados) + request.CantidadDias,
                        IdActivo = 1,
                        Usuario = usuario
                    },
                    transaction: transaction,
                    commandType: CommandType.StoredProcedure,
                    cancellationToken: cancellationToken));

            if (saldoSaveResult is null)
            {
                throw new InvalidOperationException("No se obtuvo respuesta al guardar el saldo de compensaciÃ³n.");
            }

            if (saldoSaveResult.Resultado != 1)
            {
                throw new InvalidOperationException(saldoSaveResult.Mensaje ?? "No se pudo actualizar el saldo de compensaciÃ³n.");
            }

            var compensacionInsertResult = await connection.QueryFirstOrDefaultAsync<SpResultDto>(
                new CommandDefinition(
                    "dbo.sp_EmpleadoCompensacion_Insertar",
                    new
                    {
                        IdEmpleadoCj = request.IdEmpleadoCj,
                        FechaInicio = request.FechaInicio?.Date,
                        FechaFin = request.FechaFin?.Date ?? request.FechaInicio?.Date,
                        IdEstado = request.IdEstado ?? EstadoNuevoCompensacion,
                        Usuario = usuario,
                        Comentario = string.IsNullOrWhiteSpace(request.Comentario) ? null : request.Comentario.Trim(),
                        IdSaldoCompensacion = saldoSaveResult.IdSaldoCompensacion,
                        IdMovimiento = movimientoInsertResult.IdMovimiento,
                        ProcesadoSaldo = true
                    },
                    transaction: transaction,
                    commandType: CommandType.StoredProcedure,
                    cancellationToken: cancellationToken));

            if (compensacionInsertResult is null)
            {
                throw new InvalidOperationException("No se obtuvo respuesta del registro de compensaciÃ³n.");
            }

            if (compensacionInsertResult.Exito != 1)
            {
                throw new InvalidOperationException(compensacionInsertResult.Mensaje ?? "No se pudo registrar la compensaciÃ³n.");
            }

            transaction.Commit();
            return BuildSyntheticId(request.IdEmpleadoCj, request.FechaInicio, 1);
        }

        var insertResult = await connection.QueryFirstOrDefaultAsync<SpResultDto>(
            new CommandDefinition(
                "dbo.sp_EmpleadoCompensacion_Insertar",
                new
                {
                    IdEmpleadoCj = request.IdEmpleadoCj,
                    FechaInicio = request.FechaInicio?.Date,
                    FechaFin = request.FechaFin?.Date,
                    IdEstado = request.IdEstado ?? EstadoNuevoCompensacion,
                    Comentario = string.IsNullOrWhiteSpace(request.Comentario) ? null : request.Comentario.Trim(),
                    Usuario = usuario
                },
                transaction: transaction,
                commandType: CommandType.StoredProcedure,
                cancellationToken: cancellationToken));

        if (insertResult is null)
        {
            throw new InvalidOperationException("No se obtuvo respuesta del registro de compensación.");
        }

        if (insertResult.Exito != 1)
        {
            throw new InvalidOperationException(insertResult.Mensaje ?? "No se pudo registrar la compensación.");
        }

        var movimientoResult = await connection.QueryFirstOrDefaultAsync<MovimientoGuardarResultDto>(
            new CommandDefinition(
                "dbo.sp_EmpleadoCompensacionMovimiento_Insertar",
                new
                {
                    IdEmpleadoCj = request.IdEmpleadoCj,
                    IdEmpleadoCompensacion = (int?)null,
                    TipoMovimiento = "TOMADO",
                    Fecha = request.FechaInicio?.Date ?? request.Fecha?.Date,
                    CantidadDias = request.CantidadDias,
                    Motivo = string.IsNullOrWhiteSpace(request.TipoCompensacion) ? "COMPENSACION" : request.TipoCompensacion.Trim(),
                    Comentario = string.IsNullOrWhiteSpace(request.Comentario) ? null : request.Comentario.Trim(),
                    IdEstado = request.IdEstado ?? EstadoNuevoCompensacion,
                    Usuario = usuario
                },
                transaction: transaction,
                commandType: CommandType.StoredProcedure,
                cancellationToken: cancellationToken));

        if (movimientoResult is null)
        {
            throw new InvalidOperationException("No se obtuvo respuesta al guardar el movimiento de compensaciÃ³n.");
        }

        if (movimientoResult.Resultado != 1)
        {
            throw new InvalidOperationException(movimientoResult.Mensaje ?? "No se pudo registrar el movimiento de compensaciÃ³n.");
        }

        var saldoResult = await connection.QueryFirstOrDefaultAsync<SaldoGuardarResultDto>(
            new CommandDefinition(
                "dbo.sp_EmpleadoCompensacionSaldo_Guardar",
                new
                {
                    IdEmpleadoCj = request.IdEmpleadoCj,
                    DiasBase = saldoActual?.DiasBase ?? saldoDisponible.DiasBase,
                    DiasGanados = saldoActual?.DiasGanados ?? saldoDisponible.DiasGanados,
                    DiasTomados = (saldoActual?.DiasTomados ?? saldoDisponible.DiasTomados) + request.CantidadDias,
                    IdActivo = 1,
                    Usuario = usuario
                },
                transaction: transaction,
                commandType: CommandType.StoredProcedure,
                cancellationToken: cancellationToken));

        if (saldoResult is null)
        {
            throw new InvalidOperationException("No se obtuvo respuesta al guardar el saldo de compensación.");
        }

        if (saldoResult.Resultado != 1)
        {
            throw new InvalidOperationException(saldoResult.Mensaje ?? "No se pudo actualizar el saldo de compensación.");
        }

        await connection.ExecuteAsync(
            new CommandDefinition(
                $"""
                UPDATE {TableName}
                SET
                    IdSaldoCompensacion = @IdSaldoCompensacion,
                    IdMovimiento = @IdMovimiento,
                    ProcesadoSaldo = @ProcesadoSaldo,
                    Usuario = @Usuario
                WHERE IdEmpleadoCj = @IdEmpleadoCj
                  AND FechaInicio = @FechaInicio
                  AND FechaFin = @FechaFin
                  AND IdActivo = 1;
                """,
                new
                {
                    IdEmpleadoCj = request.IdEmpleadoCj,
                    FechaInicio = request.FechaInicio?.Date,
                    FechaFin = request.FechaFin?.Date ?? request.FechaInicio?.Date,
                    IdSaldoCompensacion = saldoResult.IdSaldoCompensacion,
                    IdMovimiento = movimientoResult.IdMovimiento,
                    ProcesadoSaldo = true,
                    Usuario = usuario
                },
                transaction: transaction,
                cancellationToken: cancellationToken));

        transaction.Commit();
        return BuildSyntheticId(request.IdEmpleadoCj, request.FechaInicio, 1);
    }

    public async Task ActualizarAsync(
        long id,
        CompensacionUpsertDto request,
        string usuarioAccion,
        CancellationToken cancellationToken = default)
    {
        if (id <= 0)
        {
            throw new InvalidOperationException("El id de compensacion es obligatorio.");
        }

        ValidateRequest(request);

        await using var connection = CreateConnection();
        var targetKey = DecodeSyntheticId(id)
            ?? throw new InvalidOperationException("El identificador de compensacion es invalido.");
        var anterior = await ObtenerPorClaveAsync(
                connection,
                targetKey.IdEmpleadoCj,
                targetKey.FechaInicio,
                targetKey.IdActivo,
                cancellationToken)
            ?? throw new InvalidOperationException("No se encontro el registro de compensacion a actualizar.");

        await EnsureSufficientSaldoAsync(connection, request, cancellationToken);

        var parameters = BuildParameters(request, usuarioAccion);
        parameters.Add("@TargetIdEmpleadoCj", anterior.IdEmpleadoCj, DbType.Int32);
        parameters.Add("@TargetFechaInicio", anterior.FechaInicio?.Date, DbType.Date);
        parameters.Add("@TargetIdActivo", anterior.IdActivo, DbType.Int32);
        var tableColumns = await GetTableColumnsAsync(connection, TableName, cancellationToken);

        var setClauses = new List<string>
        {
            "IdEmpleadoCj = @IdEmpleadoCj",
            "IdEstado = @IdEstado",
            "Fecha = @Fecha",
            "IdActivo = @IdActivo",
            "IdAutorizado = @IdAutorizado",
            "FechaAutorizado = @FechaAutorizado",
            "FechaInicio = @FechaInicio",
            "FechaFin = @FechaFin",
            "FechaPre = @FechaPre",
            "FechaPrimera = @FechaPrimera",
            "IdPre = @IdPre",
            "IdPrimera = @IdPrimera",
            "IdGestor = @IdGestor",
            "Usuario = @Usuario",
            "IdRechazo = @IdRechazo",
            "FechaRechazo = @FechaRechazo",
            "Pagada = @Pagada",
            "Comentario = @Comentario",
            "TipoCompensacion = @TipoCompensacion",
            "CantidadDias = @CantidadDias"
        };

        if (tableColumns.Contains("IdSaldoCompensacion"))
        {
            setClauses.Add("IdSaldoCompensacion = @IdSaldoCompensacion");
        }

        if (tableColumns.Contains("IdMovimiento"))
        {
            setClauses.Add("IdMovimiento = @IdMovimiento");
        }

        if (tableColumns.Contains("ProcesadoSaldo"))
        {
            setClauses.Add("ProcesadoSaldo = @ProcesadoSaldo");
        }

        var sql = $"""
        ;WITH target AS
        (
            SELECT TOP 1 *
            FROM {TableName}
            WHERE IdEmpleadoCj = @TargetIdEmpleadoCj
              AND FechaInicio = @TargetFechaInicio
              AND IdActivo = @TargetIdActivo
            ORDER BY FechaCreacion DESC
        )
        UPDATE target
        SET
            {string.Join(",\n            ", setClauses)};
        """;

        var affected = await connection.ExecuteAsync(
            new CommandDefinition(sql, parameters, cancellationToken: cancellationToken));

        if (affected == 0)
        {
            throw new InvalidOperationException("No se encontro el registro de compensacion a actualizar.");
        }

        var actual = await ObtenerPorClaveAsync(
            connection,
            request.IdEmpleadoCj ?? anterior.IdEmpleadoCj ?? 0,
            request.FechaInicio ?? anterior.FechaInicio,
            request.IdActivo ?? anterior.IdActivo,
            cancellationToken)
            ?? throw new InvalidOperationException("No se pudo obtener la compensacion actualizada.");

        await _auditoriaCambiosService.RegistrarLoteAsync(
            BuildUpdateAuditEntries(anterior, actual, ResolveUsuario(usuarioAccion)),
            cancellationToken);
    }

    public async Task<ProcesarCompensacionResultDto> ProcesarAsync(
        ProcesarCompensacionRequestDto request,
        string usuarioAccion,
        int? idEmpleadoAccion,
        CancellationToken cancellationToken = default)
    {
        ValidateProcesoRequest(request, idEmpleadoAccion);

        await using var connection = CreateConnection();
        await connection.OpenAsync(cancellationToken);
        var usuario = ResolveUsuario(usuarioAccion);
        var comentario = NullIfWhiteSpace(request.Comentario);
        var idActivoProcesado = string.Equals(request.Accion, "RECHAZAR", StringComparison.OrdinalIgnoreCase) ? 0 : 1;
        var anterior = await ObtenerPorClaveAsync(
                connection,
                request.IdEmpleadoCj,
                request.FechaInicio,
                1,
                cancellationToken)
            ?? throw new InvalidOperationException("No se encontro la compensacion a procesar.");
        var saldoActual = string.Equals(request.Accion, "RECHAZAR", StringComparison.OrdinalIgnoreCase)
            ? await ObtenerSaldoActivoAsync(connection, request.IdEmpleadoCj, cancellationToken)
            : null;

        var estadoId = await ResolveEstadoProcesoAsync(connection, request.Accion, cancellationToken);
        using var transaction = connection.BeginTransaction();
        var spResult = await connection.QueryFirstOrDefaultAsync<SpResultDto>(
            new CommandDefinition(
                "dbo.sp_EmpleadoCompensacion_Actualizar",
                new
                {
                    IdEmpleadoCj = request.IdEmpleadoCj,
                    FechaInicioOriginal = request.FechaInicio.Date,
                    FechaInicio = request.FechaInicio.Date,
                    FechaFin = request.FechaFin.Date,
                    IdEstado = estadoId,
                    IdActivo = idActivoProcesado,
                    Comentario = comentario,
                    Accion = request.Accion,
                    IdRechazo = string.Equals(request.Accion, "RECHAZAR", StringComparison.OrdinalIgnoreCase) ? idEmpleadoAccion : null,
                    FechaRechazo = string.Equals(request.Accion, "RECHAZAR", StringComparison.OrdinalIgnoreCase) ? (DateTime?)DateTime.Now : null,
                    Usuario = usuario
                },
                transaction: transaction,
                commandType: CommandType.StoredProcedure,
                cancellationToken: cancellationToken));

        if (spResult is null)
        {
            throw new InvalidOperationException("No se obtuvo respuesta al procesar la compensacion.");
        }

        if (spResult.Exito != 1)
        {
            throw new InvalidOperationException(spResult.Mensaje ?? "No se pudo procesar la compensacion.");
        }

        if (string.Equals(request.Accion, "RECHAZAR", StringComparison.OrdinalIgnoreCase))
        {
            var saldoRechazo = saldoActual
                ?? throw new InvalidOperationException("No se encontro un saldo activo asociado para registrar el rechazo de la compensacion.");
            var cantidadDiasRechazados = Math.Max(
                1m,
                request.FechaFin.Date.Subtract(request.FechaInicio.Date).Days + 1);
            var movimientoRechazoResult = await connection.QueryFirstOrDefaultAsync<MovimientoGuardarResultDto>(
                new CommandDefinition(
                    "dbo.sp_EmpleadoCompensacionMovimiento_Insertar",
                    new
                    {
                        IdEmpleadoCj = request.IdEmpleadoCj,
                        IdEmpleadoCompensacion = (int?)null,
                        TipoMovimiento = "GANADO",
                        Fecha = request.FechaInicio.Date,
                        CantidadDias = cantidadDiasRechazados,
                        Motivo = "RECHAZO COMPENSACION",
                        Comentario = comentario,
                        IdEstado = estadoId,
                        Usuario = usuario
                    },
                    transaction: transaction,
                    commandType: CommandType.StoredProcedure,
                    cancellationToken: cancellationToken));

            if (movimientoRechazoResult is null)
            {
                throw new InvalidOperationException("No se obtuvo respuesta al registrar el movimiento de rechazo.");
            }

            if (movimientoRechazoResult.Resultado != 1)
            {
                throw new InvalidOperationException(
                    movimientoRechazoResult.Mensaje ?? "No se pudo registrar el movimiento del rechazo.");
            }

            var saldoSaveResult = await connection.QueryFirstOrDefaultAsync<SaldoGuardarResultDto>(
                new CommandDefinition(
                    "dbo.sp_EmpleadoCompensacionSaldo_Guardar",
                    new
                    {
                        IdEmpleadoCj = request.IdEmpleadoCj,
                        DiasBase = saldoRechazo.DiasBase,
                        DiasGanados = saldoRechazo.DiasGanados,
                        DiasTomados = Math.Max(0m, saldoRechazo.DiasTomados - cantidadDiasRechazados),
                        IdActivo = 1,
                        Usuario = usuario
                    },
                    transaction: transaction,
                    commandType: CommandType.StoredProcedure,
                    cancellationToken: cancellationToken));

            if (saldoSaveResult is null)
            {
                throw new InvalidOperationException("No se obtuvo respuesta al reprocesar el saldo de compensacion.");
            }

            if (saldoSaveResult.Resultado != 1)
            {
                throw new InvalidOperationException(
                    saldoSaveResult.Mensaje ?? "No se pudo reprocesar el saldo de compensacion.");
            }

            await connection.ExecuteAsync(
                new CommandDefinition(
                    $"""
                    UPDATE {TableName}
                    SET
                        IdSaldoCompensacion = @IdSaldoCompensacion,
                        IdMovimiento = @IdMovimiento,
                        ProcesadoSaldo = @ProcesadoSaldo,
                        Usuario = @Usuario
                    WHERE IdEmpleadoCj = @IdEmpleadoCj
                      AND FechaInicio = @FechaInicio
                      AND FechaFin = @FechaFin
                      AND IdActivo = 1;
                    """,
                    new
                    {
                        IdEmpleadoCj = request.IdEmpleadoCj,
                        FechaInicio = request.FechaInicio.Date,
                        FechaFin = request.FechaFin.Date,
                        IdSaldoCompensacion = saldoSaveResult.IdSaldoCompensacion,
                        IdMovimiento = movimientoRechazoResult.IdMovimiento,
                        ProcesadoSaldo = true,
                        Usuario = usuario
                    },
                    transaction: transaction,
                    cancellationToken: cancellationToken));
        }

        var movimientoColumns = await GetTableColumnsAsync(
            connection,
            MovimientoTableName,
            cancellationToken,
            transaction);
        if (anterior.IdMovimiento is > 0
            && movimientoColumns.Contains("Comentario")
            && !string.Equals(request.Accion, "RECHAZAR", StringComparison.OrdinalIgnoreCase))
        {
            await connection.ExecuteAsync(
                new CommandDefinition(
                    """
                    UPDATE dbo.EmpleadoCompensacionMovimiento
                    SET Comentario = @Comentario
                    WHERE IdMovimiento = @IdMovimiento;
                    """,
                    new
                    {
                        IdMovimiento = anterior.IdMovimiento.Value,
                        Comentario = comentario
                    },
                    transaction: transaction,
                    cancellationToken: cancellationToken));
        }

        transaction.Commit();

        var actual = await ObtenerPorClaveAsync(
                connection,
                request.IdEmpleadoCj,
                request.FechaInicio,
                idActivoProcesado,
                cancellationToken)
            ?? throw new InvalidOperationException("No se pudo obtener la compensacion procesada.");

        await _auditoriaCambiosService.RegistrarLoteAsync(
            BuildUpdateAuditEntries(anterior, actual, usuario),
            cancellationToken);

        return new ProcesarCompensacionResultDto
        {
            Mensaje = spResult.Mensaje ?? "Compensacion procesada correctamente."
        };
    }

    public async Task EliminarAsync(
        long id,
        string usuarioAccion,
        CancellationToken cancellationToken = default)
    {
        if (id <= 0)
        {
            throw new InvalidOperationException("El id de compensacion es obligatorio.");
        }

        await using var connection = CreateConnection();
        var targetKey = DecodeSyntheticId(id)
            ?? throw new InvalidOperationException("El identificador de compensacion es invalido.");

        const string sql = """
        ;WITH target AS
        (
            SELECT TOP 1 *
            FROM dbo.EmpleadoCompensacion
            WHERE IdEmpleadoCj = @IdEmpleadoCj
              AND FechaInicio = @FechaInicio
              AND IdActivo = @IdActivo
            ORDER BY FechaCreacion DESC
        )
        UPDATE target
        SET
            IdActivo = 0,
            Usuario = @Usuario;
        """;

        var affected = await connection.ExecuteAsync(
            new CommandDefinition(
                sql,
                new
                {
                    IdEmpleadoCj = targetKey.IdEmpleadoCj,
                    FechaInicio = targetKey.FechaInicio.Date,
                    IdActivo = targetKey.IdActivo,
                    Usuario = ResolveUsuario(usuarioAccion)
                },
                cancellationToken: cancellationToken));

        if (affected == 0)
        {
            throw new InvalidOperationException("No se encontro el registro de compensacion a eliminar.");
        }
    }

    private SqlConnection CreateConnection()
    {
        return new SqlConnection(_configuration.GetConnectionString("DefaultConnection"));
    }

    private static DynamicParameters BuildParameters(
        CompensacionUpsertDto request,
        string usuarioAccion,
        DateTime? fechaCreacion = null)
    {
        var parameters = new DynamicParameters();
        parameters.Add("@IdEmpleadoCj", request.IdEmpleadoCj, DbType.Int32);
        parameters.Add("@IdEstado", request.IdEstado ?? EstadoNuevoCompensacion, DbType.Int32);
        parameters.Add("@Fecha", request.Fecha, DbType.DateTime);
        parameters.Add("@IdActivo", request.IdActivo ?? 1, DbType.Int32);
        parameters.Add("@IdAutorizado", request.IdAutorizado, DbType.Int32);
        parameters.Add("@FechaAutorizado", request.FechaAutorizado, DbType.Date);
        parameters.Add("@FechaInicio", request.FechaInicio, DbType.Date);
        parameters.Add("@FechaFin", request.FechaFin, DbType.Date);
        parameters.Add("@FechaPre", request.FechaPre, DbType.Date);
        parameters.Add("@FechaPrimera", request.FechaPrimera, DbType.Date);
        parameters.Add("@IdPre", request.IdPre, DbType.Int32);
        parameters.Add("@IdPrimera", request.IdPrimera, DbType.Int32);
        parameters.Add("@IdGestor", request.IdGestor, DbType.Int32);
        parameters.Add(
            "@Usuario",
            string.IsNullOrWhiteSpace(request.Usuario) ? ResolveUsuario(usuarioAccion) : request.Usuario.Trim(),
            DbType.String);
        parameters.Add("@FechaCreacion", fechaCreacion ?? DateTime.Now, DbType.DateTime);
        parameters.Add("@IdRechazo", request.IdRechazo, DbType.Int32);
        parameters.Add("@FechaRechazo", request.FechaRechazo, DbType.DateTime);
        parameters.Add("@Pagada", request.Pagada, DbType.Boolean);
        parameters.Add("@Comentario", request.Comentario?.Trim(), DbType.String);
        parameters.Add("@TipoCompensacion", request.TipoCompensacion?.Trim(), DbType.String);
        parameters.Add("@CantidadDias", request.CantidadDias, DbType.Decimal);
        parameters.Add("@IdSaldoCompensacion", request.IdSaldoCompensacion, DbType.Int32);
        parameters.Add("@IdMovimiento", request.IdMovimiento, DbType.Int32);
        parameters.Add("@ProcesadoSaldo", request.ProcesadoSaldo, DbType.Boolean);
        return parameters;
    }

    private static IEnumerable<AuditoriaCambioDto> BuildUpdateAuditEntries(
        CompensacionDto anterior,
        CompensacionDto actual,
        string usuarioAccion)
    {
        var valoresAnteriores = BuildFieldValues(anterior);
        var valoresActuales = BuildFieldValues(actual);

        foreach (var actualValue in valoresActuales)
        {
            valoresAnteriores.TryGetValue(actualValue.Key, out var valorAnterior);
            if (string.Equals(valorAnterior, actualValue.Value, StringComparison.Ordinal))
            {
                continue;
            }

            yield return new AuditoriaCambioDto
            {
                Modulo = "RecursosHumanos",
                Entidad = "Compensacion",
                IdRegistro = actual.IdEmpleadoCompensacion.ToString(CultureInfo.InvariantCulture),
                Accion = "UPDATE",
                Seccion = "Cabecera",
                Campo = actualValue.Key,
                ValorAnterior = valorAnterior,
                ValorNuevo = actualValue.Value,
                UsuarioAccion = usuarioAccion,
                Observacion = "Actualizacion de la compensacion."
            };
        }
    }

    private static Dictionary<string, string> BuildFieldValues(CompensacionDto item)
    {
        return new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            ["IdEmpleadoCj"] = FormatInt(item.IdEmpleadoCj),
            ["IdEstado"] = FormatInt(item.IdEstado),
            ["Fecha"] = FormatDateTime(item.Fecha),
            ["IdActivo"] = FormatInt(item.IdActivo),
            ["IdAutorizado"] = FormatInt(item.IdAutorizado),
            ["FechaAutorizado"] = FormatDate(item.FechaAutorizado),
            ["FechaInicio"] = FormatDate(item.FechaInicio),
            ["FechaFin"] = FormatDate(item.FechaFin),
            ["FechaPre"] = FormatDate(item.FechaPre),
            ["FechaPrimera"] = FormatDate(item.FechaPrimera),
            ["IdPre"] = FormatInt(item.IdPre),
            ["IdPrimera"] = FormatInt(item.IdPrimera),
            ["IdGestor"] = FormatInt(item.IdGestor),
            ["Usuario"] = item.Usuario ?? string.Empty,
            ["IdRechazo"] = FormatInt(item.IdRechazo),
            ["FechaRechazo"] = FormatDateTime(item.FechaRechazo),
            ["Pagada"] = FormatBool(item.Pagada),
            ["Comentario"] = item.Comentario ?? string.Empty,
            ["TipoCompensacion"] = item.TipoCompensacion ?? string.Empty,
            ["CantidadDias"] = item.CantidadDias.ToString("0.##", CultureInfo.InvariantCulture),
            ["IdSaldoCompensacion"] = FormatInt(item.IdSaldoCompensacion),
            ["IdMovimiento"] = FormatInt(item.IdMovimiento),
            ["ProcesadoSaldo"] = FormatBool(item.ProcesadoSaldo)
        };
    }

    private static void ValidateRequest(CompensacionUpsertDto request)
    {
        if (request.IdEmpleadoCj is null or <= 0)
        {
            throw new InvalidOperationException("IdEmpleadoCj es obligatorio.");
        }

        if (request.Fecha is null)
        {
            throw new InvalidOperationException("La fecha es obligatoria.");
        }

        if (string.IsNullOrWhiteSpace(request.TipoCompensacion))
        {
            throw new InvalidOperationException("El tipo de compensacion es obligatorio.");
        }

        if (request.CantidadDias <= 0)
        {
            throw new InvalidOperationException("Cantidad de dias debe ser mayor a 0.");
        }
    }

    private static async Task<CompensacionSaldoDto?> GetSaldoAsync(
        SqlConnection connection,
        int idEmpleadoCj,
        CancellationToken cancellationToken)
    {
        return await connection.QueryFirstOrDefaultAsync<CompensacionSaldoDto>(
            new CommandDefinition(
                SaldoSp,
                new { IdEmpleadoCj = idEmpleadoCj },
                commandType: CommandType.StoredProcedure,
                cancellationToken: cancellationToken));
    }

    private static async Task EnsureSufficientSaldoAsync(
        SqlConnection connection,
        CompensacionUpsertDto request,
        CancellationToken cancellationToken)
    {
        if (request.IdEmpleadoCj is null or <= 0 || request.CantidadDias <= 0)
        {
            return;
        }

        var saldo = await GetSaldoAsync(connection, request.IdEmpleadoCj.Value, cancellationToken);
        if (saldo is null || saldo.DiasPendientes <= 0 || request.CantidadDias > saldo.DiasPendientes)
        {
            throw new InvalidOperationException("No se tiene suficientes dias a compensar");
        }
    }

    private static string ResolveUsuario(string? usuarioAccion)
    {
        return string.IsNullOrWhiteSpace(usuarioAccion) ? "sistema" : usuarioAccion.Trim();
    }

    private static int? ResolveIdActivo(CompensacionFiltroDto filtro)
    {
        if (filtro.IdActivo.HasValue)
        {
            return filtro.IdActivo.Value;
        }

        return filtro.IncluirInactivos ? null : 1;
    }

    private static async Task<HashSet<string>> GetTableColumnsAsync(
        SqlConnection connection,
        string fullTableName,
        CancellationToken cancellationToken,
        SqlTransaction? transaction = null)
    {
        var parts = fullTableName.Split('.', 2, StringSplitOptions.TrimEntries);
        var schemaName = parts.Length == 2 ? parts[0] : "dbo";
        var tableName = parts.Length == 2 ? parts[1] : parts[0];

        const string sql = """
        SELECT c.name
        FROM sys.columns c
        INNER JOIN sys.tables t ON t.object_id = c.object_id
        INNER JOIN sys.schemas s ON s.schema_id = t.schema_id
        WHERE s.name = @SchemaName
          AND t.name = @TableName;
        """;

        var columns = await connection.QueryAsync<string>(
            new CommandDefinition(
                sql,
                new
                {
                    SchemaName = schemaName,
                    TableName = tableName
                },
                transaction: transaction,
                cancellationToken: cancellationToken));

        return columns.ToHashSet(StringComparer.OrdinalIgnoreCase);
    }

    private static async Task<CompensacionDto?> ObtenerPorIdAsync(
        SqlConnection connection,
        long id,
        CancellationToken cancellationToken)
    {
        var targetKey = DecodeSyntheticId(id);
        if (targetKey is null)
        {
            return null;
        }

        return await ObtenerPorClaveAsync(
            connection,
            targetKey.Value.IdEmpleadoCj,
            targetKey.Value.FechaInicio,
            targetKey.Value.IdActivo,
            cancellationToken);
    }

    private static async Task<CompensacionDto?> ObtenerPorClaveAsync(
        SqlConnection connection,
        int idEmpleadoCj,
        DateTime? fechaInicio,
        int? idActivo,
        CancellationToken cancellationToken)
    {
        if (idEmpleadoCj <= 0 || fechaInicio is null)
        {
            return null;
        }

        var tableColumns = await GetTableColumnsAsync(connection, TableName, cancellationToken);

        var sql = $"""
        SELECT TOP 1
            IdEmpleadoCj,
            IdEstado,
            Fecha,
            IdActivo,
            IdAutorizado,
            FechaAutorizado,
            FechaInicio,
            FechaFin,
            FechaPre,
            FechaPrimera,
            IdPre,
            IdPrimera,
            IdGestor,
            Usuario,
            FechaCreacion,
            IdRechazo,
            FechaRechazo,
            Pagada,
            Comentario,
            TipoCompensacion,
            CantidadDias,
            {(tableColumns.Contains("IdSaldoCompensacion") ? "IdSaldoCompensacion" : "CAST(NULL AS int) AS IdSaldoCompensacion")},
            {(tableColumns.Contains("IdMovimiento") ? "IdMovimiento" : "CAST(NULL AS int) AS IdMovimiento")},
            {(tableColumns.Contains("ProcesadoSaldo") ? "ProcesadoSaldo" : "CAST(0 AS bit) AS ProcesadoSaldo")}
        FROM {TableName}
        WHERE IdEmpleadoCj = @IdEmpleadoCj
          AND FechaInicio = @FechaInicio
          AND IdActivo = @IdActivo
        ORDER BY FechaCreacion DESC;
        """;

        var item = await connection.QueryFirstOrDefaultAsync<CompensacionDto>(
            new CommandDefinition(
                sql,
                new
                {
                    IdEmpleadoCj = idEmpleadoCj,
                    FechaInicio = fechaInicio?.Date,
                    IdActivo = idActivo ?? 1
                },
                cancellationToken: cancellationToken));

        if (item is not null)
        {
            item.IdEmpleadoCompensacion = BuildSyntheticId(item.IdEmpleadoCj, item.FechaInicio, item.IdActivo);
        }

        return item;
    }

    private static async Task<CompensacionSaldoRowDto?> ObtenerSaldoActivoAsync(
        SqlConnection connection,
        int idEmpleadoCj,
        CancellationToken cancellationToken)
    {
        const string sql = """
        SELECT TOP 1
            IdSaldoCompensacion,
            IdEmpleadoCj,
            DiasBase,
            DiasGanados,
            DiasTomados
        FROM dbo.EmpleadoCompensacionSaldo
        WHERE IdEmpleadoCj = @IdEmpleadoCj
          AND IdActivo = 1
        ORDER BY IdSaldoCompensacion DESC;
        """;

        return await connection.QueryFirstOrDefaultAsync<CompensacionSaldoRowDto>(
            new CommandDefinition(
                sql,
                new { IdEmpleadoCj = idEmpleadoCj },
                cancellationToken: cancellationToken));
    }

    private static void ValidateProcesoRequest(ProcesarCompensacionRequestDto request, int? idEmpleadoAccion)
    {
        if (request.IdEmpleadoCj <= 0)
        {
            throw new InvalidOperationException("IdEmpleadoCj es obligatorio.");
        }

        if (request.FechaInicio == default)
        {
            throw new InvalidOperationException("La fecha inicial es obligatoria.");
        }

        if (request.FechaFin == default)
        {
            throw new InvalidOperationException("La fecha final es obligatoria.");
        }

        if (request.FechaFin.Date < request.FechaInicio.Date)
        {
            throw new InvalidOperationException("La fecha final no puede ser menor a la fecha inicial.");
        }

        if (!string.Equals(request.Accion, "PRIMER_APROBADOR", StringComparison.OrdinalIgnoreCase)
            && !string.Equals(request.Accion, "SEGUNDO_APROBADOR", StringComparison.OrdinalIgnoreCase)
            && !string.Equals(request.Accion, "RECHAZAR", StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException("La accion solicitada no es valida.");
        }

        var comentario = request.Comentario?.Trim();
        if (string.Equals(request.Accion, "RECHAZAR", StringComparison.OrdinalIgnoreCase)
            && string.IsNullOrWhiteSpace(comentario))
        {
            throw new InvalidOperationException("Debe ingresar un comentario o motivo de rechazo antes de continuar.");
        }

        if (string.Equals(request.Accion, "RECHAZAR", StringComparison.OrdinalIgnoreCase)
            && idEmpleadoAccion is null or <= 0)
        {
            throw new InvalidOperationException("No se pudo identificar el empleado que realiza el rechazo.");
        }

        if (!string.IsNullOrEmpty(comentario) && comentario.Length > 500)
        {
            throw new InvalidOperationException("El comentario no puede superar los 500 caracteres.");
        }
    }

    private static Task<int> ResolveEstadoProcesoAsync(
        SqlConnection connection,
        string accion,
        CancellationToken cancellationToken)
    {
        _ = connection;
        _ = cancellationToken;

        var estado = accion switch
        {
            "PRIMER_APROBADOR" => 98,
            "SEGUNDO_APROBADOR" => 9,
            "RECHAZAR" => 22,
            _ => throw new InvalidOperationException("La accion solicitada no es valida.")
        };

        return Task.FromResult(estado);
    }

    private static string? NullIfWhiteSpace(string? value)
    {
        return string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    }

    private static long BuildSyntheticId(int? idEmpleadoCj, DateTime? fechaInicio, int? idActivo)
    {
        if (idEmpleadoCj is null or <= 0 || fechaInicio is null)
        {
            return 0;
        }

        var datePart = long.Parse(
            fechaInicio.Value.ToString("yyyyMMdd", CultureInfo.InvariantCulture),
            CultureInfo.InvariantCulture);
        var activePart = Math.Clamp(idActivo ?? 1, 0, 9);
        return (idEmpleadoCj.Value * 1_000_000_000L) + (datePart * 10L) + activePart;
    }

    private static async Task<CompensacionDto?> ObtenerCompensacionRecienCreadaAsync(
        SqlConnection connection,
        int idEmpleadoCj,
        DateTime? fechaInicio,
        DateTime? fechaFin,
        string usuario,
        CancellationToken cancellationToken)
    {
        _ = fechaFin;
        _ = usuario;
        return await ObtenerPorClaveAsync(connection, idEmpleadoCj, fechaInicio, 1, cancellationToken);
    }

    private static (int IdEmpleadoCj, DateTime FechaInicio, int IdActivo)? DecodeSyntheticId(long id)
    {
        if (id <= 0)
        {
            return null;
        }

        var idEmpleadoCj = (int)(id / 1_000_000_000L);
        var packed = id % 1_000_000_000L;
        var activePart = (int)(packed % 10L);
        var datePart = (int)(packed / 10L);

        if (idEmpleadoCj <= 0)
        {
            return null;
        }

        var dateText = datePart.ToString("00000000", CultureInfo.InvariantCulture);
        if (!DateTime.TryParseExact(
                dateText,
                "yyyyMMdd",
                CultureInfo.InvariantCulture,
                DateTimeStyles.None,
                out var fechaInicio))
        {
            return null;
        }

        return (idEmpleadoCj, fechaInicio.Date, activePart == 0 ? 1 : activePart);
    }

    private static string FormatInt(int? value)
    {
        return value?.ToString(CultureInfo.InvariantCulture) ?? string.Empty;
    }

    private static string FormatBool(bool? value)
    {
        return value?.ToString() ?? string.Empty;
    }

    private static string FormatDate(DateTime? value)
    {
        return value?.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) ?? string.Empty;
    }

    private static string FormatDateTime(DateTime? value)
    {
        return value?.ToString("yyyy-MM-dd HH:mm:ss", CultureInfo.InvariantCulture) ?? string.Empty;
    }

    private sealed class SpResultDto
    {
        public int Exito { get; set; }
        public string? Mensaje { get; set; }
    }

    private sealed class SaldoGuardarResultDto
    {
        public int Resultado { get; set; }
        public string? Mensaje { get; set; }
        public int? IdSaldoCompensacion { get; set; }
    }

    private sealed class MovimientoGuardarResultDto
    {
        public int Resultado { get; set; }
        public string? Mensaje { get; set; }
        public int? IdMovimiento { get; set; }
    }

    private sealed class CompensacionSaldoRowDto
    {
        public int IdSaldoCompensacion { get; set; }
        public int IdEmpleadoCj { get; set; }
        public decimal DiasBase { get; set; }
        public decimal DiasGanados { get; set; }
        public decimal DiasTomados { get; set; }
    }
}
