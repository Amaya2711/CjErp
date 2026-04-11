import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import PrivateRoute from "./PrivateRoute";
import MainLayout from "../../layouts/MainLayout";

import LoginPage from "../../features/auth/pages/LoginPage";
import DashboardPage from "../../pages/DashboardPage";

import SeguridadPage from "../../pages/seguridad/SeguridadPage";
import SeguridadUsuariosPage from "../../pages/seguridad/SeguridadUsuariosPage";
import SeguridadUsuarioPerfilPage from "../../pages/seguridad/SeguridadUsuarioPerfil";
import SeguridadPerfilesPage from "../../pages/seguridad/SeguridadPerfilesPage";
import SeguridadRolesPage from "../../pages/seguridad/SeguridadRolesPage";
import SeguridadMenuPage from "../../pages/seguridad/SeguridadMenuPage.tsx";
import SeguridadPermisosPage from "../../pages/seguridad/SeguridadPermisosPage";

import AsistenciaPage from "../../pages/administracion/AsistenciaPage";
import MarcacionPage from "../../pages/administracion/MarcacionPage";
import SolicitudAdministracionPage from "../../pages/administracion/solicitudadministracion";
import VacacionesPage from "../../pages/administracion/VacacionesPage";
import AlmacenPage from "../../pages/logistica/almacen/almacen";
import InventarioPage from "../../pages/logistica/almacen/inventario";
import CrucePage from "../../pages/logistica/gestionequipos/cruce";
import DesmontadoPage from "../../pages/logistica/gestionequipos/desmontado";
import SolicitudEquipoPage from "../../pages/logistica/gestionequipos/solicitudequipo";
import TesoreriaDepositoPage from "../../pages/finanzas/tesoreria/deposito";
import TesoreriaGastosPage from "../../pages/finanzas/tesoreria/gastos";
import ActFacturaPage from "../../pages/finanzas/facturacionfinanciera/actfactura";
import OcPage from "../../pages/finanzas/facturacionfinanciera/oc";
import AsientosPage from "../../pages/finanzas/contabilidad/asientos";
import CierreContablePage from "../../pages/finanzas/contabilidad/cierrecontable";
import LibroDiarioPage from "../../pages/finanzas/contabilidad/librodiario";
import LibroMayorPage from "../../pages/finanzas/contabilidad/libromayor";
import CapitalizacionPage from "../../pages/operaciones/capitalizacion";
import OperacionPage from "../../pages/operaciones/operacion";
import AsignacionPage from "../../pages/operaciones/asignacion";
import ClientePage from "../../pages/comercial/cliente";
import FacturacionPage from "../../pages/comercial/facturacion";
import CobranzasPage from "../../pages/comercial/cobranzas";
import SolicitudesPage from "../../pages/compras/solicitudes";
import OrdenCompraPage from "../../pages/compras/ordencompra";
import PersonalPage from "../../pages/recursoshumanos/personal";
import RecursosHumanosAsistenciaPage from "../../pages/recursoshumanos/asistencia";
import RecursosHumanosVacacionesPage from "../../pages/recursoshumanos/vacaciones";
import ConsultaPage from "../../pages/mantenimiento/consulta";
import MigracionPage from "../../pages/mantenimiento/migracion";
import MantenimientoPage from "../../pages/mantenimiento/mantenimiento";
import IndicadoresGerencialesPage from "../../pages/inicio/indicadoresgerenciales";
import PanelPrincipalPage from "../../pages/inicio/panelprincipal";
import AlertasPage from "../../pages/inicio/alertas";
import PlantaPrincipalPage from "../../pages/planta/principal";
import EppsPage from "../../pages/planta/epps";
import OperativoPage from "../../pages/reporte/operativo";
import AdministrativoPage from "../../pages/reporte/administrativo";
import FinancieroPage from "../../pages/reporte/financiero";
import GerencialPage from "../../pages/reporte/gerencial";

