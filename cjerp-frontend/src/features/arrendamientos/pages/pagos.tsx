import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  actualizarPagoArrendamientos,
  aplicarPagoArrendamientos,
  aprobarPagoArrendamientos,
  crearPagoArrendamientos,
  listarArrendadoresArrendamientos,
  listarInquilinosArrendamientos,
  listarPagosArrendamientos,
  revertirPagoArrendamientos,
} from "../../../api/arrendamientosService";
import { CheckCircle2, RotateCcw } from "lucide-react";
import type { ArrendamientosFila } from "../../../models/arrendamientos";
import ArrendamientosCrudPage from "../components/ArrendamientosCrudPage";
import type { DataGridColumn } from "../../../components/base/DataGridBase";

const CONCEPTO_PAGO_OPCIONES = ["ALQUILER", "MANTENIMIENTO", "COCHERA", "OTRO"] as const;

type PagoForm = {
  id: number | null;
  numeroOperacion: string;
  fechaOperacion: string;
  fechaContabilizacion: string;
  idInquilino: string;
  idArrendador: string;
  estadoValidacion: string;
  tipoPago: string;
  cuentaOrigen: string;
  cuentaDestino: string;
  banco: string;
  monedaOperacion: string;
  tipoCambio: string;
  conceptoPago: string;
  importeTransferido: string;
  comisionBancaria: string;
  itf: string;
  importeTotalCargado: string;
  importeOriginal: string;
  importeConvertido: string;
  diferenciaCambio: string;
  tipoTransferencia: string;
  conceptoBanco: string;
  observacion: string;
  voucherNombre: string;
  voucherExtension: string;
  voucherTamanoBytes: string;
  voucherRuta: string;
  voucherUrl: string;
};

const columns: DataGridColumn<ArrendamientosFila>[] = [
  { key: "codigo", header: "Operacion", render: (row) => row.codigo ?? "-" },
  { key: "fecha", header: "Fecha op.", render: (row) => row.fecha ?? "-" },
  { key: "fechaContabilizacion", header: "Fecha cont.", render: (row) => row.fechaContabilizacion ?? "-" },
  { key: "arrendador", header: "Arrendador", render: (row) => row.arrendador ?? "-" },
  { key: "inquilino", header: "Inquilino", render: (row) => row.inquilino ?? "-" },
  { key: "tipoPago", header: "Tipo pago", render: (row) => row.tipoPago ?? "-" },
  { key: "conceptoPago", header: "Concepto", render: (row) => row.conceptoPago ?? row.concepto ?? "-" },
  { key: "estado", header: "Validacion", render: (row) => row.estado ?? "-" },
  { key: "moneda", header: "Moneda", render: (row) => row.moneda ?? "-" },
  {
    key: "importeTransferido",
    header: "Importe transferido",
    align: "right",
    render: (row) => formatMoney(row.importeTransferido),
  },
  { key: "observacion", header: "Observacion", render: (row) => row.observacion ?? "-" },
];

const initialForm = (): PagoForm => ({
  id: null,
  numeroOperacion: generarCodigoPago(),
  fechaOperacion: dateInputValue(new Date()),
  fechaContabilizacion: dateInputValue(new Date()),
  idInquilino: "",
  idArrendador: "",
  estadoValidacion: "PENDIENTE",
  tipoPago: "COMPLETO",
  cuentaOrigen: "",
  cuentaDestino: "",
  banco: "",
  monedaOperacion: "PEN",
  tipoCambio: "",
  conceptoPago: "ALQUILER",
  importeTransferido: "",
  comisionBancaria: "",
  itf: "",
  importeTotalCargado: "",
  importeOriginal: "",
  importeConvertido: "",
  diferenciaCambio: "",
  tipoTransferencia: "",
  conceptoBanco: "",
  observacion: "",
  voucherNombre: "",
  voucherExtension: "",
  voucherTamanoBytes: "",
  voucherRuta: "",
  voucherUrl: "",
});

