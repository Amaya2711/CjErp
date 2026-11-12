using CjERP.Application.DTOs;
using CjERP.Application.Interfaces.Repositories;
using CjERP.Infrastructure.Persistence.Sql;
using Dapper;
using Microsoft.Data.SqlClient;
using System.Data;

namespace CjERP.Infrastructure.Repositories;

public sealed class EmpleadosListaSharePointRepository : IEmpleadosListaSharePointRepository
{
    private const string CodigoJob = "EMPLEADOS_LISTA_SHAREPOINT";
    private readonly ISqlCommandFactory _sqlCommandFactory;

    public EmpleadosListaSharePointRepository(ISqlCommandFactory sqlCommandFactory)
    {
        _sqlCommandFactory = sqlCommandFactory;
    }

    // SP existente en BD (no versionado en el repo): PV validar columnas devueltas. Solo lectura.
    public async Task<IReadOnlyList<IReadOnlyDictionary<string, object?>>> ConsultarEmpleadosAsync(
        CancellationToken cancellationToken = default)
    {
        await using var connection = _sqlCommandFactory.CreateConnection();
        var rows = await connection.QueryAsync(
            _sqlCommandFactory.Create(
                "dbo.sp_Consultar_EmpleadoSharepoint",
                commandType: CommandType.StoredProcedure,
                cancellationToken: cancellationToken,
                commandTimeout: 300));

        var result = new List<IReadOnlyDictionary<string, object?>>();
        foreach (var row in rows)
        {
            var source = (IDictionary<string, object>)row;
            var copy = new Dictionary<string, object?>(source.Count, StringComparer.OrdinalIgnoreCase);
            foreach (var pair in source)
            {
                copy[pair.Key] = pair.Value is DBNull ? null : pair.Value;
            }

            result.Add(copy);
        }

        return result;
    }

    public async Task<EmpleadosListaSharePointConfigDto?> ObtenerConfiguracionAsync(CancellationToken cancellationToken = default)
    {
        await using var connection = _sqlCommandFactory.CreateConnection();
        await EnsureSchemaAsync(connection, cancellationToken);

        return await connection.QuerySingleOrDefaultAsync<EmpleadosListaSharePointConfigDto>(
            new CommandDefinition(
                """
                SELECT TOP 1
                    c.CodigoJob, c.Activo, c.HoraEjecucion, c.TimeZone, c.CronExpression,
                    l.FechaInicioEjecucion AS UltimaEjecucion,
                    l.Estado AS UltimoEstado,
                    l.CantidadRegistros AS UltimaCantidadRegistros,
                    l.CantidadCreados AS UltimaCantidadCreados,
                    l.CantidadActualizados AS UltimaCantidadActualizados,
                    l.Mensaje
                FROM dbo.EmpleadosListaSharePointJobConfig c
                OUTER APPLY (
                    SELECT TOP 1 FechaInicioEjecucion, Estado, CantidadRegistros, CantidadCreados, CantidadActualizados, Mensaje
                    FROM dbo.EmpleadosListaSharePointLog
                    ORDER BY Id DESC
                ) l
                WHERE c.CodigoJob = @CodigoJob;
                """,
                new { CodigoJob },
                cancellationToken: cancellationToken));
    }

    public async Task GuardarConfiguracionAsync(
        EmpleadosListaSharePointConfigDto configuracion,
        string usuario,
        CancellationToken cancellationToken = default)
    {
        await using var connection = _sqlCommandFactory.CreateConnection();
        await EnsureSchemaAsync(connection, cancellationToken);

        await connection.ExecuteAsync(new CommandDefinition(
            """
            UPDATE dbo.EmpleadosListaSharePointJobConfig
            SET Activo = @Activo,
                HoraEjecucion = @HoraEjecucion,
                CronExpression = @CronExpression,
                TimeZone = @TimeZone,
                UsuarioModificacion = @UsuarioModificacion,
                FechaModificacion = SYSUTCDATETIME()
            WHERE CodigoJob = @CodigoJob;
            """,
            new
            {
                CodigoJob,
                configuracion.Activo,
                configuracion.HoraEjecucion,
                configuracion.CronExpression,
                configuracion.TimeZone,
                UsuarioModificacion = usuario
            },
            cancellationToken: cancellationToken));
    }

    public async Task<long> IniciarLogAsync(EmpleadosListaSharePointLogDto log, CancellationToken cancellationToken = default)
    {
        await using var connection = _sqlCommandFactory.CreateConnection();
        await EnsureSchemaAsync(connection, cancellationToken);

        return await connection.ExecuteScalarAsync<long>(new CommandDefinition(
            """
            INSERT INTO dbo.EmpleadosListaSharePointLog
            (TipoEjecucion, Lista, Estado, FechaInicioEjecucion, Usuario, Mensaje)
            OUTPUT INSERTED.Id
            VALUES (@TipoEjecucion, @Lista, @Estado, @FechaInicioEjecucion, @Usuario, @Mensaje);
            """,
            log,
            cancellationToken: cancellationToken));
    }

    public async Task FinalizarLogAsync(long id, EmpleadosListaSharePointLogDto log, CancellationToken cancellationToken = default)
    {
        await using var connection = _sqlCommandFactory.CreateConnection();
        await EnsureSchemaAsync(connection, cancellationToken);

        await connection.ExecuteAsync(new CommandDefinition(
            """
            UPDATE dbo.EmpleadosListaSharePointLog
            SET CantidadRegistros = @CantidadRegistros,
                CantidadCreados = @CantidadCreados,
                CantidadActualizados = @CantidadActualizados,
                CantidadSinCambios = @CantidadSinCambios,
                Estado = @Estado,
                FechaFinEjecucion = @FechaFinEjecucion,
                DuracionSegundos = @DuracionSegundos,
                Mensaje = @Mensaje,
                DetalleError = @DetalleError
            WHERE Id = @Id;
            """,
            new
            {
                Id = id,
                log.CantidadRegistros,
                log.CantidadCreados,
                log.CantidadActualizados,
                log.CantidadSinCambios,
                log.Estado,
                log.FechaFinEjecucion,
                log.DuracionSegundos,
                log.Mensaje,
                log.DetalleError
            },
            cancellationToken: cancellationToken));
    }

