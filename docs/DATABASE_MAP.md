# Mapa de base de datos — Cj ERP Web

> Fuente: scripts en `CjERP.Backend/Database/**` + SQL/SP referenciados desde C#. Análisis 2026-09-25.
> **Advertencia principal:** de **183 SPs referenciados** por el backend, solo **~61 tienen definición en el repo**. Las tablas núcleo (`Planilla`, `CabOrdenCompra`, `DetOrdenCompra`, `EmpleadoCj`, `Empleado`, `Usuario`, `Constante`, `Seg*`, `Asistencia`…) **no tienen DDL en el repo**. Todo lo que dependa de esas definiciones es **PENDIENTE DE VALIDACIÓN** contra la BD.
> Antes de crear un SP/tabla: buscar en la tabla de §3 y en la BD (`sys.procedures`, `sys.tables`).

## 1. Convenciones observadas
- SPs con prefijo `dbo.sp_<Entidad>_<Acción>` (`Listar`, `Buscar`, `Obtener`, `Insertar`, `Actualizar`, `Guardar` (=upsert), `Eliminar`, `Aprobar`, `…Masivo`). Arrendamientos usa prefijo `sp_a_` y tablas `a_*`.
- Scripts SQL de repo usan mayoritariamente `ALTER PROCEDURE` (asumen que el SP ya existe) o `CREATE OR ALTER`; algunos parches reescriben SPs con `REPLACE(OBJECT_DEFINITION(...))` (`Database/Planilla/03b/03d/03e`) — frágil. `Database/Planilla/03c_*.sql` está corrupto.
- Operaciones masivas: TVP (`dbo.TVP_Planilla_Aprobacion`, `dbo.PlanillaRevisionType`, `dbo.Type_MigracionImport`) o JSON (`@Detalle`, `@FilasJson`, `@DestinatariosJson`, `@ObligacionesJson`, `@AplicacionesJson`). Definiciones de los TVP: no están en el repo.
- Catálogos: tabla **`Constante`** (`Sociedad='PE01'`, `Programa` = `PLANTILLA`|`MAESTRO`|`ASIGNACIONES`…, `Campo`, `Correlativo`, `ValorIni`, `ValorFin`) vía `sp_Constante_ListarPorCampo(@Campo)` → endpoint `/api/lookup/constantes?campo=` → hook `useConstantesPorCampo`. **Reutilizar antes de crear tablas de catálogo.**
- Fechas guardadas como **texto** en `Planilla` (`FecEmision`, `FechaDeposito`) y parseadas con `TRY_CONVERT` multi-formato (no sargable).
- IDs generados con `MAX(Id)+1` en varias tablas legacy (ver TECHNICAL_DEBT).
- La misma BD aloja el esquema de **Hangfire** (`PrepareSchemaIfNecessary=true`).

## 2. Tablas principales

### 2.1 Tesorería / Recibos ("Planilla" = recibos/gastos, NO nómina)
| Tabla | PK / clave | Campos clave | Estados | Usada por | DDL en repo |
|---|---|---|---|---|---|
| `Planilla` | `Correlativo` (+`IdSite` en TVP) | Estado, TipoMoneda, IdMoneda2, Total, Subtotal, IGV, TotalPagar, IdRetencion/MontoRetencion, IdComprobante, IdTipoPago, Ruc, Serie, FecEmision(txt), FechaDeposito(txt), IdBanco, IdBancoCta, Cuenta, CuentaInter, NroOperacion, Cheque, IdEjecutor, IdResponsable, IdSolicitante, IdGestor, IdValidador, IdWeb (1=EmpleadoCj), IdCliente, IdProyecto, IdSite, CorreSite, Tipo_Trabajo, IdTarea, OT, **IdOc (varchar)+Fila → DetOrdenCompra**, ImgFactura, RevisionPm, idprovisional | 0,1,2,3,4,5,6,7,8,9,10 (ver BUSINESS_RULES §1) | PlanillaService, PlanillaConsultaService, PagoTesoreria*, OrdenCompraService, ConciliacionBcpService, IaChat | No (índices en `Database/Planilla/02_ix_Planilla_Consulta_Estados_Perf.sql`) |
| `LogPlanilla` | — | snapshot ANTES/DESPUÉS | — | PagoTesoreriaWorkflow | No |
| `MovEstadosPagos` | — | Correlativo, Estado, Observacion, Usuario(varchar 10), FechaCreacion, HoraCreacion | — | PagoTesoreriaWorkflow | No |
| `CuentaEmpleado` | — | IdEmpleado, IdBanco, Cuenta, CuentaInter, NombreCta, Estado | — | PagoTesoreriaService, sp_Planilla_Consulta_Estados | No |
| `Suministro_provisional` | idprovisional | — | IdEstado (constante `estado_suministro`) | LogisticaSuministro, Planilla | No |

