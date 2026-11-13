"use client";

import React, { useMemo, useState, useTransition, useEffect } from "react";
import {
  TablePagination,
  GLOBAL_PAGE_SIZE,
  paginateArray,
} from "@/components/ui/TablePagination";
import {
  AlertTriangle,
  CheckCircle2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Shield,
  ShieldCheck,
  Trash2,
  X,
  Loader2,
} from "lucide-react";
import {
  MODULOS_SISTEMA_FINANZAS,
  MODULES_LIST,
  ModuloSistema,
  NivelPermiso,
  buildNormalizedPermisosMatrix,
  PerfilUsuario,
} from "@/types/database.types";
import {
  savePerfilAction,
  deletePerfilAction,
  getPerfilesAction,
} from "@/actions/configuracion.actions";
import { cn } from "@/lib/utils";

// Formatea fecha a DD-MM-YYYY
function formatearFecha(fechaStr: string | null | undefined): string {
  if (!fechaStr) return "-";
  const clean = fechaStr.split("T")[0];
  const parts = clean.split("-");
  if (parts.length === 3) {
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  const d = new Date(fechaStr);
  if (isNaN(d.getTime())) return "-";
  const dia = String(d.getDate()).padStart(2, "0");
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const anio = d.getFullYear();
  return `${dia}-${mes}-${anio}`;
}

interface PerfilesViewProps {
  initialPerfiles: PerfilUsuario[];
  canManage?: boolean;
}

export function PerfilesView({
  initialPerfiles,
  canManage = false,
}: PerfilesViewProps) {
  const [perfiles, setPerfiles] = useState<PerfilUsuario[]>(initialPerfiles);
  const [cargando, setCargando] = useState(false);
  const [filtro, setFiltro] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    setCurrentPage(1);
  }, [filtro]);
  const [toast, setToast] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  // Modal de Crear / Editar
  const [modalAbierto, setModalAbierto] = useState(false);
  const [editandoPerfil, setEditandoPerfil] = useState<PerfilUsuario | null>(null);
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [permisos, setPermisos] = useState<Record<string, NivelPermiso>>({});
  const [formError, setFormError] = useState<string | null>(null);

  // Modal de Confirmación de Eliminación
  const [perfilAEliminar, setPerfilAEliminar] = useState<PerfilUsuario | null>(null);
  const [eliminando, setEliminando] = useState(false);

  // Auto-ocultar toast
  React.useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  // Recarga de datos
  const handleRecargar = () => {
    setCargando(true);
    startTransition(async () => {
      try {
        const data = await getPerfilesAction();
        setPerfiles(data);
        setToast({ tipo: "ok", texto: "Listado de perfiles actualizado." });
      } catch {
        setToast({ tipo: "error", texto: "Error al actualizar perfiles." });
      } finally {
        setCargando(false);
      }
    });
  };

  // Agrupar módulos por categoría preservando el orden del catálogo
  const modulosPorCategoria = useMemo(() => {
    const grupos: Array<{ categoria: string; items: ModuloSistema[] }> = [];
    for (const mod of MODULES_LIST) {
      let grupo = grupos.find((g) => g.categoria === mod.categoria);
      if (!grupo) {
        grupo = { categoria: mod.categoria, items: [] };
        grupos.push(grupo);
      }
      grupo.items.push(mod);
    }
    return grupos;
  }, []);

  // Abrir modal de creación
  const abrirCrear = () => {
    setEditandoPerfil(null);
    setNombre("");
    setDescripcion("");
    const defaultPerms: Record<string, NivelPermiso> = {};
    for (const m of MODULES_LIST) {
      defaultPerms[m.id] = "SIN_ACCESO";
    }
    setPermisos(defaultPerms);
    setFormError(null);
    setModalAbierto(true);
  };

  // Abrir modal de edición
  const abrirEditar = (p: PerfilUsuario) => {
    setEditandoPerfil(p);
    setNombre(p.nombre_perfil);
    setDescripcion(p.descripcion || "");
    setPermisos(buildNormalizedPermisosMatrix(p.permisos as Record<string, string>));
    setFormError(null);
    setModalAbierto(true);
  };

  // Cambiar permiso de un módulo específico
  const cambiarPermiso = (moduloId: string, nivel: NivelPermiso) => {
    setPermisos((prev) => ({
      ...prev,
      [moduloId]: nivel,
    }));
  };

  // Asignar masivamente a todos los módulos
  const setAllPermisos = (nivel: NivelPermiso) => {
    const next: Record<string, NivelPermiso> = {};
    for (const m of MODULES_LIST) {
      next[m.id] = nivel;
    }
    setPermisos(next);
  };

  // Guardar perfil
  const handleGuardar = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const nombreLimpio = nombre.trim().toUpperCase();

    if (!nombreLimpio) {
      setFormError("El nombre del perfil es obligatorio.");
      return;
    }

    startTransition(async () => {
      try {
        const saved = await savePerfilAction({
          id: editandoPerfil?.id,
          nombre_perfil: nombreLimpio,
          descripcion: descripcion.trim() || null,
          permisos,
        });

        setPerfiles((prev) => {
          if (editandoPerfil) {
            return prev.map((item) => (item.id === saved.id ? saved : item));
          }
          return [...prev, saved];
        });

        setToast({
          tipo: "ok",
          texto: `Perfil "${nombreLimpio}" y matriz de permisos guardados correctamente.`,
        });
        setModalAbierto(false);
      } catch (err) {
        setFormError(err instanceof Error ? err.message : "Error al guardar perfil.");
      }
    });
  };

  // Confirmar eliminación
  const handleEliminarConfirmado = () => {
    if (!perfilAEliminar) return;
    if (perfilAEliminar.nombre_perfil === "ADMINISTRADOR") {
      setToast({
        tipo: "error",
        texto: "No se puede eliminar el perfil principal ADMINISTRADOR.",
      });
      setPerfilAEliminar(null);
      return;
    }

    setEliminando(true);
    startTransition(async () => {
      try {
        await deletePerfilAction(perfilAEliminar.id);
        setPerfiles((prev) => prev.filter((p) => p.id !== perfilAEliminar.id));
        setToast({
          tipo: "ok",
          texto: `Perfil "${perfilAEliminar.nombre_perfil}" eliminado.`,
        });
        setPerfilAEliminar(null);
      } catch (err) {
        setToast({
          tipo: "error",
          texto: err instanceof Error ? err.message : "Error al eliminar perfil.",
        });
      } finally {
        setEliminando(false);
      }
    });
  };

  // Filtrado de perfiles
  const perfilesFiltrados = useMemo(() => {
    const q = filtro.trim().toLowerCase();
    if (!q) return perfiles;
    return perfiles.filter((p) => {
      const nom = (p.nombre_perfil || "").toLowerCase();
      const desc = (p.descripcion || "").toLowerCase();
      return nom.includes(q) || desc.includes(q);
    });
  }, [perfiles, filtro]);

  return (
    <div className="space-y-5">
      {/* Toast Flotante */}
      {toast && (
        <div
          role="status"
          className={cn(
            "fixed right-4 top-4 z-50 flex items-center gap-3 rounded-lg border px-4 py-3 text-xs font-semibold shadow-xl transition-all animate-in fade-in slide-in-from-top-3",
            toast.tipo === "ok"
              ? "border-emerald-300 bg-emerald-50 text-emerald-900"
              : "border-red-300 bg-red-50 text-red-900"
          )}
        >
          {toast.tipo === "ok" ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
          )}
          <span>{toast.texto}</span>
          <button
            aria-label="Cerrar notificación"
            onClick={() => setToast(null)}
            className="ml-2 rounded p-0.5 hover:opacity-75"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Header de la Pantalla */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#E05A10] text-white shadow-md shadow-[#E05A10]/20 shrink-0">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              Administración de Perfiles
            </h1>
            <p className="text-xs sm:text-sm text-slate-500">
              Cree perfiles de acceso y configure los permisos de lectura o gestión para cada módulo del sistema.
            </p>
          </div>
        </div>

        {canManage && (
          <button
            type="button"
            onClick={abrirCrear}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#E05A10] hover:bg-[#C2410C] px-4 py-2 text-xs font-bold text-white shadow-md shadow-[#E05A10]/20 transition-all active:scale-[0.98]"
          >
            <Plus className="h-4 w-4" />
            + Crear Nuevo Perfil
          </button>
        )}
      </div>

      {/* Tarjeta de Lista y Tabla */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        {/* Barra de Filtros y Búsqueda */}
        <div className="flex flex-col gap-3 border-b border-slate-200 p-3 sm:flex-row sm:items-center sm:justify-between bg-slate-50/70">
          <div className="relative flex-1 sm:max-w-md">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por nombre de perfil o descripción…"
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              className="h-9 w-full rounded-md border border-slate-300 bg-white pl-8 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-[#E05A10] focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleRecargar}
              disabled={cargando}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", cargando && "animate-spin")} />
              Actualizar
            </button>
          </div>
        </div>

        {/* Tabla de Perfiles */}
        <div className="overflow-x-auto">
          <table className="min-w-[750px] lg:min-w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-600 text-[11px] uppercase font-semibold">
              <tr>
                <th className="py-3 px-4 w-[190px]">Perfil</th>
                <th className="px-4 w-[240px]">Descripción</th>
                <th className="px-4">Módulos Permitidos</th>
                <th className="px-4 text-center w-[130px]">Fecha Creación</th>
                <th className="px-4 text-right w-[140px]">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginateArray(perfilesFiltrados, currentPage, GLOBAL_PAGE_SIZE).map((p) => {
                const nombre = p.nombre_perfil || "PERFIL";
                const esAdmin = nombre === "ADMINISTRADOR";

                // Contar módulos permitidos
                const normalizedMap = buildNormalizedPermisosMatrix(
                  p.permisos as Record<string, string>
                );
                const modulosConPermiso = MODULOS_SISTEMA_FINANZAS.map((m) => ({
                  modulo: m,
                  nivel: normalizedMap[m.id] || "SIN_ACCESO",
                })).filter((item) => item.nivel !== "SIN_ACCESO");

                return (
                  <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                    {/* 1. PERFIL */}
                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-orange-50 text-[#E05A10] font-bold text-xs border border-orange-200 shrink-0">
                          <Shield className="h-3.5 w-3.5" />
                        </span>
                        <span className="font-bold text-slate-900 tracking-wide">
                          {nombre}
                        </span>
                      </div>
                    </td>

                    {/* 2. DESCRIPCIÓN */}
                    <td className="px-4 text-slate-600 max-w-xs">
                      {p.descripcion || <span className="italic text-slate-400">Sin descripción</span>}
                    </td>

                    {/* 3. MÓDULOS PERMITIDOS */}
                    <td className="px-4 py-2">
                      <div className="flex flex-wrap gap-1.5 max-w-xl">
                        {modulosConPermiso.map(({ modulo, nivel }) => {
                          const esGestion = nivel === "GESTION";
                          return (
                            <span
                              key={modulo.id}
                              className={cn(
                                "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold border",
                                esGestion
                                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                                  : "border-amber-200 bg-amber-50 text-amber-800"
                              )}
                              title={`${modulo.nombre}: ${esGestion ? "Gestión Total" : "Solo Lectura"}`}
                            >
                              <span
                                className={cn(
                                  "h-1.5 w-1.5 rounded-full shrink-0",
                                  esGestion ? "bg-emerald-500" : "bg-amber-500"
                                )}
                              />
                              {modulo.nombre} ({esGestion ? "Gestión" : "Lectura"})
                            </span>
                          );
                        })}
                        {modulosConPermiso.length === 0 && (
                          <span className="text-[11px] text-red-600 font-medium">
                            Sin módulos permitidos
                          </span>
                        )}
                      </div>
                    </td>

                    {/* 4. FECHA CREACIÓN */}
                    <td className="px-4 text-center font-mono text-xs text-slate-600 whitespace-nowrap">
                      {formatearFecha(p.created_at)}
                    </td>

                    {/* 5. ACCIONES */}
                    <td className="px-4 text-right whitespace-nowrap">
                      {canManage ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => abrirEditar(p)}
                            className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                          >
                            <Pencil className="h-3 w-3 text-slate-500" />
                            Editar
                          </button>
                          <button
                            type="button"
                            disabled={esAdmin}
                            onClick={() => setPerfilAEliminar(p)}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-300 bg-white text-red-600 hover:bg-red-50 hover:text-red-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                            title={esAdmin ? "No se puede eliminar el perfil ADMINISTRADOR" : "Eliminar perfil"}
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
                );
              })}

              {perfilesFiltrados.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-500">
                    {filtro ? "No se encontraron perfiles con ese criterio." : "No hay perfiles registrados."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <TablePagination
          currentPage={currentPage}
          totalItems={perfilesFiltrados.length}
          pageSize={GLOBAL_PAGE_SIZE}
          onPageChange={setCurrentPage}
        />
      </div>

      {/* ========================================================================= */}
      {/* MODAL DE CREACIÓN / EDICIÓN Y MATRIZ DE PERMISOS                          */}
      {/* ========================================================================= */}
      {modalAbierto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-[95vw] sm:w-full max-w-3xl rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Header del Modal */}
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#E05A10] text-white shadow-sm">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {editandoPerfil ? `Editar Perfil: ${editandoPerfil.nombre_perfil}` : "Crear Nuevo Perfil"}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Configure el nombre del perfil y asigne la matriz de permisos por módulo.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalAbierto(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Formulario con Scroll */}
            <form onSubmit={handleGuardar} className="flex-1 overflow-y-auto p-6 space-y-5">
              {formError && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                  {formError}
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Nombre del Perfil *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: BODEGA o SUPERVISOR"
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value.toUpperCase())}
                    className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold uppercase tracking-wider text-slate-900 focus:border-[#E05A10] focus:outline-none focus:ring-1 focus:ring-[#E05A10]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Descripción del Perfil
                  </label>
                  <input
                    type="text"
                    placeholder="Explicación del rol y responsabilidades"
                    value={descripcion}
                    onChange={(e) => setDescripcion(e.target.value)}
                    className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-900 focus:border-[#E05A10] focus:outline-none focus:ring-1 focus:ring-[#E05A10]"
                  />
                </div>
              </div>

              {/* Matriz de Permisos por Módulo */}
              <div className="space-y-3 pt-2">
                <div className="flex flex-wrap items-center justify-between border-b border-slate-200 pb-2 gap-2">
                  <div>
                    <label className="text-xs font-bold uppercase text-slate-700 block">
                      Matriz de Permisos por Módulo
                    </label>
                    <span className="text-[11px] text-slate-500">
                      Seleccione el nivel de acceso para cada área del sistema
                    </span>
                  </div>

                  <div className="flex items-center gap-1 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setAllPermisos("GESTION")}
                      className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 font-semibold transition-colors"
                    >
                      Todo Gestión
                    </button>
                    <button
                      type="button"
                      onClick={() => setAllPermisos("LECTURA")}
                      className="px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 font-semibold transition-colors"
                    >
                      Todo Lectura
                    </button>
                    <button
                      type="button"
                      onClick={() => setAllPermisos("SIN_ACCESO")}
                      className="px-2 py-0.5 rounded bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 font-semibold transition-colors"
                    >
                      Sin Acceso
                    </button>
                  </div>
                </div>

                <div className="space-y-4">
                  {modulosPorCategoria.map((grupo, idx) => (
                    <div key={grupo.categoria} className="space-y-2">
                      <div className="flex items-center justify-between px-1 pt-1">
                        <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                          <span className="inline-flex h-4 w-4 items-center justify-center rounded bg-orange-100 text-[#C2410C] text-[10px]">
                            {String.fromCharCode(65 + idx)}
                          </span>
                          {grupo.categoria}
                        </span>
                        <span className="text-[10px] font-medium text-slate-400">
                          {grupo.items.length} módulo{grupo.items.length === 1 ? "" : "s"}
                        </span>
                      </div>

                      <div className="space-y-2">
                        {grupo.items.map((m) => {
                          const actual = permisos[m.id] || "SIN_ACCESO";
                          return (
                            <div
                              key={m.id}
                              className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 rounded-xl border border-slate-200 bg-slate-50/70 p-3 hover:bg-slate-50 transition-colors"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-bold text-xs text-slate-900">
                                    {m.nombre}
                                  </span>
                                  <code className="text-[10px] font-mono text-slate-400 bg-white px-1.5 py-0.5 rounded border border-slate-200">
                                    {m.id}
                                  </code>
                                </div>
                                <div className="text-[11px] text-slate-500 mt-0.5">
                                  {m.descripcion}
                                </div>
                              </div>

                              {/* Selector de 3 Opciones Estilo WMS */}
                              <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5 shadow-xs self-start sm:self-center shrink-0">
                                {/* 1. Gestión */}
                                <button
                                  type="button"
                                  onClick={() => cambiarPermiso(m.id, "GESTION")}
                                  className={cn(
                                    "flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-md transition-all",
                                    actual === "GESTION"
                                      ? "bg-emerald-600 text-white shadow-xs"
                                      : "text-slate-600 hover:text-emerald-700 hover:bg-emerald-50"
                                  )}
                                >
                                  <span
                                    className={cn(
                                      "h-2 w-2 rounded-full",
                                      actual === "GESTION" ? "bg-white" : "bg-emerald-500"
                                    )}
                                  />
                                  Gestión
                                </button>

                                {/* 2. Solo Lectura */}
                                <button
                                  type="button"
                                  onClick={() => cambiarPermiso(m.id, "LECTURA")}
                                  className={cn(
                                    "flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-md transition-all",
                                    actual === "LECTURA"
                                      ? "bg-amber-500 text-white shadow-xs"
                                      : "text-slate-600 hover:text-amber-700 hover:bg-amber-50"
                                  )}
                                >
                                  <span
                                    className={cn(
                                      "h-2 w-2 rounded-full",
                                      actual === "LECTURA" ? "bg-white" : "bg-amber-500"
                                    )}
                                  />
                                  Solo Lectura
                                </button>

                                {/* 3. Sin Acceso */}
                                <button
                                  type="button"
                                  onClick={() => cambiarPermiso(m.id, "SIN_ACCESO")}
                                  className={cn(
                                    "flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-md transition-all",
                                    actual === "SIN_ACCESO"
                                      ? "bg-red-600 text-white shadow-xs"
                                      : "text-slate-600 hover:text-red-700 hover:bg-red-50"
                                  )}
                                >
                                  <span
                                    className={cn(
                                      "h-2 w-2 rounded-full",
                                      actual === "SIN_ACCESO" ? "bg-white" : "bg-red-500"
                                    )}
                                  />
                                  Sin Acceso
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Botones de Acción */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setModalAbierto(false)}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#E05A10] hover:bg-[#C2410C] px-4 py-2 text-xs font-bold text-white shadow-md shadow-[#E05A10]/20 transition-all disabled:opacity-50"
                >
                  {isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  )}
                  {editandoPerfil ? "Actualizar Perfil" : "Guardar Perfil"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL DE CONFIRMACIÓN DE ELIMINACIÓN                                      */}
      {/* ========================================================================= */}
      {perfilAEliminar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-[95vw] sm:w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-100 text-red-600">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  ¿Eliminar Perfil?
                </h3>
                <p className="text-xs text-slate-500">
                  Esta acción no se puede deshacer.
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600">
              ¿Está seguro de que desea eliminar el perfil{" "}
              <strong className="text-slate-900 font-bold">
                &quot;{perfilAEliminar.nombre_perfil}&quot;
              </strong>
              ? Asegúrese de que no existan usuarios activos asignados a este rol.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                disabled={eliminando}
                onClick={() => setPerfilAEliminar(null)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={eliminando}
                onClick={handleEliminarConfirmado}
                className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 hover:bg-red-700 px-4 py-2 text-xs font-bold text-white shadow-sm disabled:opacity-50"
              >
                {eliminando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Eliminar Perfil
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
