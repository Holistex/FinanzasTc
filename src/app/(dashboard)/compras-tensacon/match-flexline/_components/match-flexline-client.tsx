"use client";

import React, { useState, useMemo, useRef, useTransition, useEffect } from "react";
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
  Trash2,
} from "lucide-react";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
import {
  TablePagination,
  GLOBAL_PAGE_SIZE,
  paginateArray,
} from "@/components/ui/TablePagination";
import {
  FlexlineImportRow,
  MatchFlexlineResponse,
  getExistingFlexlineKeysAction,
  getMatchFlexlineDataAction,
  importarMatchFlexlineChunkAction,
  vaciarMatchFlexlineAction,
} from "@/actions/match-flexline.actions";
import {
  buildCanonicalCompraKey,
  normalizeFolio,
  normalizeKey2ToCanonical,
  normalizeRut,
  parseExcelAmount,
  parseExcelDate,
} from "@/lib/match-flexline-utils";
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
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [data, setData] = useState<MatchFlexlineResponse>(initialData);

  useEffect(() => {
    setData(initialData);
  }, [initialData]);

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
    return data.faltantes.filter((r) => {
      if (periodoFilter !== "TODOS" && r.periodo !== periodoFilter) return false;
      if (q) {
        const hay = normalizeQuery(
          `${r.key} ${r.folio} ${r.rut_proveedor} ${r.razon_social}`
        );
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [data.faltantes, search, periodoFilter]);

  const filteredCorrectas = useMemo(() => {
    const q = normalizeQuery(search);
    return data.correctas.filter((r) => {
      if (periodoFilter !== "TODOS" && r.periodo !== periodoFilter) return false;
      if (q) {
        const hay = normalizeQuery(
          `${r.key} ${r.folio} ${r.rut_proveedor} ${r.razon_social}`
        );
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [data.correctas, search, periodoFilter]);

  const filteredMalIngresadas = useMemo(() => {
    const q = normalizeQuery(search);
    return data.malIngresadas.filter((r) => {
      if (periodoFilter !== "TODOS" && r.periodo !== periodoFilter) return false;
      if (q) {
        const hay = normalizeQuery(
          `${r.key2} ${r.folio} ${r.rut_proveedor} ${r.proveedor} ${r.motivo}`
        );
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [data.malIngresadas, search, periodoFilter]);

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
    setUploadProgress("Leyendo archivo Excel...");

    startUploadTransition(async () => {
      try {
        const fileName = file.name.toLowerCase();
        if (!fileName.endsWith(".xlsx") && !fileName.endsWith(".xls")) {
          setFeedback({
            type: "error",
            message: "Formato inválido. Solo se aceptan archivos .xlsx o .xls.",
          });
          return;
        }

        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: "array" });

        const targetSheetName = workbook.SheetNames.includes("Hoja1")
          ? "Hoja1"
          : workbook.SheetNames[0];

        if (!targetSheetName) {
          setFeedback({
            type: "error",
            message: "El archivo Excel no contiene hojas legibles.",
          });
          return;
        }

        const sheet = workbook.Sheets[targetSheetName];
        const rawRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
          header: 1,
          raw: true,
          defval: "",
        });

        setUploadProgress("Consultando registros existentes...");
        const existingRes = await getExistingFlexlineKeysAction();
        if (!existingRes.success) {
          setFeedback({
            type: "error",
            message:
              existingRes.error ||
              "No se pudieron verificar los registros existentes en la base de datos.",
          });
          return;
        }

        const llavesEnBase = new Set<string>(existingRes.keys || []);
        const llavesEnMismoArchivo = new Set<string>();

        const ahoraIso = new Date().toISOString();
        const nuevosRegistrosParaInsertar: FlexlineImportRow[] = [];
        let omitidosPorExistirEnBase = 0;
        let omitidosDuplicadosEnArchivo = 0;
        let totalFilasValidas = 0;

        for (let i = 0; i < rawRows.length; i++) {
          const row = rawRows[i];
          if (!Array.isArray(row) || row.length === 0) continue;

          const rawDocumento = String(row[0] ?? "").trim();
          const rawRut = String(row[1] ?? "").trim();
          const rawProveedor = String(row[2] ?? "").trim();
          const rawNumDoc = String(row[3] ?? "").trim();
          const rawFechaEmision = row[4];
          const rawTotalG = row[6];
          const rawFechaVence = row[9];
          const rawObservacion = String(row[10] ?? "").trim();
          const rawPeriodoLibro = String(row[11] ?? "").trim();
          const rawTotalP = row[15];
          const rawDocCorto = String(row[17] ?? "").trim();
          const rawKey2 = String(row[18] ?? "").trim();

          if (
            i === 0 &&
            (rawKey2.toUpperCase() === "KEY2" ||
              rawRut.toUpperCase() === "RUT" ||
              rawDocumento.toUpperCase() === "DOCUMENTO")
          ) {
            continue;
          }

          const folioLimpio = normalizeFolio(rawDocCorto || rawNumDoc);
          const rutLimpio = normalizeRut(rawRut);
          const canonicalKey =
            buildCanonicalCompraKey(rutLimpio, folioLimpio) ||
            normalizeKey2ToCanonical(rawKey2);

          if (!canonicalKey || (!rutLimpio && !rawKey2)) {
            continue;
          }

          totalFilasValidas++;

          if (llavesEnBase.has(canonicalKey)) {
            omitidosPorExistirEnBase++;
            continue;
          }
          if (llavesEnMismoArchivo.has(canonicalKey)) {
            omitidosDuplicadosEnArchivo++;
            continue;
          }
          llavesEnMismoArchivo.add(canonicalKey);

          const montoG = parseExcelAmount(rawTotalG);
          const montoP = parseExcelAmount(rawTotalP);
          const montoFinal = montoG !== 0 ? montoG : montoP;

          nuevosRegistrosParaInsertar.push({
            key2_original: rawKey2 || canonicalKey,
            key2_normalizada: canonicalKey,
            documento_flexline: rawDocumento,
            rut_proveedor: rutLimpio,
            nombre_proveedor: rawProveedor,
            folio_flexline: folioLimpio,
            fecha_emision: parseExcelDate(rawFechaEmision),
            fecha_vencimiento: parseExcelDate(rawFechaVence),
            monto_total: montoFinal,
            periodo_libro: rawPeriodoLibro,
            observacion: rawObservacion,
            es_duplicado_excel: false,
            fecha_carga: ahoraIso,
          });
        }

        if (totalFilasValidas === 0) {
          setFeedback({
            type: "error",
            message:
              "No se encontraron filas válidas con RUT + Folio o Columna S (KEY2) en el archivo.",
          });
          return;
        }

        if (nuevosRegistrosParaInsertar.length > 0) {
          const CHUNK_SIZE = 1000;
          const totalChunks = Math.ceil(
            nuevosRegistrosParaInsertar.length / CHUNK_SIZE
          );

          for (let c = 0; c < totalChunks; c++) {
            setUploadProgress(`Guardando lote ${c + 1} de ${totalChunks}...`);
            const chunk = nuevosRegistrosParaInsertar.slice(
              c * CHUNK_SIZE,
              (c + 1) * CHUNK_SIZE
            );
            const res = await importarMatchFlexlineChunkAction(chunk, {
              isFinalChunk: c === totalChunks - 1,
            });

            if (!res.success) {
              setFeedback({
                type: "error",
                message:
                  res.error ||
                  `Error guardando el lote ${c + 1} de ${totalChunks} en base de datos.`,
              });
              return;
            }
          }

          setUploadProgress("Actualizando conciliación...");
          const refreshed = await getMatchFlexlineDataAction();
          setData(refreshed);
          setCurrentPage(1);
          router.refresh();
        }

        setFeedback({
          type: "success",
          message: `Carga incremental completada: ${nuevosRegistrosParaInsertar.length.toLocaleString(
            "es-CL"
          )} registros nuevos integrados · ${omitidosPorExistirEnBase.toLocaleString(
            "es-CL"
          )} omitidos (ya existían en la base de datos)${
            omitidosDuplicadosEnArchivo > 0
              ? ` · ${omitidosDuplicadosEnArchivo.toLocaleString("es-CL")} duplicados en el archivo`
              : ""
          }.`,
        });
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "Error inesperado al procesar o subir el archivo Excel.";
        setFeedback({ type: "error", message });
      } finally {
        setUploadProgress(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    });
  };

  const handleVaciarBase = () => {
    const confirmed = window.confirm(
      "¿Está seguro de vaciar toda la base de datos de Flexline para comenzar una auditoría desde cero? Esta acción no se puede deshacer."
    );
    if (!confirmed) return;

    setFeedback(null);
    setUploadProgress("Vaciando base Flexline...");
    startUploadTransition(async () => {
      try {
        const res = await vaciarMatchFlexlineAction();
        if (!res.success) {
          setFeedback({
            type: "error",
            message: res.error || "No se pudo vaciar la base de datos Flexline.",
          });
          return;
        }
        const refreshed = await getMatchFlexlineDataAction();
        setData(refreshed);
        setCurrentPage(1);
        router.refresh();
        setFeedback({
          type: "success",
          message: "Base de datos Flexline vaciada correctamente.",
        });
      } catch (err) {
        setFeedback({
          type: "error",
          message:
            err instanceof Error
              ? err.message
              : "Error inesperado al vaciar Flexline.",
        });
      } finally {
        setUploadProgress(null);
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
              {data.totalFlexlineRows > 0 && (
                <span className="px-2 py-0.5 text-[10px] font-mono font-semibold rounded bg-slate-100 text-slate-600 border border-slate-200">
                  {data.totalFlexlineRows.toLocaleString("es-CL")} filas Flexline
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500">
              COMPRAS TENSACON — Auditoría y cruce automático entre Registro de Compras SII y libro Flexline
              {data.ultimaCarga && (
                <span className="ml-2 text-slate-400">
                  · Última carga:{" "}
                  {new Date(data.ultimaCarga).toLocaleString("es-CL")}
                </span>
              )}
            </p>
          </div>
        </div>

        {esAdministrador && (
          <div className="flex flex-wrap items-center gap-2 shrink-0">
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
                {isUploading
                  ? uploadProgress || "Procesando Excel..."
                  : "Importar Excel Flexline"}
              </span>
            </button>
            <button
              type="button"
              disabled={isUploading || data.totalFlexlineRows === 0}
              onClick={handleVaciarBase}
              className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50 transition-colors"
              title="Vaciar registros Flexline para reiniciar auditoría desde cero"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Vaciar Base Flexline</span>
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
              {data.kpis.totalDocumentosSii.toLocaleString("es-CL")} docs
            </span>
          </div>
          <div className="text-lg font-black text-slate-900 font-mono tabular-nums mt-1.5">
            {formatCLP(data.kpis.totalMontoSii)}
          </div>
        </div>

        <div className="bg-white border border-slate-200 border-l-4 border-l-[#E05A10] rounded-xl p-3.5 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              FALTAN POR INGRESAR
            </span>
            <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-orange-50 text-[#E05A10] border border-orange-200">
              {data.kpis.faltanPorIngresarCount.toLocaleString("es-CL")} docs
            </span>
          </div>
          <div className="text-lg font-black text-[#E05A10] font-mono tabular-nums mt-1.5">
            {formatCLP(data.kpis.faltanPorIngresarMonto)}
          </div>
        </div>

        <div className="bg-white border border-slate-200 border-l-4 border-l-emerald-500 rounded-xl p-3.5 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              INGRESADAS CORRECTAMENTE
            </span>
            <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
              {data.kpis.ingresadasCorrectamenteCount.toLocaleString("es-CL")} docs
            </span>
          </div>
          <div className="text-lg font-black text-emerald-700 font-mono tabular-nums mt-1.5">
            {formatCLP(data.kpis.ingresadasCorrectamenteMonto)}
          </div>
        </div>

        <div className="bg-white border border-slate-200 border-l-4 border-l-rose-500 rounded-xl p-3.5 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              MAL INGRESADAS / OBSERVADAS
            </span>
            <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-rose-50 text-rose-700 border border-rose-200">
              {data.kpis.malIngresadasCount.toLocaleString("es-CL")} obs
            </span>
          </div>
          <div className="text-lg font-black text-rose-700 font-mono tabular-nums mt-1.5">
            {formatCLP(data.kpis.malIngresadasDiferenciaMonto)}
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
              {data.periodosDisponibles.map((p) => (
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
            <table className="min-w-[860px] lg:min-w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-600 text-[10px] font-bold uppercase tracking-wider border-b border-slate-200">
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
                    <td colSpan={8} className="py-10 text-center text-slate-500">
                      No hay documentos pendientes por ingresar a Flexline para los filtros seleccionados.
                    </td>
                  </tr>
                ) : (
                  paginatedFaltantes.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50/80 transition-colors">
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
            <table className="min-w-[900px] lg:min-w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-600 text-[10px] font-bold uppercase tracking-wider border-b border-slate-200">
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
                    <td colSpan={9} className="py-10 text-center text-slate-500">
                      {data.totalFlexlineRows === 0
                        ? "Aún no se ha importado una planilla Excel de Flexline."
                        : "No hay documentos conciliados para los filtros seleccionados."}
                    </td>
                  </tr>
                ) : (
                  paginatedCorrectas.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50/80 transition-colors">
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
            <table className="min-w-[860px] lg:min-w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-600 text-[10px] font-bold uppercase tracking-wider border-b border-slate-200">
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
                    <td colSpan={7} className="py-10 text-center text-slate-500">
                      No se detectaron inconsistencias ni errores de ingreso para los filtros seleccionados.
                    </td>
                  </tr>
                ) : (
                  paginatedMalIngresadas.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50/80 transition-colors">
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
