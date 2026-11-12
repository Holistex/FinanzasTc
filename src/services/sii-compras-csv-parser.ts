import Papa from "papaparse";
import { normalizeRut } from "@/lib/utils";
import { EstadoFacturaCompra, CondicionPago } from "@/types/database.types";

export interface SiiCompraParsedRow {
  nro: number;
  tipo_doc: number;
  tipo_compra: string;
  rut_proveedor: string;
  razon_social: string;
  folio: number;
  fecha_docto: string; // YYYY-MM-DD
  fecha_vencimiento: string; // YYYY-MM-DD (fecha_docto + 30 días)
  fecha_recepcion?: string | null; // YYYY-MM-DD (Columna H SII)
  fecha_acuse_recibo?: string | null; // YYYY-MM-DD (Columna I SII)
  condicion_pago: CondicionPago; // CONTADO o CREDITO
  monto_total: number;
  monto_saldo: number;
  estado: EstadoFacturaCompra;
  fila_origen: number;
}

export interface SiiComprasValidationSummary {
  totalFilasLeidas: number;
  filasDescartadasSinNro: number;
  nuevasAInyectar: SiiCompraParsedRow[];
  totalContado: number;
  totalCredito: number;
  omitidasPorDuplicidad: Array<{
    rut_proveedor: string;
    folio: number;
    razon_social: string;
    tipo_doc: number;
    monto_total: number;
    motivo: "EXISTE_EN_BD" | "DUPLICADO_EN_CSV";
  }>;
  erroresFormato: Array<{
    fila: number;
    mensaje: string;
  }>;
}

/**
 * Normaliza fechas provenientes del Registro de Compras SII (DD/MM/YYYY o YYYY-MM-DD) a ISO YYYY-MM-DD
 */
function parseSiiDate(rawDate: string): string | null {
  if (!rawDate) return null;
  const trimmed = rawDate.trim().split(" ")[0];

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  const matchDMY = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (matchDMY) {
    const day = matchDMY[1].padStart(2, "0");
    const month = matchDMY[2].padStart(2, "0");
    const year = matchDMY[3];
    return `${year}-${month}-${day}`;
  }

  return null;
}

/**
 * Suma 30 días a una fecha ISO (YYYY-MM-DD)
 */
function add30Days(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dateObj = new Date(y, (m || 1) - 1, d || 1);
  dateObj.setDate(dateObj.getDate() + 30);
  const vy = dateObj.getFullYear();
  const vm = String(dateObj.getMonth() + 1).padStart(2, "0");
  const vd = String(dateObj.getDate()).padStart(2, "0");
  return `${vy}-${vm}-${vd}`;
}

/**
 * Limpia montos numéricos chilenos
 */
function parseSiiNumber(rawVal: string | undefined | null): number {
  if (!rawVal) return 0;
  const cleaned = rawVal
    .toString()
    .replace(/\$/g, "")
    .replace(/\./g, "")
    .replace(/,/g, ".")
    .trim();
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : Math.round(parsed);
}

/**
 * Sanitiza cadenas de texto provenientes de CSVs del SII (resuelve problemas de encoding ISO-8859-1 / Windows-1252 y mojibake)
 */
export function sanitizeSiiText(text: string | null | undefined): string {
  if (!text) return "";
  let s = text.trim();

  // Reemplazar patrones clásicos de mojibake producidos por doble encoding o confusión UTF8 <-> Windows-1252
  s = s
    .replace(/INGENIERÃžA/gi, "INGENIERÍA")
    .replace(/ELÃ%oCTRICOS/gi, "ELÉCTRICOS")
    .replace(/Ãž/g, "Í")
    .replace(/Ã%o/g, "É")
    .replace(/Ã‘/g, "Ñ")
    .replace(/Ã±/g, "ñ")
    .replace(/Ã¡/g, "á")
    .replace(/Ã©/g, "é")
    .replace(/Ã­/g, "í")
    .replace(/Ã³/g, "ó")
    .replace(/Ãº/g, "ú")
    .replace(/Ã/g, "Á")
    .replace(/Ã‰/g, "É")
    .replace(/Ã/g, "Í")
    .replace(/Ã“/g, "Ó")
    .replace(/Ãš/g, "Ú")
    .replace(/Ã¼/g, "ü")
    .replace(/Ãœ/g, "Ü")
    .replace(/Â/g, "");

  // Si aún quedan secuencias tipo UTF-8 leído como latin1:
  try {
    if (/[\u00C0-\u00DF][\u0080-\u00BF]/.test(s)) {
      const bytes = new Uint8Array(s.length);
      for (let i = 0; i < s.length; i++) {
        bytes[i] = s.charCodeAt(i) & 0xff;
      }
      const recovered = new TextDecoder("utf-8").decode(bytes);
      if (!recovered.includes("\uFFFD")) {
        s = recovered;
      }
    }
  } catch {
    // Si falla, mantenemos el string procesado
  }

  // Normalización limpia Unicode estándar NFC
  return s.normalize("NFC").replace(/\s+/g, " ");
}

