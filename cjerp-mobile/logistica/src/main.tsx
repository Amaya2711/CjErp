import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { SessionProvider, setAppCodigo } from "@cjerp/shared";
import App from "./App";
import "./styles.css";

/** Código de esta app en SegApp: el backend elige el rol de ESTA app y valida usuario activo y cargo antes de crear la sesión. */
setAppCodigo("MOB_LOGISTICA");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <SessionProvider>
        <App />
      </SessionProvider>
    </BrowserRouter>
  </StrictMode>,
);
