"use server";

import { revalidatePath } from "next/cache";
import * as XLSX from "xlsx";
import {
  createServerSupabaseClient,
  isServerSupabaseConfigured,
} from "@/lib/supabase/server";
import { assertIsAdmin, getServerUserSession } from "@/lib/auth/session";
import { getModuleAccess } from "@/lib/permissions";

export interface MatchFlexlineFaltanteRow {
  id: string;
  key: string;
  tipo_doc: number;
  folio: number;
  rut_proveedor: string;
  razon_social: string;
  fecha_docto: string;
  condicion_pago: string;
  monto_total: number;
  periodo: string; // YYYY-MM
}

export interface MatchFlexlineCorrectaRow {
  id: string;
  key: string;
  tipo_doc: number;
  folio: number;
  rut_proveedor: string;
  razon_social: string;
  fecha_docto: string;
  monto_sii: number;
  monto_flexline: number;
  periodo_flexline: string;
  periodo: string; // YYYY-MM
}

export type MotivoMalIngresada =
  | "Diferencia de Monto"
  | "No existe en SII"
  | "Duplicado en Flexline";

export interface MatchFlexlineMalIngresadaRow {
  id: string;
  key2: string;
  motivo: MotivoMalIngresada;
  folio: string;
  rut_proveedor: string;
  proveedor: string;
  fecha_emision: string;
  monto_sii: number | null;
  monto_flexline: number;
  diferencia: number;
  periodo_flexline: string;
  periodo: string; // YYYY-MM
}

export interface MatchFlexlineKPIs {
  totalDocumentosSii: number;
  totalMontoSii: number;
  faltanPorIngresarCount: number;
  faltanPorIngresarMonto: number;
  ingresadasCorrectamenteCount: number;
  ingresadasCorrectamenteMonto: number;
  malIngresadasCount: number;
  malIngresadasDiferenciaMonto: number;
}

export interface MatchFlexlineResponse {
  faltantes: MatchFlexlineFaltanteRow[];
  correctas: MatchFlexlineCorrectaRow[];
  malIngresadas: MatchFlexlineMalIngresadaRow[];
  kpis: MatchFlexlineKPIs;
  totalFlexlineRows: number;
  ultimaCarga: string | null;
  periodosDisponibles: string[];
}

interface FacturaCompraMatchSource {
  id: string;
  tipo_doc: number;
  folio: number;
  rut_proveedor: string;
  razon_social: string;
  fecha_docto: string;
  condicion_pago: string | null;
  monto_total: number;
}

interface FlexlineImportRow {
  id?: string;
  key2_original: string;
  key2_normalizada: string;
  documento_flexline: string;
  rut_proveedor: string;
  nombre_proveedor: string;
  folio_flexline: string;
  fecha_emision: string | null;
  fecha_vencimiento: string | null;
  monto_total: number;
  periodo_libro: string;
  observacion: string;
  fecha_carga: string;
}

/**
 * Normaliza (rut_proveedor + folio) de facturas_compras:
 * Ej: "77.954.732-9" + "0000000059" => "77954732-959"
 */
function buildKey(rut: string, folio: string | number): string {
  const rutLimpio = String(rut || "")
    .replace(/\./g, "")
    .trim()
    .toUpperCase();
  const folioStr = String(folio || "").trim().replace(/^0+/, "") || "0";
  return `${rutLimpio}${folioStr}`;
}

/**
 * Normaliza la Columna S (KEY2) de Flexline:
 * Si viene como "77954732-90403", quita ceros sobrantes después del dígito verificador.
 */
function normalizeKey2(rawKey2: string): string {
  const clean = String(rawKey2 || "")
    .replace(/\./g, "")
    .trim()
    .toUpperCase();
  const match = clean.match(/^(\d+-[0-9K])0*(\d+)$/);
  return match ? `${match[1]}${match[2]}` : clean;
}

