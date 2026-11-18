import React from "react";
import { ShieldAlert } from "lucide-react";
import { getEventosPlataformaAction } from "@/actions/eventos.actions";
import { getPerfilesAction } from "@/actions/configuracion.actions";
import { getServerUserSession } from "@/lib/auth/session";
import { EventosClient } from "./_components/eventos-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function EventosConfiguracionPage() {
  const session = await getServerUserSession();
  const esAdmin =
    Boolean(session?.esAdmin) ||
    String(session?.perfil || "").trim().toUpperCase() === "ADMINISTRADOR";

  if (!session || !esAdmin) {
    return (
      <div className="max-w-xl mx-auto mt-12 rounded-2xl border border-rose-200 bg-rose-50/70 p-6 text-center shadow-sm">
        <ShieldAlert className="w-10 h-10 text-rose-600 mx-auto mb-3" />
        <h1 className="text-lg font-bold text-slate-900">Acceso Restringido</h1>
        <p className="text-sm text-slate-600 mt-1">
          El módulo de Eventos y Avisos Globales es de acceso exclusivo para el perfil{" "}
          <strong>ADMINISTRADOR</strong>.
        </p>
      </div>
    );
  }

  const [eventos, perfiles] = await Promise.all([
    getEventosPlataformaAction(),
    getPerfilesAction(),
  ]);

  return <EventosClient initialEventos={eventos} perfiles={perfiles} />;
}
