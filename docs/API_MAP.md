# Mapa de API — Cj ERP Web

> Todas las rutas llevan prefijo `/api`. Servicios FE en `cjerp-frontend/src/api/` salvo indicación. BE: `C/` = `CjERP.Api/Controllers/`, `S/` = `CjERP.Infrastructure/Services/`.
> **Autorización:** todos los controllers tienen `[Authorize]` de clase (solo exige JWT válido + sesión activa) **sin roles ni policies**, salvo lo indicado en la columna Auth. Excepciones anónimas: `POST /auth/login`, `POST /auth/logout-beacon`, `GET /TestConnection`, `/health`, `GET|POST /whatsapp/webhook`.
> Envelope: la mayoría responde `{success,message,data}`; Seguridad/Lookup/IaChat/PagoTesoreria responden datos crudos (el `httpClient` FE tolera ambos).
> Antes de crear un endpoint: buscar aquí por entidad/SP. Análisis 2026-09-25.

## Leyenda Auth
`JWT` = solo autenticado · `MENU(ruta)` = verifica que el usuario tenga esa ruta en su menú · `ROL5` = claim IdRol ∈ `MobileMonitor:AdminRoleIds` · `ADM` = `ReporteAutomaticoService.UsuarioTieneAccesoAdministrativoAsync` · `EMP` = requiere claim IdEmpleadoCj>0 · `ANÓN` = anónimo

---

