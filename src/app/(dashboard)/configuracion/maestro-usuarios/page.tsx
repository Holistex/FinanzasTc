import React from "react";
import { getPerfilesAction, getUsuariosAction } from "@/actions/configuracion.actions";
import { getServerUserSession } from "@/lib/auth/session";
import { getModuleAccess } from "@/lib/permissions";
import { UsuariosView } from "./_components/usuarios-view";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function MaestroUsuariosPage() {
  const [usuarios, perfiles, session] = await Promise.all([
    getUsuariosAction(),
    getPerfilesAction(),
    getServerUserSession(),
  ]);

  const { canManage } = getModuleAccess(session, [
    "maestro_usuarios",
    "configuracion_adm",
  ]);

  return (
    <UsuariosView
      initialUsuarios={usuarios}
      perfiles={perfiles}
      canManage={canManage}
    />
  );
}
