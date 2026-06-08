export interface EmpleadoCta {
  idEmpleado: number;
  idBancoCta?: number | null;
  nombreEmpleado: string;
  telefono?: string;
  correo?: string;
  cuenta: string;
  cuentaInter: string;
  nombreCta: string;
  nombreBanco: string;
  idDocumento: number;
  nroDocumento: string;
  idCheque: number | null;
  nombreEmpleadoCJ: string;
}
