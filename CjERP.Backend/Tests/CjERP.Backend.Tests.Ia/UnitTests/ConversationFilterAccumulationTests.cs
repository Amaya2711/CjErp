using CjERP.Application.DTOs.IaChat;
using CjERP.Infrastructure.Services;
using Xunit;

namespace CjERP.Backend.Tests.Ia.UnitTests;

/// <summary>
/// Regla de negocio (defecto reportado en produccion, 2026-10-05): dentro de una misma conversacion los filtros
/// se SUMAN. Escenario real: 1) "gastos del cliente sdp proyecto Cano para septiembre 2026";
/// 2) "muestra el detalle del sitio CA_NUEVO_SAN_MARTIN" debe responder sobre SDP + CANO + septiembre 2026,
/// no sobre todo el ano. PRUEBAS SINTETICAS de la logica pura (InheritPreviousFilters): no ejecutan SQL ni el LLM.
/// </summary>
[Trait("Category", "Unit")]
public sealed class ConversationFilterAccumulationTests
{
    private const string Tool = "buscar_planilla";

    private static BuscarPlanillaArgs PrimeraConsulta() => new BuscarPlanillaArgs
    {
        Cliente = "sdp",
        Proyecto = "Cano",
        FechaInicio = new DateOnly(2026, 9, 1),
        FechaFin = new DateOnly(2026, 9, 30)
    }.Normalize();

    private static ConversationState EstadoTras(BuscarPlanillaArgs args)
    {
        var state = new ConversationState("c1", "usuario-A");
        state.AppendTurn("user", "consulta previa");
        state.AppendAssistant("resp", new IaChatResponseDto { Success = true, Answer = "resp" }, Tool, args.AsDictionary());
        return state;
    }

    // Lo que el planner devuelve para el seguimiento: solo el site; el resto sin tocar (fechas/estado por defecto).
    private static BuscarPlanillaArgs SeguimientoSoloSite(string site) =>
        new BuscarPlanillaArgs { Site = site }.Normalize();

    [Fact]
    public void SeguimientoConSite_HeredaClienteProyectoYPeriodoDeLaConsultaAnterior()
    {
        var state = EstadoTras(PrimeraConsulta());

        var args = IaConversationFollowUpResolver.InheritPreviousFilters(
            "muestra el detalle del sitio CA_NUEVO_SAN_MARTIN", state, SeguimientoSoloSite("CA_NUEVO_SAN_MARTIN"));

        Assert.Equal("CA_NUEVO_SAN_MARTIN", args.Site);
        Assert.Equal("sdp", args.Cliente);
        Assert.Equal("Cano", args.Proyecto);
        Assert.Equal(new DateOnly(2026, 9, 1), args.FechaInicio);   // NO el ano completo
        Assert.Equal(new DateOnly(2026, 9, 30), args.FechaFin);
        Assert.Null(args.Estados);          // sin estado explicito = todos los estados (regla 2026-10-23)
        Assert.True(args.TodosLosEstados);
    }

    [Fact]
    public void TercerTurno_AcumulaSobreElSegundo()
    {
        var segundo = IaConversationFollowUpResolver.InheritPreviousFilters(
            "detalle del sitio CA_NUEVO_SAN_MARTIN", EstadoTras(PrimeraConsulta()), SeguimientoSoloSite("CA_NUEVO_SAN_MARTIN"));
        var state = EstadoTras(segundo);

        var tercero = IaConversationFollowUpResolver.InheritPreviousFilters(
            "solo del solicitante Jessenia", state, new BuscarPlanillaArgs { Solicitante = "Jessenia" }.Normalize());

        Assert.Equal("Jessenia", tercero.Solicitante);
        Assert.Equal("CA_NUEVO_SAN_MARTIN", tercero.Site);
        Assert.Equal("sdp", tercero.Cliente);
        Assert.Equal("Cano", tercero.Proyecto);
        Assert.Equal(new DateOnly(2026, 9, 1), tercero.FechaInicio);
        Assert.Equal(new DateOnly(2026, 9, 30), tercero.FechaFin);
    }

    [Fact]
    public void UnPeriodoEscritoEnLaPreguntaNueva_ReemplazaAlAnterior()
    {
        var state = EstadoTras(PrimeraConsulta());
        var nueva = new BuscarPlanillaArgs
        {
            Site = "CA_NUEVO_SAN_MARTIN",
            FechaInicio = new DateOnly(2026, 4, 1),
            FechaFin = new DateOnly(2026, 4, 30)
        }.Normalize();

        var args = IaConversationFollowUpResolver.InheritPreviousFilters("detalle del sitio en abril", state, nueva);

        Assert.Equal(new DateOnly(2026, 4, 1), args.FechaInicio);
        Assert.Equal(new DateOnly(2026, 4, 30), args.FechaFin);
        Assert.Equal("sdp", args.Cliente);   // el resto sigue sumando
    }

    [Fact]
    public void UnValorNuevoDeUnFiltro_ReemplazaAlAnterior_SinPerderLosDemas()
    {
        var state = EstadoTras(PrimeraConsulta());

        var args = IaConversationFollowUpResolver.InheritPreviousFilters(
            "ahora el proyecto Otro", state, new BuscarPlanillaArgs { Proyecto = "Otro" }.Normalize());

        Assert.Equal("Otro", args.Proyecto);
        Assert.Equal("sdp", args.Cliente);
        Assert.Equal(new DateOnly(2026, 9, 1), args.FechaInicio);
    }

    [Theory]
    [InlineData("nueva consulta: detalle del sitio CA_NUEVO_SAN_MARTIN")]
    [InlineData("sin filtros, detalle del sitio CA_NUEVO_SAN_MARTIN")]
    [InlineData("empieza de nuevo con el sitio CA_NUEVO_SAN_MARTIN")]
    public void PedirEmpezarDeNuevo_NoHereda(string pregunta)
    {
        var state = EstadoTras(PrimeraConsulta());

        var args = IaConversationFollowUpResolver.InheritPreviousFilters(
            pregunta, state, SeguimientoSoloSite("CA_NUEVO_SAN_MARTIN"));

        Assert.Null(args.Cliente);
        Assert.Null(args.Proyecto);
        Assert.True(args.FechasAplicadasPorDefecto);
        Assert.Equal("CA_NUEVO_SAN_MARTIN", args.Site);
    }

    [Fact]
    public void ConversacionLimpiaOSinConsultaPrevia_NoHereda()
    {
        var limpio = new ConversationState("c2", "usuario-A");   // hilo nuevo / "Limpiar"

        var args = IaConversationFollowUpResolver.InheritPreviousFilters(
            "detalle del sitio CA_NUEVO_SAN_MARTIN", limpio, SeguimientoSoloSite("CA_NUEVO_SAN_MARTIN"));

        Assert.Null(args.Cliente);
        Assert.Null(args.Proyecto);
        Assert.True(args.FechasAplicadasPorDefecto);
    }

    [Fact]
    public void MemoriaDescartadaPorCambioDeAlcance_NoHereda()
    {
        var state = EstadoTras(PrimeraConsulta());
        state.InvalidateMemory();   // revocacion/cambio de alcance: la memoria previa ya no se reutiliza

        var args = IaConversationFollowUpResolver.InheritPreviousFilters(
            "detalle del sitio CA_NUEVO_SAN_MARTIN", state, SeguimientoSoloSite("CA_NUEVO_SAN_MARTIN"));

        Assert.Null(args.Cliente);
        Assert.True(args.FechasAplicadasPorDefecto);
    }
}
