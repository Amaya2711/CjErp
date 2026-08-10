using System.Data;
using System.Globalization;
using CjERP.Application.DTOs.ReportesWhatsapp;
using CjERP.Application.Interfaces.Repositories;
using CjERP.Infrastructure.Persistence.Sql;
using Dapper;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Logging;

namespace CjERP.Infrastructure.Repositories;

public sealed class ReporteRepository : IReporteRepository
{
    private const string ReporteAsistenciaSp = "dbo.RptAsistenciaFechas";
    private const string EmpleadosWupSp = "dbo.sp_EmpleadoCj_Listar_Wup";
    private const string EmpleadosWupGerenciaSp = "dbo.sp_EmpleadoCj_Listar_Wup_Gerencia";
    private const string ReporteWhatsappLogTable = "dbo.ReporteWhatsAppLog";
    private const string ReporteWhatsappLogGerenciaTable = "dbo.ReporteWhatsAppLogGerencia";
    private const string ReporteWhatsappConfigTable = "dbo.ReporteWupConfig";

    private readonly ISqlCommandFactory _sqlCommandFactory;
    private readonly ILogger<ReporteRepository> _logger;

    public ReporteRepository(ISqlCommandFactory sqlCommandFactory, ILogger<ReporteRepository> logger)
    {
        _sqlCommandFactory = sqlCommandFactory;
        _logger = logger;
    }

    public async Task<ReporteWhatsappConfiguracionDto?> ObtenerConfiguracionAsync(string tipoReporte, CancellationToken cancellationToken = default)
    {
        var normalizedType = ReporteWhatsappTipos.Normalize(tipoReporte);
        await using var connection = CreateConnection();
        await EnsureReporteWupConfigSchemaAsync(connection, cancellationToken);
        var hasTipoReporteColumn = await HasColumnAsync(connection, ReporteWhatsappConfigTable, "TipoReporte", cancellationToken);
        var hasDiasEjecucionColumn = await HasColumnAsync(connection, ReporteWhatsappConfigTable, "DiasEjecucion", cancellationToken);
        var hasUsarSemanaEnCursoColumn = await HasColumnAsync(connection, ReporteWhatsappConfigTable, "UsarSemanaEnCurso", cancellationToken);
        var hasUsarMesEnCursoColumn = await HasColumnAsync(connection, ReporteWhatsappConfigTable, "UsarMesEnCurso", cancellationToken);

        var sql = hasTipoReporteColumn
            ? $"""
              SELECT TOP 1
                  TipoReporte,
                  HoraEjecucion,
                  {(hasDiasEjecucionColumn ? "DiasEjecucion," : string.Empty)}
                  {(hasUsarSemanaEnCursoColumn ? "UsarSemanaEnCurso," : string.Empty)}
                  {(hasUsarMesEnCursoColumn ? "UsarMesEnCurso," : string.Empty)}
                  CantidadEmpleadosPorBloque,
                  DelaySegundosEntreBloques,
                  Activo,
                  UsuarioModificacion,
                  FechaModificacion
              FROM dbo.ReporteWupConfig
              WHERE TipoReporte = @TipoReporte
              ORDER BY FechaModificacion DESC, HoraEjecucion DESC;
              """
            : $"""
              SELECT TOP 1
                  HoraEjecucion,
                  {(hasDiasEjecucionColumn ? "DiasEjecucion," : string.Empty)}
                  {(hasUsarSemanaEnCursoColumn ? "UsarSemanaEnCurso," : string.Empty)}
                  {(hasUsarMesEnCursoColumn ? "UsarMesEnCurso," : string.Empty)}
                  CantidadEmpleadosPorBloque,
                  DelaySegundosEntreBloques,
                  Activo,
                  UsuarioModificacion,
                  FechaModificacion
              FROM dbo.ReporteWupConfig
              ORDER BY FechaModificacion DESC, HoraEjecucion DESC;
              """;

        var rows = await connection.QueryAsync(
            new CommandDefinition(
                sql,
                hasTipoReporteColumn ? new { TipoReporte = normalizedType } : null,
                cancellationToken: cancellationToken));

        var row = rows.FirstOrDefault();
        if (row is null)
        {
            return null;
        }

        var values = ToDictionary(row);

        var tipoReporteConfigurado = GetString(values, "TipoReporte", "tipoReporte");
        var diasEjecucion = ParseDiasEjecucion(GetString(values, "DiasEjecucion", "diasEjecucion"));

        return new ReporteWhatsappConfiguracionDto
        {
            TipoReporte = string.IsNullOrWhiteSpace(tipoReporteConfigurado) ? normalizedType : tipoReporteConfigurado,
            HoraEjecucion = GetString(values, "HoraEjecucion", "horaEjecucion", "Hora", "hora"),
            DiasEjecucion = diasEjecucion,
            UsarSemanaEnCurso = hasUsarSemanaEnCursoColumn && GetBool(values, "UsarSemanaEnCurso", "usarSemanaEnCurso"),
            UsarMesEnCurso = hasUsarMesEnCursoColumn && GetBool(values, "UsarMesEnCurso", "usarMesEnCurso"),
            CantidadEmpleadosPorBloque = GetInt(values, "CantidadEmpleadosPorBloque", "cantidadEmpleadosPorBloque", "CantidadBloque", "cantidadBloque") ?? 0,
            DelaySegundosEntreBloques = GetInt(values, "DelaySegundosEntreBloques", "delaySegundosEntreBloques", "DelaySegundos", "delaySegundos") ?? 0,
            Activo = GetBool(values, "Activo", "activo", "EsActivo", "esActivo"),
            UsuarioModificacion = GetString(values, "UsuarioModificacion", "usuarioModificacion"),
            FechaModificacion = GetDateTime(values, "FechaModificacion", "fechaModificacion")
        };
    }

