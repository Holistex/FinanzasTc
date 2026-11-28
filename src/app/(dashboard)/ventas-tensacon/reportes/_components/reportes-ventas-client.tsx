"use client";

import React, { useMemo, useState, useRef, useEffect } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  BarChart3,
  Building2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileDown,
  Filter,
  Search,
  TrendingUp,
  X,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  LabelList,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { FacturaVenta, MantenedorON } from "@/types/database.types";
import { LOGO_TENSACON_BASE64 } from "@/lib/pdf/logo-tensacon";
import {
  calculateDueDateInfo,
  cn,
  formatCLP,
  formatDateCL,
  formatRutDisplay,
  normalizeRut,
} from "@/lib/utils";

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

const formatMillonesLabel = (valor: number): string => {
  const num = Number(valor || 0);
  if (num <= 0) return "";
  const millones = Math.round(num / 1_000_000);
  if (millones <= 0) return "";
  return `$ ${millones.toLocaleString("es-CL")}M`;
};

function renderInnerBarLabel(props: {
  x?: number | string;
  y?: number | string;
  width?: number | string;
  height?: number | string;
  value?: string | number | boolean | null;
}) {
  const x = Number(props.x ?? 0);
  const y = Number(props.y ?? 0);
  const width = Number(props.width ?? 0);
  const height = Number(props.height ?? 0);
  const val = Number(props.value ?? 0);

  if (height < 16 || width < 28) return null;
  const label = formatMillonesLabel(val);
  if (!label) return null;

  return (
    <text
      x={x + width / 2}
      y={y + height / 2}
      fill="#FFFFFF"
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={10}
      fontWeight={700}
    >
      {label}
    </text>
  );
}

function renderTopTotalLabel(props: {
  x?: number | string;
  y?: number | string;
  width?: number | string;
  value?: string | number | boolean | null;
}) {
  const x = Number(props.x ?? 0);
  const y = Number(props.y ?? 0);
  const width = Number(props.width ?? 0);
  const val = Number(props.value ?? 0);

  const label = formatMillonesLabel(val);
  if (!label) return null;

  const cx = x + width / 2;
  const boxWidth = Math.max(46, label.length * 6.5 + 10);

  return (
    <g>
      <rect
        x={cx - boxWidth / 2}
        y={y - 19}
        width={boxWidth}
        height={16}
        rx={4}
        fill="#FFFFFF"
        fillOpacity={0.88}
      />
      <text
        x={cx}
        y={y - 7}
        fill="#0F172A"
        textAnchor="middle"
        fontSize={10}
        fontWeight={700}
        style={{
          paintOrder: "stroke",
          stroke: "#FFFFFF",
          strokeWidth: 4,
          strokeLinejoin: "round",
        }}
      >
        {label}
      </text>
    </g>
  );
}

interface CustomTooltipPayloadItem {
  payload?: MonthlyPoint & { promedioMensual: number };
}

function ComposedChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: CustomTooltipPayloadItem[];
}) {
  if (!active || !payload || payload.length === 0 || !payload[0].payload) {
    return null;
  }
  const pt = payload[0].payload;
  return (
    <div className="rounded-lg bg-[#0F172A] text-white px-3.5 py-2.5 shadow-xl border border-slate-700 text-xs min-w-[225px]">
      <div className="font-bold text-slate-200 border-b border-slate-700 pb-1 mb-1.5 flex items-center justify-between">
        <span>{pt.label}</span>
        <span className="text-[10px] text-slate-400 font-normal">
          {pt.docsCount} docs
        </span>
      </div>
      <div className="space-y-1 font-mono">
        <div className="flex items-center justify-between gap-4">
          <span className="text-slate-300 font-sans">Emitido (SII):</span>
          <span className="font-semibold text-white">
            {formatCLP(pt.emitido)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-emerald-300 font-sans">Recaudado:</span>
          <span className="font-semibold text-emerald-400">
            {formatCLP(pt.recaudado)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-orange-300 font-sans">Deuda Pendiente:</span>
          <span className="font-semibold text-orange-400">
            {formatCLP(pt.deuda)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4 border-t border-slate-700 pt-1 mt-1">
          <span className="text-slate-300 font-sans">% Recaudación:</span>
          <span className="font-bold text-[#E05A10]">
            {pt.pctRecaudacion.toFixed(1)}%
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-slate-400 font-sans">Prom. Mensual:</span>
          <span className="text-slate-300">
            {formatCLP(Math.round(pt.promedioMensual))}
          </span>
        </div>
      </div>
    </div>
  );
}

interface DeudaEntidadDoc {
  id: string;
  folio: number;
  razonSocial: string;
  onProyecto: string;
  fechaEmision: string;
  fechaVencimiento: string;
  deudaPendiente: number;
}

interface DeudaEntidadRow {
  entityKey: string;
  entityName: string;
  shortName: string;
  totalDeuda: number;
  pctDeuda: number;
  docsCount: number;
  docs: DeudaEntidadDoc[];
}

type ReporteTab = "reporte_ventas" | "deuda_clientes";
type AlcanceCartera = "FACTORING" | "DIRECTA" | "CONSOLIDADO";

function HorizontalBarTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload?: DeudaEntidadRow }>;
}) {
  if (!active || !payload || payload.length === 0 || !payload[0].payload) {
    return null;
  }
  const item = payload[0].payload;
  return (
    <div className="rounded-lg bg-[#0F172A] text-white px-3.5 py-2.5 shadow-xl border border-slate-700 text-xs min-w-[210px]">
      <div className="font-bold text-slate-100 border-b border-slate-700 pb-1 mb-1.5">
        {item.entityName}
      </div>
      <div className="space-y-1 font-mono">
        <div className="flex items-center justify-between gap-4">
          <span className="text-slate-300 font-sans">Deuda Total:</span>
          <span className="font-bold text-white">
            {formatCLP(item.totalDeuda)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-slate-300 font-sans">Participación:</span>
          <span className="font-semibold text-[#E05A10]">
            {item.pctDeuda.toFixed(2).replace(".", ",")} %
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-slate-300 font-sans">Documentos:</span>
          <span className="font-semibold text-blue-300">
            {item.docsCount} {item.docsCount === 1 ? "doc" : "docs"}
          </span>
        </div>
      </div>
    </div>
  );
}

function renderHorizontalMillionsLabel(props: {
  x?: number | string;
  y?: number | string;
  width?: number | string;
  height?: number | string;
  value?: string | number | boolean | null;
}) {
  const x = Number(props.x ?? 0);
  const y = Number(props.y ?? 0);
  const width = Number(props.width ?? 0);
  const height = Number(props.height ?? 0);
  const val = Number(props.value ?? 0);

  if (val <= 0) return null;
  const millones = val / 1_000_000;
  const label = `${millones.toLocaleString("es-CL", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })} M`;

  const pillW = Math.max(46, label.length * 6.5 + 10);
  const pillH = 18;
  const pillX = x + width + 6;
  const pillY = y + height / 2 - pillH / 2;

  return (
    <g>
      <rect
        x={pillX}
        y={pillY}
        width={pillW}
        height={pillH}
        rx={4}
        fill="#E05A10"
      />
      <text
        x={pillX + pillW / 2}
        y={pillY + pillH / 2}
        fill="#FFFFFF"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={10}
        fontWeight={700}
      >
        {label}
      </text>
    </g>
  );
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

  const [activeTab, setActiveTab] = useState<ReporteTab>("reporte_ventas");
  const [alcanceCartera, setAlcanceCartera] =
    useState<AlcanceCartera>("FACTORING");
  const [expandedEntidades, setExpandedEntidades] = useState<
    Record<string, boolean>
  >({});

  const [showRecaudado, setShowRecaudado] = useState<boolean>(true);
  const [showDeuda, setShowDeuda] = useState<boolean>(true);
  const [showPromedio, setShowPromedio] = useState<boolean>(true);
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

  const monthlyChartData = useMemo(
    () =>
      monthlyData.map((m) => ({
        ...m,
        promedioMensual: Math.round(kpis.promedioMensual),
      })),
    [monthlyData, kpis.promedioMensual]
  );

  // Desglose de Estado de Deuda Pendiente por tramos de vencimiento + Top Deudores
  const agingSummary = useMemo(() => {
    const buckets = [
      {
        id: "por_vencer",
        label: "Por Vencer (Al día)",
        colorBar: "bg-emerald-500",
        colorDot: "bg-emerald-500",
        colorText: "text-emerald-700",
        monto: 0,
        docs: 0,
      },
      {
        id: "vencida_1_30",
        label: "Vencida 1–30 días",
        colorBar: "bg-amber-500",
        colorDot: "bg-amber-500",
        colorText: "text-amber-700",
        monto: 0,
        docs: 0,
      },
      {
        id: "vencida_31_60",
        label: "Vencida 31–60 días",
        colorBar: "bg-[#E05A10]",
        colorDot: "bg-[#E05A10]",
        colorText: "text-[#E05A10]",
        monto: 0,
        docs: 0,
      },
      {
        id: "critica_60",
        label: "Crítica (+60 días)",
        colorBar: "bg-rose-600",
        colorDot: "bg-rose-600",
        colorText: "text-rose-700",
        monto: 0,
        docs: 0,
      },
    ];

    for (const f of filteredFacturas) {
      if (Number(f.tipo_doc) === 61) continue;
      const deuda = resolveDeudaClientSide(f);
      if (deuda <= 0) continue;

      const { diasRestantes } = calculateDueDateInfo(
        f.fecha_docto,
        f.fecha_vencimiento
      );
      if (diasRestantes >= 0) {
        buckets[0].monto += deuda;
        buckets[0].docs += 1;
      } else if (diasRestantes >= -30) {
        buckets[1].monto += deuda;
        buckets[1].docs += 1;
      } else if (diasRestantes >= -60) {
        buckets[2].monto += deuda;
        buckets[2].docs += 1;
      } else {
        buckets[3].monto += deuda;
        buckets[3].docs += 1;
      }
    }

    const topDeudores = clientRows.filter((c) => c.deuda > 0).slice(0, 3);
    return { buckets, topDeudores };
  }, [filteredFacturas, clientRows]);

  // Datos Pestaña 2: Deuda Clientes (Factoring / Directa / Consolidado)
  const deudaClientesData = useMemo(() => {
    let factoringDocsCount = 0;
    const entityMap = new Map<
      string,
      {
        entityKey: string;
        entityName: string;
        totalDeuda: number;
        docsCount: number;
        docs: DeudaEntidadDoc[];
      }
    >();

    for (const f of filteredFacturas) {
      if (Number(f.tipo_doc) === 61) continue;
      const deuda = resolveDeudaClientSide(f);
      if (deuda <= 0) continue;

      const factoringName = String(
        f.empresa_factoring_cliente?.razon_social ||
          f.entidad_factoring ||
          ""
      ).trim();
      const isFactoring =
        f.gestion_pago === "FACTORING" ||
        Boolean(f.factoring_cliente_id) ||
        (factoringName.length > 0 &&
          !["DIRECTO", "DIRECTO CLIENTE"].includes(
            factoringName.toUpperCase()
          ));

      if (isFactoring) {
        factoringDocsCount += 1;
      }

      if (alcanceCartera === "FACTORING" && !isFactoring) continue;
      if (alcanceCartera === "DIRECTA" && isFactoring) continue;

      let entityName = "DEUDA DIRECTA (SIN CESIÓN)";
      if (isFactoring) {
        entityName = factoringName || "FACTORING SIN ASIGNAR";
      } else if (alcanceCartera === "DIRECTA") {
        entityName = String(f.razon_social || "").trim() || formatRutDisplay(f.rut_cliente);
      }

      const entityKey = entityName.toUpperCase();
      const due = calculateDueDateInfo(f.fecha_docto, f.fecha_vencimiento);
      const docItem: DeudaEntidadDoc = {
        id: f.id,
        folio: Number(f.folio),
        razonSocial: String(f.razon_social || "").trim() || formatRutDisplay(f.rut_cliente),
        onProyecto: String(f.on_proyecto || "").trim() || "—",
        fechaEmision: formatDateCL(f.fecha_docto),
        fechaVencimiento: due.fechaVencimientoCL,
        deudaPendiente: deuda,
      };

      const prev = entityMap.get(entityKey) || {
        entityKey,
        entityName,
        totalDeuda: 0,
        docsCount: 0,
        docs: [],
      };
      prev.totalDeuda += deuda;
      prev.docsCount += 1;
      prev.docs.push(docItem);
      entityMap.set(entityKey, prev);
    }

    const totalDeuda = Array.from(entityMap.values()).reduce(
      (acc, e) => acc + e.totalDeuda,
      0
    );
    const totalDocs = Array.from(entityMap.values()).reduce(
      (acc, e) => acc + e.docsCount,
      0
    );

    const ranking: DeudaEntidadRow[] = Array.from(entityMap.values())
      .sort((a, b) => b.totalDeuda - a.totalDeuda)
      .map((e) => ({
        ...e,
        shortName:
          e.entityName.length > 22
            ? `${e.entityName.slice(0, 20)}…`
            : e.entityName,
        pctDeuda: totalDeuda > 0 ? (e.totalDeuda / totalDeuda) * 100 : 0,
        docs: e.docs.sort((a, b) => b.deudaPendiente - a.deudaPendiente),
      }));

    const top3Sum = ranking
      .slice(0, 3)
      .reduce((acc, r) => acc + r.totalDeuda, 0);
    const top3Pct = totalDeuda > 0 ? (top3Sum / totalDeuda) * 100 : 0;
    const liderNombre = ranking[0]?.entityName || "—";

    return {
      factoringDocsCount,
      ranking,
      totalDeuda,
      totalDocs,
      top3Pct,
      liderNombre,
    };
  }, [filteredFacturas, alcanceCartera]);

  const handleExportDeudaClientesPDF = () => {
    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const marginX = 12;
    const contentW = pageW - marginX * 2;
    const now = new Date();
    const fechaEmision = now.toLocaleDateString("es-CL");
    const correlativo = `${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
    const controlCode = `REP-FAC-2026-${correlativo}`;

    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, pageW, 24, "F");
    try {
      doc.addImage(LOGO_TENSACON_BASE64, "PNG", marginX, 6, 36, 9);
    } catch {
      // Fallback sin logo
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.setTextColor(15, 23, 42);
    doc.text(
      "REPORTE EJECUTIVO DE DEUDA PENDIENTE POR FACTORING (CLIENTES)",
      marginX + 39,
      10
    );

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);
    const scopeLabel =
      alcanceCartera === "FACTORING"
        ? "Factoring"
        : alcanceCartera === "DIRECTA"
        ? "Deuda Directa"
        : "Consolidado Total";
    const clienteLabel = selectedClienteObj
      ? `${selectedClienteObj.razonSocial} (${selectedClienteObj.rutDisplay})`
      : "Todos los Clientes";
    doc.text(
      `Alcance: ${scopeLabel} | Período: ${yearFilter === "TODOS" ? "Todos" : yearFilter} | ON: ${onFilter === "TODAS" ? "Todas" : onFilter} | Emisión: ${fechaEmision}`,
      marginX + 39,
      15
    );
    doc.text(`Cliente: ${clienteLabel}`, marginX + 39, 19);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(224, 90, 16);
    doc.text(controlCode, pageW - marginX, 19, { align: "right" });

    doc.setDrawColor(226, 232, 240);
    doc.line(marginX, 22, pageW - marginX, 22);

    // 3 KPI Cards summary row
    const cardW = (contentW - 6) / 3;
    const summaryCards = [
      {
        title:
          alcanceCartera === "FACTORING"
            ? "TOTAL DEUDA (FACTORIZADA)"
            : alcanceCartera === "DIRECTA"
            ? "TOTAL DEUDA DIRECTA"
            : "TOTAL DEUDA CONSOLIDADA",
        val: formatCLP(deudaClientesData.totalDeuda),
        sub: `${deudaClientesData.ranking.length} entidades`,
        color: [15, 23, 42] as [number, number, number],
      },
      {
        title: "N° TOTAL DE FACTURAS",
        val: `${deudaClientesData.totalDocs} documentos`,
        sub: "Pendientes de cobro",
        color: [224, 90, 16] as [number, number, number],
      },
      {
        title: "CONCENTRACIÓN TOP 3",
        val: `${deudaClientesData.top3Pct.toFixed(1).replace(".", ",")}%`,
        sub: `Líder: ${deudaClientesData.liderNombre.slice(0, 26)}`,
        color: [37, 99, 235] as [number, number, number],
      },
    ];

    summaryCards.forEach((c, idx) => {
      const x = marginX + idx * (cardW + 3);
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(x, 25, cardW, 16, 2, 2, "FD");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(6.5);
      doc.setTextColor(100, 116, 139);
      doc.text(c.title, x + 2.5, 29.5);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(c.color[0], c.color[1], c.color[2]);
      doc.text(c.val, x + 2.5, 35);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(71, 85, 105);
      doc.text(c.sub, x + 2.5, 39);
    });

    const bodyRows = deudaClientesData.ranking.map((r, idx) => [
      `${idx + 1}.`,
      r.entityName,
      formatCLP(r.totalDeuda),
      `${r.pctDeuda.toFixed(2).replace(".", ",")} %`,
      String(r.docsCount),
    ]);

    bodyRows.push([
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
        content: formatCLP(deudaClientesData.totalDeuda),
        styles: {
          fontStyle: "bold",
          halign: "right",
          fillColor: [15, 23, 42],
          textColor: [255, 255, 255],
        },
      } as unknown as string,
      {
        content: "100,00 %",
        styles: {
          fontStyle: "bold",
          halign: "right",
          fillColor: [15, 23, 42],
          textColor: [255, 255, 255],
        },
      } as unknown as string,
      {
        content: String(deudaClientesData.totalDocs),
        styles: {
          fontStyle: "bold",
          halign: "center",
          fillColor: [15, 23, 42],
          textColor: [255, 255, 255],
        },
      } as unknown as string,
    ]);

    autoTable(doc, {
      startY: 45,
      head: [
        [
          "#",
          alcanceCartera === "DIRECTA" ? "CLIENTE DEUDOR" : "EMPRESA FACTORING",
          "$ TOTAL DEUDA CLIENTE",
          "% DEUDA",
          "DOCTOS",
        ],
      ],
      body: bodyRows,
      theme: "grid",
      headStyles: {
        fillColor: [15, 23, 42],
        textColor: 255,
        fontSize: 7.5,
        fontStyle: "bold",
        cellPadding: 1.8,
      },
      styles: { fontSize: 7.5, cellPadding: 1.6 },
      columnStyles: {
        0: { halign: "center", cellWidth: 10 },
        2: { halign: "right", fontStyle: "bold", cellWidth: 34 },
        3: { halign: "right", cellWidth: 22 },
        4: { halign: "center", cellWidth: 18 },
      },
      margin: { left: marginX, right: marginX, bottom: 16 },
    });

    // Bloque Gráfico Vectorial: PARTICIPACIÓN POR ENTIDAD (MILLONES)
    if (deudaClientesData.ranking.length > 0) {
      const afterTableY =
        (doc as unknown as { lastAutoTable?: { finalY?: number } })
          .lastAutoTable?.finalY || 120;

      const rowH = 6.8;
      const headerH = 14;
      const padBottom = 4;
      const boxH =
        headerH + deudaClientesData.ranking.length * rowH + padBottom;

      let chartY = afterTableY + 6;
      if (chartY + boxH > pageH - 16) {
        doc.addPage();
        chartY = 16;
      }

      // Contenedor blanco con borde suave
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(marginX, chartY, contentW, boxH, 2.5, 2.5, "FD");

      // Título y Subtítulo
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      doc.setTextColor(15, 23, 42);
      doc.text("PARTICIPACIÓN POR ENTIDAD (MILLONES)", marginX + 5, chartY + 6.5);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      doc.text(
        "Distribución de deuda pendiente ordenada de mayor a menor",
        marginX + 5,
        chartY + 10.5
      );

      const maxMonto = Math.max(
        ...deudaClientesData.ranking.map((r) => r.totalDeuda),
        1
      );
      const labelColW = 54;
      const barStartX = marginX + 5 + labelColW + 4;
      const pillReserveW = 22;
      const maxBarW = contentW - 10 - labelColW - 4 - pillReserveW;

      deudaClientesData.ranking.forEach((ent, idx) => {
        const yRow = chartY + headerH + idx * rowH;

        // Etiqueta entidad alineada a la derecha
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7);
        doc.setTextColor(51, 65, 85);
        const labelText =
          ent.entityName.length > 32
            ? `${ent.entityName.slice(0, 30)}...`
            : ent.entityName;
        doc.text(labelText, marginX + 5 + labelColW, yRow + 3.6, {
          align: "right",
        });

        // Barra azul corporativa
        const barW = Math.max(3, (ent.totalDeuda / maxMonto) * maxBarW);
        doc.setFillColor(37, 99, 235);
        doc.roundedRect(barStartX, yRow + 0.7, barW, 4.2, 0.8, 0.8, "F");

        // Badge naranja en millones con 1 decimal
        const millonesStr = `${(ent.totalDeuda / 1_000_000).toLocaleString(
          "es-CL",
          {
            minimumFractionDigits: 1,
            maximumFractionDigits: 1,
          }
        )} M`;
        const pillW = Math.max(15, millonesStr.length * 1.9 + 4);
        const pillX = barStartX + barW + 2.5;
        doc.setFillColor(224, 90, 16);
        doc.roundedRect(pillX, yRow + 0.5, pillW, 4.6, 1, 1, "F");

        doc.setFont("helvetica", "bold");
        doc.setFontSize(6.8);
        doc.setTextColor(255, 255, 255);
        doc.text(millonesStr, pillX + pillW / 2, yRow + 3.7, {
          align: "center",
        });
      });
    }

    const totalPagesPdf = doc.getNumberOfPages();
    for (let i = 1; i <= totalPagesPdf; i++) {
      doc.setPage(i);
      doc.setDrawColor(226, 232, 240);
      doc.line(marginX, pageH - 12, pageW - marginX, pageH - 12);
      doc.setFont("helvetica", "italic");
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(
        "Gerencia de Administración y Finanzas — TENSACON S.A.",
        marginX,
        pageH - 7
      );
      doc.setFont("helvetica", "normal");
      doc.text(
        `Página ${i} de ${totalPagesPdf} · ${controlCode}`,
        pageW - marginX,
        pageH - 7,
        { align: "right" }
      );
    }

    doc.save(
      `Reporte_Deuda_Factoring_Clientes_${now.toISOString().slice(0, 10)}.pdf`
    );
  };

  const handleExportPDF = () => {
    if (activeTab === "deuda_clientes") {
      handleExportDeudaClientesPDF();
      return;
    }
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

      {/* Barra de Pestañas (Segmented Control Ejecutivo) */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label="Secciones de Reportes de Ventas"
          className="inline-flex items-center gap-1 rounded-xl bg-slate-200/70 p-1 border border-slate-200"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "reporte_ventas"}
            onClick={() => setActiveTab("reporte_ventas")}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all cursor-pointer",
              activeTab === "reporte_ventas"
                ? "bg-white text-[#0F172A] shadow-xs ring-1 ring-slate-200"
                : "text-slate-600 hover:text-[#0F172A]"
            )}
          >
            <BarChart3
              className={cn(
                "h-3.5 w-3.5",
                activeTab === "reporte_ventas"
                  ? "text-[#E05A10]"
                  : "text-slate-400"
              )}
            />
            Reporte Ventas
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "deuda_clientes"}
            onClick={() => setActiveTab("deuda_clientes")}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all cursor-pointer",
              activeTab === "deuda_clientes"
                ? "bg-white text-[#0F172A] shadow-xs ring-1 ring-slate-200"
                : "text-slate-600 hover:text-[#0F172A]"
            )}
          >
            <Building2
              className={cn(
                "h-3.5 w-3.5",
                activeTab === "deuda_clientes"
                  ? "text-[#E05A10]"
                  : "text-slate-400"
              )}
            />
            Deuda Clientes
            <span
              className={cn(
                "inline-flex items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold font-mono",
                activeTab === "deuda_clientes"
                  ? "bg-orange-50 text-[#E05A10] border border-orange-200"
                  : "bg-slate-300/60 text-slate-700"
              )}
            >
              {deudaClientesData.factoringDocsCount}
            </span>
          </button>
        </div>

        {activeTab === "deuda_clientes" && (
          <div className="inline-flex items-center gap-1 rounded-full bg-white p-1 border border-slate-200 shadow-2xs">
            {(
              [
                { id: "FACTORING", label: "Factoring" },
                { id: "DIRECTA", label: "Deuda Directa" },
                { id: "CONSOLIDADO", label: "Consolidado Total" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  setAlcanceCartera(opt.id);
                  setExpandedEntidades({});
                }}
                className={cn(
                  "rounded-full px-3 py-1 text-[11px] font-semibold transition-colors cursor-pointer",
                  alcanceCartera === opt.id
                    ? "bg-[#0F172A] text-white"
                    : "text-slate-600 hover:bg-slate-100"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {activeTab === "reporte_ventas" ? (
        <>
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

      {/* C. Grid Analítico 12 Columnas (8 / 4) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-6">
        {/* COLUMNA IZQUIERDA (67%): EVOLUCIÓN DE FACTURACIÓN Y COBRANZA */}
        <div className="lg:col-span-8 bg-white rounded-xl border border-slate-200 p-6 shadow-sm flex flex-col justify-between">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <div>
              <h2 className="text-xs sm:text-sm font-bold uppercase tracking-wide text-[#0F172A]">
                EVOLUCIÓN DE FACTURACIÓN Y COBRANZA
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Barras apiladas (Recaudado + Deuda Pendiente) vs Promedio
                Mensual Emitido
              </p>
            </div>

            {/* Leyenda interactiva superior derecha */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
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
                <span className="h-2.5 w-2.5 rounded-sm bg-[#10B981]" />
                Recaudado
              </button>

              <button
                type="button"
                onClick={() => setShowDeuda((v) => !v)}
                className={cn(
                  "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border transition-opacity cursor-pointer",
                  showDeuda
                    ? "border-orange-200 bg-orange-50/70 text-[#E05A10] font-semibold"
                    : "border-slate-100 bg-white text-slate-400 opacity-50"
                )}
              >
                <span className="h-2.5 w-2.5 rounded-sm bg-[#E05A10]" />
                Deuda Pendiente
              </button>

              <button
                type="button"
                onClick={() => setShowPromedio((v) => !v)}
                className={cn(
                  "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border transition-opacity cursor-pointer",
                  showPromedio
                    ? "border-slate-200 bg-slate-50 text-slate-500 font-semibold"
                    : "border-slate-100 bg-white text-slate-400 opacity-50"
                )}
              >
                <span className="w-3 border-t-2 border-dashed border-slate-400" />
                Prom. Emitido
              </button>
            </div>
          </div>

          {monthlyChartData.length === 0 ? (
            <div className="h-72 flex items-center justify-center text-sm text-slate-400 border border-dashed border-slate-200 rounded-lg">
              No existen documentos registrados para los filtros seleccionados.
            </div>
          ) : (
            <div className="w-full h-[340px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={monthlyChartData}
                  margin={{ top: 28, right: 20, left: 10, bottom: 22 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="#E2E8F0"
                  />
                  <XAxis
                    dataKey="label"
                    height={38}
                    axisLine={{ stroke: "#E2E8F0" }}
                    tickLine={false}
                    tick={(tickProps: {
                      x?: number | string;
                      y?: number | string;
                      payload?: { value?: string };
                    }) => {
                      const x = Number(tickProps.x ?? 0);
                      const y = Number(tickProps.y ?? 0);
                      const monthLabel = String(tickProps.payload?.value ?? "");
                      const item = monthlyChartData.find(
                        (d) => d.label === monthLabel
                      );
                      const totalLabel = item
                        ? formatMillonesLabel(item.emitido) || "$ 0"
                        : "";
                      return (
                        <g transform={`translate(${x},${y})`}>
                          <text
                            x={0}
                            y={0}
                            dy={12}
                            textAnchor="middle"
                            fill="#334155"
                            fontSize={11}
                            fontWeight={700}
                          >
                            {monthLabel}
                          </text>
                          {totalLabel && (
                            <text
                              x={0}
                              y={0}
                              dy={26}
                              textAnchor="middle"
                              fill="#64748B"
                              fontSize={10}
                              fontWeight={700}
                              fontFamily="monospace"
                            >
                              {totalLabel}
                            </text>
                          )}
                        </g>
                      );
                    }}
                  />
                  <YAxis
                    tickFormatter={formatAxisMillions}
                    tick={{ fontSize: 11, fill: "#64748B" }}
                    axisLine={false}
                    tickLine={false}
                    width={60}
                  />
                  <RechartsTooltip
                    content={<ComposedChartTooltip />}
                    cursor={{ fill: "#F1F5F9", opacity: 0.6 }}
                  />
                  {showPromedio && kpis.promedioMensual > 0 && (
                    <ReferenceLine
                      y={kpis.promedioMensual}
                      stroke="#94A3B8"
                      strokeDasharray="4 4"
                      strokeWidth={1.25}
                      strokeOpacity={0.45}
                      ifOverflow="extendDomain"
                    />
                  )}
                  {showRecaudado && (
                    <Bar
                      dataKey="recaudado"
                      name="Recaudado"
                      stackId="cobranza"
                      fill="#10B981"
                      radius={showDeuda ? [0, 0, 4, 4] : [4, 4, 4, 4]}
                      maxBarSize={48}
                    >
                      <LabelList
                        dataKey="recaudado"
                        content={renderInnerBarLabel}
                      />
                      {!showDeuda && (
                        <LabelList
                          dataKey="emitido"
                          content={renderTopTotalLabel}
                        />
                      )}
                    </Bar>
                  )}
                  {showDeuda && (
                    <Bar
                      dataKey="deuda"
                      name="Deuda Pendiente"
                      stackId="cobranza"
                      fill="#E05A10"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={48}
                    >
                      <LabelList
                        dataKey="deuda"
                        content={renderInnerBarLabel}
                      />
                      <LabelList
                        dataKey="emitido"
                        content={renderTopTotalLabel}
                      />
                    </Bar>
                  )}
                  {showPromedio && kpis.promedioMensual > 0 && (
                    <Line
                      type="monotone"
                      dataKey="promedioMensual"
                      name="Prom. Mensual Emitido"
                      stroke="#94A3B8"
                      strokeWidth={1.25}
                      strokeDasharray="4 4"
                      strokeOpacity={0.45}
                      dot={false}
                      activeDot={false}
                    />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* COLUMNA DERECHA (33%): ESTADO DE DEUDA PENDIENTE */}
        <div className="lg:col-span-4 bg-white rounded-xl border border-slate-200 p-6 shadow-sm flex flex-col justify-between gap-5">
          <div>
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-xs sm:text-sm font-bold uppercase tracking-wide text-[#0F172A]">
                ESTADO DE DEUDA PENDIENTE
              </h2>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-orange-50 text-[#E05A10] border border-orange-200">
                {kpis.docsPendientes} docs
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Antigüedad de saldos por tramo de vencimiento
            </p>

            {/* Desglose por tramos */}
            <div className="mt-5 space-y-3.5">
              {agingSummary.buckets.map((b) => {
                const pct =
                  kpis.totalDeuda > 0 ? (b.monto / kpis.totalDeuda) * 100 : 0;
                return (
                  <div key={b.id} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="inline-flex items-center gap-1.5 font-semibold text-slate-700">
                        <span
                          className={cn("h-2 w-2 rounded-full", b.colorDot)}
                        />
                        {b.label}
                      </span>
                      <span className="text-[11px] text-slate-400 font-mono">
                        {b.docs} {b.docs === 1 ? "doc" : "docs"}
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all duration-300",
                          b.colorBar
                        )}
                        style={{ width: `${Math.min(100, pct)}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[11px] font-mono">
                      <span className={cn("font-bold", b.colorText)}>
                        {formatCLP(b.monto)}
                      </span>
                      <span className="text-slate-500">{pct.toFixed(1)}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Top 3 Clientes Deudores + Total Por Cobrar */}
          <div className="pt-4 border-t border-slate-100 space-y-2.5">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Principales Saldos por Cobrar
            </div>
            {agingSummary.topDeudores.length === 0 ? (
              <p className="text-xs text-emerald-600 font-medium">
                Cartera al día — sin saldos pendientes.
              </p>
            ) : (
              <div className="space-y-1.5">
                {agingSummary.topDeudores.map((c) => (
                  <div
                    key={c.rutKey}
                    className="flex items-center justify-between gap-2 text-xs"
                  >
                    <span className="truncate text-slate-700 font-medium">
                      {c.razonSocial}
                    </span>
                    <span className="font-mono font-bold text-[#E05A10] shrink-0">
                      {formatCLP(c.deuda)}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-600">
                Total Por Cobrar
              </span>
              <span className="font-mono font-bold text-sm text-[#0F172A]">
                {formatCLP(kpis.totalDeuda)}
              </span>
            </div>
          </div>
        </div>
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
        </>
      ) : (
        <div className="space-y-5">
          {/* B. Fila Superior de 3 Tarjetas KPI */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-xs flex flex-col justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                {alcanceCartera === "FACTORING"
                  ? "TOTAL DEUDA CLIENTE (FACTORIZADA)"
                  : alcanceCartera === "DIRECTA"
                  ? "TOTAL DEUDA DIRECTA"
                  : "TOTAL DEUDA CONSOLIDADA"}
              </span>
              <div className="mt-2.5 text-2xl font-black font-mono text-slate-900 tracking-tight">
                {formatCLP(deudaClientesData.totalDeuda)}
              </div>
              <p className="mt-1 text-[11px] text-slate-400">
                {deudaClientesData.ranking.length}{" "}
                {deudaClientesData.ranking.length === 1
                  ? "entidad con saldo pendiente"
                  : "entidades con saldo pendiente"}
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-xs flex flex-col justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                N° TOTAL DE FACTURAS
              </span>
              <div className="mt-2.5 text-2xl font-black font-mono text-[#E05A10] tracking-tight">
                {deudaClientesData.totalDocs}{" "}
                {deudaClientesData.totalDocs === 1 ? "documento" : "documentos"}
              </div>
              <p className="mt-1 text-[11px] text-slate-400">
                Documentos vigentes pendientes de cobro
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-xs flex flex-col justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                CONCENTRACIÓN TOP 3 ENTIDADES
              </span>
              <div className="mt-2.5 text-2xl font-black font-mono text-[#0F172A] tracking-tight">
                {deudaClientesData.top3Pct.toFixed(1).replace(".", ",")}%
              </div>
              <p className="mt-1 text-[11px] text-slate-500 truncate">
                Líder:{" "}
                <strong className="text-[#0F172A]">
                  {deudaClientesData.liderNombre}
                </strong>
              </p>
            </div>
          </div>

          {/* C. Bloque Central en Grid de 12 Columnas (7 Tabla Ranking + 5 Gráfico Horizontal) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Columna Izquierda (7): Tabla Ranking con Acordeón Drill-Down */}
            <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden flex flex-col justify-between">
              <div>
                <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between gap-2">
                  <div>
                    <h2 className="text-xs sm:text-sm font-bold uppercase tracking-wide text-[#0F172A]">
                      DEUDA PENDIENTE POR FACTORING (CLIENTES)
                    </h2>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Clic en una fila para desplegar el detalle de facturas
                    </p>
                  </div>
                  <span className="text-xs font-mono font-semibold text-slate-500">
                    {deudaClientesData.totalDocs} docs
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        <th className="py-2.5 px-3 w-10 text-center">#</th>
                        <th className="py-2.5 px-3">
                          {alcanceCartera === "DIRECTA"
                            ? "CLIENTE DEUDOR"
                            : "EMPRESA FACTORING"}
                        </th>
                        <th className="py-2.5 px-3 text-right">
                          $ TOTAL DEUDA CLIENTE
                        </th>
                        <th className="py-2.5 px-3 text-right">
                          % DEUDA CLIENTE
                        </th>
                        <th className="py-2.5 px-3 text-center">
                          CANTIDAD DOCTOS
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      {deudaClientesData.ranking.length === 0 ? (
                        <tr>
                          <td
                            colSpan={5}
                            className="py-10 text-center text-slate-400 text-sm"
                          >
                            No existen facturas pendientes para los filtros y
                            alcance seleccionados.
                          </td>
                        </tr>
                      ) : (
                        deudaClientesData.ranking.map((ent, idx) => {
                          const isExpanded = Boolean(
                            expandedEntidades[ent.entityKey]
                          );
                          return (
                            <React.Fragment key={ent.entityKey}>
                              <tr
                                onClick={() =>
                                  setExpandedEntidades((prev) => ({
                                    ...prev,
                                    [ent.entityKey]: !prev[ent.entityKey],
                                  }))
                                }
                                className={cn(
                                  "hover:bg-slate-50 transition-colors cursor-pointer",
                                  isExpanded && "bg-orange-50/40"
                                )}
                              >
                                <td className="py-2.5 px-3 text-center font-mono text-slate-500 font-semibold">
                                  {idx + 1}.
                                </td>
                                <td className="py-2.5 px-3 font-bold text-[#0F172A]">
                                  <div className="flex items-center gap-1.5">
                                    {isExpanded ? (
                                      <ChevronDown className="h-3.5 w-3.5 text-[#E05A10] shrink-0" />
                                    ) : (
                                      <ChevronRight className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                                    )}
                                    <span>{ent.entityName}</span>
                                  </div>
                                </td>
                                <td className="py-2.5 px-3 font-mono font-bold text-right text-[#0F172A] whitespace-nowrap">
                                  {formatCLP(ent.totalDeuda)}
                                </td>
                                <td className="py-2.5 px-3 font-mono text-right text-slate-600 whitespace-nowrap">
                                  {ent.pctDeuda.toFixed(2).replace(".", ",")} %
                                </td>
                                <td className="py-2.5 px-3 text-center font-semibold text-slate-700">
                                  {ent.docsCount}
                                </td>
                              </tr>
                              {isExpanded && (
                                <tr className="bg-slate-50/90">
                                  <td colSpan={5} className="px-4 py-3">
                                    <div className="rounded-lg border border-slate-200 bg-white overflow-x-auto">
                                      <table className="w-full text-left border-collapse text-[11px]">
                                        <thead>
                                          <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-500 uppercase font-bold">
                                            <th className="py-1.5 px-2.5">
                                              Folio
                                            </th>
                                            <th className="py-1.5 px-2.5">
                                              Cliente Deudor
                                            </th>
                                            <th className="py-1.5 px-2.5">
                                              ON
                                            </th>
                                            <th className="py-1.5 px-2.5">
                                              Emisión
                                            </th>
                                            <th className="py-1.5 px-2.5">
                                              Vencimiento
                                            </th>
                                            <th className="py-1.5 px-2.5 text-right">
                                              Deuda Pendiente
                                            </th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                          {ent.docs.map((d) => (
                                            <tr
                                              key={d.id}
                                              className="hover:bg-slate-50"
                                            >
                                              <td className="py-1.5 px-2.5 font-mono font-semibold text-[#0F172A]">
                                                #{d.folio}
                                              </td>
                                              <td className="py-1.5 px-2.5 text-slate-700">
                                                {d.razonSocial}
                                              </td>
                                              <td className="py-1.5 px-2.5 font-mono text-slate-500">
                                                {d.onProyecto}
                                              </td>
                                              <td className="py-1.5 px-2.5 font-mono text-slate-500 whitespace-nowrap">
                                                {d.fechaEmision}
                                              </td>
                                              <td className="py-1.5 px-2.5 font-mono text-slate-500 whitespace-nowrap">
                                                {d.fechaVencimiento}
                                              </td>
                                              <td className="py-1.5 px-2.5 font-mono font-bold text-right text-[#E05A10] whitespace-nowrap">
                                                {formatCLP(d.deudaPendiente)}
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })
                      )}
                    </tbody>
                    {deudaClientesData.ranking.length > 0 && (
                      <tfoot>
                        <tr className="bg-[#0F172A] text-white text-xs font-bold">
                          <td colSpan={2} className="py-3 px-4 uppercase">
                            TOTAL GENERAL
                          </td>
                          <td className="py-3 px-3 font-mono text-right whitespace-nowrap">
                            {formatCLP(deudaClientesData.totalDeuda)}
                          </td>
                          <td className="py-3 px-3 font-mono text-right whitespace-nowrap">
                            100,00 %
                          </td>
                          <td className="py-3 px-3 text-center font-mono">
                            {deudaClientesData.totalDocs}
                          </td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>
            </div>

            {/* Columna Derecha (5): Gráfico Horizontal de Participación por Entidad */}
            <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col justify-between">
              <div>
                <h2 className="text-xs sm:text-sm font-bold uppercase tracking-wide text-[#0F172A]">
                  PARTICIPACIÓN POR ENTIDAD (MILLONES)
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Distribución de deuda pendiente ordenada de mayor a menor
                </p>
              </div>

              {deudaClientesData.ranking.length === 0 ? (
                <div className="h-72 flex items-center justify-center text-sm text-slate-400 border border-dashed border-slate-200 rounded-lg mt-4">
                  Sin datos para graficar.
                </div>
              ) : (
                <div
                  className="w-full mt-4"
                  style={{
                    height: Math.max(
                      280,
                      deudaClientesData.ranking.length * 42 + 30
                    ),
                  }}
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      layout="vertical"
                      data={deudaClientesData.ranking}
                      margin={{ top: 8, right: 64, left: 6, bottom: 8 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        horizontal={false}
                        stroke="#E2E8F0"
                      />
                      <XAxis
                        type="number"
                        tickFormatter={formatAxisMillions}
                        tick={{ fontSize: 10, fill: "#64748B" }}
                        axisLine={{ stroke: "#E2E8F0" }}
                        tickLine={false}
                      />
                      <YAxis
                        type="category"
                        dataKey="shortName"
                        width={125}
                        tick={{
                          fontSize: 10.5,
                          fill: "#0F172A",
                          fontWeight: 600,
                        }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <RechartsTooltip
                        content={<HorizontalBarTooltip />}
                        cursor={{ fill: "#F1F5F9", opacity: 0.6 }}
                      />
                      <Bar
                        dataKey="totalDeuda"
                        fill="#2563EB"
                        radius={[0, 6, 6, 0]}
                        barSize={22}
                      >
                        <LabelList
                          dataKey="totalDeuda"
                          position="right"
                          content={renderHorizontalMillionsLabel}
                        />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
