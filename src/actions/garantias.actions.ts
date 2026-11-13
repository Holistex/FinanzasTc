"use server";

import { revalidatePath } from "next/cache";
import {
  createServerSupabaseClient,
  isServerSupabaseConfigured,
} from "@/lib/supabase/server";
import { readLocalDb, writeLocalDb } from "@/lib/supabase/local-fallback-db";
import { assertCanManage, getServerUserSession } from "@/lib/auth/session";
import {
  BoletaGarantia,
  PolizaGarantia,
  EstadoGarantia,
  MonedaGarantia,
  GarantiaItemWithRelations,
  GarantiasKpiSummary,
  HistorialRenovacionGarantia,
  GestionGarantia,
} from "@/types/database.types";

import {
  calculateDiasRestantes,
  calculateEstadoGarantia,
  computeGarantiasKpis,
} from "@/lib/garantias-utils";

export interface GarantiasFilterParams {
  query?: string;
  estado?: EstadoGarantia | "TODOS";
  mandanteId?: string | "TODOS";
  companiaId?: string | "TODOS";
  moneda?: MonedaGarantia | "TODAS";
}

// ============================================================================
// 1. BOLETAS DE GARANTÍA
// ============================================================================

export async function getBoletasGarantiasAction(
  filters?: GarantiasFilterParams
): Promise<{ items: GarantiaItemWithRelations[]; kpis: GarantiasKpiSummary }> {
  let rawItems: BoletaGarantia[] = [];
  let rawGestiones: GestionGarantia[] = [];
  const mandantesMap = new Map<string, { razon_social: string; rut: string }>();
  const companiasMap = new Map<string, { razon_social: string; rut: string }>();

  if (isServerSupabaseConfigured()) {
    try {
      const supabase = await createServerSupabaseClient();
      const [boletasRes, mandantesRes, companiasRes, gestionesRes] = await Promise.all([
        supabase.from("boletas_garantias").select("*").order("fecha_vencimiento", { ascending: true }),
        supabase.from("mantenedor_mandantes").select("id, razon_social, rut_mandante"),
        supabase.from("mantenedor_companias").select("id, razon_social, rut_compania"),
        supabase
          .from("gestiones_garantias")
          .select("*")
          .eq("tipo_documento", "BOLETA")
          .order("created_at", { ascending: false }),
      ]);

      if (!boletasRes.error && boletasRes.data) {
        rawItems = (boletasRes.data as BoletaGarantia[]) || [];
        (mandantesRes.data || []).forEach((m: any) =>
          mandantesMap.set(m.id, { razon_social: m.razon_social, rut: m.rut_mandante || m.rut || "" })
        );
        (companiasRes.data || []).forEach((c: any) =>
          companiasMap.set(c.id, { razon_social: c.razon_social, rut: c.rut_compania || c.rut || "" })
        );
      }
      if (!gestionesRes.error && gestionesRes.data) {
        rawGestiones = (gestionesRes.data as GestionGarantia[]) || [];
      }
    } catch {
      // Fallback a local DB
    }
  }

  const db = readLocalDb();
  if (rawItems.length === 0 && mandantesMap.size === 0) {
    rawItems = [...(db.boletas_garantias || [])];
    (db.mantenedor_mandantes || []).forEach((m) =>
      mandantesMap.set(m.id, { razon_social: m.razon_social, rut: m.rut || m.rut_mandante || "" })
    );
    (db.mantenedor_companias || []).forEach((c) =>
      companiasMap.set(c.id, { razon_social: c.razon_social, rut: c.rut || c.rut_compania || "" })
    );
  }

  // Combinar gestiones de Supabase y local fallback DB (por si la tabla aún no existe en remoto o hay registros locales)
  const localBoletaGestiones = (db.gestiones_garantias || []).filter(
    (g) => g.tipo_documento === "BOLETA"
  );
  const gestionesById = new Map<string, GestionGarantia>();
  for (const g of [...rawGestiones, ...localBoletaGestiones]) {
    if (!gestionesById.has(g.id)) {
      gestionesById.set(g.id, g);
    }
  }

  const gestionesPorDocMap = new Map<string, GestionGarantia[]>();
  Array.from(gestionesById.values())
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .forEach((g) => {
      const list = gestionesPorDocMap.get(g.documento_id) || [];
      list.push(g);
      gestionesPorDocMap.set(g.documento_id, list);
    });

  // Enrich with relation data and dynamic calculated status
  let items: GarantiaItemWithRelations[] = rawItems.map((b) => {
    const mandanteInfo = mandantesMap.get(b.mandante_id);
    const companiaInfo = companiasMap.get(b.compania_id);
    const { estado, diasRestantes } = calculateEstadoGarantia(b.fecha_vencimiento);
    const docGestiones = gestionesPorDocMap.get(b.id) || [];
    const ultimaGestion = docGestiones[0] || null;

    return {
      ...b,
      on_proyecto: b.on_proyecto || null,
      mandante_razon_social: mandanteInfo?.razon_social || "No asignado",
      mandante_rut: mandanteInfo?.rut || "",
      compania_razon_social: companiaInfo?.razon_social || "No asignada",
      compania_rut: companiaInfo?.rut || "",
      monto_uf: b.monto_uf !== undefined && b.monto_uf !== null ? b.monto_uf : b.monto,
      contrafianza: b.contrafianza || null,
      contrafianza_compania: b.contrafianza_compania || null,
      contador_renovaciones: b.contador_renovaciones ?? 0,
      estado,
      dias_restantes: diasRestantes,
      gestiones_count: docGestiones.length,
      ultima_gestion_estado: ultimaGestion?.estado_gestion || null,
      ultima_gestion_fecha: ultimaGestion?.created_at || null,
      ultima_gestion_seguimiento: ultimaGestion?.fecha_proximo_seguimiento || null,
      gestiones: docGestiones,
    };
  });

  const kpis = computeGarantiasKpis(items);

  // Apply filters
  if (filters?.estado && filters.estado !== "TODOS") {
    items = items.filter((item) => item.estado === filters.estado);
  }
  if (filters?.mandanteId && filters.mandanteId !== "TODOS") {
    items = items.filter((item) => item.mandante_id === filters.mandanteId);
  }
  if (filters?.companiaId && filters.companiaId !== "TODOS") {
    items = items.filter((item) => item.compania_id === filters.companiaId);
  }
  if (filters?.moneda && filters.moneda !== "TODAS") {
    items = items.filter((item) => item.moneda === filters.moneda);
  }
  if (filters?.query) {
    const q = filters.query.trim().toLowerCase();
    items = items.filter(
      (item) =>
        item.nro_folio.toLowerCase().includes(q) ||
        (item.on_proyecto || "").toLowerCase().includes(q) ||
        (item.obra || "").toLowerCase().includes(q) ||
        (item.proyecto || "").toLowerCase().includes(q) ||
        item.motivo.toLowerCase().includes(q) ||
        item.mandante_razon_social.toLowerCase().includes(q) ||
        item.compania_razon_social.toLowerCase().includes(q) ||
        (item.contrafianza || "").toLowerCase().includes(q) ||
        (item.contrafianza_compania || "").toLowerCase().includes(q) ||
        (item.ultima_gestion_estado || "").toLowerCase().includes(q)
    );
  }

  items.sort((a, b) => a.fecha_vencimiento.localeCompare(b.fecha_vencimiento));

  return { items, kpis };
}