function parseExcelDate(val: unknown): string | null {
  if (val === null || val === undefined || val === "") return null;

  if (typeof val === "number" && Number.isFinite(val) && val > 10000) {
    const parsed = XLSX.SSF.parse_date_code(val);
    if (parsed && parsed.y && parsed.m && parsed.d) {
      const y = String(parsed.y).padStart(4, "0");
      const m = String(parsed.m).padStart(2, "0");
      const d = String(parsed.d).padStart(2, "0");
      return `${y}-${m}-${d}`;
    }
  }

  if (val instanceof Date && !Number.isNaN(val.getTime())) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, "0");
    const d = String(val.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  const str = String(val).trim();
  if (!str) return null;

  // ISO YYYY-MM-DD
  const isoMatch = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2].padStart(2, "0")}-${isoMatch[3].padStart(2, "0")}`;
  }

  // CL DD/MM/YYYY o DD-MM-YYYY
  const clMatch = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/);
  if (clMatch) {
    const year = clMatch[3].length === 2 ? `20${clMatch[3]}` : clMatch[3];
    return `${year}-${clMatch[2].padStart(2, "0")}-${clMatch[1].padStart(2, "0")}`;
  }

  return null;
}

function parseExcelAmount(val: unknown): number {
  if (typeof val === "number" && Number.isFinite(val)) {
    return Math.round(val);
  }
  const str = String(val ?? "").trim();
  if (!str) return 0;

  // Quitar símbolo moneda y espacios
  let cleaned = str.replace(/[$\s]/g, "");
  // Si tiene formato chileno con puntos de miles y coma decimal (ej. 1.234.567,89)
  if (cleaned.includes(",") && cleaned.includes(".")) {
    cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (cleaned.includes(",") && !cleaned.includes(".")) {
    cleaned = cleaned.replace(",", ".");
  } else {
    // Solo puntos: si hay más de un punto o 3 dígitos después del punto, son miles
    const parts = cleaned.split(".");
    if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3)) {
      cleaned = cleaned.replace(/\./g, "");
    }
  }

  const num = Number(cleaned);
  return Number.isFinite(num) ? Math.round(num) : 0;
}

function extractPeriodo(fechaIso?: string | null, periodoLibro?: string | null): string {
  if (fechaIso && /^\d{4}-\d{2}/.test(fechaIso)) {
    return fechaIso.slice(0, 7);
  }
  const pl = String(periodoLibro || "").trim();
  const ymMatch = pl.match(/^(\d{4})[-/]?(\d{2})$/);
  if (ymMatch) return `${ymMatch[1]}-${ymMatch[2]}`;
  return "";
}

async function fetchAllTableRows<T>(
  tableName: string,
  columns: string
): Promise<T[]> {
  const supabase = await createServerSupabaseClient();
  const pageSize = 1000;
  let from = 0;
  const allRows: T[] = [];

  while (true) {
    const { data, error } = await supabase
      .from(tableName)
      .select(columns)
      .range(from, from + pageSize - 1);

    if (error) {
      throw new Error(`Error leyendo ${tableName}: ${error.message}`);
    }

    const batch = (data || []) as T[];
    allRows.push(...batch);

    if (batch.length < pageSize) break;
    from += pageSize;
  }

  return allRows;
}

/**
 * Importa la planilla Excel de Flexline (solo perfil ADMINISTRADOR),
 * normaliza KEY2 (Columna S) y reemplaza los datos en `compras_flexline_import`
 * en lotes de 500 filas.
 */
export async function importarMatchFlexlineAction(formData: FormData): Promise<{
  success: boolean;
  importedCount?: number;
  error?: string;
}> {
  try {
    await assertIsAdmin();

    if (!isServerSupabaseConfigured()) {
      return {
        success: false,
        error: "Supabase no está configurado en el servidor.",
      };
    }

    const file = formData.get("file");
    if (!file || !(file instanceof File)) {
      return {
        success: false,
        error: "Debe seleccionar un archivo Excel (.xlsx o .xls).",
      };
    }

    const fileName = file.name.toLowerCase();
    if (!fileName.endsWith(".xlsx") && !fileName.endsWith(".xls")) {
      return {
        success: false,
        error: "Formato inválido. Solo se aceptan archivos .xlsx o .xls.",
      };
    }

    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(Buffer.from(arrayBuffer), { type: "buffer" });

    const targetSheetName = workbook.SheetNames.includes("Hoja1")
      ? "Hoja1"
      : workbook.SheetNames[0];

    if (!targetSheetName) {
      return {
        success: false,
        error: "El archivo Excel no contiene hojas legibles.",
      };
    }

    const sheet = workbook.Sheets[targetSheetName];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      raw: true,
      defval: "",
    });

    if (rows.length === 0) {
      return {
        success: false,
        error: "La hoja seleccionada está vacía.",
      };
    }

    const ahoraIso = new Date().toISOString();
    const rowsToInsert: FlexlineImportRow[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!Array.isArray(row) || row.length === 0) continue;

      const rawDocumento = String(row[0] ?? "").trim();
      const rawRut = String(row[1] ?? "").trim();
      const rawProveedor = String(row[2] ?? "").trim();
      const rawNumDoc = String(row[3] ?? "").trim();
      const rawFechaEmision = row[4];
      const rawTotalG = row[6];
      const rawFechaVence = row[9];
      const rawObservacion = String(row[10] ?? "").trim();
      const rawPeriodoLibro = String(row[11] ?? "").trim();
      const rawTotalP = row[15];
      const rawDocCorto = String(row[17] ?? "").trim();
      const rawKey2 = String(row[18] ?? "").trim();

      // Saltar fila de encabezado
      if (
        i === 0 &&
        (rawKey2.toUpperCase() === "KEY2" ||
          rawRut.toUpperCase() === "RUT" ||
          rawDocumento.toUpperCase() === "DOCUMENTO")
      ) {
        continue;
      }

      const folioFlex = rawDocCorto || rawNumDoc;
      const key2Norm = rawKey2
        ? normalizeKey2(rawKey2)
        : rawRut && folioFlex
        ? buildKey(rawRut, folioFlex)
        : "";

      // Saltar filas vacías o subtotales sin llave ni RUT
      if (!key2Norm || (!rawRut && !rawKey2)) {
        continue;
      }

      const montoG = parseExcelAmount(rawTotalG);
      const montoP = parseExcelAmount(rawTotalP);
      const montoFinal = montoG !== 0 ? montoG : montoP;

      rowsToInsert.push({
        key2_original: rawKey2 || key2Norm,
        key2_normalizada: key2Norm,
        documento_flexline: rawDocumento,
        rut_proveedor: rawRut.replace(/\./g, "").trim().toUpperCase(),
        nombre_proveedor: rawProveedor,
        folio_flexline: folioFlex,
        fecha_emision: parseExcelDate(rawFechaEmision),
        fecha_vencimiento: parseExcelDate(rawFechaVence),
        monto_total: montoFinal,
        periodo_libro: rawPeriodoLibro,
        observacion: rawObservacion,
        fecha_carga: ahoraIso,
      });
    }

    if (rowsToInsert.length === 0) {
      return {
        success: false,
        error:
          "No se encontraron filas válidas con Columna S (KEY2) o RUT + N° Doc en el archivo.",
      };
    }

    const supabase = await createServerSupabaseClient();

    // Reemplazar la carga anterior completa
    const { error: deleteError } = await supabase
      .from("compras_flexline_import")
      .delete()
      .not("id", "is", null);

    if (deleteError) {
      return {
        success: false,
        error: `Error al limpiar la carga anterior: ${deleteError.message}`,
      };
    }

    // Insertar en lotes de 500 filas
    const BATCH_SIZE = 500;
    for (let start = 0; start < rowsToInsert.length; start += BATCH_SIZE) {
      const batch = rowsToInsert.slice(start, start + BATCH_SIZE);
      const { error: insertError } = await supabase
        .from("compras_flexline_import")
        .insert(batch);

      if (insertError) {
        return {
          success: false,
          error: `Error insertando lote (${start + 1}-${start + batch.length}): ${insertError.message}`,
        };
      }
    }

    revalidatePath("/compras-tensacon/match-flexline");
    return {
      success: true,
      importedCount: rowsToInsert.length,
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Error inesperado al importar Excel.";
    return { success: false, error: message };
  }
}

/**
 * Obtiene el universo completo de `facturas_compras` (SII) y `compras_flexline_import`,
 * ejecuta el motor de cruce por KEY2 normalizada y retorna las 3 pestañas y KPIs.
 */
export async function getMatchFlexlineDataAction(): Promise<MatchFlexlineResponse> {
  const session = await getServerUserSession();
  const access = getModuleAccess(session, ["match_flexline", "compras_global"]);

  const emptyResponse: MatchFlexlineResponse = {
    faltantes: [],
    correctas: [],
    malIngresadas: [],
    kpis: {
      totalDocumentosSii: 0,
      totalMontoSii: 0,
      faltanPorIngresarCount: 0,
      faltanPorIngresarMonto: 0,
      ingresadasCorrectamenteCount: 0,
      ingresadasCorrectamenteMonto: 0,
      malIngresadasCount: 0,
      malIngresadasDiferenciaMonto: 0,
    },
    totalFlexlineRows: 0,
    ultimaCarga: null,
    periodosDisponibles: [],
  };

  if (!access.canView || !isServerSupabaseConfigured()) {
    return emptyResponse;
  }

  const [siiDocs, flexDocs] = await Promise.all([
    fetchAllTableRows<FacturaCompraMatchSource>(
      "facturas_compras",
      "id, tipo_doc, folio, rut_proveedor, razon_social, fecha_docto, condicion_pago, monto_total"
    ),
    fetchAllTableRows<FlexlineImportRow>(
      "compras_flexline_import",
      "id, key2_original, key2_normalizada, documento_flexline, rut_proveedor, nombre_proveedor, folio_flexline, fecha_emision, fecha_vencimiento, monto_total, periodo_libro, observacion, fecha_carga"
    ),
  ]);

  const siiMap = new Map<string, FacturaCompraMatchSource[]>();
  for (const doc of siiDocs) {
    const key = buildKey(doc.rut_proveedor, doc.folio);
    const list = siiMap.get(key) || [];
    list.push(doc);
    siiMap.set(key, list);
  }

  const flexMap = new Map<string, FlexlineImportRow[]>();
  let ultimaCarga: string | null = null;
  for (const row of flexDocs) {
    if (row.fecha_carga && (!ultimaCarga || row.fecha_carga > ultimaCarga)) {
      ultimaCarga = row.fecha_carga;
    }
    const key = normalizeKey2(row.key2_normalizada || row.key2_original);
    if (!key) continue;
    const list = flexMap.get(key) || [];
    list.push(row);
    flexMap.set(key, list);
  }

  const faltantes: MatchFlexlineFaltanteRow[] = [];
  const correctas: MatchFlexlineCorrectaRow[] = [];
  const malIngresadas: MatchFlexlineMalIngresadaRow[] = [];
  const periodosSet = new Set<string>();

  let totalMontoSii = 0;

  // 1. Recorrer universo SII (facturas_compras)
  for (const doc of siiDocs) {
    const key = buildKey(doc.rut_proveedor, doc.folio);
    const montoSii = Math.round(Number(doc.monto_total || 0));
    totalMontoSii += montoSii;

    const periodo = extractPeriodo(doc.fecha_docto);
    if (periodo) periodosSet.add(periodo);

    const matchedFlex = flexMap.get(key);
    if (!matchedFlex || matchedFlex.length === 0) {
      faltantes.push({
        id: doc.id,
        key,
        tipo_doc: Number(doc.tipo_doc || 33),
        folio: Number(doc.folio || 0),
        rut_proveedor: doc.rut_proveedor,
        razon_social: doc.razon_social,
        fecha_docto: doc.fecha_docto,
        condicion_pago: doc.condicion_pago || "CREDITO",
        monto_total: montoSii,
        periodo,
      });
      continue;
    }

    // Evaluar el primer registro de Flexline contra el documento SII
    const primaryFlex = matchedFlex[0];
    const montoFlex = Math.round(Number(primaryFlex.monto_total || 0));
    const diff = montoSii - montoFlex;

    if (Math.abs(diff) <= 1) {
      correctas.push({
        id: doc.id,
        key,
        tipo_doc: Number(doc.tipo_doc || 33),
        folio: Number(doc.folio || 0),
        rut_proveedor: doc.rut_proveedor,
        razon_social: doc.razon_social,
        fecha_docto: doc.fecha_docto,
        monto_sii: montoSii,
        monto_flexline: montoFlex,
        periodo_flexline: primaryFlex.periodo_libro || "-",
        periodo,
      });
    } else {
      malIngresadas.push({
        id: `${doc.id}-diff-${primaryFlex.id || "0"}`,
        key2: primaryFlex.key2_original || key,
        motivo: "Diferencia de Monto",
        folio: String(doc.folio),
        rut_proveedor: doc.rut_proveedor,
        proveedor: doc.razon_social || primaryFlex.nombre_proveedor,
        fecha_emision: doc.fecha_docto || primaryFlex.fecha_emision || "",
        monto_sii: montoSii,
        monto_flexline: montoFlex,
        diferencia: diff,
        periodo_flexline: primaryFlex.periodo_libro || "-",
        periodo,
      });
    }
  }

  // 2. Recorrer registros de Flexline para detectar "No existe en SII" y "Duplicado en Flexline"
  for (const [key, flexRows] of flexMap.entries()) {
    const existsInSii = siiMap.has(key);
    const siiRef = existsInSii ? siiMap.get(key)![0] : null;

    if (!existsInSii) {
      flexRows.forEach((row, idx) => {
        const periodo = extractPeriodo(row.fecha_emision, row.periodo_libro);
        if (periodo) periodosSet.add(periodo);
        const montoFlex = Math.round(Number(row.monto_total || 0));

        malIngresadas.push({
          id: `flex-nosii-${row.id || key}-${idx}`,
          key2: row.key2_original || key,
          motivo: idx > 0 ? "Duplicado en Flexline" : "No existe en SII",
          folio: row.folio_flexline || "-",
          rut_proveedor: row.rut_proveedor || "-",
          proveedor: row.nombre_proveedor || "Sin Nombre",
          fecha_emision: row.fecha_emision || "",
          monto_sii: null,
          monto_flexline: montoFlex,
          diferencia: -montoFlex,
          periodo_flexline: row.periodo_libro || "-",
          periodo,
        });
      });
    } else if (flexRows.length > 1) {
      // El índice 0 ya fue comparado con SII; los adicionales son duplicados en Flexline
      for (let idx = 1; idx < flexRows.length; idx++) {
        const row = flexRows[idx];
        const periodo = extractPeriodo(row.fecha_emision, row.periodo_libro);
        if (periodo) periodosSet.add(periodo);
        const montoFlex = Math.round(Number(row.monto_total || 0));
        const montoSii = siiRef ? Math.round(Number(siiRef.monto_total || 0)) : null;

        malIngresadas.push({
          id: `flex-dup-${row.id || key}-${idx}`,
          key2: row.key2_original || key,
          motivo: "Duplicado en Flexline",
          folio: row.folio_flexline || String(siiRef?.folio || "-"),
          rut_proveedor: row.rut_proveedor || siiRef?.rut_proveedor || "-",
          proveedor: row.nombre_proveedor || siiRef?.razon_social || "Sin Nombre",
          fecha_emision: row.fecha_emision || siiRef?.fecha_docto || "",
          monto_sii: montoSii,
          monto_flexline: montoFlex,
          diferencia: montoSii !== null ? montoSii - montoFlex : -montoFlex,
          periodo_flexline: row.periodo_libro || "-",
          periodo,
        });
      }
    }
  }

  // Ordenar por fecha descendente
  faltantes.sort((a, b) => (b.fecha_docto || "").localeCompare(a.fecha_docto || ""));
  correctas.sort((a, b) => (b.fecha_docto || "").localeCompare(a.fecha_docto || ""));
  malIngresadas.sort((a, b) =>
    (b.fecha_emision || "").localeCompare(a.fecha_emision || "")
  );

  const faltanPorIngresarMonto = faltantes.reduce(
    (sum, r) => sum + r.monto_total,
    0
  );
  const ingresadasCorrectamenteMonto = correctas.reduce(
    (sum, r) => sum + r.monto_sii,
    0
  );
  const malIngresadasDiferenciaMonto = malIngresadas.reduce(
    (sum, r) => sum + Math.abs(r.diferencia),
    0
  );

  return {
    faltantes,
    correctas,
    malIngresadas,
    kpis: {
      totalDocumentosSii: siiDocs.length,
      totalMontoSii,
      faltanPorIngresarCount: faltantes.length,
      faltanPorIngresarMonto,
      ingresadasCorrectamenteCount: correctas.length,
      ingresadasCorrectamenteMonto,
      malIngresadasCount: malIngresadas.length,
      malIngresadasDiferenciaMonto,
    },
    totalFlexlineRows: flexDocs.length,
    ultimaCarga,
    periodosDisponibles: Array.from(periodosSet).sort((a, b) =>
      b.localeCompare(a)
    ),
  };
}
