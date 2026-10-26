using CjERP.Application.DTOs.IaChat;
using CjERP.Infrastructure.Services;
using Xunit;

namespace CjERP.Backend.Tests.Ia.UnitTests;

/// <summary>
/// El asistente recuerda lo que ofrece: elegir una opcion numerada o confirmar una oferta unica se convierte en la
/// consulta de agrupacion ofrecida, y un "si" suelto ya no se interpreta como filtro de persona.
/// </summary>
[Trait("Category", "Unit")]
public sealed class OfferedBreakdownFollowUpTests
{
    private const string Oferta =
        "Si quieres, en el siguiente paso te lo puedo desglosar por:\n1. site,\n2. cliente-proyecto-site, o\n3. **estado y moneda** para identificar dónde está la mayor presión presupuestal.";

    private static ConversationState StateWith(string answer)
    {
        var state = new ConversationState("c1", "u1");
        state.AppendTurn("user", "gastos del cliente claro");
        state.AppendAssistant(answer, new IaChatResponseDto { Success = true, Answer = answer }, "buscar_planilla", null);
        return state;
    }

    [Theory]
    [InlineData("3. estado y moneda para identificar dónde está la mayor presión presupuestal.", "gastos por estado y moneda")]
    [InlineData("3", "gastos por estado y moneda")]
    [InlineData("opción 3", "gastos por estado y moneda")]
    [InlineData("1", "gastos por site")]
    [InlineData("2", "gastos por cliente, proyecto, site")]
    public void ElegirUnaOpcionOfrecida_SeReescribeComoAgrupacion(string pregunta, string esperada)
    {
        Assert.True(IaConversationFollowUpResolver.TryResolveOfferedBreakdown(pregunta, StateWith(Oferta), out var reescrita));
        Assert.Equal(esperada, reescrita);
    }

    [Fact]
    public void SiConVariasOpciones_EsAmbiguo_NoReescribe()
    {
        Assert.False(IaConversationFollowUpResolver.TryResolveOfferedBreakdown("si", StateWith(Oferta), out _));
    }

    [Fact]
    public void SiConUnaSolaOpcion_LaAcepta()
    {
        var state = StateWith("Puedo desglosarlo por:\n1. estado y moneda");

        Assert.True(IaConversationFollowUpResolver.TryResolveOfferedBreakdown("si", state, out var reescrita));
        Assert.Equal("gastos por estado y moneda", reescrita);
    }

    [Theory]
    [InlineData("4")]
    [InlineData("gastos de setiembre")]
    [InlineData("2026")]
    public void LoQueNoEsUnaOpcionOfrecida_NoSeReescribe(string pregunta)
    {
        Assert.False(IaConversationFollowUpResolver.TryResolveOfferedBreakdown(pregunta, StateWith(Oferta), out _));
    }

    [Fact]
    public void UnSiSuelto_SinAclaracionDeRol_NoSeConvierteEnFiltroDePersona()
    {
        var state = StateWith(Oferta);
        state.AppendTurn("user", "3. estado y moneda para identificar dónde está la mayor presión presupuestal.");

        Assert.False(IaConversationFollowUpResolver.TryBuildAmbiguousRoleFollowUpArgs("si", state, out _));
    }
}
