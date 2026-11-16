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
  MantenedorBanco,
} from "@/types/database.types";
import { MantenedoresTabsClient } from "./_components/mantenedores-tabs-client";
import { getServerUserSession } from "@/lib/auth/session";
import { getModuleAccess } from "@/lib/permissions";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const preferredRegion = "yul1";

export default async function MantenedoresPage() {
  let clientes: EmpresaFactoringCliente[] = [];
  let proveedores: EmpresaFactoringProveedor[] = [];
  let confirming: EmpresaConfirming[] = [];
  let bancos: MantenedorBanco[] = [];

  if (isServerSupabaseConfigured()) {
    const supabase = await createServerSupabaseClient();
    const [clientesRes, proveedoresRes, confirmingRes, bancosRes] =
      await Promise.all([
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
        supabase
          .from("mantenedor_bancos")
          .select("*")
          .order("nombre", { ascending: true }),
      ]);

    clientes = (clientesRes.data as EmpresaFactoringCliente[]) || [];
    proveedores = (proveedoresRes.data as EmpresaFactoringProveedor[]) || [];
    confirming = (confirmingRes.data as EmpresaConfirming[]) || [];
    bancos = (bancosRes.data as MantenedorBanco[]) || [];
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
    bancos = [...(db.mantenedor_bancos || [])].sort((a, b) =>
      a.nombre.localeCompare(b.nombre, "es")
    );
  }

  const session = await getServerUserSession();
  const { canManage } = getModuleAccess(session, [
    "mantenedor_factoring",
    "mantenedores",
  ]);

  return (
    <MantenedoresTabsClient
      initialClientes={clientes}
      initialProveedores={proveedores}
      initialConfirming={confirming}
      initialBancos={bancos}
      canManage={canManage}
    />
  );
}
