import React from "react";
import {
  createServerSupabaseClient,
  isServerSupabaseConfigured,
} from "@/lib/supabase/server";
import { readLocalDb } from "@/lib/supabase/local-fallback-db";
import {
  buildFacturasVentasResponse,
  mergeFacturasVentasWithLocalFallback,
} from "@/lib/data/facturas-ventas.server";
import {
  EmpresaFactoringCliente,
  FacturaVenta,
  MantenedorON,
  PagoFactura,
  PaginatedFacturasResponse,
} from "@/types/database.types";
import { EXCLUDED_DTE_TYPES } from "@/services/sii-csv-parser";
import { getServerUserSession } from "@/lib/auth/session";
import { FacturasVentasTable } from "./_components/facturas-ventas-table";

export const dynamic = "force-dynamic";
export const preferredRegion = "yul1";

async function loadInitialFacturasVentasPageData(): Promise<{
  initialFacturas: PaginatedFacturasResponse;
  factoringClientes: EmpresaFactoringCliente[];
  catalogoOn: MantenedorON[];
}> {
  const localDb = readLocalDb();

  if (isServerSupabaseConfigured()) {
    const supabase = await createServerSupabaseClient();
    const [facturasRes, pagosRes, clientesRes, onRes] = await Promise.all([
      supabase
        .from("facturas_ventas")
        .select("*, empresa_factoring_cliente(*)")
        .neq("tipo_doc", 46)
        .order("fecha_docto", { ascending: false })
        .order("folio", { ascending: false }),
      supabase
        .from("pagos_facturas")
        .select("*")
        .order("fecha_pago", { ascending: false }),
      supabase
        .from("empresa_factoring_cliente")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase
        .from("mantenedor_on")
        .select("*")
        .order("codigo_on", { ascending: true }),
    ]);

    if (facturasRes.error) {
      throw new Error(
        `Error consultando facturas_ventas: ${facturasRes.error.message}`
      );
    }

    const { rawFacturas, pagosMap } = mergeFacturasVentasWithLocalFallback(
      (facturasRes.data as FacturaVenta[]) || [],
      !pagosRes.error && pagosRes.data
        ? (pagosRes.data as Array<Record<string, unknown>>)
        : null
    );

    const initialFacturas = buildFacturasVentasResponse(rawFacturas, pagosMap, {
      page: 1,
      pageSize: 15,
    });

    const factoringClientes = !clientesRes.error && clientesRes.data
      ? (clientesRes.data as EmpresaFactoringCliente[])
      : [...localDb.empresa_factoring_cliente];

    const supaOn = !onRes.error && onRes.data ? (onRes.data as MantenedorON[]) : [];
    const onMerged = new Map<string, MantenedorON>();
    for (const item of localDb.mantenedor_on || []) {
      onMerged.set(item.codigo_on.toUpperCase(), item);
    }
    for (const item of supaOn) {
      onMerged.set(item.codigo_on.toUpperCase(), item);
    }

    return {
      initialFacturas,
      factoringClientes,
      catalogoOn: Array.from(onMerged.values()).sort((a, b) =>
        a.codigo_on.localeCompare(b.codigo_on)
      ),
    };
  }

  const clientesMap = new Map(
    localDb.empresa_factoring_cliente.map((c) => [c.id, c])
  );
  const pagosMap = new Map<string, PagoFactura[]>();
  for (const p of localDb.pagos_facturas) {
    if (p.factura_id && Number(p.monto_pago) > 0) {
      const list = pagosMap.get(p.factura_id) || [];
      list.push(p);
      pagosMap.set(p.factura_id, list);
    }
  }

  const rawFacturas = localDb.facturas_ventas
    .filter((f) => !EXCLUDED_DTE_TYPES.has(Number(f.tipo_doc)))
    .map((f) => ({
      ...f,
      empresa_factoring_cliente: f.factoring_cliente_id
        ? clientesMap.get(f.factoring_cliente_id) || null
        : null,
    }));

  return {
    initialFacturas: buildFacturasVentasResponse(rawFacturas, pagosMap, {
      page: 1,
      pageSize: 15,
    }),
    factoringClientes: [...localDb.empresa_factoring_cliente].sort((a, b) =>
      b.created_at.localeCompare(a.created_at)
    ),
    catalogoOn: [...(localDb.mantenedor_on || [])].sort((a, b) =>
      a.codigo_on.localeCompare(b.codigo_on)
    ),
  };
}

export default async function FacturasVentasPage() {
  const [{ initialFacturas, factoringClientes, catalogoOn }, session] =
    await Promise.all([
      loadInitialFacturasVentasPageData(),
      getServerUserSession(),
    ]);

  const isAdmin = session.esAdmin || session.perfil === "ADMINISTRADOR";

  return (
    <FacturasVentasTable
      initialResponse={initialFacturas}
      factoringClientes={factoringClientes}
      catalogoOn={catalogoOn}
      isAdmin={isAdmin}
    />
  );
}
