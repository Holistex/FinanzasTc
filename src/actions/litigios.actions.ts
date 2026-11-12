"use server";

import { revalidatePath } from "next/cache";
import {
  createServerSupabaseClient,
  isServerSupabaseConfigured,
} from "@/lib/supabase/server";
import { readLocalDb, writeLocalDb } from "@/lib/supabase/local-fallback-db";

function safeRevalidatePath(path: string) {
  try {
    revalidatePath(path);
  } catch {
    // Graceful fallback when executed outside Next.js request store (e.g. CLI/tests)
  }
}
import {
  LitigioMulta,
  LitigioJuicio,
  LitigioAudienciaJuicio,
  EstadoLitigioMulta,
  EstadoLitigioJuicio,
  LitigiosMultasKpis,
  LitigiosJuiciosKpis,
  EventoCalendarioLitigio,
  CalendarioLitigiosKpis,
  TipoEventoCalendarioLitigio,
  LitigioComparendo,
  CuotaComparendo,
  EstadoComparendo,
  EstadoCuotaComparendo,
  LitigiosComparendosKpis,
  ComparendosFilterParams,
} from "@/types/database.types";

export interface CalendarioFilterParams {
  query?: string;
  tipo?: TipoEventoCalendarioLitigio | "TODOS";
  mes?: string;
  estado?: string | "TODOS";
}

export interface MultasFilterParams {
  query?: string;
  estado?: EstadoLitigioMulta | "TODOS";
  procedencia?: string | "TODAS";
}

export interface JuiciosFilterParams {
  query?: string;
  estado?: EstadoLitigioJuicio | "TODOS";
  materia?: string | "TODAS";
}

// ============================================================================
// 1. SUBMÓDULO: MULTAS
// ============================================================================

export async function getLitigiosMultasAction(
  filters?: MultasFilterParams
): Promise<{ items: LitigioMulta[]; kpis: LitigiosMultasKpis }> {
  let rawItems: LitigioMulta[] = [];

  if (isServerSupabaseConfigured()) {
    try {
      const supabase = await createServerSupabaseClient();
      const { data, error } = await supabase
        .from("litigios_multas")
        .select("*")
        .order("fecha_publicacion", { ascending: false });

      if (!error && data) {
        rawItems = data as LitigioMulta[];
      }
    } catch {
      // Fallback local DB
    }
  }

  if (rawItems.length === 0) {
    const db = readLocalDb();
    rawItems = [...(db.litigios_multas || [])];
  }

  // Calcular KPIs con todos los registros
  const kpis: LitigiosMultasKpis = {
    totalMultas: rawItems.length,
    montoTotalSancion: 0,
    pendientesCount: 0,
    montoPendiente: 0,
    pagadasCount: 0,
    montoPagado: 0,
  };

  for (const m of rawItems) {
    const monto = Number(m.monto_sancion || 0);
    kpis.montoTotalSancion += monto;
    if (m.estado === "PENDIENTE") {
      kpis.pendientesCount++;
      kpis.montoPendiente += monto;
    } else if (m.estado === "PAGADA") {
      kpis.pagadasCount++;
      kpis.montoPagado += monto;
    }
  }

  // Aplicar filtros
  let items = [...rawItems];

  if (filters?.estado && filters.estado !== "TODOS") {
    items = items.filter((m) => m.estado === filters.estado);
  }

  if (filters?.procedencia && filters.procedencia !== "TODAS") {
    items = items.filter((m) =>
      m.procedencia.toLowerCase().includes(filters.procedencia!.toLowerCase())
    );
  }

  if (filters?.query) {
    const q = filters.query.trim().toLowerCase();
    items = items.filter(
      (m) =>
        m.procedencia.toLowerCase().includes(q) ||
        (m.entidad || "").toLowerCase().includes(q) ||
        m.nro_multa.toLowerCase().includes(q) ||
        (m.nro_resolucion || "").toLowerCase().includes(q) ||
        (m.observaciones || "").toLowerCase().includes(q)
    );
  }

  items.sort((a, b) => b.fecha_publicacion.localeCompare(a.fecha_publicacion));

  return { items, kpis };
}

export async function upsertLitigioMultaAction(input: {
  id?: string;
  procedencia: string;
  entidad?: string | null;
  nro_multa: string;
  fecha_publicacion: string;
  monto_sancion: number;
  nro_resolucion?: string | null;
  fecha_resolucion?: string | null;
  fecha_pago?: string | null;
  estado: EstadoLitigioMulta;
  observaciones?: string | null;
}): Promise<LitigioMulta> {
  if (!input.procedencia.trim()) throw new Error("La procedencia o causal es obligatoria.");
  if (!input.nro_multa.trim()) throw new Error("El N° de Multa es obligatorio.");
  if (!input.fecha_publicacion) throw new Error("La fecha de publicación es obligatoria.");
  if (input.monto_sancion === undefined || input.monto_sancion === null || input.monto_sancion < 0) {
    throw new Error("El monto de sanción debe ser mayor o igual a 0.");
  }

  const payload = {
    ...(input.id ? { id: input.id } : {}),
    procedencia: input.procedencia.trim(),
    entidad: input.entidad?.trim() || "Dirección del Trabajo",
    nro_multa: input.nro_multa.trim().toUpperCase(),
    fecha_publicacion: input.fecha_publicacion,
    monto_sancion: Number(input.monto_sancion),
    nro_resolucion: input.nro_resolucion?.trim() || null,
    fecha_resolucion: input.fecha_resolucion || null,
    fecha_pago: input.estado === "PAGADA" ? (input.fecha_pago || new Date().toISOString().slice(0, 10)) : null,
    estado: input.estado || "PENDIENTE",
    observaciones: input.observaciones?.trim() || null,
    updated_at: new Date().toISOString(),
  };

  if (isServerSupabaseConfigured()) {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("litigios_multas")
      .upsert(payload)
      .select()
      .single();

    if (error) {
      throw new Error(`Error al guardar Multa en Supabase: ${error.message}`);
    }

    if (data) {
      safeRevalidatePath("/reg-litigios/multas");
      return data as LitigioMulta;
    }
  }

  const db = readLocalDb();
  if (!db.litigios_multas) db.litigios_multas = [];

  const existingIndex = input.id
    ? db.litigios_multas.findIndex((m) => m.id === input.id)
    : db.litigios_multas.findIndex((m) => m.nro_multa === payload.nro_multa);

  const nowIso = new Date().toISOString();
  let savedRecord: LitigioMulta;

  if (existingIndex >= 0) {
    savedRecord = {
      ...db.litigios_multas[existingIndex],
      ...payload,
    };
    db.litigios_multas[existingIndex] = savedRecord;
  } else {
    savedRecord = {
      id: input.id || `mul-${Date.now()}`,
      ...payload,
      created_at: nowIso,
    };
    db.litigios_multas.push(savedRecord);
  }

  writeLocalDb(db);
  safeRevalidatePath("/reg-litigios/multas");
  return savedRecord;
}

