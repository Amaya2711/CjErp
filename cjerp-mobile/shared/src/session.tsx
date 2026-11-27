import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { getAuthUser, getLastActivity, loadAuthUser, markActivity, subscribeAuth, type AuthUser } from "./authStore";
import { login as apiLogin, logout as apiLogout, renewSession } from "./authService";
import { setUnauthorizedHandler } from "./httpClient";
import { setSessionNotice } from "./sessionNotice";

// Mismos criterios que la web: renovar cada 5 min mientras haya uso; 10 min de inactividad por defecto.
const DEFAULT_IDLE_MINUTES = 10;
const RENEW_INTERVAL_MS = 5 * 60 * 1000;
const CHECK_INTERVAL_MS = 15 * 1000;
const ACTIVITY_EVENTS = ["pointerdown", "keydown", "touchstart", "scroll", "click"] as const;

type SessionContextValue = {
  user: AuthUser | null;
  /** true mientras se lee la sesión guardada al abrir la app. */
  loading: boolean;
  login: (idUsuario: string, clave: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(getAuthUser());
  const [loading, setLoading] = useState(true);
  const lastRenewRef = useRef(Date.now());

  useEffect(() => {
    const unsubscribe = subscribeAuth(() => setUser(getAuthUser()));
    setUnauthorizedHandler(() => setUser(null));
    void loadAuthUser().finally(() => setLoading(false));
    return unsubscribe;
  }, []);

  const logout = useCallback(async () => {
    await apiLogout();
  }, []);

  useEffect(() => {
    if (!user) return;

    const onActivity = () => markActivity();
    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));

    const timer = window.setInterval(() => {
      const current = getAuthUser();
      if (!current) return;
      const idleMs =
        (current.idleTimeoutMinutes && current.idleTimeoutMinutes > 0
          ? current.idleTimeoutMinutes
          : DEFAULT_IDLE_MINUTES) *
        60 *
        1000;

      if (Date.now() - getLastActivity() >= idleMs) {
        setSessionNotice("Sesión cerrada por inactividad.");
        void logout();
        return;
      }
      // Solo se renueva si el usuario estuvo activo desde la última renovación.
      if (Date.now() - lastRenewRef.current >= RENEW_INTERVAL_MS && getLastActivity() > lastRenewRef.current) {
        lastRenewRef.current = Date.now();
        void renewSession().catch(() => {
          /* un 401 lo gestiona httpClient */
        });
      }
    }, CHECK_INTERVAL_MS);

    return () => {
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, onActivity));
      window.clearInterval(timer);
    };
  }, [user, logout]);

  const login = useCallback(async (idUsuario: string, clave: string) => {
    const result = await apiLogin(idUsuario, clave);
    lastRenewRef.current = Date.now();
    return result;
  }, []);

  return <SessionContext.Provider value={{ user, loading, login, logout }}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession debe usarse dentro de <SessionProvider>.");
  return ctx;
}

/**
 * Protege rutas de la app. `cargos` restringe por IdCargo (50 empleado, 51 externo) solo para la
 * interfaz; el control real lo hace el backend con [RequiereMenu] en cada endpoint.
 */
export function RequireAuth({ children, cargos }: { children: ReactNode; cargos?: number[] }) {
  const { user, loading } = useSession();
  const location = useLocation();

  if (loading) return <div style={{ padding: 24 }}>Cargando…</div>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (cargos && (user.idCargo === undefined || !cargos.includes(user.idCargo))) {
    return <div style={{ padding: 24 }}>Su cargo no tiene acceso a esta aplicación.</div>;
  }
  return <>{children}</>;
}
