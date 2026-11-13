"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import {
  createServerSupabaseClient,
  isServerSupabaseConfigured,
} from "@/lib/supabase/server";
import { readLocalDb, writeLocalDb } from "@/lib/supabase/local-fallback-db";
import {
  FacturaVenta,
  GestionCobranza,
  PagoFactura,
  TipoGestionCobranza,
} from "@/types/database.types";
import { formatDateCL } from "@/lib/utils";

async function getCurrentSessionUser(): Promise<{ id?: string; nombre: string }> {
  try {
    const cookieStore = await cookies();
    const raw = cookieStore.get("tensacon_session")?.value;
    if (raw) {
      const parsed = JSON.parse(decodeURIComponent(raw));
      return {
        id: parsed.id ? String(parsed.id) : undefined,
        nombre: String(parsed.nombre || parsed.usuario || "Cedrix Vargas"),
      };
    }
  } catch {
    // fallback
  }
  return { nombre: "Cedrix Vargas" };
}

function safeRevalidate(path: string) {
  try {
    revalidatePath(path);
  } catch {
    // Ignorar si se ejecuta fuera del contexto de solicitud de Next.js (ej. scripts o tests)
  }
}

export interface GestionCobranzaConFactura extends GestionCobranza {
  factura_folio: number;
  factura_razon_social: string;
  factura_rut_cliente: string;
  factura_deuda_cliente: number;
}

export interface ResumenSemanaCobranza {
  semanaKey: string; // ej: "2026-W42"
  numeroSemana: number;
  anio: number;
  fechaInicioCL: string; // "12-10-2026"
  fechaFinCL: string; // "18-10-2026"
  tituloSemana: string; // "Semana 42 (12-10-2026 - 18-10-2026)"
  totalGestiones: number;
  montoCarteraGestionada: number;
  totalLlamadas: number;
  totalCorreos: number;
  totalWhatsapp: number;
  gestiones: GestionCobranzaConFactura[];
}

export interface CarteraCobranzaData {
  facturas: FacturaVenta[];
  totalCartera: number; // Suma de deuda_cliente de todas las impagas
  totalConGestion: number; // Suma de deuda_cliente con >= 1 gestión
  totalSinGestion: number; // Suma de deuda_cliente con 0 gestiones
  cantidadTotal: number;
  cantidadConGestion: number;
  cantidadSinGestion: number;
  resumenSemanas: ResumenSemanaCobranza[];
}

/**
 * Obtiene el número de semana ISO y las fechas de lunes a domingo para una fecha dada
 * convirtiendo primero a fecha local de Chile (America/Santiago) sin desfase UTC.
 */
