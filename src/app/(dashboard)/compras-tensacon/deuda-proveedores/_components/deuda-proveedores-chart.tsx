"use client";

import React, { useState, useMemo } from "react";
import { DeudaMensualItem } from "@/actions/deuda-proveedores.actions";
import { formatCLP } from "@/lib/utils";
import { TrendingDown, Calendar } from "lucide-react";

interface DeudaProveedoresChartProps {
  data: DeudaMensualItem[];
  totalDeudaGlobal: number;
  onSelectMonth?: (mesClave: string) => void;
  selectedMonth?: string | null;
}

// Genera una curva suavizada continua (monotone / cubic Bézier) a partir de los puntos (x, y)
function getSmoothedBezierPath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  if (points.length === 2) {
    return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
  }

  let path = `M ${points[0].x} ${points[0].y}`;

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = i > 0 ? points[i - 1] : points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = i < points.length - 2 ? points[i + 2] : p2;

    const tension = 0.2;
    const cp1x = p1.x + (p2.x - p0.x) * tension;
    const cp1y = p1.y + (p2.y - p0.y) * tension;

    const cp2x = p2.x - (p3.x - p1.x) * tension;
    const cp2y = p2.y - (p3.y - p1.y) * tension;

    path += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }

  return path;
}

// Formateo abreviado en millones ($Xmm) para las etiquetas sobre cada punto
const formatearMontoAbreviado = (valor: number): string => {
  if (!valor || valor === 0) return "$0";
  const millones = Math.round(valor / 1_000_000);
  return `$${millones}mm`;
};