export async function upsertBoletaGarantiaAction(input: {
  id?: string;
  nro_folio: string;
  on_proyecto?: string | null;
  mandante_id: string;
  compania_id: string;
  motivo: string;
  monto: number;
  monto_uf?: number | null;
  moneda: MonedaGarantia;
  fecha_emision: string;
  fecha_vencimiento: string;
  obra?: string | null;
  proyecto?: string | null;
  contrafianza?: string | null;
  contrafianza_compania?: string | null;
  contador_renovaciones?: number;
}): Promise<BoletaGarantia> {
  const auth = await assertCanManage(["garantias_boletas"]);
  if (!auth.authorized) {
    throw new Error(auth.error || "Acceso denegado.");
  }

  if (!input.nro_folio.trim()) throw new Error("El N° Folio es obligatorio.");
  if (!input.mandante_id) throw new Error("Debe seleccionar un Mandante.");
  if (!input.compania_id) throw new Error("Debe seleccionar una Compañía.");
  if (!input.motivo.trim()) throw new Error("El motivo es obligatorio.");
  if (input.monto === undefined || input.monto === null || input.monto < 0) {
    throw new Error("El monto debe ser mayor o igual a 0.");
  }
  if (!input.fecha_emision) throw new Error("La fecha de emisión es obligatoria.");
  if (!input.fecha_vencimiento) throw new Error("La fecha de vencimiento es obligatoria.");

  const payload = {
    ...(input.id ? { id: input.id } : {}),
    nro_folio: input.nro_folio.trim().toUpperCase(),
    on_proyecto: input.on_proyecto?.trim() || null,
    mandante_id: input.mandante_id,
    compania_id: input.compania_id,
    motivo: input.motivo.trim(),
    monto: Number(input.monto),
    monto_uf: input.monto_uf !== undefined && input.monto_uf !== null ? Number(input.monto_uf) : Number(input.monto),
    moneda: input.moneda || "UF",
    fecha_emision: input.fecha_emision,
    fecha_vencimiento: input.fecha_vencimiento,
    obra: input.obra?.trim() || null,
    proyecto: input.proyecto?.trim() || null,
    contrafianza: input.contrafianza?.trim() || null,
    contrafianza_compania: input.contrafianza_compania?.trim() || null,
    contador_renovaciones: input.contador_renovaciones !== undefined ? Number(input.contador_renovaciones) : 0,
  };

  if (isServerSupabaseConfigured()) {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("boletas_garantias")
      .upsert(payload)
      .select()
      .single();

    if (error) {
      throw new Error(`Error al guardar Boleta de Garantía en Supabase: ${error.message}`);
    }

    if (data) {
      revalidatePath("/gestion-garantias/boletas-garantias");
      return data as BoletaGarantia;
    }
  }

  const db = readLocalDb();
  if (!db.boletas_garantias) db.boletas_garantias = [];

  const existingIndex = input.id
    ? db.boletas_garantias.findIndex((b) => b.id === input.id)
    : db.boletas_garantias.findIndex((b) => b.nro_folio === payload.nro_folio);

  const nowIso = new Date().toISOString();
  let savedRecord: BoletaGarantia;

  if (existingIndex >= 0) {
    savedRecord = {
      ...db.boletas_garantias[existingIndex],
      ...payload,
      contador_renovaciones: input.contador_renovaciones !== undefined 
        ? Number(input.contador_renovaciones) 
        : (db.boletas_garantias[existingIndex].contador_renovaciones ?? 0),
    };
    db.boletas_garantias[existingIndex] = savedRecord;
  } else {
    savedRecord = {
      id: input.id || `bg-${Date.now()}`,
      ...payload,
      contador_renovaciones: input.contador_renovaciones !== undefined ? Number(input.contador_renovaciones) : 0,
      created_at: nowIso,
    };
    db.boletas_garantias.push(savedRecord);
  }

  writeLocalDb(db);
  revalidatePath("/gestion-garantias/boletas-garantias");
  return savedRecord;
}

