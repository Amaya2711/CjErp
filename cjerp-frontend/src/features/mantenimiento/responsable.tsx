import { useEffect, useMemo, useState } from "react";
import { Edit3, Minus, Plus } from "lucide-react";
import AppCard from "../../components/base/AppCard";
import AppPage from "../../components/base/AppPage";
import AppStatusMessage from "../../components/base/AppStatusMessage";
import {
  actualizarEmpleadoResponsable,
  buscarEmpleadosResponsables,
  insertarEmpleadoResponsable,
  type EmpleadoResponsableActualizarRequest,
  type EmpleadoResponsableBusqueda,
} from "../../api/empleadoResponsableService";
import { useConstantesPorCampo } from "../../hooks/useConstantesPorCampo";
import { getHttpErrorMessage } from "../../utils/httpError";

type ResponsableForm = {
  nombre: string;
  cuenta: string;
  cuentaInter: string;
  tipoCuenta: string;
  banco: string;
  nroDocumento: string;
};

type CuentaOriginal = { idBanco: number; cuenta: string; nombreCta: string };

const FORM_INITIAL: ResponsableForm = {
  nombre: "", cuenta: "", cuentaInter: "", tipoCuenta: "", banco: "", nroDocumento: "",
};

function normalizar(value: string | null | undefined) {
  return String(value ?? "").trim().toLocaleUpperCase();
}

function normalizarBusqueda(value: string | number | null | undefined) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleUpperCase();
}

function obtenerTipoCuenta(item: EmpleadoResponsableBusqueda) {
  return item.nombreCta?.trim() || item.tipoCuenta?.trim() || "";
}

function filtrarResultados(items: EmpleadoResponsableBusqueda[], busqueda: string) {
  const criterio = normalizarBusqueda(busqueda);
  if (!criterio) return items;

  return items.filter((item) => [
    item.nombreEmpleado || item.nombre,
    item.nroDocumento,
    item.nombreBanco,
    obtenerTipoCuenta(item),
    item.cuenta,
  ].some((value) => normalizarBusqueda(value).includes(criterio)));
}

