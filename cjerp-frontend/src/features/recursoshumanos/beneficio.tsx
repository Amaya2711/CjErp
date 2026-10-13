import { useCallback, useEffect, useMemo, useState } from "react";
import AppPage from "../../components/base/AppPage";
import AppSectionHeader from "../../components/base/AppSectionHeader";
import DataGridBase, { type DataGridColumn } from "../../components/base/DataGridBase";
import ConfirmDialog from "../../components/base/ConfirmDialog";
import DataGridPro from "../../components/datagrid/DataGridPro";
import type { GridColumn } from "../../components/datagrid/types";
import {
  TIPO_ADELANTO,
  TIPO_PRESTAMO,
  aprobarBeneficios,
  descargarPdfBeneficio,
  listarBeneficios,
  listarEmpleadosBeneficio,
  obtenerCronogramaBeneficio,
  rechazarBeneficios,
  registrarBeneficio,
  type Beneficio,
  type BeneficioAccionResultado,
  type BeneficioCuota,
  type BeneficioEmpleado,
} from "../../api/beneficioService";
import { getHttpErrorMessage } from "../../utils/httpError";

type BeneficioTab = "adelanto" | "prestamo" | "aprobar" | "reporte";

const TABS: Array<{ key: BeneficioTab; label: string }> = [
  { key: "adelanto", label: "Adelanto de sueldo" },
  { key: "prestamo", label: "Préstamo" },
  { key: "aprobar", label: "Aprobar" },
  { key: "reporte", label: "Reporte" },
];

const TIPO_LABEL: Record<number, string> = {
  [TIPO_PRESTAMO]: "PRÉSTAMO",
  [TIPO_ADELANTO]: "ADELANTO",
};

const ESTADO_APROBADO = { PENDIENTE: 0, APROBADO: 1, RECHAZADO: 2 } as const;

/**
 * Estado de la solicitud según los datos de cabBeneficio (no depende del texto de la constante): se considera
 * rechazada si IdAprobado = 2 o IdEstado = 0 (el formulario original rechaza con ambas marcas).
 */
function resolverEstadoBeneficio(row: Beneficio): { texto: string; background: string; color: string } {
  if (row.idAprobado === ESTADO_APROBADO.RECHAZADO || row.idEstado === 0) {
    return { texto: "RECHAZADO", background: "#FEF2F2", color: "#B91C1C" };
  }
  if (row.idAprobado === ESTADO_APROBADO.APROBADO) {
    return { texto: "APROBADO", background: "#ECFDF5", color: "#047857" };
  }
  return { texto: "PENDIENTE", background: "#FEF3C7", color: "#B45309" };
}

