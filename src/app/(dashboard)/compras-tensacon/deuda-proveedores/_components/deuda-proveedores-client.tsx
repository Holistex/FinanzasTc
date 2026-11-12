"use client";

import React, { useState, useMemo } from "react";
import {
  TrendingDown,
  Calendar,
  Building2,
  Clock,
  Search,
  Filter,
  RefreshCw,
  X,
  Receipt,
  ArrowUpRight,
  CheckCircle2,
  AlertTriangle,
  Layers,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import {
  DeudaMensualItem,
  EstratoDeudaItem,
  DeudaProveedoresResponse,
  getDeudaProveedoresMensualAction,
} from "@/actions/deuda-proveedores.actions";
import { FacturaCompra } from "@/types/database.types";
import { formatCLP, formatDateCL, formatRutDisplay } from "@/lib/utils";
import { QUERY_KEYS } from "@/lib/prefetch-helpers";
import { DeudaProveedoresChart } from "./deuda-proveedores-chart";
import { DeudaProveedoresAgingTable } from "./deuda-proveedores-aging-table";

interface DeudaProveedoresClientProps {
  initialData: DeudaProveedoresResponse;
}

interface ModalDetalleState {
  titulo: string;
  subtitulo?: string;
  badgeText?: string;
  badgeIcon?: string;
  badgeStyle?: string;
  totalDeuda: number;
  facturas: FacturaCompra[];
}

export function DeudaProveedoresClient({ initialData }: DeudaProveedoresClientProps) {
  // Caché de TanStack Query para render instantáneo
  const { data: queryData, isFetching, refetch } = useQuery({
    queryKey: QUERY_KEYS.deudaProveedores,
    queryFn: () => getDeudaProveedoresMensualAction(),
    initialData,
    staleTime: 5 * 60 * 1000,
  });

  const datosMensuales = queryData?.datosMensuales ?? initialData.datosMensuales;
  const estratificacion = queryData?.estratificacion ?? initialData.estratificacion;
  const kpis = queryData?.kpis ?? initialData.kpis;

  // Estados de filtrado e interacción
  const [selectedMonth, setSelectedMonth] = useState<string>("TODOS");
  const [searchTerm, setSearchTerm] = useState("");
  const [modalData, setModalData] = useState<ModalDetalleState | null>(null);
  const [modalSearch, setModalSearch] = useState("");

  // Opciones de meses para el filtro
  const opcionesMeses = useMemo(() => {
    return datosMensuales.map((d) => ({
      clave: d.mesClave,
      nombre: d.mesNombre,
    }));
  }, [datosMensuales]);

  // Filtrado de meses visibles en la tabla principal
  const mesesFiltrados = useMemo(() => {
    return datosMensuales.filter((item) => {
      // Filtro de mes
      if (selectedMonth !== "TODOS" && item.mesClave !== selectedMonth) {
        return false;
      }

      // Filtro de texto
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const coincideMes = item.mesNombre.toLowerCase().includes(term);
        const coincideProveedor = item.facturas.some(
          (f) =>
            f.rut_proveedor.toLowerCase().includes(term) ||
            f.razon_social.toLowerCase().includes(term) ||
            String(f.folio).includes(term)
        );
        return coincideMes || coincideProveedor;
      }

      return true;
    });
  }, [datosMensuales, selectedMonth, searchTerm]);

  // Facturas del modal filtradas por el buscador interno
  const facturasModalFiltradas = useMemo(() => {
    if (!modalData) return [];
    if (!modalSearch.trim()) return modalData.facturas;

    const term = modalSearch.toLowerCase();
    return modalData.facturas.filter(
      (f) =>
        f.rut_proveedor.toLowerCase().includes(term) ||
        f.razon_social.toLowerCase().includes(term) ||
        String(f.folio).includes(term)
    );
  }, [modalData, modalSearch]);

  const handleSelectMonthFromChart = (mesClave: string) => {
    if (selectedMonth === mesClave) {
      setSelectedMonth("TODOS");
    } else {
      setSelectedMonth(mesClave);
    }
  };

  const handleResetFilters = () => {
    setSelectedMonth("TODOS");
    setSearchTerm("");
  };

  // Abrir modal desde un mes específico
  const handleVerFacturasMes = (mes: DeudaMensualItem) => {
    setModalData({
      titulo: `Facturas con Vencimiento en ${mes.mesNombre}`,
      subtitulo: `${mes.mesClave} · Consolidado mensual`,
      badgeText: mes.esVencido ? "Vencido" : "En Plazo",
      badgeIcon: mes.esVencido ? "🔴" : "🟢",
      badgeStyle: mes.esVencido
        ? "bg-rose-100 text-rose-700 border-rose-200"
        : "bg-emerald-100 text-emerald-700 border-emerald-200",
      totalDeuda: mes.totalDeuda,
      facturas: mes.facturas,
    });
    setModalSearch("");
  };

  // Abrir modal desde un tramo de la tabla de estratificación
  const handleVerDetalleEstrato = (estrato: EstratoDeudaItem) => {
    setModalData({
      titulo: `Estrato de Deuda: ${estrato.tramo}`,
      subtitulo: `${estrato.rangoMora} · Segmentación por tramo de vencimiento`,
      badgeText: estrato.badgeText,
      badgeIcon: estrato.badgeIcon,
      badgeStyle:
        estrato.color === "emerald"
          ? "bg-emerald-100 text-emerald-700 border-emerald-200"
          : estrato.color === "amber"
          ? "bg-amber-100 text-amber-700 border-amber-200"
          : estrato.color === "orange"
          ? "bg-orange-100 text-orange-700 border-orange-200"
          : estrato.color === "rose"
          ? "bg-rose-100 text-rose-700 border-rose-200"
          : "bg-purple-100 text-purple-700 border-purple-200",
      totalDeuda: estrato.total,
      facturas: estrato.facturas,
    });
    setModalSearch("");
  };

  return (
    <div className="space-y-5">
      {/* 1. KPI CARDS SUPERIORES */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* KPI 1: Total Deuda Proveedores */}
        <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-sm hover:shadow transition-shadow border-l-4 border-l-red-600">
          <div className="flex items-center justify-between text-slate-500 text-xs">
            <span className="font-semibold uppercase tracking-wider text-slate-600 text-[10px]">
              Total Deuda Proveedores
            </span>
            <div className="h-7 w-7 rounded-lg bg-red-50 flex items-center justify-center text-red-600">
              <TrendingDown className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-1.5">
            <span className="text-xl sm:text-2xl font-black font-mono tracking-tight text-red-600">
              {formatCLP(kpis.totalDeudaProveedores)}
            </span>
          </div>
          <p className="text-[10px] text-slate-500 mt-0.5 flex items-center gap-1">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-600" />
            Cartera total pendiente exigible
          </p>
        </div>

        {/* KPI 2: Mes Mayor Vencimiento */}
        <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-sm hover:shadow transition-shadow border-l-4 border-l-amber-500">
          <div className="flex items-center justify-between text-slate-500 text-xs">
            <span className="font-semibold uppercase tracking-wider text-slate-600 text-[10px]">
              Mes Mayor Vencimiento
            </span>
            <div className="h-7 w-7 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600">
              <Calendar className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-1.5">
            <div className="text-base font-bold text-slate-900 truncate">
              {kpis.mesMayorDeuda?.mesNombre || "N/A"}
            </div>
            <div className="text-xs font-semibold text-amber-700 font-mono">
              {kpis.mesMayorDeuda ? formatCLP(kpis.mesMayorDeuda.monto) : "$0"}
            </div>
          </div>
          <p className="text-[10px] text-slate-500 mt-0.5">
            Mes con mayor concentración de pagos
          </p>
        </div>

        {/* KPI 3: Deuda Vencida vs Por Vencer */}
        <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-sm hover:shadow transition-shadow border-l-4 border-l-rose-500">
          <div className="flex items-center justify-between text-slate-500 text-xs">
            <span className="font-semibold uppercase tracking-wider text-slate-600 text-[10px]">
              Estado de Vencimientos
            </span>
            <div className="h-7 w-7 rounded-lg bg-rose-50 flex items-center justify-center text-rose-600">
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-1.5 space-y-0.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-rose-600 font-medium">Vencida:</span>
              <span className="font-bold text-rose-700 font-mono">
                {formatCLP(kpis.deudaVencida)}
              </span>
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-emerald-600 font-medium">Por Vencer:</span>
              <span className="font-bold text-emerald-700 font-mono">
                {formatCLP(kpis.deudaPorVencer)}
              </span>
            </div>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-1 mt-1.5 overflow-hidden flex">
            <div
              className="bg-rose-500 h-1"
              style={{
                width: `${
                  kpis.totalDeudaProveedores > 0
                    ? (kpis.deudaVencida / kpis.totalDeudaProveedores) * 100
                    : 0
                }%`,
              }}
            />
            <div
              className="bg-emerald-500 h-1"
              style={{
                width: `${
                  kpis.totalDeudaProveedores > 0
                    ? (kpis.deudaPorVencer / kpis.totalDeudaProveedores) * 100
                    : 100
                }%`,
              }}
            />
          </div>
        </div>

        {/* KPI 4: Documentos y Proveedores */}
        <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-sm hover:shadow transition-shadow border-l-4 border-l-slate-700">
          <div className="flex items-center justify-between text-slate-500 text-xs">
            <span className="font-semibold uppercase tracking-wider text-slate-600 text-[10px]">
              Documentos & Proveedores
            </span>
            <div className="h-7 w-7 rounded-lg bg-slate-100 flex items-center justify-center text-slate-700">
              <Building2 className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className="text-xl sm:text-2xl font-black text-slate-900 font-mono">
              {kpis.totalFacturas}
            </span>
            <span className="text-[10px] text-slate-500">facturas</span>
            <span className="text-slate-300">|</span>
            <span className="text-base font-bold text-slate-800 font-mono">
              {kpis.totalProveedores}
            </span>
            <span className="text-[10px] text-slate-500">provs</span>
          </div>
          <p className="text-[10px] text-slate-500 mt-0.5">
            Promedio:{" "}
            <span className="font-semibold text-slate-700 font-mono">
              {formatCLP(kpis.promedioPorFactura)}
            </span>{" "}
            / doc
          </p>
        </div>
      </div>

      {/* 2. GRÁFICO COMPACTO DE LÍNEAS SUAVIZADAS ROJO (h-[230px] / h-[250px]) */}
      <DeudaProveedoresChart
        data={datosMensuales}
        totalDeudaGlobal={kpis.totalDeudaProveedores}
        selectedMonth={selectedMonth !== "TODOS" ? selectedMonth : null}
        onSelectMonth={handleSelectMonthFromChart}
      />

      {/* 3. TABLA DE ESTRATIFICACIÓN DE LA DEUDA PROVEEDORES (AGING SCHEDULE) */}
      <DeudaProveedoresAgingTable
        estratificacion={estratificacion}
        totalDeudaGlobal={kpis.totalDeudaProveedores}
        onVerDetalleEstrato={handleVerDetalleEstrato}
      />

      {/* 4. BARRA DE HERRAMIENTAS Y FILTROS */}
      <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-sm space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Selector de Mes */}
          <div className="flex flex-wrap items-center gap-1.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 mr-1">
              <Filter className="h-3.5 w-3.5 text-slate-500" />
              <span>Mes:</span>
            </div>

            <button
              type="button"
              onClick={() => setSelectedMonth("TODOS")}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                selectedMonth === "TODOS"
                  ? "bg-slate-900 text-white shadow-sm"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              Todos ({datosMensuales.length})
            </button>

            {opcionesMeses.map((op) => {
              const isSelected = selectedMonth === op.clave;
              return (
                <button
                  key={op.clave}
                  type="button"
                  onClick={() => setSelectedMonth(op.clave)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                    isSelected
                      ? "bg-red-600 text-white shadow-sm ring-2 ring-red-200"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  {op.nombre}
                </button>
              );
            })}
          </div>

          {/* Buscador de Proveedor / Folio */}
          <div className="flex items-center gap-2">
            <div className="relative w-full sm:w-60">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar RUT, Proveedor o Folio..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all placeholder:text-slate-400"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            {(selectedMonth !== "TODOS" || searchTerm) && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap"
              >
                Limpiar
              </button>
            )}

            <button
              type="button"
              onClick={() => refetch()}
              disabled={isFetching}
              title="Recargar datos"
              className="p-1.5 text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>
      </div>

      {/* 5. TABLA CONSOLIDADA POR MESES DE VENCIMIENTO */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-3.5 border-b border-slate-200 bg-slate-50/60 flex items-center justify-between">
          <div>
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-tight">
              Desglose de Deuda por Mes de Vencimiento
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Consolidación de compromisos y facturas exigibles ordenadas cronológicamente
            </p>
          </div>
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-slate-200/70 text-slate-700 font-mono">
            {mesesFiltrados.length} {mesesFiltrados.length === 1 ? "mes" : "meses"}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-100/90 text-slate-600 font-semibold border-b border-slate-200 uppercase text-[10px] tracking-wider">
              <tr>
                <th className="py-2.5 px-4">Mes de Vencimiento</th>
                <th className="py-2.5 px-4 text-center">Estado de Plazo</th>
                <th className="py-2.5 px-4 text-right">Deuda Proveedores</th>
                <th className="py-2.5 px-4 text-center">% del Total</th>
                <th className="py-2.5 px-4 text-center">Facturas</th>
                <th className="py-2.5 px-4 text-center">Proveedores</th>
                <th className="py-2.5 px-4 text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/80">
              {mesesFiltrados.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-slate-400">
                    No se encontraron vencimientos para los filtros aplicados.
                  </td>
                </tr>
              ) : (
                mesesFiltrados.map((item) => (
                  <tr
                    key={item.mesClave}
                    className={`hover:bg-red-50/40 transition-colors ${
                      selectedMonth === item.mesClave ? "bg-red-50/60" : ""
                    }`}
                  >
                    <td className="py-2.5 px-4 font-bold text-slate-900 flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-red-600" />
                      <span>{item.mesNombre}</span>
                      <span className="text-[10px] font-mono text-slate-400 font-normal">
                        ({item.mesClave})
                      </span>
                    </td>

                    <td className="py-2.5 px-4 text-center">
                      {item.esVencido ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-100 text-rose-700">
                          <AlertTriangle className="h-2.5 w-2.5" />
                          Vencido
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-700">
                          <CheckCircle2 className="h-2.5 w-2.5" />
                          En Plazo
                        </span>
                      )}
                    </td>

                    <td className="py-2.5 px-4 text-right font-black font-mono text-xs sm:text-sm text-red-600">
                      {formatCLP(item.totalDeuda)}
                    </td>

                    <td className="py-2.5 px-4 text-center">
                      <div className="inline-flex items-center gap-1.5 font-mono font-medium text-slate-700">
                        <div className="w-12 bg-slate-200 rounded-full h-1.5 overflow-hidden">
                          <div
                            className="bg-red-600 h-1.5 rounded-full"
                            style={{ width: `${Math.min(100, item.porcentaje)}%` }}
                          />
                        </div>
                        <span className="text-[10px]">{item.porcentaje}%</span>
                      </div>
                    </td>

                    <td className="py-2.5 px-4 text-center font-semibold font-mono text-slate-700">
                      {item.cantidadFacturas}
                    </td>

                    <td className="py-2.5 px-4 text-center font-semibold font-mono text-slate-700">
                      {item.cantidadProveedores}
                    </td>

                    <td className="py-2.5 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => handleVerFacturasMes(item)}
                        className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold rounded-md bg-slate-900 text-white hover:bg-red-600 transition-colors shadow-sm"
                      >
                        <span>Ver Facturas</span>
                        <ArrowUpRight className="h-3 w-3" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {mesesFiltrados.length > 0 && (
              <tfoot className="bg-slate-100/90 font-bold text-slate-900 border-t-2 border-slate-300">
                <tr>
                  <td className="py-2.5 px-4 font-black">TOTAL CARTERA FILTRADA</td>
                  <td className="py-2.5 px-4 text-center">-</td>
                  <td className="py-2.5 px-4 text-right font-black font-mono text-xs sm:text-sm text-red-600">
                    {formatCLP(
                      mesesFiltrados.reduce((sum, m) => sum + m.totalDeuda, 0)
                    )}
                  </td>
                  <td className="py-2.5 px-4 text-center font-mono">100%</td>
                  <td className="py-2.5 px-4 text-center font-mono">
                    {mesesFiltrados.reduce((sum, m) => sum + m.cantidadFacturas, 0)}
                  </td>
                  <td className="py-2.5 px-4 text-center font-mono">
                    {new Set(
                      mesesFiltrados.flatMap((m) => m.facturas.map((f) => f.rut_proveedor))
                    ).size}
                  </td>
                  <td className="py-2.5 px-4 text-right">-</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* 6. MODAL MULTIPROPÓSITO DE DETALLE DE FACTURAS (POR MES O POR ESTRATO AGING) */}
      {modalData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden">
            {/* Cabecera del Modal */}
            <div className="p-4 border-b border-slate-200 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Receipt className="h-5 w-5 text-red-400" />
                  <h3 className="text-sm sm:text-base font-bold tracking-tight">
                    {modalData.titulo}
                  </h3>
                  {modalData.badgeText && (
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold border ${modalData.badgeStyle}`}
                    >
                      {modalData.badgeIcon} {modalData.badgeText}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Deuda Exigible:{" "}
                  <span className="font-bold text-red-400 font-mono">
                    {formatCLP(modalData.totalDeuda)}
                  </span>{" "}
                  · {modalData.facturas.length} facturas ·{" "}
                  {new Set(modalData.facturas.map((f) => f.rut_proveedor)).size} proveedores
                  {modalData.subtitulo ? ` · ${modalData.subtitulo}` : ""}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setModalData(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Buscador Interno del Modal */}
            <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
              <div className="relative w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar en este segmento por RUT, Razón Social o Folio..."
                  value={modalSearch}
                  onChange={(e) => setModalSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
                />
              </div>
              {modalSearch && (
                <button
                  type="button"
                  onClick={() => setModalSearch("")}
                  className="text-xs text-slate-500 hover:text-slate-800 px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg whitespace-nowrap"
                >
                  Limpiar
                </button>
              )}
            </div>

            {/* Contenido / Tabla del Modal */}
            <div className="overflow-y-auto p-4 flex-1">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-100 text-slate-600 uppercase text-[10px] font-semibold border-b border-slate-200">
                  <tr>
                    <th className="py-2 px-3">Folio</th>
                    <th className="py-2 px-3">RUT Proveedor</th>
                    <th className="py-2 px-3">Razón Social</th>
                    <th className="py-2 px-3">Fecha Docto.</th>
                    <th className="py-2 px-3">Fecha Venc.</th>
                    <th className="py-2 px-3">Estado / Condición</th>
                    <th className="py-2 px-3 text-right">Saldo Deuda</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {facturasModalFiltradas.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-400">
                        No se encontraron facturas con los criterios de búsqueda.
                      </td>
                    </tr>
                  ) : (
                    facturasModalFiltradas.map((fc) => (
                      <tr key={fc.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-2 px-3 font-bold font-mono text-slate-900">
                          #{fc.folio}
                        </td>
                        <td className="py-2 px-3 font-mono text-slate-600 whitespace-nowrap">
                          {formatRutDisplay(fc.rut_proveedor)}
                        </td>
                        <td
                          className="py-2 px-3 font-medium text-slate-800 max-w-[200px] truncate"
                          title={fc.razon_social}
                        >
                          {fc.razon_social}
                        </td>
                        <td className="py-2 px-3 text-slate-500 whitespace-nowrap">
                          {formatDateCL(fc.fecha_docto)}
                        </td>
                        <td className="py-2 px-3 font-semibold text-red-600 whitespace-nowrap">
                          {formatDateCL(fc.fecha_vencimiento)}
                        </td>
                        <td className="py-2 px-3">
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700">
                            {fc.estado || "DEUDA_PROVEEDOR"}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-right font-black font-mono text-red-600">
                          {formatCLP(fc.monto_saldo || fc.monto_total)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pie del Modal */}
            <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
              <div>
                Mostrando <span className="font-bold">{facturasModalFiltradas.length}</span> de{" "}
                <span className="font-bold">{modalData.facturas.length}</span> facturas
              </div>
              <button
                type="button"
                onClick={() => setModalData(null)}
                className="px-4 py-1.5 text-xs font-semibold bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
