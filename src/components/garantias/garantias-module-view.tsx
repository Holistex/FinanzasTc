"use client";

import React, { useState, useTransition, useMemo, useEffect } from "react";
import {
  Landmark,
  Shield,
  Plus,
  Search,
  Pencil,
  Calendar,
  Building2,
  Layers,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  FileText,
  DollarSign,
  Filter,
  X,
  Loader2,
  History,
  RotateCw,
  ChevronRight,
  Info,
  MessageSquarePlus,
  ClipboardList,
  User,
} from "lucide-react";
import {
  GarantiaItemWithRelations,
  GarantiasKpiSummary,
  MantenedorMandante,
  MantenedorCompania,
  EstadoGarantia,
  MonedaGarantia,
  HistorialRenovacionGarantia,
  GestionGarantia,
  EstadoGestionGarantia,
} from "@/types/database.types";
import {
  GarantiasFilterParams,
  getGestionesGarantiaAction,
  registrarGestionGarantiaAction,
} from "@/actions/garantias.actions";
import { calculateEstadoGarantia } from "@/lib/garantias-utils";
import { cn, formatDateCL, formatCLP, formatRutDisplay } from "@/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { QUERY_KEYS } from "@/lib/prefetch-helpers";

type GarantiasTab = "VIGENTES" | "VENCIDAS";

export const ESTADOS_GESTION_GARANTIA: EstadoGestionGarantia[] = [
  "En trámite de renovación",
  "Evaluación con créditos / finanzas",
  "En negociación con ejecutivos / banco",
  "Cotizando con nueva entidad",
  "Solicitud de devolución / finiquito",
  "Otra gestión",
];

function formatDateTimeCL(isoStr: string | null | undefined): string {
  if (!isoStr) return "-";
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return formatDateCL(isoStr);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    return `${dd}-${mm}-${yyyy} ${hh}:${min}`;
  } catch {
    return formatDateCL(isoStr);
  }
}

function getGestionBadgeStyle(estado: string): string {
  switch (estado) {
    case "En trámite de renovación":
      return "bg-blue-50 text-blue-800 border-blue-200 hover:bg-blue-100/80";
    case "Evaluación con créditos / finanzas":
      return "bg-amber-50 text-amber-900 border-amber-200 hover:bg-amber-100/80";
    case "En negociación con ejecutivos / banco":
      return "bg-indigo-50 text-indigo-800 border-indigo-200 hover:bg-indigo-100/80";
    case "Cotizando con nueva entidad":
      return "bg-purple-50 text-purple-800 border-purple-200 hover:bg-purple-100/80";
    case "Solicitud de devolución / finiquito":
      return "bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100/80";
    default:
      return "bg-orange-50 text-[#E05A10] border-orange-200 hover:bg-orange-100/80";
  }
}

interface GarantiasModuleViewProps {
  tipo: "BOLETA" | "POLIZA";
  initialItems: GarantiaItemWithRelations[];
  initialKpis: GarantiasKpiSummary;
  mandantes: MantenedorMandante[];
  companias: MantenedorCompania[];
  onFetchAction: (
    filters: GarantiasFilterParams
  ) => Promise<{ items: GarantiaItemWithRelations[]; kpis: GarantiasKpiSummary }>;
  onUpsertAction: (data: any) => Promise<any>;
  onRenovarAction?: (data: {
    tipo: "BOLETA" | "POLIZA";
    id: string;
    nuevaFechaVencimiento: string;
    observaciones?: string;
  }) => Promise<any>;
  onGetHistorialAction?: (
    tipo: "BOLETA" | "POLIZA",
    documentoId: string
  ) => Promise<HistorialRenovacionGarantia[]>;
  canManage?: boolean;
}

