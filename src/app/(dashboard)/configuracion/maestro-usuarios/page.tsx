import React from "react";
import { getPerfilesAction, getUsuariosAction } from "@/actions/configuracion.actions";
import { UsuariosView } from "./_components/usuarios-view";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function MaestroUsuariosPage() {
  const [usuarios, perfiles] = await Promise.all([
    getUsuariosAction(),
    getPerfilesAction(),
  ]);

  return <UsuariosView initialUsuarios={usuarios} perfiles={perfiles} />;
}
