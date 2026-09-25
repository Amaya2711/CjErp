# Módulos funcionales — Cj ERP Web

> Inventario por módulo basado en código (2026-09-25). FE = `cjerp-frontend/src/`, BE = `CjERP.Backend/`.
> Estado de página: **ACTIVA** (funcional) · **LEGACY/DUP** (duplicado/versión anterior con ruta) · **STUB** (placeholder) · **HUÉRFANO** (sin ruta) · **ROTO**.
> Qué página figura realmente en el menú de producción (`SegMenu`) es **PENDIENTE DE VALIDACIÓN** (ver BD).
> Rutas, endpoints y SPs detallados: API_MAP.md / DATABASE_MAP.md. Procesos: PROCESS_MAP.md.

## Glosario (vocabulario del código)
- **Planilla** = tabla `dbo.Planilla` de **recibos/gastos** de tesorería (no nómina). La nómina son las **boletas XML** (`PlanillaBoleta*`).
- **Compensación** (`/admin/compensacion`) = **días compensatorios** de RRHH (no dinero).
- **EmpleadoCj** = empleado actual; **Empleado** = tabla legacy (sigue usándose en pagos/usuarios).
- **WUP** = proveedor propio de mensajería WhatsApp/SMS.
- **OT** = orden de trabajo (tabla `importar`); **OC** = orden de compra.
- **Hormiga / Re-aprobar / Observado** = bandejas de aprobación de recibos en `pagos_v1`.

---

## 1. Seguridad
- **FE**: `features/seguridad/pages/` — `usuariorol.tsx`, `usuario-perfil-rol-menu.tsx`, `perfil-rol-menu.tsx`, `menu.tsx`, `menu/permisos.tsx` (permisos por acción), `perfiles.tsx`, `roles.tsx` (ACTIVAS); `usuarios.tsx` (STUB), `seguridad.tsx`/`permisos.tsx` (vacíos); `pages/seguridad/menu.tsx` (HUÉRFANO vía AutoSecurityRoute). Servicios `features/seguridad/services/*` (`seguridadPermisosService.ts` huérfano).
- **BE**: AuthController, AuthMeController, SegMenuController, SegPerfilController, SegRolController, SegUsuarioController, Seguridad/SegPermisosAccionesController, Seguridad/SegRolMenuPermisoController, SeguridadController · AuthService, JwtService, ActiveUserSessionService, Seg*Service.
- **SPs**: `sp_ValidarUsuario`, `sp_Seguridad_ObtenerMenuDinamico`, `sp_SegMenu_*`, `sp_SegPerfil*`, `sp_SegRol_*`, `sp_SegPerfilRolMenu_*`, `sp_SegUsuarioPerfil(Rol)_*`, `sp_SegPermisoAccion_*`, `sp_SegRolMenuPermiso_*`, `sp_UsuarioListar`.
- **Tablas**: Usuario, SegPerfil, SegRol, SegPerfilRol, SegUsuarioPerfilRol, SegMenu, SegPerfilRolMenu, SegPermisoAccion, SegRolMenuPermiso.
- **Reglas**: acceso total FE si perfil 8 + rol 5; permisos por acción solo en FE (oc_v1, pagos_v1). Ver BUSINESS_RULES §8.
- **Dependencias**: todos los módulos (menú + claims).

