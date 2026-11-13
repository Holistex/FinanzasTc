"use client";

import React, { useState, useTransition, useRef } from "react";
import {
  UserCheck,
  Users,
  Search,
  Pencil,
  Upload,
  FileSpreadsheet,
  X,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  UserPlus,
  UserMinus,
  Download,
  Tags,
} from "lucide-react";
import * as XLSX from "xlsx";
import { MantenedorColaborador, MantenedorTipoPago } from "@/types/database.types";
import {
  getColaboradoresAction,
  upsertColaboradorAction,
  toggleColaboradorStatusAction,
  importarColaboradoresExcelAction,
  SincronizacionColaboradoresSummary,
} from "@/actions/colaboradores.actions";
import { cn, formatRutDisplay } from "@/lib/utils";
import { TiposPagoTab } from "./tipos-pago-tab";

interface MantenedorColaboradoresClientProps {
  initialData: MantenedorColaborador[];
  initialTiposPago?: MantenedorTipoPago[];
  isAdmin: boolean;
  canManage?: boolean;
}

export function MantenedorColaboradoresClient({
  initialData,
  initialTiposPago = [],
  isAdmin,
  canManage = false,
}: MantenedorColaboradoresClientProps) {
  const [activeMainTab, setActiveMainTab] = useState<"COLABORADORES" | "TIPOS_PAGO">("COLABORADORES");
  const [data, setData] = useState<MantenedorColaborador[]>(initialData);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVO" | "INACTIVO">("ALL");
  const [isPending, startTransition] = useTransition();

  // Modal de Creación / Edición Manual
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MantenedorColaborador | null>(null);
  const [formRut, setFormRut] = useState("");
  const [formNombre, setFormNombre] = useState("");
  const [formCargo, setFormCargo] = useState("");
  const [formActivo, setFormActivo] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmittingForm, setIsSubmittingForm] = useState(false);

  // Modal de Importación y Resumen de Sincronización Excel
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [syncSummary, setSyncSummary] =
    useState<SincronizacionColaboradoresSummary | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSearch = (q: string) => {
    setSearchTerm(q);
    startTransition(async () => {
      const res = await getColaboradoresAction(q);
      setData(res);
    });
  };

  const openCreateModal = () => {
    setEditingItem(null);
    setFormRut("");
    setFormNombre("");
    setFormCargo("");
    setFormActivo(true);
    setFormError(null);
    setIsFormModalOpen(true);
  };

  const openEditModal = (item: MantenedorColaborador) => {
    setEditingItem(item);
    setFormRut(formatRutDisplay(item.rut));
    setFormNombre(item.nombre);
    setFormCargo(item.cargo);
    setFormActivo(item.activo !== false);
    setFormError(null);
    setIsFormModalOpen(true);
  };

  const openImportModal = () => {
    setSelectedFile(null);
    setImportError(null);
    setSyncSummary(null);
    setIsImportModalOpen(true);
  };

  const handleToggleStatus = async (item: MantenedorColaborador) => {
    const currentStatus = item.activo !== false;
    const newStatus = !currentStatus;

    // Actualización optimista inmediata
    setData((prev) =>
      prev.map((c) =>
        c.id === item.id || c.rut === item.rut ? { ...c, activo: newStatus } : c
      )
    );

    try {
      await toggleColaboradorStatusAction(item.id, item.rut, newStatus);
    } catch {
      // Revertir en caso de error
      setData((prev) =>
        prev.map((c) =>
          c.id === item.id || c.rut === item.rut
            ? { ...c, activo: currentStatus }
            : c
        )
      );
    }
  };

  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const cleanRut = formRut.replace(/[^0-9kK]/g, "").toUpperCase();
    if (!cleanRut || cleanRut.length < 2) {
      setFormError("Debe ingresar un RUT válido (ej. 12.345.678-9).");
      return;
    }

    if (!formNombre.trim()) {
      setFormError("El Nombre completo del trabajador es obligatorio.");
      return;
    }

    if (!formCargo.trim()) {
      setFormError("El Cargo o puesto del trabajador es obligatorio.");
      return;
    }

    setIsSubmittingForm(true);
    try {
      const saved = await upsertColaboradorAction({
        id: editingItem?.id,
        rut: cleanRut,
        nombre: formNombre.trim().toUpperCase(),
        cargo: formCargo.trim().toUpperCase(),
        activo: formActivo,
      });

      setData((prev) => {
        const idx = prev.findIndex(
          (c) =>
            c.rut.replace(/[^0-9kK]/g, "").toUpperCase() === saved.rut ||
            (editingItem && c.id === editingItem.id)
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

      setIsFormModalOpen(false);
    } catch (err: any) {
      setFormError(err?.message || "Error al guardar el colaborador.");
    } finally {
      setIsSubmittingForm(false);
    }
  };

  const handleProcessExcel = async () => {
    if (!selectedFile) {
      setImportError("Seleccione un archivo Excel (.xls o .xlsx) para continuar.");
      return;
    }

    setIsImporting(true);
    setImportError(null);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      const summary = await importarColaboradoresExcelAction(formData);
      setSyncSummary(summary);
      setData(summary.colaboradores);
    } catch (err: any) {
      setImportError(
        err?.message || "Error al procesar la planilla de colaboradores."
      );
    } finally {
      setIsImporting(false);
    }
  };

  const handleDownloadTemplate = () => {
    const sampleData = [
      ["RUT", "NOMBRE", "CARGO"],
      ["12.345.678-9", "JUAN PÉREZ GONZÁLEZ", "JEFE DE OBRA"],
      ["15.987.654-K", "MARÍA SOTO CONTRERAS", "INGENIERO DE PROYECTOS"],
    ];
    const ws = XLSX.utils.aoa_to_sheet(sampleData);
    ws["!cols"] = [{ wch: 18 }, { wch: 36 }, { wch: 30 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Colaboradores");
    XLSX.writeFile(wb, "Plantilla_Colaboradores_Tensacon.xlsx");
  };

  // Filtrado en memoria por estado y término de búsqueda
  const filteredData = data.filter((item) => {
    const isActivo = item.activo !== false;
    if (statusFilter === "ACTIVO" && !isActivo) return false;
    if (statusFilter === "INACTIVO" && isActivo) return false;

    if (searchTerm.trim()) {
      const q = searchTerm.trim().toLowerCase();
      const qClean = q.replace(/[^0-9kk]/g, "");
      const formattedRut = formatRutDisplay(item.rut).toLowerCase();
      const matchesRut =
        item.rut.toLowerCase().includes(q) ||
        (qClean.length > 0 && item.rut.toLowerCase().includes(qClean)) ||
        formattedRut.includes(q);
      const matchesNombre = item.nombre.toLowerCase().includes(q);
      const matchesCargo = item.cargo.toLowerCase().includes(q);
      return matchesRut || matchesNombre || matchesCargo;
    }

    return true;
  });

  const totalRegistrados = data.length;
  const totalActivos = data.filter((d) => d.activo !== false).length;
  const totalInactivos = data.filter((d) => d.activo === false).length;

  return (
    <div className="bg-[#F8FAFC] min-h-screen space-y-5">
      {/* 1. LAYOUT GENERAL Y ENCABEZADO SUPERIOR */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="font-black text-xl text-slate-900 tracking-tight uppercase">
            {activeMainTab === "COLABORADORES"
              ? "MANTENEDOR COLABORADORES"
              : "CATÁLOGO TIPOS DE PAGO"}
          </h1>
          <span className="bg-orange-50 border border-orange-200 text-orange-600 text-xs font-semibold px-2.5 py-0.5 rounded-md">
            {activeMainTab === "COLABORADORES"
              ? "Nómina Oficial"
              : "Clasificación Tesorería"}
          </span>
        </div>

        {/* Botones de Acción Superior (Alineados a la derecha) */}
        {activeMainTab === "COLABORADORES" && canManage && (
          <div className="flex flex-wrap items-center gap-2.5">
            {isAdmin && (
              <button
                type="button"
                onClick={openImportModal}
                className="bg-[#0F172A] hover:bg-slate-800 text-white font-semibold text-xs px-4 py-2 rounded-lg flex items-center gap-2 shadow-sm transition-colors"
              >
                <FileSpreadsheet className="h-4 w-4 text-orange-400" />
                Importar Colaboradores
              </button>
            )}

            <button
              type="button"
              onClick={openCreateModal}
              className="bg-[#E05A10] hover:bg-[#c84e0c] text-white font-semibold text-xs px-4 py-2 rounded-lg flex items-center gap-2 shadow-sm transition-colors"
            >
              + Nuevo Colaborador
            </button>
          </div>
        )}
      </div>

      {/* Selector de Pestañas Principales: Colaboradores | Tipos de Pago */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
        <button
          type="button"
          onClick={() => setActiveMainTab("COLABORADORES")}
          className={cn(
            "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold transition-all",
            activeMainTab === "COLABORADORES"
              ? "bg-[#0F172A] text-white shadow-sm"
              : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
          )}
        >
          <Users className="h-3.5 w-3.5 text-[#E05A10]" />
          <span>Colaboradores ({totalRegistrados})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveMainTab("TIPOS_PAGO")}
          className={cn(
            "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold transition-all",
            activeMainTab === "TIPOS_PAGO"
              ? "bg-[#0F172A] text-white shadow-sm"
              : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
          )}
        >
          <Tags className="h-3.5 w-3.5 text-[#E05A10]" />
          <span>Tipos de Pago</span>
        </button>
      </div>

      {activeMainTab === "TIPOS_PAGO" ? (
        <TiposPagoTab initialTiposPago={initialTiposPago} />
      ) : (
        <>

      {/* 2. TARJETAS KPI SUPERIORES (FONDO BLANCO) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full mb-6">
        {/* KPI 1: TOTAL REGISTRADOS */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col justify-between">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            TOTAL REGISTRADOS
          </span>
          <span className="text-2xl font-black text-slate-900 font-mono mt-2">
            {totalRegistrados}
          </span>
          <span className="text-[11px] text-slate-400 mt-1">
            Base histórica única
          </span>
        </div>

        {/* KPI 2: COLABORADORES ACTIVOS */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              COLABORADORES ACTIVOS
            </span>
            <span className="text-xs font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
              Vigentes
            </span>
          </div>
          <span className="text-2xl font-black text-slate-900 font-mono mt-2">
            {totalActivos}
          </span>
          <span className="text-[11px] text-slate-400 mt-1">
            En última nómina activa
          </span>
        </div>

        {/* KPI 3: COLABORADORES NO ACTIVOS */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              COLABORADORES NO ACTIVOS
            </span>
            <span className="text-xs font-bold text-rose-600 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full">
              Inactivos
            </span>
          </div>
          <span className="text-2xl font-black text-slate-900 font-mono mt-2">
            {totalInactivos}
          </span>
          <span className="text-[11px] text-slate-400 mt-1">
            Fuera de nómina vigente
          </span>
        </div>
      </div>

      {/* 3. BARRA DE BÚSQUEDA Y PÍLDORAS DE FILTRO */}
      <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Buscar por RUT, Nombre o Cargo..."
            className="w-full rounded-lg border border-slate-300 bg-[#F8FAFC] pl-9 pr-8 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-[#E05A10] focus:outline-none transition-colors"
          />
          {searchTerm && !isPending && (
            <button
              type="button"
              onClick={() => handleSearch("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          {isPending && (
            <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-[#E05A10]" />
          )}
        </div>

        {/* Píldoras de Filtro */}
        <div className="inline-flex items-center gap-1 self-end sm:self-auto rounded-lg border border-slate-200 bg-[#F1F5F9] p-1">
          {(
            [
              { key: "ALL", label: `Todos (${totalRegistrados})` },
              { key: "ACTIVO", label: `Activos (${totalActivos})` },
              { key: "INACTIVO", label: `No Activos (${totalInactivos})` },
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
      </div>

      {/* 4. TABLA DE COLABORADORES (CABECERA AZUL MARINO #0B1528 Y FILAS BLANCAS) */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-[750px] lg:min-w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#0B1528] text-slate-200 text-[11px] font-bold uppercase tracking-wider border-b border-[#1E293B]">
                <th className="py-3 px-4 w-40">RUT</th>
                <th className="py-3 px-4">NOMBRE</th>
                <th className="py-3 px-4">CARGO</th>
                <th className="py-3 px-4 text-center w-40">ESTADO</th>
                <th className="py-3 px-4 text-right w-40">ACCIONES</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/80 text-xs bg-white">
              {filteredData.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Users className="h-8 w-8 text-slate-300" />
                      <p className="text-sm font-semibold text-slate-700">
                        No se encontraron colaboradores registrados
                      </p>
                      <p className="text-xs text-slate-400">
                        Utilice el botón &ldquo;Importar Colaboradores&rdquo; o &ldquo;+ Nuevo Colaborador&rdquo; para cargar la nómina.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredData.map((item) => {
                  const isActivo = item.activo !== false;
                  return (
                    <tr
                      key={item.id || item.rut}
                      className="hover:bg-slate-50/90 transition-colors"
                    >
                      {/* 1. RUT Formateado */}
                      <td className="py-3 px-4 whitespace-nowrap font-mono font-bold text-slate-900">
                        {formatRutDisplay(item.rut)}
                      </td>

                      {/* 2. NOMBRE en mayúsculas */}
                      <td className="py-3 px-4 font-bold text-slate-900 uppercase">
                        {item.nombre}
                      </td>

                      {/* 3. CARGO */}
                      <td className="py-3 px-4 font-medium text-slate-600 uppercase">
                        {item.cargo}
                      </td>

                      {/* 4. ESTADO (Badges en alto contraste con fondo blanco bg-white) */}
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        {isActivo ? (
                          <span className="inline-flex items-center gap-1.5 border border-emerald-400 text-emerald-600 bg-white font-semibold text-xs px-2.5 py-1 rounded-md shadow-sm">
                            <span className="h-2 w-2 rounded-full bg-emerald-500" />
                            Activo
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 border border-red-400 text-red-500 bg-white font-semibold text-xs px-2.5 py-1 rounded-md shadow-sm">
                            <span className="h-2 w-2 rounded-full bg-red-500" />
                            No Activo
                          </span>
                        )}
                      </td>

                      {/* 5. ACCIONES */}
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        {canManage ? (
                          <div className="inline-flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleToggleStatus(item)}
                              title={
                                isActivo
                                  ? "Cambiar a No Activo"
                                  : "Activar Colaborador"
                              }
                              className={cn(
                                "px-2.5 py-1 rounded-md text-[11px] font-semibold border transition-colors bg-white shadow-sm",
                                isActivo
                                  ? "border-slate-300 text-slate-600 hover:border-rose-400 hover:text-rose-600 hover:bg-rose-50"
                                  : "border-emerald-400 text-emerald-600 hover:bg-emerald-50"
                              )}
                            >
                              {isActivo ? "Inactivar" : "Activar"}
                            </button>

                            <button
                              type="button"
                              onClick={() => openEditModal(item)}
                              title="Editar Colaborador"
                              className="p-1.5 rounded-md border border-slate-200 bg-white text-slate-600 hover:text-[#E05A10] hover:border-orange-300 hover:bg-orange-50/50 transition-colors shadow-sm"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-400">
                            Solo lectura
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL 1: CREACIÓN / EDICIÓN MANUAL DE COLABORADOR */}
      {isFormModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="w-[95vw] sm:w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#0F172A] text-[#E05A10]">
                  <UserCheck className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    {editingItem ? "Editar Colaborador" : "Nuevo Colaborador"}
                  </h2>
                  <p className="text-xs text-slate-500">
                    {editingItem
                      ? "Actualice los datos o estado del colaborador."
                      : "Si el RUT ya existe, se actualizarán sus datos sin duplicarlo."}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsFormModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitForm} className="mt-5 space-y-4">
              {formError && (
                <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  RUT del Colaborador <span className="text-[#E05A10]">*</span>
                </label>
                <input
                  type="text"
                  value={formRut}
                  onChange={(e) => setFormRut(e.target.value)}
                  placeholder="Ej: 12.345.678-9"
                  required
                  className="w-full rounded-lg border border-slate-300 bg-[#F8FAFC] px-3 py-2 text-xs font-mono text-slate-900 placeholder-slate-400 focus:bg-white focus:border-[#E05A10] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Nombre Completo <span className="text-[#E05A10]">*</span>
                </label>
                <input
                  type="text"
                  value={formNombre}
                  onChange={(e) => setFormNombre(e.target.value.toUpperCase())}
                  placeholder="Ej: JUAN PÉREZ GONZÁLEZ"
                  required
                  className="w-full rounded-lg border border-slate-300 bg-[#F8FAFC] px-3 py-2 text-xs uppercase text-slate-900 placeholder-slate-400 focus:bg-white focus:border-[#E05A10] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Cargo / Puesto <span className="text-[#E05A10]">*</span>
                </label>
                <input
                  type="text"
                  value={formCargo}
                  onChange={(e) => setFormCargo(e.target.value.toUpperCase())}
                  placeholder="Ej: JEFE DE TERRENO"
                  required
                  className="w-full rounded-lg border border-slate-300 bg-[#F8FAFC] px-3 py-2 text-xs uppercase text-slate-900 placeholder-slate-400 focus:bg-white focus:border-[#E05A10] focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-[#F8FAFC] p-3">
                <div>
                  <div className="text-xs font-bold text-slate-800">
                    Estado del Colaborador
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Define si el trabajador se encuentra actualmente activo.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setFormActivo((prev) => !prev)}
                  className={cn(
                    "px-2.5 py-1 rounded-md text-xs font-semibold border transition-colors shadow-sm bg-white",
                    formActivo
                      ? "border-emerald-400 text-emerald-600"
                      : "border-red-400 text-red-500"
                  )}
                >
                  {formActivo ? "🟢 Activo" : "🔴 No Activo"}
                </button>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsFormModalOpen(false)}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingForm}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#E05A10] px-4 py-2 text-xs font-semibold text-white hover:bg-[#c84e0c] disabled:opacity-50 shadow-sm"
                >
                  {isSubmittingForm && (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  )}
                  {editingItem ? "Guardar Cambios" : "Guardar Colaborador"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: IMPORTACIÓN EXCEL Y RESUMEN DE SINCRONIZACIÓN POST-CARGA */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="w-[95vw] sm:w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0F172A] text-orange-400">
                  <FileSpreadsheet className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    {syncSummary
                      ? "Resumen de Sincronización de Colaboradores"
                      : "Importar y Sincronizar Nómina Excel"}
                  </h2>
                  <p className="text-xs text-slate-500">
                    {syncSummary
                      ? "Resultado del procesamiento y actualización de vigencias por RUT."
                      : "Suba una planilla Excel (.xls / .xlsx) con las columnas RUT, NOMBRE y CARGO."}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsImportModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {!syncSummary ? (
              <div className="mt-5 space-y-4">
                {importError && (
                  <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
                    <span>{importError}</span>
                  </div>
                )}

                {/* Reglas de Sincronización Explicadas */}
                <div className="rounded-xl border border-slate-200 bg-[#F8FAFC] p-4 space-y-2 text-xs text-slate-600">
                  <div className="font-bold text-slate-900 flex items-center gap-1.5">
                    <RefreshCw className="h-3.5 w-3.5 text-[#E05A10]" />
                    Reglas Automáticas de Sincronización:
                  </div>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>
                      <strong className="text-slate-900">Sin Duplicados (Upsert por RUT):</strong> Si el RUT ya existe, actualiza su nombre y cargo y lo marca como{" "}
                      <span className="text-emerald-600 font-bold">Activo</span>.
                    </li>
                    <li>
                      <strong className="text-slate-900">Nuevos Ingresos:</strong> Si el RUT no existe en la base, se agrega automáticamente con estado{" "}
                      <span className="text-emerald-600 font-bold">Activo</span>.
                    </li>
                    <li>
                      <strong className="text-slate-900">Inactivación de Ausentes:</strong> Todo colaborador registrado que{" "}
                      <span className="underline">no figure</span> en esta planilla pasará automáticamente a estado{" "}
                      <span className="text-rose-600 font-bold">No Activo</span>.
                    </li>
                  </ul>
                </div>

                {/* Selector de archivo Excel */}
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="cursor-pointer rounded-xl border-2 border-dashed border-slate-300 bg-[#F8FAFC] p-6 text-center hover:border-[#E05A10] hover:bg-orange-50/30 transition-colors"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xls,.xlsx,.csv"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0] || null;
                      setSelectedFile(file);
                      setImportError(null);
                    }}
                  />
                  <Upload className="mx-auto h-8 w-8 text-[#E05A10] mb-2" />
                  {selectedFile ? (
                    <div>
                      <p className="text-xs font-bold text-slate-900">
                        {selectedFile.name}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {(selectedFile.size / 1024).toFixed(1)} KB — Clic para cambiar archivo
                      </p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-xs font-bold text-slate-800">
                        Haga clic para seleccionar su archivo Excel (.xls / .xlsx)
                      </p>
                      <p className="text-[11px] text-slate-500 mt-1">
                        Columnas esperadas: RUT | NOMBRE | CARGO
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between pt-2">
                  <button
                    type="button"
                    onClick={handleDownloadTemplate}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#E05A10] hover:text-[#c84e0c]"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Descargar plantilla Excel de ejemplo
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsImportModalOpen(false)}
                      className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      disabled={!selectedFile || isImporting}
                      onClick={handleProcessExcel}
                      className="inline-flex items-center gap-2 rounded-lg bg-[#0F172A] px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50 shadow-sm"
                    >
                      {isImporting ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Sincronizando...
                        </>
                      ) : (
                        <>
                          <Upload className="h-3.5 w-3.5 text-orange-400" />
                          Sincronizar Nómina
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              /* Resumen de Sincronización (Modal Post-Carga) */
              <div className="mt-5 space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* X Colaboradores importados/mantenidos en estado Activo */}
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3.5">
                    <div className="flex items-center justify-between text-emerald-700">
                      <span className="text-[11px] font-bold uppercase">
                        Activos en Nómina
                      </span>
                      <CheckCircle2 className="h-4 w-4" />
                    </div>
                    <div className="mt-1.5 text-2xl font-black text-slate-900 font-mono">
                      {syncSummary.activosSincronizados}
                    </div>
                    <p className="text-[11px] text-slate-600 mt-1">
                      Colaboradores importados/mantenidos en estado{" "}
                      <strong className="text-emerald-700">Activo</strong>.
                    </p>
                  </div>

                  {/* Y Nuevos colaboradores agregados a la base */}
                  <div className="rounded-xl border border-orange-200 bg-orange-50/60 p-3.5">
                    <div className="flex items-center justify-between text-[#E05A10]">
                      <span className="text-[11px] font-bold uppercase">
                        Nuevos Agregados
                      </span>
                      <UserPlus className="h-4 w-4" />
                    </div>
                    <div className="mt-1.5 text-2xl font-black text-slate-900 font-mono">
                      {syncSummary.nuevosAgregados}
                    </div>
                    <p className="text-[11px] text-slate-600 mt-1">
                      Nuevos colaboradores incorporados a la base.
                    </p>
                  </div>

                  {/* Z Colaboradores cambiados a estado No Activo por no figurar en la planilla */}
                  <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-3.5">
                    <div className="flex items-center justify-between text-rose-600">
                      <span className="text-[11px] font-bold uppercase">
                        Pasados a No Activo
                      </span>
                      <UserMinus className="h-4 w-4" />
                    </div>
                    <div className="mt-1.5 text-2xl font-black text-slate-900 font-mono">
                      {syncSummary.pasadosANoActivo}
                    </div>
                    <p className="text-[11px] text-slate-600 mt-1">
                      Cambiados a <strong className="text-rose-600">No Activo</strong> por no figurar en la planilla.
                    </p>
                  </div>
                </div>

                {/* Detalle de Nuevos Agregados */}
                {syncSummary.detalleNuevos.length > 0 && (
                  <div className="rounded-xl border border-slate-200 bg-[#F8FAFC] p-3.5">
                    <div className="text-xs font-bold text-slate-900 mb-2">
                      Nuevos Colaboradores Incorporados ({syncSummary.detalleNuevos.length})
                    </div>
                    <div className="max-h-36 overflow-y-auto divide-y divide-slate-200 text-xs">
                      {syncSummary.detalleNuevos.map((n) => (
                        <div
                          key={n.rut}
                          className="py-1.5 flex items-center justify-between gap-2"
                        >
                          <span className="font-semibold text-slate-900 truncate">
                            {n.nombre}
                          </span>
                          <span className="font-mono text-slate-600 shrink-0">
                            {formatRutDisplay(n.rut)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Detalle de Inactivados Automáticamente */}
                {syncSummary.detalleInactivados.length > 0 && (
                  <div className="rounded-xl border border-rose-200 bg-rose-50/40 p-3.5">
                    <div className="text-xs font-bold text-rose-700 mb-2">
                      Colaboradores Cambiados a No Activo ({syncSummary.detalleInactivados.length})
                    </div>
                    <div className="max-h-36 overflow-y-auto divide-y divide-rose-200/60 text-xs">
                      {syncSummary.detalleInactivados.map((inact) => (
                        <div
                          key={inact.rut}
                          className="py-1.5 flex items-center justify-between gap-2"
                        >
                          <span className="text-slate-800 truncate">
                            {inact.nombre}
                          </span>
                          <span className="font-mono text-rose-600 font-semibold shrink-0">
                            {formatRutDisplay(inact.rut)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Errores de formato en filas (si existieran) */}
                {syncSummary.erroresFila.length > 0 && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-800">
                    <div className="font-bold mb-1">
                      Filas omitidas por formato ({syncSummary.erroresFila.length}):
                    </div>
                    <ul className="list-disc pl-4 space-y-0.5 max-h-28 overflow-y-auto">
                      {syncSummary.erroresFila.map((err, i) => (
                        <li key={i}>
                          Fila {err.fila}: {err.mensaje}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={() => {
                      setSyncSummary(null);
                      setSelectedFile(null);
                    }}
                    className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Cargar Otra Planilla
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsImportModalOpen(false)}
                    className="rounded-lg bg-[#E05A10] px-5 py-2 text-xs font-semibold text-white hover:bg-[#c84e0c] shadow-sm"
                  >
                    Finalizar y Ver Tabla
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
}
