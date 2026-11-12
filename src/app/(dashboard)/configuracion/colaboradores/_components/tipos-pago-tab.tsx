"use client";

import React, { useState } from "react";
import {
  Search,
  Pencil,
  X,
  Loader2,
  Tags,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { MantenedorTipoPago } from "@/types/database.types";
import {
  upsertTipoPagoAction,
  toggleTipoPagoStatusAction,
} from "@/actions/tesoreria.actions";
import { cn, formatDateCL } from "@/lib/utils";

interface TiposPagoTabProps {
  initialTiposPago: MantenedorTipoPago[];
}

export function TiposPagoTab({ initialTiposPago }: TiposPagoTabProps) {
  const [tipos, setTipos] = useState<MantenedorTipoPago[]>(initialTiposPago);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVO" | "INACTIVO">("ALL");

  // Modal de Creación / Edición
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MantenedorTipoPago | null>(null);
  const [formNombre, setFormNombre] = useState("");
  const [formDescripcion, setFormDescripcion] = useState("");
  const [formActivo, setFormActivo] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const openCreateModal = () => {
    setEditingItem(null);
    setFormNombre("");
    setFormDescripcion("");
    setFormActivo(true);
    setFormError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (item: MantenedorTipoPago) => {
    setEditingItem(item);
    setFormNombre(item.nombre);
    setFormDescripcion(item.descripcion || "");
    setFormActivo(item.activo !== false);
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleToggleStatus = async (item: MantenedorTipoPago) => {
    const currentStatus = item.activo !== false;
    const newStatus = !currentStatus;

    setTipos((prev) =>
      prev.map((t) => (t.id === item.id ? { ...t, activo: newStatus } : t))
    );

    const res = await toggleTipoPagoStatusAction(item.id, newStatus);
    if (!res.success) {
      setTipos((prev) =>
        prev.map((t) => (t.id === item.id ? { ...t, activo: currentStatus } : t))
      );
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formNombre.trim()) {
      setFormError("El Nombre del Tipo de Pago es obligatorio.");
      return;
    }

    setIsSubmitting(true);
    try {
      const saved = await upsertTipoPagoAction({
        id: editingItem?.id,
        nombre: formNombre.trim().toUpperCase(),
        descripcion: formDescripcion.trim() || null,
        activo: formActivo,
      });

      setTipos((prev) => {
        const idx = prev.findIndex(
          (t) =>
            t.id === saved.id ||
            t.nombre.toUpperCase() === saved.nombre.toUpperCase()
        );
        if (idx !== -1) {
          const next = [...prev];
          next[idx] = saved;
          return next.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
        }
        return [...prev, saved].sort((a, b) =>
          a.nombre.localeCompare(b.nombre, "es")
        );
      });

      setIsModalOpen(false);
    } catch (err: unknown) {
      setFormError(
        err instanceof Error ? err.message : "Error al guardar el Tipo de Pago."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredTipos = tipos.filter((item) => {
    const isActivo = item.activo !== false;
    if (statusFilter === "ACTIVO" && !isActivo) return false;
    if (statusFilter === "INACTIVO" && isActivo) return false;

    if (searchTerm.trim()) {
      const q = searchTerm.trim().toLowerCase();
      return (
        item.nombre.toLowerCase().includes(q) ||
        (item.descripcion && item.descripcion.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const totalRegistrados = tipos.length;
  const totalActivos = tipos.filter((t) => t.activo !== false).length;
  const totalInactivos = tipos.filter((t) => t.activo === false).length;

  return (
    <div className="space-y-5">
      {/* KPIs de Tipos de Pago */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full">
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col justify-between">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            TOTAL TIPOS DE PAGO
          </span>
          <span className="text-2xl font-black text-slate-900 font-mono mt-2">
            {totalRegistrados}
          </span>
          <span className="text-[11px] text-slate-400 mt-1">
            Catálogo de clasificación para Cartolas Bancarias
          </span>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              TIPOS DE PAGO ACTIVOS
            </span>
            <span className="text-xs font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
              Habilitados
            </span>
          </div>
          <span className="text-2xl font-black text-slate-900 font-mono mt-2">
            {totalActivos}
          </span>
          <span className="text-[11px] text-slate-400 mt-1">
            Disponibles en el selector de Cartolas
          </span>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              TIPOS DE PAGO INACTIVOS
            </span>
            <span className="text-xs font-bold text-rose-600 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full">
              Inactivos
            </span>
          </div>
          <span className="text-2xl font-black text-slate-900 font-mono mt-2">
            {totalInactivos}
          </span>
          <span className="text-[11px] text-slate-400 mt-1">
            Ocultos para nuevas clasificaciones
          </span>
        </div>
      </div>

      {/* Barra de Búsqueda, Filtro y Botón Nuevo */}
      <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar Tipo de Pago o descripción..."
            className="w-full rounded-lg border border-slate-300 bg-[#F8FAFC] pl-9 pr-8 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-[#E05A10] focus:outline-none transition-colors"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2.5 self-end sm:self-auto">
          <div className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-[#F1F5F9] p-1">
            {(
              [
                { key: "ALL", label: `Todos (${totalRegistrados})` },
                { key: "ACTIVO", label: `Activos (${totalActivos})` },
                { key: "INACTIVO", label: `Inactivos (${totalInactivos})` },
              ] as const
            ).map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setStatusFilter(tab.key)}
                className={cn(
                  "px-3 py-1.5 rounded-md text-xs transition-all",
                  statusFilter === tab.key
                    ? "bg-[#E05A10] text-white font-semibold shadow-sm"
                    : "text-slate-600 hover:text-slate-900 hover:bg-white font-medium"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={openCreateModal}
            className="bg-[#E05A10] hover:bg-[#c84e0c] text-white font-semibold text-xs px-4 py-2 rounded-lg flex items-center gap-2 shadow-sm transition-colors"
          >
            + Nuevo Tipo de Pago
          </button>
        </div>
      </div>

      {/* Tabla de Tipos de Pago */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-[650px] lg:min-w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#0B1528] text-slate-200 text-[11px] font-bold uppercase tracking-wider border-b border-[#1E293B]">
                <th className="py-3 px-4">NOMBRE TIPO DE PAGO</th>
                <th className="py-3 px-4">DESCRIPCIÓN / OBSERVACIÓN</th>
                <th className="py-3 px-4 w-36 text-center">CREACIÓN</th>
                <th className="py-3 px-4 w-36 text-center">ESTADO</th>
                <th className="py-3 px-4 w-40 text-right">ACCIONES</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/80 text-xs bg-white">
              {filteredTipos.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Tags className="h-8 w-8 text-slate-300" />
                      <p className="text-sm font-semibold text-slate-700">
                        No se encontraron Tipos de Pago
                      </p>
                      <p className="text-xs text-slate-400">
                        Crea un nuevo Tipo de Pago para clasificar los movimientos de cartolas bancarias.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredTipos.map((item) => {
                  const isActivo = item.activo !== false;
                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-slate-50/80 transition-colors"
                    >
                      <td className="py-3 px-4 font-bold text-slate-900">
                        <span className="inline-flex items-center gap-1.5">
                          <Tags className="h-3.5 w-3.5 text-[#E05A10]" />
                          {item.nombre}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-600">
                        {item.descripcion || (
                          <span className="text-slate-400 italic">Sin descripción</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center text-slate-500 font-mono">
                        {formatDateCL(item.created_at)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {isActivo ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            Activo
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 border border-rose-200 px-2.5 py-0.5 text-[11px] font-bold text-rose-700">
                            <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                            No Activo
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEditModal(item)}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-colors"
                          >
                            <Pencil className="h-3 w-3 text-slate-500" />
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleStatus(item)}
                            className={cn(
                              "inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-[11px] font-semibold transition-colors",
                              isActivo
                                ? "border-rose-200 bg-rose-50/60 text-rose-700 hover:bg-rose-100"
                                : "border-emerald-200 bg-emerald-50/60 text-emerald-700 hover:bg-emerald-100"
                            )}
                          >
                            {isActivo ? "Desactivar" : "Activar"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Crear / Editar Tipo de Pago */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
          <div className="w-[95vw] sm:w-full max-w-md max-h-[90vh] overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 bg-[#0B1528] px-5 py-4 text-white">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#E05A10] text-white">
                  <Tags className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold">
                    {editingItem ? "Editar Tipo de Pago" : "Nuevo Tipo de Pago"}
                  </h3>
                  <p className="text-[11px] text-slate-300">
                    Catálogo de clasificación para movimientos de Cartolas Bancarias
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              {formError && (
                <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />
                  <span>{formError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Nombre Tipo de Pago <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={formNombre}
                  onChange={(e) => setFormNombre(e.target.value.toUpperCase())}
                  placeholder="Ej: ORDEN DE COMPRA, PAGOS A PROVEEDORES..."
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900 uppercase focus:border-[#E05A10] focus:outline-none focus:ring-2 focus:ring-[#E05A10]/20"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Descripción / Observación{" "}
                  <span className="text-slate-400 font-normal">(Opcional)</span>
                </label>
                <textarea
                  rows={2}
                  value={formDescripcion}
                  onChange={(e) => setFormDescripcion(e.target.value)}
                  placeholder="Descripción breve del tipo de movimiento..."
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 focus:border-[#E05A10] focus:outline-none focus:ring-2 focus:ring-[#E05A10]/20 resize-none"
                />
              </div>

              <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5">
                <div>
                  <span className="text-xs font-bold text-slate-800 block">
                    Estado del Tipo de Pago
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Disponible en el selector de Cartolas Bancarias
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setFormActivo(!formActivo)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold transition-colors",
                    formActivo
                      ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                      : "bg-slate-200 text-slate-700 border border-slate-300"
                  )}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {formActivo ? "Activo" : "Inactivo"}
                </button>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  disabled={isSubmitting}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#E05A10] px-4 py-2 text-xs font-semibold text-white hover:bg-[#c84e0c] shadow-sm disabled:opacity-50"
                >
                  {isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Guardar Tipo de Pago
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
