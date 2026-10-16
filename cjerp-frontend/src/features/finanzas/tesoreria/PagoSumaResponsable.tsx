import React, { useEffect, useMemo, useState } from "react";
import { consultarPlanillaEstados } from "../../../api/planillaConsultaService";
import type { PlanillaConsultaEstadosRequest } from "../../../models/planillaConsulta";

/**
 * Pestaña "Suma responsable" del detalle de pagos_v2.
 * Replica SumaEmp ("SumaResp." de FrmAdmPago): subtotales de los recibos en estado
 * 4, 6 y 0 del mismo responsable, cliente, proyecto, site, tipo de trabajo y tarea,
 * convertidos a soles con el tipo de cambio de la pantalla.
 * El total por moneda viene del store principal (SumaEmp*Nativo); la lista de
 * recibos se consulta al abrir la pestaña.
 */

type TipoCambioPantalla = { usd: number; eur: number; dop: number; cop: number };

type FilaSumaResponsable = {
  responsable: string;
  cliente: string;
  proyecto: string;
  site: string;
  tipoTrabajo: string;
  tarea?: string;
  planillaRow?: Record<string, unknown>;
};

type Props = {
  fila: FilaSumaResponsable;
  tipoCambio: TipoCambioPantalla;
  request: PlanillaConsultaEstadosRequest | null;
  accent: string;
  soft: string;
  border: string;
};

type MonedaDef = { id: number; nombre: string; simbolo: string; campo: string; color: string };

const MONEDAS: MonedaDef[] = [
  { id: 1, nombre: "Soles", simbolo: "S/", campo: "SumaEmpSolesNativo", color: "#2563EB" },
  { id: 2, nombre: "Dólares", simbolo: "US$", campo: "SumaEmpUsdNativo", color: "#16A34A" },
  { id: 3, nombre: "Euros", simbolo: "€", campo: "SumaEmpEurNativo", color: "#9333EA" },
  { id: 4, nombre: "Peso dominicano", simbolo: "RD$", campo: "SumaEmpDopNativo", color: "#EA580C" },
  { id: 5, nombre: "Peso colombiano", simbolo: "COL$", campo: "SumaEmpCopNativo", color: "#0891B2" },
];

const ESTADOS_SUMA: Array<{ codigo: number; nombre: string; color: string }> = [
  { codigo: 4, nombre: "Pagado", color: "#16A34A" },
  { codigo: 6, nombre: "Estado 6", color: "#F59E0B" },
  { codigo: 0, nombre: "Estado 0", color: "#64748B" },
];

type Recibo = {
  correlativo: string;
  fecha: string;
  estado: number;
  estadoNombre: string;
  monedaId: number;
  moneda: string;
  subtotalNativo: number;
  detalle: string;
  ot: string;
};

function pick(row: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (key in row) return row[key];
  }
  const lower = new Map(Object.keys(row).map((k) => [k.toLowerCase(), k]));
  for (const key of keys) {
    const real = lower.get(key.toLowerCase());
    if (real) return row[real];
  }
  return undefined;
}

