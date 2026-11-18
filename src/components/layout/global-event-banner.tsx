"use client";

import React, { useEffect, useState } from "react";
import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  Info,
  X,
} from "lucide-react";
import { EventoPlataforma, TipoEventoPlataforma } from "@/types/database.types";
import { cn } from "@/lib/utils";

const BANNER_STYLES: Record<
  TipoEventoPlataforma,
  {
    wrapper: string;
    closeBtn: string;
    icon: React.ComponentType<{ className?: string }>;
  }
> = {
  ADVERTENCIA: {
    wrapper: "bg-amber-400 text-slate-950 border-b border-amber-500",
    closeBtn: "hover:bg-amber-500/40 text-slate-900",
    icon: AlertTriangle,
  },
  INFORME_VERDE: {
    wrapper: "bg-emerald-600 text-white border-b border-emerald-700",
    closeBtn: "hover:bg-emerald-700/70 text-white/90 hover:text-white",
    icon: CheckCircle2,
  },
  INFORMATIVO: {
    wrapper: "bg-[#0F172A] text-white border-b border-slate-800",
    closeBtn: "hover:bg-slate-800 text-slate-300 hover:text-white",
    icon: Info,
  },
  CRITICO: {
    wrapper: "bg-red-600 text-white border-b border-red-700",
    closeBtn: "hover:bg-red-700/70 text-white/90 hover:text-white",
    icon: AlertOctagon,
  },
};

function getDismissKey(evento: EventoPlataforma): string {
  return `tensacon_evento_dismissed_${evento.id}_${evento.updated_at || evento.created_at}`;
}

export function renderMensajeConNegritas(texto: string) {
  const parts = texto.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong key={i} className="font-extrabold">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}

export function GlobalEventBanner({
  eventos,
}: {
  eventos: EventoPlataforma[];
}) {
  const [dismissedKeys, setDismissedKeys] = useState<Record<string, boolean>>({});
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (typeof window === "undefined") return;
    const initial: Record<string, boolean> = {};
    for (const ev of eventos) {
      const key = getDismissKey(ev);
      if (window.sessionStorage.getItem(key) === "1") {
        initial[key] = true;
      }
    }
    setDismissedKeys(initial);
  }, [eventos]);

  if (!mounted || eventos.length === 0) return null;

  const visibles = eventos.filter((ev) => !dismissedKeys[getDismissKey(ev)]);
  if (visibles.length === 0) return null;

  const handleDismiss = (ev: EventoPlataforma) => {
    const key = getDismissKey(ev);
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(key, "1");
    }
    setDismissedKeys((prev) => ({ ...prev, [key]: true }));
  };

  return (
    <div className="w-full flex flex-col z-30">
      {visibles.map((ev) => {
        const style = BANNER_STYLES[ev.tipo_evento] || BANNER_STYLES.INFORMATIVO;
        const Icon = style.icon;
        return (
          <div
            key={ev.id}
            role="status"
            className={cn(
              "w-full px-4 py-2.5 flex items-center justify-between gap-4 text-sm font-medium shadow-sm transition-all",
              style.wrapper
            )}
          >
            <span className="w-6 shrink-0 flex items-center justify-center" aria-hidden="true">
              <Icon className="w-4 h-4 shrink-0" />
            </span>
            <div className="text-center flex-1 leading-snug">
              {ev.titulo && (
                <span className="font-extrabold mr-1.5">{ev.titulo}:</span>
              )}
              {renderMensajeConNegritas(ev.mensaje)}
            </div>
            <button
              type="button"
              onClick={() => handleDismiss(ev)}
              className={cn(
                "w-6 h-6 rounded-md flex items-center justify-center shrink-0 transition-colors cursor-pointer",
                style.closeBtn
              )}
              aria-label="Cerrar aviso"
              title="Descartar aviso por esta sesión"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
