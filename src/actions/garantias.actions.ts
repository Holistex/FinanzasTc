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
          .from("historial_renovaciones_garantias")
          .select("*")
          .or("tipo_garantia.eq.BOLETA,tipo_documento.eq.BOLETA")
          .not("estado_gestion", "is", null)
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
        rawGestiones = (gestionesRes.data as Array<Record<string, unknown>>)
          .filter((r) => Boolean(r.estado_gestion))
          .map((r) => ({
            id: String(r.id),
            tipo_documento: (String(r.tipo_documento || r.tipo_garantia || "BOLETA") as "BOLETA" | "POLIZA"),
            documento_id: String(r.documento_id || r.garantia_id || ""),
            estado_gestion: String(r.estado_gestion || ""),
            observacion: String(r.observacion || r.descripcion || ""),
            fecha_proximo_seguimiento: r.proximo_seguimiento
              ? String(r.proximo_seguimiento)
              : r.fecha_proximo_seguimiento
              ? String(r.fecha_proximo_seguimiento)
              : null,
            usuario_nombre: r.usuario_nombre ? String(r.usuario_nombre) : null,
            created_at: String(r.created_at || new Date().toISOString()),
          }));
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
      compania_razon_social:
        (b as unknown as Record<string, unknown>).banco_emisor
          ? String((b as unknown as Record<string, unknown>).banco_emisor)
          : companiaInfo?.razon_social || "No asignada",
      compania_rut: companiaInfo?.rut || "",
      monto_uf:
        b.moneda === "CLP"
          ? 0
          : b.monto_uf !== undefined && b.monto_uf !== null
          ? b.monto_uf
          : b.monto,
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
}): Promise<{ success: boolean; data?: BoletaGarantia; error?: string }> {
  try {
    const auth = await assertCanManage(["garantias_boletas"]);
    if (!auth.authorized) {
      return { success: false, error: auth.error || "Acceso denegado." };
    }

    if (!input.nro_folio.trim()) return { success: false, error: "El N° Folio es obligatorio." };
    if (!input.mandante_id) return { success: false, error: "Debe seleccionar un Mandante." };
    if (!input.compania_id) return { success: false, error: "Debe seleccionar una Compañía." };
    if (!input.motivo.trim()) return { success: false, error: "El motivo es obligatorio." };
    if (input.monto === undefined || input.monto === null || input.monto < 0) {
      return { success: false, error: "El monto debe ser mayor o igual a 0." };
    }
    if (!input.fecha_emision) return { success: false, error: "La fecha de emisión es obligatoria." };
    if (!input.fecha_vencimiento) return { success: false, error: "La fecha de vencimiento es obligatoria." };

  let resolvedCompaniaId = input.compania_id;
  let resolvedBancoId: string | null = null;
  let resolvedBancoEmisor: string | null = null;

  if (resolvedCompaniaId.startsWith("banco:")) {
    const bancoId = resolvedCompaniaId.slice("banco:".length);
    resolvedBancoId = bancoId;
    const localDb = readLocalDb();
    let bancoNombre =
      (localDb.mantenedor_bancos || []).find((b) => b.id === bancoId)?.nombre || "";
    let bancoRut =
      (localDb.mantenedor_bancos || []).find((b) => b.id === bancoId)?.rut || "00000000-0";

    if (isServerSupabaseConfigured()) {
      const supabase = await createServerSupabaseClient();
      if (!bancoNombre) {
        const { data: bRow } = await supabase
          .from("mantenedor_bancos")
          .select("nombre, rut")
          .eq("id", bancoId)
          .maybeSingle();
        if (bRow?.nombre) {
          bancoNombre = String(bRow.nombre);
          bancoRut = bRow.rut ? String(bRow.rut) : bancoRut;
        }
      }
      resolvedBancoEmisor = bancoNombre || null;
      if (bancoNombre) {
        const { data: existingComp } = await supabase
          .from("mantenedor_companias")
          .select("id")
          .ilike("razon_social", bancoNombre)
          .maybeSingle();
        if (existingComp?.id) {
          resolvedCompaniaId = String(existingComp.id);
        } else {
          const { data: createdComp, error: compErr } = await supabase
            .from("mantenedor_companias")
            .insert({
              razon_social: bancoNombre,
              rut_compania: bancoRut || "00000000-0",
            })
            .select("id")
            .single();
          if (compErr || !createdComp?.id) {
            return {
              success: false,
              error: `No se pudo asociar el banco emisor (${bancoNombre}): ${compErr?.message || "error desconocido"}`,
            };
          }
          resolvedCompaniaId = String(createdComp.id);
        }
      }
    } else if (bancoNombre) {
      resolvedBancoEmisor = bancoNombre;
      if (!localDb.mantenedor_companias) localDb.mantenedor_companias = [];
      const existingLocal = localDb.mantenedor_companias.find(
        (c) => c.razon_social.toLowerCase() === bancoNombre.toLowerCase()
      );
      if (existingLocal) {
        resolvedCompaniaId = existingLocal.id;
      } else {
        const newCompId = `comp-${Date.now()}`;
        localDb.mantenedor_companias.push({
          id: newCompId,
          rut: bancoRut,
          rut_compania: bancoRut,
          razon_social: bancoNombre,
          created_at: new Date().toISOString(),
        });
        writeLocalDb(localDb);
        resolvedCompaniaId = newCompId;
      }
    }
  } else if (isServerSupabaseConfigured()) {
    const supabase = await createServerSupabaseClient();
    const { data: compRow } = await supabase
      .from("mantenedor_companias")
      .select("razon_social")
      .eq("id", resolvedCompaniaId)
      .maybeSingle();
    if (compRow?.razon_social) {
      resolvedBancoEmisor = String(compRow.razon_social);
      const { data: bMatch } = await supabase
        .from("mantenedor_bancos")
        .select("id")
        .ilike("nombre", resolvedBancoEmisor)
        .maybeSingle();
      if (bMatch?.id) resolvedBancoId = String(bMatch.id);
    }
  }

  const isClp = input.moneda === "CLP";
  const montoNum = isClp ? Math.round(Number(input.monto)) : Number(input.monto);
  const montoUfNum = isClp
    ? 0
    : input.monto_uf !== undefined && input.monto_uf !== null
    ? Number(input.monto_uf)
    : montoNum;

  const payload = {
    ...(input.id ? { id: input.id } : {}),
    nro_folio: input.nro_folio.trim().toUpperCase(),
    on_proyecto: input.on_proyecto?.trim() || null,
    mandante_id: input.mandante_id,
    compania_id: resolvedCompaniaId,
    ...(resolvedBancoId ? { banco_id: resolvedBancoId } : {}),
    ...(resolvedBancoEmisor ? { banco_emisor: resolvedBancoEmisor } : {}),
    motivo: input.motivo.trim(),
    monto: montoNum,
    monto_uf: montoUfNum,
    moneda: isClp ? ("CLP" as MonedaGarantia) : ("UF" as MonedaGarantia),
    fecha_emision: input.fecha_emision,
    fecha_vencimiento: input.fecha_vencimiento,
    obra: input.obra?.trim() || null,
    proyecto: null,
    contrafianza: null,
    contrafianza_compania: null,
    contador_renovaciones: input.contador_renovaciones !== undefined ? Number(input.contador_renovaciones) : 0,
  };

  if (isServerSupabaseConfigured()) {
    const supabase = await createServerSupabaseClient();
    const { data, error } = input.id
      ? await supabase
          .from("boletas_garantias")
          .update(payload)
          .eq("id", input.id)
          .select()
          .single()
      : await supabase
          .from("boletas_garantias")
          .insert(payload)
          .select()
          .single();

    if (error) {
      return {
        success: false,
        error: `Error al guardar Boleta de Garantía en Supabase: ${error.message}`,
      };
    }

    if (data) {
      revalidatePath("/gestion-garantias/boletas-garantias");
      return { success: true, data: data as BoletaGarantia };
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
  return { success: true, data: savedRecord };
  } catch (err: unknown) {
    return {
      success: false,
      error:
        err instanceof Error
          ? err.message
          : "Error inesperado al guardar Boleta de Garantía.",
    };
  }
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
          .from("historial_renovaciones_garantias")
          .select("*")
          .or("tipo_garantia.eq.POLIZA,tipo_documento.eq.POLIZA")
          .not("estado_gestion", "is", null)
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
        rawGestiones = (gestionesRes.data as Array<Record<string, unknown>>)
          .filter((r) => Boolean(r.estado_gestion))
          .map((r) => ({
            id: String(r.id),
            tipo_documento: (String(r.tipo_documento || r.tipo_garantia || "BOLETA") as "BOLETA" | "POLIZA"),
            documento_id: String(r.documento_id || r.garantia_id || ""),
            estado_gestion: String(r.estado_gestion || ""),
            observacion: String(r.observacion || r.descripcion || ""),
            fecha_proximo_seguimiento: r.proximo_seguimiento
              ? String(r.proximo_seguimiento)
              : r.fecha_proximo_seguimiento
              ? String(r.fecha_proximo_seguimiento)
              : null,
            usuario_nombre: r.usuario_nombre ? String(r.usuario_nombre) : null,
            created_at: String(r.created_at || new Date().toISOString()),
          }));
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
    const { estado, diasRestantes } = calculateEstadoGarantia(p.fecha_vencimiento, 30);
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
}): Promise<{ success: boolean; data?: PolizaGarantia; error?: string }> {
  try {
    const auth = await assertCanManage(["garantias_polizas"]);
    if (!auth.authorized) {
      return { success: false, error: auth.error || "Acceso denegado." };
    }

    if (!input.nro_folio.trim()) return { success: false, error: "El N° Folio es obligatorio." };
    if (!input.mandante_id) return { success: false, error: "Debe seleccionar un Mandante." };
    if (!input.compania_id) return { success: false, error: "Debe seleccionar una Compañía." };
    if (!input.motivo.trim()) return { success: false, error: "El motivo es obligatorio." };
    if (input.monto === undefined || input.monto === null || input.monto < 0) {
      return { success: false, error: "El monto debe ser mayor o igual a 0." };
    }
    if (!input.fecha_emision) return { success: false, error: "La fecha de emisión es obligatoria." };
    if (!input.fecha_vencimiento) return { success: false, error: "La fecha de vencimiento es obligatoria." };

  let resolvedCompaniaId = input.compania_id;
  let resolvedBancoId: string | null = null;
  let resolvedBancoEmisor: string | null = null;

  if (resolvedCompaniaId.startsWith("banco:")) {
    const bancoId = resolvedCompaniaId.slice("banco:".length);
    resolvedBancoId = bancoId;
    const localDb = readLocalDb();
    let bancoNombre =
      (localDb.mantenedor_bancos || []).find((b) => b.id === bancoId)?.nombre || "";
    let bancoRut =
      (localDb.mantenedor_bancos || []).find((b) => b.id === bancoId)?.rut || "00000000-0";

    if (isServerSupabaseConfigured()) {
      const supabase = await createServerSupabaseClient();
      if (!bancoNombre) {
        const { data: bRow } = await supabase
          .from("mantenedor_bancos")
          .select("nombre, rut")
          .eq("id", bancoId)
          .maybeSingle();
        if (bRow?.nombre) {
          bancoNombre = String(bRow.nombre);
          bancoRut = bRow.rut ? String(bRow.rut) : bancoRut;
        }
      }
      resolvedBancoEmisor = bancoNombre || null;
      if (bancoNombre) {
        const { data: existingComp } = await supabase
          .from("mantenedor_companias")
          .select("id")
          .ilike("razon_social", bancoNombre)
          .maybeSingle();
        if (existingComp?.id) {
          resolvedCompaniaId = String(existingComp.id);
        } else {
          const { data: createdComp, error: compErr } = await supabase
            .from("mantenedor_companias")
            .insert({
              razon_social: bancoNombre,
              rut_compania: bancoRut || "00000000-0",
            })
            .select("id")
            .single();
          if (compErr || !createdComp?.id) {
            return {
              success: false,
              error: `No se pudo asociar el banco emisor (${bancoNombre}): ${compErr?.message || "error desconocido"}`,
            };
          }
          resolvedCompaniaId = String(createdComp.id);
        }
      }
    } else if (bancoNombre) {
      resolvedBancoEmisor = bancoNombre;
      if (!localDb.mantenedor_companias) localDb.mantenedor_companias = [];
      const existingLocal = localDb.mantenedor_companias.find(
        (c) => c.razon_social.toLowerCase() === bancoNombre.toLowerCase()
      );
      if (existingLocal) {
        resolvedCompaniaId = existingLocal.id;
      } else {
        const newCompId = `comp-${Date.now()}`;
        localDb.mantenedor_companias.push({
          id: newCompId,
          rut: bancoRut,
          rut_compania: bancoRut,
          razon_social: bancoNombre,
          created_at: new Date().toISOString(),
        });
        writeLocalDb(localDb);
        resolvedCompaniaId = newCompId;
      }
    }
  } else if (isServerSupabaseConfigured()) {
    const supabase = await createServerSupabaseClient();
    const { data: compRow } = await supabase
      .from("mantenedor_companias")
      .select("razon_social")
      .eq("id", resolvedCompaniaId)
      .maybeSingle();
    if (compRow?.razon_social) {
      resolvedBancoEmisor = String(compRow.razon_social);
      const { data: bMatch } = await supabase
        .from("mantenedor_bancos")
        .select("id")
        .ilike("nombre", resolvedBancoEmisor)
        .maybeSingle();
      if (bMatch?.id) resolvedBancoId = String(bMatch.id);
    }
  }

  const isClp = input.moneda === "CLP";
  const montoNum = isClp ? Math.round(Number(input.monto)) : Number(input.monto);
  const montoUfNum = isClp
    ? 0
    : input.monto_uf !== undefined && input.monto_uf !== null
    ? Number(input.monto_uf)
    : montoNum;

  const payload = {
    ...(input.id ? { id: input.id } : {}),
    nro_folio: input.nro_folio.trim().toUpperCase(),
    on_proyecto: input.on_proyecto?.trim() || null,
    mandante_id: input.mandante_id,
    compania_id: resolvedCompaniaId,
    ...(resolvedBancoId ? { banco_id: resolvedBancoId } : {}),
    ...(resolvedBancoEmisor ? { banco_emisor: resolvedBancoEmisor } : {}),
    motivo: input.motivo.trim(),
    monto: montoNum,
    monto_uf: montoUfNum,
    moneda: isClp ? ("CLP" as MonedaGarantia) : ("UF" as MonedaGarantia),
    fecha_emision: input.fecha_emision,
    fecha_vencimiento: input.fecha_vencimiento,
    obra: input.obra?.trim() || null,
    proyecto: null,
    contrafianza: input.contrafianza?.trim() || null,
    contrafianza_compania: input.contrafianza_compania?.trim() || null,
    contador_renovaciones: input.contador_renovaciones !== undefined ? Number(input.contador_renovaciones) : 0,
  };

  if (isServerSupabaseConfigured()) {
    const supabase = await createServerSupabaseClient();
    const { data, error } = input.id
      ? await supabase
          .from("polizas_garantias")
          .update(payload)
          .eq("id", input.id)
          .select()
          .single()
      : await supabase
          .from("polizas_garantias")
          .insert(payload)
          .select()
          .single();

    if (error) {
      return {
        success: false,
        error: `Error al guardar Póliza de Garantía en Supabase: ${error.message}`,
      };
    }

    if (data) {
      revalidatePath("/gestion-garantias/polizas-garantias");
      return { success: true, data: data as PolizaGarantia };
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
  return { success: true, data: savedRecord };
  } catch (err: unknown) {
    return {
      success: false,
      error:
        err instanceof Error
          ? err.message
          : "Error inesperado al guardar Póliza de Garantía.",
    };
  }
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
        .from("historial_renovaciones_garantias")
        .select("*")
        .or(`garantia_id.eq.${documentoId},documento_id.eq.${documentoId}`)
        .not("estado_gestion", "is", null)
        .order("created_at", { ascending: false });

      if (!error && data) {
        remoteGestiones = (data as Array<Record<string, unknown>>)
          .filter((r) => Boolean(r.estado_gestion))
          .map((r) => ({
            id: String(r.id),
            tipo_documento: (String(r.tipo_documento || r.tipo_garantia || tipoDocumento) as "BOLETA" | "POLIZA"),
            documento_id: String(r.documento_id || r.garantia_id || documentoId),
            estado_gestion: String(r.estado_gestion || ""),
            observacion: String(r.observacion || r.descripcion || ""),
            fecha_proximo_seguimiento: r.proximo_seguimiento
              ? String(r.proximo_seguimiento)
              : r.fecha_proximo_seguimiento
              ? String(r.fecha_proximo_seguimiento)
              : null,
            usuario_nombre: r.usuario_nombre ? String(r.usuario_nombre) : null,
            created_at: String(r.created_at || new Date().toISOString()),
          }));
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
}): Promise<{ success: boolean; data?: GestionGarantia; error?: string }> {
  try {
    const targetKey =
      input.tipo_documento === "BOLETA" ? "garantias_boletas" : "garantias_polizas";
    const auth = await assertCanManage([targetKey]);
    if (!auth.authorized) {
      return { success: false, error: auth.error || "Acceso denegado." };
    }

    if (!input.documento_id) {
      return { success: false, error: "ID del documento es obligatorio." };
    }
    if (!input.estado_gestion || !input.estado_gestion.trim()) {
      return { success: false, error: "Debe seleccionar el estado de la gestión." };
    }
    if (!input.observacion || !input.observacion.trim()) {
      return { success: false, error: "La descripción / detalle de la gestión es obligatoria." };
    }

    // Capturar el usuario activo en segundo plano
    const session = await getServerUserSession();
    const usuarioNombre = session?.nombre || session?.usuario || "Usuario Sistema";
    const nowIso = new Date().toISOString();

    const supaPayload = {
      garantia_id: String(input.documento_id),
      documento_id: String(input.documento_id),
      tipo_garantia: input.tipo_documento,
      tipo_documento: input.tipo_documento,
      estado_gestion: input.estado_gestion.trim(),
      proximo_seguimiento: input.fecha_proximo_seguimiento?.trim() || null,
      descripcion: input.observacion.trim(),
      observacion: input.observacion.trim(),
      usuario_nombre: usuarioNombre,
    };

    const localEntryBase = {
      tipo_documento: input.tipo_documento,
      documento_id: String(input.documento_id),
      estado_gestion: input.estado_gestion.trim(),
      observacion: input.observacion.trim(),
      fecha_proximo_seguimiento: input.fecha_proximo_seguimiento?.trim() || null,
      usuario_nombre: usuarioNombre,
    };

    if (isServerSupabaseConfigured()) {
      const supabase = await createServerSupabaseClient();
      const { data, error } = await supabase
        .from("historial_renovaciones_garantias")
        .insert(supaPayload)
        .select()
        .single();

      if (error) {
        return {
          success: false,
          error: `Error al registrar gestión de garantía en Supabase: ${error.message}`,
        };
      }

      if (data) {
        const mapped: GestionGarantia = {
          id: String(data.id),
          tipo_documento: input.tipo_documento,
          documento_id: String(data.documento_id || data.garantia_id || input.documento_id),
          estado_gestion: String(data.estado_gestion || localEntryBase.estado_gestion),
          observacion: String(data.observacion || data.descripcion || localEntryBase.observacion),
          fecha_proximo_seguimiento: data.proximo_seguimiento
            ? String(data.proximo_seguimiento)
            : localEntryBase.fecha_proximo_seguimiento,
          usuario_nombre: data.usuario_nombre ? String(data.usuario_nombre) : usuarioNombre,
          created_at: String(data.created_at || nowIso),
        };

        try {
          const db = readLocalDb();
          if (!db.gestiones_garantias) db.gestiones_garantias = [];
          db.gestiones_garantias.unshift(mapped);
          writeLocalDb(db);
        } catch {
          // ignore
        }

        revalidatePath("/gestion-garantias/boletas-garantias");
        revalidatePath("/gestion-garantias/polizas-garantias");
        return { success: true, data: mapped };
      }
    }

    const db = readLocalDb();
    if (!db.gestiones_garantias) {
      db.gestiones_garantias = [];
    }

    const newEntry: GestionGarantia = {
      id: crypto.randomUUID ? crypto.randomUUID() : `gg-${Date.now()}`,
      ...localEntryBase,
      created_at: nowIso,
    };

    db.gestiones_garantias.unshift(newEntry);
    writeLocalDb(db);

    revalidatePath("/gestion-garantias/boletas-garantias");
    revalidatePath("/gestion-garantias/polizas-garantias");
    return { success: true, data: newEntry };
  } catch (err: unknown) {
    return {
      success: false,
      error:
        err instanceof Error
          ? err.message
          : "Error inesperado al registrar gestión de garantía.",
    };
  }
}

