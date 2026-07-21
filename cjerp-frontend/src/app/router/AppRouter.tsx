import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Suspense, lazy } from "react";
import PrivateRoute from "./PrivateRoute";
import AutoSecurityRoute from "./AutoSecurityRoute";
import SessionManager from "../session/SessionManager";
import MainLayout from "../../layouts/MainLayout";

import LoginPage from "../../features/auth/pages/LoginPage";
const DashboardPage = lazy(() => import("../../features/admin/DashboardPage"));
const DynamicMenuRoutePage = lazy(() => import("../../pages/DynamicMenuRoutePage"));
const SeguridadUsuariosPage = lazy(() => import("../../features/seguridad/pages/usuarios"));
const SeguridadPerfilesPage = lazy(() => import("../../features/seguridad/pages/perfiles"));
const SeguridadRolesPage = lazy(() => import("../../features/seguridad/pages/roles"));
const SeguridadMenuPage = lazy(() => import("../../features/seguridad/pages/menu"));
const SeguridadPermisosPage = lazy(() => import("../../features/seguridad/pages/permisos"));
const PerfilRolMenuPage = lazy(() => import("../../features/seguridad/pages/perfil-rol-menu"));
const UsuarioPerfilRolMenu = lazy(() => import("../../features/seguridad/pages/usuario-perfil-rol-menu"));
const AsistenciaPage = lazy(() => import("../../features/administracion/AsistenciaPage"));
const MarcacionPage = lazy(() => import("../../features/administracion/MarcacionPage"));
const PendientesPage = lazy(() => import("../../features/administracion/pendientes"));
const SolicitudAdministracionPage = lazy(() => import("../../features/administracion/solicitudadministracion"));
const VacacionesPage = lazy(() => import("../../features/recursoshumanos/vacacionespage"));
const AlmacenPage = lazy(() => import("../../features/logistica/almacen/almacen"));
const InventarioPage = lazy(() => import("../../features/logistica/almacen/inventario"));
const CrucePage = lazy(() => import("../../features/logistica/gestionequipos/cruce"));
const DesmontadoPage = lazy(() => import("../../features/logistica/gestionequipos/desmontado"));
const RecojoPage = lazy(() => import("../../features/logistica/gestionequipos/recojo"));
const SolicitudEquipoPage = lazy(() => import("../../features/logistica/gestionequipos/solicitudequipo"));
const TesoreriaDepositoPage = lazy(() => import("../../features/finanzas/tesoreria/deposito"));
const TesoreriaChequesPage = lazy(() => import("../../features/finanzas/tesoreria/cheques"));
const TesoreriaGastosPage = lazy(() => import("../../features/finanzas/tesoreria/gastos"));
const TesoreriaGastosAprobarPage = lazy(() => import("../../features/finanzas/tesoreria/gastosaprobar"));
const ConciliacionBcpPage = lazy(() => import("../../features/finanzas/conciliacion"));
const ActFacturaPage = lazy(() => import("../../features/finanzas/facturacionfinanciera/actfactura"));
const OcPage = lazy(() => import("../../features/finanzas/facturacionfinanciera/oc"));
const AsientosPage = lazy(() => import("../../features/finanzas/contabilidad/asientos"));
const CierreContablePage = lazy(() => import("../../features/finanzas/contabilidad/cierrecontable"));
const LibroDiarioPage = lazy(() => import("../../features/finanzas/contabilidad/librodiario"));
const LibroMayorPage = lazy(() => import("../../features/finanzas/contabilidad/libromayor"));
const CapitalizacionPage = lazy(() => import("../../features/operaciones/capitalizacion"));
const OperacionPage = lazy(() => import("../../features/operaciones/operacion"));
const AsignacionPage = lazy(() => import("../../features/operaciones/asignacion"));
const ReembolsoPage = lazy(() => import("../../features/operaciones/operacion/reembolso"));
const SuministroPage = lazy(() => import("../../features/operaciones/operacion/suministro"));
const AprobarCampoPage = lazy(() => import("../../features/operaciones/operacion/aprobarcampo"));
const ClientePage = lazy(() => import("../../features/comercial/cliente"));
const FacturacionPage = lazy(() => import("../../features/comercial/facturacion"));
const CobranzasPage = lazy(() => import("../../features/comercial/cobranzas"));
const SolicitudesPage = lazy(() => import("../../features/compras/solicitudes"));
const OrdenCompraPage = lazy(() => import("../../features/compras/ordencompra"));
const PersonalPage = lazy(() => import("../../features/recursoshumanos/personal"));
const FichaPage = lazy(() => import("../../features/recursoshumanos/ficha"));
const ContratosPage = lazy(() => import("../../features/recursoshumanos/contratos"));
const RecursosHumanosAsistenciaPage = lazy(() => import("../../features/recursoshumanos/asistencia"));
const CompensacionRealPage = lazy(() => import("../../features/recursoshumanos/compensacionreal"));
const ImportarPlanillaXmlPage = lazy(() => import("../../features/recursoshumanos/planillas"));
const RecursosHumanosVacacionesPage = lazy(() => import("../../features/recursoshumanos/vacaciones"));
const ConsultaPage = lazy(() => import("../../features/mantenimiento/consulta/consulta"));
const ModificacionesPage = lazy(() => import("../../features/mantenimiento/consulta/modificaciones"));
const MigracionPage = lazy(() => import("../../features/mantenimiento/migracion"));
const MantenimientoPage = lazy(() => import("../../features/mantenimiento/mantenimiento"));
const MantenimientoEmpleadosPage = lazy(() => import("../../features/mantenimiento/empleados"));
const MantenimientoEmpleadoFichaPage = lazy(() => import("../../features/mantenimiento/mantenimiento/m_empleado"));
const RptWupPage = lazy(() => import("../../features/mantenimiento/sistemas/rptwup"));
const RptWupGerencialPage = lazy(() => import("../../features/mantenimiento/sistemas/rptwupgerencial"));
const RptBoletaPage = lazy(() => import("../../features/mantenimiento/sistemas/rptboleta"));
const IndicadoresGerencialesPage = lazy(() => import("../../features/inicio/indicadoresgerenciales"));
const PanelPrincipalPage = lazy(() => import("../../features/inicio/panelprincipal"));
const AlertasPage = lazy(() => import("../../features/inicio/alertas"));
const EnvioMensajesPage = lazy(() => import("../../features/inicio/enviomensajes"));
const PlantaPrincipalPage = lazy(() => import("../../features/planta/principal"));
const EppsPage = lazy(() => import("../../features/planta/epps"));
const OperativoPage = lazy(() => import("../../pages/reporte/operativo"));
const FinancieroPage = lazy(() => import("../../pages/reporte/financiero"));
const GerencialPage = lazy(() => import("../../pages/reporte/gerencial"));
const DashboardCjPage = lazy(() => import("../../features/reportes/gerencial/dashboardcj"));
const Dashboard1Page = lazy(() => import("../../features/reportes/gerencial/dashboard1"));
const Dashboard3Page = lazy(() => import("../../features/reportes/gerencial/dashboard3"));
const RptAsistenciaPage = lazy(() => import("../../features/reportes/rptasistencia"));
const RptAsistenciaEmpleadoPage = lazy(() => import("../../features/reportes/rptasistenciaempleado"));
const ClaudeiaPage = lazy(() => import("../../features/reportes/administrativo/claudeia"));
const IaChatPage = lazy(() => import("../../features/reportes/administrativo/iachat"));

