using System.Collections.Generic;

namespace CjERP.Application.DTOs
{
    public class PlanillaConsultaEstadosRequestDto
    {
        public List<PlanillaConsultaParametroDto> Parametros { get; set; } = [];
        public int? MaxRows { get; set; }
    }

    public class PlanillaConsultaParametroDto
    {
        public string Nombre { get; set; } = string.Empty;
        public string? Valor { get; set; }
        public string Tipo { get; set; } = "string";
    }
}
