import React from "react";
import { getCartolasBancariasAction } from "@/actions/tesoreria.actions";
import { getServerUserSession } from "@/lib/auth/session";
import { CartolasBancariasClient } from "./_components/cartolas-bancarias-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function CartolasBancariasPage() {
  const [initialData, session] = await Promise.all([
    getCartolasBancariasAction(),
    getServerUserSession(),
  ]);

  const isAdmin =
    Boolean(session?.esAdmin) ||
    session?.perfil?.toUpperCase() === "ADMINISTRADOR";

  return <CartolasBancariasClient initialData={initialData} isAdmin={isAdmin} />;
}
