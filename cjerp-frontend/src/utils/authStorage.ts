export type AuthUser = {
  token: string;
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

export function saveAuthUser(user: AuthUser) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
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
}
