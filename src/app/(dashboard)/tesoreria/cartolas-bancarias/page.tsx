import React from "react";
import { getCartolasBancariasAction } from "@/actions/tesoreria.actions";
import { CartolasBancariasClient } from "./_components/cartolas-bancarias-client";

export const dynamic = "force-dynamic";

export default async function CartolasBancariasPage() {
  const initialData = await getCartolasBancariasAction();

  return <CartolasBancariasClient initialData={initialData} />;
}