## 1. Autenticación y Seguridad
| Método Ruta | Controller | Servicio → SP/SQL | Auth | FE consumidor |
|---|---|---|---|---|
| POST /auth/login | C/AuthController | AuthService → `sp_ValidarUsuario`; JwtService; ActiveUserSessionService | ANÓN, sin rate limit | features/auth/services/authService.ts (LoginPage) |
| POST /auth/logout | AuthController | ActiveUserSession.LogoutSession | JWT | features/auth/services/logoutSession.ts |
| POST /auth/logout-beacon | AuthController | JwtService.ValidateToken(sin lifetime) | ANÓN | logoutSession (sendBeacon) |
| GET /auth/me | C/AuthMeController | claims (bug: lee `IdEmpleado`) | JWT | sin uso |
| GET /Seguridad/perfil | C/SeguridadController | claims | JWT | sin uso |
| GET /TestConnection | C/TestConnectionController | CJERPDbContext.CanConnect | ANÓN | sin uso |
| GET /menu/dinamico?idUsuario&idPerfil&idRol | C/SegMenuController | SegMenuService → `sp_Seguridad_ObtenerMenuDinamico` | JWT (idUsuario del query ⇒ IDOR) | features/seguridad/services/menuService.ts (MainLayout, DashboardPage) |
| GET /menu/dinamico-total | SegMenuController | `sp_Seguridad_ObtenerMenuDinamicoTotal` | JWT | sin uso |
| GET /menu/perfil/{idPerfil}/dinamico | SegMenuController | `sp_Seguridad_ObtenerMenuDinamico` | JWT | sin uso |
| GET /menu/completo | SegMenuController | `sp_SegMenu_ListarCompleto` | JWT | menuService (menu, perfil-rol-menu, usuario-perfil-rol-menu, permisos) |
| GET /menu/usuario/{idUsuario} | SegMenuController | SQL inline SegMenu/SegUsuarioPerfilRol/SegPerfilRol/SegPerfilRolMenu | JWT | sin uso FE (lo usa PagoTesoreriaController) |
| GET /menu/usuario/{idUsuario}/perfil-rol | SegMenuController | SQL inline | JWT | menuService (usuariorol) |
| POST /menu/principal · POST /menu/nodo | SegMenuController | `sp_SegMenu_Crear` | JWT | menuService (usuario-perfil-rol-menu, menu) |
| GET /menu/perfil/{p}/rol/{r}/asignado | SegMenuController | `sp_SegPerfilRolMenu_ListarAsignado` | JWT | menuService |
| POST /menu/rol/asignacion | SegMenuController | tx: `sp_SegPerfilRolMenu_EliminarPorPerfilRol` + N×`sp_SegPerfilRolMenu_Insertar` | JWT | menuService |
| POST /menu/usuario-perfil-rol | SegMenuController | `sp_SegUsuarioPerfilRol_Insertar` | JWT | menuService (se invoca 2 veces, bug) |
| POST /menu/usuario-perfil · GET /menu/usuario-perfil/existe | SegMenuController | `sp_SegUsuarioPerfil_Guardar` / SELECT | JWT | FE llama `/menu/usuario-perfil-rol/existe` (inexistente) |
| POST /menu/perfil-usuario/sincronizar | SegMenuController | tx N×`sp_SegPerfilRolMenu_Insertar` | JWT | sin uso |
| GET/POST /perfiles · GET/PUT/DELETE /perfiles/{id} · GET /perfiles/{id}/roles | C/SegPerfilController | `sp_SegPerfil_ListarActivos/ObtenerPorId/Crear/Actualizar/Eliminar`, `sp_SegPerfilRol_ComboRolesPorPerfil` | JWT | features/seguridad/services/perfilesService.ts, rolesService.ts |
| GET/POST /roles · GET/PUT/DELETE /roles/{id} | C/SegRolController | `sp_SegRol_*` | JWT | rolesService.ts |
| GET /usuarios | C/SegUsuarioController | `sp_UsuarioListar` | JWT | usuariosService.ts |
| GET/POST /seguridad-permisos-acciones · GET/PUT/DELETE /{id} | C/Seguridad/SegPermisosAccionesController | `sp_SegPermisoAccion_Listar/Obtener/Guardar/Eliminar` | JWT | seguridadPermisosAccionesService.ts (permisos.tsx, **oc_v1**, **pagos_v1**) |
| GET /seguridad-permisos/rol/{idRol} · /rol/{r}/menu/{m} · POST /guardar · PUT /rol/{idRol} | C/Seguridad/SegRolMenuPermisoController | `sp_SegRolMenuPermiso_*` | JWT | seguridadPermisosService.ts (**huérfano**) |
| GET /auditoria-cambios?modulo&entidad&idRegistro&seccion&campo&usuarioAccion&fechaDesde&fechaHasta&top | C/AuditoriaCambiosController | AuditoriaCambiosService → SQL inline `dbo.AuditoriaCambios` | JWT | auditoriaCambiosService.ts (modificaciones.tsx, aprobarcampo.tsx) |
| GET /sqlmonitor/{resumen,queries,sesiones,top-sql,bloqueos,network,alertas,overhead,query/{id}} | C/SqlMonitorController | SqlMonitorService → `sp_Monitor_*` / DMVs | JWT | sqlMonitorService.ts (sqlmonitor.tsx) |
| POST /sqlmonitor/analizar/{id} | SqlMonitorController | QueryDetalle + OpenAI | JWT | sqlMonitorService.ts |
| POST /sqlmonitor/cancelar/{sessionId} | SqlMonitorController | `KILL {sessionId}` | **JWT (sin rol — crítico)** | sqlMonitorService.ts |