### 2.2 Orden de Compra
| Tabla | PK | Campos clave | Estados | DDL |
|---|---|---|---|---|
| `CabOrdenCompra` | IdOc | IdSolicitante, IdResponsable, IdValidador, IdGestor, IdMoneda, IdComprobante, IdFormaPago, DiasPago, Subtotal, Igv, Total, **IdEstado**, IdAprobador1..3, FechaAprobador1..3, IdWeb | 0 pendiente (niveles 1-2), 1 aprobado (nivel 3), 6 rechazado | No |
| `DetOrdenCompra` | IdOc + Fila | IdCliente, IdProyecto, IdSite, Correlativo(=CorreSite), TipoTrabajo, IdTarea, Ot, Detalle, Cantidad, PrecioUnitario, ImgOc, ImgPresupuesto, Peso, IdEstado, IdAprobador1..3 | idem | No |
Relación: `Planilla.IdOc + Planilla.Fila` → `DetOrdenCompra`. Consumo OC = `CabOrdenCompra.Subtotal` vs `SUM(Planilla.Subtotal WHERE Estado=4)`.

### 2.3 Conciliación bancaria
| Tabla | PK | Notas | DDL |
|---|---|---|---|
| `MovimientosBcp` | IdMovimientoBanco | Versión v0 (solo BCP). EsConciliado, EstadoConciliacion | No |
| `MovimientosConciliacion` | IdMovimientoBanco IDENTITY | Multibanco (v1). UX_MovimientosBancarios_Unico(IdBanco,Cuenta,Fecha,Monto,NroOperacion,DescripcionOperacion); IdAreaFlujo, IdReferencia, IdCuentaContable, IdReglaContable, CamposExtraJson | `Database/Finanzas/00_Conciliacion_MultiBanco_Base.sql` |
| `Bancos`, `PlantillasBanco`, `PlantillasBancoColumna`, `ConciliacionAuditoria` | — | Semillas BCP/SCOTIABANK en `01_Conciliacion_MultiBanco_Semillas.sql` | Sí |
| `ConciliacionAreaFlujo`, `ConciliacionReferencia`, `PlanCuentaContable`, `ConciliacionReglaContable` | — | Clasificación contable | No |
⚠ El código v1 actualiza `MovimientosConciliacion` y `MovimientosBcp` con el **mismo Id** (IDENTITY independientes) — ver TECHNICAL_DEBT.

### 2.4 RRHH / Empleados / Asistencia
| Tabla | PK / clave | Notas | DDL |
|---|---|---|---|
| `EmpleadoCj` | IdEmpleado (MAX+1) | Empleado "nuevo". IdCargo 50=empleado, 51=externo. IdEstado 9 pendiente → 1 activo → 0 baja; IdActivo; IdEmpRel→`Empleado` | No |
| `EmpleadoCjDetalle` | IdEmpleadoCj | IdEmpresaCj, IdClienteCj, IdAreaCj, IdUbicacionCj (→Constante), **IdResponsableCj / IdSegundoVacaciones / IdTerceroVacaciones (validadores 1/2/3)** | No |
| `Empleado` | IdEmpleado (MAX+1) | Empleado **legacy**; IdEmpleadoCj, IdCargo (14=ejecutor de pagos, 13=validador, 10…) | No |
| `Usuario` | Id (MAX+1), IdUsuario (login) | **Clave en texto plano**, IdEstado, IdEmpleado→Empleado, IdCargo (84 por defecto) | No |
| `EmpleadoCjSolicitudVigencia` | IdSolicitudVigencia | Renovación de contrato; EstadoSolicitud PENDIENTE/APROBADO/RECHAZADO/ANULADO; 1 PENDIENTE por empleado | `Database/Recursoshumanos/01_*.sql` |
| `EmpleadoCjHistorialLaboral` | IdHistorialLaboral | TipoMovimiento/MotivoMovimiento ("RENOVACION") | No |
| `EmpleadoOtros` | — | **Vacaciones legacy** (IdEstado 97/98/99/0) — el que usa la UI | No |
| `VacacionPolitica`, `VacacionPeriodo`, `VacacionSolicitud`, `VacacionMovimiento` | Identity | **Vacaciones modelo nuevo** (backend listo, sin UI). `DiasDisponibles` columna calculada | `Database/Recursoshumanos/02_*.sql` |
| `EmpleadoCompensacion`, `EmpleadoCompensacionMovimiento`, saldo | — | Días compensatorios (97→98→9, rechazo 22) | No |
| `EmpleadoPendiente` | IdPendiente | Tareas pendientes por empleado | No |
| `Asistencia` | IdEmpleado + FechaAsistencia | IdEstado (constante `estado_asistencia`; 9=pendiente validar, 0 inicial, 16 previo a ingreso), IdAprobador, horas, lat/long, imágenes | No |
| `AsistenciaSharePointJobConfig`, `AsistenciaSharePointExportLog` | — | Config/log del job de export | `Database/Reportes/01_*.sql` |
| `PlanillaBoletaCabecera`, `PlanillaBoletaDetalle`, `PlanillaBoletaSuspension`, `PlanillaBoletaPdf`, `PlanillaEmpresaFirma` | — | **Nómina** (boletas XML/PDF) | No |

### 2.5 Operaciones / Importación
| Tabla | Notas | DDL |
|---|---|---|
| `importar` | Proyectos/OT importados (IdEstado, OT, MontoOC, MontoLiq, Monto_Bck, Monto_Visible, IdMoneda, NroInterno) | No |
| `updimportar` | Staging **global** de migración (DELETE sin filtro) | Alters en `Database/Mantenimiento/02,04,05_*.sql` |
| `Cliente`, `Proyecto`, `Site` (IdSite+Correlativo), `Ot`, `db_operaciones_cj`/`Db_Operaciones_Cj` | Maestros operativos | No |

