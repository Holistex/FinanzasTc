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

interface EntidadResumen {
  entidad: string;
  docs: GarantiaItemWithRelations[];
  cantDocs: number;
  totalUf: number;
  totalClp: number;
}

interface MotivoEntidadItem {
  entidad: string;
  docs: GarantiaItemWithRelations[];
  cantDocs: number;
  totalUf: number;
  totalClp: number;
}

interface MotivoResumen {
  motivoKey: string;
  motivoLabel: string;
  entidades: MotivoEntidadItem[];
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

function agruparPorEntidad(items: GarantiaItemWithRelations[]): EntidadResumen[] {
  const map = new Map<string, EntidadResumen>();
  for (const doc of items) {
    const entidad = String(doc.compania_razon_social || "No asignada").trim();
    const { uf, clp } = getMontoDocPorMoneda(doc);
    if (!map.has(entidad)) {
      map.set(entidad, {
        entidad,
        docs: [],
        cantDocs: 0,
        totalUf: 0,
        totalClp: 0,
      });
    }
    const entry = map.get(entidad)!;
    entry.docs.push(doc);
    entry.cantDocs += 1;
    entry.totalUf += uf;
    entry.totalClp += clp;
  }
  return Array.from(map.values()).sort(
    (a, b) => b.totalUf - a.totalUf || b.totalClp - a.totalClp
  );
}

function agruparPorMotivo(items: GarantiaItemWithRelations[]): MotivoResumen[] {
  const motivoMap = new Map<
    string,
    {
      motivoLabel: string;
      entidadMap: Map<string, MotivoEntidadItem>;
      cantDocs: number;
      totalUf: number;
      totalClp: number;
    }
  >();

  for (const doc of items) {
    const { key: mKey, label: mLabel } = normalizarMotivo(doc.motivo);
    const entidad = String(doc.compania_razon_social || "No asignada").trim();
    const { uf, clp } = getMontoDocPorMoneda(doc);

    if (!motivoMap.has(mKey)) {
      motivoMap.set(mKey, {
        motivoLabel: mLabel,
        entidadMap: new Map(),
        cantDocs: 0,
        totalUf: 0,
        totalClp: 0,
      });
    }
    const motEntry = motivoMap.get(mKey)!;
    motEntry.cantDocs += 1;
    motEntry.totalUf += uf;
    motEntry.totalClp += clp;

    if (!motEntry.entidadMap.has(entidad)) {
      motEntry.entidadMap.set(entidad, {
        entidad,
        docs: [],
        cantDocs: 0,
        totalUf: 0,
        totalClp: 0,
      });
    }
    const entEntry = motEntry.entidadMap.get(entidad)!;
    entEntry.docs.push(doc);
    entEntry.cantDocs += 1;
    entEntry.totalUf += uf;
    entEntry.totalClp += clp;
  }

  return Array.from(motivoMap.entries())
    .map(([motivoKey, data]) => ({
      motivoKey,
      motivoLabel: data.motivoLabel,
      cantDocs: data.cantDocs,
      totalUf: data.totalUf,
      totalClp: data.totalClp,
      entidades: Array.from(data.entidadMap.values()).sort(
        (a, b) => b.totalUf - a.totalUf || b.totalClp - a.totalClp
      ),
    }))
    .sort((a, b) => b.totalUf - a.totalUf || b.totalClp - a.totalClp);
}

function FoliosChips({ docs }: { docs: GarantiaItemWithRelations[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {docs.map((d) => {
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
  );
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
  const [expandedKeys, setExpandedKeys] = useState<Record<string, boolean>>({});

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

  const polizasPorEntidad = useMemo(
    () => agruparPorEntidad(polizasFiltradas),
    [polizasFiltradas]
  );
  const polizasPorMotivo = useMemo(
    () => agruparPorMotivo(polizasFiltradas),
    [polizasFiltradas]
  );

  const boletasPorEntidad = useMemo(
    () => agruparPorEntidad(boletasFiltradas),
    [boletasFiltradas]
  );
  const boletasPorMotivo = useMemo(
    () => agruparPorMotivo(boletasFiltradas),
    [boletasFiltradas]
  );

  const resumenPolizas = useMemo(() => {
    const totalDocs = polizasFiltradas.length;
    const totalUf = polizasPorEntidad.reduce((acc, g) => acc + g.totalUf, 0);
    const topCompania = polizasPorEntidad[0] || null;
    const topCompaniaPct =
      topCompania && totalUf > 0 ? (topCompania.totalUf / totalUf) * 100 : 0;
    const topMotivo = polizasPorMotivo[0] || null;

    return { totalDocs, totalUf, topCompania, topCompaniaPct, topMotivo };
  }, [polizasFiltradas, polizasPorEntidad, polizasPorMotivo]);

  const resumenBoletas = useMemo(() => {
    const totalDocs = boletasFiltradas.length;
    const totalUf = boletasPorEntidad.reduce((acc, g) => acc + g.totalUf, 0);
    const totalClp = boletasPorEntidad.reduce((acc, g) => acc + g.totalClp, 0);
    const topBanco = boletasPorEntidad[0] || null;
    return { totalDocs, totalUf, totalClp, topBanco };
  }, [boletasFiltradas, boletasPorEntidad]);

  const toggleExpand = (key: string) => {
    setExpandedKeys((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleTabChange = (nextTab: TabReporte) => {
    setTab(nextTab);
    setEntidadFiltro("TODAS");
    setExpandedKeys({});
  };

  const universoLabel =
    universo === "ACTIVAS"
      ? "Solo Vigentes y Por Vencer (Activas)"
      : universo === "VENCIDAS"
        ? "Solo Vencidas"
        : "Todas (Incluye Vencidas)";

  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new();

    // Pólizas - Cuadro 1: Por Compañía
    const polEntRows = polizasPorEntidad.map((g) => {
      const pct =
        resumenPolizas.totalUf > 0
          ? (g.totalUf / resumenPolizas.totalUf) * 100
          : 0;
      return {
        "COMPAÑÍA DE SEGURO": g.entidad,
        "CANT. DOCS": g.cantDocs,
        "TOTAL MONTO (UF)": Number(g.totalUf.toFixed(2)),
        "% PARTICIPACIÓN": `${pct.toFixed(1)}%`,
      };
    });
    polEntRows.push({
      "COMPAÑÍA DE SEGURO": "TOTAL GENERAL",
      "CANT. DOCS": resumenPolizas.totalDocs,
      "TOTAL MONTO (UF)": Number(resumenPolizas.totalUf.toFixed(2)),
      "% PARTICIPACIÓN": "100.0%",
    });
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(polEntRows),
      "Pólizas por Compañía"
    );

    // Pólizas - Cuadro 2: Por Motivo
    const polMotRows: Array<Record<string, string | number>> = [];
    for (const m of polizasPorMotivo) {
      for (const e of m.entidades) {
        polMotRows.push({
          "CÍA. SEGURO": e.entidad,
          "MOTIVO / TIPO PÓLIZA": m.motivoLabel,
          "CANT. DOCS": e.cantDocs,
          "MONTO UF": Number(e.totalUf.toFixed(2)),
        });
      }
      polMotRows.push({
        "CÍA. SEGURO": "",
        "MOTIVO / TIPO PÓLIZA": `Total ${m.motivoLabel}`,
        "CANT. DOCS": m.cantDocs,
        "MONTO UF": Number(m.totalUf.toFixed(2)),
      });
    }
    polMotRows.push({
      "CÍA. SEGURO": "",
      "MOTIVO / TIPO PÓLIZA": "TOTAL GENERAL",
      "CANT. DOCS": resumenPolizas.totalDocs,
      "MONTO UF": Number(resumenPolizas.totalUf.toFixed(2)),
    });
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(polMotRows),
      "Pólizas por Motivo"
    );

    // Boletas - Cuadro 1: Por Banco
    const bolEntRows = boletasPorEntidad.map((g) => ({
      "BANCO EMISOR": g.entidad,
      "CANT. DOCS": g.cantDocs,
      "TOTAL UF": Number(g.totalUf.toFixed(2)),
      "TOTAL CLP ($)": Math.round(g.totalClp),
    }));
    bolEntRows.push({
      "BANCO EMISOR": "TOTAL GENERAL",
      "CANT. DOCS": resumenBoletas.totalDocs,
      "TOTAL UF": Number(resumenBoletas.totalUf.toFixed(2)),
      "TOTAL CLP ($)": Math.round(resumenBoletas.totalClp),
    });
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(bolEntRows),
      "Boletas por Banco"
    );

    // Boletas - Cuadro 2: Por Motivo
    const bolMotRows: Array<Record<string, string | number>> = [];
    for (const m of boletasPorMotivo) {
      for (const e of m.entidades) {
        bolMotRows.push({
          "BANCO EMISOR": e.entidad,
          "MOTIVO / TIPO BOLETA": m.motivoLabel,
          "CANT. DOCS": e.cantDocs,
          "MONTO UF": Number(e.totalUf.toFixed(2)),
          "MONTO CLP ($)": Math.round(e.totalClp),
        });
      }
      bolMotRows.push({
        "BANCO EMISOR": "",
        "MOTIVO / TIPO BOLETA": `Total ${m.motivoLabel}`,
        "CANT. DOCS": m.cantDocs,
        "MONTO UF": Number(m.totalUf.toFixed(2)),
        "MONTO CLP ($)": Math.round(m.totalClp),
      });
    }
    bolMotRows.push({
      "BANCO EMISOR": "",
      "MOTIVO / TIPO BOLETA": "TOTAL GENERAL",
      "CANT. DOCS": resumenBoletas.totalDocs,
      "MONTO UF": Number(resumenBoletas.totalUf.toFixed(2)),
      "MONTO CLP ($)": Math.round(resumenBoletas.totalClp),
    });
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(bolMotRows),
      "Boletas por Motivo"
    );

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
      // Cuadro 1
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(15, 23, 42);
      doc.text("1. Resumen Consolidado por Compañía de Seguro", 14, 35);

      const body1 = polizasPorEntidad.map((g) => {
        const pct =
          resumenPolizas.totalUf > 0
            ? (g.totalUf / resumenPolizas.totalUf) * 100
            : 0;
        return [g.entidad, String(g.cantDocs), formatUF(g.totalUf), `${pct.toFixed(1)}%`];
      });
      body1.push([
        { content: "TOTAL GENERAL", styles: { fontStyle: "bold", fillColor: [15, 23, 42], textColor: [255, 255, 255] } } as unknown as string,
        { content: String(resumenPolizas.totalDocs), styles: { fontStyle: "bold", fillColor: [15, 23, 42], textColor: [255, 255, 255] } } as unknown as string,
        { content: formatUF(resumenPolizas.totalUf), styles: { fontStyle: "bold", fillColor: [15, 23, 42], textColor: [255, 255, 255] } } as unknown as string,
        { content: "100,0%", styles: { fontStyle: "bold", fillColor: [15, 23, 42], textColor: [255, 255, 255] } } as unknown as string,
      ]);

      autoTable(doc, {
        startY: 38,
        head: [["COMPAÑÍA DE SEGURO", "CANT. DOCS", "TOTAL MONTO (UF)", "% PART."]],
        body: body1,
        theme: "grid",
        headStyles: { fillColor: [15, 23, 42], textColor: 255, fontSize: 8.5 },
        styles: { fontSize: 8.5, cellPadding: 2.3 },
        columnStyles: {
          1: { halign: "center" },
          2: { halign: "right" },
          3: { halign: "right" },
        },
      });

      // Cuadro 2
      const finalY =
        (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable
          ?.finalY || 90;
      const startY2 = finalY + 10;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text("2. Desglose por Motivo y Compañías Involucradas", 14, startY2);

      const body2: Array<Array<string>> = [];
      for (const m of polizasPorMotivo) {
        for (const e of m.entidades) {
          body2.push([
            e.entidad,
            m.motivoLabel,
            String(e.cantDocs),
            formatUF(e.totalUf),
          ]);
        }
        body2.push([
          { content: "", styles: { fillColor: [254, 243, 199] } } as unknown as string,
          { content: `Total ${m.motivoLabel}`, styles: { fontStyle: "bold", fillColor: [254, 243, 199] } } as unknown as string,
          { content: String(m.cantDocs), styles: { fontStyle: "bold", fillColor: [254, 243, 199] } } as unknown as string,
          { content: formatUF(m.totalUf), styles: { fontStyle: "bold", fillColor: [254, 243, 199] } } as unknown as string,
        ]);
      }
      body2.push([
        { content: "", styles: { fillColor: [15, 23, 42] } } as unknown as string,
        { content: "TOTAL GENERAL", styles: { fontStyle: "bold", fillColor: [15, 23, 42], textColor: [255, 255, 255] } } as unknown as string,
        { content: String(resumenPolizas.totalDocs), styles: { fontStyle: "bold", fillColor: [15, 23, 42], textColor: [255, 255, 255] } } as unknown as string,
        { content: formatUF(resumenPolizas.totalUf), styles: { fontStyle: "bold", fillColor: [15, 23, 42], textColor: [255, 255, 255] } } as unknown as string,
      ]);

      autoTable(doc, {
        startY: startY2 + 3,
        head: [["CÍA. SEGURO", "MOTIVO / TIPO PÓLIZA", "CANT. DOCS", "MONTO UF"]],
        body: body2,
        theme: "grid",
        headStyles: { fillColor: [15, 23, 42], textColor: 255, fontSize: 8.5 },
        styles: { fontSize: 8.5, cellPadding: 2.3 },
        columnStyles: {
          2: { halign: "center" },
          3: { halign: "right" },
        },
      });
    } else {
      // Cuadro 1 Boletas
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(15, 23, 42);
      doc.text("1. Resumen Consolidado por Banco Emisor", 14, 35);

      const body1 = boletasPorEntidad.map((g) => [
        g.entidad,
        String(g.cantDocs),
        formatUF(g.totalUf),
        formatCLP(g.totalClp),
      ]);
      body1.push([
        { content: "TOTAL GENERAL", styles: { fontStyle: "bold", fillColor: [15, 23, 42], textColor: [255, 255, 255] } } as unknown as string,
        { content: String(resumenBoletas.totalDocs), styles: { fontStyle: "bold", fillColor: [15, 23, 42], textColor: [255, 255, 255] } } as unknown as string,
        { content: formatUF(resumenBoletas.totalUf), styles: { fontStyle: "bold", fillColor: [15, 23, 42], textColor: [255, 255, 255] } } as unknown as string,
        { content: formatCLP(resumenBoletas.totalClp), styles: { fontStyle: "bold", fillColor: [15, 23, 42], textColor: [255, 255, 255] } } as unknown as string,
      ]);

      autoTable(doc, {
        startY: 38,
        head: [["BANCO EMISOR", "CANT. DOCS", "TOTAL UF", "TOTAL CLP ($)"]],
        body: body1,
        theme: "grid",
        headStyles: { fillColor: [15, 23, 42], textColor: 255, fontSize: 8.5 },
        styles: { fontSize: 8.5, cellPadding: 2.3 },
        columnStyles: {
          1: { halign: "center" },
          2: { halign: "right" },
          3: { halign: "right" },
        },
      });

      // Cuadro 2 Boletas
      const finalY =
        (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable
          ?.finalY || 90;
      const startY2 = finalY + 10;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text("2. Desglose por Motivo y Bancos Involucrados", 14, startY2);

      const body2: Array<Array<string>> = [];
      for (const m of boletasPorMotivo) {
        for (const e of m.entidades) {
          body2.push([
            e.entidad,
            m.motivoLabel,
            String(e.cantDocs),
            formatUF(e.totalUf),
            formatCLP(e.totalClp),
          ]);
        }
        body2.push([
          { content: "", styles: { fillColor: [254, 243, 199] } } as unknown as string,
          { content: `Total ${m.motivoLabel}`, styles: { fontStyle: "bold", fillColor: [254, 243, 199] } } as unknown as string,
          { content: String(m.cantDocs), styles: { fontStyle: "bold", fillColor: [254, 243, 199] } } as unknown as string,
          { content: formatUF(m.totalUf), styles: { fontStyle: "bold", fillColor: [254, 243, 199] } } as unknown as string,
          { content: formatCLP(m.totalClp), styles: { fontStyle: "bold", fillColor: [254, 243, 199] } } as unknown as string,
        ]);
      }
      body2.push([
        { content: "", styles: { fillColor: [15, 23, 42] } } as unknown as string,
        { content: "TOTAL GENERAL", styles: { fontStyle: "bold", fillColor: [15, 23, 42], textColor: [255, 255, 255] } } as unknown as string,
        { content: String(resumenBoletas.totalDocs), styles: { fontStyle: "bold", fillColor: [15, 23, 42], textColor: [255, 255, 255] } } as unknown as string,
        { content: formatUF(resumenBoletas.totalUf), styles: { fontStyle: "bold", fillColor: [15, 23, 42], textColor: [255, 255, 255] } } as unknown as string,
        { content: formatCLP(resumenBoletas.totalClp), styles: { fontStyle: "bold", fillColor: [15, 23, 42], textColor: [255, 255, 255] } } as unknown as string,
      ]);

      autoTable(doc, {
        startY: startY2 + 3,
        head: [["BANCO EMISOR", "MOTIVO / TIPO BOLETA", "CANT. DOCS", "MONTO UF", "MONTO CLP ($)"]],
        body: body2,
        theme: "grid",
        headStyles: { fillColor: [15, 23, 42], textColor: 255, fontSize: 8.5 },
        styles: { fontSize: 8.5, cellPadding: 2.3 },
        columnStyles: {
          2: { halign: "center" },
          3: { halign: "right" },
          4: { halign: "right" },
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
        <div className="space-y-6">
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
                {resumenPolizas.topMotivo?.motivoLabel || "—"}
              </p>
              <p className="text-xs font-bold text-slate-600 mt-1 font-mono">
                {resumenPolizas.topMotivo
                  ? formatUF(resumenPolizas.topMotivo.totalUf)
                  : "Sin datos"}
              </p>
            </div>
          </div>

          {/* REPORTE 1: Consolidado por Compañía de Seguro */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50/70 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-[#E05A10]" />
              <h2 className="text-sm font-extrabold text-slate-900">
                1. Resumen Consolidado por Compañía de Seguro
              </h2>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    <th className="py-3 px-4">COMPAÑÍA DE SEGURO</th>
                    <th className="py-3 px-4 text-center">CANT. DOCS</th>
                    <th className="py-3 px-4 text-right">TOTAL MONTO (UF)</th>
                    <th className="py-3 px-4 text-right">% PARTICIPACIÓN</th>
                    <th className="py-3 px-4 text-center">DETALLE</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {polizasPorEntidad.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-10 text-center text-slate-400">
                        No se encontraron pólizas para los filtros seleccionados.
                      </td>
                    </tr>
                  ) : (
                    polizasPorEntidad.map((g) => {
                      const pct =
                        resumenPolizas.totalUf > 0
                          ? (g.totalUf / resumenPolizas.totalUf) * 100
                          : 0;
                      const key = `R1-POL-${g.entidad}`;
                      const isExpanded = Boolean(expandedKeys[key]);

                      return (
                        <React.Fragment key={key}>
                          <tr className="hover:bg-slate-50/70 transition-colors">
                            <td className="py-3 px-4 font-bold text-slate-900">
                              {g.entidad}
                            </td>
                            <td className="py-3 px-4 text-center font-semibold text-slate-700">
                              {g.cantDocs}
                            </td>
                            <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                              {formatUF(g.totalUf)}
                            </td>
                            <td className="py-3 px-4 text-right">
                              <div className="inline-flex items-center gap-2">
                                <div className="w-16 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                                  <div
                                    className="h-full bg-[#E05A10] rounded-full"
                                    style={{ width: `${Math.min(100, pct)}%` }}
                                  />
                                </div>
                                <span className="font-mono text-slate-700 font-semibold w-12 text-right">
                                  {pct.toFixed(1)}%
                                </span>
                              </div>
                            </td>
                            <td className="py-3 px-4 text-center">
                              <button
                                type="button"
                                onClick={() => toggleExpand(key)}
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
                              <td colSpan={5} className="py-2.5 px-6">
                                <FoliosChips docs={g.docs} />
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })
                  )}
                </tbody>
                {polizasPorEntidad.length > 0 && (
                  <tfoot>
                    <tr className="bg-[#0F172A] text-white font-bold text-xs">
                      <td className="py-3.5 px-4">TOTAL GENERAL</td>
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

          {/* REPORTE 2: Desglose por Motivo y Compañías Involucradas */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50/70 flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#E05A10]" />
              <h2 className="text-sm font-extrabold text-slate-900">
                2. Desglose por Motivo y Compañías Involucradas
              </h2>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    <th className="py-3 px-4">CÍA. SEGURO</th>
                    <th className="py-3 px-4">MOTIVO / TIPO PÓLIZA</th>
                    <th className="py-3 px-4 text-center">CANT. DOCS</th>
                    <th className="py-3 px-4 text-right">MONTO UF</th>
                    <th className="py-3 px-4 text-center">DETALLE</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {polizasPorMotivo.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-10 text-center text-slate-400">
                        No se encontraron pólizas para los filtros seleccionados.
                      </td>
                    </tr>
                  ) : (
                    polizasPorMotivo.map((mot) => (
                      <React.Fragment key={`R2-POL-${mot.motivoKey}`}>
                        {mot.entidades.map((ent) => {
                          const key = `R2-POL-${mot.motivoKey}-${ent.entidad}`;
                          const isExpanded = Boolean(expandedKeys[key]);
                          return (
                            <React.Fragment key={key}>
                              <tr className="hover:bg-slate-50/70 transition-colors">
                                <td className="py-2.5 px-4 font-bold text-slate-900">
                                  {ent.entidad}
                                </td>
                                <td className="py-2.5 px-4 text-slate-700 font-medium">
                                  {mot.motivoLabel}
                                </td>
                                <td className="py-2.5 px-4 text-center font-semibold text-slate-700">
                                  {ent.cantDocs}
                                </td>
                                <td className="py-2.5 px-4 text-right bg-orange-50/70 font-mono font-semibold text-slate-900">
                                  {formatUF(ent.totalUf)}
                                </td>
                                <td className="py-2.5 px-4 text-center">
                                  <button
                                    type="button"
                                    onClick={() => toggleExpand(key)}
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
                                  <td colSpan={5} className="py-2.5 px-6">
                                    <FoliosChips docs={ent.docs} />
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}

                        {/* Subtotal al cierre de cada Motivo */}
                        <tr className="bg-amber-100/90 border-y border-amber-300 font-bold text-slate-950">
                          <td className="py-2.5 px-4" />
                          <td className="py-2.5 px-4">Total {mot.motivoLabel}</td>
                          <td className="py-2.5 px-4 text-center">{mot.cantDocs}</td>
                          <td className="py-2.5 px-4 text-right font-mono">
                            {formatUF(mot.totalUf)}
                          </td>
                          <td className="py-2.5 px-4" />
                        </tr>
                      </React.Fragment>
                    ))
                  )}
                </tbody>
                {polizasPorMotivo.length > 0 && (
                  <tfoot>
                    <tr className="bg-[#0F172A] text-white font-bold text-xs">
                      <td className="py-3.5 px-4" />
                      <td className="py-3.5 px-4">TOTAL GENERAL</td>
                      <td className="py-3.5 px-4 text-center">
                        {resumenPolizas.totalDocs}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono">
                        {formatUF(resumenPolizas.totalUf)}
                      </td>
                      <td className="py-3.5 px-4" />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>
      )}

      {/* PESTAÑA BOLETAS */}
      {tab === "BOLETAS" && (
        <div className="space-y-6">
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

          {/* REPORTE 1: Consolidado por Banco Emisor */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50/70 flex items-center gap-2">
              <Landmark className="w-4 h-4 text-[#E05A10]" />
              <h2 className="text-sm font-extrabold text-slate-900">
                1. Resumen Consolidado por Banco Emisor
              </h2>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    <th className="py-3 px-4">BANCO EMISOR</th>
                    <th className="py-3 px-4 text-center">CANT. DOCS</th>
                    <th className="py-3 px-4 text-right">TOTAL UF</th>
                    <th className="py-3 px-4 text-right">TOTAL CLP ($)</th>
                    <th className="py-3 px-4 text-center">DETALLE</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {boletasPorEntidad.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-10 text-center text-slate-400">
                        No se encontraron boletas para los filtros seleccionados.
                      </td>
                    </tr>
                  ) : (
                    boletasPorEntidad.map((g) => {
                      const key = `R1-BOL-${g.entidad}`;
                      const isExpanded = Boolean(expandedKeys[key]);

                      return (
                        <React.Fragment key={key}>
                          <tr className="hover:bg-slate-50/70 transition-colors">
                            <td className="py-3 px-4 font-bold text-slate-900">
                              {g.entidad}
                            </td>
                            <td className="py-3 px-4 text-center font-semibold text-slate-700">
                              {g.cantDocs}
                            </td>
                            <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                              {formatUF(g.totalUf)}
                            </td>
                            <td className="py-3 px-4 text-right font-mono font-bold text-blue-700">
                              {formatCLP(g.totalClp)}
                            </td>
                            <td className="py-3 px-4 text-center">
                              <button
                                type="button"
                                onClick={() => toggleExpand(key)}
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
                              <td colSpan={5} className="py-2.5 px-6">
                                <FoliosChips docs={g.docs} />
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })
                  )}
                </tbody>
                {boletasPorEntidad.length > 0 && (
                  <tfoot>
                    <tr className="bg-[#0F172A] text-white font-bold text-xs">
                      <td className="py-3.5 px-4">TOTAL GENERAL</td>
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

          {/* REPORTE 2: Desglose por Motivo y Bancos Involucrados */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50/70 flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#E05A10]" />
              <h2 className="text-sm font-extrabold text-slate-900">
                2. Desglose por Motivo y Bancos Involucrados
              </h2>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    <th className="py-3 px-4">BANCO EMISOR</th>
                    <th className="py-3 px-4">MOTIVO / TIPO BOLETA</th>
                    <th className="py-3 px-4 text-center">CANT. DOCS</th>
                    <th className="py-3 px-4 text-right">MONTO UF</th>
                    <th className="py-3 px-4 text-right">MONTO CLP ($)</th>
                    <th className="py-3 px-4 text-center">DETALLE</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {boletasPorMotivo.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-slate-400">
                        No se encontraron boletas para los filtros seleccionados.
                      </td>
                    </tr>
                  ) : (
                    boletasPorMotivo.map((mot) => (
                      <React.Fragment key={`R2-BOL-${mot.motivoKey}`}>
                        {mot.entidades.map((ent) => {
                          const key = `R2-BOL-${mot.motivoKey}-${ent.entidad}`;
                          const isExpanded = Boolean(expandedKeys[key]);
                          return (
                            <React.Fragment key={key}>
                              <tr className="hover:bg-slate-50/70 transition-colors">
                                <td className="py-2.5 px-4 font-bold text-slate-900">
                                  {ent.entidad}
                                </td>
                                <td className="py-2.5 px-4 text-slate-700 font-medium">
                                  {mot.motivoLabel}
                                </td>
                                <td className="py-2.5 px-4 text-center font-semibold text-slate-700">
                                  {ent.cantDocs}
                                </td>
                                <td className="py-2.5 px-4 text-right bg-orange-50/70 font-mono font-semibold text-slate-900">
                                  {formatUF(ent.totalUf)}
                                </td>
                                <td className="py-2.5 px-4 text-right bg-orange-50/70 font-mono font-semibold text-blue-800">
                                  {formatCLP(ent.totalClp)}
                                </td>
                                <td className="py-2.5 px-4 text-center">
                                  <button
                                    type="button"
                                    onClick={() => toggleExpand(key)}
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
                                  <td colSpan={6} className="py-2.5 px-6">
                                    <FoliosChips docs={ent.docs} />
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}

                        {/* Subtotal al cierre de cada Motivo */}
                        <tr className="bg-amber-100/90 border-y border-amber-300 font-bold text-slate-950">
                          <td className="py-2.5 px-4" />
                          <td className="py-2.5 px-4">Total {mot.motivoLabel}</td>
                          <td className="py-2.5 px-4 text-center">{mot.cantDocs}</td>
                          <td className="py-2.5 px-4 text-right font-mono">
                            {formatUF(mot.totalUf)}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono">
                            {formatCLP(mot.totalClp)}
                          </td>
                          <td className="py-2.5 px-4" />
                        </tr>
                      </React.Fragment>
                    ))
                  )}
                </tbody>
                {boletasPorMotivo.length > 0 && (
                  <tfoot>
                    <tr className="bg-[#0F172A] text-white font-bold text-xs">
                      <td className="py-3.5 px-4" />
                      <td className="py-3.5 px-4">TOTAL GENERAL</td>
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
        </div>
      )}
    </div>
  );
}
