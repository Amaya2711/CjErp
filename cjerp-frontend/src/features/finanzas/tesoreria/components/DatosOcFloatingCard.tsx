import React from "react";
import { ChevronDown, ChevronUp, CircleX, Eye, PencilLine, X } from "lucide-react";
import "./DatosOcFloatingCard.css";

export interface OcDetalle {
  idRegistro: number;
  idOc: number;
  cliente?: string;
  proyecto?: string;
  site?: string;
  montoOc: number;
  conPagado: number;
  conPagadoDisplay?: string;
  montoOcDisplay?: string;
  subOc: number;
  adelaFic: number;
  porcentajeFic: number;
  montoOcAdelanto?: number;
  porcentajeOcAdelanto?: number;
}

interface DatosOcFloatingCardProps {
  detalle: OcDetalle;
  minimized: boolean;
  onMinimize: () => void;
  onRestore: () => void;
  onClose: () => void;
  onVisualize?: () => void;
  onViewDetails: () => void;
  onEdit?: () => void;
  onReject?: () => void;
  accionesHabilitadas?: boolean;
}

const currencyFormatter = new Intl.NumberFormat("es-PE", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const percentFormatter = new Intl.NumberFormat("es-PE", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatCurrency(value: number): string {
  return currencyFormatter.format(Number.isFinite(value) ? value : 0);
}

function formatPercent(value: number): string {
  return percentFormatter.format(Number.isFinite(value) ? value : 0);
}

function parseNumericValue(value?: string | number | null): number {
  if (value == null) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;

  const raw = String(value).trim();
  if (!raw) return 0;

  const normalized = raw.replace(/[^\d.,-]/g, "");
  if (!normalized) return 0;
  const stripped = normalized.replace(/^[^0-9-]+/, "");
  if (!stripped) return 0;

  const hasComma = stripped.includes(",");
  const hasDot = stripped.includes(".");
  let cleaned = stripped;

  if (hasComma && hasDot) {
    const lastComma = stripped.lastIndexOf(",");
    const lastDot = stripped.lastIndexOf(".");
    cleaned = lastComma > lastDot
      ? stripped.replace(/\./g, "").replace(",", ".")
      : stripped.replace(/,/g, "");
  } else if (hasComma) {
    const parts = stripped.split(",");
    cleaned = parts.length === 2 && parts[1].length <= 2
      ? stripped.replace(",", ".")
      : stripped.replace(/,/g, "");
  }

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function DatosOcFloatingCard({
  detalle,
  minimized,
  onMinimize,
  onRestore,
  onClose,
  onVisualize,
  onViewDetails,
  onEdit,
  onReject,
  accionesHabilitadas = true,
}: DatosOcFloatingCardProps) {
  const montoOc = Number(detalle.montoOc ?? 0);
  const conPagado = parseNumericValue(detalle.conPagadoDisplay ?? detalle.conPagado);

  const porcentajeConsumoSitio = montoOc > 0 ? (conPagado / montoOc) * 100 : 0;
  const saldoReferencialSitio = montoOc - conPagado;
  const porcentajeVisual = saldoReferencialSitio < 0
    ? 100
    : Math.min(Math.max(porcentajeConsumoSitio, 0), 100);
  const estadoConsumo =
    saldoReferencialSitio < 0
      ? "Excedido"
      : porcentajeConsumoSitio > 100
      ? "Excedido"
      : porcentajeConsumoSitio >= 80
        ? "Cercano al límite"
        : "Disponible";

  const toneClass =
    estadoConsumo === "Excedido"
      ? "datos-oc-floating-card__tone datos-oc-floating-card__tone--danger"
      : estadoConsumo === "Cercano al límite"
        ? "datos-oc-floating-card__tone datos-oc-floating-card__tone--warning"
        : "datos-oc-floating-card__tone datos-oc-floating-card__tone--success";

  if (minimized) {
    return (
      <div className="datos-oc-floating-card datos-oc-floating-card--minimized" aria-live="polite">
        <div className="datos-oc-floating-card__minimized-bar">
          <button type="button" className="datos-oc-floating-card__minimized-main" onClick={onRestore}>
            <span className="datos-oc-floating-card__minimized-title">
              Datos OC — OC N.° {detalle.idOc || "-"}
            </span>
          </button>
          <div className="datos-oc-floating-card__minimized-actions">
            <button
              type="button"
              className="datos-oc-floating-card__icon-button"
              title="Restaurar"
              aria-label="Restaurar"
              onClick={onRestore}
            >
              <ChevronUp size={16} />
            </button>
            <button
              type="button"
              className="datos-oc-floating-card__icon-button"
              title="Cerrar"
              aria-label="Cerrar"
              onClick={onClose}
            >
              <X size={16} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <aside className="datos-oc-floating-card" aria-label="Resumen OC">
      <header className="datos-oc-floating-card__header">
        <div>
          <p className="datos-oc-floating-card__eyebrow">Datos OC</p>
          <h3 className="datos-oc-floating-card__title">OC N.° {detalle.idOc || "-"}</h3>
        </div>
        <div className="datos-oc-floating-card__header-actions">
          <button
            type="button"
            className="datos-oc-floating-card__icon-button"
            title="Minimizar"
            aria-label="Minimizar"
            onClick={onMinimize}
          >
            <ChevronDown size={16} />
          </button>
          <button
            type="button"
            className="datos-oc-floating-card__icon-button"
            title="Cerrar"
            aria-label="Cerrar"
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </div>
      </header>

      <section className="datos-oc-floating-card__summary">
        <div className="datos-oc-floating-card__summary-grid">
          <div className="datos-oc-floating-card__field">
            <span className="datos-oc-floating-card__label">Cliente</span>
            <strong className="datos-oc-floating-card__value">{detalle.cliente || "-"}</strong>
          </div>
          <div className="datos-oc-floating-card__field">
            <span className="datos-oc-floating-card__label">Proyecto</span>
            <strong className="datos-oc-floating-card__value">{detalle.proyecto || "-"}</strong>
          </div>
          <div className="datos-oc-floating-card__field">
            <span className="datos-oc-floating-card__label">Sitio</span>
            <strong className="datos-oc-floating-card__value">{detalle.site || "-"}</strong>
          </div>
        </div>
      </section>

      <section className="datos-oc-floating-card__section">
        <div className="datos-oc-floating-card__metric-header">
          <span className="datos-oc-floating-card__label">Monto Oc</span>
          <strong className="datos-oc-floating-card__metric">{detalle.montoOcDisplay || formatCurrency(montoOc)}</strong>
        </div>
        <div className="datos-oc-floating-card__metric-row">
          <span className="datos-oc-floating-card__subtext">Total acumulado del sitio</span>
          <strong className="datos-oc-floating-card__metric">{formatCurrency(conPagado)}</strong>
        </div>
        <p className="datos-oc-floating-card__hint">Incluye el gasto seleccionado</p>
        <div className="datos-oc-floating-card__progress-track" aria-hidden="true">
          <div
            className={`datos-oc-floating-card__progress-fill datos-oc-floating-card__progress-fill--${estadoConsumo.toLowerCase().replace(/\s+/g, "-")}`}
            style={{ width: `${porcentajeVisual}%` }}
          />
        </div>
        <div className="datos-oc-floating-card__progress-meta">
          <span>{formatPercent(porcentajeConsumoSitio)}%</span>
          <span>{estadoConsumo}</span>
        </div>
      </section>

      <section className="datos-oc-floating-card__section datos-oc-floating-card__section--soft">
        <div className={toneClass}>{estadoConsumo}</div>
        <div className="datos-oc-floating-card__detail-list">
          <div className="datos-oc-floating-card__detail-item">
            <span className="datos-oc-floating-card__label">Saldo referencial después del sitio</span>
            <strong className="datos-oc-floating-card__value">{formatCurrency(saldoReferencialSitio)}</strong>
          </div>
          <div className="datos-oc-floating-card__detail-item">
            <span className="datos-oc-floating-card__label">Comparación referencial</span>
            <span className="datos-oc-floating-card__subtext">
              el acumulado corresponde al sitio y el monto OC corresponde al cliente.
            </span>
          </div>
          <div className="datos-oc-floating-card__detail-item datos-oc-floating-card__detail-item--inline">
            <span className="datos-oc-floating-card__label">SubOc</span>
            <strong className="datos-oc-floating-card__value">{formatCurrency(Number(detalle.subOc ?? 0))}</strong>
          </div>
          <div className="datos-oc-floating-card__detail-item datos-oc-floating-card__detail-item--inline">
            <span className="datos-oc-floating-card__label">AdelaFic</span>
            <strong className="datos-oc-floating-card__value">{formatCurrency(Number(detalle.adelaFic ?? 0))}</strong>
          </div>
        </div>
      </section>

      <footer className="datos-oc-floating-card__footer">
        <div className="datos-oc-floating-card__action-row">
          <button
            type="button"
            className="datos-oc-floating-card__secondary-button"
            onClick={onVisualize}
            title="Visualizar gasto"
            aria-label="Visualizar gasto"
          >
            <Eye size={16} />
            Visualizar
          </button>
          <button
            type="button"
            className="datos-oc-floating-card__secondary-button"
            onClick={onEdit}
            title={accionesHabilitadas ? "Editar" : "Editar no disponible para este estado"}
            aria-label="Editar"
            disabled={!accionesHabilitadas || !onEdit}
          >
            <PencilLine size={16} />
            Editar
          </button>
          <button
            type="button"
            className="datos-oc-floating-card__secondary-button datos-oc-floating-card__secondary-button--danger"
            onClick={onReject}
            title={accionesHabilitadas ? "Rechazar" : "Rechazar no disponible para este estado"}
            aria-label="Rechazar"
            disabled={!accionesHabilitadas || !onReject}
          >
            <CircleX size={16} />
            Rechazar
          </button>
        </div>
        <button type="button" className="datos-oc-floating-card__primary-button" onClick={onViewDetails}>
          <Eye size={16} />
          Ver detalle completo
        </button>
      </footer>
    </aside>
  );
}

export default DatosOcFloatingCard;
