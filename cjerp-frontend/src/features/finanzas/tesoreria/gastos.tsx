import React, { useRef, useState, useEffect } from "react";
import { useCrudForm } from "../../../hooks/useCrudForm";
import httpClient from "../../../api/httpClient";
import { FiltroOperativoLookup } from "../../../components/lookups/FiltroOperativoLookup";
import { listarEmpleadosCta } from "../../../api/empleadoService";
import type { FiltroOperativoValue } from "../../../models/filtroOperativo";
import type { EmpleadoCta } from "../../../models/empleadoCta";

type GastoDto = {
  id: number;
  filtroOperativoKey: string;
  responsable: string;
  cuenta: string;
  tipoPago: string;
  monto: number;
  detalle: string;
  comentario: string;
  fechaVencimiento?: string;
  fechaEmision?: string;
  solicitante?: string;
  gestor?: string;
  validador?: string;
  moneda?: string;
  bien?: string;
  comprobante?: string;
  serie?: string;
};

type GastoForm = {
  id: number | null;
  filtroOperativo: FiltroOperativoValue;
  responsable: string;
  cuenta: string;
  tipoPago: string;
  monto: string;
  detalle: string;
  comentario: string;
  fechaVencimiento: string;
  fechaEmision: string;
  solicitante: string;
  gestor: string;
  validador: string;
  moneda: string;
  bien: string;
  comprobante: string;
  serie: string;
};

type GastoPayload = {
  filtroOperativoKey: string;
  responsable: string;
  cuenta: string;
  tipoPago: string;
  monto: number;
  detalle: string;
  comentario: string;
  fechaVencimiento?: string;
  fechaEmision?: string;
  solicitante?: string;
  gestor?: string;
  validador?: string;
  moneda?: string;
  bien?: string;
  comprobante?: string;
  serie?: string;
};

const GASTOS_API_URL = "/tesoreria/gastos";

function extraerArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value : [];
}

function extraerObjeto<T>(value: T): T {
  return value;
}

function mapGastoDtoToView(item: GastoDto): GastoForm {
  return {
    id: item.id,
    filtroOperativo: { filtro: { filtroKey: item.filtroOperativoKey } } as FiltroOperativoValue,
    responsable: item.responsable,
    cuenta: item.cuenta,
    tipoPago: item.tipoPago,
    monto: item.monto?.toString() ?? "",
    detalle: item.detalle,
    comentario: item.comentario,
    fechaVencimiento: item.fechaVencimiento || "",
    fechaEmision: item.fechaEmision || "",
    solicitante: item.solicitante || "",
    gestor: item.gestor || "",
    validador: item.validador || "",
    moneda: item.moneda || "",
    bien: item.bien || "",
    comprobante: item.comprobante || "",
    serie: item.serie || "",
  };
}

const gastosApi = {
  list: async () => {
    const response = await httpClient.get<GastoDto[]>(GASTOS_API_URL);
    const data = extraerArray<GastoDto>(response);
    return data.map(mapGastoDtoToView);
  },

  create: async (form: GastoForm) => {
    const payload: GastoPayload = {
      filtroOperativoKey: form.filtroOperativo.filtro?.filtroKey || "",
      responsable: form.responsable,
      cuenta: form.cuenta,
      tipoPago: form.tipoPago,
      monto: Number(form.monto),
      detalle: form.detalle,
      comentario: form.comentario,
      fechaVencimiento: form.fechaVencimiento || undefined,
      fechaEmision: form.fechaEmision || undefined,
      solicitante: form.solicitante || undefined,
      gestor: form.gestor || undefined,
      validador: form.validador || undefined,
      moneda: form.moneda || undefined,
      bien: form.bien || undefined,
      comprobante: form.comprobante || undefined,
      serie: form.serie || undefined,
    };

    const response = await httpClient.post<GastoDto>(GASTOS_API_URL, payload);
    const data = extraerObjeto<GastoDto>(response);
    return mapGastoDtoToView(data);
  },

  update: async (id: number, form: GastoForm) => {
    const payload: GastoPayload = {
      filtroOperativoKey: form.filtroOperativo.filtro?.filtroKey || "",
      responsable: form.responsable,
      cuenta: form.cuenta,
      tipoPago: form.tipoPago,
      monto: Number(form.monto),
      detalle: form.detalle,
      comentario: form.comentario,
      fechaVencimiento: form.fechaVencimiento || undefined,
      fechaEmision: form.fechaEmision || undefined,
      solicitante: form.solicitante || undefined,
      gestor: form.gestor || undefined,
      validador: form.validador || undefined,
      moneda: form.moneda || undefined,
      bien: form.bien || undefined,
      comprobante: form.comprobante || undefined,
      serie: form.serie || undefined,
    };

    const response = await httpClient.put<GastoDto>(`${GASTOS_API_URL}/${id}`, payload);
    const data = extraerObjeto<GastoDto>(response);
    return mapGastoDtoToView(data);
  },

  remove: async (id: number) => {
    await httpClient.delete(`${GASTOS_API_URL}/${id}`);
  },
};

