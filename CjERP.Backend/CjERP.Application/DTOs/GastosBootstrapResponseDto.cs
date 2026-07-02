using System.Collections.Generic;

namespace CjERP.Application.DTOs
{
    public class GastosBootstrapResponseDto
    {
        public List<EmpleadoCtaDto> Empleados { get; set; } = [];
        public List<SolicitanteLookupDto> Solicitantes { get; set; } = [];
        public List<SolicitanteLookupDto> Gestores { get; set; } = [];
        public List<SolicitanteLookupDto> Validadores { get; set; } = [];
        public List<TareaDto> Tareas { get; set; } = [];
    }
}