## 2. Lookups (catálogos reutilizables)
| Método Ruta | Servicio → SP | FE |
|---|---|---|
| GET /lookup/constantes?campo= | LookupService → `sp_Constante_ListarPorCampo` | constantesService.ts, **hooks/useConstantesPorCampo** |
| GET /lookup/solicitantes?idCargo&idEmpleado | `sp_ListarSolicitante` | solicitanteService.ts |
| GET /lookup/gestores?idEmpleado | `sp_ListarGestor` | gestorService.ts |
| GET /lookup/validador?idEmpleado | `sp_ListarValidador` | validadorService.ts |
| GET /lookup/gestor-validador?idEmpleadoCj | `sp_Empleado_Listar_GestorValidador` | gestorService.ts |
| GET /lookup/ubigeos | `sp_Listar_Ubigeo` | ubigeoService.ts |
| GET /lookup/filtro-operativo/filtros · /tipotrabajo?filtroKey · /ot?filtroKey · /tareas | `sp_Importar_FiltroOperativo_Listar`, `sp_Importar_TipoTrabajo_Listar`, `sp_Importar_OT_Listar`, (tareas: PV) | filtroOperativoService.ts, **hooks/useFiltroOperativoLookup**, components/lookups/FiltroOperativoLookup |
| GET /lookup/filtro-operativo/valores-gasto | `sp_Finanzas_CargarValoresGasto` | filtroOperativoService.getValoresGasto (gastos) |
| GET /lookup/gastos/bootstrap?idCargo&idEmpleado | empleados+solicitantes+gestores+validadores+tareas en paralelo | gastosBootstrapService.ts |
| GET /empleado/cta/listar | EmpleadoCtaService → `sp_Empleado_Cta_Listar` (incluye cuentas bancarias) | empleadoService.listarEmpleadosCta |
| GET /empleado/cta/listar-wup | `sp_EmpleadoCj_Listar_Wup` | empleadoService.listarEmpleadosWup (muy reutilizado) |
| GET /empleado/cta/listar-cargo?idCargo=30 | `sp_EmpleadoCj_Listar_Cargo` | empleadoService.listarEmpleadosPorCargo |
| GET /empleado/ficha?idEmpleado&nombreEmpleado&idCargo | C/EmpleadoFichaController → `sp_EmpleadoCj_Ficha` (params por sys.parameters) | fichaService.ts |

