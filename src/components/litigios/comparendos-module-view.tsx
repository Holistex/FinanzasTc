"use client";

import React, { useState, useTransition, useMemo, useEffect } from "react";
import {
  TablePagination,
  GLOBAL_PAGE_SIZE,
  paginateArray,
} from "@/components/ui/TablePagination";
import {
  Briefcase,
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
  Scale,
  CalendarClock,
  Info,
  Trash2,
  FileCheck2,
  Layers,
  Check,
  AlertCircle,
  HelpCircle,
} from "lucide-react";
import {
  LitigioComparendo,
  CuotaComparendo,
  EstadoComparendo,
  EstadoCuotaComparendo,
  LitigiosComparendosKpis,
  ComparendosFilterParams,
} from "@/types/database.types";
import {
  getLitigiosComparendosAction,
  upsertLitigioComparendoAction,
  saveAcuerdoComparendoAction,
  togglePagoCuotaComparendoAction,
  deleteLitigioComparendoAction,
} from "@/actions/litigios.actions";
import { cn, formatDateCL, formatCLP } from "@/lib/utils";
import dynamic from "next/dynamic";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { QUERY_KEYS } from "@/lib/prefetch-helpers";

const PlanCuotasModal = dynamic(
  () => import("./plan-cuotas-modal").then((m) => m.PlanCuotasModal),
  { ssr: false }
);

type ComparendosTab = "PENDIENTES" | "PAGADAS";

interface ComparendosModuleViewProps {
  initialItems: LitigioComparendo[];
  initialKpis: LitigiosComparendosKpis;
  canManage?: boolean;
}

