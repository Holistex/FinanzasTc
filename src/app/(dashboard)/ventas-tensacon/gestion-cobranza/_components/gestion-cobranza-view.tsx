"use client";

import React, { useState, useTransition, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Filter,
  PhoneCall,
  Mail,
  MessageSquare,
  Calendar,
  AlertCircle,
  CheckCircle2,
  Clock,
  RotateCcw,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  FileSpreadsheet,
  Layers,
  Receipt,
  UserCheck,
  Building2,
  ExternalLink,
  MessageCircle,
  FileText,
  CalendarDays,
  ShieldCheck,
  AlertTriangle,
} from "lucide-react";
import {
  FacturaVenta,
  GestionCobranza,
  TipoGestionCobranza,
} from "@/types/database.types";
import {
  calculateDueDateInfo,
  cn,
  formatCLP,
  formatDateCL,
  formatRutDisplay,
  getTipoDocLabel,
} from "@/lib/utils";
import {
  CarteraCobranzaData,
  getCarteraCobranzaAction,
  ResumenSemanaCobranza,
} from "@/actions/gestion-cobranza.actions";
import { RegistrarGestionModal } from "./registrar-gestion-modal";
import { RegistrarGestionLoteModal } from "./registrar-gestion-lote-modal";
import { CobranzaPorClienteTab } from "./cobranza-por-cliente-tab";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { QUERY_KEYS } from "@/lib/prefetch-helpers";

type TabCobranza = "CARTERA" | "COBRANZAS" | "SEMANAL" | "POR_CLIENTE";

interface GestionCobranzaViewProps {
  initialData: CarteraCobranzaData;
  currentUserName?: string;
}

