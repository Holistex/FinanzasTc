/**
 * Utilidades de control de acceso basado en roles y permisos (RBAC)
 * Finanzas Tensacon
 */

export interface UserSessionData {
  id?: string;
  usuario?: string;
  nombre?: string;
  perfil?: string;
  esAdmin?: boolean;
  permisos?: Record<string, string>;
}

export type PermissionLevel = "SIN_ACCESO" | "LECTURA" | "GESTION";

/**
 * Normaliza cualquier variante de permiso a los 3 niveles estándar
 */
export function normalizePermiso(val?: string | null): PermissionLevel {
  if (!val) return "SIN_ACCESO";
  const v = val.trim().toUpperCase();
  if (
    v === "GESTION" ||
    v === "EDICION_ESCRITURA" ||
    v === "ESCRITURA" ||
    v === "ADMIN" ||
    v === "TOTAL"
  ) {
    return "GESTION";
  }
  if (
    v === "LECTURA" ||
    v === "SOLO_LECTURA" ||
    v === "CONSULTA" ||
    v === "VER"
  ) {
    return "LECTURA";
  }
  return "SIN_ACCESO";
}

const MODULE_KEY_ALIASES: Record<string, string[]> = {
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

/**
 * Evalúa si el usuario o perfil cuenta con el nivel de permiso requerido para un módulo
 */
export function hasPermission(
  sessionOrPermisos?: UserSessionData | Record<string, string> | null,
  moduleKey?: string,
  requiredMode: "LECTURA" | "GESTION" = "LECTURA"
): boolean {
  if (!sessionOrPermisos || !moduleKey) return false;

  // Si es un objeto de sesión de usuario
  if (
    typeof sessionOrPermisos === "object" &&
    ("esAdmin" in sessionOrPermisos || "perfil" in sessionOrPermisos)
  ) {
    const session = sessionOrPermisos as UserSessionData;
    // Administrador siempre tiene acceso total a todos los módulos
    if (session.esAdmin || session.perfil?.toUpperCase() === "ADMINISTRADOR") {
      return true;
    }

    return hasPermission(session.permisos, moduleKey, requiredMode);
  }

  const permisosMap = sessionOrPermisos as Record<string, string>;
  let rawPermiso = permisosMap[moduleKey];

  // Si no tiene permiso explícito en la clave solicitada, revisar alias legados
  if (rawPermiso === undefined || rawPermiso === null || rawPermiso === "") {
    const aliases = MODULE_KEY_ALIASES[moduleKey] || [];
    for (const alias of aliases) {
      if (permisosMap[alias] !== undefined && permisosMap[alias] !== null && permisosMap[alias] !== "") {
        rawPermiso = permisosMap[alias];
        break;
      }
    }
  }

  // Si consulta por el calendario y no tiene permiso explícito, hereda de cualquier submódulo de litigios
  if (
    (rawPermiso === undefined || rawPermiso === null || rawPermiso === "") &&
    moduleKey === "litigios_calendario"
  ) {
    rawPermiso =
      permisosMap["reg_litigios"] ||
      permisosMap["litigios_juicios"] ||
      permisosMap["litigios_multas"] ||
      permisosMap["litigios_comparendos"];
  }

  // Si consulta por mantenedor_on y no tiene permiso explícito, hereda de configuración o mantenedores
  if (
    (rawPermiso === undefined || rawPermiso === null || rawPermiso === "") &&
    moduleKey === "mantenedor_on"
  ) {
    rawPermiso =
      permisosMap["configuracion_adm"] ||
      permisosMap["mantenedores"] ||
      permisosMap["mantenedor_factoring"] ||
      permisosMap["adm_perfiles"];
  }

  // Si consulta por mantenedor_colaboradores y no tiene permiso explícito en perfil legado
  if (
    (rawPermiso === undefined || rawPermiso === null || rawPermiso === "") &&
    moduleKey === "mantenedor_colaboradores"
  ) {
    rawPermiso = permisosMap["configuracion_adm"] || permisosMap["mantenedores"];
  }

  const nivel = normalizePermiso(rawPermiso);

  if (nivel === "SIN_ACCESO") return false;
  if (requiredMode === "LECTURA") return nivel === "LECTURA" || nivel === "GESTION";
  if (requiredMode === "GESTION") return nivel === "GESTION";

  return false;
}

/**
 * Mapeo de rutas URL a claves de módulos de la matriz de permisos
 */
export const ROUTE_MODULE_MAP: Array<{
  prefix: string;
  moduleKey: string;
  exact?: boolean;
}> = [
  // Ventas Tensacon
  { prefix: "/finanzas/facturas-ventas/factoring-clientes", moduleKey: "factoring_clientes" },
  { prefix: "/finanzas/facturas-ventas/gestion-cobranza", moduleKey: "gestion_cobranza" },
  { prefix: "/ventas-tensacon/gestion-cobranza", moduleKey: "gestion_cobranza" },
  { prefix: "/finanzas/facturas-ventas", moduleKey: "facturas_ventas" },
  { prefix: "/ventas-tensacon/facturas-ventas", moduleKey: "facturas_ventas" },
  { prefix: "/ventas-tensacon", moduleKey: "ventas_global" },

  // Compras Tensacon
  { prefix: "/compras-tensacon/facturas-compras", moduleKey: "facturas_compras" },
  { prefix: "/compras-tensacon/historico-pagos", moduleKey: "historico_pagos_compras" },
  { prefix: "/compras-tensacon/compromisos", moduleKey: "compromisos_compras" },
  { prefix: "/compras-tensacon/deuda-proveedores", moduleKey: "facturas_compras" },
  { prefix: "/compras-tensacon", moduleKey: "compras_global" },

  // Tesorería
  { prefix: "/tesoreria/cartolas-bancarias", moduleKey: "tesoreria_saldos" },
  { prefix: "/tesoreria/saldos-bancarios", moduleKey: "tesoreria_saldos" },
  { prefix: "/tesoreria/pagos", moduleKey: "tesoreria_pagos" },

  // Gestión Garantías
  { prefix: "/gestion-garantias/boletas-garantias", moduleKey: "garantias_boletas" },
  { prefix: "/gestion-garantias/polizas-garantias", moduleKey: "garantias_polizas" },
  { prefix: "/gestion-garantias", moduleKey: "garantias_boletas" },

  // Reg. Litigios
  { prefix: "/reg-litigios/multas", moduleKey: "litigios_multas" },
  { prefix: "/reg-litigios/comparendos", moduleKey: "litigios_comparendos" },
  { prefix: "/reg-litigios/juicios", moduleKey: "litigios_juicios" },
  { prefix: "/reg-litigios/calendario", moduleKey: "litigios_calendario" },
  { prefix: "/reg-litigios", moduleKey: "litigios_multas" },

  // Configuración & Mantenedores
  { prefix: "/configuracion/mantenedor-on", moduleKey: "mantenedor_on" },
  { prefix: "/configuracion/colaboradores", moduleKey: "mantenedor_colaboradores" },
  { prefix: "/configuracion/mantenedores-factoring", moduleKey: "mantenedor_factoring" },
  { prefix: "/mantenedores", moduleKey: "mantenedor_factoring" },
  { prefix: "/configuracion/mandantes-companias", moduleKey: "mantenedor_mandantes_companias" },
  { prefix: "/configuracion/maestro-usuarios", moduleKey: "maestro_usuarios" },
  { prefix: "/configuracion/adm-perfiles", moduleKey: "adm_perfiles" },
  { prefix: "/configuracion", moduleKey: "adm_perfiles" },
];

/**
 * Retorna la clave del módulo asignada a una ruta específica
 */
export function getModuleForRoute(pathname: string): string | null {
  for (const item of ROUTE_MODULE_MAP) {
    if (item.exact ? pathname === item.prefix : pathname.startsWith(item.prefix)) {
      return item.moduleKey;
    }
  }
  return null;
}

/**
 * Valida si la sesión actual tiene autorización para navegar a una ruta
 */
export function isRouteAllowed(
  session?: UserSessionData | null,
  pathname: string = ""
): boolean {
  if (!session) return false;
  if (session.esAdmin || session.perfil?.toUpperCase() === "ADMINISTRADOR") {
    return true;
  }

  // Rutas siempre autorizadas para cualquier usuario con sesión activa
  if (
    pathname === "/" ||
    pathname === "/bienvenida" ||
    pathname === "/dashboard" ||
    pathname === "/login"
  ) {
    return true;
  }

  const moduleKey = getModuleForRoute(pathname);
  if (!moduleKey) {
    // Si la ruta no está explícitamente restringida por un módulo, permitir
    return true;
  }

  return hasPermission(session, moduleKey, "LECTURA");
}
