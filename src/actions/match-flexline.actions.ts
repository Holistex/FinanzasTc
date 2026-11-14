"use server";

import { revalidatePath } from "next/cache";
import * as XLSX from "xlsx";
import {
  createServerSupabaseClient,
  isServerSupabaseConfigured,
} from "@/lib/supabase/server";
import { assertIsAdmin, getServerUserSession } from "@/lib/auth/session";
import { getModuleAccess } from "@/lib/permissions";
import {
  buildCanonicalCompraKey,
  normalizeFolio,
  normalizeKey2ToCanonical,
  normalizePeriodoLibro,
  normalizeRut,
  parseExcelAmount,
  parseExcelDate,
} from "@/lib/match-flexline-utils";

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
  | "Error de Folio / No existe en SII"
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

export interface MatchFlexlinePeriodDataset {
  faltantes: MatchFlexlineFaltanteRow[];
  correctas: MatchFlexlineCorrectaRow[];
  malIngresadas: MatchFlexlineMalIngresadaRow[];
  kpis: MatchFlexlineKPIs;
}

export interface MatchFlexlineResponse {
  faltantes: MatchFlexlineFaltanteRow[];
  correctas: MatchFlexlineCorrectaRow[];
  malIngresadas: MatchFlexlineMalIngresadaRow[];
  kpis: MatchFlexlineKPIs;
  porPeriodo: Record<string, MatchFlexlinePeriodDataset>;
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
  periodo_libro?: string | null;
  condicion_pago: string | null;
  monto_total: number;
}

export interface FlexlineImportRow {
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
  es_duplicado_excel?: boolean;
  fecha_carga: string;
}

/**
 * Lectura paginada sin límite de 1.000 filas de Supabase PostgREST.
 * Ordena por `id` ascendente para garantizar paginación determinista.
 */
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
      .order("id", { ascending: true })
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
 * Obtiene todas las llaves `key2_normalizada` ya existentes en `compras_flexline_import`
 * (paginado sin límite de 1.000 filas) para deduplicación incremental.
 */
export async function getExistingFlexlineKeysAction(): Promise<{
  success: boolean;
  keys?: string[];
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

    const rows = await fetchAllTableRows<{ key2_normalizada: string }>(
      "compras_flexline_import",
      "key2_normalizada"
    );

    const keys = rows
      .map((r) => String(r.key2_normalizada || "").trim().toUpperCase())
      .filter(Boolean);

    return { success: true, keys };
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Error consultando llaves existentes en Flexline.";
    return { success: false, error: message };
  }
}

/**
 * Vacía por completo la tabla `compras_flexline_import` (solo perfil ADMINISTRADOR).
 */
export async function vaciarMatchFlexlineAction(): Promise<{
  success: boolean;
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

    const supabase = await createServerSupabaseClient();
    const { error } = await supabase
      .from("compras_flexline_import")
      .delete()
      .not("id", "is", null);

    if (error) {
      return {
        success: false,
        error: `Error al vaciar la base Flexline: ${error.message}`,
      };
    }

    revalidatePath("/compras-tensacon/match-flexline");
    return { success: true };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Error inesperado al vaciar Flexline.";
    return { success: false, error: message };
  }
}

/**
 * Inserta de forma incremental un bloque de filas nuevas en `compras_flexline_import`
 * (en lotes de 500 con upsert ignoreDuplicates), sin borrar los registros previos.
 */