export function GestionCobranzaView({
  initialData,
  currentUserName = "Usuario Sistema",
}: GestionCobranzaViewProps) {
  const router = useRouter();
  const queryClient = useQueryClient();

  // Caché dinámico de TanStack Query para render instantáneo (<1ms) y revalidación en segundo plano
  const { data: cachedData } = useQuery({
    queryKey: QUERY_KEYS.gestionCobranza,
    queryFn: () => getCarteraCobranzaAction(),
    initialData,
    staleTime: 0,
  });

  const [localData, setLocalData] = useState<CarteraCobranzaData>(initialData);

  useEffect(() => {
    setLocalData(initialData);
    queryClient.setQueryData(QUERY_KEYS.gestionCobranza, initialData);
  }, [initialData, queryClient]);
  const data = cachedData ?? localData;
  const [activeTab, setActiveTab] = useState<TabCobranza>("CARTERA");
  const [isPending, startTransition] = useTransition();

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [filterGestionPago, setFilterGestionPago] = useState<"TODOS" | "DIRECTO_CLIENTE" | "FACTORING">("TODOS");
  const [filterEstadoGestion, setFilterEstadoGestion] = useState<"TODOS" | "CON_GESTION" | "SIN_GESTION">("TODOS");

  // Expanded rows state for Tab 2 (Factura por Factura inline history)
  const [expandedFacturas, setExpandedFacturas] = useState<Record<string, boolean>>({});

  // Expanded weeks state for Tab 3 (Semana accordions)
  const [expandedWeeks, setExpandedWeeks] = useState<Record<string, boolean>>(() => {
    // Expand the most recent week by default
    const initialWeeks: Record<string, boolean> = {};
    if (initialData.resumenSemanas.length > 0) {
      initialWeeks[initialData.resumenSemanas[0].semanaKey] = true;
    }
    return initialWeeks;
  });

  // Buscador de folio para Tab 3: Gestión por Semana
  const [folioFilterSemana, setFolioFilterSemana] = useState("");

  // Conteo de facturas críticas (Días Vencimiento <= 10) para el badge de Tab 4
  const countCarteraCritica = useMemo(() => {
    return data.facturas.filter((f) => {
      if (f.tipo_doc === 61) return false;
      const saldo = f.deuda_cliente ?? f.monto_neto_saldo ?? 0;
      if (saldo <= 0) return false;
      const dueInfo = calculateDueDateInfo(f.fecha_docto);
      return dueInfo.diasRestantes <= 10;
    }).length;
  }, [data.facturas]);

  const { semanasFiltradas, totalGestionesFolio, totalSemanasFolio } = useMemo(() => {
    const q = folioFilterSemana.trim().toLowerCase();
    if (!q) {
      return {
        semanasFiltradas: data.resumenSemanas,
        totalGestionesFolio: 0,
        totalSemanasFolio: 0,
      };
    }
    const filtered: ResumenSemanaCobranza[] = [];
    let countGestiones = 0;

    for (const sem of data.resumenSemanas) {
      const matchingGestiones = sem.gestiones.filter((g) =>
        String(g.factura_folio).includes(q)
      );
      if (matchingGestiones.length > 0) {
        countGestiones += matchingGestiones.length;
        filtered.push({
          ...sem,
          gestiones: matchingGestiones,
          totalGestiones: matchingGestiones.length,
        });
      }
    }

    return {
      semanasFiltradas: filtered,
      totalGestionesFolio: countGestiones,
      totalSemanasFolio: filtered.length,
    };
  }, [data.resumenSemanas, folioFilterSemana]);

  // Modal state
  const [selectedFacturaModal, setSelectedFacturaModal] = useState<FacturaVenta | null>(null);
  // Selección múltiple para gestión de cobranza en lote
  const [selectedFacturaIds, setSelectedFacturaIds] = useState<string[]>([]);
  const [isLoteModalOpen, setIsLoteModalOpen] = useState(false);

  const handleRefresh = () => {
    startTransition(async () => {
      const fresh = await getCarteraCobranzaAction();
      queryClient.setQueryData(QUERY_KEYS.gestionCobranza, fresh);
      await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.gestionCobranza });
      setLocalData(fresh);
      router.refresh();
    });
  };

  const toggleFacturaExpand = (facturaId: string) => {
    setExpandedFacturas((prev) => ({
      ...prev,
      [facturaId]: !prev[facturaId],
    }));
  };

  const toggleWeekExpand = (semanaKey: string) => {
    setExpandedWeeks((prev) => ({
      ...prev,
      [semanaKey]: !prev[semanaKey],
    }));
  };

  // Filtered invoices for Tab 1 & Tab 2
  const filteredFacturas = useMemo(() => {
    return data.facturas.filter((f) => {
      // 1. Text Search (RUT, Folio, Razón Social)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const folioStr = String(f.folio);
        const rutStr = (f.rut_cliente || "").toLowerCase();
        const razonStr = (f.razon_social || "").toLowerCase();
        if (!folioStr.includes(q) && !rutStr.includes(q) && !razonStr.includes(q)) {
          return false;
        }
      }

      // 2. Gestion de Pago filter
      if (filterGestionPago !== "TODOS" && f.gestion_pago !== filterGestionPago) {
        return false;
      }

      // 3. Estado Gestion filter
      const hasGestion = Boolean(f.gestiones_cobranza && f.gestiones_cobranza.length > 0);
      if (filterEstadoGestion === "CON_GESTION" && !hasGestion) return false;
      if (filterEstadoGestion === "SIN_GESTION" && hasGestion) return false;

      return true;
    });
  }, [data.facturas, searchQuery, filterGestionPago, filterEstadoGestion]);

  // Selección múltiple de facturas para gestión en lote
  const selectedFacturasList = useMemo(() => {
    return data.facturas.filter((f) => selectedFacturaIds.includes(f.id));
  }, [data.facturas, selectedFacturaIds]);

  const { totalSelectedMonto, selectedClientesSummary } = useMemo(() => {
    let total = 0;
    const clientesSet = new Set<string>();
    for (const f of selectedFacturasList) {
      total += Number(f.deuda_cliente ?? f.monto_neto_saldo ?? f.monto_total ?? 0);
      if (f.razon_social) clientesSet.add(f.razon_social);
    }
    const clientesArr = Array.from(clientesSet);
    let summaryText = "";
    if (clientesArr.length === 1) {
      summaryText = `Cliente: ${clientesArr[0]}`;
    } else if (clientesArr.length > 1) {
      summaryText = `${clientesArr.length} clientes distintos`;
    }
    return { totalSelectedMonto: total, selectedClientesSummary: summaryText };
  }, [selectedFacturasList]);

  const isAllVisibleSelected =
    filteredFacturas.length > 0 &&
    filteredFacturas.every((f) => selectedFacturaIds.includes(f.id));

  const toggleSelectAll = () => {
    if (isAllVisibleSelected) {
      const visibleSet = new Set(filteredFacturas.map((f) => f.id));
      setSelectedFacturaIds((prev) => prev.filter((id) => !visibleSet.has(id)));
    } else {
      const visibleIds = filteredFacturas.map((f) => f.id);
      setSelectedFacturaIds((prev) => Array.from(new Set([...prev, ...visibleIds])));
    }
  };

  const toggleSelectRow = (id: string) => {
    setSelectedFacturaIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  return (
    <div className="w-full space-y-4">
      {/* 1. Header & Quick Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-[#E05A10] flex items-center justify-center text-white shadow-sm">
            <PhoneCall className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold tracking-tight text-[#0F172A]">
                VENTAS TENSACON
              </h1>
              <span className="text-xs font-semibold text-slate-600">
                · Gestión de Cobranza
              </span>
            </div>
            <p className="text-[11px] text-slate-600">
              Seguimiento de cobro a clientes, compromisos de pago y bitácora semanal
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleRefresh}
          disabled={isPending}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 transition-colors disabled:opacity-50"
        >
          <RotateCcw className={cn("h-3.5 w-3.5", isPending && "animate-spin")} />
          <span>Actualizar</span>
        </button>
      </div>

      {/* 2. Top 3 KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* KPI 1: TOTAL CARTERA */}
        <div className="rounded-lg border border-slate-200 bg-white p-3.5 shadow-sm border-l-4 border-l-slate-800 flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600 block">
              TOTAL CARTERA PENDIENTE
            </span>
            <div className="text-lg font-mono font-extrabold text-[#0F172A]">
              {formatCLP(data.totalCartera)}
            </div>
            <div className="text-[11px] text-slate-600 flex items-center gap-1">
              <span className="font-semibold text-slate-700">
                {data.cantidadTotal}
              </span>{" "}
              facturas con saldo adeudado
            </div>
          </div>
          <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-700 shrink-0">
            <Receipt className="h-5 w-5" />
          </div>
        </div>

        {/* KPI 2: TOTAL GESTIÓN COBRANZA */}
        <div className="rounded-lg border border-slate-200 bg-white p-3.5 shadow-sm border-l-4 border-l-emerald-600 flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600 block">
              TOTAL GESTIÓN COBRANZA
            </span>
            <div className="text-lg font-mono font-extrabold text-emerald-800">
              {formatCLP(data.totalConGestion)}
            </div>
            <div className="text-[11px] text-slate-600 flex items-center gap-1">
              <span className="font-semibold text-emerald-800">
                {data.cantidadConGestion}
              </span>{" "}
              facturas con interacción registrada
            </div>
          </div>
          <div className="h-10 w-10 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600 shrink-0">
            <UserCheck className="h-5 w-5" />
          </div>
        </div>

        {/* KPI 3: TOTAL SIN GESTIÓN */}
        <div className="rounded-lg border border-slate-200 bg-white p-3.5 shadow-sm border-l-4 border-l-amber-500 flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600 block">
              TOTAL SIN GESTIÓN
            </span>
            <div className="text-lg font-mono font-extrabold text-amber-800">
              {formatCLP(data.totalSinGestion)}
            </div>
            <div className="text-[11px] text-slate-600 flex items-center gap-1">
              <span className="font-semibold text-amber-800">
                {data.cantidadSinGestion}
              </span>{" "}
              facturas sin contacto previo
            </div>
          </div>
          <div className="h-10 w-10 rounded-full bg-amber-50 flex items-center justify-center text-amber-600 shrink-0">
            <AlertTriangle className="h-5 w-5" />
          </div>
        </div>
      </div>

      {/* 3. Navigation Tabs */}
      <div className="border-b border-slate-200 bg-white rounded-t-lg px-2 pt-2 shadow-sm">
        <div className="flex items-center gap-1 overflow-x-auto whitespace-nowrap">
          <button
            type="button"
            onClick={() => setActiveTab("CARTERA")}
            className={cn(
              "flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-t-md border-b-2 transition-all",
              activeTab === "CARTERA"
                ? "border-[#E05A10] text-[#E05A10] bg-orange-50/50"
                : "border-transparent text-slate-600 hover:text-slate-800 hover:bg-slate-50"
            )}
          >
            <Receipt className="h-3.5 w-3.5" />
            <span>Facturas Pendientes / Cartera</span>
            <span
              className={cn(
                "rounded-full px-1.5 py-0.2 text-[10px] font-mono",
                activeTab === "CARTERA"
                  ? "bg-[#E05A10] text-white"
                  : "bg-slate-200 text-slate-700"
              )}
            >
              {data.cantidadTotal}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("COBRANZAS")}
            className={cn(
              "flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-t-md border-b-2 transition-all",
              activeTab === "COBRANZAS"
                ? "border-[#E05A10] text-[#E05A10] bg-orange-50/50"
                : "border-transparent text-slate-600 hover:text-slate-800 hover:bg-slate-50"
            )}
          >
            <PhoneCall className="h-3.5 w-3.5" />
            <span>Cobranzas / Historial</span>
            <span
              className={cn(
                "rounded-full px-1.5 py-0.2 text-[10px] font-mono",
                activeTab === "COBRANZAS"
                  ? "bg-[#E05A10] text-white"
                  : "bg-slate-200 text-slate-700"
              )}
            >
              {data.cantidadConGestion} / {data.cantidadTotal}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("SEMANAL")}
            className={cn(
              "flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-t-md border-b-2 transition-all",
              activeTab === "SEMANAL"
                ? "border-[#E05A10] text-[#E05A10] bg-orange-50/50"
                : "border-transparent text-slate-600 hover:text-slate-800 hover:bg-slate-50"
            )}
          >
            <CalendarDays className="h-3.5 w-3.5" />
            <span>Gestión por Semana</span>
            <span
              className={cn(
                "rounded-full px-1.5 py-0.2 text-[10px] font-mono",
                activeTab === "SEMANAL"
                  ? "bg-[#E05A10] text-white"
                  : "bg-slate-200 text-slate-700"
              )}
            >
              {data.resumenSemanas.length} Semanas
            </span>
          </button>

          {/* Pestaña 4: Cobranza por Cliente */}
          <button
            type="button"
            onClick={() => setActiveTab("POR_CLIENTE")}
            className={cn(
              "flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-t-md border-b-2 transition-all",
              activeTab === "POR_CLIENTE"
                ? "border-[#E05A10] text-[#E05A10] bg-orange-50/50"
                : "border-transparent text-slate-600 hover:text-slate-800 hover:bg-slate-50"
            )}
          >
            <Building2 className="h-3.5 w-3.5" />
            <span>Cobranza por Cliente</span>
            <span
              className={cn(
                "rounded-full px-1.5 py-0.2 text-[10px] font-mono",
                activeTab === "POR_CLIENTE"
                  ? "bg-[#E05A10] text-white"
                  : "bg-slate-200 text-slate-700"
              )}
            >
              {countCarteraCritica} Críticas
            </span>
          </button>
        </div>
      </div>

      {/* 4. Filters Bar (Visible for Tab 1 & Tab 2) */}
      {activeTab !== "SEMANAL" && activeTab !== "POR_CLIENTE" && (
        <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm text-xs">
          <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[260px]">
            {/* Search input */}
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar por Folio, RUT o Razón Social..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-slate-50/50 pl-8 pr-3 py-1.5 text-xs text-slate-800 shadow-sm focus:border-[#E05A10] focus:bg-white focus:outline-none"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-2 text-[10px] text-slate-400 hover:text-slate-600"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Filter by Gestión de Pago */}
            <select
              value={filterGestionPago}
              onChange={(e) =>
                setFilterGestionPago(
                  e.target.value as "TODOS" | "DIRECTO_CLIENTE" | "FACTORING"
                )
              }
              className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700 shadow-sm focus:border-[#E05A10] focus:outline-none"
            >
              <option value="TODOS">Tipo Pago: Todos</option>
              <option value="DIRECTO_CLIENTE">Directo Cliente</option>
              <option value="FACTORING">Factoring</option>
            </select>

            {/* Filter by Estado Gestión */}
            <select
              value={filterEstadoGestion}
              onChange={(e) =>
                setFilterEstadoGestion(
                  e.target.value as "TODOS" | "CON_GESTION" | "SIN_GESTION"
                )
              }
              className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700 shadow-sm focus:border-[#E05A10] focus:outline-none"
            >
              <option value="TODOS">Estado: Todos</option>
              <option value="CON_GESTION">Con Gestión ({data.cantidadConGestion})</option>
              <option value="SIN_GESTION">Sin Gestión ({data.cantidadSinGestion})</option>
            </select>
          </div>

          <div className="text-[11px] text-slate-600 font-mono">
            Mostrando <strong>{filteredFacturas.length}</strong> de{" "}
            <strong>{data.cantidadTotal}</strong> facturas
          </div>
        </div>
      )}

      {/* 5. TAB 1: FACTURAS PENDIENTES / CARTERA */}
      {activeTab === "CARTERA" && (
        <div className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-[850px] lg:min-w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-600">
                  <th className="py-2.5 px-3 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={isAllVisibleSelected}
                      onChange={toggleSelectAll}
                      className="h-4 w-4 rounded border-slate-300 text-[#E05A10] focus:ring-[#E05A10] cursor-pointer"
                      title="Seleccionar / Deseleccionar Todo"
                    />
                  </th>
                  <th className="py-2.5 px-3">Folio / Doc</th>
                  <th className="py-2.5 px-3">RUT Cliente</th>
                  <th className="py-2.5 px-3">Razón Social</th>
                  <th className="py-2.5 px-3">Emisión / Vencimiento</th>
                  <th className="py-2.5 px-3">MODALIDAD</th>
                  <th className="py-2.5 px-3 text-right">Monto Total</th>
                  <th className="py-2.5 px-3 text-right">Saldo Pendiente</th>
                  <th className="py-2.5 px-3 text-center">Cobranza</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredFacturas.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-slate-600">
                      No se encontraron facturas pendientes con los filtros aplicados.
                    </td>
                  </tr>
                ) : (
                  filteredFacturas.map((row) => {
                    const dueInfo = calculateDueDateInfo(row.fecha_docto);
                    const saldo = Number(row.deuda_cliente ?? row.monto_neto_saldo ?? row.monto_total);
                    const isSelected = selectedFacturaIds.includes(row.id);

                    return (
                      <tr
                        key={row.id}
                        className={cn(
                          "hover:bg-slate-50/80 transition-colors",
                          isSelected && "bg-orange-50/50"
                        )}
                      >
                        {/* Checkbox */}
                        <td
                          className="py-2.5 px-3 text-center whitespace-nowrap"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectRow(row.id)}
                            className="h-4 w-4 rounded border-slate-300 text-[#E05A10] focus:ring-[#E05A10] cursor-pointer"
                          />
                        </td>

                        {/* Folio */}
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono font-bold text-slate-900">
                              #{row.folio}
                            </span>
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              DTE 33
                            </span>
                          </div>
                        </td>

                        {/* RUT Cliente */}
                        <td className="py-2.5 px-3 whitespace-nowrap font-mono text-slate-700">
                          {formatRutDisplay(row.rut_cliente)}
                        </td>

                        {/* Razón Social */}
                        <td className="py-2.5 px-3">
                          <div
                            className="font-medium text-[#0F172A] truncate max-w-[200px] sm:max-w-[240px]"
                            title={row.razon_social}
                          >
                            {row.razon_social}
                          </div>
                        </td>

                        {/* Emisión / Vencimiento con Semáforo */}
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <div className="flex items-center justify-between gap-2">
                            <div className="leading-tight">
                              <div className="font-mono text-[#0F172A] font-medium">
                                {dueInfo.fechaEmisionCL}
                              </div>
                              <div className="text-[10px] font-mono text-slate-600 mt-0.5">
                                Venc: {dueInfo.fechaVencimientoCL}
                              </div>
                            </div>

                            <span
                              className={cn(
                                "inline-flex items-center justify-center px-1.5 py-0.5 rounded text-[10px] font-mono font-bold border min-w-[36px] text-center",
                                dueInfo.badgeColor === "emerald" &&
                                  "bg-emerald-50 text-emerald-700 border-emerald-200",
                                dueInfo.badgeColor === "amber" &&
                                  "bg-amber-50 text-amber-800 border-amber-300",
                                dueInfo.badgeColor === "rose" &&
                                  "bg-rose-50 text-rose-700 border-rose-200"
                              )}
                              title={`Días restantes al vencimiento: ${dueInfo.diasRestantes}`}
                            >
                              {dueInfo.badgeLabel}
                            </span>
                          </div>
                        </td>

                        {/* Modalidad (Directo vs Factoring) */}
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          {row.gestion_pago === "FACTORING" ? (
                            <div className="leading-tight">
                              <span className="inline-flex items-center gap-1 font-mono font-bold text-[10px] text-[#E05A10] bg-orange-50 px-1.5 py-0.5 rounded border border-orange-200">
                                <Layers className="h-3 w-3" /> FACTORING
                              </span>
                              {row.empresa_factoring_cliente && (
                                <div
                                  className="text-[10px] text-slate-600 truncate max-w-[140px] mt-0.5"
                                  title={row.empresa_factoring_cliente.razon_social}
                                >
                                  {row.empresa_factoring_cliente.razon_social}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="inline-flex items-center gap-1 font-mono font-medium text-[10px] text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                              <Building2 className="h-3 w-3" /> DIRECTO
                            </span>
                          )}
                        </td>

                        {/* Monto Total */}
                        <td className="py-2.5 px-3 text-right font-mono text-slate-700 whitespace-nowrap">
                          {formatCLP(row.monto_total)}
                        </td>

                        {/* Saldo Pendiente */}
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-[#E05A10] whitespace-nowrap">
                          {formatCLP(saldo)}
                        </td>

                        {/* Acción */}
                        <td className="py-2.5 px-3 text-center whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => setSelectedFacturaModal(row)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[#E05A10] text-white text-[11px] font-bold hover:bg-[#c94f0e] transition-colors shadow-sm"
                          >
                            <PhoneCall className="h-3 w-3" />
                            <span>Cobranza</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 6. TAB 2: COBRANZAS (GESTIÓN FACTURA POR FACTURA) */}
      {activeTab === "COBRANZAS" && (
        <div className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-[850px] lg:min-w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-600">
                  <th className="py-2.5 px-3 w-8"></th>
                  <th className="py-2.5 px-3">Factura</th>
                  <th className="py-2.5 px-3">Cliente / Deudor</th>
                  <th className="py-2.5 px-3 text-right">Saldo Deuda</th>
                  <th className="py-2.5 px-3">Última Gestión de Cobranza</th>
                  <th className="py-2.5 px-3 text-center whitespace-nowrap">N° GEST.</th>
                  <th className="py-2.5 px-3 text-center whitespace-nowrap">Cobranza</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredFacturas.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-600">
                      No hay facturas pendientes disponibles.
                    </td>
                  </tr>
                ) : (
                  filteredFacturas.map((row) => {
                    const saldo = Number(row.deuda_cliente ?? row.monto_neto_saldo ?? row.monto_total);
                    const gestiones = row.gestiones_cobranza || [];
                    const ultima = gestiones[0] || null;
                    const isExpanded = Boolean(expandedFacturas[row.id]);

                    return (
                      <React.Fragment key={row.id}>
                        <tr className={cn("hover:bg-slate-50/80 transition-colors", isExpanded && "bg-slate-50/50")}>
                          {/* Toggle expand button */}
                          <td className="py-2.5 px-2 text-center">
                            {gestiones.length > 0 ? (
                              <button
                                type="button"
                                onClick={() => toggleFacturaExpand(row.id)}
                                className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors"
                                title="Ver bitácora de interacciones"
                              >
                                {isExpanded ? (
                                  <ChevronDown className="h-3.5 w-3.5" />
                                ) : (
                                  <ChevronRight className="h-3.5 w-3.5" />
                                )}
                              </button>
                            ) : (
                              <span className="inline-block w-3.5 h-3.5" />
                            )}
                          </td>

                          {/* Factura */}
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <div className="font-mono font-bold text-slate-900">
                              #{row.folio}
                            </div>
                            <div className="text-[10px] text-slate-600 font-mono">
                              Emisión: {formatDateCL(row.fecha_docto)}
                            </div>
                          </td>

                          {/* Cliente */}
                          <td className="py-2.5 px-3">
                            <div
                              className="font-semibold text-[#0F172A] truncate max-w-[220px]"
                              title={row.razon_social}
                            >
                              {row.razon_social}
                            </div>
                            <div className="font-mono text-[10px] text-slate-600">
                              {formatRutDisplay(row.rut_cliente)}
                            </div>
                          </td>

                          {/* Saldo Deuda */}
                          <td className="py-2.5 px-3 text-right font-mono font-extrabold text-[#E05A10] whitespace-nowrap">
                            {formatCLP(saldo)}
                          </td>

                          {/* Última Gestión */}
                          <td className="py-2.5 px-3">
                            {ultima ? (
                              <div className="space-y-1">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {ultima.tipo_gestion === "LLAMADA" && (
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-amber-50 text-amber-800 border border-amber-300">
                                      <PhoneCall className="h-2.5 w-2.5" /> LLAMADA
                                    </span>
                                  )}
                                  {ultima.tipo_gestion === "CORREO" && (
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-sky-50 text-sky-800 border border-sky-300">
                                      <Mail className="h-2.5 w-2.5" /> CORREO
                                    </span>
                                  )}
                                    {ultima.tipo_gestion === "WHATSAPP" && (
                                      <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-emerald-50 text-emerald-800 border border-emerald-300">
                                        <MessageSquare className="h-2.5 w-2.5" /> WHATSAPP
                                      </span>
                                    )}
                                    {ultima.tipo_gestion !== "LLAMADA" &&
                                      ultima.tipo_gestion !== "CORREO" &&
                                      ultima.tipo_gestion !== "WHATSAPP" && (
                                        <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-slate-100 text-slate-800 border border-slate-300">
                                          {ultima.tipo_gestion || "GESTIÓN"}
                                        </span>
                                      )}
                                    <span className="text-[10px] font-mono text-slate-600">
                                      {formatDateCL(ultima.created_at)} ({ultima.usuario_nombre || "Usuario Sistema"})
                                    </span>
                                </div>
                                <p
                                  className="text-[11px] text-slate-600 truncate max-w-[340px]"
                                  title={ultima.observaciones}
                                >
                                  {ultima.observaciones}
                                </p>
                                {ultima.fecha_compromiso_pago && (
                                  <div className="text-[10px] font-mono text-emerald-700 font-semibold flex items-center gap-1">
                                    <Calendar className="h-3 w-3" /> Compromiso:{" "}
                                    {formatDateCL(ultima.fecha_compromiso_pago)}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="flex items-center gap-1 text-[11px] text-amber-800 font-medium">
                                <AlertCircle className="h-3.5 w-3.5 text-amber-600" />
                                <span>Sin gestiones registradas aún</span>
                              </div>
                            )}
                          </td>

                          {/* Contador de Iteraciones de Cobranza */}
                          <td className="py-2.5 px-3 text-center whitespace-nowrap">
                            {gestiones.length > 0 ? (
                              <span
                                className="inline-flex items-center justify-center min-w-[26px] px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-emerald-50 text-emerald-700 border border-emerald-200"
                                title={`${gestiones.length} gestión(es) registrada(s)`}
                              >
                                {gestiones.length}
                              </span>
                            ) : (
                              <span
                                className="inline-flex items-center justify-center min-w-[26px] px-2 py-0.5 rounded-full text-[11px] font-mono font-semibold bg-slate-100 text-slate-400 border border-slate-200"
                                title="Sin gestiones registradas"
                              >
                                0
                              </span>
                            )}
                          </td>

                          {/* Acción: Botón Cobranza */}
                          <td className="py-2.5 px-3 text-center whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => setSelectedFacturaModal(row)}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-[#E05A10] text-white text-xs font-bold hover:bg-[#c94f0e] transition-colors shadow-sm"
                            >
                              <PhoneCall className="h-3.5 w-3.5" />
                              <span>Cobranza</span>
                            </button>
                          </td>
                        </tr>

                        {/* Inline history expansion */}
                        {isExpanded && gestiones.length > 0 && (
                          <tr className="bg-slate-50/70 border-b border-slate-200">
                            <td colSpan={7} className="p-3 pl-10">
                              <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
                                <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                                  <FileText className="h-3.5 w-3.5 text-[#E05A10]" />
                                  <span>Historial de Cobranzas Factura #{row.folio}</span>
                                </div>
                                <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                                  {gestiones.map((g) => (
                                    <div
                                      key={g.id}
                                      className="rounded border border-slate-100 bg-slate-50 p-2 text-xs flex flex-col gap-1"
                                    >
                                      <div className="flex items-center justify-between text-[11px]">
                                        <div className="flex items-center gap-2 font-medium">
                                          <span className="font-bold text-slate-800 font-mono">
                                            [{g.tipo_gestion || "GESTIÓN"}]
                                          </span>
                                          <span className="text-slate-600">
                                            por {g.usuario_nombre || "Usuario Sistema"}
                                          </span>
                                          {g.contacto_nombre && (
                                            <span className="text-slate-600">
                                              · Contacto: {g.contacto_nombre}
                                            </span>
                                          )}
                                        </div>
                                        <span className="font-mono text-slate-600 text-[10px]">
                                          {new Date(g.created_at).toLocaleString("es-CL", {
                                            day: "2-digit",
                                            month: "2-digit",
                                            year: "numeric",
                                            hour: "2-digit",
                                            minute: "2-digit",
                                          })}
                                        </span>
                                      </div>
                                      <p className="text-slate-700 leading-tight">
                                        {g.observaciones}
                                      </p>
                                      {g.fecha_compromiso_pago && (
                                        <div className="text-[10px] font-mono text-emerald-700 font-bold">
                                          Compromiso pactado: {formatDateCL(g.fecha_compromiso_pago)}
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 7. TAB 3: GESTIÓN POR SEMANA (Agrupado por created_at real) */}
      {activeTab === "SEMANAL" && (
        <div className="space-y-3">
          {/* Folio Search and Info Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
            <div className="flex items-center gap-2 flex-1 min-w-[260px] max-w-md">
              <div className="relative w-full">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar por Folio (ej. 4222 o 10452)..."
                  value={folioFilterSemana}
                  onChange={(e) => setFolioFilterSemana(e.target.value)}
                  className="w-full rounded-md border border-slate-300 bg-slate-50/50 pl-8 pr-7 py-1.5 text-xs text-slate-800 shadow-sm focus:border-[#E05A10] focus:bg-white focus:outline-none"
                />
                {folioFilterSemana && (
                  <button
                    type="button"
                    onClick={() => setFolioFilterSemana("")}
                    className="absolute right-2 top-2 text-xs text-slate-400 hover:text-slate-600"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3">
              {folioFilterSemana.trim() ? (
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-orange-50 border border-orange-200 text-xs font-semibold text-[#E05A10]">
                  <Filter className="h-3 w-3" />
                  <span>
                    Factura #{folioFilterSemana.trim()}: {totalGestionesFolio} gestión(es) en {totalSemanasFolio} semana(s)
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <CalendarDays className="h-4 w-4 text-[#E05A10]" />
                  <span>
                    Agrupación cronológica por semana según la <strong>fecha real de carga/registro</strong>.
                  </span>
                </div>
              )}
              <span className="font-mono text-[11px] text-slate-500 font-semibold border-l pl-3 border-slate-200">
                {semanasFiltradas.length} semanas
              </span>
            </div>
          </div>

          {semanasFiltradas.length === 0 ? (
            <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-xs text-slate-500 shadow-sm">
              {folioFilterSemana.trim()
                ? `No se encontraron gestiones asociadas al Folio #${folioFilterSemana.trim()}.`
                : "No hay interacciones de cobranza registradas en el sistema."}
            </div>
          ) : (
            semanasFiltradas.map((semana) => {
              const isWeekOpen =
                Boolean(expandedWeeks[semana.semanaKey]) ||
                Boolean(folioFilterSemana.trim());

              return (
                <div
                  key={semana.semanaKey}
                  className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden"
                >
                  {/* Semana Accordion Header */}
                  <button
                    type="button"
                    onClick={() => toggleWeekExpand(semana.semanaKey)}
                    className="w-full flex flex-wrap items-center justify-between gap-3 p-3.5 bg-slate-50/80 hover:bg-slate-100/80 transition-colors text-left border-b border-slate-200"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-lg bg-[#0F172A] flex items-center justify-center text-white font-mono font-bold text-xs">
                        W{semana.numeroSemana}
                      </div>
                      <div>
                        <div className="text-xs font-bold text-[#0F172A]">
                          {semana.tituloSemana}
                        </div>
                        <div className="text-[11px] text-slate-600 font-mono">
                          {semana.totalGestiones} gestiones registradas
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {/* Metric pills */}
                      <div className="hidden sm:flex items-center gap-2 text-[10px] font-mono">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-300 font-bold">
                          <PhoneCall className="h-2.5 w-2.5" /> {semana.totalLlamadas}
                        </span>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-sky-50 text-sky-800 border border-sky-300 font-bold">
                          <Mail className="h-2.5 w-2.5" /> {semana.totalCorreos}
                        </span>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-300 font-bold">
                          <MessageSquare className="h-2.5 w-2.5" /> {semana.totalWhatsapp}
                        </span>
                      </div>

                      {/* Monto Gestionado */}
                      <div className="text-right">
                        <span className="text-[10px] text-slate-600 font-medium block">
                          Cartera Gestionada
                        </span>
                        <span className="font-mono font-extrabold text-[#E05A10] text-xs">
                          {formatCLP(semana.montoCarteraGestionada)}
                        </span>
                      </div>

                      <div className="h-6 w-6 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-500">
                        {isWeekOpen ? (
                          <ChevronUp className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5" />
                        )}
                      </div>
                    </div>
                  </button>

                  {/* Semana Accordion Content */}
                  {isWeekOpen && (
                    <div className="overflow-x-auto">
                      <table className="min-w-[850px] lg:min-w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50/50 text-[10px] font-bold uppercase tracking-wider text-slate-600">
                            <th className="py-2 px-3">Fecha y Hora</th>
                            <th className="py-2 px-3">Factura / DTE</th>
                            <th className="py-2 px-3">Cliente</th>
                            <th className="py-2 px-3">Tipo Interacción</th>
                            <th className="py-2 px-3">Compromiso Pago</th>
                            <th className="py-2 px-3">Observaciones / Acuerdos</th>
                            <th className="py-2 px-3">Gestor</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {semana.gestiones.map((g) => {
                            const dateObj = new Date(g.created_at);
                            const fechaCL = dateObj.toLocaleDateString("es-CL", {
                              day: "2-digit",
                              month: "2-digit",
                              year: "numeric",
                            });
                            const horaCL = dateObj.toLocaleTimeString("es-CL", {
                              hour: "2-digit",
                              minute: "2-digit",
                            });

                            return (
                              <tr key={g.id} className="hover:bg-slate-50/80 transition-colors">
                                {/* Fecha y Hora de registro */}
                                <td className="py-2 px-3 whitespace-nowrap">
                                  <div className="font-mono text-slate-900 font-medium">
                                    {fechaCL}
                                  </div>
                                  <div className="font-mono text-[10px] text-slate-600">
                                    {horaCL} hrs
                                  </div>
                                </td>

                                {/* Factura */}
                                <td className="py-2 px-3 whitespace-nowrap font-mono font-bold text-slate-900">
                                  #{g.factura_folio}
                                </td>

                                {/* Cliente */}
                                <td className="py-2 px-3">
                                  <div
                                    className="font-semibold text-[#0F172A] truncate max-w-[160px]"
                                    title={g.factura_razon_social}
                                  >
                                    {g.factura_razon_social}
                                  </div>
                                  <div className="font-mono text-[10px] text-slate-600">
                                    {formatRutDisplay(g.factura_rut_cliente)}
                                  </div>
                                </td>

                                {/* Tipo */}
                                <td className="py-2 px-3 whitespace-nowrap">
                                  {g.tipo_gestion === "LLAMADA" && (
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-50 text-amber-800 border border-amber-300">
                                      <PhoneCall className="h-2.5 w-2.5" /> LLAMADA
                                    </span>
                                  )}
                                  {g.tipo_gestion === "CORREO" && (
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-sky-50 text-sky-800 border border-sky-300">
                                      <Mail className="h-2.5 w-2.5" /> CORREO
                                    </span>
                                  )}
                                  {g.tipo_gestion === "WHATSAPP" && (
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-50 text-emerald-800 border border-emerald-300">
                                      <MessageSquare className="h-2.5 w-2.5" /> WHATSAPP
                                    </span>
                                  )}
                                </td>

                                {/* Compromiso Pago */}
                                <td className="py-2 px-3 whitespace-nowrap">
                                  {g.fecha_compromiso_pago ? (
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                      <Calendar className="h-2.5 w-2.5" /> {formatDateCL(g.fecha_compromiso_pago)}
                                    </span>
                                  ) : (
                                    <span className="text-[10px] text-slate-600 italic">
                                      Sin compromiso
                                    </span>
                                  )}
                                </td>

                                {/* Observaciones */}
                                <td className="py-2 px-3">
                                  <p
                                    className="text-slate-700 text-xs leading-relaxed max-w-[280px] sm:max-w-[340px] truncate"
                                    title={g.observaciones}
                                  >
                                    {g.observaciones}
                                  </p>
                                  {g.contacto_nombre && (
                                    <div className="text-[10px] text-slate-600 mt-0.5">
                                      Contacto: {g.contacto_nombre}{" "}
                                      {g.contacto_telefono_email && `(${g.contacto_telefono_email})`}
                                    </div>
                                  )}
                                </td>

                                {/* Gestor */}
                                <td className="py-2 px-3 whitespace-nowrap text-slate-700 font-medium text-[11px]">
                                  {g.usuario_nombre || "Cedrix Vargas"}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* 8. TAB 4: COBRANZA POR CLIENTE */}
      {activeTab === "POR_CLIENTE" && (
        <CobranzaPorClienteTab
          facturas={data.facturas}
          onRegistrarGestion={(factura) => setSelectedFacturaModal(factura)}
        />
      )}

      {/* 9. Modal para Registrar Gestión Individual */}
      {selectedFacturaModal && (
        <RegistrarGestionModal
          factura={selectedFacturaModal}
          isOpen={Boolean(selectedFacturaModal)}
          currentUserName={currentUserName}
          onClose={() => setSelectedFacturaModal(null)}
          onSuccess={handleRefresh}
        />
      )}

      {/* 10. Modal para Registrar Gestión en Lote */}
      {isLoteModalOpen && selectedFacturasList.length > 0 && (
        <RegistrarGestionLoteModal
          facturas={selectedFacturasList}
          isOpen={isLoteModalOpen}
          currentUserName={currentUserName}
          onClose={() => setIsLoteModalOpen(false)}
          onSuccess={() => {
            setSelectedFacturaIds([]);
            handleRefresh();
          }}
        />
      )}

      {/* 11. Barra Flotante de Acciones Masivas (Floating Action Bar) */}
      {activeTab === "CARTERA" && selectedFacturaIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-[94%] max-w-2xl animate-in slide-in-from-bottom-5 duration-200">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#0F172A] text-white px-5 py-3 shadow-2xl border border-slate-700/80 backdrop-blur-md">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-[#E05A10] flex items-center justify-center text-white font-extrabold text-xs shadow-sm">
                {selectedFacturaIds.length}
              </div>
              <div>
                <div className="text-xs font-bold text-white flex items-center gap-1.5">
                  <span>
                    {selectedFacturaIds.length}{" "}
                    {selectedFacturaIds.length === 1
                      ? "factura seleccionada"
                      : "facturas seleccionadas"}
                  </span>
                  <span className="text-slate-400 font-normal">·</span>
                  <span className="text-[#E05A10] font-mono font-semibold">
                    {formatCLP(totalSelectedMonto)}
                  </span>
                </div>
                {selectedClientesSummary && (
                  <p className="text-[10px] text-slate-400 truncate max-w-xs">
                    {selectedClientesSummary}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsLoteModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#E05A10] hover:bg-[#c94f0e] text-white text-xs font-bold shadow-md transition-colors"
              >
                <PhoneCall className="h-3.5 w-3.5" />
                <span>Gestionar Cobranza en Lote ({selectedFacturaIds.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedFacturaIds([])}
                className="px-2.5 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
