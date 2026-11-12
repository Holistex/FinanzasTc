import React from "react";
import {
  getMandantesAction,
  getCompaniasAction,
} from "@/actions/garantias-mantenedores.actions";
import { MandantesCompaniasClient } from "./_components/mandantes-companias-client";

export const dynamic = "force-dynamic";

export default async function MandantesCompaniasPage() {
  const [mandantes, companias] = await Promise.all([
    getMandantesAction(),
    getCompaniasAction(),
  ]);

  return (
    <MandantesCompaniasClient
      initialMandantes={mandantes}
      initialCompanias={companias}
    />
  );
}