export default function ArrendamientosPagosPage() {
  const [arrendadores, setArrendadores] = useState<ArrendamientosFila[]>([]);
  const [inquilinos, setInquilinos] = useState<ArrendamientosFila[]>([]);

  useEffect(() => {
    let cancelled = false;

    void Promise.all([listarArrendadoresArrendamientos(), listarInquilinosArrendamientos()])
      .then(([arrendadoresData, inquilinosData]) => {
        if (cancelled) return;
        setArrendadores(arrendadoresData);
        setInquilinos(inquilinosData);
      })
      .catch(() => {
        if (cancelled) return;
        setArrendadores([]);
        setInquilinos([]);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const arrendadorOptions = useMemo(() => sortByLabel(arrendadores, (row) => row.nombre ?? row.codigo ?? ""), [arrendadores]);
  const inquilinoOptions = useMemo(() => sortByLabel(inquilinos, (row) => row.nombre ?? row.codigo ?? ""), [inquilinos]);

  return (
    <ArrendamientosCrudPage<PagoForm>
      title="Pagos"
      description="Registro, edición y validacion de pagos completos, parciales y exonerados."
      searchHint="operacion, arrendador, inquilino, tipo pago, validacion, banco, observacion"
      loadRows={listarPagosArrendamientos}
      columns={columns}
      initialForm={initialForm}
      renderRowActions={(row, helpers) => (
        <>
          <button
            type="button"
            style={styles.actionButton}
            onClick={async () => {
              if (!row.id) return;
              const confirmado = window.confirm(`¿Deseas aprobar el pago ${row.codigo ?? row.id}?`);
              if (!confirmado) return;

              try {
                const result = await aprobarPagoArrendamientos(row.id, {
                  nivelAprobacion: 1,
                  aprobado: true,
                  idEmpleadoAprobador: null,
                  observacion: "Aprobado desde la grilla de pagos.",
                });
                helpers.notificarExito(result.message || "Pago aprobado correctamente.");
                await helpers.recargar();
              } catch (error) {
                helpers.notificarError(error instanceof Error ? error.message : "No se pudo aprobar el pago.");
              }
            }}
            title="Aprobar"
          >
            <CheckCircle2 size={15} />
          </button>
          <button
            type="button"
            style={styles.actionButton}
            onClick={async () => {
              if (!row.id) return;
              const confirmado = window.confirm(`¿Deseas aplicar el pago ${row.codigo ?? row.id}?`);
              if (!confirmado) return;

              const aplicacion = solicitarAplicacionPago(row);
              if (!aplicacion) return;

              try {
                const result = await aplicarPagoArrendamientos(row.id, {
                  aplicaciones: [aplicacion],
                });
                helpers.notificarExito(result.message || "Pago aplicado correctamente.");
                await helpers.recargar();
              } catch (error) {
                helpers.notificarError(error instanceof Error ? error.message : "No se pudo aplicar el pago.");
              }
            }}
            title="Aplicar"
          >
            <span style={styles.applyLabel}>AP</span>
          </button>
          <button
            type="button"
            style={styles.actionButton}
            onClick={async () => {
              if (!row.id) return;
              const confirmado = window.confirm(`¿Deseas revertir el pago ${row.codigo ?? row.id}?`);
              if (!confirmado) return;

              try {
                const result = await revertirPagoArrendamientos(row.id, {
                  observacion: "Revertido desde la grilla de pagos.",
                });
                helpers.notificarExito(result.message || "Pago revertido correctamente.");
                await helpers.recargar();
              } catch (error) {
                helpers.notificarError(error instanceof Error ? error.message : "No se pudo revertir el pago.");
              }
            }}
            title="Revertir"
          >
            <RotateCcw size={15} />
          </button>
        </>
      )}
      mapRowToForm={(row) => ({
        id: row.id ?? null,
        numeroOperacion: row.codigo ?? generarCodigoPago(),
        fechaOperacion: row.fecha ?? dateInputValue(new Date()),
        fechaContabilizacion: row.fechaContabilizacion ?? row.fecha ?? dateInputValue(new Date()),
        idInquilino: resolveIdByLabel(row.inquilino, inquilinoOptions, (item) => item.nombre ?? item.codigo ?? ""),
        idArrendador: resolveIdByLabel(row.arrendador, arrendadorOptions, (item) => item.nombre ?? item.codigo ?? ""),
        estadoValidacion: row.estado ?? "PENDIENTE",
        tipoPago: row.tipoPago ?? "COMPLETO",
        conceptoPago: row.conceptoPago ?? row.concepto ?? "ALQUILER",
        cuentaOrigen: row.cuentaOrigen ?? "",
        cuentaDestino: row.cuentaDestino ?? "",
        banco: row.banco ?? "",
        monedaOperacion: row.moneda ?? "PEN",
        tipoCambio: row.tipoCambio != null ? String(row.tipoCambio) : "",
        importeTransferido: row.importeTransferido != null ? String(row.importeTransferido) : "",
        comisionBancaria: row.comisionBancaria != null ? String(row.comisionBancaria) : "",
        itf: row.itf != null ? String(row.itf) : "",
        importeTotalCargado: row.importeTotalCargado != null ? String(row.importeTotalCargado) : "",
        importeOriginal: row.importeOriginal != null ? String(row.importeOriginal) : "",
        importeConvertido: row.importeConvertido != null ? String(row.importeConvertido) : row.importe != null ? String(row.importe) : "",
        diferenciaCambio: row.diferenciaCambio != null ? String(row.diferenciaCambio) : "",
        tipoTransferencia: row.tipoTransferencia ?? "",
        conceptoBanco: row.conceptoBanco ?? "",
        observacion: row.observacion ?? "",
        voucherNombre: row.voucherNombre ?? "",
        voucherExtension: row.voucherExtension ?? "",
        voucherTamanoBytes: row.voucherTamanoBytes != null ? String(row.voucherTamanoBytes) : "",
        voucherRuta: row.voucherRuta ?? "",
        voucherUrl: row.voucherUrl ?? "",
      })}
      buildPayload={(form) => ({
        idPago: form.id,
        numeroOperacion: form.numeroOperacion.trim(),
        fechaOperacion: form.fechaOperacion,
        fechaContabilizacion: form.fechaContabilizacion || null,
        idInquilino: Number(form.idInquilino),
        idArrendador: Number(form.idArrendador),
        idEmpleadoRegistrador: null,
        cuentaOrigen: form.cuentaOrigen.trim() || null,
        cuentaDestino: form.cuentaDestino.trim() || null,
        banco: form.banco.trim() || null,
        monedaOperacion: form.monedaOperacion.trim(),
        tipoPago: form.tipoPago.trim().toUpperCase(),
        conceptoPago: form.conceptoPago.trim().toUpperCase(),
        tipoCambio: form.tipoCambio ? Number(form.tipoCambio) : null,
        importeTransferido: Number(form.importeTransferido || 0),
        comisionBancaria: Number(form.comisionBancaria || 0),
        itf: Number(form.itf || 0),
        importeTotalCargado: Number(form.importeTotalCargado || 0),
        importeOriginal: Number(form.importeOriginal || 0),
        importeConvertido: Number(form.importeConvertido || 0),
        diferenciaCambio: Number(form.diferenciaCambio || 0),
        tipoTransferencia: form.tipoTransferencia.trim() || null,
        conceptoBanco: form.conceptoBanco.trim() || null,
        observacion: form.observacion.trim() || null,
        voucherNombre: form.voucherNombre.trim() || null,
        voucherExtension: form.voucherExtension.trim() || null,
        voucherTamanoBytes: form.voucherTamanoBytes ? Number(form.voucherTamanoBytes) : null,
        voucherRuta: form.voucherRuta.trim() || null,
        voucherUrl: form.voucherUrl.trim() || null,
      })}
      saveForm={async (payload, mode) => {
        const idPago = Number((payload as { idPago?: number | null }).idPago ?? 0);
        const result = mode === "nuevo" ? await crearPagoArrendamientos(payload) : await actualizarPagoArrendamientos(idPago, payload);
        return {
          message: result.message || (mode === "nuevo" ? "Pago creado correctamente." : "Pago actualizado correctamente."),
        };
      }}
      validateForm={(form) => {
        const errors: Record<string, string> = {};

        if (!form.numeroOperacion.trim()) errors.numeroOperacion = "Ingrese el numero de operacion.";
        if (!form.fechaOperacion) errors.fechaOperacion = "Seleccione la fecha de operacion.";
        if (!form.fechaContabilizacion) errors.fechaContabilizacion = "Seleccione la fecha de contabilizacion.";
        if (!form.idArrendador) errors.idArrendador = "Seleccione el arrendador.";
        if (!form.idInquilino) errors.idInquilino = "Seleccione el inquilino.";
        if (!form.monedaOperacion.trim()) errors.monedaOperacion = "Seleccione la moneda.";
        if (!form.tipoPago.trim()) errors.tipoPago = "Seleccione el tipo de pago.";
        if (!form.conceptoPago.trim()) errors.conceptoPago = "Seleccione el concepto del pago.";
        if (!form.importeTransferido && form.importeTransferido !== "0") {
          errors.importeTransferido = "Ingrese el importe transferido.";
        } else if (form.tipoPago !== "EXONERADO" && Number(form.importeTransferido) <= 0) {
          errors.importeTransferido = "Ingrese el importe transferido.";
        }

        if (form.tipoCambio && Number(form.tipoCambio) <= 0) errors.tipoCambio = "El tipo de cambio debe ser mayor a cero.";
        if (form.comisionBancaria && Number(form.comisionBancaria) < 0) errors.comisionBancaria = "La comision no puede ser negativa.";
        if (form.itf && Number(form.itf) < 0) errors.itf = "El ITF no puede ser negativo.";
        if (form.importeTotalCargado && Number(form.importeTotalCargado) < 0) errors.importeTotalCargado = "El importe no puede ser negativo.";
        if (form.importeOriginal && Number(form.importeOriginal) < 0) errors.importeOriginal = "El importe original no puede ser negativo.";
        if (form.importeConvertido && Number(form.importeConvertido) < 0) errors.importeConvertido = "El importe convertido no puede ser negativo.";
        if (form.diferenciaCambio && Number(form.diferenciaCambio) < 0) errors.diferenciaCambio = "La diferencia de cambio no puede ser negativa.";

        return errors;
      }}
      renderForm={(form, setForm, errors) => (
        <div style={styles.stack}>
          <section style={styles.section}>
            <h4 style={styles.sectionTitle}>Identificacion</h4>
            <div style={styles.grid}>
              <Field label="Numero operacion" error={errors.numeroOperacion} helperText="Puede coincidir con el numero de transferencia o referencia bancaria.">
                <input
                  value={form.numeroOperacion}
                  onChange={(e) => setForm((p) => ({ ...p, numeroOperacion: e.target.value }))}
                  style={getFieldStyle(Boolean(errors.numeroOperacion))}
                />
              </Field>
              <Field label="Estado validacion">
                <input value={form.estadoValidacion} readOnly style={getFieldStyle(false)} />
              </Field>
              <Field label="Arrendador" error={errors.idArrendador}>
                <select
                  value={form.idArrendador}
                  onChange={(e) => setForm((p) => ({ ...p, idArrendador: e.target.value }))}
                  style={getFieldStyle(Boolean(errors.idArrendador))}
                >
                  <option value="">Seleccione...</option>
                  {arrendadorOptions.map((item) => (
                    <option key={item.id ?? item.codigo} value={item.id ?? ""}>
                      {item.nombre ?? item.codigo}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Inquilino" error={errors.idInquilino}>
                <select
                  value={form.idInquilino}
                  onChange={(e) => setForm((p) => ({ ...p, idInquilino: e.target.value }))}
                  style={getFieldStyle(Boolean(errors.idInquilino))}
                >
                  <option value="">Seleccione...</option>
                  {inquilinoOptions.map((item) => (
                    <option key={item.id ?? item.codigo} value={item.id ?? ""}>
                      {item.nombre ?? item.codigo}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Tipo de pago" error={errors.tipoPago}>
                <select
                  value={form.tipoPago}
                  onChange={(e) => setForm((p) => ({ ...p, tipoPago: e.target.value }))}
                  style={getFieldStyle(Boolean(errors.tipoPago))}
                >
                  <option value="COMPLETO">COMPLETO</option>
                  <option value="PARCIAL">PARCIAL</option>
                  <option value="EXONERADO">EXONERADO</option>
                </select>
              </Field>
              <Field label="Concepto del pago" error={errors.conceptoPago}>
                <select
                  value={form.conceptoPago}
                  onChange={(e) => setForm((p) => ({ ...p, conceptoPago: e.target.value }))}
                  style={getFieldStyle(Boolean(errors.conceptoPago))}
                >
                  {CONCEPTO_PAGO_OPCIONES.map((opcion) => (
                    <option key={opcion} value={opcion}>
                      {opcion}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Fecha operacion" error={errors.fechaOperacion}>
                <input
                  type="date"
                  value={form.fechaOperacion}
                  onChange={(e) => setForm((p) => ({ ...p, fechaOperacion: e.target.value }))}
                  style={getFieldStyle(Boolean(errors.fechaOperacion))}
                />
              </Field>
              <Field label="Fecha contabilizacion" error={errors.fechaContabilizacion}>
                <input
                  type="date"
                  value={form.fechaContabilizacion}
                  onChange={(e) => setForm((p) => ({ ...p, fechaContabilizacion: e.target.value }))}
                  style={getFieldStyle(Boolean(errors.fechaContabilizacion))}
                />
              </Field>
              <Field label="Moneda operacion" error={errors.monedaOperacion}>
                <select
                  value={form.monedaOperacion}
                  onChange={(e) => setForm((p) => ({ ...p, monedaOperacion: e.target.value }))}
                  style={getFieldStyle(Boolean(errors.monedaOperacion))}
                >
                  <option value="PEN">PEN</option>
                  <option value="USD">USD</option>
                </select>
              </Field>
              <Field label="Importe transferido" error={errors.importeTransferido}>
                <input
                  type="number"
                  step="0.01"
                  value={form.importeTransferido}
                  onChange={(e) => setForm((p) => ({ ...p, importeTransferido: e.target.value }))}
                  style={getFieldStyle(Boolean(errors.importeTransferido))}
                />
              </Field>
            </div>
          </section>

          <section style={styles.section}>
            <h4 style={styles.sectionTitle}>Partes y referencias</h4>
            <div style={styles.grid}>
              <Field label="Cuenta origen">
                <input value={form.cuentaOrigen} onChange={(e) => setForm((p) => ({ ...p, cuentaOrigen: e.target.value }))} style={getFieldStyle(false)} />
              </Field>
              <Field label="Cuenta destino">
                <input value={form.cuentaDestino} onChange={(e) => setForm((p) => ({ ...p, cuentaDestino: e.target.value }))} style={getFieldStyle(false)} />
              </Field>
              <Field label="Banco">
                <input value={form.banco} onChange={(e) => setForm((p) => ({ ...p, banco: e.target.value }))} style={getFieldStyle(false)} />
              </Field>
              <Field label="Tipo transferencia">
                <input value={form.tipoTransferencia} onChange={(e) => setForm((p) => ({ ...p, tipoTransferencia: e.target.value }))} style={getFieldStyle(false)} />
              </Field>
              <Field label="Concepto banco" fullWidth>
                <input value={form.conceptoBanco} onChange={(e) => setForm((p) => ({ ...p, conceptoBanco: e.target.value }))} style={getFieldStyle(false)} />
              </Field>
            </div>
          </section>

          <section style={styles.section}>
            <h4 style={styles.sectionTitle}>Montos y conversion</h4>
            <div style={styles.grid}>
              <Field label="Tipo cambio" error={errors.tipoCambio}>
                <input
                  type="number"
                  step="0.000001"
                  value={form.tipoCambio}
                  onChange={(e) => setForm((p) => ({ ...p, tipoCambio: e.target.value }))}
                  style={getFieldStyle(Boolean(errors.tipoCambio))}
                />
              </Field>
              <Field label="Comision bancaria" error={errors.comisionBancaria}>
                <input
                  type="number"
                  step="0.01"
                  value={form.comisionBancaria}
                  onChange={(e) => setForm((p) => ({ ...p, comisionBancaria: e.target.value }))}
                  style={getFieldStyle(Boolean(errors.comisionBancaria))}
                />
              </Field>
              <Field label="ITF" error={errors.itf}>
                <input
                  type="number"
                  step="0.01"
                  value={form.itf}
                  onChange={(e) => setForm((p) => ({ ...p, itf: e.target.value }))}
                  style={getFieldStyle(Boolean(errors.itf))}
                />
              </Field>
              <Field label="Importe total cargado" error={errors.importeTotalCargado}>
                <input
                  type="number"
                  step="0.01"
                  value={form.importeTotalCargado}
                  onChange={(e) => setForm((p) => ({ ...p, importeTotalCargado: e.target.value }))}
                  style={getFieldStyle(Boolean(errors.importeTotalCargado))}
                />
              </Field>
              <Field label="Importe original" error={errors.importeOriginal}>
                <input
                  type="number"
                  step="0.01"
                  value={form.importeOriginal}
                  onChange={(e) => setForm((p) => ({ ...p, importeOriginal: e.target.value }))}
                  style={getFieldStyle(Boolean(errors.importeOriginal))}
                />
              </Field>
              <Field label="Importe convertido" error={errors.importeConvertido}>
                <input
                  type="number"
                  step="0.01"
                  value={form.importeConvertido}
                  onChange={(e) => setForm((p) => ({ ...p, importeConvertido: e.target.value }))}
                  style={getFieldStyle(Boolean(errors.importeConvertido))}
                />
              </Field>
              <Field label="Diferencia de cambio" error={errors.diferenciaCambio}>
                <input
                  type="number"
                  step="0.01"
                  value={form.diferenciaCambio}
                  onChange={(e) => setForm((p) => ({ ...p, diferenciaCambio: e.target.value }))}
                  style={getFieldStyle(Boolean(errors.diferenciaCambio))}
                />
              </Field>
            </div>
          </section>

          <section style={styles.section}>
            <h4 style={styles.sectionTitle}>Voucher y observacion</h4>
            <div style={styles.grid}>
              <Field label="Nombre voucher">
                <input value={form.voucherNombre} onChange={(e) => setForm((p) => ({ ...p, voucherNombre: e.target.value }))} style={getFieldStyle(false)} />
              </Field>
              <Field label="Extension voucher">
                <input value={form.voucherExtension} onChange={(e) => setForm((p) => ({ ...p, voucherExtension: e.target.value }))} style={getFieldStyle(false)} />
              </Field>
              <Field label="Tamano bytes">
                <input
                  type="number"
                  min="0"
                  value={form.voucherTamanoBytes}
                  onChange={(e) => setForm((p) => ({ ...p, voucherTamanoBytes: e.target.value }))}
                  style={getFieldStyle(false)}
                />
              </Field>
              <Field label="URL voucher">
                <input value={form.voucherUrl} onChange={(e) => setForm((p) => ({ ...p, voucherUrl: e.target.value }))} style={getFieldStyle(false)} />
              </Field>
              <Field label="Ruta voucher" fullWidth>
                <input value={form.voucherRuta} onChange={(e) => setForm((p) => ({ ...p, voucherRuta: e.target.value }))} style={getFieldStyle(false)} />
              </Field>
              <Field label="Observacion" fullWidth>
                <textarea
                  rows={4}
                  value={form.observacion}
                  onChange={(e) => setForm((p) => ({ ...p, observacion: e.target.value }))}
                  style={{ ...getFieldStyle(false), resize: "vertical", minHeight: 100 }}
                />
              </Field>
            </div>
            <p style={styles.note}>
              {form.tipoPago === "EXONERADO"
                ? `El pago exonerado permite registrar el movimiento sin monto transferido. Concepto: ${form.conceptoPago}.`
                : `Para pagos parciales o completos, el importe transferido debe ser mayor a cero. Concepto: ${form.conceptoPago}.`}
            </p>
          </section>
        </div>
      )}
    />
  );
}

function Field({
  label,
  children,
  error,
  fullWidth = false,
  helperText,
}: {
  label: string;
  children: ReactNode;
  error?: string;
  fullWidth?: boolean;
  helperText?: string;
}) {
  return (
    <label style={{ ...styles.field, ...(fullWidth ? styles.fullWidth : {}) }}>
      <span style={styles.label}>{label}</span>
      {children}
      {helperText ? <span style={styles.helper}>{helperText}</span> : null}
      {error ? <span style={styles.error}>{error}</span> : null}
    </label>
  );
}

function formatMoney(value?: number | null) {
  if (value == null || Number.isNaN(Number(value))) {
    return "-";
  }

  return Number(value).toLocaleString("es-PE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function getFieldStyle(hasError: boolean): CSSProperties {
  return {
    width: "100%",
    borderRadius: 12,
    border: `1px solid ${hasError ? "#FCA5A5" : "#D6DCEB"}`,
    background: "#F8FAFC",
    color: "#0F172A",
    padding: "12px 14px",
    fontSize: 14,
    outline: "none",
  };
}

function sortByLabel<T>(items: T[], getLabel: (item: T) => string) {
  return [...items].sort((a, b) => getLabel(a).localeCompare(getLabel(b), "es", { sensitivity: "base" }));
}

function resolveIdByLabel<T>(label: string | null | undefined, items: T[], getLabel: (item: T) => string) {
  const normalized = normalizeText(label);
  if (!normalized) {
    return "";
  }

  const match = items.find((item) => normalizeText(getLabel(item)) === normalized);
  return match ? getItemId(match) : "";
}

function getItemId(item: unknown) {
  const typed = item as { id?: number; idEmpleado?: number };
  return String(typed.id ?? typed.idEmpleado ?? "");
}

function normalizeText(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function dateInputValue(value: Date) {
  return value.toISOString().slice(0, 10);
}

function generarCodigoPago() {
  const now = new Date();
  const pad = (value: number, size = 2) => String(value).padStart(size, "0");
  const stamp = [now.getFullYear(), pad(now.getMonth() + 1), pad(now.getDate()), pad(now.getHours()), pad(now.getMinutes()), pad(now.getSeconds())].join("");
  const suffix = pad(Math.floor(Math.random() * 1000), 3);
  return `PAG-${stamp}-${suffix}`;
}

const styles: Record<string, CSSProperties> = {
  stack: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
  section: {
    display: "flex",
    flexDirection: "column",
    gap: 14,
    padding: 16,
    borderRadius: 16,
    border: "1px solid #E2E8F0",
    background: "#F8FAFC",
  },
  sectionTitle: {
    margin: 0,
    fontSize: 15,
    fontWeight: 800,
    color: "#0F172A",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 16,
  },
  field: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  fullWidth: {
    gridColumn: "1 / -1",
  },
  label: {
    fontSize: 13,
    fontWeight: 700,
    color: "#334155",
  },
  helper: {
    fontSize: 12,
    color: "#64748B",
    fontWeight: 500,
  },
  error: {
    fontSize: 12,
    color: "#DC2626",
    fontWeight: 600,
  },
  note: {
    margin: 0,
    fontSize: 12,
    color: "#475569",
    fontWeight: 600,
  },
  actionButton: {
    width: 32,
    height: 32,
    borderRadius: 10,
    border: "1px solid #CBD5E1",
    background: "#FFFFFF",
    color: "#334155",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
  },
  applyLabel: {
    fontSize: 10,
    fontWeight: 900,
    lineHeight: 1,
  },
};

function solicitarAplicacionPago(row: ArrendamientosFila) {
  const sugerido = row.importeConvertido ?? row.importe ?? row.importeTransferido ?? 0;
  const texto = window.prompt(
    `Ingresa la aplicacion en el formato: IdObligacion,ImporteAplicado\nEjemplo: 123,${sugerido.toFixed(2)}`,
    ""
  );

  if (!texto) {
    return null;
  }

  const partes = texto
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (partes.length < 2) {
    window.alert("Formato invalido. Usa: IdObligacion,ImporteAplicado");
    return null;
  }

  const idObligacion = Number(partes[0]);
  const importeAplicado = Number(partes[1]);

  if (!Number.isInteger(idObligacion) || idObligacion <= 0 || Number.isNaN(importeAplicado) || importeAplicado <= 0) {
    window.alert("Verifica el Id de la obligacion y el importe aplicado.");
    return null;
  }

  return {
    idObligacion,
    monedaAplicacion: row.moneda ?? "PEN",
    tipoCambioAplicado: row.tipoCambio ?? null,
    importeAplicado,
    importeCapital: importeAplicado,
    importeInteres: 0,
    importePenalidad: 0,
    importeDescuento: 0,
    importeAjuste: 0,
  };
}
