import React from "react";
import Link from "next/link";
import {
  FileSpreadsheet,
  Receipt,
  ShoppingCart,
  Shield,
  Layers,
  ArrowRight,
  Landmark,
  Calendar,
  Users,
  Building2,
  History,
  CalendarClock,
  PhoneCall,
  Clock,
  Scale,
  FileWarning,
  Gavel,
  ShieldCheck,
  AlertTriangle,
  Briefcase,
} from "lucide-react";
import { getServerUserSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";

export const metadata = {
  title: "Bienvenida | Finanzas Tensacon",
  description: "Panel de bienvenida y acceso rápido a módulos de Finanzas Tensacon.",
};

export default async function BienvenidaPage({
  searchParams,
}: {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await getServerUserSession();
  const resolvedParams = searchParams ? await searchParams : {};
  const isUnauthorized = resolvedParams.error === "unauthorized";
  const rutaUnauthorized =
    typeof resolvedParams.ruta === "string" ? resolvedParams.ruta : "";

  const fechaActual = new Intl.DateTimeFormat("es-CL", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date());

  const fechaFormateada =
    fechaActual.charAt(0).toUpperCase() + fechaActual.slice(1);

  // Permisos dinámicos por módulo
  const canFacturasVentas = hasPermission(session, "facturas_ventas");
  const canFactoringClientes = hasPermission(session, "factoring_clientes");
  const canGestionCobranza = hasPermission(session, "gestion_cobranza");
  const canVentasGroup =
    hasPermission(session, "ventas_global") ||
    canFacturasVentas ||
    canFactoringClientes ||
    canGestionCobranza;

  const canFacturasCompras = hasPermission(session, "facturas_compras");
  const canHistoricoPagos = hasPermission(session, "historico_pagos_compras");
  const canCompromisos = hasPermission(session, "compromisos_compras");
  const canComprasGroup =
    hasPermission(session, "compras_global") ||
    canFacturasCompras ||
    canHistoricoPagos ||
    canCompromisos;

  const canBoletasGarantia = hasPermission(session, "garantias_boletas");
  const canPolizasGarantia = hasPermission(session, "garantias_polizas");
  const canGarantiasGroup =
    hasPermission(session, "gestion_garantias") ||
    canBoletasGarantia ||
    canPolizasGarantia;

  const canMultas = hasPermission(session, "litigios_multas");
  const canComparendos = hasPermission(session, "litigios_comparendos");
  const canJuicios = hasPermission(session, "litigios_juicios");
  const canLitigiosGroup =
    hasPermission(session, "reg_litigios") ||
    canMultas ||
    canComparendos ||
    canJuicios;

  const canMantenedoresFactoring = hasPermission(session, "mantenedor_factoring");
  const canMandantesCompanias = hasPermission(session, "mantenedor_mandantes_companias");
  const canUsuarios = hasPermission(session, "maestro_usuarios");
  const canPerfiles = hasPermission(session, "adm_perfiles");
  const canConfiguracionAdm = canUsuarios || canPerfiles;
  const canMantenedoresCat = canMantenedoresFactoring || canMandantesCompanias;

  const anyModuleVisible =
    canVentasGroup ||
    canComprasGroup ||
    canGarantiasGroup ||
    canLitigiosGroup ||
    canConfiguracionAdm ||
    canMantenedoresCat;

  return (
    <div className="space-y-6">
      {/* Alerta de Acceso Denegado por Seguridad RBAC */}
      {isUnauthorized && (
        <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-red-900 shadow-sm flex items-start gap-3.5 animate-in fade-in duration-200">
          <div className="h-9 w-9 rounded-lg bg-red-100 flex items-center justify-center shrink-0 text-red-600 mt-0.5">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="font-bold text-sm text-red-900">
              Acceso Restringido por Control de Permisos (RBAC)
            </h4>
            <p className="text-xs text-red-700 mt-1 leading-relaxed">
              Su perfil actual (
              <span className="font-bold uppercase tracking-wide text-red-900">
                {session.perfil}
              </span>
              ) no tiene autorización para acceder a la ruta:{" "}
              <code className="font-mono bg-red-100 px-1.5 py-0.5 rounded text-red-800 font-semibold">
                {rutaUnauthorized || "módulo protegido"}
              </code>
              . Ha sido redirigido a este panel seguro de bienvenida.
            </p>
          </div>
        </div>
      )}

      {/* Banner Principal de Bienvenida */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#0F172A] via-[#1E293B] to-[#0F172A] p-7 text-white shadow-xl border border-slate-800">
        <div className="absolute -right-10 -top-10 h-64 w-64 rounded-full bg-[#E05A10]/10 blur-3xl pointer-events-none" />
        <div className="absolute right-40 -bottom-10 h-48 w-48 rounded-full bg-cyan-500/10 blur-2xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-[#1E293B]/90 border border-slate-700/80 text-[11px] font-mono font-medium text-slate-300">
              <span className="h-2 w-2 rounded-full bg-[#E05A10] animate-pulse" />
              SISTEMA DE GESTIÓN FINANCIERA & TESORERÍA · TENSACON S.A.
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
              ¡Bienvenido(a),{" "}
              <span className="text-[#FB923C]">{session.nombre}</span>!
            </h1>

            <p className="text-xs sm:text-sm text-slate-300 max-w-2xl leading-relaxed">
              Seleccione a continuación el módulo de trabajo al cual desea
              acceder o utilice el menú lateral para una navegación detallada.
            </p>
          </div>

          {/* Card Resumen de Sesión */}
          <div className="bg-slate-900/80 backdrop-blur-md rounded-xl p-4 border border-slate-700/70 shrink-0 min-w-[240px] space-y-2.5 shadow-inner">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
                Perfil Activo
              </span>
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                {session.perfil}
              </span>
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-300">
              <Calendar className="h-3.5 w-3.5 text-[#E05A10] shrink-0" />
              <span className="truncate">{fechaFormateada}</span>
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
              <Clock className="h-3.5 w-3.5 text-slate-500 shrink-0" />
              <span>Usuario: {session.usuario}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Grid de Módulos Ejecutivos */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[#E05A10]" />
            Módulos del Sistema y Accesos Rápidos
          </h2>
          <span className="text-xs text-slate-500 font-medium">
            Acceso directo autorizado según matriz de permisos
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {/* Módulo 1: Ventas Tensacon */}
          {canVentasGroup && (
            <div className="group flex flex-col justify-between rounded-xl bg-white p-5 border border-slate-200 shadow-sm hover:shadow-md hover:border-[#E05A10]/50 transition-all">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="h-10 w-10 rounded-lg bg-orange-50 border border-orange-100 flex items-center justify-center text-[#E05A10] group-hover:scale-105 transition-transform">
                    <Receipt className="h-5 w-5" />
                  </div>
                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-orange-100 text-[#C2410C]">
                    VENTAS
                  </span>
                </div>

                <div>
                  <h3 className="text-base font-bold text-slate-900 group-hover:text-[#E05A10] transition-colors">
                    Ventas Tensacon
                  </h3>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                    Supervisión de Libro de Ventas SII (Facturas 33, NC 61), cesión
                    a Factoring Clientes y gestión de cobranzas.
                  </p>
                </div>

                <div className="space-y-1.5 pt-2 border-t border-slate-100">
                  {canFacturasVentas && (
                    <Link
                      href="/finanzas/facturas-ventas"
                      className="flex items-center justify-between text-xs text-slate-700 hover:text-[#E05A10] hover:bg-slate-50 px-2 py-1.5 rounded transition-colors"
                    >
                      <span className="flex items-center gap-2">
                        <FileSpreadsheet className="h-3.5 w-3.5 text-slate-400" />
                        Facturas de Ventas
                      </span>
                      <ArrowRight className="h-3 w-3 text-slate-400" />
                    </Link>
                  )}

                  {canFactoringClientes && (
                    <Link
                      href="/finanzas/facturas-ventas/factoring-clientes"
                      className="flex items-center justify-between text-xs text-slate-700 hover:text-[#E05A10] hover:bg-slate-50 px-2 py-1.5 rounded transition-colors"
                    >
                      <span className="flex items-center gap-2">
                        <Landmark className="h-3.5 w-3.5 text-slate-400" />
                        Factoring Clientes
                      </span>
                      <ArrowRight className="h-3 w-3 text-slate-400" />
                    </Link>
                  )}

                  {canGestionCobranza && (
                    <Link
                      href="/ventas-tensacon/gestion-cobranza"
                      className="flex items-center justify-between text-xs text-slate-700 hover:text-[#E05A10] hover:bg-slate-50 px-2 py-1.5 rounded transition-colors"
                    >
                      <span className="flex items-center gap-2">
                        <PhoneCall className="h-3.5 w-3.5 text-slate-400" />
                        Gestión de Cobranza
                      </span>
                      <ArrowRight className="h-3 w-3 text-slate-400" />
                    </Link>
                  )}
                </div>
              </div>

              <Link
                href="/finanzas/facturas-ventas"
                className="mt-4 flex items-center justify-center gap-1.5 w-full py-2 px-3 text-xs font-bold text-white bg-[#0F172A] hover:bg-[#E05A10] rounded-lg transition-colors shadow-sm"
              >
                <span>Abrir Ventas</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          )}

          {/* Módulo 2: Compras Tensacon */}
          {canComprasGroup && (
            <div className="group flex flex-col justify-between rounded-xl bg-white p-5 border border-slate-200 shadow-sm hover:shadow-md hover:border-[#E05A10]/50 transition-all">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="h-10 w-10 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 group-hover:scale-105 transition-transform">
                    <ShoppingCart className="h-5 w-5" />
                  </div>
                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-blue-100 text-blue-800">
                    COMPRAS
                  </span>
                </div>

                <div>
                  <h3 className="text-base font-bold text-slate-900 group-hover:text-[#E05A10] transition-colors">
                    Compras Tensacon
                  </h3>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                    Gestión integral de compras a proveedores, cartera de deudas,
                    cheques a fecha, confirming y neteos FAC/NC.
                  </p>
                </div>

                <div className="space-y-1.5 pt-2 border-t border-slate-100">
                  {canFacturasCompras && (
                    <Link
                      href="/compras-tensacon/facturas-compras"
                      className="flex items-center justify-between text-xs text-slate-700 hover:text-[#E05A10] hover:bg-slate-50 px-2 py-1.5 rounded transition-colors"
                    >
                      <span className="flex items-center gap-2">
                        <Receipt className="h-3.5 w-3.5 text-slate-400" />
                        Facturas de Compras
                      </span>
                      <ArrowRight className="h-3 w-3 text-slate-400" />
                    </Link>
                  )}

                  {canHistoricoPagos && (
                    <Link
                      href="/compras-tensacon/historico-pagos"
                      className="flex items-center justify-between text-xs text-slate-700 hover:text-[#E05A10] hover:bg-slate-50 px-2 py-1.5 rounded transition-colors"
                    >
                      <span className="flex items-center gap-2">
                        <History className="h-3.5 w-3.5 text-slate-400" />
                        Histórico Pagos
                      </span>
                      <ArrowRight className="h-3 w-3 text-slate-400" />
                    </Link>
                  )}

                  {canCompromisos && (
                    <Link
                      href="/compras-tensacon/compromisos"
                      className="flex items-center justify-between text-xs text-slate-700 hover:text-[#E05A10] hover:bg-slate-50 px-2 py-1.5 rounded transition-colors"
                    >
                      <span className="flex items-center gap-2">
                        <CalendarClock className="h-3.5 w-3.5 text-slate-400" />
                        Compromisos Semanales
                      </span>
                      <ArrowRight className="h-3 w-3 text-slate-400" />
                    </Link>
                  )}
                </div>
              </div>

              <Link
                href="/compras-tensacon/facturas-compras"
                className="mt-4 flex items-center justify-center gap-1.5 w-full py-2 px-3 text-xs font-bold text-white bg-[#0F172A] hover:bg-[#E05A10] rounded-lg transition-colors shadow-sm"
              >
                <span>Abrir Compras</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          )}

          {/* Módulo 3: Gestión Garantías */}
          {canGarantiasGroup && (
            <div className="group flex flex-col justify-between rounded-xl bg-white p-5 border border-slate-200 shadow-sm hover:shadow-md hover:border-[#E05A10]/50 transition-all">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="h-10 w-10 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 group-hover:scale-105 transition-transform">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                    GARANTÍAS
                  </span>
                </div>

                <div>
                  <h3 className="text-base font-bold text-slate-900 group-hover:text-[#E05A10] transition-colors">
                    Gestión Garantías
                  </h3>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                    Control de Boletas y Pólizas de Garantía, bitácora de
                    renovaciones, estados de vencimiento y montos UF.
                  </p>
                </div>

                <div className="space-y-1.5 pt-2 border-t border-slate-100">
                  {canBoletasGarantia && (
                    <Link
                      href="/gestion-garantias/boletas-garantias"
                      className="flex items-center justify-between text-xs text-slate-700 hover:text-[#E05A10] hover:bg-slate-50 px-2 py-1.5 rounded transition-colors"
                    >
                      <span className="flex items-center gap-2">
                        <Landmark className="h-3.5 w-3.5 text-slate-400" />
                        Boletas de Garantía
                      </span>
                      <ArrowRight className="h-3 w-3 text-slate-400" />
                    </Link>
                  )}

                  {canPolizasGarantia && (
                    <Link
                      href="/gestion-garantias/polizas-garantias"
                      className="flex items-center justify-between text-xs text-slate-700 hover:text-[#E05A10] hover:bg-slate-50 px-2 py-1.5 rounded transition-colors"
                    >
                      <span className="flex items-center gap-2">
                        <Shield className="h-3.5 w-3.5 text-slate-400" />
                        Pólizas de Garantía
                      </span>
                      <ArrowRight className="h-3 w-3 text-slate-400" />
                    </Link>
                  )}
                </div>
              </div>

              <Link
                href="/gestion-garantias/boletas-garantias"
                className="mt-4 flex items-center justify-center gap-1.5 w-full py-2 px-3 text-xs font-bold text-white bg-[#0F172A] hover:bg-[#E05A10] rounded-lg transition-colors shadow-sm"
              >
                <span>Abrir Garantías</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          )}

          {/* Módulo 4: Reg. Litigios */}
          {canLitigiosGroup && (
            <div className="group flex flex-col justify-between rounded-xl bg-white p-5 border border-slate-200 shadow-sm hover:shadow-md hover:border-[#E05A10]/50 transition-all">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="h-10 w-10 rounded-lg bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600 group-hover:scale-105 transition-transform">
                    <Scale className="h-5 w-5" />
                  </div>
                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-amber-100 text-amber-800">
                    LITIGIOS
                  </span>
                </div>

                <div>
                  <h3 className="text-base font-bold text-slate-900 group-hover:text-[#E05A10] transition-colors">
                    Reg. Litigios
                  </h3>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                    Registro de multas administrativas, fiscalizaciones, causas
                    laborales y bitácora correlativa de audiencias.
                  </p>
                </div>

                <div className="space-y-1.5 pt-2 border-t border-slate-100">
                  {canMultas && (
                    <Link
                      href="/reg-litigios/multas"
                      className="flex items-center justify-between text-xs text-slate-700 hover:text-[#E05A10] hover:bg-slate-50 px-2 py-1.5 rounded transition-colors"
                    >
                      <span className="flex items-center gap-2">
                        <FileWarning className="h-3.5 w-3.5 text-slate-400" />
                        Multas
                      </span>
                      <ArrowRight className="h-3 w-3 text-slate-400" />
                    </Link>
                  )}

                  {canComparendos && (
                    <Link
                      href="/reg-litigios/comparendos"
                      className="flex items-center justify-between text-xs text-slate-700 hover:text-[#E05A10] hover:bg-slate-50 px-2 py-1.5 rounded transition-colors"
                    >
                      <span className="flex items-center gap-2">
                        <Briefcase className="h-3.5 w-3.5 text-slate-400" />
                        Comparendos
                      </span>
                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 font-medium">
                        Pronto
                      </span>
                    </Link>
                  )}

                  {canJuicios && (
                    <Link
                      href="/reg-litigios/juicios"
                      className="flex items-center justify-between text-xs text-slate-700 hover:text-[#E05A10] hover:bg-slate-50 px-2 py-1.5 rounded transition-colors"
                    >
                      <span className="flex items-center gap-2">
                        <Gavel className="h-3.5 w-3.5 text-slate-400" />
                        Juicios
                      </span>
                      <ArrowRight className="h-3 w-3 text-slate-400" />
                    </Link>
                  )}
                </div>
              </div>

              <Link
                href="/reg-litigios/multas"
                className="mt-4 flex items-center justify-center gap-1.5 w-full py-2 px-3 text-xs font-bold text-white bg-[#0F172A] hover:bg-[#E05A10] rounded-lg transition-colors shadow-sm"
              >
                <span>Abrir Litigios</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          )}

          {/* Módulo 5: Mantenedores */}
          {canMantenedoresCat && (
            <div className="group flex flex-col justify-between rounded-xl bg-white p-5 border border-slate-200 shadow-sm hover:shadow-md hover:border-[#E05A10]/50 transition-all">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="h-10 w-10 rounded-lg bg-purple-50 border border-purple-100 flex items-center justify-center text-purple-600 group-hover:scale-105 transition-transform">
                    <Layers className="h-5 w-5" />
                  </div>
                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-purple-100 text-purple-800">
                    CATÁLOGOS
                  </span>
                </div>

                <div>
                  <h3 className="text-base font-bold text-slate-900 group-hover:text-[#E05A10] transition-colors">
                    Mantenedores
                  </h3>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                    Catálogos de empresas de Factoring, mandantes, bancos y
                    compañías emisoras de garantías.
                  </p>
                </div>

                <div className="space-y-1.5 pt-2 border-t border-slate-100">
                  {canMantenedoresFactoring && (
                    <Link
                      href="/configuracion/mantenedores-factoring"
                      className="flex items-center justify-between text-xs text-slate-700 hover:text-[#E05A10] hover:bg-slate-50 px-2 py-1.5 rounded transition-colors"
                    >
                      <span className="flex items-center gap-2">
                        <Building2 className="h-3.5 w-3.5 text-slate-400" />
                        Mantenedores Factoring
                      </span>
                      <ArrowRight className="h-3 w-3 text-slate-400" />
                    </Link>
                  )}

                  {canMandantesCompanias && (
                    <Link
                      href="/configuracion/mandantes-companias"
                      className="flex items-center justify-between text-xs text-slate-700 hover:text-[#E05A10] hover:bg-slate-50 px-2 py-1.5 rounded transition-colors"
                    >
                      <span className="flex items-center gap-2">
                        <Briefcase className="h-3.5 w-3.5 text-slate-400" />
                        Mandantes & Compañías
                      </span>
                      <ArrowRight className="h-3 w-3 text-slate-400" />
                    </Link>
                  )}
                </div>
              </div>

              <Link
                href="/configuracion/mantenedores-factoring"
                className="mt-4 flex items-center justify-center gap-1.5 w-full py-2 px-3 text-xs font-bold text-white bg-[#0F172A] hover:bg-[#E05A10] rounded-lg transition-colors shadow-sm"
              >
                <span>Abrir Mantenedores</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          )}

          {/* Módulo 6: Configuración Adm. */}
          {canConfiguracionAdm && (
            <div className="group flex flex-col justify-between rounded-xl bg-white p-5 border border-slate-200 shadow-sm hover:shadow-md hover:border-[#E05A10]/50 transition-all">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="h-10 w-10 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 group-hover:scale-105 transition-transform">
                    <Shield className="h-5 w-5" />
                  </div>
                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-indigo-100 text-indigo-800">
                    SEGURIDAD
                  </span>
                </div>

                <div>
                  <h3 className="text-base font-bold text-slate-900 group-hover:text-[#E05A10] transition-colors">
                    Configuración Adm.
                  </h3>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                    Administración de usuarios del sistema, credenciales de acceso,
                    perfiles y matriz de permisos RBAC.
                  </p>
                </div>

                <div className="space-y-1.5 pt-2 border-t border-slate-100">
                  {canUsuarios && (
                    <Link
                      href="/configuracion/maestro-usuarios"
                      className="flex items-center justify-between text-xs text-slate-700 hover:text-[#E05A10] hover:bg-slate-50 px-2 py-1.5 rounded transition-colors"
                    >
                      <span className="flex items-center gap-2">
                        <Users className="h-3.5 w-3.5 text-slate-400" />
                        Maestro de Usuarios
                      </span>
                      <ArrowRight className="h-3 w-3 text-slate-400" />
                    </Link>
                  )}

                  {canPerfiles && (
                    <Link
                      href="/configuracion/adm-perfiles"
                      className="flex items-center justify-between text-xs text-slate-700 hover:text-[#E05A10] hover:bg-slate-50 px-2 py-1.5 rounded transition-colors"
                    >
                      <span className="flex items-center gap-2">
                        <Shield className="h-3.5 w-3.5 text-slate-400" />
                        Adm. Perfiles
                      </span>
                      <ArrowRight className="h-3 w-3 text-slate-400" />
                    </Link>
                  )}
                </div>
              </div>

              <Link
                href="/configuracion/maestro-usuarios"
                className="mt-4 flex items-center justify-center gap-1.5 w-full py-2 px-3 text-xs font-bold text-white bg-[#0F172A] hover:bg-[#E05A10] rounded-lg transition-colors shadow-sm"
              >
                <span>Abrir Usuarios</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          )}
        </div>

        {/* Mensaje de respaldo si no hay módulos */}
        {!anyModuleVisible && (
          <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-500 space-y-2">
            <Shield className="h-8 w-8 mx-auto text-slate-400" />
            <div className="font-bold text-slate-800 text-sm">
              Sin módulos asignados
            </div>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Su cuenta actualmente no tiene asignados módulos con permisos de
              acceso. Por favor solicite habilitación a un Administrador.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
