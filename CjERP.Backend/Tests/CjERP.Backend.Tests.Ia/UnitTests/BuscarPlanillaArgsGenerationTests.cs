using CjERP.Backend.Tests.Ia.TestSupport;
using Xunit;

namespace CjERP.Backend.Tests.Ia.UnitTests;

/// <summary>
/// Escenario obligatorio: "generacion consistente de parametros para sp_IA_Planilla_Buscar", y los
/// escenarios de filtro por fecha/estado/proyecto/cliente/responsable. Protege BuildSearchArgsFromQuestion
/// (IaChatService.cs:3945-3990, ruta de respaldo cuando el planner no genera buscarArgs) sin tocar SQL
/// ni HTTP: es logica pura de interpretacion de texto -> argumentos tipados.
///
/// IMPORTANTE (alcance real de este archivo, ver reporte de Fase 1.0): esto protege el CONTRATO de
/// generacion de argumentos, no el resultado final de una busqueda real contra la base de datos. La
/// ejecucion real del SP con filas devueltas no es testeable hoy sin una base de datos (ver
/// FakeSqlCommandFactory).
/// </summary>
[Trait("Category", "Unit")]
public sealed class BuscarPlanillaArgsGenerationTests
{
    [Fact]
    public void FiltroPorEstado_Pendiente_SeMapeaAEstadoPendiente()
    {
        var args = IaChatServiceReflection.BuildSearchArgsFromQuestion("Muestrame los gastos pendientes del mes");

        Assert.Equal("PENDIENTE", args.Estados);
        Assert.False(args.EstadosAplicadosPorDefecto);
    }

    [Fact]
    public void FiltroPorEstado_Pagado_SeMapeaAEstadoPagado()
    {
        var args = IaChatServiceReflection.BuildSearchArgsFromQuestion("Cuales gastos ya estan pagados este año");

        Assert.Equal("PAGADO", args.Estados);
    }

    [Fact]
    public void SinEstadoExplicito_AplicaPagadoPorDefecto()
    {
        // Comportamiento actual documentado: Normalize() fuerza Estados="PAGADO" cuando el usuario
        // no menciona ningun estado, y marca EstadosAplicadosPorDefecto=true (IaChatService.cs:5618-5626).
        var args = IaChatServiceReflection.BuildSearchArgsFromQuestion("Muestrame los gastos del cliente Claro");

        Assert.Equal("PAGADO", args.Estados);
        Assert.True(args.EstadosAplicadosPorDefecto);
    }

    [Fact]
    public void FiltroPorCliente_SeExtraeDelTextoConEtiquetaExplicita()
    {
        var args = IaChatServiceReflection.BuildSearchArgsFromQuestion("gastos del cliente Claro");

        Assert.Equal("Claro", args.Cliente);
    }

    [Theory]
    [InlineData("gastos por cliente y moneda para el mes de setiembre 2026")]
    [InlineData("gastos agrupados por cliente en setiembre 2026")]
    [InlineData("gastos separados por cliente y proyecto")]
    public void AgruparPorCliente_NoSeInterpretaComoNombreDeCliente(string pregunta)
    {
        // Caso real (auditoria 2026-10-03): "por cliente y moneda..." enviaba cliente = "y moneda para el mes de
        // setiembre 2026" al SP y devolvia 0 registros. "por <dimension>" es agrupacion, no un filtro.
        var args = IaChatServiceReflection.BuildSearchArgsFromQuestion(pregunta);

        Assert.Null(args.Cliente);
        Assert.Null(args.Proyecto);
    }

    [Fact]
    public void PalabrasDeMonedaYMes_NoSeConviertenEnTextoDeBusqueda()
    {
        // El mes ya viaja en fechaInicio/fechaFin; "moneda" es una dimension. Como texto de busqueda restringirian
        // a los gastos cuyo detalle mencione esas palabras (caso real: 590 filas en vez del total del mes).
        var args = IaChatServiceReflection.BuildSearchArgsFromQuestion("gastos por cliente y moneda para el mes de setiembre 2026");

        Assert.Null(args.TextoBusqueda);
    }

    [Theory]
    [InlineData("gastos por cliente y moneda para el mes de setiembre 2026")]
    [InlineData("gastos de setiembre 2026")]
    [InlineData("todos los gastos del cliente Claro")]
    public void SinEstadoExplicito_SeAplicaPagadoPorDefecto(string pregunta)
    {
        // Regla de negocio (2026-10-03): sin estado explicito solo se consideran los gastos PAGADO.
        var args = IaChatServiceReflection.BuildSearchArgsFromQuestion(pregunta);

        Assert.Equal("PAGADO", args.Estados);
    }

