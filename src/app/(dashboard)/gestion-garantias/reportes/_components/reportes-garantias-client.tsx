"use client";

import React, { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  BarChart3,
  Building2,
  ChevronDown,
  ChevronRight,
  FileSpreadsheet,
  FileText,
  Filter,
  Landmark,
  Layers,
  Shield,
} from "lucide-react";
import { GarantiaItemWithRelations } from "@/types/database.types";
import { LOGO_TENSACON_BASE64 } from "@/lib/pdf/logo-tensacon";
import { cn, formatCLP, formatDateCL } from "@/lib/utils";

type TabReporte = "POLIZAS" | "BOLETAS";
type UniversoFiltro = "ACTIVAS" | "TODAS" | "VENCIDAS";

interface MotivoGroup {
  motivoKey: string;
  motivoLabel: string;
  docs: GarantiaItemWithRelations[];
  totalUf: number;
  totalClp: number;
}

interface EntidadGroup {
  entidad: string;
  motivos: MotivoGroup[];
  cantDocs: number;
  totalUf: number;
  totalClp: number;
}

function formatUF(value: number): string {
  return `UF ${value.toLocaleString("es-CL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function normalizarMotivo(raw?: string | null): { key: string; label: string } {
  const clean = String(raw || "")
    .trim()
    .replace(/\s+/g, " ");
  if (!clean) return { key: "SIN MOTIVO", label: "Sin Motivo Especificado" };
  const upper = clean.toUpperCase();
  const title = clean
    .toLowerCase()
    .replace(/(^|\s)\S/g, (t) => t.toUpperCase());
  return { key: upper, label: title };
}

function getMontoDocPorMoneda(doc: GarantiaItemWithRelations): {
  uf: number;
  clp: number;
} {
  const moneda = String(doc.moneda || "UF").toUpperCase();
  if (moneda === "CLP") {
    return { uf: 0, clp: Number(doc.monto || 0) };
  }
  const valUf =
    doc.monto_uf !== undefined && doc.monto_uf !== null && Number(doc.monto_uf) > 0
      ? Number(doc.monto_uf)
      : Number(doc.monto || 0);
  return { uf: valUf, clp: 0 };
}

function filtrarPorUniverso(
  items: GarantiaItemWithRelations[],
  universo: UniversoFiltro,
  onFiltro: string,
  entidadFiltro: string
): GarantiaItemWithRelations[] {
  return items.filter((item) => {
    if (universo === "ACTIVAS") {
      if (item.estado !== "VIGENTE" && item.estado !== "PROXIMA_A_VENCER") {
        return false;
      }
    } else if (universo === "VENCIDAS") {
      if (item.estado !== "VENCIDA") return false;
    }

    if (onFiltro !== "TODAS") {
      if (String(item.on_proyecto || "") !== onFiltro) return false;
    }

    if (entidadFiltro !== "TODAS") {
      const entidad = String(item.compania_razon_social || "No asignada").trim();
      if (entidad !== entidadFiltro) return false;
    }

    return true;
  });
}

function agruparJerarquicamente(
  items: GarantiaItemWithRelations[]
): EntidadGroup[] {
  const entidadMap = new Map<
    string,
    {
      motivoMap: Map<string, MotivoGroup>;
      cantDocs: number;
      totalUf: number;
      totalClp: number;
    }
  >();

  for (const doc of items) {
    const entidad = String(doc.compania_razon_social || "No asignada").trim();
    const { key: mKey, label: mLabel } = normalizarMotivo(doc.motivo);
    const { uf, clp } = getMontoDocPorMoneda(doc);

    if (!entidadMap.has(entidad)) {
      entidadMap.set(entidad, {
        motivoMap: new Map(),
        cantDocs: 0,
        totalUf: 0,
        totalClp: 0,
      });
    }
    const entEntry = entidadMap.get(entidad)!;
    entEntry.cantDocs += 1;
    entEntry.totalUf += uf;
    entEntry.totalClp += clp;

    if (!entEntry.motivoMap.has(mKey)) {
      entEntry.motivoMap.set(mKey, {
        motivoKey: mKey,
        motivoLabel: mLabel,
        docs: [],
        totalUf: 0,
        totalClp: 0,
      });
    }
    const motEntry = entEntry.motivoMap.get(mKey)!;
    motEntry.docs.push(doc);
    motEntry.totalUf += uf;
    motEntry.totalClp += clp;
  }

  return Array.from(entidadMap.entries())
    .map(([entidad, data]) => ({
      entidad,
      cantDocs: data.cantDocs,
      totalUf: data.totalUf,
      totalClp: data.totalClp,
      motivos: Array.from(data.motivoMap.values()).sort(
        (a, b) => b.totalUf - a.totalUf || b.totalClp - a.totalClp
      ),
    }))
    .sort((a, b) => b.totalUf - a.totalUf || b.totalClp - a.totalClp);
}

export function ReportesGarantiasClient({
  polizas,
  boletas,
}: {
  polizas: GarantiaItemWithRelations[];
  boletas: GarantiaItemWithRelations[];
}) {
  const [tab, setTab] = useState<TabReporte>("POLIZAS");
  const [universo, setUniverso] = useState<UniversoFiltro>("ACTIVAS");
  const [onFiltro, setOnFiltro] = useState<string>("TODAS");
  const [entidadFiltro, setEntidadFiltro] = useState<string>("TODAS");
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  const baseTabItems = tab === "POLIZAS" ? polizas : boletas;

  const onOptions = useMemo(() => {
    const set = new Set<string>();
    for (const item of baseTabItems) {
      if (item.on_proyecto && String(item.on_proyecto).trim()) {
        set.add(String(item.on_proyecto).trim());
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [baseTabItems]);

  const entidadOptions = useMemo(() => {
    const set = new Set<string>();
    for (const item of baseTabItems) {
      const ent = String(item.compania_razon_social || "No asignada").trim();
      if (ent) set.add(ent);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [baseTabItems]);

  const polizasFiltradas = useMemo(
    () =>
      filtrarPorUniverso(
        polizas,
        universo,
        onFiltro,
        tab === "POLIZAS" ? entidadFiltro : "TODAS"
      ),
    [polizas, universo, onFiltro, entidadFiltro, tab]
  );

  const boletasFiltradas = useMemo(
    () =>
      filtrarPorUniverso(
        boletas,
        universo,
        onFiltro,
        tab === "BOLETAS" ? entidadFiltro : "TODAS"
      ),
    [boletas, universo, onFiltro, entidadFiltro, tab]
  );

  const gruposPolizas = useMemo(
    () => agruparJerarquicamente(polizasFiltradas),
    [polizasFiltradas]
  );

  const gruposBoletas = useMemo(
    () => agruparJerarquicamente(boletasFiltradas),
    [boletasFiltradas]
  );

  const resumenPolizas = useMemo(() => {
    const totalDocs = polizasFiltradas.length;
    const totalUf = gruposPolizas.reduce((acc, g) => acc + g.totalUf, 0);
    const topCompania = gruposPolizas[0] || null;
    const topCompaniaPct =
      topCompania && totalUf > 0 ? (topCompania.totalUf / totalUf) * 100 : 0;

    const motivoTotals = new Map<string, { label: string; uf: number }>();
    for (const p of polizasFiltradas) {
      const { key, label } = normalizarMotivo(p.motivo);
      const { uf } = getMontoDocPorMoneda(p);
      const curr = motivoTotals.get(key) || { label, uf: 0 };
      curr.uf += uf;
      motivoTotals.set(key, curr);
    }
    const topMotivo =
      Array.from(motivoTotals.values()).sort((a, b) => b.uf - a.uf)[0] || null;

    return {
      totalDocs,
      totalUf,
      topCompania,
      topCompaniaPct,
      topMotivo,
    };
  }, [polizasFiltradas, gruposPolizas]);

  const resumenBoletas = useMemo(() => {
    const totalDocs = boletasFiltradas.length;
    const totalUf = gruposBoletas.reduce((acc, g) => acc + g.totalUf, 0);
    const totalClp = gruposBoletas.reduce((acc, g) => acc + g.totalClp, 0);
    const topBanco = gruposBoletas[0] || null;
    return { totalDocs, totalUf, totalClp, topBanco };
  }, [boletasFiltradas, gruposBoletas]);

  const toggleExpand = (groupKey: string) => {
    setExpandedGroups((prev) => ({ ...prev, [groupKey]: !prev[groupKey] }));
  };

  const handleTabChange = (nextTab: TabReporte) => {
    setTab(nextTab);
    setEntidadFiltro("TODAS");
    setExpandedGroups({});
  };

  const universoLabel =
    universo === "ACTIVAS"
      ? "Solo Vigentes y Por Vencer (Activas)"
      : universo === "VENCIDAS"
        ? "Solo Vencidas"
        : "Todas (Incluye Vencidas)";

  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new();

    // Hoja 1: Pólizas
    const polRows: Array<Record<string, string | number>> = [];
    for (const g of gruposPolizas) {
      for (const m of g.motivos) {
        const pct =
          resumenPolizas.totalUf > 0
            ? (m.totalUf / resumenPolizas.totalUf) * 100
            : 0;
        polRows.push({
          "COMPAÑÍA DE SEGURO / MOTIVO": `   ${m.motivoLabel}`,
          "CANT. DOCS": m.docs.length,
          "SUBTOTAL MONTO (UF)": Number(m.totalUf.toFixed(2)),
          "% PARTICIPACIÓN": `${pct.toFixed(1)}%`,
          "FOLIOS / ON": m.docs
            .map((d) => `#${d.nro_folio}${d.on_proyecto ? ` (ON ${d.on_proyecto})` : ""}`)
            .join(", "),
        });
      }
      const subPct =
        resumenPolizas.totalUf > 0
          ? (g.totalUf / resumenPolizas.totalUf) * 100
          : 0;
      polRows.push({
        "COMPAÑÍA DE SEGURO / MOTIVO": `Subtotal ${g.entidad}`,
        "CANT. DOCS": g.cantDocs,
        "SUBTOTAL MONTO (UF)": Number(g.totalUf.toFixed(2)),
        "% PARTICIPACIÓN": `${subPct.toFixed(1)}%`,
        "FOLIOS / ON": "",
      });
    }
    polRows.push({
      "COMPAÑÍA DE SEGURO / MOTIVO": "TOTAL GENERAL PÓLIZAS",
      "CANT. DOCS": resumenPolizas.totalDocs,
      "SUBTOTAL MONTO (UF)": Number(resumenPolizas.totalUf.toFixed(2)),
      "% PARTICIPACIÓN": "100.0%",
      "FOLIOS / ON": "",
    });
    const wsPol = XLSX.utils.json_to_sheet(polRows);
    XLSX.utils.book_append_sheet(wb, wsPol, "Consolidado Pólizas");

    // Hoja 2: Boletas
    const bolRows: Array<Record<string, string | number>> = [];
    for (const g of gruposBoletas) {
      for (const m of g.motivos) {
        bolRows.push({
          "BANCO EMISOR / MOTIVO": `   ${m.motivoLabel}`,
          "CANT. DOCS": m.docs.length,
          "SUBTOTAL UF": Number(m.totalUf.toFixed(2)),
          "SUBTOTAL CLP ($)": Math.round(m.totalClp),
          "FOLIOS / ON": m.docs
            .map((d) => `#${d.nro_folio}${d.on_proyecto ? ` (ON ${d.on_proyecto})` : ""}`)
            .join(", "),
        });
      }
      bolRows.push({
        "BANCO EMISOR / MOTIVO": `Subtotal ${g.entidad}`,
        "CANT. DOCS": g.cantDocs,
        "SUBTOTAL UF": Number(g.totalUf.toFixed(2)),
        "SUBTOTAL CLP ($)": Math.round(g.totalClp),
        "FOLIOS / ON": "",
      });
    }
    bolRows.push({
      "BANCO EMISOR / MOTIVO": "TOTAL GENERAL BOLETAS",
      "CANT. DOCS": resumenBoletas.totalDocs,
      "SUBTOTAL UF": Number(resumenBoletas.totalUf.toFixed(2)),
      "SUBTOTAL CLP ($)": Math.round(resumenBoletas.totalClp),
      "FOLIOS / ON": "",
    });
    const wsBol = XLSX.utils.json_to_sheet(bolRows);
    XLSX.utils.book_append_sheet(wb, wsBol, "Consolidado Boletas");

    const fecha = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `Reporte_Garantias_Tensacon_${fecha}.xlsx`);
  };

  const handleExportPDF = () => {
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const fechaEmision = new Date().toLocaleDateString("es-CL");

    try {
      doc.addImage(LOGO_TENSACON_BASE64, "PNG", 14, 10, 42, 10);
    } catch {
      // Fallback sin logo
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(15, 23, 42);
    doc.text("TENSACON S.A. — Gerencia de Administración y Finanzas", 60, 15);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(71, 85, 105);
    doc.text(
      `Reporte Consolidado de ${tab === "POLIZAS" ? "Pólizas de Garantía" : "Boletas de Garantía"} | Emisión: ${fechaEmision}`,
      60,
      20
    );

    doc.setFontSize(8.5);
    doc.text(
      `Filtros: ${universoLabel} | ON: ${onFiltro === "TODAS" ? "Todas" : onFiltro} | Entidad: ${entidadFiltro === "TODAS" ? "Todas" : entidadFiltro}`,
      14,
      28
    );

    if (tab === "POLIZAS") {
      const body: Array<Array<string>> = [];
      for (const g of gruposPolizas) {
        body.push([
          { content: g.entidad, styles: { fontStyle: "bold", fillColor: [248, 250, 252] } } as unknown as string,
          "",
          "",
          "",
        ]);
        for (const m of g.motivos) {
          const pct =
            resumenPolizas.totalUf > 0
              ? (m.totalUf / resumenPolizas.totalUf) * 100
              : 0;
          body.push([
            `   • ${m.motivoLabel}`,
            String(m.docs.length),
            formatUF(m.totalUf),
            `${pct.toFixed(1)}%`,
          ]);
        }
        const subPct =
          resumenPolizas.totalUf > 0
            ? (g.totalUf / resumenPolizas.totalUf) * 100
            : 0;
        body.push([
          { content: `Subtotal ${g.entidad}`, styles: { fontStyle: "bold", fillColor: [241, 245, 249] } } as unknown as string,
          { content: String(g.cantDocs), styles: { fontStyle: "bold", fillColor: [241, 245, 249] } } as unknown as string,
          { content: formatUF(g.totalUf), styles: { fontStyle: "bold", fillColor: [241, 245, 249] } } as unknown as string,
          { content: `${subPct.toFixed(1)}%`, styles: { fontStyle: "bold", fillColor: [241, 245, 249] } } as unknown as string,
        ]);
      }

      body.push([
        { content: "TOTAL GENERAL PÓLIZAS", styles: { fontStyle: "bold", fillColor: [15, 23, 42], textColor: [255, 255, 255] } } as unknown as string,
        { content: String(resumenPolizas.totalDocs), styles: { fontStyle: "bold", fillColor: [15, 23, 42], textColor: [255, 255, 255] } } as unknown as string,
        { content: formatUF(resumenPolizas.totalUf), styles: { fontStyle: "bold", fillColor: [15, 23, 42], textColor: [255, 255, 255] } } as unknown as string,
        { content: "100,0%", styles: { fontStyle: "bold", fillColor: [15, 23, 42], textColor: [255, 255, 255] } } as unknown as string,
      ]);

      autoTable(doc, {
        startY: 33,
        head: [["COMPAÑÍA DE SEGURO / MOTIVO", "CANT. DOCS", "SUBTOTAL (UF)", "% PART."]],
        body,
        theme: "grid",
        headStyles: { fillColor: [15, 23, 42], textColor: 255, fontSize: 8.5 },
        styles: { fontSize: 8.5, cellPadding: 2.5 },
        columnStyles: {
          1: { halign: "center" },
          2: { halign: "right" },
          3: { halign: "right" },
        },
      });
    } else {
      const body: Array<Array<string>> = [];
      for (const g of gruposBoletas) {
        body.push([
          { content: g.entidad, styles: { fontStyle: "bold", fillColor: [248, 250, 252] } } as unknown as string,
          "",
          "",
          "",
        ]);
        for (const m of g.motivos) {
          body.push([
            `   • ${m.motivoLabel}`,
            String(m.docs.length),
            formatUF(m.totalUf),
            formatCLP(m.totalClp),
          ]);
        }
        body.push([
          { content: `Subtotal ${g.entidad}`, styles: { fontStyle: "bold", fillColor: [241, 245, 249] } } as unknown as string,
          { content: String(g.cantDocs), styles: { fontStyle: "bold", fillColor: [241, 245, 249] } } as unknown as string,
          { content: formatUF(g.totalUf), styles: { fontStyle: "bold", fillColor: [241, 245, 249] } } as unknown as string,
          { content: formatCLP(g.totalClp), styles: { fontStyle: "bold", fillColor: [241, 245, 249] } } as unknown as string,
        ]);
      }

      body.push([
        { content: "TOTAL GENERAL BOLETAS", styles: { fontStyle: "bold", fillColor: [15, 23, 42], textColor: [255, 255, 255] } } as unknown as string,
        { content: String(resumenBoletas.totalDocs), styles: { fontStyle: "bold", fillColor: [15, 23, 42], textColor: [255, 255, 255] } } as unknown as string,
        { content: formatUF(resumenBoletas.totalUf), styles: { fontStyle: "bold", fillColor: [15, 23, 42], textColor: [255, 255, 255] } } as unknown as string,
        { content: formatCLP(resumenBoletas.totalClp), styles: { fontStyle: "bold", fillColor: [15, 23, 42], textColor: [255, 255, 255] } } as unknown as string,
      ]);

      autoTable(doc, {
        startY: 33,
        head: [["BANCO EMISOR / MOTIVO", "CANT. DOCS", "SUBTOTAL UF", "SUBTOTAL CLP ($)"]],
        body,
        theme: "grid",
        headStyles: { fillColor: [15, 23, 42], textColor: 255, fontSize: 8.5 },
        styles: { fontSize: 8.5, cellPadding: 2.5 },
        columnStyles: {
          1: { halign: "center" },
          2: { halign: "right" },
          3: { halign: "right" },
        },
      });
    }

    const fecha = new Date().toISOString().slice(0, 10);
    doc.save(`Reporte_${tab}_${fecha}.pdf`);
  };

  return (
    <div className="space-y-5">
      {/* Cabecera Ejecutiva */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
        <div className="flex items-start gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-orange-50 border border-orange-200 flex items-center justify-center text-[#E05A10] shrink-0">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">
              Reportes Consolidados de Garantías
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Análisis de exposición por entidad emisora, motivo contractual y totales comprometidos.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={handleExportExcel}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-bold transition-colors cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Exportar Excel</span>
          </button>

          <button
            type="button"
            onClick={handleExportPDF}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#0F172A] hover:bg-slate-800 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer"
          >
            <FileText className="w-4 h-4" />
            <span>Exportar PDF</span>
          </button>
        </div>
      </div>

      {/* Pestañas + Barra de Filtros Globales */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
        {/* Segmented Control */}
        <div className="inline-flex p-1 rounded-xl bg-slate-100 border border-slate-200 self-start">
          <button
            type="button"
            onClick={() => handleTabChange("POLIZAS")}
            className={cn(
              "inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer",
              tab === "POLIZAS"
                ? "bg-white text-slate-900 shadow-xs ring-1 ring-slate-200"
                : "text-slate-500 hover:text-slate-800"
            )}
          >
            <Shield className="w-3.5 h-3.5 text-[#E05A10]" />
            <span>Pólizas</span>
            <span className="px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[10px]">
              {polizasFiltradas.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => handleTabChange("BOLETAS")}
            className={cn(
              "inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer",
              tab === "BOLETAS"
                ? "bg-white text-slate-900 shadow-xs ring-1 ring-slate-200"
                : "text-slate-500 hover:text-slate-800"
            )}
          >
            <Landmark className="w-3.5 h-3.5 text-[#E05A10]" />
            <span>Boletas</span>
            <span className="px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[10px]">
              {boletasFiltradas.length}
            </span>
          </button>
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 mr-1">
            <Filter className="w-3.5 h-3.5" />
            <span>Filtros:</span>
          </div>

          <select
            value={universo}
            onChange={(e) => setUniverso(e.target.value as UniversoFiltro)}
            className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#E05A10]/25"
          >
            <option value="ACTIVAS">Solo Vigentes y Por Vencer (Activas)</option>
            <option value="TODAS">Todas (Incluye Vencidas)</option>
            <option value="VENCIDAS">Solo Vencidas</option>
          </select>

          <select
            value={onFiltro}
            onChange={(e) => setOnFiltro(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#E05A10]/25"
          >
            <option value="TODAS">Todas las ON</option>
            {onOptions.map((on) => (
              <option key={on} value={on}>
                ON {on}
              </option>
            ))}
          </select>

          <select
            value={entidadFiltro}
            onChange={(e) => setEntidadFiltro(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 max-w-[240px] focus:outline-none focus:ring-2 focus:ring-[#E05A10]/25"
          >
            <option value="TODAS">
              {tab === "POLIZAS" ? "Todas las Compañías" : "Todos los Bancos"}
            </option>
            {entidadOptions.map((ent) => (
              <option key={ent} value={ent}>
                {ent}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* PESTAÑA PÓLIZAS */}
      {tab === "POLIZAS" && (
        <>
          {/* 4 Tarjetas KPI */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                TOTAL PÓLIZAS ACTIVAS
              </p>
              <p className="text-2xl font-extrabold text-slate-900 mt-1">
                {resumenPolizas.totalDocs}
              </p>
              <p className="text-[11px] text-slate-400 mt-1">
                Documentos en universo filtrado
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                MONTO TOTAL COMPROMETIDO
              </p>
              <p className="text-2xl font-extrabold text-[#E05A10] mt-1 font-mono">
                {formatUF(resumenPolizas.totalUf)}
              </p>
              <p className="text-[11px] text-slate-400 mt-1">
                Exposición consolidada en UF
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                COMPAÑÍA CON MAYOR EXPOSICIÓN
              </p>
              <p className="text-sm font-extrabold text-slate-900 mt-1.5 truncate">
                {resumenPolizas.topCompania?.entidad || "—"}
              </p>
              <p className="text-xs font-bold text-emerald-700 mt-1">
                {resumenPolizas.topCompania
                  ? `${resumenPolizas.topCompaniaPct.toFixed(1)}% (${formatUF(
                      resumenPolizas.topCompania.totalUf
                    )})`
                  : "Sin datos"}
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                MOTIVO PRINCIPAL
              </p>
              <p className="text-sm font-extrabold text-slate-900 mt-1.5 truncate">
                {resumenPolizas.topMotivo?.label || "—"}
              </p>
              <p className="text-xs font-bold text-slate-600 mt-1 font-mono">
                {resumenPolizas.topMotivo
                  ? formatUF(resumenPolizas.topMotivo.uf)
                  : "Sin datos"}
              </p>
            </div>
          </div>

          {/* Tabla Jerárquica Pólizas */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    <th className="py-3 px-4">COMPAÑÍA DE SEGURO / MOTIVO</th>
                    <th className="py-3 px-4 text-center">CANT. DOCS</th>
                    <th className="py-3 px-4 text-right">SUBTOTAL MONTO (UF)</th>
                    <th className="py-3 px-4 text-right">% PARTICIPACIÓN</th>
                    <th className="py-3 px-4 text-center">DETALLE</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {gruposPolizas.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-slate-400">
                        No se encontraron pólizas para los filtros seleccionados.
                      </td>
                    </tr>
                  ) : (
                    gruposPolizas.map((grupo) => {
                      const subPct =
                        resumenPolizas.totalUf > 0
                          ? (grupo.totalUf / resumenPolizas.totalUf) * 100
                          : 0;

                      return (
                        <React.Fragment key={grupo.entidad}>
                          {/* Encabezado de Compañía */}
                          <tr className="bg-slate-50/70">
                            <td colSpan={5} className="py-2.5 px-4 font-extrabold text-slate-900">
                              <div className="flex items-center gap-2">
                                <Building2 className="w-4 h-4 text-[#E05A10]" />
                                <span>{grupo.entidad}</span>
                              </div>
                            </td>
                          </tr>

                          {/* Motivos dentro de la Compañía */}
                          {grupo.motivos.map((mot) => {
                            const groupKey = `POL-${grupo.entidad}-${mot.motivoKey}`;
                            const isExpanded = Boolean(expandedGroups[groupKey]);
                            const pct =
                              resumenPolizas.totalUf > 0
                                ? (mot.totalUf / resumenPolizas.totalUf) * 100
                                : 0;

                            return (
                              <React.Fragment key={groupKey}>
                                <tr className="hover:bg-slate-50/60 transition-colors">
                                  <td className="py-2.5 px-4 pl-10 text-slate-700 font-medium">
                                    <div className="flex items-center gap-2">
                                      <Layers className="w-3.5 h-3.5 text-slate-400" />
                                      <span>{mot.motivoLabel}</span>
                                    </div>
                                  </td>
                                  <td className="py-2.5 px-4 text-center font-semibold text-slate-700">
                                    {mot.docs.length}
                                  </td>
                                  <td className="py-2.5 px-4 text-right font-mono font-semibold text-slate-800">
                                    {formatUF(mot.totalUf)}
                                  </td>
                                  <td className="py-2.5 px-4 text-right font-mono text-slate-600">
                                    {pct.toFixed(1)}%
                                  </td>
                                  <td className="py-2.5 px-4 text-center">
                                    <button
                                      type="button"
                                      onClick={() => toggleExpand(groupKey)}
                                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-[11px] font-semibold text-slate-700 cursor-pointer"
                                    >
                                      {isExpanded ? (
                                        <ChevronDown className="w-3.5 h-3.5" />
                                      ) : (
                                        <ChevronRight className="w-3.5 h-3.5" />
                                      )}
                                      <span>{isExpanded ? "Ocultar" : "Ver folios"}</span>
                                    </button>
                                  </td>
                                </tr>

                                {isExpanded && (
                                  <tr className="bg-orange-50/30">
                                    <td colSpan={5} className="py-2.5 px-4 pl-14">
                                      <div className="flex flex-wrap gap-2">
                                        {mot.docs.map((d) => {
                                          const { uf } = getMontoDocPorMoneda(d);
                                          return (
                                            <div
                                              key={d.id}
                                              className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-[11px] flex items-center gap-2 shadow-2xs"
                                            >
                                              <span className="font-mono font-bold text-slate-900">
                                                #{d.nro_folio}
                                              </span>
                                              {d.on_proyecto && (
                                                <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold">
                                                  ON {d.on_proyecto}
                                                </span>
                                              )}
                                              <span className="font-mono text-[#E05A10] font-bold">
                                                {formatUF(uf)}
                                              </span>
                                              <span className="text-slate-400">
                                                Vence: {formatDateCL(d.fecha_vencimiento)}
                                              </span>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </React.Fragment>
                            );
                          })}

                          {/* Subtotal por Compañía */}
                          <tr className="bg-slate-100/80 font-bold text-slate-900">
                            <td className="py-2.5 px-4">Subtotal {grupo.entidad}</td>
                            <td className="py-2.5 px-4 text-center">{grupo.cantDocs}</td>
                            <td className="py-2.5 px-4 text-right font-mono">
                              {formatUF(grupo.totalUf)}
                            </td>
                            <td className="py-2.5 px-4 text-right font-mono">
                              {subPct.toFixed(1)}%
                            </td>
                            <td className="py-2.5 px-4" />
                          </tr>
                        </React.Fragment>
                      );
                    })
                  )}
                </tbody>
                {gruposPolizas.length > 0 && (
                  <tfoot>
                    <tr className="bg-[#0F172A] text-white font-bold text-xs">
                      <td className="py-3.5 px-4">TOTAL GENERAL PÓLIZAS</td>
                      <td className="py-3.5 px-4 text-center">
                        {resumenPolizas.totalDocs}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono">
                        {formatUF(resumenPolizas.totalUf)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono">100,0%</td>
                      <td className="py-3.5 px-4" />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </>
      )}

      {/* PESTAÑA BOLETAS */}
      {tab === "BOLETAS" && (
        <>
          {/* 4 Tarjetas KPI */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                TOTAL BOLETAS ACTIVAS
              </p>
              <p className="text-2xl font-extrabold text-slate-900 mt-1">
                {resumenBoletas.totalDocs}
              </p>
              <p className="text-[11px] text-slate-400 mt-1">
                Documentos en universo filtrado
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                TOTAL COMPROMETIDO UF
              </p>
              <p className="text-2xl font-extrabold text-[#E05A10] mt-1 font-mono">
                {formatUF(resumenBoletas.totalUf)}
              </p>
              <p className="text-[11px] text-slate-400 mt-1">
                Boletas emitidas en UF
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                TOTAL COMPROMETIDO CLP
              </p>
              <p className="text-2xl font-extrabold text-blue-700 mt-1 font-mono">
                {formatCLP(resumenBoletas.totalClp)}
              </p>
              <p className="text-[11px] text-slate-400 mt-1">
                Boletas emitidas en Pesos ($)
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                BANCO CON MAYOR EXPOSICIÓN
              </p>
              <p className="text-sm font-extrabold text-slate-900 mt-1.5 truncate">
                {resumenBoletas.topBanco?.entidad || "—"}
              </p>
              <p className="text-xs font-bold text-slate-600 mt-1 font-mono">
                {resumenBoletas.topBanco
                  ? `${formatUF(resumenBoletas.topBanco.totalUf)} · ${formatCLP(
                      resumenBoletas.topBanco.totalClp
                    )}`
                  : "Sin datos"}
              </p>
            </div>
          </div>

          {/* Tabla Jerárquica Boletas */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    <th className="py-3 px-4">BANCO EMISOR / MOTIVO</th>
                    <th className="py-3 px-4 text-center">CANT. DOCS</th>
                    <th className="py-3 px-4 text-right">SUBTOTAL UF</th>
                    <th className="py-3 px-4 text-right">SUBTOTAL CLP ($)</th>
                    <th className="py-3 px-4 text-center">DETALLE</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {gruposBoletas.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-slate-400">
                        No se encontraron boletas para los filtros seleccionados.
                      </td>
                    </tr>
                  ) : (
                    gruposBoletas.map((grupo) => (
                      <React.Fragment key={grupo.entidad}>
                        {/* Encabezado Banco Emisor */}
                        <tr className="bg-slate-50/70">
                          <td colSpan={5} className="py-2.5 px-4 font-extrabold text-slate-900">
                            <div className="flex items-center gap-2">
                              <Landmark className="w-4 h-4 text-[#E05A10]" />
                              <span>{grupo.entidad}</span>
                            </div>
                          </td>
                        </tr>

                        {/* Motivos dentro del Banco */}
                        {grupo.motivos.map((mot) => {
                          const groupKey = `BOL-${grupo.entidad}-${mot.motivoKey}`;
                          const isExpanded = Boolean(expandedGroups[groupKey]);

                          return (
                            <React.Fragment key={groupKey}>
                              <tr className="hover:bg-slate-50/60 transition-colors">
                                <td className="py-2.5 px-4 pl-10 text-slate-700 font-medium">
                                  <div className="flex items-center gap-2">
                                    <Layers className="w-3.5 h-3.5 text-slate-400" />
                                    <span>{mot.motivoLabel}</span>
                                  </div>
                                </td>
                                <td className="py-2.5 px-4 text-center font-semibold text-slate-700">
                                  {mot.docs.length}
                                </td>
                                <td className="py-2.5 px-4 text-right font-mono font-semibold text-slate-800">
                                  {formatUF(mot.totalUf)}
                                </td>
                                <td className="py-2.5 px-4 text-right font-mono font-semibold text-blue-700">
                                  {formatCLP(mot.totalClp)}
                                </td>
                                <td className="py-2.5 px-4 text-center">
                                  <button
                                    type="button"
                                    onClick={() => toggleExpand(groupKey)}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-[11px] font-semibold text-slate-700 cursor-pointer"
                                  >
                                    {isExpanded ? (
                                      <ChevronDown className="w-3.5 h-3.5" />
                                    ) : (
                                      <ChevronRight className="w-3.5 h-3.5" />
                                    )}
                                    <span>{isExpanded ? "Ocultar" : "Ver folios"}</span>
                                  </button>
                                </td>
                              </tr>

                              {isExpanded && (
                                <tr className="bg-orange-50/30">
                                  <td colSpan={5} className="py-2.5 px-4 pl-14">
                                    <div className="flex flex-wrap gap-2">
                                      {mot.docs.map((d) => {
                                        const { uf, clp } = getMontoDocPorMoneda(d);
                                        return (
                                          <div
                                            key={d.id}
                                            className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-[11px] flex items-center gap-2 shadow-2xs"
                                          >
                                            <span className="font-mono font-bold text-slate-900">
                                              #{d.nro_folio}
                                            </span>
                                            {d.on_proyecto && (
                                              <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold">
                                                ON {d.on_proyecto}
                                              </span>
                                            )}
                                            <span className="font-mono text-[#E05A10] font-bold">
                                              {clp > 0 ? formatCLP(clp) : formatUF(uf)}
                                            </span>
                                            <span className="text-slate-400">
                                              Vence: {formatDateCL(d.fecha_vencimiento)}
                                            </span>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}

                        {/* Subtotal por Banco Emisor */}
                        <tr className="bg-slate-100/80 font-bold text-slate-900">
                          <td className="py-2.5 px-4">Subtotal {grupo.entidad}</td>
                          <td className="py-2.5 px-4 text-center">{grupo.cantDocs}</td>
                          <td className="py-2.5 px-4 text-right font-mono">
                            {formatUF(grupo.totalUf)}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono">
                            {formatCLP(grupo.totalClp)}
                          </td>
                          <td className="py-2.5 px-4" />
                        </tr>
                      </React.Fragment>
                    ))
                  )}
                </tbody>
                {gruposBoletas.length > 0 && (
                  <tfoot>
                    <tr className="bg-[#0F172A] text-white font-bold text-xs">
                      <td className="py-3.5 px-4">TOTAL GENERAL BOLETAS</td>
                      <td className="py-3.5 px-4 text-center">
                        {resumenBoletas.totalDocs}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono">
                        {formatUF(resumenBoletas.totalUf)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono">
                        {formatCLP(resumenBoletas.totalClp)}
                      </td>
                      <td className="py-3.5 px-4" />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