function mesActualInput(): string {
  const hoy = new Date();
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}`;
}

function formatMonto(valor: number): string {
  return `S/. ${valor.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatMes(valor?: string | null): string {
  if (!valor) return "-";
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return valor;
  return `${String(fecha.getMonth() + 1).padStart(2, "0")}/${fecha.getFullYear()}`;
}

function formatFecha(valor?: string | null): string {
  if (!valor) return "-";
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return valor;
  return fecha.toLocaleDateString("es-PE");
}

/** Mismo cálculo que sp_Beneficio_Registrar: cuotas iguales a 2 decimales; la última absorbe la diferencia. */
function calcularCronograma(monto: number, meses: number, mesInicio: string): Array<{ mes: string; cuota: number }> {
  if (!Number.isFinite(monto) || monto <= 0 || !Number.isInteger(meses) || meses < 1 || !/^\d{4}-\d{2}$/.test(mesInicio)) {
    return [];
  }

  const [anio, mes] = mesInicio.split("-").map(Number);
  const centavosTotal = Math.round(monto * 100);
  const centavosCuota = Math.round(centavosTotal / meses);

  return Array.from({ length: meses }, (_, indice) => {
    const fecha = new Date(anio, mes - 1 + indice, 1);
    const centavos = indice === meses - 1 ? centavosTotal - centavosCuota * (meses - 1) : centavosCuota;
    return {
      mes: `${String(fecha.getMonth() + 1).padStart(2, "0")}/${fecha.getFullYear()}`,
      cuota: centavos / 100,
    };
  });
}

function resumirAcciones(resultados: BeneficioAccionResultado[], accion: "aprobar" | "rechazar"): string {
  const lineas = resultados.map((item) => {
    const base = `#${item.idBeneficio}: ${item.mensaje ?? (item.procesado ? "Procesado." : "No procesado.")}`;
    return accion === "aprobar" && item.procesado && item.correoMensaje ? `${base}\n   Correo: ${item.correoMensaje}` : base;
  });
  return lineas.join("\n");
}

export default function BeneficioPage() {
  const [tab, setTab] = useState<BeneficioTab>("adelanto");
  const [empleados, setEmpleados] = useState<BeneficioEmpleado[]>([]);
  const [empleadosLoading, setEmpleadosLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [procesando, setProcesando] = useState<string | null>(null);
  const [accionPendiente, setAccionPendiente] = useState<"aprobar" | "rechazar" | null>(null);

  // Registro (adelanto / préstamo)
  const [empleadoBusqueda, setEmpleadoBusqueda] = useState("");
  const [idEmpleado, setIdEmpleado] = useState("");
  const [monto, setMonto] = useState("");
  const [meses, setMeses] = useState(1);
  const [mesInicio, setMesInicio] = useState(mesActualInput);

  const [beneficios, setBeneficios] = useState<Beneficio[]>([]);
  const [beneficiosLoading, setBeneficiosLoading] = useState(false);
  const [seleccionados, setSeleccionados] = useState<Set<number>>(new Set());
  const [cronograma, setCronograma] = useState<{ beneficio: Beneficio; cuotas: BeneficioCuota[] } | null>(null);

  const esRegistro = tab === "adelanto" || tab === "prestamo";
  const idTipo = tab === "prestamo" ? TIPO_PRESTAMO : TIPO_ADELANTO;
  // Adelanto de sueldo: siempre 1 cuota (no editable). Préstamo: meses elegidos.
  const mesesEfectivos = tab === "adelanto" ? 1 : meses;

  const montoNumero = Number(monto);
  const cronogramaPreview = useMemo(
    () => calcularCronograma(montoNumero, mesesEfectivos, mesInicio),
    [montoNumero, mesesEfectivos, mesInicio]
  );

  useEffect(() => {
    let cancelled = false;

    async function cargarEmpleados() {
      setEmpleadosLoading(true);
      try {
        const lista = await listarEmpleadosBeneficio();
        if (!cancelled) setEmpleados(lista);
      } catch (loadError) {
        if (!cancelled) setError(getHttpErrorMessage(loadError, "No se pudo cargar la lista de empleados."));
      } finally {
        if (!cancelled) setEmpleadosLoading(false);
      }
    }

    void cargarEmpleados();
    return () => {
      cancelled = true;
    };
  }, []);

  const cargarBeneficios = useCallback(async () => {
    // En registro solo se muestra lo del empleado elegido (como FrmBeneficio.BuscarRpt).
    if (esRegistro && !idEmpleado) {
      setBeneficios([]);
      return;
    }

    setBeneficiosLoading(true);
    setError(null);
    try {
      const lista =
        tab === "aprobar"
          ? await listarBeneficios({ idAprobado: ESTADO_APROBADO.PENDIENTE })
          : esRegistro
            ? await listarBeneficios({ idEmpleado: Number(idEmpleado), idTipoBeneficio: idTipo })
            : await listarBeneficios();
      setBeneficios(lista);
      setSeleccionados(new Set());
    } catch (loadError) {
      setError(getHttpErrorMessage(loadError, "No se pudo cargar la lista de beneficios."));
      setBeneficios([]);
    } finally {
      setBeneficiosLoading(false);
    }
  }, [tab, esRegistro, idEmpleado, idTipo]);

  // Al cambiar de pestaña o de empleado/tipo se recarga; el reporte se consulta con el botón Buscar.
  useEffect(() => {
    setCronograma(null);
    if (tab === "reporte") {
      return;
    }
    void cargarBeneficios();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, idEmpleado]);

  useEffect(() => {
    if (tab === "reporte") {
      void cargarBeneficios();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  function cambiarTab(siguiente: BeneficioTab) {
    setTab(siguiente);
    setError(null);
    setMonto("");
    setMeses(1);
    setSeleccionados(new Set());
  }

  function resolverEmpleado(texto: string): BeneficioEmpleado | undefined {
    const buscado = texto.trim().toLowerCase();
    return empleados.find((item) => (item.nombreEmpleado ?? "").trim().toLowerCase() === buscado);
  }

  async function grabar() {
    const empleado = empleados.find((item) => String(item.idEmpleado) === idEmpleado);
    if (!empleado) {
      window.alert("Debe seleccionar un empleado.");
      return;
    }
    if (empleado.idAptoBeneficio === 2) {
      window.alert("Empleado NO APTO para el beneficio solicitado. Revisar pagos pendientes.");
      return;
    }
    if (!(montoNumero > 0)) {
      window.alert("Debe ingresar el monto a solicitar.");
      return;
    }
    if (!/^\d{4}-\d{2}$/.test(mesInicio)) {
      window.alert("Debe indicar el mes de inicio.");
      return;
    }
    if (mesInicio < mesActualInput()) {
      window.alert("El mes de inicio no puede ser anterior al mes actual.");
      return;
    }

    const pregunta =
      tab === "adelanto"
        ? `¿Desea registrar el monto de ${formatMonto(montoNumero)} como adelanto de sueldo?`
        : `¿Desea registrar el monto de ${formatMonto(montoNumero)} en ${mesesEfectivos} letras?`;
    if (!window.confirm(pregunta)) {
      return;
    }

    setProcesando("Registrando la solicitud. Por favor espere...");
    try {
      const resultado = await registrarBeneficio({
        idTipoBeneficio: idTipo,
        idEmpleado: empleado.idEmpleado,
        monto: montoNumero,
        meses: mesesEfectivos,
        mesInicio: `${mesInicio}-01`,
      });
      window.alert(`Solicitud registrada correctamente. Nro. ${resultado.idBeneficio}`);
      setMonto("");
      setMeses(1);
      // El empleado queda como no apto: se refresca la lista para reflejarlo.
      setEmpleados(await listarEmpleadosBeneficio());
      await cargarBeneficios();
    } catch (saveError) {
      window.alert(getHttpErrorMessage(saveError, "No se pudo registrar la solicitud."));
    } finally {
      setProcesando(null);
    }
  }

  /** Primer paso: pide confirmación. La ejecución real ocurre en procesarSeleccion al confirmar. */
  function solicitarConfirmacion(accion: "aprobar" | "rechazar") {
    if (seleccionados.size === 0) {
      window.alert("Seleccione al menos un registro.");
      return;
    }

    setAccionPendiente(accion);
  }

  async function procesarSeleccion(accion: "aprobar" | "rechazar") {
    setAccionPendiente(null);
    const ids = [...seleccionados];
    if (ids.length === 0) {
      return;
    }

    setProcesando(
      accion === "aprobar"
        ? "Procesando la aprobación y enviando el correo con el PDF. Por favor espere, no cierre ni actualice la página..."
        : "Procesando el rechazo. Por favor espere..."
    );
    try {
      const resultados = accion === "aprobar" ? await aprobarBeneficios(ids) : await rechazarBeneficios(ids);
      await cargarBeneficios();
      if (accion === "rechazar") {
        // Al rechazar, el empleado puede volver a ser apto: se refresca la lista usada en las pestañas de registro.
        setEmpleados(await listarEmpleadosBeneficio());
      }
      window.alert(resumirAcciones(resultados, accion));
    } catch (actionError) {
      window.alert(getHttpErrorMessage(actionError, "No se pudo completar la operación."));
    } finally {
      setProcesando(null);
    }
  }

  async function abrirPdf(beneficio: Beneficio) {
    setProcesando("Generando el PDF...");
    try {
      const blob = await descargarPdfBeneficio(beneficio.idBeneficio);
      const url = URL.createObjectURL(new Blob([blob], { type: "application/pdf" }));
      window.open(url, "_blank");
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (pdfError) {
      window.alert(getHttpErrorMessage(pdfError, "No se pudo generar el PDF."));
    } finally {
      setProcesando(null);
    }
  }

  async function verCronograma(beneficio: Beneficio) {
    try {
      const cuotas = await obtenerCronogramaBeneficio(beneficio.idBeneficio);
      setCronograma({ beneficio, cuotas });
    } catch (loadError) {
      window.alert(getHttpErrorMessage(loadError, "No se pudo cargar el cronograma."));
    }
  }

  const columnas = useMemo<DataGridColumn<Beneficio>[]>(() => {
    const base: DataGridColumn<Beneficio>[] = [
      { key: "id", header: "Nro.", render: (row) => <strong>{row.idBeneficio}</strong> },
      {
        key: "empleado",
        header: "Empleado",
        render: (row) => (
          <div>
            <div style={{ fontWeight: 700, color: "#0F172A" }}>{row.nombreEmpleado || `Empleado ${row.idEmpleado}`}</div>
            <div style={{ fontSize: 12, color: "#64748B" }}>
              {row.nroDocumento ? `DOC ${row.nroDocumento}` : ""} {row.nombreCliente ? `· ${row.nombreCliente}` : ""}
            </div>
          </div>
        ),
      },
      {
        key: "tipo",
        header: "Tipo",
        render: (row) => row.tipoBeneficio || TIPO_LABEL[row.idTipoBeneficio] || "-",
      },
      { key: "monto", header: "Monto", align: "right", render: (row) => <strong>{formatMonto(row.monto)}</strong> },
      { key: "meses", header: "Meses", align: "right", render: (row) => row.meses },
      { key: "inicio", header: "Mes inicio", render: (row) => formatMes(row.mesInicio) },
      {
        key: "estado",
        header: "Estado",
        render: (row) => {
          const estado = resolverEstadoBeneficio(row);
          return <span style={{ ...estadoBadgeStyle, background: estado.background, color: estado.color }}>{estado.texto}</span>;
        },
      },
      {
        key: "aprobacion",
        header: "Aprobación",
        render: (row) => (
          <div style={{ fontSize: 12 }}>
            <div>{row.aprobador || "-"}</div>
            <div style={{ color: "#64748B" }}>{formatFecha(row.fechaAprobador)}</div>
          </div>
        ),
      },
      {
        key: "acciones",
        header: "Acciones",
        align: "center",
        render: (row) => (
          <div style={{ display: "inline-flex", gap: 6 }}>
            <button type="button" style={accionButtonStyle} onClick={() => void verCronograma(row)}>
              Cronograma
            </button>
            <button type="button" style={accionButtonStyle} onClick={() => void abrirPdf(row)}>
              PDF
            </button>
          </div>
        ),
      },
    ];

    return base;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Aprobar y Reporte usan la grilla avanzada (filtros, agrupación, totales, exportación a Excel y selección múltiple).
  const columnasPro = useMemo<GridColumn<Beneficio>[]>(
    () => [
      { dataField: "idBeneficio", caption: "Nro.", dataType: "number", width: 130, alignment: "left", format: (v) => String(v ?? "") },
      { dataField: "nombreEmpleado", caption: "Empleado", minWidth: 220 },
      { dataField: "nroDocumento", caption: "Documento", width: 110 },
      { dataField: "nombreCliente", caption: "Empresa", width: 150 },
      {
        dataField: "tipo",
        caption: "Tipo",
        width: 110,
        calculateCellValue: (row) => row.tipoBeneficio || TIPO_LABEL[row.idTipoBeneficio] || "",
      },
      {
        dataField: "monto",
        caption: "Monto",
        dataType: "number",
        width: 120,
        alignment: "right",
        format: (v) => formatMonto(Number(v) || 0),
      },
      { dataField: "meses", caption: "Meses", dataType: "number", width: 80, alignment: "right" },
      {
        dataField: "mesInicio",
        caption: "Mes inicio",
        width: 100,
        calculateCellValue: (row) => formatMes(row.mesInicio),
      },
      {
        dataField: "estado",
        caption: "Estado",
        width: 120,
        calculateCellValue: (row) => resolverEstadoBeneficio(row).texto,
        cellRender: (value, row) => {
          const estado = resolverEstadoBeneficio(row);
          return <span style={{ ...estadoBadgeStyle, background: estado.background, color: estado.color }}>{String(value ?? estado.texto)}</span>;
        },
      },
      { dataField: "aprobador", caption: "Aprobador", width: 200, calculateCellValue: (row) => row.aprobador || "" },
      {
        dataField: "fechaAprobador",
        caption: "Fecha aprobación",
        width: 130,
        calculateCellValue: (row) => (row.fechaAprobador ? formatFecha(row.fechaAprobador) : ""),
      },
      {
        dataField: "acciones",
        caption: "Acciones",
        width: 170,
        alignment: "center",
        allowSorting: false,
        allowFiltering: false,
        allowGrouping: false,
        allowHeaderFilter: false,
        allowSearch: false,
        calculateCellValue: () => "",
        cellRender: (_value, row) => (
          <div style={{ display: "inline-flex", gap: 6 }}>
            <button type="button" style={accionButtonStyle} onClick={() => void verCronograma(row)}>
              Cronograma
            </button>
            <button type="button" style={accionButtonStyle} onClick={() => void abrirPdf(row)}>
              PDF
            </button>
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const empleadoSeleccionado = empleados.find((item) => String(item.idEmpleado) === idEmpleado);

  return (
    <AppPage
      title="Beneficios"
      fillHeight={!esRegistro}
      actions={
        tab === "aprobar" ? (
          <div style={{ display: "flex", gap: 10 }}>
            <button
              type="button"
              onClick={() => solicitarConfirmacion("rechazar")}
              disabled={seleccionados.size === 0 || Boolean(procesando)}
              style={botonStyle("#FEF2F2", "#B91C1C", "#FECACA", seleccionados.size === 0 || Boolean(procesando))}
            >
              Rechazar
            </button>
            <button
              type="button"
              onClick={() => solicitarConfirmacion("aprobar")}
              disabled={seleccionados.size === 0 || Boolean(procesando)}
              style={botonStyle("#1D4ED8", "#FFFFFF", "#1D4ED8", seleccionados.size === 0 || Boolean(procesando))}
            >
              Aprobar
            </button>
          </div>
        ) : null
      }
    >
      <div style={esRegistro ? panelCardStyle : { ...panelCardStyle, ...panelCardFillStyle }}>
        <div style={tabsRowStyle}>
          {TABS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => cambiarTab(item.key)}
              style={{
                ...tabButtonStyle,
                background: tab === item.key ? "#1D4ED8" : "#EFF6FF",
                color: tab === item.key ? "#FFFFFF" : "#1D4ED8",
                borderColor: tab === item.key ? "#1D4ED8" : "#BFDBFE",
              }}
            >
              {item.label}
              {item.key === "aprobar" && tab === "aprobar" ? <span style={badgeStyle}>{beneficios.length}</span> : null}
            </button>
          ))}
        </div>

        {error ? <div style={errorBannerStyle}>{error}</div> : null}

        {esRegistro ? (
          <div style={{ display: "grid", gap: 16 }}>
            <AppSectionHeader
              title={tab === "adelanto" ? "Solicitud de adelanto de sueldo" : "Solicitud de préstamo"}
              description={
                tab === "adelanto"
                  ? "El adelanto se descuenta en una sola cuota, en el mes indicado."
                  : "El préstamo se descuenta en cuotas mensuales a partir del mes indicado."
              }
            />

            <div style={fieldsGridStyle}>
              <label style={fieldBlockStyle}>
                <span style={labelStyle}>Empleado</span>
                <input
                  type="text"
                  list="beneficio-empleados"
                  value={empleadoBusqueda}
                  disabled={empleadosLoading}
                  placeholder={empleadosLoading ? "Cargando empleados..." : "Escriba el nombre del empleado"}
                  onChange={(event) => {
                    setEmpleadoBusqueda(event.target.value);
                    const encontrado = resolverEmpleado(event.target.value);
                    setIdEmpleado(encontrado ? String(encontrado.idEmpleado) : "");
                  }}
                  style={inputStyle}
                />
                <datalist id="beneficio-empleados">
                  {empleados.map((item) => (
                    <option key={item.idEmpleado} value={item.nombreEmpleado ?? ""} />
                  ))}
                </datalist>
                {empleadoSeleccionado?.idAptoBeneficio === 2 ? (
                  <span style={fieldErrorStyle}>Empleado NO APTO para el beneficio. Revisar pagos pendientes.</span>
                ) : null}
              </label>

              <label style={fieldBlockStyle}>
                <span style={labelStyle}>Monto a solicitar (S/.)</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={monto}
                  onChange={(event) => setMonto(event.target.value.replace(/[^0-9.]/g, ""))}
                  placeholder="0.00"
                  style={inputStyle}
                />
              </label>

              <label style={fieldBlockStyle}>
                <span style={labelStyle}>Meses</span>
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={mesesEfectivos}
                  disabled={tab === "adelanto"}
                  onChange={(event) => setMeses(Math.max(1, Math.min(60, Math.trunc(Number(event.target.value)) || 1)))}
                  style={inputStyle}
                />
              </label>

              <label style={fieldBlockStyle}>
                <span style={labelStyle}>Mes de inicio</span>
                <input
                  type="month"
                  value={mesInicio}
                  min={mesActualInput()}
                  onChange={(event) => setMesInicio(event.target.value)}
                  style={inputStyle}
                />
                {mesInicio && mesInicio < mesActualInput() ? (
                  <span style={fieldErrorStyle}>El mes de inicio no puede ser anterior al mes actual.</span>
                ) : null}
              </label>
            </div>

            {cronogramaPreview.length > 0 ? (
              <div style={cronogramaBoxStyle}>
                <strong style={{ fontSize: 13 }}>Cronograma</strong>
                <table style={miniTablaStyle}>
                  <thead>
                    <tr>
                      <th style={miniThStyle}>Mes</th>
                      <th style={{ ...miniThStyle, textAlign: "right" }}>Cuota</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cronogramaPreview.map((fila) => (
                      <tr key={fila.mes}>
                        <td style={miniTdStyle}>{fila.mes}</td>
                        <td style={{ ...miniTdStyle, textAlign: "right" }}>{formatMonto(fila.cuota)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            <div>
              <button
                type="button"
                onClick={() => void grabar()}
                disabled={Boolean(procesando)}
                style={botonStyle("#1D4ED8", "#FFFFFF", "#1D4ED8", Boolean(procesando))}
              >
                Grabar solicitud
              </button>
            </div>
          </div>
        ) : null}

        <div style={esRegistro ? { marginTop: 22 } : gridFillWrapStyle}>
          {esRegistro ? (
            <DataGridBase
              columns={columnas}
              rows={beneficios}
              loading={beneficiosLoading}
              loadingMessage="Cargando beneficios..."
              emptyMessage={idEmpleado ? "No se encontraron beneficios." : "Seleccione un empleado para ver sus solicitudes."}
              getRowKey={(row) => row.idBeneficio}
            />
          ) : (
            <DataGridPro<Beneficio>
              dataSource={beneficios}
              columns={columnasPro}
              keyExpr={(row) => String(row.idBeneficio)}
              height="fill"
              loading={beneficiosLoading}
              noDataText={tab === "aprobar" ? "No hay solicitudes pendientes de aprobación." : "No se encontraron beneficios."}
              showFilterRow
              showSearchPanel
              showGroupPanel
              allowColumnResizing
              allowExport
              exportFileName={tab === "aprobar" ? "Beneficios_pendientes" : "Beneficios"}
              paging={{ pageSize: 25 }}
              stateStoringKey={`beneficio_${tab}`}
              selection={tab === "aprobar" ? "multiple" : "none"}
              selectedKeys={tab === "aprobar" ? [...seleccionados].map(String) : undefined}
              onSelectionChanged={
                tab === "aprobar" ? (keys) => setSeleccionados(new Set(keys.map(Number))) : undefined
              }
              selectionDisabled={Boolean(procesando)}
              summary={{
                totalItems: [
                  { column: "idBeneficio", type: "count", label: "Cant." },
                  { column: "monto", type: "sum", format: (v) => formatMonto(v) },
                ],
              }}
            />
          )}
        </div>
      </div>

      <ConfirmDialog
        open={accionPendiente !== null}
        title={accionPendiente === "aprobar" ? "Aprobar solicitudes" : "Rechazar solicitudes"}
        message={
          <div style={{ display: "grid", gap: 8 }}>
            <span>
              {accionPendiente === "aprobar"
                ? `¿Desea aprobar ${seleccionados.size} solicitud(es)? Se enviará el PDF por correo.`
                : `¿Desea rechazar ${seleccionados.size} solicitud(es)? Esta acción no se puede deshacer.`}
            </span>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "#475569" }}>
              {beneficios
                .filter((item) => seleccionados.has(item.idBeneficio))
                .slice(0, 5)
                .map((item) => (
                  <li key={item.idBeneficio}>
                    #{item.idBeneficio} · {item.nombreEmpleado || `Empleado ${item.idEmpleado}`} · {formatMonto(item.monto)}
                  </li>
                ))}
              {seleccionados.size > 5 ? <li>y {seleccionados.size - 5} más...</li> : null}
            </ul>
          </div>
        }
        confirmLabel={accionPendiente === "aprobar" ? "Aprobar" : "Rechazar"}
        destructive={accionPendiente === "rechazar"}
        onConfirm={() => accionPendiente && void procesarSeleccion(accionPendiente)}
        onCancel={() => setAccionPendiente(null)}
      />

      {cronograma ? (
        <div style={overlayStyle} onClick={() => setCronograma(null)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Cronograma del beneficio ${cronograma.beneficio.idBeneficio}`}
            style={popupStyle}
            onClick={(event) => event.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
              <div>
                <strong style={{ fontSize: 15, color: "#0F172A" }}>Cronograma del beneficio #{cronograma.beneficio.idBeneficio}</strong>
                <div style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>
                  {cronograma.beneficio.nombreEmpleado || `Empleado ${cronograma.beneficio.idEmpleado}`} · {formatMonto(cronograma.beneficio.monto)}
                </div>
              </div>
              <button type="button" onClick={() => setCronograma(null)} style={accionButtonStyle} aria-label="Cerrar">
                Cerrar
              </button>
            </div>
            <div style={{ maxHeight: "55vh", overflowY: "auto" }}>
              <table style={miniTablaStyle}>
                <thead>
                  <tr>
                    <th style={miniThStyle}>Mes</th>
                    <th style={{ ...miniThStyle, textAlign: "right" }}>Cuota</th>
                  </tr>
                </thead>
                <tbody>
                  {cronograma.cuotas.map((cuota) => (
                    <tr key={`${cuota.idBeneficio}-${cuota.mesPago}`}>
                      <td style={miniTdStyle}>{cuota.mesPago}</td>
                      <td style={{ ...miniTdStyle, textAlign: "right" }}>{formatMonto(cuota.monto)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}

      {procesando ? (
        <div style={overlayStyle} role="status" aria-live="polite">
          <style>{"@keyframes beneficioSpin { to { transform: rotate(360deg); } }"}</style>
          <div style={overlayCardStyle}>
            <span style={spinnerStyle} />
            <span style={{ color: "#0F172A", fontSize: 14, fontWeight: 600, lineHeight: 1.45 }}>{procesando}</span>
          </div>
        </div>
      ) : null}
    </AppPage>
  );
}

function botonStyle(background: string, color: string, borderColor: string, disabled: boolean): React.CSSProperties {
  return {
    border: `1px solid ${borderColor}`,
    background: disabled ? "#CBD5E1" : background,
    color: disabled ? "#FFFFFF" : color,
    padding: "10px 16px",
    borderRadius: 12,
    cursor: disabled ? "not-allowed" : "pointer",
    fontWeight: 700,
  };
}

const panelCardStyle: React.CSSProperties = {
  background: "linear-gradient(180deg, #F8FBFF 0%, #FFFFFF 100%)",
  border: "1px solid #DBEAFE",
  borderRadius: 24,
  padding: 24,
  boxShadow: "0 24px 60px rgba(15,23,42,0.06)",
};

// Aprobar y Reporte: el panel y la grilla ocupan todo el alto disponible de la página (sin alturas fijas).
const panelCardFillStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  height: "100%",
  minHeight: 0,
  boxSizing: "border-box",
};

const gridFillWrapStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  display: "flex",
  flexDirection: "column",
};

const tabsRowStyle: React.CSSProperties = { display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18 };

const tabButtonStyle: React.CSSProperties = {
  border: "1px solid #BFDBFE",
  borderRadius: 999,
  padding: "10px 16px",
  fontWeight: 700,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
};

const badgeStyle: React.CSSProperties = {
  background: "#DBEAFE",
  color: "#1D4ED8",
  borderRadius: 999,
  padding: "2px 8px",
  fontSize: 12,
};

const fieldsGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 14,
  alignItems: "start",
};

const fieldBlockStyle: React.CSSProperties = { display: "grid", gap: 8, minWidth: 0, alignContent: "start" };

const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: "#334155" };

const inputStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 44,
  borderRadius: 12,
  border: "1px solid #CBD5E1",
  padding: "0 12px",
  fontSize: 14,
  color: "#0F172A",
  boxSizing: "border-box",
  background: "#FFFFFF",
};

const fieldErrorStyle: React.CSSProperties = { fontSize: 12, color: "#DC2626", fontWeight: 600 };

const errorBannerStyle: React.CSSProperties = {
  marginBottom: 16,
  padding: 14,
  borderRadius: 14,
  border: "1px solid #FECACA",
  background: "#FEF2F2",
  color: "#991B1B",
  fontWeight: 600,
};

const estadoBadgeStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "6px 10px",
  borderRadius: 999,
  fontWeight: 700,
  fontSize: 12,
};

const accionButtonStyle: React.CSSProperties = {
  border: "1px solid #BFDBFE",
  background: "#EFF6FF",
  color: "#1D4ED8",
  borderRadius: 10,
  padding: "6px 10px",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
};

const cronogramaBoxStyle: React.CSSProperties = {
  border: "1px solid #E2E8F0",
  borderRadius: 14,
  background: "#F8FAFC",
  padding: 14,
  display: "grid",
  gap: 10,
  maxWidth: 420,
};

const miniTablaStyle: React.CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: 13 };
const miniThStyle: React.CSSProperties = { textAlign: "left", padding: "6px 8px", borderBottom: "1px solid #CBD5E1", color: "#334155" };
const miniTdStyle: React.CSSProperties = { padding: "6px 8px", borderBottom: "1px solid #E2E8F0" };

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 2000,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "rgba(15, 23, 42, 0.45)",
  padding: 16,
};

const popupStyle: React.CSSProperties = {
  display: "grid",
  gap: 14,
  width: "min(460px, 100%)",
  padding: 20,
  borderRadius: 16,
  background: "#FFFFFF",
  boxShadow: "0 20px 45px rgba(15, 23, 42, 0.25)",
};

const overlayCardStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 14,
  maxWidth: 440,
  padding: "18px 22px",
  borderRadius: 14,
  background: "#FFFFFF",
  boxShadow: "0 20px 45px rgba(15, 23, 42, 0.25)",
};

const spinnerStyle: React.CSSProperties = {
  flex: "0 0 auto",
  width: 26,
  height: 26,
  borderRadius: "50%",
  border: "3px solid #BFDBFE",
  borderTopColor: "#1D4ED8",
  animation: "beneficioSpin 0.8s linear infinite",
};
