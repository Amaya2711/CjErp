# IA Chat — Fase 2: matriz de permisos APROBADA (configuración inicial editable)

> **Aprobada por el responsable de negocio el 2026-10-03. NO aplicada**: el seed (`Database/IaChat/09_IaToolPermiso_Seed_MatrizAprobada.sql`) y la habilitación de menú (`Database/IaChat/10_Menu_ChatIA_PerfilRol_2_34.sql`) están preparados y **sin ejecutar**. Esta matriz es **configuración inicial editable**: se carga en `dbo.IaToolPermiso` y luego se mantiene en BD (y con la pantalla de administración descrita en el plan); **no hay valores fijos en el código**. La Fase 2 sigue **abierta**: la ruta antigua sigue activa hasta completar la integración en desarrollo.

## Matriz aprobada (herramienta `buscar_planilla`, módulo GASTOS)
Alcance de filas: `PROPIO` = filas donde el empleado de la cuenta es responsable **o** solicitante; `EQUIPO` = titular + **subordinados directos** (mismo criterio); `TOTAL` = todas las filas. **Totales globales** (ventas, saldos y valor de OC por site; 15 columnas) es un permiso **independiente** del alcance.

| IdPerfilRol | IdPerfil / Perfil | IdRol / Rol | Cuentas activas (2026-10-03) | Alcance de filas | Totales globales |
|---|---|---|---|---|---|
| 2 | 2 / FINANZAS | 4 / ADMIN | 1 | **TOTAL** | **SÍ** |
| 30 | 2 / FINANZAS | 7 / ESTANDAR | 2 | **TOTAL** | NO |
| 32 | 2 / FINANZAS | 8 / ESPE_FIN | 1 | **TOTAL** | NO |
| 3 | 3 / LOGISTICA | 4 / ADMIN | 1 | EQUIPO | NO |
| 31 | 4 / ADMINISTRACION | 7 / ESTANDAR | 1 | PROPIO | NO |
| 26 | 8 / ADMIN | 4 / ADMIN | 1 | **EQUIPO** | NO |
| 27 | 8 / ADMIN | 5 / SISTEMAS | 1 | PROPIO | NO |
| 29 | 9 / OPERACIONES | 4 / ADMIN | 2 | EQUIPO | NO |
| 33 | 9 / OPERACIONES | 7 / ESTANDAR | 4 | PROPIO | NO |
| 28 | 14 / ESTANDAR | 7 / ESTANDAR | 5 | PROPIO | NO |
| 34 | 15 / GERENCIA | 4 / ADMIN | 2 | **TOTAL** | **SÍ** |

(En negrita, los valores que difieren de la propuesta inicial: 30 y 32 pasan a TOTAL sin globales; 26 pasa a EQUIPO; 2 y 34 TOTAL con globales.) Cualquier otro perfil-rol, y los que se creen en el futuro, **no tienen acceso** hasta que se configure explícitamente.

## Menú "Chat IA"
Hoy solo ADMIN/ADMIN (26) y ADMIN/SISTEMAS (27) tienen el menú `/reportes/administrativo/iachat`. Aprobado: habilitarlo **únicamente** para **FINANZAS/ADMIN (2: IdPerfil 2, IdRol 4)** y **GERENCIA/ADMIN (34: IdPerfil 15, IdRol 4)** mediante la seguridad existente (`SegPerfilRolMenu`, mismo mecanismo que usa el menú lateral): script `10_Menu_ChatIA_PerfilRol_2_34.sql`, **no ejecutado**, y que se aplica **después de validar el alcance** (paso P9 de `AI_COPILOT_FASE2_INTEGRACION_DEV.md`). Los menús existentes **no se modifican**. Los otros siete perfil-rol con permiso (30, 32, 3, 31, 29, 33 y 28) **quedan sin cambios de menú hasta una decisión posterior**; entretanto podrían usar el IA Chat solo llamando al API directamente (el backend los autorizará según la matriz). El verificador `12_…` marca FAIL si alguno de ellos aparece con el menú sin haberse aprobado.

## Reglas aprobadas
1. **Sin perfil-rol activo: denegado**, sin permiso base.
2. **Sin empleado corporativo** resoluble: **denegado para PROPIO y EQUIPO**. TOTAL no depende del empleado, pero solo existe con concesión explícita en la tabla.
3. **Filas sin responsable ni solicitante mapeados** (ronda 4: 7 177 de 112 484 = 6,4 %; 6 559 de 2024, 481 de 2025, 136 de 2026, 1 sin fecha): se **excluyen temporalmente** para PROPIO y EQUIPO (solo las ve TOTAL), con **seguimiento obligatorio para corregir esos datos** en origen (completar `Empleado.IdEmpleadoCj` / mapeo del solicitante). Nunca es una fuga: es sub-inclusión.
4. Los permisos se evalúan **por `IdUsuario`** (no por empleado ni por los claims `IdPerfil`/`IdRol` del JWT), con asignación, perfil-rol, perfil y rol activos, y se **reevalúan en cada consulta y exportación**; una revocación o reducción invalida la memoria incompatible en la siguiente consulta, sin cerrar sesión ni redesplegar.
5. Un usuario con **varios perfil-rol activos** recibe la **unión**: el alcance más amplio y totales globales si cualquiera los concede (hoy ninguna cuenta tiene más de uno).

## Datos de partida verificados (BD `JC_Db`, 2026-10-03)
- 21 cuentas con perfil-rol activo; las 21 resuelven empleado corporativo. 316 cuentas en total; 35 no resuelven empleado (ninguna de las 21).
- Subordinados directos (cuentas de la matriz): 2: 13; 3: 19; 26: 49; 27: 0; 28: 0–12; 29: 5–23; 30: 0; 31: 2; 32: 1; 33: 0–19; 34: 4–19. Jerarquía sin ciclos; `IdResponsableCj = 0` = "sin jefe".
- Cobertura de identificadores: ver regla 3. Solicitante mapeado: 98,4 % (2025) y 99,1 % (2026).

## Limitaciones conocidas (aceptadas)
- PROPIO/EQUIPO miran **solo** responsable y solicitante: quien ejecuta, gestiona o valida pagos (`IdEjecutor`, `IdGestor`, `IdValidador`) no ve por ese motivo las filas que paga. FINANZAS/ESTANDAR y ESPE_FIN quedan en TOTAL, lo que lo evita para esos perfil-rol. Cambiar la regla sería una decisión de negocio nueva.
- Quien no esté en la matriz, aunque tenga el menú, será denegado por el backend.
