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
  MantenedorBanco,
} from "@/types/database.types";
import { normalizeRut } from "@/lib/utils";
import { assertIsAdmin } from "@/lib/auth/session";

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
}): Promise<{ success: boolean; data?: EmpresaFactoringCliente; error?: string }> {
  try {
    const auth = await assertIsAdmin();
    if (!auth.authorized) {
      return { success: false, error: auth.error || "Acceso denegado." };
    }

    const cleanRut = normalizeRut(input.rut_cliente);
    if (!cleanRut || !input.razon_social.trim()) {
      return {
        success: false,
        error: "El RUT Cliente y la Razón Social son obligatorios.",
      };
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
        return {
          success: false,
          error: `Error guardando empresa_factoring_cliente: ${error.message}`,
        };
      }

      revalidatePath("/configuracion/mantenedores-factoring");
      revalidatePath("/mantenedores");
      revalidatePath("/finanzas/facturas-ventas");
      return { success: true, data: data as EmpresaFactoringCliente };
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
        revalidatePath("/configuracion/mantenedores-factoring");
        revalidatePath("/mantenedores");
        revalidatePath("/finanzas/facturas-ventas");
        return { success: true, data: db.empresa_factoring_cliente[idx] };
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
    revalidatePath("/configuracion/mantenedores-factoring");
    revalidatePath("/mantenedores");
    revalidatePath("/finanzas/facturas-ventas");
    return { success: true, data: created };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Error inesperado al guardar factoring cliente.",
    };
  }
}

export async function deleteFactoringClienteAction(
  id: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const auth = await assertIsAdmin();
    if (!auth.authorized) {
      return { success: false, error: auth.error || "Acceso denegado." };
    }

    if (isServerSupabaseConfigured()) {
      const supabase = await createServerSupabaseClient();
      const { error } = await supabase
        .from("empresa_factoring_cliente")
        .delete()
        .eq("id", id);

      if (error) {
        return { success: false, error: `Error eliminando registro: ${error.message}` };
      }
      revalidatePath("/configuracion/mantenedores-factoring");
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
    revalidatePath("/configuracion/mantenedores-factoring");
    revalidatePath("/mantenedores");
    revalidatePath("/finanzas/facturas-ventas");
    return { success: true };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Error inesperado al eliminar registro.",
    };
  }
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
}): Promise<{ success: boolean; data?: EmpresaFactoringProveedor; error?: string }> {
  try {
    const auth = await assertIsAdmin();
    if (!auth.authorized) {
      return { success: false, error: auth.error || "Acceso denegado." };
    }

    const cleanRut = normalizeRut(input.rut_proveedor);
    if (!cleanRut || !input.razon_social.trim()) {
      return {
        success: false,
        error: "El RUT Proveedor y la Razón Social son obligatorios.",
      };
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
        return {
          success: false,
          error: `Error guardando empresa_factoring_proveedores: ${error.message}`,
        };
      }

      revalidatePath("/configuracion/mantenedores-factoring");
      revalidatePath("/mantenedores");
      revalidatePath("/compras-tensacon/facturas-compras");
      return { success: true, data: data as EmpresaFactoringProveedor };
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
        revalidatePath("/configuracion/mantenedores-factoring");
        revalidatePath("/mantenedores");
        revalidatePath("/compras-tensacon/facturas-compras");
        return { success: true, data: db.empresa_factoring_proveedores[idx] };
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
    revalidatePath("/configuracion/mantenedores-factoring");
    revalidatePath("/mantenedores");
    revalidatePath("/compras-tensacon/facturas-compras");
    return { success: true, data: created };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Error inesperado al guardar proveedor factoring.",
    };
  }
}

