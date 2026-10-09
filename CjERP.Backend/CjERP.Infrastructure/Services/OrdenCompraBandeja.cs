using CjERP.Application.DTOs;

namespace CjERP.Infrastructure.Services;

/// <summary>
/// Reglas de la bandeja de aprobación de OC (1ra/2da/3ra validación). Replica exactamente el cálculo que hace el
/// frontend (<c>getNivelPendiente</c> / <c>getEstadoVista</c> en oc_v1.tsx) para poder filtrar en el servidor.
/// </summary>
public static class OrdenCompraBandeja
{
    /// <summary>Estado de OC rechazada.</summary>
    private const int EstadoRechazada = 6;

    /// <summary>
    /// Nivel de aprobación que le corresponde a la OC: 1, 2 o 3 si está pendiente; 4 si ya pasó los tres niveles;
    /// 0 si está rechazada.
    /// </summary>
    public static int NivelPendiente(OrdenCompraCabeceraDto item)
    {
        if (EstaRechazada(item)) return 0;
        if (item.IdAprobador1 is null or <= 0) return 1;
        if (item.IdAprobador2 is null or <= 0) return 2;
        if (item.IdAprobador3 is null or <= 0) return 3;
        return 4;
    }

    /// <summary>Verdadero si la OC está esperando alguna de las tres validaciones.</summary>
    public static bool EsPendienteDeAprobacion(OrdenCompraCabeceraDto item) => NivelPendiente(item) is >= 1 and <= 3;

    private static bool EstaRechazada(OrdenCompraCabeceraDto item) =>
        item.IdEstado == EstadoRechazada
        || (item.Estado ?? string.Empty).Contains("rechaz", StringComparison.OrdinalIgnoreCase);
}
