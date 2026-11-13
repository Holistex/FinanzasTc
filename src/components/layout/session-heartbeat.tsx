"use client";

import { useEffect } from "react";
import { registrarPulsoSesionAction } from "@/actions/auth.actions";

const HEARTBEAT_INTERVAL_MS = 60_000;

export function SessionHeartbeat() {
  useEffect(() => {
    // Pulso inmediato al montar
    registrarPulsoSesionAction().catch(() => {});

    const intervalId = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        registrarPulsoSesionAction().catch(() => {});
      }
    }, HEARTBEAT_INTERVAL_MS);

    return () => {
      clearInterval(intervalId);
    };
  }, []);

  return null;
}