export function formatMonedaGarantia(monto: number, moneda: MonedaGarantia = "UF"): string {
  if (moneda === "CLP") return formatCLP(monto);
  if (moneda === "UF") {
    return `UF ${Number(monto || 0).toLocaleString("es-CL", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }
  if (moneda === "USD") {
    return `US$ ${Number(monto || 0).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }
  return `${monto} ${moneda}`;
}

export function GarantiasModuleView({
  tipo,
  initialItems,
  initialKpis,
  mandantes,
  companias,
  onFetchAction,
  onUpsertAction,
  onRenovarAction,
  onGetHistorialAction,
  canManage = true,
}: GarantiasModuleViewProps) {
  const isBoleta = tipo === "BOLETA";
  const entityTitle = isBoleta ? "Boletas de Garantía" : "Pólizas de Garantía";
  const singleTitle = isBoleta ? "Boleta de Garantía" : "Póliza de Garantía";
  const emisorLabel = isBoleta ? "Banco Emisor" : "Compañía Aseguradora";

  const queryClient = useQueryClient();
  const queryKey = isBoleta ? QUERY_KEYS.garantiasBoletas : QUERY_KEYS.garantiasPolizas;

  // Caché dinámico de TanStack Query para render instantáneo (<1ms) y revalidación en segundo plano
  const { data: queryData } = useQuery({
    queryKey,
    queryFn: () => onFetchAction({ moneda: "TODAS" }),
    initialData: { items: initialItems, kpis: initialKpis },
    staleTime: 5 * 60 * 1000,
  });

  const [localData, setLocalData] = useState<{
    items: GarantiaItemWithRelations[];
    kpis: GarantiasKpiSummary;
  }>({ items: initialItems, kpis: initialKpis });

  const items = queryData?.items ?? localData.items;
  const kpis = queryData?.kpis ?? localData.kpis;

  // Tabs state: "VIGENTES" (Vigentes / Por Renovar) vs "VENCIDAS" (No Renovadas / Vencidas)
  const [activeTab, setActiveTab] = useState<GarantiasTab>("VIGENTES");

  // Filters state
  const [searchQuery, setSearchQuery] = useState("");
  const [estadoFilter, setEstadoFilter] = useState<EstadoGarantia | "TODOS">("TODOS");
  const [mandanteFilter, setMandanteFilter] = useState<string>("TODOS");
  const [companiaFilter, setCompaniaFilter] = useState<string>("TODOS");

  const [isPending, startTransition] = useTransition();

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<GarantiaItemWithRelations | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form Fields
  const [formData, setFormData] = useState({
    nro_folio: "",
    on_proyecto: "",
    mandante_id: "",
    compania_id: "",
    motivo: "",
    monto: "",
    moneda: "UF" as MonedaGarantia,
    fecha_emision: new Date().toISOString().slice(0, 10),
    fecha_vencimiento: "",
    obra: "",
    proyecto: "",
    contrafianza: "",
    contrafianza_compania: "",
    nueva_fecha_vencimiento: "",
    observaciones_renovacion: "",
  });

  // Renewal History inside modal
  const [historialRenovaciones, setHistorialRenovaciones] = useState<HistorialRenovacionGarantia[]>([]);
  const [loadingHistorial, setLoadingHistorial] = useState(false);
  const [isRenovando, setIsRenovando] = useState(false);

  // Bitácora de Gestiones Modal State
  const [isGestionesModalOpen, setIsGestionesModalOpen] = useState(false);
  const [selectedDocForGestiones, setSelectedDocForGestiones] = useState<GarantiaItemWithRelations | null>(null);
  const [gestionesList, setGestionesList] = useState<GestionGarantia[]>([]);
  const [loadingGestiones, setLoadingGestiones] = useState(false);
  const [isSavingGestion, setIsSavingGestion] = useState(false);
  const [gestionFormError, setGestionFormError] = useState<string | null>(null);
  const [gestionForm, setGestionForm] = useState<{
    estado_gestion: EstadoGestionGarantia;
    observacion: string;
    fecha_proximo_seguimiento: string;
  }>({
    estado_gestion: "En trámite de renovación",
    observacion: "",
    fecha_proximo_seguimiento: "",
  });

  const openGestionesModal = async (item: GarantiaItemWithRelations) => {
    setSelectedDocForGestiones(item);
    setGestionesList(item.gestiones || []);
    setGestionForm({
      estado_gestion: "En trámite de renovación",
      observacion: "",
      fecha_proximo_seguimiento: "",
    });
    setGestionFormError(null);
    setIsGestionesModalOpen(true);

    setLoadingGestiones(true);
    try {
      const freshGestiones = await getGestionesGarantiaAction(tipo, item.id);
      setGestionesList(freshGestiones);
    } catch {
      // Keep cached gestiones if fetch fails
    } finally {
      setLoadingGestiones(false);
    }
  };

  const handleSaveNuevaGestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDocForGestiones) return;
    setGestionFormError(null);

    if (!gestionForm.observacion.trim()) {
      setGestionFormError("La descripción / detalle de la gestión es obligatoria.");
      return;
    }

    setIsSavingGestion(true);
    try {
      const saved = await registrarGestionGarantiaAction({
        tipo_documento: tipo,
        documento_id: selectedDocForGestiones.id,
        estado_gestion: gestionForm.estado_gestion,
        observacion: gestionForm.observacion.trim(),
        fecha_proximo_seguimiento: gestionForm.fecha_proximo_seguimiento || null,
      });

      const updatedList = [saved, ...gestionesList];
      setGestionesList(updatedList);
      setGestionForm((prev) => ({
        ...prev,
        observacion: "",
        fecha_proximo_seguimiento: "",
      }));

      // Optimistic update on local/query cache so the badge in the table updates immediately
      const updateItemsFn = (prevItems: GarantiaItemWithRelations[]) =>
        prevItems.map((it) =>
          it.id === selectedDocForGestiones.id
            ? {
                ...it,
                gestiones_count: updatedList.length,
                ultima_gestion_estado: saved.estado_gestion,
                ultima_gestion_fecha: saved.created_at,
                ultima_gestion_seguimiento: saved.fecha_proximo_seguimiento || null,
                gestiones: updatedList,
              }
            : it
        );

      setLocalData((prev) => ({
        ...prev,
        items: updateItemsFn(prev.items),
      }));
      if (queryData) {
        queryClient.setQueryData(queryKey, {
          ...queryData,
          items: updateItemsFn(queryData.items),
        });
      }

      triggerRefresh();
    } catch (err: any) {
      setGestionFormError(err.message || "Error al guardar la gestión.");
    } finally {
      setIsSavingGestion(false);
    }
  };

  // Common suggestions for motivo
  const MOTIVO_SUGGESTIONS = [
    "Fiel cumplimiento de contrato",
    "Seriedad de la oferta",
    "Correcta ejecución de obra",
    "Anticipo financiero",
    "Canje de retenciones de estados de pago",
    "Garantía laboral y previsional",
  ];

  const triggerRefresh = (updatedFilters?: Partial<GarantiasFilterParams>) => {
    startTransition(async () => {
      const filtersToUse: GarantiasFilterParams = {
        query: updatedFilters?.query !== undefined ? updatedFilters.query : searchQuery,
        estado: updatedFilters?.estado !== undefined ? updatedFilters.estado : estadoFilter,
        mandanteId: updatedFilters?.mandanteId !== undefined ? updatedFilters.mandanteId : mandanteFilter,
        companiaId: updatedFilters?.companiaId !== undefined ? updatedFilters.companiaId : companiaFilter,
        moneda: "TODAS",
      };
      const res = await onFetchAction(filtersToUse);
      queryClient.setQueryData(queryKey, res);
      setLocalData(res);
    });
  };

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    triggerRefresh({ query: value });
  };

  const handleEstadoFilterChange = (value: EstadoGarantia | "TODOS") => {
    setEstadoFilter(value);
    triggerRefresh({ estado: value });
  };

  const handleMandanteFilterChange = (value: string) => {
    setMandanteFilter(value);
    triggerRefresh({ mandanteId: value });
  };

  const handleCompaniaFilterChange = (value: string) => {
    setCompaniaFilter(value);
    triggerRefresh({ companiaId: value });
  };

  const resetFilters = () => {
    setSearchQuery("");
    setEstadoFilter("TODOS");
    setMandanteFilter("TODOS");
    setCompaniaFilter("TODOS");
    triggerRefresh({
      query: "",
      estado: "TODOS",
      mandanteId: "TODOS",
      companiaId: "TODOS",
    });
  };

  // Open modal for create
  const openCreateModal = () => {
    setEditingItem(null);
    setHistorialRenovaciones([]);
    setFormData({
      nro_folio: "",
      on_proyecto: "",
      mandante_id: mandantes[0]?.id || "",
      compania_id: companias[0]?.id || "",
      motivo: "Fiel cumplimiento de contrato",
      monto: "",
      moneda: "UF",
      fecha_emision: new Date().toISOString().slice(0, 10),
      fecha_vencimiento: "",
      obra: "",
      proyecto: "",
      contrafianza: "",
      contrafianza_compania: "",
      nueva_fecha_vencimiento: "",
      observaciones_renovacion: "",
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  // Open modal for edit / renewal
  const openEditModal = async (item: GarantiaItemWithRelations) => {
    setEditingItem(item);
    setFormData({
      nro_folio: item.nro_folio,
      on_proyecto: item.on_proyecto || "",
      mandante_id: item.mandante_id,
      compania_id: item.compania_id,
      motivo: item.motivo,
      monto: String(item.monto_uf ?? item.monto),
      moneda: "UF",
      fecha_emision: item.fecha_emision,
      fecha_vencimiento: item.fecha_vencimiento,
      obra: item.obra || "",
      proyecto: item.proyecto || "",
      contrafianza: item.contrafianza || "",
      contrafianza_compania: item.contrafianza_compania || "",
      nueva_fecha_vencimiento: "",
      observaciones_renovacion: "",
    });
    setFormError(null);
    setIsModalOpen(true);

    // Fetch renewal history if available
    if (onGetHistorialAction && item.id) {
      setLoadingHistorial(true);
      try {
        const hist = await onGetHistorialAction(tipo, item.id);
        setHistorialRenovaciones(hist || []);
      } catch {
        setHistorialRenovaciones([]);
      } finally {
        setLoadingHistorial(false);
      }
    }
  };

  // Quick date increment calculator
  const addDaysToExpiration = (days: number) => {
    const baseDateStr = formData.fecha_vencimiento || new Date().toISOString().slice(0, 10);
    const [y, m, d] = baseDateStr.split("-").map((v) => parseInt(v, 10));
    const base = new Date(y, m - 1, d);
    base.setDate(base.getDate() + days);

    const yyyy = base.getFullYear();
    const mm = String(base.getMonth() + 1).padStart(2, "0");
    const dd = String(base.getDate()).padStart(2, "0");
    const newDateStr = `${yyyy}-${mm}-${dd}`;

    setFormData((prev) => ({
      ...prev,
      nueva_fecha_vencimiento: newDateStr,
    }));
  };

  // Handle direct renewal action inside modal
  const handleEjecutarRenovacion = async () => {
    if (!editingItem) return;
    if (!formData.nueva_fecha_vencimiento) {
      setFormError("Debe seleccionar una nueva fecha de vencimiento para la renovación.");
      return;
    }
    if (formData.nueva_fecha_vencimiento <= editingItem.fecha_vencimiento) {
      if (
        !confirm(
          "La nueva fecha es anterior o igual a la actual. ¿Deseas aplicar esta fecha de vencimiento igualmente?"
        )
      ) {
        return;
      }
    }

    if (!onRenovarAction) return;

    setIsRenovando(true);
    setFormError(null);
    try {
      await onRenovarAction({
        tipo,
        id: editingItem.id,
        nuevaFechaVencimiento: formData.nueva_fecha_vencimiento,
        observaciones: formData.observaciones_renovacion.trim() || undefined,
      });

      setIsModalOpen(false);
      triggerRefresh();
    } catch (err: any) {
      setFormError(err.message || "Error al procesar la renovación de garantía.");
    } finally {
      setIsRenovando(false);
    }
  };

  // Handle Submit Form (Create / Edit)
  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const numericMonto = parseFloat(formData.monto);
    if (isNaN(numericMonto) || numericMonto < 0) {
      setFormError("Ingrese un monto numérico válido mayor o igual a 0.");
      return;
    }
    if (!formData.nro_folio.trim()) {
      setFormError("El N° Folio es obligatorio.");
      return;
    }
    if (!formData.on_proyecto.trim()) {
      setFormError("El campo ON (Proyecto) es obligatorio.");
      return;
    }
    if (formData.on_proyecto.trim().length !== 3) {
      setFormError("El campo ON (Proyecto) debe componerse exactamente de 3 dígitos numéricos (ej. 740).");
      return;
    }
    if (!formData.mandante_id) {
      setFormError("Debe seleccionar un Mandante.");
      return;
    }
    if (!formData.compania_id) {
      setFormError(`Debe seleccionar una ${emisorLabel}.`);
      return;
    }
    if (!formData.fecha_emision) {
      setFormError("La fecha de emisión es obligatoria.");
      return;
    }
    if (!formData.fecha_vencimiento) {
      setFormError("La fecha de vencimiento es obligatoria.");
      return;
    }

    // If user entered a nueva_fecha_vencimiento in the renewal box while editing,
    // let's apply the renewal action first or save it directly with incremented count
    if (editingItem && formData.nueva_fecha_vencimiento && onRenovarAction) {
      setIsSubmitting(true);
      try {
        await onRenovarAction({
          tipo,
          id: editingItem.id,
          nuevaFechaVencimiento: formData.nueva_fecha_vencimiento,
          observaciones: formData.observaciones_renovacion.trim() || undefined,
        });

        // Also update any modified details
        await onUpsertAction({
          id: editingItem.id,
          nro_folio: formData.nro_folio,
          on_proyecto: formData.on_proyecto.trim() || null,
          mandante_id: formData.mandante_id,
          compania_id: formData.compania_id,
          motivo: formData.motivo,
          monto: numericMonto,
          monto_uf: numericMonto,
          moneda: "UF",
          fecha_emision: formData.fecha_emision,
          fecha_vencimiento: formData.nueva_fecha_vencimiento,
          obra: formData.obra || null,
          proyecto: formData.proyecto || null,
          contrafianza: formData.contrafianza || null,
          contrafianza_compania: formData.contrafianza_compania || null,
        });

        setIsModalOpen(false);
        triggerRefresh();
        return;
      } catch (err: any) {
        setFormError(err.message || "Error al actualizar y renovar el documento.");
        setIsSubmitting(false);
        return;
      }
    }

    setIsSubmitting(true);
    try {
      await onUpsertAction({
        id: editingItem?.id,
        nro_folio: formData.nro_folio,
        on_proyecto: formData.on_proyecto.trim() || null,
        mandante_id: formData.mandante_id,
        compania_id: formData.compania_id,
        motivo: formData.motivo,
        monto: numericMonto,
        monto_uf: numericMonto,
        moneda: "UF",
        fecha_emision: formData.fecha_emision,
        fecha_vencimiento: formData.fecha_vencimiento,
        obra: formData.obra || null,
        proyecto: formData.proyecto || null,
        contrafianza: formData.contrafianza || null,
        contrafianza_compania: formData.contrafianza_compania || null,
        contador_renovaciones: editingItem ? editingItem.contador_renovaciones : 0,
      });

      setIsModalOpen(false);
      triggerRefresh();
    } catch (err: any) {
      setFormError(err.message || "Error al procesar el registro.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filter items by active tab:
  // Tab 1: Vigentes / Por Renovar (VIGENTE or PROXIMA_A_VENCER)
  // Tab 2: No Renovadas / Vencidas (VENCIDA)
  const tabFilteredItems = useMemo(() => {
    if (activeTab === "VIGENTES") {
      return items.filter(
        (item) => item.estado === "VIGENTE" || item.estado === "PROXIMA_A_VENCER"
      );
    } else {
      return items.filter((item) => item.estado === "VENCIDA");
    }
  }, [items, activeTab]);

  const countVigentes = useMemo(
    () => items.filter((i) => i.estado === "VIGENTE" || i.estado === "PROXIMA_A_VENCER").length,
    [items]
  );
  const countVencidas = useMemo(
    () => items.filter((i) => i.estado === "VENCIDA").length,
    [items]
  );

  // Computed status preview in form
  const statusPreview = useMemo(() => {
    const targetDate = formData.nueva_fecha_vencimiento || formData.fecha_vencimiento;
    if (!targetDate) return null;
    return calculateEstadoGarantia(targetDate);
  }, [formData.fecha_vencimiento, formData.nueva_fecha_vencimiento]);

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto select-none">
      {/* 1. Header Principal */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-[#0F172A] text-[#E05A10] flex items-center justify-center shadow-sm">
            {isBoleta ? <Landmark className="h-5 w-5" /> : <Shield className="h-5 w-5" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                {entityTitle}
              </h1>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-100 text-[#E05A10] uppercase">
                {isBoleta ? "Bancarias" : "Seguros"}
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Control integral, bitácora de renovaciones y alertas de vencimiento contractual Tensacon.
            </p>
          </div>
        </div>

        {canManage && (
          <div className="flex items-center gap-2.5">
            <button
              onClick={openCreateModal}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-[#E05A10] text-white text-xs font-semibold hover:bg-[#c94e0d] transition-colors shadow-sm"
            >
              <Plus className="h-4 w-4" />
              Nueva {isBoleta ? "Boleta" : "Póliza"}
            </button>
          </div>
        )}
      </div>

      {/* 2. KPI Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {/* Total Documentos */}
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center justify-between">
            <span>Total Documentos</span>
            <FileText className="h-3.5 w-3.5 text-slate-400" />
          </div>
          <div className="mt-2 text-xl font-extrabold text-slate-900 font-mono">
            {kpis.totalDocumentos}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">En registro activo</div>
        </div>

        {/* Monto Total UF */}
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center justify-between">
            <span>Total Monto UF</span>
            <span className="text-[10px] font-mono font-bold text-blue-600">UF</span>
          </div>
          <div
            className="mt-2 text-lg font-extrabold text-blue-700 font-mono truncate"
            title={`UF ${kpis.totalMontoUf.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          >
            UF {kpis.totalMontoUf.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">Unidades de Fomento</div>
        </div>

        {/* Vigentes */}
        <div className="bg-emerald-50/70 p-3.5 rounded-xl border border-emerald-200/80 shadow-xs">
          <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 flex items-center justify-between">
            <span>Vigentes (&gt;15 d)</span>
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
          </div>
          <div className="mt-2 text-xl font-extrabold text-emerald-900 font-mono">
            {kpis.vigentesCount}
          </div>
          <div className="text-[10px] text-emerald-700 mt-0.5 font-medium">En plazo regular</div>
        </div>

        {/* Próximas a Vencer */}
        <div className="bg-amber-50/80 p-3.5 rounded-xl border border-amber-300 shadow-xs">
          <div className="text-[10px] font-bold uppercase tracking-wider text-amber-800 flex items-center justify-between">
            <span>Por Vencer (1-15 d)</span>
            <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
          </div>
          <div className="mt-2 text-xl font-extrabold text-amber-900 font-mono">
            {kpis.proximasVencerCount}
          </div>
          <div className="text-[10px] text-amber-700 mt-0.5 font-medium">Requiere gestión/prórroga</div>
        </div>

        {/* Vencidas */}
        <div className="bg-rose-50/80 p-3.5 rounded-xl border border-rose-300 shadow-xs">
          <div className="text-[10px] font-bold uppercase tracking-wider text-rose-800 flex items-center justify-between">
            <span>Vencidas (≤ 0 d)</span>
            <XCircle className="h-3.5 w-3.5 text-rose-600" />
          </div>
          <div className="mt-2 text-xl font-extrabold text-rose-900 font-mono">
            {kpis.vencidasCount}
          </div>
          <div className="text-[10px] text-rose-700 mt-0.5 font-medium">Plazo expirado</div>
        </div>
      </div>

      {/* 3. Pestañas de Estado e Historial (IMG 2) */}
      <div className="flex items-center gap-2 border-b border-slate-200">
        <button
          onClick={() => setActiveTab("VIGENTES")}
          className={cn(
            "flex items-center gap-2.5 py-3 px-4 text-xs font-bold border-b-2 transition-all cursor-pointer",
            activeTab === "VIGENTES"
              ? "border-[#E05A10] text-[#E05A10] bg-orange-50/30"
              : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
          )}
        >
          <CheckCircle2 className="h-4 w-4" />
          <span>Vigentes / Por Renovar</span>
          <span
            className={cn(
              "px-2 py-0.5 rounded-full text-[11px] font-mono font-bold",
              activeTab === "VIGENTES"
                ? "bg-[#E05A10] text-white"
                : "bg-slate-100 text-slate-600"
            )}
          >
            {countVigentes}
          </span>
        </button>

        <button
          onClick={() => setActiveTab("VENCIDAS")}
          className={cn(
            "flex items-center gap-2.5 py-3 px-4 text-xs font-bold border-b-2 transition-all cursor-pointer",
            activeTab === "VENCIDAS"
              ? "border-rose-600 text-rose-700 bg-rose-50/30"
              : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
          )}
        >
          <History className="h-4 w-4" />
          <span>No Renovadas / Vencidas</span>
          <span
            className={cn(
              "px-2 py-0.5 rounded-full text-[11px] font-mono font-bold",
              activeTab === "VENCIDAS"
                ? "bg-rose-600 text-white"
                : "bg-slate-100 text-slate-600"
            )}
          >
            {countVencidas}
          </span>
        </button>
      </div>

      {/* 4. Filtros y Barra de Herramientas */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Buscador General */}
          <div className="lg:col-span-2 relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por Folio, ON, Mandante, Motivo, Compañía, Contrafianza..."
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E05A10]/20 focus:border-[#E05A10] bg-white"
            />
          </div>

          {/* Filtro Estado */}
          <div>
            <select
              value={estadoFilter}
              onChange={(e) => handleEstadoFilterChange(e.target.value as any)}
              className="w-full px-2.5 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E05A10]/20 focus:border-[#E05A10] bg-white font-medium text-slate-700"
            >
              <option value="TODOS">Todos los Estados</option>
              <option value="VIGENTE">🟢 Vigente (&gt;15 días)</option>
              <option value="PROXIMA_A_VENCER">🟡 Próxima a vencer (1-15 días)</option>
              <option value="VENCIDA">🔴 Vencida (≤ 0 días)</option>
            </select>
          </div>

          {/* Filtro Mandante */}
          <div>
            <select
              value={mandanteFilter}
              onChange={(e) => handleMandanteFilterChange(e.target.value)}
              className="w-full px-2.5 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E05A10]/20 focus:border-[#E05A10] bg-white font-medium text-slate-700 truncate"
            >
              <option value="TODOS">Todos los Mandantes</option>
              {mandantes.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.razon_social}
                </option>
              ))}
            </select>
          </div>

          {/* Filtro Compañía & Reset */}
          <div className="flex items-center gap-2">
            <select
              value={companiaFilter}
              onChange={(e) => handleCompaniaFilterChange(e.target.value)}
              className="w-full px-2.5 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E05A10]/20 focus:border-[#E05A10] bg-white font-medium text-slate-700 truncate"
            >
              <option value="TODOS">Todas las Entidades Emisoras</option>
              {companias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.razon_social}
                </option>
              ))}
            </select>

            {(searchQuery || estadoFilter !== "TODOS" || mandanteFilter !== "TODOS" || companiaFilter !== "TODOS") && (
              <button
                onClick={resetFilters}
                className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-50 transition-colors"
                title="Limpiar filtros"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {isPending && (
          <div className="flex items-center gap-2 text-xs text-slate-400 pt-1">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-[#E05A10]" />
            <span>Filtrando registros en tiempo real...</span>
          </div>
        )}
      </div>

      {/* 5. Tabla de Garantías (12 Columnas Estrictas) */}
      <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/90 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[11px]">
                <th className="py-3 px-3.5 whitespace-nowrap">N° FOLIO</th>
                <th className="py-3 px-3.5 text-center whitespace-nowrap">ON</th>
                <th className="py-3 px-3.5">MANDANTE</th>
                <th className="py-3 px-3.5">MOTIVO</th>
                <th className="py-3 px-3.5">{isBoleta ? "BANCO EMISOR" : "COMPAÑÍA"}</th>
                <th className="py-3 px-3.5 text-right whitespace-nowrap">MONTO</th>
                <th className="py-3 px-3.5 text-center whitespace-nowrap">EMISIÓN</th>
                <th className="py-3 px-3.5 text-center whitespace-nowrap">VENCIMIENTO</th>
                <th className="py-3 px-3.5">CONTRAFIANZA</th>
                <th className="py-3 px-3.5 text-center whitespace-nowrap">GESTIONES</th>
                <th className="py-3 px-3.5 text-center whitespace-nowrap">ESTADO</th>
                <th className="py-3 px-3.5 text-center whitespace-nowrap">ACCIONES</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tabFilteredItems.length === 0 ? (
                <tr>
                  <td colSpan={12} className="text-center py-12 text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <FileText className="h-8 w-8 text-slate-300 stroke-1" />
                      <p className="text-xs font-medium">
                        {activeTab === "VIGENTES"
                          ? `No hay ${entityTitle.toLowerCase()} vigentes o por renovar.`
                          : `No hay ${entityTitle.toLowerCase()} vencidas / no renovadas en este filtro.`}
                      </p>
                      {activeTab === "VIGENTES" && (
                        <button
                          onClick={openCreateModal}
                          className="mt-1 text-xs text-[#E05A10] font-semibold hover:underline"
                        >
                          Crear nuevo registro
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                tabFilteredItems.map((item) => {
                  const dias = item.dias_restantes ?? 0;
                  const contrafianzaTexto =
                    item.contrafianza_compania || item.contrafianza || null;
                  const gestionesCount =
                    item.gestiones_count ?? item.gestiones?.length ?? 0;
                  const ultimaGestionEstado =
                    item.ultima_gestion_estado ||
                    item.gestiones?.[0]?.estado_gestion ||
                    null;

                  return (
                    <tr
                      key={item.id}
                      className={cn(
                        "hover:bg-slate-50/70 transition-colors",
                        item.estado === "VENCIDA" && "bg-rose-50/20",
                        item.estado === "PROXIMA_A_VENCER" && "bg-amber-50/20"
                      )}
                    >
                      {/* 1. N° FOLIO */}
                      <td className="py-3 px-3.5 font-mono font-bold text-slate-900 whitespace-nowrap">
                        {item.nro_folio}
                      </td>

                      {/* 2. ON (Proyecto) */}
                      <td className="py-3 px-3.5 text-center whitespace-nowrap">
                        {item.on_proyecto ? (
                          <span className="inline-block font-mono text-[11px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-200">
                            ON {item.on_proyecto}
                          </span>
                        ) : (
                          <span className="text-slate-400 font-mono text-[11px] font-medium">-</span>
                        )}
                      </td>

                      {/* 3. MANDANTE */}
                      <td className="py-3 px-3.5 max-w-[200px]">
                        <div
                          className="font-semibold text-slate-900 truncate"
                          title={item.mandante_razon_social}
                        >
                          {item.mandante_razon_social}
                        </div>
                        {item.mandante_rut && (
                          <div className="text-[10px] text-slate-400 font-mono">
                            {formatRutDisplay(item.mandante_rut)}
                          </div>
                        )}
                      </td>

                      {/* 4. MOTIVO (limitado a máximo 2 líneas) */}
                      <td className="py-3 px-3.5 max-w-[220px]">
                        <p
                          className="line-clamp-2 text-slate-700 leading-snug text-xs"
                          title={item.motivo}
                        >
                          {item.motivo}
                        </p>
                      </td>

                      {/* 5. COMPAÑÍA / BANCO EMISOR */}
                      <td className="py-3 px-3.5 max-w-[180px]">
                        <div
                          className="font-medium text-slate-800 truncate"
                          title={item.compania_razon_social}
                        >
                          {item.compania_razon_social}
                        </div>
                      </td>

                      {/* 6. MONTO (única y exclusivamente en UF) */}
                      <td className="py-3 px-3.5 text-right font-mono font-bold text-blue-700 whitespace-nowrap">
                        UF{" "}
                        {Number(item.monto_uf ?? item.monto ?? 0).toLocaleString(
                          "es-CL",
                          {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          }
                        )}
                      </td>

                      {/* 7. EMISIÓN */}
                      <td className="py-3 px-3.5 text-center font-mono text-slate-600 whitespace-nowrap">
                        {formatDateCL(item.fecha_emision)}
                      </td>

                      {/* 8. VENCIMIENTO */}
                      <td className="py-3 px-3.5 text-center font-mono font-semibold whitespace-nowrap">
                        <span
                          className={cn(
                            item.estado === "VENCIDA" && "text-rose-700 font-bold",
                            item.estado === "PROXIMA_A_VENCER" &&
                              "text-amber-800 font-bold",
                            item.estado === "VIGENTE" && "text-slate-800"
                          )}
                        >
                          {formatDateCL(item.fecha_vencimiento)}
                        </span>
                      </td>

                      {/* 9. CONTRAFIANZA */}
                      <td className="py-3 px-3.5 max-w-[160px]">
                        {contrafianzaTexto && contrafianzaTexto.trim() ? (
                          <span
                            className="inline-block px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[11px] font-medium truncate max-w-[160px]"
                            title={contrafianzaTexto}
                          >
                            {contrafianzaTexto}
                          </span>
                        ) : (
                          <span className="text-slate-400 font-semibold text-[11px] tracking-wider">
                            NO
                          </span>
                        )}
                      </td>

                      {/* 10. GESTIONES */}
                      <td className="py-3 px-3.5 text-center whitespace-nowrap">
                        {gestionesCount === 0 ? (
                          <button
                            type="button"
                            onClick={() => openGestionesModal(item)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-orange-50/70 hover:bg-orange-100/80 text-[#E05A10] border border-orange-200/80 transition-colors cursor-pointer shadow-2xs"
                            title="Registrar primera gestión en bitácora"
                          >
                            <Plus className="h-3 w-3" />
                            <span>Gestión</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => openGestionesModal(item)}
                            className={cn(
                              "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border transition-colors cursor-pointer max-w-[210px] shadow-2xs",
                              getGestionBadgeStyle(ultimaGestionEstado || "")
                            )}
                            title={`${ultimaGestionEstado || "Ver Gestiones"} (${gestionesCount} ${
                              gestionesCount === 1 ? "nota registrada" : "notas registradas"
                            })`}
                          >
                            <ClipboardList className="h-3 w-3 shrink-0" />
                            <span className="truncate">
                              {ultimaGestionEstado || "Ver Gestiones"}
                            </span>
                            <span className="font-mono text-[10px] px-1.5 py-0.2 rounded-full bg-white/80 border border-current/20 shrink-0">
                              ({gestionesCount})
                            </span>
                          </button>
                        )}
                      </td>

                      {/* 11. ESTADO */}
                      <td className="py-3 px-3.5 text-center whitespace-nowrap">
                        {item.estado === "VIGENTE" && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            VIGENTE (+{dias}d)
                          </span>
                        )}
                        {item.estado === "PROXIMA_A_VENCER" && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-ping" />
                            POR VENCER ({dias}d)
                          </span>
                        )}
                        {item.estado === "VENCIDA" && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
                            <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                            VENCIDA ({dias <= 0 ? `${dias}d` : "0d"})
                          </span>
                        )}
                      </td>

                      {/* 12. ACCIONES (Solo Editar / Gestionar) */}
                      <td className="py-3 px-3.5 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center">
                          {canManage && (
                            <button
                              onClick={() => openEditModal(item)}
                              className="p-1.5 rounded hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition-colors"
                              title="Editar / Gestionar garantía"
                            >
                              <Pencil className="h-3.5 w-3.5" />
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
      </div>

      {/* 6. Modal de Creación / Edición y Renovación */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-150 overflow-y-auto">
          <div className="w-full max-w-2xl bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden my-8">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/60">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded bg-orange-100 text-[#E05A10] flex items-center justify-center">
                  {isBoleta ? <Landmark className="h-4 w-4" /> : <Shield className="h-4 w-4" />}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-slate-900">
                      {editingItem ? `Editar ${singleTitle}` : `Nueva ${singleTitle}`}
                    </h3>
                    {editingItem && (
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-orange-100 text-[#E05A10] border border-orange-200">
                        Renovación N° {editingItem.contador_renovaciones || 0}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Complete la información contractual y bancaria de la garantía.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-md"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitForm} className="p-6 space-y-4">
              {formError && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
                  {formError}
                </div>
              )}

              {/* Fila 1: Folio, ON Proyecto y Monto en UF */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    N° Folio <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder={isBoleta ? "ej. BG-883910" : "ej. POL-HDI-1092"}
                    value={formData.nro_folio}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, nro_folio: e.target.value }))
                    }
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E05A10]/20 focus:border-[#E05A10] font-mono font-bold uppercase"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    ON (Proyecto) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={3}
                    pattern="[0-9]{3}"
                    placeholder="740"
                    value={formData.on_proyecto}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        on_proyecto: e.target.value.replace(/\D/g, "").slice(0, 3),
                      }))
                    }
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E05A10]/20 focus:border-[#E05A10] font-mono font-bold text-slate-900"
                  />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">
                    3 dígitos numéricos
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Monto (UF) <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-xs font-mono font-bold text-blue-700">
                      UF
                    </span>
                    <input
                      type="number"
                      step="any"
                      required
                      placeholder="ej. 1250.00"
                      value={formData.monto}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, monto: e.target.value }))
                      }
                      className="w-full pl-10 pr-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E05A10]/20 focus:border-[#E05A10] font-mono font-bold text-blue-800"
                    />
                  </div>
                </div>
              </div>

              {/* Fila 2: Mandante y Compañía Emisora (SIN botón + Gestionar para prevenir accesos indebidos) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Mandante (Contratante) <span className="text-red-500">*</span>
                  </label>
                  <select
                    required
                    value={formData.mandante_id}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, mandante_id: e.target.value }))
                    }
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E05A10]/20 focus:border-[#E05A10] bg-white font-medium text-slate-800"
                  >
                    <option value="" disabled>
                      Seleccione un mandante...
                    </option>
                    {mandantes.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.razon_social} ({formatRutDisplay(m.rut || m.rut_mandante || "")})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {emisorLabel} <span className="text-red-500">*</span>
                  </label>
                  <select
                    required
                    value={formData.compania_id}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, compania_id: e.target.value }))
                    }
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E05A10]/20 focus:border-[#E05A10] bg-white font-medium text-slate-800"
                  >
                    <option value="" disabled>
                      Seleccione {isBoleta ? "el banco emisor" : "la aseguradora"}...
                    </option>
                    {companias.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.razon_social} ({formatRutDisplay(c.rut || c.rut_compania || "")})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Fila 3: Motivo con Sugerencias Rápidas */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Motivo de Garantía <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="ej. Fiel cumplimiento de contrato"
                  value={formData.motivo}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, motivo: e.target.value }))
                  }
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E05A10]/20 focus:border-[#E05A10]"
                />
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  <span className="text-[10px] text-slate-400 self-center">Sugerencias:</span>
                  {MOTIVO_SUGGESTIONS.map((sug) => (
                    <button
                      key={sug}
                      type="button"
                      onClick={() => setFormData((prev) => ({ ...prev, motivo: sug }))}
                      className="text-[10px] px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors"
                    >
                      {sug}
                    </button>
                  ))}
                </div>
              </div>

              {/* Fila 4: Fechas (Emisión y Vencimiento) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Fecha de Emisión <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.fecha_emision}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, fecha_emision: e.target.value }))
                    }
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E05A10]/20 focus:border-[#E05A10] font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Fecha de Vencimiento <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.fecha_vencimiento}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, fecha_vencimiento: e.target.value }))
                    }
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E05A10]/20 focus:border-[#E05A10] font-mono font-semibold"
                  />
                </div>
              </div>

              {/* SECCIÓN DE RENOVACIÓN DE GARANTÍA (IMG 1) */}
              {editingItem && (
                <div className="p-4 rounded-xl border border-orange-200 bg-orange-50/50 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="h-6 w-6 rounded-md bg-[#E05A10] text-white flex items-center justify-center">
                        <RotateCw className="h-3.5 w-3.5" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-slate-900">
                          Renovación de Garantía (Prórroga de Vigencia)
                        </h4>
                        <p className="text-[10px] text-slate-500">
                          Al registrar una nueva fecha, se incrementa el contador de iteraciones automáticamente.
                        </p>
                      </div>
                    </div>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-white text-orange-800 border border-orange-200 shadow-2xs">
                      {editingItem.contador_renovaciones || 0} iteraciones previas
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        Nueva Fecha de Vencimiento
                      </label>
                      <input
                        type="date"
                        value={formData.nueva_fecha_vencimiento}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            nueva_fecha_vencimiento: e.target.value,
                          }))
                        }
                        className="w-full px-3 py-1.5 text-xs border border-orange-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E05A10]/30 focus:border-[#E05A10] font-mono font-bold text-orange-950 bg-white"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        Observación / Motivo de Prórroga (Opcional)
                      </label>
                      <input
                        type="text"
                        placeholder="ej. Adenda contractual N° 3"
                        value={formData.observaciones_renovacion}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            observaciones_renovacion: e.target.value,
                          }))
                        }
                        className="w-full px-3 py-1.5 text-xs border border-orange-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E05A10]/30 focus:border-[#E05A10] bg-white"
                      />
                    </div>
                  </div>

                  {/* Botones de extensión rápida */}
                  <div>
                    <span className="text-[10px] font-semibold text-slate-600 block mb-1">
                      Extensiones rápidas desde vencimiento actual:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        { label: "+30 días", days: 30 },
                        { label: "+60 días", days: 60 },
                        { label: "+90 días", days: 90 },
                        { label: "+180 días", days: 180 },
                        { label: "+1 año (365d)", days: 365 },
                      ].map((btn) => (
                        <button
                          key={btn.label}
                          type="button"
                          onClick={() => addDaysToExpiration(btn.days)}
                          className="px-2 py-0.5 text-[10px] font-semibold bg-white hover:bg-orange-100 text-orange-900 border border-orange-300 rounded-md transition-colors"
                        >
                          {btn.label}
                        </button>
                      ))}

                      {formData.nueva_fecha_vencimiento && (
                        <button
                          type="button"
                          onClick={handleEjecutarRenovacion}
                          disabled={isRenovando}
                          className="ml-auto inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-[#E05A10] hover:bg-[#c94e0d] text-white text-[11px] font-bold shadow-xs transition-colors disabled:opacity-50"
                        >
                          {isRenovando ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <RotateCw className="h-3 w-3" />
                          )}
                          Aplicar Renovación (+1)
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Historial de renovaciones previas */}
                  {historialRenovaciones.length > 0 && (
                    <div className="pt-2 border-t border-orange-200">
                      <span className="text-[10px] font-bold text-slate-700 block mb-1 flex items-center gap-1">
                        <History className="h-3 w-3 text-orange-600" />
                        Bitácora Histórica de Renovaciones ({historialRenovaciones.length}):
                      </span>
                      <div className="space-y-1 max-h-24 overflow-y-auto pr-1">
                        {historialRenovaciones.map((h, i) => (
                          <div
                            key={h.id || i}
                            className="text-[10px] bg-white p-1.5 rounded border border-orange-100 flex items-center justify-between text-slate-700"
                          >
                            <span className="font-mono font-bold text-orange-900">
                              Iteración #{h.nro_renovacion || i + 1}
                            </span>
                            <span className="text-slate-500 font-mono">
                              {formatDateCL(h.fecha_vencimiento_anterior)} →{" "}
                              <strong className="text-slate-900">
                                {formatDateCL(h.fecha_vencimiento_nueva)}
                              </strong>
                            </span>
                            {h.observaciones && (
                              <span className="truncate max-w-[140px] text-slate-500 italic" title={h.observaciones}>
                                {h.observaciones}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Status Preview Bar */}
              {statusPreview && (
                <div
                  className={cn(
                    "p-3 rounded-lg border text-xs flex items-center justify-between transition-colors",
                    statusPreview.estado === "VIGENTE" && "bg-emerald-50 border-emerald-200 text-emerald-800",
                    statusPreview.estado === "PROXIMA_A_VENCER" && "bg-amber-50 border-amber-300 text-amber-900",
                    statusPreview.estado === "VENCIDA" && "bg-rose-50 border-rose-300 text-rose-800"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <Info className="h-4 w-4 shrink-0" />
                    <span>
                      Estado estimado:{" "}
                      <strong>
                        {statusPreview.estado === "VIGENTE" && "🟢 VIGENTE"}
                        {statusPreview.estado === "PROXIMA_A_VENCER" && "🟡 PRÓXIMA A VENCER"}
                        {statusPreview.estado === "VENCIDA" && "🔴 VENCIDA"}
                      </strong>
                    </span>
                  </div>
                  <span className="font-mono font-bold">
                    {statusPreview.diasRestantes > 0
                      ? `Faltan ${statusPreview.diasRestantes} días`
                      : `Vencida hace ${Math.abs(statusPreview.diasRestantes)} días`}
                  </span>
                </div>
              )}

              {/* Fila 5: Obra, Proyecto y Contrafianza */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Nombre de Obra
                  </label>
                  <input
                    type="text"
                    placeholder="ej. Mejoramiento Ruta 5 Sur"
                    value={formData.obra}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, obra: e.target.value }))
                    }
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E05A10]/20 focus:border-[#E05A10]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Código de Proyecto
                  </label>
                  <input
                    type="text"
                    placeholder="ej. MOP-VI-2026"
                    value={formData.proyecto}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, proyecto: e.target.value }))
                    }
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E05A10]/20 focus:border-[#E05A10] font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Contrafianza (Entidad o Pagaré)
                  </label>
                  <input
                    type="text"
                    placeholder="ej. Banco Santander o Pagaré notarial"
                    value={formData.contrafianza}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        contrafianza: e.target.value,
                        contrafianza_compania: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E05A10]/20 focus:border-[#E05A10]"
                  />
                </div>
              </div>

              {/* Botones de Acción */}
              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || isRenovando}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[#E05A10] hover:bg-[#c94e0d] rounded-lg transition-colors shadow-sm disabled:opacity-50"
                >
                  {(isSubmitting || isRenovando) && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {editingItem ? "Guardar Cambios" : `Guardar ${singleTitle}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 7. Modal / Drawer: Bitácora de Gestiones del Documento */}
      {isGestionesModalOpen && selectedDocForGestiones && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-150 overflow-y-auto">
          <div className="w-full max-w-2xl bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden my-8 flex flex-col max-h-[90vh]">
            {/* A. Cabecera Informativa */}
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-900 text-white">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-[#E05A10] text-white flex items-center justify-center shrink-0 shadow-xs">
                    <ClipboardList className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-orange-500/20 text-orange-300 border border-orange-400/30">
                        Bitácora de Gestiones
                      </span>
                      <h3 className="text-sm font-bold text-white font-mono">
                        {isBoleta ? "Boleta" : "Póliza"} #{selectedDocForGestiones.nro_folio}
                      </h3>
                      {selectedDocForGestiones.on_proyecto && (
                        <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-slate-800 text-orange-400 border border-slate-700">
                          ON {selectedDocForGestiones.on_proyecto}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-300 mt-1 font-medium">
                      {selectedDocForGestiones.mandante_razon_social}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsGestionesModalOpen(false)}
                  className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Resumen rápido del documento */}
              <div className="grid grid-cols-3 gap-3 mt-3.5 pt-3 border-t border-slate-800 text-xs">
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-slate-400 block">
                    Mandante
                  </span>
                  <span
                    className="font-semibold text-slate-100 truncate block"
                    title={selectedDocForGestiones.mandante_razon_social}
                  >
                    {selectedDocForGestiones.mandante_razon_social}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-slate-400 block">
                    Monto en UF
                  </span>
                  <span className="font-mono font-bold text-orange-400">
                    UF{" "}
                    {Number(
                      selectedDocForGestiones.monto_uf ??
                        selectedDocForGestiones.monto ??
                        0
                    ).toLocaleString("es-CL", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-slate-400 block">
                    Fecha de Vencimiento
                  </span>
                  <span className="font-mono font-semibold text-slate-100">
                    {formatDateCL(selectedDocForGestiones.fecha_vencimiento)}
                  </span>
                </div>
              </div>
            </div>

            {/* Contenido scrollable: Formulario + Historial Cronológico */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1">
              {/* B. Formulario de Registro ("Nueva Gestión") */}
              {canManage && (
                <form
                  onSubmit={handleSaveNuevaGestion}
                  className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-3.5"
                >
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                      <MessageSquarePlus className="h-4 w-4 text-[#E05A10]" />
                      Nueva Gestión
                    </h4>
                    <span className="text-[10px] text-slate-400 font-medium">
                      Registro en tiempo real
                    </span>
                  </div>

                  {gestionFormError && (
                    <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
                      {gestionFormError}
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {/* Estado de la Gestión */}
                    <div className="md:col-span-2">
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        Estado de la Gestión <span className="text-red-500">*</span>
                      </label>
                      <select
                        required
                        value={gestionForm.estado_gestion}
                        onChange={(e) =>
                          setGestionForm((prev) => ({
                            ...prev,
                            estado_gestion: e.target.value as EstadoGestionGarantia,
                          }))
                        }
                        className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E05A10]/20 focus:border-[#E05A10] bg-white font-semibold text-slate-800"
                      >
                        {ESTADOS_GESTION_GARANTIA.map((est) => (
                          <option key={est} value={est}>
                            {est}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Fecha de Próximo Seguimiento */}
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        Próximo Seguimiento{" "}
                        <span className="text-slate-400 font-normal">(Opcional)</span>
                      </label>
                      <input
                        type="date"
                        value={gestionForm.fecha_proximo_seguimiento}
                        onChange={(e) =>
                          setGestionForm((prev) => ({
                            ...prev,
                            fecha_proximo_seguimiento: e.target.value,
                          }))
                        }
                        className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E05A10]/20 focus:border-[#E05A10] bg-white font-mono"
                      />
                    </div>
                  </div>

                  {/* Descripción / Detalle de la Gestión */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Descripción / Detalle de la Gestión{" "}
                      <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      required
                      rows={3}
                      placeholder="Relate llamadas a ejecutivos, condiciones pactadas, estado de evaluación de crédito, solicitud de finiquito o acuerdos en curso..."
                      value={gestionForm.observacion}
                      onChange={(e) =>
                        setGestionForm((prev) => ({
                          ...prev,
                          observacion: e.target.value,
                        }))
                      }
                      className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E05A10]/20 focus:border-[#E05A10] bg-white resize-none leading-relaxed"
                    />
                  </div>

                  <div className="flex justify-end pt-1">
                    <button
                      type="submit"
                      disabled={isSavingGestion}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#E05A10] hover:bg-[#c94e0d] text-white text-xs font-semibold transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
                    >
                      {isSavingGestion ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Plus className="h-3.5 w-3.5" />
                      )}
                      Guardar Gestión
                    </button>
                  </div>
                </form>
              )}

              {/* C. Historial Cronológico de Gestiones */}
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                    <History className="h-4 w-4 text-slate-500" />
                    Historial Cronológico de Gestiones ({gestionesList.length})
                  </h4>
                  {loadingGestiones && (
                    <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-400">
                      <Loader2 className="h-3 w-3 animate-spin text-[#E05A10]" />
                      Actualizando...
                    </span>
                  )}
                </div>

                {gestionesList.length === 0 ? (
                  <div className="py-8 text-center border border-dashed border-slate-200 rounded-xl bg-slate-50/40">
                    <ClipboardList className="h-7 w-7 text-slate-300 mx-auto mb-1.5 stroke-1" />
                    <p className="text-xs font-semibold text-slate-600">
                      Sin gestiones registradas para este documento
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Utilice el formulario superior para registrar la primera gestión en la bitácora.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {gestionesList.map((g, idx) => (
                      <div
                        key={g.id || idx}
                        className={cn(
                          "p-3.5 rounded-xl border transition-colors",
                          idx === 0
                            ? "bg-orange-50/30 border-orange-200/90 shadow-2xs"
                            : "bg-white border-slate-200"
                        )}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                          <div className="flex items-center gap-2">
                            <span
                              className={cn(
                                "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold border",
                                getGestionBadgeStyle(g.estado_gestion)
                              )}
                            >
                              {g.estado_gestion}
                            </span>
                            {idx === 0 && (
                              <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-orange-100 text-[#E05A10]">
                                Última gestión
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-3 text-[11px] text-slate-500">
                            {g.usuario_nombre && (
                              <span className="inline-flex items-center gap-1 font-medium text-slate-700">
                                <User className="h-3 w-3 text-slate-400" />
                                {g.usuario_nombre}
                              </span>
                            )}
                            <span className="inline-flex items-center gap-1 font-mono text-slate-500">
                              <Clock className="h-3 w-3 text-slate-400" />
                              {formatDateTimeCL(g.created_at)}
                            </span>
                          </div>
                        </div>

                        <p className="text-xs text-slate-700 whitespace-pre-line leading-relaxed">
                          {g.observacion}
                        </p>

                        {g.fecha_proximo_seguimiento && (
                          <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center gap-1.5 text-[11px] font-semibold text-amber-800">
                            <Calendar className="h-3.5 w-3.5 text-amber-600" />
                            <span>
                              Próximo seguimiento agendado:{" "}
                              <strong className="font-mono">
                                {formatDateCL(g.fecha_proximo_seguimiento)}
                              </strong>
                            </span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Footer del Modal */}
            <div className="px-6 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-end">
              <button
                type="button"
                onClick={() => setIsGestionesModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                Cerrar Bitácora
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