    public async Task<IReadOnlyList<EmpleadosListaSharePointLogDto>> ObtenerHistorialAsync(
        int top,
        CancellationToken cancellationToken = default)
    {
        await using var connection = _sqlCommandFactory.CreateConnection();
        await EnsureSchemaAsync(connection, cancellationToken);
        var limit = Math.Clamp(top, 1, 500);

        var rows = await connection.QueryAsync<EmpleadosListaSharePointLogDto>(new CommandDefinition(
            $"SELECT TOP ({limit}) * FROM dbo.EmpleadosListaSharePointLog ORDER BY Id DESC;",
            cancellationToken: cancellationToken));
        return rows.AsList();
    }

    public async Task<EmpleadosListaSharePointLogDto?> ObtenerLogAsync(long id, CancellationToken cancellationToken = default)
    {
        await using var connection = _sqlCommandFactory.CreateConnection();
        await EnsureSchemaAsync(connection, cancellationToken);
        return await connection.QuerySingleOrDefaultAsync<EmpleadosListaSharePointLogDto>(new CommandDefinition(
            "SELECT * FROM dbo.EmpleadosListaSharePointLog WHERE Id = @Id;",
            new { Id = id },
            cancellationToken: cancellationToken));
    }

    // Mismo criterio que los otros jobs de SharePoint: las tablas se crean solas si faltan
    // (Database/Reportes/06_EmpleadosListaSharePointJob.sql es la versión versionada). Nace INACTIVO.
    private static async Task EnsureSchemaAsync(SqlConnection connection, CancellationToken cancellationToken)
    {
        await connection.ExecuteAsync(new CommandDefinition(
            """
            IF OBJECT_ID(N'dbo.EmpleadosListaSharePointJobConfig', N'U') IS NULL
            BEGIN
                CREATE TABLE dbo.EmpleadosListaSharePointJobConfig
                (
                    Id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_EmpleadosListaSharePointJobConfig PRIMARY KEY,
                    CodigoJob VARCHAR(100) NOT NULL CONSTRAINT UQ_EmpleadosListaSharePointJobConfig_Codigo UNIQUE,
                    Activo BIT NOT NULL CONSTRAINT DF_EmpleadosListaSharePointJobConfig_Activo DEFAULT (0),
                    HoraEjecucion VARCHAR(5) NOT NULL CONSTRAINT DF_EmpleadosListaSharePointJobConfig_Hora DEFAULT ('04:00'),
                    CronExpression VARCHAR(100) NOT NULL CONSTRAINT DF_EmpleadosListaSharePointJobConfig_Cron DEFAULT ('0 4 * * *'),
                    TimeZone VARCHAR(100) NOT NULL CONSTRAINT DF_EmpleadosListaSharePointJobConfig_TimeZone DEFAULT ('SA Pacific Standard Time'),
                    UsuarioModificacion VARCHAR(200) NULL,
                    FechaModificacion DATETIME2(0) NOT NULL CONSTRAINT DF_EmpleadosListaSharePointJobConfig_Fecha DEFAULT (SYSUTCDATETIME())
                );
            END;
            IF NOT EXISTS (SELECT 1 FROM dbo.EmpleadosListaSharePointJobConfig WHERE CodigoJob = 'EMPLEADOS_LISTA_SHAREPOINT')
            BEGIN
                INSERT INTO dbo.EmpleadosListaSharePointJobConfig (CodigoJob, Activo, HoraEjecucion, CronExpression, TimeZone)
                VALUES ('EMPLEADOS_LISTA_SHAREPOINT', 0, '04:00', '0 4 * * *', 'SA Pacific Standard Time');
            END;
            IF OBJECT_ID(N'dbo.EmpleadosListaSharePointLog', N'U') IS NULL
            BEGIN
                CREATE TABLE dbo.EmpleadosListaSharePointLog
                (
                    Id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_EmpleadosListaSharePointLog PRIMARY KEY,
                    TipoEjecucion VARCHAR(20) NOT NULL,
                    Lista VARCHAR(255) NOT NULL,
                    CantidadRegistros INT NOT NULL CONSTRAINT DF_EmpleadosListaSharePointLog_Cant DEFAULT (0),
                    CantidadCreados INT NOT NULL CONSTRAINT DF_EmpleadosListaSharePointLog_Cre DEFAULT (0),
                    CantidadActualizados INT NOT NULL CONSTRAINT DF_EmpleadosListaSharePointLog_Act DEFAULT (0),
                    CantidadSinCambios INT NOT NULL CONSTRAINT DF_EmpleadosListaSharePointLog_Sin DEFAULT (0),
                    Estado VARCHAR(20) NOT NULL,
                    FechaInicioEjecucion DATETIMEOFFSET(0) NOT NULL,
                    FechaFinEjecucion DATETIMEOFFSET(0) NULL,
                    DuracionSegundos INT NOT NULL CONSTRAINT DF_EmpleadosListaSharePointLog_Dur DEFAULT (0),
                    Usuario VARCHAR(200) NULL,
                    Mensaje NVARCHAR(1000) NULL,
                    DetalleError NVARCHAR(MAX) NULL
                );
            END;
            """,
            cancellationToken: cancellationToken));
    }
}
