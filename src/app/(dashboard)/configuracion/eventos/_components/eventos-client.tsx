"use client";

import React, { useMemo, useState, useTransition } from "react";
import {
  AlertOctagon,
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock,
  Info,
  Loader2,
  Megaphone,
  PauseCircle,
  Pencil,
  PlayCircle,
  Plus,
  Radio,
  Trash2,
  Users,
  X,
} from "lucide-react";
import {
  EventoPlataforma,
  PerfilUsuario,
  TipoEventoPlataforma,
} from "@/types/database.types";
import {
  eliminarEventoPlataformaAction,
  guardarEventoPlataformaAction,
  toggleEventoPlataformaAction,
} from "@/actions/eventos.actions";
import { renderMensajeConNegritas } from "@/components/layout/global-event-banner";
import { cn } from "@/lib/utils";

const TIPO_CONFIG: Record<
  TipoEventoPlataforma,
  {
    label: string;
    desc: string;
    bannerClass: string;
    badgeClass: string;
    icon: React.ComponentType<{ className?: string }>;
  }
> = {
  ADVERTENCIA: {
    label: "Advertencia",
    desc: "Mantenimientos programados, pausas o avisos operativos",
    bannerClass: "bg-amber-400 text-slate-950 border border-amber-500",
    badgeClass: "bg-amber-100 text-amber-900 border border-amber-300",
    icon: AlertTriangle,
  },
  INFORME_VERDE: {
    label: "Informe / Novedad",
    desc: "Actualizaciones completadas, nuevas funcionalidades o resultados",
    bannerClass: "bg-emerald-600 text-white border border-emerald-700",
    badgeClass: "bg-emerald-100 text-emerald-800 border border-emerald-300",
    icon: CheckCircle2,
  },
  INFORMATIVO: {
    label: "Informativo",
    desc: "Comunicados generales o recordatorios de cierre",
    bannerClass: "bg-[#0F172A] text-white border border-slate-800",
    badgeClass: "bg-blue-100 text-blue-800 border border-blue-300",
    icon: Info,
  },
  CRITICO: {
    label: "Crítico",
    desc: "Alertas urgentes inmediatas para los usuarios",
    bannerClass: "bg-red-600 text-white border border-red-700",
    badgeClass: "bg-rose-100 text-rose-800 border border-rose-300",
    icon: AlertOctagon,
  },
};

