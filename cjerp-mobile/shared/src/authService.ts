import { httpClient } from "./httpClient";
import { clearAuthUser, getAuthUser, saveAuthUser, type AuthUser } from "./authStore";

type LoginResponse = {
  token: string;
  sessionId?: string;
  expiration?: string;
  idleTimeoutMinutes?: number | null;
  idUsuario?: string;
  nombreEmpleado?: string;
  correo?: string;
  codEmp?: number | null;
  idEmpleado?: number | null;
  idCargo?: number | null;
  idPerfil?: number | null;
  idRol?: number | null;
};

const num = (v: number | null | undefined) => (typeof v === "number" ? v : undefined);

/** Código de la aplicación (SegApp.CodigoApp) con la que esta app inicia sesión; cada app lo fija al arrancar. */
let appCodigo = "";

export function setAppCodigo(codigo: string) {
  appCodigo = codigo;
}

/**
 * Login contra POST /api/auth/login. El backend valida credenciales y, para la app indicada, que el usuario esté activo, que su cargo
 * esté permitido y que tenga un rol de ESA app; solo entonces crea la sesión. 401 = credenciales; 403 = sin acceso a esta app (con motivo).
 */
export async function login(idUsuario: string, clave: string): Promise<AuthUser> {
  if (!appCodigo) throw new Error("La aplicación no definió su código (setAppCodigo).");
  // skipAuthRedirect: un 401 aquí es "usuario o clave incorrectos", no una sesión vencida.
  const r = await httpClient.post<LoginResponse>(
    "/auth/login",
    { idUsuario: idUsuario.trim(), clave, app: appCodigo },
    { skipAuthRedirect: true },
  );
  const user: AuthUser = {
    token: r.token,
    sessionId: r.sessionId,
    expiration: r.expiration,
    idleTimeoutMinutes: num(r.idleTimeoutMinutes),
    idUsuario: r.idUsuario,
    nombreEmpleado: r.nombreEmpleado,
    correo: r.correo,
    codEmp: num(r.codEmp),
    idEmpleado: num(r.idEmpleado),
    idCargo: num(r.idCargo),
    idPerfil: num(r.idPerfil),
    idRol: num(r.idRol),
  };
  await saveAuthUser(user);
  return user;
}

export async function renewSession(): Promise<void> {
  const current = getAuthUser();
  if (!current) return;
  const r = await httpClient.post<{ token: string; expiration?: string }>("/auth/refresh");
  const latest = getAuthUser();
  if (r?.token && latest && latest.sessionId === current.sessionId) {
    await saveAuthUser({ ...latest, token: r.token, expiration: r.expiration ?? latest.expiration });
  }
}

export async function logout(): Promise<void> {
  try {
    if (getAuthUser()) await httpClient.post("/auth/logout", undefined, { skipAuthRedirect: true });
  } catch {
    // Aunque falle la red, la sesión local se cierra igual.
  } finally {
    await clearAuthUser();
  }
}
