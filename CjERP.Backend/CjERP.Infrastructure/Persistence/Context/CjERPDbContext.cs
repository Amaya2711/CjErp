using Microsoft.EntityFrameworkCore;

namespace CjERP.Infrastructure.Persistence.Context
{
    public class CJERPDbContext : DbContext
    {
        public CJERPDbContext(DbContextOptions<CJERPDbContext> options)
            : base(options)
        {
        }
    }
}