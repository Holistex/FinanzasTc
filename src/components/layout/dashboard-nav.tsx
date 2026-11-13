"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Building2,
  FileSpreadsheet,
  Landmark,
  ShieldCheck,
  Database,
  ChevronRight,
  ChevronDown,
  Layers,
  Receipt,
  Users,
  Shield,
  PhoneCall,
  ShoppingCart,
  History,
  CalendarClock,
  LogOut,
  Home,
  Briefcase,
  Settings,
  Scale,
  Gavel,
  FileWarning,
  CalendarDays,
  FolderKanban,
  LineChart,
  UserCheck,
  Banknote,
  Menu,
  X,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { TensaconUserSession } from "@/lib/auth/session";
import { logoutAction } from "@/actions/auth.actions";
import { hasPermission } from "@/lib/auth/permissions";
import { prefetchRouteData } from "@/lib/prefetch-helpers";

// Componente memoizado para enlaces de nivel superior con prefetch silencioso al pasar el cursor
const SidebarTopLink = React.memo(function SidebarTopLink({
  href,
  isActive,
  icon: Icon,
  label,
  queryClient,
  router,
}: {
  href: string;
  isActive: boolean;
  icon: React.ElementType;
  label: string;
  queryClient: any;
  router: any;
}) {
  const handlePrefetch = React.useCallback(() => {
    router.prefetch(href);
    prefetchRouteData(queryClient, href);
  }, [href, queryClient, router]);

  return (
    <Link
      href={href}
      prefetch={false}
      onMouseEnter={handlePrefetch}
      onTouchStart={handlePrefetch}
      className={cn(
        "group flex items-center justify-between rounded-md px-2.5 py-2 text-xs font-semibold transition-all",
        isActive
          ? "bg-[#E05A10] text-white shadow-sm"
          : "text-slate-300 hover:bg-[#1E293B]/60 hover:text-white"
      )}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <Icon
          className={cn(
            "h-4 w-4 shrink-0 transition-colors",
            isActive ? "text-white" : "text-slate-400 group-hover:text-slate-300"
          )}
        />
        <span className="truncate">{label}</span>
      </div>
      <ChevronRight
        className={cn(
          "h-3.5 w-3.5 shrink-0 transition-transform",
          isActive
            ? "text-white translate-x-0.5"
            : "text-slate-600 opacity-0 group-hover:opacity-100"
        )}
      />
    </Link>
  );
});

// Componente memoizado para subenlaces con prefetch silencioso al pasar el cursor
const SidebarSubLink = React.memo(function SidebarSubLink({
  href,
  isActive,
  icon: Icon,
  label,
  queryClient,
  router,
}: {
  href: string;
  isActive: boolean;
  icon: React.ElementType;
  label: string;
  queryClient: any;
  router: any;
}) {
  const handlePrefetch = React.useCallback(() => {
    router.prefetch(href);
    prefetchRouteData(queryClient, href);
  }, [href, queryClient, router]);

  return (
    <Link
      href={href}
      prefetch={false}
      onMouseEnter={handlePrefetch}
      onTouchStart={handlePrefetch}
      className={cn(
        "flex items-center justify-between rounded-md px-2.5 py-1.5 text-xs transition-all",
        isActive
          ? "bg-[#E05A10]/15 text-white font-semibold border-l-2 border-[#E05A10]"
          : "text-slate-400 hover:bg-[#1E293B]/50 hover:text-slate-200"
      )}
    >
      <span className="flex items-center gap-2 truncate">
        <Icon
          className={cn(
            "h-3.5 w-3.5 shrink-0",
            isActive ? "text-[#E05A10]" : "text-slate-500"
          )}
        />
        <span className="truncate">{label}</span>
      </span>
    </Link>
  );
});