## 2. Tesorería / Finanzas (recibos "Planilla")
| Página (ruta) | Archivo | Estado |
|---|---|---|
| Registro de gastos `/finanzas/tesoreria/gastos` | `features/finanzas/tesoreria/gastos.tsx` (5707 l) | ACTIVA (también embebida en pagos_v1) |
| Bandeja aprobar `/finanzas/tesoreria/gastosaprobar` | `gastosaprobar.tsx` (6217 l) | ACTIVA (~66 % duplicado de gastos; filtra y rechaza, no aprueba) |
| **Aprobaciones** `/finanzas/tesoreria/pagos_v1` | `pagos_v1.tsx` (6510 l) | ACTIVA — bandeja principal (pestañas aprobar/reaprobar/hormiga/observadas/resumen) |
| `/finanzas/tesoreria/pagos_dev` | `pagos_dev.tsx` (4884 l) | LEGACY/DUP de pagos_v1 (**único uso de DevExtreme**) |
| **Pago tesorería** `/finanzas/tesoreria/pagartesoreria` | `pagartesoreria.tsx` + `PagoEtapaForm.tsx` + `PagoRevisionCells.tsx` | ACTIVA (documentado en `Database/Finanzas/PagosTesoreria.md`) |
| `/finanzas/tesoreria/pagartesoreria_v1` | `pagartesoreria_v1.tsx` | Variante (~98 % igual) que usa `/tesoreria/pagos/v1` + reporte resumen |
| Cheques `/finanzas/tesoreria/cheque(s)` | `cheques.tsx` (`cheque.tsx` re-export) | ACTIVA |
| Depósito `/finanzas/tesoreria/deposito` | `deposito.tsx` | STUB (`DepositoPage.tsx` huérfano) |
| Conciliación BCP `/finanzas/conciliacion` | `features/finanzas/conciliacion.tsx` (4959 l) | ACTIVA (v0, tabla MovimientosBcp) |
| Conciliación multibanco `/finanzas/conciliacion_v1` | `conciliacion_v1.tsx` (7265 l) | ACTIVA (v1, MovimientosConciliacion) |
| Contabilidad `/finanzas/contabilidad/{asientos,diario,mayor}` | `contabilidad/*.tsx` | STUB; `cierre` = grilla genérica sobre sp_Planilla_Consulta_Estados |
- **Componentes propios**: `tesoreria/components/DatosOcDrawer`, `DatosOcFloatingCard`.
- **API FE**: `planillaConsultaService.ts`, `pagoTesoreriaService.ts`, `chequeService.ts`, `conciliacionService.ts`, `gastosBootstrapService.ts`, `filtroOperativoService.ts`. (`tesoreriaService.ts` muerto.)
- **BE**: TesoreriaGastosController, PlanillaConsultaController, PagoTesoreriaController, TesoreriaChequesController, FinanzasConciliacionController · PlanillaService, PlanillaConsultaService, PagoTesoreriaService/Workflow/Revision, ChequeEmpleadoService, ConciliacionBcpService (6375 l), LookupService.
- **SPs clave**: `sp_Planilla_Insertar/Actualizar/ActualizarEstado/ProcesarAprobacionMasiva`, `sp_Planilla_Consulta_Estados` (consulta genérica principal), `sp_Planilla_Consulta_Aprobar`, `sp_Planilla_ConsultaIni`, SPs masivos de etapas (`…RevisionMasiva`, `…ContabilidadMasivo`, `…PasarAdministrativoMasivo`, `…ProgramarMasivo`, `…AdministrativoMasivo`, `…PagoContabilidadMasivo`, `…ActualizarRendirMasivo`), `sp_Finanzas_CargarValoresGasto`, `sp_ChequeEmpleado_*`, `sp_MovimientosBcp_*`, `sp_MovimientosConciliacion_*`.
- **Tablas**: Planilla, LogPlanilla, MovEstadosPagos, CuentaEmpleado, Constante, MovimientosBcp, MovimientosConciliacion, Bancos, PlantillasBanco*.
- **Estados**: 0,1,2,3,4,5,6,7,8,9,10 (BUSINESS_RULES §1).
- **Integraciones**: SharePoint (facturas, cheques), OpenAI (conciliación), gestor legacy elnk.uno (facturas), xlsx/jspdf.
- **Depende de**: Orden de Compra (IdOc/Fila), Operaciones (OT/importar, site, suministro provisional), Empleados (Empleado/EmpleadoCj, cuentas), Seguridad (SegPermisoAccion en pagos_v1).

