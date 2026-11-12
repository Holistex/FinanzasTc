"use server";

import { revalidatePath } from "next/cache";
import {
  createServerSupabaseClient,
  isServerSupabaseConfigured,
} from "@/lib/supabase/server";
import { readLocalDb, writeLocalDb } from "@/lib/supabase/local-fallback-db";
import {
  MantenedorMandante,
  MantenedorCompania,
} from "@/types/database.types";
import { normalizeRut } from "@/lib/utils";

// ============================================================================
// 1. MANTENEDOR: MANDANTES
// ============================================================================

export async function getMandantesAction(
  searchQuery?: string
): Promise<MantenedorMandante[]> {
  const q = searchQuery?.trim().toLowerCase();

  if (isServerSupabaseConfigured()) {
    try {
      const supabase = await createServerSupabaseClient();
      let query = supabase
        .from("mantenedor_mandantes")
        .select("*")
        .order("razon_social", { ascending: true });

      if (q) {
        query = query.or(
          `rut_mandante.ilike.%${q}%,razon_social.ilike.%${q}%,contacto_nombre.ilike.%${q}%`
        );
      }

      const { data, error } = await query;
      if (!error && data) {
        return data.map((m: any) => ({
          ...m,
          rut: m.rut_mandante,
        })) as MantenedorMandante[];
      }
    } catch {
      // Fallback a local DB si la tabla aún no existe en Supabase
    }
  }

  const db = readLocalDb();
  let list = [...(db.mantenedor_mandantes || [])];
  if (q) {
    list = list.filter(
      (m) =>
        (m.rut_mandante || m.rut || "").toLowerCase().includes(q) ||
        m.razon_social.toLowerCase().includes(q) ||
        (m.contacto_nombre || "").toLowerCase().includes(q) ||
        (m.contacto_email || "").toLowerCase().includes(q)
    );
  }
  return list
    .map((m) => ({
      ...m,
      rut: m.rut || m.rut_mandante,
      rut_mandante: m.rut_mandante || m.rut || "",
    }))
    .sort((a, b) => a.razon_social.localeCompare(b.razon_social));
}

export async function upsertMandanteAction(input: {
  id?: string;
  rut: string;
  razon_social: string;
  contacto_nombre?: string | null;
  contacto_email?: string | null;
  contacto_telefono?: string | null;
}): Promise<MantenedorMandante> {
  const cleanRut = normalizeRut(input.rut);
  if (!cleanRut || !input.razon_social.trim()) {
    throw new Error("El RUT y la Razón Social del Mandante son obligatorios.");
  }

  if (isServerSupabaseConfigured()) {
    try {
      const supabase = await createServerSupabaseClient();
      const payload = {
        ...(input.id ? { id: input.id } : {}),
        rut_mandante: cleanRut,
        razon_social: input.razon_social.trim(),
        contacto_nombre: input.contacto_nombre?.trim() || null,
        contacto_email: input.contacto_email?.trim() || null,
        contacto_telefono: input.contacto_telefono?.trim() || null,
      };

      const { data, error } = await supabase
        .from("mantenedor_mandantes")
        .upsert(payload)
        .select()
        .single();

      if (!error && data) {
        revalidatePath("/configuracion/mandantes-companias");
        revalidatePath("/gestion-garantias/boletas-garantias");
        revalidatePath("/gestion-garantias/polizas-garantias");
        return {
          ...(data as any),
          rut: data.rut_mandante,
        } as MantenedorMandante;
      }
    } catch {
      // Fallback a local DB
    }
  }

  const db = readLocalDb();
  if (!db.mantenedor_mandantes) db.mantenedor_mandantes = [];

  const existingIndex = input.id
    ? db.mantenedor_mandantes.findIndex((m) => m.id === input.id)
    : db.mantenedor_mandantes.findIndex((m) => (m.rut_mandante || m.rut) === cleanRut);

  const nowIso = new Date().toISOString();
  let savedRecord: MantenedorMandante;

  if (existingIndex >= 0) {
    savedRecord = {
      ...db.mantenedor_mandantes[existingIndex],
      rut_mandante: cleanRut,
      rut: cleanRut,
      razon_social: input.razon_social.trim(),
      contacto_nombre: input.contacto_nombre?.trim() || null,
      contacto_email: input.contacto_email?.trim() || null,
      contacto_telefono: input.contacto_telefono?.trim() || null,
    };
    db.mantenedor_mandantes[existingIndex] = savedRecord;
  } else {
    savedRecord = {
      id: input.id || `man-${Date.now()}`,
      rut_mandante: cleanRut,
      rut: cleanRut,
      razon_social: input.razon_social.trim(),
      contacto_nombre: input.contacto_nombre?.trim() || null,
      contacto_email: input.contacto_email?.trim() || null,
      contacto_telefono: input.contacto_telefono?.trim() || null,
      created_at: nowIso,
    };
    db.mantenedor_mandantes.push(savedRecord);
  }

  writeLocalDb(db);
  revalidatePath("/configuracion/mandantes-companias");
  revalidatePath("/gestion-garantias/boletas-garantias");
  revalidatePath("/gestion-garantias/polizas-garantias");
  return savedRecord;
}

