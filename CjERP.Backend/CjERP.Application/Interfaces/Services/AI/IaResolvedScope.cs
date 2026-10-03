using System.Security.Cryptography;
using System.Text;

namespace CjERP.Application.Interfaces.Services.AI;

/// <summary>
/// Alcance de datos ya resuelto y VALIDADO por el backend. Es inmutable y solo se construye por las
/// fabricas, que rechazan combinaciones invalidas. El ejecutor de la herramienta lo exige: sin un
/// IaResolvedScope valido no se ejecuta nada.
/// </summary>
public sealed class IaResolvedScope
{
    /// <summary>Tope de identificadores que el SP acepta; debe coincidir con sp_IA_Planilla_Buscar.</summary>
    public const int MaxEmployeeIds = 500;

    private IaResolvedScope(
        IaScopeLevel level,
        IaScopeFields fields,
        IReadOnlyList<int> employeeIds,
        bool canViewGlobalTotals)
    {
        Level = level;
        Fields = fields;
        EmployeeIds = employeeIds;
        CanViewGlobalTotals = canViewGlobalTotals;
    }

    public IaScopeLevel Level { get; }

    /// <summary>Campos evaluados. None cuando Level == Total.</summary>
    public IaScopeFields Fields { get; }

    /// <summary>EmpleadoCj.IdEmpleado ordenados y sin duplicados. Vacio cuando Level == Total.</summary>
    public IReadOnlyList<int> EmployeeIds { get; }

    /// <summary>Permiso INDEPENDIENTE del nivel: ver los totales globales de OC/site.</summary>
    public bool CanViewGlobalTotals { get; }

    /// <summary>true cuando el SP debe restringir filas por identificadores (Propio/Equipo).</summary>
    public bool IsRestricted => Level != IaScopeLevel.Total;

    public static IaResolvedScope ForTotal(bool canViewGlobalTotals) =>
        new(IaScopeLevel.Total, IaScopeFields.None, Array.Empty<int>(), canViewGlobalTotals);

    public static IaResolvedScope ForRestricted(
        IaScopeLevel level,
        IaScopeFields fields,
        IEnumerable<int> employeeIds,
        bool canViewGlobalTotals)
    {
        if (level is not (IaScopeLevel.Propio or IaScopeLevel.Equipo))
        {
            throw new ArgumentException("Un alcance restringido solo puede ser Propio o Equipo.", nameof(level));
        }

        if (fields == IaScopeFields.None || (fields & ~IaScopeFields.ResponsableOSolicitante) != 0)
        {
            throw new ArgumentException("Los campos de alcance deben ser Responsable, Solicitante o ambos.", nameof(fields));
        }

        ArgumentNullException.ThrowIfNull(employeeIds);
        var ids = employeeIds.ToList();

        if (ids.Any(id => id <= 0))
        {
            throw new ArgumentException("Los identificadores de empleado deben ser enteros positivos.", nameof(employeeIds));
        }

        var distinct = ids.Distinct().OrderBy(id => id).ToList();
        if (distinct.Count == 0)
        {
            throw new ArgumentException("Un alcance restringido requiere al menos un identificador.", nameof(employeeIds));
        }

        if (distinct.Count > MaxEmployeeIds)
        {
            throw new ArgumentException($"Un alcance no puede superar {MaxEmployeeIds} identificadores.", nameof(employeeIds));
        }

        return new IaResolvedScope(level, fields, distinct, canViewGlobalTotals);
    }

    /// <summary>Codigo del SP: TOTAL | RESTRINGIDO.</summary>
    public string SqlNivel => IsRestricted ? "RESTRINGIDO" : "TOTAL";

    /// <summary>Codigo del SP: R | S | RS (null para TOTAL).</summary>
    public string? SqlCampos => IsRestricted
        ? Fields switch
        {
            IaScopeFields.Responsable => "R",
            IaScopeFields.Solicitante => "S",
            _ => "RS"
        }
        : null;

    /// <summary>Lista canonica "1,2,3" (solo digitos y comas) para el SP; null para TOTAL.</summary>
    public string? SqlEmpleados => IsRestricted ? string.Join(',', EmployeeIds) : null;

    /// <summary>
    /// Huella estable de TODO lo que define el alcance (nivel, campos, conjunto completo y permiso de
    /// totales). Sirve para revalidar memoria/exportaciones: si cambia, el resultado previo ya no vale.
    /// </summary>
    public string Fingerprint
    {
        get
        {
            var raw = $"{Level}|{Fields}|{CanViewGlobalTotals}|{string.Join(',', EmployeeIds)}";
            return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(raw)));
        }
    }
}
