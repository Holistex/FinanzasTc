"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  Clock,
  FileCheck2,
  FileText,
  FileX2,
  Loader2,
  RefreshCw,
  Search,
} from "lucide-react";
import { FacturaVenta, MantenedorON } from "@/types/database.types";
import {
  GLOBAL_PAGE_SIZE,
  TablePagination,
  paginateArray,
} from "@/components/ui/TablePagination";
import {
  formatCLP,
  formatDateCL,
  formatRutDisplay,
  normalizeRut,
  toDateOnlyString,
} from "@/lib/utils";

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

function formatMesAnioEs(ym: string): string {
  if (ym === "TODOS") return "Todos los Meses";
  const [y, m] = ym.split("-");
  const idx = Number(m) - 1;
  if (!y || idx < 0 || idx > 11) return ym;
  return `${MESES_LARGOS_ES[idx]} ${y}`;
}

function getDteBadgeLabel(tipoDoc: number): string {
  switch (Number(tipoDoc)) {
    case 33:
      return "FAC 33";
    case 34:
      return "FAC EX 34";
    case 56:
      return "ND 56";
    default:
      return `DTE ${tipoDoc}`;
  }
}

interface EmitidaMesRow {
  factura: FacturaVenta;
  ym: string;
  montoBruto: number;
  montoNcAsociada: number;
  ncFolios: number[];
  montoNetoEmitido: number;
  pagadoReal: number;
  saldoPendiente: number;
  esPagada: boolean;
}

interface EmitidasMesPanelProps {
  facturas: FacturaVenta[] | null;
  isLoading: boolean;
  catalogoOn: MantenedorON[];
  onCountChange?: (count: number) => void;
}

