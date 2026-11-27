# x Despachar: reglas del sistema antiguo (FrmLogistic_v1)

Fuente: `Logistica_25112026.txt` (VB.NET, pestaña `XtabEntrega`: `CargarDespacho` y `GrabarDespacho`, más
`GrdViewDespacho_*`). Este documento resume qué hace el sistema antiguo. **No es todavía la especificación del
sistema nuevo**: lo marcado como "decidir" requiere confirmación antes de implementarse.

## 1. Qué es la etapa

Almacén prepara lo solicitado y lo despacha. Entran solicitudes **aprobadas (estado 4)** o **sin aprobación (3)**; salen
en **estado 5** (siguiente pestaña: «x Enviar») o **rechazadas en estado 6**.

Modelo nuevo (ya definido en `Database/Logistica/01_Stock_Base.sql`, `LogisticaEtapaConfig`):

| Etapa | Estados origen | Destino | Stock |
|---|---|---|---|
| DESPACHAR | 3, 4 | 5 | Despachado → Enviado |
| RECHAZAR_DESP | 3, 4 | 6 | Despachado → Disponible |

## 2. Consulta (qué se lista)

- Líneas de `DetSolicitud` con `IdEstado IN (3,4)` y `IdDespacho = 1`.
- Filtros: número(s) de solicitud, rango de fecha de creación, relación cliente-proyecto-site.
- Columnas que usa la pantalla: CodPap, NroSolicitud, PedidoSap, Correlativo, IdCliente, IdProyecto, IdSite,
  CorreSite, tipotrabajo, Posicion, CantSap (pedida), CantSol (a despachar, editable), Serie, RutaImagen,
  observacion, estado destino elegido (por defecto 5; alternativa 6).
- Fila resaltada cuando `CantSol <> CantSap`.

## 3. Datos que captura quien despacha

1. **Responsable del despacho** (obligatorio). Lista: si el cargo del usuario es 81-84, solo él mismo; si no, empleados
   de cargo 82 y 83.
2. Por línea:
   - **Serie**: solo materiales de código **40** (equipos). Se elige de las series con `DetLogistica.IdEstado = 2`
     (validadas) de ese material, excluyendo `NO APLICA`. Materiales 10 y demás: sin serie.
   - **Cantidad a despachar (`CantSol`)**: editable solo en materiales que **no** son 40 (los 40 van de uno en uno).
   - **Imagen** (`RutaImagen`): archivo subido al gestor de archivos.
   - **Observación**: se guarda en `DetSolicitud.observacion` al pulsar Enter.
   - **Estado destino**: 5 (despachar) o 6 (rechazar).

## 4. Validaciones al grabar

- Debe haber responsable y al menos una línea seleccionada; confirmación explícita antes de grabar.
- Si el estado destino es 5 y no hay imagen: se rechaza ("No existe imagen cargada"). Aplica a **todos** los
  materiales (la condición solo-para-40 está comentada).
- Material 40 sin serie y destino distinto de 6: se rechaza.
- Cambiar la serie de una línea (ver sección 6) tiene validaciones propias.

## 5. Efectos al grabar (por línea seleccionada)

1. `CabSolicitud`: `IdEstado = 5`, `IdDespachador = responsable`. (Solo se ejecuta para la **primera** línea
   seleccionada; ver anomalías.)
2. `DetSolicitud`: `IdEstado = destino`, `RutaImagen`, `FechaDespacho = hoy`, `IdRespDespacho = usuario`,
   `CantDesp = cantidad`. Clave: NroSolicitud + Correlativo + CodPap + Serie + Posicion.
3. Rechazo (destino 6) de material 40 con serie: todas las líneas de esa solicitud con esa serie pasan a 6 y
   `DetLogistica` de esa serie vuelve a `IdEstado = 2`.
4. `MovMaterial`: inserta el movimiento (IdMovimiento 1, estado, solicitante = responsable).
5. `DetLogistica`: marca la serie/material del pedido origen como `IdEstado = 88` (en uso).
6. Stock: `enviado + cantidad`, `despachado - cantidad`.
7. `Kardex`: movimiento tipo 2 "DESPACHADO" con serie.
8. Después recarga la lista.

## 6. Cambio de serie en la grilla (material 40)

Al elegir una serie distinta: debe pertenecer al material; no se permite si la serie está en estado 5, 6, 7, 8, 9, 10, 11,
14, 15, 16, 17, 21, 22, 24 o 99; pide confirmación mostrando cliente/proyecto/site de ambas series; libera la serie
anterior (`DetLogistica.IdEstado = 2`), marca la nueva (88), actualiza `DetSolicitud.Serie` y registra en
`LogOperaciones` (campo, valor anterior, valor nuevo, usuario).

## 7. Permisos en el sistema antiguo

La pestaña se habilita por `Acceso_Perfil` (área 2, `Detalle` = nombre de la pestaña) por perfil del cargo o del empleado.
En el sistema nuevo esto se reemplaza por `SegRolMenuPermiso` + `[RequiereMenu]`.

## 8. Anomalías del sistema antiguo (no copiar sin decidir)

1. **Cabecera**: `CabSolicitud` solo se actualiza para la primera línea seleccionada; si se seleccionan líneas de varias
   solicitudes, las demás cabeceras no cambian.
2. **Cantidad parcial**: el código compara `CantSap` con `cCantSol` después de igualarlos, por lo que la rama de
   "diferencia" nunca se ejecuta. Despachar menos de lo pedido deja la diferencia en `despachado` en vez de devolverla.
