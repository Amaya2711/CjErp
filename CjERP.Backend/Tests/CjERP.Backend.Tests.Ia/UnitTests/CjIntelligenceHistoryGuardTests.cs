using System.Text.Json;
using CjERP.Application.Interfaces.Services.AI;
using CjERP.Infrastructure.Services.AI.CjIntelligence;
using Xunit;

namespace CjERP.Backend.Tests.Ia.UnitTests;

/// <summary>
/// CJ Intelligence: compatibilidad de lo GUARDADO (resultados, mensajes, resumen, estado) con los permisos VIGENTES.
/// Cubre los cambios de alcance que obligan a no reutilizar cifras: TOTAL a PROPIO, equipo que cambia de integrantes,
/// revocacion de totales globales, y los casos limite (datos ilegibles, niveles desconocidos, intentos).
/// </summary>
[Trait("Category", "Unit")]
public sealed class CjIntelligenceHistoryGuardTests
{
    private static IaResolvedScope Propio(params int[] ids) => IaResolvedScope.ForRestricted(IaScopeLevel.Propio, IaScopeFields.ResponsableOSolicitante, ids, false);

    private static IaResolvedScope Equipo(params int[] ids) => IaResolvedScope.ForRestricted(IaScopeLevel.Equipo, IaScopeFields.ResponsableOSolicitante, ids, false);

    private static IaResolvedScope Total(bool globals = false) => IaResolvedScope.ForTotal(globals);

    private static CjResultRefRow Result(string level, string? employees = null, bool globals = false, string estado = "OK", long turn = 1, int intento = 1, int? seq = 1) => new()
    {
        IdResultado = turn * 10 + intento, IdTurno = turn, Intento = intento, SecuenciaTurno = seq, Estado = estado,
        AlcanceNivel = level, AlcanceEmpleados = employees, UsaTotalesGlobales = globals
    };

    // ------------------------------------------------------------------ TOTAL que cambia

    [Theory]
    [MemberData(nameof(TotalVsVigente))]
    public void ResultadoTotal_SoloEsCompatibleConUnAlcanceTotalVigente(IaResolvedScope vigente, bool esperado)
    {
        Assert.Equal(esperado, CjIntelligenceHistoryGuard.IsResultCompatible(Result("TOTAL"), vigente));
    }

    public static IEnumerable<object[]> TotalVsVigente() =>
    [
        [Total(), true],
        [Equipo(10, 11, 12), false],     // TOTAL que pasa a EQUIPO
        [Propio(10), false]              // TOTAL que pasa a PROPIO
    ];

    // ------------------------------------------------------------------ PROPIO / EQUIPO: contencion de empleados

    [Theory]
    [InlineData("PROPIO", "10", "PROPIO", "10", true)]
    [InlineData("PROPIO", "10", "PROPIO", "11", false)]        // otra persona
    [InlineData("PROPIO", "10", "EQUIPO", "10,11", true)]      // sube a equipo que lo contiene
    [InlineData("PROPIO", "10", "TOTAL", null, true)]
    [InlineData("EQUIPO", "10,11,12", "EQUIPO", "10,11,12", true)]
    [InlineData("EQUIPO", "10,11,12", "EQUIPO", "10,11", false)]            // un integrante sale
    [InlineData("EQUIPO", "10,11,12", "EQUIPO", "10,11,12,13", true)]        // un integrante entra: sigue contenido
    [InlineData("EQUIPO", "10,11,12", "EQUIPO", "10,11,13", false)]          // sustitucion
    [InlineData("EQUIPO", "10,11,12", "PROPIO", "10", false)]                // EQUIPO que pasa a PROPIO
    [InlineData("EQUIPO", "10,11,12", "TOTAL", null, true)]
    [InlineData("EQUIPO", " 12, 11 ,10 ", "EQUIPO", "10,11,12", true)]       // orden y espacios no importan
    public void ResultadoRestringido_EsCompatibleSoloSiSusEmpleadosSiguenEnElAlcanceVigente(
        string storedLevel, string? storedEmployees, string currentLevel, string? currentEmployees, bool expected)
    {
        var current = currentLevel switch
        {
            "TOTAL" => Total(),
            "EQUIPO" => Equipo(currentEmployees!.Split(',').Select(int.Parse).ToArray()),
            _ => Propio(currentEmployees!.Split(',').Select(int.Parse).ToArray())
        };

        Assert.Equal(expected, CjIntelligenceHistoryGuard.IsResultCompatible(Result(storedLevel, storedEmployees), current));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("10,x")]
    [InlineData("0,10")]
    [InlineData("-5")]
    [InlineData("10,,11")]
    public void ListaDeEmpleadosIlegibleOAusente_FallaCerrado_TambienConAlcanceTotal(string? employees)
    {
        Assert.False(CjIntelligenceHistoryGuard.IsResultCompatible(Result("EQUIPO", employees), Equipo(10, 11)));
        Assert.False(CjIntelligenceHistoryGuard.IsResultCompatible(Result("PROPIO", employees), Propio(10)));
        Assert.False(CjIntelligenceHistoryGuard.IsResultCompatible(Result("PROPIO", employees), Total()));   // sin evidencia del alcance: se excluye siempre
    }

