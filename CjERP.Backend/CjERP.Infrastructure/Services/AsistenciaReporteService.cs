using System.Data;
using System.Globalization;
using System.Text;
using CjERP.Application.DTOs;
using CjERP.Application.DTOs.ReportesWhatsapp;
using CjERP.Application.Interfaces.Services;
using Dapper;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;

namespace CjERP.Infrastructure.Services;

public class AsistenciaReporteService : IAsistenciaReporteService
{
    private const string ReporteSp = "dbo.RptAsistenciaFechas";
    private const decimal MissingOrIncompleteHours = 9.6m;

    private static readonly HashSet<string> PresentStates = new(StringComparer.OrdinalIgnoreCase)
    {
        "PRESENTE", "ASISTIO", "OK", "ASISTENCIA"
    };

    private static readonly HashSet<string> TardinessStates = new(StringComparer.OrdinalIgnoreCase)
    {
        "TARDANZA", "TARDE"
    };

    private static readonly HashSet<string> CriticalStates = new(StringComparer.OrdinalIgnoreCase)
    {
        "SIN MARCAR", "SIN SALIDA", "SIN ENTRADA", "FALTA", "INCOMPLETO", "FALTA APROBAR"
    };

    private readonly IConfiguration _configuration;
    private readonly IReportePdfService _reportePdfService;

    public AsistenciaReporteService(IConfiguration configuration, IReportePdfService reportePdfService)
    {
        _configuration = configuration;
        _reportePdfService = reportePdfService;
    }

    public async Task<IEnumerable<AsistenciaReporteDto>> BuscarAsync(
        AsistenciaReporteRequestDto request,
        CancellationToken cancellationToken = default)
    {
        var rows = await QueryReporteRowsAsync(request.FechaInicio, request.FechaFin, cancellationToken);
        return rows.Select(MapRow).ToList();
    }

    public async Task<byte[]> GenerarPdfGerencialAsync(
        AsistenciaReportePdfRequestDto request,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();

        var rows = await QueryReporteRowsAsync(request.FechaInicio, request.FechaFin, cancellationToken);
        var detalle = rows.Select(MapPdfRow).ToList();

        var periodo = new ReporteWhatsappPeriodoDto
        {
            FechaInicio = request.FechaInicio?.Trim() ?? string.Empty,
            FechaFin = request.FechaFin?.Trim() ?? string.Empty,
            FechaProceso = ResolveFechaProceso(request.FechaFin),
            EtiquetaPeriodo = $"{request.FechaInicio?.Trim()} - {request.FechaFin?.Trim()}"
        };

        var destinatario = new ReporteWhatsappEmpleadoDto
        {
            IdEmpleado = 0,
            NombreEmpleado = string.IsNullOrWhiteSpace(request.Destinatario) ? "Reporte x Empleado" : request.Destinatario.Trim()
        };

        return await _reportePdfService.GenerarReportePdfAsync(
            ReporteWhatsappTipos.Gerencial,
            destinatario,
            periodo,
            detalle,
            cancellationToken);
    }

    public async Task<AsistenciaGerencialPdfDto> ObtenerReporteGerencialAsync(
        AsistenciaGerencialPdfRequestDto request,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();

        var periodo = ResolveExecutivePeriod(request);
        var rows = await QueryReporteRowsAsync(periodo.FechaInicioTexto, periodo.FechaFinTexto, cancellationToken);
        var detalle = rows.Select(MapPdfRow).ToList();

        if (detalle.Count == 0)
        {
            throw new InvalidOperationException("No existen datos de asistencia para el periodo consultado.");
        }

        return BuildExecutiveReport(
            detalle,
            periodo,
            string.IsNullOrWhiteSpace(request.Destinatario) ? "Gerencia CJ Telecom" : request.Destinatario.Trim());
    }

    public async Task<byte[]> GenerarPdfGerencialEjecutivoAsync(
        AsistenciaGerencialPdfRequestDto request,
        CancellationToken cancellationToken = default)
    {
        var reporte = await ObtenerReporteGerencialAsync(request, cancellationToken);
        return await _reportePdfService.GenerarReporteGerencialEjecutivoPdfAsync(reporte, cancellationToken);
    }

    private async Task<IEnumerable<dynamic>> QueryReporteRowsAsync(
        string? fechaInicio,
        string? fechaFin,
        CancellationToken cancellationToken)
    {
        using var connection = new SqlConnection(_configuration.GetConnectionString("DefaultConnection"));

        var parameters = new DynamicParameters();
        parameters.Add("@FechaInicio", NullIfWhiteSpace(fechaInicio), DbType.String);
        parameters.Add("@FechaFin", NullIfWhiteSpace(fechaFin), DbType.String);

        return await connection.QueryAsync(
            new CommandDefinition(
                ReporteSp,
                parameters,
                commandType: CommandType.StoredProcedure,
                cancellationToken: cancellationToken));
    }

