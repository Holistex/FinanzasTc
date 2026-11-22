import React from "react";
import { getDeudaProveedoresMensualAction } from "@/actions/deuda-proveedores.actions";
import { DeudaProveedoresClient } from "./_components/deuda-proveedores-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DeudaProveedoresPage() {
  const data = await getDeudaProveedoresMensualAction();

  return <DeudaProveedoresClient initialData={data} />;
}