export async function deleteLitigioMultaAction(_id: string): Promise<void> {
  throw new Error(
    "La eliminación de multas está estrictamente prohibida para resguardar la trazabilidad financiera y auditoría legal."
  );
}

// ============================================================================
// 2. SUBMÓDULO: JUICIOS
// ============================================================================
// 2. SUBMÓDULO: JUICIOS Y BITÁCORA DE AUDIENCIAS
// ============================================================================

export async function getAudienciasByJuicioAction(
  juicioId: string
): Promise<LitigioAudienciaJuicio[]> {
  if (!juicioId) return [];

  if (isServerSupabaseConfigured()) {
    try {
      const supabase = await createServerSupabaseClient();
      const { data, error } = await supabase
        .from("litigios_audiencias_juicio")
        .select("*")
        .eq("juicio_id", juicioId)
        .order("numero_audiencia", { ascending: true });

      if (!error && data && data.length > 0) {
        return data as LitigioAudienciaJuicio[];
      }
    } catch {
      // Fallback local DB
    }
  }

  const db = readLocalDb();
  const list = (db.litigios_audiencias_juicio || []).filter(
    (a) => a.juicio_id === juicioId
  );
  list.sort((a, b) => a.numero_audiencia - b.numero_audiencia);
  return list;
}

export async function upsertAudienciaJuicioAction(input: {
  id?: string;
  juicio_id: string;
  numero_audiencia?: number;
  fecha_audiencia: string;
  resultado_dictamen?: string | null;
}): Promise<LitigioAudienciaJuicio> {
  if (!input.juicio_id) throw new Error("El ID del juicio es obligatorio.");
  if (!input.fecha_audiencia) throw new Error("La fecha de la audiencia es obligatoria.");

  // Calcular correlativo si no viene especificado
  let numAudiencia = input.numero_audiencia;
  if (!numAudiencia || numAudiencia <= 0) {
    const prevList = await getAudienciasByJuicioAction(input.juicio_id);
    if (input.id) {
      const existing = prevList.find((a) => a.id === input.id);
      numAudiencia = existing?.numero_audiencia || prevList.length;
    } else {
      numAudiencia = prevList.length + 1;
    }
  }

  const resultadoLimpio = (input.resultado_dictamen || "").trim();

  const payload = {
    ...(input.id ? { id: input.id } : {}),
    juicio_id: input.juicio_id,
    numero_audiencia: numAudiencia,
    fecha_audiencia: input.fecha_audiencia,
    resultado_dictamen: resultadoLimpio || "Pendiente de dictamen",
    updated_at: new Date().toISOString(),
  };

  if (isServerSupabaseConfigured()) {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("litigios_audiencias_juicio")
      .upsert(payload)
      .select()
      .single();

    if (error) {
      throw new Error(`Error al guardar Audiencia en Supabase: ${error.message}`);
    }

    if (data) {
      safeRevalidatePath("/reg-litigios/juicios");
      return data as LitigioAudienciaJuicio;
    }
  }

  const db = readLocalDb();
  if (!db.litigios_audiencias_juicio) db.litigios_audiencias_juicio = [];

  const existingIdx = input.id
    ? db.litigios_audiencias_juicio.findIndex((a) => a.id === input.id)
    : -1;

  let savedRecord: LitigioAudienciaJuicio;
  const nowIso = new Date().toISOString();

  if (existingIdx >= 0) {
    savedRecord = {
      ...db.litigios_audiencias_juicio[existingIdx],
      ...payload,
    };
    db.litigios_audiencias_juicio[existingIdx] = savedRecord;
  } else {
    savedRecord = {
      id: input.id || `aud-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      ...payload,
      created_at: nowIso,
    };
    db.litigios_audiencias_juicio.push(savedRecord);
  }

  writeLocalDb(db);
  safeRevalidatePath("/reg-litigios/juicios");
  return savedRecord;
}

export async function deleteAudienciaJuicioAction(
  audienciaId: string,
  juicioId?: string
): Promise<void> {
  if (!audienciaId) throw new Error("El ID de la audiencia es obligatorio.");

  if (isServerSupabaseConfigured()) {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase
      .from("litigios_audiencias_juicio")
      .delete()
      .eq("id", audienciaId);

    if (error) {
      throw new Error(`Error al eliminar Audiencia en Supabase: ${error.message}`);
    }
    safeRevalidatePath("/reg-litigios/juicios");
  }

  const db = readLocalDb();
  if (db.litigios_audiencias_juicio) {
    const target = db.litigios_audiencias_juicio.find((a) => a.id === audienciaId);
    const jId = juicioId || target?.juicio_id;

    db.litigios_audiencias_juicio = db.litigios_audiencias_juicio.filter(
      (a) => a.id !== audienciaId
    );

    if (jId) {
      const remaining = db.litigios_audiencias_juicio
        .filter((a) => a.juicio_id === jId)
        .sort((a, b) => a.fecha_audiencia.localeCompare(b.fecha_audiencia));
      remaining.forEach((a, idx) => {
        a.numero_audiencia = idx + 1;
      });
    }

    writeLocalDb(db);
  }

  safeRevalidatePath("/reg-litigios/juicios");
}

export const deleteAudienciaAction = deleteAudienciaJuicioAction;
export const updateAudienciaAction = upsertAudienciaJuicioAction;

export async function getLitigiosJuiciosAction(
  filters?: JuiciosFilterParams
): Promise<{ items: LitigioJuicio[]; kpis: LitigiosJuiciosKpis }> {
  let rawItems: LitigioJuicio[] = [];
  let allAudiencias: LitigioAudienciaJuicio[] = [];

  if (isServerSupabaseConfigured()) {
    try {
      const supabase = await createServerSupabaseClient();
      const [{ data: jData, error: jErr }, { data: aData }] = await Promise.all([
        supabase
          .from("litigios_juicios")
          .select("*")
          .order("created_at", { ascending: false }),
        supabase
          .from("litigios_audiencias_juicio")
          .select("*")
          .order("fecha_audiencia", { ascending: true }),
      ]);

      if (!jErr && jData) {
        rawItems = jData as LitigioJuicio[];
      }
      if (aData) {
        allAudiencias = aData as LitigioAudienciaJuicio[];
      }
    } catch {
      // Fallback local DB
    }
  }

  if (rawItems.length === 0) {
    const db = readLocalDb();
    rawItems = [...(db.litigios_juicios || [])];
    allAudiencias = [...(db.litigios_audiencias_juicio || [])];
  }

  // Asociar audiencias y calcular última audiencia por causa
  for (const j of rawItems) {
    j.cuantia_clp = j.cuantia_clp !== undefined ? Number(j.cuantia_clp) : Number(j.cuantia || 0);
    j.cuantia = j.cuantia_clp;

    let juicAudiencias = allAudiencias.filter((a) => a.juicio_id === j.id);

    // Si aún no tiene audiencias en la nueva tabla, pero tiene campos legacy en litigios_juicios:
    if (juicAudiencias.length === 0) {
      if (j.primera_audiencia_fecha) {
        juicAudiencias.push({
          id: `aud-leg-1-${j.id}`,
          juicio_id: j.id,
          numero_audiencia: 1,
          fecha_audiencia: j.primera_audiencia_fecha,
          resultado_dictamen: j.primera_audiencia_resultado || "Audiencia registrada",
          created_at: j.created_at || new Date().toISOString(),
        });
      }
      if (j.segunda_audiencia_fecha) {
        juicAudiencias.push({
          id: `aud-leg-2-${j.id}`,
          juicio_id: j.id,
          numero_audiencia: 2,
          fecha_audiencia: j.segunda_audiencia_fecha,
          resultado_dictamen: j.segunda_audiencia_resultado || "Audiencia registrada",
          created_at: j.created_at || new Date().toISOString(),
        });
      }
    }

    // Ordenar correlativamente por número de audiencia
    juicAudiencias.sort((a, b) => a.numero_audiencia - b.numero_audiencia);
    j.audiencias = juicAudiencias;

    // Determinar última audiencia realizada
    if (juicAudiencias.length > 0) {
      // Ordenar por fecha_audiencia desc para obtener la más reciente
      const sortedByDate = [...juicAudiencias].sort((a, b) =>
        b.fecha_audiencia.localeCompare(a.fecha_audiencia)
      );
      j.ultima_audiencia = sortedByDate[0];
    } else {
      j.ultima_audiencia = null;
    }
  }

  // Calcular KPIs con todos los registros
  const kpis: LitigiosJuiciosKpis = {
    totalJuicios: rawItems.length,
    cuantiaTotal: 0,
    enTramitacionCount: 0,
    cuantiaEnTramitacion: 0,
    concluidosCount: 0,
    cuantiaConcluida: 0,
  };

  for (const j of rawItems) {
    const monto = Number(j.cuantia_clp || j.cuantia || 0);
    kpis.cuantiaTotal += monto;
    if (j.estado === "PENDIENTE") {
      kpis.enTramitacionCount++;
      kpis.cuantiaEnTramitacion += monto;
    } else {
      kpis.concluidosCount++;
      kpis.cuantiaConcluida += monto;
    }
  }

  // Aplicar filtros
  let items = [...rawItems];

  if (filters?.estado && filters.estado !== "TODOS") {
    if (filters.estado === "CONCLUIDO") {
      items = items.filter((j) => j.estado === "CONCLUIDO" || j.estado === "PAGADA");
    } else {
      items = items.filter((j) => j.estado === filters.estado);
    }
  }

  if (filters?.materia && filters.materia !== "TODAS") {
    items = items.filter((j) =>
      j.materia.toLowerCase().includes(filters.materia!.toLowerCase())
    );
  }

  if (filters?.query) {
    const q = filters.query.trim().toLowerCase();
    items = items.filter(
      (j) =>
        j.rit_ruc.toLowerCase().includes(q) ||
        j.nombre_trabajador.toLowerCase().includes(q) ||
        j.materia.toLowerCase().includes(q) ||
        (j.observaciones || "").toLowerCase().includes(q) ||
        (j.ultima_audiencia?.resultado_dictamen || "").toLowerCase().includes(q) ||
        (j.audiencias || []).some((a) => (a.resultado_dictamen || "").toLowerCase().includes(q))
    );
  }

  return { items, kpis };
}

export interface AudienciaInputItem {
  id?: string;
  numero_audiencia?: number;
  fecha_audiencia: string;
  resultado_dictamen?: string | null;
}

export interface UpsertLitigioJuicioInput {
  id?: string;
  rit_ruc: string;
  nombre_trabajador: string;
  materia: string;
  cuantia: number;
  cuantia_clp?: number;
  estado: EstadoLitigioJuicio;
  observaciones?: string | null;
  audiencias?: AudienciaInputItem[];
}

export async function upsertLitigioJuicioAction(
  input: UpsertLitigioJuicioInput
): Promise<LitigioJuicio> {
  if (!input.rit_ruc.trim()) throw new Error("El RIT-RUC de la causa es obligatorio.");
  if (!input.nombre_trabajador.trim()) throw new Error("El nombre del trabajador/demandante es obligatorio.");
  if (!input.materia.trim()) throw new Error("La materia de la demanda es obligatoria.");

  const cuantiaVal = Number(input.cuantia_clp !== undefined ? input.cuantia_clp : input.cuantia || 0);

  const payload = {
    ...(input.id ? { id: input.id } : {}),
    rit_ruc: input.rit_ruc.trim().toUpperCase(),
    nombre_trabajador: input.nombre_trabajador.trim(),
    materia: input.materia.trim(),
    cuantia: cuantiaVal,
    cuantia_clp: cuantiaVal,
    estado: input.estado || "PENDIENTE",
    observaciones: input.observaciones?.trim() || null,
    updated_at: new Date().toISOString(),
  };

  let savedJuicioId = input.id;

  if (isServerSupabaseConfigured()) {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("litigios_juicios")
      .upsert(payload)
      .select()
      .single();

    if (error) {
      throw new Error(`Error al guardar Juicio en Supabase: ${error.message}`);
    }

    if (data) {
      savedJuicioId = data.id;

      // Guardar audiencias asociadas si vienen en el input
      if (input.audiencias && input.audiencias.length > 0) {
        for (let i = 0; i < input.audiencias.length; i++) {
          const a = input.audiencias[i];
          const { error: audErr } = await supabase.from("litigios_audiencias_juicio").upsert({
            ...(a.id ? { id: a.id } : {}),
            juicio_id: savedJuicioId,
            numero_audiencia: a.numero_audiencia || i + 1,
            fecha_audiencia: a.fecha_audiencia,
            resultado_dictamen: (a.resultado_dictamen || "").trim() || "Pendiente de dictamen",
            updated_at: new Date().toISOString(),
          });
          if (audErr) {
            throw new Error(`Error al guardar Audiencia del juicio en Supabase: ${audErr.message}`);
          }
        }
      }

      safeRevalidatePath("/reg-litigios/juicios");
      return data as LitigioJuicio;
    }
  }

  const db = readLocalDb();
  if (!db.litigios_juicios) db.litigios_juicios = [];
  if (!db.litigios_audiencias_juicio) db.litigios_audiencias_juicio = [];

  const existingIndex = input.id
    ? db.litigios_juicios.findIndex((j) => j.id === input.id)
    : db.litigios_juicios.findIndex((j) => j.rit_ruc === payload.rit_ruc);

  const nowIso = new Date().toISOString();
  let savedRecord: LitigioJuicio;

  if (existingIndex >= 0) {
    savedRecord = {
      ...db.litigios_juicios[existingIndex],
      ...payload,
    };
    db.litigios_juicios[existingIndex] = savedRecord;
    savedJuicioId = savedRecord.id;
  } else {
    savedRecord = {
      id: input.id || `jui-${Date.now()}`,
      ...payload,
      created_at: nowIso,
    };
    db.litigios_juicios.push(savedRecord);
    savedJuicioId = savedRecord.id;
  }

  // Guardar audiencias asociadas en local DB
  if (input.audiencias && input.audiencias.length > 0) {
    const list: AudienciaInputItem[] = input.audiencias;
    for (let i = 0; i < list.length; i++) {
      const audItem: AudienciaInputItem = list[i];
      const targetId: string | undefined = audItem.id;
      const audIdx: number = targetId
        ? db.litigios_audiencias_juicio.findIndex((item) => item.id === targetId)
        : -1;

      const audPayload: LitigioAudienciaJuicio = {
        id: targetId || `aud-${Date.now()}-${i}`,
        juicio_id: savedJuicioId!,
        numero_audiencia: audItem.numero_audiencia || i + 1,
        fecha_audiencia: audItem.fecha_audiencia,
        resultado_dictamen: (audItem.resultado_dictamen || "").trim() || "Pendiente de dictamen",
        created_at: nowIso,
        updated_at: nowIso,
      };

      if (audIdx >= 0) {
        db.litigios_audiencias_juicio[audIdx] = {
          ...db.litigios_audiencias_juicio[audIdx],
          ...audPayload,
        };
      } else {
        db.litigios_audiencias_juicio.push(audPayload);
      }
    }
  }

  writeLocalDb(db);
  safeRevalidatePath("/reg-litigios/juicios");
  return savedRecord;
}

export async function deleteLitigioJuicioAction(_id: string): Promise<void> {
  throw new Error(
    "La eliminación de causas o juicios está estrictamente prohibida por políticas de auditoría y trazabilidad legal."
  );
}

// ============================================================================
// 3. SUBMÓDULO: CALENDARIO DE LITIGIOS, AUDIENCIAS Y MULTAS
// ============================================================================

export async function getCalendarioLitigiosAction(
  filters?: CalendarioFilterParams
): Promise<{ items: EventoCalendarioLitigio[]; kpis: CalendarioLitigiosKpis }> {
  let events: EventoCalendarioLitigio[] = [];

  if (isServerSupabaseConfigured()) {
    try {
      const supabase = await createServerSupabaseClient();
      // Intentar primero desde la vista unificada si existe
      const { data: viewData, error: viewError } = await supabase
        .from("vista_calendario_litigios")
        .select("*")
        .order("fecha_evento", { ascending: true });

      if (!viewError && viewData && viewData.length > 0) {
        events = viewData.map((row: any) => ({
          evento_id: row.evento_id || row.id,
          tipo_evento: row.tipo_evento,
          identificador: row.identificador,
          titulo: row.titulo,
          detalle: row.detalle,
          fecha_evento: row.fecha_evento,
          estado_general: row.estado_general || "PENDIENTE",
          ruta_origen:
            row.ruta_origen ||
            (row.tipo_evento === "MULTA"
              ? "/reg-litigios/multas"
              : "/reg-litigios/juicios"),
          monto: row.monto ? Number(row.monto) : undefined,
          entidad_o_materia: row.entidad_o_materia,
          observaciones: row.observaciones,
        }));
      }
    } catch {
      // Fallback local DB / tablas directas
    }
  }

  // Si no se obtuvieron eventos desde la vista de Supabase, consolidar localmente
  if (events.length === 0) {
    const db = readLocalDb();
    const juicios = db.litigios_juicios || [];
    const audiencias = db.litigios_audiencias_juicio || [];
    const multas = db.litigios_multas || [];

    // 1. Audiencias de Juicios
    for (const aud of audiencias) {
      const juicio = juicios.find((j) => j.id === aud.juicio_id);
      if (juicio && aud.fecha_audiencia) {
        const monto =
          juicio.cuantia_clp !== undefined ? juicio.cuantia_clp : juicio.cuantia;
        events.push({
          evento_id: aud.id,
          tipo_evento: "AUDIENCIA_JUICIO",
          identificador: juicio.rit_ruc,
          titulo: juicio.nombre_trabajador,
          detalle: `${aud.numero_audiencia}° Audiencia - ${aud.resultado_dictamen || "Pendiente de celebración"}`,
          fecha_evento: aud.fecha_audiencia,
          estado_general: juicio.estado,
          ruta_origen: "/reg-litigios/juicios",
          monto: monto ? Number(monto) : undefined,
          entidad_o_materia: juicio.materia,
          observaciones: juicio.observaciones,
        });
      }
    }

    // Audiencias legacy en litigios_juicios si no tenían registros en audiencias
    for (const j of juicios) {
      const hasAuds = audiencias.some((a) => a.juicio_id === j.id);
      if (!hasAuds) {
        const monto = j.cuantia_clp !== undefined ? j.cuantia_clp : j.cuantia;
        if (j.primera_audiencia_fecha) {
          events.push({
            evento_id: `aud-leg-1-${j.id}`,
            tipo_evento: "AUDIENCIA_JUICIO",
            identificador: j.rit_ruc,
            titulo: j.nombre_trabajador,
            detalle: `1° Audiencia - ${j.primera_audiencia_resultado || "Audiencia registrada"}`,
            fecha_evento: j.primera_audiencia_fecha,
            estado_general: j.estado,
            ruta_origen: "/reg-litigios/juicios",
            monto: monto ? Number(monto) : undefined,
            entidad_o_materia: j.materia,
            observaciones: j.observaciones,
          });
        }
        if (j.segunda_audiencia_fecha) {
          events.push({
            evento_id: `aud-leg-2-${j.id}`,
            tipo_evento: "AUDIENCIA_JUICIO",
            identificador: j.rit_ruc,
            titulo: j.nombre_trabajador,
            detalle: `2° Audiencia - ${j.segunda_audiencia_resultado || "Audiencia registrada"}`,
            fecha_evento: j.segunda_audiencia_fecha,
            estado_general: j.estado,
            ruta_origen: "/reg-litigios/juicios",
            monto: monto ? Number(monto) : undefined,
            entidad_o_materia: j.materia,
            observaciones: j.observaciones,
          });
        }
      }
    }

    // 2. Multas
    for (const m of multas) {
      const fecha = m.fecha_pago || m.fecha_resolucion || m.fecha_publicacion;
      if (fecha) {
        const entidadEmisora = m.entidad || "Dirección del Trabajo";
        events.push({
          evento_id: m.id,
          tipo_evento: "MULTA",
          identificador: m.nro_multa,
          titulo: entidadEmisora,
          detalle: `${m.procedencia} - Vencimiento Sanción: $ ${Number(m.monto_sancion || 0).toLocaleString("es-CL")}`,
          fecha_evento: fecha,
          estado_general: m.estado,
          ruta_origen: "/reg-litigios/multas",
          monto: Number(m.monto_sancion || 0),
          entidad_o_materia: `${entidadEmisora} · ${m.procedencia}`,
          observaciones: m.observaciones,
        });
      }
    }

    // 3. Comparendos
    const comparendos = db.litigios_comparendos || [];
    for (const c of comparendos) {
      if (c.fecha_comparendo) {
        events.push({
          evento_id: c.id,
          tipo_evento: "COMPARENDO",
          identificador: c.nombre_trabajador,
          titulo: `Comparendo: ${c.nombre_trabajador}`,
          detalle: `${c.causal_termino} · ${c.motivo_observacion || "Citación ante la Inspección del Trabajo"}`,
          fecha_evento: c.fecha_comparendo,
          estado_general: c.estado || "PENDIENTE",
          ruta_origen: "/reg-litigios/comparendos",
          entidad_o_materia: "Inspección del Trabajo (DT)",
          monto: Number(c.monto_acuerdo_total || 0),
          observaciones: c.motivo_observacion,
        });
      }
    }
  }

  // Ordenar todos los eventos cronológicamente por fecha ascendente
  events.sort((a, b) => a.fecha_evento.localeCompare(b.fecha_evento));

  // Calcular KPIs Consolidados
  const todayIso = new Date().toISOString().slice(0, 10);
  const currentMonthPrefix = todayIso.slice(0, 7); // e.g. "2026-10"

  const kpis: CalendarioLitigiosKpis = {
    eventosEsteMes: events.filter((e) =>
      e.fecha_evento.startsWith(currentMonthPrefix)
    ).length,
    audienciasProgramadas: events.filter(
      (e) =>
        e.tipo_evento === "AUDIENCIA_JUICIO" &&
        (e.estado_general === "PENDIENTE" || e.fecha_evento >= todayIso)
    ).length,
    multasComparendosProximos: events.filter(
      (e) =>
        (e.tipo_evento === "MULTA" || e.tipo_evento === "COMPARENDO") &&
        (e.estado_general === "PENDIENTE" || e.fecha_evento >= todayIso)
    ).length,
  };

  // Aplicar filtros
  let items = [...events];

  if (filters?.tipo && filters.tipo !== "TODOS") {
    items = items.filter((e) => e.tipo_evento === filters.tipo);
  }

  if (filters?.mes) {
    items = items.filter((e) => e.fecha_evento.startsWith(filters.mes!));
  }

  if (filters?.estado && filters.estado !== "TODOS") {
    items = items.filter((e) => e.estado_general === filters.estado);
  }

  if (filters?.query) {
    const q = filters.query.trim().toLowerCase();
    items = items.filter(
      (e) =>
        e.identificador.toLowerCase().includes(q) ||
        e.titulo.toLowerCase().includes(q) ||
        e.detalle.toLowerCase().includes(q) ||
        (e.entidad_o_materia || "").toLowerCase().includes(q)
    );
  }

  return { items, kpis };
}

// ============================================================================
// 4. SUBMÓDULO: COMPARENDOS & CUOTAS DE ACUERDO
// ============================================================================

export async function getLitigiosComparendosAction(
  filters?: ComparendosFilterParams
): Promise<{ items: LitigioComparendo[]; kpis: LitigiosComparendosKpis }> {
  let rawComparendos: LitigioComparendo[] = [];
  let rawCuotas: CuotaComparendo[] = [];

  if (isServerSupabaseConfigured()) {
    try {
      const supabase = await createServerSupabaseClient();
      const { data: compData, error: compErr } = await supabase
        .from("litigios_comparendos")
        .select("*")
        .order("fecha_comparendo", { ascending: false });

      if (!compErr && compData) {
        rawComparendos = compData as LitigioComparendo[];

        const { data: cuotasData, error: cuotasErr } = await supabase
          .from("litigios_cuotas_comparendo")
          .select("*")
          .order("numero_cuota", { ascending: true });

        if (!cuotasErr && cuotasData) {
          rawCuotas = cuotasData as CuotaComparendo[];
        }
      }
    } catch {
      // Fallback local DB
    }
  }

  if (rawComparendos.length === 0) {
    const db = readLocalDb();
    rawComparendos = structuredClone(db.litigios_comparendos || []);
    rawCuotas = structuredClone(db.litigios_cuotas_comparendo || []);
  }

  // Asociar cuotas a cada comparendo
  const itemsWithCuotas: LitigioComparendo[] = rawComparendos.map((c) => {
    const cuotas = rawCuotas
      .filter((q) => q.comparendo_id === c.id)
      .sort((a, b) => a.numero_cuota - b.numero_cuota);
    return {
      ...c,
      cuotas,
    };
  });

  // Calcular KPIs Consolidados
  const kpis: LitigiosComparendosKpis = {
    totalComparendos: itemsWithCuotas.length,
    montoAcuerdosTotal: 0,
    pendientesCount: 0,
    montoPendiente: 0,
    saldadosCount: 0,
    montoSaldado: 0,
  };

  for (const c of itemsWithCuotas) {
    const totalAcuerdo = Number(c.monto_acuerdo_total || 0);
    kpis.montoAcuerdosTotal += totalAcuerdo;

    const cuotas = c.cuotas || [];
    const pagadoEnCuotas = cuotas
      .filter((q) => q.estado_cuota === "PAGADA")
      .reduce((acc, q) => acc + Number(q.monto_cuota || 0), 0);

    const pendienteEnCuotas = cuotas
      .filter((q) => q.estado_cuota === "PENDIENTE")
      .reduce((acc, q) => acc + Number(q.monto_cuota || 0), 0);

    if (c.estado === "PAGADO") {
      kpis.saldadosCount++;
      kpis.montoSaldado += totalAcuerdo > 0 ? totalAcuerdo : pagadoEnCuotas;
    } else {
      // PENDIENTE o ACUERDO_EN_PAGO
      kpis.pendientesCount++;
      kpis.montoPendiente += cuotas.length > 0 ? pendienteEnCuotas : totalAcuerdo;
      kpis.montoSaldado += pagadoEnCuotas;
    }
  }

  // Filtrado
  let items = [...itemsWithCuotas];

  if (filters?.estado && filters.estado !== "TODOS") {
    items = items.filter((c) => c.estado === filters.estado);
  }

  if (filters?.causal && filters.causal !== "TODAS") {
    items = items.filter((c) =>
      c.causal_termino.toLowerCase().includes(filters.causal!.toLowerCase())
    );
  }

  if (filters?.asistencia && filters.asistencia !== "TODAS") {
    const wantAsistencia = filters.asistencia === "SI";
    items = items.filter((c) => c.asistencia_empresa === wantAsistencia);
  }

  if (filters?.reserva && filters.reserva !== "TODAS") {
    const wantReserva = filters.reserva === "SI";
    items = items.filter((c) => c.reserva_derechos === wantReserva);
  }

  if (filters?.query) {
    const q = filters.query.trim().toLowerCase();
    items = items.filter(
      (c) =>
        c.nombre_trabajador.toLowerCase().includes(q) ||
        c.causal_termino.toLowerCase().includes(q) ||
        (c.motivo_observacion || "").toLowerCase().includes(q)
    );
  }

  return { items, kpis };
}

export async function upsertLitigioComparendoAction(
  data: Partial<LitigioComparendo>
): Promise<LitigioComparendo> {
  const now = new Date().toISOString();
  const id = data.id || `comp-${Date.now()}`;

  const payload: LitigioComparendo = {
    id,
    nombre_trabajador: data.nombre_trabajador || "",
    fecha_finiquito: data.fecha_finiquito || null,
    reserva_derechos: Boolean(data.reserva_derechos),
    causal_termino: data.causal_termino || "",
    fecha_comparendo: data.fecha_comparendo || now.slice(0, 10),
    asistencia_empresa:
      data.asistencia_empresa !== undefined ? Boolean(data.asistencia_empresa) : true,
    motivo_observacion: data.motivo_observacion?.trim() || null,
    monto_acuerdo_total: Number(data.monto_acuerdo_total || 0),
    estado: data.estado || "PENDIENTE",
    created_at: data.created_at || now,
    updated_at: now,
  };

  if (isServerSupabaseConfigured()) {
    const supabase = await createServerSupabaseClient();
    const { data: saved, error } = await supabase
      .from("litigios_comparendos")
      .upsert({
        id: payload.id,
        nombre_trabajador: payload.nombre_trabajador,
        fecha_finiquito: payload.fecha_finiquito,
        reserva_derechos: payload.reserva_derechos,
        causal_termino: payload.causal_termino,
        fecha_comparendo: payload.fecha_comparendo,
        asistencia_empresa: payload.asistencia_empresa,
        motivo_observacion: payload.motivo_observacion,
        monto_acuerdo_total: payload.monto_acuerdo_total,
        estado: payload.estado,
        updated_at: now,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Error al guardar Comparendo en Supabase: ${error.message}`);
    }

    if (saved) {
      safeRevalidatePath("/reg-litigios/comparendos");
      safeRevalidatePath("/reg-litigios/calendario");
      return saved as LitigioComparendo;
    }
  }

  // Fallback Local DB
  const db = readLocalDb();
  if (!db.litigios_comparendos) {
    db.litigios_comparendos = [];
  }
  const idx = db.litigios_comparendos.findIndex((c) => c.id === id);
  if (idx >= 0) {
    db.litigios_comparendos[idx] = {
      ...db.litigios_comparendos[idx],
      ...payload,
    };
  } else {
    db.litigios_comparendos.unshift(payload);
  }
  writeLocalDb(db);

  safeRevalidatePath("/reg-litigios/comparendos");
  safeRevalidatePath("/reg-litigios/calendario");
  return payload;
}

