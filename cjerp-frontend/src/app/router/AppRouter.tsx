import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import PrivateRoute from "./PrivateRoute";
import AutoSecurityRoute from "./AutoSecurityRoute";
import SessionManager from "../session/SessionManager";
import MainLayout from "../../layouts/MainLayout";

import LoginPage from "../../features/auth/pages/LoginPage";
import DashboardPage from "../../features/admin/DashboardPage";
import DynamicMenuRoutePage from "../../pages/DynamicMenuRoutePage";

//import SeguridadPage from "../../features/seguridad/pages/seguridad";
import SeguridadUsuariosPage from "../../features/seguridad/pages/usuarios";
//import SeguridadUsuarioPerfilPage from "../../features/seguridad/pages/usuario-perfil";
import SeguridadPerfilesPage from "../../features/seguridad/pages/perfiles";
import SeguridadRolesPage from "../../features/seguridad/pages/roles";

import SeguridadMenuPage from "../../features/seguridad/pages/menu";
import SeguridadPermisosPage from "../../features/seguridad/pages/permisos";
import PerfilRolMenuPage from "../../features/seguridad/pages/perfil-rol-menu";
import UsuarioPerfilRolMenu from "../../features/seguridad/pages/usuario-perfil-rol-menu";

import AsistenciaPage from "../../features/administracion/AsistenciaPage";
import MarcacionPage from "../../features/administracion/MarcacionPage";
import PendientesPage from "../../features/administracion/pendientes";
import SolicitudAdministracionPage from "../../features/administracion/solicitudadministracion";
import VacacionesPage from "../../features/administracion/VacacionesPage";
import AlmacenPage from "../../features/logistica/almacen/almacen";
import InventarioPage from "../../features/logistica/almacen/inventario";
import CrucePage from "../../features/logistica/gestionequipos/cruce";
import DesmontadoPage from "../../features/logistica/gestionequipos/desmontado";
import RecojoPage from "../../features/logistica/gestionequipos/recojo";
import SolicitudEquipoPage from "../../features/logistica/gestionequipos/solicitudequipo";
import TesoreriaDepositoPage from "../../features/finanzas/tesoreria/deposito";
import TesoreriaChequesPage from "../../features/finanzas/tesoreria/cheques";
import TesoreriaGastosPage from "../../features/finanzas/tesoreria/gastos";
import TesoreriaGastosAprobarPage from "../../features/finanzas/tesoreria/gastosaprobar";
import ActFacturaPage from "../../features/finanzas/facturacionfinanciera/actfactura";
import OcPage from "../../features/finanzas/facturacionfinanciera/oc";
import AsientosPage from "../../features/finanzas/contabilidad/asientos";
import CierreContablePage from "../../features/finanzas/contabilidad/cierrecontable";
import LibroDiarioPage from "../../features/finanzas/contabilidad/librodiario";
import LibroMayorPage from "../../features/finanzas/contabilidad/libromayor";
import CapitalizacionPage from "../../features/operaciones/capitalizacion";
import OperacionPage from "../../features/operaciones/operacion";
import AsignacionPage from "../../features/operaciones/asignacion";
import ReembolsoPage from "../../features/operaciones/operacion/reembolso";
import SuministroPage from "../../features/operaciones/operacion/suministro";
import AprobarCampoPage from "../../features/operaciones/operacion/aprobarcampo";
import ClientePage from "../../features/comercial/cliente";
import FacturacionPage from "../../features/comercial/facturacion";
import CobranzasPage from "../../features/comercial/cobranzas";
import SolicitudesPage from "../../features/compras/solicitudes";
import OrdenCompraPage from "../../features/compras/ordencompra";
import PersonalPage from "../../features/recursoshumanos/personal";
import RecursosHumanosAsistenciaPage from "../../features/recursoshumanos/asistencia";
import CompensacionRealPage from "../../features/recursoshumanos/compensacionreal";
import ImportarPlanillaXmlPage from "../../features/recursoshumanos/planillas";
import RecursosHumanosVacacionesPage from "../../features/recursoshumanos/vacaciones";
import ConsultaPage from "../../features/mantenimiento/consulta/consulta";
import ModificacionesPage from "../../features/mantenimiento/consulta/modificaciones";
import MigracionPage from "../../features/mantenimiento/migracion";
import MantenimientoPage from "../../features/mantenimiento/mantenimiento";
import RptWupPage from "../../features/mantenimiento/sistemas/rptwup";
import RptWupGerencialPage from "../../features/mantenimiento/sistemas/rptwupgerencial";
import RptBoletaPage from "../../features/mantenimiento/sistemas/rptboleta";
import IndicadoresGerencialesPage from "../../features/inicio/indicadoresgerenciales";
import PanelPrincipalPage from "../../features/inicio/panelprincipal";
import AlertasPage from "../../features/inicio/alertas";
import EnvioMensajesPage from "../../features/inicio/enviomensajes";
import PlantaPrincipalPage from "../../features/planta/principal";
import EppsPage from "../../features/planta/epps";
import OperativoPage from "../../pages/reporte/operativo";
import AdministrativoPage from "../../pages/reporte/administrativo";
import FinancieroPage from "../../pages/reporte/financiero";
import GerencialPage from "../../pages/reporte/gerencial";
import RptAsistenciaPage from "../../features/reportes/rptasistencia";
import RptAsistenciaEmpleadoPage from "../../features/reportes/rptasistenciaempleado";

