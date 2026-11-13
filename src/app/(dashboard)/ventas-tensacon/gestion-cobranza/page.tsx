import React from "react";
import { Metadata } from "next";
import { getCarteraCobranzaAction } from "@/actions/gestion-cobranza.actions";
import { getServerUserSession } from "@/lib/auth/session";
import { GestionCobranzaView } from "./_components/gestion-cobranza-view";

export const metadata: Metadata = {
  title: "Gestión de Cobranza | Ventas Tensacon",
  description: "Seguimiento de cobros, cartera pendiente y compromisos de pago",
};

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const preferredRegion = "yul1";

export default async function GestionCobranzaPage() {
  const [data, session] = await Promise.all([
    getCarteraCobranzaAction(),
    getServerUserSession(),
  ]);

  const rawSession = session as unknown as Record<string, unknown>;
  const currentUserName = String(
    rawSession?.nombre_completo ||
      session?.nombre ||
      rawSession?.name ||
      rawSession?.username ||
      session?.usuario ||
      rawSession?.email ||
      "Usuario Sistema"
  ).trim();

  return (
    <div className="w-full px-4 sm:px-6 py-4 space-y-4">
      <GestionCobranzaView
        initialData={data}
        currentUserName={currentUserName}
      />
    </div>
  );
}