export function ComparendosModuleView({
  initialItems,
  initialKpis,
  canManage = true,
}: ComparendosModuleViewProps) {
  const queryClient = useQueryClient();

  // Caché dinámico TanStack Query con renders instantáneos (<1ms) y revalidación en segundo plano
  const { data: queryData } = useQuery({
    queryKey: QUERY_KEYS.litigiosComparendos,
    queryFn: () => getLitigiosComparendosAction(),
    initialData: { items: initialItems, kpis: initialKpis },
    staleTime: 5 * 60 * 1000,
  });

  const [localData, setLocalData] = useState<{
    items: LitigioComparendo[];
    kpis: LitigiosComparendosKpis;
  }>({ items: initialItems, kpis: initialKpis });

  const items = queryData?.items ?? localData.items;
  const kpis = queryData?.kpis ?? localData.kpis;

  // Pestañas (Tabs): PENDIENTES vs PAGADAS / ACUERDOS SALDADOS
  const [activeTab, setActiveTab] = useState<ComparendosTab>("PENDIENTES");

  // Filtros de búsqueda
  const [searchQuery, setSearchQuery] = useState("");
  const [causalFilter, setCausalFilter] = useState("TODAS");
  const [asistenciaFilter, setAsistenciaFilter] = useState<"TODAS" | "SI" | "NO">("TODAS");
  const [reservaFilter, setReservaFilter] = useState<"TODAS" | "SI" | "NO">("TODAS");
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, searchQuery, causalFilter, asistenciaFilter, reservaFilter]);

  const [isPending, startTransition] = useTransition();

  // --------------------------------------------------------------------------
  // MODAL 1: Crear / Editar Comparendo
  // --------------------------------------------------------------------------
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<LitigioComparendo | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    nombre_trabajador: "",
    fecha_finiquito: "",
    reserva_derechos: false,
    causal_termino: "",
    fecha_comparendo: new Date().toISOString().slice(0, 10),
    asistencia_empresa: true,
    motivo_observacion: "",
    estado: "PENDIENTE" as EstadoComparendo,
  });

  // --------------------------------------------------------------------------
  // MODAL 2: Registrar / Gestionar Acuerdo en Cuotas (PlanCuotasModal)
  // --------------------------------------------------------------------------
  const [isAcuerdoModalOpen, setIsAcuerdoModalOpen] = useState(false);
  const [acuerdoComparendo, setAcuerdoComparendo] = useState<LitigioComparendo | null>(null);

  // Lista única de causales para el selector de filtro
  const uniqueCausales = useMemo(() => {
    const set = new Set<string>();
    items.forEach((c) => {
      if (c.causal_termino && c.causal_termino.trim()) {
        set.add(c.causal_termino.trim());
      }
    });
    return Array.from(set).sort();
  }, [items]);

  // Recarga de datos y sincronización de caché
  const refreshData = async () => {
    try {
      const res = await getLitigiosComparendosAction();
      queryClient.setQueryData(QUERY_KEYS.litigiosComparendos, res);
      setLocalData(res);
      return res;
    } catch (e) {
      console.error("Error refreshing comparendos:", e);
      return null;
    }
  };

  // Filtrado de items por tab y filtros
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      // 1. Tab filter:
      // PENDIENTES: comparendos pendientes de comparendo o con cuotas activas (PENDIENTE o ACUERDO_EN_PAGO)
      // PAGADAS: acuerdos concluidos y saldados al 100% (PAGADO)
      if (activeTab === "PENDIENTES") {
        if (item.estado === "PAGADO") return false;
      } else {
        if (item.estado !== "PAGADO") return false;
      }

      // 2. Causal filter
      if (causalFilter !== "TODAS") {
        if (!item.causal_termino.toLowerCase().includes(causalFilter.toLowerCase())) {
          return false;
        }
      }

      // 3. Asistencia filter
      if (asistenciaFilter !== "TODAS") {
        const wantAsist = asistenciaFilter === "SI";
        if (item.asistencia_empresa !== wantAsist) return false;
      }

      // 4. Reserva de derechos filter
      if (reservaFilter !== "TODAS") {
        const wantReserva = reservaFilter === "SI";
        if (item.reserva_derechos !== wantReserva) return false;
      }

      // 5. Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const match =
          item.nombre_trabajador.toLowerCase().includes(q) ||
          item.causal_termino.toLowerCase().includes(q) ||
          (item.motivo_observacion || "").toLowerCase().includes(q);
        if (!match) return false;
      }

      return true;
    });
  }, [items, activeTab, causalFilter, asistenciaFilter, reservaFilter, searchQuery]);

  // Contadores para pestañas
  const pendientesTabCount = useMemo(
    () => items.filter((c) => c.estado === "PENDIENTE" || c.estado === "ACUERDO_EN_PAGO").length,
    [items]
  );
  const saldadosTabCount = useMemo(
    () => items.filter((c) => c.estado === "PAGADO").length,
    [items]
  );

  // Apertura modal Crear
  const handleOpenCreateModal = () => {
    setEditingItem(null);
    setFormData({
      nombre_trabajador: "",
      fecha_finiquito: "",
      reserva_derechos: false,
      causal_termino: "Art. 161 (Necesidades de la empresa)",
      fecha_comparendo: new Date().toISOString().slice(0, 10),
      asistencia_empresa: true,
      motivo_observacion: "",
      estado: "PENDIENTE",
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  // Apertura modal Editar
  const handleOpenEditModal = (item: LitigioComparendo) => {
    setEditingItem(item);
    setFormData({
      nombre_trabajador: item.nombre_trabajador,
      fecha_finiquito: item.fecha_finiquito || "",
      reserva_derechos: item.reserva_derechos,
      causal_termino: item.causal_termino,
      fecha_comparendo: item.fecha_comparendo,
      asistencia_empresa: item.asistencia_empresa,
      motivo_observacion: item.motivo_observacion || "",
      estado: item.estado,
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  // Guardar formulario Comparendo
  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formData.nombre_trabajador.trim()) {
      setFormError("El nombre del trabajador / reclamante es obligatorio.");
      return;
    }
    if (!formData.causal_termino.trim()) {
      setFormError("La causal de término laboral es obligatoria.");
      return;
    }
    if (!formData.fecha_comparendo) {
      setFormError("La fecha de comparendo es obligatoria.");
      return;
    }

    setIsSubmitting(true);
    try {
      await upsertLitigioComparendoAction({
        id: editingItem?.id,
        nombre_trabajador: formData.nombre_trabajador.trim(),
        fecha_finiquito: formData.fecha_finiquito || null,
        reserva_derechos: formData.reserva_derechos,
        causal_termino: formData.causal_termino.trim(),
        fecha_comparendo: formData.fecha_comparendo,
        asistencia_empresa: formData.asistencia_empresa,
        motivo_observacion: formData.motivo_observacion.trim() || null,
        estado: editingItem ? editingItem.estado : "PENDIENTE",
      });

      startTransition(async () => {
        await refreshData();
      });

      setIsModalOpen(false);
    } catch (err: any) {
      setFormError(err.message || "Error al guardar el comparendo.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Eliminar comparendo
  const handleDeleteComparendo = async (item: LitigioComparendo) => {
    const confirmed = window.confirm(
      `¿Está seguro de eliminar el comparendo de "${item.nombre_trabajador}"? Esta acción borrará también su plan de cuotas.`
    );
    if (!confirmed) return;

    try {
      await deleteLitigioComparendoAction(item.id);
      startTransition(async () => {
        await refreshData();
      });
    } catch (err: any) {
      alert("Error al eliminar comparendo: " + (err.message || "Error desconocido"));
    }
  };

  // --------------------------------------------------------------------------
  // LÓGICA DEL PLAN DE CUOTAS / ACUERDO
  // --------------------------------------------------------------------------
  const handleOpenAcuerdoModal = (item: LitigioComparendo) => {
    setAcuerdoComparendo(item);
    setIsAcuerdoModalOpen(true);
  };

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto select-none">
      {/* 1. Header Principal Estándar Tensacon */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-[#0F172A] text-[#E05A10] flex items-center justify-center shadow-sm">
            <Briefcase className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                Comparendos
              </h1>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-200 uppercase">
                REG. LITIGIOS
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Control de citaciones ante la Inspección del Trabajo (DT), actas de comparendo y convenios de pago en cuotas.
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
              <span>Nuevo Comparendo</span>
            </button>
          </div>
        )}
      </div>

      {/* 2. Tarjetas KPI Superiores (Jerarquía Tensacon: Monto en CLP Prominente arriba, conteo abajo) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Tarjeta 1: Total Acuerdos / Registros */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500 uppercase tracking-wider">
            <span>Monto Total Acuerdos</span>
            <Scale className="h-4 w-4 text-slate-400" />
          </div>
          <div className="mt-3">
            <span className="text-2xl font-extrabold text-slate-900 block font-mono">
              {formatCLP(kpis.montoAcuerdosTotal)}
            </span>
            <span className="text-xs font-semibold text-slate-500 mt-0.5 block">
              {kpis.totalComparendos}{" "}
              {kpis.totalComparendos === 1 ? "comparendo registrado" : "comparendos registrados"}
            </span>
          </div>
        </div>

        {/* Tarjeta 2: En Proceso / Pendientes */}
        <div className="bg-amber-50/60 border border-amber-200 rounded-xl p-4 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs font-bold text-amber-800 uppercase tracking-wider">
            <span>Monto Cuotas Pendientes</span>
            <Clock className="h-4 w-4 text-amber-600" />
          </div>
          <div className="mt-3">
            <span className="text-2xl font-extrabold text-amber-900 block font-mono">
              {formatCLP(kpis.montoPendiente)}
            </span>
            <span className="text-xs font-semibold text-amber-700 mt-0.5 block">
              {kpis.pendientesCount}{" "}
              {kpis.pendientesCount === 1 ? "proceso pendiente / activo" : "procesos pendientes / activos"}
            </span>
          </div>
        </div>

        {/* Tarjeta 3: Acuerdos Saldados / Totalmente Pagados */}
        <div className="bg-emerald-50/60 border border-emerald-200 rounded-xl p-4 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs font-bold text-emerald-800 uppercase tracking-wider">
            <span>Monto Acuerdos Saldados</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="mt-3">
            <span className="text-2xl font-extrabold text-emerald-900 block font-mono">
              {formatCLP(kpis.montoSaldado)}
            </span>
            <span className="text-xs font-semibold text-emerald-700 mt-0.5 block">
              {kpis.saldadosCount}{" "}
              {kpis.saldadosCount === 1 ? "acuerdo saldado al 100%" : "acuerdos saldados al 100%"}
            </span>
          </div>
        </div>
      </div>

      {/* 3. Pestañas de Estado (Tabs): PENDIENTES vs PAGADAS / ACUERDOS SALDADOS */}
      <div className="flex items-center justify-between border-b border-slate-200">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab("PENDIENTES")}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition-all",
              activeTab === "PENDIENTES"
                ? "border-[#E05A10] text-[#E05A10]"
                : "border-transparent text-slate-500 hover:text-slate-800"
            )}
          >
            <Clock className="h-3.5 w-3.5" />
            <span>PENDIENTES</span>
            <span
              className={cn(
                "px-2 py-0.5 rounded-full text-[10px] font-bold",
                activeTab === "PENDIENTES"
                  ? "bg-[#E05A10]/10 text-[#E05A10]"
                  : "bg-slate-100 text-slate-600"
              )}
            >
              {pendientesTabCount}
            </span>
          </button>

          <button
            onClick={() => setActiveTab("PAGADAS")}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition-all",
              activeTab === "PAGADAS"
                ? "border-emerald-600 text-emerald-700"
                : "border-transparent text-slate-500 hover:text-slate-800"
            )}
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>PAGADAS / ACUERDOS SALDADOS</span>
            <span
              className={cn(
                "px-2 py-0.5 rounded-full text-[10px] font-bold",
                activeTab === "PAGADAS"
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-slate-100 text-slate-600"
              )}
            >
              {saldadosTabCount}
            </span>
          </button>
        </div>

        {isPending && (
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-[#E05A10]" />
            <span>Actualizando...</span>
          </div>
        )}
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
              placeholder="Buscar por Trabajador, Causal, Observación o Acuerdo..."
              className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E05A10]/20 focus:border-[#E05A10] bg-white text-slate-900 placeholder-slate-400"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Filtro Causal */}
            <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
              <Filter className="h-3.5 w-3.5 text-slate-400" />
              <span>Causal:</span>
            </div>
            <select
              value={causalFilter}
              onChange={(e) => setCausalFilter(e.target.value)}
              className="px-2.5 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E05A10]/20 focus:border-[#E05A10] bg-white font-medium text-slate-700"
            >
              <option value="TODAS">Todas las causales</option>
              {uniqueCausales.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            {/* Filtro Asistencia Empresa */}
            <select
              value={asistenciaFilter}
              onChange={(e) => setAsistenciaFilter(e.target.value as any)}
              className="px-2.5 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E05A10]/20 focus:border-[#E05A10] bg-white font-medium text-slate-700"
            >
              <option value="TODAS">Asistencia: Todas</option>
              <option value="SI">Asistencia: SÍ (Recomendada)</option>
              <option value="NO">Asistencia: NO (Estrategia)</option>
            </select>

            {/* Filtro Reserva */}
            <select
              value={reservaFilter}
              onChange={(e) => setReservaFilter(e.target.value as any)}
              className="px-2.5 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E05A10]/20 focus:border-[#E05A10] bg-white font-medium text-slate-700"
            >
              <option value="TODAS">Reserva Derechos: Todas</option>
              <option value="SI">Reserva: SÍ</option>
              <option value="NO">Reserva: NO</option>
            </select>

            {(searchQuery ||
              causalFilter !== "TODAS" ||
              asistenciaFilter !== "TODAS" ||
              reservaFilter !== "TODAS") && (
              <button
                onClick={() => {
                  setSearchQuery("");
                  setCausalFilter("TODAS");
                  setAsistenciaFilter("TODAS");
                  setReservaFilter("TODAS");
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

      {/* 5. Tabla de Comparendos (Orden estricto de 9 columnas según especificación) */}
      <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-[850px] lg:min-w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/90 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[11px]">
                {/* 1 */}
                <th className="py-3 px-3.5 whitespace-nowrap">NOMBRE</th>
                {/* 2 */}
                <th className="py-3 px-3.5 whitespace-nowrap">FECHA FINIQUITO</th>
                {/* 3 */}
                <th className="px-3 py-2 text-center text-xs font-bold text-slate-600 uppercase tracking-wider leading-tight max-w-[100px]">
                  RESERVA DE<br />DERECHOS
                </th>
                {/* 4 */}
                <th className="py-3 px-3.5 whitespace-nowrap">CAUSAL TÉRMINO LABORAL</th>
                {/* 5 */}
                <th className="py-3 px-3.5 whitespace-nowrap">FECHA COMPARENDO</th>
                {/* 6 */}
                <th className="px-3 py-2 text-center text-xs font-bold text-slate-600 uppercase tracking-wider leading-tight max-w-[100px]">
                  ASISTENCIA<br />EMPRESA
                </th>
                {/* 7 */}
                <th className="py-3 px-3.5 whitespace-nowrap">MOTIVO / OBSERVACIÓN</th>
                {/* 8 */}
                <th className="py-3 px-3.5 text-center whitespace-nowrap">ESTADO</th>
                {/* 9 */}
                <th className="py-3 px-3.5 text-center whitespace-nowrap">ACCIONES</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Briefcase className="h-8 w-8 text-slate-300 stroke-1" />
                      <p className="text-xs font-medium">
                        No se encontraron registros de comparendos para los filtros seleccionados.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                paginateArray(filteredItems, currentPage, GLOBAL_PAGE_SIZE).map((item) => {
                  const isSaldado = item.estado === "PAGADO";
                  const isAcuerdoPago = item.estado === "ACUERDO_EN_PAGO";
                  const cuotas = item.cuotas || [];
                  const cuotasTotalCount = cuotas.length;
                  const cuotasPagadas = cuotas.filter((q) => q.estado_cuota === "PAGADA").length;

                  return (
                    <tr
                      key={item.id}
                      className={cn(
                        "hover:bg-slate-50/70 transition-colors",
                        isSaldado ? "bg-emerald-50/10" : "bg-white"
                      )}
                    >
                      {/* 1. NOMBRE: Nombre completo del ex-trabajador / reclamante */}
                      <td className="py-3 px-3.5 font-medium text-slate-900">
                        <div
                          className="truncate max-w-[220px] font-semibold text-slate-900"
                          title={item.nombre_trabajador}
                        >
                          {item.nombre_trabajador}
                        </div>
                        {item.monto_acuerdo_total > 0 && (
                          <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                            Acuerdo: {formatCLP(item.monto_acuerdo_total)}
                          </div>
                        )}
                      </td>

                      {/* 2. FECHA FINIQUITO: Fecha del finiquito de trabajo (DD-MM-YYYY) */}
                      <td className="py-3 px-3.5 font-mono text-slate-700 whitespace-nowrap">
                        {item.fecha_finiquito ? (
                          <div className="flex items-center gap-1.5">
                            <FileCheck2 className="h-3.5 w-3.5 text-slate-400" />
                            <span>{formatDateCL(item.fecha_finiquito)}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400 font-sans italic text-[11px]">-</span>
                        )}
                      </td>

                      {/* 3. RESERVA DE DERECHOS: Badge visual (🟢 SÍ / ⚪ NO) */}
                      <td className="py-3 px-3.5 text-center whitespace-nowrap">
                        {item.reserva_derechos ? (
                          <span
                            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200"
                            title="Ex-trabajador firmó con reserva de derechos en finiquito"
                          >
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            SÍ
                          </span>
                        ) : (
                          <span
                            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600 border border-slate-200"
                            title="Finiquito firmado sin reserva de derechos"
                          >
                            <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                            NO
                          </span>
                        )}
                      </td>

                      {/* 4. CAUSAL TÉRMINO LABORAL: Texto/Artículo Código del Trabajo */}
                      <td className="py-3 px-3.5 text-slate-800">
                        <div
                          className="truncate max-w-[200px] text-xs font-medium"
                          title={item.causal_termino}
                        >
                          {item.causal_termino}
                        </div>
                      </td>

                      {/* 5. FECHA COMPARENDO: Fecha citación ante la Inspección DD-MM-YYYY */}
                      <td className="py-3 px-3.5 font-mono text-slate-700 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5 text-slate-400" />
                          <span>{formatDateCL(item.fecha_comparendo)}</span>
                        </div>
                      </td>

                      {/* 6. ASISTENCIA EMPRESA: Badge indicador (🟢 SÍ / 🔴 NO) */}
                      <td className="py-3 px-3.5 text-center whitespace-nowrap">
                        {item.asistencia_empresa ? (
                          <span
                            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200"
                            title="Asistencia confirmada / Recomendada por asesoría jurídica"
                          >
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            SÍ
                          </span>
                        ) : (
                          <span
                            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200"
                            title="No concurrencia convenida tras análisis legal de improcedencia"
                          >
                            <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                            NO
                          </span>
                        )}
                      </td>

                      {/* 7. MOTIVO / OBSERVACIÓN: Resumen del reclamo administrativo limitado a 2 líneas */}
                      <td className="py-3 px-3.5 text-slate-600">
                        <div
                          className="line-clamp-2 max-w-[260px] text-xs leading-snug"
                          title={item.motivo_observacion || "Sin observaciones adicionales"}
                        >
                          {item.motivo_observacion || (
                            <span className="text-slate-400 italic">Sin observaciones</span>
                          )}
                        </div>
                      </td>

                      {/* 7. ESTADO: (🟡 PENDIENTE / 🟢 ACUERDO PAGO / 🔵 PAGADO TOTAL) */}
                      <td className="py-3 px-3.5 text-center whitespace-nowrap">
                        {item.estado === "PENDIENTE" && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                            PENDIENTE
                          </span>
                        )}
                        {item.estado === "ACUERDO_EN_PAGO" && (
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                              ACUERDO PAGO
                            </span>
                            {cuotasTotalCount > 0 && (
                              <span className="text-[10px] text-slate-500 font-mono font-medium">
                                ({cuotasPagadas}/{cuotasTotalCount} cuotas)
                              </span>
                            )}
                          </div>
                        )}
                        {item.estado === "PAGADO" && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                            <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                            PAGADO TOTAL
                          </span>
                        )}
                      </td>

                      {/* 8. ACCIONES: Ícono de Acuerdo/Plan de Cuotas + Ícono de Editar Comparendo */}
                      <td className="py-3 px-3.5 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1">
                          {/* Botón Acción Acuerdo / Plan de Cuotas */}
                          <button
                            onClick={() => handleOpenAcuerdoModal(item)}
                            type="button"
                            className={cn(
                              "p-1.5 rounded-md transition-colors flex items-center gap-1",
                              item.monto_acuerdo_total > 0
                                ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200"
                                : "text-slate-500 hover:bg-orange-50 hover:text-[#E05A10]"
                            )}
                            title={
                              item.monto_acuerdo_total > 0
                                ? `Ver / Gestionar Plan de Cuotas (${cuotasPagadas}/${cuotasTotalCount})`
                                : "Registrar Acuerdo de Comparendo en Cuotas"
                            }
                          >
                            <CalendarClock className="h-4 w-4" />
                            {item.monto_acuerdo_total > 0 && (
                              <span className="text-[10px] font-bold">
                                {cuotasPagadas}/{cuotasTotalCount}
                              </span>
                            )}
                          </button>

                          {/* Botón Editar Comparendo */}
                          {canManage && (
                            <button
                              onClick={() => handleOpenEditModal(item)}
                              type="button"
                              className="p-1.5 rounded-md hover:bg-orange-50 text-slate-500 hover:text-[#E05A10] transition-colors"
                              title="Editar Datos del Comparendo"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                          )}

                          {/* Botón Eliminar Comparendo */}
                          {canManage && (
                            <button
                              onClick={() => handleDeleteComparendo(item)}
                              type="button"
                              className="p-1.5 rounded-md hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition-colors"
                              title="Eliminar Comparendo"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
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

      {/* ===================================================================== */}
      {/* 6. MODAL 1: Formulario Crear / Editar Comparendo */}
      {/* ===================================================================== */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-[95vw] sm:w-full max-w-xl rounded-xl border border-slate-200 bg-white shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Header Modal */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 bg-slate-50">
              <div className="flex items-center gap-2">
                <Briefcase className="h-4 w-4 text-[#E05A10]" />
                <h2 className="text-sm font-bold text-slate-900">
                  {editingItem ? `Editar Comparendo` : "Nuevo Comparendo"}
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

            {/* Body Form */}
            <form onSubmit={handleSubmitForm} className="p-5 space-y-4 overflow-y-auto">
              {formError && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* Nombre Trabajador */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Nombre del Ex-Trabajador / Reclamante *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.nombre_trabajador}
                    onChange={(e) =>
                      setFormData({ ...formData, nombre_trabajador: e.target.value })
                    }
                    placeholder="Ej. Juan Carlos Muñoz Tapia"
                    className="w-full px-3 py-1.5 text-xs rounded-md bg-white border border-slate-300 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#E05A10]/20 focus:border-[#E05A10]"
                  />
                </div>

                {/* Fecha Finiquito */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Fecha de Finiquito
                  </label>
                  <input
                    type="date"
                    value={formData.fecha_finiquito}
                    onChange={(e) =>
                      setFormData({ ...formData, fecha_finiquito: e.target.value })
                    }
                    className="w-full px-3 py-1.5 text-xs rounded-md bg-white border border-slate-300 text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-[#E05A10]/20 focus:border-[#E05A10]"
                  />
                </div>

                {/* Fecha Comparendo */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Fecha del Comparendo (Citación DT) *
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.fecha_comparendo}
                    onChange={(e) =>
                      setFormData({ ...formData, fecha_comparendo: e.target.value })
                    }
                    className="w-full px-3 py-1.5 text-xs rounded-md bg-white border border-slate-300 text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-[#E05A10]/20 focus:border-[#E05A10]"
                  />
                </div>

                {/* Causal Término Laboral */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Causal Término Laboral (Art. CdT) *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.causal_termino}
                    onChange={(e) =>
                      setFormData({ ...formData, causal_termino: e.target.value })
                    }
                    placeholder="Ej. Art. 161 (Necesidades de la empresa)"
                    list="causales-sugerencias-comparendo"
                    className="w-full px-3 py-1.5 text-xs rounded-md bg-white border border-slate-300 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#E05A10]/20 focus:border-[#E05A10]"
                  />
                  <datalist id="causales-sugerencias-comparendo">
                    <option value="Art. 161 (Necesidades de la empresa)" />
                    <option value="Art. 159 N° 4 (Vencimiento del plazo convenido)" />
                    <option value="Art. 159 N° 2 (Renuncia voluntaria del trabajador)" />
                    <option value="Art. 159 N° 1 (Mutuo acuerdo de las partes)" />
                    <option value="Art. 159 N° 5 (Conclusión del trabajo o servicio)" />
                    <option value="Art. 160 N° 3 (No concurrencia injustificada)" />
                    <option value="Art. 160 N° 7 (Incumplimiento grave de obligaciones)" />
                  </datalist>
                </div>

                {/* Reserva de Derechos */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Reserva de Derechos en Finiquito *
                  </label>
                  <select
                    value={formData.reserva_derechos ? "SI" : "NO"}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        reserva_derechos: e.target.value === "SI",
                      })
                    }
                    className="w-full px-3 py-1.5 text-xs rounded-md bg-white border border-slate-300 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#E05A10]/20 focus:border-[#E05A10]"
                  >
                    <option value="NO">⚪ NO - Finiquito sin reserva de derechos</option>
                    <option value="SI">🟢 SÍ - Trabajador firmó con reserva de derechos</option>
                  </select>
                </div>

                {/* Asistencia Empresa */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Asistencia Empresa (Criterio Legal) *
                  </label>
                  <select
                    value={formData.asistencia_empresa ? "SI" : "NO"}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        asistencia_empresa: e.target.value === "SI",
                      })
                    }
                    className="w-full px-3 py-1.5 text-xs rounded-md bg-white border border-slate-300 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#E05A10]/20 focus:border-[#E05A10]"
                  >
                    <option value="SI">🟢 SÍ - Concurre representante legal / abogado</option>
                    <option value="NO">🔴 NO - No asistir por estrategia jurídica</option>
                  </select>
                </div>

                {/* Motivo / Observación */}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Motivo / Resumen del Reclamo Administrativo
                  </label>
                  <textarea
                    rows={3}
                    value={formData.motivo_observacion}
                    onChange={(e) =>
                      setFormData({ ...formData, motivo_observacion: e.target.value })
                    }
                    placeholder="Detalle los conceptos reclamados ante la Inspección del Trabajo (ej. diferencias de gratificación, descuento AFC, feriado proporcional, etc.)..."
                    className="w-full px-3 py-1.5 text-xs rounded-md bg-white border border-slate-300 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#E05A10]/20 focus:border-[#E05A10]"
                  />
                </div>
              </div>

              {/* Botones de acción modal */}
              <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  disabled={isSubmitting}
                  className="px-3.5 py-1.5 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-md bg-[#E05A10] hover:bg-[#c94e0d] text-white text-xs font-semibold shadow-sm transition-colors disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>Guardando...</span>
                    </>
                  ) : (
                    <span>{editingItem ? "Actualizar Comparendo" : "Crear Comparendo"}</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* 7. MODAL 2: Plan de Cuotas del Acuerdo (con Enmascaramiento Dinámico CLP) */}
      {/* ===================================================================== */}
      {acuerdoComparendo && (
        <PlanCuotasModal
          isOpen={isAcuerdoModalOpen}
          onClose={() => {
            setIsAcuerdoModalOpen(false);
            setAcuerdoComparendo(null);
          }}
          comparendo={acuerdoComparendo}
          onSaveAcuerdo={async (comparendoId, montoTotal, cuotas) => {
            await saveAcuerdoComparendoAction(comparendoId, montoTotal, cuotas);
            startTransition(async () => {
              await refreshData();
            });
          }}
          canManage={canManage}
        />
      )}
    </div>
  );
}