## 3. Tesorería / Recibos (tabla Planilla)
| Método Ruta | Controller | Servicio → SP/SQL | Auth | FE |
|---|---|---|---|---|
| POST /planilla/consulta-estados | C/PlanillaConsultaController | PlanillaConsultaService.ResolveStoredProcedureName por `consulta`: `aprobar`→`sp_Planilla_Consulta_Aprobar`; `vacaciones`→`sp_EmpleadoOtros_ListarVacaciones`; `vacaciones-total`→`…Total`; `pagados-dashboard`→`sp_Planilla_ConsultarPagados_Dsh`; `importar-consulta-dsh`→`sp_Importar_ConsultaDsh`; `importar-resumen-ot`→`sp_Importar_ResumenOT`; `planilla-ot-resumen`→`sp_Planilla_OT_Resumen`; `planilla-oc-resumen`→`sp_Planilla_OC_Resumen`; `movimientos-gastos-ingresos`→`sp_Movimientos_Consulta_GastosIngresos`; `analisis-gastos`→`sp_OrdenCompra_Consulta_Estados`; `clientes-activos`/`proyectos-activos`→SQL inline; **default** (`gastos`, `pagos-v1`, …)→`sp_Planilla_Consulta_Estados` | JWT (IdCargo/IdEmpleado aceptados del body ⇒ crítico) | planillaConsultaService.ts, importarConsultaService.ts, movimientosConsultaService.ts (pagos_v1, gastos, gastosaprobar, oc_v1, conciliacion_v1, dashboards, vacaciones) |
| GET /planilla/consulta-estados/gastos-pagados/{id} | PlanillaConsultaController | `sp_Planilla_Consulta_Estados` + SQL inline | JWT | planillaConsultaService.consultarGastosPagadosPorId |
| PUT /planilla/consulta-estados/{id}/tarea | PlanillaConsultaController | PlanillaService → `sp_Planilla_Actualizar` + Auditoría | JWT | planillaConsultaService |
| PUT /planilla/consulta-estados/{correlativo}/nro-operacion | PlanillaConsultaController | `sp_Planilla_Actualizar` + Auditoría | JWT | conciliacion_v1 |
| POST /planilla/consulta-estados/aprobar-masivo | PlanillaConsultaController | PlanillaService → `sp_Planilla_ProcesarAprobacionMasiva` (TVP `TVP_Planilla_Aprobacion`) | JWT | planillaConsultaService.aprobarPlanillaMasiva (**pagos_v1**, pagos_dev) |
| POST /planilla/consulta-estados/{correlativo}/rechazar | PlanillaConsultaController | `sp_Planilla_ActualizarEstado` (CodEstado=3) | JWT | pagos_v1 |
| POST /tesoreria/gastos | C/TesoreriaGastosController | PlanillaService → `sp_Planilla_Insertar` + Auditoría | JWT | gastos.tsx, gastosaprobar.tsx, conciliacion_v1 (httpClient directo) |
| PUT /tesoreria/gastos/{id} | TesoreriaGastosController | `sp_Planilla_Actualizar` | JWT | gastos.tsx |
| DELETE /tesoreria/gastos/{id} | TesoreriaGastosController | **solo lista en memoria (no BD)** | JWT | gastos, gastosaprobar |
| GET /tesoreria/gastos · /{id} | TesoreriaGastosController | **lista estática en memoria** | JWT | — |
| POST /tesoreria/gastos/{id}/rechazar | TesoreriaGastosController | `sp_Planilla_ActualizarEstado` (3) | JWT (IdAprobador del body) | gastos, gastosaprobar |
| GET /tesoreria/gastos/suministros-vigentes | TesoreriaGastosController | `sp_SuministroProvisional_ObtenerVigente` | JWT | gastos |
| POST /tesoreria/gastos/upload-factura (10 MB) | TesoreriaGastosController | SharePointCommercialUploadService | JWT | gastos, pagoTesoreriaService.subirFacturaRevision |
| GET /tesoreria/pagos/catalogos | C/PagoTesoreriaController | PagoTesoreriaService (SQL inline + `sp_Empleado_Cta_Listar`, `sp_Constante_ListarPorCampo`, `sp_Listar_Cliente`) | MENU(`/finanzas/tesoreria/pagartesoreria[_v1]`) | pagoTesoreriaService.ts |
| GET /tesoreria/pagos?estado=5&desde&hasta&correlativo&idBancos | PagoTesoreriaController | SQL inline sobre Planilla | MENU | pagartesoreria.tsx |
| GET /tesoreria/pagos/v1 | PagoTesoreriaController | PagoTesoreriaWorkflow → `sp_Planilla_ConsultaIni` (1 llamada por banco) | MENU | pagartesoreria_v1.tsx |
| GET /tesoreria/pagos/reporte-resumen | PagoTesoreriaController | `sp_Planilla_ReporteResumen` | MENU | pagartesoreria_v1 |
| GET /tesoreria/pagos/cuentas/{responsable} | PagoTesoreriaController | SQL inline CuentaEmpleado | MENU | pagoTesoreriaService |
| POST /tesoreria/pagos (pagar) | PagoTesoreriaController | tx: `sp_Planilla_AdministrativoMasivo` (desde 5) / `sp_Planilla_PagoContabilidadMasivo @Opc=2` (desde 8), TVP `PlanillaRevisionType` | MENU | pagartesoreria*.tsx |
| POST /tesoreria/pagos/grabar | PagoTesoreriaController | **UPDATE inline 8→4 sin tx/versión/log** | MENU | pagartesoreria.tsx |
| POST /tesoreria/pagos/acciones | PagoTesoreriaController | Workflow.EjecutarAccionAsync: `sp_Planilla_ActualizarRevisionMasiva` (revisar), `sp_Planilla_ContabilidadMasivo`, `sp_Planilla_PasarAdministrativoMasivo`, `sp_Planilla_ProgramarMasivo`, `sp_Planilla_ActualizarRendirMasivo`, UPDATE inline (administrativo/observar/corregir/subsanar) + LogPlanilla + MovEstadosPagos | MENU | PagoEtapaForm.tsx |
| PUT /tesoreria/pagos/revision | PagoTesoreriaController | PagoTesoreriaRevision (tx + UPDLOCK) | MENU | PagoRevisionCells.tsx |
| GET /tesoreria/pagos/revision/{correlativo}/factura | PagoTesoreriaController | Planilla.ImgFactura + proxy gestor legacy elnk.uno | MENU | pagoTesoreriaService |
| GET/POST /tesoreria/cheques · GET/PUT /{idCheque} · POST /{id}/rechazar | C/TesoreriaChequesController | ChequeEmpleadoService → `sp_ChequeEmpleado_Listar/Obtener/Insertar/Actualizar` | JWT (estado de rechazo lo envía el cliente) | chequeService.ts (cheques.tsx) |
| POST /tesoreria/cheques/upload-imagen · GET /imagen?ruta= | TesoreriaChequesController | SharePoint upload/download (ruta libre) | JWT | chequeService.ts |

