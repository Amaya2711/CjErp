namespace CjERP.Api.Configuration;

public sealed class SharePointOptions
{
    public const string SectionName = "SharePoint";

    public string TenantId { get; set; } = string.Empty;
    public string ClientId { get; set; } = string.Empty;
    public string ClientSecret { get; set; } = string.Empty;
    public string HostName { get; set; } = "cjtelecom.sharepoint.com";
    public string SitePath { get; set; } = "/sites/CJ-PROYECTOS";
    public string DocumentLibraryName { get; set; } = "APLICATIVOS EXTERNOS";
    public string ExpensesFolderPath { get; set; } = "GASTO_FOTOS";
    public string ReembolsosFolderPath { get; set; } = "REEMBOLSOS";
    public string MobileCommunicationsFolderPath { get; set; } = "COMUNICACIONES";
    public Dictionary<string, string> FolderPaths { get; set; } = new(StringComparer.OrdinalIgnoreCase);
    public SharePointAsistenciaOptions Asistencia { get; set; } = new();
    public SharePointGastosExcelOptions GastosExcel { get; set; } = new();
    public SharePointEmpleadosListaOptions EmpleadosLista { get; set; } = new();
}

/// <summary>Lista de SharePoint (M_EMPLEADOS) que sincroniza el job EMPLEADOS_LISTA_SHAREPOINT.</summary>
public sealed class SharePointEmpleadosListaOptions
{
    /// <summary>Sitio de la lista (distinto del sitio de aplicativos): https://cjtelecom.sharepoint.com/sites/CJ-TELECOM.</summary>
    public string SitePath { get; set; } = "/sites/CJ-TELECOM";
    public string ListName { get; set; } = "M_EMPLEADOS";
    /// <summary>
    /// Columna del resultado de sp_Consultar_EmpleadoSharepoint que identifica de forma única a cada empleado
    /// (debe existir con el mismo nombre interno en la lista). Vacío = primera columna del SP. PV: confirmar.
    /// </summary>
    public string KeyColumn { get; set; } = "IdEmpleado";

    /// <summary>Columna del SP usada para emparejar registros de la lista que aún no tienen la clave principal (vacío = no usar).</summary>
    public string SecondaryKeyColumn { get; set; } = "NroDocumento";

    /// <summary>
    /// Homologación columna del SP → columna de la lista (nombre interno o para mostrar). Solo se sincronizan las
    /// columnas mapeadas. La clave (KeyColumn) debe estar en este mapa.
    /// </summary>
    public Dictionary<string, string> ColumnMap { get; set; } = new(StringComparer.OrdinalIgnoreCase)
    {
        ["NombreEmpleado"] = "EMPLEADO",
        ["IdEmpleado"] = "CODIGO_EMPLEADO",
        ["TipoDocumento"] = "TIPO_DOC_IDENTIDAD",
        ["NroDocumento"] = "DOC_IDENTIDAD",
        ["Sexo"] = "SEXO",
        ["Telefono"] = "CELULAR",
        ["Correo"] = "CORREO",
        ["FechaIngreso"] = "FECHA_INGRESO",
        ["Estado"] = "ESTADO",
        ["fecnacimiento"] = "fecha_nacimiento"
    };
}

public sealed class SharePointAsistenciaOptions
{
    public string DocumentLibraryName { get; set; } = "Documentos compartidos";
    public string FolderPath { get; set; } = "Asistencia";
}

/// <summary>Libro de Excel con la tabla de gastos que actualiza el job GASTOS_EXCEL_SHAREPOINT.</summary>
public sealed class SharePointGastosExcelOptions
{
    /// <summary>Biblioteca del sitio (el alias "Documentos compartidos" equivale a Documents/Documentos).</summary>
    public string DocumentLibraryName { get; set; } = "Documentos compartidos";
    /// <summary>Carpeta del archivo; vacío = se busca por nombre en toda la biblioteca.</summary>
    public string FolderPath { get; set; } = string.Empty;
    public string FileName { get; set; } = "GASTOS.xlsx";
    public string TableName { get; set; } = "TBL_GASTOS";
}