export async function deleteBoletaGarantiaAction(_id: string): Promise<void> {
  throw new Error(
    "La eliminación de boletas de garantía está estrictamente prohibida para resguardar la trazabilidad financiera y auditoría de la empresa."
  );
}

// ============================================================================
// 2. PÓLIZAS DE GARANTÍA
// ============================================================================

export async function getPolizasGarantiasAction(
  filters?: GarantiasFilterParams
): Promise<{ items: GarantiaItemWithRelations[]; kpis: GarantiasKpiSummary }> {
  let rawItems: PolizaGarantia[] = [];
  let rawGestiones: GestionGarantia[] = [];
  const mandantesMap = new Map<string, { razon_social: string; rut: string }>();
  const companiasMap = new Map<string, { razon_social: string; rut: string }>();

  if (isServerSupabaseConfigured()) {
    try {
      const supabase = await createServerSupabaseClient();
      const [polizasRes, mandantesRes, companiasRes, gestionesRes] = await Promise.all([
        supabase.from("polizas_garantias").select("*").order("fecha_vencimiento", { ascending: true }),
        supabase.from("mantenedor_mandantes").select("id, razon_social, rut_mandante"),
        supabase.from("mantenedor_companias").select("id, razon_social, rut_compania"),
        supabase
          .from("gestiones_garantias")
          .select("*")
          .eq("tipo_documento", "POLIZA")
          .order("created_at", { ascending: false }),
      ]);

      if (!polizasRes.error && polizasRes.data) {
        rawItems = (polizasRes.data as PolizaGarantia[]) || [];
        (mandantesRes.data || []).forEach((m: any) =>
          mandantesMap.set(m.id, { razon_social: m.razon_social, rut: m.rut_mandante || m.rut || "" })
        );
        (companiasRes.data || []).forEach((c: any) =>
          companiasMap.set(c.id, { razon_social: c.razon_social, rut: c.rut_compania || c.rut || "" })
        );
      }
      if (!gestionesRes.error && gestionesRes.data) {
        rawGestiones = (gestionesRes.data as GestionGarantia[]) || [];
      }
    } catch {
      // Fallback a local DB
    }
  }

  const db = readLocalDb();
  if (rawItems.length === 0 && mandantesMap.size === 0) {
    rawItems = [...(db.polizas_garantias || [])];
    (db.mantenedor_mandantes || []).forEach((m) =>
      mandantesMap.set(m.id, { razon_social: m.razon_social, rut: m.rut || m.rut_mandante || "" })
    );
    (db.mantenedor_companias || []).forEach((c) =>
      companiasMap.set(c.id, { razon_social: c.razon_social, rut: c.rut || c.rut_compania || "" })
    );
  }

  // Combinar gestiones de Supabase y local fallback DB
  const localPolizaGestiones = (db.gestiones_garantias || []).filter(
    (g) => g.tipo_documento === "POLIZA"
  );
  const gestionesById = new Map<string, GestionGarantia>();
  for (const g of [...rawGestiones, ...localPolizaGestiones]) {
    if (!gestionesById.has(g.id)) {
      gestionesById.set(g.id, g);
    }
  }

  const gestionesPorDocMap = new Map<string, GestionGarantia[]>();
  Array.from(gestionesById.values())
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .forEach((g) => {
      const list = gestionesPorDocMap.get(g.documento_id) || [];
      list.push(g);
      gestionesPorDocMap.set(g.documento_id, list);
    });

  // Enrich with relation data and dynamic calculated status
  let items: GarantiaItemWithRelations[] = rawItems.map((p) => {
    const mandanteInfo = mandantesMap.get(p.mandante_id);
    const companiaInfo = companiasMap.get(p.compania_id);
    const { estado, diasRestantes } = calculateEstadoGarantia(p.fecha_vencimiento);
    const docGestiones = gestionesPorDocMap.get(p.id) || [];
    const ultimaGestion = docGestiones[0] || null;

    return {
      ...p,
      on_proyecto: p.on_proyecto || null,
      mandante_razon_social: mandanteInfo?.razon_social || "No asignado",
      mandante_rut: mandanteInfo?.rut || "",
      compania_razon_social: companiaInfo?.razon_social || "No asignada",
      compania_rut: companiaInfo?.rut || "",
      monto_uf: p.monto_uf !== undefined && p.monto_uf !== null ? p.monto_uf : p.monto,
      contrafianza: p.contrafianza || null,
      contrafianza_compania: p.contrafianza_compania || null,
      contador_renovaciones: p.contador_renovaciones ?? 0,
      estado,
      dias_restantes: diasRestantes,
      gestiones_count: docGestiones.length,
      ultima_gestion_estado: ultimaGestion?.estado_gestion || null,
      ultima_gestion_fecha: ultimaGestion?.created_at || null,
      ultima_gestion_seguimiento: ultimaGestion?.fecha_proximo_seguimiento || null,
      gestiones: docGestiones,
    };
  });

  const kpis = computeGarantiasKpis(items);

  // Apply filters
  if (filters?.estado && filters.estado !== "TODOS") {
    items = items.filter((item) => item.estado === filters.estado);
  }
  if (filters?.mandanteId && filters.mandanteId !== "TODOS") {
    items = items.filter((item) => item.mandante_id === filters.mandanteId);
  }
  if (filters?.companiaId && filters.companiaId !== "TODOS") {
    items = items.filter((item) => item.compania_id === filters.companiaId);
  }
  if (filters?.moneda && filters.moneda !== "TODAS") {
    items = items.filter((item) => item.moneda === filters.moneda);
  }
  if (filters?.query) {
    const q = filters.query.trim().toLowerCase();
    items = items.filter(
      (item) =>
        item.nro_folio.toLowerCase().includes(q) ||
        (item.on_proyecto || "").toLowerCase().includes(q) ||
        (item.obra || "").toLowerCase().includes(q) ||
        (item.proyecto || "").toLowerCase().includes(q) ||
        item.motivo.toLowerCase().includes(q) ||
        item.mandante_razon_social.toLowerCase().includes(q) ||
        item.compania_razon_social.toLowerCase().includes(q) ||
        (item.contrafianza || "").toLowerCase().includes(q) ||
        (item.contrafianza_compania || "").toLowerCase().includes(q) ||
        (item.ultima_gestion_estado || "").toLowerCase().includes(q)
    );
  }

  items.sort((a, b) => a.fecha_vencimiento.localeCompare(b.fecha_vencimiento));

  return { items, kpis };
}

