import React from "react";
import { getFacturasVentasAction } from "@/actions/facturas-ventas.actions";
import { getFactoringClientesAction } from "@/actions/mantenedores.actions";
import { getMantenedorOnAction } from "@/actions/mantenedor-on.actions";
import { getServerUserSession } from "@/lib/auth/session";
import { FacturasVentasTable } from "./_components/facturas-ventas-table";

export const dynamic = "force-dynamic";

export default async function FacturasVentasPage() {
  const [initialFacturas, factoringClientes, catalogoOn, session] = await Promise.all([
    getFacturasVentasAction({ page: 1, pageSize: 15 }),
    getFactoringClientesAction(),
    getMantenedorOnAction(),
    getServerUserSession(),
  ]);

  const isAdmin = session.esAdmin || session.perfil === "ADMINISTRADOR";

  return (
    <FacturasVentasTable
      initialResponse={initialFacturas}
      factoringClientes={factoringClientes}
      catalogoOn={catalogoOn}
      isAdmin={isAdmin}
    />
  );
}
