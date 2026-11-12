import React from "react";
import { getCartolasBancariasAction } from "@/actions/tesoreria.actions";
import { PagosTesoreriaClient } from "./_components/pagos-tesoreria-client";

export const dynamic = "force-dynamic";

export default async function PagosTesoreriaPage() {
  const initialData = await getCartolasBancariasAction();

  return <PagosTesoreriaClient initialData={initialData} />;
}