export async function deleteFactoringProveedorAction(
  id: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const auth = await assertIsAdmin();
    if (!auth.authorized) {
      return { success: false, error: auth.error || "Acceso denegado." };
    }

    if (isServerSupabaseConfigured()) {
      const supabase = await createServerSupabaseClient();
      const { error } = await supabase
        .from("empresa_factoring_proveedores")
        .delete()
        .eq("id", id);

      if (error) {
        return { success: false, error: `Error eliminando proveedor factoring: ${error.message}` };
      }
      revalidatePath("/configuracion/mantenedores-factoring");
      revalidatePath("/mantenedores");
      revalidatePath("/compras-tensacon/facturas-compras");
      return { success: true };
    }

    const db = readLocalDb();
    if (!db.empresa_factoring_proveedores) db.empresa_factoring_proveedores = [];
    db.empresa_factoring_proveedores = db.empresa_factoring_proveedores.filter(
      (p: EmpresaFactoringProveedor) => p.id !== id
    );
    writeLocalDb(db);
    revalidatePath("/configuracion/mantenedores-factoring");
    revalidatePath("/mantenedores");
    revalidatePath("/compras-tensacon/facturas-compras");
    return { success: true };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Error inesperado al eliminar proveedor factoring.",
    };
  }
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
        `rut_entidad.ilike.%${q}%,rut_confirming.ilike.%${q}%,razon_social.ilike.%${q}%,contacto_nombre.ilike.%${q}%`
      );
    }

    const { data, error } = await query;
    if (!error && data) {
      return (data as Array<Record<string, unknown>>).map((row) => ({
        ...(row as unknown as EmpresaConfirming),
        rut_confirming: String(
          row.rut_entidad || row.rut_confirming || row.rut || ""
        ),
      }));
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
}): Promise<{ success: boolean; data?: EmpresaConfirming; error?: string }> {
  try {
    const auth = await assertIsAdmin();
    if (!auth.authorized) {
      return { success: false, error: auth.error || "Acceso denegado." };
    }

    const cleanRut = normalizeRut(input.rut_confirming);
    if (!cleanRut || !input.razon_social.trim()) {
      return {
        success: false,
        error: "El RUT Confirming y la Razón Social son obligatorios.",
      };
    }

    const nowIso = new Date().toISOString();

    if (isServerSupabaseConfigured()) {
      const supabase = await createServerSupabaseClient();
      const payload = {
        ...(input.id ? { id: input.id } : {}),
        rut_entidad: cleanRut,
        rut_confirming: cleanRut,
        razon_social: input.razon_social.trim(),
        contacto_nombre: input.contacto_nombre?.trim() || null,
        contacto_email: input.contacto_email?.trim() || null,
        activo: true,
        updated_at: nowIso,
      };

      const { data, error } = await supabase
        .from("empresa_confirming")
        .upsert(payload)
        .select()
        .single();

      if (error) {
        return {
          success: false,
          error: `Error guardando empresa_confirming: ${error.message}`,
        };
      }

      revalidatePath("/configuracion/mantenedores-factoring");
      revalidatePath("/mantenedores");
      revalidatePath("/compras-tensacon/facturas-compras");
      const savedRow = data as Record<string, unknown>;
      return {
        success: true,
        data: {
          ...(savedRow as unknown as EmpresaConfirming),
          rut_confirming: String(
            savedRow.rut_entidad || savedRow.rut_confirming || cleanRut
          ),
        },
      };
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
          updated_at: nowIso,
        };
        writeLocalDb(db);
        revalidatePath("/configuracion/mantenedores-factoring");
        revalidatePath("/mantenedores");
        revalidatePath("/compras-tensacon/facturas-compras");
        return { success: true, data: db.empresa_confirming[idx] };
      }
    }

    const created: EmpresaConfirming = {
      id: `ec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      rut_confirming: cleanRut,
      razon_social: input.razon_social.trim(),
      contacto_nombre: input.contacto_nombre?.trim() || null,
      contacto_email: input.contacto_email?.trim() || null,
      created_at: nowIso,
      updated_at: nowIso,
    };

    db.empresa_confirming.unshift(created);
    writeLocalDb(db);
    revalidatePath("/configuracion/mantenedores-factoring");
    revalidatePath("/mantenedores");
    revalidatePath("/compras-tensacon/facturas-compras");
    return { success: true, data: created };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Error inesperado al guardar empresa confirming.",
    };
  }
}

export async function deleteEmpresaConfirmingAction(
  id: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const auth = await assertIsAdmin();
    if (!auth.authorized) {
      return { success: false, error: auth.error || "Acceso denegado." };
    }

    if (isServerSupabaseConfigured()) {
      const supabase = await createServerSupabaseClient();
      const { error } = await supabase
        .from("empresa_confirming")
        .delete()
        .eq("id", id);

      if (error) {
        return {
          success: false,
          error: `Error eliminando empresa confirming: ${error.message}`,
        };
      }

      revalidatePath("/configuracion/mantenedores-factoring");
      revalidatePath("/mantenedores");
      revalidatePath("/compras-tensacon/facturas-compras");
      return { success: true };
    }

    const db = readLocalDb();
    if (!db.empresa_confirming) db.empresa_confirming = [];
    db.empresa_confirming = db.empresa_confirming.filter((c) => c.id !== id);
    writeLocalDb(db);
    revalidatePath("/configuracion/mantenedores-factoring");
    revalidatePath("/mantenedores");
    revalidatePath("/compras-tensacon/facturas-compras");
    return { success: true };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Error inesperado al eliminar empresa confirming.",
    };
  }
}

// ============================================================================
// 4. MANTENEDOR: BANCOS (mantenedor_bancos)
// ============================================================================

export async function getBancosAction(
  searchQuery?: string,
  onlyActive = false
): Promise<MantenedorBanco[]> {
  const q = searchQuery?.trim().toLowerCase();

  if (isServerSupabaseConfigured()) {
    try {
      const supabase = await createServerSupabaseClient();
      let query = supabase
        .from("mantenedor_bancos")
        .select("id, codigo_sbif, nombre, rut, activo, created_at")
        .order("nombre", { ascending: true });

      if (onlyActive) {
        query = query.eq("activo", true);
      }
      if (q) {
        query = query.or(
          `nombre.ilike.%${q}%,codigo_sbif.ilike.%${q}%,rut.ilike.%${q}%`
        );
      }

      const { data, error } = await query;
      if (!error && data) {
        const list = data as MantenedorBanco[];
        if (list.length > 0 || !onlyActive) {
          return list;
        }
      }
    } catch {
      // Fallback a lista local
    }
  }

  const db = readLocalDb();
  let list = [...(db.mantenedor_bancos || [])];
  if (onlyActive) {
    list = list.filter((b) => b.activo !== false);
  }
  if (q) {
    list = list.filter(
      (b) =>
        b.nombre.toLowerCase().includes(q) ||
        (b.codigo_sbif || "").toLowerCase().includes(q) ||
        (b.rut || "").toLowerCase().includes(q)
    );
  }
  return list.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

export async function upsertBancoAction(input: {
  id?: string;
  nombre: string;
  codigo_sbif?: string | null;
  rut?: string | null;
  activo?: boolean;
}): Promise<{ success: boolean; data?: MantenedorBanco; error?: string }> {
  try {
    const auth = await assertIsAdmin();
    if (!auth.authorized) {
      return { success: false, error: auth.error || "Acceso denegado." };
    }

    const nombreClean = input.nombre.trim().toUpperCase();
    if (!nombreClean) {
      return { success: false, error: "El nombre del banco es obligatorio." };
    }
    const cleanRut = input.rut?.trim() ? normalizeRut(input.rut) : null;
    const cleanSbif = input.codigo_sbif?.trim() || null;
    const activoVal = Boolean(input.activo !== false);

    const revalidateBancoPaths = () => {
      revalidatePath("/configuracion/mantenedores-factoring");
      revalidatePath("/mantenedores");
      revalidatePath("/gestion-garantias/boletas-garantias");
      revalidatePath("/gestion-garantias/polizas-garantias");
      revalidatePath("/tesoreria/pagos");
      revalidatePath("/compras-tensacon/facturas-compras");
    };

    if (isServerSupabaseConfigured()) {
      const supabase = await createServerSupabaseClient();
      const payload = {
        nombre: nombreClean,
        codigo_sbif: cleanSbif,
        rut: cleanRut,
        activo: activoVal,
      };

      const { data, error } = input.id
        ? await supabase
            .from("mantenedor_bancos")
            .update(payload)
            .eq("id", input.id)
            .select("id, codigo_sbif, nombre, rut, activo, created_at")
            .single()
        : await supabase
            .from("mantenedor_bancos")
            .upsert(payload, { onConflict: "nombre" })
            .select("id, codigo_sbif, nombre, rut, activo, created_at")
            .single();

      if (error) {
        return { success: false, error: error.message };
      }

      revalidateBancoPaths();
      return { success: true, data: data as MantenedorBanco };
    }

    const db = readLocalDb();
    if (!db.mantenedor_bancos) db.mantenedor_bancos = [];

    if (input.id) {
      const idx = db.mantenedor_bancos.findIndex((b) => b.id === input.id);
      if (idx === -1) {
        return { success: false, error: "Banco no encontrado." };
      }
      const updated: MantenedorBanco = {
        ...db.mantenedor_bancos[idx],
        nombre: nombreClean,
        codigo_sbif: cleanSbif,
        rut: cleanRut,
        activo: activoVal,
      };
      db.mantenedor_bancos[idx] = updated;
      writeLocalDb(db);
      revalidateBancoPaths();
      return { success: true, data: updated };
    }

    const existingByNameIdx = db.mantenedor_bancos.findIndex(
      (b) => b.nombre.trim().toUpperCase() === nombreClean
    );
    if (existingByNameIdx !== -1) {
      const updated: MantenedorBanco = {
        ...db.mantenedor_bancos[existingByNameIdx],
        nombre: nombreClean,
        codigo_sbif: cleanSbif,
        rut: cleanRut,
        activo: activoVal,
      };
      db.mantenedor_bancos[existingByNameIdx] = updated;
      writeLocalDb(db);
      revalidateBancoPaths();
      return { success: true, data: updated };
    }

    const created: MantenedorBanco = {
      id: `bco-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      nombre: nombreClean,
      codigo_sbif: cleanSbif,
      rut: cleanRut,
      activo: activoVal,
      created_at: new Date().toISOString(),
    };
    db.mantenedor_bancos.push(created);
    writeLocalDb(db);
    revalidateBancoPaths();
    return { success: true, data: created };
  } catch (err: unknown) {
    return {
      success: false,
      error:
        err instanceof Error
          ? err.message
          : "Error inesperado al guardar banco.",
    };
  }
}