    [Theory]
    [InlineData("DENEGADO")]
    [InlineData("SUPERADMIN")]
    [InlineData("")]
    [InlineData(null)]
    public void NivelDesconocido_Incompatible_AunConAlcanceTotal(string? level)
    {
        Assert.False(CjIntelligenceHistoryGuard.IsResultCompatible(Result(level!, "10"), Total(true)));
    }

    [Theory]
    [InlineData("ERROR")]
    [InlineData("BLOQUEADO")]
    public void ResultadosSinDatos_NoRestringen(string estado)
    {
        Assert.True(CjIntelligenceHistoryGuard.IsResultCompatible(Result("TOTAL", estado: estado), Propio(10)));
    }

    // ------------------------------------------------------------------ totales globales

    [Theory]
    [InlineData(true, true, true)]
    [InlineData(true, false, false)]    // permiso revocado
    [InlineData(false, false, true)]    // no los uso: la revocacion no lo afecta
    [InlineData(false, true, true)]
    public void TotalesGlobales_SeExigenSoloSiElResultadoLosUso(bool usedGlobals, bool canViewNow, bool expected)
    {
        Assert.Equal(expected, CjIntelligenceHistoryGuard.IsResultCompatible(Result("TOTAL", globals: usedGlobals), Total(canViewNow)));
    }

    [Fact]
    public void TotalesGlobalesRevocados_InvalidanTambienUnResultadoRestringidoQueLosUsaba()
    {
        Assert.False(CjIntelligenceHistoryGuard.IsResultCompatible(Result("EQUIPO", "10,11", globals: true), Equipo(10, 11)));
    }

    // ------------------------------------------------------------------ solo cuenta el ultimo intento de cada turno

    [Fact]
    public void SoloElUltimoIntentoDeCadaTurno_DecideLaCompatibilidad()
    {
        var anteriorIncompatible = new[] { Result("TOTAL", intento: 1), Result("PROPIO", "10", intento: 2) };
        var anteriorCompatible = new[] { Result("PROPIO", "10", intento: 1), Result("TOTAL", intento: 2) };

        Assert.Empty(CjIntelligenceHistoryGuard.IncompatibleTurns(anteriorIncompatible, Propio(10)));
        Assert.Contains(1L, CjIntelligenceHistoryGuard.IncompatibleTurns(anteriorCompatible, Propio(10)));
    }

    [Fact]
    public void UnTurnoConVariosResultados_EsIncompatibleSiAlgunoLoEs()
    {
        var results = new[] { Result("PROPIO", "10", turn: 5), new CjResultRefRow { IdResultado = 99, IdTurno = 5, Intento = 1, Estado = "OK", AlcanceNivel = "PROPIO", AlcanceEmpleados = "11" } };

        Assert.Contains(5L, CjIntelligenceHistoryGuard.IncompatibleTurns(results, Propio(10)));
    }

    // ------------------------------------------------------------------ mensajes

    [Fact]
    public void Mensajes_LaRespuestaIncompatibleSeSustituyeSinCifras_YLosDelUsuarioSeConservan()
    {
        var messages = new[]
        {
            new CjMessageRow { IdMensaje = 1, IdTurno = 1, Secuencia = 1, Rol = "user", Contenido = "pagos de octubre" },
            new CjMessageRow { IdMensaje = 2, IdTurno = 1, Secuencia = 2, Rol = "assistant", Contenido = "Total S/ 9.999.999" },
            new CjMessageRow { IdMensaje = 3, IdTurno = 2, Secuencia = 3, Rol = "user", Contenido = "y septiembre" },
            new CjMessageRow { IdMensaje = 4, IdTurno = 2, Secuencia = 4, Rol = "assistant", Contenido = "Total S/ 100,00 (propio)" },
            new CjMessageRow { IdMensaje = 5, IdTurno = null, Secuencia = 5, Rol = "assistant", Contenido = "mensaje sin turno" }
        };
        var results = new[] { Result("TOTAL", turn: 1, seq: 1), Result("PROPIO", "10", turn: 2, seq: 3) };

        var views = CjIntelligenceHistoryGuard.FilterMessages(messages, results, Propio(10));

        Assert.Equal(new[] { false, true, false, false, true }, views.Select(v => v.Omitted).ToArray());
        Assert.Equal(CjIntelligenceHistoryGuard.OmittedText, views[1].Content);
        Assert.DoesNotContain("9.999.999", string.Join("|", views.Select(v => v.Content)));
        Assert.Equal("pagos de octubre", views[0].Content);
        Assert.Equal("Total S/ 100,00 (propio)", views[3].Content);       // este si es compatible
        Assert.Equal(CjIntelligenceHistoryGuard.OmittedText, views[4].Content);   // sin turno = sin evidencia de alcance: se omite
    }

