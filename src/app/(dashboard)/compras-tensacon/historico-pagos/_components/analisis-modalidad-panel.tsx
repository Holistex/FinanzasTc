"use client";

import React, { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BarChart3, TrendingUp, Eye, EyeOff } from "lucide-react";
import { PagoCompraHistorico } from "@/types/database.types";
import { formatCLP, toDateOnlyString } from "@/lib/utils";

type ModalidadSeriesKey =
  | "directo"
  | "compraTc"
  | "cheque"
  | "factoring"
  | "confirming";

interface SeriesConfig {
  key: ModalidadSeriesKey;
  label: string;
  color: string;
  gradientId: string;
  badgeClass: string;
}

const SERIES_CONFIG: SeriesConfig[] = [
  {
    key: "directo",
    label: "Directo",
    color: "#10B981",
    gradientId: "gradDirecto",
    badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  {
    key: "compraTc",
    label: "Compra TC",
    color: "#E05A10",
    gradientId: "gradCompraTc",
    badgeClass: "bg-orange-50 text-[#E05A10] border-orange-200",
  },
  {
    key: "cheque",
    label: "Cheque",
    color: "#8B5CF6",
    gradientId: "gradCheque",
    badgeClass: "bg-purple-50 text-purple-700 border-purple-200",
  },
  {
    key: "factoring",
    label: "Factoring",
    color: "#3B82F6",
    gradientId: "gradFactoring",
    badgeClass: "bg-blue-50 text-blue-700 border-blue-200",
  },
  {
    key: "confirming",
    label: "Confirming",
    color: "#F59E0B",
    gradientId: "gradConfirming",
    badgeClass: "bg-amber-50 text-amber-700 border-amber-200",
  },
];

const MESES_CORTOS_ES = [
  "Ene",
  "Feb",
  "Mar",
  "Abr",
  "May",
  "Jun",
  "Jul",
  "Ago",
  "Sep",
  "Oct",
  "Nov",
  "Dic",
];

const MESES_LARGOS_ES = [
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

function formatMonthShort(ym: string): string {
  const [y, m] = ym.split("-");
  const idx = Number(m) - 1;
  if (!y || idx < 0 || idx > 11) return ym;
  return `${MESES_CORTOS_ES[idx]} ${y.slice(-2)}`;
}

function formatMonthLong(ym: string): string {
  const [y, m] = ym.split("-");
  const idx = Number(m) - 1;
  if (!y || idx < 0 || idx > 11) return ym;
  return `${MESES_LARGOS_ES[idx]} ${y}`;
}

function formatYAxisMillions(value: number): string {
  if (!value || value === 0) return "$ 0";
  const abs = Math.abs(value);
  if (abs >= 1_000_000) {
    const millions = value / 1_000_000;
    const formatted = Number.isInteger(millions)
      ? millions.toFixed(0)
      : millions.toFixed(1).replace(/\.0$/, "");
    return `$ ${formatted}M`;
  }
  if (abs >= 1_000) {
    return `$ ${Math.round(value / 1_000)}K`;
  }
  return `$ ${value}`;
}

function resolveSeriesKey(modalidadRaw: unknown): ModalidadSeriesKey | null {
  const mod = String(modalidadRaw || "")
    .trim()
    .toUpperCase()
    .replace(/_/g, " ");

  if (mod === "COMPRA TC") return "compraTc";
  if (mod === "CHEQUE") return "cheque";
  if (mod === "FACTORING") return "factoring";
  if (mod === "CONFIRMING") return "confirming";
  if (
    mod === "DIRECTO" ||
    mod === "DEUDA PROVEEDOR" ||
    mod === "TRANSFERENCIA" ||
    mod === "EFECTIVO" ||
    mod === "PAGADA"
  ) {
    return "directo";
  }
  return null;
}

interface MonthlyPoint {
  ym: string;
  mesLabel: string;
  mesLong: string;
  directo: number;
  compraTc: number;
  cheque: number;
  factoring: number;
  confirming: number;
  totalMes: number;
}

interface TooltipPayloadItem {
  dataKey?: string;
  value?: number;
  color?: string;
  name?: string;
  payload?: MonthlyPoint;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadItem[];
}

function ExecutiveMonthlyTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload;
  if (!point) return null;

  const visibleEntries = SERIES_CONFIG.filter((cfg) => {
    const inPayload = payload.some((p) => p.dataKey === cfg.key);
    return inPayload && point[cfg.key] > 0;
  });

  const visibleTotal = SERIES_CONFIG.reduce((sum, cfg) => {
    const inPayload = payload.some((p) => p.dataKey === cfg.key);
    return inPayload ? sum + point[cfg.key] : sum;
  }, 0);

  return (
    <div className="min-w-[240px] rounded-xl border border-slate-200 bg-white/95 backdrop-blur-sm p-3.5 shadow-xl text-xs">
      <div className="font-bold text-slate-900 border-b border-slate-100 pb-2 mb-2 flex items-center justify-between">
        <span>{point.mesLong}</span>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          CLP
        </span>
      </div>

      {visibleEntries.length === 0 ? (
        <p className="text-slate-400 italic py-1">Sin movimientos en las series activas</p>
      ) : (
        <div className="space-y-1.5">
          {visibleEntries.map((cfg) => {
            const val = point[cfg.key];
            const pct =
              point.totalMes > 0 ? ((val / point.totalMes) * 100).toFixed(1) : "0.0";
            return (
              <div key={cfg.key} className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: cfg.color }}
                  />
                  <span className="text-slate-700 font-medium truncate">
                    {cfg.label}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0 font-mono">
                  <span className="text-[10px] text-slate-400">{pct}%</span>
                  <span className="font-bold text-slate-900">{formatCLP(val)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="border-t border-slate-200 mt-2.5 pt-2 flex items-center justify-between gap-4">
        <span className="font-bold text-slate-700">Total Pagado del Mes</span>
        <span className="font-mono font-black text-slate-900">
          {formatCLP(visibleEntries.length > 0 ? visibleTotal : point.totalMes)}
        </span>
      </div>
    </div>
  );
}

interface AnalisisModalidadPanelProps {
  pagos: PagoCompraHistorico[];
}

export function AnalisisModalidadPanel({ pagos }: AnalisisModalidadPanelProps) {
  const [chartType, setChartType] = useState<"area" | "bar">("area");
  const [hiddenSeries, setHiddenSeries] = useState<Set<ModalidadSeriesKey>>(
    () => new Set()
  );

  const toggleSeries = (key: ModalidadSeriesKey) => {
    setHiddenSeries((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        // Evitar ocultar todas las series simultáneamente si solo queda 1
        if (next.size < SERIES_CONFIG.length - 1) {
          next.add(key);
        }
      }
      return next;
    });
  };

  const monthlyData = useMemo<MonthlyPoint[]>(() => {
    const byMonth = new Map<string, MonthlyPoint>();

    for (const p of pagos) {
      const dateStr = toDateOnlyString(p.fecha_real_pago);
      if (!dateStr || dateStr.length < 7) continue;
      const ym = dateStr.slice(0, 7);

      const seriesKey = resolveSeriesKey(
        p.modalidad_pago || (p as unknown as Record<string, unknown>).modalidad
      );
      if (!seriesKey) continue;

      const monto = Number(p.monto_pagado || 0);
      const existing = byMonth.get(ym) || {
        ym,
        mesLabel: formatMonthShort(ym),
        mesLong: formatMonthLong(ym),
        directo: 0,
        compraTc: 0,
        cheque: 0,
        factoring: 0,
        confirming: 0,
        totalMes: 0,
      };

      existing[seriesKey] += monto;
      existing.totalMes += monto;
      byMonth.set(ym, existing);
    }

    return Array.from(byMonth.values()).sort((a, b) => a.ym.localeCompare(b.ym));
  }, [pagos]);

  const totals = useMemo(() => {
    return monthlyData.reduce(
      (acc, row) => ({
        directo: acc.directo + row.directo,
        compraTc: acc.compraTc + row.compraTc,
        cheque: acc.cheque + row.cheque,
        factoring: acc.factoring + row.factoring,
        confirming: acc.confirming + row.confirming,
        totalMes: acc.totalMes + row.totalMes,
      }),
      {
        directo: 0,
        compraTc: 0,
        cheque: 0,
        factoring: 0,
        confirming: 0,
        totalMes: 0,
      }
    );
  }, [monthlyData]);

  const activeSeries = SERIES_CONFIG.filter((cfg) => !hiddenSeries.has(cfg.key));

  return (
    <div className="space-y-6">
      {/* CARD DEL GRÁFICO PRINCIPAL */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-5">
        {/* Cabecera del Gráfico */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-[#E05A10]" />
              Evolución Mensual de Pagos por Modalidad
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Comportamiento cronológico agrupado por mes según la fecha real de pago y los filtros activos.
            </p>
          </div>

          {/* Toggle Curvas Suavizadas vs Barras Suavizadas */}
          <div className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-100 p-1 self-start lg:self-auto">
            <button
              type="button"
              onClick={() => setChartType("area")}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
                chartType === "area"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <TrendingUp className="h-3.5 w-3.5 text-[#E05A10]" />
              <span>Curvas Suavizadas (Tendencia)</span>
            </button>
            <button
              type="button"
              onClick={() => setChartType("bar")}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
                chartType === "bar"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <BarChart3 className="h-3.5 w-3.5 text-[#E05A10]" />
              <span>Barras Suavizadas (Comparativo)</span>
            </button>
          </div>
        </div>

        {/* Leyenda Interactiva Superior */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {SERIES_CONFIG.map((cfg) => {
              const isHidden = hiddenSeries.has(cfg.key);
              return (
                <button
                  key={cfg.key}
                  type="button"
                  onClick={() => toggleSeries(cfg.key)}
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold transition-all ${
                    isHidden
                      ? "border-slate-200 bg-slate-50 text-slate-400 opacity-60"
                      : "border-slate-200 bg-white text-slate-800 shadow-2xs hover:border-slate-300"
                  }`}
                  title={
                    isHidden
                      ? `Mostrar serie ${cfg.label}`
                      : `Ocultar serie ${cfg.label}`
                  }
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full shrink-0"
                    style={{
                      backgroundColor: isHidden ? "#CBD5E1" : cfg.color,
                    }}
                  />
                  <span>{cfg.label}</span>
                  {isHidden ? (
                    <EyeOff className="h-3 w-3 text-slate-400" />
                  ) : (
                    <Eye className="h-3 w-3 text-slate-400" />
                  )}
                </button>
              );
            })}
          </div>

          {hiddenSeries.size > 0 && (
            <button
              type="button"
              onClick={() => setHiddenSeries(new Set())}
              className="text-xs font-semibold text-[#E05A10] hover:underline"
            >
              Mostrar todas
            </button>
          )}
        </div>

        {/* Gráfico Recharts */}
        {monthlyData.length === 0 ? (
          <div className="h-[340px] flex flex-col items-center justify-center text-slate-400 border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
            <BarChart3 className="h-10 w-10 text-slate-300 mb-2" />
            <p className="text-sm font-medium text-slate-600">
              No hay pagos en el período o filtros seleccionados
            </p>
            <p className="text-xs text-slate-400 mt-1">
              Ajusta el rango de fechas o limpia los filtros para visualizar la tendencia mensual.
            </p>
          </div>
        ) : (
          <div className="h-[380px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              {chartType === "area" ? (
                <AreaChart
                  data={monthlyData}
                  margin={{ top: 12, right: 16, left: 8, bottom: 8 }}
                >
                  <defs>
                    {SERIES_CONFIG.map((cfg) => (
                      <linearGradient
                        key={cfg.gradientId}
                        id={cfg.gradientId}
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop offset="5%" stopColor={cfg.color} stopOpacity={0.22} />
                        <stop offset="95%" stopColor={cfg.color} stopOpacity={0.0} />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="#E2E8F0"
                  />
                  <XAxis
                    dataKey="mesLabel"
                    tick={{ fill: "#475569", fontSize: 11, fontWeight: 600 }}
                    axisLine={{ stroke: "#CBD5E1" }}
                    tickLine={false}
                    dy={6}
                  />
                  <YAxis
                    tickFormatter={formatYAxisMillions}
                    tick={{ fill: "#475569", fontSize: 11, fontFamily: "monospace" }}
                    axisLine={false}
                    tickLine={false}
                    width={64}
                  />
                  <Tooltip content={<ExecutiveMonthlyTooltip />} />
                  {activeSeries.map((cfg) => (
                    <Area
                      key={cfg.key}
                      type="monotone"
                      dataKey={cfg.key}
                      name={cfg.label}
                      stroke={cfg.color}
                      strokeWidth={2.5}
                      fillOpacity={1}
                      fill={`url(#${cfg.gradientId})`}
                      activeDot={{ r: 5, strokeWidth: 2, stroke: "#fff" }}
                    />
                  ))}
                </AreaChart>
              ) : (
                <BarChart
                  data={monthlyData}
                  margin={{ top: 12, right: 16, left: 8, bottom: 8 }}
                  barCategoryGap="18%"
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="#E2E8F0"
                  />
                  <XAxis
                    dataKey="mesLabel"
                    tick={{ fill: "#475569", fontSize: 11, fontWeight: 600 }}
                    axisLine={{ stroke: "#CBD5E1" }}
                    tickLine={false}
                    dy={6}
                  />
                  <YAxis
                    tickFormatter={formatYAxisMillions}
                    tick={{ fill: "#475569", fontSize: 11, fontFamily: "monospace" }}
                    axisLine={false}
                    tickLine={false}
                    width={64}
                  />
                  <Tooltip
                    cursor={{ fill: "rgba(241, 245, 249, 0.7)" }}
                    content={<ExecutiveMonthlyTooltip />}
                  />
                  {activeSeries.map((cfg) => (
                    <Bar
                      key={cfg.key}
                      dataKey={cfg.key}
                      name={cfg.label}
                      fill={cfg.color}
                      radius={[6, 6, 0, 0]}
                      maxBarSize={28}
                    />
                  ))}
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* TABLA RESUMEN MENSUAL CONSOLIDADA */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50/70 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Tabla Resumen Mensual Consolidada
            </h3>
            <p className="text-[11px] text-slate-500">
              Auditoría exacta en pesos chilenos ($ CLP) de los montos graficados por mes y modalidad.
            </p>
          </div>
          <span className="text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg px-2.5 py-1">
            {monthlyData.length} {monthlyData.length === 1 ? "mes" : "meses"}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                <th className="py-3 px-4">Mes</th>
                <th className="py-3 px-4 text-right">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-[#10B981]" />
                    Directo
                  </span>
                </th>
                <th className="py-3 px-4 text-right">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-[#E05A10]" />
                    Compra TC
                  </span>
                </th>
                <th className="py-3 px-4 text-right">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-[#8B5CF6]" />
                    Cheque
                  </span>
                </th>
                <th className="py-3 px-4 text-right">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-[#3B82F6]" />
                    Factoring
                  </span>
                </th>
                <th className="py-3 px-4 text-right">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-[#F59E0B]" />
                    Confirming
                  </span>
                </th>
                <th className="py-3 px-4 text-right bg-slate-100/70">Total Mes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {monthlyData.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-slate-400">
                    No existen datos mensuales para los filtros actuales.
                  </td>
                </tr>
              ) : (
                monthlyData.map((row) => (
                  <tr key={row.ym} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 font-semibold text-slate-800 whitespace-nowrap">
                      {row.mesLong}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-slate-700 whitespace-nowrap">
                      {row.directo > 0 ? formatCLP(row.directo) : "—"}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-slate-700 whitespace-nowrap">
                      {row.compraTc > 0 ? formatCLP(row.compraTc) : "—"}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-slate-700 whitespace-nowrap">
                      {row.cheque > 0 ? formatCLP(row.cheque) : "—"}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-slate-700 whitespace-nowrap">
                      {row.factoring > 0 ? formatCLP(row.factoring) : "—"}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-slate-700 whitespace-nowrap">
                      {row.confirming > 0 ? formatCLP(row.confirming) : "—"}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-slate-900 bg-slate-50/70 whitespace-nowrap">
                      {formatCLP(row.totalMes)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {monthlyData.length > 0 && (
              <tfoot>
                <tr className="bg-slate-900 text-white text-xs font-bold">
                  <td className="py-3 px-4 uppercase tracking-wider">Total Período</td>
                  <td className="py-3 px-4 text-right font-mono whitespace-nowrap">
                    {formatCLP(totals.directo)}
                  </td>
                  <td className="py-3 px-4 text-right font-mono whitespace-nowrap">
                    {formatCLP(totals.compraTc)}
                  </td>
                  <td className="py-3 px-4 text-right font-mono whitespace-nowrap">
                    {formatCLP(totals.cheque)}
                  </td>
                  <td className="py-3 px-4 text-right font-mono whitespace-nowrap">
                    {formatCLP(totals.factoring)}
                  </td>
                  <td className="py-3 px-4 text-right font-mono whitespace-nowrap">
                    {formatCLP(totals.confirming)}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-[#FF8A47] whitespace-nowrap">
                    {formatCLP(totals.totalMes)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
