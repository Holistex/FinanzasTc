import React from "react";
import {
  getCartolasBancariasAction,
  getTiposPagoAction,
} from "@/actions/tesoreria.actions";
import {
  createServerSupabaseClient,
  isServerSupabaseConfigured,
} from "@/lib/supabase/server";
import { CartolaLinea } from "@/types/database.types";
import { PagosTesoreriaClient } from "./_components/pagos-tesoreria-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function PagosTesoreriaPage() {
  const baseData = await getCartolasBancariasAction();

  // Lectura directa sin JOIN por FK en Supabase y cruce en memoria
  if (isServerSupabaseConfigured()) {
    try {
      const [supabase, tiposPago] = await Promise.all([
        createServerSupabaseClient(),
        getTiposPagoAction(),
      ]);

      const { data: supaLineas, error } = await supabase
        .from("cartolas_lineas")
        .select("*")
        .gt("giro", 0)
        .not("tipo_pago_id", "is", null)
        .order("fecha", { ascending: false });

      if (!error && supaLineas) {
        const tiposById = new Map(
          tiposPago.map((t) => [String(t.id), t])
        );
        const tiposByNombre = new Map(
          tiposPago.map((t) => [t.nombre.trim().toUpperCase(), t])
        );

        const mappedLineas: CartolaLinea[] = (
          supaLineas as Array<Record<string, unknown>>
        ).map((l) => {
          const tipoIdStr = l.tipo_pago_id ? String(l.tipo_pago_id) : null;
          const tipoMatch = tipoIdStr
            ? tiposById.get(tipoIdStr) ||
              tiposByNombre.get(tipoIdStr.trim().toUpperCase()) ||
              null
            : null;

          return {
            id: String(l.id),
            cartola_id: String(l.cartola_id || ""),
            banco: l.banco ? String(l.banco) : undefined,
            numero_cuenta: l.numero_cuenta ? String(l.numero_cuenta) : undefined,
            numero_cartola: l.numero_cartola ? String(l.numero_cartola) : undefined,
            movimiento_key: l.movimiento_key ? String(l.movimiento_key) : null,
            fecha: String(l.fecha || "").slice(0, 10),
            numero_operacion: l.numero_operacion
              ? String(l.numero_operacion)
              : null,
            descripcion: String(l.descripcion || ""),
            giro: Number(l.giro || 0),
            abono: Number(l.abono || 0),
            saldo:
              l.saldo !== null && l.saldo !== undefined
                ? Number(l.saldo)
                : null,
            tipo_pago_id: tipoIdStr,
            tipo_pago: tipoMatch,
            created_at: String(l.created_at || ""),
          };
        });

        return (
          <PagosTesoreriaClient
            initialData={{
              ...baseData,
              lineas: mappedLineas,
              tiposPago,
            }}
          />
        );
      }
    } catch {
      // Continuar con baseData
    }
  }

  return <PagosTesoreriaClient initialData={baseData} />;
}
