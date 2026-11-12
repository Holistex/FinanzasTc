"use server";

import { revalidatePath } from "next/cache";
import {
  createServerSupabaseClient,
  isServerSupabaseConfigured,
} from "@/lib/supabase/server";
import { readLocalDb, writeLocalDb } from "@/lib/supabase/local-fallback-db";
import { MantenedorON } from "@/types/database.types";

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
      } else if (error) {
        console.warn(`[getMantenedorOnAction Supabase error]: ${error.message}`);
      }
    } catch (err: any) {
      console.warn(`[getMantenedorOnAction Supabase exception]: ${err?.message}`);
    }
  }

  // Combinación inteligente de registros (Local + Supabase)
  // Garantiza que los registros no se pierdan por discrepancias de caché o políticas RLS en Supabase
  const mapByCode = new Map<string, MantenedorON>();

  // 1. Agregar registros locales
  for (const item of localList) {
    if (item.codigo_on) {
      mapByCode.set(item.codigo_on, {
        ...item,
        // Si el valor es null o undefined, considerarlo activo por defecto
        activo: item.activo !== false,
      });
    }
  }

  // 2. Agregar o sobreescribir con registros de Supabase si existen
  for (const item of supaList) {
    if (item.codigo_on) {
      mapByCode.set(item.codigo_on, {
        ...item,
        activo: item.activo !== false,
      });
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

export async function upsertMantenedorOnAction(
  input: UpsertMantenedorOnInput
): Promise<MantenedorON> {
  const cleanCode = input.codigo_on.trim();
  if (!/^[0-9]{3}$/.test(cleanCode)) {
    throw new Error("El Código ON debe contener exactamente 3 dígitos numéricos (ej. 701, 740).");
  }

  const cleanNombre = input.nombre_proyecto.trim();
  if (!cleanNombre) {
    throw new Error("El Nombre del Proyecto / Obra es obligatorio.");
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

  // 2. Persistir en Supabase mediante Upsert por codigo_on
  if (isServerSupabaseConfigured()) {
    try {
      const supabase = await createServerSupabaseClient();
      const { data, error } = await supabase
        .from("mantenedor_on")
        .upsert(
          {
            codigo_on: cleanCode,
            nombre_proyecto: cleanNombre,
            descripcion: input.descripcion?.trim() || null,
            cliente_mandante: input.cliente_mandante?.trim() || null,
            activo: input.activo !== undefined ? input.activo : true,
            updated_at: now,
          },
          { onConflict: "codigo_on" }
        )
        .select()
        .single();

      if (!error && data) {
        record = {
          ...data,
          activo: data.activo !== false,
        } as MantenedorON;
      }
    } catch (err: any) {
      console.warn(`[Supabase upsert mantenedor_on warning]: ${err?.message}`);
    }
  }

  // 3. Revalidar todas las rutas afectadas inmediatamente
  revalidatePath("/configuracion/mantenedor-on");
  revalidatePath("/finanzas/facturas-ventas");
  revalidatePath("/ventas-tensacon/facturas-ventas");
  revalidatePath("/ventas-tensacon/gestion-cobranza");
  revalidatePath("/gestion-garantias/boletas-garantias");
  revalidatePath("/gestion-garantias/polizas-garantias");

  return record;
}

export async function toggleMantenedorOnStatusAction(
  id: string,
  activo: boolean
): Promise<boolean> {
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
    try {
      const supabase = await createServerSupabaseClient();
      let query = supabase
        .from("mantenedor_on")
        .update({ activo, updated_at: now });

      if (itemToToggle) {
        query = query.or(`id.eq.${id},codigo_on.eq.${itemToToggle.codigo_on}`);
      } else {
        query = query.eq("id", id);
      }
      await query;
    } catch {
      // ignore
    }
  }

  revalidatePath("/configuracion/mantenedor-on");
  revalidatePath("/finanzas/facturas-ventas");
  revalidatePath("/ventas-tensacon/facturas-ventas");
  return true;
}

export async function deleteMantenedorOnAction(id: string): Promise<boolean> {
  const db = readLocalDb();
  let itemToDelete: MantenedorON | undefined;

  if (db.mantenedor_on) {
    itemToDelete = db.mantenedor_on.find((o) => o.id === id);
    db.mantenedor_on = db.mantenedor_on.filter((o) => o.id !== id);
    writeLocalDb(db);
  }

  if (isServerSupabaseConfigured()) {
    try {
      const supabase = await createServerSupabaseClient();
      let query = supabase.from("mantenedor_on").delete();
      if (itemToDelete) {
        query = query.or(`id.eq.${id},codigo_on.eq.${itemToDelete.codigo_on}`);
      } else {
        query = query.eq("id", id);
      }
      await query;
    } catch {
      // ignore
    }
  }

  revalidatePath("/configuracion/mantenedor-on");
  revalidatePath("/finanzas/facturas-ventas");
  revalidatePath("/ventas-tensacon/facturas-ventas");
  return true;
}