    private static AsistenciaGerencialPdfDto BuildExecutiveReport(
        IReadOnlyList<ReporteWhatsappAsistenciaItemDto> detalle,
        AsistenciaGerencialPeriodoDto periodo,
        string destinatario)
    {
        var totalRegistros = detalle.Count;
        var totalEmpleados = detalle
            .Select(item => item.IdEmpleado > 0 ? item.IdEmpleado.ToString(CultureInfo.InvariantCulture) : item.NombreEmpleado.Trim())
            .Where(value => !string.IsNullOrWhiteSpace(value))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Count();

        var chartEstado = detalle
            .GroupBy(GetDisplayState)
            .Select(group =>
            {
                var estadoTexto = NormalizeState(group.Key).Trim();

                return new AsistenciaGerencialEstadoChartItemDto
                {
                    Estado = group.Key,
                    Cantidad = group.Count(),
                    Porcentaje = totalRegistros == 0 ? 0m : Math.Round(group.Count() * 100m / totalRegistros, 2),
                    Semaforo = ResolveStateToneByText(estadoTexto)
                };
            })
            .OrderByDescending(item => item.Cantidad)
            .ThenBy(item => item.Estado, StringComparer.OrdinalIgnoreCase)
            .ToList();

        var alertRows = detalle.Where(IsAlertState).ToList();
        var warningRows = detalle.Where(IsWarningState).ToList();
        var optimalRows = detalle.Where(IsOptimalState).ToList();
        var nonEffectiveRows = detalle.Where(IsNonEffectiveAttendanceState).ToList();

        var presentes = optimalRows.Count;
        var tardanzas = warningRows.Count;
        var sinMarcar = alertRows.Count(item => NormalizeText(GetDisplayState(item)) == "SIN MARCAR");
        var sinSalida = alertRows.Count(item => NormalizeText(GetDisplayState(item)) == "SIN SALIDA");
        var totalHoras = detalle.Sum(item => item.TotalHoras);
        var promedioHoras = totalEmpleados > 0 ? totalHoras / totalEmpleados : 0m;
        var asistenciaEfectiva = Math.Max(0, totalRegistros - nonEffectiveRows.Count);
        var porcentajeAsistencia = totalRegistros > 0
            ? Math.Round((asistenciaEfectiva * 100m) / totalRegistros, 2)
            : 0m;

        var diferenciaPorEmpleado = detalle
            .GroupBy(item => item.IdEmpleado > 0 ? item.IdEmpleado : item.NombreEmpleado.GetHashCode(StringComparison.OrdinalIgnoreCase))
            .Select(group =>
            {
                var ordered = group
                    .OrderByDescending(GetRowScore)
                    .ThenBy(item => item.NombreEmpleado, StringComparer.OrdinalIgnoreCase)
                    .ToList();

                var principal = ordered.First();
                var horasLaborales = group.Max(item => item.TotalHorasLaborales);
                var diferencia = group.Min(item => item.DiferenciaHoras);

                return new AsistenciaGerencialEmpleadoDiferenciaDto
                {
                    NombreEmpleado = principal.NombreEmpleado,
                    Responsable = EmptyIfMissing(principal.Responsable, "Sin responsable"),
                    DiferenciaHoras = Math.Round(diferencia, 2),
                    HorasLaboradas = Math.Round(horasLaborales, 2),
                    HorasConsideradas = Math.Round(group.Max(item => item.TotalHorasEmpleado) + group.Max(item => item.TotalHorasFaltaAprobar), 2)
                };
            })
            .ToList();

        var pendientesAprobacion = detalle
            .GroupBy(item => item.IdEmpleado > 0 ? item.IdEmpleado : item.NombreEmpleado.GetHashCode(StringComparison.OrdinalIgnoreCase))
            .Select(group =>
            {
                var principal = group
                    .OrderByDescending(GetRowScore)
                    .First();

                return new AsistenciaGerencialPendienteAprobacionDto
                {
                    NombreEmpleado = principal.NombreEmpleado,
                    Responsable = EmptyIfMissing(principal.Responsable, "Sin responsable"),
                    CantidadPendientes = group.Count(IsPendingApprovalRow),
                    HorasPendientes = Math.Round(group.Where(IsPendingApprovalRow).Sum(item => item.TotalHorasFaltaAprobar), 2)
                };
            })
            .Where(item => item.CantidadPendientes > 0 || item.HorasPendientes > 0m)
            .OrderByDescending(item => item.CantidadPendientes)
            .ThenByDescending(item => item.HorasPendientes)
            .ThenBy(item => item.NombreEmpleado, StringComparer.OrdinalIgnoreCase)
            .Take(10)
            .ToList();

        var employeesWithNegativeDifference = diferenciaPorEmpleado
            .Where(item => item.DiferenciaHoras < 0m)
            .OrderBy(item => item.DiferenciaHoras)
            .ThenBy(item => item.NombreEmpleado, StringComparer.OrdinalIgnoreCase)
            .Take(10)
            .ToList();

        var kpis = new AsistenciaGerencialKpisDto
        {
            TotalEmpleados = totalEmpleados,
            TotalRegistros = totalRegistros,
            PorcentajeAsistencia = porcentajeAsistencia,
            Presentes = asistenciaEfectiva,
            Tardanzas = tardanzas,
            SinMarcar = sinMarcar,
            SinSalida = sinSalida,
            TotalHorasLaboradas = Math.Round(totalHoras, 2),
            PromedioHorasPorEmpleado = Math.Round(promedioHoras, 2),
            PendientesAprobacion = pendientesAprobacion.Count,
            EmpleadosConDiferenciaNegativa = employeesWithNegativeDifference.Count,
            SemaforoGeneral = porcentajeAsistencia >= 95m ? "VERDE" : "ROJO"
        };

        var tendenciaDiaria = detalle
            .GroupBy(item => ParseDate(item.Fecha)?.Date)
            .Where(group => group.Key.HasValue)
            .OrderBy(group => group.Key)
            .Select(group =>
            {
                var date = group.Key!.Value;
                var totalDia = group.Count();
                var presentesDia = group.Count(item => IsOptimalState(item));
                var incidenciasDia = group.Count(item => IsAlertState(item));

                return new AsistenciaGerencialTendenciaDiariaDto
                {
                    Fecha = date,
                    FechaTexto = date.ToString("dd/MM", CultureInfo.InvariantCulture),
                    TotalRegistros = totalDia,
                    Presentes = presentesDia,
                    Incidencias = incidenciasDia,
                    PorcentajeAsistencia = totalDia == 0 ? 0m : Math.Round(incidenciasDia * 100m / totalDia, 2)
                };
            })
            .ToList();

        var criticalResponsableRows = detalle
            .Where(IsCriticalResponsableState)
            .ToList();

        var topResponsables = criticalResponsableRows
            .GroupBy(item => EmptyIfMissing(item.Responsable, "Sin responsable"))
            .Select(group => new AsistenciaGerencialRankingItemDto
            {
                Nombre = group.Key,
                Cantidad = group.Count(),
                Horas = Math.Round(group.Sum(item => Math.Abs(item.DiferenciaHoras)), 2),
                EtiquetaSecundaria = $"{group.Select(item => item.NombreEmpleado).Distinct(StringComparer.OrdinalIgnoreCase).Count()} emp.",
                Semaforo = ResolveRankingSemaphore(group.Count())
            })
            .OrderByDescending(item => item.Cantidad)
            .ThenBy(item => item.Nombre, StringComparer.OrdinalIgnoreCase)
            .Take(10)
            .ToList();

        var topEmpleados = detalle
            .GroupBy(item => item.IdEmpleado > 0 ? item.IdEmpleado : item.NombreEmpleado.GetHashCode(StringComparison.OrdinalIgnoreCase))
            .Select(group =>
            {
                var principal = group.OrderByDescending(GetRowScore).First();
                var diferencia = group.Min(item => item.DiferenciaHoras);
                var incidencias = group.Count(item => IsAlertState(item));

                return new AsistenciaGerencialRankingItemDto
                {
                    Nombre = principal.NombreEmpleado,
                    Cantidad = incidencias,
                    Horas = Math.Round(diferencia, 2),
                    EtiquetaSecundaria = EmptyIfMissing(principal.Responsable, "Sin responsable"),
                    Semaforo = diferencia < -8m || incidencias >= 3 ? "ROJO" : diferencia < 0m || incidencias >= 1 ? "AMARILLO" : "VERDE"
                };
            })
            .OrderBy(item => item.Horas)
            .ThenByDescending(item => item.Cantidad)
            .ThenBy(item => item.Nombre, StringComparer.OrdinalIgnoreCase)
            .Take(10)
            .ToList();

        var incidencias = new AsistenciaGerencialIncidenciasDto
        {
            IncidenciasPorResponsable = BuildNegativeDifferenceByResponsable(employeesWithNegativeDifference),
            IncidenciasPorCliente = BuildGroupedIncidencias(alertRows, item => EmptyIfMissing(item.Cliente, "Sin cliente"), includeOnlyIncidents: false),
            IncidenciasPorArea = BuildGroupedIncidencias(alertRows, item => EmptyIfMissing(item.Area, "Sin area"), includeOnlyIncidents: false),
            IncidenciasPorEstado = BuildGroupedIncidencias(alertRows, item => GetDisplayState(item), includeOnlyIncidents: false),
            PendientesAprobacion = pendientesAprobacion,
            EmpleadosConDiferenciaNegativa = employeesWithNegativeDifference,
            RecomendacionesEjecutivas = BuildExecutiveRecommendations(
                totalRegistros,
                alertRows.Count,
                warningRows.Count,
                chartEstado,
                topResponsables,
                topEmpleados,
                pendientesAprobacion,
                BuildGroupedIncidencias(alertRows, item => EmptyIfMissing(item.Cliente, "Sin cliente"), includeOnlyIncidents: false),
                BuildGroupedIncidencias(alertRows, item => EmptyIfMissing(item.Area, "Sin area"), includeOnlyIncidents: false))
        };

        return new AsistenciaGerencialPdfDto
        {
            PeriodoConsultado = $"{periodo.FechaInicioTexto} - {periodo.FechaFinTexto}",
            FechaGeneracion = GetPeruNow(),
            Destinatario = destinatario,
            NombreArchivo = $"Reporte_Gerencial_Asistencia_{periodo.FechaInicio:yyyyMMdd}_{periodo.FechaFin:yyyyMMdd}.pdf",
            Periodo = periodo,
            Kpis = kpis,
            Graficos = new AsistenciaGerencialGraficosDto
            {
                DistribucionPorEstado = chartEstado,
                TendenciaDiaria = tendenciaDiaria,
                TopResponsables = topResponsables,
                TopEmpleados = topEmpleados
            },
            Incidencias = incidencias,
            ResumenEjecutivo = BuildExecutiveConclusions(chartEstado)
        };
    }

