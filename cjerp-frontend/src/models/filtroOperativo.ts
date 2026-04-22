// src/models/filtroOperativo.ts

export interface FiltroOperativoItem {
  filtroKey: string;
  idCliente: number;
  idProyecto: number;
  idSite: number;
  correlativo: number;
  nroInterno: number;
  nombreCliente: string;
  nombreProyecto: string;
  nombreSite: string;
  tipoTrabajo: string;
  ot: string;
  fecAsignacion: string | null;
}

export interface TipoTrabajoOption {
  tipoTrabajo: string;
}

export interface OtOption {
  ot: string;
  fecAsignacion: string | null;
}

export interface TareaOption {
  correlativo: number;
  tarea: string;
}

export interface FiltroOperativoValue {
  filtro?: FiltroOperativoItem;
  tipoTrabajo?: TipoTrabajoOption;
  ot?: OtOption;
  tarea?: TareaOption;
}

export interface FiltroOperativoLookupProps {
  value?: FiltroOperativoValue;
  onChange?: (value: FiltroOperativoValue) => void;
  disabled?: boolean;
  readOnly?: boolean;
  className?: string;
  resetOnChange?: boolean;
}
