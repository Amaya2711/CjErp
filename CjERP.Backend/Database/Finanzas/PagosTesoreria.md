La página `/finanzas/tesoreria/pagartesoreria` gestiona las seis etapas de admPago y conserva el formato visual basado en `pagos_v1`.

Revisión y Contabilidad muestran `RevisionPmAprobar` (revisión de aprobación), conservando el dato original de `Planilla`; la columna también muestra `FechaRevisionAprobar`. Ambos datos se consultan en el detalle y forman parte del control de cambios concurrentes. Son de solo lectura en Tesorería: las acciones mantienen estos valores y la revisión de Tesorería continúa registrándose por separado en `RevisionPm` y `FechaRevision`. Los valores vacíos se muestran como «Sin registro».

Los grupos se presentan contraídos al abrir, consultar o cambiar de pestaña o agrupación. El encabezado concatena `RevisionPm · Tipo documento · Moneda`; la agrupación alternativa por responsable añade el responsable al final. `RevisionPm` vacío se muestra como «Sin revisión», sin sustituirlo por `RevisionPmAprobar`.

| Pestaña | Estado consultado | Acciones y destino |
|---|---|---|
| Revisión | 1 | Revisar → 9; observar → 7. Fecha y turno AM/PM calculados en Lima al guardar. |
| Contabilidad | 9 | Guardar retención y observación → Programado (8) o Administrativo (5); observar → 7. |
| Programado | 8 | Registrar pago → 4; enviar a Administrativo → 5; observar → 7. |
| Administrativo | 5 | Registrar pago → 4; programar → 8; observar → 7. |
| Rendición | 4 | Editar por bloques; permanece pagado. Filtrado por fecha de depósito, responsable, solicitante y rendición. |
| Observada | 2 y 7 | Guardar correcciones sin cambiar estado; subsanar devuelve 2 → 0 (aprobación) o 7 → 1 (revisión). |

Programado usa el estado **8**. El estado **9** corresponde a Contabilidad y el backend rechaza cualquier intento de pago desde ese estado. Las acciones de cambio de etapa en Programado y Administrativo están en «Otras acciones», separadas del formulario de pago para que no exijan completar datos bancarios.

Rendición permite activar independientemente datos generales (comprobante, tipo de pago, RUC, serie, emisión y observación), datos bancarios, estado de rendición u operación bancaria. Bancos incluye la operación y desactiva la alternativa de actualizarla por separado. Los bloques no activados conservan sus valores. La observación solo se actualiza con datos generales. Los campos vacíos de un bloque activado reemplazan el valor existente; esto se indica en el formulario y en la confirmación.

Observada permite corregir los datos del comprobante, el detalle y un enlace HTTPS al comprobante. Se exige describir la corrección. «Guardar corrección» mantiene el recibo observado; «Subsanar» lo devuelve a aprobación o revisión y nunca lo paga ni lo autoriza directamente. No se cambian importes ni responsables durante esta corrección. El enlace al comprobante se consulta desde el detalle.

Las cuentas bancarias del responsable son de consulta. Para cargar valores existentes en un formulario, seleccionar un solo recibo y pulsar «Cargar datos del recibo seleccionado». Las acciones en lote muestran una confirmación con recibos, campos y destino antes de escribir. Máximo 500 recibos por lote; solo los pagos y cambios de moneda bancaria exigen una moneda común. Los filtros limpian la selección y los formularios se reinician al cambiar de etapa.

Procedimientos reutilizados y verificados en SQL:

- `sp_Planilla_ActualizarRevisionMasiva`: revisión → 9.
- `sp_Planilla_ContabilidadMasivo`: retención y contabilidad → 8.
- `sp_Planilla_PasarAdministrativoMasivo`: retención y contabilidad → 5.
- `sp_Planilla_ProgramarMasivo`: administrativo → 8.
- `sp_Planilla_AdministrativoMasivo`: pago desde 5 → 4.
- `sp_Planilla_PagoContabilidadMasivo`, opción 2: pago desde 8 → 4.
- `sp_Planilla_ActualizarRendirMasivo`: edición por bloques. Se utilizan los parámetros vigentes `AplicarRendicionFinal` y `NroOperacionExtra`, que difieren de algunos nombres del documento antiguo.

El retorno 8 → 5 y las observaciones/correcciones usan actualizaciones parametrizadas, con comprobación de estado y auditoría. Se mantiene la regla de retención de los procedimientos: el porcentaje se aplica a comprobantes 2 y 5 para las opciones de retención 1 a 5. Una opción sin porcentaje conserva el importe de retención existente, no lo pone a cero. El porcentaje procede del catálogo del servidor.

Cada escritura usa una transacción y bloqueos de los recibos; compara una huella SHA-256 de los campos relevantes con la consulta original y comprueba el destino al terminar. Si otro usuario modificó el registro, se rechaza todo el lote y se solicita volver a consultar. Para las etapas cuyos procedimientos no auditan se escriben instantáneas anteriores y posteriores en `LogPlanilla`, incluida la información del adjunto en el detalle de auditoría, y los movimientos de estado en `MovEstadosPagos`. El usuario completo se conserva en `LogPlanilla`; `MovEstadosPagos` mantiene su columna heredada de 10 caracteres. Los procedimientos de pago mantienen su auditoría existente.

API: `GET /api/tesoreria/pagos`, `GET /api/tesoreria/pagos/catalogos`, `GET /api/tesoreria/pagos/cuentas/{responsable}`, `POST /api/tesoreria/pagos` (pago) y `POST /api/tesoreria/pagos/acciones` (otras etapas). Todos verifican el acceso al menú dinámico usando usuario, perfil y rol del JWT.

Para habilitar: reiniciar/publicar el backend y frontend actualizados; registrar el menú con `04_PagosTesoreria_Menu.sql` si no existe y asignarlo al perfil/rol autorizado. No se ejecutan automáticamente scripts ni se reemplazan procedimientos existentes. La base debe contener los procedimientos listados y `dbo.PlanillaRevisionType`.

Pruebas de reglas, sin conexión a SQL: `dotnet run --project Tests/PagoTesoreriaChecks/PagoTesoreriaChecks.csproj` desde `CjERP.Backend`. Comprueban la matriz de estados, el rechazo de pago desde Contabilidad, los bloques incompatibles y las entradas inválidas. Las pruebas de navegador usan datos simulados; para la aceptación operativa corresponde verificar un ciclo completo y sus auditorías en una base de pruebas.
