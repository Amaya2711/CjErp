import { createContext } from "react";

/** Contenedor del área de acciones de la página (encabezado de AppPage): la etapa activa publica allí sus botones con un portal. */
export const AccionesPaginaContext = createContext<HTMLElement | null>(null);
