import { QueryClient } from "@tanstack/react-query";

/**
 * Mapeo de query keys unificados para toda la aplicación.
 */
export const QUERY_KEYS = {
  litigiosJuicios: ["litigios-juicios"] as const,
  litigiosMultas: ["litigios-multas"] as const,
  litigiosComparendos: ["litigios-comparendos"] as const,
  litigiosCalendario: ["litigios-calendario"] as const,
  garantiasBoletas: ["garantias", "BOLETA"] as const,
  garantiasPolizas: ["garantias", "POLIZA"] as const,
  facturasVentas: (page: number = 1, pageSize: number = 15) =>
    ["facturas-ventas", { page, pageSize }] as const,
  factoringClientes: ["factoring-clientes"] as const,
  gestionCobranza: ["gestion-cobranza"] as const,
  facturasCompras: (tab: string = "CARTERA", page: number = 1) =>
    ["facturas-compras", { tab, page }] as const,
  historicoPagos: ["historico-pagos"] as const,
  compromisosCompras: ["compromisos-compras"] as const,
  deudaProveedores: ["deuda-proveedores"] as const,
  mantenedores: ["mantenedores-factoring"] as const,
  mandantesCompanias: ["mandantes-companias"] as const,
  usuarios: ["maestro-usuarios"] as const,
  perfiles: ["adm-perfiles"] as const,
};

const STALE_TIME = 5 * 60 * 1000; // 5 minutos

/**
 * Precarga silenciosa en segundo plano (prefetch) de datos de la ruta al pasar el cursor (onMouseEnter).
 * Utiliza imports dinámicos para no recargar el bundle inicial del Sidebar.
 */
export async function prefetchRouteData(
  queryClient: QueryClient,
  href: string
): Promise<void> {
  try {
    if (href.startsWith("/reg-litigios/juicios")) {
      if (queryClient.getQueryData(QUERY_KEYS.litigiosJuicios)) return;
      const { getLitigiosJuiciosAction } = await import("@/actions/litigios.actions");
      queryClient.prefetchQuery({
        queryKey: QUERY_KEYS.litigiosJuicios,
        queryFn: () => getLitigiosJuiciosAction(),
        staleTime: STALE_TIME,
      });
      return;
    }

    if (href.startsWith("/reg-litigios/multas")) {
      if (queryClient.getQueryData(QUERY_KEYS.litigiosMultas)) return;
      const { getLitigiosMultasAction } = await import("@/actions/litigios.actions");
      queryClient.prefetchQuery({
        queryKey: QUERY_KEYS.litigiosMultas,
        queryFn: () => getLitigiosMultasAction(),
        staleTime: STALE_TIME,
      });
      return;
    }

    if (href.startsWith("/reg-litigios/comparendos")) {
      if (queryClient.getQueryData(QUERY_KEYS.litigiosComparendos)) return;
      const { getLitigiosComparendosAction } = await import("@/actions/litigios.actions");
      queryClient.prefetchQuery({
        queryKey: QUERY_KEYS.litigiosComparendos,
        queryFn: () => getLitigiosComparendosAction(),
        staleTime: STALE_TIME,
      });
      return;
    }

    if (href.startsWith("/reg-litigios/calendario")) {
      if (queryClient.getQueryData(QUERY_KEYS.litigiosCalendario)) return;
      const { getCalendarioLitigiosAction } = await import("@/actions/litigios.actions");
      queryClient.prefetchQuery({
        queryKey: QUERY_KEYS.litigiosCalendario,
        queryFn: () => getCalendarioLitigiosAction(),
        staleTime: STALE_TIME,
      });
      return;
    }

    if (href.startsWith("/gestion-garantias/boletas-garantias")) {
      if (queryClient.getQueryData(QUERY_KEYS.garantiasBoletas)) return;
      const { getBoletasGarantiasAction } = await import("@/actions/garantias.actions");
      queryClient.prefetchQuery({
        queryKey: QUERY_KEYS.garantiasBoletas,
        queryFn: () => getBoletasGarantiasAction(),
        staleTime: STALE_TIME,
      });
      return;
    }

    if (href.startsWith("/gestion-garantias/polizas-garantias")) {
      if (queryClient.getQueryData(QUERY_KEYS.garantiasPolizas)) return;
      const { getPolizasGarantiasAction } = await import("@/actions/garantias.actions");
      queryClient.prefetchQuery({
        queryKey: QUERY_KEYS.garantiasPolizas,
        queryFn: () => getPolizasGarantiasAction(),
        staleTime: STALE_TIME,
      });
      return;
    }

    if (href.startsWith("/compras-tensacon/compromisos")) {
      if (queryClient.getQueryData(QUERY_KEYS.compromisosCompras)) return;
      const { getCompromisosComprasAction } = await import(
        "@/actions/compras-historico-compromisos.actions"
      );
      queryClient.prefetchQuery({
        queryKey: QUERY_KEYS.compromisosCompras,
        queryFn: () => getCompromisosComprasAction(),
        staleTime: STALE_TIME,
      });
      return;
    }

    if (href.startsWith("/compras-tensacon/historico-pagos")) {
      if (queryClient.getQueryData(QUERY_KEYS.historicoPagos)) return;
      const { getHistoricoPagosComprasAction } = await import(
        "@/actions/compras-historico-compromisos.actions"
      );
      queryClient.prefetchQuery({
        queryKey: QUERY_KEYS.historicoPagos,
        queryFn: () => getHistoricoPagosComprasAction(),
        staleTime: STALE_TIME,
      });
      return;
    }

    if (href.startsWith("/compras-tensacon/deuda-proveedores")) {
      if (queryClient.getQueryData(QUERY_KEYS.deudaProveedores)) return;
      const { getDeudaProveedoresMensualAction } = await import(
        "@/actions/deuda-proveedores.actions"
      );
      queryClient.prefetchQuery({
        queryKey: QUERY_KEYS.deudaProveedores,
        queryFn: () => getDeudaProveedoresMensualAction(),
        staleTime: STALE_TIME,
      });
      return;
    }

    if (href.startsWith("/finanzas/facturas-ventas/factoring-clientes")) {
      if (queryClient.getQueryData(QUERY_KEYS.factoringClientes)) return;
      const { getFactoringClientesAction } = await import("@/actions/mantenedores.actions");
      queryClient.prefetchQuery({
        queryKey: QUERY_KEYS.factoringClientes,
        queryFn: () => getFactoringClientesAction(),
        staleTime: STALE_TIME,
      });
      return;
    }

    if (href.startsWith("/ventas-tensacon/gestion-cobranza")) {
      if (queryClient.getQueryData(QUERY_KEYS.gestionCobranza)) return;
      const { getCarteraCobranzaAction } = await import("@/actions/gestion-cobranza.actions");
      queryClient.prefetchQuery({
        queryKey: QUERY_KEYS.gestionCobranza,
        queryFn: () => getCarteraCobranzaAction(),
        staleTime: STALE_TIME,
      });
      return;
    }
  } catch {
    // Fails silently if offline or on network jitter
  }
}
