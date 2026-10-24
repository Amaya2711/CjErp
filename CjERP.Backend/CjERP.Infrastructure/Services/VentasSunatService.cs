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
    /// Empresa de cada registro: 1) NroDocIdentidad se compara con ValorIni de la constante RELACION_VTA y su ValorFin es el IdEmpresa;
    /// 2) con ese ValorFin se busca la fila de EMPRESA_VTA cuyo ValorFin coincide y su ValorIni es el nombre de la Empresa.
    /// Ambos se graban en dbo.VentasSunat (IdEmpresa, Empresa).
    /// </summary>
    private async Task AsignarEmpresaAsync(System.Data.IDbConnection connection, Guid lote, List<VentasSunatRegistroDto> registros, CancellationToken cancellationToken)
    {
        if (registros.Count == 0)
        {
            return;
        }

        var relacion = await ListarConstanteAsync(connection, "RELACION_VTA", cancellationToken);
        var empresas = await ListarConstanteAsync(connection, "EMPRESA_VTA", cancellationToken);

        // RUC del cliente (ValorIni de RELACION_VTA) -> ValorFin (= IdEmpresa).
        var valorFinPorRuc = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var (valorIni, valorFin) in relacion)
        {
            if (!string.IsNullOrWhiteSpace(valorIni) && !string.IsNullOrWhiteSpace(valorFin))
            {
                valorFinPorRuc.TryAdd(valorIni, valorFin);
            }
        }

        // ValorFin -> nombre de la empresa (ValorIni de EMPRESA_VTA).
        var nombrePorValorFin = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var (valorIni, valorFin) in empresas)
        {
            if (!string.IsNullOrWhiteSpace(valorIni) && !string.IsNullOrWhiteSpace(valorFin))
            {
                nombrePorValorFin.TryAdd(valorFin, valorIni);
            }
        }

        (int? IdEmpresa, string? Empresa) Resolver(string? nroDocIdentidad)
        {
            var ruc = (nroDocIdentidad ?? string.Empty).Trim();
            if (ruc.Length == 0 || !valorFinPorRuc.TryGetValue(ruc, out var valorFin))
            {
                return (null, null);
            }

            var idEmpresa = int.TryParse(valorFin, System.Globalization.NumberStyles.Integer, System.Globalization.CultureInfo.InvariantCulture, out var id) ? id : (int?)null;
            return (idEmpresa, nombrePorValorFin.TryGetValue(valorFin, out var nombre) ? nombre : null);
        }

        foreach (var registro in registros)
        {
            var (idEmpresa, empresa) = Resolver(registro.NroDocIdentidad);
            registro.IdEmpresa = idEmpresa;
            registro.Empresa = empresa;
        }

        // Un RUC sin coincidencia en RELACION_VTA queda con IdEmpresa y Empresa en NULL.
        var asignaciones = registros
            .Select(r => (r.NroDocIdentidad ?? string.Empty).Trim())
            .Where(ruc => ruc.Length > 0)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Select(ruc =>
            {
                var (idEmpresa, empresa) = Resolver(ruc);
                return new { ruc, empresa, idEmpresa };
            })
            .ToList();

        await connection.ExecuteAsync(
            _sql.Create(
                "dbo.sp_VentasSunat_AsignarEmpresa",
                new { Lote = lote, Asignaciones = JsonSerializer.Serialize(asignaciones, new JsonSerializerOptions(JsonSerializerDefaults.Web)) },
                CommandType.StoredProcedure,
                cancellationToken,
                commandTimeout: 120));
    }

    private async Task<List<(string ValorIni, string ValorFin)>> ListarConstanteAsync(System.Data.IDbConnection connection, string campo, CancellationToken cancellationToken)
    {
        var filas = await connection.QueryAsync(
            _sql.Create("dbo.sp_Constante_ListarPorCampo", new { Campo = campo }, CommandType.StoredProcedure, cancellationToken, commandTimeout: 30));

        var resultado = new List<(string, string)>();
        foreach (var fila in filas)
        {
            var datos = (IDictionary<string, object?>)fila;
            resultado.Add((Texto(datos, "ValorIni"), Texto(datos, "ValorFin")));
        }

        return resultado;
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
