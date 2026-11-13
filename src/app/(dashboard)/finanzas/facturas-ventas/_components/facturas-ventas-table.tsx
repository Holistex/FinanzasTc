"use client";

import React, { useState, useTransition } from "react";
import Link from "next/link";
import {
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  ArrowRightLeft,
  Landmark,
  Loader2,
  Banknote,
  CheckCircle2,
  Clock,
  FileDiff,
  Hash,
  AlertTriangle,
  FileText,
  Paperclip,
  Upload,
  ShieldAlert,
} from "lucide-react";
import {
  EmpresaFactoringCliente,
  EstadoDeudaTab,
  FacturasVentasFilterParams,
  FacturaVenta,
  MantenedorON,
  PaginatedFacturasResponse,
} from "@/types/database.types";
import { getFacturasVentasAction } from "@/actions/facturas-ventas.actions";
import {
  calculateDueDateInfo,
  cn,
  formatCLP,
  formatDateCL,
  formatRutDisplay,
  getTipoDocLabel,
} from "@/lib/utils";
import dynamic from "next/dynamic";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { QUERY_KEYS } from "@/lib/prefetch-helpers";
import { AssignOnModal } from "./assign-on-modal";

// Code-splitting y carga diferida (lazy loading) de modales pesados que usan PapaParse y formularios extensos
const CsvImportDropzoneModal = dynamic(
  () => import("./csv-import-dropzone-modal").then((m) => m.CsvImportDropzoneModal),
  { ssr: false }
);
const ImportarVencimientosModal = dynamic(
  () => import("./importar-vencimientos-modal").then((m) => m.ImportarVencimientosModal),
  { ssr: false }
);
const AssignFactoringModal = dynamic(
  () => import("./assign-factoring-modal").then((m) => m.AssignFactoringModal),
  { ssr: false }
);
const RegisterPaymentModal = dynamic(
  () => import("./register-payment-modal").then((m) => m.RegisterPaymentModal),
  { ssr: false }
);
const UploadRespaldoModal = dynamic(
  () => import("./upload-respaldo-modal").then((m) => m.UploadRespaldoModal),
  { ssr: false }
);

interface FacturasVentasTableProps {
  initialResponse: PaginatedFacturasResponse;
  factoringClientes: EmpresaFactoringCliente[];
  catalogoOn?: MantenedorON[];
  isAdmin?: boolean;
  canManage?: boolean;
}

