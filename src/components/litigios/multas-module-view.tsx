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
  ChevronRight,
  ChevronDown,
  Banknote,
  Minus,
} from "lucide-react";
import {
  LitigioMulta,
  LitigioMultaEnunciado,
  MonedaMultaEnunciado,
  EstadoLitigioMulta,
  LitigiosMultasKpis,
} from "@/types/database.types";
import {
  MultasFilterParams,
  actualizarEnunciadoMultaAction,
  registrarAbonoMultaAction,
} from "@/actions/litigios.actions";
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
    rut_trabajador: "",
    nombre_trabajador: "",
    nro_multa: "",
    fecha_publicacion: new Date().toISOString().slice(0, 10),
    montoRaw: "",
    nro_resolucion: "",
    fecha_resolucion: "",
    fecha_pago: "",
    estado: "PENDIENTE" as EstadoLitigioMulta,
    observaciones: "",
  });

  interface EnunciadoDraft {
    id?: string;
    nro_resolucion: string;
    correlativo_id: string;
    total_moneda_raw: string;
    moneda: MonedaMultaEnunciado;
    monto_pesos_raw: string;
    nuevo_monto_pesos_raw: string;
    nuevoMontoTouched: boolean;
    observaciones: string;
  }

  const createEmptyEnunciado = (
    idx: number,
    baseRes: string
  ): EnunciadoDraft => ({
    nro_resolucion: baseRes,
    correlativo_id: String(idx + 1),
    total_moneda_raw: "",
    moneda: "UTM",
    monto_pesos_raw: "",
    nuevo_monto_pesos_raw: "",
    nuevoMontoTouched: false,
    observaciones: "",
  });

  const [enunciadosDraft, setEnunciadosDraft] = useState<EnunciadoDraft[]>([
    createEmptyEnunciado(0, ""),
  ]);
  const [expandedMultas, setExpandedMultas] = useState<Record<string, boolean>>(
    {}
  );

  // Modal Abono / Pago Rápido
  const [abonoTarget, setAbonoTarget] = useState<LitigioMulta | null>(null);
  const [abonoMontoRaw, setAbonoMontoRaw] = useState("");
  const [abonoFecha, setAbonoFecha] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [abonoObs, setAbonoObs] = useState("");
  const [abonoError, setAbonoError] = useState<string | null>(null);
  const [isSavingAbono, setIsSavingAbono] = useState(false);

  // Modal Editar / Rebajar Enunciado Individual
  const [enunTarget, setEnunTarget] = useState<{
    multa: LitigioMulta;
    enunciado: LitigioMultaEnunciado;
  } | null>(null);
  const [enunNuevoMontoRaw, setEnunNuevoMontoRaw] = useState("");
  const [enunObs, setEnunObs] = useState("");
  const [enunError, setEnunError] = useState<string | null>(null);
  const [isSavingEnun, setIsSavingEnun] = useState(false);

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

      // 3. Search query (incluye procedencia, entidad, trabajador, rut, nro_multa, resolucion, observaciones)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const qClean = q.replace(/[.\-\s]/g, "");
        const rutClean = (item.rut_trabajador || "").toLowerCase().replace(/[.\-\s]/g, "");
        const match =
          item.procedencia.toLowerCase().includes(q) ||
          (item.entidad || "").toLowerCase().includes(q) ||
          (item.nombre_trabajador || "").toLowerCase().includes(q) ||
          (item.rut_trabajador || "").toLowerCase().includes(q) ||
          (qClean.length > 0 && rutClean.includes(qClean)) ||
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

  const handleCantidadEnunciadosChange = (nextCountRaw: number) => {
    const nextCount = Math.max(1, Math.min(20, Math.round(nextCountRaw || 1)));
    setEnunciadosDraft((prev) => {
      if (nextCount === prev.length) return prev;
      if (nextCount < prev.length) return prev.slice(0, nextCount);
      const copy = [...prev];
      for (let i = prev.length; i < nextCount; i++) {
        copy.push(createEmptyEnunciado(i, formData.nro_resolucion));
      }
      return copy;
    });
  };

  const modalTotals = useMemo(() => {
    const totalConstatado = enunciadosDraft.reduce(
      (acc, e) => acc + parseNumberInput(e.monto_pesos_raw),
      0
    );
    const totalVigente = enunciadosDraft.reduce(
      (acc, e) =>
        acc +
        parseNumberInput(
          e.nuevo_monto_pesos_raw !== ""
            ? e.nuevo_monto_pesos_raw
            : e.monto_pesos_raw
        ),
      0
    );
    const ahorro = Math.max(0, totalConstatado - totalVigente);
    return { totalConstatado, totalVigente, ahorro };
  }, [enunciadosDraft]);

  const handleOpenCreateModal = () => {
    setEditingItem(null);
    setFormData({
      procedencia: "",
      entidad: "Dirección del Trabajo",
      rut_trabajador: "",
      nombre_trabajador: "",
      nro_multa: "",
      fecha_publicacion: new Date().toISOString().slice(0, 10),
      montoRaw: "",
      nro_resolucion: "",
      fecha_resolucion: "",
      fecha_pago: "",
      estado: "PENDIENTE",
      observaciones: "",
    });
    setEnunciadosDraft([createEmptyEnunciado(0, "")]);
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (item: LitigioMulta) => {
    setEditingItem(item);
    setFormData({
      procedencia: item.procedencia,
      entidad: item.entidad || "Dirección del Trabajo",
      rut_trabajador: item.rut_trabajador || "",
      nombre_trabajador: item.nombre_trabajador || "",
      nro_multa: item.nro_multa,
      fecha_publicacion: item.fecha_publicacion,
      montoRaw: item.monto_sancion ? Number(item.monto_sancion).toLocaleString("es-CL") : "",
      nro_resolucion: item.nro_resolucion || "",
      fecha_resolucion: item.fecha_resolucion || "",
      fecha_pago: item.fecha_pago || "",
      estado: item.estado,
      observaciones: item.observaciones || "",
    });
    if (item.enunciados && item.enunciados.length > 0) {
      setEnunciadosDraft(
        item.enunciados.map((e, idx) => ({
          id: e.id,
          nro_resolucion: e.nro_resolucion || item.nro_resolucion || "",
          correlativo_id: e.correlativo_id || String(idx + 1),
          total_moneda_raw:
            e.total_moneda !== null && e.total_moneda !== undefined
              ? String(e.total_moneda).replace(".", ",")
              : e.moneda === "CLP"
              ? Number(e.monto_pesos || 0).toLocaleString("es-CL")
              : "",
          moneda: e.moneda || "UTM",
          monto_pesos_raw: Number(e.monto_pesos || 0).toLocaleString("es-CL"),
          nuevo_monto_pesos_raw: Number(
            e.nuevo_monto_pesos ?? e.monto_pesos ?? 0
          ).toLocaleString("es-CL"),
          nuevoMontoTouched: true,
          observaciones: e.observaciones || "",
        }))
      );
    } else {
      const mPesos = Number(item.monto_original_clp ?? item.monto_sancion ?? 0);
      const mVig = Number(item.monto_vigente_clp ?? item.monto_sancion ?? 0);
      setEnunciadosDraft([
        {
          nro_resolucion: item.nro_resolucion || "",
          correlativo_id: "1",
          total_moneda_raw: mPesos > 0 ? mPesos.toLocaleString("es-CL") : "",
          moneda: "CLP",
          monto_pesos_raw: mPesos > 0 ? mPesos.toLocaleString("es-CL") : "",
          nuevo_monto_pesos_raw: mVig > 0 ? mVig.toLocaleString("es-CL") : "",
          nuevoMontoTouched: mVig !== mPesos,
          observaciones: item.observaciones || "",
        },
      ]);
    }
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
    const enunciadosPayload = enunciadosDraft.map((ed, idx) => {
      const montoPesos = parseNumberInput(ed.monto_pesos_raw);
      const nuevoMontoPesos =
        ed.nuevo_monto_pesos_raw !== ""
          ? parseNumberInput(ed.nuevo_monto_pesos_raw)
          : montoPesos;
      const totalMonedaNum = ed.total_moneda_raw.trim()
        ? Number(ed.total_moneda_raw.replace(/\./g, "").replace(",", "."))
        : null;
      return {
        id: ed.id,
        nro_resolucion:
          ed.nro_resolucion.trim() ||
          formData.nro_resolucion.trim() ||
          formData.nro_multa.trim(),
        correlativo_id: ed.correlativo_id.trim() || String(idx + 1),
        total_moneda: Number.isFinite(totalMonedaNum) ? totalMonedaNum : null,
        moneda: ed.moneda,
        monto_pesos: montoPesos,
        nuevo_monto_pesos: nuevoMontoPesos,
        observaciones: ed.observaciones.trim() || null,
      };
    });

    const monto = modalTotals.totalVigente;
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
        rut_trabajador: formData.rut_trabajador.trim() || null,
        nombre_trabajador: formData.nombre_trabajador.trim() || null,
        nro_multa: formData.nro_multa.trim(),
        fecha_publicacion: formData.fecha_publicacion,
        monto_sancion: monto,
        nro_resolucion: formData.nro_resolucion.trim() || null,
        fecha_resolucion: formData.fecha_resolucion || null,
        fecha_pago: formData.estado === "PAGADA" ? formData.fecha_pago : null,
        estado: formData.estado,
        observaciones: formData.observaciones.trim() || null,
        enunciados: enunciadosPayload,
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

  const handleOpenAbonoModal = (item: LitigioMulta) => {
    const vigente = Number(item.monto_vigente_clp ?? item.monto_sancion ?? 0);
    const pagado = Number(item.monto_pagado || 0);
    const saldo = Math.max(0, vigente - pagado);
    setAbonoTarget(item);
    setAbonoMontoRaw(saldo > 0 ? saldo.toLocaleString("es-CL") : "");
    setAbonoFecha(new Date().toISOString().slice(0, 10));
    setAbonoObs("");
    setAbonoError(null);
  };

  const handleGuardarAbono = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!abonoTarget) return;
    const monto = parseNumberInput(abonoMontoRaw);
    if (monto <= 0) {
      setAbonoError("Ingrese un monto de abono mayor a $0.");
      return;
    }
    setIsSavingAbono(true);
    setAbonoError(null);
    try {
      const res = await registrarAbonoMultaAction({
        multaId: abonoTarget.id,
        montoAbono: monto,
        fechaPago: abonoFecha,
        observacion: abonoObs.trim() || null,
      });
      if (!res.success) {
        setAbonoError(res.error || "No se pudo registrar el abono.");
        return;
      }
      const refreshed = await onFetchAction();
      updateMultasData(refreshed);
      setAbonoTarget(null);
      router.refresh();
    } catch (err: unknown) {
      setAbonoError(err instanceof Error ? err.message : "Error al registrar abono.");
    } finally {
      setIsSavingAbono(false);
    }
  };

  const handleOpenEnunModal = (
    multa: LitigioMulta,
    enunciado: LitigioMultaEnunciado
  ) => {
    setEnunTarget({ multa, enunciado });
    setEnunNuevoMontoRaw(
      Number(enunciado.nuevo_monto_pesos ?? enunciado.monto_pesos ?? 0).toLocaleString("es-CL")
    );
    setEnunObs(enunciado.observaciones || "");
    setEnunError(null);
  };

  const handleGuardarEnun = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!enunTarget) return;
    const nuevoMonto = parseNumberInput(enunNuevoMontoRaw);
    setIsSavingEnun(true);
    setEnunError(null);
    try {
      const res = await actualizarEnunciadoMultaAction({
        enunciadoId: enunTarget.enunciado.id,
        multaId: enunTarget.multa.id,
        nuevoMontoPesos: nuevoMonto,
        observaciones: enunObs.trim() || null,
      });
      if (!res.success) {
        setEnunError(res.error || "Error al actualizar enunciado.");
        return;
      }
      const refreshed = await onFetchAction();
      updateMultasData(refreshed);
      setEnunTarget(null);
      router.refresh();
    } catch (err: unknown) {
      setEnunError(err instanceof Error ? err.message : "Error al actualizar enunciado.");
    } finally {
      setIsSavingEnun(false);
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
              placeholder="Buscar por N° Multa, Trabajador, RUT, Procedencia, Entidad o Resolución..."
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
                <th className="py-3 px-3.5 whitespace-nowrap">TRABAJADOR</th>
                <th className="py-3 px-3.5 whitespace-nowrap">N° MULTA</th>
                <th className="py-3 px-3.5 whitespace-nowrap">PUBLICADO EL</th>
                <th className="py-3 px-3.5 text-right whitespace-nowrap">MONTO RESOLUCIÓN</th>
                <th className="py-3 px-3.5 text-right whitespace-nowrap">PAGOS / ABONOS</th>
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
                  <td colSpan={canManage ? 12 : 11} className="text-center py-12 text-slate-400">
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
                  const isExpanded = Boolean(expandedMultas[item.id]);
                  const enunciados = item.enunciados || [];
                  const cantEnun = enunciados.length > 0 ? enunciados.length : Number(item.cantidad_enunciados || 1);
                  const montoOrig = Number(item.monto_original_clp ?? item.monto_sancion ?? 0);
                  const montoVig = Number(item.monto_vigente_clp ?? item.monto_sancion ?? 0);
                  const montoPagado = Number(item.monto_pagado ?? (isPagada ? montoVig : 0));
                  const saldoPendiente = Math.max(0, montoVig - montoPagado);
                  const pctRebaja =
                    montoOrig > 0 && montoVig < montoOrig
                      ? Math.round(((montoOrig - montoVig) / montoOrig) * 100)
                      : 0;

                  return (
                    <React.Fragment key={item.id}>
                    <tr
                      onClick={() =>
                        setExpandedMultas((prev) => ({
                          ...prev,
                          [item.id]: !prev[item.id],
                        }))
                      }
                      className={cn(
                        "hover:bg-slate-50/70 transition-colors cursor-pointer",
                        isPagada ? "bg-emerald-50/10" : "bg-white",
                        isExpanded && "bg-orange-50/30"
                      )}
                    >
                      {/* 1. PROCEDENCIA + CHEVRON + ENUNCIADOS BADGE */}
                      <td className="py-3 px-3.5 font-medium text-slate-800">
                        <div className="flex items-start gap-2">
                          <span className="mt-0.5 text-slate-400 shrink-0">
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4 text-[#E05A10]" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </span>
                          <div className="min-w-0">
                            <div className="truncate max-w-[210px] font-semibold" title={item.procedencia}>
                              {item.procedencia}
                            </div>
                            <span className="inline-flex items-center mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                              {cantEnun} {cantEnun === 1 ? "enunciado" : "enunciados"}
                            </span>
                          </div>
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

                      {/* 2.5 TRABAJADOR */}
                      <td className="py-3 px-3.5 whitespace-nowrap">
                        {item.nombre_trabajador || item.rut_trabajador ? (
                          <div>
                            <div className="font-bold text-slate-900 truncate max-w-[180px]">
                              {item.nombre_trabajador || "Sin nombre"}
                            </div>
                            {item.rut_trabajador && (
                              <div className="text-xs font-mono text-slate-500">
                                {item.rut_trabajador}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
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

                      {/* 4. MONTO RESOLUCIÓN */}
                      <td className="py-3 px-3.5 text-right font-mono whitespace-nowrap">
                        <div className="font-bold text-slate-900">
                          {formatCLP(montoVig)}
                        </div>
                        {pctRebaja > 0 && (
                          <div className="flex items-center justify-end gap-1 mt-0.5">
                            <span className="text-[10px] text-slate-400 line-through">
                              {formatCLP(montoOrig)}
                            </span>
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              -{pctRebaja}% rebaja
                            </span>
                          </div>
                        )}
                      </td>

                      {/* 4.5 PAGOS / ABONOS */}
                      <td className="py-3 px-3.5 text-right font-mono whitespace-nowrap">
                        <div className="text-xs font-bold text-emerald-600">
                          {formatCLP(montoPagado)}
                        </div>
                        <div
                          className={cn(
                            "text-[10px] font-semibold mt-0.5",
                            saldoPendiente > 0 ? "text-amber-700" : "text-slate-400"
                          )}
                        >
                          {saldoPendiente > 0
                            ? `Saldo: ${formatCLP(saldoPendiente)}`
                            : "Saldada"}
                        </div>
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

                      {/* 9. ACCIONES */}
                      {canManage && (
                        <td
                          className="py-3 px-3.5 text-center whitespace-nowrap"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="inline-flex items-center gap-1">
                            {saldoPendiente > 0 && (
                              <button
                                onClick={() => handleOpenAbonoModal(item)}
                                type="button"
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-[11px] font-semibold transition-colors cursor-pointer"
                                title="Registrar Pago / Abono"
                              >
                                <Banknote className="h-3.5 w-3.5" />
                                Abonar
                              </button>
                            )}
                            <button
                              onClick={() => handleOpenEditModal(item)}
                              type="button"
                              className="p-1.5 rounded-md hover:bg-orange-50 text-slate-500 hover:text-[#E05A10] transition-colors cursor-pointer"
                              title="Editar / Gestionar Multa"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>

                    {/* Acordeón: Detalle Caso a Caso por Enunciado */}
                    {isExpanded && (
                      <tr className="bg-slate-50/90">
                        <td colSpan={canManage ? 12 : 11} className="px-6 py-3.5">
                          <div className="rounded-lg border border-slate-200 bg-white overflow-x-auto shadow-2xs">
                            <div className="px-3.5 py-2 bg-slate-100/80 border-b border-slate-200 flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-600">
                              <span>
                                Desglose por Enunciados de Infracción ({cantEnun})
                              </span>
                              <span className="font-mono text-slate-500">
                                Constatado: {formatCLP(montoOrig)} · Vigente:{" "}
                                <strong className="text-[#0F172A]">
                                  {formatCLP(montoVig)}
                                </strong>
                              </span>
                            </div>
                            {enunciados.length === 0 ? (
                              <div className="p-4 text-xs text-slate-500">
                                Resolución registrada sin desglose individual. Monto vigente:{" "}
                                <strong className="font-mono text-slate-800">
                                  {formatCLP(montoVig)}
                                </strong>
                                {item.observaciones ? ` · Obs: ${item.observaciones}` : ""}
                              </div>
                            ) : (
                              <table className="w-full text-left border-collapse text-xs">
                                <thead>
                                  <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                    <th className="py-2 px-3">N° Resolución</th>
                                    <th className="py-2 px-3">ID</th>
                                    <th className="py-2 px-3 text-right">Total $</th>
                                    <th className="py-2 px-3 text-center">Moneda</th>
                                    <th className="py-2 px-3 text-right">Monto $ en pesos</th>
                                    <th className="py-2 px-3 text-right">Nuevo Monto $</th>
                                    <th className="py-2 px-3">Observaciones</th>
                                    {canManage && (
                                      <th className="py-2 px-3 text-center">Acción</th>
                                    )}
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {enunciados.map((enun) => {
                                    const origP = Number(enun.monto_pesos || 0);
                                    const vigP = Number(enun.nuevo_monto_pesos ?? origP);
                                    const rebajado = vigP < origP;
                                    return (
                                      <tr key={enun.id} className="hover:bg-slate-50">
                                        <td className="py-2 px-3 font-mono font-semibold text-slate-800 whitespace-nowrap">
                                          {enun.nro_resolucion || item.nro_resolucion || "-"}
                                        </td>
                                        <td className="py-2 px-3 font-mono text-slate-600">
                                          {enun.correlativo_id}
                                        </td>
                                        <td className="py-2 px-3 font-mono text-right text-slate-700 whitespace-nowrap">
                                          {enun.total_moneda !== null &&
                                          enun.total_moneda !== undefined
                                            ? Number(enun.total_moneda).toLocaleString("es-CL", {
                                                maximumFractionDigits: 2,
                                              })
                                            : enun.moneda === "CLP"
                                            ? formatCLP(origP)
                                            : "—"}
                                        </td>
                                        <td className="py-2 px-3 text-center">
                                          <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-mono text-[10px] font-bold">
                                            {enun.moneda || "UTM"}
                                          </span>
                                        </td>
                                        <td className="py-2 px-3 font-mono text-right text-slate-700 whitespace-nowrap">
                                          {formatCLP(origP)}
                                        </td>
                                        <td
                                          className={cn(
                                            "py-2 px-3 font-mono text-right font-bold whitespace-nowrap",
                                            rebajado ? "text-emerald-700" : "text-slate-900"
                                          )}
                                        >
                                          {formatCLP(vigP)}
                                        </td>
                                        <td className="py-2 px-3 text-slate-600 max-w-[260px]">
                                          {enun.observaciones || "—"}
                                        </td>
                                        {canManage && (
                                          <td className="py-2 px-3 text-center whitespace-nowrap">
                                            <button
                                              type="button"
                                              onClick={() => handleOpenEnunModal(item, enun)}
                                              className="inline-flex items-center gap-1 px-2 py-1 rounded border border-orange-200 bg-orange-50 hover:bg-orange-100 text-[#E05A10] text-[10px] font-semibold transition-colors cursor-pointer"
                                            >
                                              <Pencil className="h-3 w-3" />
                                              Editar / Rebajar
                                            </button>
                                          </td>
                                        )}
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                    </React.Fragment>
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
          <div className="w-[95vw] sm:w-full max-w-5xl rounded-xl border border-slate-200 bg-white shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
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

                {/* Trabajador Asociado (Opcional) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      RUT Trabajador (Opcional)
                    </label>
                    <input
                      type="text"
                      value={formData.rut_trabajador}
                      onChange={(e) => {
                        const clean = e.target.value.replace(/[^0-9kK]/g, "").toUpperCase().slice(0, 9);
                        const formatted =
                          clean.length <= 1
                            ? clean
                            : `${clean.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, ".")}-${clean.slice(-1)}`;
                        setFormData({ ...formData, rut_trabajador: formatted });
                      }}
                      placeholder="Ej. 12.345.678-9"
                      className="w-full px-3 py-1.5 text-xs rounded-md bg-white border border-slate-300 text-slate-900 placeholder-slate-400 font-mono focus:outline-none focus:ring-2 focus:ring-[#E05A10]/20 focus:border-[#E05A10]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Nombre Trabajador (Opcional)
                    </label>
                    <input
                      type="text"
                      value={formData.nombre_trabajador}
                      onChange={(e) =>
                        setFormData({ ...formData, nombre_trabajador: e.target.value })
                      }
                      placeholder="Ej. Juan Pérez González"
                      className="w-full px-3 py-1.5 text-xs rounded-md bg-white border border-slate-300 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#E05A10]/20 focus:border-[#E05A10]"
                    />
                  </div>
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

                {/* Cantidad de enunciados de infracción */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Cantidad de enunciados de infracción *
                  </label>
                  <div className="inline-flex items-center rounded-md border border-slate-300 bg-white overflow-hidden">
                    <button
                      type="button"
                      onClick={() =>
                        handleCantidadEnunciadosChange(enunciadosDraft.length - 1)
                      }
                      className="px-2.5 py-1.5 text-slate-600 hover:bg-slate-100 border-r border-slate-200 cursor-pointer"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={enunciadosDraft.length}
                      onChange={(e) =>
                        handleCantidadEnunciadosChange(Number(e.target.value))
                      }
                      className="w-14 text-center py-1 text-xs font-mono font-bold text-slate-900 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        handleCantidadEnunciadosChange(enunciadosDraft.length + 1)
                      }
                      className="px-2.5 py-1.5 text-slate-600 hover:bg-slate-100 border-l border-slate-200 cursor-pointer"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
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
                    Observaciones / Detalle General
                  </label>
                  <textarea
                    rows={2}
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

              {/* Grilla Dinámica de Enunciados de Infracción (7 encabezados exactos) */}
              <div className="rounded-lg border border-slate-200 bg-slate-50/70 overflow-hidden">
                <div className="px-3.5 py-2 border-b border-slate-200 bg-slate-100/80 flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
                    Desglose por Enunciados de Infracción ({enunciadosDraft.length})
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Ingrese montos constatados y eventuales rebajas por apelación
                  </span>
                </div>
                <div className="overflow-x-auto bg-white">
                  <table className="w-full min-w-[820px] text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold uppercase tracking-wider text-slate-600">
                        <th className="py-2 px-2.5">N° Resolución</th>
                        <th className="py-2 px-2 w-16">ID</th>
                        <th className="py-2 px-2.5 w-28">Total $</th>
                        <th className="py-2 px-2 w-24">Moneda</th>
                        <th className="py-2 px-2.5 w-36">Monto $ en pesos</th>
                        <th className="py-2 px-2.5 w-36">Nuevo Monto $</th>
                        <th className="py-2 px-2.5">Observaciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {enunciadosDraft.map((row, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/60">
                          <td className="py-1.5 px-2">
                            <input
                              type="text"
                              value={row.nro_resolucion}
                              onChange={(e) => {
                                const val = e.target.value;
                                setEnunciadosDraft((prev) =>
                                  prev.map((item, i) =>
                                    i === idx ? { ...item, nro_resolucion: val } : item
                                  )
                                );
                              }}
                              placeholder={formData.nro_resolucion || "1126/26/2"}
                              className="w-full px-2 py-1 text-xs rounded border border-slate-300 font-mono text-slate-900 focus:border-[#E05A10] focus:outline-none"
                            />
                          </td>
                          <td className="py-1.5 px-2">
                            <input
                              type="text"
                              value={row.correlativo_id}
                              onChange={(e) => {
                                const val = e.target.value;
                                setEnunciadosDraft((prev) =>
                                  prev.map((item, i) =>
                                    i === idx ? { ...item, correlativo_id: val } : item
                                  )
                                );
                              }}
                              className="w-full px-2 py-1 text-xs rounded border border-slate-300 font-mono text-center text-slate-900 focus:border-[#E05A10] focus:outline-none"
                            />
                          </td>
                          <td className="py-1.5 px-2">
                            <input
                              type="text"
                              value={row.total_moneda_raw}
                              onChange={(e) => {
                                const val = e.target.value;
                                setEnunciadosDraft((prev) =>
                                  prev.map((item, i) => {
                                    if (i !== idx) return item;
                                    if (item.moneda === "CLP") {
                                      const formattedClp = formatNumberInput(val);
                                      return {
                                        ...item,
                                        total_moneda_raw: formattedClp,
                                        monto_pesos_raw: formattedClp,
                                        nuevo_monto_pesos_raw: item.nuevoMontoTouched
                                          ? item.nuevo_monto_pesos_raw
                                          : formattedClp,
                                      };
                                    }
                                    return { ...item, total_moneda_raw: val };
                                  })
                                );
                              }}
                              placeholder={row.moneda === "CLP" ? "1.450.000" : "40,00"}
                              className="w-full px-2 py-1 text-xs rounded border border-slate-300 font-mono text-right text-slate-900 focus:border-[#E05A10] focus:outline-none"
                            />
                          </td>
                          <td className="py-1.5 px-2">
                            <select
                              value={row.moneda}
                              onChange={(e) => {
                                const m = e.target.value as MonedaMultaEnunciado;
                                setEnunciadosDraft((prev) =>
                                  prev.map((item, i) => {
                                    if (i !== idx) return item;
                                    if (m === "CLP" && item.total_moneda_raw) {
                                      const formattedClp = formatNumberInput(
                                        item.total_moneda_raw
                                      );
                                      return {
                                        ...item,
                                        moneda: m,
                                        total_moneda_raw: formattedClp,
                                        monto_pesos_raw: formattedClp,
                                        nuevo_monto_pesos_raw: item.nuevoMontoTouched
                                          ? item.nuevo_monto_pesos_raw
                                          : formattedClp,
                                      };
                                    }
                                    return { ...item, moneda: m };
                                  })
                                );
                              }}
                              className="w-full px-1.5 py-1 text-xs rounded border border-slate-300 bg-white font-mono font-semibold text-slate-800 focus:border-[#E05A10] focus:outline-none"
                            >
                              <option value="UTM">UTM</option>
                              <option value="CLP">CLP</option>
                              <option value="UF">UF</option>
                            </select>
                          </td>
                          <td className="py-1.5 px-2">
                            <div className="relative">
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-mono text-slate-400">
                                $
                              </span>
                              <input
                                type="text"
                                required
                                value={row.monto_pesos_raw}
                                onChange={(e) => {
                                  const formatted = formatNumberInput(e.target.value);
                                  setEnunciadosDraft((prev) =>
                                    prev.map((item, i) =>
                                      i === idx
                                        ? {
                                            ...item,
                                            monto_pesos_raw: formatted,
                                            nuevo_monto_pesos_raw:
                                              item.nuevoMontoTouched
                                                ? item.nuevo_monto_pesos_raw
                                                : formatted,
                                          }
                                        : item
                                    )
                                  );
                                }}
                                placeholder="2.868.840"
                                className="w-full pl-5 pr-2 py-1 text-xs rounded border border-slate-300 font-mono text-right font-semibold text-slate-900 focus:border-[#E05A10] focus:outline-none"
                              />
                            </div>
                          </td>
                          <td className="py-1.5 px-2">
                            <div className="relative">
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-mono text-slate-400">
                                $
                              </span>
                              <input
                                type="text"
                                value={row.nuevo_monto_pesos_raw}
                                onChange={(e) => {
                                  const formatted = formatNumberInput(e.target.value);
                                  setEnunciadosDraft((prev) =>
                                    prev.map((item, i) =>
                                      i === idx
                                        ? {
                                            ...item,
                                            nuevo_monto_pesos_raw: formatted,
                                            nuevoMontoTouched: true,
                                          }
                                        : item
                                    )
                                  );
                                }}
                                placeholder="2.868.840"
                                className="w-full pl-5 pr-2 py-1 text-xs rounded border border-emerald-300 bg-emerald-50/30 font-mono text-right font-bold text-slate-900 focus:border-[#E05A10] focus:outline-none"
                              />
                            </div>
                          </td>
                          <td className="py-1.5 px-2">
                            <input
                              type="text"
                              value={row.observaciones}
                              onChange={(e) => {
                                const val = e.target.value;
                                setEnunciadosDraft((prev) =>
                                  prev.map((item, i) =>
                                    i === idx ? { ...item, observaciones: val } : item
                                  )
                                );
                              }}
                              placeholder="Detalle punto infractor / rebaja..."
                              className="w-full px-2 py-1 text-xs rounded border border-slate-300 text-slate-800 focus:border-[#E05A10] focus:outline-none"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pie Totalizador en Vivo */}
                <div className="px-4 py-2.5 bg-slate-100/90 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-600 font-semibold">
                      Total Constatado ($ CLP):
                    </span>
                    <span className="font-mono font-bold text-slate-900">
                      {formatCLP(modalTotals.totalConstatado)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-600 font-semibold">
                      Total Vigente / Rebajado ($ CLP):
                    </span>
                    <span className="font-mono font-black text-sm text-[#0F172A]">
                      {formatCLP(modalTotals.totalVigente)}
                    </span>
                    {modalTotals.ahorro > 0 && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 font-mono">
                        Ahorro: {formatCLP(modalTotals.ahorro)}
                      </span>
                    )}
                  </div>
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

      {/* 7. Modal Registrar Pago / Abono */}
      {abonoTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="w-[95vw] sm:w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 bg-[#0F172A] text-white">
              <div className="flex items-center gap-2">
                <Banknote className="h-4 w-4 text-[#E05A10]" />
                <h2 className="text-sm font-bold">
                  Registrar Pago / Abono — Multa {abonoTarget.nro_multa}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setAbonoTarget(null)}
                className="text-slate-400 hover:text-white p-1 rounded"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleGuardarAbono} className="p-5 space-y-3.5">
              {abonoError && (
                <div className="p-2.5 rounded bg-red-50 border border-red-200 text-red-700 text-xs">
                  {abonoError}
                </div>
              )}
              <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">Monto Vigente:</span>
                  <span className="font-mono font-bold text-slate-900">
                    {formatCLP(
                      Number(abonoTarget.monto_vigente_clp ?? abonoTarget.monto_sancion ?? 0)
                    )}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Pagado Previo:</span>
                  <span className="font-mono font-semibold text-emerald-600">
                    {formatCLP(Number(abonoTarget.monto_pagado || 0))}
                  </span>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Monto Abono / Pago ($ CLP) *
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-mono text-xs font-bold">
                    $
                  </span>
                  <input
                    type="text"
                    required
                    value={abonoMontoRaw}
                    onChange={(e) => setAbonoMontoRaw(formatNumberInput(e.target.value))}
                    className="w-full pl-7 pr-3 py-1.5 text-xs rounded-md border border-slate-300 font-mono font-bold text-slate-900 focus:border-[#E05A10] focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Fecha de Pago *
                </label>
                <input
                  type="date"
                  required
                  value={abonoFecha}
                  onChange={(e) => setAbonoFecha(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs rounded-md border border-slate-300 text-slate-900 focus:border-[#E05A10] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Observación / Comprobante
                </label>
                <input
                  type="text"
                  value={abonoObs}
                  onChange={(e) => setAbonoObs(e.target.value)}
                  placeholder="Ej. Transferencia Tesorería, Comprobante TGR..."
                  className="w-full px-3 py-1.5 text-xs rounded-md border border-slate-300 text-slate-900 focus:border-[#E05A10] focus:outline-none"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setAbonoTarget(null)}
                  className="px-3 py-1.5 text-xs rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingAbono}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded-md bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50 cursor-pointer"
                >
                  {isSavingAbono && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Confirmar Pago
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 8. Modal Editar / Rebajar Enunciado Individual */}
      {enunTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="w-[95vw] sm:w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 bg-[#0F172A] text-white">
              <div>
                <h2 className="text-sm font-bold">
                  Editar / Rebajar Enunciado #{enunTarget.enunciado.correlativo_id}
                </h2>
                <p className="text-[10px] text-slate-400 font-mono">
                  Resolución: {enunTarget.enunciado.nro_resolucion}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEnunTarget(null)}
                className="text-slate-400 hover:text-white p-1 rounded"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleGuardarEnun} className="p-5 space-y-3.5">
              {enunError && (
                <div className="p-2.5 rounded bg-red-50 border border-red-200 text-red-700 text-xs">
                  {enunError}
                </div>
              )}
              <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-xs flex justify-between">
                <span className="text-slate-500">Monto Constatado Original:</span>
                <span className="font-mono font-bold text-slate-800">
                  {formatCLP(Number(enunTarget.enunciado.monto_pesos || 0))}
                </span>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nuevo Monto $ (Vigente tras Rebaja) *
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-mono text-xs font-bold">
                    $
                  </span>
                  <input
                    type="text"
                    required
                    value={enunNuevoMontoRaw}
                    onChange={(e) => setEnunNuevoMontoRaw(formatNumberInput(e.target.value))}
                    className="w-full pl-7 pr-3 py-1.5 text-xs rounded-md border border-slate-300 font-mono font-bold text-slate-900 focus:border-[#E05A10] focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Observaciones / Resolución de Rebaja
                </label>
                <textarea
                  rows={3}
                  value={enunObs}
                  onChange={(e) => setEnunObs(e.target.value)}
                  placeholder="Ej. Reconsideración administrativa acogida, rebaja al 50%..."
                  className="w-full px-3 py-1.5 text-xs rounded-md border border-slate-300 text-slate-900 focus:border-[#E05A10] focus:outline-none"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setEnunTarget(null)}
                  className="px-3 py-1.5 text-xs rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingEnun}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded-md bg-[#E05A10] hover:bg-[#c94e0d] text-white disabled:opacity-50 cursor-pointer"
                >
                  {isSavingEnun && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Guardar Rebaja
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