## 3. Orden de Compra (Facturación financiera)
| Página | Archivo | Estado |
|---|---|---|
| `/finanzas/facturacionfinanciera/oc_v1` | `features/finanzas/facturacionfinanciera/oc_v1.tsx` (5602 l) | **ACTIVA** (completa: alta, edición, 3 niveles de aprobación, recibos asociados, PDF, archivos) |
| `/finanzas/facturacionfinanciera/oc` | `oc.tsx` (2289 l) | LEGACY (buscar/insertar/rechazar) |
| `/finanzas/facturacionfinanciera/actfactura` | `actfactura.tsx` | STUB |
| `/compras/{solicitudes,ordencompra}` | `features/compras/*` | STUB |
- **API FE**: `ordenCompraService.ts`. **BE**: OrdenCompraController (806 l) → OrdenCompraService, OrdenCompraPdfDocument (QuestPDF).
- **SPs**: `sp_OrdenCompra_Insertar/BuscarCabecera/BuscarDetalle/RechazarMasivo`, `sp_OrdenCompra_Consulta_Estados` (vía consulta `analisis-gastos`). **Tablas**: CabOrdenCompra, DetOrdenCompra, Planilla (IdOc/Fila).
- **Estados**: 0 (en aprobación), 1 (aprobada), 6 (rechazada). Permisos de nivel 2/3: `SegPermisoAccion` `tab.validacion_2/3` (solo FE).

## 4. Recursos Humanos
| Página | Archivo | Estado |
|---|---|---|
| Vacaciones `/administracion/vacaciones`, `/recursoshumanos/vacacionespage` | `features/recursoshumanos/vacacionespage.tsx` (2509 l) | ACTIVA (versión limpia) |
| `/recursoshumanos/vacaciones` | `vacaciones.tsx` (6105 l) | LEGACY/DUP (clon de gastos.tsx adaptado) |
| Contratos `/recursoshumanos/contratos` | `contratos.tsx` (3401 l) | ACTIVA |
| Ficha `/recursoshumanos/ficha` | `ficha.tsx` | ACTIVA |
| Compensación días `/recursoshumanos/compensacionreal`, `/compensacion` | `compensacionreal.tsx` (2790 l) | ACTIVA |
| Boletas XML `/recursoshumanos/planillas` | `planillas.tsx` | ACTIVA |
| `/recursoshumanos/{personal,asistencia}` | — | STUB · `descansomedico.tsx`, `evaluacion.tsx` vacíos |
- **BE**: VacacionesController, CompensacionController, ContratosController (SQL inline), EmpleadoFichaController, PlanillaBoletaController · VacacionesService, CompensacionService, PlanillaBoletaService/Repository/PdfGenerator.
- **SPs**: `sp_EmpleadoOtros_*` (vacaciones legacy, **en uso**), `sp_Vacacion_*` (modelo nuevo, **sin UI**), `sp_EmpleadoCompensacion*`, `sp_EmpleadoCj_Ficha`, `sp_PlanillaBoleta_ImportarXml`.
- **Tablas**: EmpleadoOtros, Vacacion*, EmpleadoCompensacion*, EmpleadoCjSolicitudVigencia, EmpleadoCjHistorialLaboral, PlanillaBoleta*.
- **Integraciones**: SharePoint (plantillas DOCX, firmas), SMTP (contratos), QuestPDF.