    public async Task ActualizarConfiguracionAsync(ReporteWhatsappConfiguracionUpdateDto request, string usuarioModificacion, CancellationToken cancellationToken = default)
    {
        var normalizedType = ReporteWhatsappTipos.Normalize(request.TipoReporte);
        await using var connection = CreateConnection();
        await EnsureReporteWupConfigSchemaAsync(connection, cancellationToken);
        var hasTipoReporteColumn = await HasColumnAsync(connection, ReporteWhatsappConfigTable, "TipoReporte", cancellationToken);
        var hasDiasEjecucionColumn = await HasColumnAsync(connection, ReporteWhatsappConfigTable, "DiasEjecucion", cancellationToken);
        var hasUsarSemanaEnCursoColumn = await HasColumnAsync(connection, ReporteWhatsappConfigTable, "UsarSemanaEnCurso", cancellationToken);
        var hasUsarMesEnCursoColumn = await HasColumnAsync(connection, ReporteWhatsappConfigTable, "UsarMesEnCurso", cancellationToken);
        var diasEjecucion = SerializeDiasEjecucion(request.DiasEjecucion);

        var sql = hasTipoReporteColumn
            ? $"""
              IF OBJECT_ID('dbo.ReporteWupConfig', 'U') IS NOT NULL
              BEGIN
                  IF EXISTS (SELECT 1 FROM dbo.ReporteWupConfig WHERE TipoReporte = @TipoReporte)
                  BEGIN
                      UPDATE dbo.ReporteWupConfig
                      SET HoraEjecucion = @HoraEjecucion,
                          {(hasDiasEjecucionColumn ? "DiasEjecucion = @DiasEjecucion," : string.Empty)}
                          {(hasUsarSemanaEnCursoColumn ? "UsarSemanaEnCurso = @UsarSemanaEnCurso," : string.Empty)}
                          {(hasUsarMesEnCursoColumn ? "UsarMesEnCurso = @UsarMesEnCurso," : string.Empty)}
                          CantidadEmpleadosPorBloque = @CantidadEmpleadosPorBloque,
                          DelaySegundosEntreBloques = @DelaySegundosEntreBloques,
                          Activo = @Activo,
                          UsuarioModificacion = @UsuarioModificacion,
                          FechaModificacion = GETDATE()
                      WHERE TipoReporte = @TipoReporte;
                  END
                  ELSE
                  BEGIN
                      INSERT INTO dbo.ReporteWupConfig
                      (
                          TipoReporte,
                          HoraEjecucion,
                          {(hasDiasEjecucionColumn ? "DiasEjecucion," : string.Empty)}
                          {(hasUsarSemanaEnCursoColumn ? "UsarSemanaEnCurso," : string.Empty)}
                          {(hasUsarMesEnCursoColumn ? "UsarMesEnCurso," : string.Empty)}
                          CantidadEmpleadosPorBloque,
                          DelaySegundosEntreBloques,
                          Activo,
                          UsuarioModificacion,
                          FechaModificacion
                      )
                      VALUES
                      (
                          @TipoReporte,
                          @HoraEjecucion,
                          {(hasDiasEjecucionColumn ? "@DiasEjecucion," : string.Empty)}
                          {(hasUsarSemanaEnCursoColumn ? "@UsarSemanaEnCurso," : string.Empty)}
                          {(hasUsarMesEnCursoColumn ? "@UsarMesEnCurso," : string.Empty)}
                          @CantidadEmpleadosPorBloque,
                          @DelaySegundosEntreBloques,
                          @Activo,
                          @UsuarioModificacion,
                          GETDATE()
                      );
                  END;
                  RETURN;
              END;

              THROW 50000, 'No existe la tabla dbo.ReporteWupConfig para la configuracion de Reporte WUP.', 1;
              """
            : $"""
              IF OBJECT_ID('dbo.ReporteWupConfig', 'U') IS NOT NULL
              BEGIN
                  IF EXISTS (SELECT 1 FROM dbo.ReporteWupConfig)
                  BEGIN
                      UPDATE dbo.ReporteWupConfig
                      SET HoraEjecucion = @HoraEjecucion,
                          {(hasDiasEjecucionColumn ? "DiasEjecucion = @DiasEjecucion," : string.Empty)}
                          {(hasUsarSemanaEnCursoColumn ? "UsarSemanaEnCurso = @UsarSemanaEnCurso," : string.Empty)}
                          {(hasUsarMesEnCursoColumn ? "UsarMesEnCurso = @UsarMesEnCurso," : string.Empty)}
                          CantidadEmpleadosPorBloque = @CantidadEmpleadosPorBloque,
                          DelaySegundosEntreBloques = @DelaySegundosEntreBloques,
                          Activo = @Activo,
                          UsuarioModificacion = @UsuarioModificacion,
                          FechaModificacion = GETDATE();
                  END
                  ELSE
                  BEGIN
                      INSERT INTO dbo.ReporteWupConfig
                      (
                          HoraEjecucion,
                          {(hasDiasEjecucionColumn ? "DiasEjecucion," : string.Empty)}
                          {(hasUsarSemanaEnCursoColumn ? "UsarSemanaEnCurso," : string.Empty)}
                          {(hasUsarMesEnCursoColumn ? "UsarMesEnCurso," : string.Empty)}
                          CantidadEmpleadosPorBloque,
                          DelaySegundosEntreBloques,
                          Activo,
                          UsuarioModificacion,
                          FechaModificacion
                      )
                      VALUES
                      (
                          @HoraEjecucion,
                          {(hasDiasEjecucionColumn ? "@DiasEjecucion," : string.Empty)}
                          {(hasUsarSemanaEnCursoColumn ? "@UsarSemanaEnCurso," : string.Empty)}
                          {(hasUsarMesEnCursoColumn ? "@UsarMesEnCurso," : string.Empty)}
                          @CantidadEmpleadosPorBloque,
                          @DelaySegundosEntreBloques,
                          @Activo,
                          @UsuarioModificacion,
                          GETDATE()
                      );
                  END;
                  RETURN;
              END;

              THROW 50000, 'No existe la tabla dbo.ReporteWupConfig para la configuracion de Reporte WUP.', 1;
              """;

        await connection.ExecuteAsync(
            new CommandDefinition(
                sql,
                new
                {
                    TipoReporte = normalizedType,
                    request.HoraEjecucion,
                    DiasEjecucion = diasEjecucion,
                    request.UsarSemanaEnCurso,
                    request.UsarMesEnCurso,
                    request.CantidadEmpleadosPorBloque,
                    request.DelaySegundosEntreBloques,
                    request.Activo,
                    UsuarioModificacion = usuarioModificacion
                },
                cancellationToken: cancellationToken));
    }

    public async Task<IReadOnlyList<ReporteWhatsappEmpleadoDto>> ObtenerEmpleadosDestinoAsync(string tipoReporte, CancellationToken cancellationToken = default)
    {
        var storedProcedure = ReporteWhatsappTipos.IsGerencial(tipoReporte)
            ? EmpleadosWupGerenciaSp
            : EmpleadosWupSp;

        await using var connection = CreateConnection();
        var rows = await connection.QueryAsync(
            new CommandDefinition(
                storedProcedure,
                commandType: CommandType.StoredProcedure,
                cancellationToken: cancellationToken));

        var empleados = rows.Select(MapEmpleado).ToList();
        await EnrichEmpleadoDocumentsAsync(connection, empleados, cancellationToken);
        return empleados;
    }

