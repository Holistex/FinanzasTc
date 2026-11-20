import React from "react";
import { redirect } from "next/navigation";
import {
  createServerSupabaseClient,
  isServerSupabaseConfigured,
} from "@/lib/supabase/server";
import { readLocalDb } from "@/lib/supabase/local-fallback-db";
import {
  enrichFacturasVentasList,
  mergeFacturasVentasWithLocalFallback,
} from "@/lib/data/facturas-ventas.server";
import {
  FacturaVenta,
  MantenedorON,
  PagoFactura,
} from "@/types/database.types";
import { EXCLUDED_DTE_TYPES } from "@/services/sii-csv-parser";
import { getServerUserSession } from "@/lib/auth/session";
import { getModuleAccess } from "@/lib/permissions";
import { ReportesVentasClient } from "./_components/reportes-ventas-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function loadReportesVentasData(): Promise<{
  facturas: FacturaVenta[];
  catalogoOn: MantenedorON[];
}> {
  const localDb = readLocalDb();

  if (isServerSupabaseConfigured()) {
    const supabase = await createServerSupabaseClient();
    const [facturasRes, pagosRes, onRes] = await Promise.all([
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

    const enriched = enrichFacturasVentasList(rawFacturas, pagosMap);

    const supaOn =
      !onRes.error && onRes.data ? (onRes.data as MantenedorON[]) : [];
    const onMerged = new Map<string, MantenedorON>();
    for (const item of localDb.mantenedor_on || []) {
      onMerged.set(item.codigo_on.toUpperCase(), item);
    }
    for (const item of supaOn) {
      onMerged.set(item.codigo_on.toUpperCase(), item);
    }

    return {
      facturas: enriched,
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
    facturas: enrichFacturasVentasList(rawFacturas, pagosMap),
    catalogoOn: [...(localDb.mantenedor_on || [])].sort((a, b) =>
      a.codigo_on.localeCompare(b.codigo_on)
    ),
  };
}

export default async function ReportesVentasPage() {
  const session = await getServerUserSession();
  const access = getModuleAccess(session, [
    "reportes_ventas",
    "ventas_global",
    "facturas_ventas",
    "gestion_cobranza",
  ]);

  if (!access.canView) {
    redirect("/bienvenida");
  }

  const { facturas, catalogoOn } = await loadReportesVentasData();

  return <ReportesVentasClient facturas={facturas} catalogoOn={catalogoOn} />;
}
