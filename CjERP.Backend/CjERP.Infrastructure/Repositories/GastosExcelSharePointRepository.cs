using CjERP.Application.DTOs;
using CjERP.Application.Interfaces.Repositories;
using CjERP.Infrastructure.Persistence.Sql;
using Dapper;
using Microsoft.Data.SqlClient;

namespace CjERP.Infrastructure.Repositories;

public sealed class GastosExcelSharePointRepository : IGastosExcelSharePointRepository
{
    private const string CodigoJob = "GASTOS_EXCEL_SHAREPOINT";
    private readonly ISqlCommandFactory _sqlCommandFactory;

    public GastosExcelSharePointRepository(ISqlCommandFactory sqlCommandFactory)
    {
        _sqlCommandFactory = sqlCommandFactory;
    }

    // Consulta de solo lectura (equivale a la rutina que se ejecutaba a mano). Tablas y columnas validadas
    // solo contra esa rutina: PENDIENTE DE VALIDACION en la BD (Planilla.CorreSite/IdProyecto/Tipo_Trabajo/IdTarea/FechaDeposito).
    private const string GastosSql = """
        SELECT CAST(a.IdSite AS NVARCHAR(100))          AS IdSite,
               CAST(b.NombreSite AS NVARCHAR(300))      AS NombreSite,
               YEAR(a.FechaDeposito)                    AS Anio,
               CAST(c.NombreProyecto AS NVARCHAR(300))  AS Proyecto,
               CAST(d.NombreCliente AS NVARCHAR(300))   AS Cliente,
               CAST(a.Tipo_Trabajo AS NVARCHAR(200))    AS Trabajo,
               CAST(f.ValorIni AS NVARCHAR(200))        AS Tarea,
               CAST(SUM(a.TotalPagar) AS DECIMAL(19,4)) AS TotalGastos,
               CAST(e.ValorIni AS NVARCHAR(100))        AS Moneda
        FROM dbo.Planilla a
        LEFT OUTER JOIN dbo.Site b ON a.IdSite = b.IdSite AND a.CorreSite = b.Correlativo
        LEFT OUTER JOIN dbo.Proyecto c ON a.IdProyecto = c.IdProyecto
        LEFT OUTER JOIN dbo.Cliente d ON a.IdCliente = d.IdCliente
        LEFT OUTER JOIN dbo.Constante e ON e.Campo = 'tipo_moneda' AND a.TipoMoneda = e.Correlativo
        LEFT OUTER JOIN dbo.Constante f ON f.Campo = 'Tarea' AND a.IdTarea = f.Correlativo
        WHERE a.IdCliente = @IdCliente AND a.Estado = @Estado
        GROUP BY a.IdSite, b.NombreSite, YEAR(a.FechaDeposito), c.NombreProyecto, d.NombreCliente,
                 e.ValorIni, f.ValorIni, a.Tipo_Trabajo
        ORDER BY a.IdSite, b.NombreSite, YEAR(a.FechaDeposito), c.NombreProyecto, d.NombreCliente;
        """;

    public async Task<IReadOnlyList<GastoExcelSharePointDto>> ObtenerGastosAsync(
        int idCliente,
        int estadoPlanilla,
        CancellationToken cancellationToken = default)
    {
        await using var connection = _sqlCommandFactory.CreateConnection();
        var rows = await connection.QueryAsync<GastoExcelSharePointDto>(
            _sqlCommandFactory.Create(
                GastosSql,
                new { IdCliente = idCliente, Estado = estadoPlanilla },
                cancellationToken: cancellationToken,
                commandTimeout: 120));
        return rows.AsList();
    }

    public async Task<GastosExcelSharePointConfigDto?> ObtenerConfiguracionAsync(CancellationToken cancellationToken = default)
    {
        await using var connection = _sqlCommandFactory.CreateConnection();
        await EnsureSchemaAsync(connection, cancellationToken);

        return await connection.QuerySingleOrDefaultAsync<GastosExcelSharePointConfigDto>(
            new CommandDefinition(
                """
                SELECT TOP 1
                    c.CodigoJob,
                    c.Activo,
                    c.HoraEjecucion,
                    c.TimeZone,
                    c.CronExpression,
                    c.IdCliente,
                    c.EstadoPlanilla,
                    l.FechaInicioEjecucion AS UltimaEjecucion,
                    l.Estado AS UltimoEstado,
                    l.CantidadRegistros AS UltimaCantidadRegistros,
                    l.Mensaje
                FROM dbo.GastosExcelSharePointJobConfig c
                OUTER APPLY (
                    SELECT TOP 1 FechaInicioEjecucion, Estado, CantidadRegistros, Mensaje
                    FROM dbo.GastosExcelSharePointLog
                    ORDER BY Id DESC
                ) l
                WHERE c.CodigoJob = @CodigoJob;
                """,
                new { CodigoJob },
                cancellationToken: cancellationToken));
    }