const formularioInicial: GastoForm = {
  id: null,
  filtroOperativo: {},
  responsable: "",
  cuenta: "",
  tipoPago: "",
  monto: "",
  detalle: "",
  comentario: "",
  fechaVencimiento: "",
  fechaEmision: "",
  solicitante: "",
  gestor: "",
  validador: "",
  moneda: "",
  bien: "",
  comprobante: "",
  serie: "",
};

export default function GastosPage() {
  const sidePanelRef = useRef<HTMLDivElement | null>(null);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [empleados, setEmpleados] = useState<EmpleadoCta[]>([]);
  const [empleadosLoading, setEmpleadosLoading] = useState(false);
  const [empleadosError, setEmpleadosError] = useState<string | null>(null);
  const [responsableInput, setResponsableInput] = useState("");
  const [showResponsableDropdown, setShowResponsableDropdown] = useState(false);
  const [highlightedResponsableIdx, setHighlightedResponsableIdx] = useState(-1);

  const {
    items: gastos,
    form,
    setForm,
    loading: cargando,
    saving: guardando,
    error: mensaje,
    panelOpen: panelAbierto,
    setPanelOpen: setPanelAbierto,
    mode: modo,
    setMode: setModo,
    idToDelete: idEliminar,
    setIdToDelete: setIdEliminar,
    handleSave,
    handleDelete,
    load: cargarGastos,
  } = useCrudForm<GastoForm, GastoForm>(gastosApi, formularioInicial);

  useEffect(() => {
    setEmpleadosLoading(true);
    setEmpleadosError(null);

    listarEmpleadosCta()
      .then((data) => {
        setEmpleados(Array.isArray(data) ? data : []);
      })
      .catch(() => setEmpleadosError("Error al cargar responsables"))
      .finally(() => setEmpleadosLoading(false));
  }, []);

  const empleadosSafe = Array.isArray(empleados) ? empleados : [];
  const gastosSafe = Array.isArray(gastos) ? gastos : [];

  const filteredResponsables =
    responsableInput.trim() === ""
      ? empleadosSafe
      : empleadosSafe.filter((emp) =>
          emp.nombreEmpleado.toLowerCase().includes(responsableInput.toLowerCase())
        );

  const abrirNuevo = () => {
    setModo("nuevo");
    setForm(formularioInicial);
    setResponsableInput("");
    setHighlightedResponsableIdx(-1);
    setShowResponsableDropdown(false);
    setErrores({});
    setPanelAbierto(true);
  };

  const abrirEditar = (gasto: GastoForm) => {
    setModo("editar");
    setForm(gasto);
    const responsableNombre =
      empleadosSafe.find((emp) => String(emp.idEmpleado) === gasto.responsable)?.nombreEmpleado || "";
    setResponsableInput(responsableNombre);
    setHighlightedResponsableIdx(-1);
    setShowResponsableDropdown(false);
    setErrores({});
    setPanelAbierto(true);
  };

  const cerrarPanel = () => {
    setPanelAbierto(false);
    setForm(formularioInicial);
    setResponsableInput("");
    setHighlightedResponsableIdx(-1);
    setShowResponsableDropdown(false);
    setErrores({});
  };

  const validar = () => {
    const nuevosErrores: Record<string, string> = {};

    if (!form.filtroOperativo.filtro?.filtroKey) {
      nuevosErrores.filtroOperativo = "Seleccione un filtro operativo.";
    }

    if (!form.responsable) {
      nuevosErrores.responsable = "Seleccione un responsable.";
    }

    if (!form.tipoPago) {
      nuevosErrores.tipoPago = "Seleccione el tipo de pago.";
    }

    if (!form.monto || isNaN(Number(form.monto))) {
      nuevosErrores.monto = "Ingrese un monto válido.";
    }

    setErrores(nuevosErrores);
    return Object.keys(nuevosErrores).length === 0;
  };

  const guardar = async () => {
    if (!validar()) return;

    await handleSave();
    setPanelAbierto(false);
    setForm(formularioInicial);
    setResponsableInput("");
    await cargarGastos();
  };

  const confirmarEliminar = (id: number) => {
    setIdEliminar(id);
  };

  const eliminar = async () => {
    if (idEliminar == null) return;
    await handleDelete(idEliminar);
    setIdEliminar(null);
  };

  const gastoSeleccionadoEliminar = gastosSafe.find((x) => x.id === idEliminar);

  return (
    <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 20 }}>
      <div
        style={{
          background: "#FFFFFF",
          borderRadius: 16,
          padding: 16,
          boxShadow: "0 8px 24px rgba(23,20,58,0.06)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <button
          style={{
            border: "none",
            background: "#6E4CCB",
            color: "#FFFFFF",
            padding: "10px 16px",
            borderRadius: 10,
            fontWeight: 700,
            cursor: "pointer",
          }}
          onClick={abrirNuevo}
        >
          Nuevo gasto
        </button>
      </div>

      {mensaje && (
        <div
          style={{
            background: "#FEF2F2",
            border: "1px solid #FECACA",
            color: "#991B1B",
            padding: 14,
            borderRadius: 12,
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          {mensaje}
        </div>
      )}

      <div
        style={{
          background: "#FFFFFF",
          borderRadius: 16,
          padding: 20,
          boxShadow: "0 8px 24px rgba(23,20,58,0.08)",
        }}
      >
        <div style={{ width: "100%", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "14px 12px", fontSize: 13, color: "#374151", borderBottom: "1px solid #E5E7EB", background: "#F9FAFB" }}>
                  Id
                </th>
                <th style={{ textAlign: "left", padding: "14px 12px", fontSize: 13, color: "#374151", borderBottom: "1px solid #E5E7EB", background: "#F9FAFB" }}>
                  Responsable
                </th>
                <th style={{ textAlign: "left", padding: "14px 12px", fontSize: 13, color: "#374151", borderBottom: "1px solid #E5E7EB", background: "#F9FAFB" }}>
                  Monto
                </th>
                <th style={{ textAlign: "left", padding: "14px 12px", fontSize: 13, color: "#374151", borderBottom: "1px solid #E5E7EB", background: "#F9FAFB" }}>
                  Tipo Pago
                </th>
                <th style={{ textAlign: "left", padding: "14px 12px", fontSize: 13, color: "#374151", borderBottom: "1px solid #E5E7EB", background: "#F9FAFB" }}>
                  Detalle
                </th>
                <th style={{ textAlign: "center", padding: "14px 12px", fontSize: 13, color: "#374151", borderBottom: "1px solid #E5E7EB", background: "#F9FAFB" }}>
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody>
              {cargando ? (
                <tr>
                  <td colSpan={6} style={{ padding: 24, textAlign: "center", color: "#6B7280", fontSize: 14 }}>
                    Cargando gastos...
                  </td>
                </tr>
              ) : gastosSafe.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: 24, textAlign: "center", color: "#6B7280", fontSize: 14 }}>
                    No se encontraron gastos.
                  </td>
                </tr>
              ) : (
                gastosSafe.map((gasto) => (
                  <tr key={gasto.id}>
                    <td style={{ padding: "14px 12px", borderBottom: "1px solid #F3F4F6", color: "#374151", fontSize: 14 }}>
                      {gasto.id}
                    </td>
                    <td style={{ padding: "14px 12px", borderBottom: "1px solid #F3F4F6", color: "#17143A", fontSize: 14, fontWeight: 700 }}>
                      {gasto.responsable}
                    </td>
                    <td style={{ padding: "14px 12px", borderBottom: "1px solid #F3F4F6", color: "#374151", fontSize: 14 }}>
                      {gasto.monto}
                    </td>
                    <td style={{ padding: "14px 12px", borderBottom: "1px solid #F3F4F6", color: "#374151", fontSize: 14 }}>
                      {gasto.tipoPago}
                    </td>
                    <td style={{ padding: "14px 12px", borderBottom: "1px solid #F3F4F6", color: "#374151", fontSize: 14 }}>
                      {gasto.detalle}
                    </td>
                    <td style={{ padding: "14px 12px", borderBottom: "1px solid #F3F4F6", textAlign: "center" }}>
                      <div style={{ display: "flex", justifyContent: "center", gap: 8 }}>
                        <button
                          style={{
                            border: "1px solid #C7D2FE",
                            background: "#EEF2FF",
                            color: "#3730A3",
                            padding: "8px 12px",
                            borderRadius: 8,
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                          onClick={() => abrirEditar(gasto)}
                        >
                          Editar
                        </button>
                        <button
                          style={{
                            border: "1px solid #FECACA",
                            background: "#FEF2F2",
                            color: "#B91C1C",
                            padding: "8px 12px",
                            borderRadius: 8,
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                          onClick={() => confirmarEliminar(gasto.id!)}
                        >
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {panelAbierto && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.35)",
            display: "flex",
            justifyContent: "flex-end",
            zIndex: 3000,
          }}
        >
          <div
            style={{
              width: 520,
              maxWidth: "100%",
              height: "100%",
              background: "#FFFFFF",
              boxShadow: "-8px 0 24px rgba(0,0,0,0.12)",
              padding: 24,
              boxSizing: "border-box",
              overflowY: "auto",
            }}
            ref={sidePanelRef}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 24 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 24, color: "#17143A" }}>
                  {modo === "nuevo" ? "Nuevo gasto" : "Editar gasto"}
                </h2>
                <p style={{ marginTop: 8, marginBottom: 0, color: "#6B7280", fontSize: 14 }}>
                  Complete la información del gasto.
                </p>
              </div>
              <button
                style={{
                  border: "none",
                  background: "#F3F4F6",
                  color: "#17143A",
                  width: 34,
                  height: 34,
                  borderRadius: 8,
                  cursor: "pointer",
                  fontSize: 22,
                  lineHeight: "22px",
                }}
                onClick={cerrarPanel}
              >
                ×
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <FiltroOperativoLookup
                value={form.filtroOperativo}
                onChange={(val) => setForm((prev) => ({ ...prev, filtroOperativo: val }))}
              />
              {errores.filtroOperativo && (
                <div style={{ fontSize: 12, color: "#DC2626", fontWeight: 600 }}>
                  {errores.filtroOperativo}
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ fontSize: 14, fontWeight: 700, color: "#374151" }}>Responsable</label>
                <div style={{ position: "relative", width: "100%" }}>
                  <input
                    type="text"
                    value={
                      empleadosSafe.find((emp) => String(emp.idEmpleado) === form.responsable)?.nombreEmpleado ||
                      responsableInput ||
                      ""
                    }
                    onChange={(e) => {
                      setResponsableInput(e.target.value);
                      setShowResponsableDropdown(true);
                      setForm((prev) => ({ ...prev, responsable: "" }));
                    }}
                    onFocus={() => {
                      if (filteredResponsables.length > 0) setShowResponsableDropdown(true);
                    }}
                    onKeyDown={(e) => {
                      if (filteredResponsables.length === 0) return;

                      if (e.key === "ArrowDown") {
                        e.preventDefault();
                        setHighlightedResponsableIdx((idx) =>
                          Math.min(idx + 1, filteredResponsables.length - 1)
                        );
                        setShowResponsableDropdown(true);
                      } else if (e.key === "ArrowUp") {
                        e.preventDefault();
                        setHighlightedResponsableIdx((idx) => Math.max(idx - 1, 0));
                        setShowResponsableDropdown(true);
                      } else if (e.key === "Enter") {
                        if (
                          highlightedResponsableIdx >= 0 &&
                          highlightedResponsableIdx < filteredResponsables.length
                        ) {
                          const emp = filteredResponsables[highlightedResponsableIdx];
                          setForm((prev) => ({
                            ...prev,
                            responsable: String(emp.idEmpleado),
                            cuenta: `Banco: ${emp.nombreBanco || ""}, Tipo Cta: ${emp.nombreCta || ""}, Cta. ${emp.cuenta || ""}, CI: ${emp.cuentaInter || ""}, Nro Doc: ${emp.nroDocumento || ""}`,
                          }));
                          setResponsableInput(emp.nombreEmpleado);
                          setShowResponsableDropdown(false);
                          setHighlightedResponsableIdx(-1);
                        }
                      }
                    }}
                    placeholder="Seleccione..."
                    autoComplete="off"
                    required
                    style={{ fontFamily: "Arial, sans-serif", fontSize: "13px", width: "100%" }}
                    disabled={empleadosLoading}
                  />

                  {showResponsableDropdown && filteredResponsables.length > 0 && (
                    <div
                      style={{
                        position: "absolute",
                        top: "100%",
                        left: 0,
                        right: 0,
                        background: "#fff",
                        border: "1px solid #ccc",
                        zIndex: 1002,
                        maxHeight: 180,
                        overflowY: "auto",
                      }}
                    >
                      {filteredResponsables.map((emp, idx) => (
                        <div
                          key={emp.idEmpleado}
                          style={{
                            padding: 6,
                            cursor: "pointer",
                            background: idx === highlightedResponsableIdx ? "#e6f7ff" : undefined,
                          }}
                          onMouseDown={() => {
                            setForm((prev) => ({
                              ...prev,
                              responsable: String(emp.idEmpleado),
                              cuenta: `Banco: ${emp.nombreBanco || ""}, Tipo Cta: ${emp.nombreCta || ""}, Cta. ${emp.cuenta || ""}, CI: ${emp.cuentaInter || ""}, Nro Doc: ${emp.nroDocumento || ""}`,
                            }));
                            setResponsableInput(emp.nombreEmpleado);
                            setShowResponsableDropdown(false);
                            setHighlightedResponsableIdx(-1);
                          }}
                        >
                          {emp.nombreEmpleado}
                        </div>
                      ))}
                    </div>
                  )}

                  {empleadosLoading && <span style={{ fontSize: 12, color: "#888" }}>Cargando...</span>}
                  {empleadosError && <span style={{ fontSize: 12, color: "red" }}>{empleadosError}</span>}
                </div>

                {errores.responsable && (
                  <div style={{ fontSize: 12, color: "#DC2626", fontWeight: 600 }}>
                    {errores.responsable}
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 28 }}>
              <button
                style={{
                  border: "1px solid #D1D5DB",
                  background: "#FFFFFF",
                  color: "#17143A",
                  padding: "10px 16px",
                  borderRadius: 10,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
                onClick={cerrarPanel}
              >
                Cancelar
              </button>
              <button
                style={{
                  border: "none",
                  background: "#6E4CCB",
                  color: "#FFFFFF",
                  padding: "10px 16px",
                  borderRadius: 10,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
                onClick={guardar}
                disabled={guardando}
              >
                {guardando ? "Guardando..." : modo === "nuevo" ? "Guardar" : "Actualizar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {idEliminar !== null && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 3100,
          }}
        >
          <div
            style={{
              width: 420,
              maxWidth: "calc(100% - 24px)",
              background: "#FFFFFF",
              borderRadius: 16,
              padding: 24,
              boxShadow: "0 12px 28px rgba(0,0,0,0.16)",
            }}
          >
            <h3 style={{ marginTop: 0, marginBottom: 12, color: "#17143A" }}>
              Confirmar eliminación
            </h3>
            <p style={{ marginTop: 0, color: "#4B5563", lineHeight: 1.6 }}>
              ¿Desea eliminar el gasto <strong>{gastoSeleccionadoEliminar?.responsable}</strong>?
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 24 }}>
              <button
                style={{
                  border: "1px solid #D1D5DB",
                  background: "#FFFFFF",
                  color: "#17143A",
                  padding: "10px 16px",
                  borderRadius: 10,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
                onClick={() => setIdEliminar(null)}
              >
                Cancelar
              </button>
              <button
                style={{
                  border: "none",
                  background: "#DC2626",
                  color: "#FFFFFF",
                  padding: "10px 16px",
                  borderRadius: 10,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
                onClick={eliminar}
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