export function FacturasVentasTable({
  initialResponse,
  factoringClientes,
  catalogoOn = [],
  isAdmin = true,
  canManage = false,
}: FacturasVentasTableProps) {
  const queryClient = useQueryClient();

  // Caché dinámico de TanStack Query para render instantáneo (<1ms) y revalidación en segundo plano
  const { data: cachedResponse } = useQuery({
    queryKey: QUERY_KEYS.facturasVentas(1, 15),
    queryFn: () => getFacturasVentasAction({ page: 1, pageSize: 15 }),
    initialData: initialResponse,
    staleTime: 5 * 60 * 1000,
  });

  const [response, setResponse] = useState<PaginatedFacturasResponse>(
    cachedResponse ?? initialResponse
  );
  const [isPending, startTransition] = useTransition();

  // Pestaña activa: 1. PENDIENTES (Deuda > 0) | 2. PAGADAS (Deuda == $0)
  const [estadoDeudaTab, setEstadoDeudaTab] =
    useState<EstadoDeudaTab>("PENDIENTES");

  // Filter states
  const [rut, setRut] = useState("");
  const [folio, setFolio] = useState("");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [gestionPago, setGestionPago] =
    useState<FacturasVentasFilterParams["gestionPago"]>("TODOS");
  const [tipoDoc, setTipoDoc] =
    useState<FacturasVentasFilterParams["tipoDoc"]>("TODOS");
  const [pageSize, setPageSize] = useState<number>(15);
  const [selectedOnFilter, setSelectedOnFilter] = useState<string>("TODAS");

  // Lista única y ordenada de ONs asociadas exclusivamente a facturas con deuda pendiente
  const onDisponiblesConDeuda = React.useMemo(() => {
    if (response.onsConDeuda && response.onsConDeuda.length > 0) {
      return response.onsConDeuda;
    }
    const set = new Set<string>();
    response.data?.forEach((f) => {
      const deuda = Math.max(0, Number(f.deuda_cliente ?? f.monto_neto_saldo ?? 0));
      if (deuda > 0 && f.on_proyecto && f.on_proyecto.trim() !== "") {
        set.add(f.on_proyecto.trim());
      }
    });
    return Array.from(set).sort();
  }, [response.onsConDeuda, response.data]);

  // Modales: 1) Cesión Factoring | 2) Registro de Pago | 3) Asignar ON | 4) Carga Respaldo PDF
  const [facturaToAssignFactoring, setFacturaToAssignFactoring] =
    useState<FacturaVenta | null>(null);
  const [facturaToPay, setFacturaToPay] = useState<FacturaVenta | null>(null);
  const [facturaToAssignOn, setFacturaToAssignOn] = useState<FacturaVenta | null>(null);
  const [facturaToUploadPdf, setFacturaToUploadPdf] = useState<FacturaVenta | null>(null);

  const handleOnAssigned = (facturaId: string, assignedOn: string) => {
    setResponse((prev) => ({
      ...prev,
      data: prev.data.map((f) =>
        f.id === facturaId ? { ...f, on_proyecto: assignedOn } : f
      ),
    }));
    queryClient.invalidateQueries({ queryKey: ["facturas_ventas"] });
  };

  const handleRespaldoPdfSuccess = (facturaId: string, urlPdf: string) => {
    setResponse((prev) => ({
      ...prev,
      data: prev.data.map((f) =>
        f.id === facturaId ? { ...f, url_pdf: urlPdf } : f
      ),
    }));
    queryClient.invalidateQueries({ queryKey: ["facturas_ventas"] });
  };

  const fetchServerPage = (
    overrideParams?: Partial<FacturasVentasFilterParams>
  ) => {
    const queryParams: FacturasVentasFilterParams = {
      page: overrideParams?.page ?? response.page,
      pageSize: overrideParams?.pageSize ?? pageSize,
      rut: overrideParams?.rut !== undefined ? overrideParams.rut : rut,
      folio: overrideParams?.folio !== undefined ? overrideParams.folio : folio,
      onFilter:
        overrideParams?.onFilter !== undefined
          ? overrideParams.onFilter
          : selectedOnFilter,
      fechaDesde:
        overrideParams?.fechaDesde !== undefined
          ? overrideParams.fechaDesde
          : fechaDesde,
      fechaHasta:
        overrideParams?.fechaHasta !== undefined
          ? overrideParams.fechaHasta
          : fechaHasta,
      gestionPago:
        overrideParams?.gestionPago !== undefined
          ? overrideParams.gestionPago
          : gestionPago,
      tipoDoc:
        overrideParams?.tipoDoc !== undefined
          ? overrideParams.tipoDoc
          : tipoDoc,
      estadoDeuda:
        overrideParams?.estadoDeuda !== undefined
          ? overrideParams.estadoDeuda
          : estadoDeudaTab,
    };

    startTransition(async () => {
      const updatedLibro = await getFacturasVentasAction(queryParams);
      setResponse(updatedLibro);
    });
  };

  const handleSwitchTab = (tab: EstadoDeudaTab) => {
    setEstadoDeudaTab(tab);
    setTipoDoc("TODOS");
    fetchServerPage({ page: 1, estadoDeuda: tab, tipoDoc: "TODOS" });
  };

  const handleApplyFilters = (e: React.FormEvent) => {
    e.preventDefault();
    fetchServerPage({ page: 1 });
  };

  const handleResetFilters = () => {
    setRut("");
    setFolio("");
    setSelectedOnFilter("TODAS");
    setFechaDesde("");
    setFechaHasta("");
    setGestionPago("TODOS");
    setTipoDoc("TODOS");
    fetchServerPage({
      page: 1,
      rut: "",
      folio: "",
      onFilter: "TODAS",
      fechaDesde: "",
      fechaHasta: "",
      gestionPago: "TODOS",
      tipoDoc: "TODOS",
    });
  };

  // Filtrado reactivo en memoria sobre response.data
  const facturasFiltradas = React.useMemo(() => {
    return response.data.filter((item) => {
      if (rut.trim()) {
        const q = rut.toLowerCase().trim();
        const matchRut = item.rut_cliente?.toLowerCase().includes(q);
        const matchRazon = item.razon_social?.toLowerCase().includes(q);
        if (!matchRut && !matchRazon) return false;
      }
      if (folio.trim()) {
        const f = folio.trim();
        const matchFolioPropio = String(item.folio).includes(f);
        const matchFolioRef =
          item.folio_docto_ref !== null &&
          item.folio_docto_ref !== undefined &&
          String(item.folio_docto_ref).includes(f);
        const matchNcAsociada =
          item.nc_referenciada_folio !== null &&
          item.nc_referenciada_folio !== undefined &&
          String(item.nc_referenciada_folio).includes(f);
        if (!matchFolioPropio && !matchFolioRef && !matchNcAsociada) {
          return false;
        }
      }
      if (selectedOnFilter && selectedOnFilter !== "TODAS") {
        if (selectedOnFilter === "SIN_ON") {
          if (item.on_proyecto && item.on_proyecto.trim() !== "") return false;
        } else {
          if (item.on_proyecto !== selectedOnFilter) return false;
        }
      }
      if (fechaDesde && item.fecha_docto < fechaDesde) return false;
      if (fechaHasta && item.fecha_docto > fechaHasta) return false;
      if (gestionPago && gestionPago !== "TODOS" && item.gestion_pago !== gestionPago) return false;
      if (tipoDoc && tipoDoc !== "TODOS" && Number(item.tipo_doc) !== Number(tipoDoc)) return false;
      return true;
    });
  }, [response.data, rut, folio, selectedOnFilter, fechaDesde, fechaHasta, gestionPago, tipoDoc]);

  // Texto descriptivo del filtro activo
  const filtroTexto = React.useMemo(() => {
    const parts: string[] = [];
    if (rut.trim()) parts.push(rut.trim());
    if (folio.trim()) parts.push(`Folio #${folio.trim()}`);
    if (selectedOnFilter && selectedOnFilter !== "TODAS") {
      parts.push(selectedOnFilter === "SIN_ON" ? "Sin ON" : `ON ${selectedOnFilter}`);
    }
    if (fechaDesde && fechaHasta) parts.push(`${formatDateCL(fechaDesde)} a ${formatDateCL(fechaHasta)}`);
    else if (fechaDesde) parts.push(`Desde ${formatDateCL(fechaDesde)}`);
    else if (fechaHasta) parts.push(`Hasta ${formatDateCL(fechaHasta)}`);
    if (gestionPago && gestionPago !== "TODOS") parts.push(gestionPago === "FACTORING" ? "Factoring" : "Directo");
    if (tipoDoc && tipoDoc !== "TODOS") parts.push(`DTE ${tipoDoc}`);
    return parts.join(" · ");
  }, [rut, folio, selectedOnFilter, fechaDesde, fechaHasta, gestionPago, tipoDoc]);

  // Subtotales dinámicos reactivos sobre facturasFiltradas
  const subtotalMontoTotal = React.useMemo(() => {
    return facturasFiltradas.reduce(
      (acc, curr) => acc + (Number(curr.monto_total) || 0),
      0
    );
  }, [facturasFiltradas]);

  const subtotalDeudaCliente = React.useMemo(() => {
    return facturasFiltradas.reduce((acc, curr) => {
      const deuda = Math.max(
        0,
        Number(
          curr.deuda_cliente !== null && curr.deuda_cliente !== undefined
            ? curr.deuda_cliente
            : curr.monto_neto_saldo ?? 0
        )
      );
      return acc + deuda;
    }, 0);
  }, [facturasFiltradas]);

  return (
    <div className="space-y-3">
      {/* Compact Header & Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-base font-bold tracking-tight text-[#0F172A]">
            VENTAS TENSACON
          </h1>
          <span className="text-xs font-semibold text-slate-500">
            · Facturas de Ventas (SII)
          </span>
          <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded bg-orange-50 text-[#E05A10] border border-orange-200">
            {response.totalCount} DTEs en vista
          </span>
        </div>

        <div className="flex items-center gap-2">
          {isAdmin && (
            <>
              <ImportarVencimientosModal
                onSuccess={() => fetchServerPage({ page: 1 })}
                isAdmin={isAdmin}
              />
              <CsvImportDropzoneModal
                onImportSuccess={() => fetchServerPage({ page: 1 })}
                isAdmin={isAdmin}
              />
            </>
          )}
        </div>
      </div>

      {/* Compact KPI Strip with Tensacon Accent Lines */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
        <div className="bg-white border border-slate-200 border-l-4 border-l-slate-700 rounded-md px-3 py-2 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Total Facturado (33)
            </div>
            <div className="text-sm font-bold font-mono tabular-nums text-[#0F172A] mt-0.5">
              {formatCLP(response.kpis.totalFacturadoBruto)}
            </div>
          </div>
          <div className="text-right">
            <span className="inline-block text-[10px] font-mono px-1.5 py-0.5 rounded bg-rose-50 text-rose-800 border border-rose-200">
              NC: -{formatCLP(response.kpis.totalNotasCredito)}
            </span>
          </div>
        </div>

        <div className="bg-[#0F172A] text-white border border-[#1E293B] border-l-4 border-l-[#E05A10] rounded-md px-3 py-2 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Deuda Total Pendiente
            </div>
            <div className="text-sm font-bold font-mono tabular-nums text-white mt-0.5">
              {formatCLP(response.kpis.totalSaldoNeto)}
            </div>
          </div>
          <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-[#E05A10]/20 text-orange-300 border border-[#E05A10]/40">
            Por Cobrar
          </span>
        </div>

        <Link
          href="/finanzas/facturas-ventas/factoring-clientes"
          title="Ir al submódulo Factoring Clientes"
          className="bg-white hover:bg-orange-50/30 border border-slate-200 border-l-4 border-l-[#E05A10] rounded-md px-3 py-2 shadow-sm flex items-center justify-between transition-colors"
        >
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Cedido Factoring
            </div>
            <div className="text-sm font-bold font-mono tabular-nums text-[#E05A10] mt-0.5">
              {formatCLP(response.kpis.montoEnFactoring)}
            </div>
          </div>
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-orange-50 text-[#E05A10] border border-orange-200">
            Ver Detalle →
          </span>
        </Link>

        <div className="bg-white border border-slate-200 border-l-4 border-l-slate-400 rounded-md px-3 py-2 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Directo Cliente
            </div>
            <div className="text-sm font-bold font-mono tabular-nums text-[#0F172A] mt-0.5">
              {formatCLP(response.kpis.montoDirectoCliente)}
            </div>
          </div>
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-[#F1F5F9] text-slate-700 border border-slate-200">
            Cartera Propia
          </span>
        </div>
      </div>

      {/* =====================================================================
          PESTAÑAS DE ESTADO DE COBRANZA Y AJUSTES COMERCIALES:
          Pestaña 1: Facturas Pendientes / Deuda (deuda_cliente > 0)
          Pestaña 2: Facturas Pagadas (deuda_cliente == $0 con registros reales en pagos_facturas)
          Pestaña 3: FAC / NC (DTE 61 + Facturas DTE 33 saldadas a $0 por Nota de Crédito sin flujo de caja)
      ===================================================================== */}
      <div className="border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Pestaña 1: Facturas Pendientes / Deuda */}
          <button
            type="button"
            onClick={() => handleSwitchTab("PENDIENTES")}
            className={cn(
              "px-3.5 py-2 text-xs font-semibold border-b-2 transition-all flex items-center gap-2 -mb-px",
              estadoDeudaTab === "PENDIENTES"
                ? "border-[#E05A10] text-[#0F172A] bg-white rounded-t-md shadow-sm"
                : "border-transparent text-slate-500 hover:text-[#0F172A]"
            )}
          >
            <Clock
              className={cn(
                "h-3.5 w-3.5",
                estadoDeudaTab === "PENDIENTES"
                  ? "text-[#E05A10]"
                  : "text-slate-400"
              )}
            />
            Facturas Pendientes / Deuda
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-mono border",
                estadoDeudaTab === "PENDIENTES"
                  ? "bg-orange-50 text-[#E05A10] border-orange-200"
                  : "bg-[#F1F5F9] text-slate-600 border-slate-200"
              )}
            >
              {response.pendientesCount}
            </span>
          </button>

          {/* Pestaña 2: Facturas Pagadas (Ingreso Real de Tesorería) */}
          <button
            type="button"
            onClick={() => handleSwitchTab("PAGADAS")}
            className={cn(
              "px-3.5 py-2 text-xs font-semibold border-b-2 transition-all flex items-center gap-2 -mb-px",
              estadoDeudaTab === "PAGADAS"
                ? "border-[#E05A10] text-[#0F172A] bg-white rounded-t-md shadow-sm"
                : "border-transparent text-slate-500 hover:text-[#0F172A]"
            )}
          >
            <CheckCircle2
              className={cn(
                "h-3.5 w-3.5",
                estadoDeudaTab === "PAGADAS"
                  ? "text-emerald-600"
                  : "text-slate-400"
              )}
            />
            Facturas Pagadas
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-mono border",
                estadoDeudaTab === "PAGADAS"
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : "bg-[#F1F5F9] text-slate-600 border-slate-200"
              )}
            >
              {response.pagadasCount}
            </span>
          </button>

          {/* Pestaña 3: FAC / NC (Neteos y Ajustes Comerciales sin flujo financiero) */}
          <button
            type="button"
            onClick={() => handleSwitchTab("FAC_NC")}
            className={cn(
              "px-3.5 py-2 text-xs font-semibold border-b-2 transition-all flex items-center gap-2 -mb-px",
              estadoDeudaTab === "FAC_NC"
                ? "border-[#E05A10] text-[#0F172A] bg-white rounded-t-md shadow-sm"
                : "border-transparent text-slate-500 hover:text-[#0F172A]"
            )}
          >
            <FileDiff
              className={cn(
                "h-3.5 w-3.5",
                estadoDeudaTab === "FAC_NC"
                  ? "text-rose-600"
                  : "text-slate-400"
              )}
            />
            FAC / NC
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-mono border",
                estadoDeudaTab === "FAC_NC"
                  ? "bg-rose-50 text-rose-700 border-rose-200"
                  : "bg-[#F1F5F9] text-slate-600 border-slate-200"
              )}
            >
              {response.facNcCount ?? 0}
            </span>
          </button>
        </div>

        {isPending && (
          <span className="inline-flex items-center gap-1 text-xs text-[#E05A10] font-medium pr-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Sincronizando...
          </span>
        )}
      </div>

      {/* Compact Single-Row Filter Bar */}
      <form
        onSubmit={handleApplyFilters}
        className="bg-white border border-slate-200 rounded-md px-3 py-2 shadow-sm flex flex-wrap items-center gap-2"
      >
        <div className="relative flex-1 min-w-[180px]">
          <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={rut}
            onChange={(e) => setRut(e.target.value)}
            placeholder="RUT o Razón Social..."
            className="w-full rounded border border-slate-300 bg-[#F8FAFC] pl-7 pr-2 py-1 text-xs text-[#0F172A] placeholder:text-slate-400 focus:bg-white focus:border-[#E05A10] focus:outline-none"
          />
        </div>

        <input
          type="text"
          value={folio}
          onChange={(e) => setFolio(e.target.value)}
          placeholder="Folio #"
          className="w-24 rounded border border-slate-300 bg-[#F8FAFC] px-2 py-1 text-xs font-mono text-[#0F172A] placeholder:text-slate-400 focus:bg-white focus:border-[#E05A10] focus:outline-none"
        />

        {/* Selector de Filtro por ON Dinámico (Exclusivamente Facturas con Deuda Pendiente) */}
        <select
          value={selectedOnFilter}
          onChange={(e) => {
            const val = e.target.value;
            setSelectedOnFilter(val);
            fetchServerPage({ page: 1, onFilter: val });
          }}
          title="Filtrar por Proyecto (ON)"
          className="rounded border border-slate-300 bg-[#F8FAFC] px-2 py-1 text-xs font-semibold text-slate-700 focus:bg-white focus:border-[#E05A10] focus:outline-none"
        >
          <option value="TODAS">ON: Todas</option>
          <option value="SIN_ON">⚠️ Sin ON</option>
          {onDisponiblesConDeuda.map((codigo) => {
            const matchCatalog = catalogoOn?.find((c) => c.codigo_on === codigo);
            const label = matchCatalog ? `ON ${codigo} - ${matchCatalog.nombre_proyecto}` : `ON ${codigo}`;
            return (
              <option key={codigo} value={codigo}>
                {label.length > 32 ? `${label.substring(0, 32)}...` : label}
              </option>
            );
          })}
        </select>

        <div className="flex items-center gap-1">
          <input
            type="date"
            value={fechaDesde}
            onChange={(e) => setFechaDesde(e.target.value)}
            title="Fecha Emisión Desde"
            className="w-[118px] rounded border border-slate-300 bg-[#F8FAFC] px-1.5 py-1 text-xs font-mono text-slate-700 focus:bg-white focus:border-[#E05A10] focus:outline-none"
          />
          <span className="text-slate-400 text-xs">–</span>
          <input
            type="date"
            value={fechaHasta}
            onChange={(e) => setFechaHasta(e.target.value)}
            title="Fecha Emisión Hasta"
            className="w-[118px] rounded border border-slate-300 bg-[#F8FAFC] px-1.5 py-1 text-xs font-mono text-slate-700 focus:bg-white focus:border-[#E05A10] focus:outline-none"
          />
        </div>

        {estadoDeudaTab === "FAC_NC" && (
          <div className="inline-flex rounded border border-slate-300 bg-[#F1F5F9] p-0.5">
            {(
              [
                { value: "TODOS", label: "Todos" },
                { value: "33", label: "FAC 33" },
                { value: "61", label: "NC 61" },
              ] as const
            ).map((pill) => (
              <button
                key={pill.value}
                type="button"
                onClick={() => {
                  setTipoDoc(pill.value);
                  fetchServerPage({ page: 1, tipoDoc: pill.value });
                }}
                className={cn(
                  "px-2 py-0.5 rounded-[3px] text-[11px] font-semibold transition-colors",
                  tipoDoc === pill.value
                    ? "bg-[#E05A10] text-white shadow-sm"
                    : "text-slate-600 hover:text-[#0F172A]"
                )}
              >
                {pill.label}
              </button>
            ))}
          </div>
        )}

        <select
          value={gestionPago}
          onChange={(e) => {
            const nextVal = e.target
              .value as FacturasVentasFilterParams["gestionPago"];
            setGestionPago(nextVal);
            fetchServerPage({ page: 1, gestionPago: nextVal });
          }}
          className="rounded border border-slate-300 bg-[#F8FAFC] px-2 py-1 text-xs text-slate-700 focus:bg-white focus:border-[#E05A10] focus:outline-none"
        >
          <option value="TODOS">Pago: Todos</option>
          <option value="DIRECTO_CLIENTE">Directo Cliente</option>
          <option value="FACTORING">Factoring</option>
        </select>

        <div className="flex items-center gap-1 ml-auto">
          <button
            type="button"
            onClick={handleResetFilters}
            title="Limpiar filtros"
            className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-600 hover:bg-[#F1F5F9]"
          >
            <RotateCcw className="h-3 w-3" />
          </button>
          <button
            type="submit"
            className="inline-flex items-center gap-1 rounded bg-[#E05A10] px-2.5 py-1 text-xs font-semibold text-white hover:bg-[#C2410C] transition-colors"
          >
            <Filter className="h-3 w-3" />
            Filtrar
          </button>
        </div>
      </form>

      {/* Subtotal Dinámico por Filtros Aplicados */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/90 border border-slate-800 rounded-lg px-4 py-2.5 my-3 text-xs shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-semibold text-slate-300 uppercase tracking-wider">
            Subtotal Vista Filtrada:
          </span>
          <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 font-mono">
            {facturasFiltradas.length} {facturasFiltradas.length === 1 ? "documento" : "documentos"}
          </span>
          {filtroTexto && (
            <span className="text-slate-400">
              Filtro: <strong className="text-white">"{filtroTexto}"</strong>
            </span>
          )}
        </div>

        <div className="flex items-center gap-6 font-mono text-sm">
          <div className="flex items-center gap-2">
            <span className="text-slate-400 text-xs uppercase font-sans">Monto Total:</span>
            <span className="font-bold text-white">
              $ {subtotalMontoTotal.toLocaleString("es-CL")}
            </span>
          </div>

          <div className="flex items-center gap-2 pl-4 border-l border-slate-700">
            <span className="text-amber-400 text-xs uppercase font-sans font-medium">Deuda Pendiente:</span>
            <span className="font-bold text-amber-300">
              $ {subtotalDeudaCliente.toLocaleString("es-CL")}
            </span>
          </div>
        </div>
      </div>

      {/* High-Density Financial Table (Scroll horizontal en móvil, ancho completo en escritorio) */}
      <div className="bg-white border border-slate-200 rounded-md shadow-sm overflow-hidden">
        <div className="w-full overflow-x-auto">
          <table className="min-w-[850px] lg:min-w-full table-auto text-left border-collapse">
          <thead>
            <tr className="bg-[#0F172A] text-slate-200 text-[10px] font-semibold uppercase tracking-wider border-b border-[#1E293B]">
              <th className="py-2 px-3 w-[135px]">Folio / Documento</th>
              <th className="py-2 px-3 w-[110px]">RUT Cliente</th>
              <th className="py-2 px-3">Razón Social</th>
              <th className="py-2 px-3 w-[165px]">Emisión / Vencimiento</th>
              <th className="py-2 px-3 text-right w-[130px]">Monto Total</th>
              <th className="py-2 px-3 text-right w-[140px]">Deuda Cliente</th>
              <th className="py-2 px-3 text-center w-[100px]">ON</th>
              <th className="py-2 px-3 text-center w-16">PDF</th>
              <th className="py-2 px-3 text-right w-[115px]">Cesión</th>
              <th className="py-2 px-3 text-right w-[85px]">Pagar</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200/80 text-xs">
            {facturasFiltradas.length === 0 ? (
              <tr>
                <td
                  colSpan={10}
                  className="py-8 text-center text-slate-500 text-xs"
                >
                  {estadoDeudaTab === "PAGADAS"
                    ? "No hay facturas pagadas con ingreso real en tesorería (pagos_facturas) bajo los filtros actuales."
                    : estadoDeudaTab === "FAC_NC"
                    ? "No se encontraron Notas de Crédito ni facturas saldadas por neteo comercial."
                    : "No se encontraron facturas con deuda pendiente."}
                </td>
              </tr>
            ) : (
              facturasFiltradas.map((row) => {
                const docBadge = getTipoDocLabel(row.tipo_doc);
                const isNotaCredito = Number(row.tipo_doc) === 61;
                const deudaActual = Math.max(
                  0,
                  Number(
                    row.deuda_cliente !== null &&
                      row.deuda_cliente !== undefined
                      ? row.deuda_cliente
                      : row.monto_neto_saldo
                  )
                );
                const hasPagosReales = Boolean(
                  row.pagos_facturas && row.pagos_facturas.length > 0
                );
                const isNeteadaTotalPorNC =
                  !isNotaCredito && deudaActual === 0 && !hasPagosReales;
                const hasNettingOrPaymentReduction =
                  !isNotaCredito && deudaActual < row.monto_total;
                const tieneOnValida = Boolean(
                  row.on_proyecto && row.on_proyecto.trim() !== ""
                );
                const tienePdfValido = Boolean(
                  row.url_pdf && row.url_pdf.trim() !== ""
                );
                const puedeGestionar = tieneOnValida && tienePdfValido;

                const getBloqueoTooltip = (accion: "ceder" | "pagar") => {
                  if (puedeGestionar) return "";
                  if (!tieneOnValida && !tienePdfValido) {
                    return "Documento bloqueado: Debe ingresar la ON correspondiente y cargar el respaldo PDF/Imagen antes de operar o ceder esta factura.";
                  }
                  if (!tieneOnValida) {
                    return "Documento bloqueado: Debe ingresar la ON correspondiente antes de operar o ceder esta factura.";
                  }
                  return "Documento bloqueado: Debe cargar el respaldo PDF/Imagen antes de operar o ceder esta factura.";
                };

                const isFactoring = row.gestion_pago === "FACTORING";
                const dueInfo = calculateDueDateInfo(
                  row.fecha_docto,
                  row.fecha_vencimiento
                );
                const ultimoPago = row.pagos_facturas?.[0] || null;

                return (
                  <tr
                    key={row.id}
                    className={cn(
                      "transition-colors hover:bg-[#F1F5F9]/70",
                      isNotaCredito && "bg-rose-50/30",
                      isNeteadaTotalPorNC && "bg-slate-50/70"
                    )}
                  >
                    {/* 1. COLUMNA COMBINADA: FOLIO / DOCUMENTO */}
                    <td className="py-2 px-3 whitespace-nowrap">
                      <div className="font-mono font-bold text-[#0F172A] leading-tight">
                        #{row.folio}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1">
                        <span
                          className={cn(
                            "inline-flex items-center px-1.5 py-0 rounded text-[10px] font-semibold leading-4 border",
                            docBadge.variant === "emerald"
                              ? "bg-[#F8FAFC] text-[#0F172A] border-emerald-500/60"
                              : "bg-rose-50 text-rose-800 border-rose-200"
                          )}
                          title={docBadge.fullName}
                        >
                          {docBadge.shortName}
                        </span>
                        {row.folio_docto_ref && (
                          <span
                            className="text-[10px] font-mono text-rose-700 font-semibold"
                            title={`Anula / rebaja Factura Folio #${row.folio_docto_ref}`}
                          >
                            →#{row.folio_docto_ref}
                          </span>
                        )}
                        {!isNotaCredito && row.nc_referenciada_folio && (
                          <span
                            className="text-[10px] font-mono text-rose-700 font-semibold"
                            title={`Neteada con Nota de Crédito Folio #${row.nc_referenciada_folio}`}
                          >
                            ←NC #{row.nc_referenciada_folio}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* 2. RUT CLIENTE */}
                    <td className="py-2 px-3 whitespace-nowrap font-mono text-slate-700">
                      {formatRutDisplay(row.rut_cliente)}
                    </td>

                    {/* 3. RAZÓN SOCIAL (Truncado elegante + Tooltip nativo) */}
                    <td className="py-2 px-3">
                      <div
                        className="font-medium text-[#0F172A] truncate max-w-[180px] sm:max-w-[220px] lg:max-w-[270px]"
                        title={row.razon_social}
                      >
                        {row.razon_social}
                      </div>
                    </td>

                    {/* 4. EMISIÓN / VENCIMIENTO (+30 DÍAS) + BADGE SEMÁFORO DE DÍAS FALTANTES */}
                    <td className="py-2 px-3 whitespace-nowrap">
                      {isNotaCredito ? (
                        <div className="flex items-center justify-between gap-2">
                          <div className="leading-tight">
                            <div className="font-mono text-[#0F172A] font-medium">
                              {dueInfo.fechaEmisionCL}
                            </div>
                            {row.folio_docto_ref && (
                              <div className="text-[10px] font-mono text-rose-700 mt-0.5">
                                Ref FAC #{row.folio_docto_ref}
                              </div>
                            )}
                          </div>
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                            DTE 61
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between gap-2">
                          <div className="leading-tight">
                            <div className="font-mono text-[#0F172A] font-medium">
                              {dueInfo.fechaEmisionCL}
                            </div>
                            <div className="text-[10px] font-mono text-slate-500 mt-0.5">
                              Venc: {dueInfo.fechaVencimientoCL}
                            </div>
                          </div>

                          {/* Contador de días restantes o indicador Pagada vs Neteada NC */}
                          {deudaActual === 0 ? (
                            hasPagosReales ? (
                              <span
                                className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200"
                                title={
                                  ultimoPago
                                    ? `Pagada en tesorería el ${formatDateCL(
                                        ultimoPago.fecha_pago
                                      )}`
                                    : "Pagada con ingreso real"
                                }
                              >
                                Pagada
                              </span>
                            ) : (
                              <span
                                className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-rose-50 text-rose-700 border border-rose-200"
                                title={
                                  row.nc_referenciada_folio
                                    ? `Saldada por Nota de Crédito #${row.nc_referenciada_folio} (sin flujo de caja)`
                                    : "Saldada por Nota de Crédito (sin flujo de caja)"
                                }
                              >
                                Neteo NC
                              </span>
                            )
                          ) : (
                            <span
                              className={cn(
                                "inline-flex items-center justify-center px-1.5 py-0.5 rounded text-[10px] font-mono font-bold border min-w-[38px] text-center",
                                dueInfo.badgeColor === "emerald" &&
                                  "bg-emerald-50 text-emerald-700 border-emerald-200",
                                dueInfo.badgeColor === "amber" &&
                                  "bg-amber-50 text-amber-800 border-amber-300",
                                dueInfo.badgeColor === "rose" &&
                                  "bg-rose-50 text-rose-700 border-rose-200"
                              )}
                              title={
                                dueInfo.diasRestantes > 0
                                  ? `Faltan ${dueInfo.diasRestantes} días para el vencimiento (${dueInfo.fechaVencimientoCL})`
                                  : dueInfo.diasRestantes === 0
                                  ? `Vence hoy (${dueInfo.fechaVencimientoCL})`
                                  : `Vencida hace ${Math.abs(
                                      dueInfo.diasRestantes
                                    )} días (${dueInfo.fechaVencimientoCL})`
                              }
                            >
                              {dueInfo.badgeLabel}
                            </span>
                          )}
                        </div>
                      )}
                    </td>

                    {/* 5. MONTO TOTAL */}
                    <td className="py-2 px-3 whitespace-nowrap text-right font-mono tabular-nums">
                      <span
                        className={cn(
                          isNotaCredito
                            ? "text-rose-700 font-semibold"
                            : "text-slate-700"
                        )}
                      >
                        {isNotaCredito
                          ? `-${formatCLP(row.monto_total)}`
                          : formatCLP(row.monto_total)}
                      </span>
                    </td>

                    {/* 6. DEUDA CLIENTE */}
                    <td className="py-2 px-3 whitespace-nowrap text-right font-mono tabular-nums">
                      {isNotaCredito ? (
                        <span className="text-[10px] font-sans text-rose-800 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200">
                          Deducción NC
                        </span>
                      ) : (
                        <div>
                          <div
                            className={cn(
                              "font-bold leading-tight",
                              deudaActual === 0
                                ? hasPagosReales
                                  ? "text-emerald-700"
                                  : "text-slate-600"
                                : hasNettingOrPaymentReduction
                                ? "text-[#E05A10]"
                                : "text-[#0F172A]"
                            )}
                          >
                            {formatCLP(deudaActual)}
                          </div>
                          {hasNettingOrPaymentReduction && (
                            <div
                              className="text-[10px] font-sans text-slate-500 leading-tight mt-0.5"
                              title={`Rebajada/Abonada en ${formatCLP(
                                row.monto_total - deudaActual
                              )}`}
                            >
                              {deudaActual === 0
                                ? hasPagosReales && ultimoPago
                                  ? `Pagada ${formatDateCL(
                                      ultimoPago.fecha_pago
                                    )}`
                                  : row.nc_referenciada_folio
                                  ? `Anulada por NC #${row.nc_referenciada_folio}`
                                  : "Saldada por NC"
                                : `Abono/NC -${formatCLP(
                                    row.monto_total - deudaActual
                                  )}`}
                            </div>
                          )}
                        </div>
                      )}
                    </td>

                    {/* 7. COLUMNA: ON (ORDEN NÚMERO / PROYECTO - BICOLOR SIN # CON FONDO BLANCO) */}
                    <td className="py-2 px-3 whitespace-nowrap text-center">
                      {isNotaCredito ? (
                        <span className="text-[10px] text-slate-300 font-mono">
                          —
                        </span>
                      ) : tieneOnValida ? (
                        canManage ? (
                          <button
                            type="button"
                            onClick={() => setFacturaToAssignOn(row)}
                            title={`ON ${row.on_proyecto} asignada · Clic para modificar`}
                            className="inline-flex items-center justify-center bg-white border border-emerald-500 text-emerald-600 hover:bg-emerald-50 font-mono font-semibold text-xs px-2.5 py-1 rounded-md transition-colors shadow-sm cursor-pointer"
                          >
                            ON {row.on_proyecto}
                          </button>
                        ) : (
                          <span className="inline-flex items-center justify-center bg-white border border-emerald-500 text-emerald-600 font-mono font-semibold text-xs px-2.5 py-1 rounded-md">
                            ON {row.on_proyecto}
                          </span>
                        )
                      ) : canManage ? (
                        <button
                          type="button"
                          onClick={() => setFacturaToAssignOn(row)}
                          title="Documento sin ON · Clic para asignar y habilitar operaciones"
                          className="inline-flex items-center justify-center bg-white border border-red-400 text-red-500 hover:text-red-600 hover:bg-red-50 font-medium text-xs px-2.5 py-1 rounded-md transition-colors shadow-sm cursor-pointer"
                        >
                          Asignar ON
                        </button>
                      ) : (
                        <span className="inline-flex items-center justify-center bg-slate-50 border border-slate-200 text-slate-400 font-medium text-xs px-2.5 py-1 rounded-md">
                          Sin ON
                        </span>
                      )}
                    </td>

                    {/* 8. COLUMNA: PDF (REEMPLAZA A RESPALDO - ÍCONO BICOLOR ROJO/VERDE CON FONDO BLANCO) */}
                    <td className="py-2 px-2 whitespace-nowrap text-center w-16">
                      {isNotaCredito ? (
                        <span className="text-[10px] text-slate-300 font-mono">
                          —
                        </span>
                      ) : tienePdfValido ? (
                        <a
                          href={row.url_pdf!}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Respaldo disponible: Ver PDF"
                          className="inline-flex items-center justify-center p-1.5 rounded-lg bg-white border border-emerald-400 hover:border-emerald-500 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 transition-colors shadow-sm cursor-pointer"
                        >
                          <FileText className="h-4 w-4" />
                        </a>
                      ) : canManage ? (
                        <button
                          type="button"
                          onClick={() => setFacturaToUploadPdf(row)}
                          title="Pendiente: Subir PDF de la factura"
                          className="inline-flex items-center justify-center p-1.5 rounded-lg bg-white border border-red-300 hover:border-red-400 text-red-500 hover:text-red-600 hover:bg-red-50 transition-colors shadow-sm cursor-pointer"
                        >
                          <FileText className="h-4 w-4" />
                        </button>
                      ) : (
                        <span
                          title="Sin PDF adjunto"
                          className="inline-flex items-center justify-center p-1.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-300"
                        >
                          <FileText className="h-4 w-4" />
                        </span>
                      )}
                    </td>

                    {/* 9. CESIÓN FACTORING */}
                    <td className="py-2 px-3 whitespace-nowrap text-right">
                      {isNotaCredito || isNeteadaTotalPorNC ? (
                        <span className="text-[10px] text-slate-300 font-mono">
                          —
                        </span>
                      ) : (
                        <div className="inline-flex items-center justify-end gap-1.5">
                          {isFactoring && (
                            <span
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-orange-50 text-[#E05A10] border border-orange-200 max-w-[85px] truncate"
                              title={
                                row.empresa_factoring_cliente
                                  ? `Cedida a: ${
                                      row.empresa_factoring_cliente.razon_social
                                    } (RUT ${formatRutDisplay(
                                      row.empresa_factoring_cliente.rut_cliente
                                    )})`
                                  : "Cedida a Factoring"
                              }
                            >
                              <Landmark className="h-2.5 w-2.5 shrink-0 text-[#E05A10]" />
                              <span className="truncate">
                                {row.empresa_factoring_cliente?.razon_social.split(
                                  " "
                                )[0] || "Factoring"}
                              </span>
                            </span>
                          )}

                          {canManage && (
                            <button
                              type="button"
                              disabled={!puedeGestionar}
                              onClick={() => {
                                if (puedeGestionar) setFacturaToAssignFactoring(row);
                              }}
                              title={
                                !puedeGestionar
                                  ? getBloqueoTooltip("ceder")
                                  : isFactoring
                                  ? `Factoring activo (${
                                      row.empresa_factoring_cliente
                                        ?.razon_social || "Asignado"
                                    }) · Clic para modificar cesión`
                                  : "Cobro Directo Cliente · Clic para ceder factura a Factoring"
                              }
                              className={cn(
                                "inline-flex items-center justify-center h-7 w-7 rounded-md border transition-all",
                                !puedeGestionar
                                  ? "border-slate-200 bg-slate-100 text-slate-300 cursor-not-allowed opacity-50"
                                  : isFactoring
                                  ? "border-orange-300 bg-orange-50 text-[#E05A10] hover:bg-[#E05A10] hover:text-white"
                                  : "border-slate-200 bg-[#F8FAFC] text-slate-600 hover:bg-[#E05A10] hover:text-white hover:border-[#E05A10]"
                              )}
                            >
                              <ArrowRightLeft className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {!canManage && !isFactoring && (
                            <span className="text-[10px] text-slate-400">
                              Directo
                            </span>
                          )}
                        </div>
                      )}
                    </td>

                    {/* 10. COLUMNA: PAGAR / ABONAR */}
                    <td className="py-2 px-3 whitespace-nowrap text-right">
                      {isNotaCredito || isNeteadaTotalPorNC ? (
                        <span className="text-[10px] text-slate-300 font-mono">
                          —
                        </span>
                      ) : deudaActual > 0 ? (
                        canManage ? (
                          <button
                            type="button"
                            disabled={!puedeGestionar}
                            onClick={() => {
                              if (puedeGestionar) setFacturaToPay(row);
                            }}
                            title={
                              !puedeGestionar
                                ? getBloqueoTooltip("pagar")
                                : `Registrar Pago o Abono para Factura #${row.folio}`
                            }
                            className={cn(
                              "inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors shadow-sm",
                              !puedeGestionar
                                ? "bg-slate-200 text-slate-400 cursor-not-allowed opacity-60"
                                : "bg-[#E05A10] text-white hover:bg-[#C2410C]"
                            )}
                          >
                            <Banknote className="h-3.5 w-3.5" />
                            Pagar
                          </button>
                        ) : (
                          <span className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-400">
                            Pendiente
                          </span>
                        )
                      ) : (
                        <button
                          type="button"
                          onClick={() => setFacturaToPay(row)}
                          title="Ver comprobante / historial de pago"
                          className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100 transition-colors"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Ver
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
          </table>
        </div>

        {/* Compact Server-Side Pagination Footer */}
        <div className="px-3 py-2 bg-[#F8FAFC] border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
          <div className="flex items-center gap-2">
            <span>
              Página <strong className="text-[#0F172A]">{response.page}</strong>{" "}
              de{" "}
              <strong className="text-[#0F172A]">{response.totalPages}</strong>{" "}
              ·{" "}
              <span className="font-mono">{response.totalCount} registros</span>
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            <div className="flex items-center gap-1">
              <span className="text-[11px] text-slate-500">Filas:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  const nextSize = Number(e.target.value);
                  setPageSize(nextSize);
                  fetchServerPage({ page: 1, pageSize: nextSize });
                }}
                className="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-xs font-mono"
              >
                <option value={10}>10</option>
                <option value={15}>15</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={response.page <= 1 || isPending}
                onClick={() => fetchServerPage({ page: response.page - 1 })}
                className="inline-flex items-center gap-0.5 rounded border border-slate-300 bg-white px-2 py-0.5 text-xs font-medium text-slate-700 hover:bg-[#F1F5F9] disabled:opacity-40"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Ant.
              </button>
              <button
                type="button"
                disabled={response.page >= response.totalPages || isPending}
                onClick={() => fetchServerPage({ page: response.page + 1 })}
                className="inline-flex items-center gap-0.5 rounded border border-slate-300 bg-white px-2 py-0.5 text-xs font-medium text-slate-700 hover:bg-[#F1F5F9] disabled:opacity-40"
              >
                Sig.
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Modal de Cesión de Factura / Selección de Factoring */}
      <AssignFactoringModal
        factura={facturaToAssignFactoring}
        factoringClientes={factoringClientes}
        onClose={() => setFacturaToAssignFactoring(null)}
        onSuccess={() => fetchServerPage()}
      />

      {/* Modal de Registro de Pago / Abono */}
      <RegisterPaymentModal
        factura={facturaToPay}
        onClose={() => setFacturaToPay(null)}
        onSuccess={() => fetchServerPage()}
      />

      {/* Modal de Asignación de ON */}
      {facturaToAssignOn && (
        <AssignOnModal
          factura={facturaToAssignOn}
          catalogoOn={catalogoOn}
          onClose={() => setFacturaToAssignOn(null)}
          onSuccess={handleOnAssigned}
        />
      )}

      {/* Modal de Carga de Respaldo PDF */}
      {facturaToUploadPdf && (
        <UploadRespaldoModal
          factura={facturaToUploadPdf}
          onClose={() => setFacturaToUploadPdf(null)}
          onSuccess={handleRespaldoPdfSuccess}
        />
      )}
    </div>
  );
}
