import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { logoutSession } from "../../features/auth/services/logoutSession";
import { renewSession } from "../../features/auth/services/authService";
import {
  getAuthUser,
  getLastAuthActivity,
  markAuthActivity,
  saveAuthUser,
} from "../../utils/authStorage";
import { getJwtExpiration, isJwtExpired } from "../../utils/jwt";

// La sesión se cierra tras 10 minutos sin uso (ratón, teclado, scroll o toque).
const DEFAULT_IDLE_TIMEOUT_MINUTES = 10;
// Mientras haya uso, el token se renueva como máximo cada 5 minutos (el token dura 30).
const RENEW_INTERVAL_MS = 5 * 60 * 1000;
const RENEW_RETRY_DELAY_MS = 30 * 1000;
const LAST_ACTIVITY_KEY = "authLastActivityAt";
const ACTIVITY_EVENTS: Array<keyof WindowEventMap> = [
  "mousemove",
  "mousedown",
  "keydown",
  "scroll",
  "touchstart",
  "click",
];

function getIdleTimeoutMs() {
  const configuredMinutes = Number(import.meta.env.VITE_IDLE_TIMEOUT_MINUTES ?? DEFAULT_IDLE_TIMEOUT_MINUTES);
  const safeMinutes = Number.isFinite(configuredMinutes) && configuredMinutes > 0
    ? configuredMinutes
    : DEFAULT_IDLE_TIMEOUT_MINUTES;

  return safeMinutes * 60 * 1000;
}

export default function SessionManager() {
  const location = useLocation();
  const timerRef = useRef<number | null>(null);
  const logoutInProgressRef = useRef(false);
  const lastRenewRef = useRef(0);
  const renewInFlightRef = useRef(false);

  useEffect(() => {
    if (location.pathname !== "/") {
      markAuthActivity();
    }
  }, [location.pathname]);

  useEffect(() => {
    const idleTimeoutMs = getIdleTimeoutMs();

    const clearTimer = () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    const executeLogout = async () => {
      if (logoutInProgressRef.current) {
        return;
      }

      logoutInProgressRef.current = true;
      await logoutSession();
    };

    const validateSession = () => {
      const authUser = getAuthUser();
      if (!authUser?.token) {
        clearTimer();
        logoutInProgressRef.current = false;
        return;
      }

      if (isJwtExpired(authUser.token)) {
        void executeLogout();
        return;
      }

      const lastActivity = getLastAuthActivity() ?? Date.now();
      const tokenExpiration = getJwtExpiration(authUser.token)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const idleDeadline = lastActivity + idleTimeoutMs;
      const nextDeadline = Math.min(idleDeadline, tokenExpiration);
      const remainingMs = Math.max(0, nextDeadline - Date.now());

      clearTimer();
      timerRef.current = window.setTimeout(() => {
        void executeLogout();
      }, remainingMs);
    };

    // Renueva el token y la sesión del servidor solo si el usuario está usando la aplicación;
    // sin uso no se renueva y la sesión termina a los 10 minutos.
    const renewIfNeeded = async () => {
      const authUser = getAuthUser();
      if (!authUser?.token || renewInFlightRef.current) {
        return;
      }
      if (Date.now() - lastRenewRef.current < RENEW_INTERVAL_MS) {
        return;
      }

      renewInFlightRef.current = true;
      try {
        const renewed = await renewSession();
        const current = getAuthUser();
        if (renewed?.token && current?.token && current.sessionId === authUser.sessionId) {
          saveAuthUser({ ...current, token: renewed.token, expiration: renewed.expiration ?? current.expiration });
        }
        lastRenewRef.current = Date.now();
      } catch {
        // Un 401 lo gestiona httpClient (vuelve al login). Ante un fallo de red se reintenta
        // en 30 segundos con la siguiente actividad.
        lastRenewRef.current = Date.now() - RENEW_INTERVAL_MS + RENEW_RETRY_DELAY_MS;
      } finally {
        renewInFlightRef.current = false;
      }
    };

    const handleActivity = () => {
      if (!getAuthUser()?.token) {
        return;
      }

      markAuthActivity();
      validateSession();
      void renewIfNeeded();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        validateSession();
      }
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key === "authUser" || event.key === LAST_ACTIVITY_KEY) {
        validateSession();
      }
    };

    ACTIVITY_EVENTS.forEach((eventName) => {
      window.addEventListener(eventName, handleActivity, { passive: true });
    });

    window.addEventListener("storage", handleStorage);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    validateSession();

    return () => {
      clearTimer();
      ACTIVITY_EVENTS.forEach((eventName) => {
        window.removeEventListener(eventName, handleActivity);
      });
      window.removeEventListener("storage", handleStorage);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  return null;
}
