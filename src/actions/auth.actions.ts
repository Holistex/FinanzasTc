"use server";

import { cookies } from "next/headers";
import {
  isServerSupabaseConfigured,
  createServerSupabaseClient,
} from "@/lib/supabase/server";
import { readLocalDb } from "@/lib/supabase/local-fallback-db";
import {
  ALL_ADMIN_PERMISSIONS,
  getPermisosForPerfil,
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

      // 1. Probar en tabla 'usuarios_sistema'
      let res = await supabase
        .from("usuarios_sistema")
        .select("*")
        .or(`usuario.ilike.${cleanUsername},correo.ilike.${cleanUsername}`)
        .or(`password_text.eq.${cleanPassword},contrasena.eq.${cleanPassword}`)
        .eq("estado", "Activo")
        .maybeSingle();

      // Si no hay match con password_text/contrasena en usuarios_sistema, probar con 'usuarios'
      if (res.error || !res.data) {
        res = await supabase
          .from("usuarios")
          .select("*")
          .or(`usuario.ilike.${cleanUsername},correo.ilike.${cleanUsername}`)
          .or(`password_text.eq.${cleanPassword},contrasena.eq.${cleanPassword}`)
          .eq("estado", "Activo")
          .maybeSingle();
      }

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
 * Cierra la sesión activa eliminando la cookie de sesión
 */
export async function logoutAction(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}
