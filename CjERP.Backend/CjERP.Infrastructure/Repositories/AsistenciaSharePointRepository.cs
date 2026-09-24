using System.Data;
using CjERP.Application.DTOs;
using CjERP.Application.Interfaces.Repositories;
using CjERP.Infrastructure.Persistence.Sql;
using Dapper;
using Microsoft.Data.SqlClient;

namespace CjERP.Infrastructure.Repositories;

public sealed class AsistenciaSharePointRepository : IAsistenciaSharePointRepository
{
    private const string StoredProcedure = "dbo.sp_Asistencia_BuscarPorFechas_Job";
    private readonly ISqlCommandFactory _sqlCommandFactory;

    public AsistenciaSharePointRepository(ISqlCommandFactory sqlCommandFactory)
    {
        _sqlCommandFactory = sqlCommandFactory;
    }

    public async Task<IReadOnlyList<AsistenciaSharePointDto>> ObtenerPorFechasAsync(
        DateTime fechaInicio,
        DateTime fechaFin,
        CancellationToken cancellationToken = default)
    {
        if (fechaInicio.Date > fechaFin.Date)
        {
            throw new ArgumentException("La fecha de inicio no puede ser mayor que la fecha fin.");
        }

        await using var connection = _sqlCommandFactory.CreateConnection();
        var rows = await connection.QueryAsync<AsistenciaSharePointDto>(
            _sqlCommandFactory.Create(
                StoredProcedure,
                new
                {
                    FechaInicio = fechaInicio.Date,
                    FechaFin = fechaFin.Date
                },
                CommandType.StoredProcedure,
                cancellationToken,
                commandTimeout: 120));

        return rows.AsList();
    }

    public async Task<AsistenciaSharePointConfigDto?> ObtenerConfiguracionAsync(CancellationToken cancellationToken = default)
    {
        await using var connection = _sqlCommandFactory.CreateConnection();
        await EnsureSchemaAsync(connection, cancellationToken);

        return await connection.QuerySingleOrDefaultAsync<AsistenciaSharePointConfigDto>(
            new CommandDefinition(
                """
                SELECT TOP 1
                    c.CodigoJob,
                    c.Activo,
                    c.HoraEjecucion,
                    c.TimeZone,
                    c.CronExpression,
                    l.FechaInicioEjecucion AS UltimaEjecucion,
                    l.Estado AS UltimoEstado,
                    l.CantidadRegistros AS UltimaCantidadRegistros,
                    l.NombreArchivo AS UltimoArchivo,
                    l.Mensaje
                FROM dbo.AsistenciaSharePointJobConfig c
                OUTER APPLY (
                    SELECT TOP 1 FechaInicioEjecucion, Estado, CantidadRegistros, NombreArchivo, Mensaje
                    FROM dbo.AsistenciaSharePointExportLog
                    ORDER BY Id DESC
                ) l
                ORDER BY c.Id;
                """,
                cancellationToken: cancellationToken));
    }

