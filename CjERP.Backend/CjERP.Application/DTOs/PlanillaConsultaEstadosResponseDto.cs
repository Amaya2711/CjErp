using System.Collections.Generic;

namespace CjERP.Application.DTOs
{
    public class PlanillaConsultaEstadosResponseDto
    {
        public List<string> Columns { get; set; } = [];
        public List<Dictionary<string, object?>> Rows { get; set; } = [];
        public int TotalRows { get; set; }
        public int? MaxRowsAllowed { get; set; }
        public bool LimitExceeded { get; set; }
        public string? Message { get; set; }
    }
}
