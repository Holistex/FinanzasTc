import React from "react";
import { getPerfilesAction } from "@/actions/configuracion.actions";
import { PerfilesView } from "./_components/perfiles-view";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdmPerfilesPage() {
  const perfiles = await getPerfilesAction();

  return <PerfilesView initialPerfiles={perfiles} />;
}
