"use client";

import React, { useState, useEffect } from "react";
import {
  Building2,
  Check,
  Loader2,
  X,
  Landmark,
  UserCheck,
  ArrowRightLeft,
} from "lucide-react";
import {
  EmpresaFactoringCliente,
  FacturaVenta,
  GestionPagoTipo,
} from "@/types/database.types";
import { updateGestionPagoAction } from "@/actions/facturas-ventas.actions";
import { cn, formatCLP, formatRutDisplay } from "@/lib/utils";
import Link from "next/link";

interface AssignFactoringModalProps {
  factura: FacturaVenta | null;
  factoringClientes: EmpresaFactoringCliente[];
  onClose: () => void;
  onSuccess: () => void;
}

export function AssignFactoringModal({
  factura,
  factoringClientes,
  onClose,
  onSuccess,
}: AssignFactoringModalProps) {
  const [modalidad, setModalidad] = useState<GestionPagoTipo>("FACTORING");
  const [selectedFactoringId, setSelectedFactoringId] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (factura) {
      setModalidad("FACTORING");
      setSelectedFactoringId(
        factura.factoring_cliente_id || factoringClientes[0]?.id || ""
      );
      setError(null);
    }
  }, [factura, factoringClientes]);

  if (!factura) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (modalidad === "FACTORING" && !selectedFactoringId) {
      setError("Seleccione una entidad de Factoring de la lista.");
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      await updateGestionPagoAction({
        facturaId: factura.id,
        gestionPago: modalidad,
        factoringClienteId:
          modalidad === "FACTORING" ? selectedFactoringId : null,
      });
      onSuccess();
      onClose();
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo actualizar la cesión de la factura."
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-[2px] p-4">
      <div className="bg-white border border-slate-200 rounded-lg shadow-2xl w-full max-w-md overflow-hidden">
        {/* Compact Header */}
        <div className="px-4 py-3 bg-[#0F172A] text-white flex items-center justify-between border-b border-[#1E293B]">
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded bg-[#E05A10]/20 border border-[#E05A10]/40 flex items-center justify-center text-[#E05A10]">
              <ArrowRightLeft className="h-3.5 w-3.5" />
            </div>
            <div>
              <h3 className="text-xs font-semibold tracking-tight">
                Cesión de Factura / Gestión de Pago
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

        <form onSubmit={handleSave} className="p-4 space-y-3.5">
          {/* Resumen Compacto de la Factura */}
          <div className="rounded-md bg-[#F8FAFC] border border-slate-200 px-3 py-2.5 space-y-1.5 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-slate-500 shrink-0">
                Receptor:
              </span>
              <span
                className="font-semibold text-[#0F172A] truncate"
                title={factura.razon_social}
              >
                {factura.razon_social}
              </span>
            </div>
            <div className="flex items-center justify-between pt-1.5 border-t border-slate-200/80">
              <span className="text-[11px] font-medium text-slate-600">
                Saldo Neto Cedible:
              </span>
              <span className="font-mono text-xs font-bold text-[#E05A10] tabular-nums">
                {formatCLP(factura.monto_neto_saldo)}
              </span>
            </div>
          </div>

          {/* Selector Rápido de Modalidad */}
          <div className="grid grid-cols-2 gap-2 p-1 bg-[#F1F5F9] rounded-md border border-slate-200">
            <button
              type="button"
              onClick={() => setModalidad("FACTORING")}
              className={cn(
                "flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded text-xs font-semibold transition-all",
                modalidad === "FACTORING"
                  ? "bg-white text-[#E05A10] shadow-sm border border-orange-200"
                  : "text-slate-600 hover:text-[#0F172A]"
              )}
            >
              <Landmark className="h-3.5 w-3.5" />
              Ceder a Factoring
            </button>
            <button
              type="button"
              onClick={() => setModalidad("DIRECTO_CLIENTE")}
              className={cn(
                "flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded text-xs font-semibold transition-all",
                modalidad === "DIRECTO_CLIENTE"
                  ? "bg-white text-[#0F172A] shadow-sm border border-slate-200"
                  : "text-slate-600 hover:text-[#0F172A]"
              )}
            >
              <UserCheck className="h-3.5 w-3.5 text-slate-700" />
              Directo Cliente
            </button>
          </div>

          {/* Selector de Empresa Factoring Cliente */}
          {modalidad === "FACTORING" ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">
                  Entidad de Factoring
                </label>
                <Link
                  href="/mantenedores"
                  className="text-[11px] font-semibold text-[#E05A10] hover:underline"
                >
                  + Mantenedor
                </Link>
              </div>

              {factoringClientes.length === 0 ? (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                  No existen empresas en{" "}
                  <code>empresa_factoring_cliente</code>. Agréguelas en
                  Mantenedores.
                </div>
              ) : (
                <div className="space-y-1.5 max-h-52 overflow-y-auto pr-0.5">
                  {factoringClientes.map((entidad) => {
                    const isSelected = selectedFactoringId === entidad.id;
                    return (
                      <div
                        key={entidad.id}
                        onClick={() => setSelectedFactoringId(entidad.id)}
                        className={cn(
                          "cursor-pointer rounded-md border px-3 py-2 transition-all flex items-center justify-between gap-2.5",
                          isSelected
                            ? "border-[#E05A10] bg-orange-50/50 ring-1 ring-[#E05A10]"
                            : "border-slate-200 hover:border-slate-300 bg-white"
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <Building2
                              className={cn(
                                "h-3.5 w-3.5 shrink-0",
                                isSelected
                                  ? "text-[#E05A10]"
                                  : "text-slate-400"
                              )}
                            />
                            <span className="text-xs font-semibold text-[#0F172A] truncate">
                              {entidad.razon_social}
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-500 font-mono truncate mt-0.5">
                            RUT: {formatRutDisplay(entidad.rut_cliente)}
                            {entidad.contacto_nombre
                              ? ` · Contacto: ${entidad.contacto_nombre}`
                              : ""}
                          </div>
                        </div>

                        <div
                          className={cn(
                            "h-4 w-4 rounded-full border flex items-center justify-center shrink-0",
                            isSelected
                              ? "border-[#E05A10] bg-[#E05A10] text-white"
                              : "border-slate-300"
                          )}
                        >
                          {isSelected && <Check className="h-2.5 w-2.5" />}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-md border border-slate-200 bg-[#F8FAFC] p-3 text-xs text-slate-600 flex items-center gap-2.5">
              <UserCheck className="h-4 w-4 text-[#0F172A] shrink-0" />
              <span>
                La factura quedará asignada a{" "}
                <strong className="text-[#0F172A]">Cobro Directo Cliente</strong>{" "}
                sin cesión a terceros.
              </span>
            </div>
          )}

          {error && (
            <div className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded px-3 py-2">
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
              Cancelar
            </button>
            <button
              type="submit"
              disabled={
                isSaving ||
                (modalidad === "FACTORING" && factoringClientes.length === 0)
              }
              className="inline-flex items-center gap-1.5 rounded-md bg-[#E05A10] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#C2410C] disabled:opacity-50 transition-colors"
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Guardando...
                </>
              ) : modalidad === "FACTORING" ? (
                "Confirmar Cesión Factoring"
              ) : (
                "Confirmar Pago Directo"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