export async function upsertPolizaGarantiaAction(input: {
  id?: string;
  nro_folio: string;
  on_proyecto?: string | null;
  mandante_id: string;
  compania_id: string;
  motivo: string;
  monto: number;
  monto_uf?: number | null;
  moneda: MonedaGarantia;
  fecha_emision: string;
  fecha_vencimiento: string;
  obra?: string | null;
  proyecto?: string | null;
  contrafianza?: string | null;
  contrafianza_compania?: string | null;
  contador_renovaciones?: number;
}): Promise<PolizaGarantia> {
  const auth = await assertCanManage(["garantias_polizas"]);
  if (!auth.authorized) {
    throw new Error(auth.error || "Acceso denegado.");
  }

  if (!input.nro_folio.trim()) throw new Error("El N° Folio es obligatorio.");
  if (!input.mandante_id) throw new Error("Debe seleccionar un Mandante.");
  if (!input.compania_id) throw new Error("Debe seleccionar una Compañía.");
  if (!input.motivo.trim()) throw new Error("El motivo es obligatorio.");
  if (input.monto === undefined || input.monto === null || input.monto < 0) {
    throw new Error("El monto debe ser mayor o igual a 0.");
  }
  if (!input.fecha_emision) throw new Error("La fecha de emisión es obligatoria.");
  if (!input.fecha_vencimiento) throw new Error("La fecha de vencimiento es obligatoria.");

  const payload = {
    ...(input.id ? { id: input.id } : {}),
    nro_folio: input.nro_folio.trim().toUpperCase(),
    on_proyecto: input.on_proyecto?.trim() || null,
    mandante_id: input.mandante_id,
    compania_id: input.compania_id,
    motivo: input.motivo.trim(),
    monto: Number(input.monto),
    monto_uf: input.monto_uf !== undefined && input.monto_uf !== null ? Number(input.monto_uf) : Number(input.monto),
    moneda: input.moneda || "UF",
    fecha_emision: input.fecha_emision,
    fecha_vencimiento: input.fecha_vencimiento,
    obra: input.obra?.trim() || null,
    proyecto: input.proyecto?.trim() || null,
    contrafianza: input.contrafianza?.trim() || null,
    contrafianza_compania: input.contrafianza_compania?.trim() || null,
    contador_renovaciones: input.contador_renovaciones !== undefined ? Number(input.contador_renovaciones) : 0,
  };

  if (isServerSupabaseConfigured()) {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("polizas_garantias")
      .upsert(payload)
      .select()
      .single();

    if (error) {
      throw new Error(`Error al guardar Póliza de Garantía en Supabase: ${error.message}`);
    }

    if (data) {
      revalidatePath("/gestion-garantias/polizas-garantias");
      return data as PolizaGarantia;
    }
  }

  const db = readLocalDb();
  if (!db.polizas_garantias) db.polizas_garantias = [];

  const existingIndex = input.id
    ? db.polizas_garantias.findIndex((p) => p.id === input.id)
    : db.polizas_garantias.findIndex((p) => p.nro_folio === payload.nro_folio);

  const nowIso = new Date().toISOString();
  let savedRecord: PolizaGarantia;

  if (existingIndex >= 0) {
    savedRecord = {
      ...db.polizas_garantias[existingIndex],
      ...payload,
      contador_renovaciones: input.contador_renovaciones !== undefined 
        ? Number(input.contador_renovaciones) 
        : (db.polizas_garantias[existingIndex].contador_renovaciones ?? 0),
    };
    db.polizas_garantias[existingIndex] = savedRecord;
  } else {
    savedRecord = {
      id: input.id || `pg-${Date.now()}`,
      ...payload,
      contador_renovaciones: input.contador_renovaciones !== undefined ? Number(input.contador_renovaciones) : 0,
      created_at: nowIso,
    };
    db.polizas_garantias.push(savedRecord);
  }

  writeLocalDb(db);
  revalidatePath("/gestion-garantias/polizas-garantias");
  return savedRecord;
}

