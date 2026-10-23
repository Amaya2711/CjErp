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

        return new VentasSunatValidacionResultDto { Resumen = resumen, Registros = registros.ToList() };
    }
}
