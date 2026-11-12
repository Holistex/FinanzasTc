import React from "react";
import {
  getFactoringClientesAction,
  getFactoringProveedoresAction,
  getEmpresasConfirmingAction,
} from "@/actions/mantenedores.actions";
import { MantenedoresTabsClient } from "../../mantenedores/_components/mantenedores-tabs-client";

export const dynamic = "force-dynamic";

export default async function MantenedoresFactoringConfigPage() {
  const [clientes, proveedores, confirming] = await Promise.all([
    getFactoringClientesAction(),
    getFactoringProveedoresAction(),
    getEmpresasConfirmingAction(),
  ]);

  return (
    <MantenedoresTabsClient
      initialClientes={clientes}
      initialProveedores={proveedores}
      initialConfirming={confirming}
    />
  );
}