function toLocalDateTimeInputValue(isoOrDate?: string | Date): string {
  const d = isoOrDate ? new Date(isoOrDate) : new Date();
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

function formatFechaHoraCL(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso || "—";
  return d.toLocaleString("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function getEstadoEvento(ev: EventoPlataforma, nowMs: number) {
  if (!ev.activo) {
    return {
      key: "PAUSADO" as const,
      label: "PAUSADO",
      dotClass: "bg-slate-400",
      badgeClass: "bg-slate-100 text-slate-600 border border-slate-200",
    };
  }
  const desde = new Date(ev.fecha_desde).getTime();
  const hasta = new Date(ev.fecha_hasta).getTime();
  if (nowMs >= desde && nowMs <= hasta) {
    return {
      key: "EN_VIVO" as const,
      label: "EN VIVO",
      dotClass: "bg-emerald-500 animate-pulse",
      badgeClass: "bg-emerald-50 text-emerald-700 border border-emerald-200",
    };
  }
  if (desde > nowMs) {
    return {
      key: "PROGRAMADO" as const,
      label: "PROGRAMADO",
      dotClass: "bg-amber-500",
      badgeClass: "bg-amber-50 text-amber-800 border border-amber-200",
    };
  }
  return {
    key: "FINALIZADO" as const,
    label: "FINALIZADO",
    dotClass: "bg-slate-400",
    badgeClass: "bg-slate-100 text-slate-600 border border-slate-200",
  };
}

export function EventosClient({
  initialEventos,
  perfiles,
}: {
  initialEventos: EventoPlataforma[];
  perfiles: PerfilUsuario[];
}) {
  const [eventos, setEventos] = useState<EventoPlataforma[]>(initialEventos);
  const [isPending, startTransition] = useTransition();

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [tipoEvento, setTipoEvento] = useState<TipoEventoPlataforma>("ADVERTENCIA");
  const [titulo, setTitulo] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [perfilDestino, setPerfilDestino] = useState("TODOS");
  const [activo, setActivo] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const nowMs = Date.now();

  const kpis = useMemo(() => {
    let vigentes = 0;
    let programados = 0;
    let finalizados = 0;
    const now = Date.now();
    for (const ev of eventos) {
      const st = getEstadoEvento(ev, now).key;
      if (st === "EN_VIVO") vigentes++;
      else if (st === "PROGRAMADO") programados++;
      else finalizados++;
    }
    return { vigentes, programados, finalizados };
  }, [eventos]);

  const abrirNuevoModal = () => {
    const ahora = new Date();
    const en24h = new Date(ahora.getTime() + 24 * 60 * 60 * 1000);
    setEditingId(null);
    setTipoEvento("ADVERTENCIA");
    setTitulo("");
    setMensaje("");
    setFechaDesde(toLocalDateTimeInputValue(ahora));
    setFechaHasta(toLocalDateTimeInputValue(en24h));
    setPerfilDestino("TODOS");
    setActivo(true);
    setFormError(null);
    setModalOpen(true);
  };

  const abrirEditarModal = (ev: EventoPlataforma) => {
    setEditingId(ev.id);
    setTipoEvento(ev.tipo_evento);
    setTitulo(ev.titulo || "");
    setMensaje(ev.mensaje);
    setFechaDesde(toLocalDateTimeInputValue(ev.fecha_desde));
    setFechaHasta(toLocalDateTimeInputValue(ev.fecha_hasta));
    setPerfilDestino(ev.perfil_destino || "TODOS");
    setActivo(ev.activo);
    setFormError(null);
    setModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!mensaje.trim()) {
      setFormError("Debes ingresar el comentario o mensaje del aviso.");
      return;
    }
    if (!fechaDesde || !fechaHasta) {
      setFormError("Debes definir las fechas 'Informar Desde' e 'Informar Hasta'.");
      return;
    }

    const desdeIso = new Date(fechaDesde).toISOString();
    const hastaIso = new Date(fechaHasta).toISOString();

    startTransition(async () => {
      const res = await guardarEventoPlataformaAction({
        id: editingId || undefined,
        tipo_evento: tipoEvento,
        titulo: titulo.trim() || null,
        mensaje: mensaje.trim(),
        fecha_desde: desdeIso,
        fecha_hasta: hastaIso,
        perfil_destino: perfilDestino,
        activo,
      });

      if (!res.success || !res.data) {
        setFormError(res.error || "No se pudo guardar el evento.");
        return;
      }

      if (editingId) {
        setEventos((prev) =>
          prev.map((item) => (item.id === editingId ? res.data! : item))
        );
        setActionMsg("Evento actualizado correctamente.");
      } else {
        setEventos((prev) => [res.data!, ...prev]);
        setActionMsg("Evento programado correctamente.");
      }
      setModalOpen(false);
    });
  };

  const handleToggle = (ev: EventoPlataforma) => {
    const nuevoEstado = !ev.activo;
    startTransition(async () => {
      const res = await toggleEventoPlataformaAction(ev.id, nuevoEstado);
      if (res.success) {
        setEventos((prev) =>
          prev.map((item) =>
            item.id === ev.id
              ? { ...item, activo: nuevoEstado, updated_at: new Date().toISOString() }
              : item
          )
        );
      } else {
        setActionMsg(res.error || "Error al cambiar estado.");
      }
    });
  };

  const handleDelete = (ev: EventoPlataforma) => {
    if (!window.confirm("¿Eliminar este evento global permanentemente?")) return;
    startTransition(async () => {
      const res = await eliminarEventoPlataformaAction(ev.id);
      if (res.success) {
        setEventos((prev) => prev.filter((item) => item.id !== ev.id));
        setActionMsg("Evento eliminado.");
      } else {
        setActionMsg(res.error || "Error al eliminar.");
      }
    });
  };

  const previewStyle = TIPO_CONFIG[tipoEvento];
  const PreviewIcon = previewStyle.icon;

  return (
    <div className="space-y-5">
      {/* Header Ejecutivo */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
        <div className="flex items-start gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-orange-50 border border-orange-200 flex items-center justify-center text-[#E05A10] shrink-0">
            <Megaphone className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">
              Eventos y Avisos Globales
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Programación de comunicados, alertas de actualización y novedades en plataforma.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={abrirNuevoModal}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#E05A10] hover:bg-[#c84e0c] text-white text-xs font-bold shadow-sm transition-colors cursor-pointer shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Nuevo Evento</span>
        </button>
      </div>

      {actionMsg && (
        <div className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-medium">
          <span>{actionMsg}</span>
          <button
            type="button"
            onClick={() => setActionMsg(null)}
            className="text-slate-300 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 3 Tarjetas KPI */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              EVENTOS VIGENTES AHORA
            </p>
            <p className="text-2xl font-extrabold text-emerald-700 mt-1">
              {kpis.vigentes}
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600">
            <Radio className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              PROGRAMADOS PRÓXIMOS
            </p>
            <p className="text-2xl font-extrabold text-amber-600 mt-1">
              {kpis.programados}
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
            <CalendarClock className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              HISTORIAL / FINALIZADOS
            </p>
            <p className="text-2xl font-extrabold text-slate-700 mt-1">
              {kpis.finalizados}
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-500">
            <Clock className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Tabla de Eventos Registrados */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <th className="py-3 px-4">TIPO</th>
                <th className="py-3 px-4">MENSAJE / COMENTARIO</th>
                <th className="py-3 px-4 whitespace-nowrap">DESDE</th>
                <th className="py-3 px-4 whitespace-nowrap">HASTA</th>
                <th className="py-3 px-4">AUDIENCIA</th>
                <th className="py-3 px-4 text-center">ESTADO</th>
                <th className="py-3 px-4 text-right">ACCIONES</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {eventos.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    No hay eventos o avisos programados aún. Haz clic en{" "}
                    <strong className="text-slate-600">+ Nuevo Evento</strong> para crear el primero.
                  </td>
                </tr>
              ) : (
                eventos.map((ev) => {
                  const tipoCfg = TIPO_CONFIG[ev.tipo_evento] || TIPO_CONFIG.INFORMATIVO;
                  const TipoIcon = tipoCfg.icon;
                  const estado = getEstadoEvento(ev, nowMs);

                  return (
                    <tr key={ev.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold",
                            tipoCfg.badgeClass
                          )}
                        >
                          <TipoIcon className="w-3.5 h-3.5" />
                          {tipoCfg.label}
                        </span>
                      </td>

                      <td className="py-3 px-4 max-w-md">
                        {ev.titulo && (
                          <div className="font-bold text-slate-900 mb-0.5">{ev.titulo}</div>
                        )}
                        <div className="text-slate-700 leading-snug">
                          {renderMensajeConNegritas(ev.mensaje)}
                        </div>
                      </td>

                      <td className="py-3 px-4 font-mono text-[11px] text-slate-600 whitespace-nowrap">
                        {formatFechaHoraCL(ev.fecha_desde)}
                      </td>

                      <td className="py-3 px-4 font-mono text-[11px] text-slate-600 whitespace-nowrap">
                        {formatFechaHoraCL(ev.fecha_hasta)}
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-semibold text-[11px]">
                          <Users className="w-3 h-3 text-slate-500" />
                          {ev.perfil_destino === "TODOS" ? "Todos" : ev.perfil_destino}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold",
                            estado.badgeClass
                          )}
                        >
                          <span className={cn("w-2 h-2 rounded-full", estado.dotClass)} />
                          {estado.label}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() => handleToggle(ev)}
                            title={ev.activo ? "Pausar aviso" : "Activar aviso"}
                            className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600 transition-colors cursor-pointer disabled:opacity-50"
                          >
                            {ev.activo ? (
                              <PauseCircle className="w-4 h-4 text-amber-600" />
                            ) : (
                              <PlayCircle className="w-4 h-4 text-emerald-600" />
                            )}
                          </button>

                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() => abrirEditarModal(ev)}
                            title="Editar evento"
                            className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600 transition-colors cursor-pointer disabled:opacity-50"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>

                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() => handleDelete(ev)}
                            title="Eliminar evento"
                            className="p-1.5 rounded-lg border border-rose-200 hover:bg-rose-50 text-rose-600 transition-colors cursor-pointer disabled:opacity-50"
                          >
                            <Trash2 className="w-4 h-4" />
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
      </div>

      {/* Modal Crear / Editar Evento */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden max-h-[92vh] flex flex-col">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2.5">
                <Megaphone className="w-5 h-5 text-[#E05A10]" />
                <h2 className="text-base font-extrabold text-slate-900">
                  {editingId ? "Editar Evento Global" : "Nuevo Evento Global"}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
              {/* Vista previa en tiempo real */}
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                  Vista previa en barra superior
                </p>
                <div
                  className={cn(
                    "w-full px-4 py-2.5 rounded-xl flex items-center justify-between gap-3 text-sm font-medium shadow-xs",
                    previewStyle.bannerClass
                  )}
                >
                  <PreviewIcon className="w-4 h-4 shrink-0" />
                  <div className="text-center flex-1 leading-snug">
                    {titulo.trim() && (
                      <span className="font-extrabold mr-1.5">{titulo.trim()}:</span>
                    )}
                    {mensaje.trim()
                      ? renderMensajeConNegritas(mensaje.trim())
                      : "Escribe el mensaje del aviso para previsualizar cómo lo verán los usuarios..."}
                  </div>
                  <X className="w-4 h-4 opacity-70 shrink-0" />
                </div>
              </div>

              {/* Tipo de Aviso */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Tipo de Aviso *
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {(Object.keys(TIPO_CONFIG) as TipoEventoPlataforma[]).map((key) => {
                    const cfg = TIPO_CONFIG[key];
                    const Icon = cfg.icon;
                    const selected = tipoEvento === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setTipoEvento(key)}
                        className={cn(
                          "p-2.5 rounded-xl border text-left transition-all cursor-pointer",
                          selected
                            ? "border-[#E05A10] ring-2 ring-[#E05A10]/20 bg-orange-50/40"
                            : "border-slate-200 hover:border-slate-300 bg-white"
                        )}
                      >
                        <div className="flex items-center gap-1.5 font-bold text-xs text-slate-900">
                          <Icon className="w-3.5 h-3.5 shrink-0" />
                          <span>{cfg.label}</span>
                        </div>
                        <p className="text-[10px] text-slate-500 mt-1 leading-tight">
                          {cfg.desc}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Vigencia */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Informar Desde *
                  </label>
                  <input
                    type="datetime-local"
                    required
                    value={fechaDesde}
                    onChange={(e) => setFechaDesde(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#E05A10]/30 focus:border-[#E05A10]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Informar Hasta *
                  </label>
                  <input
                    type="datetime-local"
                    required
                    value={fechaHasta}
                    onChange={(e) => setFechaHasta(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#E05A10]/30 focus:border-[#E05A10]"
                  />
                </div>
              </div>

              {/* Audiencia y Título */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Audiencia
                  </label>
                  <select
                    value={perfilDestino}
                    onChange={(e) => setPerfilDestino(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-medium text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-[#E05A10]/30 focus:border-[#E05A10]"
                  >
                    <option value="TODOS">Todos los Usuarios</option>
                    {perfiles.map((p) => (
                      <option key={p.id} value={p.nombre_perfil}>
                        {p.nombre_perfil}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Título corto (Opcional)
                  </label>
                  <input
                    type="text"
                    value={titulo}
                    onChange={(e) => setTitulo(e.target.value)}
                    placeholder="ej. Mantenimiento Programado"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#E05A10]/30 focus:border-[#E05A10]"
                  />
                </div>
              </div>

              {/* Comentario / Mensaje */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Comentario / Mensaje del Aviso *
                </label>
                <textarea
                  rows={3}
                  required
                  value={mensaje}
                  onChange={(e) => setMensaje(e.target.value)}
                  placeholder="Puedes usar **negritas** para destacar fechas u horarios. Ej: Mañana **viernes 18:00 hrs** realizaremos actualización de plataforma."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#E05A10]/30 focus:border-[#E05A10]"
                />
              </div>

              {/* Estado Activo / Pausado */}
              <div className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200">
                <div>
                  <p className="text-xs font-bold text-slate-800">Estado del Evento</p>
                  <p className="text-[11px] text-slate-500">
                    {activo
                      ? "Activo: se mostrará automáticamente dentro del rango de vigencia."
                      : "Pausado: permanecerá oculto aunque esté dentro de fecha."}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActivo((v) => !v)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer",
                    activo
                      ? "bg-emerald-600 text-white"
                      : "bg-slate-200 text-slate-700"
                  )}
                >
                  {activo ? "Activo" : "Pausado"}
                </button>
              </div>

              {formError && (
                <div className="px-3.5 py-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
                  {formError}
                </div>
              )}

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-[#E05A10] hover:bg-[#c84e0c] text-white text-xs font-bold shadow-sm transition-colors cursor-pointer disabled:opacity-60"
                >
                  {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{editingId ? "Guardar Cambios" : "Programar Evento"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
