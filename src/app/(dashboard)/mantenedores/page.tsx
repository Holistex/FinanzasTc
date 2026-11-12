import React from "react";
import {
  createServerSupabaseClient,
  isServerSupabaseConfigured,
} from "@/lib/supabase/server";
import { readLocalDb } from "@/lib/supabase/local-fallback-db";
import {
  EmpresaConfirming,
  EmpresaFactoringCliente,
  EmpresaFactoringProveedor,
} from "@/types/database.types";
import { MantenedoresTabsClient } from "./_components/mantenedores-tabs-client";

export const dynamic = "force-dynamic";
export const preferredRegion = "yul1";

export default async function MantenedoresPage() {
  let clientes: EmpresaFactoringCliente[] = [];
  let proveedores: EmpresaFactoringProveedor[] = [];
  let confirming: EmpresaConfirming[] = [];

  if (isServerSupabaseConfigured()) {
    const supabase = await createServerSupabaseClient();
    const [clientesRes, proveedoresRes, confirmingRes] = await Promise.all([
      supabase
        .from("empresa_factoring_cliente")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase
        .from("empresa_factoring_proveedores")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase
        .from("empresa_confirming")
        .select("*")
        .order("created_at", { ascending: false }),
    ]);

    clientes = (clientesRes.data as EmpresaFactoringCliente[]) || [];
    proveedores = (proveedoresRes.data as EmpresaFactoringProveedor[]) || [];
    confirming = (confirmingRes.data as EmpresaConfirming[]) || [];
  } else {
    const db = readLocalDb();
    clientes = [...db.empresa_factoring_cliente].sort((a, b) =>
      b.created_at.localeCompare(a.created_at)
    );
    proveedores = [...db.empresa_factoring_proveedores].sort((a, b) =>
      b.created_at.localeCompare(a.created_at)
    );
    confirming = [...db.empresa_confirming].sort((a, b) =>
      b.created_at.localeCompare(a.created_at)
    );
  }

  return (
    <MantenedoresTabsClient
      initialClientes={clientes}
      initialProveedores={proveedores}
      initialConfirming={confirming}
    />
  );
}
