using System.Data;
using System.Collections.Concurrent;
using System.Globalization;
using CjERP.Application.DTOs;
using CjERP.Application.Interfaces.Services;
using Dapper;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;

namespace CjERP.Infrastructure.Services;

public class LogisticaSuministroService : ILogisticaSuministroService
{
    private const string BuscarSp = "dbo.sp_SuministroProvisional_Listar";
    private const string KpisSp = "dbo.sp_SuministroProvisional_Kpis";
    private const string InsertarSp = "dbo.sp_SuministroProvisional_Insertar";
    private const string ActualizarSp = "dbo.sp_SuministroProvisional_Actualizar";
    private static readonly ConcurrentDictionary<string, HashSet<string>> ProcedureParameterCache = new(StringComparer.OrdinalIgnoreCase);

    private readonly IConfiguration _configuration;
    private readonly IAuditoriaCambiosService _auditoriaCambiosService;

    public LogisticaSuministroService(
        IConfiguration configuration,
        IAuditoriaCambiosService auditoriaCambiosService)
    {
        _configuration = configuration;
        _auditoriaCambiosService = auditoriaCambiosService;
    }

    public async Task<IEnumerable<LogisticaSuministroDto>> BuscarAsync(
        LogisticaSuministroBuscarRequestDto request,
        CancellationToken cancellationToken = default)
    {
        using var connection = BuildConnection();
        var parameters = await BuildBuscarParametersAsync(connection, request, cancellationToken);
        var rows = await connection.QueryAsync(
            new CommandDefinition(
                BuscarSp,
                parameters,
                commandType: CommandType.StoredProcedure,
                cancellationToken: cancellationToken));

        return rows.Select(MapRowToDto).ToList();
    }

    public async Task<LogisticaSuministroKpiDto> ObtenerKpisAsync(
        LogisticaSuministroBuscarRequestDto request,
        CancellationToken cancellationToken = default)
    {
        using var connection = BuildConnection();
        var parameters = await BuildBuscarParametersAsync(connection, request, cancellationToken, KpisSp);
        var row = await connection.QueryFirstOrDefaultAsync(
            new CommandDefinition(
                KpisSp,
                parameters,
                commandType: CommandType.StoredProcedure,
                cancellationToken: cancellationToken));

        if (row is null)
        {
            return new LogisticaSuministroKpiDto();
        }

        return MapRowToKpiDto(row);
    }

    public async Task<int> InsertarAsync(
        LogisticaSuministroInsertRequestDto request,
        string usuarioAccion,
        CancellationToken cancellationToken = default)
    {
        using var connection = BuildConnection();
        var parameters = await BuildUpsertParametersAsync(
            connection,
            InsertarSp,
            null,
            request.IdCliente,
            request.IdProyecto,
            request.IdSite,
            request.Correlativo,
            request.TipoTrabajo,
            request.Ot,
            request.IdTarea,
            request.FechaInicio,
            request.IdAprobador,
            request.Comentario,
            request.Monto,
            request.IdMoneda,
            request.IdEnergia,
            request.IdEmpresa,
            request.IdEstado,
            request.MontoClaro,
            request.MontoCj,
            request.FechaOnAir,
            request.Observacion,
            request.FechaCnx,
            request.NroSuministro,
            request.FechaEnvioEmail,
            request.FechaDesembolsoClaro,
            request.ValidacionCliente,
            request.Ceco,
            request.Cege,
            request.ImagenUrl,
            request.ImagenPath,
            cancellationToken);
        var result = await connection.ExecuteScalarAsync<object?>(
            new CommandDefinition(
                InsertarSp,
                parameters,
                commandType: CommandType.StoredProcedure,
                cancellationToken: cancellationToken));

        var id = TryConvertToInt(result);

        await _auditoriaCambiosService.RegistrarLoteAsync(
            BuildInsertAuditEntries(request, usuarioAccion, BuildAuditRecordId(id, request.IdSite, request.Correlativo)),
            cancellationToken);

        return id;
    }

    public async Task ActualizarAsync(
        LogisticaSuministroUpdateRequestDto request,
        string usuarioAccion,
        CancellationToken cancellationToken = default)
    {
        using var connection = BuildConnection();
        var previousData = request.IdProvisional.GetValueOrDefault() > 0
            ? await ObtenerPorIdProvisionalAsync(connection, request.IdProvisional!.Value, cancellationToken)
            : null;

        var parameters = await BuildUpsertParametersAsync(
            connection,
            ActualizarSp,
            request.IdProvisional,
            request.IdCliente,
            request.IdProyecto,
            request.IdSite,
            request.Correlativo,
            request.TipoTrabajo,
            request.Ot,
            request.IdTarea,
            request.FechaInicio,
            request.IdAprobador,
            request.Comentario,
            request.Monto,
            request.IdMoneda,
            request.IdEnergia,
            request.IdEmpresa,
            request.IdEstado,
            request.MontoClaro,
            request.MontoCj,
            request.FechaOnAir,
            request.Observacion,
            request.FechaCnx,
            request.NroSuministro,
            request.FechaEnvioEmail,
            request.FechaDesembolsoClaro,
            request.ValidacionCliente,
            request.Ceco,
            request.Cege,
            request.ImagenUrl,
            request.ImagenPath,
            cancellationToken);
        await connection.ExecuteAsync(
            new CommandDefinition(
                ActualizarSp,
                parameters,
                commandType: CommandType.StoredProcedure,
                cancellationToken: cancellationToken));

        await _auditoriaCambiosService.RegistrarLoteAsync(
            BuildUpdateAuditEntries(request, previousData, usuarioAccion),
            cancellationToken);
    }