export function DeudaProveedoresChart({
  data,
  totalDeudaGlobal,
  onSelectMonth,
  selectedMonth,
}: DeudaProveedoresChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  // Dimensiones compactas optimizadas (h-[230px] / h-[250px])
  const width = 800;
  const height = 195;
  const paddingLeft = 55;
  const paddingRight = 20;
  const paddingTop = 26;
  const paddingBottom = 30;

  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  // Escala máxima en Y con holgura del 12%
  const maxDeuda = useMemo(() => {
    if (data.length === 0) return 1000000;
    const max = Math.max(...data.map((d) => d.totalDeuda));
    return Math.max(max * 1.12, 100000);
  }, [data]);

  // Coordenadas para cada mes
  const points = useMemo(() => {
    if (data.length === 0) return [];

    return data.map((item, index) => {
      const x =
        data.length === 1
          ? paddingLeft + chartWidth / 2
          : paddingLeft + (index / (data.length - 1)) * chartWidth;

      const yRatio = item.totalDeuda / maxDeuda;
      const y = paddingTop + chartHeight - yRatio * chartHeight;

      return {
        x,
        y,
        item,
        index,
      };
    });
  }, [data, chartWidth, chartHeight, maxDeuda, paddingLeft, paddingTop]);

  // Trazo suavizado de la curva roja
  const linePath = useMemo(() => {
    if (points.length === 0) return "";
    return getSmoothedBezierPath(points);
  }, [points]);

  // Área translúcida bajo la curva
  const areaPath = useMemo(() => {
    if (points.length === 0) return "";
    const first = points[0];
    const last = points[points.length - 1];
    const baselineY = paddingTop + chartHeight;

    if (points.length === 1) {
      return `M ${first.x - 25} ${baselineY} L ${first.x - 25} ${first.y} L ${first.x + 25} ${first.y} L ${first.x + 25} ${baselineY} Z`;
    }

    const bezierPart = getSmoothedBezierPath(points);
    return `${bezierPart} L ${last.x} ${baselineY} L ${first.x} ${baselineY} Z`;
  }, [points, chartHeight, paddingTop]);

  // 3 líneas de cuadrícula horizontales discretas
  const gridLines = useMemo(() => {
    const lines = [];
    const stepCount = 3;
    for (let i = 0; i <= stepCount; i++) {
      const val = (maxDeuda / stepCount) * i;
      const y = paddingTop + chartHeight - (val / maxDeuda) * chartHeight;
      lines.push({ val, y });
    }
    return lines;
  }, [maxDeuda, chartHeight, paddingTop]);

  const activePoint = hoveredIndex !== null ? points[hoveredIndex] : null;

  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 bg-white rounded-xl border border-slate-200 text-center">
        <TrendingDown className="h-8 w-8 text-slate-300 mb-1.5" />
        <p className="text-xs font-semibold text-slate-700">Sin obligaciones pendientes registradas</p>
        <p className="text-[11px] text-slate-400">Todas las facturas de proveedores están saldadas.</p>
      </div>
    );
  }

  return (
    <div className="relative w-full bg-white rounded-xl border border-slate-200 shadow-sm p-3.5 sm:p-4">
      {/* Cabecera del Gráfico */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2 pb-2 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <span className="flex h-2 w-2 rounded-full bg-red-600 animate-pulse" />
          <h2 className="text-xs font-bold tracking-tight text-slate-900 uppercase">
            VENCIMIENTO DEUDA PROVEEDORES (POR MES)
          </h2>
          <span className="hidden sm:inline-block text-xs text-slate-400">
            · Sumatoria mensual agrupada por fecha de vencimiento exigible
          </span>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-50 border border-red-200 text-red-700 font-medium text-[11px]">
            <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
            Vencimiento mensual
          </span>
          <span className="text-slate-300">|</span>
          <span className="text-slate-600 font-mono text-xs">
            Total: <strong className="text-slate-900 font-bold">{formatCLP(totalDeudaGlobal)}</strong>
          </span>
        </div>
      </div>

      {/* Contenedor Gráfico Compacto (h-[230px] / h-[250px]) */}
      <div className="relative w-full h-[210px] sm:h-[230px] flex items-center justify-center overflow-hidden">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          className="w-full h-full select-none"
        >
          <defs>
            {/* Gradiente inferior translúcido */}
            <linearGradient id="deudaRedGradientCompact" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#EF4444" stopOpacity="0.22" />
              <stop offset="60%" stopColor="#EF4444" stopOpacity="0.06" />
              <stop offset="100%" stopColor="#EF4444" stopOpacity="0.00" />
            </linearGradient>

            {/* Sombra sutil para la curva roja */}
            <filter id="compactRedGlow" x="-10%" y="-10%" width="120%" height="130%">
              <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#DC2626" floodOpacity="0.22" />
            </filter>
          </defs>

          {/* Cuadrícula horizontal y etiquetas de eje Y en formato monetario simplificado */}
          {gridLines.map((gl, idx) => (
            <g key={idx}>
              <line
                x1={paddingLeft}
                y1={gl.y}
                x2={width - paddingRight}
                y2={gl.y}
                stroke="#F1F5F9"
                strokeWidth="1"
                strokeDasharray={idx === 0 ? "none" : "3 3"}
              />
              <text
                x={paddingLeft - 8}
                y={gl.y + 3.5}
                textAnchor="end"
                className="text-[10px] fill-slate-500 font-medium font-mono"
              >
                {gl.val >= 1000000
                  ? `$${(gl.val / 1000000).toFixed(0)}M`
                  : gl.val >= 1000
                  ? `$${(gl.val / 1000).toFixed(0)}K`
                  : `$${gl.val}`}
              </text>
            </g>
          ))}

          {/* Relleno con gradiente bajo la curva */}
          {areaPath && (
            <path
              d={areaPath}
              fill="url(#deudaRedGradientCompact)"
              className="transition-all duration-200"
            />
          )}

          {/* Curva continua roja suavizada */}
          {linePath && (
            <path
              d={linePath}
              fill="none"
              stroke="#EF4444"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              filter="url(#compactRedGlow)"
              className="transition-all duration-200"
            />
          )}

          {/* Guía vertical reactiva al pasar el cursor */}
          {activePoint && (
            <line
              x1={activePoint.x}
              y1={paddingTop}
              x2={activePoint.x}
              y2={paddingTop + chartHeight}
              stroke="#EF4444"
              strokeWidth="1.2"
              strokeDasharray="3 3"
              opacity="0.6"
            />
          )}

          {/* Nodos interactivos de datos */}
          {points.map((p, idx) => {
            const isHovered = hoveredIndex === idx;
            const isSelected = selectedMonth === p.item.mesClave;

            return (
              <g
                key={p.item.mesClave}
                className="cursor-pointer group"
                onMouseEnter={() => setHoveredIndex(idx)}
                onMouseLeave={() => setHoveredIndex(null)}
                onClick={() => onSelectMonth && onSelectMonth(p.item.mesClave)}
              >
                {/* Zona de click amplia */}
                <circle cx={p.x} cy={p.y} r="18" fill="transparent" />

                {/* Halo de hover/selección */}
                {(isHovered || isSelected) && (
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r="10"
                    fill="#FEE2E2"
                    opacity="0.95"
                    className="transition-all duration-150"
                  />
                )}

                {/* Nodo de punto: normal dot r=4 (#EF4444) | activeDot r=6 (#FFFFFF con borde #DC2626) */}
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={isHovered || isSelected ? 6 : 4}
                  fill={isHovered || isSelected ? "#FFFFFF" : "#EF4444"}
                  stroke={isHovered || isSelected ? "#DC2626" : "#FFFFFF"}
                  strokeWidth={isHovered || isSelected ? 2.5 : 2}
                  className="transition-all duration-150 shadow-sm"
                />

                {/* Etiqueta de Valor sobre el Punto (Data Label: $Xmm con dy={-10} y 9px) */}
                <text
                  x={p.x}
                  y={p.y - 10}
                  textAnchor="middle"
                  className={`font-mono select-none transition-colors ${
                    isHovered || isSelected
                      ? "fill-red-700 font-bold"
                      : "fill-slate-600 font-semibold"
                  }`}
                  style={{ fontSize: "9px", fontWeight: 600, fontFamily: "monospace" }}
                >
                  {formatearMontoAbreviado(p.item.totalDeuda)}
                </text>

                {/* Etiqueta del Mes en el Eje X */}
                <text
                  x={p.x}
                  y={paddingTop + chartHeight + 17}
                  textAnchor="middle"
                  className={`text-[10px] sm:text-[11px] transition-colors ${
                    isHovered || isSelected
                      ? "fill-red-700 font-bold"
                      : "fill-slate-600 font-medium"
                  }`}
                >
                  {p.item.mesCorto}
                </text>

                {/* Subetiqueta % o Estado */}
                <text
                  x={p.x}
                  y={paddingTop + chartHeight + 28}
                  textAnchor="middle"
                  className={`text-[9px] transition-colors ${
                    p.item.esVencido ? "fill-rose-500 font-semibold" : "fill-slate-400"
                  }`}
                >
                  {p.item.esVencido ? "Vencido" : `${p.item.porcentaje}%`}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Tooltip Compacto Flotante */}
        {activePoint && (
          <div
            className="absolute z-20 pointer-events-none transition-all duration-150 transform -translate-x-1/2"
            style={{
              left: `${(activePoint.x / width) * 100}%`,
              top: `${Math.max(6, (activePoint.y / height) * 100 - 36)}%`,
            }}
          >
            <div className="bg-slate-900 text-white rounded-lg shadow-xl px-2.5 py-1.5 text-[11px] border border-slate-700/80 min-w-[170px]">
              <div className="flex items-center justify-between gap-2 border-b border-slate-700/60 pb-1 mb-1">
                <span className="font-bold text-white flex items-center gap-1">
                  <Calendar className="h-3 w-3 text-red-400" />
                  {activePoint.item.mesNombre}
                </span>
                <span
                  className={`px-1 py-0.2 text-[8.5px] font-semibold rounded ${
                    activePoint.item.esVencido
                      ? "bg-rose-500/30 text-rose-300"
                      : "bg-emerald-500/20 text-emerald-300"
                  }`}
                >
                  {activePoint.item.esVencido ? "Vencido" : "En Plazo"}
                </span>
              </div>
              <div className="space-y-0.5 text-[10px]">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Total Deuda:</span>
                  <span className="font-bold text-red-400 font-mono text-[11px]">
                    {formatCLP(activePoint.item.totalDeuda)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-slate-400">
                  <span>Facturas / Proveedores:</span>
                  <span className="text-slate-200 font-medium">
                    {activePoint.item.cantidadFacturas} fac. · {activePoint.item.cantidadProveedores} prov.
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
