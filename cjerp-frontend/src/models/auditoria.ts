export type AuditoriaCambioFiltro = {
  modulo?: string;
  entidad?: string;
  idRegistro?: string;
  seccion?: string;
  campo?: string;
  usuarioAccion?: string;
  fechaDesde?: string;
  fechaHasta?: string;
  top?: number;
};

export type AuditoriaCambioItem = {
  idAuditoria: number;
  modulo: string;
  entidad: string;
  idRegistro: string;
  accion: string;
  seccion?: string | null;
  campo: string;
  valorAnterior?: string | null;
  valorNuevo?: string | null;
  usuarioAccion: string;
  fechaAccion: string;
  observacion?: string | null;
};
