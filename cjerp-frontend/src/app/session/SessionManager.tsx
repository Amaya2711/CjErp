import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { logoutSession } from "../../features/auth/services/logoutSession";
import {
  getAuthUser,
  getLastAuthActivity,
  markAuthActivity,
} from "../../utils/authStorage";
import { getJwtExpiration, isJwtExpired } from "../../utils/jwt";

const DEFAULT_IDLE_TIMEOUT_MINUTES = 30;
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

    const handleActivity = () => {
      if (!getAuthUser()?.token) {
        return;
      }

      markAuthActivity();
      validateSession();
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
