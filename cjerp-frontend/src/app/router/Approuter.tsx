import { BrowserRouter, Routes, Route } from "react-router-dom";
import LoginPage from "../../features/auth/pages/LoginPage";
import DashboardPage from "../../pages/DashboardPage";
import UsuariosPage from "../../pages/UsuariosPage";
import ConfiguracionPage from "../../pages/ConfiguracionPage";
import PrivateRoute from "./PrivateRoute";
import MainLayout from "../../layouts/MainLayout";

import AsistenciaPage from "../../pages/admin/AsistenciaPage";
import VacacionesPage from "../../pages/admin/VacacionesPage";
import MarcacionPage from "../../pages/admin/MarcacionPage";
import OperacionesCierrePage from "../../pages/operaciones/OperacionesCierrePage";
import DepositoPage from "../../pages/pagos/DepositoPage";
import CruceSeriesPage from "../../pages/logistica/CruceSeriesPage";
import ConsultaPage from "../../pages/mantenimiento/ConsultaPage";
import PlantaPrincipalPage from "../../pages/planta/PlantaPrincipalPage";

export default function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LoginPage />} />

        <Route element={<PrivateRoute />}>
          <Route element={<MainLayout />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/usuarios" element={<UsuariosPage />} />
            <Route path="/configuracion" element={<ConfiguracionPage />} />

            <Route path="/operaciones/cierre" element={<OperacionesCierrePage />} />
            <Route path="/pagos/deposito" element={<DepositoPage />} />
            <Route path="/logistica/cruce-series" element={<CruceSeriesPage />} />
            <Route path="/admin/asistencia" element={<AsistenciaPage />} />
            <Route path="/admin/vacaciones" element={<VacacionesPage />} />
            <Route path="/admin/marcacion" element={<MarcacionPage />} />
            <Route path="/mantenimiento/consulta" element={<ConsultaPage />} />
            <Route path="/planta" element={<PlantaPrincipalPage />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}