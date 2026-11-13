"use client";

import React, { useState, useTransition, useEffect } from "react";
import {
  TablePagination,
  GLOBAL_PAGE_SIZE,
  paginateArray,
} from "@/components/ui/TablePagination";
import {
  Briefcase,
  Building2,
  Plus,
  Search,
  Pencil,
  Trash2,
  Mail,
  User,
  Phone,
  X,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import {
  MantenedorMandante,
  MantenedorCompania,
} from "@/types/database.types";
import {
  getMandantesAction,
  upsertMandanteAction,
  deleteMandanteAction,
  getCompaniasAction,
  upsertCompaniaAction,
  deleteCompaniaAction,
} from "@/actions/garantias-mantenedores.actions";
import { cn, formatDateCL, formatRutDisplay } from "@/lib/utils";

interface MandantesCompaniasClientProps {
  initialMandantes: MantenedorMandante[];
  initialCompanias: MantenedorCompania[];
  canManage?: boolean;
}

export function MandantesCompaniasClient({
  initialMandantes,
  initialCompanias,
  canManage = false,
}: MandantesCompaniasClientProps) {
  const [activeTab, setActiveTab] = useState<"MANDANTES" | "COMPANIAS">("MANDANTES");
  const [mandantes, setMandantes] = useState<MantenedorMandante[]>(initialMandantes);
  const [companias, setCompanias] = useState<MantenedorCompania[]>(initialCompanias);

  const [searchMandantes, setSearchMandantes] = useState("");
  const [searchCompanias, setSearchCompanias] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, searchMandantes, searchCompanias]);
  const [isPending, startTransition] = useTransition();

  // Modal Mandante state
  const [isMandanteModalOpen, setIsMandanteModalOpen] = useState(false);
  const [editingMandante, setEditingMandante] = useState<MantenedorMandante | null>(null);
  const [mandanteForm, setMandanteForm] = useState({
    rut: "",
    razon_social: "",
    contacto_nombre: "",
    contacto_email: "",
    contacto_telefono: "",
  });

  // Modal Compañía state
  const [isCompaniaModalOpen, setIsCompaniaModalOpen] = useState(false);
  const [editingCompania, setEditingCompania] = useState<MantenedorCompania | null>(null);
  const [companiaForm, setCompaniaForm] = useState({
    rut: "",
    razon_social: "",
    contacto_nombre: "",
    contacto_email: "",
    contacto_telefono: "",
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Mandante handlers
  const handleSearchMandantes = (q: string) => {
    setSearchMandantes(q);
    startTransition(async () => {
      const res = await getMandantesAction(q);
      setMandantes(res);
    });
  };

  const openCreateMandante = () => {
    setEditingMandante(null);
    setMandanteForm({
      rut: "",
      razon_social: "",
      contacto_nombre: "",
      contacto_email: "",
      contacto_telefono: "",
    });
    setFormError(null);
    setIsMandanteModalOpen(true);
  };

  const openEditMandante = (item: MantenedorMandante) => {
    setEditingMandante(item);
    setMandanteForm({
      rut: formatRutDisplay(item.rut || item.rut_mandante || ""),
      razon_social: item.razon_social,
      contacto_nombre: item.contacto_nombre || "",
      contacto_email: item.contacto_email || "",
      contacto_telefono: item.contacto_telefono || "",
    });
    setFormError(null);
    setIsMandanteModalOpen(true);
  };

  const handleSaveMandante = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setIsSubmitting(true);
    try {
      await upsertMandanteAction({
        id: editingMandante?.id,
        rut: mandanteForm.rut,
        razon_social: mandanteForm.razon_social,
        contacto_nombre: mandanteForm.contacto_nombre || null,
        contacto_email: mandanteForm.contacto_email || null,
        contacto_telefono: mandanteForm.contacto_telefono || null,
      });

      const updated = await getMandantesAction(searchMandantes);
      setMandantes(updated);
      setIsMandanteModalOpen(false);
    } catch (err: any) {
      setFormError(err.message || "Error al guardar el Mandante.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteMandante = async (item: MantenedorMandante) => {
    if (
      !confirm(
        `¿Confirmas la eliminación del mandante "${item.razon_social}" (${item.rut || item.rut_mandante || ""})?`
      )
    ) {
      return;
    }
    try {
      await deleteMandanteAction(item.id);
      setMandantes((prev) => prev.filter((m) => m.id !== item.id));
    } catch (err: any) {
      alert(err.message || "Error eliminando el Mandante.");
    }
  };

  // Compañía handlers
  const handleSearchCompanias = (q: string) => {
    setSearchCompanias(q);
    startTransition(async () => {
      const res = await getCompaniasAction(q);
      setCompanias(res);
    });
  };

  const openCreateCompania = () => {
    setEditingCompania(null);
    setCompaniaForm({
      rut: "",
      razon_social: "",
      contacto_nombre: "",
      contacto_email: "",
      contacto_telefono: "",
    });
    setFormError(null);
    setIsCompaniaModalOpen(true);
  };

  const openEditCompania = (item: MantenedorCompania) => {
    setEditingCompania(item);
    setCompaniaForm({
      rut: formatRutDisplay(item.rut || item.rut_compania || ""),
      razon_social: item.razon_social,
      contacto_nombre: item.contacto_nombre || "",
      contacto_email: item.contacto_email || "",
      contacto_telefono: item.contacto_telefono || "",
    });
    setFormError(null);
    setIsCompaniaModalOpen(true);
  };

  const handleSaveCompania = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setIsSubmitting(true);
    try {
      await upsertCompaniaAction({
        id: editingCompania?.id,
        rut: companiaForm.rut,
        razon_social: companiaForm.razon_social,
        contacto_nombre: companiaForm.contacto_nombre || null,
        contacto_email: companiaForm.contacto_email || null,
        contacto_telefono: companiaForm.contacto_telefono || null,
      });

      const updated = await getCompaniasAction(searchCompanias);
      setCompanias(updated);
      setIsCompaniaModalOpen(false);
    } catch (err: any) {
      setFormError(err.message || "Error al guardar la Compañía.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteCompania = async (item: MantenedorCompania) => {
    if (
      !confirm(
        `¿Confirmas la eliminación de la compañía/banco "${item.razon_social}" (${item.rut || item.rut_compania || ""})?`
      )
    ) {
      return;
    }
    try {
      await deleteCompaniaAction(item.id);
      setCompanias((prev) => prev.filter((c) => c.id !== item.id));
    } catch (err: any) {
      alert(err.message || "Error eliminando la Compañía.");
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Encabezado Principal */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-[#0F172A] text-[#E05A10] flex items-center justify-center shadow-sm">
            <Briefcase className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
              Mantenedor: Mandantes & Compañías
            </h1>
            <p className="text-xs text-slate-500">
              Catálogo oficial de entidades involucradas en Boletas de Garantía y Pólizas de Seguro.
            </p>
          </div>
        </div>

        {canManage && (
          <div className="flex items-center gap-2">
            {activeTab === "MANDANTES" ? (
              <button
                onClick={openCreateMandante}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-[#E05A10] text-white text-xs font-semibold hover:bg-[#c94e0d] transition-colors shadow-sm"
              >
                <Plus className="h-4 w-4" />
                Nuevo Mandante
              </button>
            ) : (
              <button
                onClick={openCreateCompania}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-[#E05A10] text-white text-xs font-semibold hover:bg-[#c94e0d] transition-colors shadow-sm"
              >
                <Plus className="h-4 w-4" />
                Nueva Compañía / Banco
              </button>
            )}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 space-x-2">
        <button
          onClick={() => setActiveTab("MANDANTES")}
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors",
            activeTab === "MANDANTES"
              ? "border-[#E05A10] text-[#E05A10] bg-orange-50/50"
              : "border-transparent text-slate-500 hover:text-slate-800"
          )}
        >
          <Building2 className="h-4 w-4" />
          Mandantes / Clientes de Obra
          <span className="ml-1.5 px-2 py-0.5 rounded-full text-[10px] bg-slate-100 text-slate-700 border border-slate-200 font-mono">
            {mandantes.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab("COMPANIAS")}
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors",
            activeTab === "COMPANIAS"
              ? "border-[#E05A10] text-[#E05A10] bg-orange-50/50"
              : "border-transparent text-slate-500 hover:text-slate-800"
          )}
        >
          <ShieldCheck className="h-4 w-4" />
          Compañías Aseguradoras / Bancos Emisores
          <span className="ml-1.5 px-2 py-0.5 rounded-full text-[10px] bg-slate-100 text-slate-700 border border-slate-200 font-mono">
            {companias.length}
          </span>
        </button>
      </div>

      {/* TAB 1: MANDANTES */}
      {activeTab === "MANDANTES" && (
        <div className="space-y-4">
          {/* Barra de Búsqueda */}
          <div className="flex items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar mandante por RUT, razón social o contacto..."
                value={searchMandantes}
                onChange={(e) => handleSearchMandantes(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E05A10]/20 focus:border-[#E05A10] bg-white"
              />
            </div>
            {isPending && (
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Actualizando...
              </div>
            )}
          </div>

          {/* Tabla de Mandantes */}
          <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-[700px] lg:min-w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[11px]">
                    <th className="py-3 px-4">RUT</th>
                    <th className="py-3 px-4">Razón Social Mandante</th>
                    <th className="py-3 px-4">Contacto</th>
                    <th className="py-3 px-4">Email</th>
                    <th className="py-3 px-4">Teléfono</th>
                    <th className="py-3 px-4">Fecha Creación</th>
                    <th className="py-3 px-4 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {mandantes.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-8 text-slate-400 text-xs">
                        No se encontraron registros de Mandantes.
                      </td>
                    </tr>
                  ) : (
                    paginateArray(mandantes, currentPage, GLOBAL_PAGE_SIZE).map((m) => (
                      <tr key={m.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-slate-800 whitespace-nowrap">
                          {formatRutDisplay(m.rut || m.rut_mandante || "")}
                        </td>
                        <td className="py-3 px-4 font-semibold text-slate-900 max-w-xs truncate">
                          {m.razon_social}
                        </td>
                        <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                          {m.contacto_nombre ? (
                            <div className="flex items-center gap-1.5">
                              <User className="h-3.5 w-3.5 text-slate-400" />
                              <span>{m.contacto_nombre}</span>
                            </div>
                          ) : (
                            <span className="text-slate-300 italic">—</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                          {m.contacto_email ? (
                            <div className="flex items-center gap-1.5">
                              <Mail className="h-3.5 w-3.5 text-slate-400" />
                              <a
                                href={`mailto:${m.contacto_email}`}
                                className="text-blue-600 hover:underline"
                              >
                                {m.contacto_email}
                              </a>
                            </div>
                          ) : (
                            <span className="text-slate-300 italic">—</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                          {m.contacto_telefono ? (
                            <div className="flex items-center gap-1.5 font-mono">
                              <Phone className="h-3.5 w-3.5 text-slate-400" />
                              <span>{m.contacto_telefono}</span>
                            </div>
                          ) : (
                            <span className="text-slate-300 italic">—</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-slate-500 whitespace-nowrap font-mono">
                          {formatDateCL(m.created_at)}
                        </td>
                        <td className="py-3 px-4 text-center whitespace-nowrap">
                          {canManage ? (
                            <div className="flex items-center justify-center gap-1">
                              <button
                                onClick={() => openEditMandante(m)}
                                className="p-1.5 rounded hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition-colors"
                                title="Editar mandante"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteMandante(m)}
                                className="p-1.5 rounded hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors"
                                title="Eliminar mandante"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ) : (
                            <span className="text-[11px] text-slate-400">
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
              totalItems={mandantes.length}
              pageSize={GLOBAL_PAGE_SIZE}
              onPageChange={setCurrentPage}
            />
          </div>
        </div>
      )}

      {/* TAB 2: COMPAÑÍAS */}
      {activeTab === "COMPANIAS" && (
        <div className="space-y-4">
          {/* Barra de Búsqueda */}
          <div className="flex items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar aseguradora o banco por RUT, nombre o contacto..."
                value={searchCompanias}
                onChange={(e) => handleSearchCompanias(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E05A10]/20 focus:border-[#E05A10] bg-white"
              />
            </div>
            {isPending && (
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Actualizando...
              </div>
            )}
          </div>

          {/* Tabla de Compañías */}
          <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-[700px] lg:min-w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[11px]">
                    <th className="py-3 px-4">RUT</th>
                    <th className="py-3 px-4">Compañía Aseguradora / Banco</th>
                    <th className="py-3 px-4">Ejecutivo / Contacto</th>
                    <th className="py-3 px-4">Email</th>
                    <th className="py-3 px-4">Teléfono</th>
                    <th className="py-3 px-4">Fecha Creación</th>
                    <th className="py-3 px-4 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {companias.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-8 text-slate-400 text-xs">
                        No se encontraron registros de Compañías Aseguradoras o Bancos.
                      </td>
                    </tr>
                  ) : (
                    paginateArray(companias, currentPage, GLOBAL_PAGE_SIZE).map((c) => (
                      <tr key={c.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-slate-800 whitespace-nowrap">
                          {formatRutDisplay(c.rut || c.rut_compania || "")}
                        </td>
                        <td className="py-3 px-4 font-semibold text-slate-900 max-w-xs truncate">
                          {c.razon_social}
                        </td>
                        <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                          {c.contacto_nombre ? (
                            <div className="flex items-center gap-1.5">
                              <User className="h-3.5 w-3.5 text-slate-400" />
                              <span>{c.contacto_nombre}</span>
                            </div>
                          ) : (
                            <span className="text-slate-300 italic">—</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                          {c.contacto_email ? (
                            <div className="flex items-center gap-1.5">
                              <Mail className="h-3.5 w-3.5 text-slate-400" />
                              <a
                                href={`mailto:${c.contacto_email}`}
                                className="text-blue-600 hover:underline"
                              >
                                {c.contacto_email}
                              </a>
                            </div>
                          ) : (
                            <span className="text-slate-300 italic">—</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                          {c.contacto_telefono ? (
                            <div className="flex items-center gap-1.5 font-mono">
                              <Phone className="h-3.5 w-3.5 text-slate-400" />
                              <span>{c.contacto_telefono}</span>
                            </div>
                          ) : (
                            <span className="text-slate-300 italic">—</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-slate-500 whitespace-nowrap font-mono">
                          {formatDateCL(c.created_at)}
                        </td>
                        <td className="py-3 px-4 text-center whitespace-nowrap">
                          {canManage ? (
                            <div className="flex items-center justify-center gap-1">
                              <button
                                onClick={() => openEditCompania(c)}
                                className="p-1.5 rounded hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition-colors"
                                title="Editar compañía"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteCompania(c)}
                                className="p-1.5 rounded hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors"
                                title="Eliminar compañía"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ) : (
                            <span className="text-[11px] text-slate-400">
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
              totalItems={companias.length}
              pageSize={GLOBAL_PAGE_SIZE}
              onPageChange={setCurrentPage}
            />
          </div>
        </div>
      )}

      {/* MODAL MANDANTE (CREAR / EDITAR) */}
      {isMandanteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="w-[95vw] sm:w-full max-w-lg max-h-[90vh] overflow-y-auto bg-white rounded-xl shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/60">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded bg-orange-100 text-[#E05A10] flex items-center justify-center">
                  <Building2 className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    {editingMandante ? "Editar Mandante" : "Nuevo Mandante"}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Entidad contratante o beneficiaria de la garantía.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsMandanteModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-md"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveMandante} className="p-6 space-y-4">
              {formError && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs font-medium">
                  {formError}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  RUT Mandante <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="ej. 61.201.000-0"
                  value={mandanteForm.rut}
                  onChange={(e) =>
                    setMandanteForm((prev) => ({ ...prev, rut: e.target.value }))
                  }
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E05A10]/20 focus:border-[#E05A10] font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Razón Social Mandante <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="ej. MINISTERIO DE OBRAS PÚBLICAS"
                  value={mandanteForm.razon_social}
                  onChange={(e) =>
                    setMandanteForm((prev) => ({
                      ...prev,
                      razon_social: e.target.value,
                    }))
                  }
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E05A10]/20 focus:border-[#E05A10]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Nombre Contacto / Contraparte
                </label>
                <input
                  type="text"
                  placeholder="ej. Juan Pérez"
                  value={mandanteForm.contacto_nombre}
                  onChange={(e) =>
                    setMandanteForm((prev) => ({
                      ...prev,
                      contacto_nombre: e.target.value,
                    }))
                  }
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E05A10]/20 focus:border-[#E05A10]"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Email Contacto
                  </label>
                  <input
                    type="email"
                    placeholder="contacto@mop.gov.cl"
                    value={mandanteForm.contacto_email}
                    onChange={(e) =>
                      setMandanteForm((prev) => ({
                        ...prev,
                        contacto_email: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E05A10]/20 focus:border-[#E05A10]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Teléfono Contacto
                  </label>
                  <input
                    type="text"
                    placeholder="+56 2 2449 0000"
                    value={mandanteForm.contacto_telefono}
                    onChange={(e) =>
                      setMandanteForm((prev) => ({
                        ...prev,
                        contacto_telefono: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E05A10]/20 focus:border-[#E05A10] font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsMandanteModalOpen(false)}
                  className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[#E05A10] hover:bg-[#c94e0d] rounded-lg transition-colors shadow-sm disabled:opacity-50"
                >
                  {isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {editingMandante ? "Actualizar" : "Guardar Mandante"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL COMPAÑÍA (CREAR / EDITAR) */}
      {isCompaniaModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="w-[95vw] sm:w-full max-w-lg max-h-[90vh] overflow-y-auto bg-white rounded-xl shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/60">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded bg-orange-100 text-[#E05A10] flex items-center justify-center">
                  <ShieldCheck className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    {editingCompania
                      ? "Editar Compañía / Banco"
                      : "Nueva Compañía / Banco"}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Aseguradora o entidad bancaria emisora del documento de garantía.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsCompaniaModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-md"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveCompania} className="p-6 space-y-4">
              {formError && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs font-medium">
                  {formError}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  RUT Entidad Emisora <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="ej. 96.792.000-8"
                  value={companiaForm.rut}
                  onChange={(e) =>
                    setCompaniaForm((prev) => ({ ...prev, rut: e.target.value }))
                  }
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E05A10]/20 focus:border-[#E05A10] font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Razón Social Aseguradora o Banco <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="ej. HDI SEGUROS DE GARANTÍA Y CRÉDITO S.A."
                  value={companiaForm.razon_social}
                  onChange={(e) =>
                    setCompaniaForm((prev) => ({
                      ...prev,
                      razon_social: e.target.value,
                    }))
                  }
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E05A10]/20 focus:border-[#E05A10]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Ejecutivo de Cuentas / Contacto
                </label>
                <input
                  type="text"
                  placeholder="ej. Rodrigo Valenzuela"
                  value={companiaForm.contacto_nombre}
                  onChange={(e) =>
                    setCompaniaForm((prev) => ({
                      ...prev,
                      contacto_nombre: e.target.value,
                    }))
                  }
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E05A10]/20 focus:border-[#E05A10]"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Email Contacto
                  </label>
                  <input
                    type="email"
                    placeholder="garantias@hdi.cl"
                    value={companiaForm.contacto_email}
                    onChange={(e) =>
                      setCompaniaForm((prev) => ({
                        ...prev,
                        contacto_email: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E05A10]/20 focus:border-[#E05A10]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Teléfono Contacto
                  </label>
                  <input
                    type="text"
                    placeholder="+56 2 2384 3000"
                    value={companiaForm.contacto_telefono}
                    onChange={(e) =>
                      setCompaniaForm((prev) => ({
                        ...prev,
                        contacto_telefono: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E05A10]/20 focus:border-[#E05A10] font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCompaniaModalOpen(false)}
                  className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[#E05A10] hover:bg-[#c94e0d] rounded-lg transition-colors shadow-sm disabled:opacity-50"
                >
                  {isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {editingCompania ? "Actualizar" : "Guardar Compañía"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
