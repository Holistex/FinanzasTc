import React from "react";
import { ShieldAlert } from "lucide-react";
import {
  getBoletasGarantiasAction,
  getPolizasGarantiasAction,
} from "@/actions/garantias.actions";
import { getServerUserSession } from "@/lib/auth/session";
import { getModuleAccess } from "@/lib/permissions";
import { ReportesGarantiasClient } from "./_components/reportes-garantias-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ReportesGarantiasPage() {
  const [session, boletasRes, polizasRes] = await Promise.all([
    getServerUserSession(),
    getBoletasGarantiasAction(),
    getPolizasGarantiasAction(),
  ]);

  const { canView } = getModuleAccess(session, [
    "garantias_reportes",
    "reportes_garantias",
    "gestion_garantias",
  ]);

  if (!canView) {
    return (
      <div className="max-w-xl mx-auto mt-12 rounded-2xl border border-rose-200 bg-rose-50/70 p-6 text-center shadow-sm">
        <ShieldAlert className="w-10 h-10 text-rose-600 mx-auto mb-3" />
        <h1 className="text-lg font-bold text-slate-900">Acceso Restringido</h1>
        <p className="text-sm text-slate-600 mt-1">
          No tienes permisos asignados para visualizar{" "}
          <strong>Reportes de Garantías</strong>.
        </p>
      </div>
    );
  }

  return (
    <ReportesGarantiasClient
      polizas={polizasRes.items}
      boletas={boletasRes.items}
    />
  );
}
