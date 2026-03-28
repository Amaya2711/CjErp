using CjERP.Infrastructure.Persistence.Context;
using Microsoft.AspNetCore.Mvc;

namespace CjERP.Api.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class TestConnectionController : ControllerBase
    {
        private readonly CJERPDbContext _context;

        public TestConnectionController(CJERPDbContext context)
        {
            _context = context;
        }

        [HttpGet]
        public async Task<IActionResult> Get()
        {
            var canConnect = await _context.Database.CanConnectAsync();

            if (!canConnect)
                return BadRequest("No se pudo conectar a SQL Server.");

            return Ok("Conexión correcta con SQL Server.");
        }
    }
}