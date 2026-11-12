"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  FolderKanban,
  X,
  Search,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ExternalLink,
  Hash,
  ShieldCheck,
} from "lucide-react";
import { FacturaVenta, MantenedorON } from "@/types/database.types";
import { asignarOnFacturaAction } from "@/actions/facturas-ventas.actions";
import { formatCLP, formatRutDisplay } from "@/lib/utils";

interface AssignOnModalProps {
  factura: FacturaVenta;
  catalogoOn: MantenedorON[];
  onClose: () => void;
  onSuccess: (facturaId: string, assignedOn: string) => void;
}

export function AssignOnModal({
  factura,
  catalogoOn,
  onClose,
  onSuccess,
}: AssignOnModalProps) {
  const [selectedOn, setSelectedOn] = useState(factura.on_proyecto || "");
  const [searchFilter, setSearchFilter] = useState("");
  const [manualCode, setManualCode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Filter active catalog items
  const activeCatalog = catalogoOn.filter((item) => item.activo);

  const filteredCatalog = activeCatalog.filter(
    (item) =>
      item.codigo_on.includes(searchFilter) ||
      item.nombre_proyecto.toLowerCase().includes(searchFilter.toLowerCase()) ||
      (item.cliente_mandante || "").toLowerCase().includes(searchFilter.toLowerCase())
  );

  const handleSelectOn = (codigo: string) => {
    setSelectedOn(codigo);
    setManualCode(codigo);
    setErrorMessage(null);
  };

  const handleManualCodeChange = (val: string) => {
    const clean = val.replace(/[^0-9]/g, "");
    setManualCode(clean);
    setSelectedOn(clean);
    setErrorMessage(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const onToAssign = (selectedOn || manualCode).trim();
    if (!/^[0-9]{3}$/.test(onToAssign)) {
      setErrorMessage(
        "Debe seleccionar o ingresar un Código ON válido de exactamente 3 dígitos numéricos (ej. 701, 740)."
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await asignarOnFacturaAction({
        facturaId: factura.id,
        onProyecto: onToAssign,
      });

      if (res.success) {
        onSuccess(factura.id, res.on_proyecto);
        onClose();
      }
    } catch (err: any) {
      setErrorMessage(err?.message || "Error al asignar la Orden Número.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="relative w-[95vw] sm:w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl border border-slate-700 bg-[#0F172A] p-4 sm:p-6 text-slate-100 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-500/10 text-orange-400 ring-1 ring-orange-500/20">
              <FolderKanban className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                Asignación de ON al Documento
              </h2>
              <p className="text-[11px] text-slate-400">
                Asigne el código de proyecto de 3 dígitos para desbloquear pagos y cesión.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Resumen del Documento */}
        <div className="mt-4 rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Documento:</span>
            <span className="font-bold text-slate-200">
              Factura #{factura.folio}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Cliente:</span>
            <span className="font-medium text-slate-200 truncate max-w-[260px]" title={factura.razon_social}>
              {factura.razon_social} ({formatRutDisplay(factura.rut_cliente)})
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Monto Total:</span>
            <span className="font-mono font-bold text-orange-400">
              {formatCLP(factura.monto_total)}
            </span>
          </div>
          {factura.deuda_cliente !== undefined && factura.deuda_cliente !== null && (
            <div className="flex items-center justify-between border-t border-slate-800/80 pt-1.5">
              <span className="text-slate-400">Deuda Pendiente:</span>
              <span className="font-mono font-semibold text-rose-400">
                {formatCLP(factura.deuda_cliente)}
              </span>
            </div>
          )}
        </div>

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {errorMessage && (
            <div className="flex items-center gap-2 rounded-lg bg-rose-500/10 border border-rose-500/30 p-2.5 text-xs text-rose-300">
              <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Selector de Catálogo de ONs */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-300">
                Seleccionar del Catálogo de Proyectos (ON)
              </label>
              <Link
                href="/configuracion/mantenedor-on"
                target="_blank"
                className="inline-flex items-center gap-1 text-[11px] text-orange-400 hover:text-orange-300"
              >
                <span>Mantenedor de ON</span>
                <ExternalLink className="h-3 w-3" />
              </Link>
            </div>

            {/* Buscador en catálogo */}
            <div className="relative mb-2">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Filtrar por código o nombre de proyecto..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="w-full rounded-md bg-slate-900 border border-slate-700 pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-orange-500"
              />
            </div>

            {/* Lista de selección de ONs */}
            <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-800 bg-slate-900/80 divide-y divide-slate-800/60">
              {filteredCatalog.length === 0 ? (
                <div className="p-3 text-center text-xs text-slate-500">
                  No se encontraron proyectos activos con el filtro aplicado.
                </div>
              ) : (
                filteredCatalog.map((item) => {
                  const isSelected = selectedOn === item.codigo_on;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleSelectOn(item.codigo_on)}
                      className={`w-full text-left p-2.5 text-xs transition-colors flex items-center justify-between ${
                        isSelected
                          ? "bg-orange-950/40 border-l-2 border-orange-500 text-orange-200"
                          : "hover:bg-slate-800/60 text-slate-300"
                      }`}
                    >
                      <div className="min-w-0 pr-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-orange-400 bg-orange-950/60 px-1.5 py-0.5 rounded text-[11px] border border-orange-800/50">
                            ON {item.codigo_on}
                          </span>
                          <span className="font-medium text-slate-200 truncate">
                            {item.nombre_proyecto}
                          </span>
                        </div>
                        {item.cliente_mandante && (
                          <div className="text-[10px] text-slate-400 truncate mt-0.5 pl-0.5">
                            {item.cliente_mandante}
                          </div>
                        )}
                      </div>
                      {isSelected && (
                        <CheckCircle2 className="h-4 w-4 text-orange-400 shrink-0" />
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Entrada directa o manual de 3 dígitos */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Código ON Asignado <span className="text-orange-400">*</span>
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-orange-400 font-mono text-xs font-bold">
                ON
              </div>
              <input
                type="text"
                maxLength={3}
                placeholder="740"
                value={manualCode || selectedOn}
                onChange={(e) => handleManualCodeChange(e.target.value)}
                className="w-full rounded-lg bg-slate-900 border border-slate-700 pl-11 pr-3 py-2 text-xs font-mono font-bold text-slate-100 focus:outline-none focus:border-orange-500"
                required
              />
            </div>
            <p className="mt-1 text-[11px] text-slate-400">
              Formato numérico estricto de 3 dígitos (ej. 701, 719, 740).
            </p>
          </div>

          {/* Gatekeeper alert notification */}
          <div className="flex items-start gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 p-2.5 text-xs text-emerald-300">
            <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-400 mt-0.5" />
            <p className="text-[11px] leading-relaxed">
              Al guardar la ON, el documento quedará habilitado de inmediato para
              operaciones de cobranza, cesión a factoring y registro de pagos.
            </p>
          </div>

          {/* Botones de acción */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-lg bg-slate-800 px-3.5 py-2 text-xs font-medium text-slate-300 hover:bg-slate-700 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-1.5 rounded-lg bg-orange-600 px-4 py-2 text-xs font-semibold text-white hover:bg-orange-500 transition-colors disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Guardando...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Guardar y Habilitar Factura
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
