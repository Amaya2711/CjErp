using System.Data;
using System.Text.Json;
using CjERP.Application.DTOs;
using CjERP.Application.Interfaces.Services;
using CjERP.Infrastructure.Persistence.Sql;
using Dapper;

namespace CjERP.Infrastructure.Services;

/// <summary>
/// Ventas SUNAT: carga del Registro de Ventas (Excel) y validación de IdCliente (dbo.Cliente por nombre). IdEmpresa queda pendiente de regla.
/// </summary>
public sealed class VentasSunatService : IVentasSunatService
{
    private readonly ISqlCommandFactory _sql;

    public VentasSunatService(ISqlCommandFactory sql)
    {
        _sql = sql;
    }

    public async Task<VentasSunatCargaResultDto> CargarAsync(
        IReadOnlyCollection<VentasSunatFilaDto> datos,
        string? usuario,
        CancellationToken cancellationToken = default)
    {
        if (datos is null || datos.Count == 0)
        {
            throw new InvalidOperationException("Debe enviar al menos un registro para cargar.");
        }

        if (datos.Any(d => string.IsNullOrWhiteSpace(d.RucEmisor) || string.IsNullOrWhiteSpace(d.TipoCp)
                           || string.IsNullOrWhiteSpace(d.Serie) || string.IsNullOrWhiteSpace(d.NroCp) || d.FechaEmision is null))
        {
            throw new InvalidOperationException("Todas las filas deben tener RUC, tipo de comprobante, serie, número y fecha de emisión.");
        }

        // La carga es por periodo (año-mes) y por RUC emisor: el SP reemplaza todo lo cargado antes de ese periodo.
        var periodos = datos.Select(d => (d.Periodo ?? string.Empty).Trim()).Distinct().ToList();
        if (periodos.Count != 1 || !System.Text.RegularExpressions.Regex.IsMatch(periodos[0], @"^\d{4}(0[1-9]|1[0-2])$"))
        {
            throw new InvalidOperationException("El archivo debe contener un único periodo (AAAAMM) válido.");
        }

        if (datos.Select(d => d.RucEmisor!.Trim()).Distinct().Count() != 1)
        {
            throw new InvalidOperationException("El archivo debe contener un único RUC emisor.");
        }

        var json = JsonSerializer.Serialize(datos, new JsonSerializerOptions(JsonSerializerDefaults.Web));

        await using var connection = _sql.CreateConnection();
        var result = await connection.QuerySingleAsync<VentasSunatCargaResultDto>(
            _sql.Create(
                "dbo.sp_VentasSunat_Cargar",
                new { Datos = json, Lote = Guid.NewGuid(), Usuario = usuario },
                CommandType.StoredProcedure,
                cancellationToken,
                commandTimeout: 120));
        return result;
    }

    public async Task<IReadOnlyList<VentasSunatPeriodoDto>> ListarPeriodosAsync(CancellationToken cancellationToken = default)
    {
        await using var connection = _sql.CreateConnection();
        var periodos = await connection.QueryAsync<VentasSunatPeriodoDto>(
            _sql.Create("dbo.sp_VentasSunat_ListarPeriodos", null, CommandType.StoredProcedure, cancellationToken, commandTimeout: 60));
        return periodos.ToList();
    }

    public async Task<VentasSunatHistorialDto> ConsultarPeriodoAsync(string periodo, string rucEmisor, CancellationToken cancellationToken = default)
    {
        periodo = (periodo ?? string.Empty).Trim();
        rucEmisor = (rucEmisor ?? string.Empty).Trim();
        if (!System.Text.RegularExpressions.Regex.IsMatch(periodo, @"^\d{4}(0[1-9]|1[0-2])$"))
        {
            throw new InvalidOperationException("El periodo debe tener formato AAAAMM.");
        }

        if (rucEmisor.Length == 0)
        {
            throw new InvalidOperationException("Debe indicar el RUC emisor.");
        }

        await using var connection = _sql.CreateConnection();
        var resumen = await connection.QuerySingleAsync<VentasSunatHistorialDto>(
            _sql.Create(
                "dbo.sp_VentasSunat_ConsultarPeriodo",
                new { Periodo = periodo, RucEmisor = rucEmisor },
                CommandType.StoredProcedure,
                cancellationToken,
                commandTimeout: 60));

        resumen.Existe = resumen.Cantidad > 0 && resumen.Lote.HasValue;
        if (!resumen.Existe)
        {
            return resumen;
        }

        var registros = await connection.QueryAsync<VentasSunatRegistroDto>(
            _sql.Create("dbo.sp_VentasSunat_Listar", new { Lote = resumen.Lote }, CommandType.StoredProcedure, cancellationToken, commandTimeout: 120));
        resumen.Registros = registros.ToList();
        return resumen;
    }

