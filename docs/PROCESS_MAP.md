# Mapa de procesos — Cj ERP Web

> Reconstruido solo desde el código (2026-09-25). Las transiciones que dependen de SPs no versionados se marcan **PV** (PENDIENTE DE VALIDACIÓN).
> **Permisos:** salvo donde se indique, el backend **no valida perfil/rol** del actor (solo JWT); las restricciones son de UI.

---

## 1. Recibo / gasto de tesorería (tabla `Planilla`) — proceso central

```
Usuario (solicitante)
  │ gastos.tsx  → POST /api/tesoreria/gastos → TesoreriaGastosController.Create
  │               → PlanillaService.InsertarPlanillaAsync → sp_Planilla_Insertar  (+ factura a SharePoint: /upload-factura)
  ▼
Estado 0  "Pendiente 1ª aprobación"   (estado inicial lo fija el SP: PV)
  │ pagos_v1.tsx (pestañas por estado) → POST /api/planilla/consulta-estados/aprobar-masivo
  │   → PlanillaService.ProcesarAprobacionMasivaAsync → sp_Planilla_ProcesarAprobacionMasiva (TVP)
  │   CodEstado por defecto 10; CodEmpleado==77 fuerza 1; el SP decide 2ª aprobación por LimiteSegundaAprobacion (PV)
  ├─► Observar  (CodEstado=2)  → Estado 2 "Observada"   ── subsanar ─► 0
  ├─► Rechazar  → POST …/{correlativo}/rechazar → sp_Planilla_ActualizarEstado(3) → Estado 3 "Rechazado" (fin)
  ├─► Estado 6 "Re-aprobar" / 10 "Hormiga" (bandejas intermedias; semántica exacta en SP: PV)
  ▼
Estado 1  "Aprobado → Revisión (tesorería)"
  │ pagartesoreria.tsx / PagoEtapaForm.tsx → POST /api/tesoreria/pagos/acciones
  │   (PagoTesoreriaController, requiere ruta pagartesoreria en el menú)  → PagoTesoreriaWorkflow
  │   revisar 1→9  (sp_Planilla_ActualizarRevisionMasiva; RevisionPM='PM' si hora Lima >14:00)
  ▼
Estado 9  "Contabilidad"
  ├─ contabilidad-programar     9→8  (sp_Planilla_ContabilidadMasivo, aplica retención/detracción)
  └─ contabilidad-administrativo 9→5 (sp_Planilla_PasarAdministrativoMasivo)
Estado 5 "Administrativo" ──programar 5→8 (sp_Planilla_ProgramarMasivo; exige cuenta completa)──► Estado 8 "Programado"
Estado 8 ──administrativo 8→5 (UPDATE inline)──► Estado 5
  │ observar {1,9,8,5}→7 "Observada tesorería" ── subsanar 7→1 · corregir {2,7}→mismo
  ▼
Pagar: POST /api/tesoreria/pagos → PagoTesoreriaService.PagarAsync (transacción)
   desde 5: sp_Planilla_AdministrativoMasivo      desde 8: sp_Planilla_PagoContabilidadMasivo(@Opc=2)
   (alternativa sin controles: POST /tesoreria/pagos/grabar — UPDATE inline 8→4)
  ▼
Estado 4  "Pagado"   ── rendicion 4→4 (sp_Planilla_ActualizarRendirMasivo, edición por bloques)
  │
  ├─► Conciliación bancaria (§4) cruza por NroOperacion / Cuenta / CuentaInter
  └─► Consumo OC: SUM(Planilla.Subtotal WHERE Estado=4) por IdOc/Fila (§2)
```
- Matriz de transiciones exacta: `CjERP.Infrastructure/Services/PagoTesoreriaWorkflow.cs` (`EstadoDestino`). Todas escriben `LogPlanilla` y `MovEstadosPagos` (salvo rendicion/corregir).
- Revisión inline (PUT /tesoreria/pagos/revision): solo en Estado 1; cambiar estado solo si IdEmpleadoCj==77.
- Otras pantallas que tocan el mismo flujo: `gastosaprobar.tsx` (filtra/rechaza), `pagos_dev.tsx` (legacy), `pagartesoreria_v1.tsx` (lista con `sp_Planilla_ConsultaIni`), `conciliacion_v1.tsx` (crea recibos de "compensación manual" y actualiza NroOperacion).
- Documentación previa del flujo de pago: `CjERP.Backend/Database/Finanzas/PagosTesoreria.md`.

