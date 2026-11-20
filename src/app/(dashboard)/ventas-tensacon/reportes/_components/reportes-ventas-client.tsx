"use client";

import React, { useMemo, useState, useRef, useEffect } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  BarChart3,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileDown,
  Filter,
  Search,
  TrendingUp,
  X,
} from "lucide-react";
import { FacturaVenta, MantenedorON } from "@/types/database.types";
import { LOGO_TENSACON_BASE64 } from "@/lib/pdf/logo-tensacon";
import { cn, formatCLP, formatRutDisplay, normalizeRut } from "@/lib/utils";

interface ReportesVentasClientProps {
  facturas: FacturaVenta[];
  catalogoOn: MantenedorON[];
}

interface MonthlyPoint {
  mesKey: string; // YYYY-MM
  label: string; // Ene 26
  emitido: number;
  recaudado: number;
  deuda: number;
  pctRecaudacion: number;
  docsCount: number;
}

interface ClientSummaryRow {
  rutKey: string;
  rutDisplay: string;
  razonSocial: string;
  emitido: number;
  pagado: number;
  deuda: number;
  pctRecaudacion: number;
  docsCount: number;
}

const MESES_CORTOS = [
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

function formatMesLabel(mesKey: string): string {
  const [year, month] = mesKey.split("-");
  const idx = Number(month) - 1;
  if (idx < 0 || idx > 11 || !year) return mesKey;
  return `${MESES_CORTOS[idx]} ${year.slice(-2)}`;
}

function resolveDeudaClientSide(f: FacturaVenta): number {
  if (Number(f.tipo_doc) === 61) return 0;
  if (f.deuda_cliente !== null && f.deuda_cliente !== undefined) {
    return Math.max(0, Number(f.deuda_cliente));
  }
  return Math.max(0, Number(f.monto_neto_saldo ?? f.monto_total ?? 0));
}

function formatAxisMillions(val: number): string {
  if (val <= 0) return "$ 0";
  if (val >= 1_000_000) {
    const m = val / 1_000_000;
    return `$ ${Number.isInteger(m) ? m : m.toFixed(1)}M`;
  }
  if (val >= 1_000) {
    return `$ ${Math.round(val / 1_000)}k`;
  }
  return `$ ${Math.round(val)}`;
}

function buildSmoothPath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  let d = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    d += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return d;
}

const PAGE_SIZE = 30;