function getIsoWeekInfo(dateInput: Date | string): {
  semanaKey: string;
  numeroSemana: number;
  anio: number;
  fechaInicioCL: string;
  fechaFinCL: string;
  tituloSemana: string;
} {
  const rawDate = new Date(dateInput);
  const safeDate = isNaN(rawDate.getTime()) ? new Date() : rawDate;

  // Fecha local exacta en Chile ("YYYY-MM-DD")
  const fechaRegistroLocal = safeDate.toLocaleDateString("en-CA", {
    timeZone: "America/Santiago",
  });
  const [yStr, mStr, dStr] = fechaRegistroLocal.split("-");
  const y = parseInt(yStr, 10);
  const m = parseInt(mStr, 10);
  const day = parseInt(dStr, 10);

  // Construir fecha calendario pura en UTC (sin desplazamiento horario)
  const calDate = new Date(Date.UTC(y, m - 1, day));

  // Semana ISO
  const target = new Date(Date.UTC(y, m - 1, day));
  const dayNr = (target.getUTCDay() + 6) % 7; // Monday = 0, Sunday = 6
  target.setUTCDate(target.getUTCDate() - dayNr + 3); // Thursday of same week
  const firstThursday = target.getTime();
  target.setUTCMonth(0, 1);
  if (target.getUTCDay() !== 4) {
    target.setUTCMonth(0, 1 + ((4 - target.getUTCDay() + 7) % 7));
  }
  const weekNumber = 1 + Math.ceil((firstThursday - target.getTime()) / 604800000);
  const anio = new Date(firstThursday).getUTCFullYear();

  // Calcular Lunes (inicio) y Domingo (fin) de esta semana en calendario puro
  const currentDay = (calDate.getUTCDay() + 6) % 7;
  const monday = new Date(calDate.getTime());
  monday.setUTCDate(calDate.getUTCDate() - currentDay);
  const sunday = new Date(monday.getTime());
  sunday.setUTCDate(monday.getUTCDate() + 6);

  const formatCL = (dt: Date) => {
    const dd = String(dt.getUTCDate()).padStart(2, "0");
    const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
    const yyyy = dt.getUTCFullYear();
    return `${dd}-${mm}-${yyyy}`;
  };

  const fechaInicioCL = formatCL(monday);
  const fechaFinCL = formatCL(sunday);
  const semanaKey = `${anio}-W${String(weekNumber).padStart(2, "0")}`;
  const tituloSemana = `Semana ${weekNumber} (${fechaInicioCL} al ${fechaFinCL})`;

  return {
    semanaKey,
    numeroSemana: weekNumber,
    anio,
    fechaInicioCL,
    fechaFinCL,
    tituloSemana,
  };
}

/**
 * Consulta la cartera de facturas pendientes de cobro (deuda_cliente > 0 y tipo_doc != 61)
 * asociando todas sus interacciones históricas de cobranza registradas.
 */
