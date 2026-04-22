namespace CjERP.Application.DTOs
{
    public class EmpleadoCtaDto
    {
        public int IdEmpleado { get; set; }
        public string NombreEmpleado { get; set; }
        public string Cuenta { get; set; }
        public string CuentaInter { get; set; }
        public string NombreCta { get; set; }
        public string NombreBanco { get; set; }
        public int IdDocumento { get; set; }
        public string NroDocumento { get; set; }
        public int? IdCheque { get; set; }
        public string NombreEmpleadoCJ { get; set; }
    }
}