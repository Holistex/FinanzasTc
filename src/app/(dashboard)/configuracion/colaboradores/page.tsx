import React from "react";
import { getColaboradoresAction } from "@/actions/colaboradores.actions";
import { getTiposPagoAction } from "@/actions/tesoreria.actions";
import { getServerUserSession } from "@/lib/auth/session";
import { MantenedorColaboradoresClient } from "./_components/mantenedor-colaboradores-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function MantenedorColaboradoresPage() {
  const [colaboradores, tiposPago, session] = await Promise.all([
    getColaboradoresAction(),
    getTiposPagoAction(),
    getServerUserSession(),
  ]);

  const isAdmin =
    Boolean(session?.esAdmin) ||
    session?.perfil?.toUpperCase() === "ADMINISTRADOR";

  return (
    <MantenedorColaboradoresClient
      initialData={colaboradores}
      initialTiposPago={tiposPago}
      isAdmin={isAdmin}
    />
  );
}