    public async Task<IReadOnlyList<ReporteWhatsappEmpleadoDto>> ObtenerEmpleadosReporteGerencialAsync(CancellationToken cancellationToken = default)
    {
        await using var connection = CreateConnection();
        var rows = await connection.QueryAsync(
            new CommandDefinition(
                EmpleadosWupSp,
                commandType: CommandType.StoredProcedure,
                cancellationToken: cancellationToken));

        return rows.Select(MapEmpleado).ToList();
    }

    public async Task<IReadOnlyList<ReporteWhatsappEmpleadoDto>> ObtenerEmpleadosFallidosAsync(DateTime fechaProceso, string tipoReporte, CancellationToken cancellationToken = default)
    {
        var logTable = GetLogTableName(tipoReporte);
        if (!await ExisteTablaLogAsync(tipoReporte, cancellationToken))
        {
            return Array.Empty<ReporteWhatsappEmpleadoDto>();
        }

        var sql = $"""
        SELECT DISTINCT
            l.IdEmpleado,
            l.Usuario,
            l.Telefono,
            l.Usuario AS NombreEmpleado
        FROM {logTable} l
        WHERE CAST(l.FechaProceso AS date) = @FechaProceso
          AND l.TipoReporte = @TipoReporte
          AND l.EstadoEnvio <> 'ENVIADO'
          AND NOT EXISTS
          (
              SELECT 1
              FROM {logTable} ok
              WHERE ok.IdEmpleado = l.IdEmpleado
                AND CAST(ok.FechaProceso AS date) = CAST(l.FechaProceso AS date)
                AND ok.TipoReporte = l.TipoReporte
                AND ok.EstadoEnvio = 'ENVIADO'
          )
        ORDER BY l.Usuario;
        """;

        await using var connection = CreateConnection();
        var rows = await connection.QueryAsync<ReporteWhatsappEmpleadoDto>(
            new CommandDefinition(
                sql,
                new
                {
                    FechaProceso = fechaProceso.Date,
                    TipoReporte = ReporteWhatsappTipos.Normalize(tipoReporte)
                },
                cancellationToken: cancellationToken));

        return rows.ToList();
    }

    public async Task<ReporteWhatsappEmpleadoDto?> ObtenerEmpleadoPorTelefonoAsync(string telefono, CancellationToken cancellationToken = default)
    {
        var telefonoNormalizado = NormalizePhone(telefono);
        if (string.IsNullOrWhiteSpace(telefonoNormalizado))
        {
            return null;
        }

        var empleados = await ObtenerEmpleadosDestinoAsync(ReporteWhatsappTipos.Operativo, cancellationToken);
        return empleados.FirstOrDefault(x => string.Equals(NormalizePhone(x.Telefono), telefonoNormalizado, StringComparison.Ordinal));
    }

    public async Task<IReadOnlyList<ReporteWhatsappBoletaDestinoDto>> ObtenerBoletasDestinoAsync(string periodo, CancellationToken cancellationToken = default)
    {
        await using var connection = CreateConnection();
        if (!await HasTableAsync(connection, "dbo.PlanillaBoletaCabecera", cancellationToken))
        {
            return Array.Empty<ReporteWhatsappBoletaDestinoDto>();
        }

        var hasIdActivoColumn = await HasColumnAsync(connection, "dbo.PlanillaBoletaCabecera", "IdActivo", cancellationToken);
        var hasNumeroDocumentoColumn = await HasColumnAsync(connection, "dbo.PlanillaBoletaCabecera", "NumeroDocumento", cancellationToken);
        var hasNroDocumentoColumn = !hasNumeroDocumentoColumn &&
                                    await HasColumnAsync(connection, "dbo.PlanillaBoletaCabecera", "NroDocumento", cancellationToken);
        var hasNombreTrabajadorColumn = await HasColumnAsync(connection, "dbo.PlanillaBoletaCabecera", "NombreTrabajador", cancellationToken);
        var hasPdfTable = await HasTableAsync(connection, "dbo.PlanillaBoletaPdf", cancellationToken);
        var hasPdfIdColumn = hasPdfTable && await HasColumnAsync(connection, "dbo.PlanillaBoletaPdf", "IdPdf", cancellationToken);
        var hasPdfArchivoBase64Column = hasPdfTable && await HasColumnAsync(connection, "dbo.PlanillaBoletaPdf", "ArchivoBase64", cancellationToken);

        var numeroDocumentoSelect = hasNumeroDocumentoColumn
            ? "cab.NumeroDocumento"
            : hasNroDocumentoColumn
                ? "cab.NroDocumento AS NumeroDocumento"
                : "CAST('' AS nvarchar(50)) AS NumeroDocumento";

        var nombreTrabajadorSelect = hasNombreTrabajadorColumn
            ? "cab.NombreTrabajador"
            : "CAST('' AS nvarchar(200)) AS NombreTrabajador";

        var pdfDisponibleSelect = hasPdfTable && hasPdfIdColumn && hasPdfArchivoBase64Column
            ? """
              CASE
                  WHEN pdf.IdPdf IS NOT NULL AND LEN(LTRIM(RTRIM(ISNULL(pdf.ArchivoBase64, '')))) > 0 THEN CAST(1 AS bit)
                  ELSE CAST(0 AS bit)
              END AS PdfDisponible
              """
            : "CAST(0 AS bit) AS PdfDisponible";

        var pdfJoin = hasPdfTable
            ? """
              LEFT JOIN dbo.PlanillaBoletaPdf pdf
                  ON pdf.IdBoleta = cab.IdBoleta
              """
            : string.Empty;

        var idActivoFilter = hasIdActivoColumn
            ? "AND ISNULL(cab.IdActivo, 1) = 1"
            : string.Empty;

        var periodoTokens = BuildPeriodoTokens(periodo);

        var sql = $"""
        SELECT
            cab.IdBoleta,
            cab.Periodo,
            {numeroDocumentoSelect},
            {nombreTrabajadorSelect},
            {pdfDisponibleSelect}
        FROM dbo.PlanillaBoletaCabecera cab
        {pdfJoin}
        WHERE REPLACE(REPLACE(LTRIM(RTRIM(ISNULL(cab.Periodo, ''))), '-', ''), '/', '') IN @PeriodoTokens
          {idActivoFilter}
        ORDER BY NombreTrabajador, NumeroDocumento;
        """;

        var rows = await connection.QueryAsync(
            new CommandDefinition(
                sql,
                new { PeriodoTokens = periodoTokens },
                cancellationToken: cancellationToken));

        return rows.Select(MapBoletaDestino).ToList();
    }

