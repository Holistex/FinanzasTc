import React from "react";
import { getCartolasBancariasAction } from "@/actions/tesoreria.actions";
import { getModuleAccess } from "@/lib/permissions";
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
  const { canManage } = getModuleAccess(session, ["tesoreria_saldos"]);

  return (
    <CartolasBancariasClient
      initialData={initialData}
      isAdmin={isAdmin}
      canManage={canManage}
    />
  );
}
