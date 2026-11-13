"use server";

import { cookies } from "next/headers";
import {
  isServerSupabaseConfigured,
  createServerSupabaseClient,
} from "@/lib/supabase/server";
import { readLocalDb, writeLocalDb } from "@/lib/supabase/local-fallback-db";
import {
  ALL_ADMIN_PERMISSIONS,
  getPermisosForPerfil,
  getServerUserSession,
} from "@/lib/auth/session";
import { buildNormalizedPermisosMatrix } from "@/types/database.types";

const SESSION_COOKIE_NAME = "tensacon_session";

export interface LoginResult {
  success: boolean;
  error?: string;
  user?: {
    id: string;
    nombre: string;
    usuario: string;
    perfil: string;
    perfilId?: string;
    esAdmin: boolean;
    permisos?: Record<string, string>;
  };
}

/**
 * Autentica al usuario sanitizando el identificador (sin prefijo @) y validando
 * contra usuarios_sistema / usuarios en Supabase o en la base persistente local.
 */
export async function loginUserAction(
  usuarioInput: string,
  contrasenaInput: string
): Promise<LoginResult> {
  const cleanUsername = usuarioInput.trim().toLowerCase().replace(/^@+/, "");
  const cleanPassword = contrasenaInput.trim();

  if (!cleanUsername || !cleanPassword) {
    return {
      success: false,
      error: "Por favor ingrese su usuario y contraseña.",
    };
  }

  let matchedUser: NonNullable<LoginResult["user"]> | null = null;

  // 1. Validar contra Supabase si el servicio está activo
  if (isServerSupabaseConfigured()) {
    try {
      const supabase = await createServerSupabaseClient();

      // Consulta exclusivamente a la tabla 'usuarios_sistema'
      const res = await supabase
        .from("usuarios_sistema")
        .select("*")
        .or(`usuario.ilike.${cleanUsername},correo.ilike.${cleanUsername}`)
        .or(`password_text.eq.${cleanPassword},contrasena.eq.${cleanPassword}`)
        .eq("estado", "Activo")
        .maybeSingle();

      if (!res.error && res.data) {
        const u = res.data;
        const perfilNombre = (u.perfil_nombre || u.perfil || "ADMINISTRADOR")
          .toString()
          .trim()
          .toUpperCase();
        const esAdmin = perfilNombre === "ADMINISTRADOR";
        const perfilId = u.perfil_id ? String(u.perfil_id) : undefined;

        let permisosMap: Record<string, string> = {};
        if (esAdmin) {
          permisosMap = { ...ALL_ADMIN_PERMISSIONS };
        } else {
          permisosMap = await getPermisosForPerfil(perfilId || perfilNombre);
        }

        matchedUser = {
          id: String(u.id),
          nombre: String(u.nombre || u.usuario || cleanUsername),
          usuario: String(u.usuario || cleanUsername).replace(/^@+/, ""),
          perfil: perfilNombre,
          perfilId,
          esAdmin,
          permisos: permisosMap,
        };
      }
    } catch {
      // Continuar con fallback local
    }
  }

  // 2. Si no se encontró en Supabase o está en modo local, validar contra la base persistente
  if (!matchedUser) {
    const db = readLocalDb();
    const foundLocal = (db.usuarios || []).find((u) => {
      const dbUser = (u.usuario || "").trim().toLowerCase().replace(/^@+/, "");
      const dbEmail = (u.correo || "").trim().toLowerCase();
      const matchIdentity = dbUser === cleanUsername || dbEmail === cleanUsername;
      // Admite la contraseña registrada en JSON (ej. 2201, Km40) o la maestra de desarrollo
      const matchPass =
        (u.contrasena || "").trim() === cleanPassword ||
        (cleanUsername === "cvargas" &&
          (cleanPassword === "2201" || cleanPassword === "Tensacon2026!"));
      const matchEstado = (u.estado || "Activo") === "Activo";

      return matchIdentity && matchPass && matchEstado;
    });

    if (foundLocal) {
      const perfilNombre = (foundLocal.perfil_nombre || "ADMINISTRADOR")
        .trim()
        .toUpperCase();
      const esAdmin = perfilNombre === "ADMINISTRADOR";
      let permisosMap: Record<string, string> = {};

      if (esAdmin) {
        permisosMap = { ...ALL_ADMIN_PERMISSIONS };
      } else {
        const perfilObj = (db.perfiles || []).find(
          (p) =>
            p.id === foundLocal.perfil_id ||
            p.nombre_perfil.toUpperCase() === perfilNombre
        );
        permisosMap = buildNormalizedPermisosMatrix(
          (perfilObj?.permisos as Record<string, string>) || {}
        );
      }

      matchedUser = {
        id: foundLocal.id,
        nombre: foundLocal.nombre,
        usuario: foundLocal.usuario.replace(/^@+/, ""),
        perfil: perfilNombre,
        perfilId: foundLocal.perfil_id,
        esAdmin,
        permisos: permisosMap,
      };
    }
  }

  if (!matchedUser) {
    return {
      success: false,
      error: "Credenciales incorrectas o usuario inactivo en el sistema.",
    };
  }

  // 2.5 Registrar última conexión y sesión activa
  const ahora = new Date().toISOString();
  if (isServerSupabaseConfigured()) {
    try {
      const supabase = await createServerSupabaseClient();
      await supabase
        .from("usuarios_sistema")
        .update({
          ultima_conexion: ahora,
          ultimo_pulso: ahora,
          sesion_activa: true,
        })
        .eq("id", matchedUser.id);
    } catch {
      // No bloquear el login si la columna aún no existe
    }
  }
  try {
    const dbLocal = readLocalDb();
    const localIdx = (dbLocal.usuarios || []).findIndex(
      (u) => u.id === matchedUser!.id
    );
    if (localIdx >= 0) {
      dbLocal.usuarios[localIdx] = {
        ...dbLocal.usuarios[localIdx],
        ultima_conexion: ahora,
        ultimo_pulso: ahora,
        sesion_activa: true,
      };
      writeLocalDb(dbLocal);
    }
  } catch {
    // Ignorar error en fallback local
  }

  // 3. Crear sesión en cookie HTTP
  const cookieStore = await cookies();
  cookieStore.set(
    SESSION_COOKIE_NAME,
    encodeURIComponent(JSON.stringify(matchedUser)),
    {
      path: "/",
      maxAge: 60 * 60 * 24 * 7, // 7 días
      sameSite: "lax",
      httpOnly: false,
    }
  );

  return {
    success: true,
    user: matchedUser,
  };
}

