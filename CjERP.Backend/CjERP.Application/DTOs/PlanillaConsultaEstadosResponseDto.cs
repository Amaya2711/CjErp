using System.Collections.Generic;

namespace CjERP.Application.DTOs
{
    public class PlanillaConsultaEstadosResponseDto
    {
        public List<string> Columns { get; set; } = [];
        public List<Dictionary<string, object?>> Rows { get; set; } = [];
    }
}