    private SqlConnection BuildConnection()
    {
        return new SqlConnection(_configuration.GetConnectionString("DefaultConnection"));
    }

    private static async Task<LogisticaSuministroDto?> ObtenerPorIdProvisionalAsync(
        SqlConnection connection,
        long idProvisional,
        CancellationToken cancellationToken)
    {
        var parameters = await BuildBuscarParametersAsync(
            connection,
            new LogisticaSuministroBuscarRequestDto
            {
                IdProvisional = idProvisional
            },
            cancellationToken);

        var rows = await connection.QueryAsync(
            new CommandDefinition(
                BuscarSp,
                parameters,
                commandType: CommandType.StoredProcedure,
                cancellationToken: cancellationToken));

        return rows.Select(MapRowToDto).FirstOrDefault();
    }

    private static IEnumerable<AuditoriaCambioDto> BuildInsertAuditEntries(
        LogisticaSuministroInsertRequestDto request,
        string usuarioAccion,
        string idRegistro)
    {
        return BuildAuditFieldValues(request)
            .Where(static item => !string.IsNullOrWhiteSpace(item.Value.Value))
            .Select(item => new AuditoriaCambioDto
            {
                Modulo = "Logistica",
                Entidad = "SuministroProvisional",
                IdRegistro = idRegistro,
                Accion = "INSERT",
                Seccion = item.Value.Section,
                Campo = item.Key,
                ValorAnterior = null,
                ValorNuevo = item.Value.Value,
                UsuarioAccion = usuarioAccion,
                Observacion = "Registro inicial del suministro."
            });
    }

    private static IEnumerable<AuditoriaCambioDto> BuildUpdateAuditEntries(
        LogisticaSuministroUpdateRequestDto request,
        LogisticaSuministroDto? previousData,
        string usuarioAccion)
    {
        var previousValues = BuildAuditFieldValues(previousData);
        var currentValues = BuildAuditFieldValues(request);
        var idRegistro = BuildAuditRecordId(
            request.IdProvisional,
            request.IdSite,
            request.Correlativo);

        foreach (var current in currentValues)
        {
            previousValues.TryGetValue(current.Key, out var previous);
            var previousValue = previous?.Value;

            if (string.Equals(previousValue, current.Value.Value, StringComparison.Ordinal))
            {
                continue;
            }

            yield return new AuditoriaCambioDto
            {
                Modulo = "Logistica",
                Entidad = "SuministroProvisional",
                IdRegistro = idRegistro,
                Accion = "UPDATE",
                Seccion = current.Value.Section,
                Campo = current.Key,
                ValorAnterior = previousValue,
                ValorNuevo = current.Value.Value,
                UsuarioAccion = usuarioAccion,
                Observacion = "Actualizacion del suministro."
            };
        }
    }

