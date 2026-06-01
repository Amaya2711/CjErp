using System.Data;
using CjERP.Application.DTOs;
using CjERP.Application.Interfaces.Services;
using Dapper;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;

namespace CjERP.Infrastructure.Services;

public sealed class CompensacionService : ICompensacionService
{
    private const string TableName = "dbo.EmpleadoCompensacion";
    private readonly IConfiguration _configuration;

    public CompensacionService(IConfiguration configuration)
    {
        _configuration = configuration;
    }

    public async Task<IReadOnlyList<CompensacionDto>> ListarAsync(CompensacionFiltroDto filtro, CancellationToken cancellationToken = default)
    {
        const string sql = """
        SELECT
            IdEmpleadoCompensacion,
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
            IdSaldoCompensacion,
            IdMovimiento,
            ProcesadoSaldo
        FROM dbo.EmpleadoCompensacion
        WHERE (@IdEmpleadoCj IS NULL OR IdEmpleadoCj = @IdEmpleadoCj)
          AND (@IdEstado IS NULL OR IdEstado = @IdEstado)
          AND (@FechaDesde IS NULL OR CAST(Fecha AS date) >= @FechaDesde)
          AND (@FechaHasta IS NULL OR CAST(Fecha AS date) <= @FechaHasta)
          AND (@IncluirInactivos = 1 OR ISNULL(IdActivo, 1) = 1)
        ORDER BY Fecha DESC, IdEmpleadoCompensacion DESC;
        """;

        await using var connection = CreateConnection();
        var rows = await connection.QueryAsync<CompensacionDto>(
            new CommandDefinition(
                sql,
                new
                {
                    filtro.IdEmpleadoCj,
                    filtro.IdEstado,
                    FechaDesde = filtro.FechaDesde?.Date,
                    FechaHasta = filtro.FechaHasta?.Date,
                    filtro.IncluirInactivos
                },
                cancellationToken: cancellationToken));

        return rows.ToList();
    }

    public async Task<int> CrearAsync(CompensacionUpsertDto request, string usuarioAccion, CancellationToken cancellationToken = default)
    {
        ValidateRequest(request);

        const string sql = """
        INSERT INTO dbo.EmpleadoCompensacion
        (
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
            IdSaldoCompensacion,
            IdMovimiento,
            ProcesadoSaldo
        )
        VALUES
        (
            @IdEmpleadoCj,
            @IdEstado,
            @Fecha,
            @IdActivo,
            @IdAutorizado,
            @FechaAutorizado,
            @FechaInicio,
            @FechaFin,
            @FechaPre,
            @FechaPrimera,
            @IdPre,
            @IdPrimera,
            @IdGestor,
            @Usuario,
            GETDATE(),
            @IdRechazo,
            @FechaRechazo,
            @Pagada,
            @Comentario,
            @TipoCompensacion,
            @CantidadDias,
            @IdSaldoCompensacion,
            @IdMovimiento,
            @ProcesadoSaldo
        );

        SELECT CAST(SCOPE_IDENTITY() AS int);
        """;

        await using var connection = CreateConnection();
        return await connection.ExecuteScalarAsync<int>(
            new CommandDefinition(
                sql,
                BuildParameters(request, usuarioAccion),
                cancellationToken: cancellationToken));
    }

    public async Task ActualizarAsync(int id, CompensacionUpsertDto request, string usuarioAccion, CancellationToken cancellationToken = default)
    {
        if (id <= 0)
        {
            throw new InvalidOperationException("El id de compensacion es obligatorio.");
        }

        ValidateRequest(request);

        const string sql = """
        UPDATE dbo.EmpleadoCompensacion
        SET
            IdEmpleadoCj = @IdEmpleadoCj,
            IdEstado = @IdEstado,
            Fecha = @Fecha,
            IdActivo = @IdActivo,
            IdAutorizado = @IdAutorizado,
            FechaAutorizado = @FechaAutorizado,
            FechaInicio = @FechaInicio,
            FechaFin = @FechaFin,
            FechaPre = @FechaPre,
            FechaPrimera = @FechaPrimera,
            IdPre = @IdPre,
            IdPrimera = @IdPrimera,
            IdGestor = @IdGestor,
            Usuario = @Usuario,
            IdRechazo = @IdRechazo,
            FechaRechazo = @FechaRechazo,
            Pagada = @Pagada,
            Comentario = @Comentario,
            TipoCompensacion = @TipoCompensacion,
            CantidadDias = @CantidadDias,
            IdSaldoCompensacion = @IdSaldoCompensacion,
            IdMovimiento = @IdMovimiento,
            ProcesadoSaldo = @ProcesadoSaldo
        WHERE IdEmpleadoCompensacion = @IdEmpleadoCompensacion;
        """;

        var parameters = BuildParameters(request, usuarioAccion);
        parameters.Add("@IdEmpleadoCompensacion", id, DbType.Int32);

        await using var connection = CreateConnection();
        var affected = await connection.ExecuteAsync(
            new CommandDefinition(sql, parameters, cancellationToken: cancellationToken));

        if (affected == 0)
        {
            throw new InvalidOperationException("No se encontró el registro de compensación a actualizar.");
        }
    }

    public async Task EliminarAsync(int id, string usuarioAccion, CancellationToken cancellationToken = default)
    {
        if (id <= 0)
        {
            throw new InvalidOperationException("El id de compensación es obligatorio.");
        }

        const string sql = """
        UPDATE dbo.EmpleadoCompensacion
        SET
            IdActivo = 0,
            Usuario = @Usuario
        WHERE IdEmpleadoCompensacion = @IdEmpleadoCompensacion;
        """;

        await using var connection = CreateConnection();
        var affected = await connection.ExecuteAsync(
            new CommandDefinition(
                sql,
                new
                {
                    IdEmpleadoCompensacion = id,
                    Usuario = ResolveUsuario(usuarioAccion)
                },
                cancellationToken: cancellationToken));

        if (affected == 0)
        {
            throw new InvalidOperationException("No se encontró el registro de compensación a eliminar.");
        }
    }

    private SqlConnection CreateConnection()
    {
        return new SqlConnection(_configuration.GetConnectionString("DefaultConnection"));
    }

    private static DynamicParameters BuildParameters(CompensacionUpsertDto request, string usuarioAccion)
    {
        var parameters = new DynamicParameters();
        parameters.Add("@IdEmpleadoCj", request.IdEmpleadoCj, DbType.Int32);
        parameters.Add("@IdEstado", request.IdEstado ?? 1, DbType.Int32);
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
        parameters.Add("@Usuario", string.IsNullOrWhiteSpace(request.Usuario) ? ResolveUsuario(usuarioAccion) : request.Usuario.Trim(), DbType.String);
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
            throw new InvalidOperationException("El tipo de compensación es obligatorio.");
        }
    }

    private static string ResolveUsuario(string? usuarioAccion)
    {
        return string.IsNullOrWhiteSpace(usuarioAccion) ? "sistema" : usuarioAccion.Trim();
    }
}
