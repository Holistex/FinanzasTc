"use client";

import React, { useState, useMemo, useTransition } from "react";
import Link from "next/link";
import {
  CalendarDays,
  CalendarClock,
  Gavel,
  FileWarning,
  Briefcase,
  ChevronLeft,
  ChevronRight,
  Clock,
  Search,
  Filter,
  ExternalLink,
  X,
  Eye,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Scale,
  ArrowRight,
  Calendar as CalendarIcon,
} from "lucide-react";
import {
  EventoCalendarioLitigio,
  CalendarioLitigiosKpis,
  TipoEventoCalendarioLitigio,
} from "@/types/database.types";
import { CalendarioFilterParams } from "@/actions/litigios.actions";
import { cn, formatDateCL, formatCLP } from "@/lib/utils";

type CalendarViewMode = "CALENDARIO" | "AGENDA";

interface CalendarioModuleViewProps {
  initialItems: EventoCalendarioLitigio[];
  initialKpis: CalendarioLitigiosKpis;
  onFetchAction: (
    filters?: CalendarioFilterParams
  ) => Promise<{ items: EventoCalendarioLitigio[]; kpis: CalendarioLitigiosKpis }>;
}

const MONTH_NAMES_ES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

const DAYS_OF_WEEK_ES = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { QUERY_KEYS } from "@/lib/prefetch-helpers";