export function DashboardSidebar({
  isSupabaseLive,
  userSession,
}: {
  isSupabaseLive?: boolean;
  userSession?: TensaconUserSession;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  // Cerrar el drawer móvil automáticamente al navegar a cualquier ruta
  useEffect(() => {
    setIsMobileOpen(false);
  }, [pathname]);

  const nombreDisplay = userSession?.nombre || "Cedrix Vargas";
  const inicial = (nombreDisplay.trim()[0] || "C").toUpperCase();
  const perfilDisplay = (userSession?.perfil || "ADMINISTRADOR").toUpperCase();

  // Permisos dinámicos por módulo y grupo
  const canFacturasVentas = hasPermission(userSession, "facturas_ventas");
  const canFactoringClientes = hasPermission(userSession, "factoring_clientes");
  const canGestionCobranza = hasPermission(userSession, "gestion_cobranza");
  const canVentasGroup =
    hasPermission(userSession, "ventas_global") ||
    canFacturasVentas ||
    canFactoringClientes ||
    canGestionCobranza;

  const canFacturasCompras = hasPermission(userSession, "facturas_compras");
  const canHistoricoPagos = hasPermission(userSession, "historico_pagos_compras");
  const canCompromisos = hasPermission(userSession, "compromisos_compras");
  const canDeudaProveedores =
    hasPermission(userSession, "facturas_compras") ||
    hasPermission(userSession, "compras_global");
  const canComprasGroup =
    hasPermission(userSession, "compras_global") ||
    canFacturasCompras ||
    canHistoricoPagos ||
    canCompromisos ||
    canDeudaProveedores;

  const canTesoreriaSaldos = hasPermission(userSession, "tesoreria_saldos");
  const canTesoreriaPagos = hasPermission(userSession, "tesoreria_pagos");
  const canTesoreriaGroup = canTesoreriaSaldos || canTesoreriaPagos;

  const canBoletasGarantia = hasPermission(userSession, "garantias_boletas");
  const canPolizasGarantia = hasPermission(userSession, "garantias_polizas");
  const canGarantiasGroup =
    hasPermission(userSession, "gestion_garantias") ||
    canBoletasGarantia ||
    canPolizasGarantia;

  const canMultas = hasPermission(userSession, "litigios_multas");
  const canComparendos = hasPermission(userSession, "litigios_comparendos");
  const canJuicios = hasPermission(userSession, "litigios_juicios");
  const canCalendario = hasPermission(userSession, "litigios_calendario");
  const canLitigiosGroup =
    hasPermission(userSession, "reg_litigios") ||
    canMultas ||
    canComparendos ||
    canJuicios ||
    canCalendario;

  const canMantenedorOn = hasPermission(userSession, "mantenedor_on");
  const canColaboradores = hasPermission(userSession, "mantenedor_colaboradores");
  const canMantenedoresFactoring = hasPermission(userSession, "mantenedor_factoring");
  const canMandantesCompanias = hasPermission(userSession, "mantenedor_mandantes_companias");
  const canUsuarios = hasPermission(userSession, "maestro_usuarios");
  const canPerfiles = hasPermission(userSession, "adm_perfiles");
  const canConfiguracionGroup =
    canMantenedorOn ||
    canColaboradores ||
    canMantenedoresFactoring ||
    canMandantesCompanias ||
    canUsuarios ||
    canPerfiles;

  const handleLogout = async () => {
    try {
      await logoutAction();
    } catch {
      // Fallback
    }
    // Limpieza de cookie de cliente
    document.cookie = "tensacon_session=; path=/; max-age=0";
    router.push("/login");
    router.refresh();
  };

  const isFacturasSectionActive =
    pathname.startsWith("/finanzas/facturas-ventas") ||
    pathname.startsWith("/ventas-tensacon");
  const [isFacturasMenuOpen, setIsFacturasMenuOpen] = useState(true);

  const isFacturasVentasActive =
    pathname === "/finanzas/facturas-ventas" ||
    pathname === "/finanzas/facturas-ventas/";
  const isFactoringClientesActive = pathname.startsWith(
    "/finanzas/facturas-ventas/factoring-clientes"
  );
  const isGestionCobranzaActive =
    pathname.startsWith("/ventas-tensacon/gestion-cobranza") ||
    pathname.startsWith("/finanzas/facturas-ventas/gestion-cobranza");

  const isComprasSectionActive = pathname.startsWith("/compras-tensacon");
  const [isComprasMenuOpen, setIsComprasMenuOpen] = useState(true);
  const isFacturasComprasActive = pathname.startsWith(
    "/compras-tensacon/facturas-compras"
  );
  const isHistoricoPagosActive = pathname.startsWith(
    "/compras-tensacon/historico-pagos"
  );
  const isCompromisosActive = pathname.startsWith(
    "/compras-tensacon/compromisos"
  );
  const isDeudaProveedoresActive = pathname.startsWith(
    "/compras-tensacon/deuda-proveedores"
  );

  const isTesoreriaSectionActive = pathname.startsWith("/tesoreria");
  const [isTesoreriaMenuOpen, setIsTesoreriaMenuOpen] = useState(true);
  const isCartolasBancariasActive = pathname.startsWith(
    "/tesoreria/cartolas-bancarias"
  );
  const isPagosTesoreriaActive = pathname.startsWith("/tesoreria/pagos");

  const isGarantiasSectionActive = pathname.startsWith("/gestion-garantias");
  const [isGarantiasMenuOpen, setIsGarantiasMenuOpen] = useState(true);
  const isBoletasGarantiasActive = pathname.startsWith(
    "/gestion-garantias/boletas-garantias"
  );
  const isPolizasGarantiasActive = pathname.startsWith(
    "/gestion-garantias/polizas-garantias"
  );

  const isLitigiosSectionActive = pathname.startsWith("/reg-litigios");
  const [isLitigiosMenuOpen, setIsLitigiosMenuOpen] = useState(true);
  const isMultasActive = pathname.startsWith("/reg-litigios/multas");
  const isComparendosActive = pathname.startsWith("/reg-litigios/comparendos");
  const isJuiciosActive = pathname.startsWith("/reg-litigios/juicios");
  const isCalendarioActive = pathname.startsWith("/reg-litigios/calendario");

  const isConfiguracionSectionActive =
    pathname.startsWith("/configuracion") || pathname.startsWith("/mantenedores");
  const [isConfiguracionMenuOpen, setIsConfiguracionMenuOpen] = useState(true);

  const isMantenedorOnActive = pathname.startsWith("/configuracion/mantenedor-on");
  const isMantenedoresActive =
    pathname.startsWith("/configuracion/mantenedores-factoring") ||
    pathname.startsWith("/mantenedores");
  const isMandantesCompaniasActive = pathname.startsWith(
    "/configuracion/mandantes-companias"
  );
  const isUsuariosActive = pathname.startsWith("/configuracion/maestro-usuarios");
  const isPerfilesActive = pathname.startsWith("/configuracion/adm-perfiles");
  const isColaboradoresActive = pathname.startsWith("/configuracion/colaboradores");

  const sidebarContent = (
    <>
      {/* 1. Header fijo arriba (FINANZAS CORE - TENSACON) */}
      <Link
        href="/bienvenida"
        prefetch={true}
        onMouseEnter={() => router.prefetch("/bienvenida")}
        className="shrink-0 flex items-center gap-3 px-4 py-3.5 border-b border-slate-800 bg-[#0F172A] hover:bg-[#1E293B]/40 transition-colors"
        title="Ir a Inicio / Bienvenida"
      >
          {/* Ícono de la Plataforma */}
          <div className="w-9 h-9 rounded-xl bg-orange-600 flex items-center justify-center text-white shadow-md flex-shrink-0">
            <Building2 className="w-5 h-5" />
          </div>

          {/* Títulos de Marca */}
          <div className="flex flex-col justify-center leading-tight">
            <span className="text-sm font-extrabold text-white tracking-wide uppercase">
              FINANZAS CORE
            </span>
            <span className="text-[11px] font-bold text-orange-500 tracking-wider uppercase mt-0.5">
              TENSACON
            </span>
          </div>
        </Link>

        {/* 2. Menú de navegación con scroll propio independiente */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-4">
          {/* Enlace Inicio / Bienvenida */}
          <div>
            <SidebarTopLink
              href="/bienvenida"
              isActive={pathname === "/bienvenida"}
              icon={Home}
              label="Inicio / Bienvenida"
              queryClient={queryClient}
              router={router}
            />
          </div>

          {/* 2. VENTAS TENSACON */}
          {canVentasGroup && (
            <div className="space-y-1">
              {/* Ítem Padre Desplegable: VENTAS TENSACON */}
              <button
                type="button"
                onClick={() => setIsFacturasMenuOpen((prev) => !prev)}
                className={cn(
                  "w-full group flex items-center justify-between rounded-md px-2.5 py-2 text-xs font-medium transition-all text-left",
                  isFacturasSectionActive
                    ? "bg-[#1E293B] text-white shadow-sm ring-1 ring-slate-700"
                    : "text-slate-300 hover:bg-[#1E293B]/60 hover:text-white"
                )}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <FileSpreadsheet
                    className={cn(
                      "h-4 w-4 shrink-0 transition-colors",
                      isFacturasSectionActive
                        ? "text-[#E05A10]"
                        : "text-slate-400 group-hover:text-slate-300"
                    )}
                  />
                  <div className="truncate">
                    <div className="leading-tight font-bold tracking-wide">
                      VENTAS TENSACON
                    </div>
                    <div className="text-[10px] text-slate-400 truncate mt-0.5">
                      Libro SII y Cesión Factoring
                    </div>
                  </div>
                </div>
                {isFacturasMenuOpen ? (
                  <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                )}
              </button>

              {/* Submenú Anidado: 1. Facturas de Ventas | 2. Factoring Clientes | 3. Gestión de Cobranza */}
              {isFacturasMenuOpen && (
                <div className="ml-4 pl-2.5 border-l border-slate-700/80 space-y-1 pt-0.5">
                  {canFacturasVentas && (
                    <SidebarSubLink
                      href="/finanzas/facturas-ventas"
                      isActive={isFacturasVentasActive}
                      icon={Receipt}
                      label="Facturas de Ventas"
                      queryClient={queryClient}
                      router={router}
                    />
                  )}

                  {canFactoringClientes && (
                    <SidebarSubLink
                      href="/finanzas/facturas-ventas/factoring-clientes"
                      isActive={isFactoringClientesActive}
                      icon={Layers}
                      label="Factoring Clientes"
                      queryClient={queryClient}
                      router={router}
                    />
                  )}

                  {canGestionCobranza && (
                    <SidebarSubLink
                      href="/ventas-tensacon/gestion-cobranza"
                      isActive={isGestionCobranzaActive}
                      icon={PhoneCall}
                      label="Gestión de Cobranza"
                      queryClient={queryClient}
                      router={router}
                    />
                  )}
                </div>
              )}
            </div>
          )}

          {/* 3. COMPRAS TENSACON */}
          {canComprasGroup && (
            <div className="space-y-1">
              <button
                type="button"
                onClick={() => setIsComprasMenuOpen((prev) => !prev)}
                className={cn(
                  "w-full group flex items-center justify-between rounded-md px-2.5 py-2 text-xs font-medium transition-all text-left mt-2",
                  isComprasSectionActive
                    ? "bg-[#1E293B] text-white shadow-sm ring-1 ring-slate-700"
                    : "text-slate-300 hover:bg-[#1E293B]/60 hover:text-white"
                )}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <ShoppingCart
                    className={cn(
                      "h-4 w-4 shrink-0 transition-colors",
                      isComprasSectionActive
                        ? "text-[#E05A10]"
                        : "text-slate-400 group-hover:text-slate-300"
                    )}
                  />
                  <div className="truncate">
                    <div className="leading-tight font-bold tracking-wide">
                      COMPRAS TENSACON
                    </div>
                    <div className="text-[10px] text-slate-400 truncate mt-0.5">
                      Registro Compras & Proveedores
                    </div>
                  </div>
                </div>
                {isComprasMenuOpen ? (
                  <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                )}
              </button>

              {/* Submenú Anidado COMPRAS: 1. Facturas de Compras, 2. Histórico Pagos, 3. Compromisos */}
              {isComprasMenuOpen && (
                <div className="ml-4 pl-2.5 border-l border-slate-700/80 space-y-1 pt-0.5">
                  {canFacturasCompras && (
                    <SidebarSubLink
                      href="/compras-tensacon/facturas-compras"
                      isActive={isFacturasComprasActive}
                      icon={Receipt}
                      label="Facturas de Compras"
                      queryClient={queryClient}
                      router={router}
                    />
                  )}

                  {canHistoricoPagos && (
                    <SidebarSubLink
                      href="/compras-tensacon/historico-pagos"
                      isActive={isHistoricoPagosActive}
                      icon={History}
                      label="Histórico Pagos"
                      queryClient={queryClient}
                      router={router}
                    />
                  )}

                  {canCompromisos && (
                    <SidebarSubLink
                      href="/compras-tensacon/compromisos"
                      isActive={isCompromisosActive}
                      icon={CalendarClock}
                      label="Compromisos"
                      queryClient={queryClient}
                      router={router}
                    />
                  )}

                  {canDeudaProveedores && (
                    <SidebarSubLink
                      href="/compras-tensacon/deuda-proveedores"
                      isActive={isDeudaProveedoresActive}
                      icon={LineChart}
                      label="Deuda Prov."
                      queryClient={queryClient}
                      router={router}
                    />
                  )}
                </div>
              )}
            </div>
          )}

          {/* 3.5 TESORERÍA */}
          {canTesoreriaGroup && (
            <div className="space-y-1">
              <button
                type="button"
                onClick={() => setIsTesoreriaMenuOpen((prev) => !prev)}
                className={cn(
                  "w-full group flex items-center justify-between rounded-md px-2.5 py-2 text-xs font-medium transition-all text-left mt-2",
                  isTesoreriaSectionActive
                    ? "bg-[#1E293B] text-white shadow-sm ring-1 ring-slate-700"
                    : "text-slate-300 hover:bg-[#1E293B]/60 hover:text-white"
                )}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Landmark
                    className={cn(
                      "h-4 w-4 shrink-0 transition-colors",
                      isTesoreriaSectionActive
                        ? "text-[#E05A10]"
                        : "text-slate-400 group-hover:text-slate-300"
                    )}
                  />
                  <div className="truncate">
                    <div className="leading-tight font-bold tracking-wide">
                      TESORERÍA
                    </div>
                    <div className="text-[10px] text-slate-400 truncate mt-0.5">
                      Cartolas & Conciliación Bancaria
                    </div>
                  </div>
                </div>
                {isTesoreriaMenuOpen ? (
                  <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                )}
              </button>

              {isTesoreriaMenuOpen && (
                <div className="ml-4 pl-2.5 border-l border-slate-700/80 space-y-1 pt-0.5">
                  {canTesoreriaSaldos && (
                    <SidebarSubLink
                      href="/tesoreria/cartolas-bancarias"
                      isActive={isCartolasBancariasActive}
                      icon={FileSpreadsheet}
                      label="Saldos Bancarios"
                      queryClient={queryClient}
                      router={router}
                    />
                  )}
                  {canTesoreriaPagos && (
                    <SidebarSubLink
                      href="/tesoreria/pagos"
                      isActive={isPagosTesoreriaActive}
                      icon={Banknote}
                      label="Pagos"
                      queryClient={queryClient}
                      router={router}
                    />
                  )}
                </div>
              )}
            </div>
          )}

          {/* 4. GESTIÓN GARANTÍAS */}
          {canGarantiasGroup && (
            <div className="space-y-1">
              <button
                type="button"
                onClick={() => setIsGarantiasMenuOpen((prev) => !prev)}
                className={cn(
                  "w-full group flex items-center justify-between rounded-md px-2.5 py-2 text-xs font-medium transition-all text-left mt-2",
                  isGarantiasSectionActive
                    ? "bg-[#1E293B] text-white shadow-sm ring-1 ring-slate-700"
                    : "text-slate-300 hover:bg-[#1E293B]/60 hover:text-white"
                )}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <ShieldCheck
                    className={cn(
                      "h-4 w-4 shrink-0 transition-colors",
                      isGarantiasSectionActive
                        ? "text-[#E05A10]"
                        : "text-slate-400 group-hover:text-slate-300"
                    )}
                  />
                  <div className="truncate">
                    <div className="leading-tight font-bold tracking-wide">
                      GESTIÓN GARANTÍAS
                    </div>
                    <div className="text-[10px] text-slate-400 truncate mt-0.5">
                      Boletas & Pólizas
                    </div>
                  </div>
                </div>
                {isGarantiasMenuOpen ? (
                  <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                )}
              </button>

              {/* Submenú Anidado GARANTÍAS: 1. Boletas de Garantía, 2. Pólizas de Garantía */}
              {isGarantiasMenuOpen && (
                <div className="ml-4 pl-2.5 border-l border-slate-700/80 space-y-1 pt-0.5">
                  {canBoletasGarantia && (
                    <SidebarSubLink
                      href="/gestion-garantias/boletas-garantias"
                      isActive={isBoletasGarantiasActive}
                      icon={Landmark}
                      label="Boletas de Garantía"
                      queryClient={queryClient}
                      router={router}
                    />
                  )}

                  {canPolizasGarantia && (
                    <SidebarSubLink
                      href="/gestion-garantias/polizas-garantias"
                      isActive={isPolizasGarantiasActive}
                      icon={Shield}
                      label="Pólizas de Garantía"
                      queryClient={queryClient}
                      router={router}
                    />
                  )}
                </div>
              )}
            </div>
          )}

          {/* 5. REG. LITIGIOS (Módulo Principal) */}
          {canLitigiosGroup && (
            <div className="space-y-1">
              {/* Ítem Padre Desplegable: REG. LITIGIOS */}
              <button
                type="button"
                onClick={() => setIsLitigiosMenuOpen((prev) => !prev)}
                className={cn(
                  "w-full group flex items-center justify-between rounded-md px-2.5 py-2 text-xs font-medium transition-all text-left mt-2",
                  isLitigiosSectionActive
                    ? "bg-[#1E293B] text-white shadow-sm ring-1 ring-slate-700"
                    : "text-slate-300 hover:bg-[#1E293B]/60 hover:text-white"
                )}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Scale
                    className={cn(
                      "h-4 w-4 shrink-0 transition-colors",
                      isLitigiosSectionActive
                        ? "text-[#E05A10]"
                        : "text-slate-400 group-hover:text-slate-300"
                    )}
                  />
                  <div className="truncate">
                    <div className="leading-tight font-bold tracking-wide">
                      REG. LITIGIOS
                    </div>
                    <div className="text-[10px] text-slate-400 truncate mt-0.5">
                      Multas, Comparendos & Juicios
                    </div>
                  </div>
                </div>
                {isLitigiosMenuOpen ? (
                  <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                )}
              </button>

              {/* Submenú Anidado REG. LITIGIOS: 1. Multas, 2. Comparendos, 3. Juicios */}
              {isLitigiosMenuOpen && (
                <div className="ml-4 pl-2.5 border-l border-slate-700/80 space-y-1 pt-0.5">
                  {canMultas && (
                    <SidebarSubLink
                      href="/reg-litigios/multas"
                      isActive={isMultasActive}
                      icon={FileWarning}
                      label="Multas"
                      queryClient={queryClient}
                      router={router}
                    />
                  )}

                  {canComparendos && (
                    <SidebarSubLink
                      href="/reg-litigios/comparendos"
                      isActive={isComparendosActive}
                      icon={Briefcase}
                      label="Comparendos"
                      queryClient={queryClient}
                      router={router}
                    />
                  )}

                  {canJuicios && (
                    <SidebarSubLink
                      href="/reg-litigios/juicios"
                      isActive={isJuiciosActive}
                      icon={Gavel}
                      label="Juicios"
                      queryClient={queryClient}
                      router={router}
                    />
                  )}

                  {canCalendario && (
                    <SidebarSubLink
                      href="/reg-litigios/calendario"
                      isActive={isCalendarioActive}
                      icon={CalendarDays}
                      label="Calendario"
                      queryClient={queryClient}
                      router={router}
                    />
                  )}
                </div>
              )}
            </div>
          )}

          {/* 6. CONFIGURACIÓN (Módulo Principal) */}
          {canConfiguracionGroup && (
            <div className="space-y-1">
              {/* Ítem Padre Desplegable: CONFIGURACIÓN */}
              <button
                type="button"
                onClick={() => setIsConfiguracionMenuOpen((prev) => !prev)}
                className={cn(
                  "w-full group flex items-center justify-between rounded-md px-2.5 py-2 text-xs font-medium transition-all text-left mt-2",
                  isConfiguracionSectionActive
                    ? "bg-[#1E293B] text-white shadow-sm ring-1 ring-slate-700"
                    : "text-slate-300 hover:bg-[#1E293B]/60 hover:text-white"
                )}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Settings
                    className={cn(
                      "h-4 w-4 shrink-0 transition-colors",
                      isConfiguracionSectionActive
                        ? "text-[#E05A10]"
                        : "text-slate-400 group-hover:text-slate-300"
                    )}
                  />
                  <div className="truncate">
                    <div className="leading-tight font-bold tracking-wide">
                      CONFIGURACIÓN
                    </div>
                    <div className="text-[10px] text-slate-400 truncate mt-0.5">
                      Catálogos, Usuarios y Perfiles
                    </div>
                  </div>
                </div>
                {isConfiguracionMenuOpen ? (
                  <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                )}
              </button>

              {/* Submenú Anidado CONFIGURACIÓN */}
              {isConfiguracionMenuOpen && (
                <div className="ml-4 pl-2.5 border-l border-slate-700/80 space-y-1 pt-0.5">
                  {canMantenedorOn && (
                    <SidebarSubLink
                      href="/configuracion/mantenedor-on"
                      isActive={isMantenedorOnActive}
                      icon={FolderKanban}
                      label="Mantenedor de ON"
                      queryClient={queryClient}
                      router={router}
                    />
                  )}

                  {canMantenedoresFactoring && (
                    <SidebarSubLink
                      href="/configuracion/mantenedores-factoring"
                      isActive={isMantenedoresActive}
                      icon={Building2}
                      label="Mantenedores Factoring"
                      queryClient={queryClient}
                      router={router}
                    />
                  )}

                  {canMandantesCompanias && (
                    <SidebarSubLink
                      href="/configuracion/mandantes-companias"
                      isActive={isMandantesCompaniasActive}
                      icon={Briefcase}
                      label="Mandantes & Compañías"
                      queryClient={queryClient}
                      router={router}
                    />
                  )}

                  {canUsuarios && (
                    <SidebarSubLink
                      href="/configuracion/maestro-usuarios"
                      isActive={isUsuariosActive}
                      icon={Users}
                      label="Maestro Usuarios"
                      queryClient={queryClient}
                      router={router}
                    />
                  )}

                  {canPerfiles && (
                    <SidebarSubLink
                      href="/configuracion/adm-perfiles"
                      isActive={isPerfilesActive}
                      icon={Shield}
                      label="Adm. Perfiles"
                      queryClient={queryClient}
                      router={router}
                    />
                  )}

                  {canColaboradores && (
                    <SidebarSubLink
                      href="/configuracion/colaboradores"
                      isActive={isColaboradoresActive}
                      icon={UserCheck}
                      label="Mantenedor Colaboradores"
                      queryClient={queryClient}
                      router={router}
                    />
                  )}
                </div>
              )}
            </div>
          )}
        </nav>

      {/* 3. Footer fijo abajo (Usuario + Perfil + Logout siempre visible) */}
      <div className="shrink-0 p-3 border-t border-slate-800 bg-[#0B1120]">
        <div className="flex items-center justify-between gap-2">
          {/* Avatar & User Details */}
          <div className="flex items-center gap-2.5 min-w-0">
            {/* Avatar Circle */}
            <div className="h-9 w-9 rounded-full bg-[#1E293B] border border-slate-700/80 flex items-center justify-center font-bold text-sm text-slate-200 shrink-0 shadow-inner">
              {inicial}
            </div>

            {/* Identidad y Rol */}
            <div className="min-w-0">
              <div
                className="text-xs font-semibold text-white truncate leading-tight"
                title={nombreDisplay}
              >
                {nombreDisplay}
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="h-2 w-2 rounded-full bg-emerald-400 shrink-0 shadow-[0_0_6px_#34d399]" />
                <span className="text-[10px] font-bold tracking-wider text-emerald-400 uppercase truncate">
                  {perfilDisplay}
                </span>
              </div>
            </div>
          </div>

          {/* Botón de Salida */}
          <button
            type="button"
            onClick={handleLogout}
            title="Cerrar Sesión"
            className="p-2 rounded-lg text-slate-400 hover:text-red-400 hover:bg-[#1E293B] transition-colors shrink-0"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* Barra superior móvil (< 1024px) */}
      <header className="flex lg:hidden items-center justify-between px-4 py-3 bg-[#0B1528] text-white sticky top-0 z-40 border-b border-slate-800 w-full shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => setIsMobileOpen(true)}
            className="p-1.5 rounded-lg text-slate-200 hover:bg-slate-800 hover:text-white transition-colors shrink-0"
            aria-label="Abrir menú de navegación"
          >
            <Menu className="h-5 w-5" />
          </button>
          <Link href="/bienvenida" className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-orange-600 flex items-center justify-center text-white shadow-sm shrink-0">
              <Building2 className="w-4 h-4" />
            </div>
            <span className="text-xs font-extrabold tracking-wide uppercase truncate">
              FINANZAS CORE <span className="text-orange-500">· TENSACON</span>
            </span>
          </Link>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="h-7 w-7 rounded-full bg-[#1E293B] border border-slate-700 flex items-center justify-center font-bold text-xs text-slate-200">
            {inicial}
          </div>
        </div>
      </header>

      {/* Drawer lateral móvil (< 1024px) */}
      {isMobileOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs"
            onClick={() => setIsMobileOpen(false)}
          />
          <aside className="relative z-10 w-64 max-w-[85vw] bg-[#0F172A] text-slate-100 flex flex-col h-full overflow-hidden shadow-2xl border-r border-slate-800 select-none">
            <button
              type="button"
              onClick={() => setIsMobileOpen(false)}
              className="absolute top-3.5 right-3 z-20 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              aria-label="Cerrar menú"
            >
              <X className="h-4 w-4" />
            </button>
            {sidebarContent}
          </aside>
        </div>
      )}

      {/* Sidebar fijo e independiente en escritorio (lg: en adelante) */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 lg:left-0 lg:h-screen border-r border-slate-800 bg-[#0F172A] text-slate-100 select-none z-30">
        {sidebarContent}
      </aside>
    </>
  );
}
