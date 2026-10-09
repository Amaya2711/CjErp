using CjERP.Application.DTOs;
using CjERP.Infrastructure.Services;
using Xunit;

namespace CjERP.Backend.Tests.Ia.UnitTests;

/// <summary>
/// La bandeja de aprobación de OC (1ra/2da/3ra validación) se filtra en el servidor con la misma regla que usa el
/// frontend (getNivelPendiente / getEstadoVista en oc_v1.tsx). Si estas reglas divergen, el servidor ocultaría OC
/// que la pantalla debería mostrar.
/// </summary>
[Trait("Category", "Unit")]
public sealed class OrdenCompraBandejaTests
{
    private static OrdenCompraCabeceraDto Oc(int? a1 = null, int? a2 = null, int? a3 = null, int? idEstado = null, string estado = "")
        => new() { IdOc = 1, IdAprobador1 = a1, IdAprobador2 = a2, IdAprobador3 = a3, IdEstado = idEstado, Estado = estado };

    [Theory]
    [InlineData(null, null, null, 1)]
    [InlineData(0, 0, 0, 1)]
    [InlineData(5, null, null, 2)]
    [InlineData(5, 0, 7, 2)]
    [InlineData(5, 6, null, 3)]
    [InlineData(5, 6, 7, 4)]
    public void NivelPendiente_depende_de_los_aprobadores_registrados(int? a1, int? a2, int? a3, int esperado)
    {
        Assert.Equal(esperado, OrdenCompraBandeja.NivelPendiente(Oc(a1, a2, a3)));
    }

    [Fact]
    public void Una_OC_rechazada_no_esta_pendiente_aunque_le_falten_aprobadores()
    {
        Assert.Equal(0, OrdenCompraBandeja.NivelPendiente(Oc(idEstado: 6)));
        Assert.Equal(0, OrdenCompraBandeja.NivelPendiente(Oc(estado: "Rechazada")));
        Assert.Equal(0, OrdenCompraBandeja.NivelPendiente(Oc(estado: "OC RECHAZADO por cliente")));
        Assert.False(OrdenCompraBandeja.EsPendienteDeAprobacion(Oc(idEstado: 6)));
    }

    [Theory]
    [InlineData(null, null, null, true)]
    [InlineData(5, null, null, true)]
    [InlineData(5, 6, null, true)]
    [InlineData(5, 6, 7, false)]
    public void Solo_las_de_nivel_1_a_3_son_pendientes(int? a1, int? a2, int? a3, bool pendiente)
    {
        Assert.Equal(pendiente, OrdenCompraBandeja.EsPendienteDeAprobacion(Oc(a1, a2, a3)));
    }

    [Fact]
    public void El_texto_de_estado_aprobada_no_las_saca_de_la_bandeja_si_falta_un_nivel()
    {
        // En el frontend "aprobadas" es solo una vista de estado; la bandeja depende de los aprobadores.
        Assert.True(OrdenCompraBandeja.EsPendienteDeAprobacion(Oc(a1: 5, estado: "En 2da Aprob.")));
    }
}
