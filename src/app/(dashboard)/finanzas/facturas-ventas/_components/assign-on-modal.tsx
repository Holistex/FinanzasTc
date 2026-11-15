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
  CalendarClock,
} from "lucide-react";
import { FacturaVenta, MantenedorON } from "@/types/database.types";
import { asignarOnFacturaAction } from "@/actions/facturas-ventas.actions";
import { formatCLP, formatDateCL, formatRutDisplay } from "@/lib/utils";

const PLAZOS_VENCIMIENTO = [30, 60, 90] as const;
type PlazoVencimiento = (typeof PLAZOS_VENCIMIENTO)[number];

function calcularFechaVencimiento(fechaEmision: string, dias: number): string {
  const [y, m, d] = fechaEmision.split("T")[0].split("-").map(Number);
  if (!y || !m || !d) return fechaEmision;
  const fecha = new Date(Date.UTC(y, m - 1, d + dias));
  return fecha.toISOString().split("T")[0];
}

function inferPlazoInicial(factura: FacturaVenta): PlazoVencimiento {
  if (factura.plazo_dias === 60 || factura.plazo_dias === 90 || factura.plazo_dias === 30) {
    return factura.plazo_dias;
  }
  if (factura.fecha_docto && factura.fecha_vencimiento) {
    const [ey, em, ed] = factura.fecha_docto.split("T")[0].split("-").map(Number);
    const [vy, vm, vd] = factura.fecha_vencimiento.split("T")[0].split("-").map(Number);
    if (ey && em && ed && vy && vm && vd) {
      const diffDays = Math.round(
        (Date.UTC(vy, vm - 1, vd) - Date.UTC(ey, em - 1, ed)) / 86400000
      );
      if (diffDays === 60) return 60;
      if (diffDays === 90) return 90;
    }
  }
  return 30;
}

interface AssignOnModalProps {
  factura: FacturaVenta;
  catalogoOn: MantenedorON[];
  onClose: () => void;
  onSuccess: (
    facturaId: string,
    assignedOn: string,
    fechaVencimiento?: string | null,
    plazoDias?: number
  ) => void;
}