export function CalendarioModuleView({
  initialItems,
  initialKpis,
  onFetchAction,
}: CalendarioModuleViewProps) {
  const queryClient = useQueryClient();

  // Caché dinámico de TanStack Query: renders instantáneos (<1ms) y revalidación en segundo plano
  const { data: queryData } = useQuery({
    queryKey: QUERY_KEYS.litigiosCalendario,
    queryFn: () => onFetchAction(),
    initialData: { items: initialItems, kpis: initialKpis },
    staleTime: 5 * 60 * 1000,
  });

  const [localData, setLocalData] = useState<{
    items: EventoCalendarioLitigio[];
    kpis: CalendarioLitigiosKpis;
  }>({ items: initialItems, kpis: initialKpis });

  const items = queryData?.items ?? localData.items;
  const kpis = queryData?.kpis ?? localData.kpis;

  // Tabs: Vista Calendario vs Lista Cronológica (Agenda)
  const [viewMode, setViewMode] = useState<CalendarViewMode>("CALENDARIO");

  // Filtros
  const [searchQuery, setSearchQuery] = useState("");
  const [tipoFilter, setTipoFilter] = useState<TipoEventoCalendarioLitigio | "TODOS">("TODOS");
  const [estadoFilter, setEstadoFilter] = useState<string>("TODOS");

  // Navegación de mes en la vista de calendario
  const today = useMemo(() => new Date(), []);
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth()); // 0-indexed

  // Modal de Detalle de Evento
  const [selectedEvent, setSelectedEvent] = useState<EventoCalendarioLitigio | null>(null);
  const [isPending, startTransition] = useTransition();

  // Cambiar de mes
  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear((y) => y - 1);
    } else {
      setCurrentMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear((y) => y + 1);
    } else {
      setCurrentMonth((m) => m + 1);
    }
  };

  const handleGoToToday = () => {
    setCurrentYear(today.getFullYear());
    setCurrentMonth(today.getMonth());
  };

  // Recargar datos y sincronizar caché
  const handleRefresh = () => {
    startTransition(async () => {
      const res = await onFetchAction();
      queryClient.setQueryData(QUERY_KEYS.litigiosCalendario, res);
      setLocalData(res);
    });
  };

  // Filtrado de eventos
  const filteredEvents = useMemo(() => {
    return items.filter((event) => {
      // 1. Tipo
      if (tipoFilter !== "TODOS" && event.tipo_evento !== tipoFilter) {
        return false;
      }
      // 2. Estado
      if (estadoFilter !== "TODOS") {
        if (estadoFilter === "PENDIENTE" && event.estado_general !== "PENDIENTE") {
          return false;
        }
        if (
          estadoFilter === "CONCLUIDO" &&
          event.estado_general !== "CONCLUIDO" &&
          event.estado_general !== "PAGADA"
        ) {
          return false;
        }
      }
      // 3. Search query
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const match =
          event.identificador.toLowerCase().includes(q) ||
          event.titulo.toLowerCase().includes(q) ||
          event.detalle.toLowerCase().includes(q) ||
          (event.entidad_o_materia || "").toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [items, tipoFilter, estadoFilter, searchQuery]);

  // Eventos agrupados por fecha (YYYY-MM-DD) para la vista mensual
  const eventsByDate = useMemo(() => {
    const map = new Map<string, EventoCalendarioLitigio[]>();
    filteredEvents.forEach((ev) => {
      const list = map.get(ev.fecha_evento) || [];
      list.push(ev);
      map.set(ev.fecha_evento, list);
    });
    return map;
  }, [filteredEvents]);

  // Matriz de días del mes actual para el calendario
  const calendarDays = useMemo(() => {
    const firstDayOfMonth = new Date(currentYear, currentMonth, 1);
    const lastDayOfMonth = new Date(currentYear, currentMonth + 1, 0);

    // En JS getDay(): 0 = Domingo, 1 = Lunes, ..., 6 = Sábado.
    // Convertir a Lunes = 0, ..., Domingo = 6:
    const startDayOfWeek = (firstDayOfMonth.getDay() + 6) % 7;
    const totalDays = lastDayOfMonth.getDate();

    const days: Array<{
      dateString: string;
      dayNumber: number;
      isCurrentMonth: boolean;
      isToday: boolean;
    }> = [];

    // Días del mes anterior para rellenar inicio
    const prevMonthLastDay = new Date(currentYear, currentMonth, 0).getDate();
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const d = prevMonthLastDay - i;
      const prevDate = new Date(currentYear, currentMonth - 1, d);
      const iso = prevDate.toISOString().slice(0, 10);
      days.push({
        dateString: iso,
        dayNumber: d,
        isCurrentMonth: false,
        isToday: false,
      });
    }

    // Días del mes actual
    const todayIso = today.toISOString().slice(0, 10);
    for (let d = 1; d <= totalDays; d++) {
      const curDate = new Date(currentYear, currentMonth, d);
      const iso = curDate.toISOString().slice(0, 10);
      days.push({
        dateString: iso,
        dayNumber: d,
        isCurrentMonth: true,
        isToday: iso === todayIso,
      });
    }

    // Días del mes siguiente para completar cuadrícula (múltiplos de 7, máx 42)
    const remaining = (7 - (days.length % 7)) % 7;
    for (let d = 1; d <= remaining; d++) {
      const nextDate = new Date(currentYear, currentMonth + 1, d);
      const iso = nextDate.toISOString().slice(0, 10);
      days.push({
        dateString: iso,
        dayNumber: d,
        isCurrentMonth: false,
        isToday: false,
      });
    }

    return days;
  }, [currentYear, currentMonth, today]);

  // Helper para días restantes
  const getDaysRemainingInfo = (dateStr: string) => {
    const todayIso = today.toISOString().slice(0, 10);
    if (dateStr === todayIso) {
      return {
        label: "Hoy",
        badgeClass: "bg-amber-100 text-amber-800 border-amber-300 font-bold",
      };
    }

    const tDate = new Date(todayIso + "T00:00:00");
    const eDate = new Date(dateStr + "T00:00:00");
    const diffTime = eDate.getTime() - tDate.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays > 0) {
      if (diffDays === 1) {
        return {
          label: "Mañana",
          badgeClass: "bg-blue-50 text-blue-700 border-blue-200 font-semibold",
        };
      }
      return {
        label: `En ${diffDays} días`,
        badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200 font-semibold",
      };
    } else {
      const pastDays = Math.abs(diffDays);
      return {
        label: `Hace ${pastDays} ${pastDays === 1 ? "día" : "días"}`,
        badgeClass: "bg-slate-100 text-slate-600 border-slate-200",
      };
    }
  };

  // Helper de badges por tipo de evento
  const getEventBadgeMeta = (tipo: TipoEventoCalendarioLitigio) => {
    switch (tipo) {
      case "AUDIENCIA_JUICIO":
        return {
          label: "Audiencia Juicio",
          pillClass:
            "bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100",
          icon: Gavel,
          dotColor: "bg-emerald-500",
        };
      case "MULTA":
        return {
          label: "Vencimiento Multa",
          pillClass:
            "bg-rose-50 text-rose-800 border-rose-300 hover:bg-rose-100",
          icon: FileWarning,
          dotColor: "bg-rose-500",
        };
      case "COMPARENDO":
        return {
          label: "Comparendo",
          pillClass:
            "bg-sky-50 text-sky-800 border-sky-300 hover:bg-sky-100",
          icon: Briefcase,
          dotColor: "bg-sky-500",
        };
      default:
        return {
          label: "Evento",
          pillClass: "bg-slate-100 text-slate-800 border-slate-300",
          icon: CalendarIcon,
          dotColor: "bg-slate-500",
        };
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto select-none">
      {/* 1. Header Principal Estándar Tensacon */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-[#E05A10] text-white shadow-xs">
            <CalendarDays className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                Calendario de Litigios
              </h1>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-200 uppercase tracking-wider">
                REG. LITIGIOS
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Consolidación mensual y agenda cronológica de audiencias judiciales, comparendos y vencimientos de sanciones.
            </p>
          </div>
        </div>

        {/* Acciones Rápidas Superior Derecha */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isPending}
            className="p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
            title="Recargar eventos"
          >
            <RotateCcw className={cn("h-4 w-4", isPending && "animate-spin")} />
          </button>
          <Link
            href="/reg-litigios/juicios"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 transition-colors cursor-pointer"
          >
            <Gavel className="h-3.5 w-3.5 text-slate-500" />
            <span>Ver Juicios</span>
          </Link>
          <Link
            href="/reg-litigios/multas"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 transition-colors cursor-pointer"
          >
            <FileWarning className="h-3.5 w-3.5 text-slate-500" />
            <span>Ver Multas</span>
          </Link>
        </div>
      </div>

      {/* 2. Tarjetas KPI Superiores (Resumen Ejecutivo) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* KPI 1: EVENTOS ESTE MES */}
        <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[11px] font-bold tracking-wider uppercase text-slate-500">
              EVENTOS ESTE MES
            </span>
            <div className="text-2xl font-bold text-slate-900 font-mono">
              {kpis.eventosEsteMes}
            </div>
            <p className="text-[11px] text-slate-400">
              Citaciones y vencimientos en {MONTH_NAMES_ES[currentMonth]}
            </p>
          </div>
          <div className="h-10 w-10 rounded-xl bg-orange-50 text-[#E05A10] border border-orange-200 flex items-center justify-center">
            <CalendarClock className="h-5 w-5" />
          </div>
        </div>

        {/* KPI 2: AUDIENCIAS PROGRAMADAS */}
        <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[11px] font-bold tracking-wider uppercase text-slate-500">
              AUDIENCIAS PROGRAMADAS
            </span>
            <div className="text-2xl font-bold text-emerald-600 font-mono">
              {kpis.audienciasProgramadas}
            </div>
            <p className="text-[11px] text-slate-400">
              Audiencias de juicios pendientes por celebrar
            </p>
          </div>
          <div className="h-10 w-10 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center">
            <Gavel className="h-5 w-5" />
          </div>
        </div>

        {/* KPI 3: MULTAS / COMPARENDOS PRÓXIMOS */}
        <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[11px] font-bold tracking-wider uppercase text-slate-500">
              MULTAS / COMPARENDOS PRÓXIMOS
            </span>
            <div className="text-2xl font-bold text-rose-600 font-mono">
              {kpis.multasComparendosProximos}
            </div>
            <p className="text-[11px] text-slate-400">
              Sanciones o citaciones con vencimiento
            </p>
          </div>
          <div className="h-10 w-10 rounded-xl bg-rose-50 text-rose-600 border border-rose-200 flex items-center justify-center">
            <FileWarning className="h-5 w-5" />
          </div>
        </div>
      </div>

      {/* 3. Selector de Vistas Dúo & Filtros */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          {/* Pestañas de Vista (Dúo) */}
          <div className="flex items-center p-1 rounded-lg bg-slate-100 border border-slate-200 self-start">
            <button
              type="button"
              onClick={() => setViewMode("CALENDARIO")}
              className={cn(
                "inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer",
                viewMode === "CALENDARIO"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              )}
            >
              <CalendarDays className="h-3.5 w-3.5 text-[#E05A10]" />
              <span>Vista Calendario (Mensual)</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("AGENDA")}
              className={cn(
                "inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer",
                viewMode === "AGENDA"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              )}
            >
              <Clock className="h-3.5 w-3.5 text-[#E05A10]" />
              <span>Lista Cronológica (Agenda)</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-slate-100 text-slate-600 border border-slate-200">
                {filteredEvents.length}
              </span>
            </button>
          </div>

          {/* Filtros Rápidos */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Buscador */}
            <div className="relative min-w-[220px]">
              <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar RIT, trabajador, multa..."
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg bg-slate-50 border border-slate-200 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#E05A10]/20 focus:border-[#E05A10]"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            {/* Filtro por Tipo de Evento */}
            <select
              value={tipoFilter}
              onChange={(e) => setTipoFilter(e.target.value as any)}
              className="px-2.5 py-1.5 text-xs rounded-lg bg-slate-50 border border-slate-200 text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-[#E05A10]/20 focus:border-[#E05A10]"
            >
              <option value="TODOS">Todos los Eventos</option>
              <option value="AUDIENCIA_JUICIO">🟢 Audiencias Juicio</option>
              <option value="MULTA">🔴 Multas</option>
              <option value="COMPARENDO">🔵 Comparendos</option>
            </select>

            {/* Filtro por Estado */}
            <select
              value={estadoFilter}
              onChange={(e) => setEstadoFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs rounded-lg bg-slate-50 border border-slate-200 text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-[#E05A10]/20 focus:border-[#E05A10]"
            >
              <option value="TODOS">Todos los Estados</option>
              <option value="PENDIENTE">Solo Pendientes</option>
              <option value="CONCLUIDO">Concluidos / Pagados</option>
            </select>
          </div>
        </div>
      </div>

      {/* 4. RENDERIZADO SEGÚN VISTA SELECCIONADA */}
      {viewMode === "CALENDARIO" ? (
        /* ================= VISTA 1: CALENDARIO MENSUAL ================= */
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          {/* Navegador de Mes & Leyenda */}
          <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-slate-50/50">
            {/* Controles de Navegación de Mes */}
            <div className="flex items-center gap-3">
              <h2 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
                <span>{MONTH_NAMES_ES[currentMonth]}</span>
                <span className="text-[#E05A10] font-mono">{currentYear}</span>
              </h2>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handlePrevMonth}
                  className="p-1 rounded-md border border-slate-200 bg-white hover:bg-slate-100 text-slate-600 transition-colors cursor-pointer"
                  title="Mes anterior"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={handleNextMonth}
                  className="p-1 rounded-md border border-slate-200 bg-white hover:bg-slate-100 text-slate-600 transition-colors cursor-pointer"
                  title="Mes siguiente"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={handleGoToToday}
                  className="px-2.5 py-1 rounded-md border border-slate-200 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-700 transition-colors ml-1 cursor-pointer"
                >
                  Hoy
                </button>
              </div>
            </div>

            {/* Leyenda de Colores */}
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <span className="flex items-center gap-1.5 font-medium text-slate-600">
                <span className="h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-emerald-100" />
                <span>Audiencia Juicio</span>
              </span>
              <span className="flex items-center gap-1.5 font-medium text-slate-600">
                <span className="h-2 w-2 rounded-full bg-rose-500 ring-2 ring-rose-100" />
                <span>Vencimiento Multa</span>
              </span>
              <span className="flex items-center gap-1.5 font-medium text-slate-600">
                <span className="h-2 w-2 rounded-full bg-sky-500 ring-2 ring-sky-100" />
                <span>Comparendo</span>
              </span>
            </div>
          </div>

          {/* Días de la Semana Header */}
          <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-100/70 text-center">
            {DAYS_OF_WEEK_ES.map((d, i) => (
              <div
                key={d}
                className={cn(
                  "py-2 text-[11px] font-bold uppercase tracking-wider",
                  i >= 5 ? "text-slate-400" : "text-slate-600"
                )}
              >
                {d}
              </div>
            ))}
          </div>

          {/* Grilla Mensual de Celdas */}
          <div className="grid grid-cols-7 divide-x divide-y divide-slate-200 bg-slate-200">
            {calendarDays.map((day, idx) => {
              const dayEvents = eventsByDate.get(day.dateString) || [];
              const hasEvents = dayEvents.length > 0;

              return (
                <div
                  key={`${day.dateString}-${idx}`}
                  className={cn(
                    "min-h-[110px] sm:min-h-[125px] p-2 flex flex-col justify-between transition-colors",
                    day.isCurrentMonth ? "bg-white" : "bg-slate-50/60 text-slate-400",
                    day.isToday && "ring-2 ring-[#E05A10] ring-inset bg-orange-50/15"
                  )}
                >
                  {/* Encabezado del día */}
                  <div className="flex items-center justify-between mb-1.5">
                    <span
                      className={cn(
                        "text-xs font-mono font-bold inline-flex items-center justify-center rounded-full h-6 w-6",
                        day.isToday
                          ? "bg-[#E05A10] text-white shadow-xs"
                          : day.isCurrentMonth
                          ? "text-slate-700"
                          : "text-slate-400"
                      )}
                    >
                      {day.dayNumber}
                    </span>
                    {hasEvents && (
                      <span className="text-[10px] font-mono text-slate-400 font-medium">
                        {dayEvents.length} {dayEvents.length === 1 ? "ev." : "evs."}
                      </span>
                    )}
                  </div>

                  {/* Lista de Píldoras / Badges del Día */}
                  <div className="space-y-1 overflow-y-auto max-h-[85px] pr-0.5">
                    {dayEvents.slice(0, 3).map((ev) => {
                      const meta = getEventBadgeMeta(ev.tipo_evento);
                      const Icon = meta.icon;

                      return (
                        <button
                          key={ev.evento_id}
                          type="button"
                          onClick={() => setSelectedEvent(ev)}
                          title={`${ev.identificador} · ${ev.titulo}\n${ev.detalle}`}
                          className={cn(
                            "w-full text-left px-1.5 py-1 rounded text-[10px] font-medium border flex items-center gap-1 transition-all cursor-pointer truncate shadow-2xs",
                            meta.pillClass
                          )}
                        >
                          <span
                            className={cn("h-1.5 w-1.5 rounded-full shrink-0", meta.dotColor)}
                          />
                          <Icon className="h-2.5 w-2.5 shrink-0 opacity-75" />
                          <span className="font-mono font-bold truncate">
                            {ev.identificador}
                          </span>
                          <span className="truncate opacity-80 font-normal">
                            · {ev.titulo}
                          </span>
                        </button>
                      );
                    })}

                    {dayEvents.length > 3 && (
                      <button
                        type="button"
                        onClick={() => setSelectedEvent(dayEvents[0])}
                        className="w-full text-center py-0.5 text-[9px] font-semibold text-[#E05A10] hover:underline"
                      >
                        +{dayEvents.length - 3} más...
                      </button>
                    )}
                  </div>

                  {/* Espaciador inferior */}
                  <div />
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* ================= VISTA 2: LISTA CRONOLÓGICA (AGENDA) ================= */
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                  <th className="py-3 px-3.5">FECHA PROGRAMADA</th>
                  <th className="py-3 px-3.5">TIPO DE EVENTO</th>
                  <th className="py-3 px-3.5">IDENTIFICADOR / CAUSA</th>
                  <th className="py-3 px-3.5">DESCRIPCIÓN / RESULTADO ESPERADO</th>
                  <th className="py-3 px-3.5 text-center">DÍAS RESTANTES</th>
                  <th className="py-3 px-3.5 text-center whitespace-nowrap">ACCIONES</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredEvents.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-12 text-slate-400">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <CalendarClock className="h-8 w-8 text-slate-300 stroke-1" />
                        <p className="text-xs font-medium">
                          No se encontraron eventos programados para los filtros seleccionados.
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredEvents.map((ev) => {
                    const meta = getEventBadgeMeta(ev.tipo_evento);
                    const Icon = meta.icon;
                    const daysInfo = getDaysRemainingInfo(ev.fecha_evento);

                    return (
                      <tr
                        key={ev.evento_id}
                        className="hover:bg-slate-50/70 transition-colors"
                      >
                        {/* 1. FECHA PROGRAMADA */}
                        <td className="py-3 px-3.5 whitespace-nowrap font-mono">
                          <div className="font-semibold text-slate-900">
                            {formatDateCL(ev.fecha_evento)}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {new Date(ev.fecha_evento + "T00:00:00").toLocaleDateString(
                              "es-CL",
                              { weekday: "long" }
                            )}
                          </div>
                        </td>

                        {/* 2. TIPO DE EVENTO */}
                        <td className="py-3 px-3.5 whitespace-nowrap">
                          <span
                            className={cn(
                              "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border",
                              meta.pillClass
                            )}
                          >
                            <Icon className="h-3 w-3" />
                            <span>{meta.label}</span>
                          </span>
                        </td>

                        {/* 3. IDENTIFICADOR / CAUSA */}
                        <td className="py-3 px-3.5">
                          <div className="font-mono font-bold text-slate-900">
                            {ev.identificador}
                          </div>
                          <div className="text-[11px] text-slate-500 font-medium truncate max-w-[240px]">
                            {ev.titulo}
                          </div>
                        </td>

                        {/* 4. DESCRIPCIÓN / RESULTADO ESPERADO */}
                        <td className="py-3 px-3.5 max-w-[320px]">
                          <div
                            className="text-xs text-slate-700 font-medium line-clamp-2 leading-relaxed"
                            title={ev.detalle}
                          >
                            {ev.detalle}
                          </div>
                          {ev.monto && (
                            <div className="text-[10px] font-mono font-semibold text-slate-500 mt-0.5">
                              Monto: {formatCLP(ev.monto)}
                            </div>
                          )}
                        </td>

                        {/* 5. DÍAS RESTANTES */}
                        <td className="py-3 px-3.5 text-center whitespace-nowrap">
                          <span
                            className={cn(
                              "px-2.5 py-0.5 rounded-full text-[10px] border",
                              daysInfo.badgeClass
                            )}
                          >
                            {daysInfo.label}
                          </span>
                        </td>

                        {/* 6. ACCIONES */}
                        <td className="py-3 px-3.5 text-center whitespace-nowrap">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setSelectedEvent(ev)}
                              title="Ver ficha del evento"
                              className="p-1 rounded text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                            <Link
                              href={ev.ruta_origen}
                              title={`Ir al módulo ${meta.label}`}
                              className="p-1 rounded text-[#E05A10] hover:text-[#c94e0d] hover:bg-orange-50 transition-colors cursor-pointer"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </Link>
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
      )}

      {/* 5. MODAL DETALLE DE EVENTO AL HACER CLIC */}
      {selectedEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden animate-in zoom-in-95 duration-150">
            {/* Header del Modal */}
            <div className="px-5 py-4 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div
                  className={cn(
                    "p-2 rounded-lg border",
                    getEventBadgeMeta(selectedEvent.tipo_evento).pillClass
                  )}
                >
                  {React.createElement(
                    getEventBadgeMeta(selectedEvent.tipo_evento).icon,
                    { className: "h-4 w-4" }
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-slate-900">
                      {selectedEvent.identificador}
                    </span>
                    <span
                      className={cn(
                        "px-2 py-0.2 rounded-full text-[10px] font-semibold border",
                        getEventBadgeMeta(selectedEvent.tipo_evento).pillClass
                      )}
                    >
                      {getEventBadgeMeta(selectedEvent.tipo_evento).label}
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-slate-800 mt-0.5 truncate max-w-[340px]">
                    {selectedEvent.titulo}
                  </h3>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedEvent(null)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-md transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Cuerpo del Modal */}
            <div className="p-5 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3 p-3 rounded-lg bg-slate-50 border border-slate-200">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
                    Fecha Programada
                  </span>
                  <div className="font-mono font-bold text-slate-900 text-sm">
                    {formatDateCL(selectedEvent.fecha_evento)}
                  </div>
                  <div className="mt-1">
                    <span
                      className={cn(
                        "px-2 py-0.5 rounded text-[10px] border inline-block",
                        getDaysRemainingInfo(selectedEvent.fecha_evento).badgeClass
                      )}
                    >
                      {getDaysRemainingInfo(selectedEvent.fecha_evento).label}
                    </span>
                  </div>
                </div>

                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
                    Estado General
                  </span>
                  <div>
                    <span
                      className={cn(
                        "px-2 py-0.5 rounded text-[11px] font-semibold border inline-block",
                        selectedEvent.estado_general === "CONCLUIDO" ||
                          selectedEvent.estado_general === "PAGADA"
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : "bg-amber-50 text-amber-700 border-amber-200"
                      )}
                    >
                      {selectedEvent.estado_general}
                    </span>
                  </div>
                  {selectedEvent.monto && (
                    <div className="mt-2 text-slate-700">
                      <span className="text-[10px] text-slate-400 block">
                        Monto Involucrado
                      </span>
                      <span className="font-mono font-bold text-slate-900">
                        {formatCLP(selectedEvent.monto)}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Detalle del Evento */}
              <div className="space-y-1">
                <span className="text-[11px] font-semibold text-slate-700 block">
                  Detalle / Resultado Registrado
                </span>
                <p className="p-3 rounded-lg border border-slate-200 bg-white text-slate-700 leading-relaxed font-medium">
                  {selectedEvent.detalle}
                </p>
              </div>

              {/* Materia / Observaciones */}
              {selectedEvent.entidad_o_materia && (
                <div>
                  <span className="text-[11px] font-semibold text-slate-700 block mb-0.5">
                    Materia / Entidad Emisora
                  </span>
                  <p className="text-slate-600 font-medium">
                    {selectedEvent.entidad_o_materia}
                  </p>
                </div>
              )}

              {selectedEvent.observaciones && (
                <div>
                  <span className="text-[11px] font-semibold text-slate-700 block mb-0.5">
                    Observaciones
                  </span>
                  <p className="text-slate-500 italic text-[11px]">
                    {selectedEvent.observaciones}
                  </p>
                </div>
              )}
            </div>

            {/* Footer con Enlace Directo a Gestionar */}
            <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setSelectedEvent(null)}
                className="px-3.5 py-1.5 text-xs text-slate-600 hover:text-slate-900 font-medium cursor-pointer"
              >
                Cerrar
              </button>
              <Link
                href={selectedEvent.ruta_origen}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded-lg bg-[#E05A10] hover:bg-[#c94e0d] text-white shadow-xs transition-colors cursor-pointer"
              >
                <span>Ir a Gestionar en Submódulo</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
