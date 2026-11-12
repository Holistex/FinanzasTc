import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formatea un monto numérico a Pesos Chilenos (CLP) con separador de miles '.'
 * Ejemplo: 126827164 -> "$ 126.827.164"
 */
export function formatCLP(amount: number | string | null | undefined): string {
  const numericValue =
    typeof amount === "string" ? parseFloat(amount) : (amount ?? 0);
  if (isNaN(numericValue)) return "$ 0";

  const rounded = Math.round(numericValue);
  const isNegative = rounded < 0;
  const formattedDigits = Math.abs(rounded)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");

  return isNegative ? `-$ ${formattedDigits}` : `$ ${formattedDigits}`;
}

/**
 * Formatea un string o número para campos de input con máscara en vivo en Pesos Chilenos (CLP)
 * Ejemplo: "2400000" -> "$ 2.400.000"
 */
export function formatCLPInput(val: string | number | null | undefined): string {
  if (val === undefined || val === null || val === "") return "";
  const clean = String(val).replace(/\D/g, "");
  if (!clean) return "";
  const formatted = clean.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `$ ${formatted}`;
}

/**
 * Parsea un string con máscara CLP a número entero puro
 * Ejemplo: "$ 2.400.000" -> 2400000
 */
export function parseCLPInput(val: string | number | null | undefined): number {
  if (val === undefined || val === null || val === "") return 0;
  const clean = String(val).replace(/\D/g, "");
  return clean ? Number(clean) : 0;
}

/**
 * Normaliza un RUT chileno al formato estándar sin puntos y con guion para llave única en BD
 * Ejemplo: "76.123.456-k" -> "76123456-K"
 */
export function normalizeRut(rut: string): string {
  if (!rut) return "";
  const clean = rut.replace(/[^0-9kK]/g, "").toUpperCase();
  if (clean.length < 2) return clean;
  const body = clean.slice(0, -1);
  const dv = clean.slice(-1);
  return `${body}-${dv}`;
}

/**
 * Formatea un RUT chileno para visualización de alta legibilidad en tablas financieras
 * Ejemplo: "76123456-K" -> "76.123.456-K"
 */