export default function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LoginPage />} />

        <Route element={<PrivateRoute />}>
          <Route element={<MainLayout />}>
            <Route path="/dashboard" element={<DashboardPage />} />

            <Route path="/administracion/asistencia" element={<AsistenciaPage />} />
            <Route
              path="/administracion/solicitudadministracion"
              element={<SolicitudAdministracionPage />}
            />
            <Route path="/administracion/marcacion" element={<MarcacionPage />} />
            <Route path="/administracion/vacaciones" element={<VacacionesPage />} />

            <Route path="/operaciones/capitalizacion" element={<CapitalizacionPage />} />
            <Route path="/operaciones/operacion" element={<OperacionPage />} />
            <Route path="/operaciones/asignacion" element={<AsignacionPage />} />

            <Route path="/comercial/cliente" element={<ClientePage />} />
            <Route path="/comercial/facturacion" element={<FacturacionPage />} />
            <Route path="/comercial/cobranzas" element={<CobranzasPage />} />

            <Route path="/compras/solicitudes" element={<SolicitudesPage />} />
            <Route path="/compras/ordencompra" element={<OrdenCompraPage />} />

            <Route path="/recursoshumanos/personal" element={<PersonalPage />} />
            <Route
              path="/recursoshumanos/asistencia"
              element={<RecursosHumanosAsistenciaPage />}
            />
            <Route
              path="/recursoshumanos/vacaciones"
              element={<RecursosHumanosVacacionesPage />}
            />

            <Route path="/mantenimiento/consulta" element={<ConsultaPage />} />
            <Route path="/mantenimiento/migracion" element={<MigracionPage />} />
            <Route path="/mantenimiento/mantenimiento" element={<MantenimientoPage />} />

            <Route
              path="/inicio/indicadoresgerenciales"
              element={<IndicadoresGerencialesPage />}
            />
            <Route path="/inicio/panelprincipal" element={<PanelPrincipalPage />} />
            <Route path="/inicio/alertas" element={<AlertasPage />} />

            <Route path="/planta/principal" element={<PlantaPrincipalPage />} />
            <Route path="/planta/epps" element={<EppsPage />} />

            <Route path="/reporte/operativo" element={<OperativoPage />} />
            <Route path="/reporte/administrativo" element={<AdministrativoPage />} />
            <Route path="/reporte/financiero" element={<FinancieroPage />} />
            <Route path="/reporte/gerencial" element={<GerencialPage />} />

            <Route
              path="/logistica/gestionequipos"
              element={<Navigate to="/logistica/gestionequipos/cruce" replace />}
            />
            <Route path="/logistica/gestionequipos/cruce" element={<CrucePage />} />
            <Route
              path="/logistica/gestionequipos/desmontado"
              element={<DesmontadoPage />}
            />
            <Route
              path="/logistica/gestionequipos/solicitudequipo"
              element={<SolicitudEquipoPage />}
            />

            <Route
              path="/logistica/almacen"
              element={<Navigate to="/logistica/almacen/almacen" replace />}
            />
            <Route path="/logistica/almacen/almacen" element={<AlmacenPage />} />
            <Route path="/logistica/almacen/inventario" element={<InventarioPage />} />

            <Route
              path="/finanzas/tesoreria"
              element={<Navigate to="/finanzas/tesoreria/deposito" replace />}
            />
            <Route
              path="/finanzas/tesoreria/deposito"
              element={<TesoreriaDepositoPage />}
            />
            <Route path="/finanzas/tesoreria/gastos" element={<TesoreriaGastosPage />} />

            <Route
              path="/finanzas/facturacionfinanciera"
              element={<Navigate to="/finanzas/facturacionfinanciera/actfactura" replace />}
            />
            <Route
              path="/finanzas/facturacionfinanciera/actfactura"
              element={<ActFacturaPage />}
            />
            <Route path="/finanzas/facturacionfinanciera/oc" element={<OcPage />} />

            <Route
              path="/finanzas/contabilidad"
              element={<Navigate to="/finanzas/contabilidad/asientos" replace />}
            />
            <Route path="/finanzas/contabilidad/asientos" element={<AsientosPage />} />
            <Route path="/finanzas/contabilidad/cierre" element={<CierreContablePage />} />
            <Route path="/finanzas/contabilidad/diario" element={<LibroDiarioPage />} />
            <Route path="/finanzas/contabilidad/mayor" element={<LibroMayorPage />} />

            <Route path="/seguridad" element={<SeguridadPage />} />
            <Route path="/seguridad/usuarios" element={<SeguridadUsuariosPage />} />
            <Route
              path="/seguridad/usuario-perfil"
              element={<SeguridadUsuarioPerfilPage />}
            />
            <Route path="/seguridad/perfiles" element={<SeguridadPerfilesPage />} />
            <Route path="/seguridad/roles" element={<SeguridadRolesPage />} />
            <Route path="/seguridad/menu" element={<SeguridadMenuPage />} />
            <Route path="/seguridad/permisos" element={<SeguridadPermisosPage />} />

            <Route
              path="/seguridad/SeguridadUsuariosPage"
              element={<SeguridadUsuariosPage />}
            />
            <Route
              path="/seguridad/SeguridadPerfilesPage"
              element={<SeguridadPerfilesPage />}
            />
            <Route path="/seguridad/SeguridadRolesPage" element={<SeguridadRolesPage />} />
            <Route
              path="/seguridad/SeguridadPermisosPage"
              element={<SeguridadPermisosPage />}
            />
            <Route path="/seguridad/SeguridadMenuPage" element={<SeguridadMenuPage />} />

            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}