## 5. Mantenimiento (Empleados, Externos, Migración, Auditoría)
| Página | Archivo | Estado |
|---|---|---|
| `/mantenimiento/empleados` | `features/mantenimiento/empleados.tsx` | ACTIVA (activos/pendientes/bajas; aprobar si IdEstado=9) |
| `/mantenimiento/externo` | `externo.tsx` | ACTIVA (copia de empleados.tsx) |
| `/mantenimiento/mantenimiento/m_empleado` | `mantenimiento/m_empleado.tsx` | ACTIVA (grilla editable) |
| `/mantenimiento/migracion/importar` | `migracion/importar.tsx` | ACTIVA (nuevo, TVP) |
| `/mantenimiento/migracion/m_importar` | `migracion/m_importar.tsx` | LEGACY (staging updimportar) |
| `/mantenimiento/modificaciones` (+`/consulta/modificaciones`) | `consulta/modificaciones.tsx` | ACTIVA (monitor AuditoriaCambios) |
| `/mantenimiento/{consulta,mantenimiento,migracion}` | — | STUB / informativa |
- **BE**: MantenimientoEmpleadosController (2940 l) y MantenimientoExternosController (2961 l, **copias**), MantenimientoMigracionController, MantenimientoMigracionImportController, AuditoriaCambiosController · MigracionImportService, MigracionImportProcesarNewService, AuditoriaCambiosService.
- **SPs**: `sp_EmpleadoCj_Ficha/Actualizar/EliminarLogico`, `SP_GenerarUsuario`, `sp_Empleado_ListarValidadores`, `sp_MigracionImport_*`, `sp_AuditoriaCambios_Registrar`.
- **Tablas**: EmpleadoCj, EmpleadoCjDetalle, Empleado, Usuario, Asistencia, updimportar, importar, Cliente, Proyecto, Site, AuditoriaCambios.

## 6. Administración
| Página | Archivo | Estado |
|---|---|---|
| Pendientes `/administracion/pendientes` | `features/administracion/pendientes.tsx` | ACTIVA (tareas pendientes, no aprobación de empleados) |
| Export asistencia SharePoint `/administracion/exportacion-asistencia` | `exportacionasistnciasharepointpage.tsx` | ACTIVA |
| Comunicaciones móviles `/administracion/comunicaciones`, `/monitor-comunicaciones` | `features/admin/MobileCommunication{Composer,Monitor}Page.tsx` | ACTIVA (rol 5) |
| `/administracion/{asistencia,marcacion,solicitudadministracion}` | — | STUB |
- **BE**: EmpleadoPendienteController, AsistenciaSharePointController, Mobile*Controller.

## 7. Operaciones / Asistencia de campo
| Página | Archivo | Estado |
|---|---|---|
| Aprobar campo `/operaciones/operacion/aprobarcampo` | `features/operaciones/operacion/aprobarcampo.tsx` | ACTIVA (aprobar ingreso/salida, rechazar) |
| Seguimiento empleado `/operaciones/operacion/seguimientoempleado` | `seguimientoempleado.tsx` | ACTIVA (tracking GPS, Google Maps) |
| Suministro `/operaciones/operacion/suministro` | `suministro.tsx` | ACTIVA |
| Reembolso `/operaciones/operacion/reembolso` | `reembolso.tsx` | ACTIVA lectura (actualizar → 501) |
| `/operaciones/operacion` | `operacion.tsx` | Menú de tarjetas |
| `/operaciones/{capitalizacion,asignacion}` | — | STUB · `operacion/compensacion.tsx` vacío |
- **BE**: AsistenciaValidarCampoController, AsistenciaReporteController (tracking), LogisticaSuministroController, LogisticaReembolsoController.

## 8. Logística
- `/logistica/gestionequipos/recojo` → `recojo.tsx` ACTIVA (LogisticaRecojoController → `sp_Logistica_Recojo_*`).
- `/logistica/gestionequipos/{cruce,desmontado,solicitudequipo}`, `/logistica/almacen/{almacen,inventario}` → STUB. `CruceSeriesPage.tsx` huérfano.