    public async Task<IReadOnlyList<ReporteWhatsappAsistenciaItemDto>> ObtenerReporteAsistenciaAsync(string fechaInicio, string fechaFin, int idEmpleado, CancellationToken cancellationToken = default)
    {
        await using var connection = CreateConnection();

        var parameters = new DynamicParameters();
        parameters.Add("@FechaInicio", fechaInicio, DbType.String);
        parameters.Add("@FechaFin", fechaFin, DbType.String);

        var hasIdEmpleadoParameter = await HasStoredProcedureParameterAsync(
            connection,
            ReporteAsistenciaSp,
            "@IdEmpleado",
            cancellationToken);

        if (hasIdEmpleadoParameter)
        {
            parameters.Add("@IdEmpleado", idEmpleado, DbType.Int32);
        }

        _logger.LogInformation(
            "[ReporteRepository] Ejecutando {StoredProcedure}. FechaInicio={FechaInicio}, FechaFin={FechaFin}, IdEmpleado={IdEmpleado}, HasIdEmpleadoParameter={HasIdEmpleadoParameter}",
            ReporteAsistenciaSp,
            fechaInicio,
            fechaFin,
            hasIdEmpleadoParameter ? idEmpleado : null,
            hasIdEmpleadoParameter);

        var rows = await connection.QueryAsync(
            new CommandDefinition(
                ReporteAsistenciaSp,
                parameters,
                commandType: CommandType.StoredProcedure,
                cancellationToken: cancellationToken));

        var mapped = rows.Select(MapReporte).ToList();
        return hasIdEmpleadoParameter
            ? mapped
            : mapped.Where(x => x.IdEmpleado == idEmpleado).ToList();
    }

    public async Task<IReadOnlyList<ReporteWhatsappAsistenciaItemDto>> ObtenerReporteAsistenciaPeriodoAsync(string fechaInicio, string fechaFin, CancellationToken cancellationToken = default)
    {
        await using var connection = CreateConnection();

        var parameters = new DynamicParameters();
        parameters.Add("@FechaInicio", fechaInicio, DbType.String);
        parameters.Add("@FechaFin", fechaFin, DbType.String);

        _logger.LogInformation(
            "[ReporteRepository] Ejecutando {StoredProcedure}. FechaInicio={FechaInicio}, FechaFin={FechaFin}, IdEmpleado=NULL, HasIdEmpleadoParameter=false, Contexto=PeriodoCompletoGerencial",
            ReporteAsistenciaSp,
            fechaInicio,
            fechaFin);

        var rows = await connection.QueryAsync(
            new CommandDefinition(
                ReporteAsistenciaSp,
                parameters,
                commandType: CommandType.StoredProcedure,
                cancellationToken: cancellationToken));

        return rows.Select(MapReporte).ToList();
    }

    public async Task<bool> ExisteEnvioExitosoAsync(int idEmpleado, DateTime fechaProceso, string tipoReporte, CancellationToken cancellationToken = default)
    {
        var logTable = GetLogTableName(tipoReporte);
        if (!await ExisteTablaLogAsync(tipoReporte, cancellationToken))
        {
            return false;
        }

        var sql = $"""
        SELECT TOP 1 1
        FROM {logTable}
        WHERE IdEmpleado = @IdEmpleado
          AND CAST(FechaProceso AS date) = @FechaProceso
          AND TipoReporte = @TipoReporte
          AND EstadoEnvio = 'ENVIADO';
        """;

        await using var connection = CreateConnection();
        var result = await connection.QueryFirstOrDefaultAsync<int?>(
            new CommandDefinition(
                sql,
                new
                {
                    IdEmpleado = idEmpleado,
                    FechaProceso = fechaProceso.Date,
                    TipoReporte = ReporteWhatsappTipos.Normalize(tipoReporte)
                },
                cancellationToken: cancellationToken));

        return result.HasValue;
    }

    public async Task<bool> ExisteEnvioHoyAsync(int idEmpleado, DateTime fechaReferencia, string tipoReporte, CancellationToken cancellationToken = default)
    {
        var logTable = GetLogTableName(tipoReporte);
        if (!await ExisteTablaLogAsync(tipoReporte, cancellationToken))
        {
            return false;
        }

        var sql = $"""
        SELECT TOP 1 1
        FROM {logTable}
        WHERE IdEmpleado = @IdEmpleado
          AND CAST(FechaEnvio AS date) = @FechaReferencia
          AND TipoReporte = @TipoReporte
          AND EstadoEnvio IN ('ENVIADO', 'ENVIADO_EMAIL');
        """;

        await using var connection = CreateConnection();
        var result = await connection.QueryFirstOrDefaultAsync<int?>(
            new CommandDefinition(
                sql,
                new
                {
                    IdEmpleado = idEmpleado,
                    FechaReferencia = fechaReferencia.Date,
                    TipoReporte = ReporteWhatsappTipos.Normalize(tipoReporte)
                },
                cancellationToken: cancellationToken));

        return result.HasValue;
    }

    public async Task<IReadOnlyList<int>> ObtenerEnviosHoyAsync(IReadOnlyList<int> idsEmpleado, DateTime fechaReferencia, string tipoReporte, CancellationToken cancellationToken = default)
    {
        if (idsEmpleado is null || idsEmpleado.Count == 0)
        {
            return Array.Empty<int>();
        }

        var idsValidos = idsEmpleado.Where(id => id > 0).Distinct().ToArray();
        if (idsValidos.Length == 0)
        {
            return Array.Empty<int>();
        }

        var logTable = GetLogTableName(tipoReporte);
        if (!await ExisteTablaLogAsync(tipoReporte, cancellationToken))
        {
            return Array.Empty<int>();
        }

        var sql = $"""
        SELECT DISTINCT IdEmpleado
        FROM {logTable}
        WHERE IdEmpleado IN @IdsEmpleado
          AND CAST(FechaEnvio AS date) = @FechaReferencia
          AND TipoReporte = @TipoReporte
          AND EstadoEnvio IN ('ENVIADO', 'ENVIADO_EMAIL');
        """;

        await using var connection = CreateConnection();
        var rows = await connection.QueryAsync<int>(
            new CommandDefinition(
                sql,
                new
                {
                    IdsEmpleado = idsValidos,
                    FechaReferencia = fechaReferencia.Date,
                    TipoReporte = ReporteWhatsappTipos.Normalize(tipoReporte)
                },
                cancellationToken: cancellationToken));

        return rows.Distinct().ToList();
    }

