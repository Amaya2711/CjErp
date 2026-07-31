namespace CjERP.Application.DTOs;

public enum MigracionImportModo
{
    Migrar = 1,
    Actualizar = 2,
}

public sealed class MigracionImportAnalisisDto
{
    public string NombreArchivo { get; set; } = string.Empty;

    public List<string> Hojas { get; set; } = [];

    public string NombreHoja { get; set; } = string.Empty;

    public int FilasOrigen { get; set; }

    public int FilasConsolidadas { get; set; }

    public int FilasDuplicadasConsolidadas { get; set; }

    public List<string> Encabezados { get; set; } = [];

    public List<List<string?>> Filas { get; set; } = [];

    public List<MigracionImportGrupoDuplicadoDto> Duplicados { get; set; } = [];
}

public sealed class MigracionImportEjecucionResultadoDto
{
    public int FilasStaging { get; set; }

    public int FilasInsertadas { get; set; }

    public int FilasActualizadas { get; set; }

    public int FilasNoEncontradas { get; set; }

    public int OperacionesCjNuevas { get; set; }
}

public sealed class MigracionImportGrupoDuplicadoDto
{
    public string Clave { get; set; } = string.Empty;

    public int CantidadRegistros { get; set; }

    public decimal MontoOcTotal { get; set; }

    public List<MigracionImportRegistroDuplicadoDto> Registros { get; set; } = [];
}

public sealed class MigracionImportRegistroDuplicadoDto
{
    public int FilaOrigen { get; set; }

    public List<string?> Valores { get; set; } = [];
}