    private static Dictionary<string, AuditFieldValue> BuildAuditFieldValues(LogisticaSuministroInsertRequestDto request)
    {
        return new Dictionary<string, AuditFieldValue>(StringComparer.OrdinalIgnoreCase)
        {
            ["Cliente"] = new("Filtro Operativo", FormatInt(request.IdCliente)),
            ["Proyecto"] = new("Filtro Operativo", FormatInt(request.IdProyecto)),
            ["Site"] = new("Filtro Operativo", NullIfWhiteSpace(request.IdSite)),
            ["Correlativo"] = new("Filtro Operativo", FormatNullableInt(request.Correlativo)),
            ["Trabajo"] = new("Filtro Operativo", NullIfWhiteSpace(request.TipoTrabajo)),
            ["OT"] = new("Filtro Operativo", NullIfWhiteSpace(request.Ot)),
            ["Tarea"] = new("Filtro Operativo", FormatNullableInt(request.IdTarea)),
            ["Fecha inicio"] = new("Datos Principales", FormatNullableDate(request.FechaInicio)),
            ["IdAprobador"] = new("Datos Principales", FormatNullableInt(request.IdAprobador)),
            ["Comentario"] = new("Datos Principales", NullIfWhiteSpace(request.Comentario)),
            ["Monto"] = new("Montos", FormatNullableDecimal(request.Monto)),
            ["IdMoneda"] = new("Montos", FormatNullableInt(request.IdMoneda)),
            ["Tarifa energia"] = new("Montos", FormatNullableInt(request.IdEnergia)),
            ["Empresa energia"] = new("Montos", FormatNullableInt(request.IdEmpresa)),
            ["Monto Claro"] = new("Montos", FormatNullableDecimal(request.MontoClaro)),
            ["Monto CJ"] = new("Montos", FormatNullableDecimal(request.MontoCj)),
            ["Estado suministro"] = new("Seguimiento", FormatNullableInt(request.IdEstado)),
            ["Fecha On Air"] = new("Seguimiento", FormatNullableDate(request.FechaOnAir)),
            ["Observacion"] = new("Seguimiento", NullIfWhiteSpace(request.Observacion)),
            ["Fecha CNX"] = new("Seguimiento", FormatNullableDate(request.FechaCnx)),
            ["Nro suministro"] = new("Seguimiento", NullIfWhiteSpace(request.NroSuministro)),
            ["Fecha envio email"] = new("Seguimiento", FormatNullableDate(request.FechaEnvioEmail)),
            ["Fecha desembolso Claro"] = new("Seguimiento", FormatNullableDate(request.FechaDesembolsoClaro)),
            ["Validacion cliente"] = new("Seguimiento", FormatNullableInt(request.ValidacionCliente)),
            ["CECO"] = new("Seguimiento", NullIfWhiteSpace(request.Ceco)),
            ["CEGE"] = new("Seguimiento", NullIfWhiteSpace(request.Cege)),
            ["Imagen URL"] = new("Adjunto", NullIfWhiteSpace(request.ImagenUrl)),
            ["Imagen Path"] = new("Adjunto", NullIfWhiteSpace(request.ImagenPath))
        };
    }

    private static Dictionary<string, AuditFieldValue> BuildAuditFieldValues(LogisticaSuministroUpdateRequestDto request)
    {
        return new Dictionary<string, AuditFieldValue>(StringComparer.OrdinalIgnoreCase)
        {
            ["Cliente"] = new("Filtro Operativo", FormatInt(request.IdCliente)),
            ["Proyecto"] = new("Filtro Operativo", FormatInt(request.IdProyecto)),
            ["Site"] = new("Filtro Operativo", NullIfWhiteSpace(request.IdSite)),
            ["Correlativo"] = new("Filtro Operativo", FormatNullableInt(request.Correlativo)),
            ["Trabajo"] = new("Filtro Operativo", NullIfWhiteSpace(request.TipoTrabajo)),
            ["OT"] = new("Filtro Operativo", NullIfWhiteSpace(request.Ot)),
            ["Tarea"] = new("Filtro Operativo", FormatNullableInt(request.IdTarea)),
            ["Fecha inicio"] = new("Datos Principales", FormatNullableDate(request.FechaInicio)),
            ["IdAprobador"] = new("Datos Principales", FormatNullableInt(request.IdAprobador)),
            ["Comentario"] = new("Datos Principales", NullIfWhiteSpace(request.Comentario)),
            ["Monto"] = new("Montos", FormatNullableDecimal(request.Monto)),
            ["IdMoneda"] = new("Montos", FormatNullableInt(request.IdMoneda)),
            ["Tarifa energia"] = new("Montos", FormatNullableInt(request.IdEnergia)),
            ["Empresa energia"] = new("Montos", FormatNullableInt(request.IdEmpresa)),
            ["Monto Claro"] = new("Montos", FormatNullableDecimal(request.MontoClaro)),
            ["Monto CJ"] = new("Montos", FormatNullableDecimal(request.MontoCj)),
            ["Estado suministro"] = new("Seguimiento", FormatNullableInt(request.IdEstado)),
            ["Fecha On Air"] = new("Seguimiento", FormatNullableDate(request.FechaOnAir)),
            ["Observacion"] = new("Seguimiento", NullIfWhiteSpace(request.Observacion)),
            ["Fecha CNX"] = new("Seguimiento", FormatNullableDate(request.FechaCnx)),
            ["Nro suministro"] = new("Seguimiento", NullIfWhiteSpace(request.NroSuministro)),
            ["Fecha envio email"] = new("Seguimiento", FormatNullableDate(request.FechaEnvioEmail)),
            ["Fecha desembolso Claro"] = new("Seguimiento", FormatNullableDate(request.FechaDesembolsoClaro)),
            ["Validacion cliente"] = new("Seguimiento", FormatNullableInt(request.ValidacionCliente)),
            ["CECO"] = new("Seguimiento", NullIfWhiteSpace(request.Ceco)),
            ["CEGE"] = new("Seguimiento", NullIfWhiteSpace(request.Cege)),
            ["Imagen URL"] = new("Adjunto", NullIfWhiteSpace(request.ImagenUrl)),
            ["Imagen Path"] = new("Adjunto", NullIfWhiteSpace(request.ImagenPath))
        };
    }

