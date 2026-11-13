"use server";

import { revalidatePath } from "next/cache";
import {
  createServerSupabaseClient,
  isServerSupabaseConfigured,
} from "@/lib/supabase/server";
import { readLocalDb, writeLocalDb } from "@/lib/supabase/local-fallback-db";
import { MantenedorON } from "@/types/database.types";
import { assertCanManage } from "@/lib/auth/session";

export interface UpsertMantenedorOnInput {
  id?: string;
  codigo_on: string;
  nombre_proyecto: string;
  descripcion?: string | null;
  cliente_mandante?: string | null;
  activo?: boolean;
}

export async function getMantenedorOnAction(
  searchQuery?: string,
  filtroEstado?: "Todos" | "Activos" | "Inactivos"
): Promise<MantenedorON[]> {
  const q = searchQuery?.trim().toLowerCase();

  const localDb = readLocalDb();
  const localList = [...(localDb.mantenedor_on || [])];

  let supaList: MantenedorON[] = [];
  let supaFetchedOk = false;

  if (isServerSupabaseConfigured()) {
    try {
      const supabase = await createServerSupabaseClient();
      let query = supabase
        .from("mantenedor_on")
        .select("*")
        .order("codigo_on", { ascending: true });

      // Solo aplicar filtro estricto si no es "Todos" ni vacío
      if (filtroEstado === "Activos") {
        query = query.eq("activo", true);
      } else if (filtroEstado === "Inactivos") {
        query = query.eq("activo", false);
      }

      if (q) {
        query = query.or(
          `codigo_on.ilike.%${q}%,nombre_proyecto.ilike.%${q}%,cliente_mandante.ilike.%${q}%,descripcion.ilike.%${q}%`
        );
      }

      const { data, error } = await query;
      if (!error && data) {
        supaList = data as MantenedorON[];
        supaFetchedOk = true;
      } else if (error) {
        console.warn(`[getMantenedorOnAction Supabase error]: ${error.message}`);
      }
    } catch (err: any) {
      console.warn(`[getMantenedorOnAction Supabase exception]: ${err?.message}`);
    }
  }

  // Si Supabase respondió correctamente, usarlo como fuente de verdad para evitar
  // que registros eliminados reaparezcan desde local-fallback-db.json
  const mapByCode = new Map<string, MantenedorON>();

  if (!supaFetchedOk) {
    for (const item of localList) {
      if (item.codigo_on) {
        mapByCode.set(item.codigo_on, {
          ...item,
          activo: item.activo !== false,
        });
      }
    }
  } else {
    for (const item of supaList) {
      if (item.codigo_on) {
        mapByCode.set(item.codigo_on, {
          ...item,
          activo: item.activo !== false,
        });
      }
    }
  }

  let result = Array.from(mapByCode.values());

  // Filtrado en memoria
  if (filtroEstado === "Activos") {
    result = result.filter((item) => item.activo !== false);
  } else if (filtroEstado === "Inactivos") {
    result = result.filter((item) => item.activo === false);
  }

  if (q) {
    result = result.filter(
      (item) =>
        item.codigo_on.toLowerCase().includes(q) ||
        item.nombre_proyecto.toLowerCase().includes(q) ||
        (item.cliente_mandante || "").toLowerCase().includes(q) ||
        (item.descripcion || "").toLowerCase().includes(q)
    );
  }

  return result.sort((a, b) => a.codigo_on.localeCompare(b.codigo_on));
}

export interface MantenedorOnActionResult {
  success: boolean;
  data?: MantenedorON;
  error?: string;
}