export async function importarMatchFlexlineChunkAction(
  rows: FlexlineImportRow[],
  options: { isFinalChunk: boolean }
): Promise<{
  success: boolean;
  insertedInChunk?: number;
  totalSavedInDb?: number;
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

    const supabase = await createServerSupabaseClient();

    const BATCH_SIZE = 500;
    const normalizedRows = rows.map((r) => ({
      ...r,
      periodo_libro:
        normalizePeriodoLibro(r.periodo_libro, r.fecha_emision) ||
        r.periodo_libro ||
        "",
    }));

    for (let start = 0; start < normalizedRows.length; start += BATCH_SIZE) {
      const batch = normalizedRows.slice(start, start + BATCH_SIZE);
      const { error: upsertError } = await supabase
        .from("compras_flexline_import")
        .upsert(batch, {
          onConflict: "key2_normalizada",
          ignoreDuplicates: true,
        });

      if (upsertError) {
        return {
          success: false,
          error: `Error insertando lote (${start + 1}-${start + batch.length}): ${upsertError.message}`,
        };
      }
    }

    let totalSavedInDb: number | undefined;
    if (options.isFinalChunk) {
      const { count, error: countError } = await supabase
        .from("compras_flexline_import")
        .select("id", { count: "exact", head: true });

      if (countError) {
        return {
          success: false,
          error: `Los datos se insertaron, pero falló la verificación final: ${countError.message}`,
        };
      }
      totalSavedInDb = count ?? 0;
      revalidatePath("/compras-tensacon/match-flexline");
    }

    return {
      success: true,
      insertedInChunk: rows.length,
      totalSavedInDb,
    };
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Error inesperado al guardar lote en Supabase.";
    return { success: false, error: message };
  }
}

/**
 * Importa la planilla Excel de Flexline de forma incremental anti-duplicados (solo ADMINISTRADOR).
 */
export async function importarMatchFlexlineAction(formData: FormData): Promise<{
  success: boolean;
  importedCount?: number;
  omitidosPorExistirEnBase?: number;
  omitidosDuplicadosEnArchivo?: number;
  totalSavedInDb?: number;
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

    const existingRes = await getExistingFlexlineKeysAction();
    if (!existingRes.success) {
      return { success: false, error: existingRes.error };
    }
    const llavesEnBase = new Set<string>(existingRes.keys || []);
    const llavesEnMismoArchivo = new Set<string>();

    const ahoraIso = new Date().toISOString();
    const nuevosRegistrosParaInsertar: FlexlineImportRow[] = [];
    let omitidosPorExistirEnBase = 0;
    let omitidosDuplicadosEnArchivo = 0;

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

      if (
        i === 0 &&
        (rawKey2.toUpperCase() === "KEY2" ||
          rawRut.toUpperCase() === "RUT" ||
          rawDocumento.toUpperCase() === "DOCUMENTO")
      ) {
        continue;
      }

      const folioLimpio = normalizeFolio(rawDocCorto || rawNumDoc);
      const rutLimpio = normalizeRut(rawRut);
      const canonicalKey =
        buildCanonicalCompraKey(rutLimpio, folioLimpio) ||
        normalizeKey2ToCanonical(rawKey2);

      if (!canonicalKey || (!rutLimpio && !rawKey2)) {
        continue;
      }

      if (llavesEnBase.has(canonicalKey)) {
        omitidosPorExistirEnBase++;
        continue;
      }
      if (llavesEnMismoArchivo.has(canonicalKey)) {
        omitidosDuplicadosEnArchivo++;
        continue;
      }
      llavesEnMismoArchivo.add(canonicalKey);

      const montoG = parseExcelAmount(rawTotalG);
      const montoP = parseExcelAmount(rawTotalP);
      const montoFinal = montoG !== 0 ? montoG : montoP;
      const fechaEmisionIso = parseExcelDate(rawFechaEmision);

      nuevosRegistrosParaInsertar.push({
        key2_original: rawKey2 || canonicalKey,
        key2_normalizada: canonicalKey,
        documento_flexline: rawDocumento,
        rut_proveedor: rutLimpio,
        nombre_proveedor: rawProveedor,
        folio_flexline: folioLimpio,
        fecha_emision: fechaEmisionIso,
        fecha_vencimiento: parseExcelDate(rawFechaVence),
        monto_total: montoFinal,
        periodo_libro:
          normalizePeriodoLibro(rawPeriodoLibro, fechaEmisionIso) ||
          rawPeriodoLibro,
        observacion: rawObservacion,
        es_duplicado_excel: false,
        fecha_carga: ahoraIso,
      });
    }

    if (nuevosRegistrosParaInsertar.length === 0 && omitidosPorExistirEnBase === 0) {
      return {
        success: false,
        error:
          "No se encontraron filas válidas con Columna S (KEY2) o RUT + N° Doc en el archivo.",
      };
    }

    let totalSavedInDb = llavesEnBase.size;
    if (nuevosRegistrosParaInsertar.length > 0) {
      const res = await importarMatchFlexlineChunkAction(
        nuevosRegistrosParaInsertar,
        { isFinalChunk: true }
      );
      if (!res.success) {
        return { success: false, error: res.error };
      }
      totalSavedInDb = res.totalSavedInDb ?? llavesEnBase.size + nuevosRegistrosParaInsertar.length;
    }

    return {
      success: true,
      importedCount: nuevosRegistrosParaInsertar.length,
      omitidosPorExistirEnBase,
      omitidosDuplicadosEnArchivo,
      totalSavedInDb,
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Error inesperado al importar Excel.";
    return { success: false, error: message };
  }
}