export default function AppRouter() {
  return (
    <BrowserRouter>
      <SessionManager />
      <Routes>
        <Route path="/" element={<LoginPage />} />

        <Route element={<PrivateRoute />}>
          <Route element={<MainLayout />}>
            <Route path="/admin/DashboardPage" element={<DashboardPage />} />

            <Route path="/administracion/asistencia" element={<AsistenciaPage />} />
            <Route path="/administracion/pendientes" element={<PendientesPage />} />
            <Route
              path="/administracion/solicitudadministracion"
              element={<SolicitudAdministracionPage />}
            />
            <Route path="/administracion/marcacion" element={<MarcacionPage />} />
            <Route path="/administracion/vacaciones" element={<VacacionesPage />} />

            <Route path="/operaciones/capitalizacion" element={<CapitalizacionPage />} />
            <Route path="/operaciones/operacion" element={<OperacionPage />} />
            <Route path="/operaciones/operacion/reembolso" element={<ReembolsoPage />} />
            <Route path="/operaciones/operacion/suministro" element={<SuministroPage />} />
            <Route path="/operaciones/operacion/aprobarcampo" element={<AprobarCampoPage />} />
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
              path="/recursoshumanos/compensacionreal"
              element={<CompensacionRealPage />}
            />
            <Route
              path="/recursoshumanos/compensacion"
              element={<CompensacionRealPage />}
            />
            <Route
              path="/recursoshumanos/planillas"
              element={<ImportarPlanillaXmlPage />}
            />
            <Route
              path="/recursoshumanos/vacaciones"
              element={<RecursosHumanosVacacionesPage />}
            />

            <Route path="/mantenimiento/consulta" element={<ConsultaPage />} />
            <Route path="/mantenimiento/consulta/modificaciones" element={<ModificacionesPage />} />
            <Route path="/mantenimiento/modificaciones" element={<ModificacionesPage />} />
            <Route path="/mantenimiento/migracion" element={<MigracionPage />} />
            <Route path="/mantenimiento/mantenimiento" element={<MantenimientoPage />} />
            <Route path="/mantenimiento/sistemas/rptwup" element={<RptWupPage />} />
            <Route path="/mantenimiento/sistemas/rptwupgerencial" element={<RptWupGerencialPage />} />
            <Route path="/mantenimiento/sistemas/rptboleta" element={<RptBoletaPage />} />

            <Route
              path="/inicio/indicadoresgerenciales"
              element={<IndicadoresGerencialesPage />}
            />
            <Route path="/inicio/panelprincipal" element={<PanelPrincipalPage />} />
            <Route path="/inicio/alertas" element={<AlertasPage />} />
            <Route path="/inicio/enviomensajes" element={<EnvioMensajesPage />} />

            <Route path="/planta/principal" element={<PlantaPrincipalPage />} />
            <Route path="/planta/epps" element={<EppsPage />} />

            <Route path="/reporte/operativo" element={<OperativoPage />} />
            <Route path="/reporte/administrativo" element={<AdministrativoPage />} />
            <Route path="/reporte/financiero" element={<FinancieroPage />} />
            <Route path="/reporte/gerencial" element={<GerencialPage />} />
            <Route path="/reportes/rptasistencia" element={<RptAsistenciaPage />} />
            <Route path="/reportes/rptasistenciaempleado" element={<RptAsistenciaEmpleadoPage />} />

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
              path="/logistica/gestionequipos/recojo"
              element={<RecojoPage />}
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
            <Route path="/finanzas/tesoreria/cheque" element={<TesoreriaChequesPage />} />
            <Route path="/finanzas/tesoreria/cheques" element={<TesoreriaChequesPage />} />
            <Route path="/finanzas/tesoreria/gastos" element={<TesoreriaGastosPage />} />
            <Route path="/finanzas/tesoreria/gastosaprobar" element={<TesoreriaGastosAprobarPage />} />

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

           
            <Route path="/seguridad/usuarios" element={<SeguridadUsuariosPage />} />
            <Route path="/seguridad/perfiles" element={<SeguridadPerfilesPage />} />
            <Route path="/seguridad/roles" element={<SeguridadRolesPage />} />
            <Route path="/seguridad/permisos" element={<SeguridadPermisosPage />} />
            <Route path="/seguridad/menu" element={<SeguridadMenuPage />} />
            <Route path="/seguridad/perfil-rol-menu" element={<PerfilRolMenuPage />} />
            <Route path="/seguridad/usuario-perfil-rol-menu" element={<UsuarioPerfilRolMenu />} />

            <Route path="/seguridad/:autoPage" element={<AutoSecurityRoute />} />

            <Route path="*" element={<DynamicMenuRoutePage />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
