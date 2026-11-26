import { useCallback, useEffect, useMemo, useState } from "react";
import ConfirmDialog from "../../../../../components/base/ConfirmDialog";
import DataGridPro from "../../../../../components/datagrid/DataGridPro";
import type { GridColumn } from "../../../../../components/datagrid/types";
import { FiltroOperativoLookup } from "../../../../../components/lookups/FiltroOperativoLookup";
import { actualizarLineaCampo, actualizarLineaCierre, cambiarEstadoCierre, consultarCampo, grabarCampo } from "../../../../../api/logisticaEquiposService";
import type { FiltroOperativoValue } from "../../../../../models/filtroOperativo";
import type { CampoLinea } from "../../../../../models/logisticaEquipos";
import { getHttpErrorMessage } from "../../../../../utils/httpError";
import { abrirAdjunto, esCodigoLegacy } from "../../../../../utils/adjuntos";
import { getConstantesPorCampo } from "../../../../../api/constantesService";
import { ingresoStyles as styles } from "../ingreso/ingresoComun";

/** Fila de la grilla: la línea del servidor más lo que el usuario edita. */
type FilaCampo = CampoLinea & {
  clave: string;
  /** Cantidad conforme (por defecto, la enviada). */
  cantConforme: number;
  /** Estado elegido: vacío = 14 (x cruzar), 10 = observada. */
  estadoNuevo: number | null;
  obs: string;
};

/** Estado 6 (rechazado): la línea no admite cambio de estado. */
const ESTADO_RECHAZADO = 6;

/** Estados de ESTADO_LOG que muestra esta pestaña. */
const ESTADOS_CAMPO = [10, 14, 19];

/**
 * Fondo de cada línea según su IdEstado (ESTADO_LOG): un color pastel distinto por estado.
 * 14 (x Cruzar) va en blanco; un estado que no esté aquí se deja sin color.
 */
const FONDO_POR_ESTADO: Record<number, string> = {
  0: "#F3F4F6", // gris claro
  1: "#E0F2FE", // celeste
  2: "#DCFCE7", // verde
  3: "#FEF9C3", // amarillo
  4: "#ECFCCB", // lima
  5: "#CCFBF1", // turquesa
  6: "#FFE4E9", // rosado leve
  7: "#FFC9B3", // salmón
  8: "#FFEDD5", // durazno
  9: "#EDE9FE", // lavanda
  10: "#FDE68A", // ámbar
  11: "#DBEAFE", // azul claro
  14: "#FFFFFF", // blanco (x Cruzar)
  15: "#FCE7F3", // rosa claro
  16: "#E0E7FF", // índigo claro
  17: "#FEF3C7", // arena
  19: "#D1FAE5", // menta
  20: "#BBF7D0", // verde suave
  21: "#FBCFE8", // fucsia claro
  22: "#E9D5FF", // violeta claro
  23: "#BAE6FD", // azul cielo
  24: "#FDBA74", // naranja claro
  25: "#C7D2FE", // azul lavanda
  28: "#A7F3D0", // verde agua
};

const hoyIso = () => new Date().toISOString().slice(0, 10);
const fechaCorta = (valor: unknown) => String(valor ?? "").slice(0, 10);
const aFila = (l: CampoLinea): FilaCampo => ({
  ...l,
  clave: `${l.nroSolicitud}|${l.posicion}`,
  cantConforme: l.cantSap,
  estadoNuevo: null,
  obs: l.observacion ?? "",
});

/**
 * Pestaña "x Campo": conformidad de lo enviado a campo (estado 11 → 14 x cruzar, o 10 observada).
 * `modo` define la pestaña:
 *  - "campo": líneas pendientes (estado 11), con edición y conformidad.
 *  - "observadas": líneas en estado 10, solo consulta.
 *  - "reporte": líneas de TODAS las solicitudes sin importar su estado, solo consulta; no se carga nada hasta aplicar filtros.
 */
export type ModoCampoTab = "campo" | "observadas" | "reporte";