    public async Task InsertarLogAsync(ReporteWhatsappLogDto log, CancellationToken cancellationToken = default)
    {
        var logTable = GetLogTableName(log.TipoReporte);
        if (!await ExisteTablaLogAsync(log.TipoReporte, cancellationToken))
        {
            throw new InvalidOperationException($"No existe la tabla {logTable}. Ejecute el script SQL del modulo antes de procesar envios WUP.");
        }

        var sql = $"""
        INSERT INTO {logTable}
        (
            IdEmpleado,
            Usuario,
            Telefono,
            FechaProceso,
            TipoReporte,
            EstadoEnvio,
            MensajeError,
            FechaEnvio,
            RequestJson,
            ResponseJson,
            NumeroBloque,
            OrdenEnvio,
            TiempoEsperaEntreBloques,
            DuracionEnvioSegundos,
            OrigenEjecucion,
            UsuarioEjecucion
        )
        VALUES
        (
            @IdEmpleado,
            @Usuario,
            @Telefono,
            @FechaProceso,
            @TipoReporte,
            @EstadoEnvio,
            @MensajeError,
            @FechaEnvio,
            @RequestJson,
            @ResponseJson,
            @NumeroBloque,
            @OrdenEnvio,
            @TiempoEsperaEntreBloques,
            @DuracionEnvioSegundos,
            @OrigenEjecucion,
            @UsuarioEjecucion
        );
        """;

        await using var connection = CreateConnection();
        await connection.ExecuteAsync(
            new CommandDefinition(
                sql,
                log,
                cancellationToken: cancellationToken));
    }

    public async Task<IReadOnlyList<ReporteWhatsappLogDto>> ObtenerLogsAsync(DateTime? fechaProceso, string tipoReporte, int top, CancellationToken cancellationToken = default)
    {
        var logTable = GetLogTableName(tipoReporte);
        if (!await ExisteTablaLogAsync(tipoReporte, cancellationToken))
        {
            return Array.Empty<ReporteWhatsappLogDto>();
        }

        var sql = $"""
        SELECT TOP (@Top)
            l.IdLog,
            l.IdEmpleado,
            l.Usuario,
            l.Telefono,
            l.FechaProceso,
            l.TipoReporte,
            l.EstadoEnvio,
            l.MensajeError,
            l.FechaEnvio,
            l.RequestJson,
            l.ResponseJson,
            l.NumeroBloque,
            l.OrdenEnvio,
            l.TiempoEsperaEntreBloques,
            l.DuracionEnvioSegundos,
            l.OrigenEjecucion,
            l.UsuarioEjecucion,
            l.Usuario AS NombreEmpleado
        FROM {logTable} l
        WHERE (@FechaProceso IS NULL OR CAST(l.FechaProceso AS date) = @FechaProceso)
          AND l.TipoReporte = @TipoReporte
        ORDER BY l.IdLog DESC;
        """;

        await using var connection = CreateConnection();
        var rows = await connection.QueryAsync<ReporteWhatsappLogDto>(
            new CommandDefinition(
                sql,
                new
                {
                    Top = top,
                    FechaProceso = fechaProceso?.Date,
                    TipoReporte = ReporteWhatsappTipos.Normalize(tipoReporte)
                },
                cancellationToken: cancellationToken));

        return rows.ToList();
    }

    public async Task<ReporteWhatsappKpiDto> ObtenerKpisAsync(DateTime? fechaProceso, string tipoReporte, CancellationToken cancellationToken = default)
    {
        var logTable = GetLogTableName(tipoReporte);
        if (!await ExisteTablaLogAsync(tipoReporte, cancellationToken))
        {
            return new ReporteWhatsappKpiDto();
        }

        var sql = $"""
        SELECT
            COUNT(1) AS TotalProcesados,
            SUM(CASE WHEN EstadoEnvio = 'ENVIADO' THEN 1 ELSE 0 END) AS TotalEnviados,
            SUM(CASE WHEN EstadoEnvio LIKE 'ERROR%' THEN 1 ELSE 0 END) AS TotalErrores,
            SUM(CASE WHEN EstadoEnvio LIKE 'OMITIDO%' THEN 1 ELSE 0 END) AS TotalOmitidos,
            SUM(CASE WHEN EstadoEnvio = 'DUPLICADO_OMITIDO' THEN 1 ELSE 0 END) AS TotalDuplicados,
            SUM(CASE WHEN EstadoEnvio <> 'ENVIADO' THEN 1 ELSE 0 END) AS TotalPendientesRetry
        FROM {logTable}
        WHERE (@FechaProceso IS NULL OR CAST(FechaProceso AS date) = @FechaProceso)
          AND TipoReporte = @TipoReporte;
        """;

        await using var connection = CreateConnection();
        var result = await connection.QueryFirstOrDefaultAsync<ReporteWhatsappKpiDto>(
            new CommandDefinition(
                sql,
                new
                {
                    FechaProceso = fechaProceso?.Date,
                    TipoReporte = ReporteWhatsappTipos.Normalize(tipoReporte)
                },
                cancellationToken: cancellationToken));

        return result ?? new ReporteWhatsappKpiDto();
    }

    public async Task<bool> UsuarioTieneAccesoAdministrativoAsync(string idUsuario, IEnumerable<string> rolesPermitidos, CancellationToken cancellationToken = default)
    {
        var roles = rolesPermitidos
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Select(x => x.Trim().ToUpperInvariant())
            .Distinct()
            .ToArray();

        if (roles.Length == 0 || string.IsNullOrWhiteSpace(idUsuario))
        {
            return false;
        }

        const string sql = """
        SELECT TOP 1 1
        FROM dbo.SegUsuarioPerfilRol upr
        INNER JOIN dbo.SegPerfilRol pr
            ON upr.IdPerfilRol = pr.IdPerfilRol
        INNER JOIN dbo.SegRol r
            ON pr.IdRol = r.IdRol
        WHERE upr.IdUsuario = @IdUsuario
          AND ISNULL(upr.EsActivo, 1) = 1
          AND ISNULL(pr.EsActivo, 1) = 1
          AND ISNULL(r.EsActivo, 1) = 1
          AND UPPER(LTRIM(RTRIM(r.NombreRol))) IN @Roles;
        """;

        await using var connection = CreateConnection();
        var result = await connection.QueryFirstOrDefaultAsync<int?>(
            new CommandDefinition(
                sql,
                new
                {
                    IdUsuario = idUsuario.Trim(),
                    Roles = roles
                },
                cancellationToken: cancellationToken));

        return result.HasValue;
    }

    private SqlConnection CreateConnection() => _sqlCommandFactory.CreateConnection();