export async function deleteMandanteAction(id: string): Promise<void> {
  if (!id) throw new Error("ID de Mandante no proporcionado.");

  if (isServerSupabaseConfigured()) {
    try {
      const supabase = await createServerSupabaseClient();
      const { error } = await supabase
        .from("mantenedor_mandantes")
        .delete()
        .eq("id", id);

      if (!error) {
        revalidatePath("/configuracion/mandantes-companias");
        revalidatePath("/gestion-garantias/boletas-garantias");
        revalidatePath("/gestion-garantias/polizas-garantias");
        return;
      }
    } catch {
      // Fallback a local DB
    }
  }

  const db = readLocalDb();
  if (db.mantenedor_mandantes) {
    db.mantenedor_mandantes = db.mantenedor_mandantes.filter((m) => m.id !== id);
    writeLocalDb(db);
  }

  revalidatePath("/configuracion/mandantes-companias");
  revalidatePath("/gestion-garantias/boletas-garantias");
  revalidatePath("/gestion-garantias/polizas-garantias");
}

// ============================================================================
// 2. MANTENEDOR: COMPAÑÍAS
// ============================================================================

export async function getCompaniasAction(
  searchQuery?: string
): Promise<MantenedorCompania[]> {
  const q = searchQuery?.trim().toLowerCase();

  if (isServerSupabaseConfigured()) {
    try {
      const supabase = await createServerSupabaseClient();
      let query = supabase
        .from("mantenedor_companias")
        .select("*")
        .order("razon_social", { ascending: true });

      if (q) {
        query = query.or(
          `rut_compania.ilike.%${q}%,razon_social.ilike.%${q}%,contacto_nombre.ilike.%${q}%`
        );
      }

      const { data, error } = await query;
      if (!error && data) {
        return data.map((c: any) => ({
          ...c,
          rut: c.rut_compania,
        })) as MantenedorCompania[];
      }
    } catch {
      // Fallback a local DB si la tabla aún no existe en Supabase
    }
  }

  const db = readLocalDb();
  let list = [...(db.mantenedor_companias || [])];
  if (q) {
    list = list.filter(
      (c) =>
        (c.rut_compania || c.rut || "").toLowerCase().includes(q) ||
        c.razon_social.toLowerCase().includes(q) ||
        (c.contacto_nombre || "").toLowerCase().includes(q) ||
        (c.contacto_email || "").toLowerCase().includes(q)
    );
  }
  return list
    .map((c) => ({
      ...c,
      rut: c.rut || c.rut_compania,
      rut_compania: c.rut_compania || c.rut || "",
    }))
    .sort((a, b) => a.razon_social.localeCompare(b.razon_social));
}

