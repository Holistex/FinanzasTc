"use client";

import React, { useState, useTransition } from "react";
import {
  Search,
  Plus,
  User,
  Shield,
  Eye,
  EyeOff,
  Edit2,
  Trash2,
  Loader2,
  CheckCircle2,
  X,
  Mail,
  KeyRound,
  UserCheck,
} from "lucide-react";
import { PerfilUsuario, UsuarioSistema } from "@/types/database.types";
import {
  saveUsuarioAction,
  deleteUsuarioAction,
} from "@/actions/configuracion.actions";
import { cn } from "@/lib/utils";

interface UsuariosViewProps {
  initialUsuarios: UsuarioSistema[];
  perfiles: PerfilUsuario[];
}

export function UsuariosView({ initialUsuarios, perfiles }: UsuariosViewProps) {
  const [usuarios, setUsuarios] = useState<UsuarioSistema[]>(initialUsuarios);
  const [searchQuery, setSearchQuery] = useState("");
  const [perfilFilter, setPerfilFilter] = useState("TODOS");
  const [isPending, startTransition] = useTransition();

  // Control de visibilidad global de contraseñas (por defecto visualizando texto plano según requerimiento)
  const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const u of initialUsuarios) {
      init[u.id] = true; // Por defecto visualizando texto plano
    }
    return init;
  });

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUsuario, setEditingUsuario] = useState<UsuarioSistema | null>(null);
  const [formNombre, setFormNombre] = useState("");
  const [formUsuario, setFormUsuario] = useState("");
  const [formContrasena, setFormContrasena] = useState("");
  const [formCorreo, setFormCorreo] = useState("");
  const [formPerfilId, setFormPerfilId] = useState(perfiles[0]?.id || "");
  const [formEstado, setFormEstado] = useState<"Activo" | "Inactivo">("Activo");
  const [formShowPassword, setFormShowPassword] = useState(true); // Por defecto texto plano
  const [formError, setFormError] = useState<string | null>(null);

  const togglePasswordVisibility = (id: string) => {
    setVisiblePasswords((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const handleOpenCreate = () => {
    setEditingUsuario(null);
    setFormNombre("");
    setFormUsuario("");
    setFormContrasena("");
    setFormCorreo("");
    setFormPerfilId(perfiles[0]?.id || "");
    setFormEstado("Activo");
    setFormShowPassword(true);
    setFormError(null);
    setModalOpen(true);
  };

  const handleOpenEdit = (u: UsuarioSistema) => {
    setEditingUsuario(u);
    setFormNombre(u.nombre);
    setFormUsuario(u.usuario);
    setFormContrasena(u.contrasena);
    setFormCorreo(u.correo);
    setFormPerfilId(u.perfil_id);
    setFormEstado(u.estado);
    setFormShowPassword(true);
    setFormError(null);
    setModalOpen(true);
  };

  const handleSaveUsuario = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    startTransition(async () => {
      try {
        const saved = await saveUsuarioAction({
          id: editingUsuario?.id,
          usuarioOriginal: editingUsuario?.usuario,
          nombre: formNombre,
          usuario: formUsuario,
          contrasena: formContrasena,
          correo: formCorreo,
          perfil_id: formPerfilId,
          estado: formEstado,
        });

        setUsuarios((prev) => {
          if (editingUsuario) {
            return prev.map((u) => (u.id === saved.id ? saved : u));
          }
          return [saved, ...prev];
        });

        setVisiblePasswords((prev) => ({
          ...prev,
          [saved.id]: true,
        }));

        setModalOpen(false);
      } catch (err) {
        setFormError(err instanceof Error ? err.message : "Error al guardar usuario.");
      }
    });
  };

  const handleDeleteUsuario = (u: UsuarioSistema) => {
    if (!confirm(`¿Está seguro de eliminar al usuario ${u.usuario} (${u.nombre})?`)) {
      return;
    }

    startTransition(async () => {
      try {
        await deleteUsuarioAction(u.id);
        setUsuarios((prev) => prev.filter((item) => item.id !== u.id));
      } catch (err) {
        alert(err instanceof Error ? err.message : "Error al eliminar usuario.");
      }
    });
  };

  const filteredUsuarios = usuarios.filter((u) => {
    const q = searchQuery.toLowerCase().trim();
    const matchSearch =
      !q ||
      u.nombre.toLowerCase().includes(q) ||
      u.usuario.toLowerCase().includes(q) ||
      u.correo.toLowerCase().includes(q) ||
      (u.perfil_nombre && u.perfil_nombre.toLowerCase().includes(q));

    const matchPerfil =
      perfilFilter === "TODOS" || u.perfil_id === perfilFilter;

    return matchSearch && matchPerfil;
  });

  return (
    <div className="space-y-3.5">
      {/* Cabecera del Módulo */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <h1 className="text-base font-bold tracking-tight text-[#0F172A]">
            CONFIGURACIÓN ADM.
          </h1>
          <span className="text-xs font-semibold text-slate-500">
            · Maestro Usuarios
          </span>
          <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded bg-orange-50 text-[#E05A10] border border-orange-200">
            {usuarios.length} Usuarios Registrados
          </span>
        </div>

        <button
          type="button"
          onClick={handleOpenCreate}
          className="inline-flex items-center gap-1.5 rounded-md bg-[#E05A10] hover:bg-[#C2410C] text-white px-3 py-1.5 text-xs font-semibold shadow-sm transition-all active:scale-[0.98]"
        >
          <Plus className="h-3.5 w-3.5" />
          Nuevo Usuario
        </button>
      </div>

      {/* KPI Cards Ejecutivos */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        <div className="bg-[#0F172A] text-white border border-[#1E293B] border-l-4 border-l-[#E05A10] rounded-md px-3.5 py-2.5 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Total Cuentas de Usuario
            </div>
            <div className="text-base font-bold font-mono tabular-nums text-white mt-0.5">
              {usuarios.length} cuentas
            </div>
          </div>
          <div className="h-8 w-8 rounded bg-[#E05A10]/20 border border-[#E05A10]/40 flex items-center justify-center text-[#E05A10]">
            <User className="h-4 w-4" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 border-l-4 border-l-emerald-600 rounded-md px-3.5 py-2.5 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Usuarios Activos
            </div>
            <div className="text-base font-bold font-mono tabular-nums text-[#0F172A] mt-0.5">
              {usuarios.filter((u) => u.estado === "Activo").length}{" "}
              <span className="text-xs font-sans font-normal text-slate-500">
                habilitados
              </span>
            </div>
          </div>
          <div className="h-8 w-8 rounded bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600">
            <UserCheck className="h-4 w-4" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 border-l-4 border-l-slate-700 rounded-md px-3.5 py-2.5 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Perfiles Asignables
            </div>
            <div className="text-base font-bold font-mono tabular-nums text-[#0F172A] mt-0.5">
              {perfiles.length}{" "}
              <span className="text-xs font-sans font-normal text-slate-500">
                roles en sistema
              </span>
            </div>
          </div>
          <div className="h-8 w-8 rounded bg-[#F1F5F9] border border-slate-200 flex items-center justify-center text-[#0F172A]">
            <Shield className="h-4 w-4" />
          </div>
        </div>
      </div>

      {/* Barra de Búsqueda y Filtros */}
      <div className="bg-white border border-slate-200 rounded-md px-3 py-2 shadow-sm flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-[220px] max-w-md relative">
          <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por Nombre, Usuario o Correo..."
            className="w-full rounded border border-slate-300 bg-[#F8FAFC] pl-7 pr-2.5 py-1 text-xs text-[#0F172A] placeholder:text-slate-400 focus:bg-white focus:border-[#E05A10] focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 font-medium">Filtrar Perfil:</span>
          <select
            value={perfilFilter}
            onChange={(e) => setPerfilFilter(e.target.value)}
            className="rounded border border-slate-300 bg-[#F8FAFC] px-2 py-1 text-xs text-slate-700 focus:bg-white focus:border-[#E05A10] focus:outline-none"
          >
            <option value="TODOS">Todos los Perfiles</option>
            {perfiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre_perfil}
              </option>
            ))}
          </select>

          {isPending && (
            <span className="inline-flex items-center gap-1 text-xs text-[#E05A10] font-medium ml-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Sincronizando...
            </span>
          )}
        </div>
      </div>

      {/* Tabla Maestro Usuarios (Densidad Stripe/Linear) */}
      <div className="bg-white border border-slate-200 rounded-md shadow-sm overflow-hidden w-full">
        <table className="w-full table-auto text-left border-collapse">
          <thead>
            <tr className="bg-[#0F172A] text-slate-200 text-[10px] font-semibold uppercase tracking-wider border-b border-[#1E293B]">
              <th className="py-2.5 px-3">Nombre Completo</th>
              <th className="py-2.5 px-3 w-[150px]">Usuario</th>
              <th className="py-2.5 px-3 w-[180px]">
                Contraseña (Texto Plano)
              </th>
              <th className="py-2.5 px-3">Correo Electrónico</th>
              <th className="py-2.5 px-3 w-[170px]">Tipo Perfil</th>
              <th className="py-2.5 px-3 text-center w-[100px]">Estado</th>
              <th className="py-2.5 px-3 text-right w-[100px]">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 text-xs">
            {filteredUsuarios.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="py-8 text-center text-slate-500 text-xs"
                >
                  No se encontraron usuarios registrados bajo los criterios de búsqueda.
                </td>
              </tr>
            ) : (
              filteredUsuarios.map((user) => {
                const isPasswordVisible = visiblePasswords[user.id] ?? true;

                return (
                  <tr
                    key={user.id}
                    className="hover:bg-[#F8FAFC] transition-colors"
                  >
                    {/* Nombre */}
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-2">
                        <div className="h-6 w-6 rounded-full bg-slate-100 border border-slate-300 flex items-center justify-center text-slate-700 font-bold text-[10px] shrink-0">
                          {user.nombre.charAt(0).toUpperCase()}
                        </div>
                        <div className="font-bold text-[#0F172A]">
                          {user.nombre}
                        </div>
                      </div>
                    </td>

                    {/* Usuario */}
                    <td className="py-2.5 px-3 font-mono font-medium text-slate-700 whitespace-nowrap">
                      {user.usuario}
                    </td>

                    {/* Contraseña con Visibilidad Explícita */}
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5 bg-[#F1F5F9] px-2 py-0.5 rounded border border-slate-200">
                        <KeyRound className="h-3 w-3 text-slate-400 shrink-0" />
                        <span className="font-mono text-[11px] font-semibold text-[#0F172A] tracking-wider min-w-[70px]">
                          {isPasswordVisible ? user.contrasena : "••••••••"}
                        </span>
                        <button
                          type="button"
                          onClick={() => togglePasswordVisibility(user.id)}
                          className="text-slate-400 hover:text-slate-700 transition-colors p-0.5"
                          title={isPasswordVisible ? "Ocultar contraseña" : "Ver contraseña en texto plano"}
                        >
                          {isPasswordVisible ? (
                            <EyeOff className="h-3 w-3" />
                          ) : (
                            <Eye className="h-3 w-3" />
                          )}
                        </button>
                      </div>
                    </td>

                    {/* Correo */}
                    <td className="py-2.5 px-3 text-slate-600 truncate max-w-[220px]" title={user.correo}>
                      <span className="flex items-center gap-1.5">
                        <Mail className="h-3 w-3 text-slate-400 shrink-0" />
                        <span className="truncate">{user.correo}</span>
                      </span>
                    </td>

                    {/* Tipo Perfil */}
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-orange-50 text-[#E05A10] border border-orange-200">
                        <Shield className="h-2.5 w-2.5" />
                        {user.perfil_nombre || "Sin Asignar"}
                      </span>
                    </td>

                    {/* Estado */}
                    <td className="py-2.5 px-3 text-center whitespace-nowrap">
                      <span
                        className={cn(
                          "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border",
                          user.estado === "Activo"
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : "bg-slate-100 text-slate-600 border-slate-300"
                        )}
                      >
                        {user.estado}
                      </span>
                    </td>

                    {/* Acciones */}
                    <td className="py-2.5 px-3 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(user)}
                          title="Editar usuario"
                          className="h-6 w-6 rounded border border-slate-200 bg-white text-slate-600 hover:text-[#E05A10] hover:border-[#E05A10] flex items-center justify-center transition-colors"
                        >
                          <Edit2 className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteUsuario(user)}
                          title="Eliminar usuario"
                          className="h-6 w-6 rounded border border-slate-200 bg-white text-slate-600 hover:text-rose-600 hover:border-rose-300 flex items-center justify-center transition-colors"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Modal Crear / Editar Usuario */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Cabecera del Modal */}
            <div className="flex items-center justify-between border-b border-slate-100 bg-[#0F172A] px-5 py-3.5 text-white">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded bg-[#E05A10] text-white">
                  <User className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider">
                    {editingUsuario ? "Editar Cuenta de Usuario" : "Nuevo Usuario de Sistema"}
                  </h3>
                  <p className="text-[10px] text-slate-400">
                    Maestro Usuarios · Configuración Adm.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Formulario */}
            <form onSubmit={handleSaveUsuario} className="p-5 space-y-3.5">
              {editingUsuario?.id && (
                <input type="hidden" name="id" value={editingUsuario.id} />
              )}
              {editingUsuario?.usuario && (
                <input type="hidden" name="usuarioOriginal" value={editingUsuario.usuario} />
              )}
              {formError && (
                <div className="rounded border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-700">
                  {formError}
                </div>
              )}

              {/* 1. Nombre Completo */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Nombre Completo *
                </label>
                <input
                  type="text"
                  required
                  value={formNombre}
                  onChange={(e) => setFormNombre(e.target.value)}
                  placeholder="ej. Carlos Vargas Matte"
                  className="w-full rounded border border-slate-300 bg-[#F8FAFC] px-2.5 py-1.5 text-xs text-[#0F172A] focus:bg-white focus:border-[#E05A10] focus:outline-none"
                />
              </div>

              {/* 2. Usuario (Username) */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Usuario (Username / Identificador) *
                </label>
                <div className="relative flex items-center">
                  <input
                    type="text"
                    required
                    value={formUsuario}
                    onChange={(e) => setFormUsuario(e.target.value.replace(/^@+/, ""))}
                    placeholder="cvargas"
                    className="w-full rounded border border-slate-300 bg-[#F8FAFC] px-2.5 py-1.5 text-xs font-mono text-[#0F172A] focus:bg-white focus:border-[#E05A10] focus:outline-none"
                  />
                </div>
              </div>

              {/* 3. Contraseña con Visibilidad Explícita */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Contraseña (Visibilidad Explícita) *
                </label>
                <div className="relative flex items-center">
                  <input
                    type={formShowPassword ? "text" : "password"}
                    required
                    value={formContrasena}
                    onChange={(e) => setFormContrasena(e.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded border border-slate-300 bg-[#F8FAFC] px-2.5 pr-8 py-1.5 text-xs font-mono text-[#0F172A] focus:bg-white focus:border-[#E05A10] focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setFormShowPassword(!formShowPassword)}
                    className="absolute right-2 text-slate-400 hover:text-slate-700 p-1"
                    title={formShowPassword ? "Ocultar texto" : "Ver en texto plano"}
                  >
                    {formShowPassword ? (
                      <EyeOff className="h-3.5 w-3.5" />
                    ) : (
                      <Eye className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
                <p className="text-[10px] text-slate-500 mt-1">
                  Por defecto configurado en texto plano para facilitar su validación inmediata.
                </p>
              </div>

              {/* 4. Correo Electrónico */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Correo Electrónico *
                </label>
                <input
                  type="email"
                  required
                  value={formCorreo}
                  onChange={(e) => setFormCorreo(e.target.value)}
                  placeholder="cvargas@tensacon.cl"
                  className="w-full rounded border border-slate-300 bg-[#F8FAFC] px-2.5 py-1.5 text-xs text-[#0F172A] focus:bg-white focus:border-[#E05A10] focus:outline-none"
                />
              </div>

              {/* 5. Tipo Perfil Conectado a Adm. Perfiles */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Tipo Perfil *
                </label>
                <select
                  required
                  value={formPerfilId}
                  onChange={(e) => setFormPerfilId(e.target.value)}
                  className="w-full rounded border border-slate-300 bg-[#F8FAFC] px-2.5 py-1.5 text-xs text-[#0F172A] focus:bg-white focus:border-[#E05A10] focus:outline-none"
                >
                  {perfiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre_perfil} {p.descripcion ? `— (${p.descripcion})` : ""}
                    </option>
                  ))}
                </select>
              </div>

              {/* 6. Estado */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Estado
                </label>
                <div className="flex items-center gap-3">
                  <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                    <input
                      type="radio"
                      name="estado"
                      checked={formEstado === "Activo"}
                      onChange={() => setFormEstado("Activo")}
                      className="text-[#E05A10] focus:ring-[#E05A10]"
                    />
                    <span>Activo</span>
                  </label>
                  <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                    <input
                      type="radio"
                      name="estado"
                      checked={formEstado === "Inactivo"}
                      onChange={() => setFormEstado("Inactivo")}
                      className="text-[#E05A10] focus:ring-[#E05A10]"
                    />
                    <span>Inactivo</span>
                  </label>
                </div>
              </div>

              {/* Botones de Acción */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-[#F1F5F9]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="inline-flex items-center gap-1.5 rounded bg-[#E05A10] hover:bg-[#C2410C] px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm disabled:opacity-50"
                >
                  {isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  )}
                  {editingUsuario ? "Guardar Cambios" : "Crear Usuario"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
