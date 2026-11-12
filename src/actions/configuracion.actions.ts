"use server";

import { revalidatePath } from "next/cache";
import {
  createServerSupabaseClient,
  isServerSupabaseConfigured,
} from "@/lib/supabase/server";
import { readLocalDb, writeLocalDb } from "@/lib/supabase/local-fallback-db";
import {
  PerfilUsuario,
  UsuarioSistema,
  buildNormalizedPermisosMatrix,
} from "@/types/database.types";

function mapPerfilRow(row: Record<string, unknown>): PerfilUsuario {
  return {
    id: String(row.id),
    nombre_perfil: String(row.nombre_perfil || row.nombre || ""),
    descripcion:
      row.descripcion !== null && row.descripcion !== undefined
        ? String(row.descripcion)
        : null,
    permisos: buildNormalizedPermisosMatrix(
      (row.permisos as Record<string, string>) || {}
    ),
    created_at: String(row.created_at || new Date().toISOString()),
    updated_at: row.updated_at ? String(row.updated_at) : undefined,
  };
}

/**
 * Obtiene todos los perfiles de usuario con su matriz de permisos
 */
export async function getPerfilesAction(): Promise<PerfilUsuario[]> {
  if (isServerSupabaseConfigured()) {
    try {
      const supabase = await createServerSupabaseClient();
      const { data, error } = await supabase
        .from("perfiles_acceso")
        .select("*")
        .order("created_at", { ascending: true });

      if (!error && data && data.length > 0) {
        return (data as Array<Record<string, unknown>>).map((row) => ({
          id: String(row.id),
          nombre_perfil: String(row.nombre_perfil || row.tipo_perfil || row.nombre || ""),
          descripcion:
            row.descripcion !== null && row.descripcion !== undefined
              ? String(row.descripcion)
              : null,
          permisos: buildNormalizedPermisosMatrix(
            (row.permisos as Record<string, string>) || {}
          ),
          created_at: String(row.created_at || new Date().toISOString()),
          updated_at: row.updated_at ? String(row.updated_at) : undefined,
        }));
      }
    } catch {
      // Si la tabla no existe en Supabase, recurrir al store local
    }
  }

  const db = readLocalDb();
  return (db.perfiles || []).map((p) => ({
    ...p,
    permisos: buildNormalizedPermisosMatrix(p.permisos as Record<string, string>),
  }));
}

/**
 * Guarda o actualiza un perfil de usuario con su matriz de permisos
 */