/**
 * Parsea y valida el contenido de un CSV de Registro de Compras del SII (RCV_COMPRA_REGISTRO_*.csv)
 */
export function parseAndValidateComprasCsv(
  csvContent: string,
  existingKeys: Set<string>,
  fechaReferencia: Date = new Date()
): SiiComprasValidationSummary {
  // 1. Limpieza de BOM UTF-8
  const cleanContent = csvContent.replace(/^\uFEFF/, "").trim();

  // 2. Parseo universal con PapaParse
  const parsed = Papa.parse<string[]>(cleanContent, {
    header: false,
    skipEmptyLines: true,
  });

  const allRows = parsed.data.filter((r) => r.length > 1);
  if (allRows.length === 0) {
    return {
      totalFilasLeidas: 0,
      filasDescartadasSinNro: 0,
      nuevasAInyectar: [],
      totalContado: 0,
      totalCredito: 0,
      omitidasPorDuplicidad: [],
      erroresFormato: [{ fila: 0, mensaje: "El archivo CSV está vacío." }],
    };
  }

  // Identificar fila de cabecera
  let headerIndex = 0;
  for (let i = 0; i < Math.min(10, allRows.length); i++) {
    const rowStr = allRows[i].join(" ").toLowerCase();
    if (
      (rowStr.includes("tipo doc") || rowStr.includes("tipo docto")) &&
      (rowStr.includes("rut proveedor") || rowStr.includes("razon social"))
    ) {
      headerIndex = i;
      break;
    }
  }

  const headerRow = allRows[headerIndex].map((h) =>
    (h || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
  );

  const findIdx = (patterns: string[], fallback: number): number => {
    const idx = headerRow.findIndex((h) =>
      patterns.some((p) => h === p || h.includes(p))
    );
    return idx !== -1 ? idx : fallback;
  };

  const nroIdx = findIdx(["nro", "numero", "num"], 0);
  const tipoDocIdx = findIdx(["tipo doc", "tipodoc"], 1);
  const tipoCompraIdx = findIdx(["tipo compra", "tipocompra"], 2);
  const rutProvIdx = findIdx(["rut proveedor", "rut emisor", "rut"], 3);
  const razonSocialIdx = findIdx(["razon social", "razon_social"], 4);
  const folioIdx = findIdx(["folio"], 5);
  const fechaDoctoIdx = findIdx(["fecha docto", "fecha documento", "fecha emision"], 6);
  const fechaRecepcionIdx = findIdx(["fecha recepcion", "fecharecepcion", "recepcion"], 7);
  const fechaAcuseReciboIdx = findIdx(["fecha acuse recibo", "fecha acuse", "acuse recibo", "acuse"], 8);
  const montoTotalIdx = findIdx(["monto total", "total"], 14);

  const dataRows = allRows.slice(headerIndex + 1);

  const nuevasAInyectar: SiiCompraParsedRow[] = [];
  const omitidasPorDuplicidad: SiiComprasValidationSummary["omitidasPorDuplicidad"] = [];
  const erroresFormato: SiiComprasValidationSummary["erroresFormato"] = [];
  const seenInCsv = new Set<string>();

  let filasDescartadasSinNro = 0;

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const filaReal = headerIndex + 2 + i;

    // Regla 1: Omitir y descartar automáticamente cualquier fila donde 'Nro' esté vacía o nula
    const rawNro = row[nroIdx]?.trim();
    if (!rawNro || isNaN(parseInt(rawNro, 10))) {
      filasDescartadasSinNro += 1;
      continue;
    }

    const nro = parseInt(rawNro, 10);

    // Tipo Doc
    const rawTipoDoc = row[tipoDocIdx]?.trim();
    const tipoDoc = parseInt(rawTipoDoc, 10);
    if (isNaN(tipoDoc)) {
      erroresFormato.push({
        fila: filaReal,
        mensaje: `Tipo de documento inválido: "${rawTipoDoc}"`,
      });
      continue;
    }

    // RUT Proveedor
    const rawRut = row[rutProvIdx]?.trim() || "";
    const cleanRut = normalizeRut(rawRut);
    if (!cleanRut) {
      erroresFormato.push({
        fila: filaReal,
        mensaje: `RUT de proveedor vacío o inválido en columna ${rutProvIdx + 1}.`,
      });
      continue;
    }

    // Folio
    const rawFolio = row[folioIdx]?.trim() || "";
    const folio = parseInt(rawFolio.replace(/\D/g, ""), 10);
    if (isNaN(folio) || folio <= 0) {
      erroresFormato.push({
        fila: filaReal,
        mensaje: `Folio inválido: "${rawFolio}" en fila ${filaReal}.`,
      });
      continue;
    }

    // Razón Social (Sanitizada con soporte para Ñ, acentos y encoding SII)
    const rawRazon = row[razonSocialIdx]?.trim() || `Proveedor ${cleanRut}`;
    const razonSocial = sanitizeSiiText(rawRazon);

    // Tipo Compra
    const rawTipoCompra = row[tipoCompraIdx]?.trim() || "Del Giro";
    const tipoCompra = sanitizeSiiText(rawTipoCompra);

    // Fecha Docto
    const rawFechaDocto = row[fechaDoctoIdx]?.trim() || "";
    const parsedFechaDocto = parseSiiDate(rawFechaDocto);
    if (!parsedFechaDocto) {
      erroresFormato.push({
        fila: filaReal,
        mensaje: `Fecha de documento no reconocible: "${rawFechaDocto}"`,
      });
      continue;
    }

    // Fecha Recepción (Columna H SII)
    const rawFechaRecepcion = row[fechaRecepcionIdx]?.trim() || "";
    const parsedFechaRecepcion = parseSiiDate(rawFechaRecepcion);

    // Fecha Acuse Recibo (Columna I SII)
    const rawFechaAcuse = row[fechaAcuseReciboIdx]?.trim() || "";
    const parsedFechaAcuse = parseSiiDate(rawFechaAcuse);

    // Fecha Vencimiento = Fecha Docto + 30 días
    const fechaVencimiento = add30Days(parsedFechaDocto);

    // Monto Total
    const rawMontoTotal = row[montoTotalIdx]?.trim() || "0";
    const montoTotal = parseSiiNumber(rawMontoTotal);

    // Por defecto, toda factura cargada desde el CSV SII general se asigna con condicion_pago = 'CREDITO'
    const condicionPago: CondicionPago = "CREDITO";
    const montoSaldo = tipoDoc === 61 ? 0 : montoTotal;

    // Composite Unique Key: RUT Proveedor + Folio
    const compositeKey = `${cleanRut}_${folio}`;

    // Verificación de duplicidad en BD
    if (existingKeys.has(compositeKey)) {
      omitidasPorDuplicidad.push({
        rut_proveedor: cleanRut,
        folio,
        razon_social: razonSocial,
        tipo_doc: tipoDoc,
        monto_total: montoTotal,
        motivo: "EXISTE_EN_BD",
      });
      continue;
    }

    // Verificación de duplicidad dentro del mismo CSV
    if (seenInCsv.has(compositeKey)) {
      omitidasPorDuplicidad.push({
        rut_proveedor: cleanRut,
        folio,
        razon_social: razonSocial,
        tipo_doc: tipoDoc,
        monto_total: montoTotal,
        motivo: "DUPLICADO_EN_CSV",
      });
      continue;
    }

    seenInCsv.add(compositeKey);

    nuevasAInyectar.push({
      nro,
      tipo_doc: tipoDoc,
      tipo_compra: tipoCompra,
      rut_proveedor: cleanRut,
      razon_social: razonSocial,
      folio,
      fecha_docto: parsedFechaDocto,
      fecha_vencimiento: fechaVencimiento,
      fecha_recepcion: parsedFechaRecepcion,
      fecha_acuse_recibo: parsedFechaAcuse,
      condicion_pago: condicionPago,
      monto_total: montoTotal,
      monto_saldo: montoSaldo,
      estado: "DEUDA_PROVEEDOR",
      fila_origen: filaReal,
    });
  }

  const totalContado = nuevasAInyectar.filter((r) => r.condicion_pago === "CONTADO").length;
  const totalCredito = nuevasAInyectar.filter((r) => r.condicion_pago === "CREDITO").length;

  return {
    totalFilasLeidas: dataRows.length,
    filasDescartadasSinNro,
    nuevasAInyectar,
    totalContado,
    totalCredito,
    omitidasPorDuplicidad,
    erroresFormato,
  };
}
