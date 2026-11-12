"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  Calendar,
  Clock,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Banknote,
  FileText,
} from "lucide-react";
import { FacturaCompra, ChequeCompra } from "@/types/database.types";
import { prorrogarChequeCompraAction } from "@/actions/facturas-compras.actions";
import { formatCLP, formatRutDisplay, formatDateCL } from "@/lib/utils";

interface ProrrogarChequeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  factura: FacturaCompra | null;
}

export function ProrrogarChequeModal({
  isOpen,
  onClose,
  onSuccess,
  factura,
}: ProrrogarChequeModalProps) {
  const [nuevaFecha, setNuevaFecha] = useState<string>("");
  const [selectedChequeId, setSelectedChequeId] = useState<string>("TODOS");
  const [observacion, setObservacion] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (factura && isOpen) {
      const fechaActual =
        factura.fecha_vencimiento_cheque ||
        factura.fecha_vencimiento ||
        new Date().toISOString().slice(0, 10);
      setNuevaFecha(fechaActual);
      setSelectedChequeId("TODOS");
      setObservacion("");
      setErrorMessage(null);
    }
  }, [factura, isOpen]);

  if (!isOpen || !factura) return null;

  const cheques = factura.cheques || [];
  const fechaActualCheque =
    factura.fecha_vencimiento_cheque || factura.fecha_vencimiento || "—";
  const saldoActivo =
    factura.monto_saldo !== undefined && factura.monto_saldo !== null && factura.monto_saldo > 0
      ? factura.monto_saldo
      : factura.monto_total;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!nuevaFecha) {
      setErrorMessage("Debe seleccionar una nueva fecha de vencimiento/cobro.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await prorrogarChequeCompraAction({
        facturaId: factura.id,
        chequeId: selectedChequeId !== "TODOS" ? selectedChequeId : null,
        nuevaFechaVencimiento: nuevaFecha,
        observacion: observacion.trim() || null,
      });

      if (res.success) {
        onSuccess();
        onClose();
      } else {
        setErrorMessage(res.error || "No fue posible actualizar la fecha de prórroga.");
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        className="relative w-[95vw] sm:w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-2xl border border-slate-100 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Encabezado */}
        <div className="flex items-center justify-between border-b border-amber-200/80 bg-linear-to-r from-amber-500 to-amber-600 px-5 py-4 text-white">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/20 backdrop-blur-xs">
              <Clock className="h-5 w-5 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-bold tracking-tight">
                Prórroga de Cheque de Compra
              </h3>
              <p className="text-[11px] text-amber-100">
                Modificar fecha de vencimiento / cobro bancario
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-white/80 hover:bg-white/20 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          {errorMessage && (
            <div className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-red-800 border border-red-200">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Resumen Factura */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 space-y-2">
            <div className="flex items-center justify-between text-slate-800">
              <span className="font-semibold text-slate-600 flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5 text-slate-400" />
                Factura #{factura.folio}
              </span>
              <span className="font-bold font-mono text-slate-900">
                {formatCLP(saldoActivo)}
              </span>
            </div>
            <div className="text-[11px] text-slate-600">
              <span className="font-semibold text-slate-700">{factura.razon_social}</span>
              <span className="text-slate-400 ml-1 font-mono">
                ({formatRutDisplay(factura.rut_proveedor)})
              </span>
            </div>

            <div className="flex items-center justify-between pt-1 border-t border-slate-200/60 text-[11px]">
              <span className="text-slate-500">
                Banco Emisor: <strong className="text-slate-700">{factura.banco_emisor || "Banco"}</strong>
              </span>
              <span className="text-slate-500">
                Vigente: <strong className="text-amber-800 font-mono">{formatDateCL(fechaActualCheque)}</strong>
              </span>
            </div>
          </div>

          {/* Selector de Cheque específico si hay más de 1 */}
          {cheques.length > 1 && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Seleccionar Cheque a Prorrogar
              </label>
              <select
                value={selectedChequeId}
                onChange={(e) => setSelectedChequeId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 shadow-xs focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
              >
                <option value="TODOS">
                  Todos los cheques emitidos ({cheques.length} cuotas)
                </option>
                {cheques.map((c: ChequeCompra) => (
                  <option key={c.id} value={c.id}>
                    #{c.numero_cheque} — {formatCLP(c.monto_cheque)} (Vence: {formatDateCL(c.fecha_vencimiento)})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Nueva Fecha de Vencimiento */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Nueva Fecha de Cobro / Vencimiento <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="date"
                value={nuevaFecha}
                onChange={(e) => setNuevaFecha(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 py-2 text-xs text-slate-800 shadow-xs focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                required
              />
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Esta nueva fecha sincronizará el compromiso financiero en la cartera de cheques y en compromisos semanales.
            </p>
          </div>

          {/* Motivo / Observación */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Motivo de la Prórroga (Opcional)
            </label>
            <textarea
              value={observacion}
              onChange={(e) => setObservacion(e.target.value)}
              placeholder="Ej. Solicitud de proveedor / prórroga acordada a 30 días adicionales..."
              rows={2}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 shadow-xs focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 placeholder-slate-400 resize-none"
            />
          </div>

          {/* Botones de Acción */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-1.5 rounded-lg bg-amber-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-amber-700 transition-colors disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Guardando...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>Guardar Prórroga</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
