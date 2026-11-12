import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { CompromisoCompra } from "@/types/database.types";
import { formatCLP, formatDateCL, formatRutDisplay } from "@/lib/utils";
import { LOGO_TENSACON_BASE64, LOGO_TENSACON_RATIO } from "./logo-tensacon";

export interface GenerateCompromisosPdfOptions {
  semanaLabel: string;
  rangoFechas?: string;
  compromisos: CompromisoCompra[];
  totales: {
    totalCheques: number;
    totalFactoring: number;
    totalConfirming: number;
    granTotal: number;
  };
  correlativo?: string;
}

/**
 * Genera y descarga el Reporte Oficial de Compromisos y Obligaciones Financieras
 * en PDF bajo el estándar corporativo ejecutivo claro de Tensacon S.A.
 */
export function exportCompromisosToPdf({
  semanaLabel,
  rangoFechas,
  compromisos,
  totales,
  correlativo,
}: GenerateCompromisosPdfOptions): void {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2; // 182 mm

  const codigoCorrelativo =
    correlativo ||
    `COM-2026-${String(Math.floor(1000 + Math.random() * 9000))}`;

  // =========================================================================
  // 1. ENCABEZADO CORPORATIVO OFICIAL TENSACON (CABECERA CLARA EJECUTIVA)
  // =========================================================================
  const headerTopY = 10;
  const logoHeight = 9.5;
  const logoWidth = logoHeight * LOGO_TENSACON_RATIO; // ~40.06 mm

  // A. Isologotipo oficial de Tensacon (Isotipo naranja + texto institucional)
  try {
    doc.addImage(LOGO_TENSACON_BASE64, "PNG", margin, headerTopY, logoWidth, logoHeight);
  } catch {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(224, 90, 16); // #E05A10
    doc.text("TENSACON S.A.", margin, headerTopY + 7);
  }

  // Separador vertical discreto y área emisora
  const sepX = margin + logoWidth + 3.5;
  doc.setDrawColor(203, 213, 225); // Slate 300
  doc.setLineWidth(0.4);
  doc.line(sepX, headerTopY + 0.5, sepX, headerTopY + logoHeight - 0.5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105); // Slate 600
  doc.text("Gerencia de Administración y Finanzas", sepX + 3.5, headerTopY + 4);

  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 41, 59); // Slate 800
  doc.text("Departamento de Tesorería & Pagos a Proveedores", sepX + 3.5, headerTopY + 8);

  // B. Lado Derecho: Tarjeta de Control con borde gris redondeado
  const badgeWidth = 58;
  const badgeHeight = 7.5;
  const badgeX = pageWidth - margin - badgeWidth;
  const badgeY = headerTopY;

  doc.setFillColor(248, 250, 252); // Slate 50
  doc.setDrawColor(226, 232, 240); // Slate 200
  doc.roundedRect(badgeX, badgeY, badgeWidth, badgeHeight, 1.5, 1.5, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.8);
  doc.setTextColor(71, 85, 105); // Slate 600
  doc.text("CÓDIGO DE CONTROL: ", badgeX + 3, badgeY + 5);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.8);
  doc.setTextColor(224, 90, 16); // Naranja corporativo #E05A10
  doc.text(codigoCorrelativo, badgeX + 33, badgeY + 5);

  // Fecha y hora de emisión (DD-MM-AAAA, HH:mm hrs · Santiago de Chile)
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const fechaStr = `${pad(now.getDate())}-${pad(now.getMonth() + 1)}-${now.getFullYear()}`;
  const horaStr = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const fechaCompleta = `Fecha: ${fechaStr}, ${horaStr} hrs · Santiago de Chile`;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139); // Slate 500
  doc.text(fechaCompleta, pageWidth - margin, headerTopY + 11.5, { align: "right" });

  // C. Título Principal del Documento (Mayúsculas, negrita oscura)
  const titleY = headerTopY + logoHeight + 6;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(15, 23, 42); // Slate 900
  doc.text("REPORTE OFICIAL DE COMPROMISOS Y OBLIGACIONES FINANCIERAS", margin, titleY);

  // Subtítulo con período o filtro aplicado
  const subText = rangoFechas
    ? `${semanaLabel} (${rangoFechas})`
    : semanaLabel;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105); // Slate 600
  doc.text(`Período Seleccionado: ${subText}`, margin, titleY + 4.5);

  // D. Línea divisoria inferior sutil gris debajo del encabezado
  const dividerY = titleY + 8;
  doc.setDrawColor(203, 213, 225); // Slate 300
  doc.setLineWidth(0.4);
  doc.line(margin, dividerY, pageWidth - margin, dividerY);

  // =========================================================================
  // 2. TABLA DETALLADA DE OBLIGACIONES (ESTÁNDAR TENSACON)
  // =========================================================================
  const tableData = compromisos.map((c) => [
    c.modalidad,
    c.razon_social,
    formatRutDisplay(c.rut_proveedor),
    c.referencia_doc || "—",
    formatDateCL(c.fecha_vencimiento),
    c.dias_faltantes !== undefined
      ? c.dias_faltantes > 0
        ? `${c.dias_faltantes} d`
        : c.dias_faltantes === 0
        ? "Hoy"
        : `${Math.abs(c.dias_faltantes)}d venc`
      : "—",
    formatCLP(c.monto),
  ]);

  autoTable(doc, {
    startY: dividerY + 4,
    head: [
      [
        "MODALIDAD",
        "PROVEEDOR / ENTIDAD",
        "RUT PROVEEDOR",
        "DOC / REF",
        "VENCIMIENTO",
        "PLAZO / DÍAS",
        "MONTO ($ CLP)",
      ],
    ],
    body:
      tableData.length > 0
        ? tableData
        : [
            [
              "—",
              "No se registran compromisos para la selección actual",
              "—",
              "—",
              "—",
              "—",
              "$0",
            ],
          ],
    theme: "grid",
    headStyles: {
      fillColor: [15, 23, 42], // Fondo azul pizarra muy oscuro bg-[#0F172A]
      textColor: [255, 255, 255],
      fontSize: 7.5,
      fontStyle: "bold",
      halign: "left",
    },
    bodyStyles: {
      fontSize: 7.2,
      textColor: [30, 41, 59], // Slate 800
      cellPadding: 2,
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252], // Slate 50
    },
    columnStyles: {
      0: { cellWidth: 22, fontStyle: "bold" },
      1: { cellWidth: "auto" },
      2: { cellWidth: 24, fontStyle: "normal" },
      3: { cellWidth: 24 },
      4: { cellWidth: 20 },
      5: { cellWidth: 18, halign: "center" },
      6: { cellWidth: 22, halign: "right", fontStyle: "bold" },
    },
    tableWidth: contentWidth,
    margin: { left: margin, right: margin },
    styles: {
      overflow: "linebreak",
      lineColor: [226, 232, 240], // Slate 200
      lineWidth: 0.2,
    },
  });

  // =========================================================================
  // 3. BLOQUE RESUMEN DE TOTALES POR MODALIDAD & GRAN TOTAL
  // =========================================================================
  // @ts-expect-error autoTable adds lastAutoTable to jsPDF instance
  const finalY = doc.lastAutoTable ? doc.lastAutoTable.finalY + 6 : 130;

  // Si no cabe el bloque completo de totales (36mm) + firmas (28mm) en la página actual, agregar nueva página
  let currentY = finalY;
  if (currentY + 68 > pageHeight - 12) {
    doc.addPage();
    currentY = 16;
  }

  // Tarjeta de Resumen de Totales
  doc.setFillColor(248, 250, 252); // Slate 50
  doc.roundedRect(margin, currentY, contentWidth, 36, 1.5, 1.5, "F");
  doc.setDrawColor(226, 232, 240); // Slate 200
  doc.roundedRect(margin, currentY, contentWidth, 36, 1.5, 1.5, "D");

  // Título del resumen
  doc.setTextColor(15, 23, 42); // Slate 900
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.text("RESUMEN CONSOLIDADO DE COMPROMISOS POR MODALIDAD", margin + 4, currentY + 6);

  // 3 Columnas de Modalidad
  const colWidth = (contentWidth - 8) / 3;

  // Total Cheques
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139); // Slate 500
  doc.text("Total Cheques Pendientes:", margin + 4, currentY + 12);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(126, 34, 206); // Purple 700
  doc.text(formatCLP(totales.totalCheques), margin + 4, currentY + 17);

  // Total Factoring
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139); // Slate 500
  doc.text("Total Factoring Proveedores:", margin + 4 + colWidth, currentY + 12);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(29, 78, 216); // Blue 700
  doc.text(formatCLP(totales.totalFactoring), margin + 4 + colWidth, currentY + 17);

  // Total Confirming
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139); // Slate 500
  doc.text("Total Confirming Bancario:", margin + 4 + colWidth * 2, currentY + 12);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(180, 83, 9); // Amber 700
  doc.text(formatCLP(totales.totalConfirming), margin + 4 + colWidth * 2, currentY + 17);

  // Tarjeta de Gran Total (Highlight) - Recuadro sólido en color azul oscuro corporativo bg-[#0F172A]
  const granTotalBoxY = currentY + 22;
  const granTotalBoxHeight = 10;
  doc.setFillColor(15, 23, 42); // #0F172A
  doc.roundedRect(margin + 3, granTotalBoxY, contentWidth - 6, granTotalBoxHeight, 1.2, 1.2, "F");

  doc.setTextColor(234, 88, 12); // Naranja corporativo #EA580C
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.text("GRAN TOTAL COMPROMISOS SECTOR COMPRAS", margin + 7, granTotalBoxY + 6.5);

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.text(formatCLP(totales.granTotal), pageWidth - margin - 7, granTotalBoxY + 6.5, { align: "right" });

  // =========================================================================
  // 4. SECCIÓN DE FIRMAS AL PIE DE PÁGINA (DIRECTOR DE FINANZAS)
  // =========================================================================
  const sigY = currentY + 42;

  // Lado Izquierdo: Nota al pie informativa
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(51, 65, 85); // Slate 700
  doc.text("Validación y Control de Egresos:", margin, sigY + 3);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.8);
  doc.setTextColor(100, 116, 139); // Slate 500
  const notaTexto =
    "Este informe consolida las obligaciones de pago programadas y vigentes en el sistema FINANZAS CORE Tensacon para la programación de flujo de caja y egresos bancarios.";
  const notaLineas = doc.splitTextToSize(notaTexto, 90);
  doc.text(notaLineas, margin, sigY + 7);

  // Lado Derecho: Apartado Firma Director de Finanzas
  const sigWidth = 72;
  const sigX = pageWidth - margin - sigWidth;

  // Línea continua para firma física o estampilla digital
  doc.setDrawColor(148, 163, 184); // Slate 400
  doc.setLineWidth(0.4);
  doc.line(sigX, sigY + 12, sigX + sigWidth, sigY + 12);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42); // Slate 900
  doc.text("DIRECTOR DE FINANZAS", sigX + sigWidth / 2, sigY + 16, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.8);
  doc.setTextColor(71, 85, 105); // Slate 600
  doc.text("TENSACON S.A. — Gerencia de Administración y Finanzas", sigX + sigWidth / 2, sigY + 19.5, { align: "center" });

  doc.setFontSize(6.2);
  doc.setTextColor(148, 163, 184); // Slate 400
  doc.text("Aprobación de Flujo y Compromisos Semanales", sigX + sigWidth / 2, sigY + 22.5, { align: "center" });

  // =========================================================================
  // 5. PIE DE PÁGINA EN TODAS LAS HOJAS
  // =========================================================================
  // @ts-expect-error getNumberOfPages is provided by jsPDF
  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.8);
    doc.setTextColor(148, 163, 184); // Slate 400
    doc.text(
      `Página ${i} de ${totalPages} · Sistema Finanzas Tensacon · Documento Confidencial de Uso Interno · Control: ${codigoCorrelativo}`,
      margin,
      pageHeight - 6
    );
  }

  // Descarga automática del archivo PDF
  const cleanSemana = semanaLabel.replace(/[^a-zA-Z0-9_-]/g, "_");
  const fechaHoy = new Date().toISOString().slice(0, 10);
  doc.save(`Reporte_Compromisos_${cleanSemana}_${fechaHoy}.pdf`);
}
