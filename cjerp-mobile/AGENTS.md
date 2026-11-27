# cjerp-mobile — reglas para todas las apps móviles

Apps móviles de CJ ERP. Cada subcarpeta es una app (`logistica/`, futuras `externos/`, …) y todas
comparten `shared/` (login, sesión, cliente HTTP). El único web es `../cjerp-frontend`.
Reglas generales del sistema: `../AGENTS.md`.

## Reglas obligatorias

1. **La app no tiene lógica de negocio propia.** Toda regla, validación y permiso vive en el
   backend (`../CjERP.Backend`). La app solo muestra datos y envía acciones.
2. **No inventar endpoints ni reglas.** Solo se usan endpoints que existen en el backend. Si falta
   uno, se deja un `TODO(backend)` y se avisa; no se simula ni se calcula en el cliente.
3. **Login único:** `POST /api/auth/login` (vía `@cjerp/shared`). No crear otro login, no validar
   clave en la app, no guardar la clave.
4. **Permisos:** el control real es del servidor con `[RequiereMenu("CODIGO_MENU", MenuAccion, cargos)]`
   (`CjERP.Api/Authorization`). Ocultar botones en la app es solo cortesía de interfaz. Los endpoints
   móviles viven en `CjERP.Api/Controllers/Mobile/` bajo `api/mobile/<app>/...`.
5. **Cargos:** `IdCargo` 50 = empleado, 51 = externo (misma tabla EmpleadoCj). Los menús móviles se
   asignan a roles propios (p. ej. "Móvil Logística"), **nunca** al rol estándar (lo comparten ambos cargos).
6. **Montos:** nunca convertir a soles; se muestran en la moneda real (ver memoria `regla-montos-moneda-real`).
7. Respuestas de la API: `{ success, message, data }`; `httpClient` ya desenvuelve `data` y lanza error
   con el mensaje del servidor. Usar `getErrorMessage()` para mostrarlo.
8. Sesiones: el backend admite VARIAS sesiones simultáneas por usuario (cada login crea un SessionId; ActiveUserSessionService). Entrar al móvil NO cierra la web.
9. UI móvil: tarjetas/listas, no tablas anchas; inputs de 16 px; respetar safe-area.

## Desarrollo

```
cd cjerp-mobile
npm install
npm run dev:logistica        # http://localhost:5174 (y http://IP-DE-LA-PC:5174 desde el celular)
```

En desarrollo la API es `http://<host>:5015/api` (backend local). Para probar desde el celular,
agregar el origen `http://IP-DE-LA-PC:5174` a `Cors:AllowedOrigins` de `appsettings.Development.json`
(archivo local, ignorado por git). **No tocar el CORS de producción sin aprobación**; la app
empaquetada con Capacitor necesitará `https://localhost` (Android) y `capacitor://localhost` (iOS).

## Login y aplicaciones (shared + logistica/LoginPage)

Un mismo usuario puede tener acceso a la web y a una o varias apps móviles. El login recibe la **aplicación** (`app`; la web no la envía y
vale `WEB`) y el backend elige el rol **de esa aplicación**; nunca se "tantea" el rol:
- `SegApp` (catálogo: `WEB`, `MOB_LOGISTICA`, futuras `MOB_xxx`; `CargosPermitidos`) y `SegRolApp` (a qué apps pertenece cada rol; un rol sin fila
  pertenece a `WEB`, así los roles actuales no se migran). Script `CjERP.Backend/Database/Seguridad/02_SegApp_SegRolApp.sql` (+ `sp_SegRolApp_Asignar`).
- `AuthService.LoginAsync`: web = comportamiento de siempre (rol web más antiguo, ignorando los roles de apps móviles); app móvil = valida, **antes
  de crear la sesión**, app activa, `Usuario.IdEstado = 1`, `IdCargo` permitido (EmpleadoCj) y un rol activo de esa app. Falla con **403** y motivo
  (`AccesoAplicacionException`); credenciales malas = **401** genérico.
- El JWT lleva el claim `App`; `[RequiereMenu(app, menu, acción)]` exige que coincida, que el usuario siga activo y que alguno de sus roles de esa app
  tenga el permiso (lee la BD, caché 60 s). Un token de una app no sirve en otra.
- La app llama `setAppCodigo("MOB_LOGISTICA")` al arrancar. Validaciones de pantalla: usuario obligatorio; clave obligatoria y máx. 10 caracteres
  (`@pClave NVARCHAR(10)`). Mensajes: 401 «Usuario o contraseña incorrectos.»; 403 = motivo del servidor; 429 / red / timeout / 5xx con mensajes propios.
  Un 401 con sesión abierta, un JWT vencido o la inactividad dejan un aviso que el login muestra una vez. Solo se recuerda el último usuario.
- Para dar acceso a una app: crear el rol → `EXEC dbo.sp_SegRolApp_Asignar @IdRol, 'MOB_LOGISTICA'` → darle el menú `MOB_LOG_DESPACHOS` → asignarlo al
  usuario (Seguridad **agrega**, no reemplaza el rol de la web).
- Hallazgos del login web (no corregidos, la web depende de ellos): no valida `Usuario.IdEstado`; clave en texto plano de ≤ 10 caracteres; crea
  ESTANDAR-ESTANDAR si el usuario no tiene perfil-rol web; `LoginResponseDto.IdCargo` solo se llena en apps móviles (el SP no lo devuelve).

## App logistica: x Despachar

Reglas del flujo (decisiones aprobadas, sistema antiguo y anomalías): `../docs/mobile/despachos-reglas-legado.md`.
Endpoints: `api/mobile/logistica/despachos` (`MobileLogisticaDespachosController`): GET (pendientes), GET `series`,
POST `imagen`, POST `despachar`, POST `rechazar`. Permisos por acción: Ver / Editar / Aprobar sobre `MOB_LOG_DESPACHOS`.
Reglas que la app NO decide (las valida el backend/SP): foto obligatoria, serie obligatoria en equipos (40), cantidad
parcial solo en no equipos (la diferencia vuelve a Disponible), motivo obligatorio al rechazar.
Rol a crear en Seguridad / Roles: "Despachador móvil".
**Alcance:** la app LEE solicitudes de ambos sistemas (campo `esSistemaNuevo`, filtro `origen`), pero solo OPERA (despachar /
rechazar) las del sistema nuevo (`CabSolicitud.IdWeb = 1`). Las del sistema antiguo (IdWeb NULL) se muestran en solo lectura; las
procesa el VB y el backend rechaza operarlas. No habilitar acciones sobre `esSistemaNuevo = false` desde la app.

## Pendiente / decisiones abiertas

- Empaquetado Capacitor (Android/iOS) y almacenamiento seguro (`setStorage()` en `shared/src/storage.ts`).
- Escaneo de código de barras para la serie (hoy se escribe o se elige de la lista).
- Configurar `SharePoint:FolderPaths:despachos` y ejecutar `Database/Logistica/25` (tras 24) y el menú móvil.
- Reutilizar la infraestructura móvil existente: `api/mobile/version`, `dispositivos`, `comunicaciones`.
- SQL del menú: `../CjERP.Backend/Database/Mobile/Logistica/00_menu_mobile_despachos.sql` (no ejecutado).
