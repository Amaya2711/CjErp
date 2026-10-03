// Extraido de IaChatService.cs en Fase 1.1 (docs/AI_COPILOT_IMPLEMENTATION_PLAN.md).
// Codigo movido tal cual: no se cambio ningun comportamiento, solo la ubicacion.
using System.Globalization;

namespace CjERP.Infrastructure.Services;

using static CjERP.Infrastructure.Services.IaChatSharedDefaults;
using static CjERP.Infrastructure.Services.IaTextUtils;

public sealed class BuscarPlanillaArgs
{
    public string? TextoBusqueda { get; set; }

    public string? Estados { get; set; }

    public DateOnly? FechaInicio { get; set; }

    public DateOnly? FechaFin { get; set; }

    public int? IdSolicitante { get; set; }

    public int? IdValidador { get; set; }

    public int? IdCliente { get; set; }

    public int? IdProyecto { get; set; }

    public string? IdSite { get; set; }

    public string? Site { get; set; }

    public int? CorreSite { get; set; }

    public string? Cliente { get; set; }

    public string? Proyecto { get; set; }

    public string? Responsable { get; set; }

    public string? Solicitante { get; set; }

    public string? Ot { get; set; }

    public bool CoincidirTodas { get; set; }

    public bool IncluirEstado99 { get; set; } = true;

    public int Pagina { get; set; } = 1;

    public int TamanoPagina { get; set; } = 50;

    public decimal TipoCambio { get; set; } = 3.8m;

    public bool EstadosAplicadosPorDefecto { get; set; }

    public bool FechasAplicadasPorDefecto { get; set; }

    public BuscarPlanillaArgs Normalize()
    {
        TextoBusqueda = NormalizeText(TextoBusqueda);
        Estados = NormalizeText(Estados);
        IdSite = NormalizeText(IdSite);
        Site = NormalizeText(Site);
        Cliente = NormalizeText(Cliente);
        Proyecto = NormalizeText(Proyecto);
        Responsable = NormalizeText(Responsable);
        Solicitante = NormalizeText(Solicitante);
        Ot = NormalizeText(Ot);

        if (string.IsNullOrWhiteSpace(Estados))
        {
            Estados = "PAGADO";
            EstadosAplicadosPorDefecto = true;
        }
        else
        {
            EstadosAplicadosPorDefecto = false;
        }

        if (!FechaInicio.HasValue && !FechaFin.HasValue)
        {
            var peruNow = DateTimeOffset.UtcNow.ToOffset(PeruOffset);
            FechaInicio = new DateOnly(peruNow.Year, 1, 1);
            FechaFin = new DateOnly(peruNow.Year, 12, 31);
            FechasAplicadasPorDefecto = true;
        }
        else
        {
            FechasAplicadasPorDefecto = false;
        }

        return this;
    }

    /// <summary>
    /// Copia de TODOS los criterios con otra pagina/tamano. Copia por MemberwiseClone para que
    /// ningun filtro actual o futuro se pierda al paginar (antes la copia manual omitia Site).
    /// </summary>
    public BuscarPlanillaArgs WithPage(int pagina, int tamanoPagina)
    {
        var clone = (BuscarPlanillaArgs)MemberwiseClone();
        clone.Pagina = pagina;
        clone.TamanoPagina = tamanoPagina;
        return clone;
    }

    public Dictionary<string, object?> AsDictionary()
    {
        return new Dictionary<string, object?>
        {
            ["textoBusqueda"] = TextoBusqueda,
            ["estados"] = Estados,
            ["fechaInicio"] = FechaInicio?.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            ["fechaFin"] = FechaFin?.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            ["idSolicitante"] = IdSolicitante,
            ["idValidador"] = IdValidador,
            ["idCliente"] = IdCliente,
            ["idProyecto"] = IdProyecto,
            ["idSite"] = IdSite,
            ["site"] = Site,
            ["correSite"] = CorreSite,
            ["cliente"] = Cliente,
            ["proyecto"] = Proyecto,
            ["responsable"] = Responsable,
            ["solicitante"] = Solicitante,
            ["ot"] = Ot,
            ["coincidirTodas"] = CoincidirTodas,
            ["incluirEstado99"] = IncluirEstado99,
            ["pagina"] = Pagina,
            ["tamanoPagina"] = TamanoPagina,
            ["tipoCambio"] = TipoCambio,
            ["estadoAplicadoPorDefecto"] = EstadosAplicadosPorDefecto,
            ["fechasAplicadasPorDefecto"] = FechasAplicadasPorDefecto
        };
    }
}