/**
 * Cierra la sesión activa marcando sesion_activa = false y eliminando la cookie
 */
export async function logoutAction(): Promise<void> {
  const session = await getServerUserSession();
  const ahora = new Date().toISOString();

  if (session?.id) {
    if (isServerSupabaseConfigured()) {
      try {
        const supabase = await createServerSupabaseClient();
        await supabase
          .from("usuarios_sistema")
          .update({
            sesion_activa: false,
            ultimo_pulso: ahora,
          })
          .eq("id", session.id);
      } catch {
        // No bloquear el logout
      }
    }
    try {
      const dbLocal = readLocalDb();
      const localIdx = (dbLocal.usuarios || []).findIndex(
        (u) => u.id === session.id
      );
      if (localIdx >= 0) {
        dbLocal.usuarios[localIdx] = {
          ...dbLocal.usuarios[localIdx],
          sesion_activa: false,
          ultimo_pulso: ahora,
        };
        writeLocalDb(dbLocal);
      }
    } catch {
      // Ignorar error en fallback local
    }
  }

  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

/**
 * Heartbeat silencioso para mantener sesion_activa = true y actualizar ultimo_pulso
 */
export async function registrarPulsoSesionAction(): Promise<{ ok: boolean }> {
  const session = await getServerUserSession();
  if (!session?.id) {
    return { ok: false };
  }

  const ahora = new Date().toISOString();

  if (isServerSupabaseConfigured()) {
    try {
      const supabase = await createServerSupabaseClient();
      await supabase
        .from("usuarios_sistema")
        .update({
          ultimo_pulso: ahora,
          sesion_activa: true,
        })
        .eq("id", session.id);
    } catch {
      // Silencioso
    }
  }

  try {
    const dbLocal = readLocalDb();
    const localIdx = (dbLocal.usuarios || []).findIndex(
      (u) => u.id === session.id
    );
    if (localIdx >= 0) {
      dbLocal.usuarios[localIdx] = {
        ...dbLocal.usuarios[localIdx],
        ultimo_pulso: ahora,
        sesion_activa: true,
      };
      writeLocalDb(dbLocal);
    }
  } catch {
    // Silencioso
  }

  return { ok: true };
}
