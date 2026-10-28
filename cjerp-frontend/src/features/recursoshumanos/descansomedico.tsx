import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AppPage from "../../components/base/AppPage";
import AppSectionHeader from "../../components/base/AppSectionHeader";
import ConfirmDialog from "../../components/base/ConfirmDialog";
import DataGridBase, { type DataGridColumn } from "../../components/base/DataGridBase";
import DataGridPro from "../../components/datagrid/DataGridPro";
import type { GridColumn } from "../../components/datagrid/types";
import {
  ESTADO_DESCANSO,
  aprobarDescansos,
  descargarPdfDescanso,
  listarDescansos,
  listarEmpleadosDescanso,
  rechazarDescansos,
  registrarDescanso,
  subirAdjuntoDescanso,
  cargarAnexoDescanso,
  type Descanso,
  type DescansoAccionResultado,
  type DescansoEmpleado,
  type DescansoSolicitudKey,
} from "../../api/descansoService";
import { seguridadPermisosAccionesService } from "../seguridad/services/seguridadPermisosAccionesService";
import { getAuthUser, hasFullPageActionAccess } from "../../utils/authStorage";
import { buildSharePointUrl } from "../../utils/sharepoint";
import { getHttpErrorMessage } from "../../utils/httpError";

type DescansoTab = "ingreso" | "aprobar" | "pendientes" | "reporte";

const RUTA_PAGINA = "/recursoshumanos/descansomedico";

const TABS: Array<{ key: DescansoTab; label: string; permiso: string }> = [
  { key: "ingreso", label: "Ingreso", permiso: "tab.ingreso" },
  { key: "aprobar", label: "Aprobar", permiso: "tab.aprobar" },
  { key: "pendientes", label: "Mis pendientes", permiso: "tab.pendientes" },
  { key: "reporte", label: "Reporte", permiso: "tab.reporte" },
];

/** Etapas de aprobación del formulario original (frmDescanso): 1era a 4ta aprobación. */
const ETAPAS: Array<{ estado: number; label: string; permiso: string }> = [
  { estado: ESTADO_DESCANSO.PRIMERA, label: "1era aprobación", permiso: "tab.aprobacion_1" },
  { estado: ESTADO_DESCANSO.SEGUNDA, label: "2da aprobación", permiso: "tab.aprobacion_2" },
  { estado: ESTADO_DESCANSO.TERCERA, label: "3era aprobación", permiso: "tab.aprobacion_3" },
  { estado: ESTADO_DESCANSO.CUARTA, label: "4ta aprobación", permiso: "tab.aprobacion_4" },
];

/** Estados desde los que se puede rechazar (mismos que el formulario original). */
const ESTADOS_RECHAZABLES: number[] = [4, ESTADO_DESCANSO.PRIMERA, ESTADO_DESCANSO.SEGUNDA, ESTADO_DESCANSO.TERCERA];

function fechaIso(valor?: string | null): string {
  return String(valor ?? "").slice(0, 10);
}

function formatFecha(valor?: string | null): string {
  const iso = fechaIso(valor);
  const [anio, mes, dia] = iso.split("-");
  return anio && mes && dia ? `${dia}/${mes}/${anio}` : "-";
}

function claveSolicitud(row: Descanso): string {
  return `${row.idEmpleadoCj}|${fechaIso(row.fechaInicio)}|${fechaIso(row.fechaFin)}`;
}

function aKey(row: Descanso, idEstadoActual: number): DescansoSolicitudKey {
  return {
    idEmpleadoCj: row.idEmpleadoCj,
    fechaInicio: fechaIso(row.fechaInicio),
    fechaFin: fechaIso(row.fechaFin),
    idEstadoActual,
  };
}

