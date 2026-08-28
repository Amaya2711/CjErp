export interface ConstanteLookupDto {
  campo: string;
  codigo: string;
  descripcion: string;
  valor: string;
  valorIni?: string | null;
  valorFin?: string | null;
  detalle?: string | null;
  orden: number;
}

export interface ConstanteOption {
  value: string;
  label: string;
  codigo: string;
  valor: string;
  campo: string;
  orden: number;
}