    private static Dictionary<string, AuditFieldValue> BuildAuditFieldValues(LogisticaSuministroDto? data)
    {
        if (data is null)
        {
            return new Dictionary<string, AuditFieldValue>(StringComparer.OrdinalIgnoreCase);
        }

        return new Dictionary<string, AuditFieldValue>(StringComparer.OrdinalIgnoreCase)
        {
            ["Cliente"] = new("Filtro Operativo", FormatNullableInt(data.IdCliente)),
            ["Proyecto"] = new("Filtro Operativo", FormatNullableInt(data.IdProyecto)),
            ["Site"] = new("Filtro Operativo", NullIfWhiteSpace(data.IdSite)),
            ["Correlativo"] = new("Filtro Operativo", FormatNullableInt(data.Correlativo)),
            ["Trabajo"] = new("Filtro Operativo", NullIfWhiteSpace(data.TipoTrabajo)),
            ["OT"] = new("Filtro Operativo", NullIfWhiteSpace(data.Ot)),
            ["Tarea"] = new("Filtro Operativo", FormatNullableInt(data.IdTarea)),
            ["Fecha inicio"] = new("Datos Principales", FormatNullableDate(data.FechaInicio)),
            ["IdAprobador"] = new("Datos Principales", FormatNullableInt(data.IdAprobador)),
            ["Comentario"] = new("Datos Principales", NullIfWhiteSpace(data.Comentario)),
            ["Monto"] = new("Montos", FormatNullableDecimal(data.Monto)),
            ["IdMoneda"] = new("Montos", FormatNullableInt(data.IdMoneda)),
            ["Tarifa energia"] = new("Montos", FormatNullableInt(data.IdEnergia)),
            ["Empresa energia"] = new("Montos", FormatNullableInt(data.IdEmpresa)),
            ["Monto Claro"] = new("Montos", FormatNullableDecimal(data.MontoClaro)),
            ["Monto CJ"] = new("Montos", FormatNullableDecimal(data.MontoCj)),
            ["Estado suministro"] = new("Seguimiento", FormatNullableInt(data.IdEstado)),
            ["Fecha On Air"] = new("Seguimiento", FormatNullableDate(data.FechaOnAir)),
            ["Observacion"] = new("Seguimiento", NullIfWhiteSpace(data.Observacion)),
            ["Fecha CNX"] = new("Seguimiento", FormatNullableDate(data.FechaCnx)),
            ["Nro suministro"] = new("Seguimiento", NullIfWhiteSpace(data.NroSuministro)),
            ["Fecha envio email"] = new("Seguimiento", FormatNullableDate(data.FechaEnvioEmail)),
            ["Fecha desembolso Claro"] = new("Seguimiento", FormatNullableDate(data.FechaDesembolsoClaro)),
            ["Validacion cliente"] = new("Seguimiento", FormatNullableInt(data.ValidacionCliente)),
            ["CECO"] = new("Seguimiento", NullIfWhiteSpace(data.Ceco)),
            ["CEGE"] = new("Seguimiento", NullIfWhiteSpace(data.Cege)),
            ["Imagen URL"] = new("Adjunto", NullIfWhiteSpace(data.ImagenUrl)),
            ["Imagen Path"] = new("Adjunto", NullIfWhiteSpace(data.ImagenPath))
        };
    }

    private static string BuildAuditRecordId(long? idProvisional, string? idSite, int? correlativo)
    {
        if (idProvisional.GetValueOrDefault() > 0)
        {
            return idProvisional!.Value.ToString(CultureInfo.InvariantCulture);
        }

        var site = NullIfWhiteSpace(idSite);
        var correlativoTexto = FormatNullableInt(correlativo);
        return $"{site ?? "SIN_SITE"}-{correlativoTexto ?? "SIN_CORRELATIVO"}";
    }

    private static string FormatInt(int value) => value.ToString(CultureInfo.InvariantCulture);

    private static string? FormatNullableInt(int? value)
        => value.HasValue ? value.Value.ToString(CultureInfo.InvariantCulture) : null;

    private static string? FormatNullableDecimal(decimal? value)
        => value.HasValue ? value.Value.ToString("0.##", CultureInfo.InvariantCulture) : null;

