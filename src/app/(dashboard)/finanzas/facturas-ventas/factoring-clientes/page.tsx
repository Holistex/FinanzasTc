import React from "react";
import {
  createServerSupabaseClient,
  isServerSupabaseConfigured,
} from "@/lib/supabase/server";
import { readLocalDb } from "@/lib/supabase/local-fallback-db";
import { EmpresaFactoringCliente, FacturaVenta } from "@/types/database.types";
import { EXCLUDED_DTE_TYPES } from "@/services/sii-csv-parser";
import { FactoringClientesView } from "../_components/factoring-clientes-view";

export const dynamic = "force-dynamic";
export const preferredRegion = "yul1";

export default async function FactoringClientesSubmodulePage() {
  let facturasFactoring: FacturaVenta[] = [];
  let factoringClientes: EmpresaFactoringCliente[] = [];

  if (isServerSupabaseConfigured()) {
    const supabase = await createServerSupabaseClient();
    const [facturasRes, clientesRes] = await Promise.all([
      supabase
        .from("facturas_ventas")
        .select("*, empresa_factoring_cliente(*)")
        .eq("gestion_pago", "FACTORING")
        .neq("tipo_doc", 46)
        .neq("tipo_doc", 61)
        .order("fecha_docto", { ascending: false }),
      supabase
        .from("empresa_factoring_cliente")
        .select("*")
        .order("created_at", { ascending: false }),
    ]);

    facturasFactoring = (facturasRes.data as FacturaVenta[]) || [];
    factoringClientes = (clientesRes.data as EmpresaFactoringCliente[]) || [];
  } else {
    const db = readLocalDb();
    const clientesMap = new Map(
      db.empresa_factoring_cliente.map((c) => [c.id, c])
    );
    facturasFactoring = db.facturas_ventas
      .filter(
        (f) =>
          !EXCLUDED_DTE_TYPES.has(Number(f.tipo_doc)) &&
          Number(f.tipo_doc) !== 61 &&
          f.gestion_pago === "FACTORING"
      )
      .map((f) => ({
        ...f,
        empresa_factoring_cliente: f.factoring_cliente_id
          ? clientesMap.get(f.factoring_cliente_id) || null
          : null,
      }))
      .sort((a, b) => b.fecha_docto.localeCompare(a.fecha_docto));

    factoringClientes = [...db.empresa_factoring_cliente].sort((a, b) =>
      b.created_at.localeCompare(a.created_at)
    );
  }

  return (
    <FactoringClientesView
      initialFacturasFactoring={facturasFactoring}
      factoringClientes={factoringClientes}
    />
  );
}