    private static IReadOnlyList<AsistenciaGerencialGrupoIncidenciaDto> BuildGroupedIncidencias(
        IReadOnlyList<ReporteWhatsappAsistenciaItemDto> detalle,
        Func<ReporteWhatsappAsistenciaItemDto, string> selector,
        bool includeOnlyIncidents = true)
    {
        var source = includeOnlyIncidents ? detalle.Where(IsIncidentState).ToList() : detalle.ToList();
        var total = source.Count;

        return source
            .GroupBy(selector)
            .Select(group => new AsistenciaGerencialGrupoIncidenciaDto
            {
                Nombre = group.Key,
                Cantidad = group.Count(),
                Porcentaje = total == 0 ? 0m : Math.Round(group.Count() * 100m / total, 2)
            })
            .OrderByDescending(item => item.Cantidad)
            .ThenBy(item => item.Nombre, StringComparer.OrdinalIgnoreCase)
            .Take(10)
            .ToList();
    }

    private static IReadOnlyList<AsistenciaGerencialConclusionDto> BuildExecutiveConclusions(
        IReadOnlyList<AsistenciaGerencialEstadoChartItemDto> chartEstado)
    {
        return chartEstado
            .Where(item => item.Semaforo == "ROJO")
            .OrderByDescending(item => item.Cantidad)
            .ThenBy(item => item.Estado, StringComparer.OrdinalIgnoreCase)
            .Take(5)
            .Select(item => new AsistenciaGerencialConclusionDto
            {
                Semaforo = "ROJO",
                Titulo = item.Estado,
                Descripcion = $"{item.Estado}: {item.Cantidad} registros ({item.Porcentaje:0.00}% del total) en nivel ALERTA."
            })
            .ToList();
    }

