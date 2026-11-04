import { memo, useId, useMemo, useState, type CSSProperties } from "react";

export type OpcionBuscable = { id: string; etiqueta: string };

type CampoBuscableProps = {
  opciones: OpcionBuscable[];
  /** Id elegido (null = ninguno). */
  value: string | null;
  onChange: (id: string | null) => void;
  placeholder: string;
  style?: CSSProperties;
};

const LIMITE_LISTA = 50;

/** Sin tildes, mayúsculas ni signos: "Piura - Sechura - bernal" y "Piura- Sechura - Bernal" quedan iguales. */
const normalizar = (texto: string) =>
  texto.normalize("NFD").replace(/\p{M}/gu, "").toUpperCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/**
 * Campo de texto con lista desplegable: se digita parte del nombre para filtrar y queda elegida la opción cuando el texto
 * coincide con una de la lista (sin importar tildes ni mayúsculas). Mientras no coincida, el valor es null.
 */
function CampoBuscableBase({ opciones: opcionesOriginales, value, onChange, placeholder, style }: CampoBuscableProps) {
  const listaId = useId();
  // Si dos opciones tienen el mismo nombre (p. ej. distritos homónimos), se distinguen con su código: antes ambas apuntaban a la
  // misma y no se podía elegir la otra (volvía siempre a la inicial).
  const opciones = useMemo(() => {
    const repetidas = new Map<string, number>();
    for (const o of opcionesOriginales) {
      const n = normalizar(o.etiqueta);
      repetidas.set(n, (repetidas.get(n) ?? 0) + 1);
    }
    return opcionesOriginales.map((o) => ((repetidas.get(normalizar(o.etiqueta)) ?? 0) > 1 ? { ...o, etiqueta: `${o.etiqueta} [${o.id}]` } : o));
  }, [opcionesOriginales]);
  const [texto, setTexto] = useState(() => opciones.find((o) => o.id === value)?.etiqueta ?? "");
  // Si el valor cambia desde fuera (por ejemplo, el solicitante por defecto que llega después), se refleja en el texto.
  const [valorPrevio, setValorPrevio] = useState(value);
  if (value !== valorPrevio) {
    setValorPrevio(value);
    const etiqueta = value === null ? undefined : opciones.find((o) => o.id === value)?.etiqueta;
    if (etiqueta !== undefined) setTexto(etiqueta);
  }

  // Índice y lista calculados una sola vez por juego de opciones: con miles de ubigeos, recorrerlos en cada tecla era lo lento.
  const porClave = useMemo(() => new Map(opciones.map((o) => [normalizar(o.etiqueta), o.id])), [opciones]);
  const indice = useMemo(() => opciones.map((o) => ({ o, n: normalizar(o.etiqueta) })), [opciones]);
  // Con listas grandes (ubigeos) solo se ofrecen las primeras coincidencias del texto digitado: miles de <option> hacían lenta la escritura.
  const lista = useMemo(() => {
    const clave = normalizar(texto);
    const visibles =
      indice.length <= LIMITE_LISTA
        ? indice
        : clave.length < 2
          ? []
          : indice.filter((x) => clave.split(" ").every((w) => x.n.includes(w))).slice(0, LIMITE_LISTA);
    return visibles.map(({ o }) => <option key={o.id} value={o.etiqueta} />);
  }, [indice, texto]);
  const sinCoincidencia = texto.trim() !== "" && value === null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <input
        list={listaId}
        value={texto}
        placeholder={placeholder}
        aria-label={placeholder}
        aria-invalid={sinCoincidencia}
        onChange={(e) => {
          const nuevo = e.target.value;
          setTexto(nuevo);
          const clave = normalizar(nuevo);
          if (!clave) return onChange(null);
          // Coincidencia exacta; si no, la única opción que contenga todas las palabras digitadas (en cualquier orden).
          const exacta = porClave.get(clave);
          if (exacta !== undefined) return onChange(exacta);
          const palabras = clave.split(" ");
          const candidatas = clave.length >= 3 ? indice.filter((x) => palabras.every((w) => x.n.includes(w))) : [];
          onChange(candidatas.length === 1 ? candidatas[0].o.id : null);
        }}
        onBlur={() => {
          // Al salir, el texto queda como el nombre completo de la opción elegida.
          const elegida = value === null ? undefined : opciones.find((o) => o.id === value);
          if (elegida) setTexto(elegida.etiqueta);
        }}
        style={style}
      />
      <datalist id={listaId}>{lista}</datalist>
      {sinCoincidencia ? <span style={{ fontSize: 11, color: "#B45309" }}>Elija un nombre de la lista.</span> : null}
    </div>
  );
}

/** Memorizado: escribir en otro campo del popup no vuelve a dibujar este (requiere callbacks estables). */
export default memo(CampoBuscableBase);
