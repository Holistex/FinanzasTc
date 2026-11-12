"use client";

import React from "react";
import { EstratoDeudaItem } from "@/actions/deuda-proveedores.actions";
import { formatCLP } from "@/lib/utils";
import { ArrowUpRight, ShieldCheck, Clock, Layers } from "lucide-react";

interface DeudaProveedoresAgingTableProps {
  estratificacion: EstratoDeudaItem[];
  totalDeudaGlobal: number;
  onVerDetalleEstrato: (estrato: EstratoDeudaItem) => void;
}

export function DeudaProveedoresAgingTable({
  estratificacion,
  totalDeudaGlobal,
  onVerDetalleEstrato,
}: DeudaProveedoresAgingTableProps) {
  // Totales consolidados de la tabla
  const totalDocs = estratificacion.reduce((sum, e) => sum + e.docs, 0);
  const totalProveedores = new Set(
    estratificacion.flatMap((e) => e.facturas.map((f) => f.rut_proveedor))
  ).size;
  const totalMonto = estratificacion.reduce((sum, e) => sum + e.total, 0);

  // Mapeo visual de estilos y badges según el estrato
  const getBadgeStyle = (color: string) => {
    switch (color) {
      case "emerald":
        return "bg-emerald-50 text-emerald-700 border-emerald-200 ring-emerald-500/10";
      case "amber":
        return "bg-amber-50 text-amber-700 border-amber-200 ring-amber-500/10";
      case "orange":
        return "bg-orange-50 text-orange-700 border-orange-200 ring-orange-500/10";
      case "rose":
        return "bg-rose-50 text-rose-700 border-rose-200 ring-rose-500/10";
      case "purple":
        return "bg-purple-50 text-purple-700 border-purple-200 ring-purple-500/10";
      default:
        return "bg-slate-100 text-slate-700 border-slate-200 ring-slate-500/10";
    }
  };

  const getProgressColor = (color: string) => {
    switch (color) {
      case "emerald":
        return "bg-emerald-500";
      case "amber":
        return "bg-amber-500";
      case "orange":
        return "bg-orange-500";
      case "rose":
        return "bg-rose-500";
      case "purple":
        return "bg-purple-600";
      default:
        return "bg-slate-500";
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Cabecera de la Tabla de Estratificación */}
      <div className="p-3.5 sm:p-4 border-b border-slate-200 bg-slate-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-slate-900 flex items-center justify-center text-white">
            <Layers className="h-4 w-4 text-[#E05A10]" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-tight">
              Estratificación de la Deuda Proveedores
            </h3>
            <p className="text-[11px] text-slate-500">
              Antigüedad y segmentación de la cartera exigible por días de vencimiento
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="text-[11px] font-semibold text-slate-600">
            5 tramos de vencimiento
          </span>
        </div>
      </div>

      {/* Contenido de la Tabla */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs text-left">
          <thead className="bg-slate-100/90 text-slate-600 font-semibold border-b border-slate-200 uppercase text-[10px] tracking-wider">
            <tr>
              <th className="py-2.5 px-4">Tramo de Vencimiento</th>
              <th className="py-2.5 px-4 text-center">Documentos</th>
              <th className="py-2.5 px-4 text-center">Proveedores</th>
              <th className="py-2.5 px-4 text-right">Monto Total ($ CLP)</th>
              <th className="py-2.5 px-4 text-center w-48">% Participación</th>
              <th className="py-2.5 px-4 text-right">Acción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200/80">
            {estratificacion.map((estrato) => {
              const badgeClasses = getBadgeStyle(estrato.color);
              const progressColor = getProgressColor(estrato.color);

              return (
                <tr
                  key={estrato.id}
                  className="hover:bg-slate-50/80 transition-colors group"
                >
                  {/* 1. TRAMO DE VENCIMIENTO */}
                  <td className="py-2.5 px-4">
                    <div className="flex items-center gap-2">
                      <span className="text-sm select-none">{estrato.badgeIcon}</span>
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold border ring-1 ${badgeClasses}`}
                      >
                        {estrato.tramo}
                      </span>
                      <span className="text-[11px] text-slate-400 font-medium hidden md:inline">
                        ({estrato.rangoMora})
                      </span>
                    </div>
                  </td>

                  {/* 2. DOCUMENTOS */}
                  <td className="py-2.5 px-4 text-center font-bold font-mono text-slate-800 text-xs">
                    {estrato.docs}
                  </td>

                  {/* 3. PROVEEDORES */}
                  <td className="py-2.5 px-4 text-center font-semibold font-mono text-slate-700 text-xs">
                    {estrato.proveedoresCount}
                  </td>

                  {/* 4. MONTO TOTAL ($ CLP) */}
                  <td className="py-2.5 px-4 text-right font-black font-mono text-xs sm:text-sm text-slate-900">
                    <span
                      className={
                        estrato.id === "mas_90" || estrato.id === "dias_61_90"
                          ? "text-red-600"
                          : "text-slate-900"
                      }
                    >
                      {formatCLP(estrato.total)}
                    </span>
                  </td>

                  {/* 5. % PARTICIPACIÓN + BARRA DE PROGRESO */}
                  <td className="py-2.5 px-4 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-24 bg-slate-200/80 rounded-full h-1.5 overflow-hidden">
                        <div
                          className={`h-1.5 rounded-full ${progressColor}`}
                          style={{ width: `${Math.min(100, estrato.porcentaje)}%` }}
                        />
                      </div>
                      <span className="font-mono font-bold text-[11px] text-slate-700 w-10 text-right">
                        {estrato.porcentaje.toFixed(1)}%
                      </span>
                    </div>
                  </td>

                  {/* 6. ACCIÓN */}
                  <td className="py-2.5 px-4 text-right">
                    <button
                      type="button"
                      onClick={() => onVerDetalleEstrato(estrato)}
                      disabled={estrato.docs === 0}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-md shadow-sm transition-all ${
                        estrato.docs === 0
                          ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                          : "bg-slate-900 text-white hover:bg-red-600"
                      }`}
                    >
                      <span>Ver Detalle</span>
                      <ArrowUpRight className="h-3 w-3" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>

          {/* Fila de Totales Consolidados */}
          <tfoot className="bg-slate-100/90 font-bold text-slate-900 border-t-2 border-slate-300">
            <tr>
              <td className="py-2.5 px-4 font-black uppercase text-[11px]">
                TOTAL CARTERA AUDITADA
              </td>
              <td className="py-2.5 px-4 text-center font-black font-mono text-xs">
                {totalDocs}
              </td>
              <td className="py-2.5 px-4 text-center font-black font-mono text-xs">
                {totalProveedores}
              </td>
              <td className="py-2.5 px-4 text-right font-black font-mono text-sm text-red-600">
                {formatCLP(totalMonto)}
              </td>
              <td className="py-2.5 px-4 text-center font-mono font-bold text-[11px]">
                100.0%
              </td>
              <td className="py-2.5 px-4 text-right text-slate-400">-</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
