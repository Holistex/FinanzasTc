"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient, isServerSupabaseConfigured } from "@/lib/supabase/server";
import { readLocalDb, writeLocalDb } from "@/lib/supabase/local-fallback-db";
import { getServerUserSession } from "@/lib/auth/session";
import { EventoPlataforma, TipoEventoPlataforma } from "@/types/database.types";

const TIPOS_VALIDOS: TipoEventoPlataforma[] = [
  "ADVERTENCIA",
  "INFORME_VERDE",
  "INFORMATIVO",
  "CRITICO",
];

function normalizarEventoRow(r: Record<string, unknown>): EventoPlataforma {
  const rawTipo = String(r.tipo_evento || r.tipo || "INFORMATIVO").toUpperCase();
  const tipoEvento: TipoEventoPlataforma = TIPOS_VALIDOS.includes(
    rawTipo as TipoEventoPlataforma
  )
    ? (rawTipo as TipoEventoPlataforma)
    : "INFORMATIVO";

  return {
    id: String(r.id),
    tipo_evento: tipoEvento,
    titulo: r.titulo ? String(r.titulo) : null,
    mensaje: String(r.mensaje || ""),
    fecha_desde: String(r.fecha_desde || ""),
    fecha_hasta: String(r.fecha_hasta || ""),
    perfil_destino: String(r.perfil_destino || "TODOS").trim() || "TODOS",
    activo: r.activo !== false,
    created_at: String(r.created_at || new Date().toISOString()),
    updated_at: String(r.updated_at || r.created_at || new Date().toISOString()),
  };
}

export async function getEventosPlataformaAction(): Promise<EventoPlataforma[]> {
  if (isServerSupabaseConfigured()) {
    try {
      const supabase = await createServerSupabaseClient();
      const { data, error } = await supabase
        .from("eventos_plataforma")
        .select("*")
        .order("fecha_desde", { ascending: false });

      if (!error && data) {
        return (data as Array<Record<string, unknown>>).map(normalizarEventoRow);
      }
      if (error) {
        console.error("[Eventos] Error consultando eventos_plataforma:", error.message);
      }
    } catch (err) {
      console.error("[Eventos] Error inesperado en getEventosPlataformaAction:", err);
    }
  }

  const db = readLocalDb();
  return [...(db.eventos_plataforma || [])].sort((a, b) =>
    b.fecha_desde.localeCompare(a.fecha_desde)
  );
}

export async function getEventosVigentesUsuarioAction(
  perfilUsuario?: string | null
): Promise<EventoPlataforma[]> {
  try {
    const todos = await getEventosPlataformaAction();
    const ahoraMs = Date.now();
    const perfilNorm = String(perfilUsuario || "").trim().toUpperCase();

    return todos.filter((ev) => {
      if (!ev.activo) return false;
      const desdeMs = new Date(ev.fecha_desde).getTime();
      const hastaMs = new Date(ev.fecha_hasta).getTime();
      if (Number.isNaN(desdeMs) || Number.isNaN(hastaMs)) return false;
      if (ahoraMs < desdeMs || ahoraMs > hastaMs) return false;

      const destino = String(ev.perfil_destino || "TODOS").trim().toUpperCase();
      if (destino === "TODOS" || destino === "") return true;
      return perfilNorm !== "" && destino === perfilNorm;
    });
  } catch (err) {
    console.error("[Eventos] Error obteniendo eventos vigentes:", err);
    return [];
  }
}

export interface GuardarEventoInput {
  id?: string;
  tipo_evento: TipoEventoPlataforma;
  titulo?: string | null;
  mensaje: string;
  fecha_desde: string;
  fecha_hasta: string;
  perfil_destino?: string;
  activo?: boolean;
}

