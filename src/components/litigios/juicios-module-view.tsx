"use client";

import React, { useState, useTransition, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  TablePagination,
  GLOBAL_PAGE_SIZE,
  paginateArray,
} from "@/components/ui/TablePagination";
import {
  Gavel,
  Plus,
  Search,
  Pencil,
  History,
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
} from "lucide-react";
import {
  LitigioJuicio,
  LitigioAudienciaJuicio,
  EstadoLitigioJuicio,
  LitigiosJuiciosKpis,
} from "@/types/database.types";
import {
  JuiciosFilterParams,
  deleteAudienciaJuicioAction,
} from "@/actions/litigios.actions";
import { cn, formatDateCL, formatCLP } from "@/lib/utils";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { QUERY_KEYS } from "@/lib/prefetch-helpers";

type JuiciosTab = "PENDIENTES" | "FINALIZADOS";

interface JuiciosModuleViewProps {
  initialItems: LitigioJuicio[];
  initialKpis: LitigiosJuiciosKpis;
  onFetchAction: (
    filters?: JuiciosFilterParams
  ) => Promise<{ items: LitigioJuicio[]; kpis: LitigiosJuiciosKpis }>;
  onUpsertAction: (data: any) => Promise<{ success: boolean; data?: LitigioJuicio; error?: string }>;
  onUpsertAudienciaAction?: (data: any) => Promise<{ success: boolean; data?: LitigioAudienciaJuicio; error?: string }>;
  onDeleteAudienciaAction?: (audienciaId: string, juicioId?: string) => Promise<{ success: boolean; error?: string }>;
  canManage?: boolean;
}

