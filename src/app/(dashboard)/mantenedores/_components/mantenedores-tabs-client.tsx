"use client";

import React, { useState, useTransition, useEffect } from "react";
import {
  TablePagination,
  GLOBAL_PAGE_SIZE,
  paginateArray,
} from "@/components/ui/TablePagination";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
import {
  Building2,
  Plus,
  Search,
  Pencil,
  Trash2,
  Landmark,
  Mail,
  User,
  X,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import {
  EmpresaConfirming,
  EmpresaFactoringCliente,
  EmpresaFactoringProveedor,
  MantenedorBanco,
} from "@/types/database.types";
import {
  getFactoringClientesAction,
  upsertFactoringClienteAction,
  deleteFactoringClienteAction,
  getFactoringProveedoresAction,
  upsertFactoringProveedorAction,
  deleteFactoringProveedorAction,
  getEmpresasConfirmingAction,
  upsertEmpresaConfirmingAction,
  deleteEmpresaConfirmingAction,
  getBancosAction,
  upsertBancoAction,
  toggleBancoStatusAction,
  deleteBancoAction,
} from "@/actions/mantenedores.actions";
import { cn, formatDateCL, formatRutDisplay } from "@/lib/utils";

interface MantenedoresTabsClientProps {
  initialClientes: EmpresaFactoringCliente[];
  initialProveedores: EmpresaFactoringProveedor[];
  initialConfirming: EmpresaConfirming[];
  initialBancos?: MantenedorBanco[];
  canManage?: boolean;
}

export function MantenedoresTabsClient({
  initialClientes,
  initialProveedores,
  initialConfirming,
  initialBancos = [],
  canManage = false,
}: MantenedoresTabsClientProps) {
  const [activeTab, setActiveTab] = useState<
    "CLIENTES" | "PROVEEDORES" | "CONFIRMING" | "BANCOS"
  >("CLIENTES");
  const [clientes, setClientes] =
    useState<EmpresaFactoringCliente[]>(initialClientes);
  const [proveedores, setProveedores] =
    useState<EmpresaFactoringProveedor[]>(initialProveedores);
  const [confirmingList, setConfirmingList] =
    useState<EmpresaConfirming[]>(initialConfirming);
  const [bancosList, setBancosList] = useState<MantenedorBanco[]>(initialBancos);

  const [searchClientes, setSearchClientes] = useState("");
  const [searchProveedores, setSearchProveedores] = useState("");
  const [searchConfirming, setSearchConfirming] = useState("");
  const [searchBancos, setSearchBancos] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    setBancosList(initialBancos);
  }, [initialBancos]);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, searchClientes, searchProveedores, searchConfirming, searchBancos]);
  const [isPending, startTransition] = useTransition();

  // Modal Cliente state
  const [isClienteModalOpen, setIsClienteModalOpen] = useState(false);
  const [editingCliente, setEditingCliente] =
    useState<EmpresaFactoringCliente | null>(null);
  const [clienteForm, setClienteForm] = useState({
    rut_cliente: "",
    razon_social: "",
    contacto_nombre: "",
    contacto_email: "",
  });

  // Modal Proveedor state
  const [isProveedorModalOpen, setIsProveedorModalOpen] = useState(false);
  const [editingProveedor, setEditingProveedor] =
    useState<EmpresaFactoringProveedor | null>(null);
  const [proveedorForm, setProveedorForm] = useState({
    rut_proveedor: "",
    razon_social: "",
  });

  // Modal Confirming state
  const [isConfirmingModalOpen, setIsConfirmingModalOpen] = useState(false);
  const [editingConfirming, setEditingConfirming] =
    useState<EmpresaConfirming | null>(null);
  const [confirmingForm, setConfirmingForm] = useState({
    rut_confirming: "",
    razon_social: "",
    contacto_nombre: "",
    contacto_email: "",
  });

  // Modal Bancos state
  const [isBancoModalOpen, setIsBancoModalOpen] = useState(false);
  const [editingBanco, setEditingBanco] = useState<MantenedorBanco | null>(null);
  const [bancoForm, setBancoForm] = useState({
    nombre: "",
    codigo_sbif: "",
    rut: "",
    activo: true,
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Handlers Bancos
  const handleSearchBancos = (q: string) => {
    setSearchBancos(q);
    startTransition(async () => {
      const updated = await getBancosAction(q);
      setBancosList(updated);
    });
  };

  const openCreateBanco = () => {
    setEditingBanco(null);
    setBancoForm({ nombre: "", codigo_sbif: "", rut: "", activo: true });
    setFormError(null);
    setIsBancoModalOpen(true);
  };

  const openEditBanco = (item: MantenedorBanco) => {
    setEditingBanco(item);
    setBancoForm({
      nombre: item.nombre,
      codigo_sbif: item.codigo_sbif || "",
      rut: item.rut ? formatRutDisplay(item.rut) : "",
      activo: item.activo !== false,
    });
    setFormError(null);
    setIsBancoModalOpen(true);
  };

  const handleSaveBanco = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setIsSubmitting(true);
    try {
      await upsertBancoAction({
        id: editingBanco?.id,
        nombre: bancoForm.nombre,
        codigo_sbif: bancoForm.codigo_sbif || null,
        rut: bancoForm.rut || null,
        activo: bancoForm.activo,
      });
      const updated = await getBancosAction(searchBancos);
      setBancosList(updated);
      setIsBancoModalOpen(false);
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Error guardando banco.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleBancoStatus = async (item: MantenedorBanco) => {
    const nextActivo = item.activo === false;
    await toggleBancoStatusAction(item.id, nextActivo);
    setBancosList((prev) =>
      prev.map((b) => (b.id === item.id ? { ...b, activo: nextActivo } : b))
    );
  };

  const handleDeleteBanco = async (id: string) => {
    if (!window.confirm("¿Eliminar este banco del catálogo?")) return;
    await deleteBancoAction(id);
    setBancosList((prev) => prev.filter((b) => b.id !== id));
  };

  // Handlers Clientes
  const handleSearchClientes = (q: string) => {
    setSearchClientes(q);
    startTransition(async () => {
      const updated = await getFactoringClientesAction(q);
      setClientes(updated);
    });
  };

  const openCreateCliente = () => {
    setEditingCliente(null);
    setClienteForm({
      rut_cliente: "",
      razon_social: "",
      contacto_nombre: "",
      contacto_email: "",
    });
    setFormError(null);
    setIsClienteModalOpen(true);
  };

  const openEditCliente = (item: EmpresaFactoringCliente) => {
    setEditingCliente(item);
    setClienteForm({
      rut_cliente: formatRutDisplay(item.rut_cliente),
      razon_social: item.razon_social,
      contacto_nombre: item.contacto_nombre || "",
      contacto_email: item.contacto_email || "",
    });
    setFormError(null);
    setIsClienteModalOpen(true);
  };

  const handleSaveCliente = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setFormError(null);
    try {
      await upsertFactoringClienteAction({
        id: editingCliente?.id,
        rut_cliente: clienteForm.rut_cliente,
        razon_social: clienteForm.razon_social,
        contacto_nombre: clienteForm.contacto_nombre || null,
        contacto_email: clienteForm.contacto_email || null,
      });
      const refreshed = await getFactoringClientesAction(searchClientes);
      setClientes(refreshed);
      setIsClienteModalOpen(false);
    } catch (err: unknown) {
      setFormError(
        err instanceof Error ? err.message : "Error al guardar registro."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteCliente = async (id: string) => {
    startTransition(async () => {
      await deleteFactoringClienteAction(id);
      const refreshed = await getFactoringClientesAction(searchClientes);
      setClientes(refreshed);
    });
  };

  // Handlers Proveedores
  const handleSearchProveedores = (q: string) => {
    setSearchProveedores(q);
    startTransition(async () => {
      const updated = await getFactoringProveedoresAction(q);
      setProveedores(updated);
    });
  };

  const openCreateProveedor = () => {
    setEditingProveedor(null);
    setProveedorForm({
      rut_proveedor: "",
      razon_social: "",
    });
    setFormError(null);
    setIsProveedorModalOpen(true);
  };

  const openEditProveedor = (item: EmpresaFactoringProveedor) => {
    setEditingProveedor(item);
    setProveedorForm({
      rut_proveedor: formatRutDisplay(item.rut_proveedor),
      razon_social: item.razon_social,
    });
    setFormError(null);
    setIsProveedorModalOpen(true);
  };

  const handleSaveProveedor = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setFormError(null);
    try {
      await upsertFactoringProveedorAction({
        id: editingProveedor?.id,
        rut_proveedor: proveedorForm.rut_proveedor,
        razon_social: proveedorForm.razon_social,
      });
      const refreshed = await getFactoringProveedoresAction(searchProveedores);
      setProveedores(refreshed);
      setIsProveedorModalOpen(false);
    } catch (err: unknown) {
      setFormError(
        err instanceof Error ? err.message : "Error al guardar proveedor."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteProveedor = async (id: string) => {
    startTransition(async () => {
      await deleteFactoringProveedorAction(id);
      const refreshed = await getFactoringProveedoresAction(searchProveedores);
      setProveedores(refreshed);
    });
  };

  // Handlers Confirming
  const handleSearchConfirming = (q: string) => {
    setSearchConfirming(q);
    startTransition(async () => {
      const updated = await getEmpresasConfirmingAction(q);
      setConfirmingList(updated);
    });
  };

  const openCreateConfirming = () => {
    setEditingConfirming(null);
    setConfirmingForm({
      rut_confirming: "",
      razon_social: "",
      contacto_nombre: "",
      contacto_email: "",
    });
    setFormError(null);
    setIsConfirmingModalOpen(true);
  };

  const openEditConfirming = (item: EmpresaConfirming) => {
    setEditingConfirming(item);
    setConfirmingForm({
      rut_confirming: formatRutDisplay(item.rut_confirming),
      razon_social: item.razon_social,
      contacto_nombre: item.contacto_nombre || "",
      contacto_email: item.contacto_email || "",
    });
    setFormError(null);
    setIsConfirmingModalOpen(true);
  };

  const handleSaveConfirming = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setFormError(null);
    try {
      await upsertEmpresaConfirmingAction({
        id: editingConfirming?.id,
        rut_confirming: confirmingForm.rut_confirming,
        razon_social: confirmingForm.razon_social,
        contacto_nombre: confirmingForm.contacto_nombre || null,
        contacto_email: confirmingForm.contacto_email || null,
      });
      const refreshed = await getEmpresasConfirmingAction(searchConfirming);
      setConfirmingList(refreshed);
      setIsConfirmingModalOpen(false);
    } catch (err: unknown) {
      setFormError(
        err instanceof Error ? err.message : "Error al guardar empresa confirming."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteConfirming = async (id: string) => {
    startTransition(async () => {
      await deleteEmpresaConfirmingAction(id);
      const refreshed = await getEmpresasConfirmingAction(searchConfirming);
      setConfirmingList(refreshed);
    });
  };

  return (
    <div className="space-y-4">
      {/* Top Header */}
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-lg bg-[#E05A10] flex items-center justify-center text-white shadow-sm">
          <Building2 className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-base font-bold tracking-tight text-[#0F172A]">
            Mantenedores de Entidades Financieras
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Administración centralizada de instituciones financieras para Factoring Clientes, Factoring Proveedores y Confirming.
          </p>
        </div>
      </div>

      {/* Tabs Navigation Component */}
      <SegmentedTabs
        ariaLabel="Vistas de mantenedores"
        activeTab={activeTab}
        onChange={setActiveTab}
        tabs={[
          {
            id: "CLIENTES",
            label: "Empresa Factoring Cliente",
            icon: Landmark,
            count: clientes.length,
          },
          {
            id: "PROVEEDORES",
            label: "Empresa Factoring Proveedores",
            icon: Building2,
            count: proveedores.length,
          },
          {
            id: "CONFIRMING",
            label: "Empresa Confirming",
            icon: ShieldCheck,
            count: confirmingList.length,
          },
          {
            id: "BANCOS",
            label: "Bancos",
            icon: Landmark,
            count: bancosList.length,
          },
        ]}
      />

      {/* =====================================================================
          PESTAÑA 1: EMPRESA FACTORING CLIENTE
      ===================================================================== */}
      {activeTab === "CLIENTES" && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar por RUT, Razón Social o Contacto..."
                value={searchClientes}
                onChange={(e) => handleSearchClientes(e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-[#F8FAFC] pl-8 pr-3 py-1.5 text-xs text-slate-800 focus:bg-white focus:border-[#E05A10] focus:outline-none"
              />
            </div>

            {canManage && (
              <button
                type="button"
                onClick={openCreateCliente}
                className="inline-flex items-center gap-1.5 rounded-md bg-[#E05A10] px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-[#C2410C] transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                Nueva Empresa Factoring Cliente
              </button>
            )}
          </div>

          <div className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
            <table className="min-w-[650px] lg:min-w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-[#F8FAFC] font-bold text-slate-600 text-[10px] uppercase tracking-wider">
                  <th className="py-2.5 px-3">RUT Factoring</th>
                  <th className="py-2.5 px-3">Razón Social</th>
                  <th className="py-2.5 px-3">Nombre Contacto</th>
                  <th className="py-2.5 px-3">Email Contacto</th>
                  <th className="py-2.5 px-3">Fecha Registro</th>
                  <th className="py-2.5 px-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {clientes.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-500">
                      No se encontraron entidades registradas.
                    </td>
                  </tr>
                ) : (
                  paginateArray(clientes, currentPage, GLOBAL_PAGE_SIZE).map((c) => (
                    <tr key={c.id} className="hover:bg-[#F8FAFC] transition-colors">
                      <td className="py-2.5 px-3 font-mono font-medium text-slate-800">
                        {formatRutDisplay(c.rut_cliente)}
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-[#0F172A]">
                        {c.razon_social}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600">
                        {c.contacto_nombre || "-"}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-600">
                        {c.contacto_email || "-"}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-500">
                        {formatDateCL(c.created_at)}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {canManage ? (
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => openEditCliente(c)}
                              title="Editar"
                              className="p-1 rounded text-slate-500 hover:text-[#0F172A] hover:bg-slate-100"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (confirm("¿Eliminar esta entidad de factoring?")) {
                                  handleDeleteCliente(c.id);
                                }
                              }}
                              title="Eliminar"
                              className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50"
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
            <TablePagination
              currentPage={currentPage}
              totalItems={clientes.length}
              pageSize={GLOBAL_PAGE_SIZE}
              onPageChange={setCurrentPage}
            />
          </div>
        </div>
      )}

      {/* =====================================================================
          PESTAÑA 2: EMPRESA FACTORING PROVEEDORES
      ===================================================================== */}
      {activeTab === "PROVEEDORES" && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar por RUT o Razón Social..."
                value={searchProveedores}
                onChange={(e) => handleSearchProveedores(e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-[#F8FAFC] pl-8 pr-3 py-1.5 text-xs text-slate-800 focus:bg-white focus:border-[#E05A10] focus:outline-none"
              />
            </div>

            {canManage && (
              <button
                type="button"
                onClick={openCreateProveedor}
                className="inline-flex items-center gap-1.5 rounded-md bg-[#E05A10] px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-[#C2410C] transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                Nueva Empresa Factoring Proveedor
              </button>
            )}
          </div>

          <div className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
            <table className="min-w-[650px] lg:min-w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-[#F8FAFC] font-bold text-slate-600 text-[10px] uppercase tracking-wider">
                  <th className="py-2.5 px-3">RUT Proveedor</th>
                  <th className="py-2.5 px-3">Razón Social</th>
                  <th className="py-2.5 px-3">Fecha Registro</th>
                  <th className="py-2.5 px-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {proveedores.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-slate-500">
                      No se encontraron proveedores factoring registrados.
                    </td>
                  </tr>
                ) : (
                  paginateArray(proveedores, currentPage, GLOBAL_PAGE_SIZE).map((p) => (
                    <tr key={p.id} className="hover:bg-[#F8FAFC] transition-colors">
                      <td className="py-2.5 px-3 font-mono font-medium text-slate-800">
                        {formatRutDisplay(p.rut_proveedor)}
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-[#0F172A]">
                        {p.razon_social}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-500">
                        {formatDateCL(p.created_at)}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {canManage ? (
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => openEditProveedor(p)}
                              title="Editar"
                              className="p-1 rounded text-slate-500 hover:text-[#0F172A] hover:bg-slate-100"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (confirm("¿Eliminar este proveedor de factoring?")) {
                                  handleDeleteProveedor(p.id);
                                }
                              }}
                              title="Eliminar"
                              className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50"
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
            <TablePagination
              currentPage={currentPage}
              totalItems={proveedores.length}
              pageSize={GLOBAL_PAGE_SIZE}
              onPageChange={setCurrentPage}
            />
          </div>
        </div>
      )}

      {/* =====================================================================
          PESTAÑA 3: EMPRESA CONFIRMING
      ===================================================================== */}
      {activeTab === "CONFIRMING" && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar por RUT, Razón Social o Contacto..."
                value={searchConfirming}
                onChange={(e) => handleSearchConfirming(e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-[#F8FAFC] pl-8 pr-3 py-1.5 text-xs text-slate-800 focus:bg-white focus:border-[#E05A10] focus:outline-none"
              />
            </div>

            {canManage && (
              <button
                type="button"
                onClick={openCreateConfirming}
                className="inline-flex items-center gap-1.5 rounded-md bg-[#E05A10] px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-[#C2410C] transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                Nueva Empresa Confirming
              </button>
            )}
          </div>

          <div className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
            <table className="min-w-[650px] lg:min-w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-[#F8FAFC] font-bold text-slate-600 text-[10px] uppercase tracking-wider">
                  <th className="py-2.5 px-3">RUT Confirming</th>
                  <th className="py-2.5 px-3">Razón Social</th>
                  <th className="py-2.5 px-3">Nombre Contacto</th>
                  <th className="py-2.5 px-3">Email Contacto</th>
                  <th className="py-2.5 px-3">Fecha Registro</th>
                  <th className="py-2.5 px-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {confirmingList.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-500">
                      No se encontraron entidades de confirming registradas.
                    </td>
                  </tr>
                ) : (
                  paginateArray(confirmingList, currentPage, GLOBAL_PAGE_SIZE).map((c) => (
                    <tr key={c.id} className="hover:bg-[#F8FAFC] transition-colors">
                      <td className="py-2.5 px-3 font-mono font-medium text-slate-800">
                        {formatRutDisplay(c.rut_confirming)}
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-[#0F172A]">
                        {c.razon_social}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600">
                        {c.contacto_nombre || "-"}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-600">
                        {c.contacto_email || "-"}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-500">
                        {formatDateCL(c.created_at)}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {canManage ? (
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => openEditConfirming(c)}
                              title="Editar"
                              className="p-1 rounded text-slate-500 hover:text-[#0F172A] hover:bg-slate-100"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (confirm("¿Eliminar esta entidad de confirming?")) {
                                  handleDeleteConfirming(c.id);
                                }
                              }}
                              title="Eliminar"
                              className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50"
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
            <TablePagination
              currentPage={currentPage}
              totalItems={confirmingList.length}
              pageSize={GLOBAL_PAGE_SIZE}
              onPageChange={setCurrentPage}
            />
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL CREAR / EDITAR: EMPRESA FACTORING CLIENTE
      ===================================================================== */}
      {isClienteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-[2px] p-4">
          <div className="bg-white border border-slate-200 rounded-lg shadow-2xl w-[95vw] sm:w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="px-5 py-3.5 bg-[#0F172A] text-white flex items-center justify-between border-b border-[#1E293B]">
              <h3 className="text-xs font-semibold">
                {editingCliente
                  ? "Editar Empresa Factoring Cliente"
                  : "Nueva Empresa Factoring Cliente"}
              </h3>
              <button
                type="button"
                onClick={() => setIsClienteModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveCliente} className="p-5 space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  RUT Cliente Factoring *
                </label>
                <input
                  type="text"
                  required
                  value={clienteForm.rut_cliente}
                  onChange={(e) =>
                    setClienteForm({
                      ...clienteForm,
                      rut_cliente: e.target.value,
                    })
                  }
                  placeholder="Ej: 76.543.210-K"
                  className="w-full rounded-md border border-slate-300 px-3 py-1.5 font-mono focus:border-[#E05A10] focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Razón Social *
                </label>
                <input
                  type="text"
                  required
                  value={clienteForm.razon_social}
                  onChange={(e) =>
                    setClienteForm({
                      ...clienteForm,
                      razon_social: e.target.value,
                    })
                  }
                  placeholder="Ej: Tanner Servicios Financieros S.A."
                  className="w-full rounded-md border border-slate-300 px-3 py-1.5 focus:border-[#E05A10] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Nombre Contacto
                  </label>
                  <input
                    type="text"
                    value={clienteForm.contacto_nombre}
                    onChange={(e) =>
                      setClienteForm({
                        ...clienteForm,
                        contacto_nombre: e.target.value,
                      })
                    }
                    placeholder="Ej: Juan Pérez"
                    className="w-full rounded-md border border-slate-300 px-3 py-1.5 focus:border-[#E05A10] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Email Contacto
                  </label>
                  <input
                    type="email"
                    value={clienteForm.contacto_email}
                    onChange={(e) =>
                      setClienteForm({
                        ...clienteForm,
                        contacto_email: e.target.value,
                      })
                    }
                    placeholder="contacto@factoring.cl"
                    className="w-full rounded-md border border-slate-300 px-3 py-1.5 font-mono focus:border-[#E05A10] focus:outline-none"
                  />
                </div>
              </div>

              {formError && (
                <div className="rounded bg-rose-50 border border-rose-200 p-2.5 text-rose-700">
                  {formError}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsClienteModalOpen(false)}
                  className="rounded-md border border-slate-300 px-3.5 py-1.5 font-medium text-slate-700 hover:bg-[#F1F5F9]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-1.5 rounded-md bg-[#E05A10] px-4 py-1.5 font-semibold text-white hover:bg-[#C2410C] disabled:opacity-50 transition-colors"
                >
                  {isSubmitting && (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  )}
                  Guardar Factoring
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL CREAR / EDITAR: EMPRESA FACTORING PROVEEDOR
      ===================================================================== */}
      {isProveedorModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-[2px] p-4">
          <div className="bg-white border border-slate-200 rounded-lg shadow-2xl w-[95vw] sm:w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="px-5 py-3.5 bg-[#0F172A] text-white flex items-center justify-between border-b border-[#1E293B]">
              <h3 className="text-xs font-semibold">
                {editingProveedor
                  ? "Editar Empresa Factoring Proveedor"
                  : "Nueva Empresa Factoring Proveedor"}
              </h3>
              <button
                type="button"
                onClick={() => setIsProveedorModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form
              onSubmit={handleSaveProveedor}
              className="p-5 space-y-3.5 text-xs"
            >
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  RUT Proveedor Factoring *
                </label>
                <input
                  type="text"
                  required
                  value={proveedorForm.rut_proveedor}
                  onChange={(e) =>
                    setProveedorForm({
                      ...proveedorForm,
                      rut_proveedor: e.target.value,
                    })
                  }
                  placeholder="Ej: 96.889.120-7"
                  className="w-full rounded-md border border-slate-300 px-3 py-1.5 font-mono focus:border-[#E05A10] focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Razón Social *
                </label>
                <input
                  type="text"
                  required
                  value={proveedorForm.razon_social}
                  onChange={(e) =>
                    setProveedorForm({
                      ...proveedorForm,
                      razon_social: e.target.value,
                    })
                  }
                  placeholder="Ej: EuroAmerica Factoring S.A."
                  className="w-full rounded-md border border-slate-300 px-3 py-1.5 focus:border-[#E05A10] focus:outline-none"
                />
              </div>

              {formError && (
                <div className="rounded bg-rose-50 border border-rose-200 p-2.5 text-rose-700">
                  {formError}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsProveedorModalOpen(false)}
                  className="rounded-md border border-slate-300 px-3.5 py-1.5 font-medium text-slate-700 hover:bg-[#F1F5F9]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-1.5 rounded-md bg-[#E05A10] px-4 py-1.5 font-semibold text-white hover:bg-[#C2410C] disabled:opacity-50 transition-colors"
                >
                  {isSubmitting && (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  )}
                  Guardar Proveedor
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL CREAR / EDITAR: EMPRESA CONFIRMING
      ===================================================================== */}
      {isConfirmingModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-[2px] p-4">
          <div className="bg-white border border-slate-200 rounded-lg shadow-2xl w-[95vw] sm:w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="px-5 py-3.5 bg-[#0F172A] text-white flex items-center justify-between border-b border-[#1E293B]">
              <h3 className="text-xs font-semibold">
                {editingConfirming
                  ? "Editar Empresa Confirming"
                  : "Nueva Empresa Confirming"}
              </h3>
              <button
                type="button"
                onClick={() => setIsConfirmingModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveConfirming} className="p-5 space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  RUT Entidad Confirming *
                </label>
                <input
                  type="text"
                  required
                  value={confirmingForm.rut_confirming}
                  onChange={(e) =>
                    setConfirmingForm({
                      ...confirmingForm,
                      rut_confirming: e.target.value,
                    })
                  }
                  placeholder="Ej: 96.812.340-5"
                  className="w-full rounded-md border border-slate-300 px-3 py-1.5 font-mono focus:border-[#E05A10] focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Razón Social *
                </label>
                <input
                  type="text"
                  required
                  value={confirmingForm.razon_social}
                  onChange={(e) =>
                    setConfirmingForm({
                      ...confirmingForm,
                      razon_social: e.target.value,
                    })
                  }
                  placeholder="Ej: BCI Confirming / Servicios Financieros"
                  className="w-full rounded-md border border-slate-300 px-3 py-1.5 focus:border-[#E05A10] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Nombre Contacto
                  </label>
                  <input
                    type="text"
                    value={confirmingForm.contacto_nombre}
                    onChange={(e) =>
                      setConfirmingForm({
                        ...confirmingForm,
                        contacto_nombre: e.target.value,
                      })
                    }
                    placeholder="Ej: Paulina Morales"
                    className="w-full rounded-md border border-slate-300 px-3 py-1.5 focus:border-[#E05A10] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Email Contacto
                  </label>
                  <input
                    type="email"
                    value={confirmingForm.contacto_email}
                    onChange={(e) =>
                      setConfirmingForm({
                        ...confirmingForm,
                        contacto_email: e.target.value,
                      })
                    }
                    placeholder="confirming@banco.cl"
                    className="w-full rounded-md border border-slate-300 px-3 py-1.5 font-mono focus:border-[#E05A10] focus:outline-none"
                  />
                </div>
              </div>

              {formError && (
                <div className="rounded bg-rose-50 border border-rose-200 p-2.5 text-rose-700">
                  {formError}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsConfirmingModalOpen(false)}
                  className="rounded-md border border-slate-300 px-3.5 py-1.5 font-medium text-slate-700 hover:bg-[#F1F5F9]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-1.5 rounded-md bg-[#E05A10] px-4 py-1.5 font-semibold text-white hover:bg-[#C2410C] disabled:opacity-50 transition-colors"
                >
                  {isSubmitting && (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  )}
                  Guardar Confirming
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================================
          PESTAÑA 4: BANCOS (mantenedor_bancos)
      ===================================================================== */}
      {activeTab === "BANCOS" && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar por Nombre, Código SBIF o RUT..."
                value={searchBancos}
                onChange={(e) => handleSearchBancos(e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-[#F8FAFC] pl-8 pr-3 py-1.5 text-xs text-slate-800 focus:bg-white focus:border-[#E05A10] focus:outline-none"
              />
            </div>

            {canManage && (
              <button
                type="button"
                onClick={openCreateBanco}
                className="inline-flex items-center gap-1.5 rounded-md bg-[#E05A10] px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-[#C2410C] transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                Nuevo Banco
              </button>
            )}
          </div>

          <div className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-[650px] lg:min-w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-[#F8FAFC] font-bold text-slate-600 text-[10px] uppercase tracking-wider">
                    <th className="py-2.5 px-3">Institución Bancaria</th>
                    <th className="py-2.5 px-3">Código SBIF</th>
                    <th className="py-2.5 px-3">RUT</th>
                    <th className="py-2.5 px-3 text-center">Estado</th>
                    <th className="py-2.5 px-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {bancosList.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-500">
                        No hay bancos registrados en el catálogo.
                      </td>
                    </tr>
                  ) : (
                    paginateArray(bancosList, currentPage, GLOBAL_PAGE_SIZE).map(
                      (b) => {
                        const isActivo = b.activo !== false;
                        return (
                          <tr
                            key={b.id}
                            className="hover:bg-slate-50 transition-colors"
                          >
                            <td className="py-2.5 px-3 font-semibold text-slate-900">
                              <div className="flex items-center gap-2">
                                <Landmark className="h-3.5 w-3.5 text-[#E05A10] shrink-0" />
                                <span>{b.nombre}</span>
                              </div>
                            </td>
                            <td className="py-2.5 px-3 font-mono text-slate-600">
                              {b.codigo_sbif || "—"}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-slate-600">
                              {b.rut ? formatRutDisplay(b.rut) : "—"}
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              {canManage ? (
                                <button
                                  type="button"
                                  onClick={() => handleToggleBancoStatus(b)}
                                  className={cn(
                                    "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold border transition-colors",
                                    isActivo
                                      ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                                      : "bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200"
                                  )}
                                >
                                  <span
                                    className={cn(
                                      "h-1.5 w-1.5 rounded-full",
                                      isActivo ? "bg-emerald-500" : "bg-slate-400"
                                    )}
                                  />
                                  {isActivo ? "ACTIVO" : "INACTIVO"}
                                </button>
                              ) : (
                                <span
                                  className={cn(
                                    "inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold border",
                                    isActivo
                                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                      : "bg-slate-100 text-slate-500 border-slate-200"
                                  )}
                                >
                                  {isActivo ? "ACTIVO" : "INACTIVO"}
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              {canManage && (
                                <div className="inline-flex items-center gap-1 justify-end">
                                  <button
                                    type="button"
                                    onClick={() => openEditBanco(b)}
                                    className="p-1.5 rounded text-slate-400 hover:text-[#E05A10] hover:bg-orange-50 transition-colors"
                                    title="Editar banco"
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteBanco(b.id)}
                                    className="p-1.5 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                                    title="Eliminar banco"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      }
                    )
                  )}
                </tbody>
              </table>
            </div>
            <TablePagination
              currentPage={currentPage}
              totalItems={bancosList.length}
              pageSize={GLOBAL_PAGE_SIZE}
              onPageChange={setCurrentPage}
            />
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL CREAR / EDITAR: BANCO
      ===================================================================== */}
      {isBancoModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-[95vw] sm:w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-lg bg-orange-50 border border-orange-200 flex items-center justify-center text-[#E05A10]">
                  <Landmark className="h-4 w-4" />
                </div>
                <h3 className="text-sm font-bold text-slate-900">
                  {editingBanco ? "Editar Institución Bancaria" : "Nuevo Banco"}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsBancoModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveBanco} className="p-5 space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Nombre del Banco <span className="text-[#E05A10]">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={bancoForm.nombre}
                  onChange={(e) =>
                    setBancoForm({ ...bancoForm, nombre: e.target.value })
                  }
                  placeholder="Ej: Banco de Chile"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-[#E05A10] focus:outline-none focus:ring-1 focus:ring-[#E05A10]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Código SBIF
                  </label>
                  <input
                    type="text"
                    value={bancoForm.codigo_sbif}
                    onChange={(e) =>
                      setBancoForm({ ...bancoForm, codigo_sbif: e.target.value })
                    }
                    placeholder="Ej: 001"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-slate-900 focus:border-[#E05A10] focus:outline-none focus:ring-1 focus:ring-[#E05A10]"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    RUT Institución
                  </label>
                  <input
                    type="text"
                    value={bancoForm.rut}
                    onChange={(e) =>
                      setBancoForm({ ...bancoForm, rut: e.target.value })
                    }
                    placeholder="Ej: 97.004.000-5"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-slate-900 focus:border-[#E05A10] focus:outline-none focus:ring-1 focus:ring-[#E05A10]"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="bancoActivo"
                  checked={bancoForm.activo}
                  onChange={(e) =>
                    setBancoForm({ ...bancoForm, activo: e.target.checked })
                  }
                  className="h-4 w-4 rounded border-slate-300 text-[#E05A10] focus:ring-[#E05A10]"
                />
                <label
                  htmlFor="bancoActivo"
                  className="text-xs font-medium text-slate-700 cursor-pointer"
                >
                  Banco activo y disponible en selectores de la plataforma
                </label>
              </div>

              {formError && (
                <div className="rounded-lg bg-rose-50 border border-rose-200 p-2.5 text-rose-700">
                  {formError}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsBancoModalOpen(false)}
                  className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#E05A10] px-4 py-2 font-bold text-white hover:bg-[#c84e0c] disabled:opacity-50 transition-colors"
                >
                  {isSubmitting && (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  )}
                  Guardar Banco
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