function resolverEstado(row: Descanso): { texto: string; background: string; color: string } {
  switch (row.idEstado) {
    case ESTADO_DESCANSO.APROBADO:
      return { texto: "APROBADO", background: "#ECFDF5", color: "#047857" };
    case ESTADO_DESCANSO.RECHAZADO:
      return { texto: "RECHAZADO", background: "#FEF2F2", color: "#B91C1C" };
    case ESTADO_DESCANSO.PRIMERA:
      return { texto: "1ERA APROBACIÓN", background: "#EEF2FF", color: "#3730A3" };
    case ESTADO_DESCANSO.SEGUNDA:
      return { texto: "2DA APROBACIÓN", background: "#F0F9FF", color: "#0369A1" };
    case ESTADO_DESCANSO.TERCERA:
      return { texto: "3ERA APROBACIÓN", background: "#FEF3C7", color: "#B45309" };
    case ESTADO_DESCANSO.CUARTA:
      return { texto: "4TA APROBACIÓN", background: "#FFEDD5", color: "#C2410C" };
    default:
      return { texto: String(row.estado || `ESTADO ${row.idEstado}`).toUpperCase(), background: "#F1F5F9", color: "#334155" };
  }
}

function resumirAcciones(resultados: DescansoAccionResultado[]): string {
  return resultados
    .map((item) => {
      const base = `${fechaIso(item.fechaInicio)} a ${fechaIso(item.fechaFin)} (empleado ${item.idEmpleadoCj}): ${item.mensaje ?? (item.procesado ? "Procesado." : "No procesado.")}`;
      return item.procesado && item.correoMensaje ? `${base}\n   Correo: ${item.correoMensaje}` : base;
    })
    .join("\n");
}

