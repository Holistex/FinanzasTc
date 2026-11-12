"use client";

import React, { useState, useEffect } from "react";
import {
  Banknote,
  Calendar,
  CheckCircle2,
  FileText,
  Loader2,
  X,
  History,
} from "lucide-react";
import { FacturaVenta } from "@/types/database.types";
import { registrarPagoFacturaAction } from "@/actions/facturas-ventas.actions";
import { formatCLP, formatDateCL, formatRutDisplay } from "@/lib/utils";

interface RegisterPaymentModalProps {
  factura: FacturaVenta | null;
  onClose: () => void;
  onSuccess: (pagadaCompletamente: boolean) => void;
}

export function RegisterPaymentModal({
  factura,
  onClose,
  onSuccess,
}: RegisterPaymentModalProps) {
  const deudaActual = factura
    ? Math.max(
        0,
        Number(
          factura.deuda_cliente !== null && factura.deuda_cliente !== undefined
            ? factura.deuda_cliente
            : factura.monto_neto_saldo
        )
      )
    : 0;

  const [montoPago, setMontoPago] = useState<string>("");
  const [fechaPago, setFechaPago] = useState<string>("");
  const [observacion, setObservacion] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (factura) {
      const currentDeuda = Math.max(
        0,
        Number(
          factura.deuda_cliente !== null && factura.deuda_cliente !== undefined
            ? factura.deuda_cliente
            : factura.monto_neto_saldo
        )
      );
      setMontoPago(currentDeuda > 0 ? String(Math.round(currentDeuda)) : "");
      const todayIso = new Date().toISOString().split("T")[0];
      setFechaPago(todayIso);
      setObservacion("");
      setError(null);
    }
  }, [factura]);

  if (!factura) return null;

  const numericMontoPago = Math.round(
    Number(montoPago.replace(/\./g, "").replace(/,/g, "")) || 0
  );
  const deudaResultante = Math.max(0, deudaActual - numericMontoPago);
  const isAlreadyPaid = deudaActual === 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (numericMontoPago <= 0) {
      setError("Ingrese un monto de pago mayor a $ 0.");
      return;
    }
    if (numericMontoPago > deudaActual) {
      setError(
        `El monto ingresado (${formatCLP(
          numericMontoPago
        )}) no puede superar la deuda actual pendiente (${formatCLP(
          deudaActual
        )}).`
      );
      return;
    }
    if (!fechaPago) {
      setError("Seleccione la fecha real del pago.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const res = await registrarPagoFacturaAction({
        facturaId: factura.id,
        montoPago: numericMontoPago,
        fechaPago,
        observacion: observacion.trim() || null,
      });
      onSuccess(res.pagadaCompletamente);
      onClose();
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo registrar el pago de la factura."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-[2px] p-4">
      <div className="bg-white border border-slate-200 rounded-lg shadow-2xl w-[95vw] sm:w-full max-w-md max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="px-4 py-3 bg-[#0F172A] text-white flex items-center justify-between border-b border-[#1E293B]">
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded bg-[#E05A10]/20 border border-[#E05A10]/40 flex items-center justify-center text-[#E05A10]">
              <Banknote className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-xs font-semibold tracking-tight">
                {isAlreadyPaid
                  ? "Detalle de Factura Pagada"
                  : "Registrar Pago / Abono de Factura"}
              </h3>
              <p className="text-[10px] text-slate-400 font-mono">
                Folio #{factura.folio} · {formatRutDisplay(factura.rut_cliente)}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-3.5 text-xs">
          {/* 1. Resumen de la Factura */}
          <div className="rounded-md bg-[#F8FAFC] border border-slate-200 p-3 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-slate-500 shrink-0">
                Razón Social:
              </span>
              <span
                className="font-semibold text-[#0F172A] truncate"
                title={factura.razon_social}
              >
                {factura.razon_social}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-slate-500">
                RUT Cliente · Folio:
              </span>
              <span className="font-mono text-slate-800">
                {formatRutDisplay(factura.rut_cliente)} ·{" "}
                <strong>#{factura.folio}</strong>
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-slate-500">
                Monto Total Original:
              </span>
              <span className="font-mono text-slate-700 tabular-nums">
                {formatCLP(factura.monto_total)}
              </span>
            </div>
            <div className="flex items-center justify-between pt-1.5 border-t border-slate-200">
              <span className="text-[11px] font-semibold text-[#0F172A]">
                Deuda Actual Pendiente:
              </span>
              <span className="font-mono text-sm font-bold text-[#E05A10] tabular-nums">
                {formatCLP(deudaActual)}
              </span>
            </div>
          </div>

          {/* Historial de Abonos / Pagos previos si existen */}
          {factura.pagos_facturas && factura.pagos_facturas.length > 0 && (
            <div className="rounded-md border border-slate-200 bg-white p-2.5 space-y-1.5">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                <History className="h-3 w-3 text-[#E05A10]" />
                Historial de Pagos Registrados ({factura.pagos_facturas.length})
              </div>
              <div className="max-h-28 overflow-y-auto divide-y divide-slate-100">
                {factura.pagos_facturas.map((p) => (
                  <div
                    key={p.id}
                    className="py-1.5 flex items-start justify-between gap-2 text-[11px]"
                  >
                    <div>
                      <span className="font-mono text-slate-700 font-medium">
                        {formatDateCL(p.fecha_pago)}
                      </span>
                      {p.observacion && (
                        <p className="text-[10px] text-slate-500 mt-0.5">
                          {p.observacion}
                        </p>
                      )}
                    </div>
                    <span className="font-mono font-semibold text-emerald-700 shrink-0">
                      {formatCLP(p.monto_pago)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!isAlreadyPaid ? (
            <>
              {/* 2. Monto del Pago (Obligatorio) */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-semibold text-slate-700">
                    Monto del Pago ($ CLP) *
                  </label>
                  <button
                    type="button"
                    onClick={() => setMontoPago(String(Math.round(deudaActual)))}
                    className="text-[11px] font-semibold text-[#E05A10] hover:underline"
                  >
                    Saldar 100% ({formatCLP(deudaActual)})
                  </button>
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-slate-400 font-semibold">
                    $
                  </span>
                  <input
                    type="number"
                    required
                    min={1}
                    max={deudaActual}
                    step="1"
                    value={montoPago}
                    onChange={(e) => setMontoPago(e.target.value)}
                    placeholder="Ej: 5000000"
                    className="w-full rounded-md border border-slate-300 pl-7 pr-3 py-1.5 font-mono text-sm font-semibold text-[#0F172A] focus:border-[#E05A10] focus:outline-none"
                  />
                </div>
                <div className="mt-1 flex items-center justify-between text-[11px]">
                  <span className="text-slate-500">
                    Deuda resultante tras el pago:
                  </span>
                  <span
                    className={
                      deudaResultante === 0
                        ? "font-mono font-bold text-emerald-700"
                        : "font-mono font-semibold text-slate-800"
                    }
                  >
                    {formatCLP(deudaResultante)}{" "}
                    {deudaResultante === 0 && "(Pasa a Facturas Pagadas)"}
                  </span>
                </div>
              </div>

              {/* 3. Fecha de Pago Real (Obligatorio) */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-slate-400" />
                  Fecha de Pago Real *
                </label>
                <input
                  type="date"
                  required
                  value={fechaPago}
                  onChange={(e) => setFechaPago(e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-1.5 font-mono text-[#0F172A] focus:border-[#E05A10] focus:outline-none"
                />
              </div>

              {/* 4. Observación (Opcional / No excluyente) */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5 text-slate-400" />
                  Observación{" "}
                  <span className="text-[10px] font-normal text-slate-400">
                    (Opcional)
                  </span>
                </label>
                <textarea
                  rows={2}
                  value={observacion}
                  onChange={(e) => setObservacion(e.target.value)}
                  placeholder="Ej: Transferencia Banco de Chile #88921 / Pago parcial..."
                  className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs text-[#0F172A] placeholder:text-slate-400 focus:border-[#E05A10] focus:outline-none resize-none"
                />
              </div>
            </>
          ) : (
            <div className="rounded-md bg-emerald-50 border border-emerald-200 p-3 flex items-center gap-2 text-emerald-800">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>
                Esta factura se encuentra íntegramente pagada (Deuda Cliente{" "}
                <strong>$ 0</strong>).
              </span>
            </div>
          )}

          {error && (
            <div className="rounded bg-rose-50 border border-rose-200 px-3 py-2 text-rose-700">
              {error}
            </div>
          )}

          {/* Footer Buttons */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-[#F1F5F9]"
            >
              {isAlreadyPaid ? "Cerrar" : "Cancelar"}
            </button>
            {!isAlreadyPaid && (
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex items-center gap-1.5 rounded-md bg-[#E05A10] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#C2410C] disabled:opacity-50 transition-colors"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Procesando Pago...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Confirmar Pago
                  </>
                )}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
