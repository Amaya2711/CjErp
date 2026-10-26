import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import DataGridPro from "../../../components/datagrid/DataGridPro";
import type { GridColumn, GridFormat } from "../../../components/datagrid/types";
import {
  consultarPeriodoVentasSunat,
  type VentasSunatPeriodoDto,
  type VentasSunatRegistroDto,
} from "../../../api/ventasSunatService";
import { getHttpErrorMessage } from "../../../utils/httpError";

type Props = {
  /** Periodos cargados en la BD (se resume el RUC emisor del periodo seleccionado). */
  periodos: VentasSunatPeriodoDto[];
  /** Clave "periodo|ruc" seleccionada en el historial. */
  periodoSel: string;
  /** Registros ya cargados del periodo seleccionado (evita consultarlo de nuevo). */
  registrosActuales: VentasSunatRegistroDto[];
};

type FilaResumen = {
  clave: string;
  nombre: string;
  afecto: number;
  inafecto: number;
  igv: number;
  total: number;
};

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Setiembre", "Octubre", "Noviembre", "Diciembre"];
const SIN_EMPRESA = "Sin empresa";
const MONTO: GridFormat = { type: "fixedPoint", precision: 2 };

const numero = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const empresaDe = (r: VentasSunatRegistroDto) => (r.empresa ?? "").trim() || SIN_EMPRESA;
const clienteDe = (r: VentasSunatRegistroDto) => (r.nombreCliente || r.razonSocial || "Sin cliente").trim();
const nombrePeriodo = (p: string) => (p.length === 6 ? `${MESES[Number(p.slice(4)) - 1] ?? p.slice(4)} ${p.slice(0, 4)}` : p);