export default function AppRouter() {
  return (
    <BrowserRouter>
      <SessionManager />
      <Suspense fallback={<div style={{ padding: 24 }}>Cargando modulo...</div>}>
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
            <Route path="/recursoshumanos/vacacionespage" element={<VacacionesPage />} />

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
            <Route path="/recursoshumanos/ficha" element={<FichaPage />} />
            <Route path="/recursoshumanos/contratos" element={<ContratosPage />} />
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
            <Route path="/mantenimiento/empleados" element={<MantenimientoEmpleadosPage />} />
            <Route path="/mantenimiento/mantenimiento/m_empleado" element={<MantenimientoEmpleadoFichaPage />} />
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
            <Route path="/reporte/administrativo/claudeia" element={<ClaudeiaPage />} />
            <Route path="/reportes/administrativo/claudeia" element={<ClaudeiaPage />} />
            <Route path="/reporte/administrativo/iachat" element={<IaChatPage />} />
            <Route path="/reportes/administrativo/iachat" element={<IaChatPage />} />
            <Route path="/reporte/financiero" element={<FinancieroPage />} />
            <Route path="/reporte/gerencial" element={<GerencialPage />} />
            <Route path="/gerencial/dashboard1" element={<Dashboard1Page />} />
            <Route path="/reportes/gerencial/dashboard3" element={<Dashboard3Page />} />
            <Route path="/reportes/gerencial/dashboardcj" element={<DashboardCjPage />} />
            <Route path="/reportes/gerencial/dashboard1" element={<Dashboard1Page />} />
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
            <Route path="/finanzas/conciliacion" element={<ConciliacionBcpPage />} />

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
      </Suspense>
    </BrowserRouter>
  );
}
