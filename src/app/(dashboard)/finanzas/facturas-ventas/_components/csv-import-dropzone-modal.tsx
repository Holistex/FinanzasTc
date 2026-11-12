"use client";

import React, { useState, useRef } from "react";
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  X,
  ArrowRight,
  Download,
  Loader2,
  FileCheck2,
  Ban,
  Calculator,
} from "lucide-react";
import {
  previewSiiCsvAction,
  injectSiiCsvBatchAction,
} from "@/actions/facturas-ventas.actions";
import { generateSampleSiiCsvContent } from "@/services/sii-csv-parser";
import { SiiCsvValidationSummary } from "@/types/database.types";
import {
  cn,
  formatCLP,
  formatDateCL,
  formatRutDisplay,
  getTipoDocLabel,
} from "@/lib/utils";

interface CsvImportDropzoneModalProps {
  onImportSuccess: () => void;
  isAdmin?: boolean;
}

export function CsvImportDropzoneModal({
  onImportSuccess,
  isAdmin = true,
}: CsvImportDropzoneModalProps) {
  if (!isAdmin) {
    return null;
  }
  const [isOpen, setIsOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [csvRawText, setCsvRawText] = useState<string>("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isInjecting, setIsInjecting] = useState(false);
  const [summary, setSummary] = useState<SiiCsvValidationSummary | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [activePreviewTab, setActivePreviewTab] = useState<
    "NUEVOS" | "DUPLICADOS" | "NETEO_NC"
  >("NUEVOS");
  const [injectionResult, setInjectionResult] = useState<{
    insertedCount: number;
    omittedCount: number;
    creditNotesApplied: number;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetModalState = () => {
    setFileName(null);
    setCsvRawText("");
    setSummary(null);
    setErrorMsg(null);
    setIsAnalyzing(false);
    setIsInjecting(false);
    setActivePreviewTab("NUEVOS");
    setInjectionResult(null);
  };

  const handleClose = () => {
    setIsOpen(false);
    resetModalState();
  };

  const processCsvContent = async (text: string, name: string) => {
    setFileName(name);
    setCsvRawText(text);
    setErrorMsg(null);
    setIsAnalyzing(true);
    try {
      const validationResult = await previewSiiCsvAction(text);
      setSummary(validationResult);
      if (
        validationResult.nuevosAInyectar.length === 0 &&
        validationResult.omitidosPorDuplicidad.length > 0
      ) {
        setActivePreviewTab("DUPLICADOS");
      } else {
        setActivePreviewTab("NUEVOS");
      }
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : "Error al analizar el archivo CSV del SII."
      );
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleFileChange = async (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      const content = e.target?.result as string;
      if (content) {
        await processCsvContent(content, file.name);
      }
    };
    reader.readAsText(file, "UTF-8");
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    await handleFileChange(file);
  };

  const handleDownloadSampleCsv = () => {
    const sampleContent = generateSampleSiiCsvContent();
    const blob = new Blob([sampleContent], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "SII_Libro_Ventas_Octubre_2026.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleLoadSampleDirectly = async () => {
    const sampleContent = generateSampleSiiCsvContent();
    await processCsvContent(sampleContent, "SII_Libro_Ventas_Octubre_2026.csv");
  };

  const handleConfirmInjection = async () => {
    if (!csvRawText || !summary || summary.nuevosAInyectar.length === 0) return;
    setIsInjecting(true);
    setErrorMsg(null);
    try {
      const res = await injectSiiCsvBatchAction(csvRawText);
      setInjectionResult(res);
      onImportSuccess();
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : "Error al inyectar registros en la base de datos."
      );
    } finally {
      setIsInjecting(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-2 rounded-md bg-[#E05A10] px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-[#C2410C] transition-colors"
      >
        <Upload className="h-3.5 w-3.5 text-white" />
        Importar CSV SII
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-[2px] p-4">
          <div className="bg-white border border-slate-200 rounded-lg shadow-2xl w-[95vw] sm:w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-[#0F172A] text-white flex items-center justify-between border-b border-[#1E293B]">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-md bg-[#E05A10]/20 border border-[#E05A10]/40 flex items-center justify-center text-[#E05A10]">
                  <FileSpreadsheet className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold tracking-tight">
                    Importador & Validador de Libro de Ventas SII Chile
                  </h2>
                  <p className="text-[11px] text-slate-400">
                    Excluye automáticamente DTE 46 (Compra) · Deduplica (RUT +
                    Folio) y netea Notas de Crédito (61)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleClose}
                className="text-slate-400 hover:text-white p-1 rounded-md transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-5 flex-1">
              {injectionResult ? (
                <div className="space-y-6 py-4 animate-in fade-in duration-200">
                  <div className="flex flex-col items-center justify-center text-center space-y-2">
                    <div className="h-12 w-12 rounded-full bg-emerald-100 border border-emerald-300 flex items-center justify-center text-emerald-600 mb-1">
                      <CheckCircle2 className="h-7 w-7" />
                    </div>
                    <h3 className="text-base font-bold text-[#0F172A]">
                      Importación de Libro de Ventas Finalizada
                    </h3>
                    <p className="text-xs text-slate-500 max-w-md">
                      Los registros han sido procesados y sincronizados en la base de datos con verificación estricta de unicidad (RUT Cliente + Folio).
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 text-center">
                      <span className="text-xs font-semibold text-emerald-800 uppercase tracking-wider block">
                        Nuevos Registros
                      </span>
                      <span className="text-3xl font-extrabold text-emerald-700 font-mono my-1 block">
                        {injectionResult.insertedCount}
                      </span>
                      <span className="text-xs text-emerald-900 font-medium">
                        Registros nuevos importados exitosamente.
                      </span>
                    </div>

                    <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-center">
                      <span className="text-xs font-semibold text-amber-800 uppercase tracking-wider block">
                        Omitidos por Duplicidad
                      </span>
                      <span className="text-3xl font-extrabold text-amber-700 font-mono my-1 block">
                        {injectionResult.omittedCount}
                      </span>
                      <span className="text-xs text-amber-900 font-medium">
                        Registros omitidos por ya existir previamente en la plataforma.
                      </span>
                    </div>
                  </div>

                  {injectionResult.creditNotesApplied > 0 && (
                    <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-xs text-blue-800 flex items-center gap-2.5">
                      <FileCheck2 className="h-4 w-4 text-blue-600 shrink-0" />
                      <span>
                        Se aplicó neteo y actualización automática de saldo para{" "}
                        <strong>{injectionResult.creditNotesApplied}</strong> factura(s) mediante Notas de Crédito (DTE 61).
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  {!summary && (
                    <div className="space-y-4">
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDragging(true);
                    }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={cn(
                      "cursor-pointer border-2 border-dashed rounded-lg p-8 text-center transition-all",
                      isDragging
                        ? "border-[#E05A10] bg-orange-50/50"
                        : "border-slate-300 hover:border-[#E05A10] bg-[#F8FAFC]"
                    )}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv,.txt"
                      className="hidden"
                      onChange={(e) => handleFileChange(e.target.files?.[0])}
                    />
                    <div className="mx-auto h-12 w-12 rounded-full bg-orange-50 border border-orange-200 flex items-center justify-center text-[#E05A10] mb-3">
                      {isAnalyzing ? (
                        <Loader2 className="h-6 w-6 animate-spin text-[#E05A10]" />
                      ) : (
                        <Upload className="h-6 w-6 text-[#E05A10]" />
                      )}
                    </div>
                    <p className="text-sm font-semibold text-[#0F172A]">
                      {isAnalyzing
                        ? "Analizando estructura SII y filtrando documentos..."
                        : "Arrastre y suelte su archivo CSV del SII aquí, o haga clic para seleccionar"}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      Soporta formato oficial SII (delimitado por{" "}
                      <code className="font-mono bg-slate-200/70 px-1 rounded">
                        ;
                      </code>{" "}
                      o coma) · Descarta automáticamente Facturas de Compra (DTE
                      46)
                    </p>
                  </div>

                  {/* Quick Test / Sample File Bar */}
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-[#F1F5F9] border border-slate-200 px-4 py-3">
                    <div className="text-xs text-slate-600">
                      <span className="font-semibold text-[#0F172A]">
                        ¿Desea probar la validación y exclusión de DTE 46?
                      </span>{" "}
                      Cargue o descargue el CSV SII de ejemplo.
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleDownloadSampleCsv}
                        className="inline-flex items-center gap-1.5 rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        <Download className="h-3.5 w-3.5" />
                        Descargar CSV Ejemplo
                      </button>
                      <button
                        type="button"
                        onClick={handleLoadSampleDirectly}
                        className="inline-flex items-center gap-1.5 rounded bg-[#E05A10] px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-[#C2410C]"
                      >
                        <FileCheck2 className="h-3.5 w-3.5" />
                        Simular Carga SII Ahora
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {errorMsg && (
                <div className="rounded-md bg-rose-50 border border-rose-200 p-3.5 flex items-start gap-2.5 text-xs text-rose-800">
                  <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold">Error de validación: </span>
                    {errorMsg}
                  </div>
                </div>
              )}

              {/* Validation & Pre-Insertion Summary */}
              {summary && (
                <div className="space-y-5">
                  <div className="flex items-center justify-between bg-[#F1F5F9] border border-slate-200 rounded-md px-4 py-2.5">
                    <div className="flex items-center gap-2.5 text-xs">
                      <FileSpreadsheet className="h-4 w-4 text-[#E05A10]" />
                      <span className="font-semibold text-[#0F172A]">
                        Archivo analizado:
                      </span>
                      <span className="font-mono text-slate-700 bg-white px-2 py-0.5 rounded border border-slate-200">
                        {fileName}
                      </span>
                      <span className="text-slate-500">
                        ({summary.totalFilasLeidas} filas leídas · DTE 46
                        excluidos automáticamente)
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={resetModalState}
                      className="text-xs font-medium text-[#E05A10] hover:underline"
                    >
                      Cambiar archivo
                    </button>
                  </div>

                  {/* 3 Key Metrics Banner */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div
                      onClick={() => setActivePreviewTab("NUEVOS")}
                      className={cn(
                        "cursor-pointer rounded-lg border p-3.5 transition-all",
                        activePreviewTab === "NUEVOS"
                          ? "border-[#E05A10] bg-orange-50/40 ring-1 ring-[#E05A10]"
                          : "border-slate-200 bg-white hover:bg-[#F8FAFC]"
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-[#0F172A]">
                          Registros Nuevos a Inyectar
                        </span>
                        <CheckCircle2 className="h-4 w-4 text-[#E05A10]" />
                      </div>
                      <div className="mt-1.5 flex items-baseline gap-2">
                        <span className="text-2xl font-bold tabular-nums text-[#E05A10]">
                          {summary.nuevosAInyectar.length}
                        </span>
                        <span className="text-xs text-slate-600">
                          documentos válidos
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1">
                        Llave única (RUT + Folio) verificada sin colisión
                      </p>
                    </div>

                    <div
                      onClick={() => setActivePreviewTab("DUPLICADOS")}
                      className={cn(
                        "cursor-pointer rounded-lg border p-3.5 transition-all",
                        activePreviewTab === "DUPLICADOS"
                          ? "border-slate-700 bg-[#F1F5F9] ring-1 ring-slate-700"
                          : "border-slate-200 bg-white hover:bg-[#F8FAFC]"
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-700">
                          Omitidos por Duplicidad
                        </span>
                        <Ban className="h-4 w-4 text-slate-600" />
                      </div>
                      <div className="mt-1.5 flex items-baseline gap-2">
                        <span className="text-2xl font-bold tabular-nums text-slate-800">
                          {summary.omitidosPorDuplicidad.length}
                        </span>
                        <span className="text-xs text-slate-600">
                          registros excluidos
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1">
                        Ya existen en BD con igual (rut_cliente, folio)
                      </p>
                    </div>

                    <div
                      onClick={() => setActivePreviewTab("NETEO_NC")}
                      className={cn(
                        "cursor-pointer rounded-lg border p-3.5 transition-all",
                        activePreviewTab === "NETEO_NC"
                          ? "border-rose-500 bg-rose-50/40 ring-1 ring-rose-500"
                          : "border-slate-200 bg-white hover:bg-[#F8FAFC]"
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-rose-900">
                          Neteo Notas de Crédito (61)
                        </span>
                        <Calculator className="h-4 w-4 text-rose-600" />
                      </div>
                      <div className="mt-1.5 flex items-baseline gap-2">
                        <span className="text-2xl font-bold tabular-nums text-rose-700">
                          {summary.neteoNotasCredito.length}
                        </span>
                        <span className="text-xs text-rose-700/80">
                          cruces de referencia
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1">
                        Rebaja automática sobre factura origen referenciada
                      </p>
                    </div>
                  </div>

                  {/* Preview Table Depending on Active Tab */}
                  <div className="border border-slate-200 rounded-md overflow-hidden">
                    {activePreviewTab === "NUEVOS" && (
                      <div className="max-h-64 overflow-y-auto">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead className="bg-[#0F172A] text-slate-200 text-[10px] font-semibold uppercase sticky top-0">
                            <tr>
                              <th className="py-2 px-3">Folio / DTE</th>
                              <th className="py-2 px-3">RUT Cliente</th>
                              <th className="py-2 px-3">Razón Social</th>
                              <th className="py-2 px-3">Fecha</th>
                              <th className="py-2 px-3 text-right">
                                Monto Total
                              </th>
                              <th className="py-2 px-3 text-right">
                                Saldo Neto Resultante
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200">
                            {summary.nuevosAInyectar.length === 0 ? (
                              <tr>
                                <td
                                  colSpan={6}
                                  className="py-6 text-center text-slate-500"
                                >
                                  No hay registros nuevos para inyectar en este
                                  archivo.
                                </td>
                              </tr>
                            ) : (
                              summary.nuevosAInyectar.map((item) => {
                                const docMeta = getTipoDocLabel(item.tipo_doc);
                                return (
                                  <tr
                                    key={`${item.rut_cliente}-${item.folio}`}
                                    className="hover:bg-[#F8FAFC]"
                                  >
                                    <td className="py-2 px-3 font-mono">
                                      <span className="font-bold text-[#0F172A] mr-1.5">
                                        #{item.folio}
                                      </span>
                                      <span
                                        className={cn(
                                          "inline-flex items-center px-1.5 py-0 rounded text-[10px] font-semibold border",
                                          docMeta.variant === "emerald"
                                            ? "bg-[#F8FAFC] text-[#0F172A] border-emerald-500/60"
                                            : "bg-rose-50 text-rose-800 border-rose-200"
                                        )}
                                      >
                                        {docMeta.shortName}
                                      </span>
                                    </td>
                                    <td className="py-2 px-3 font-mono text-slate-800">
                                      {formatRutDisplay(item.rut_cliente)}
                                    </td>
                                    <td className="py-2 px-3 truncate max-w-[200px] text-slate-700">
                                      {item.razon_social}
                                    </td>
                                    <td className="py-2 px-3 font-mono text-slate-600">
                                      {formatDateCL(item.fecha_docto)}
                                    </td>
                                    <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-700">
                                      {formatCLP(item.monto_total)}
                                    </td>
                                    <td className="py-2 px-3 text-right font-mono tabular-nums font-semibold text-[#0F172A]">
                                      {formatCLP(item.monto_neto_saldo)}
                                    </td>
                                  </tr>
                                );
                              })
                            )}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {activePreviewTab === "DUPLICADOS" && (
                      <div className="max-h-64 overflow-y-auto">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead className="bg-[#0F172A] text-slate-200 text-[10px] font-semibold uppercase sticky top-0">
                            <tr>
                              <th className="py-2 px-3">RUT Cliente</th>
                              <th className="py-2 px-3">Folio</th>
                              <th className="py-2 px-3">Razón Social</th>
                              <th className="py-2 px-3 text-right">
                                Monto Total
                              </th>
                              <th className="py-2 px-3">Motivo de Exclusión</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200">
                            {summary.omitidosPorDuplicidad.length === 0 ? (
                              <tr>
                                <td
                                  colSpan={5}
                                  className="py-6 text-center text-slate-500"
                                >
                                  No se detectaron registros duplicados.
                                </td>
                              </tr>
                            ) : (
                              summary.omitidosPorDuplicidad.map((dup, idx) => (
                                <tr
                                  key={`${dup.rut_cliente}-${dup.folio}-${idx}`}
                                  className="bg-[#F8FAFC]"
                                >
                                  <td className="py-2 px-3 font-mono text-slate-800">
                                    {formatRutDisplay(dup.rut_cliente)}
                                  </td>
                                  <td className="py-2 px-3 font-mono font-semibold text-[#0F172A]">
                                    #{dup.folio}
                                  </td>
                                  <td className="py-2 px-3 text-slate-700">
                                    {dup.razon_social}
                                  </td>
                                  <td className="py-2 px-3 text-right font-mono tabular-nums">
                                    {formatCLP(dup.monto_total)}
                                  </td>
                                  <td className="py-2 px-3">
                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-200 text-slate-800">
                                      {dup.motivo === "EXISTE_EN_BD"
                                        ? "Ya registrado en Base de Datos"
                                        : "Repetido dentro del archivo CSV"}
                                    </span>
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {activePreviewTab === "NETEO_NC" && (
                      <div className="max-h-64 overflow-y-auto">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead className="bg-[#0F172A] text-slate-200 text-[10px] font-semibold uppercase sticky top-0">
                            <tr>
                              <th className="py-2 px-3">NC 61 Folio</th>
                              <th className="py-2 px-3">RUT Cliente</th>
                              <th className="py-2 px-3">
                                Factura Origen Referenciada
                              </th>
                              <th className="py-2 px-3 text-right">
                                Saldo Anterior
                              </th>
                              <th className="py-2 px-3 text-right">
                                Rebaja NC (61)
                              </th>
                              <th className="py-2 px-3 text-right">
                                Nuevo Saldo Neto
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200">
                            {summary.neteoNotasCredito.length === 0 ? (
                              <tr>
                                <td
                                  colSpan={6}
                                  className="py-6 text-center text-slate-500"
                                >
                                  No hay Notas de Crédito (Tipo 61) en este lote.
                                </td>
                              </tr>
                            ) : (
                              summary.neteoNotasCredito.map((nc) => (
                                <tr
                                  key={nc.nc_folio}
                                  className="hover:bg-[#F8FAFC]"
                                >
                                  <td className="py-2 px-3 font-mono font-semibold text-rose-800">
                                    NC #{nc.nc_folio}
                                  </td>
                                  <td className="py-2 px-3 font-mono text-slate-700">
                                    {formatRutDisplay(nc.rut_cliente)}
                                  </td>
                                  <td className="py-2 px-3">
                                    <span className="font-mono font-semibold text-[#0F172A]">
                                      FAC #{nc.factura_origen_folio}
                                    </span>{" "}
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#F1F5F9] text-slate-600 border border-slate-200 ml-1">
                                      {nc.origen_ubicacion === "EN_ARCHIVO_CSV"
                                        ? "En este CSV"
                                        : nc.origen_ubicacion ===
                                          "EN_BASE_DE_DATOS"
                                        ? "En Base de Datos"
                                        : "Sin Factura Origen"}
                                    </span>
                                  </td>
                                  <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-600">
                                    {nc.saldo_anterior !== null
                                      ? formatCLP(nc.saldo_anterior)
                                      : "-"}
                                  </td>
                                  <td className="py-2 px-3 text-right font-mono tabular-nums text-rose-700 font-medium">
                                    - {formatCLP(nc.monto_nc)}
                                  </td>
                                  <td className="py-2 px-3 text-right font-mono tabular-nums font-bold text-[#E05A10]">
                                    {nc.nuevo_saldo_neto !== null
                                      ? formatCLP(nc.nuevo_saldo_neto)
                                      : "Sin cruce"}
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 bg-[#F8FAFC] border-t border-slate-200 flex items-center justify-between">
          {injectionResult ? (
            <>
              <div className="text-xs text-slate-500">
                Sincronización masiva de ventas finalizada con integridad referencial garantizada.
              </div>
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={resetModalState}
                  className="rounded-md border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-[#F1F5F9]"
                >
                  Cargar otro archivo
                </button>
                <button
                  type="button"
                  onClick={handleClose}
                  className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 transition-colors"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Finalizar
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="text-xs text-slate-500">
                {summary ? (
                  <span>
                    Resumen listo:{" "}
                    <strong className="text-[#0F172A]">
                      {summary.nuevosAInyectar.length} registros nuevos a
                      inyectar
                    </strong>
                    ,{" "}
                    <strong className="text-[#0F172A]">
                      {summary.omitidosPorDuplicidad.length} registros omitidos
                      por duplicidad
                    </strong>
                    .
                  </span>
                ) : (
                  <span>
                    Validación de integridad referencial antes de commit en
                    base de datos.
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={handleClose}
                  className="rounded-md border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-[#F1F5F9]"
                >
                  Cancelar
                </button>
                {summary && (
                  <button
                    type="button"
                    disabled={
                      summary.nuevosAInyectar.length === 0 || isInjecting
                    }
                    onClick={handleConfirmInjection}
                    className="inline-flex items-center gap-1.5 rounded-md bg-[#E05A10] px-4 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-[#C2410C] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {isInjecting ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Inyectando en Base de Datos...
                      </>
                    ) : (
                      <>
                        Confirmar e Inyectar ({summary.nuevosAInyectar.length}{" "}
                        Registros)
                        <ArrowRight className="h-3.5 w-3.5" />
                      </>
                    )}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
          </div>
        </div>
      )}
    </>
  );
}