## 2. Orden de Compra

```
oc_v1.tsx ─ POST /api/facturacionfinanciera/oc → OrdenCompraService.InsertarAsync → sp_OrdenCompra_Insertar (@Detalle JSON)
   IdEstado=1 si no viene (⚠ contradicción: 1 = "APROBADO" en sp_OrdenCompra_Consulta_Estados; PV qué hace el SP)
   ▼
Aprobación nivel 1 → 2 → 3 (estrictamente secuencial) — POST /oc/aprobar (transacción)
   niveles 1-2: IdEstado=0, IdAprobador{n}/FechaAprobador{n}
   nivel 3:     IdEstado=1 en Cab y Det
   FE: niveles 2/3 visibles solo si SegPermisoAccion tab.validacion_2/3 (backend no valida quién aprueba)
   ├─► Rechazo masivo → POST /oc/rechazar-masivo → sp_OrdenCompra_RechazarMasivo → IdEstado=6 (no aprobable)
   ▼
Asociar recibos (Planilla.IdOc/Fila) → POST /oc/recibos/asociar (coincidencia Cliente/Proyecto/Site/CorreSite/TipoTrabajo;
   nivel 2/3 exige recibo Estado=4)
   ▼
Consumo: GET /oc/consumo (Subtotal OC vs pagado)   ·   PDF: GET /oc/{idOc}/pdf (QuestPDF)
```
- Edición: PUT /oc/{idOc} (no bloquea OC aprobada); POST /oc/detalle/editar bloqueado si IdAprobador3>0.

## 3. Cheques
`cheques.tsx` → POST /api/tesoreria/cheques → `sp_ChequeEmpleado_Insertar` → estados de Constante `estado_cheque` → rechazo: POST /{id}/rechazar con `IdEstadoRechazado` elegido en FE (busca etiqueta "rechaz"; si no la encuentra envía 0). Imagen en SharePoint.

## 4. Conciliación bancaria

```
Excel banco (BCP / Scotiabank / plantilla) ─► conciliacion(_v1).tsx
  → POST /finanzas/conciliacion/analizar   (ClosedXML + heurísticas + OpenAI opcional)
  → POST /finanzas/conciliacion/insertar   (v1: sp_MovimientosConciliacion_Insertar(@FilasJson); v0: sp_MovimientosBcp_Insertar; dedupe por índice único)
  → POST /conciliar-planilla(-v1)          (cruce en C#: movimientos vs sp_Planilla_Consulta_Estados,
                                            orden NRO OPERACION → CUENTA → CUENTA INTER)
      resultados: SIN COINCIDENCIA | SIN COINCIDENCIA - ITF | PENDIENTE CONCILIACION |
                  PENDIENTE VALIDACION SIN NRO OPERACION | CONCILIADO | ACTUALIZADO
  → PUT /movimientos/clasificacion(-v1)    (AreaFlujo + Referencia + CuentaContable debe coincidir con ConciliacionReglaContable)
      ⇒ EsConciliado=1, EstadoConciliacion='CONCILIADO'
  (v1) diferencia de monto → crea recibo en Planilla vía POST /tesoreria/gastos con datos fijos
```

## 5. Vacaciones (modelo legacy — el que usa la UI)

