"use client";

import React, { useState, useRef } from "react";
import {
  Calendar,
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  X,
  Loader2,
  FileCheck2,
  AlertCircle,
  HelpCircle,
} from "lucide-react";
import { actualizarFechasVencimientoVentasAction } from "@/actions/facturas-ventas.actions";
import { ActualizacionVencimientoResult } from "@/types/database.types";
import { cn, formatDateCL, formatRutDisplay } from "@/lib/utils";

interface ImportarVencimientosModalProps {
  onSuccess?: () => void;
  isAdmin?: boolean;
}

export function ImportarVencimientosModal({
  onSuccess,
  isAdmin = true,
}: ImportarVencimientosModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [result, setResult] = useState<ActualizacionVencimientoResult | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Si no tiene permisos de administrador, no se muestra el botón ni se permite la interacción
  if (!isAdmin) {
    return null;
  }

  const resetState = () => {
    setSelectedFile(null);
    setIsProcessing(false);
    setErrorMsg(null);
    setResult(null);
    setIsDragging(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    resetState();
  };

  const handleFileChange = (file: File | undefined) => {
    if (!file) return;
    const name = file.name.toLowerCase();
    if (!name.endsWith(".xls") && !name.endsWith(".xlsx")) {
      setErrorMsg("Formato no compatible. Por favor cargue un archivo Excel (.xls o .xlsx).");
      return;
    }
    setErrorMsg(null);
    setSelectedFile(file);
    setResult(null);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    handleFileChange(file);
  };

  const handleProcess = async () => {
    if (!selectedFile) return;
    setIsProcessing(true);
    setErrorMsg(null);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      const res = await actualizarFechasVencimientoVentasAction(formData);
      setResult(res);
      if (onSuccess) {
        onSuccess();
      }
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : "Ocurrió un error inesperado al procesar el archivo Excel."
      );
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <>
      {/* Botón Trigger en Header */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        title="Carga masiva de fechas de vencimiento desde Excel (.xls / .xlsx)"
        className="inline-flex items-center gap-2 rounded-md bg-[#0F172A] border border-slate-700 hover:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-100 shadow-sm transition-colors"
      >
        <Calendar className="h-3.5 w-3.5 text-orange-400" />
        Importar F. Vence
      </button>

      {/* Modal Dialog */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 backdrop-blur-[2px] p-4">
          <div className="bg-white border border-slate-200 rounded-xl shadow-2xl w-[95vw] sm:w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header Corporativo */}
            <div className="px-6 py-4 bg-[#0F172A] text-white flex items-center justify-between border-b border-[#1E293B]">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-orange-500/10 border border-orange-500/30 flex items-center justify-center text-orange-400">
                  <Calendar className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-sm font-bold tracking-tight text-white flex items-center gap-2">
                    Actualizador de Fechas de Vencimiento
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-orange-950/60 text-orange-300 border border-orange-800/60">
                      Excel .xls / .xlsx
                    </span>
                  </h2>
                  <p className="text-[11px] text-slate-400">
                    Mapeo compuesto: RUT Cliente (Col. E) + Folio (Col. C) → Fecha Vencimiento (Col. AA)
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
            <div className="p-6 overflow-y-auto space-y-4 text-xs">
              {/* Notificación de Error */}
              {errorMsg && (
                <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-rose-800 flex items-start gap-2.5">
                  <AlertCircle className="h-4 w-4 text-rose-600 mt-0.5 shrink-0" />
                  <div className="space-y-0.5">
                    <p className="font-semibold text-rose-900">Error en el procesamiento</p>
                    <p className="text-[11px]">{errorMsg}</p>
                  </div>
                </div>
              )}

              {/* Resultado post-procesamiento */}
              {result ? (
                <div className="space-y-4">
                  <div className="flex flex-col items-center justify-center text-center p-4 bg-emerald-50/50 rounded-xl border border-emerald-200">
                    <div className="h-11 w-11 rounded-full bg-emerald-100 border border-emerald-300 flex items-center justify-center text-emerald-600 mb-2">
                      <CheckCircle2 className="h-6 w-6" />
                    </div>
                    <h3 className="text-sm font-bold text-slate-900">
                      Actualización de Vencimientos Finalizada
                    </h3>
                    <p className="text-xs text-slate-600 font-medium mt-0.5">
                      <strong>{result.actualizadasCount}</strong> facturas actualizadas con nueva fecha de vencimiento,{" "}
                      <strong>{result.noEncontradasCount}</strong> documentos no encontrados en cartera.
                    </p>
                  </div>

                  {/* Resumen Métrico */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-3 text-center">
                      <span className="text-[10px] font-semibold text-emerald-800 uppercase tracking-wider block">
                        Actualizadas
                      </span>
                      <span className="text-2xl font-bold font-mono text-emerald-700 my-0.5 block">
                        {result.actualizadasCount}
                      </span>
                      <span className="text-[10px] text-emerald-800">
                        Vencimientos sincronizados en cartera
                      </span>
                    </div>

                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-center">
                      <span className="text-[10px] font-semibold text-slate-600 uppercase tracking-wider block">
                        No Encontradas / Omitidas
                      </span>
                      <span className="text-2xl font-bold font-mono text-slate-700 my-0.5 block">
                        {result.noEncontradasCount}
                      </span>
                      <span className="text-[10px] text-slate-600">
                        Folios no registrados en el sistema
                      </span>
                    </div>
                  </div>

                  {/* Detalle de Documentos */}
                  {result.detalles.length > 0 && (
                    <div className="rounded-lg border border-slate-200 overflow-hidden">
                      <div className="bg-slate-100 px-3 py-2 text-[11px] font-semibold text-slate-700 flex items-center justify-between border-b border-slate-200">
                        <span>DETALLE DE DOCUMENTOS PROCESADOS</span>
                        <span className="font-mono text-[10px] text-slate-500">
                          Total: {result.detalles.length}
                        </span>
                      </div>
                      <div className="max-h-48 overflow-y-auto divide-y divide-slate-100">
                        {result.detalles.map((d, idx) => (
                          <div
                            key={idx}
                            className="px-3 py-2 flex items-center justify-between gap-2 hover:bg-slate-50"
                          >
                            <div className="flex items-center gap-2">
                              <span
                                className={cn(
                                  "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold border",
                                  d.encontrada
                                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                    : "bg-slate-100 text-slate-600 border-slate-200"
                                )}
                              >
                                {d.encontrada ? "✓ Actualizada" : "No Encontrada"}
                              </span>
                              <span className="font-mono font-bold text-slate-900">
                                #{d.folio}
                              </span>
                              <span className="font-mono text-slate-600">
                                {formatRutDisplay(d.rut)}
                              </span>
                              {d.razonSocial && (
                                <span className="text-slate-500 truncate max-w-[200px]">
                                  · {d.razonSocial}
                                </span>
                              )}
                            </div>
                            <div className="font-mono text-slate-800 text-[11px] font-medium shrink-0">
                              Venc: {formatDateCL(d.fechaVencimiento)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* Zona Drag & Drop y Selección */
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
                      "border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-2",
                      isDragging
                        ? "border-[#E05A10] bg-orange-50/50 scale-[0.99]"
                        : selectedFile
                        ? "border-emerald-400 bg-emerald-50/30"
                        : "border-slate-300 bg-slate-50/50 hover:bg-slate-100/70 hover:border-slate-400"
                    )}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".xls,.xlsx"
                      onChange={(e) => handleFileChange(e.target.files?.[0])}
                      className="hidden"
                    />

                    {selectedFile ? (
                      <>
                        <div className="h-12 w-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mb-1">
                          <FileCheck2 className="h-6 w-6" />
                        </div>
                        <p className="font-bold text-slate-900 text-sm">
                          {selectedFile.name}
                        </p>
                        <p className="text-[11px] text-slate-500 font-mono">
                          {(selectedFile.size / 1024).toFixed(1)} KB · Archivo listo para procesar
                        </p>
                        <span className="mt-1 inline-flex items-center text-[10px] text-slate-500 underline hover:text-[#E05A10]">
                          Haga clic para cambiar de archivo
                        </span>
                      </>
                    ) : (
                      <>
                        <div className="h-12 w-12 rounded-full bg-orange-50 text-[#E05A10] flex items-center justify-center mb-1">
                          <Upload className="h-6 w-6" />
                        </div>
                        <p className="font-semibold text-slate-800 text-sm">
                          Haga clic o arrastre su archivo Excel aquí
                        </p>
                        <p className="text-[11px] text-slate-500">
                          Formatos admitidos: <strong>.xls</strong> y <strong>.xlsx</strong> (ej. <em>reporte_102289216.xls</em>)
                        </p>
                      </>
                    )}
                  </div>

                  {/* Tarjeta Informativa de Estructura */}
                  <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 space-y-1.5 text-slate-600">
                    <div className="flex items-center gap-1.5 font-semibold text-slate-800 text-[11px]">
                      <HelpCircle className="h-3.5 w-3.5 text-[#E05A10]" />
                      Estructura requerida de columnas en la primera hoja:
                    </div>
                    <ul className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] font-mono">
                      <li className="bg-white border border-slate-200 rounded px-2 py-1">
                        <strong className="text-slate-800 font-sans">Col C:</strong> Folio
                      </li>
                      <li className="bg-white border border-slate-200 rounded px-2 py-1">
                        <strong className="text-slate-800 font-sans">Col E:</strong> RUT Receptor
                      </li>
                      <li className="bg-white border border-slate-200 rounded px-2 py-1">
                        <strong className="text-slate-800 font-sans">Col AA:</strong> F. Vencimiento
                      </li>
                    </ul>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <button
                type="button"
                onClick={handleClose}
                className="px-3 py-1.5 rounded-md border border-slate-300 text-slate-700 font-medium hover:bg-slate-100 transition-colors"
              >
                {result ? "Cerrar" : "Cancelar"}
              </button>

              {!result && (
                <button
                  type="button"
                  disabled={!selectedFile || isProcessing}
                  onClick={handleProcess}
                  className="inline-flex items-center gap-2 rounded-md bg-[#E05A10] px-4 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-[#C2410C] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Procesando Vencimientos...
                    </>
                  ) : (
                    <>
                      <Calendar className="h-3.5 w-3.5" />
                      Procesar Actualización de Vencimientos
                    </>
                  )}
                </button>
              )}

              {result && (
                <button
                  type="button"
                  onClick={resetState}
                  className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 transition-colors"
                >
                  <Upload className="h-3.5 w-3.5" />
                  Cargar Otro Archivo
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
