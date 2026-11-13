"use server";

import { revalidatePath } from "next/cache";
import {
  createServerSupabaseClient,
  isServerSupabaseConfigured,
} from "@/lib/supabase/server";
import { readLocalDb, writeLocalDb } from "@/lib/supabase/local-fallback-db";
import {
  EmpresaConfirming,
  EmpresaFactoringCliente,
  EmpresaFactoringProveedor,
} from "@/types/database.types";
import { normalizeRut } from "@/lib/utils";
import { assertCanManage } from "@/lib/auth/session";

// ============================================================================
// 1. MANTENEDOR: EMPRESA FACTORING CLIENTE
// ============================================================================

export async function getFactoringClientesAction(
  searchQuery?: string
): Promise<EmpresaFactoringCliente[]> {
  const q = searchQuery?.trim().toLowerCase();

  if (isServerSupabaseConfigured()) {
    const supabase = await createServerSupabaseClient();
    let query = supabase
      .from("empresa_factoring_cliente")
      .select("*")
      .order("created_at", { ascending: false });

    if (q) {
      query = query.or(
        `rut_cliente.ilike.%${q}%,razon_social.ilike.%${q}%,contacto_nombre.ilike.%${q}%`
      );
    }

    const { data, error } = await query;
    if (error) {
      throw new Error(
        `Error obteniendo empresa_factoring_cliente: ${error.message}`
      );
    }
    return (data as EmpresaFactoringCliente[]) || [];
  }

  const db = readLocalDb();
  let list = [...db.empresa_factoring_cliente];
  if (q) {
    list = list.filter(
      (item) =>
        item.rut_cliente.toLowerCase().includes(q) ||
        item.razon_social.toLowerCase().includes(q) ||
        (item.contacto_nombre || "").toLowerCase().includes(q) ||
        (item.contacto_email || "").toLowerCase().includes(q)
    );
  }
  return list.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function upsertFactoringClienteAction(input: {
  id?: string;
  rut_cliente: string;
  razon_social: string;
  contacto_nombre?: string | null;
  contacto_email?: string | null;
}): Promise<EmpresaFactoringCliente> {
  const auth = await assertCanManage(["mantenedor_factoring", "mantenedores"]);
  if (!auth.authorized) throw new Error(auth.error || "Acceso denegado.");

  const cleanRut = normalizeRut(input.rut_cliente);
  if (!cleanRut || !input.razon_social.trim()) {
    throw new Error("El RUT Cliente y la Razón Social son obligatorios.");
  }

  if (isServerSupabaseConfigured()) {
    const supabase = await createServerSupabaseClient();
    const payload = {
      ...(input.id ? { id: input.id } : {}),
      rut_cliente: cleanRut,
      razon_social: input.razon_social.trim(),
      contacto_nombre: input.contacto_nombre?.trim() || null,
      contacto_email: input.contacto_email?.trim() || null,
    };

    const { data, error } = await supabase
      .from("empresa_factoring_cliente")
      .upsert(payload)
      .select()
      .single();

    if (error) {
      throw new Error(
        `Error guardando empresa_factoring_cliente: ${error.message}`
      );
    }

    revalidatePath("/mantenedores");
    revalidatePath("/finanzas/facturas-ventas");
    return data as EmpresaFactoringCliente;
  }

  const db = readLocalDb();
  if (input.id) {
    const idx = db.empresa_factoring_cliente.findIndex(
      (c) => c.id === input.id
    );
    if (idx !== -1) {
      db.empresa_factoring_cliente[idx] = {
        ...db.empresa_factoring_cliente[idx],
        rut_cliente: cleanRut,
        razon_social: input.razon_social.trim(),
        contacto_nombre: input.contacto_nombre?.trim() || null,
        contacto_email: input.contacto_email?.trim() || null,
      };
      writeLocalDb(db);
      revalidatePath("/mantenedores");
      revalidatePath("/finanzas/facturas-ventas");
      return db.empresa_factoring_cliente[idx];
    }
  }

  const created: EmpresaFactoringCliente = {
    id: `efc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    rut_cliente: cleanRut,
    razon_social: input.razon_social.trim(),
    contacto_nombre: input.contacto_nombre?.trim() || null,
    contacto_email: input.contacto_email?.trim() || null,
    created_at: new Date().toISOString(),
  };

  db.empresa_factoring_cliente.unshift(created);
  writeLocalDb(db);
  revalidatePath("/mantenedores");
  revalidatePath("/finanzas/facturas-ventas");
  return created;
}

export async function deleteFactoringClienteAction(
  id: string
): Promise<{ success: boolean }> {
  const auth = await assertCanManage(["mantenedor_factoring", "mantenedores"]);
  if (!auth.authorized) throw new Error(auth.error || "Acceso denegado.");

  if (isServerSupabaseConfigured()) {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase
      .from("empresa_factoring_cliente")
      .delete()
      .eq("id", id);

    if (error) {
      throw new Error(`Error eliminando registro: ${error.message}`);
    }
    revalidatePath("/mantenedores");
    revalidatePath("/finanzas/facturas-ventas");
    return { success: true };
  }

  const db = readLocalDb();
  db.empresa_factoring_cliente = db.empresa_factoring_cliente.filter(
    (c) => c.id !== id
  );
  db.facturas_ventas = db.facturas_ventas.map((f) =>
    f.factoring_cliente_id === id
      ? { ...f, factoring_cliente_id: null, gestion_pago: "DIRECTO_CLIENTE" }
      : f
  );
  writeLocalDb(db);
  revalidatePath("/mantenedores");
  revalidatePath("/finanzas/facturas-ventas");
  return { success: true };
}

// ============================================================================
// 2. MANTENEDOR: EMPRESA FACTORING PROVEEDORES
// ============================================================================

export async function getFactoringProveedoresAction(
  searchQuery?: string
): Promise<EmpresaFactoringProveedor[]> {
  const q = searchQuery?.trim().toLowerCase();

  if (isServerSupabaseConfigured()) {
    const supabase = await createServerSupabaseClient();
    let query = supabase
      .from("empresa_factoring_proveedores")
      .select("*")
      .order("razon_social", { ascending: true });

    if (q) {
      query = query.or(`rut_proveedor.ilike.%${q}%,razon_social.ilike.%${q}%`);
    }

    const { data, error } = await query;
    if (error) {
      throw new Error(
        `Error obteniendo empresa_factoring_proveedores: ${error.message}`
      );
    }
    return (data as EmpresaFactoringProveedor[]) || [];
  }

  const db = readLocalDb();
  let list = [...db.empresa_factoring_proveedores];
  if (q) {
    list = list.filter(
      (item) =>
        item.rut_proveedor.toLowerCase().includes(q) ||
        item.razon_social.toLowerCase().includes(q)
    );
  }
  return list.sort((a, b) => a.razon_social.localeCompare(b.razon_social));
}

export async function upsertFactoringProveedorAction(input: {
  id?: string;
  rut_proveedor: string;
  razon_social: string;
}): Promise<EmpresaFactoringProveedor> {
  const auth = await assertCanManage(["mantenedor_factoring", "mantenedores"]);
  if (!auth.authorized) throw new Error(auth.error || "Acceso denegado.");

  const cleanRut = normalizeRut(input.rut_proveedor);
  if (!cleanRut || !input.razon_social.trim()) {
    throw new Error("El RUT Proveedor y la Razón Social son obligatorios.");
  }

  if (isServerSupabaseConfigured()) {
    const supabase = await createServerSupabaseClient();
    const payload = {
      ...(input.id ? { id: input.id } : {}),
      rut_proveedor: cleanRut,
      razon_social: input.razon_social.trim(),
    };

    const { data, error } = await supabase
      .from("empresa_factoring_proveedores")
      .upsert(payload)
      .select()
      .single();

    if (error) {
      throw new Error(
        `Error guardando empresa_factoring_proveedores: ${error.message}`
      );
    }

    revalidatePath("/mantenedores");
    return data as EmpresaFactoringProveedor;
  }

  const db = readLocalDb();
  if (input.id) {
    const idx = db.empresa_factoring_proveedores.findIndex(
      (p) => p.id === input.id
    );
    if (idx !== -1) {
      db.empresa_factoring_proveedores[idx] = {
        ...db.empresa_factoring_proveedores[idx],
        rut_proveedor: cleanRut,
        razon_social: input.razon_social.trim(),
      };
      writeLocalDb(db);
      revalidatePath("/mantenedores");
      return db.empresa_factoring_proveedores[idx];
    }
  }

  const created: EmpresaFactoringProveedor = {
    id: `efp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    rut_proveedor: cleanRut,
    razon_social: input.razon_social.trim(),
    created_at: new Date().toISOString(),
  };

  db.empresa_factoring_proveedores.unshift(created);
  writeLocalDb(db);
  revalidatePath("/mantenedores");
  return created;
}

export async function deleteFactoringProveedorAction(
  id: string
): Promise<{ success: boolean }> {
  const auth = await assertCanManage(["mantenedor_factoring", "mantenedores"]);
  if (!auth.authorized) throw new Error(auth.error || "Acceso denegado.");

  if (isServerSupabaseConfigured()) {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase
      .from("empresa_factoring_proveedores")
      .delete()
      .eq("id", id);

    if (error) {
      throw new Error(`Error eliminando proveedor factoring: ${error.message}`);
    }
    revalidatePath("/mantenedores");
    return { success: true };
  }

  const db = readLocalDb();
  if (!db.empresa_factoring_proveedores) db.empresa_factoring_proveedores = [];
  db.empresa_factoring_proveedores = db.empresa_factoring_proveedores.filter(
    (p: EmpresaFactoringProveedor) => p.id !== id
  );
  writeLocalDb(db);
  revalidatePath("/mantenedores");
  return { success: true };
}

// ============================================================================
// 3. MANTENEDOR: EMPRESA CONFIRMING
// ============================================================================

export async function getEmpresasConfirmingAction(
  searchQuery?: string
): Promise<EmpresaConfirming[]> {
  const q = searchQuery?.trim().toLowerCase();

  if (isServerSupabaseConfigured()) {
    const supabase = await createServerSupabaseClient();
    let query = supabase
      .from("empresa_confirming")
      .select("*")
      .order("created_at", { ascending: false });

    if (q) {
      query = query.or(
        `rut_confirming.ilike.%${q}%,razon_social.ilike.%${q}%,contacto_nombre.ilike.%${q}%`
      );
    }

    const { data, error } = await query;
    if (!error && data) {
      return data as EmpresaConfirming[];
    }
  }

  const db = readLocalDb();
  let list = [...(db.empresa_confirming || [])];
  if (q) {
    list = list.filter(
      (item) =>
        item.rut_confirming.toLowerCase().includes(q) ||
        item.razon_social.toLowerCase().includes(q) ||
        (item.contacto_nombre || "").toLowerCase().includes(q) ||
        (item.contacto_email || "").toLowerCase().includes(q)
    );
  }
  return list.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function upsertEmpresaConfirmingAction(input: {
  id?: string;
  rut_confirming: string;
  razon_social: string;
  contacto_nombre?: string | null;
  contacto_email?: string | null;
}): Promise<EmpresaConfirming> {
  const auth = await assertCanManage(["mantenedor_factoring", "mantenedores"]);
  if (!auth.authorized) throw new Error(auth.error || "Acceso denegado.");

  const cleanRut = normalizeRut(input.rut_confirming);
  if (!cleanRut || !input.razon_social.trim()) {
    throw new Error("El RUT Confirming y la Razón Social son obligatorios.");
  }

  if (isServerSupabaseConfigured()) {
    const supabase = await createServerSupabaseClient();
    const payload = {
      ...(input.id ? { id: input.id } : {}),
      rut_confirming: cleanRut,
      razon_social: input.razon_social.trim(),
      contacto_nombre: input.contacto_nombre?.trim() || null,
      contacto_email: input.contacto_email?.trim() || null,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("empresa_confirming")
      .upsert(payload)
      .select()
      .single();

    if (error) {
      throw new Error(`Error guardando empresa_confirming: ${error.message}`);
    }

    if (data) {
      revalidatePath("/mantenedores");
      revalidatePath("/compras-tensacon/facturas-compras");
      return data as EmpresaConfirming;
    }
  }

  const db = readLocalDb();
  if (!db.empresa_confirming) db.empresa_confirming = [];

  if (input.id) {
    const idx = db.empresa_confirming.findIndex((c) => c.id === input.id);
    if (idx !== -1) {
      db.empresa_confirming[idx] = {
        ...db.empresa_confirming[idx],
        rut_confirming: cleanRut,
        razon_social: input.razon_social.trim(),
        contacto_nombre: input.contacto_nombre?.trim() || null,
        contacto_email: input.contacto_email?.trim() || null,
        updated_at: new Date().toISOString(),
      };
      writeLocalDb(db);
      revalidatePath("/mantenedores");
      revalidatePath("/compras-tensacon/facturas-compras");
      return db.empresa_confirming[idx];
    }
  }

  const created: EmpresaConfirming = {
    id: `ec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    rut_confirming: cleanRut,
    razon_social: input.razon_social.trim(),
    contacto_nombre: input.contacto_nombre?.trim() || null,
    contacto_email: input.contacto_email?.trim() || null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  db.empresa_confirming.unshift(created);
  writeLocalDb(db);
  revalidatePath("/mantenedores");
  revalidatePath("/compras-tensacon/facturas-compras");
  return created;
}

export async function deleteEmpresaConfirmingAction(
  id: string
): Promise<{ success: boolean }> {
  const auth = await assertCanManage(["mantenedor_factoring", "mantenedores"]);
  if (!auth.authorized) throw new Error(auth.error || "Acceso denegado.");

  if (isServerSupabaseConfigured()) {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase
      .from("empresa_confirming")
      .delete()
      .eq("id", id);

    if (error) {
      throw new Error(`Error eliminando empresa confirming: ${error.message}`);
    }

    revalidatePath("/mantenedores");
    revalidatePath("/compras-tensacon/facturas-compras");
    return { success: true };
  }

  const db = readLocalDb();
  if (!db.empresa_confirming) db.empresa_confirming = [];
  db.empresa_confirming = db.empresa_confirming.filter((c) => c.id !== id);
  writeLocalDb(db);
  revalidatePath("/mantenedores");
  revalidatePath("/compras-tensacon/facturas-compras");
  return { success: true };
}

