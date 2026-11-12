import React from "react";
import { CalendarClock } from "lucide-react";
import { getCompromisosComprasAction } from "@/actions/compras-historico-compromisos.actions";
import { CompromisosTable } from "./_components/compromisos-table";

export const dynamic = "force-dynamic";

export default async function CompromisosPage() {
  const { data, semanasDisponibles, kpis } = await getCompromisosComprasAction();

  return (
    <div className="space-y-6">
      {/* Encabezado del Módulo */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg bg-slate-900 flex items-center justify-center text-white shadow-sm">
              <CalendarClock className="h-5 w-5 text-[#E05A10]" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900">
                Compromisos Semanales de Pago
              </h1>
              <p className="text-xs text-slate-500">
                COMPRAS TENSACON — Consolidado de obligaciones financieras pendientes por vencer (Cheques, Factoring y Confirming) con filtro semanal y exportación PDF
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Componente de Tabla, Filtro Semanal y Exportador */}
      <CompromisosTable
        initialData={data}
        semanasDisponibles={semanasDisponibles}
        initialKpis={kpis}
      />
    </div>
  );
}