    private static async Task EnsureReporteWupConfigSchemaAsync(SqlConnection connection, CancellationToken cancellationToken)
    {
        const string sql = """
        IF OBJECT_ID('dbo.ReporteWupConfig', 'U') IS NULL
            RETURN;

        IF COL_LENGTH('dbo.ReporteWupConfig', 'TipoReporte') IS NULL
        BEGIN
            ALTER TABLE dbo.ReporteWupConfig
            ADD TipoReporte nvarchar(50) NULL;

            EXEC sp_executesql N'
                UPDATE dbo.ReporteWupConfig
                SET TipoReporte = @TipoReporte
                WHERE TipoReporte IS NULL OR LTRIM(RTRIM(TipoReporte)) = '''';
            ', N'@TipoReporte nvarchar(50)', @TipoReporte = N'ASISTENCIA_WUP';
        END;

        IF COL_LENGTH('dbo.ReporteWupConfig', 'DiasEjecucion') IS NULL
        BEGIN
            ALTER TABLE dbo.ReporteWupConfig
            ADD DiasEjecucion nvarchar(200) NULL;
        END;

        IF COL_LENGTH('dbo.ReporteWupConfig', 'UsarSemanaEnCurso') IS NULL
        BEGIN
            ALTER TABLE dbo.ReporteWupConfig
            ADD UsarSemanaEnCurso bit NULL;
        END;

        IF COL_LENGTH('dbo.ReporteWupConfig', 'UsarMesEnCurso') IS NULL
        BEGIN
            ALTER TABLE dbo.ReporteWupConfig
            ADD UsarMesEnCurso bit NULL;
        END;
        """;

        await connection.ExecuteAsync(
            new CommandDefinition(
                sql,
                cancellationToken: cancellationToken));

        const string backfillSql = """
        IF COL_LENGTH('dbo.ReporteWupConfig', 'UsarSemanaEnCurso') IS NOT NULL
        BEGIN
            UPDATE dbo.ReporteWupConfig
            SET UsarSemanaEnCurso = CASE
                WHEN UPPER(LTRIM(RTRIM(ISNULL(TipoReporte, '')))) = 'ASISTENCIA_WUP_GERENCIAL' THEN 1
                ELSE 0
            END
            WHERE UsarSemanaEnCurso IS NULL;
        END;

        IF COL_LENGTH('dbo.ReporteWupConfig', 'UsarMesEnCurso') IS NOT NULL
        BEGIN
            UPDATE dbo.ReporteWupConfig
            SET UsarMesEnCurso = 0
            WHERE UsarMesEnCurso IS NULL;
        END;
        """;

        await connection.ExecuteAsync(
            new CommandDefinition(
                backfillSql,
                cancellationToken: cancellationToken));
    }

    private async Task<bool> ExisteTablaLogAsync(string tipoReporte, CancellationToken cancellationToken)
    {
        await using var connection = CreateConnection();
        return await HasTableAsync(connection, GetLogTableName(tipoReporte), cancellationToken);
    }

    private static string GetLogTableName(string tipoReporte) =>
        ReporteWhatsappTipos.IsGerencial(tipoReporte)
            ? ReporteWhatsappLogGerenciaTable
            : ReporteWhatsappLogTable;

    private static async Task<bool> HasTableAsync(SqlConnection connection, string tableName, CancellationToken cancellationToken)
    {
        const string sql = """
        SELECT CASE WHEN OBJECT_ID(@TableName, 'U') IS NOT NULL THEN 1 ELSE 0 END;
        """;

        var exists = await connection.ExecuteScalarAsync<int>(
            new CommandDefinition(
                sql,
                new { TableName = tableName },
                cancellationToken: cancellationToken));

        return exists == 1;
    }

    private static async Task<bool> HasColumnAsync(SqlConnection connection, string tableName, string columnName, CancellationToken cancellationToken)
    {
        const string sql = """
        SELECT CASE WHEN COL_LENGTH(@TableName, @ColumnName) IS NOT NULL THEN 1 ELSE 0 END;
        """;

        var exists = await connection.ExecuteScalarAsync<int>(
            new CommandDefinition(
                sql,
                new { TableName = tableName, ColumnName = columnName },
                cancellationToken: cancellationToken));

        return exists == 1;
    }

    private static async Task<bool> HasStoredProcedureParameterAsync(SqlConnection connection, string procedureName, string parameterName, CancellationToken cancellationToken)
    {
        const string sql = """
        SELECT CASE WHEN EXISTS
        (
            SELECT 1
            FROM sys.parameters p
            INNER JOIN sys.objects o
                ON p.object_id = o.object_id
            WHERE o.object_id = OBJECT_ID(@ProcedureName)
              AND p.name = @ParameterName
        )
        THEN 1 ELSE 0 END;
        """;

        var exists = await connection.ExecuteScalarAsync<int>(
            new CommandDefinition(
                sql,
                new
                {
                    ProcedureName = procedureName,
                    ParameterName = parameterName
                },
                cancellationToken: cancellationToken));

        return exists == 1;
    }

    private static ReporteWhatsappEmpleadoDto MapEmpleado(dynamic row)
    {
        var values = ToDictionary(row);

        return new ReporteWhatsappEmpleadoDto
        {
            IdEmpleado = GetInt(values, "IdEmpleado", "idEmpleado", "CodEmp", "codEmp") ?? 0,
            Usuario = GetString(values, "Usuario", "usuario", "IdUsuario", "idUsuario", "NombreEmpleado", "nombreEmpleado"),
            NombreEmpleado = GetString(values, "NombreEmpleado", "nombreEmpleado", "Usuario", "usuario"),
            Correo = GetString(values, "Correo", "correo", "Email", "email"),
            Telefono = GetString(values, "Telefono", "telefono", "Celular", "celular", "TelefonoWup", "telefonoWup"),
            Ubicacion = GetString(values, "Ubicacion", "ubicacion", "ValorIni", "valorini", "Sede", "sede"),
            NumeroDocumento = GetString(values, "NroDocumento", "NumeroDocumento", "Documento", "nroDocumento")
        };
    }

    private static ReporteWhatsappBoletaDestinoDto MapBoletaDestino(dynamic row)
    {
        var values = ToDictionary(row);

        return new ReporteWhatsappBoletaDestinoDto
        {
            IdBoleta = GetInt(values, "IdBoleta", "idBoleta"),
            Periodo = GetString(values, "Periodo", "periodo"),
            NumeroDocumento = GetString(values, "NumeroDocumento", "numeroDocumento", "NroDocumento"),
            NombreTrabajador = GetString(values, "NombreTrabajador", "nombreTrabajador"),
            PdfDisponible = GetBool(values, "PdfDisponible", "pdfDisponible")
        };
    }