export default function MantenimientoResponsablePage() {
  const [busqueda, setBusqueda] = useState("");
  const [todosLosResponsables, setTodosLosResponsables] = useState<EmpleadoResponsableBusqueda[]>([]);
  const [resultados, setResultados] = useState<EmpleadoResponsableBusqueda[]>([]);
  const [form, setForm] = useState<ResponsableForm>(FORM_INITIAL);
  const [original, setOriginal] = useState<CuentaOriginal | null>(null);
  const [idEmpleado, setIdEmpleado] = useState<number | null>(null);
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { constantesPorCampo, loading: cargandoConstantes, error: errorConstantes } = useConstantesPorCampo(["tipo_cta", "banco"]);
  const tiposCuenta = constantesPorCampo.tipo_cta ?? [];
  const bancos = constantesPorCampo.banco ?? [];

  const esEdicion = idEmpleado !== null && original !== null;
  const nombreTipoCuenta = useMemo(
    () => tiposCuenta.find((item) => item.value === form.tipoCuenta)?.label ?? form.tipoCuenta,
    [form.tipoCuenta, tiposCuenta],
  );
  const nombreBanco = useMemo(
    () => bancos.find((item) => item.value === form.banco)?.label ?? form.banco,
    [bancos, form.banco],
  );

  const buscar = async () => {
    setCargando(true); setError(null); setMensaje(null);
    try {
      // La consulta base mantiene los cÃ³digos de cada cuenta; el filtro rÃ¡pido
      // se aplica sobre las cinco columnas permitidas sin exponer esos cÃ³digos.
      const data = await buscarEmpleadosResponsables("");
      setTodosLosResponsables(data);
      setResultados(filtrarResultados(data, busqueda));
    } catch (cause) {
      setTodosLosResponsables([]);
      setResultados([]);
      setError(getHttpErrorMessage(cause, "No se pudo buscar responsables."));
    } finally { setCargando(false); }
  };

  useEffect(() => {
    void buscar();
    // La carga inicial debe realizarse una sola vez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setResultados(filtrarResultados(todosLosResponsables, busqueda));
  }, [busqueda, todosLosResponsables]);

  const nuevo = () => {
    setForm(FORM_INITIAL); setOriginal(null); setIdEmpleado(null); setMensaje(null); setError(null);
    setMostrarFormulario(true);
  };

  const alternarFormularioNuevo = () => {
    if (mostrarFormulario) {
      cancelarFormulario();
      return;
    }
    nuevo();
  };

  const cancelarFormulario = () => {
    setForm(FORM_INITIAL); setOriginal(null); setIdEmpleado(null); setError(null);
    setMostrarFormulario(false);
  };

  const editar = (item: EmpleadoResponsableBusqueda) => {
    const id = Number(item.idEmpleado);
    const idBanco = Number(item.idBanco);
    const tipoCuenta = obtenerTipoCuenta(item);
    const tipo = tiposCuenta.find((option) => normalizar(option.label) === normalizar(tipoCuenta));
    const banco = bancos.find((option) => String(option.value) === String(idBanco))
      ?? bancos.find((option) => normalizar(option.label) === normalizar(item.nombreBanco));
    if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(idBanco) || idBanco <= 0 || !item.cuenta?.trim() || !tipoCuenta) {
      setError("La búsqueda no devolvió los datos bancarios requeridos para editar esta cuenta.");
      return;
    }
    setIdEmpleado(id);
    setMostrarFormulario(true);
    setOriginal({ idBanco, cuenta: item.cuenta.trim(), nombreCta: tipoCuenta });
    setForm({
      nombre: item.nombreEmpleado || item.nombre || "",
      cuenta: item.cuenta || "",
      cuentaInter: item.cuentaInter || "",
      tipoCuenta: tipo?.value ?? tipoCuenta,
      banco: banco?.value ?? String(item.idBanco ?? ""),
      nroDocumento: item.nroDocumento || "",
    });
    setMensaje(null); setError(null);
  };

  const guardar = async (event: React.FormEvent) => {
    event.preventDefault();
    const payload = {
      nombre: form.nombre.trim(), cuenta: form.cuenta.trim(), cuentaInter: form.cuentaInter.trim(),
      tipoCuenta: form.tipoCuenta.trim(), nombreCta: nombreTipoCuenta.trim(), banco: nombreBanco.trim(),
      idBanco: form.banco.trim(), nroDocumento: form.nroDocumento.trim(),
    };
    if (Object.values(payload).some((value) => !value)) { setError("Complete todos los campos del responsable."); return; }
    setGuardando(true); setError(null); setMensaje(null);
    try {
      if (esEdicion && idEmpleado && original) {
        const request: EmpleadoResponsableActualizarRequest = { ...payload, idBancoActual: original.idBanco, cuentaActual: original.cuenta, nombreCtaActual: original.nombreCta };
        await actualizarEmpleadoResponsable(idEmpleado, request);
      } else {
        await insertarEmpleadoResponsable(payload);
      }
      await buscar();
      cancelarFormulario();
      setMensaje(esEdicion ? "Responsable actualizado correctamente." : "Responsable registrado correctamente.");
    } catch (cause) { setError(getHttpErrorMessage(cause, "No se pudo guardar el responsable.")); }
    finally { setGuardando(false); }
  };

  const fieldStyle = { width: "100%", height: 40, border: "1px solid #CBD5E1", borderRadius: 8, padding: "0 10px", boxSizing: "border-box" as const };
  return <AppPage title="Mantenimiento de responsables" actions={<button type="button" onClick={alternarFormularioNuevo} style={{ border: "none", borderRadius: 8, padding: "10px 14px", background: "#2563EB", color: "#fff", fontWeight: 700 }}>{mostrarFormulario ? <Minus size={16} style={{ verticalAlign: "middle", marginRight: 5 }} /> : <Plus size={16} style={{ verticalAlign: "middle", marginRight: 5 }} />}{mostrarFormulario ? "Ocultar formulario" : "Nuevo responsable"}</button>}>
    <AppCard title="Buscar responsables">
      <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Responsable, documento, banco, tipo de cuenta o cuenta" style={fieldStyle} />
    </AppCard>
    {error && <AppStatusMessage tone="error" style={{ marginBottom: 16 }}>{error}</AppStatusMessage>}
    {mensaje && <AppStatusMessage tone="success" style={{ marginBottom: 16 }}>{mensaje}</AppStatusMessage>}
    {errorConstantes && <AppStatusMessage tone="error" style={{ marginBottom: 16 }}>{errorConstantes}</AppStatusMessage>}
    {mostrarFormulario && <AppCard title={esEdicion ? "Editar responsable" : "Nuevo responsable"}>
      <form onSubmit={(event) => void guardar(event)} style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 14 }}>
        {([ ["Nombre", "nombre"], ["Cuenta", "cuenta"], ["Cta. interbancaria", "cuentaInter"], ["Nro. documento", "nroDocumento"] ] as const).map(([label, key]) => <label key={key} style={{ display: "grid", gap: 5, fontSize: 12, fontWeight: 700, color: "#334155" }}>{label}<input required value={form[key]} onChange={(e) => setForm((current) => ({ ...current, [key]: e.target.value }))} style={fieldStyle} /></label>)}
        <label style={{ display: "grid", gap: 5, fontSize: 12, fontWeight: 700, color: "#334155" }}>Tipo de cuenta<select required value={form.tipoCuenta} onChange={(e) => setForm((current) => ({ ...current, tipoCuenta: e.target.value }))} disabled={cargandoConstantes} style={fieldStyle}><option value="">Seleccione</option>{tiposCuenta.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        <label style={{ display: "grid", gap: 5, fontSize: 12, fontWeight: 700, color: "#334155" }}>Banco<select required value={form.banco} onChange={(e) => setForm((current) => ({ ...current, banco: e.target.value }))} disabled={cargandoConstantes} style={fieldStyle}><option value="">Seleccione</option>{bancos.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end", gap: 8 }}><button type="button" onClick={cancelarFormulario} disabled={guardando} style={{ border: "1px solid #CBD5E1", borderRadius: 8, padding: "10px 14px", background: "#fff", fontWeight: 700 }}>Cancelar</button><button type="submit" disabled={guardando || cargandoConstantes} style={{ border: "none", borderRadius: 8, padding: "10px 14px", background: "#2563EB", color: "#fff", fontWeight: 700 }}>{guardando ? "Guardando..." : esEdicion ? "Actualizar" : "Grabar"}</button></div>
      </form>
    </AppCard>
    }
          <AppCard title={`Resultados (${resultados.length})`}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, lineHeight: 1.2 }}>
                <thead>
                  <tr>
                    {["Responsable", "Documento", "Banco", "Tipo de cuenta", "Cuenta", "Acción"].map((title) => (
                      <th key={title} style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid #E2E8F0", color: "#475569" }}>
                        {title}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {resultados.map((item, index) => (
                    <tr key={`${item.idEmpleado}-${item.idBanco}-${item.cuenta}-${index}`}>
                      <td style={{ padding: "5px 8px", borderBottom: "1px solid #F1F5F9" }}>{item.nombreEmpleado || item.nombre || "-"}</td>
                      <td style={{ padding: "5px 8px", borderBottom: "1px solid #F1F5F9" }}>{item.nroDocumento || "-"}</td>
                      <td style={{ padding: "5px 8px", borderBottom: "1px solid #F1F5F9" }}>{item.nombreBanco || "-"}</td>
                      <td style={{ padding: "5px 8px", borderBottom: "1px solid #F1F5F9" }}>{obtenerTipoCuenta(item) || "-"}</td>
                      <td style={{ padding: "5px 8px", borderBottom: "1px solid #F1F5F9" }}>{item.cuenta || "-"}</td>
                      <td style={{ padding: "5px 8px", borderBottom: "1px solid #F1F5F9" }}>
                        <button
                          type="button"
                          title="Editar responsable"
                          aria-label="Editar responsable"
                          onClick={() => editar(item)}
                          style={{ border: "1px solid #BFDBFE", borderRadius: 7, width: 30, height: 30, padding: 0, color: "#1D4ED8", background: "#EFF6FF", display: "inline-flex", alignItems: "center", justifyContent: "center" }}
                        >
                          <Edit3 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {resultados.length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ padding: 18, color: "#64748B", textAlign: "center" }}>
                        {cargando ? "Cargando responsables..." : "No hay responsables registrados."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </AppCard>
  </AppPage>;
}
