import { useState } from "react";
import ConfirmDialog from "./ConfirmDialog";
import { debePreguntarZoom, guardarPreferenciaZoom } from "../../utils/appZoom";

export default function ZoomPrompt() {
  const [open, setOpen] = useState(() => debePreguntarZoom());

  const responder = (usarZoom: boolean) => {
    guardarPreferenciaZoom(usarZoom);
    setOpen(false);
  };

  return (
    <ConfirmDialog
      open={open}
      title="Tamaño de la pantalla"
      message="¿Desea ajustar el tamaño de la pantalla al 65 % para ver más contenido? Se aplica de inmediato y recordaremos su elección en este navegador."
      confirmLabel="Sí, ajustar al 65 %"
      cancelLabel="No, mantener tamaño actual"
      onConfirm={() => responder(true)}
      onCancel={() => responder(false)}
    />
  );
}
