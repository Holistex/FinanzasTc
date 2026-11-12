"use client";

import React, { useState, useMemo } from "react";
import {
  Search,
  Filter,
  CalendarClock,
  CreditCard,
  Building2,
  Landmark,
  AlertTriangle,
  Clock,
  RefreshCw,
  FileDown,
} from "lucide-react";
import { CompromisoCompra, ModalidadCompromiso } from "@/types/database.types";
import { SemanaOption, CompromisosComprasKPIs, getCompromisosComprasAction } from "@/actions/compras-historico-compromisos.actions";
import { formatCLP, formatDateCL, formatRutDisplay, toDateOnlyString } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { QUERY_KEYS } from "@/lib/prefetch-helpers";

interface CompromisosTableProps {
  initialData: CompromisoCompra[];
  semanasDisponibles: SemanaOption[];
  initialKpis: CompromisosComprasKPIs;
}

export function CompromisosTable({
  initialData,
  semanasDisponibles,
  initialKpis,
}: CompromisosTableProps) {
  // Caché dinámico de TanStack Query para render instantáneo (<1ms) y revalidación en segundo plano
  const { data: queryData } = useQuery({
    queryKey: QUERY_KEYS.compromisosCompras,
    queryFn: () => getCompromisosComprasAction(),
    initialData: {
      data: initialData,
      semanasDisponibles,
      kpis: initialKpis,
      semanaActualId: "TODAS",
    },
    staleTime: 5 * 60 * 1000,
  });

  const data = queryData?.data ?? initialData;
  const [selectedSemanaId, setSelectedSemanaId] = useState<string>("TODAS");
  const [selectedModalidad, setSelectedModalidad] = useState<string>("TODAS");
  const [searchTerm, setSearchTerm] = useState("");
  const [isExporting, setIsExporting] = useState(false);

  // Encontrar el objeto de semana seleccionado
  const selectedSemanaObj = useMemo(() => {
    return semanasDisponibles.find((s) => s.id === selectedSemanaId);
  }, [selectedSemanaId, semanasDisponibles]);

  // Filtrado de compromisos
  const filteredData = useMemo(() => {
    return data.filter((item) => {
      // 1. Filtro de semana por rango de fechas textual YYYY-MM-DD (sin desfase horario)
      if (selectedSemanaId !== "TODAS" && selectedSemanaObj?.fechaInicio && selectedSemanaObj?.fechaFin) {
        const itemFecha = toDateOnlyString(item.fecha_vencimiento);
        if (!itemFecha) return false;
        if (
          itemFecha < selectedSemanaObj.fechaInicio ||
          itemFecha > selectedSemanaObj.fechaFin
        ) {
          return false;
        }
      }

      // 2. Filtro de modalidad
      if (selectedModalidad !== "TODAS") {
        if (item.modalidad !== selectedModalidad) return false;
      }

      // 3. Búsqueda general
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const match =
          item.razon_social.toLowerCase().includes(term) ||
          item.rut_proveedor.toLowerCase().includes(term) ||
          item.referencia_doc.toLowerCase().includes(term);
        if (!match) return false;
      }

      return true;
    }).sort((a, b) => {
      // Ordenar por fecha de vencimiento más próxima primero
      const dateA = toDateOnlyString(a.fecha_vencimiento);
      const dateB = toDateOnlyString(b.fecha_vencimiento);
      return dateA.localeCompare(dateB);
    });
  }, [data, selectedSemanaId, selectedSemanaObj, selectedModalidad, searchTerm]);

  // Recalcular métricas de acuerdo al filtro actual
  const currentKpis = useMemo(() => {
    let total = 0;
    let cheques = 0;
    let factoring = 0;
    let confirming = 0;

    filteredData.forEach((item) => {
      total += item.monto;
      if (item.modalidad === "CHEQUE") cheques += item.monto;
      else if (item.modalidad === "FACTORING") factoring += item.monto;
      else if (item.modalidad === "CONFIRMING") confirming += item.monto;
    });

    return {
      granTotal: total,
      countCompromisos: filteredData.length,
      totalCheques: cheques,
      totalFactoring: factoring,
      totalConfirming: confirming,
    };
  }, [filteredData]);

  // Obtener etiqueta de semana seleccionada
  const selectedSemanaLabel = useMemo(() => {
    if (selectedSemanaId === "TODAS") return "Todas las Semanas Vigentes";
    return selectedSemanaObj ? selectedSemanaObj.label : `Semana Seleccionada`;
  }, [selectedSemanaId, selectedSemanaObj]);

  // Manejar exportación a PDF (Carga diferida / lazy loading de jsPDF)
  const handleExportPdf = async () => {
    try {
      setIsExporting(true);

      const { exportCompromisosToPdf } = await import(
        "@/lib/pdf/compromisos-pdf-generator"
      );

      const rango =
        selectedSemanaObj && selectedSemanaObj.fechaInicio && selectedSemanaObj.fechaFin
          ? `${formatDateCL(selectedSemanaObj.fechaInicio)} al ${formatDateCL(selectedSemanaObj.fechaFin)}`
          : undefined;

      exportCompromisosToPdf({
        semanaLabel: selectedSemanaLabel,
        rangoFechas: rango,
        compromisos: filteredData,
        totales: {
          totalCheques: currentKpis.totalCheques,
          totalFactoring: currentKpis.totalFactoring,
          totalConfirming: currentKpis.totalConfirming,
          granTotal: currentKpis.granTotal,
        },
      });
    } catch (error) {
      console.error("Error al exportar a PDF:", error);
      alert("Ocurrió un error al generar el archivo PDF.");
    } finally {
      setIsExporting(false);
    }
  };

  const getModalidadBadge = (modalidad: ModalidadCompromiso) => {
    switch (modalidad) {
      case "CHEQUE":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200">
            <CreditCard className="h-3 w-3 text-purple-600" />
            CHEQUE
          </span>
        );
      case "FACTORING":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            <Building2 className="h-3 w-3 text-blue-600" />
            FACTORING
          </span>
        );
      case "CONFIRMING":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <Landmark className="h-3 w-3 text-amber-600" />
            CONFIRMING
          </span>
        );
    }
  };

  const getDiasBadge = (dias?: number) => {
    const val = dias ?? 0;
    if (val <= 0) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300">
          <AlertTriangle className="h-3 w-3 text-rose-600" />
          {val === 0 ? "Vence Hoy" : `Vencido (${Math.abs(val)}d)`}
        </span>
      );
    }
    if (val <= 7) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
          <Clock className="h-3 w-3 text-rose-500" />
          {val} {val === 1 ? "día" : "días"} (Crítico)
        </span>
      );
    }
    if (val <= 15) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
          <Clock className="h-3 w-3 text-amber-500" />
          {val} días
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
        <Clock className="h-3 w-3 text-emerald-500" />
        {val} días
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* TARJETAS DE KPIS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* GRAN TOTAL */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm text-white flex flex-col justify-between relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-[#E05A10]/10 rounded-full blur-2xl -mr-6 -mt-6"></div>
          <div className="flex items-center justify-between z-10">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Gran Total Compromisos
            </span>
            <div className="h-7 w-7 rounded-lg bg-[#E05A10]/20 flex items-center justify-center text-[#E05A10]">
              <CalendarClock className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 z-10">
            <div className="text-2xl font-black font-mono text-white">
              {formatCLP(currentKpis.granTotal)}
            </div>
            <p className="text-xs text-slate-400 mt-1">
              {currentKpis.countCompromisos} compromisos en vista
            </p>
          </div>
        </div>

        {/* CHEQUES */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Total Cheques Pendientes
            </span>
            <span className="text-[10px] font-bold px-1.5 py-0.5 bg-purple-100 text-purple-800 rounded">
              CHEQUES
            </span>
          </div>
          <div className="mt-3">
            <div className="text-xl font-bold font-mono text-slate-900">
              {formatCLP(currentKpis.totalCheques)}
            </div>
            <p className="text-xs text-slate-500 mt-1">Cheques a fecha emitidos</p>
          </div>
        </div>

        {/* FACTORING */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Factoring Proveedores
            </span>
            <span className="text-[10px] font-bold px-1.5 py-0.5 bg-blue-100 text-blue-800 rounded">
              FACTORING
            </span>
          </div>
          <div className="mt-3">
            <div className="text-xl font-bold font-mono text-slate-900">
              {formatCLP(currentKpis.totalFactoring)}
            </div>
            <p className="text-xs text-slate-500 mt-1">Obligaciones cedidas</p>
          </div>
        </div>

        {/* CONFIRMING */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Total Confirming
            </span>
            <span className="text-[10px] font-bold px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded">
              CONFIRMING
            </span>
          </div>
          <div className="mt-3">
            <div className="text-xl font-bold font-mono text-slate-900">
              {formatCLP(currentKpis.totalConfirming)}
            </div>
            <p className="text-xs text-slate-500 mt-1">Líneas de pago anticipado</p>
          </div>
        </div>
      </div>

      {/* BARRA DE HERRAMIENTAS, FILTROS Y ACCIÓN DE EXPORTACIÓN */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          {/* Selector de Semana */}
          <div className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-[#E05A10]" />
            <select
              value={selectedSemanaId}
              onChange={(e) => setSelectedSemanaId(e.target.value)}
              className="px-3 py-2 text-sm font-medium border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#E05A10] text-slate-800 min-w-[280px]"
            >
              {semanasDisponibles.map((sem) => (
                <option key={sem.id} value={sem.id}>
                  {sem.label} ({sem.count} compromisos)
                </option>
              ))}
            </select>
          </div>

          {/* Filtro por Modalidad */}
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-slate-400" />
            <select
              value={selectedModalidad}
              onChange={(e) => setSelectedModalidad(e.target.value)}
              className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#E05A10]"
            >
              <option value="TODAS">Todas las Modalidades</option>
              <option value="CHEQUE">Cheques a Fecha</option>
              <option value="FACTORING">Factoring Proveedores</option>
              <option value="CONFIRMING">Confirming</option>
            </select>
          </div>

          {/* Input de Búsqueda */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por Proveedor, RUT o Doc..."
              className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E05A10] focus:border-transparent"
            />
          </div>

          {/* Botones de Acción */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setSelectedSemanaId("TODAS");
                setSelectedModalidad("TODAS");
                setSearchTerm("");
              }}
              className="p-2 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
              title="Restablecer filtros"
            >
              <RefreshCw className="h-4 w-4" />
            </button>

            {/* BOTÓN EXPORTAR A PDF */}
            <button
              onClick={handleExportPdf}
              disabled={isExporting || filteredData.length === 0}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-[#E05A10] hover:bg-[#c94e0b] rounded-lg shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FileDown className="h-4 w-4" />
              <span>Exportar Reporte a PDF</span>
            </button>
          </div>
        </div>

        {/* Resumen de filtro activo */}
        <div className="flex flex-wrap items-center justify-between text-xs text-slate-600 pt-2 border-t border-slate-100 gap-2">
          <div>
            Filtrando por:{" "}
            <span className="font-semibold text-slate-900 bg-slate-100 px-2 py-0.5 rounded">
              {selectedSemanaLabel}
            </span>{" "}
            • <span className="font-medium text-slate-700">{filteredData.length}</span> compromisos
          </div>
          <div className="text-xs text-slate-500">
            Base de cálculo de días restantes al día de hoy (18/10/2026)
          </div>
        </div>
      </div>

      {/* TABLA PRINCIPAL DE COMPROMISOS */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-[850px] lg:min-w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold uppercase tracking-wider text-slate-600">
              <tr>
                <th scope="col" className="px-4 py-3">
                  MODALIDAD
                </th>
                <th scope="col" className="px-4 py-3">
                  PROVEEDOR / ENTIDAD
                </th>
                <th scope="col" className="px-4 py-3">
                  DOCUMENTO / REF
                </th>
                <th scope="col" className="px-4 py-3">
                  FECHA VENCIMIENTO
                </th>
                <th scope="col" className="px-4 py-3">
                  DÍAS FALTANTES
                </th>
                <th scope="col" className="px-4 py-3 text-right">
                  MONTO COMPROMISO
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredData.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-slate-400">
                    <CalendarClock className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                    <p className="font-medium text-slate-600">
                      No se encontraron compromisos para el período seleccionado
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      Seleccione otra semana o modifique los filtros de búsqueda
                    </p>
                  </td>
                </tr>
              ) : (
                filteredData.map((item) => {
                  return (
                    <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                      {/* MODALIDAD */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        {getModalidadBadge(item.modalidad)}
                      </td>

                      {/* PROVEEDOR / ENTIDAD */}
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900 leading-tight">
                          {item.razon_social}
                        </div>
                        <div className="font-mono text-xs text-slate-500 mt-0.5">
                          {formatRutDisplay(item.rut_proveedor)}
                        </div>
                      </td>

                      {/* DOCUMENTO / REF */}
                      <td className="px-4 py-3">
                        <div className="font-mono font-medium text-slate-800">
                          {item.referencia_doc}
                        </div>
                      </td>

                      {/* FECHA VENCIMIENTO */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="font-mono text-xs font-semibold text-slate-800 bg-slate-100 px-2 py-1 rounded">
                          {formatDateCL(item.fecha_vencimiento)}
                        </span>
                      </td>

                      {/* DÍAS FALTANTES */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        {getDiasBadge(item.dias_faltantes)}
                      </td>

                      {/* MONTO COMPROMISO */}
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <span className="font-mono font-bold text-slate-900 text-sm">
                          {formatCLP(item.monto)}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
