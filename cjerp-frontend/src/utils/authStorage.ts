export type AuthUser = {
  token: string;
  expiration?: string;
  sessionId?: string;
  nombre?: string;
  nombreEmpleado?: string;
  empleado?: string;
  correo?: string;
  email?: string;
  usuario?: string;
  userName?: string;
  username?: string;
  codEmp?: string | number;
  idEmpleado?: string | number;
  idCargo?: string | number;
  codVal?: string | number;
  cuadrilla?: string | number;
  idperfil?: number;
  idrol?: number;
};

const STORAGE_KEY = "authUser";
const LAST_ACTIVITY_KEY = "authLastActivityAt";

export function saveAuthUser(user: AuthUser) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  markAuthActivity();
}

export function getAuthUser(): AuthUser | null {
  const value = localStorage.getItem(STORAGE_KEY);
  if (!value) return null;

  try {
    return JSON.parse(value) as AuthUser;
  } catch {
    return null;
  }
}

export function clearAuthUser() {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(LAST_ACTIVITY_KEY);
  sessionStorage.clear();
}

export function markAuthActivity(timestamp = Date.now()) {
  localStorage.setItem(LAST_ACTIVITY_KEY, timestamp.toString());
}

export function getLastAuthActivity(): number | null {
  const value = localStorage.getItem(LAST_ACTIVITY_KEY);
  if (!value) return null;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
