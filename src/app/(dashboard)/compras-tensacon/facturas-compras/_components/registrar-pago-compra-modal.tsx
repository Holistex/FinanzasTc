"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  CreditCard,
  Calendar,
  Banknote,
  Building2,
  FileText,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Hash,
} from "lucide-react";
import { FacturaCompra, ModalidadPagoCompra } from "@/types/database.types";
import { registrarPagoFacturaCompraAction } from "@/actions/facturas-compras.actions";
import { formatCLP, formatRutDisplay, getTodayDateCL } from "@/lib/utils";

interface RegistrarPagoCompraModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  factura: FacturaCompra | null;
}

const MODALIDADES_PAGO: Array<{
  value: ModalidadPagoCompra;
  label: string;
}> = [
  { value: "DIRECTO", label: "TRANSFERENCIA DIRECTA" },
  { value: "CHEQUE", label: "CHEQUE COBRADO" },
  { value: "FACTORING", label: "FACTORING" },
  { value: "CONFIRMING", label: "CONFIRMING" },
  { value: "EFECTIVO", label: "EFECTIVO / CAJA" },
];

export function RegistrarPagoCompraModal({
  isOpen,
  onClose,
  onSuccess,
  factura,
}: RegistrarPagoCompraModalProps) {
  // Saldo pendiente actual
  const saldoActual = factura
    ? Math.max(
        0,
        Number(
          factura.monto_saldo !== undefined && factura.monto_saldo !== null
            ? factura.monto_saldo
            : factura.monto_total
        )
      )
    : 0;

  // Estados del Formulario
  const [montoPago, setMontoPago] = useState<string>("");
  const [fechaPago, setFechaPago] = useState<string>(getTodayDateCL());
  const [modalidadPago, setModalidadPago] = useState<ModalidadPagoCompra>("DIRECTO");
  const [bancoCuenta, setBancoCuenta] = useState<string>("");
  const [numeroComprobante, setNumeroComprobante] = useState<string>("");
  const [observacion, setObservacion] = useState<string>("");

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Inicializar formulario al abrir con la factura
  useEffect(() => {
    if (factura && isOpen) {
      setMontoPago(String(saldoActual));
      setFechaPago(getTodayDateCL());
      setModalidadPago(
        factura.estado === "CHEQUE"
          ? "CHEQUE"
          : factura.estado === "FACTORING"
          ? "FACTORING"
          : factura.estado === "CONFIRMING"
          ? "CONFIRMING"
          : "DIRECTO"
      );
      setBancoCuenta(factura.banco_emisor || "");
      setNumeroComprobante(
        factura.numero_cheque
          ? `CHK-${factura.numero_cheque}`
          : `PAGO-${factura.folio}`
      );
      setObservacion("");
      setErrorMsg(null);
    }
  }, [factura, isOpen, saldoActual]);

  if (!isOpen || !factura) return null;

  const montoNum = Math.round(Number(montoPago) || 0);
  const nuevoSaldo = Math.max(0, saldoActual - montoNum);
  const esTotal = montoNum >= saldoActual && saldoActual > 0;
  const esParcial = montoNum > 0 && montoNum < saldoActual;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (montoNum <= 0) {
      setErrorMsg("El monto a pagar debe ser mayor a $0.");
      return;
    }

    if (!fechaPago) {
      setErrorMsg("Debe seleccionar una fecha real de pago.");
      return;
    }

    setIsLoading(true);
    try {
      const res = await registrarPagoFacturaCompraAction({
        facturaId: factura.id,
        montoPago: montoNum,
        fechaPago,
        modalidadPago,
        bancoCuenta: bancoCuenta.trim() || null,
        numeroComprobante: numeroComprobante.trim() || null,
        observacion: observacion.trim() || null,
      });

      if (!res.success) {
        setErrorMsg(res.error || "No se pudo registrar el pago.");
        return;
      }

      onSuccess();
      onClose();
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error ? err.message : "Error inesperado al registrar el pago."
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 backdrop-blur-xs p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="w-[95vw] sm:w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl my-6">
        {/* Encabezado Modal */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-[#0B1528] px-6 py-4 text-white">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm">
              <Banknote className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-tight">
                  Registrar Pago de Factura
                </h2>
                <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300 font-mono">
                  #{factura.folio}
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Saldar deuda directa o registrar abono parcial de compra
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
            title="Cerrar modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Resumen del Documento */}
        <div className="bg-slate-50 border-b border-slate-200/80 px-6 py-3.5 text-xs">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Proveedor
              </span>
              <span className="font-bold text-slate-800 truncate block mt-0.5" title={factura.razon_social}>
                {factura.razon_social}
              </span>
              <span className="text-[10px] font-mono text-slate-500">
                {formatRutDisplay(factura.rut_proveedor)}
              </span>
            </div>

            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Tipo DTE / Folio
              </span>
              <span className="font-bold text-slate-800 block mt-0.5 font-mono">
                {factura.tipo_doc === 33 ? "Factura Electrónica (33)" : `DTE ${factura.tipo_doc}`}
              </span>
              <span className="text-[10px] font-mono text-slate-500">
                Folio #{factura.folio}
              </span>
            </div>

            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Monto Total Factura
              </span>
              <span className="font-mono font-bold text-slate-700 block mt-0.5">
                {formatCLP(factura.monto_total)}
              </span>
            </div>

            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2">
              <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider block">
                Saldo Pendiente Actual
              </span>
              <span className="text-sm font-black font-mono text-emerald-700 block mt-0.5">
                {formatCLP(saldoActual)}
              </span>
            </div>
          </div>
        </div>

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {errorMsg && (
            <div className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-xs text-rose-800">
              <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="font-medium leading-relaxed">{errorMsg}</div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Monto a Pagar */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Monto a Pagar ($ CLP) <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold font-mono">
                  $
                </span>
                <input
                  type="number"
                  min={1}
                  max={saldoActual > 0 ? saldoActual : undefined}
                  value={montoPago}
                  onChange={(e) => setMontoPago(e.target.value)}
                  placeholder="0"
                  required
                  disabled={isLoading}
                  className="w-full pl-7 pr-3 py-2 text-sm font-bold font-mono text-slate-900 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div className="flex items-center justify-between mt-1 text-[11px]">
                <button
                  type="button"
                  onClick={() => setMontoPago(String(saldoActual))}
                  className="text-emerald-700 hover:text-emerald-800 font-bold hover:underline"
                >
                  Pagar 100% ({formatCLP(saldoActual)})
                </button>
                {esParcial && (
                  <span className="text-amber-700 font-semibold">
                    Quedará saldo: {formatCLP(nuevoSaldo)}
                  </span>
                )}
                {esTotal && (
                  <span className="text-emerald-700 font-semibold flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" /> Pago Total
                  </span>
                )}
              </div>
            </div>

            {/* Fecha Real de Pago */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Fecha Real de Pago <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="date"
                  value={fechaPago}
                  onChange={(e) => setFechaPago(e.target.value)}
                  required
                  disabled={isLoading}
                  className="w-full pl-9 pr-3 py-2 text-xs font-mono font-medium text-slate-900 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Fecha contable de la transacción bancaria o egreso
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Modalidad / Medio de Pago */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Modalidad / Medio de Pago <span className="text-rose-500">*</span>
              </label>
              <select
                value={modalidadPago}
                onChange={(e) => setModalidadPago(e.target.value as ModalidadPagoCompra)}
                required
                disabled={isLoading}
                className="w-full px-3 py-2 text-xs font-semibold text-slate-800 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                {MODALIDADES_PAGO.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Banco / Cuenta Origen (Opcional) */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Banco / Cuenta Origen <span className="text-slate-400 font-normal">(Opcional)</span>
              </label>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={bancoCuenta}
                  onChange={(e) => setBancoCuenta(e.target.value)}
                  placeholder="Ej: Banco Itaú Cta 187993 / Santander"
                  disabled={isLoading}
                  className="w-full pl-9 pr-3 py-2 text-xs text-slate-800 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>
          </div>

          {/* N° Comprobante / Referencia */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              N° Transacción / Comprobante de Egreso <span className="text-slate-400 font-normal">(Opcional)</span>
            </label>
            <div className="relative">
              <Hash className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={numeroComprobante}
                onChange={(e) => setNumeroComprobante(e.target.value)}
                placeholder="Ej: TEF-982341, CHK-450912 o folio interno"
                disabled={isLoading}
                className="w-full pl-9 pr-3 py-2 text-xs font-mono text-slate-800 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          {/* Observación / Glosa */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Observación / Glosa Contable <span className="text-slate-400 font-normal">(Opcional)</span>
            </label>
            <textarea
              rows={2}
              value={observacion}
              onChange={(e) => setObservacion(e.target.value)}
              placeholder="Detalles adicionales del pago, concepto de egreso o notas para tesorería..."
              disabled={isLoading}
              className="w-full px-3 py-2 text-xs text-slate-800 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
            />
          </div>

          {/* Banner de Impacto */}
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 text-xs text-emerald-900 flex items-start gap-2.5">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              {esTotal ? (
                <span>
                  Al saldar el 100% de la deuda (<strong>{formatCLP(montoNum)}</strong>), la factura quedará marcada como <strong>PAGADA</strong> y se trasladará automáticamente a <strong>Histórico Pagos</strong>.
                </span>
              ) : esParcial ? (
                <span>
                  Se registrará un abono parcial de <strong>{formatCLP(montoNum)}</strong> en Histórico Pagos. La factura permanecerá en compras con un nuevo saldo pendiente de <strong>{formatCLP(nuevoSaldo)}</strong>.
                </span>
              ) : (
                <span>Ingrese el monto que desea saldar de esta factura.</span>
              )}
            </div>
          </div>

          {/* Acciones */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isLoading || montoNum <= 0}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2 shadow-sm transition-colors disabled:opacity-50 cursor-pointer"
            >
              {isLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Banknote className="h-3.5 w-3.5" />
              )}
              <span>{esTotal ? "Confirmar Pago Total" : "Registrar Abono"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