export async function upsertMantenedorOnAction(
  input: UpsertMantenedorOnInput
): Promise<MantenedorOnActionResult> {
  const auth = await assertCanManage(["mantenedor_on", "configuracion_adm"]);
  if (!auth.authorized) {
    return { success: false, error: auth.error };
  }

  try {
    const cleanCode = input.codigo_on.trim();
    if (!/^[0-9]{3}$/.test(cleanCode)) {
      return {
        success: false,
        error: "El Código ON debe contener exactamente 3 dígitos numéricos (ej. 701, 740).",
      };
    }

    const cleanNombre = input.nombre_proyecto.trim();
    if (!cleanNombre) {
      return {
        success: false,
        error: "El Nombre del Proyecto / Obra es obligatorio.",
      };
    }

    const now = new Date().toISOString();
    const db = readLocalDb();
    if (!db.mantenedor_on) {
      db.mantenedor_on = [];
    }

    // Buscar si ya existe por código o id para realizar Upsert automático
    const existingLocalIdx = db.mantenedor_on.findIndex(
      (item) => item.codigo_on === cleanCode || (Boolean(input.id) && item.id === input.id)
    );

    let targetId = input.id;
    if (!targetId && existingLocalIdx !== -1) {
      targetId = db.mantenedor_on[existingLocalIdx].id;
    }

    // 1. Persistir siempre en almacenamiento local
    let record: MantenedorON;
    if (existingLocalIdx !== -1) {
      record = {
        ...db.mantenedor_on[existingLocalIdx],
        id: targetId || db.mantenedor_on[existingLocalIdx].id,
        codigo_on: cleanCode,
        nombre_proyecto: cleanNombre,
        descripcion: input.descripcion?.trim() || null,
        cliente_mandante: input.cliente_mandante?.trim() || null,
        activo: input.activo !== undefined ? input.activo : true,
        updated_at: now,
      };
      db.mantenedor_on[existingLocalIdx] = record;
    } else {
      record = {
        id: targetId || `on-${cleanCode}-${Date.now().toString(36)}`,
        codigo_on: cleanCode,
        nombre_proyecto: cleanNombre,
        descripcion: input.descripcion?.trim() || null,
        cliente_mandante: input.cliente_mandante?.trim() || null,
        activo: input.activo !== undefined ? input.activo : true,
        created_at: now,
        updated_at: now,
      };
      db.mantenedor_on.push(record);
    }
    writeLocalDb(db);

    // 2. Persistir en Supabase mediante Update por id (si existe en Supabase) o Upsert por codigo_on
    if (isServerSupabaseConfigured()) {
      const supabase = await createServerSupabaseClient();
      const supaId = targetId && !targetId.startsWith("on-") ? targetId : undefined;
      const payload = {
        codigo_on: cleanCode,
        nombre_proyecto: cleanNombre,
        descripcion: input.descripcion?.trim() || null,
        cliente_mandante: input.cliente_mandante?.trim() || null,
        activo: input.activo !== undefined ? input.activo : true,
        updated_at: now,
      };

      const { data, error } = supaId
        ? await supabase
            .from("mantenedor_on")
            .update(payload)
            .eq("id", supaId)
            .select()
            .single()
        : await supabase
            .from("mantenedor_on")
            .upsert(payload, { onConflict: "codigo_on" })
            .select()
            .single();

      if (error) {
        return { success: false, error: error.message };
      }

      if (data) {
        record = {
          ...data,
          activo: data.activo !== false,
        } as MantenedorON;
      }
    }

    // 3. Revalidar todas las rutas afectadas inmediatamente
    revalidatePath("/configuracion/mantenedor-on");
    revalidatePath("/finanzas/facturas-ventas");
    revalidatePath("/ventas-tensacon/facturas-ventas");
    revalidatePath("/ventas-tensacon/gestion-cobranza");
    revalidatePath("/gestion-garantias/boletas-garantias");
    revalidatePath("/gestion-garantias/polizas-garantias");

    return { success: true, data: record };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Error inesperado al guardar ON.",
    };
  }
}

