using Microsoft.AspNetCore.Mvc;
using System.Collections.Generic;

namespace CjERP.Api.Controllers
{
    [ApiController]
    [Route("api/tesoreria/gastos")]
    public class TesoreriaGastosController : ControllerBase
    {
        // Modelo simple para ejemplo
        public class GastoDto
        {
            public int Id { get; set; }
            public string FiltroOperativoKey { get; set; }
            public string Responsable { get; set; }
            public string Cuenta { get; set; }
            public string TipoPago { get; set; }
            public decimal Monto { get; set; }
            public string Detalle { get; set; }
            public string Comentario { get; set; }
            public string FechaVencimiento { get; set; }
            public string FechaEmision { get; set; }
            public string Solicitante { get; set; }
            public string Gestor { get; set; }
            public string Validador { get; set; }
            public string Moneda { get; set; }
            public string Bien { get; set; }
            public string Comprobante { get; set; }
            public string Serie { get; set; }
        }

        // Simulación de base de datos en memoria
        private static readonly List<GastoDto> _gastos = new List<GastoDto>();
        private static int _nextId = 1;

        [HttpGet]
        public IActionResult GetAll()
        {
            return Ok(new { success = true, message = "ok", data = _gastos });
        }

        [HttpPost]
        public IActionResult Create([FromBody] GastoDto dto)
        {
            dto.Id = _nextId++;
            _gastos.Add(dto);
            return Ok(new { success = true, message = "Gasto creado", data = dto });
        }

        [HttpPut("{id}")]
        public IActionResult Update(int id, [FromBody] GastoDto dto)
        {
            var gasto = _gastos.Find(x => x.Id == id);
            if (gasto == null) return NotFound(new { success = false, message = "No encontrado" });
            dto.Id = id;
            _gastos[_gastos.IndexOf(gasto)] = dto;
            return Ok(new { success = true, message = "Gasto actualizado", data = dto });
        }

        [HttpDelete("{id}")]
        public IActionResult Delete(int id)
        {
            var gasto = _gastos.Find(x => x.Id == id);
            if (gasto == null) return NotFound(new { success = false, message = "No encontrado" });
            _gastos.Remove(gasto);
            return Ok(new { success = true, message = "Gasto eliminado" });
        }
    }
}
