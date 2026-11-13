"use client";

import React, { useState, useTransition, useEffect } from "react";
import {
  TablePagination,
  GLOBAL_PAGE_SIZE,
  paginateArray,
} from "@/components/ui/TablePagination";
import { useRouter } from "next/navigation";
import {
  FolderKanban,
  Plus,
  Search,
  Pencil,
  Trash2,
  X,
  Loader2,
  CheckCircle2,
  XCircle,
  Hash,
  AlertTriangle,
} from "lucide-react";
import { MantenedorON } from "@/types/database.types";
import {
  getMantenedorOnAction,
  upsertMantenedorOnAction,
  toggleMantenedorOnStatusAction,
  deleteMantenedorOnAction,
} from "@/actions/mantenedor-on.actions";
import { cn } from "@/lib/utils";

interface MantenedorOnClientProps {
  initialData: MantenedorON[];
  canManage?: boolean;
}

export function MantenedorOnClient({
  initialData,
  canManage = false,
}: MantenedorOnClientProps) {
  const router = useRouter();
  const [data, setData] = useState<MantenedorON[]>(initialData);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    setData(initialData);
  }, [initialData]);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVO" | "INACTIVO">("ALL");
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter]);
  const [isPending, startTransition] = useTransition();

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MantenedorON | null>(null);
  const [formCodigo, setFormCodigo] = useState("");
  const [formNombre, setFormNombre] = useState("");
  const [formDescripcion, setFormDescripcion] = useState("");
  const [formActivo, setFormActivo] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Delete Confirm State
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleSearch = (q: string) => {
    setSearchTerm(q);
    startTransition(async () => {
      const res = await getMantenedorOnAction(q);
      setData(res);
    });
  };

  const openCreateModal = () => {
    setEditingItem(null);
    setFormCodigo("");
    setFormNombre("");
    setFormDescripcion("");
    setFormActivo(true);
    setFormError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (item: MantenedorON) => {
    setEditingItem(item);
    setFormCodigo(item.codigo_on);
    setFormNombre(item.nombre_proyecto);
    setFormDescripcion(item.descripcion || "");
    setFormActivo(item.activo !== false);
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleToggleStatus = async (item: MantenedorON) => {
    const currentStatus = item.activo !== false;
    const newStatus = !currentStatus;
    setActionError(null);
    // Optimistic update
    setData((prev) =>
      prev.map((o) =>
        o.id === item.id || o.codigo_on === item.codigo_on
          ? { ...o, activo: newStatus }
          : o
      )
    );
    try {
      const res = await toggleMantenedorOnStatusAction(item.id, newStatus);
      if (!res.success) {
        throw new Error(res.error || "Error al actualizar estado");
      }
      router.refresh();
    } catch (err: unknown) {
      // Revert on error
      setData((prev) =>
        prev.map((o) =>
          o.id === item.id || o.codigo_on === item.codigo_on
            ? { ...o, activo: currentStatus }
            : o
        )
      );
      setActionError(
        err instanceof Error ? err.message : "Error al actualizar estado de ON."
      );
    }
  };

  const handleDelete = async (id: string, codigoOn?: string) => {
    if (!confirm("¿Está seguro de que desea eliminar este código ON?")) return;
    setActionError(null);
    setDeletingId(id);
    try {
      const res = await deleteMantenedorOnAction(id, codigoOn);
      if (!res.success) {
        setActionError(res.error || "Error al eliminar el código ON.");
        return;
      }
      setData((prev) => prev.filter((o) => o.id !== id));
      router.refresh();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Error al eliminar");
    } finally {
      setDeletingId(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const cleanCode = formCodigo.trim();
    if (!/^[0-9]{3}$/.test(cleanCode)) {
      setFormError("El Código ON debe tener exactamente 3 dígitos numéricos (ej. 701, 740).");
      return;
    }

    if (!formNombre.trim()) {
      setFormError("El Nombre del Proyecto / Obra es obligatorio.");
      return;
    }

    // Si es nuevo registro y el código ya existe, confirmar si desea actualizar/activar
    if (!editingItem) {
      const existing = data.find((d) => d.codigo_on === cleanCode);
      if (existing) {
        const confirmUpsert = confirm(
          `El código ON "${cleanCode}" ya existe (${existing.nombre_proyecto}). ¿Desea actualizar y guardar los datos de este proyecto?`
        );
        if (!confirmUpsert) {
          return;
        }
      }
    }

    setIsSubmitting(true);
    try {
      const res = await upsertMantenedorOnAction({
        id: editingItem?.id,
        codigo_on: cleanCode,
        nombre_proyecto: formNombre.trim(),
        descripcion: formDescripcion.trim() || null,
        activo: formActivo,
      });

      if (!res.success || !res.data) {
        setFormError(res.error || "Error al guardar el código ON.");
        return;
      }

      const saved = res.data;
      setData((prev) => {
        const idx = prev.findIndex(
          (o) => o.codigo_on === saved.codigo_on || (editingItem && o.id === editingItem.id)
        );
        if (idx !== -1) {
          const next = [...prev];
          next[idx] = saved;
          return next;
        }
        return [...prev, saved].sort((a, b) => a.codigo_on.localeCompare(b.codigo_on));
      });
      setIsModalOpen(false);
      router.refresh();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Error al guardar el código ON.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filtered view con valor 'activo' seguro
  const filteredData = data.filter((item) => {
    const isActivo = item.activo !== false;
    if (statusFilter === "ACTIVO" && !isActivo) return false;
    if (statusFilter === "INACTIVO" && isActivo) return false;
    return true;
  });

  const totalCount = data.length;
  const activeCount = data.filter((d) => d.activo !== false).length;
  const inactiveCount = data.filter((d) => d.activo === false).length;

  return (
    <div className="w-full min-h-screen space-y-6 p-6 bg-[#0B0F17] text-slate-100">
      {/* Header Corporativo Ejecutivo */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800 pb-5">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-orange-500/10 text-orange-400 ring-1 ring-orange-500/20">
            <FolderKanban className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              Mantenedor de ON
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-orange-950/60 border border-orange-800/60 text-orange-400">
                3 Dígitos
              </span>
            </h1>
            <p className="text-xs text-slate-400">
              Catálogo maestro de proyectos y obras (ON) para asignación obligatoria en Facturas de Ventas y Garantías.
            </p>
          </div>
        </div>

        {canManage && (
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#E05A10] px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-[#c94e0c] transition-colors"
          >
            <Plus className="h-4 w-4" />
            Nueva ON
          </button>
        )}
      </div>

      {/* Alerta roja visible de error */}
      {actionError && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-xl border border-rose-500/40 bg-rose-950/60 px-4 py-3 text-xs text-rose-200"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0" />
            <span>{actionError}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="text-rose-400 hover:text-white"
            aria-label="Cerrar error"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* KPI Cards Superiores (3 Columnas Equilibradas) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Total Proyectos ON
            </span>
            <div className="p-1.5 rounded-lg bg-slate-800/60 border border-slate-700/50">
              <Hash className="h-4 w-4 text-slate-400" />
            </div>
          </div>
          <div className="mt-2 text-3xl font-bold text-white font-mono">{totalCount}</div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              ONs Habilitadas
            </span>
            <div className="p-1.5 rounded-lg bg-emerald-950/30 border border-emerald-800/40">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            </div>
          </div>
          <div className="mt-2 text-3xl font-bold text-white font-mono">{activeCount}</div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              ONs Inactivas
            </span>
            <div className="p-1.5 rounded-lg bg-slate-800/60 border border-slate-700/50">
              <XCircle className="h-4 w-4 text-slate-400" />
            </div>
          </div>
          <div className="mt-2 text-3xl font-bold text-white font-mono">{inactiveCount}</div>
        </div>
      </div>

      {/* Toolbar / Search & Filter Pills */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-900/90 border border-slate-800 p-3 rounded-xl shadow-sm">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por código ON o nombre de proyecto..."
            value={searchTerm}
            onChange={(e) => handleSearch(e.target.value)}
            className="w-full rounded-lg bg-slate-900 border border-slate-800 pl-9 pr-8 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-[#E05A10]"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => handleSearch("")}
              className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-200"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5 self-end sm:self-auto bg-slate-950/60 p-1 rounded-lg border border-slate-800">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-2">
            Estado:
          </span>
          {(["ALL", "ACTIVO", "INACTIVO"] as const).map((filter) => (
            <button
              key={filter}
              type="button"
              onClick={() => setStatusFilter(filter)}
              className={cn(
                "px-3 py-1 text-xs font-medium rounded-md transition-all",
                statusFilter === filter
                  ? "bg-[#E05A10] text-white font-semibold shadow-sm"
                  : "text-slate-400 hover:text-white hover:bg-slate-800/60"
              )}
            >
              {filter === "ALL" ? "Todos" : filter === "ACTIVO" ? "Activos" : "Inactivos"}
            </button>
          ))}
        </div>
      </div>

      {/* Tabla Corporativa de Registros (Sin Mandante) */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/90 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-[650px] lg:min-w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900 text-xs font-semibold tracking-wider text-slate-400 uppercase">
                <th className="py-3 px-4 w-32">CÓDIGO ON</th>
                <th className="py-3 px-4">PROYECTO / OBRA</th>
                <th className="py-3 px-4 text-center w-36">ESTADO</th>
                <th className="py-3 px-4 text-right w-28">ACCIONES</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-xs">
              {filteredData.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-12 text-center text-slate-400">
                    No se encontraron códigos ON con los criterios de búsqueda actuales.
                  </td>
                </tr>
              ) : (
                paginateArray(filteredData, currentPage, GLOBAL_PAGE_SIZE).map((item) => (
                  <tr
                    key={item.id}
                    className="hover:bg-slate-900/60 border-b border-slate-800/60 transition-colors group"
                  >
                    {/* Código ON Badge */}
                    <td className="py-3 px-4 font-mono">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-bold text-xs bg-orange-950/20 text-orange-400 border border-orange-500/40">
                        <Hash className="h-3 w-3" />
                        ON {item.codigo_on}
                      </span>
                    </td>

                    {/* Proyecto / Obra (Ancho expandido) */}
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-100 text-sm">
                        {item.nombre_proyecto}
                      </div>
                      {item.descripcion && (
                        <div className="text-[11px] text-slate-400 line-clamp-1 mt-0.5">
                          {item.descripcion}
                        </div>
                      )}
                    </td>

                    {/* Estado con Toggle */}
                    <td className="py-3 px-4 text-center">
                      {canManage ? (
                        <button
                          type="button"
                          onClick={() => handleToggleStatus(item)}
                          title="Haga clic para cambiar estado"
                          className={cn(
                            "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all cursor-pointer shadow-xs",
                            item.activo !== false
                              ? "bg-emerald-950/30 text-emerald-400 border-emerald-800/30 hover:bg-emerald-950/60"
                              : "bg-slate-800/60 text-slate-400 border-slate-700 hover:bg-slate-800"
                          )}
                        >
                          <span
                            className={cn(
                              "h-1.5 w-1.5 rounded-full",
                              item.activo !== false ? "bg-emerald-400" : "bg-slate-500"
                            )}
                          />
                          {item.activo !== false ? "ACTIVO" : "INACTIVO"}
                        </button>
                      ) : (
                        <span
                          className={cn(
                            "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border",
                            item.activo !== false
                              ? "bg-emerald-950/30 text-emerald-400 border-emerald-800/30"
                              : "bg-slate-800/60 text-slate-400 border-slate-700"
                          )}
                        >
                          <span
                            className={cn(
                              "h-1.5 w-1.5 rounded-full",
                              item.activo !== false ? "bg-emerald-400" : "bg-slate-500"
                            )}
                          />
                          {item.activo !== false ? "ACTIVO" : "INACTIVO"}
                        </span>
                      )}
                    </td>

                    {/* Acciones */}
                    <td className="py-3 px-4 text-right">
                      {canManage ? (
                        <div className="inline-flex items-center gap-1.5 justify-end">
                          <button
                            type="button"
                            onClick={() => openEditModal(item)}
                            className="p-1.5 rounded-md text-slate-400 hover:text-orange-400 hover:bg-slate-800 transition-colors"
                            title="Editar ON"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(item.id, item.codigo_on)}
                            disabled={deletingId === item.id}
                            className="p-1.5 rounded-md text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors disabled:opacity-50"
                            title="Eliminar ON"
                          >
                            {deletingId === item.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-500">
                          Solo lectura
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <TablePagination
          currentPage={currentPage}
          totalItems={filteredData.length}
          pageSize={GLOBAL_PAGE_SIZE}
          onPageChange={setCurrentPage}
          dark
        />
      </div>

      {/* Modal Crear / Editar (Sin Campo Mandante) */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="relative w-[95vw] sm:w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-2">
                <FolderKanban className="h-5 w-5 text-orange-400" />
                <h2 className="text-base font-bold text-white">
                  {editingItem ? "Editar Proyecto / Código ON" : "Registrar Nueva ON"}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Formulario */}
            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              {formError && (
                <div className="flex items-center gap-2 rounded-lg bg-rose-500/10 border border-rose-500/30 p-3 text-xs text-rose-300">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Código ON */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Código ON <span className="text-rose-400">*</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-orange-400 font-mono text-xs font-bold">
                    ON
                  </div>
                  <input
                    type="text"
                    maxLength={3}
                    placeholder="740"
                    value={formCodigo}
                    onChange={(e) => {
                      const val = e.target.value.replace(/[^0-9]/g, "");
                      setFormCodigo(val);
                    }}
                    className="w-full rounded-lg bg-slate-950 border border-slate-700 pl-11 pr-3 py-2 text-xs font-mono font-bold text-white focus:outline-none focus:border-orange-500"
                    required
                  />
                </div>
                <p className="mt-1 text-[11px] text-slate-400">
                  Debe estar compuesto por exactamente **3 dígitos numéricos** (ej. 701, 719, 740).
                </p>
              </div>

              {/* Nombre Proyecto / Obra */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Nombre del Proyecto / Obra <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Ej. Línea 2 Metro de Santiago / Puente Chacao / CD Imolog"
                  value={formNombre}
                  onChange={(e) => setFormNombre(e.target.value)}
                  className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-white focus:outline-none focus:border-orange-500"
                  required
                />
              </div>

              {/* Descripción / Observación */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Descripción / Observación <span className="text-slate-500">(Opcional)</span>
                </label>
                <textarea
                  rows={2}
                  placeholder="Detalle de obras, frentes de trabajo o alcances..."
                  value={formDescripcion}
                  onChange={(e) => setFormDescripcion(e.target.value)}
                  className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-white focus:outline-none focus:border-orange-500 resize-none"
                />
              </div>

              {/* Estado Activo / Inactivo */}
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="formActivo"
                  checked={formActivo}
                  onChange={(e) => setFormActivo(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-700 bg-slate-950 text-orange-600 focus:ring-orange-500"
                />
                <label htmlFor="formActivo" className="text-xs text-slate-300 cursor-pointer">
                  Habilitar ON inmediatamente para asignación y operaciones
                </label>
              </div>

              {/* Footer Buttons */}
              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
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
                  {isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {editingItem ? "Actualizar ON" : "Guardar ON"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