export function EmitidasMesPanel({
  facturas,
  isLoading,
  catalogoOn,
  onCountChange,
}: EmitidasMesPanelProps) {
  const [periodoFilter, setPeriodoFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [onFilter, setOnFilter] = useState("TODAS");
  const [estadoCobroFilter, setEstadoCobroFilter] = useState<
    "TODOS" | "PAGADAS" | "PENDIENTES"
  >("TODOS");
  const [currentPage, setCurrentPage] = useState(1);

  // Construir universo elegible excluyendo DTE 61 y facturas anuladas/neteadas por NC
  const universoEmitidas = useMemo<EmitidaMesRow[]>(() => {
    if (!facturas) return [];

    const ncByTargetInvoiceKey = new Map<
      string,
      { totalMontoNC: number; ncFolios: number[] }
    >();

    for (const doc of facturas) {
      if (Number(doc.tipo_doc) === 61 && doc.folio_docto_ref) {
        const key = `${normalizeRut(doc.rut_cliente)}__${Number(doc.folio_docto_ref)}`;
        const curr = ncByTargetInvoiceKey.get(key) || {
          totalMontoNC: 0,
          ncFolios: [],
        };
        curr.totalMontoNC += Number(doc.monto_total || 0);
        curr.ncFolios.push(Number(doc.folio));
        ncByTargetInvoiceKey.set(key, curr);
      }
    }

    const rows: EmitidaMesRow[] = [];

    for (const f of facturas) {
      if (Number(f.tipo_doc) === 61) continue;
      if (String((f as unknown as Record<string, unknown>).estado || "").toUpperCase() === "NETEO_NC") {
        continue;
      }

      const fechaEmisionStr = toDateOnlyString(
        f.fecha_docto ||
          String((f as unknown as Record<string, unknown>).fecha_emision || "")
      );
      const ym = fechaEmisionStr && fechaEmisionStr.length >= 7 ? fechaEmisionStr.slice(0, 7) : "";
      if (!ym) continue;

      const invoiceKey = `${normalizeRut(f.rut_cliente)}__${Number(f.folio)}`;
      const ncInfo = ncByTargetInvoiceKey.get(invoiceKey);
      const montoBruto = Number(f.monto_total || 0);
      const montoNcAsociada = ncInfo?.totalMontoNC || 0;
      const montoNetoEmitido = Math.max(0, montoBruto - montoNcAsociada);

      const pagos = f.pagos_facturas || [];
      const totalPagosReales = pagos.reduce(
        (acc, p) => acc + Number(p.monto_pago || 0),
        0
      );

      const deudaVigente = Math.max(
        0,
        Number(f.deuda_cliente ?? f.monto_neto_saldo ?? montoNetoEmitido)
      );

      // Excluir estrictamente facturas anuladas/neteadas a $0 por NC (sin pagos reales en tesorería)
      if (montoNetoEmitido <= 0) continue;
      if (deudaVigente <= 0 && totalPagosReales <= 0) continue;

      const esPagada = deudaVigente <= 0 && totalPagosReales > 0;
      const saldoPendiente = esPagada ? 0 : deudaVigente;
      const pagadoReal = esPagada
        ? montoNetoEmitido
        : Math.min(montoNetoEmitido, totalPagosReales);

      rows.push({
        factura: f,
        ym,
        montoBruto,
        montoNcAsociada,
        ncFolios: ncInfo?.ncFolios || [],
        montoNetoEmitido,
        pagadoReal,
        saldoPendiente,
        esPagada,
      });
    }

    return rows.sort((a, b) => {
      const fa = toDateOnlyString(a.factura.fecha_docto) || "";
      const fb = toDateOnlyString(b.factura.fecha_docto) || "";
      if (fa !== fb) return fb.localeCompare(fa);
      return Number(b.factura.folio) - Number(a.factura.folio);
    });
  }, [facturas]);

  const mesesDisponibles = useMemo(() => {
    const set = new Set<string>();
    for (const r of universoEmitidas) {
      if (r.ym) set.add(r.ym);
    }
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [universoEmitidas]);

  // Seleccionar por defecto el mes más reciente con emisión
  useEffect(() => {
    if (!periodoFilter && mesesDisponibles.length > 0) {
      setPeriodoFilter(mesesDisponibles[0]);
    }
  }, [mesesDisponibles, periodoFilter]);

  const onsDisponibles = useMemo(() => {
    const set = new Set<string>();
    for (const item of catalogoOn) {
      if (item.codigo_on?.trim()) set.add(item.codigo_on.trim());
    }
    for (const r of universoEmitidas) {
      if (r.factura.on_proyecto?.trim()) set.add(r.factura.on_proyecto.trim());
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [catalogoOn, universoEmitidas]);

  const filteredRows = useMemo(() => {
    const qRaw = search.trim().toLowerCase();
    const qRut = normalizeRut(qRaw);

    return universoEmitidas.filter((row) => {
      if (periodoFilter && periodoFilter !== "TODOS" && row.ym !== periodoFilter) {
        return false;
      }

      if (estadoCobroFilter === "PAGADAS" && !row.esPagada) return false;
      if (estadoCobroFilter === "PENDIENTES" && row.esPagada) return false;

      if (onFilter === "SIN_ON") {
        if (row.factura.on_proyecto && row.factura.on_proyecto.trim() !== "") {
          return false;
        }
      } else if (onFilter !== "TODAS") {
        if ((row.factura.on_proyecto || "").trim() !== onFilter) return false;
      }

      if (qRaw) {
        const matchFolio = String(row.factura.folio).includes(qRaw);
        const matchRazon = (row.factura.razon_social || "")
          .toLowerCase()
          .includes(qRaw);
        const matchRut =
          (row.factura.rut_cliente || "").toLowerCase().includes(qRaw) ||
          (qRut.length >= 2 &&
            normalizeRut(row.factura.rut_cliente).includes(qRut));
        if (!matchFolio && !matchRazon && !matchRut) return false;
      }

      return true;
    });
  }, [universoEmitidas, periodoFilter, estadoCobroFilter, onFilter, search]);

  useEffect(() => {
    setCurrentPage(1);
  }, [periodoFilter, estadoCobroFilter, onFilter, search]);

  useEffect(() => {
    if (onCountChange) {
      onCountChange(filteredRows.length);
    }
  }, [filteredRows.length, onCountChange]);

  const resumenTotales = useMemo(() => {
    return filteredRows.reduce(
      (acc, r) => ({
        emitido: acc.emitido + r.montoNetoEmitido,
        pagado: acc.pagado + r.pagadoReal,
        pendiente: acc.pendiente + r.saldoPendiente,
      }),
      { emitido: 0, pagado: 0, pendiente: 0 }
    );
  }, [filteredRows]);

  const paginatedRows = useMemo(
    () => paginateArray(filteredRows, currentPage, GLOBAL_PAGE_SIZE),
    [filteredRows, currentPage]
  );

  const periodoTitulo = periodoFilter
    ? formatMesAnioEs(periodoFilter).toUpperCase()
    : "SIN PERÍODO";

  return (
    <div className="space-y-3">
      {/* Barra de Filtros Dedicada */}
      <div className="bg-white border border-slate-200 rounded-md px-3 py-2.5 shadow-sm flex flex-wrap items-center gap-2">
        {/* Selector de Mes y Año */}
        <div className="flex items-center gap-1.5 border border-slate-200 rounded-md px-2.5 py-1.5 bg-slate-50">
          <CalendarDays className="h-4 w-4 text-[#E05A10] shrink-0" />
          <span className="text-[11px] font-bold text-slate-600 uppercase">
            Período:
          </span>
          <select
            value={periodoFilter || "TODOS"}
            onChange={(e) => setPeriodoFilter(e.target.value)}
            className="text-xs font-bold text-slate-900 bg-transparent focus:outline-none cursor-pointer"
          >
            <option value="TODOS">Todos los Meses</option>
            {mesesDisponibles.map((ym) => (
              <option key={ym} value={ym}>
                {formatMesAnioEs(ym)}
              </option>
            ))}
          </select>
        </div>

        {/* Buscador */}
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por RUT, Razón Social o Folio..."
            className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-[#E05A10] focus:border-transparent"
          />
        </div>

        {/* Selector ON */}
        <select
          value={onFilter}
          onChange={(e) => setOnFilter(e.target.value)}
          className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-md bg-white text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-[#E05A10]"
        >
          <option value="TODAS">ON: Todas</option>
          <option value="SIN_ON">Sin ON asignada</option>
          {onsDisponibles.map((cod) => (
            <option key={cod} value={cod}>
              ON: {cod}
            </option>
          ))}
        </select>

        {/* Selector Estado de Cobro */}
        <select
          value={estadoCobroFilter}
          onChange={(e) =>
            setEstadoCobroFilter(
              e.target.value as "TODOS" | "PAGADAS" | "PENDIENTES"
            )
          }
          className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-md bg-white text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-[#E05A10]"
        >
          <option value="TODOS">Todos (Pagadas y Pendientes)</option>
          <option value="PAGADAS">Solo Pagadas</option>
          <option value="PENDIENTES">Solo Pendientes</option>
        </select>

        {/* Limpiar */}
        <button
          type="button"
          onClick={() => {
            setPeriodoFilter(mesesDisponibles[0] || "TODOS");
            setSearch("");
            setOnFilter("TODAS");
            setEstadoCobroFilter("TODOS");
          }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors ml-auto"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          <span>Limpiar</span>
        </button>
      </div>

      {/* Banner de Resumen de la Vista Filtrada */}
      <div className="bg-[#0F172A] text-white rounded-md px-4 py-2.5 shadow-sm flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 font-bold tracking-wide uppercase">
          <CalendarDays className="h-4 w-4 text-[#E05A10]" />
          <span>SUBTOTAL VISTA FILTRADA — {periodoTitulo}</span>
        </div>

        <div className="flex flex-wrap items-center gap-4 font-mono">
          <div>
            <span className="text-slate-400 font-sans mr-1.5">DTEs Emitidos:</span>
            <span className="font-bold text-white">
              {filteredRows.length} facturas
            </span>
          </div>
          <div className="h-3.5 w-px bg-slate-700 hidden sm:block" />
          <div>
            <span className="text-slate-400 font-sans mr-1.5">TOTAL EMITIDO MES:</span>
            <span className="font-black text-white">
              {formatCLP(resumenTotales.emitido)}
            </span>
          </div>
          <div className="h-3.5 w-px bg-slate-700 hidden sm:block" />
          <div>
            <span className="text-slate-400 font-sans mr-1.5">PAGADO:</span>
            <span className="font-bold text-emerald-400">
              {formatCLP(resumenTotales.pagado)}
            </span>
          </div>
          <div className="h-3.5 w-px bg-slate-700 hidden sm:block" />
          <div>
            <span className="text-slate-400 font-sans mr-1.5">PENDIENTE:</span>
            <span className="font-bold text-amber-400">
              {formatCLP(resumenTotales.pendiente)}
            </span>
          </div>
        </div>
      </div>

      {/* Tabla de Emitidas del Mes */}
      <div className="bg-white border border-slate-200 rounded-md shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-[960px] w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                <th className="py-2.5 px-3">FOLIO / DOCUMENTO</th>
                <th className="py-2.5 px-3">RUT CLIENTE</th>
                <th className="py-2.5 px-3">RAZÓN SOCIAL</th>
                <th className="py-2.5 px-3">EMISIÓN / VENCIMIENTO</th>
                <th className="py-2.5 px-3">ON</th>
                <th className="py-2.5 px-3 text-center">PDF</th>
                <th className="py-2.5 px-3 text-center">ESTADO COBRO</th>
                <th className="py-2.5 px-3 text-right">MONTO EMITIDO</th>
                <th className="py-2.5 px-3 text-right">SALDO PENDIENTE</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {isLoading && facturas === null ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-500">
                    <div className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin text-[#E05A10]" />
                      <span>Cargando facturas emitidas del período...</span>
                    </div>
                  </td>
                </tr>
              ) : paginatedRows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    <FileText className="h-8 w-8 mx-auto text-slate-300 mb-2" />
                    <p className="font-medium text-slate-600">
                      No hay facturas emitidas (excluyendo DTE 61 y neteos por NC) para los filtros seleccionados.
                    </p>
                  </td>
                </tr>
              ) : (
                paginatedRows.map((row) => {
                  const f = row.factura;
                  const hasPdf = Boolean(f.url_pdf && f.url_pdf.trim() !== "");
                  return (
                    <tr
                      key={f.id}
                      className="hover:bg-slate-50/80 transition-colors"
                    >
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-bold text-slate-900">
                            #{f.folio}
                          </span>
                          <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                            {getDteBadgeLabel(f.tipo_doc)}
                          </span>
                        </div>
                      </td>

                      <td className="py-2.5 px-3 font-mono text-xs text-slate-600 whitespace-nowrap">
                        {formatRutDisplay(f.rut_cliente)}
                      </td>

                      <td className="py-2.5 px-3 font-bold text-slate-900 max-w-[260px] truncate" title={f.razon_social}>
                        {f.razon_social}
                      </td>

                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <div className="font-mono text-slate-800">
                          {formatDateCL(f.fecha_docto)}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          Venc: {f.fecha_vencimiento ? formatDateCL(f.fecha_vencimiento) : "—"}
                        </div>
                      </td>

                      <td className="py-2.5 px-3 whitespace-nowrap">
                        {f.on_proyecto ? (
                          <span className="inline-flex items-center rounded px-2 py-0.5 text-[10px] font-bold bg-slate-100 text-slate-800 border border-slate-200">
                            {f.on_proyecto}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        {hasPdf ? (
                          <a
                            href={f.url_pdf!}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Ver PDF de respaldo"
                            className="inline-flex items-center justify-center text-emerald-600 hover:text-emerald-700"
                          >
                            <FileCheck2 className="h-4 w-4" />
                          </a>
                        ) : (
                          <span
                            title="Sin PDF cargado"
                            className="inline-flex items-center justify-center text-rose-400"
                          >
                            <FileX2 className="h-4 w-4" />
                          </span>
                        )}
                      </td>

                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        {row.esPagada ? (
                          <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="h-3 w-3" />
                            Pagada
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                            <Clock className="h-3 w-3" />
                            Pendiente
                          </span>
                        )}
                      </td>

                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        <div className="font-mono font-bold text-slate-900">
                          {formatCLP(row.montoNetoEmitido)}
                        </div>
                        {row.montoNcAsociada > 0 && (
                          <div className="text-[10px] font-mono text-rose-600">
                            Bruto {formatCLP(row.montoBruto)} · NC #{row.ncFolios.join(", #")} (-{formatCLP(row.montoNcAsociada)})
                          </div>
                        )}
                      </td>

                      <td className="py-2.5 px-3 text-right font-mono whitespace-nowrap">
                        <span
                          className={
                            row.saldoPendiente === 0
                              ? "text-emerald-600 font-semibold"
                              : "text-amber-700 font-bold"
                          }
                        >
                          {formatCLP(row.saldoPendiente)}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <TablePagination
          currentPage={currentPage}
          totalItems={filteredRows.length}
          pageSize={GLOBAL_PAGE_SIZE}
          onPageChange={setCurrentPage}
        />
      </div>
    </div>
  );
}