export async function toggleMantenedorOnStatusAction(
  id: string,
  activo: boolean
): Promise<{ success: boolean; error?: string }> {
  const auth = await assertCanManage(["mantenedor_on", "configuracion_adm"]);
  if (!auth.authorized) {
    return { success: false, error: auth.error };
  }

  try {
    const now = new Date().toISOString();
    const db = readLocalDb();
    let itemToToggle: MantenedorON | undefined;

    if (db.mantenedor_on) {
      const item = db.mantenedor_on.find((o) => o.id === id);
      if (item) {
        item.activo = activo;
        item.updated_at = now;
        itemToToggle = item;
        writeLocalDb(db);
      }
    }

    if (isServerSupabaseConfigured()) {
      const supabase = await createServerSupabaseClient();
      let query = supabase
        .from("mantenedor_on")
        .update({ activo, updated_at: now });

      if (itemToToggle) {
        query = query.or(`id.eq.${id},codigo_on.eq.${itemToToggle.codigo_on}`);
      } else {
        query = query.eq("id", id);
      }
      const { error } = await query;
      if (error) {
        return { success: false, error: error.message };
      }
    }

    revalidatePath("/configuracion/mantenedor-on");
    revalidatePath("/finanzas/facturas-ventas");
    revalidatePath("/ventas-tensacon/facturas-ventas");
    return { success: true };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Error inesperado al actualizar estado.",
    };
  }
}

export async function deleteMantenedorOnAction(
  idOrCodigo: string,
  codigoOn?: string
): Promise<{ success: boolean; error?: string }> {
  const auth = await assertCanManage(["mantenedor_on", "configuracion_adm"]);
  if (!auth.authorized) {
    return { success: false, error: auth.error };
  }

  try {
    const valorLimpio = String(idOrCodigo).trim();
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        valorLimpio
      );

    const db = readLocalDb();
    let itemToDelete: MantenedorON | undefined;

    if (db.mantenedor_on) {
      itemToDelete = db.mantenedor_on.find(
        (o) =>
          o.id === valorLimpio ||
          (codigoOn ? o.codigo_on === String(codigoOn).trim() : false)
      );
      db.mantenedor_on = db.mantenedor_on.filter(
        (o) =>
          o.id !== valorLimpio &&
          (!codigoOn || o.codigo_on !== String(codigoOn).trim())
      );
      writeLocalDb(db);
    }

    if (isServerSupabaseConfigured()) {
      const supabase = await createServerSupabaseClient();

      // Resolver codigo_on limpio
      let codigoLimpio = codigoOn
        ? String(codigoOn).trim()
        : itemToDelete?.codigo_on ||
          (isUuid ? "" : valorLimpio.replace(/^on-/i, "").split("-")[0]);

      if (!codigoLimpio && isUuid) {
        const { data: rowOn } = await supabase
          .from("mantenedor_on")
          .select("codigo_on")
          .eq("id", valorLimpio)
          .maybeSingle();
        if (rowOn?.codigo_on) {
          codigoLimpio = String(rowOn.codigo_on).trim();
        }
      }

      // 1. Liberar referencias en facturas_ventas si existieran
      if (codigoLimpio) {
        await supabase
          .from("facturas_ventas")
          .update({ on_proyecto: null })
          .eq("on_proyecto", codigoLimpio);
      }

      // 2. Eliminar de mantenedor_on buscando coincidencia exacta por id o codigo_on
      let deleteQuery = supabase.from("mantenedor_on").delete();
      if (isUuid && codigoLimpio) {
        deleteQuery = deleteQuery.or(
          `id.eq.${valorLimpio},codigo_on.eq.${codigoLimpio}`
        );
      } else if (isUuid) {
        deleteQuery = deleteQuery.eq("id", valorLimpio);
      } else if (codigoLimpio) {
        deleteQuery = deleteQuery.eq("codigo_on", codigoLimpio);
      } else {
        deleteQuery = deleteQuery.eq("id", valorLimpio);
      }

      const { error } = await deleteQuery;

      if (error) {
        console.error("[MantenedorON] Error eliminando:", error.message);
        return { success: false, error: error.message };
      }
    }

    revalidatePath("/configuracion/mantenedor-on");
    revalidatePath("/finanzas/facturas-ventas");
    revalidatePath("/ventas-tensacon/facturas-ventas");
    return { success: true };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Error inesperado al eliminar ON.",
    };
  }
}