/**
 * Motor puro de conciliación SII vs Flexline por llave canónica `RUT|FOLIO`.
 */
function reconcileMatchFlexline(
  siiDocs: FacturaCompraMatchSource[],
  flexDocs: FlexlineImportRow[]
): MatchFlexlinePeriodDataset {
  const siiMap = new Map<string, FacturaCompraMatchSource[]>();
  for (const doc of siiDocs) {
    const key = buildCanonicalCompraKey(doc.rut_proveedor, doc.folio);
    if (!key) continue;
    const list = siiMap.get(key) || [];
    list.push(doc);
    siiMap.set(key, list);
  }

  const flexMap = new Map<string, FlexlineImportRow[]>();
  for (const row of flexDocs) {
    const key =
      buildCanonicalCompraKey(row.rut_proveedor, row.folio_flexline) ||
      normalizeKey2ToCanonical(row.key2_normalizada || row.key2_original);
    if (!key) continue;
    const list = flexMap.get(key) || [];
    list.push(row);
    flexMap.set(key, list);
  }

  const faltantes: MatchFlexlineFaltanteRow[] = [];
  const correctas: MatchFlexlineCorrectaRow[] = [];
  const malIngresadas: MatchFlexlineMalIngresadaRow[] = [];

  const UMBRAL_DIFERENCIA_MONTO = 1000; // Solo observar diferencias >= $1.000 CLP
  let totalMontoSii = 0;

  // 1. Recorrer universo SII (facturas_compras)
  for (const doc of siiDocs) {
    const key = buildCanonicalCompraKey(doc.rut_proveedor, doc.folio);
    const montoSii = Math.round(Number(doc.monto_total || 0));
    totalMontoSii += montoSii;

    const periodo = normalizePeriodoLibro(doc.periodo_libro, doc.fecha_docto);
    const matchedFlex = key ? flexMap.get(key) : undefined;

    if (!matchedFlex || matchedFlex.length === 0) {
      faltantes.push({
        id: doc.id,
        key: key || `${normalizeRut(doc.rut_proveedor)}|${doc.folio}`,
        tipo_doc: Number(doc.tipo_doc || 33),
        folio: Number(doc.folio || 0),
        rut_proveedor: doc.rut_proveedor,
        razon_social: doc.razon_social,
        fecha_docto: doc.fecha_docto,
        condicion_pago: doc.condicion_pago || "CREDITO",
        monto_total: montoSii,
        periodo,
      });
    } else if (matchedFlex.length > 1) {
      matchedFlex.forEach((dupRow, idx) => {
        const montoFlex = Math.round(Number(dupRow.monto_total || 0));
        malIngresadas.push({
          id: `${doc.id}-dup-${dupRow.id || idx}`,
          key2: dupRow.key2_original || key,
          motivo: "Duplicado en Flexline",
          folio: String(doc.folio),
          rut_proveedor: doc.rut_proveedor,
          proveedor: doc.razon_social || dupRow.nombre_proveedor,
          fecha_emision: doc.fecha_docto || dupRow.fecha_emision || "",
          monto_sii: montoSii,
          monto_flexline: montoFlex,
          diferencia: montoSii - montoFlex,
          periodo_flexline: dupRow.periodo_libro || "-",
          periodo,
        });
      });
    } else {
      const primaryFlex = matchedFlex[0];
      const montoFlex = Math.round(Number(primaryFlex.monto_total || 0));
      const diff = montoSii - montoFlex;

      if (Math.abs(diff) >= UMBRAL_DIFERENCIA_MONTO) {
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
      } else {
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
      }
    }
  }

  // 2. Registros en Flexline cuya llave (RUT + Folio) NO existe en SII
  for (const [key, flexRows] of flexMap.entries()) {
    if (siiMap.has(key)) continue;

    flexRows.forEach((row, idx) => {
      const periodo = normalizePeriodoLibro(row.periodo_libro, row.fecha_emision);
      const montoFlex = Math.round(Number(row.monto_total || 0));

      malIngresadas.push({
        id: `flex-nosii-${row.id || key}-${idx}`,
        key2: row.key2_original || key,
        motivo: idx > 0 ? "Duplicado en Flexline" : "Error de Folio / No existe en SII",
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
  }

  faltantes.sort((a, b) => (b.fecha_docto || "").localeCompare(a.fecha_docto || ""));
  correctas.sort((a, b) => (b.fecha_docto || "").localeCompare(a.fecha_docto || ""));
  malIngresadas.sort((a, b) =>
    (b.fecha_emision || "").localeCompare(a.fecha_emision || "")
  );

  return {
    faltantes,
    correctas,
    malIngresadas,
    kpis: {
      totalDocumentosSii: siiDocs.length,
      totalMontoSii,
      faltanPorIngresarCount: faltantes.length,
      faltanPorIngresarMonto: faltantes.reduce((sum, r) => sum + r.monto_total, 0),
      ingresadasCorrectamenteCount: correctas.length,
      ingresadasCorrectamenteMonto: correctas.reduce((sum, r) => sum + r.monto_sii, 0),
      malIngresadasCount: malIngresadas.length,
      malIngresadasDiferenciaMonto: malIngresadas.reduce(
        (sum, r) => sum + Math.abs(r.diferencia),
        0
      ),
    },
  };
}

/**
 * Obtiene el universo completo (sin límite de 1.000 filas) de `facturas_compras` (SII)
 * y `compras_flexline_import`, ejecuta el motor de cruce por llave canónica `RUT|FOLIO`
 * y retorna las 3 pestañas y KPIs (globales y por cada período de libro SII).
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
    porPeriodo: {},
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
      "id, tipo_doc, folio, rut_proveedor, razon_social, fecha_docto, periodo_libro, condicion_pago, monto_total"
    ),
    fetchAllTableRows<FlexlineImportRow>(
      "compras_flexline_import",
      "id, key2_original, key2_normalizada, documento_flexline, rut_proveedor, nombre_proveedor, folio_flexline, fecha_emision, fecha_vencimiento, monto_total, periodo_libro, observacion, fecha_carga"
    ),
  ]);

  let ultimaCarga: string | null = null;
  for (const row of flexDocs) {
    if (row.fecha_carga && (!ultimaCarga || row.fecha_carga > ultimaCarga)) {
      ultimaCarga = row.fecha_carga;
    }
  }

  // Períodos disponibles estrictamente desde `facturas_compras.periodo_libro` (no nulo)
  const periodosSet = new Set<string>();
  for (const doc of siiDocs) {
    const p = normalizePeriodoLibro(doc.periodo_libro);
    if (p) periodosSet.add(p);
  }
  const periodosDisponibles = Array.from(periodosSet).sort((a, b) =>
    b.localeCompare(a)
  );

  // Conciliación global ("TODOS")
  const globalResult = reconcileMatchFlexline(siiDocs, flexDocs);

  // Conciliación específica por cada período de libro SII
  const porPeriodo: Record<string, MatchFlexlinePeriodDataset> = {};
  for (const p of periodosDisponibles) {
    const siiFiltradas = siiDocs.filter(
      (d) => normalizePeriodoLibro(d.periodo_libro) === p
    );
    const flexFiltradas = flexDocs.filter(
      (r) => normalizePeriodoLibro(r.periodo_libro, r.fecha_emision) === p
    );
    porPeriodo[p] = reconcileMatchFlexline(siiFiltradas, flexFiltradas);
  }

  return {
    faltantes: globalResult.faltantes,
    correctas: globalResult.correctas,
    malIngresadas: globalResult.malIngresadas,
    kpis: globalResult.kpis,
    porPeriodo,
    totalFlexlineRows: flexDocs.length,
    ultimaCarga,
    periodosDisponibles,
  };
}
