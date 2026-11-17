"use client";

import { useEffect } from "react";
import { registrarPulsoSesionAction } from "@/actions/auth.actions";

const HEARTBEAT_INTERVAL_MS = 60_000;

export function SessionHeartbeat() {
  useEffect(() => {
    const sendPulse = () => {
      registrarPulsoSesionAction()
        .then((res) => {
          if (res?.forceLogout) {
            document.cookie = "tensacon_session=; path=/; max-age=0";
            window.location.href = "/login";
          }
        })
        .catch(() => {});
    };

    // Pulso inmediato al montar
    sendPulse();

    const intervalId = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        sendPulse();
      }
    }, HEARTBEAT_INTERVAL_MS);

    return () => {
      clearInterval(intervalId);
    };
  }, []);

  return null;
}