export async function saveAcuerdoComparendoAction(
  comparendoId: string,
  montoTotal: number,
  cuotas: Array<Partial<CuotaComparendo>>
): Promise<LitigioComparendo> {
  const now = new Date().toISOString();

  // Calcular estado del comparendo según las cuotas
  let nuevoEstado: EstadoComparendo = "PENDIENTE";
  if (cuotas.length > 0) {
    const allPaid = cuotas.every((q) => q.estado_cuota === "PAGADA");
    nuevoEstado = allPaid ? "PAGADO" : "ACUERDO_EN_PAGO";
  }

  const formattedCuotas: CuotaComparendo[] = cuotas.map((q, idx) => ({
    id: q.id || `cuota-${comparendoId}-${idx + 1}-${Date.now()}`,
    comparendo_id: comparendoId,
    numero_cuota: q.numero_cuota || idx + 1,
    monto_cuota: Number(q.monto_cuota || 0),
    fecha_vencimiento_cuota: q.fecha_vencimiento_cuota || now.slice(0, 10),
    estado_cuota: q.estado_cuota || "PENDIENTE",
    fecha_pago_real:
      q.estado_cuota === "PAGADA" ? q.fecha_pago_real || now.slice(0, 10) : null,
    created_at: q.created_at || now,
    updated_at: now,
  }));

  if (isServerSupabaseConfigured()) {
    const supabase = await createServerSupabaseClient();
    // 1. Actualizar comparendo
    const { error: errComp } = await supabase
      .from("litigios_comparendos")
      .update({
        monto_acuerdo_total: montoTotal,
        estado: nuevoEstado,
        updated_at: now,
      })
      .eq("id", comparendoId);

    if (errComp) {
      throw new Error(`Error al actualizar acuerdo de comparendo en Supabase: ${errComp.message}`);
    }

    // 2. Eliminar cuotas previas y reinsertar las cuotas pactadas
    const { error: errDel } = await supabase
      .from("litigios_cuotas_comparendo")
      .delete()
      .eq("comparendo_id", comparendoId);

    if (errDel) {
      throw new Error(`Error al limpiar cuotas previas de comparendo en Supabase: ${errDel.message}`);
    }

    if (formattedCuotas.length > 0) {
      const { error: errIns } = await supabase.from("litigios_cuotas_comparendo").insert(
        formattedCuotas.map((q) => ({
          id: q.id,
          comparendo_id: q.comparendo_id,
          numero_cuota: q.numero_cuota,
          monto_cuota: q.monto_cuota,
          fecha_vencimiento_cuota: q.fecha_vencimiento_cuota,
          estado_cuota: q.estado_cuota,
          fecha_pago_real: q.fecha_pago_real,
          updated_at: now,
        }))
      );
      if (errIns) {
        throw new Error(`Error al insertar cuotas de comparendo en Supabase: ${errIns.message}`);
      }
    }
  }

  // Fallback Local DB
  const db = readLocalDb();
  if (!db.litigios_comparendos) db.litigios_comparendos = [];
  if (!db.litigios_cuotas_comparendo) db.litigios_cuotas_comparendo = [];

  const compIdx = db.litigios_comparendos.findIndex((c) => c.id === comparendoId);
  if (compIdx >= 0) {
    db.litigios_comparendos[compIdx].monto_acuerdo_total = montoTotal;
    db.litigios_comparendos[compIdx].estado = nuevoEstado;
    db.litigios_comparendos[compIdx].updated_at = now;
  }

  // Reemplazar cuotas asociadas al comparendo
  db.litigios_cuotas_comparendo = db.litigios_cuotas_comparendo.filter(
    (q) => q.comparendo_id !== comparendoId
  );
  db.litigios_cuotas_comparendo.push(...formattedCuotas);

  writeLocalDb(db);

  safeRevalidatePath("/reg-litigios/comparendos");
  safeRevalidatePath("/reg-litigios/calendario");

  const updatedComp = db.litigios_comparendos[compIdx] || {
    id: comparendoId,
    nombre_trabajador: "",
    reserva_derechos: false,
    causal_termino: "",
    fecha_comparendo: now.slice(0, 10),
    asistencia_empresa: true,
    monto_acuerdo_total: montoTotal,
    estado: nuevoEstado,
    created_at: now,
  };

  return {
    ...updatedComp,
    cuotas: formattedCuotas,
  };
}

