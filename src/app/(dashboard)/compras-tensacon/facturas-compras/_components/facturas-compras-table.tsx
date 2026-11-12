"use client";

import React, { useState, useTransition, useMemo } from "react";
import {
  Search,
  Filter,
  UploadCloud,
  RotateCcw,
  Building2,
  Layers,
  CreditCard,
  Banknote,
  Calendar,
  AlertCircle,
  FileSpreadsheet,
  CalendarClock,
  Clock,
  CheckCircle2,
  FileText,
  SlidersHorizontal,
  ChevronRight,
  Sparkles,
  FileDiff,
  Receipt,
  ArrowRight,
  TrendingDown,
  History,
  X,
  Calculator,
  Coins,
  DollarSign,
} from "lucide-react";
import {
  EmpresaConfirming,
  EmpresaFactoringProveedor,
  EstadoFacturaCompra,
  FacturaCompra,
  NeteoCompra,
  MantenedorColaborador,
  MantenedorON,
} from "@/types/database.types";
import {
  ComprasKPIs,
  getFacturasComprasAction,
} from "@/actions/facturas-compras.actions";
import {
  calculateDueDateInfo,
  cn,
  formatCLP,
  formatDateCL,
  formatRutDisplay,
  getTipoDocLabel,
} from "@/lib/utils";
import dynamic from "next/dynamic";
import { TensaconUserSession } from "@/lib/auth/session";

// Code-splitting y carga diferida (lazy loading) de modales pesados que usan PapaParse
const CsvImportComprasModal = dynamic(
  () => import("./csv-import-compras-modal").then((m) => m.CsvImportComprasModal),
  { ssr: false }
);
const CambiarEstadoCompraModal = dynamic(
  () => import("./cambiar-estado-compra-modal").then((m) => m.CambiarEstadoCompraModal),
  { ssr: false }
);
const RegistrarPagoCompraModal = dynamic(
  () => import("./registrar-pago-compra-modal").then((m) => m.RegistrarPagoCompraModal),
  { ssr: false }
);

export type TabCompras = "CARTERA" | "CHEQUES" | "FACTORING" | "CONFIRMING" | "FAC_NC";
export type SubTabFacNc = "TODOS" | "SOLO_NC" | "SOLO_FAC" | "HISTORIAL_NETEOS";

interface FacturasComprasTableProps {
  initialData: FacturaCompra[];
  initialKpis: ComprasKPIs;
  factoringProveedores: EmpresaFactoringProveedor[];
  empresasConfirming: EmpresaConfirming[];
  colaboradores?: MantenedorColaborador[];
  catalogoOn?: MantenedorON[];
  initialNeteos?: NeteoCompra[];
  initialFacNcCount?: number;
  userSession?: TensaconUserSession;
}

function getTabName(tab: TabCompras): string {
  switch (tab) {
    case "CARTERA":
      return "Cartera";
    case "CHEQUES":
      return "Cheques";
    case "FACTORING":
      return "Factoring";
    case "CONFIRMING":
      return "Confirming";
    case "FAC_NC":
      return "FAC/NC";
  }
}

function getEmptyMessage(tab: TabCompras) {
  switch (tab) {
    case "CARTERA":
      return {
        title: "No hay facturas pendientes en Cartera / Deuda Directa.",
        subtitle: "Todas las facturas están al día o asignadas a otras modalidades.",
      };
    case "CHEQUES":
      return {
        title: "No hay facturas registradas en modalidad Cheques.",
        subtitle: "Asigne facturas a Cheque o emita cuotas para gestionarlas aquí.",
      };
    case "FACTORING":
      return {
        title: "No hay facturas cedidas a Factoring de Proveedores.",
        subtitle: "Las facturas en cesión financiera aparecerán en esta sección.",
      };
    case "CONFIRMING":
      return {
        title: "No hay facturas programadas en Confirming Bancario.",
        subtitle: "Las operaciones bancarias de Confirming se listarán aquí.",
      };
    default:
      return {
        title: "No se encontraron documentos.",
        subtitle: "Intente modificando los filtros de búsqueda.",
      };
  }
}

