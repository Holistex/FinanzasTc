import React from "react";
import { redirect } from "next/navigation";
import { getServerUserSession } from "@/lib/auth/session";
import { getModuleAccess } from "@/lib/permissions";
import { getMatchFlexlineDataAction } from "@/actions/match-flexline.actions";
import { MatchFlexlineClient } from "./_components/match-flexline-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function MatchFlexlinePage() {
  const session = await getServerUserSession();
  const access = getModuleAccess(session, ["match_flexline", "compras_global"]);

  if (!access.canView) {
    redirect("/bienvenida");
  }

  const esAdministrador =
    Boolean(session?.esAdmin) ||
    String(session?.perfil || "").trim().toUpperCase() === "ADMINISTRADOR";

  const initialData = await getMatchFlexlineDataAction();

  return (
    <MatchFlexlineClient
      initialData={initialData}
      esAdministrador={esAdministrador}
    />
  );
}