export async function togglePagoCuotaComparendoAction(
  cuotaId: string,
  comparendoId: string,
  nuevoEstado: EstadoCuotaComparendo,
  fechaPagoReal?: string | null
): Promise<{ cuota: CuotaComparendo; comparendo: LitigioComparendo }> {
  const now = new Date().toISOString();
  const db = readLocalDb();
  if (!db.litigios_cuotas_comparendo) db.litigios_cuotas_comparendo = [];
  if (!db.litigios_comparendos) db.litigios_comparendos = [];

  const cuotaIdx = db.litigios_cuotas_comparendo.findIndex((q) => q.id === cuotaId);
  if (cuotaIdx >= 0) {
    db.litigios_cuotas_comparendo[cuotaIdx].estado_cuota = nuevoEstado;
    db.litigios_cuotas_comparendo[cuotaIdx].fecha_pago_real =
      nuevoEstado === "PAGADA" ? fechaPagoReal || now.slice(0, 10) : null;
    db.litigios_cuotas_comparendo[cuotaIdx].updated_at = now;
  }

  // Recalcular estado de comparendo
  const siblingCuotas = db.litigios_cuotas_comparendo.filter(
    (q) => q.comparendo_id === comparendoId
  );
  const allPaid =
    siblingCuotas.length > 0 &&
    siblingCuotas.every((q) => q.estado_cuota === "PAGADA");
  const compEstado: EstadoComparendo = allPaid ? "PAGADO" : "ACUERDO_EN_PAGO";

  const compIdx = db.litigios_comparendos.findIndex((c) => c.id === comparendoId);
  if (compIdx >= 0) {
    db.litigios_comparendos[compIdx].estado = compEstado;
    db.litigios_comparendos[compIdx].updated_at = now;
  }

  if (isServerSupabaseConfigured()) {
    const supabase = await createServerSupabaseClient();
    const { error: errCuota } = await supabase
      .from("litigios_cuotas_comparendo")
      .update({
        estado_cuota: nuevoEstado,
        fecha_pago_real:
          nuevoEstado === "PAGADA" ? fechaPagoReal || now.slice(0, 10) : null,
        updated_at: now,
      })
      .eq("id", cuotaId);

    if (errCuota) {
      throw new Error(`Error al actualizar cuota de comparendo en Supabase: ${errCuota.message}`);
    }

    const { error: errComp } = await supabase
      .from("litigios_comparendos")
      .update({
        estado: compEstado,
        updated_at: now,
      })
      .eq("id", comparendoId);

    if (errComp) {
      throw new Error(`Error al actualizar estado de comparendo en Supabase: ${errComp.message}`);
    }
  }

  writeLocalDb(db);
  safeRevalidatePath("/reg-litigios/comparendos");
  safeRevalidatePath("/reg-litigios/calendario");

  return {
    cuota: db.litigios_cuotas_comparendo[cuotaIdx],
    comparendo: {
      ...db.litigios_comparendos[compIdx],
      cuotas: siblingCuotas,
    },
  };
}

export async function deleteLitigioComparendoAction(id: string): Promise<void> {
  if (isServerSupabaseConfigured()) {
    const supabase = await createServerSupabaseClient();
    const { error: errCuotas } = await supabase
      .from("litigios_cuotas_comparendo")
      .delete()
      .eq("comparendo_id", id);
    if (errCuotas) {
      throw new Error(`Error al eliminar cuotas de comparendo en Supabase: ${errCuotas.message}`);
    }
    const { error: errComp } = await supabase
      .from("litigios_comparendos")
      .delete()
      .eq("id", id);
    if (errComp) {
      throw new Error(`Error al eliminar comparendo en Supabase: ${errComp.message}`);
    }
  }

  const db = readLocalDb();
  if (db.litigios_comparendos) {
    db.litigios_comparendos = db.litigios_comparendos.filter((c) => c.id !== id);
  }
  if (db.litigios_cuotas_comparendo) {
    db.litigios_cuotas_comparendo = db.litigios_cuotas_comparendo.filter(
      (q) => q.comparendo_id !== id
    );
  }
  writeLocalDb(db);

  safeRevalidatePath("/reg-litigios/comparendos");
  safeRevalidatePath("/reg-litigios/calendario");
}

