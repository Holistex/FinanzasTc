"use client";

import React, { useState, useTransition, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  TablePagination,
  GLOBAL_PAGE_SIZE,
  paginateArray,
} from "@/components/ui/TablePagination";
import {
  FileWarning,
  Plus,
  Search,
  Pencil,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Filter,
  X,
  Loader2,
  Receipt,
  FileText,
} from "lucide-react";
import {
  LitigioMulta,
  EstadoLitigioMulta,
  LitigiosMultasKpis,
} from "@/types/database.types";
import { MultasFilterParams } from "@/actions/litigios.actions";
import { cn, formatDateCL, formatCLP } from "@/lib/utils";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { QUERY_KEYS } from "@/lib/prefetch-helpers";

type MultasTab = "PENDIENTES" | "PAGADAS";

interface MultasModuleViewProps {
  initialItems: LitigioMulta[];
  initialKpis: LitigiosMultasKpis;
  onFetchAction: (
    filters?: MultasFilterParams
  ) => Promise<{ items: LitigioMulta[]; kpis: LitigiosMultasKpis }>;
  onUpsertAction: (data: any) => Promise<{ success: boolean; data?: LitigioMulta; error?: string }>;
  canManage?: boolean;
}

export function MultasModuleView({
  initialItems,
  initialKpis,
  onFetchAction,
  onUpsertAction,
  canManage = true,
}: MultasModuleViewProps) {
  const router = useRouter();
  const queryClient = useQueryClient();

  // Caché dinámico de TanStack Query: renders instantáneos (<1ms) y revalidación en segundo plano
  const { data: queryData } = useQuery({
    queryKey: QUERY_KEYS.litigiosMultas,
    queryFn: () => onFetchAction(),
    initialData: { items: initialItems, kpis: initialKpis },
    staleTime: 5 * 60 * 1000,
  });

  const [localData, setLocalData] = useState<{
    items: LitigioMulta[];
    kpis: LitigiosMultasKpis;
  }>({ items: initialItems, kpis: initialKpis });

  const items = queryData?.items ?? localData.items;
  const kpis = queryData?.kpis ?? localData.kpis;

  const updateMultasData = React.useCallback(
    (refreshed: { items: LitigioMulta[]; kpis: LitigiosMultasKpis }) => {
      queryClient.setQueryData(QUERY_KEYS.litigiosMultas, refreshed);
      setLocalData(refreshed);
    },
    [queryClient]
  );

  // Tabs: "PENDIENTES" vs "PAGADAS"
  const [activeTab, setActiveTab] = useState<MultasTab>("PENDIENTES");

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [procedenciaFilter, setProcedenciaFilter] = useState<string>("TODAS");
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, searchQuery, procedenciaFilter]);

  const [isPending, startTransition] = useTransition();

  // Modal State (Crear / Editar)
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<LitigioMulta | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form Fields
  const [formData, setFormData] = useState({
    procedencia: "",
    entidad: "",
    nro_multa: "",
    fecha_publicacion: new Date().toISOString().slice(0, 10),
    montoRaw: "",
    nro_resolucion: "",
    fecha_resolucion: "",
    fecha_pago: "",
    estado: "PENDIENTE" as EstadoLitigioMulta,
    observaciones: "",
  });

  const formatNumberInput = (val: string) => {
    const clean = val.replace(/\D/g, "");
    if (!clean) return "";
    return Number(clean).toLocaleString("es-CL");
  };

  const parseNumberInput = (val: string): number => {
    const clean = val.replace(/\D/g, "");
    return clean ? Number(clean) : 0;
  };

  // Extract unique procedencias for filter dropdown
  const uniqueProcedencias = useMemo(() => {
    const set = new Set<string>();
    items.forEach((m) => {
      if (m.procedencia && m.procedencia.trim()) {
        set.add(m.procedencia.trim());
      }
    });
    return Array.from(set).sort();
  }, [items]);

  // Tab filtering & client search
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      // 1. Tab filter
      if (activeTab === "PENDIENTES" && item.estado !== "PENDIENTE") {
        return false;
      }
      if (activeTab === "PAGADAS" && item.estado !== "PAGADA") {
        return false;
      }

      // 2. Procedencia filter
      if (procedenciaFilter !== "TODAS") {
        if (
          !item.procedencia
            .toLowerCase()
            .includes(procedenciaFilter.toLowerCase())
        ) {
          return false;
        }
      }

      // 3. Search query (incluye procedencia, entidad, nro_multa, resolucion, observaciones)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const match =
          item.procedencia.toLowerCase().includes(q) ||
          (item.entidad || "").toLowerCase().includes(q) ||
          item.nro_multa.toLowerCase().includes(q) ||
          (item.nro_resolucion || "").toLowerCase().includes(q) ||
          (item.observaciones || "").toLowerCase().includes(q);
        if (!match) return false;
      }

      return true;
    });
  }, [items, activeTab, procedenciaFilter, searchQuery]);

  // Counts for tabs
  const pendientesCount = useMemo(
    () => items.filter((m) => m.estado === "PENDIENTE").length,
    [items]
  );
  const pagadasCount = useMemo(
    () => items.filter((m) => m.estado === "PAGADA").length,
    [items]
  );

  const handleOpenCreateModal = () => {
    setEditingItem(null);
    setFormData({
      procedencia: "",
      entidad: "Dirección del Trabajo",
      nro_multa: "",
      fecha_publicacion: new Date().toISOString().slice(0, 10),
      montoRaw: "",
      nro_resolucion: "",
      fecha_resolucion: "",
      fecha_pago: "",
      estado: "PENDIENTE",
      observaciones: "",
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (item: LitigioMulta) => {
    setEditingItem(item);
    setFormData({
      procedencia: item.procedencia,
      entidad: item.entidad || "Dirección del Trabajo",
      nro_multa: item.nro_multa,
      fecha_publicacion: item.fecha_publicacion,
      montoRaw: item.monto_sancion ? Number(item.monto_sancion).toLocaleString("es-CL") : "",
      nro_resolucion: item.nro_resolucion || "",
      fecha_resolucion: item.fecha_resolucion || "",
      fecha_pago: item.fecha_pago || "",
      estado: item.estado,
      observaciones: item.observaciones || "",
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formData.procedencia.trim()) {
      setFormError("La procedencia (motivo o causal) es requerida.");
      return;
    }
    if (!formData.entidad.trim()) {
      setFormError("La entidad fiscalizadora / gestora es obligatoria.");
      return;
    }
    if (!formData.nro_multa.trim()) {
      setFormError("El N° de Multa es obligatorio.");
      return;
    }
    if (!formData.fecha_publicacion) {
      setFormError("La fecha de publicación es obligatoria.");
      return;
    }
    const monto = parseNumberInput(formData.montoRaw);
    if (monto < 0) {
      setFormError("El monto de sanción debe ser mayor o igual a 0.");
      return;
    }
    if (formData.estado === "PAGADA" && !formData.fecha_pago) {
      setFormError("Si el estado es PAGADA, debe indicar la fecha de pago.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await onUpsertAction({
        id: editingItem?.id,
        procedencia: formData.procedencia.trim(),
        entidad: formData.entidad.trim(),
        nro_multa: formData.nro_multa.trim(),
        fecha_publicacion: formData.fecha_publicacion,
        monto_sancion: monto,
        nro_resolucion: formData.nro_resolucion.trim() || null,
        fecha_resolucion: formData.fecha_resolucion || null,
        fecha_pago: formData.estado === "PAGADA" ? formData.fecha_pago : null,
        estado: formData.estado,
        observaciones: formData.observaciones.trim() || null,
      });

      if (!res.success) {
        setFormError(res.error || "Error al guardar los datos de la multa.");
        return;
      }

      // Refrescar datos y sincronizar caché
      startTransition(async () => {
        const refreshed = await onFetchAction();
        updateMultasData(refreshed);
      });

      setIsModalOpen(false);
      router.refresh();
    } catch (err: any) {
      setFormError(err.message || "Error al guardar los datos de la multa.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto select-none">
      {/* 1. Header Principal Estándar Tensacon */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-[#0F172A] text-[#E05A10] flex items-center justify-center shadow-sm">
            <FileWarning className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                Multas
              </h1>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-200 uppercase">
                REG. LITIGIOS
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Control de multas administrativas, fiscalizaciones, resoluciones y registro de pago.
            </p>
          </div>
        </div>

        {canManage && (
          <div className="flex items-center gap-2.5">
            <button
              onClick={handleOpenCreateModal}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-[#E05A10] text-white text-xs font-semibold hover:bg-[#c94e0d] transition-colors shadow-sm"
            >
              <Plus className="h-4 w-4" />
              <span>Nueva Multa</span>
            </button>
          </div>
        )}
      </div>

      {/* 2. Tarjetas KPI Superiores: Jerarquía invertida (Monto principal en $ CLP y detalle de sanciones secundario) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Tarjeta 1: Total General Sanciones */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500 uppercase tracking-wider">
            <span>Monto Total Sanciones</span>
            <FileText className="h-4 w-4 text-slate-400" />
          </div>
          <div className="mt-3">
            <span className="text-2xl font-extrabold text-slate-900 block font-mono">
              {formatCLP(kpis.montoTotalSancion)}
            </span>
            <span className="text-xs font-semibold text-slate-500 mt-0.5 block">
              {kpis.totalMultas} {kpis.totalMultas === 1 ? "multa en registro" : "multas en registro"}
            </span>
          </div>
        </div>

        {/* Tarjeta 2: Multas Pendientes */}
        <div className="bg-amber-50/60 border border-amber-200 rounded-xl p-4 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs font-bold text-amber-800 uppercase tracking-wider">
            <span>Monto Pendiente</span>
            <Clock className="h-4 w-4 text-amber-600" />
          </div>
          <div className="mt-3">
            <span className="text-2xl font-extrabold text-amber-900 block font-mono">
              {formatCLP(kpis.montoPendiente)}
            </span>
            <span className="text-xs font-semibold text-amber-700 mt-0.5 block">
              {kpis.pendientesCount} {kpis.pendientesCount === 1 ? "multa pendiente" : "multas pendientes"}
            </span>
          </div>
        </div>

        {/* Tarjeta 3: Multas Pagadas */}
        <div className="bg-emerald-50/60 border border-emerald-200 rounded-xl p-4 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs font-bold text-emerald-800 uppercase tracking-wider">
            <span>Monto Pagado</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="mt-3">
            <span className="text-2xl font-extrabold text-emerald-900 block font-mono">
              {formatCLP(kpis.montoPagado)}
            </span>
            <span className="text-xs font-semibold text-emerald-700 mt-0.5 block">
              {kpis.pagadasCount} {kpis.pagadasCount === 1 ? "multa pagada" : "multas pagadas"}
            </span>
          </div>
        </div>
      </div>

      {/* 3. Pestañas de Estado con Línea Inferior de Acento Naranja */}
      <div className="flex items-center gap-2 border-b border-slate-200">
        <button
          onClick={() => setActiveTab("PENDIENTES")}
          className={cn(
            "flex items-center gap-2.5 py-3 px-4 text-xs font-bold border-b-2 transition-all cursor-pointer",
            activeTab === "PENDIENTES"
              ? "border-[#E05A10] text-[#E05A10] bg-orange-50/30"
              : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
          )}
        >
          <Clock className="h-4 w-4" />
          <span>Pendientes</span>
          <span
            className={cn(
              "px-2 py-0.5 rounded-full text-[11px] font-mono font-bold",
              activeTab === "PENDIENTES"
                ? "bg-[#E05A10] text-white"
                : "bg-slate-100 text-slate-600"
            )}
          >
            {pendientesCount}
          </span>
        </button>

        <button
          onClick={() => setActiveTab("PAGADAS")}
          className={cn(
            "flex items-center gap-2.5 py-3 px-4 text-xs font-bold border-b-2 transition-all cursor-pointer",
            activeTab === "PAGADAS"
              ? "border-emerald-600 text-emerald-700 bg-emerald-50/30"
              : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
          )}
        >
          <CheckCircle2 className="h-4 w-4" />
          <span>Pagadas</span>
          <span
            className={cn(
              "px-2 py-0.5 rounded-full text-[11px] font-mono font-bold",
              activeTab === "PAGADAS"
                ? "bg-emerald-600 text-white"
                : "bg-slate-100 text-slate-600"
            )}
          >
            {pagadasCount}
          </span>
        </button>
      </div>

      {/* 4. Barra de Búsqueda y Filtros en Fondo Blanco */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1 min-w-[260px]">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por N° Multa, Procedencia, Entidad, Resolución u Observaciones..."
              className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E05A10]/20 focus:border-[#E05A10] bg-white text-slate-900 placeholder-slate-400"
            />
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
              <Filter className="h-3.5 w-3.5 text-slate-400" />
              <span>Procedencia:</span>
            </div>
            <select
              value={procedenciaFilter}
              onChange={(e) => setProcedenciaFilter(e.target.value)}
              className="px-2.5 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E05A10]/20 focus:border-[#E05A10] bg-white font-medium text-slate-700"
            >
              <option value="TODAS">Todas las procedencias</option>
              {uniqueProcedencias.map((proc) => (
                <option key={proc} value={proc}>
                  {proc}
                </option>
              ))}
            </select>

            {(searchQuery || procedenciaFilter !== "TODAS") && (
              <button
                onClick={() => {
                  setSearchQuery("");
                  setProcedenciaFilter("TODAS");
                }}
                className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-50 transition-colors"
                title="Limpiar filtros"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 5. Tabla de Multas (10 Columnas de Alta Densidad y Alto Contraste) */}
      <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-[850px] lg:min-w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/90 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[11px]">
                <th className="py-3 px-3.5 whitespace-nowrap">PROCEDENCIA</th>
                <th className="py-3 px-3.5 whitespace-nowrap">ENTIDAD</th>
                <th className="py-3 px-3.5 whitespace-nowrap">N° MULTA</th>
                <th className="py-3 px-3.5 whitespace-nowrap">PUBLICADO EL</th>
                <th className="py-3 px-3.5 text-right whitespace-nowrap">MONTO SANCIÓN</th>
                <th className="py-3 px-3.5 whitespace-nowrap">N° RESOLUCIÓN</th>
                <th className="py-3 px-3.5 whitespace-nowrap">FECHA RESOLUCIÓN</th>
                <th className="py-3 px-3.5 whitespace-nowrap">FECHA DE PAGO</th>
                <th className="py-3 px-3.5 text-center whitespace-nowrap">ESTADO</th>
                {canManage && (
                  <th className="py-3 px-3.5 text-center whitespace-nowrap">ACCIONES</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={canManage ? 10 : 9} className="text-center py-12 text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <FileWarning className="h-8 w-8 text-slate-300 stroke-1" />
                      <p className="text-xs font-medium">
                        No se encontraron registros de multas para los filtros seleccionados.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                paginateArray(filteredItems, currentPage, GLOBAL_PAGE_SIZE).map((item) => {
                  const isPagada = item.estado === "PAGADA";

                  return (
                    <tr
                      key={item.id}
                      className={cn(
                        "hover:bg-slate-50/70 transition-colors",
                        isPagada ? "bg-emerald-50/10" : "bg-white"
                      )}
                    >
                      {/* 1. PROCEDENCIA */}
                      <td className="py-3 px-3.5 font-medium text-slate-800">
                        <div className="truncate max-w-[210px]" title={item.procedencia}>
                          {item.procedencia}
                        </div>
                      </td>

                      {/* 2. ENTIDAD */}
                      <td className="py-3 px-3.5 whitespace-nowrap">
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-800 border border-slate-200"
                          title={item.entidad || "Dirección del Trabajo"}
                        >
                          {item.entidad || "Dirección del Trabajo"}
                        </span>
                      </td>

                      {/* 3. N° MULTA */}
                      <td className="py-3 px-3.5 font-mono font-bold text-slate-900 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-800">
                          {item.nro_multa}
                        </span>
                      </td>

                      {/* 3. PUBLICADO EL */}
                      <td className="py-3 px-3.5 font-mono text-slate-600 whitespace-nowrap">
                        {formatDateCL(item.fecha_publicacion)}
                      </td>

                      {/* 4. MONTO SANCIÓN */}
                      <td className="py-3 px-3.5 text-right font-mono font-bold text-slate-900 whitespace-nowrap">
                        {formatCLP(item.monto_sancion)}
                      </td>

                      {/* 5. N° RESOLUCIÓN */}
                      <td className="py-3 px-3.5 text-slate-700 font-mono">
                        {item.nro_resolucion ? (
                          <span>{item.nro_resolucion}</span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>

                      {/* 6. FECHA RESOLUCIÓN */}
                      <td className="py-3 px-3.5 font-mono text-slate-600">
                        {item.fecha_resolucion ? (
                          formatDateCL(item.fecha_resolucion)
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>

                      {/* 7. FECHA DE PAGO */}
                      <td className="py-3 px-3.5 font-mono text-slate-700">
                        {item.fecha_pago ? (
                          <span className="text-emerald-700 font-semibold">
                            {formatDateCL(item.fecha_pago)}
                          </span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>

                      {/* 8. ESTADO */}
                      <td className="py-3 px-3.5 text-center whitespace-nowrap">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border",
                            isPagada
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : "bg-amber-50 text-amber-700 border-amber-200"
                          )}
                        >
                          <span
                            className={cn(
                              "h-1.5 w-1.5 rounded-full",
                              isPagada ? "bg-emerald-500" : "bg-amber-500"
                            )}
                          />
                          {item.estado}
                        </span>
                      </td>

                      {/* 9. ACCIONES: Únicamente botón Editar (Lápiz) cuando canManage es true */}
                      {canManage && (
                        <td className="py-3 px-3.5 text-center whitespace-nowrap">
                          <button
                            onClick={() => handleOpenEditModal(item)}
                            type="button"
                            className="p-1.5 rounded-md hover:bg-orange-50 text-slate-500 hover:text-[#E05A10] transition-colors"
                            title="Editar / Gestionar Multa"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <TablePagination
          currentPage={currentPage}
          totalItems={filteredItems.length}
          pageSize={GLOBAL_PAGE_SIZE}
          onPageChange={setCurrentPage}
        />
      </div>

      {/* 6. Modal Formulario (Crear / Editar Multa - Estilo Claro Ejecutivo) */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-[95vw] sm:w-full max-w-xl rounded-xl border border-slate-200 bg-white shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 bg-slate-50">
              <div className="flex items-center gap-2">
                <FileWarning className="h-4 w-4 text-[#E05A10]" />
                <h2 className="text-sm font-bold text-slate-900">
                  {editingItem ? `Editar Multa ${editingItem.nro_multa}` : "Nueva Multa"}
                </h2>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                type="button"
                className="text-slate-400 hover:text-slate-700 p-1 rounded-md transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto">
              {formError && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* Procedencia */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Procedencia (Causal o Motivo) *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.procedencia}
                    onChange={(e) =>
                      setFormData({ ...formData, procedencia: e.target.value })
                    }
                    placeholder="Ej. No Comparecencia, Falta Medidas de Seguridad..."
                    list="procedencias-sugerencias-modal"
                    className="w-full px-3 py-1.5 text-xs rounded-md bg-white border border-slate-300 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#E05A10]/20 focus:border-[#E05A10]"
                  />
                  <datalist id="procedencias-sugerencias-modal">
                    <option value="No Comparecencia a Audiencia de Conciliación" />
                    <option value="Falta de Medidas de Higiene y Seguridad" />
                    <option value="Exceso de Jornada Laboral" />
                    <option value="Infracción a Normas de Subcontratación" />
                    <option value="No Pago Oportuno de Remuneraciones" />
                    <option value="Falta de Registro de Asistencia" />
                  </datalist>
                </div>

                {/* Entidad */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Entidad Gestora / Fiscalizadora *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.entidad}
                    onChange={(e) =>
                      setFormData({ ...formData, entidad: e.target.value })
                    }
                    placeholder="Ej. Dirección del Trabajo, SEREMI de Salud..."
                    list="entidades-sugerencias-modal"
                    className="w-full px-3 py-1.5 text-xs rounded-md bg-white border border-slate-300 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#E05A10]/20 focus:border-[#E05A10]"
                  />
                  <datalist id="entidades-sugerencias-modal">
                    <option value="Dirección del Trabajo" />
                    <option value="SEREMI de Salud" />
                    <option value="Superintendencia del Medio Ambiente (SMA)" />
                    <option value="Municipalidad de Santiago" />
                    <option value="Municipalidad de San Bernardo" />
                    <option value="Superintendencia de Seguridad Social (SUSESO)" />
                  </datalist>
                </div>

                {/* N° Multa */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    N° Multa / Folio *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.nro_multa}
                    onChange={(e) =>
                      setFormData({ ...formData, nro_multa: e.target.value })
                    }
                    placeholder="Ej. DT-2026-9041"
                    className="w-full px-3 py-1.5 text-xs rounded-md bg-white border border-slate-300 text-slate-900 placeholder-slate-400 font-mono focus:outline-none focus:ring-2 focus:ring-[#E05A10]/20 focus:border-[#E05A10]"
                  />
                </div>

                {/* Fecha Publicación */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Fecha Publicación / Notificación *
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.fecha_publicacion}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        fecha_publicacion: e.target.value,
                      })
                    }
                    className="w-full px-3 py-1.5 text-xs rounded-md bg-white border border-slate-300 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#E05A10]/20 focus:border-[#E05A10]"
                  />
                </div>

                {/* Monto Sanción (CLP) */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Monto Sanción ($ CLP) *
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-mono text-xs font-bold">
                      $
                    </span>
                    <input
                      type="text"
                      required
                      value={formData.montoRaw}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          montoRaw: formatNumberInput(e.target.value),
                        })
                      }
                      placeholder="1.450.000"
                      className="w-full pl-7 pr-3 py-1.5 text-xs rounded-md bg-white border border-slate-300 text-slate-900 placeholder-slate-400 font-mono font-bold focus:outline-none focus:ring-2 focus:ring-[#E05A10]/20 focus:border-[#E05A10]"
                    />
                  </div>
                </div>

                {/* Estado */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Estado *
                  </label>
                  <select
                    value={formData.estado}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        estado: e.target.value as EstadoLitigioMulta,
                        fecha_pago:
                          e.target.value === "PAGADA"
                            ? formData.fecha_pago ||
                              new Date().toISOString().slice(0, 10)
                            : "",
                      })
                    }
                    className="w-full px-3 py-1.5 text-xs rounded-md bg-white border border-slate-300 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#E05A10]/20 focus:border-[#E05A10]"
                  >
                    <option value="PENDIENTE">🟡 PENDIENTE</option>
                    <option value="PAGADA">🟢 PAGADA</option>
                  </select>
                </div>

                {/* N° Resolución */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    N° Resolución (Opcional)
                  </label>
                  <input
                    type="text"
                    value={formData.nro_resolucion}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        nro_resolucion: e.target.value,
                      })
                    }
                    placeholder="Ej. RES-EX-554"
                    className="w-full px-3 py-1.5 text-xs rounded-md bg-white border border-slate-300 text-slate-900 placeholder-slate-400 font-mono focus:outline-none focus:ring-2 focus:ring-[#E05A10]/20 focus:border-[#E05A10]"
                  />
                </div>

                {/* Fecha Resolución */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Fecha Resolución (Opcional)
                  </label>
                  <input
                    type="date"
                    value={formData.fecha_resolucion}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        fecha_resolucion: e.target.value,
                      })
                    }
                    className="w-full px-3 py-1.5 text-xs rounded-md bg-white border border-slate-300 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#E05A10]/20 focus:border-[#E05A10]"
                  />
                </div>

                {/* Fecha de Pago (solo si estado es PAGADA) */}
                {formData.estado === "PAGADA" && (
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-emerald-800 mb-1">
                      Fecha de Pago Efectiva *
                    </label>
                    <input
                      type="date"
                      required
                      value={formData.fecha_pago}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          fecha_pago: e.target.value,
                        })
                      }
                      className="w-full px-3 py-1.5 text-xs rounded-md bg-emerald-50/50 border border-emerald-300 text-emerald-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    />
                  </div>
                )}

                {/* Observaciones */}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Observaciones / Detalle
                  </label>
                  <textarea
                    rows={3}
                    value={formData.observaciones}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        observaciones: e.target.value,
                      })
                    }
                    placeholder="Detalles de la causa, descargos presentados, comprobante de pago..."
                    className="w-full px-3 py-1.5 text-xs rounded-md bg-white border border-slate-300 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#E05A10]/20 focus:border-[#E05A10]"
                  />
                </div>
              </div>

              {/* Modal Buttons */}
              <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2 bg-slate-50 -mx-5 -mb-5 p-4">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  disabled={isSubmitting}
                  className="px-3.5 py-1.5 text-xs font-medium rounded-md text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded-md bg-[#E05A10] hover:bg-[#c94e0d] text-white shadow-xs transition-all disabled:opacity-50 cursor-pointer"
                >
                  {isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  <span>{editingItem ? "Guardar Cambios" : "Crear Multa"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
