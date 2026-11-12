import Papa from "papaparse";
import {
  FacturaVenta,
  SiiCsvCreditNoteNettingDetail,
  SiiCsvParsedRow,
  SiiCsvValidationSummary,
} from "@/types/database.types";
import { normalizeRut } from "@/lib/utils";

/**
 * Índices oficiales del archivo CSV del Libro de Ventas del SII Chile (0-based):
 * Col A (0): Nro
 * Col B (1): Tipo Doc (Ej: 33, 34, 61 — Se excluye explícitamente DTE 46 Factura de Compra)
 * Col C (2): Tipo Venta
 * Col D (3): RUT Cliente
 * Col E (4): Razon Social
 * Col F (5): Folio
 * Col G (6): Fecha Docto
 * ...
 * Col N (13): Monto Total
 * ...
 * Col Y (24): Tipo Docto. Referencia
 * Col Z (25): Folio Docto. Referencia
 */
const SII_COL_INDEX = {
  TIPO_DOC: 1, // Columna B
  RUT_CLIENTE: 3, // Columna D
  RAZON_SOCIAL: 4, // Columna E
  FOLIO: 5, // Columna F
  FECHA_DOCTO: 6, // Columna G
  MONTO_TOTAL: 13, // Columna N
  TIPO_DOCTO_REF: 24, // Columna Y
  FOLIO_DOCTO_REF: 25, // Columna Z
} as const;

/**
 * Tipos de documentos excluidos del Libro de Ventas:
 * 46 = Factura de Compra Electrónica (no corresponde a cuentas por cobrar de ventas)
 */
export const EXCLUDED_DTE_TYPES = new Set<number>([46]);

/**
 * Normaliza fechas provenientes del SII (DD/MM/YYYY, DD-MM-YYYY o YYYY-MM-DD) a ISO YYYY-MM-DD
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
 * Limpia montos numéricos chilenos (ej: "$ 126.827.164" o "126827164")
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
 * Detecta índices de columnas dinámicamente por nombre de cabecera SII o usa las posiciones oficiales SII (B, D, E, F, G, N, Y, Z)
 */
