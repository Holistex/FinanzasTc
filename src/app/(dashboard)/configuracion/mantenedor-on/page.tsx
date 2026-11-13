import React from "react";
import { getMantenedorOnAction } from "@/actions/mantenedor-on.actions";
import { getServerUserSession } from "@/lib/auth/session";
import { getModuleAccess } from "@/lib/permissions";
import { MantenedorOnClient } from "./_components/mantenedor-on-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function MantenedorOnPage() {
  const [onList, session] = await Promise.all([
    getMantenedorOnAction(),
    getServerUserSession(),
  ]);

  const { canManage } = getModuleAccess(session, [
    "mantenedor_on",
    "configuracion_adm",
  ]);

  return <MantenedorOnClient initialData={onList} canManage={canManage} />;
}
