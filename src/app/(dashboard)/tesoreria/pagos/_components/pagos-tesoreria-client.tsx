"use client";

import React, { useState, useMemo, useTransition, useEffect } from "react";
import {
  Calendar,
  Clock,
  Building2,
  Search,
  RotateCcw,
  TrendingDown,
  Award,
  Hash,
  X,
  Layers,
  Banknote,
} from "lucide-react";
import {
  CartolaLinea,
  MantenedorTipoPago,
} from "@/types/database.types";
import {
  CartolasTesoreriaResponse,
  getCartolasBancariasAction,
} from "@/actions/tesoreria.actions";
import { cn, formatCLP } from "@/lib/utils";

interface PagosTesoreriaClientProps {
  initialData: CartolasTesoreriaResponse;
}

// Estructura fija y unívoca para las semanas del mes:
export interface SemanaPeriodo {
  id: string;        // Identificador unívoco estricto, ej: "sem-1", "sem-2"
  label: string;     // Rango de fechas sin la palabra "Semana", ej: "05/10 al 11/10"
  inicio: string;    // "2026-10-05"
  fin: string;       // "2026-10-11"
}

export type SemanaMesInfo = SemanaPeriodo;

interface MonthOption {
  key: string; // "YYYY-MM"
  year: number;
  month: number; // 1-12
  label: string; // "Octubre 2026"
}