    public async Task GuardarConfiguracionAsync(
        AsistenciaSharePointConfigDto configuracion,
        string usuario,
        CancellationToken cancellationToken = default)
    {
        await using var connection = _sqlCommandFactory.CreateConnection();
        await EnsureSchemaAsync(connection, cancellationToken);

        await connection.ExecuteAsync(new CommandDefinition(
            """
            UPDATE dbo.AsistenciaSharePointJobConfig
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
                configuracion.CodigoJob,
                configuracion.Activo,
                configuracion.HoraEjecucion,
                configuracion.CronExpression,
                configuracion.TimeZone,
                UsuarioModificacion = usuario
            },
            cancellationToken: cancellationToken));
    }

    public async Task<long> IniciarLogAsync(AsistenciaSharePointLogDto log, CancellationToken cancellationToken = default)
    {
        await using var connection = _sqlCommandFactory.CreateConnection();
        await EnsureSchemaAsync(connection, cancellationToken);

        return await connection.ExecuteScalarAsync<long>(new CommandDefinition(
            """
            INSERT INTO dbo.AsistenciaSharePointExportLog
            (TipoEjecucion, FechaInicio, FechaFin, NombreArchivo, CantidadRegistros, Estado,
             FechaInicioEjecucion, Usuario, Mensaje)
            OUTPUT INSERTED.Id
            VALUES
            (@TipoEjecucion, @FechaInicio, @FechaFin, @NombreArchivo, @CantidadRegistros, @Estado,
             @FechaInicioEjecucion, @Usuario, @Mensaje);
            """,
            log,
            cancellationToken: cancellationToken));
    }

    public async Task FinalizarLogAsync(long id, AsistenciaSharePointLogDto log, CancellationToken cancellationToken = default)
    {
        await using var connection = _sqlCommandFactory.CreateConnection();
        await EnsureSchemaAsync(connection, cancellationToken);

        await connection.ExecuteAsync(new CommandDefinition(
            """
            UPDATE dbo.AsistenciaSharePointExportLog
            SET CantidadRegistros = @CantidadRegistros,
                Estado = @Estado,
                FechaFinEjecucion = @FechaFinEjecucion,
                DuracionSegundos = @DuracionSegundos,
                NombreArchivo = @NombreArchivo,
                Mensaje = @Mensaje,
                DetalleError = @DetalleError
            WHERE Id = @Id;
            """,
            new
            {
                Id = id,
                log.CantidadRegistros,
                log.Estado,
                log.FechaFinEjecucion,
                log.DuracionSegundos,
                log.NombreArchivo,
                log.Mensaje,
                log.DetalleError
            },
            cancellationToken: cancellationToken));
    }

    public async Task<IReadOnlyList<AsistenciaSharePointLogDto>> ObtenerHistorialAsync(
        int top,
        CancellationToken cancellationToken = default)
    {
        await using var connection = _sqlCommandFactory.CreateConnection();
        await EnsureSchemaAsync(connection, cancellationToken);
        var limit = Math.Clamp(top, 1, 500);

        var rows = await connection.QueryAsync<AsistenciaSharePointLogDto>(new CommandDefinition(
            $"SELECT TOP ({limit}) * FROM dbo.AsistenciaSharePointExportLog ORDER BY Id DESC;",
            cancellationToken: cancellationToken));
        return rows.AsList();
    }

    public async Task<AsistenciaSharePointLogDto?> ObtenerLogAsync(long id, CancellationToken cancellationToken = default)
    {
        await using var connection = _sqlCommandFactory.CreateConnection();
        await EnsureSchemaAsync(connection, cancellationToken);
        return await connection.QuerySingleOrDefaultAsync<AsistenciaSharePointLogDto>(new CommandDefinition(
            "SELECT * FROM dbo.AsistenciaSharePointExportLog WHERE Id = @Id;",
            new { Id = id },
            cancellationToken: cancellationToken));
    }

    private static async Task EnsureSchemaAsync(SqlConnection connection, CancellationToken cancellationToken)
    {
        await connection.ExecuteAsync(new CommandDefinition(
            """
            IF OBJECT_ID(N'dbo.AsistenciaSharePointJobConfig', N'U') IS NULL
            BEGIN
                CREATE TABLE dbo.AsistenciaSharePointJobConfig
                (
                    Id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_AsistenciaSharePointJobConfig PRIMARY KEY,
                    CodigoJob VARCHAR(100) NOT NULL CONSTRAINT UQ_AsistenciaSharePointJobConfig_Codigo UNIQUE,
                    Activo BIT NOT NULL CONSTRAINT DF_AsistenciaSharePointJobConfig_Activo DEFAULT (1),
                    HoraEjecucion VARCHAR(5) NOT NULL CONSTRAINT DF_AsistenciaSharePointJobConfig_Hora DEFAULT ('02:00'),
                    CronExpression VARCHAR(100) NOT NULL CONSTRAINT DF_AsistenciaSharePointJobConfig_Cron DEFAULT ('0 2 * * *'),
                    TimeZone VARCHAR(100) NOT NULL CONSTRAINT DF_AsistenciaSharePointJobConfig_TimeZone DEFAULT ('SA Pacific Standard Time'),
                    UsuarioModificacion VARCHAR(200) NULL,
                    FechaModificacion DATETIME2(0) NOT NULL CONSTRAINT DF_AsistenciaSharePointJobConfig_Fecha DEFAULT (SYSUTCDATETIME())
                );
            END;
            IF NOT EXISTS (SELECT 1 FROM dbo.AsistenciaSharePointJobConfig WHERE CodigoJob = 'ASISTENCIA_SHAREPOINT')
            BEGIN
                INSERT INTO dbo.AsistenciaSharePointJobConfig (CodigoJob, Activo, HoraEjecucion, CronExpression, TimeZone)
                VALUES ('ASISTENCIA_SHAREPOINT', 1, '02:00', '0 2 * * *', 'SA Pacific Standard Time');
            END;
            IF OBJECT_ID(N'dbo.AsistenciaSharePointExportLog', N'U') IS NULL
            BEGIN
                CREATE TABLE dbo.AsistenciaSharePointExportLog
                (
                    Id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_AsistenciaSharePointExportLog PRIMARY KEY,
                    TipoEjecucion VARCHAR(20) NOT NULL,
                    FechaInicio DATE NOT NULL,
                    FechaFin DATE NOT NULL,
                    NombreArchivo VARCHAR(255) NOT NULL,
                    CantidadRegistros INT NOT NULL CONSTRAINT DF_AsistenciaSharePointExportLog_Cantidad DEFAULT (0),
                    Estado VARCHAR(20) NOT NULL,
                    FechaInicioEjecucion DATETIMEOFFSET(0) NOT NULL,
                    FechaFinEjecucion DATETIMEOFFSET(0) NULL,
                    DuracionSegundos INT NOT NULL CONSTRAINT DF_AsistenciaSharePointExportLog_Duracion DEFAULT (0),
                    Usuario VARCHAR(200) NULL,
                    Mensaje NVARCHAR(1000) NULL,
                    DetalleError NVARCHAR(MAX) NULL
                );
            END;
            """,
            cancellationToken: cancellationToken));
    }
}