export default function CampoTab({
  modo = "campo",
  solicitudInicial = "",
  estados,
  porSolicitud,
  soloEquipos,
  cambioEstado,
  mostrarMontoEnvio = false,
  etapa,
}: {
  modo?: ModoCampoTab;
  solicitudInicial?: string;
  /** Estados a consultar, separados por comas (página Cierre: "14", "21,7,22,23,24,25", "16,22,23,25"). Solo consulta. */
  estados?: string;
  /** Como el sistema antiguo: trae todas las líneas de las solicitudes que tengan al menos una línea en `estados`. */
  porSolicitud?: boolean;
  /** Solo materiales con código 10 o 40 (x Foliar). */
  soloEquipos?: boolean;
  /**
   * Página Cierre: habilita la columna Estado (y Cant. conforme) para cambiar el estado de una línea.
   * `origen` = estados desde los que se puede cambiar (el resto de líneas de la solicitud solo se ven); `destino` = estados a elegir;
   * `porDefecto` = estado que se aplica a las líneas marcadas a las que no se les eligió ninguno (botón Grabar estado).
   */
  cambioEstado?: {
    origen: number[];
    destino: number[];
    /** Estado por defecto de una línea según su código de material. */
    porDefecto: (codPap: string | null | undefined) => number;
    /** Estados que puede devolver `porDefecto` (para mostrar sus nombres) y una nota que explica cuándo aplica cada uno. */
    porDefectoPosibles: number[];
    notaPorDefecto?: string;
  };
  /** Muestra la columna "Monto envío" (DetSolicitud.MontoEnvio): x Cerrar y x Foliar. */
  mostrarMontoEnvio?: boolean;
  /** Nombre de la etapa (p. ej. "x Cruzar") para los textos de la pestaña cuando se usa `estados`. */
  etapa?: string;
}) {
  const soloObservadas = modo === "observadas";
  const esReporte = modo === "reporte";
  const porEstados = !!estados;
  const soloConsulta = modo !== "campo" || porEstados;
  // Página Cierre con cambio de estado: solo Estado, Cant. conforme, Observación y Serie son editables (serie y observación se guardan al instante en DetSolicitud).
  const editaCierre = !!cambioEstado;
  // 10 = observadas; -1 = todos los estados (reporte); vacío = 11 (x Campo).
  const idEstadoConsulta = soloObservadas ? 10 : esReporte ? -1 : undefined;
  // Estados: sp_Constante_ListarPorCampo @Campo='ESTADO_LOG', solo los códigos de esta pestaña.
  const [estadosCampo, setEstadosCampo] = useState<{ value: number; label: string }[]>([]);
  // Nombre (ValorFin) de cualquier estado, para los mensajes (p. ej. el estado por defecto, que no está en la lista a elegir).
  const [nombresEstado, setNombresEstado] = useState<Record<number, string>>({});
  useEffect(() => {
    let cancelled = false;
    getConstantesPorCampo("ESTADO_LOG")
      .then((data) => {
        if (cancelled) return;
        const todos = data.map((c) => ({
          value: Number(c.correlativo ?? c.codigo),
          // Página Cierre: el nombre es Constante.ValorFin (el de la columna "Est. actual"); se muestra como "código - ValorFin".
          label: ((cambioEstado ? c.valorFin || c.valorIni : c.valorIni) ?? c.descripcion ?? "").trim(),
        }));
        setNombresEstado(Object.fromEntries(todos.map((o) => [o.value, o.label])));
        const opciones = todos
          .filter((o) => (cambioEstado ? cambioEstado.destino.includes(o.value) : ESTADOS_CAMPO.includes(o.value)))
          .map((o) => ({ ...o, label: `${o.value} - ${o.label}` }))
          .sort((a, b) => a.value - b.value);
        setEstadosCampo(opciones);
      })
      .catch(() => {
        if (!cancelled) setEstadosCampo([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  // Con `solicitudInicial` (por ejemplo, desde el Dashboard) se abre con ese documento ya filtrado.
  const [usaSolicitudes, setUsaSolicitudes] = useState(solicitudInicial !== "");
  const [solicitudes, setSolicitudes] = useState(solicitudInicial);
  const [usaFecha, setUsaFecha] = useState(false);
  const [fechaIni, setFechaIni] = useState(hoyIso());
  const [fechaFin, setFechaFin] = useState(hoyIso());
  const [usaRelacion, setUsaRelacion] = useState(false);
  const [relacion, setRelacion] = useState<FiltroOperativoValue>({});

  const [filas, setFilas] = useState<FilaCampo[]>([]);
  const [seleccion, setSeleccion] = useState<string[]>([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [confirmar, setConfirmar] = useState(false);
  const [confirmaCant, setConfirmaCant] = useState<{ clave: string; anterior: number; nueva: number } | null>(null);
  const [pideObs, setPideObs] = useState<{ clave: string; idEstado: number } | null>(null);
  const [obsTexto, setObsTexto] = useState("");

  const buscar = useCallback(async () => {
    const f = usaRelacion ? relacion.filtro : undefined;
    if (usaRelacion && !f) {
      setError("Seleccione la relación cliente-proyecto-site.");
      return;
    }
    if (esReporte && !usaSolicitudes && !usaFecha && !usaRelacion) {
      setError("Active al menos un filtro (Solicitud(es), Fecha de creación o Cliente-proyecto-site) y pulse Buscar.");
      return;
    }
    setCargando(true);
    setError("");
    try {
      const data = await consultarCampo({
        solicitudes: usaSolicitudes ? solicitudes.trim() : undefined,
        fechaIni: usaFecha ? fechaIni : undefined,
        fechaFin: usaFecha ? fechaFin : undefined,
        idCliente: f?.idCliente,
        idProyecto: f?.idProyecto,
        idSite: f?.idSite,
        correSite: f?.correlativo,
        idEstado: idEstadoConsulta,
        estados,
        porSolicitud,
        soloEquipos,
      });
      setFilas(data.map(aFila));
      setSeleccion([]);
    } catch (err) {
      setError(getHttpErrorMessage(err, "No se pudo consultar."));
    } finally {
      setCargando(false);
    }
  }, [usaSolicitudes, solicitudes, usaFecha, fechaIni, fechaFin, usaRelacion, relacion, idEstadoConsulta, esReporte]);

  // Como en el formulario antiguo, al abrir la pestaña se cargan las líneas pendientes.
  useEffect(() => {
    // Reporte: no se carga nada al abrir; solo se muestra lo que piden los filtros al pulsar Buscar.
    if (esReporte) {
      setCargando(false);
      return;
    }
    let cancelled = false;
    consultarCampo({ idEstado: idEstadoConsulta, solicitudes: solicitudInicial || undefined, estados, porSolicitud, soloEquipos })
      .then((data) => {
        if (cancelled) return;
        setFilas(data.map(aFila));
      })
      .catch((err) => {
        if (!cancelled) setError(getHttpErrorMessage(err, "No se pudo consultar."));
      })
      .finally(() => {
        if (!cancelled) setCargando(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Una línea con estado o cantidad distinta a la enviada se considera marcada (como en el formulario antiguo).
  const claves = useMemo(() => {
    const marcadas = new Set(seleccion);
    filas.forEach((f) => {
      if (f.estadoNuevo || f.cantConforme !== f.cantSap) marcadas.add(f.clave);
    });
    return marcadas;
  }, [filas, seleccion]);

  const marcadas = useMemo(() => filas.filter((f) => claves.has(f.clave)), [filas, claves]);
  const esObservada = (f: FilaCampo) => f.estadoNuevo === 10 || f.cantConforme !== f.cantSap;

  // Página Cierre: líneas marcadas que se pueden procesar (en el estado de la etapa y no rechazadas); las demás solo se ven.
  const elegiblesCierre = useMemo(
    () => (cambioEstado ? marcadas.filter((f) => cambioEstado.origen.includes(f.idEstado) && f.idEstado !== ESTADO_RECHAZADO) : []),
    [marcadas, cambioEstado],
  );
  const etiquetaDefecto = cambioEstado
    ? cambioEstado.porDefectoPosibles.map((e) => `${e}${nombresEstado[e] ? ` - ${nombresEstado[e]}` : ""}`).join(" o ") +
      (cambioEstado.notaPorDefecto ? ` (${cambioEstado.notaPorDefecto})` : "")
    : "";

  const pedirConfirmacionCierre = () => {
    if (!cambioEstado) return;
    setError("");
    setMensaje("");
    if (marcadas.length === 0) return setError("No existen registros seleccionados.");
    if (elegiblesCierre.length === 0) {
      return setError(`Ningún registro seleccionado está en estado ${cambioEstado.origen.join(", ")}; los demás solo se muestran.`);
    }
    const invalida = elegiblesCierre.find((f) => !Number.isFinite(f.cantConforme) || f.cantConforme < 0 || f.cantConforme > f.cantSap);
    if (invalida) return setError(`Solicitud ${invalida.nroSolicitud}, posición ${invalida.posicion}: la cantidad conforme debe estar entre 0 y ${invalida.cantSap}.`);
    const sinObs = elegiblesCierre.find((f) => {
      const estado = f.estadoNuevo ?? cambioEstado.porDefecto(f.codPap);
      return (estado === 10 || estado === 17 || f.cantConforme !== f.cantSap) && !f.obs.trim();
    });
    if (sinObs) {
      return setError(
        `Solicitud ${sinObs.nroSolicitud}, posición ${sinObs.posicion}: la observación es obligatoria para observar, dejar excedente o con cantidad conforme menor.`,
      );
    }
    setConfirmar(true);
  };

  /** Cambia el estado de cada línea elegible: el elegido en la columna Estado o, si está vacío, el estado por defecto de la pestaña. */
  const ejecutarCierre = async () => {
    if (!cambioEstado) return;
    setConfirmar(false);
    setGuardando(true);
    let hechas = 0;
    try {
      for (const f of elegiblesCierre) {
        await cambiarEstadoCierre({
          nroSolicitud: f.nroSolicitud,
          posicion: f.posicion,
          correlativo: f.correlativo,
          idEstado: f.estadoNuevo ?? cambioEstado.porDefecto(f.codPap),
          cantidad: f.cantConforme,
          observacion: f.obs.trim() || undefined,
        });
        hechas += 1;
      }
      setMensaje(`Datos actualizados: ${hechas} registro(s).`);
    } catch (err) {
      setError(`${getHttpErrorMessage(err, "No se pudo cambiar el estado.")} Se procesaron ${hechas} de ${elegiblesCierre.length} registro(s).`);
    } finally {
      setSeleccion([]);
      setGuardando(false);
      await buscar();
    }
  };

  const pedirConfirmacion = () => {
    if (cambioEstado) return pedirConfirmacionCierre();
    setError("");
    setMensaje("");
    if (marcadas.length === 0) return setError("No existen registros seleccionados.");
    const invalida = marcadas.find((f) => !Number.isFinite(f.cantConforme) || f.cantConforme < 0 || f.cantConforme > f.cantSap);
    if (invalida) return setError(`Solicitud ${invalida.nroSolicitud}, posición ${invalida.posicion}: la cantidad conforme debe estar entre 0 y ${invalida.cantSap}.`);
    const sinObs = marcadas.find((f) => esObservada(f) && !f.obs.trim());
    if (sinObs) return setError("Hay registros con estado OBSERVADA (o cantidad distinta) y no tienen detalle en Observación.");
    setConfirmar(true);
  };

  /** Guarda la cantidad real (DetSolicitud.CantSap) ya confirmada; la conforme pasa a ser la nueva (sin diferencia). */
  const grabarCantidadReal = async (clave: string, nueva: number) => {
    const fila = filas.find((f) => f.clave === clave);
    if (!fila) return;
    setError("");
    setMensaje("");
    setGuardando(true);
    try {
      await actualizarLineaCampo({ nroSolicitud: fila.nroSolicitud, posicion: fila.posicion, correlativo: fila.correlativo, campos: ["cantsap"], cantSap: nueva });
      actualizar(clave, { cantSap: nueva, cantConforme: nueva });
      setMensaje(`Solicitud ${fila.nroSolicitud}, posición ${fila.posicion}: cantidad real modificada de ${fila.cantSap} a ${nueva}.`);
    } catch (err) {
      setError(getHttpErrorMessage(err, "No se pudo guardar la cantidad real."));
    } finally {
      setGuardando(false);
    }
  };

  /** Ejecuta el flujo de conformidad de UNA línea con el estado elegido; la observación viaja en la misma llamada. */
  const grabarEstado = async (fila: FilaCampo, idEstado: number, obs: string) => {
    if (!Number.isFinite(fila.cantConforme) || fila.cantConforme < 0 || fila.cantConforme > fila.cantSap) {
      actualizar(fila.clave, { estadoNuevo: null });
      return setError(`La cantidad conforme debe estar entre 0 y ${fila.cantSap}.`);
    }
    setGuardando(true);
    if (cambioEstado) {
      // Página Cierre: cambia estado + stock + kardex; si la cantidad conforme es menor, la diferencia queda en una línea nueva (17).
      try {
        await cambiarEstadoCierre({
          nroSolicitud: fila.nroSolicitud,
          posicion: fila.posicion,
          correlativo: fila.correlativo,
          idEstado,
          cantidad: fila.cantConforme,
          observacion: obs || undefined,
        });
        const dif = fila.cantSap - fila.cantConforme;
        setMensaje(
          `Solicitud ${fila.nroSolicitud}, posición ${fila.posicion}: ${estadosCampo.find((e) => e.value === idEstado)?.label ?? idEstado}.` +
            (dif > 0 && fila.cantConforme > 0 ? ` La diferencia (${dif}) quedó como excedente (estado 17).` : ""),
        );
        setSeleccion([]);
        await buscar();
      } catch (err) {
        actualizar(fila.clave, { estadoNuevo: null });
        setError(getHttpErrorMessage(err, "No se pudo cambiar el estado."));
      } finally {
        setGuardando(false);
      }
      return;
    }
    try {
      await actualizarLineaCampo({
        nroSolicitud: fila.nroSolicitud,
        posicion: fila.posicion,
        correlativo: fila.correlativo,
        campos: obs ? ["observacion", "estado"] : ["estado"],
        idEstado,
        cantidad: fila.cantConforme,
        observacion: obs || undefined,
      });
      setFilas((actuales) => actuales.filter((f) => f.clave !== fila.clave));
      setSeleccion((actuales) => actuales.filter((k) => k !== fila.clave));
      setMensaje(`Solicitud ${fila.nroSolicitud}, posición ${fila.posicion}: ${estadosCampo.find((e) => e.value === idEstado)?.label ?? idEstado}.`);
    } catch (err) {
      actualizar(fila.clave, { estadoNuevo: null });
      setError(getHttpErrorMessage(err, "No se pudo grabar el estado."));
    } finally {
      setGuardando(false);
    }
  };

  /**
   * Guarda al instante lo editado en una celda (por nro. solicitud + posición + correlativo): observación y serie
   * se actualizan en la línea; el estado ejecuta el flujo completo de conformidad (stock, kardex, cabecera) y la
   * línea sale de la bandeja (pasa a 14 x cruzar o 10 observada).
   */
  const guardarCelda = async (clave: string, campo: "observacion" | "serie" | "nroguia" | "cantsap" | "estado" | "montoenvio", valor: string | number | null) => {
    const fila = filas.find((f) => f.clave === clave);
    if (!fila) return;
    setError("");
    setMensaje("");
    const base = { nroSolicitud: fila.nroSolicitud, posicion: fila.posicion, correlativo: fila.correlativo };

    if (campo === "estado") {
      if (valor === null) return actualizar(clave, { estadoNuevo: null });
      if (fila.idEstado === ESTADO_RECHAZADO) {
        actualizar(clave, { estadoNuevo: null });
        return setError(`Solicitud ${fila.nroSolicitud}, posición ${fila.posicion}: la línea está RECHAZADA (estado 6); no se puede cambiar su estado.`);
      }
      const idEstado = Number(valor);
      if (cambioEstado && !cambioEstado.origen.includes(fila.idEstado)) {
        // Las demás líneas de la solicitud solo se ven; el estado se cambia en las líneas de esta etapa.
        actualizar(clave, { estadoNuevo: null });
        return setError(
          `Solicitud ${fila.nroSolicitud}, posición ${fila.posicion}: está en ${fila.nomEstado ?? fila.idEstado}; en ${etapa ?? "esta pestaña"} solo se cambian las líneas en estado ${cambioEstado.origen.join(", ")}.`,
        );
      }
      if (cambioEstado) {
        // Página Cierre: el estado elegido queda pendiente (la fila se marca sola); se aplica con "Grabar estado".
        actualizar(clave, { estadoNuevo: idEstado });
        return;
      }
      const observada = idEstado === 10 || fila.cantConforme !== fila.cantSap;
      if (observada && !fila.obs.trim()) {
        // OBSERVADA exige detalle: se pide en un popup y, al aceptar, se graba junto con el estado.
        actualizar(clave, { estadoNuevo: null });
        setObsTexto("");
        setPideObs({ clave, idEstado });
        return;
      }
      await grabarEstado(fila, idEstado, fila.obs.trim());
      return;
    }

    if (campo === "cantsap") {
      // Cant. Real = DetSolicitud.CantSap: se guarda al instante; la cantidad conforme pasa a ser la nueva (sin diferencia).
      const nueva = Number(valor);
      if (valor === null || valor === "" || !Number.isFinite(nueva) || nueva < 0) {
        return setError(`Solicitud ${fila.nroSolicitud}, posición ${fila.posicion}: la cantidad real debe ser un número mayor o igual a 0 (admite decimales).`);
      }
      if (nueva === fila.cantSap) return;
      // Antes de guardar se pide confirmación mostrando el valor actual y el nuevo.
      setConfirmaCant({ clave, anterior: fila.cantSap, nueva });
      return;
    }

    if (campo === "montoenvio") {
      // Monto de envío (DetSolicitud.MontoEnvio, 2 decimales): se guarda al instante y queda auditado; vacío = 0.
      const nuevo = valor === null || valor === "" ? 0 : Number(valor);
      if (!Number.isFinite(nuevo) || nuevo < 0) {
        return setError(`Solicitud ${fila.nroSolicitud}, posición ${fila.posicion}: el monto de envío debe ser un número mayor o igual a 0.`);
      }
      const anteriorMonto = fila.montoEnvio ?? null;
      if (Math.round(nuevo * 100) === Math.round((anteriorMonto ?? 0) * 100)) return;
      actualizar(clave, { montoEnvio: nuevo });
      try {
        await actualizarLineaCierre({ ...base, campo: "montoenvio", valor: nuevo.toFixed(2) });
        setMensaje(`Solicitud ${fila.nroSolicitud}, posición ${fila.posicion}: monto de envío modificado a ${nuevo.toFixed(2)}.`);
      } catch (err) {
        actualizar(clave, { montoEnvio: anteriorMonto });
        setError(getHttpErrorMessage(err, "No se pudo guardar el monto de envío."));
      }
      return;
    }

    const texto = String(valor ?? "");
    const anterior = campo === "observacion" ? fila.obs : campo === "nroguia" ? String(fila.nroGuia ?? "") : String(fila.serie ?? "");
    if (texto === anterior) return;
    const cambio = (v: string): Partial<FilaCampo> => (campo === "observacion" ? { obs: v } : campo === "nroguia" ? { nroGuia: v } : { serie: v });
    actualizar(clave, cambio(texto));
    try {
      if (editaCierre && (campo === "serie" || campo === "observacion")) {
        // Página Cierre: serie y observación se guardan en DetSolicitud sin importar el estado de la línea.
        await actualizarLineaCierre({ ...base, campo, valor: texto.trim() });
        setMensaje(`Solicitud ${fila.nroSolicitud}, posición ${fila.posicion}: ${campo === "serie" ? "serie" : "observación"} ${texto.trim() ? "modificada" : "eliminada"}.`);
      } else {
        await actualizarLineaCampo({ ...base, campos: [campo], [campo === "nroguia" ? "nroGuia" : campo]: texto.trim() });
      }
      if (campo === "nroguia") {
        setMensaje(`Solicitud ${fila.nroSolicitud}, posición ${fila.posicion}: guía ${texto.trim() ? `modificada a ${texto.trim()}` : "eliminada"}.`);
      }
    } catch (err) {
      actualizar(clave, cambio(anterior));
      setError(getHttpErrorMessage(err, `No se pudo guardar ${campo === "serie" ? "la serie" : campo === "nroguia" ? "el número de guía" : "la observación"}.`));
    }
  };

  const ejecutar = async () => {
    if (cambioEstado) return ejecutarCierre();
    setConfirmar(false);
    setGuardando(true);
    try {
      const resultado = await grabarCampo(
        marcadas.map((f) => ({
          nroSolicitud: f.nroSolicitud,
          posicion: f.posicion,
          correlativo: f.correlativo,
          idEstado: f.estadoNuevo,
          cantidad: f.cantConforme,
          observacion: f.obs.trim() || undefined,
        })),
      );
      setMensaje(`Datos actualizados: ${resultado.procesadas} registro(s); ${resultado.conDiferencia} observado(s).`);
      await buscar();
    } catch (err) {
      setError(getHttpErrorMessage(err, "No se pudo grabar."));
    } finally {
      setGuardando(false);
    }
  };

  const actualizar = (clave: string, cambios: Partial<FilaCampo>) =>
    setFilas((actuales) => actuales.map((f) => (f.clave === clave ? { ...f, ...cambios } : f)));

  /**
   * Botón que abre la imagen de la línea. Regla de adjuntos del sistema: un código numérico está en el servidor antiguo
   * (se descarga por la API y se abre); cualquier otra ruta o URL es de SharePoint.
   */
  const botonImagen = (titulo: string) => (valor: unknown) => {
    const ruta = String(valor ?? "").trim();
    if (!ruta) return <span style={{ color: "#CBD5E1" }}>—</span>;
    return (
      <button
        type="button"
        title={`${titulo} (${esCodigoLegacy(ruta) ? "servidor antiguo" : "SharePoint"})`}
        onClick={(e) => {
          e.stopPropagation();
          setError("");
          void abrirAdjunto(ruta).catch((err) => setError(getHttpErrorMessage(err, `No se pudo abrir: ${titulo.toLowerCase()}.`)));
        }}
        style={{ border: "1px solid #1F6F8B", background: "#FFFFFF", color: "#1F6F8B", borderRadius: 6, padding: "1px 10px", fontSize: 11, fontWeight: 600, cursor: "pointer" }}
      >
        Ver
      </button>
    );
  };

  const columnasBase = useMemo<GridColumn<FilaCampo>[]>(
    () => [
      { dataField: "nroSolicitud", caption: "Nro. solicitud", width: 110, fixed: true },
      { dataField: "posicion", caption: "Pos.", width: 60, fixed: true, placeAfter: "nroSolicitud" },
      { dataField: "estadoNuevo", caption: "Estado", width: 160, fixed: true, allowEditing: true, lookup: estadosCampo, cellStyle: (v) => (v ? { fontWeight: 700, color: "#1F6F8B" } : { color: "#94A3B8" }) },
      { dataField: "codPap", caption: "Código", width: 110 },
      { dataField: "nombreMaterial", caption: "Material", width: 300 },
      { dataField: "unidadMedida", caption: "UM", width: 60 },
      { dataField: "cantConforme", caption: "Cant. conforme", dataType: "number", width: 110, allowEditing: false },
      { dataField: "cantSap", caption: "Cant. Real", dataType: "number", width: 100, allowEditing: true },
      { dataField: "serie", caption: "Serie", width: 140, allowEditing: true },
      { dataField: "pedidoSap", caption: "Pedido SAP", width: 120, placeAfter: "serie" },
      { dataField: "nroGuia", caption: "Nro. guía", width: 130, allowEditing: true, placeAfter: "pedidoSap" },
      ...(mostrarMontoEnvio
        ? [{ dataField: "montoEnvio", caption: "Monto envío", dataType: "number" as const, width: 110, allowEditing: true, placeAfter: "nroGuia", format: { type: "fixedPoint" as const, precision: 2 } }]
        : []),
      { dataField: "rutaImagen", caption: "Imagen", width: 80, alignment: "center", placeAfter: "nroGuia", allowFiltering: false, allowSorting: false, cellRender: botonImagen("Imagen") },
      { dataField: "imagenEnvio", caption: "Imagen envío", width: 100, alignment: "center", placeAfter: "nroGuia", allowFiltering: false, allowSorting: false, cellRender: botonImagen("Imagen de envío") },
      { dataField: "obs", caption: "Observación", width: 240, allowEditing: true, placeAfter: "imagenEnvio" },
      { dataField: "nombreCliente", caption: "Cliente", width: 160 },
      { dataField: "nombreProyecto", caption: "Proyecto", width: 180, groupIndex: 0 },
      { dataField: "idSite", caption: "Site", width: 90 },
      { dataField: "nombreSite", caption: "Desc. site", width: 200, groupIndex: 1 },
      { dataField: "tipoTrabajo", caption: "Trabajo", width: 140 },
      { dataField: "nomEstado", caption: "Est. actual", width: 120 },
      { dataField: "fechaCreacion", caption: "Fecha", width: 100, calculateCellValue: (r) => fechaCorta(r.fechaCreacion) },
    ],
    [estadosCampo, mostrarMontoEnvio],
  );

  // DataGridPro deja editable toda columna sin allowEditing:false: aquí se editan Estado, Observación, Serie, Nro. guía y Cant. Real.
  // En Observadas (solo consulta) no hay edición ni las columnas de la conformidad (Estado a elegir y Cant. conforme).
  const columnas = useMemo<GridColumn<FilaCampo>[]>(
    () =>
      columnasBase
        .filter((c) => !soloConsulta || editaCierre || (c.dataField !== "estadoNuevo" && c.dataField !== "cantConforme"))
        .map((c) => ({
          ...c,
          allowEditing: editaCierre
            ? c.dataField === "estadoNuevo" || c.dataField === "cantConforme" || c.dataField === "obs" || c.dataField === "serie" || c.dataField === "montoEnvio"
            : !soloConsulta && (c.dataField === "estadoNuevo" || c.dataField === "obs" || c.dataField === "serie" || c.dataField === "nroGuia" || c.dataField === "cantSap"),
        })),
    [columnasBase, soloConsulta, editaCierre],
  );

  return (
    <div style={styles.root}>
      <div style={styles.panel}>
        <label style={styles.check}>
          <input type="checkbox" checked={usaSolicitudes} onChange={(e) => setUsaSolicitudes(e.target.checked)} />
          Solicitud(es)
        </label>
        <input
          value={solicitudes}
          disabled={!usaSolicitudes}
          onChange={(e) => setSolicitudes(e.target.value)}
          placeholder="Ej.: 1001, 1002"
          style={{ ...styles.input, width: 160 }}
        />
        <label style={styles.check}>
          <input type="checkbox" checked={usaFecha} onChange={(e) => setUsaFecha(e.target.checked)} />
          Fecha de creación
        </label>
        <input type="date" value={fechaIni} disabled={!usaFecha} onChange={(e) => setFechaIni(e.target.value)} style={styles.input} />
        <input type="date" value={fechaFin} disabled={!usaFecha} onChange={(e) => setFechaFin(e.target.value)} style={styles.input} />
      </div>

      <div style={styles.panel}>
        <label style={styles.check}>
          <input type="checkbox" checked={usaRelacion} onChange={(e) => setUsaRelacion(e.target.checked)} />
          Cliente-proyecto-site
        </label>
        <div style={{ flex: 1, minWidth: 320, opacity: usaRelacion ? 1 : 0.5, pointerEvents: usaRelacion ? "auto" : "none" }}>
          <FiltroOperativoLookup value={relacion} onChange={setRelacion} showTrabajo={false} showOt={false} showTarea={false} />
        </div>
        <button type="button" onClick={() => void buscar()} disabled={cargando} style={styles.secondary}>
          {cargando ? "Buscando…" : "Buscar"}
        </button>
        {soloConsulta && !editaCierre ? null : (
          <button type="button" onClick={pedirConfirmacion} disabled={guardando || cargando} style={styles.primary}>
            {guardando ? "Grabando…" : editaCierre ? "Grabar estado" : "Grabar conformidad"}
          </button>
        )}
      </div>

      <div style={styles.toolbar}>
        <span style={styles.resumen}>
          {porEstados
            ? `Son: ${filas.length} línea(s) en ${etapa ?? "estados " + estados}. Marcados: ${claves.size}.` +
              (cambioEstado ? ` Sin estado elegido pasa a ${etiquetaDefecto}.` : "")
            : esReporte
            ? `Son: ${filas.length} línea(s), de cualquier estado, según los filtros aplicados. Marcados: ${claves.size}.`
            : soloObservadas
              ? `Son: ${filas.length} línea(s) observada(s) (estado 10). Marcados: ${claves.size}.`
              : `Son: ${filas.length}. Marcados: ${claves.size}. Si cambia la cantidad conforme o elige OBSERVADA, indique la observación.`}
        </span>
      </div>

      {error ? <div role="alert" style={styles.error}>{error}</div> : null}
      {mensaje ? <div role="status" style={styles.ok}>{mensaje}</div> : null}

      <div style={styles.gridHost}>
        <DataGridPro<FilaCampo>
          dataSource={filas}
          columns={columnas}
          keyExpr="clave"
          height="fill"
          loading={cargando}
          noDataText={porEstados ? `No hay líneas en ${etapa ?? "estos estados"}.` : esReporte ? "Active un filtro y pulse Buscar para ver el reporte." : soloObservadas ? "No hay líneas observadas." : "No hay líneas pendientes de conformidad en campo."}
          stateStoringKey={porEstados ? `logistica-cierre-${estados}-v1` : esReporte ? "logistica-reporte-v1" : soloObservadas ? "logistica-observadas-v1" : "logistica-campo-v4"}
          selection="multiple"
          selectedKeys={Array.from(claves)}
          selectionDisabled={guardando}
          onSelectionChanged={(keys) => {
            setSeleccion(keys);
            // Al desmarcar una línea se descartan los cambios que se le habían hecho.
            setFilas((actuales) =>
              actuales.map((f) =>
                !keys.includes(f.clave) && (f.estadoNuevo || f.cantConforme !== f.cantSap)
                  ? { ...f, estadoNuevo: null, cantConforme: f.cantSap }
                  : f,
              ),
            );
          }}
          editing={{
            allowUpdating: !soloConsulta || editaCierre,
            editOnClick: true,
            // Línea rechazada (estado 6): no se puede cambiar su estado ni su cantidad conforme.
            canEditCell: (row, field) => !(row.idEstado === ESTADO_RECHAZADO && (field === "estadoNuevo" || field === "cantConforme")),
            onCellChanged: ({ key, field, value }) => {
              if (field === "estadoNuevo") void guardarCelda(String(key), "estado", value === "" || value === null ? null : Number(value));
              else if (field === "cantConforme") actualizar(String(key), { cantConforme: Number(value) });
              else if (field === "obs") void guardarCelda(String(key), "observacion", String(value ?? ""));
              else if (field === "serie") void guardarCelda(String(key), "serie", String(value ?? ""));
              else if (field === "cantSap") void guardarCelda(String(key), "cantsap", value === "" || value === null ? null : Number(value));
              else if (field === "nroGuia") void guardarCelda(String(key), "nroguia", String(value ?? ""));
              else if (field === "montoEnvio") void guardarCelda(String(key), "montoenvio", value === "" || value === null || value === undefined ? null : Number(value));
            },
          }}
          rowStyle={(f) => ({
            ...(FONDO_POR_ESTADO[f.idEstado] ? { background: FONDO_POR_ESTADO[f.idEstado] } : null),
            ...(esObservada(f) && claves.has(f.clave) ? { color: "#B45309", fontWeight: 600 } : null),
          })}
          showSearchPanel={false}
          allowExport
          exportFileName={porEstados ? `logistica_${(etapa ?? "cierre").replace(/\s+/g, "_").toLowerCase()}` : esReporte ? "logistica_reporte" : soloObservadas ? "logistica_observadas" : "logistica_campo"}
          rowAlternation={false}
          rowPadding="3px 8px"
          paging={{ pageSize: 100, pageSizes: [50, 100, 250, 500] }}
        />
      </div>

      <ConfirmDialog
        open={confirmaCant !== null}
        title="Modificar cantidad real"
        message={
          confirmaCant ? (
            <>
              <div>¿Desea modificar la cantidad real?</div>
              <div style={{ marginTop: 10 }}>
                Valor actual: <strong>{confirmaCant.anterior}</strong>
              </div>
              <div>
                Valor nuevo: <strong>{confirmaCant.nueva}</strong>
              </div>
            </>
          ) : null
        }
        confirmLabel="Modificar"
        confirmDisabled={guardando}
        onConfirm={() => {
          const c = confirmaCant;
          setConfirmaCant(null);
          if (c) void grabarCantidadReal(c.clave, c.nueva);
        }}
        onCancel={() => setConfirmaCant(null)}
      />

      <ConfirmDialog
        open={pideObs !== null}
        title="Observación requerida"
        message={
          <>
            <div>
              {cambioEstado
                ? "Indique el detalle de la observación (obligatoria para observar, dejar excedente o con cantidad conforme menor)."
                : "Indique el detalle de la observación para registrar la línea como OBSERVADA."}
            </div>
            <textarea
              autoFocus
              value={obsTexto}
              onChange={(e) => setObsTexto(e.target.value)}
              maxLength={500}
              rows={4}
              style={{ width: "100%", marginTop: 10, padding: 8, borderRadius: 8, border: "1px solid #CBD5E1", fontFamily: "inherit", fontSize: 14, boxSizing: "border-box" }}
            />
          </>
        }
        confirmLabel="Grabar"
        confirmDisabled={!obsTexto.trim() || guardando}
        onConfirm={() => {
          const pedido = pideObs;
          const fila = pedido ? filas.find((f) => f.clave === pedido.clave) : undefined;
          setPideObs(null);
          if (pedido && fila) void grabarEstado(fila, pedido.idEstado, obsTexto.trim());
        }}
        onCancel={() => setPideObs(null)}
      />

      <ConfirmDialog
        open={confirmar}
        title="Confirmar"
        message={
          cambioEstado
            ? `¿Desea cambiar el estado de ${elegiblesCierre.length} registro(s)? Los que no tienen estado elegido pasan a ${etiquetaDefecto}.` +
              (marcadas.length > elegiblesCierre.length ? ` (${marcadas.length - elegiblesCierre.length} marcado(s) se omiten por no estar en el estado de esta pestaña.)` : "")
            : `¿Desea dar CONFORMIDAD a los ${marcadas.length} registro(s) seleccionado(s)?`
        }
        confirmLabel="Grabar"
        onConfirm={() => void ejecutar()}
        onCancel={() => setConfirmar(false)}
      />
    </div>
  );
}
