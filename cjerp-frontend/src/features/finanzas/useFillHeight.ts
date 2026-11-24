import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * Altura para que un grid ocupe el resto de la pantalla desde donde empieza hasta el borde inferior,
 * sin importar cuántos bloques haya encima ni el tamaño de la ventana.
 * Uso: const { ref, height } = useFillHeight(); <div ref={ref} style={{ height }}>
 */
export function useFillHeight(minHeight = 320, bottomMargin = 16) {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(minHeight);

  const medir = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    // Posicion respecto a la pantalla como si nada estuviera desplazado (suma el scroll de la ventana y de contenedores).
    let top = el.getBoundingClientRect().top + window.scrollY;
    for (let p = el.parentElement; p; p = p.parentElement) {
      top += p.scrollTop;
    }
    // top = 0 cuando la pestaña esta oculta (display none): no se mide.
    if (top <= 0 && el.offsetParent === null) return;
    const next = Math.max(minHeight, Math.floor(window.innerHeight - top - bottomMargin));
    setHeight((prev) => (prev === next ? prev : next));
  }, [minHeight, bottomMargin]);

  // Se re-mide en cada render (por si aparecen o desaparecen bloques encima) y al cambiar la ventana.
  useLayoutEffect(() => {
    medir();
  });

  useEffect(() => {
    window.addEventListener("resize", medir);
    return () => window.removeEventListener("resize", medir);
  }, [medir]);

  return { ref, height };
}
