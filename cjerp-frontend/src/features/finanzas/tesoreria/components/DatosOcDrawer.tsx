import React from "react";
import { X } from "lucide-react";
import type { OcDetalle } from "./DatosOcFloatingCard";
import "./DatosOcDrawer.css";

interface DatosOcDrawerProps {
  open: boolean;
  detalle: OcDetalle | null;
  onClose: () => void;
}

const currencyFormatter = new Intl.NumberFormat("es-PE", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const percentFormatter = new Intl.NumberFormat("es-PE", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

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
    if (lastComma > lastDot) {
      cleaned = stripped.replace(/\./g, "").replace(",", ".");
    } else {
      cleaned = stripped.replace(/,/g, "");
    }
  } else if (hasComma) {
    const parts = stripped.split(",");
    cleaned = parts.length === 2 && parts[1].length <= 2 ? stripped.replace(",", ".") : stripped.replace(/,/g, "");
  }

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCurrency(value: number): string {
  return currencyFormatter.format(Number.isFinite(value) ? value : 0);
}

function formatPercent(value: number): string {
  return percentFormatter.format(Number.isFinite(value) ? value : 0);
}

function getStatusTone(porcentaje: number) {
  if (porcentaje > 100) return { label: "Excedido", tone: "danger" as const };
  if (porcentaje >= 80) return { label: "Cercano al límite", tone: "warning" as const };
  return { label: "Disponible", tone: "success" as const };
}

export function DatosOcDrawer({ open, detalle, onClose }: DatosOcDrawerProps) {
  if (!open || !detalle) {
    return null;
  }

  const montoOc = parseNumericValue(detalle.montoOcDisplay ?? detalle.montoOc);
  const conPagado = parseNumericValue(detalle.conPagadoDisplay ?? detalle.conPagado);
  const porcentajeConsumoSitio = montoOc > 0 ? (conPagado / montoOc) * 100 : 0;
  const saldoReferencialSitio = montoOc - conPagado;
  const porcentajeVisual = Math.min(Math.max(porcentajeConsumoSitio, 0), 100);
  const status = saldoReferencialSitio < 0 ? { label: "Excedido", tone: "danger" as const } : getStatusTone(porcentajeConsumoSitio);
  const porcentajeVisualBarra = saldoReferencialSitio < 0 ? 100 : porcentajeVisual;
  const diferenciaReferencial = Number(detalle.subOc ?? 0) - Number(detalle.adelaFic ?? 0);

  return (
    <div className="datos-oc-drawer__backdrop" role="presentation" onClick={onClose}>
      <aside
        className="datos-oc-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={`Detalle de OC ${detalle.idOc}`}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="datos-oc-drawer__header">
          <div>
            <p className="datos-oc-drawer__eyebrow">Detalle completo</p>
            <h3 className="datos-oc-drawer__title">OC N.° {detalle.idOc || "-"}</h3>
          </div>
          <button type="button" className="datos-oc-drawer__close" onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </header>

        <div className="datos-oc-drawer__content">
          <section className="datos-oc-drawer__section">
            <h4 className="datos-oc-drawer__section-title">Resumen</h4>
            <div className="datos-oc-drawer__grid">
              <div className="datos-oc-drawer__field">
                <span>Cliente</span>
                <strong>{detalle.cliente || "-"}</strong>
              </div>
              <div className="datos-oc-drawer__field">
                <span>Proyecto</span>
                <strong>{detalle.proyecto || "-"}</strong>
              </div>
              <div className="datos-oc-drawer__field">
                <span>Sitio</span>
                <strong className="datos-oc-drawer__truncate" title={detalle.site || "-"}>
                  {detalle.site || "-"}
                </strong>
              </div>
              <div className="datos-oc-drawer__field">
                <span>Monto Oc</span>
                <strong>{detalle.montoOcDisplay || formatCurrency(montoOc)}</strong>
              </div>
              <div className="datos-oc-drawer__field">
                <span>Total acumulado del sitio</span>
                <strong>{formatCurrency(conPagado)}</strong>
              </div>
              <div className="datos-oc-drawer__field">
                <span>Saldo referencial</span>
                <strong>{formatCurrency(saldoReferencialSitio)}</strong>
              </div>
            </div>
          </section>

          <section className="datos-oc-drawer__section">
            <h4 className="datos-oc-drawer__section-title">Progreso</h4>
            <div className="datos-oc-drawer__progress-block">
              <div className="datos-oc-drawer__progress-header">
                <span>Consumo del día</span>
                <strong>{formatPercent(porcentajeConsumoSitio)}%</strong>
              </div>
              <div className="datos-oc-drawer__progress-track" aria-hidden="true">
                <div
                  className={`datos-oc-drawer__progress-fill datos-oc-drawer__progress-fill--${status.tone}`}
                  style={{ width: `${porcentajeVisualBarra}%` }}
                />
              </div>
              <p className="datos-oc-drawer__note">
                El porcentaje se calcula usando el monto OC, el acumulado del sitio y el saldo referencial.
              </p>
            </div>

            <div className="datos-oc-drawer__stats">
              <div className={`datos-oc-drawer__badge datos-oc-drawer__badge--${status.tone}`}>
                {status.label}
              </div>
              <div className="datos-oc-drawer__mini">
                <span>SubOc</span>
                <strong>{formatCurrency(Number(detalle.subOc ?? 0))}</strong>
              </div>
              <div className="datos-oc-drawer__mini datos-oc-drawer__mini--hidden">
                <span>AdelaFic</span>
                <strong>{formatCurrency(Number(detalle.adelaFic ?? 0))}</strong>
              </div>
              <div className="datos-oc-drawer__mini">
                <span>% Adelanto</span>
                <strong>{formatPercent(Number(detalle.porcentajeFic ?? 0))}%</strong>
              </div>
              <div className="datos-oc-drawer__mini">
                <span>Adelantos</span>
                <strong>{formatCurrency(Number(detalle.montoOcAdelanto ?? 0))}</strong>
              </div>
              <div className="datos-oc-drawer__mini">
                <span>Porcentaje adelanto OC</span>
                <strong>{formatPercent(Number(detalle.porcentajeOcAdelanto ?? 0))}%</strong>
              </div>
              <div className="datos-oc-drawer__mini">
                <span>Diferencia referencial = SubOc - AdelaFic</span>
                <strong>{formatCurrency(diferenciaReferencial)}</strong>
              </div>
            </div>
          </section>

          <section className="datos-oc-drawer__section datos-oc-drawer__section--hidden">
            <h4 className="datos-oc-drawer__section-title">Indicadores de alcance</h4>
            <div className="datos-oc-drawer__ranges">
              <div className="datos-oc-drawer__range-card">
                <span>Cliente</span>
                <div className="datos-oc-drawer__range-bar datos-oc-drawer__range-bar--client">
                  <div className="datos-oc-drawer__range-fill" style={{ width: `${porcentajeVisual}%` }} />
                </div>
                <strong>{formatPercent(porcentajeConsumoSitio)}%</strong>
              </div>
              <div className="datos-oc-drawer__range-card">
                <span>Sitio</span>
                <div className="datos-oc-drawer__range-bar datos-oc-drawer__range-bar--site">
                  <div className="datos-oc-drawer__range-fill" style={{ width: `${porcentajeVisual}%` }} />
                </div>
                <strong>{formatPercent(porcentajeConsumoSitio)}%</strong>
              </div>
            </div>
          </section>
        </div>
      </aside>
    </div>
  );
}

export default DatosOcDrawer;
