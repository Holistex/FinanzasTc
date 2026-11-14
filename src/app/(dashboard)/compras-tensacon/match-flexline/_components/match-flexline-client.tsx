"use client";

import React, { useState, useMemo, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  GitCompare,
  Upload,
  Search,
  RotateCcw,
  FileSpreadsheet,
  FileText,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Calendar,
} from "lucide-react";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
import {
  TablePagination,
  GLOBAL_PAGE_SIZE,
  paginateArray,
} from "@/components/ui/TablePagination";
import {
  MatchFlexlineResponse,
  importarMatchFlexlineAction,
} from "@/actions/match-flexline.actions";
import { formatCLP, formatDateCL, cn } from "@/lib/utils";

type TabMatchFlexline = "FALTANTES" | "CORRECTAS" | "MAL_INGRESADAS";

interface MatchFlexlineClientProps {
  initialData: MatchFlexlineResponse;
  esAdministrador: boolean;
}

function getTipoDteLabel(tipoDoc: number): string {
  switch (Number(tipoDoc)) {
    case 33:
      return "FAC 33";
    case 34:
      return "EX 34";
    case 61:
      return "NC 61";
    case 56:
      return "ND 56";
    default:
      return `DTE ${tipoDoc}`;
  }
}

export function MatchFlexlineClient({
  initialData,
  esAdministrador,
}: MatchFlexlineClientProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, startUploadTransition] = useTransition();

  const [activeTab, setActiveTab] = useState<TabMatchFlexline>("FALTANTES");
  const [search, setSearch] = useState("");
  const [periodoFilter, setPeriodoFilter] = useState("TODOS");
  const [currentPage, setCurrentPage] = useState(1);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const normalizeQuery = (val: string) =>
    val
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\./g, "")
      .trim()
      .toLowerCase();

  const filteredFaltantes = useMemo(() => {
    const q = normalizeQuery(search);
    return initialData.faltantes.filter((r) => {
      if (periodoFilter !== "TODOS" && r.periodo !== periodoFilter) return false;
      if (q) {
        const hay = normalizeQuery(
          `${r.key} ${r.folio} ${r.rut_proveedor} ${r.razon_social}`
        );
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [initialData.faltantes, search, periodoFilter]);

  const filteredCorrectas = useMemo(() => {
    const q = normalizeQuery(search);
    return initialData.correctas.filter((r) => {
      if (periodoFilter !== "TODOS" && r.periodo !== periodoFilter) return false;
      if (q) {
        const hay = normalizeQuery(
          `${r.key} ${r.folio} ${r.rut_proveedor} ${r.razon_social}`
        );
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [initialData.correctas, search, periodoFilter]);

  const filteredMalIngresadas = useMemo(() => {
    const q = normalizeQuery(search);
    return initialData.malIngresadas.filter((r) => {
      if (periodoFilter !== "TODOS" && r.periodo !== periodoFilter) return false;
      if (q) {
        const hay = normalizeQuery(
          `${r.key2} ${r.folio} ${r.rut_proveedor} ${r.proveedor} ${r.motivo}`
        );
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [initialData.malIngresadas, search, periodoFilter]);

  const handleTabChange = (tab: TabMatchFlexline) => {
    setActiveTab(tab);
    setCurrentPage(1);
  };

  const handleSearchChange = (val: string) => {
    setSearch(val);
    setCurrentPage(1);
  };

  const handlePeriodoChange = (val: string) => {
    setPeriodoFilter(val);
    setCurrentPage(1);
  };

  const handleClearFilters = () => {
    setSearch("");
    setPeriodoFilter("TODOS");
    setCurrentPage(1);
  };

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFeedback(null);

    const formData = new FormData();
    formData.append("file", file);

    startUploadTransition(async () => {
      const res = await importarMatchFlexlineAction(formData);
      if (fileInputRef.current) fileInputRef.current.value = "";

      if (res.success) {
        setFeedback({
          type: "success",
          message: `Planilla Flexline importada correctamente: ${res.importedCount ?? 0} registros procesados.`,
        });
        router.refresh();
      } else {
        setFeedback({
          type: "error",
          message: res.error || "No se pudo importar la planilla Excel.",
        });
      }
    });
  };

  const handleExportExcel = () => {
    let rows: Record<string, unknown>[] = [];
    let sheetName = "MatchFlexline";

    if (activeTab === "FALTANTES") {
      sheetName = "Faltan_Por_Ingresar";
      rows = filteredFaltantes.map((r) => ({
        KEY: r.key,
        "TIPO DTE": getTipoDteLabel(r.tipo_doc),
        FOLIO: r.folio,
        "RUT PROVEEDOR": r.rut_proveedor,
        "RAZON SOCIAL": r.razon_social,
        "FECHA EMISION": formatDateCL(r.fecha_docto),
        CONDICION: r.condicion_pago,
        "MONTO TOTAL SII": r.monto_total,
        "ESTADO ACCION": "Pendiente Ingreso Flexline",
      }));
    } else if (activeTab === "CORRECTAS") {
      sheetName = "Ingresadas_Correctamente";
      rows = filteredCorrectas.map((r) => ({
        KEY: r.key,
        "TIPO DTE": getTipoDteLabel(r.tipo_doc),
        FOLIO: r.folio,
        "RUT PROVEEDOR": r.rut_proveedor,
        "RAZON SOCIAL": r.razon_social,
        "FECHA EMISION": formatDateCL(r.fecha_docto),
        "MONTO SII": r.monto_sii,
        "MONTO FLEXLINE": r.monto_flexline,
        "PERIODO FLEXLINE": r.periodo_flexline,
        ESTADO: "Match OK",
      }));
    } else {
      sheetName = "Mal_Ingresadas";
      rows = filteredMalIngresadas.map((r) => ({
        KEY2: r.key2,
        "MOTIVO / DIAGNOSTICO": r.motivo,
        FOLIO: r.folio,
        "RUT PROVEEDOR": r.rut_proveedor,
        PROVEEDOR: r.proveedor,
        "MONTO SII": r.monto_sii ?? "-",
        "MONTO FLEXLINE": r.monto_flexline,
        "DIFERENCIA ($ CLP)": r.diferencia,
      }));
    }

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, `Match_Flexline_${sheetName}.xlsx`);
  };

  const handleExportPdf = () => {
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const titleMap: Record<TabMatchFlexline, string> = {
      FALTANTES: "Faltan por Ingresar a Flexline",
      CORRECTAS: "Ingresadas Correctamente (Match OK)",
      MAL_INGRESADAS: "Mal Ingresadas / Observadas",
    };

    doc.setFontSize(13);
    doc.text(`TENSACON — Match Flexline: ${titleMap[activeTab]}`, 14, 15);
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(
      `Fecha reporte: ${new Date().toLocaleDateString("es-CL")} | Período: ${
        periodoFilter === "TODOS" ? "Todos" : periodoFilter
      }`,
      14,
      21
    );

    if (activeTab === "FALTANTES") {
      autoTable(doc, {
        startY: 26,
        head: [
          [
            "KEY",
            "TIPO DTE",
            "FOLIO",
            "RUT PROVEEDOR",
            "RAZÓN SOCIAL",
            "EMISIÓN",
            "CONDICIÓN",
            "MONTO SII",
            "ESTADO",
          ],
        ],
        body: filteredFaltantes.map((r) => [
          r.key,
          getTipoDteLabel(r.tipo_doc),
          String(r.folio),
          r.rut_proveedor,
          r.razon_social,
          formatDateCL(r.fecha_docto),
          r.condicion_pago,
          formatCLP(r.monto_total),
          "Pendiente Ingreso Flexline",
        ]),
        styles: { fontSize: 7.5 },
        headStyles: { fillColor: [224, 90, 16] },
      });
    } else if (activeTab === "CORRECTAS") {
      autoTable(doc, {
        startY: 26,
        head: [
          [
            "KEY",
            "TIPO DTE",
            "FOLIO",
            "RUT PROVEEDOR",
            "RAZÓN SOCIAL",
            "EMISIÓN",
            "MONTO SII",
            "MONTO FLEXLINE",
            "PERÍODO",
            "ESTADO",
          ],
        ],
        body: filteredCorrectas.map((r) => [
          r.key,
          getTipoDteLabel(r.tipo_doc),
          String(r.folio),
          r.rut_proveedor,
          r.razon_social,
          formatDateCL(r.fecha_docto),
          formatCLP(r.monto_sii),
          formatCLP(r.monto_flexline),
          r.periodo_flexline,
          "Match OK",
        ]),
        styles: { fontSize: 7.5 },
        headStyles: { fillColor: [16, 185, 129] },
      });
    } else {
      autoTable(doc, {
        startY: 26,
        head: [
          [
            "KEY2",
            "MOTIVO / DIAGNÓSTICO",
            "FOLIO",
            "RUT PROVEEDOR",
            "PROVEEDOR",
            "MONTO SII",
            "MONTO FLEXLINE",
            "DIFERENCIA",
          ],
        ],
        body: filteredMalIngresadas.map((r) => [
          r.key2,
          r.motivo,
          r.folio,
          r.rut_proveedor,
          r.proveedor,
          r.monto_sii !== null ? formatCLP(r.monto_sii) : "-",
          formatCLP(r.monto_flexline),
          formatCLP(r.diferencia),
        ]),
        styles: { fontSize: 7.5 },
        headStyles: { fillColor: [225, 29, 72] },
      });
    }

    doc.save(`Match_Flexline_${activeTab.toLowerCase()}.pdf`);
  };

  const activeRowsCount =
    activeTab === "FALTANTES"
      ? filteredFaltantes.length
      : activeTab === "CORRECTAS"
      ? filteredCorrectas.length
      : filteredMalIngresadas.length;

  const paginatedFaltantes = useMemo(
    () => paginateArray(filteredFaltantes, currentPage, GLOBAL_PAGE_SIZE),
    [filteredFaltantes, currentPage]
  );
  const paginatedCorrectas = useMemo(
    () => paginateArray(filteredCorrectas, currentPage, GLOBAL_PAGE_SIZE),
    [filteredCorrectas, currentPage]
  );
  const paginatedMalIngresadas = useMemo(
    () => paginateArray(filteredMalIngresadas, currentPage, GLOBAL_PAGE_SIZE),
    [filteredMalIngresadas, currentPage]
  );

  return (
    <div className="space-y-4">
      {/* 1. Cabecera Corporativa + Botón Importar Excel (Solo ADMINISTRADOR) */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-[#E05A10] shadow-xs">
            <GitCompare className="h-5 w-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-bold tracking-tight text-slate-900">
                Match Flexline
              </h1>
              <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-orange-50 text-[#E05A10] border border-orange-200 uppercase tracking-wider">
                Conciliación SII vs Flexline (KEY2)
              </span>
              {initialData.totalFlexlineRows > 0 && (
                <span className="px-2 py-0.5 text-[10px] font-mono font-semibold rounded bg-slate-100 text-slate-600 border border-slate-200">
                  {initialData.totalFlexlineRows.toLocaleString("es-CL")} filas Flexline
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500">
              COMPRAS TENSACON — Auditoría y cruce automático entre Registro de Compras SII y libro Flexline
              {initialData.ultimaCarga && (
                <span className="ml-2 text-slate-400">
                  · Última carga:{" "}
                  {new Date(initialData.ultimaCarga).toLocaleString("es-CL")}
                </span>
              )}
            </p>
          </div>
        </div>

        {esAdministrador && (
          <div className="shrink-0">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileSelected}
              className="hidden"
            />
            <button
              type="button"
              disabled={isUploading}
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-lg bg-[#E05A10] px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-[#c94f0e] disabled:opacity-60 transition-colors"
            >
              {isUploading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Upload className="h-3.5 w-3.5" />
              )}
              <span>
                {isUploading ? "Procesando Excel..." : "Importar Excel Flexline"}
              </span>
            </button>
          </div>
        )}
      </div>

      {feedback && (
        <div
          className={cn(
            "rounded-lg border px-3.5 py-2.5 text-xs font-medium flex items-center justify-between gap-2",
            feedback.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-rose-50 border-rose-200 text-rose-800"
          )}
        >
          <span>{feedback.message}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-[11px] font-bold underline"
          >
            Cerrar
          </button>
        </div>
      )}

      {/* 2. 4 Tarjetas KPI Blancas Ejecutivas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white border border-slate-200 border-l-4 border-l-slate-600 rounded-xl p-3.5 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              TOTAL DOCUMENTOS SII
            </span>
            <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-slate-100 text-slate-700 border border-slate-200">
              {initialData.kpis.totalDocumentosSii.toLocaleString("es-CL")} docs
            </span>
          </div>
          <div className="text-lg font-black text-slate-900 font-mono tabular-nums mt-1.5">
            {formatCLP(initialData.kpis.totalMontoSii)}
          </div>
        </div>

        <div className="bg-white border border-slate-200 border-l-4 border-l-[#E05A10] rounded-xl p-3.5 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              FALTAN POR INGRESAR
            </span>
            <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-orange-50 text-[#E05A10] border border-orange-200">
              {initialData.kpis.faltanPorIngresarCount.toLocaleString("es-CL")} docs
            </span>
          </div>
          <div className="text-lg font-black text-[#E05A10] font-mono tabular-nums mt-1.5">
            {formatCLP(initialData.kpis.faltanPorIngresarMonto)}
          </div>
        </div>

        <div className="bg-white border border-slate-200 border-l-4 border-l-emerald-500 rounded-xl p-3.5 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              INGRESADAS CORRECTAMENTE
            </span>
            <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
              {initialData.kpis.ingresadasCorrectamenteCount.toLocaleString("es-CL")} docs
            </span>
          </div>
          <div className="text-lg font-black text-emerald-700 font-mono tabular-nums mt-1.5">
            {formatCLP(initialData.kpis.ingresadasCorrectamenteMonto)}
          </div>
        </div>

        <div className="bg-white border border-slate-200 border-l-4 border-l-rose-500 rounded-xl p-3.5 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              MAL INGRESADAS / OBSERVADAS
            </span>
            <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-rose-50 text-rose-700 border border-rose-200">
              {initialData.kpis.malIngresadasCount.toLocaleString("es-CL")} obs
            </span>
          </div>
          <div className="text-lg font-black text-rose-700 font-mono tabular-nums mt-1.5">
            {formatCLP(initialData.kpis.malIngresadasDiferenciaMonto)}
          </div>
        </div>
      </div>

      {/* 3. Segmented Control Ejecutivo (3 Pestañas) */}
      <SegmentedTabs
        ariaLabel="Estados de conciliación Match Flexline"
        activeTab={activeTab}
        onChange={handleTabChange}
        tabs={[
          {
            id: "FALTANTES",
            label: "Faltan por Ingresar a Flexline",
            icon: AlertCircle,
            count: filteredFaltantes.length,
          },
          {
            id: "CORRECTAS",
            label: "Ingresadas Correctamente",
            icon: CheckCircle2,
            count: filteredCorrectas.length,
          },
          {
            id: "MAL_INGRESADAS",
            label: "Mal Ingresadas",
            icon: AlertTriangle,
            count: filteredMalIngresadas.length,
          },
        ]}
      />

      {/* 4. Barra de Filtros y Exportación */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[260px]">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Buscar por RUT, Razón Social, Folio o KEY..."
              className="w-full rounded-lg border border-slate-200 bg-slate-50/70 pl-8 pr-3 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 focus:bg-white focus:border-[#E05A10] focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5 text-slate-400" />
            <select
              value={periodoFilter}
              onChange={(e) => handlePeriodoChange(e.target.value)}
              className="rounded-lg border border-slate-200 bg-slate-50/70 px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:bg-white focus:border-[#E05A10] focus:outline-none"
            >
              <option value="TODOS">Todos los Períodos</option>
              {initialData.periodosDisponibles.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          {(search || periodoFilter !== "TODOS") && (
            <button
              type="button"
              onClick={handleClearFilters}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              <RotateCcw className="h-3 w-3" />
              Limpiar
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleExportExcel}
            disabled={activeRowsCount === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 transition-colors"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            Exportar Excel
          </button>
          <button
            type="button"
            onClick={handleExportPdf}
            disabled={activeRowsCount === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors"
          >
            <FileText className="h-3.5 w-3.5 text-rose-600" />
            Exportar PDF
          </button>
        </div>
      </div>

      {/* 5. Tabla según Pestaña Activa */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          {activeTab === "FALTANTES" && (
            <table className="min-w-[920px] lg:min-w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-600 text-[10px] font-bold uppercase tracking-wider border-b border-slate-200">
                  <th className="py-2.5 px-3">KEY</th>
                  <th className="py-2.5 px-3">TIPO DTE</th>
                  <th className="py-2.5 px-3">FOLIO</th>
                  <th className="py-2.5 px-3">RUT PROVEEDOR</th>
                  <th className="py-2.5 px-3">RAZÓN SOCIAL</th>
                  <th className="py-2.5 px-3">FECHA EMISIÓN</th>
                  <th className="py-2.5 px-3">CONDICIÓN</th>
                  <th className="py-2.5 px-3 text-right">MONTO TOTAL SII</th>
                  <th className="py-2.5 px-3 text-center">ESTADO ACCIÓN</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/80 text-xs">
                {paginatedFaltantes.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-10 text-center text-slate-500">
                      No hay documentos pendientes por ingresar a Flexline para los filtros seleccionados.
                    </td>
                  </tr>
                ) : (
                  paginatedFaltantes.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-2 px-3 font-mono font-semibold text-slate-800 whitespace-nowrap">
                        {r.key}
                      </td>
                      <td className="py-2 px-3 font-mono text-slate-600 whitespace-nowrap">
                        {getTipoDteLabel(r.tipo_doc)}
                      </td>
                      <td className="py-2 px-3 font-mono font-semibold text-slate-900">
                        #{r.folio}
                      </td>
                      <td className="py-2 px-3 font-mono text-slate-600 whitespace-nowrap">
                        {r.rut_proveedor}
                      </td>
                      <td className="py-2 px-3 font-medium text-slate-800">
                        {r.razon_social}
                      </td>
                      <td className="py-2 px-3 font-mono text-slate-600 whitespace-nowrap">
                        {formatDateCL(r.fecha_docto)}
                      </td>
                      <td className="py-2 px-3 text-slate-600">
                        {r.condicion_pago}
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-bold text-slate-900 whitespace-nowrap">
                        {formatCLP(r.monto_total)}
                      </td>
                      <td className="py-2 px-3 text-center whitespace-nowrap">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                          Pendiente Ingreso Flexline
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}

          {activeTab === "CORRECTAS" && (
            <table className="min-w-[960px] lg:min-w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-600 text-[10px] font-bold uppercase tracking-wider border-b border-slate-200">
                  <th className="py-2.5 px-3">KEY</th>
                  <th className="py-2.5 px-3">TIPO DTE</th>
                  <th className="py-2.5 px-3">FOLIO</th>
                  <th className="py-2.5 px-3">RUT PROVEEDOR</th>
                  <th className="py-2.5 px-3">RAZÓN SOCIAL</th>
                  <th className="py-2.5 px-3">FECHA EMISIÓN</th>
                  <th className="py-2.5 px-3 text-right">MONTO SII</th>
                  <th className="py-2.5 px-3 text-right">MONTO FLEXLINE</th>
                  <th className="py-2.5 px-3 text-center">PERÍODO FLEXLINE</th>
                  <th className="py-2.5 px-3 text-center">ESTADO</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/80 text-xs">
                {paginatedCorrectas.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-10 text-center text-slate-500">
                      {initialData.totalFlexlineRows === 0
                        ? "Aún no se ha importado una planilla Excel de Flexline."
                        : "No hay documentos conciliados para los filtros seleccionados."}
                    </td>
                  </tr>
                ) : (
                  paginatedCorrectas.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-2 px-3 font-mono font-semibold text-slate-800 whitespace-nowrap">
                        {r.key}
                      </td>
                      <td className="py-2 px-3 font-mono text-slate-600 whitespace-nowrap">
                        {getTipoDteLabel(r.tipo_doc)}
                      </td>
                      <td className="py-2 px-3 font-mono font-semibold text-slate-900">
                        #{r.folio}
                      </td>
                      <td className="py-2 px-3 font-mono text-slate-600 whitespace-nowrap">
                        {r.rut_proveedor}
                      </td>
                      <td className="py-2 px-3 font-medium text-slate-800">
                        {r.razon_social}
                      </td>
                      <td className="py-2 px-3 font-mono text-slate-600 whitespace-nowrap">
                        {formatDateCL(r.fecha_docto)}
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-semibold text-slate-900 whitespace-nowrap">
                        {formatCLP(r.monto_sii)}
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-semibold text-emerald-700 whitespace-nowrap">
                        {formatCLP(r.monto_flexline)}
                      </td>
                      <td className="py-2 px-3 text-center font-mono text-slate-600">
                        {r.periodo_flexline}
                      </td>
                      <td className="py-2 px-3 text-center whitespace-nowrap">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          Match OK
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}

          {activeTab === "MAL_INGRESADAS" && (
            <table className="min-w-[920px] lg:min-w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-600 text-[10px] font-bold uppercase tracking-wider border-b border-slate-200">
                  <th className="py-2.5 px-3">KEY2</th>
                  <th className="py-2.5 px-3">MOTIVO / DIAGNÓSTICO</th>
                  <th className="py-2.5 px-3">FOLIO</th>
                  <th className="py-2.5 px-3">RUT PROVEEDOR</th>
                  <th className="py-2.5 px-3">PROVEEDOR</th>
                  <th className="py-2.5 px-3 text-right">MONTO SII</th>
                  <th className="py-2.5 px-3 text-right">MONTO FLEXLINE</th>
                  <th className="py-2.5 px-3 text-right">DIFERENCIA ($ CLP)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/80 text-xs">
                {paginatedMalIngresadas.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-10 text-center text-slate-500">
                      No se detectaron inconsistencias ni errores de ingreso para los filtros seleccionados.
                    </td>
                  </tr>
                ) : (
                  paginatedMalIngresadas.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-2 px-3 font-mono font-semibold text-slate-800 whitespace-nowrap">
                        {r.key2}
                      </td>
                      <td className="py-2 px-3 whitespace-nowrap">
                        <span
                          className={cn(
                            "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border",
                            r.motivo === "Diferencia de Monto"
                              ? "bg-amber-50 text-amber-800 border-amber-200"
                              : r.motivo === "Duplicado en Flexline"
                              ? "bg-orange-50 text-[#E05A10] border-orange-200"
                              : "bg-rose-50 text-rose-700 border-rose-200"
                          )}
                        >
                          {r.motivo}
                        </span>
                      </td>
                      <td className="py-2 px-3 font-mono font-semibold text-slate-900">
                        {r.folio}
                      </td>
                      <td className="py-2 px-3 font-mono text-slate-600 whitespace-nowrap">
                        {r.rut_proveedor}
                      </td>
                      <td className="py-2 px-3 font-medium text-slate-800">
                        {r.proveedor}
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-slate-900 whitespace-nowrap">
                        {r.monto_sii !== null ? formatCLP(r.monto_sii) : "-"}
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-semibold text-slate-900 whitespace-nowrap">
                        {formatCLP(r.monto_flexline)}
                      </td>
                      <td
                        className={cn(
                          "py-2 px-3 text-right font-mono font-bold whitespace-nowrap",
                          r.diferencia === 0 ? "text-slate-600" : "text-rose-700"
                        )}
                      >
                        {formatCLP(r.diferencia)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>

        <TablePagination
          totalItems={activeRowsCount}
          currentPage={currentPage}
          pageSize={GLOBAL_PAGE_SIZE}
          onPageChange={setCurrentPage}
        />
      </div>
    </div>
  );
}
