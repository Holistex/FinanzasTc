"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { Clock, LogOut, ShieldAlert } from "lucide-react";
import { logoutAction } from "@/actions/auth.actions";

const INACTIVITY_LIMIT_MS = 30 * 60 * 1000; // 30 minutos (1,800,000 ms)
const WARNING_BEFORE_MS = 2 * 60 * 1000; // Aviso preventivo últimos 2 minutos
const THROTTLE_MS = 5000; // Throttle de 5 segundos
const STORAGE_KEY = "finanzas_core_last_activity";

const ACTIVITY_EVENTS: Array<keyof WindowEventMap> = [
  "mousemove",
  "mousedown",
  "keydown",
  "scroll",
  "touchstart",
  "click",
];

export function SessionTimeoutGuard() {
  const [showWarning, setShowWarning] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(120);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const lastActivityRef = useRef<number>(Date.now());
  const lastThrottleWriteRef = useRef<number>(0);
  const showWarningRef = useRef<boolean>(false);
  const loggingOutRef = useRef<boolean>(false);

  useEffect(() => {
    showWarningRef.current = showWarning;
  }, [showWarning]);

  const executeLogout = useCallback(async () => {
    if (loggingOutRef.current) return;
    loggingOutRef.current = true;
    setIsLoggingOut(true);

    try {
      await logoutAction();
    } catch {
      // Continuar con limpieza local aunque falle la llamada de red
    }

    try {
      document.cookie = "tensacon_session=; path=/; max-age=0";
      localStorage.removeItem(STORAGE_KEY);
      sessionStorage.clear();
    } catch {
      // Ignorar errores de almacenamiento restringido
    }

    window.location.href = "/login?reason=inactivity";
  }, []);

  const recordActivity = useCallback((force = false) => {
    if (loggingOutRef.current) return;
    // Si el modal de advertencia está abierto, exigir clic explícito en "Continuar Trabajando"
    if (showWarningRef.current && !force) return;

    const now = Date.now();
    lastActivityRef.current = now;

    if (force || now - lastThrottleWriteRef.current >= THROTTLE_MS) {
      lastThrottleWriteRef.current = now;
      try {
        localStorage.setItem(STORAGE_KEY, String(now));
      } catch {
        // Ignorar si localStorage no está disponible
      }
    }
  }, []);

  const handleContinueWorking = () => {
    setShowWarning(false);
    setRemainingSeconds(120);
    recordActivity(true);
  };

  useEffect(() => {
    // Inicializar marca de tiempo al montar la sesión autenticada
    recordActivity(true);

    const onActivity = () => recordActivity(false);

    for (const eventName of ACTIVITY_EVENTS) {
      window.addEventListener(eventName, onActivity, { passive: true });
    }

    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY || !e.newValue) return;
      const remoteTs = Number(e.newValue);
      if (Number.isFinite(remoteTs) && remoteTs > lastActivityRef.current) {
        lastActivityRef.current = remoteTs;
        const elapsed = Date.now() - remoteTs;
        if (elapsed < INACTIVITY_LIMIT_MS - WARNING_BEFORE_MS) {
          setShowWarning(false);
        }
      }
    };

    window.addEventListener("storage", onStorage);

    const intervalId = window.setInterval(() => {
      if (loggingOutRef.current) return;

      const elapsed = Date.now() - lastActivityRef.current;
      const remainingMs = INACTIVITY_LIMIT_MS - elapsed;

      if (remainingMs <= 0) {
        setShowWarning(false);
        void executeLogout();
        return;
      }

      if (remainingMs <= WARNING_BEFORE_MS) {
        setShowWarning(true);
        setRemainingSeconds(Math.max(1, Math.ceil(remainingMs / 1000)));
      } else if (showWarningRef.current) {
        setShowWarning(false);
      }
    }, 1000);

    return () => {
      for (const eventName of ACTIVITY_EVENTS) {
        window.removeEventListener(eventName, onActivity);
      }
      window.removeEventListener("storage", onStorage);
      window.clearInterval(intervalId);
    };
  }, [executeLogout, recordActivity]);

  if (!showWarning) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="session-timeout-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-slate-800 shadow-2xl">
        <div className="flex items-start gap-3.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-orange-200 bg-orange-50 text-[#E05A10]">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2
              id="session-timeout-title"
              className="text-base font-bold text-slate-900"
            >
              Sesión próxima a expirar por inactividad
            </h2>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
              No se ha detectado actividad reciente. Por seguridad, su sesión se
              cerrará automáticamente en{" "}
              <span className="inline-flex items-center gap-1 rounded bg-orange-50 px-1.5 py-0.5 font-mono font-bold text-[#E05A10] border border-orange-200">
                <Clock className="h-3 w-3" />
                {remainingSeconds} segundos
              </span>
              .
            </p>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-2.5 border-t border-slate-100 pt-4">
          <button
            type="button"
            onClick={() => void executeLogout()}
            disabled={isLoggingOut}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>Cerrar Sesión Ahora</span>
          </button>
          <button
            type="button"
            onClick={handleContinueWorking}
            disabled={isLoggingOut}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#E05A10] px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-[#c84e0c] transition-colors disabled:opacity-50"
          >
            <span>Continuar Trabajando</span>
          </button>
        </div>
      </div>
    </div>
  );
}