### 2.6 Seguridad
| Tabla | Notas | DDL |
|---|---|---|
| `SegPerfil`, `SegRol`, `SegPerfilRol` | Perfil × Rol | No |
| `SegUsuarioPerfilRol` (vigente), `SegUsuarioPerfil` (legacy) | Asignación a usuario | No |
| `SegMenu` | IdMenu, IdMenuPadre, NombreMenu, **Ruta** (debe coincidir con AppRouter), Icono, OrdenMenu, NivelMenu, CodigoMenu, EsActivo, EsVisible | No (alta de ejemplo: `Database/Finanzas/04_PagosTesoreria_Menu.sql`) |
| `SegPerfilRolMenu` | IdPerfil, IdRol, IdMenu, Acceso | No |
| `SegRolMenuPermiso` | PuedeVer/Crear/Editar/Eliminar/Aprobar/Exportar (backend sin consumidor FE) | No |
| `SegPermisoAccion` | Permiso por acción/pestaña: RutaPagina, ClaveAccion, TipoElemento (menu/tab/button/system), IdRol **o** IdEmpleado, PuedeVer, PuedeEjecutar | `Database/Seguridad/00_SegPermisosAcciones_Base.sql` |
| `AuditoriaCambios` | Auditoría genérica campo a campo (Modulo, Entidad, IdRegistro, Accion, Seccion, Campo, ValorAnterior, ValorNuevo, UsuarioAccion) | No |

### 2.7 Reportes / Integraciones / Mobile / IA
| Tabla | Notas | DDL |
|---|---|---|
| `ReporteWupConfig` | Config jobs WUP (hora, días, bloques, delay, activo). La app hace `ALTER TABLE ADD` en runtime | No |
| `ReporteWhatsAppLog`, `ReporteWhatsAppLogGerencia` | Log de envíos (incluye `RequestJson` con PDF base64) | No |
| `EmpleadoCj_Wup` | Teléfonos WUP | No |
| `Comunicacion`, `ComunicacionDestinatario`, `ComunicacionEvento`, `ComunicacionAdjunto`, `ComunicacionPushEntrega`, `DispositivoMovil` | Comunicaciones móviles + push | `Database/Mobile/01,09,12_*.sql` |
| `IaChatAuditoria` | Auditoría del chat IA | `Database/IaChat/01_*.sql` |
| Tablas de SQL Monitor | — | No |

### 2.8 Arrendamientos (DDL completo en `Database/Arrendamientos/00_Arrendamientos_Base.sql` + 01..04)
`a_parametro`, `a_tipo_cambio_diario`, `a_arrendador`, `a_inquilino`, `a_inmueble`, `a_unidad`, `a_concepto`, `a_contrato` (+ monedas por concepto, cochera), `a_contrato_unidad`, `a_contrato_version` (+`_detalle`, adendas), `a_contrato_documento`, `a_obligacion` (+`_movimiento`), `a_pago` (+`_aprobacion`, `_aplicacion`, `_documento`), `a_saldo_favor`, `a_fraccionamiento` (+`_cuota`), `a_garantia` (+`_movimiento`), `a_cobranza_gestion`, `a_cobranza_compromiso`, `a_arbitrio` (+`_detalle`), `a_alerta`. Es el único módulo con FKs/CHECKs versionados.

## 3. Inventario completo de Stored Procedures (referenciados desde C#)