export async function getCarteraCobranzaAction(): Promise<CarteraCobranzaData> {
  let allFacturas: FacturaVenta[] = [];
  const gestionesMap = new Map<string, GestionCobranza[]>();
  const allGestionesList: GestionCobranza[] = [];

  if (isServerSupabaseConfigured()) {
    const supabase = await createServerSupabaseClient();

    // Ejecutar las 3 consultas a Supabase en paralelo para minimizar latencia
    const [facturasRes, pagosRes, gestionesRes] = await Promise.all([
      supabase
        .from("facturas_ventas")
        .select("*, empresa_factoring_cliente(*)")
        .neq("tipo_doc", 61)
        .neq("tipo_doc", 46)
        .order("fecha_docto", { ascending: false })
        .order("folio", { ascending: false }),
      supabase.from("pagos_facturas").select("*"),
      supabase
        .from("gestiones_cobranza")
        .select("*")
        .order("created_at", { ascending: false }),
    ]);

    const { data: facturasData, error: facturasErr } = facturasRes;
    if (facturasErr) {
      console.warn("Error consultando facturas en Supabase:", facturasErr.message);
    } else {
      allFacturas = (facturasData as FacturaVenta[]) || [];
    }

    const { data: supaPagos } = pagosRes;
    const pagosMap = new Map<string, PagoFactura[]>();
    if (supaPagos) {
      for (const p of supaPagos as Array<Record<string, unknown>>) {
        const fid = String(p.factura_id || "");
        if (!fid) continue;
        const list = pagosMap.get(fid) || [];
        list.push({
          id: String(p.id),
          factura_id: fid,
          monto_pago: Number(p.monto_pagado ?? p.monto_pago ?? 0),
          fecha_pago: String(p.fecha_pago || ""),
          observacion: (p.observacion || p.comentario || null) as string | null,
          created_at: String(p.created_at || ""),
        });
        pagosMap.set(fid, list);
      }
    }

    const { data: gestionesData, error: gestionesErr } = gestionesRes;

    if (gestionesErr) {
      console.warn("[GestionCobranza] Error consultando gestiones_cobranza:", gestionesErr.message);
    } else if (gestionesData) {
      for (const g of gestionesData as Array<Record<string, unknown>>) {
        const fid = String(g.factura_id || "");
        const item: GestionCobranza = {
          id: String(g.id),
          factura_id: fid,
          tipo_gestion: (String(g.tipo_gestion || "LLAMADA").toUpperCase() as TipoGestionCobranza),
          fecha_compromiso_pago: g.fecha_compromiso_pago ? String(g.fecha_compromiso_pago) : null,
          observaciones: String(g.observaciones || ""),
          contacto_nombre: g.contacto_nombre ? String(g.contacto_nombre) : null,
          contacto_telefono_email: g.contacto_telefono_email ? String(g.contacto_telefono_email) : null,
          usuario_id: g.usuario_id ? String(g.usuario_id) : null,
          usuario_nombre: g.usuario_nombre ? String(g.usuario_nombre) : null,
          created_at: String(g.created_at || new Date().toISOString()),
        };
        allGestionesList.push(item);
        const list = gestionesMap.get(fid) || [];
        list.push(item);
        gestionesMap.set(fid, list);
      }
    }

    // Fallback local merge si existen gestiones en local no replicadas
    const localDb = readLocalDb();
    if (allFacturas.length === 0) {
      allFacturas = localDb.facturas_ventas.filter((f) => Number(f.tipo_doc) !== 61);
    }
    for (const lg of localDb.gestiones_cobranza || []) {
      if (!allGestionesList.some((x) => x.id === lg.id)) {
        allGestionesList.push(lg);
        const list = gestionesMap.get(lg.factura_id) || [];
        list.push(lg);
        gestionesMap.set(lg.factura_id, list);
      }
    }
  } else {
    // Modo Fallback Local
    const localDb = readLocalDb();
    const clientesMap = new Map(
      localDb.empresa_factoring_cliente.map((c) => [c.id, c])
    );

    allFacturas = localDb.facturas_ventas
      .filter((f) => Number(f.tipo_doc) !== 61 && Number(f.tipo_doc) !== 46)
      .map((f) => ({
        ...f,
        empresa_factoring_cliente: f.factoring_cliente_id
          ? clientesMap.get(f.factoring_cliente_id) || null
          : null,
      }));

    for (const g of localDb.gestiones_cobranza || []) {
      allGestionesList.push(g);
      const list = gestionesMap.get(g.factura_id) || [];
      list.push(g);
      gestionesMap.set(g.factura_id, list);
    }
  }

  // Filtrado estricto de la cartera: Solo facturas con deuda pendiente > 0
  // Excluye facturas pagadas a $0 y facturas neteadas con NC a $0
  const pendingFacturas: FacturaVenta[] = [];
  const facturasById = new Map<string, FacturaVenta>();

  for (const f of allFacturas) {
    const deuda =
      f.deuda_cliente !== null && f.deuda_cliente !== undefined
        ? Math.max(0, Number(f.deuda_cliente))
        : Math.max(0, Number(f.monto_neto_saldo ?? f.monto_total ?? 0));

    // Solo incorporar si tiene saldo adeudado
    if (deuda > 0) {
      const fIdStr = String(f.id);
      const gestiones = gestionesMap.get(fIdStr) || [];
      // Ordenar gestiones de la más reciente a la más antigua
      gestiones.sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      const facturaEnriquecida: FacturaVenta = {
        ...f,
        id: fIdStr,
        deuda_cliente: deuda,
        gestiones_cobranza: gestiones,
      };
      pendingFacturas.push(facturaEnriquecida);
      facturasById.set(fIdStr, facturaEnriquecida);
    }
  }

  // Ordenar cartera por saldo pendiente descendente (mayor deuda primero)
  pendingFacturas.sort((a, b) => Number(b.deuda_cliente ?? 0) - Number(a.deuda_cliente ?? 0));

  // Cálculo de KPIs
  let totalCartera = 0;
  let totalConGestion = 0;
  let totalSinGestion = 0;
  let cantidadConGestion = 0;
  let cantidadSinGestion = 0;

  for (const f of pendingFacturas) {
    const deuda = Number(f.deuda_cliente ?? 0);
    totalCartera += deuda;
    const hasGestion = Boolean(f.gestiones_cobranza && f.gestiones_cobranza.length > 0);
    if (hasGestion) {
      totalConGestion += deuda;
      cantidadConGestion += 1;
    } else {
      totalSinGestion += deuda;
      cantidadSinGestion += 1;
    }
  }

  // Agrupación semanal en base a created_at real de la plataforma
  const semanasMap = new Map<
    string,
    {
      info: ReturnType<typeof getIsoWeekInfo>;
      gestiones: GestionCobranzaConFactura[];
      facturasIdsSet: Set<string>;
    }
  >();

  for (const g of allGestionesList) {
    // Si la factura ya no existe o está pagada, igual se respeta la trazabilidad
    const fact = facturasById.get(g.factura_id) || allFacturas.find((x) => x.id === g.factura_id);
    const folio = fact?.folio ?? 0;
    const razonSocial = fact?.razon_social ?? "Cliente no identificado";
    const rutCliente = fact?.rut_cliente ?? "-";
    const deudaCliente = fact ? Number(fact.deuda_cliente ?? fact.monto_neto_saldo ?? 0) : 0;

    const gestionEnriquecida: GestionCobranzaConFactura = {
      ...g,
      factura_folio: folio,
      factura_razon_social: razonSocial,
      factura_rut_cliente: rutCliente,
      factura_deuda_cliente: deudaCliente,
    };

    const weekInfo = getIsoWeekInfo(g.created_at);
    if (!semanasMap.has(weekInfo.semanaKey)) {
      semanasMap.set(weekInfo.semanaKey, {
        info: weekInfo,
        gestiones: [],
        facturasIdsSet: new Set(),
      });
    }

    const item = semanasMap.get(weekInfo.semanaKey)!;
    item.gestiones.push(gestionEnriquecida);
    item.facturasIdsSet.add(g.factura_id);
  }

  const resumenSemanas: ResumenSemanaCobranza[] = [];

  for (const [_, entry] of semanasMap) {
    // Ordenar gestiones de la semana por fecha decreciente
    entry.gestiones.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    let totalLlamadas = 0;
    let totalCorreos = 0;
    let totalWhatsapp = 0;

    for (const g of entry.gestiones) {
      if (g.tipo_gestion === "LLAMADA") totalLlamadas += 1;
      else if (g.tipo_gestion === "CORREO") totalCorreos += 1;
      else if (g.tipo_gestion === "WHATSAPP") totalWhatsapp += 1;
    }

    // Monto de cartera gestionada: suma de deuda de las facturas gestionadas en esa semana
    let montoCarteraGestionada = 0;
    for (const fid of entry.facturasIdsSet) {
      const f = facturasById.get(fid) || allFacturas.find((x) => x.id === fid);
      if (f) {
        montoCarteraGestionada += Number(f.deuda_cliente ?? f.monto_neto_saldo ?? 0);
      }
    }

    resumenSemanas.push({
      semanaKey: entry.info.semanaKey,
      numeroSemana: entry.info.numeroSemana,
      anio: entry.info.anio,
      fechaInicioCL: entry.info.fechaInicioCL,
      fechaFinCL: entry.info.fechaFinCL,
      tituloSemana: entry.info.tituloSemana,
      totalGestiones: entry.gestiones.length,
      montoCarteraGestionada,
      totalLlamadas,
      totalCorreos,
      totalWhatsapp,
      gestiones: entry.gestiones,
    });
  }

  // Ordenar semanas de la más reciente a la más antigua
  resumenSemanas.sort((a, b) => {
    if (a.anio !== b.anio) return b.anio - a.anio;
    return b.numeroSemana - a.numeroSemana;
  });

  return {
    facturas: pendingFacturas,
    totalCartera,
    totalConGestion,
    totalSinGestion,
    cantidadTotal: pendingFacturas.length,
    cantidadConGestion,
    cantidadSinGestion,
    resumenSemanas,
  };
}