export async function upsertCompaniaAction(input: {
  id?: string;
  rut: string;
  razon_social: string;
  contacto_nombre?: string | null;
  contacto_email?: string | null;
  contacto_telefono?: string | null;
}): Promise<MantenedorCompania> {
  const cleanRut = normalizeRut(input.rut);
  if (!cleanRut || !input.razon_social.trim()) {
    throw new Error("El RUT y la Razón Social de la Compañía son obligatorios.");
  }

  if (isServerSupabaseConfigured()) {
    try {
      const supabase = await createServerSupabaseClient();
      const payload = {
        ...(input.id ? { id: input.id } : {}),
        rut_compania: cleanRut,
        razon_social: input.razon_social.trim(),
        contacto_nombre: input.contacto_nombre?.trim() || null,
        contacto_email: input.contacto_email?.trim() || null,
        contacto_telefono: input.contacto_telefono?.trim() || null,
      };

      const { data, error } = await supabase
        .from("mantenedor_companias")
        .upsert(payload)
        .select()
        .single();

      if (!error && data) {
        revalidatePath("/configuracion/mandantes-companias");
        revalidatePath("/gestion-garantias/boletas-garantias");
        revalidatePath("/gestion-garantias/polizas-garantias");
        return {
          ...(data as any),
          rut: data.rut_compania,
        } as MantenedorCompania;
      }
    } catch {
      // Fallback a local DB
    }
  }

  const db = readLocalDb();
  if (!db.mantenedor_companias) db.mantenedor_companias = [];

  const existingIndex = input.id
    ? db.mantenedor_companias.findIndex((c) => c.id === input.id)
    : db.mantenedor_companias.findIndex((c) => (c.rut_compania || c.rut) === cleanRut);

  const nowIso = new Date().toISOString();
  let savedRecord: MantenedorCompania;

  if (existingIndex >= 0) {
    savedRecord = {
      ...db.mantenedor_companias[existingIndex],
      rut_compania: cleanRut,
      rut: cleanRut,
      razon_social: input.razon_social.trim(),
      contacto_nombre: input.contacto_nombre?.trim() || null,
      contacto_email: input.contacto_email?.trim() || null,
      contacto_telefono: input.contacto_telefono?.trim() || null,
    };
    db.mantenedor_companias[existingIndex] = savedRecord;
  } else {
    savedRecord = {
      id: input.id || `cia-${Date.now()}`,
      rut_compania: cleanRut,
      rut: cleanRut,
      razon_social: input.razon_social.trim(),
      contacto_nombre: input.contacto_nombre?.trim() || null,
      contacto_email: input.contacto_email?.trim() || null,
      contacto_telefono: input.contacto_telefono?.trim() || null,
      created_at: nowIso,
    };
    db.mantenedor_companias.push(savedRecord);
  }

  writeLocalDb(db);
  revalidatePath("/configuracion/mandantes-companias");
  revalidatePath("/gestion-garantias/boletas-garantias");
  revalidatePath("/gestion-garantias/polizas-garantias");
  return savedRecord;
}

export async function deleteCompaniaAction(id: string): Promise<void> {
  if (!id) throw new Error("ID de Compañía no proporcionado.");

  if (isServerSupabaseConfigured()) {
    try {
      const supabase = await createServerSupabaseClient();
      const { error } = await supabase
        .from("mantenedor_companias")
        .delete()
        .eq("id", id);

      if (!error) {
        revalidatePath("/configuracion/mandantes-companias");
        revalidatePath("/gestion-garantias/boletas-garantias");
        revalidatePath("/gestion-garantias/polizas-garantias");
        return;
      }
    } catch {
      // Fallback a local DB
    }
  }

  const db = readLocalDb();
  if (db.mantenedor_companias) {
    db.mantenedor_companias = db.mantenedor_companias.filter((c) => c.id !== id);
    writeLocalDb(db);
  }

  revalidatePath("/configuracion/mandantes-companias");
  revalidatePath("/gestion-garantias/boletas-garantias");
  revalidatePath("/gestion-garantias/polizas-garantias");
}