```
vacacionespage.tsx / vacaciones.tsx → POST /api/admin/vacaciones → sp_EmpleadoOtros_GrabarVacaciones (IdEstado 97)
  97 "1ra validación" ─aprobar─► 98 "2da" ─aprobar─► 99 "3ra"   (POST /admin/vacaciones/aprobar → sp_EmpleadoOtros_ActualizaarVacaciones)
  rechazar (97/98/99) → UPDATE inline IdEstado=0
  Validadores esperados: EmpleadoCjDetalle.IdResponsableCj / IdSegundoVacaciones / IdTerceroVacaciones (si el SP lo valida: PV)
```
**Modelo nuevo (backend listo, sin UI):** Política → `sp_Vacacion_Periodo_Generar(Masivo)` (OTORGADO) → `sp_Vacacion_Solicitud_Registrar` PENDIENTE (RESERVA) → `_Aprobar` APROBADO → `_Finalizar` FINALIZADO (CONSUMO); `_Rechazar`/`_Cancelar` (REVERSA); `sp_Vacacion_Movimiento_Revertir`.

## 6. Compensación (días compensatorios)
`compensacionreal.tsx` → POST /api/admin/compensacion (tx: Movimiento TOMADO → Saldo → `sp_EmpleadoCompensacion_Insertar`, IdEstado 97) → POST /procesar: `PRIMER_APROBADOR` 97→98 → `SEGUNDO_APROBADOR` 98→9 (final) · `RECHAZAR` → 22 (devuelve días como GANADO). FE permite 1er aprobador si es `idResponsableCj`, 2º si `idSegundoVacaciones`, override roles 4/5.

## 7. Empleado: alta → aprobación → baja

```
empleados.tsx / externo.tsx → POST /api/mantenimiento/{empleados|externos}
   valida obligatorios + DNI único activo por cargo → INSERT EmpleadoCj (MAX+1) IdEstado=9 "pendiente", IdCargo 50/51
   ▼
POST /{id}/aprobar → AprobarEmpleadoDirectoAsync (transacción, C#; NO usa sp_EmpleadoCj_AprobarCompleto)
   EmpleadoCj IdEstado=1 · crea/sincroniza Empleado legacy · crea/actualiza Usuario (clave inicial fija) ·
   genera Asistencia retroactiva (estado 0 desde inicio laboral; 16 días previos del mes)
   ⚠ backend no verifica IdEstado==9 (re-aprobar un dado de baja lo reactiva)
   ▼
DELETE /{id} → sp_EmpleadoCj_EliminarLogico + IdActivo=0, IdEstado=0, FechaBaja + desactiva Usuario/Empleado + anula vacaciones
```

## 8. Renovación de contrato (solicitud de vigencia)
`contratos.tsx` → PUT /recursoshumanos/contratos/renovar → `EmpleadoCjSolicitudVigencia` PENDIENTE (con 1ª aprobación del creador) → POST /{id}/aprobar-vigencia nivel 2 → nivel 3 (exige documento) → APROBADO ⇒ INSERT `EmpleadoCjHistorialLaboral` ("RENOVACION") + UPDATE `EmpleadoCj.FechaFinLaboral` + correo SMTP con DOCX. RECHAZADO existe en CHECK pero sin endpoint. Plantillas DOCX: SharePoint `APLICATIVOS EXTERNOS/FORMATOS_CONTRATOS/...` → POST /plantilla.

## 9. Asistencia
```
App/registro de marcación (fuera del repo: PV) → dbo.Asistencia (IdEstado 9 = pendiente de validación)
  aprobarcampo.tsx → GET /operacion/aprobarcampo/listar (sp_Asistencia_ValidarCampo)
     ├ aprobar ingreso (estadomarcacion==9) → sp_Asistencia_AprobarIngreso
     ├ aprobar salida  (estadosalida==9)    → sp_Asistencia_AprobarSalida
     └ rechazar (observación obligatoria)   → sp_Asistencia_RechazarDocumento
  rptasistencia.tsx → GET /asistencia/reporte (RptAsistenciaFechas) → edición de estado (PUT estado-marcacion)
     → llamada de atención: PDF (QuestPDF) + email (Hangfire AsistenciaReporteJob) máx. 1 por empleado/día
  Job diario "asistencia-sharepoint-diario" (02:00 Lima por defecto) → sp_Asistencia_BuscarPorFechas_Job → JSON a SharePoint
```