const styles: Record<string, CSSProperties> = {
  campo: { display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "#475569", fontWeight: 600 },
  select: { height: 34, padding: "0 8px", border: "1px solid #CBD5E1", borderRadius: 6, fontSize: 13, minWidth: 190, background: "#fff" },
  chip: { padding: "5px 12px", borderRadius: 6, border: "1px solid #CBD5E1", background: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", color: "#334155" },
  chipOn: { background: "#BAE6FD", borderColor: "#38BDF8", color: "#0C4A6E" },
  titulo: { fontSize: 14, fontWeight: 800, color: "#0F172A", margin: "0 0 8px" },
  tarjeta: { border: "1px solid #D8E5F2", borderRadius: 14, padding: 14, background: "#fff" },
};

function columnas(primera: string): GridColumn<FilaResumen>[] {
  const monto = (dataField: keyof FilaResumen, caption: string): GridColumn<FilaResumen> => ({
    dataField,
    caption,
    dataType: "number",
    format: MONTO,
    alignment: "right",
    width: 150,
  });
  return [
    { dataField: "nombre", caption: primera, minWidth: 240 },
    monto("afecto", "Suma de Afecto"),
    monto("inafecto", "Suma de Inafecto"),
    monto("igv", "Suma de IGV e IPM"),
    monto("total", "Suma de Total"),
  ];
}

const summary = {
  totalItems: [
    { column: "afecto", type: "sum" as const },
    { column: "inafecto", type: "sum" as const },
    { column: "igv", type: "sum" as const },
    { column: "total", type: "sum" as const },
  ],
};

export default function VentasSunatResumen({ periodos, periodoSel, registrosActuales }: Props) {
  const [periodoActual, rucActual] = periodoSel.split("|");
  const [porPeriodo, setPorPeriodo] = useState<Record<string, VentasSunatRegistroDto[]>>({});
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [empresasSel, setEmpresasSel] = useState<string[]>([]); // vacio = todas
  const [moneda, setMoneda] = useState(""); // "" = todas; filtra por la moneda del comprobante (los importes siempre están en soles)

  // Todos los periodos cargados del mismo RUC emisor; el seleccionado se toma de lo ya cargado en pantalla.
  useEffect(() => {
    if (!rucActual) return;
    let activo = true;
    setCargando(true);
    setError("");
    (async () => {
      try {
        const lista = periodos.filter((p) => p.rucEmisor === rucActual);
        const mapa: Record<string, VentasSunatRegistroDto[]> = {};
        for (const p of lista) {
          if (p.periodo === periodoActual && registrosActuales.length > 0) {
            mapa[p.periodo] = registrosActuales;
            continue;
          }
          const h = await consultarPeriodoVentasSunat(p.periodo, p.rucEmisor);
          if (!activo) return;
          mapa[p.periodo] = h.registros;
        }
        if (activo) setPorPeriodo(mapa);
      } catch (err) {
        if (activo) setError(getHttpErrorMessage(err, "No se pudo cargar el resumen de periodos."));
      } finally {
        if (activo) setCargando(false);
      }
    })();
    return () => {
      activo = false;
    };
  }, [periodos, rucActual, periodoActual, registrosActuales]);

  const todos = useMemo(() => Object.values(porPeriodo).flat(), [porPeriodo]);
  const empresas = useMemo(() => Array.from(new Set(todos.map(empresaDe))).sort(), [todos]);
  const monedas = useMemo(() => Array.from(new Set(todos.map((r) => (r.moneda ?? "").trim()).filter(Boolean))).sort(), [todos]);

  // El Registro de Ventas SIRE ya entrega todos los importes en soles (también los comprobantes en USD): no se convierte.
  const convertir = (_r: VentasSunatRegistroDto, valor: number | null | undefined) => numero(valor);

  const filtrados = useMemo(
    () =>
      todos.filter(
        (r) => (empresasSel.length === 0 || empresasSel.includes(empresaDe(r))) && (!moneda || (r.moneda ?? "").trim() === moneda)
      ),
    [todos, empresasSel, moneda]
  );

  const agrupar = (clave: (r: VentasSunatRegistroDto) => string, nombre: (c: string) => string = (c) => c): FilaResumen[] => {
    const mapa = new Map<string, FilaResumen>();
    for (const r of filtrados) {
      const k = clave(r);
      const fila = mapa.get(k) ?? { clave: k, nombre: nombre(k), afecto: 0, inafecto: 0, igv: 0, total: 0 };
      // Afecto = BI gravada menos el descuento. Dscto BI viene siempre en negativo: se resta su valor absoluto.
      fila.afecto += convertir(r, r.biGravada) - Math.abs(convertir(r, r.dsctoBi));
      fila.inafecto += convertir(r, r.mtoInafecto);
      // IGV e IPM menos el descuento de IGV (valor absoluto, porque viene en negativo).
      fila.igv += convertir(r, r.igv) - Math.abs(convertir(r, r.dsctoIgv));
      fila.total += convertir(r, r.totalCp);
      mapa.set(k, fila);
    }
    return Array.from(mapa.values());
  };

  /* eslint-disable react-hooks/exhaustive-deps */
  const filasPeriodo = useMemo(
    () => agrupar((r) => r.periodo ?? "", nombrePeriodo).filter((f) => f.clave).sort((a, b) => a.clave.localeCompare(b.clave)),
    [filtrados, moneda]
  );
  const filasEmpresa = useMemo(() => agrupar(empresaDe).sort((a, b) => b.total - a.total), [filtrados, moneda]);
  const filasCliente = useMemo(() => agrupar(clienteDe).sort((a, b) => b.total - a.total), [filtrados, moneda]);
  /* eslint-enable react-hooks/exhaustive-deps */

  const alternar = (e: string) => setEmpresasSel((a) => (a.includes(e) ? a.filter((x) => x !== e) : [...a, e]));

  if (!rucActual) {
    return <div style={{ ...styles.tarjeta, color: "#64748B", fontSize: 13 }}>No hay periodos cargados para resumir.</div>;
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div style={styles.campo}>
          Empresa {empresasSel.length > 0 ? "(filtrada)" : "(todas)"}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {empresas.map((e) => (
              <button key={e} type="button" style={{ ...styles.chip, ...(empresasSel.includes(e) ? styles.chipOn : null) }} onClick={() => alternar(e)}>
                {e}
              </button>
            ))}
            {empresasSel.length > 0 ? (
              <button type="button" style={styles.chip} onClick={() => setEmpresasSel([])}>
                Quitar filtro
              </button>
            ) : null}
          </div>
        </div>
        <label style={styles.campo}>
          Moneda del comprobante (importes en S/)
          <select style={styles.select} value={moneda} onChange={(e) => setMoneda(e.target.value)}>
            <option value="">Todas</option>
            {monedas.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error ? <div style={{ color: "#B91C1C", fontSize: 13, fontWeight: 700 }}>{error}</div> : null}
      {cargando ? <div style={{ fontSize: 13, color: "#64748B" }}>Cargando periodos...</div> : null}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(560px, 1fr))", gap: 16, alignItems: "start" }}>
        <div style={styles.tarjeta}>
          <h3 style={styles.titulo}>Ventas por periodo</h3>
          <DataGridPro<FilaResumen>
            dataSource={filasPeriodo}
            columns={columnas("PERIODO")}
            keyExpr="clave"
            height={Math.min(120 + filasPeriodo.length * 34, 520)}
            loading={cargando}
            noDataText="Sin datos."
            stateStoringKey="ventassunat_resumen_periodo"
            exportFileName="ventas_sunat_resumen_periodo"
            paging={false}
            summary={summary}
          />
        </div>
        <div style={styles.tarjeta}>
          <h3 style={styles.titulo}>Ventas por empresa</h3>
          <DataGridPro<FilaResumen>
            dataSource={filasEmpresa}
            columns={columnas("EMPRESA")}
            keyExpr="clave"
            height={Math.min(120 + filasEmpresa.length * 34, 520)}
            loading={cargando}
            noDataText="Sin datos."
            stateStoringKey="ventassunat_resumen_empresa"
            exportFileName="ventas_sunat_resumen_empresa"
            paging={false}
            summary={summary}
          />
        </div>
      </div>

      <div style={styles.tarjeta}>
        <h3 style={styles.titulo}>Ventas por cliente</h3>
        <DataGridPro<FilaResumen>
          dataSource={filasCliente}
          columns={columnas("CLIENTES")}
          keyExpr="clave"
          height="60vh"
          loading={cargando}
          noDataText="Sin datos."
          stateStoringKey="ventassunat_resumen_cliente"
          showSearchPanel
          exportFileName="ventas_sunat_resumen_cliente"
          paging={{ pageSize: 100, pageSizes: [50, 100, 250, 500] }}
          summary={summary}
        />
      </div>
    </div>
  );
}