    private static IReadOnlyList<string> BuildExecutiveRecommendations(
        int totalRegistros,
        int totalAlertas,
        int totalPrecauciones,
        IReadOnlyList<AsistenciaGerencialEstadoChartItemDto> chartEstado,
        IReadOnlyList<AsistenciaGerencialRankingItemDto> topResponsables,
        IReadOnlyList<AsistenciaGerencialRankingItemDto> topEmpleados,
        IReadOnlyList<AsistenciaGerencialPendienteAprobacionDto> pendientesAprobacion,
        IReadOnlyList<AsistenciaGerencialGrupoIncidenciaDto> incidenciasPorCliente,
        IReadOnlyList<AsistenciaGerencialGrupoIncidenciaDto> incidenciasPorArea)
    {
        var recommendations = new List<string>();

        var estadoCritico = chartEstado
            .Where(item => item.Semaforo == "ROJO")
            .OrderByDescending(item => item.Cantidad)
            .ThenBy(item => item.Estado, StringComparer.OrdinalIgnoreCase)
            .FirstOrDefault();

        if (estadoCritico is not null)
        {
            recommendations.Add(
                $"Accion critica: el estado {estadoCritico.Estado} concentra {estadoCritico.Cantidad} registros ({estadoCritico.Porcentaje:0.00}% del total). Priorizar regularizacion y sustento documentado antes del siguiente cierre.");
        }

        var responsableCritico = topResponsables
            .OrderByDescending(item => item.Cantidad)
            .ThenBy(item => item.Nombre, StringComparer.OrdinalIgnoreCase)
            .FirstOrDefault();

        if (responsableCritico is not null && responsableCritico.Cantidad > 0)
        {
            recommendations.Add(
                $"Seguimiento responsable: {responsableCritico.Nombre} concentra {responsableCritico.Cantidad} incidencias{(string.IsNullOrWhiteSpace(responsableCritico.EtiquetaSecundaria) ? string.Empty : $" en {responsableCritico.EtiquetaSecundaria}")}. Solicitar cierre de casos y validacion de marcaciones dentro de 72 horas.");
        }

        var pendientePrincipal = pendientesAprobacion
            .OrderByDescending(item => item.CantidadPendientes)
            .ThenByDescending(item => item.HorasPendientes)
            .ThenBy(item => item.NombreEmpleado, StringComparer.OrdinalIgnoreCase)
            .FirstOrDefault();

        if (pendientePrincipal is not null && (pendientePrincipal.CantidadPendientes > 0 || pendientePrincipal.HorasPendientes > 0m))
        {
            recommendations.Add(
                $"Pendientes de aprobacion: {pendientePrincipal.NombreEmpleado} registra {pendientePrincipal.CantidadPendientes} pendientes y {pendientePrincipal.HorasPendientes:0.00} horas por validar. Confirmar aprobacion o regularizacion para evitar ajustes posteriores.");
        }

        var brechaCritica = topEmpleados
            .Where(item => item.Horas < 0m)
            .OrderBy(item => item.Horas)
            .ThenByDescending(item => item.Cantidad)
            .FirstOrDefault();

        if (brechaCritica is not null)
        {
            recommendations.Add(
                $"Brecha operativa: {brechaCritica.Nombre} presenta una diferencia de {brechaCritica.Horas:0.00} horas y {brechaCritica.Cantidad} incidencias asociadas. Verificar si corresponde a omision de marcacion, ausencia real o ajuste manual.");
        }

        var clienteCritico = incidenciasPorCliente
            .Where(item => !string.Equals(item.Nombre, "Sin cliente", StringComparison.OrdinalIgnoreCase))
            .OrderByDescending(item => item.Cantidad)
            .ThenBy(item => item.Nombre, StringComparer.OrdinalIgnoreCase)
            .FirstOrDefault();

        var areaCritica = incidenciasPorArea
            .Where(item => !string.Equals(item.Nombre, "Sin area", StringComparison.OrdinalIgnoreCase))
            .OrderByDescending(item => item.Cantidad)
            .ThenBy(item => item.Nombre, StringComparer.OrdinalIgnoreCase)
            .FirstOrDefault();

        if (clienteCritico is not null || areaCritica is not null)
        {
            var clienteTexto = clienteCritico is null
                ? string.Empty
                : $"cliente {clienteCritico.Nombre} con {clienteCritico.Cantidad} incidencias ({clienteCritico.Porcentaje:0.00}%)";
            var areaTexto = areaCritica is null
                ? string.Empty
                : $"area {areaCritica.Nombre} con {areaCritica.Cantidad} incidencias ({areaCritica.Porcentaje:0.00}%)";
            var union = !string.IsNullOrWhiteSpace(clienteTexto) && !string.IsNullOrWhiteSpace(areaTexto) ? " y " : string.Empty;

            recommendations.Add(
                $"Foco de seguimiento: concentrar revision en {clienteTexto}{union}{areaTexto}. Estos segmentos acumulan la mayor presion operativa del periodo y requieren monitoreo preventivo.");
        }

        if (recommendations.Count < 5 && totalPrecauciones > 0)
        {
            var porcentajePrecaucion = totalRegistros == 0 ? 0m : Math.Round(totalPrecauciones * 100m / totalRegistros, 2);
            recommendations.Add(
                $"Prevencion: se identificaron {totalPrecauciones} registros en PRECAUCION ({porcentajePrecaucion:0.00}% del total). Revisarlos a tiempo evita que evolucionen a ALERTA en el siguiente corte.");
        }

        if (recommendations.Count == 0)
        {
            recommendations.Add(
                totalAlertas > 0
                    ? $"Se detectaron {totalAlertas} registros en ALERTA. Mantener seguimiento diario hasta cerrar regularizaciones y evitar arrastre al siguiente periodo."
                    : "No se detectaron alertas criticas en el periodo. Mantener el seguimiento preventivo de aprobaciones y diferencias para sostener el nivel operativo.");
        }

        return recommendations.Take(5).ToList();
    }