export interface RegistrarGestionInput {
  facturaId: string;
  tipoGestion: TipoGestionCobranza;
  fechaCompromisoPago?: string | null;
  observaciones: string;
  contactoNombre?: string | null;
  contactoTelefonoEmail?: string | null;
  usuarioId?: string | null;
  usuarioNombre?: string | null;
}

/**
 * Registra una nueva gestión de cobranza asociada a una factura
 */
export async function registrarGestionCobranzaAction(
  input: RegistrarGestionInput
): Promise<{ success: boolean; gestion?: GestionCobranza; error?: string }> {
  try {
    if (!input.facturaId) {
      return { success: false, error: "ID de factura requerido." };
    }
    if (!input.observaciones || !input.observaciones.trim()) {
      return {
        success: false,
        error: "Debe ingresar una observación o nota sobre la gestión realizada.",
      };
    }

    const sessionUser = await getCurrentSessionUser();
    const activeUserId = input.usuarioId || sessionUser.id || null;
    const defaultUser = input.usuarioNombre?.trim() || sessionUser.nombre || "Cedrix Vargas";

    const nowIso = new Date().toISOString();
    const cleanCompromiso = input.fechaCompromisoPago?.trim() || null;

    const newGestion: GestionCobranza = {
      id: `gc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      factura_id: input.facturaId,
      tipo_gestion: input.tipoGestion,
      fecha_compromiso_pago: cleanCompromiso,
      observaciones: input.observaciones.trim(),
      contacto_nombre: input.contactoNombre?.trim() || null,
      contacto_telefono_email: input.contactoTelefonoEmail?.trim() || null,
      usuario_id: activeUserId,
      usuario_nombre: defaultUser,
      created_at: nowIso,
    };

    if (isServerSupabaseConfigured()) {
      const supabase = await createServerSupabaseClient();
      const { data, error } = await supabase
        .from("gestiones_cobranza")
        .insert({
          factura_id: String(input.facturaId),
          tipo_gestion: String(input.tipoGestion).toUpperCase(),
          fecha_compromiso_pago: cleanCompromiso,
          observaciones: input.observaciones.trim(),
          contacto_nombre: input.contactoNombre?.trim() || null,
          contacto_telefono_email: input.contactoTelefonoEmail?.trim() || null,
          usuario_id: activeUserId,
          usuario_nombre: defaultUser,
          created_at: nowIso,
        })
        .select()
        .single();

      if (error) {
        console.error("[GestionCobranza] Error insertando:", error.message);
        throw new Error(`Error al guardar gestión: ${error.message}`);
      } else if (data) {
        newGestion.id = String(data.id);
        newGestion.created_at = String(data.created_at || nowIso);
        // Mantener espejo en fallback local
        const db = readLocalDb();
        if (!db.gestiones_cobranza) db.gestiones_cobranza = [];
        db.gestiones_cobranza.unshift(newGestion);
        writeLocalDb(db);
      }
    } else {
      const db = readLocalDb();
      if (!db.gestiones_cobranza) db.gestiones_cobranza = [];
      db.gestiones_cobranza.unshift(newGestion);
      writeLocalDb(db);
    }

    safeRevalidate("/ventas-tensacon/gestion-cobranza");
    safeRevalidate("/finanzas/facturas-ventas");
    return { success: true, gestion: newGestion };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error inesperado al registrar gestión";
    return { success: false, error: msg };
  }
}

export interface RegistrarGestionLoteInput {
  facturaIds: string[];
  tipoGestion: TipoGestionCobranza;
  fechaCompromisoPago?: string | null;
  observaciones: string;
  contactoNombre?: string | null;
  contactoTelefonoEmail?: string | null;
  usuarioId?: string | null;
  usuarioNombre?: string | null;
}

/**
 * Registra una misma gestión de cobranza en lote para múltiples facturas
 */
export async function registrarGestionCobranzaLoteAction(
  input: RegistrarGestionLoteInput
): Promise<{ success: boolean; count: number; error?: string }> {
  try {
    if (!input.facturaIds || input.facturaIds.length === 0) {
      return {
        success: false,
        count: 0,
        error: "Debe seleccionar al menos una factura para registrar la gestión en lote.",
      };
    }
    if (!input.observaciones || !input.observaciones.trim()) {
      return {
        success: false,
        count: 0,
        error: "Debe ingresar una observación o nota sobre la gestión realizada.",
      };
    }

    const sessionUser = await getCurrentSessionUser();
    const activeUserId = input.usuarioId || sessionUser.id || null;
    const activeUserName = input.usuarioNombre?.trim() || sessionUser.nombre || "Cedrix Vargas";
    const nowIso = new Date().toISOString();
    const cleanCompromiso = input.fechaCompromisoPago?.trim() || null;

    const newGestiones: GestionCobranza[] = input.facturaIds.map((facturaId, idx) => ({
      id: `gc-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      factura_id: facturaId,
      tipo_gestion: input.tipoGestion,
      fecha_compromiso_pago: cleanCompromiso,
      observaciones: input.observaciones.trim(),
      contacto_nombre: input.contactoNombre?.trim() || null,
      contacto_telefono_email: input.contactoTelefonoEmail?.trim() || null,
      usuario_id: activeUserId,
      usuario_nombre: activeUserName,
      created_at: nowIso,
    }));

    if (isServerSupabaseConfigured()) {
      const supabase = await createServerSupabaseClient();
      const recordsToInsert = input.facturaIds.map((facturaId) => ({
        factura_id: String(facturaId),
        tipo_gestion: String(input.tipoGestion).toUpperCase(),
        fecha_compromiso_pago: cleanCompromiso,
        observaciones: input.observaciones.trim(),
        contacto_nombre: input.contactoNombre?.trim() || null,
        contacto_telefono_email: input.contactoTelefonoEmail?.trim() || null,
        usuario_id: activeUserId,
        usuario_nombre: activeUserName,
        created_at: nowIso,
      }));

      const { data, error } = await supabase
        .from("gestiones_cobranza")
        .insert(recordsToInsert)
        .select();

      if (error) {
        throw new Error(`Error al registrar gestiones de cobranza en Supabase: ${error.message}`);
      } else if (data) {
        const db = readLocalDb();
        if (!db.gestiones_cobranza) db.gestiones_cobranza = [];
        const syncedGestiones = (data as Array<Record<string, unknown>>).map((d) => ({
          id: String(d.id),
          factura_id: String(d.factura_id),
          tipo_gestion: (d.tipo_gestion as TipoGestionCobranza) || input.tipoGestion,
          fecha_compromiso_pago: d.fecha_compromiso_pago ? String(d.fecha_compromiso_pago) : null,
          observaciones: String(d.observaciones || input.observaciones.trim()),
          contacto_nombre: d.contacto_nombre ? String(d.contacto_nombre) : null,
          contacto_telefono_email: d.contacto_telefono_email ? String(d.contacto_telefono_email) : null,
          usuario_id: d.usuario_id ? String(d.usuario_id) : activeUserId,
          usuario_nombre: d.usuario_nombre ? String(d.usuario_nombre) : activeUserName,
          created_at: String(d.created_at || nowIso),
        }));
        db.gestiones_cobranza.unshift(...syncedGestiones);
        writeLocalDb(db);
      }
    } else {
      const db = readLocalDb();
      if (!db.gestiones_cobranza) db.gestiones_cobranza = [];
      db.gestiones_cobranza.unshift(...newGestiones);
      writeLocalDb(db);
    }

    safeRevalidate("/ventas-tensacon/gestion-cobranza");
    safeRevalidate("/finanzas/facturas-ventas");
    return { success: true, count: input.facturaIds.length };
  } catch (err: unknown) {
    const msg =
      err instanceof Error ? err.message : "Error inesperado al registrar gestión en lote";
    return { success: false, count: 0, error: msg };
  }
}