function resolveColumnMapping(headerRow: string[]) {
  const normalizedHeaders = headerRow.map((h) =>
    (h || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
  );

  const findIdx = (patterns: string[], fallbackIndex: number): number => {
    const idx = normalizedHeaders.findIndex((h) =>
      patterns.some((p) => h === p || h.includes(p))
    );
    if (idx !== -1) return idx;
    return fallbackIndex;
  };

  return {
    tipoDocIdx: findIdx(["tipo doc", "tipo_doc", "tipodoc"], SII_COL_INDEX.TIPO_DOC),
    rutClienteIdx: findIdx(
      ["rut cliente", "rut_cliente", "rut receptor"],
      SII_COL_INDEX.RUT_CLIENTE
    ),
    razonSocialIdx: findIdx(
      ["razon social", "razon_social"],
      SII_COL_INDEX.RAZON_SOCIAL
    ),
    folioIdx: findIdx(["folio"], SII_COL_INDEX.FOLIO),
    fechaDoctoIdx: findIdx(
      ["fecha docto", "fecha_docto", "fecha emision"],
      SII_COL_INDEX.FECHA_DOCTO
    ),
    montoTotalIdx: findIdx(
      ["monto total", "monto_total", "total"],
      SII_COL_INDEX.MONTO_TOTAL
    ),
    tipoDoctoRefIdx: findIdx(
      ["tipo docto. referencia", "tipo docto referencia", "tipo_docto_ref"],
      SII_COL_INDEX.TIPO_DOCTO_REF
    ),
    folioDoctoRefIdx: findIdx(
      ["folio docto. referencia", "folio docto referencia", "folio_docto_ref"],
      SII_COL_INDEX.FOLIO_DOCTO_REF
    ),
  };
}

/**
 * Parsea el contenido CSV del Libro de Ventas del SII y ejecuta:
 * 1. Exclusión automática de DTE Tipo 46 (Facturas de Compra).
 * 2. Validación de estructura y tipos de datos.
 * 3. Deduplicación por llave única compuesta (rut_cliente + folio) contra BD existente y dentro del mismo CSV.
 * 4. Regla de Neteo de Notas de Crédito (tipo_doc == 61) contra facturas referenciadas (folio_docto_ref + rut_cliente).
 */
export function parseAndValidateSiiCsv(
  csvText: string,
  existingFacturas: Pick<
    FacturaVenta,
    "rut_cliente" | "folio" | "monto_total" | "monto_neto_saldo" | "tipo_doc"
  >[]
): SiiCsvValidationSummary {
  const result = Papa.parse<string[]>(csvText.trim(), {
    delimiter: "",
    skipEmptyLines: true,
  });

  const rows = result.data;
  if (!rows || rows.length === 0) {
    return {
      totalFilasLeidas: 0,
      nuevosAInyectar: [],
      omitidosPorDuplicidad: [],
      neteoNotasCredito: [],
      erroresFormato: [{ fila: 1, mensaje: "El archivo CSV está vacío." }],
    };
  }

  const firstRowText = rows[0].join(" ").toLowerCase();
  const hasHeader =
    firstRowText.includes("rut") ||
    firstRowText.includes("folio") ||
    firstRowText.includes("tipo");

  const colMap = hasHeader
    ? resolveColumnMapping(rows[0])
    : {
        tipoDocIdx: SII_COL_INDEX.TIPO_DOC,
        rutClienteIdx: SII_COL_INDEX.RUT_CLIENTE,
        razonSocialIdx: SII_COL_INDEX.RAZON_SOCIAL,
        folioIdx: SII_COL_INDEX.FOLIO,
        fechaDoctoIdx: SII_COL_INDEX.FECHA_DOCTO,
        montoTotalIdx: SII_COL_INDEX.MONTO_TOTAL,
        tipoDoctoRefIdx: SII_COL_INDEX.TIPO_DOCTO_REF,
        folioDoctoRefIdx: SII_COL_INDEX.FOLIO_DOCTO_REF,
      };

  const dataRows = hasHeader ? rows.slice(1) : rows;

  const existingKeysMap = new Map<
    string,
    {
      rut_cliente: string;
      folio: number;
      monto_total: number;
      monto_neto_saldo: number;
      tipo_doc: number;
    }
  >();

  for (const fac of existingFacturas) {
    if (EXCLUDED_DTE_TYPES.has(Number(fac.tipo_doc))) continue;
    const key = `${normalizeRut(fac.rut_cliente)}__${Number(fac.folio)}`;
    existingKeysMap.set(key, fac);
  }

  const seenInCsvKeys = new Set<string>();
  const nuevosAInyectar: SiiCsvParsedRow[] = [];
  const omitidosPorDuplicidad: SiiCsvValidationSummary["omitidosPorDuplicidad"] =
    [];
  const erroresFormato: SiiCsvValidationSummary["erroresFormato"] = [];
  const neteoNotasCredito: SiiCsvCreditNoteNettingDetail[] = [];

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const rowNumber = hasHeader ? i + 2 : i + 1;

    if (!row || row.length < 4 || row.every((cell) => !cell || !cell.trim())) {
      continue;
    }

    const rawTipoDoc = row[colMap.tipoDocIdx]?.trim();
    const tipo_doc = parseInt(rawTipoDoc || "", 10);

    // REGLA DE NEGOCIO: Omitir y descartar automáticamente cualquier registro cuyo Tipo Doc sea 46 (Factura de Compra)
    if (EXCLUDED_DTE_TYPES.has(tipo_doc)) {
      continue;
    }

    const rawRut = row[colMap.rutClienteIdx]?.trim();
    const rawRazonSocial =
      row[colMap.razonSocialIdx]?.trim() || "SIN RAZÓN SOCIAL";
    const rawFolio = row[colMap.folioIdx]?.trim();
    const rawFecha = row[colMap.fechaDoctoIdx]?.trim();
    const rawMontoTotal = row[colMap.montoTotalIdx]?.trim();
    const rawTipoRef = row[colMap.tipoDoctoRefIdx]?.trim();
    const rawFolioRef = row[colMap.folioDoctoRefIdx]?.trim();

    const rut_cliente = normalizeRut(rawRut || "");
    const folio = parseInt((rawFolio || "").replace(/\./g, ""), 10);
    const fecha_docto = parseSiiDate(rawFecha || "");
    const monto_total = Math.abs(parseSiiNumber(rawMontoTotal));

    const tipo_docto_ref = rawTipoRef ? parseInt(rawTipoRef, 10) || null : null;
    const folio_docto_ref = rawFolioRef
      ? parseInt(rawFolioRef.replace(/\./g, ""), 10) || null
      : null;

    if (!rut_cliente || !rut_cliente.includes("-")) {
      erroresFormato.push({
        fila: rowNumber,
        mensaje: `RUT Cliente inválido o vacío ("${rawRut ?? ""}")`,
      });
      continue;
    }

    if (isNaN(folio) || folio <= 0) {
      erroresFormato.push({
        fila: rowNumber,
        mensaje: `Folio inválido ("${rawFolio ?? ""}") para RUT ${rut_cliente}`,
      });
      continue;
    }

    if (isNaN(tipo_doc) || tipo_doc <= 0) {
      erroresFormato.push({
        fila: rowNumber,
        mensaje: `Tipo de Documento SII inválido ("${rawTipoDoc ?? ""}") en Folio ${folio}`,
      });
      continue;
    }

    if (!fecha_docto) {
      erroresFormato.push({
        fila: rowNumber,
        mensaje: `Fecha de documento inválida ("${rawFecha ?? ""}") en Folio ${folio}`,
      });
      continue;
    }

    const compositeKey = `${rut_cliente}__${folio}`;

    // Validación 1: ¿Existe en la base de datos?
    if (existingKeysMap.has(compositeKey)) {
      omitidosPorDuplicidad.push({
        rut_cliente,
        folio,
        razon_social: rawRazonSocial,
        tipo_doc,
        monto_total,
        motivo: "EXISTE_EN_BD",
      });
      continue;
    }

    // Validación 2: ¿Está repetido dentro del mismo CSV?
    if (seenInCsvKeys.has(compositeKey)) {
      omitidosPorDuplicidad.push({
        rut_cliente,
        folio,
        razon_social: rawRazonSocial,
        tipo_doc,
        monto_total,
        motivo: "DUPLICADO_EN_CSV",
      });
      continue;
    }

    seenInCsvKeys.add(compositeKey);

    nuevosAInyectar.push({
      rut_cliente,
      folio,
      razon_social: rawRazonSocial,
      tipo_doc,
      fecha_docto,
      monto_total,
      tipo_docto_ref,
      folio_docto_ref,
      monto_neto_saldo: tipo_doc === 61 ? 0 : monto_total,
      fila_origen: rowNumber,
    });
  }

  // =========================================================================
  // REGLA DE NEGOCIO: NETEO DE NOTAS DE CRÉDITO (TIPO_DOC == 61)
  // =========================================================================
  const batchFacturasMap = new Map<string, SiiCsvParsedRow>();
  for (const item of nuevosAInyectar) {
    if (item.tipo_doc !== 61) {
      batchFacturasMap.set(`${item.rut_cliente}__${item.folio}`, item);
    }
  }

  for (const ncRow of nuevosAInyectar) {
    if (ncRow.tipo_doc === 61 && ncRow.folio_docto_ref) {
      const targetKey = `${ncRow.rut_cliente}__${ncRow.folio_docto_ref}`;

      const targetInBatch = batchFacturasMap.get(targetKey);
      if (targetInBatch) {
        const saldoAnterior = targetInBatch.monto_neto_saldo;
        const nuevoSaldo = Math.max(0, saldoAnterior - ncRow.monto_total);
        targetInBatch.monto_neto_saldo = nuevoSaldo;

        neteoNotasCredito.push({
          nc_folio: ncRow.folio,
          rut_cliente: ncRow.rut_cliente,
          razon_social: ncRow.razon_social,
          monto_nc: ncRow.monto_total,
          factura_origen_folio: ncRow.folio_docto_ref,
          origen_ubicacion: "EN_ARCHIVO_CSV",
          saldo_anterior: saldoAnterior,
          nuevo_saldo_neto: nuevoSaldo,
        });
        continue;
      }

      const targetInDb = existingKeysMap.get(targetKey);
      if (targetInDb && targetInDb.tipo_doc !== 61) {
        const saldoAnterior = targetInDb.monto_neto_saldo;
        const nuevoSaldo = Math.max(0, saldoAnterior - ncRow.monto_total);

        neteoNotasCredito.push({
          nc_folio: ncRow.folio,
          rut_cliente: ncRow.rut_cliente,
          razon_social: ncRow.razon_social,
          monto_nc: ncRow.monto_total,
          factura_origen_folio: ncRow.folio_docto_ref,
          origen_ubicacion: "EN_BASE_DE_DATOS",
          saldo_anterior: saldoAnterior,
          nuevo_saldo_neto: nuevoSaldo,
        });
        continue;
      }

      neteoNotasCredito.push({
        nc_folio: ncRow.folio,
        rut_cliente: ncRow.rut_cliente,
        razon_social: ncRow.razon_social,
        monto_nc: ncRow.monto_total,
        factura_origen_folio: ncRow.folio_docto_ref,
        origen_ubicacion: "SIN_FACTURA_ORIGEN",
        saldo_anterior: null,
        nuevo_saldo_neto: null,
      });
    }
  }

  return {
    totalFilasLeidas: dataRows.length,
    nuevosAInyectar,
    omitidosPorDuplicidad,
    neteoNotasCredito,
    erroresFormato,
  };
}

