import React from "react";
import { getPerfilesAction } from "@/actions/configuracion.actions";
import { getServerUserSession } from "@/lib/auth/session";
import { getModuleAccess } from "@/lib/permissions";
import { PerfilesView } from "./_components/perfiles-view";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdmPerfilesPage() {
  const [perfiles, session] = await Promise.all([
    getPerfilesAction(),
    getServerUserSession(),
  ]);

  const { canManage } = getModuleAccess(session, [
    "adm_perfiles",
    "configuracion_adm",
  ]);

  return <PerfilesView initialPerfiles={perfiles} canManage={canManage} />;
}
