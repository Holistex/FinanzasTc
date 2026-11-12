import React from "react";
import { getFacturasFactoringClientesAction } from "@/actions/facturas-ventas.actions";
import { getFactoringClientesAction } from "@/actions/mantenedores.actions";
import { FactoringClientesView } from "../_components/factoring-clientes-view";

export const dynamic = "force-dynamic";

export default async function FactoringClientesSubmodulePage() {
  const [facturasFactoring, factoringClientes] = await Promise.all([
    getFacturasFactoringClientesAction(),
    getFactoringClientesAction(),
  ]);

  return (
    <FactoringClientesView
      initialFacturasFactoring={facturasFactoring}
      factoringClientes={factoringClientes}
    />
  );
}