## 10. Reportes automáticos por WhatsApp (WUP)
```
Arranque API → ReporteWhatsappJobScheduler.ReprogramarAsync(Operativo, Gerencial)  (config dbo.ReporteWupConfig)
Hangfire recurrente → ReporteWhatsAppJob → ReporteAutomaticoService.EjecutarAsync
  destinatarios sp_EmpleadoCj_Listar_Wup(_Gerencia) → bloques (CantidadEmpleadosPorBloque, Delay ≥5 s)
  → por empleado: RptAsistenciaFechas → PDF (QuestPDF) → WupService.EnviarAdjuntoAsync → log ReporteWhatsAppLog(Gerencia)
  EstadoEnvio: ENVIADO | DUPLICADO_OMITIDO | OMITIDO_SIN_TELEFONO | OMITIDO_TELEFONO_INVALIDO | OMITIDO_SIN_DATOS |
               ERROR_GENERANDO_REPORTE(_TIMEOUT) | ERROR_CONVERSION_BASE64 | ERROR_ENDPOINT_WUP | ERROR | OMITIDO_SIN_BOLETA
Manual: rptwup*.tsx → /reportes-whatsapp/ejecutar-ahora | reintentar-fallidos | enviar-mensaje-manual (ADM)
Boleta (PLANILLA_BOLETA_WUP): mismo JobId que Operativo (colisión) y no se reprograma al arrancar.
```
**Autoservicio entrante:** Meta/WUP → POST /whatsapp/webhook (anónimo) → WhatsappInboundService (estado de conversación en memoria) → menú asistencia/boleta → responde PDF por WUP o Meta.

## 11. Comunicaciones móviles
Admin (rol 5) → POST /mobile/admin/comunicaciones (`sp_Comunicacion_Crear`) + adjuntos SharePoint → Job `mobile-push-dispatch` c/5 min (si `MobilePush:Enabled`) → `sp_ComunicacionPush_ObtenerPendientes` → Expo push → `sp_ComunicacionPush_RegistrarResultado` → App: leer/confirmar (`sp_Comunicacion_MarcarLeido/Confirmar`) → Monitor/seguimiento.

## 12. Arrendamientos
Maestros (arrendador, inquilino, inmueble, unidad) → Contrato (`sp_a_Contrato_Guardar`, versiones/adendas en `a_contrato_version`) → Obligaciones (`sp_a_Obligacion_Generar`, batch enviado por FE, sin job) → Pago (`sp_a_Pago_Registrar`, EstadoValidacion PENDIENTE) → Aprobación (`sp_a_Pago_Aprobar`, mínimo `PAGO_APROBACIONES_MINIMAS`=2 ⇒ APROBADO, si no PARCIAL; rechazo RECHAZADO) → Aplicación (`sp_a_Pago_Aplicar` ⇒ obligación PAGADO/PARCIAL, saldo a favor) → Reversión (`sp_a_Pago_Revertir` ⇒ ANULADO). ⚠ Aplicar permite pagos PENDIENTE.

## 13. Migración / importación de OT
- **Nuevo** (`importar.tsx`): XLSX en cliente → POST /mantenimiento/migracion/importar/procesar (`accion` VALIDAR|ACTUALIZAR) → `sp_MigracionImport_ProcesarNew` (TVP) → resumen Coinciden/ConDiferencias/NoEncontrados/Observados/Ambiguos/Actualizados.
- **Legacy** (`m_importar.tsx`): /analizar (parse en servidor) → /aplicar (DELETE global `updimportar` + INSERT fila a fila + `sp_MigracionImport_Insertar|Actualizar`).

## 14. Autenticación / sesión
Login (`sp_ValidarUsuario`, clave en texto plano) → JWT 30 min + sesión en memoria (idle 30 min) → menú dinámico (`sp_Seguridad_ObtenerMenuDinamico`) → navegación. Expira a los 30 min aunque haya actividad (sin refresh). Logout: /auth/logout o beacon.