export function ReportesVentasClient({
  facturas,
  catalogoOn,
}: ReportesVentasClientProps) {
  const [yearFilter, setYearFilter] = useState<string>("TODOS");
  const [onFilter, setOnFilter] = useState<string>("TODAS");
  const [clienteFilter, setClienteFilter] = useState<string>("TODOS");
  const [clienteSearch, setClienteSearch] = useState<string>("");
  const [isClienteOpen, setIsClienteOpen] = useState<boolean>(false);
  const clienteDropdownRef = useRef<HTMLDivElement>(null);

  const [showEmitido, setShowEmitido] = useState<boolean>(true);
  const [showRecaudado, setShowRecaudado] = useState<boolean>(true);
  const [showDeuda, setShowDeuda] = useState<boolean>(true);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [page, setPage] = useState<number>(1);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        clienteDropdownRef.current &&
        !clienteDropdownRef.current.contains(e.target as Node)
      ) {
        setIsClienteOpen(false);
      }
    };
    if (isClienteOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isClienteOpen]);

  const availableYears = useMemo(() => {
    const set = new Set<string>();
    for (const f of facturas) {
      const y = String(f.fecha_docto || "").slice(0, 4);
      if (/^\d{4}$/.test(y)) set.add(y);
    }
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [facturas]);

  const availableOns = useMemo(() => {
    const map = new Map<string, string>();
    for (const on of catalogoOn) {
      const code = on.codigo_on.trim().toUpperCase();
      if (code) map.set(code, on.nombre_proyecto || "");
    }
    for (const f of facturas) {
      const code = String(f.on_proyecto || "").trim().toUpperCase();
      if (code && !map.has(code)) map.set(code, "");
    }
    return Array.from(map.entries())
      .map(([codigo, nombre]) => ({ codigo, nombre }))
      .sort((a, b) => a.codigo.localeCompare(b.codigo));
  }, [catalogoOn, facturas]);

  const availableClientes = useMemo(() => {
    const map = new Map<string, { rutKey: string; rutDisplay: string; razonSocial: string }>();
    for (const f of facturas) {
      const rutKey = normalizeRut(f.rut_cliente);
      if (!rutKey) continue;
      if (!map.has(rutKey)) {
        map.set(rutKey, {
          rutKey,
          rutDisplay: formatRutDisplay(f.rut_cliente),
          razonSocial: String(f.razon_social || "").trim() || rutKey,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) =>
      a.razonSocial.localeCompare(b.razonSocial, "es")
    );
  }, [facturas]);

  const filteredClientesDropdown = useMemo(() => {
    const q = clienteSearch.trim().toLowerCase();
    if (!q) return availableClientes;
    const qClean = q.replace(/[.\-\s]/g, "");
    return availableClientes.filter((c) => {
      const nameMatch = c.razonSocial.toLowerCase().includes(q);
      const rutMatch =
        qClean.length > 0 &&
        c.rutKey.toLowerCase().replace(/[.\-\s]/g, "").includes(qClean);
      return nameMatch || rutMatch;
    });
  }, [availableClientes, clienteSearch]);

  const selectedClienteObj = useMemo(
    () => availableClientes.find((c) => c.rutKey === clienteFilter) || null,
    [availableClientes, clienteFilter]
  );

  const filteredFacturas = useMemo(() => {
    return facturas.filter((f) => {
      if (yearFilter !== "TODOS") {
        const y = String(f.fecha_docto || "").slice(0, 4);
        if (y !== yearFilter) return false;
      }
      if (onFilter !== "TODAS") {
        const onCode = String(f.on_proyecto || "").trim().toUpperCase();
        if (onCode !== onFilter) return false;
      }
      if (clienteFilter !== "TODOS") {
        if (normalizeRut(f.rut_cliente) !== clienteFilter) return false;
      }
      return true;
    });
  }, [facturas, yearFilter, onFilter, clienteFilter]);

  const {
    kpis,
    monthlyData,
    clientRows,
  } = useMemo(() => {
    const monthMap = new Map<
      string,
      { emitido: number; recaudado: number; deuda: number; docsCount: number }
    >();
    const clientMap = new Map<
      string,
      {
        rutKey: string;
        rutDisplay: string;
        razonSocial: string;
        emitido: number;
        pagado: number;
        deuda: number;
        docsCount: number;
      }
    >();

    let totalEmitido = 0;
    let totalRecaudado = 0;
    let totalDeuda = 0;
    let totalDocsEmitidos = 0;
    let docsPendientes = 0;

    for (const f of filteredFacturas) {
      const tipo = Number(f.tipo_doc);
      const isNC = tipo === 61;
      const mesKey = String(f.fecha_docto || "").slice(0, 7);
      const rutKey = normalizeRut(f.rut_cliente) || "SIN-RUT";
      const montoTotal = Number(f.monto_total) || 0;

      let emitidoDelta = 0;
      let recaudadoDelta = 0;
      let deudaDelta = 0;

      if (isNC) {
        emitidoDelta = -Math.abs(montoTotal);
      } else {
        totalDocsEmitidos += 1;
        const deuda = resolveDeudaClientSide(f);
        const sumPagos = (f.pagos_facturas || []).reduce(
          (acc, p) => acc + (Number(p.monto_pago) || 0),
          0
        );
        const hasNC =
          Boolean(f.nc_referenciada_folio) ||
          (deuda === 0 &&
            Number(f.monto_neto_saldo ?? montoTotal) < montoTotal &&
            sumPagos === 0);

        const recaudado = hasNC
          ? Math.min(montoTotal, sumPagos)
          : Math.max(0, montoTotal - deuda);

        emitidoDelta = montoTotal;
        recaudadoDelta = recaudado;
        deudaDelta = deuda;
        if (deuda > 0) docsPendientes += 1;
      }

      totalEmitido += emitidoDelta;
      totalRecaudado += recaudadoDelta;
      totalDeuda += deudaDelta;

      if (/^\d{4}-\d{2}$/.test(mesKey)) {
        const prevM = monthMap.get(mesKey) || {
          emitido: 0,
          recaudado: 0,
          deuda: 0,
          docsCount: 0,
        };
        prevM.emitido += emitidoDelta;
        prevM.recaudado += recaudadoDelta;
        prevM.deuda += deudaDelta;
        if (!isNC) prevM.docsCount += 1;
        monthMap.set(mesKey, prevM);
      }

      const prevC = clientMap.get(rutKey) || {
        rutKey,
        rutDisplay: formatRutDisplay(f.rut_cliente),
        razonSocial: String(f.razon_social || "").trim() || rutKey,
        emitido: 0,
        pagado: 0,
        deuda: 0,
        docsCount: 0,
      };
      prevC.emitido += emitidoDelta;
      prevC.pagado += recaudadoDelta;
      prevC.deuda += deudaDelta;
      if (!isNC) prevC.docsCount += 1;
      clientMap.set(rutKey, prevC);
    }

    const monthlyArr: MonthlyPoint[] = Array.from(monthMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([mesKey, m]) => {
        const emitido = Math.max(0, m.emitido);
        const pct = emitido > 0 ? Math.min(100, (m.recaudado / emitido) * 100) : 0;
        return {
          mesKey,
          label: formatMesLabel(mesKey),
          emitido,
          recaudado: m.recaudado,
          deuda: m.deuda,
          pctRecaudacion: pct,
          docsCount: m.docsCount,
        };
      });

    const clientsArr: ClientSummaryRow[] = Array.from(clientMap.values())
      .map((c) => {
        const emitido = Math.max(0, c.emitido);
        const pct = emitido > 0 ? Math.min(100, (c.pagado / emitido) * 100) : 0;
        return {
          ...c,
          emitido,
          pctRecaudacion: pct,
        };
      })
      .sort((a, b) => b.deuda - a.deuda || b.emitido - a.emitido);

    const safeEmitido = Math.max(0, totalEmitido);
    const pctGlobal =
      safeEmitido > 0 ? Math.min(100, (totalRecaudado / safeEmitido) * 100) : 0;
    const promedioMensual =
      monthlyArr.length > 0 ? safeEmitido / monthlyArr.length : 0;

    return {
      kpis: {
        totalEmitido: safeEmitido,
        totalDocsEmitidos,
        totalRecaudado,
        pctRecaudacionGlobal: pctGlobal,
        totalDeuda,
        docsPendientes,
        promedioMensual,
      },
      monthlyData: monthlyArr,
      clientRows: clientsArr,
    };
  }, [filteredFacturas]);

  const totalPages = Math.max(1, Math.ceil(clientRows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginatedClients = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return clientRows.slice(start, start + PAGE_SIZE);
  }, [clientRows, safePage]);

  // SVG Chart Geometry
  const chartGeom = useMemo(() => {
    const width = 960;
    const height = 310;
    const padL = 68;
    const padR = 24;
    const padT = 22;
    const padB = 36;
    const plotW = width - padL - padR;
    const plotH = height - padT - padB;

    let maxVal = 0;
    for (const pt of monthlyData) {
      if (showEmitido) maxVal = Math.max(maxVal, pt.emitido);
      if (showRecaudado) maxVal = Math.max(maxVal, pt.recaudado);
      if (showDeuda) maxVal = Math.max(maxVal, pt.deuda);
    }
    if (maxVal <= 0) maxVal = 1_000_000;

    // Nice ceiling step
    const mag = Math.pow(10, Math.floor(Math.log10(maxVal)));
    const niceMax = Math.ceil((maxVal * 1.12) / (mag / 2)) * (mag / 2);

    const n = monthlyData.length;
    const xFor = (i: number) =>
      n <= 1 ? padL + plotW / 2 : padL + (i / (n - 1)) * plotW;
    const yFor = (v: number) =>
      padT + plotH - (Math.max(0, v) / niceMax) * plotH;

    const emitidoPts = monthlyData.map((m, i) => ({
      x: xFor(i),
      y: yFor(m.emitido),
    }));
    const recaudadoPts = monthlyData.map((m, i) => ({
      x: xFor(i),
      y: yFor(m.recaudado),
    }));
    const deudaPts = monthlyData.map((m, i) => ({
      x: xFor(i),
      y: yFor(m.deuda),
    }));

    const deudaLine = buildSmoothPath(deudaPts);
    const deudaArea =
      deudaPts.length > 0
        ? `${deudaLine} L ${deudaPts[deudaPts.length - 1].x.toFixed(2)} ${(padT + plotH).toFixed(2)} L ${deudaPts[0].x.toFixed(2)} ${(padT + plotH).toFixed(2)} Z`
        : "";

    const yTicks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => ({
      value: niceMax * ratio,
      y: padT + plotH - ratio * plotH,
    }));

    return {
      width,
      height,
      padL,
      padR,
      padT,
      padB,
      plotW,
      plotH,
      emitidoPts,
      recaudadoPts,
      deudaPts,
      emitidoPath: buildSmoothPath(emitidoPts),
      recaudadoPath: buildSmoothPath(recaudadoPts),
      deudaPath: deudaLine,
      deudaAreaPath: deudaArea,
      yTicks,
      xFor,
    };
  }, [monthlyData, showEmitido, showRecaudado, showDeuda]);

  const handleExportPDF = () => {
    const doc = new jsPDF({
      orientation: "landscape",
      unit: "mm",
      format: "a4",
    });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const now = new Date();
    const fechaEmision = now.toLocaleDateString("es-CL");
    const correlativo = `${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
    const controlCode = `REP-VTA-2026-${correlativo}`;

    // Membrete blanco ejecutivo
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, pageW, 28, "F");
    try {
      doc.addImage(LOGO_TENSACON_BASE64, "PNG", 14, 7, 40, 10);
    } catch {
      // Fallback sin logo
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(15, 23, 42);
    doc.text(
      "TENSACON S.A. — Reporte Ejecutivo de Ventas (Emisión vs Recaudación y Deuda)",
      60,
      12
    );

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    const clienteLabel = selectedClienteObj
      ? `${selectedClienteObj.razonSocial} (${selectedClienteObj.rutDisplay})`
      : "Todos los Clientes";
    doc.text(
      `Período: ${yearFilter === "TODOS" ? "Todos los Períodos" : yearFilter}  |  ON: ${onFilter === "TODAS" ? "Todas" : onFilter}  |  Cliente: ${clienteLabel}  |  Emisión: ${fechaEmision}`,
      60,
      18
    );

    // Código de control en naranja corporativo
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(224, 90, 16);
    doc.text(controlCode, pageW - 14, 12, { align: "right" });

    doc.setDrawColor(226, 232, 240);
    doc.line(14, 24, pageW - 14, 24);

    // 4 KPI Cards summary row
    const cardW = (pageW - 28 - 12) / 4;
    const kpiCards = [
      {
        title: "TOTAL EMITIDO (SII)",
        val: formatCLP(kpis.totalEmitido),
        sub: `${kpis.totalDocsEmitidos} docs`,
        color: [15, 23, 42] as [number, number, number],
      },
      {
        title: "RECAUDADO (PAGADO)",
        val: formatCLP(kpis.totalRecaudado),
        sub: `${kpis.pctRecaudacionGlobal.toFixed(1)}% efectividad`,
        color: [16, 185, 129] as [number, number, number],
      },
      {
        title: "DEUDA TOTAL PENDIENTE",
        val: formatCLP(kpis.totalDeuda),
        sub: `${kpis.docsPendientes} por cobrar`,
        color: [224, 90, 16] as [number, number, number],
      },
      {
        title: "PROMEDIO MENSUAL EMITIDO",
        val: formatCLP(Math.round(kpis.promedioMensual)),
        sub: `${monthlyData.length} meses activos`,
        color: [30, 58, 138] as [number, number, number],
      },
    ];

    kpiCards.forEach((c, idx) => {
      const x = 14 + idx * (cardW + 4);
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(x, 28, cardW, 18, 2, 2, "FD");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      doc.text(c.title, x + 3, 33);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(c.color[0], c.color[1], c.color[2]);
      doc.text(c.val, x + 3, 39.5);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(71, 85, 105);
      doc.text(c.sub, x + 3, 44);
    });

    // Tabla 1: Evolución Mensual
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text("1. Evolución Mensual: Emitido SII vs Recaudado vs Deuda Pendiente", 14, 53);

    autoTable(doc, {
      startY: 56,
      head: [
        [
          "MES",
          "CANT. DOCS",
          "EMITIDO SII ($)",
          "RECAUDADO ($)",
          "DEUDA PENDIENTE ($)",
          "% COBRO",
        ],
      ],
      body: monthlyData.map((m) => [
        m.label,
        String(m.docsCount),
        formatCLP(m.emitido),
        formatCLP(m.recaudado),
        formatCLP(m.deuda),
        `${m.pctRecaudacion.toFixed(1)}%`,
      ]),
      theme: "grid",
      headStyles: {
        fillColor: [15, 23, 42],
        textColor: 255,
        fontSize: 8,
        fontStyle: "bold",
      },
      styles: { fontSize: 8, cellPadding: 2 },
      columnStyles: {
        1: { halign: "center" },
        2: { halign: "right" },
        3: { halign: "right" },
        4: { halign: "right" },
        5: { halign: "right" },
      },
      margin: { left: 14, right: 14 },
    });

    const afterMonthY =
      (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable
        ?.finalY || 110;

    // Tabla 2: Consolidado por Cliente
    const nextStartY = afterMonthY + 8 > pageH - 35 ? 20 : afterMonthY + 8;
    if (afterMonthY + 8 > pageH - 35) {
      doc.addPage();
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text(
      "2. Consolidado de Emisión, Recaudación y Deuda por Cliente",
      14,
      nextStartY
    );

    const clientBody = clientRows.map((c) => [
      c.rutDisplay,
      c.razonSocial,
      formatCLP(c.emitido),
      formatCLP(c.pagado),
      formatCLP(c.deuda),
      `${c.pctRecaudacion.toFixed(1)}%`,
      c.deuda === 0 ? "Al Día" : "Por Cobrar",
    ]);

    clientBody.push([
      {
        content: "TOTAL GENERAL",
        colSpan: 2,
        styles: {
          fontStyle: "bold",
          fillColor: [15, 23, 42],
          textColor: [255, 255, 255],
        },
      } as unknown as string,
      {
        content: formatCLP(kpis.totalEmitido),
        styles: {
          fontStyle: "bold",
          halign: "right",
          fillColor: [15, 23, 42],
          textColor: [255, 255, 255],
        },
      } as unknown as string,
      {
        content: formatCLP(kpis.totalRecaudado),
        styles: {
          fontStyle: "bold",
          halign: "right",
          fillColor: [15, 23, 42],
          textColor: [255, 255, 255],
        },
      } as unknown as string,
      {
        content: formatCLP(kpis.totalDeuda),
        styles: {
          fontStyle: "bold",
          halign: "right",
          fillColor: [15, 23, 42],
          textColor: [255, 255, 255],
        },
      } as unknown as string,
      {
        content: `${kpis.pctRecaudacionGlobal.toFixed(1)}%`,
        styles: {
          fontStyle: "bold",
          halign: "right",
          fillColor: [15, 23, 42],
          textColor: [255, 255, 255],
        },
      } as unknown as string,
      {
        content: "",
        styles: {
          fillColor: [15, 23, 42],
          textColor: [255, 255, 255],
        },
      } as unknown as string,
    ]);

    autoTable(doc, {
      startY: nextStartY + 3,
      head: [
        [
          "RUT CLIENTE",
          "RAZÓN SOCIAL",
          "TOTAL EMITIDO",
          "TOTAL PAGADO",
          "DEUDA PENDIENTE",
          "% REC.",
          "ESTADO",
        ],
      ],
      body: clientBody,
      theme: "grid",
      headStyles: {
        fillColor: [15, 23, 42],
        textColor: 255,
        fontSize: 8,
        fontStyle: "bold",
      },
      styles: { fontSize: 7.5, cellPadding: 2 },
      columnStyles: {
        0: { cellWidth: 28 },
        2: { halign: "right" },
        3: { halign: "right" },
        4: { halign: "right" },
        5: { halign: "right", cellWidth: 18 },
        6: { halign: "center", cellWidth: 24 },
      },
      margin: { left: 14, right: 14, bottom: 18 },
    });

    const totalPagesPdf = doc.getNumberOfPages();
    for (let i = 1; i <= totalPagesPdf; i++) {
      doc.setPage(i);
      doc.setDrawColor(226, 232, 240);
      doc.line(14, pageH - 12, pageW - 14, pageH - 12);
      doc.setFont("helvetica", "italic");
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(
        "Gerencia de Administración y Finanzas — TENSACON S.A.",
        14,
        pageH - 7
      );
      doc.setFont("helvetica", "normal");
      doc.text(
        `Página ${i} de ${totalPagesPdf} · ${controlCode}`,
        pageW - 14,
        pageH - 7,
        { align: "right" }
      );
    }

    doc.save(`Reporte_Ventas_Tensacon_${now.toISOString().slice(0, 10)}.pdf`);
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-4 sm:p-6 space-y-5">
      {/* A. Cabecera Superior */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-xs">
        <div className="flex items-start gap-3.5">
          <div className="h-10 w-10 rounded-lg bg-orange-50 border border-orange-200 text-[#E05A10] flex items-center justify-center shrink-0">
            <BarChart3 className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-[#0F172A] tracking-tight">
              Reportes de Ventas
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              Análisis comparativo de facturación emitida (SII), recaudación
              efectiva y evolución de deuda de clientes.
            </p>
          </div>
        </div>

        {/* Filtros + Exportar PDF */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Período / Año */}
          <div className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5">
            <Filter className="h-3.5 w-3.5 text-slate-400" />
            <select
              value={yearFilter}
              onChange={(e) => {
                setYearFilter(e.target.value);
                setPage(1);
              }}
              className="bg-transparent text-xs font-semibold text-slate-700 focus:outline-none cursor-pointer"
            >
              <option value="TODOS">Todos los Períodos</option>
              {availableYears.map((y) => (
                <option key={y} value={y}>
                  Año {y}
                </option>
              ))}
            </select>
          </div>

          {/* ON */}
          <div className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5">
            <select
              value={onFilter}
              onChange={(e) => {
                setOnFilter(e.target.value);
                setPage(1);
              }}
              className="bg-transparent text-xs font-semibold text-slate-700 focus:outline-none cursor-pointer max-w-[160px]"
            >
              <option value="TODAS">ON: Todas</option>
              {availableOns.map((on) => (
                <option key={on.codigo} value={on.codigo}>
                  ON {on.codigo}
                  {on.nombre ? ` — ${on.nombre}` : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Cliente Combobox */}
          <div className="relative" ref={clienteDropdownRef}>
            <button
              type="button"
              onClick={() => setIsClienteOpen((v) => !v)}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer max-w-[220px]"
            >
              <Search className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              <span className="truncate">
                {selectedClienteObj
                  ? selectedClienteObj.razonSocial
                  : "Todos los Clientes"}
              </span>
              {selectedClienteObj ? (
                <X
                  className="h-3.5 w-3.5 text-slate-400 hover:text-slate-700 shrink-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    setClienteFilter("TODOS");
                    setClienteSearch("");
                    setPage(1);
                  }}
                />
              ) : (
                <ChevronDown className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              )}
            </button>

            {isClienteOpen && (
              <div className="absolute right-0 mt-1.5 w-72 z-40 rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden">
                <div className="p-2 border-b border-slate-100 bg-slate-50/70">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                    <input
                      type="text"
                      autoFocus
                      value={clienteSearch}
                      onChange={(e) => setClienteSearch(e.target.value)}
                      placeholder="Buscar cliente por nombre o RUT..."
                      className="w-full rounded-lg border border-slate-200 bg-white pl-8 pr-2.5 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 focus:border-[#E05A10] focus:outline-none"
                    />
                  </div>
                </div>
                <div className="max-h-60 overflow-y-auto divide-y divide-slate-100">
                  <button
                    type="button"
                    onClick={() => {
                      setClienteFilter("TODOS");
                      setIsClienteOpen(false);
                      setClienteSearch("");
                      setPage(1);
                    }}
                    className={cn(
                      "w-full px-3 py-2 text-left text-xs font-medium hover:bg-slate-50 cursor-pointer",
                      clienteFilter === "TODOS" &&
                        "bg-orange-50/70 text-[#E05A10] font-semibold"
                    )}
                  >
                    Todos los Clientes
                  </button>
                  {filteredClientesDropdown.map((c) => (
                    <button
                      key={c.rutKey}
                      type="button"
                      onClick={() => {
                        setClienteFilter(c.rutKey);
                        setIsClienteOpen(false);
                        setClienteSearch("");
                        setPage(1);
                      }}
                      className={cn(
                        "w-full px-3 py-2 text-left flex items-center justify-between gap-2 text-xs hover:bg-slate-50 cursor-pointer",
                        clienteFilter === c.rutKey &&
                          "bg-orange-50/70 text-[#0F172A] font-semibold"
                      )}
                    >
                      <span className="truncate">{c.razonSocial}</span>
                      <span className="font-mono text-[11px] text-slate-400 shrink-0">
                        {c.rutDisplay}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={handleExportPDF}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#E05A10] hover:bg-[#c84e0c] px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs transition-colors cursor-pointer"
          >
            <FileDown className="h-3.5 w-3.5" />
            Exportar PDF
          </button>
        </div>
      </div>

      {/* B. 4 Tarjetas KPI Superiores */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* KPI 1 */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              TOTAL EMITIDO (FACTURAS)
            </span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
              {kpis.totalDocsEmitidos} docs
            </span>
          </div>
          <div className="mt-2.5 text-2xl font-bold text-[#0F172A] font-mono tracking-tight">
            {formatCLP(kpis.totalEmitido)}
          </div>
          <p className="mt-1 text-[11px] text-slate-400">
            Neto emitido SII (descontando NC 61)
          </p>
        </div>

        {/* KPI 2 */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              RECAUDADO (PAGADO)
            </span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
              {kpis.pctRecaudacionGlobal.toFixed(1)}%
            </span>
          </div>
          <div className="mt-2.5 text-2xl font-bold text-emerald-600 font-mono tracking-tight">
            {formatCLP(kpis.totalRecaudado)}
          </div>
          <div className="mt-2 h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all duration-300"
              style={{ width: `${Math.min(100, kpis.pctRecaudacionGlobal)}%` }}
            />
          </div>
        </div>

        {/* KPI 3 */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              DEUDA TOTAL PENDIENTE
            </span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-orange-50 text-[#E05A10] border border-orange-200">
              Por Cobrar
            </span>
          </div>
          <div className="mt-2.5 text-2xl font-bold text-[#E05A10] font-mono tracking-tight">
            {formatCLP(kpis.totalDeuda)}
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            {kpis.docsPendientes} facturas pendientes de cobro
          </p>
        </div>

        {/* KPI 4 */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              PROMEDIO MENSUAL EMITIDO
            </span>
            <TrendingUp className="h-4 w-4 text-slate-400" />
          </div>
          <div className="mt-2.5 text-2xl font-bold text-[#0F172A] font-mono tracking-tight">
            {formatCLP(Math.round(kpis.promedioMensual))}
          </div>
          <p className="mt-1 text-[11px] text-slate-400">
            Sobre {monthlyData.length}{" "}
            {monthlyData.length === 1 ? "mes activo" : "meses activos"}
          </p>
        </div>
      </div>

      {/* C. Gráfico Principal de Líneas Suavizadas */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div>
            <h2 className="text-xs sm:text-sm font-bold uppercase tracking-wide text-[#0F172A]">
              COMPORTAMIENTO DE DEUDA VS RECAUDACIÓN (POR MES)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Evolución mensual cronológica en pesos chilenos ($ CLP)
            </p>
          </div>

          {/* Leyenda interactiva superior derecha */}
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <button
              type="button"
              onClick={() => setShowEmitido((v) => !v)}
              className={cn(
                "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border transition-opacity cursor-pointer",
                showEmitido
                  ? "border-slate-200 bg-slate-50 text-[#0F172A] font-semibold"
                  : "border-slate-100 bg-white text-slate-400 opacity-50"
              )}
            >
              <span className="h-2.5 w-2.5 rounded-full bg-[#0F172A]" />
              Emitido (SII)
            </button>

            <button
              type="button"
              onClick={() => setShowRecaudado((v) => !v)}
              className={cn(
                "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border transition-opacity cursor-pointer",
                showRecaudado
                  ? "border-emerald-200 bg-emerald-50/70 text-emerald-800 font-semibold"
                  : "border-slate-100 bg-white text-slate-400 opacity-50"
              )}
            >
              <span className="h-2.5 w-2.5 rounded-full bg-[#10B981]" />
              Recaudado (Pagos)
            </button>

            <button
              type="button"
              onClick={() => setShowDeuda((v) => !v)}
              className={cn(
                "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border transition-opacity cursor-pointer",
                showDeuda
                  ? "border-rose-200 bg-rose-50/70 text-rose-800 font-semibold"
                  : "border-slate-100 bg-white text-slate-400 opacity-50"
              )}
            >
              <span className="h-2.5 w-2.5 rounded-full bg-[#EF4444]" />
              Deuda Pendiente
            </button>
          </div>
        </div>

        {monthlyData.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-sm text-slate-400 border border-dashed border-slate-200 rounded-lg">
            No existen documentos registrados para los filtros seleccionados.
          </div>
        ) : (
          <div className="relative w-full overflow-x-auto">
            <div className="min-w-[640px] relative">
              <svg
                viewBox={`0 0 ${chartGeom.width} ${chartGeom.height}`}
                className="w-full h-auto select-none"
                onMouseLeave={() => setHoveredIdx(null)}
              >
                <defs>
                  <linearGradient id="deudaAreaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#EF4444" stopOpacity="0.16" />
                    <stop offset="100%" stopColor="#EF4444" stopOpacity="0.01" />
                  </linearGradient>
                </defs>

                {/* Gridlines horizontales & Eje Y */}
                {chartGeom.yTicks.map((t, idx) => (
                  <g key={idx}>
                    <line
                      x1={chartGeom.padL}
                      y1={t.y}
                      x2={chartGeom.width - chartGeom.padR}
                      y2={t.y}
                      stroke="#E2E8F0"
                      strokeDasharray={idx === 0 ? undefined : "3 3"}
                    />
                    <text
                      x={chartGeom.padL - 10}
                      y={t.y + 4}
                      textAnchor="end"
                      className="fill-slate-400 text-[11px] font-mono"
                    >
                      {formatAxisMillions(t.value)}
                    </text>
                  </g>
                ))}

                {/* Área degradada Deuda Pendiente */}
                {showDeuda && chartGeom.deudaAreaPath && (
                  <path
                    d={chartGeom.deudaAreaPath}
                    fill="url(#deudaAreaGrad)"
                  />
                )}

                {/* Línea Emitido (SII) */}
                {showEmitido && chartGeom.emitidoPath && (
                  <path
                    d={chartGeom.emitidoPath}
                    fill="none"
                    stroke="#0F172A"
                    strokeWidth={2.5}
                    strokeLinecap="round"
                  />
                )}

                {/* Línea Recaudado (Pagos) */}
                {showRecaudado && chartGeom.recaudadoPath && (
                  <path
                    d={chartGeom.recaudadoPath}
                    fill="none"
                    stroke="#10B981"
                    strokeWidth={2.5}
                    strokeLinecap="round"
                  />
                )}

                {/* Línea Deuda Pendiente */}
                {showDeuda && chartGeom.deudaPath && (
                  <path
                    d={chartGeom.deudaPath}
                    fill="none"
                    stroke="#EF4444"
                    strokeWidth={3}
                    strokeLinecap="round"
                  />
                )}

                {/* Crosshair vertical en hover */}
                {hoveredIdx !== null && monthlyData[hoveredIdx] && (
                  <line
                    x1={chartGeom.xFor(hoveredIdx)}
                    y1={chartGeom.padT}
                    x2={chartGeom.xFor(hoveredIdx)}
                    y2={chartGeom.padT + chartGeom.plotH}
                    stroke="#94A3B8"
                    strokeWidth={1}
                    strokeDasharray="4 4"
                  />
                )}

                {/* Puntos & Labels Eje X */}
                {monthlyData.map((m, i) => {
                  const x = chartGeom.xFor(i);
                  const isHov = hoveredIdx === i;
                  const colW =
                    monthlyData.length > 1
                      ? chartGeom.plotW / (monthlyData.length - 1)
                      : chartGeom.plotW;

                  return (
                    <g key={m.mesKey}>
                      {showEmitido && (
                        <circle
                          cx={x}
                          cy={chartGeom.emitidoPts[i].y}
                          r={isHov ? 5 : 3}
                          fill="#0F172A"
                          stroke="#FFFFFF"
                          strokeWidth={1.5}
                        />
                      )}
                      {showRecaudado && (
                        <circle
                          cx={x}
                          cy={chartGeom.recaudadoPts[i].y}
                          r={isHov ? 5 : 3}
                          fill="#10B981"
                          stroke="#FFFFFF"
                          strokeWidth={1.5}
                        />
                      )}
                      {showDeuda && (
                        <circle
                          cx={x}
                          cy={chartGeom.deudaPts[i].y}
                          r={isHov ? 5.5 : 3.5}
                          fill="#EF4444"
                          stroke="#FFFFFF"
                          strokeWidth={1.5}
                        />
                      )}

                      <text
                        x={x}
                        y={chartGeom.height - 10}
                        textAnchor="middle"
                        className={cn(
                          "text-[11px] font-medium",
                          isHov ? "fill-[#0F172A] font-bold" : "fill-slate-500"
                        )}
                      >
                        {m.label}
                      </text>

                      {/* Zona invisible interactiva */}
                      <rect
                        x={x - colW / 2}
                        y={chartGeom.padT}
                        width={colW}
                        height={chartGeom.plotH + 24}
                        fill="transparent"
                        className="cursor-crosshair"
                        onMouseEnter={() => setHoveredIdx(i)}
                      />
                    </g>
                  );
                })}
              </svg>

              {/* Tooltip Oscuro Ejecutivo */}
              {hoveredIdx !== null && monthlyData[hoveredIdx] && (
                <div
                  className="pointer-events-none absolute top-3 z-20 rounded-lg bg-[#0F172A] text-white px-3.5 py-2.5 shadow-xl border border-slate-700 text-xs min-w-[215px]"
                  style={{
                    left: `${Math.min(
                      72,
                      Math.max(
                        6,
                        (chartGeom.xFor(hoveredIdx) / chartGeom.width) * 100 - 10
                      )
                    )}%`,
                  }}
                >
                  <div className="font-bold text-slate-200 border-b border-slate-700 pb-1 mb-1.5 flex items-center justify-between">
                    <span>{monthlyData[hoveredIdx].label}</span>
                    <span className="text-[10px] text-slate-400 font-normal">
                      {monthlyData[hoveredIdx].docsCount} docs
                    </span>
                  </div>
                  <div className="space-y-1 font-mono">
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-slate-300 font-sans">Emitido:</span>
                      <span className="font-semibold text-white">
                        {formatCLP(monthlyData[hoveredIdx].emitido)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-emerald-300 font-sans">
                        Recaudado:
                      </span>
                      <span className="font-semibold text-emerald-400">
                        {formatCLP(monthlyData[hoveredIdx].recaudado)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-rose-300 font-sans">
                        Deuda Pendiente:
                      </span>
                      <span className="font-semibold text-rose-400">
                        {formatCLP(monthlyData[hoveredIdx].deuda)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-4 border-t border-slate-700 pt-1 mt-1">
                      <span className="text-slate-300 font-sans">
                        % Recaudación:
                      </span>
                      <span className="font-bold text-[#E05A10]">
                        {monthlyData[hoveredIdx].pctRecaudacion.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* D. Tabla Inferior: CONSOLIDADO DE EMISIÓN, RECAUDACIÓN Y DEUDA POR CLIENTE */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <h2 className="text-xs sm:text-sm font-bold uppercase tracking-wide text-[#0F172A]">
            CONSOLIDADO DE EMISIÓN, RECAUDACIÓN Y DEUDA POR CLIENTE
          </h2>
          <span className="text-xs text-slate-500">
            {clientRows.length}{" "}
            {clientRows.length === 1 ? "cliente" : "clientes"}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <th className="py-2.5 px-4">RUT CLIENTE</th>
                <th className="py-2.5 px-4">RAZÓN SOCIAL</th>
                <th className="py-2.5 px-4 text-right">TOTAL EMITIDO</th>
                <th className="py-2.5 px-4 text-right">TOTAL PAGADO</th>
                <th className="py-2.5 px-4 text-right">DEUDA PENDIENTE</th>
                <th className="py-2.5 px-4 w-44">% RECAUDACIÓN</th>
                <th className="py-2.5 px-4 text-center">ESTADO</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {paginatedClients.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="py-10 text-center text-slate-400 text-sm"
                  >
                    Sin registros de clientes para los filtros activos.
                  </td>
                </tr>
              ) : (
                paginatedClients.map((c) => (
                  <tr
                    key={c.rutKey}
                    className="hover:bg-slate-50/80 transition-colors"
                  >
                    <td className="py-2.5 px-4 font-mono text-xs text-slate-600 whitespace-nowrap">
                      {c.rutDisplay}
                    </td>
                    <td className="py-2.5 px-4 font-bold text-slate-900">
                      {c.razonSocial}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-right text-slate-800 whitespace-nowrap">
                      {formatCLP(c.emitido)}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-right text-emerald-600 font-semibold whitespace-nowrap">
                      {formatCLP(c.pagado)}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-right text-[#E05A10] font-bold whitespace-nowrap">
                      {formatCLP(c.deuda)}
                    </td>
                    <td className="py-2.5 px-4">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className={cn(
                              "h-full rounded-full transition-all",
                              c.pctRecaudacion >= 99.9
                                ? "bg-emerald-500"
                                : c.pctRecaudacion >= 50
                                ? "bg-blue-500"
                                : "bg-amber-500"
                            )}
                            style={{
                              width: `${Math.min(100, c.pctRecaudacion)}%`,
                            }}
                          />
                        </div>
                        <span className="font-mono text-[11px] font-semibold text-slate-600 w-11 text-right">
                          {c.pctRecaudacion.toFixed(1)}%
                        </span>
                      </div>
                    </td>
                    <td className="py-2.5 px-4 text-center whitespace-nowrap">
                      {c.deuda === 0 ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          Al Día
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                          Por Cobrar
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {clientRows.length > 0 && (
              <tfoot>
                <tr className="bg-[#0F172A] text-white text-xs font-bold">
                  <td colSpan={2} className="py-3 px-4 uppercase tracking-wide">
                    TOTAL GENERAL CONSOLIDADO
                  </td>
                  <td className="py-3 px-4 font-mono text-right whitespace-nowrap">
                    {formatCLP(kpis.totalEmitido)}
                  </td>
                  <td className="py-3 px-4 font-mono text-right text-emerald-400 whitespace-nowrap">
                    {formatCLP(kpis.totalRecaudado)}
                  </td>
                  <td className="py-3 px-4 font-mono text-right text-orange-400 whitespace-nowrap">
                    {formatCLP(kpis.totalDeuda)}
                  </td>
                  <td className="py-3 px-4 font-mono text-right whitespace-nowrap">
                    {kpis.pctRecaudacionGlobal.toFixed(1)}%
                  </td>
                  <td className="py-3 px-4" />
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* Paginación estándar 30 registros por página */}
        {totalPages > 1 && (
          <div className="px-5 py-3 border-t border-slate-200 bg-slate-50/70 flex items-center justify-between text-xs text-slate-600">
            <span>
              Mostrando{" "}
              <strong>
                {(safePage - 1) * PAGE_SIZE + 1}–
                {Math.min(safePage * PAGE_SIZE, clientRows.length)}
              </strong>{" "}
              de <strong>{clientRows.length}</strong> clientes
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Ant.
              </button>
              <span className="px-2 font-mono">
                {safePage} / {totalPages}
              </span>
              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
              >
                Sig.
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
