"use client";

import React, { useState, useTransition } from "react";
import {
  X,
  PhoneCall,
  Mail,
  MessageSquare,
  Calendar,
  User,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  FileText,
  History,
} from "lucide-react";
import {
  FacturaVenta,
  GestionCobranza,
  TipoGestionCobranza,
} from "@/types/database.types";
import {
  cn,
  formatCLP,
  formatDateCL,
  formatRutDisplay,
} from "@/lib/utils";
import { registrarGestionCobranzaAction } from "@/actions/gestion-cobranza.actions";

interface RegistrarGestionModalProps {
  factura: FacturaVenta;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function RegistrarGestionModal({
  factura,
  isOpen,
  onClose,
  onSuccess,
}: RegistrarGestionModalProps) {
  const [tipoGestion, setTipoGestion] = useState<TipoGestionCobranza>("LLAMADA");
  const [fechaCompromisoPago, setFechaCompromisoPago] = useState("");
  const [contactoNombre, setContactoNombre] = useState(
    factura.empresa_factoring_cliente?.contacto_nombre || ""
  );
  const [contactoTelefonoEmail, setContactoTelefonoEmail] = useState(
    factura.empresa_factoring_cliente?.contacto_email || ""
  );
  const [observaciones, setObservaciones] = useState("");
  const [usuarioNombre, setUsuarioNombre] = useState("Cedrix Vargas");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!observaciones.trim()) {
      setErrorMsg("Debe ingresar una observación o nota sobre la gestión realizada.");
      return;
    }
    setErrorMsg(null);

