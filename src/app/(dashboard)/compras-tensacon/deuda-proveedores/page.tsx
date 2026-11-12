import React from "react";
import { LineChart } from "lucide-react";
import { getDeudaProveedoresMensualAction } from "@/actions/deuda-proveedores.actions";
import { DeudaProveedoresClient } from "./_components/deuda-proveedores-client";

export const dynamic = "force-dynamic";

export default async function DeudaProveedoresPage() {
  const data = await getDeudaProveedoresMensualAction();

  return (
    <div className="space-y-6">
      {/* Encabezado Corporativo Oficial Tensacon */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg bg-slate-900 flex items-center justify-center text-white shadow-sm">
              <LineChart className="h-5 w-5 text-[#E05A10]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-slate-900">
                  Deuda Prov.
                </h1>
                <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-red-100 text-red-700 uppercase tracking-wider">
                  Vencimientos Mensuales
                </span>
              </div>
              <p className="text-xs text-slate-500">
                COMPRAS TENSACON — Evolución consolidada y proyección mensual de la deuda total con proveedores según fecha de vencimiento
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Componente Cliente con KPIs, Gráfico de Líneas Rojas y Tabla */}
      <DeudaProveedoresClient initialData={data} />
    </div>
  );
}