    [Fact]
    public void ElAvisoDeOmision_NoContieneCifrasNiDatos()
    {
        Assert.DoesNotMatch(@"\d", CjIntelligenceHistoryGuard.OmittedText);
    }

    // ------------------------------------------------------------------ resumen

    [Fact]
    public void Resumen_SoloSirveSiNingunTurnoQueCubreQuedoFueraDelAlcance()
    {
        var state = new CjConversationState(1, "{}", "resumen", ResumenHastaSecuencia: 4);

        // turno incompatible dentro del tramo cubierto (secuencia 3 <= 4): el resumen no sirve
        Assert.False(CjIntelligenceHistoryGuard.IsSummaryCompatible(state, [Result("TOTAL", turn: 2, seq: 3)], Propio(10)));
        // turno incompatible POSTERIOR al tramo cubierto: el resumen no lo incluye, sigue sirviendo
        Assert.True(CjIntelligenceHistoryGuard.IsSummaryCompatible(state, [Result("TOTAL", turn: 3, seq: 9)], Propio(10)));
        // todo compatible
        Assert.True(CjIntelligenceHistoryGuard.IsSummaryCompatible(state, [Result("PROPIO", "10", turn: 2, seq: 3)], Propio(10)));
        // tramo desconocido: cualquier turno incompatible lo invalida
        Assert.False(CjIntelligenceHistoryGuard.IsSummaryCompatible(state with { ResumenHastaSecuencia = null }, [Result("TOTAL", turn: 3, seq: 9)], Propio(10)));
        // sin resumen, no hay nada que restringir
        Assert.True(CjIntelligenceHistoryGuard.IsSummaryCompatible(null, [Result("TOTAL")], Propio(10)));
        Assert.True(CjIntelligenceHistoryGuard.IsSummaryCompatible(new CjConversationState(1, "{}", "  ", null), [Result("TOTAL")], Propio(10)));
    }

    // ------------------------------------------------------------------ estado: solo filtros

    private const string ValidArgs = """{"fechaInicio":"2026-10-01","fechaFin":"2026-10-31","agruparPor":["CLIENTE"],"cliente":"ACME","top":10}""";

    [Fact]
    public void Estado_ConservaSoloLosFiltrosRevalidados_YDescartaCualquierOtroCampo()
    {
        var json = "{\"ultimaConsulta\":{\"herramienta\":\"resumen_pagos\",\"argumentos\":" + ValidArgs + ",\"total\":123456},\"totalGeneral\":777,\"texto\":\"S/ 9.999.999\"}";

        var clean = CjIntelligenceHistoryGuard.SanitizeState(json);

        Assert.NotNull(clean);
        Assert.DoesNotContain("123456", clean);
        Assert.DoesNotContain("777", clean);
        Assert.DoesNotContain("9.999.999", clean);
        using var doc = JsonDocument.Parse(clean!);
        var args = doc.RootElement.GetProperty("ultimaConsulta").GetProperty("argumentos");
        Assert.Equal("2026-10-01", args.GetProperty("fechaInicio").GetString());
        Assert.Equal("ACME", args.GetProperty("cliente").GetString());
    }

    [Fact]
    public void Estado_ComparacionConservaLosDosPeriodos()
    {
        var json = """{"ultimaConsulta":{"herramienta":"comparar_periodos_pagos","argumentos":{"periodoA":{"fechaInicio":"2026-10-01","fechaFin":"2026-10-31"},"periodoB":{"fechaInicio":"2026-09-01","fechaFin":"2026-09-30"},"cliente":"ACME"}}}""";

        var clean = CjIntelligenceHistoryGuard.SanitizeState(json);

        Assert.NotNull(clean);
        Assert.Contains("periodoA", clean);
        Assert.Contains("periodoB", clean);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("{}")]
    [InlineData("no es json")]
    [InlineData("""{"ultimaConsulta":{"herramienta":"otra_herramienta","argumentos":{}}}""")]
    [InlineData("""{"ultimaConsulta":{"herramienta":"resumen_pagos"}}""")]
    [InlineData("""{"ultimaConsulta":{"herramienta":"resumen_pagos","argumentos":{"fechaInicio":"2026-10-01","fechaFin":"2026-10-31","usuario":"otro"}}}""")]
    [InlineData("""{"ultimaConsulta":{"herramienta":"resumen_pagos","argumentos":{"fechaInicio":"2020-01-01","fechaFin":"2026-10-31"}}}""")]
    public void Estado_InvalidoOSinFiltros_SeDescarta(string? json)
    {
        Assert.Null(CjIntelligenceHistoryGuard.SanitizeState(json));
    }
}