export async function toggleBancoStatusAction(
  id: string,
  activo: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    const auth = await assertIsAdmin();
    if (!auth.authorized) {
      return { success: false, error: auth.error || "Acceso denegado." };
    }

    if (isServerSupabaseConfigured()) {
      const supabase = await createServerSupabaseClient();
      const { error } = await supabase
        .from("mantenedor_bancos")
        .update({ activo })
        .eq("id", id);

      if (error) {
        return {
          success: false,
          error: `Error actualizando estado del banco: ${error.message}`,
        };
      }
      revalidatePath("/configuracion/mantenedores-factoring");
      revalidatePath("/mantenedores");
      return { success: true };
    }

    const db = readLocalDb();
    if (!db.mantenedor_bancos) db.mantenedor_bancos = [];
    const idx = db.mantenedor_bancos.findIndex((b) => b.id === id);
    if (idx !== -1) {
      db.mantenedor_bancos[idx].activo = activo;
      writeLocalDb(db);
    }
    revalidatePath("/configuracion/mantenedores-factoring");
    revalidatePath("/mantenedores");
    return { success: true };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Error inesperado al actualizar banco.",
    };
  }
}

export async function deleteBancoAction(
  id: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const auth = await assertIsAdmin();
    if (!auth.authorized) {
      return { success: false, error: auth.error || "Acceso denegado." };
    }

    if (isServerSupabaseConfigured()) {
      const supabase = await createServerSupabaseClient();
      const { error } = await supabase
        .from("mantenedor_bancos")
        .delete()
        .eq("id", id);

      if (error) {
        return { success: false, error: `Error eliminando banco: ${error.message}` };
      }
      revalidatePath("/configuracion/mantenedores-factoring");
      revalidatePath("/mantenedores");
      return { success: true };
    }

    const db = readLocalDb();
    if (!db.mantenedor_bancos) db.mantenedor_bancos = [];
    db.mantenedor_bancos = db.mantenedor_bancos.filter((b) => b.id !== id);
    writeLocalDb(db);
    revalidatePath("/configuracion/mantenedores-factoring");
    revalidatePath("/mantenedores");
    return { success: true };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Error inesperado al eliminar banco.",
    };
  }
}