export async function deletePolizaGarantiaAction(_id: string): Promise<void> {
  throw new Error(
    "La eliminación de pólizas de garantía está estrictamente prohibida para resguardar la trazabilidad financiera y auditoría de la empresa."
  );
}

// ============================================================================
// 3. RENOVACIONES DE GARANTÍAS (BOLETAS & PÓLIZAS)
// ============================================================================

export async function renovarGarantiaAction(input: {
  tipo: "BOLETA" | "POLIZA";
  id: string;
  nuevaFechaVencimiento: string;
  observaciones?: string;
  usuarioId?: string;
}): Promise<{ success: boolean; contador_renovaciones: number; nueva_fecha_vencimiento: string }> {
  const targetKey =
    input.tipo === "BOLETA" ? "garantias_boletas" : "garantias_polizas";
  const auth = await assertCanManage([targetKey]);
  if (!auth.authorized) {
    throw new Error(auth.error || "Acceso denegado.");
  }

  if (!input.id) throw new Error("ID de garantía no proporcionado.");
  if (!input.nuevaFechaVencimiento) throw new Error("Debe ingresar la nueva fecha de vencimiento.");

  const tableName = input.tipo === "BOLETA" ? "boletas_garantias" : "polizas_garantias";
  const path = input.tipo === "BOLETA" ? "/gestion-garantias/boletas-garantias" : "/gestion-garantias/polizas-garantias";

  let fechaAnterior = "";
  let nuevoContador = 1;

  if (isServerSupabaseConfigured()) {
    const supabase = await createServerSupabaseClient();
    const { data: currentDoc, error: fetchErr } = await supabase
      .from(tableName)
      .select("fecha_vencimiento, contador_renovaciones")
      .eq("id", input.id)
      .single();

    if (fetchErr) {
      throw new Error(`Error al consultar garantía en Supabase: ${fetchErr.message}`);
    }

    if (currentDoc) {
      fechaAnterior = currentDoc.fecha_vencimiento;
      nuevoContador = (currentDoc.contador_renovaciones || 0) + 1;

      const { error: updateErr } = await supabase
        .from(tableName)
        .update({
          fecha_vencimiento: input.nuevaFechaVencimiento,
          contador_renovaciones: nuevoContador,
          updated_at: new Date().toISOString(),
        })
        .eq("id", input.id);

      if (updateErr) {
        throw new Error(`Error al renovar garantía en Supabase: ${updateErr.message}`);
      }

      // Registrar en historial
      const { error: histErr } = await supabase.from("historial_renovaciones_garantias").insert({
        tipo_garantia: input.tipo,
        documento_id: input.id,
        nro_renovacion: nuevoContador,
        fecha_vencimiento_anterior: fechaAnterior,
        fecha_vencimiento_nueva: input.nuevaFechaVencimiento,
        observaciones: input.observaciones?.trim() || null,
        usuario_id: input.usuarioId || null,
        created_at: new Date().toISOString(),
      });

      if (histErr) {
        throw new Error(`Error al registrar historial de renovación en Supabase: ${histErr.message}`);
      }

      revalidatePath(path);
      return {
        success: true,
        contador_renovaciones: nuevoContador,
        nueva_fecha_vencimiento: input.nuevaFechaVencimiento,
      };
    }
  }

  // Fallback Local DB
  const db = readLocalDb();
  if (!db.boletas_garantias) db.boletas_garantias = [];
  if (!db.polizas_garantias) db.polizas_garantias = [];

  const list = input.tipo === "BOLETA" ? db.boletas_garantias : db.polizas_garantias;
  const idx = list.findIndex((item) => item.id === input.id);

  if (idx === -1) {
    throw new Error("El documento de garantía no fue encontrado.");
  }

  fechaAnterior = list[idx].fecha_vencimiento;
  nuevoContador = (list[idx].contador_renovaciones || 0) + 1;

  list[idx].fecha_vencimiento = input.nuevaFechaVencimiento;
  list[idx].contador_renovaciones = nuevoContador;
  list[idx].updated_at = new Date().toISOString();

  if (!db.historial_renovaciones_garantias) {
    db.historial_renovaciones_garantias = [];
  }

  const logEntry: HistorialRenovacionGarantia = {
    id: `ren-${Date.now()}`,
    tipo_garantia: input.tipo,
    tipo_documento: input.tipo,
    documento_id: input.id,
    nro_renovacion: nuevoContador,
    fecha_vencimiento_anterior: fechaAnterior,
    fecha_vencimiento_nueva: input.nuevaFechaVencimiento,
    observaciones: input.observaciones?.trim() || null,
    usuario_id: input.usuarioId || null,
    created_at: new Date().toISOString(),
  };

  db.historial_renovaciones_garantias.unshift(logEntry);
  writeLocalDb(db);

  revalidatePath(path);
  return {
    success: true,
    contador_renovaciones: nuevoContador,
    nueva_fecha_vencimiento: input.nuevaFechaVencimiento,
  };
}

