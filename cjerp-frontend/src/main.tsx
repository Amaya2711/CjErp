import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import AppRuntimeGuard from "./components/base/AppRuntimeGuard";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppRuntimeGuard>
      <App />
    </AppRuntimeGuard>
  </React.StrictMode>
);