    [Theory]
    [InlineData("gastos de setiembre 2026 considerando todos los estados")]
    [InlineData("gastos por cliente y moneda de setiembre 2026 sin importar el estado")]
    [InlineData("gastos de setiembre 2026 en cualquier estado")]
    [InlineData("gastos de setiembre 2026 sin filtro de estado")]
    public void SiPideTodosLosEstados_NoSeAplicaElEstadoPorDefecto(string pregunta)
    {
        var args = IaChatServiceReflection.BuildSearchArgsFromQuestion(pregunta);

        Assert.Null(args.Estados);
    }

    [Fact]
    public void ConEstadoExplicito_SeRespetaElEstadoPedido()
    {
        var args = IaChatServiceReflection.BuildSearchArgsFromQuestion("gastos pendientes de setiembre 2026");

        Assert.Equal("PENDIENTE", args.Estados);
    }

    [Fact]
    public void ClienteConEtiquetaExplicita_SigueExtrayendoseDespuesDeUnaAgrupacion()
    {
        var args = IaChatServiceReflection.BuildSearchArgsFromQuestion("gastos por mes del cliente Claro");

        Assert.Equal("Claro", args.Cliente);
    }

    [Fact]
    public void HallazgoDocumentado_FiltroPorCliente_NoRecortaTextoDeRangoDeFechaPegadoALaEtiqueta()
    {
        // HALLAZGO DOCUMENTADO (no es un bug a corregir en Fase 1.0): ExtractNamedFilter (IaChatService.cs:4286-4308)
        // SI recorta frases especificas conocidas como "este mes"/"mes pasado"/"hoy"/"ayer" pegadas al
        // final del valor capturado, pero NO recorta otras frases de fecha en lenguaje natural como
        // "en el ultimo mes". Por eso, para esta pregunta concreta, el filtro de Cliente termina
        // incluyendo literalmente "en el ultimo mes" como parte del nombre del cliente.
        var args = IaChatServiceReflection.BuildSearchArgsFromQuestion("gastos del cliente Claro en el ultimo mes");

        Assert.Equal("Claro en el ultimo mes", args.Cliente);
    }

    [Fact]
    public void FiltroPorProyecto_SeExtraeDelTextoConEtiquetaExplicita()
    {
        var args = IaChatServiceReflection.BuildSearchArgsFromQuestion("gastos del proyecto Backbone Norte");

        Assert.Equal("Backbone Norte", args.Proyecto);
    }