3. **Rechazo**: pone la serie en 2 y después la rama común vuelve a ponerla en 88; el rechazo en despacho no mueve stock
   (el modelo nuevo sí: Despachado → Disponible).
4. **Kardex**: `IdSite` se rellena con el id de proyecto; `IdEstado` queda en 4.
5. Estado 3 (sin aprobación) no pasa por Aprobar, por lo que el stock no pasó a `despachado`; el modelo nuevo lo corrige
   (nota en `LogisticaEtapaConfig`).
6. El archivo fuente contiene credenciales SMTP en texto plano; rotarlas y no copiarlas a ningún sistema nuevo.

## 9. Decisiones aprobadas para el sistema nuevo (2026-11-26)

1. **Cantidad parcial: sí.** Se puede despachar menos de lo pedido; la diferencia vuelve a Disponible
   (Despachado → Disponible). Los equipos (código 40) se despachan completos.
2. **Imagen obligatoria para todos los materiales**, como en el sistema antiguo.
3. **Rol propio para el despachador** ("Despachador móvil"): se crea desde Seguridad / Roles y se le asigna el menú
   `MOB_LOG_DESPACHOS` con Ver + Editar + Aprobar. El responsable del despacho es el empleado que inició sesión.
4. **El rechazo también va en el móvil y exige motivo.**

Implementación (sin ejecutar en BD): `CjERP.Backend/Database/Logistica/25_sp_Logistica_Despacho.sql`,
`LogisticaEquiposService.{Consultar,ListarSeries,Grabar,Rechazar}Despacho*`,
`Controllers/Mobile/MobileLogisticaDespachosController.cs` y app `cjerp-mobile/logistica`.

Permisos del menú `MOB_LOG_DESPACHOS` (validados en el servidor con `[RequiereMenu]`, cargo 50):

| Acción | Permiso |
|---|---|
| Ver pendientes y series | Ver |
| Despachar y subir la foto | Editar |
| Rechazar | Aprobar |

Pendiente de configurar: `SharePoint:FolderPaths:despachos` (carpeta de las fotos). Sin ella, la subida responde 400 y no
se usa la carpeta de gastos por defecto. Las fotos se guardan como `storagePath` de SharePoint en
`DetSolicitud.RutaImagen` (el sistema antiguo guardaba un código del gestor de archivos).

## 9b. Alcance por migración parcial: solo `CabSolicitud.IdWeb = 1` (decidido 2026-11-27)

**Actualización 2026-11-27:** el móvil **lee** las solicitudes de ambos sistemas (`EsSistemaNuevo`; filtro `origen` = NUEVO / ANTIGUO / todas) y **solo opera** (despachar / rechazar) las del sistema nuevo. Las del sistema antiguo se muestran en solo lectura con el aviso «se despacha en el sistema antiguo»; el servidor además rechaza cualquier intento de operarlas (51412 / 51425).

Los sistemas antiguo y nuevo **conviven**. `CabSolicitud.IdWeb = 1` identifica las solicitudes del sistema nuevo; con `IdWeb`
NULL son del sistema antiguo y las sigue procesando el VB. Por eso el móvil **solo lista, despacha y rechaza solicitudes con
`IdWeb = 1`** (los SP 25 lo exigen: consulta filtrada; despachar/rechazar fallan con 51412 / 51425 si la solicitud es del
sistema antiguo). Consecuencia sobre el stock: no hace falta conciliar los documentos del sistema antiguo; el libro nuevo solo
debe cuadrar con las solicitudes `IdWeb = 1`, que nacen por `SOLICITAR` en el nuevo y por eso tienen su stock en el bucket
correcto. Al 2026-11-27 había 5 solicitudes `IdWeb = 1` (pruebas) y ninguna pendiente de despacho; las 384 líneas pendientes
(3/4) son todas del sistema antiguo.

Riesgo abierto (no es del despacho): `Disponible` es compartido. El sistema antiguo descuenta `MaterialStock.Disponible` y el
nuevo `StockSaldo.Disponible`, y no se sincronizan (el trigger 04 no está habilitado), por lo que pueden divergir.

Diagnóstico previo de solo lectura (2026-11-27), que motivó este alcance:

`StockSaldo` se cargó con el script 05 el 2026-10-12 y desde entonces el sistema antiguo (VB) siguió moviendo documentos sin
que el libro nuevo lo reflejara (el trigger 04 no está habilitado). Resultado: las 138 líneas en estado 4 (24.919 unidades)
y las 246 en estado 3 son posteriores a la carga, y el saldo `Despachado` es 1.323 unidades. `sp_Stock_Mover` rechazaría
(51001, saldo insuficiente) el despacho de la mayoría de esas líneas. Solo las solicitudes creadas desde la web nueva
(5 `SOLICITAR` en el libro) tienen el stock en el bucket correcto.

Antes de habilitar el móvil en producción hay que decidir: (a) fecha de corte en que logística deja el VB para este flujo, y
(b) un script de conciliación (delta) que reconstruya los buckets desde los documentos justo en ese corte. Mientras tanto
el móvil solo se puede probar con solicitudes nuevas de la web. Las líneas legado en estado 3 no tienen bucket en el script 05
(siguen en Disponible) y requieren mover Disponible → Despachado en esa conciliación.

## 10. Siguiente etapa

«x Enviar» (`GrabarEnvioSalida`): estado 5 → 11, requiere responsable de envío (cargo 81), guía, agencia, imagen de la
guía, monto y fecha no futura; stock Enviado → Campo. Es una etapa aparte.