export async function getHistorialRenovacionesAction(
  tipo: "BOLETA" | "POLIZA",
  documentoId: string
): Promise<HistorialRenovacionGarantia[]> {
  if (!documentoId) return [];

  if (isServerSupabaseConfigured()) {
    try {
      const supabase = await createServerSupabaseClient();
      const { data, error } = await supabase
        .from("historial_renovaciones_garantias")
        .select("*")
        .eq("documento_id", documentoId)
        .order("created_at", { ascending: false });

      if (!error && data && data.length > 0) {
        return data as HistorialRenovacionGarantia[];
      }
    } catch {
      // Fallback a local DB
    }
  }

  const db = readLocalDb();
  const list = db.historial_renovaciones_garantias || [];
  return list
    .filter((h) => h.documento_id === documentoId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

// ============================================================================
// 4. BITÁCORA Y SEGUIMIENTO DE GESTIONES (BOLETAS & PÓLIZAS)
// ============================================================================

export async function getGestionesGarantiaAction(
  tipoDocumento: "BOLETA" | "POLIZA",
  documentoId: string
): Promise<GestionGarantia[]> {
  if (!documentoId) return [];

  let remoteGestiones: GestionGarantia[] = [];

  if (isServerSupabaseConfigured()) {
    try {
      const supabase = await createServerSupabaseClient();
      const { data, error } = await supabase
        .from("gestiones_garantias")
        .select("*")
        .eq("tipo_documento", tipoDocumento)
        .eq("documento_id", documentoId)
        .order("created_at", { ascending: false });

      if (!error && data) {
        remoteGestiones = data as GestionGarantia[];
      }
    } catch {
      // Fallback a local DB
    }
  }

  const db = readLocalDb();
  const localGestiones = (db.gestiones_garantias || []).filter(
    (g) => g.tipo_documento === tipoDocumento && g.documento_id === documentoId
  );

  const byId = new Map<string, GestionGarantia>();
  for (const g of [...remoteGestiones, ...localGestiones]) {
    if (!byId.has(g.id)) {
      byId.set(g.id, g);
    }
  }

  return Array.from(byId.values()).sort((a, b) =>
    b.created_at.localeCompare(a.created_at)
  );
}

export async function registrarGestionGarantiaAction(input: {
  tipo_documento: "BOLETA" | "POLIZA";
  documento_id: string;
  estado_gestion: string;
  observacion: string;
  fecha_proximo_seguimiento?: string | null;
}): Promise<GestionGarantia> {
  const targetKey =
    input.tipo_documento === "BOLETA" ? "garantias_boletas" : "garantias_polizas";
  const auth = await assertCanManage([targetKey]);
  if (!auth.authorized) {
    throw new Error(auth.error || "Acceso denegado.");
  }

  if (!input.documento_id) {
    throw new Error("ID del documento es obligatorio.");
  }
  if (!input.estado_gestion || !input.estado_gestion.trim()) {
    throw new Error("Debe seleccionar el estado de la gestión.");
  }
  if (!input.observacion || !input.observacion.trim()) {
    throw new Error("La descripción / detalle de la gestión es obligatoria.");
  }

  // Capturar el usuario activo en segundo plano
  const session = await getServerUserSession();
  const usuarioNombre = session?.nombre || session?.usuario || "Usuario Sistema";
  const nowIso = new Date().toISOString();

  const path =
    input.tipo_documento === "BOLETA"
      ? "/gestion-garantias/boletas-garantias"
      : "/gestion-garantias/polizas-garantias";

  const payload = {
    tipo_documento: input.tipo_documento,
    documento_id: input.documento_id,
    estado_gestion: input.estado_gestion.trim(),
    observacion: input.observacion.trim(),
    fecha_proximo_seguimiento: input.fecha_proximo_seguimiento?.trim() || null,
    usuario_nombre: usuarioNombre,
  };

  if (isServerSupabaseConfigured()) {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("gestiones_garantias")
      .insert(payload)
      .select()
      .single();

    if (error) {
      throw new Error(`Error al registrar gestión de garantía en Supabase: ${error.message}`);
    }

    if (data) {
      // Sincronizar también en local DB para mantener consistencia inmediata
      try {
        const db = readLocalDb();
        if (!db.gestiones_garantias) db.gestiones_garantias = [];
        db.gestiones_garantias.unshift(data as GestionGarantia);
        writeLocalDb(db);
      } catch {
        // ignore
      }
      revalidatePath(path);
      return data as GestionGarantia;
    }
  }

  const db = readLocalDb();
  if (!db.gestiones_garantias) {
    db.gestiones_garantias = [];
  }

  const newEntry: GestionGarantia = {
    id: crypto.randomUUID ? crypto.randomUUID() : `gg-${Date.now()}`,
    ...payload,
    created_at: nowIso,
  };

  db.gestiones_garantias.unshift(newEntry);
  writeLocalDb(db);

  revalidatePath(path);
  return newEntry;
}