    private static AsistenciaGerencialPeriodoDto ResolveExecutivePeriod(AsistenciaGerencialPdfRequestDto request)
    {
        var shouldAutoResolve = request.UsarPeriodoAutomatico
            || string.IsNullOrWhiteSpace(request.FechaInicio)
            || string.IsNullOrWhiteSpace(request.FechaFin);

        if (shouldAutoResolve)
        {
            var today = GetPeruNow().Date;
            var offset = ((int)today.DayOfWeek + 6) % 7;
            var currentWeekStart = today.AddDays(-offset);
            var start = currentWeekStart.AddDays(-7);
            var end = start.AddDays(6);

            return new AsistenciaGerencialPeriodoDto
            {
                FechaInicio = start,
                FechaFin = end,
                FechaInicioTexto = start.ToString("dd/MM/yyyy", CultureInfo.InvariantCulture),
                FechaFinTexto = end.ToString("dd/MM/yyyy", CultureInfo.InvariantCulture)
            };
        }

        var fechaInicio = ParseRequiredDate(request.FechaInicio, nameof(request.FechaInicio));
        var fechaFin = ParseRequiredDate(request.FechaFin, nameof(request.FechaFin));

        if (fechaInicio > fechaFin)
        {
            throw new InvalidOperationException("La fecha de inicio no puede ser mayor que la fecha fin.");
        }

        return new AsistenciaGerencialPeriodoDto
        {
            FechaInicio = fechaInicio,
            FechaFin = fechaFin,
            FechaInicioTexto = fechaInicio.ToString("dd/MM/yyyy", CultureInfo.InvariantCulture),
            FechaFinTexto = fechaFin.ToString("dd/MM/yyyy", CultureInfo.InvariantCulture)
        };
    }

    private static DateTime ParseRequiredDate(string? value, string fieldName)
    {
        var parsed = ParseDate(value);
        if (!parsed.HasValue)
        {
            throw new InvalidOperationException($"El campo {fieldName} no tiene un formato de fecha valido.");
        }

        return parsed.Value.Date;
    }

    private static decimal CalculateMissingIncompleteHours(IEnumerable<ReporteWhatsappAsistenciaItemDto> items)
    {
        return items.Sum(item =>
        {
            var states = SplitStates(item.EstadoMarcacionTexto, item.Estado);
            return states.Any(state => state is "FALTA" or "INCOMPLETO") ? MissingOrIncompleteHours : 0m;
        });
    }

    private static bool IsIncidentState(ReporteWhatsappAsistenciaItemDto item)
    {
        return IsAlertState(item);
    }

    private static string NormalizeState(ReporteWhatsappAsistenciaItemDto item)
    {
        return NormalizeText(GetDisplayState(item));
    }

    private static string NormalizeState(string estado)
    {
        return NormalizeText(estado);
    }

    private static IReadOnlyList<string> SplitStates(string? estadoMarcacionTexto, string? estado)
    {
        var source = !string.IsNullOrWhiteSpace(estadoMarcacionTexto) ? estadoMarcacionTexto : estado;
        if (string.IsNullOrWhiteSpace(source))
        {
            return ["SIN CLASIFICAR"];
        }

        return source
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(NormalizeText)
            .Where(value => !string.IsNullOrWhiteSpace(value))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();
    }

    private static string ResolveOverallSemaphore(decimal porcentajeAsistencia, int sinMarcar, int sinSalida, int negativos)
    {
        if (porcentajeAsistencia < 90m || sinMarcar >= 5 || sinSalida >= 5 || negativos >= 5)
        {
            return "ROJO";
        }

        if (porcentajeAsistencia < 95m || sinMarcar > 0 || sinSalida > 0 || negativos > 0)
        {
            return "AMARILLO";
        }

        return "VERDE";
    }

    private static string ResolveStateSemaphore(string estado, int cantidad, int total)
    {
        var normalized = NormalizeText(estado);
        var ratio = total == 0 ? 0m : cantidad * 100m / total;

        if (normalized is "SIN MARCAR" or "SIN SALIDA" or "SIN ENTRADA" or "FALTA")
        {
            return ratio >= 10m ? "ROJO" : "AMARILLO";
        }

        if (normalized is "TARDANZA" or "TARDE")
        {
            return ratio >= 12m ? "ROJO" : ratio >= 5m ? "AMARILLO" : "VERDE";
        }

        return "VERDE";
    }

    private static bool IsAlertState(ReporteWhatsappAsistenciaItemDto item)
    {
        return item.IdEstado is 0 or 2 or 20 or 22;
    }

