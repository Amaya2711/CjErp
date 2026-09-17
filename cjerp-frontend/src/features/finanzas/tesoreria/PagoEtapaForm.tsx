import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { CheckCircle2, X } from "lucide-react";
import {
  crearItemsTesoreria,
  ejecutarAccionTesoreria,
} from "../../../api/pagoTesoreriaService";
import type {
  PagoAccion,
  PagoAccionRequest,
  PagoCatalogos,
  PagoOpcion,
  PagoTesoreriaRow,
} from "../../../api/pagoTesoreriaService";
import { getHttpErrorMessage } from "../../../utils/httpError";

const acciones: Record<number, { key: PagoAccion; label: string }[]> = {
  1: [
    { key: "revisar", label: "Contabilidad" },
    { key: "observar", label: "Observar" },
  ],
  9: [
    { key: "contabilidad-programar", label: "Guardar y enviar a Programado" },
    {
      key: "contabilidad-administrativo",
      label: "Guardar y enviar a Administrativo",
    },
    { key: "observar", label: "Observar recibos" },
  ],
  8: [
    { key: "administrativo", label: "Enviar a Administrativo" },
    { key: "observar", label: "Observar recibos" },
  ],
  5: [
    { key: "programar", label: "Enviar a Programado" },
    { key: "observar", label: "Observar recibos" },
  ],
  4: [{ key: "rendicion", label: "Guardar rendición" }],
  2: [
    { key: "corregir", label: "Guardar corrección" },
    { key: "subsanar", label: "Subsanar y devolver al flujo" },
  ],
};
export function PagoEtapaActions({ estado, formId, disabled, programarDisabled = false, ocultarProgramar = false, contabilidadDisabled = false }: {
  estado: number;
  formId: string;
  disabled: boolean;
  programarDisabled?: boolean;
  ocultarProgramar?: boolean;
  contabilidadDisabled?: boolean;
}) {
  const accionesVisibles = (acciones[estado] ?? []).filter(
    (accion) => !(ocultarProgramar && accion.key === "programar"),
  );
  return <>{accionesVisibles.map((accion, index) => (
    <button type="submit" form={formId} key={accion.key} value={accion.key}
      className={index === 0 ? "pt-primary" : ""}
      disabled={disabled || (estado === 9 && accion.key.startsWith("contabilidad-") && contabilidadDisabled) || (accion.key === "programar" && programarDisabled)}
      title={estado === 9 && accion.key === "contabilidad-programar" ? "Acción no habilitada actualmente" : undefined}>
      {accion.label}
    </button>
  ))}</>;
}
const textos: Record<PagoAccion, string> = {
  revisar:
    "Se registrarán la fecha y el turno AM/PM de Lima y los recibos pasarán a Contabilidad.",
  "contabilidad-programar":
    "Se aplicará la retención y los recibos pasarán a Programado.",
  "contabilidad-administrativo":
    "Se aplicará la retención y los recibos pasarán a Administrativo.",
  programar: "Los recibos pasarán a Programado, sin registrarse como pagados.",
  administrativo: "Los recibos pasarán a Administrativo conservando sus datos.",
  observar:
    "Los recibos pasarán a Observada administrativa con el motivo ingresado.",
  rendicion:
    "Se actualizarán únicamente los bloques activados. Los recibos conservarán el estado Pagado.",
  corregir:
    "Se guardarán los campos activados y el detalle de la corrección. Los recibos permanecerán observados.",
  subsanar:
    "Los observados de aprobación volverán a Aprobación; los observados administrativos volverán a Revisión. Se guardarán las correcciones activadas.",
};
const hoy = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const inicial = () => ({
  observacion: "",
  idRetencion: "",
  generales: false,
  banco: false,
  rendicion: false,
  operacion: false,
  idComprobante: "",
  idTipoPago: "",
  ruc: "",
  serie: "",
  fecEmision: hoy(),
  idBanco: "",
  idMoneda2: "",
  fechaDeposito: hoy(),
  idTransferencia: "",
  nroOperacion: "",
  idRendicion: "",
  editarDetalle: false,
  detalle: "",
  adjunto: false,
  imgFactura: "",
});