export async function guardarEventoPlataformaAction(
  input: GuardarEventoInput
): Promise<{ success: boolean; error?: string; data?: EventoPlataforma }> {
  try {
    const session = await getServerUserSession();
    const esAdmin =
      Boolean(session?.esAdmin) ||
      String(session?.perfil || "").trim().toUpperCase() === "ADMINISTRADOR";

    if (!session || !esAdmin) {
      return {
        success: false,
        error: "Solo un Administrador puede crear o editar eventos globales.",
      };
    }

    const mensajeLimpio = input.mensaje?.trim() || "";
    if (!mensajeLimpio) {
      return { success: false, error: "El mensaje del aviso es obligatorio." };
    }

    const desdeDate = new Date(input.fecha_desde);
    const hastaDate = new Date(input.fecha_hasta);
    if (Number.isNaN(desdeDate.getTime()) || Number.isNaN(hastaDate.getTime())) {
      return { success: false, error: "Las fechas de vigencia son inválidas." };
    }
    if (hastaDate.getTime() <= desdeDate.getTime()) {
      return {
        success: false,
        error: "La fecha 'Informar Hasta' debe ser posterior a 'Informar Desde'.",
      };
    }

    const tipoEvento: TipoEventoPlataforma = TIPOS_VALIDOS.includes(input.tipo_evento)
      ? input.tipo_evento
      : "INFORMATIVO";

    const ahoraIso = new Date().toISOString();
    const payload = {
      tipo_evento: tipoEvento,
      titulo: input.titulo?.trim() || null,
      mensaje: mensajeLimpio,
      fecha_desde: desdeDate.toISOString(),
      fecha_hasta: hastaDate.toISOString(),
      perfil_destino: input.perfil_destino?.trim() || "TODOS",
      activo: input.activo !== false,
      updated_at: ahoraIso,
    };

    if (isServerSupabaseConfigured()) {
      const supabase = await createServerSupabaseClient();

      if (input.id && !input.id.startsWith("ev-local-")) {
        const { data, error } = await supabase
          .from("eventos_plataforma")
          .update(payload)
          .eq("id", input.id)
          .select("*")
          .single();

        if (error) {
          return {
            success: false,
            error: `Error al actualizar evento en Supabase: ${error.message}`,
          };
        }

        revalidatePath("/configuracion/eventos");
        revalidatePath("/", "layout");
        return {
          success: true,
          data: normalizarEventoRow(data as Record<string, unknown>),
        };
      } else {
        const { data, error } = await supabase
          .from("eventos_plataforma")
          .insert({
            ...payload,
            created_at: ahoraIso,
          })
          .select("*")
          .single();

        if (error) {
          return {
            success: false,
            error: `Error al crear evento en Supabase: ${error.message}`,
          };
        }

        revalidatePath("/configuracion/eventos");
        revalidatePath("/", "layout");
        return {
          success: true,
          data: normalizarEventoRow(data as Record<string, unknown>),
        };
      }
    }

    // Fallback local DB
    const db = readLocalDb();
    if (!db.eventos_plataforma) db.eventos_plataforma = [];

    let saved: EventoPlataforma;
    if (input.id) {
      const idx = db.eventos_plataforma.findIndex((e) => e.id === input.id);
      if (idx === -1) {
        return { success: false, error: "Evento no encontrado." };
      }
      saved = {
        ...db.eventos_plataforma[idx],
        ...payload,
      };
      db.eventos_plataforma[idx] = saved;
    } else {
      saved = {
        id: `ev-local-${Date.now()}`,
        ...payload,
        created_at: ahoraIso,
      };
      db.eventos_plataforma.unshift(saved);
    }

    writeLocalDb(db);
    revalidatePath("/configuracion/eventos");
    revalidatePath("/", "layout");
    return { success: true, data: saved };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Error inesperado al guardar evento.",
    };
  }
}

export async function toggleEventoPlataformaAction(
  id: string,
  activo: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await getServerUserSession();
    const esAdmin =
      Boolean(session?.esAdmin) ||
      String(session?.perfil || "").trim().toUpperCase() === "ADMINISTRADOR";

    if (!session || !esAdmin) {
      return { success: false, error: "No autorizado." };
    }

    const ahoraIso = new Date().toISOString();

    if (isServerSupabaseConfigured() && !id.startsWith("ev-local-")) {
      const supabase = await createServerSupabaseClient();
      const { error } = await supabase
        .from("eventos_plataforma")
        .update({ activo, updated_at: ahoraIso })
        .eq("id", id);

      if (error) {
        return { success: false, error: error.message };
      }

      revalidatePath("/configuracion/eventos");
      revalidatePath("/", "layout");
      return { success: true };
    }

    const db = readLocalDb();
    if (!db.eventos_plataforma) db.eventos_plataforma = [];
    const idx = db.eventos_plataforma.findIndex((e) => e.id === id);
    if (idx === -1) return { success: false, error: "Evento no encontrado." };

    db.eventos_plataforma[idx].activo = activo;
    db.eventos_plataforma[idx].updated_at = ahoraIso;
    writeLocalDb(db);

    revalidatePath("/configuracion/eventos");
    revalidatePath("/", "layout");
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Error al cambiar estado del evento.",
    };
  }
}

export async function eliminarEventoPlataformaAction(
  id: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await getServerUserSession();
    const esAdmin =
      Boolean(session?.esAdmin) ||
      String(session?.perfil || "").trim().toUpperCase() === "ADMINISTRADOR";

    if (!session || !esAdmin) {
      return { success: false, error: "No autorizado." };
    }

    if (isServerSupabaseConfigured() && !id.startsWith("ev-local-")) {
      const supabase = await createServerSupabaseClient();
      const { error } = await supabase
        .from("eventos_plataforma")
        .delete()
        .eq("id", id);

      if (error) {
        return { success: false, error: error.message };
      }

      revalidatePath("/configuracion/eventos");
      revalidatePath("/", "layout");
      return { success: true };
    }

    const db = readLocalDb();
    if (!db.eventos_plataforma) db.eventos_plataforma = [];
    db.eventos_plataforma = db.eventos_plataforma.filter((e) => e.id !== id);
    writeLocalDb(db);

    revalidatePath("/configuracion/eventos");
    revalidatePath("/", "layout");
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Error al eliminar evento.",
    };
  }
}