    private static bool IsNonEffectiveAttendanceState(ReporteWhatsappAsistenciaItemDto item)
    {
        var estado = NormalizeText(GetDisplayState(item));
        return estado is "FALTA" or "FALTA APROBAR" or "INCOMPLETO" or "RECHAZADO";
    }

    private static bool IsPendingApprovalRow(ReporteWhatsappAsistenciaItemDto item)
    {
        var estado = NormalizeText(GetDisplayState(item));
        return estado == "FALTA APROBAR" && item.TotalHorasFaltaAprobar > 0m;
    }

    private static bool IsCriticalResponsableState(ReporteWhatsappAsistenciaItemDto item)
    {
        var states = SplitStates(item.EstadoMarcacionTexto, item.Estado);
        return states.Any(state => state is "FALTA" or "FALTA APROBAR" or "INCOMPLETO" or "RECHAZADO");
    }

    private static bool IsWarningState(ReporteWhatsappAsistenciaItemDto item)
    {
        return item.IdEstado is 3 or 5 or 6 or 7 or 8 or 9 or 10 or 14 or 15 or 19;
    }

    private static bool IsOptimalState(ReporteWhatsappAsistenciaItemDto item)
    {
        return item.IdEstado is 1 or 4 or 11 or 12 or 13 or 16 or 17 or 18 or 21 or 97 or 98 or 99 or 100;
    }

    private static string ResolveStateTone(ReporteWhatsappAsistenciaItemDto? item)
    {
        if (item is null)
        {
            return "AMARILLO";
        }

        if (IsAlertState(item))
        {
            return "ROJO";
        }

        if (IsWarningState(item))
        {
            return "AMARILLO";
        }

        if (IsOptimalState(item))
        {
            return "VERDE";
        }

        return "AMARILLO";
    }

    private static string ResolveStateToneByText(string estado)
    {
        estado = NormalizeState(estado).Trim();

        if (estado.Contains("PRESENTE", StringComparison.Ordinal) ||
            estado.Contains("ASISTIO", StringComparison.Ordinal) ||
            estado.Contains("OK", StringComparison.Ordinal) ||
            estado.Contains("DOMINGO", StringComparison.Ordinal) ||
            estado.Contains("SABADO", StringComparison.Ordinal) ||
            estado.Contains("VACACIONES", StringComparison.Ordinal) ||
            estado.Contains("INACTIVO", StringComparison.Ordinal))
        {
            return "VERDE";
        }

        if (estado.Contains("FALTA", StringComparison.Ordinal) ||
            estado.Contains("SIN MARCAR", StringComparison.Ordinal) ||
            estado.Contains("SIN SALIDA", StringComparison.Ordinal) ||
            estado.Contains("SIN ENTRADA", StringComparison.Ordinal) ||
            estado.Contains("RECHAZADO", StringComparison.Ordinal))
        {
            return "ROJO";
        }

        if (estado.Contains("COMPENSACION", StringComparison.Ordinal) ||
            estado.Contains("DESCANSO MEDICO", StringComparison.Ordinal) ||
            estado.Contains("REMOTO", StringComparison.Ordinal) ||
            estado.Contains("TARDANZA", StringComparison.Ordinal) ||
            estado.Contains("TARDE", StringComparison.Ordinal) ||
            estado.Contains("FALTA APROBAR", StringComparison.Ordinal) ||
            estado.Contains("INCOMPLETO", StringComparison.Ordinal))
        {
            return "AMARILLO";
        }

        return "AMARILLO";
    }

    private static string GetDisplayState(ReporteWhatsappAsistenciaItemDto item)
    {
        return EmptyIfMissing(item.EstadoMarcacionTexto, EmptyIfMissing(item.Estado, "SIN CLASIFICAR"));
    }

    private static IReadOnlyList<AsistenciaGerencialGrupoIncidenciaDto> BuildNegativeDifferenceByResponsable(
        IReadOnlyList<AsistenciaGerencialEmpleadoDiferenciaDto> rows)
    {
        var source = rows.Where(item => item.DiferenciaHoras < 0m).ToList();
        var total = Math.Max(1, source.Count);

        return source
            .GroupBy(item => EmptyIfMissing(item.Responsable, "Sin responsable"))
            .Select(group => new AsistenciaGerencialGrupoIncidenciaDto
            {
                Nombre = group.Key,
                Cantidad = group.Count(),
                Porcentaje = Math.Round(group.Count() * 100m / total, 2)
            })
            .OrderByDescending(item => item.Cantidad)
            .ThenBy(item => item.Nombre, StringComparer.OrdinalIgnoreCase)
            .Take(10)
            .ToList();
    }

    private static string ResolveRankingSemaphore(int cantidad)
    {
        if (cantidad >= 8)
        {
            return "ROJO";
        }

        if (cantidad >= 4)
        {
            return "AMARILLO";
        }

        return "VERDE";
    }

    private static decimal GetRowScore(ReporteWhatsappAsistenciaItemDto item)
    {
        return Math.Abs(item.TotalHorasEmpleado)
            + Math.Abs(item.TotalHoras)
            + Math.Abs(item.TotalHorasFaltaAprobar)
            + Math.Abs(item.TotalHorasFaltaIncompleto)
            + Math.Abs(item.TotalHorasLaborales)
            + Math.Abs(item.DiferenciaHoras);
    }

    private static string EmptyIfMissing(string? value, string fallback = "-")
    {
        return string.IsNullOrWhiteSpace(value) ? fallback : value.Trim();
    }

    private static string NormalizeText(string? value)
    {
        return string.IsNullOrWhiteSpace(value)
            ? string.Empty
            : new string(value
                .Normalize(NormalizationForm.FormD)
                .Where(ch => CharUnicodeInfo.GetUnicodeCategory(ch) != UnicodeCategory.NonSpacingMark)
                .ToArray())
                .Trim()
                .ToUpperInvariant();
    }

