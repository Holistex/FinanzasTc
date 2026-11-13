/**
 * Helper centralizado de control de acceso basado en roles y permisos (RBAC).
 * Usado en Server Components, Client Components y Server Actions.
 */

export type AccessLevel = "GESTION" | "LECTURA" | "SIN_ACCESO";

export interface ModuleAccessResult {
  canView: boolean;
  canManage: boolean;
  isReadOnly: boolean;
}

export interface UserAccessSubject {
  tipo_perfil?: string;
  perfil?: string;
  esAdmin?: boolean;
  permisos?: Record<string, string>;
}

const KEY_ALIASES: Record<string, string[]> = {
  ventas_global: ["ventas_tensacon"],
  ventas_tensacon: ["ventas_global"],
  compras_global: ["compras_tensacon"],
  compras_tensacon: ["compras_global"],
  historico_pagos_compras: ["historico_pagos"],
  historico_pagos: ["historico_pagos_compras"],
  garantias_boletas: ["boletas_garantias", "gestion_garantias"],
  boletas_garantias: ["garantias_boletas", "gestion_garantias"],
  garantias_polizas: ["polizas_garantias", "gestion_garantias"],
  polizas_garantias: ["garantias_polizas", "gestion_garantias"],
  mantenedor_factoring: ["mantenedores"],
  mantenedores: ["mantenedor_factoring"],
  mantenedor_mandantes_companias: ["mandantes_companias"],
  mandantes_companias: ["mantenedor_mandantes_companias"],
  maestro_usuarios: ["configuracion_adm"],
  adm_perfiles: ["configuracion_adm"],
  configuracion_adm: ["adm_perfiles", "maestro_usuarios"],
};

function classifyRawPermission(rawValue?: string | null): AccessLevel {
  if (!rawValue) return "SIN_ACCESO";
  const raw = String(rawValue).trim().toUpperCase();
  if (
    raw === "GESTION" ||
    raw === "EDICION" ||
    raw === "EDICION_ESCRITURA" ||
    raw === "ESCRITURA" ||
    raw === "ADMIN" ||
    raw === "TOTAL"
  ) {
    return "GESTION";
  }
  if (
    raw === "LECTURA" ||
    raw === "SOLO_LECTURA" ||
    raw === "SOLO LECTURA" ||
    raw === "CONSULTA" ||
    raw === "VER"
  ) {
    return "LECTURA";
  }
  return "SIN_ACCESO";
}

export function getModuleAccess(
  user: UserAccessSubject | null | undefined,
  moduleKeys: string[]
): ModuleAccessResult {
  if (!user) return { canView: false, canManage: false, isReadOnly: false };

  const perfil = String(user.tipo_perfil || user.perfil || "")
    .trim()
    .toUpperCase();
  if (user.esAdmin || perfil === "ADMINISTRADOR") {
    return { canView: true, canManage: true, isReadOnly: false };
  }

  const permisos = user.permisos || {};
  let highest: AccessLevel = "SIN_ACCESO";

  for (const key of moduleKeys) {
    const candidates = [key, ...(KEY_ALIASES[key] || [])];
    for (const candidate of candidates) {
      const level = classifyRawPermission(permisos[candidate]);
      if (level === "GESTION") {
        highest = "GESTION";
        break;
      }
      if (level === "LECTURA") {
        highest = "LECTURA";
      }
    }
    if (highest === "GESTION") break;
  }

  return {
    canView: highest === "GESTION" || highest === "LECTURA",
    canManage: highest === "GESTION",
    isReadOnly: highest === "LECTURA",
  };
}