export function AssignOnModal({
  factura,
  catalogoOn,
  onClose,
  onSuccess,
}: AssignOnModalProps) {
  const [selectedOn, setSelectedOn] = useState(factura.on_proyecto || "");
  const [plazoDias, setPlazoDias] = useState<PlazoVencimiento>(() =>
    inferPlazoInicial(factura)
  );
  const [searchFilter, setSearchFilter] = useState("");
  const [manualCode, setManualCode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fechaVencimientoPreview = factura.fecha_docto
    ? calcularFechaVencimiento(factura.fecha_docto, plazoDias)
    : null;

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
        plazoDias,
      });

      if (res.success) {
        onSuccess(
          factura.id,
          res.on_proyecto,
          res.fecha_vencimiento ?? fechaVencimientoPreview,
          res.plazo_dias
        );
        onClose();
      }
    } catch (err: any) {
      setErrorMessage(err?.message || "Error al asignar la Orden Número.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
      <div className="relative w-[95vw] sm:w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 text-slate-800 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 border border-orange-200 text-[#E05A10]">
              <FolderKanban className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Asignación de ON al Documento
              </h2>
              <p className="text-xs text-slate-500">
                Asigne el código de proyecto de 3 dígitos y plazo de vencimiento.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
            aria-label="Cerrar modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Resumen del Documento */}
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-slate-500">Documento:</span>
            <span className="font-bold text-slate-900">
              Factura #{factura.folio}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-slate-500 shrink-0">Cliente:</span>
            <span
              className="font-semibold text-slate-800 truncate max-w-[280px]"
              title={factura.razon_social}
            >
              {factura.razon_social} ({formatRutDisplay(factura.rut_cliente)})
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-500">Monto Total:</span>
            <span className="font-mono font-bold text-slate-900">
              {formatCLP(factura.monto_total)}
            </span>
          </div>
          {factura.deuda_cliente !== undefined && factura.deuda_cliente !== null && (
            <div className="flex items-center justify-between border-t border-slate-200 pt-2">
              <span className="text-slate-500">Deuda Pendiente:</span>
              <span className="font-mono font-semibold text-slate-700">
                {formatCLP(factura.deuda_cliente)}
              </span>
            </div>
          )}
        </div>

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {errorMessage && (
            <div className="flex items-center gap-2 rounded-lg bg-rose-50 border border-rose-200 p-2.5 text-xs text-rose-700">
              <AlertTriangle className="h-4 w-4 shrink-0 text-rose-500" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Selector de Catálogo de ONs */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-slate-700">
                Seleccionar del Catálogo de Proyectos (ON)
              </label>
              <Link
                href="/configuracion/mantenedor-on"
                target="_blank"
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#E05A10] hover:underline"
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
                className="w-full rounded-lg bg-white border border-slate-300 pl-8 pr-3 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-[#E05A10] focus:ring-1 focus:ring-[#E05A10]"
              />
            </div>

            {/* Lista de selección de ONs */}
            <div className="max-h-44 overflow-y-auto rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
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
                          ? "bg-orange-50/70"
                          : "hover:bg-slate-50"
                      }`}
                    >
                      <div className="min-w-0 pr-2">
                        <div className="flex items-center gap-2">
                          <span
                            className={`font-mono font-bold text-xs px-2 py-0.5 rounded ${
                              isSelected
                                ? "bg-[#E05A10] text-white"
                                : "bg-slate-100 border border-slate-300 text-slate-800"
                            }`}
                          >
                            ON {item.codigo_on}
                          </span>
                          <span className="text-slate-800 text-xs font-medium truncate">
                            {item.nombre_proyecto}
                          </span>
                        </div>
                        {item.cliente_mandante && (
                          <div className="text-[11px] text-slate-500 truncate mt-0.5 pl-0.5">
                            {item.cliente_mandante}
                          </div>
                        )}
                      </div>
                      {isSelected && (
                        <CheckCircle2 className="h-4 w-4 text-[#E05A10] shrink-0" />
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Entrada directa o manual de 3 dígitos */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Código ON Asignado <span className="text-[#E05A10]">*</span>
            </label>
            <div className="bg-white border border-slate-300 rounded-lg px-3 py-2 flex items-center gap-2 focus-within:border-[#E05A10] focus-within:ring-1 focus-within:ring-[#E05A10]">
              <span className="text-xs font-bold text-[#E05A10] uppercase font-mono">
                ON
              </span>
              <input
                type="text"
                maxLength={3}
                placeholder="740"
                value={manualCode || selectedOn}
                onChange={(e) => handleManualCodeChange(e.target.value)}
                className="w-full text-sm font-mono font-bold text-slate-900 bg-transparent focus:outline-none"
                required
              />
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              Formato numérico estricto de 3 dígitos (ej. 701, 719, 740).
            </p>
          </div>

          {/* Selector de Plazo de Vencimiento (30, 60, 90 días) */}
          <div>
            <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 mb-1.5">
              <CalendarClock className="h-3.5 w-3.5 text-[#E05A10]" />
              <span>Plazo de Vencimiento</span>
              <span className="text-[#E05A10]">*</span>
            </label>
            <div
              role="group"
              aria-label="Plazo de vencimiento"
              className="grid grid-cols-3 gap-2.5"
            >
              {PLAZOS_VENCIMIENTO.map((dias) => {
                const active = plazoDias === dias;
                return (
                  <button
                    key={dias}
                    type="button"
                    onClick={() => setPlazoDias(dias)}
                    className={
                      active
                        ? "bg-orange-50 border-2 border-[#E05A10] text-[#E05A10] font-bold text-xs py-2.5 rounded-lg shadow-xs"
                        : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300 font-semibold text-xs py-2.5 rounded-lg transition-colors"
                    }
                  >
                    {dias} días
                  </button>
                );
              })}
            </div>
            {fechaVencimientoPreview && (
              <div className="mt-2 flex items-center justify-between text-xs">
                <span className="text-slate-500">
                  Emisión:{" "}
                  <span className="font-mono text-slate-700">
                    {formatDateCL(factura.fecha_docto)}
                  </span>
                </span>
                <span className="text-slate-600">
                  Nueva fecha de vencimiento:{" "}
                  <strong className="font-mono font-bold text-slate-900">
                    {formatDateCL(fechaVencimientoPreview)}
                  </strong>
                </span>
              </div>
            )}
          </div>

          {/* Nota informativa sobria */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-600 flex items-center gap-2.5">
            <ShieldCheck className="h-4 w-4 shrink-0 text-slate-500" />
            <p className="text-[11px] leading-relaxed">
              Al guardar la ON, el documento quedará habilitado de inmediato para
              operaciones de cobranza, cesión a factoring y registro de pagos.
            </p>
          </div>

          {/* Botones de acción */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 font-semibold text-xs px-4 py-2.5 rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-1.5 bg-[#E05A10] hover:bg-[#c84e0c] text-white font-bold text-xs px-5 py-2.5 rounded-lg shadow-sm transition-colors disabled:opacity-50"
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
