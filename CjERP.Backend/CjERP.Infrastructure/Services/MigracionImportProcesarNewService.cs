using System.Data;
using CjERP.Application.DTOs;
using CjERP.Application.Interfaces.Services;
using CjERP.Infrastructure.Persistence.Sql;
using Dapper;

namespace CjERP.Infrastructure.Services;

public sealed class MigracionImportProcesarNewService : IMigracionImportProcesarNewService
{
    private readonly ISqlCommandFactory _sqlCommandFactory;

    public MigracionImportProcesarNewService(ISqlCommandFactory sqlCommandFactory)
    {
        _sqlCommandFactory = sqlCommandFactory;
    }

    public async Task<MigracionImportProcesarNewResultadoDto> ProcesarAsync(
        IReadOnlyCollection<MigracionImportProcesarNewFilaDto> datos,
        string accion,
        CancellationToken cancellationToken = default)
    {
        if (datos is null || datos.Count == 0)
        {
            throw new InvalidOperationException("Debe enviar al menos un registro para procesar.");
        }

        var accionNormalizada = NormalizarAccion(accion);
        var datosParaProcesar = accionNormalizada == "ACTUALIZAR"
            ? ConsolidarActualizaciones(datos)
            : datos;
        var table = CrearTabla(datosParaProcesar);

        await using var connection = _sqlCommandFactory.CreateConnection();
        await connection.OpenAsync(cancellationToken);

        var parameters = new DynamicParameters();
        parameters.Add("@Datos", table.AsTableValuedParameter("dbo.Type_MigracionImport"));
        parameters.Add("@Accion", accionNormalizada);

        var command = new CommandDefinition(
            "dbo.sp_MigracionImport_ProcesarNew",
            parameters,
            commandType: CommandType.StoredProcedure,
            cancellationToken: cancellationToken,
            commandTimeout: _sqlCommandFactory.DefaultCommandTimeoutSeconds);

        using var grid = await connection.QueryMultipleAsync(command);

        var resumen = await grid.ReadSingleAsync<MigracionImportProcesarNewResumenDto>();
        var detalle = (await grid.ReadAsync<MigracionImportProcesarNewDetalleDto>()).AsList();
        var problemas = (await grid.ReadAsync<MigracionImportProcesarNewDetalleDto>()).AsList();

        return new MigracionImportProcesarNewResultadoDto
        {
            Resumen = resumen,
            Detalle = detalle,
            Problemas = problemas
        };
    }

    private static string NormalizarAccion(string accion)
    {
        var value = (accion ?? string.Empty).Trim().ToUpperInvariant();
        if (value is not ("VALIDAR" or "ACTUALIZAR"))
        {
            throw new InvalidOperationException("La accion solo puede ser VALIDAR o ACTUALIZAR.");
        }

        return value;
    }

