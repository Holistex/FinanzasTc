import React from "react";
import { ShoppingCart } from "lucide-react";
import { getFacturasComprasAction } from "@/actions/facturas-compras.actions";
import { getServerUserSession } from "@/lib/auth/session";
import { FacturasComprasTable } from "./_components/facturas-compras-table";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function FacturasComprasPage() {
  const [comprasData, userSession] = await Promise.all([
    getFacturasComprasAction(),
    getServerUserSession(),
  ]);

  const {
    data,
    kpis,
    factoringProveedores,
    empresasConfirming,
    colaboradores,
    catalogoOn,
    neteos,
    facNcCount,
  } = comprasData;

  return (
    <div className="space-y-6">
      {/* Encabezado del Módulo */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg bg-slate-900 flex items-center justify-center text-white shadow-sm">
              <ShoppingCart className="h-5 w-5 text-[#E05A10]" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900">
                Facturas de Compras (SII)
              </h1>
              <p className="text-xs text-slate-500">
                COMPRAS TENSACON — Registro de Compras y Ventas (RCV), gestión de modalidades de pago, neteos NC y control de vencimientos
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Componente de Tabla y KPIs */}
      <FacturasComprasTable
        initialData={data}
        initialKpis={kpis}
        factoringProveedores={factoringProveedores}
        empresasConfirming={empresasConfirming}
        colaboradores={colaboradores}
        catalogoOn={catalogoOn}
        initialNeteos={neteos}
        initialFacNcCount={facNcCount}
        userSession={userSession}
      />
    </div>
  );
}
