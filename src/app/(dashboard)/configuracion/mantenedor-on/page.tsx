import React from "react";
import { getMantenedorOnAction } from "@/actions/mantenedor-on.actions";
import { MantenedorOnClient } from "./_components/mantenedor-on-client";

export const dynamic = "force-dynamic";

export default async function MantenedorOnPage() {
  const onList = await getMantenedorOnAction();

  return <MantenedorOnClient initialData={onList} />;
}
