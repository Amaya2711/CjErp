import { getStorage } from "./storage";
import { isJwtExpired } from "./jwt";

export type AuthUser = {
  token: string;
  expiration?: string;
  sessionId?: string;
  /** Minutos de inactividad permitidos (los define el backend por usuario). */
  idleTimeoutMinutes?: number;
  idUsuario?: string;
  nombreEmpleado?: string;
  correo?: string;
  codEmp?: number;
  idEmpleado?: number;
  /** 50 = empleado, 51 = externo. */
  idCargo?: number;
  idPerfil?: number;
  idRol?: number;
};

const STORAGE_KEY = "cjerp.mobile.authUser";
const ACTIVITY_KEY = "cjerp.mobile.lastActivityAt";

// La API necesita el token de forma síncrona (interceptor de axios), por eso se guarda en memoria
// y se persiste en el almacenamiento asíncrono.
let memoryUser: AuthUser | null = null;
let lastActivityAt = 0;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function subscribeAuth(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getAuthUser(): AuthUser | null {
  return memoryUser;
}

export function getLastActivity(): number {
  return lastActivityAt;
}

export function markActivity(now = Date.now()) {
  lastActivityAt = now;
  void getStorage().set(ACTIVITY_KEY, String(now));
}

export async function loadAuthUser(): Promise<AuthUser | null> {
  const storage = getStorage();
  const raw = await storage.get(STORAGE_KEY);
  if (!raw) {
    memoryUser = null;
    emit();
    return null;
  }
  try {
    const user = JSON.parse(raw) as AuthUser;
    if (!user.token || isJwtExpired(user.token)) {
      await clearAuthUser();
      return null;
    }
    memoryUser = user;
    lastActivityAt = Number(await storage.get(ACTIVITY_KEY)) || Date.now();
    emit();
    return user;
  } catch {
    await clearAuthUser();
    return null;
  }
}

export async function saveAuthUser(user: AuthUser) {
  memoryUser = user;
  await getStorage().set(STORAGE_KEY, JSON.stringify(user));
  markActivity();
  emit();
}

export async function clearAuthUser() {
  memoryUser = null;
  lastActivityAt = 0;
  const storage = getStorage();
  await storage.remove(STORAGE_KEY);
  await storage.remove(ACTIVITY_KEY);
  emit();
}
