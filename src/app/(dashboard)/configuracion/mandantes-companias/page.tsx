import React from "react";
import {
  getMandantesAction,
  getCompaniasAction,
} from "@/actions/garantias-mantenedores.actions";
import { getServerUserSession } from "@/lib/auth/session";
import { getModuleAccess } from "@/lib/permissions";
import { MandantesCompaniasClient } from "./_components/mandantes-companias-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function MandantesCompaniasPage() {
  const [mandantes, companias, session] = await Promise.all([
    getMandantesAction(),
    getCompaniasAction(),
    getServerUserSession(),
  ]);

  const { canManage } = getModuleAccess(session, [
    "mantenedor_mandantes_companias",
    "mantenedores",
  ]);

  return (
    <MandantesCompaniasClient
      initialMandantes={mandantes}
      initialCompanias={companias}
      canManage={canManage}
    />
  );
}