export function JuiciosModuleView({
  initialItems,
  initialKpis,
  onFetchAction,
  onUpsertAction,
  onUpsertAudienciaAction,
  onDeleteAudienciaAction = deleteAudienciaJuicioAction,
  canManage = true,
}: JuiciosModuleViewProps) {
  const router = useRouter();
  const queryClient = useQueryClient();

  // Caché dinámico de TanStack Query: renders instantáneos (<1ms) y revalidación en segundo plano
  const { data: queryData } = useQuery({
    queryKey: QUERY_KEYS.litigiosJuicios,
    queryFn: () => onFetchAction(),
    initialData: { items: initialItems, kpis: initialKpis },
    staleTime: 5 * 60 * 1000,
  });

  const [localData, setLocalData] = useState<{
    items: LitigioJuicio[];
    kpis: LitigiosJuiciosKpis;
  }>({ items: initialItems, kpis: initialKpis });

  const items = queryData?.items ?? localData.items;
  const kpis = queryData?.kpis ?? localData.kpis;

  const updateJuiciosData = React.useCallback(
    (refreshed: { items: LitigioJuicio[]; kpis: LitigiosJuiciosKpis }) => {
      queryClient.setQueryData(QUERY_KEYS.litigiosJuicios, refreshed);
      setLocalData(refreshed);
    },
    [queryClient]
  );

  // Tabs: "PENDIENTES" (En tramitación) vs "FINALIZADOS" (Concluido / Pagado)
  const [activeTab, setActiveTab] = useState<JuiciosTab>("PENDIENTES");

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [materiaFilter, setMateriaFilter] = useState<string>("TODAS");
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, searchQuery, materiaFilter]);

  const [isPending, startTransition] = useTransition();

  // Modal State: Crear / Editar Causa
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<LitigioJuicio | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form Fields para Causa
  const [formData, setFormData] = useState({
    rit_ruc: "",
    nombre_trabajador: "",
    materia: "",
    cuantiaRaw: "", // CLP formateado
    estado: "PENDIENTE" as EstadoLitigioJuicio,
    observaciones: "",
    audiencias: [] as Array<{
      id?: string;
      numero_audiencia: number;
      fecha_audiencia: string;
      resultado_dictamen?: string | null;
    }>,
  });

  // Sub-formulario para agregar audiencia dentro del modal de edición
  const [isAddingAudienceInForm, setIsAddingAudienceInForm] = useState(false);
  const [newAudienceFecha, setNewAudienceFecha] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [newAudienceResultado, setNewAudienceResultado] = useState("");

  // Modal State: Bitácora de Audiencias (Historial directo desde la tabla)
  const [isBitacoraModalOpen, setIsBitacoraModalOpen] = useState(false);
  const [bitacoraJuicio, setBitacoraJuicio] = useState<LitigioJuicio | null>(null);
  const [isAddingAudienceInBitacora, setIsAddingAudienceInBitacora] = useState(false);
  const [bitacoraNewFecha, setBitacoraNewFecha] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [bitacoraNewResultado, setBitacoraNewResultado] = useState("");
  const [bitacoraSubmitting, setBitacoraSubmitting] = useState(false);
  const [bitacoraError, setBitacoraError] = useState<string | null>(null);

  // Estado de edición para cada ítem en Bitácora
  const [editingAudienceId, setEditingAudienceId] = useState<string | null>(null);
  const [editAudienceFecha, setEditAudienceFecha] = useState("");
  const [editAudienceResultado, setEditAudienceResultado] = useState("");

  // Helper para formatear string numérico con separador de miles
  const formatNumberInput = (val: string) => {
    const clean = val.replace(/\D/g, "");
    if (!clean) return "";
    return Number(clean).toLocaleString("es-CL");
  };

  const parseNumberInput = (val: string): number => {
    const clean = val.replace(/\D/g, "");
    return clean ? Number(clean) : 0;
  };

  // Extract unique materias for filter dropdown
  const uniqueMaterias = useMemo(() => {
    const set = new Set<string>();
    items.forEach((j) => {
      if (j.materia && j.materia.trim()) {
        set.add(j.materia.trim());
      }
    });
    return Array.from(set).sort();
  }, [items]);

  // Tab filtering & client search
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      // 1. Tab filter
      const isPendingStatus = item.estado === "PENDIENTE";
      if (activeTab === "PENDIENTES" && !isPendingStatus) {
        return false;
      }
      if (activeTab === "FINALIZADOS" && isPendingStatus) {
        return false;
      }

      // 2. Materia filter
      if (materiaFilter !== "TODAS") {
        if (!item.materia.toLowerCase().includes(materiaFilter.toLowerCase())) {
          return false;
        }
      }

      // 3. Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const match =
          item.rit_ruc.toLowerCase().includes(q) ||
          item.nombre_trabajador.toLowerCase().includes(q) ||
          item.materia.toLowerCase().includes(q) ||
          (item.observaciones || "").toLowerCase().includes(q) ||
          (item.ultima_audiencia?.resultado_dictamen || "").toLowerCase().includes(q) ||
          (item.audiencias || []).some((a) =>
            (a.resultado_dictamen || "").toLowerCase().includes(q)
          );
        if (!match) return false;
      }

      return true;
    });
  }, [items, activeTab, materiaFilter, searchQuery]);

  // Counts for tabs
  const pendientesCount = useMemo(
    () => items.filter((j) => j.estado === "PENDIENTE").length,
    [items]
  );
  const finalizadosCount = useMemo(
    () => items.filter((j) => j.estado !== "PENDIENTE").length,
    [items]
  );

  // Abrir Modal de Creación
  const handleOpenCreateModal = () => {
    setEditingItem(null);
    setFormData({
      rit_ruc: "",
      nombre_trabajador: "",
      materia: "",
      cuantiaRaw: "",
      estado: "PENDIENTE",
      observaciones: "",
      audiencias: [],
    });
    setIsAddingAudienceInForm(false);
    setFormError(null);
    setIsModalOpen(true);
  };

  // Abrir Modal de Edición
  const handleOpenEditModal = (item: LitigioJuicio) => {
    setEditingItem(item);
    const monto = item.cuantia_clp !== undefined ? item.cuantia_clp : item.cuantia;
    setFormData({
      rit_ruc: item.rit_ruc,
      nombre_trabajador: item.nombre_trabajador,
      materia: item.materia,
      cuantiaRaw: monto ? Number(monto).toLocaleString("es-CL") : "",
      estado: item.estado,
      observaciones: item.observaciones || "",
      audiencias: (item.audiencias || []).map((a) => ({
        id: a.id,
        numero_audiencia: a.numero_audiencia,
        fecha_audiencia: a.fecha_audiencia,
        resultado_dictamen: a.resultado_dictamen,
      })),
    });
    setIsAddingAudienceInForm(false);
    setFormError(null);
    setIsModalOpen(true);
  };

  // Abrir Modal de Bitácora desde la tabla
  const handleOpenBitacoraModal = (item: LitigioJuicio) => {
    setBitacoraJuicio(item);
    setIsAddingAudienceInBitacora(false);
    setEditingAudienceId(null);
    setEditAudienceFecha("");
    setEditAudienceResultado("");
    setBitacoraNewFecha(new Date().toISOString().slice(0, 10));
    setBitacoraNewResultado("");
    setBitacoraError(null);
    setIsBitacoraModalOpen(true);
  };

  // Agregar audiencia en la lista interna del formulario
  const handleAddAudienceInForm = () => {
    if (!newAudienceFecha) {
      alert("Por favor seleccione la fecha de la audiencia.");
      return;
    }

    const isFuture = newAudienceFecha > new Date().toISOString().slice(0, 10);
    const finalResultado =
      newAudienceResultado.trim() ||
      (isFuture
        ? "Audiencia programada / Pendiente de celebración"
        : "Pendiente de dictamen");

    const nextCorrelativo = formData.audiencias.length + 1;
    const newEntry = {
      numero_audiencia: nextCorrelativo,
      fecha_audiencia: newAudienceFecha,
      resultado_dictamen: finalResultado,
    };

    setFormData({
      ...formData,
      audiencias: [...formData.audiencias, newEntry],
    });

    setNewAudienceResultado("");
    setNewAudienceFecha(new Date().toISOString().slice(0, 10));
    setIsAddingAudienceInForm(false);
  };

  // Guardar formulario principal de Causa
  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formData.rit_ruc.trim()) {
      setFormError("El RIT / RUC de la causa es obligatorio.");
      return;
    }
    if (!formData.nombre_trabajador.trim()) {
      setFormError("El nombre del trabajador o demandante es obligatorio.");
      return;
    }
    if (!formData.materia.trim()) {
      setFormError("La materia de la demanda es obligatoria.");
      return;
    }

    const cuantiaVal = parseNumberInput(formData.cuantiaRaw);

    setIsSubmitting(true);
    try {
      const res = await onUpsertAction({
        id: editingItem?.id,
        rit_ruc: formData.rit_ruc.trim(),
        nombre_trabajador: formData.nombre_trabajador.trim(),
        materia: formData.materia.trim(),
        cuantia: cuantiaVal,
        cuantia_clp: cuantiaVal,
        estado: formData.estado,
        observaciones: formData.observaciones.trim() || null,
        audiencias: formData.audiencias,
      });

      if (!res.success) {
        setFormError(res.error || "Error al guardar la causa laboral.");
        return;
      }

      // Refrescar datos y sincronizar caché
      startTransition(async () => {
        const refreshed = await onFetchAction();
        updateJuiciosData(refreshed);
      });

      setIsModalOpen(false);
      router.refresh();
    } catch (err: any) {
      setFormError(err.message || "Error al guardar la causa laboral.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Guardar nueva audiencia directamente desde la Bitácora modal
  const handleSaveAudienceInBitacora = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bitacoraJuicio) return;
    setBitacoraError(null);

    if (!bitacoraNewFecha) {
      setBitacoraError("Debe indicar la fecha de la audiencia.");
      return;
    }

    const isFuture = bitacoraNewFecha > new Date().toISOString().slice(0, 10);
    const finalResultado =
      bitacoraNewResultado.trim() ||
      (isFuture
        ? "Audiencia programada / Pendiente de celebración"
        : "Pendiente de dictamen");

    setBitacoraSubmitting(true);
    try {
      const nextCorrelativo = (bitacoraJuicio.audiencias || []).length + 1;

      if (onUpsertAudienciaAction) {
        const resAud = await onUpsertAudienciaAction({
          juicio_id: bitacoraJuicio.id,
          numero_audiencia: nextCorrelativo,
          fecha_audiencia: bitacoraNewFecha,
          resultado_dictamen: finalResultado,
        });
        if (!resAud.success) {
          setBitacoraError(resAud.error || "Error al registrar la audiencia.");
          return;
        }
      } else {
        const existingAuds = bitacoraJuicio.audiencias || [];
        const updatedAuds = [
          ...existingAuds,
          {
            numero_audiencia: nextCorrelativo,
            fecha_audiencia: bitacoraNewFecha,
            resultado_dictamen: finalResultado,
          },
        ];
        const resJuicio = await onUpsertAction({
          id: bitacoraJuicio.id,
          rit_ruc: bitacoraJuicio.rit_ruc,
          nombre_trabajador: bitacoraJuicio.nombre_trabajador,
          materia: bitacoraJuicio.materia,
          cuantia: bitacoraJuicio.cuantia,
          cuantia_clp: bitacoraJuicio.cuantia_clp ?? bitacoraJuicio.cuantia,
          estado: bitacoraJuicio.estado,
          observaciones: bitacoraJuicio.observaciones,
          audiencias: updatedAuds,
        });
        if (!resJuicio.success) {
          setBitacoraError(resJuicio.error || "Error al registrar la audiencia.");
          return;
        }
      }

      const refreshed = await onFetchAction();
      updateJuiciosData(refreshed);

      const updatedJuicio = refreshed.items.find((j) => j.id === bitacoraJuicio.id);
      if (updatedJuicio) {
        setBitacoraJuicio(updatedJuicio);
      }

      setBitacoraNewResultado("");
      setBitacoraNewFecha(new Date().toISOString().slice(0, 10));
      setIsAddingAudienceInBitacora(false);
      router.refresh();
    } catch (err: any) {
      setBitacoraError(err.message || "Error al registrar la audiencia.");
    } finally {
      setBitacoraSubmitting(false);
    }
  };

  // Iniciar edición de una audiencia existente en la bitácora
  const handleStartEditAudience = (aud: LitigioAudienciaJuicio) => {
    setIsAddingAudienceInBitacora(false);
    setEditingAudienceId(aud.id);
    setEditAudienceFecha(aud.fecha_audiencia);
    setEditAudienceResultado(
      aud.resultado_dictamen === "Audiencia programada / Pendiente de celebración" ||
      aud.resultado_dictamen === "Pendiente de dictamen"
        ? ""
        : aud.resultado_dictamen || ""
    );
    setBitacoraError(null);
  };

  // Cancelar edición
  const handleCancelEditAudience = () => {
    setEditingAudienceId(null);
    setEditAudienceFecha("");
    setEditAudienceResultado("");
    setBitacoraError(null);
  };

  // Guardar cambios de edición de una audiencia
  const handleSaveEditAudience = async (aud: LitigioAudienciaJuicio) => {
    if (!bitacoraJuicio) return;
    setBitacoraError(null);

    if (!editAudienceFecha) {
      setBitacoraError("Debe indicar la fecha de la audiencia.");
      return;
    }

    const isFuture = editAudienceFecha > new Date().toISOString().slice(0, 10);
    const finalResultado =
      editAudienceResultado.trim() ||
      (isFuture
        ? "Audiencia programada / Pendiente de celebración"
        : "Pendiente de dictamen");

    setBitacoraSubmitting(true);
    try {
      if (onUpsertAudienciaAction) {
        const resAud = await onUpsertAudienciaAction({
          id: aud.id,
          juicio_id: bitacoraJuicio.id,
          numero_audiencia: aud.numero_audiencia,
          fecha_audiencia: editAudienceFecha,
          resultado_dictamen: finalResultado,
        });
        if (!resAud.success) {
          setBitacoraError(resAud.error || "Error al actualizar la audiencia.");
          return;
        }
      } else {
        const existingAuds = bitacoraJuicio.audiencias || [];
        const updatedAuds = existingAuds.map((a) =>
          a.id === aud.id
            ? {
                ...a,
                fecha_audiencia: editAudienceFecha,
                resultado_dictamen: finalResultado,
              }
            : a
        );
        const resJuicio = await onUpsertAction({
          id: bitacoraJuicio.id,
          rit_ruc: bitacoraJuicio.rit_ruc,
          nombre_trabajador: bitacoraJuicio.nombre_trabajador,
          materia: bitacoraJuicio.materia,
          cuantia: bitacoraJuicio.cuantia,
          cuantia_clp: bitacoraJuicio.cuantia_clp ?? bitacoraJuicio.cuantia,
          estado: bitacoraJuicio.estado,
          observaciones: bitacoraJuicio.observaciones,
          audiencias: updatedAuds,
        });
        if (!resJuicio.success) {
          setBitacoraError(resJuicio.error || "Error al actualizar la audiencia.");
          return;
        }
      }

      const refreshed = await onFetchAction();
      updateJuiciosData(refreshed);

      const updatedJuicio = refreshed.items.find((j) => j.id === bitacoraJuicio.id);
      if (updatedJuicio) {
        setBitacoraJuicio(updatedJuicio);
      }

      setEditingAudienceId(null);
      setEditAudienceFecha("");
      setEditAudienceResultado("");
      router.refresh();
    } catch (err: any) {
      setBitacoraError(err.message || "Error al actualizar la audiencia.");
    } finally {
      setBitacoraSubmitting(false);
    }
  };

  // Eliminar una audiencia del historial
  const handleDeleteAudience = async (aud: LitigioAudienciaJuicio) => {
    if (!bitacoraJuicio) return;
    const confirmed = window.confirm("¿Está seguro de eliminar esta audiencia del historial?");
    if (!confirmed) return;

    setBitacoraSubmitting(true);
    setBitacoraError(null);
    try {
      const resDel = onDeleteAudienciaAction
        ? await onDeleteAudienciaAction(aud.id, bitacoraJuicio.id)
        : await deleteAudienciaJuicioAction(aud.id, bitacoraJuicio.id);

      if (!resDel.success) {
        setBitacoraError(resDel.error || "Error al eliminar la audiencia.");
        return;
      }

      const refreshed = await onFetchAction();
      updateJuiciosData(refreshed);

      const updatedJuicio = refreshed.items.find((j) => j.id === bitacoraJuicio.id);
      if (updatedJuicio) {
        setBitacoraJuicio(updatedJuicio);
      }

      if (editingAudienceId === aud.id) {
        setEditingAudienceId(null);
      }
      router.refresh();
    } catch (err: any) {
      setBitacoraError(err.message || "Error al eliminar la audiencia.");
    } finally {
      setBitacoraSubmitting(false);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto select-none">
      {/* 1. Header Principal Estándar Tensacon */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-[#0F172A] text-[#E05A10] flex items-center justify-center shadow-sm">
            <Gavel className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                Juicios
              </h1>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-200 uppercase">
                REG. LITIGIOS
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Control de litigios laborales, bitácora correlativa de audiencias y cuantías en $ CLP.
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
              <span>Nuevo Juicio</span>
            </button>
          </div>
        )}
      </div>

      {/* 2. Tarjetas KPI Superiores: Jerarquía invertida (Monto principal en $ CLP y detalle de procesos secundario) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Tarjeta 1: Total General */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500 uppercase tracking-wider">
            <span>Monto Total Causas</span>
            <Scale className="h-4 w-4 text-slate-400" />
          </div>
          <div className="mt-3">
            <span className="text-2xl font-extrabold text-slate-900 block font-mono">
              {formatCLP(kpis.cuantiaTotal)}
            </span>
            <span className="text-xs font-semibold text-slate-500 mt-0.5 block">
              {kpis.totalJuicios} {kpis.totalJuicios === 1 ? "proceso en registro" : "procesos en registro"}
            </span>
          </div>
        </div>

        {/* Tarjeta 2: En Tramitación / Pendientes */}
        <div className="bg-amber-50/60 border border-amber-200 rounded-xl p-4 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs font-bold text-amber-800 uppercase tracking-wider">
            <span>Monto En Tramitación</span>
            <Clock className="h-4 w-4 text-amber-600" />
          </div>
          <div className="mt-3">
            <span className="text-2xl font-extrabold text-amber-900 block font-mono">
              {formatCLP(kpis.cuantiaEnTramitacion)}
            </span>
            <span className="text-xs font-semibold text-amber-700 mt-0.5 block">
              {kpis.enTramitacionCount} {kpis.enTramitacionCount === 1 ? "proceso pendiente" : "procesos pendientes"}
            </span>
          </div>
        </div>

        {/* Tarjeta 3: Finalizados / Concluidos */}
        <div className="bg-emerald-50/60 border border-emerald-200 rounded-xl p-4 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs font-bold text-emerald-800 uppercase tracking-wider">
            <span>Monto Concluido</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="mt-3">
            <span className="text-2xl font-extrabold text-emerald-900 block font-mono">
              {formatCLP(kpis.cuantiaConcluida)}
            </span>
            <span className="text-xs font-semibold text-emerald-700 mt-0.5 block">
              {kpis.concluidosCount} {kpis.concluidosCount === 1 ? "proceso concluido" : "procesos concluidos"}
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
          <span>En Tramitación / Pendientes</span>
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
          onClick={() => setActiveTab("FINALIZADOS")}
          className={cn(
            "flex items-center gap-2.5 py-3 px-4 text-xs font-bold border-b-2 transition-all cursor-pointer",
            activeTab === "FINALIZADOS"
              ? "border-emerald-600 text-emerald-700 bg-emerald-50/30"
              : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
          )}
        >
          <CheckCircle2 className="h-4 w-4" />
          <span>Finalizados / Concluidos / Pagados</span>
          <span
            className={cn(
              "px-2 py-0.5 rounded-full text-[11px] font-mono font-bold",
              activeTab === "FINALIZADOS"
                ? "bg-emerald-600 text-white"
                : "bg-slate-100 text-slate-600"
            )}
          >
            {finalizadosCount}
          </span>
        </button>
      </div>

      {/* 4. Barra de Filtros y Búsqueda en Fondo Blanco */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1 min-w-[260px]">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por RIT-RUC, Trabajador, Materia o Resultado..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E05A10]/20 focus:border-[#E05A10] bg-white text-slate-900 placeholder-slate-400"
            />
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
              <Filter className="h-3.5 w-3.5 text-slate-400" />
              <span>Materia:</span>
            </div>
            <select
              value={materiaFilter}
              onChange={(e) => setMateriaFilter(e.target.value)}
              className="px-2.5 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E05A10]/20 focus:border-[#E05A10] bg-white font-medium text-slate-700"
            >
              <option value="TODAS">Todas las materias</option>
              {uniqueMaterias.map((mat) => (
                <option key={mat} value={mat}>
                  {mat}
                </option>
              ))}
            </select>

            {(searchQuery || materiaFilter !== "TODAS") && (
              <button
                onClick={() => {
                  setSearchQuery("");
                  setMateriaFilter("TODAS");
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

      {/* 5. Tabla de Causas / Juicios (7 Columnas de Alta Densidad y Alto Contraste) */}
      <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-[850px] lg:min-w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/90 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[11px]">
                <th className="py-3 px-3.5 whitespace-nowrap">RIT - RUC</th>
                <th className="py-3 px-3.5">NOMBRE TRABAJADOR</th>
                <th className="py-3 px-3.5">MATERIA</th>
                <th className="py-3 px-3.5 text-right whitespace-nowrap">CUANTÍA DEMANDADA</th>
                <th className="py-3 px-3.5">ÚLTIMA AUDIENCIA - RESULTADO</th>
                <th className="py-3 px-3.5 text-center whitespace-nowrap">ESTADO</th>
                <th className="py-3 px-3.5 text-center whitespace-nowrap">ACCIONES</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Gavel className="h-8 w-8 text-slate-300 stroke-1" />
                      <p className="text-xs font-medium">
                        No se encontraron registros de juicios para los filtros seleccionados.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                paginateArray(filteredItems, currentPage, GLOBAL_PAGE_SIZE).map((item) => {
                  const isConcluido = item.estado === "CONCLUIDO" || item.estado === "PAGADA";
                  const montoClp = item.cuantia_clp !== undefined ? item.cuantia_clp : item.cuantia;
                  const audList = item.audiencias || [];
                  const ultAud =
                    audList.length > 0
                      ? [...audList].sort((a, b) => {
                          const d = b.fecha_audiencia.localeCompare(a.fecha_audiencia);
                          if (d !== 0) return d;
                          return (b.numero_audiencia || 0) - (a.numero_audiencia || 0);
                        })[0]
                      : item.ultima_audiencia;
                  const totalAudiencias = audList.length;

                  return (
                    <tr
                      key={item.id}
                      className={cn(
                        "hover:bg-slate-50/70 transition-colors",
                        isConcluido ? "bg-emerald-50/10" : "bg-white"
                      )}
                    >
                      {/* 1. RIT - RUC */}
                      <td className="py-3 px-3.5 font-mono font-bold text-slate-900 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-800">
                          {item.rit_ruc}
                        </span>
                      </td>

                      {/* 2. NOMBRE TRABAJADOR */}
                      <td className="py-3 px-3.5 font-bold text-slate-900">
                        <div className="truncate max-w-[210px]" title={item.nombre_trabajador}>
                          {item.nombre_trabajador}
                        </div>
                      </td>

                      {/* 3. MATERIA */}
                      <td className="py-3 px-3.5 text-slate-700">
                        <span className="truncate max-w-[200px] inline-block font-medium" title={item.materia}>
                          {item.materia}
                        </span>
                      </td>

                      {/* 4. CUANTÍA DEMANDADA ($ CLP) */}
                      <td className="py-3 px-3.5 text-right font-mono font-bold text-slate-900 whitespace-nowrap">
                        {formatCLP(montoClp)}
                      </td>

                      {/* 5. ÚLTIMA AUDIENCIA - RESULTADO (2 Líneas) */}
                      <td className="py-3 px-3.5 max-w-[280px]">
                        {ultAud ? (
                          <div className="space-y-0.5">
                            {/* Línea 1: N° y Fecha */}
                            <div className="flex items-center gap-1.5 font-semibold text-slate-800">
                              <span className="px-1.5 py-0.5 rounded bg-slate-800 text-amber-400 text-[10px] font-mono font-bold">
                                {ultAud.numero_audiencia}° Aud.
                              </span>
                              <span className="font-mono text-[11px] text-slate-700">
                                {formatDateCL(ultAud.fecha_audiencia)}
                              </span>
                              {ultAud.fecha_audiencia > new Date().toISOString().slice(0, 10) && (
                                <span className="px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-[9px] font-medium leading-none whitespace-nowrap">
                                  Programada / Por celebrar
                                </span>
                              )}
                              {totalAudiencias > 1 && (
                                <span className="text-[10px] text-slate-400 font-normal">
                                  ({totalAudiencias} reg.)
                                </span>
                              )}
                            </div>
                            {/* Línea 2: Resultado / Dictamen (line-clamp-2) */}
                            <div
                              className="text-xs text-slate-500 line-clamp-2 leading-relaxed"
                              title={ultAud.resultado_dictamen || "Audiencia programada / Pendiente de celebración"}
                            >
                              {ultAud.resultado_dictamen || "Audiencia programada / Pendiente de celebración"}
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic text-xs">
                            Sin audiencias registradas
                          </span>
                        )}
                      </td>

                      {/* 6. ESTADO */}
                      <td className="py-3 px-3.5 text-center whitespace-nowrap">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border",
                            isConcluido
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : "bg-amber-50 text-amber-700 border-amber-200"
                          )}
                        >
                          <span
                            className={cn(
                              "h-1.5 w-1.5 rounded-full",
                              isConcluido ? "bg-emerald-500" : "bg-amber-500"
                            )}
                          />
                          {item.estado === "PENDIENTE" ? "EN TRAMITACIÓN" : "CONCLUIDO"}
                        </span>
                      </td>

                      {/* 7. ACCIONES: Bitácora de Audiencias + Editar Causa */}
                      <td className="py-3 px-3.5 text-center whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          {/* Botón Bitácora de Audiencias */}
                          <button
                            onClick={() => handleOpenBitacoraModal(item)}
                            className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition-colors"
                            title="Bitácora de Audiencias (Historial)"
                          >
                            <History className="h-4 w-4" />
                          </button>

                          {/* Botón Editar Causa */}
                          {canManage && (
                            <button
                              onClick={() => handleOpenEditModal(item)}
                              className="p-1.5 rounded-md hover:bg-orange-50 text-slate-500 hover:text-[#E05A10] transition-colors"
                              title="Editar Causa"
                            >
                              <Pencil className="h-4 w-4" />
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

      {/* 6. MODAL 1: EDITAR / CREAR CAUSA + BITÁCORA CORRELATIVA (Estilo Claro Ejecutivo) */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-[95vw] sm:w-full max-w-2xl rounded-xl border border-slate-200 bg-white shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 bg-slate-50">
              <div className="flex items-center gap-2">
                <Gavel className="h-4 w-4 text-[#E05A10]" />
                <h2 className="text-sm font-bold text-slate-900">
                  {editingItem ? `Editar Causa ${editingItem.rit_ruc}` : "Nuevo Juicio"}
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
            <form onSubmit={handleSubmitForm} className="p-5 space-y-4 overflow-y-auto">
              {formError && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Sección A: Datos Principales de la Causa */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* RIT / RUC */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    RIT - RUC Causa *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.rit_ruc}
                    onChange={(e) =>
                      setFormData({ ...formData, rit_ruc: e.target.value })
                    }
                    placeholder="Ej. O-1420-2026"
                    className="w-full px-3 py-1.5 text-xs rounded-md bg-white border border-slate-300 text-slate-900 placeholder-slate-400 font-mono focus:outline-none focus:ring-2 focus:ring-[#E05A10]/20 focus:border-[#E05A10]"
                  />
                </div>

                {/* Nombre Trabajador */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Nombre Trabajador / Demandante *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.nombre_trabajador}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        nombre_trabajador: e.target.value,
                      })
                    }
                    placeholder="Ej. Cristián Valenzuela Morales"
                    className="w-full px-3 py-1.5 text-xs rounded-md bg-white border border-slate-300 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#E05A10]/20 focus:border-[#E05A10]"
                  />
                </div>

                {/* Materia */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Materia de la Demanda *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.materia}
                    onChange={(e) =>
                      setFormData({ ...formData, materia: e.target.value })
                    }
                    placeholder="Ej. Despido Injustificado..."
                    list="materias-modal-list"
                    className="w-full px-3 py-1.5 text-xs rounded-md bg-white border border-slate-300 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#E05A10]/20 focus:border-[#E05A10]"
                  />
                  <datalist id="materias-modal-list">
                    <option value="Despido Injustificado" />
                    <option value="Despido Injustificado y Cobro de Prestaciones" />
                    <option value="Tutela Laboral con ocasión del despido" />
                    <option value="Cobro de Prestaciones e Indemnizaciones" />
                    <option value="Accidente del Trabajo" />
                    <option value="Nulidad del Despido (Ley Bustos)" />
                  </datalist>
                </div>

                {/* Cuantía Demandada (CLP) con Prefijo y Formato de Miles */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Cuantía Demandada ($ CLP) *
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-mono text-xs font-bold">
                      $
                    </span>
                    <input
                      type="text"
                      required
                      value={formData.cuantiaRaw}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          cuantiaRaw: formatNumberInput(e.target.value),
                        })
                      }
                      placeholder="14.850.000"
                      className="w-full pl-7 pr-3 py-1.5 text-xs rounded-md bg-white border border-slate-300 text-slate-900 placeholder-slate-400 font-mono font-bold focus:outline-none focus:ring-2 focus:ring-[#E05A10]/20 focus:border-[#E05A10]"
                    />
                  </div>
                </div>

                {/* Estado Procesal */}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Estado Procesal *
                  </label>
                  <select
                    value={formData.estado}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        estado: e.target.value as EstadoLitigioJuicio,
                      })
                    }
                    className="w-full px-3 py-1.5 text-xs rounded-md bg-white border border-slate-300 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#E05A10]/20 focus:border-[#E05A10]"
                  >
                    <option value="PENDIENTE">🟡 EN TRAMITACIÓN / PENDIENTE</option>
                    <option value="CONCLUIDO">🟢 CONCLUIDO / SENTENCIA FIRME</option>
                    <option value="PAGADA">🟢 PAGADA / ACUERDO CUMPLIDO</option>
                  </select>
                </div>
              </div>

              {/* Sección B: Bitácora Correlativa de Audiencias */}
              <div className="mt-4 pt-3 border-t border-slate-200">
                <div className="flex items-center justify-between mb-2.5">
                  <div className="flex items-center gap-1.5">
                    <CalendarClock className="h-4 w-4 text-[#E05A10]" />
                    <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                      Bitácora Correlativa de Audiencias
                    </h3>
                  </div>
                  {!isAddingAudienceInForm && (
                    <button
                      type="button"
                      onClick={() => setIsAddingAudienceInForm(true)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded bg-orange-50 hover:bg-orange-100 text-[#E05A10] border border-orange-200 transition-all cursor-pointer"
                    >
                      <Plus className="h-3 w-3" />
                      <span>+ Registrar Nueva Audiencia</span>
                    </button>
                  )}
                </div>

                {/* Formulario Inline para Nueva Audiencia */}
                {isAddingAudienceInForm && (
                  <div className="p-3 rounded-lg border border-orange-200 bg-orange-50/40 mb-3 space-y-2.5 animate-in fade-in duration-150">
                    <div className="flex items-center justify-between text-xs font-bold text-[#E05A10]">
                      <span>Registrar {formData.audiencias.length + 1}° Audiencia</span>
                      <button
                        type="button"
                        onClick={() => setIsAddingAudienceInForm(false)}
                        className="text-slate-400 hover:text-slate-700"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <div>
                        <label className="block text-[11px] font-medium text-slate-700 mb-0.5">
                          Fecha de Audiencia *
                        </label>
                        <input
                          type="date"
                          value={newAudienceFecha}
                          onChange={(e) => setNewAudienceFecha(e.target.value)}
                          className="w-full px-2.5 py-1 text-xs rounded bg-white border border-slate-300 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#E05A10]/20 focus:border-[#E05A10]"
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <label className="block text-[11px] font-medium text-slate-700 mb-0.5">
                          Resultado / Sentencia / Dictamen <span className="text-slate-400 font-normal">(Opcional si es futura)</span>
                        </label>
                        <input
                          type="text"
                          value={newAudienceResultado}
                          onChange={(e) => setNewAudienceResultado(e.target.value)}
                          placeholder="Ej. Por celebrar, o detalle si ya concluyó..."
                          className="w-full px-2.5 py-1 text-xs rounded bg-white border border-slate-300 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#E05A10]/20 focus:border-[#E05A10]"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setIsAddingAudienceInForm(false)}
                        className="px-2.5 py-1 text-xs text-slate-500 hover:text-slate-800"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={handleAddAudienceInForm}
                        className="px-3 py-1 text-xs font-semibold rounded bg-[#E05A10] hover:bg-[#c94e0d] text-white shadow-xs cursor-pointer"
                      >
                        Añadir a la Bitácora
                      </button>
                    </div>
                  </div>
                )}

                {/* Lista / Tabla de Audiencias Registradas */}
                {formData.audiencias.length === 0 ? (
                  <div className="p-3 text-center rounded-lg border border-dashed border-slate-200 text-xs text-slate-500 bg-slate-50/50">
                    No hay audiencias registradas aún en esta causa.
                  </div>
                ) : (
                  <div className="rounded-lg border border-slate-200 bg-white overflow-hidden shadow-xs">
                    <table className="min-w-[750px] lg:min-w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold">
                          <th className="px-3 py-2 w-28 whitespace-nowrap">CORRELATIVO</th>
                          <th className="px-3 py-2 w-28 whitespace-nowrap">FECHA</th>
                          <th className="px-3 py-2">RESULTADO / DICTAMEN</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {formData.audiencias.map((aud, index) => (
                          <tr key={index} className="hover:bg-slate-50">
                            <td className="px-3 py-2 font-mono font-bold text-[#E05A10] whitespace-nowrap">
                              {aud.numero_audiencia}° Audiencia
                            </td>
                            <td className="px-3 py-2 font-mono text-slate-700 whitespace-nowrap">
                              {formatDateCL(aud.fecha_audiencia)}
                            </td>
                            <td className="px-3 py-2 text-slate-700 font-medium">
                              {aud.resultado_dictamen}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Observaciones */}
              <div className="pt-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Observaciones / Estrategia Legal
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
                  placeholder="Abogado patrocinante, tribunal, detalles de la contestación..."
                  className="w-full px-3 py-1.5 text-xs rounded-md bg-white border border-slate-300 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#E05A10]/20 focus:border-[#E05A10]"
                />
              </div>

              {/* Botones de Guardar */}
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
                  <span>{editingItem ? "Guardar Cambios" : "Crear Causa"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 7. MODAL 2: BITÁCORA DEDICADA DE AUDIENCIAS (Historial y Registro Rápido) */}
      {isBitacoraModalOpen && bitacoraJuicio && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-[95vw] sm:w-full max-w-2xl rounded-xl border border-slate-200 bg-white shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 bg-slate-50">
              <div className="flex items-center gap-2.5">
                <History className="h-4 w-4 text-[#E05A10]" />
                <div>
                  <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <span>Bitácora de Audiencias</span>
                    <span className="font-mono text-[#E05A10] text-xs px-2 py-0.5 rounded bg-orange-50 border border-orange-200">
                      {bitacoraJuicio.rit_ruc}
                    </span>
                  </h2>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {bitacoraJuicio.nombre_trabajador} · {bitacoraJuicio.materia}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsBitacoraModalOpen(false)}
                type="button"
                className="text-slate-400 hover:text-slate-700 p-1 rounded-md transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 space-y-4 overflow-y-auto">
              {bitacoraError && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>{bitacoraError}</span>
                </div>
              )}

              {/* Encabezado con Botón Nueva Audiencia */}
              <div className="flex items-center justify-between pb-1">
                <span className="text-xs font-semibold text-slate-700">
                  Historial Cronológico de Audiencias ({(bitacoraJuicio.audiencias || []).length})
                </span>
                {!isAddingAudienceInBitacora && canManage && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingAudienceId(null);
                      setIsAddingAudienceInBitacora(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#E05A10] hover:bg-[#c94e0d] text-white shadow-xs transition-all cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>+ Registrar Nueva Audiencia</span>
                  </button>
                )}
              </div>

              {/* Formulario para Registrar Nueva Audiencia en Bitácora */}
              {isAddingAudienceInBitacora && (
                <form
                  onSubmit={handleSaveAudienceInBitacora}
                  className="p-3.5 rounded-xl border border-orange-200 bg-orange-50/50 space-y-3 animate-in fade-in duration-150"
                >
                  <div className="flex items-center justify-between text-xs font-bold text-[#E05A10]">
                    <span>
                      Registrar {((bitacoraJuicio.audiencias || []).length + 1)}° Audiencia
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsAddingAudienceInBitacora(false)}
                      className="text-slate-400 hover:text-slate-700"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                        Fecha Audiencia *
                      </label>
                      <input
                        type="date"
                        required
                        value={bitacoraNewFecha}
                        onChange={(e) => setBitacoraNewFecha(e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs rounded bg-white border border-slate-300 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#E05A10]/20 focus:border-[#E05A10]"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                        Resultado / Sentencia / Dictamen <span className="text-slate-400 font-normal">(Opcional si es futura)</span>
                      </label>
                      <textarea
                        rows={2}
                        value={bitacoraNewResultado}
                        onChange={(e) => setBitacoraNewResultado(e.target.value)}
                        placeholder="Deje en blanco si la audiencia aún no se celebra, o ingrese el resultado obtenido..."
                        className="w-full px-2.5 py-1.5 text-xs rounded bg-white border border-slate-300 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#E05A10]/20 focus:border-[#E05A10]"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-1 border-t border-orange-200">
                    <button
                      type="button"
                      onClick={() => setIsAddingAudienceInBitacora(false)}
                      className="px-3 py-1 text-xs text-slate-600 hover:text-slate-900"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={bitacoraSubmitting}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1 text-xs font-semibold rounded bg-[#E05A10] hover:bg-[#c94e0d] text-white shadow-xs disabled:opacity-50 cursor-pointer"
                    >
                      {bitacoraSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      <span>Guardar Audiencia</span>
                    </button>
                  </div>
                </form>
              )}

              {/* Lista Cronológica / Timeline */}
              {(!bitacoraJuicio.audiencias || bitacoraJuicio.audiencias.length === 0) ? (
                <div className="p-8 text-center rounded-xl border border-dashed border-slate-200 text-xs text-slate-500 bg-slate-50/50">
                  <CalendarClock className="h-8 w-8 text-slate-400 mx-auto mb-2 stroke-1" />
                  <p>Esta causa aún no posee audiencias registradas.</p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Haga clic en &ldquo;+ Registrar Nueva Audiencia&rdquo; para iniciar la bitácora.
                  </p>
                </div>
              ) : (
                <div className="space-y-3 relative before:absolute before:top-2 before:bottom-2 before:left-3.5 before:w-0.5 before:bg-slate-200">
                  {bitacoraJuicio.audiencias.map((aud, index) => (
                    <div
                      key={aud.id || index}
                      className="relative pl-8 group"
                    >
                      {/* Nodo / Bullet */}
                      <div className="absolute left-1.5 top-2.5 -translate-x-1/2 w-4 h-4 rounded-full border-2 border-white bg-[#E05A10] shadow-xs" />

                      <div className="p-3.5 rounded-xl border border-slate-200 bg-white group-hover:border-slate-300 transition-colors shadow-xs">
                        {editingAudienceId === aud.id ? (
                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              handleSaveEditAudience(aud);
                            }}
                            className="space-y-3"
                          >
                            <div className="flex items-center justify-between text-xs font-bold text-[#E05A10] pb-1 border-b border-orange-100">
                              <span>Editar {aud.numero_audiencia}° Audiencia</span>
                              <button
                                type="button"
                                onClick={handleCancelEditAudience}
                                className="text-slate-400 hover:text-slate-700 cursor-pointer"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                              <div>
                                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                                  Fecha Audiencia *
                                </label>
                                <input
                                  type="date"
                                  required
                                  value={editAudienceFecha}
                                  onChange={(e) => setEditAudienceFecha(e.target.value)}
                                  className="w-full px-2.5 py-1.5 text-xs rounded bg-white border border-slate-300 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#E05A10]/20 focus:border-[#E05A10]"
                                />
                              </div>

                              <div className="sm:col-span-2">
                                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                                  Resultado / Sentencia / Dictamen{" "}
                                  <span className="text-slate-400 font-normal">
                                    (Opcional si es futura)
                                  </span>
                                </label>
                                <textarea
                                  rows={2}
                                  value={editAudienceResultado}
                                  onChange={(e) => setEditAudienceResultado(e.target.value)}
                                  placeholder="Deje en blanco si aún no se celebra, o ingrese el resultado..."
                                  className="w-full px-2.5 py-1.5 text-xs rounded bg-white border border-slate-300 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#E05A10]/20 focus:border-[#E05A10]"
                                />
                              </div>
                            </div>

                            <div className="flex justify-end gap-2 pt-1 border-t border-slate-100">
                              <button
                                type="button"
                                onClick={handleCancelEditAudience}
                                className="px-2.5 py-1 text-xs text-slate-600 hover:text-slate-900 cursor-pointer"
                              >
                                Cancelar
                              </button>
                              <button
                                type="submit"
                                disabled={bitacoraSubmitting}
                                className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded bg-[#E05A10] hover:bg-[#c94e0d] text-white shadow-xs disabled:opacity-50 cursor-pointer"
                              >
                                {bitacoraSubmitting && <Loader2 className="h-3 w-3 animate-spin" />}
                                <span>Guardar Cambios</span>
                              </button>
                            </div>
                          </form>
                        ) : (
                          <>
                            <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-bold text-xs text-[#E05A10]">
                                  {aud.numero_audiencia}° Audiencia
                                </span>
                                <span className="text-slate-300">·</span>
                                <span className="font-mono text-xs text-slate-700 font-semibold">
                                  {formatDateCL(aud.fecha_audiencia)}
                                </span>
                                {aud.fecha_audiencia > new Date().toISOString().slice(0, 10) && (
                                  <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-medium leading-none">
                                    Programada / Por celebrar
                                  </span>
                                )}
                              </div>

                              {canManage && (
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => handleStartEditAudience(aud)}
                                    title="Editar audiencia"
                                    className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteAudience(aud)}
                                    title="Eliminar audiencia"
                                    className="p-1 rounded text-red-400 hover:text-red-700 hover:bg-red-50 transition-colors cursor-pointer"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              )}
                            </div>

                            <p className="text-xs text-slate-600 leading-relaxed font-medium">
                              {aud.resultado_dictamen || "Audiencia programada / Pendiente de celebración"}
                            </p>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex justify-end">
              <button
                type="button"
                onClick={() => setIsBitacoraModalOpen(false)}
                className="px-4 py-1.5 text-xs font-semibold rounded-md bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 transition-colors cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
