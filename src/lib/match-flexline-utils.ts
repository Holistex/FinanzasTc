import * as XLSX from "xlsx";

/**
 * Normaliza un RUT chileno: quita puntos, espacios y pasa a mayúsculas.
 * Ej: "79.938.160-5" => "79938160-5"
 */
export function normalizeRut(rut: unknown): string {
  return String(rut || "")
    .replace(/\./g, "")
    .replace(/\s+/g, "")
    .trim()
    .toUpperCase();
}

/**
 * Normaliza un folio de documento: quita prefijo '#' y ceros a la izquierda.
 * Ej: "0000034553" => "34553"
 */
export function normalizeFolio(folio: unknown): string {
  const raw = String(folio || "").replace(/^#/, "").trim();
  const sinCeros = raw.replace(/^0+/, "");
  return sinCeros === "" ? "0" : sinCeros.toUpperCase();
}

/**
 * Construye la llave canónica única `RUT_LIMPIO|FOLIO_LIMPIO`.
 * Ej: ("79.938.160-5", "0000034553") => "79938160-5|34553"
 */
export function buildCanonicalCompraKey(rut: unknown, folio: unknown): string {
  const r = normalizeRut(rut);
  const f = normalizeFolio(folio);
  if (!r || !f || f === "0") return "";
  return `${r}|${f}`;
}

/**
 * Convierte una KEY2 de Flexline (con o sin delimitador '|') a la llave canónica `RUT|FOLIO`.
 */
export function normalizeKey2ToCanonical(rawKey2: unknown): string {
  const clean = String(rawKey2 || "")
    .replace(/\./g, "")
    .replace(/\s+/g, "")
    .trim()
    .toUpperCase();
  if (!clean) return "";

  if (clean.includes("|")) {
    const [r, f] = clean.split("|");
    return buildCanonicalCompraKey(r, f);
  }

  const match = clean.match(/^(\d+-[0-9K])0*(\d+)$/);
  if (match) {
    return buildCanonicalCompraKey(match[1], match[2]);
  }

  return clean;
}

export function parseExcelDate(val: unknown): string | null {
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

  const isoMatch = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2].padStart(2, "0")}-${isoMatch[3].padStart(2, "0")}`;
  }

  const clMatch = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/);
  if (clMatch) {
    const year = clMatch[3].length === 2 ? `20${clMatch[3]}` : clMatch[3];
    return `${year}-${clMatch[2].padStart(2, "0")}-${clMatch[1].padStart(2, "0")}`;
  }

  return null;
}

export function parseExcelAmount(val: unknown): number {
  if (typeof val === "number" && Number.isFinite(val)) {
    return Math.round(val);
  }
  const str = String(val ?? "").trim();
  if (!str) return 0;

  let cleaned = str.replace(/[$\s]/g, "");
  if (cleaned.includes(",") && cleaned.includes(".")) {
    cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (cleaned.includes(",") && !cleaned.includes(".")) {
    cleaned = cleaned.replace(",", ".");
  } else {
    const parts = cleaned.split(".");
    if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3)) {
      cleaned = cleaned.replace(/\./g, "");
    }
  }

  const num = Number(cleaned);
  return Number.isFinite(num) ? Math.round(num) : 0;
}