## 4. Orden de Compra — `/facturacionfinanciera/oc`
| Método Ruta | Servicio (S/OrdenCompraService) → SP/SQL | FE |
|---|---|---|
| GET /cabecera | `sp_OrdenCompra_BuscarCabecera` + SQL inline validador | ordenCompraService.ts (oc, oc_v1) |
| GET /detalle | `sp_OrdenCompra_BuscarDetalle` o SQL inline (edición) | idem |
| POST / | `sp_OrdenCompra_Insertar` (@Detalle JSON) + UPDATE IdWeb + N UPDATE (sin tx) | idem |
| GET /{idOc}/edicion · PUT /{idOc} | SQL inline; PUT en tx con `MAX(Fila)+1` | oc_v1 |
| POST /aprobar | tx; UPDATE `IdAprobador{n}` Cab/Det; nivel 3 ⇒ IdEstado=1 | oc_v1 (pestañas `tab.validacion_2/3` vía SegPermisoAccion **solo FE**) |
| POST /rechazar-masivo | `sp_OrdenCompra_RechazarMasivo` (IdRechazador del body) | oc, oc_v1 |
| POST /detalle/editar | SQL dinámico con lista blanca | oc_v1 |
| GET /recibos/asociados · /recibos/sin-asociar · POST /recibos/asociar | SQL inline Planilla.IdOc/Fila | oc_v1 |
| GET /monto-oc · GET /consumo | SQL inline | oc_v1, pagos_v1 (OrdenCompraConsumoDto) |
| GET /{idOc}/pdf | OrdenCompraPdfDocument (QuestPDF) | oc_v1 |
| POST /archivo (25 MB) · GET /archivo/{codigo} | proxy gestor legacy `elnk.uno/cjmultimedia/mgr001.php` | oc_v1 |