    startTransition(async () => {
      const result = await registrarGestionCobranzaAction({
        facturaId: factura.id,
        tipoGestion,
        fechaCompromisoPago: fechaCompromisoPago || null,
        observaciones: observaciones.trim(),
        contactoNombre: contactoNombre.trim() || null,
        contactoTelefonoEmail: contactoTelefonoEmail.trim() || null,
        usuarioNombre: usuarioNombre.trim() || "Cedrix Vargas",
      });

      if (!result.success) {
        setErrorMsg(result.error || "Error al registrar la gestión");
      } else {
        onSuccess();
        onClose();
      }
    });
  };

  const saldoPendiente = Number(
    factura.deuda_cliente ?? factura.monto_neto_saldo ?? factura.monto_total
  );

  const gestionesPrevias = factura.gestiones_cobranza || [];

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
                Registrar Gestión de Cobranza
              </h2>
              <p className="text-[11px] text-slate-500">
                Factura #{factura.folio} · {factura.razon_social}
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
          {/* Factura Summary Pill Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 rounded-lg border border-slate-200 bg-slate-50/70 p-3 text-xs">
            <div>
              <span className="text-[10px] font-semibold uppercase text-slate-600 block">
                Folio DTE
              </span>
              <span className="font-mono font-bold text-slate-900 text-sm">
                #{factura.folio}
              </span>
            </div>
            <div>
              <span className="text-[10px] font-semibold uppercase text-slate-600 block">
                RUT Cliente
              </span>
              <span className="font-mono text-slate-800 font-medium">
                {formatRutDisplay(factura.rut_cliente)}
              </span>
            </div>
            <div>
              <span className="text-[10px] font-semibold uppercase text-slate-600 block">
                Emisión
              </span>
              <span className="font-mono text-slate-800">
                {formatDateCL(factura.fecha_docto)}
              </span>
            </div>
            <div>
              <span className="text-[10px] font-semibold uppercase text-slate-600 block">
                Saldo Deuda
              </span>
              <span className="font-mono font-bold text-[#E05A10] text-sm">
                {formatCLP(saldoPendiente)}
              </span>
            </div>
          </div>

          {errorMsg && (
            <div className="rounded-md border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-700 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Form */}
          <form id="form-registrar-gestion" onSubmit={handleSubmit} className="space-y-3.5">
            {/* 1. Selector de Tipo de Gestión */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Tipo de Interacción <span className="text-rose-500">*</span>
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setTipoGestion("LLAMADA")}
                  className={cn(
                    "flex items-center justify-center gap-2 py-2 px-3 rounded-lg border text-xs font-semibold transition-all",
                    tipoGestion === "LLAMADA"
                      ? "bg-amber-500/10 border-amber-500 text-amber-700 ring-2 ring-amber-500/20"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                  )}
                >
                  <PhoneCall className="h-3.5 w-3.5 text-amber-600" />
                  <span>Llamada</span>
                </button>

                <button
                  type="button"
                  onClick={() => setTipoGestion("CORREO")}
                  className={cn(
                    "flex items-center justify-center gap-2 py-2 px-3 rounded-lg border text-xs font-semibold transition-all",
                    tipoGestion === "CORREO"
                      ? "bg-sky-500/10 border-sky-500 text-sky-700 ring-2 ring-sky-500/20"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                  )}
                >
                  <Mail className="h-3.5 w-3.5 text-sky-600" />
                  <span>Correo</span>
                </button>

                <button
                  type="button"
                  onClick={() => setTipoGestion("WHATSAPP")}
                  className={cn(
                    "flex items-center justify-center gap-2 py-2 px-3 rounded-lg border text-xs font-semibold transition-all",
                    tipoGestion === "WHATSAPP"
                      ? "bg-emerald-500/10 border-emerald-500 text-emerald-700 ring-2 ring-emerald-500/20"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                  )}
                >
                  <MessageSquare className="h-3.5 w-3.5 text-emerald-600" />
                  <span>WhatsApp</span>
                </button>
              </div>
            </div>

            {/* 2. Fecha de Compromiso de Pago & Usuario Gestor */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Fecha Compromiso de Pago{" "}
                  <span className="text-[10px] text-slate-600 font-normal">
                    (opcional)
                  </span>
                </label>
                <div className="relative">
                  <input
                    type="date"
                    value={fechaCompromisoPago}
                    onChange={(e) => setFechaCompromisoPago(e.target.value)}
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-800 shadow-sm focus:border-[#E05A10] focus:ring-1 focus:ring-[#E05A10] focus:outline-none"
                  />
                  {fechaCompromisoPago && (
                    <button
                      type="button"
                      onClick={() => setFechaCompromisoPago("")}
                      className="absolute right-2 top-2 text-[10px] text-slate-400 hover:text-slate-600"
                    >
                      Limpiar
                    </button>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Gestor Responsable
                </label>
                <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-700 font-medium">
                  <User className="h-3.5 w-3.5 text-slate-400" />
                  <span>{usuarioNombre}</span>
                </div>
              </div>
            </div>

            {/* 3. Persona y Teléfono/Email Contactado */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Persona Contactada{" "}
                  <span className="text-[10px] text-slate-600 font-normal">
                    (opcional)
                  </span>
                </label>
                <input
                  type="text"
                  placeholder="Ej: Marcelo Ríos - Tesorería"
                  value={contactoNombre}
                  onChange={(e) => setContactoNombre(e.target.value)}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-800 shadow-sm focus:border-[#E05A10] focus:ring-1 focus:ring-[#E05A10] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Teléfono / Correo de Contacto{" "}
                  <span className="text-[10px] text-slate-600 font-normal">
                    (opcional)
                  </span>
                </label>
                <input
                  type="text"
                  placeholder="Ej: +56 9 8765 4321 / mrios@cliente.cl"
                  value={contactoTelefonoEmail}
                  onChange={(e) => setContactoTelefonoEmail(e.target.value)}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-800 shadow-sm focus:border-[#E05A10] focus:ring-1 focus:ring-[#E05A10] focus:outline-none"
                />
              </div>
            </div>

            {/* 4. Observaciones y Acuerdos (Textarea Obligatorio) */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Observaciones y Acuerdos de la Gestión{" "}
                <span className="text-rose-500">*</span>
              </label>
              <textarea
                rows={3}
                required
                placeholder="Detalle lo conversado: confirmación de recepción de factura, fecha comprometida de transferencia, motivos de mora o condiciones acordadas..."
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white p-2.5 text-xs text-slate-800 shadow-sm placeholder:text-slate-400 focus:border-[#E05A10] focus:ring-1 focus:ring-[#E05A10] focus:outline-none"
              />
            </div>
          </form>

          {/* Historial / Bitácora de Gestiones Previas de Esta Factura */}
          <div className="pt-2 border-t border-slate-200">
            <div className="flex items-center gap-1.5 mb-2 text-xs font-bold text-slate-700">
              <History className="h-3.5 w-3.5 text-[#E05A10]" />
              <span>Bitácora Histórica ({gestionesPrevias.length})</span>
            </div>

            {gestionesPrevias.length === 0 ? (
              <div className="rounded-md border border-dashed border-slate-200 bg-slate-50/50 p-3 text-center text-xs text-slate-600">
                Esta factura no registra gestiones de cobranza previas.
              </div>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {gestionesPrevias.map((g) => {
                  return (
                    <div
                      key={g.id}
                      className="rounded-lg border border-slate-200 bg-slate-50/60 p-2.5 text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between text-[11px]">
                        <div className="flex items-center gap-1.5 font-semibold">
                          {g.tipo_gestion === "LLAMADA" && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-amber-50 text-amber-800 border border-amber-300">
                              <PhoneCall className="h-2.5 w-2.5" /> LLAMADA
                            </span>
                          )}
                          {g.tipo_gestion === "CORREO" && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-sky-50 text-sky-800 border border-sky-300">
                              <Mail className="h-2.5 w-2.5" /> CORREO
                            </span>
                          )}
                          {g.tipo_gestion === "WHATSAPP" && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-emerald-50 text-emerald-800 border border-emerald-300">
                              <MessageSquare className="h-2.5 w-2.5" /> WHATSAPP
                            </span>
                          )}
                          <span className="text-slate-700">
                            por {g.usuario_nombre || "Sistema"}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-600 font-mono">
                          {new Date(g.created_at).toLocaleString("es-CL", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>

                      <p className="text-slate-700 text-xs leading-relaxed">
                        {g.observaciones}
                      </p>

                      <div className="flex flex-wrap items-center gap-2 pt-1 text-[10px] text-slate-600">
                        {g.fecha_compromiso_pago && (
                          <span className="inline-flex items-center gap-1 font-mono font-medium text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                            <Calendar className="h-3 w-3" /> Compromiso:{" "}
                            {formatDateCL(g.fecha_compromiso_pago)}
                          </span>
                        )}
                        {g.contacto_nombre && (
                          <span className="text-slate-600">
                            Contacto: <strong>{g.contacto_nombre}</strong>
                          </span>
                        )}
                        {g.contacto_telefono_email && (
                          <span className="font-mono text-slate-600">
                            ({g.contacto_telefono_email})
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="border-t border-slate-200 bg-slate-50 px-5 py-3 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
          >
            Cancelar
          </button>

          <button
            type="submit"
            form="form-registrar-gestion"
            disabled={isPending}
            className="inline-flex items-center gap-1.5 rounded-md bg-[#E05A10] px-4 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-[#c94f0e] transition-colors disabled:opacity-50"
          >
            {isPending ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Guardando...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Guardar Gestión</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