export function formatRutDisplay(rut: string): string {
  const normalized = normalizeRut(rut);
  if (!normalized.includes("-")) return rut;
  const [body, dv] = normalized.split("-");
  const formattedBody = body.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${formattedBody}-${dv}`;
}

/**
 * Extrae la porción YYYY-MM-DD de cualquier valor de fecha (string, ISO, Date)
 * ignorando componentes de hora, zona horaria o UTC para comparaciones seguras.
 * Ejemplo: "2026-11-01T00:00:00.000Z" -> "2026-11-01"
 */
export function toDateOnlyString(dateInput: string | Date | null | undefined): string {
  if (!dateInput) return "";
  if (typeof dateInput === "string") {
    const trimmed = dateInput.trim();
    if (trimmed.length >= 10 && trimmed[4] === "-" && trimmed[7] === "-") {
      return trimmed.slice(0, 10);
    }
    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    }
    return trimmed;
  }
  if (dateInput instanceof Date && !isNaN(dateInput.getTime())) {
    const y = dateInput.getFullYear();
    const m = String(dateInput.getMonth() + 1).padStart(2, "0");
    const day = String(dateInput.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  return "";
}

/**
 * Formatea fecha ISO (YYYY-MM-DD) a formato chileno DD-MM-YYYY
 */
export function formatDateCL(dateStr: string | null | undefined): string {
  if (!dateStr) return "-";
  const clean = toDateOnlyString(dateStr);
  const parts = clean.split("-");
  if (parts.length !== 3) return clean || dateStr;
  return `${parts[2]}-${parts[1]}-${parts[0]}`;
}

/**
 * Calcula la Fecha de Vencimiento estándar (fecha_emision + 30 días) y los días restantes
 * respecto a la fecha actual del sistema.
 * Semáforo:
 * - 'emerald' (Verde): > 15 días restantes
 * - 'amber' (Amarillo/Naranja): entre 8 y 15 días restantes (<= 15 y >= 8)
 * - 'rose' (Rojo): <= 7 días restantes o vencida
 */
export function calculateDueDateInfo(
  fechaDoctoIso: string | null | undefined,
  customVencimientoIso?: string | null | undefined
): {
  fechaEmisionCL: string;
  fechaVencimientoIso: string;
  fechaVencimientoCL: string;
  diasRestantes: number;
  badgeLabel: string;
  badgeColor: "emerald" | "amber" | "rose";
} {
  if (!fechaDoctoIso) {
    return {
      fechaEmisionCL: "-",
      fechaVencimientoIso: "-",
      fechaVencimientoCL: "-",
      diasRestantes: 0,
      badgeLabel: "0d",
      badgeColor: "rose",
    };
  }

  const clean = fechaDoctoIso.split("T")[0];
  const [y, m, d] = clean.split("-").map(Number);
  const emisionDate = new Date(y, (m || 1) - 1, d || 1);

  let vencimientoDate: Date;
  if (customVencimientoIso) {
    const cleanVenc = customVencimientoIso.split("T")[0];
    const [vy0, vm0, vd0] = cleanVenc.split("-").map(Number);
    vencimientoDate = new Date(vy0, (vm0 || 1) - 1, vd0 || 1);
  } else {
    // Vencimiento = Fecha Emisión + 30 días
    vencimientoDate = new Date(emisionDate);
    vencimientoDate.setDate(vencimientoDate.getDate() + 30);
  }

  const vy = vencimientoDate.getFullYear();
  const vm = String(vencimientoDate.getMonth() + 1).padStart(2, "0");
  const vd = String(vencimientoDate.getDate()).padStart(2, "0");
  const fechaVencimientoIso = `${vy}-${vm}-${vd}`;
  const fechaVencimientoCL = `${vd}-${vm}-${vy}`;

  // Días restantes comparando contra medianoche del día actual
  const now = new Date();
  const todayMidnight = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  );
  const diffMs = vencimientoDate.getTime() - todayMidnight.getTime();
  const diasRestantes = Math.round(diffMs / (1000 * 60 * 60 * 24));

  let badgeColor: "emerald" | "amber" | "rose" = "emerald";
  if (diasRestantes > 15) {
    badgeColor = "emerald";
  } else if (diasRestantes >= 8) {
    badgeColor = "amber";
  } else {
    badgeColor = "rose";
  }

  const badgeLabel =
    diasRestantes > 0
      ? `${diasRestantes}d`
      : diasRestantes === 0
      ? "Hoy"
      : `${diasRestantes}d`;

  return {
    fechaEmisionCL: formatDateCL(clean),
    fechaVencimientoIso,
    fechaVencimientoCL,
    diasRestantes,
    badgeLabel,
    badgeColor,
  };
}

/**
 * Etiqueta legible según código SII de Tipo de Documento
 */
export function getTipoDocLabel(tipoDoc: number): {
  code: number;
  shortName: string;
  fullName: string;
  variant: "emerald" | "amber" | "slate";
} {
  switch (tipoDoc) {
    case 33:
      return {
        code: 33,
        shortName: "FAC 33",
        fullName: "Factura Electrónica (33)",
        variant: "emerald",
      };
    case 34:
      return {
        code: 34,
        shortName: "FEX 34",
        fullName: "Factura Exenta Electrónica (34)",
        variant: "emerald",
      };
    case 61:
      return {
        code: 61,
        shortName: "NC 61",
        fullName: "Nota de Crédito Electrónica (61)",
        variant: "amber",
      };
    case 56:
      return {
        code: 56,
        shortName: "ND 56",
        fullName: "Nota de Débito Electrónica (56)",
        variant: "slate",
      };
    default:
      return {
        code: tipoDoc,
        shortName: `DOC ${tipoDoc}`,
        fullName: `Documento Tributario (${tipoDoc})`,
        variant: "slate",
      };
  }
}

/**
 * Retorna la fecha de hoy en formato YYYY-MM-DD para inicializar inputs de fecha.
 */
export function getTodayDateCL(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
