using CjERP.Infrastructure.Services;
using Xunit;

namespace CjERP.Backend.Tests.Ia.UnitTests;

/// <summary>
/// Tests directos (sin reflexion) contra IaTextUtils, extraida de IaChatService.cs en el paso
/// 1.2 de docs/AI_COPILOT_IMPLEMENTATION_PLAN.md (NormalizeText/Truncate; ExtractJsonCandidate y
/// NormalizeResponseType, tambien asignadas originalmente a esta clase en la tabla del plan, ya
/// habian migrado a GastosQueryPlanner e IaConversationFollowUpResolver respectivamente en pasos
/// anteriores, confirmado por grep antes de esta extraccion). Visible desde este proyecto gracias
/// a InternalsVisibleTo en CjERP.Infrastructure.csproj.
/// </summary>
[Trait("Category", "Unit")]
public sealed class IaTextUtilsDirectTests
{
    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void NormalizeText_ValorVacioOEnBlanco_DevuelveNull(string? value)
    {
        Assert.Null(IaTextUtils.NormalizeText(value));
    }

    [Fact]
    public void NormalizeText_ConEspaciosAlrededor_RecortaEspacios()
    {
        Assert.Equal("Claro", IaTextUtils.NormalizeText("  Claro  "));
    }

    [Fact]
    public void Truncate_ValorMasCortoQueElLimite_LoDevuelveSinCambios()
    {
        Assert.Equal("abc", IaTextUtils.Truncate("abc", 10));
    }

    [Fact]
    public void Truncate_ValorMasLargoQueElLimite_LoRecorta()
    {
        Assert.Equal("abcde", IaTextUtils.Truncate("abcdefghij", 5));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    public void Truncate_ValorNuloOVacio_LoDevuelveSinCambios(string? value)
    {
        Assert.Equal(value, IaTextUtils.Truncate(value!, 5));
    }
}