    private static ReporteWhatsappAsistenciaItemDto MapReporte(dynamic row)
    {
        var values = ToDictionary(row);
        var totalHoras = GetDecimal(values, "TotalHoras", "totalHoras");
        var totalHorasEmpleado = GetDecimal(values, "TotalHorasEmpleado", "totalHorasEmpleado");
        var totalHorasLaborales = GetDecimal(values, "TotalHorasLaborales", "totalHorasLaborales", "HorasObjetivo", "horasObjetivo", "HorasProgramadas", "horasProgramadas");
        var diferenciaHoras = GetDecimal(values, "DiferenciaHoras", "diferenciaHoras");
        var estadoValidacionHoras = GetString(values, "EstadoValidacionHoras", "estadoValidacionHoras");

        return new ReporteWhatsappAsistenciaItemDto
        {
            IdEmpleado = GetInt(values, "IdEmpleado", "idEmpleado", "CodEmp", "codEmp") ?? 0,
            IdEstado = GetInt(values, "IdEstado", "idEstado", "Id_Estado", "id_estado"),
            Fecha = GetDateText(values, "Fecha", "fecha"),
            NombreEmpleado = GetString(values, "NombreEmpleado", "nombreEmpleado", "nombreempleado"),
            Responsable = GetString(values, "Responsable", "responsable"),
            Estado = GetString(values, "Estado", "estado"),
            EstadoMarcacionTexto = GetString(values, "EstadoMarcacionTexto", "estadoMarcacionTexto", "Estado", "estado"),
            Ubicacion = GetString(values, "Ubicacion", "ubicacion", "ValorIni", "valorini"),
            HoraEntrada = GetTimeText(values, "HoraEntrada", "horaEntrada", "Hora", "hora"),
            HoraSalida = GetTimeText(values, "HoraSalida", "horaSalida", "Salida", "salida"),
            TiempoHoras = GetString(values, "TiempoHoras", "tiempoHoras", "TiempoTrabajado", "tiempoTrabajado"),
            TotalHoras = totalHoras,
            TotalHorasFaltaIncompleto = GetDecimal(values, "TotalHorasFaltaIncompleto", "totalHorasFaltaIncompleto"),
            TotalHorasEmpleado = totalHorasEmpleado,
            TotalHorasLaborales = totalHorasLaborales,
            TotalHorasFaltaAprobar = GetDecimal(values, "TotalHorasFaltaAprobar", "totalHorasFaltaAprobar"),
            DiferenciaHoras = diferenciaHoras,
            EstadoValidacionHoras = estadoValidacionHoras,
            Observacion = GetString(values, "Observacion", "observacion", "Comentario", "comentario")
        };
    }

    private async Task EnrichEmpleadoDocumentsAsync(
        SqlConnection connection,
        List<ReporteWhatsappEmpleadoDto> empleados,
        CancellationToken cancellationToken)
    {
        var missingDocumentIds = empleados
            .Where(x => x.IdEmpleado > 0 && string.IsNullOrWhiteSpace(x.NumeroDocumento))
            .Select(x => x.IdEmpleado)
            .Distinct()
            .ToArray();

        if (missingDocumentIds.Length == 0)
        {
            return;
        }

        foreach (var tableName in new[] { "dbo.EmpleadoCj_Wup", "dbo.EmpleadoCj" })
        {
            if (!await HasTableAsync(connection, tableName, cancellationToken))
            {
                continue;
            }

            if (!await HasColumnAsync(connection, tableName, "IdEmpleado", cancellationToken) ||
                !await HasColumnAsync(connection, tableName, "NroDocumento", cancellationToken))
            {
                continue;
            }

            var sql = $"""
            SELECT
                IdEmpleado,
                NroDocumento
            FROM {tableName}
            WHERE IdEmpleado IN @Ids;
            """;

            var rows = await connection.QueryAsync(
                new CommandDefinition(
                    sql,
                    new { Ids = missingDocumentIds },
                    cancellationToken: cancellationToken));

            var documentsByEmployeeId = rows
                .Select(ToDictionary)
                .Where(values => (GetInt(values, "IdEmpleado", "idEmpleado") ?? 0) > 0)
                .GroupBy(values => GetInt(values, "IdEmpleado", "idEmpleado") ?? 0)
                .ToDictionary(
                    group => group.Key,
                    group => GetString(group.First(), "NroDocumento", "NumeroDocumento", "Documento", "nroDocumento"));

            foreach (var empleado in empleados)
            {
                if (!string.IsNullOrWhiteSpace(empleado.NumeroDocumento))
                {
                    continue;
                }

                if (documentsByEmployeeId.TryGetValue(empleado.IdEmpleado, out var numeroDocumento) &&
                    !string.IsNullOrWhiteSpace(numeroDocumento))
                {
                    empleado.NumeroDocumento = numeroDocumento;
                }
            }

            if (empleados.All(x => !string.IsNullOrWhiteSpace(x.NumeroDocumento) || x.IdEmpleado <= 0))
            {
                return;
            }
        }
    }

    private static string[] BuildPeriodoTokens(string? periodo)
    {
        var normalized = (periodo ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return Array.Empty<string>();
        }

        var compact = normalized.Replace("-", string.Empty).Replace("/", string.Empty).Trim();
        var tokens = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        if (!string.IsNullOrWhiteSpace(compact))
        {
            tokens.Add(compact);
        }

        if (DateTime.TryParseExact(
                normalized.Replace("-", "/"),
                new[] { "MM/yyyy", "M/yyyy", "yyyy/MM", "yyyy/M", "yyyyMM" },
                CultureInfo.InvariantCulture,
                DateTimeStyles.None,
                out var parsed))
        {
            tokens.Add(parsed.ToString("MMyyyy", CultureInfo.InvariantCulture));
            tokens.Add(parsed.ToString("yyyyMM", CultureInfo.InvariantCulture));
        }

        return tokens.ToArray();
    }

    private static string? NormalizePhone(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        var digits = new string(value.Where(char.IsDigit).ToArray());
        if (digits.Length == 9 && digits.StartsWith('9'))
        {
            return $"51{digits}";
        }

        if (digits.Length == 11 && digits.StartsWith("51", StringComparison.Ordinal))
        {
            return digits;
        }

        return null;
    }

    private static IDictionary<string, object?> ToDictionary(dynamic row) => (IDictionary<string, object?>)row;

    private static string GetString(IDictionary<string, object?> values, params string[] keys)
    {
        foreach (var key in keys)
        {
            if (!values.TryGetValue(key, out var value) || value is null || value is DBNull)
            {
                continue;
            }

            if (value is DateTime dateTime)
            {
                return dateTime.ToString("dd/MM/yyyy", CultureInfo.InvariantCulture);
            }

            if (value is TimeSpan timeSpan)
            {
                return timeSpan.ToString(@"hh\:mm\:ss", CultureInfo.InvariantCulture);
            }

            return Convert.ToString(value, CultureInfo.InvariantCulture)?.Trim() ?? string.Empty;
        }

        return string.Empty;
    }