## 9. Reportes
| Página | Archivo | Estado |
|---|---|---|
| Reporte asistencia `/reportes/rptasistencia` | `features/reportes/rptasistencia.tsx` (8970 l) | ACTIVA (5 pestañas, PDF, llamadas de atención) |
| `/reportes/rptasistenciaempleado` | `rptasistenciaempleado.tsx` (6328 l) | ACTIVA (fork ~96 % igual) · `rptasistencia copy.tsx` HUÉRFANO |
| Gerenciales `/reportes/gerencial/{dashboardcj,dashboard1,dashboard3,backlog,ingresosegresos,analisis,analisisproyecto,mapasite}` | `features/reportes/gerencial/*` | ACTIVAS (recharts/xlsx). `dashboard2.tsx` HUÉRFANO |
| IA Chat `/reporte(s)/administrativo/iachat` | `features/reportes/administrativo/iachat.tsx` | ACTIVA (OpenAI + Anthropic) |
| `/reporte(s)/administrativo/claudeia` | `claudeia.tsx` | Utilidad local de prompts (sin backend) |
| CJ Intelligence `/cj-intelligence`, `/cj-intelligence/knowledge` | `features/cj-intelligence/**` | **ROTO** (llama `/ai/*` inexistente) |
| Reportes WUP `/mantenimiento/sistemas/{rptwup,rptwupgerencial,rptboleta}` | `features/mantenimiento/sistemas/*` | ACTIVAS (config + ejecución de jobs WhatsApp) |
| Envío de mensajes `/inicio/enviomensajes` | `features/inicio/enviomensajes.tsx` | ACTIVA (envío manual WUP) |
| SQL Monitor `/sqlmonitor` | `features/sqlmonitor/pages/sqlmonitor.tsx` | ACTIVA |
| `/reporte/{operativo,financiero}`, `/inicio/{indicadoresgerenciales,panelprincipal,alertas}` | — | STUB |
- **BE**: ReportesGerencialesController, ReportesWhatsappController, WhatsappWebhookController, IaChatController, SqlMonitorController, AsistenciaReporteController · ReporteAutomaticoService, ReportePdfService, ReporteRepository, IaChatService (5716 l), SqlMonitorService, WupService, MetaWhatsAppService, WhatsappInboundService.
- **SPs**: `RptAsistenciaFechas`, `sp_EmpleadoCj_Listar_Wup(_Gerencia)`, `sp_IA_Planilla_Buscar`, `sp_Monitor_*`, `sp_Site_Listar`, `sp_Importar_ConsultaDsh`, `sp_Movimientos_Consulta_GastosIngresos`.

## 10. Arrendamientos
- **FE**: `features/arrendamientos/pages/*` (dashboard, maestros, arrendadores, inquilinos, inmuebles, unidades, contratos, obligaciones, pagos, dshpagos (=pagosdsh), fraccionamientos, garantias, arbitrios, estado-cuenta, cobranza, tipos-cambio, reportes ACTIVAS; documentos/auditoria/configuracion STUB) + `components/ArrendamientosCrudPage`, `ArrendamientosListPage`, `ArrendamientosDashboardView`. API: `arrendamientosService.ts`.
- **BE**: Arrendamientos/ArrendamientosController → Arrendamientos/ArrendamientosService (2707 l).
- **SPs/Tablas**: `sp_a_*`, `sp_Arrendamiento_ResumenAnual`; tablas `a_*` (DDL completo en `Database/Arrendamientos/`). Módulo más autocontenido; no depende de Planilla.

## 11. Mobile (backend para app Expo externa)
- **BE**: MobileCommunicationController, MobileDeviceController, MobileMonitorController, MobileVersionController · MobileCommunicationService, MobileDeviceService, MobilePushDispatchService, MobileCommunicationPublisher (sin consumidores) · Job `MobilePushDispatchJob`.
- **SPs/Tablas**: `sp_Comunicacion_*`, `sp_ComunicacionAdjunto_*`, `sp_ComunicacionPush_*`, `sp_DispositivoMovil_*`; tablas Comunicacion*, DispositivoMovil (DDL en `Database/Mobile/`, README desactualizado).

## 12. Comercial / Planta / Inicio
- `/comercial/{cliente,facturacion,cobranzas}`, `/planta/{principal,epps}`, `/inicio/{indicadoresgerenciales,panelprincipal,alertas}` → **STUB**. `features/gestion/*` HUÉRFANO.
- Dashboard principal `/admin/DashboardPage` (`features/admin/DashboardPage.tsx`) = lanzador del menú dinámico.

## Módulos NO encontrados en el código
SAP, Telegram, Facturación electrónica real, Contabilidad operativa (solo stubs), OT como módulo propio (OT vive en `importar` + lookups), Vacaciones con UI del modelo nuevo.
