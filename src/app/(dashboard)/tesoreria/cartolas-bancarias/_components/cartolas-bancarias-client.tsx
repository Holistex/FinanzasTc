"use client";

import React, { useState, useMemo, useRef, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Landmark,
  FileSpreadsheet,
  Upload,
  Search,
  Calendar,
  Filter,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  X,
  ArrowDownRight,
  ArrowUpRight,
  Tags,
  Building2,
  Banknote,
  Clock,
  Trash2,
  CheckSquare,
} from "lucide-react";
import {
  BancoCartola,
  CartolaBancaria,
  CartolaLinea,
  MantenedorTipoPago,
} from "@/types/database.types";
import {
  CartolasTesoreriaResponse,
  getCartolasBancariasAction,
  importarCartolaBancariaExcelAction,
  clasificarLineaCartolaAction,
  reversarLineaCartolaAction,
  asignarTipoMovimientoMasivoAction,
  vaciarTesoreriaAction,
} from "@/actions/tesoreria.actions";
import { cn, formatCLP, formatDateCL } from "@/lib/utils";

interface CartolasBancariasClientProps {
  initialData: CartolasTesoreriaResponse;
  isAdmin?: boolean;
}

type ActiveTab = "PENDIENTES" | "CLASIFICADOS";

export function CartolasBancariasClient({
  initialData,
  isAdmin = false,
}: CartolasBancariasClientProps) {
  const router = useRouter();
  const [lineas, setLineas] = useState<CartolaLinea[]>(initialData.lineas);
  const [cartolas, setCartolas] = useState<CartolaBancaria[]>(initialData.cartolas);
  const [tiposPago, setTiposPago] = useState<MantenedorTipoPago[]>(
    initialData.tiposPago
  );
  const [activeTab, setActiveTab] = useState<ActiveTab>("PENDIENTES");
  const [isPending, startTransition] = useTransition();
  const [savingLineaId, setSavingLineaId] = useState<string | null>(null);

  // Filtros Superiores
  const [selectedBanco, setSelectedBanco] = useState<string>("TODOS");
  const [selectedNumeroCartola, setSelectedNumeroCartola] = useState<string>("TODAS");
  const [fechaDesde, setFechaDesde] = useState<string>("");
  const [fechaHasta, setFechaHasta] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState<string>("");

  // Modal de Importación de Cartolas Bancarias
  const [isImportModalOpen, setIsImportModalOpen] = useState<boolean>(false);
  const [importBanco, setImportBanco] = useState<BancoCartola>("Banco Itaú");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccessInfo, setImportSuccessInfo] = useState<{
    cartola: CartolaBancaria;
    movimientosCount: number;
    omitidosCount?: number;
    totalArchivo?: number;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Opciones dinámicas de N° de Cartola según banco seleccionado
  const cartolasDisponibles = useMemo(() => {
    const base =
      selectedBanco === "TODOS"
        ? cartolas
        : cartolas.filter((c) => c.banco === selectedBanco);
    const uniqueNums = Array.from(new Set(base.map((c) => c.numero_cartola)));
    return uniqueNums.sort((a, b) =>
      b.localeCompare(a, "es", { numeric: true })
    );
  }, [cartolas, selectedBanco]);

  // Tipos de Pago activos para el selector de la columna editable
  const tiposPagoActivos = useMemo(() => {
    return tiposPago.filter((t) => t.activo !== false);
  }, [tiposPago]);

  // Filtrado base por criterios superiores (Banco, Cartola, Fechas, Buscador)
  const baseFilteredLineas = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return lineas.filter((l) => {
      if (selectedBanco !== "TODOS" && l.banco !== selectedBanco) return false;
      if (
        selectedNumeroCartola !== "TODAS" &&
        l.numero_cartola !== selectedNumeroCartola
      ) {
        return false;
      }
      if (fechaDesde && l.fecha < fechaDesde) return false;
      if (fechaHasta && l.fecha > fechaHasta) return false;
      if (q) {
        const matchDesc = l.descripcion.toLowerCase().includes(q);
        const matchOp =
          l.numero_operacion?.toLowerCase().includes(q) ?? false;
        const matchCartola =
          l.numero_cartola?.toLowerCase().includes(q) ?? false;
        const matchTipo =
          l.tipo_pago?.nombre.toLowerCase().includes(q) ?? false;
        if (!matchDesc && !matchOp && !matchCartola && !matchTipo) return false;
      }
      return true;
    });
  }, [
    lineas,
    selectedBanco,
    selectedNumeroCartola,
    fechaDesde,
    fechaHasta,
    searchTerm,
  ]);

  // Contadores en tiempo real para las dos pestañas
  const lineasPorClasificar = useMemo(
    () => baseFilteredLineas.filter((l) => !l.tipo_pago_id),
    [baseFilteredLineas]
  );

  const movimientosClasificados = useMemo(
    () => baseFilteredLineas.filter((l) => Boolean(l.tipo_pago_id)),
    [baseFilteredLineas]
  );

  // Líneas visibles según la pestaña activa
  const filteredLineas =
    activeTab === "PENDIENTES" ? lineasPorClasificar : movimientosClasificados;

  // KPIs ejecutivos reactivos
  const kpis = useMemo(() => {
    const totalGiros = filteredLineas.reduce(
      (sum, l) => sum + Number(l.giro || 0),
      0
    );
    const totalAbonos = filteredLineas.reduce(
      (sum, l) => sum + Number(l.abono || 0),
      0
    );
    return {
      totalCartolas: cartolas.length,
      totalMovimientosVista: filteredLineas.length,
      totalGiros,
      totalAbonos,
      sinClasificar: lineasPorClasificar.length,
      clasificados: movimientosClasificados.length,
    };
  }, [
    filteredLineas,
    cartolas.length,
    lineasPorClasificar.length,
    movimientosClasificados.length,
  ]);

  const handleRefresh = () => {
    setSelectedRowIds([]);
    startTransition(async () => {
      const fresh = await getCartolasBancariasAction();
      setLineas(fresh.lineas);
      setCartolas(fresh.cartolas);
      setTiposPago(fresh.tiposPago);
    });
  };

  const handleResetFilters = () => {
    setSelectedRowIds([]);
    setSelectedBanco("TODOS");
    setSelectedNumeroCartola("TODAS");
    setFechaDesde("");
    setFechaHasta("");
    setSearchTerm("");
  };

  const openImportModal = () => {
    setImportBanco("Banco Itaú");
    setSelectedFile(null);
    setImportError(null);
    setImportSuccessInfo(null);
    setIsImportModalOpen(true);
  };

  // Clasificar línea (Traslada automáticamente de "Líneas por clasificar" a "Movimientos Clasificados")
  const handleClasificarLinea = async (lineaId: string, nuevoTipoId: string) => {
    if (!nuevoTipoId) return;
    const tipoObj = tiposPago.find((t) => t.id === nuevoTipoId) || null;

    setSavingLineaId(lineaId);
    // Actualización optimista inmediata: remueve la fila de "Líneas por clasificar" y la suma a "Movimientos Clasificados"
    setLineas((prev) =>
      prev.map((l) =>
        l.id === lineaId
          ? { ...l, tipo_pago_id: nuevoTipoId, tipo_pago: tipoObj }
          : l
      )
    );

    try {
      await clasificarLineaCartolaAction(lineaId, nuevoTipoId);
    } finally {
      setSavingLineaId(null);
    }
  };

  // Reversar clasificación (Devuelve inmediatamente la línea a "Líneas por clasificar")
  const handleReversarLinea = async (linea: CartolaLinea) => {
    const tipoNombre = linea.tipo_pago?.nombre || "este movimiento";
    const confirmed = window.confirm(
      `¿Confirmas reversar la clasificación "${tipoNombre}" de este movimiento bancario?\n\nLa línea regresará inmediatamente a la pestaña "Líneas por clasificar".`
    );
    if (!confirmed) return;

    setSavingLineaId(linea.id);
    // Actualización optimista inmediata: tipo_pago_id = null
    setLineas((prev) =>
      prev.map((l) =>
        l.id === linea.id ? { ...l, tipo_pago_id: null, tipo_pago: null } : l
      )
    );

    try {
      await reversarLineaCartolaAction(linea.id);
    } finally {
      setSavingLineaId(null);
    }
  };

  // ==========================================================================
  // ASIGNACIÓN MASIVA DE TIPO DE MOVIMIENTO (CHECKBOXES & FLOATING BAR)
  // ==========================================================================
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);
  const [bulkTipoPagoId, setBulkTipoPagoId] = useState<string>("");
  const [isAssigningBulk, setIsAssigningBulk] = useState<boolean>(false);

  // Toggle individual de fila
  const handleToggleRow = (id: string) => {
    setSelectedRowIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // Toggle seleccionar todo / deseleccionar todo sobre las líneas de la pestaña activa
  const handleToggleSelectAll = () => {
    if (selectedRowIds.length === filteredLineas.length) {
      setSelectedRowIds([]);
    } else {
      setSelectedRowIds(filteredLineas.map((l) => l.id));
    }
  };

  const handleClearSelection = () => {
    setSelectedRowIds([]);
    setBulkTipoPagoId("");
  };

  // Aplicar tipo de movimiento en lote
  const handleApplyBulkAssignment = async () => {
    if (selectedRowIds.length === 0) return;
    if (!bulkTipoPagoId) {
      alert("Por favor selecciona un Tipo de Movimiento para el lote.");
      return;
    }

    const tipoObj = tiposPago.find((t) => t.id === bulkTipoPagoId) || null;
    const targetIds = [...selectedRowIds];
    const targetSet = new Set(targetIds);

    setIsAssigningBulk(true);

    // Actualización optimista inmediata
    setLineas((prev) =>
      prev.map((l) =>
        targetSet.has(l.id)
          ? { ...l, tipo_pago_id: bulkTipoPagoId, tipo_pago: tipoObj }
          : l
      )
    );
    setSelectedRowIds([]);
    setBulkTipoPagoId("");

    try {
      const res = await asignarTipoMovimientoMasivoAction(targetIds, bulkTipoPagoId);
      if (!res.success) {
        alert(res.error || "Ocurrió un error en la asignación masiva.");
        // Si falló, refrescar datos reales
        const fresh = await getCartolasBancariasAction();
        setLineas(fresh.lineas);
      }
    } catch (err) {
      alert("Error: " + (err instanceof Error ? err.message : String(err)));
      const fresh = await getCartolasBancariasAction();
      setLineas(fresh.lineas);
    } finally {
      setIsAssigningBulk(false);
    }
  };

  const [isWiping, setIsWiping] = useState(false);
  const handleVaciarTesoreria = async () => {
    const confirmed = window.confirm(
      "¿Estás seguro de que deseas vaciar y reiniciar TODOS los movimientos y cartolas bancarias?\n\nEsta acción eliminará todas las líneas importadas tanto en la base de datos como localmente y dejará el módulo en cero."
    );
    if (!confirmed) return;

    setIsWiping(true);
    try {
      const res = await vaciarTesoreriaAction();
      if (res.success) {
        setLineas([]);
        setCartolas([]);
      } else {
        alert(res.error || "Error al vaciar tesorería");
      }
    } catch (e) {
      alert("Error al vaciar tesorería: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setIsWiping(false);
    }
  };

  const handleSubmitImport = async () => {
    if (!selectedFile) {
      setImportError(
        "Debe seleccionar un archivo Excel (.xls o .xlsx) emitido por el banco."
      );
      return;
    }

    setIsImporting(true);
    setImportError(null);
    setImportSuccessInfo(null);

    try {
      const formData = new FormData();
      formData.append("banco", importBanco);
      formData.append("file", selectedFile);

      const res = await importarCartolaBancariaExcelAction(formData);
      if (!res.success) {
        setImportError(
          res.error || "Error al importar la cartola bancaria."
        );
        return;
      }

      if (res.cartola) {
        setImportSuccessInfo({
          cartola: res.cartola,
          movimientosCount: res.movimientosImportados || 0,
          omitidosCount: res.movimientosOmitidosDuplicados || 0,
          totalArchivo: res.totalMovimientosArchivo || 0,
        });
      }

      // Recargar tabla unificada
      const fresh = await getCartolasBancariasAction();
      setLineas(fresh.lineas);
      setCartolas(fresh.cartolas);
      setTiposPago(fresh.tiposPago);
      router.refresh();
    } catch (err: unknown) {
      setImportError(
        err instanceof Error
          ? err.message
          : "Error inesperado al importar la cartola bancaria."
      );
    } finally {
      setIsImporting(false);
    }
  };

  const renderBancoBadge = (banco?: string) => {
    if (banco === "Banco Santander") {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-md bg-red-50 border border-red-200 px-2.5 py-0.5 text-[11px] font-bold text-red-700">
          <span className="h-1.5 w-1.5 rounded-full bg-red-600" />
          Banco Santander
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md bg-orange-50 border border-orange-200 px-2.5 py-0.5 text-[11px] font-bold text-[#E05A10]">
        <span className="h-1.5 w-1.5 rounded-full bg-[#E05A10]" />
        {banco || "Banco Itaú"}
      </span>
    );
  };

  return (
    <div className="bg-[#F8FAFC] min-h-screen space-y-5">
      {/* 1. ENCABEZADO EJECUTIVO */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-[#0B1528] flex items-center justify-center text-white shadow-sm">
            <Landmark className="h-5 w-5 text-[#E05A10]" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="font-black text-xl text-slate-900 tracking-tight uppercase">
                SALDOS BANCARIOS
              </h1>
              <span className="bg-orange-50 border border-orange-200 text-orange-600 text-xs font-semibold px-2.5 py-0.5 rounded-md">
                Tesorería Corporativa
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Importación homologada de movimientos bancarios (Banco Itaú y Banco Santander) y clasificación por Tipo de Pago
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            href="/tesoreria/pagos"
            className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 font-semibold text-xs px-3.5 py-2 rounded-lg flex items-center gap-1.5 shadow-xs transition-colors"
          >
            <Banknote className="h-3.5 w-3.5 text-emerald-600" />
            Consolidado de Pagos
          </Link>

          <Link
            href="/configuracion/colaboradores"
            className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 font-semibold text-xs px-3.5 py-2 rounded-lg flex items-center gap-1.5 shadow-xs transition-colors"
          >
            <Tags className="h-3.5 w-3.5 text-[#E05A10]" />
            Catálogo Tipos de Pago
          </Link>

          <button
            type="button"
            onClick={handleVaciarTesoreria}
            disabled={isWiping}
            className="bg-white hover:bg-rose-50 text-rose-700 border border-rose-300 font-semibold text-xs px-3 py-2 rounded-lg flex items-center gap-1.5 shadow-xs transition-colors disabled:opacity-50"
            title="Vaciar todos los movimientos bancarios y reiniciar a cero"
          >
            {isWiping ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-rose-600" />
            ) : (
              <Trash2 className="h-3.5 w-3.5 text-rose-600" />
            )}
            Vaciar Datos
          </button>

          {isAdmin && (
            <button
              type="button"
              onClick={openImportModal}
              className="bg-[#E05A10] hover:bg-[#c84e0c] text-white font-semibold text-xs px-4 py-2 rounded-lg flex items-center gap-2 shadow-sm transition-colors"
            >
              <FileSpreadsheet className="h-4 w-4" />
              Importar Saldos Bancarios
            </button>
          )}
        </div>
      </div>

      {/* 2. TARJETAS KPI EJECUTIVAS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col justify-between">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            CARTOLAS / SALDOS
          </span>
          <span className="text-2xl font-black text-slate-900 font-mono mt-1.5">
            {kpis.totalCartolas}
          </span>
          <span className="text-[11px] text-slate-400 mt-1">
            Control antiduplicados activo
          </span>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col justify-between">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            LÍNEAS POR CLASIFICAR
          </span>
          <span className="text-2xl font-black text-amber-600 font-mono mt-1.5">
            {kpis.sinClasificar}
          </span>
          <span className="text-[11px] text-slate-400 mt-1">
            Pendientes de Tipo de Pago
          </span>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col justify-between">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            MOVIMIENTOS CLASIFICADOS
          </span>
          <span className="text-2xl font-black text-emerald-600 font-mono mt-1.5">
            {kpis.clasificados}
          </span>
          <span className="text-[11px] text-slate-400 mt-1">
            Listos para reporte de pagos
          </span>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              GIROS / CARGOS (PESTAÑA)
            </span>
            <ArrowDownRight className="h-4 w-4 text-rose-600" />
          </div>
          <span className="text-lg font-black text-rose-600 font-mono mt-1.5">
            {formatCLP(kpis.totalGiros)}
          </span>
          <span className="text-[11px] text-slate-400 mt-1">
            Egresos en pestaña actual
          </span>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              ABONOS (PESTAÑA)
            </span>
            <ArrowUpRight className="h-4 w-4 text-emerald-600" />
          </div>
          <span className="text-lg font-black text-emerald-600 font-mono mt-1.5">
            {formatCLP(kpis.totalAbonos)}
          </span>
          <span className="text-[11px] text-slate-400 mt-1">
            Ingresos en pestaña actual
          </span>
        </div>
      </div>

      {/* 3. PESTAÑAS DE NAVEGACIÓN SUPERIOR (TABS CON CONTADORES EN TIEMPO REAL) */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="inline-flex items-center gap-1.5 bg-white p-1.5 rounded-xl border border-slate-200 shadow-xs">
          <button
            type="button"
            onClick={() => {
              setActiveTab("PENDIENTES");
              setSelectedRowIds([]);
            }}
            className={cn(
              "inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all",
              activeTab === "PENDIENTES"
                ? "bg-[#E05A10] text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
            )}
          >
            <Clock className="h-3.5 w-3.5" />
            <span>Líneas por clasificar</span>
            <span
              className={cn(
                "px-2 py-0.5 rounded-full text-[11px] font-mono font-extrabold",
                activeTab === "PENDIENTES"
                  ? "bg-white/20 text-white"
                  : "bg-amber-50 text-amber-700 border border-amber-200"
              )}
            >
              {lineasPorClasificar.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab("CLASIFICADOS");
              setSelectedRowIds([]);
            }}
            className={cn(
              "inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all",
              activeTab === "CLASIFICADOS"
                ? "bg-[#0B1528] text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
            )}
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>Movimientos Clasificados</span>
            <span
              className={cn(
                "px-2 py-0.5 rounded-full text-[11px] font-mono font-extrabold",
                activeTab === "CLASIFICADOS"
                  ? "bg-emerald-500/25 text-emerald-300"
                  : "bg-emerald-50 text-emerald-700 border border-emerald-200"
              )}
            >
              {movimientosClasificados.length}
            </span>
          </button>
        </div>

        <div className="text-xs text-slate-500">
          {activeTab === "PENDIENTES" ? (
            <span>
              Al asignar un <strong>Tipo de Movimiento</strong>, la línea se guarda y pasa automáticamente a{" "}
              <strong className="text-slate-800">Movimientos Clasificados</strong>.
            </span>
          ) : (
            <span>
              Puedes pulsar <strong className="text-rose-600">↺ Reversar</strong> en cualquier fila para devolverla a{" "}
              <strong className="text-slate-800">Líneas por clasificar</strong>.
            </span>
          )}
        </div>
      </div>

      {/* 4. BARRA DE FILTROS SUPERIORES */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-3">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          {/* Buscador */}
          <div className="relative flex-1 min-w-[220px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por descripción, N° operación, N° cartola o tipo de pago..."
              className="w-full rounded-lg border border-slate-300 bg-[#F8FAFC] pl-9 pr-8 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-[#E05A10] focus:outline-none transition-colors"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Selector de Banco */}
          <div className="flex items-center gap-2 shrink-0">
            <Building2 className="h-4 w-4 text-slate-400 shrink-0" />
            <select
              value={selectedBanco}
              onChange={(e) => {
                setSelectedBanco(e.target.value);
                setSelectedNumeroCartola("TODAS");
              }}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 focus:border-[#E05A10] focus:outline-none"
            >
              <option value="TODOS">Todos los Bancos</option>
              <option value="Banco Itaú">Banco Itaú</option>
              <option value="Banco Santander">Banco Santander</option>
            </select>
          </div>

          {/* Selector de N° de Cartola */}
          <div className="flex items-center gap-2 shrink-0">
            <Filter className="h-4 w-4 text-slate-400 shrink-0" />
            <select
              value={selectedNumeroCartola}
              onChange={(e) => setSelectedNumeroCartola(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 focus:border-[#E05A10] focus:outline-none font-mono"
            >
              <option value="TODAS">Todas las Cartolas</option>
              {cartolasDisponibles.map((num) => (
                <option key={num} value={num}>
                  Cartola N° {num}
                </option>
              ))}
            </select>
          </div>

          {/* Rango de Fechas */}
          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            <div className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5">
              <Calendar className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              <div className="flex flex-col">
                <span className="text-[9px] font-bold uppercase text-slate-400 leading-none">
                  Desde
                </span>
                <input
                  type="date"
                  value={fechaDesde}
                  onChange={(e) => setFechaDesde(e.target.value)}
                  className="text-xs font-mono text-slate-800 bg-transparent focus:outline-none"
                />
              </div>
            </div>

            <div className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5">
              <Calendar className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              <div className="flex flex-col">
                <span className="text-[9px] font-bold uppercase text-slate-400 leading-none">
                  Hasta
                </span>
                <input
                  type="date"
                  value={fechaHasta}
                  onChange={(e) => setFechaHasta(e.target.value)}
                  className="text-xs font-mono text-slate-800 bg-transparent focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Botón Limpiar / Refrescar */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleResetFilters}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
              title="Limpiar filtros"
            >
              Limpiar
            </button>
            <button
              type="button"
              onClick={handleRefresh}
              disabled={isPending}
              className="rounded-lg border border-slate-300 bg-white p-2 text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
              title="Actualizar movimientos"
            >
              <RotateCcw
                className={cn("h-4 w-4", isPending && "animate-spin text-[#E05A10]")}
              />
            </button>
          </div>
        </div>
      </div>

      {/* 5. TABLA UNIFICADA DE CARTOLAS BANCARIAS */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-[850px] lg:min-w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#0B1528] text-slate-200 text-[11px] font-bold uppercase tracking-wider border-b border-[#1E293B]">
                {/* Checkbox Maestro (Solo en PENDIENTES o siempre activo) */}
                <th className="py-3 px-3 w-12 text-center whitespace-nowrap">
                  <input
                    type="checkbox"
                    aria-label="Seleccionar todos los movimientos"
                    checked={
                      filteredLineas.length > 0 &&
                      selectedRowIds.length === filteredLineas.length
                    }
                    onChange={handleToggleSelectAll}
                    disabled={filteredLineas.length === 0}
                    className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-[#E05A10] focus:ring-[#E05A10] focus:ring-offset-slate-950 cursor-pointer"
                  />
                </th>
                <th className="py-3 px-3.5 whitespace-nowrap">1. BANCO</th>
                <th className="py-3 px-3 whitespace-nowrap text-center">2. N° CARTOLA</th>
                <th className="py-3 px-3 whitespace-nowrap">3. FECHA</th>
                <th className="py-3 px-3 whitespace-nowrap">4. N° OPERACIÓN / DOC</th>
                <th className="py-3 px-4">5. DESCRIPCIÓN MOVIMIENTO</th>
                <th className="py-3 px-3.5 text-right whitespace-nowrap">
                  6. GIROS / CARGOS
                </th>
                <th className="py-3 px-3.5 text-right whitespace-nowrap">
                  7. DEPÓSITOS / ABONOS
                </th>
                <th className="py-3 px-3.5 text-right whitespace-nowrap">8. SALDO</th>
                <th className="py-3 px-4 whitespace-nowrap w-64">
                  9. TIPO DE MOVIMIENTO
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/80 text-xs bg-white">
              {filteredLineas.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-14 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Landmark className="h-9 w-9 text-slate-300" />
                      <p className="text-sm font-bold text-slate-700">
                        {lineas.length === 0
                          ? "Aún no se han importado saldos bancarios"
                          : activeTab === "PENDIENTES"
                          ? "¡Excelente! No hay líneas pendientes por clasificar con estos filtros"
                          : "No hay movimientos clasificados para los filtros seleccionados"}
                      </p>
                      <p className="text-xs text-slate-400 max-w-md">
                        {lineas.length === 0
                          ? "Haz clic en 'Importar Saldos Bancarios' para cargar tus archivos Excel (.xlsx / .xls) de Banco Itaú o Banco Santander."
                          : activeTab === "PENDIENTES"
                          ? "Cambia a la pestaña 'Movimientos Clasificados' para revisar o reversar las líneas ya asignadas."
                          : "Clasifica líneas desde la pestaña 'Líneas por clasificar' para visualizarlas aquí."}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredLineas.map((linea) => {
                  const isSavingThis = savingLineaId === linea.id;
                  const isSelected = selectedRowIds.includes(linea.id);
                  const tipoAsignado =
                    linea.tipo_pago ||
                    tiposPago.find((t) => t.id === linea.tipo_pago_id) ||
                    null;

                  return (
                    <tr
                      key={linea.id}
                      className={cn(
                        "transition-colors",
                        isSelected
                          ? "bg-orange-50/80 hover:bg-orange-100/60"
                          : "hover:bg-slate-50/80"
                      )}
                    >
                      {/* Checkbox Individual */}
                      <td className="py-2.5 px-3 w-12 text-center whitespace-nowrap">
                        <input
                          type="checkbox"
                          aria-label={`Seleccionar movimiento ${linea.descripcion}`}
                          checked={isSelected}
                          onChange={() => handleToggleRow(linea.id)}
                          className="h-4 w-4 rounded border-slate-300 text-[#E05A10] focus:ring-[#E05A10] cursor-pointer"
                        />
                      </td>

                      {/* 1. BANCO */}
                      <td className="py-2.5 px-3.5 whitespace-nowrap">
                        {renderBancoBadge(linea.banco)}
                      </td>

                      {/* 2. N° CARTOLA */}
                      <td
                        className="py-2.5 px-3 whitespace-nowrap text-center font-mono font-bold text-slate-900"
                        title={
                          linea.numero_cuenta
                            ? `Cuenta: ${linea.numero_cuenta}`
                            : undefined
                        }
                      >
                        #{linea.numero_cartola}
                      </td>

                      {/* 3. FECHA (DD-MM-YYYY) */}
                      <td className="py-2.5 px-3 whitespace-nowrap font-mono text-slate-700 font-medium">
                        {formatDateCL(linea.fecha)}
                      </td>

                      {/* 4. N° OPERACIÓN / DOC */}
                      <td className="py-2.5 px-3 whitespace-nowrap font-mono text-slate-600">
                        {linea.numero_operacion || "—"}
                      </td>

                      {/* 5. DESCRIPCIÓN MOVIMIENTO */}
                      <td className="py-2.5 px-4 text-slate-800 font-medium max-w-md">
                        <div className="line-clamp-2" title={linea.descripcion}>
                          {linea.descripcion}
                        </div>
                      </td>

                      {/* 6. GIROS / CARGOS (Rojo) */}
                      <td className="py-2.5 px-3.5 text-right whitespace-nowrap font-mono font-bold">
                        {linea.giro > 0 ? (
                          <span className="text-rose-600">
                            -{formatCLP(linea.giro)}
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>

                      {/* 7. DEPÓSITOS / ABONOS (Verde) */}
                      <td className="py-2.5 px-3.5 text-right whitespace-nowrap font-mono font-bold">
                        {linea.abono > 0 ? (
                          <span className="text-emerald-600">
                            +{formatCLP(linea.abono)}
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>

                      {/* 8. SALDO */}
                      <td className="py-2.5 px-3.5 text-right whitespace-nowrap font-mono font-semibold text-slate-800">
                        {linea.saldo !== null && linea.saldo !== undefined
                          ? formatCLP(linea.saldo)
                          : "—"}
                      </td>

                      {/* 9. TIPO DE MOVIMIENTO / ACCIÓN DE REVERSA */}
                      <td className="py-2 px-4 whitespace-nowrap">
                        {activeTab === "PENDIENTES" ? (
                          <div className="relative flex items-center gap-1.5">
                            <select
                              value={linea.tipo_pago_id || ""}
                              onChange={(e) =>
                                handleClasificarLinea(linea.id, e.target.value)
                              }
                              disabled={isSavingThis}
                              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 hover:border-[#E05A10] transition-colors focus:outline-none focus:ring-2 focus:ring-[#E05A10]/20"
                            >
                              <option value="">Seleccionar tipo...</option>
                              {tiposPagoActivos.map((tp) => (
                                <option key={tp.id} value={tp.id}>
                                  {tp.nombre}
                                </option>
                              ))}
                            </select>
                            {isSavingThis && (
                              <Loader2 className="h-3.5 w-3.5 animate-spin text-[#E05A10] shrink-0" />
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center justify-between gap-2">
                            <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-[11px] font-bold text-emerald-800">
                              <CheckCircle2 className="h-3 w-3 text-emerald-600 shrink-0" />
                              <span className="truncate max-w-[140px]">
                                {tipoAsignado?.nombre || "CLASIFICADO"}
                              </span>
                            </span>

                            <button
                              type="button"
                              onClick={() => handleReversarLinea(linea)}
                              disabled={isSavingThis}
                              className="bg-white border border-rose-300 text-rose-600 hover:bg-rose-50 font-semibold text-xs px-2 py-1 rounded-md transition-colors shadow-2xs shrink-0 disabled:opacity-50"
                              title="Reversar clasificación y devolver a Líneas por clasificar"
                            >
                              {isSavingThis ? "..." : "↺ Reversar"}
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer Resumen */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-t border-slate-200 bg-slate-50/80 px-4 py-3 text-xs text-slate-600">
          <div>
            Mostrando{" "}
            <span className="font-bold text-slate-900">
              {filteredLineas.length}
            </span>{" "}
            movimientos en{" "}
            <span className="font-bold text-slate-900">
              {activeTab === "PENDIENTES"
                ? "Líneas por clasificar"
                : "Movimientos Clasificados"}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <div>
              Total Giros:{" "}
              <span className="font-mono font-bold text-rose-600">
                -{formatCLP(kpis.totalGiros)}
              </span>
            </div>
            <div>
              Total Abonos:{" "}
              <span className="font-mono font-bold text-emerald-600">
                +{formatCLP(kpis.totalAbonos)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 5.5 BARRA FLOTANTE DE ACCIONES MASIVAS (FLOATING BULK BAR) */}
      {selectedRowIds.length > 0 && (
        <aside
          aria-label="Barra de acciones masivas"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-[#0B1528] text-white px-5 py-3.5 rounded-2xl shadow-2xl border border-slate-700/80 flex flex-wrap items-center gap-4 animate-in fade-in slide-in-from-bottom-5 duration-200"
        >
          {/* Contador de filas seleccionadas */}
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#E05A10] text-white text-xs font-bold font-mono">
              {selectedRowIds.length}
            </span>
            <span className="text-xs font-bold text-slate-200 whitespace-nowrap">
              {selectedRowIds.length === 1
                ? "movimiento seleccionado"
                : "movimientos seleccionados"}
            </span>
          </div>

          <div className="h-5 w-px bg-slate-700 hidden sm:block" />

          {/* Selector de Tipo de Movimiento para el lote */}
          <div className="flex items-center gap-2">
            <select
              aria-label="Seleccionar Tipo de Movimiento para el lote"
              value={bulkTipoPagoId}
              onChange={(e) => setBulkTipoPagoId(e.target.value)}
              disabled={isAssigningBulk}
              className="bg-slate-900 border border-slate-600 rounded-lg px-3 py-1.5 text-xs font-medium text-white focus:outline-none focus:ring-2 focus:ring-[#E05A10] min-w-[220px]"
            >
              <option value="">Seleccionar Tipo de Movimiento para el lote...</option>
              {tiposPagoActivos.map((tp) => (
                <option key={tp.id} value={tp.id}>
                  {tp.nombre}
                </option>
              ))}
            </select>
          </div>

          {/* Botón Aplicar en Lote */}
          <button
            type="button"
            onClick={handleApplyBulkAssignment}
            disabled={isAssigningBulk || !bulkTipoPagoId}
            className="bg-[#E05A10] hover:bg-[#c84e0c] text-white font-bold text-xs px-4 py-2 rounded-lg shadow-md transition-colors disabled:opacity-50 flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
          >
            {isAssigningBulk ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <CheckSquare className="h-3.5 w-3.5" />
            )}
            <span>Asignar a Lote ({selectedRowIds.length})</span>
          </button>

          {/* Botón Cancelar / Descartar Selección */}
          <button
            type="button"
            onClick={handleClearSelection}
            disabled={isAssigningBulk}
            className="text-slate-400 hover:text-white text-xs px-2.5 py-1.5 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap cursor-pointer"
          >
            Cancelar / Limpiar Selección
          </button>
        </aside>
      )}

      {/* 6. MODAL DE IMPORTACIÓN DE SALDOS BANCARIOS */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 backdrop-blur-xs p-4">
          <div className="w-[95vw] sm:w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-2xl">
            {/* Cabecera Modal */}
            <div className="flex items-center justify-between border-b border-slate-200 bg-[#0B1528] px-5 py-4 text-white">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#E05A10] text-white shadow-sm">
                  <FileSpreadsheet className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-white">
                    Importar Saldos Bancarios (.xlsx / .xls)
                  </h2>
                  <p className="text-[11px] text-slate-300">
                    Homologación automática y validación estricta antiduplicados
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsImportModalOpen(false);
                  router.refresh();
                }}
                disabled={isImporting}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* 1. Selector de Banco (Obligatorio) */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                  1. Seleccionar Banco de Origen{" "}
                  <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  {(["Banco Itaú", "Banco Santander"] as const).map((banco) => {
                    const active = importBanco === banco;
                    return (
                      <button
                        key={banco}
                        type="button"
                        onClick={() => {
                          setImportBanco(banco);
                          setImportError(null);
                        }}
                        className={cn(
                          "flex items-center justify-center gap-2 rounded-lg border px-4 py-3 text-xs font-bold transition-all",
                          active
                            ? "border-[#E05A10] bg-orange-50/80 text-slate-900 ring-2 ring-[#E05A10]/20 shadow-xs"
                            : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                        )}
                      >
                        <Landmark
                          className={cn(
                            "h-4 w-4",
                            active ? "text-[#E05A10]" : "text-slate-400"
                          )}
                        />
                        <span>{banco}</span>
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-slate-500 mt-1.5">
                  {importBanco === "Banco Itaú"
                    ? "Parser Itaú: Extrae N° Cuenta (A10), N° Cartola (D10), Período (E10) y movimientos desde fila 15."
                    : "Parser Santander: Interpreta columna de Monto, indicador C/A (Cargo/Abono), N° Documento y Fecha desde fila 17."}
                </p>
              </div>

              {/* 2. Zona Drag & Drop de Archivo Excel (.xlsx / .xls estrictos) */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                  2. Archivo de Saldos Bancarios (.xlsx / .xls){" "}
                  <span className="text-rose-500">*</span>
                </label>
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    const file = e.dataTransfer.files?.[0];
                    if (file) {
                      const lower = (file.name || "").toLowerCase();
                      if (!lower.endsWith(".xlsx") && !lower.endsWith(".xls")) {
                        setImportError("Formato de archivo no admitido. Debe seleccionar únicamente una planilla Excel (.xlsx o .xls).");
                        setSelectedFile(null);
                        return;
                      }
                      setSelectedFile(file);
                      setImportError(null);
                      setImportSuccessInfo(null);
                    }
                  }}
                  onClick={() => fileInputRef.current?.click()}
                  className={cn(
                    "cursor-pointer rounded-xl border-2 border-dashed p-6 text-center transition-all",
                    isDragging
                      ? "border-[#E05A10] bg-orange-50/50"
                      : selectedFile
                      ? "border-emerald-400 bg-emerald-50/30"
                      : "border-slate-300 bg-[#F8FAFC] hover:border-slate-400"
                  )}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx, .xls, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const lower = (file.name || "").toLowerCase();
                        if (!lower.endsWith(".xlsx") && !lower.endsWith(".xls")) {
                          setImportError("Formato de archivo no admitido. Debe seleccionar únicamente una planilla Excel (.xlsx o .xls).");
                          setSelectedFile(null);
                          return;
                        }
                        setSelectedFile(file);
                        setImportError(null);
                        setImportSuccessInfo(null);
                      }
                    }}
                  />
                  <Upload
                    className={cn(
                      "mx-auto h-8 w-8 mb-2",
                      selectedFile ? "text-emerald-600" : "text-slate-400"
                    )}
                  />
                  {selectedFile ? (
                    <div>
                      <p className="text-xs font-bold text-emerald-900">
                        {selectedFile.name}
                      </p>
                      <p className="text-[11px] text-emerald-700 mt-0.5">
                        {(selectedFile.size / 1024).toFixed(1)} KB — Haz clic para cambiar archivo
                      </p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-xs font-semibold text-slate-700">
                        Arrastra aquí el archivo de saldos o{" "}
                        <span className="text-[#E05A10] underline">
                          selecciona un archivo Excel
                        </span>
                      </p>
                      <p className="text-[11px] text-slate-400 mt-1">
                        Admite únicamente planillas originales .xlsx y .xls de {importBanco}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Alerta de Error / Antiduplicados */}
              {importError && (
                <div className="flex items-start gap-2.5 rounded-lg border border-rose-200 bg-rose-50 p-3.5 text-xs text-rose-800">
                  <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                  <div className="font-medium leading-relaxed">{importError}</div>
                </div>
              )}

              {/* Resumen de Éxito */}
              {importSuccessInfo && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3.5 text-xs text-emerald-900 space-y-1">
                  <div className="flex items-center gap-2 font-bold text-emerald-800">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                    <span>
                      Importación exitosa ({importSuccessInfo.cartola.banco})
                    </span>
                  </div>
                  <p className="text-[11px] text-emerald-700 pl-6">
                    Cuenta: <strong className="font-mono">{importSuccessInfo.cartola.numero_cuenta}</strong> · Movimientos nuevos incorporados:{" "}
                    <strong>{importSuccessInfo.movimientosCount}</strong>
                    {Boolean(importSuccessInfo.omitidosCount && importSuccessInfo.omitidosCount > 0) && (
                      <span className="text-amber-800 font-semibold block mt-0.5">
                        ℹ️ {importSuccessInfo.omitidosCount} movimientos ya existían y fueron omitidos para evitar duplicaciones.
                      </span>
                    )}
                  </p>
                </div>
              )}

              {/* Botones del Modal */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => {
                  setIsImportModalOpen(false);
                  router.refresh();
                }}
                  disabled={isImporting}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  {importSuccessInfo ? "Cerrar" : "Cancelar"}
                </button>
                {!importSuccessInfo && (
                  <button
                    type="button"
                    onClick={handleSubmitImport}
                    disabled={isImporting || !selectedFile}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#E05A10] px-4 py-2 text-xs font-semibold text-white hover:bg-[#c84e0c] shadow-sm disabled:opacity-50"
                  >
                    {isImporting && (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    )}
                    <span>Procesar e Importar Saldos</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
