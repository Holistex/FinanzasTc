import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { GarantiaItemWithRelations } from "@/types/database.types";
import { LOGO_TENSACON_BASE64, LOGO_TENSACON_RATIO } from "@/lib/pdf/logo-tensacon";
import { formatDateCL } from "@/lib/utils";

export interface ExportPolizasPdfParams {
  polizas: GarantiaItemWithRelations[];
  filtrosTexto: string;
}

function formatUF(val: number): string {
  return `UF ${val.toLocaleString("es-CL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function exportPolizasEnCursoToPdf({
  polizas,
  filtrosTexto,
}: ExportPolizasPdfParams) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;

  // 1. Membrete Corporativo Claro Tensacon
  const headerTopY = 10;
  const logoHeight = 9.5;
  const logoWidth = logoHeight * LOGO_TENSACON_RATIO;

  try {
    doc.addImage(LOGO_TENSACON_BASE64, "PNG", margin, headerTopY, logoWidth, logoHeight);
  } catch {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(224, 90, 16);
    doc.text("TENSACON S.A.", margin, headerTopY + 7);
  }

  const sepX = margin + logoWidth + 3.5;
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.4);
  doc.line(sepX, headerTopY + 0.5, sepX, headerTopY + logoHeight - 0.5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  doc.text("Gerencia de Administración y Finanzas", sepX + 3.5, headerTopY + 4);

  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 41, 59);
  doc.text(
    "Departamento de Tesorería & Gestión de Garantías",
    sepX + 3.5,
    headerTopY + 8
  );

  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const fechaStr = `${pad(now.getDate())}-${pad(now.getMonth() + 1)}-${now.getFullYear()}`;
  const horaStr = `${pad(now.getHours())}:${pad(now.getMinutes())}`;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `Emisión: ${fechaStr}, ${horaStr} hrs · Santiago de Chile`,
    pageWidth - margin,
    headerTopY + 6,
    { align: "right" }
  );

  // Título Principal
  const titleY = headerTopY + logoHeight + 6;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(
    "REPORTE DE PÓLIZAS DE GARANTÍA EN CURSO (VIGENTES / POR RENOVAR)",
    margin,
    titleY
  );

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text(`Filtros aplicados: ${filtrosTexto}`, margin, titleY + 4.5);

  // Resumen KPIs
  const totalDocs = polizas.length;
  const totalVigentes = polizas.filter((p) => p.estado === "VIGENTE").length;
  const totalPorVencer = polizas.filter((p) => p.estado === "PROXIMA_A_VENCER").length;
  const totalUf = polizas.reduce(
    (acc, p) => acc + Number(p.monto_uf !== undefined && p.monto_uf !== null ? p.monto_uf : p.monto || 0),
    0
  );

  const kpiY = titleY + 8;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(margin, kpiY, contentWidth, 9, 1.5, 1.5, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  doc.text(
    `Total en Curso: ${totalDocs} pólizas   |   Vigentes: ${totalVigentes}   |   Por Vencer (≤30d): ${totalPorVencer}   |   Monto Total Comprometido: ${formatUF(totalUf)}`,
    margin + 4,
    kpiY + 5.8
  );

  // Tabla Principal
  const rows = polizas.map((p) => {
    const montoUfVal = Number(
      p.monto_uf !== undefined && p.monto_uf !== null ? p.monto_uf : p.monto || 0
    );
    const dias = p.dias_restantes ?? 0;
    const estadoTxt =
      p.estado === "VIGENTE"
        ? `VIGENTE (+${dias}d)`
        : `POR VENCER (${dias}d)`;

    const ultimaGestionEstado =
      p.ultima_gestion_estado || p.gestiones?.[0]?.estado_gestion || "Sin gestión";
    const segFecha =
      p.ultima_gestion_seguimiento ||
      p.gestiones?.find((g) => Boolean(g.fecha_proximo_seguimiento))
        ?.fecha_proximo_seguimiento ||
      null;
    const gestionTxt = segFecha
      ? `${ultimaGestionEstado}\nSeg: ${formatDateCL(segFecha)}`
      : ultimaGestionEstado;

    return [
      p.nro_folio || "—",
      p.on_proyecto ? `ON ${p.on_proyecto}` : "—",
      p.mandante_razon_social || "No asignado",
      p.compania_razon_social || "No asignada",
      p.motivo || "—",
      formatUF(montoUfVal),
      formatDateCL(p.fecha_emision),
      formatDateCL(p.fecha_vencimiento),
      estadoTxt,
      gestionTxt,
    ];
  });

  if (rows.length > 0) {
    rows.push([
      { content: "TOTAL GENERAL", colSpan: 5, styles: { fontStyle: "bold", fillColor: [15, 23, 42], textColor: [255, 255, 255] } } as unknown as string,
      { content: formatUF(totalUf), styles: { fontStyle: "bold", fillColor: [15, 23, 42], textColor: [255, 255, 255], halign: "right" } } as unknown as string,
      { content: `${totalDocs} pólizas`, colSpan: 4, styles: { fontStyle: "bold", fillColor: [15, 23, 42], textColor: [255, 255, 255] } } as unknown as string,
    ]);
  }

  autoTable(doc, {
    startY: kpiY + 12,
    head: [
      [
        "N° FOLIO",
        "ON",
        "MANDANTE",
        "COMPAÑÍA ASEGURADORA",
        "MOTIVO / CONCEPTO",
        "MONTO (UF)",
        "EMISIÓN",
        "VENCIMIENTO",
        "ESTADO",
        "ÚLTIMA GESTIÓN",
      ],
    ],
    body:
      rows.length > 0
        ? rows
        : [
            [
              {
                content: "No se registran pólizas vigentes o por renovar para los filtros seleccionados.",
                colSpan: 10,
                styles: { halign: "center", textColor: [100, 116, 139] },
              } as unknown as string,
            ],
          ],
    theme: "grid",
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontSize: 7.3,
      fontStyle: "bold",
    },
    bodyStyles: {
      fontSize: 7.2,
      textColor: [30, 41, 59],
      cellPadding: 2,
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: {
      0: { cellWidth: 20, fontStyle: "bold" },
      1: { cellWidth: 16 },
      2: { cellWidth: 38 },
      3: { cellWidth: 36 },
      4: { cellWidth: "auto" },
      5: { cellWidth: 24, halign: "right", fontStyle: "bold" },
      6: { cellWidth: 20, halign: "center" },
      7: { cellWidth: 21, halign: "center" },
      8: { cellWidth: 25, halign: "center" },
      9: { cellWidth: 34 },
    },
    margin: { left: margin, right: margin },
  });

  // Bloque de Validación al pie
  // @ts-expect-error lastAutoTable injected by jspdf-autotable
  const finalY: number = doc.lastAutoTable?.finalY || kpiY + 40;
  let footerY = finalY + 10;
  if (footerY + 26 > pageHeight - 10) {
    doc.addPage();
    footerY = 20;
  }

  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.3);
  doc.roundedRect(margin, footerY, contentWidth, 22, 1.5, 1.5, "S");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  doc.text("VALIDACIÓN Y CONTROL INTERNO — TENSACON S.A.", margin + 4, footerY + 5);

  doc.setDrawColor(148, 163, 184);
  doc.line(margin + 12, footerY + 15, margin + 78, footerY + 15);
  doc.line(margin + 105, footerY + 15, margin + 175, footerY + 15);
  doc.line(margin + 195, footerY + 15, contentWidth + margin - 10, footerY + 15);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.text("Emitido por / Tesorería", margin + 28, footerY + 19);
  doc.text("Revisado por / Control de Gestión", margin + 120, footerY + 19);
  doc.text("V°B° Gerencia de Finanzas", margin + 215, footerY + 19);

  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `Finanzas Core Tensacon · Página ${i} de ${totalPages}`,
      pageWidth - margin,
      pageHeight - 6,
      { align: "right" }
    );
  }

  const fechaArchivo = now.toISOString().slice(0, 10);
  doc.save(`Polizas_En_Curso_Tensacon_${fechaArchivo}.pdf`);
}