/**
 * Genera un archivo CSV con la estructura exacta de 26 columnas (A..Z) del Libro de Ventas SII Chile
 */
export function generateSampleSiiCsvContent(): string {
  const headers = [
    "Nro",
    "Tipo Doc",
    "Tipo Venta",
    "RUT Cliente",
    "Razon Social",
    "Folio",
    "Fecha Docto",
    "Fecha Recepcion",
    "Fecha Acuse",
    "Monto Exento",
    "Monto Neto",
    "Monto IVA Recuperable",
    "Monto IVA No Recuperable",
    "Monto Total",
    "Monto Neto Activo Fijo",
    "IVA Activo Fijo",
    "IVA Uso Comun",
    "Impto. Sin Derecho a Credito",
    "IVA No Retenido",
    "Tabacos Puros",
    "Tabacos Cigarrillos",
    "Tabacos Elaborados",
    "NCE o NDE sobre Fact. de Compra",
    "Codigo Otro Impuesto",
    "Tipo Docto. Referencia",
    "Folio Docto. Referencia",
  ];

  const makeRow = (params: {
    nro: number;
    tipoDoc: number;
    rut: string;
    razonSocial: string;
    folio: number;
    fecha: string;
    montoTotal: number;
    tipoRef?: number | "";
    folioRef?: number | "";
  }) => {
    const montoNeto = Math.round(params.montoTotal / 1.19);
    const montoIva = params.montoTotal - montoNeto;
    const cols = new Array(26).fill("0");
    cols[0] = String(params.nro);
    cols[1] = String(params.tipoDoc);
    cols[2] = "Del Giro";
    cols[3] = params.rut;
    cols[4] = params.razonSocial;
    cols[5] = String(params.folio);
    cols[6] = params.fecha;
    cols[7] = params.fecha;
    cols[8] = params.fecha;
    cols[9] = "0";
    cols[10] = String(montoNeto);
    cols[11] = String(montoIva);
    cols[12] = "0";
    cols[13] = String(params.montoTotal);
    cols[24] = params.tipoRef ? String(params.tipoRef) : "";
    cols[25] = params.folioRef ? String(params.folioRef) : "";
    return cols.join(";");
  };

  const sampleRows = [
    makeRow({
      nro: 1,
      tipoDoc: 33,
      rut: "76129480-K",
      razonSocial: "CONSTRUCTORA ALTIPLANO INFRAESTRUCTURA SPA",
      folio: 10452,
      fecha: "03/10/2026",
      montoTotal: 126827164,
    }),
    makeRow({
      nro: 2,
      tipoDoc: 33,
      rut: "76511290-3",
      razonSocial: "ENERGIA RENOVABLE ATACAMA SOLAR S.A.",
      folio: 10457,
      fecha: "16/10/2026",
      montoTotal: 158400000,
    }),
    makeRow({
      nro: 3,
      tipoDoc: 61,
      rut: "76511290-3",
      razonSocial: "ENERGIA RENOVABLE ATACAMA SOLAR S.A.",
      folio: 819,
      fecha: "17/10/2026",
      montoTotal: 28400000,
      tipoRef: 33,
      folioRef: 10457,
    }),
    makeRow({
      nro: 4,
      tipoDoc: 61,
      rut: "96501880-2",
      razonSocial: "MINERA CORDILLERA DEL COBRE S.A.",
      folio: 820,
      fecha: "17/10/2026",
      montoTotal: 14590000,
      tipoRef: 33,
      folioRef: 10453,
    }),
    // Registro DTE 46 (Factura de Compra) que será descartado automáticamente por la regla de negocio
    makeRow({
      nro: 5,
      tipoDoc: 46,
      rut: "76888999-1",
      razonSocial: "PROVEEDOR FACTURA DE COMPRA EXCLUIDA SPA",
      folio: 9901,
      fecha: "17/10/2026",
      montoTotal: 12500000,
    }),
    makeRow({
      nro: 6,
      tipoDoc: 33,
      rut: "78920140-8",
      razonSocial: "CELULOSA Y FORESTAL DEL BIOBIO S.A.",
      folio: 10458,
      fecha: "17/10/2026",
      montoTotal: 95200000,
    }),
  ];

  return [headers.join(";"), ...sampleRows].join("\n");
}