export async function savePerfilAction(
  payload: {
    id?: string;
    nombre_perfil: string;
    descripcion?: string | null;
    permisos: Record<string, any>;
  }
): Promise<PerfilUsuario> {
  const nombreLimpio = payload.nombre_perfil.trim().toUpperCase();
  if (!nombreLimpio) {
    throw new Error("El nombre del perfil es obligatorio.");
  }

  const permisosNormalizados = buildNormalizedPermisosMatrix(payload.permisos);
  const nowIso = new Date().toISOString();

  if (isServerSupabaseConfigured()) {
    try {
      const supabase = await createServerSupabaseClient();
      let lastError: any = null;

      if (payload.id) {
        // Intentar actualizar en perfiles_acceso
        const { data, error } = await supabase
          .from("perfiles_acceso")
          .update({
            tipo_perfil: nombreLimpio,
            nombre_perfil: nombreLimpio,
            nombre: nombreLimpio,
            descripcion: payload.descripcion?.trim() || null,
            permisos: permisosNormalizados,
            updated_at: nowIso,
          })
          .eq("id", payload.id)
          .select();

        if (error) {
          lastError = error;
        } else if (data && data.length > 0) {
          revalidatePath("/configuracion/adm-perfiles");
          revalidatePath("/configuracion/maestro-usuarios");
          return mapPerfilRow(data[0] as Record<string, unknown>);
        }
      } else {
        const { data, error } = await supabase
          .from("perfiles_acceso")
          .insert({
            tipo_perfil: nombreLimpio,
            nombre_perfil: nombreLimpio,
            nombre: nombreLimpio,
            descripcion: payload.descripcion?.trim() || null,
            permisos: permisosNormalizados,
          })
          .select();

        if (error) {
          lastError = error;
        } else if (data && data.length > 0) {
          revalidatePath("/configuracion/adm-perfiles");
          revalidatePath("/configuracion/maestro-usuarios");
          return mapPerfilRow(data[0] as Record<string, unknown>);
        }
      }

      if (lastError) {
        throw new Error(`Error en Supabase (perfiles_acceso): ${lastError.message}`);
      }
    } catch (err: any) {
      console.error("[savePerfilAction] Error:", err);
      throw err instanceof Error ? err : new Error(String(err));
    }
  }

  // Fallback Local
  const db = readLocalDb();
  let result: PerfilUsuario;

  if (payload.id) {
    const idx = db.perfiles.findIndex((p) => p.id === payload.id);
    if (idx === -1) {
      throw new Error("Perfil no encontrado.");
    }
    db.perfiles[idx] = {
      ...db.perfiles[idx],
      nombre_perfil: nombreLimpio,
      descripcion: payload.descripcion?.trim() || null,
      permisos: permisosNormalizados,
      updated_at: nowIso,
    };
    result = db.perfiles[idx];
  } else {
    // Validar nombre duplicado
    if (db.perfiles.some((p) => p.nombre_perfil === nombreLimpio)) {
      throw new Error(`Ya existe un perfil registrado con el nombre "${nombreLimpio}".`);
    }

    result = {
      id: `perf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      nombre_perfil: nombreLimpio,
      descripcion: payload.descripcion?.trim() || null,
      permisos: permisosNormalizados,
      created_at: nowIso,
    };
    db.perfiles.push(result);
  }

  writeLocalDb(db);
  revalidatePath("/configuracion/adm-perfiles");
  revalidatePath("/configuracion/maestro-usuarios");
  return result;
}

/**
 * Elimina un perfil de usuario
 */
export async function deletePerfilAction(id: string): Promise<{ success: boolean }> {
  // Validar si existen usuarios asignados a este perfil
  const db = readLocalDb();
  const usuariosAsociados = (db.usuarios || []).filter((u) => u.perfil_id === id);
  if (usuariosAsociados.length > 0) {
    throw new Error(
      `No se puede eliminar este perfil porque está asignado a ${usuariosAsociados.length} usuario(s).`
    );
  }

  if (isServerSupabaseConfigured()) {
    try {
      const supabase = await createServerSupabaseClient();
      const { error } = await supabase.from("perfiles_acceso").delete().eq("id", id);
      if (error) {
        throw new Error(`Error al eliminar perfil en Supabase (perfiles_acceso): ${error.message}`);
      }
    } catch (err: any) {
      console.error("[deletePerfilAction] Error:", err);
      throw err instanceof Error ? err : new Error(String(err));
    }
  }

  db.perfiles = db.perfiles.filter((p) => p.id !== id);
  writeLocalDb(db);

  revalidatePath("/configuracion/adm-perfiles");
  revalidatePath("/configuracion/maestro-usuarios");
  return { success: true };
}

/**
 * Obtiene todos los usuarios del sistema, enriqueciendo con el nombre de su perfil
 */
export async function getUsuariosAction(): Promise<UsuarioSistema[]> {
  const perfiles = await getPerfilesAction();
  const perfilMap = new Map(perfiles.map((p) => [p.id, p.nombre_perfil]));

  if (isServerSupabaseConfigured()) {
    try {
      const supabase = await createServerSupabaseClient();
      const res = await supabase
        .from("usuarios_sistema")
        .select("*")
        .order("created_at", { ascending: false });

      if (!res.error && res.data && res.data.length > 0) {
        return (res.data as Array<Record<string, unknown>>).map((u) => {
          const perfilId = String(u.perfil_id || u.perfil || "");
          return {
            id: String(u.id),
            nombre: String(u.nombre || ""),
            usuario: String(u.usuario || ""),
            contrasena: String(u.password_text || u.contrasena || ""),
            correo: String(u.correo || u.email || ""),
            perfil_id: perfilId,
            perfil_nombre: perfilMap.get(perfilId) || String(u.perfil || "Sin Perfil"),
            estado: (u.estado as "Activo" | "Inactivo") || "Activo",
            created_at: String(u.created_at || new Date().toISOString()),
            updated_at: u.updated_at ? String(u.updated_at) : undefined,
          };
        });
      }
    } catch {
      // Fallback
    }
  }

  const db = readLocalDb();
  return (db.usuarios || []).map((u) => ({
    ...u,
    perfil_nombre: perfilMap.get(u.perfil_id) || u.perfil_nombre || "Sin Perfil",
  }));
}

/**
 * Guarda o actualiza un usuario en el Maestro de Usuarios
 */
export async function saveUsuarioAction(
  payload: {
    id?: string;
    usuarioOriginal?: string;
    nombre: string;
    usuario: string;
    contrasena: string;
    correo: string;
    perfil_id: string;
    estado?: "Activo" | "Inactivo";
  }
): Promise<UsuarioSistema> {
  const nombre = payload.nombre.trim();
  const username = payload.usuario.trim().toLowerCase().replace(/^@+/, "");
  const usuarioOriginal = (payload.usuarioOriginal || username).trim().toLowerCase().replace(/^@+/, "");
  const contrasena = payload.contrasena.trim();
  const correo = payload.correo.trim().toLowerCase();
  const perfil_id = payload.perfil_id;
  const estado = payload.estado || "Activo";

  if (!nombre) throw new Error("El nombre completo es requerido.");
  if (!username) throw new Error("El identificador de usuario es requerido.");
  if (!contrasena) throw new Error("La contraseña es requerida.");
  if (!correo) throw new Error("El correo electrónico es requerido.");
  if (!perfil_id) throw new Error("Debe seleccionar un Tipo de Perfil.");

  const nowIso = new Date().toISOString();
  const perfiles = await getPerfilesAction();
  const perfilObj = perfiles.find((p) => p.id === perfil_id);
  const perfilNombre = perfilObj?.nombre_perfil || "USUARIO";

  if (isServerSupabaseConfigured()) {
    try {
      const supabase = await createServerSupabaseClient();
      if (payload.id) {
        // Intentar actualizar por id
        let { data, error } = await supabase
          .from("usuarios_sistema")
          .update({
            nombre,
            usuario: username,
            password_text: contrasena,
            contrasena,
            correo,
            perfil_id,
            perfil: perfilNombre,
            estado,
            updated_at: nowIso,
          })
          .eq("id", payload.id)
          .select();

        // Si no coincidió por ID o no devolvió registros, intentar por username original
        if (!error && (!data || data.length === 0) && usuarioOriginal) {
          const fallbackRes = await supabase
            .from("usuarios_sistema")
            .update({
              nombre,
              usuario: username,
              password_text: contrasena,
              contrasena,
              correo,
              perfil_id,
              perfil: perfilNombre,
              estado,
              updated_at: nowIso,
            })
            .eq("usuario", usuarioOriginal)
            .select();

          if (!fallbackRes.error && fallbackRes.data && fallbackRes.data.length > 0) {
            data = fallbackRes.data;
            error = null;
          }
        }

        if (error) {
          throw new Error(`Error al actualizar usuario en Supabase (usuarios_sistema): ${error.message}`);
        }

        if (data && data.length > 0) {
          revalidatePath("/configuracion/maestro-usuarios");
          revalidatePath("/bienvenida");
          return {
            ...(data[0] as UsuarioSistema),
            perfil_nombre: perfilNombre,
          };
        }
      } else {
        const { data, error } = await supabase
          .from("usuarios_sistema")
          .insert({
            nombre,
            usuario: username,
            password_text: contrasena,
            contrasena,
            correo,
            perfil_id,
            perfil: perfilNombre,
            estado,
          })
          .select()
          .single();

        if (error) {
          throw new Error(`Error al crear usuario en Supabase (usuarios_sistema): ${error.message}`);
        }

        if (data) {
          revalidatePath("/configuracion/maestro-usuarios");
          revalidatePath("/bienvenida");
          return {
            ...(data as UsuarioSistema),
            perfil_nombre: perfilNombre,
          };
        }
      }
    } catch (err: any) {
      throw err instanceof Error ? err : new Error(String(err));
    }
  }

  // Fallback Local
  const db = readLocalDb();
  let result: UsuarioSistema;

  if (payload.id) {
    let idx = db.usuarios.findIndex((u) => u.id === payload.id);
    if (idx === -1 && usuarioOriginal) {
      idx = db.usuarios.findIndex((u) => u.usuario.toLowerCase() === usuarioOriginal);
    }
    if (idx === -1) throw new Error("Usuario no encontrado.");
    db.usuarios[idx] = {
      ...db.usuarios[idx],
      nombre,
      usuario: username,
      contrasena,
      correo,
      perfil_id,
      perfil_nombre: perfilNombre,
      estado,
      updated_at: nowIso,
    };
    result = db.usuarios[idx];
  } else {
    // Validar usuario duplicado
    if (db.usuarios.some((u) => u.usuario.toLowerCase() === username)) {
      throw new Error(`El nombre de usuario "${username}" ya se encuentra registrado.`);
    }

    result = {
      id: `usr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      nombre,
      usuario: username,
      contrasena,
      correo,
      perfil_id,
      perfil_nombre: perfilNombre,
      estado,
      created_at: nowIso,
    };
    db.usuarios.unshift(result);
  }

  writeLocalDb(db);
  revalidatePath("/configuracion/maestro-usuarios");
  revalidatePath("/bienvenida");
  return result;
}

/**
 * Elimina un usuario del sistema
 */
export async function deleteUsuarioAction(id: string): Promise<{ success: boolean }> {
  if (isServerSupabaseConfigured()) {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.from("usuarios_sistema").delete().eq("id", id);
    if (error) {
      throw new Error(`Error al eliminar usuario en Supabase (usuarios_sistema): ${error.message}`);
    }
    revalidatePath("/configuracion/maestro-usuarios");
    revalidatePath("/bienvenida");
    return { success: true };
  }

  const db = readLocalDb();
  db.usuarios = db.usuarios.filter((u) => u.id !== id);
  writeLocalDb(db);

  revalidatePath("/configuracion/maestro-usuarios");
  return { success: true };
}
