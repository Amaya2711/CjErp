import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import AppRuntimeGuard from "./components/base/AppRuntimeGuard";
import "./index.css";
import { aplicarZoomApp } from "./utils/appZoom";

aplicarZoomApp();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppRuntimeGuard>
      <App />
    </AppRuntimeGuard>
  </React.StrictMode>
);