export default function DescansoMedicoPage() {
  const [empleados, setEmpleados] = useState<DescansoEmpleado[]>([]);
  const [empleadosLoading, setEmpleadosLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [procesando, setProcesando] = useState<string | null>(null);

  // Todo está activo por defecto: solo se bloquea lo que tenga una restricción explícita en Seguridad / Permisos
  // (SegPermisoAccion por usuario). Ningún bloqueo está definido en código.
  const [bloqueados, setBloqueados] = useState<Set<string>>(new Set());
  const bloqueado = useCallback((clave: string) => bloqueados.has(clave), [bloqueados]);

  const tabsVisibles = TABS.filter((item) => !bloqueado(item.permiso));
  const [tab, setTab] = useState<DescansoTab>("ingreso");
  const tabActivo = tabsVisibles.some((item) => item.key === tab) ? tab : (tabsVisibles[0]?.key ?? "ingreso");
  const [conteoEtapas, setConteoEtapas] = useState<Record<number, number>>({});
  const etapasVisibles = ETAPAS.filter((item) => !bloqueado(item.permiso));
  const [etapa, setEtapa] = useState<number>(ESTADO_DESCANSO.PRIMERA);
  const etapaActiva = etapasVisibles.some((item) => item.estado === etapa) ? etapa : (etapasVisibles[0]?.estado ?? etapa);

  // Ingreso
  const [empleadoBusqueda, setEmpleadoBusqueda] = useState("");
  const [idEmpleado, setIdEmpleado] = useState("");
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");
  const [archivo, setArchivo] = useState<File | null>(null);
  const archivoInputRef = useRef<HTMLInputElement | null>(null);

  const [descansos, setDescansos] = useState<Descanso[]>([]);
  const [descansosLoading, setDescansosLoading] = useState(false);
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());
  const [accionPendiente, setAccionPendiente] = useState<"aprobar" | "rechazar" | null>(null);
  const [rechazoFila, setRechazoFila] = useState<Descanso | null>(null);
  const [motivoRechazo, setMotivoRechazo] = useState("");

  const dias =
    fechaInicio && fechaFin && fechaFin >= fechaInicio
      ? Math.round((new Date(`${fechaFin}T00:00:00`).getTime() - new Date(`${fechaInicio}T00:00:00`).getTime()) / 86_400_000) + 1
      : 0;

  useEffect(() => {
    const authUser = getAuthUser();
    if (hasFullPageActionAccess(authUser)) {
      return;
    }

    // SegPermisoAccion referencia EmpleadoCj (codEmp en sesión); algunas sesiones traen además un IdEmpleado alterno.
    const ids = [...new Set([authUser?.codEmp, authUser?.idEmpleado]
      .map((value) => Math.trunc(Number(value ?? 0)))
      .filter((value) => Number.isFinite(value) && value > 0))];
    let cancelled = false;

    async function cargarRestricciones() {
      try {
        const conjuntos = await Promise.all(
          ids.map((idEmpleadoPermiso) =>
            seguridadPermisosAccionesService.listar({ rutaPagina: RUTA_PAGINA, idEmpleado: idEmpleadoPermiso })
          )
        );
        if (cancelled) return;

        // Restricción explícita por usuario: fila activa sin permiso de ver o de ejecutar.
        const restringidos = new Set<string>();
        conjuntos.flat().forEach((permiso) => {
          const clave = permiso.claveAccion?.trim().toLowerCase();
          if (clave && permiso.idEmpleado && permiso.esActivo && (!permiso.puedeVer || !permiso.puedeEjecutar)) {
            restringidos.add(clave);
          }
        });
        setBloqueados(restringidos);
      } catch {
        // Sin acceso a la tabla de permisos no se bloquea nada.
      }
    }

    void cargarRestricciones();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function cargarEmpleados() {
      setEmpleadosLoading(true);
      try {
        const lista = await listarEmpleadosDescanso();
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

  const cargarDescansos = useCallback(async () => {
    if (tabActivo === "ingreso" && !idEmpleado) {
      setDescansos([]);
      return;
    }

    setDescansosLoading(true);
    setError(null);
    try {
      let lista: Awaited<ReturnType<typeof listarDescansos>>;
      if (tabActivo === "aprobar") {
        // Una consulta por etapa: la activa llena la grilla y todas alimentan el contador de cada pestaña.
        const porEtapa = await Promise.all(
          ETAPAS.map(async (item) => [item.estado, await listarDescansos({ idEstado: item.estado })] as const),
        );
        setConteoEtapas(Object.fromEntries(porEtapa.map(([estado, filas]) => [estado, filas.length])));
        lista = porEtapa.find(([estado]) => estado === etapaActiva)?.[1] ?? [];
      } else if (tabActivo === "pendientes") {
        // Solo lo que le toca validar al usuario que ingresó (1er/2do/3er validador del empleado).
        lista = await listarDescansos({ soloMios: true });
      } else {
        lista =
          tabActivo === "ingreso"
            ? await listarDescansos({ idEmpleadoCj: Number(idEmpleado) })
            : await listarDescansos();
      }
      setDescansos(lista);
      setSeleccionados(new Set());
    } catch (loadError) {
      setError(getHttpErrorMessage(loadError, "No se pudo cargar la lista de descansos."));
      setDescansos([]);
    } finally {
      setDescansosLoading(false);
    }
  }, [tabActivo, etapaActiva, idEmpleado]);

  useEffect(() => {
    void cargarDescansos();
  }, [cargarDescansos]);

  function resolverEmpleado(texto: string): DescansoEmpleado | undefined {
    const buscado = texto.trim().toLowerCase();
    return empleados.find((item) => (item.nombreEmpleado ?? "").trim().toLowerCase() === buscado);
  }

  async function grabar() {
    if (!idEmpleado) {
      window.alert("Debe seleccionar empleado.");
      return;
    }
    if (!fechaInicio || !fechaFin) {
      window.alert("Debe indicar fecha inicio y fecha fin.");
      return;
    }
    if (fechaFin < fechaInicio) {
      window.alert("La fecha fin no puede ser menor que la fecha inicio.");
      return;
    }
    if (dias > 366) {
      window.alert("El rango no puede superar 366 días.");
      return;
    }
    if (!archivo) {
      window.alert("Debe ingresar documentos adjuntos.");
      return;
    }

    setProcesando("Subiendo el documento y registrando el descanso. Por favor espere...");
    try {
      const adjunto = await subirAdjuntoDescanso(archivo, Number(idEmpleado));
      const resultado = await registrarDescanso({
        idEmpleadoCj: Number(idEmpleado),
        fechaInicio,
        fechaFin,
        ruta: adjunto.storagePath,
      });
      window.alert(`Descanso registrado correctamente (${resultado.diasRegistrados} día(s)).`);
      setFechaInicio("");
      setFechaFin("");
      setArchivo(null);
      if (archivoInputRef.current) archivoInputRef.current.value = "";
      await cargarDescansos();
    } catch (saveError) {
      window.alert(getHttpErrorMessage(saveError, "No se pudo registrar el descanso."));
    } finally {
      setProcesando(null);
    }
  }

  function solicitarConfirmacion(accion: "aprobar" | "rechazar") {
    if (seleccionados.size === 0) {
      window.alert("Seleccione al menos una solicitud.");
      return;
    }
    setMotivoRechazo("");
    setAccionPendiente(accion);
  }

  async function ejecutarSeleccion(accion: "aprobar" | "rechazar") {
    const motivo = motivoRechazo.trim();
    if (accion === "rechazar" && !motivo) return;
    setAccionPendiente(null);
    const filas = descansos.filter((item) => seleccionados.has(claveSolicitud(item)));
    if (filas.length === 0) return;

    const solicitudes = filas.map((fila) => aKey(fila, fila.idEstado));
    setProcesando(
      accion === "aprobar"
        ? tabActivo === "aprobar" && etapaActiva === ESTADO_DESCANSO.CUARTA
          ? "Procesando la aprobación final y enviando el correo con el PDF. Por favor espere, no cierre ni actualice la página..."
          : "Procesando la aprobación. Por favor espere..."
        : "Procesando el rechazo. Por favor espere..."
    );
    try {
      const resultados = accion === "aprobar" ? await aprobarDescansos(solicitudes) : await rechazarDescansos(solicitudes, motivo);
      await cargarDescansos();
      window.alert(resumirAcciones(resultados));
    } catch (actionError) {
      window.alert(getHttpErrorMessage(actionError, "No se pudo completar la operación."));
    } finally {
      setProcesando(null);
    }
  }

  async function rechazarFila(fila: Descanso) {
    const motivo = motivoRechazo.trim();
    if (!motivo) return;
    setRechazoFila(null);
    setProcesando("Procesando el rechazo. Por favor espere...");
    try {
      const resultados = await rechazarDescansos([aKey(fila, fila.idEstado)], motivo);
      await cargarDescansos();
      window.alert(resumirAcciones(resultados));
    } catch (actionError) {
      window.alert(getHttpErrorMessage(actionError, "No se pudo rechazar la solicitud."));
    } finally {
      setProcesando(null);
    }
  }

  async function abrirPdf(fila: Descanso) {
    setProcesando("Generando el PDF...");
    try {
      const blob = await descargarPdfDescanso({
        idEmpleadoCj: fila.idEmpleadoCj,
        fechaInicio: fechaIso(fila.fechaInicio),
        fechaFin: fechaIso(fila.fechaFin),
      });
      const url = URL.createObjectURL(new Blob([blob], { type: "application/pdf" }));
      window.open(url, "_blank");
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (pdfError) {
      window.alert(getHttpErrorMessage(pdfError, "No se pudo generar el PDF."));
    } finally {
      setProcesando(null);
    }
  }

  // Reporte: la grilla se memoriza una sola vez, por eso el anexo usa refs para ver siempre la versión vigente.
  const anexoInputRef = useRef<HTMLInputElement | null>(null);
  const anexoFilaRef = useRef<Descanso | null>(null);
  const recargarRef = useRef<() => Promise<void>>(async () => {});
  recargarRef.current = cargarDescansos;

  function elegirAnexo(fila: Descanso) {
    anexoFilaRef.current = fila;
    anexoInputRef.current?.click();
  }

  async function subirAnexo(archivoAnexo: File | null) {
    const fila = anexoFilaRef.current;
    if (anexoInputRef.current) anexoInputRef.current.value = "";
    anexoFilaRef.current = null;
    if (!archivoAnexo || !fila) return;

    setProcesando("Subiendo el documento anexo a SharePoint. Por favor espere...");
    try {
      await cargarAnexoDescanso(archivoAnexo, {
        idEmpleadoCj: fila.idEmpleadoCj,
        fechaInicio: fechaIso(fila.fechaInicio),
        fechaFin: fechaIso(fila.fechaFin),
      });
      await recargarRef.current();
      window.alert("Documento anexo cargado correctamente.");
    } catch (uploadError) {
      window.alert(getHttpErrorMessage(uploadError, "No se pudo cargar el documento anexo."));
    } finally {
      setProcesando(null);
    }
  }

  function verAdjunto(fila: Descanso) {
    if (!fila.ruta) {
      window.alert("No hay ruta de documento registrada.");
      return;
    }
    window.open(buildSharePointUrl(fila.ruta), "_blank", "noopener,noreferrer");
  }

  const columnasIngreso = useMemo<DataGridColumn<Descanso>[]>(
    () => [
      {
        key: "empleado",
        header: "Empleado",
        render: (row) => (
          <div>
            <div style={{ fontWeight: 700, color: "#0F172A" }}>{row.nombreEmpleado || `Empleado ${row.idEmpleadoCj}`}</div>
            <div style={{ fontSize: 12, color: "#64748B" }}>{row.nroDocumento ? `DOC ${row.nroDocumento}` : ""}</div>
          </div>
        ),
      },
      { key: "inicio", header: "Fecha inicio", render: (row) => formatFecha(row.fechaInicio) },
      { key: "fin", header: "Fecha fin", render: (row) => formatFecha(row.fechaFin) },
      { key: "dias", header: "Días", align: "right", render: (row) => row.dias },
      {
        key: "estado",
        header: "Estado",
        render: (row) => {
          const estado = resolverEstado(row);
          return <span style={{ ...estadoBadgeStyle, background: estado.background, color: estado.color }}>{estado.texto}</span>;
        },
      },
      {
        key: "acciones",
        header: "Acciones",
        align: "center",
        render: (row) => (
          <div style={{ display: "inline-flex", gap: 6 }}>
            <button type="button" style={accionButtonStyle} onClick={() => verAdjunto(row)}>
              Documento
            </button>
            {!bloqueado("button.rechazar") && ESTADOS_RECHAZABLES.includes(row.idEstado) ? (
              <button type="button" style={{ ...accionButtonStyle, color: "#B91C1C", borderColor: "#FECACA", background: "#FEF2F2" }} onClick={() => { setMotivoRechazo(""); setRechazoFila(row); }}>
                Rechazar
              </button>
            ) : null}
          </div>
        ),
      },
    ],
    [bloqueado]
  );

  // Aprobar y Reporte usan la grilla avanzada (filtros, agrupación, totales, exportación a Excel y selección múltiple).
  const columnasPro = useMemo<GridColumn<Descanso>[]>(
    () => [
      { dataField: "nombreEmpleado", caption: "Empleado", minWidth: 220 },
      { dataField: "nroDocumento", caption: "Documento", width: 110 },
      { dataField: "fechaInicio", caption: "Fecha inicio", width: 110, calculateCellValue: (row) => formatFecha(row.fechaInicio) },
      { dataField: "fechaFin", caption: "Fecha fin", width: 110, calculateCellValue: (row) => formatFecha(row.fechaFin) },
      { dataField: "dias", caption: "Días", dataType: "number", width: 70, alignment: "right" },
      {
        dataField: "estadoTexto",
        caption: "Estado",
        width: 150,
        calculateCellValue: (row) => resolverEstado(row).texto,
        cellRender: (valor, row) => {
          const estado = resolverEstado(row);
          return <span style={{ ...estadoBadgeStyle, background: estado.background, color: estado.color }}>{String(valor ?? estado.texto)}</span>;
        },
      },
      { dataField: "primerValidador", caption: "1er validador", width: 180, calculateCellValue: (row) => row.primerValidador || "" },
      { dataField: "segundoValidador", caption: "2do validador", width: 180, calculateCellValue: (row) => row.segundoValidador || "" },
      { dataField: "tercerValidador", caption: "3er validador", width: 180, calculateCellValue: (row) => row.tercerValidador || "" },
      { dataField: "usuario", caption: "Registrado por", width: 130, calculateCellValue: (row) => row.usuario || "" },
      { dataField: "fechaCreacion", caption: "Fecha registro", width: 120, calculateCellValue: (row) => formatFecha(row.fechaCreacion) },
      {
        dataField: "acciones",
        caption: "Acciones",
        width: 260,
        alignment: "center",
        allowSorting: false,
        allowFiltering: false,
        allowGrouping: false,
        allowHeaderFilter: false,
        allowSearch: false,
        calculateCellValue: () => "",
        cellRender: (_valor, row) => (
          <div style={{ display: "inline-flex", gap: 6 }}>
            <button type="button" style={accionButtonStyle} onClick={() => verAdjunto(row)}>
              Documento
            </button>
            <button type="button" style={accionButtonStyle} onClick={() => void abrirPdf(row)}>
              PDF
            </button>
            {tabActivo === "reporte" && !bloqueado("button.anexo") ? (
              <button type="button" style={accionButtonStyle} onClick={() => elegirAnexo(row)}>
                {row.ruta ? "Reemplazar anexo" : "Cargar anexo"}
              </button>
            ) : null}
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tabActivo, bloqueado]
  );

  const esIngreso = tabActivo === "ingreso";
  // "Aprobar" y "Mis pendientes" comparten grilla con selección múltiple y acciones aprobar/rechazar.
  const esAprobacion = tabActivo === "aprobar" || tabActivo === "pendientes";
  const puedeGrabar = !bloqueado("button.grabar");
  const puedeRechazarEtapa = tabActivo === "pendientes" || ESTADOS_RECHAZABLES.includes(etapaActiva);

  const motivoField = (
    <label style={{ display: "grid", gap: 4, fontSize: 13, fontWeight: 600, color: "#0F172A" }}>
      Motivo del rechazo (obligatorio)
      <textarea
        value={motivoRechazo}
        onChange={(event) => setMotivoRechazo(event.target.value)}
        maxLength={500}
        rows={3}
        autoFocus
        placeholder="Indique por qué se rechaza la solicitud"
        style={{ border: "1px solid #CBD5E1", borderRadius: 8, padding: 8, fontSize: 14, fontWeight: 400, resize: "vertical", fontFamily: "inherit" }}
      />
    </label>
  );

  return (
    <AppPage
      title="Descanso médico"
      fillHeight={!esIngreso}
      actions={
        esAprobacion ? (
          <div style={{ display: "flex", gap: 10 }}>
            {!bloqueado("button.rechazar") ? (
              <button
                type="button"
                onClick={() => solicitarConfirmacion("rechazar")}
                disabled={seleccionados.size === 0 || Boolean(procesando) || !puedeRechazarEtapa}
                style={botonStyle("#FEF2F2", "#B91C1C", "#FECACA", seleccionados.size === 0 || Boolean(procesando) || !puedeRechazarEtapa)}
              >
                Rechazar
              </button>
            ) : null}
            {!bloqueado("button.aprobar") ? (
              <button
                type="button"
                onClick={() => solicitarConfirmacion("aprobar")}
                disabled={seleccionados.size === 0 || Boolean(procesando)}
                style={botonStyle("#1D4ED8", "#FFFFFF", "#1D4ED8", seleccionados.size === 0 || Boolean(procesando))}
              >
                Aprobar
              </button>
            ) : null}
          </div>
        ) : null
      }
    >
      <div style={esIngreso ? panelCardStyle : { ...panelCardStyle, ...panelCardFillStyle }}>
        <div style={tabsRowStyle}>
          {tabsVisibles.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => {
                setTab(item.key);
                setError(null);
              }}
              style={{
                ...tabButtonStyle,
                background: tabActivo === item.key ? "#1D4ED8" : "#EFF6FF",
                color: tabActivo === item.key ? "#FFFFFF" : "#1D4ED8",
                borderColor: tabActivo === item.key ? "#1D4ED8" : "#BFDBFE",
              }}
            >
              {item.label}
            </button>
          ))}
        </div>

        {tabActivo === "aprobar" ? (
          <div style={tabsRowStyle}>
            {etapasVisibles.map((item) => (
              <button
                key={item.estado}
                type="button"
                onClick={() => setEtapa(item.estado)}
                style={{
                  ...tabButtonStyle,
                  padding: "7px 14px",
                  fontSize: 13,
                  background: etapaActiva === item.estado ? "#0F766E" : "#F0FDFA",
                  color: etapaActiva === item.estado ? "#FFFFFF" : "#0F766E",
                  borderColor: etapaActiva === item.estado ? "#0F766E" : "#99F6E4",
                }}
              >
                {item.label}
                {conteoEtapas[item.estado] !== undefined ? ` (${conteoEtapas[item.estado]})` : ""}
              </button>
            ))}
          </div>
        ) : null}

        {error ? <div style={errorBannerStyle}>{error}</div> : null}

        {esIngreso ? (
          <div style={{ display: "grid", gap: 16 }}>
            <AppSectionHeader
              title="Registro de descanso médico"
              description="Se registra un día por cada fecha del rango y se adjunta el documento sustento (certificado)."
            />

            <div style={fieldsGridStyle}>
              <label style={fieldBlockStyle}>
                <span style={labelStyle}>Empleado</span>
                <input
                  type="text"
                  list="descanso-empleados"
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
                <datalist id="descanso-empleados">
                  {empleados.map((item) => (
                    <option key={item.idEmpleado} value={item.nombreEmpleado ?? ""} />
                  ))}
                </datalist>
              </label>

              <label style={fieldBlockStyle}>
                <span style={labelStyle}>Fecha inicio</span>
                <input type="date" value={fechaInicio} onChange={(event) => setFechaInicio(event.target.value)} style={inputStyle} />
              </label>

              <label style={fieldBlockStyle}>
                <span style={labelStyle}>Fecha fin</span>
                <input type="date" value={fechaFin} min={fechaInicio || undefined} onChange={(event) => setFechaFin(event.target.value)} style={inputStyle} />
                {fechaInicio && fechaFin && fechaFin < fechaInicio ? (
                  <span style={fieldErrorStyle}>La fecha fin no puede ser menor que la fecha inicio.</span>
                ) : null}
              </label>

              <label style={fieldBlockStyle}>
                <span style={labelStyle}>Documento sustento</span>
                <input
                  ref={archivoInputRef}
                  type="file"
                  accept=".jpg,.jpeg,.png,.bmp,.webp,.pdf"
                  onChange={(event) => setArchivo(event.target.files?.[0] ?? null)}
                  style={{ ...inputStyle, padding: "9px 12px" }}
                />
              </label>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
              {puedeGrabar ? (
                <button type="button" onClick={() => void grabar()} disabled={Boolean(procesando)} style={botonStyle("#1D4ED8", "#FFFFFF", "#1D4ED8", Boolean(procesando))}>
                  Grabar descanso
                </button>
              ) : null}
              {dias > 0 ? <span style={{ fontSize: 13, color: "#475569" }}>{dias} día(s) calendario</span> : null}
            </div>

            <DataGridBase
              columns={columnasIngreso}
              rows={descansos}
              loading={descansosLoading}
              loadingMessage="Cargando descansos..."
              emptyMessage={idEmpleado ? "El empleado no tiene descansos registrados." : "Seleccione un empleado para ver sus descansos."}
              getRowKey={claveSolicitud}
            />
          </div>
        ) : (
          <div style={gridFillWrapStyle}>
            <DataGridPro<Descanso>
              dataSource={descansos}
              columns={columnasPro}
              keyExpr={claveSolicitud}
              height="fill"
              loading={descansosLoading}
              noDataText={tabActivo === "aprobar" ? "No hay solicitudes en esta etapa." : tabActivo === "pendientes" ? "No tiene solicitudes pendientes por validar." : "No se encontraron descansos."}
              showFilterRow
              showSearchPanel
              showGroupPanel
              allowColumnResizing
              allowExport
              exportFileName={esAprobacion ? "Descanso_medico_pendientes" : "Descanso_medico"}
              paging={{ pageSize: 25 }}
              stateStoringKey={`descanso_${tabActivo}`}
              selection={esAprobacion ? "multiple" : "none"}
              selectedKeys={esAprobacion ? [...seleccionados] : undefined}
              onSelectionChanged={esAprobacion ? (keys) => setSeleccionados(new Set(keys)) : undefined}
              selectionDisabled={Boolean(procesando)}
              summary={{ totalItems: [{ column: "dias", type: "sum", label: "Días" }] }}
            />
          </div>
        )}
      </div>

      <ConfirmDialog
        open={accionPendiente !== null}
        title={accionPendiente === "aprobar" ? "Aprobar solicitudes" : "Rechazar solicitudes"}
        message={
          <div style={{ display: "grid", gap: 8 }}>
            <span>
              {accionPendiente === "aprobar"
                ? `¿Está seguro de APROBAR ${seleccionados.size} solicitud(es)?${tabActivo === "aprobar" && etapaActiva === ESTADO_DESCANSO.CUARTA ? " Es la aprobación final: se enviará el PDF por correo." : ""}`
                : `¿Está seguro de RECHAZAR ${seleccionados.size} solicitud(es)?`}
            </span>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "#475569" }}>
              {descansos
                .filter((item) => seleccionados.has(claveSolicitud(item)))
                .slice(0, 5)
                .map((item) => (
                  <li key={claveSolicitud(item)}>
                    {item.nombreEmpleado || `Empleado ${item.idEmpleadoCj}`} · {formatFecha(item.fechaInicio)} al {formatFecha(item.fechaFin)}
                  </li>
                ))}
              {seleccionados.size > 5 ? <li>y {seleccionados.size - 5} más...</li> : null}
            </ul>
            {accionPendiente === "rechazar" ? motivoField : null}
          </div>
        }
        confirmLabel={accionPendiente === "aprobar" ? "Aprobar" : "Rechazar"}
        destructive={accionPendiente === "rechazar"}
        confirmDisabled={accionPendiente === "rechazar" && !motivoRechazo.trim()}
        onConfirm={() => accionPendiente && void ejecutarSeleccion(accionPendiente)}
        onCancel={() => setAccionPendiente(null)}
      />

      <ConfirmDialog
        open={rechazoFila !== null}
        title="Rechazar solicitud"
        message={
          rechazoFila ? (
            <div style={{ display: "grid", gap: 8 }}>
              <span>
                {`¿Está seguro de RECHAZAR el descanso de ${rechazoFila.nombreEmpleado || `empleado ${rechazoFila.idEmpleadoCj}`} del ${formatFecha(rechazoFila.fechaInicio)} al ${formatFecha(rechazoFila.fechaFin)}?`}
              </span>
              {motivoField}
            </div>
          ) : (
            ""
          )
        }
        confirmLabel="Rechazar"
        destructive
        confirmDisabled={!motivoRechazo.trim()}
        onConfirm={() => rechazoFila && void rechazarFila(rechazoFila)}
        onCancel={() => setRechazoFila(null)}
      />

      <input
        ref={anexoInputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.bmp,.webp,.pdf"
        style={{ display: "none" }}
        onChange={(event) => void subirAnexo(event.target.files?.[0] ?? null)}
      />

      {procesando ? (
        <div style={overlayStyle} role="status" aria-live="polite">
          <style>{"@keyframes descansoSpin { to { transform: rotate(360deg); } }"}</style>
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

const gridFillWrapStyle: React.CSSProperties = { flex: 1, minHeight: 0, display: "flex", flexDirection: "column" };

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
  animation: "descansoSpin 0.8s linear infinite",
};