export function FacturasComprasTable({
  initialData,
  initialKpis,
  factoringProveedores,
  empresasConfirming,
  colaboradores = [],
  catalogoOn = [],
  initialNeteos = [],
  initialFacNcCount = 0,
  userSession,
}: FacturasComprasTableProps) {
  const [data, setData] = useState<FacturaCompra[]>(initialData);
  const [kpis, setKpis] = useState<ComprasKPIs>(initialKpis);
  const [neteos, setNeteos] = useState<NeteoCompra[]>(initialNeteos);
  const [facNcCount, setFacNcCount] = useState<number>(initialFacNcCount);
  const [isPending, startTransition] = useTransition();

  // Pestañas Principales: 5 Pestañas segmentadas por estado de pago
  const [activeTab, setActiveTab] = useState<TabCompras>("CARTERA");
  const [subTabFacNc, setSubTabFacNc] = useState<SubTabFacNc>("TODOS");

  // Filtros
  const [search, setSearch] = useState("");
  const [tipoDocFilter, setTipoDocFilter] = useState<"TODOS" | "33" | "61">("TODOS");

  // Modales
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [selectedFacturaForState, setSelectedFacturaForState] = useState<FacturaCompra | null>(null);
  const [selectedFacturaForPago, setSelectedFacturaForPago] = useState<FacturaCompra | null>(null);

  // Recargar datos
  const handleRefresh = () => {
    startTransition(async () => {
      const response = await getFacturasComprasAction();
      setData(response.data);
      setKpis(response.kpis);
      setNeteos(response.neteos || []);
      setFacNcCount(response.facNcCount || 0);
    });
  };

  // 1. Facturas Cartera / Deuda Directa con Proveedor (criterio estricto: saldo_pendiente > 0, no COMPRA_TC y no CONTADO)
  const facturasCartera = useMemo(() => {
    return data.filter((f) => {
      const saldoPendiente = Number(
        f.monto_saldo !== undefined && f.monto_saldo !== null ? f.monto_saldo : f.monto_total
      );
      return (
        f.tipo_doc !== 61 &&
        saldoPendiente > 0 &&
        f.estado === "DEUDA_PROVEEDOR" &&
        (f.estado as string) !== "COMPRA_TC" &&
        f.condicion_pago !== "CONTADO"
      );
    });
  }, [data]);

  // 2. Facturas con Cheques (DTE 33/34 en estado CHEQUE o con abonos de cheques emitidos)
  const facturasCheques = useMemo(() => {
    return data.filter((f) => {
      const saldo = Number(
        f.monto_saldo !== undefined && f.monto_saldo !== null ? f.monto_saldo : f.monto_total
      );
      return (
        f.tipo_doc !== 61 &&
        f.estado !== "PAGADA" &&
        saldo > 0 &&
        (f.estado === "CHEQUE" ||
          (f.cheques && f.cheques.length > 0) ||
          (f.total_cheques_emitidos && f.total_cheques_emitidos > 0))
      );
    });
  }, [data]);

  // 3. Facturas en Factoring (DTE 33/34 en estado FACTORING)
  const facturasFactoring = useMemo(() => {
    return data.filter((f) => {
      const saldo = Number(
        f.monto_saldo !== undefined && f.monto_saldo !== null ? f.monto_saldo : f.monto_total
      );
      return f.tipo_doc !== 61 && f.estado === "FACTORING" && saldo > 0;
    });
  }, [data]);

  // 4. Facturas en Confirming (DTE 33/34 en estado CONFIRMING)
  const facturasConfirming = useMemo(() => {
    return data.filter((f) => {
      const saldo = Number(
        f.monto_saldo !== undefined && f.monto_saldo !== null ? f.monto_saldo : f.monto_total
      );
      return f.tipo_doc !== 61 && f.estado === "CONFIRMING" && saldo > 0;
    });
  }, [data]);

  // 5. Facturas y NCs pertenecientes a la Pestaña FAC / NC (DTE 61 o saldadas por neteo o con neteos)
  const facturasFacNc = useMemo(() => {
    return data.filter((f) => {
      if (f.tipo_doc === 61) return true; // Todas las Notas de Crédito
      if (f.estado === "NETEO_NC") return true; // Facturas saldadas por neteo
      if (f.neteos && f.neteos.length > 0) return true; // Facturas con neteos parciales
      return false;
    });
  }, [data]);

  // Lista base según la pestaña activa (para las 4 pestañas de facturas)
  const currentTabFacturas = useMemo(() => {
    switch (activeTab) {
      case "CARTERA":
        return facturasCartera;
      case "CHEQUES":
        return facturasCheques;
      case "FACTORING":
        return facturasFactoring;
      case "CONFIRMING":
        return facturasConfirming;
      default:
        return [];
    }
  }, [activeTab, facturasCartera, facturasCheques, facturasFactoring, facturasConfirming]);

  // Filtrado de la pestaña de facturas activa
  const filteredCurrentTab = useMemo(() => {
    const q = search.trim().toLowerCase();
    return currentTabFacturas.filter((f) => {
      if (q) {
        const matchFolio = f.folio.toString().includes(q);
        const matchRut = f.rut_proveedor.toLowerCase().includes(q);
        const matchRazon = f.razon_social.toLowerCase().includes(q);
        const matchColab =
          f.colaborador?.nombre.toLowerCase().includes(q) ||
          f.colaborador?.rut.toLowerCase().includes(q);
        if (!matchFolio && !matchRut && !matchRazon && !matchColab) return false;
      }
      if (tipoDocFilter !== "TODOS" && f.tipo_doc.toString() !== tipoDocFilter) return false;
      return true;
    });
  }, [currentTabFacturas, search, tipoDocFilter]);

  // Filtrado de FAC / NC según subpestaña y búsqueda
  const filteredFacNc = useMemo(() => {
    const q = search.trim().toLowerCase();
    return facturasFacNc.filter((f) => {
      if (q) {
        const matchFolio = f.folio.toString().includes(q);
        const matchRut = f.rut_proveedor.toLowerCase().includes(q);
        const matchRazon = f.razon_social.toLowerCase().includes(q);
        if (!matchFolio && !matchRut && !matchRazon) return false;
      }
      if (subTabFacNc === "SOLO_NC" && f.tipo_doc !== 61) return false;
      if (subTabFacNc === "SOLO_FAC" && f.tipo_doc === 61) return false;
      return true;
    });
  }, [facturasFacNc, search, subTabFacNc]);

  // Filtrado de Historial de Neteos
  const filteredNeteos = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return neteos;
    return neteos.filter((n) => {
      const matchFactura = n.factura_folio?.toString().includes(q);
      const matchNC = n.nota_credito_folio?.toString().includes(q);
      const matchRut = n.rut_proveedor?.toLowerCase().includes(q);
      const matchRazon = n.razon_social?.toLowerCase().includes(q);
      return matchFactura || matchNC || matchRut || matchRazon;
    });
  }, [neteos, search]);

  // Subtotal dinámico de la vista activa (reacciona en tiempo real a filtros y búsquedas)
  const subtotalInfo = useMemo(() => {
    if (activeTab === "FAC_NC") {
      if (subTabFacNc === "HISTORIAL_NETEOS") {
        const total = filteredNeteos.reduce((s, n) => s + Number(n.monto_neteado || 0), 0);
        const count = filteredNeteos.length;
        const providers = Array.from(
          new Set(filteredNeteos.map((n) => n.razon_social?.trim()).filter(Boolean))
        ) as string[];
        return { total, count, providers };
      }
      const total = filteredFacNc.reduce(
        (s, item) => s + (item.monto_saldo !== undefined ? item.monto_saldo : item.monto_total),
        0
      );
      const count = filteredFacNc.length;
      const providers = Array.from(
        new Set(filteredFacNc.map((item) => item.razon_social?.trim()).filter(Boolean))
      ) as string[];
      return { total, count, providers };
    }

    const total = filteredCurrentTab.reduce(
      (s, item) => s + (item.monto_saldo !== undefined ? item.monto_saldo : item.monto_total),
      0
    );
    const count = filteredCurrentTab.length;
    const providers = Array.from(
      new Set(filteredCurrentTab.map((item) => item.razon_social?.trim()).filter(Boolean))
    ) as string[];
    return { total, count, providers };
  }, [activeTab, subTabFacNc, filteredCurrentTab, filteredFacNc, filteredNeteos]);

  return (
    <div className="space-y-6">
      {/* 1. KPIs Superiores (Con navegación directa a pestañas) */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {/* KPI 1: Total Compras */}
        <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm hover:shadow-md transition-all">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Compras</span>
            <FileSpreadsheet className="h-4 w-4 text-[#E05A10]" />
          </div>
          <div className="text-xl font-bold text-slate-900 tracking-tight font-mono">
            {formatCLP(kpis.totalCompras)}
          </div>
          <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
            <span>{kpis.cantidadTotal} facturas DTE 33/34</span>
            <span className="font-mono text-slate-400">RCV SII</span>
          </div>
        </div>

        {/* KPI 2: Deuda Proveedor */}
        <div
          onClick={() => setActiveTab("CARTERA")}
          className={cn(
            "rounded-xl border border-blue-100 bg-blue-50/40 p-4 shadow-sm hover:shadow-md transition-all cursor-pointer",
            activeTab === "CARTERA" && "ring-2 ring-blue-500/80 bg-blue-50/80 shadow-md"
          )}
        >
          <div className="flex items-center justify-between text-blue-700 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider">Deuda Proveedor</span>
            <Building2 className="h-4 w-4 text-blue-600" />
          </div>
          <div className="text-xl font-bold text-blue-900 tracking-tight font-mono">
            {formatCLP(kpis.totalDeudaProveedor)}
          </div>
          <div className="text-[11px] text-blue-700/80 mt-1 flex items-center justify-between">
            <span>{kpis.cantidadDeudaProveedor} docs pendientes</span>
            <span className="font-medium underline decoration-blue-300">Ver Cartera</span>
          </div>
        </div>

        {/* KPI 3: Factoring Proveedores */}
        <div
          onClick={() => setActiveTab("FACTORING")}
          className={cn(
            "rounded-xl border border-purple-100 bg-purple-50/40 p-4 shadow-sm hover:shadow-md transition-all cursor-pointer",
            activeTab === "FACTORING" && "ring-2 ring-purple-500/80 bg-purple-50/80 shadow-md"
          )}
        >
          <div className="flex items-center justify-between text-purple-700 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider">En Factoring</span>
            <Layers className="h-4 w-4 text-purple-600" />
          </div>
          <div className="text-xl font-bold text-purple-900 tracking-tight font-mono">
            {formatCLP(kpis.totalFactoring)}
          </div>
          <div className="text-[11px] text-purple-700/80 mt-1 flex items-center justify-between">
            <span>{kpis.cantidadFactoring} docs cedidos</span>
            <span className="font-medium underline decoration-purple-300">Ver Factoring</span>
          </div>
        </div>

        {/* KPI 4: Confirming */}
        <div
          onClick={() => setActiveTab("CONFIRMING")}
          className={cn(
            "rounded-xl border border-emerald-100 bg-emerald-50/40 p-4 shadow-sm hover:shadow-md transition-all cursor-pointer",
            activeTab === "CONFIRMING" && "ring-2 ring-emerald-500/80 bg-emerald-50/80 shadow-md"
          )}
        >
          <div className="flex items-center justify-between text-emerald-700 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider">En Confirming</span>
            <CreditCard className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="text-xl font-bold text-emerald-900 tracking-tight font-mono">
            {formatCLP(kpis.totalConfirming)}
          </div>
          <div className="text-[11px] text-emerald-700/80 mt-1 flex items-center justify-between">
            <span>{kpis.cantidadConfirming} docs programados</span>
            <span className="font-medium underline decoration-emerald-300">Ver Confirming</span>
          </div>
        </div>

        {/* KPI 5: Cheques */}
        <div
          onClick={() => setActiveTab("CHEQUES")}
          className={cn(
            "rounded-xl border border-amber-100 bg-amber-50/40 p-4 shadow-sm hover:shadow-md transition-all cursor-pointer",
            activeTab === "CHEQUES" && "ring-2 ring-amber-500/80 bg-amber-50/80 shadow-md"
          )}
        >
          <div className="flex items-center justify-between text-amber-700 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider">Con Cheque</span>
            <Banknote className="h-4 w-4 text-amber-600" />
          </div>
          <div className="text-xl font-bold text-amber-900 tracking-tight font-mono">
            {formatCLP(kpis.totalCheque)}
          </div>
          <div className="text-[11px] text-amber-700/80 mt-1 flex items-center justify-between">
            <span>{kpis.cantidadCheque} cheques emitidos</span>
            <span className="font-medium underline decoration-amber-300">Ver Cheques</span>
          </div>
        </div>
      </div>

      {/* 2. Pestañas de Navegación del Módulo (5 Pestañas) */}
      <div className="flex items-center justify-between border-b border-slate-200 overflow-x-auto">
        <div className="flex items-center gap-1 sm:gap-2">
          {/* Pestaña 1: Facturas Pendientes / Cartera */}
          <button
            type="button"
            onClick={() => setActiveTab("CARTERA")}
            className={cn(
              "px-3.5 py-2.5 text-xs font-semibold border-b-2 transition-all flex items-center gap-1.5 -mb-px whitespace-nowrap",
              activeTab === "CARTERA"
                ? "border-[#E05A10] text-[#0F172A] bg-white rounded-t-lg shadow-xs"
                : "border-transparent text-slate-500 hover:text-slate-800"
            )}
          >
            <Building2 className={cn("h-4 w-4", activeTab === "CARTERA" ? "text-[#E05A10]" : "text-slate-400")} />
            <span>Facturas Pendientes / Cartera</span>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-mono border",
                activeTab === "CARTERA"
                  ? "bg-orange-50 text-[#E05A10] border-orange-200 font-bold"
                  : "bg-slate-100 text-slate-600 border-slate-200"
              )}
            >
              {facturasCartera.length}
            </span>
          </button>

          {/* Pestaña 2: Cheques */}
          <button
            type="button"
            onClick={() => setActiveTab("CHEQUES")}
            className={cn(
              "px-3.5 py-2.5 text-xs font-semibold border-b-2 transition-all flex items-center gap-1.5 -mb-px whitespace-nowrap",
              activeTab === "CHEQUES"
                ? "border-amber-600 text-[#0F172A] bg-white rounded-t-lg shadow-xs"
                : "border-transparent text-slate-500 hover:text-slate-800"
            )}
          >
            <Banknote className={cn("h-4 w-4", activeTab === "CHEQUES" ? "text-amber-600" : "text-slate-400")} />
            <span>Cheques</span>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-mono border",
                activeTab === "CHEQUES"
                  ? "bg-amber-50 text-amber-800 border-amber-200 font-bold"
                  : "bg-slate-100 text-slate-600 border-slate-200"
              )}
            >
              {facturasCheques.length}
            </span>
          </button>

          {/* Pestaña 3: Factoring */}
          <button
            type="button"
            onClick={() => setActiveTab("FACTORING")}
            className={cn(
              "px-3.5 py-2.5 text-xs font-semibold border-b-2 transition-all flex items-center gap-1.5 -mb-px whitespace-nowrap",
              activeTab === "FACTORING"
                ? "border-purple-600 text-[#0F172A] bg-white rounded-t-lg shadow-xs"
                : "border-transparent text-slate-500 hover:text-slate-800"
            )}
          >
            <Layers className={cn("h-4 w-4", activeTab === "FACTORING" ? "text-purple-600" : "text-slate-400")} />
            <span>Factoring</span>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-mono border",
                activeTab === "FACTORING"
                  ? "bg-purple-50 text-purple-700 border-purple-200 font-bold"
                  : "bg-slate-100 text-slate-600 border-slate-200"
              )}
            >
              {facturasFactoring.length}
            </span>
          </button>

          {/* Pestaña 4: Confirming */}
          <button
            type="button"
            onClick={() => setActiveTab("CONFIRMING")}
            className={cn(
              "px-3.5 py-2.5 text-xs font-semibold border-b-2 transition-all flex items-center gap-1.5 -mb-px whitespace-nowrap",
              activeTab === "CONFIRMING"
                ? "border-emerald-600 text-[#0F172A] bg-white rounded-t-lg shadow-xs"
                : "border-transparent text-slate-500 hover:text-slate-800"
            )}
          >
            <CreditCard className={cn("h-4 w-4", activeTab === "CONFIRMING" ? "text-emerald-600" : "text-slate-400")} />
            <span>Confirming</span>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-mono border",
                activeTab === "CONFIRMING"
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200 font-bold"
                  : "bg-slate-100 text-slate-600 border-slate-200"
              )}
            >
              {facturasConfirming.length}
            </span>
          </button>

          {/* Pestaña 5: FAC/NC (Al final) */}
          <button
            type="button"
            onClick={() => setActiveTab("FAC_NC")}
            className={cn(
              "px-3.5 py-2.5 text-xs font-semibold border-b-2 transition-all flex items-center gap-1.5 -mb-px whitespace-nowrap",
              activeTab === "FAC_NC"
                ? "border-rose-600 text-[#0F172A] bg-white rounded-t-lg shadow-xs"
                : "border-transparent text-slate-500 hover:text-slate-800"
            )}
          >
            <FileDiff className={cn("h-4 w-4", activeTab === "FAC_NC" ? "text-rose-600" : "text-slate-400")} />
            <span>FAC/NC</span>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-mono border",
                activeTab === "FAC_NC"
                  ? "bg-rose-50 text-rose-700 border-rose-200 font-bold"
                  : "bg-slate-100 text-slate-600 border-slate-200"
              )}
            >
              {facNcCount}
            </span>
          </button>
        </div>

        {/* Acciones del encabezado: Exclusivas para ADMINISTRADOR */}
        {(userSession?.esAdmin || userSession?.perfil?.toUpperCase() === "ADMINISTRADOR") && (
          <div className="flex items-center gap-2 pb-1 shrink-0 ml-2">
            <button
              onClick={() => setIsImportModalOpen(true)}
              className="flex items-center gap-1.5 rounded-lg bg-[#E05A10] px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-[#c94f0e] transition-all whitespace-nowrap"
              title="Importar archivo CSV del Registro de Compras SII"
            >
              <UploadCloud className="h-3.5 w-3.5" />
              <span>Importar CSV SII</span>
            </button>
          </div>
        )}
      </div>

      {/* 3. Barra de Herramientas y Filtros */}
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2.5">
          {/* Buscador */}
          <div className="relative min-w-[240px] flex-1">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por Folio, RUT o Proveedor..."
              className="w-full rounded-lg border border-slate-200 bg-slate-50/50 pl-8 pr-8 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:border-[#E05A10] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#E05A10] transition-colors"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                title="Limpiar búsqueda"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Subpestañas para FAC / NC */}
          {activeTab === "FAC_NC" && (
            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setSubTabFacNc("TODOS")}
                className={cn(
                  "px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors",
                  subTabFacNc === "TODOS"
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-500 hover:text-slate-900"
                )}
              >
                Todos
              </button>
              <button
                type="button"
                onClick={() => setSubTabFacNc("SOLO_NC")}
                className={cn(
                  "px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors",
                  subTabFacNc === "SOLO_NC"
                    ? "bg-rose-100 text-rose-800 shadow-xs"
                    : "text-slate-500 hover:text-slate-900"
                )}
              >
                Solo NC (61)
              </button>
              <button
                type="button"
                onClick={() => setSubTabFacNc("SOLO_FAC")}
                className={cn(
                  "px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors",
                  subTabFacNc === "SOLO_FAC"
                    ? "bg-emerald-100 text-emerald-800 shadow-xs"
                    : "text-slate-500 hover:text-slate-900"
                )}
              >
                Facturas Neteadas (33)
              </button>
              <button
                type="button"
                onClick={() => setSubTabFacNc("HISTORIAL_NETEOS")}
                className={cn(
                  "px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors flex items-center gap-1",
                  subTabFacNc === "HISTORIAL_NETEOS"
                    ? "bg-[#E05A10] text-white shadow-xs"
                    : "text-slate-500 hover:text-slate-900"
                )}
              >
                <History className="h-3 w-3" />
                Historial Neteos
              </button>
            </div>
          )}

          {/* Chip de Subtotal en Barra de Herramientas */}
          <div className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs">
            <span className="text-slate-500 font-medium">Subtotal {getTabName(activeTab)}:</span>
            <span className="font-bold text-slate-900 font-mono">{formatCLP(subtotalInfo.total)}</span>
            <span className="text-[11px] text-slate-400">({subtotalInfo.count})</span>
          </div>

          {/* Botón Refrescar */}
          <button
            onClick={handleRefresh}
            disabled={isPending}
            title="Recargar datos"
            className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            <RotateCcw className={`h-3.5 w-3.5 ${isPending ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* 3.1 Banner Prominente de Subtotal Dinámico por Filtro / Proveedor */}
      {search.trim() !== "" && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl border border-[#E05A10]/30 bg-gradient-to-r from-orange-50/90 via-amber-50/60 to-white shadow-xs animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-[#E05A10] flex items-center justify-center text-white shadow-xs shrink-0">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-orange-950 flex items-center gap-1.5 flex-wrap">
                <span>
                  {subtotalInfo.providers.length === 1
                    ? `Subtotal Proveedor [${subtotalInfo.providers[0]}]`
                    : `Subtotal Filtrado [${search.trim()}]`}
                </span>
                {subtotalInfo.providers.length === 1 && (
                  <span className="bg-orange-200/90 text-orange-950 text-[10px] px-2 py-0.5 rounded font-bold normal-case">
                    Proveedor Único
                  </span>
                )}
              </div>
              <div className="flex items-baseline gap-2.5 mt-0.5">
                <span className="text-2xl font-bold font-mono text-slate-900 tracking-tight">
                  {formatCLP(subtotalInfo.total)}
                </span>
                <span className="text-xs text-slate-600 font-medium">
                  ({subtotalInfo.count} {subtotalInfo.count === 1 ? "factura" : "facturas"} en {getTabName(activeTab)})
                </span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setSearch("")}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-orange-900 hover:text-white bg-white hover:bg-[#E05A10] border border-orange-300 hover:border-[#E05A10] rounded-lg transition-all shadow-xs self-start sm:self-center"
            title="Limpiar búsqueda y mostrar todo"
          >
            <X className="h-3.5 w-3.5" />
            <span>Limpiar Filtro</span>
          </button>
        </div>
      )}

      {/* 4. Contenido según Pestaña Activa */}

      {/* === VISTA: FACTURAS (CARTERA, CHEQUES, FACTORING, CONFIRMING) === */}
      {activeTab !== "FAC_NC" && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                  <th className="py-3 px-4">TIPO DTE</th>
                  <th className="py-3 px-4">FOLIO</th>
                  <th className="py-3 px-3 text-center">COND.</th>
                  <th className="py-3 px-4">PROVEEDOR / RAZÓN SOCIAL</th>
                  <th className="py-3 px-4">EMISIÓN / VENCIMIENTO</th>
                  <th className="py-3 px-3">MODALIDAD</th>
                  <th className="py-3 px-4 text-right">SALDO PENDIENTE</th>
                  <th className="py-3 px-4 text-center">ACCIONES</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCurrentTab.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400">
                      <FileText className="mx-auto h-8 w-8 text-slate-300 mb-2" />
                      <p className="font-medium text-slate-600">
                        {search.trim()
                          ? `No hay facturas que coincidan con "${search.trim()}" en ${getTabName(activeTab)}.`
                          : getEmptyMessage(activeTab).title}
                      </p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {search.trim()
                          ? "Intente con otro término de búsqueda o limpie el filtro."
                          : getEmptyMessage(activeTab).subtitle}
                      </p>
                    </td>
                  </tr>
                ) : (
                  filteredCurrentTab.map((factura) => {
                    const docInfo = getTipoDocLabel(factura.tipo_doc);
                    const saldo = factura.monto_saldo !== undefined ? factura.monto_saldo : factura.monto_total;
                    const totalNeteado = (factura.neteos || []).reduce((sum, n) => sum + Number(n.monto_neteado || 0), 0);
                    const totalCheques = (factura.cheques || []).reduce((sum, c) => sum + Number(c.monto_cheque || 0), 0);
                    const tieneAjusteParcial = saldo < factura.monto_total;

                    // Cálculos de vencimiento
                    const dueDateInfo = factura.fecha_vencimiento
                      ? calculateDueDateInfo(factura.fecha_docto, factura.fecha_vencimiento)
                      : null;

                    return (
                      <tr key={factura.id} className="hover:bg-slate-50/80 transition-colors group">
                        {/* 1. Tipo DTE */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                            {docInfo.shortName}
                          </span>
                        </td>

                        {/* 2. Folio */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span className="font-bold text-slate-900 group-hover:text-[#E05A10] transition-colors font-mono">
                            #{factura.folio}
                          </span>
                        </td>

                        {/* 2.1 COND. */}
                        <td className="py-3 px-3 whitespace-nowrap text-center">
                          {factura.condicion_pago === "CONTADO" ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                              CONTADO
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
                              CRÉDITO
                            </span>
                          )}
                        </td>

                        {/* 3. Proveedor */}
                        <td className="py-3 px-4">
                          <div className="font-medium text-slate-800 line-clamp-1" title={factura.razon_social}>
                            {factura.razon_social}
                          </div>
                          <div className="text-[11px] text-slate-500 font-mono">
                            {formatRutDisplay(factura.rut_proveedor)}
                          </div>
                        </td>

                        {/* 4. Emisión / Vencimiento */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <div>
                              <div className="text-slate-800 font-medium">
                                {formatDateCL(factura.fecha_docto)}
                              </div>
                              <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                                <span className="text-slate-400">Venc:</span>
                                <span className="font-semibold text-slate-700">
                                  {factura.fecha_vencimiento
                                    ? formatDateCL(factura.fecha_vencimiento)
                                    : "—"}
                                </span>
                              </div>
                            </div>

                            {dueDateInfo && (
                              <span
                                className={cn(
                                  "inline-flex items-center justify-center rounded-full px-2 py-0.5 text-[10px] font-bold shadow-xs",
                                  dueDateInfo.badgeColor === "emerald" &&
                                    "bg-emerald-100 text-emerald-800 border border-emerald-300",
                                  dueDateInfo.badgeColor === "amber" &&
                                    "bg-amber-100 text-amber-800 border border-amber-300",
                                  dueDateInfo.badgeColor === "rose" &&
                                    "bg-rose-100 text-rose-800 border border-rose-300 animate-pulse"
                                )}
                                title={
                                  dueDateInfo.diasRestantes > 0
                                    ? `Faltan ${dueDateInfo.diasRestantes} días`
                                    : dueDateInfo.diasRestantes === 0
                                    ? "Vence hoy"
                                    : `Vencida hace ${Math.abs(dueDateInfo.diasRestantes)} días`
                                }
                              >
                                {dueDateInfo.badgeLabel}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* 5. Modalidad (Compacta) */}
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {factura.estado === "DEUDA_PROVEEDOR" && (
                              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                                <span className="h-1.5 w-1.5 rounded-full bg-blue-500"></span>
                                Directo
                              </span>
                            )}

                            {factura.estado === "COMPRA_TC" && (() => {
                              const colabAsignado =
                                factura.colaborador ||
                                colaboradores.find((c) => c.id === factura.colaborador_id);
                              return (
                                <div
                                  className="flex flex-col items-start gap-0.5"
                                  title={[
                                    colabAsignado
                                      ? `Colaborador: ${colabAsignado.nombre} (${formatRutDisplay(colabAsignado.rut)})`
                                      : "Compra TC",
                                    factura.on_proyecto ? `Proyecto: ON ${factura.on_proyecto}` : null,
                                    factura.observacion_tc ? `Obs: ${factura.observacion_tc}` : null,
                                  ]
                                    .filter(Boolean)
                                    .join(" | ")}
                                >
                                  <div className="inline-flex items-center gap-1">
                                    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold bg-orange-50 text-orange-700 border border-orange-200">
                                      <CreditCard className="h-2.5 w-2.5 text-orange-600" />
                                      Compra TC
                                    </span>
                                    {factura.on_proyecto && (
                                      <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-bold bg-slate-100 text-slate-700 border border-slate-200 font-mono">
                                        ON {factura.on_proyecto}
                                      </span>
                                    )}
                                  </div>
                                  {colabAsignado && (
                                    <span className="text-[10px] text-slate-600 font-medium truncate max-w-[165px] pl-0.5">
                                      {colabAsignado.nombre}
                                    </span>
                                  )}
                                </div>
                              );
                            })()}

                            {factura.estado === "FACTORING" && (
                              <div className="inline-flex items-center gap-1">
                                <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold bg-purple-50 text-purple-700 border border-purple-200">
                                  <span className="h-1.5 w-1.5 rounded-full bg-purple-500"></span>
                                  Factoring
                                </span>
                                {factura.empresa_factoring_proveedor && (
                                  <span
                                    className="text-[10px] text-purple-700 font-medium truncate max-w-[105px]"
                                    title={factura.empresa_factoring_proveedor.razon_social}
                                  >
                                    {factura.empresa_factoring_proveedor.razon_social}
                                  </span>
                                )}
                              </div>
                            )}

                            {factura.estado === "CONFIRMING" && (
                              <div className="inline-flex items-center gap-1">
                                <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                                  Confirming
                                </span>
                                {factura.empresa_confirming && (
                                  <span
                                    className="text-[10px] text-emerald-700 font-medium truncate max-w-[105px]"
                                    title={factura.empresa_confirming.razon_social}
                                  >
                                    {factura.empresa_confirming.razon_social}
                                  </span>
                                )}
                              </div>
                            )}

                            {factura.estado === "CHEQUE" && (
                              <div className="inline-flex items-center gap-1">
                                <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500"></span>
                                  Cheque
                                </span>
                                {factura.cheques && factura.cheques.length > 1 ? (
                                  <span
                                    className="text-[10px] text-amber-700 font-medium"
                                    title={factura.cheques
                                      .map(
                                        (c) =>
                                          `#${c.numero_cheque}: ${formatCLP(c.monto_cheque)} (${c.banco_emisor} - ${c.fecha_vencimiento})`
                                      )
                                      .join("\n")}
                                  >
                                    ({factura.cheques.length} cuotas)
                                  </span>
                                ) : factura.numero_cheque ? (
                                  <span className="text-[10px] text-amber-700 font-mono">
                                    #{factura.numero_cheque}
                                  </span>
                                ) : null}
                              </div>
                            )}

                            {/* Abono Parcial por Cheque (si la factura aún tiene saldo en Deuda Directa u otro estado) */}
                            {factura.estado !== "CHEQUE" && totalCheques > 0 && (
                              <span
                                className="inline-flex items-center gap-0.5 rounded bg-amber-50 px-1.5 py-0.5 text-[9px] font-semibold text-amber-800 border border-amber-200"
                                title={`Abono en Cheque (${factura.cheques?.length || 1} emitido${(factura.cheques?.length || 1) > 1 ? "s" : ""}): -${formatCLP(totalCheques)}`}
                              >
                                <Banknote className="h-2.5 w-2.5 text-amber-600" />
                                -{formatCLP(totalCheques)}
                              </span>
                            )}

                            {/* Descuento por Neteo de Nota de Crédito */}
                            {totalNeteado > 0 && (
                              <span
                                className="inline-flex items-center gap-0.5 rounded bg-rose-50 px-1.5 py-0.5 text-[9px] font-semibold text-rose-700 border border-rose-200"
                                title={`Neteo NC: -${formatCLP(totalNeteado)}`}
                              >
                                <TrendingDown className="h-2.5 w-2.5 text-rose-600" />
                                -{formatCLP(totalNeteado)}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* 6. Saldo Pendiente */}
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="font-bold text-xs tracking-tight text-slate-900 font-mono">
                            {formatCLP(saldo)}
                          </div>
                          {(tieneAjusteParcial || factura.estado === "CHEQUE" || factura.estado === "COMPRA_TC") && (
                            <div className="text-[10px] text-slate-400 line-through font-mono">
                              {formatCLP(factura.monto_total)}
                            </div>
                          )}
                        </td>

                        {/* 7. Acciones */}
                        <td className="py-3 px-4 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => setSelectedFacturaForPago(factura)}
                              className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-semibold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors shadow-xs"
                              title="Registrar pago directo o abono parcial"
                            >
                              <Banknote className="h-3 w-3" />
                              <span>Pagar</span>
                            </button>
                            <button
                              onClick={() => setSelectedFacturaForState(factura)}
                              className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:text-white bg-slate-100 hover:bg-[#E05A10] border border-slate-300 hover:border-[#E05A10] transition-all shadow-xs"
                              title="Cambiar modalidad o estado"
                            >
                              <span>Modalidad</span>
                              <ChevronRight className="h-3 w-3" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Footer de la Pestaña Activa */}
          <div className="flex flex-col gap-2 border-t border-slate-200 bg-slate-50/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between text-xs text-slate-600">
            <div>
              Mostrando <span className="font-bold text-slate-800">{filteredCurrentTab.length}</span> de{" "}
              <span className="font-bold text-slate-800">{currentTabFacturas.length}</span> facturas en {getTabName(activeTab)}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-slate-500">Saldo Total de la Pestaña:</span>
              <span className="font-bold text-slate-900 text-sm font-mono">{formatCLP(subtotalInfo.total)}</span>
            </div>
          </div>
        </div>
      )}

      {/* === VISTA 2: PESTAÑA DEDICADA "FAC/NC" (Al final) === */}
      {activeTab === "FAC_NC" && (
        <div className="space-y-4">
          {/* Subvista: Documentos (NC 61 y Facturas Neteadas) */}
          {subTabFacNc !== "HISTORIAL_NETEOS" ? (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                      <th className="py-3 px-4">TIPO DTE</th>
                      <th className="py-3 px-4">FOLIO</th>
                      <th className="py-3 px-4">PROVEEDOR / RAZÓN SOCIAL</th>
                      <th className="py-3 px-4">EMISIÓN / VENCIMIENTO</th>
                      <th className="py-3 px-4">ESTADO / DETALLE NETEO</th>
                      <th className="py-3 px-4 text-right">MONTO DTE</th>
                      <th className="py-3 px-4 text-right">SALDO DISPONIBLE / DEUDOR</th>
                      <th className="py-3 px-4 text-center">ACCIONES</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredFacNc.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-12 text-center text-slate-400">
                          <FileText className="mx-auto h-8 w-8 text-slate-300 mb-2" />
                          <p className="font-medium text-slate-600">No hay documentos en esta subpestaña de FAC / NC.</p>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            Aquí se muestran las Notas de Crédito y Facturas con saldos neteados.
                          </p>
                        </td>
                      </tr>
                    ) : (
                      filteredFacNc.map((doc) => {
                        const docInfo = getTipoDocLabel(doc.tipo_doc);
                        const isNC = doc.tipo_doc === 61;
                        const saldoNC = doc.saldo_restante_nc !== undefined ? doc.saldo_restante_nc : doc.monto_total;
                        const saldoFactura = doc.monto_saldo !== undefined ? doc.monto_saldo : doc.monto_total;

                        return (
                          <tr key={doc.id} className="hover:bg-slate-50/80 transition-colors group">
                            {/* 1. Tipo DTE */}
                            <td className="py-3 px-4 whitespace-nowrap">
                              <span
                                className={cn(
                                  "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold border",
                                  isNC
                                    ? "bg-rose-50 text-rose-700 border-rose-200"
                                    : "bg-emerald-50 text-emerald-700 border-emerald-200"
                                )}
                              >
                                {docInfo.shortName}
                              </span>
                            </td>

                            {/* 2. Folio */}
                            <td className="py-3 px-4 whitespace-nowrap">
                              <span className="font-bold text-slate-900 font-mono">#{doc.folio}</span>
                            </td>

                            {/* 3. Proveedor */}
                            <td className="py-3 px-4">
                              <div className="font-medium text-slate-800 line-clamp-1" title={doc.razon_social}>
                                {doc.razon_social}
                              </div>
                              <div className="text-[11px] text-slate-500 font-mono">
                                {formatRutDisplay(doc.rut_proveedor)}
                              </div>
                            </td>

                            {/* 4. Emisión */}
                            <td className="py-3 px-4 whitespace-nowrap text-slate-600">
                              <div>{formatDateCL(doc.fecha_docto)}</div>
                              {doc.fecha_vencimiento && (
                                <div className="text-[11px] text-slate-400">
                                  Venc: {formatDateCL(doc.fecha_vencimiento)}
                                </div>
                              )}
                            </td>

                            {/* 5. Estado / Detalle Neteo */}
                            <td className="py-3 px-4">
                              {isNC ? (
                                <div className="space-y-0.5">
                                  <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold bg-rose-100 text-rose-800">
                                    Nota de Crédito
                                  </span>
                                  {saldoNC === 0 ? (
                                    <span className="text-[10px] text-slate-400 block">Totalmente aplicada</span>
                                  ) : saldoNC < doc.monto_total ? (
                                    <span className="text-[10px] text-amber-700 block font-medium">
                                      Saldo disponible: {formatCLP(saldoNC)}
                                    </span>
                                  ) : (
                                    <span className="text-[10px] text-emerald-700 block font-medium">Disponible 100%</span>
                                  )}
                                </div>
                              ) : (
                                <div className="space-y-0.5">
                                  <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold bg-emerald-100 text-emerald-800">
                                    {doc.estado === "NETEO_NC" ? "Neteo Total ($0)" : "Neteo Parcial"}
                                  </span>
                                  {doc.neteos && doc.neteos.length > 0 && (
                                    <div className="text-[10px] text-slate-500">
                                      Aplicada con {doc.neteos.length} NC:{" "}
                                      {doc.neteos.map((n) => `NC #${n.nota_credito_folio}`).join(", ")}
                                    </div>
                                  )}
                                </div>
                              )}
                            </td>

                            {/* 6. Monto DTE Original */}
                            <td className="py-3 px-4 text-right whitespace-nowrap font-mono font-medium text-slate-700">
                              {formatCLP(doc.monto_total)}
                            </td>

                            {/* 7. Saldo Disponible (NC) o Deudor Restante (Factura) */}
                            <td className="py-3 px-4 text-right whitespace-nowrap font-mono">
                              {isNC ? (
                                <div>
                                  <span className={cn("font-bold text-xs", saldoNC > 0 ? "text-rose-600" : "text-slate-400")}>
                                    {formatCLP(saldoNC)}
                                  </span>
                                  {saldoNC < doc.monto_total && (
                                    <div className="text-[10px] text-slate-400">
                                      Usado: {formatCLP(doc.monto_total - saldoNC)}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div>
                                  <span className={cn("font-bold text-xs", saldoFactura === 0 ? "text-emerald-600" : "text-amber-700")}>
                                    {formatCLP(saldoFactura)}
                                  </span>
                                  <div className="text-[10px] text-slate-400">
                                    Neteado: -{formatCLP(doc.monto_total - saldoFactura)}
                                  </div>
                                </div>
                              )}
                            </td>

                            {/* 8. Acciones */}
                            <td className="py-3 px-4 text-center whitespace-nowrap">
                              {!isNC && (
                                <div className="flex items-center justify-center gap-1.5">
                                  {saldoFactura > 0 && (
                                    <button
                                      onClick={() => setSelectedFacturaForPago(doc)}
                                      className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-semibold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors shadow-xs"
                                      title="Registrar pago directo o abono parcial"
                                    >
                                      <Banknote className="h-3 w-3" />
                                      <span>Pagar</span>
                                    </button>
                                  )}
                                  <button
                                    onClick={() => setSelectedFacturaForState(doc)}
                                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold text-slate-700 hover:text-white bg-slate-100 hover:bg-[#E05A10] border border-slate-300 hover:border-[#E05A10] transition-all shadow-xs"
                                  >
                                    <span>Gestionar</span>
                                    <ChevronRight className="h-3 w-3" />
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Footer FAC/NC */}
              <div className="flex flex-col gap-2 border-t border-slate-200 bg-slate-50/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between text-xs text-slate-600">
                <div>
                  Mostrando <span className="font-bold text-slate-800">{filteredFacNc.length}</span> documentos en FAC / NC
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-500">Monto Subtotal:</span>
                  <span className="font-bold text-slate-900 text-sm font-mono">{formatCLP(subtotalInfo.total)}</span>
                </div>
              </div>
            </div>
          ) : (
            /* Subvista: Historial de Neteos */
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                      <th className="py-3 px-4">FECHA OPERACIÓN</th>
                      <th className="py-3 px-4">FOLIO FACTURA (33)</th>
                      <th className="py-3 px-4">FOLIO NOTA CRÉDITO (61)</th>
                      <th className="py-3 px-4">PROVEEDOR</th>
                      <th className="py-3 px-4 text-right">MONTO NETEADO</th>
                      <th className="py-3 px-4 text-right">SALDO FACTURA RESTANTE</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredNeteos.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-12 text-center text-slate-400">
                          <History className="mx-auto h-8 w-8 text-slate-300 mb-2" />
                          <p className="font-medium text-slate-600">No se registran operaciones de neteo aún.</p>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            Al vincular una factura con una nota de crédito, la trazabilidad aparecerá en esta tabla.
                          </p>
                        </td>
                      </tr>
                    ) : (
                      filteredNeteos.map((neteo) => (
                        <tr key={neteo.id} className="hover:bg-slate-50 transition-colors">
                          <td className="py-3 px-4 whitespace-nowrap text-slate-600">
                            {formatDateCL(neteo.created_at)}
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap font-mono font-bold text-slate-900">
                            #{neteo.factura_folio || "—"}
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap font-mono font-bold text-rose-700">
                            NC #{neteo.nota_credito_folio || "—"}
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-medium text-slate-800 line-clamp-1">{neteo.razon_social || "—"}</div>
                            <div className="text-[11px] text-slate-500 font-mono">
                              {formatRutDisplay(neteo.rut_proveedor || "")}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right whitespace-nowrap font-mono font-bold text-rose-600">
                            -{formatCLP(neteo.monto_neteado)}
                          </td>
                          <td className="py-3 px-4 text-right whitespace-nowrap font-mono font-semibold">
                            <span className={neteo.saldo_restante === 0 ? "text-emerald-600" : "text-slate-800"}>
                              {formatCLP(neteo.saldo_restante)}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal de Importación CSV General SII */}
      <CsvImportComprasModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onImportSuccess={() => {
          handleRefresh();
        }}
      />

      {/* Modal de Gestión de Estado, Vencimiento y Neteo NC */}
      <CambiarEstadoCompraModal
        isOpen={Boolean(selectedFacturaForState)}
        onClose={() => setSelectedFacturaForState(null)}
        onSuccess={() => {
          handleRefresh();
        }}
        factura={selectedFacturaForState}
        factoringProveedores={factoringProveedores}
        empresasConfirming={empresasConfirming}
        colaboradores={colaboradores}
        catalogoOn={catalogoOn}
        todasLasFacturas={data}
      />

      {/* Modal para Registrar Pago Directo */}
      <RegistrarPagoCompraModal
        isOpen={Boolean(selectedFacturaForPago)}
        onClose={() => setSelectedFacturaForPago(null)}
        onSuccess={() => {
          handleRefresh();
        }}
        factura={selectedFacturaForPago}
      />
    </div>
  );
}