    public async Task<IReadOnlyList<VentasSunatRegistroDto>> ConsultarAnioAsync(string anio, CancellationToken cancellationToken = default)
    {
        anio = (anio ?? string.Empty).Trim();
        if (!System.Text.RegularExpressions.Regex.IsMatch(anio, @"^\d{4}$"))
        {
            throw new InvalidOperationException("El anio debe tener formato AAAA.");
        }

        await using var connection = _sql.CreateConnection();
        var registros = await connection.QueryAsync<VentasSunatRegistroDto>(
            _sql.Create("dbo.sp_VentasSunat_ListarAnio", new { Anio = anio }, CommandType.StoredProcedure, cancellationToken, commandTimeout: 120));
        return registros.ToList();
    }

    // PV: dbo.Cliente.NroDocumento (ya lo usa la validacion de ventas para asignar IdCliente).
    public async Task<IReadOnlyList<VentasSunatClienteDto>> ListarClientesAsync(CancellationToken cancellationToken = default)
    {
        await using var connection = _sql.CreateConnection();
        var clientes = await connection.QueryAsync<VentasSunatClienteDto>(
            _sql.Create("SELECT IdCliente, NroDocumento, NombreCliente FROM dbo.Cliente", null, CommandType.Text, cancellationToken, commandTimeout: 60));
        return clientes.ToList();
    }

    public async Task<VentasSunatValidacionResultDto> ValidarAsync(Guid lote, CancellationToken cancellationToken = default)
    {
        await using var connection = _sql.CreateConnection();

        var resumen = await connection.QuerySingleAsync<VentasSunatValidacionResumenDto>(
            _sql.Create(
                "dbo.sp_VentasSunat_Validar",
                new { Lote = lote },
                CommandType.StoredProcedure,
                cancellationToken,
                commandTimeout: 120));

        var registros = await connection.QueryAsync<VentasSunatRegistroDto>(
            _sql.Create("dbo.sp_VentasSunat_Listar", new { Lote = lote }, CommandType.StoredProcedure, cancellationToken, commandTimeout: 120));

        var lista = registros.ToList();
        await AsignarEmpresaAsync(connection, lote, lista, cancellationToken);

        return new VentasSunatValidacionResultDto { Resumen = resumen, Registros = lista };
    }

    /// <summary>
    /// Empresa del lote por RUC emisor: VentasSunat.RucEmisor se compara con Constante.Adicional del campo EMPRESA_cj;
    /// su Correlativo es el IdEmpresa y su ValorIni el nombre de la Empresa. Ambos se graban en dbo.VentasSunat (IdEmpresa, Empresa).
    /// Un RUC emisor que no esté en EMPRESA_cj deja IdEmpresa y Empresa en NULL.
    /// </summary>
    private async Task AsignarEmpresaAsync(System.Data.IDbConnection connection, Guid lote, List<VentasSunatRegistroDto> registros, CancellationToken cancellationToken)
    {
        if (registros.Count == 0)
        {
            return;
        }

        var rucEmisor = registros.Select(x => (x.RucEmisor ?? string.Empty).Trim()).FirstOrDefault(x => x.Length > 0) ?? string.Empty;
        var (idEmpresa, empresa) = await ResolverEmpresaPorEmisorAsync(connection, rucEmisor, cancellationToken);

        foreach (var registro in registros)
        {
            registro.IdEmpresa = idEmpresa;
            registro.Empresa = empresa;
        }

        await connection.ExecuteAsync(
            _sql.Create(
                "dbo.sp_VentasSunat_AsignarEmpresa",
                new { Lote = lote, IdEmpresa = idEmpresa, Empresa = empresa },
                CommandType.StoredProcedure,
                cancellationToken,
                commandTimeout: 120));
    }

    private async Task<(int? IdEmpresa, string? Empresa)> ResolverEmpresaPorEmisorAsync(System.Data.IDbConnection connection, string rucEmisor, CancellationToken cancellationToken)
    {
        if (rucEmisor.Length == 0)
        {
            return (null, null);
        }

        var filas = await connection.QueryAsync(
            _sql.Create("dbo.sp_Constante_ListarPorCampo", new { Campo = "EMPRESA_cj" }, CommandType.StoredProcedure, cancellationToken, commandTimeout: 30));

        foreach (var fila in filas)
        {
            var datos = (IDictionary<string, object?>)fila;
            if (!string.Equals(Texto(datos, "Adicional"), rucEmisor, StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            var id = int.TryParse(Texto(datos, "Correlativo"), System.Globalization.NumberStyles.Integer, System.Globalization.CultureInfo.InvariantCulture, out var n) ? n : (int?)null;
            var nombre = Texto(datos, "ValorIni");
            return (id, nombre.Length > 0 ? nombre : null);
        }

        return (null, null);
    }

    private static string Texto(IDictionary<string, object?> datos, string columna)
    {
        foreach (var par in datos)
        {
            if (string.Equals(par.Key, columna, StringComparison.OrdinalIgnoreCase))
            {
                return Convert.ToString(par.Value, System.Globalization.CultureInfo.InvariantCulture)?.Trim() ?? string.Empty;
            }
        }

        return string.Empty;
    }
}
