"use client";

import React, { useState, useTransition, useRef } from "react";
import {
  UploadCloud,
  FileSpreadsheet,
  AlertTriangle,
  CheckCircle2,
  X,
  Loader2,
  AlertCircle,
  FileText,
  Calendar,
} from "lucide-react";
import { SiiComprasValidationSummary } from "@/services/sii-compras-csv-parser";
import { importarComprasCsvAction } from "@/actions/facturas-compras.actions";
import { formatCLP, formatRutDisplay } from "@/lib/utils";

const MESES_OPCIONES = [
  { value: "01", label: "Enero" },
  { value: "02", label: "Febrero" },
  { value: "03", label: "Marzo" },
  { value: "04", label: "Abril" },
  { value: "05", label: "Mayo" },
  { value: "06", label: "Junio" },
  { value: "07", label: "Julio" },
  { value: "08", label: "Agosto" },
  { value: "09", label: "Septiembre" },
  { value: "10", label: "Octubre" },
  { value: "11", label: "Noviembre" },
  { value: "12", label: "Diciembre" },
];

const ANIOS_OPCIONES = ["2025", "2026", "2027"];

interface CsvImportComprasModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportSuccess: () => void;
}

export function CsvImportComprasModal({
  isOpen,
  onClose,
  onImportSuccess,
}: CsvImportComprasModalProps) {
  const now = new Date();
  const defaultMes = String(now.getMonth() + 1).padStart(2, "0");
  const defaultAnio = ANIOS_OPCIONES.includes(String(now.getFullYear()))
    ? String(now.getFullYear())
    : "2026";

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [selectedMes, setSelectedMes] = useState<string>(defaultMes);
  const [selectedAnio, setSelectedAnio] = useState<string>(defaultAnio);
  const [autoDetectedPeriodo, setAutoDetectedPeriodo] = useState<string | null>(null);
  const [summary, setSummary] = useState<SiiComprasValidationSummary | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleReset = () => {
    setSelectedFile(null);
    setFileContent(null);
    setAutoDetectedPeriodo(null);
    setSummary(null);
    setErrorMessage(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".csv")) {
      setErrorMessage("Por favor seleccione un archivo en formato .CSV");
      return;
    }

    setSelectedFile(file);
    setErrorMessage(null);
    setSummary(null);

    // Autodetección inteligente de _YYYYMM en el nombre del archivo (ej. RCV_COMPRA_REGISTRO_99510510-1_202609.csv)
    const periodMatch = file.name.match(/_(\d{4})(0[1-9]|1[0-2])(?:[._-]|$)/);
    if (periodMatch) {
      const detectedAnio = periodMatch[1];
      const detectedMes = periodMatch[2];
      if (ANIOS_OPCIONES.includes(detectedAnio)) {
        setSelectedAnio(detectedAnio);
      }
      setSelectedMes(detectedMes);
      setAutoDetectedPeriodo(`${detectedAnio}-${detectedMes}`);
    } else {
      setAutoDetectedPeriodo(null);
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const buffer = event.target?.result as ArrayBuffer;
      if (!buffer) return;

      let content = "";
      try {
        // 1. Probar decodificación UTF-8 estricta
        const utf8Decoder = new TextDecoder("utf-8", { fatal: true });
        content = utf8Decoder.decode(buffer);
      } catch {
        // 2. Si contiene bytes no-UTF8, decodificar con Windows-1252 / ISO-8859-1 oficial de SII Chile
        const winDecoder = new TextDecoder("windows-1252");
        content = winDecoder.decode(buffer);
      }
      setFileContent(content);
    };
    reader.onerror = () => {
      setErrorMessage("Error al leer el archivo en el navegador.");
    };
    reader.readAsArrayBuffer(file);
  };

  const handleProcessImport = () => {
    if (!fileContent) return;
    setErrorMessage(null);
    const periodoLibro = `${selectedAnio}-${selectedMes}`;

    startTransition(async () => {
      try {
        const result = await importarComprasCsvAction(fileContent, periodoLibro);
        setSummary(result);
        if (result.nuevasAInyectar.length > 0 || result.omitidasPorDuplicidad.length > 0) {
          onImportSuccess();
        }
      } catch (err: unknown) {
        setErrorMessage(
          err instanceof Error
            ? err.message
            : "Error procesando el archivo CSV de compras."
        );
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="relative w-[95vw] sm:w-full max-w-2xl max-h-[92vh] flex flex-col rounded-xl bg-white shadow-2xl border border-slate-200 overflow-hidden text-slate-800">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-[#E05A10] flex items-center justify-center text-white shadow-sm">
              <UploadCloud className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-[#0F172A]">
                Carga de Registro de Compras SII
              </h2>
              <p className="text-[11px] text-slate-500">
                Importación y validación de archivo RCV_COMPRA_REGISTRO_*.csv
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto px-5 py-4 space-y-4 max-h-[calc(92vh-120px)] text-xs">
          {/* Instructions Box */}
          <div className="rounded-lg border border-orange-200 bg-orange-50/60 p-3 text-slate-700 space-y-1">
            <div className="font-bold text-[#E05A10] flex items-center gap-1.5">
              <FileSpreadsheet className="h-3.5 w-3.5" />
              <span>Reglas de Procesamiento de Compras SII:</span>
            </div>
            <ul className="list-disc list-inside space-y-0.5 text-[11px] text-slate-600 pl-1">
              <li>
                <strong>Descarte automático:</strong> Filas sin valor numérico en la columna <em>Nro</em> (A).
              </li>
              <li>
                <strong>Llave única compuesta:</strong> <em>RUT Proveedor</em> (D) + <em>Folio</em> (F) para evitar duplicidad.
              </li>
              <li>
                <strong>Vencimiento:</strong> Asigna por defecto 30 días a partir de la <em>Fecha Docto</em> (G).
              </li>
              <li>
                <strong>Notas de Crédito (DTE 61):</strong> Resaltadas en rojo / terracota para diferenciación inmediata.
              </li>
            </ul>
          </div>

          {/* Upload Dropzone */}
          {!summary && (
            <div className="space-y-3">
              <label
                htmlFor="compras-csv-input"
                className="flex flex-col items-center justify-center w-full h-36 border-2 border-dashed border-slate-300 rounded-lg cursor-pointer bg-slate-50 hover:bg-slate-100 hover:border-[#E05A10] transition-colors"
              >
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <UploadCloud className="w-8 h-8 text-slate-400 mb-2" />
                  <p className="text-xs font-semibold text-slate-700">
                    {selectedFile
                      ? selectedFile.name
                      : "Haga clic o arrastre el archivo CSV de Compras aquí"}
                  </p>
                  <p className="text-[10px] text-slate-500 mt-1">
                    RCV_COMPRA_REGISTRO_*.csv (del SII)
                  </p>
                </div>
                <input
                  id="compras-csv-input"
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>

              {/* Selector de Período Tributario del Libro SII */}
              <div className="rounded-lg border border-slate-200 bg-slate-50/90 p-3.5 space-y-2.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                    <Calendar className="h-3.5 w-3.5 text-[#E05A10]" />
                    Período Tributario del Libro SII
                  </label>
                  {autoDetectedPeriodo && (
                    <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 border border-emerald-200">
                      Autodetectado del archivo ({autoDetectedPeriodo})
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label
                      htmlFor="compras-periodo-mes"
                      className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1"
                    >
                      Mes del Libro
                    </label>
                    <select
                      id="compras-periodo-mes"
                      value={selectedMes}
                      onChange={(e) => {
                        setSelectedMes(e.target.value);
                        setAutoDetectedPeriodo(null);
                      }}
                      className="w-full h-9 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-800 focus:border-[#E05A10] focus:outline-none focus:ring-1 focus:ring-[#E05A10]/30"
                    >
                      {MESES_OPCIONES.map((m) => (
                        <option key={m.value} value={m.value}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label
                      htmlFor="compras-periodo-anio"
                      className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1"
                    >
                      Año
                    </label>
                    <select
                      id="compras-periodo-anio"
                      value={selectedAnio}
                      onChange={(e) => {
                        setSelectedAnio(e.target.value);
                        setAutoDetectedPeriodo(null);
                      }}
                      className="w-full h-9 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-800 focus:border-[#E05A10] focus:outline-none focus:ring-1 focus:ring-[#E05A10]/30"
                    >
                      {ANIOS_OPCIONES.map((anio) => (
                        <option key={anio} value={anio}>
                          {anio}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Todos los documentos de este CSV quedarán asignados al Libro{" "}
                  <strong className="text-slate-700 font-semibold">
                    {MESES_OPCIONES.find((m) => m.value === selectedMes)?.label} {selectedAnio}
                  </strong>{" "}
                  ({selectedAnio}-{selectedMes}), respetando sus fechas de emisión originales para el cálculo de vencimiento.
                </p>
              </div>

              {errorMessage && (
                <div className="rounded-md border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-700 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                  <span>{errorMessage}</span>
                </div>
              )}
            </div>
          )}

          {/* Validation & Import Summary */}
          {summary && (
            <div className="space-y-3 animate-in fade-in">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                  <span className="text-[10px] font-bold text-slate-500 uppercase block">
                    Leídas
                  </span>
                  <span className="text-base font-mono font-bold text-slate-800">
                    {summary.totalFilasLeidas}
                  </span>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                  <span className="text-[10px] font-bold text-slate-500 uppercase block">
                    Sin Nro (Omitidas)
                  </span>
                  <span className="text-base font-mono font-bold text-slate-500">
                    {summary.filasDescartadasSinNro}
                  </span>
                </div>
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2.5">
                  <span className="text-[10px] font-bold text-emerald-700 uppercase block">
                    Nuevos Importados
                  </span>
                  <span className="text-base font-mono font-extrabold text-emerald-700">
                    {summary.nuevasAInyectar.length}
                  </span>
                </div>
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5">
                  <span className="text-[10px] font-bold text-amber-800 uppercase block">
                    Omitidos Duplicados
                  </span>
                  <span className="text-base font-mono font-bold text-amber-800">
                    {summary.omitidasPorDuplicidad.length}
                  </span>
                </div>
              </div>

              {/* Banner de Confirmación de Carga Masiva */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <div className="p-3 rounded-lg bg-emerald-50/80 border border-emerald-200 text-emerald-900 flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold block">
                      {summary.nuevasAInyectar.length} Registros nuevos importados exitosamente.
                    </span>
                    <span className="text-[11px] text-emerald-700">
                      Sincronizados en compras con condición CRÉDITO por defecto.
                    </span>
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-amber-50/80 border border-amber-200 text-amber-900 flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold block">
                      {summary.omitidasPorDuplicidad.length} Registros omitidos por ya existir previamente en la plataforma.
                    </span>
                    <span className="text-[11px] text-amber-700">
                      Protegidos contra duplicación por restricción de clave única (RUT Proveedor + Folio).
                    </span>
                  </div>
                </div>
              </div>

              {/* Duplicates notice */}
              {summary.omitidasPorDuplicidad.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-3 space-y-1">
                  <div className="text-xs font-bold text-amber-800 flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                    <span>
                      Facturas omitidas por duplicidad (RUT + Folio ya existente):
                    </span>
                  </div>
                  <div className="max-h-28 overflow-y-auto space-y-1 pr-1">
                    {summary.omitidasPorDuplicidad.map((dup, i) => (
                      <div
                        key={i}
                        className="text-[11px] font-mono text-slate-600 flex justify-between border-b border-amber-200/50 pb-0.5"
                      >
                        <span>
                          Folio #{dup.folio} · {formatRutDisplay(dup.rut_proveedor)} ({dup.razon_social})
                        </span>
                        <span className="text-amber-800 font-semibold">
                          {dup.motivo === "EXISTE_EN_BD" ? "Ya en BD" : "Repetido en CSV"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Errors notice */}
              {summary.erroresFormato.length > 0 && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 space-y-1">
                  <div className="text-xs font-bold text-rose-700 flex items-center gap-1.5">
                    <AlertCircle className="h-3.5 w-3.5 text-rose-600" />
                    <span>Errores de formato en filas:</span>
                  </div>
                  <div className="max-h-28 overflow-y-auto space-y-1 pr-1 text-[11px] text-rose-700">
                    {summary.erroresFormato.map((err, i) => (
                      <div key={i}>
                        Fila {err.fila}: {err.mensaje}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 bg-slate-50 px-5 py-3 flex items-center justify-between">
          <button
            type="button"
            onClick={summary ? handleReset : onClose}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
          >
            {summary ? "Cargar otro archivo" : "Cancelar"}
          </button>

          {!summary ? (
            <button
              type="button"
              disabled={!fileContent || isPending}
              onClick={handleProcessImport}
              className="inline-flex items-center gap-1.5 rounded-md bg-[#E05A10] px-4 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-[#c94f0e] transition-colors disabled:opacity-50"
            >
              {isPending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Procesando CSV...</span>
                </>
              ) : (
                <>
                  <UploadCloud className="h-3.5 w-3.5" />
                  <span>Importar al Libro Seleccionado</span>
                </>
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-4 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 transition-colors"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>Finalizar</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