    private static string GetTimeText(IDictionary<string, object?> values, params string[] keys)
    {
        foreach (var key in keys)
        {
            if (!values.TryGetValue(key, out var value) || value is null || value is DBNull)
            {
                continue;
            }

            var formatted = FormatTimeValue(value);
            if (!string.IsNullOrWhiteSpace(formatted) && formatted != "00:00:00")
            {
                return formatted;
            }
        }

        return string.Empty;
    }

    private static string GetDateText(IDictionary<string, object?> values, params string[] keys)
    {
        foreach (var key in keys)
        {
            if (!values.TryGetValue(key, out var value) || value is null || value is DBNull)
            {
                continue;
            }

            if (value is DateTime dateTime)
            {
                return dateTime.ToString("dd/MM/yyyy", CultureInfo.InvariantCulture);
            }

            var text = Convert.ToString(value, CultureInfo.InvariantCulture)?.Trim();
            if (string.IsNullOrWhiteSpace(text))
            {
                continue;
            }

            if (DateTime.TryParse(text, CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsed))
            {
                return parsed.ToString("dd/MM/yyyy", CultureInfo.InvariantCulture);
            }

            return text;
        }

        return string.Empty;
    }

    private static string FormatTimeValue(object value)
    {
        if (value is DateTime dateTime)
        {
            if (dateTime.Year == 1900 && dateTime.Month == 1 && dateTime.Day == 1 && dateTime.TimeOfDay == TimeSpan.Zero)
            {
                return string.Empty;
            }

            return dateTime.ToString("HH:mm:ss", CultureInfo.InvariantCulture);
        }

        if (value is DateTimeOffset dateTimeOffset)
        {
            return dateTimeOffset.ToString("HH:mm:ss", CultureInfo.InvariantCulture);
        }

        if (value is TimeSpan timeSpan)
        {
            return timeSpan.ToString(@"hh\:mm\:ss", CultureInfo.InvariantCulture);
        }

        var text = Convert.ToString(value, CultureInfo.InvariantCulture)?.Trim();
        if (string.IsNullOrWhiteSpace(text))
        {
            return string.Empty;
        }

        if (DateTime.TryParse(text, CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsedDateTime))
        {
            if (parsedDateTime.Year == 1900 && parsedDateTime.Month == 1 && parsedDateTime.Day == 1 && parsedDateTime.TimeOfDay == TimeSpan.Zero)
            {
                return string.Empty;
            }

            return parsedDateTime.ToString("HH:mm:ss", CultureInfo.InvariantCulture);
        }

        if (TimeSpan.TryParse(text, CultureInfo.InvariantCulture, out var parsedTimeSpan))
        {
            return parsedTimeSpan.ToString(@"hh\:mm\:ss", CultureInfo.InvariantCulture);
        }

        return text;
    }

    private static int? GetInt(IDictionary<string, object?> values, params string[] keys)
    {
        foreach (var key in keys)
        {
            if (!values.TryGetValue(key, out var value) || value is null || value is DBNull)
            {
                continue;
            }

            if (value is int number)
            {
                return number;
            }

            if (int.TryParse(Convert.ToString(value, CultureInfo.InvariantCulture), out var parsed))
            {
                return parsed;
            }
        }

        return null;
    }

    private static bool GetBool(IDictionary<string, object?> values, params string[] keys)
    {
        foreach (var key in keys)
        {
            if (!values.TryGetValue(key, out var value) || value is null || value is DBNull)
            {
                continue;
            }

            if (value is bool boolValue)
            {
                return boolValue;
            }

            if (value is int intValue)
            {
                return intValue > 0;
            }

            if (bool.TryParse(Convert.ToString(value, CultureInfo.InvariantCulture), out var parsedBool))
            {
                return parsedBool;
            }
        }

        return false;
    }

    private static decimal GetDecimal(IDictionary<string, object?> values, params string[] keys)
    {
        foreach (var key in keys)
        {
            if (!values.TryGetValue(key, out var value) || value is null || value is DBNull)
            {
                continue;
            }

            if (value is decimal decimalValue)
            {
                return decimalValue;
            }

            if (value is double doubleValue)
            {
                return (decimal)doubleValue;
            }

            if (value is float floatValue)
            {
                return (decimal)floatValue;
            }

            if (decimal.TryParse(Convert.ToString(value, CultureInfo.InvariantCulture), NumberStyles.Any, CultureInfo.InvariantCulture, out var parsed))
            {
                return parsed;
            }
        }

        return 0m;
    }

    private static DateTime? GetDateTime(IDictionary<string, object?> values, params string[] keys)
    {
        foreach (var key in keys)
        {
            if (!values.TryGetValue(key, out var value) || value is null || value is DBNull)
            {
                continue;
            }

            if (value is DateTime dateTime)
            {
                return dateTime;
            }

            if (DateTime.TryParse(Convert.ToString(value, CultureInfo.InvariantCulture), out var parsed))
            {
                return parsed;
            }
        }

        return null;
    }

    private static IReadOnlyList<string> ParseDiasEjecucion(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return Array.Empty<string>();
        }

        return value
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(NormalizeDiaEjecucion)
            .Where(static item => !string.IsNullOrWhiteSpace(item))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();
    }

    private static string SerializeDiasEjecucion(IReadOnlyList<string>? dias)
    {
        if (dias is null || dias.Count == 0)
        {
            return string.Empty;
        }

        return string.Join(
            ",",
            dias
                .Select(NormalizeDiaEjecucion)
                .Where(static item => !string.IsNullOrWhiteSpace(item))
                .Distinct(StringComparer.OrdinalIgnoreCase));
    }

    private static string NormalizeDiaEjecucion(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return string.Empty;
        }

        return value.Trim().ToUpperInvariant() switch
        {
            "LUNES" or "MONDAY" => "MONDAY",
            "MARTES" or "TUESDAY" => "TUESDAY",
            "MIERCOLES" or "MIÉRCOLES" or "WEDNESDAY" => "WEDNESDAY",
            "JUEVES" or "THURSDAY" => "THURSDAY",
            "VIERNES" or "FRIDAY" => "FRIDAY",
            "SABADO" or "SÁBADO" or "SATURDAY" => "SATURDAY",
            "DOMINGO" or "SUNDAY" => "SUNDAY",
            _ => string.Empty
        };
    }
}
