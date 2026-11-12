import { cookies } from "next/headers";
import {
  createServerSupabaseClient,
  isServerSupabaseConfigured,
} from "@/lib/supabase/server";
import { readLocalDb } from "@/lib/supabase/local-fallback-db";
import {
  buildNormalizedPermisosMatrix,
  MODULOS_SISTEMA_FINANZAS,
} from "@/types/database.types";
import {
  hasPermission,
  isRouteAllowed,
  getModuleForRoute,
  ROUTE_MODULE_MAP,
  UserSessionData,
} from "./permissions";

export { hasPermission, isRouteAllowed, getModuleForRoute, ROUTE_MODULE_MAP };

export interface TensaconUserSession extends UserSessionData {
  id?: string;
  usuario: string;
  nombre: string;
  perfil: string;
  perfilId?: string;
  esAdmin: boolean;
  permisos: Record<string, string>;
}

const SESSION_COOKIE_NAME = "tensacon_session";

export const ALL_ADMIN_PERMISSIONS: Record<string, string> = Object.fromEntries(
  MODULOS_SISTEMA_FINANZAS.map((m) => [m.id, "GESTION"])
);

/**
 * Busca los permisos asignados a un perfil por nombre o id
 */
export async function getPermisosForPerfil(
  perfilNombreOrId?: string
): Promise<Record<string, string>> {
  if (!perfilNombreOrId) return {};

  const cleanName = perfilNombreOrId.trim().toUpperCase();
  if (cleanName === "ADMINISTRADOR") {
    return { ...ALL_ADMIN_PERMISSIONS };
  }

  // 1. Probar en Supabase (perfiles_acceso o perfiles)
  if (isServerSupabaseConfigured()) {
    try {
      const supabase = await createServerSupabaseClient();
      for (const tableName of ["perfiles_acceso", "perfiles"] as const) {
        const { data } = await supabase
          .from(tableName)
          .select("permisos")
          .or(`id.eq.${perfilNombreOrId},nombre_perfil.ilike.${cleanName}`)
          .maybeSingle();

        if (data?.permisos && typeof data.permisos === "object") {
          return buildNormalizedPermisosMatrix(data.permisos as Record<string, string>);
        }
      }
    } catch {
      // Fallback
    }
  }

  // 2. Probar en Local DB
  try {
    const db = readLocalDb();
    const found = (db.perfiles || []).find(
      (p) =>
        p.id === perfilNombreOrId ||
        p.nombre_perfil.toUpperCase() === cleanName
    );
    if (found?.permisos) {
      return buildNormalizedPermisosMatrix(found.permisos as Record<string, string>);
    }
  } catch {
    // Fallback
  }

  return {};
}

/**
 * Obtiene la sesión y matriz de permisos del usuario actual desde cookies o Supabase Auth
 */
export async function getServerUserSession(): Promise<TensaconUserSession> {
  const cookieStore = await cookies();
  const rawCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (rawCookie) {
    try {
      const parsed = JSON.parse(decodeURIComponent(rawCookie));
      const perfilNormalized = String(parsed.perfil || "").trim().toUpperCase();
      const esAdmin =
        perfilNormalized === "ADMINISTRADOR" || Boolean(parsed.esAdmin);

      let permisosMap = parsed.permisos;

      // Si los permisos no vienen en la cookie o están vacíos, resolverlos dinámicamente
      if (!permisosMap || Object.keys(permisosMap).length === 0) {
        if (esAdmin) {
          permisosMap = { ...ALL_ADMIN_PERMISSIONS };
        } else {
          permisosMap = await getPermisosForPerfil(
            parsed.perfilId || perfilNormalized
          );
        }
      }

      return {
        id: parsed.id,
        usuario: parsed.usuario || "usuario",
        nombre: parsed.nombre || "Usuario Sistema",
        perfil: perfilNormalized || "CONSULTA",
        perfilId: parsed.perfilId,
        esAdmin,
        permisos: permisosMap || {},
      };
    } catch {
      // Ignorar error de parsing
    }
  }

  // 2. Verificar si hay sesión activa en Supabase Auth
  if (isServerSupabaseConfigured()) {
    try {
      const supabase = await createServerSupabaseClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        // Buscar el usuario en la tabla de usuarios del sistema
        const { data: usuarioDb } = await supabase
          .from("usuarios_sistema")
          .select("*, perfiles:perfiles_acceso(nombre_perfil, permisos)")
          .or(`correo.eq.${user.email},usuario.eq.${user.email?.split("@")[0]}`)
          .maybeSingle();

        const perfilName = (
          usuarioDb?.perfil_nombre ||
          usuarioDb?.perfiles?.nombre_perfil ||
          user.user_metadata?.perfil ||
          user.app_metadata?.role ||
          "ADMINISTRADOR"
        )
          .toString()
          .trim()
          .toUpperCase();

        const esAdmin = perfilName === "ADMINISTRADOR";
        let permisosMap = usuarioDb?.perfiles?.permisos;

        if (esAdmin) {
          permisosMap = { ...ALL_ADMIN_PERMISSIONS };
        } else if (!permisosMap) {
          permisosMap = await getPermisosForPerfil(
            usuarioDb?.perfil_id || perfilName
          );
        }

        return {
          id: user.id,
          usuario: usuarioDb?.usuario || user.email?.split("@")[0] || "admin",
          nombre:
            usuarioDb?.nombre ||
            user.user_metadata?.full_name ||
            "Usuario Tensacon",
          perfil: perfilName,
          perfilId: usuarioDb?.perfil_id,
          esAdmin,
          permisos: permisosMap || {},
        };
      }
    } catch {
      // Fallback a modo local
    }
  }

  // 3. Fallback de desarrollo/demostración: Cedrix Vargas (ADMINISTRADOR)
  return {
    id: "usr-1",
    usuario: "cvargas",
    nombre: "Cedrix Vargas",
    perfil: "ADMINISTRADOR",
    esAdmin: true,
    permisos: { ...ALL_ADMIN_PERMISSIONS },
  };
}

/**
 * Verifica si el usuario actual cuenta con rol de ADMINISTRADOR
 */
export async function assertIsAdmin(): Promise<{
  authorized: boolean;
  error?: string;
}> {
  const session = await getServerUserSession();
  if (!session.esAdmin) {
    return {
      authorized: false,
      error: `Acceso denegado: El perfil actual (${session.perfil}) no tiene permisos para realizar esta acción. Solo el rol ADMINISTRADOR está autorizado.`,
    };
  }
  return { authorized: true };
}