## 5. Conciliación bancaria — `/finanzas/conciliacion` (C/FinanzasConciliacionController → S/ConciliacionBcpService)
| Método Ruta | SP | FE |
|---|---|---|
| POST /analizar | ClosedXML + heurística + OpenAI opcional | conciliacionService.ts |
| POST /insertar | `sp_MovimientosConciliacion_Insertar(@FilasJson)` o `sp_MovimientosBcp_Insertar` | idem |
| POST /exportar-analisis | OpenAI | idem |
| POST /conciliar-planilla | `sp_MovimientosBcp_Buscar` + `sp_Planilla_Consulta_Estados` (cruce en C#) | conciliacion.tsx |
| POST /conciliar-planilla-v1 | `sp_MovimientosConciliacion_Buscar` + `sp_Planilla_Consulta_Estados` | conciliacion_v1.tsx |
| PUT /movimientos/{id}/comentario · /comentario-v1 | UPDATE inline (v1 actualiza 2 tablas con mismo Id) | idem |
| GET /clasificacion/combos | `sp_MovimientosBcp_ObtenerCombosClasificacionContable` | idem |
| PUT /movimientos/clasificacion · /clasificacion-v1 | `sp_MovimientosBcp_/sp_MovimientosConciliacion_ActualizarClasificacionContable` | idem |

## 6. RRHH
| Método Ruta | Controller | Servicio → SP/SQL | FE |
|---|---|---|---|
| POST /admin/vacaciones | C/VacacionesController | VacacionesService → `sp_EmpleadoOtros_GrabarVacaciones` (IdEstado 97) | vacacionesService.crearVacacion (vacaciones.tsx, vacacionespage.tsx) |
| POST /admin/vacaciones/aprobar | VacacionesController | `sp_EmpleadoOtros_ActualizaarVacaciones` | aprobarVacacion |
| POST /admin/vacaciones/rechazar | VacacionesController | UPDATE inline EmpleadoOtros → 0 | rechazarVacacion |
| GET /admin/vacaciones/listar?consulta= | VacacionesController | PlanillaConsultaService (`vacaciones`/`vacaciones-total`; `consulta` libre) | listarVacaciones |
| POST /admin/vacaciones/politica · /periodo/generar · /periodo/generar-masivo · /solicitud · /solicitud/{aprobar,rechazar,cancelar,finalizar} · /movimiento/revertir; GET /saldo/{id} · /solicitud/listar | VacacionesController | `sp_Vacacion_*` (modelo nuevo) | **sin UI** (funciones existen en vacacionesService.ts) |
| GET /admin/vacaciones/movimiento/listar | VacacionesController | SQL inline VacacionMovimiento | vacacionespage.tsx |
| GET /admin/compensacion · /saldos · /saldo · /{id}; POST / · /procesar; PUT /{id}; DELETE /{id} | C/CompensacionController | CompensacionService → `sp_EmpleadoCompensacion*` (+SQL inline) | compensacionService.ts (compensacionreal.tsx) |
| GET /recursoshumanos/contratos/{idEmpleado} · /resumen; POST /plantilla; PUT /renovar; POST /{id}/aprobar-vigencia; PUT /historial/{id}/desactivar | C/ContratosController (SQL inline en controller) | `sp_EmpleadoCj_Ficha`, EmpleadoCjSolicitudVigencia, EmpleadoCjHistorialLaboral, SharePoint (plantillas DOCX), SMTP | contratosService.ts (contratos.tsx, vacacionespage) |
| POST /recursoshumanos/planillas/validar-xml · /importar-xml | C/PlanillaBoletaController | PlanillaBoletaService → PlanillaBoletaRepository → `sp_PlanillaBoleta_ImportarXml` | planillaBoletaApi.ts (planillas.tsx) |
| GET /planilla-boleta/pdf/{id} · /pdf-base64/{id} · /pdf-masivo/{periodo} · /firma-diagnostico/{id} | PlanillaBoletaController | PlanillaBoletaPdfGenerator (QuestPDF) + firma SharePoint | planillaBoletaApi.ts, rptwup.tsx |
| POST /administracion/pendientes/buscar · /insertar · /actualizar · /upload-archivo | C/EmpleadoPendienteController | `sp_EmpleadoPendiente_Listar/Insertar/Actualizar`, SharePoint | empleadoPendienteService.ts (pendientes.tsx) |
| GET /mantenimiento/empleados · /{id} · /lookups; POST /; PUT /{id}; POST /{id}/aprobar; DELETE /{id} | C/MantenimientoEmpleadosController (SQL en controller) | `sp_EmpleadoCj_Ficha/Actualizar/EliminarLogico`, `sp_Empleado_ListarValidadores`, `sp_Constante_ListarPorCampo`, `SP_GenerarUsuario`, INSERT/UPDATE inline EmpleadoCj/Empleado/Usuario/Asistencia | empleadosCrudService.ts (empleados.tsx, m_empleado.tsx) |
| (mismas rutas) /mantenimiento/externos | C/MantenimientoExternosController (**copia** del anterior, IdCargo 51) | idem | externosCrudService.ts (externo.tsx) |
| POST /mantenimiento/migracion/analizar · /aplicar | C/MantenimientoMigracionController | MigracionImportService → `updimportar` + `sp_MigracionImport_Insertar/Actualizar` | migracionImportService.ts (m_importar.tsx) |
| POST /mantenimiento/migracion/importar/procesar | C/MantenimientoMigracionImportController | `sp_MigracionImport_ProcesarNew` (TVP) | migracionImportProcesarNewService.ts (importar.tsx) |

## 7. Asistencia
| Método Ruta | Controller | Servicio → SP | FE |
|---|---|---|---|
| GET /asistencia/reporte | C/AsistenciaReporteController | AsistenciaReporteService → `RptAsistenciaFechas` + `sp_EmpleadoCj_Listar_Wup` | asistenciaService.buscarAsistencia (rptasistencia*, timeout 120 s) |
| POST /asistencia/reporte/pdf-empleado · /pdf-empleado-validacion · /pdf-gerencial | AsistenciaReporteController | QuestPDF | asistenciaService, rptwup |
| POST /asistencia/reporte/pdf-empleado-llamada-atencion · /enviar · /preview; GET /llamada-atencion/enviada-hoy/{id}; POST /llamada-atencion/enviada-hoy | AsistenciaReporteController | ReporteRepository (ReporteWhatsAppLog), Hangfire `AsistenciaReporteJob` + SMTP | rptasistencia.tsx |
| PUT /asistencia/reporte/estado-marcacion | AsistenciaReporteController | `sp_Asistencia_ActualizarEstadoEmpleado` + Auditoría | rptasistencia.tsx |
| GET /asistencia/reporte/tracking | AsistenciaReporteController | `sp_AsistenciaTracking_Consulta` | seguimientoempleado.tsx |
| GET /operacion/aprobarcampo/listar · /detalle | C/AsistenciaValidarCampoController | `sp_Asistencia_ValidarCampo` (sin params, filtro en memoria) | aprobarCampoService.ts (aprobarcampo.tsx) |
| POST /operacion/aprobarcampo · PUT /operacion/aprobarcampo | AsistenciaValidarCampoController | INSERT/UPDATE dinámico `dbo.Asistencia` + Auditoría | idem, rptasistencia |
| POST /operacion/aprobarcampo/aprobar-ingreso · /aprobar-salida · /rechazar | AsistenciaValidarCampoController | `sp_Asistencia_AprobarIngreso/AprobarSalida/RechazarDocumento` | idem (IdAprobador aceptado del body) |
| GET/PUT /admin/asistencia-sharepoint/configuracion · POST /ejecutar · GET /historial · POST /historial/{id}/reintentar | C/AsistenciaSharePointController | Scheduler + AsistenciaSharePointRepository (`sp_Asistencia_BuscarPorFechas_Job`) | ADM · asistenciaSharePointService.ts (exportacionasistnciasharepointpage.tsx) |

## 8. Operación / Logística
| Método Ruta | Controller → Servicio → SP | FE |
|---|---|---|
| POST /logistica/recojo/buscar · /insertar | LogisticaRecojoController → `sp_Logistica_Recojo_Buscar/Insertar` | logisticaRecojoService.ts (recojo.tsx) |
| POST /operacion/reembolso/buscar · /actualizar (**501**) | LogisticaReembolsoController → `sp_Planilla_Listar_Reembolso` | logisticaReembolsoService.ts (reembolso.tsx) |
| POST /operacion/suministro/buscar · /kpis · /insertar · /actualizar · /upload-imagen | LogisticaSuministroController → `sp_SuministroProvisional_Listar/Kpis/Insertar/Actualizar` + SharePoint | logisticaSuministroService.ts (suministro.tsx) |

## 9. Reportes, integraciones, Mobile, IA
| Método Ruta | Controller → Servicio → SP | Auth | FE |
|---|---|---|---|
| GET /reportes/gerencial/mapasite · /mapapersonal | ReportesGerencialesController → LookupService → `sp_Site_Listar` / `sp_Asistencia_UltimoMovimientoEmpleado` | JWT | mapasiteService.ts (mapasite.tsx) |
| GET /reportes-whatsapp/dashboard?tipo&periodo&topLogs | ReportesWhatsappController → ReporteAutomaticoService → ReporteRepository (logs con PDF base64) | **JWT sin ADM (crítico)** | reportesWhatsappService.ts (rptwup*) |
| GET/PUT /reportes-whatsapp/configuracion · POST /reprogramar-job · /ejecutar-ahora · /reintentar-fallidos · /enviar-mensaje-manual | ReportesWhatsappController → scheduler / Hangfire `ReporteWhatsAppJob` / WupService | ADM, sin rate limit | reportesWhatsappService.ts (rptwup, rptwupgerencial, rptboleta, enviomensajes) |
| GET/POST /whatsapp/webhook | WhatsappWebhookController → WhatsappInboundService → WUP/Meta | **ANÓN, POST sin firma** | Meta / WUP |
| POST /ia-chat/consultar | IaChatController → IaChatService (OpenAI planner) → `sp_IA_Planilla_Buscar` + `sp_IaChatAuditoria_Insertar` | JWT | iachat/services/iaChatService.ts (iachat.tsx, dashboardcj.tsx) |
| POST /ia-chat/exportar-dashboard | IaChatService → Anthropic (HTML) | JWT | iachat.tsx |
| `/ai/*` (status, chat, conversations, knowledge) | **NO EXISTE en backend** | — | features/cj-intelligence/** (roto) |
| GET /mobile/comunicaciones · /{id} · /pendientes · /{id}/adjuntos · /{id}/adjuntos/{idAdj}/descargar; POST /{id}/leer · /{id}/confirmar; GET /mobile/notificaciones/resumen | MobileCommunicationController → `sp_Comunicacion_*`, `sp_ComunicacionAdjunto_*` | EMP | App móvil (fuera del repo) |
| POST /mobile/dispositivos/registrar · /desactivar | MobileDeviceController → `sp_DispositivoMovil_*` | EMP | App móvil |
| GET /mobile/admin/monitor · /destinatarios · /comunicaciones/{id}/seguimiento · /dispositivos; POST /mobile/admin/comunicaciones · /{id}/adjuntos | MobileMonitorController → MobileCommunicationService / SharePoint | ROL5 | MobileCommunicationMonitorPage, MobileCommunicationComposerPage |
| GET /mobile/version?platform | MobileVersionController (options) | JWT | App móvil |

## 10. Arrendamientos — `/arrendamientos` (C/Arrendamientos/ArrendamientosController → S/Arrendamientos/ArrendamientosService)
| Método Ruta | SP / SQL | FE |
|---|---|---|
| GET dashboard · dshpagos · arrendadores · inquilinos · inmuebles · unidades · contratos · obligaciones · pagos · fraccionamientos · garantias · arbitrios · tipos-cambio · estado-cuenta | SQL inline (columnas opcionales detectadas en runtime) | arrendamientosService.ts |
| GET pagosdsh/resumen-anual | `sp_Arrendamiento_ResumenAnual` | dshpagos.tsx |
| POST arrendadores · inquilinos · inmuebles · unidades · contratos · contratos/unidades · fraccionamientos · garantias · cobranzas · arbitrios · tipos-cambio | `sp_a_<Entidad>_Guardar` / `sp_a_Cobranza_Gestion_Registrar` / `sp_a_TipoCambioDiario_Guardar` (params filtrados por sys.parameters) | páginas de arrendamientos |
| POST contratos/versiones | tx C# INSERT inline a_contrato_version(+_detalle) | contratos.tsx |
| POST obligaciones/generar | `sp_a_Obligacion_Generar(@ObligacionesJson)` | arrendamientosService |
| POST pagos · pagos/{id} · pagos/{id}/aprobar · /aplicar · /revertir | `sp_a_Pago_Registrar/Aprobar/Aplicar/Revertir` | pagos.tsx |

## 11. Endpoints/servicios FE sin contraparte o sin uso
- FE sin backend: `/ai/*` (cj-intelligence), `/menu/usuario-perfil-rol/existe`.
- Backend sin consumidor FE: `/auth/me`, `/Seguridad/perfil`, `/TestConnection`, `/menu/dinamico-total`, `/menu/perfil/{id}/dinamico`, `/menu/usuario/{id}`, `/menu/perfil-usuario/sincronizar`, `/seguridad-permisos/*`, `/admin/vacaciones/{politica,periodo*,solicitud*,saldo,movimiento/revertir}`, `GET /tesoreria/gastos[/{id}]`.
- FE muerto: `src/api/tesoreriaService.ts`, `features/seguridad/services/seguridadPermisosService.ts`.
- Dos servicios FE para el mismo endpoint: `importarConsultaService.ts` y `movimientosConsultaService.ts` (→ `/planilla/consulta-estados`).
