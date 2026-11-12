"use client";

import React, { useState, useRef } from "react";
import {
  FileText,
  X,
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ExternalLink,
  Trash2,
  Paperclip,
  FileImage,
  ShieldAlert,
} from "lucide-react";
import { FacturaVenta } from "@/types/database.types";
import {
  subirRespaldoFacturaVentaAction,
  eliminarRespaldoFacturaVentaAction,
} from "@/actions/facturas-ventas.actions";
import { formatCLP, formatRutDisplay } from "@/lib/utils";

interface UploadRespaldoModalProps {
  factura: FacturaVenta;
  onClose: () => void;
  onSuccess: (facturaId: string, urlPdf: string) => void;
}

export function UploadRespaldoModal({
  factura,
  onClose,
  onSuccess,
}: UploadRespaldoModalProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const allowedExtensions = [".pdf", ".png", ".jpg", ".jpeg"];

  const validateAndSetFile = (file: File) => {
    setErrorMessage(null);
    const ext = `.${file.name.split(".").pop()?.toLowerCase()}`;
    if (!allowedExtensions.includes(ext)) {
      setErrorMessage(
        "Formato de archivo no válido. Solo se permiten documentos PDF (.pdf) e Imágenes (.png, .jpg, .jpeg)."
      );
      return;
    }

    if (file.size > 15 * 1024 * 1024) {
      setErrorMessage("El archivo excede el tamaño máximo permitido de 15 MB.");
      return;
    }

    setSelectedFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      validateAndSetFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      validateAndSetFile(e.target.files[0]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setErrorMessage("Debe seleccionar un archivo PDF o Imagen para cargar.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const formData = new FormData();
      formData.append("facturaId", factura.id);
      formData.append("archivo", selectedFile);

      const res = await subirRespaldoFacturaVentaAction(formData);
      if (res.success && res.url_pdf) {
        onSuccess(factura.id, res.url_pdf);
        onClose();
      } else {
        throw new Error("No se pudo obtener la URL de confirmación del archivo.");
      }
    } catch (err: any) {
      console.error(err);
      setErrorMessage(
        err?.message || "Ocurrió un error al subir el archivo de respaldo."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteRespaldo = async () => {
    if (!confirm("¿Está seguro de eliminar el respaldo actual de esta factura? Se volverán a bloquear las acciones operativas.")) {
      return;
    }

    setIsDeleting(true);
    setErrorMessage(null);

    try {
      await eliminarRespaldoFacturaVentaAction(factura.id);
      onSuccess(factura.id, "");
      onClose();
    } catch (err: any) {
      setErrorMessage(err?.message || "Error eliminando el respaldo.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col">
        {/* Cabecera del Modal */}
        <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-red-500/20 text-red-400 flex items-center justify-center border border-red-500/30">
              <FileText className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold tracking-tight">
                Respaldo de Factura #{factura.folio}
              </h3>
              <p className="text-[11px] text-slate-400">
                {factura.razon_social} · RUT {formatRutDisplay(factura.rut_cliente)}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Banner Doble Candado Operativo */}
        <div className="p-3 bg-amber-50 border-b border-amber-200 text-amber-900 text-xs flex items-start gap-2">
          <ShieldAlert className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold">Regla de Doble Candado:</span> Para habilitar las operaciones de <strong>Pagar</strong> y <strong>Cesión Factoring</strong>, la factura debe contar obligatoriamente con su <strong>Código ON</strong> y su <strong>Respaldo PDF/Imagen</strong> cargado.
          </div>
        </div>

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {errorMessage && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Respaldo actual si existe */}
          {factura.url_pdf && !selectedFile && (
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-600 uppercase">
                  Respaldo Actual Registrado
                </span>
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                  <CheckCircle2 className="h-3 w-3" />
                  Archivo Activo
                </span>
              </div>

              <div className="flex items-center justify-between gap-2 pt-1">
                <a
                  href={factura.url_pdf}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#E05A10] hover:text-[#C2410C] hover:underline"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Ver / Descargar Respaldo en nueva pestaña
                </a>

                <button
                  type="button"
                  onClick={handleDeleteRespaldo}
                  disabled={isDeleting}
                  className="inline-flex items-center gap-1 text-xs text-rose-600 hover:text-rose-800 p-1 rounded hover:bg-rose-50"
                  title="Eliminar respaldo actual"
                >
                  {isDeleting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                  <span>Quitar</span>
                </button>
              </div>
            </div>
          )}

          {/* Zona Drag & Drop */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
              isDragging
                ? "border-red-500 bg-red-50/50"
                : selectedFile
                ? "border-emerald-400 bg-emerald-50/30"
                : "border-slate-300 hover:border-slate-400 hover:bg-slate-50"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg"
              onChange={handleFileInputChange}
              className="hidden"
            />

            {selectedFile ? (
              <div className="flex flex-col items-center">
                <div className="h-10 w-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mb-2">
                  {selectedFile.type.includes("pdf") ? (
                    <FileText className="h-5 w-5" />
                  ) : (
                    <FileImage className="h-5 w-5" />
                  )}
                </div>
                <div className="text-xs font-bold text-slate-800 break-all max-w-full">
                  {selectedFile.name}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5 font-mono">
                  {(selectedFile.size / 1024 / 1024).toFixed(2)} MB · Clic para cambiar
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center">
                <div className="h-10 w-10 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center mb-2">
                  <UploadCloud className="h-5 w-5 text-slate-600" />
                </div>
                <div className="text-xs font-bold text-slate-800">
                  {factura.url_pdf
                    ? "Arrastra un archivo aquí para reemplazar el respaldo"
                    : "Haz clic o arrastra el archivo de respaldo aquí"}
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Formatos aceptados: <strong>PDF, PNG, JPG, JPEG</strong> (Máx. 15 MB)
                </p>
              </div>
            )}
          </div>

          {/* Botones de Acción */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-3.5 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Cancelar
            </button>

            <button
              type="submit"
              disabled={!selectedFile || isSubmitting}
              className={`inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded-lg shadow-sm text-white transition-all ${
                !selectedFile || isSubmitting
                  ? "bg-slate-300 cursor-not-allowed text-slate-500"
                  : "bg-red-600 hover:bg-red-700 active:scale-95"
              }`}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Subiendo...</span>
                </>
              ) : (
                <>
                  <Paperclip className="h-3.5 w-3.5" />
                  <span>{factura.url_pdf ? "Actualizar Respaldo" : "Guardar Respaldo"}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