    public async Task GuardarConfiguracionAsync(
        GastosExcelSharePointConfigDto configuracion,
        string usuario,
        CancellationToken cancellationToken = default)
    {
        await using var connection = _sqlCommandFactory.CreateConnection();
        await EnsureSchemaAsync(connection, cancellationToken);

        await connection.ExecuteAsync(new CommandDefinition(
            """
            UPDATE dbo.GastosExcelSharePointJobConfig
            SET Activo = @Activo,
                HoraEjecucion = @HoraEjecucion,
                CronExpression = @CronExpression,
                TimeZone = @TimeZone,
                IdCliente = @IdCliente,
                EstadoPlanilla = @EstadoPlanilla,
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
                configuracion.IdCliente,
                configuracion.EstadoPlanilla,
                UsuarioModificacion = usuario
            },
            cancellationToken: cancellationToken));
    }

    public async Task<long> IniciarLogAsync(GastosExcelSharePointLogDto log, CancellationToken cancellationToken = default)
    {
        await using var connection = _sqlCommandFactory.CreateConnection();
        await EnsureSchemaAsync(connection, cancellationToken);

        return await connection.ExecuteScalarAsync<long>(new CommandDefinition(
            """
            INSERT INTO dbo.GastosExcelSharePointLog
            (TipoEjecucion, IdCliente, EstadoPlanilla, Archivo, Tabla, CantidadRegistros, Estado,
             FechaInicioEjecucion, Usuario, Mensaje)
            OUTPUT INSERTED.Id
            VALUES
            (@TipoEjecucion, @IdCliente, @EstadoPlanilla, @Archivo, @Tabla, @CantidadRegistros, @Estado,
             @FechaInicioEjecucion, @Usuario, @Mensaje);
            """,
            log,
            cancellationToken: cancellationToken));
    }

    public async Task FinalizarLogAsync(long id, GastosExcelSharePointLogDto log, CancellationToken cancellationToken = default)
    {
        await using var connection = _sqlCommandFactory.CreateConnection();
        await EnsureSchemaAsync(connection, cancellationToken);

        await connection.ExecuteAsync(new CommandDefinition(
            """
            UPDATE dbo.GastosExcelSharePointLog
            SET CantidadRegistros = @CantidadRegistros,
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
                log.Estado,
                log.FechaFinEjecucion,
                log.DuracionSegundos,
                log.Mensaje,
                log.DetalleError
            },
            cancellationToken: cancellationToken));
    }

    public async Task<IReadOnlyList<GastosExcelSharePointLogDto>> ObtenerHistorialAsync(
        int top,
        CancellationToken cancellationToken = default)
    {
        await using var connection = _sqlCommandFactory.CreateConnection();
        await EnsureSchemaAsync(connection, cancellationToken);
        var limit = Math.Clamp(top, 1, 500);

        var rows = await connection.QueryAsync<GastosExcelSharePointLogDto>(new CommandDefinition(
            $"SELECT TOP ({limit}) * FROM dbo.GastosExcelSharePointLog ORDER BY Id DESC;",
            cancellationToken: cancellationToken));
        return rows.AsList();
    }

    public async Task<GastosExcelSharePointLogDto?> ObtenerLogAsync(long id, CancellationToken cancellationToken = default)
    {
        await using var connection = _sqlCommandFactory.CreateConnection();
        await EnsureSchemaAsync(connection, cancellationToken);
        return await connection.QuerySingleOrDefaultAsync<GastosExcelSharePointLogDto>(new CommandDefinition(
            "SELECT * FROM dbo.GastosExcelSharePointLog WHERE Id = @Id;",
            new { Id = id },
            cancellationToken: cancellationToken));
    }

    // Mismo criterio que el job de asistencia: las tablas se crean solas si faltan (el script
    // Database/Reportes/02_GastosExcelSharePointJob.sql es la versión versionada del mismo esquema).
    // El job queda activo para ejecutar la exportación automáticamente todos los días.
    private static async Task EnsureSchemaAsync(SqlConnection connection, CancellationToken cancellationToken)
    {
        await connection.ExecuteAsync(new CommandDefinition(
            """
            IF OBJECT_ID(N'dbo.GastosExcelSharePointJobConfig', N'U') IS NULL
            BEGIN
                CREATE TABLE dbo.GastosExcelSharePointJobConfig
                (
                    Id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_GastosExcelSharePointJobConfig PRIMARY KEY,
                    CodigoJob VARCHAR(100) NOT NULL CONSTRAINT UQ_GastosExcelSharePointJobConfig_Codigo UNIQUE,
                    Activo BIT NOT NULL CONSTRAINT DF_GastosExcelSharePointJobConfig_Activo DEFAULT (1),
                    HoraEjecucion VARCHAR(5) NOT NULL CONSTRAINT DF_GastosExcelSharePointJobConfig_Hora DEFAULT ('03:00'),
                    CronExpression VARCHAR(100) NOT NULL CONSTRAINT DF_GastosExcelSharePointJobConfig_Cron DEFAULT ('0 3 * * *'),
                    TimeZone VARCHAR(100) NOT NULL CONSTRAINT DF_GastosExcelSharePointJobConfig_TimeZone DEFAULT ('SA Pacific Standard Time'),
                    IdCliente INT NOT NULL CONSTRAINT DF_GastosExcelSharePointJobConfig_IdCliente DEFAULT (4),
                    EstadoPlanilla INT NOT NULL CONSTRAINT DF_GastosExcelSharePointJobConfig_Estado DEFAULT (4),
                    UsuarioModificacion VARCHAR(200) NULL,
                    FechaModificacion DATETIME2(0) NOT NULL CONSTRAINT DF_GastosExcelSharePointJobConfig_Fecha DEFAULT (SYSUTCDATETIME())
                );
            END;
            IF NOT EXISTS (SELECT 1 FROM dbo.GastosExcelSharePointJobConfig WHERE CodigoJob = 'GASTOS_EXCEL_SHAREPOINT')
            BEGIN
                INSERT INTO dbo.GastosExcelSharePointJobConfig (CodigoJob, Activo, HoraEjecucion, CronExpression, TimeZone, IdCliente, EstadoPlanilla)
                VALUES ('GASTOS_EXCEL_SHAREPOINT', 1, '03:00', '0 3 * * *', 'SA Pacific Standard Time', 4, 4);
            END;
            -- Activa la configuración creada antes de habilitar la programación automática, pero solo si nadie la
            -- ha guardado todavía (UsuarioModificacion IS NULL). Esta rutina corre en cada consulta: sin esa condición
            -- reactivaría el job aunque un administrador lo desactive o cambie su hora.
            UPDATE dbo.GastosExcelSharePointJobConfig
            SET Activo = 1,
                FechaModificacion = SYSUTCDATETIME()
            WHERE CodigoJob = 'GASTOS_EXCEL_SHAREPOINT'
              AND Activo = 0
              AND UsuarioModificacion IS NULL;
            IF OBJECT_ID(N'dbo.GastosExcelSharePointLog', N'U') IS NULL
            BEGIN
                CREATE TABLE dbo.GastosExcelSharePointLog
                (
                    Id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_GastosExcelSharePointLog PRIMARY KEY,
                    TipoEjecucion VARCHAR(20) NOT NULL,
                    IdCliente INT NOT NULL,
                    EstadoPlanilla INT NOT NULL,
                    Archivo VARCHAR(255) NOT NULL,
                    Tabla VARCHAR(100) NOT NULL,
                    CantidadRegistros INT NOT NULL CONSTRAINT DF_GastosExcelSharePointLog_Cantidad DEFAULT (0),
                    Estado VARCHAR(20) NOT NULL,
                    FechaInicioEjecucion DATETIMEOFFSET(0) NOT NULL,
                    FechaFinEjecucion DATETIMEOFFSET(0) NULL,
                    DuracionSegundos INT NOT NULL CONSTRAINT DF_GastosExcelSharePointLog_Duracion DEFAULT (0),
                    Usuario VARCHAR(200) NULL,
                    Mensaje NVARCHAR(1000) NULL,
                    DetalleError NVARCHAR(MAX) NULL
                );
            END;
            """,
            cancellationToken: cancellationToken));
    }
}