const NOMBRES_MESES = [
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

// Normaliza cualquier fecha a string estricto "YYYY-MM-DD" sin usar new Date() (evita desfase UTC)
function normalizarFechaISO(raw: unknown): string {
  const str = String(raw || "").trim();
  if (!str) return "";

  const matchDMY = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (matchDMY) {
    return `${matchDMY[3]}-${matchDMY[2].padStart(2, "0")}-${matchDMY[1].padStart(2, "0")}`;
  }

  return str.slice(0, 10);
}

// Genera las semanas (Viernes a Jueves) que intersecan o componen un mes dado
// Ej: Noviembre 2026 -> 30/10 al 05/11, 06/11 al 12/11, 13/11 al 19/11...
function calcularSemanasDelMes(year: number, month: number): SemanaPeriodo[] {
  const semanas: SemanaPeriodo[] = [];

  // Primer día del mes (en UTC para evitar desfases horarios de zona)
  const primerDia = new Date(Date.UTC(year, month - 1, 1));
  // Último día del mes
  const ultimoDia = new Date(Date.UTC(year, month, 0));

  // Ajustar al viernes de la semana que contiene el primer día del mes
  // getUTCDay(): 0=domingo, 1=lunes, ..., 5=viernes, 6=sábado
  const diasDesdeViernes = (primerDia.getUTCDay() - 5 + 7) % 7;
  const cursorViernes = new Date(primerDia.getTime());
  cursorViernes.setUTCDate(primerDia.getUTCDate() - diasDesdeViernes);

  let index = 1;
  while (cursorViernes <= ultimoDia) {
    const inicioSemana = new Date(cursorViernes.getTime());
    const finSemana = new Date(cursorViernes.getTime());
    finSemana.setUTCDate(cursorViernes.getUTCDate() + 6);

    const yInicio = inicioSemana.getUTCFullYear();
    const mesInicio = String(inicioSemana.getUTCMonth() + 1).padStart(2, "0");
    const diaInicio = String(inicioSemana.getUTCDate()).padStart(2, "0");

    const yFin = finSemana.getUTCFullYear();
    const mesFin = String(finSemana.getUTCMonth() + 1).padStart(2, "0");
    const diaFin = String(finSemana.getUTCDate()).padStart(2, "0");

    const inicio = `${yInicio}-${mesInicio}-${diaInicio}`;
    const fin = `${yFin}-${mesFin}-${diaFin}`;
    const label = `${diaInicio}/${mesInicio} al ${diaFin}/${mesFin}`;

    semanas.push({
      id: `sem-${index}`,
      label,
      inicio,
      fin,
    });

    index++;
    // Avanzar 7 días estrictos
    cursorViernes.setUTCDate(cursorViernes.getUTCDate() + 7);
  }

  return semanas;
}

export function PagosTesoreriaClient({
  initialData,
}: PagosTesoreriaClientProps) {
  const [lineas, setLineas] = useState<CartolaLinea[]>(initialData.lineas);
  const [tiposPago, setTiposPago] = useState<MantenedorTipoPago[]>(
    initialData.tiposPago
  );
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setLineas(initialData.lineas);
    setTiposPago(initialData.tiposPago);
  }, [initialData]);

  // Filtros Superiores
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    // Si hay líneas, tomar el mes del movimiento más reciente o el mes actual
    if (initialData.lineas.length > 0) {
      const fechas = initialData.lineas
        .map((l) => normalizarFechaISO(l.fecha))
        .filter(Boolean)
        .sort();
      const ultima = fechas[fechas.length - 1];
      if (ultima && ultima.length >= 7) {
        return ultima.slice(0, 7); // "YYYY-MM"
      }
    }
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
  });

  // Selector de Semana: "TODAS" o el id unívoco estricto de la semana (ej: "sem-1", "sem-2")
  const [selectedSemanaId, setSelectedSemanaId] = useState<string>("TODAS");
  const [selectedBanco, setSelectedBanco] = useState<string>("TODOS");
  const [searchTerm, setSearchTerm] = useState<string>("");

  const tiposMap = useMemo(
    () => new Map(tiposPago.map((t) => [t.id, t])),
    [tiposPago]
  );

  // Lista de meses disponibles para el selector a partir de los datos o rango actual
  const mesesDisponibles = useMemo<MonthOption[]>(() => {
    const setMeses = new Set<string>();

    lineas.forEach((l) => {
      const fechaStr = normalizarFechaISO(l.fecha);
      if (fechaStr.length >= 7) {
        setMeses.add(fechaStr.slice(0, 7));
      }
    });

    const now = new Date();
    const cur = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    setMeses.add(cur);

    const sorted = Array.from(setMeses).sort((a, b) => b.localeCompare(a));
    return sorted.map((key) => {
      const [yStr, mStr] = key.split("-");
      const year = parseInt(yStr, 10);
      const month = parseInt(mStr, 10);
      return {
        key,
        year,
        month,
        label: `${NOMBRES_MESES[month - 1]} ${year}`,
      };
    });
  }, [lineas]);

  // Semanas dinámicas generadas para el mes seleccionado
  const semanasDelMes = useMemo(() => {
    const [yStr, mStr] = selectedMonth.split("-");
    const year = parseInt(yStr, 10) || new Date().getFullYear();
    const month = parseInt(mStr, 10) || new Date().getMonth() + 1;
    return calcularSemanasDelMes(year, month);
  }, [selectedMonth]);

  // Movimientos bancarios clasificados (considera giro o abono cuando giro === 0)
  const lineasEgresosClasificados = useMemo(() => {
    return lineas.filter((l) => {
      if (!l.tipo_pago_id) return false;
      if (selectedBanco !== "TODOS" && l.banco !== selectedBanco) return false;
      const giro = Math.abs(Number(l.giro || 0));
      const abono = Math.abs(Number(l.abono || 0));
      return (giro > 0 ? giro : abono) > 0;
    });
  }, [lineas, selectedBanco]);

  // Objeto de la semana activa si se seleccionó una en particular por comparación unívoca estricta de id
  const activeSemanaObj = useMemo(() => {
    if (selectedSemanaId === "TODAS") return null;
    return semanasDelMes.find((s) => s.id === selectedSemanaId) || null;
  }, [selectedSemanaId, semanasDelMes]);

  // CONSTRUCCIÓN DE LA MATRIZ PIVOT TABLE
  const { matrizFilas, totalesSemanales, granTotalMes, topCategoria } = useMemo(() => {
    const categoriasSet = new Set<string>();

    tiposPago.forEach((tp) => {
      if (tp.activo !== false) {
        categoriasSet.add(tp.nombre.toUpperCase());
      }
    });

    lineasEgresosClasificados.forEach((l) => {
      const nombre =
        l.tipo_pago?.nombre ||
        (l.tipo_pago_id ? tiposMap.get(l.tipo_pago_id)?.nombre : null);
      if (nombre) {
        categoriasSet.add(nombre.toUpperCase());
      }
    });

    const matriz: Record<
      string,
      { semanas: Record<string, number>; totalCategoria: number }
    > = {};

    categoriasSet.forEach((cat) => {
      matriz[cat] = {
        semanas: {},
        totalCategoria: 0,
      };
      semanasDelMes.forEach((sem) => {
        matriz[cat].semanas[sem.id] = 0;
      });
    });

    lineasEgresosClasificados.forEach((l) => {
      const cat = (
        l.tipo_pago?.nombre ||
        (l.tipo_pago_id ? tiposMap.get(l.tipo_pago_id)?.nombre : null) ||
        ""
      ).toUpperCase();

      if (!cat || !matriz[cat]) return;

      const giro = Math.abs(Number(l.giro || 0));
      const abono = Math.abs(Number(l.abono || 0));
      const monto = giro > 0 ? giro : abono;
      if (monto <= 0) return;

      // Asignar a la semana correspondiente usando comparación estricta de string YYYY-MM-DD
      const fechaStr = normalizarFechaISO(l.fecha);
      const semanaMatch = semanasDelMes.find(
        (sem) => fechaStr >= sem.inicio && fechaStr <= sem.fin
      );

      if (semanaMatch) {
        matriz[cat].semanas[semanaMatch.id] =
          (matriz[cat].semanas[semanaMatch.id] || 0) + monto;
        matriz[cat].totalCategoria += monto;
      }
    });

    const totalesSem: Record<string, number> = {};
    semanasDelMes.forEach((sem) => {
      totalesSem[sem.id] = 0;
    });

    let granTotal = 0;
    Object.values(matriz).forEach((data) => {
      semanasDelMes.forEach((sem) => {
        totalesSem[sem.id] += data.semanas[sem.id] || 0;
      });
      granTotal += data.totalCategoria;
    });

    const filas = Array.from(categoriasSet)
      .map((cat) => ({
        categoria: cat,
        semanas: matriz[cat].semanas,
        totalCategoria: matriz[cat].totalCategoria,
      }))
      .sort((a, b) => {
        if (b.totalCategoria !== a.totalCategoria) {
          return b.totalCategoria - a.totalCategoria;
        }
        return a.categoria.localeCompare(b.categoria, "es");
      });

    const top = filas.find((f) => f.totalCategoria > 0) || null;

    return {
      matrizFilas: filas,
      totalesSemanales: totalesSem,
      granTotalMes: granTotal,
      topCategoria: top,
    };
  }, [tiposPago, lineasEgresosClasificados, semanasDelMes, tiposMap]);

  // Filtrado de filas por buscador de texto
  const filasFiltradas = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return matrizFilas;
    return matrizFilas.filter((f) => f.categoria.toLowerCase().includes(q));
  }, [matrizFilas, searchTerm]);

  // KPI Dinámico: Total egresos según si hay una semana elegida o el consolidado mensual
  const totalEgresosPeriodo = useMemo(() => {
    if (activeSemanaObj) {
      return totalesSemanales[activeSemanaObj.id] || 0;
    }
    return granTotalMes;
  }, [activeSemanaObj, totalesSemanales, granTotalMes]);

  // Recuento de movimientos del mes o de la semana elegida
  const movimientosPeriodoCount = useMemo(() => {
    if (semanasDelMes.length === 0) return 0;

    if (activeSemanaObj) {
      return lineasEgresosClasificados.filter((l) => {
        const fechaStr = normalizarFechaISO(l.fecha);
        return fechaStr >= activeSemanaObj.inicio && fechaStr <= activeSemanaObj.fin;
      }).length;
    }

    const minFecha = semanasDelMes[0].inicio;
    const maxFecha = semanasDelMes[semanasDelMes.length - 1].fin;
    return lineasEgresosClasificados.filter((l) => {
      const fechaStr = normalizarFechaISO(l.fecha);
      return fechaStr >= minFecha && fechaStr <= maxFecha;
    }).length;
  }, [lineasEgresosClasificados, semanasDelMes, activeSemanaObj]);

  const handleRefresh = () => {
    startTransition(async () => {
      const fresh = await getCartolasBancariasAction();
      setLineas(fresh.lineas);
      setTiposPago(fresh.tiposPago);
    });
  };

  const mesLabelActual =
    mesesDisponibles.find((m) => m.key === selectedMonth)?.label ||
    selectedMonth;

  return (
    <div className="bg-[#F8FAFC] min-h-screen space-y-5">
      {/* 1. ENCABEZADO EJECUTIVO (Esquina superior derecha limpia sin botones) */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-[#0B1528] flex items-center justify-center text-white shadow-sm">
            <Layers className="h-5 w-5 text-[#E05A10]" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="font-black text-xl text-slate-900 tracking-tight uppercase">
                PAGOS: MATRIZ ANALÍTICA SEMANAL
              </h1>
              <span className="bg-orange-50 border border-orange-200 text-orange-600 text-xs font-semibold px-2.5 py-0.5 rounded-md">
                Pivot Table Egresos
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Consolidación comparativa de egresos bancarios clasificados por concepto semana tras semana
            </p>
          </div>
        </div>

        {/* Espacio superior derecho limpio y despejado */}
        <div className="hidden sm:block" />
      </div>

      {/* 2. MÉTRICAS SUPERIORES KPI */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
        {/* KPI 1: TOTAL EGRESOS DEL PERÍODO (Recalcula según semana seleccionada o mes) */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              {activeSemanaObj
                ? `TOTAL EGRESOS (${activeSemanaObj.label})`
                : "TOTAL EGRESOS DEL PERÍODO"}
            </span>
            <div className="h-7 w-7 rounded-lg bg-rose-50 border border-rose-100 flex items-center justify-center">
              <TrendingDown className="h-4 w-4 text-rose-600" />
            </div>
          </div>
          <span className="text-2xl font-black text-slate-900 font-mono mt-2">
            {formatCLP(totalEgresosPeriodo)}
          </span>
          <span className="text-[11px] text-slate-400 mt-1">
            {activeSemanaObj
              ? `Sumatoria de giros exclusivamente del período ${activeSemanaObj.label}`
              : `Suma acumulada de todas las semanas en ${mesLabelActual}`}
          </span>
        </div>

        {/* KPI 2: CATEGORÍA PRINCIPAL */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              CATEGORÍA PRINCIPAL
            </span>
            <div className="h-7 w-7 rounded-lg bg-orange-50 border border-orange-100 flex items-center justify-center">
              <Award className="h-4 w-4 text-[#E05A10]" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <span className="text-lg font-black text-slate-900 truncate">
              {topCategoria ? topCategoria.categoria : "—"}
            </span>
            {topCategoria && topCategoria.totalCategoria > 0 && (
              <span className="text-xs font-mono font-bold text-[#E05A10] shrink-0">
                {formatCLP(topCategoria.totalCategoria)}
              </span>
            )}
          </div>
          <span className="text-[11px] text-slate-400 mt-1">
            Concepto con mayor volumen de egreso en el mes
          </span>
        </div>

        {/* KPI 3: N° MOVIMIENTOS Y ENFOQUE */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              {activeSemanaObj ? "ENFOQUE SEMANAL" : "SEMANAS & MOVIMIENTOS"}
            </span>
            <div className="h-7 w-7 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center">
              <Hash className="h-4 w-4 text-slate-700" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900 font-mono">
              {activeSemanaObj ? activeSemanaObj.label : semanasDelMes.length}
            </span>
            <span className="text-xs font-bold text-slate-400">
              {activeSemanaObj
                ? `— ${movimientosPeriodoCount} giros en este rango`
                : `semanas / ${movimientosPeriodoCount} giros clasificados`}
            </span>
          </div>
          <span className="text-[11px] text-slate-400 mt-1">
            {activeSemanaObj
              ? `Rango auditado: ${activeSemanaObj.inicio} al ${activeSemanaObj.fin}`
              : `Período analítico seleccionado: ${mesLabelActual}`}
          </span>
        </div>
      </div>

      {/* 3. FILTROS Y CONTROLES SUPERIORES */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          {/* Selector 1: Mes de Análisis */}
          <div className="flex items-center gap-2 min-w-[210px]">
            <Calendar className="h-4 w-4 text-[#E05A10] shrink-0" />
            <div className="flex flex-col flex-1">
              <span className="text-[9px] font-bold uppercase text-slate-400 leading-none mb-1">
                Mes de Análisis
              </span>
              <select
                value={selectedMonth}
                onChange={(e) => {
                  setSelectedMonth(e.target.value);
                  setSelectedSemanaId("TODAS"); // Reset de semana al cambiar mes
                }}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-900 focus:border-[#E05A10] focus:outline-none"
              >
                {mesesDisponibles.map((m) => (
                  <option key={m.key} value={m.key}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Selector 2: Semana (Inmediatamente al lado de Mes) */}
          <div className="flex items-center gap-2 min-w-[240px]">
            <Clock className="h-4 w-4 text-[#E05A10] shrink-0" />
            <div className="flex flex-col flex-1">
              <span className="text-[9px] font-bold uppercase text-slate-400 leading-none mb-1">
                Semana
              </span>
              <select
                value={selectedSemanaId}
                onChange={(e) => setSelectedSemanaId(e.target.value)}
                className={cn(
                  "w-full rounded-lg border px-3 py-1.5 text-xs font-bold focus:border-[#E05A10] focus:outline-none transition-colors",
                  selectedSemanaId !== "TODAS"
                    ? "border-[#E05A10] bg-orange-50/50 text-[#E05A10]"
                    : "border-slate-300 bg-white text-slate-900"
                )}
              >
                <option value="TODAS">Todas las Semanas (Consolidado Mensual)</option>
                {semanasDelMes.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Selector 3: Banco Emisor */}
          <div className="flex items-center gap-2 shrink-0">
            <Building2 className="h-4 w-4 text-slate-400 shrink-0" />
            <div className="flex flex-col">
              <span className="text-[9px] font-bold uppercase text-slate-400 leading-none mb-1">
                Banco Emisor
              </span>
              <select
                value={selectedBanco}
                onChange={(e) => setSelectedBanco(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 focus:border-[#E05A10] focus:outline-none"
              >
                <option value="TODOS">Todos los Bancos</option>
                <option value="Banco Itaú">Banco Itaú</option>
                <option value="Banco Santander">Banco Santander</option>
              </select>
            </div>
          </div>

          {/* Buscador de Clasificación */}
          <div className="relative flex-1 min-w-[200px]">
            <span className="text-[9px] font-bold uppercase text-slate-400 leading-none mb-1 block">
              Filtrar por Concepto
            </span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar clasificación..."
                className="w-full rounded-lg border border-slate-300 bg-[#F8FAFC] pl-8 pr-8 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-[#E05A10] focus:outline-none transition-colors"
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
          </div>

          {/* Refrescar */}
          <div className="flex items-end shrink-0 pt-3 lg:pt-0">
            <button
              type="button"
              onClick={handleRefresh}
              disabled={isPending}
              className="rounded-lg border border-slate-300 bg-white p-2 text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
              title="Actualizar datos"
            >
              <RotateCcw
                className={cn("h-4 w-4", isPending && "animate-spin text-[#E05A10]")}
              />
            </button>
          </div>
        </div>
      </div>

      {/* 4. TABLA PRINCIPAL: MATRIZ ANALÍTICA PIVOT TABLE */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-[850px] lg:min-w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-600 text-[11px] font-bold uppercase tracking-wider border-b border-slate-200">
                {/* Columna 1: Clasificación (Fijada a la izquierda con ancho cómodo) */}
                <th className="py-3 px-4 whitespace-nowrap min-w-[220px]">
                  1. CLASIFICACIÓN
                </th>

                {/* Columnas Dinámicas por Semana (Encabezado con rango de fechas sin la palabra "Semana") */}
                {semanasDelMes.map((sem) => {
                  // Comparación ESTRICTA de igualdad por id único
                  const isHighlighted = selectedSemanaId !== "TODAS" && selectedSemanaId === sem.id;
                  return (
                    <th
                      key={sem.id}
                      className={cn(
                        "py-3 px-3.5 text-right whitespace-nowrap font-mono text-[11px] transition-colors",
                        isHighlighted
                          ? "bg-[#E05A10] text-white shadow-inner font-extrabold"
                          : "text-slate-200"
                      )}
                    >
                      {sem.label}
                    </th>
                  );
                })}

                {/* Columna Final: Total Fila */}
                <th className="py-3 px-4 text-right whitespace-nowrap font-mono text-[11px] bg-[#080E1C] text-[#E05A10] min-w-[150px]">
                  TOTAL CATEGORÍA
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200/80 text-xs bg-white">
              {filasFiltradas.length === 0 ? (
                <tr>
                  <td
                    colSpan={semanasDelMes.length + 2}
                    className="py-14 text-center text-slate-500"
                  >
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Banknote className="h-9 w-9 text-slate-300" />
                      <p className="text-sm font-bold text-slate-700">
                        No se encontraron registros de egresos para {mesLabelActual}
                      </p>
                      <p className="text-xs text-slate-400 max-w-md">
                        Verifica que existan movimientos clasificados con giros bancarios en este mes o selecciona otro período.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filasFiltradas.map((fila) => {
                  const tieneMovimientos = fila.totalCategoria > 0;

                  return (
                    <tr
                      key={fila.categoria}
                      className="hover:bg-slate-50/80 transition-colors"
                    >
                      {/* Columna 1: CLASIFICACIÓN */}
                      <td className="py-3 px-4 whitespace-nowrap font-bold text-slate-900">
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "h-2 w-2 rounded-full shrink-0",
                              tieneMovimientos ? "bg-[#E05A10]" : "bg-slate-300"
                            )}
                          />
                          <span className="truncate">{fila.categoria}</span>
                        </div>
                      </td>

                      {/* Celdas Semanales con resalto estricto de semana única */}
                      {semanasDelMes.map((sem) => {
                        const monto = fila.semanas[sem.id] || 0;
                        // Comparación ESTRICTA de igualdad por id único
                        const isHighlighted = selectedSemanaId !== "TODAS" && selectedSemanaId === sem.id;

                        return (
                          <td
                            key={sem.id}
                            className={cn(
                              "py-3 px-3.5 text-right whitespace-nowrap font-mono transition-colors",
                              isHighlighted
                                ? "bg-orange-50/90 font-black text-orange-900 border-x-2 border-orange-300"
                                : ""
                            )}
                          >
                            {monto > 0 ? (
                              <span
                                className={cn(
                                  "font-bold",
                                  isHighlighted ? "text-[#E05A10]" : "text-slate-900"
                                )}
                              >
                                {formatCLP(monto)}
                              </span>
                            ) : (
                              <span className={cn(isHighlighted ? "text-orange-300 font-medium" : "text-slate-300")}>
                                —
                              </span>
                            )}
                          </td>
                        );
                      })}

                      {/* Columna Final: TOTAL CATEGORÍA */}
                      <td className="py-3 px-4 text-right whitespace-nowrap font-mono font-black text-slate-900 bg-slate-50/90">
                        {fila.totalCategoria > 0 ? (
                          formatCLP(fila.totalCategoria)
                        ) : (
                          <span className="text-slate-400 font-normal">$ 0</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>

            {/* C. Fila de Totales Semanales */}
            <tfoot>
              <tr className="bg-slate-100 text-slate-900 font-bold text-xs border-t-2 border-slate-300">
                <td className="py-3.5 px-4 whitespace-nowrap uppercase tracking-wider font-extrabold text-slate-800">
                  TOTAL EGRESOS SEMANALES
                </td>

                {semanasDelMes.map((sem) => {
                  const totalSem = totalesSemanales[sem.id] || 0;
                  // Comparación ESTRICTA de igualdad por id único
                  const isHighlighted = selectedSemanaId !== "TODAS" && selectedSemanaId === sem.id;

                  return (
                    <td
                      key={sem.id}
                      className={cn(
                        "py-3.5 px-3.5 text-right whitespace-nowrap font-mono font-black transition-colors",
                        isHighlighted
                          ? "bg-orange-50 text-[#E05A10] font-black border-x-2 border-orange-300"
                          : "text-slate-900"
                      )}
                    >
                      {totalSem > 0 ? (
                        formatCLP(totalSem)
                      ) : (
                        <span className="text-slate-400 font-normal">$ 0</span>
                      )}
                    </td>
                  );
                })}

                {/* Gran Total Consolidado */}
                <td className="py-3.5 px-4 text-right whitespace-nowrap font-mono font-black text-[#E05A10] bg-[#070D18] text-sm">
                  {formatCLP(granTotalMes)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Footer Informativo */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-t border-slate-200 bg-slate-50/80 px-4 py-3 text-xs text-slate-600">
          <div>
            Mostrando{" "}
            <span className="font-bold text-slate-900">
              {filasFiltradas.length}
            </span>{" "}
            conceptos analizados en{" "}
            <span className="font-bold text-slate-900">{mesLabelActual}</span>
            {activeSemanaObj && (
              <span className="text-orange-600 font-bold ml-1.5">
                (Enfoque activo: {activeSemanaObj.label})
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span>Gran Total Acumulado:</span>
            <span className="font-mono font-black text-slate-900 text-sm">
              {formatCLP(granTotalMes)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