Columnas: **Módulo | SP | Tipo | Def. en repo | Llamado desde (clase C#)**. Tipo inferido del nombre y corregido manualmente con el código; "Def. en repo = No" ⇒ parámetros/tablas **PENDIENTE DE VALIDACIÓN** en BD. Parámetros detallados de los SPs principales: ver API_MAP.md y los scripts.

| Módulo | SP | Tipo | Def. en repo | Llamado desde |
|---|---|---|---|---|
| Arrendamientos | sp_Arrendamiento_ResumenAnual | REPORTE | Sí | ArrendamientosService |
| Arrendamientos | sp_a_Arbitrio_Guardar | UPDATE/UPSERT | Sí | ArrendamientosService |
| Arrendamientos | sp_a_Arrendador_Guardar | UPDATE/UPSERT | Sí | ArrendamientosService |
| Arrendamientos | sp_a_Cobranza_Gestion_Registrar | INSERT | Sí | ArrendamientosService |
| Arrendamientos | sp_a_Contrato_Guardar | UPDATE/UPSERT | Sí | ArrendamientosService |
| Arrendamientos | sp_a_Contrato_Unidad_Guardar | UPDATE/UPSERT | Sí | ArrendamientosService |
| Arrendamientos | sp_a_EstadoCuenta_Consultar | CONSULTA | Sí | **NINGUNO** (el servicio usa SQL inline equivalente) |
| Arrendamientos | sp_a_Fraccionamiento_Guardar | UPDATE/UPSERT | Sí | ArrendamientosService |
| Arrendamientos | sp_a_Garantia_Guardar | UPDATE/UPSERT | Sí | ArrendamientosService |
| Arrendamientos | sp_a_Inmueble_Guardar | UPDATE/UPSERT | Sí | ArrendamientosService |
| Arrendamientos | sp_a_Inquilino_Guardar | UPDATE/UPSERT | Sí | ArrendamientosService |
| Arrendamientos | sp_a_Obligacion_Generar | PROCESO | Sí | ArrendamientosService |
| Arrendamientos | sp_a_Pago_Aplicar | PROCESO | Sí | ArrendamientosService |
| Arrendamientos | sp_a_Pago_Aprobar | APROBACIÓN | Sí | ArrendamientosService |
| Arrendamientos | sp_a_Pago_Registrar | INSERT | Sí | ArrendamientosService |
| Arrendamientos | sp_a_Pago_Revertir | PROCESO | Sí | ArrendamientosService |
| Arrendamientos | sp_a_TipoCambioDiario_Guardar | UPDATE/UPSERT | Sí | ArrendamientosService |
| Arrendamientos | sp_a_Unidad_Guardar | UPDATE/UPSERT | Sí | ArrendamientosService |
| Asistencia | RptAsistenciaFechas | REPORTE | No | ReporteRepository, AsistenciaReporteService |
| Asistencia | sp_AsistenciaTracking_Consulta | CONSULTA | No | AsistenciaReporteService |
| Asistencia | sp_Asistencia_ActualizarEstadoEmpleado | UPDATE/UPSERT | No | AsistenciaReporteService |
| Asistencia | sp_Asistencia_AprobarIngreso | APROBACIÓN | No | AsistenciaValidarCampoService |
| Asistencia | sp_Asistencia_AprobarSalida | APROBACIÓN | No | AsistenciaValidarCampoService |
| Asistencia | sp_Asistencia_BuscarPorFechas_Job | JOB / INTEGRACIÓN (SharePoint) | No | AsistenciaSharePointRepository |
| Asistencia | sp_Asistencia_RechazarDocumento | APROBACIÓN | No | AsistenciaValidarCampoService |
| Asistencia | sp_Asistencia_UltimoMovimientoEmpleado | CONSULTA | No | LookupService |
| Asistencia | sp_Asistencia_ValidarCampo | CONSULTA | No | AsistenciaValidarCampoService |
| Auditoría | sp_AuditoriaCambios_Registrar | INSERT | No | AuditoriaCambiosService |
| Cheques | sp_ChequeEmpleado_Actualizar | UPDATE/UPSERT | No | ChequeEmpleadoService |
| Cheques | sp_ChequeEmpleado_Insertar | INSERT | No | ChequeEmpleadoService |
| Cheques | sp_ChequeEmpleado_Listar | CONSULTA | No | ChequeEmpleadoService |
| Cheques | sp_ChequeEmpleado_Obtener | CONSULTA | No | ChequeEmpleadoService |
| Compensación (días) | sp_EmpleadoCompensacionMovimiento_Insertar | INSERT | No | CompensacionService |
| Compensación (días) | sp_EmpleadoCompensacionSaldo_Guardar | UPDATE/UPSERT | No | CompensacionService |
| Compensación (días) | sp_EmpleadoCompensacionSaldo_Listar | CONSULTA | No | CompensacionService |
| Compensación (días) | sp_EmpleadoCompensacion_Actualizar | UPDATE/UPSERT | No | CompensacionService |
| Compensación (días) | sp_EmpleadoCompensacion_Consultar | CONSULTA | No | CompensacionService |
| Compensación (días) | sp_EmpleadoCompensacion_Insertar | INSERT | No | CompensacionService |
| Conciliación | sp_MovimientosBcp_ActualizarClasificacionContable | UPDATE/UPSERT | Sí | ConciliacionBcpService |
| Conciliación | sp_MovimientosBcp_Buscar | CONSULTA | No | ConciliacionBcpService |
| Conciliación | sp_MovimientosBcp_ConciliarPlanilla | PROCESO | Sí | **NINGUNO — SP huérfano** (lógica reimplementada en ConciliacionBcpService) |
| Conciliación | sp_MovimientosBcp_Insertar | INSERT (params vía sys.parameters) | No | ConciliacionBcpService |
| Conciliación | sp_MovimientosBcp_ObtenerCombosClasificacionContable | CONSULTA | Sí | ConciliacionBcpService |
| Conciliación | sp_MovimientosConciliacion_ActualizarClasificacionContable | UPDATE/UPSERT | Sí | ConciliacionBcpService |
| Conciliación | sp_MovimientosConciliacion_Buscar | CONSULTA | Sí | ConciliacionBcpService |
| Conciliación | sp_MovimientosConciliacion_Insertar | INSERT | Sí | ConciliacionBcpService |
| Conciliación | sp_MovimientosConciliacion_ObtenerCombosClasificacionContable | CONSULTA | Sí | **NINGUNO** (duplica sp_MovimientosBcp_ObtenerCombos…) |
| Empleados/RRHH | sp_EmpleadoCj_Actualizar | UPDATE/UPSERT | No | MantenimientoEmpleadosController, MantenimientoExternosController |
| Empleados/RRHH | sp_EmpleadoCj_AprobarCompleto | APROBACIÓN | Sí | MantenimientoEmpleadosController, MantenimientoExternosController (constante SIN USO; lógica duplicada en C#) |
| Empleados/RRHH | sp_EmpleadoCj_EliminarLogico | DELETE | No | MantenimientoEmpleadosController, MantenimientoExternosController |
| Empleados/RRHH | sp_EmpleadoCj_Ficha | CONSULTA | No | ContratosController, EmpleadoFichaController, MantenimientoEmpleadosController, MantenimientoExternosController |
| Empleados/RRHH | sp_EmpleadoCj_Guardar | INSERT | No | MantenimientoEmpleadosController, MantenimientoExternosController (constante SIN USO) |
| Empleados/RRHH | sp_EmpleadoCj_Listar_Cargo | CONSULTA | No | EmpleadoCtaService |
| Empleados/RRHH | sp_EmpleadoCj_Listar_Wup | CONSULTA | No | ReporteRepository, EmpleadoCtaService |
| Empleados/RRHH | sp_EmpleadoCj_Listar_Wup_Gerencia | CONSULTA | No | ReporteRepository |
| Empleados/RRHH | sp_EmpleadoPendiente_Actualizar | UPDATE/UPSERT | No | EmpleadoPendienteService |
| Empleados/RRHH | sp_EmpleadoPendiente_Insertar | INSERT | No | EmpleadoPendienteService |
| Empleados/RRHH | sp_EmpleadoPendiente_Listar | CONSULTA | No | EmpleadoPendienteService |
| Empleados/RRHH | sp_Empleado_Cta_Listar | CONSULTA | No | EmpleadoCtaService, PagoTesoreriaService |
| Empleados/RRHH | sp_Empleado_ListarValidadores | CONSULTA | No | MantenimientoEmpleadosController, MantenimientoExternosController |
| Empleados/RRHH | sp_Empleado_Listar_GestorValidador | CONSULTA | No | LookupService |
| IA Chat | sp_IA_Planilla_Buscar | CONSULTA | No | IaChatService |
| IA Chat | sp_IaChatAuditoria_Insertar | INSERT | Sí | IaChatService |
| Logística/Operación | sp_Logistica_Recojo_Buscar | CONSULTA | No | LogisticaRecojoService |
| Logística/Operación | sp_Logistica_Recojo_Insertar | INSERT | No | LogisticaRecojoService |
| Logística/Operación | sp_Planilla_Listar_Reembolso | CONSULTA | No | LogisticaReembolsoService |
| Logística/Operación | sp_SuministroProvisional_Actualizar | UPDATE/UPSERT | No | LogisticaSuministroService |
| Logística/Operación | sp_SuministroProvisional_Insertar | INSERT | No | LogisticaSuministroService |
| Logística/Operación | sp_SuministroProvisional_Kpis | CONSULTA | No | LogisticaSuministroService |
| Logística/Operación | sp_SuministroProvisional_Listar | CONSULTA | No | LogisticaSuministroService |
| Logística/Operación | sp_SuministroProvisional_ObtenerVigente | CONSULTA | No | PlanillaService |
| Lookups/Catálogos | sp_Constante_ListarPorCampo | CONSULTA | No | MantenimientoEmpleadosController, MantenimientoExternosController, ConciliacionBcpService, LookupService, PagoTesoreriaService |
| Lookups/Catálogos | sp_ListarGestor | CONSULTA | No | LookupService |
| Lookups/Catálogos | sp_ListarSolicitante | CONSULTA | No | LookupService |
| Lookups/Catálogos | sp_ListarValidador | CONSULTA | No | LookupService |
| Lookups/Catálogos | sp_Listar_Cliente | CONSULTA | No | PagoTesoreriaService |
| Lookups/Catálogos | sp_Listar_Ubigeo | CONSULTA | No | LookupService |
| Lookups/Catálogos | sp_Site_Listar | CONSULTA | No | LookupService |
| Migración/Importar | sp_Importar_ConsultaDsh | CONSULTA | No | PlanillaConsultaController, PlanillaConsultaService |
| Migración/Importar | sp_Importar_FiltroOperativo_Listar | CONSULTA | No | LookupService |
| Migración/Importar | sp_Importar_OT_Listar | CONSULTA | No | LookupService |
| Migración/Importar | sp_Importar_ResumenOT | CONSULTA | Sí | PlanillaConsultaController, PlanillaConsultaService |
| Migración/Importar | sp_Importar_TipoTrabajo_Listar | CONSULTA | No | LookupService |
| Migración/Importar | sp_MigracionImport_Actualizar | UPDATE/UPSERT | Sí | MigracionImportService |
| Migración/Importar | sp_MigracionImport_Insertar | INSERT | Sí | MigracionImportService |
| Migración/Importar | sp_MigracionImport_ProcesarNew | PROCESO | No | MigracionImportProcesarNewService |
| Mobile | sp_ComunicacionAdjunto_Crear | INSERT | Sí | MobileCommunicationService |
| Mobile | sp_ComunicacionAdjunto_ListarPorEmpleado | CONSULTA | Sí | MobileCommunicationService |
| Mobile | sp_ComunicacionAdjunto_ObtenerPorEmpleado | CONSULTA | Sí | MobileCommunicationService |
| Mobile | sp_ComunicacionPush_ObtenerPendientes | CONSULTA | Sí | MobilePushDispatchService |
| Mobile | sp_ComunicacionPush_RegistrarResultado | INSERT | Sí | MobilePushDispatchService |
| Mobile | sp_Comunicacion_Confirmar | UPDATE (confirmación lectura) | Sí | MobileCommunicationService |
| Mobile | sp_Comunicacion_Crear | INSERT | Sí | MobileCommunicationService |
| Mobile | sp_Comunicacion_ListarPorEmpleado | CONSULTA | Sí | MobileCommunicationService |
| Mobile | sp_Comunicacion_MarcarLeido | UPDATE/UPSERT | Sí | MobileCommunicationService |
| Mobile | sp_Comunicacion_Monitor | CONSULTA | Sí | MobileCommunicationService |
| Mobile | sp_Comunicacion_Obtener | CONSULTA | Sí | MobileCommunicationService |
| Mobile | sp_Comunicacion_PendientesObligatorias | CONSULTA | Sí | MobileCommunicationService |
| Mobile | sp_Comunicacion_ResumenPorEmpleado | CONSULTA | Sí | MobileCommunicationService |
| Mobile | sp_Comunicacion_Seguimiento | CONSULTA | Sí | MobileCommunicationService |
| Mobile | sp_DispositivoMovil_Desactivar | UPDATE/UPSERT | Sí | MobileDeviceService |
| Mobile | sp_DispositivoMovil_ListarAdmin | CONSULTA | Sí | MobileDeviceService |
| Mobile | sp_DispositivoMovil_Registrar | INSERT | Sí | MobileDeviceService |
| Orden de Compra | sp_OrdenCompra_BuscarCabecera | CONSULTA | No | OrdenCompraService |
| Orden de Compra | sp_OrdenCompra_BuscarDetalle | CONSULTA | No | OrdenCompraService |
| Orden de Compra | sp_OrdenCompra_Consulta_Estados | REPORTE | Sí | PlanillaConsultaService |
| Orden de Compra | sp_OrdenCompra_Insertar | INSERT | No | OrdenCompraService |
| Orden de Compra | sp_OrdenCompra_RechazarMasivo | APROBACIÓN (rechazo masivo) | No | OrdenCompraService |
| Planilla (boletas XML) | sp_PlanillaBoleta_ImportarXml | INSERT / PROCESO (XML nómina) | No | PlanillaBoletaRepository |
| SQL Monitor | sp_Monitor_Captura1Min | JOB | No | SqlMonitorService |
| SQL Monitor | sp_Monitor_Captura30Seg | JOB | No | SqlMonitorService |
| SQL Monitor | sp_Monitor_Captura5Min | JOB | No | SqlMonitorService |
| SQL Monitor | sp_Monitor_CapturarBloqueos | JOB | No | SqlMonitorService |
| SQL Monitor | sp_Monitor_GenerarAlertas | JOB | No | SqlMonitorService |
| SQL Monitor | sp_Monitor_LimpiarHistorico | JOB | No | SqlMonitorService |
| SQL Monitor | sp_Monitor_NetworkIo | CONSULTA | No | SqlMonitorService |
| SQL Monitor | sp_Monitor_Overhead | CONSULTA | No | SqlMonitorService |
| SQL Monitor | sp_Monitor_QueriesActuales | CONSULTA | No | SqlMonitorService |
| SQL Monitor | sp_Monitor_QueryDetalle | CONSULTA | No | SqlMonitorService |
| SQL Monitor | sp_Monitor_Resumen | CONSULTA | No | SqlMonitorService |
| SQL Monitor | sp_Monitor_TopSql_Listar | CONSULTA | No | SqlMonitorService |
| Seguridad | SP_GenerarUsuario | PROCESO | No | MantenimientoEmpleadosController, MantenimientoExternosController |
| Seguridad | sp_SegMenu_Crear | INSERT | No | SegMenuService |
| Seguridad | sp_SegMenu_ListarCompleto | CONSULTA | No | SegMenuService |
| Seguridad | sp_SegPerfilRolMenu_EliminarPorPerfilRol | DELETE | No | SegMenuService |
| Seguridad | sp_SegPerfilRolMenu_Insertar | INSERT | No | SegMenuService |
| Seguridad | sp_SegPerfilRolMenu_ListarAsignado | CONSULTA | No | SegMenuService |
| Seguridad | sp_SegPerfilRol_ComboRolesPorPerfil | CONSULTA | No | SegPerfilService |
| Seguridad | sp_SegPerfil_Actualizar | UPDATE/UPSERT | No | SegPerfilService |
| Seguridad | sp_SegPerfil_Crear | INSERT | No | SegPerfilService |
| Seguridad | sp_SegPerfil_Eliminar | DELETE | No | SegPerfilService |
| Seguridad | sp_SegPerfil_ListarActivos | CONSULTA | No | SegPerfilService |
| Seguridad | sp_SegPerfil_ObtenerPorId | CONSULTA | No | SegPerfilService |
| Seguridad | sp_SegPermisoAccion_Eliminar | DELETE | Sí | SegPermisoAccionService |
| Seguridad | sp_SegPermisoAccion_Guardar | UPDATE/UPSERT | Sí | SegPermisoAccionService |
| Seguridad | sp_SegPermisoAccion_Listar | CONSULTA | Sí | SegPermisoAccionService |
| Seguridad | sp_SegPermisoAccion_Obtener | CONSULTA | Sí | SegPermisoAccionService |
| Seguridad | sp_SegRolMenuPermiso_Guardar | UPDATE/UPSERT | No | SegRolMenuPermisoService |
| Seguridad | sp_SegRolMenuPermiso_ListarPorRol | CONSULTA | No | SegRolMenuPermisoService |
| Seguridad | sp_SegRolMenuPermiso_Obtener | CONSULTA | No | SegRolMenuPermisoService |
| Seguridad | sp_SegRol_Actualizar | UPDATE/UPSERT | No | SegRolService |
| Seguridad | sp_SegRol_Crear | INSERT | No | SegRolService |
| Seguridad | sp_SegRol_Eliminar | DELETE | No | SegRolService |
| Seguridad | sp_SegRol_Listar | CONSULTA | No | SegRolService |
| Seguridad | sp_SegRol_ObtenerPorId | CONSULTA | No | SegRolService |
| Seguridad | sp_SegUsuarioPerfilRol_Insertar | INSERT | No | SegMenuService |
| Seguridad | sp_SegUsuarioPerfil_Guardar | UPDATE/UPSERT | No | SegMenuService |
| Seguridad | sp_Seguridad_ObtenerMenuDinamico | CONSULTA | No | SegMenuService |
| Seguridad | sp_Seguridad_ObtenerMenuDinamicoTotal | CONSULTA | No | SegMenuService |
| Seguridad | sp_UsuarioListar | CONSULTA | No | SegUsuarioService |
| Seguridad | sp_ValidarUsuario | CONSULTA | Sí | AuthService |
| Tesorería/Planilla (recibos) | sp_Finanzas_CargarValoresGasto | CONSULTA | No | LookupService |
| Tesorería/Planilla (recibos) | sp_Movimientos_Consulta_GastosIngresos | REPORTE | No | PlanillaConsultaController, PlanillaConsultaService |
| Tesorería/Planilla (recibos) | sp_Planilla_Actualizar | UPDATE/UPSERT | No | PlanillaService |
| Tesorería/Planilla (recibos) | sp_Planilla_ActualizarEstado | APROBACIÓN (rechazo, CodEstado=3) | No | PlanillaService |
| Tesorería/Planilla (recibos) | sp_Planilla_ActualizarRendirMasivo | PROCESO | No | PagoTesoreriaWorkflow |
| Tesorería/Planilla (recibos) | sp_Planilla_ActualizarRevisionMasiva | PROCESO (1→9) | No | PagoTesoreriaWorkflow |
| Tesorería/Planilla (recibos) | sp_Planilla_AdministrativoMasivo | PROCESO PAGO (5→4) | No | PagoTesoreriaService |
| Tesorería/Planilla (recibos) | sp_Planilla_ConsultaIni | CONSULTA | No | PagoTesoreriaWorkflow |
| Tesorería/Planilla (recibos) | sp_Planilla_Consulta_Aprobar | CONSULTA (bandeja aprobar) | No | PlanillaConsultaController, PlanillaConsultaService |
| Tesorería/Planilla (recibos) | sp_Planilla_Consulta_Estados | CONSULTA (principal) | Sí | PlanillaConsultaController, ConciliacionBcpService, PlanillaConsultaService |
| Tesorería/Planilla (recibos) | sp_Planilla_Consulta_Gastos_Pagados | CONSULTA | No | PlanillaConsultaService (constante SIN USO) |
| Tesorería/Planilla (recibos) | sp_Planilla_ConsultarPagados_Dsh | REPORTE | No | PlanillaConsultaController, PlanillaConsultaService |
| Tesorería/Planilla (recibos) | sp_Planilla_ContabilidadMasivo | PROCESO (9→8) | No | PagoTesoreriaWorkflow |
| Tesorería/Planilla (recibos) | sp_Planilla_Insertar | INSERT | No | PlanillaService |
| Tesorería/Planilla (recibos) | sp_Planilla_OC_Resumen | REPORTE | No | PlanillaConsultaService |
| Tesorería/Planilla (recibos) | sp_Planilla_OT_Resumen | REPORTE | No | PlanillaConsultaService |
| Tesorería/Planilla (recibos) | sp_Planilla_PagoContabilidadMasivo | PROCESO PAGO (8→4, @Opc=2) | No | PagoTesoreriaService |
| Tesorería/Planilla (recibos) | sp_Planilla_PasarAdministrativoMasivo | PROCESO (9→5) | No | PagoTesoreriaWorkflow |
| Tesorería/Planilla (recibos) | sp_Planilla_ProcesarAprobacionMasiva | APROBACIÓN (1ª/2ª, TVP) | No | PlanillaService |
| Tesorería/Planilla (recibos) | sp_Planilla_ProgramarMasivo | PROCESO (5→8) | No | PagoTesoreriaWorkflow |
| Tesorería/Planilla (recibos) | sp_Planilla_ReporteResumen | REPORTE | No | PagoTesoreriaWorkflow |
| Vacaciones | sp_EmpleadoOtros_ActualizaarVacaciones | APROBACIÓN (97→98→99) | No | VacacionesService |
| Vacaciones | sp_EmpleadoOtros_GrabarVacaciones | INSERT | No | VacacionesService |
| Vacaciones | sp_EmpleadoOtros_ListarVacaciones | CONSULTA | No | PlanillaConsultaController, PlanillaConsultaService |
| Vacaciones | sp_EmpleadoOtros_ListarVacacionesTotal | CONSULTA | No | PlanillaConsultaService |
| Vacaciones | sp_Vacacion_Movimiento_Revertir | PROCESO | Sí | VacacionesService |
| Vacaciones | sp_Vacacion_Periodo_Generar | PROCESO | Sí | VacacionesService |
| Vacaciones | sp_Vacacion_Periodo_GenerarMasivo | PROCESO | Sí | VacacionesService |
| Vacaciones | sp_Vacacion_Politica_Guardar | UPDATE/UPSERT | Sí | VacacionesService |
| Vacaciones | sp_Vacacion_Saldo_Consultar | CONSULTA | Sí | VacacionesService |
| Vacaciones | sp_Vacacion_Solicitud_Aprobar | APROBACIÓN | Sí | VacacionesService |
| Vacaciones | sp_Vacacion_Solicitud_Cancelar | PROCESO | Sí | VacacionesService |
| Vacaciones | sp_Vacacion_Solicitud_Finalizar | PROCESO | Sí | VacacionesService |
| Vacaciones | sp_Vacacion_Solicitud_Rechazar | APROBACIÓN | Sí | VacacionesService |
| Vacaciones | sp_Vacacion_Solicitud_Registrar | INSERT | Sí | VacacionesService |

Scripts con SPs versionados: `Database/Arrendamientos/*`, `Database/Finanzas/00-03_*`, `Database/IaChat/01_*`, `Database/Mantenimiento/01,03_*`, `Database/Mobile/03,08,09,11-18_*`, `Database/OrdenCompra/01_*`, `Database/Planilla/01,03*_*`, `Database/Recursoshumanos/03,04_*`, `Database/Seguridad/00_*`, `Database/Mobile/13_Perfil_Cargo_Login.sql` (sp_ValidarUsuario).

## 4. SPs duplicados, similares u obsoletos (solo documentado, no modificar)
| Caso | Detalle |
|---|---|
| Conciliación v0/v1 | `sp_MovimientosBcp_*` vs `sp_MovimientosConciliacion_*` (Buscar, Insertar, ActualizarClasificacionContable, ObtenerCombos) hacen lo mismo sobre dos tablas |
| Conciliación huérfano | `sp_MovimientosBcp_ConciliarPlanilla` (en repo) no se llama: la lógica vive en `ConciliacionBcpService` |
| Pagos | `sp_Planilla_AdministrativoMasivo` (5→4) y `sp_Planilla_PagoContabilidadMasivo @Opc=2` (8→4) pagan ambos; `sp_Planilla_ContabilidadMasivo` y `sp_Planilla_PasarAdministrativoMasivo` difieren solo en estado destino |
| Empleados | `sp_EmpleadoCj_AprobarCompleto` (en repo, sin uso) duplica `AprobarEmpleadoDirectoAsync` (C#, usado, además copiado en Externos). `sp_EmpleadoCj_Guardar` constante sin uso |
| Vacaciones | Modelo legacy `sp_EmpleadoOtros_*` (usado por UI) vs modelo nuevo `sp_Vacacion_*` (sin UI). `sp_Vacacion_Solicitud_Rechazar` ≈ `_Cancelar`. Typo `sp_EmpleadoOtros_ActualizaarVacaciones` (nombre real, no corregir sin migrar) |
| Migración | `sp_MigracionImport_Insertar/Actualizar` (legacy, `m_importar.tsx`) vs `sp_MigracionImport_ProcesarNew` (nuevo, `importar.tsx`) |
| Asistencia | `RptAsistenciaFechas` vs `sp_Asistencia_BuscarPorFechas_Job` (dos fuentes por rango de fechas) |
| Arrendamientos | `sp_a_Contrato_Guardar` definido en 3 scripts (00, 01, 02 — gana el último ejecutado); `sp_a_EstadoCuenta_Consultar` sin uso (SQL inline equivalente) |
| Menú | `sp_Seguridad_ObtenerMenuDinamico` vs SQL inline `SegMenuService.ListarPorUsuarioAsync` (dos fuentes de verdad) |
| Sin uso | `sp_Planilla_Consulta_Gastos_Pagados` (constante), `sp_Seguridad_ObtenerMenuDinamicoTotal` (endpoint sin consumidor) |
| Script ≠ BD | `Database/Planilla/01_sp_Planilla_Consulta_Estados.sql` no declara parámetros que envía `pagos_v1.tsx` (TipoCambioUSD/EUR/DOP/COP) ⇒ la versión en producción difiere del repo |

## 5. PENDIENTE DE VALIDACIÓN (BD)
- Definiciones de los ~122 SPs marcados "No" (prioridad: `sp_Planilla_Insertar/Actualizar/ActualizarEstado/ProcesarAprobacionMasiva`, `sp_Planilla_Consulta_Aprobar`, 7 SPs de etapas de tesorería, `sp_OrdenCompra_*`, `sp_EmpleadoOtros_*`, `RptAsistenciaFechas`, `sp_Seguridad_ObtenerMenuDinamico`, `sp_Asistencia_Aprobar*`).
- DDL/PK/FK de Planilla, CabOrdenCompra/DetOrdenCompra, EmpleadoCj(+Detalle, HistorialLaboral), Empleado, Usuario, Constante, Seg*, Asistencia, EmpleadoOtros, AuditoriaCambios, MovimientosBcp, ReporteWup*.
- Definición de los TVP `TVP_Planilla_Aprobacion`, `PlanillaRevisionType`, `Type_MigracionImport`.
- Catálogo real de `Constante` MAESTRO/ESTADO (nombres de estados de Planilla), `estado_asistencia`, `estado_cheque`, `estado_suministro`, `DETRACCION`, `PERMISOS`.
- Cómo validar: `SELECT OBJECT_DEFINITION(OBJECT_ID('dbo.<sp>'))`, `sp_help '<tabla>'`, `SELECT * FROM Constante WHERE Campo='<campo>'`. Idealmente versionar los SPs en `Database/<modulo>/`.