    private static DateTime? ParseDate(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        if (DateTime.TryParseExact(value.Trim(), "dd/MM/yyyy", CultureInfo.InvariantCulture, DateTimeStyles.None, out var displayDate))
        {
            return displayDate;
        }

        if (DateTime.TryParseExact(value.Trim(), "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var apiDate))
        {
            return apiDate;
        }

        return DateTime.TryParse(value, out var parsed) ? parsed : null;
    }

    private static string? NullIfWhiteSpace(string? value)
    {
        return string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    }

    private static DateTime ResolveFechaProceso(string? fechaFin)
    {
        if (DateTime.TryParse(fechaFin?.Trim(), CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsed))
        {
            return parsed.Date;
        }

        var parts = fechaFin?.Split('/', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (parts?.Length == 3 &&
            int.TryParse(parts[0], out var day) &&
            int.TryParse(parts[1], out var month) &&
            int.TryParse(parts[2], out var year))
        {
            return new DateTime(year, month, day);
        }

        return GetPeruNow().Date;
    }

    private static DateTime GetPeruNow()
    {
        foreach (var timeZoneId in new[] { "SA Pacific Standard Time", "America/Lima" })
        {
            try
            {
                return TimeZoneInfo.ConvertTime(DateTimeOffset.UtcNow, TimeZoneInfo.FindSystemTimeZoneById(timeZoneId)).DateTime;
            }
            catch
            {
                // Continuar con la siguiente zona horaria disponible.
            }
        }

        return DateTime.UtcNow;
    }

    private static AsistenciaReporteDto MapRow(dynamic row)
    {
        var values = (IDictionary<string, object?>)row;

        return new AsistenciaReporteDto
        {
            Fecha = GetDateString(values, "Fecha", "fecha"),
            Hora = GetTimeString(values, "Hora", "hora", "Fecha", "fecha", "HoraEntrada", "horaEntrada"),
            NombreEmpleado = GetString(values, "nombreempleado", "NombreEmpleado", "nombreEmpleado"),
            TipoAprobacion = GetString(values, "TipoAprobacion", "tipoAprobacion", "tipo_aprobacion"),
            Responsable = GetString(values, "Responsable", "responsable"),
            Estado = GetString(values, "Estado", "estado"),
            Comentario = GetString(values, "Comentario", "comentario"),
            Observacion = GetString(values, "Observacion", "observacion"),
            Empresa = GetString(values, "empresa", "Empresa"),
            Cliente = GetString(values, "Cliente", "cliente"),
            Proyecto = GetString(values, "Proyecto", "proyecto", "NombreProyecto", "nombreProyecto"),
            Site = GetString(values, "Site", "site", "NombreSite", "nombreSite"),
            Area = GetString(values, "Area", "area"),
            Ubicacion = GetString(values, "Ubicacion", "ubicacion", "ValorIni", "valorini"),
            IdEmpleado = GetInt(values, "IdEmpleado", "idEmpleado"),
            EstadoAct = GetString(values, "EstadoAct", "estadoAct"),
            Sexo = GetString(values, "Sexo", "sexo"),
            FechaIniLaboral = GetDateString(values, "FechaIniLaboral", "fechaIniLaboral"),
            FechaFinLaboral = GetDateString(values, "FechaFinlaboral", "FechaFinLaboral", "fechaFinLaboral"),
            Salida = GetTimeString(values, "Salida", "salida", "HoraSalida", "horaSalida"),
            EstadoMarcacionTexto = GetString(values, "EstadoMarcacionTexto", "estadoMarcacionTexto"),
            TiempoTrabajado = GetString(values, "TiempoTrabajado", "tiempoTrabajado"),
            TotalHoras = GetDecimal(values, "TotalHoras", "totalHoras"),
            TotalHorasEmpleado = GetDecimal(values, "TotalHorasEmpleado", "totalHorasEmpleado", "HorasLaboradas", "horasLaboradas"),
            TotalHorasLaborales = GetDecimal(values, "TotalHorasLaborales", "totalHorasLaborales"),
            TotalHorasFaltaAprobar = GetDecimal(values, "TotalHorasFaltaAprobar", "totalHorasFaltaAprobar"),
            EstadoValidacionHoras = GetString(values, "EstadoValidacionHoras", "estadoValidacionHoras", "Estadovalidacionhoras", "estadovalidacionhoras"),
            TiempoHoras = GetString(values, "TiempoHoras", "tiempoHoras"),
            OrigenMarcacion = GetString(values, "OrigenMarcacion", "origenMarcacion")
        };
    }

    private static ReporteWhatsappAsistenciaItemDto MapPdfRow(dynamic row)
    {
        var values = (IDictionary<string, object?>)row;

        return new ReporteWhatsappAsistenciaItemDto
        {
            IdEmpleado = GetInt(values, "IdEmpleado", "idEmpleado") ?? 0,
            IdEstado = GetInt(values, "IdEstado", "idEstado", "Id_Estado", "id_estado"),
            Fecha = GetDateDisplayString(values, "Fecha", "fecha"),
            NombreEmpleado = GetString(values, "nombreempleado", "NombreEmpleado", "nombreEmpleado"),
            Responsable = GetString(values, "Responsable", "responsable"),
            Cliente = GetString(values, "Cliente", "cliente"),
            Area = GetString(values, "Area", "area"),
            Proyecto = GetString(values, "Proyecto", "proyecto", "NombreProyecto", "nombreProyecto"),
            Site = GetString(values, "Site", "site", "NombreSite", "nombreSite"),
            Estado = GetString(values, "Estado", "estado"),
            EstadoMarcacionTexto = GetString(values, "EstadoMarcacionTexto", "estadoMarcacionTexto", "Estado", "estado"),
            Ubicacion = GetString(values, "Ubicacion", "ubicacion", "ValorIni", "valorini"),
            HoraEntrada = GetTimeString(values, "Hora", "hora", "HoraEntrada", "horaEntrada"),
            HoraSalida = GetTimeString(values, "Salida", "salida", "HoraSalida", "horaSalida"),
            TiempoHoras = GetString(values, "TiempoHoras", "tiempoHoras"),
            TotalHoras = GetDecimal(values, "TotalHoras", "totalHoras"),
            TotalHorasFaltaIncompleto = GetDecimal(values, "TotalHorasFaltaIncompleto", "totalHorasFaltaIncompleto", "HrsOtrosEmpleado", "hrsOtrosEmpleado", "HrsOtros", "hrsOtros", "ValorNuevoEstado", "valorNuevoEstado"),
            TotalHorasEmpleado = GetDecimal(values, "TotalHorasEmpleado", "totalHorasEmpleado"),
            TotalHorasLaborales = GetDecimal(values, "TotalHorasLaborales", "totalHorasLaborales"),
            TotalHorasFaltaAprobar = GetDecimal(values, "TotalHorasFaltaAprobar", "totalHorasFaltaAprobar"),
            DiferenciaHoras = GetDecimal(values, "DiferenciaHoras", "diferenciaHoras"),
            EstadoValidacionHoras = GetString(values, "EstadoValidacionHoras", "estadoValidacionHoras", "Estadovalidacionhoras", "estadovalidacionhoras"),
            Comentario = GetString(values, "Comentario", "comentario"),
            Observacion = GetString(values, "Observacion", "observacion")
        };
    }

    private static string GetDateString(IDictionary<string, object?> values, params string[] keys)
    {
        foreach (var key in keys)
        {
            if (!TryGetValue(values, key, out var value) || value is null || value is DBNull)
            {
                continue;
            }

            if (value is DateTime dateTime)
            {
                return dateTime.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
            }

            if (value is DateTimeOffset dateTimeOffset)
            {
                return dateTimeOffset.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
            }

            var text = Convert.ToString(value, CultureInfo.InvariantCulture)?.Trim();
            if (string.IsNullOrWhiteSpace(text))
            {
                continue;
            }

            if (DateTime.TryParse(text, CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsedDate))
            {
                return parsedDate.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
            }

            return text;
        }

        return string.Empty;
    }

    private static string GetDateDisplayString(IDictionary<string, object?> values, params string[] keys)
    {
        foreach (var key in keys)
        {
            if (!TryGetValue(values, key, out var value) || value is null || value is DBNull)
            {
                continue;
            }

            if (value is DateTime dateTime)
            {
                return dateTime.ToString("dd/MM/yyyy", CultureInfo.InvariantCulture);
            }

            if (value is DateTimeOffset dateTimeOffset)
            {
                return dateTimeOffset.ToString("dd/MM/yyyy", CultureInfo.InvariantCulture);
            }

            var text = Convert.ToString(value, CultureInfo.InvariantCulture)?.Trim();
            if (string.IsNullOrWhiteSpace(text))
            {
                continue;
            }

            if (DateTime.TryParse(text, CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsedDate))
            {
                return parsedDate.ToString("dd/MM/yyyy", CultureInfo.InvariantCulture);
            }

            return text;
        }

        return string.Empty;
    }

    private static string GetTimeString(IDictionary<string, object?> values, params string[] keys)
    {
        foreach (var key in keys)
        {
            if (!TryGetValue(values, key, out var value) || value is null || value is DBNull)
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

    private static string GetString(IDictionary<string, object?> values, params string[] keys)
    {
        foreach (var key in keys)
        {
            if (!TryGetValue(values, key, out var value) || value is null || value is DBNull)
            {
                continue;
            }

            if (value is DateTime dateTime)
            {
                return dateTime.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
            }

            if (value is DateTimeOffset dateTimeOffset)
            {
                return dateTimeOffset.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
            }

            if (value is TimeSpan timeSpan)
            {
                return timeSpan.ToString(@"hh\:mm\:ss", CultureInfo.InvariantCulture);
            }

            return Convert.ToString(value, CultureInfo.InvariantCulture)?.Trim() ?? string.Empty;
        }

        return string.Empty;
    }

    private static int? GetInt(IDictionary<string, object?> values, params string[] keys)
    {
        foreach (var key in keys)
        {
            if (!TryGetValue(values, key, out var value) || value is null || value is DBNull)
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

    private static decimal GetDecimal(IDictionary<string, object?> values, params string[] keys)
    {
        foreach (var key in keys)
        {
            if (!TryGetValue(values, key, out var value) || value is null || value is DBNull)
            {
                continue;
            }

            if (value is decimal decimalValue)
            {
                return decimalValue;
            }

            if (decimal.TryParse(Convert.ToString(value, CultureInfo.InvariantCulture), NumberStyles.Any, CultureInfo.InvariantCulture, out var parsed))
            {
                return parsed;
            }
        }

        return 0m;
    }

    private static bool TryGetValue(IDictionary<string, object?> values, string key, out object? value)
    {
        if (values.TryGetValue(key, out value))
        {
            return true;
        }

        var match = values.Keys.FirstOrDefault(existingKey =>
            string.Equals(existingKey, key, StringComparison.OrdinalIgnoreCase));

        if (match is not null && values.TryGetValue(match, out value))
        {
            return true;
        }

        value = null;
        return false;
    }
}
