import React from "react";
import { History } from "lucide-react";
import { getHistoricoPagosComprasAction } from "@/actions/compras-historico-compromisos.actions";
import { HistoricoPagosTable } from "./_components/historico-pagos-table";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function HistoricoPagosPage() {
  const { data, kpis } = await getHistoricoPagosComprasAction();

  return (
    <div className="space-y-6">
      {/* Encabezado del Módulo */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg bg-slate-900 flex items-center justify-center text-white shadow-sm">
              <History className="h-5 w-5 text-[#E05A10]" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900">
                Histórico de Pagos a Proveedores
              </h1>
              <p className="text-xs text-slate-500">
                COMPRAS TENSACON — Consolidado histórico de todas las facturas y obligaciones financieras saldadas con proveedores
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Componente de Tabla y KPIs */}
      <HistoricoPagosTable initialData={data} initialKpis={kpis} />
    </div>
  );
}