export default function PagoEtapaForm({
  formId,
  estado,
  rows,
  catalogos,
  disabled,
  onBusy,
  onRefresh,
  onMessage,
  programarListo,
  onProgramarIncompleto,
  onContabilidadValida,
  ocultarFormulario = false,
}: {
  formId: string;
  estado: number;
  rows: PagoTesoreriaRow[];
  catalogos: PagoCatalogos;
  disabled: boolean;
  onBusy: (busy: boolean) => void;
  onRefresh: () => Promise<void>;
  onMessage: (message: string, error?: boolean) => void;
  programarListo?: boolean;
  onProgramarIncompleto?: () => void;
  onContabilidadValida?: (valid: boolean) => void;
  ocultarFormulario?: boolean;
}) {
  const [form, setForm] = useState(inicial);
  const [pending, setPending] = useState<PagoAccionRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ref = useRef<HTMLDialogElement>(null);
  const lock = useRef(false);
  const editar = estado === 4 || estado === 2;
  useEffect(() => {
    if (estado === 9) onContabilidadValida?.(rows.length > 0 && Boolean(form.idRetencion));
  }, [estado, form.idRetencion, rows.length, onContabilidadValida]);
  useEffect(() => {
    if (pending) {
      if (!ref.current?.open) ref.current?.showModal();
    }
    else ref.current?.close();
  }, [pending]);
  const field = <K extends keyof ReturnType<typeof inicial>>(
    name: K,
    value: ReturnType<typeof inicial>[K],
  ) => setForm((p) => ({ ...p, [name]: value }));
  const select = (
    label: string,
    name:
      | "idRetencion"
      | "idComprobante"
      | "idTipoPago"
      | "idBanco"
      | "idMoneda2"
      | "idTransferencia"
      | "idRendicion",
    options: PagoOpcion[],
  ) => (
    <label className="pt-field">
      <span>{label} *</span>
      <select value={form[name]} onChange={(e) => field(name, e.target.value)}>
        <option value="">Seleccionar</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.nombre}
            {name === "idRetencion" && o.porcentaje
              ? ` (${o.porcentaje}%)`
              : ""}
          </option>
        ))}
      </select>
    </label>
  );
  const input = (
    label: string,
    name:
      | "ruc"
      | "serie"
      | "fecEmision"
      | "fechaDeposito"
      | "nroOperacion"
      | "imgFactura",
    type = "text",
    maxLength?: number,
  ) => (
    <label className="pt-field">
      <span>{label}</span>
      <input
        type={type}
        value={form[name]}
        max={type === "date" ? hoy() : undefined}
        maxLength={maxLength}
        onChange={(e) => field(name, e.target.value)}
      />
    </label>
  );
  const prefill = () => {
    const r = rows[0];
    if (!r || rows.length !== 1) return;
    const id = (value: number | null) => (value == null ? "" : String(value));
    const date = (value: string | null) =>
      value && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : hoy();
    setForm((p) => ({
      ...p,
      idRetencion: id(r.idRetencion),
      idComprobante: id(r.idComprobante),
      idTipoPago: id(r.idTipoPago),
      ruc: r.ruc || "",
      serie: r.serie || "",
      fecEmision: date(r.fecEmision),
      idBanco: id(r.idBanco),
      idMoneda2: id(r.idMoneda2),
      fechaDeposito: date(r.fechaDeposito),
      idTransferencia: id(r.idTransferencia),
      nroOperacion: r.nroOperacion || "",
      idRendicion: id(r.idRendicion),
      detalle: r.detalle || "",
      imgFactura: r.imgFactura || "",
    }));
  };
  const revisar = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    const accion = (
      (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null
    )?.value as PagoAccion;
    if (!acciones[estado]?.some((a) => a.key === accion) || busy || disabled) return;
    if (!rows.length) {
      setError("No existen registros seleccionados");
      return;
    }
    if (rows.length > 500) {
      setError("Seleccione entre 1 y 500 recibos.");
      return;
    }
    if (accion === "observar") {
      setPending({ accion, items: crearItemsTesoreria(rows), observacion: "" });
      return;
    }
    if (accion === "programar" && !programarListo) {
      onProgramarIncompleto?.();
      setError("Complete los datos obligatorios de Registrar pago antes de enviar a Programado.");
      return;
    }
    if (
      ["corregir", "subsanar"].includes(accion) &&
      !form.observacion.trim()
    ) {
      setError("Ingrese el motivo o el detalle de la corrección.");
      return;
    }
    const contabilidad = accion.startsWith("contabilidad-");
    if (contabilidad && form.idRetencion === "") {
      setError("Seleccione la retención.");
      return;
    }
    if (editar) {
      if (
        estado === 4 &&
        !form.generales &&
        !form.banco &&
        !form.rendicion &&
        !form.operacion
      ) {
        setError("Active al menos un bloque para actualizar.");
        return;
      }
      if (
        form.generales &&
        (form.idComprobante === "" ||
          form.idTipoPago === "" ||
          !form.fecEmision ||
          form.fecEmision > hoy())
      ) {
        setError(
          "Complete comprobante, tipo de pago y fecha de emisión válida.",
        );
        return;
      }
      if (form.generales && form.ruc && !/^\d{11}$/.test(form.ruc)) {
        setError("El RUC debe tener 11 dígitos.");
        return;
      }
      if (
        form.banco &&
        (!form.idBanco ||
          !form.idMoneda2 ||
          !form.idTransferencia ||
          !form.fechaDeposito ||
          form.fechaDeposito > hoy())
      ) {
        setError("Complete los datos bancarios y una fecha válida.");
        return;
      }
      if (
        form.banco &&
        rows.some((r) => r.tipoMoneda !== Number(form.idMoneda2))
      ) {
        setError(
          "La moneda bancaria debe coincidir con todos los recibos seleccionados.",
        );
        return;
      }
      if (form.rendicion && form.idRendicion === "") {
        setError("Seleccione el estado de rendición.");
        return;
      }
      if (form.operacion && !form.nroOperacion.trim()) {
        setError("Ingrese la operación bancaria.");
        return;
      }
      if (form.editarDetalle && !form.detalle.trim()) {
        setError("Ingrese el detalle corregido.");
        return;
      }
      if (form.adjunto) {
        try {
          if (new URL(form.imgFactura).protocol !== "https:") throw Error();
        } catch {
          setError("Ingrese un enlace HTTPS válido al comprobante.");
          return;
        }
      }
    }
    const request: PagoAccionRequest = {
      accion,
      items: crearItemsTesoreria(rows),
      observacion: estado === 4 && !form.generales ? "" : form.observacion.trim(),
    };
    if (contabilidad) request.idRetencion = Number(form.idRetencion);
    if (editar)
      Object.assign(request, {
        aplicarGenerales: form.generales,
        aplicarBanco: form.banco,
        aplicarRendicion: form.rendicion,
        aplicarOperacion: form.operacion,
        aplicarDetalle: form.editarDetalle,
        aplicarAdjunto: form.adjunto,
      });
    if (editar && form.generales)
      Object.assign(request, {
        idComprobante: Number(form.idComprobante),
        idTipoPago: Number(form.idTipoPago),
        ruc: form.ruc.trim(),
        serie: form.serie.trim(),
        fecEmision: form.fecEmision,
      });
    if (editar && form.banco)
      Object.assign(request, {
        idBanco: Number(form.idBanco),
        idMoneda2: Number(form.idMoneda2),
        fechaDeposito: form.fechaDeposito,
        idTransferencia: Number(form.idTransferencia),
        nroOperacion: form.nroOperacion.trim(),
      });
    if (editar && form.operacion)
      request.nroOperacion = form.nroOperacion.trim();
    if (editar && form.rendicion)
      request.idRendicion = Number(form.idRendicion);
    if (editar && form.editarDetalle) request.detalle = form.detalle.trim();
    if (editar && form.adjunto) request.imgFactura = form.imgFactura.trim();
    setPending(request);
  };
  const save = async () => {
    if (!pending || lock.current) return;
    if (pending.accion === "observar" && !pending.observacion.trim()) return;
    lock.current = true;
    setBusy(true);
    onBusy(true);
    try {
      const result = await ejecutarAccionTesoreria({ ...pending, observacion: pending.observacion.trim() });
      setPending(null);
      setForm(inicial());
      await onRefresh();
      onMessage(
        `${result.procesados} recibo(s) actualizado(s) correctamente.`,
      );
    } catch (e) {
      setPending(null);
      await onRefresh();
      onMessage(
        getHttpErrorMessage(
          e,
          "No se pudo confirmar la operación. Revise la consulta actualizada.",
        ),
        true,
      );
    } finally {
      lock.current = false;
      setBusy(false);
      onBusy(false);
    }
  };
  return (
    <section className={estado === 1 ? "pt-stage-dialogs" : "pt-stage-form"}>
      {!ocultarFormulario && estado !== 1 && <>
      <h2>
        {estado === 9
            ? "Validación contable"
            : estado === 4
              ? "Actualizar rendición"
              : estado === 2
                ? "Corregir observación"
                : "Cambiar etapa"}
      </h2>
      <p className="pt-footnote">
        {rows.length} recibos seleccionados · Máximo 500 por lote
      </p>
      {estado === 2 && rows.length === 1 && (
        <div className="pt-inline-alert">
          <strong>Observación actual</strong>
          <p>{rows[0].observacion || "Sin motivo registrado"}</p>
        </div>
      )}
      </>}
      <form id={formId} onSubmit={revisar} hidden={estado === 1 || ocultarFormulario}>
        <fieldset disabled={disabled || busy}>
          {editar && (
            <button
              type="button"
              disabled={rows.length !== 1}
              onClick={prefill}
            >
              Cargar datos del recibo seleccionado
            </button>
          )}
          {estado === 9 && (
            <>
              {select("Retención", "idRetencion", catalogos.retenciones)}
              <p className="pt-footnote">
                Se aplica el porcentaje del catálogo a los comprobantes
                admitidos (2 y 5). Una opción sin porcentaje conserva la
                retención existente, según la regla anterior.
              </p>
            </>
          )}
          {editar && (
            <>
              <label className="pt-block-toggle">
                <input
                  type="checkbox"
                  checked={form.generales}
                  onChange={(e) => field("generales", e.target.checked)}
                />
                {estado === 4
                  ? "Actualizar datos generales"
                  : "Corregir comprobante"}
              </label>
              {form.generales && (
                <div className="pt-edit-block">
                  {select(
                    "Comprobante",
                    "idComprobante",
                    catalogos.comprobantes,
                  )}
                  {select("Tipo de pago", "idTipoPago", catalogos.tiposPago)}
                  {input("RUC (opcional)", "ruc", "text", 11)}
                  {input("Serie / Número", "serie", "text", 50)}
                  {input("Fecha de emisión *", "fecEmision", "date")}
                  <small>
                    Los campos de este bloque, incluso los vacíos, reemplazarán
                    los valores del lote.
                  </small>
                </div>
              )}
            </>
          )}
          {estado === 4 && (
            <>
              <label className="pt-block-toggle">
                <input
                  type="checkbox"
                  checked={form.banco}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      banco: e.target.checked,
                      operacion: false,
                    }))
                  }
                />
                Actualizar datos bancarios
              </label>
              {form.banco && (
                <div className="pt-edit-block">
                  {select("Banco", "idBanco", catalogos.bancos)}
                  {select("Moneda bancaria", "idMoneda2", catalogos.monedas)}
                  {select(
                    "Transferencia",
                    "idTransferencia",
                    catalogos.transferencias,
                  )}
                  {input("Fecha de depósito *", "fechaDeposito", "date")}
                  {input("Operación bancaria", "nroOperacion", "text", 50)}
                </div>
              )}
              <label className="pt-block-toggle">
                <input
                  type="checkbox"
                  checked={form.rendicion}
                  onChange={(e) => field("rendicion", e.target.checked)}
                />
                Actualizar estado de rendición
              </label>
              {form.rendicion &&
                select("Rendición", "idRendicion", catalogos.rendiciones)}
              <label className="pt-block-toggle">
                <input
                  type="checkbox"
                  checked={form.operacion}
                  disabled={form.banco}
                  onChange={(e) => field("operacion", e.target.checked)}
                />
                Actualizar solo la operación
              </label>
              {form.operacion &&
                input("Operación bancaria *", "nroOperacion", "text", 50)}
            </>
          )}
          {estado === 2 && (
            <>
              <label className="pt-block-toggle">
                <input
                  type="checkbox"
                  checked={form.editarDetalle}
                  onChange={(e) => field("editarDetalle", e.target.checked)}
                />
                Corregir detalle
              </label>
              {form.editarDetalle && (
                <label className="pt-field">
                  <span>Detalle corregido *</span>
                  <textarea
                    rows={4}
                    maxLength={4000}
                    value={form.detalle}
                    onChange={(e) => field("detalle", e.target.value)}
                  />
                </label>
              )}
              <label className="pt-block-toggle">
                <input
                  type="checkbox"
                  checked={form.adjunto}
                  onChange={(e) => field("adjunto", e.target.checked)}
                />
                Actualizar enlace del comprobante
              </label>
              {form.adjunto &&
                input(
                  "Enlace HTTPS del comprobante *",
                  "imgFactura",
                  "text",
                  2500,
                )}
            </>
          )}
          <label className="pt-field">
            <span>
              {estado === 2
                ? "Detalle de la corrección *"
                : "Observación / Motivo"}
            </span>
            <textarea
              value={form.observacion}
              disabled={estado === 4 && !form.generales}
              rows={3}
              maxLength={500}
              onChange={(e) => field("observacion", e.target.value)}
            />
            {estado === 4 && (
              <small>La observación se guarda al activar los datos generales.</small>
            )}
          </label>
          {error && (
            <p className="pt-inline-alert" role="alert">
              {error}
            </p>
          )}
        </fieldset>
      </form>
      <dialog
        ref={ref}
        className="pt-dialog"
        aria-labelledby="pt-stage-confirm"
        onCancel={(e) => {
          e.preventDefault();
          if (!busy) setPending(null);
        }}
      >
        <div className="pt-dialog-heading">
          <h2 id="pt-stage-confirm">{pending?.accion === "observar" ? "Observar recibos" : "¿Confirmar cambio de estado?"}</h2>
          <button
            disabled={busy}
            aria-label="Cerrar confirmación de etapa"
            onClick={() => setPending(null)}
          >
            <X size={18} />
          </button>
        </div>
        {pending && (
          <>
            <p>
              <strong>
                {acciones[estado].find((a) => a.key === pending.accion)?.label}
              </strong>
            </p>
            <p>{textos[pending.accion]}</p>
            {pending.accion !== "observar" && <p>¿Desea continuar? El estado solo cambiará si confirma esta acción.</p>}
            <p>
              <strong>{pending.items.length} recibos:</strong>{" "}
              {pending.items.map((i) => i.correlativo).join(", ")}
            </p>
            {pending.accion === "observar" && (
              <label className="pt-field">
                <span>Motivo de la observación *</span>
                <textarea
                  autoFocus
                  required
                  rows={4}
                  maxLength={500}
                  disabled={busy}
                  value={pending.observacion}
                  placeholder="Ingrese el motivo de la observación"
                  onChange={(e) => setPending({ ...pending, observacion: e.target.value })}
                />
                <small>El motivo se aplicará a los recibos seleccionados.</small>
              </label>
            )}
            <dl className="pt-detail-grid">
              {pending.idRetencion !== undefined && (
                <div>
                  <dt>Retención</dt>
                  <dd>
                    {
                      catalogos.retenciones.find(
                        (o) => o.id === pending.idRetencion,
                      )?.nombre
                    }
                  </dd>
                </div>
              )}
              {pending.aplicarGenerales && (
                <>
                  <div>
                    <dt>Comprobante / Tipo de pago</dt>
                    <dd>
                      {
                        catalogos.comprobantes.find(
                          (o) => o.id === pending.idComprobante,
                        )?.nombre
                      }{" "}
                      /{" "}
                      {
                        catalogos.tiposPago.find(
                          (o) => o.id === pending.idTipoPago,
                        )?.nombre
                      }
                    </dd>
                  </div>
                  <div>
                    <dt>RUC / Serie / Emisión</dt>
                    <dd>
                      {pending.ruc || "Vacío"} / {pending.serie || "Vacío"} /{" "}
                      {pending.fecEmision}
                    </dd>
                  </div>
                </>
              )}
              {pending.aplicarBanco && (
                <div>
                  <dt>Banco / Moneda / Transferencia / Depósito</dt>
                  <dd>
                    {
                      catalogos.bancos.find((o) => o.id === pending.idBanco)
                        ?.nombre
                    }{" "}
                    /{" "}
                    {
                      catalogos.monedas.find((o) => o.id === pending.idMoneda2)
                        ?.nombre
                    }{" "}
                    /{" "}
                    {
                      catalogos.transferencias.find(
                        (o) => o.id === pending.idTransferencia,
                      )?.nombre
                    }{" "}
                    / {pending.fechaDeposito}
                  </dd>
                </div>
              )}
              {(pending.aplicarBanco || pending.aplicarOperacion) && (
                <div>
                  <dt>Operación</dt>
                  <dd>{pending.nroOperacion || "Vacío"}</dd>
                </div>
              )}
              {pending.aplicarRendicion && (
                <div>
                  <dt>Rendición</dt>
                  <dd>
                    {
                      catalogos.rendiciones.find(
                        (o) => o.id === pending.idRendicion,
                      )?.nombre
                    }
                  </dd>
                </div>
              )}
              {pending.aplicarDetalle && (
                <div>
                  <dt>Detalle</dt>
                  <dd>{pending.detalle}</dd>
                </div>
              )}
              {pending.aplicarAdjunto && (
                <div>
                  <dt>Comprobante adjunto</dt>
                  <dd>{pending.imgFactura}</dd>
                </div>
              )}
              {pending.accion !== "observar" && <div>
                <dt>Observación</dt>
                <dd>{pending.observacion || "Sin observación"}</dd>
              </div>}
            </dl>
            <div className="pt-dialog-actions">
              <button disabled={busy} onClick={() => setPending(null)}>
                {pending.accion === "observar" ? "Cancelar" : "Volver"}
              </button>
              <button
                className="pt-primary"
                disabled={busy || (pending.accion === "observar" && !pending.observacion.trim())}
                onClick={() => void save()}
              >
                <CheckCircle2 size={16} />
                {busy ? "Guardando…" : pending.accion === "observar" ? "Aceptar" : "Confirmar actualización"}
              </button>
            </div>
          </>
        )}
      </dialog>
    </section>
  );
}