    private static DataTable CrearTabla(IReadOnlyCollection<MigracionImportProcesarNewFilaDto> datos)
    {
        var table = new DataTable();
        table.Columns.Add("FilaExcel", typeof(int));
        table.Columns.Add("OT", typeof(string));
        table.Columns.Add("Cliente", typeof(string));
        table.Columns.Add("Proyecto", typeof(string));
        table.Columns.Add("IdSite", typeof(string));
        table.Columns.Add("Site", typeof(string));
        table.Columns.Add("TipoTrabajo", typeof(string));
        table.Columns.Add("Status_Atp", typeof(string));
        table.Columns.Add("ATP", typeof(string));
        table.Columns.Add("Status_Pap", typeof(string));
        table.Columns.Add("Estado_Oc", typeof(string));
        table.Columns.Add("Nro_Oc", typeof(string));
        table.Columns.Add("Posicion", typeof(string));
        table.Columns.Add("MontoOc", typeof(decimal));
        table.Columns.Add("MontoLiq", typeof(decimal));
        table.Columns.Add("Monto_Bck", typeof(decimal));
        table.Columns.Add("CenFile", typeof(string));
        table.Columns.Add("Status_Gis", typeof(string));
        table.Columns.Add("Estado_Ea", typeof(string));
        table.Columns.Add("Folio", typeof(string));
        table.Columns.Add("Folio2", typeof(string));
        table.Columns.Add("StatusOt", typeof(string));
        table.Columns.Add("StatusOt2", typeof(string));
        table.Columns.Add("Zona", typeof(string));
        table.Columns.Add("Capitalizacion", typeof(string));
        table.Columns.Add("Status_Cj", typeof(string));
        table.Columns.Add("Facturado", typeof(string));
        table.Columns.Add("PrePasivo", typeof(string));
        table.Columns.Add("Proyecto2", typeof(string));
        table.Columns.Add("DiasOn", typeof(string));
        table.Columns.Add("AntOn", typeof(string));
        table.Columns.Add("Gerencia", typeof(string));
        table.Columns.Add("AnoGestion", typeof(decimal));
        table.Columns.Add("IdMoneda", typeof(int));

        foreach (var item in datos)
        {
            table.Rows.Add(
                ToDbValue(item.FilaExcel),
                ToDbValue(item.OT),
                ToDbValue(item.Cliente),
                ToDbValue(item.Proyecto),
                ToDbValue(item.IdSite),
                ToDbValue(item.Site),
                ToDbValue(item.TipoTrabajo),
                ToDbValue(item.Status_Atp),
                ToDbValue(item.ATP),
                ToDbValue(item.Status_Pap),
                ToDbValue(item.Estado_Oc),
                ToDbValue(item.Nro_Oc),
                ToDbValue(item.Posicion),
                ToDbValue(item.MontoOc),
                ToDbValue(item.MontoLiq),
                ToDbValue(item.Monto_Bck),
                ToDbValue(item.CenFile),
                ToDbValue(item.Status_Gis),
                ToDbValue(item.Estado_Ea),
                ToDbValue(item.Folio),
                ToDbValue(item.Folio2),
                ToDbValue(item.StatusOt),
                ToDbValue(item.StatusOt2),
                ToDbValue(item.Zona),
                ToDbValue(item.Capitalizacion),
                ToDbValue(item.Status_Cj),
                ToDbValue(item.Facturado),
                ToDbValue(item.PrePasivo),
                ToDbValue(item.Proyecto2),
                ToDbValue(item.DiasOn),
                ToDbValue(item.AntOn),
                ToDbValue(item.Gerencia),
                ToDbValue(item.AnoGestion),
                ToDbValue(item.IdMoneda));
        }

        return table;
    }

    private static IReadOnlyCollection<MigracionImportProcesarNewFilaDto> ConsolidarActualizaciones(
        IReadOnlyCollection<MigracionImportProcesarNewFilaDto> datos)
    {
        var grupos = new Dictionary<string, MigracionImportProcesarNewFilaDto>(StringComparer.OrdinalIgnoreCase);
        var sumas = new Dictionary<string, decimal>(StringComparer.OrdinalIgnoreCase);
        var tieneMonto = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var fila in datos)
        {
            var llave = CrearLlave(fila);
            if (!grupos.ContainsKey(llave))
            {
                grupos[llave] = fila;
            }

            if (fila.Monto_Bck.HasValue)
            {
                sumas[llave] = sumas.GetValueOrDefault(llave) + fila.Monto_Bck.Value;
                tieneMonto.Add(llave);
            }
        }

        foreach (var (llave, fila) in grupos)
        {
            fila.Monto_Bck = tieneMonto.Contains(llave) ? sumas[llave] : null;
        }

        return grupos.Values.ToList();
    }

    private static string CrearLlave(MigracionImportProcesarNewFilaDto fila)
        => string.Join("||", NormalizarLlave(fila.Cliente), NormalizarLlave(fila.Proyecto),
            NormalizarLlave(fila.IdSite), NormalizarLlave(fila.Site),
            NormalizarLlave(fila.AnoGestion), NormalizarLlave(fila.TipoTrabajo));

    private static string NormalizarLlave(object? valor)
        => valor switch
        {
            null => string.Empty,
            decimal numero => numero.ToString("0.################", System.Globalization.CultureInfo.InvariantCulture),
            _ => valor.ToString()?.Trim().ToUpperInvariant() ?? string.Empty
        };

    private static object ToDbValue<T>(T? value)
        where T : struct
        => value.HasValue ? value.Value : DBNull.Value;

    private static object ToDbValue(string? value)
        => string.IsNullOrWhiteSpace(value) ? DBNull.Value : value.Trim();
}
