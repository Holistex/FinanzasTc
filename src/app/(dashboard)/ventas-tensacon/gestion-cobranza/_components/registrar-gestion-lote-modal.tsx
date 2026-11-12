"use client";

import React, { useState, useTransition, useMemo } from "react";
import {
  X,
  PhoneCall,
  Mail,
  MessageSquare,
  Calendar,
  AlertCircle,
  Loader2,
  Receipt,
  Layers,
  Building2,
  CheckCircle2,
  User,
} from "lucide-react";
import {
  FacturaVenta,
  TipoGestionCobranza,
} from "@/types/database.types";
import { cn, formatCLP, formatRutDisplay } from "@/lib/utils";
import { registrarGestionCobranzaLoteAction } from "@/actions/gestion-cobranza.actions";

interface RegistrarGestionLoteModalProps {
  facturas: FacturaVenta[];
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function RegistrarGestionLoteModal({
  facturas,
  isOpen,
  onClose,
  onSuccess,
}: RegistrarGestionLoteModalProps) {
  const [tipoGestion, setTipoGestion] = useState<TipoGestionCobranza>("LLAMADA");
  const [fechaCompromisoPago, setFechaCompromisoPago] = useState("");
  const [contactoNombre, setContactoNombre] = useState("");
  const [contactoTelefonoEmail, setContactoTelefonoEmail] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [usuarioNombre, setUsuarioNombre] = useState("Cedrix Vargas");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Cálculos consolidados de las facturas seleccionadas
  const { totalDeuda, clientesUnicos, textoResumenClientes } = useMemo(() => {
    let total = 0;
    const clientesMap = new Map<string, string>(); // rut -> razon_social

    for (const f of facturas) {
      const saldo = Number(f.deuda_cliente ?? f.monto_neto_saldo ?? f.monto_total ?? 0);
      total += saldo;
      if (f.rut_cliente) {
        clientesMap.set(f.rut_cliente, f.razon_social);
      }
    }

    const uniqueClientes = Array.from(clientesMap.values());
    let resumen = "";
    if (uniqueClientes.length === 1) {
      resumen = uniqueClientes[0];
    } else if (uniqueClientes.length > 1) {
      resumen = `${uniqueClientes.length} clientes distintos`;
    } else {
      resumen = "Clientes seleccionados";
    }

    return {
      totalDeuda: total,
      clientesUnicos: uniqueClientes,
      textoResumenClientes: resumen,
    };
  }, [facturas]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!observaciones.trim()) {
      setErrorMsg("Debe ingresar una observación o nota sobre la gestión en lote realizada.");
      return;
    }
    setErrorMsg(null);

    startTransition(async () => {
      const facturaIds = facturas.map((f) => f.id);
      const result = await registrarGestionCobranzaLoteAction({
        facturaIds,
        tipoGestion,
        fechaCompromisoPago: fechaCompromisoPago || null,
        observaciones: observaciones.trim(),
        contactoNombre: contactoNombre.trim() || null,
        contactoTelefonoEmail: contactoTelefonoEmail.trim() || null,
        usuarioNombre: usuarioNombre.trim() || "Cedrix Vargas",
      });

      if (!result.success) {
        setErrorMsg(result.error || "Error al registrar la gestión en lote.");
      } else {
        onSuccess();
        onClose();
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="relative w-full max-w-2xl max-h-[92vh] flex flex-col rounded-xl bg-white shadow-2xl border border-slate-200 overflow-hidden text-slate-800">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-[#E05A10] flex items-center justify-center text-white shadow-sm">
              <PhoneCall className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-[#0F172A]">
                Registrar Gestión de Cobranza en Lote
              </h2>
              <p className="text-[11px] text-slate-500">
                Aplicando a {facturas.length} {facturas.length === 1 ? "factura" : "facturas"} de{" "}
                <span className="font-semibold text-slate-700">{textoResumenClientes}</span> por un total de{" "}
                <strong className="text-[#E05A10] font-mono">{formatCLP(totalDeuda)}</strong>
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

        {/* Modal Body with scrollable content */}
        <div className="overflow-y-auto px-5 py-4 space-y-4 max-h-[calc(92vh-120px)]">
          {/* Document Summary Strip */}
          <div className="rounded-lg border border-orange-200 bg-orange-50/50 p-3 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 font-bold text-[#0F172A]">
                <Layers className="h-4 w-4 text-[#E05A10]" />
                <span>Documentos Seleccionados ({facturas.length}):</span>
              </div>
              <div className="font-mono font-extrabold text-[#E05A10] text-sm">
                Total Deuda: {formatCLP(totalDeuda)}
              </div>
            </div>

            {/* Invoices Badges list */}
            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-1">
              {facturas.map((f) => {
                const saldo = Number(f.deuda_cliente ?? f.monto_neto_saldo ?? f.monto_total ?? 0);
                return (
                  <span
                    key={f.id}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-white border border-orange-200 text-slate-700 shadow-2xs"
                    title={`${f.razon_social} (${formatRutDisplay(f.rut_cliente)}) - Saldo: ${formatCLP(saldo)}`}
                  >
                    <Receipt className="h-3 w-3 text-[#E05A10]" />
                    <strong>#{f.folio}</strong>
                    <span className="text-slate-500">·</span>
                    <span className="text-emerald-700 font-bold">{formatCLP(saldo)}</span>
                  </span>
                );
              })}
            </div>
          </div>

          {errorMsg && (
            <div className="rounded-md border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-700 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form id="form-gestion-lote" onSubmit={handleSubmit} className="space-y-4 text-xs">
            {/* 1. Tipo de Gestión / Interacción */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Tipo de Interacción Realizada <span className="text-rose-500">*</span>
              </label>
              <div className="grid grid-cols-3 gap-2">
                {/* Opción 1: LLAMADA */}
                <button
                  type="button"
                  onClick={() => setTipoGestion("LLAMADA")}
                  className={cn(
                    "flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg border text-xs font-semibold transition-all shadow-2xs",
                    tipoGestion === "LLAMADA"
                      ? "border-blue-500 bg-blue-50 text-blue-700 ring-2 ring-blue-500/20 font-bold"
                      : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                  )}
                >
                  <PhoneCall className="h-4 w-4 text-blue-600" />
                  <span>LLAMADA</span>
                </button>

                {/* Opción 2: CORREO */}
                <button
                  type="button"
                  onClick={() => setTipoGestion("CORREO")}
                  className={cn(
                    "flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg border text-xs font-semibold transition-all shadow-2xs",
                    tipoGestion === "CORREO"
                      ? "border-emerald-500 bg-emerald-50 text-emerald-700 ring-2 ring-emerald-500/20 font-bold"
                      : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                  )}
                >
                  <Mail className="h-4 w-4 text-emerald-600" />
                  <span>CORREO</span>
                </button>

                {/* Opción 3: WHATSAPP */}
                <button
                  type="button"
                  onClick={() => setTipoGestion("WHATSAPP")}
                  className={cn(
                    "flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg border text-xs font-semibold transition-all shadow-2xs",
                    tipoGestion === "WHATSAPP"
                      ? "border-green-600 bg-green-50 text-green-800 ring-2 ring-green-600/20 font-bold"
                      : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                  )}
                >
                  <MessageSquare className="h-4 w-4 text-green-600" />
                  <span>WHATSAPP</span>
                </button>
              </div>
            </div>

            {/* 2. Fecha de Compromiso de Pago */}
            <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Fecha Compromiso de Pago (Acordada con el Cliente)
              </label>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Calendar className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <input
                    type="date"
                    value={fechaCompromisoPago}
                    onChange={(e) => setFechaCompromisoPago(e.target.value)}
                    className="w-full pl-9 pr-3 py-1.5 rounded-md border border-slate-300 bg-white text-xs text-slate-800 shadow-sm focus:border-[#E05A10] focus:outline-none"
                  />
                </div>
                {fechaCompromisoPago && (
                  <button
                    type="button"
                    onClick={() => setFechaCompromisoPago("")}
                    className="text-[11px] text-slate-500 hover:text-slate-800 underline shrink-0 px-1"
                  >
                    Quitar fecha
                  </button>
                )}
              </div>
              <p className="text-[10px] text-slate-500 mt-1">
                Esta fecha alimentará los indicadores y la bitácora de seguimiento semanal en lote para todas las facturas seleccionadas.
              </p>
            </div>

            {/* 3. Observaciones y Acuerdos (Textarea Principal) */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Observación / Acuerdos de Cobranza <span className="text-rose-500">*</span>
              </label>
              <textarea
                rows={4}
                required
                placeholder="Describa el resultado de la gestión, acuerdos con la contraparte, motivos de retraso o fechas tentativas de pago para este conjunto de facturas..."
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
                className="w-full rounded-md border border-slate-300 p-2.5 text-xs text-slate-800 shadow-sm focus:border-[#E05A10] focus:outline-none resize-none"
              />
            </div>

            {/* 4. Datos de Contacto y Gestor */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Persona de Contacto en Cliente (Opcional)
                </label>
                <input
                  type="text"
                  placeholder="Ej: Juan Pérez / Finanzas"
                  value={contactoNombre}
                  onChange={(e) => setContactoNombre(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-md border border-slate-300 bg-white text-xs text-slate-800 shadow-sm focus:border-[#E05A10] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Teléfono / Correo Contactado (Opcional)
                </label>
                <input
                  type="text"
                  placeholder="Ej: +56 9 1234 5678 / jperez@cliente.cl"
                  value={contactoTelefonoEmail}
                  onChange={(e) => setContactoTelefonoEmail(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-md border border-slate-300 bg-white text-xs text-slate-800 shadow-sm focus:border-[#E05A10] focus:outline-none"
                />
              </div>
            </div>
          </form>
        </div>

        {/* Modal Footer */}
        <div className="border-t border-slate-200 bg-slate-50 px-5 py-3 flex items-center justify-between">
          <div className="text-[11px] text-slate-500">
            Impactando <strong className="text-slate-800">{facturas.length}</strong> facturas simultáneamente.
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              form="form-gestion-lote"
              disabled={isPending || !observaciones.trim()}
              className="inline-flex items-center gap-1.5 rounded-md bg-[#E05A10] px-4 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-[#c94f0e] transition-colors disabled:opacity-50"
            >
              {isPending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Guardando en Lote...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>Guardar Gestión en Lote ({facturas.length})</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
