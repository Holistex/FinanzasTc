import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { formatCLP, formatDateCL, formatRutDisplay } from "@/lib/utils";
import { LOGO_TENSACON_BASE64, LOGO_TENSACON_RATIO } from "./logo-tensacon";

export interface FacturaCobranzaCriticaItem {
  id: string;
  folio: number;
  tipo_doc: number;
  fecha_docto: string;
  fecha_vencimiento: string;
  diasRestantes: number;
  estadoVencimiento: "PROXIMA_A_VENCER" | "FACTURA_VENCIDA";
  monto_total: number;
  saldo_pendiente: number;
}

export interface GenerateCartaCobranzaPdfOptions {
  cliente: {
    rut: string;
    razonSocial: string;
    contacto?: string;
    email?: string;
  };
  facturas: FacturaCobranzaCriticaItem[];
  totales: {
    totalProximasVencer: number;
    totalVencidas: number;
    granTotal: number;
    cantidadProximasVencer: number;
    cantidadVencidas: number;
  };
  correlativo?: string;
}

/**
 * Genera y descarga la Carta Ejecutiva Formal de Cobranza en PDF
 */
export function exportCartaCobranzaToPdf({
  cliente,
  facturas,
  totales,
  correlativo,
}: GenerateCartaCobranzaPdfOptions): void {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;

  const codigoCorrelativo =
    correlativo ||
    `COB-${new Date().getFullYear()}-${String(
      Math.floor(1000 + Math.random() * 9000)
    )}`;

  // 1. Encabezado Corporativo Oficial Tensacon (Estándar Blanco / Institucional)
  const headerTopY = 10;
  const logoHeight = 9.5;
  const logoWidth = logoHeight * LOGO_TENSACON_RATIO; // ~40.06 mm

  // A. Logo Oficial Tensacon S.A.
  try {
    doc.addImage(LOGO_TENSACON_BASE64, "PNG", margin, headerTopY, logoWidth, logoHeight);
  } catch {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(224, 90, 16);
    doc.text("TENSACON S.A.", margin, headerTopY + 7);
  }

  // Separador vertical discreto y departamento
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
  doc.text("Departamento de Cobranzas y Tesorería", sepX + 3.5, headerTopY + 8);

  // B. Lado Derecho: Código de Control & Fecha / Hora de Emisión
  // Badge sutil para Código de Control
  const badgeWidth = 56;
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
  doc.setTextColor(224, 90, 16); // Orange Tensacon #E05A10
  doc.text(codigoCorrelativo, badgeX + 33, badgeY + 5);

  // Fecha y hora de emisión (DD-MM-YYYY, HH:mm hrs · Santiago de Chile)
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const fechaStr = `${pad(now.getDate())}-${pad(now.getMonth() + 1)}-${now.getFullYear()}`;
  const horaStr = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const fechaCompleta = `Fecha: ${fechaStr}, ${horaStr} hrs · Santiago de Chile`;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139); // Slate 500
  doc.text(fechaCompleta, pageWidth - margin, headerTopY + 11.5, { align: "right" });

  // C. Título del Documento en mayúsculas, negrita y jerarquía destacada
  const titleY = headerTopY + logoHeight + 6;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42); // Slate 900
  doc.text(
    "COMUNICADO FORMAL DE ESTADO DE CUENTA Y REGULARIZACIÓN DE CARTERA",
    margin,
    titleY
  );

  // D. Línea divisoria gris elegante (border-b border-slate-300) debajo del encabezado
  const dividerY = titleY + 3.5;
  doc.setDrawColor(203, 213, 225); // Slate 300 (#cbd5e1)
  doc.setLineWidth(0.4);
  doc.line(margin, dividerY, pageWidth - margin, dividerY);

  // 2. Antecedentes del Destinatario
  let currentY = dividerY + 5;

  doc.setFillColor(248, 250, 252); // Slate 50
  doc.setDrawColor(226, 232, 240); // Slate 200
  doc.roundedRect(margin, currentY, contentWidth, 23, 2, 2, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139); // Slate 500
  doc.text("DESTINATARIO / RAZÓN SOCIAL:", margin + 3.5, currentY + 5.5);
  doc.text("R.U.T. CLIENTE:", margin + 3.5, currentY + 11.5);
  doc.text("ATENCIÓN:", margin + 3.5, currentY + 17.5);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42); // Slate 900
  doc.text(cliente.razonSocial.toUpperCase(), margin + 52, currentY + 5.5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.text(formatRutDisplay(cliente.rut), margin + 52, currentY + 11.5);

  doc.setFont("helvetica", "bold");
  doc.setTextColor(224, 90, 16); // Orange Tensacon
  doc.text("Área de Cuentas por Pagar / Gerencia de Tesorería", margin + 52, currentY + 17.5);

  currentY += 28;

  // 3. Cuerpo del Comunicado Formal
  doc.setTextColor(30, 41, 59);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);

  const cuerpoTexto =
    "Junto con saludarle cordialmente, nos dirigimos a ustedes para presentar el estado actualizado de su cartera de compromisos pendientes con nuestra compañía. A través del presente documento, solicitamos la revisión y programación de pago para las facturas que se encuentran próximas a vencer (dentro de los próximos 10 días corridos), así como la regularización e ingreso urgente de los valores correspondientes a los documentos con fecha de vencimiento superada a la fecha.";

  const lineasCuerpo = doc.splitTextToSize(cuerpoTexto, contentWidth);
  doc.text(lineasCuerpo, margin, currentY);

  currentY += lineasCuerpo.length * 4.2 + 3;

  // 4. Tabla Detallada de Facturas Críticas
  const tableData = facturas.map((f) => {
    const estadoLabel =
      f.estadoVencimiento === "FACTURA_VENCIDA"
        ? "Factura Vencida"
        : "Próxima a vencer";

    const diasLabel =
      f.diasRestantes < 0
        ? `${Math.abs(f.diasRestantes)}d mora`
        : f.diasRestantes === 0
        ? "Vence Hoy"
        : `${f.diasRestantes}d por vencer`;

    return [
      `#${f.folio} (DTE ${f.tipo_doc})`,
      formatDateCL(f.fecha_docto),
      formatDateCL(f.fecha_vencimiento),
      diasLabel,
      estadoLabel,
      formatCLP(f.saldo_pendiente),
    ];
  });

  autoTable(doc, {
    startY: currentY,
    head: [
      [
        "FOLIO / DTE",
        "EMISIÓN",
        "VENCIMIENTO",
        "PLAZO / MORA",
        "ESTADO DOCUMENTO",
        "SALDO PENDIENTE",
      ],
    ],
    body:
      tableData.length > 0
        ? tableData
        : [["—", "—", "—", "—", "Sin facturas críticas registradas", "$0"]],
    theme: "grid",
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontSize: 7.5,
      fontStyle: "bold",
      halign: "left",
    },
    bodyStyles: {
      fontSize: 7.5,
      textColor: [30, 41, 59],
      cellPadding: 2,
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: {
      0: { cellWidth: 32, fontStyle: "bold" },
      1: { cellWidth: 24 },
      2: { cellWidth: 24 },
      3: { cellWidth: 30, halign: "center", fontStyle: "bold" },
      4: { cellWidth: 38, halign: "center", fontStyle: "bold" },
      5: { cellWidth: 34, halign: "right", fontStyle: "bold" },
    },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 4) {
        const val = String(data.cell.raw);
        if (val === "Factura Vencida") {
          data.cell.styles.textColor = [190, 18, 60]; // Rose 700
          data.cell.styles.fillColor = [255, 241, 242]; // Rose 50
        } else if (val === "Próxima a vencer") {
          data.cell.styles.textColor = [194, 65, 12]; // Amber/Orange 700
          data.cell.styles.fillColor = [254, 243, 199]; // Amber 100
        }
      }
    },
    styles: {
      overflow: "linebreak",
    },
  });

  // 5. Cuadro de Totales Exigibles
  // @ts-expect-error autoTable adds lastAutoTable to jsPDF instance
  const finalY = doc.lastAutoTable ? doc.lastAutoTable.finalY + 6 : currentY + 60;

  let totalsY = finalY;
  // Si no cabe con cuadro bancario y firma, agregar nueva página
  if (totalsY + 70 > pageHeight - 15) {
    doc.addPage();
    totalsY = 16;
  }

  // Tarjeta de Totales Exigibles
  doc.setFillColor(241, 245, 249); // Slate 100
  doc.setDrawColor(203, 213, 225); // Slate 300
  doc.roundedRect(margin, totalsY, contentWidth, 24, 2, 2, "FD");

  // Columna 1: Próximas a vencer
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `PRÓXIMAS A VENCER (${totales.cantidadProximasVencer} docs):`,
    margin + 4,
    totalsY + 6.5
  );
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(194, 65, 12); // Amber 700
  doc.text(formatCLP(totales.totalProximasVencer), margin + 4, totalsY + 13);

  // Columna 2: Vencidas Exigibles
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `FACTURAS VENCIDAS (${totales.cantidadVencidas} docs):`,
    margin + 62,
    totalsY + 6.5
  );
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(190, 18, 60); // Rose 700
  doc.text(formatCLP(totales.totalVencidas), margin + 62, totalsY + 13);

  // Columna 3: Gran Total Destacado
  doc.setFillColor(15, 23, 42); // Slate 900
  doc.roundedRect(margin + 118, totalsY + 3, contentWidth - 122, 18, 1.5, 1.5, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(251, 146, 60); // Orange 400
  doc.text("TOTAL COMPROMISO EXIGIBLE", margin + 122, totalsY + 8.5);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(255, 255, 255);
  doc.text(formatCLP(totales.granTotal), margin + 122, totalsY + 16.5);

  totalsY += 28;

  // 6. Datos de Pago y Notificación (Transferencia)
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(margin, totalsY, contentWidth, 24, 1.5, 1.5, "FD");

  // Barra lateral naranja decorativa
  doc.setFillColor(224, 90, 16);
  doc.rect(margin, totalsY, 2.5, 24, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  doc.text("DATOS PARA TRANSFERENCIA ELECTRÓNICA Y REGULARIZACIÓN:", margin + 5, totalsY + 5.5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(51, 65, 85);
  doc.text("• Banco: Banco de Chile", margin + 5, totalsY + 11);
  doc.text("• Tipo de Cuenta: Cuenta Corriente", margin + 5, totalsY + 16);
  doc.text("• N° Cuenta: 00-123-45678-90", margin + 5, totalsY + 21);

  doc.text("• Titular / Razón Social: TENSACON S.A.", margin + 70, totalsY + 11);
  doc.text("• R.U.T.: 99.510.510-1", margin + 70, totalsY + 16);
  doc.text("• Envío de Comprobantes: cobranzas@tensacon.cl / tesoreria@tensacon.cl", margin + 70, totalsY + 21);

  totalsY += 28;

  // 7. Pie de Firma Formal
  doc.setTextColor(71, 85, 105);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.text(
    "Agradecemos de antemano su gestión para la oportuna regularización de estos valores.",
    margin,
    totalsY + 2
  );

  doc.setDrawColor(148, 163, 184); // Slate 400
  doc.line(pageWidth - 75, totalsY + 16, pageWidth - margin, totalsY + 16);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  doc.text("Gerencia de Administración y Finanzas", pageWidth - 75, totalsY + 20);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text("TENSACON S.A. — Área de Crédito y Cobranzas", pageWidth - 75, totalsY + 24);

  // 8. Pie de página en todas las páginas
  // @ts-expect-error getNumberOfPages is provided by jsPDF
  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `Página ${i} de ${totalPages} · Documento emitido por Sistema Finanzas Tensacon · Código: ${codigoCorrelativo}`,
      margin,
      pageHeight - 6
    );
  }

  // Descarga automática del archivo PDF
  const cleanNombreCliente = cliente.razonSocial
    .replace(/[^a-zA-Z0-9]/g, "_")
    .substring(0, 30);
  const fechaHoy = new Date().toISOString().slice(0, 10);
  doc.save(`Carta_Cobranza_${cleanNombreCliente}_${fechaHoy}.pdf`);
}