    private static string? FormatNullableDate(DateTime? value)
        => value.HasValue ? value.Value.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) : null;

    private static string? FormatNullableDate(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        return DateTime.TryParse(value, out var parsed)
            ? parsed.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture)
            : value.Trim();
    }

    private static async Task<DynamicParameters> BuildBuscarParametersAsync(
        SqlConnection connection,
        LogisticaSuministroBuscarRequestDto request,
        CancellationToken cancellationToken,
        string procedureName = BuscarSp)
    {
        var parameters = new DynamicParameters();
        var availableParameters = await GetStoredProcedureParametersAsync(connection, procedureName, cancellationToken);

        if (availableParameters.Contains("@idcliente"))
        {
            parameters.Add("@idcliente", request.IdCliente, DbType.Int32);
        }

        if (availableParameters.Contains("@IdProvisional"))
        {
            parameters.Add("@IdProvisional", request.IdProvisional, DbType.Int64);
        }

        if (availableParameters.Contains("@idproyecto"))
        {
            parameters.Add("@idproyecto", request.IdProyecto, DbType.Int32);
        }

        await AddParameterIfExistsAsync(
            availableParameters,
            ["@FechaInicio", "@fechaInicio", "@fechainicio", "@fecha_inicio"],
            request.FechaInicio,
            DbType.DateTime,
            parameters);

        await AddParameterIfExistsAsync(
            availableParameters,
            ["@FechaFin", "@fechaFin", "@fechafin", "@fecha_fin"],
            request.FechaFin,
            DbType.DateTime,
            parameters);

        return parameters;
    }

    private static async Task<DynamicParameters> BuildUpsertParametersAsync(
        SqlConnection connection,
        string procedureName,
        long? idProvisional,
        int idCliente,
        int idProyecto,
        string idSite,
        int? correlativo,
        string? tipoTrabajo,
        string? ot,
        int? idTarea,
        DateTime? fechaInicio,
        int? idAprobador,
        string? comentario,
        decimal? monto,
        int? idMoneda,
        int? idEnergia,
        int? idEmpresa,
        int? idEstado,
        decimal? montoClaro,
        decimal? montoCj,
        DateTime? fechaOnAir,
        string? observacion,
        DateTime? fechaCnx,
        string? nroSuministro,
        DateTime? fechaEnvioEmail,
        DateTime? fechaDesembolsoClaro,
        int? validacionCliente,
        string? ceco,
        string? cege,
        string? imagenUrl,
        string? imagenPath,
        CancellationToken cancellationToken)
    {
        var parameters = new DynamicParameters();
        var availableParameters = await GetStoredProcedureParametersAsync(connection, procedureName, cancellationToken);

        await AddParameterIfExistsAsync(
            availableParameters,
            ["@IdProvisional", "@idprovisional", "@id_provisional", "@IdSuministroProvisional", "@idsuministroprovisional"],
            idProvisional,
            DbType.Int64,
            parameters);

        await AddParameterIfExistsAsync(
            availableParameters,
            ["@idcliente", "@IdCliente", "@id_cliente"],
            idCliente,
            DbType.Int32,
            parameters);

        await AddParameterIfExistsAsync(
            availableParameters,
            ["@idproyecto", "@IdProyecto", "@id_proyecto"],
            idProyecto,
            DbType.Int32,
            parameters);

        await AddParameterIfExistsAsync(
            availableParameters,
            ["@idsite", "@IdSite", "@id_site"],
            NullIfWhiteSpace(idSite),
            DbType.String,
            parameters);

        await AddParameterIfExistsAsync(
            availableParameters,
            ["@correlativo", "@Correlativo"],
            correlativo,
            DbType.Int32,
            parameters);

        await AddParameterIfExistsAsync(
            availableParameters,
            ["@tipo_trabajo", "@TipoTrabajo", "@tipotrabajo", "@tipoTrabajo"],
            NullIfWhiteSpace(tipoTrabajo),
            DbType.String,
            parameters);

        await AddParameterIfExistsAsync(
            availableParameters,
            ["@ot", "@OT"],
            NullIfWhiteSpace(ot),
            DbType.String,
            parameters);

        await AddParameterIfExistsAsync(
            availableParameters,
            ["@idtarea", "@id_tarea", "@IdTarea"],
            idTarea,
            DbType.Int32,
            parameters);

        await AddParameterIfExistsAsync(
            availableParameters,
            ["@fecha_inicio", "@fechainicio", "@fechaInicio"],
            fechaInicio,
            DbType.DateTime,
            parameters);

        await AddParameterIfExistsAsync(
            availableParameters,
            ["@idaprobador", "@id_aprobador", "@IdAprobador"],
            idAprobador,
            DbType.Int32,
            parameters);

        await AddParameterIfExistsAsync(
            availableParameters,
            ["@comentario", "@Comentario"],
            NullIfWhiteSpace(comentario),
            DbType.String,
            parameters);

        await AddParameterIfExistsAsync(
            availableParameters,
            ["@monto", "@Monto"],
            monto,
            DbType.Decimal,
            parameters);

        await AddParameterIfExistsAsync(
            availableParameters,
            ["@idmoneda", "@id_moneda", "@IdMoneda"],
            idMoneda,
            DbType.Int32,
            parameters);

        await AddParameterIfExistsAsync(
            availableParameters,
            ["@idenergia", "@id_energia", "@IdEnergia"],
            idEnergia,
            DbType.Int32,
            parameters);

        await AddParameterIfExistsAsync(
            availableParameters,
            ["@idempresa", "@id_empresa", "@IdEmpresa"],
            idEmpresa,
            DbType.Int32,
            parameters);

        await AddParameterIfExistsAsync(
            availableParameters,
            ["@idestado", "@id_estado", "@IdEstado"],
            idEstado,
            DbType.Int32,
            parameters);

        await AddParameterIfExistsAsync(
            availableParameters,
            ["@montoclaro", "@monto_claro", "@MontoClaro"],
            montoClaro,
            DbType.Decimal,
            parameters);

        await AddParameterIfExistsAsync(
            availableParameters,
            ["@montocj", "@monto_cj", "@MontoCj"],
            montoCj,
            DbType.Decimal,
            parameters);

        await AddParameterIfExistsAsync(
            availableParameters,
            ["@fechaonair", "@fecha_onair", "@FechaOnAir", "@fechaOnAir"],
            fechaOnAir,
            DbType.DateTime,
            parameters);

        await AddParameterIfExistsAsync(
            availableParameters,
            ["@observacion", "@Observacion"],
            NullIfWhiteSpace(observacion),
            DbType.String,
            parameters);

        await AddParameterIfExistsAsync(
            availableParameters,
            ["@fechacnx", "@fecha_cnx", "@FechaCnx", "@fechaCnx"],
            fechaCnx,
            DbType.DateTime,
            parameters);

        await AddParameterIfExistsAsync(
            availableParameters,
            ["@nrosuministro", "@nro_suministro", "@NroSuministro"],
            NullIfWhiteSpace(nroSuministro),
            DbType.String,
            parameters);

        await AddParameterIfExistsAsync(
            availableParameters,
            ["@fechaenvioemail", "@fecha_envio_email", "@FechaEnvioEmail", "@fechaEnvioEmail"],
            fechaEnvioEmail,
            DbType.DateTime,
            parameters);

        await AddParameterIfExistsAsync(
            availableParameters,
            ["@fechadesembolsoclaro", "@fecha_desembolso_claro", "@FechaDesembolsoClaro", "@fechaDesembolsoClaro"],
            fechaDesembolsoClaro,
            DbType.DateTime,
            parameters);

        await AddParameterIfExistsAsync(
            availableParameters,
            ["@validacioncliente", "@validacion_cliente", "@ValidacionCliente"],
            validacionCliente,
            DbType.Int32,
            parameters);

        await AddParameterIfExistsAsync(
            availableParameters,
            ["@ceco", "@CECO", "@Ceco"],
            NullIfWhiteSpace(ceco),
            DbType.String,
            parameters);

        await AddParameterIfExistsAsync(
            availableParameters,
            ["@cege", "@CEGE", "@Cege"],
            NullIfWhiteSpace(cege),
            DbType.String,
            parameters);

        await AddParameterIfExistsAsync(
            availableParameters,
            ["@imagenurl", "@ImagenUrl", "@imagen_url", "@img_url", "@ImgFactura", "@ImgSustentoUrl", "@imgsustentourl", "@ruta_url_imagen"],
            NullIfWhiteSpace(imagenUrl),
            DbType.String,
            parameters);

        await AddParameterIfExistsAsync(
            availableParameters,
            ["@imagenpath", "@ImagenPath", "@imagen_path", "@ruta_imagen", "@rutaimagen", "@img_factura", "@RutaFactura", "@ImgSustento", "@imgsustento", "@storagepath", "@StoragePath"],
            NullIfWhiteSpace(imagenPath),
            DbType.String,
            parameters);

        return parameters;
    }

    private static Task AddParameterIfExistsAsync(
        HashSet<string> availableParameters,
        string[] candidateNames,
        object? value,
        DbType dbType,
        DynamicParameters parameters)
    {
        foreach (var candidateName in candidateNames)
        {
            if (!availableParameters.Contains(candidateName))
            {
                continue;
            }

            parameters.Add(candidateName, value, dbType);
            return Task.CompletedTask;
        }

        return Task.CompletedTask;
    }

    private static async Task<HashSet<string>> GetStoredProcedureParametersAsync(
        SqlConnection connection,
        string procedureName,
        CancellationToken cancellationToken)
    {
        const string sql = """
        SELECT p.name
        FROM sys.parameters p
        INNER JOIN sys.objects o
            ON p.object_id = o.object_id
        WHERE o.object_id = OBJECT_ID(@ProcedureName);
        """;

        if (ProcedureParameterCache.TryGetValue(procedureName, out var cached))
        {
            return cached;
        }

        var result = await connection.QueryAsync<string>(
            new CommandDefinition(
                sql,
                new
                {
                    ProcedureName = procedureName
                },
                cancellationToken: cancellationToken));

        var parameters = new HashSet<string>(result, StringComparer.OrdinalIgnoreCase);
        ProcedureParameterCache[procedureName] = parameters;
        return parameters;
    }

    private static string? NullIfWhiteSpace(string? value)
    {
        return string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    }

    private static int TryConvertToInt(object? value)
    {
        if (value is null)
        {
            return 0;
        }

        return int.TryParse(Convert.ToString(value), out var parsed) ? parsed : 0;
    }

    private static LogisticaSuministroDto MapRowToDto(dynamic row)
    {
        var values = (IDictionary<string, object?>)row;

        return new LogisticaSuministroDto
        {
            IdSuministro = GetNullableInt(values, "IdSuministro", "idSuministro"),
            IdSuministroProvisional = GetNullableInt(values, "IdSuministroProvisional", "idSuministroProvisional", "IdProvisional", "idProvisional"),
            IdCliente = GetNullableInt(values, "IdCliente", "idCliente", "idcliente"),
            NombreCliente = GetNullableString(values, "NombreCliente", "nombreCliente", "nombrecliente"),
            IdProyecto = GetNullableInt(values, "IdProyecto", "idProyecto", "idproyecto"),
            NombreProyecto = GetNullableString(values, "NombreProyecto", "nombreProyecto", "nombreproyecto"),
            IdSite = GetNullableString(values, "IdSite", "idSite", "idsite"),
            NombreSite = GetNullableString(values, "NombreSite", "nombreSite", "nombresite"),
            Correlativo = GetNullableInt(values, "Correlativo", "correlativo"),
            TipoTrabajo = GetNullableString(values, "TipoTrabajo", "tipoTrabajo", "tipo_trabajo"),
            Ot = GetNullableString(values, "Ot", "ot", "OT"),
            IdTarea = GetNullableInt(values, "IdTarea", "idTarea", "idtarea", "TareaId", "tareaId", "Id_Tarea", "id_tarea"),
            Tarea = GetNullableString(values, "Tarea", "tarea", "NomTarea", "nomTarea", "DescTarea", "descTarea", "ValorIniTarea", "valorIniTarea", "valorini_tarea"),
            FechaInicio = GetNullableDateTime(values, "FechaInicio", "fechaInicio", "fechainicio"),
            IdAprobador = GetNullableInt(values, "IdAprobador", "idAprobador"),
            Aprobador = GetNullableString(values, "Aprobador", "aprobador", "NombreEmpleado", "nombreempleado"),
            Comentario = GetNullableString(values, "Comentario", "comentario"),
            Monto = GetNullableDecimal(values, "Monto", "monto"),
            IdMoneda = GetNullableInt(values, "IdMoneda", "idMoneda"),
            Moneda = GetNullableString(values, "Moneda", "moneda", "valorini", "ValorIni"),
            IdEnergia = GetNullableInt(values, "IdEnergia", "idEnergia", "idenergia"),
            Tarifa = GetNullableString(values, "Tarifa", "tarifa"),
            IdEmpresa = GetNullableInt(values, "IdEmpresa", "idEmpresa", "idempresa"),
            Empresa = GetNullableString(values, "Empresa", "empresa"),
            IdEstado = GetNullableInt(values, "IdEstado", "idEstado", "idestado"),
            MontoClaro = GetNullableDecimal(values, "MontoClaro", "montoClaro", "montoclaro"),
            MontoCj = GetNullableDecimal(values, "MontoCj", "montoCj", "montocj"),
            FechaOnAir = GetNullableDateTime(values, "FechaOnAir", "fechaOnAir", "fechaonair"),
            Observacion = GetNullableString(values, "Observacion", "observacion"),
            FechaCnx = GetNullableDateTime(values, "FechaCnx", "fechaCnx", "fechacnx"),
            NroSuministro = GetNullableString(values, "NroSuministro", "nroSuministro", "nrosuministro"),
            EstadoSuministro = GetNullableString(values, "EstadoSuministro", "estadoSuministro", "estadosuministro", "Estado", "estado"),
            ValidacionCliente = GetNullableInt(values, "ValidacionCliente", "validacionCliente", "validacioncliente"),
            Validacion = GetNullableString(values, "Validacion", "validacion"),
            FechaEnvioEmail = GetNullableDateTime(values, "FechaEnvioEmail", "fechaEnvioEmail", "fechaenvioemail"),
            FechaDesembolsoClaro = GetNullableDateTime(values, "FechaDesembolsoClaro", "fechaDesembolsoClaro", "fechadesembolsoclaro"),
            Ceco = GetNullableString(values, "Ceco", "ceco", "CECO"),
            Cege = GetNullableString(values, "Cege", "cege", "CEGE"),
            ImagenUrl = GetNullableString(values, "ImagenUrl", "imagenUrl", "ImgSustentoUrl", "imgSustentoUrl"),
            ImagenPath = GetNullableString(values, "ImagenPath", "imagenPath", "ImgSustento", "imgSustento"),
            EsActivo = GetNullableBool(values, "EsActivo", "esActivo"),
            UsuarioCreacion = GetNullableString(values, "UsuarioCreacion", "usuarioCreacion"),
            FechaCreacion = GetNullableDateTime(values, "FechaCreacion", "fechaCreacion"),
            UsuarioActualizacion = GetNullableString(values, "UsuarioActualizacion", "usuarioActualizacion"),
            FechaActualizacion = GetNullableDateTime(values, "FechaActualizacion", "fechaActualizacion"),
            UsuarioEliminacion = GetNullableString(values, "UsuarioEliminacion", "usuarioEliminacion"),
            FechaEliminacion = GetNullableDateTime(values, "FechaEliminacion", "fechaEliminacion"),
        };
    }

    private static LogisticaSuministroKpiDto MapRowToKpiDto(dynamic row)
    {
        var values = (IDictionary<string, object?>)row;

        return new LogisticaSuministroKpiDto
        {
            TotalPagadoMes = GetNullableDecimal(values, "TotalPagadoMes", "totalPagadoMes", "totalpagadomes", "TotalPagado", "totalpagado", "MontoPagadoMes", "montopagadomes"),
            TotalReembolsadoMes = GetNullableDecimal(values, "TotalReembolsadoMes", "totalReembolsadoMes", "totalreembolsadomes", "TotalReembolsado", "totalreembolsado", "MontoReembolsadoMes", "montoreembolsadomes", "TotalReembolsadoCj", "totalReembolsadoCj", "totalreembolsadocj"),
            SaldoPendienteReembolso = GetNullableDecimal(values, "SaldoPendienteReembolso", "saldoPendienteReembolso", "saldopendientereembolso", "SaldoPendiente", "saldopendiente", "SaldoPendienteReembolsoS", "saldopendientereembolsos"),
            SuministrosProvisionalesActivos = GetNullableInt(values, "SuministrosProvisionalesActivos", "suministrosProvisionalesActivos", "suministrosprovisionalesactivos", "SusProvisionalesActivos", "susProvisionalesActivos", "Activos", "activos"),
            CasosRiesgoMedio = GetNullableInt(values, "CasosRiesgoMedio", "casosRiesgoMedio", "casosriesgomedio", "Mayor60Dias", "mayor60Dias", "Mas60Dias", "mas60Dias", "Mayor60DiasRiesgoMedio", "mayor60DiasRiesgoMedio", "mayor60diasriesgomedio"),
            CasosRiesgoCritico = GetNullableInt(values, "CasosRiesgoCritico", "casosRiesgoCritico", "casosriesgocritico", "Mayor90Dias", "mayor90Dias", "Mas90Dias", "mas90Dias", "Mayor90DiasRiesgoCritico", "mayor90DiasRiesgoCritico", "mayor90diasriesgocritico"),
            PorcentajePagosValidacionPrevia = GetNullableDecimal(values, "PorcentajePagosValidacionPrevia", "porcentajePagosValidacionPrevia", "porcentajepagosvalidacionprevia", "PorcentajeValidacionPrevia", "porcentajevalidacionprevia", "PctValidacionPrevia", "pctvalidacionprevia", "PorcentajePagosValidacionCliente", "porcentajePagosValidacionCliente", "porcentajepagosvalidacioncliente"),
            IndiceRecupero = GetNullableDecimal(values, "IndiceRecupero", "indiceRecupero", "indicerecupero", "IRP", "irp", "IndiceRecuperoPorcentaje", "indiceRecuperoPorcentaje"),
        };
    }

    private sealed record AuditFieldValue(string Section, string? Value);

    private static object? GetValue(IDictionary<string, object?> values, params string[] keys)
    {
        foreach (var key in keys)
        {
            if (values.TryGetValue(key, out var value) && value is not null && value != DBNull.Value)
            {
                return value;
            }
        }

        return null;
    }

    private static string? GetNullableString(IDictionary<string, object?> values, params string[] keys)
    {
        return Convert.ToString(GetValue(values, keys))?.Trim();
    }

    private static int? GetNullableInt(IDictionary<string, object?> values, params string[] keys)
    {
        var value = GetValue(values, keys);
        if (value is null)
        {
            return null;
        }

        return int.TryParse(Convert.ToString(value), out var parsed) ? parsed : null;
    }

    private static decimal? GetNullableDecimal(IDictionary<string, object?> values, params string[] keys)
    {
        var value = GetValue(values, keys);
        if (value is null)
        {
            return null;
        }

        return decimal.TryParse(Convert.ToString(value), out var parsed) ? parsed : null;
    }

    private static DateTime? GetNullableDateTime(IDictionary<string, object?> values, params string[] keys)
    {
        var value = GetValue(values, keys);
        if (value is null)
        {
            return null;
        }

        return DateTime.TryParse(Convert.ToString(value), out var parsed) ? parsed : null;
    }

    private static bool? GetNullableBool(IDictionary<string, object?> values, params string[] keys)
    {
        var value = GetValue(values, keys);
        if (value is null)
        {
            return null;
        }

        return bool.TryParse(Convert.ToString(value), out var parsed) ? parsed : null;
    }
}