    [Fact]
    public void FiltroPorResponsable_SeExtraeDelTextoConEtiquetaExplicita()
    {
        var args = IaChatServiceReflection.BuildSearchArgsFromQuestion("gastos del responsable Juan Perez");

        Assert.False(string.IsNullOrWhiteSpace(args.Responsable));
        Assert.Contains("Juan", args.Responsable, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void HallazgoDocumentado_FiltroPorRangoDeFechas_EsteMes_NoEscopeaAlMesActual()
    {
        // HALLAZGO DOCUMENTADO (ajuste de suposicion inicial, no un bug a corregir en Fase 1.0):
        // la frase "este mes" SI esta soportada por el metodo TryBuildDeterministicBuscarArgs
        // (IaChatService.cs:4006 en adelante) - pero ese metodo esta MUERTO (solo se llama desde el
        // bloque `if (false && ...)` de la linea 484, ver seccion 1.1 del reporte de Fase 1.0).
        // La ruta que SI esta viva hoy (BuildSearchArgsFromQuestion -> TryExtractDateRange, sin passar
        // por una fecha explicita/trimestre/mes con nombre/anio) NO reconoce "este mes" como una
        // instruccion de rango: cae al fallback generico de anio calendario completo.
        var args = IaChatServiceReflection.BuildSearchArgsFromQuestion("gastos de este mes");

        Assert.NotNull(args.FechaInicio);
        Assert.NotNull(args.FechaFin);
        Assert.Equal(1, args.FechaInicio!.Value.Month);   // Enero, no el mes en curso
        Assert.Equal(12, args.FechaFin!.Value.Month);     // Diciembre: cubre el anio completo
    }

    [Fact]
    public void FiltroPorRangoDeFechas_AnioExplicito_GeneraAnioCompleto()
    {
        var args = IaChatServiceReflection.BuildSearchArgsFromQuestion("gastos del 2024");

        Assert.Equal(new DateOnly(2024, 1, 1), args.FechaInicio);
        Assert.Equal(new DateOnly(2024, 12, 31), args.FechaFin);
    }

    [Fact]
    public void SinFechaExplicita_AplicaAnioCalendarioCompletoComoRangoDeFecha()
    {
        var args = IaChatServiceReflection.BuildSearchArgsFromQuestion("gastos del cliente Claro");

        Assert.NotNull(args.FechaInicio);
        Assert.Equal(1, args.FechaInicio!.Value.Month);
        Assert.Equal(1, args.FechaInicio.Value.Day);
    }

    [Fact]
    public void HallazgoDocumentado_FechasAplicadasPorDefecto_SiempreEsFalsoViaBuildSearchArgsFromQuestion()
    {
        // HALLAZGO DOCUMENTADO (no es un bug a corregir en Fase 1.0): BuildSearchArgsFromQuestion
        // (IaChatService.cs:3945-3990) siempre asigna un valor concreto a FechaInicio/FechaFin ANTES
        // de llamar a args.Normalize() (linea 3982) - ya sea el rango detectado por TryExtractDateRange,
        // que a su vez SIEMPRE devuelve true (tiene su propio fallback de anio completo, ver
        // TryExtractDateRange, IaChatService.cs:4737-4763). Por eso, cuando Normalize() se ejecuta,
        // FechaInicio/FechaFin YA NO estan vacios, y la bandera FechasAplicadasPorDefecto (pensada
        // para indicar "se uso el rango por defecto") se queda en false SIEMPRE que la pregunta pasa
        // por esta ruta - incluso en preguntas sin ninguna mencion de fecha, como esta.
        // Quien consuma esta bandera (por ejemplo, para avisarle al usuario "asumi el anio completo
        // porque no especificaste fechas") esta recibiendo hoy un valor que nunca es true por esta via.
        var args = IaChatServiceReflection.BuildSearchArgsFromQuestion("gastos del cliente Claro");

        Assert.False(args.FechasAplicadasPorDefecto);
    }

    [Fact]
    public void GeneracionDeParametros_EsConsistenteEntreLlamadasParaLaMismaPregunta()
    {
        // "Generacion consistente de parametros": la misma pregunta debe producir siempre los mismos
        // argumentos (salvo el rango de fecha por defecto, que depende del "hoy" real y es esperable
        // que varie solo si el test corre exactamente al cruzar el año).
        var pregunta = "gastos pendientes del cliente Claro y proyecto Backbone Norte";

        var primeraEjecucion = IaChatServiceReflection.BuildSearchArgsFromQuestion(pregunta);
        var segundaEjecucion = IaChatServiceReflection.BuildSearchArgsFromQuestion(pregunta);

        Assert.Equal(primeraEjecucion.Estados, segundaEjecucion.Estados);
        Assert.Equal(primeraEjecucion.Cliente, segundaEjecucion.Cliente);
        Assert.Equal(primeraEjecucion.Proyecto, segundaEjecucion.Proyecto);
        Assert.Equal(primeraEjecucion.CoincidirTodas, segundaEjecucion.CoincidirTodas);
        Assert.Equal(primeraEjecucion.TamanoPagina, segundaEjecucion.TamanoPagina);
        Assert.Equal(primeraEjecucion.TipoCambio, segundaEjecucion.TipoCambio);
    }

    [Fact]
    public void TipoCambioPorDefecto_NoSeFijaEnCodigo_LoResuelveElSp()
    {
        // Decision de negocio 2026-10-03: el backend ya no fija 3.80; envia null y el SP resuelve el tipo de
        // cambio (tabla a_tipo_cambio_diario o, si no hay, USD 3.50).
        var args = IaChatServiceReflection.BuildSearchArgsFromQuestion("gastos del cliente Claro");

        Assert.Null(args.TipoCambio);
    }

    [Fact]
    public void CoincidirTodas_SeActivaSoloConFraseExplicita()
    {
        var conFrase = IaChatServiceReflection.BuildSearchArgsFromQuestion(
            "gastos del cliente Claro coincidencia exacta");
        var sinFrase = IaChatServiceReflection.BuildSearchArgsFromQuestion(
            "gastos del cliente Claro");

        Assert.True(conFrase.CoincidirTodas);
        Assert.False(sinFrase.CoincidirTodas);
    }
}