function num(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(String(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function str(value: unknown): string {
  return value === null || value === undefined ? "" : String(value).trim();
}

function money(value: number, simbolo = "S/") {
  return `${simbolo} ${value.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function tcDe(moneda: MonedaDef, tc: TipoCambioPantalla) {
  switch (moneda.id) {
    case 2: return tc.usd;
    case 3: return tc.eur;
    case 4: return tc.dop;
    case 5: return tc.cop;
    default: return 1;
  }
}

export default function PagoSumaResponsable({ fila, tipoCambio, request, accent, soft, border }: Props) {
  const base = fila.planillaRow ?? {};
  const idResponsable = num(pick(base, "IdResponsable", "idResponsable")) ?? 0;
  const idTarea = num(pick(base, "IdTarea", "idTarea")) ?? 0;

  const [recibos, setRecibos] = useState<Recibo[]>([]);
  // Totales por moneda (SumaEmp*) de la propia consulta de la pestaña: la bandeja principal
  // no los calcula para no penalizar su tiempo de carga.
  const [totalesStore, setTotalesStore] = useState<Record<string, unknown> | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");

  // La lista se consulta una vez por combinación (el cambio de tipo de cambio es local).
  const requestKey = request ? JSON.stringify(request.parametros ?? request) : "";
  useEffect(() => {
    if (!request) {
      setRecibos([]);
      setTotalesStore(null);
      return;
    }

    const controller = new AbortController();
    let cancelado = false;
    setCargando(true);
    setError("");

    consultarPlanillaEstados(request, { timeoutMs: 120000, signal: controller.signal })
      .then((response) => {
        if (cancelado) return;
        const rows = Array.isArray(response?.rows) ? (response.rows as Array<Record<string, unknown>>) : [];
        const lista: Recibo[] = [];
        let totales: Record<string, unknown> | null = null;
        for (const row of rows) {
          const estado = num(pick(row, "Estado", "estado"));
          const monedaId = num(pick(row, "TipoMoneda", "tipoMoneda")) ?? 0;
          if (estado === null || ![4, 6, 0].includes(estado) || monedaId < 1 || monedaId > 5) continue;
          if ((num(pick(row, "IdResponsable", "idResponsable")) ?? 0) !== idResponsable) continue;
          if ((num(pick(row, "IdTarea", "idTarea")) ?? 0) !== idTarea) continue;

          if (!totales && MONEDAS.some((m) => num(pick(row, m.campo)) !== null)) totales = row;

          // SubtotalOriginal viene del store (monto en la moneda del recibo).
          const nativo = num(pick(row, "SubtotalOriginal", "subtotalOriginal"));
          if (nativo === null) continue;

          lista.push({
            correlativo: str(pick(row, "Corre", "Correlativo", "correlativo")),
            fecha: str(pick(row, "FecIngreso", "fecIngreso")),
            estado,
            estadoNombre: str(pick(row, "EstadoNombre", "NombreEstado")) || String(estado),
            monedaId,
            moneda: str(pick(row, "Moneda", "moneda")),
            subtotalNativo: nativo,
            detalle: str(pick(row, "Detalle", "detalle")),
            ot: str(pick(row, "Ot", "OT", "ot")),
          });
        }
        lista.sort((a, b) => Number(b.correlativo) - Number(a.correlativo));
        setTotalesStore(totales);
        setRecibos(lista);
      })
      .catch(() => {
        if (!cancelado && !controller.signal.aborted) {
          setRecibos([]);
          setError("No se pudo cargar la lista de recibos.");
        }
      })
      .finally(() => {
        if (!cancelado && !controller.signal.aborted) setCargando(false);
      });

    return () => {
      cancelado = true;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey, idResponsable, idTarea]);

  const fuente = totalesStore ?? base;
  const columnasDelStore = MONEDAS.some((m) => num(pick(fuente, m.campo)) !== null);

  // Desglose por moneda: totales del store principal; si el store aún no trae las columnas, se usa la lista.
  const desglose = useMemo(() => {
    return MONEDAS.map((moneda) => {
      const delStore = num(pick(fuente, moneda.campo));
      const nativo = delStore !== null
        ? delStore
        : recibos.filter((r) => r.monedaId === moneda.id).reduce((acc, r) => acc + r.subtotalNativo, 0);
      const tc = tcDe(moneda, tipoCambio);
      return { ...moneda, nativo, tc, soles: nativo * tc };
    }).filter((item) => item.nativo !== 0);
  }, [fuente, recibos, tipoCambio]);

  const totalSoles = desglose.reduce((acc, item) => acc + item.soles, 0);
  const cantidadStore = num(pick(fuente, "CantRecibosEmp"));
  const cantidad = cantidadStore ?? recibos.length;

  const porEstado = useMemo(() => {
    return ESTADOS_SUMA.map((estado) => {
      const items = recibos.filter((r) => r.estado === estado.codigo);
      const soles = items.reduce((acc, r) => {
        const moneda = MONEDAS.find((m) => m.id === r.monedaId)!;
        return acc + r.subtotalNativo * tcDe(moneda, tipoCambio);
      }, 0);
      return { ...estado, cantidad: items.length, soles };
    });
  }, [recibos, tipoCambio]);

  const totalLista = porEstado.reduce((acc, item) => acc + item.soles, 0);
  const maxEstado = Math.max(...porEstado.map((item) => item.soles), 1);
  const diferencia = Math.abs(totalLista - totalSoles);

  // Donut por moneda (conic-gradient) — participación sobre el total en soles.
  const donut = useMemo(() => {
    if (totalSoles <= 0) return "conic-gradient(#E2E8F0 0 100%)";
    let acumulado = 0;
    const tramos = desglose.map((item) => {
      const inicio = acumulado;
      acumulado += (item.soles / totalSoles) * 100;
      return `${item.color} ${inicio.toFixed(2)}% ${acumulado.toFixed(2)}%`;
    });
    return `conic-gradient(${tramos.join(", ")})`;
  }, [desglose, totalSoles]);

  const card: React.CSSProperties = { border: `1px solid ${border}`, borderRadius: 12, background: "#FFFFFF", padding: 12 };
  const titulo: React.CSSProperties = { fontSize: 12, fontWeight: 800, color: "#334155", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 8 };
  const th: React.CSSProperties = { textAlign: "left", fontSize: 11, color: "#64748B", fontWeight: 800, padding: "6px 8px", borderBottom: "1px solid #E2E8F0", whiteSpace: "nowrap" };
  const td: React.CSSProperties = { fontSize: 12, color: "#0F172A", padding: "6px 8px", borderBottom: "1px solid #F1F5F9" };
  const tdNum: React.CSSProperties = { ...td, textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ ...card, background: soft }}>
        <div style={{ fontSize: 12, color: "#475569" }}>
          {fila.responsable || "Sin responsable"} · {fila.cliente} · {fila.proyecto} · {fila.site} · {fila.tipoTrabajo}
          {fila.tarea ? ` · ${fila.tarea}` : ""}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 18, marginTop: 8, alignItems: "baseline" }}>
          <div>
            <div style={{ fontSize: 11, color: "#64748B", fontWeight: 700 }}>SUMA RESPONSABLE (S/)</div>
            <div style={{ fontSize: 26, fontWeight: 900, color: accent }}>{money(totalSoles)}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "#64748B", fontWeight: 700 }}>RECIBOS</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: "#0F172A" }}>{cantidad}</div>
          </div>
          <div style={{ fontSize: 11, color: "#64748B" }}>
            Estados incluidos: 4 (pagado), 6 y 0 · TC: US$ {tipoCambio.usd} · € {tipoCambio.eur} · RD$ {tipoCambio.dop} · COL$ {tipoCambio.cop}
          </div>
        </div>
        {!columnasDelStore ? (
          <div style={{ marginTop: 8, fontSize: 12, color: "#B45309", fontWeight: 700 }}>
            El store aún no devuelve SumaEmp (ejecutar el script 05_sp_Planilla_Consulta_Estados_tipocambio.sql); se calcula con la lista de recibos.
          </div>
        ) : null}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 10 }}>
        <div style={card}>
          <div style={titulo}>Desglose por moneda</div>
          {desglose.length === 0 ? (
            <div style={{ fontSize: 12, color: "#64748B" }}>Sin montos para este responsable.</div>
          ) : (
            <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ position: "relative", width: 110, height: 110, borderRadius: "50%", background: donut, flex: "0 0 auto" }} aria-label="Participación por moneda">
                <div style={{ position: "absolute", inset: 24, borderRadius: "50%", background: "#FFFFFF", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 800, color: "#334155" }}>
                  {desglose.length} moneda{desglose.length === 1 ? "" : "s"}
                </div>
              </div>
              <table style={{ borderCollapse: "collapse", flex: "1 1 260px" }}>
                <thead>
                  <tr>
                    <th style={th}>Moneda</th>
                    <th style={{ ...th, textAlign: "right" }}>Monto</th>
                    <th style={{ ...th, textAlign: "right" }}>TC</th>
                    <th style={{ ...th, textAlign: "right" }}>En soles</th>
                    <th style={{ ...th, textAlign: "right" }}>%</th>
                  </tr>
                </thead>
                <tbody>
                  {desglose.map((item) => (
                    <tr key={item.id}>
                      <td style={td}>
                        <span style={{ display: "inline-block", width: 9, height: 9, borderRadius: 3, background: item.color, marginRight: 6 }} />
                        {item.nombre}
                      </td>
                      <td style={tdNum}>{money(item.nativo, item.simbolo)}</td>
                      <td style={tdNum}>{item.tc}</td>
                      <td style={tdNum}>{money(item.soles)}</td>
                      <td style={tdNum}>{totalSoles > 0 ? ((item.soles / totalSoles) * 100).toFixed(1) : "0.0"}%</td>
                    </tr>
                  ))}
                  <tr>
                    <td style={{ ...td, fontWeight: 800 }} colSpan={3}>Total</td>
                    <td style={{ ...tdNum, fontWeight: 800 }}>{money(totalSoles)}</td>
                    <td style={tdNum}>100%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div style={card}>
          <div style={titulo}>Por estado del recibo (en soles)</div>
          {cargando ? (
            <div style={{ fontSize: 12, color: "#64748B" }}>Cargando recibos...</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {porEstado.map((item) => (
                <div key={item.codigo}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#334155" }}>
                    <span>{item.nombre} · {item.cantidad} recibo{item.cantidad === 1 ? "" : "s"}</span>
                    <strong>{money(item.soles)}</strong>
                  </div>
                  <div style={{ height: 9, borderRadius: 6, background: "#E2E8F0", overflow: "hidden", marginTop: 3 }}>
                    <div style={{ width: `${(item.soles / maxEstado) * 100}%`, height: "100%", background: item.color }} />
                  </div>
                </div>
              ))}
              {recibos.length > 0 && diferencia > 0.05 ? (
                <div style={{ fontSize: 11, color: "#B45309" }}>
                  La lista suma {money(totalLista)} y el store {money(totalSoles)} (diferencia {money(diferencia)}). Revise si cambió el tipo de cambio sin actualizar montos.
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>

      <div style={card}>
        <div style={titulo}>Recibos que componen la suma ({recibos.length})</div>
        {error ? <div style={{ fontSize: 12, color: "#B91C1C" }}>{error}</div> : null}
        {cargando ? <div style={{ fontSize: 12, color: "#64748B" }}>Cargando recibos...</div> : null}
        {!cargando && !error && recibos.length === 0 ? (
          <div style={{ fontSize: 12, color: "#64748B" }}>
            {request ? "No hay recibos para este responsable y tarea (o el store aún no devuelve SubtotalOriginal)." : "Faltan datos de cliente, proyecto, site o tipo de trabajo para consultar."}
          </div>
        ) : null}
        {recibos.length > 0 ? (
          <div style={{ overflowX: "auto", maxHeight: 340, overflowY: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead>
                <tr>
                  <th style={th}>Recibo</th>
                  <th style={th}>Fecha</th>
                  <th style={th}>Estado</th>
                  <th style={th}>OT</th>
                  <th style={th}>Moneda</th>
                  <th style={{ ...th, textAlign: "right" }}>Subtotal</th>
                  <th style={{ ...th, textAlign: "right" }}>TC</th>
                  <th style={{ ...th, textAlign: "right" }}>En soles</th>
                  <th style={th}>Detalle</th>
                </tr>
              </thead>
              <tbody>
                {recibos.map((r) => {
                  const moneda = MONEDAS.find((m) => m.id === r.monedaId)!;
                  const tc = tcDe(moneda, tipoCambio);
                  return (
                    <tr key={`${r.correlativo}-${r.estado}`}>
                      <td style={td}>{r.correlativo}</td>
                      <td style={td}>{r.fecha}</td>
                      <td style={td}>{r.estadoNombre}</td>
                      <td style={td}>{r.ot || "—"}</td>
                      <td style={td}>{r.moneda || moneda.nombre}</td>
                      <td style={tdNum}>{money(r.subtotalNativo, moneda.simbolo)}</td>
                      <td style={tdNum}>{tc}</td>
                      <td style={tdNum}>{money(r.subtotalNativo * tc)}</td>
                      <td style={{ ...td, maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.detalle}>{r.detalle}</td>
                    </tr>
                  );
                })}
                <tr>
                  <td style={{ ...td, fontWeight: 800 }} colSpan={7}>Total en soles</td>
                  <td style={{ ...tdNum, fontWeight: 800 }}>{money(totalLista)}</td>
                  <td style={td} />
                </tr>
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </div>
  );
}
